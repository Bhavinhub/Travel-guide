/**
 * Cloudflare Pages Function: stores "Request a quote" submissions in Workers KV (binding QUOTES).
 * Create-only (no read endpoint): view entries in the Cloudflare dashboard → Storage & Databases → KV →
 * travel-guide-quotes. Input is size-limited, shape-checked and rate-limited per visitor.
 */
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const isStr = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max;

export async function onRequestPost({ request, env }) {
  if (!(request.headers.get('content-type') ?? '').includes('application/json')) return json(415, { error: 'JSON only' });
  const text = await request.text();
  if (text.length > 20000) return json(413, { error: 'Too large' });
  let body;
  try { body = JSON.parse(text); } catch { return json(400, { error: 'Invalid JSON' }); }
  // Either an RSA-OAEP + AES-GCM sealed envelope, or a plain enquiry.
  const sealed = body && isStr(body.alg, 64) && isStr(body.key, 4000) && isStr(body.iv, 64) && isStr(body.data, 18000);
  const plain = body && isStr(body.name, 120) && isStr(body.email, 200) && isStr(body.message, 4000);
  if (!sealed && !plain) return json(400, { error: 'Unexpected payload' });
  // At most 5 requests a minute from one address.
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const rlKey = `rl:${ip}`;
  const count = Number((await env.QUOTES.get(rlKey)) ?? 0);
  if (count >= 5) return json(429, { error: 'Too many requests — please wait a minute.' });
  await env.QUOTES.put(rlKey, String(count + 1), { expirationTtl: 60 });
  const id = `quote:${new Date().toISOString()}-${crypto.randomUUID()}`;
  await env.QUOTES.put(id, JSON.stringify({ receivedAt: new Date().toISOString(), encrypted: !!sealed, country: request.cf?.country ?? null, payload: body }));
  return json(201, { ok: true, id });
}

export async function onRequest({ request }) {
  return request.method === 'POST' ? json(500, { error: 'Unhandled' }) : json(405, { error: 'POST only' });
}
