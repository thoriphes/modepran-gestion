/** Seguimiento de Bienestar: las incidencias que he comunicado (solo lectura). */
import { Link } from 'react-router-dom';
import type { Incident } from '@modepran/domain';
import { IncidentCard, type IncidentView } from '../../components/incidents/IncidentParts';
import { useAsync, useSession } from '../../context';
import { Button, Empty, ErrorBox, Loading, PageHeader } from '../../ui';

export default function MyIncidents() {
  const { api, can } = useSession();
  const list = useAsync<Incident[]>(() => api.incidents.list({ mine: true }), []);
  const items = [...(list.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const open = items.filter((i) => i.status !== 'resuelta');
  const closed = items.filter((i) => i.status === 'resuelta');

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Mis incidencias"
        subtitle="Lo que has comunicado y cómo va"
        actions={
          <>
            <Button size="sm" onClick={list.reload}>
              ↻
            </Button>
            {can('incidents:create') && (
              <Link to="/incidencias/nueva" className="inline-flex items-center rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700">
                + Comunicar algo
              </Link>
            )}
          </>
        }
      />
      {list.loading && !list.data ? (
        <Loading />
      ) : list.error ? (
        <ErrorBox error={list.error} onRetry={list.reload} />
      ) : items.length === 0 ? (
        <Empty title="Todavía no has comunicado ninguna incidencia">
          <Link className="text-accent-700 underline" to="/incidencias/nueva">
            ¿Has observado algo?
          </Link>
        </Empty>
      ) : (
        <div className="space-y-6">
          <section>
            <h2 className="mb-2 text-sm font-semibold text-stone-600 dark:text-stone-400">Abiertas ({open.length})</h2>
            {open.length ? (
              <div className="space-y-2">
                {open.map((i) => (
                  <IncidentCard key={i.id} incident={i as IncidentView} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-stone-500">Ninguna abierta.</p>
            )}
          </section>
          {closed.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-stone-600 dark:text-stone-400">Resueltas ({closed.length})</h2>
              <div className="space-y-2">
                {closed.map((i) => (
                  <IncidentCard key={i.id} incident={i as IncidentView} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
