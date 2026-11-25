/** Detalle de incidencia: datos (inmutables), fotos, historial, citas/derivaciones y acciones. */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { AgendaItem, AgendaName } from '@modepran/domain';
import { canWriteAgenda, isClosedAgendaItem, isIncidentOpen, isReferral } from '@modepran/domain';
import { fmtDateTime } from '../../../lib/format';
import { AgendaCard, AgendaDetailModal, SPECIES_LABELS, type AgendaItemView } from '../../components/agenda/AgendaParts';
import {
  AppointmentForm,
  incidentAnimal,
  PRIORITY_LABELS,
  PRIORITY_TONES,
  ReferralForm,
  ResolveForm,
  STATUS_LABELS,
  STATUS_TONES,
  type IncidentView,
} from '../../components/incidents/IncidentParts';
import { useAction, useAsync, useSession } from '../../context';
import { Badge, Button, Card, DL, Empty, ErrorBox, Loading, Notice, PageHeader } from '../../ui';

type Panel = 'cita' | 'derivar' | 'resolver' | undefined;

export default function IncidentDetail() {
  const { id = '' } = useParams();
  const s = useSession();
  const { api, can, name } = s;
  const data = useAsync(() => api.incidents.get(id), [id]);
  const [panel, setPanel] = useState<Panel>();
  const [openItem, setOpenItem] = useState<AgendaItemView>();
  const [flash, setFlash] = useState<string>();
  const start = useAction(async () => {
    await api.incidents.start(id);
    data.reload();
  });

  if (data.loading && !data.data) return <Loading />;
  if (data.error) return <ErrorBox error={data.error} onRetry={data.reload} />;
  if (!data.data) return <Empty title="Incidencia no encontrada" />;

  const incident = data.data.incident as IncidentView;
  const agendaItems: AgendaItem[] = data.data.agenda ?? [];
  const photoUrls = data.data.photoUrls ?? [];
  const open = isIncidentOpen(incident);
  const openReferral = agendaItems.some((a) => isReferral(a) && !isClosedAgendaItem(a));
  const hasReferral = agendaItems.some((a) => isReferral(a));
  const manage = can('incidents:manage');
  const canResolve = open && (manage || (can('incidents:resolve_referred') && hasReferral));
  const done = (msg: string) => {
    setPanel(undefined);
    setFlash(msg);
    data.reload();
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader
        title={incidentAnimal(incident)}
        subtitle={`Incidencia comunicada el ${fmtDateTime(incident.createdAt)}`}
        actions={
          <Link to={manage ? '/incidencias' : can('incidents:resolve_referred') ? '/incidencias/derivaciones' : '/incidencias/mias'} className="text-sm text-accent-700 underline dark:text-accent-300">
            ← Volver
          </Link>
        }
      />
      <div className="flex flex-wrap gap-2">
        <Badge tone={STATUS_TONES[incident.status]}>{STATUS_LABELS[incident.status]}</Badge>
        <Badge tone={PRIORITY_TONES[incident.priority]}>Prioridad {PRIORITY_LABELS[incident.priority].toLowerCase()}</Badge>
        {openReferral && <Badge tone="blue">↪ Derivada a Modevet</Badge>}
      </div>
      {flash && <Notice tone="success">{flash}</Notice>}

      <Card title="Qué se comunicó">
        <p className="mb-4 rounded-lg bg-stone-50 p-3 text-base whitespace-pre-wrap dark:bg-stone-800/50">{incident.text}</p>
        <DL
          items={[
            [
              'Animal',
              incident.animalId !== undefined ? (
                <Link className="text-accent-700 underline dark:text-accent-300" to={`/animales/${incident.animalId}`}>
                  {incidentAnimal(incident)} (nº {incident.animalId})
                </Link>
              ) : (
                incidentAnimal(incident)
              ),
            ],
            ['Especie', SPECIES_LABELS[incident.species]],
            ['Ubicación', incident.areaName],
            ['Comunica', incident.reporterStaffId ? name('staff', incident.reporterStaffId) : incident.reporterUserId],
          ]}
        />
        {photoUrls.length > 0 && (
          <div className="mt-4 grid grid-cols-3 gap-2">
            {photoUrls.map((u, n) => (
              <a key={u} href={u} target="_blank" rel="noreferrer" className="block">
                <img src={u} alt={`Foto ${n + 1} de la incidencia`} className="aspect-square w-full rounded-lg object-cover" loading="lazy" />
              </a>
            ))}
          </div>
        )}
        {incident.photos.length > 0 && photoUrls.length === 0 && <p className="mt-3 text-xs text-stone-500">📷 {incident.photos.length} foto(s) (no disponibles ahora).</p>}
      </Card>

      {incident.resolution && (
        <Notice tone="success">
          <p className="font-semibold">Resuelta el {fmtDateTime(incident.resolution.at)} por {name('staff', incident.resolution.byStaffId)}</p>
          <p className="mt-1 whitespace-pre-wrap">{incident.resolution.treatment}</p>
        </Notice>
      )}

      {open && (manage || canResolve) && (
        <Card title="Acciones">
          <div className="flex flex-wrap gap-2">
            {manage && incident.status === 'pendiente' && (
              <Button loading={start.busy} onClick={() => void start.run()}>
                ▶ Marcar en proceso
              </Button>
            )}
            {manage && (
              <Button variant={panel === 'cita' ? 'primary' : 'secondary'} onClick={() => setPanel(panel === 'cita' ? undefined : 'cita')}>
                📅 Dar cita
              </Button>
            )}
            {manage && (
              <Button
                variant={panel === 'derivar' ? 'primary' : 'secondary'}
                disabled={openReferral}
                title={openReferral ? 'Ya tiene una derivación abierta' : undefined}
                onClick={() => setPanel(panel === 'derivar' ? undefined : 'derivar')}
              >
                ↪ Derivar a Modevet
              </Button>
            )}
            {canResolve && (
              <Button variant={panel === 'resolver' ? 'primary' : 'secondary'} onClick={() => setPanel(panel === 'resolver' ? undefined : 'resolver')}>
                ✔ Resolver
              </Button>
            )}
          </div>
          {start.error !== undefined && <div className="mt-3"><ErrorBox error={start.error} /></div>}
          {openReferral && manage && <p className="mt-2 text-xs text-stone-500">Ya hay una derivación abierta: no se puede derivar otra vez.</p>}
          {panel && (
            <div className="mt-4 border-t border-stone-200 pt-4 dark:border-stone-800">
              {panel === 'cita' && <AppointmentForm incident={incident} onDone={() => done('Cita creada.')} />}
              {panel === 'derivar' && <ReferralForm incident={incident} onDone={() => done('Derivada a Modevet.')} />}
              {panel === 'resolver' && <ResolveForm incident={incident} onDone={() => done('Incidencia resuelta.')} />}
            </div>
          )}
        </Card>
      )}

      <Card title={`Citas y derivaciones (${agendaItems.length})`}>
        {agendaItems.length === 0 ? (
          <p className="text-sm text-stone-500">Sin citas ni derivaciones.</p>
        ) : (
          <div className="space-y-2">
            {[...agendaItems]
              .sort((a, b) => `${a.date}${a.time ?? ''}`.localeCompare(`${b.date}${b.time ?? ''}`))
              .map((a) => (
                <AgendaCard key={a.id} item={a} showDate onOpen={() => setOpenItem(a)} />
              ))}
          </div>
        )}
      </Card>

      <Card title="Historial">
        <ol className="space-y-1 text-sm">
          {(incident.statusEvents ?? []).map((e, n) => (
            <li key={n} className="flex flex-wrap gap-2">
              <span className="text-stone-500 tabular-nums">{fmtDateTime(e.at)}</span>
              <strong>{STATUS_LABELS[e.status]}</strong>
              <span className="text-stone-500">· {e.by}</span>
            </li>
          ))}
          {!incident.statusEvents?.length && <li className="text-stone-500">Sin cambios de estado.</li>}
        </ol>
      </Card>

      {openItem && (
        <AgendaDetailModal
          item={openItem}
          agenda={(openItem.agenda === 'ambas' ? 'carlet' : openItem.agenda) as AgendaName}
          canWrite={canWriteAgenda(s.me.profiles, (openItem.agenda === 'ambas' ? 'carlet' : openItem.agenda) as AgendaName)}
          onClose={() => setOpenItem(undefined)}
          onChanged={data.reload}
        />
      )}
    </div>
  );
}
