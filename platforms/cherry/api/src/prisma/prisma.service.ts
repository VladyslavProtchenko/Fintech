import { PrismaClient } from '../generated/prisma/client';
import { withPrismaAdapterPg } from '@fintech/shared-prisma';

export class PrismaService extends withPrismaAdapterPg(PrismaClient) {}
