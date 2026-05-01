import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
import { Prisma, Platform, PlatformStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DockerService } from '../docker/docker.service';
import { CreatePlatformDto } from './dto/create-platform.dto';

const exec = promisify(execCb);

@Injectable()
export class PlatformsService {
  private readonly logger = new Logger(PlatformsService.name);
  private readonly platformsDir: string;
  private readonly monorepoRoot: string;
  private readonly postgresAdminUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly docker: DockerService,
    config: ConfigService,
  ) {
    this.platformsDir = path.normalize(config.getOrThrow<string>('PLATFORMS_DIR'));
    this.monorepoRoot = path.dirname(this.platformsDir);
    this.postgresAdminUrl = config.getOrThrow<string>('POSTGRES_ADMIN_URL');
  }

  async create(dto: CreatePlatformDto): Promise<Platform> {
    const domain = dto.domain ?? `${dto.slug}.localhost`;
    const displayName = dto.displayName ?? this.toDisplayName(dto.slug);

    try {
      const platform = await this.prisma.platform.create({
        data: { slug: dto.slug, domain, displayName, status: 'CREATING' },
      });

      // Kick off async pipeline — does not block the HTTP response
      void this.deploy(platform);

      return platform;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const target = (e.meta?.target as string[] | undefined)?.join(', ') ?? 'unknown field';
        throw new ConflictException(`Platform with this ${target} already exists`);
      }
      throw e;
    }
  }

  findAll(): Promise<Platform[]> {
    return this.prisma.platform.findMany({ orderBy: { createdAt: 'desc' } });
  }

  findOne(slug: string): Promise<Platform | null> {
    return this.prisma.platform.findUnique({ where: { slug } });
  }

  async getStatus(slug: string): Promise<{
    status: PlatformStatus;
    siteUrl: string | null;
    swaggerUrl: string | null;
    errorMsg: string | null;
  }> {
    const platform = await this.prisma.platform.findUnique({
      where: { slug },
      select: { status: true, siteUrl: true, errorMsg: true },
    });
    if (!platform) throw new NotFoundException(`Platform "${slug}" not found`);
    return {
      ...platform,
      swaggerUrl: platform.siteUrl ? `${platform.siteUrl}/api/docs` : null,
    };
  }

  async stop(slug: string): Promise<void> {
    const platform = await this.prisma.platform.findUnique({ where: { slug } });
    if (!platform) throw new NotFoundException(`Platform "${slug}" not found`);
    if (platform.status !== 'RUNNING') {
      throw new ConflictException(`Platform "${slug}" is not running (status: ${platform.status})`);
    }

    const platformDir = path.join(this.platformsDir, slug);
    await this.docker.stop(platformDir);

    await this.prisma.platform.update({
      where: { slug },
      data: { status: 'STOPPED' },
    });
  }

  async start(slug: string): Promise<void> {
    const platform = await this.prisma.platform.findUnique({ where: { slug } });
    if (!platform) throw new NotFoundException(`Platform "${slug}" not found`);
    if (platform.status !== 'STOPPED') {
      throw new ConflictException(`Platform "${slug}" is not stopped (status: ${platform.status})`);
    }

    const platformDir = path.join(this.platformsDir, slug);
    await this.docker.up(platformDir);

    await this.prisma.platform.update({
      where: { slug },
      data: { status: 'RUNNING' },
    });
  }

  async retry(slug: string): Promise<void> {
    const platform = await this.prisma.platform.findUnique({ where: { slug } });
    if (!platform) throw new NotFoundException(`Platform "${slug}" not found`);
    if (platform.status !== 'FAILED') {
      throw new ConflictException(`Platform "${slug}" cannot be retried (status: ${platform.status})`);
    }

    const fresh = await this.prisma.platform.update({
      where: { slug },
      data: { status: 'CREATING', errorMsg: null },
    });

    void this.deploy(fresh);
  }

  // ─── Deploy pipeline ────────────────────────────────────────────────────────

  private async deploy(platform: Platform): Promise<void> {
    try {
      const platformDir = path.join(this.platformsDir, platform.slug);

      // 1. Verify generated files exist (skill must run before deploy)
      await this.validatePlatformFiles(platformDir);

      // 2. Set status to BUILDING
      await this.prisma.platform.update({
        where: { id: platform.id },
        data: { status: 'BUILDING' },
      });

      // 3. Update pnpm lockfile so new platform workspace member is recognized
      this.logger.log(`[${platform.slug}] running pnpm install...`);
      await this.runPnpmInstall();

      // 4. Create database if it doesn't exist yet
      this.logger.log(`[${platform.slug}] ensuring database exists...`);
      await this.createDatabase(platform.slug);

      // 5. Build docker images (may take several minutes)
      this.logger.log(`[${platform.slug}] building docker images...`);
      await this.docker.build(platformDir);

      // 6. Ensure shared Docker network exists (platform compose declares it external)
      await this.docker.ensureNetwork('caddy');

      // 7. Start containers
      this.logger.log(`[${platform.slug}] starting containers...`);
      await this.docker.up(platformDir);

      // 8. Mark as RUNNING with URLs
      await this.prisma.platform.update({
        where: { id: platform.id },
        data: {
          status: 'RUNNING',
          siteUrl: `http://${platform.domain}`,
        },
      });

      this.logger.log(`[${platform.slug}] deploy complete ✓`);
    } catch (err) {
      this.logger.error(`[${platform.slug}] deploy failed: ${String(err)}`);
      try {
        await this.prisma.platform.update({
          where: { id: platform.id },
          data: { status: 'FAILED', errorMsg: String(err) },
        });
      } catch (dbErr) {
        this.logger.error(`[${platform.slug}] failed to persist FAILED status: ${String(dbErr)}`);
      }
    }
  }

  // ─── File validation ─────────────────────────────────────────────────────────

  // Ensures the skill was run before deployment is triggered.
  private async validatePlatformFiles(platformDir: string): Promise<void> {
    const composePath = path.join(platformDir, 'docker-compose.yml');
    try {
      await fs.promises.access(composePath);
    } catch {
      throw new Error(
        `Platform files not found at "${platformDir}". ` +
          `Run the create-client-platform skill first to generate the code.`,
      );
    }
  }

  // ─── pnpm install ────────────────────────────────────────────────────────────

  private async runPnpmInstall(): Promise<void> {
    try {
      const { stdout, stderr } = await exec('pnpm install', {
        cwd: this.monorepoRoot,
        timeout: 3 * 60 * 1000,
        env: { ...process.env, CI: 'true' },
      });
      if (stdout.trim()) this.logger.debug(stdout.trim());
      if (stderr.trim()) this.logger.debug(stderr.trim());
    } catch (err) {
      const execErr = err as { stderr?: string; stdout?: string };
      const detail = execErr.stderr?.trim() || execErr.stdout?.trim() || String(err);
      throw new Error(`pnpm install failed:\n${detail}`);
    }
  }

  // ─── Database provisioning ───────────────────────────────────────────────────

  // Connects to the shared postgres admin server and creates <slug>_db if absent.
  private async createDatabase(slug: string): Promise<void> {
    const dbName = `${slug}_db`;
    const pool = new Pool({ connectionString: this.postgresAdminUrl, max: 1, connectionTimeoutMillis: 10_000 });
    try {
      await pool.query(`CREATE DATABASE "${dbName}"`);
      this.logger.log(`[${slug}] database "${dbName}" created`);
    } catch (err) {
      // 42P04 = duplicate_database — idempotent, already exists
      if ((err as { code?: string }).code === '42P04') {
        this.logger.log(`[${slug}] database "${dbName}" already exists, skipping`);
        return;
      }
      throw new Error(`Failed to create database "${dbName}": ${String(err)}`);
    } finally {
      await pool.end().catch(() => {});
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private toDisplayName(slug: string): string {
    return slug
      .split('-')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
}
