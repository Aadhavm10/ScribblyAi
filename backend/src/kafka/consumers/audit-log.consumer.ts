import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { KafkaService } from '../kafka.service';
import { KAFKA_TOPICS, CONSUMER_GROUPS } from '../kafka.config';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogEntry } from '../interfaces';

@Injectable()
export class AuditLogConsumer implements OnModuleInit {
  private readonly logger = new Logger(AuditLogConsumer.name);

  constructor(
    private kafkaService: KafkaService,
    private prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.kafkaService.isEnabled()) {
      this.logger.warn('Kafka disabled, audit log consumer not started');
      return;
    }

    // Delay startup to allow Kafka connection
    setTimeout(() => this.startConsumer(), 5000);
  }

  private async startConsumer(): Promise<void> {
    if (!this.kafkaService.isAvailable()) {
      this.logger.warn('Kafka unavailable, audit log consumer not started');
      return;
    }

    const consumer = await this.kafkaService.createConsumer(CONSUMER_GROUPS.AUDIT);

    if (!consumer) {
      this.logger.warn('Failed to create audit log consumer');
      return;
    }

    try {
      await consumer.subscribe({
        topics: [KAFKA_TOPICS.AUDIT_LOG],
        fromBeginning: false,
      });

      await consumer.run({
        eachMessage: async ({ message }) => {
          if (!message.value) return;

          try {
            const entry: AuditLogEntry = JSON.parse(message.value.toString());
            await this.processAuditEntry(entry);
          } catch (error) {
            this.logger.error(
              `Failed to process audit entry: ${error instanceof Error ? error.message : error}`,
            );
          }
        },
      });

      this.logger.log('Audit log consumer started');
    } catch (error) {
      this.logger.error(
        `Failed to start audit log consumer: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  private async processAuditEntry(entry: AuditLogEntry): Promise<void> {
    try {
      // Use raw query to handle the AuditLog table that will be added
      await this.prisma.$executeRaw`
        INSERT INTO "AuditLog"
          ("id", "eventId", "eventType", "timestamp", "actorUserId",
           "resourceType", "resourceId", "action", "changes", "createdAt")
        VALUES
          (${entry.eventId}, ${entry.eventId}, ${entry.eventType},
           ${new Date(entry.timestamp)}, ${entry.actor.userId},
           ${entry.resource.type}, ${entry.resource.id}, ${entry.action},
           ${entry.changes ? JSON.stringify(entry.changes) : null}::jsonb,
           NOW())
        ON CONFLICT ("eventId") DO NOTHING
      `;
      this.logger.debug(`Stored audit log entry ${entry.eventId}`);
    } catch (error) {
      // If the table doesn't exist yet, log a warning and skip
      if (
        error instanceof Error &&
        error.message.includes('relation "AuditLog" does not exist')
      ) {
        this.logger.warn(
          'AuditLog table does not exist. Run prisma migrate to create it.',
        );
        return;
      }
      throw error;
    }
  }
}
