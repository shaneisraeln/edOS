'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Page,
  PageHeader,
  PageLoading,
  Textarea,
} from '@/components/ui';

/**
 * Context quiz page. Normally these quizzes arrive from the agents after you
 * finish studying something; this page shows the pending one and also lets you
 * paste content to generate a check manually.
 */
export default function ContextQuizPage() {
  const [pending, setPending] = useState<any>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [manualContext, setManualContext] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    checkPending();
  }, []);

  const checkPending = async () => {
    setLoading(true);
    try {
      const quiz = await api.request<any>('/context-quiz/pending');
      setPending(quiz?.questions?.length ? quiz : null);
    } catch {
      setPending(null);
    } finally {
      setLoading(false);
    }
  };

  const generateManual = async () => {
    if (!manualContext.trim()) return;
    setGenerating(true);
    setError('');

    try {
      const quiz = await api.request<any>('/context-quiz/generate', {
        method: 'POST',
        body: JSON.stringify({
          context: manualContext,
          source: 'manual',
          title: 'Pasted content',
          timeSpent: 120,
        }),
      });

      if (quiz?.skipped) {
        setError('That content did not look like study material. Try a longer excerpt.');
      } else if (quiz?.questions?.length) {
        setPending(quiz);
        setAnswers({});
        setManualContext('');
      } else {
        setError('No questions could be generated from that content.');
      }
    } catch (err: any) {
      setError(err.message || 'Could not generate a quiz');
    } finally {
      setGenerating(false);
    }
  };

  const submitQuiz = async () => {
    if (!pending) return;
    setSubmitting(true);
    setError('');

    try {
      const res = await api.request<any>('/context-quiz/submit', {
        method: 'POST',
        body: JSON.stringify({
          quizId: pending.id,
          answers: (pending.questions || []).map((q: any) => ({
            questionId: q.id,
            answer: answers[q.id] || '',
          })),
        }),
      });
      setResult(res);
      setPending(null);
      setAnswers({});
    } catch (err: any) {
      setError(err.message || 'Could not submit your answers');
    } finally {
      setSubmitting(false);
    }
  };

  const skipQuiz = async () => {
    if (pending?.id) {
      try {
        await api.request<any>('/context-quiz/skip', {
          method: 'POST',
          body: JSON.stringify({ quizId: pending.id }),
        });
      } catch {
        // Skipping is best-effort.
      }
    }
    setPending(null);
    setAnswers({});
  };

  if (loading) return <PageLoading />;

  const answeredCount = (pending?.questions || []).filter((q: any) =>
    (answers[q.id] || '').trim(),
  ).length;

  return (
    <Page width="narrow">
      <PageHeader
        title="Context quiz"
        description="A quick check on whatever you studied most recently."
      />

      {error && <Alert>{error}</Alert>}

      {result && (
        <div className="space-y-5">
          <Card className="py-10 text-center">
            <p className="text-2xs text-gray-500 dark:text-gray-400">Your score</p>
            <p className="mt-1.5 text-5xl font-semibold tabular-nums text-gray-900 dark:text-gray-50">
              {Math.round(result.percentage ?? 0)}%
            </p>
            {result.feedback && (
              <p className="mx-auto mt-5 max-w-md text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                {result.feedback}
              </p>
            )}
          </Card>
          <Button
            variant="primary"
            block
            onClick={() => {
              setResult(null);
              checkPending();
            }}
          >
            Continue
          </Button>
        </div>
      )}

      {pending && !result && (
        <div className="space-y-5">
          <Card>
            <p className="text-2xs text-gray-500 dark:text-gray-400">Quick check</p>
            <h2 className="mt-1 text-base font-semibold text-gray-900 dark:text-gray-50">
              {pending.topic || pending.title || 'Your recent learning'}
            </h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Answer from memory — that is what makes it stick.
            </p>
          </Card>

          {(pending.questions || []).map((q: any, i: number) => (
            <Card key={q.id} className="space-y-3">
              <p className="text-2xs tabular-nums text-gray-500 dark:text-gray-400">
                {i + 1} of {pending.questions.length}
              </p>
              <p className="text-sm leading-relaxed text-gray-900 dark:text-gray-100">{q.text}</p>
              <Textarea
                value={answers[q.id] || ''}
                onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                placeholder="Your answer"
                aria-label={`Answer to question ${i + 1}`}
              />
            </Card>
          ))}

          <div className="flex gap-2">
            <Button onClick={skipQuiz} className="flex-1">
              Skip
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={submitQuiz}
              loading={submitting}
              disabled={answeredCount === 0}
            >
              Submit
            </Button>
          </div>
        </div>
      )}

      {!pending && !result && (
        <div className="space-y-5">
          <EmptyState
            icon="quiz"
            title="No quiz waiting"
            description="Quizzes appear automatically after the desktop agent, browser extension or IDE notices you spent real time on something."
          />

          <Card className="space-y-3">
            <div>
              <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Check yourself on something now
              </h2>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                Paste what you were reading and edOS will build questions from it.
              </p>
            </div>
            <Textarea
              value={manualContext}
              onChange={(e) => setManualContext(e.target.value)}
              placeholder="Paste an article, documentation section, or your notes"
              className="min-h-[120px]"
            />
            <Button
              variant="primary"
              block
              onClick={generateManual}
              loading={generating}
              disabled={!manualContext.trim()}
            >
              Generate questions
            </Button>
          </Card>
        </div>
      )}
    </Page>
  );
}
