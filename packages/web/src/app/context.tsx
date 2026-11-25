/** Contexto de la app interna: config, auth, cliente API, usuario (`/me`) y catálogos. */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { can as canProfiles, type Permission, type Profile } from '@modepran/domain';
import type { Api, Catalogs, Me } from '../lib/api';
import type { AuthProvider } from '../lib/auth';
import type { AppConfig } from '../lib/config';

export interface Session {
  config: AppConfig;
  auth: AuthProvider;
  api: Api;
  me: Me;
  catalogs: Catalogs;
  reloadCatalogs: () => Promise<void>;
  can: (p: Permission) => boolean;
  hasProfile: (p: Profile) => boolean;
  /** Nombre de un elemento de catálogo por id. */
  name: (type: keyof Catalogs, id: string | undefined | null) => string;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ value, children }: { value: Omit<Session, 'can' | 'hasProfile' | 'name' | 'reloadCatalogs' | 'catalogs'> & { catalogs: Catalogs }; children: ReactNode }) {
  const [catalogs, setCatalogs] = useState(value.catalogs);
  const reloadCatalogs = useCallback(async () => setCatalogs(normalizeCatalogs(await value.api.catalogs.all())), [value.api]);
  const session = useMemo<Session>(() => {
    const maps = new Map<string, Map<string, string>>();
    const name = (type: keyof Catalogs, id: string | undefined | null) => {
      if (!id) return '—';
      let m = maps.get(type);
      if (!m) {
        m = new Map(((catalogs[type] ?? []) as { id: string; name: string }[]).map((x) => [x.id, x.name]));
        maps.set(type, m);
      }
      return m.get(id) ?? id;
    };
    // Si /me no trae permisos, se calculan con la matriz del dominio a partir de los perfiles.
    const perms = new Set(value.me.permissions ?? []);
    return {
      ...value,
      catalogs,
      reloadCatalogs,
      can: (p) => (perms.size ? perms.has(p) : canProfiles(value.me.profiles, p)),
      hasProfile: (p) => value.me.profiles.includes(p),
      name,
    };
  }, [value, catalogs, reloadCatalogs]);
  return <Ctx.Provider value={session}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession fuera de SessionProvider');
  return s;
}

/** Rellena con listas vacías lo que la API no mande. */
export function normalizeCatalogs(raw: Partial<Catalogs>): Catalogs {
  const out = {} as Record<string, unknown>;
  const keys: (keyof Catalogs)[] = [
    'species',
    'breeds',
    'cities',
    'zones',
    'centers',
    'statuses',
    'subtypes',
    'vaccines',
    'illnesses',
    'colonies',
    'areas',
    'staff',
    'appointmentTypes',
    'actionCategories',
  ];
  for (const k of keys) out[k] = Array.isArray(raw[k]) ? raw[k] : [];
  if (raw.workers) out.workers = raw.workers;
  return out as unknown as Catalogs;
}

/** Catálogo activo como opciones de <Select>, ordenado por nombre. */
export function options<T extends { id: string; name: string; active?: boolean }>(items: readonly T[] | undefined, includeId?: string) {
  return (items ?? [])
    .filter((i) => i.active !== false || i.id === includeId)
    .map((i) => ({ value: i.id, label: i.name }))
    .sort((a, b) => a.label.localeCompare(b.label, 'es'));
}

// ─────────────── Datos asíncronos ───────────────

export interface AsyncState<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  reload: () => void;
  setData: (d: T | undefined | ((prev: T | undefined) => T | undefined)) => void;
}

/** Carga datos con `fn` cuando cambian `deps`. Ignora respuestas viejas. */
export function useAsync<T>(fn: () => Promise<T>, deps: readonly unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<unknown>(undefined);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const seq = useRef(0);
  useEffect(() => {
    const n = ++seq.current;
    setLoading(true);
    setError(undefined);
    fn().then(
      (d) => {
        if (n === seq.current) {
          setData(d);
          setLoading(false);
        }
      },
      (e: unknown) => {
        if (n === seq.current) {
          setError(e);
          setLoading(false);
        }
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, error, loading, reload: () => setTick((t) => t + 1), setData };
}

/** Acción con estado de envío y error. */
export function useAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(undefined);
  const run = useCallback(
    async (...args: A): Promise<R | undefined> => {
      setBusy(true);
      setError(undefined);
      try {
        return await fn(...args);
      } catch (e) {
        setError(e);
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [fn],
  );
  return { run, busy, error, setError };
}
