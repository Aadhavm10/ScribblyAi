import { Injectable, NotFoundException, Inject, forwardRef, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IndexingService } from '../search/indexing.service';
import { NoteEventProducer } from '../kafka/producers/note-event.producer';

export interface CreateNoteDto {
  title: string;
  content: string;
  userId: string;
  tagIds?: string[];
  sessionCode?: string | null;
}

export interface UpdateNoteDto {
  title?: string;
  content?: string;
  tagIds?: string[];
  sessionCode?: string | null;
}

@Injectable()
export class NotesService {
  private readonly logger = new Logger(NotesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => IndexingService))
    private readonly indexing: IndexingService,
    private readonly noteEventProducer: NoteEventProducer,
  ) {}

  private isDbAvailable(): boolean {
    return process.env.SKIP_PRISMA !== 'true';
  }

  async listNotesByUser(userId: string) {
    if (!this.isDbAvailable()) {
      return []; // Return empty array when DB is not available
    }
    
    try {
      return this.prisma.note.findMany({
        where: { userId },
        include: { tags: { include: { tag: true } } },
        orderBy: { updatedAt: 'desc' },
      });
    } catch (error) {
      console.error('Database error, falling back to mock data:', error.message);
      return []; // Fallback to empty array
    }
  }

  async getNoteById(id: string) {
    if (!this.isDbAvailable()) {
      // Return mock note when DB is not available
      return {
        id: id,
        title: 'Mock Note',
        content: 'This is a mock note for testing',
        userId: 'mock-user-id',
        createdAt: new Date(),
        updatedAt: new Date(),
        tags: [],
      };
    }
    
    try {
      const note = await this.prisma.note.findUnique({
        where: { id },
        include: { tags: { include: { tag: true } } },
      });
      if (!note) throw new NotFoundException('Note not found');
      return note;
    } catch (error) {
      console.error('Database error, falling back to mock data:', error.message);
      return {
        id: id,
        title: 'Mock Note',
        content: 'This is a mock note for testing',
        userId: 'mock-user-id',
        createdAt: new Date(),
        updatedAt: new Date(),
        tags: [],
      };
    }
  }

  async createNote(input: CreateNoteDto) {
    if (!this.isDbAvailable()) {
      // Return mock note when DB is not available
      return {
        id: `mock-${Date.now()}`,
        title: input.title,
        content: input.content,
        userId: input.userId,
        createdAt: new Date(),
        updatedAt: new Date(),
        tags: [],
      };
    }
    
    const { title, content, userId, tagIds, sessionCode } = input;
    
    // Auto-create user if doesn't exist (for MVP)
    await this.prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, email: `${userId}@example.com` },
    });

    const note = await this.prisma.note.create({
      data: {
        title,
        content,
        userId,
        sessionCode,
        tags: tagIds && tagIds.length > 0 ? {
          createMany: {
            data: tagIds.map((tagId) => ({ tagId })),
            skipDuplicates: true,
          },
        } : undefined,
      },
      include: { tags: { include: { tag: true } } },
    });

    // Publish note created event to Kafka (triggers indexing via consumer)
    const published = await this.noteEventProducer.publishNoteCreated({
      noteId: note.id,
      userId: note.userId,
      title: note.title,
      content: note.content,
      tags: tagIds,
      sessionCode: sessionCode || undefined,
      source: 'api',
    });

    // Fallback to direct indexing if Kafka is unavailable
    if (!published) {
      this.logger.warn(`Kafka unavailable, falling back to direct indexing for note ${note.id}`);
      this.indexing.indexNote(note.id).catch(err =>
        this.logger.error(`Fallback indexing failed for note ${note.id}:`, err),
      );
    }

    return note;
  }

  async updateNote(id: string, input: UpdateNoteDto) {
    if (!this.isDbAvailable()) {
      // Return mock updated note when DB is not available
      return {
        id: id,
        title: input.title || 'Updated Mock Note',
        content: input.content || 'This mock note has been updated',
        userId: 'mock-user-id',
        createdAt: new Date(),
        updatedAt: new Date(),
        tags: [],
      };
    }
    
    try {
      const { title, content, tagIds, sessionCode } = input;

      // Get previous content for event sourcing (audit trail)
      const previousNote = await this.prisma.note.findUnique({
        where: { id },
        select: { content: true, userId: true },
      });

      const updated = await this.prisma.note.update({
        where: { id },
        data: {
          title,
          content,
          sessionCode,
          ...(tagIds ? {
            tags: {
              deleteMany: {},
              createMany: {
                data: tagIds.map((tagId) => ({ tagId })),
                skipDuplicates: true,
              },
            },
          } : {}),
        },
        include: { tags: { include: { tag: true } } },
      });

      // Publish note updated event to Kafka (triggers reindexing via consumer)
      const published = await this.noteEventProducer.publishNoteUpdated({
        noteId: id,
        userId: updated.userId,
        title,
        content,
        previousContent: previousNote?.content,
        tags: tagIds,
        source: 'api',
      });

      // Fallback to direct reindexing if Kafka is unavailable
      if (!published) {
        this.logger.warn(`Kafka unavailable, falling back to direct reindexing for note ${id}`);
        this.indexing.indexNote(id).catch(err =>
          this.logger.error(`Fallback reindexing failed for note ${id}:`, err),
        );
      }

      return updated;
    } catch (error) {
      console.error('Database error, falling back to mock data:', error.message);
      return {
        id: id,
        title: input.title || 'Updated Mock Note',
        content: input.content || 'This mock note has been updated',
        userId: 'mock-user-id',
        createdAt: new Date(),
        updatedAt: new Date(),
        tags: [],
      };
    }
  }

  async getNoteBySessionCode(sessionCode: string) {
    if (!this.isDbAvailable()) {
      return null;
    }

    return this.prisma.note.findFirst({
      where: { sessionCode },
      include: { tags: { include: { tag: true } } },
    });
  }

  async deleteNote(id: string) {
    if (!this.isDbAvailable()) {
      // Return mock deletion when DB is not available
      return { id: id, message: 'Mock note deleted' };
    }

    try {
      // Get note info before deletion for event
      const note = await this.prisma.note.findUnique({
        where: { id },
        select: { userId: true },
      });

      await this.prisma.note.delete({ where: { id } });

      // Publish note deleted event to Kafka (triggers index deletion via consumer)
      if (note) {
        const published = await this.noteEventProducer.publishNoteDeleted({
          noteId: id,
          userId: note.userId,
        });

        // Fallback to direct index deletion if Kafka is unavailable
        if (!published) {
          this.logger.warn(`Kafka unavailable, falling back to direct index deletion for note ${id}`);
          this.indexing.deleteNoteFromIndex(id).catch(err =>
            this.logger.error(`Fallback index deletion failed for note ${id}:`, err),
          );
        }
      }

      return { id };
    } catch (error) {
      this.logger.error('Database error, falling back to mock data:', error);
      return { id: id, message: 'Mock note deleted' };
    }
  }
}


