import { getDeparture, getDestination } from '../data/catalog';
import type { Destination } from '../data/types';
import type { LegOption } from './geo';
import { generateItinerary } from './itinerary';
import type { TripConfig } from './trip';

/**
 * "What to carry" for any plan or package: documents, clothes, footwear, health, gadgets,
 * money, kids' items and transport rules — derived from the destination, season, transport,
 * travellers, stay tier and activities. Rules are general guidance; anything that is an
 * official requirement links back to "check the official source" rather than quoting fees.
 */

export interface PackItem { id: string; label: string; why?: string; critical?: boolean; qty?: number }
export interface PackSection { id: string; title: string; icon: string; items: PackItem[] }
export interface ForecastHint { min: number; max: number; rain: number }

const PLUGS: Record<string, string> = {
  'United Kingdom': 'Type G (UK 3-pin)', Singapore: 'Type G (UK 3-pin)', Maldives: 'Type G / D', 'United Arab Emirates': 'Type G (UK 3-pin)',
  France: 'Type C / E (Europe)', Italy: 'Type C / F / L', Switzerland: 'Type J / C', Netherlands: 'Type C / F', Spain: 'Type C / F', Germany: 'Type C / F', Greece: 'Type C / F',
  'United States': 'Type A / B (US)', Canada: 'Type A / B', Japan: 'Type A / B', Thailand: 'Type A / B / C', Indonesia: 'Type C / F', Australia: 'Type I', 'New Zealand': 'Type I',
};

const NORTH_COLD_MONTHS = [11, 12, 1, 2];
const MONSOON = [6, 7, 8, 9];

export interface PackingInput { c: TripConfig; leg?: LegOption; forecast?: ForecastHint }

export function packingFor(c: TripConfig, forecast?: ForecastHint): PackSection[] {
  const leg = generateItinerary(c).outbound?.leg;
  return buildPacking({ c, leg, forecast });
}

export function buildPacking({ c, leg, forecast }: PackingInput): PackSection[] {
  const dests = c.destIds.map((id) => getDestination(id)).filter(Boolean) as Destination[];
  const home = getDeparture(c.departureId);
  const month = Number(c.startDate.slice(5, 7)) || new Date().getMonth() + 1;
  const n = Math.max(1, c.days);
  const intl = dests.some((d) => d.country !== home.country);
  const countries = [...new Set(dests.filter((d) => d.country !== home.country).map((d) => d.country))];
  const mode = leg?.mode;
  const kids = c.children > 0;
  const attr = dests.flatMap((d) => d.attractions);
  const names = attr.map((a) => a.name).join(' ') + ' ' + dests.map((d) => d.name + ' ' + d.culture.join(' ')).join(' ');
  const has = (s: string) => dests.some((d) => d.scene === s);
  const interest = (i: string) => c.interests.includes(i as never) || dests.some((d) => d.interests.includes(i as never));

  // Conditions — live forecast wins when the trip is close enough to have one.
  const highAlt = dests.some((d) => d.scene === 'snow' || /Ladakh|Leh|Spiti|Sikkim|Gangtok|Kedarnath|Gulmarg|Manali|Shimla|Darjeeling|Auli|Munnar|Ooty/i.test(d.name + (d.state ?? '')));
  const veryCold = forecast ? forecast.min < 4 : has('snow') || (highAlt && NORTH_COLD_MONTHS.includes(month));
  const cold = veryCold || (forecast ? forecast.min < 14 : highAlt || has('mountain') || (dests.some((d) => d.scope === 'india' && d.lat > 23) && NORTH_COLD_MONTHS.includes(month)) || dests.some((d) => d.scope === 'world' && d.lat > 35 && [11, 12, 1, 2, 3].includes(month)));
  const hot = forecast ? forecast.max > 31 : has('beach') || has('desert') || (dests.some((d) => d.scope === 'india' && !highAlt) && [4, 5, 6].includes(month));
  const rain = forecast ? forecast.rain >= 40 : has('rainforest') || dests.some((d) => d.scope === 'india' && !/Ladakh|Leh/i.test(d.name + (d.state ?? '')) && MONSOON.includes(month));
  const beach = has('beach') || interest('beaches');
  const sacred = /temple|mandir|math|mosque|masjid|dargah|gurudwara|church|cathedral|monastery|gompa|ghat|stupa|shrine|basilica/i.test(names);
  const trek = attr.some((a) => a.difficulty === 'challenging' || a.difficulty === 'moderate' || a.kind === 'adventure') || interest('adventure');
  const dressy = c.mealPlan === 'fine' || c.tier === 'luxury' || interest('nightlife') || !!c.services['candlelight'] || !!c.services['night-out'];
  const wellness = !!(c.services['yoga'] || c.services['spa'] || c.services['spa-pp'] || c.services['ayurveda']) || interest('wellness');
  const tops = Math.min(n, 7), unders = Math.min(n + 1, 8);

  const S: PackSection[] = [];

  // ── Documents ──
  const docs: PackItem[] = [];
  if (intl) {
    docs.push({ id: 'passport', label: 'Passport — valid at least 6 months beyond your return date, with 2+ blank pages', critical: true, why: 'Required for every international flight and for hotel check-in abroad.' });
    docs.push({ id: 'visa', label: `Visa / e-visa / entry authorisation for ${countries.join(', ')}`, critical: true, why: 'Rules depend on your passport — confirm on the destination government’s official website before booking.' });
    docs.push({ id: 'return', label: 'Return or onward ticket and hotel bookings (printed or offline)', critical: true, why: 'Immigration often asks for proof of onward travel and accommodation.' });
    docs.push({ id: 'insurance', label: 'Travel insurance policy with medical cover', critical: countries.some((x) => /France|Italy|Switzerland|Netherlands|Spain|Germany|Greece/.test(x)), why: 'Mandatory for Schengen visas; strongly recommended everywhere.' });
  } else {
    docs.push({ id: 'photo-id', label: 'Original government photo ID for every adult (Aadhaar, passport, voter ID or driving licence)', critical: true, why: 'Needed at airports, on trains and for hotel check-in in India.' });
  }
  if (mode === 'flight') {
    docs.push({ id: 'eticket', label: 'Flight e-ticket / PNR and web check-in boarding pass', critical: true });
    if (!intl) docs.push({ id: 'digiyatra', label: 'DigiYatra app set up (optional, faster entry at major airports)' });
  }
  if (mode === 'train') docs.push({ id: 'train-ticket', label: 'Train e-ticket / PNR — carry the original ID of the passenger named on the booking', critical: true });
  if (mode === 'bus') docs.push({ id: 'bus-ticket', label: 'Bus ticket (SMS / app) and photo ID', critical: true });
  if (mode === 'helicopter') docs.push({ id: 'heli', label: 'Helicopter booking confirmation and photo ID — operators weigh passengers and allow very little baggage', critical: true });
  if (mode === 'self-drive' || mode === 'bike') {
    docs.push({ id: 'dl', label: mode === 'bike' ? 'Driving licence with motorcycle (MCWG) endorsement' : 'Valid driving licence', critical: true });
    docs.push({ id: 'rc', label: 'Vehicle RC, insurance and PUC certificate — or the rental agreement', critical: true });
    if (intl) docs.push({ id: 'idp', label: 'International Driving Permit (with your Indian licence)', critical: true });
    if (!intl) docs.push({ id: 'fastag', label: 'FASTag recharged for highway tolls' });
  }
  if (kids) docs.push({ id: 'kid-id', label: intl ? 'Passport for each child' : 'ID or birth certificate for each child (infants too)', critical: true });
  docs.push({ id: 'hotel-conf', label: 'Hotel / homestay confirmations (offline copies)' });
  dests.filter((d) => d.entryNotes).forEach((d) => docs.push({ id: `permit-${d.id}`, label: `${d.name}: ${d.entryNotes}`, critical: /permit|registration|visa/i.test(d.entryNotes!), why: 'Check the official government source for current rules.' }));
  docs.push({ id: 'copies', label: 'Photocopies + phone scans of IDs, tickets and insurance (stored offline)' });
  docs.push({ id: 'emergency', label: 'Emergency contacts, blood group and any allergy notes written down' });
  S.push({ id: 'docs', title: 'Documents & permits', icon: '🛂', items: docs });

  // ── Money ──
  const money: PackItem[] = [{ id: 'cards', label: 'Debit / credit card (inform your bank of travel dates)' }];
  if (intl) money.push({ id: 'forex', label: `Forex card or some local currency for ${countries.join(', ')}`, critical: true }, { id: 'intl-roam', label: 'International roaming pack or local eSIM' });
  else money.push({ id: 'upi', label: 'UPI app set up, plus cash in small notes', why: highAlt || has('mountain') ? 'Network and card machines can be patchy in the hills.' : 'Small vendors and auto-rickshaws often prefer cash.' });
  S.push({ id: 'money', title: 'Money & connectivity', icon: '💳', items: money });

  // ── Clothing ──
  const cl: PackItem[] = [
    { id: 'tops', label: `${hot ? 'Breathable cotton / linen' : 'Comfortable'} tops / T-shirts`, qty: tops },
    { id: 'bottoms', label: hot ? 'Light trousers / shorts' : 'Trousers / jeans', qty: Math.max(2, Math.ceil(tops / 2)) },
    { id: 'innerwear', label: 'Innerwear', qty: unders },
    { id: 'socks', label: 'Socks (pairs)', qty: Math.min(n + 1, 8) },
    { id: 'sleep', label: 'Sleepwear', qty: 1 },
  ];
  if (n > 7) cl.push({ id: 'laundry', label: 'Plan one laundry stop (pack for 7 days, not ' + n + ')' });
  if (cold) cl.push({ id: 'fleece', label: 'Fleece or sweater', qty: 2 }, { id: 'jacket', label: veryCold ? 'Insulated down / padded jacket' : 'Warm jacket', critical: veryCold, qty: 1 });
  if (veryCold) cl.push({ id: 'thermals', label: 'Thermal inner layers (top + bottom)', qty: 2, critical: true }, { id: 'beanie', label: 'Woollen cap, gloves and muffler / neck warmer' });
  if (cold && !veryCold) cl.push({ id: 'light-layer', label: 'Light layer for cool evenings' });
  if (rain) cl.push({ id: 'rain', label: 'Rain jacket or poncho + compact umbrella', critical: true }, { id: 'quickdry', label: 'Quick-dry clothes (cotton stays wet in the monsoon)' });
  if (hot || beach) cl.push({ id: 'hat', label: 'Sun hat / cap and sunglasses' });
  if (beach) cl.push({ id: 'swim', label: 'Swimwear', qty: 2 }, { id: 'coverup', label: 'Beach cover-up / sarong' });
  if (sacred) cl.push({ id: 'modest', label: 'Modest outfit covering shoulders and knees for temples and shrines', why: 'Many sacred sites require it; some ask you to cover your head.' }, { id: 'scarf', label: 'Scarf / stole (covers head or shoulders when asked)' });
  if (dressy) cl.push({ id: 'smart', label: 'One smart outfit for fine dining, nightlife or a candlelight dinner', qty: 1 });
  if (wellness) cl.push({ id: 'yoga', label: 'Yoga / activewear', qty: 2 });
  S.push({ id: 'clothes', title: `Clothes for ${n} day${n > 1 ? 's' : ''}`, icon: '👕', items: cl });

  // ── Footwear ──
  const fw: PackItem[] = [{ id: 'walking', label: 'Comfortable walking shoes', critical: true }];
  if (trek || has('mountain') || has('snow')) fw.push({ id: 'trek', label: veryCold ? 'Waterproof, high-grip trekking boots' : 'Trekking shoes with good grip', critical: trek });
  if (beach || hot || rain) fw.push({ id: 'sandals', label: rain ? 'Waterproof sandals / floaters' : 'Sandals / flip-flops' });
  if (sacred) fw.push({ id: 'slipons', label: 'Easy slip-on footwear (shoes come off at temples)' });
  if (dressy) fw.push({ id: 'dress-shoes', label: 'Smart shoes for evenings' });
  S.push({ id: 'footwear', title: 'Footwear', icon: '👟', items: fw });

  // ── Health ──
  const hl: PackItem[] = [
    { id: 'meds', label: 'Personal medicines + prescriptions (enough for the whole trip, in your cabin bag)', critical: true },
    { id: 'firstaid', label: 'Basic first-aid: plasters, antiseptic, pain relief, ORS, antacid, anti-diarrhoeal' },
    { id: 'sanitiser', label: 'Hand sanitiser and tissues / wet wipes' },
    { id: 'toiletries', label: 'Toiletries: toothbrush, paste, deodorant, moisturiser, comb' },
  ];
  if (hot || beach || highAlt || has('snow')) hl.push({ id: 'sunscreen', label: highAlt || has('snow') ? 'High-SPF sunscreen and lip balm (UV is strong at altitude)' : 'Sunscreen SPF 30+ and lip balm' });
  if (rain || beach || has('rainforest') || has('forest')) hl.push({ id: 'repellent', label: 'Insect / mosquito repellent' });
  if (highAlt || has('mountain')) hl.push({ id: 'motion', label: 'Motion-sickness tablets for winding hill roads' });
  if (highAlt && (has('snow') || /Ladakh|Leh|Sikkim|Kedarnath/i.test(names))) hl.push({ id: 'altitude', label: 'Altitude: plan 24–48 h to acclimatise, stay hydrated; ask your doctor about altitude medication', critical: true });
  if (trek) hl.push({ id: 'bottle', label: 'Reusable water bottle and energy snacks' });
  S.push({ id: 'health', title: 'Health & toiletries', icon: '🩺', items: hl });

  // ── Gadgets ──
  const gd: PackItem[] = [
    { id: 'phone', label: 'Phone, charger and cable' },
    { id: 'powerbank', label: mode === 'flight' ? 'Power bank — cabin bag only, never in checked luggage' : 'Power bank', critical: mode === 'flight' },
    { id: 'offline', label: 'Offline maps and tickets downloaded' },
  ];
  countries.forEach((x) => gd.push({ id: `plug-${x}`, label: `Travel adapter for ${x}${PLUGS[x] ? ` — ${PLUGS[x]}` : ''}` }));
  if (has('snow') || veryCold) gd.push({ id: 'batt', label: 'Spare batteries (cold drains them fast)' });
  if (trek || highAlt) gd.push({ id: 'torch', label: 'Head torch / small flashlight' });
  S.push({ id: 'gadgets', title: 'Gadgets', icon: '🔌', items: gd });

  // ── Bags & transport rules ──
  const bg: PackItem[] = [{ id: 'daypack', label: 'Daypack for sightseeing' }];
  if (mode === 'flight') {
    bg.push({ id: 'cabin', label: 'Cabin bag within your airline’s limit (often 7 kg in economy) — check your ticket' });
    bg.push({ id: 'liquids', label: 'Liquids, gels and aerosols in the cabin: containers of 100 ml or less in one clear bag' });
    bg.push({ id: 'sharps', label: 'No knives, scissors, lighters or tools in the cabin bag' });
    bg.push({ id: 'checkin', label: intl ? 'Reach the airport about 3 hours before departure' : 'Reach the airport about 2 hours before; check-in closes around 45–60 minutes before departure', critical: true });
  }
  if (mode === 'train') bg.push({ id: 'chain', label: 'Small lock and chain for luggage on overnight trains' }, { id: 'train-snacks', label: 'Snacks, water and a light shawl for AC coaches' });
  if (mode === 'bus') bg.push({ id: 'neck', label: 'Neck pillow and eye mask for overnight buses' });
  if (mode === 'bike') bg.push({ id: 'helmet', label: 'ISI-certified helmet, riding jacket, gloves and knee guards', critical: true }, { id: 'tools', label: 'Puncture kit, bungee cords and saddle bags' });
  if (mode === 'self-drive') bg.push({ id: 'car-kit', label: 'Phone mount, car charger, first-aid kit and spare-wheel check' });
  if (mode === 'helicopter') bg.push({ id: 'heli-bag', label: 'Pack very light — a small soft bag; heavy luggage stays behind' });
  if (dests.some((d) => d.gateway?.mode === 'ferry' || d.gateway?.mode === 'speedboat' || d.gateway?.mode === 'seaplane')) bg.push({ id: 'drybag', label: 'Dry bag / waterproof pouch for ferry or boat transfers' });
  S.push({ id: 'bags', title: mode ? `Bags & ${mode === 'flight' ? 'airport' : mode} rules` : 'Bags', icon: mode === 'flight' ? '✈' : mode === 'train' ? '🚆' : mode === 'bike' ? '🏍' : '🧳', items: bg });

  // ── Kids ──
  if (kids) S.push({ id: 'kids', title: `For ${c.children} child${c.children > 1 ? 'ren' : ''}`, icon: '🧸', items: [
    { id: 'kid-clothes', label: 'Extra change of clothes in the day bag' },
    { id: 'kid-snacks', label: 'Familiar snacks, water bottle and wet wipes' },
    { id: 'kid-meds', label: 'Children’s medicines (fever, ORS) as advised by your paediatrician', critical: true },
    { id: 'kid-fun', label: 'Headphones, book or small games for the journey' },
  ] });

  // ── Before you go ──
  const todo: PackItem[] = [
    { id: 'confirm', label: 'Re-confirm transport and hotel bookings 48 hours before' },
    { id: 'share', label: 'Share your itinerary with family or a friend' },
    { id: 'weather', label: 'Check the forecast the day before and adjust layers' },
  ];
  if (c.mealPref !== 'any') todo.push({ id: 'diet', label: `Tell hotels and airlines about your ${c.mealPref} meal preference in advance` });
  if (intl) todo.push({ id: 'advisory', label: 'Read your government’s travel advisory for the destination' });
  S.push({ id: 'todo', title: 'Before you go', icon: '✅', items: todo });

  return S;
}

/** Stable key for remembering ticks for a given plan. */
export const packKey = (c: TripConfig) => `${c.destIds.join('+')}|${c.days}|${c.transport}|${c.startDate}`;
