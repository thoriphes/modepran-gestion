/** "¿Has observado algo?": alta de incidencia pensada para el móvil. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AgendaSpecies, Incident, IncidentPriority } from '@modepran/domain';
import { AGENDA_SPECIES, catalogIndex, INCIDENT_PRIORITIES, MAX_INCIDENT_PHOTOS, speciesGroup } from '@modepran/domain';
import { errorMessage, uploadToSignedUrl } from '../../../lib/api';
import { incidentPhoto } from '../../../lib/image';
import { RequirePerm } from '../../Layout';
import { AnimalPicker, type PickedAnimal } from '../../components/AnimalPicker';
import { SPECIES_LABELS } from '../../components/agenda/AgendaParts';
import { DictationButton, PRIORITY_LABELS } from '../../components/incidents/IncidentParts';
import { options, useAction, useSession } from '../../context';
import { Button, cx, ErrorBox, Notice, PageHeader, Segmented, Select, TextInput } from '../../ui';

interface PhotoDraft {
  blob: Blob;
  url: string;
}

const PRIORITY_STYLE: Record<IncidentPriority, string> = {
  normal: 'border-stone-300 aria-pressed:bg-stone-700 aria-pressed:text-white dark:border-stone-600',
  importante: 'border-amber-400 text-amber-800 aria-pressed:bg-amber-500 aria-pressed:text-white dark:text-amber-300',
  urgente: 'border-red-400 text-red-700 aria-pressed:bg-red-600 aria-pressed:text-white dark:text-red-300',
};

export default function IncidentNew() {
  return (
    <RequirePerm perm="incidents:create">
      <IncidentForm />
    </RequirePerm>
  );
}

function IncidentForm() {
  const s = useSession();
  const { api, catalogs } = s;
  const [withFicha, setWithFicha] = useState(true);
  const [animal, setAnimal] = useState<PickedAnimal>();
  const [animalName, setAnimalName] = useState('');
  const [species, setSpecies] = useState<AgendaSpecies>('CAN');
  const [areaId, setAreaId] = useState('');
  const [text, setText] = useState('');
  const [priority, setPriority] = useState<IncidentPriority>('normal');
  const [reporterStaffId, setReporter] = useState(s.me.staffId ?? '');
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [processing, setProcessing] = useState(false);
  const [photoError, setPhotoError] = useState<string>();
  const [created, setCreated] = useState<{ incident: Incident; failedPhotos: number }>();
  const [formError, setFormError] = useState<string>();

  // Libera las previsualizaciones al salir de la pantalla.
  const photosRef = useRef(photos);
  photosRef.current = photos;
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  const areas = useMemo(() => {
    const want = species === 'CAN' ? 'perros' : species === 'FEL' ? 'gatos' : undefined;
    return catalogs.areas.filter((a) => a.active && (!want || a.species.length === 0 || a.species.includes(want)));
  }, [catalogs.areas, species]);
  useEffect(() => {
    if (areaId && !areas.some((a) => a.id === areaId)) setAreaId('');
  }, [areas, areaId]);

  const reporters = catalogs.staff.filter((x) => x.active && x.roles.includes('cuidadora'));

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setPhotoError(undefined);
    setProcessing(true);
    try {
      const room = MAX_INCIDENT_PHOTOS - photos.length;
      const next: PhotoDraft[] = [];
      for (const f of [...files].slice(0, room)) {
        const blob = await incidentPhoto(f);
        next.push({ blob, url: URL.createObjectURL(blob) });
      }
      if (files.length > room) setPhotoError(`Máximo ${MAX_INCIDENT_PHOTOS} fotos.`);
      setPhotos((p) => [...p, ...next]);
    } catch (e) {
      setPhotoError(errorMessage(e));
    } finally {
      setProcessing(false);
    }
  };

  const submit = useAction(async () => {
    setFormError(undefined);
    if (withFicha && !animal) return setFormError('Busca el animal o elige "No sé cuál / sin ficha".');
    if (!areaId) return setFormError('Indica dónde está.');
    if (!text.trim()) return setFormError('Cuenta qué ocurre.');
    const incident = await api.incidents.create({
      ...(withFicha && animal ? { animalId: animal.id } : animalName.trim() ? { animalName: animalName.trim() } : {}),
      species,
      areaId,
      text: text.trim(),
      priority,
      ...(reporterStaffId ? { reporterStaffId } : {}),
    });
    let failed = 0;
    for (const p of photos) {
      try {
        const target = await api.incidents.photoUploadUrl(incident.id, 'image/jpeg', p.blob.size);
        await uploadToSignedUrl(target, p.blob, 'image/jpeg');
        await api.incidents.photoUploaded(incident.id, target.key, 'image/jpeg', p.blob.size);
      } catch {
        failed++;
      }
    }
    setCreated({ incident, failedPhotos: failed });
    window.scrollTo({ top: 0 });
  });

  const reset = () => {
    setAnimal(undefined);
    setAnimalName('');
    setAreaId('');
    setText('');
    setPriority('normal');
    setPhotos([]);
    setCreated(undefined);
  };

  if (created)
    return (
      <div className="mx-auto max-w-lg space-y-4 py-6 text-center">
        <p className="text-5xl" aria-hidden="true">
          ✅
        </p>
        <h1 className="font-display text-2xl font-semibold">¡Gracias! Incidencia enviada</h1>
        <p className="text-stone-600 dark:text-stone-400">El equipo de Carlet la verá en su bandeja.</p>
        {created.failedPhotos > 0 && (
          <Notice tone="warn">
            No se pudieron subir {created.failedPhotos} foto(s). La incidencia está guardada; puedes volver a intentarlo más tarde desde el móvil con mejor conexión.
          </Notice>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button variant="primary" size="lg" onClick={reset}>
            Comunicar otra
          </Button>
          <Link to="/incidencias/mias" className="inline-flex items-center justify-center rounded-lg border border-stone-300 px-5 py-3 font-medium dark:border-stone-700">
            Ver mis incidencias
          </Link>
        </div>
      </div>
    );

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="¿Has observado algo?" subtitle="Cuéntanos qué pasa y lo revisamos." />
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit.run();
        }}
      >
        <section className="space-y-2">
          <Segmented
            className="w-full [&>button]:flex-1"
            value={withFicha ? 'ficha' : 'texto'}
            onChange={(v) => setWithFicha(v === 'ficha')}
            options={[
              { value: 'ficha', label: 'Buscar animal' },
              { value: 'texto', label: 'No sé cuál / sin ficha' },
            ]}
          />
          {withFicha ? (
            <AnimalPicker
              value={animal}
              onChange={(a) => {
                setAnimal(a);
                if (a) {
                  const g = speciesGroup(catalogIndex({ statuses: [], subtypes: [], species: catalogs.species }).species(a.speciesId));
                  setSpecies(g === 'perro' ? 'CAN' : g === 'gato' ? 'FEL' : 'otra');
                }
              }}
            />
          ) : (
            <TextInput label="Animal (nombre o descripción)" placeholder="Ej.: gato atigrado del patio" value={animalName} onChange={(e) => setAnimalName(e.target.value)} />
          )}
        </section>

        <fieldset>
          <legend className="label">Especie</legend>
          <div className="grid grid-cols-3 gap-2">
            {AGENDA_SPECIES.map((x) => (
              <button
                key={x}
                type="button"
                aria-pressed={species === x}
                onClick={() => setSpecies(x)}
                className="rounded-lg border border-stone-300 px-2 py-3 text-sm font-medium aria-pressed:border-accent-600 aria-pressed:bg-accent-600 aria-pressed:text-white dark:border-stone-700"
              >
                {x === 'CAN' ? '🐶 ' : x === 'FEL' ? '🐱 ' : ''}
                {SPECIES_LABELS[x].replace(/ \(.*\)/, '')}
              </button>
            ))}
          </div>
        </fieldset>

        <Select
          label="¿Dónde?"
          value={areaId}
          onChange={(e) => setAreaId(e.target.value)}
          placeholder={areas.length ? 'Elige la ubicación…' : 'No hay ubicaciones para esta especie'}
          options={options(areas)}
        />

        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <label htmlFor="incident-text" className="label mb-0">
              ¿Qué ocurre?
            </label>
            <DictationButton onText={(t) => setText((prev) => (prev ? `${prev.trimEnd()} ${t}` : t))} />
          </div>
          <textarea id="incident-text" className="input min-h-36 text-base" value={text} onChange={(e) => setText(e.target.value)} placeholder="Describe lo que has visto…" />
        </div>

        <fieldset>
          <legend className="label">Prioridad</legend>
          <div className="grid grid-cols-3 gap-2">
            {INCIDENT_PRIORITIES.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={priority === p}
                onClick={() => setPriority(p)}
                className={cx('rounded-lg border-2 px-2 py-3 text-sm font-semibold', PRIORITY_STYLE[p])}
              >
                {PRIORITY_LABELS[p]}
              </button>
            ))}
          </div>
        </fieldset>

        {reporters.length > 0 && (
          <Select label="¿Quién comunica? (opcional)" value={reporterStaffId} onChange={(e) => setReporter(e.target.value)} placeholder="—" options={options(reporters, reporterStaffId)} />
        )}

        <fieldset>
          <legend className="label">Fotos (hasta {MAX_INCIDENT_PHOTOS})</legend>
          <div className="flex flex-wrap gap-2">
            {photos.map((p, i) => (
              <div key={p.url} className="relative">
                <img src={p.url} alt={`Foto ${i + 1}`} className="size-24 rounded-lg object-cover" />
                <button
                  type="button"
                  onClick={() => setPhotos((list) => list.filter((_, j) => j !== i))}
                  className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full bg-stone-900 text-xs text-white"
                  aria-label={`Quitar foto ${i + 1}`}
                >
                  ✕
                </button>
              </div>
            ))}
            {photos.length < MAX_INCIDENT_PHOTOS && (
              <label className="grid size-24 cursor-pointer place-items-center rounded-lg border-2 border-dashed border-stone-300 text-center text-xs text-stone-500 hover:border-accent-400 dark:border-stone-700">
                {processing ? 'Procesando…' : '📷 Añadir'}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  className="sr-only"
                  disabled={processing}
                  onChange={(e) => {
                    void addFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
            )}
          </div>
          {photoError && <p className="mt-1 text-xs text-red-600">{photoError}</p>}
        </fieldset>

        {formError && <Notice tone="warn">{formError}</Notice>}
        {submit.error !== undefined && <ErrorBox error={submit.error} />}

        <Button type="submit" variant="primary" size="lg" className="w-full" loading={submit.busy} disabled={processing}>
          Enviar incidencia
        </Button>
      </form>
    </div>
  );
}
