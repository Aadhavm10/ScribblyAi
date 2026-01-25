import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { KafkaService } from '../kafka/kafka.service';
import { KAFKA_TOPICS, CONSUMER_GROUPS } from '../kafka/kafka.config';

export interface UserActivityMetrics {
  windowStart: string;
  windowEnd: string;
  userId: string;
  totalEvents: number;
  uniqueNotes: number;
  notesCreated: number;
  notesUpdated: number;
  notesDeleted: number;
  computedAt: string;
}

export interface GlobalMetrics {
  windowStart: string;
  windowEnd: string;
  eventsPerMinute: number;
  activeUsers: number;
  notesTouched: number;
  computedAt: string;
}

export interface SyncHealthMetrics {
  windowStart: string;
  windowEnd: string;
  provider: string;
  totalSyncs: number;
  successfulSyncs: number;
  failedSyncs: number;
  successRate: number;
  avgDurationMs: number;
  maxDurationMs: number;
  minDurationMs: number;
  avgItemsProcessed: number;
  totalItemsProcessed: number;
  computedAt: string;
}

@Injectable()
export class AnalyticsService implements OnModuleInit {
  private readonly logger = new Logger(AnalyticsService.name);

  // In-memory cache of latest metrics (from Kafka or computed)
  private userMetricsCache: Map<string, UserActivityMetrics[]> = new Map();
  private globalMetricsCache: GlobalMetrics[] = [];
  private syncHealthCache: Map<string, SyncHealthMetrics[]> = new Map();

  constructor(private kafkaService: KafkaService) {}

  async onModuleInit() {
    if (!this.kafkaService.isEnabled()) {
      this.logger.warn('Kafka disabled, analytics service running in limited mode');
      return;
    }

    // Start consuming aggregated metrics from Spark
    setTimeout(() => this.startMetricsConsumer(), 7000);
  }

  private async startMetricsConsumer(): Promise<void> {
    if (!this.kafkaService.isAvailable()) {
      this.logger.warn('Kafka unavailable, metrics consumer not started');
      return;
    }

    const consumer = await this.kafkaService.createConsumer(
      `${CONSUMER_GROUPS.ANALYTICS}-aggregates`,
    );

    if (!consumer) {
      this.logger.warn('Failed to create analytics aggregates consumer');
      return;
    }

    try {
      await consumer.subscribe({
        topics: [KAFKA_TOPICS.ANALYTICS_AGGREGATES],
        fromBeginning: false,
      });

      await consumer.run({
        eachMessage: async ({ message }) => {
          if (!message.value) return;

          try {
            const metrics = JSON.parse(message.value.toString());
            this.processMetrics(metrics);
          } catch (error) {
            this.logger.error(
              `Failed to process metrics: ${error instanceof Error ? error.message : error}`,
            );
          }
        },
      });

      this.logger.log('Analytics aggregates consumer started');
    } catch (error) {
      this.logger.error(
        `Failed to start metrics consumer: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  private processMetrics(metrics: Record<string, unknown>): void {
    // Determine metric type by fields present
    if ('notesCreated' in metrics) {
      this.cacheUserMetrics(metrics as unknown as UserActivityMetrics);
    } else if ('eventsPerMinute' in metrics) {
      this.cacheGlobalMetrics(metrics as unknown as GlobalMetrics);
    } else if ('successRate' in metrics) {
      this.cacheSyncHealthMetrics(metrics as unknown as SyncHealthMetrics);
    }
  }

  private cacheUserMetrics(metrics: UserActivityMetrics): void {
    const userId = metrics.userId;
    if (!this.userMetricsCache.has(userId)) {
      this.userMetricsCache.set(userId, []);
    }

    const userCache = this.userMetricsCache.get(userId)!;
    userCache.push(metrics);

    // Keep only last 100 windows per user
    if (userCache.length > 100) {
      userCache.shift();
    }
  }

  private cacheGlobalMetrics(metrics: GlobalMetrics): void {
    this.globalMetricsCache.push(metrics);

    // Keep only last 1000 windows
    if (this.globalMetricsCache.length > 1000) {
      this.globalMetricsCache.shift();
    }
  }

  private cacheSyncHealthMetrics(metrics: SyncHealthMetrics): void {
    const provider = metrics.provider;
    if (!this.syncHealthCache.has(provider)) {
      this.syncHealthCache.set(provider, []);
    }

    const providerCache = this.syncHealthCache.get(provider)!;
    providerCache.push(metrics);

    if (providerCache.length > 100) {
      providerCache.shift();
    }
  }

  // Public API methods

  async getUserActivityMetrics(userId: string): Promise<UserActivityMetrics[]> {
    return this.userMetricsCache.get(userId) || [];
  }

  async getGlobalMetrics(limit = 60): Promise<GlobalMetrics[]> {
    return this.globalMetricsCache.slice(-limit);
  }

  async getSyncHealthMetrics(provider?: string): Promise<SyncHealthMetrics[]> {
    if (provider) {
      return this.syncHealthCache.get(provider) || [];
    }

    // Return all providers
    const allMetrics: SyncHealthMetrics[] = [];
    for (const metrics of this.syncHealthCache.values()) {
      allMetrics.push(...metrics);
    }
    return allMetrics.sort(
      (a, b) => new Date(b.windowStart).getTime() - new Date(a.windowStart).getTime(),
    );
  }

  async getDashboardSummary(): Promise<{
    realtimeStats: GlobalMetrics | null;
    syncHealth: Record<string, { successRate: number; avgDuration: number }>;
    topActiveUsers: { userId: string; eventCount: number }[];
  }> {
    // Latest global metrics
    const realtimeStats = this.globalMetricsCache.length > 0
      ? this.globalMetricsCache[this.globalMetricsCache.length - 1]
      : null;

    // Sync health by provider (latest window)
    const syncHealth: Record<string, { successRate: number; avgDuration: number }> = {};
    for (const [provider, metrics] of this.syncHealthCache) {
      if (metrics.length > 0) {
        const latest = metrics[metrics.length - 1];
        syncHealth[provider] = {
          successRate: latest.successRate,
          avgDuration: latest.avgDurationMs,
        };
      }
    }

    // Top active users (from latest window)
    const userActivity: { userId: string; eventCount: number }[] = [];
    for (const [userId, metrics] of this.userMetricsCache) {
      if (metrics.length > 0) {
        const latest = metrics[metrics.length - 1];
        userActivity.push({
          userId,
          eventCount: latest.totalEvents,
        });
      }
    }
    const topActiveUsers = userActivity
      .sort((a, b) => b.eventCount - a.eventCount)
      .slice(0, 10);

    return {
      realtimeStats,
      syncHealth,
      topActiveUsers,
    };
  }
}
