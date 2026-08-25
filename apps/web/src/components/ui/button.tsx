'use client';

import { forwardRef } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import { Icon, type IconName } from '@/components/icon';

type Variant = 'primary' | 'secondary' | 'ghost' | 'accent' | 'danger';
type Size = 'sm' | 'md';

const variants: Record<Variant, string> = {
  primary:
    'bg-gray-900 text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white',
  secondary:
    'border bg-surface text-gray-700 hover:bg-gray-100 dark:bg-dark-surface dark:text-gray-300 dark:hover:bg-dark-tertiary',
  ghost:
    'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-dark-tertiary dark:hover:text-gray-100',
  accent: 'bg-primary-600 text-white hover:bg-primary-700',
  danger:
    'border border-red-200 bg-surface text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:bg-dark-surface dark:text-red-400 dark:hover:bg-red-950/30',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-2.5 text-xs gap-1.5 rounded-md',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-lg',
};

const base =
  'inline-flex items-center justify-center font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-40';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    icon,
    iconRight,
    loading = false,
    block = false,
    disabled,
    className,
    children,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={rest.type ?? 'button'}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(base, sizes[size], variants[variant], block && 'w-full', className)}
      {...rest}
    >
      {loading ? (
        <span
          className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-current border-t-transparent opacity-70"
          aria-hidden="true"
        />
      ) : (
        icon && <Icon name={icon} className="h-4 w-4 shrink-0 opacity-70" />
      )}
      {children}
      {iconRight && !loading && <Icon name={iconRight} className="h-4 w-4 shrink-0 opacity-70" />}
    </button>
  );
});

/** Same visual language as Button, rendered as a Next link. */
export function ButtonLink({
  href,
  variant = 'secondary',
  size = 'md',
  icon,
  iconRight,
  block = false,
  className,
  children,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  iconRight?: IconName;
  block?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(base, sizes[size], variants[variant], block && 'w-full', className)}
    >
      {icon && <Icon name={icon} className="h-4 w-4 shrink-0 opacity-70" />}
      {children}
      {iconRight && <Icon name={iconRight} className="h-4 w-4 shrink-0 opacity-70" />}
    </Link>
  );
}
