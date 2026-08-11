'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

const QUIZ_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

interface IntervalQuiz {
  id: string;
  question: string;
  type: string;
}

export default function SessionPage() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [elapsed, setElapsed] = useState(0);
  const [topic, setTopic] = useState('');
  const [starting, setStarting] = useState(false);
  const [paused, setPaused] = useState(false);

  // Interval quiz state
  const [quiz, setQuiz] = useState<IntervalQuiz | null>(null);
  const [quizAnswer, setQuizAnswer] = useState('');
  const [quizSubmitting, setQuizSubmitting] = useState(false);
  const [quizResult, setQuizResult] = useState<{ correct: boolean; feedback: string } | null>(null);
  const [quizCount, setQuizCount] = useState(0);

  // End-of-session assessment
  const [showEndAssessment, setShowEndAssessment] = useState(false);
  const [endQuestions, setEndQuestions] = useState<any[]>([]);
  const [endAnswers, setEndAnswers] = useState<Record<string, string>>({});
  const [endResult, setEndResult] = useState<any>(null);
  const [endSubmitting, setEndSubmitting] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const quizTimerRef = useRef<NodeJS.Timeout | null>(null);
  const sessionRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (quizTimerRef.current) clearTimeout(quizTimerRef.current);
    };
  }, []);

  const scheduleNextQuiz = useCallback(() => {
    if (quizTimerRef.current) clearTimeout(quizTimerRef.current);
    quizTimerRef.current = setTimeout(async () => {
      if (!sessionRef.current || paused) return;
      try {
        const q = await api.request<any>('/learning/interval-quiz', {
          method: 'POST',
          body: JSON.stringify({ sessionId: sessionRef.current.id, topic: sessionRef.current.topic }),
        });
        if (q && q.question) {
          setQuiz(q);
          setPaused(true);
        }
      } catch (e) {
        console.error('Failed to fetch interval quiz:', e);
        // Reschedule even on failure
        scheduleNextQuiz();
      }
    }, QUIZ_INTERVAL_MS);
  }, [paused]);

  const startSession = async () => {
    if (!topic.trim()) return;
    setStarting(true);
    try {
      const s = await api.startSession(topic.trim());
      setSession(s);
      sessionRef.current = s;
      setElapsed(0);
      setPaused(false);
      timerRef.current = setInterval(() => {
        setElapsed((e) => e + 1);
      }, 1000);
      scheduleNextQuiz();
    } catch (e) {
      console.error(e);
    } finally {
      setStarting(false);
    }
  };

  const submitIntervalQuiz = async () => {
    if (!quiz || !quizAnswer.trim()) return;
    setQuizSubmitting(true);
    try {
      const res = await api.request<any>('/learning/interval-quiz/answer', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: sessionRef.current.id,
          quizId: quiz.id,
          answer: quizAnswer,
        }),
      });
      setQuizResult(res);
      setQuizCount((c) => c + 1);
    } catch (e) {
      console.error(e);
      setQuizResult({ correct: true, feedback: 'Could not score. Keep going!' });
    } finally {
      setQuizSubmitting(false);
    }
  };

  const dismissQuiz = () => {
    setQuiz(null);
    setQuizAnswer('');
    setQuizResult(null);
    setPaused(false);
    scheduleNextQuiz();
  };

  const endSession = async () => {
    if (!session) return;
    if (timerRef.current) clearInterval(timerRef.current);
    if (quizTimerRef.current) clearTimeout(quizTimerRef.current);

    try {
      await api.endSession(session.id);
      // Generate end-of-session assessment
      const assessment = await api.generateAssessment(session.topic, {
        difficulty: 'intermediate',
        questionCount: 3,
      });
      if (assessment?.questions?.length) {
        setEndQuestions(assessment.questions);
        setShowEndAssessment(true);
        setSession({ ...session, assessmentId: assessment.id });
      } else {
        router.push('/dashboard');
      }
    } catch (e) {
      console.error(e);
      router.push('/dashboard');
    }
  };

  const submitEndAssessment = async () => {
    setEndSubmitting(true);
    try {
      const answers = endQuestions.map((q: any) => ({
        questionId: q.id,
        answer: endAnswers[q.id] || '',
      }));
      const res = await api.submitAssessment(session.assessmentId, answers);
      setEndResult(res);
    } catch (e) {
      console.error(e);
      router.push('/dashboard');
    } finally {
      setEndSubmitting(false);
    }
  };

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  // --- End Assessment View ---
  if (showEndAssessment) {
    return (
      <div className="p-6 md:p-8">
        <div className="max-w-2xl mx-auto space-y-6">
          {!endResult ? (
            <>
              <div className="text-center space-y-2">
                <div className="w-10 h-10 rounded-full bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center mx-auto">
                  <span className="text-lg">📝</span>
                </div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Session complete</h2>
                <p className="text-sm text-gray-500">
                  Quick check — {endQuestions.length} questions about <span className="font-medium text-gray-700 dark:text-gray-300">{session.topic}</span>
                </p>
              </div>

              <div className="space-y-4">
                {endQuestions.map((q: any, i: number) => (
                  <div key={q.id} className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-surface p-5 space-y-3">
                    <p className="text-sm text-gray-900 dark:text-gray-100 leading-relaxed">
                      <span className="text-gray-400 mr-2">{i + 1}.</span>
                      {q.text}
                    </p>
                    {q.options?.length > 0 ? (
                      <div className="space-y-2">
                        {q.options.map((opt: string, oi: number) => (
                          <button
                            key={oi}
                            onClick={() => setEndAnswers({ ...endAnswers, [q.id]: opt })}
                            className={`w-full text-left px-4 py-2.5 rounded-lg text-sm border transition-all ${
                              endAnswers[q.id] === opt
                                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <textarea
                        value={endAnswers[q.id] || ''}
                        onChange={(e) => setEndAnswers({ ...endAnswers, [q.id]: e.target.value })}
                        className="input min-h-[80px] resize-none"
                        placeholder="Your answer..."
                      />
                    )}
                  </div>
                ))}
              </div>

              <button
                onClick={submitEndAssessment}
                disabled={endSubmitting || Object.keys(endAnswers).length === 0}
                className="btn-primary w-full"
              >
                {endSubmitting ? 'Scoring...' : 'Submit'}
              </button>
            </>
          ) : (
            <div className="text-center space-y-6">
              <div className="w-16 h-16 rounded-full bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center mx-auto">
                <span className="text-3xl font-bold text-primary-600">
                  {Math.round((endResult.score / endResult.maxScore) * 100)}%
                </span>
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Assessment complete</h2>
                <p className="text-sm text-gray-500">{endResult.feedback}</p>
              </div>
              <button onClick={() => router.push('/dashboard')} className="btn-primary">
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- Main Session View ---
  return (
    <div className="p-6 md:p-8">
      <div className="max-w-xl mx-auto">
        {!session ? (
          // Start session form
          <div className="space-y-8">
            <div className="text-center space-y-2">
              <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Start learning</h1>
              <p className="text-sm text-gray-500">
                Focus timer with periodic knowledge checks every 10 minutes.
              </p>
            </div>

            <div className="space-y-4">
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && startSession()}
                className="input text-center text-base"
                placeholder="What are you learning?"
                autoFocus
              />
              <button
                onClick={startSession}
                disabled={!topic.trim() || starting}
                className="btn-primary w-full"
              >
                {starting ? 'Starting...' : 'Begin session'}
              </button>
            </div>

            <p className="text-xs text-center text-gray-400">
              You&apos;ll get a quick question every 10 min to check retention, plus a short assessment when you finish.
            </p>
          </div>
        ) : (
          // Active session
          <div className="space-y-6 relative">
            {/* Timer display */}
            <div className="text-center space-y-4 py-8">
              <p className="text-xs text-gray-400 uppercase tracking-widest">
                {paused ? 'Paused — answer to continue' : 'Learning'}
              </p>
              <h2 className="text-base font-medium text-gray-700 dark:text-gray-300">{session.topic}</h2>
              <div className={`text-5xl font-mono font-light tabular-nums tracking-tight ${
                paused ? 'text-gray-400' : 'text-gray-900 dark:text-gray-100'
              }`}>
                {formatTime(elapsed)}
              </div>
              {quizCount > 0 && (
                <p className="text-xs text-gray-400">{quizCount} check{quizCount !== 1 ? 's' : ''} completed</p>
              )}
            </div>

            {/* Interval Quiz Modal */}
            {quiz && (
              <div className="rounded-xl border border-primary-200 dark:border-primary-800 bg-primary-50/50 dark:bg-primary-900/10 p-5 space-y-4 animate-in">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary-500 animate-pulse" />
                  <p className="text-xs font-medium text-primary-600 dark:text-primary-400 uppercase tracking-wide">
                    Quick check
                  </p>
                </div>
                <p className="text-sm text-gray-900 dark:text-gray-100 leading-relaxed">{quiz.question}</p>

                {!quizResult ? (
                  <div className="space-y-3">
                    <textarea
                      value={quizAnswer}
                      onChange={(e) => setQuizAnswer(e.target.value)}
                      className="input min-h-[60px] resize-none text-sm"
                      placeholder="Your answer..."
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button onClick={dismissQuiz} className="btn-secondary flex-1 text-sm py-2">
                        Skip
                      </button>
                      <button
                        onClick={submitIntervalQuiz}
                        disabled={!quizAnswer.trim() || quizSubmitting}
                        className="btn-primary flex-1 text-sm py-2"
                      >
                        {quizSubmitting ? '...' : 'Answer'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className={`text-sm rounded-lg p-3 ${
                      quizResult.correct
                        ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                        : 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300'
                    }`}>
                      {quizResult.feedback}
                    </div>
                    <button onClick={dismissQuiz} className="btn-primary w-full text-sm py-2">
                      Continue learning
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* End session button */}
            {!quiz && (
              <button
                onClick={endSession}
                className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-surface px-4 py-3 text-sm text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-800 transition-colors"
              >
                End session
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
