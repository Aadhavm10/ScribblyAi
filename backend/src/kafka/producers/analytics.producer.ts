import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { KafkaService } from '../kafka.service';
import { KAFKA_TOPICS } from '../kafka.config';
import { AnalyticsEvent, AnalyticsEventType } from '../interfaces';

@Injectable()
export class AnalyticsProducer {
  private readonly logger = new Logger(AnalyticsProducer.name);

  constructor(private kafkaService: KafkaService) {}

  async trackUserActivity(userId: string, sessionId?: string): Promise<void> {
    await this.publish({
      eventType: 'USER_ACTIVE',
      userId,
      sessionId,
      metadata: { timestamp: Date.now() },
    });
  }

  async trackSearch(params: {
    userId: string;
    query: string;
    resultCount: number;
    executionTimeMs: number;
  }): Promise<void> {
    await this.publish({
      eventType: 'SEARCH_PERFORMED',
      userId: params.userId,
      metadata: {
        query: params.query,
        resultCount: params.resultCount,
        executionTimeMs: params.executionTimeMs,
      },
    });
  }

  async trackNoteViewed(params: {
    userId: string;
    noteId: string;
  }): Promise<void> {
    await this.publish({
      eventType: 'NOTE_VIEWED',
      userId: params.userId,
      metadata: { noteId: params.noteId },
    });
  }

  async trackNoteCreated(params: {
    userId: string;
    noteId: string;
  }): Promise<void> {
    await this.publish({
      eventType: 'NOTE_CREATED',
      userId: params.userId,
      metadata: { noteId: params.noteId },
    });
  }

  async trackRealtimeSession(params: {
    userId: string;
    noteId: string;
    action: 'start' | 'end';
    sessionId: string;
  }): Promise<void> {
    await this.publish({
      eventType:
        params.action === 'start'
          ? 'REALTIME_SESSION_START'
          : 'REALTIME_SESSION_END',
      userId: params.userId,
      sessionId: params.sessionId,
      metadata: { noteId: params.noteId },
    });
  }

  async trackSyncHealth(params: {
    userId: string;
    provider: string;
    status: 'success' | 'failure';
    itemsProcessed: number;
    durationMs: number;
  }): Promise<void> {
    await this.publish({
      eventType: 'SYNC_HEALTH_CHECK',
      userId: params.userId,
      metadata: {
        provider: params.provider,
        status: params.status,
        itemsProcessed: params.itemsProcessed,
        durationMs: params.durationMs,
      },
    });
  }

  private async publish(params: {
    eventType: AnalyticsEventType;
    userId: string;
    sessionId?: string;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    if (!this.kafkaService.isAvailable()) return;

    const producer = this.kafkaService.getProducer();
    if (!producer) return;

    const event: AnalyticsEvent = {
      eventId: uuidv4(),
      eventType: params.eventType,
      timestamp: new Date().toISOString(),
      version: 1,
      payload: {
        userId: params.userId,
        sessionId: params.sessionId,
        metadata: params.metadata,
      },
    };

    try {
      await producer.send({
        topic: KAFKA_TOPICS.ANALYTICS_EVENTS,
        messages: [{ key: params.eventType, value: JSON.stringify(event) }],
      });
    } catch (error) {
      this.logger.error(
        `Failed to publish analytics event: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
}
