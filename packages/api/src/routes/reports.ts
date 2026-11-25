/** Informes, censo y datos de los Excel (los calcula el dominio a partir de animales + eventos). */
import { Hono, type Context } from 'hono';
import {
  arrivalsBySpeciesSex,
  arrivalsBySubtype,
  censusExcelData,
  censusExcelTitle,
  dashboard,
  defaultReportRange,
  exitsBySpeciesSex,
  exitsBySubtype,
  formatDMY,
  gestionExcelData,
  gestionExcelTitle,
  GESTION_HEADERS,
  groupEventsByAnimal,
  monthlyCensusReport,
  type ReportFilter,
} from '@modepran/domain';
import { ApiError, need, readQuery } from '../http.js';
import { reportQuery } from '../schemas.js';
import type { AppEnv } from '../services.js';

async function reportFilter(c: Context<AppEnv>) {
  const svc = c.get('svc');
  const q = readQuery(c, reportQuery);
  const def = defaultReportRange(svc.today());
  const from = q.from ?? def.from;
  const to = q.to ?? def.to;
  if (from > to) throw new ApiError(400, 'validation', 'La fecha inicial es posterior a la final.', 'from');
  const cats = await svc.catalogs();
  const filter: ReportFilter = { from, to };
  let zoneName: string | undefined;
  let cityName: string | undefined;
  let centerName: string | undefined;
  if (q.cityId) {
    filter.cityIds = [q.cityId];
    cityName = cats.cities.find((x) => x.id === q.cityId)?.name;
  } else if (q.zoneId) {
    const zone = cats.zones.find((z) => z.id === q.zoneId);
    if (!zone) throw new ApiError(422, 'zone_not_found', 'La zona no existe.', 'zoneId');
    filter.cityIds = zone.cityIds;
    zoneName = zone.name;
  }
  if (q.centerId) {
    filter.centerId = q.centerId;
    centerName = cats.centers.find((x) => x.id === q.centerId)?.name;
  }
  return { filter, cats, names: { zoneName, cityName, centerName }, query: q };
}

export function reportRoutes() {
  const r = new Hono<AppEnv>();

  r.get('/reports/dashboard', async (c) => {
    need(c, 'reports:read');
    const svc = c.get('svc');
    const [animals, events, cats] = await Promise.all([svc.animals(), svc.allEvents(), svc.catalogs()]);
    return c.json(dashboard(animals, events, cats, svc.today()));
  });

  r.get('/reports/summary', async (c) => {
    need(c, 'reports:read');
    const svc = c.get('svc');
    const { filter, cats } = await reportFilter(c);
    const [animals, events] = await Promise.all([svc.animals(), svc.allEvents()]);
    return c.json({
      filter,
      arrivalsBySpeciesSex: arrivalsBySpeciesSex(animals, events, filter),
      exitsBySpeciesSex: exitsBySpeciesSex(animals, events, filter),
      arrivalsBySubtype: arrivalsBySubtype(animals, events, filter),
      exitsBySubtype: exitsBySubtype(animals, events, filter),
      monthlyCensus: monthlyCensusReport(animals, groupEventsByAnimal(events), cats, filter),
    });
  });

  r.get('/reports/excel-data', async (c) => {
    need(c, 'reports:read');
    const svc = c.get('svc');
    const { filter, cats, names } = await reportFilter(c);
    const [animals, events] = await Promise.all([svc.animals(), svc.allEvents()]);
    const titleOpts = {
      from: formatDMY(filter.from),
      to: formatDMY(filter.to),
      ...(names.centerName ? { centerName: names.centerName } : {}),
      ...(names.zoneName ? { zoneName: names.zoneName } : {}),
      ...(names.cityName ? { cityName: names.cityName } : {}),
    };
    await svc.audit(c.get('user'), 'export', 'report', 'excel', `Datos de Excel ${filter.from}..${filter.to}`);
    return c.json({
      filter,
      gestion: gestionExcelData(animals, events, cats, filter),
      gestionTitle: gestionExcelTitle(titleOpts),
      gestionHeaders: GESTION_HEADERS,
      census: censusExcelData(animals, groupEventsByAnimal(events), cats, filter),
      censusTitle: censusExcelTitle(titleOpts),
    });
  });

  return r;
}
