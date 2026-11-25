/** Listado de animales con buscador avanzado (filtros en la URL), tabla densa (PC) / tarjetas (móvil). */
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { GENDER_LABELS, SIZE_LABELS, type AnimalFilters, type Gender, type Size } from '@modepran/domain';
import { fmtDate, fmtGender } from '../../../lib/format';
import { Thumb } from '../../components/AnimalPicker';
import { countFilters, filtersFromParams, filtersToParams, SORT_FIELDS, sortFromParams } from '../../components/animals/filters';
import { options, useAsync, useSession } from '../../context';
import { RequirePerm } from '../../Layout';
import { Badge, Button, Card, Empty, ErrorBox, Loading, PageHeader, Pagination, Select, TextInput, TriSelect } from '../../ui';

const PAGE_SIZE = 50;

export default function AnimalList() {
  return (
    <RequirePerm perm="animals:read">
      <AnimalListInner />
    </RequirePerm>
  );
}

function AnimalListInner() {
  const s = useSession();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const filters = filtersFromParams(params);
  const sort = sortFromParams(params);
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);
  const key = params.toString();
  const [open, setOpen] = useState(false);
  const [quick, setQuick] = useState(filters.q ?? '');

  const res = useAsync(() => s.api.animals.list(filters, page, PAGE_SIZE, sort), [key]);

  const apply = (f: AnimalFilters, p = 1) => {
    const np = filtersToParams(f, { page: p > 1 ? p : undefined, sort: sort.field !== 'id' ? sort.field : undefined, dir: sort.dir !== 'desc' ? sort.dir : undefined });
    setParams(np);
  };
  const setPage = (p: number) => {
    const np = new URLSearchParams(params);
    if (p > 1) np.set('page', String(p));
    else np.delete('page');
    setParams(np);
  };
  const setSort = (field: string, dir: string) => {
    const np = new URLSearchParams(params);
    np.set('sort', field);
    np.set('dir', dir);
    np.delete('page');
    setParams(np);
  };

  const qs = filtersToParams(filters).toString();
  const n = countFilters(filters);

  return (
    <div>
      <PageHeader
        title="Animales"
        subtitle={res.data ? `${res.data.total.toLocaleString('es-ES')} fichas` : undefined}
        actions={
          <>
            {s.can('animals:write') && (
              <Button variant="primary" onClick={() => nav('/animales/nuevo')}>
                ➕ Nueva llegada
              </Button>
            )}
            <Button onClick={() => nav(`/animales/imprimir?${qs}${qs ? '&' : ''}modo=listado`)}>🖨️ Imprimir listado</Button>
            {s.can('animals:read_contacts') && <Button onClick={() => nav(`/animales/imprimir?${qs}${qs ? '&' : ''}modo=acogida`)}>Listado acogida/propietarios</Button>}
            {(s.can('documents:generate') || s.can('documents:vet')) && <Button onClick={() => nav(`/documentos/fichas?${qs}`)}>Fichas masivas</Button>}
          </>
        }
      />

      <form
        className="mb-3 flex flex-wrap items-end gap-2"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          const f = { ...filters };
          if (quick.trim()) f.q = quick.trim();
          else delete f.q;
          apply(f);
        }}
      >
        <div className="min-w-56 flex-1">
          <label className="sr-only" htmlFor="quick-q">
            Buscar
          </label>
          <input id="quick-q" className="input" placeholder="Buscar por nº de ficha, nombre o chip…" value={quick} onChange={(e) => setQuick(e.target.value)} />
        </div>
        <Button type="submit" variant="primary">
          Buscar
        </Button>
        <Button onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? '▲' : '▼'} Búsqueda avanzada{n ? ` (${n})` : ''}
        </Button>
        {n > 0 && (
          <Button
            variant="ghost"
            onClick={() => {
              setQuick('');
              apply({});
            }}
          >
            Limpiar
          </Button>
        )}
        <div className="ml-auto flex items-end gap-2">
          <Select label="Ordenar por" value={sort.field} onChange={(e) => setSort(e.target.value, sort.dir)} options={SORT_FIELDS} />
          <Button aria-label={sort.dir === 'asc' ? 'Ascendente' : 'Descendente'} onClick={() => setSort(sort.field, sort.dir === 'asc' ? 'desc' : 'asc')}>
            {sort.dir === 'asc' ? '↑' : '↓'}
          </Button>
        </div>
      </form>

      {open && (
        <AdvancedFilters
          initial={filters}
          onApply={(f) => {
            apply(f);
            setOpen(false);
          }}
        />
      )}

      {res.loading && !res.data ? (
        <Loading />
      ) : res.error ? (
        <ErrorBox error={res.error} onRetry={res.reload} />
      ) : !res.data || res.data.items.length === 0 ? (
        <Card>
          <Empty title="No hay animales con estos filtros">Prueba a quitar algún filtro.</Empty>
        </Card>
      ) : (
        <>
          {/* PC: tabla densa */}
          <div className="card hidden overflow-x-auto md:block">
            <table className="table-dense">
              <thead>
                <tr>
                  <th className="w-12"></th>
                  <th>Nº</th>
                  <th>Nombre</th>
                  <th>Especie</th>
                  <th>Raza</th>
                  <th>Sexo</th>
                  <th>Estado</th>
                  <th>Centro</th>
                  <th>Últ. llegada</th>
                  <th>Ciudad</th>
                  <th>Chip</th>
                  <th>Web</th>
                </tr>
              </thead>
              <tbody>
                {res.data.items.map((a) => (
                  <tr key={a.id} className="cursor-pointer" onClick={() => nav(`/animales/${a.id}`)}>
                    <td>
                      <Thumb url={a.thumbUrl} animalId={a.id} hasPhoto={a.hasPhoto} size="size-9" />
                    </td>
                    <td className="tabular-nums">{a.id}</td>
                    <td className="font-medium">
                      <Link to={`/animales/${a.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                        {a.name}
                      </Link>
                    </td>
                    <td>{s.name('species', a.speciesId)}</td>
                    <td>{a.breedId ? s.name('breeds', a.breedId) : '—'}</td>
                    <td>{fmtGender(a.gender)}</td>
                    <td>
                      <StatusBadge statusId={a.statusId} />
                    </td>
                    <td>{a.centerId ? s.name('centers', a.centerId) : '—'}</td>
                    <td className="tabular-nums">{fmtDate(a.lastArrival?.date)}</td>
                    <td>{a.lastArrival?.cityName ?? (a.lastArrival?.cityId ? s.name('cities', a.lastArrival.cityId) : '—')}</td>
                    <td className="font-mono text-xs">{a.chip?.number ?? '—'}</td>
                    <td>{a.visibleWeb ? '✔' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Móvil: tarjetas */}
          <ul className="space-y-2 md:hidden">
            {res.data.items.map((a) => (
              <li key={a.id}>
                <Link to={`/animales/${a.id}`} className="card flex items-center gap-3 p-3">
                  <Thumb url={a.thumbUrl} animalId={a.id} hasPhoto={a.hasPhoto} size="size-14" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">
                      {a.name} <span className="font-normal text-stone-500">· nº {a.id}</span>
                    </p>
                    <p className="truncate text-sm text-stone-500">
                      {s.name('species', a.speciesId)} · {fmtGender(a.gender)} · {a.centerId ? s.name('centers', a.centerId) : 'sin centro'}
                    </p>
                    <div className="mt-1">
                      <StatusBadge statusId={a.statusId} />
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <Pagination page={res.data.page} pages={res.data.pages} total={res.data.total} onPage={setPage} />
          {res.loading && <p className="text-center text-xs text-stone-500">Actualizando…</p>}
        </>
      )}
    </div>
  );
}

export function StatusBadge({ statusId }: { statusId: string | undefined }) {
  const s = useSession();
  if (!statusId) return <Badge>Sin estado</Badge>;
  const code = s.catalogs.statuses.find((x) => x.id === statusId)?.code;
  const tone = code === 'disponible' ? 'green' : code === 'adoptado' ? 'accent' : code?.startsWith('acogida') ? 'blue' : ['fallecido', 'eutanasiado', 'cadaver'].includes(code ?? '') ? 'neutral' : 'amber';
  return <Badge tone={tone}>{s.name('statuses', statusId)}</Badge>;
}

function AdvancedFilters({ initial, onApply }: { initial: AnimalFilters; onApply: (f: AnimalFilters) => void }) {
  const { catalogs: c } = useSession();
  const [f, setF] = useState<AnimalFilters>(initial);
  useEffect(() => setF(initial), [JSON.stringify(initial)]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = <K extends keyof AnimalFilters>(k: K, v: AnimalFilters[K] | undefined) =>
    setF((prev) => {
      const n = { ...prev };
      if (v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v))) delete n[k];
      else n[k] = v;
      return n;
    });
  const str = (k: keyof AnimalFilters) => (f[k] === undefined ? '' : String(f[k]));
  const num = (k: 'id' | 'weightMin' | 'weightMax' | 'ageMin' | 'ageMax') => (v: string) => set(k, v === '' ? undefined : Number(v.replace(',', '.')));
  const sel = (k: keyof AnimalFilters) => (e: { target: { value: string } }) => set(k, (e.target.value || undefined) as never);
  const breeds = c.breeds.filter((b) => !f.speciesId || b.speciesId === f.speciesId);
  const arrivalSubtypes = c.subtypes.filter((x) => x.typeId === 'llegada');
  const workers = c.workers ?? c.staff;

  return (
    <Card className="mb-4" title="Búsqueda avanzada">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onApply(f);
        }}
      >
        <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <legend className="sr-only">Animal</legend>
          <TextInput label="Nº de ficha" inputMode="numeric" value={str('id')} onChange={(e) => num('id')(e.target.value)} />
          <TextInput label="Nombre (contiene)" value={str('name')} onChange={(e) => set('name', e.target.value || undefined)} />
          <TextInput label="Chip (exacto)" value={str('chip')} onChange={(e) => set('chip', e.target.value || undefined)} />
          <TextInput label="Color" value={str('color')} onChange={(e) => set('color', e.target.value || undefined)} />
          <Select label="Especie" value={str('speciesId')} onChange={sel('speciesId')} placeholder="Todas" options={options(c.species)} />
          <Select label="Raza" value={str('breedId')} onChange={sel('breedId')} placeholder="Todas" options={options(breeds)} />
          <Select label="Sexo" value={str('gender')} onChange={(e) => set('gender', (e.target.value || undefined) as Gender | undefined)} placeholder="Todos" options={Object.entries(GENDER_LABELS).map(([value, label]) => ({ value, label }))} />
          <Select label="Tamaño" value={str('size')} onChange={(e) => set('size', (e.target.value || undefined) as Size | undefined)} placeholder="Todos" options={Object.entries(SIZE_LABELS).map(([value, label]) => ({ value, label }))} />
          <div className="grid grid-cols-2 gap-2">
            <TextInput label="Peso mín. (kg)" inputMode="decimal" value={str('weightMin')} onChange={(e) => num('weightMin')(e.target.value)} />
            <TextInput label="Peso máx." inputMode="decimal" value={str('weightMax')} onChange={(e) => num('weightMax')(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <TextInput label="Edad mín. (años)" inputMode="numeric" value={str('ageMin')} onChange={(e) => num('ageMin')(e.target.value)} />
            <TextInput label="Edad máx." inputMode="numeric" value={str('ageMax')} onChange={(e) => num('ageMax')(e.target.value)} />
          </div>
          <Select label="Enfermedad (alguna vez)" value={str('illnessId')} onChange={sel('illnessId')} placeholder="Todas" options={options(c.illnesses)} />
          <TriSelect label="PPP" value={f.ppp} onChange={(v) => set('ppp', v)} />
          <TriSelect label="Esterilizado" value={f.sterilized} onChange={(v) => set('sterilized', v)} />
          <TriSelect label="Compatible perros" value={f.compatibleDogs} onChange={(v) => set('compatibleDogs', v)} />
          <TriSelect label="Compatible gatos" value={f.compatibleCats} onChange={(v) => set('compatibleCats', v)} />
          <TriSelect label="Visible en web" value={f.visibleWeb} onChange={(v) => set('visibleWeb', v)} />
          <TriSelect label="Con chip" value={f.hasChip} onChange={(v) => set('hasChip', v)} />
          <TriSelect label="Con foto" value={f.hasPhoto} onChange={(v) => set('hasPhoto', v)} />
        </fieldset>

        <h3 className="mt-5 mb-2 text-sm font-semibold text-stone-600 dark:text-stone-300">Estado y centro</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select label="Estado" value={str('statusId')} onChange={sel('statusId')} placeholder="Todos" options={options(c.statuses)} />
          <TextInput label="En ese estado desde" type="date" value={str('statusDateFrom')} onChange={(e) => set('statusDateFrom', e.target.value || undefined)} disabled={!f.statusId} hint={!f.statusId ? 'Elige un estado' : undefined} />
          <TextInput label="hasta" type="date" value={str('statusDateTo')} onChange={(e) => set('statusDateTo', e.target.value || undefined)} disabled={!f.statusId} />
          <Select label="Centro" value={str('centerId')} onChange={sel('centerId')} placeholder="Todos" options={options(c.centers)} />
        </div>

        <h3 className="mt-5 mb-2 text-sm font-semibold text-stone-600 dark:text-stone-300">Recogida (última llegada)</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select label="Zona" value={str('arrivalZoneId')} onChange={sel('arrivalZoneId')} placeholder="Todas" options={options(c.zones)} />
          <Select label="Ciudad" value={str('arrivalCityId')} onChange={sel('arrivalCityId')} placeholder="Todas" options={options(c.cities)} />
          <Select label="Subtipo de llegada" value={str('arrivalSubtypeId')} onChange={sel('arrivalSubtypeId')} placeholder="Todos" options={options(arrivalSubtypes)} />
          <Select label="Recogido por" value={str('arrivalUserId')} onChange={sel('arrivalUserId')} placeholder="Todos" options={options(workers)} />
          <TextInput label="Alguna llegada desde" type="date" value={str('arrivalDateFrom')} onChange={(e) => set('arrivalDateFrom', e.target.value || undefined)} />
          <TextInput label="hasta" type="date" value={str('arrivalDateTo')} onChange={(e) => set('arrivalDateTo', e.target.value || undefined)} />
          <TextInput label="Alguna salida desde" type="date" value={str('exitDateFrom')} onChange={(e) => set('exitDateFrom', e.target.value || undefined)} />
          <TextInput label="hasta" type="date" value={str('exitDateTo')} onChange={(e) => set('exitDateTo', e.target.value || undefined)} />
          <TextInput label="Contacto (nombre o NIF)" className="sm:col-span-2" value={str('contact')} onChange={(e) => set('contact', e.target.value || undefined)} />
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => setF({})}>
            Vaciar
          </Button>
          <Button type="submit" variant="primary">
            Aplicar filtros
          </Button>
        </div>
      </form>
    </Card>
  );
}
