#!/usr/bin/env node
/** Downloads freely licensed recordings from Wikimedia Commons (MP3 transcodes) and writes src/data/audio.json. */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'TravelGuideMediaFetcher/1.0 (build script; freely licensed audio with attribution)';
const AMBIENCE = {
  forest: 'File:Birdsong morning 01.ogg',
  rain: 'File:Summer thunderstorm in the woods.ogg',
  wind: 'File:Howling wind.ogg',
  ocean: 'File:Ocean Waves on a Tropical Beach.ogg',
  city: 'File:Urban Street on a Rainy Afternoon.flac',
};
const MUSIC = {
  forest: 'File:Indian Folk Classical Flute Music (1).wav',
  rainforest: 'File:Indian Folk Classical Flute Music (1).wav',
  valley: 'File:Samuel Corwin - A Man Approaches with Bowed Sitar, Rishikesh.ogg',
  snow: 'File:Samuel Corwin - A Man Approaches with Bowed Sitar, Rishikesh.ogg',
  beach: 'File:Sitar and tabla rendition - Freedom Jam, 2015.oga',
  city: 'File:Mystery Bazaar (ISRC USUAN1700005).mp3',
  default: 'File:Sitar and tabla rendition - Freedom Jam, 2015.oga',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (s) => (s ? s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : 'Unknown');
async function get(url) {
  for (let i = 0; i < 6; i++) {
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    if (r.status === 429 || r.status >= 500) { await sleep(3000 * (i + 1)); continue; }
    return r;
  }
  throw new Error(`Failed ${url}`);
}
const titles = [...new Set([...Object.values(AMBIENCE), ...Object.values(MUSIC)])];
const j = await (await get(`https://commons.wikimedia.org/w/api.php?action=query&prop=videoinfo&viprop=url|extmetadata|derivatives&viextmetadatafilter=Artist|LicenseShortName|ObjectName&format=json&titles=${encodeURIComponent(titles.join('|'))}`)).json();
const info = {};
const back = {};
(j.query.normalized ?? []).forEach((n) => (back[n.to] = n.from));
Object.values(j.query.pages).forEach((p) => {
  const vi = p.videoinfo?.[0];
  if (!vi) return;
  const mp3 = (vi.derivatives ?? []).find((d) => d.src.includes('.mp3'))?.src ?? (vi.url.includes('.mp3') ? vi.url : null);
  const rec = { file: p.title, mp3, author: strip(vi.extmetadata?.Artist?.value), license: vi.extmetadata?.LicenseShortName?.value, source: `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}` };
  info[p.title] = rec;
  if (back[p.title]) info[back[p.title]] = rec;
});
const out = { ambience: {}, music: {} };
const done = {};
mkdirSync(join(ROOT, 'public', 'audio'), { recursive: true });
for (const [group, map] of [['ambience', AMBIENCE], ['music', MUSIC]]) {
  for (const [key, title] of Object.entries(map)) {
    const rec = info[title];
    if (!rec?.mp3) { console.warn('✗', key, title); continue; }
    const name = `${title.replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.mp3`;
    if (!done[name] && !existsSync(join(ROOT, 'public', 'audio', name))) {
      const r = await get(rec.mp3).catch(() => null);
      if (!r || !r.ok) { console.warn('✗ download failed', key); continue; }
      writeFileSync(join(ROOT, 'public', 'audio', name), Buffer.from(await r.arrayBuffer()));
      done[name] = true;
      await sleep(1500);
    }
    out[group][key] = { file: rec.file, src: `/audio/${name}`, author: rec.author, license: rec.license, source: rec.source };
    console.log('✓', group, key, '←', rec.file, `(${rec.license})`);
  }
}
writeFileSync(join(ROOT, 'src', 'data', 'audio.json'), JSON.stringify(out, null, 1));
