import { Injectable } from '@nestjs/common';
import { withPrismaAdapterPg } from '@fintech/shared-prisma';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService extends withPrismaAdapterPg(PrismaClient) {}
