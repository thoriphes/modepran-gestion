/**
 * App Hono de la API (montada bajo `/api`). `createApp(deps)` no depende de AWS: las dependencias
 * (repositorio, ficheros, usuarios, auth) se inyectan, así sirve para Lambda, dev local y tests.
 */
import { Hono } from 'hono';
import { ApiError, errorResponse } from './http.js';
import { adminRoutes, publicRoutes } from './routes/admin.js';
import { agendaRoutes } from './routes/agenda.js';
import { animalRoutes } from './routes/animals.js';
import { coreRoutes } from './routes/core.js';
import { documentRoutes } from './routes/documents.js';
import { incidentRoutes } from './routes/incidents.js';
import { reportRoutes } from './routes/reports.js';
import { Services, type AppEnv, type Deps } from './services.js';

export type { Deps } from './services.js';

export function createApp(deps: Deps) {
  const svc = new Services(deps);
  const app = new Hono<AppEnv>().basePath('/api');

  app.onError((err, c) => errorResponse(c, err));
  app.notFound((c) => c.json({ error: { code: 'not_found', message: 'Ruta no encontrada.' } }, 404));

  app.use('*', async (c, next) => {
    c.set('svc', svc);
    c.header('cache-control', 'no-store');
    if (c.req.path.startsWith('/api/public/')) return next();
    const user = await deps.auth(c);
    if (!user) throw new ApiError(401, 'unauthenticated', 'Inicia sesión.');
    c.set('user', user);
    return next();
  });

  app.route('/', publicRoutes());
  app.route('/', coreRoutes());
  app.route('/', animalRoutes());
  app.route('/', documentRoutes());
  app.route('/', reportRoutes());
  app.route('/', agendaRoutes());
  app.route('/', incidentRoutes());
  app.route('/', adminRoutes());

  return app;
}
