import { describe, expect, it } from 'vitest';
import { ANIMAL_PHOTO_MAX, ANIMAL_THUMB_MAX, fitWithin, INCIDENT_PHOTO_MAX, jpegName } from '../src/lib/image';

describe('fitWithin', () => {
  it('reduce el lado mayor al máximo conservando proporción', () => {
    expect(fitWithin(4000, 3000, ANIMAL_PHOTO_MAX)).toEqual({ width: 700, height: 525 });
    expect(fitWithin(3000, 4000, ANIMAL_THUMB_MAX)).toEqual({ width: 150, height: 200 });
    expect(fitWithin(4032, 3024, INCIDENT_PHOTO_MAX)).toEqual({ width: 1400, height: 1050 });
  });
  it('nunca amplía', () => {
    expect(fitWithin(500, 300, 700)).toEqual({ width: 500, height: 300 });
  });
  it('dimensiones inválidas → 0', () => {
    expect(fitWithin(0, 100, 700)).toEqual({ width: 0, height: 0 });
    expect(fitWithin(NaN, 100, 700)).toEqual({ width: 0, height: 0 });
  });
  it('nunca baja de 1 px', () => {
    expect(fitWithin(10000, 1, 200)).toEqual({ width: 200, height: 1 });
  });
});

describe('jpegName', () => {
  it('cambia la extensión', () => {
    expect(jpegName('IMG_0001.HEIC')).toBe('IMG_0001.jpg');
    expect(jpegName('foto')).toBe('foto.jpg');
    expect(jpegName('.png')).toBe('foto.jpg');
  });
});
