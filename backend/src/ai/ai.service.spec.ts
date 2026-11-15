import { ConfigService } from '@nestjs/config';
import { AiService } from './ai.service';

interface CompletionParams {
  model: string;
  max_tokens: number;
  reasoning_effort?: string;
}

const create = jest.fn<Promise<unknown>, [CompletionParams]>();

jest.mock('openai', () =>
  jest.fn().mockImplementation(() => ({ chat: { completions: { create } } })),
);

function serviceWith(env: Record<string, string>) {
  const config = { get: (key: string) => env[key] } as unknown as ConfigService;
  return new AiService(config);
}

describe('AiService model selection', () => {
  beforeEach(() => {
    create.mockReset();
    create.mockResolvedValue({
      choices: [{ message: { content: 'A short summary.\n\n1. First point' } }],
    });
  });

  it('defaults to a current Groq model with reasoning headroom', async () => {
    await serviceWith({ GROQ_API_KEY: 'test' }).summarizeNote('Title', 'Body');

    const [params] = create.mock.calls[0];
    expect(params.model).toBe('openai/gpt-oss-120b');
    expect(params.reasoning_effort).toBe('low');
    expect(params.max_tokens).toBe(300 + 1024);
  });

  it('uses GROQ_MODEL when set and keeps the original token limit', async () => {
    const service = serviceWith({
      GROQ_API_KEY: 'test',
      GROQ_MODEL: 'some/other-model',
    });
    await service.summarizeNote('Title', 'Body');

    const [params] = create.mock.calls[0];
    expect(params.model).toBe('some/other-model');
    expect(params.reasoning_effort).toBeUndefined();
    expect(params.max_tokens).toBe(300);
  });
});
