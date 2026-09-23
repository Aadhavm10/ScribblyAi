import { Injectable, Logger } from '@nestjs/common';
import type { estypes } from '@elastic/elasticsearch';
import { PrismaService } from '../prisma/prisma.service';
import { VertexAiService } from '../vertex-ai/vertex-ai.service';
import {
  ElasticsearchService,
  NOTES_INDEX,
} from '../elasticsearch/elasticsearch.service';
import { MetricsService } from '../metrics/metrics.service';

export interface SearchResult {
  noteId: string;
  title: string;
  content: string;
  excerpt: string;
  score: number;
  similarity?: number;
  provider?: string;
  itemType?: string;
  webViewUrl?: string;
  snippet?: string;
}

interface IndexedDocument {
  noteId?: string;
  title?: string;
  content?: string;
  provider?: string;
  itemType?: string;
  webViewUrl?: string | null;
}

type Hit = estypes.SearchHit<IndexedDocument>;

export const ALL_PROVIDERS = ['notes', 'gmail', 'drive'];

// Standard RRF constant from Cormack et al. (2009); dampens the weight of top ranks
const RRF_K = 60;
// Candidates pulled from each retriever before fusion
const CANDIDATES = 50;

/**
 * Reciprocal rank fusion: each document scores sum(1 / (k + rank)) over every
 * ranked list it appears in. Rank-based, so BM25 scores and cosine similarities
 * never need to be put on the same scale.
 */
export function reciprocalRankFusion(
  rankings: string[][],
  k: number = RRF_K,
): { id: string; score: number }[] {
  const scores = new Map<string, number>();

  for (const ranking of rankings) {
    ranking.forEach((id, index) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + index + 1));
    });
  }

  return Array.from(scores, ([id, score]) => ({ id, score })).sort(
    (a, b) => b.score - a.score,
  );
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private prisma: PrismaService,
    private vertexAi: VertexAiService,
    private elasticsearch: ElasticsearchService,
    private metrics: MetricsService,
  ) {}

  /**
   * Hybrid search over notes and synced Google items: Elasticsearch BM25 keyword
   * search and kNN vector search over Vertex AI embeddings, fused with RRF.
   * Degrades to keyword-only when embeddings are unavailable, and to a PostgreSQL
   * text match when Elasticsearch is unavailable.
   */
  async hybridSearch(
    query: string,
    userId: string,
    limit: number = 10,
    providers?: string[],
  ): Promise<SearchResult[]> {
    const trimmedQuery = query?.trim();
    if (!trimmedQuery) return [];

    const selectedProviders = providers?.length ? providers : ALL_PROVIDERS;
    const startTime = Date.now();

    if (this.elasticsearch.isEnabled()) {
      try {
        const { results, mode } = await this.searchElasticsearch(
          trimmedQuery,
          userId,
          limit,
          selectedProviders,
        );
        this.metrics.searchQueries.inc({ type: mode });
        this.logger.log(
          `${mode} search returned ${results.length} results in ${Date.now() - startTime}ms`,
        );
        return results;
      } catch (error) {
        this.logger.warn(
          `Elasticsearch search failed, falling back to PostgreSQL: ${error.message}`,
        );
      }
    }

    try {
      const results = await this.searchDatabase(
        trimmedQuery,
        userId,
        limit,
        selectedProviders,
      );
      this.metrics.searchQueries.inc({ type: 'database' });
      this.logger.log(
        `database search returned ${results.length} results in ${Date.now() - startTime}ms`,
      );
      return results;
    } catch (error) {
      this.logger.error('Search failed:', error.message);
      return [];
    }
  }

  private async searchElasticsearch(
    query: string,
    userId: string,
    limit: number,
    providers: string[],
  ): Promise<{ results: SearchResult[]; mode: 'hybrid' | 'keyword' }> {
    const client = this.elasticsearch.getClient();
    const filter = this.buildFilter(userId, providers);
    const queryVector = await this.embedQuery(query);

    const [keywordResponse, vectorResponse] = await Promise.all([
      client.search<IndexedDocument>({
        index: NOTES_INDEX,
        size: CANDIDATES,
        query: {
          bool: {
            filter,
            must: {
              multi_match: {
                query,
                fields: ['title^3', 'content', 'tags^2'],
                type: 'best_fields',
                fuzziness: 'AUTO',
              },
            },
          },
        },
      }),
      queryVector
        ? client.search<IndexedDocument>({
            index: NOTES_INDEX,
            size: CANDIDATES,
            knn: {
              field: 'content_embedding',
              query_vector: queryVector,
              k: CANDIDATES,
              num_candidates: CANDIDATES * 2,
              filter,
            },
          })
        : Promise.resolve(null),
    ]);

    const keywordHits = keywordResponse.hits.hits;
    const vectorHits = vectorResponse?.hits.hits ?? [];

    const hitsById = new Map<string, Hit>();
    for (const hit of [...keywordHits, ...vectorHits]) {
      if (hit._id && hit._source) hitsById.set(hit._id, hit);
    }
    // For cosine similarity, Elasticsearch reports kNN _score as (1 + cosine) / 2
    const similarityById = new Map(
      vectorHits.map((hit) => [hit._id, hit._score ?? undefined]),
    );

    const fused = reciprocalRankFusion([
      keywordHits.map((hit) => hit._id!),
      vectorHits.map((hit) => hit._id!),
    ]);

    const results = fused
      .filter(({ id }) => hitsById.has(id))
      .slice(0, limit)
      .map(({ id, score }) => {
        const source = hitsById.get(id)!._source!;
        const content = source.content ?? '';
        return {
          noteId: source.noteId ?? id,
          title: source.title ?? '',
          content,
          excerpt: this.createExcerpt(content, query),
          score,
          similarity: similarityById.get(id),
          provider: source.provider ?? 'notes',
          itemType: source.itemType ?? 'note',
          webViewUrl: source.webViewUrl ?? undefined,
        };
      });

    return { results, mode: queryVector ? 'hybrid' : 'keyword' };
  }

  /** Restricts results to the user's own documents from the selected providers. */
  private buildFilter(
    userId: string,
    providers: string[],
  ): estypes.QueryDslQueryContainer[] {
    const providerClauses: estypes.QueryDslQueryContainer[] = [];

    const externalProviders = providers.filter((p) => p !== 'notes');
    if (externalProviders.length) {
      providerClauses.push({ terms: { provider: externalProviders } });
    }
    if (providers.includes('notes')) {
      // Notes indexed before the provider field existed have no provider at all
      providerClauses.push(
        { term: { provider: 'notes' } },
        { bool: { must_not: { exists: { field: 'provider' } } } },
      );
    }

    return [
      { term: { userId } },
      { bool: { should: providerClauses, minimum_should_match: 1 } },
    ];
  }

  /** Embeds the query, or returns null so search can continue keyword-only. */
  private async embedQuery(query: string): Promise<number[] | null> {
    try {
      return await this.vertexAi.generateEmbedding(query, 'RETRIEVAL_QUERY');
    } catch (error) {
      this.logger.warn(
        `Query embedding failed, using keyword search only: ${error.message}`,
      );
      return null;
    }
  }

  /** Fallback when Elasticsearch is unavailable. Gmail and Drive items only live in Elasticsearch. */
  private async searchDatabase(
    query: string,
    userId: string,
    limit: number,
    providers: string[],
  ): Promise<SearchResult[]> {
    if (!providers.includes('notes')) return [];

    const notes = await this.prisma.note.findMany({
      where: {
        userId,
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { content: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: limit,
      orderBy: { updatedAt: 'desc' },
    });

    return notes.map((note, index) => ({
      noteId: note.id,
      title: note.title,
      content: note.content,
      excerpt: this.createExcerpt(note.content, query),
      score: 1 / (RRF_K + index + 1),
      provider: 'notes',
      itemType: 'note',
    }));
  }

  private createExcerpt(
    content: string,
    query: string,
    length: number = 200,
  ): string {
    if (!content) return '';

    const lowerContent = content.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerContent.indexOf(lowerQuery);

    if (index === -1) {
      // Query not found, return first 200 chars
      return (
        content.substring(0, length) + (content.length > length ? '...' : '')
      );
    }

    // Query found, return context around it
    const start = Math.max(0, index - 50);
    const end = Math.min(content.length, index + query.length + 150);

    return (
      (start > 0 ? '...' : '') +
      content.substring(start, end) +
      (end < content.length ? '...' : '')
    );
  }
}
