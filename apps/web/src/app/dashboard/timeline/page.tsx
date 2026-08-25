'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  Card,
  EmptyState,
  List,
  ListRow,
  Page,
  PageHeader,
  PageLoading,
  Section,
  Stat,
} from '@/components/ui';

interface DayActivity {
  date: string;
  sessionCount: number;
  totalDuration: number;
}

const DAYS_SHOWN = 90;

export default function TimelinePage() {
  const [loading, setLoading] = useState(true);
  const [dailySessions, setDailySessions] = useState<DayActivity[]>([]);

  useEffect(() => {
    api
      .getProgress()
      .then((progress) => setDailySessions(progress.dailySessions || []))
      .catch(() => setDailySessions([]))
      .finally(() => setLoading(false));
  }, []);

  const { weeks, stats } = useMemo(() => {
    const byDate = new Map(dailySessions.map((s) => [s.date, s]));
    const today = new Date();
    const days: { date: string; level: number; sessions: number; minutes: number }[] = [];

    for (let i = DAYS_SHOWN - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const date = d.toISOString().split('T')[0];
      const activity = byDate.get(date);
      const sessions = Number(activity?.sessionCount ?? 0);
      const duration = Number(activity?.totalDuration ?? 0);

      let level = 0;
      if (sessions > 0) level = 1;
      if (duration > 1800) level = 2;
      if (duration > 3600) level = 3;
      if (duration > 7200) level = 4;

      days.push({ date, level, sessions, minutes: Math.round(duration / 60) });
    }

    const grouped: (typeof days)[] = [];
    for (let i = 0; i < days.length; i += 7) grouped.push(days.slice(i, i + 7));

    const totalMinutes = dailySessions.reduce((s, d) => s + Number(d.totalDuration || 0), 0) / 60;
    const totalSessions = dailySessions.reduce((s, d) => s + Number(d.sessionCount || 0), 0);

    return {
      weeks: grouped,
      stats: {
        activeDays: dailySessions.length,
        minutes: Math.round(totalMinutes),
        sessions: totalSessions,
      },
    };
  }, [dailySessions]);

  if (loading) return <PageLoading />;

  const levels = [
    'bg-gray-100 dark:bg-gray-800',
    'bg-primary-200 dark:bg-primary-900',
    'bg-primary-300 dark:bg-primary-800',
    'bg-primary-500 dark:bg-primary-600',
    'bg-primary-700 dark:bg-primary-400',
  ];

  return (
    <Page>
      <PageHeader title="Timeline" description="Your study activity over the last 90 days." />

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Active days" value={stats.activeDays} />
        <Stat label="Minutes studied" value={stats.minutes} />
        <Stat label="Sessions" value={stats.sessions} />
      </div>

      <Section title="Activity">
        <Card className="overflow-x-auto">
          <div className="flex min-w-fit gap-[3px]">
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-[3px]">
                {week.map((day) => (
                  <div
                    key={day.date}
                    className={`h-[11px] w-[11px] rounded-[2px] ${levels[day.level]}`}
                    title={`${day.date} — ${day.sessions} session${day.sessions === 1 ? '' : 's'}, ${day.minutes} min`}
                  />
                ))}
              </div>
            ))}
          </div>

          <div className="mt-3.5 flex items-center justify-end gap-1.5">
            <span className="text-[9px] text-gray-500 dark:text-gray-400">Less</span>
            {levels.map((c, i) => (
              <div key={i} className={`h-[9px] w-[9px] rounded-[2px] ${c}`} />
            ))}
            <span className="text-[9px] text-gray-500 dark:text-gray-400">More</span>
          </div>
        </Card>
      </Section>

      <Section title="Daily breakdown">
        {dailySessions.length === 0 ? (
          <EmptyState
            icon="timeline"
            title="No activity recorded"
            description="Start a session and your daily study time will appear here."
          />
        ) : (
          <List>
            {[...dailySessions].reverse().map((d) => (
              <ListRow key={d.date}>
                <span className="text-sm text-gray-900 dark:text-gray-100">
                  {new Date(`${d.date}T00:00:00`).toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
                <span className="flex shrink-0 items-baseline gap-3 text-2xs tabular-nums text-gray-500 dark:text-gray-400">
                  <span>
                    {d.sessionCount} session{Number(d.sessionCount) === 1 ? '' : 's'}
                  </span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {Math.round(Number(d.totalDuration) / 60)} min
                  </span>
                </span>
              </ListRow>
            ))}
          </List>
        )}
      </Section>
    </Page>
  );
}
