'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import {
  Alert,
  Button,
  Card,
  Input,
  Page,
  PageHeader,
  ProgressBar,
  Section,
  Segmented,
  Select,
  Textarea,
} from '@/components/ui';

type Phase = 'setup' | 'loading' | 'questions' | 'submitting' | 'results';
type Difficulty = 'beginner' | 'intermediate' | 'advanced';

interface Question {
  id: string;
  text: string;
  type: string;
  options?: string[];
  maxScore: number;
}

interface AssessmentResult {
  id: string;
  score: number;
  maxScore: number;
  feedback: string;
  questions: any[];
}

export default function AssessmentPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('setup');
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('intermediate');
  const [concepts, setConcepts] = useState<{ id: string; name: string }[]>([]);
  const [assessmentId, setAssessmentId] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .getConcepts()
      .then((data) => setConcepts(data.map((c: any) => ({ id: c.id, name: c.name }))))
      .catch(() => {
        // Concept list is a convenience; the user can always type a topic.
      });
  }, []);

  const generateAssessment = async () => {
    if (!topic.trim()) return;
    setError('');
    setPhase('loading');

    try {
      const assessment = await api.generateAssessment(topic, { difficulty, questionCount: 5 });
      setAssessmentId(assessment.id);
      setQuestions(assessment.questions || []);
      setAnswers({});
      setPhase('questions');
    } catch (err: any) {
      setError(err.message || 'Could not generate the assessment');
      setPhase('setup');
    }
  };

  const submitAssessment = async () => {
    setPhase('submitting');
    setError('');

    try {
      const res = await api.submitAssessment(
        assessmentId,
        questions.map((q) => ({ questionId: q.id, answer: answers[q.id] || '' })),
      );
      setResult(res);
      setPhase('results');
    } catch (err: any) {
      setError(err.message || 'Could not submit your answers');
      setPhase('questions');
    }
  };

  const reset = () => {
    setPhase('setup');
    setQuestions([]);
    setAnswers({});
    setResult(null);
    setError('');
  };

  const answeredCount = questions.filter((q) => (answers[q.id] || '').trim()).length;

  return (
    <Page width="narrow">
      <PageHeader
        title="Assessment"
        description="Answer a short set of questions so edOS can measure what you actually understand."
      />

      {error && <Alert>{error}</Alert>}

      {phase === 'setup' && (
        <Card className="space-y-5">
          {concepts.length > 0 && (
            <Select
              label="Pick a tracked topic"
              value={concepts.some((c) => c.name === topic) ? topic : ''}
              onChange={(e) => setTopic(e.target.value)}
            >
              <option value="">Choose a concept…</option>
              {concepts.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}

          <Input
            label="Or enter any topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="React hooks, gradient descent, database indexing…"
          />

          <div className="space-y-1.5">
            <p className="text-2xs font-medium text-gray-500 dark:text-gray-400">Difficulty</p>
            <Segmented
              aria-label="Difficulty"
              value={difficulty}
              onChange={setDifficulty}
              options={[
                { value: 'beginner', label: 'Beginner' },
                { value: 'intermediate', label: 'Intermediate' },
                { value: 'advanced', label: 'Advanced' },
              ]}
            />
          </div>

          <Button variant="primary" block onClick={generateAssessment} disabled={!topic.trim()}>
            Generate 5 questions
          </Button>
        </Card>
      )}

      {phase === 'loading' && (
        <Card className="py-14 text-center">
          <p className="text-sm text-gray-900 dark:text-gray-100">Writing questions on {topic}</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">This takes a few seconds.</p>
        </Card>
      )}

      {phase === 'questions' && (
        <div className="space-y-5">
          <Section
            title={topic}
            description={`${difficulty} · ${answeredCount} of ${questions.length} answered`}
          >
            <ProgressBar
              value={questions.length ? (answeredCount / questions.length) * 100 : 0}
              label="Answered"
            />
          </Section>

          {questions.map((q, idx) => (
            <Card key={q.id} className="space-y-3">
              <p className="text-2xs tabular-nums text-gray-500 dark:text-gray-400">
                {idx + 1} of {questions.length}
              </p>
              <p className="text-sm leading-relaxed text-gray-900 dark:text-gray-100">{q.text}</p>

              {q.options && q.options.length > 0 ? (
                <div className="space-y-2" role="radiogroup" aria-label={`Answer to question ${idx + 1}`}>
                  {q.options.map((opt) => {
                    const selected = answers[q.id] === opt;
                    return (
                      <button
                        key={opt}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setAnswers({ ...answers, [q.id]: opt })}
                        className={`w-full rounded-lg border px-3.5 py-2.5 text-left text-sm transition-colors ${
                          selected
                            ? 'border-gray-900 bg-gray-50 text-gray-900 dark:border-gray-100 dark:bg-dark-tertiary dark:text-gray-100'
                            : 'text-gray-700 hover:border-gray-300 dark:text-gray-300 dark:hover:border-gray-700'
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <Textarea
                  value={answers[q.id] || ''}
                  onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                  placeholder="Your answer"
                  aria-label={`Answer to question ${idx + 1}`}
                />
              )}
            </Card>
          ))}

          <div className="flex gap-2">
            <Button onClick={reset} className="flex-1">
              Cancel
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={submitAssessment}
              disabled={answeredCount === 0}
            >
              Submit {answeredCount} of {questions.length}
            </Button>
          </div>
        </div>
      )}

      {phase === 'submitting' && (
        <Card className="py-14 text-center">
          <p className="text-sm text-gray-900 dark:text-gray-100">Scoring your answers</p>
        </Card>
      )}

      {phase === 'results' && result && (
        <div className="space-y-5">
          <Card className="py-10 text-center">
            <p className="text-2xs text-gray-500 dark:text-gray-400">Your score</p>
            <p className="mt-1.5 text-5xl font-semibold tabular-nums text-gray-900 dark:text-gray-50">
              {result.maxScore ? Math.round((result.score / result.maxScore) * 100) : 0}%
            </p>
            <p className="mt-1.5 text-xs tabular-nums text-gray-500 dark:text-gray-400">
              {result.score} of {result.maxScore} points
            </p>
            {result.feedback && (
              <p className="mx-auto mt-5 max-w-md text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                {result.feedback}
              </p>
            )}
          </Card>

          <div className="flex gap-2">
            <Button onClick={reset} className="flex-1">
              Take another
            </Button>
            <Button variant="primary" className="flex-1" onClick={() => router.push('/dashboard')}>
              Back to dashboard
            </Button>
          </div>
        </div>
      )}
    </Page>
  );
}
