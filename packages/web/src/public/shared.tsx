/** Utilidades de la web pública de adopciones (sin login; todo pasa por lib/api.ts). */
import { formatAge, GENDER_LABELS, SIZE_LABELS, todayMadrid } from '@modepran/domain';
import { createApi, type Api, type PublicAnimal } from '../lib/api';
import { joinUrl, loadConfig } from '../lib/config';

let apiPromise: Promise<{ api: Api; publicFilesBaseUrl: string }> | undefined;

export function publicApi() {
  apiPromise ??= loadConfig().then((c) => ({
    api: createApi({ baseUrl: c.apiBaseUrl, getHeaders: async () => ({}) }),
    publicFilesBaseUrl: c.publicFilesBaseUrl,
  }));
  return apiPromise;
}

/** URL de la foto: absoluta o relativa al origen tal cual; una clave suelta, bajo `publicFilesBaseUrl`. */
export function photoSrc(url: string | undefined, publicFilesBaseUrl: string): string | undefined {
  if (!url) return undefined;
  if (/^(https?:)?\/\//.test(url) || url.startsWith('/') || url.startsWith('data:')) return url;
  return joinUrl(publicFilesBaseUrl, url);
}

export function ageText(a: Pick<PublicAnimal, 'age' | 'bornAt'>): string | undefined {
  if (a.age) return a.age;
  if (a.bornAt) return formatAge(a.bornAt, todayMadrid());
  return undefined;
}

export const genderText = (a: PublicAnimal) => (a.gender === 'none' ? undefined : GENDER_LABELS[a.gender]);
export const sizeText = (a: PublicAnimal) => (a.size ? SIZE_LABELS[a.size] : undefined);

export function speciesEmoji(a: Pick<PublicAnimal, 'species' | 'speciesCode'>): string {
  const k = (a.speciesCode ?? a.species ?? '').toLowerCase();
  if (k.startsWith('perr') || k === 'can') return '🐶';
  if (k.startsWith('gat') || k === 'fel') return '🐱';
  return '🐾';
}

/** Enlace a la ficha. Se usa `?id=` porque CloudFront aún no tiene fallback para `/adopta/<id>`. */
export const detailHref = (id: number) => `/adopta/animal/?id=${id}`;

export function Photo({ a, src, className }: { a: PublicAnimal; src: string | undefined; className?: string }) {
  return src ? (
    <img src={src} alt={`Foto de ${a.name}`} loading="lazy" className={`${className ?? ''} object-cover`} />
  ) : (
    <div className={`${className ?? ''} grid place-items-center bg-gradient-to-br from-accent-100 to-amber-50 text-6xl dark:from-accent-950 dark:to-stone-900`} aria-hidden="true">
      {speciesEmoji(a)}
    </div>
  );
}

export function Traits({ a }: { a: PublicAnimal }) {
  const chips: [string, string][] = [];
  if (a.compatibleDogs) chips.push(['🐕', 'Se lleva bien con perros']);
  if (a.compatibleCats) chips.push(['🐈', 'Se lleva bien con gatos']);
  if (a.sterilized) chips.push(['✔', a.gender === 'female' ? 'Esterilizada' : 'Esterilizado']);
  if (!chips.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {chips.map(([icon, text]) => (
        <li key={text} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
          <span aria-hidden="true">{icon}</span>
          {text}
        </li>
      ))}
    </ul>
  );
}
