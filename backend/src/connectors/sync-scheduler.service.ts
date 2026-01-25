import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as cron from 'node-cron';
import { GoogleService } from './google.service';
import { PrismaService } from '../prisma/prisma.service';
import { SyncEventProducer } from '../kafka/producers/sync-event.producer';
import { KafkaService } from '../kafka/kafka.service';

@Injectable()
export class SyncSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SyncSchedulerService.name);
  private syncTask: cron.ScheduledTask | null = null;

  constructor(
    private configService: ConfigService,
    private googleService: GoogleService,
    private prisma: PrismaService,
    private syncEventProducer: SyncEventProducer,
    private kafkaService: KafkaService,
  ) {}

  onModuleInit() {
    const isMockMode = this.configService.get<string>('SKIP_PRISMA') === 'true';
    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';

    if (isMockMode) {
      this.logger.warn('Sync scheduler disabled in mock mode');
      return;
    }

    if (!isProduction) {
      this.logger.warn('Sync scheduler disabled in development mode. Enable manually in production.');
      return;
    }

    // Schedule sync every 6 hours: 0 */6 * * *
    // For hackathon/demo: run every hour: 0 * * * *
    this.syncTask = cron.schedule('0 * * * *', () => {
      this.logger.log('Running scheduled sync for all users...');
      this.syncAllUsers();
    });

    this.logger.log('Sync scheduler initialized: running every hour');
  }

  async syncAllUsers() {
    try {
      // Get all users with connected Google accounts
      const sourceAccounts = await this.prisma.sourceAccount.findMany({
        where: { provider: 'google' },
        select: { userId: true },
      });

      const uniqueUserIds = [...new Set(sourceAccounts.map(acc => acc.userId))];

      this.logger.log(`Distributing sync jobs for ${uniqueUserIds.length} users...`);

      // Use Kafka for distributed sync if available
      if (this.kafkaService.isAvailable()) {
        const jobsQueued = await this.syncEventProducer.publishBulkSyncJobs(
          uniqueUserIds,
          ['gmail', 'drive', 'docs'],
        );
        this.logger.log(`Queued ${jobsQueued} sync jobs for parallel processing via Kafka`);
        return;
      }

      // Fallback to sequential processing if Kafka is unavailable
      this.logger.warn('Kafka unavailable, falling back to sequential sync');
      for (const userId of uniqueUserIds) {
        try {
          const stats = await this.googleService.sync(userId, ['gmail', 'drive', 'docs']);
          this.logger.log(`Synced user ${userId}: Gmail=${stats.gmail}, Drive=${stats.drive}, Docs=${stats.docs}`);
        } catch (error) {
          this.logger.error(`Failed to sync user ${userId}: ${error instanceof Error ? error.message : error}`);
        }
      }

      this.logger.log('Scheduled sync completed (sequential fallback)');
    } catch (error) {
      this.logger.error(`Scheduled sync failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  // Manual trigger for testing - syncs a single user
  async triggerManualSync(userId?: string) {
    this.logger.log('Manual sync triggered');

    if (userId) {
      // Sync single user via Kafka if available
      if (this.kafkaService.isAvailable()) {
        const jobsQueued = await this.syncEventProducer.publishBulkSyncJobs(
          [userId],
          ['gmail', 'drive', 'docs'],
        );
        this.logger.log(`Queued ${jobsQueued} sync jobs for user ${userId}`);
        return { queued: jobsQueued };
      }

      // Fallback to direct sync
      const stats = await this.googleService.sync(userId, ['gmail', 'drive', 'docs']);
      return stats;
    }

    await this.syncAllUsers();
    return { message: 'Sync jobs distributed' };
  }
}

