/** Tests del parser con SQL sintético (nada real). */
import { describe, expect, it } from 'vitest';
import { parseCreateTable, parseDumpText, SqlDumpParser, type SqlValue } from '../src/sql-parser.js';

const DUMP = `/*M!999999\\- enable the sandbox mode */
-- MariaDB dump 10.19-11.4.14-MariaDB, for debian-linux-gnu (x86_64)
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET TIME_ZONE='+00:00' */;

DROP TABLE IF EXISTS \`pets\`;
CREATE TABLE \`pets\` (
  \`id\` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  \`name\` varchar(255) NOT NULL DEFAULT 'a,b',
  \`notes\` text DEFAULT NULL,
  \`weight\` decimal(6,2) NOT NULL,
  \`kind\` enum('dog','cat') NOT NULL,
  \`blob\` blob DEFAULT NULL,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`pets_name_unique\` (\`name\`),
  CONSTRAINT \`fk\` FOREIGN KEY (\`id\`) REFERENCES \`other\` (\`id\`)
) ENGINE=InnoDB AUTO_INCREMENT=42 DEFAULT CHARSET=utf8mb4;

LOCK TABLES \`pets\` WRITE;
/*!40000 ALTER TABLE \`pets\` DISABLE KEYS */;
INSERT INTO \`pets\` VALUES
(1,'Toby','Línea 1\\nLínea 2',12.50,'dog',NULL),
(2,'O\\'Neil','con \\\\ barra y \\"comillas\\" y ''dobles''',0.00,'cat',_binary 'xyz'),
(3,'Ñandú 🐾','tab\\there; y punto y coma, y (paréntesis)',-3,'dog',0x48656C6C6F);
/*!40000 ALTER TABLE \`pets\` ENABLE KEYS */;
UNLOCK TABLES;
INSERT INTO \`pets\` (\`id\`, \`name\`, \`notes\`, \`weight\`, \`kind\`, \`blob\`) VALUES (4,'Multi
línea','x',1e2,'cat',NULL),(5,'',NULL,9007199254740993,'dog',NULL);
CREATE TABLE \`empty_one\` (\`id\` int NOT NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB;
`;

describe('parseCreateTable', () => {
  it('saca nombre, columnas y AUTO_INCREMENT', () => {
    const s = parseCreateTable(
      "CREATE TABLE `t` (\n `a` int,\n `b c` varchar(10) DEFAULT 'x,(y)',\n KEY `k` (`a`),\n CHECK (json_valid(`b c`))\n) ENGINE=InnoDB AUTO_INCREMENT=7",
    );
    expect(s).toEqual({ table: 't', columns: ['a', 'b c'], autoIncrement: 7 });
  });
  it('ignora lo que no es CREATE TABLE', () => {
    expect(parseCreateTable('CREATE VIEW v AS SELECT 1')).toBeUndefined();
  });
});

describe('parseDumpText', () => {
  const parsed = parseDumpText(DUMP);
  const pets = parsed.get('pets')!;

  it('lee el esquema', () => {
    expect(pets.schema?.columns).toEqual(['id', 'name', 'notes', 'weight', 'kind', 'blob']);
    expect(pets.schema?.autoIncrement).toBe(42);
    expect(parsed.get('empty_one')?.rowCount).toBe(0);
  });

  it('lee filas con escapes, NULL, números, _binary y hex', () => {
    expect(pets.rowCount).toBe(5);
    const [r1, r2, r3, r4, r5] = pets.rows;
    expect(r1).toEqual({ id: 1, name: 'Toby', notes: 'Línea 1\nLínea 2', weight: 12.5, kind: 'dog', blob: null });
    expect(r2!.name).toBe("O'Neil");
    expect(r2!.notes).toBe('con \\ barra y "comillas" y \'dobles\'');
    expect(r2!.weight).toBe(0);
    expect(r2!.blob).toBe('xyz');
    expect(r3!.name).toBe('Ñandú 🐾');
    expect(r3!.notes).toBe('tab\there; y punto y coma, y (paréntesis)');
    expect(r3!.weight).toBe(-3);
    expect(Buffer.from(r3!.blob as Uint8Array).toString()).toBe('Hello');
    expect(r4!.name).toBe('Multi\nlínea');
    expect(r4!.weight).toBe(100);
    expect(r5!.name).toBe('');
    expect(r5!.notes).toBeNull();
    expect(r5!.weight).toBe('9007199254740993');
  });

  it('solo guarda las tablas pedidas pero cuenta todas', () => {
    const only = parseDumpText(DUMP, ['nothing']);
    expect(only.get('pets')!.rows).toHaveLength(0);
    expect(only.get('pets')!.rowCount).toBe(5);
  });

  it('da el mismo resultado partiendo la entrada en cualquier punto', () => {
    const reference = JSON.stringify([...parseDumpText(DUMP)]);
    for (let cut = 1; cut < DUMP.length; cut++) {
      const rows: [string, SqlValue[]][] = [];
      const p = new SqlDumpParser({ onRow: (t, v) => rows.push([t, v]) });
      p.push(DUMP.slice(0, cut));
      p.push(DUMP.slice(cut));
      p.end();
      expect(rows.length, `corte en ${cut}`).toBe(5);
    }
    // Trozos de un carácter.
    const rows: SqlValue[][] = [];
    const p = new SqlDumpParser({ onRow: (_t, v) => rows.push(v) });
    for (const ch of DUMP) p.push(ch);
    p.end();
    expect(rows).toHaveLength(5);
    const viaChars = parseDumpText(DUMP);
    expect(JSON.stringify([...viaChars])).toBe(reference);
  });

  it('acepta INSERT IGNORE, REPLACE, comilla doble y ON DUPLICATE KEY', () => {
    const sql = `CREATE TABLE t (id int, v varchar(9));
INSERT IGNORE INTO t VALUES (1,"a\\"b");
REPLACE INTO \`db\`.\`t\` VALUES (2,'c');
INSERT INTO t VALUES (3,'d') ON DUPLICATE KEY UPDATE v='e;f';
INSERT INTO t VALUES (4,b'101');`;
    const rows = parseDumpText(sql).get('t')!.rows;
    expect(rows).toEqual([
      { id: 1, v: 'a"b' },
      { id: 2, v: 'c' },
      { id: 3, v: 'd' },
      { id: 4, v: 5 },
    ]);
  });

  it('falla si el número de valores no cuadra con las columnas', () => {
    expect(() => parseDumpText('CREATE TABLE t (a int, b int);\nINSERT INTO t VALUES (1);')).toThrow(/1 valores/);
  });

  it('falla si el volcado se corta en mitad de un INSERT', () => {
    expect(() => parseDumpText("CREATE TABLE t (a int);\nINSERT INTO t VALUES (1),(2")).toThrow();
    expect(() => parseDumpText("CREATE TABLE t (a varchar(3));\nINSERT INTO t VALUES ('abc")).toThrow();
  });
});
