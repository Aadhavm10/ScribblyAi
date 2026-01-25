import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { KafkaService } from '../kafka.service';
import { KAFKA_TOPICS, CONSUMER_GROUPS } from '../kafka.config';
import { PrismaService } from '../../prisma/prisma.service';
import { AnalyticsEvent } from '../interfaces';

interface SearchMetrics {
  count: number;
  totalTime: number;
}

interface SyncHealth {
  success: number;
  failure: number;
}

@Injectable()
export class AnalyticsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnalyticsConsumer.name);

  // In-memory aggregation windows (5 min buckets)
  private activeUsersWindow = new Map<string, Set<string>>(); // windowKey -> userIds
  private searchMetrics = new Map<string, SearchMetrics>();
  private syncHealth = new Map<string, SyncHealth>();

  private flushInterval: NodeJS.Timeout | null = null;

  constructor(
    private kafkaService: KafkaService,
    private prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.kafkaService.isEnabled()) {
      this.logger.warn('Kafka disabled, analytics consumer not started');
      return;
    }

    // Delay startup to allow Kafka connection
    setTimeout(() => this.startConsumer(), 5000);
  }

  onModuleDestroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
  }

  private async startConsumer(): Promise<void> {
    if (!this.kafkaService.isAvailable()) {
      this.logger.warn('Kafka unavailable, analytics consumer not started');
      return;
    }

    const consumer = await this.kafkaService.createConsumer(
      CONSUMER_GROUPS.ANALYTICS,
    );

    if (!consumer) {
      this.logger.warn('Failed to create analytics consumer');
      return;
    }

    try {
      await consumer.subscribe({
        topics: [KAFKA_TOPICS.ANALYTICS_EVENTS],
        fromBeginning: false,
      });

      await consumer.run({
        eachMessage: async ({ message }) => {
          if (!message.value) return;

          try {
            const event: AnalyticsEvent = JSON.parse(message.value.toString());
            await this.aggregate(event);
          } catch (error) {
            this.logger.error(
              `Failed to process analytics event: ${error instanceof Error ? error.message : error}`,
            );
          }
        },
      });

      // Flush aggregates every 5 minutes
      this.flushInterval = setInterval(
        () => this.flushAggregates(),
        5 * 60 * 1000,
      );

      this.logger.log('Analytics consumer started');
    } catch (error) {
      this.logger.error(
        `Failed to start analytics consumer: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  private async aggregate(event: AnalyticsEvent): Promise<void> {
    const windowKey = this.getWindowKey();

    switch (event.eventType) {
      case 'USER_ACTIVE':
        if (!this.activeUsersWindow.has(windowKey)) {
          this.activeUsersWindow.set(windowKey, new Set());
        }
        this.activeUsersWindow.get(windowKey)!.add(event.payload.userId);
        break;

      case 'SEARCH_PERFORMED':
        if (!this.searchMetrics.has(windowKey)) {
          this.searchMetrics.set(windowKey, { count: 0, totalTime: 0 });
        }
        const search = this.searchMetrics.get(windowKey)!;
        search.count++;
        search.totalTime +=
          (event.payload.metadata.executionTimeMs as number) || 0;
        break;

      case 'SYNC_HEALTH_CHECK':
        if (!this.syncHealth.has(windowKey)) {
          this.syncHealth.set(windowKey, { success: 0, failure: 0 });
        }
        const sync = this.syncHealth.get(windowKey)!;
        if (event.payload.metadata.status === 'success') {
          sync.success++;
        } else {
          sync.failure++;
        }
        break;
    }
  }

  private getWindowKey(): string {
    const now = new Date();
    const windowStart = new Date(
      Math.floor(now.getTime() / (5 * 60 * 1000)) * (5 * 60 * 1000),
    );
    return windowStart.toISOString();
  }

  private async flushAggregates(): Promise<void> {
    const now = new Date();
    const windowEnd = new Date(now.getTime() - 5 * 60 * 1000); // Previous window

    // Flush active users
    for (const [windowKey, users] of this.activeUsersWindow) {
      const windowStart = new Date(windowKey);
      if (windowStart < windowEnd) {
        try {
          await this.prisma.analyticsMetric.create({
            data: {
              metricName: 'active_users_5min',
              value: users.size,
              windowStart,
              windowEnd: new Date(windowStart.getTime() + 5 * 60 * 1000),
            },
          });
        } catch (error) {
          this.logger.error(
            `Failed to flush active_users metric: ${error instanceof Error ? error.message : error}`,
          );
        }
        this.activeUsersWindow.delete(windowKey);
      }
    }

    // Flush search metrics
    for (const [windowKey, metrics] of this.searchMetrics) {
      const windowStart = new Date(windowKey);
      if (windowStart < windowEnd) {
        try {
          await this.prisma.analyticsMetric.createMany({
            data: [
              {
                metricName: 'search_count_5min',
                value: metrics.count,
                windowStart,
                windowEnd: new Date(windowStart.getTime() + 5 * 60 * 1000),
              },
              {
                metricName: 'search_avg_latency_5min',
                value:
                  metrics.count > 0 ? metrics.totalTime / metrics.count : 0,
                windowStart,
                windowEnd: new Date(windowStart.getTime() + 5 * 60 * 1000),
              },
            ],
          });
        } catch (error) {
          this.logger.error(
            `Failed to flush search metrics: ${error instanceof Error ? error.message : error}`,
          );
        }
        this.searchMetrics.delete(windowKey);
      }
    }

    // Flush sync health
    for (const [windowKey, health] of this.syncHealth) {
      const windowStart = new Date(windowKey);
      if (windowStart < windowEnd) {
        const total = health.success + health.failure;
        try {
          await this.prisma.analyticsMetric.create({
            data: {
              metricName: 'sync_success_rate_5min',
              value: total > 0 ? (health.success / total) * 100 : 100,
              windowStart,
              windowEnd: new Date(windowStart.getTime() + 5 * 60 * 1000),
              metadata: { success: health.success, failure: health.failure },
            },
          });
        } catch (error) {
          this.logger.error(
            `Failed to flush sync health: ${error instanceof Error ? error.message : error}`,
          );
        }
        this.syncHealth.delete(windowKey);
      }
    }

    this.logger.debug('Flushed analytics aggregates');
  }
}
