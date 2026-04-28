import { Injectable } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { withPrismaLifecycle } from '@fintech/shared-prisma';
import { PrismaClient } from '../../generated/prisma/client';

@Injectable()
export class PrismaService extends withPrismaLifecycle(PrismaClient) {
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }) });
  }
}
