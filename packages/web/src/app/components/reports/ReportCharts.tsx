/** Gráficos de la pantalla de informes (recharts). Un eje por gráfico; especies plegadas en "Otros". */
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { BySpeciesSexReport, BySubtypeReport, MonthlyCensusReport } from '@modepran/domain';
import { axisProps, foldSeries, SERIES, SERIES_OTHER, tooltipProps, VizStyle } from './chartTheme';

type NameOf = (id: string) => string;

interface SeriesDef {
  key: string;
  name: string;
  color: string;
}

function speciesSeries(ids: string[], nameOf: NameOf): { defs: SeriesDef[]; other: string[] } {
  const { shown, other } = foldSeries(ids);
  const defs = shown.map((id, i) => ({ key: id, name: nameOf(id), color: SERIES[i] ?? SERIES_OTHER }));
  if (other.length) defs.push({ key: '__other', name: 'Otros', color: SERIES_OTHER });
  return { defs, other };
}

/** Censo a fin de cada mes, barras apiladas por especie + línea "en acogida" (incluidos en el total). */
export function CensusChart({ report, nameOf }: { report: MonthlyCensusReport; nameOf: NameOf }) {
  const { defs, other } = speciesSeries(
    report.species.map((s) => s.speciesId),
    nameOf,
  );
  const data = report.rows.map((r, i) => {
    const row: Record<string, number | string> = { label: report.monthLabels[i] ?? r.month, 'En acogida': r.totalHost };
    for (const d of defs) if (d.key !== '__other') row[d.key] = r.bySpecies[d.key]?.total ?? 0;
    if (other.length) row.__other = other.reduce((s, id) => s + (r.bySpecies[id]?.total ?? 0), 0);
    return row;
  });
  return (
    <div className="viz" role="img" aria-label="Censo mensual por especie">
      <VizStyle />
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
          <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} {...axisProps} axisLine={false} />
          <Tooltip {...tooltipProps} />
          <Legend iconType="circle" iconSize={8} />
          {defs.map((d, i) => (
            <Bar
              key={d.key}
              dataKey={d.key}
              name={d.name}
              stackId="s"
              fill={d.color}
              stroke="var(--viz-surface)"
              strokeWidth={1}
              maxBarSize={28}
              {...(i === defs.length - 1 ? { radius: [4, 4, 0, 0] as [number, number, number, number] } : {})}
            />
          ))}
          <Line dataKey="En acogida" stroke="var(--viz-text)" strokeWidth={2} strokeDasharray="4 3" dot={{ r: 3 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Llegadas o salidas por mes, apiladas por especie. */
export function SpeciesMonthChart({ report, nameOf, label }: { report: BySpeciesSexReport; nameOf: NameOf; label: string }) {
  const { defs, other } = speciesSeries(
    report.species.map((s) => s.speciesId),
    nameOf,
  );
  const data = report.rows.map((r, i) => {
    const row: Record<string, number | string> = { label: report.monthLabels[i] ?? r.month };
    for (const d of defs) if (d.key !== '__other') row[d.key] = r.bySpecies[d.key]?.total ?? 0;
    if (other.length) row.__other = other.reduce((s, id) => s + (r.bySpecies[id]?.total ?? 0), 0);
    return row;
  });
  return (
    <div className="viz" role="img" aria-label={`${label} por mes y especie`}>
      <VizStyle />
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
          <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} {...axisProps} axisLine={false} />
          <Tooltip {...tooltipProps} />
          <Legend iconType="circle" iconSize={8} />
          {defs.map((d, i) => (
            <Bar
              key={d.key}
              dataKey={d.key}
              name={d.name}
              stackId="s"
              fill={d.color}
              stroke="var(--viz-surface)"
              strokeWidth={1}
              maxBarSize={24}
              {...(i === defs.length - 1 ? { radius: [4, 4, 0, 0] as [number, number, number, number] } : {})}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Totales por subtipo (una serie, barras horizontales). */
export function SubtypeBars({ report, nameOf, label }: { report: BySubtypeReport; nameOf: NameOf; label: string }) {
  const data = report.subtypes.map((s) => ({ name: nameOf(s.subtypeId), total: s.total }));
  const height = Math.max(120, data.length * 28 + 30);
  return (
    <div className="viz" role="img" aria-label={`${label} por subtipo`}>
      <VizStyle />
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 0, left: 8 }}>
          <CartesianGrid horizontal={false} stroke="var(--viz-grid)" />
          <XAxis type="number" allowDecimals={false} {...axisProps} />
          <YAxis type="category" dataKey="name" width={150} {...axisProps} axisLine={false} />
          <Tooltip {...tooltipProps} />
          <Bar dataKey="total" name={label} fill={SERIES[0]} radius={[0, 4, 4, 0]} maxBarSize={18} label={{ position: 'right', fill: 'var(--viz-muted)', fontSize: 11 }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
