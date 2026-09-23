import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@elastic/elasticsearch';

export const NOTES_INDEX = 'notes';
export const EMBEDDING_DIMENSIONS = 768;

@Injectable()
export class ElasticsearchService implements OnModuleInit {
  private readonly logger = new Logger(ElasticsearchService.name);
  private client?: Client;
  private readonly indexName = NOTES_INDEX;

  constructor(private configService: ConfigService) {
    const elasticsearchUrl = this.configService.get('ELASTICSEARCH_URL');
    const apiKey = this.configService.get('ELASTICSEARCH_API_KEY');

    if (!elasticsearchUrl) {
      this.logger.warn('ELASTICSEARCH_URL not set. Search will fall back to PostgreSQL.');
      return;
    }

    this.client = new Client({
      node: elasticsearchUrl,
      auth: {
        apiKey: apiKey,
      },
      tls: {
        rejectUnauthorized: false, // For development
      },
    });
  }

  async onModuleInit() {
    if (!this.client) return;

    try {
      await this.createIndex();
    } catch (error) {
      this.logger.error('Failed to initialize Elasticsearch:', error.message);
    }
  }

  async createIndex() {
    try {
      const client = this.getClient();
      const exists = await client.indices.exists({ index: this.indexName });

      if (!exists) {
        // Serverless-compatible index creation (no shards/replicas settings)
        await client.indices.create({
          index: this.indexName,
          body: {
            mappings: {
              properties: {
                noteId: { type: 'keyword' },
                userId: { type: 'keyword' },
                title: {
                  type: 'text',
                  analyzer: 'standard',
                  fields: { keyword: { type: 'keyword' } },
                },
                content: { type: 'text', analyzer: 'standard' },
                tags: { type: 'keyword' },
                content_embedding: {
                  type: 'dense_vector',
                  dims: EMBEDDING_DIMENSIONS,
                  index: true,
                  similarity: 'cosine',
                },
                // 'notes' for ScribblyAi notes, 'gmail' / 'drive' for synced Google items
                provider: { type: 'keyword' },
                itemType: { type: 'keyword' },
                mimeType: { type: 'keyword' },
                webViewUrl: { type: 'keyword', index: false },
                createdAt: { type: 'date' },
                updatedAt: { type: 'date' },
                viewCount: { type: 'integer' },
                lastViewedAt: { type: 'date' },
              },
            },
          },
        });
        this.logger.log('Elasticsearch index created successfully (serverless mode)');
      } else {
        this.logger.log('Elasticsearch index already exists');
      }
    } catch (error) {
      this.logger.error('Failed to create Elasticsearch index:', error.message);
      // Don't throw - allow app to start even if index creation fails
      this.logger.warn('Continuing without Elasticsearch index...');
    }
  }

  isEnabled(): boolean {
    return !!this.client;
  }

  getClient(): Client {
    if (!this.client) {
      throw new Error('Elasticsearch is not configured (ELASTICSEARCH_URL missing)');
    }
    return this.client;
  }
}
