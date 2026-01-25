import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer, Consumer, Admin, logLevel } from 'kafkajs';

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaService.name);
  private kafka: Kafka | null = null;
  private producer: Producer | null = null;
  private consumers: Map<string, Consumer> = new Map();
  private admin: Admin | null = null;
  private isConnected = false;
  private readonly enabled: boolean;

  constructor(private configService: ConfigService) {
    this.enabled = this.configService.get<string>('KAFKA_ENABLED', 'false') === 'true';

    if (!this.enabled) {
      this.logger.warn('Kafka is disabled via KAFKA_ENABLED=false');
      return;
    }

    const brokers = this.configService
      .get<string>('KAFKA_BROKERS', 'localhost:9092')
      .split(',');
    const clientId = this.configService.get<string>(
      'KAFKA_CLIENT_ID',
      'scribbly-backend',
    );

    this.kafka = new Kafka({
      clientId,
      brokers,
      logLevel: logLevel.WARN,
      retry: {
        initialRetryTime: 100,
        retries: 8,
        maxRetryTime: 30000,
        factor: 2,
      },
    });

    this.producer = this.kafka.producer({
      allowAutoTopicCreation: false,
      idempotent: true,
      maxInFlightRequests: 5,
    });

    this.admin = this.kafka.admin();
  }

  async onModuleInit() {
    if (!this.enabled || !this.producer || !this.admin) {
      return;
    }

    try {
      await this.producer.connect();
      await this.admin.connect();
      this.isConnected = true;
      this.logger.log('Kafka producer and admin connected');
    } catch (error) {
      this.logger.error(
        'Failed to connect to Kafka:',
        error instanceof Error ? error.message : error,
      );
      // Don't throw - allow graceful degradation
    }
  }

  async onModuleDestroy() {
    if (this.producer) {
      await this.producer.disconnect();
    }
    if (this.admin) {
      await this.admin.disconnect();
    }
    for (const consumer of this.consumers.values()) {
      await consumer.disconnect();
    }
    this.logger.log('Kafka connections closed');
  }

  getProducer(): Producer | null {
    return this.producer;
  }

  getAdmin(): Admin | null {
    return this.admin;
  }

  getKafka(): Kafka | null {
    return this.kafka;
  }

  async createConsumer(groupId: string): Promise<Consumer | null> {
    if (!this.kafka || !this.enabled) {
      return null;
    }

    if (this.consumers.has(groupId)) {
      return this.consumers.get(groupId)!;
    }

    const consumer = this.kafka.consumer({
      groupId,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
      maxBytesPerPartition: 1048576, // 1MB
    });

    try {
      await consumer.connect();
      this.consumers.set(groupId, consumer);
      return consumer;
    } catch (error) {
      this.logger.error(
        `Failed to create consumer for group ${groupId}:`,
        error instanceof Error ? error.message : error,
      );
      return null;
    }
  }

  isAvailable(): boolean {
    return this.enabled && this.isConnected;
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}
