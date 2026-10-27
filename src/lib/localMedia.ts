import manifest from '../data/media.json';

/**
 * Locally hosted real photographs (downloaded from Wikimedia Commons by
 * scripts/fetch-media.mjs). Every image keeps its author, licence and source page.
 */
export interface LocalImage {
  file: string;
  width: number;
  height: number;
  author: string;
  license?: string;
  licenseUrl?: string;
  source: string;
  sizes: Record<string, string>;
}
interface Entry { article: string; caption?: string; images: LocalImage[] }

const M = manifest as unknown as Record<string, Entry>;
const base = import.meta.env.BASE_URL.replace(/\/$/, '');
const url = (p?: string) => (p ? `${base}${p}` : undefined);

export function localEntry(id: string): Entry | undefined {
  const e = M[id];
  return e && e.images.length ? e : undefined;
}

export function localImages(id: string) {
  return localEntry(id)?.images ?? [];
}

/** srcset helpers: card (960), large (1920), hero (3840 / 4K when the original allows). */
export function srcOf(img: LocalImage, want: 'thumb' | 'card' | 'large' | 'hero') {
  const s = img.sizes;
  if (want === 'thumb') return url(s['480'] ?? s['960']);
  if (want === 'card') return url(s['960']);
  if (want === 'large') return url(s['1920'] ?? s['960']);
  return url(s['3840'] ?? s['1920'] ?? s['960']);
}
export function srcSet(img: LocalImage) {
  return Object.entries(img.sizes).map(([w, p]) => `${url(p)} ${w}w`).join(', ');
}
export const creditLine = (img: LocalImage) => `${img.author.slice(0, 60)}${img.license ? ` · ${img.license}` : ''}`;
export const fileLabel = (img: LocalImage) => img.file.replace(/^File:/, '').replace(/\.[a-z]+$/i, '').replace(/_/g, ' ');
