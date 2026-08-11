import { LLMProvider, CompletionParams, CompletionResult } from './llm-provider.interface';

/**
 * Mock LLM Provider for development and testing.
 * Returns deterministic responses so the full pipeline can be tested
 * without API costs.
 */
export class MockLLMProvider implements LLMProvider {
  readonly name = 'mock';

  async complete(params: CompletionParams): Promise<CompletionResult> {
    const lastMessage = params.messages[params.messages.length - 1];
    const content = lastMessage?.content || '';

    // Detect intent from system prompt
    if (params.systemPrompt?.includes('generate assessment')) {
      return this.mockAssessmentGeneration(content);
    }

    if (params.systemPrompt?.includes('score assessment')) {
      return this.mockAssessmentScoring(content);
    }

    if (params.systemPrompt?.includes('extract concepts')) {
      return this.mockConceptExtraction(content);
    }

    return {
      content: JSON.stringify({
        message: 'Mock AI response',
        input: content.substring(0, 100),
      }),
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      model: 'mock-v1',
    };
  }

  private mockAssessmentGeneration(context: string): CompletionResult {
    const questions = [
      {
        id: 'q1',
        text: 'Explain the core concept in your own words.',
        type: 'concept_explanation',
        maxScore: 20,
      },
      {
        id: 'q2',
        text: 'What are the prerequisites for understanding this topic?',
        type: 'concept_explanation',
        maxScore: 20,
      },
      {
        id: 'q3',
        text: 'How would you apply this concept in a real-world scenario?',
        type: 'practical_task',
        maxScore: 20,
      },
      {
        id: 'q4',
        text: 'Identify the error in the following approach and fix it.',
        type: 'debugging',
        maxScore: 20,
      },
      {
        id: 'q5',
        text: 'Which of the following statements is true? A) ... B) ... C) ... D) ...',
        type: 'mcq',
        options: ['Option A', 'Option B', 'Option C', 'Option D'],
        maxScore: 20,
      },
    ];

    return {
      content: JSON.stringify(questions),
      usage: { promptTokens: 50, completionTokens: 200, totalTokens: 250 },
      model: 'mock-v1',
    };
  }

  private mockAssessmentScoring(_context: string): CompletionResult {
    return {
      content: JSON.stringify({
        totalScore: 72,
        feedback: 'Good understanding of core concepts. Review prerequisites for deeper mastery.',
        scoredQuestions: [],
      }),
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      model: 'mock-v1',
    };
  }

  private mockConceptExtraction(context: string): CompletionResult {
    return {
      content: JSON.stringify({
        concepts: ['Machine Learning', 'Neural Networks', 'Optimization'],
        relationships: [
          { parent: 'Machine Learning', child: 'Neural Networks', type: 'part_of' },
        ],
      }),
      usage: { promptTokens: 30, completionTokens: 40, totalTokens: 70 },
      model: 'mock-v1',
    };
  }
}
