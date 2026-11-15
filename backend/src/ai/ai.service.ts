import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface AiSummaryResult {
  summary: string;
  keyPoints: string[];
}

export interface AiRephraseResult {
  rephrased: string;
  style: 'formal' | 'casual' | 'concise';
}

export interface AiTasksResult {
  tasks: Array<{
    task: string;
    priority: 'high' | 'medium' | 'low';
    dueDate?: string;
  }>;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private openai: OpenAI;
  private model: string;

  constructor(private configService: ConfigService) {
    const groqApiKey = this.configService.get<string>('GROQ_API_KEY');
    const groqBaseUrl = this.configService.get<string>('GROQ_BASE_URL') || 'https://api.groq.com/openai/v1';
    // llama3-70b-8192 was shut down by Groq on Aug 30, 2025 and its Llama successors in 2026,
    // so the model is configurable instead of hardcoded.
    this.model =
      this.configService.get<string>('GROQ_MODEL') || 'openai/gpt-oss-120b';

    if (!groqApiKey) {
      this.logger.warn('GROQ_API_KEY not configured. AI features will not work.');
      return;
    }

    // Groq uses OpenAI-compatible API
    this.openai = new OpenAI({
      apiKey: groqApiKey,
      baseURL: groqBaseUrl,
    });

    this.logger.log(`AI service initialized with Groq (${this.model})`);
  }

  /**
   * Model settings shared by every completion. GPT-OSS models reason before answering and
   * Groq counts that against the token limit, so they get low reasoning effort and extra
   * headroom; the answer itself still arrives in message.content.
   */
  private completionOptions(maxTokens: number) {
    const reasoning = this.model.startsWith('openai/gpt-oss');
    return {
      model: this.model,
      max_tokens: reasoning ? maxTokens + 1024 : maxTokens,
      ...(reasoning ? { reasoning_effort: 'low' as const } : {}),
    };
  }

  async summarizeNote(title: string, content: string): Promise<AiSummaryResult> {
    if (!this.openai) {
      this.logger.warn('AI service not configured, returning mock summary');
      return {
        summary: `Mock summary for "${title}": This is a sample summary generated for demonstration purposes. The actual content would be analyzed and summarized using AI.`,
        keyPoints: [
          'This is a mock key point 1',
          'This is a mock key point 2',
          'This is a mock key point 3'
        ]
      };
    }

    this.logger.log(`Summarizing note: ${title.slice(0, 50)}...`);
    
    try {
      const response = await this.openai.chat.completions.create({
        ...this.completionOptions(300),
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that summarizes notes. Provide a brief summary and extract key points as a bulleted list.',
          },
          {
            role: 'user',
            content: `Please summarize this note and extract key points:

Title: ${title}

Content: ${content}

Please respond with:
1. A brief summary (2-3 sentences)
2. Key points as a numbered list

Keep it concise and actionable.`,
          },
        ],
        temperature: 0.3,
      });

      const aiResponse = response.choices[0]?.message?.content || '';
      
      // Parse the response to extract summary and key points
      const lines = aiResponse.split('\n').filter(line => line.trim());
      let summary = '';
      const keyPoints: string[] = [];
      let inKeyPoints = false;

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.match(/^(\d+\.|•|-|\*)/)) {
          inKeyPoints = true;
          keyPoints.push(trimmed.replace(/^(\d+\.|•|-|\*)\s*/, ''));
        } else if (!inKeyPoints && trimmed) {
          summary += (summary ? ' ' : '') + trimmed;
        }
      }

      return {
        summary: summary || aiResponse.slice(0, 200) + '...',
        keyPoints: keyPoints.length > 0 ? keyPoints : [aiResponse.slice(0, 100) + '...'],
      };
    } catch (error) {
      this.logger.error('Failed to summarize note:', error);
      if (error?.response?.data) {
        this.logger.error('API Error details:', error.response.data);
      }
      throw new Error(`Failed to generate summary: ${error.message || 'Unknown error'}`);
    }
  }

  async rephraseText(text: string, style: 'formal' | 'casual' | 'concise'): Promise<AiRephraseResult> {
    if (!this.openai) {
      this.logger.warn('AI service not configured, returning mock rephrased text');
      const mockRephrased = {
        formal: `[Formal] ${text}`,
        casual: `[Casual] ${text}`,
        concise: `[Concise] ${text.substring(0, 50)}...`
      };
      return {
        rephrased: mockRephrased[style],
        style: style
      };
    }

    const stylePrompts = {
      formal: 'Make this text more formal and professional, suitable for business communication.',
      casual: 'Make this text more casual and conversational, as if talking to a friend.',
      concise: 'Make this text more concise and to-the-point while keeping the key information.',
    };

    try {
      const response = await this.openai.chat.completions.create({
        ...this.completionOptions(Math.max(200, text.length * 2)),
        messages: [
          {
            role: 'system',
            content: `You are a writing assistant. ${stylePrompts[style]} Maintain the original meaning and important details.`,
          },
          {
            role: 'user',
            content: `Please rephrase this text in a ${style} style:\n\n${text}`,
          },
        ],
        temperature: 0.4,
      });

      const rephrased = response.choices[0]?.message?.content?.trim() || text;

      return {
        rephrased,
        style,
      };
    } catch (error) {
      this.logger.error('Failed to rephrase text:', error);
      throw new Error('Failed to rephrase text');
    }
  }

  async extractTasks(content: string): Promise<AiTasksResult> {
    if (!this.openai) {
      this.logger.warn('AI service not configured, returning mock tasks');
      return {
        tasks: [
          {
            task: 'Mock task 1: Review the content',
            priority: 'high' as const,
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
          },
          {
            task: 'Mock task 2: Follow up on items',
            priority: 'medium' as const,
            dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
          },
          {
            task: 'Mock task 3: Organize information',
            priority: 'low' as const
          }
        ]
      };
    }

    try {
      const response = await this.openai.chat.completions.create({
        ...this.completionOptions(400),
        messages: [
          {
            role: 'system',
            content: `Extract actionable tasks from text. Return ONLY a JSON array of tasks. Each task should have:
- "task": clear description
- "priority": "high", "medium", or "low"
- "dueDate": if mentioned (YYYY-MM-DD format)

Example: [{"task": "Complete report", "priority": "high"}]`,
          },
          {
            role: 'user',
            content: `Extract tasks from this content:\n\n${content}`,
          },
        ],
        temperature: 0.2,
      });

      const aiResponse = response.choices[0]?.message?.content || '[]';
      
      try {
        // Try to parse as JSON first
        const parsed = JSON.parse(aiResponse);
        if (Array.isArray(parsed)) {
          return { tasks: parsed };
        }
      } catch {
        // If JSON parsing fails, extract tasks manually
        const lines = aiResponse.split('\n').filter(line => line.trim());
        const tasks = [];
        
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.match(/^(\d+\.|•|-|\*)/)) {
            const task = trimmed.replace(/^(\d+\.|•|-|\*)\s*/, '');
            if (task.length > 5) { // Only consider meaningful tasks
              tasks.push({
                task,
                priority: 'medium' as const,
              });
            }
          }
        }
        
        return { tasks };
      }

      return { tasks: [] };
    } catch (error) {
      this.logger.error('Failed to extract tasks:', error);
      throw new Error('Failed to extract tasks');
    }
  }
}
