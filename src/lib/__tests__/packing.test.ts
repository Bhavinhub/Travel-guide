import { describe, expect, it } from 'vitest';
import { packingFor } from '../packing';
import { defaultConfig } from '../trip';

const ids = (c: Parameters<typeof packingFor>[0]) => packingFor(c).flatMap((s) => s.items.map((i) => i.id));

describe('what to carry', () => {
  it('international flights need passport, visa, insurance and a plug adapter', () => {
    const got = ids(defaultConfig({ destIds: ['paris'], departureId: 'delhi', days: 5, transport: 'flight', startDate: '2027-05-10' }));
    expect(got).toEqual(expect.arrayContaining(['passport', 'visa', 'insurance', 'forex', 'plug-France', 'liquids', 'powerbank']));
    expect(got).not.toContain('photo-id');
  });

  it('Ladakh in winter adds thermals, down jacket and altitude advice', () => {
    const got = ids(defaultConfig({ destIds: ['leh'], departureId: 'delhi', days: 6, startDate: '2027-01-12' }));
    expect(got).toEqual(expect.arrayContaining(['thermals', 'jacket', 'altitude', 'photo-id', 'permit-leh']));
  });

  it('self-drive needs licence and vehicle papers; children need ID', () => {
    const got = ids(defaultConfig({ destIds: ['coorg'], departureId: 'bengaluru', days: 3, transport: 'self-drive', transportType: 'private', children: 1 }));
    expect(got).toEqual(expect.arrayContaining(['dl', 'rc', 'fastag', 'kid-id']));
  });

  it('scales clothing with trip length and caps at a week', () => {
    const qty = (days: number) => packingFor(defaultConfig({ destIds: ['goa'], days })).find((s) => s.id === 'clothes')!.items.find((i) => i.id === 'tops')!.qty;
    expect(qty(3)).toBe(3);
    expect(qty(12)).toBe(7);
  });
});
