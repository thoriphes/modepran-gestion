/**
 * Parser streaming de volcados de mysqldump / mariadb-dump.
 *
 * Entiende lo que esos volcados contienen: comentarios (`-- …`, `# …`, `/* … *\/` incluidos los
 * ejecutables `/*!40101 … *\/;`), `CREATE TABLE` (nombres de columnas y `AUTO_INCREMENT`), y
 * `INSERT [IGNORE] INTO` / `REPLACE INTO` con o sin lista de columnas y con varias tuplas
 * `(…),(…);` repartidas en una o varias líneas. El resto de sentencias (`DROP`, `LOCK`, `SET`…) se saltan.
 *
 * Valores: cadenas con comillas simples o dobles (escapes `\0 \' \" \b \n \r \t \Z \\` y comilla
 * doblada), `NULL`, números, `_binary '…'` / `_utf8mb4 '…'` (se devuelven como texto), `0x…` y
 * `X'…'` (bytes) y `b'…'` (número).
 *
 * Es incremental: `push()` acepta trozos de cualquier tamaño (cortes en mitad de una cadena o de un
 * escape incluidos) y emite cada fila en cuanto está completa, así que la memoria no depende del tamaño
 * de cada `INSERT`.
 */
import { createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';

export type SqlValue = string | number | null | Uint8Array;
export type SqlRow = Record<string, SqlValue>;

export interface TableSchema {
  table: string;
  columns: string[];
  autoIncrement?: number;
}

export interface DumpHandlers {
  onTable?(schema: TableSchema): void;
  /** `columns` = lista del INSERT si la trae, si no la del CREATE TABLE (o `undefined` si no se vio). */
  onRow?(table: string, values: SqlValue[], columns: string[] | undefined): void;
}

export class SqlParseError extends Error {
  constructor(message: string, readonly offset: number) {
    super(`${message} (offset ${offset})`);
    this.name = 'SqlParseError';
  }
}

const NEED_MORE = Symbol('need-more');

const ESCAPES: Record<string, string> = {
  '0': '\0',
  "'": "'",
  '"': '"',
  b: '\b',
  n: '\n',
  r: '\r',
  t: '\t',
  Z: '\x1a',
  '\\': '\\',
  // MySQL conserva la barra en \% y \_ (son escapes de LIKE).
  '%': '\\%',
  _: '\\_',
};

const INSERT_HEAD_RE =
  /(?:INSERT(?:\s+(?:LOW_PRIORITY|DELAYED|HIGH_PRIORITY|IGNORE))*|REPLACE(?:\s+(?:LOW_PRIORITY|DELAYED))*)\s+(?:INTO\s+)?((?:`(?:[^`]|``)+`|[A-Za-z0-9_$.]+)(?:\s*\.\s*(?:`(?:[^`]|``)+`|[A-Za-z0-9_$]+))?)\s*(\((?:[^()'"]|`[^`]*`)*\))?\s*VALUES\s*/iy;
const NUMBER_RE = /-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?/y;
const WS_RE = /[ \t\r\n\f\v]/;
/** Lo máximo que puede ocupar la cabecera de un INSERT (hasta `VALUES`). */
const MAX_HEADER = 1 << 20;

type State =
  | { kind: 'top' }
  | { kind: 'values'; table: string; columns: string[] | undefined; afterTuple: boolean };

export class SqlDumpParser {
  private buf = '';
  private pos = 0;
  /** Desplazamiento absoluto de `buf[0]` (para los mensajes de error). */
  private base = 0;
  private state: State = { kind: 'top' };
  private final = false;
  private readonly schemas = new Map<string, TableSchema>();

  constructor(private readonly handlers: DumpHandlers = {}) {}

  schema(table: string): TableSchema | undefined {
    return this.schemas.get(table);
  }

  push(chunk: string): void {
    if (this.final) throw new Error('push() después de end()');
    if (this.pos > 0) {
      this.base += this.pos;
      this.buf = this.buf.slice(this.pos);
      this.pos = 0;
    }
    this.buf += chunk;
    this.run();
  }

  end(): void {
    this.final = true;
    this.run();
    this.skipWsAndComments();
    if (this.state.kind !== 'top') throw this.error('El volcado termina en mitad de un INSERT');
    if (this.pos < this.buf.length) throw this.error('Sentencia incompleta al final del volcado');
  }

  // -------------------------------------------------------------------------

  private error(message: string): SqlParseError {
    return new SqlParseError(message, this.base + this.pos);
  }

  private run(): void {
    for (;;) {
      const checkpoint = this.pos;
      try {
        if (!this.step()) return;
      } catch (e) {
        if (e === NEED_MORE) {
          this.pos = checkpoint;
          if (this.final) throw this.error('Datos incompletos al final del volcado');
          return;
        }
        throw e;
      }
    }
  }

  /** Avanza una unidad (sentencia de cabecera o tupla). Devuelve false si no queda nada que hacer. */
  private step(): boolean {
    if (this.state.kind === 'values') return this.stepValues(this.state);
    this.skipWsAndComments();
    if (this.pos >= this.buf.length) return false;
    const c = this.buf[this.pos]!;
    if (c === ';') {
      this.pos++;
      return true;
    }
    const word = this.peekWord();
    if (word === 'INSERT' || word === 'REPLACE') {
      INSERT_HEAD_RE.lastIndex = this.pos;
      const m = INSERT_HEAD_RE.exec(this.buf);
      if (!m) {
        if (!this.final && this.buf.length - this.pos < MAX_HEADER && !this.buf.includes(';', this.pos)) throw NEED_MORE;
        // INSERT … SELECT u otra forma que no lleva datos literales: se salta.
        this.skipStatement();
        return true;
      }
      if (!this.final && INSERT_HEAD_RE.lastIndex >= this.buf.length) throw NEED_MORE;
      const table = unquoteQualified(m[1]!);
      const columns = m[2] ? splitTopLevel(m[2].slice(1, -1)).map((c) => unquoteIdent(c.trim())) : this.schemas.get(table)?.columns;
      this.pos = INSERT_HEAD_RE.lastIndex;
      this.state = { kind: 'values', table, columns, afterTuple: false };
      return true;
    }
    const start = this.pos;
    const end = this.findStatementEnd();
    const stmt = this.buf.slice(start, end);
    this.pos = end + 1;
    if (word === 'CREATE') {
      const schema = parseCreateTable(stmt);
      if (schema) {
        this.schemas.set(schema.table, schema);
        this.handlers.onTable?.(schema);
      }
    }
    return true;
  }

  private stepValues(state: Extract<State, { kind: 'values' }>): boolean {
    this.skipWs();
    if (this.pos >= this.buf.length) throw NEED_MORE;
    const c = this.buf[this.pos]!;
    if (state.afterTuple) {
      if (c === ',') {
        this.pos++;
        state.afterTuple = false;
        return true;
      }
      if (c === ';') {
        this.pos++;
        this.state = { kind: 'top' };
        return true;
      }
      // `ON DUPLICATE KEY UPDATE …` u otra cola: se salta hasta el `;`.
      const end = this.findStatementEnd();
      this.pos = end + 1;
      this.state = { kind: 'top' };
      return true;
    }
    if (c !== '(') throw this.error(`Se esperaba "(" en INSERT INTO ${state.table}`);
    this.pos++;
    const values: SqlValue[] = [];
    for (;;) {
      this.skipWs();
      if (this.pos >= this.buf.length) throw NEED_MORE;
      if (this.buf[this.pos] === ')' && values.length === 0) {
        this.pos++;
        break;
      }
      values.push(this.readValue());
      this.skipWs();
      if (this.pos >= this.buf.length) throw NEED_MORE;
      const sep = this.buf[this.pos]!;
      this.pos++;
      if (sep === ',') continue;
      if (sep === ')') break;
      this.pos--;
      throw this.error(`Se esperaba "," o ")" en INSERT INTO ${state.table}`);
    }
    if (state.columns && state.columns.length !== values.length) {
      throw this.error(`La tupla de ${state.table} tiene ${values.length} valores y la tabla ${state.columns.length} columnas`);
    }
    state.afterTuple = true;
    this.handlers.onRow?.(state.table, values, state.columns);
    return true;
  }

  private readValue(): SqlValue {
    const buf = this.buf;
    const c = buf[this.pos]!;
    if (c === "'" || c === '"') return this.readString();
    if (c === '_') {
      // Introductor de juego de caracteres: _binary '…', _utf8mb4 '…'.
      if (this.pos + 1 >= buf.length) throw NEED_MORE;
      const m = /_[A-Za-z0-9]+\s*/y;
      m.lastIndex = this.pos;
      const r = m.exec(buf);
      if (r && m.lastIndex < buf.length && (buf[m.lastIndex] === "'" || buf[m.lastIndex] === '"')) {
        this.pos = m.lastIndex;
        return this.readString();
      }
      if (r && m.lastIndex >= buf.length) throw NEED_MORE;
      throw this.error('Valor no reconocido');
    }
    if ((c === 'x' || c === 'X' || c === 'b' || c === 'B') && (buf[this.pos + 1] === "'" || this.pos + 1 >= buf.length)) {
      if (this.pos + 1 >= buf.length) throw NEED_MORE;
      this.pos++;
      const s = this.readString();
      return c === 'x' || c === 'X' ? hexToBytes(s) : parseInt(s || '0', 2);
    }
    if (c === '0' && (buf[this.pos + 1] === 'x' || buf[this.pos + 1] === 'X')) {
      const m = /0[xX][0-9A-Fa-f]*/y;
      m.lastIndex = this.pos;
      m.exec(buf);
      if (m.lastIndex >= buf.length) throw NEED_MORE;
      const hex = buf.slice(this.pos + 2, m.lastIndex);
      this.pos = m.lastIndex;
      return hexToBytes(hex);
    }
    const word = this.peekWord();
    if (word !== undefined && /^[A-Za-z]/.test(c)) {
      if (this.pos + word.length >= buf.length) throw NEED_MORE;
      this.pos += word.length;
      if (word === 'NULL') return null;
      if (word === 'TRUE') return 1;
      if (word === 'FALSE') return 0;
      this.pos -= word.length;
      throw this.error(`Valor no reconocido: ${word}`);
    }
    NUMBER_RE.lastIndex = this.pos;
    const m = NUMBER_RE.exec(buf);
    if (!m) {
      if (/^[-.]*$/.test(buf.slice(this.pos, this.pos + 2)) && this.pos + 2 >= buf.length) throw NEED_MORE;
      throw this.error('Valor no reconocido');
    }
    if (NUMBER_RE.lastIndex >= buf.length || (buf.length - NUMBER_RE.lastIndex <= 2 && /^[eE][-+]?$/.test(buf.slice(NUMBER_RE.lastIndex)))) throw NEED_MORE;
    this.pos = NUMBER_RE.lastIndex;
    const text = m[0];
    const n = Number(text);
    if (/^-?\d+$/.test(text) && !Number.isSafeInteger(n)) return text;
    return n;
  }

  private readString(): string {
    const buf = this.buf;
    const quote = buf[this.pos]!;
    let i = this.pos + 1;
    let out = '';
    let segStart = i;
    for (;;) {
      // Busca la siguiente comilla o barra.
      let j = i;
      while (j < buf.length) {
        const ch = buf.charCodeAt(j);
        if (ch === 92 /* \ */ || buf[j] === quote) break;
        j++;
      }
      if (j >= buf.length) throw NEED_MORE;
      if (buf.charCodeAt(j) === 92) {
        if (j + 1 >= buf.length) throw NEED_MORE;
        out += buf.slice(segStart, j);
        const e = buf[j + 1]!;
        out += ESCAPES[e] ?? e;
        i = j + 2;
        segStart = i;
        continue;
      }
      // Comilla: doblada = literal.
      if (j + 1 >= buf.length) throw NEED_MORE;
      if (buf[j + 1] === quote) {
        out += buf.slice(segStart, j) + quote;
        i = j + 2;
        segStart = i;
        continue;
      }
      out += buf.slice(segStart, j);
      this.pos = j + 1;
      return out;
    }
  }

  private peekWord(): string | undefined {
    const m = /[A-Za-z_]+/y;
    m.lastIndex = this.pos;
    const r = m.exec(this.buf);
    if (!r) return undefined;
    if (m.lastIndex >= this.buf.length && !this.final) throw NEED_MORE;
    return r[0].toUpperCase();
  }

  private skipWs(): void {
    while (this.pos < this.buf.length && WS_RE.test(this.buf[this.pos]!)) this.pos++;
  }

  private skipWsAndComments(): void {
    for (;;) {
      this.skipWs();
      const buf = this.buf;
      if (this.pos >= buf.length) return;
      const c = buf[this.pos];
      if (c === '#' || (c === '-' && (buf[this.pos + 1] === '-' || this.pos + 1 >= buf.length))) {
        if (c === '-' && this.pos + 1 >= buf.length) {
          if (this.final) return;
          throw NEED_MORE;
        }
        const nl = buf.indexOf('\n', this.pos);
        if (nl < 0) {
          if (this.final) {
            this.pos = buf.length;
            return;
          }
          throw NEED_MORE;
        }
        this.pos = nl + 1;
        continue;
      }
      if (c === '/' && (buf[this.pos + 1] === '*' || this.pos + 1 >= buf.length)) {
        if (this.pos + 1 >= buf.length) {
          if (this.final) return;
          throw NEED_MORE;
        }
        const end = buf.indexOf('*/', this.pos + 2);
        if (end < 0) throw NEED_MORE;
        this.pos = end + 2;
        continue;
      }
      return;
    }
  }

  /** Índice del `;` que cierra la sentencia actual (fuera de comillas y comentarios). */
  private findStatementEnd(): number {
    const buf = this.buf;
    let i = this.pos;
    while (i < buf.length) {
      const c = buf[i]!;
      if (c === ';') return i;
      if (c === "'" || c === '"' || c === '`') {
        i = skipQuoted(buf, i);
        if (i < 0) throw NEED_MORE;
        continue;
      }
      if (c === '/' && buf[i + 1] === '*') {
        const end = buf.indexOf('*/', i + 2);
        if (end < 0) throw NEED_MORE;
        i = end + 2;
        continue;
      }
      i++;
    }
    throw NEED_MORE;
  }

  private skipStatement(): void {
    this.pos = this.findStatementEnd() + 1;
  }
}

/** Devuelve el índice siguiente a la comilla de cierre, o -1 si no está en el buffer. */
function skipQuoted(buf: string, start: number): number {
  const q = buf[start]!;
  let i = start + 1;
  while (i < buf.length) {
    const c = buf[i]!;
    if (c === '\\' && q !== '`') {
      i += 2;
      continue;
    }
    if (c === q) {
      if (buf[i + 1] === q) {
        i += 2;
        continue;
      }
      return i + 1;
    }
    i++;
  }
  return -1;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.length % 2 ? `0${hex}` : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function unquoteIdent(id: string): string {
  const t = id.trim();
  if (t.startsWith('`') && t.endsWith('`')) return t.slice(1, -1).replace(/``/g, '`');
  if (t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1);
  return t;
}

/** `db`.`tabla` → tabla. */
function unquoteQualified(id: string): string {
  const parts = splitQualified(id);
  return unquoteIdent(parts[parts.length - 1]!);
}

function splitQualified(id: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < id.length; i++) {
    const c = id[i]!;
    if (c === '`') {
      if (inQ && id[i + 1] === '`') {
        cur += '``';
        i++;
        continue;
      }
      inQ = !inQ;
      cur += c;
      continue;
    }
    if (c === '.' && !inQ) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

/** Parte por comas de primer nivel (fuera de paréntesis y comillas). */
export function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    if (c === "'" || c === '"' || c === '`') {
      const next = skipQuoted(text, i);
      i = next < 0 ? text.length : next;
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
    i++;
  }
  const last = text.slice(start);
  if (last.trim() !== '' || parts.length) parts.push(last);
  return parts;
}

const CREATE_RE = /^CREATE\s+(?:OR\s+REPLACE\s+)?(?:TEMPORARY\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?((?:`(?:[^`]|``)+`|[A-Za-z0-9_$]+)(?:\s*\.\s*(?:`(?:[^`]|``)+`|[A-Za-z0-9_$]+))?)\s*\(/i;
const NON_COLUMN_RE = /^(?:PRIMARY|UNIQUE|KEY|INDEX|FULLTEXT|SPATIAL|CONSTRAINT|FOREIGN|CHECK|PERIOD)\b/i;

/** Nombre de tabla, columnas y `AUTO_INCREMENT` de una sentencia `CREATE TABLE` (o `undefined`). */
export function parseCreateTable(stmt: string): TableSchema | undefined {
  const text = stmt.trim();
  const m = CREATE_RE.exec(text);
  if (!m) return undefined;
  const open = m[0].length - 1;
  // Paréntesis de cierre que empareja con el de apertura.
  let depth = 0;
  let close = -1;
  for (let i = open; i < text.length; i++) {
    const c = text[i]!;
    if (c === "'" || c === '"' || c === '`') {
      const next = skipQuoted(text, i);
      if (next < 0) break;
      i = next - 1;
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close < 0) return undefined;
  const columns: string[] = [];
  for (const raw of splitTopLevel(text.slice(open + 1, close))) {
    const def = raw.trim();
    if (!def || NON_COLUMN_RE.test(def)) continue;
    const id = /^(`(?:[^`]|``)+`|"[^"]+"|[A-Za-z0-9_$]+)/.exec(def);
    if (id) columns.push(unquoteIdent(id[1]!));
  }
  const schema: TableSchema = { table: unquoteQualified(m[1]!), columns };
  const ai = /\bAUTO_INCREMENT\s*=\s*(\d+)/i.exec(text.slice(close));
  if (ai) schema.autoIncrement = Number(ai[1]);
  return schema;
}

// ---------------------------------------------------------------------------
// Utilidades de alto nivel
// ---------------------------------------------------------------------------

export interface ParsedTable {
  schema?: TableSchema;
  /** Filas como objetos (solo de las tablas pedidas). */
  rows: SqlRow[];
  /** Filas vistas (de todas las tablas, también las descartadas). */
  rowCount: number;
}

export type ParsedDump = Map<string, ParsedTable>;

export function rowObject(values: SqlValue[], columns: string[] | undefined): SqlRow {
  const row: SqlRow = {};
  if (!columns) {
    values.forEach((v, i) => (row[`col${i}`] = v));
    return row;
  }
  columns.forEach((c, i) => (row[c] = values[i] ?? null));
  return row;
}

function collector(keep: (table: string) => boolean): { parser: SqlDumpParser; result: ParsedDump } {
  const result: ParsedDump = new Map();
  const entry = (table: string): ParsedTable => {
    let t = result.get(table);
    if (!t) {
      t = { rows: [], rowCount: 0 };
      result.set(table, t);
    }
    return t;
  };
  const parser = new SqlDumpParser({
    onTable(schema) {
      entry(schema.table).schema = schema;
    },
    onRow(table, values, columns) {
      const t = entry(table);
      t.rowCount++;
      if (keep(table)) t.rows.push(rowObject(values, columns));
    },
  });
  return { parser, result };
}

/** Parsea un volcado entero que ya está en memoria (tests). */
export function parseDumpText(sql: string, tables?: Iterable<string>): ParsedDump {
  const wanted = tables ? new Set(tables) : undefined;
  const { parser, result } = collector((t) => !wanted || wanted.has(t));
  parser.push(sql);
  parser.end();
  return result;
}

/**
 * Lee un volcado (`.sql` o `.sql.gz`) en streaming. Guarda como objetos solo las filas de `tables`
 * (todas si se omite) y cuenta las de todas.
 */
export async function readDumpFile(path: string, tables?: Iterable<string>): Promise<ParsedDump> {
  const wanted = tables ? new Set(tables) : undefined;
  const { parser, result } = collector((t) => !wanted || wanted.has(t));
  const raw = createReadStream(path);
  const stream = path.endsWith('.gz') ? raw.pipe(createGunzip()) : raw;
  stream.setEncoding('utf8');
  for await (const chunk of stream) parser.push(chunk as string);
  parser.end();
  return result;
}
