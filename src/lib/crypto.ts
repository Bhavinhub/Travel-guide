/**
 * End-to-end encryption for quote requests (RSA-OAEP-256 + AES-256-GCM hybrid).
 * The browser encrypts with Travel Guide's PUBLIC key (VITE_QUOTE_PUBLIC_KEY, SPKI base64);
 * only the holder of the matching private key (kept offline) can decrypt.
 * See scripts/generate-rsa-keys.mjs and scripts/decrypt-quote.mjs.
 */
export interface Sealed { alg: 'RSA-OAEP-256+A256GCM'; kid: string; key: string; iv: string; data: string }

const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-----[^-]+-----|\s+/g, '')), (c) => c.charCodeAt(0));

export const PUBLIC_KEY = (import.meta.env.VITE_QUOTE_PUBLIC_KEY as string | undefined)?.trim() || '';

export async function sealForCompany(payload: unknown, spkiB64 = PUBLIC_KEY): Promise<Sealed> {
  if (!spkiB64) throw new Error('No public key configured');
  const pub = await crypto.subtle.importKey('spki', unb64(spkiB64), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
  const aes = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, new TextEncoder().encode(JSON.stringify(payload)));
  const raw = await crypto.subtle.exportKey('raw', aes);
  const key = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, pub, raw);
  const kid = b64(await crypto.subtle.digest('SHA-256', unb64(spkiB64))).slice(0, 16);
  return { alg: 'RSA-OAEP-256+A256GCM', kid, key: b64(key), iv: b64(iv.buffer), data: b64(data) };
}
