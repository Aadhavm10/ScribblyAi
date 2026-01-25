import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { KafkaService } from '../kafka.service';
import { KAFKA_TOPICS } from '../kafka.config';
import { SyncJobEvent, SyncProvider } from '../interfaces';

@Injectable()
export class SyncEventProducer {
  private readonly logger = new Logger(SyncEventProducer.name);

  constructor(private kafkaService: KafkaService) {}

  async publishSyncJob(params: {
    userId: string;
    provider: SyncProvider;
  }): Promise<string | null> {
    const jobId = uuidv4();
    const event: SyncJobEvent = {
      eventId: uuidv4(),
      eventType: 'SYNC_REQUESTED',
      timestamp: new Date().toISOString(),
      version: 1,
      payload: {
        userId: params.userId,
        provider: params.provider,
        jobId,
        status: 'pending',
      },
    };

    const key = `${params.userId}:${params.provider}`;

    if (!this.kafkaService.isAvailable()) {
      this.logger.warn('Kafka unavailable, sync job not queued');
      return null;
    }

    const producer = this.kafkaService.getProducer();
    if (!producer) {
      return null;
    }

    try {
      await producer.send({
        topic: KAFKA_TOPICS.SYNC_JOBS,
        messages: [{ key, value: JSON.stringify(event) }],
      });
      this.logger.log(
        `Queued sync job ${jobId} for ${params.userId}:${params.provider}`,
      );
      return jobId;
    } catch (error) {
      this.logger.error(
        `Failed to queue sync job: ${error instanceof Error ? error.message : error}`,
      );
      return null;
    }
  }

  async publishBulkSyncJobs(
    userIds: string[],
    providers: SyncProvider[],
  ): Promise<number> {
    if (!this.kafkaService.isAvailable()) {
      this.logger.warn('Kafka unavailable, bulk sync jobs not queued');
      return 0;
    }

    const producer = this.kafkaService.getProducer();
    if (!producer) {
      return 0;
    }

    const messages: Array<{ key: string; value: string }> = [];

    for (const userId of userIds) {
      for (const provider of providers) {
        const jobId = uuidv4();
        const event: SyncJobEvent = {
          eventId: uuidv4(),
          eventType: 'SYNC_REQUESTED',
          timestamp: new Date().toISOString(),
          version: 1,
          payload: {
            userId,
            provider,
            jobId,
            status: 'pending',
          },
        };
        messages.push({
          key: `${userId}:${provider}`,
          value: JSON.stringify(event),
        });
      }
    }

    try {
      await producer.send({
        topic: KAFKA_TOPICS.SYNC_JOBS,
        messages,
      });
      this.logger.log(`Queued ${messages.length} sync jobs`);
      return messages.length;
    } catch (error) {
      this.logger.error(
        `Failed to queue bulk sync jobs: ${error instanceof Error ? error.message : error}`,
      );
      return 0;
    }
  }

  async publishSyncStarted(params: {
    jobId: string;
    userId: string;
    provider: SyncProvider;
  }): Promise<boolean> {
    return this.publishSyncStatus(params, 'SYNC_STARTED', 'in_progress');
  }

  async publishSyncCompleted(params: {
    jobId: string;
    userId: string;
    provider: SyncProvider;
    itemsProcessed: number;
    duration: number;
  }): Promise<boolean> {
    return this.publishSyncStatus(
      params,
      'SYNC_COMPLETED',
      'completed',
      params.itemsProcessed,
      params.duration,
    );
  }

  async publishSyncFailed(params: {
    jobId: string;
    userId: string;
    provider: SyncProvider;
    error: string;
  }): Promise<boolean> {
    return this.publishSyncStatus(
      params,
      'SYNC_FAILED',
      'failed',
      0,
      undefined,
      params.error,
    );
  }

  private async publishSyncStatus(
    params: { jobId: string; userId: string; provider: SyncProvider },
    eventType: SyncJobEvent['eventType'],
    status: SyncJobEvent['payload']['status'],
    itemsProcessed?: number,
    duration?: number,
    error?: string,
  ): Promise<boolean> {
    if (!this.kafkaService.isAvailable()) {
      return false;
    }

    const producer = this.kafkaService.getProducer();
    if (!producer) {
      return false;
    }

    const event: SyncJobEvent = {
      eventId: uuidv4(),
      eventType,
      timestamp: new Date().toISOString(),
      version: 1,
      payload: {
        userId: params.userId,
        provider: params.provider,
        jobId: params.jobId,
        status,
        itemsProcessed,
        duration,
        error,
      },
    };

    try {
      await producer.send({
        topic: KAFKA_TOPICS.SYNC_RESULTS,
        messages: [{ key: params.userId, value: JSON.stringify(event) }],
      });
      return true;
    } catch (err) {
      this.logger.error(
        `Failed to publish sync status: ${err instanceof Error ? err.message : err}`,
      );
      return false;
    }
  }
}
