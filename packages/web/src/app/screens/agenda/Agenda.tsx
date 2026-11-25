/** Agenda de Carlet o de Modevet: día / semana, franja "sin hora", pendientes de días anteriores. */
import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { AgendaItem, AgendaName, IsoDate } from '@modepran/domain';
import { addDays, agendaDay, canReadAgenda, canWriteAgenda, overdueItems, todayMadrid } from '@modepran/domain';
import { fmtDate, mondayOf, weekdayName, weekdayShort } from '../../../lib/format';
import { AgendaCard, AgendaDetailModal, NewAgendaItemModal, type AgendaItemView } from '../../components/agenda/AgendaParts';
import { useAsync, useSession } from '../../context';
import { Button, cx, Empty, ErrorBox, Loading, PageHeader, Segmented } from '../../ui';

const NAMES: Record<AgendaName, string> = { carlet: 'Carlet', modevet: 'Modevet' };

export default function Agenda() {
  const { agenda: param } = useParams();
  const s = useSession();
  const agenda: AgendaName | undefined = param === 'carlet' || param === 'modevet' ? param : undefined;
  const today = todayMadrid();
  const [view, setView] = useState<'day' | 'week'>(() => (typeof window !== 'undefined' && window.innerWidth >= 1024 ? 'week' : 'day'));
  const [date, setDate] = useState<IsoDate>(today);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<AgendaItemView>();

  const from = view === 'day' ? date : mondayOf(date);
  const to = view === 'day' ? date : addDays(from, 6);

  const items = useAsync<AgendaItemView[]>(() => (agenda ? s.api.agenda.list(agenda, from, to) : Promise.resolve([])), [agenda, from, to]);
  const overdue = useAsync<AgendaItemView[]>(async () => {
    if (!agenda) return [];
    try {
      return await s.api.agenda.overdue(agenda, today);
    } catch {
      // Si la API no admite `overdueBefore`, se calcula con los últimos 60 días.
      const list = await s.api.agenda.list(agenda, addDays(today, -60), addDays(today, -1));
      return overdueItems(list, agenda, today);
    }
  }, [agenda, today]);

  const days = useMemo(() => Array.from({ length: view === 'day' ? 1 : 7 }, (_, i) => addDays(from, i)), [from, view]);

  if (!agenda) return <Empty title="Agenda desconocida" />;
  if (!canReadAgenda(s.me.profiles, agenda)) return <Empty title="No tienes acceso a esta agenda" icon="🔒" />;
  const canWrite = canWriteAgenda(s.me.profiles, agenda);
  const reload = () => {
    items.reload();
    overdue.reload();
  };
  const step = view === 'day' ? 1 : 7;
  const overdueList = (overdue.data ?? []).filter((i) => i.date < today);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={`Agenda ${NAMES[agenda]}`}
        subtitle={view === 'day' ? `${weekdayName(date)}, ${fmtDate(date)}` : `Semana del ${fmtDate(from)} al ${fmtDate(to)}`}
        actions={
          canWrite ? (
            <Button variant="primary" onClick={() => setCreating(true)}>
              + Nuevo
            </Button>
          ) : undefined
        }
      />

      {!canWrite && agenda === 'modevet' && (
        <p className="mb-3 text-sm text-stone-500">Solo lectura. Las derivaciones a Modevet se crean desde las incidencias.</p>
      )}

      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'day', label: 'Día' },
            { value: 'week', label: 'Semana' },
          ]}
        />
        <div className="flex items-center gap-1">
          <Button size="sm" onClick={() => setDate(addDays(date, -step))} aria-label="Anterior">
            ‹
          </Button>
          <Button size="sm" onClick={() => setDate(today)} disabled={date === today}>
            Hoy
          </Button>
          <Button size="sm" onClick={() => setDate(addDays(date, step))} aria-label="Siguiente">
            ›
          </Button>
        </div>
        <input type="date" className="input w-auto" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Ir a fecha" />
      </div>

      {overdueList.length > 0 && (
        <section className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
          <h2 className="mb-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
            ⏰ Pendientes de días anteriores ({overdueList.length})
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {overdueList.map((i) => (
              <AgendaCard key={i.id} item={i} showDate onOpen={() => setOpen(i)} />
            ))}
          </div>
        </section>
      )}

      {items.loading && !items.data ? (
        <Loading />
      ) : items.error ? (
        <ErrorBox error={items.error} onRetry={items.reload} />
      ) : (
        <div className={cx('grid gap-3', view === 'week' && 'md:grid-cols-2 xl:grid-cols-7')}>
          {days.map((d) => (
            <DayColumn key={d} agenda={agenda} date={d} today={today} items={items.data ?? []} compact={view === 'week'} onOpen={setOpen} />
          ))}
        </div>
      )}

      {creating && (
        <NewAgendaItemModal
          open={creating}
          onClose={() => setCreating(false)}
          agenda={agenda}
          defaultDate={date}
          onCreated={() => reload()}
        />
      )}
      <AgendaDetailModal item={open} agenda={agenda} canWrite={canWrite} onClose={() => setOpen(undefined)} onChanged={reload} />
    </div>
  );
}

function DayColumn({
  agenda,
  date,
  today,
  items,
  compact,
  onOpen,
}: {
  agenda: AgendaName;
  date: IsoDate;
  today: IsoDate;
  items: AgendaItem[];
  compact: boolean;
  onOpen: (i: AgendaItemView) => void;
}) {
  const { untimed, timed } = agendaDay(items, agenda, date);
  const isToday = date === today;
  return (
    <section className={cx('min-w-0 rounded-xl border p-2', isToday ? 'border-accent-300 bg-accent-50/40 dark:border-accent-800 dark:bg-accent-950/20' : 'border-stone-200 dark:border-stone-800')}>
      {compact && (
        <h2 className={cx('mb-2 px-1 text-sm font-semibold capitalize', isToday && 'text-accent-700 dark:text-accent-300')}>
          {weekdayShort(date)} {fmtDate(date).slice(0, 5)}
        </h2>
      )}
      {untimed.length === 0 && timed.length === 0 ? (
        <p className="px-1 py-4 text-center text-xs text-stone-400">Nada programado</p>
      ) : (
        <div className="space-y-2">
          {untimed.length > 0 && (
            <div className="space-y-1.5">
              <p className="px-1 text-xs font-semibold tracking-wide text-stone-500 uppercase">Sin hora</p>
              {untimed.map((i) => (
                <AgendaCard key={i.id} item={i} onOpen={() => onOpen(i)} />
              ))}
            </div>
          )}
          {timed.length > 0 && (
            <div className="space-y-1.5">
              {untimed.length > 0 && <p className="px-1 text-xs font-semibold tracking-wide text-stone-500 uppercase">Con hora</p>}
              {timed.map((i) => (
                <AgendaCard key={i.id} item={i} onOpen={() => onOpen(i)} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
