/**
 * Ajustes: catálogos. Regla del dominio: no se borran, se desactivan.
 * - `catalogs:write` (admin): todos.
 * - `catalogs:operational` (Carlet): solo los operativos.
 * Ids de subcategorías nuevas: se generan en el navegador (uuid); la API puede sustituirlos.
 */
import { useMemo, useState, type ReactNode } from 'react';
import {
  EVENT_TYPE_CODES,
  EVENT_TYPE_NAMES,
  slugify,
  foldText,
  type ActionSubcategory,
  type AreaSpecies,
  type StaffRole,
  type SubtypeFlags,
} from '@modepran/domain';
import { errorMessage, type CatalogType } from '../../../lib/api';
import { RequirePerm } from '../../Layout';
import { options, useSession } from '../../context';
import { Badge, Button, Checkbox, Empty, ErrorBox, Modal, PageHeader, Select, TextInput, cx } from '../../ui';

const LABELS: Record<CatalogType, string> = {
  species: 'Especies',
  breeds: 'Razas',
  cities: 'Ciudades',
  zones: 'Zonas',
  centers: 'Centros',
  statuses: 'Estados',
  subtypes: 'Subtipos de historial',
  vaccines: 'Vacunas',
  illnesses: 'Enfermedades',
  colonies: 'Colonias',
  areas: 'Ubicaciones del recinto',
  staff: 'Personal',
  appointmentTypes: 'Tipos de cita',
  actionCategories: 'Actuaciones',
  workers: 'Trabajadores',
};

const OPERATIONAL: CatalogType[] = ['staff', 'appointmentTypes', 'actionCategories', 'areas', 'vaccines', 'illnesses', 'colonies'];
const ORDER: CatalogType[] = [
  'staff',
  'appointmentTypes',
  'actionCategories',
  'areas',
  'vaccines',
  'illnesses',
  'colonies',
  'species',
  'breeds',
  'cities',
  'zones',
  'centers',
  'statuses',
  'subtypes',
];

const FLAG_LABELS: Record<keyof SubtypeFlags, string> = {
  user: 'Pide trabajador',
  contact: 'Pide contacto',
  center: 'Pide centro (mueve de centro)',
  notes: 'Notas',
  vaccine: 'Vacuna',
  illness: 'Enfermedad',
  colony: 'Colonia',
  date: 'Pide fecha',
  docGenerate: 'Genera documento',
  docUpload: 'Adjunto obligatorio',
  switch: 'Casilla sí/no',
};
const FLAG_KEYS = Object.keys(FLAG_LABELS) as (keyof SubtypeFlags)[];
const STAFF_ROLES: { value: StaffRole; label: string }[] = [
  { value: 'cuidadora', label: 'Cuidadora' },
  { value: 'veterinaria', label: 'Veterinaria' },
  { value: 'auxiliar', label: 'Auxiliar' },
];
const AREA_SPECIES: { value: AreaSpecies; label: string }[] = [
  { value: 'perros', label: 'Perros' },
  { value: 'gatos', label: 'Gatos' },
];

type Item = Record<string, unknown> & { id: string; name: string; active: boolean };

export default function Catalogs() {
  const s = useSession();
  const full = s.can('catalogs:write');
  const allowed = ORDER.filter((t) => full || OPERATIONAL.includes(t));
  const [type, setType] = useState<CatalogType>(allowed[0] ?? 'staff');
  const [q, setQ] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Item | 'new' | null>(null);
  const [error, setError] = useState<unknown>();
  const [busyId, setBusyId] = useState<string>();

  const items = useMemo(() => {
    const list = ((s.catalogs[type] ?? []) as unknown as Item[]).filter((i) => (showInactive || i.active !== false) && (!q || foldText(i.name).includes(foldText(q))));
    return [...list].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [s.catalogs, type, q, showInactive]);

  async function toggle(item: Item) {
    setBusyId(item.id);
    setError(undefined);
    try {
      await s.api.catalogs.update(type, item.id, { active: !item.active });
      await s.reloadCatalogs();
    } catch (e) {
      setError(e);
    } finally {
      setBusyId(undefined);
    }
  }

  return (
    <RequirePerm any={['catalogs:write', 'catalogs:operational']}>
      <PageHeader
        title="Catálogos"
        subtitle={full ? 'Los elementos no se borran: se desactivan y dejan de ofrecerse en los formularios.' : 'Catálogos operativos. Los elementos no se borran: se desactivan.'}
        actions={
          <Button variant="primary" onClick={() => setEditing('new')}>
            Añadir a {LABELS[type].toLowerCase()}
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[14rem_1fr]">
        <nav aria-label="Catálogos" className="flex gap-1 overflow-x-auto lg:flex-col">
          {allowed.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setType(t);
                setQ('');
              }}
              className={cx(
                'rounded-lg px-3 py-1.5 text-left text-sm whitespace-nowrap',
                t === type ? 'bg-accent-100 font-semibold text-accent-800 dark:bg-accent-900/40 dark:text-accent-200' : 'text-stone-700 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800',
              )}
            >
              {LABELS[t]}
              <span className="ml-1 text-xs text-stone-400">{((s.catalogs[t] ?? []) as unknown[]).length}</span>
            </button>
          ))}
        </nav>
        <section className="card min-w-0">
          <div className="flex flex-wrap items-end gap-3 border-b border-stone-200 p-3 dark:border-stone-800">
            <TextInput label="Buscar" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre…" className="w-full sm:w-64" />
            <Checkbox label="Ver desactivados" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="pb-2" />
          </div>
          {error !== undefined && (
            <div className="p-3">
              <ErrorBox error={error} />
            </div>
          )}
          {items.length === 0 ? (
            <Empty title="Nada por aquí" icon="📭">
              {q ? 'Ningún elemento coincide con la búsqueda.' : 'Aún no hay elementos en este catálogo.'}
            </Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="table-dense">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Detalle</th>
                    <th>Estado</th>
                    <th className="text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.id} className={i.active === false ? 'opacity-60' : undefined}>
                      <td className="font-medium">
                        {type === 'appointmentTypes' && <span className="mr-2 inline-block size-3 rounded-full align-middle" style={{ backgroundColor: String(i.color ?? '#999') }} />}
                        {i.name}
                      </td>
                      <td className="text-stone-500">
                        <Detail type={type} item={i} />
                      </td>
                      <td>{i.active === false ? <Badge>Desactivado</Badge> : <Badge tone="green">Activo</Badge>}</td>
                      <td className="text-right whitespace-nowrap">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(i)}>
                          Editar
                        </Button>
                        <Button size="sm" variant="ghost" loading={busyId === i.id} onClick={() => void toggle(i)}>
                          {i.active === false ? 'Activar' : 'Desactivar'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
      {editing && <Editor key={`${type}-${editing === 'new' ? 'new' : editing.id}`} type={type} item={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </RequirePerm>
  );
}

function Detail({ type, item }: { type: CatalogType; item: Item }) {
  const { name } = useSession();
  switch (type) {
    case 'species':
      return <>{item.code ? `código ${String(item.code)}` : ''}</>;
    case 'breeds':
      return <>{name('species', item.speciesId as string)}</>;
    case 'zones':
      return <>{((item.cityIds as string[]) ?? []).length} ciudades</>;
    case 'statuses':
      return <code className="text-xs">{String(item.code ?? '')}</code>;
    case 'subtypes': {
      const flags = FLAG_KEYS.filter((k) => item[k]);
      return (
        <>
          {EVENT_TYPE_NAMES[item.typeId as keyof typeof EVENT_TYPE_NAMES] ?? String(item.typeId)}
          {item.resultStatusId ? ` → ${name('statuses', item.resultStatusId as string)}` : ''}
          {flags.length > 0 && <span className="block text-xs">{flags.map((f) => FLAG_LABELS[f]).join(' · ')}</span>}
        </>
      );
    }
    case 'areas':
      return <>{((item.species as string[]) ?? []).join(', ')}</>;
    case 'staff':
      return <>{((item.roles as string[]) ?? []).join(', ')}</>;
    case 'appointmentTypes':
      return <code className="text-xs">{String(item.color ?? '')}</code>;
    case 'actionCategories': {
      const subs = (item.subcategories as ActionSubcategory[]) ?? [];
      return (
        <>
          {subs.filter((x) => x.active !== false).map((x) => x.name).join(', ') || 'Sin subcategorías'}
          {item.vetSubtypeId ? <span className="block text-xs">→ historial: {name('subtypes', item.vetSubtypeId as string)}</span> : null}
        </>
      );
    }
    default:
      return null;
  }
}

// ─────────────── Editor ───────────────

function initial(type: CatalogType): Record<string, unknown> {
  switch (type) {
    case 'zones':
      return { cityIds: [] };
    case 'subtypes':
      return { typeId: 'llegada', ...Object.fromEntries(FLAG_KEYS.map((k) => [k, false])) };
    case 'appointmentTypes':
      return { color: '#bb4a20' };
    case 'actionCategories':
      return { subcategories: [] };
    case 'areas':
      return { species: [] };
    case 'staff':
      return { roles: [] };
    default:
      return {};
  }
}

function Editor({ type, item, onClose }: { type: CatalogType; item: Item | undefined; onClose: () => void }) {
  const s = useSession();
  const [form, setForm] = useState<Record<string, unknown>>(() => (item ? structuredClone(item) : { name: '', active: true, ...initial(type) }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const str = (k: string) => (form[k] as string | undefined) ?? '';
  const arr = (k: string) => (form[k] as string[] | undefined) ?? [];
  const toggleIn = (k: string, v: string) => set(k, arr(k).includes(v) ? arr(k).filter((x) => x !== v) : [...arr(k), v]);

  async function save() {
    const name = str('name').trim();
    if (!name) return setError('El nombre es obligatorio.');
    if (type === 'breeds' && !str('speciesId')) return setError('Elige la especie.');
    if (type === 'subtypes' && !str('typeId')) return setError('Elige el tipo.');
    const body: Record<string, unknown> = { ...form, name };
    delete body.id;
    if (!item && (type === 'statuses' || type === 'subtypes')) body.code = slugify(name).replace(/-/g, '_');
    if (item && (type === 'statuses' || type === 'subtypes')) delete body.code; // código estable: no se cambia
    if (type === 'subtypes' && !body.switch) delete body.switchLabel;
    for (const [k, v] of Object.entries(body)) if (v === '') delete body[k];
    setBusy(true);
    setError(undefined);
    try {
      if (item) await s.api.catalogs.update(type, item.id, body);
      else await s.api.catalogs.create(type, body);
      await s.reloadCatalogs();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const vetSubtypes = options(s.catalogs.subtypes.filter((x) => x.typeId === 'veterinario'));
  let extra: ReactNode = null;
  switch (type) {
    case 'species':
      extra = <TextInput label="Código" hint="perro, gato u otro: decide la columna de los Excel." value={str('code')} onChange={(e) => set('code', e.target.value.trim().toLowerCase())} />;
      break;
    case 'breeds':
      extra = <Select label="Especie" value={str('speciesId')} onChange={(e) => set('speciesId', e.target.value)} options={options(s.catalogs.species, str('speciesId'))} placeholder="Elige…" />;
      break;
    case 'zones':
      extra = <MultiPick label="Ciudades de la zona" all={options(s.catalogs.cities)} selected={arr('cityIds')} onToggle={(v) => toggleIn('cityIds', v)} />;
      break;
    case 'statuses':
      extra = item ? <p className="text-sm text-stone-500">Código estable: <code>{String(item.code)}</code> (no se cambia; las reglas lo usan).</p> : <p className="text-sm text-stone-500">El código se genera del nombre y no se podrá cambiar.</p>;
      break;
    case 'subtypes':
      extra = (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label="Tipo"
              value={str('typeId')}
              disabled={!!item}
              onChange={(e) => set('typeId', e.target.value)}
              options={EVENT_TYPE_CODES.map((c) => ({ value: c, label: EVENT_TYPE_NAMES[c] }))}
            />
            <Select
              label="Estado resultante"
              hint={str('typeId') === 'veterinario' ? 'Los eventos veterinarios nunca cambian el estado.' : undefined}
              value={str('resultStatusId')}
              onChange={(e) => set('resultStatusId', e.target.value)}
              options={options(s.catalogs.statuses, str('resultStatusId'))}
              placeholder="(ninguno)"
            />
          </div>
          <fieldset>
            <legend className="label">Qué pide el formulario</legend>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {FLAG_KEYS.map((k) => (
                <Checkbox key={k} label={FLAG_LABELS[k]} checked={!!form[k]} onChange={(e) => set(k, e.target.checked)} />
              ))}
            </div>
          </fieldset>
          {!!form.switch && <TextInput label="Texto de la casilla" value={str('switchLabel')} onChange={(e) => set('switchLabel', e.target.value)} />}
        </>
      );
      break;
    case 'areas':
      extra = (
        <fieldset>
          <legend className="label">Para</legend>
          <div className="flex gap-4">
            {AREA_SPECIES.map((o) => (
              <Checkbox key={o.value} label={o.label} checked={arr('species').includes(o.value)} onChange={() => toggleIn('species', o.value)} />
            ))}
          </div>
        </fieldset>
      );
      break;
    case 'staff':
      extra = (
        <fieldset>
          <legend className="label">Funciones</legend>
          <div className="flex flex-wrap gap-4">
            {STAFF_ROLES.map((o) => (
              <Checkbox key={o.value} label={o.label} checked={arr('roles').includes(o.value)} onChange={() => toggleIn('roles', o.value)} />
            ))}
          </div>
        </fieldset>
      );
      break;
    case 'appointmentTypes':
      extra = (
        <div className="flex items-end gap-3">
          <label className="block">
            <span className="label">Color</span>
            <input type="color" value={str('color') || '#bb4a20'} onChange={(e) => set('color', e.target.value)} className="h-10 w-16 cursor-pointer rounded-lg border border-stone-300 bg-white dark:border-stone-700 dark:bg-stone-900" />
          </label>
          <Badge color={str('color') || '#bb4a20'}>{str('name') || 'Vista previa'}</Badge>
        </div>
      );
      break;
    case 'actionCategories': {
      const subs = (form.subcategories as ActionSubcategory[]) ?? [];
      const setSub = (i: number, patch: Partial<ActionSubcategory>) => set('subcategories', subs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
      extra = (
        <>
          <Select
            label="Subtipo veterinario del historial"
            hint="Al concluir una cita con esta actuación se ofrece registrarla en el historial."
            value={str('vetSubtypeId')}
            onChange={(e) => set('vetSubtypeId', e.target.value)}
            options={vetSubtypes}
            placeholder="(ninguno)"
          />
          <fieldset className="space-y-2">
            <legend className="label">Subcategorías</legend>
            {subs.length === 0 && <p className="text-sm text-stone-500">Sin subcategorías.</p>}
            {subs.map((sub, i) => (
              <div key={sub.id} className={cx('grid gap-2 rounded-lg border border-stone-200 p-2 sm:grid-cols-[1fr_1fr_auto] dark:border-stone-700', sub.active === false && 'opacity-60')}>
                <TextInput aria-label="Nombre de la subcategoría" value={sub.name} onChange={(e) => setSub(i, { name: e.target.value })} placeholder="Nombre" />
                <Select aria-label="Subtipo veterinario" value={sub.vetSubtypeId ?? ''} onChange={(e) => setSub(i, { vetSubtypeId: e.target.value || undefined })} options={vetSubtypes} placeholder="Subtipo veterinario…" />
                <Button size="sm" variant="ghost" onClick={() => setSub(i, { active: sub.active === false })}>
                  {sub.active === false ? 'Activar' : 'Desactivar'}
                </Button>
              </div>
            ))}
            <Button size="sm" onClick={() => set('subcategories', [...subs, { id: crypto.randomUUID(), name: '', active: true }])}>
              + Añadir subcategoría
            </Button>
          </fieldset>
        </>
      );
      break;
    }
  }

  return (
    <Modal
      open
      wide={type === 'subtypes' || type === 'zones' || type === 'actionCategories'}
      onClose={onClose}
      title={`${item ? 'Editar' : 'Añadir'}: ${LABELS[type]}`}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            Guardar
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <TextInput label="Nombre" value={str('name')} onChange={(e) => set('name', e.target.value)} autoFocus required />
        {extra}
        {error && <ErrorBox error={error} />}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function MultiPick({ label, all, selected, onToggle }: { label: string; all: { value: string; label: string }[]; selected: string[]; onToggle: (v: string) => void }) {
  const [q, setQ] = useState('');
  const shown = all.filter((o) => !q || foldText(o.label).includes(foldText(q)));
  return (
    <fieldset>
      <legend className="label">
        {label} <span className="font-normal text-stone-500">({selected.length} elegidas)</span>
      </legend>
      <input className="input mb-2" placeholder="Buscar ciudad…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar ciudad" />
      <div className="grid max-h-64 gap-1 overflow-y-auto rounded-lg border border-stone-200 p-2 sm:grid-cols-2 dark:border-stone-700">
        {shown.length === 0 && <p className="text-sm text-stone-500">Ninguna ciudad.</p>}
        {shown.map((o) => (
          <Checkbox key={o.value} label={o.label} checked={selected.includes(o.value)} onChange={() => onToggle(o.value)} />
        ))}
      </div>
    </fieldset>
  );
}

