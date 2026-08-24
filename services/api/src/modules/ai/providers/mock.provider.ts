import { LLMProvider, CompletionParams, CompletionResult } from './llm-provider.interface';

/**
 * Mock LLM Provider for development and testing.
 *
 * Returns deterministic, topic-aware responses so the full pipeline can be
 * exercised locally without an API key or token cost.
 *
 * Intent is detected from distinctive phrases in each call site's system prompt.
 * The markers below are matched against the prompts actually built in
 * AIService and the feature services (context-quiz, learning-path, mentor,
 * challenges, projects, learning). If you change a system prompt, update the
 * matching marker here or the mock will fall through to a generic reply.
 */
export class MockLLMProvider implements LLMProvider {
  readonly name = 'mock';

  async complete(params: CompletionParams): Promise<CompletionResult> {
    const lastMessage = params.messages[params.messages.length - 1];
    const content = lastMessage?.content || '';
    const prompt = (params.systemPrompt || '').toLowerCase();

    // --- assessment generation ---
    if (prompt.includes('assessment generator') || prompt.includes('generate assessment')) {
      return this.result(this.assessmentQuestions(this.topicFrom(content)));
    }

    // --- scoring (full assessments) ---
    if (prompt.includes('assessment scorer') || prompt.includes('score assessment')) {
      return this.result(this.assessmentScore(content));
    }

    // --- concept extraction from activity ---
    if (prompt.includes('concept extraction') || prompt.includes('extract concepts')) {
      return this.result(this.conceptExtraction(content));
    }

    // --- context quiz (desktop agent / browser extension popups) ---
    if (prompt.includes('intelligent learning assessment system')) {
      return this.result(this.contextQuiz(content));
    }

    // --- learning path / curriculum generation ---
    if (prompt.includes('curriculum designer')) {
      return this.result(this.learningPath(content));
    }

    // --- AI mentor chat ---
    if (prompt.includes('ai learning mentor')) {
      return this.result({ message: this.mentorReply(content) }, 'text');
    }

    // --- micro challenge generation ---
    if (prompt.includes('micro-assessment generator')) {
      return this.result(this.microChallenge(this.topicFrom(content)));
    }

    // --- micro challenge scoring ---
    if (prompt.includes('score this challenge answer')) {
      return this.result(this.shortScore(content));
    }

    // --- project review ---
    if (prompt.includes('code reviewer')) {
      return this.result(this.projectReview());
    }

    // --- interval knowledge check during a focus session ---
    if (prompt.includes('knowledge check')) {
      return this.result(this.knowledgeCheck(this.topicFrom(content)));
    }

    // --- interval knowledge check scoring ---
    if (prompt.includes('scoring a quick learning check')) {
      return this.result(this.shortScore(content));
    }

    return this.result({
      message: 'Mock AI response',
      input: content.substring(0, 100),
    });
  }

  // ---------------------------------------------------------------- helpers

  private result(payload: unknown, mode: 'json' | 'text' = 'json'): CompletionResult {
    const content = mode === 'text' && typeof payload === 'object' && payload !== null
      ? String((payload as { message?: string }).message ?? '')
      : JSON.stringify(payload);

    return {
      content,
      usage: { promptTokens: 40, completionTokens: 120, totalTokens: 160 },
      model: 'mock-v1',
    };
  }

  /**
   * Pull a plausible topic out of the user message. Call sites format their
   * messages differently, so try the common labelled forms first and fall back
   * to a keyword scan.
   */
  private topicFrom(content: string): string {
    const labelled =
      /(?:questions about|learning path for|Title:|Topic:|topic\s*")\s*"?([^"\n.]{3,60})/i.exec(content);
    if (labelled?.[1]) {
      return labelled[1].trim().replace(/\s*\(focus area.*$/i, '');
    }

    const keyword = this.keywords(content)[0];
    return keyword || 'this topic';
  }

  /** Scan text for known technical concepts so mock output tracks real activity. */
  private keywords(content: string): string[] {
    const dictionary = [
      'React Hooks', 'React', 'Next.js', 'TypeScript', 'JavaScript', 'Python',
      'Rust', 'Go', 'Java', 'Kubernetes', 'Docker', 'PostgreSQL', 'Redis',
      'SQL', 'GraphQL', 'REST APIs', 'System Design', 'Machine Learning',
      'Neural Networks', 'Deep Learning', 'Transformers', 'Linear Algebra',
      'Statistics', 'Algorithms', 'Data Structures', 'Recursion',
      'Dynamic Programming', 'Closures', 'Async/Await', 'Promises',
      'Event Loop', 'Memory Management', 'Concurrency', 'Networking',
      'Operating Systems', 'Databases', 'Testing', 'Git', 'CSS', 'Tailwind CSS',
      'HTML', 'Accessibility', 'Security', 'Authentication', 'Cryptography',
    ];

    const found = dictionary.filter((term) =>
      new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}\\b`, 'i').test(content),
    );
    return found.slice(0, 5);
  }

  // ------------------------------------------------------------- generators

  private assessmentQuestions(topic: string) {
    return [
      {
        id: 'q1',
        text: `In your own words, explain what ${topic} is and why it matters.`,
        type: 'concept_explanation',
        maxScore: 20,
      },
      {
        id: 'q2',
        text: `What should you already understand before learning ${topic}?`,
        type: 'concept_explanation',
        maxScore: 20,
      },
      {
        id: 'q3',
        text: `Describe a real project where you would apply ${topic}.`,
        type: 'practical_task',
        maxScore: 20,
      },
      {
        id: 'q4',
        text: `A teammate's ${topic} implementation behaves incorrectly under load. How would you diagnose it?`,
        type: 'debugging',
        maxScore: 20,
      },
      {
        id: 'q5',
        text: `Which statement about ${topic} is most accurate?`,
        type: 'mcq',
        options: [
          `${topic} trades some performance for clarity`,
          `${topic} removes the need for testing`,
          `${topic} only works in production builds`,
          `${topic} is unrelated to program correctness`,
        ],
        maxScore: 20,
      },
    ];
  }

  private assessmentScore(content: string) {
    // Reward answers with substance so scores vary across runs.
    const answerText = (/"answer":"([^"]*)"/g.exec(content) || []).join(' ');
    const density = Math.min(1, (answerText.length || content.length / 8) / 400);
    const total = Math.round(40 + density * 55);

    return {
      totalScore: total,
      feedback:
        total >= 80
          ? 'Strong grasp of the fundamentals. Push into edge cases and performance trade-offs next.'
          : total >= 60
            ? 'Solid understanding overall. Tighten up the details and revisit the prerequisites.'
            : 'The core idea is partly there. Review the foundations and try explaining it out loud.',
      scoredQuestions: [],
    };
  }

  private conceptExtraction(content: string) {
    const found = this.keywords(content);
    const concepts = found.length > 0 ? found : ['General Programming'];

    const relationships = concepts.slice(1).map((child) => ({
      parent: concepts[0],
      child,
      type: 'related',
    }));

    return { concepts, relationships };
  }

  private contextQuiz(content: string) {
    const topic = this.topicFrom(content);
    const concepts = this.keywords(content);

    return {
      detectedTopic: topic,
      concepts: concepts.length > 0 ? concepts.slice(0, 3) : [topic],
      questions: [
        {
          id: 'q1',
          text: `You just spent time on ${topic}. Explain the main idea in two sentences.`,
          type: 'explain',
          maxScore: 20,
        },
        {
          id: 'q2',
          text: `Where would you use ${topic} in your own code?`,
          type: 'apply',
          maxScore: 20,
        },
      ],
      isEducational: true,
    };
  }

  private learningPath(content: string) {
    const topic = this.topicFrom(content);
    const curriculumId = topic
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-') || 'custom-path';

    const steps = [
      { title: `What ${topic} is and why it exists`, description: `Build an accurate mental model of ${topic}.`, subtopics: ['Core terminology', 'Common misconceptions'] },
      { title: `Prerequisites for ${topic}`, description: `Cover the background knowledge ${topic} assumes.`, subtopics: ['Required fundamentals', 'Refresher exercises'] },
      { title: `Core building blocks of ${topic}`, description: `Learn the primitives you will use constantly.`, subtopics: ['Key primitives', 'Minimal working example'] },
      { title: `Reading and tracing ${topic} code`, description: `Practice following existing implementations.`, subtopics: ['Code walkthrough', 'Tracing execution'] },
      { title: `Building something small with ${topic}`, description: `Apply the basics in a contained project.`, subtopics: ['Project setup', 'First feature'] },
      { title: `Debugging ${topic}`, description: `Recognise and fix the usual failure modes.`, subtopics: ['Common errors', 'Debugging workflow'] },
      { title: `Testing ${topic}`, description: `Verify behaviour with meaningful tests.`, subtopics: ['Unit tests', 'Edge cases'] },
      { title: `Performance and trade-offs in ${topic}`, description: `Understand the costs behind each choice.`, subtopics: ['Complexity', 'Benchmarking'] },
      { title: `Idiomatic patterns for ${topic}`, description: `Write code the way practitioners expect.`, subtopics: ['Best practices', 'Anti-patterns'] },
      { title: `Advanced ${topic}`, description: `Explore the harder capabilities.`, subtopics: ['Advanced features', 'Real-world constraints'] },
      { title: `Teaching ${topic}`, description: `Explain it to someone else to prove mastery.`, subtopics: ['Written explanation', 'Worked example'] },
    ];

    return {
      title: `${topic} Learning Path`,
      description: `A staged path from fundamentals to applied mastery of ${topic}.`,
      curriculumId,
      steps,
    };
  }

  private mentorReply(content: string): string {
    const topic = this.keywords(content)[0];
    const subject = topic || 'this';

    return [
      `Good question. Here's how I'd approach ${subject}:`,
      '',
      `1. Start from the smallest version of the problem you can already solve, then add one layer of difficulty at a time.`,
      `2. Explain your reasoning out loud (or in a comment) before you write code — gaps in understanding surface fast that way.`,
      `3. When you get stuck, write down what you expected to happen versus what actually happened. That gap is the thing to study.`,
      '',
      `Want me to turn this into a short practice plan you can work through this week?`,
      '',
      '_(mock mentor response — set AI_PROVIDER and AI_API_KEY for real answers)_',
    ].join('\n');
  }

  private microChallenge(topic: string) {
    return {
      question: `Quick check: what problem does ${topic} solve that a simpler approach does not?`,
      type: 'explain',
      expectedKeyPoints: ['identifies the specific problem', 'contrasts with a simpler alternative'],
      maxScore: 20,
    };
  }

  private knowledgeCheck(topic: string) {
    return {
      question: `Still with it? In one or two sentences, what is the key idea behind ${topic}?`,
      expectedKeyPoints: ['states the central idea', 'uses their own words'],
    };
  }

  private shortScore(content: string) {
    const answer = /A:\s*([\s\S]*?)(?:\nExpected|$)/.exec(content)?.[1]?.trim() || '';
    const correct = answer.length >= 25;

    return {
      score: correct ? 16 : 7,
      correct,
      feedback: correct
        ? 'Clear answer that hits the main point. Nice work.'
        : 'Too thin to show understanding — try restating the core idea in a full sentence.',
    };
  }

  private projectReview() {
    return {
      score: 74,
      strengths: [
        'Project structure is clear and easy to navigate',
        'Core feature works as described',
      ],
      improvements: [
        'Add error handling around external calls',
        'Cover the main logic with tests',
        'Document setup steps in the README',
      ],
      feedback:
        'A solid working submission. The next meaningful step is hardening: handle failure paths and add tests so changes stay safe.',
      conceptsDemonstrated: ['Project structure', 'Feature implementation'],
    };
  }
}
