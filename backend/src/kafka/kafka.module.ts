import { Module, Global, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// Core services
import { KafkaService } from './kafka.service';
import { KafkaAdminService } from './kafka-admin.service';

// Producers
import {
  NoteEventProducer,
  SyncEventProducer,
  AnalyticsProducer,
} from './producers';

// Consumers
import {
  IndexingConsumer,
  AuditLogConsumer,
  SyncWorkerConsumer,
  AnalyticsConsumer,
  DlqConsumer,
} from './consumers';

// Dependent modules
import { PrismaModule } from '../prisma/prisma.module';
import { SearchModule } from '../search/search.module';
import { ConnectorsModule } from '../connectors/connectors.module';

@Global()
@Module({
  imports: [ConfigModule, PrismaModule, SearchModule, ConnectorsModule],
  providers: [
    // Core
    KafkaService,
    KafkaAdminService,
    // Producers
    NoteEventProducer,
    SyncEventProducer,
    AnalyticsProducer,
    // Consumers
    IndexingConsumer,
    AuditLogConsumer,
    SyncWorkerConsumer,
    AnalyticsConsumer,
    DlqConsumer,
  ],
  exports: [
    KafkaService,
    NoteEventProducer,
    SyncEventProducer,
    AnalyticsProducer,
  ],
})
export class KafkaModule implements OnModuleInit {
  constructor(private readonly kafkaAdmin: KafkaAdminService) {}

  async onModuleInit(): Promise<void> {
    // Ensure topics exist on startup
    await this.kafkaAdmin.ensureTopicsExist();
  }
}
