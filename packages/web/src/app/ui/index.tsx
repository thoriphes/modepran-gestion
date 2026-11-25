/** Componentes propios (Tailwind). Sin librerías de UI. */
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// ─────────────── Botones ───────────────

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent-600 text-white hover:bg-accent-700 disabled:bg-accent-300 dark:disabled:bg-accent-900',
  secondary:
    'border border-stone-300 bg-white text-stone-800 hover:bg-stone-100 disabled:text-stone-400 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800',
  ghost: 'text-stone-700 hover:bg-stone-100 disabled:text-stone-400 dark:text-stone-300 dark:hover:bg-stone-800',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  loading,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; loading?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed',
        size === 'sm' ? 'px-2.5 py-1 text-xs' : size === 'lg' ? 'px-5 py-3 text-base' : 'px-3.5 py-2 text-sm',
        VARIANTS[variant],
        className,
      )}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  );
}

// ─────────────── Formularios ───────────────

export function Field({ label, hint, error, children, className, htmlFor }: { label?: ReactNode; hint?: ReactNode; error?: string; children: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={className}>
      {label && (
        <label className="label" htmlFor={htmlFor}>
          {label}
        </label>
      )}
      {children}
      {hint && !error && <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

export function TextInput({ label, hint, error, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode; hint?: ReactNode; error?: string }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} className={className} htmlFor={rest.id ?? id}>
      <input id={rest.id ?? id} className="input" aria-invalid={!!error || undefined} {...rest} />
    </Field>
  );
}

export function TextArea({ label, hint, error, className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: ReactNode; hint?: ReactNode; error?: string }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} className={className} htmlFor={rest.id ?? id}>
      <textarea id={rest.id ?? id} className="input min-h-20" aria-invalid={!!error || undefined} {...rest} />
    </Field>
  );
}

export interface Option {
  value: string;
  label: string;
}

export function Select({
  label,
  hint,
  error,
  className,
  options,
  placeholder,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: ReactNode; hint?: ReactNode; error?: string; options: Option[]; placeholder?: string }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} className={className} htmlFor={rest.id ?? id}>
      <select id={rest.id ?? id} className="input" aria-invalid={!!error || undefined} {...rest}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function Checkbox({ label, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className={cx('inline-flex items-center gap-2 text-sm', className)}>
      <input type="checkbox" className="size-4 rounded border-stone-300 accent-accent-600" {...rest} />
      {label}
    </label>
  );
}

/** Selector de tres estados para filtros booleanos: (cualquiera) / Sí / No. */
export function TriSelect({ label, value, onChange }: { label: string; value: boolean | undefined; onChange: (v: boolean | undefined) => void }) {
  return (
    <Select
      label={label}
      value={value === undefined ? '' : value ? '1' : '0'}
      onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value === '1')}
      placeholder="Cualquiera"
      options={[
        { value: '1', label: 'Sí' },
        { value: '0', label: 'No' },
      ]}
    />
  );
}

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div role="radiogroup" className={cx('inline-flex rounded-lg border border-stone-300 bg-white p-0.5 dark:border-stone-700 dark:bg-stone-900', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'rounded-md px-3 py-1.5 text-sm font-medium',
            value === o.value ? 'bg-accent-600 text-white' : 'text-stone-700 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─────────────── Estados ───────────────

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx('animate-spin text-current', className ?? 'size-5')} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function Loading({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-12 text-stone-500 dark:text-stone-400">
      <Spinner />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function Empty({ title, children, icon = '🐾' }: { title: string; children?: ReactNode; icon?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center text-stone-500 dark:text-stone-400">
      <div className="text-3xl" aria-hidden="true">
        {icon}
      </div>
      <p className="font-medium text-stone-700 dark:text-stone-300">{title}</p>
      {children && <div className="text-sm">{children}</div>}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
      <div className="flex items-start justify-between gap-3">
        <p>{msg}</p>
        {onRetry && (
          <Button size="sm" onClick={onRetry}>
            Reintentar
          </Button>
        )}
      </div>
    </div>
  );
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'success' | 'warn' }) {
  const tones = {
    info: 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-100',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100',
    warn: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-100',
  };
  return <div className={cx('rounded-lg border p-3 text-sm', tones[tone])}>{children}</div>;
}

// ─────────────── Contenedores ───────────────

export function Card({ title, actions, children, className, bodyClassName }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cx('card', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 px-4 py-3 dark:border-stone-800">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </header>
      )}
      <div className={bodyClassName ?? 'p-4'}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-stone-500 dark:text-stone-400">{subtitle}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Badge({ children, color, tone = 'neutral', className }: { children: ReactNode; color?: string; tone?: 'neutral' | 'accent' | 'green' | 'red' | 'amber' | 'blue'; className?: string }) {
  const tones = {
    neutral: 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300',
    accent: 'bg-accent-100 text-accent-800 dark:bg-accent-900/50 dark:text-accent-200',
    green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
    red: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200',
    amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
    blue: 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200',
  };
  return (
    <span
      className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', !color && tones[tone], className)}
      style={color ? { backgroundColor: `${color}22`, color, boxShadow: `inset 0 0 0 1px ${color}55` } : undefined}
    >
      {children}
    </span>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={cx(
        'm-auto w-[calc(100%-1.5rem)] rounded-xl border border-stone-200 bg-white p-0 text-stone-900 shadow-xl backdrop:bg-stone-950/50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100',
        wide ? 'max-w-3xl' : 'max-w-lg',
      )}
    >
      {open && (
        <div className="flex max-h-[90dvh] flex-col">
          <header className="flex items-center justify-between gap-3 border-b border-stone-200 px-4 py-3 dark:border-stone-800">
            <h2 className="text-base font-semibold">{title}</h2>
            <button type="button" onClick={onClose} className="rounded-md p-1 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800" aria-label="Cerrar">
              ✕
            </button>
          </header>
          <div className="overflow-y-auto p-4">{children}</div>
          {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-stone-200 px-4 py-3 dark:border-stone-800">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

export function Pagination({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (p: number) => void }) {
  return (
    <div className="no-print flex flex-wrap items-center justify-between gap-2 py-2 text-sm text-stone-600 dark:text-stone-400">
      <span>
        {total.toLocaleString('es-ES')} resultado{total === 1 ? '' : 's'}
      </span>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => onPage(1)} aria-label="Primera página">
          «
        </Button>
        <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Anterior
        </Button>
        <span className="px-2">
          {page} / {Math.max(1, pages)}
        </span>
        <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Siguiente
        </Button>
        <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => onPage(pages)} aria-label="Última página">
          »
        </Button>
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: ReactNode; count?: number }[] }) {
  return (
    <div role="tablist" className="no-print mb-4 flex gap-1 overflow-x-auto border-b border-stone-200 dark:border-stone-800">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          type="button"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cx(
            '-mb-px border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap',
            value === t.value ? 'border-accent-600 text-accent-700 dark:text-accent-300' : 'border-transparent text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100',
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 rounded-full bg-stone-200 px-1.5 text-xs dark:bg-stone-700">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Lista definición compacta (ficha). */
export function DL({ items, cols = 2 }: { items: [ReactNode, ReactNode][]; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={cx('grid gap-x-6 gap-y-2 text-sm', cols === 3 ? 'sm:grid-cols-3' : cols === 2 ? 'sm:grid-cols-2' : '')}>
      {items.map(([k, v], i) => (
        <div key={i} className="flex justify-between gap-3 border-b border-stone-100 pb-1 dark:border-stone-800">
          <dt className="text-stone-500 dark:text-stone-400">{k}</dt>
          <dd className="text-right font-medium">{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
