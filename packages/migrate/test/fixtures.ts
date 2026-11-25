/**
 * Volcado SQL sintético con la forma de la app vieja (esquema real, datos inventados: nada real).
 */

const ts = '2024-01-01 10:00:00';

/** Los 29 subtipos de la app vieja (configuración, no datos personales): id, tipo, estado, nombre, flags. */
const SUBTYPES: [number, number, number | null, string, string][] = [
  [1, 1, 5, 'Aviso', '1,1,1,1,0,0,0,0,1,0,0,NULL'],
  [2, 1, 2, 'Aviso Cadaver', '1,1,1,1,0,0,0,0,1,0,0,NULL'],
  [3, 1, 5, 'Aviso Enfermo / Herido', '1,1,1,1,0,0,0,0,1,0,0,NULL'],
  [4, 1, 5, 'Devolución desde Adopción', '1,1,1,1,0,0,0,0,1,0,0,NULL'],
  [5, 2, 1, 'Adopción', '1,1,0,1,0,0,0,1,1,0,0,NULL'],
  [6, 2, 7, 'Defunción', '1,0,0,1,0,0,0,1,0,0,0,NULL'],
  [7, 2, 3, 'Dueño', '1,1,0,1,0,0,0,1,1,0,0,NULL'],
  [8, 2, 4, 'Colonia', '1,1,0,0,0,0,0,1,0,0,0,NULL'],
  [9, 2, 6, 'Eutanasia', '1,1,0,1,0,0,0,1,1,0,0,NULL'],
  [10, 2, 2, 'Cadaver', '1,1,0,1,0,0,0,1,0,0,0,NULL'],
  [11, 2, 10, 'Otras Asociaciones', '1,1,0,0,0,0,0,1,0,0,0,NULL'],
  [12, 3, 5, 'Desparasitación', '1,0,0,1,0,0,0,1,0,0,0,NULL'],
  [13, 3, 5, 'Enfermedad', "1,0,0,1,0,1,0,1,0,0,1,'Finalizado'"],
  [14, 3, 5, 'Intervención', '1,0,0,1,0,0,0,1,1,0,0,NULL'],
  [15, 3, 5, 'Vacuna', "1,0,0,1,1,0,0,1,0,0,1,'Finalizado'"],
  [16, 3, 5, 'Documento', '1,0,0,1,0,0,0,1,0,1,0,NULL'],
  [17, 3, 5, 'Esterlizado', "1,0,0,1,0,0,0,1,0,0,1,'Finalizado'"],
  [18, 3, 5, 'Ingreso', '1,0,0,1,0,0,0,1,1,0,0,NULL'],
  [19, 3, 5, 'Test', '1,0,0,1,0,0,0,1,0,0,0,NULL'],
  [20, 3, 5, 'Especialista', '1,0,0,1,0,0,0,1,1,0,0,NULL'],
  [21, 4, 8, 'Acogida', '1,1,0,1,0,0,0,1,1,0,0,NULL'],
  [22, 4, 9, 'Acogida Solidaria', '1,1,0,1,0,0,0,1,1,0,0,NULL'],
  [23, 4, 5, 'Ingreso / Revision', '1,0,1,0,0,0,0,1,0,0,0,NULL'],
  [24, 1, 5, 'Aviso CHIP', '1,1,1,1,0,0,0,0,1,0,0,NULL'],
  [25, 1, 5, 'Gato Colonia', '1,1,1,1,0,0,1,0,1,0,0,NULL'],
  [26, 4, 5, 'Devolución desde Acogida', '1,1,1,1,0,0,0,1,1,0,0,NULL'],
  [27, 2, 11, 'Perdido', '0,0,1,0,0,0,0,0,0,0,0,NULL'],
  [28, 1, 5, 'Devolución Otras Asociaciones', '0,1,1,0,0,0,0,0,0,0,0,NULL'],
  [29, 2, 12, 'DEVOLUCION RESPONSABLE LEGAL', '0,1,0,1,0,0,0,0,0,0,0,NULL'],
];

const STATUSES = [
  'Adoptado',
  'Cadaver',
  'Devolución Propietario',
  'Devuelto a Colonia',
  'Disponible',
  'Eutanasiado',
  'Fallecido',
  'Acogida',
  'Acogida Solidaria',
  'Translado',
  'Perdido',
  'DEVOLUCION RESPONSABLE LEGAL',
];

function table(name: string, cols: string, rows: string[], autoIncrement?: number): string {
  const head = `DROP TABLE IF EXISTS \`${name}\`;\nCREATE TABLE \`${name}\` (\n${cols}\n) ENGINE=InnoDB${autoIncrement ? ` AUTO_INCREMENT=${autoIncrement}` : ''} DEFAULT CHARSET=utf8mb4;\n`;
  if (!rows.length) return head;
  return `${head}LOCK TABLES \`${name}\` WRITE;\nINSERT INTO \`${name}\` VALUES\n${rows.map((r) => `(${r})`).join(',\n')};\nUNLOCK TABLES;\n`;
}

const c = (names: string[]) => names.map((n) => `  \`${n}\` varchar(255) DEFAULT NULL`).join(',\n') + ',\n  PRIMARY KEY (`id`)';

export interface FixtureOptions {
  extraHistory?: string[];
  extraContacts?: string[];
  templates?: string[];
}

/**
 * Tres animales:
 * - 101: perro, Carlet, chip; llegada (Aviso, contacto 2) → vacuna → adopción (contacto 3) = Adoptado.
 * - 102: gato, Valencia, sin chip; llegada (Aviso, SIN DATOS) → acogida (contacto 2) = Acogida; documento PDF.
 * - 103: perro, Valencia; llegada con fecha a las 20:00 UTC y una salida registrada después con fecha anterior.
 * Contactos 2 y 3 comparten NIF (anomalía); contacto 4 sin nombre y sin eventos.
 */
export function fixtureDump(opts: FixtureOptions = {}): string {
  const parts: string[] = ['-- dump sintético', "/*!40103 SET TIME_ZONE='+00:00' */;"];
  parts.push(table('species', c(['id', 'specie', 'created_at', 'updated_at']), [`1,'Perro','${ts}','${ts}'`, `2,'Gato','${ts}','${ts}'`], 9));
  parts.push(table('species_breed', c(['id', 'specie_id', 'breed', 'created_at', 'updated_at']), [`1,1,'Mestizo','${ts}','${ts}'`]));
  parts.push(table('cities', c(['id', 'city', 'created_at', 'updated_at']), [`1,'Villa Alfa','${ts}','${ts}'`, `2,'Villa Beta','${ts}','${ts}'`], 470));
  parts.push(table('zones', c(['id', 'zone', 'created_at', 'updated_at']), [`1,'Zona Norte','${ts}','${ts}'`]));
  parts.push(table('zones_cities', c(['id', 'city_id', 'zone_id', 'created_at', 'updated_at']), [`1,1,1,'${ts}','${ts}'`, `2,2,1,'${ts}','${ts}'`, `3,99,1,'${ts}','${ts}'`]));
  parts.push(table('centers', c(['id', 'name', 'created_at', 'updated_at']), [`1,'Valencia','${ts}','${ts}'`, `2,'Carlet','${ts}','${ts}'`]));
  parts.push(table('animals_status', c(['id', 'status', 'created_at', 'updated_at']), STATUSES.map((s, i) => `${i + 1},'${s}','${ts}','${ts}'`)));
  parts.push(
    table('animals_history_types', c(['id', 'type', 'created_at', 'updated_at']), ['Llegada', 'Salida', 'Veterinario', 'Movimientos'].map((t, i) => `${i + 1},'${t}','${ts}','${ts}'`)),
  );
  parts.push(
    table(
      'animals_history_types_subtypes',
      c([
        'id',
        'history_type_id',
        'animal_status_id',
        'subtype',
        'user',
        'contact',
        'center',
        'notes',
        'vaccine',
        'illness',
        'colony',
        'date',
        'doc_generate',
        'doc_upload',
        'option_switch',
        'option_switch_string',
        'created_at',
        'updated_at',
      ]),
      SUBTYPES.map(([id, type, status, name, flags]) => `${id},${type},${status ?? 'NULL'},'${name}',${flags},'${ts}','${ts}'`),
    ),
  );
  parts.push(table('vaccines', c(['id', 'vaccine', 'created_at', 'updated_at']), [`1,'Rabia','${ts}','${ts}'`]));
  parts.push(table('illnesses', c(['id', 'illness', 'created_at', 'updated_at']), [`1,'Sarna','${ts}','${ts}'`]));
  parts.push(table('colonies', c(['id', 'colony', 'created_at', 'updated_at']), [`1,'Colonia Uno','${ts}','${ts}'`]));
  parts.push(
    table('users', c(['id', 'name', 'email', 'password', 'deleted', 'type', 'created_at', 'updated_at']), [
      `1,'Persona Uno','uno@example.test','hash-falso',0,'admin','${ts}','${ts}'`,
      `2,'Persona Dos','dos@example.test','hash-falso',1,'worker','${ts}','${ts}'`,
    ]),
  );
  parts.push(
    table(
      'contacts',
      c(['id', 'city_id', 'name', 'nif', 'address', 'surname', 'phone', 'zip', 'state', 'email', 'created_at', 'updated_at']),
      [
        `1,NULL,'SIN DATOS',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'${ts}','${ts}'`,
        `2,1,'Ana','00000000-t','Calle Falsa 1','Ejemplo','600000000','46000','valencia','ANA@EXAMPLE.TEST','${ts}','${ts}'`,
        `3,2,'Beto','00000000T',NULL,'Prueba',NULL,NULL,NULL,NULL,'${ts}','${ts}'`,
        `4,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'${ts}','${ts}'`,
        ...(opts.extraContacts ?? []),
      ],
      6281,
    ),
  );
  parts.push(
    table('animals_chips', c(['id', 'number', 'passport', 'owner', 'phone', 'notes', 'created_at', 'updated_at', 'tmp_owner', 'tmp_phone']), [
      `1,' 941000000000001 ','P-1',NULL,NULL,'nota\\nchip','${ts}','${ts}','Dueño Tmp','611111111'`,
      `2,'941000000000002',NULL,NULL,NULL,NULL,'${ts}','${ts}',NULL,NULL`,
    ]),
  );
  parts.push(
    table(
      'animals',
      c([
        'id',
        'specie_id',
        'breed_id',
        'status_id',
        'center_id',
        'chip_id',
        'name',
        'color',
        'gender',
        'weight',
        'size',
        'photo',
        'sterilized',
        'ppp',
        'visible_web',
        'compatible_dogs',
        'compatible_cats',
        'born_at',
        'created_at',
        'updated_at',
      ]),
      [
        `101,1,1,1,2,1,'Bobi','Negro','male',12.50,'medium',1,1,0,1,1,0,'2020-03-14 23:00:00','2024-01-01 09:00:00','2024-02-01 09:00:00'`,
        `102,2,NULL,8,1,NULL,'Misi','','female',0.00,'small',0,0,0,0,0,1,NULL,'2024-01-02 09:00:00','2024-01-02 09:00:00'`,
        `103,1,NULL,1,1,NULL,'Rex','Marrón','none',20.00,'big',1,0,1,0,0,0,NULL,'2024-01-03 09:00:00','2024-01-03 09:00:00'`,
      ],
      7731,
    ),
  );
  const hcols = [
    'id',
    'user_id',
    'animal_id',
    'history_type_id',
    'history_subtype_id',
    'contact_id',
    'center_id',
    'vaccine_id',
    'illness_id',
    'colony_id',
    'city_id',
    'collection_address',
    'collection_zip',
    'collection_date',
    'doc_name',
    'notes',
    'activated',
    'created_at',
    'updated_at',
  ];
  parts.push(
    table(
      'animals_history',
      c(hcols),
      [
        // 101: llegada 2024-01-01 (medianoche Madrid = 23:00 UTC del día anterior).
        `1,1,101,1,1,2,2,NULL,NULL,NULL,1,'Calle Uno','46001','2023-12-31 23:00:00',NULL,'Encontrado\\r\\nen la calle',NULL,'2023-12-31 23:00:00','2024-01-01 09:00:00'`,
        `2,1,101,3,15,NULL,NULL,1,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,1,'2024-01-09 23:00:00','2024-01-10 10:00:00'`,
        `3,2,101,2,5,3,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2024-01-31 23:00:00','2024-02-01 09:00:00'`,
        // 102: llegada con SIN DATOS, acogida con contacto 2, documento (guardado como .pdf, nombre en mayúsculas).
        `4,1,102,1,1,1,1,NULL,NULL,NULL,2,'Calle Dos','46002','2024-01-01 23:00:00',NULL,NULL,NULL,'2024-01-01 23:00:00','2024-01-02 09:00:00'`,
        `5,1,102,4,21,2,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2024-01-04 23:00:00','2024-01-05 09:00:00'`,
        `6,1,102,3,16,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Informe.PDF','con, coma; y punto',NULL,'2024-01-05 23:00:00','2024-01-06 09:00:00'`,
        // 103: llegada a las 20:00 UTC (importación vieja) y un evento editado después (updated_at posterior).
        `7,1,103,1,24,2,1,NULL,NULL,NULL,1,NULL,NULL,'2024-01-02 20:00:00',NULL,NULL,NULL,'2024-01-02 20:00:00','2024-06-01 09:00:00'`,
        `8,1,103,3,12,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'radiografia.jpeg',NULL,NULL,'2024-01-03 23:00:00','2024-01-04 09:00:00'`,
        ...(opts.extraHistory ?? []),
      ],
      38264,
    ),
  );
  parts.push(table('document_print_templates', c(['id', 'slug', 'body_filled', 'body_blank', 'translation_overrides', 'created_at', 'updated_at']), opts.templates ?? []));
  parts.push(table('documents', c(['id', 'name', 'created_at', 'updated_at']), []));
  parts.push(table('history_census', c(['id', 'specie_id', 'city_id', 'center_id', 'count', 'count_host', 'date', 'created_at', 'updated_at']), [`1,1,1,1,3,0,'${ts}','${ts}','${ts}'`]));
  parts.push(table('logs_errors', c(['id', 'function', 'data', 'error', 'created_at', 'updated_at']), [`1,'f','{}','e','${ts}','${ts}'`]));
  return parts.join('\n');
}

/** Ficheros que existen en el storage sintético (rutas relativas a storage/app/public). */
export const FIXTURE_FILES = [
  { path: 'animals/101.jpg', size: 1000 },
  { path: 'animals/101_thumb.jpg', size: 100 },
  // 103 tiene foto pero le falta la miniatura.
  { path: 'animals/103.jpg', size: 900 },
  // Foto de un animal que no existe y de uno sin flag de foto.
  { path: 'animals/999.jpg', size: 10 },
  { path: 'animals/102.jpg', size: 10 },
  // Adjuntos: el del evento 6 guardado como .pdf; el del 8 como .jpg (la app guardó con extension() del MIME).
  { path: 'animals/102/6.pdf', size: 5000 },
  { path: 'animals/103/8.jpg', size: 3000 },
  // Adjunto de un evento que no existe.
  { path: 'animals/101/777.pdf', size: 1 },
  { path: 'docs/ANEXO.pdf', size: 50 },
  { path: '.gitignore', size: 14 },
];
