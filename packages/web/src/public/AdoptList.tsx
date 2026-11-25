/** Listado público de animales en adopción con filtros por especie, sexo y tamaño. */
import { useEffect, useMemo, useState } from 'react';
import type { Gender, Size } from '@modepran/domain';
import { errorMessage, type PublicAnimal } from '../lib/api';
import { ageText, detailHref, genderText, Photo, photoSrc, publicApi, sizeText, speciesEmoji, Traits } from './shared';

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; animals: PublicAnimal[]; filesBase: string };

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
        active
          ? 'border-accent-600 bg-accent-600 text-white shadow-sm'
          : 'border-stone-300 bg-white text-stone-700 hover:border-accent-300 hover:text-accent-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200'
      }`}
    >
      {children}
    </button>
  );
}

export default function AdoptList() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [species, setSpecies] = useState<string>();
  const [gender, setGender] = useState<Gender>();
  const [size, setSize] = useState<Size>();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setState({ status: 'loading' });
    publicApi()
      .then(({ api, publicFilesBaseUrl }) => api.public.animals().then((animals) => setState({ status: 'ready', animals, filesBase: publicFilesBaseUrl })))
      .catch((e: unknown) => setState({ status: 'error', message: errorMessage(e) }));
  }, [tick]);

  const all = state.status === 'ready' ? state.animals : [];
  const speciesList = useMemo(() => [...new Set(all.map((a) => a.species))].sort((a, b) => a.localeCompare(b, 'es')), [all]);
  const shown = all.filter((a) => (!species || a.species === species) && (!gender || a.gender === gender) && (!size || a.size === size));

  return (
    <div>
      <div className="mb-6 space-y-3" role="group" aria-label="Filtros">
        <div className="flex flex-wrap gap-2">
          <Chip active={!species} onClick={() => setSpecies(undefined)}>
            Todos
          </Chip>
          {speciesList.map((s) => (
            <Chip key={s} active={species === s} onClick={() => setSpecies(species === s ? undefined : s)}>
              {speciesEmoji({ species: s })} {s}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip active={gender === 'male'} onClick={() => setGender(gender === 'male' ? undefined : 'male')}>
            ♂ Machos
          </Chip>
          <Chip active={gender === 'female'} onClick={() => setGender(gender === 'female' ? undefined : 'female')}>
            ♀ Hembras
          </Chip>
          <span className="mx-1 hidden w-px bg-stone-300 sm:block dark:bg-stone-700" aria-hidden="true" />
          {(
            [
              ['small', 'Pequeño'],
              ['medium', 'Mediano'],
              ['big', 'Grande'],
            ] as [Size, string][]
          ).map(([v, l]) => (
            <Chip key={v} active={size === v} onClick={() => setSize(size === v ? undefined : v)}>
              {l}
            </Chip>
          ))}
        </div>
      </div>

      {state.status === 'loading' && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Cargando">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="overflow-hidden rounded-2xl bg-white shadow-sm dark:bg-stone-900">
              <div className="aspect-[4/3] animate-pulse bg-stone-200 dark:bg-stone-800" />
              <div className="space-y-2 p-4">
                <div className="h-5 w-1/2 animate-pulse rounded bg-stone-200 dark:bg-stone-800" />
                <div className="h-4 w-3/4 animate-pulse rounded bg-stone-100 dark:bg-stone-800" />
              </div>
            </div>
          ))}
        </div>
      )}

      {state.status === 'error' && (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          <p className="font-medium">No hemos podido cargar los animales.</p>
          <p className="mt-1 text-sm">{state.message}</p>
          <button type="button" onClick={() => setTick((t) => t + 1)} className="mt-3 rounded-full bg-red-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-800">
            Reintentar
          </button>
        </div>
      )}

      {state.status === 'ready' && shown.length === 0 && (
        <div className="rounded-2xl bg-white p-10 text-center shadow-sm dark:bg-stone-900">
          <p className="text-4xl" aria-hidden="true">
            🐾
          </p>
          <p className="font-display mt-2 text-lg font-semibold">{all.length === 0 ? 'Ahora mismo no hay animales publicados' : 'Ningún animal con estos filtros'}</p>
          <p className="mt-1 text-sm text-stone-500">{all.length === 0 ? 'Vuelve pronto: publicamos nuevos compañeros a menudo.' : 'Prueba a quitar algún filtro.'}</p>
        </div>
      )}

      {state.status === 'ready' && shown.length > 0 && (
        <>
          <p className="mb-3 text-sm text-stone-500" aria-live="polite">
            {shown.length} {shown.length === 1 ? 'animal busca' : 'animales buscan'} hogar
          </p>
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((a) => {
              const facts = [ageText(a), genderText(a), sizeText(a)].filter(Boolean);
              return (
                <li key={a.id}>
                  <a
                    href={detailHref(a.id)}
                    className="group block h-full overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200/70 transition hover:-translate-y-1 hover:shadow-lg dark:bg-stone-900 dark:ring-stone-800"
                  >
                    <div className="overflow-hidden">
                      <Photo a={a} src={photoSrc(a.photoUrl, state.filesBase)} className="aspect-[4/3] w-full transition duration-500 group-hover:scale-105" />
                    </div>
                    <div className="space-y-2 p-4">
                      <h2 className="font-display text-xl font-semibold group-hover:text-accent-700 dark:group-hover:text-accent-300">{a.name}</h2>
                      {facts.length > 0 && <p className="text-sm text-stone-600 dark:text-stone-400">{facts.join(' · ')}</p>}
                      <Traits a={a} />
                    </div>
                  </a>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
