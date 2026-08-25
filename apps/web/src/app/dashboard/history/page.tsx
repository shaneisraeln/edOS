'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  List,
  ListRow,
  Page,
  PageHeader,
  PageLoading,
} from '@/components/ui';

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
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    api
      .getAssessmentHistory(50)
      .then(setAssessments)
      .catch(() => setAssessments([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PageLoading />;

  const selected = assessments.find((a) => a.id === selectedId);

  return (
    <Page width="wide">
      <PageHeader
        title="History"
        description="Every assessment you have taken, with the score and feedback."
      />

      {assessments.length === 0 ? (
        <EmptyState
          icon="clock"
          title="No assessments yet"
          description="Take your first assessment and it will show up here with a score you can track over time."
          action={
            <ButtonLink href="/dashboard/assessment" variant="primary">
              Take an assessment
            </ButtonLink>
          }
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <List>
              {assessments.map((a) => {
                const pct =
                  a.status === 'completed' && a.score !== null && a.maxScore
                    ? Math.round((a.score / a.maxScore) * 100)
                    : null;

                return (
                  <ListRow
                    key={a.id}
                    onClick={() => setSelectedId(a.id)}
                    className={
                      selectedId === a.id ? 'bg-gray-50 dark:bg-dark-tertiary' : undefined
                    }
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-gray-900 dark:text-gray-100">
                        {a.topic}
                      </span>
                      <span className="mt-0.5 block text-2xs text-gray-500 dark:text-gray-400">
                        {formatType(a.type)} · {a.difficulty} ·{' '}
                        {new Date(a.generatedAt).toLocaleDateString()}
                      </span>
                    </span>
                    <span className="shrink-0">
                      {pct !== null ? (
                        <span className="text-sm font-medium tabular-nums text-gray-900 dark:text-gray-100">
                          {pct}%
                        </span>
                      ) : (
                        <Badge>{a.status === 'pending' ? 'Not started' : a.status}</Badge>
                      )}
                    </span>
                  </ListRow>
                );
              })}
            </List>
          </div>

          <div className="lg:col-span-2">
            <div className="lg:sticky lg:top-6">
              {selected ? (
                <Card className="space-y-4">
                  <div>
                    <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {selected.topic}
                    </h2>
                    <p className="mt-0.5 text-2xs text-gray-500 dark:text-gray-400">
                      {new Date(selected.generatedAt).toLocaleString()}
                    </p>
                  </div>

                  <dl className="space-y-2 text-xs">
                    <Row label="Status" value={selected.status} />
                    <Row label="Type" value={formatType(selected.type)} />
                    <Row label="Difficulty" value={selected.difficulty} />
                    {selected.score !== null && (
                      <Row
                        label="Score"
                        value={`${selected.score} / ${selected.maxScore}`}
                      />
                    )}
                  </dl>

                  {selected.feedback && (
                    <div className="rounded-lg border p-3">
                      <p className="text-2xs text-gray-500 dark:text-gray-400">Feedback</p>
                      <p className="mt-1 text-xs leading-relaxed text-gray-700 dark:text-gray-300">
                        {selected.feedback}
                      </p>
                    </div>
                  )}

                  {selected.questions?.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-2xs text-gray-500 dark:text-gray-400">
                        Questions ({selected.questions.length})
                      </p>
                      {selected.questions.map((q: any, i: number) => (
                        <div key={q.id || i} className="rounded-lg border p-2.5">
                          <p className="text-xs leading-relaxed text-gray-700 dark:text-gray-300">
                            {q.text || `Question ${i + 1}`}
                          </p>
                          {q.score !== undefined && (
                            <p className="mt-1 text-2xs tabular-nums text-gray-500 dark:text-gray-400">
                              {q.score} / {q.maxScore ?? 20}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              ) : (
                <Card className="py-10 text-center">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Select an assessment to see the breakdown.
                  </p>
                </Card>
              )}
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="font-medium capitalize text-gray-900 dark:text-gray-100">{value}</dd>
    </div>
  );
}

function formatType(type: string): string {
  return type.replace(/_/g, ' ');
}
