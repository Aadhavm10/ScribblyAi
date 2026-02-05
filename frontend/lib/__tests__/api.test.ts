import { NotesAPI, FoldersAPI } from '../api';

// Mock getSession
jest.mock('next-auth/react', () => ({
  getSession: jest.fn(() =>
    Promise.resolve({
      user: { id: 'user-1', email: 'test@example.com' },
      backendToken: 'mock-token',
    }),
  ),
}));

describe('NotesAPI', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
  });

  describe('getNotes', () => {
    it('should fetch notes with auth headers', async () => {
      const mockNotes = [
        { id: 'note-1', title: 'Test Note', content: 'Content', tags: [] },
      ];

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockNotes),
      });

      const result = await NotesAPI.getNotes();

      expect(result).toEqual(mockNotes);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/notes'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-token',
          }),
        }),
      );
    });

    it('should throw error when fetch fails', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(NotesAPI.getNotes()).rejects.toThrow('Failed to fetch notes');
    });
  });

  describe('getNote', () => {
    it('should fetch a single note by id', async () => {
      const mockNote = {
        id: 'note-1',
        title: 'Test Note',
        content: 'Content',
        tags: [],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockNote),
      });

      const result = await NotesAPI.getNote('note-1');

      expect(result).toEqual(mockNote);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/notes/note-1'),
        expect.any(Object),
      );
    });
  });

  describe('createNote', () => {
    it('should create a note with POST request', async () => {
      const newNote = {
        title: 'New Note',
        content: 'New Content',
        userId: 'user-1',
      };
      const createdNote = { id: 'note-2', ...newNote, tags: [] };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createdNote),
      });

      const result = await NotesAPI.createNote(newNote);

      expect(result).toEqual(createdNote);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/notes'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(newNote),
        }),
      );
    });
  });

  describe('updateNote', () => {
    it('should update a note with PUT request', async () => {
      const updates = { title: 'Updated Title' };
      const updatedNote = {
        id: 'note-1',
        title: 'Updated Title',
        content: 'Content',
        tags: [],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(updatedNote),
      });

      const result = await NotesAPI.updateNote('note-1', updates);

      expect(result).toEqual(updatedNote);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/notes/note-1'),
        expect.objectContaining({
          method: 'PUT',
        }),
      );
    });
  });

  describe('deleteNote', () => {
    it('should delete a note with DELETE request', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'note-1' }),
      });

      await NotesAPI.deleteNote('note-1');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/notes/note-1'),
        expect.objectContaining({
          method: 'DELETE',
        }),
      );
    });
  });
});

describe('FoldersAPI', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
  });

  describe('getFolders', () => {
    it('should fetch folders', async () => {
      const mockFolders = [
        { id: 'folder-1', name: 'My Folder', _count: { notes: 5, children: 0 } },
      ];

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockFolders),
      });

      const result = await FoldersAPI.getFolders();

      expect(result).toEqual(mockFolders);
    });
  });

  describe('createFolder', () => {
    it('should create a folder', async () => {
      const newFolder = { name: 'New Folder', userId: 'user-1' };
      const createdFolder = { id: 'folder-2', ...newFolder };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createdFolder),
      });

      const result = await FoldersAPI.createFolder(newFolder);

      expect(result).toEqual(createdFolder);
    });
  });
});
