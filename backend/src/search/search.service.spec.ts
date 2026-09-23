import { Test, TestingModule } from '@nestjs/testing';
import { SearchService, reciprocalRankFusion } from './search.service';
import { PrismaService } from '../prisma/prisma.service';
import { VertexAiService } from '../vertex-ai/vertex-ai.service';
import { ElasticsearchService } from '../elasticsearch/elasticsearch.service';
import { MetricsService } from '../metrics/metrics.service';
import {
  createMockPrismaService,
  createMockVertexAiService,
  createMockElasticsearchService,
  createMockMetricsService,
} from '../test/mock-factory';

const hit = (id: string, source: Record<string, unknown> = {}, score = 1) => ({
  _id: id,
  _score: score,
  _source: {
    noteId: id,
    title: `Title ${id}`,
    content: `Content of ${id}`,
    ...source,
  },
});

const hits = (...items: ReturnType<typeof hit>[]) => ({
  hits: { hits: items },
});

describe('reciprocalRankFusion', () => {
  it('ranks documents found by both retrievers above single-list documents', () => {
    const fused = reciprocalRankFusion([
      ['a', 'b', 'c'],
      ['c', 'd', 'a'],
    ]);

    expect(fused.map((r) => r.id)).toEqual(['a', 'c', 'b', 'd']);
  });

  it('scores each document as the sum of 1 / (k + rank)', () => {
    const fused = reciprocalRankFusion([['a', 'b'], ['b']], 60);

    expect(fused.find((r) => r.id === 'a')!.score).toBeCloseTo(1 / 61);
    expect(fused.find((r) => r.id === 'b')!.score).toBeCloseTo(1 / 62 + 1 / 61);
  });

  it('returns an empty list when there are no rankings', () => {
    expect(reciprocalRankFusion([[], []])).toEqual([]);
  });
});

describe('SearchService', () => {
  let service: SearchService;
  let prisma: ReturnType<typeof createMockPrismaService>;
  let vertexAi: ReturnType<typeof createMockVertexAiService>;
  let elasticsearch: ReturnType<typeof createMockElasticsearchService>;
  let metrics: ReturnType<typeof createMockMetricsService>;

  const queryVector = new Array(768).fill(0.1);

  beforeEach(async () => {
    prisma = createMockPrismaService();
    vertexAi = createMockVertexAiService();
    elasticsearch = createMockElasticsearchService();
    metrics = createMockMetricsService();
    vertexAi.generateEmbedding.mockResolvedValue(queryVector);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: PrismaService, useValue: prisma },
        { provide: VertexAiService, useValue: vertexAi },
        { provide: ElasticsearchService, useValue: elasticsearch },
        { provide: MetricsService, useValue: metrics },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('hybridSearch', () => {
    it('fuses BM25 and kNN results with reciprocal rank fusion', async () => {
      elasticsearch.client.search
        .mockResolvedValueOnce(hits(hit('keyword-only'), hit('both')))
        .mockResolvedValueOnce(
          hits(hit('both', {}, 0.92), hit('vector-only', {}, 0.8)),
        );

      const results = await service.hybridSearch('roadmap', 'user-1');

      expect(results.map((r) => r.noteId)).toEqual([
        'both',
        'keyword-only',
        'vector-only',
      ]);
      expect(results[0].score).toBeCloseTo(1 / 62 + 1 / 61);
      expect(results[0].similarity).toBe(0.92);
      expect(results[1].similarity).toBeUndefined();
      expect(metrics.searchQueries.inc).toHaveBeenCalledWith({
        type: 'hybrid',
      });
    });

    it('embeds the query as a retrieval query and runs kNN over content_embedding', async () => {
      await service.hybridSearch('roadmap', 'user-1');

      expect(vertexAi.generateEmbedding).toHaveBeenCalledWith(
        'roadmap',
        'RETRIEVAL_QUERY',
      );
      const knnRequest = elasticsearch.client.search.mock.calls[1][0];
      expect(knnRequest.knn).toMatchObject({
        field: 'content_embedding',
        query_vector: queryVector,
        k: 50,
        num_candidates: 100,
      });
    });

    it('restricts both retrievers to the user and selected providers', async () => {
      await service.hybridSearch('roadmap', 'user-1', 10, ['gmail']);

      const [keywordRequest, knnRequest] =
        elasticsearch.client.search.mock.calls.map((c) => c[0]);
      const expectedFilter = [
        { term: { userId: 'user-1' } },
        {
          bool: {
            should: [{ terms: { provider: ['gmail'] } }],
            minimum_should_match: 1,
          },
        },
      ];
      expect(keywordRequest.query.bool.filter).toEqual(expectedFilter);
      expect(knnRequest.knn.filter).toEqual(expectedFilter);
    });

    it('matches notes indexed without a provider field when notes are selected', async () => {
      await service.hybridSearch('roadmap', 'user-1', 10, ['notes']);

      const providerFilter =
        elasticsearch.client.search.mock.calls[0][0].query.bool.filter[1];
      expect(providerFilter.bool.should).toEqual([
        { term: { provider: 'notes' } },
        { bool: { must_not: { exists: { field: 'provider' } } } },
      ]);
    });

    it('maps synced Google items with their provider and link', async () => {
      elasticsearch.client.search
        .mockResolvedValueOnce(
          hits(
            hit('gmail:user-1:m1', {
              noteId: 'gmail:m1',
              provider: 'gmail',
              itemType: 'email',
              webViewUrl: 'https://mail.google.com/mail/u/0/#inbox/m1',
            }),
          ),
        )
        .mockResolvedValueOnce(hits());

      const [result] = await service.hybridSearch('invoice', 'user-1');

      expect(result).toMatchObject({
        noteId: 'gmail:m1',
        provider: 'gmail',
        itemType: 'email',
        webViewUrl: 'https://mail.google.com/mail/u/0/#inbox/m1',
      });
    });

    it('respects the limit after fusion', async () => {
      elasticsearch.client.search
        .mockResolvedValueOnce(hits(hit('a'), hit('b'), hit('c')))
        .mockResolvedValueOnce(hits(hit('d')));

      const results = await service.hybridSearch('roadmap', 'user-1', 2);

      expect(results).toHaveLength(2);
    });

    it('falls back to keyword-only search when the query cannot be embedded', async () => {
      vertexAi.generateEmbedding.mockRejectedValue(new Error('quota exceeded'));
      elasticsearch.client.search.mockResolvedValueOnce(hits(hit('a')));

      const results = await service.hybridSearch('roadmap', 'user-1');

      expect(elasticsearch.client.search).toHaveBeenCalledTimes(1);
      expect(results.map((r) => r.noteId)).toEqual(['a']);
      expect(metrics.searchQueries.inc).toHaveBeenCalledWith({
        type: 'keyword',
      });
    });

    it('skips kNN when Vertex AI is not configured', async () => {
      vertexAi.generateEmbedding.mockResolvedValue(null);

      await service.hybridSearch('roadmap', 'user-1');

      expect(elasticsearch.client.search).toHaveBeenCalledTimes(1);
      expect(elasticsearch.client.search.mock.calls[0][0].knn).toBeUndefined();
    });

    it('falls back to PostgreSQL when Elasticsearch fails', async () => {
      elasticsearch.client.search.mockRejectedValue(
        new Error('connection refused'),
      );
      prisma.note.findMany.mockResolvedValue([
        { id: 'note-1', title: 'Roadmap', content: 'Q3 roadmap planning' },
      ]);

      const results = await service.hybridSearch('roadmap', 'user-1');

      expect(prisma.note.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'user-1' }),
        }),
      );
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ noteId: 'note-1', provider: 'notes' });
      expect(metrics.searchQueries.inc).toHaveBeenCalledWith({
        type: 'database',
      });
    });

    it('uses PostgreSQL directly when Elasticsearch is not configured', async () => {
      elasticsearch.isEnabled.mockReturnValue(false);
      prisma.note.findMany.mockResolvedValue([]);

      await service.hybridSearch('roadmap', 'user-1');

      expect(elasticsearch.client.search).not.toHaveBeenCalled();
      expect(prisma.note.findMany).toHaveBeenCalled();
    });

    it('returns no fallback results when only Google providers are selected', async () => {
      elasticsearch.isEnabled.mockReturnValue(false);

      const results = await service.hybridSearch('roadmap', 'user-1', 10, [
        'gmail',
        'drive',
      ]);

      expect(results).toEqual([]);
      expect(prisma.note.findMany).not.toHaveBeenCalled();
    });

    it('returns an empty list for a blank query', async () => {
      const results = await service.hybridSearch('   ', 'user-1');

      expect(results).toEqual([]);
      expect(elasticsearch.client.search).not.toHaveBeenCalled();
    });

    it('returns an empty list when every backend fails', async () => {
      elasticsearch.client.search.mockRejectedValue(new Error('down'));
      prisma.note.findMany.mockRejectedValue(new Error('down'));

      await expect(service.hybridSearch('roadmap', 'user-1')).resolves.toEqual(
        [],
      );
    });
  });
});
