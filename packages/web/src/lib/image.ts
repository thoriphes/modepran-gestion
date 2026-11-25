/**
 * Redimensionado de imágenes en el navegador antes de subirlas (spec §8):
 * - Fotos de animales: 700 px (lado mayor) + miniatura 200 px, JPEG.
 * - Fotos de incidencias: 1400 px, JPEG calidad 0.78.
 * La parte de cálculo (`fitWithin`) es pura y se prueba en Vitest; el pintado usa canvas.
 */

export const ANIMAL_PHOTO_MAX = 700;
export const ANIMAL_THUMB_MAX = 200;
export const ANIMAL_PHOTO_QUALITY = 0.85;
export const INCIDENT_PHOTO_MAX = 1400;
export const INCIDENT_PHOTO_QUALITY = 0.78;

/** Dimensiones que caben en `max`×`max` conservando proporción; nunca amplía. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Nombre `.jpg` para un fichero convertido. */
export function jpegName(name: string): string {
  const base = name.replace(/\.[^.]+$/, '') || 'foto';
  return `${base}.jpg`;
}

async function loadBitmap(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      /* HEIC u otros: probar con <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error('No se puede leer la imagen (formato no soportado por este navegador).');
  }
}

/** Redimensiona a JPEG. */
export async function resizeImage(file: Blob, max: number, quality: number): Promise<Blob> {
  const bmp = await loadBitmap(file);
  try {
    const { width, height } = fitWithin(bmp.width, bmp.height, max);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas no disponible');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp.source, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo convertir la imagen'))), 'image/jpeg', quality),
    );
  } finally {
    bmp.close();
  }
}

export async function animalPhotoVariants(file: Blob): Promise<{ photo: Blob; thumb: Blob }> {
  const [photo, thumb] = await Promise.all([
    resizeImage(file, ANIMAL_PHOTO_MAX, ANIMAL_PHOTO_QUALITY),
    resizeImage(file, ANIMAL_THUMB_MAX, ANIMAL_PHOTO_QUALITY),
  ]);
  return { photo, thumb };
}

export function incidentPhoto(file: Blob): Promise<Blob> {
  return resizeImage(file, INCIDENT_PHOTO_MAX, INCIDENT_PHOTO_QUALITY);
}
