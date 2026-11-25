/** Contactos: deduplicación por NIF y "SIN DATOS" (regla 6), tipo de contacto derivado. */
import type { Contact, ContactId, ContactKind, Subtype } from './types.js';
import { capitalizeWords, collapseSpaces, foldText, normalizeNif } from './text.js';

/** Nombre del contacto especial para avisantes desconocidos. */
export const SIN_DATOS_NAME = 'SIN DATOS';

export function isSinDatos(contact: Pick<Contact, 'name'>): boolean {
  return foldText(contact.name) === foldText(SIN_DATOS_NAME);
}

export interface ContactData {
  name: string;
  surname?: string;
  nif?: string;
  address?: string;
  zip?: string;
  province?: string;
  cityId?: string;
  cityName?: string;
  phone?: string;
  email?: string;
}

export function normalizeContactData(data: ContactData): ContactData {
  const out: ContactData = { name: collapseSpaces(data.name) };
  const nif = normalizeNif(data.nif);
  if (data.surname?.trim()) out.surname = collapseSpaces(data.surname);
  if (nif) out.nif = nif;
  if (data.address?.trim()) out.address = collapseSpaces(data.address);
  if (data.zip?.trim()) out.zip = data.zip.trim();
  if (data.province?.trim()) out.province = capitalizeWords(data.province);
  if (data.cityId) out.cityId = data.cityId;
  if (data.cityName?.trim()) out.cityName = capitalizeWords(data.cityName);
  if (data.phone?.trim()) out.phone = collapseSpaces(data.phone);
  if (data.email?.trim()) out.email = data.email.trim().toLowerCase();
  return out;
}

export type ContactResolution =
  | { action: 'use'; contactId: ContactId }
  | { action: 'update'; contactId: ContactId; data: ContactData }
  | { action: 'create'; data: ContactData };

/**
 * Regla 6. Si se elige un contacto, se usa (y se actualiza con los datos del formulario si vienen).
 * Si no, se busca por NIF excluyendo "SIN DATOS": si existe se actualiza, si no se crea.
 * `findByNif` lo aporta la API (índice `NIF#`).
 */
export function resolveEventContact(
  input: { contactId?: ContactId; data?: ContactData },
  findByNif: (nif: string) => Contact | undefined,
): ContactResolution {
  const data = input.data ? normalizeContactData(input.data) : undefined;
  if (input.contactId !== undefined) {
    return data ? { action: 'update', contactId: input.contactId, data } : { action: 'use', contactId: input.contactId };
  }
  if (!data || !data.name) throw new Error('Faltan los datos del contacto.');
  if (data.nif) {
    const existing = findByNif(data.nif);
    if (existing && !isSinDatos(existing)) return { action: 'update', contactId: existing.id, data };
  }
  return { action: 'create', data };
}

/** Qué tipo de contacto implica aparecer en un evento de este subtipo. */
export function contactKindForSubtype(subtype: Pick<Subtype, 'typeId' | 'code'>): ContactKind | undefined {
  if (subtype.typeId === 'llegada') return 'avisante';
  switch (subtype.code) {
    case 'adopcion':
      return 'adoptante';
    case 'acogida':
    case 'acogida_solidaria':
    case 'devolucion_desde_acogida':
      return 'acogedor';
    case 'dueno':
    case 'devolucion_responsable_legal':
      return 'propietario';
    default:
      return undefined;
  }
}

export function addContactKind(kinds: readonly ContactKind[], kind: ContactKind | undefined): ContactKind[] {
  return kind && !kinds.includes(kind) ? [...kinds, kind] : [...kinds];
}

export function contactFullName(c: Pick<Contact, 'name' | 'surname'>): string {
  return collapseSpaces(`${c.name} ${c.surname ?? ''}`);
}
