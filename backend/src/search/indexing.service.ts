import { Injectable, Logger } from '@nestjs/common';
import {
  ElasticsearchService,
  NOTES_INDEX,
} from '../elasticsearch/elasticsearch.service';
import { VertexAiService } from '../vertex-ai/vertex-ai.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class IndexingService {
  private readonly logger = new Logger(IndexingService.name);

  constructor(
    private elasticsearch: ElasticsearchService,
    private vertexAi: VertexAiService,
    private prisma: PrismaService,
  ) {}

  /**
   * Embeds a note and writes it to Elasticsearch.
   * Throws on failure so the Kafka indexing consumer can retry and dead-letter it;
   * direct callers in NotesService catch the error themselves.
   */
  async indexNote(noteId: string): Promise<void> {
    if (!this.elasticsearch.isEnabled()) {
      this.logger.debug(
        `Elasticsearch disabled, skipping index of note ${noteId}`,
      );
      return;
    }

    const note = await this.prisma.note.findUnique({
      where: { id: noteId },
      include: { tags: { include: { tag: true } } },
    });

    if (!note) {
      // Deleted before the event was processed; nothing to index
      this.logger.warn(`Note ${noteId} not found, skipping index`);
      return;
    }

    const embedding = await this.vertexAi.generateEmbedding(
      `${note.title}\n\n${note.content}`,
      'RETRIEVAL_DOCUMENT',
    );

    await this.elasticsearch.getClient().index({
      index: NOTES_INDEX,
      id: noteId,
      document: {
        noteId: note.id,
        userId: note.userId,
        title: note.title,
        content: note.content,
        tags: note.tags.map((t) => t.tag.name),
        provider: 'notes',
        itemType: 'note',
        // Omitted when Vertex AI is not configured; the note is still keyword-searchable
        ...(embedding && { content_embedding: embedding }),
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
        viewCount: note.viewCount || 0,
        lastViewedAt: note.lastViewedAt,
      },
      refresh: 'wait_for',
    });

    await this.prisma.note.update({
      where: { id: noteId },
      data: { embedding: noteId, embeddingVersion: 1 },
    });

    this.logger.log(
      `Indexed note ${noteId}${embedding ? ' with embedding' : ' without embedding'}`,
    );
  }

  /**
   * Re-embeds and re-indexes every note for a user, e.g. after changing the
   * embedding model. One failed note does not stop the rest.
   */
  async bulkIndexNotes(
    userId: string,
  ): Promise<{ indexed: number; failed: string[] }> {
    const notes = await this.prisma.note.findMany({
      where: { userId },
      select: { id: true },
    });

    this.logger.log(
      `Starting bulk index of ${notes.length} notes for user ${userId}`,
    );

    let indexed = 0;
    const failed: string[] = [];
    for (const note of notes) {
      try {
        await this.indexNote(note.id);
        indexed++;
      } catch (error) {
        this.logger.error(`Failed to index note ${note.id}:`, error.message);
        failed.push(note.id);
      }
    }

    this.logger.log(
      `Bulk indexed ${indexed}/${notes.length} notes for user ${userId}`,
    );
    return { indexed, failed };
  }

  async deleteNoteFromIndex(noteId: string): Promise<void> {
    if (!this.elasticsearch.isEnabled()) return;

    try {
      await this.elasticsearch.getClient().delete({
        index: NOTES_INDEX,
        id: noteId,
      });
      this.logger.log(`Deleted note ${noteId} from index`);
    } catch (error) {
      // Already gone from the index is fine; anything else should be retried
      if (error?.meta?.statusCode === 404) {
        this.logger.debug(`Note ${noteId} was not in the index`);
        return;
      }
      throw error;
    }
  }
}
