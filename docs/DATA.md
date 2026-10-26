# Travel Guide — data structure

All content lives in `src/data` and is independent of the UI. Types are in `src/data/types.ts`.

## Destinations

`Destination` (one object per place) — key fields:

| Field | Meaning |
| --- | --- |
| `id` | URL-safe id, used in `#/destination/:id` |
| `name`, `aka` | Display name and alternate names for search (e.g. `Bengaluru` / `Bangalore`) |
| `kind` | `city`, `town`, `region`, `island`, `atoll` or `city-state` |
| `scope` | `india` or `world` |
| `state`, `stateType` | India only: state or union territory name and type |
| `continent`, `country` | Hierarchy for international places |
| `lat`, `lon`, `tz` | Coordinates and IANA time zone (used for distances, sunrise/sunset and arrival times) |
| `wiki` | Wikipedia article used to fetch matching photos. Append `#File:Name.jpg` to pin a reviewed Commons file as the lead image |
| `tagline`, `why` | Editorial copy |
| `interests`, `moods` | Drive filters, Mood Compass and activity selection |
| `days` | `[minimum, ideal]` stay in days |
| `bestMonths`, `seasonsNote` | Months 1–12 and a short explanation |
| `cost` | Built with `C(roomMult, mealMult, carPerDay, publicPerPerson)` — multiplies the Indian baseline room and meal rates (see `helpers.ts`) |
| `access` | Whether air / rail / road access is realistic, plus airport text |
| `gateway` | For places without their own airport: hub coordinates and the onward transfer (`road`, `ferry`, `rail`, `speedboat`, `seaplane`), its minutes and per-person cost |
| `attractions` | Built with `A(name, minutes, costINR, slot, options)` |
| `food`, `culture`, `nearby` | Highlights; `nearby` holds destination ids |
| `suitability` | Editorial 1–5 for couples, families, solo, friends (not ratings) |
| `accessibility`, `entryNotes` | Practical notes; never invented fee amounts |
| `romanceExtras` | Which honeymoon services are offered (`candlelight`, `spa`, `transfers`, `cruise`, `photo`, `decor`) |
| `video` | Optional `{ src, captions, credit, poster }` — only add licensed clips with captions |
| `accent`, `scene` | Accent colour and illustration style |

### Attractions

`A('Lalbagh Botanical Garden', 120, 30, 'morning', { daylight: true, kind: 'nature' })`

- `slot`: `morning`, `midday`, `afternoon`, `sunset`, `evening` or `any` — the planner places items accordingly.
- `indoor`: used for rainy-day / indoor alternatives.
- `daylight`: flagged as a conflict if scheduled after sunset.
- `transferMin`: typical one-way minutes from the destination base; ≥ 60 marks a day excursion.
- `kind`: `sight`, `nature`, `activity`, `food`, `shopping`, `adventure`, `wellness`, `nightlife`. Adventure items are only scheduled if the visitor opts in or marks them as must-see.
- `note`: practical advice. Write “verify” rather than stating hours as fact.

### Adding a destination

1. Add an object to `destinations-india.ts` (or `destinations-world.ts`), following the existing entries.
2. Check the `wiki` title resolves to the correct article and that its lead image is a photo (not a map or flag). If not, pin a file with `#File:…`.
3. If there is no airport, add a `gateway`.
4. Run `npm test` — the suite generates an itinerary and estimate for every destination.

## Departure cities

`DEPARTURE_CITIES` in `catalog.ts` — coordinates, time zone and rail availability.

## Services, guides & currencies

`services.ts` — optional extras with `basis` (`per-couple`, `per-person`, `per-group`, `per-trip`) and base INR price. Prices are scaled by the destination price level (`priceLevel` in `lib/itinerary.ts`). Display currencies list editable reference rates (INR per unit).

## Nightlife

`nightlife.ts` — neighbourhood-level listings (not individual venues) with experience types, atmosphere, music, illustrative spend range, transport, return tip and alcohol-free note. Do **not** add opening hours, age limits, availability or private-event permissions unless verified.

## Pricing model

| Component | Rule (see `lib/geo.ts`, `lib/estimate.ts`) |
| --- | --- |
| Flights | base + per-km × class multiplier; children 75%; +connection time on very long routes; gateway transfer added |
| Trains | per-km by class (3AC/2AC/1AC); children 50%; India only, both ends with rail |
| Buses | per-km; ≤ 1,100 km road |
| Private car / self-drive | vehicle-km (sedan/SUV/van by party size); self-drive adds daily rental under local travel |
| Accommodation | rooms × nightly rate × season factor (×1.1 in best months, ×0.9 otherwise) + 25% per extra adult beyond 2 per room |
| Meals | destination meal budget × dining style × 20/35/45% split per scheduled meal; children 60% |
| Activities | per-person cost × (adults + 50% children) for scheduled items |
| Guides | half/full-day rate × price level on sightseeing days |
| Fees | company service fee (`COMPANY.serviceFeePct`, 0% in demo); taxes/visas not estimated |
| Range | per-category low/high multipliers + contingency |

All figures are stamped with `PRICING_BASIS` in `src/config/company.ts` — update its label and date whenever the rate card changes.
