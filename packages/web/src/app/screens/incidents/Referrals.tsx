/** Bandeja de derivaciones a Modevet: incidencias abiertas con derivación. */
import type { Incident } from '@modepran/domain';
import { RequirePerm } from '../../Layout';
import { IncidentCard, sortIncidents, type IncidentView } from '../../components/incidents/IncidentParts';
import { useAsync, useSession } from '../../context';
import { Button, Empty, ErrorBox, Loading, PageHeader } from '../../ui';

export default function Referrals() {
  return (
    <RequirePerm any={['incidents:resolve_referred', 'agenda_modevet:write', 'incidents:manage']}>
      <List />
    </RequirePerm>
  );
}

function List() {
  const { api, can } = useSession();
  const list = useAsync<Incident[]>(() => api.incidents.referred(), []);
  const items = sortIncidents((list.data ?? []).filter((i) => i.status !== 'resuelta'));
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Derivaciones a Modevet"
        subtitle={can('incidents:resolve_referred') ? 'Ábrelas para ver el detalle y resolverlas.' : 'Incidencias de Carlet derivadas a la clínica.'}
        actions={
          <Button size="sm" onClick={list.reload}>
            ↻ Actualizar
          </Button>
        }
      />
      {list.loading && !list.data ? (
        <Loading />
      ) : list.error ? (
        <ErrorBox error={list.error} onRetry={list.reload} />
      ) : items.length === 0 ? (
        <Empty title="No hay derivaciones abiertas" icon="✨" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((i) => (
            <IncidentCard key={i.id} incident={i as IncidentView} />
          ))}
        </div>
      )}
    </div>
  );
}
