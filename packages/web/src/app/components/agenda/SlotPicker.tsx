/** Planificador de franjas de 30 min (08:00–20:00). Marca las ocupadas por citas del día. */
import { useMemo } from 'react';
import type { AgendaItem, AgendaName, IsoDate } from '@modepran/domain';
import { agendaDay } from '@modepran/domain';
import { useAsync, useSession } from '../../context';
import { cx, Spinner } from '../../ui';

export const SLOT_START = 8 * 60;
export const SLOT_END = 20 * 60;
export const SLOT_MINUTES = 30;

export function slotTimes(): string[] {
  const out: string[] = [];
  for (let m = SLOT_START; m < SLOT_END; m += SLOT_MINUTES) out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  return out;
}

/** Franja de 30 min en la que cae una hora ('09:10' → '09:00'). */
export function slotOf(time: string): string {
  const [h, m] = time.split(':').map(Number) as [number, number];
  return `${String(h).padStart(2, '0')}:${m < 30 ? '00' : '30'}`;
}

export function SlotPicker({
  agenda,
  date,
  value,
  onChange,
  allowNone = true,
  label = 'Franja',
}: {
  agenda: AgendaName;
  date: IsoDate;
  value: string | undefined;
  onChange: (t: string | undefined) => void;
  allowNone?: boolean;
  label?: string;
}) {
  const { api } = useSession();
  const day = useAsync<AgendaItem[]>(() => (date ? api.agenda.list(agenda, date, date) : Promise.resolve([])), [agenda, date]);
  const busy = useMemo(() => {
    const m = new Map<string, number>();
    if (!day.data) return m;
    for (const i of agendaDay(day.data, agenda, date).timed) {
      if (i.kind !== 'cita' || i.status === 'cancelada' || i.status === 'reagendada') continue;
      const s = slotOf(i.time!);
      m.set(s, (m.get(s) ?? 0) + 1);
    }
    return m;
  }, [day.data, agenda, date]);

  return (
    <fieldset>
      <legend className="label flex items-center gap-2">
        {label}
        {day.loading && <Spinner className="size-3.5 text-stone-400" />}
        {value && <span className="font-normal text-stone-500">· {value}</span>}
      </legend>
      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
        {allowNone && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            aria-pressed={!value}
            className={cx(
              'col-span-2 rounded-md border px-2 py-1.5 text-xs font-medium',
              !value ? 'border-accent-600 bg-accent-600 text-white' : 'border-stone-300 hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800',
            )}
          >
            Sin hora
          </button>
        )}
        {slotTimes().map((t) => {
          const n = busy.get(t) ?? 0;
          const sel = value === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => onChange(t)}
              aria-pressed={sel}
              title={n ? `${n} cita${n > 1 ? 's' : ''} en esta franja` : 'Libre'}
              className={cx(
                'rounded-md border px-1 py-1.5 text-xs tabular-nums',
                sel
                  ? 'border-accent-600 bg-accent-600 font-semibold text-white'
                  : n
                    ? 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
                    : 'border-stone-300 hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800',
              )}
            >
              {t}
              {n > 0 && !sel && <span className="ml-0.5">•{n > 1 ? n : ''}</span>}
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-xs text-stone-500">Las franjas en ámbar ya tienen citas (se pueden solapar).</p>
    </fieldset>
  );
}
