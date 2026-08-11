'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export default function LearningPathsPage() {
  const router = useRouter();
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

  useEffect(() => { loadPaths(); }, []);

  const loadPaths = async () => {
    try {
      const data = await api.request<any[]>('/paths');
      setPaths(data);
      if (data.length > 0 && !activePath) loadPath(data[0].id);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const loadPath = async (id: string) => {
    const data = await api.request<any>(`/paths/${id}`);
    setActivePath(data);
    setQuizState(null);
    setResult(null);
  };

  const generatePath = async () => {
    if (!topic.trim()) return;
    setGenerating(true);
    try {
      const data = await api.request<any>('/paths/generate', {
        method: 'POST', body: JSON.stringify({ topic }),
      });
      setActivePath(data);
      setTopic('');
      setShowCreate(false);
      loadPaths();
    } catch (e) { console.error(e); }
    finally { setGenerating(false); }
  };

  const startVerification = async (nodeId: string) => {
    if (!activePath) return;
    const data = await api.request<any>(`/paths/${activePath.id}/verify/${nodeId}`, { method: 'POST', body: '{}' });
    if (data.error) { alert(data.error); return; }
    setQuizState({ nodeId, ...data });
    setAnswers({});
    setResult(null);
  };

  const submitVerification = async () => {
    if (!quizState || !activePath) return;
    setSubmitting(true);
    try {
      const answerList = quizState.questions.map((q: any) => ({
        questionId: q.id, answer: answers[q.id] || '',
      }));
      const data = await api.request<any>(`/paths/${activePath.id}/submit/${quizState.nodeId}`, {
        method: 'POST', body: JSON.stringify({ quizId: quizState.quizId, answers: answerList }),
      });
      setResult(data);
      setQuizState(null);
      loadPath(activePath.id);
    } catch (e) { console.error(e); }
    finally { setSubmitting(false); }
  };

  const totalNodes = activePath?.nodes?.length || 0;
  const verifiedNodes = activePath?.nodes?.filter((n: any) => n.status === 'verified').length || 0;

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface-secondary dark:bg-dark">
        <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-surface-secondary dark:bg-dark">
      {/* Top Bar */}
      <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-surface">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <button onClick={() => router.push('/dashboard')} className="text-sm text-gray-500 hover:text-gray-700">
            ← Dashboard
          </button>
          <h1 className="text-base font-semibold">Learning Paths</h1>
          <button onClick={() => setShowCreate(!showCreate)} className="text-sm bg-primary-600 text-white px-3 py-1.5 rounded-lg hover:bg-primary-700">
            + New Path
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6">
        {/* Create new path */}
        {showCreate && (
          <div className="mb-6 bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
            <div>
              <h3 className="font-medium text-sm mb-1">What do you want to learn?</h3>
              <p className="text-xs text-gray-400">We'll create a structured curriculum with step-by-step verification.</p>
            </div>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="input"
              placeholder="e.g. Deep Learning, System Design, Kubernetes..."
              onKeyDown={(e) => e.key === 'Enter' && generatePath()}
            />
            <div className="flex gap-2">
              <button onClick={() => setShowCreate(false)} className="btn-secondary flex-1 text-sm">Cancel</button>
              <button onClick={generatePath} className="btn-primary flex-1 text-sm" disabled={!topic.trim() || generating}>
                {generating ? 'Creating curriculum...' : 'Generate Path'}
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar: Path list */}
          <div className="lg:col-span-1 space-y-2">
            {paths.length === 0 && !showCreate ? (
              <div className="text-center py-8">
                <p className="text-sm text-gray-400 mb-3">No paths yet</p>
                <button onClick={() => setShowCreate(true)} className="text-sm text-primary-600 hover:underline">
                  Create your first path
                </button>
              </div>
            ) : (
              paths.map((p) => (
                <button
                  key={p.id}
                  onClick={() => loadPath(p.id)}
                  className={`w-full text-left p-3 rounded-xl border transition-all ${
                    activePath?.id === p.id
                      ? 'border-primary-300 dark:border-primary-700 bg-primary-50 dark:bg-primary-900/10'
                      : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-surface hover:border-gray-300'
                  }`}
                >
                  <p className="text-sm font-medium truncate">{p.title}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 rounded-full transition-all duration-300"
                        style={{ width: `${p.progress}%` }}
                      />
                    </div>
                    <span className="text-[11px] font-medium text-gray-500">{Math.round(p.progress)}%</span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1 capitalize">{p.status}</p>
                </button>
              ))
            )}
          </div>

          {/* Main: Active path */}
          <div className="lg:col-span-3">
            {/* Result Banner */}
            {result && (
              <div className={`mb-4 p-4 rounded-xl border ${result.passed ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800' : 'bg-orange-50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-800'}`}>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{result.passed ? '✅' : '🔄'}</span>
                  <div>
                    <p className="text-sm font-semibold">{result.passed ? 'Step Verified!' : 'Not quite — try again'}</p>
                    <p className="text-xs text-gray-500">Score: {result.percentage}% — {result.feedback}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Quiz */}
            {quizState && (
              <div className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4 mb-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">Verify: {quizState.topic}</h3>
                  <button onClick={() => setQuizState(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                </div>
                {quizState.questions.map((q: any, i: number) => (
                  <div key={q.id} className="space-y-2">
                    <p className="text-sm"><span className="font-medium text-primary-600">{i + 1}.</span> {q.text}</p>
                    <textarea
                      value={answers[q.id] || ''}
                      onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                      className="input min-h-[70px] text-sm"
                      placeholder="Your answer..."
                    />
                  </div>
                ))}
                <button onClick={submitVerification} className="btn-primary w-full text-sm" disabled={submitting}>
                  {submitting ? 'Scoring...' : 'Submit Answers'}
                </button>
              </div>
            )}

            {/* Path Display */}
            {activePath && !quizState && (
              <div className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                {/* Header */}
                <div className="p-5 border-b border-gray-100 dark:border-gray-800">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h2 className="font-semibold">{activePath.title}</h2>
                      {activePath.description && <p className="text-xs text-gray-400 mt-0.5">{activePath.description}</p>}
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-primary-600">{Math.round(activePath.progress)}%</p>
                      <p className="text-[11px] text-gray-400">{verifiedNodes}/{totalNodes} verified</p>
                    </div>
                  </div>
                  {/* Big progress bar */}
                  <div className="h-2.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-primary-500 to-green-500 rounded-full transition-all duration-500"
                      style={{ width: `${activePath.progress}%` }}
                    />
                  </div>
                </div>

                {/* Steps */}
                <div className="p-5">
                  <div className="relative">
                    {/* Vertical line */}
                    <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-gray-200 dark:bg-gray-700" />

                    {(activePath.nodes || []).map((node: any, i: number) => {
                      const isLocked = node.status === 'locked';
                      const isVerified = node.status === 'verified';
                      const isAvailable = node.status === 'available' || node.status === 'in_progress';

                      return (
                        <div key={node.id} className={`relative flex items-start gap-4 pb-5 last:pb-0 ${isLocked ? 'opacity-50' : ''}`}>
                          {/* Circle */}
                          <div className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                            isVerified ? 'bg-green-500 text-white' :
                            isAvailable ? 'bg-primary-600 text-white' :
                            'bg-gray-200 dark:bg-gray-700 text-gray-400'
                          }`}>
                            {isVerified ? '✓' : i + 1}
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0 pt-0.5">
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className={`text-sm font-medium truncate ${isVerified ? 'line-through text-gray-400' : ''}`}>
                                  {node.title}
                                </p>
                                {node.description && (
                                  <p className="text-xs text-gray-400 mt-0.5 truncate">{node.description}</p>
                                )}
                                {node.selfLearned && (
                                  <span className="inline-block mt-1 text-[10px] bg-blue-50 dark:bg-blue-900/20 text-blue-600 px-1.5 py-0.5 rounded">
                                    Self-learned
                                  </span>
                                )}
                              </div>

                              <div className="flex-shrink-0">
                                {isVerified && (
                                  <span className="text-xs font-semibold text-green-600">{Math.round(node.score)}%</span>
                                )}
                                {isAvailable && (
                                  <button
                                    onClick={() => startVerification(node.id)}
                                    className="text-xs bg-primary-600 text-white px-3 py-1.5 rounded-lg hover:bg-primary-700 transition-colors"
                                  >
                                    Verify
                                  </button>
                                )}
                                {isLocked && (
                                  <span className="text-xs text-gray-300">🔒</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {!activePath && paths.length === 0 && !showCreate && (
              <div className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-gray-800 p-10 text-center space-y-4">
                <div className="text-5xl">🛤️</div>
                <h2 className="text-lg font-semibold">Start Your Learning Journey</h2>
                <p className="text-sm text-gray-500 max-w-sm mx-auto">
                  Create a structured path for any topic. edOS will break it into steps and verify your understanding at each stage.
                </p>
                <button onClick={() => setShowCreate(true)} className="btn-primary">
                  Create Your First Path
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
