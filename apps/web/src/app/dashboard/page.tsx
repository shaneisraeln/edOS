'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Icon } from '@/components/icon';

interface DashboardData {
  user: any;
  currentGoal: any;
  goals: any[];
  recentSessions: any[];
  weakConcepts: any[];
  strongConcepts: any[];
  recentAssessments: any[];
  stats: {
    totalSessions: number;
    totalAssessments: number;
    completedAssessments: number;
    averageMastery: number;
    conceptCount: number;
    totalLearningMinutes: number;
    streak: number;
  };
}

interface DayActivity {
  date: string;
  sessionCount: number;
  totalDuration: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [progress, setProgress] = useState<{ dailySessions: DayActivity[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!localStorage.getItem('accessToken')) {
      router.push('/login');
      return;
    }
    loadData();
  }, []);

  const loadData = async () => {
    setError('');
    try {
      const [dashResult, progressResult] = await Promise.all([
        api.getDashboard(),
        api.getProgress(),
      ]);
      setData(dashResult);
      setProgress(progressResult);
    } catch (err: any) {
      if (err.message?.includes('401') || err.message?.includes('Unauthorized')) {
        localStorage.clear();
        router.push('/login');
        return;
      }
      setError(err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <DashboardSkeleton />;

  if (error) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-6">
        <div className="space-y-3 text-center">
          <p className="text-sm text-gray-900 dark:text-gray-100">Could not load your dashboard</p>
          <p className="text-sm muted">{error}</p>
          <button onClick={loadData} className="btn-secondary mt-1">
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { stats } = data;
  const firstName = data.user?.name?.split(' ')[0] || 'there';

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-6 py-8 md:px-10 md:py-10 animate-in">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title">
            {getGreeting()}, {firstName}
          </h1>
          <p className="mt-1 text-sm muted">{buildSubtitle(data)}</p>
        </div>
        <NotificationBell />
      </header>

      {/* Primary actions */}
      <div className="grid gap-3 sm:grid-cols-2">
        <ActionCard
          href="/dashboard/session"
          title="Start a focus session"
          description="Timed session with knowledge checks as you go"
          icon="play"
        />
        <ActionCard
          href="/dashboard/paths"
          title="Continue a learning path"
          description="Step-by-step plans you verify as you finish"
          icon="path"
        />
      </div>

      {/* Stats */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Mastery" value={`${stats.averageMastery}%`} />
        <Stat label="Study time" value={formatMinutes(stats.totalLearningMinutes)} />
        <Stat label="Concepts" value={String(stats.conceptCount)} />
        <Stat label="Assessments" value={String(stats.completedAssessments)} />
      </section>

      <Heatmap dailySessions={progress?.dailySessions || []} />

      <div className="grid gap-6 md:grid-cols-2">
        <Panel
          title="Needs review"
          empty="Nothing flagged yet. Take an assessment to find gaps."
          isEmpty={data.weakConcepts.length === 0}
          action={{ href: '/dashboard/graph', label: 'View graph' }}
        >
          {data.weakConcepts.slice(0, 5).map((n: any) => (
            <div key={n.id} className="list-row">
              <span className="truncate text-sm">{n.concept?.name || 'Unknown'}</span>
              <span className="shrink-0 text-2xs tabular-nums muted">{n.weaknessScore}% weak</span>
            </div>
          ))}
        </Panel>

        <Panel
          title="Recent sessions"
          empty="No sessions yet. Start one above."
          isEmpty={data.recentSessions.length === 0}
          action={{ href: '/dashboard/history', label: 'View all' }}
        >
          {data.recentSessions.slice(0, 5).map((s: any) => (
            <div key={s.id} className="list-row">
              <span className="truncate text-sm">{s.topic}</span>
              <span className="shrink-0 text-2xs tabular-nums muted">
                {s.duration ? formatMinutes(Math.round(s.duration / 60)) : 'Active'}
              </span>
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

function ActionCard({
  href,
  title,
  description,
  icon,
}: {
  href: string;
  title: string;
  description: string;
  icon: 'play' | 'path';
}) {
  return (
    <Link href={href} className="card-interactive group flex items-start gap-3.5">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-gray-500 dark:text-gray-400">
        <Icon name={icon} className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">{title}</span>
        <span className="mt-0.5 block text-xs muted">{description}</span>
      </span>
      <Icon
        name="arrow-right"
        className="mt-1.5 h-3.5 w-3.5 shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 dark:text-gray-600"
      />
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <p className="text-xl font-semibold tabular-nums text-gray-900 dark:text-gray-50">{value}</p>
      <p className="mt-0.5 text-2xs muted">{label}</p>
    </div>
  );
}

function Panel({
  title,
  children,
  isEmpty,
  empty,
  action,
}: {
  title: string;
  children: React.ReactNode;
  isEmpty: boolean;
  empty: string;
  action?: { href: string; label: string };
}) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-baseline justify-between">
        <h2 className="section-title">{title}</h2>
        {action && !isEmpty && (
          <Link href={action.href} className="text-2xs muted hover:text-gray-900 dark:hover:text-gray-100">
            {action.label}
          </Link>
        )}
      </div>
      {isEmpty ? (
        <div className="card">
          <p className="text-xs muted">{empty}</p>
        </div>
      ) : (
        <div className="list">{children}</div>
      )}
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-8 px-6 py-8 md:px-10 md:py-10">
      <div className="space-y-2">
        <div className="skeleton h-7 w-56" />
        <div className="skeleton h-4 w-40" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="skeleton h-[74px]" />
        <div className="skeleton h-[74px]" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-[70px]" />
        ))}
      </div>
      <div className="skeleton h-[168px]" />
    </div>
  );
}

function Heatmap({ dailySessions }: { dailySessions: DayActivity[] }) {
  const { weeks, months, totalSessions } = useMemo(() => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const totalDays = 52 * 7 + dayOfWeek + 1;

    const sessionMap = new Map<string, DayActivity>();
    dailySessions.forEach((s) => sessionMap.set(s.date, s));

    const days: { date: string; level: number; count: number; minutes: number }[] = [];
    for (let i = totalDays - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const activity = sessionMap.get(dateStr);
      const sessions = activity ? Number(activity.sessionCount) : 0;
      const duration = activity ? Number(activity.totalDuration) : 0;

      let level = 0;
      if (sessions > 0) level = 1;
      if (duration > 1800) level = 2;
      if (duration > 3600) level = 3;
      if (duration > 7200) level = 4;

      days.push({ date: dateStr, level, count: sessions, minutes: Math.round(duration / 60) });
    }

    const weeks: (typeof days)[] = [];
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

    const months: { label: string; col: number }[] = [];
    let lastMonth = -1;
    weeks.forEach((week, wi) => {
      if (!week[0]) return;
      const month = new Date(week[0].date).getMonth();
      if (month !== lastMonth) {
        months.push({
          label: new Date(week[0].date).toLocaleString('default', { month: 'short' }),
          col: wi,
        });
        lastMonth = month;
      }
    });

    return { weeks, months, totalSessions: days.reduce((sum, d) => sum + d.count, 0) };
  }, [dailySessions]);

  // Monochrome ramp — reads as intensity rather than decoration.
  const levels = [
    'bg-gray-100 dark:bg-gray-800',
    'bg-primary-200 dark:bg-primary-900',
    'bg-primary-300 dark:bg-primary-800',
    'bg-primary-500 dark:bg-primary-600',
    'bg-primary-700 dark:bg-primary-400',
  ];

  return (
    <section className="space-y-2.5">
      <div className="flex items-baseline justify-between">
        <h2 className="section-title">Activity</h2>
        <span className="text-2xs muted">{totalSessions} sessions in the last year</span>
      </div>

      <div className="card overflow-x-auto">
        <div className="inline-flex min-w-fit">
          <div className="mr-2 flex flex-col gap-[3px] pt-[18px]">
            {['', 'M', '', 'W', '', 'F', ''].map((label, i) => (
              <div key={i} className="flex h-[11px] items-center">
                <span className="w-3 text-[9px] leading-none text-gray-400 dark:text-gray-600">
                  {label}
                </span>
              </div>
            ))}
          </div>

          <div>
            <div className="mb-1.5 flex h-3 gap-[3px]">
              {weeks.map((_, wi) => {
                const m = months.find((mm) => mm.col === wi);
                return (
                  <div key={wi} className="w-[11px]">
                    {m && (
                      <span className="text-[9px] leading-none muted">{m.label}</span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex gap-[3px]">
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-[3px]">
                  {week.map((day) => (
                    <div
                      key={day.date}
                      className={`h-[11px] w-[11px] rounded-[2px] ${levels[day.level]}`}
                      title={`${day.date} — ${day.count} session${day.count === 1 ? '' : 's'}, ${day.minutes} min`}
                    />
                  ))}
                  {Array.from({ length: 7 - week.length }).map((_, i) => (
                    <div key={`pad-${i}`} className="h-[11px] w-[11px]" />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3.5 flex items-center justify-end gap-1.5">
          <span className="text-[9px] muted">Less</span>
          {levels.map((c, i) => (
            <div key={i} className={`h-[9px] w-[9px] rounded-[2px] ${c}`} />
          ))}
          <span className="text-[9px] muted">More</span>
        </div>
      </div>
    </section>
  );
}

function NotificationBell() {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadCount();
    const interval = setInterval(loadCount, 30000);
    return () => clearInterval(interval);
  }, []);

  // Close on outside click / Escape — the previous version stayed open.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const loadCount = async () => {
    try {
      const data = await api.request<any>('/notifications/unread-count');
      setCount(data.count || 0);
    } catch {
      /* non-critical */
    }
  };

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      try {
        setNotifications((await api.request<any[]>('/notifications?status=unread')) || []);
      } catch {
        setNotifications([]);
      }
    }
  };

  const markAllRead = async () => {
    try {
      await api.request<any>('/notifications/mark-all-read', { method: 'POST', body: '{}' });
    } catch {
      /* non-critical */
    }
    setCount(0);
    setNotifications([]);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        onClick={toggle}
        className="btn-ghost relative px-2"
        aria-label={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
        aria-expanded={open}
      >
        <Icon name="bell" className="h-[18px] w-[18px]" />
        {count > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-600 px-1 text-[9px] font-medium tabular-nums text-white">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-72 overflow-hidden rounded-xl border bg-surface shadow-pop animate-in dark:bg-dark-surface">
          <div className="flex items-center justify-between border-b px-3.5 py-2.5">
            <span className="text-2xs font-medium muted">Notifications</span>
            {notifications.length > 0 && (
              <button onClick={markAllRead} className="text-2xs text-primary-600 hover:underline dark:text-primary-400">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-64 overflow-y-auto">
            {notifications.length > 0 ? (
              notifications.map((n: any) => (
                <div key={n.id} className="border-b px-3.5 py-2.5 last:border-0">
                  <p className="text-xs text-gray-700 dark:text-gray-300">{n.message}</p>
                  <p className="mt-0.5 text-[10px] muted">
                    {new Date(n.createdAt).toLocaleDateString()}
                  </p>
                </div>
              ))
            ) : (
              <p className="px-3.5 py-6 text-center text-xs muted">Nothing new</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- helpers */

function buildSubtitle(data: DashboardData): string {
  const bits: string[] = [];
  if (data.currentGoal?.curriculumName) bits.push(`Studying ${data.currentGoal.curriculumName}`);
  if (data.stats.streak > 0) {
    bits.push(`${data.stats.streak} day streak`);
  } else if (bits.length === 0) {
    return 'Ready to learn something new?';
  }
  return bits.join(' · ');
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatMinutes(min: number): string {
  if (!min) return '0m';
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
