import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Photo } from '../../../generated/prisma/client';

@Injectable()
export class DedupService {
  constructor(private readonly prisma: PrismaService) {}

  hash(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }

  async findDuplicate(sha256: string): Promise<Photo | null> {
    return this.prisma.photo.findUnique({ where: { sha256 } });
  }
}
