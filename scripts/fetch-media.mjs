#!/usr/bin/env node
/**
 * Downloads real, freely licensed photographs from Wikimedia Commons into public/media
 * and writes src/data/media.json (paths + author + licence + source page).
 *
 * Usage: node scripts/fetch-media.mjs [--only id1,id2] [--force]
 *
 * Selection rules: landscape orientation, original width ≥ 1600 px, free licence reported
 * by Commons, no maps/flags/logos/diagrams. A destination may pin a reviewed file with
 * "Article#File:Name.jpg" in its `wiki` field (or in SUBJECTS below).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'media');
const MANIFEST = join(ROOT, 'src', 'data', 'media.json');
const UA = 'TravelGuideMediaFetcher/1.0 (build script; downloads freely licensed images with attribution)';
const BAD = /(inscription|plaque|ruskin|invitation|archive|painting|piranesi|exposition|lithograph|engraving|etching|blitz|damage|tafel|store|shop front|loves[_ ]wikimedia|wiki[_ ]loves|railway[_ ]station|bus[_ ]stand|airport|hospital|college|university|school|office|police|court|municipal|signboard|map|locator|flag|seal|logo|emblem|coat[_ ]of[_ ]arms|\.svg|\.png|\.gif|\.tif|icon|symbol|diagram|chart|signature|population|graph|_plan|montage|collage|\bstamp\b|banknote|coin|portrait of|painting|engraving|lithograph|sketch|\(\d{4}\)\.jpg$)/i;
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const force = args.includes('--force');
const upgrade4k = args.includes('--upgrade4k');
const missingOnly = args.includes('--missing');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url, tries = 5) {
  for (let i = 0; i < tries; i++) {
    let r;
    try {
      r = await fetch(url, { headers: { 'User-Agent': UA, 'Api-User-Agent': UA }, signal: AbortSignal.timeout(60000) });
    } catch {
      await sleep(4000 * (i + 1)); // network hiccup: back off and retry
      continue;
    }
    if (r.status === 429 || r.status >= 500) { await sleep(2000 * (i + 1)); continue; }
    return r;
  }
  throw new Error(`Failed ${url}`);
}
const json = async (u) => (await get(u)).json();

/** Extra subjects beyond destinations: journey chapters, homepage “moments”. */
const SUBJECTS = [
  { id: 'ch-forest', wiki: 'Taj Mahal#File:Taj Mahal, Agra, India edit2.jpg', group: 'chapter' },
  { id: 'ch-rainforest', wiki: 'Kerala backwaters#File:Mangrove Arch Boat Ashtamudi Kollam Kerala Mar22 A7C 01490.jpg', group: 'chapter' },
  { id: 'ch-valley', wiki: 'Ladakh#File:View of Indus Valley from Thikse Gompa, Ladakh, India.jpg', group: 'chapter' },
  { id: 'ch-snow', wiki: 'Gurudongmar Lake#File:Gurudongmar Lake Sikkim, India (edit).jpg', group: 'chapter' },
  { id: 'ch-beach', wiki: 'Maldives#File:Diamonds Thudufushi Beach and Water Villas, May 2017 -03.jpg', group: 'chapter' },
  { id: 'ch-city', wiki: 'Singapore#File:Skylines of the Central Business District, Singapore at dusk.jpg', group: 'chapter' },
  { id: 'ch-discover', wiki: 'Valley of Flowers National Park#File:Valley of flowers national park, Uttarakhand, India 03 (edit).jpg', group: 'chapter' },
  { id: 'm-holi', wiki: 'Holi', group: 'moment', caption: 'Holi, the festival of colours' },
  { id: 'm-aarti', wiki: 'Dashashwamedh Ghat', group: 'moment', caption: 'Dashashwamedh Ghat, Varanasi' },
  { id: 'm-elephant', wiki: 'Asian elephant', group: 'moment', caption: 'Asian elephants' },
  { id: 'm-tiger', wiki: 'Bengal tiger', group: 'moment', caption: 'Bengal tiger' },
  { id: 'm-tahr', wiki: 'Nilgiri tahr', group: 'moment', caption: 'Nilgiri tahr, Munnar' },
  { id: 'm-peafowl', wiki: 'Indian peafowl', group: 'moment', caption: 'Indian peafowl' },
  { id: 'm-backwaters', wiki: 'Kerala backwaters', group: 'moment', caption: 'Kerala backwaters' },
  { id: 'm-shibuya', wiki: 'Shibuya Crossing', group: 'moment', caption: 'Shibuya Crossing at night' },
  { id: 'm-timessq', wiki: 'Times Square', group: 'moment', caption: 'Times Square lights' },
  { id: 'm-tea', wiki: 'Darjeeling tea', group: 'moment', caption: 'Tea gardens' },
];

function loadCatalog() {
  // Read wiki titles straight from the TypeScript data files (no TS runtime needed).
  const out = [];
  for (const f of ['destinations-india.ts', 'destinations-world.ts']) {
    const src = readFileSync(join(ROOT, 'src', 'data', f), 'utf8');
    for (const m of src.matchAll(/id: '([a-z0-9-]+)', name:[\s\S]*?wiki: '([^']+)'/g)) out.push({ id: m[1], wiki: m[2], group: 'destination' });
  }
  const night = readFileSync(join(ROOT, 'src', 'data', 'nightlife.ts'), 'utf8');
  for (const m of night.matchAll(/id: '([a-z0-9-]+)', city:[\s\S]*?wiki: '([^']+)'/g)) out.push({ id: `n-${m[1]}`, wiki: m[2], group: 'nightlife' });
  return out;
}

const thumb = (url, w) => {
  const m = url.match(/^(https:\/\/upload\.wikimedia\.org\/wikipedia\/commons)\/(\w)\/(\w\w)\/([^?]+)/);
  return m ? `${m[1]}/thumb/${m[2]}/${m[3]}/${m[4]}/${w}px-${m[4]}` : url;
};
const strip = (s) => (s ? s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : undefined);

async function imageInfo(titles) {
  const out = {};
  for (let i = 0; i < titles.length; i += 40) {
    const chunk = titles.slice(i, i + 40);
    const u = `https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiextmetadatafilter=Artist|LicenseShortName|LicenseUrl|NonFree&format=json&titles=${encodeURIComponent(chunk.join('|'))}`;
    const j = await json(u);
    const back = {};
    (j.query?.normalized ?? []).forEach((n) => (back[n.to] = n.from));
    Object.values(j.query?.pages ?? {}).forEach((p) => {
      const ii = p.imageinfo?.[0];
      if (!ii) return;
      const m = ii.extmetadata ?? {};
      const rec = { title: p.title, url: ii.url, width: ii.width, height: ii.height, mime: ii.mime, author: strip(m.Artist?.value), license: m.LicenseShortName?.value, licenseUrl: m.LicenseUrl?.value, nonFree: m.NonFree?.value };
      out[p.title] = rec;
      if (back[p.title]) out[back[p.title]] = rec;
    });
    await sleep(1200);
  }
  return out;
}

async function candidates(article, pinned) {
  const t = encodeURIComponent(article.replace(/ /g, '_'));
  const titles = [];
  if (pinned) titles.push(pinned.startsWith('File:') ? pinned : `File:${pinned}`);
  const pi = await json(`https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&piprop=name&redirects=1&format=json&titles=${t}`);
  const page = Object.values(pi.query?.pages ?? {})[0];
  if (page?.pageimage) titles.push(`File:${page.pageimage}`);
  await sleep(250);
  const ml = await json(`https://en.wikipedia.org/api/rest_v1/page/media-list/${t}`).catch(() => ({ items: [] }));
  (ml.items ?? []).forEach((it) => it.type === 'image' && it.title && titles.push(it.title));
  return [...new Set(titles.map((x) => x.replace(/_/g, ' ')))].filter((x) => !BAD.test(x) || x === titles[0]?.replace(/_/g, ' '));
}

async function download(url, file, quality = 72) {
  if (!force && existsSync(file) && statSync(file).size > 10000) return true;
  const r = await get(url);
  if (!r.ok) return false;
  const buf = Buffer.from(await r.arrayBuffer());
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, buf);
  try {
    execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', String(quality), file, '--out', file], { stdio: 'ignore' });
  } catch { /* keep original bytes */ }
  await sleep(200);
  return true;
}

async function processSubject(s, manifest) {
  const [article, pin] = s.wiki.split('#');
  const titles = await candidates(article, pin);
  const info = await imageInfo(titles.slice(0, 40));
  const picks = titles
    .map((t) => info[t] ?? info[t.replace(/ /g, '_')])
    .filter(Boolean)
    .filter((r, i) => (i === 0 && pin) || (r.mime === 'image/jpeg' && r.width >= 1600 && r.width >= r.height * 1.2 && r.license && !r.nonFree && !BAD.test(r.title)))
    // Prefer 4K-capable originals, but fall back to smaller ones rather than showing nothing.
    .sort((a, b) => (b.width >= 2400 ? 1 : 0) - (a.width >= 2400 ? 1 : 0))
    .slice(0, s.group === 'destination' ? 4 : 1);
  if (!picks.length) { console.warn(`  ✗ ${s.id}: no suitable image`); return; }
  const dir = join(OUT, s.id);
  const images = [];
  for (let i = 0; i < picks.length; i++) {
    const p = picks[i];
    const base = `/media/${s.id}/${i}`;
    const sizes = {};
    const want = [960, 1920, 3840]; // every photo gets a 4K version when the original is large enough
    for (const w of want) {
      if (p.width < w && w !== 960) continue;
      const src = p.width > w ? thumb(p.url, w) : p.url;
      if (await download(src, join(dir, `${i}-${w}.jpg`), w === 3840 ? 70 : 74)) sizes[w] = `${base}-${w}.jpg`;
    }
    if (!sizes[960]) continue;
    images.push({ file: p.title, width: p.width, height: p.height, author: p.author ?? 'Unknown', license: p.license, licenseUrl: p.licenseUrl, source: `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}`, sizes });
  }
  manifest[s.id] = { article, caption: s.caption, images };
  console.log(`  ✓ ${s.id}: ${images.length} image(s) — ${images.map((x) => x.file.replace('File:', '').slice(0, 50)).join(' | ')}`);
}

const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};

/** Add 3840px versions to already-downloaded photos (no re-selection). */
if (upgrade4k) {
  let n = 0;
  for (const [id, e] of Object.entries(manifest)) {
    for (let i = 0; i < e.images.length; i++) {
      const im = e.images[i];
      if (im.sizes['3840'] || im.width < 3840) continue;
      const name = im.file.replace(/^File:/, '').replace(/ /g, '_');
      const h = createHash('md5').update(name).digest('hex');
      const orig = `https://upload.wikimedia.org/wikipedia/commons/${h[0]}/${h.slice(0, 2)}/${encodeURIComponent(name)}`;
      const file = join(OUT, id, `${i}-3840.jpg`);
      if (await download(thumb(orig, 3840), file, 70)) { im.sizes['3840'] = `/media/${id}/${i}-3840.jpg`; n++; }
      const onDisk = JSON.parse(readFileSync(MANIFEST, 'utf8'));
      if (onDisk[id]?.images[i]) { onDisk[id].images[i].sizes = im.sizes; writeFileSync(MANIFEST, JSON.stringify(onDisk, null, 1)); }
    }
  }
  console.log(`Upgraded ${n} photos to 4K.`);
  process.exit(0);
}
const subjects = [...SUBJECTS, ...loadCatalog()].filter((s) => (!only || only.includes(s.id)) && (!missingOnly || !manifest[s.id]?.images?.length));
console.log(`Fetching ${subjects.length} subjects…`);
for (const s of subjects) {
  try {
    await processSubject(s, manifest);
  } catch (e) {
    console.warn(`  ✗ ${s.id}: ${e.message}`);
  }
  const onDisk = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};
  if (manifest[s.id]) onDisk[s.id] = manifest[s.id];
  writeFileSync(MANIFEST, JSON.stringify(onDisk, null, 1));
}
console.log('Done →', MANIFEST);
