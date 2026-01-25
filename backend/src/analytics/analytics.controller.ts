import { Controller, Get, Param, Query } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('dashboard')
  async getDashboardSummary() {
    return this.analyticsService.getDashboardSummary();
  }

  @Get('global')
  async getGlobalMetrics(@Query('limit') limit?: string) {
    const parsedLimit = limit ? parseInt(limit, 10) : 60;
    return this.analyticsService.getGlobalMetrics(parsedLimit);
  }

  @Get('users/:userId')
  async getUserActivityMetrics(@Param('userId') userId: string) {
    return this.analyticsService.getUserActivityMetrics(userId);
  }

  @Get('sync-health')
  async getSyncHealthMetrics(@Query('provider') provider?: string) {
    return this.analyticsService.getSyncHealthMetrics(provider);
  }
}
