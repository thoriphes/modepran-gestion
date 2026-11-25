/** Buscador de animales con ficha (por id, nombre o chip). Lo usan agenda e incidencias. */
import { useEffect, useId, useState } from 'react';
import type { AnimalListItem } from '../../lib/api';
import { useSession } from '../context';
import { cx, Spinner } from '../ui';

export interface PickedAnimal {
  id: number;
  name: string;
  speciesId: string;
}

export function AnimalPicker({
  value,
  onChange,
  label = 'Animal',
  placeholder = 'Nombre, nº de ficha o chip…',
  autoFocus,
}: {
  value: PickedAnimal | undefined;
  onChange: (a: PickedAnimal | undefined) => void;
  label?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const { api, name } = useSession();
  const id = useId();
  const [q, setQ] = useState('');
  const [items, setItems] = useState<AnimalListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const text = q.trim();
    if (text.length < 1) {
      setItems([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      api.animals
        .list({ q: text }, 1, 8)
        .then((p) => setItems(p.items))
        .catch(() => setItems([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q, api]);

  if (value)
    return (
      <div>
        <span className="label">{label}</span>
        <div className="flex items-center justify-between gap-2 rounded-lg border border-accent-300 bg-accent-50 px-3 py-2 text-sm dark:border-accent-800 dark:bg-accent-950/30">
          <span>
            <strong>{value.name}</strong> <span className="text-stone-500">· nº {value.id} · {name('species', value.speciesId)}</span>
          </span>
          <button type="button" className="text-xs text-accent-700 underline dark:text-accent-300" onClick={() => onChange(undefined)}>
            Cambiar
          </button>
        </div>
      </div>
    );

  return (
    <div className="relative">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          className="input pr-8"
          value={q}
          autoFocus={autoFocus}
          placeholder={placeholder}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          role="combobox"
          aria-expanded={open && items.length > 0}
          aria-controls={`${id}-list`}
          autoComplete="off"
        />
        {loading && <Spinner className="absolute top-2.5 right-2 size-4 text-stone-400" />}
      </div>
      {open && items.length > 0 && (
        <ul id={`${id}-list`} role="listbox" className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-stone-200 bg-white shadow-lg dark:border-stone-700 dark:bg-stone-900">
          {items.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                className={cx('flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-accent-50 dark:hover:bg-stone-800')}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange({ id: a.id, name: a.name, speciesId: a.speciesId });
                  setQ('');
                  setOpen(false);
                }}
              >
                <Thumb url={a.thumbUrl} animalId={a.id} hasPhoto={a.hasPhoto} />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{a.name}</span>
                  <span className="block truncate text-xs text-stone-500">
                    nº {a.id} · {name('species', a.speciesId)} · {name('statuses', a.statusId)}
                    {a.chip?.number ? ` · chip ${a.chip.number}` : ''}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * URL firmada de la foto o miniatura de un animal. La API no la incluye en listados ni fichas: se pide a
 * `GET /animals/:id/file-url` (con caché en el cliente). `known` = URL ya conocida (si la API la manda).
 */
export function useAnimalPhoto(animalId: number | undefined, hasPhoto: boolean | undefined, kind: 'thumb' | 'photo', known?: string, version?: unknown) {
  const { api } = useSession();
  const [url, setUrl] = useState<string | undefined>(known);
  useEffect(() => {
    if (known) return setUrl(known);
    setUrl(undefined);
    if (animalId === undefined || !hasPhoto) return;
    let alive = true;
    (kind === 'thumb' ? api.animals.thumbUrl(animalId) : api.animals.photoUrl(animalId)).then(
      (u) => alive && setUrl(u),
      () => alive && setUrl(undefined),
    );
    return () => {
      alive = false;
    };
  }, [api, animalId, hasPhoto, kind, known, version]);
  return url;
}

export function Thumb({
  url,
  animalId,
  hasPhoto,
  size = 'size-10',
  alt = '',
}: {
  url?: string | undefined;
  animalId?: number;
  hasPhoto?: boolean;
  size?: string;
  alt?: string;
}) {
  const src = useAnimalPhoto(animalId, hasPhoto, 'thumb', url);
  const [failed, setFailed] = useState<string>();
  return src && failed !== src ? (
    <img src={src} alt={alt} loading="lazy" onError={() => setFailed(src)} className={cx(size, 'shrink-0 rounded-md bg-stone-100 object-cover dark:bg-stone-800')} />
  ) : (
    <span aria-hidden="true" className={cx(size, 'grid shrink-0 place-items-center rounded-md bg-stone-100 text-stone-400 dark:bg-stone-800')}>
      🐾
    </span>
  );
}
