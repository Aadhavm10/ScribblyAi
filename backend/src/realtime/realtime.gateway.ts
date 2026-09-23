import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MetricsService } from '../metrics/metrics.service';

interface JoinNotePayload {
  noteId: string;
  userId: string;
  userName: string;
  userEmail: string;
}

interface NoteUpdatePayload {
  noteId: string;
  userId: string;
  title?: string;
  content?: string;
  cursorPosition?: number;
}

@WebSocketGateway({
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? ['https://scribbly-ai.vercel.app', /\.vercel\.app$/]
      : [/localhost:\d+$/],
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);
  private activeUsers = new Map<string, Set<string>>(); // noteId -> Set of socketIds

  constructor(
    private prisma: PrismaService,
    private metrics: MetricsService,
  ) {}

  async handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
    this.metrics.activeConnections.inc();
  }

  async handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    this.metrics.activeConnections.dec();
    
    // Clean up active sessions
    try {
      const session = await this.prisma.noteSession.findUnique({
        where: { socketId: client.id },
      });

      if (session) {
        // Mark session as inactive
        await this.prisma.noteSession.update({
          where: { socketId: client.id },
          data: { isActive: false },
        });

        // Remove from active users map
        const noteUsers = this.activeUsers.get(session.noteId);
        if (noteUsers) {
          noteUsers.delete(client.id);
          if (noteUsers.size === 0) {
            this.activeUsers.delete(session.noteId);
          }
        }

        // Notify other users
        this.server.to(session.noteId).emit('user-left', {
          userId: session.userId,
          userName: session.userName,
          noteId: session.noteId,
        });
      }
    } catch (error) {
      this.logger.error('Error handling disconnect:', error);
    }
  }

  @SubscribeMessage('join-note')
  async handleJoinNote(
    @MessageBody() data: JoinNotePayload,
    @ConnectedSocket() client: Socket,
  ) {
    const { noteId, userId, userName, userEmail } = data;

    try {
      // Join the note room
      client.join(noteId);

      // Track active users
      if (!this.activeUsers.has(noteId)) {
        this.activeUsers.set(noteId, new Set());
      }
      this.activeUsers.get(noteId)!.add(client.id);

      // Create or update session in database
      await this.prisma.noteSession.upsert({
        where: { socketId: client.id },
        create: {
          noteId,
          userId,
          userName,
          userEmail,
          socketId: client.id,
          isActive: true,
        },
        update: {
          noteId,
          isActive: true,
          lastSeen: new Date(),
        },
      });

      // Get all active users for this note
      const activeSessions = await this.prisma.noteSession.findMany({
        where: {
          noteId,
          isActive: true,
        },
        select: {
          userId: true,
          userName: true,
          userEmail: true,
        },
      });

      // Notify others that a new user joined
      client.to(noteId).emit('user-joined', {
        userId,
        userName,
        userEmail,
      });

      // Send current active users to the joining client
      client.emit('active-users', {
        users: activeSessions,
      });

      this.logger.log(`User ${userName} joined note ${noteId}`);
    } catch (error) {
      this.logger.error('Error joining note:', error);
      client.emit('error', { message: 'Failed to join note' });
    }
  }

  @SubscribeMessage('leave-note')
  async handleLeaveNote(
    @MessageBody() data: { noteId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { noteId } = data;

    try {
      client.leave(noteId);

      // Update session
      const session = await this.prisma.noteSession.findUnique({
        where: { socketId: client.id },
      });

      if (session) {
        await this.prisma.noteSession.update({
          where: { socketId: client.id },
          data: { isActive: false },
        });

        // Remove from active users
        const noteUsers = this.activeUsers.get(noteId);
        if (noteUsers) {
          noteUsers.delete(client.id);
        }

        // Notify others
        client.to(noteId).emit('user-left', {
          userId: session.userId,
          userName: session.userName,
        });
      }

      this.logger.log(`User left note ${noteId}`);
    } catch (error) {
      this.logger.error('Error leaving note:', error);
    }
  }

  @SubscribeMessage('note-update')
  async handleNoteUpdate(
    @MessageBody() data: NoteUpdatePayload,
    @ConnectedSocket() client: Socket,
  ) {
    const { noteId, userId, title, content, cursorPosition } = data;

    try {
      // Store edit in database for analytics
      await this.prisma.noteEdit.create({
        data: {
          noteId,
          userId,
          title: title || '',
          content: content || '',
          editType: 'update',
          metadata: {
            cursorPosition,
            timestamp: new Date().toISOString(),
          },
        },
      });

      // Broadcast to all other users in the note room (except sender)
      client.to(noteId).emit('note-updated', {
        noteId,
        userId,
        title,
        content,
        cursorPosition,
        timestamp: Date.now(),
      });

      this.logger.debug(`Note ${noteId} updated by user ${userId}`);
    } catch (error) {
      this.logger.error('Error handling note update:', error);
    }
  }

  @SubscribeMessage('cursor-move')
  async handleCursorMove(
    @MessageBody() data: { noteId: string; userId: string; position: number },
    @ConnectedSocket() client: Socket,
  ) {
    const { noteId, userId, position } = data;

    // Broadcast cursor position to other users (lightweight, no DB write)
    client.to(noteId).emit('cursor-moved', {
      userId,
      position,
    });
  }

  @SubscribeMessage('typing-indicator')
  async handleTypingIndicator(
    @MessageBody() data: { noteId: string; userId: string; isTyping: boolean },
    @ConnectedSocket() client: Socket,
  ) {
    const { noteId, userId, isTyping } = data;

    // Broadcast typing indicator
    client.to(noteId).emit('user-typing', {
      userId,
      isTyping,
    });
  }
}

