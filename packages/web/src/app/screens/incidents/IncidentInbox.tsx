/** Bandeja de incidencias de Carlet: pendientes / en proceso / resueltas. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Incident, IncidentStatus } from '@modepran/domain';
import { RequirePerm } from '../../Layout';
import { IncidentCard, sortIncidents, type IncidentView } from '../../components/incidents/IncidentParts';
import { useAsync, useSession } from '../../context';
import { Button, Empty, ErrorBox, Loading, PageHeader, Tabs } from '../../ui';

export default function IncidentInbox() {
  return (
    <RequirePerm any={['incidents:manage', 'incidents:read']}>
      <Inbox />
    </RequirePerm>
  );
}

function Inbox() {
  const { api, can } = useSession();
  const [tab, setTab] = useState<IncidentStatus>('pendiente');
  // Se cargan todas (volumen pequeño) para tener los contadores de las tres pestañas.
  const list = useAsync<Incident[]>(() => api.incidents.list({}), []);
  const all = list.data ?? [];
  const count = (st: IncidentStatus) => all.filter((i) => i.status === st).length;
  const shown = sortIncidents(all.filter((i) => i.status === tab));

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Incidencias"
        subtitle="Comunicadas por Bienestar y el equipo"
        actions={
          <>
            <Button size="sm" onClick={list.reload}>
              ↻ Actualizar
            </Button>
            {can('incidents:create') && (
              <Link to="/incidencias/nueva" className="inline-flex items-center rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700">
                + Nueva
              </Link>
            )}
          </>
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'pendiente', label: 'Pendientes', count: count('pendiente') },
          { value: 'en_proceso', label: 'En proceso', count: count('en_proceso') },
          { value: 'resuelta', label: 'Resueltas', count: count('resuelta') },
        ]}
      />
      {list.loading && !list.data ? (
        <Loading />
      ) : list.error ? (
        <ErrorBox error={list.error} onRetry={list.reload} />
      ) : shown.length === 0 ? (
        <Empty title={tab === 'resuelta' ? 'Aún no hay incidencias resueltas' : 'No hay incidencias aquí'} icon="✨" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {shown.map((i) => (
            <IncidentCard key={i.id} incident={i as IncidentView} />
          ))}
        </div>
      )}
    </div>
  );
}
