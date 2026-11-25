/**
 * Matriz de permisos por perfil (spec §3). La API la comprueba siempre; el frontal solo oculta.
 * Un usuario puede tener varios perfiles: tiene un permiso si alguno de sus perfiles lo tiene.
 */
import type { AgendaName, EventTypeCode, Profile } from './types.js';
import { PROFILES } from './types.js';

export const PERMISSIONS = [
  'animals:read',
  /** Ver los contactos dentro de la ficha (bienestar ve fichas sin contactos). */
  'animals:read_contacts',
  /** Crear/editar animal y eventos Llegada/Salida/Movimientos. */
  'animals:write',
  'events:vet',
  'animals:delete',
  'events:delete',
  'contacts:read',
  'contacts:write',
  /** Solo los clientes de sus citas (Modevet). */
  'contacts:own_clients',
  'documents:generate',
  /** Ver/imprimir solo impresos veterinarios. */
  'documents:vet',
  'templates:write',
  'reports:read',
  'agenda_carlet:read',
  'agenda_carlet:write',
  'agenda_modevet:read',
  'agenda_modevet:write',
  /** Crear derivaciones en la agenda de Modevet. */
  'agenda_modevet:referral',
  'incidents:read',
  'incidents:create',
  'incidents:manage',
  /** Resolver las incidencias derivadas a Modevet. */
  'incidents:resolve_referred',
  'incidents:own_followup',
  'catalogs:write',
  /** Catálogos operativos (personal, tipos de cita, actuaciones, ubicaciones, vacunas, enfermedades…). */
  'catalogs:operational',
  'users:manage',
  'audit:read',
  'export:csv',
  'purge',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL: readonly Permission[] = PERMISSIONS.filter((p) => p !== 'incidents:own_followup' && p !== 'contacts:own_clients');

export const PERMISSION_MATRIX: Record<Profile, readonly Permission[]> = {
  admin: ALL,
  carlet: [
    'animals:read',
    'animals:read_contacts',
    'animals:write',
    'events:vet',
    'events:delete',
    'contacts:read',
    'contacts:write',
    'documents:generate',
    'documents:vet',
    'reports:read',
    'agenda_carlet:read',
    'agenda_carlet:write',
    'agenda_modevet:read',
    'agenda_modevet:referral',
    'incidents:read',
    'incidents:create',
    'incidents:manage',
    'catalogs:operational',
  ],
  // Sin `animals:read_contacts`: Modevet solo ve los contactos de sus clientes (spec §3, legal-rgpd §4),
  // no los adoptantes/acogedores del historial de las fichas.
  modevet: [
    'animals:read',
    'events:vet',
    'contacts:own_clients',
    'documents:vet',
    'agenda_carlet:read',
    'agenda_modevet:read',
    'agenda_modevet:write',
    'agenda_modevet:referral',
    'incidents:read',
    'incidents:resolve_referred',
  ],
  bienestar: ['animals:read', 'incidents:create', 'incidents:own_followup'],
};

export function isProfile(value: string): value is Profile {
  return (PROFILES as readonly string[]).includes(value);
}

/** Perfiles a partir de `cognito:groups` (ignora grupos desconocidos). */
export function profilesFromGroups(groups: readonly string[] | string | undefined): Profile[] {
  const list = typeof groups === 'string' ? groups.split(/[,\s]+/) : (groups ?? []);
  return [...new Set(list.map((g) => g.trim().toLowerCase()).filter(isProfile))];
}

export function permissionsFor(profiles: readonly Profile[]): Permission[] {
  const set = new Set<Permission>();
  for (const p of profiles) for (const perm of PERMISSION_MATRIX[p] ?? []) set.add(perm);
  return PERMISSIONS.filter((p) => set.has(p));
}

export function can(profiles: readonly Profile[], permission: Permission): boolean {
  return profiles.some((p) => PERMISSION_MATRIX[p]?.includes(permission));
}

export function canAll(profiles: readonly Profile[], ...permissions: Permission[]): boolean {
  return permissions.every((p) => can(profiles, p));
}

/** ¿Puede añadir un evento de este tipo? (Veterinario tiene permiso propio.) */
export function canAddEventType(profiles: readonly Profile[], typeId: EventTypeCode): boolean {
  return can(profiles, typeId === 'veterinario' ? 'events:vet' : 'animals:write');
}

export function canReadAgenda(profiles: readonly Profile[], agenda: AgendaName): boolean {
  return can(profiles, `agenda_${agenda}:read`);
}

/** Escribir en una agenda. En Modevet, `referral = true` permite a Carlet crear solo derivaciones. */
export function canWriteAgenda(profiles: readonly Profile[], agenda: AgendaName, referral = false): boolean {
  if (can(profiles, `agenda_${agenda}:write`)) return true;
  return agenda === 'modevet' && referral && can(profiles, 'agenda_modevet:referral');
}
