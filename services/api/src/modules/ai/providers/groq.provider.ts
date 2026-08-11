import { LLMProvider, CompletionParams, CompletionResult } from './llm-provider.interface';

/**
 * Groq LLM Provider.
 * Uses Groq's OpenAI-compatible API with their LPU hardware
 * for ultra-fast inference on open-source models.
 *
 * Base URL: https://api.groq.com/openai/v1
 * Models: llama-3.3-70b-versatile, llama-3.1-8b-instant, mixtral-8x7b-32768, gemma2-9b-it
 */
export class GroqProvider implements LLMProvider {
  readonly name = 'groq';
  private readonly baseUrl = 'https://api.groq.com/openai/v1';

  constructor(
    private readonly apiKey: string,
    private readonly model: string = 'llama-3.3-70b-versatile',
  ) {}

  async complete(params: CompletionParams): Promise<CompletionResult> {
    const messages: { role: string; content: string }[] = [];

    if (params.systemPrompt) {
      messages.push({ role: 'system', content: params.systemPrompt });
    }

    for (const msg of params.messages) {
      messages.push({ role: msg.role, content: msg.content });
    }

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens ?? 4096,
    };

    if (params.responseFormat === 'json') {
      body.response_format = { type: 'json_object' };
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        `Groq API error (${response.status}): ${(error as any)?.error?.message || response.statusText}`,
      );
    }

    const data = await response.json() as any;
    const choice = data.choices?.[0];

    return {
      content: choice?.message?.content || '',
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      },
      model: data.model || this.model,
    };
  }
}
