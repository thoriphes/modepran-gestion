/** Marco de la app: barra superior, navegación lateral (PC) / menú desplegable (móvil), tema. */
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import type { Permission } from '@modepran/domain';
import { useSession } from './context';
import { cx } from './ui';

interface NavItem {
  to: string;
  label: string;
  icon: string;
  show: (s: ReturnType<typeof useSession>) => boolean;
}

export const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: 'Protectora',
    items: [
      { to: '/', label: 'Inicio', icon: '🏠', show: () => true },
      { to: '/animales', label: 'Animales', icon: '🐾', show: (s) => s.can('animals:read') },
      { to: '/animales/nuevo', label: 'Nueva llegada', icon: '➕', show: (s) => s.can('animals:write') },
      { to: '/contactos', label: 'Contactos', icon: '👤', show: (s) => s.can('contacts:read') || s.can('contacts:own_clients') },
      { to: '/documentos', label: 'Documentos', icon: '📄', show: (s) => s.can('documents:generate') || s.can('documents:vet') },
      { to: '/informes', label: 'Informes', icon: '📊', show: (s) => s.can('reports:read') },
    ],
  },
  {
    section: 'Coordinación',
    items: [
      { to: '/agenda/carlet', label: 'Agenda Carlet', icon: '📅', show: (s) => s.can('agenda_carlet:read') },
      { to: '/agenda/modevet', label: 'Agenda Modevet', icon: '🩺', show: (s) => s.can('agenda_modevet:read') },
      { to: '/incidencias/nueva', label: '¿Has observado algo?', icon: '👀', show: (s) => s.can('incidents:create') },
      { to: '/incidencias', label: 'Incidencias', icon: '🚩', show: (s) => s.can('incidents:manage') },
      { to: '/incidencias/derivaciones', label: 'Derivaciones', icon: '↪️', show: (s) => s.can('incidents:resolve_referred') || s.can('agenda_modevet:write') },
      { to: '/incidencias/mias', label: 'Mis incidencias', icon: '📝', show: (s) => s.can('incidents:own_followup') || s.can('incidents:create') },
    ],
  },
  {
    section: 'Administración',
    items: [
      { to: '/ajustes', label: 'Catálogos', icon: '⚙️', show: (s) => s.can('catalogs:write') || s.can('catalogs:operational') },
      { to: '/usuarios', label: 'Usuarios', icon: '🔑', show: (s) => s.can('users:manage') },
      { to: '/auditoria', label: 'Auditoría', icon: '🧾', show: (s) => s.can('audit:read') },
      { to: '/cuenta', label: 'Mi cuenta', icon: '🙂', show: () => true },
    ],
  },
];

type Theme = 'light' | 'dark' | 'system';
function readTheme(): Theme {
  try {
    const t = localStorage.getItem('modepran-theme');
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}
function applyTheme(t: Theme) {
  try {
    if (t === 'system') localStorage.removeItem('modepran-theme');
    else localStorage.setItem('modepran-theme', t);
  } catch {
    /* nada */
  }
  const dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  const next: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };
  const label: Record<Theme, string> = { system: '🖥️ Sistema', light: '☀️ Claro', dark: '🌙 Oscuro' };
  return (
    <button
      type="button"
      className="rounded-md px-2 py-1 text-xs text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
      onClick={() => {
        const t = next[theme];
        setTheme(t);
        applyTheme(t);
      }}
      title="Cambiar tema"
    >
      {label[theme]}
    </button>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const s = useSession();
  return (
    <nav aria-label="Principal" className="space-y-4">
      {NAV.map((sec) => {
        const items = sec.items.filter((i) => i.show(s));
        if (!items.length) return null;
        return (
          <div key={sec.section}>
            <p className="mb-1 px-2 text-xs font-semibold tracking-wider text-stone-400 uppercase">{sec.section}</p>
            <ul className="space-y-0.5">
              {items.map((i) => (
                <li key={i.to}>
                  <NavLink
                    to={i.to}
                    end={i.to === '/' || i.to === '/incidencias' || i.to === '/animales'}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cx(
                        'flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm',
                        isActive ? 'bg-accent-100 font-semibold text-accent-800 dark:bg-accent-900/40 dark:text-accent-200' : 'text-stone-700 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800',
                      )
                    }
                  >
                    <span aria-hidden="true" className="w-5 text-center">
                      {i.icon}
                    </span>
                    {i.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

export function Layout() {
  const s = useSession();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  const print = loc.pathname.startsWith('/documentos/') || loc.pathname === '/animales/imprimir';

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="no-print sticky top-0 z-30 border-b border-stone-200 bg-white/90 backdrop-blur dark:border-stone-800 dark:bg-stone-900/90">
        <div className="flex h-14 items-center gap-3 px-3 sm:px-4">
          <button
            type="button"
            className="rounded-md p-2 text-stone-700 hover:bg-stone-100 lg:hidden dark:text-stone-200 dark:hover:bg-stone-800"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label="Menú"
          >
            ☰
          </button>
          <a href="/app/" className="flex items-center gap-2">
            <img src="/favicon.svg" alt="" className="size-7" />
            <span className="font-display text-lg font-semibold">Modepran</span>
            <span className="hidden text-sm text-stone-500 sm:inline">Gestión</span>
          </a>
          {s.auth.dev && <span className="rounded bg-amber-200 px-1.5 py-0.5 text-xs font-semibold text-amber-900">DEV · {s.me.profiles.join(', ') || 'sin perfil'}</span>}
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <span className="hidden max-w-48 truncate text-sm text-stone-600 md:inline dark:text-stone-300">{s.me.name ?? s.me.email}</span>
            <button
              type="button"
              onClick={() => void s.auth.logout()}
              className="rounded-md px-2 py-1 text-sm text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
            >
              Salir
            </button>
          </div>
        </div>
        {open && (
          <div className="max-h-[calc(100dvh-3.5rem)] overflow-y-auto border-t border-stone-200 p-3 lg:hidden dark:border-stone-800">
            <NavList onNavigate={() => setOpen(false)} />
          </div>
        )}
      </header>
      <div className="flex flex-1">
        <aside className="no-print sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-60 shrink-0 overflow-y-auto border-r border-stone-200 p-3 lg:block dark:border-stone-800">
          <NavList />
        </aside>
        <main className={cx('min-w-0 flex-1', print ? 'p-0 sm:p-4' : 'p-3 sm:p-6')}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/** Muestra el contenido solo con el permiso; si no, un aviso. */
export function RequirePerm({ perm, any, children }: { perm?: Permission; any?: Permission[]; children: ReactNode }) {
  const s = useSession();
  const ok = (perm ? s.can(perm) : true) && (any ? any.some((p) => s.can(p)) : true);
  if (!ok)
    return (
      <div className="py-16 text-center text-stone-500">
        <p className="text-lg font-medium">No tienes acceso a esta sección.</p>
      </div>
    );
  return <>{children}</>;
}
