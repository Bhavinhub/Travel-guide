#!/usr/bin/env node
/** Creates a 3072-bit RSA-OAEP key pair. Keep keys/quote-private.pem offline and out of git. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';
const kp = await crypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['encrypt', 'decrypt']);
const spki = Buffer.from(await crypto.subtle.exportKey('spki', kp.publicKey)).toString('base64');
const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', kp.privateKey)).toString('base64');
mkdirSync('keys', { recursive: true, mode: 0o700 });
writeFileSync('keys/quote-private.pem', `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`, { mode: 0o600 });
console.log('Private key written to keys/quote-private.pem (keep it secret, back it up offline).');
console.log('\nAdd this to your environment as VITE_QUOTE_PUBLIC_KEY:\n');
console.log(spki);
