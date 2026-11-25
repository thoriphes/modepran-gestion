/** Barras agrupadas de entradas y salidas por mes (dashboard). */
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Dashboard } from '@modepran/domain';
import { axisProps, SERIES, tooltipProps, VizStyle } from './chartTheme';

export default function ArrivalsExitsChart({ months, height = 260 }: { months: Dashboard['months']; height?: number }) {
  const data = months.map((m) => ({ label: m.label, Entradas: m.arrivals, Salidas: m.exits }));
  return (
    <div className="viz" role="img" aria-label="Entradas y salidas por mes, últimos 12 meses">
      <VizStyle />
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} barGap={2} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
          <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} {...axisProps} axisLine={false} />
          <Tooltip {...tooltipProps} />
          <Legend iconType="circle" iconSize={8} />
          <Bar dataKey="Entradas" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={18} />
          <Bar dataKey="Salidas" fill={SERIES[1]} radius={[4, 4, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
