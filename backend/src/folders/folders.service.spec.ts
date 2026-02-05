import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { FoldersService } from './folders.service';
import { PrismaService } from '../prisma/prisma.service';
import { createMockPrismaService } from '../test/mock-factory';
import { mockFolder, mockSubFolder, createFolderDto } from '../test/fixtures';

describe('FoldersService', () => {
  let service: FoldersService;
  let prisma: ReturnType<typeof createMockPrismaService>;

  beforeEach(async () => {
    prisma = createMockPrismaService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FoldersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<FoldersService>(FoldersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createFolder', () => {
    it('should create a folder', async () => {
      const folderWithCount = { ...mockFolder, _count: { notes: 0, children: 0 } };
      prisma.folder.create.mockResolvedValue(folderWithCount);

      const result = await service.createFolder(createFolderDto);

      expect(result).toEqual(folderWithCount);
      expect(prisma.folder.create).toHaveBeenCalledWith({
        data: {
          name: createFolderDto.name,
          color: undefined,
          icon: undefined,
          parentId: createFolderDto.parentId,
          userId: createFolderDto.userId,
        },
        include: {
          _count: {
            select: { notes: true, children: true },
          },
        },
      });
    });

    it('should create a subfolder with parentId', async () => {
      const subFolderDto = { ...createFolderDto, parentId: 'folder-1' };
      const subFolderWithCount = { ...mockSubFolder, _count: { notes: 0, children: 0 } };
      prisma.folder.create.mockResolvedValue(subFolderWithCount);

      const result = await service.createFolder(subFolderDto);

      expect(result.parentId).toBe('folder-1');
    });
  });

  describe('getFolders', () => {
    it('should return all folders for a user', async () => {
      const foldersWithCounts = [
        { ...mockFolder, _count: { notes: 5, children: 1 }, parent: null },
        { ...mockSubFolder, _count: { notes: 3, children: 0 }, parent: mockFolder },
      ];
      prisma.folder.findMany.mockResolvedValue(foldersWithCounts);

      const result = await service.getFolders('user-1');

      expect(result).toEqual(foldersWithCounts);
      expect(prisma.folder.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        include: {
          _count: {
            select: { notes: true, children: true },
          },
          parent: true,
        },
        orderBy: [{ createdAt: 'asc' }],
      });
    });

    it('should return empty array when no folders', async () => {
      prisma.folder.findMany.mockResolvedValue([]);

      const result = await service.getFolders('user-1');

      expect(result).toEqual([]);
    });
  });

  describe('getFolderById', () => {
    it('should return folder with notes and children', async () => {
      const folderWithDetails = {
        ...mockFolder,
        notes: [],
        children: [],
        parent: null,
        _count: { notes: 0, children: 0 },
      };
      prisma.folder.findUnique.mockResolvedValue(folderWithDetails);

      const result = await service.getFolderById('folder-1');

      expect(result).toEqual(folderWithDetails);
    });

    it('should throw NotFoundException when folder not found', async () => {
      prisma.folder.findUnique.mockResolvedValue(null);

      await expect(service.getFolderById('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateFolder', () => {
    it('should update folder name', async () => {
      const updatedFolder = {
        ...mockFolder,
        name: 'Updated Name',
        _count: { notes: 5, children: 0 },
      };
      prisma.folder.update.mockResolvedValue(updatedFolder);

      const result = await service.updateFolder('folder-1', { name: 'Updated Name' });

      expect(result.name).toBe('Updated Name');
    });

    it('should update folder parent (move folder)', async () => {
      const movedFolder = {
        ...mockFolder,
        parentId: 'folder-2',
        _count: { notes: 5, children: 0 },
      };
      prisma.folder.update.mockResolvedValue(movedFolder);

      const result = await service.updateFolder('folder-1', { parentId: 'folder-2' });

      expect(result.parentId).toBe('folder-2');
    });

    it('should throw NotFoundException when folder not found', async () => {
      prisma.folder.update.mockRejectedValue(new Error('Record not found'));

      await expect(
        service.updateFolder('nonexistent', { name: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteFolder', () => {
    it('should delete a folder and return its id', async () => {
      prisma.folder.delete.mockResolvedValue(mockFolder);

      const result = await service.deleteFolder('folder-1');

      expect(result).toEqual({ id: 'folder-1' });
      expect(prisma.folder.delete).toHaveBeenCalledWith({
        where: { id: 'folder-1' },
      });
    });

    it('should throw NotFoundException when folder not found', async () => {
      prisma.folder.delete.mockRejectedValue(new Error('Record not found'));

      await expect(service.deleteFolder('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getFolderTree', () => {
    it('should build folder tree structure', async () => {
      const flatFolders = [
        { ...mockFolder, _count: { notes: 5, children: 1 } },
        { ...mockSubFolder, _count: { notes: 3, children: 0 } },
      ];
      prisma.folder.findMany.mockResolvedValue(flatFolders);

      const result = await service.getFolderTree('user-1');

      // Root folder should contain subfolder as child
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('folder-1');
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children[0].id).toBe('folder-2');
    });

    it('should return empty array when no folders', async () => {
      prisma.folder.findMany.mockResolvedValue([]);

      const result = await service.getFolderTree('user-1');

      expect(result).toEqual([]);
    });

    it('should handle multiple root folders', async () => {
      const rootFolders = [
        { ...mockFolder, id: 'root-1', parentId: null, _count: { notes: 1, children: 0 } },
        { ...mockFolder, id: 'root-2', parentId: null, _count: { notes: 2, children: 0 } },
      ];
      prisma.folder.findMany.mockResolvedValue(rootFolders);

      const result = await service.getFolderTree('user-1');

      expect(result).toHaveLength(2);
    });
  });

  describe('moveNotesToFolder', () => {
    it('should move notes to a folder', async () => {
      prisma.note.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.moveNotesToFolder(
        ['note-1', 'note-2', 'note-3'],
        'folder-1',
      );

      expect(result).toEqual({ success: true, count: 3 });
      expect(prisma.note.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['note-1', 'note-2', 'note-3'] } },
        data: { folderId: 'folder-1' },
      });
    });

    it('should move notes out of folder (to root)', async () => {
      prisma.note.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.moveNotesToFolder(['note-1', 'note-2'], null);

      expect(result).toEqual({ success: true, count: 2 });
      expect(prisma.note.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['note-1', 'note-2'] } },
        data: { folderId: null },
      });
    });
  });
});
