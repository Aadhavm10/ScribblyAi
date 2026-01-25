import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { KafkaService } from '../kafka.service';
import { KAFKA_TOPICS } from '../kafka.config';
import { NoteEvent, AuditLogEntry, AuditAction } from '../interfaces';

export interface PublishNoteCreatedParams {
  noteId: string;
  userId: string;
  title: string;
  content: string;
  tags?: string[];
  sessionCode?: string;
  source?: 'web' | 'api' | 'sync' | 'realtime';
}

export interface PublishNoteUpdatedParams {
  noteId: string;
  userId: string;
  title?: string;
  content?: string;
  previousContent?: string;
  tags?: string[];
  cursorPosition?: number;
  source?: 'web' | 'api' | 'sync' | 'realtime';
}

export interface PublishNoteDeletedParams {
  noteId: string;
  userId: string;
}

@Injectable()
export class NoteEventProducer {
  private readonly logger = new Logger(NoteEventProducer.name);

  constructor(private kafkaService: KafkaService) {}

  async publishNoteCreated(params: PublishNoteCreatedParams): Promise<boolean> {
    const event: NoteEvent = {
      eventId: uuidv4(),
      eventType: 'NOTE_CREATED',
      timestamp: new Date().toISOString(),
      version: 1,
      payload: {
        noteId: params.noteId,
        userId: params.userId,
        title: params.title,
        content: params.content,
        tags: params.tags,
        sessionCode: params.sessionCode,
        metadata: { source: params.source || 'api' },
      },
    };

    const published = await this.publish(
      KAFKA_TOPICS.NOTE_EVENTS,
      params.userId,
      event,
    );
    if (published) {
      await this.publishAuditLog(
        event,
        params.userId,
        'note',
        params.noteId,
        'create',
      );
    }
    return published;
  }

  async publishNoteUpdated(params: PublishNoteUpdatedParams): Promise<boolean> {
    const event: NoteEvent = {
      eventId: uuidv4(),
      eventType: 'NOTE_UPDATED',
      timestamp: new Date().toISOString(),
      version: 1,
      payload: {
        noteId: params.noteId,
        userId: params.userId,
        title: params.title,
        content: params.content,
        previousContent: params.previousContent,
        tags: params.tags,
        metadata: {
          cursorPosition: params.cursorPosition,
          source: params.source || 'api',
        },
      },
    };

    const published = await this.publish(
      KAFKA_TOPICS.NOTE_EVENTS,
      params.userId,
      event,
    );
    if (published) {
      await this.publishAuditLog(
        event,
        params.userId,
        'note',
        params.noteId,
        'update',
        params.previousContent
          ? { before: { content: params.previousContent }, after: { content: params.content } }
          : undefined,
      );
    }
    return published;
  }

  async publishNoteDeleted(params: PublishNoteDeletedParams): Promise<boolean> {
    const event: NoteEvent = {
      eventId: uuidv4(),
      eventType: 'NOTE_DELETED',
      timestamp: new Date().toISOString(),
      version: 1,
      payload: {
        noteId: params.noteId,
        userId: params.userId,
      },
    };

    const published = await this.publish(
      KAFKA_TOPICS.NOTE_EVENTS,
      params.userId,
      event,
    );
    if (published) {
      await this.publishAuditLog(
        event,
        params.userId,
        'note',
        params.noteId,
        'delete',
      );
    }
    return published;
  }

  private async publish(
    topic: string,
    key: string,
    event: NoteEvent,
  ): Promise<boolean> {
    if (!this.kafkaService.isAvailable()) {
      this.logger.warn(
        `Kafka unavailable, event ${event.eventId} not published`,
      );
      return false;
    }

    const producer = this.kafkaService.getProducer();
    if (!producer) {
      return false;
    }

    try {
      await producer.send({
        topic,
        messages: [
          {
            key,
            value: JSON.stringify(event),
            headers: {
              eventType: event.eventType,
              version: String(event.version),
            },
          },
        ],
      });
      this.logger.debug(
        `Published ${event.eventType} for note ${event.payload.noteId}`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to publish event: ${error instanceof Error ? error.message : error}`,
      );
      return false;
    }
  }

  private async publishAuditLog(
    event: NoteEvent,
    userId: string,
    resourceType: string,
    resourceId: string,
    action: AuditAction,
    changes?: { before: Record<string, unknown>; after: Record<string, unknown> },
  ): Promise<void> {
    if (!this.kafkaService.isAvailable()) return;

    const producer = this.kafkaService.getProducer();
    if (!producer) return;

    const auditEntry: AuditLogEntry = {
      eventId: uuidv4(),
      eventType: event.eventType,
      timestamp: new Date().toISOString(),
      version: 1,
      actor: { userId },
      resource: { type: resourceType as AuditLogEntry['resource']['type'], id: resourceId },
      action,
      changes,
    };

    try {
      await producer.send({
        topic: KAFKA_TOPICS.AUDIT_LOG,
        messages: [{ key: userId, value: JSON.stringify(auditEntry) }],
      });
    } catch (error) {
      this.logger.error(
        `Failed to publish audit log: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
}
