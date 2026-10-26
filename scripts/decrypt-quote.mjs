#!/usr/bin/env node
/** Decrypts a sealed quote request: node scripts/decrypt-quote.mjs sealed.json [keys/quote-private.pem] */
import { readFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';
const [file, keyFile = 'keys/quote-private.pem'] = process.argv.slice(2);
const sealed = JSON.parse(readFileSync(file, 'utf8'));
const pem = readFileSync(keyFile, 'utf8').replace(/-----[^-]+-----|\s+/g, '');
const priv = await crypto.subtle.importKey('pkcs8', Buffer.from(pem, 'base64'), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']);
const raw = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, priv, Buffer.from(sealed.key, 'base64'));
const aes = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(sealed.iv, 'base64') }, aes, Buffer.from(sealed.data, 'base64'));
console.log(JSON.stringify(JSON.parse(new TextDecoder().decode(plain)), null, 2));
