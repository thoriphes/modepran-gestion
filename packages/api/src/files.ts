/**
 * Ficheros en S3 (spec §8): subida con URL firmada PUT y lectura con URL firmada GET (5 min).
 * Claves: `animals/<id>/photo.jpg`, `animals/<id>/thumb.jpg`, `animals/<id>/events/<nombre>.<ext>`,
 * `incidents/<id>/<photoId>.<ext>`, `public/animals/<id>.jpg` (servido por CloudFront en `/public-files/`).
 */
import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const SIGNED_URL_SECONDS = 300;

export interface FileStore {
  uploadUrl(key: string, contentType: string): Promise<string>;
  downloadUrl(key: string, downloadName?: string): Promise<string>;
  copy(fromKey: string, toKey: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export const fileKeys = {
  animalPhoto: (id: number) => `animals/${id}/photo.jpg`,
  animalThumb: (id: number) => `animals/${id}/thumb.jpg`,
  animalPrefix: (id: number) => `animals/${id}/`,
  eventDocPrefix: (id: number) => `animals/${id}/events/`,
  incidentPrefix: (id: string) => `incidents/${id}/`,
  publicAnimal: (id: number) => `public/animals/${id}.jpg`,
  publicAnimalUrl: (id: number) => `/public-files/animals/${id}.jpg`,
};

export function createS3FileStore(opts: { bucket: string; client?: S3Client; region?: string }): FileStore {
  const s3 = opts.client ?? new S3Client(opts.region ? { region: opts.region } : {});
  const Bucket = opts.bucket;
  return {
    uploadUrl: (key, contentType) =>
      getSignedUrl(s3, new PutObjectCommand({ Bucket, Key: key, ContentType: contentType }), { expiresIn: SIGNED_URL_SECONDS }),
    downloadUrl: (key, downloadName) =>
      getSignedUrl(
        s3,
        new GetObjectCommand({
          Bucket,
          Key: key,
          ...(downloadName ? { ResponseContentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(downloadName)}` } : {}),
        }),
        { expiresIn: SIGNED_URL_SECONDS },
      ),
    async copy(fromKey, toKey) {
      await s3.send(new CopyObjectCommand({ Bucket, Key: toKey, CopySource: `${Bucket}/${encodeURI(fromKey)}`, MetadataDirective: 'COPY' }));
    },
    async delete(key) {
      await s3.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },
  };
}

/** Versión en memoria: registra las operaciones (tests y dev). */
export interface MemoryFileStore extends FileStore {
  readonly objects: Set<string>;
  readonly ops: string[];
}

export function createMemoryFileStore(base = 'https://files.local'): MemoryFileStore {
  const objects = new Set<string>();
  const ops: string[] = [];
  return {
    objects,
    ops,
    async uploadUrl(key) {
      ops.push(`put-url ${key}`);
      objects.add(key); // se supone que el navegador sube
      return `${base}/${key}?signed=put`;
    },
    async downloadUrl(key) {
      return `${base}/${key}?signed=get`;
    },
    async copy(from, to) {
      ops.push(`copy ${from} ${to}`);
      if (objects.has(from)) objects.add(to);
    },
    async delete(key) {
      ops.push(`delete ${key}`);
      objects.delete(key);
    },
  };
}
