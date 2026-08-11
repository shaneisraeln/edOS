/**
 * Provider-agnostic LLM interface.
 * Implement this for each AI provider (OpenAI, Anthropic, Gemini, etc.)
 */
export interface LLMProvider {
  readonly name: string;

  /**
   * Send a completion request to the LLM
   */
  complete(params: CompletionParams): Promise<CompletionResult>;

  /**
   * Generate embeddings for a text
   */
  embed?(text: string): Promise<number[]>;
}

export interface CompletionParams {
  systemPrompt?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'text' | 'json';
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionResult {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model?: string;
}
