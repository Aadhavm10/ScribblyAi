import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VertexAI } from '@google-cloud/vertexai';
import { GoogleAuth } from 'google-auth-library';
import { EMBEDDING_DIMENSIONS } from '../elasticsearch/elasticsearch.service';

// Notes are embedded as documents and search queries as queries, so the
// model places them in the same space for retrieval.
export type EmbeddingTaskType = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';

interface EmbeddingPredictResponse {
  predictions?: { embeddings?: { values?: number[] } }[];
}

@Injectable()
export class VertexAiService {
  private readonly logger = new Logger(VertexAiService.name);
  private vertexAI: VertexAI;
  private geminiModel: any;
  private auth?: GoogleAuth;
  private embeddingEndpoint?: string;

  constructor(private configService: ConfigService) {
    const projectId = this.configService.get('GCP_PROJECT_ID');
    const location = this.configService.get('VERTEX_AI_LOCATION');

    if (!projectId || !location) {
      this.logger.warn(
        'Vertex AI not configured. Gemini will use mock responses and search will be keyword-only.',
      );
      return;
    }

    const embeddingModel = this.configService.get('EMBEDDING_MODEL') || 'text-embedding-004';
    this.embeddingEndpoint =
      `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}` +
      `/locations/${location}/publishers/google/models/${embeddingModel}:predict`;
    this.auth = new GoogleAuth({ scopes: 'https://www.googleapis.com/auth/cloud-platform' });

    try {
      this.vertexAI = new VertexAI({
        project: projectId,
        location: location,
      });

      this.geminiModel = this.vertexAI.preview.getGenerativeModel({
        model: 'gemini-1.5-pro',
        generationConfig: {
          temperature: 0.7,
          topP: 0.95,
          maxOutputTokens: 2048,
        },
      });

      this.logger.log('Vertex AI initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Vertex AI:', error.message);
    }
  }

  /**
   * Embeds text with the Vertex AI text embedding model.
   * Returns null when Vertex AI is not configured or the text is empty, so
   * callers can index without a vector and search can fall back to keywords.
   * Throws on API errors so indexing can retry and dead-letter the event.
   */
  async generateEmbedding(
    text: string,
    taskType: EmbeddingTaskType = 'RETRIEVAL_DOCUMENT',
  ): Promise<number[] | null> {
    if (!this.auth || !this.embeddingEndpoint) {
      return null;
    }

    const content = text.trim();
    if (!content) {
      return null;
    }

    const response = await this.auth.request<EmbeddingPredictResponse>({
      url: this.embeddingEndpoint,
      method: 'POST',
      data: {
        instances: [{ content, task_type: taskType }],
        parameters: { outputDimensionality: EMBEDDING_DIMENSIONS, autoTruncate: true },
      },
    });

    const values = response.data.predictions?.[0]?.embeddings?.values;
    if (!values || values.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Unexpected embedding response: expected ${EMBEDDING_DIMENSIONS} values, got ${values?.length ?? 0}`,
      );
    }
    return values;
  }

  async generateResponse(prompt: string, context?: string): Promise<string> {
    if (!this.geminiModel) {
      this.logger.warn('Gemini not available, returning mock response');
      return 'I found relevant information in your notes. (Mock response - Vertex AI not configured)';
    }

    try {
      const fullPrompt = context 
        ? `Context:\n${context}\n\nUser Query: ${prompt}`
        : prompt;
      
      const result = await this.geminiModel.generateContent(fullPrompt);
      const response = await result.response;
      return response.text();
    } catch (error) {
      this.logger.error('Gemini generation failed:', error.message);
      return 'I found relevant information in your notes, but encountered an error generating the response.';
    }
  }
}

