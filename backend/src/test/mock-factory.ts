/**
 * Centralized mock factory for testing
 * Provides mock implementations of all services
 */

// Mock PrismaService
export const createMockPrismaService = () => ({
  note: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
  },
  folder: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  tag: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  noteTag: {
    createMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  calendar: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  calendarEvent: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  search: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
  conversation: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  conversationMessage: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
  $connect: jest.fn(),
  $disconnect: jest.fn(),
  $queryRaw: jest.fn(),
});

// Mock IndexingService
export const createMockIndexingService = () => ({
  indexNote: jest.fn().mockResolvedValue(undefined),
  deleteNoteFromIndex: jest.fn().mockResolvedValue(undefined),
  searchNotes: jest.fn().mockResolvedValue([]),
});

// Mock NoteEventProducer
export const createMockNoteEventProducer = () => ({
  publishNoteCreated: jest.fn().mockResolvedValue(true),
  publishNoteUpdated: jest.fn().mockResolvedValue(true),
  publishNoteDeleted: jest.fn().mockResolvedValue(true),
});

// Mock JwtService
export const createMockJwtService = () => ({
  sign: jest.fn().mockReturnValue('mock-jwt-token'),
  signAsync: jest.fn().mockResolvedValue('mock-jwt-token'),
  verify: jest.fn().mockReturnValue({ sub: 'user-1', email: 'test@example.com' }),
  verifyAsync: jest.fn().mockResolvedValue({ sub: 'user-1', email: 'test@example.com' }),
});

// Mock ConfigService
export const createMockConfigService = () => ({
  get: jest.fn((key: string) => {
    const config: Record<string, string> = {
      JWT_SECRET: 'test-secret',
      JWT_EXPIRATION: '1d',
      GOOGLE_CLIENT_ID: 'test-client-id',
      GOOGLE_CLIENT_SECRET: 'test-client-secret',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    };
    return config[key];
  }),
});

// Mock VertexAiService
export const createMockVertexAiService = () => ({
  generateEmbedding: jest.fn().mockResolvedValue(new Array(768).fill(0)),
  generateResponse: jest.fn().mockResolvedValue('Mock AI response'),
});

// Mock ElasticsearchService
export const createMockElasticsearchService = () => ({
  index: jest.fn().mockResolvedValue({ result: 'created' }),
  search: jest.fn().mockResolvedValue({ hits: { hits: [] } }),
  delete: jest.fn().mockResolvedValue({ result: 'deleted' }),
});

// Mock Google Calendar Service
export const createMockGoogleCalendarService = () => ({
  listEvents: jest.fn().mockResolvedValue([]),
  createEvent: jest.fn().mockResolvedValue({ id: 'mock-event-id' }),
  updateEvent: jest.fn().mockResolvedValue({ id: 'mock-event-id' }),
  deleteEvent: jest.fn().mockResolvedValue(undefined),
});

// Type definitions for mocks
export type MockPrismaService = ReturnType<typeof createMockPrismaService>;
export type MockIndexingService = ReturnType<typeof createMockIndexingService>;
export type MockNoteEventProducer = ReturnType<typeof createMockNoteEventProducer>;
export type MockJwtService = ReturnType<typeof createMockJwtService>;
