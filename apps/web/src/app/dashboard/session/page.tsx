'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  api,
  type BlockedSurface,
  type CheckResult,
  type EndedSessionSummary,
  type SessionCheck,
  type SessionView,
} from '@/lib/api';
import {
  Alert,
  Badge,
  Button,
  Card,
  Icon,
  Input,
  PageLoading,
  Section,
  StatusDot,
  Textarea,
  type IconName,
} from '@/components/ui';

/**
 * How often the page checks in with the API.
 *
 * Knowledge-check timing is no longer decided here. The server owns the
 * schedule and hands a check to whichever surface pulses when one is due, so
 * the learner is asked once per interval rather than once per surface. This page
 * used to run its own 10-minute timer that no other surface knew about.
 */
const PULSE_INTERVAL_MS = 10_000;

/** Every surface a session can span, in the order we present them. */
const SURFACE_ORDER = ['web', 'desktop', 'browser', 'ide'] as const;

const SURFACE_META: Record<string, { label: string; icon: IconName; blurb: string }> = {
  web: { label: 'Web', icon: 'home', blurb: 'This dashboard' },
  desktop: { label: 'Desktop', icon: 'desktop', blurb: 'App and window activity' },
  browser: { label: 'Browser', icon: 'globe', blurb: 'Pages you read' },
  ide: { label: 'Editor', icon: 'terminal', blurb: 'Code you write' },
};

/** The state of one surface, merged from participants, awaiting and blocked. */
type SurfaceState = 'live' | 'idle' | 'waiting' | 'blocked';

interface SurfaceRow {
  surface: string;
  state: SurfaceState;
  deviceName?: string | null;
  eventCount: number;
  permission?: string;
}

/**
 * Open the end-of-session quiz as a SEPARATE browser popup window.
 *
 * The data is passed via sessionStorage because window.open cannot carry
 * complex objects. The popup page reads it on mount and self-destructs.
 */
function openQuizPopup(data: {
  questions: { id: string; text: string }[];
  topic: string;
  sessionId?: string;
  elapsed?: number;
}) {
  try {
    sessionStorage.setItem('edos_quiz_popup', JSON.stringify(data));
    const w = window.open(
      '/dashboard/session/quiz-popup',
      'edos_quiz',
      'width=480,height=600,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes',
    );
    // Focus the popup if the browser allowed it.
    if (w) w.focus();
  } catch {
    // If popups are blocked, the questions just won't show. Not worth crashing.
  }
}

export default function SessionPage() {
  const router = useRouter();

  const [session, setSession] = useState<SessionView | null>(null);
  const [loading, setLoading] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState<null | 'starting' | 'pausing' | 'ending'>(null);
  const [error, setError] = useState('');

  const [quiz, setQuiz] = useState<SessionCheck | null>(null);
  const [quizAnswer, setQuizAnswer] = useState('');
  const [quizSubmitting, setQuizSubmitting] = useState(false);
  const [quizResult, setQuizResult] = useState<CheckResult | null>(null);
  const [quizCount, setQuizCount] = useState(0);

  const [endQuestions, setEndQuestions] = useState<any[]>([]);
  const [endAssessmentId, setEndAssessmentId] = useState<string | null>(null);
  const [endAnswers, setEndAnswers] = useState<Record<string, string>>({});
  const [endResult, setEndResult] = useState<any>(null);
  const [endSubmitting, setEndSubmitting] = useState(false);
  const [wrapUpTopic, setWrapUpTopic] = useState('');

  const sessionRef = useRef<SessionView | null>(null);
  /** Mirrors `quiz` so the pulse loop can read it without re-subscribing. */
  const quizRef = useRef<SessionCheck | null>(null);

  const isActive = session?.status === 'active';
  const isPaused = session?.status === 'paused';
  const showWrapUp = endQuestions.length > 0;

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    quizRef.current = quiz;
  }, [quiz]);

  /**
   * Adopt whatever the API reports. The web page is just another surface, so a
   * session started on the desktop agent or in the editor shows up here without
   * the learner doing anything.
   */
  const adopt = useCallback((next: SessionView | null) => {
    const live = next && (next.status === 'active' || next.status === 'paused') ? next : null;
    setSession(live);
    if (live) setElapsed(live.elapsedSeconds);
    return live;
  }, []);

  // Initial load: pick up a session that may already be running.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { session: active } = await api.getActiveSession();
        if (cancelled) return;

        if (active && (active.status === 'active' || active.status === 'paused')) {
          // Register this tab as a participant, then take the fuller view.
          const joined = await api.joinSession().catch(() => ({ session: active }));
          if (!cancelled) adopt(joined.session ?? active);
        }
      } catch {
        // A failed lookup should not block the start form.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [adopt]);

  /**
   * The pulse loop. Keeps the surface chips honest, collects a knowledge check
   * when the server says one is due, and notices a session ended elsewhere.
   */
  useEffect(() => {
    if (!session) return;

    let cancelled = false;

    const tick = async () => {
      try {
        const result = await api.sessionPulse(sessionRef.current?.id);
        if (cancelled) return;

        const live = adopt(result.session);

        if (!live) {
          resetLocalSessionState();
          // Ended somewhere else. Open the quiz as a popup if questions exist.
          if (result.endedSession?.quiz?.questions?.length) {
            openQuizPopup({
              questions: result.endedSession.quiz.questions,
              topic: result.endedSession.quiz.topic || result.endedSession.topic,
              sessionId: result.endedSession.id,
              elapsed: result.endedSession.elapsedSeconds,
            });
          }
          return;
        }

        // Only surface a check if we are not already showing one.
        // Open it as a SEPARATE popup window so it's in your face, not buried.
        if (result.check && !quizRef.current) {
          openQuizPopup({
            questions: [{ id: result.check.id, text: result.check.question }],
            topic: result.check.topic,
            sessionId: result.check.sessionId,
          });
          // Mark it locally so we don't reopen on the next tick.
          setQuiz(result.check);
          // Clear it after a reasonable time so the next one can fire.
          setTimeout(() => setQuiz(null), 90_000);
        }
      } catch {
        // Keep the last known state rather than flickering on a blip.
      }
    };

    const id = setInterval(tick, PULSE_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [session?.id, adopt]);

  // Wall-clock ticker. The server reports elapsed time from startTime, so this
  // keeps counting while paused and re-syncs on every heartbeat.
  useEffect(() => {
    if (!session) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [session?.id]);

  const resetLocalSessionState = () => {
    setQuiz(null);
    setQuizAnswer('');
    setQuizResult(null);
  };

  // --- actions --------------------------------------------------------------

  const start = async () => {
    if (!topic.trim() || busy) return;
    setBusy('starting');
    setError('');

    try {
      const { session: started } = await api.startUnifiedSession(topic.trim());
      adopt(started);
      setQuizCount(0);
      setTopic('');
    } catch (e: any) {
      setError(e?.message || 'Could not start the session.');
    } finally {
      setBusy(null);
    }
  };

  const togglePause = async () => {
    if (!session || busy) return;
    setBusy('pausing');
    setError('');

    try {
      const { session: next } = isPaused ? await api.resumeSession() : await api.pauseSession();
      adopt(next);
    } catch (e: any) {
      setError(e?.message || 'Could not change the session.');
    } finally {
      setBusy(null);
    }
  };

  const end = async () => {
    if (!session || busy) return;
    const endingTopic = session.topic;

    // Open the popup window IMMEDIATELY on the user's click. Browsers block
    // window.open if it runs after an await (no longer "user-initiated"). So
    // we open it now and write the quiz data into it once the API responds.
    const popupWindow = window.open(
      '/dashboard/session/quiz-popup',
      'edos_quiz',
      'width=480,height=600,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes',
    );

    setBusy('ending');
    setError('');
    resetLocalSessionState();

    try {
      const result = await api.endUnifiedSession();
      setSession(null);

      if (result?.quiz?.questions?.length && popupWindow) {
        // The popup page reads from sessionStorage on load. Write the data now
        // and tell it to reload so it picks it up.
        const quizData = {
          questions: result.quiz.questions,
          topic: result.quiz.topic || endingTopic,
          sessionId: result.session?.id,
          elapsed: result.session?.elapsedSeconds,
        };
        sessionStorage.setItem('edos_quiz_popup', JSON.stringify(quizData));

        // The popup may still be loading. Give it a moment then tell it to
        // re-read the data. If it already loaded and found nothing, reload it.
        setTimeout(() => {
          try {
            popupWindow.location.href = '/dashboard/session/quiz-popup';
          } catch {
            // Cross-origin or already closed — nothing we can do.
          }
        }, 300);
      } else if (!result?.quiz?.questions?.length && popupWindow) {
        // No quiz generated — close the empty popup.
        popupWindow.close();
        router.push('/dashboard');
      } else {
        router.push('/dashboard');
      }
    } catch (e: any) {
      // Close the popup on error so the user doesn't have a blank window.
      if (popupWindow) popupWindow.close();
      setError(e?.message || 'Could not end the session.');
    } finally {
      setBusy(null);
    }
  };

  const submitIntervalQuiz = async () => {
    if (!quiz || !quizAnswer.trim()) return;

    setQuizSubmitting(true);
    try {
      setQuizResult(await api.answerCheck(quiz.id, quizAnswer, quiz.sessionId));
      setQuizCount((c) => c + 1);
    } catch {
      // Be explicit that this was not graded rather than implying it was right.
      setQuizResult({
        correct: null,
        feedback: 'Could not score that answer. Nothing was recorded.',
        score: null,
        maxScore: 0,
        degraded: true,
      });
    } finally {
      setQuizSubmitting(false);
    }
  };

  const skipQuiz = async () => {
    const current = quiz;
    setQuiz(null);
    setQuizAnswer('');
    setQuizResult(null);
    // Recorded as skipped: being interrupted and declining is itself a signal,
    // but it carries no score so it cannot move mastery.
    if (current) await api.skipCheck(current.id, current.sessionId).catch(() => {});
  };

  const dismissQuiz = () => {
    setQuiz(null);
    setQuizAnswer('');
    setQuizResult(null);
  };

  const submitWrapUp = async () => {
    if (!endAssessmentId) return;
    setEndSubmitting(true);

    try {
      const answers = endQuestions.map((q: any) => ({
        questionId: q.id,
        answer: endAnswers[q.id] || '',
      }));
      setEndResult(await api.submitAssessment(endAssessmentId, answers));
    } catch (e: any) {
      setError(e?.message || 'Could not score the assessment.');
    } finally {
      setEndSubmitting(false);
    }
  };

  // --- derived --------------------------------------------------------------

  const surfaces = useMemo<SurfaceRow[]>(() => {
    if (!session) return [];

    const blocked = new Map<string, BlockedSurface>(
      session.blockedSurfaces.map((b) => [b.surface, b]),
    );
    const joined = new Map(session.participants.map((p) => [p.surface, p]));

    return SURFACE_ORDER.filter(
      (s) => joined.has(s) || blocked.has(s) || session.awaitingSurfaces.includes(s),
    ).map((surface) => {
      const participant = joined.get(surface);
      const block = blocked.get(surface);

      if (participant && participant.status !== 'left') {
        return {
          surface,
          state: participant.status === 'live' ? 'live' : 'idle',
          deviceName: participant.deviceName,
          eventCount: participant.eventCount,
        };
      }

      if (block) {
        return { surface, state: 'blocked', eventCount: 0, permission: block.permission };
      }

      return { surface, state: 'waiting', eventCount: 0 };
    });
  }, [session]);

  const capturingCount = surfaces.filter((s) => s.state === 'live').length;

  // --- views ----------------------------------------------------------------

  if (loading) return <PageLoading />;

  if (showWrapUp) {
    return (
      <WrapUp
        topic={wrapUpTopic}
        questions={endQuestions}
        answers={endAnswers}
        onAnswer={(id, value) => setEndAnswers((prev) => ({ ...prev, [id]: value }))}
        result={endResult}
        submitting={endSubmitting}
        onSubmit={submitWrapUp}
        onDone={() => router.push('/dashboard')}
      />
    );
  }

  if (!session) {
    return (
      <div className="mx-auto w-full max-w-lg px-5 py-16 animate-in sm:px-8">
        <div className="space-y-2 text-center">
          <h1 className="page-title">Start a session</h1>
          <p className="muted text-sm">
            One session covers everything. Your desktop, browser and editor join automatically.
          </p>
        </div>

        <div className="mt-8 space-y-3">
          <Input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && start()}
            placeholder="What are you learning?"
            aria-label="Session topic"
            autoFocus
          />
          <Button onClick={start} disabled={!topic.trim()} loading={busy === 'starting'} block>
            Begin session
          </Button>
        </div>

        {error && (
          <div className="mt-4">
            <Alert tone="danger">{error}</Alert>
          </div>
        )}

        <div className="mt-10 space-y-2">
          <p className="eyebrow">What gets tracked</p>
          <div className="list">
            {SURFACE_ORDER.map((surface) => {
              const meta = SURFACE_META[surface];
              return (
                <div key={surface} className="list-row">
                  <Icon name={meta.icon} className="h-4 w-4 shrink-0 text-gray-400" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{meta.label}</span>
                  <span className="muted ml-auto text-xs">{meta.blurb}</span>
                </div>
              );
            })}
          </div>
          <p className="muted text-xs">
            Surfaces you have not enabled stay off.{' '}
            <Link href="/dashboard/settings" className="underline hover:no-underline">
              Manage permissions
            </Link>
            .
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-10 animate-in sm:px-8">
      {/* Timer */}
      <div className="space-y-3 py-6 text-center">
        <p className="eyebrow">
          {isPaused ? 'Paused' : capturingCount > 0 ? `Capturing on ${capturingCount}` : 'Running'}
        </p>
        <h1 className="text-base font-medium text-gray-700 dark:text-gray-300">{session.topic}</h1>
        <div
          className={`font-mono text-5xl font-light tabular-nums tracking-tight ${
            isPaused ? 'text-gray-400' : 'text-gray-900 dark:text-gray-100'
          }`}
        >
          {formatTime(elapsed)}
        </div>
        <p className="muted text-xs">
          Started on {SURFACE_META[session.initiatedBy]?.label ?? session.initiatedBy}
          {session.checkCount > 0 &&
            ` · ${session.checkCount} check${session.checkCount === 1 ? '' : 's'}`}
          {/* Makes the cadence visible before the first popup arrives. */}
          {isActive &&
            !quiz &&
            session.nextCheckInSeconds !== null &&
            ` · next check in ${session.nextCheckInSeconds}s`}
        </p>
      </div>

      {error && (
        <div className="mb-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      {/* Retention check */}
      {quiz && (
        <Card className="mb-5 border-primary-200 bg-primary-50/40 dark:border-primary-900 dark:bg-primary-900/10">
          <div className="flex items-center gap-2">
            <StatusDot tone="live" />
            <p className="eyebrow text-primary-600 dark:text-primary-400">Quick check</p>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-gray-900 dark:text-gray-100">
            {quiz.question}
          </p>

          {!quizResult ? (
            <div className="mt-4 space-y-3">
              <Textarea
                value={quizAnswer}
                onChange={(e) => setQuizAnswer(e.target.value)}
                placeholder="Answer in a sentence or two"
                aria-label="Your answer"
                rows={3}
                autoFocus
              />
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={skipQuiz} block>
                  Skip
                </Button>
                <Button
                  size="sm"
                  onClick={submitIntervalQuiz}
                  disabled={!quizAnswer.trim()}
                  loading={quizSubmitting}
                  block
                >
                  Answer
                </Button>
              </div>
              <p className="muted text-xs">
                Checks run every {quiz.nextInSeconds}s while a session is active, on whichever
                surface you are using.
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium">
                  {quizResult.correct === null
                    ? 'Not scored'
                    : quizResult.correct
                      ? 'That holds up'
                      : 'Not quite'}
                </span>
                <span className="muted font-mono text-xs tabular-nums">
                  {quizResult.score === null
                    ? '—'
                    : `${quizResult.score}/${quizResult.maxScore}`}
                </span>
              </div>
              <Alert tone={quizResult.correct === null ? 'warning' : quizResult.correct ? 'info' : 'warning'}>
                {quizResult.correct === null
                  ? 'This one could not be scored, so nothing was recorded.'
                  : quizResult.feedback}
              </Alert>
              <Button size="sm" onClick={dismissQuiz} block>
                Continue
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* Surfaces */}
      <Section
        title="Surfaces"
        description={
          session.mode === 'multi'
            ? 'Everything below feeds the same session.'
            : 'Only this browser is in the session so far.'
        }
      >
        <div className="list">
          {surfaces.map((row) => (
            <SurfaceRowItem key={row.surface} row={row} />
          ))}
        </div>
      </Section>

      {session.blockedSurfaces.length > 0 && (
        <div className="mt-4">
          <Alert tone="info">
            {session.blockedSurfaces.map((b) => b.label).join(', ')}{' '}
            {session.blockedSurfaces.length === 1 ? 'is' : 'are'} switched off, so nothing is captured
            there.{' '}
            <Link href="/dashboard/settings" className="underline hover:no-underline">
              Turn on in settings
            </Link>{' '}
            and it will join this session on its own.
          </Alert>
        </div>
      )}

      {/* Controls */}
      <div className="mt-8 flex gap-2">
        <Button
          variant="secondary"
          onClick={togglePause}
          loading={busy === 'pausing'}
          icon={isPaused ? 'play' : 'pause'}
          block
        >
          {isPaused ? 'Resume' : 'Pause everywhere'}
        </Button>
        <Button variant="danger" onClick={end} loading={busy === 'ending'} icon="stop" block>
          End session
        </Button>
      </div>

      <p className="muted mt-3 text-center text-xs">
        {isPaused
          ? 'Every surface has stopped capturing. Time keeps counting.'
          : 'Pausing or ending applies to your desktop, browser and editor too.'}
      </p>
    </div>
  );
}

/** One surface, with why it is or is not capturing. */
function SurfaceRowItem({ row }: { row: SurfaceRow }) {
  const meta = SURFACE_META[row.surface] ?? {
    label: row.surface,
    icon: 'globe' as IconName,
    blurb: '',
  };

  const detail =
    row.state === 'blocked'
      ? `Needs ${humanisePermission(row.permission)} in settings`
      : row.state === 'waiting'
        ? 'Not connected yet'
        : row.deviceName || meta.blurb;

  return (
    <div className="list-row">
      <Icon
        name={meta.icon}
        className={`h-4 w-4 shrink-0 ${row.state === 'live' ? 'text-gray-600 dark:text-gray-300' : 'text-gray-400'}`}
      />
      <div className="min-w-0">
        <p className="truncate text-sm text-gray-800 dark:text-gray-200">{meta.label}</p>
        <p className="muted truncate text-xs">{detail}</p>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {row.eventCount > 0 && (
          <span className="muted text-2xs tabular-nums">{row.eventCount} events</span>
        )}
        <SurfaceBadge state={row.state} />
      </div>
    </div>
  );
}

function SurfaceBadge({ state }: { state: SurfaceState }) {
  if (state === 'live') return <Badge tone="success">Live</Badge>;
  if (state === 'idle') return <Badge tone="warning">Idle</Badge>;
  if (state === 'blocked') return <Badge tone="neutral">Off</Badge>;
  return <Badge tone="neutral">Waiting</Badge>;
}

/** Map a permission field name onto the label shown in settings. */
function humanisePermission(permission?: string): string {
  switch (permission) {
    case 'screenContext':
      return 'screen context';
    case 'browser':
      return 'browser activity';
    case 'ide':
      return 'editor activity';
    case 'documents':
      return 'documents';
    case 'aiPlatforms':
      return 'AI platforms';
    default:
      return permission || 'a permission';
  }
}

interface WrapUpProps {
  topic: string;
  questions: any[];
  answers: Record<string, string>;
  onAnswer: (id: string, value: string) => void;
  result: any;
  submitting: boolean;
  onSubmit: () => void;
  onDone: () => void;
}

/** Short retention check shown once the session has ended. */
function WrapUp({
  topic,
  questions,
  answers,
  onAnswer,
  result,
  submitting,
  onSubmit,
  onDone,
}: WrapUpProps) {
  if (result) {
    // percentage is null when nothing could be graded, which must not read as 0.
    const scored = typeof result.percentage === 'number';

    return (
      <div className="mx-auto w-full max-w-lg px-5 py-16 text-center animate-in sm:px-8">
        <div className="font-mono text-4xl font-light tabular-nums text-gray-900 dark:text-gray-100">
          {scored ? `${Math.round(result.percentage)}%` : '—'}
        </div>
        <h1 className="page-title mt-4">Session wrapped up</h1>
        <p className="muted mt-2 text-sm">
          {scored ? result.feedback : 'This one could not be scored, so nothing was recorded.'}
        </p>
        <div className="mt-8">
          <Button onClick={onDone} block>
            Back to dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-12 animate-in sm:px-8">
      <div className="space-y-2 text-center">
        <h1 className="page-title">Session complete</h1>
        <p className="muted text-sm">
          {questions.length} quick question{questions.length === 1 ? '' : 's'} on {topic}.
        </p>
      </div>

      <div className="mt-8 space-y-4">
        {questions.map((q: any, i: number) => (
          <Card key={q.id}>
            <p className="text-sm leading-relaxed text-gray-900 dark:text-gray-100">
              <span className="mr-2 text-gray-400 tabular-nums">{i + 1}.</span>
              {q.text}
            </p>

            {q.options?.length > 0 ? (
              <div className="mt-4 space-y-2" role="radiogroup" aria-label={q.text}>
                {q.options.map((opt: string, oi: number) => {
                  const selected = answers[q.id] === opt;
                  return (
                    <button
                      key={oi}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => onAnswer(q.id, opt)}
                      className={`w-full rounded-lg border px-4 py-2.5 text-left text-sm transition-colors ${
                        selected
                          ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300'
                          : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mt-4">
                <Textarea
                  value={answers[q.id] || ''}
                  onChange={(e) => onAnswer(q.id, e.target.value)}
                  placeholder="Your answer"
                  aria-label={q.text}
                  rows={3}
                />
              </div>
            )}
          </Card>
        ))}
      </div>

      <div className="mt-6 flex gap-2">
        <Button variant="ghost" onClick={onDone}>
          Skip
        </Button>
        <Button
          onClick={onSubmit}
          loading={submitting}
          disabled={Object.keys(answers).length === 0}
          block
        >
          Submit
        </Button>
      </div>
    </div>
  );
}

function formatTime(total: number): string {
  const s = Math.max(0, total);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}



