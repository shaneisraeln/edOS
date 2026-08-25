'use client';

import { cn } from '@/lib/cn';
import { Icon, type IconName } from '@/components/icon';
import { Button } from './button';

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        'inline-block h-4 w-4 animate-spin rounded-full border-[1.5px] border-gray-300 border-t-gray-600 dark:border-gray-700 dark:border-t-gray-300',
        className,
      )}
    />
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-gray-200 dark:bg-gray-800', className)} />;
}

/** Full-page loading state used while a route's initial data resolves. */
export function PageLoading() {
  return (
    <div className="mx-auto max-w-4xl space-y-8 px-6 py-8 md:px-10 md:py-10">
      <div className="space-y-2">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[70px]" />
        ))}
      </div>
      <Skeleton className="h-40" />
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description?: string;
  icon?: IconName;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-surface px-6 py-12 text-center dark:bg-dark-surface">
      {icon && (
        <span className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-lg border text-gray-400 dark:text-gray-500">
          <Icon name={icon} className="h-4 w-4" />
        </span>
      )}
      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{title}</p>
      {description && (
        <p className="mx-auto mt-1 max-w-sm text-xs text-gray-500 dark:text-gray-400">
          {description}
        </p>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-xl border bg-surface px-6 py-12 text-center dark:bg-dark-surface">
      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{title}</p>
      {message && (
        <p className="mx-auto mt-1 max-w-sm text-xs text-gray-500 dark:text-gray-400">{message}</p>
      )}
      {onRetry && (
        <div className="mt-4 flex justify-center">
          <Button onClick={onRetry}>Try again</Button>
        </div>
      )}
    </div>
  );
}

/** Inline error banner for forms. */
export function Alert({
  children,
  tone = 'danger',
}: {
  children: React.ReactNode;
  tone?: 'danger' | 'info' | 'warning';
}) {
  const tones = {
    danger:
      'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400',
    warning:
      'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-400',
    info: 'border bg-surface text-gray-600 dark:bg-dark-surface dark:text-gray-400',
  } as const;

  return (
    <p role="alert" className={cn('rounded-lg border px-3 py-2.5 text-xs', tones[tone])}>
      {children}
    </p>
  );
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
  className?: string;
}) {
  const tones = {
    neutral: 'border text-gray-600 dark:text-gray-400',
    accent: 'border-primary-200 text-primary-700 dark:border-primary-900 dark:text-primary-400',
    success: 'border-emerald-200 text-emerald-700 dark:border-emerald-900 dark:text-emerald-400',
    warning: 'border-amber-200 text-amber-700 dark:border-amber-900 dark:text-amber-400',
    danger: 'border-red-200 text-red-700 dark:border-red-900 dark:text-red-400',
  } as const;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-2xs',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Small live/idle indicator dot. */
export function StatusDot({ tone = 'idle' }: { tone?: 'live' | 'idle' | 'off' }) {
  const tones = {
    live: 'bg-emerald-500',
    idle: 'bg-amber-500',
    off: 'bg-gray-300 dark:bg-gray-600',
  } as const;
  return <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', tones[tone])} />;
}

export function ProgressBar({
  value,
  className,
  label,
}: {
  value: number;
  className?: string;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label}
      className={cn('h-1 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800', className)}
    >
      <div
        className="h-full rounded-full bg-gray-900 transition-[width] duration-300 dark:bg-gray-100"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/**
 * Mastery is shown in many places; keep one mapping from score to language and
 * colour so "weak" and "strong" mean the same thing everywhere in the UI.
 */
export function MasteryBadge({ mastery }: { mastery: number }) {
  const value = Math.round(mastery);
  if (value >= 80) return <Badge tone="success">{value}% mastered</Badge>;
  if (value >= 60) return <Badge tone="accent">{value}% solid</Badge>;
  if (value >= 40) return <Badge tone="warning">{value}% shaky</Badge>;
  return <Badge tone="danger">{value}% weak</Badge>;
}
