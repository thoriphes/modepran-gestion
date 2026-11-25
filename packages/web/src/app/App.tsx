/**
 * App interna (isla React `client:only`, basename `/app`). Arranque: config → auth → /me + /catalogs.
 * Las pantallas se cargan a demanda (React.lazy): recharts y exceljs solo se bajan al usarlos.
 */
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { createApi, errorMessage } from '../lib/api';
import { createAuth, type AuthProvider } from '../lib/auth';
import { loadConfig } from '../lib/config';
import { normalizeCatalogs, SessionProvider, type Session } from './context';
import { Layout } from './Layout';
import { Button, Loading } from './ui';

const Home = lazy(() => import('./screens/Home'));
const AnimalList = lazy(() => import('./screens/animals/AnimalList'));
const AnimalNew = lazy(() => import('./screens/animals/AnimalNew'));
const AnimalDetail = lazy(() => import('./screens/animals/AnimalDetail'));
const AnimalListPrint = lazy(() => import('./screens/animals/AnimalListPrint'));
const FichasPrint = lazy(() => import('./screens/documents/FichasPrint'));
const EventDocument = lazy(() => import('./screens/documents/EventDocument'));
const AnimalFicha = lazy(() => import('./screens/documents/AnimalFicha'));
const DocumentsHome = lazy(() => import('./screens/documents/DocumentsHome'));
const BlankDocument = lazy(() => import('./screens/documents/BlankDocument'));
const TemplateEditor = lazy(() => import('./screens/documents/TemplateEditor'));
const ContactList = lazy(() => import('./screens/contacts/ContactList'));
const ContactDetail = lazy(() => import('./screens/contacts/ContactDetail'));
const Reports = lazy(() => import('./screens/reports/Reports'));
const Agenda = lazy(() => import('./screens/agenda/Agenda'));
const IncidentNew = lazy(() => import('./screens/incidents/IncidentNew'));
const IncidentInbox = lazy(() => import('./screens/incidents/IncidentInbox'));
const MyIncidents = lazy(() => import('./screens/incidents/MyIncidents'));
const Referrals = lazy(() => import('./screens/incidents/Referrals'));
const IncidentDetail = lazy(() => import('./screens/incidents/IncidentDetail'));
const Catalogs = lazy(() => import('./screens/admin/Catalogs'));
const Users = lazy(() => import('./screens/admin/Users'));
const Audit = lazy(() => import('./screens/admin/Audit'));
const Account = lazy(() => import('./screens/admin/Account'));

type Boot =
  | { state: 'loading'; label: string }
  | { state: 'error'; message: string; auth?: AuthProvider }
  | { state: 'ready'; session: Omit<Session, 'can' | 'hasProfile' | 'name' | 'reloadCatalogs'> };

const CALLBACK_PATH = '/app/callback';

export default function App() {
  const [boot, setBoot] = useState<Boot>({ state: 'loading', label: 'Cargando…' });

  useEffect(() => {
    let auth: AuthProvider | undefined;
    (async () => {
      const config = await loadConfig();
      auth = createAuth(config);
      const a = auth;
      if (window.location.pathname.startsWith(CALLBACK_PATH)) {
        setBoot({ state: 'loading', label: 'Entrando…' });
        const to = await a.handleCallback();
        window.history.replaceState(null, '', `/app${to === '/' ? '/' : to}`);
      }
      const user = await a.getUser();
      if (!user) {
        setBoot({ state: 'loading', label: 'Redirigiendo al inicio de sesión…' });
        const here = window.location.pathname.replace(/^\/app/, '') + window.location.search;
        await a.login(here || '/');
        return;
      }
      const api = createApi({
        baseUrl: config.apiBaseUrl,
        getHeaders: () => a.authHeaders(),
        onUnauthorized: () => {
          if (!a.dev) void a.login(window.location.pathname.replace(/^\/app/, '') + window.location.search);
        },
      });
      const [me, catalogs] = await Promise.all([api.me(), api.catalogs.all()]);
      setBoot({ state: 'ready', session: { config, auth: a, api, me, catalogs: normalizeCatalogs(catalogs) } });
    })().catch((e: unknown) => setBoot({ state: 'error', message: errorMessage(e), ...(auth ? { auth } : {}) }));
  }, []);

  if (boot.state === 'loading') return <Loading label={boot.label} />;
  if (boot.state === 'error')
    return (
      <div className="mx-auto max-w-md p-6">
        <h1 className="font-display mb-2 text-xl font-semibold">No se pudo abrir la aplicación</h1>
        <p className="mb-4 text-sm text-stone-600 dark:text-stone-400">{boot.message}</p>
        <div className="flex gap-2">
          <Button variant="primary" onClick={() => window.location.reload()}>
            Reintentar
          </Button>
          {boot.auth && <Button onClick={() => void boot.auth!.logout()}>Cerrar sesión</Button>}
        </div>
      </div>
    );

  return (
    <SessionProvider value={boot.session}>
      <BrowserRouter basename="/app">
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<S><Home /></S>} />
            <Route path="callback" element={<Navigate to="/" replace />} />
            <Route path="animales" element={<S><AnimalList /></S>} />
            <Route path="animales/nuevo" element={<S><AnimalNew /></S>} />
            <Route path="animales/imprimir" element={<S><AnimalListPrint /></S>} />
            <Route path="animales/:id" element={<S><AnimalDetail /></S>} />
            <Route path="documentos" element={<S><DocumentsHome /></S>} />
            <Route path="documentos/fichas" element={<S><FichasPrint /></S>} />
            <Route path="documentos/evento/:eventId" element={<S><EventDocument /></S>} />
            <Route path="documentos/ficha/:id" element={<S><AnimalFicha /></S>} />
            <Route path="documentos/blanco/:slug" element={<S><BlankDocument /></S>} />
            <Route path="plantillas/:slug" element={<S><TemplateEditor /></S>} />
            <Route path="contactos" element={<S><ContactList /></S>} />
            <Route path="contactos/:id" element={<S><ContactDetail /></S>} />
            <Route path="informes" element={<S><Reports /></S>} />
            <Route path="agenda/:agenda" element={<S><Agenda /></S>} />
            <Route path="incidencias" element={<S><IncidentInbox /></S>} />
            <Route path="incidencias/nueva" element={<S><IncidentNew /></S>} />
            <Route path="incidencias/mias" element={<S><MyIncidents /></S>} />
            <Route path="incidencias/derivaciones" element={<S><Referrals /></S>} />
            <Route path="incidencias/:id" element={<S><IncidentDetail /></S>} />
            <Route path="ajustes" element={<S><Catalogs /></S>} />
            <Route path="usuarios" element={<S><Users /></S>} />
            <Route path="auditoria" element={<S><Audit /></S>} />
            <Route path="cuenta" element={<S><Account /></S>} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </SessionProvider>
  );
}

function S({ children }: { children: ReactNode }) {
  return <Suspense fallback={<Loading />}>{children}</Suspense>;
}

function NotFound() {
  return (
    <div className="py-16 text-center">
      <p className="font-display text-xl font-semibold">Página no encontrada</p>
      <a className="mt-2 inline-block text-accent-700 underline dark:text-accent-300" href="/app/">
        Volver al inicio
      </a>
    </div>
  );
}
