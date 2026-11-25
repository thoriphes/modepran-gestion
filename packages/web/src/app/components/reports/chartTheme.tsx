/**
 * Tokens de los gráficos (paleta categórica de referencia de la skill dataviz, validada en claro y
 * oscuro). Orden fijo: el color sigue a la entidad, nunca al rango. Más de 4 series → "Otros".
 * El modo oscuro de la app es la clase `.dark` en <html>.
 */
export const VIZ_CSS = `
.viz {
  --viz-surface: #ffffff;
  --viz-text: #1c1917;
  --viz-muted: #78716c;
  --viz-grid: #e7e5e4;
  --series-1: #2a78d6;
  --series-2: #eb6834;
  --series-3: #1baf7a;
  --series-4: #eda100;
  --series-other: #a8a29e;
}
.dark .viz {
  --viz-surface: #1c1917;
  --viz-text: #f5f5f4;
  --viz-muted: #a8a29e;
  --viz-grid: #292524;
  --series-1: #3987e5;
  --series-2: #d95926;
  --series-3: #199e70;
  --series-4: #c98500;
  --series-other: #78716c;
}
.viz .recharts-cartesian-axis-tick-value { fill: var(--viz-muted); font-size: 12px; }
.viz .recharts-legend-item-text { color: var(--viz-text) !important; font-size: 12px; }
`;

export function VizStyle() {
  return <style>{VIZ_CSS}</style>;
}

export const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)'] as const;
export const SERIES_OTHER = 'var(--series-other)';

export const tooltipProps = {
  contentStyle: {
    background: 'var(--viz-surface)',
    border: '1px solid var(--viz-grid)',
    borderRadius: 8,
    color: 'var(--viz-text)',
    fontSize: 12,
  },
  labelStyle: { color: 'var(--viz-text)', fontWeight: 600 },
  itemStyle: { color: 'var(--viz-text)' },
  cursor: { fill: 'var(--viz-grid)', fillOpacity: 0.5 },
};

export const axisProps = {
  stroke: 'var(--viz-grid)',
  tickLine: false,
  tick: { fill: 'var(--viz-muted)', fontSize: 12 },
};

/**
 * Agrupa series: las `max` primeras (ya ordenadas de más a menos) conservan su color por posición en
 * `order` (orden estable por id), el resto se suma en "Otros".
 */
export function foldSeries(ids: string[], max = 3): { shown: string[]; other: string[] } {
  if (ids.length <= max + 1) return { shown: ids, other: [] };
  return { shown: ids.slice(0, max), other: ids.slice(max) };
}
