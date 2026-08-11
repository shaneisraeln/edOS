'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

interface Assessment {
  id: string;
  topic: string;
  subtopic?: string;
  difficulty: string;
  type: string;
  score: number | null;
  maxScore: number;
  status: string;
  feedback?: string;
  generatedAt: string;
  completedAt?: string;
  questions: any[];
}

export default function AssessmentHistoryPage() {
  const router = useRouter();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const data = await api.getAssessmentHistory(50);
      setAssessments(data);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoading(false);
    }
  };

  const selected = assessments.find((a) => a.id === selectedId);

  const getScoreColor = (score: number, max: number) => {
    const pct = (score / max) * 100;
    if (pct >= 80) return 'text-green-600';
    if (pct >= 60) return 'text-blue-600';
    if (pct >= 40) return 'text-yellow-600';
    return 'text-red-500';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-500">Loading assessment history...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8">
      <div className="max-w-5xl mx-auto">
        {assessments.length === 0 ? (
          <div className="card text-center py-12 space-y-4">
            <span className="text-4xl">📝</span>
            <h2 className="text-lg font-semibold">No assessments yet</h2>
            <p className="text-sm text-gray-500">Take your first assessment to start tracking progress.</p>
            <button onClick={() => router.push('/dashboard/assessment')} className="btn-primary">
              Take Assessment
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* List */}
            <div className="lg:col-span-2 space-y-3">
              {assessments.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setSelectedId(a.id)}
                  className={`card w-full text-left transition-all hover:ring-1 hover:ring-primary-300 ${
                    selectedId === a.id ? 'ring-2 ring-primary-500' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{a.topic}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-400 capitalize">{a.difficulty}</span>
                        <span className="text-xs text-gray-300">•</span>
                        <span className="text-xs text-gray-400">
                          {new Date(a.generatedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      {a.status === 'completed' && a.score !== null ? (
                        <span className={`text-lg font-bold ${getScoreColor(a.score, a.maxScore)}`}>
                          {Math.round((a.score / a.maxScore) * 100)}%
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400 italic">
                          {a.status === 'pending' ? 'Not started' : a.status}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Detail Panel */}
            <div className="sticky top-6">
              {selected ? (
                <div className="card space-y-4">
                  <h3 className="font-semibold">{selected.topic}</h3>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Status</span>
                      <span className="capitalize font-medium">{selected.status}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Difficulty</span>
                      <span className="capitalize">{selected.difficulty}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Date</span>
                      <span>{new Date(selected.generatedAt).toLocaleString()}</span>
                    </div>
                    {selected.score !== null && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Score</span>
                        <span className={`font-bold ${getScoreColor(selected.score, selected.maxScore)}`}>
                          {selected.score} / {selected.maxScore}
                        </span>
                      </div>
                    )}
                  </div>

                  {selected.feedback && (
                    <div className="bg-surface-tertiary dark:bg-dark-tertiary rounded-lg p-3">
                      <p className="text-xs font-medium text-gray-500 mb-1">AI Feedback</p>
                      <p className="text-sm text-gray-700 dark:text-gray-300">{selected.feedback}</p>
                    </div>
                  )}

                  {/* Questions breakdown */}
                  {selected.questions && selected.questions.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-gray-500">Questions ({selected.questions.length})</p>
                      {selected.questions.map((q: any, i: number) => (
                        <div key={q.id || i} className="text-xs p-2 rounded bg-surface-tertiary dark:bg-dark-tertiary">
                          <p className="text-gray-700 dark:text-gray-300">{q.text || `Question ${i + 1}`}</p>
                          {q.score !== undefined && (
                            <p className="mt-1 text-gray-500">Score: {q.score}/{q.maxScore}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="card text-center py-8">
                  <p className="text-sm text-gray-400">Select an assessment to view details</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
