/** Utilidades de documentos: nombres de plantilla, rellenado y datos de ejemplo/en blanco. */
import { DEFAULT_LABELS, renderTemplate, todayMadrid, type Template, type TemplateData, type TemplateSlug } from '@modepran/domain';

export const TEMPLATE_NAMES: Record<TemplateSlug, string> = {
  llegada: 'Llegada',
  adopcion: 'Contrato de adopción',
  dueno: 'Salida a dueño',
  eutanasia: 'Eutanasia',
  acogida: 'Contrato de acogida',
  veterinario: 'Veterinario',
  ficha: 'Ficha del animal',
};

/** Diccionario final: etiquetas por defecto < textos del servidor < overrides de la plantilla. */
export function templateDict(template: Pick<Template, 'legalTexts'>, dict: Record<string, string> = {}): Record<string, string> {
  return { ...DEFAULT_LABELS, ...dict, ...(template.legalTexts ?? {}) };
}

export function withDefaults(data: TemplateData): TemplateData {
  return { ...data, logoUrl: data.logoUrl ?? `${window.location.origin}/favicon.svg` };
}

export function fillTemplate(template: Template, data: TemplateData, dict: Record<string, string> = {}, blank = false): string {
  return renderTemplate(blank ? template.bodyBlank : template.bodyFilled, withDefaults(data), templateDict(template, dict));
}

/** Datos vacíos para impresos en blanco. */
export function blankData(): TemplateData {
  return {
    today: todayMadrid(),
    animal: { id: 0, name: '', gender: 'none', sterilized: false, ppp: false, compatibleDogs: false, compatibleCats: false },
  };
}

/** Datos sintéticos (ficticios) para la vista previa del editor. */
export function sampleData(): TemplateData {
  const today = todayMadrid();
  return {
    today,
    animal: {
      id: 1234,
      name: 'Canela',
      speciesName: 'Perro',
      breedName: 'Mestizo',
      color: 'Marrón',
      gender: 'female',
      weightKg: 12.5,
      size: 'medium',
      statusName: 'Disponible',
      centerName: 'Carlet',
      bornAt: '2022-03-15',
      sterilized: true,
      ppp: false,
      compatibleDogs: true,
      compatibleCats: false,
      chip: { number: '900000000000001', notes: 'Ejemplo' },
    },
    event: { id: 98765, date: today, typeName: 'Salida', subtypeName: 'Adopción', notes: 'Notas de ejemplo.', cityName: 'Carlet', workerName: 'Persona de ejemplo' },
    contact: {
      name: 'Nombre',
      surname: 'Apellido Ejemplo',
      nif: '00000000T',
      phone: '600000000',
      email: 'ejemplo@example.com',
      address: 'Calle Ejemplo 1',
      province: 'Valencia',
      zip: '46000',
      cityName: 'Valencia',
    },
  };
}
