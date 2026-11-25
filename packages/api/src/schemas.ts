/** Esquemas zod de entrada (las reglas de negocio las valida el dominio). */
import { z } from 'zod';

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha YYYY-MM-DD');
export const time = z.string().regex(/^\d{2}:\d{2}$/, 'hora HH:MM');
const str = (max = 500) => z.string().trim().max(max);
const optStr = (max = 500) => str(max).optional();

/** Booleano en query string. */
export const qBool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1')
  .optional();
export const qNum = z.coerce.number().finite().optional();
export const qInt = z.coerce.number().int().positive().optional();

export const contactData = z.object({
  name: str(200).min(1),
  surname: optStr(200),
  nif: optStr(30),
  address: optStr(300),
  zip: optStr(10),
  province: optStr(100),
  cityId: optStr(100),
  cityName: optStr(150),
  phone: optStr(50),
  email: z.string().trim().email().max(200).optional().or(z.literal('').transform(() => undefined)),
});

export const chipSchema = z.object({
  number: str(50).min(1),
  passport: optStr(100),
  owner: optStr(200),
  phone: optStr(50),
  notes: optStr(2000),
});

export const animalInput = z.object({
  name: str(150).min(1),
  speciesId: str(100).min(1),
  breedId: optStr(100),
  breedName: optStr(150),
  color: optStr(100),
  gender: z.enum(['male', 'female', 'none']),
  weightKg: z.number().nonnegative().max(1000).optional(),
  size: z.enum(['small', 'medium', 'big']).optional(),
  bornAt: isoDate.optional(),
  sterilized: z.boolean().default(false),
  ppp: z.boolean().default(false),
  visibleWeb: z.boolean().default(false),
  compatibleDogs: z.boolean().default(false),
  compatibleCats: z.boolean().default(false),
  chip: chipSchema.nullable().optional(),
});

export const animalPatch = animalInput.partial().extend({
  weightKg: z.number().nonnegative().max(1000).nullable().optional(),
  size: z.enum(['small', 'medium', 'big']).nullable().optional(),
  bornAt: isoDate.nullable().optional(),
  breedId: str(100).nullable().optional(),
  color: str(100).nullable().optional(),
});

export const eventInput = z.object({
  subtypeId: str(100).min(1),
  date: isoDate.optional(),
  userId: optStr(100),
  contact: z.object({ contactId: z.number().int().positive().optional(), data: contactData.optional() }).optional(),
  centerId: optStr(100),
  vaccineId: optStr(100),
  illnessId: optStr(100),
  colonyId: optStr(100),
  cityId: optStr(100),
  cityName: optStr(150),
  address: optStr(300),
  zip: optStr(10),
  collectionDate: isoDate.optional(),
  notes: optStr(5000),
  switchValue: z.boolean().optional(),
  document: z.object({ key: str(500).min(1), originalName: str(300).min(1) }).optional(),
});

export const animalFiltersQuery = z.object({
  id: qInt,
  name: optStr(),
  chip: optStr(),
  speciesId: optStr(),
  breedId: optStr(),
  gender: z.enum(['male', 'female', 'none']).optional(),
  color: optStr(),
  size: z.enum(['small', 'medium', 'big']).optional(),
  ppp: qBool,
  weightMin: qNum,
  weightMax: qNum,
  ageMin: qNum,
  ageMax: qNum,
  compatibleDogs: qBool,
  compatibleCats: qBool,
  arrivalCityId: optStr(),
  arrivalZoneId: optStr(),
  arrivalUserId: optStr(),
  arrivalSubtypeId: optStr(),
  sterilized: qBool,
  illnessId: optStr(),
  centerId: optStr(),
  statusId: optStr(),
  statusDateFrom: isoDate.optional(),
  statusDateTo: isoDate.optional(),
  visibleWeb: qBool,
  hasChip: qBool,
  hasPhoto: qBool,
  arrivalDateFrom: isoDate.optional(),
  arrivalDateTo: isoDate.optional(),
  exitDateFrom: isoDate.optional(),
  exitDateTo: isoDate.optional(),
  contact: optStr(),
  q: optStr(),
  page: qInt,
  pageSize: qInt,
  sort: z.enum(['id', 'name', 'arrivalDate', 'exitDate', 'bornAt', 'updatedAt', 'weightKg']).optional(),
  dir: z.enum(['asc', 'desc']).optional(),
});
export type AnimalFiltersQuery = z.infer<typeof animalFiltersQuery>;

export const reportQuery = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  zoneId: optStr(),
  cityId: optStr(),
  centerId: optStr(),
});

export const action = z.object({ categoryId: optStr(100), subcategoryId: optStr(100), text: optStr(500) });
export const owner = z.object({ name: str(200).min(1), phone: optStr(50), email: optStr(200) });

export const agendaInput = z.object({
  kind: z.enum(['cita', 'aviso', 'nota']),
  agenda: z.enum(['carlet', 'modevet', 'ambas']),
  date: isoDate,
  time: time.optional().or(z.literal('')),
  text: optStr(5000),
  appointmentTypeId: optStr(100),
  requestedById: optStr(100),
  animalId: z.number().int().positive().optional(),
  externalAnimal: z.object({ name: str(150), species: str(100).default('') }).optional(),
  species: z.enum(['CAN', 'FEL', 'otra']).optional(),
  actions: z.array(action).max(50).optional(),
  owner: owner.optional(),
  isReferral: z.boolean().optional(),
});

export const agendaPatch = z.object({
  status: z.enum(['pendiente', 'concluida', 'no_presentado', 'cancelada', 'reagendada', 'concluido']).optional(),
  text: optStr(5000),
  actions: z.array(action).max(50).optional(),
  owner: owner.optional(),
  date: isoDate.optional(),
  time: z.string().optional(),
});

export const incidentInput = z.object({
  animalId: z.number().int().positive().optional(),
  animalName: optStr(150),
  species: z.enum(['CAN', 'FEL', 'otra']),
  areaId: str(100).min(1),
  text: str(5000).min(1),
  priority: z.enum(['normal', 'importante', 'urgente']).default('normal'),
  reporterStaffId: optStr(100),
});
