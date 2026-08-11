import { LLMProvider, CompletionParams, CompletionResult } from './llm-provider.interface';

/**
 * OpenAI LLM Provider.
 * Placeholder — implement when API key is available.
 */
export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';

  constructor(private readonly apiKey: string) {}

  async complete(params: CompletionParams): Promise<CompletionResult> {
    // TODO: Implement OpenAI API call
    // Use fetch or openai SDK
    // POST https://api.openai.com/v1/chat/completions
    throw new Error('OpenAI provider not yet implemented. Set AI_PROVIDER=mock for development.');
  }

  async embed(text: string): Promise<number[]> {
    // TODO: Implement embedding call
    throw new Error('OpenAI embedding not yet implemented.');
  }
}
