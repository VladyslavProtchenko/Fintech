import { Injectable, Logger } from '@nestjs/common';
import { exec as execCb } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execCb);

const BUILD_TIMEOUT_MS = 15 * 60 * 1000; // 15 min — docker build can be slow
const UP_TIMEOUT_MS = 2 * 60 * 1000;

@Injectable()
export class DockerService {
  private readonly logger = new Logger(DockerService.name);

  async build(platformDir: string): Promise<void> {
    this.logger.log(`docker compose build in: ${platformDir}`);
    await this.run('docker compose build', platformDir, BUILD_TIMEOUT_MS);
  }

  async up(platformDir: string): Promise<void> {
    this.logger.log(`docker compose up -d in: ${platformDir}`);
    await this.run('docker compose up -d', platformDir, UP_TIMEOUT_MS);
  }

  // Ensures a Docker network exists, creating it if absent.
  // Generated platforms declare 'caddy' as external — it must exist before docker compose up.
  async ensureNetwork(name: string): Promise<void> {
    try {
      await exec(`docker network inspect ${name}`);
    } catch {
      this.logger.log(`Docker network "${name}" not found — creating`);
      await exec(`docker network create ${name}`);
      this.logger.log(`Docker network "${name}" created`);
    }
  }

  async stop(platformDir: string): Promise<void> {
    this.logger.log(`docker compose stop in: ${platformDir}`);
    await this.run('docker compose stop', platformDir, UP_TIMEOUT_MS);
  }

  async down(platformDir: string): Promise<void> {
    this.logger.log(`docker compose down in: ${platformDir}`);
    await this.run('docker compose down', platformDir, UP_TIMEOUT_MS);
  }

  private async run(command: string, cwd: string, timeout: number): Promise<void> {
    try {
      const { stdout, stderr } = await exec(command, { cwd, timeout });
      if (stdout.trim()) this.logger.debug(stdout.trim());
      if (stderr.trim()) this.logger.debug(stderr.trim());
    } catch (err) {
      // child_process exec errors carry stdout/stderr — include them for useful errorMsg
      const execErr = err as { stderr?: string; stdout?: string };
      const detail = execErr.stderr?.trim() || execErr.stdout?.trim() || String(err);
      throw new Error(`"${command}" failed:\n${detail}`);
    }
  }
}
