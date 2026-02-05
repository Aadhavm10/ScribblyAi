/**
 * Test fixtures - sample data for testing
 */

// Users
export const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  image: 'https://example.com/avatar.jpg',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

export const mockUser2 = {
  id: 'user-2',
  email: 'test2@example.com',
  name: 'Test User 2',
  image: null,
  createdAt: new Date('2024-01-02'),
  updatedAt: new Date('2024-01-02'),
};

// Tags
export const mockTag = {
  id: 'tag-1',
  name: 'important',
  color: '#ff0000',
  userId: 'user-1',
  createdAt: new Date('2024-01-01'),
};

export const mockTag2 = {
  id: 'tag-2',
  name: 'work',
  color: '#00ff00',
  userId: 'user-1',
  createdAt: new Date('2024-01-01'),
};

// Notes
export const mockNote = {
  id: 'note-1',
  title: 'Test Note',
  content: 'This is test content for the note.',
  userId: 'user-1',
  folderId: null,
  sessionCode: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  tags: [],
};

export const mockNoteWithTags = {
  ...mockNote,
  id: 'note-2',
  title: 'Note with Tags',
  tags: [
    { tagId: 'tag-1', noteId: 'note-2', tag: mockTag },
    { tagId: 'tag-2', noteId: 'note-2', tag: mockTag2 },
  ],
};

export const mockNoteWithSession = {
  ...mockNote,
  id: 'note-3',
  title: 'Collaborative Note',
  sessionCode: 'ABC123',
};

// Folders
export const mockFolder = {
  id: 'folder-1',
  name: 'My Folder',
  userId: 'user-1',
  parentId: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

export const mockSubFolder = {
  id: 'folder-2',
  name: 'Sub Folder',
  userId: 'user-1',
  parentId: 'folder-1',
  createdAt: new Date('2024-01-02'),
  updatedAt: new Date('2024-01-02'),
};

// Calendars
export const mockCalendar = {
  id: 'calendar-1',
  name: 'My Calendar',
  color: '#4285f4',
  isDefault: true,
  userId: 'user-1',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

// Calendar Events
export const mockEvent = {
  id: 'event-1',
  title: 'Team Meeting',
  description: 'Weekly team sync',
  startTime: new Date('2024-01-15T10:00:00'),
  endTime: new Date('2024-01-15T11:00:00'),
  isAllDay: false,
  location: 'Conference Room A',
  calendarId: 'calendar-1',
  userId: 'user-1',
  recurrenceRule: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

export const mockRecurringEvent = {
  ...mockEvent,
  id: 'event-2',
  title: 'Daily Standup',
  recurrenceRule: 'FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR',
};

// Search Results
export const mockSearchResult = {
  noteId: 'note-1',
  title: 'Test Note',
  content: 'This is test content for the note.',
  score: 0.95,
  excerpt: '...test content for the...',
};

// Conversations
export const mockConversation = {
  id: 'conv-1',
  userId: 'user-1',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  messages: [],
};

export const mockConversationMessage = {
  id: 'msg-1',
  conversationId: 'conv-1',
  role: 'user' as const,
  content: 'What did I write about meetings?',
  createdAt: new Date('2024-01-01'),
};

// JWT Payloads
export const mockJwtPayload = {
  sub: 'user-1',
  email: 'test@example.com',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 86400,
};

// Google OAuth Profile
export const mockGoogleProfile = {
  id: 'google-123',
  emails: [{ value: 'test@gmail.com', verified: true }],
  displayName: 'Test User',
  photos: [{ value: 'https://lh3.googleusercontent.com/test' }],
};

// API Request bodies
export const createNoteDto = {
  title: 'New Note',
  content: 'New note content',
  userId: 'user-1',
  tagIds: ['tag-1'],
};

export const updateNoteDto = {
  title: 'Updated Title',
  content: 'Updated content',
};

export const createFolderDto = {
  name: 'New Folder',
  userId: 'user-1',
  parentId: null,
};

export const createEventDto = {
  title: 'New Event',
  startTime: new Date('2024-02-01T09:00:00'),
  endTime: new Date('2024-02-01T10:00:00'),
  calendarId: 'calendar-1',
  userId: 'user-1',
};
