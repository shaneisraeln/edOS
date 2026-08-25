import Link from 'next/link';
import { cn } from '@/lib/cn';
import { Icon, type IconName } from '@/components/icon';

/**
 * Standard page wrapper. Every dashboard page uses this so gutters, max width
 * and vertical rhythm are identical instead of hand-tuned per page.
 */
export function Page({
  children,
  width = 'default',
  className,
}: {
  children: React.ReactNode;
  width?: 'default' | 'wide' | 'narrow' | 'full';
  className?: string;
}) {
  const widths = {
    narrow: 'max-w-2xl',
    default: 'max-w-4xl',
    wide: 'max-w-6xl',
    full: 'max-w-none',
  } as const;

  return (
    <div
      className={cn(
        'mx-auto space-y-8 px-6 py-8 md:px-10 md:py-10 animate-in',
        widths[width],
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  backTo,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  backTo?: { href: string; label: string };
}) {
  return (
    <header className="space-y-3">
      {backTo && (
        <Link
          href={backTo.href}
          className="inline-flex items-center gap-1.5 text-2xs text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
        >
          <Icon name="arrow-right" className="h-3 w-3 rotate-180" />
          {backTo.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function Section({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('space-y-2.5', className)}>
      {(title || action) && (
        <div className="flex items-baseline justify-between gap-3">
          <div>
            {title && (
              <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100">{title}</h2>
            )}
            {description && (
              <p className="mt-0.5 text-2xs text-gray-500 dark:text-gray-400">{description}</p>
            )}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Card({
  children,
  className,
  padded = true,
}: {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border bg-surface dark:bg-dark-surface',
        padded && 'p-5',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Card that behaves as a link, with a subtle hover affordance. */
export function CardLink({
  href,
  title,
  description,
  icon,
  className,
}: {
  href: string;
  title: string;
  description?: string;
  icon?: IconName;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'group flex items-start gap-3.5 rounded-xl border bg-surface p-5 transition-colors',
        'hover:border-gray-300 dark:bg-dark-surface dark:hover:border-gray-700',
        className,
      )}
    >
      {icon && (
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-gray-500 dark:text-gray-400">
          <Icon name={icon} className="h-4 w-4" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">{title}</span>
        {description && (
          <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
            {description}
          </span>
        )}
      </span>
      <Icon
        name="arrow-right"
        className="mt-1.5 h-3.5 w-3.5 shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 dark:text-gray-600"
      />
    </Link>
  );
}

/** Bordered container whose children are separated by hairlines. */
export function List({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'divide-y overflow-hidden rounded-xl border bg-surface dark:bg-dark-surface',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function ListRow({
  children,
  className,
  href,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  href?: string;
  onClick?: () => void;
}) {
  const base = cn('flex items-center justify-between gap-3 px-4 py-3', className);
  const interactive = 'w-full text-left transition-colors hover:bg-gray-50 dark:hover:bg-dark-tertiary';

  if (href) {
    return (
      <Link href={href} className={cn(base, interactive)}>
        {children}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(base, interactive)}>
        {children}
      </button>
    );
  }
  return <div className={base}>{children}</div>;
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border bg-surface p-4 dark:bg-dark-surface">
      <p className="text-xl font-semibold tabular-nums text-gray-900 dark:text-gray-50">{value}</p>
      <p className="mt-0.5 text-2xs text-gray-500 dark:text-gray-400">{label}</p>
      {hint && <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">{hint}</p>}
    </div>
  );
}

export function StatGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{children}</div>;
}
