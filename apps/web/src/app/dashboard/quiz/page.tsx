'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

/**
 * Context Quiz page — shows pending quizzes from learning sessions.
 * Also allows manual context submission for testing.
 */
export default function ContextQuizPage() {
  const router = useRouter();
  const [pending, setPending] = useState<any>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [manualContext, setManualContext] = useState('');
  const [generating, setGenerating] = useState(false);

  useEffect(() => { checkPending(); }, []);

  const checkPending = async () => {
    try {
      const quiz = await api.request<any>('/context-quiz/pending');
      if (quiz && quiz.questions?.length) setPending(quiz);
    } catch (e) {}
    finally { setLoading(false); }
  };

  const generateManual = async () => {
    if (!manualContext.trim()) return;
    setGenerating(true);
    try {
      const quiz = await api.request<any>('/context-quiz/generate', {
        method: 'POST',
        body: JSON.stringify({ context: manualContext, source: 'manual', title: 'Manual Input', timeSpent: 120 }),
      });
      if (quiz && !quiz.skipped && quiz.questions?.length) {
        setPending({ ...quiz, id: quiz.id });
        setManualContext('');
      }
    } catch (e) { console.error(e); }
    finally { setGenerating(false); }
  };

  const submitQuiz = async () => {
    if (!pending) return;
    setSubmitting(true);
    try {
      const res = await api.request<any>('/context-quiz/submit', {
        method: 'POST',
        body: JSON.stringify({
          quizId: pending.id,
          answers: (pending.questions || []).map((q: any) => ({ questionId: q.id, answer: answers[q.id] || '' })),
        }),
      });
      setResult(res);
      setPending(null);
    } catch (e) { console.error(e); }
    finally { setSubmitting(false); }
  };

  const skipQuiz = async () => {
    if (pending?.id) {
      await api.request<any>('/context-quiz/skip', { method: 'POST', body: JSON.stringify({ quizId: pending.id }) });
    }
    setPending(null);
  };

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="p-6 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Result */}
        {result && (
          <div className="card text-center space-y-4">
            <h2 className="text-xl font-bold">Result</h2>
            <p className="text-5xl font-bold text-primary-600">{result.percentage}%</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">{result.feedback}</p>
            <button onClick={() => { setResult(null); checkPending(); }} className="btn-primary">Continue</button>
          </div>
        )}

        {/* Active Quiz */}
        {pending && !result && (
          <div className="space-y-4">
            <div className="card">
              <p className="text-xs text-primary-600 font-medium uppercase tracking-wide">Quick Knowledge Check</p>
              <h2 className="text-lg font-semibold mt-1">{pending.topic || 'Your recent learning'}</h2>
              <p className="text-sm text-gray-500 mt-1">Answer based on what you just studied.</p>
            </div>

            {(pending.questions || []).map((q: any, i: number) => (
              <div key={q.id} className="card space-y-3">
                <p className="text-xs font-semibold text-primary-600">Question {i + 1}</p>
                <p className="text-sm">{q.text}</p>
                <textarea
                  value={answers[q.id] || ''}
                  onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                  className="input min-h-[80px]"
                  placeholder="Your answer..."
                />
              </div>
            ))}

            <div className="flex gap-3">
              <button onClick={skipQuiz} className="btn-secondary flex-1">Skip</button>
              <button onClick={submitQuiz} className="btn-primary flex-1" disabled={submitting}>
                {submitting ? 'Scoring...' : 'Submit'}
              </button>
            </div>
          </div>
        )}

        {/* No pending quiz — manual input for testing */}
        {!pending && !result && (
          <div className="card space-y-4">
            <div className="text-center space-y-2">
              <h2 className="text-lg font-semibold">No pending quiz</h2>
              <p className="text-sm text-gray-500">
                Quizzes are generated automatically by the browser extension when you finish studying something.
                You can also paste content below to test it manually.
              </p>
            </div>

            <textarea
              value={manualContext}
              onChange={(e) => setManualContext(e.target.value)}
              className="input min-h-[120px]"
              placeholder="Paste article content, documentation, or notes you just studied..."
            />

            <button onClick={generateManual} className="btn-primary w-full" disabled={!manualContext.trim() || generating}>
              {generating ? 'Generating quiz...' : 'Generate Quiz from Content'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
