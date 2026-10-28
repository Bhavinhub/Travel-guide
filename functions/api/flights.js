/**
 * Live flight offers for Travel Guide (Cloudflare Pages Function).
 * Keys stay on the server. Configure ONE provider in Cloudflare (Pages project → Settings → Variables and Secrets):
 *   FLIGHTS_PROVIDER=amadeus  + AMADEUS_CLIENT_ID, AMADEUS_CLIENT_SECRET (+ AMADEUS_ENV=production for live data; default test)
 *   FLIGHTS_PROVIDER=duffel   + DUFFEL_ACCESS_TOKEN
 * Without configuration the endpoint answers 501 and the site falls back to its estimates + search links.
 */
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=600' } });

async function amadeus(q, env) {
  const host = env.AMADEUS_ENV === 'production' ? 'https://api.amadeus.com' : 'https://test.api.amadeus.com';
  const tok = await fetch(`${host}/v1/security/oauth2/token`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: env.AMADEUS_CLIENT_ID, client_secret: env.AMADEUS_CLIENT_SECRET }),
  }).then((r) => r.json());
  if (!tok.access_token) throw new Error('Amadeus authentication failed');
  const p = new URLSearchParams({ originLocationCode: q.from, destinationLocationCode: q.to, departureDate: q.date, adults: q.adults, currencyCode: 'INR', max: '30', travelClass: q.cabin.toUpperCase() });
  if (q.ret) p.set('returnDate', q.ret);
  if (+q.children) p.set('children', q.children);
  const r = await fetch(`${host}/v2/shopping/flight-offers?${p}`, { headers: { authorization: `Bearer ${tok.access_token}` } });
  const j = await r.json();
  if (!r.ok) throw new Error(j.errors?.[0]?.detail ?? 'Amadeus search failed');
  const names = j.dictionaries?.carriers ?? {};
  return (j.data ?? []).map((o) => {
    const it = o.itineraries[0];
    const segs = it.segments;
    return { carrier: names[o.validatingAirlineCodes?.[0]] ?? o.validatingAirlineCodes?.[0], price: +o.price.grandTotal, currency: o.price.currency, stops: segs.length - 1, duration: it.duration, departs: segs[0].departure.at, arrives: segs[segs.length - 1].arrival.at, cabin: o.travelerPricings?.[0]?.fareDetailsBySegment?.[0]?.cabin ?? q.cabin };
  });
}

async function duffel(q, env) {
  const slices = [{ origin: q.from, destination: q.to, departure_date: q.date }];
  if (q.ret) slices.push({ origin: q.to, destination: q.from, departure_date: q.ret });
  const passengers = [...Array(+q.adults).fill({ type: 'adult' }), ...Array(+q.children).fill({ age: 8 })];
  const r = await fetch('https://api.duffel.com/air/offer_requests?return_offers=true', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.DUFFEL_ACCESS_TOKEN}`, 'duffel-version': 'v2', 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ data: { slices, passengers, cabin_class: q.cabin } }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.errors?.[0]?.message ?? 'Duffel search failed');
  return (j.data.offers ?? []).map((o) => {
    const s = o.slices[0];
    return { carrier: o.owner?.name, price: +o.total_amount, currency: o.total_currency, stops: s.segments.length - 1, duration: s.duration, departs: s.segments[0].departing_at, arrives: s.segments.at(-1).arriving_at, cabin: q.cabin };
  });
}

// Best-effort per-instance rate limit: 20 searches / minute / IP (protects API quotas).
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > 20;
}

export async function onRequest({ request: req, env }) {
  if (req.method !== 'GET') return json(405, { message: 'Method not allowed' });
  const ip = req.headers.get('cf-connecting-ip') ?? 'unknown';
  if (limited(ip)) return json(429, { message: 'Too many searches — please wait a minute.' });
  const u = new URL(req.url);
  const allowed = ['from', 'to', 'date', 'ret', 'adults', 'children', 'cabin'];
  const q = Object.fromEntries([...u.searchParams].filter(([k]) => allowed.includes(k)).map(([k, v]) => [k, v.slice(0, 20)]));
  if (!/^[A-Z]{3}$/.test(q.from ?? '') || !/^[A-Z]{3}$/.test(q.to ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(q.date ?? '')) return json(400, { message: 'from, to (IATA) and date are required' });
  if (q.ret && !/^\d{4}-\d{2}-\d{2}$/.test(q.ret)) return json(400, { message: 'Invalid return date' });
  if (new Date(q.date) < new Date(new Date().toISOString().slice(0, 10))) return json(400, { message: 'Date is in the past' });
  q.adults = String(Math.min(9, Math.max(1, parseInt(q.adults, 10) || 1)));
  q.children = String(Math.min(8, Math.max(0, parseInt(q.children, 10) || 0))); q.cabin = ['economy', 'premium_economy', 'business', 'first'].includes(q.cabin) ? q.cabin : 'economy';
  const provider = env.FLIGHTS_PROVIDER;
  try {
    let offers;
    if (provider === 'amadeus' && env.AMADEUS_CLIENT_ID) offers = await amadeus(q, env);
    else if (provider === 'duffel' && env.DUFFEL_ACCESS_TOKEN) offers = await duffel(q, env);
    else return json(501, { message: 'Live flight search is not configured on this deployment.' });
    offers.sort((a, b) => a.price - b.price);
    return json(200, { provider, offers: offers.slice(0, 30) });
  } catch (e) {
    console.error('flight search failed', e);
    return json(502, { message: 'Live flight search failed. Please try again later.' });
  }
}
