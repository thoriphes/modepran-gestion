/** Campos de la ficha del animal (alta y edición) + chip + subida de foto. */
import { GENDER_LABELS, normalizeBreed, SIZE_LABELS, type Animal, type Gender, type Size } from '@modepran/domain';
import { uploadToSignedUrl, type AnimalData, type Api } from '../../../lib/api';
import { animalPhotoVariants } from '../../../lib/image';
import { options, useSession } from '../../context';
import { Checkbox, Select, TextInput } from '../../ui';

export interface AnimalDraft {
  name: string;
  speciesId: string;
  breedText: string;
  color: string;
  gender: Gender;
  weightKg: string;
  size: Size | '';
  bornAt: string;
  centerId: string;
  sterilized: boolean;
  ppp: boolean;
  visibleWeb: boolean;
  compatibleDogs: boolean;
  compatibleCats: boolean;
  hasChip: boolean;
  chipNumber: string;
  chipPassport: string;
  chipOwner: string;
  chipPhone: string;
  chipNotes: string;
}

export function emptyAnimalDraft(): AnimalDraft {
  return {
    name: '',
    speciesId: '',
    breedText: '',
    color: '',
    gender: 'none',
    weightKg: '',
    size: '',
    bornAt: '',
    centerId: '',
    sterilized: false,
    ppp: false,
    visibleWeb: false,
    compatibleDogs: false,
    compatibleCats: false,
    hasChip: false,
    chipNumber: '',
    chipPassport: '',
    chipOwner: '',
    chipPhone: '',
    chipNotes: '',
  };
}

export function draftFromAnimal(a: Animal, breedName: string): AnimalDraft {
  return {
    name: a.name,
    speciesId: a.speciesId,
    breedText: a.breedId ? breedName : '',
    color: a.color ?? '',
    gender: a.gender,
    weightKg: a.weightKg !== undefined ? String(a.weightKg) : '',
    size: a.size ?? '',
    bornAt: a.bornAt ?? '',
    centerId: a.centerId ?? '',
    sterilized: a.sterilized,
    ppp: a.ppp,
    visibleWeb: a.visibleWeb,
    compatibleDogs: a.compatibleDogs,
    compatibleCats: a.compatibleCats,
    hasChip: !!a.chip,
    chipNumber: a.chip?.number ?? '',
    chipPassport: a.chip?.passport ?? '',
    chipOwner: a.chip?.owner ?? '',
    chipPhone: a.chip?.phone ?? '',
    chipNotes: a.chip?.notes ?? '',
  };
}

export function animalDraftErrors(d: AnimalDraft): Record<string, string> {
  const e: Record<string, string> = {};
  if (!d.name.trim()) e.name = 'El nombre es obligatorio.';
  if (!d.speciesId) e.speciesId = 'Elige la especie.';
  if (d.weightKg && !Number.isFinite(Number(d.weightKg.replace(',', '.')))) e.weightKg = 'Peso no válido.';
  if (d.hasChip && !d.chipNumber.trim()) e.chipNumber = 'Indica el número de chip.';
  return e;
}

/** Datos para la API. La raza se manda por id si existe en el catálogo de esa especie; si no, por nombre. */
export function animalDraftToData(d: AnimalDraft, breeds: { id: string; name: string; speciesId: string }[]): AnimalData {
  const out: AnimalData = {
    name: d.name.trim(),
    speciesId: d.speciesId,
    gender: d.gender,
    sterilized: d.sterilized,
    ppp: d.ppp,
    visibleWeb: d.visibleWeb,
    compatibleDogs: d.compatibleDogs,
    compatibleCats: d.compatibleCats,
  };
  const bt = d.breedText.trim();
  if (bt) {
    const norm = normalizeBreed(bt).toLowerCase();
    const found = breeds.find((b) => b.speciesId === d.speciesId && b.name.toLowerCase() === norm);
    if (found) out.breedId = found.id;
    else out.breedName = normalizeBreed(bt);
  }
  if (d.color.trim()) out.color = d.color.trim();
  if (d.weightKg.trim()) out.weightKg = Number(d.weightKg.replace(',', '.'));
  if (d.size) out.size = d.size;
  if (d.bornAt) out.bornAt = d.bornAt;
  if (d.centerId) out.centerId = d.centerId;
  if (d.hasChip && d.chipNumber.trim()) {
    out.chip = { number: d.chipNumber.trim() };
    if (d.chipPassport.trim()) out.chip.passport = d.chipPassport.trim();
    if (d.chipOwner.trim()) out.chip.owner = d.chipOwner.trim();
    if (d.chipPhone.trim()) out.chip.phone = d.chipPhone.trim();
    if (d.chipNotes.trim()) out.chip.notes = d.chipNotes.trim();
  } else out.chip = null;
  return out;
}

export function AnimalFields({ draft, setDraft, errors, showCenter = true }: { draft: AnimalDraft; setDraft: (f: (d: AnimalDraft) => AnimalDraft) => void; errors: Record<string, string>; showCenter?: boolean }) {
  const { catalogs: c } = useSession();
  const set = <K extends keyof AnimalDraft>(k: K, v: AnimalDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const breeds = c.breeds.filter((b) => b.speciesId === draft.speciesId && b.active !== false);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <TextInput label="Nombre" required value={draft.name} onChange={(e) => set('name', e.target.value)} error={errors.name} />
        <Select label="Especie" value={draft.speciesId} onChange={(e) => set('speciesId', e.target.value)} placeholder="Elige…" options={options(c.species, draft.speciesId)} error={errors.speciesId} />
        <div>
          <TextInput label="Raza" list="breeds-datalist" value={draft.breedText} onChange={(e) => set('breedText', e.target.value)} disabled={!draft.speciesId} hint="Si no existe, se crea." />
          <datalist id="breeds-datalist">
            {breeds.map((b) => (
              <option key={b.id} value={b.name} />
            ))}
          </datalist>
        </div>
        <TextInput label="Color" value={draft.color} onChange={(e) => set('color', e.target.value)} />
        <Select label="Sexo" value={draft.gender} onChange={(e) => set('gender', e.target.value as Gender)} options={Object.entries(GENDER_LABELS).map(([value, label]) => ({ value, label }))} />
        <Select label="Tamaño" value={draft.size} onChange={(e) => set('size', e.target.value as Size | '')} placeholder="—" options={Object.entries(SIZE_LABELS).map(([value, label]) => ({ value, label }))} />
        <TextInput label="Peso (kg)" inputMode="decimal" value={draft.weightKg} onChange={(e) => set('weightKg', e.target.value)} error={errors.weightKg} />
        <TextInput label="Fecha de nacimiento (aprox.)" type="date" value={draft.bornAt} onChange={(e) => set('bornAt', e.target.value)} />
        {showCenter && <Select label="Centro" value={draft.centerId} onChange={(e) => set('centerId', e.target.value)} placeholder="—" options={options(c.centers, draft.centerId)} />}
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <Checkbox label="Esterilizado" checked={draft.sterilized} onChange={(e) => set('sterilized', e.target.checked)} />
        <Checkbox label="PPP" checked={draft.ppp} onChange={(e) => set('ppp', e.target.checked)} />
        <Checkbox label="Visible en la web" checked={draft.visibleWeb} onChange={(e) => set('visibleWeb', e.target.checked)} />
        <Checkbox label="Compatible con perros" checked={draft.compatibleDogs} onChange={(e) => set('compatibleDogs', e.target.checked)} />
        <Checkbox label="Compatible con gatos" checked={draft.compatibleCats} onChange={(e) => set('compatibleCats', e.target.checked)} />
      </div>
      <fieldset className="rounded-lg border border-stone-200 p-3 dark:border-stone-700">
        <legend className="px-1 text-sm font-medium">
          <Checkbox label="Tiene chip" checked={draft.hasChip} onChange={(e) => set('hasChip', e.target.checked)} />
        </legend>
        {draft.hasChip && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <TextInput label="Número de chip" required value={draft.chipNumber} onChange={(e) => set('chipNumber', e.target.value)} error={errors.chipNumber} hint="Único: no puede repetirse." />
            <TextInput label="Pasaporte" value={draft.chipPassport} onChange={(e) => set('chipPassport', e.target.value)} />
            <TextInput label="Propietario del chip" value={draft.chipOwner} onChange={(e) => set('chipOwner', e.target.value)} />
            <TextInput label="Teléfono" type="tel" value={draft.chipPhone} onChange={(e) => set('chipPhone', e.target.value)} />
            <TextInput label="Notas" className="sm:col-span-2" value={draft.chipNotes} onChange={(e) => set('chipNotes', e.target.value)} />
          </div>
        )}
      </fieldset>
    </div>
  );
}

/** Redimensiona y sube la foto (700 px + miniatura 200 px) y la confirma. */
export async function uploadAnimalPhoto(api: Api, animalId: number, file: File): Promise<Animal> {
  const { photo, thumb } = await animalPhotoVariants(file);
  const targets = await api.animals.photoUploadUrl(animalId);
  await Promise.all([uploadToSignedUrl(targets.photo, photo, 'image/jpeg'), uploadToSignedUrl(targets.thumb, thumb, 'image/jpeg')]);
  return api.animals.photoUploaded(animalId);
}

export function PhotoInput({ file, onFile, currentUrl }: { file: File | undefined; onFile: (f: File | undefined) => void; currentUrl?: string | undefined }) {
  const preview = file ? URL.createObjectURL(file) : currentUrl;
  return (
    <div className="flex items-center gap-4">
      {preview ? (
        <img src={preview} alt="Foto del animal" className="size-28 rounded-lg object-cover" onLoad={() => file && URL.revokeObjectURL(preview)} />
      ) : (
        <div className="grid size-28 place-items-center rounded-lg bg-stone-100 text-3xl text-stone-400 dark:bg-stone-800" aria-hidden="true">
          🐾
        </div>
      )}
      <div>
        <label className="label" htmlFor="animal-photo">
          Foto
        </label>
        <input id="animal-photo" type="file" accept="image/*" className="block text-sm" onChange={(e) => onFile(e.target.files?.[0])} />
        <p className="mt-1 text-xs text-stone-500">Se reduce a 700 px antes de subirla.</p>
      </div>
    </div>
  );
}
