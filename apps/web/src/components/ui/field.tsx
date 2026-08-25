'use client';

import { forwardRef, useId } from 'react';
import { cn } from '@/lib/cn';

const control =
  'block w-full rounded-lg border bg-surface px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 transition-colors ' +
  'focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/10 ' +
  'disabled:cursor-not-allowed disabled:opacity-50 ' +
  'dark:bg-dark-surface dark:text-gray-100 dark:placeholder:text-gray-500';

/**
 * Wraps a control with its label, optional hint and error message, and wires up
 * the aria attributes so the error is announced.
 */
export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
}: {
  label?: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-2xs font-medium text-gray-500 dark:text-gray-400">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-2xs text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="text-2xs text-gray-500 dark:text-gray-400">{hint}</p>
      )}
    </div>
  );
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, className, id, ...rest },
  ref,
) {
  const autoId = useId();
  const fieldId = id ?? autoId;

  const el = (
    <input
      ref={ref}
      id={fieldId}
      aria-invalid={error ? true : undefined}
      className={cn(control, error && 'border-red-300 dark:border-red-900', className)}
      {...rest}
    />
  );

  if (!label && !hint && !error) return el;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={fieldId}>
      {el}
    </Field>
  );
});

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, className, id, ...rest },
  ref,
) {
  const autoId = useId();
  const fieldId = id ?? autoId;

  const el = (
    <textarea
      ref={ref}
      id={fieldId}
      aria-invalid={error ? true : undefined}
      className={cn(control, 'min-h-[88px] resize-y leading-relaxed', error && 'border-red-300 dark:border-red-900', className)}
      {...rest}
    />
  );

  if (!label && !hint && !error) return el;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={fieldId}>
      {el}
    </Field>
  );
});

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, className, id, children, ...rest },
  ref,
) {
  const autoId = useId();
  const fieldId = id ?? autoId;

  const el = (
    <select ref={ref} id={fieldId} className={cn(control, 'pr-8', className)} {...rest}>
      {children}
    </select>
  );

  if (!label && !hint && !error) return el;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={fieldId}>
      {el}
    </Field>
  );
});

/** Compact segmented control — used for difficulty pickers, filters, etc. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  'aria-label': ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  className?: string;
  'aria-label'?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex gap-0.5 rounded-lg border bg-gray-100 p-0.5 dark:bg-dark-tertiary',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-[7px] px-2.5 py-1 text-xs font-medium transition-colors',
              active
                ? 'bg-surface text-gray-900 dark:bg-dark-surface dark:text-gray-100'
                : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Accessible on/off switch. */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-5 w-9 shrink-0 rounded-full border transition-colors disabled:opacity-40',
        checked
          ? 'border-gray-900 bg-gray-900 dark:border-gray-100 dark:bg-gray-100'
          : 'bg-gray-200 dark:bg-dark-tertiary',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-3.5 w-3.5 rounded-full transition-transform',
          checked
            ? 'translate-x-[18px] bg-white dark:bg-gray-900'
            : 'translate-x-0.5 bg-gray-500 dark:bg-gray-400',
        )}
      />
    </button>
  );
}
