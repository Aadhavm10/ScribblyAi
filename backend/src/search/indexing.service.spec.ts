import { Test, TestingModule } from '@nestjs/testing';
import { IndexingService } from './indexing.service';
import { PrismaService } from '../prisma/prisma.service';
import { VertexAiService } from '../vertex-ai/vertex-ai.service';
import { ElasticsearchService } from '../elasticsearch/elasticsearch.service';
import {
  createMockPrismaService,
  createMockVertexAiService,
  createMockElasticsearchService,
} from '../test/mock-factory';

describe('IndexingService', () => {
  let service: IndexingService;
  let prisma: ReturnType<typeof createMockPrismaService>;
  let vertexAi: ReturnType<typeof createMockVertexAiService>;
  let elasticsearch: ReturnType<typeof createMockElasticsearchService>;

  const embedding = new Array(768).fill(0.5);
  const note = {
    id: 'note-1',
    userId: 'user-1',
    title: 'Roadmap',
    content: 'Q3 planning',
    tags: [{ tag: { name: 'work' } }],
    viewCount: 3,
    lastViewedAt: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-02'),
  };

  beforeEach(async () => {
    prisma = createMockPrismaService();
    vertexAi = createMockVertexAiService();
    elasticsearch = createMockElasticsearchService();
    vertexAi.generateEmbedding.mockResolvedValue(embedding);
    prisma.note.findUnique.mockResolvedValue(note);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IndexingService,
        { provide: PrismaService, useValue: prisma },
        { provide: VertexAiService, useValue: vertexAi },
        { provide: ElasticsearchService, useValue: elasticsearch },
      ],
    }).compile();

    service = module.get<IndexingService>(IndexingService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('indexNote', () => {
    it('embeds the note as a document and indexes it with its vector', async () => {
      await service.indexNote('note-1');

      expect(vertexAi.generateEmbedding).toHaveBeenCalledWith(
        'Roadmap\n\nQ3 planning',
        'RETRIEVAL_DOCUMENT',
      );
      expect(elasticsearch.client.index).toHaveBeenCalledWith(
        expect.objectContaining({
          index: 'notes',
          id: 'note-1',
          document: expect.objectContaining({
            userId: 'user-1',
            tags: ['work'],
            provider: 'notes',
            itemType: 'note',
            content_embedding: embedding,
          }),
        }),
      );
    });

    it('indexes without a vector when Vertex AI is not configured', async () => {
      vertexAi.generateEmbedding.mockResolvedValue(null);

      await service.indexNote('note-1');

      const { document } = elasticsearch.client.index.mock.calls[0][0];
      expect(document).not.toHaveProperty('content_embedding');
      expect(document.title).toBe('Roadmap');
    });

    it('throws when embedding fails so Kafka can retry and dead-letter the event', async () => {
      vertexAi.generateEmbedding.mockRejectedValue(new Error('quota exceeded'));

      await expect(service.indexNote('note-1')).rejects.toThrow(
        'quota exceeded',
      );
      expect(elasticsearch.client.index).not.toHaveBeenCalled();
    });

    it('throws when Elasticsearch rejects the document', async () => {
      elasticsearch.client.index.mockRejectedValue(
        new Error('mapper_parsing_exception'),
      );

      await expect(service.indexNote('note-1')).rejects.toThrow(
        'mapper_parsing_exception',
      );
    });

    it('skips notes that were deleted before indexing', async () => {
      prisma.note.findUnique.mockResolvedValue(null);

      await service.indexNote('note-1');

      expect(elasticsearch.client.index).not.toHaveBeenCalled();
    });

    it('does nothing when Elasticsearch is not configured', async () => {
      elasticsearch.isEnabled.mockReturnValue(false);

      await service.indexNote('note-1');

      expect(prisma.note.findUnique).not.toHaveBeenCalled();
      expect(vertexAi.generateEmbedding).not.toHaveBeenCalled();
    });
  });

  describe('bulkIndexNotes', () => {
    it('reindexes every note and reports failures without stopping', async () => {
      prisma.note.findMany.mockResolvedValue([
        { id: 'note-1' },
        { id: 'note-2' },
        { id: 'note-3' },
      ]);
      elasticsearch.client.index
        .mockResolvedValueOnce({ result: 'updated' })
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValueOnce({ result: 'updated' });

      const result = await service.bulkIndexNotes('user-1');

      expect(result).toEqual({ indexed: 2, failed: ['note-2'] });
      expect(elasticsearch.client.index).toHaveBeenCalledTimes(3);
    });
  });

  describe('deleteNoteFromIndex', () => {
    it('deletes the document', async () => {
      await service.deleteNoteFromIndex('note-1');

      expect(elasticsearch.client.delete).toHaveBeenCalledWith({
        index: 'notes',
        id: 'note-1',
      });
    });

    it('ignores documents that are already gone', async () => {
      elasticsearch.client.delete.mockRejectedValue({
        meta: { statusCode: 404 },
      });

      await expect(
        service.deleteNoteFromIndex('note-1'),
      ).resolves.toBeUndefined();
    });

    it('throws on other errors so the delete is retried', async () => {
      elasticsearch.client.delete.mockRejectedValue(
        new Error('connection refused'),
      );

      await expect(service.deleteNoteFromIndex('note-1')).rejects.toThrow(
        'connection refused',
      );
    });
  });
});
