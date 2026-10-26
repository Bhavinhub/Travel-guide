# Security — Travel Guide

No website can be made impossible to attack, but this one is built to remove the common routes in.

## What is in place
| Area | Protection |
| --- | --- |
| Quote requests | **RSA-OAEP-256 + AES-256-GCM hybrid encryption in the browser** (`src/lib/crypto.ts`). With `VITE_QUOTE_PUBLIC_KEY` set, personal details are encrypted with Travel Guide's public key before leaving the page; only the offline private key can decrypt (`scripts/decrypt-quote.mjs`). |
| Key management | `node scripts/generate-rsa-keys.mjs` creates a 3072-bit key pair. The private key is written to `keys/` (git-ignored, mode 600). Never upload it to the host. |
| Secrets | No secret is ever shipped to the browser. Flight-API keys live only in server environment variables used by `netlify/functions/flights.mjs`. |
| Browser hardening | Strict **Content-Security-Policy** (only this site, Wikimedia, ECB/Frankfurter and Open-Meteo are allowed), **HSTS**, `X-Frame-Options: DENY` + `frame-ancestors 'none'` (click-jacking), `nosniff`, strict referrer policy, Permissions-Policy (camera, mic, location, payment off), COOP. See `netlify.toml`. |
| XSS | React escapes all text; no `innerHTML`/`dangerouslySetInnerHTML`/`eval`. Exported itineraries escape user text. Third-party credit text is stripped of HTML before display. |
| Server endpoint | GET-only, whitelisted parameters, IATA/date validation, passenger caps, per-IP rate limit (20/min), generic error messages (no internal details leaked). |
| Forms | Length limits, control-character stripping, spam honeypot field, 30-second resubmit throttle, consent checkbox. |
| External links | `rel="noreferrer"` (implies `noopener`) on every outbound link. |
| Storage | Only non-sensitive preferences and plans are kept in `localStorage`; reads are wrapped so tampered data cannot crash the app. Quote requests stored locally are encrypted when a key is configured. |
| Dependencies | Run `npm audit` before each release and keep packages updated. |

## When you add a quote endpoint
Add its origin to `connect-src` in the CSP (`netlify.toml` and `vite.config.ts`), and store only the encrypted payload server-side.

## Reporting
Add a security contact (e.g. `security@yourdomain`) to `src/config/company.ts` once you have one.
