'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

interface DayActivity {
  date: string;
  sessionCount: number;
  totalDuration: number;
}

export default function TimelinePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [dailySessions, setDailySessions] = useState<DayActivity[]>([]);
  const [assessments, setAssessments] = useState<any[]>([]);

  useEffect(() => {
    loadTimeline();
  }, []);

  const loadTimeline = async () => {
    try {
      const progress = await api.getProgress();
      setDailySessions(progress.dailySessions || []);
      setAssessments(progress.dailyAssessments || []);
    } catch (err) {
      console.error('Failed to load timeline:', err);
    } finally {
      setLoading(false);
    }
  };

  // Build last 90 days grid
  const today = new Date();
  const days: { date: string; level: number; label: string }[] = [];
  for (let i = 89; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const activity = dailySessions.find((s) => s.date === dateStr);
    const sessions = activity ? Number(activity.sessionCount) : 0;
    const duration = activity ? Number(activity.totalDuration) : 0;

    let level = 0;
    if (sessions > 0) level = 1;
    if (duration > 1800) level = 2; // >30 min
    if (duration > 3600) level = 3; // >1 hour
    if (duration > 7200) level = 4; // >2 hours

    const label = `${dateStr}: ${sessions} sessions, ${Math.round(duration / 60)} min`;
    days.push({ date: dateStr, level, label });
  }

  const weeks: typeof days[] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  const levelColors = [
    'bg-gray-100 dark:bg-dark-tertiary',
    'bg-green-200 dark:bg-green-900/40',
    'bg-green-400 dark:bg-green-700/60',
    'bg-green-600 dark:bg-green-600/80',
    'bg-green-800 dark:bg-green-500',
  ];

  // Calculate stats
  const totalDays = dailySessions.length;
  const totalMinutes = dailySessions.reduce((s, d) => s + Number(d.totalDuration || 0), 0) / 60;
  const totalSessions = dailySessions.reduce((s, d) => s + Number(d.sessionCount || 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-500">Loading timeline...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="card text-center">
            <p className="text-xs text-gray-500">Active Days</p>
            <p className="text-2xl font-bold text-primary-600">{totalDays}</p>
            <p className="text-xs text-gray-400">last 90 days</p>
          </div>
          <div className="card text-center">
            <p className="text-xs text-gray-500">Total Time</p>
            <p className="text-2xl font-bold text-primary-600">{Math.round(totalMinutes)}</p>
            <p className="text-xs text-gray-400">minutes</p>
          </div>
          <div className="card text-center">
            <p className="text-xs text-gray-500">Sessions</p>
            <p className="text-2xl font-bold text-primary-600">{totalSessions}</p>
            <p className="text-xs text-gray-400">total</p>
          </div>
        </div>

        {/* Heatmap */}
        <div className="card">
          <h2 className="text-sm font-medium text-gray-500 mb-4">Activity Heatmap (Last 90 Days)</h2>

          <div className="flex gap-1 overflow-x-auto pb-2">
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-1">
                {week.map((day) => (
                  <div
                    key={day.date}
                    className={`w-3 h-3 rounded-sm ${levelColors[day.level]} transition-colors`}
                    title={day.label}
                  />
                ))}
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-2 mt-4 text-xs text-gray-400">
            <span>Less</span>
            {levelColors.map((c, i) => (
              <div key={i} className={`w-3 h-3 rounded-sm ${c}`} />
            ))}
            <span>More</span>
          </div>
        </div>

        {/* Recent Activity List */}
        <div className="card">
          <h2 className="text-sm font-medium text-gray-500 mb-4">Daily Breakdown</h2>
          {dailySessions.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {[...dailySessions].reverse().map((d) => (
                <div key={d.date} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-100 dark:border-gray-800 last:border-0">
                  <span className="text-gray-600 dark:text-gray-300">
                    {new Date(d.date + 'T00:00:00').toLocaleDateString(undefined, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">{d.sessionCount} sessions</span>
                    <span className="text-xs font-medium text-primary-600">
                      {Math.round(Number(d.totalDuration) / 60)} min
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-4">
              No activity recorded yet. Start a learning session to see your timeline.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
