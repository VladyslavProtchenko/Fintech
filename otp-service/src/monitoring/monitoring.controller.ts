import { Controller, Get } from '@nestjs/common';
import { MonitoringService } from './monitoring.service';

@Controller('admin')
export class MonitoringController {
  constructor(private readonly monitoringService: MonitoringService) {}

  // GET /admin/providers — real-time provider health: circuit state + dynamic score
  @Get('providers')
  async providers() {
    const data = await this.monitoringService.getProviderHealth();
    return { providers: data };
  }
}
