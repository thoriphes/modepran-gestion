/** Inicio según perfil: dashboard (admin/carlet), agenda de hoy (modevet), incidencias (bienestar). */
import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { AGENDA_STATUS_LABELS, formatSpanishLong, todayMadrid, type AgendaItem, type Incident } from '@modepran/domain';
import { fmtDateTime } from '../../lib/format';
import { useAsync, useSession } from '../context';
import { Badge, Card, Empty, ErrorBox, Loading, PageHeader } from '../ui';

const ArrivalsExitsChart = lazy(() => import('../components/reports/ArrivalsExitsChart'));

export default function Home() {
  const s = useSession();
  const showDashboard = s.can('reports:read');
  const showModevet = s.hasProfile('modevet') && s.can('agenda_modevet:read');
  const showBienestar = s.hasProfile('bienestar') || (!showDashboard && !showModevet && s.can('incidents:create'));
  const first = (s.me.name ?? s.me.email ?? '').split(/[\s@]/)[0];

  return (
    <div className="space-y-6">
      <PageHeader title={first ? `Hola, ${first}` : 'Inicio'} subtitle={capitalize(formatSpanishLong(todayMadrid()))} />
      {showBienestar && <BienestarSection />}
      {showModevet && <ModevetSection />}
      {showDashboard && <DashboardSection />}
      <QuickLinks />
    </div>
  );
}

const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

function DashboardSection() {
  const { api } = useSession();
  const d = useAsync(() => api.reports.dashboard(), [api]);
  if (d.loading) return <Loading label="Cargando resumen…" />;
  if (d.error) return <ErrorBox error={d.error} onRetry={d.reload} />;
  if (!d.data) return null;
  const last = d.data.months.at(-1);
  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
        <Link to="/animales" className="card block p-5 transition hover:border-accent-300">
          <p className="text-sm font-medium text-stone-500 dark:text-stone-400">Disponibles</p>
          <p className="font-display mt-1 text-5xl font-semibold text-accent-700 tabular-nums dark:text-accent-300">{d.data.available.toLocaleString('es-ES')}</p>
          <p className="mt-1 text-xs text-stone-500">animales en la protectora</p>
        </Link>
        {last && (
          <>
            <div className="card p-4">
              <p className="text-sm text-stone-500 dark:text-stone-400">Entradas este mes</p>
              <p className="text-2xl font-semibold tabular-nums">{last.arrivals}</p>
            </div>
            <div className="card p-4">
              <p className="text-sm text-stone-500 dark:text-stone-400">Salidas este mes</p>
              <p className="text-2xl font-semibold tabular-nums">{last.exits}</p>
            </div>
          </>
        )}
      </div>
      <Card title="Entradas y salidas, últimos 12 meses">
        {d.data.months.some((m) => m.arrivals || m.exits) ? (
          <Suspense fallback={<Loading />}>
            <ArrivalsExitsChart months={d.data.months} />
          </Suspense>
        ) : (
          <Empty title="Sin movimientos en los últimos 12 meses" />
        )}
      </Card>
    </div>
  );
}

function ModevetSection() {
  const { api, can } = useSession();
  const today = todayMadrid();
  const a = useAsync(() => api.agenda.list('modevet', today, today), [api, today]);
  const items = (a.data ?? []).slice().sort((x, y) => (x.time ?? '99:99').localeCompare(y.time ?? '99:99'));
  return (
    <Card
      title="Hoy en Modevet"
      actions={
        <>
          <Link className="text-sm text-accent-700 underline dark:text-accent-300" to="/agenda/modevet">
            Abrir agenda
          </Link>
          {(can('incidents:resolve_referred') || can('agenda_modevet:write')) && (
            <Link className="text-sm text-accent-700 underline dark:text-accent-300" to="/incidencias/derivaciones">
              Derivaciones
            </Link>
          )}
        </>
      }
      bodyClassName="p-0"
    >
      {a.loading && <Loading />}
      {!!a.error && (
        <div className="p-4">
          <ErrorBox error={a.error} onRetry={a.reload} />
        </div>
      )}
      {a.data && !items.length && <Empty title="Nada para hoy" icon="☕" />}
      {!!items.length && (
        <ul className="divide-y divide-stone-100 dark:divide-stone-800">
          {items.map((i) => (
            <AgendaRow key={i.id} item={i} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function AgendaRow({ item }: { item: AgendaItem }) {
  const who = item.externalAnimal?.name ?? (item.animalId ? `Ficha nº ${item.animalId}` : '');
  return (
    <li className="flex items-start gap-3 px-4 py-2.5">
      <span className="w-12 shrink-0 pt-0.5 text-sm font-semibold tabular-nums">{item.time ?? 'S/H'}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {item.appointmentType ? <Badge color={item.appointmentType.color}>{item.appointmentType.name}</Badge> : <Badge>{item.kind}</Badge>}
          {item.isReferral && <Badge tone="accent">Derivación</Badge>}
          {who && <span className="text-sm font-medium">{who}</span>}
        </div>
        {item.text && <p className="truncate text-sm text-stone-600 dark:text-stone-400">{item.text}</p>}
      </div>
      <Badge tone={item.status === 'pendiente' ? 'amber' : item.status === 'concluida' || item.status === 'concluido' ? 'green' : 'neutral'}>{AGENDA_STATUS_LABELS[item.status]}</Badge>
    </li>
  );
}

const INCIDENT_STATUS_LABEL: Record<Incident['status'], string> = { pendiente: 'Pendiente', en_proceso: 'En proceso', resuelta: 'Resuelta' };
const PRIORITY_TONE = { normal: 'neutral', importante: 'amber', urgente: 'red' } as const;

function BienestarSection() {
  const { api } = useSession();
  const list = useAsync(() => api.incidents.list({ mine: true }), [api]);
  return (
    <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
      <Link
        to="/incidencias/nueva"
        className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-accent-600 px-6 py-10 text-center text-white shadow-md transition hover:bg-accent-700"
      >
        <span className="text-5xl" aria-hidden="true">
          👀
        </span>
        <span className="font-display text-2xl font-semibold">¿Has observado algo?</span>
        <span className="text-sm text-accent-100">Comunica una incidencia con fotos o por voz</span>
      </Link>
      <Card
        title="Mis incidencias"
        actions={
          <Link className="text-sm text-accent-700 underline dark:text-accent-300" to="/incidencias/mias">
            Ver todas
          </Link>
        }
        bodyClassName="p-0"
      >
        {list.loading && <Loading />}
        {!!list.error && (
          <div className="p-4">
            <ErrorBox error={list.error} onRetry={list.reload} />
          </div>
        )}
        {list.data && !list.data.length && <Empty title="Aún no has comunicado ninguna incidencia" />}
        {!!list.data?.length && (
          <ul className="divide-y divide-stone-100 dark:divide-stone-800">
            {list.data.slice(0, 8).map((i) => (
              <li key={i.id}>
                <Link to={`/incidencias/${i.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-stone-50 dark:hover:bg-stone-800/50">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {i.animalName ?? (i.animalId ? `Ficha nº ${i.animalId}` : 'Sin animal')} · {i.areaName}
                    </p>
                    <p className="truncate text-xs text-stone-500">{fmtDateTime(i.createdAt)} · {i.text}</p>
                  </div>
                  {i.priority !== 'normal' && <Badge tone={PRIORITY_TONE[i.priority]}>{i.priority}</Badge>}
                  <Badge tone={i.status === 'resuelta' ? 'green' : i.status === 'en_proceso' ? 'blue' : 'amber'}>{INCIDENT_STATUS_LABEL[i.status]}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function QuickLinks() {
  const { can } = useSession();
  const links = [
    { to: '/animales/nuevo', label: 'Nueva llegada', icon: '➕', ok: can('animals:write') },
    { to: '/animales', label: 'Buscar animal', icon: '🔎', ok: can('animals:read') },
    { to: '/agenda/carlet', label: 'Agenda Carlet', icon: '📅', ok: can('agenda_carlet:read') },
    { to: '/agenda/modevet', label: 'Agenda Modevet', icon: '🩺', ok: can('agenda_modevet:read') },
    { to: '/incidencias', label: 'Incidencias', icon: '🚩', ok: can('incidents:manage') },
    { to: '/informes', label: 'Informes', icon: '📊', ok: can('reports:read') },
    { to: '/contactos', label: 'Contactos', icon: '👤', ok: can('contacts:read') },
  ].filter((l) => l.ok);
  if (!links.length) return null;
  return (
    <section aria-label="Accesos rápidos">
      <h2 className="mb-2 text-sm font-semibold tracking-wide text-stone-500 uppercase">Accesos rápidos</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {links.map((l) => (
          <Link key={l.to} to={l.to} className="card flex flex-col items-center gap-1 p-3 text-center text-sm font-medium transition hover:border-accent-300">
            <span className="text-2xl" aria-hidden="true">
              {l.icon}
            </span>
            {l.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
