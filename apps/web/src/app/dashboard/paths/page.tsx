'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  Icon,
  Page,
  PageHeader,
  PageLoading,
  ProgressBar,
  Textarea,
} from '@/components/ui';

export default function LearningPathsPage() {
  const [paths, setPaths] = useState<any[]>([]);
  const [activePath, setActivePath] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [topic, setTopic] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [quizState, setQuizState] = useState<any>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadPaths(true);
  }, []);

  const loadPaths = async (selectFirst = false) => {
    try {
      const data = await api.request<any[]>('/paths');
      setPaths(data);
      if (selectFirst && data.length > 0) await loadPath(data[0].id);
    } catch (err: any) {
      setError(err.message || 'Could not load your paths');
    } finally {
      setLoading(false);
    }
  };

  const loadPath = async (id: string) => {
    try {
      setActivePath(await api.request<any>(`/paths/${id}`));
      setQuizState(null);
      setResult(null);
    } catch (err: any) {
      setError(err.message || 'Could not open that path');
    }
  };

  const generatePath = async () => {
    if (!topic.trim()) return;
    setGenerating(true);
    setError('');

    try {
      const data = await api.request<any>('/paths/generate', {
        method: 'POST',
        body: JSON.stringify({ topic }),
      });
      setActivePath(data);
      setTopic('');
      setShowCreate(false);
      await loadPaths();
    } catch (err: any) {
      setError(err.message || 'Could not build that path');
    } finally {
      setGenerating(false);
    }
  };

  const startVerification = async (nodeId: string) => {
    if (!activePath) return;
    setError('');

    try {
      const data = await api.request<any>(`/paths/${activePath.id}/verify/${nodeId}`, {
        method: 'POST',
        body: '{}',
      });
      if (data.error) {
        setError(data.error);
        return;
      }
      setQuizState({ nodeId, ...data });
      setAnswers({});
      setResult(null);
    } catch (err: any) {
      setError(err.message || 'Could not start the check');
    }
  };

  const submitVerification = async () => {
    if (!quizState || !activePath) return;
    setSubmitting(true);
    setError('');

    try {
      const data = await api.request<any>(`/paths/${activePath.id}/submit/${quizState.nodeId}`, {
        method: 'POST',
        body: JSON.stringify({
          quizId: quizState.quizId,
          answers: quizState.questions.map((q: any) => ({
            questionId: q.id,
            answer: answers[q.id] || '',
          })),
        }),
      });
      setResult(data);
      setQuizState(null);
      await loadPath(activePath.id);
      await loadPaths();
    } catch (err: any) {
      setError(err.message || 'Could not submit your answers');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <PageLoading />;

  const nodes = activePath?.nodes || [];
  const verifiedCount = nodes.filter((n: any) => n.status === 'verified').length;

  return (
    <Page width="wide">
      <PageHeader
        title="Learning paths"
        description="A staged plan for a topic, where each step is verified before the next unlocks."
        actions={
          <Button variant="primary" icon="plus" onClick={() => setShowCreate(true)}>
            New path
          </Button>
        }
      />

      {error && <Alert>{error}</Alert>}

      {paths.length === 0 ? (
        <EmptyState
          icon="path"
          title="No paths yet"
          description="Name a topic and edOS breaks it into ordered steps, checking your understanding at each one."
          action={
            <Button variant="primary" onClick={() => setShowCreate(true)}>
              Create a path
            </Button>
          }
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-4">
          <aside className="space-y-2 lg:col-span-1">
            {paths.map((p) => {
              const active = activePath?.id === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => loadPath(p.id)}
                  className={`w-full rounded-xl border p-3 text-left transition-colors ${
                    active
                      ? 'border-gray-300 bg-surface dark:border-gray-700 dark:bg-dark-surface'
                      : 'bg-surface hover:border-gray-300 dark:bg-dark-surface dark:hover:border-gray-700'
                  }`}
                >
                  <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                    {p.title}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <ProgressBar value={p.progress} className="flex-1" />
                    <span className="text-[10px] tabular-nums text-gray-500 dark:text-gray-400">
                      {Math.round(p.progress)}%
                    </span>
                  </div>
                </button>
              );
            })}
          </aside>

          <div className="space-y-4 lg:col-span-3">
            {result && (
              <Alert tone={result.passed ? 'info' : 'warning'}>
                <strong className="font-medium">
                  {result.passed ? 'Step verified.' : 'Not passed yet.'}
                </strong>{' '}
                Scored {Math.round(result.percentage)}%. {result.feedback}
              </Alert>
            )}

            {quizState && (
              <Card className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-2xs text-gray-500 dark:text-gray-400">Verifying</p>
                    <h2 className="mt-0.5 text-sm font-medium text-gray-900 dark:text-gray-100">
                      {quizState.topic}
                    </h2>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setQuizState(null)}>
                    Cancel
                  </Button>
                </div>

                {quizState.questions.map((q: any, i: number) => (
                  <div key={q.id} className="space-y-2">
                    <p className="text-2xs tabular-nums text-gray-500 dark:text-gray-400">
                      {i + 1} of {quizState.questions.length}
                    </p>
                    <p className="text-sm leading-relaxed text-gray-900 dark:text-gray-100">
                      {q.text}
                    </p>
                    <Textarea
                      value={answers[q.id] || ''}
                      onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                      placeholder="Your answer"
                      aria-label={`Answer to question ${i + 1}`}
                    />
                  </div>
                ))}

                <Button variant="primary" block onClick={submitVerification} loading={submitting}>
                  Submit answers
                </Button>
              </Card>
            )}

            {activePath && !quizState && (
              <Card padded={false}>
                <div className="space-y-3 border-b p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">
                        {activePath.title}
                      </h2>
                      {activePath.description && (
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {activePath.description}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xl font-semibold tabular-nums text-gray-900 dark:text-gray-50">
                        {Math.round(activePath.progress)}%
                      </p>
                      <p className="text-[10px] tabular-nums text-gray-500 dark:text-gray-400">
                        {verifiedCount} of {nodes.length} verified
                      </p>
                    </div>
                  </div>
                  <ProgressBar value={activePath.progress} label="Path progress" />
                </div>

                <ol className="divide-y">
                  {nodes.map((node: any, i: number) => (
                    <PathStep key={node.id} node={node} index={i} onVerify={startVerification} />
                  ))}
                </ol>
              </Card>
            )}
          </div>
        </div>
      )}

      <Dialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="New learning path"
        description="Name a topic. edOS builds an ordered curriculum with a check at every step."
        footer={
          <>
            <Button onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={generatePath}
              loading={generating}
              disabled={!topic.trim()}
            >
              Generate path
            </Button>
          </>
        }
      >
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && generatePath()}
          placeholder="Distributed systems, Rust ownership, transformers…"
          aria-label="Topic"
          className="block w-full rounded-lg border bg-surface px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/10 dark:bg-dark-surface dark:text-gray-100"
        />
      </Dialog>
    </Page>
  );
}

function PathStep({
  node,
  index,
  onVerify,
}: {
  node: any;
  index: number;
  onVerify: (nodeId: string) => void;
}) {
  const locked = node.status === 'locked';
  const verified = node.status === 'verified';
  const available = node.status === 'available' || node.status === 'in_progress';

  return (
    <li className={`flex items-start gap-3.5 px-5 py-3.5 ${locked ? 'opacity-55' : ''}`}>
      <span
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-medium tabular-nums ${
          verified
            ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
            : available
              ? 'border border-gray-900 text-gray-900 dark:border-gray-100 dark:text-gray-100'
              : 'border text-gray-400 dark:text-gray-500'
        }`}
      >
        {verified ? <Icon name="check" className="h-3 w-3" /> : index + 1}
      </span>

      <div className="min-w-0 flex-1">
        <p
          className={`text-sm ${
            verified
              ? 'text-gray-500 dark:text-gray-400'
              : 'text-gray-900 dark:text-gray-100'
          }`}
        >
          {node.title}
        </p>
        {node.description && (
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{node.description}</p>
        )}
        {node.selfLearned && (
          <span className="mt-1.5 inline-block">
            <Badge>Self-learned</Badge>
          </span>
        )}
      </div>

      <div className="shrink-0">
        {verified && (
          <span className="text-xs font-medium tabular-nums text-gray-500 dark:text-gray-400">
            {Math.round(node.score ?? 0)}%
          </span>
        )}
        {available && (
          <Button size="sm" variant="primary" onClick={() => onVerify(node.id)}>
            Verify
          </Button>
        )}
        {locked && <Icon name="lock" className="h-3.5 w-3.5 text-gray-300 dark:text-gray-600" />}
      </div>
    </li>
  );
}
