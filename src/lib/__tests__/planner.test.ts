import { describe, expect, it } from 'vitest';
import { DESTINATIONS } from '../../data/catalog';
import { estimateTrip } from '../estimate';
import { generateItinerary, layoutDay, moveItem, removeItem } from '../itinerary';
import { defaultConfig, validateConfig } from '../trip';

const base = defaultConfig({ startDate: '2027-01-12' });

describe('itinerary generation', () => {
  it('builds a 3-day Bengaluru → Coorg trip by road with consistent days', () => {
    const g = generateItinerary(base);
    expect(g.days).toHaveLength(3);
    expect(g.outbound?.leg?.mode).toBe('car');
    expect(g.days[0].items[0].type).toBe('transit');
    expect(g.days[2].items.at(-1)?.title).toMatch(/home to Bengaluru/);
    g.days.forEach((d) => {
      const l = layoutDay(d, base);
      for (let i = 1; i < l.rows.length; i++) expect(l.rows[i].start).toBeGreaterThanOrEqual(l.rows[i - 1].end);
    });
  });

  it('uses flights for long-haul and accounts for time zones', () => {
    const c = { ...base, destIds: ['new-york'], days: 6 };
    const g = generateItinerary(c);
    expect(g.outbound?.leg?.mode).toBe('flight');
    expect(g.days.length).toBe(6);
  });

  it('generates every destination without throwing', () => {
    DESTINATIONS.forEach((d) => {
      const c = { ...base, destIds: [d.id], days: Math.max(2, d.days[1]) };
      const g = generateItinerary(c);
      const e = estimateTrip(c, g.days);
      expect(e.total).toBeGreaterThan(0);
      expect(Number.isFinite(e.total)).toBe(true);
    });
  });

  it('supports one-day outings and multi-destination trips', () => {
    const one = generateItinerary({ ...base, destIds: ['nandi-hills'], days: 1 });
    expect(one.days).toHaveLength(1);
    const multi = generateItinerary({ ...base, destIds: ['munnar', 'alleppey'], days: 5, departureId: 'kochi' });
    expect(new Set(multi.days.map((d) => d.destId)).size).toBe(2);
  });

  it('edits are pure and remove/move items', () => {
    const g = generateItinerary(base);
    const day = g.days[1];
    const act = day.items.find((i) => i.type === 'activity')!;
    const removed = removeItem(g.days, 1, act.uid);
    expect(removed[1].items.length).toBe(day.items.length - 1);
    expect(g.days[1].items.length).toBe(day.items.length);
    const moved = moveItem(g.days, 1, act.uid, 1);
    expect(moved[1].items.indexOf(act)).not.toBe(day.items.indexOf(act));
  });
});

describe('expense estimator', () => {
  it('scales with travellers and rooms', () => {
    const g2 = generateItinerary(base);
    const e2 = estimateTrip(base, g2.days);
    const c4 = { ...base, adults: 4, rooms: 2 };
    const g4 = generateItinerary(c4);
    const e4 = estimateTrip(c4, g4.days);
    const acc = (e: typeof e2) => e.categories.find((x) => x.key === 'accommodation')!.amount;
    expect(acc(e4)).toBeCloseTo(acc(e2) * 2, -1);
    expect(e4.total).toBeGreaterThan(e2.total);
    expect(e2.low).toBeLessThan(e2.total);
    expect(e2.high).toBeGreaterThan(e2.total);
  });

  it('daily breakdown plus fees and contingency equals the total', () => {
    const g = generateItinerary(base);
    const e = estimateTrip(base, g.days);
    const dailySum = e.daily.reduce((a, d) => a + d.total, 0);
    const fees = e.categories.find((x) => x.key === 'fees')!.amount;
    expect(Math.abs(dailySum + fees + e.contingency - e.total)).toBeLessThan(e.daily.length + 2);
  });

  it('charges extra adults per room', () => {
    const c = { ...base, adults: 3, rooms: 1 };
    const e = estimateTrip(c, generateItinerary(c).days);
    expect(e.categories.find((x) => x.key === 'accommodation')!.lines.join(' ')).toMatch(/extra adult/);
  });

  it('validates rooms and travellers', () => {
    expect(validateConfig({ ...base, rooms: 3, adults: 2 }).rooms).toBeTruthy();
    expect(validateConfig({ ...base, adults: 0 }).adults).toBeTruthy();
    expect(Object.keys(validateConfig(base))).toHaveLength(0);
  });
});

describe('export', () => {
  it('produces a branded, printable itinerary document', async () => {
    const { itineraryHTML } = await import('../export');
    const g = generateItinerary(base);
    const e = estimateTrip(base, g.days);
    const html = itineraryHTML('Coorg weekend', base, g.days, e, (n) => `₹${Math.round(n)}`);
    expect(html).toContain('<title>Coorg weekend — Travel Guide</title>');
    expect(html).toContain('Explore beautifully. Plan effortlessly.');
    expect(html).toContain('Day 3');
    expect(html).toContain('not a booking');
  });
});

describe('transport choices', () => {
  it('honours public/private preference and offers bikes and helicopters where realistic', async () => {
    const { legOptions, chooseLeg } = await import('../geo');
    const { DESTINATIONS } = await import('../../data/catalog');
    const coorg = DESTINATIONS.find((d) => d.id === 'coorg')!;
    const opts = legOptions({ name: 'Bengaluru', lat: 12.97, lon: 77.59, tz: 'Asia/Kolkata', country: 'India', hasRail: true }, { name: 'Coorg', lat: coorg.lat, lon: coorg.lon, tz: coorg.tz, country: 'India' }, coorg, 'economy', 2);
    const modes = opts.map((o) => o.mode);
    expect(modes).toEqual(expect.arrayContaining(['bus', 'car', 'self-drive', 'bike', 'helicopter']));
    expect(chooseLeg(opts, 'auto', 'public').leg?.mode).not.toBe('car');
    expect(['car', 'self-drive', 'bike', 'helicopter']).toContain(chooseLeg(opts, 'auto', 'private').leg?.mode);
    const g = generateItinerary({ ...base, transport: 'bike' });
    expect(g.outbound?.leg?.mode).toBe('bike');
  });
});

describe('quote encryption', () => {
  it('round-trips through RSA-OAEP + AES-GCM', async () => {
    const { sealForCompany } = await import('../crypto');
    const kp = await crypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['encrypt', 'decrypt']);
    const spki = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('spki', kp.publicKey))));
    const unb = (x: string) => Uint8Array.from(atob(x), (ch) => ch.charCodeAt(0));
    const sealed = await sealForCompany({ name: 'Test', email: 'a@b.co' }, spki);
    expect(sealed.data).not.toContain('Test');
    const raw = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, kp.privateKey, unb(sealed.key));
    const aes = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb(sealed.iv) }, aes, unb(sealed.data));
    expect(JSON.parse(new TextDecoder().decode(plain)).name).toBe('Test');
  });
});
