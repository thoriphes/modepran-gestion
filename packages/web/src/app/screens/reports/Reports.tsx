/** Informes: filtros, gráficos (censo, llegadas/salidas por especie×sexo y por subtipo) y Excel. */
import { useMemo, useState } from 'react';
import {
  censusExcelTitle,
  defaultReportRange,
  formatDMY,
  gestionExcelTitle,
  todayMadrid,
  type BySpeciesSexReport,
  type BySubtypeReport,
  type MonthlyCensusReport,
} from '@modepran/domain';
import { errorMessage, type ReportQuery } from '../../../lib/api';
import { downloadBlob, safeFilename } from '../../../lib/format';
import { CensusChart, SpeciesMonthChart, SubtypeBars } from '../../components/reports/ReportCharts';
import { options, useAsync, useSession } from '../../context';
import { RequirePerm } from '../../Layout';
import { Button, Card, Empty, ErrorBox, Loading, Notice, PageHeader, Select, TextInput } from '../../ui';

export default function Reports() {
  return (
    <RequirePerm perm="reports:read">
      <ReportsInner />
    </RequirePerm>
  );
}

function ReportsInner() {
  const s = useSession();
  const { api, catalogs, name } = s;
  const [draft, setDraft] = useState<ReportQuery>(() => defaultReportRange(todayMadrid()));
  const [query, setQuery] = useState<ReportQuery>(draft);
  const [excelBusy, setExcelBusy] = useState<'gestion' | 'censo' | null>(null);
  const [excelError, setExcelError] = useState<string>();

  const summary = useAsync(() => api.reports.summary(query), [api, query.from, query.to, query.zoneId, query.cityId, query.centerId]);

  const cityOptions = useMemo(() => {
    const zone = catalogs.zones.find((z) => z.id === draft.zoneId);
    const cities = zone ? catalogs.cities.filter((c) => zone.cityIds.includes(c.id)) : catalogs.cities;
    return options(cities);
  }, [catalogs, draft.zoneId]);

  const invalid = !draft.from || !draft.to || draft.from > draft.to;
  const titleOpts = {
    from: formatDMY(query.from),
    to: formatDMY(query.to),
    ...(query.centerId ? { centerName: name('centers', query.centerId) } : {}),
    ...(query.zoneId ? { zoneName: name('zones', query.zoneId) } : {}),
    ...(query.cityId ? { cityName: name('cities', query.cityId) } : {}),
  };

  async function excel(kind: 'gestion' | 'censo') {
    setExcelBusy(kind);
    setExcelError(undefined);
    try {
      const [data, xl] = await Promise.all([api.reports.excelData(query), import('../../../lib/excel')]);
      if (kind === 'gestion') {
        const title = gestionExcelTitle(titleOpts);
        downloadBlob(await xl.workbookToBlob(xl.buildGestionWorkbook(data.gestion, title)), `${safeFilename(title)}.xlsx`);
      } else {
        const title = censusExcelTitle(titleOpts);
        downloadBlob(await xl.workbookToBlob(xl.buildCensusWorkbook(data.census, title).workbook), `${safeFilename(title)}.xlsx`);
      }
    } catch (e) {
      setExcelError(errorMessage(e));
    } finally {
      setExcelBusy(null);
    }
  }

  const nameSpecies = (id: string) => name('species', id);
  const nameSubtype = (id: string) => name('subtypes', id);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Informes"
        subtitle={`Del ${formatDMY(query.from)} al ${formatDMY(query.to)}`}
        actions={
          <>
            <Button onClick={() => void excel('gestion')} loading={excelBusy === 'gestion'} disabled={!!excelBusy}>
              ⬇ Excel Informe gestión
            </Button>
            <Button onClick={() => void excel('censo')} loading={excelBusy === 'censo'} disabled={!!excelBusy}>
              ⬇ Excel Censo
            </Button>
          </>
        }
      />
      {excelError && <ErrorBox error={new Error(excelError)} />}

      <Card>
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (!invalid) setQuery(draft);
          }}
        >
          <TextInput label="Desde" type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} required />
          <TextInput label="Hasta" type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} required error={invalid && draft.from && draft.to ? 'Debe ser posterior a "desde"' : undefined} />
          <Select
            label="Zona"
            placeholder="Todas"
            options={options(catalogs.zones)}
            value={draft.zoneId ?? ''}
            onChange={(e) => setDraft(withOpt({ ...draft, cityId: undefined }, 'zoneId', e.target.value))}
          />
          <Select label="Ciudad" placeholder="Todas" options={cityOptions} value={draft.cityId ?? ''} onChange={(e) => setDraft(withOpt(draft, 'cityId', e.target.value))} />
          <Select label="Centro" placeholder="Todos" options={options(catalogs.centers)} value={draft.centerId ?? ''} onChange={(e) => setDraft(withOpt(draft, 'centerId', e.target.value))} />
          <div className="flex items-end gap-2">
            <Button type="submit" variant="primary" disabled={invalid} className="flex-1">
              Aplicar
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                const d = defaultReportRange(todayMadrid());
                setDraft(d);
                setQuery(d);
              }}
            >
              Limpiar
            </Button>
          </div>
        </form>
      </Card>

      {summary.loading && <Loading label="Calculando informes…" />}
      {!!summary.error && <ErrorBox error={summary.error} onRetry={summary.reload} />}
      {summary.data && (
        <>
          <Card title="Censo a fin de mes">
            {summary.data.census.rows.length ? (
              <>
                <CensusChart report={summary.data.census} nameOf={nameSpecies} />
                <CensusTable report={summary.data.census} nameOf={nameSpecies} />
              </>
            ) : (
              <Empty title="Sin datos en el rango" />
            )}
          </Card>
          <div className="grid gap-4 xl:grid-cols-2">
            <SpeciesSexCard title="Llegadas" report={summary.data.arrivals} nameOf={nameSpecies} />
            <SpeciesSexCard title="Salidas" report={summary.data.exits} nameOf={nameSpecies} />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <SubtypeCard title="Llegadas por subtipo" report={summary.data.arrivalsBySubtype} nameSubtype={nameSubtype} nameSpecies={nameSpecies} />
            <SubtypeCard title="Salidas por subtipo" report={summary.data.exitsBySubtype} nameSubtype={nameSubtype} nameSpecies={nameSpecies} />
          </div>
          <Notice>
            El Excel "Informe gestión" cuenta en salidas solo la última salida de cada animal, sin los que han vuelto a estar disponibles o en acogida; por eso puede no coincidir con
            las salidas de esta pantalla.
          </Notice>
        </>
      )}
    </div>
  );
}

function withOpt<K extends 'zoneId' | 'cityId' | 'centerId'>(q: ReportQuery, key: K, v: string): ReportQuery {
  const out = { ...q };
  if (v) out[key] = v;
  else delete out[key];
  return out;
}

function CensusTable({ report, nameOf }: { report: MonthlyCensusReport; nameOf: (id: string) => string }) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-sm text-stone-600 dark:text-stone-400">Ver tabla</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="table-dense">
          <thead>
            <tr>
              <th>Mes</th>
              {report.species.map((s) => (
                <th key={s.speciesId} className="text-right">
                  {nameOf(s.speciesId)}
                </th>
              ))}
              <th className="text-right">Total</th>
              <th className="text-right">De ellos en acogida</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((r, i) => (
              <tr key={r.month}>
                <td>{report.monthLabels[i]}</td>
                {report.species.map((s) => (
                  <td key={s.speciesId} className="text-right tabular-nums">
                    {r.bySpecies[s.speciesId]?.total ?? 0}
                  </td>
                ))}
                <td className="text-right font-semibold tabular-nums">{r.total}</td>
                <td className="text-right tabular-nums">{r.totalHost}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function SpeciesSexCard({ title, report, nameOf }: { title: string; report: BySpeciesSexReport; nameOf: (id: string) => string }) {
  const totals = report.species.map((s) => {
    const t = { male: 0, female: 0, none: 0, total: 0 };
    for (const r of report.rows) {
      const g = r.bySpecies[s.speciesId];
      if (!g) continue;
      t.male += g.male;
      t.female += g.female;
      t.none += g.none;
      t.total += g.total;
    }
    return { id: s.speciesId, ...t };
  });
  return (
    <Card title={`${title} (${report.total})`}>
      {report.total === 0 ? (
        <Empty title={`Sin ${title.toLowerCase()} en el rango`} />
      ) : (
        <>
          <SpeciesMonthChart report={report} nameOf={nameOf} label={title} />
          <div className="mt-3 overflow-x-auto">
            <table className="table-dense">
              <thead>
                <tr>
                  <th>Especie</th>
                  <th className="text-right">Machos</th>
                  <th className="text-right">Hembras</th>
                  <th className="text-right">Sin sexo</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {totals.map((t) => (
                  <tr key={t.id}>
                    <td>{nameOf(t.id)}</td>
                    <td className="text-right tabular-nums">{t.male}</td>
                    <td className="text-right tabular-nums">{t.female}</td>
                    <td className="text-right tabular-nums">{t.none}</td>
                    <td className="text-right font-semibold tabular-nums">{t.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <MonthSexTable report={report} nameOf={nameOf} />
        </>
      )}
    </Card>
  );
}

function MonthSexTable({ report, nameOf }: { report: BySpeciesSexReport; nameOf: (id: string) => string }) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-sm text-stone-600 dark:text-stone-400">Ver por mes (M / H)</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="table-dense">
          <thead>
            <tr>
              <th>Mes</th>
              {report.species.map((s) => (
                <th key={s.speciesId} className="text-right">
                  {nameOf(s.speciesId)}
                </th>
              ))}
              <th className="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((r, i) => (
              <tr key={r.month}>
                <td>{report.monthLabels[i]}</td>
                {report.species.map((s) => {
                  const g = r.bySpecies[s.speciesId];
                  return (
                    <td key={s.speciesId} className="text-right tabular-nums" title="Machos / Hembras">
                      {g ? `${g.male} / ${g.female}` : '0 / 0'}
                      {g?.none ? ` (+${g.none})` : ''}
                    </td>
                  );
                })}
                <td className="text-right font-semibold tabular-nums">{r.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function SubtypeCard({ title, report, nameSubtype, nameSpecies }: { title: string; report: BySubtypeReport; nameSubtype: (id: string) => string; nameSpecies: (id: string) => string }) {
  // Totales por subtipo × especie (sumando meses).
  const cells = new Map<string, Record<string, number>>();
  for (const r of report.rows)
    for (const [sub, v] of Object.entries(r.bySubtype)) {
      const m = cells.get(sub) ?? {};
      for (const [sp, n] of Object.entries(v.bySpecies)) m[sp] = (m[sp] ?? 0) + n;
      cells.set(sub, m);
    }
  return (
    <Card title={`${title} (${report.total})`}>
      {report.total === 0 ? (
        <Empty title="Sin datos en el rango" />
      ) : (
        <>
          <SubtypeBars report={report} nameOf={nameSubtype} label={title} />
          <div className="mt-3 overflow-x-auto">
            <table className="table-dense">
              <thead>
                <tr>
                  <th>Subtipo</th>
                  {report.species.map((s) => (
                    <th key={s.speciesId} className="text-right">
                      {nameSpecies(s.speciesId)}
                    </th>
                  ))}
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {report.subtypes.map((s) => (
                  <tr key={s.subtypeId}>
                    <td>{nameSubtype(s.subtypeId)}</td>
                    {report.species.map((sp) => (
                      <td key={sp.speciesId} className="text-right tabular-nums">
                        {cells.get(s.subtypeId)?.[sp.speciesId] ?? 0}
                      </td>
                    ))}
                    <td className="text-right font-semibold tabular-nums">{s.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}
