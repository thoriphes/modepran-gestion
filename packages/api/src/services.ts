/**
 * Servicios compartidos por las rutas: cachés del contenedor, auditoría, ciudades/razas al vuelo,
 * contactos de eventos (regla 6) y foto pública.
 */
import type { Context } from 'hono';
import {
  addContactKind,
  catalogIndex,
  contactKindForSubtype,
  foldText,
  normalizeBreed,
  normalizeCity,
  resolveEventContact,
  todayMadrid,
  type Animal,
  type AuditAction,
  type Contact,
  type ContactData,
  type ContactId,
  type HistoryEvent,
  type Subtype,
  type User,
} from '@modepran/domain';
import { ApiError } from './http.js';
import type { FileStore } from './files.js';
import { fileKeys } from './files.js';
import type { Repository } from './repo/types.js';
import type { AuthUser, Catalogs } from './types.js';
import type { UserDirectory } from './users.js';

export interface Deps {
  repo: Repository;
  files: FileStore;
  users: UserDirectory;
  /** Usuario de la petición (claims del JWT en Lambda; cabeceras en dev). `null` = sin autenticar. */
  auth: (c: Context) => AuthUser | null | Promise<AuthUser | null>;
  clock?: () => Date;
  newId?: () => string;
  /** URL del logo para los documentos. Por defecto `/images/logo.png`. */
  logoUrl?: string;
  /** Caché de listados en el contenedor (ms). Por defecto 30 000. */
  cacheTtlMs?: number;
}

export type AppEnv = { Variables: { user: AuthUser; svc: Services } };

class Cached<T> {
  private value: T | undefined;
  private at = 0;
  private pending: Promise<T> | undefined;
  constructor(
    private readonly load: () => Promise<T>,
    private readonly ttl: number,
    private readonly now: () => number,
  ) {}
  async get(): Promise<T> {
    if (this.value !== undefined && this.now() - this.at < this.ttl) return this.value;
    if (!this.pending) {
      this.pending = this.load()
        .then((v) => {
          this.value = v;
          this.at = this.now();
          return v;
        })
        .finally(() => (this.pending = undefined));
    }
    return this.pending;
  }
  invalidate() {
    this.value = undefined;
  }
}

export class Services {
  readonly repo: Repository;
  readonly files: FileStore;
  readonly users: UserDirectory;
  readonly logoUrl: string;
  private readonly clock: () => Date;
  private readonly makeId: () => string;
  private readonly catalogCache: Cached<Catalogs>;
  private readonly animalCache: Cached<Animal[]>;
  private readonly eventCache: Cached<HistoryEvent[]>;
  private readonly userCache: Cached<User[]>;

  constructor(deps: Deps) {
    this.repo = deps.repo;
    this.files = deps.files;
    this.users = deps.users;
    this.logoUrl = deps.logoUrl ?? '/images/logo.png';
    this.clock = deps.clock ?? (() => new Date());
    this.makeId = deps.newId ?? (() => crypto.randomUUID());
    const ttl = deps.cacheTtlMs ?? 30_000;
    const now = () => this.clock().getTime();
    this.catalogCache = new Cached(() => this.repo.getCatalogs(), ttl, now);
    this.animalCache = new Cached(() => this.repo.listAnimals(), ttl, now);
    this.eventCache = new Cached(() => this.repo.listEvents(), ttl, now);
    this.userCache = new Cached(() => this.users.list().catch(() => [] as User[]), 5 * 60_000, now);
  }

  now(): string {
    return this.clock().toISOString();
  }
  today(): string {
    return todayMadrid(this.clock());
  }
  newId(): string {
    return this.makeId();
  }

  catalogs() {
    return this.catalogCache.get();
  }
  animals() {
    return this.animalCache.get();
  }
  allEvents() {
    return this.eventCache.get();
  }
  userList() {
    return this.userCache.get();
  }
  /** Tras escribir animales o eventos. */
  invalidateAnimals() {
    this.animalCache.invalidate();
    this.eventCache.invalidate();
  }
  invalidateCatalogs() {
    this.catalogCache.invalidate();
  }
  invalidateUsers() {
    this.userCache.invalidate();
  }

  async audit(user: AuthUser, action: AuditAction, entity: string, entityId: string | number, summary: string) {
    await this.repo.addAudit({
      id: this.newId(),
      at: this.now(),
      userId: user.id,
      userName: user.name,
      action,
      entity,
      entityId: String(entityId),
      summary,
    });
  }

  /** Ciudad por nombre (sin tildes ni mayúsculas) o nueva, normalizada (regla 9). */
  async resolveCity(user: AuthUser, name: string): Promise<{ id: string; name: string }> {
    const clean = normalizeCity(name);
    if (!clean) throw new ApiError(422, 'required', 'Indica la ciudad.', 'cityName');
    const cats = await this.catalogs();
    const found = cats.cities.find((c) => foldText(c.name) === foldText(clean));
    if (found) return { id: found.id, name: found.name };
    const city = { id: this.newId(), name: clean, active: true };
    await this.repo.putCatalogItem('cities', city);
    this.invalidateCatalogs();
    await this.audit(user, 'create', 'catalog:cities', city.id, `Ciudad creada al vuelo: ${clean}`);
    return city;
  }

  async resolveBreed(user: AuthUser, speciesId: string, name: string): Promise<string> {
    const clean = normalizeBreed(name);
    const cats = await this.catalogs();
    const found = cats.breeds.find((b) => b.speciesId === speciesId && foldText(b.name) === foldText(clean));
    if (found) return found.id;
    const breed = { id: this.newId(), name: clean, speciesId, active: true };
    await this.repo.putCatalogItem('breeds', breed);
    this.invalidateCatalogs();
    await this.audit(user, 'create', 'catalog:breeds', breed.id, `Raza creada al vuelo: ${clean}`);
    return breed.id;
  }

  /**
   * Contacto de un evento (regla 6): usa, actualiza o crea; añade el tipo de contacto del subtipo.
   * Devuelve el id y el contacto si se ha creado o cambiado.
   */
  async resolveEventContact(
    user: AuthUser,
    input: { contactId?: ContactId | undefined; data?: ContactData | undefined } | undefined,
    subtype: Subtype,
  ): Promise<{ contactId?: ContactId; contact?: Contact }> {
    if (!subtype.contact || !input || (input.contactId === undefined && !input.data)) return {};
    const kind = contactKindForSubtype(subtype);
    const data = input.data;
    if (data?.cityName && !data.cityId) data.cityId = (await this.resolveCity(user, data.cityName)).id;
    const byNif = data?.nif ? await this.repo.findContactByNif(data.nif) : undefined;
    let res;
    try {
      res = resolveEventContact({ ...(input.contactId !== undefined ? { contactId: input.contactId } : {}), ...(data ? { data } : {}) }, () => byNif);
    } catch (e) {
      throw new ApiError(422, 'required', e instanceof Error ? e.message : 'Faltan los datos del contacto.', 'contact');
    }
    if (res.action === 'create') {
      const contact: Contact = { id: await this.repo.nextId('contact'), ...res.data, kind: addContactKind([], kind), createdAt: this.now() };
      await this.repo.saveContact(contact);
      await this.audit(user, 'create', 'contact', contact.id, `Contacto creado desde un evento`);
      return { contactId: contact.id, contact };
    }
    const previous = await this.repo.getContact(res.contactId);
    if (!previous) throw new ApiError(422, 'contact_not_found', 'El contacto no existe.', 'contactId');
    const next: Contact = res.action === 'update' ? { ...previous, ...res.data, kind: addContactKind(previous.kind, kind) } : { ...previous, kind: addContactKind(previous.kind, kind) };
    if (JSON.stringify(next) !== JSON.stringify(previous)) {
      await this.repo.saveContact(next, previous);
      await this.audit(user, 'update', 'contact', next.id, `Contacto actualizado desde un evento`);
      return { contactId: next.id, contact: next };
    }
    return { contactId: next.id };
  }

  /** ¿Debe estar la foto en la web pública? visibleWeb + disponible + con foto. */
  isPublic(animal: Animal, cats: Catalogs): boolean {
    return animal.visibleWeb && animal.hasPhoto && catalogIndex(cats).statusCode(animal.statusId) === 'disponible';
  }

  /** Copia o borra `public/animals/<id>.jpg` si cambia la visibilidad pública. */
  async syncPublicPhoto(before: Animal | undefined, after: Animal | undefined, force = false): Promise<void> {
    const cats = await this.catalogs();
    const was = before ? this.isPublic(before, cats) : false;
    const is = after ? this.isPublic(after, cats) : false;
    const id = (after ?? before)!.id;
    if (is && (!was || force)) await this.files.copy(fileKeys.animalPhoto(id), fileKeys.publicAnimal(id));
    else if (!is && was) await this.files.delete(fileKeys.publicAnimal(id));
  }

  /** Nombre del trabajador: personal (catálogo) o usuario de Cognito. */
  async workerName(userId: string | undefined): Promise<string | undefined> {
    if (!userId) return undefined;
    const cats = await this.catalogs();
    const staff = cats.staff.find((s) => s.id === userId);
    if (staff) return staff.name;
    const users = await this.userList();
    return users.find((u) => u.id === userId)?.name;
  }
}
