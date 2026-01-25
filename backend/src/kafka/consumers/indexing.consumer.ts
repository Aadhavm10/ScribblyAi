import { Injectable, OnModuleInit, Logger, Inject, forwardRef } from '@nestjs/common';
import { KafkaService } from '../kafka.service';
import { KAFKA_TOPICS, CONSUMER_GROUPS } from '../kafka.config';
import { IndexingService } from '../../search/indexing.service';
import { NoteEvent, DlqMessage } from '../interfaces';

@Injectable()
export class IndexingConsumer implements OnModuleInit {
  private readonly logger = new Logger(IndexingConsumer.name);
  private readonly MAX_RETRIES = 3;

  constructor(
    private kafkaService: KafkaService,
    @Inject(forwardRef(() => IndexingService))
    private indexingService: IndexingService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.kafkaService.isEnabled()) {
      this.logger.warn('Kafka disabled, indexing consumer not started');
      return;
    }

    // Delay startup to allow Kafka connection
    setTimeout(() => this.startConsumer(), 5000);
  }

  private async startConsumer(): Promise<void> {
    if (!this.kafkaService.isAvailable()) {
      this.logger.warn('Kafka unavailable, indexing consumer not started');
      return;
    }

    const consumer = await this.kafkaService.createConsumer(
      CONSUMER_GROUPS.INDEXING,
    );

    if (!consumer) {
      this.logger.warn('Failed to create indexing consumer');
      return;
    }

    try {
      await consumer.subscribe({
        topics: [KAFKA_TOPICS.NOTE_EVENTS],
        fromBeginning: false,
      });

      await consumer.run({
        partitionsConsumedConcurrently: 3,
        eachMessage: async ({ message }) => {
          if (!message.value) return;

          try {
            const event: NoteEvent = JSON.parse(message.value.toString());
            await this.handleNoteEvent(event);
          } catch (error) {
            this.logger.error(
              `Failed to process message: ${error instanceof Error ? error.message : error}`,
            );
          }
        },
      });

      this.logger.log('Indexing consumer started');
    } catch (error) {
      this.logger.error(
        `Failed to start indexing consumer: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  private async handleNoteEvent(event: NoteEvent): Promise<void> {
    const retryCount = (event as NoteEvent & { _retryCount?: number })._retryCount || 0;

    try {
      switch (event.eventType) {
        case 'NOTE_CREATED':
        case 'NOTE_UPDATED':
        case 'NOTE_CONTENT_CHANGED':
          await this.indexWithRetry(event.payload.noteId, retryCount);
          break;
        case 'NOTE_DELETED':
          await this.deleteWithRetry(event.payload.noteId, retryCount);
          break;
        default:
          this.logger.warn(`Unknown event type: ${event.eventType}`);
      }
    } catch (error) {
      this.logger.error(
        `Indexing failed for ${event.eventType}: ${error instanceof Error ? error.message : error}`,
      );
      await this.sendToDlq(event, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private async indexWithRetry(
    noteId: string,
    retryCount: number,
  ): Promise<void> {
    try {
      await this.indexingService.indexNote(noteId);
      this.logger.debug(`Indexed note ${noteId}`);
    } catch (error) {
      if (retryCount < this.MAX_RETRIES) {
        const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.indexWithRetry(noteId, retryCount + 1);
      }
      throw error;
    }
  }

  private async deleteWithRetry(
    noteId: string,
    retryCount: number,
  ): Promise<void> {
    try {
      await this.indexingService.deleteNoteFromIndex(noteId);
      this.logger.debug(`Deleted note ${noteId} from index`);
    } catch (error) {
      if (retryCount < this.MAX_RETRIES) {
        const delay = Math.pow(2, retryCount) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.deleteWithRetry(noteId, retryCount + 1);
      }
      throw error;
    }
  }

  private async sendToDlq(event: NoteEvent, errorMessage: string): Promise<void> {
    const producer = this.kafkaService.getProducer();
    if (!producer) return;

    const dlqMessage: DlqMessage<NoteEvent> = {
      originalEvent: event,
      error: errorMessage,
      failedAt: new Date().toISOString(),
      retryCount: (event as NoteEvent & { _retryCount?: number })._retryCount || 0,
      topic: KAFKA_TOPICS.NOTE_EVENTS,
    };

    try {
      await producer.send({
        topic: KAFKA_TOPICS.INDEX_COMMANDS_DLQ,
        messages: [
          {
            key: event.payload.noteId,
            value: JSON.stringify(dlqMessage),
          },
        ],
      });
      this.logger.warn(`Sent failed indexing event to DLQ for note ${event.payload.noteId}`);
    } catch (dlqError) {
      this.logger.error(
        `Failed to send to DLQ: ${dlqError instanceof Error ? dlqError.message : dlqError}`,
      );
    }
  }
}
