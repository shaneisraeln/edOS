'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import {
  Alert,
  Card,
  EmptyState,
  List,
  ListRow,
  Page,
  PageHeader,
  PageLoading,
  ProgressBar,
  Section,
} from '@/components/ui';

export default function CollegeDashboard() {
  const router = useRouter();
  const [students, setStudents] = useState<any[]>([]);
  const [weaknesses, setWeaknesses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    try {
      const [stuData, weakData] = await Promise.all([
        api.request<any>('/college/students'),
        api.request<any>('/college/weaknesses'),
      ]);
      setStudents(stuData.students || []);
      setWeaknesses(weakData || []);
    } catch (err: any) {
      if (err.message?.includes('403')) {
        router.push('/dashboard');
        return;
      }
      setError(err.message || 'Could not load the roster');
    } finally {
      setLoading(false);
    }
  };

  const loadStudent = async (id: string) => {
    setError('');
    try {
      setSelected(await api.request<any>(`/college/students/${id}`));
    } catch (err: any) {
      setError(err.message || 'Could not load that student');
    }
  };

  if (loading) return <PageLoading />;

  return (
    <Page width="wide">
      <PageHeader
        title="Faculty"
        description="Cohort progress and the topics the class is struggling with."
        backTo={{ href: '/dashboard', label: 'Dashboard' }}
      />

      {error && <Alert>{error}</Alert>}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section title={`Students (${students.length})`}>
            {students.length === 0 ? (
              <EmptyState icon="users" title="No students yet" />
            ) : (
              <List>
                {students.map((s: any) => (
                  <ListRow
                    key={s.id}
                    onClick={() => loadStudent(s.id)}
                    className={selected?.student?.id === s.id ? 'bg-gray-50 dark:bg-dark-tertiary' : undefined}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-gray-900 dark:text-gray-100">
                        {s.name}
                      </span>
                      <span className="mt-0.5 block truncate text-2xs text-gray-500 dark:text-gray-400">
                        {s.email}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-medium tabular-nums text-gray-900 dark:text-gray-100">
                        {Math.round(s.averageMastery ?? 0)}%
                      </span>
                      <span className="block text-2xs tabular-nums text-gray-500 dark:text-gray-400">
                        {s.conceptCount} concepts
                      </span>
                    </span>
                  </ListRow>
                ))}
              </List>
            )}
          </Section>

          <Section
            title="Class-wide weak spots"
            description="Topics with the highest average weakness across the cohort."
          >
            {weaknesses.length === 0 ? (
              <Card>
                <p className="text-xs text-gray-500 dark:text-gray-400">Not enough data yet.</p>
              </Card>
            ) : (
              <List>
                {weaknesses.slice(0, 10).map((w: any, i: number) => {
                  const value = Math.round(parseFloat(w.avgWeakness));
                  return (
                    <ListRow key={i}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-gray-900 dark:text-gray-100">
                          {w.topic}
                        </span>
                        <span className="mt-1.5 block">
                          <ProgressBar value={value} label={`${w.topic} weakness`} />
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-medium tabular-nums text-gray-900 dark:text-gray-100">
                        {value}%
                      </span>
                    </ListRow>
                  );
                })}
              </List>
            )}
          </Section>
        </div>

        <div>
          <div className="lg:sticky lg:top-6">
            {selected ? (
              <Card className="space-y-4">
                <div>
                  <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {selected.student?.name}
                  </h2>
                  <p className="mt-0.5 text-2xs text-gray-500 dark:text-gray-400">
                    {selected.student?.email}
                  </p>
                </div>
                <dl className="space-y-2 text-xs">
                  <Row label="Average mastery" value={`${Math.round(selected.stats?.averageMastery ?? 0)}%`} />
                  <Row label="Concepts tracked" value={String(selected.stats?.totalConcepts ?? 0)} />
                  <Row label="Strong" value={String(selected.stats?.strongConcepts ?? 0)} />
                  <Row label="Weak" value={String(selected.stats?.weakConcepts ?? 0)} />
                </dl>
              </Card>
            ) : (
              <Card className="py-10 text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Select a student to see their detail.
                </p>
              </Card>
            )}
          </div>
        </div>
      </div>
    </Page>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="font-medium tabular-nums text-gray-900 dark:text-gray-100">{value}</dd>
    </div>
  );
}
