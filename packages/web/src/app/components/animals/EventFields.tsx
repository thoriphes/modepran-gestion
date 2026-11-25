/**
 * Formulario dinámico de un evento según los flags del subtipo (alta y "añadir evento" de la ficha).
 * Campos: trabajador (user), contacto (contact), centro (center), notas (notes), vacuna, enfermedad, colonia,
 * fecha (date), adjunto (docUpload / cualquier veterinario), sí/no (switch). Las llegadas piden además
 * recogida (fecha, CP, ciudad, dirección), salvo las devoluciones que copian la llegada original.
 */
import { useEffect, useState } from 'react';
import { RETURN_SUBTYPE_CODES, todayMadrid, type ContactData, type Subtype } from '@modepran/domain';
import type { ContactChoice, EventInput } from '../../../lib/api';
import type { Contact } from '@modepran/domain';
import { options, useSession } from '../../context';
import { Button, Checkbox, Segmented, Select, Spinner, TextArea, TextInput } from '../../ui';

export const MAX_DOC_BYTES = 15 * 1024 * 1024;

export interface EventDraft {
  subtypeId: string;
  date: string;
  collectionDate: string;
  userId: string;
  contactMode: 'existing' | 'new' | 'sin_datos';
  contact?: Contact;
  newContact: ContactData;
  centerId: string;
  vaccineId: string;
  illnessId: string;
  colonyId: string;
  cityName: string;
  address: string;
  zip: string;
  notes: string;
  switchValue: boolean;
  file?: File;
}

export function emptyDraft(subtypeId = ''): EventDraft {
  const today = todayMadrid();
  return {
    subtypeId,
    date: today,
    collectionDate: today,
    userId: '',
    contactMode: 'existing',
    newContact: { name: '' },
    centerId: '',
    vaccineId: '',
    illnessId: '',
    colonyId: '',
    cityName: '',
    address: '',
    zip: '',
    notes: '',
    switchValue: false,
  };
}

export const isReturnSubtype = (s: Subtype | undefined) => !!s && RETURN_SUBTYPE_CODES.includes(s.code);
export const wantsDocument = (s: Subtype | undefined) => !!s && (s.docUpload || s.typeId === 'veterinario');

/** Errores de cliente (la API valida igualmente). */
export function draftErrors(d: EventDraft, s: Subtype | undefined): Record<string, string> {
  const e: Record<string, string> = {};
  if (!s) {
    e.subtypeId = 'Elige el subtipo.';
    return e;
  }
  if (s.user && !d.userId) e.userId = 'Indica el trabajador.';
  if (s.contact) {
    if (d.contactMode === 'existing' && !d.contact) e.contact = 'Busca y elige un contacto, o crea uno nuevo.';
    if (d.contactMode === 'new' && !d.newContact.name.trim()) e.contact = 'El nombre del contacto es obligatorio.';
  }
  if (s.center && !d.centerId) e.centerId = 'Indica el centro.';
  if (s.vaccine && !d.vaccineId) e.vaccineId = 'Indica la vacuna.';
  if (s.illness && !d.illnessId) e.illnessId = 'Indica la enfermedad.';
  if (s.colony && !d.colonyId) e.colonyId = 'Indica la colonia.';
  if (s.date && !d.date) e.date = 'Indica la fecha.';
  if (s.docUpload && !d.file) e.file = 'Adjunta el documento.';
  if (d.file && d.file.size > MAX_DOC_BYTES) e.file = 'El fichero supera 15 MB.';
  if (s.typeId === 'llegada') {
    if (!d.collectionDate) e.collectionDate = 'Indica la fecha de recogida.';
    if (!isReturnSubtype(s)) {
      if (!d.cityName.trim()) e.cityName = 'Indica la ciudad de recogida.';
      if (!d.address.trim()) e.address = 'Indica la dirección de recogida.';
      if (!/^[0-9A-Za-z]{5,8}$/.test(d.zip.trim())) e.zip = 'Código postal no válido.';
    }
  }
  return e;
}

/** Convierte el borrador en el cuerpo de la API (sin el adjunto, que se sube aparte). */
export function draftToInput(d: EventDraft, s: Subtype): EventInput {
  const out: EventInput = { subtypeId: s.id };
  if (s.date && d.date) out.date = d.date;
  if (s.user && d.userId) out.userId = d.userId;
  if (s.contact) {
    let c: ContactChoice;
    if (d.contactMode === 'existing' && d.contact) c = { mode: 'existing', contactId: d.contact.id };
    else if (d.contactMode === 'new') c = { mode: 'new', data: trimContact(d.newContact) };
    else c = { mode: 'sin_datos' };
    out.contact = c;
  }
  if (s.center && d.centerId) out.centerId = d.centerId;
  if (s.vaccine && d.vaccineId) out.vaccineId = d.vaccineId;
  if (s.illness && d.illnessId) out.illnessId = d.illnessId;
  if (s.colony && d.colonyId) out.colonyId = d.colonyId;
  if (s.notes && d.notes.trim()) out.notes = d.notes.trim();
  if (s.switch) out.switchValue = d.switchValue;
  if (s.typeId === 'llegada') {
    out.collectionDate = d.collectionDate;
    if (!isReturnSubtype(s)) {
      out.cityName = d.cityName.trim();
      out.address = d.address.trim();
      out.zip = d.zip.trim();
    }
  }
  return out;
}

function trimContact(c: ContactData): ContactData {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(c)) if (typeof v === 'string' && v.trim()) out[k] = v.trim();
  return out as unknown as ContactData;
}

export function EventFields({ draft, setDraft, subtype, errors, allowDocument = true }: { draft: EventDraft; setDraft: (f: (d: EventDraft) => EventDraft) => void; subtype: Subtype | undefined; errors: Record<string, string>; allowDocument?: boolean }) {
  const { catalogs: c } = useSession();
  if (!subtype) return null;
  const set = <K extends keyof EventDraft>(k: K, v: EventDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const workers = c.workers ?? c.staff;
  const arrival = subtype.typeId === 'llegada';
  const ret = isReturnSubtype(subtype);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {arrival && <TextInput label="Fecha de recogida" type="date" required value={draft.collectionDate} onChange={(e) => set('collectionDate', e.target.value)} error={errors.collectionDate} />}
        {subtype.date && !arrival && <TextInput label="Fecha" type="date" required value={draft.date} onChange={(e) => set('date', e.target.value)} error={errors.date} />}
        {!subtype.date && !arrival && <p className="self-end text-sm text-stone-500">Fecha: hoy</p>}
        {subtype.user && (
          <Select label={arrival ? 'Recogido por' : 'Trabajador'} value={draft.userId} onChange={(e) => set('userId', e.target.value)} placeholder="Elige…" options={options(workers)} error={errors.userId} />
        )}
        {subtype.center && <Select label="Centro" value={draft.centerId} onChange={(e) => set('centerId', e.target.value)} placeholder="Elige…" options={options(c.centers)} error={errors.centerId} />}
        {subtype.vaccine && <Select label="Vacuna" value={draft.vaccineId} onChange={(e) => set('vaccineId', e.target.value)} placeholder="Elige…" options={options(c.vaccines)} error={errors.vaccineId} />}
        {subtype.illness && <Select label="Enfermedad" value={draft.illnessId} onChange={(e) => set('illnessId', e.target.value)} placeholder="Elige…" options={options(c.illnesses)} error={errors.illnessId} />}
        {subtype.colony && <Select label="Colonia" value={draft.colonyId} onChange={(e) => set('colonyId', e.target.value)} placeholder="Elige…" options={options(c.colonies)} error={errors.colonyId} />}
        {subtype.switch && (
          <div className="self-end pb-2">
            <Checkbox label={subtype.switchLabel ?? 'Sí / no'} checked={draft.switchValue} onChange={(e) => set('switchValue', e.target.checked)} />
          </div>
        )}
      </div>

      {arrival && !ret && (
        <div className="grid gap-3 sm:grid-cols-[8rem_1fr_2fr]">
          <TextInput label="CP" inputMode="numeric" value={draft.zip} onChange={(e) => set('zip', e.target.value)} error={errors.zip} />
          <div>
            <TextInput label="Ciudad" list="cities-datalist" value={draft.cityName} onChange={(e) => set('cityName', e.target.value)} error={errors.cityName} hint="Si no existe, se crea." />
            <datalist id="cities-datalist">
              {c.cities.filter((x) => x.active !== false).map((x) => (
                <option key={x.id} value={x.name} />
              ))}
            </datalist>
          </div>
          <TextInput label="Dirección de recogida" value={draft.address} onChange={(e) => set('address', e.target.value)} error={errors.address} />
        </div>
      )}
      {arrival && ret && <p className="text-sm text-stone-500">Devolución: se copian la ciudad, la dirección y el CP de la llegada original.</p>}

      {subtype.contact && <ContactChooser draft={draft} setDraft={setDraft} error={errors.contact} />}

      {subtype.notes && <TextArea label="Notas" value={draft.notes} onChange={(e) => set('notes', e.target.value)} />}

      {allowDocument && wantsDocument(subtype) && (
        <div>
          <label className="label" htmlFor="event-doc">
            Documento PDF {subtype.docUpload ? '(obligatorio)' : '(opcional)'}
          </label>
          <input id="event-doc" type="file" accept="application/pdf,image/*" className="block text-sm" onChange={(e) => set('file', e.target.files?.[0])} />
          <p className={errors.file ? 'mt-1 text-xs text-red-600' : 'mt-1 text-xs text-stone-500'}>{errors.file ?? 'Máximo 15 MB.'}</p>
        </div>
      )}
    </div>
  );
}

function ContactChooser({ draft, setDraft, error }: { draft: EventDraft; setDraft: (f: (d: EventDraft) => EventDraft) => void; error?: string | undefined }) {
  const { api, catalogs } = useSession();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (draft.contactMode !== 'existing' || q.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      api.contacts
        .search(q.trim(), 1, 10)
        .then((p) => setResults(p.items))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q, draft.contactMode, api]);

  const nc = draft.newContact;
  const setNc = (k: keyof ContactData, v: string) => setDraft((d) => ({ ...d, newContact: { ...d.newContact, [k]: v } }));

  return (
    <fieldset className="rounded-lg border border-stone-200 p-3 dark:border-stone-700">
      <legend className="px-1 text-sm font-medium">Contacto</legend>
      <Segmented
        value={draft.contactMode}
        onChange={(v) => setDraft((d) => ({ ...d, contactMode: v }))}
        options={[
          { value: 'existing', label: 'Existente' },
          { value: 'new', label: 'Nuevo' },
          { value: 'sin_datos', label: 'SIN DATOS' },
        ]}
      />
      <div className="mt-3">
        {draft.contactMode === 'existing' &&
          (draft.contact ? (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-stone-100 px-3 py-2 text-sm dark:bg-stone-800">
              <span>
                <strong>
                  {draft.contact.name} {draft.contact.surname}
                </strong>{' '}
                {draft.contact.nif && <span className="text-stone-500">· {draft.contact.nif}</span>}
              </span>
              <Button size="sm" variant="ghost" onClick={() => setDraft((d) => ({ ...d, contact: undefined }))}>
                Cambiar
              </Button>
            </div>
          ) : (
            <div>
              <div className="relative">
                <TextInput label="Buscar por nombre, apellidos, NIF o teléfono" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
                {loading && <Spinner className="absolute right-2 bottom-2.5 size-4 text-stone-400" />}
              </div>
              {results.length > 0 && (
                <ul className="mt-1 max-h-52 overflow-y-auto rounded-lg border border-stone-200 dark:border-stone-700">
                  {results.map((r) => (
                    <li key={r.id}>
                      <button type="button" className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent-50 dark:hover:bg-stone-800" onClick={() => setDraft((d) => ({ ...d, contact: r }))}>
                        {r.name} {r.surname} <span className="text-stone-500">{[r.nif, r.phone].filter(Boolean).join(' · ')}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {q.trim().length >= 2 && !loading && results.length === 0 && <p className="mt-1 text-xs text-stone-500">Sin resultados. Puedes crearlo como nuevo.</p>}
            </div>
          ))}
        {draft.contactMode === 'new' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput label="Nombre" required value={nc.name} onChange={(e) => setNc('name', e.target.value)} />
            <TextInput label="Apellidos" value={nc.surname ?? ''} onChange={(e) => setNc('surname', e.target.value)} />
            <TextInput label="NIF / DNI" value={nc.nif ?? ''} onChange={(e) => setNc('nif', e.target.value)} hint="Si ya existe un contacto con este NIF, se actualiza." />
            <TextInput label="Teléfono" type="tel" value={nc.phone ?? ''} onChange={(e) => setNc('phone', e.target.value)} />
            <TextInput label="Email" type="email" value={nc.email ?? ''} onChange={(e) => setNc('email', e.target.value)} />
            <TextInput label="Dirección" value={nc.address ?? ''} onChange={(e) => setNc('address', e.target.value)} />
            <TextInput label="CP" value={nc.zip ?? ''} onChange={(e) => setNc('zip', e.target.value)} />
            <TextInput label="Ciudad" list="contact-cities" value={nc.cityName ?? ''} onChange={(e) => setNc('cityName', e.target.value)} />
            <datalist id="contact-cities">
              {catalogs.cities.map((x) => (
                <option key={x.id} value={x.name} />
              ))}
            </datalist>
            <TextInput label="Provincia" value={nc.province ?? ''} onChange={(e) => setNc('province', e.target.value)} />
          </div>
        )}
        {draft.contactMode === 'sin_datos' && <p className="text-sm text-stone-500">Se usa el contacto especial «SIN DATOS» (avisante desconocido).</p>}
      </div>
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </fieldset>
  );
}
