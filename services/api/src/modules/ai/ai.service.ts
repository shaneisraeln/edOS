import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LLMProvider } from './providers/llm-provider.interface';
import { MockLLMProvider } from './providers/mock.provider';
import { OpenAIProvider } from './providers/openai.provider';
import { AnthropicProvider } from './providers/anthropic.provider';
import { GroqProvider } from './providers/groq.provider';

@Injectable()
export class AIService implements OnModuleInit {
  private provider: LLMProvider;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const providerName = this.configService.get('AI_PROVIDER', 'mock');
    const apiKey = this.configService.get('AI_API_KEY', '');

    switch (providerName) {
      case 'openai':
        this.provider = new OpenAIProvider(apiKey);
        break;
      case 'anthropic':
        this.provider = new AnthropicProvider(apiKey);
        break;
      case 'groq':
        const groqModel = this.configService.get('AI_MODEL', 'llama-3.3-70b-versatile');
        this.provider = new GroqProvider(apiKey, groqModel);
        break;
      case 'mock':
      default:
        this.provider = new MockLLMProvider();
        break;
    }

    console.log(`AI Service initialized with provider: ${this.provider.name}`);
  }

  getProvider(): LLMProvider {
    return this.provider;
  }

  async generateAssessment(params: {
    topic: string;
    subtopic?: string;
    difficulty: string;
    type: string;
    questionCount: number;
    weakConcepts?: string[];
    strongConcepts?: string[];
  }): Promise<Record<string, unknown>[]> {
    let contextInfo = '';
    if (params.weakConcepts && params.weakConcepts.length > 0) {
      contextInfo += `\nThe learner is weak in: ${params.weakConcepts.join(', ')}. Include questions that probe these areas.`;
    }
    if (params.strongConcepts && params.strongConcepts.length > 0) {
      contextInfo += `\nThe learner is strong in: ${params.strongConcepts.join(', ')}. You can include advanced questions on these.`;
    }

    const result = await this.provider.complete({
      systemPrompt: `You are an expert educator and assessment generator for a learning platform. Your job is to generate assessment questions that accurately measure a student's understanding.

Rules:
- Generate exactly ${params.questionCount} questions
- Each question must have: id (q1, q2...), text (the question), type (one of: concept_explanation, coding_challenge, mcq, debugging, practical_task), maxScore (20 per question)
- For MCQ questions, include an "options" array with exactly 4 choices
- Questions should be at ${params.difficulty} difficulty level
- Questions must be specific, unambiguous, and test real understanding (not rote memorization)
- Mix question types when possible for a well-rounded assessment
- Return ONLY a valid JSON array of question objects, no other text
${contextInfo}`,
      messages: [
        {
          role: 'user',
          content: `Generate ${params.questionCount} assessment questions about "${params.topic}"${params.subtopic ? ` (focus area: ${params.subtopic})` : ''} at ${params.difficulty} difficulty level.`,
        },
      ],
      temperature: 0.8,
      responseFormat: 'json',
    });

    try {
      const parsed = JSON.parse(result.content);
      // Handle both array and object with questions property
      return Array.isArray(parsed) ? parsed : parsed.questions || [];
    } catch {
      return [];
    }
  }

  async scoreAssessment(params: {
    questions: Record<string, unknown>[];
    answers: { questionId: string; answer: string }[];
    topic: string;
  }): Promise<{ totalScore: number; feedback: string; scoredQuestions: Record<string, unknown>[] }> {
    const result = await this.provider.complete({
      systemPrompt: `You are an expert assessment scorer for a learning platform. Score student answers fairly and provide constructive feedback.

Rules:
- Score each answer out of its maxScore (typically 20 per question)
- Be fair: partial credit is okay for partially correct answers
- Empty answers get 0
- For MCQ: correct answer = full marks, wrong = 0
- For explanations: evaluate depth of understanding, accuracy, and clarity
- Provide overall feedback (2-3 sentences) highlighting strengths and areas to improve
- Return ONLY valid JSON with: totalScore (number), feedback (string), scoredQuestions (array of objects with questionId, score, maxScore, feedback)`,
      messages: [
        {
          role: 'user',
          content: `Topic: ${params.topic}\n\nQuestions and answers to score:\n${JSON.stringify({
            questions: params.questions,
            answers: params.answers,
          })}`,
        },
      ],
      temperature: 0.3,
      responseFormat: 'json',
    });

    try {
      const parsed = JSON.parse(result.content);
      return {
        totalScore: parsed.totalScore || 0,
        feedback: parsed.feedback || 'Assessment scored.',
        scoredQuestions: parsed.scoredQuestions || [],
      };
    } catch {
      return { totalScore: 0, feedback: 'Unable to score — please try again.', scoredQuestions: [] };
    }
  }

  async extractConcepts(text: string): Promise<{ concepts: string[]; relationships: { parent: string; child: string; type: string }[] }> {
    const result = await this.provider.complete({
      systemPrompt: `You are a learning concept extraction agent. You analyze learning activity (page titles, file names, code, browsing history) and extract structured learning concepts.

Rules:
- Extract 1-5 key technical/educational concepts from the input
- Concepts should be specific (e.g. "React Hooks" not just "Programming")
- Identify relationships between concepts (prerequisite, part_of, related, builds_on)
- Return ONLY valid JSON with: concepts (array of concept name strings), relationships (array of {parent, child, type})
- If the input is not educational or too vague, return empty arrays`,
      messages: [{ role: 'user', content: text }],
      temperature: 0.3,
      responseFormat: 'json',
    });

    try {
      const parsed = JSON.parse(result.content);
      return {
        concepts: parsed.concepts || [],
        relationships: parsed.relationships || [],
      };
    } catch {
      return { concepts: [], relationships: [] };
    }
  }
}
