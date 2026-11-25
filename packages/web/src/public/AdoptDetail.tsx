/** Ficha pública de un animal en adopción. El id llega por prop, por `?id=` o por la ruta `/adopta/<id>`. */
import { useEffect, useState } from 'react';
import { ApiError, errorMessage, type PublicAnimal } from '../lib/api';
import { ageText, genderText, Photo, photoSrc, publicApi, sizeText, Traits } from './shared';

type Detail = PublicAnimal & { description?: string };
type State = { status: 'loading' } | { status: 'notfound' } | { status: 'error'; message: string } | { status: 'ready'; a: Detail; filesBase: string };

export function idFromLocation(): number | undefined {
  const q = new URLSearchParams(window.location.search).get('id');
  const m = window.location.pathname.match(/^\/adopta\/(\d+)\/?$/);
  const raw = q ?? m?.[1];
  const n = raw ? Number(raw) : NaN;
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

export default function AdoptDetail({ id: idProp }: { id?: number }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = idProp ?? idFromLocation();
    if (!id) {
      setState({ status: 'notfound' });
      return;
    }
    setState({ status: 'loading' });
    publicApi()
      .then(({ api, publicFilesBaseUrl }) => api.public.animal(id).then((a) => setState({ status: 'ready', a, filesBase: publicFilesBaseUrl })))
      .catch((e: unknown) => setState(e instanceof ApiError && e.status === 404 ? { status: 'notfound' } : { status: 'error', message: errorMessage(e) }));
  }, [idProp, tick]);

  useEffect(() => {
    if (state.status === 'ready') document.title = `${state.a.name} · Adopta · Protectora Modepran`;
  }, [state]);

  const back = (
    <a href="/adopta/" className="mb-5 inline-flex items-center gap-1 text-sm font-medium text-accent-700 hover:underline dark:text-accent-300">
      ← Todos los animales
    </a>
  );

  if (state.status === 'loading')
    return (
      <div aria-busy="true">
        {back}
        <div className="grid gap-8 md:grid-cols-2">
          <div className="aspect-square animate-pulse rounded-3xl bg-stone-200 dark:bg-stone-800" />
          <div className="space-y-3">
            <div className="h-10 w-1/2 animate-pulse rounded bg-stone-200 dark:bg-stone-800" />
            <div className="h-5 w-3/4 animate-pulse rounded bg-stone-100 dark:bg-stone-800" />
          </div>
        </div>
      </div>
    );

  if (state.status === 'notfound')
    return (
      <div className="rounded-2xl bg-white p-10 text-center shadow-sm dark:bg-stone-900">
        <p className="text-4xl" aria-hidden="true">
          🏡
        </p>
        <p className="font-display mt-2 text-xl font-semibold">Este animal ya no está en adopción</p>
        <p className="mt-1 text-sm text-stone-500">Puede que ya haya encontrado familia. ¡Conoce a los demás!</p>
        <a href="/adopta/" className="mt-4 inline-block rounded-full bg-accent-600 px-5 py-2 font-medium text-white hover:bg-accent-700">
          Ver animales en adopción
        </a>
      </div>
    );

  if (state.status === 'error')
    return (
      <div>
        {back}
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          <p className="font-medium">No hemos podido cargar la ficha.</p>
          <p className="mt-1 text-sm">{state.message}</p>
          <button type="button" onClick={() => setTick((t) => t + 1)} className="mt-3 rounded-full bg-red-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-800">
            Reintentar
          </button>
        </div>
      </div>
    );

  const { a } = state;
  const facts: [string, string | undefined][] = [
    ['Especie', a.species],
    ['Raza', a.breed],
    ['Sexo', genderText(a)],
    ['Edad', ageText(a)],
    ['Tamaño', sizeText(a)],
    ['Color', a.color],
  ];
  return (
    <article>
      {back}
      <div className="grid items-start gap-8 md:grid-cols-2">
        <Photo a={a} src={photoSrc(a.photoUrl, state.filesBase)} className="aspect-square w-full rounded-3xl shadow-md" />
        <div>
          <p className="text-sm font-semibold tracking-widest text-accent-700 uppercase dark:text-accent-300">En adopción</p>
          <h1 className="font-display mt-1 text-4xl font-semibold tracking-tight sm:text-5xl">{a.name}</h1>
          <dl className="mt-6 grid grid-cols-2 gap-3">
            {facts
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-stone-200/70 dark:bg-stone-900 dark:ring-stone-800">
                  <dt className="text-xs text-stone-500">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
          </dl>
          <div className="mt-5">
            <Traits a={a} />
          </div>
          {a.description && <p className="mt-5 leading-relaxed whitespace-pre-line text-stone-700 dark:text-stone-300">{a.description}</p>}
          <div className="mt-8 rounded-2xl bg-accent-50 p-5 ring-1 ring-accent-200 dark:bg-accent-950/30 dark:ring-accent-900">
            <p className="font-display text-lg font-semibold">¿Quieres conocer a {a.name}?</p>
            <p className="mt-1 text-sm text-stone-700 dark:text-stone-300">
              Escríbenos a través de la web de la protectora indicando su nombre y su número de ficha (<strong>nº {a.id}</strong>) y te contaremos cómo es el proceso de adopción.
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}
