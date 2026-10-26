/**
 * Stores "Request a quote" submissions in Netlify Blobs (store: quote-requests).
 * Create-only: there is no read endpoint — the company views entries in the Netlify UI
 * (Data & Storage → Blobs) or with `netlify blobs:get`, and decrypts sealed ones offline
 * with scripts/decrypt-quote.mjs. Input is size-limited, shape-checked and rate-limited.
 */
import { getStore } from '@netlify/blobs';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const isStr = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max;

export default async (req, context) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  if (!(req.headers.get('content-type') ?? '').includes('application/json')) return json(415, { error: 'JSON only' });
  const text = await req.text();
  if (text.length > 20000) return json(413, { error: 'Too large' });
  let body;
  try { body = JSON.parse(text); } catch { return json(400, { error: 'Invalid JSON' }); }
  // Either an RSA-OAEP + AES-GCM sealed envelope, or a plain enquiry.
  const sealed = body && isStr(body.alg, 64) && isStr(body.key, 4000) && isStr(body.iv, 64) && isStr(body.data, 18000);
  const plain = body && isStr(body.name, 120) && isStr(body.email, 200) && isStr(body.message, 4000);
  if (!sealed && !plain) return json(400, { error: 'Unexpected payload' });
  const id = `${new Date().toISOString()}-${crypto.randomUUID()}`;
  await getStore({ name: 'quote-requests', consistency: 'strong' }).setJSON(id, {
    receivedAt: new Date().toISOString(),
    encrypted: !!sealed,
    country: context.geo?.country?.code ?? null,
    payload: body,
  }, { onlyIfNew: true });
  return json(201, { ok: true, id });
};

export const config = {
  path: '/api/quote',
  method: 'POST',
  rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowSize: 60, windowLimit: 5 },
};
