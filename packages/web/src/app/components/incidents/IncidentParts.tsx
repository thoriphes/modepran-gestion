/** Piezas de incidencias: etiquetas, tarjeta, dictado por voz y formularios de acción. */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AgendaName, Incident, IncidentPriority, IncidentStatus } from '@modepran/domain';
import { todayMadrid } from '@modepran/domain';
import { fmtDateTime } from '../../../lib/format';
import { options, useAction, useSession } from '../../context';
import { Badge, Button, Checkbox, cx, ErrorBox, Select, TextArea, TextInput } from '../../ui';
import { SPECIES_LABELS } from '../agenda/AgendaParts';
import { SlotPicker } from '../agenda/SlotPicker';

export type IncidentView = Incident & { animalLabel?: string; hasOpenReferral?: boolean };

export const PRIORITY_LABELS: Record<IncidentPriority, string> = { normal: 'Normal', importante: 'Importante', urgente: 'Urgente' };
export const PRIORITY_TONES: Record<IncidentPriority, 'neutral' | 'amber' | 'red'> = { normal: 'neutral', importante: 'amber', urgente: 'red' };
export const PRIORITY_RANK: Record<IncidentPriority, number> = { urgente: 0, importante: 1, normal: 2 };
export const STATUS_LABELS: Record<IncidentStatus, string> = { pendiente: 'Pendiente', en_proceso: 'En proceso', resuelta: 'Resuelta' };
export const STATUS_TONES: Record<IncidentStatus, 'amber' | 'blue' | 'green'> = { pendiente: 'amber', en_proceso: 'blue', resuelta: 'green' };

/** Urgentes primero; dentro de cada prioridad, las más antiguas primero (las abiertas) o las más recientes (resueltas). */
export function sortIncidents(list: readonly Incident[]): Incident[] {
  return [...list].sort((a, b) => {
    if (a.status === 'resuelta' && b.status === 'resuelta') return b.createdAt.localeCompare(a.createdAt);
    return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.createdAt.localeCompare(b.createdAt);
  });
}

export function incidentAnimal(i: IncidentView): string {
  if (i.animalId !== undefined) return i.animalLabel ?? i.animalName ?? `Ficha nº ${i.animalId}`;
  return i.animalName || 'Animal sin identificar';
}

export function IncidentCard({ incident: i }: { incident: IncidentView }) {
  const { name } = useSession();
  return (
    <Link
      to={`/incidencias/${encodeURIComponent(i.id)}`}
      className={cx(
        'block rounded-xl border bg-white p-3 shadow-xs hover:border-accent-300 dark:bg-stone-900',
        i.priority === 'urgente' && i.status !== 'resuelta' ? 'border-red-300 dark:border-red-900' : 'border-stone-200 dark:border-stone-800',
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={PRIORITY_TONES[i.priority]}>{i.priority === 'urgente' ? '⚠ ' : ''}{PRIORITY_LABELS[i.priority]}</Badge>
        <Badge tone={STATUS_TONES[i.status]}>{STATUS_LABELS[i.status]}</Badge>
        {i.photos.length > 0 && <span className="text-xs text-stone-500">📷 {i.photos.length}</span>}
        <span className="ml-auto text-xs text-stone-500">{fmtDateTime(i.createdAt)}</span>
      </div>
      <p className="mt-1.5 font-medium">
        {incidentAnimal(i)} <span className="font-normal text-stone-500">· {SPECIES_LABELS[i.species]} · {i.areaName}</span>
      </p>
      <p className="mt-0.5 line-clamp-2 text-sm text-stone-700 dark:text-stone-300">{i.text}</p>
      {i.reporterStaffId && <p className="mt-1 text-xs text-stone-500">Comunica: {name('staff', i.reporterStaffId)}</p>}
      {i.resolution && <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">✔ {i.resolution.treatment}</p>}
    </Link>
  );
}

// ─────────────── Dictado (Web Speech API) ───────────────

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition) as (new () => SpeechRecognitionLike) | undefined;
}

/** Botón de dictado en español: solo añade el texto reconocido (no envía nada). Oculto si el navegador no lo soporta. */
export function DictationButton({ onText }: { onText: (t: string) => void }) {
  const [Ctor] = useState(getRecognitionCtor);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string>();
  const rec = useRef<SpeechRecognitionLike | null>(null);
  useEffect(() => () => rec.current?.stop(), []);
  if (!Ctor) return null;

  const toggle = () => {
    if (listening) {
      rec.current?.stop();
      return;
    }
    setError(undefined);
    const r = new Ctor();
    r.lang = 'es-ES';
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      let text = '';
      for (let k = e.resultIndex; k < e.results.length; k++) {
        const res = e.results[k];
        if (res?.isFinal) text += res[0].transcript;
      }
      if (text.trim()) onText(text.trim());
    };
    r.onerror = (e) => setError(e.error === 'not-allowed' ? 'Permite el micrófono para dictar.' : 'No se pudo dictar.');
    r.onend = () => setListening(false);
    rec.current = r;
    r.start();
    setListening(true);
  };

  return (
    <span className="inline-flex items-center gap-2">
      <Button size="sm" variant={listening ? 'danger' : 'secondary'} onClick={toggle} aria-pressed={listening}>
        {listening ? '⏹ Parar dictado' : '🎤 Dictar'}
      </Button>
      {listening && <span className="animate-pulse text-xs text-red-600">Escuchando…</span>}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}

// ─────────────── Formularios de acción ───────────────

export function AppointmentForm({ incident, onDone }: { incident: Incident; onDone: () => void }) {
  const { api, catalogs, me } = useSession();
  const [agenda, setAgenda] = useState<AgendaName>('carlet');
  const [date, setDate] = useState(todayMadrid());
  const [time, setTime] = useState<string>();
  const [typeId, setTypeId] = useState('');
  const [notes, setNotes] = useState('');
  const act = useAction(async () => {
    if (!time) throw new Error('Elige una franja en el calendario.');
    if (!typeId) throw new Error('Elige el tipo de cita.');
    await api.incidents.appointment(incident.id, { agenda, date, time, appointmentTypeId: typeId, ...(notes.trim() ? { notes: notes.trim() } : {}) });
    onDone();
  });
  const agendas: { value: AgendaName; label: string }[] = [{ value: 'carlet', label: 'Carlet' }];
  if (me.profiles.includes('admin') || me.profiles.includes('modevet')) agendas.push({ value: 'modevet', label: 'Modevet' });
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Select label="Agenda" value={agenda} onChange={(e) => setAgenda(e.target.value as AgendaName)} options={agendas} />
        <TextInput label="Fecha" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Select label="Tipo de cita" value={typeId} onChange={(e) => setTypeId(e.target.value)} placeholder="Elige…" options={options(catalogs.appointmentTypes)} />
      </div>
      <SlotPicker agenda={agenda} date={date} value={time} onChange={setTime} allowNone={false} />
      <TextArea label="Notas" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      {act.error !== undefined && <ErrorBox error={act.error} />}
      <Button variant="primary" loading={act.busy} onClick={() => void act.run()}>
        Crear cita
      </Button>
      <p className="text-xs text-stone-500">Dar cita no resuelve la incidencia. Para Modevet, usa mejor "Derivar a Modevet".</p>
    </div>
  );
}

export function ReferralForm({ incident, onDone }: { incident: Incident; onDone: () => void }) {
  const { api, catalogs } = useSession();
  const [date, setDate] = useState(todayMadrid());
  const [time, setTime] = useState<string>();
  const [typeId, setTypeId] = useState('');
  const [notes, setNotes] = useState('');
  const act = useAction(async () => {
    if (!typeId) throw new Error('Elige el tipo de cita.');
    await api.incidents.referral(incident.id, { date, ...(time ? { time } : {}), appointmentTypeId: typeId, ...(notes.trim() ? { notes: notes.trim() } : {}) });
    onDone();
  });
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput label="Fecha prevista" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Select label="Tipo de cita" value={typeId} onChange={(e) => setTypeId(e.target.value)} placeholder="Elige…" options={options(catalogs.appointmentTypes)} />
      </div>
      <SlotPicker agenda="modevet" date={date} value={time} onChange={setTime} label="Hora (opcional)" />
      <TextArea label="Notas para Modevet" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      {act.error !== undefined && <ErrorBox error={act.error} />}
      <Button variant="primary" loading={act.busy} onClick={() => void act.run()}>
        Derivar a Modevet
      </Button>
    </div>
  );
}

export function ResolveForm({ incident, onDone }: { incident: Incident; onDone: () => void }) {
  const { api, catalogs, me } = useSession();
  const [byStaffId, setByStaffId] = useState(me.staffId ?? '');
  const [treatment, setTreatment] = useState('');
  const [register, setRegister] = useState(incident.animalId !== undefined);
  const act = useAction(async () => {
    if (!byStaffId) throw new Error('Indica el responsable.');
    if (!treatment.trim()) throw new Error('Describe el tratamiento o la solución.');
    await api.incidents.resolve(incident.id, { byStaffId, treatment: treatment.trim(), ...(incident.animalId !== undefined ? { registerHistory: register } : {}) });
    onDone();
  });
  return (
    <div className="space-y-3">
      <Select label="Responsable" value={byStaffId} onChange={(e) => setByStaffId(e.target.value)} placeholder="Elige…" options={options(catalogs.staff, byStaffId)} />
      <TextArea label="Tratamiento / solución" value={treatment} onChange={(e) => setTreatment(e.target.value)} rows={3} />
      {incident.animalId !== undefined && (
        <Checkbox label="Registrar en el historial del animal (evento Veterinario)" checked={register} onChange={(e) => setRegister(e.target.checked)} />
      )}
      {act.error !== undefined && <ErrorBox error={act.error} />}
      <Button variant="primary" loading={act.busy} onClick={() => void act.run()}>
        Resolver incidencia
      </Button>
      <p className="text-xs text-stone-500">Al resolver se cierran también sus citas y derivaciones abiertas.</p>
    </div>
  );
}
