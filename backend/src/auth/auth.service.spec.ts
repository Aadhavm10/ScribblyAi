import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import {
  createMockPrismaService,
  createMockJwtService,
} from '../test/mock-factory';
import { mockUser, mockGoogleProfile } from '../test/fixtures';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: ReturnType<typeof createMockPrismaService>;
  let jwtService: ReturnType<typeof createMockJwtService>;

  beforeEach(async () => {
    prisma = createMockPrismaService();
    jwtService = createMockJwtService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateGoogleUser', () => {
    it('should create a new user if not exists', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(mockUser);

      const result = await service.validateGoogleUser(mockGoogleProfile);

      expect(result).toEqual(mockUser);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@gmail.com' },
      });
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: 'test@gmail.com',
          name: 'Test User',
          image: 'https://lh3.googleusercontent.com/test',
        },
      });
    });

    it('should update existing user on login', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue({
        ...mockUser,
        name: 'Test User',
        image: 'https://lh3.googleusercontent.com/test',
      });

      const result = await service.validateGoogleUser(mockGoogleProfile);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { email: 'test@gmail.com' },
        data: {
          name: 'Test User',
          image: 'https://lh3.googleusercontent.com/test',
        },
      });
      expect(result).toBeDefined();
    });

    it('should throw error if no email in profile', async () => {
      const profileWithoutEmail = { ...mockGoogleProfile, emails: [] };

      await expect(
        service.validateGoogleUser(profileWithoutEmail),
      ).rejects.toThrow('No email found in Google profile');
    });

    it('should handle profile without photos', async () => {
      const profileWithoutPhoto = { ...mockGoogleProfile, photos: undefined };
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(mockUser);

      await service.validateGoogleUser(profileWithoutPhoto);

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          image: undefined,
        }),
      });
    });
  });

  describe('generateJwt', () => {
    it('should generate a JWT token for user', async () => {
      const result = await service.generateJwt(mockUser);

      expect(result).toBe('mock-jwt-token');
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: mockUser.id,
        email: mockUser.email,
        name: mockUser.name,
      });
    });

    it('should include user name in payload', async () => {
      await service.generateJwt(mockUser);

      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test User',
        }),
      );
    });
  });

  describe('validateUser', () => {
    it('should return user if found', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.validateUser('user-1');

      expect(result).toEqual(mockUser);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
      });
    });

    it('should return null if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.validateUser('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('syncUser', () => {
    it('should create user if not exists', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(mockUser);

      const result = await service.syncUser(
        'test@example.com',
        'Test User',
        'https://example.com/avatar.jpg',
      );

      expect(result).toEqual(mockUser);
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: 'test@example.com',
          name: 'Test User',
          image: 'https://example.com/avatar.jpg',
        },
      });
    });

    it('should update existing user', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue({
        ...mockUser,
        name: 'Updated Name',
      });

      const result = await service.syncUser(
        'test@example.com',
        'Updated Name',
        null,
      );

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
        data: {
          name: 'Updated Name',
          image: mockUser.image, // Should keep existing image if null provided
        },
      });
    });

    it('should handle null name and image', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(mockUser);

      await service.syncUser('test@example.com');

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: 'test@example.com',
          name: null,
          image: null,
        },
      });
    });
  });
});
