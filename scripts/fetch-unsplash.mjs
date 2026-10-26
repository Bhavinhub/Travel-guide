#!/usr/bin/env node
/**
 * Adds hand-picked photos from Unsplash (free to use under the Unsplash License) to
 * public/media and src/data/media.json, with photographer credit and source link.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = join(ROOT, 'src', 'data', 'media.json');
const PICKS = [
  { id: 'u-kedarnath', photo: 'photo-1784915152782-c3977ceaae4c', page: 'N1GAuG_VLjg', title: 'Kedarnath Temple at dusk', author: 'Rushi Kakadiya' },
  { id: 'u-taj', photo: 'photo-1762999823430-8a1aa4ffc1a4', page: 'fU_RObkfzSs', title: 'Taj Mahal emerging from morning mist', author: 'qin liu' },
  { id: 'u-kerala', photo: 'photo-1593693411515-c20261bcad6e', page: 'ii0oWs5abCo', title: 'Houseboat on the Alappuzha backwaters', author: 'Abhishek Prasad' },
  { id: 'u-pangong', photo: 'photo-1674187219704-be3cd35a80b7', page: 'wLaYEB2GZmQ', title: 'Pangong Lake, Ladakh', author: 'Nikunj Mundra' },
  { id: 'u-maldives', photo: 'photo-1688949078626-a358f500e063', page: 'kjicxykvfiA', title: 'Overwater villas, Maldives (aerial)', author: 'Hamdhulla Shakeeb' },
  { id: 'u-mumbai', photo: 'photo-1715678907084-6245f67e8124', page: '5fcu9ckA78Y', title: 'Mumbai at night from the 40th floor', author: 'vinay manda' },
];
const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};
for (const p of PICKS) {
  const dir = join(ROOT, 'public', 'media', p.id);
  mkdirSync(dir, { recursive: true });
  const sizes = {};
  let width = 0, height = 0;
  for (const w of [960, 1920, 3840]) {
    const file = join(dir, `0-${w}.jpg`);
    const r = await fetch(`https://images.unsplash.com/${p.photo}?w=${w}&q=${w === 3840 ? 78 : 80}&fm=jpg&fit=max`);
    if (!r.ok) { console.warn('✗', p.id, w, r.status); continue; }
    writeFileSync(file, Buffer.from(await r.arrayBuffer()));
    const info = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file]).toString();
    width = +info.match(/pixelWidth: (\d+)/)[1];
    height = +info.match(/pixelHeight: (\d+)/)[1];
    sizes[w] = `/media/${p.id}/0-${w}.jpg`;
  }
  manifest[p.id] = { article: 'Unsplash', caption: p.title, images: [{ file: `Unsplash: ${p.title}`, width, height, author: p.author, license: 'Unsplash License', licenseUrl: 'https://unsplash.com/license', source: `https://unsplash.com/photos/${p.page}`, sizes }] };
  console.log('✓', p.id, `${width}×${height}`, p.author);
}
const onDisk = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};
for (const p of PICKS) onDisk[p.id] = manifest[p.id];
writeFileSync(MANIFEST, JSON.stringify(onDisk, null, 1));
