/** Piezas de la agenda: tarjeta, alta (cita/aviso/nota), detalle con estados, reagendar y registrar en historial. */
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { AgendaItem, AgendaKind, AgendaName, AgendaSpecies, AgendaStatus, AppointmentAction, IsoDate } from '@modepran/domain';
import {
  AGENDA_SPECIES,
  AGENDA_STATUS_LABELS,
  RESCHEDULABLE_STATUSES,
  catalogIndex,
  isClosedAgendaItem,
  speciesGroup,
  statusesFor,
  todayMadrid,
} from '@modepran/domain';
import type { NewAgendaBody } from '../../../lib/api';
import { fmtDate, fmtDateTime, weekdayName } from '../../../lib/format';
import { options, useAction, useSession } from '../../context';
import { Badge, Button, Checkbox, cx, ErrorBox, Modal, Notice, Segmented, Select, TextArea, TextInput } from '../../ui';
import { AnimalPicker, type PickedAnimal } from '../AnimalPicker';
import { SlotPicker } from './SlotPicker';

/** La API puede añadir el nombre del animal con ficha. */
export type AgendaItemView = AgendaItem & { animalName?: string };

export const KIND_LABELS: Record<AgendaKind, string> = { cita: 'Cita', aviso: 'Aviso', nota: 'Nota' };
const KIND_ICONS: Record<AgendaKind, string> = { cita: '🩺', aviso: '🔔', nota: '🗒️' };
export const SPECIES_LABELS: Record<AgendaSpecies, string> = { CAN: 'Perro (CAN)', FEL: 'Gato (FEL)', otra: 'Otra' };

export function statusTone(s: AgendaStatus): 'neutral' | 'green' | 'red' | 'amber' | 'blue' {
  if (s === 'pendiente') return 'amber';
  if (s === 'concluida' || s === 'concluido') return 'green';
  if (s === 'cancelada' || s === 'no_presentado') return 'red';
  return 'blue';
}

export function itemTitle(i: AgendaItemView): string {
  if (i.kind !== 'cita') return i.text || KIND_LABELS[i.kind];
  if (i.animalId !== undefined) return i.animalName ?? `Ficha nº ${i.animalId}`;
  return i.externalAnimal?.name || 'Animal sin nombre';
}

export function actionText(a: AppointmentAction, cats: ReturnType<typeof useSession>['catalogs']['actionCategories']): string {
  const c = cats.find((x) => x.id === a.categoryId);
  const s = c?.subcategories.find((x) => x.id === a.subcategoryId);
  if (c) return s ? `${c.name} › ${s.name}` : c.name;
  return a.text ?? '—';
}

// ─────────────── Tarjeta ───────────────

export function AgendaCard({ item, onOpen, showDate }: { item: AgendaItemView; onOpen: () => void; showDate?: boolean }) {
  const color = item.appointmentType?.color;
  const closed = isClosedAgendaItem(item);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cx(
        'flex w-full items-stretch gap-0 overflow-hidden rounded-lg border border-stone-200 bg-white text-left shadow-xs hover:border-accent-300 dark:border-stone-800 dark:bg-stone-900',
        closed && 'opacity-70',
      )}
    >
      <span aria-hidden="true" className="w-1.5 shrink-0" style={{ backgroundColor: color ?? (item.kind === 'aviso' ? '#d97706' : '#a8a29e') }} />
      <span className="min-w-0 flex-1 px-3 py-2">
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-stone-500">
          <span className="font-semibold text-stone-700 tabular-nums dark:text-stone-200">
            {showDate ? `${fmtDate(item.date)} ` : ''}
            {item.time ?? 'Sin hora'}
          </span>
          <span aria-hidden="true">{KIND_ICONS[item.kind]}</span>
          <span>{item.kind === 'cita' ? (item.appointmentType?.name ?? 'Cita') : KIND_LABELS[item.kind]}</span>
          {item.agenda === 'ambas' && <Badge>Ambas</Badge>}
          {item.isReferral && <Badge tone="blue">↪ Derivación</Badge>}
          {item.incidentId && !item.isReferral && <Badge tone="accent">🚩 Incidencia</Badge>}
        </span>
        <span className={cx('mt-0.5 block truncate font-medium', closed && 'line-through decoration-stone-400')}>{itemTitle(item)}</span>
        {item.kind === 'cita' && item.text && <span className="block truncate text-xs text-stone-500">{item.text}</span>}
      </span>
      <span className="flex items-center pr-2">
        <Badge tone={statusTone(item.status)}>{AGENDA_STATUS_LABELS[item.status]}</Badge>
      </span>
    </button>
  );
}

// ─────────────── Actuaciones ───────────────

const OTHER = '__otro';

function ActionsEditor({ value, onChange }: { value: AppointmentAction[]; onChange: (v: AppointmentAction[]) => void }) {
  const { catalogs } = useSession();
  const cats = catalogs.actionCategories.filter((c) => c.active);
  const set = (i: number, a: AppointmentAction) => onChange(value.map((x, j) => (j === i ? a : x)));
  return (
    <fieldset className="space-y-2">
      <legend className="label">Actuaciones</legend>
      {value.map((a, i) => {
        const cat = cats.find((c) => c.id === a.categoryId);
        const isOther = !a.categoryId;
        return (
          <div key={i} className="flex flex-wrap items-end gap-2 rounded-lg border border-stone-200 p-2 dark:border-stone-800">
            <Select
              className="min-w-40 flex-1"
              aria-label="Categoría"
              value={isOther ? OTHER : (a.categoryId ?? '')}
              onChange={(e) => {
                const v = e.target.value;
                if (v === OTHER) set(i, { text: '' });
                else set(i, { categoryId: v, text: cats.find((c) => c.id === v)?.name ?? '' });
              }}
              options={[...cats.map((c) => ({ value: c.id, label: c.name })), { value: OTHER, label: 'Otro (texto libre)' }]}
            />
            {cat && cat.subcategories.some((s) => s.active) && (
              <Select
                className="min-w-40 flex-1"
                aria-label="Subcategoría"
                value={a.subcategoryId ?? ''}
                placeholder="(sin detallar)"
                onChange={(e) => {
                  const sub = cat.subcategories.find((s) => s.id === e.target.value);
                  set(i, sub ? { categoryId: cat.id, subcategoryId: sub.id, text: `${cat.name} › ${sub.name}` } : { categoryId: cat.id, text: cat.name });
                }}
                options={options(cat.subcategories)}
              />
            )}
            {isOther && (
              <TextInput className="min-w-40 flex-1" aria-label="Actuación" placeholder="Describe la actuación" value={a.text ?? ''} onChange={(e) => set(i, { text: e.target.value })} />
            )}
            <Button size="sm" variant="ghost" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Quitar actuación">
              ✕
            </Button>
          </div>
        );
      })}
      <Button size="sm" onClick={() => onChange([...value, cats[0] ? { categoryId: cats[0].id, text: cats[0].name } : { text: '' }])}>
        + Añadir actuación
      </Button>
    </fieldset>
  );
}

// ─────────────── Alta ───────────────

function speciesFromAnimal(speciesId: string, s: ReturnType<typeof useSession>): AgendaSpecies {
  const g = speciesGroup(catalogIndex({ statuses: [], subtypes: [], species: s.catalogs.species }).species(speciesId));
  return g === 'perro' ? 'CAN' : g === 'gato' ? 'FEL' : 'otra';
}

export function NewAgendaItemModal({
  open,
  onClose,
  agenda,
  defaultDate,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  agenda: AgendaName;
  defaultDate: IsoDate;
  onCreated: (i: AgendaItem) => void;
}) {
  const s = useSession();
  const { api, catalogs } = s;
  const [kind, setKind] = useState<AgendaKind>('cita');
  const [target, setTarget] = useState<AgendaName | 'ambas'>(agenda);
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState<string | undefined>(undefined);
  const [text, setText] = useState('');
  const [typeId, setTypeId] = useState('');
  const [requestedById, setRequestedById] = useState('');
  const [withFicha, setWithFicha] = useState(true);
  const [animal, setAnimal] = useState<PickedAnimal | undefined>();
  const [extName, setExtName] = useState('');
  const [species, setSpecies] = useState<AgendaSpecies>('CAN');
  const [owner, setOwner] = useState({ name: '', phone: '', email: '' });
  const [actions, setActions] = useState<AppointmentAction[]>([]);
  const [formError, setFormError] = useState<string>();

  const requesters = catalogs.staff.filter((x) => x.active && x.roles.some((r) => r === 'veterinaria' || r === 'auxiliar'));
  const types = catalogs.appointmentTypes.filter((t) => t.active);

  const create = useAction(async () => {
    setFormError(undefined);
    let body: NewAgendaBody;
    if (kind === 'cita') {
      if (!typeId) return setFormError('Elige el tipo de cita.');
      if (!requestedById) return setFormError('Indica quién la solicita.');
      if (withFicha && !animal) return setFormError('Busca el animal o marca "animal externo".');
      if (!withFicha && !extName.trim()) return setFormError('Escribe el nombre del animal.');
      const cleanActions = actions.filter((a) => a.categoryId || a.text?.trim());
      body = {
        kind,
        agenda,
        date,
        ...(time ? { time } : {}),
        text: text.trim(),
        appointmentTypeId: typeId,
        requestedById,
        species,
        actions: cleanActions,
        ...(withFicha && animal ? { animalId: animal.id } : { externalAnimal: { name: extName.trim(), species } }),
        ...(!withFicha && owner.name.trim()
          ? { owner: { name: owner.name.trim(), ...(owner.phone.trim() ? { phone: owner.phone.trim() } : {}), ...(owner.email.trim() ? { email: owner.email.trim() } : {}) } }
          : {}),
      };
    } else {
      if (!text.trim()) return setFormError('Escribe el texto.');
      body = { kind, agenda: target, date, ...(time ? { time } : {}), text: text.trim() };
    }
    const created = await api.agenda.create(body);
    onCreated(created);
    onClose();
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={`Nuevo en la agenda de ${agenda === 'carlet' ? 'Carlet' : 'Modevet'}`}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={create.busy} onClick={() => void create.run()}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: 'cita', label: '🩺 Cita' },
            { value: 'aviso', label: '🔔 Aviso' },
            { value: 'nota', label: '🗒️ Nota' },
          ]}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput label="Fecha" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          {kind !== 'cita' && (
            <Select
              label="Agenda"
              value={target}
              onChange={(e) => setTarget(e.target.value as AgendaName | 'ambas')}
              options={[
                { value: agenda, label: agenda === 'carlet' ? 'Carlet' : 'Modevet' },
                { value: 'ambas', label: 'Ambas agendas' },
              ]}
            />
          )}
        </div>

        {kind === 'cita' && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field2 label="Tipo de cita">
                <div className="flex flex-wrap gap-1.5">
                  {types.length === 0 && <span className="text-sm text-stone-500">No hay tipos de cita: créalos en Catálogos.</span>}
                  {types.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={typeId === t.id}
                      onClick={() => setTypeId(t.id)}
                      className={cx('rounded-full border px-3 py-1 text-sm', typeId === t.id ? 'font-semibold text-white' : 'bg-white dark:bg-stone-900')}
                      style={typeId === t.id ? { backgroundColor: t.color, borderColor: t.color } : { borderColor: t.color, color: t.color }}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </Field2>
              <Select label="Solicitada por" value={requestedById} onChange={(e) => setRequestedById(e.target.value)} placeholder="Elige…" options={options(requesters)} />
            </div>

            <div className="space-y-2">
              <Segmented
                value={withFicha ? 'ficha' : 'ext'}
                onChange={(v) => setWithFicha(v === 'ficha')}
                options={[
                  { value: 'ficha', label: 'Animal con ficha' },
                  { value: 'ext', label: 'Animal externo' },
                ]}
              />
              {withFicha ? (
                <AnimalPicker
                  value={animal}
                  onChange={(a) => {
                    setAnimal(a);
                    if (a) setSpecies(speciesFromAnimal(a.speciesId, s));
                  }}
                />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextInput label="Nombre del animal" value={extName} onChange={(e) => setExtName(e.target.value)} />
                  <TextInput label="Propietario" value={owner.name} onChange={(e) => setOwner({ ...owner, name: e.target.value })} />
                  <TextInput label="Teléfono" type="tel" value={owner.phone} onChange={(e) => setOwner({ ...owner, phone: e.target.value })} />
                  <TextInput label="Email" type="email" value={owner.email} onChange={(e) => setOwner({ ...owner, email: e.target.value })} />
                </div>
              )}
              <Select
                label="Especie"
                value={species}
                onChange={(e) => setSpecies(e.target.value as AgendaSpecies)}
                options={AGENDA_SPECIES.map((x) => ({ value: x, label: SPECIES_LABELS[x] }))}
              />
            </div>

            <ActionsEditor value={actions} onChange={setActions} />
            <SlotPicker agenda={agenda} date={date} value={time} onChange={setTime} />
            <TextArea label="Notas" value={text} onChange={(e) => setText(e.target.value)} />
          </>
        )}

        {kind !== 'cita' && (
          <>
            <TextInput label="Hora (opcional)" type="time" step={300} value={time ?? ''} onChange={(e) => setTime(e.target.value || undefined)} />
            <TextArea label="Texto" required value={text} onChange={(e) => setText(e.target.value)} rows={4} />
          </>
        )}

        {formError && <Notice tone="warn">{formError}</Notice>}
        {create.error !== undefined && <ErrorBox error={create.error} />}
      </div>
    </Modal>
  );
}

function Field2({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span className="label">{label}</span>
      {children}
    </div>
  );
}

// ─────────────── Detalle ───────────────

export function AgendaDetailModal({
  item,
  agenda,
  canWrite,
  onClose,
  onChanged,
}: {
  item: AgendaItemView | undefined;
  agenda: AgendaName;
  canWrite: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const s = useSession();
  const { api, catalogs } = s;
  const [current, setCurrent] = useState<AgendaItemView | undefined>(item);
  const [prevItem, setPrevItem] = useState(item);
  if (item !== prevItem) {
    setPrevItem(item);
    setCurrent(item);
  }
  const [reDate, setReDate] = useState(todayMadrid());
  const [reTime, setReTime] = useState<string | undefined>();
  const [showReschedule, setShowReschedule] = useState(false);
  const [done, setDone] = useState<string>();

  const changeStatus = useAction(async (status: AgendaStatus) => {
    const updated = await api.agenda.update(current!.id, { status });
    setCurrent({ ...current, ...updated });
    onChanged();
  });
  const doReschedule = useAction(async () => {
    const r = await api.agenda.reschedule(current!.id, { date: reDate, ...(reTime ? { time: reTime } : {}) });
    setCurrent({ ...current, ...r.original });
    setShowReschedule(false);
    setDone(`Reagendada al ${fmtDate(r.created.date)}${r.created.time ? ` a las ${r.created.time}` : ''}.`);
    onChanged();
  });

  if (!current) return null;
  const i = current;
  const statuses = statusesFor(i.kind).filter((x) => x !== 'reagendada' && x !== i.status);
  const canReschedule = canWrite && i.kind === 'cita' && RESCHEDULABLE_STATUSES.includes(i.status) && !i.rescheduledToId;
  const canRegister = i.kind === 'cita' && agenda === 'modevet' && i.animalId !== undefined && i.status === 'concluida' && s.can('events:vet');
  const requested = i.requestedBy?.name;

  return (
    <Modal open={!!item} onClose={onClose} wide title={`${KIND_LABELS[i.kind]} · ${fmtDate(i.date)} ${i.time ?? 'sin hora'}`}>
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={statusTone(i.status)}>{AGENDA_STATUS_LABELS[i.status]}</Badge>
          {i.appointmentType && <Badge color={i.appointmentType.color}>{i.appointmentType.name}</Badge>}
          {i.isReferral && <Badge tone="blue">↪ Derivación a Modevet</Badge>}
          {i.agenda === 'ambas' && <Badge>Ambas agendas</Badge>}
          <span className="text-stone-500">{weekdayName(i.date)}</span>
        </div>

        {i.kind === 'cita' ? (
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            <Row k="Animal">
              {i.animalId !== undefined ? (
                <Link className="text-accent-700 underline dark:text-accent-300" to={`/animales/${i.animalId}`}>
                  {itemTitle(i)} (nº {i.animalId})
                </Link>
              ) : (
                `${itemTitle(i)} (externo)`
              )}
            </Row>
            <Row k="Especie">{i.species ? SPECIES_LABELS[i.species] : '—'}</Row>
            <Row k="Solicitada por">{requested ?? '—'}</Row>
            {i.owner && (
              <Row k="Propietario">
                {i.owner.name}
                {i.owner.phone ? ` · ${i.owner.phone}` : ''}
                {i.owner.email ? ` · ${i.owner.email}` : ''}
              </Row>
            )}
            {i.incidentId && (
              <Row k="Incidencia">
                <Link className="text-accent-700 underline dark:text-accent-300" to={`/incidencias/${i.incidentId}`}>
                  Ver incidencia
                </Link>
              </Row>
            )}
            <div className="sm:col-span-2">
              <dt className="text-stone-500">Actuaciones</dt>
              <dd>
                {i.actions?.length ? (
                  <ul className="mt-1 list-disc pl-5">
                    {i.actions.map((a, n) => (
                      <li key={n}>{actionText(a, catalogs.actionCategories)}</li>
                    ))}
                  </ul>
                ) : (
                  '—'
                )}
              </dd>
            </div>
          </dl>
        ) : null}
        {i.text && <p className="rounded-lg bg-stone-50 p-3 whitespace-pre-wrap dark:bg-stone-800/50">{i.text}</p>}
        {i.resolution && (
          <Notice tone="success">
            Resuelta por {s.name('staff', i.resolution.byStaffId)}: {i.resolution.treatment}
          </Notice>
        )}
        {i.rescheduledFromId && <p className="text-xs text-stone-500">Viene de una cita reagendada.</p>}
        {i.rescheduledToId && <p className="text-xs text-stone-500">Esta cita se reagendó a otra fecha.</p>}
        {done && <Notice tone="success">{done}</Notice>}

        {canWrite && statuses.length > 0 && (
          <div>
            <p className="label">Cambiar estado</p>
            <div className="flex flex-wrap gap-2">
              {statuses.map((st) => (
                <Button key={st} size="sm" variant={st === 'concluida' || st === 'concluido' ? 'primary' : 'secondary'} loading={changeStatus.busy} onClick={() => void changeStatus.run(st)}>
                  {AGENDA_STATUS_LABELS[st]}
                </Button>
              ))}
              {canReschedule && (
                <Button size="sm" onClick={() => setShowReschedule((v) => !v)}>
                  📆 Reagendar
                </Button>
              )}
            </div>
            {changeStatus.error !== undefined && <div className="mt-2"><ErrorBox error={changeStatus.error} /></div>}
          </div>
        )}

        {showReschedule && canReschedule && (
          <div className="space-y-3 rounded-lg border border-stone-200 p-3 dark:border-stone-800">
            <p className="font-medium">Reagendar (crea una cita nueva y marca esta como reagendada)</p>
            <TextInput label="Nueva fecha" type="date" value={reDate} onChange={(e) => setReDate(e.target.value)} />
            <SlotPicker agenda={agenda} date={reDate} value={reTime} onChange={setReTime} />
            {doReschedule.error !== undefined && <ErrorBox error={doReschedule.error} />}
            <Button variant="primary" loading={doReschedule.busy} onClick={() => void doReschedule.run()}>
              Confirmar reagendado
            </Button>
          </div>
        )}

        {canRegister && <RegisterHistory item={i} />}

        <div>
          <p className="label">Historial de estados</p>
          <ol className="space-y-1 text-xs text-stone-600 dark:text-stone-400">
            {(i.statusEvents ?? []).map((e, n) => (
              <li key={n}>
                {fmtDateTime(e.at)} · <strong>{AGENDA_STATUS_LABELS[e.status as AgendaStatus] ?? e.status}</strong> · {e.by}
              </li>
            ))}
            {!i.statusEvents?.length && <li>Sin cambios registrados.</li>}
          </ol>
          <p className="mt-1 text-xs text-stone-500">Creado {fmtDateTime(i.createdAt)} por {i.createdBy}</p>
        </div>
      </div>
    </Modal>
  );
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-stone-100 pb-1 dark:border-stone-800">
      <dt className="text-stone-500">{k}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

/** "Registrar en historial": eventos Veterinario por cada actuación con subtipo veterinario equivalente. */
function RegisterHistory({ item }: { item: AgendaItemView }) {
  const { api, catalogs, name } = useSession();
  const candidates = useMemo(() => {
    const out: { key: string; label: string; subtypeId: string }[] = [];
    for (const a of item.actions ?? []) {
      const c = catalogs.actionCategories.find((x) => x.id === a.categoryId);
      const sub = c?.subcategories.find((x) => x.id === a.subcategoryId);
      const subtypeId = sub?.vetSubtypeId ?? c?.vetSubtypeId;
      if (subtypeId) out.push({ key: `${a.categoryId}-${a.subcategoryId ?? ''}`, label: actionText(a, catalogs.actionCategories), subtypeId });
    }
    return out;
  }, [item, catalogs]);
  const [checked, setChecked] = useState<Set<string>>(() => new Set(candidates.map((c) => c.key)));
  const [notes, setNotes] = useState(item.text ?? '');
  const [result, setResult] = useState<number>();
  const reg = useAction(async () => {
    const subtypeIds = candidates.filter((c) => checked.has(c.key)).map((c) => c.subtypeId);
    const r = await api.agenda.registerHistory(item.id, { subtypeIds, ...(notes.trim() ? { notes: notes.trim() } : {}) });
    setResult(r.events?.length ?? subtypeIds.length);
  });

  return (
    <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900 dark:bg-emerald-950/20">
      <p className="font-medium">Registrar en el historial del animal</p>
      {candidates.length === 0 ? (
        <p className="text-stone-600 dark:text-stone-400">Ninguna actuación de esta cita tiene un subtipo veterinario asociado (se configura en Catálogos → Actuaciones).</p>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            {candidates.map((c) => (
              <Checkbox
                key={c.key}
                label={`${c.label} → ${name('subtypes', c.subtypeId)}`}
                checked={checked.has(c.key)}
                onChange={(e) => {
                  const n = new Set(checked);
                  if (e.target.checked) n.add(c.key);
                  else n.delete(c.key);
                  setChecked(n);
                }}
              />
            ))}
          </div>
          <TextArea label="Notas para el historial" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          {reg.error !== undefined && <ErrorBox error={reg.error} />}
          {result !== undefined ? (
            <Notice tone="success">Registrado{result === 1 ? ' 1 evento' : ` ${result} eventos`} en el historial.</Notice>
          ) : (
            <Button variant="primary" size="sm" loading={reg.busy} disabled={checked.size === 0} onClick={() => void reg.run()}>
              Registrar {checked.size} evento{checked.size === 1 ? '' : 's'} Veterinario
            </Button>
          )}
        </>
      )}
    </div>
  );
}


