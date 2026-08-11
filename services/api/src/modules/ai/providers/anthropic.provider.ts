import { LLMProvider, CompletionParams, CompletionResult } from './llm-provider.interface';

/**
 * Anthropic (Claude) LLM Provider.
 * Placeholder — implement when API key is available.
 */
export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';

  constructor(private readonly apiKey: string) {}

  async complete(params: CompletionParams): Promise<CompletionResult> {
    // TODO: Implement Anthropic API call
    // POST https://api.anthropic.com/v1/messages
    throw new Error('Anthropic provider not yet implemented. Set AI_PROVIDER=mock for development.');
  }
}
