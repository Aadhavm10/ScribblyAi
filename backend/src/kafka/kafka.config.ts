// Kafka topic definitions and configuration

export const KAFKA_TOPICS = {
  // Note Events (Event Sourcing)
  NOTE_EVENTS: 'scribbly.notes.events',
  NOTE_EVENTS_DLQ: 'scribbly.notes.events.dlq',

  // Indexing
  INDEX_COMMANDS: 'scribbly.indexing.commands',
  INDEX_COMMANDS_DLQ: 'scribbly.indexing.commands.dlq',

  // Sync Orchestration
  SYNC_JOBS: 'scribbly.sync.jobs',
  SYNC_JOBS_DLQ: 'scribbly.sync.jobs.dlq',
  SYNC_RESULTS: 'scribbly.sync.results',

  // Analytics
  ANALYTICS_EVENTS: 'scribbly.analytics.events',
  ANALYTICS_AGGREGATES: 'scribbly.analytics.aggregates',

  // Audit Trail
  AUDIT_LOG: 'scribbly.audit.log',
} as const;

export const TOPIC_CONFIGS: Record<
  string,
  { numPartitions: number; replicationFactor: number; configEntries?: { name: string; value: string }[] }
> = {
  [KAFKA_TOPICS.NOTE_EVENTS]: {
    numPartitions: 6,
    replicationFactor: 1,
    configEntries: [
      { name: 'retention.ms', value: '604800000' }, // 7 days
      { name: 'cleanup.policy', value: 'delete' },
    ],
  },
  [KAFKA_TOPICS.NOTE_EVENTS_DLQ]: {
    numPartitions: 1,
    replicationFactor: 1,
    configEntries: [{ name: 'retention.ms', value: '604800000' }],
  },
  [KAFKA_TOPICS.INDEX_COMMANDS]: {
    numPartitions: 3,
    replicationFactor: 1,
    configEntries: [{ name: 'retention.ms', value: '86400000' }], // 1 day
  },
  [KAFKA_TOPICS.INDEX_COMMANDS_DLQ]: {
    numPartitions: 1,
    replicationFactor: 1,
    configEntries: [{ name: 'retention.ms', value: '604800000' }],
  },
  [KAFKA_TOPICS.SYNC_JOBS]: {
    numPartitions: 12,
    replicationFactor: 1,
    configEntries: [{ name: 'retention.ms', value: '86400000' }],
  },
  [KAFKA_TOPICS.SYNC_JOBS_DLQ]: {
    numPartitions: 1,
    replicationFactor: 1,
    configEntries: [{ name: 'retention.ms', value: '604800000' }],
  },
  [KAFKA_TOPICS.SYNC_RESULTS]: {
    numPartitions: 3,
    replicationFactor: 1,
    configEntries: [{ name: 'retention.ms', value: '86400000' }],
  },
  [KAFKA_TOPICS.AUDIT_LOG]: {
    numPartitions: 6,
    replicationFactor: 1,
    configEntries: [
      { name: 'retention.ms', value: '2592000000' }, // 30 days
      { name: 'cleanup.policy', value: 'compact,delete' },
    ],
  },
  [KAFKA_TOPICS.ANALYTICS_EVENTS]: {
    numPartitions: 6,
    replicationFactor: 1,
    configEntries: [{ name: 'retention.ms', value: '172800000' }], // 2 days
  },
  [KAFKA_TOPICS.ANALYTICS_AGGREGATES]: {
    numPartitions: 3,
    replicationFactor: 1,
    configEntries: [{ name: 'retention.ms', value: '604800000' }],
  },
};

export const CONSUMER_GROUPS = {
  INDEXING: 'scribbly-indexing-workers',
  AUDIT: 'scribbly-audit-writers',
  SYNC: 'scribbly-sync-workers',
  ANALYTICS: 'scribbly-analytics-aggregators',
  DLQ: 'scribbly-dlq-processors',
} as const;
