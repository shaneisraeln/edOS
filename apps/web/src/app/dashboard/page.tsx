'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

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
    const token = localStorage.getItem('accessToken');
    if (!token) {
      router.push('/login');
      return;
    }
    loadData();
  }, []);

  const loadData = async () => {
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-600 border-t-gray-900 dark:border-t-gray-100 rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <div className="text-center space-y-3">
          <p className="text-sm text-red-500">{error}</p>
          <button onClick={loadData} className="text-sm text-primary-600 hover:text-primary-700 font-medium">
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto space-y-10">
      {/* Greeting */}
      <header className="flex items-start justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50 tracking-tight">
            {getGreeting()}, {data.user?.name?.split(' ')[0] || 'there'}
          </h1>
        {data.currentGoal ? (
          <p className="text-sm text-gray-500">
            Studying {data.currentGoal.curriculumName} · {data.stats.streak} day streak
          </p>
        ) : (
          <p className="text-sm text-gray-500">
            {data.stats.streak > 0 ? `${data.stats.streak} day streak` : 'Ready to learn something new?'}
          </p>
        )}
        </div>
        <NotificationBell />
      </header>

      {/* Learning Path */}
      <button
        onClick={() => router.push('/dashboard/paths')}
        className="w-full group rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-surface p-6 text-left transition-all hover:border-primary-300 dark:hover:border-primary-700 hover:shadow-sm"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary-600">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 group-hover:text-primary-600 transition-colors">
                Learning Paths
              </p>
              <p className="text-xs text-gray-400">
                Structured plans with step-by-step verification
              </p>
            </div>
          </div>
          <span className="text-gray-300 dark:text-gray-600 group-hover:text-primary-400 transition-colors">→</span>
        </div>
      </button>

      {/* Start session CTA */}
      <button
        onClick={() => router.push('/dashboard/session')}
        className="w-full group rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-surface p-6 text-left transition-all hover:border-primary-300 dark:hover:border-primary-700 hover:shadow-sm"
      >
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-base font-medium text-gray-900 dark:text-gray-100 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
              Start a learning session
            </p>
            <p className="text-sm text-gray-400">
              Focus timer with knowledge checks every 10 min
            </p>
          </div>
          <div className="w-10 h-10 rounded-full bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center group-hover:bg-primary-100 dark:group-hover:bg-primary-900/30 transition-colors">
            <svg className="w-5 h-5 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
            </svg>
          </div>
        </div>
      </button>

      {/* Activity heatmap */}
      <Heatmap dailySessions={progress?.dailySessions || []} />

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <Stat label="Mastery" value={`${data.stats.averageMastery}%`} />
        <Stat label="Study time" value={formatMinutes(data.stats.totalLearningMinutes)} />
        <Stat label="Concepts" value={`${data.stats.conceptCount}`} />
        <Stat label="Assessments" value={`${data.stats.completedAssessments}`} />
      </div>

      {/* Needs review */}
      {data.weakConcepts.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider">Needs review</h2>
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-surface divide-y divide-gray-100 dark:divide-gray-800">
            {data.weakConcepts.slice(0, 4).map((n: any) => (
              <div key={n.id} className="flex items-center justify-between px-5 py-3.5">
                <span className="text-sm text-gray-700 dark:text-gray-300">{n.concept?.name || 'Unknown'}</span>
                <span className="text-xs tabular-nums font-medium text-orange-500">{n.weaknessScore}%</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent sessions */}
      {data.recentSessions.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider">Recent sessions</h2>
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-surface divide-y divide-gray-100 dark:divide-gray-800">
            {data.recentSessions.slice(0, 4).map((s: any) => (
              <div key={s.id} className="flex items-center justify-between px-5 py-3.5">
                <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{s.topic}</span>
                <span className="text-xs tabular-nums text-gray-400 ml-3 flex-shrink-0">
                  {s.duration ? formatMinutes(Math.round(s.duration / 60)) : 'Active'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Quick Navigation */}
      <section className="space-y-3">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider">Explore</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[
            { href: '/dashboard/assessment', label: 'Assessment' },
            { href: '/dashboard/graph', label: 'Knowledge Graph' },
            { href: '/dashboard/mentor', label: 'AI Mentor' },
            { href: '/dashboard/quiz', label: 'Context Quiz' },
            { href: '/dashboard/projects', label: 'Projects' },
            { href: '/dashboard/groups', label: 'Study Groups' },
            { href: '/dashboard/interview', label: 'Interview Prep' },
            { href: '/dashboard/history', label: 'History' },
            { href: '/dashboard/timeline', label: 'Timeline' },
            { href: '/dashboard/settings', label: 'Settings' },
          ].map((item) => (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-surface px-4 py-3 text-left text-sm text-gray-700 dark:text-gray-300 hover:border-primary-300 dark:hover:border-primary-700 hover:text-primary-600 transition-all"
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

// --- Components ---

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-surface px-4 py-3.5 text-center">
      <p className="text-lg font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{value}</p>
      <p className="text-[11px] text-gray-400 mt-0.5">{label}</p>
    </div>
  );
}

function Heatmap({ dailySessions }: { dailySessions: DayActivity[] }) {
  const { weeks, months, totalSessions } = useMemo(() => {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=Sun

    // 52 full weeks + partial current week
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

    const weeks: typeof days[] = [];
    for (let i = 0; i < days.length; i += 7) {
      weeks.push(days.slice(i, i + 7));
    }

    // Month labels
    const months: { label: string; col: number }[] = [];
    let lastMonth = -1;
    weeks.forEach((week, wi) => {
      if (week[0]) {
        const month = new Date(week[0].date).getMonth();
        if (month !== lastMonth) {
          months.push({ label: new Date(week[0].date).toLocaleString('default', { month: 'short' }), col: wi });
          lastMonth = month;
        }
      }
    });

    const totalSessions = days.reduce((sum, d) => sum + d.count, 0);
    return { weeks, months, totalSessions };
  }, [dailySessions]);

  const colors = [
    'bg-gray-100 dark:bg-gray-800/50',
    'bg-emerald-200 dark:bg-emerald-900/40',
    'bg-emerald-400 dark:bg-emerald-700/60',
    'bg-emerald-600 dark:bg-emerald-500/70',
    'bg-emerald-800 dark:bg-emerald-400/90',
  ];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider">Activity</h2>
        <span className="text-xs text-gray-400">{totalSessions} sessions this year</span>
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-surface p-5 overflow-x-auto">
        <div className="inline-flex gap-0 min-w-fit">
          {/* Day labels */}
          <div className="flex flex-col gap-[3px] mr-2 pt-5">
            {['', 'M', '', 'W', '', 'F', ''].map((label, i) => (
              <div key={i} className="h-[11px] flex items-center">
                <span className="text-[10px] text-gray-300 dark:text-gray-600 leading-none w-3">{label}</span>
              </div>
            ))}
          </div>

          <div>
            {/* Month labels */}
            <div className="flex gap-[3px] mb-1.5 h-3.5">
              {weeks.map((_, wi) => {
                const m = months.find((m) => m.col === wi);
                return (
                  <div key={wi} className="w-[11px]">
                    {m && <span className="text-[10px] text-gray-400 leading-none">{m.label}</span>}
                  </div>
                );
              })}
            </div>

            {/* Grid */}
            <div className="flex gap-[3px]">
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-[3px]">
                  {week.map((day) => (
                    <div
                      key={day.date}
                      className={`w-[11px] h-[11px] rounded-[2px] ${colors[day.level]}`}
                      title={`${day.date}: ${day.count} sessions, ${day.minutes} min`}
                    />
                  ))}
                  {week.length < 7 && Array.from({ length: 7 - week.length }).map((_, i) => (
                    <div key={`e-${i}`} className="w-[11px] h-[11px]" />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-end gap-1.5 mt-4">
          <span className="text-[10px] text-gray-400">Less</span>
          {colors.map((c, i) => (
            <div key={i} className={`w-[10px] h-[10px] rounded-[2px] ${c}`} />
          ))}
          <span className="text-[10px] text-gray-400">More</span>
        </div>
      </div>
    </section>
  );
}

// --- Helpers ---

function NotificationBell() {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);

  useEffect(() => {
    loadCount();
    const interval = setInterval(loadCount, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadCount = async () => {
    try {
      const data = await api.request<any>('/notifications/unread-count');
      setCount(data.count || 0);
    } catch {}
  };

  const loadNotifications = async () => {
    try {
      const data = await api.request<any[]>('/notifications?status=unread');
      setNotifications(data || []);
    } catch {}
  };

  const toggle = () => {
    if (!open) loadNotifications();
    setOpen(!open);
  };

  const markAllRead = async () => {
    await api.request<any>('/notifications/mark-all-read', { method: 'POST', body: '{}' });
    setCount(0);
    setNotifications([]);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button onClick={toggle} className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-tertiary">
        <span className="text-lg">🔔</span>
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-10 w-72 bg-white dark:bg-dark-surface border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-800">
            <span className="text-xs font-semibold text-gray-500">Notifications</span>
            {notifications.length > 0 && (
              <button onClick={markAllRead} className="text-[10px] text-primary-600 hover:underline">Mark all read</button>
            )}
          </div>
          <div className="max-h-60 overflow-y-auto">
            {notifications.length > 0 ? notifications.map((n: any) => (
              <div key={n.id} className="px-3 py-2 border-b border-gray-50 dark:border-gray-800 last:border-0">
                <p className="text-xs text-gray-700 dark:text-gray-300">{n.message}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{new Date(n.createdAt).toLocaleDateString()}</p>
              </div>
            )) : (
              <p className="text-xs text-gray-400 text-center py-4">No new notifications</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatMinutes(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
