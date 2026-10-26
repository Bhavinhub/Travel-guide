# Credits

## Photography
Destination, area and journey-chapter photographs are loaded at runtime from **Wikimedia Commons** via the matching English Wikipedia article (Wikipedia `pageimages` and `media-list` APIs). Each image is shown with its author and licence as reported by Commons (`extmetadata`), and links to its Commons file page. Wikipedia’s page-image service only returns freely licensed images. Licences vary per file (e.g. CC BY, CC BY-SA, public domain) — see each file page.

Photographs are downloaded by `scripts/fetch-media.mjs` into `public/media/` (960 / 1920 / 3840 px) and listed with author, licence and source page in `src/data/media.json`; the About page shows the full list. Background videos (`public/video`): *Tea garden Assam India* — Joy sagar Murmu (CC BY-SA 4.0); *Khunkorn waterfall* — Deror Avi (CC BY-SA 3.0); *Snow falling in Charlton MA* — Peter Cooper Jr. (CC0); *Sunset in Pantai Kukup* — Joaquim Baeta (CC BY 4.0). Globe: NASA Earth Observatory Blue Marble and *Earth's City Lights* (NASA GSFC / NOAA NGDC) — public domain.

Nightlife cards show **neighbourhood** photos, labelled “Area photo, not a specific venue”.

## 3D
The glossy abstract shapes in the hero are rendered live in the browser with Three.js physically based materials; their reflections use the real chapter photograph. No AI-generated or drawn imagery is used.

## Maps
Country and land outlines: **Natural Earth** (public domain) via the [`world-atlas`](https://github.com/topojson/world-atlas) package (ISC licence), decoded with `topojson-client` (ISC).

## Sound
Real recordings from Wikimedia Commons (`scripts/fetch-audio.mjs`, credits in `src/data/audio.json`): *Birdsong morning 01* (CC BY-SA 4.0), *Summer thunderstorm in the woods* — Serg Childed (CC BY-SA 4.0), *Howling wind* (CC0), *Ocean Waves on a Tropical Beach* (CC0), *Urban Street on a Rainy Afternoon* (CC0, 5-minute excerpt), *Indian Folk Classical Flute Music* (CC BY-SA 4.0), *A Man Approaches with Bowed Sitar, Rishikesh* — Samuel Corwin (CC BY 4.0), *Sitar and tabla rendition — Freedom Jam 2015* — Ashok Ayengar (CC BY-SA 4.0), *Mystery Bazaar* — Kevin MacLeod (CC BY 3.0). Interface clicks are synthesised.

## Typefaces
**Fraunces** and **Inter** — SIL Open Font License 1.1 — served by Google Fonts.

## Open-source libraries
React, React DOM (MIT) · Three.js (MIT) · @react-three/fiber, @react-three/drei (MIT) · GSAP (GreenSock standard “no charge” licence) · Zustand (MIT) · topojson-client (ISC) · world-atlas (ISC) · Vite, Vitest, TypeScript (MIT / Apache-2.0).

## Design references
The direction follows general practice in immersive web design (a single persistent scene, scroll-driven camera, restrained lighting, short finite transitions). The studios named in the brief (Bruno Simon, Lusion, Immersive Garden, Igloo) and social media were **not** browsed during this build, and no layouts, code or assets from them or anyone else were copied.

## Data
Destination facts, attraction lists and seasonal notes are a curated editorial sample. Prices are illustrative planning figures compiled for this demo (2026-10-26) and are not quotes.
