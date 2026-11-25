/** Tipos propios de la API (los de negocio vienen de `@modepran/domain`). */
import type {
  ActionCategory,
  AgendaItem,
  AppointmentType,
  Area,
  Breed,
  Center,
  City,
  Colony,
  DomainCatalogs,
  EventId,
  Illness,
  Profile,
  Species,
  Staff,
  Status,
  Subtype,
  Vaccine,
  Zone,
} from '@modepran/domain';

export const CATALOG_TYPES = [
  'species',
  'breeds',
  'cities',
  'zones',
  'centers',
  'statuses',
  'subtypes',
  'vaccines',
  'illnesses',
  'colonies',
  'areas',
  'staff',
  'appointmentTypes',
  'actionCategories',
] as const;
export type CatalogType = (typeof CATALOG_TYPES)[number];

/** Catálogos que puede tocar Carlet (`catalogs:operational`); el resto solo admin (`catalogs:write`). */
export const OPERATIONAL_CATALOGS: readonly CatalogType[] = [
  'breeds',
  'cities',
  'vaccines',
  'illnesses',
  'colonies',
  'areas',
  'staff',
  'appointmentTypes',
  'actionCategories',
];

export interface Catalogs extends DomainCatalogs {
  species: Species[];
  breeds: Breed[];
  cities: City[];
  zones: Zone[];
  centers: Center[];
  statuses: Status[];
  subtypes: Subtype[];
  vaccines: Vaccine[];
  illnesses: Illness[];
  colonies: Colony[];
  areas: Area[];
  staff: Staff[];
  appointmentTypes: AppointmentType[];
  actionCategories: ActionCategory[];
}

export type CatalogItemOf<T extends CatalogType> = Catalogs[T][number];
export type AnyCatalogItem = Catalogs[CatalogType][number];

export function emptyCatalogs(): Catalogs {
  return Object.fromEntries(CATALOG_TYPES.map((t) => [t, []])) as unknown as Catalogs;
}

/** Elemento de agenda tal como se guarda (con los eventos de historial ya registrados desde la cita). */
export type StoredAgendaItem = AgendaItem & { historyEventIds?: EventId[] };

/** Usuario autenticado de la petición. */
export interface AuthUser {
  id: string;
  email?: string;
  name: string;
  profiles: Profile[];
}
