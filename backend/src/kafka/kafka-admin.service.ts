import { Injectable, Logger } from '@nestjs/common';
import { KafkaService } from './kafka.service';
import { KAFKA_TOPICS, TOPIC_CONFIGS } from './kafka.config';

@Injectable()
export class KafkaAdminService {
  private readonly logger = new Logger(KafkaAdminService.name);

  constructor(private kafkaService: KafkaService) {}

  async ensureTopicsExist(): Promise<void> {
    if (!this.kafkaService.isAvailable()) {
      this.logger.warn('Kafka unavailable, skipping topic creation');
      return;
    }

    const admin = this.kafkaService.getAdmin();
    if (!admin) {
      return;
    }

    try {
      // Get existing topics
      const existingTopics = await admin.listTopics();
      const topicsToCreate: Array<{
        topic: string;
        numPartitions: number;
        replicationFactor: number;
        configEntries?: { name: string; value: string }[];
      }> = [];

      // Check which topics need to be created
      for (const topic of Object.values(KAFKA_TOPICS)) {
        if (!existingTopics.includes(topic)) {
          const config = TOPIC_CONFIGS[topic];
          if (config) {
            topicsToCreate.push({
              topic,
              numPartitions: config.numPartitions,
              replicationFactor: config.replicationFactor,
              configEntries: config.configEntries,
            });
          } else {
            // Default configuration for topics not in TOPIC_CONFIGS
            topicsToCreate.push({
              topic,
              numPartitions: 3,
              replicationFactor: 1,
            });
          }
        }
      }

      if (topicsToCreate.length === 0) {
        this.logger.log('All Kafka topics already exist');
        return;
      }

      // Create missing topics
      await admin.createTopics({
        topics: topicsToCreate,
        waitForLeaders: true,
      });

      this.logger.log(
        `Created ${topicsToCreate.length} Kafka topics: ${topicsToCreate.map((t) => t.topic).join(', ')}`,
      );
    } catch (error) {
      this.logger.error(
        'Failed to ensure topics exist:',
        error instanceof Error ? error.message : error,
      );
      // Don't throw - allow graceful degradation
    }
  }

  async deleteAllTopics(): Promise<void> {
    if (!this.kafkaService.isAvailable()) {
      return;
    }

    const admin = this.kafkaService.getAdmin();
    if (!admin) {
      return;
    }

    try {
      const topics = Object.values(KAFKA_TOPICS);
      await admin.deleteTopics({ topics });
      this.logger.log(`Deleted ${topics.length} Kafka topics`);
    } catch (error) {
      this.logger.error(
        'Failed to delete topics:',
        error instanceof Error ? error.message : error,
      );
    }
  }

  async getTopicMetadata(): Promise<Record<string, unknown> | null> {
    if (!this.kafkaService.isAvailable()) {
      return null;
    }

    const admin = this.kafkaService.getAdmin();
    if (!admin) {
      return null;
    }

    try {
      const metadata = await admin.fetchTopicMetadata({
        topics: Object.values(KAFKA_TOPICS),
      });
      return metadata as unknown as Record<string, unknown>;
    } catch (error) {
      this.logger.error(
        'Failed to fetch topic metadata:',
        error instanceof Error ? error.message : error,
      );
      return null;
    }
  }
}
