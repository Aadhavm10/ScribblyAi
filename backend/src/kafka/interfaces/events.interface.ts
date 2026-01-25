// Base event structure for all Kafka events
export interface BaseEvent {
  eventId: string;
  eventType: string;
  timestamp: string; // ISO 8601
  version: number;
  correlationId?: string;
  causationId?: string;
}

// Note Events (Event Sourcing)
export type NoteEventType =
  | 'NOTE_CREATED'
  | 'NOTE_UPDATED'
  | 'NOTE_DELETED'
  | 'NOTE_CONTENT_CHANGED';

export interface NoteEvent extends BaseEvent {
  eventType: NoteEventType;
  payload: {
    noteId: string;
    userId: string;
    title?: string;
    content?: string;
    previousContent?: string;
    tags?: string[];
    sessionCode?: string;
    metadata?: {
      cursorPosition?: number;
      clientId?: string;
      source: 'web' | 'api' | 'sync' | 'realtime';
    };
  };
}

// Indexing Commands
export type IndexCommandType =
  | 'INDEX_NOTE'
  | 'DELETE_NOTE_INDEX'
  | 'REINDEX_USER_NOTES';

export interface IndexCommand extends BaseEvent {
  eventType: IndexCommandType;
  payload: {
    noteId?: string;
    userId: string;
    priority: 'high' | 'normal' | 'low';
    retryCount?: number;
  };
}

// Sync Jobs
export type SyncJobEventType =
  | 'SYNC_REQUESTED'
  | 'SYNC_STARTED'
  | 'SYNC_COMPLETED'
  | 'SYNC_FAILED';

export type SyncProvider = 'gmail' | 'drive' | 'docs' | 'calendar';

export interface SyncJobEvent extends BaseEvent {
  eventType: SyncJobEventType;
  payload: {
    userId: string;
    provider: SyncProvider;
    jobId: string;
    status?: 'pending' | 'in_progress' | 'completed' | 'failed';
    itemsProcessed?: number;
    error?: string;
    duration?: number;
  };
}

// Analytics Events
export type AnalyticsEventType =
  | 'USER_ACTIVE'
  | 'SEARCH_PERFORMED'
  | 'NOTE_VIEWED'
  | 'NOTE_CREATED'
  | 'SYNC_HEALTH_CHECK'
  | 'REALTIME_SESSION_START'
  | 'REALTIME_SESSION_END';

export interface AnalyticsEvent extends BaseEvent {
  eventType: AnalyticsEventType;
  payload: {
    userId: string;
    sessionId?: string;
    metadata: Record<string, unknown>;
  };
}

// Audit Log Entry
export type AuditAction = 'create' | 'read' | 'update' | 'delete';
export type AuditResourceType =
  | 'note'
  | 'folder'
  | 'tag'
  | 'calendar'
  | 'user'
  | 'sync';

export interface AuditLogEntry extends BaseEvent {
  eventType: string;
  actor: {
    userId: string;
    userEmail?: string;
    ipAddress?: string;
    userAgent?: string;
  };
  resource: {
    type: AuditResourceType;
    id: string;
  };
  action: AuditAction;
  changes?: {
    before: Record<string, unknown>;
    after: Record<string, unknown>;
  };
}

// Dead Letter Queue Message
export interface DlqMessage<T = unknown> {
  originalEvent: T;
  error: string;
  failedAt: string;
  retryCount: number;
  topic: string;
}
