import { describe, expect, it } from 'vitest';
import type { CensusExcelData, GestionExcelData, GestionRow } from '@modepran/domain';
import { buildCensusWorkbook, buildGestionWorkbook, GESTION_FIRST_ROW } from '../src/lib/excel';

const row = (name: string, pm: number, ph: number, gm: number, gh: number, om = 0, oh = 0): GestionRow => ({
  subtypeId: name.toLowerCase(),
  name,
  perro: { male: pm, female: ph },
  gato: { male: gm, female: gh },
  otros: { male: om, female: oh },
  unknownGender: 0,
  total: pm + ph + gm + gh + om + oh,
});

const gestion: GestionExcelData = {
  from: '2026-01-01',
  to: '2026-06-30',
  arrivals: {
    rows: [row('Aviso', 3, 2, 5, 4), row('Colonia', 0, 0, 2, 1, 1, 0)],
    totals: { perro: { male: 3, female: 2 }, gato: { male: 7, female: 5 }, otros: { male: 1, female: 0 }, unknownGender: 2, total: 18 },
  },
  exits: { rows: [], totals: { perro: { male: 0, female: 0 }, gato: { male: 0, female: 0 }, otros: { male: 0, female: 0 }, unknownGender: 0, total: 0 } },
};

describe('Excel Informe gestión', () => {
  it('pone valores, fórmulas por fila y SUM en la fila TOTAL', async () => {
    const wb = buildGestionWorkbook(gestion, 'Informe gestión del 01-01-2026 al 30-06-2026');
    const ws = wb.getWorksheet('Entradas')!;
    expect(ws.getCell('A1').value).toBe('Informe gestión del 01-01-2026 al 30-06-2026');
    expect(ws.getCell('B3').value).toBe('Perro Macho');
    const r = GESTION_FIRST_ROW;
    expect(ws.getCell(`A${r}`).value).toBe('Aviso');
    expect(ws.getCell(`B${r}`).value).toBe(3);
    expect(ws.getCell(`H${r}`).value).toEqual({ formula: `B${r}+C${r}`, result: 5 });
    expect(ws.getCell(`K${r}`).value).toEqual({ formula: `B${r}+D${r}+F${r}`, result: 8 });
    expect(ws.getCell(`M${r}`).value).toEqual({ formula: `SUM(B${r}:G${r})`, result: 14 });
    const t = r + 2;
    expect(ws.getCell(`A${t}`).value).toBe('TOTAL');
    expect(ws.getCell(`B${t}`).value).toEqual({ formula: `SUM(B${r}:B${r + 1})`, result: 3 });
    expect(ws.getCell(`M${t}`).value).toEqual({ formula: `SUM(M${r}:M${r + 1})`, result: 18 });
    expect(String(ws.getCell(`A${t + 2}`).value)).toContain('2 animal');
    // Hoja de salidas vacía: TOTAL = 0 sin fórmula de rango vacío.
    const ex = wb.getWorksheet('Salidas')!;
    expect(ex.getCell(`A${r}`).value).toBe('TOTAL');
    expect(ex.getCell(`B${r}`).value).toBe(0);
    const buf = await wb.xlsx.writeBuffer();
    expect(buf.byteLength).toBeGreaterThan(1000);
  });
});

const census: CensusExcelData = {
  from: '2026-01-01',
  to: '2026-06-30',
  initial: { date: '2026-01-01', shelter: 40, host: 10, total: 50 },
  arrivals: [
    { subtypeId: 'aviso', name: 'Aviso', count: 12 },
    { subtypeId: 'colonia', name: 'Colonia', count: 3 },
  ],
  exits: [{ subtypeId: 'adopcion', name: 'Adopción', count: 9 }],
  final: { date: '2026-06-30', shelter: 44, host: 11, total: 55 },
  arrivalsTotal: 15,
  exitsTotal: 9,
};

describe('Excel Censo', () => {
  it('inicial + entradas − salidas por fórmula y final real al lado', async () => {
    const { workbook, layout } = buildCensusWorkbook(census, 'Censo de 01-01-2026 hasta 30-06-2026');
    const ws = workbook.getWorksheet('Censo')!;
    expect(ws.getCell('A3').value).toBe('CENSO INICIAL (01-01-2026)');
    expect(ws.getCell(layout.initialTotalCell).value).toEqual({ formula: 'B4+B5', result: 50 });
    expect((ws.getCell(layout.arrivalsTotalCell).value as { result: number }).result).toBe(15);
    expect((ws.getCell(layout.arrivalsTotalCell).value as { formula: string }).formula).toMatch(/^SUM\(B\d+:B\d+\)$/);
    expect((ws.getCell(layout.exitsTotalCell).value as { result: number }).result).toBe(9);
    expect(ws.getCell(layout.finalFormulaCell).value).toEqual({
      formula: `${layout.initialTotalCell}+${layout.arrivalsTotalCell}-${layout.exitsTotalCell}`,
      result: 56,
    });
    expect((ws.getCell(layout.finalRealCell).value as { result: number }).result).toBe(55);
    const buf = await workbook.xlsx.writeBuffer();
    expect(buf.byteLength).toBeGreaterThan(1000);
  });
});
