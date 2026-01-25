import { Injectable, OnModuleInit, Logger, Inject, forwardRef } from '@nestjs/common';
import { KafkaService } from '../kafka.service';
import { KAFKA_TOPICS, CONSUMER_GROUPS } from '../kafka.config';
import { GoogleService } from '../../connectors/google.service';
import { SyncEventProducer } from '../producers/sync-event.producer';
import { AnalyticsProducer } from '../producers/analytics.producer';
import { SyncJobEvent, DlqMessage } from '../interfaces';

@Injectable()
export class SyncWorkerConsumer implements OnModuleInit {
  private readonly logger = new Logger(SyncWorkerConsumer.name);

  constructor(
    private kafkaService: KafkaService,
    @Inject(forwardRef(() => GoogleService))
    private googleService: GoogleService,
    private syncEventProducer: SyncEventProducer,
    private analyticsProducer: AnalyticsProducer,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.kafkaService.isEnabled()) {
      this.logger.warn('Kafka disabled, sync worker consumer not started');
      return;
    }

    // Delay startup to allow Kafka connection
    setTimeout(() => this.startConsumer(), 5000);
  }

  private async startConsumer(): Promise<void> {
    if (!this.kafkaService.isAvailable()) {
      this.logger.warn('Kafka unavailable, sync worker consumer not started');
      return;
    }

    const consumer = await this.kafkaService.createConsumer(CONSUMER_GROUPS.SYNC);

    if (!consumer) {
      this.logger.warn('Failed to create sync worker consumer');
      return;
    }

    try {
      await consumer.subscribe({
        topics: [KAFKA_TOPICS.SYNC_JOBS],
        fromBeginning: false,
      });

      await consumer.run({
        partitionsConsumedConcurrently: 4, // Process 4 sync jobs in parallel
        eachMessage: async ({ message, partition }) => {
          if (!message.value) return;

          try {
            const event: SyncJobEvent = JSON.parse(message.value.toString());

            if (event.eventType !== 'SYNC_REQUESTED') return;

            this.logger.log(
              `Worker processing sync job ${event.payload.jobId} ` +
                `for ${event.payload.userId}:${event.payload.provider} (partition ${partition})`,
            );

            await this.processSync(event);
          } catch (error) {
            this.logger.error(
              `Failed to process sync message: ${error instanceof Error ? error.message : error}`,
            );
          }
        },
      });

      this.logger.log('Sync worker consumer started');
    } catch (error) {
      this.logger.error(
        `Failed to start sync worker consumer: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  private async processSync(event: SyncJobEvent): Promise<void> {
    const { userId, provider, jobId } = event.payload;
    const startTime = Date.now();

    try {
      // Publish SYNC_STARTED
      await this.syncEventProducer.publishSyncStarted({
        jobId,
        userId,
        provider,
      });

      // Execute sync for this specific provider
      const stats = await this.googleService.sync(userId, [provider]);
      const itemsProcessed = stats[provider] || 0;
      const duration = Date.now() - startTime;

      // Publish SYNC_COMPLETED
      await this.syncEventProducer.publishSyncCompleted({
        jobId,
        userId,
        provider,
        itemsProcessed,
        duration,
      });

      // Track analytics
      await this.analyticsProducer.trackSyncHealth({
        userId,
        provider,
        status: 'success',
        itemsProcessed,
        durationMs: duration,
      });

      this.logger.log(
        `Sync job ${jobId} completed: ${itemsProcessed} items in ${duration}ms`,
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Sync job ${jobId} failed: ${errorMessage}`);

      // Publish SYNC_FAILED
      await this.syncEventProducer.publishSyncFailed({
        jobId,
        userId,
        provider,
        error: errorMessage,
      });

      // Track analytics
      await this.analyticsProducer.trackSyncHealth({
        userId,
        provider,
        status: 'failure',
        itemsProcessed: 0,
        durationMs: Date.now() - startTime,
      });

      // Send to DLQ for retry
      await this.sendToDlq(event, errorMessage);
    }
  }

  private async sendToDlq(
    event: SyncJobEvent,
    errorMessage: string,
  ): Promise<void> {
    const producer = this.kafkaService.getProducer();
    if (!producer) return;

    const dlqMessage: DlqMessage<SyncJobEvent> = {
      originalEvent: event,
      error: errorMessage,
      failedAt: new Date().toISOString(),
      retryCount: 0,
      topic: KAFKA_TOPICS.SYNC_JOBS,
    };

    try {
      await producer.send({
        topic: KAFKA_TOPICS.SYNC_JOBS_DLQ,
        messages: [
          {
            key: `${event.payload.userId}:${event.payload.provider}`,
            value: JSON.stringify(dlqMessage),
          },
        ],
      });
      this.logger.warn(
        `Sent failed sync job to DLQ for ${event.payload.userId}:${event.payload.provider}`,
      );
    } catch (dlqError) {
      this.logger.error(
        `Failed to send to DLQ: ${dlqError instanceof Error ? dlqError.message : dlqError}`,
      );
    }
  }
}
