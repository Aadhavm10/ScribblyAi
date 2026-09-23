import { ConfigService } from '@nestjs/config';
import { GoogleAuth } from 'google-auth-library';
import { VertexAiService } from './vertex-ai.service';

jest.mock('google-auth-library');
jest.mock('@google-cloud/vertexai', () => ({
  VertexAI: jest.fn().mockImplementation(() => ({
    preview: { getGenerativeModel: jest.fn() },
  })),
}));

const configWith = (values: Record<string, string>) =>
  ({ get: jest.fn((key: string) => values[key]) }) as unknown as ConfigService;

describe('VertexAiService.generateEmbedding', () => {
  const request = jest.fn();
  const vector = new Array(768).fill(0.25);

  beforeEach(() => {
    (GoogleAuth as unknown as jest.Mock).mockImplementation(() => ({
      request,
    }));
    request.mockResolvedValue({
      data: { predictions: [{ embeddings: { values: vector } }] },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const configuredService = (extra: Record<string, string> = {}) =>
    new VertexAiService(
      configWith({
        GCP_PROJECT_ID: 'my-project',
        VERTEX_AI_LOCATION: 'us-central1',
        ...extra,
      }),
    );

  it('calls the text-embedding-004 predict endpoint with the task type', async () => {
    const result = await configuredService().generateEmbedding(
      'Q3 roadmap',
      'RETRIEVAL_QUERY',
    );

    expect(result).toBe(vector);
    expect(request).toHaveBeenCalledWith({
      url:
        'https://us-central1-aiplatform.googleapis.com/v1/projects/my-project' +
        '/locations/us-central1/publishers/google/models/text-embedding-004:predict',
      method: 'POST',
      data: {
        instances: [{ content: 'Q3 roadmap', task_type: 'RETRIEVAL_QUERY' }],
        parameters: { outputDimensionality: 768, autoTruncate: true },
      },
    });
  });

  it('uses EMBEDDING_MODEL when set', async () => {
    await configuredService({
      EMBEDDING_MODEL: 'text-embedding-005',
    }).generateEmbedding('hi');

    expect(request.mock.calls[0][0].url).toContain(
      '/models/text-embedding-005:predict',
    );
  });

  it('embeds as a document by default', async () => {
    await configuredService().generateEmbedding('note body');

    expect(request.mock.calls[0][0].data.instances[0].task_type).toBe(
      'RETRIEVAL_DOCUMENT',
    );
  });

  it('returns null without calling the API when Vertex AI is not configured', async () => {
    const service = new VertexAiService(configWith({}));

    await expect(service.generateEmbedding('Q3 roadmap')).resolves.toBeNull();
    expect(request).not.toHaveBeenCalled();
  });

  it('returns null for blank text', async () => {
    await expect(
      configuredService().generateEmbedding('  \n\n '),
    ).resolves.toBeNull();
    expect(request).not.toHaveBeenCalled();
  });

  it('throws when the response has the wrong dimensions', async () => {
    request.mockResolvedValue({
      data: { predictions: [{ embeddings: { values: [0.1, 0.2] } }] },
    });

    await expect(
      configuredService().generateEmbedding('Q3 roadmap'),
    ).rejects.toThrow('expected 768 values, got 2');
  });

  it('propagates API errors', async () => {
    request.mockRejectedValue(new Error('PERMISSION_DENIED'));

    await expect(
      configuredService().generateEmbedding('Q3 roadmap'),
    ).rejects.toThrow('PERMISSION_DENIED');
  });
});
