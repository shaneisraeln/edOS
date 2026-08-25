'use client';

import { useEffect, useState } from 'react';
import { api, type CheckResult } from '@/lib/api';
import { Button, Textarea, Alert, Card } from '@/components/ui';

/**
 * A standalone popup page for end-of-session and recurring knowledge checks.
 *
 * Opened via window.open() from the session page, so it appears as a separate
 * browser window on top of whatever the learner has open — not buried inline
 * in the dashboard. The quiz data is passed through sessionStorage because
 * window.open can't carry complex objects in the URL.
 */
export default function QuizPopupPage() {
  const [quiz, setQuiz] = useState<{
    questions: { id: string; text: string }[];
    topic: string;
    sessionId?: string;
    elapsed?: number;
  } | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<CheckResult[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let attempts = 0;
    const maxAttempts = 20; // 20 × 200ms = 4 seconds max wait

    const tryLoad = () => {
      try {
        const raw = sessionStorage.getItem('edos_quiz_popup');
        if (raw) {
          setQuiz(JSON.parse(raw));
          sessionStorage.removeItem('edos_quiz_popup');
          return;
        }
      } catch {
        // Nothing valid.
      }

      attempts++;
      if (attempts < maxAttempts) {
        setTimeout(tryLoad, 200);
      }
      // After max attempts, the page just shows "No quiz data" which is fine.
    };

    tryLoad();
  }, []);

  const submit = async () => {
    if (!quiz) return;
    setSubmitting(true);
    setError('');

    try {
      const graded = await Promise.all(
        quiz.questions.map(async (q) => {
          const answer = answers[q.id]?.trim() || '';
          if (!answer) return null;
          try {
            return await api.answerCheck(q.id, answer, quiz.sessionId);
          } catch {
            return null;
          }
        }),
      );
      setResults(graded.filter(Boolean) as CheckResult[]);
    } catch (e: any) {
      setError(e?.message || 'Could not submit.');
      setSubmitting(false);
    }
  };

  const skip = async () => {
    if (quiz) {
      await Promise.all(
        quiz.questions.map((q) => api.skipCheck(q.id, quiz.sessionId).catch(() => {})),
      ).catch(() => {});
    }
    window.close();
  };

  if (!quiz) {
    return (
      <div className="flex h-screen items-center justify-center p-8">
        <p className="muted text-sm">No quiz data. This window can be closed.</p>
      </div>
    );
  }

  if (results) {
    const totalScore = results.reduce((s, r) => s + (r.score ?? 0), 0);
    const totalMax = results.reduce((s, r) => s + r.maxScore, 0);
    const allCorrect = results.every((r) => r.correct === true);
    const anyCorrect = results.some((r) => r.correct === true);

    return (
      <div className="mx-auto max-w-md px-6 py-10 text-center animate-in">
        <p className="eyebrow">Session ended</p>
        <p className="mt-3 text-lg font-semibold text-gray-900 dark:text-gray-100">
          {allCorrect ? 'Solid retention' : anyCorrect ? 'Partially there' : 'Needs review'}
        </p>
        <p className="mt-2 font-mono text-4xl font-light tabular-nums text-gray-900 dark:text-gray-100">
          {totalScore}/{totalMax}
        </p>
        <p className="muted mt-3 text-sm">
          {results.map((r) => r.feedback).filter(Boolean).join(' ') || 'Answers recorded.'}
        </p>
        <div className="mt-8">
          <Button onClick={() => window.close()} block>
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-6 py-8 animate-in">
      <p className="eyebrow">Session ended</p>
      <h1 className="page-title mt-1">{quiz.topic}</h1>
      <p className="muted mt-2 text-sm">
        Quick check before you move on — takes 30 seconds.
      </p>

      <div className="mt-6 space-y-4">
        {quiz.questions.map((q, i) => (
          <div key={q.id}>
            <p className="text-sm text-gray-800 dark:text-gray-200">
              <span className="mr-2 text-gray-400 tabular-nums">{i + 1}.</span>
              {q.text}
            </p>
            <Textarea
              className="mt-2"
              value={answers[q.id] || ''}
              onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
              placeholder="Your answer"
              rows={2}
              autoFocus={i === 0}
            />
          </div>
        ))}
      </div>

      {error && (
        <div className="mt-3">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      <div className="mt-6 flex gap-2">
        <Button variant="ghost" size="sm" onClick={skip}>
          Skip
        </Button>
        <Button
          size="sm"
          onClick={submit}
          loading={submitting}
          disabled={!Object.values(answers).some((a) => a.trim())}
          block
        >
          Submit
        </Button>
      </div>
    </div>
  );
}
