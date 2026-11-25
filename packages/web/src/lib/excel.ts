/**
 * Excel "Informe gestión" y "Censo" generados en el navegador con exceljs (spec §6).
 * Los datos ya vienen calculados por la API (`GET /reports/excel-data`, funciones `gestionExcelData` /
 * `censusExcelData` del dominio); aquí solo se maquetan. Totales como fórmulas (con su resultado
 * precalculado, para visores que no recalculan).
 *
 * Importar este módulo con `import()` dinámico desde la pantalla: exceljs pesa ~1 MB.
 */
import ExcelJS from 'exceljs';
import { formatDMY, GESTION_HEADERS, type CensusExcelData, type GestionExcelData, type GestionTable } from '@modepran/domain';

const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4C9AB' } };
const TOTAL_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };
const THIN: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFBBBBBB' } },
  bottom: { style: 'thin', color: { argb: 'FFBBBBBB' } },
  left: { style: 'thin', color: { argb: 'FFBBBBBB' } },
  right: { style: 'thin', color: { argb: 'FFBBBBBB' } },
};

const f = (formula: string, result: number): ExcelJS.CellFormulaValue => ({ formula, result });

/** Primera fila de datos de cada hoja de gestión (1 título, 2 subtítulo, 3 cabeceras). */
export const GESTION_FIRST_ROW = 4;

function gestionSheet(wb: ExcelJS.Workbook, name: string, title: string, table: GestionTable): void {
  const ws = wb.addWorksheet(name);
  ws.columns = GESTION_HEADERS.map((_, i) => ({ width: i === 0 ? 38 : 13 }));
  ws.getCell('A1').value = title;
  ws.getCell('A1').font = { bold: true, size: 14 };
  ws.mergeCells(1, 1, 1, GESTION_HEADERS.length);
  ws.getCell('A2').value = name;
  ws.getCell('A2').font = { bold: true, size: 12 };

  const header = ws.getRow(3);
  GESTION_HEADERS.forEach((h, i) => {
    const c = header.getCell(i + 1);
    c.value = h;
    c.font = { bold: true };
    c.fill = HEADER_FILL;
    c.border = THIN;
    c.alignment = { horizontal: i === 0 ? 'left' : 'center', vertical: 'middle', wrapText: true };
  });

  let r = GESTION_FIRST_ROW;
  for (const row of table.rows) {
    const vals = [row.perro.male, row.perro.female, row.gato.male, row.gato.female, row.otros.male, row.otros.female];
    writeGestionRow(ws, r, row.name, vals, false);
    r++;
  }
  const last = r - 1;
  // Fila TOTAL: =SUM por columna (B..M).
  const t = ws.getRow(r);
  t.getCell(1).value = 'TOTAL';
  const totalsVals = [
    table.totals.perro.male,
    table.totals.perro.female,
    table.totals.gato.male,
    table.totals.gato.female,
    table.totals.otros.male,
    table.totals.otros.female,
  ];
  const derived = derivedTotals(totalsVals);
  const all = [...totalsVals, ...derived];
  for (let i = 0; i < 12; i++) {
    const col = colLetter(i + 2);
    t.getCell(i + 2).value = table.rows.length ? f(`SUM(${col}${GESTION_FIRST_ROW}:${col}${last})`, all[i]!) : 0;
  }
  styleRow(t, true);

  if (table.totals.unknownGender > 0) {
    const n = ws.getCell(`A${r + 2}`);
    n.value = `Nota: ${table.totals.unknownGender} animal(es) sin sexo indicado no aparecen en las columnas.`;
    n.font = { italic: true, color: { argb: 'FF7D311E' } };
  }
  ws.views = [{ state: 'frozen', ySplit: 3, xSplit: 1 }];
}

function derivedTotals(v: number[]): number[] {
  const [pm, ph, gm, gh, om, oh] = v as [number, number, number, number, number, number];
  return [pm + ph, gm + gh, om + oh, pm + gm + om, ph + gh + oh, pm + ph + gm + gh + om + oh];
}

function writeGestionRow(ws: ExcelJS.Worksheet, r: number, label: string, vals: number[], bold: boolean): void {
  const row = ws.getRow(r);
  row.getCell(1).value = label;
  vals.forEach((v, i) => (row.getCell(i + 2).value = v));
  const d = derivedTotals(vals);
  row.getCell(8).value = f(`B${r}+C${r}`, d[0]!); // Total Perros
  row.getCell(9).value = f(`D${r}+E${r}`, d[1]!); // Total Gatos
  row.getCell(10).value = f(`F${r}+G${r}`, d[2]!); // Total Otros
  row.getCell(11).value = f(`B${r}+D${r}+F${r}`, d[3]!); // Total Machos
  row.getCell(12).value = f(`C${r}+E${r}+G${r}`, d[4]!); // Total Hembras
  row.getCell(13).value = f(`SUM(B${r}:G${r})`, d[5]!); // Total
  styleRow(row, bold);
}

function styleRow(row: ExcelJS.Row, total: boolean): void {
  for (let i = 1; i <= GESTION_HEADERS.length; i++) {
    const c = row.getCell(i);
    c.border = THIN;
    if (i > 1) c.alignment = { horizontal: 'center' };
    if (total || i >= 8) c.font = { bold: true };
    if (total) c.fill = TOTAL_FILL;
  }
}

function colLetter(n: number): string {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function newWorkbook(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Modepran Gestión';
  wb.created = new Date();
  return wb;
}

/** Excel "Informe gestión": hojas Entradas y Salidas. */
export function buildGestionWorkbook(data: GestionExcelData, title: string): ExcelJS.Workbook {
  const wb = newWorkbook();
  gestionSheet(wb, 'Entradas', title, data.arrivals);
  gestionSheet(wb, 'Salidas', title, data.exits);
  return wb;
}

/** Celdas clave del Excel de censo (para tests y para cuadrar). */
export interface CensusLayout {
  initialTotalCell: string;
  arrivalsTotalCell: string;
  exitsTotalCell: string;
  finalFormulaCell: string;
  finalRealCell: string;
}

/** Excel "Censo": inicial (refugio + acogida) + entradas − salidas = final (fórmula) y final real al lado. */
export function buildCensusWorkbook(data: CensusExcelData, title: string): { workbook: ExcelJS.Workbook; layout: CensusLayout } {
  const wb = newWorkbook();
  const ws = wb.addWorksheet('Censo');
  ws.columns = [{ width: 42 }, { width: 14 }, { width: 4 }, { width: 30 }, { width: 14 }];
  ws.getCell('A1').value = title;
  ws.getCell('A1').font = { bold: true, size: 14 };
  ws.mergeCells('A1:E1');

  const section = (r: number, text: string) => {
    const c = ws.getCell(`A${r}`);
    c.value = text;
    c.font = { bold: true };
    c.fill = HEADER_FILL;
    ws.getCell(`B${r}`).fill = HEADER_FILL;
  };
  const line = (r: number, label: string, value: ExcelJS.CellValue, bold = false) => {
    ws.getCell(`A${r}`).value = label;
    ws.getCell(`B${r}`).value = value;
    for (const k of ['A', 'B']) {
      const c = ws.getCell(`${k}${r}`);
      c.border = THIN;
      if (bold) {
        c.font = { bold: true };
        c.fill = TOTAL_FILL;
      }
    }
  };

  let r = 3;
  section(r++, `CENSO INICIAL (${formatDMY(data.initial.date)})`);
  line(r, 'REFUGIO', data.initial.shelter);
  line(r + 1, 'ACOGIDA', data.initial.host);
  line(r + 2, 'TOTAL INICIAL', f(`B${r}+B${r + 1}`, data.initial.shelter + data.initial.host), true);
  const initialTotalCell = `B${r + 2}`;
  r += 4;

  const block = (label: string, totalLabel: string, rows: CensusExcelData['arrivals'], total: number) => {
    section(r++, label);
    const first = r;
    for (const x of rows) line(r++, x.name, x.count);
    line(r, totalLabel, rows.length ? f(`SUM(B${first}:B${r - 1})`, total) : 0, true);
    const cell = `B${r}`;
    r += 2;
    return cell;
  };
  const arrivalsTotalCell = block('+ ENTRADAS', 'TOTAL ENTRADAS', data.arrivals, data.arrivalsTotal);
  const exitsTotalCell = block('− SALIDAS', 'TOTAL SALIDAS', data.exits, data.exitsTotal);

  section(r++, `CENSO FINAL (${formatDMY(data.final.date)})`);
  const computed = data.initial.total + data.arrivalsTotal - data.exitsTotal;
  line(r, 'TOTAL FINAL (inicial + entradas − salidas)', f(`${initialTotalCell}+${arrivalsTotalCell}-${exitsTotalCell}`, computed), true);
  const finalFormulaCell = `B${r}`;
  // Final real (censo calculado por el servidor): no siempre cuadra (avisos de cadáver, etc.).
  ws.getCell(`D${r - 1}`).value = 'Censo real al final';
  ws.getCell(`D${r - 1}`).font = { bold: true };
  ws.getCell(`D${r}`).value = 'REFUGIO';
  ws.getCell(`E${r}`).value = data.final.shelter;
  ws.getCell(`D${r + 1}`).value = 'ACOGIDA';
  ws.getCell(`E${r + 1}`).value = data.final.host;
  ws.getCell(`D${r + 2}`).value = 'TOTAL';
  ws.getCell(`E${r + 2}`).value = f(`E${r}+E${r + 1}`, data.final.shelter + data.final.host);
  ws.getCell(`D${r + 2}`).font = { bold: true };
  ws.getCell(`E${r + 2}`).font = { bold: true };
  const finalRealCell = `E${r + 2}`;
  for (let i = 0; i < 3; i++) for (const k of ['D', 'E']) ws.getCell(`${k}${r + i}`).border = THIN;
  ws.getCell(`D${r + 4}`).value = 'Diferencia (real − fórmula)';
  ws.getCell(`E${r + 4}`).value = f(`${finalRealCell}-${finalFormulaCell}`, data.final.total - computed);

  return { workbook: wb, layout: { initialTotalCell, arrivalsTotalCell, exitsTotalCell, finalFormulaCell, finalRealCell } };
}

export async function workbookToBlob(wb: ExcelJS.Workbook): Promise<Blob> {
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
