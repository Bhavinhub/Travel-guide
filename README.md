# Travel Guide

**Live site:** https://travel-guide-bhavin.netlify.app

**Explore beautifully. Plan effortlessly.**

An immersive travel discovery and itinerary-planning website: a living 3D journey through seven landscapes, an interactive globe with destination portals, and a working trip builder that produces day-by-day and hourly itineraries with transparent, inspectable cost estimates.

> The destination catalog is a curated **sample** and all prices are **illustrative planning figures** (not live fares, quotes or availability). Nothing is booked or paid for on this site.

---

## Quick start

Requirements: Node.js 18+ (tested with Node 24) and npm.

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

| Command | What it does |
| --- | --- |
| `npm run build` | Type-checks and builds a static site into `dist/` |
| `npm run preview` | Serves the production build locally |
| `npm test` | Runs the planner / estimator unit tests (Vitest) |
| `npm run typecheck` | TypeScript only |

The build is fully static (hash-based routing), so `dist/` can be hosted on any static host (Netlify, Vercel, S3, GitHub Pages…) with no server rewrites.

## What's new in this version

- **Real media only.** Every photo is a real, freely licensed photograph from Wikimedia Commons, stored locally at up to 4K with author and licence (`scripts/fetch-media.mjs` → `public/media`, `src/data/media.json`). Background video loops and all music/ambience are real Commons recordings (`public/video`, `scripts/fetch-audio.mjs` → `public/audio`). The globe uses NASA Blue Marble + NASA/NOAA city lights (public domain). The old code-drawn low-poly world and illustrations were removed.
- **Immersive 3D, real imagery.** Scroll-driven chapters with direction-aware "chasm" dives (zoom into the next scene scrolling down, pull back out scrolling up), cursor-reactive 3D tilt and parallax, a coloured cursor light and trail, floating depth cards, continuously rotating 3D rings of the best places in India and abroad, an endless 3D marquee of real moments, particle atmospheres (leaves, rain, snow, spray, city bokeh, stars), liquid-glass panels with real backdrop refraction (Chromium) and animated sheen, 3D page transitions and scroll reveals.
- **Cinematic hero:** real-time PBR shapes (iridescent liquid blob, chrome knot, gold ring, pearls) whose reflections come from the current real photo; mouse-reactive and scroll-choreographed (WebGL, rendered live — not generated images).
- **Travel choices:** public vs private transport; flights, trains, buses, private cabs, self-drive, motorbikes and helicopter charters (where realistic).
- **Trip details page (`#/trip`):** photo hero, live weather, getting there with lowest→premium options (flight fare tiers, car/bike/train/bus classes), arrival-airport transfers with costs, hotels by tier with Booking.com (sorted by price, rated 8+) / Google Hotels / MakeMyTrip links, where to eat (iconic picks + live searches), continuous full-journey or day-by-day itinerary with a daily budget, social links.
- **Instant explorer:** every destination shows 1–4 day totals that update when you switch stay (budget → 5-star), food (street food → fine dining) or transport. Nav search shows day-trip and 2-day estimates as you type. Explore pages rank top places per state / country.
- **Live data:** ECB exchange rates (Frankfurter) and Open-Meteo forecasts load live; live flight offers via `/api/flights` once a provider key is set.
- **Security:** see `SECURITY.md` (RSA-OAEP encrypted quote requests, strict CSP and security headers, hardened rate-limited API).

## Going live

The site is a static build plus one serverless function, ready for Netlify (`netlify.toml`):

1. Push the folder to a Git repo (or use the Netlify CLI / dashboard) — build command `npm run build`, publish `dist`.
2. Optional live flights: set `FLIGHTS_PROVIDER` and the provider keys (Amadeus or Duffel) in the site's environment variables.
3. Optional encrypted quotes: run `node scripts/generate-rsa-keys.mjs`, keep `keys/quote-private.pem` offline, and set `VITE_QUOTE_PUBLIC_KEY` + `VITE_QUOTE_ENDPOINT`.

Media totals roughly 300 MB (4K photos, video, audio); a CDN-backed host is recommended.

### Environment variables

Copy `.env.example` to `.env.local`. **None are required** to run the demo, and none are secrets.

| Variable | Purpose |
| --- | --- |
| `VITE_QUOTE_ENDPOINT` | HTTPS endpoint that receives “Request a Quote” submissions as JSON (`POST`). Empty = requests are saved in the visitor’s browser only, and the UI says so. |
| `VITE_QUOTE_PUBLIC_KEY` | RSA public key (SPKI, base64) used to encrypt quote requests in the browser. |
| `FLIGHTS_PROVIDER`, `AMADEUS_*` / `DUFFEL_ACCESS_TOKEN` | **Server-side only** keys for live flight offers. |
| `VITE_DISABLE_REMOTE_MEDIA` | `true` disables Wikipedia/Wikimedia lookups (illustrated fallbacks only). |

Company contact details are intentionally blank — add verified details in `src/config/company.ts`.

---

## Architecture

**Stack:** TypeScript · React 18 · Vite · Three.js with React Three Fiber (+ drei) · GSAP (globe camera moves) · Zustand (state) · topojson / Natural Earth (maps) · Vitest.

```
src/
  config/company.ts        Brand name, tagline, contact placeholders, pricing basis
  data/                    Content, separate from UI (see docs/DATA.md)
    types.ts               Data model
    destinations-india.ts  State/UT → destination → attractions
    destinations-world.ts  Continent → country → destination → attractions
    catalog.ts             Lookups, hierarchy, search, filters, departure cities
    services.ts            Honeymoon / wellness / nightlife extras, guides, currencies
    nightlife.ts           Neighbourhood-level nightlife listings
  lib/
    geo.ts                 Distances, transport options & rate card
    itinerary.ts           Itinerary generator, hourly layout, conflict detection, edit operations
    estimate.ts            Expense estimator (categories, range, daily breakdown, assumptions)
    trip.ts, time.ts       Trip model, validation, time-zone & sunrise/sunset helpers
    media.ts               Batched Wikipedia/Commons media with attribution
    audio.ts               Procedural Web Audio ambience
    store.ts               Preferences, saved trips, passport, planner draft (localStorage)
    export.ts              Printable / downloadable itinerary
    interactions.ts        Ripples, magnetic buttons, tilt, glass highlights
  scene/
    JourneyCanvas.tsx      The single persistent 3D scene + scroll-driven camera rig
    world.ts               Procedural terrain, biomes, camera keyframes, palettes
    parts.tsx, models.ts   Terrain, vegetation, water, waterfall, birds, animals, weather, city
    Globe.tsx              Rotatable globe with markers (loaded lazily)
  components/              Shell (nav, dock, footer), discovery (portals, finder), features
  pages/                   Home, Explore, Destination, Planner, Honeymoon, Weekend, Nightlife, Saved, About, Contact
```

**Core flow:** discover destination → choose services → calculate estimate → view itinerary → customise plan → save / print / export / request a quote.

### 3D & performance strategy
- One coordinated scene for the home journey; the globe is a separate canvas loaded only on demand and paused when off-screen.
- Normal browser scrolling drives the camera (no scroll hijacking). The journey is finite: seven chapters, then the page ends.
- Everything is procedural (no model or texture downloads): instanced trees/grass, GPU particles, shader wind and water.
- Adaptive quality: device tier detection + `PerformanceMonitor` lowers pixel ratio and instance counts when frame rate drops.
- Frame loop stops when motion is paused (renders only on scroll), and stops entirely when the journey is scrolled past or the route changes.
- Lightweight mode and WebGL failure fall back to cross-fading real photography; context loss is recoverable.

### Accessibility
- Semantic HTML for all navigation, content and forms; the canvas is decorative (`aria-hidden`).
- Skip link, visible focus states, labelled form controls, inline validation with focus on the first error.
- Chapter navigation buttons and `N` / `P` keyboard shortcuts; searchable list alongside the globe.
- `prefers-reduced-motion` is honoured (camera jumps between chapters, ambient motion stops); a Pause-motion control is always available.
- Pointer-only effects (magnetic buttons, tilt, cursor trail) are disabled on touch and reduced-motion; touch devices get tap feedback.

---

## Features

### Fully functional
- 3D living journey: forest & hills (river, lake, deer), rainforest (rain, mist, waterfall, Asian elephants), mountain valley (ibex), snow country (yaks, snowfall), tropical beach (sea, palms, sailboat), city skyline (lit windows, traffic), discovery chapter. Birds, clouds, wind-blown trees and grass, floating leaves, light shafts.
- Chapter indicator, chapter navigation, progress bar, pause-motion, atmosphere cycling (Daybreak → Daylight → Golden hour → Twilight → Moonlight), lightweight mode.
- Interactive globe with country outlines and markers, searchable/filterable destination list, circular portals with short finite reveal transitions (replay / back / close).
- India hierarchy (State/UT → destination → attractions) and world hierarchy (Continent → country → destination → attractions) with correct place-type labels.
- Destination pages: matched photographs with attribution, gallery & lightbox, “Why visit?”, attractions (duration, cost, indoor/outdoor, difficulty), best seasons, travel styles, suitability, food & culture, accessibility, nearby places, live-priced packages, Plan this trip.
- Trip builder: departure city, multiple destinations, exact dates or flexible month, duration, adults/children/rooms (validated), accommodation category, transport mode & class (only realistic options enabled), local transfers, dining style & dietary preference, interests, adventure toggle, must-see tickets, guides, honeymoon/wellness/nightlife extras, budget, display currency, contingency.
- Itinerary: arrival/departure timing across time zones, gateway transfers (ferries, seaplanes, Swiss rail…), meals, rest periods, transfers between sights, free time, approximate sunrise/sunset, multi-destination transfer days, overnight journeys, one-day outings.
- Editing: reorder, swap, remove, lock must-visit (survives rebuild), add optional experiences, indoor alternatives, rainy-day day plan, pacing (relaxed/balanced/busy); timing conflicts and hints are flagged.
- Estimator: main transport, accommodation (room sharing, extra beds, season factor), local travel, meals, activities, guides, optional services, fees, contingency; total, per person, range, daily breakdown, inclusions, exclusions, assumptions, calculation logic.
- Budget Comfort Meter (with the cost of upgrades/downgrades), Surprise Me, Travel Mood Compass, Animated Journey Route, Atmosphere Preview (labelled illustrative), Destination Passport, Compare up to 3 trips.
- Honeymoon Escapes (filters for beaches, mountains, privacy, resorts, adventure, duration, budget; each extra costed separately), Weekend Getaways (by departure city; 1/2/3-day; journey time, distance, transport choices, departure window, hourly plan, rainy-day alternatives), Nightlife (by city and neighbourhood, with filters).
- Save locally, print (print stylesheet), export branded HTML itinerary and JSON.
- Optional procedural sound: birds/forest, wind, rain, ocean, city; UI clicks and transition whooshes; mute, volume, remembered preference, crossfades, pauses when the tab is hidden; always starts silent.

### Uses sample data
- All prices (fares, rooms, meals, activities, services, guides) — illustrative, dated 2026-10-26.
- Display-currency rates — editable reference values, not live.
- Destination catalog (52 places), nightlife areas, honeymoon editorial attributes, suitability scores.
- Journey times and distances — modelled from straight-line distance with road/rail factors.

### Requires external integration
- **Quote delivery** — set `VITE_QUOTE_ENDPOINT` (CRM, form service or serverless function).
- **Live prices & availability** — flights, rail, hotels and activities would need supplier/aggregator APIs; the estimator’s rate card (`src/lib/geo.ts`, `src/data`) is the integration point.
- **Live exchange rates** — `VITE_FX_ENDPOINT`.
- **Bookings & payments** — not implemented; no confirmation is ever shown.
- **Shareable links / accounts** — not implemented (plans are stored per browser).
- **Destination videos** — add licensed, captioned clips via the `video` field (see docs/DATA.md).

---

## Verification performed

- `npm test` — 10 unit tests: itinerary generation for every destination, time-zone handling, one-day and multi-destination trips, pure edit operations, estimator scaling with travellers/rooms, extra-bed charges, daily totals reconciling with the trip total, validation, and branded export.
- `npm run build` — type-check and production build succeed.
- In-browser checks: home journey through all seven chapters, portals, globe and search (“Bangalore” finds Bengaluru), destination media and credits, planner edits (remove, lock + rebuild, reorder, pacing), traveller/room changes, save + reload, compare, quote-form validation and the local-save notice, weekend/honeymoon/nightlife filters, lightweight mode, atmosphere cycling, sound toggle, and mobile width (no horizontal overflow).

See `CREDITS.md` for media, data and audio credits, and `docs/DATA.md` for the data structure.

## Search, maps & site pages

- **Search anything** — the header (or menu) search finds curated destinations first, then any town, state, country, landmark or person live (Open-Meteo geocoder + Wikipedia). Recent searches are kept on the device and can be cleared.
- **Live place guides** (`#/place?...`) — Wikipedia overview and lead photo, live weather, notable spots within 10 km with photos, nearest curated planners, and booking links.
- **Satellite map journey** — on every destination and place page. Scrolling flies the camera from orbit along the route from the nearest major city (real road route from OSRM, or a flight arc for islands and long hauls) and down into the place with a 3D tilt; scrolling up reverses it. Tap the place pin or **▶ Play journey** to watch it automatically; **Explore map** unlocks drag/zoom. Imagery © Esri; street map © OpenStreetMap contributors.
- **Sun / Moon theme** toggle (bottom-left) switches light and dark across the site.
- **Footer**: Terms, Privacy, Security, Status (live service checks), Community, Docs, Contact and **Manage cookies** (shows and clears everything stored in the browser — the site sets no tracking cookies).
- **Logo**: brushed-brass compass framing a Himalayan dusk, drawn in SVG (`src/components/Logo.tsx`); the favicon is generated from the same component.

## Deployment (Netlify)

- Project `travel-guide-bhavin`. The build runs `scripts/netlify-build.sh`, which downloads the 4K photos and audio from this public GitHub repo when a deploy uploads code only, then runs `npm run build`.
- **Quote requests** are stored by `netlify/functions/quote.mjs` in Netlify Blobs (store `quote-requests`). The endpoint can only create entries. View them in Netlify → Data & Storage → Blobs; decrypt sealed ones offline with `scripts/decrypt-quote.mjs`.
- **Firebase (optional)**: set the `VITE_FIREBASE_*` variables (see `.env.example`) and deploy `firestore.rules` to store quote requests in Cloud Firestore instead.
