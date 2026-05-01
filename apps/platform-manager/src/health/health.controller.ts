import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckError, HealthCheckService, HealthIndicatorResult } from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      async (): Promise<HealthIndicatorResult> => {
        try {
          await this.prisma.$queryRaw`SELECT 1`;
          return { postgres: { status: 'up' } };
        } catch (err) {
          throw new HealthCheckError('PostgreSQL check failed', err);
        }
      },
    ]);
  }
}
