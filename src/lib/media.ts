import { useEffect, useState } from 'react';
import { ENV } from '../config/company';

/**
 * Real destination media from Wikipedia / Wikimedia Commons.
 *
 * - Lead images come from the Wikipedia Action API (pageimages), batched: one request
 *   covers up to 50 destinations. pageimages only returns freely licensed images.
 * - Galleries (destination pages only) come from the article's media list.
 * - Author + licence are fetched from Commons, also batched.
 * Everything degrades to a labelled illustration when offline, rate-limited or disabled.
 */
export interface MediaImage {
  title: string; // File:...
  src: string;
  srcLarge: string;
  author?: string;
  license?: string;
  licenseUrl?: string;
  page: string;
}
export interface MediaSet {
  status: 'loading' | 'ready' | 'error';
  lead?: MediaImage;
  gallery: MediaImage[];
  article?: string;
}

const BAD = /(map|locator|flag|seal|logo|emblem|coat_of_arms|\.svg|\.png|\.gif|\.tif|icon|symbol|diagram|chart|signature|population|graph|_plan|montage|collage)/i;
const stripHtml = (s?: string) => (s ? s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : undefined);
const https = (u: string) => (u.startsWith('//') ? `https:${u}` : u);
const filePage = (title: string) => `https://commons.wikimedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
const thumb = (url: string, w: number) => {
  // upload.wikimedia.org/wikipedia/commons/a/ab/File.jpg → .../thumb/a/ab/File.jpg/{w}px-File.jpg
  const m = url.match(/^(https:\/\/upload\.wikimedia\.org\/wikipedia\/commons)\/(\w)\/(\w\w)\/([^?]+)/);
  if (!m) return url;
  return `${m[1]}/thumb/${m[2]}/${m[3]}/${m[4]}/${w}px-${m[4]}`;
};

async function fetchJSON(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

/** Wikimedia serves only standard thumbnail widths (e.g. 500, 960, 1280, 1920). */
/** Generic micro-batcher: collects keys for a tick, resolves each from one request. */
function batcher<T>(size: number, run: (keys: string[]) => Promise<Record<string, T>>) {
  let queue: { key: string; resolve: (v: T | undefined) => void }[] = [];
  let timer: number | undefined;
  const flush = async () => {
    timer = undefined;
    const q = queue;
    queue = [];
    for (let i = 0; i < q.length; i += size) {
      const chunk = q.slice(i, i + size);
      const keys = [...new Set(chunk.map((c) => c.key))];
      let res: Record<string, T> = {};
      try {
        res = await run(keys);
      } catch {
        res = {};
      }
      chunk.forEach((c) => c.resolve(res[c.key]));
    }
  };
  return (key: string) =>
    new Promise<T | undefined>((resolve) => {
      queue.push({ key, resolve });
      if (!timer) timer = window.setTimeout(flush, 40);
    });
}

interface Lead { file: string; original: string; width: number }
const leadBatch = batcher<Lead>(45, async (titles) => {
  const url = `https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&piprop=original|name&redirects=1&format=json&origin=*&titles=${encodeURIComponent(titles.join('|'))}`;
  const j = await fetchJSON(url);
  const back: Record<string, string> = {};
  (j.query?.normalized ?? []).forEach((n: { from: string; to: string }) => (back[n.to] = n.from));
  (j.query?.redirects ?? []).forEach((n: { from: string; to: string }) => (back[n.to] = back[n.from] ?? n.from));
  const out: Record<string, Lead> = {};
  Object.values(j.query?.pages ?? {}).forEach((p: any) => {
    if (!p.pageimage || !p.original?.source) return;
    const key = back[p.title] ?? p.title;
    out[key] = { file: `File:${p.pageimage}`, original: p.original.source, width: p.original.width };
    out[p.title] = out[key];
  });
  return out;
});

interface Attr { author?: string; license?: string; licenseUrl?: string; url?: string; thumb?: string; width?: number }
const attrBatch = batcher<Attr>(45, async (files) => {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=extmetadata|url|size&iiextmetadatafilter=Artist|LicenseShortName|LicenseUrl&format=json&origin=*&titles=${encodeURIComponent(files.join('|'))}`;
  const j = await fetchJSON(url);
  const back: Record<string, string> = {};
  (j.query?.normalized ?? []).forEach((n: { from: string; to: string }) => (back[n.to] = n.from));
  const out: Record<string, Attr> = {};
  Object.values(j.query?.pages ?? {}).forEach((p: any) => {
    const ii = p.imageinfo?.[0] ?? {};
    const m = ii.extmetadata ?? {};
    const rec = { author: stripHtml(m.Artist?.value), license: m.LicenseShortName?.value, licenseUrl: m.LicenseUrl?.value, url: ii.url, thumb: ii.thumburl, width: ii.width };
    out[p.title] = rec;
    if (back[p.title]) out[back[p.title]] = rec;
  });
  return out;
});

const cache = new Map<string, Promise<MediaSet>>();

async function load(article: string, max: number, preferFile?: string): Promise<MediaSet> {
  if (ENV.disableRemoteMedia) return { status: 'error', gallery: [] };
  const articleUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(article.replace(/ /g, '_'))}`;
  const gallery: MediaImage[] = [];
  // A destination can pin a specific, reviewed Commons file as its lead image.
  if (preferFile) {
    const title = preferFile.startsWith('File:') ? preferFile : `File:${preferFile}`;
    const a = await attrBatch(title);
    if (a?.url) gallery.push({ title, src: a.width && a.width > 500 ? thumb(a.url, 500) : a.url, srcLarge: a.width && a.width > 1280 ? thumb(a.url, 1280) : a.url, page: filePage(title), author: a.author, license: a.license, licenseUrl: a.licenseUrl });
  }
  const l = gallery.length ? undefined : await leadBatch(article);
  if (l && !BAD.test(l.file)) {
    gallery.push({ title: l.file, src: l.width > 500 ? thumb(l.original, 500) : l.original, srcLarge: l.width > 1280 ? thumb(l.original, 1280) : l.original, page: filePage(l.file) });
  }
  // Galleries — or a fallback when the article's lead image is a map, flag or collage.
  if (max > 1 || !gallery.length) {
    const list = await fetchJSON(`https://en.wikipedia.org/api/rest_v1/page/media-list/${encodeURIComponent(article.replace(/ /g, '_'))}`).catch(() => null);
    const seen = new Set(gallery.map((g) => g.title.replace(/ /g, '_')));
    (list?.items ?? []).forEach((it: any) => {
      if (gallery.length >= Math.max(1, max)) return;
      if (it.type !== 'image' || !it.srcset?.length || BAD.test(it.title) || seen.has(it.title.replace(/ /g, '_'))) return;
      seen.add(it.title.replace(/ /g, '_'));
      gallery.push({ title: it.title, src: https(it.srcset[0].src), srcLarge: https(it.srcset[it.srcset.length - 1].src), page: filePage(it.title) });
    });
  }
  const attrs = await Promise.all(gallery.map((g) => (g.author || g.license ? Promise.resolve(undefined) : attrBatch(g.title))));
  gallery.forEach((g, i) => {
    const a = attrs[i];
    if (a) Object.assign(g, { author: a.author, license: a.license, licenseUrl: a.licenseUrl });
  });
  return { status: gallery.length ? 'ready' : 'error', lead: gallery[0], gallery, article: articleUrl };
}

/** Article titles may carry a pinned lead file: "Varanasi#File:Some_photo.jpg". */
export function getMedia(article: string, max = 8) {
  const key = `${article}|${max}`;
  const [title, file] = article.split('#');
  if (!cache.has(key)) cache.set(key, load(title, max, file).catch(() => ({ status: 'error' as const, gallery: [] })));
  return cache.get(key)!;
}

export function useMedia(article: string | undefined, max = 8): MediaSet {
  const [m, setM] = useState<MediaSet>({ status: 'loading', gallery: [] });
  useEffect(() => {
    if (!article) return;
    let alive = true;
    setM({ status: 'loading', gallery: [] });
    getMedia(article, max).then((r) => alive && setM(r));
    return () => {
      alive = false;
    };
  }, [article, max]);
  return m;
}
