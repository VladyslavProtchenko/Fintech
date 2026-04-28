import { Controller, Get, UseGuards } from '@nestjs/common';
import { AppLogger } from '@fintech/shared-logger';
import { AppErrors } from '@fintech/shared-errors';
import { AdminGuard } from '../common/guards/admin.guard';
import { MonitoringService } from './monitoring.service';

const CTX = 'MonitoringController';

@Controller('admin')
@UseGuards(AdminGuard)
export class MonitoringController {
  constructor(
    private readonly monitoringService: MonitoringService,
    private readonly logger: AppLogger,
  ) {}

  @Get('providers')
  async providers() {
    this.logger.debug('Provider health requested', CTX);
    try {
      const data = await this.monitoringService.getProviderHealth();
      return { providers: data };
    } catch (err) {
      this.logger.error('Failed to fetch provider health', err instanceof Error ? err : undefined, CTX, {
        error: err instanceof Error ? err.message : String(err),
      });
      throw AppErrors.internal('Failed to fetch provider health');
    }
  }
}
