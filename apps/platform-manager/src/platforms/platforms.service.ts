import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlatformDto } from './dto/create-platform.dto';
import { Platform } from '../generated/prisma/client';

@Injectable()
export class PlatformsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreatePlatformDto): Promise<Platform> {
    const domain = dto.domain ?? `${dto.slug}.localhost`;

    const existing = await this.prisma.platform.findFirst({
      where: { OR: [{ slug: dto.slug }, { domain }] },
    });
    if (existing) {
      throw new ConflictException(`Platform with slug "${dto.slug}" already exists`);
    }

    const platform = await this.prisma.platform.create({
      data: { slug: dto.slug, domain, prompt: dto.prompt, status: 'CREATING' },
    });

    // TODO: kick off async deploy pipeline
    // this.deploy(platform).catch(err => this.markFailed(platform.id, err.message));

    return platform;
  }

  findAll(): Promise<Platform[]> {
    return this.prisma.platform.findMany({ orderBy: { createdAt: 'desc' } });
  }

  findOne(slug: string): Promise<Platform | null> {
    return this.prisma.platform.findUnique({ where: { slug } });
  }

  async remove(slug: string): Promise<void> {
    await this.prisma.platform.delete({ where: { slug } });
  }
}
