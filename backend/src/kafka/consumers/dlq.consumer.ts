import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { KafkaService } from '../kafka.service';
import { KAFKA_TOPICS, CONSUMER_GROUPS } from '../kafka.config';
import { PrismaService } from '../../prisma/prisma.service';
import { DlqMessage } from '../interfaces';

@Injectable()
export class DlqConsumer implements OnModuleInit {
  private readonly logger = new Logger(DlqConsumer.name);
  private readonly MAX_RETRIES = 5;
  private readonly RETRY_DELAY_MS = 60000; // 1 minute base delay

  constructor(
    private kafkaService: KafkaService,
    private prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.kafkaService.isEnabled()) {
      this.logger.warn('Kafka disabled, DLQ consumer not started');
      return;
    }

    // Delay startup to allow Kafka connection
    setTimeout(() => this.startConsumer(), 10000);
  }

  private async startConsumer(): Promise<void> {
    if (!this.kafkaService.isAvailable()) {
      this.logger.warn('Kafka unavailable, DLQ consumer not started');
      return;
    }

    const consumer = await this.kafkaService.createConsumer(CONSUMER_GROUPS.DLQ);

    if (!consumer) {
      this.logger.warn('Failed to create DLQ consumer');
      return;
    }

    try {
      await consumer.subscribe({
        topics: [
          KAFKA_TOPICS.INDEX_COMMANDS_DLQ,
          KAFKA_TOPICS.SYNC_JOBS_DLQ,
          KAFKA_TOPICS.NOTE_EVENTS_DLQ,
        ],
        fromBeginning: false,
      });

      await consumer.run({
        eachMessage: async ({ topic, message }) => {
          if (!message.value) return;

          try {
            const dlqMessage: DlqMessage = JSON.parse(message.value.toString());
            await this.processDlqMessage(topic, dlqMessage);
          } catch (error) {
            this.logger.error(
              `Failed to process DLQ message: ${error instanceof Error ? error.message : error}`,
            );
          }
        },
      });

      this.logger.log('DLQ consumer started');
    } catch (error) {
      this.logger.error(
        `Failed to start DLQ consumer: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  private async processDlqMessage(
    topic: string,
    message: DlqMessage,
  ): Promise<void> {
    const retryCount = (message.retryCount || 0) + 1;

    if (retryCount > this.MAX_RETRIES) {
      // Store in persistent failed jobs table for manual review
      await this.persistFailedJob(topic, message, retryCount);
      this.logger.warn(
        `Message exceeded max retries, persisted for manual review`,
      );
      return;
    }

    // Exponential backoff
    const delay = this.RETRY_DELAY_MS * Math.pow(2, retryCount - 1);
    await new Promise((resolve) => setTimeout(resolve, Math.min(delay, 300000))); // Max 5 min

    // Re-publish to original topic
    const originalTopic = topic.replace('.dlq', '');
    const retryEvent = {
      ...(message.originalEvent as Record<string, unknown>),
      _retryCount: retryCount,
    };

    const producer = this.kafkaService.getProducer();
    if (!producer) {
      await this.persistFailedJob(topic, message, retryCount);
      return;
    }

    try {
      // Determine key from the original event
      const key = this.extractKey(message.originalEvent);

      await producer.send({
        topic: originalTopic,
        messages: [
          {
            key,
            value: JSON.stringify(retryEvent),
          },
        ],
      });
      this.logger.log(`Retried message (attempt ${retryCount}) to ${originalTopic}`);
    } catch (error) {
      this.logger.error(
        `Retry failed: ${error instanceof Error ? error.message : error}`,
      );
      await this.persistFailedJob(topic, message, retryCount);
    }
  }

  private extractKey(event: unknown): string {
    if (typeof event === 'object' && event !== null) {
      const e = event as Record<string, unknown>;
      if (e.payload && typeof e.payload === 'object') {
        const payload = e.payload as Record<string, unknown>;
        if (payload.userId) return String(payload.userId);
        if (payload.noteId) return String(payload.noteId);
      }
    }
    return 'unknown';
  }

  private async persistFailedJob(
    topic: string,
    message: DlqMessage,
    retryCount: number,
  ): Promise<void> {
    try {
      // Extract event ID from the original event
      const eventId =
        (message.originalEvent as Record<string, unknown>)?.eventId ||
        `unknown-${Date.now()}`;

      // Use raw query to handle the FailedJob table that will be added
      await this.prisma.$executeRaw`
        INSERT INTO "FailedJob"
          ("id", "topic", "payload", "error", "failedAt", "retryCount", "createdAt")
        VALUES
          (${String(eventId)}, ${topic},
           ${JSON.stringify(message.originalEvent)}::jsonb,
           ${message.error}, ${new Date(message.failedAt)},
           ${retryCount}, NOW())
        ON CONFLICT ("id") DO UPDATE SET
          "retryCount" = ${retryCount},
          "error" = ${message.error}
      `;
      this.logger.log(`Persisted failed job ${eventId} for manual review`);
    } catch (error) {
      // If the table doesn't exist yet, just log
      if (
        error instanceof Error &&
        error.message.includes('relation "FailedJob" does not exist')
      ) {
        this.logger.warn(
          'FailedJob table does not exist. Run prisma migrate to create it.',
        );
        return;
      }
      this.logger.error(
        `Failed to persist failed job: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
}
