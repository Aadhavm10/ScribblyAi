import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { google } from 'googleapis';
import crypto from 'crypto';
import { ElasticsearchService } from '../elasticsearch/elasticsearch.service';
import { VertexAiService } from '../vertex-ai/vertex-ai.service';

interface UpsertInput {
  userId: string;
  provider: 'google';
  accessToken: string;
  refreshToken: string;
  expiresAt: string; // ISO
  scopes: string[];
}

@Injectable()
export class GoogleService {
  private readonly logger = new Logger(GoogleService.name);
  private readonly encKey: Buffer | null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly es: ElasticsearchService,
    private readonly vertex: VertexAiService,
  ) {
    const keyB64 = this.config.get<string>('TOKEN_ENCRYPTION_KEY');
    this.encKey = keyB64 ? Buffer.from(keyB64, 'base64') : null;
  }

  private isDbAvailable(): boolean {
    return process.env.SKIP_PRISMA !== 'true';
  }

  private encrypt(plain: string): string {
    if (!this.encKey) return plain;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encKey, iv);
    const enc = Buffer.concat([cipher.update(Buffer.from(plain, 'utf8')), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]).toString('base64');
  }

  private decrypt(b64: string): string {
    if (!this.encKey) return b64;
    const buf = Buffer.from(b64, 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encKey, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(data), decipher.final()]);
    return dec.toString('utf8');
  }

  async upsertSourceAccount(input: UpsertInput) {
    if (!this.isDbAvailable()) {
      this.logger.warn('Mock mode: skipping token persistence');
      return;
    }
    await this.prisma.sourceAccount.upsert({
      where: {
        // No unique compound in model; emulate with first or create
        id: (
          await this.prisma.sourceAccount.findFirst({
            where: { userId: input.userId, provider: 'google' },
          })
        )?.id ?? 'new',
      },
      update: {
        accessToken: this.encrypt(input.accessToken),
        refreshToken: this.encrypt(input.refreshToken),
        expiresAt: new Date(input.expiresAt),
        scopes: input.scopes,
      },
      create: {
        userId: input.userId,
        provider: 'google',
        accessToken: this.encrypt(input.accessToken),
        refreshToken: this.encrypt(input.refreshToken),
        expiresAt: new Date(input.expiresAt),
        scopes: input.scopes,
      },
    }).catch(async (e) => {
      // Fallback create if upsert fails because of placeholder id
      if (String(e?.message || '').includes('Record to update not found')) {
        await this.prisma.sourceAccount.create({
          data: {
            userId: input.userId,
            provider: 'google',
            accessToken: this.encrypt(input.accessToken),
            refreshToken: this.encrypt(input.refreshToken),
            expiresAt: new Date(input.expiresAt),
            scopes: input.scopes,
          },
        });
        return;
      }
      throw e;
    });
  }

  private async getOAuth2Client(userId: string) {
    if (!this.isDbAvailable()) throw new Error('DB unavailable in mock mode');
    const acct = await this.prisma.sourceAccount.findFirst({ where: { userId, provider: 'google' } });
    if (!acct) throw new Error('Google account not connected');
    const oAuth2Client = new google.auth.OAuth2(
      this.config.get<string>('GOOGLE_CLIENT_ID'),
      this.config.get<string>('GOOGLE_CLIENT_SECRET'),
    );
    oAuth2Client.setCredentials({
      access_token: this.decrypt(acct.accessToken),
      refresh_token: this.decrypt(acct.refreshToken),
      expiry_date: acct.expiresAt.getTime(),
    });
    return oAuth2Client;
  }

  async sync(userId: string, sources?: string[]) {
    const target = new Set((sources && sources.length ? sources : ['gmail', 'drive', 'docs']).map(s => s.toLowerCase()));
    const stats = { gmail: 0, drive: 0, docs: 0 } as Record<string, number>;
    try {
      const auth = await this.getOAuth2Client(userId);

      if (target.has('gmail')) {
        const items = await this.syncGmail(userId, auth);
        stats.gmail = items;
      }
      if (target.has('drive')) {
        const items = await this.syncDrive(userId, auth);
        stats.drive = items;
      }
      if (target.has('docs')) {
        const items = await this.syncDocs(userId, auth);
        stats.docs = items;
      }

      await this.prisma.sourceAccount.updateMany({
        where: { userId, provider: 'google' },
        data: { lastSyncedAt: new Date() },
      });
    } catch (e) {
      this.logger.error('Sync failed', e as any);
      throw e;
    }
    return stats;
  }

  private async indexNormalizedItem(userId: string, doc: { id: string; title?: string; content?: string; provider: string; itemType: string; mimeType?: string; webViewUrl?: string; modifiedAt?: Date; }) {
    if (!this.es.isEnabled()) return;
    const embedding = await this.vertex.generateEmbedding(
      `${doc.title ?? ''}\n\n${doc.content ?? ''}`,
      'RETRIEVAL_DOCUMENT',
    );
    const client = this.es.getClient();
    await client.index({
      index: 'notes',
      id: `${doc.provider}:${userId}:${doc.id}`,
      document: {
        noteId: `${doc.provider}:${doc.id}`,
        userId,
        title: doc.title ?? '',
        content: doc.content ?? '',
        provider: doc.provider,
        itemType: doc.itemType,
        mimeType: doc.mimeType ?? null,
        webViewUrl: doc.webViewUrl ?? null,
        ...(embedding && { content_embedding: embedding }),
        updatedAt: (doc.modifiedAt ?? new Date()).toISOString(),
        createdAt: new Date().toISOString(),
      },
    });
  }

  private async syncGmail(userId: string, auth: any): Promise<number> {
    const gmail = google.gmail({ version: 'v1', auth });
    const list = await gmail.users.messages.list({ userId: 'me', q: 'newer_than:30d', maxResults: 50 });
    const messages = list.data.messages ?? [];
    let count = 0;
    for (const m of messages) {
      if (!m.id) continue;
      const full = await gmail.users.messages.get({ userId: 'me', id: m.id, format: 'full' });
      const headers = full.data.payload?.headers ?? [];
      const subject = headers.find(h => h.name?.toLowerCase() === 'subject')?.value ?? '(no subject)';
      const body = this.extractPlainText(full.data.payload);
      await this.indexNormalizedItem(userId, {
        id: m.id,
        title: subject,
        content: body,
        provider: 'gmail',
        itemType: 'email',
        webViewUrl: `https://mail.google.com/mail/u/0/#inbox/${m.id}`,
        modifiedAt: full.data.internalDate ? new Date(Number(full.data.internalDate)) : new Date(),
      });
      count++;
    }
    return count;
  }

  private extractPlainText(payload: any): string {
    const walk = (p: any): string => {
      if (!p) return '';
      if (p.mimeType === 'text/plain' && p.body?.data) {
        const b = p.body.data.replace(/-/g, '+').replace(/_/g, '/');
        return Buffer.from(b, 'base64').toString('utf8');
      }
      if (Array.isArray(p.parts)) {
        for (const part of p.parts) {
          const t = walk(part);
          if (t) return t;
        }
      }
      return '';
    };
    return walk(payload);
  }

  private async syncDrive(userId: string, auth: any): Promise<number> {
    const drive = google.drive({ version: 'v3', auth });
    const res = await drive.files.list({
      q: "mimeType != 'application/vnd.google-apps.folder' and trashed = false",
      fields: 'files(id, name, mimeType, modifiedTime, webViewLink)',
      pageSize: 50,
    });
    let count = 0;
    for (const f of res.data.files ?? []) {
      if (!f.id) continue;
      let content = '';
      if (f.mimeType?.startsWith('application/vnd.google-apps.document')) {
        const exported = await drive.files.export({ fileId: f.id, mimeType: 'text/plain' }, { responseType: 'text' as any });
        content = (exported.data as any) ?? '';
      } else if (f.mimeType?.startsWith('text/')) {
        // Skip fetching raw file content for non-Google files in hackathon scope
      }
      await this.indexNormalizedItem(userId, {
        id: f.id,
        title: f.name ?? 'Untitled',
        content,
        provider: 'drive',
        itemType: 'file',
        mimeType: f.mimeType ?? undefined,
        webViewUrl: f.webViewLink ?? undefined,
        modifiedAt: f.modifiedTime ? new Date(f.modifiedTime) : new Date(),
      });
      count++;
    }
    return count;
  }

  private async syncDocs(userId: string, auth: any): Promise<number> {
    // Docs are already covered through Drive export above; keep a small placeholder
    return 0;
  }
}


