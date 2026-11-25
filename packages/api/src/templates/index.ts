/** Plantillas por defecto (convertidas de las vistas de la app vieja) y textos legales. */
import { TEMPLATE_SLUGS, type Template, type TemplateSlug } from '@modepran/domain';
import { DEFAULT_TEMPLATE_BODIES } from './defaults.generated.js';
import { DEFAULT_LEGAL_TEXTS } from './legal-texts.js';

export { DEFAULT_LEGAL_TEXTS, DEFAULT_TEMPLATE_BODIES };

export const TEMPLATE_NAMES: Record<TemplateSlug, string> = {
  llegada: 'Llegada',
  adopcion: 'Adopción',
  dueno: 'Devolución a dueño',
  eutanasia: 'Eutanasia',
  acogida: 'Acogida',
  veterinario: 'Veterinario',
  ficha: 'Ficha del animal',
};

/** Placeholder extra solo de la ficha: tabla del historial (la rellena la API después de `renderTemplate`). */
export const HISTORY_BLOCK = '[BLOQUE_HISTORIAL]';

export function isTemplateSlug(v: string): v is TemplateSlug {
  return (TEMPLATE_SLUGS as readonly string[]).includes(v);
}

export function defaultTemplate(slug: TemplateSlug): Template {
  return {
    slug,
    name: TEMPLATE_NAMES[slug],
    bodyFilled: DEFAULT_TEMPLATE_BODIES[slug].filled,
    bodyBlank: DEFAULT_TEMPLATE_BODIES[slug].blank,
    legalTexts: {},
    updatedAt: '1970-01-01T00:00:00.000Z',
    updatedBy: 'system',
  };
}
