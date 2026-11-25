/**
 * Plantillas de documentos con placeholders compatibles con la app vieja (spec §5,
 * `DocumentPlaceholderReplacer`).
 *
 * - Un solo pase con expresión regular: lo que se inserta (p. ej. unas notas que contengan "[CONTACTO_NIF]")
 *   nunca se vuelve a sustituir (la app vieja hacía `str_replace` en cadena).
 * - Los valores se escapan como HTML; los textos `[LANG_*]` y los bloques son HTML de confianza (vienen de
 *   la plantilla o del diccionario legal), pero los parámetros que se meten en ellos se escapan.
 * - Un placeholder desconocido se deja tal cual (así se ve en la vista previa que falta algo).
 */
import { formatAge, formatDMY, formatSpanishLong, formatValenciaLine } from './dates.js';
import { escapeHtml } from './text.js';
import type { Gender, IsoDate, Size } from './types.js';

/** Etiquetas cortas (de `lang/es/panel.php`). */
export const DEFAULT_LABELS: Record<string, string> = {
  table_item_male: 'Macho',
  table_item_female: 'Hembra',
  table_item_none: 'Ninguno',
  table_item_small: 'Pequeño',
  table_item_medium: 'Mediano',
  table_item_big: 'Grande',
  register_of: 'Registro de',
  sterilized: 'Esterilizado',
  compatible_dogs: 'Compatible Perros',
  compatible_cats: 'Compatible Gatos',
  number: 'Número',
  notes: 'Notas',
};

export const GENDER_LABELS: Record<Gender, string> = { male: 'Macho', female: 'Hembra', none: 'Ninguno' };
export const SIZE_LABELS: Record<Size, string> = { small: 'Pequeño', medium: 'Mediano', big: 'Grande' };

/** Datos ya resueltos (nombres de catálogo incluidos) para rellenar un documento. */
export interface TemplateData {
  /** Hoy (para la edad estimada). */
  today: IsoDate;
  logoUrl?: string;
  photoUrl?: string;
  animal: {
    id: number;
    name: string;
    speciesName?: string;
    breedName?: string;
    color?: string;
    gender: Gender;
    weightKg?: number;
    size?: Size;
    statusName?: string;
    centerName?: string;
    bornAt?: IsoDate;
    sterilized: boolean;
    ppp: boolean;
    compatibleDogs: boolean;
    compatibleCats: boolean;
    chip?: { number: string; notes?: string };
  };
  /** Ausente en la ficha (`ficha`) o en documentos en blanco. */
  event?: {
    id: number;
    date: IsoDate;
    typeName?: string;
    subtypeName?: string;
    notes?: string;
    cityName?: string;
    /** Trabajador ("recogido por"). */
    workerName?: string;
  };
  contact?: {
    name?: string;
    surname?: string;
    nif?: string;
    phone?: string;
    email?: string;
    address?: string;
    province?: string;
    zip?: string;
    cityName?: string;
  };
}

/** Diccionario de textos: claves en minúsculas sin `LANG_` (`lopd`, `host_text_top`…), valores HTML. */
export type LangDictionary = Record<string, string>;

/** Lista de placeholders simples soportados (para el editor de plantillas). */
export const PLACEHOLDERS = [
  'LOGO_URL',
  'FOTO_ANIMAL_URL',
  'HISTORIAL_ID',
  'FECHA_HISTORIAL_DM',
  'FECHA_HISTORIAL_ESPAÑOL',
  'FECHA_VALENCIA_LINEA',
  'MOTIVO_SUBTIPO',
  'TIPO_HISTORIAL',
  'SUBTIPO_HISTORIAL',
  'NOTAS_HISTORIAL',
  'ANIMAL_ID',
  'ANIMAL_NOMBRE',
  'ESPECIE',
  'RAZA',
  'COLOR',
  'GENERO',
  'PESO',
  'TAMANO',
  'ESTADO',
  'CENTRO',
  'NACIDO_FECHA',
  'EDAD_ESTIMADA',
  'LUGAR_CIUDAD',
  'RECOGIDO_POR',
  'CONTACTO_NOMBRE',
  'CONTACTO_APELLIDOS',
  'CONTACTO_NIF',
  'CONTACTO_TELEFONO',
  'CONTACTO_EMAIL',
  'CONTACTO_DIRECCION',
  'CONTACTO_PROVINCIA',
  'CONTACTO_CP',
  'CONTACTO_CIUDAD',
  'TITULO_REGISTRO',
  'TITULO_REGISTRO_CON_SUBTIPO',
] as const;

export const BLOCKS = ['BLOQUE_CHECK_ESTERILIZADO', 'BLOQUE_PPP', 'BLOQUE_COMPAT_PERROS', 'BLOQUE_COMPAT_GATOS', 'BLOQUE_CHIP'] as const;

/** Textos `[LANG_*]` que usan las plantillas por defecto. */
export const LANG_KEYS = [
  'compliance',
  'host_text',
  'host_text_top',
  'adoption_text_top',
  'adoption_text',
  'adoption_engagement_1',
  'adoption_engagement_2',
  'adoption_engagement_sterilized',
  'lopd',
  'adoption_anex1',
  'adoption_anex2',
  'adoption_anex3',
  'adoption_anex4',
] as const;

/** Sustituye `:param` (como `trans()` de Laravel); parámetros escapados. Las claves largas primero. */
export function interpolate(text: string, params: Record<string, string>): string {
  const keys = Object.keys(params).sort((a, b) => b.length - a.length);
  if (!keys.length) return text;
  const re = new RegExp(`:(${keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  return text.replace(re, (_m, k: string) => escapeHtml(params[k] ?? ''));
}

function label(dict: LangDictionary, key: string): string {
  return dict[key] ?? DEFAULT_LABELS[key] ?? '';
}

/** Valores de los placeholders simples (sin escapar). */
export function placeholderValues(data: TemplateData, dict: LangDictionary = {}): Record<string, string> {
  const { animal, event, contact } = data;
  const fecha = event?.date;
  const registerOf = label(dict, 'register_of');
  return {
    LOGO_URL: data.logoUrl ?? '',
    FOTO_ANIMAL_URL: data.photoUrl ?? '',
    HISTORIAL_ID: event ? String(event.id) : '',
    FECHA_HISTORIAL_DM: fecha ? formatDMY(fecha) : '',
    FECHA_HISTORIAL_ESPAÑOL: fecha ? formatSpanishLong(fecha) : '',
    FECHA_VALENCIA_LINEA: fecha ? formatValenciaLine(fecha) : '',
    MOTIVO_SUBTIPO: event?.subtypeName ?? '',
    TIPO_HISTORIAL: event?.typeName ?? '',
    SUBTIPO_HISTORIAL: event?.subtypeName ?? '',
    NOTAS_HISTORIAL: event?.notes ?? '',
    ANIMAL_ID: String(animal.id),
    ANIMAL_NOMBRE: animal.name,
    ESPECIE: animal.speciesName ?? '',
    RAZA: animal.breedName ?? '',
    COLOR: animal.color ?? '',
    GENERO: label(dict, `table_item_${animal.gender}`),
    PESO: animal.weightKg !== undefined ? String(animal.weightKg).replace('.', ',') : '',
    TAMANO: animal.size ? label(dict, `table_item_${animal.size}`) : '',
    ESTADO: animal.statusName ?? '',
    CENTRO: animal.centerName ?? '',
    NACIDO_FECHA: animal.bornAt ? formatDMY(animal.bornAt) : '',
    EDAD_ESTIMADA: animal.bornAt ? formatAge(animal.bornAt, data.today) : '',
    LUGAR_CIUDAD: event?.cityName ?? '',
    RECOGIDO_POR: event?.workerName ?? '',
    CONTACTO_NOMBRE: contact?.name ?? '',
    CONTACTO_APELLIDOS: contact?.surname ?? '',
    CONTACTO_NIF: contact?.nif ?? '',
    CONTACTO_TELEFONO: contact?.phone ?? '',
    CONTACTO_EMAIL: contact?.email ?? '',
    CONTACTO_DIRECCION: contact?.address ?? '',
    CONTACTO_PROVINCIA: contact?.province ?? '',
    CONTACTO_CP: contact?.zip ?? '',
    CONTACTO_CIUDAD: contact?.cityName ?? '',
    TITULO_REGISTRO: `${registerOf} ${event?.typeName ?? ''}`.trim(),
    TITULO_REGISTRO_CON_SUBTIPO: event ? `${registerOf} ${event.typeName ?? ''}: ${event.subtypeName ?? ''}` : '',
  };
}

function blockValues(data: TemplateData, dict: LangDictionary): Record<string, string> {
  const a = data.animal;
  const e = (k: string) => escapeHtml(label(dict, k));
  let chip = '';
  if (a.chip) {
    chip =
      '<h5 style="margin-bottom: 0; padding-top: 15px;">Chip</h5><hr style="margin-top: 0">' +
      `<span>${e('number')}: <strong>${escapeHtml(a.chip.number)}</strong></span><br>` +
      `<span>${e('notes')}: <strong>${escapeHtml(a.chip.notes ?? '')}</strong></span><br>`;
  }
  return {
    BLOQUE_CHECK_ESTERILIZADO: a.sterilized
      ? `<span><i class="fa-solid fa-check"></i> <strong>${e('sterilized')}</strong></span><br>`
      : '',
    BLOQUE_PPP: a.ppp ? '<span><i class="fa-solid fa-exclamation-triangle"></i> <strong>PPP</strong></span><br>' : '',
    BLOQUE_COMPAT_PERROS: a.compatibleDogs
      ? `<span><i class="fa-solid fa-check"></i> <strong>${e('compatible_dogs')}</strong></span><br>`
      : '',
    BLOQUE_COMPAT_GATOS: a.compatibleCats
      ? `<span><i class="fa-solid fa-check"></i> <strong>${e('compatible_cats')}</strong></span>`
      : '',
    BLOQUE_CHIP: chip,
  };
}

/** Parámetros `:x` disponibles dentro de los textos `[LANG_*]`. */
export function langParams(data: TemplateData): Record<string, string> {
  const c = data.contact;
  const name = c ? `${c.name ?? ''} ${c.surname ?? ''}`.trim() : '';
  const address = c && c.cityName ? `${c.address ?? ''}, ${c.zip ?? ''}, ${c.cityName} (${c.province ?? ''})` : '';
  return {
    fecha_acogida: data.event ? formatSpanishLong(data.event.date) : '',
    adoptante_name: name,
    adoptante_nif: c?.nif ?? '',
    adoptante_phone: c?.phone ?? '',
    adoptante_email: c?.email ?? '',
    adoptante_address: address,
    animalType: data.animal.speciesName ?? '',
  };
}

const TOKEN_RE = /\[([A-Z0-9_Ñ]+)\]/g;

/**
 * Rellena una plantilla HTML.
 * @param dict textos legales y etiquetas (overrides de la plantilla sobre los textos por defecto).
 */
export function renderTemplate(html: string, data: TemplateData, dict: LangDictionary = {}): string {
  const values = placeholderValues(data, dict);
  const blocks = blockValues(data, dict);
  const params = langParams(data);
  return html.replace(TOKEN_RE, (match, token: string) => {
    if (token in values) return escapeHtml(values[token]!);
    if (token in blocks) return blocks[token]!;
    if (token.startsWith('LANG_')) {
      const key = token.slice(5).toLowerCase();
      if (key === 'adoption_engagement_sterilized' && data.animal.sterilized) return '';
      return interpolate(dict[key] ?? '', params);
    }
    return match;
  });
}

/** Placeholders `[X]` de una plantilla que no se reconocen (para avisar en el editor). */
export function unknownPlaceholders(html: string): string[] {
  const known = new Set<string>([...PLACEHOLDERS, ...BLOCKS]);
  const out = new Set<string>();
  for (const m of html.matchAll(TOKEN_RE)) {
    const t = m[1]!;
    if (!known.has(t) && !t.startsWith('LANG_')) out.add(t);
  }
  return [...out];
}
