/** Ficha del animal: datos, chip, foto, historial (añadir/borrar eventos, adjuntos, documentos). */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  canAddEventType,
  contactFullName,
  EVENT_TYPE_NAMES,
  firstRegisteredEvent,
  formatAge,
  sortEvents,
  todayMadrid,
  type Contact,
  type EventTypeCode,
  type HistoryEvent,
} from '@modepran/domain';
import { errorMessage, uploadToSignedUrl, type AnimalDetail as Detail } from '../../../lib/api';
import { fmtBool, fmtDate, fmtGender, fmtSize } from '../../../lib/format';
import { AnimalFields, animalDraftErrors, animalDraftToData, draftFromAnimal, PhotoInput, uploadAnimalPhoto, type AnimalDraft } from '../../components/animals/AnimalFields';
import { draftErrors, draftToInput, emptyDraft, EventFields, wantsDocument, type EventDraft } from '../../components/animals/EventFields';
import { options, useAsync, useSession } from '../../context';
import { RequirePerm } from '../../Layout';
import { Badge, Button, Card, DL, Empty, ErrorBox, Loading, Modal, PageHeader, Segmented, Select } from '../../ui';
import { StatusBadge } from './AnimalList';
import { useAnimalPhoto } from '../../components/AnimalPicker';

export default function AnimalDetail() {
  return (
    <RequirePerm perm="animals:read">
      <Inner />
    </RequirePerm>
  );
}

function Inner() {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const s = useSession();
  const nav = useNavigate();
  const res = useAsync(() => s.api.animals.get(id), [id]);
  const [editing, setEditing] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [actionError, setActionError] = useState<unknown>();
  const photoSrc = useAnimalPhoto(res.data?.animal.id, res.data?.animal.hasPhoto, 'photo', res.data?.photoUrl, res.data?.animal.updatedAt);

  if (!Number.isFinite(id)) return <ErrorBox error={new Error('Nº de ficha no válido.')} />;
  if (res.loading && !res.data) return <Loading />;
  if (res.error) return <ErrorBox error={res.error} onRetry={res.reload} />;
  if (!res.data) return null;
  const d = res.data;
  const a = d.animal;
  const canWriteAny = s.can('animals:write') || s.can('events:vet');

  const removeAnimal = async () => {
    if (!confirm(`¿Borrar la ficha nº ${a.id} (${a.name}) con todo su historial y ficheros? No se puede deshacer.`)) return;
    try {
      await s.api.animals.remove(a.id);
      nav('/animales');
    } catch (e) {
      setActionError(e);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {a.name} <span className="text-base font-normal text-stone-500">nº {a.id}</span> <StatusBadge statusId={a.statusId} />
          </span>
        }
        subtitle={`${s.name('species', a.speciesId)}${a.breedId ? ` · ${s.name('breeds', a.breedId)}` : ''} · ${a.centerId ? s.name('centers', a.centerId) : 'sin centro'}`}
        actions={
          <>
            <Button onClick={() => nav('/animales')}>← Listado</Button>
            {(s.can('documents:generate') || s.can('documents:vet')) && <Button onClick={() => nav(`/documentos/ficha/${a.id}`)}>🖨️ Ficha</Button>}
            {s.can('animals:write') && <Button onClick={() => setEditing(true)}>✏️ Editar</Button>}
            {s.can('animals:delete') && (
              <Button variant="danger" onClick={removeAnimal}>
                Borrar
              </Button>
            )}
          </>
        }
      />
      {actionError !== undefined && <ErrorBox error={actionError} />}

      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        <Card bodyClassName="p-3">
          {photoSrc ? (
            <img src={photoSrc} alt={`Foto de ${a.name}`} className="mx-auto aspect-square w-full max-w-72 rounded-lg object-cover lg:max-w-none" />
          ) : (
            <div className="mx-auto grid aspect-square w-full max-w-48 place-items-center rounded-lg bg-stone-100 text-5xl lg:max-w-none text-stone-300 dark:bg-stone-800" aria-hidden="true">
              🐾
            </div>
          )}
          {s.can('animals:write') && (
            <Button className="mt-2 w-full" size="sm" onClick={() => setPhotoOpen(true)}>
              {a.hasPhoto ? 'Cambiar foto' : 'Subir foto'}
            </Button>
          )}
        </Card>
        <div className="space-y-4">
          <Card title="Datos">
            <DL
              cols={3}
              items={[
                ['Sexo', fmtGender(a.gender)],
                ['Tamaño', fmtSize(a.size)],
                ['Peso', a.weightKg !== undefined ? `${a.weightKg.toLocaleString('es-ES')} kg` : '—'],
                ['Color', a.color || '—'],
                ['Nacimiento', fmtDate(a.bornAt)],
                ['Edad', a.bornAt ? formatAge(a.bornAt, todayMadrid()) : '—'],
                ['Esterilizado', fmtBool(a.sterilized)],
                ['PPP', fmtBool(a.ppp)],
                ['Visible en web', fmtBool(a.visibleWeb)],
                ['Compat. perros', fmtBool(a.compatibleDogs)],
                ['Compat. gatos', fmtBool(a.compatibleCats)],
                ['Última llegada', a.lastArrival ? `${fmtDate(a.lastArrival.date)} · ${a.lastArrival.cityName ?? s.name('cities', a.lastArrival.cityId)}` : '—'],
              ]}
            />
          </Card>
          <Card title="Chip">
            {a.chip ? (
              <DL
                items={[
                  ['Número', <span className="font-mono">{a.chip.number}</span>],
                  ['Pasaporte', a.chip.passport || '—'],
                  ['Propietario', a.chip.owner || '—'],
                  ['Teléfono', a.chip.phone || '—'],
                  ['Notas', a.chip.notes || '—'],
                ]}
              />
            ) : (
              <p className="text-sm text-stone-500">Sin chip registrado.{s.can('animals:write') ? ' Puedes añadirlo en «Editar».' : ''}</p>
            )}
          </Card>
        </div>
      </div>

      <History detail={d} onAdd={canWriteAny ? () => setAddOpen(true) : undefined} onChanged={res.reload} />

      {editing && <EditModal detail={d} onClose={() => setEditing(false)} onSaved={() => (setEditing(false), res.reload())} />}
      {photoOpen && <PhotoModal detail={d} onClose={() => setPhotoOpen(false)} onSaved={() => (setPhotoOpen(false), res.reload())} />}
      {addOpen && <AddEventModal detail={d} onClose={() => setAddOpen(false)} onSaved={() => (setAddOpen(false), res.reload())} />}
    </div>
  );
}

// ─────────────── Historial ───────────────

function History({ detail, onAdd, onChanged }: { detail: Detail; onAdd: (() => void) | undefined; onChanged: () => void }) {
  const s = useSession();
  const nav = useNavigate();
  const [err, setErr] = useState<unknown>();
  const events = useMemo(() => sortEvents(detail.events).reverse(), [detail.events]);
  const first = useMemo(() => firstRegisteredEvent(detail.events), [detail.events]);
  const contacts = useMemo(() => new Map<number, Contact>(detail.contacts.map((c) => [c.id, c])), [detail.contacts]);
  const showContacts = s.can('animals:read_contacts');
  const workerName = (uid?: string) => (uid ? (s.catalogs.workers?.find((w) => w.id === uid)?.name ?? s.catalogs.staff.find((w) => w.id === uid)?.name ?? uid) : '—');

  const del = async (e: HistoryEvent) => {
    if (!confirm(`¿Borrar el evento «${s.name('subtypes', e.subtypeId)}» del ${fmtDate(e.date)}? Se recalcularán el estado y el centro.`)) return;
    try {
      await s.api.animals.deleteEvent(detail.animal.id, e.id);
      onChanged();
    } catch (x) {
      setErr(x);
    }
  };
  const openFile = async (e: HistoryEvent) => {
    if (!e.document) return;
    const w = window.open('', '_blank');
    try {
      const { url } = await s.api.animals.fileUrl(detail.animal.id, e.document.key);
      if (w) w.location.href = url;
      else window.location.href = url;
    } catch (x) {
      w?.close();
      setErr(x);
    }
  };

  return (
    <Card
      title={`Historial (${events.length})`}
      bodyClassName="p-0"
      actions={
        onAdd && (
          <Button variant="primary" size="sm" onClick={onAdd}>
            ➕ Añadir evento
          </Button>
        )
      }
    >
      {err !== undefined && (
        <div className="p-3">
          <ErrorBox error={err} />
        </div>
      )}
      {events.length === 0 ? (
        <Empty title="Sin eventos" />
      ) : (
        <ul className="divide-y divide-stone-100 dark:divide-stone-800">
          {events.map((e) => {
            const st = s.catalogs.subtypes.find((x) => x.id === e.subtypeId);
            const contact = e.contactId !== undefined ? contacts.get(e.contactId) : undefined;
            const canDelete = s.can('events:delete') && first?.id !== e.id;
            return (
              <li key={e.id} className="flex flex-wrap items-start gap-3 px-4 py-3 text-sm">
                <div className="w-24 shrink-0 tabular-nums">
                  <p className="font-medium">{fmtDate(e.date)}</p>
                  <p className="text-xs text-stone-500">#{e.id}</p>
                </div>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p>
                    <Badge tone={e.typeId === 'llegada' ? 'green' : e.typeId === 'salida' ? 'accent' : e.typeId === 'veterinario' ? 'blue' : 'amber'}>{EVENT_TYPE_NAMES[e.typeId]}</Badge>{' '}
                    <strong>{st?.name ?? e.subtypeId}</strong>
                  </p>
                  <p className="text-stone-600 dark:text-stone-400">
                    {[
                      `Por ${workerName(e.userId)}`,
                      e.centerId && `Centro ${s.name('centers', e.centerId)}`,
                      (e.cityName || e.cityId) && `${e.cityName ?? s.name('cities', e.cityId)}${e.address ? `, ${e.address}` : ''}${e.zip ? ` (${e.zip})` : ''}`,
                      e.vaccineId && `Vacuna: ${s.name('vaccines', e.vaccineId)}`,
                      e.illnessId && `Enfermedad: ${s.name('illnesses', e.illnessId)}`,
                      e.colonyId && `Colonia: ${s.name('colonies', e.colonyId)}`,
                      st?.switch && e.switchValue !== undefined && `${st.switchLabel ?? 'Sí/No'}: ${e.switchValue ? 'Sí' : 'No'}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {showContacts && contact && (
                    <p>
                      Contacto:{' '}
                      <Link className="text-accent-700 underline dark:text-accent-300" to={`/contactos/${contact.id}`}>
                        {contactFullName(contact)}
                      </Link>
                      {contact.phone ? ` · ${contact.phone}` : ''}
                    </p>
                  )}
                  {e.notes && <p className="whitespace-pre-line text-stone-700 dark:text-stone-300">{e.notes}</p>}
                </div>
                <div className="flex flex-wrap gap-1">
                  {e.document && (
                    <Button size="sm" onClick={() => void openFile(e)} title={e.document.originalName}>
                      📎 Adjunto
                    </Button>
                  )}
                  {(st?.docGenerate || e.typeId === 'veterinario') && (s.can('documents:generate') || (s.can('documents:vet') && e.typeId === 'veterinario')) && (
                    <Button size="sm" onClick={() => nav(`/documentos/evento/${e.id}?animal=${detail.animal.id}`)}>
                      📄 Documento
                    </Button>
                  )}
                  {canDelete && (
                    <Button size="sm" variant="ghost" className="text-red-700 dark:text-red-400" onClick={() => void del(e)} aria-label={`Borrar evento ${e.id}`}>
                      Borrar
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// ─────────────── Modales ───────────────

function EditModal({ detail, onClose, onSaved }: { detail: Detail; onClose: () => void; onSaved: () => void }) {
  const s = useSession();
  const a = detail.animal;
  const [draft, setDraft] = useState<AnimalDraft>(() => draftFromAnimal(a, a.breedId ? s.name('breeds', a.breedId) : ''));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const save = async () => {
    const errs = animalDraftErrors(draft);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const data = animalDraftToData(draft, s.catalogs.breeds);
      // El centro lo cambian los eventos con flag center: no se edita aquí.
      delete data.centerId;
      await s.api.animals.update(a.id, data);
      if (data.breedName) void s.reloadCatalogs();
      onSaved();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={`Editar ${a.name}`}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            Guardar
          </Button>
        </>
      }
    >
      <AnimalFields draft={draft} setDraft={setDraft} errors={errors} showCenter={false} />
      <p className="mt-3 text-xs text-stone-500">El centro y el estado cambian con los eventos del historial.</p>
      {error !== undefined && (
        <div className="mt-3">
          <ErrorBox error={error} />
        </div>
      )}
    </Modal>
  );
}

function PhotoModal({ detail, onClose, onSaved }: { detail: Detail; onClose: () => void; onSaved: () => void }) {
  const thumb = useAnimalPhoto(detail.animal.id, detail.animal.hasPhoto, 'thumb', detail.thumbUrl);
  const s = useSession();
  const [file, setFile] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const save = async () => {
    if (!file) return;
    setBusy(true);
    try {
      await uploadAnimalPhoto(s.api, detail.animal.id, file);
      onSaved();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Foto del animal"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={!file} loading={busy} onClick={() => void save()}>
            Subir
          </Button>
        </>
      }
    >
      <PhotoInput file={file} onFile={setFile} currentUrl={thumb} />
      {error !== undefined && (
        <div className="mt-3">
          <ErrorBox error={error} />
        </div>
      )}
    </Modal>
  );
}

function AddEventModal({ detail, onClose, onSaved }: { detail: Detail; onClose: () => void; onSaved: () => void }) {
  const s = useSession();
  const a = detail.animal;
  const allowed = useAsync(() => s.api.animals.allowedTypes(a.id), [a.id]);
  const [typeId, setTypeId] = useState<EventTypeCode | ''>('');
  const [draft, setDraft] = useState<EventDraft>(() => {
    const d = emptyDraft();
    d.centerId = a.centerId ?? '';
    return d;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();

  const types = (allowed.data?.typeIds ?? []).filter((t) => canAddEventType(s.me.profiles, t));
  const effectiveType = typeId || types[0] || '';
  const subtypes = (allowed.data?.subtypes ?? []).filter((x) => x.typeId === effectiveType);
  const subtype = subtypes.find((x) => x.id === draft.subtypeId);

  const save = async () => {
    const errs = draftErrors(draft, subtype);
    setErrors(errs);
    if (Object.keys(errs).length || !subtype) return;
    setBusy(true);
    setError(undefined);
    try {
      const body = draftToInput(draft, subtype);
      if (draft.file && wantsDocument(subtype)) {
        const type = draft.file.type || 'application/pdf';
        const target = await s.api.animals.eventUploadUrl(a.id, draft.file.name, type);
        await uploadToSignedUrl(target, draft.file, type);
        body.document = { key: target.key, originalName: draft.file.name };
      }
      await s.api.animals.addEvent(a.id, body);
      onSaved();
    } catch (e) {
      setError(new Error(errorMessage(e)));
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={`Añadir evento a ${a.name}`}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} disabled={!subtype} onClick={() => void save()}>
            Guardar evento
          </Button>
        </>
      }
    >
      {allowed.loading ? (
        <Loading />
      ) : allowed.error ? (
        <ErrorBox error={allowed.error} onRetry={allowed.reload} />
      ) : types.length === 0 ? (
        <Empty title="No se pueden añadir eventos" icon="🔒">
          En el estado actual ({s.name('statuses', a.statusId)}) no se permite ningún evento{allowed.data?.typeIds.length ? ' con tu perfil' : ''}.
        </Empty>
      ) : (
        <div className="space-y-4">
          <Segmented
            value={effectiveType}
            onChange={(t) => {
              setTypeId(t);
              setDraft((d) => ({ ...d, subtypeId: '' }));
            }}
            options={types.map((t) => ({ value: t, label: EVENT_TYPE_NAMES[t] }))}
          />
          <Select label="Subtipo" value={draft.subtypeId} onChange={(e) => setDraft((d) => ({ ...d, subtypeId: e.target.value }))} placeholder="Elige…" options={options(subtypes)} error={errors.subtypeId} />
          {subtype && (
            <>
              {subtype.typeId !== 'veterinario' && subtype.resultStatusId && <p className="text-sm text-stone-500">El animal pasará a «{s.name('statuses', subtype.resultStatusId)}».</p>}
              <EventFields draft={draft} setDraft={setDraft} subtype={subtype} errors={errors} />
            </>
          )}
          {error !== undefined && <ErrorBox error={error} />}
        </div>
      )}
    </Modal>
  );
}
