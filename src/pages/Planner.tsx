import { useMemo, useState } from 'react';
import { COMPANY, PRICING_BASIS } from '../config/company';
import { DEPARTURE_CITIES, getDeparture, INTEREST_LABELS, MONTHS, mustDestination, searchDestinations } from '../data/catalog';
import { CURRENCIES, SERVICES, type CurrencyCode } from '../data/services';
import type { Interest } from '../data/types';
import { BudgetMeter, RouteMap } from '../components/features';
import { TravelChooser } from '../components/TravelChooser';
import { CATEGORY_LABELS, estimateTrip, RANGE, type CategoryKey } from '../lib/estimate';
import { download, fileSafe, itineraryHTML } from '../lib/export';
import { legOptions } from '../lib/geo';
import { addActivity, alternativesFor, indoorDay, layoutDay, moveItem, PACE, priceLevel, removeItem, swapItem, toggleLock, type DayLayout } from '../lib/itinerary';
import { href, navigate } from '../lib/router';
import { useMoney, useStore } from '../lib/store';
import { fmtDate, fmtDur, fmtTime, todayISO } from '../lib/time';
import { validateConfig, type DayPlan, type PlanItem, type TripConfig } from '../lib/trip';

const CAT_COLORS: Record<CategoryKey, string> = {
  mainTransport: '#9ec9ff', accommodation: '#f4c56a', localTravel: '#9fe0b8', meals: '#ffb38a', activities: '#d6b3ff', guides: '#7ee0c8', services: '#f2a7a0', fees: '#c7d6d1',
};

function Stepper({ id, label, value, min, max, onChange, error }: { id: string; label: string; value: number; min: number; max: number; onChange: (v: number) => void; error?: string }) {
  return (
    <div className="field">
      <label id={`${id}-l`}>{label}</label>
      <div className="stepper" role="group" aria-labelledby={`${id}-l`}>
        <button type="button" aria-label={`Decrease ${label}`} onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}>−</button>
        <output aria-live="polite">{value}</output>
        <button type="button" aria-label={`Increase ${label}`} onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}>＋</button>
      </div>
      {error && <span className="error" role="alert">{error}</span>}
    </div>
  );
}

function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { v: T; l: string }[]; onChange: (v: T) => void }) {
  return (
    <fieldset>
      <legend>{label}</legend>
      <div className="segmented" role="group" aria-label={label}>
        {options.map((o) => <button type="button" key={o.v} aria-pressed={value === o.v} onClick={() => onChange(o.v)}>{o.l}</button>)}
      </div>
    </fieldset>
  );
}

function ConfigPanel({ c, set }: { c: TripConfig; set: (p: Partial<TripConfig>) => void }) {
  const money = useMoney();
  const prefs = useStore((s) => s.prefs);
  const setPrefs = useStore((s) => s.setPrefs);
  const [q, setQ] = useState('');
  const errors = validateConfig(c);
  const results = q ? searchDestinations(q).filter((d) => !c.destIds.includes(d.id)).slice(0, 6) : [];
  const dests = c.destIds.map(mustDestination);
  const home = getDeparture(c.departureId);
  const opts = dests[0] ? legOptions({ ...home }, { name: dests[0].name, lat: dests[0].lat, lon: dests[0].lon, tz: dests[0].tz, country: dests[0].country }, dests[0], c.travelClass, c.adults + c.children) : [];
  const modes = new Set(opts.map((o) => o.mode));
  const pl = dests[0] ? priceLevel(dests[0]) : 1;
  const romanceOK = (id: string) => id !== 'cruise' || dests.some((d) => d.romanceExtras?.includes('cruise'));
  return (
    <form className="glass panel pad" onSubmit={(e) => e.preventDefault()} aria-label="Trip configuration">
      <div className="form-section stack">
        <h2 style={{ fontSize: '1.3rem', margin: 0 }}>Where & when</h2>
        <div className="field">
          <label htmlFor="dep">Departure city</label>
          <select id="dep" className="input" value={c.departureId} onChange={(e) => set({ departureId: e.target.value })}>
            {DEPARTURE_CITIES.map((d) => <option key={d.id} value={d.id}>{d.name}{d.country !== 'India' ? ` (${d.country})` : ''}</option>)}
          </select>
        </div>
        <div className="field">
          <span className="label">Destinations (in travel order)</span>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
            {dests.map((d, i) => (
              <li key={d.id} className="row between" style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: '0.35rem 0.5rem 0.35rem 0.8rem' }}>
                <span><b>{i + 1}.</b> {d.name}</span>
                <span className="row" style={{ gap: 4 }}>
                  <button type="button" className="btn btn-sm btn-icon" aria-label={`Move ${d.name} earlier`} disabled={i === 0} onClick={() => { const x = [...c.destIds]; [x[i - 1], x[i]] = [x[i], x[i - 1]]; set({ destIds: x }); }}>↑</button>
                  <button type="button" className="btn btn-sm btn-icon" aria-label={`Remove ${d.name}`} disabled={c.destIds.length === 1} onClick={() => set({ destIds: c.destIds.filter((x) => x !== d.id) })}>✕</button>
                </span>
              </li>
            ))}
          </ul>
          <label htmlFor="add-dest" className="sr-only">Add a destination</label>
          <input id="add-dest" className="input" type="search" placeholder="Add another destination…" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
          {results.length > 0 && (
            <div className="dest-list" style={{ maxHeight: 220 }}>
              {results.map((d) => <button type="button" key={d.id} onClick={() => { set({ destIds: [...c.destIds, d.id], days: Math.max(c.days, c.destIds.length + 1) }); setQ(''); }}><span>{d.name} <span className="tiny muted">{d.scope === 'india' ? d.state : d.country}</span></span><span>＋</span></button>)}
            </div>
          )}
          {errors.destIds && <span className="error">{errors.destIds}</span>}
        </div>
        <Seg label="Dates" value={c.dateMode} options={[{ v: 'fixed', l: 'Exact dates' }, { v: 'flexible', l: 'Flexible month' }]} onChange={(v) => set({ dateMode: v, startDate: v === 'flexible' ? `${c.startDate.slice(0, 8)}01` : c.startDate })} />
        {c.dateMode === 'fixed' ? (
          <div className="field">
            <label htmlFor="start">Start date</label>
            <input id="start" className="input" type="date" min={todayISO()} value={c.startDate} aria-invalid={!!errors.startDate} onChange={(e) => e.target.value && set({ startDate: e.target.value })} />
            {errors.startDate && <span className="error" role="alert">{errors.startDate}</span>}
          </div>
        ) : (
          <div className="field">
            <label htmlFor="month">Travel month</label>
            <select id="month" className="input" value={c.startDate.slice(0, 7)} onChange={(e) => set({ startDate: `${e.target.value}-01` })}>
              {Array.from({ length: 12 }).map((_, i) => {
                const d = new Date();
                d.setDate(1);
                d.setMonth(d.getMonth() + i + 1);
                const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                return <option key={v} value={v}>{MONTHS[d.getMonth()]} {d.getFullYear()}</option>;
              })}
            </select>
            <span className="hint">The plan uses the 1st of the month for timings and seasonal pricing.</span>
          </div>
        )}
        <Stepper id="days" label="Trip length (days, incl. travel)" value={c.days} min={1} max={21} onChange={(v) => set({ days: v })} error={errors.days} />
      </div>

      <div className="form-section">
        <h2 style={{ fontSize: '1.3rem' }}>Travellers & rooms</h2>
        <div className="form-grid">
          <Stepper id="adults" label="Adults" value={c.adults} min={1} max={20} onChange={(v) => set({ adults: v, rooms: Math.min(c.rooms, v) })} error={errors.adults} />
          <Stepper id="children" label="Children (2–11)" value={c.children} min={0} max={10} onChange={(v) => set({ children: v })} error={errors.children} />
          <div className="full"><Stepper id="rooms" label="Rooms" value={c.rooms} min={1} max={Math.max(1, c.adults)} onChange={(v) => set({ rooms: v })} error={errors.rooms} /></div>
        </div>
        <p className="hint">Up to 2 adults per room are included; extra adults are charged an extra bed. Children share existing bedding.</p>
      </div>

      <details className="acc" open>
        <summary>Stay & transport</summary>
        <div className="stack">
          <Seg label="Accommodation" value={c.tier} options={[{ v: 'budget', l: 'Budget' }, { v: 'comfortable', l: 'Comfortable' }, { v: 'premium', l: 'Premium' }, { v: 'luxury', l: 'Luxury' }]} onChange={(v) => set({ tier: v })} />
          <div className="field">
            <label htmlFor="mode">Main transport</label>
            <select id="mode" className="input" value={c.transport} onChange={(e) => set({ transport: e.target.value as TripConfig['transport'] })}>
              <option value="auto">Best option (automatic)</option>
              <option value="flight" disabled={!modes.has('flight')}>Flights{!modes.has('flight') ? ' — not practical' : ''}</option>
              <option value="train" disabled={!modes.has('train')}>Trains{!modes.has('train') ? ' — not available' : ''}</option>
              <option value="bus" disabled={!modes.has('bus')}>Buses{!modes.has('bus') ? ' — not available' : ''}</option>
              <option value="car" disabled={!modes.has('car')}>Private car with driver{!modes.has('car') ? ' — too far / no road' : ''}</option>
              <option value="self-drive" disabled={!modes.has('self-drive')}>Self-drive{!modes.has('self-drive') ? ' — too far / no road' : ''}</option>
              <option value="bike" disabled={!modes.has('bike')}>Motorbike{!modes.has('bike') ? ' — not practical' : ''}</option>
              <option value="helicopter" disabled={!modes.has('helicopter')}>Helicopter charter{!modes.has('helicopter') ? ' — not available' : ''}</option>
            </select>
            {opts.length > 0 && <span className="hint">From {home.name}: {opts.map((o) => `${o.mode} ~${fmtDur(o.durationMin)}`).join(' · ')}</span>}
          </div>
          <Seg label="Class" value={c.travelClass} options={[{ v: 'economy', l: 'Economy / 3AC' }, { v: 'premium', l: 'Premium / 2AC' }, { v: 'business', l: 'Business / 1AC' }]} onChange={(v) => set({ travelClass: v })} />
          <Seg label="Local transfers" value={c.localTransport} options={[{ v: 'private', l: 'Private car' }, { v: 'mixed', l: 'Mixed' }, { v: 'public', l: 'Public & cabs' }]} onChange={(v) => set({ localTransport: v })} />
        </div>
      </details>

      <details className="acc">
        <summary>Meals, activities & guides</summary>
        <div className="stack">
          <Seg label="Dining style" value={c.mealPlan} options={[{ v: 'local', l: 'Local eateries' }, { v: 'mixed', l: 'Mixed' }, { v: 'fine', l: 'Fine dining' }]} onChange={(v) => set({ mealPlan: v })} />
          <div className="field">
            <label htmlFor="pref">Meal preference</label>
            <select id="pref" className="input" value={c.mealPref} onChange={(e) => set({ mealPref: e.target.value as TripConfig['mealPref'] })}>
              <option value="any">No preference</option><option value="vegetarian">Vegetarian</option><option value="vegan">Vegan</option><option value="jain">Jain</option><option value="halal">Halal</option>
            </select>
          </div>
          <fieldset>
            <legend>Interests (shape which activities are chosen)</legend>
            <div className="row" style={{ gap: 6 }}>
              {(['nature', 'culture', 'food', 'adventure', 'romance', 'wellness', 'nightlife'] as Interest[]).map((i) => (
                <button type="button" key={i} className="chip" aria-pressed={c.interests.includes(i)} onClick={() => set({ interests: c.interests.includes(i) ? c.interests.filter((x) => x !== i) : [...c.interests, i] })}>{INTEREST_LABELS[i]}</button>
              ))}
            </div>
          </fieldset>
          <label className="check"><input type="checkbox" checked={c.includeAdventure} onChange={(e) => set({ includeAdventure: e.target.checked })} /> Include adventure activities (rafting, paragliding, diving…)</label>
          <Seg label="Guide services" value={c.guide} options={[{ v: 'none', l: 'No guide' }, { v: 'half', l: 'Half-day' }, { v: 'full', l: 'Full-day' }]} onChange={(v) => set({ guide: v })} />
          <fieldset>
            <legend>Must-see activities & entry tickets</legend>
            {dests.map((d) => (
              <details key={d.id} style={{ marginBottom: 6 }}>
                <summary className="small" style={{ cursor: 'pointer' }}>{d.name} ({c.mustSee.filter((k) => k.startsWith(`${d.id}:`)).length} selected)</summary>
                <div className="stack" style={{ gap: 4, marginTop: 6 }}>
                  {d.attractions.map((a) => {
                    const key = `${d.id}:${a.id}`;
                    return (
                      <label key={key} className="check small">
                        <input type="checkbox" checked={c.mustSee.includes(key)} onChange={(e) => set({ mustSee: e.target.checked ? [...c.mustSee, key] : c.mustSee.filter((k) => k !== key), includeAdventure: c.includeAdventure || (e.target.checked && a.kind === 'adventure') })} />
                        <span>{a.name} <span className="muted">· {fmtDur(a.durationMin)} · {a.costINR ? money(a.costINR) : 'free'}</span></span>
                      </label>
                    );
                  })}
                </div>
              </details>
            ))}
          </fieldset>
        </div>
      </details>

      <details className="acc">
        <summary>Honeymoon, wellness & nightlife extras</summary>
        <div className="stack">
          {(['honeymoon', 'wellness', 'nightlife'] as const).map((g) => (
            <fieldset key={g}>
              <legend style={{ textTransform: 'capitalize' }}>{g}</legend>
              {SERVICES.filter((s) => s.group === g).map((s) => {
                const qty = c.services[s.id] ?? 0;
                const ok = romanceOK(s.id);
                return (
                  <div key={s.id} className="row between" style={{ padding: '0.3rem 0' }}>
                    <span className="small">{s.name}<br /><span className="tiny muted">~{money(Math.round(s.baseINR * pl))} {s.basis.replace('-', ' ')}{!ok ? ' · not offered at these destinations' : ''}</span></span>
                    <span className="stepper">
                      <button type="button" aria-label={`Fewer ${s.name}`} disabled={qty <= 0} onClick={() => { const sv = { ...c.services }; if (qty <= 1) delete sv[s.id]; else sv[s.id] = qty - 1; set({ services: sv }); }}>−</button>
                      <output>{qty}</output>
                      <button type="button" aria-label={`More ${s.name}`} disabled={!ok || qty >= 6} onClick={() => set({ services: { ...c.services, [s.id]: qty + 1 } })}>＋</button>
                    </span>
                  </div>
                );
              })}
            </fieldset>
          ))}
          <a className="small" href={href('/nightlife')}>Browse city nightlife areas →</a>
        </div>
      </details>

      <details className="acc">
        <summary>Budget, currency & contingency</summary>
        <div className="stack">
          <div className="field">
            <label htmlFor="cur">Display currency</label>
            <select id="cur" className="input" value={prefs.currency} onChange={(e) => { setPrefs({ currency: e.target.value as CurrencyCode }); set({ currency: e.target.value as CurrencyCode }); }}>
              {CURRENCIES.map((x) => <option key={x.code} value={x.code}>{x.code}</option>)}
            </select>
          </div>
          {prefs.currency !== 'INR' && (
            <div className="field">
              <label htmlFor="rate">Reference rate: 1 {prefs.currency} = ₹</label>
              <input id="rate" className="input" type="number" min={0.01} step={0.01} value={prefs.fx[prefs.currency]} onChange={(e) => { const v = Number(e.target.value); if (v > 0) setPrefs({ fx: { ...prefs.fx, [prefs.currency]: v } }); }} />
              <span className="hint">{useStore.getState().fxLive ? `Live reference rate from the ${useStore.getState().fxLive!.source}, dated ${useStore.getState().fxLive!.date}. You can override it.` : 'Editable reference rate — live rates could not be loaded.'}</span>
            </div>
          )}
          <div className="field">
            <label htmlFor="cont">Contingency allowance: {c.contingencyPct}%</label>
            <input id="cont" type="range" min={0} max={20} step={1} value={c.contingencyPct} onChange={(e) => set({ contingencyPct: Number(e.target.value) })} />
          </div>
        </div>
      </details>
    </form>
  );
}

function ItemCard({ row, day, dayIdx, days, setDays }: { row: DayLayout['rows'][number]; day: DayPlan; dayIdx: number; days: DayPlan[]; setDays: (d: DayPlan[]) => void }) {
  const money = useMoney();
  const c = useStore((s) => s.draft.config);
  const it = row.item;
  const [swap, setSwap] = useState(false);
  const alts = it.type === 'activity' ? alternativesFor(days, it.destId) : [];
  const indoorAlt = it.type === 'activity' && !it.indoor ? alternativesFor(days, it.destId, { indoorOnly: true })[0] : undefined;
  const editable = it.type === 'activity' || it.type === 'service' || it.type === 'rest' || it.type === 'meal';
  const cost = (it.groupCost ?? 0) + it.costPP * (c.adults + c.children * (it.type === 'meal' ? 0.6 : 0.5));
  const i = day.items.indexOf(it);
  const conflict = row.issues.some((x) => x.level === 'conflict');
  return (
    <li className={`tl-item ${it.type} ${it.locked ? 'locked' : ''} ${conflict ? 'has-conflict' : ''}`}>
      <span className="tl-time">{fmtTime(row.start)}</span>
      <span className="tl-dot" aria-hidden />
      <div className="tl-card">
        <div className="t">
          <span>{it.locked && <span aria-label="Locked">🔒 </span>}{it.title}{it.optional && it.type === 'activity' ? <span className="tag" style={{ marginLeft: 6 }}>optional</span> : null}</span>
          <span className="small num">{cost ? money(cost) : ''}</span>
        </div>
        <div className="m">
          {fmtTime(row.start)}–{fmtTime(row.end)} · {fmtDur(it.durationMin)}{it.during ? ' (during the excursion)' : ''} · {it.location}
          {it.transport ? ` · ${it.transport}` : ''}
          {it.indoor !== undefined && it.type === 'activity' ? ` · ${it.indoor ? 'indoor' : 'outdoor'}` : ''}
        </div>
        {it.note && <div className="m" style={{ marginTop: 2 }}>{it.note}</div>}
        {row.issues.map((x) => <div key={x.text} className={`issue ${x.level}`} role={x.level === 'conflict' ? 'alert' : undefined}>{x.level === 'conflict' ? '⚠ ' : 'ℹ '}{x.text}</div>)}
        {editable && (
          <div className="tl-actions no-print">
            <button className="btn btn-sm" aria-label={`Move ${it.title} earlier`} disabled={i <= 0} onClick={() => setDays(moveItem(days, dayIdx, it.uid, -1))}>↑</button>
            <button className="btn btn-sm" aria-label={`Move ${it.title} later`} disabled={i >= day.items.length - 1} onClick={() => setDays(moveItem(days, dayIdx, it.uid, 1))}>↓</button>
            {it.type === 'activity' && <button className="btn btn-sm" aria-pressed={!!it.locked} onClick={() => setDays(toggleLock(days, dayIdx, it.uid))}>{it.locked ? 'Unlock' : 'Lock must-visit'}</button>}
            {it.type === 'activity' && alts.length > 0 && <button className="btn btn-sm" aria-expanded={swap} onClick={() => setSwap((s) => !s)}>Swap</button>}
            {indoorAlt && <button className="btn btn-sm" onClick={() => setDays(swapItem(days, dayIdx, it.uid, indoorAlt.id))} title={`Swap for ${indoorAlt.name}`}>Indoor alternative</button>}
            <button className="btn btn-sm" disabled={it.locked} onClick={() => setDays(removeItem(days, dayIdx, it.uid))} aria-label={`Remove ${it.title}`}>Remove</button>
          </div>
        )}
        {swap && (
          <div className="field no-print" style={{ marginTop: 6 }}>
            <label htmlFor={`swap-${it.uid}`}>Replace with</label>
            <select id={`swap-${it.uid}`} className="input" defaultValue="" onChange={(e) => { if (e.target.value) { setDays(swapItem(days, dayIdx, it.uid, e.target.value)); setSwap(false); } }}>
              <option value="" disabled>Choose an alternative…</option>
              {alts.map((a) => <option key={a.id} value={a.id}>{a.name} ({fmtDur(a.durationMin)}{a.indoor ? ', indoor' : ''})</option>)}
            </select>
          </div>
        )}
      </div>
    </li>
  );
}

function DayCard({ day, dayIdx, days, setDays, layout, dayCost, open }: { day: DayPlan; dayIdx: number; days: DayPlan[]; setDays: (d: DayPlan[]) => void; layout: DayLayout; dayCost: number; open: boolean }) {
  const money = useMoney();
  const conflicts = layout.issues.filter((x) => x.level === 'conflict').length;
  const unused = alternativesFor(days, day.destId);
  const d = mustDestination(day.destId);
  const dayIssues = layout.issues.filter((x) => !layout.rows.some((r) => r.issues.includes(x)));
  return (
    <article className="day glass pad" aria-labelledby={`day-${dayIdx}`}>
      <details open={open}>
        <summary style={{ listStyle: 'none', cursor: 'pointer' }}>
          <div className="day-head">
            <div>
              <span className="eyebrow" style={{ marginBottom: 2 }}>Day {dayIdx + 1} · {fmtDate(day.date)}</span>
              <h3 id={`day-${dayIdx}`} style={{ margin: 0 }}>{day.title}</h3>
              <span className="small muted">{day.items.filter((x) => x.type === 'activity').length} activities · ~{fmtDur(layout.activeMin)} sightseeing · sunrise {fmtTime(layout.sunrise)} / sunset {fmtTime(layout.sunset)} (approx.)</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="num" style={{ fontWeight: 700 }}>{money(dayCost)}</div>
              <span className="tiny muted">day estimate</span>
              {conflicts > 0 && <div><span className="tag tag-warn">{conflicts} timing conflict{conflicts > 1 ? 's' : ''}</span></div>}
            </div>
          </div>
          <span className="tiny muted no-print">Show / hide hourly schedule</span>
        </summary>
        {dayIssues.map((x) => <div key={x.text} className={`issue ${x.level}`}>{x.level === 'conflict' ? '⚠ ' : 'ℹ '}{x.text}</div>)}
        <ol className="timeline">
          {layout.rows.map((r) => (
            <div key={r.item.uid} style={{ display: 'contents' }}>
              {r.freeBefore >= 30 && <li className="tl-free" aria-label="Free time">{r.item.type === 'transit' && /flight/i.test(r.item.title) ? `↳ ${fmtDur(r.freeBefore)} at the airport — check-in & security` : `↳ ${fmtDur(r.freeBefore)} free time — explore nearby, rest or shop`}</li>}
              {r.transferBefore > 0 && <li className="tl-transfer">↳ ~{fmtDur(r.transferBefore)} transfer{d.cost.localPerDay ? '' : ' (walk / boat)'}</li>}
              <ItemCard row={r} day={day} dayIdx={dayIdx} days={days} setDays={setDays} />
            </div>
          ))}
        </ol>
        <div className="row no-print" style={{ marginTop: '0.6rem' }}>
          {unused.length > 0 && (
            <div className="field" style={{ minWidth: 240 }}>
              <label htmlFor={`add-${dayIdx}`} className="sr-only">Add an optional experience</label>
              <select id={`add-${dayIdx}`} className="input" defaultValue="" onChange={(e) => { if (e.target.value) { setDays(addActivity(days, dayIdx, e.target.value)); e.target.value = ''; } }}>
                <option value="" disabled>＋ Add an optional experience…</option>
                {unused.map((a) => <option key={a.id} value={a.id}>{a.name} · {fmtDur(a.durationMin)}</option>)}
              </select>
            </div>
          )}
          <button className="btn btn-sm" onClick={() => setDays(indoorDay(days, dayIdx))}>☂ Rainy-day plan (indoor swaps)</button>
        </div>
      </details>
    </article>
  );
}

export default function Planner() {
  const draft = useStore((s) => s.draft);
  const setConfig = useStore((s) => s.setConfig);
  const setDays = useStore((s) => s.setDays);
  const saveDraft = useStore((s) => s.saveDraft);
  const regenerate = useStore((s) => s.regenerate);
  const money = useMoney();
  const [tab, setTab] = useState<'itinerary' | 'estimate' | 'route'>('itinerary');
  const [name, setName] = useState(draft.name);
  const c = draft.config;
  const errors = validateConfig(c);
  const valid = Object.keys(errors).length === 0;
  const layouts = useMemo(() => draft.days.map((d) => layoutDay(d, c)), [draft.days, c]);
  const est = useMemo(() => estimateTrip(c, draft.days), [c, draft.days]);
  const conflicts = layouts.reduce((n, l) => n + l.issues.filter((x) => x.level === 'conflict').length, 0);
  const dests = [...new Set(c.destIds)].map(mustDestination);
  const set = (p: Partial<TripConfig>) => setConfig(p, { regenerate: true });
  const exportHTML = () => download(`${fileSafe(name || 'travel-guide-plan')}.html`, itineraryHTML(name, c, draft.days, est, money));
  const exportJSON = () => download(`${fileSafe(name || 'travel-guide-plan')}.json`, JSON.stringify({ app: COMPANY.name, name, exportedAt: new Date().toISOString(), basis: PRICING_BASIS, config: c, days: draft.days, estimate: est }, null, 2), 'application/json');

  return (
    <main className="page" id="main" tabIndex={-1}>
      <div className="page-bg" />
      <div className="wrap stack" style={{ gap: '1.4rem' }}>
        <div className="print-only"><strong>{COMPANY.name}</strong> — {COMPANY.tagline}</div>
        <header className="row between" style={{ alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 420px' }}>
            <h1 className="eyebrow" style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', margin: '0 0 0.8rem' }}>Build My Trip</h1>
            <label htmlFor="trip-name" className="sr-only">Trip name</label>
            <input id="trip-name" className="input trip-name" title="Rename this trip" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => useStore.setState({ draft: { ...draft, name } })} />
            <p className="small muted" style={{ margin: '0.4rem 0 0' }}>{dests.map((d) => d.name).join(' → ')} · from {getDeparture(c.departureId).name} · {c.days} day{c.days > 1 ? 's' : ''} · {c.adults + c.children} traveller{c.adults + c.children > 1 ? 's' : ''}</p>
          </div>
          <div className="row no-print">
            <button className="btn btn-primary" onClick={() => saveDraft(name)} disabled={!valid}>Save this plan</button>
            <button className="btn" onClick={() => window.print()}>Print</button>
            <button className="btn" onClick={exportHTML}>Export itinerary</button>
            <button className="btn btn-ghost" onClick={exportJSON}>JSON</button>
            <button className="btn btn-accent" onClick={() => { saveDraft(name); navigate('/contact?quote=1'); }} disabled={!valid}>Request a quote</button>
          </div>
        </header>

        <a className="btn btn-sm mobile-only no-print" href="#plan-overview" onClick={(e) => { e.preventDefault(); document.getElementById('plan-overview')?.scrollIntoView({ behavior: 'smooth' }); }}>↓ Jump to estimate & day plan · {money(est.total)}</a>
        <div className="planner">
          <aside aria-label="Trip options"><ConfigPanel c={c} set={set} /></aside>
          <div className="stack" style={{ gap: '1.2rem', minWidth: 0 }}>
            <section className="glass panel pad stack" aria-labelledby="travel-h" data-no-reveal>
              <div className="row between">
                <h2 id="travel-h" style={{ fontSize: '1.3rem', margin: 0 }}>How do you want to travel?</h2>
                <button className="btn btn-primary" disabled={!valid} onClick={() => navigate('/trip')} data-magnetic>Continue to trip details →</button>
              </div>
              <TravelChooser c={c} set={set} />
            </section>
            {!valid && <div className="notice danger" role="alert"><strong>Please fix:</strong> {Object.values(errors).join(' ')}</div>}
            {draft.warnings.map((w) => <div key={w} className="notice">{w}</div>)}

            <section className="glass panel pad" aria-labelledby="ov" id="plan-overview" style={{ scrollMarginTop: 'calc(var(--nav-h) + 24px)' }}>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', alignItems: 'start' }}>
                <div className="total-card">
                  <span id="ov" className="eyebrow" style={{ marginBottom: 0 }}>Total estimated trip expense</span>
                  <span className="big num">{money(est.total)}</span>
                  <span className="small muted">Range {money(est.low)} – {money(est.high)}</span>
                </div>
                <div className="total-card"><span className="eyebrow" style={{ marginBottom: 0 }}>Per person</span><span className="big num" style={{ fontSize: '1.8rem' }}>{money(est.perPerson)}</span><span className="small muted">{est.travellers} travellers · {est.nights} nights</span></div>
                <div className="total-card"><span className="eyebrow" style={{ marginBottom: 0 }}>Plan health</span><span style={{ fontWeight: 700 }}>{conflicts ? `${conflicts} timing conflict${conflicts > 1 ? 's' : ''}` : 'No timing conflicts'}</span><span className="small muted">{PACE[c.pacing].label} pacing</span></div>
              </div>
              <div className="bar" style={{ marginTop: '1rem' }} role="img" aria-label="Share of each expense category">
                {est.categories.filter((x) => x.amount > 0).map((x) => <i key={x.key} style={{ width: `${(x.amount / Math.max(1, est.subtotal)) * 100}%`, background: CAT_COLORS[x.key] }} title={`${x.label}: ${money(x.amount)}`} />)}
              </div>
              <div className="legend" style={{ marginTop: '0.5rem' }}>
                {est.categories.filter((x) => x.amount > 0).map((x) => <span key={x.key} style={{ ['--c' as string]: CAT_COLORS[x.key] }}>{x.label} {money(x.amount)}</span>)}
              </div>
              <p className="tiny muted" style={{ margin: '0.8rem 0 0' }}><span className="tag tag-sample">Sample data</span> {PRICING_BASIS.label} · compiled {PRICING_BASIS.compiledOn}. {PRICING_BASIS.note}</p>
            </section>

            <div className="row between no-print">
              <div className="tabs" role="tablist" aria-label="Plan views">
                {(['itinerary', 'estimate', 'route'] as const).map((t) => (
                  <button key={t} role="tab" id={`tab-${t}`} aria-selected={tab === t} aria-controls={`panel-${t}`} onClick={() => setTab(t)}>
                    {t === 'itinerary' ? 'Day-by-day plan' : t === 'estimate' ? 'Expense breakdown' : 'Route map'}
                  </button>
                ))}
              </div>
              <Seg label="Pacing" value={c.pacing} options={[{ v: 'relaxed', l: 'Relaxed' }, { v: 'balanced', l: 'Balanced' }, { v: 'busy', l: 'Busy' }]} onChange={(v) => set({ pacing: v })} />
            </div>

            {tab === 'itinerary' && (
              <section id="panel-itinerary" role="tabpanel" aria-labelledby="tab-itinerary" className="stack">
                <div className="row between no-print">
                  <p className="small muted" style={{ margin: 0 }}>Times are in each destination’s local time. Reorder, swap, lock or remove items — costs and timings update instantly. Locked activities survive a rebuild.</p>
                  <button className="btn btn-sm" onClick={regenerate}>↻ Rebuild plan</button>
                </div>
                {draft.days.map((d, i) => (
                  <DayCard key={`${d.index}-${d.date}`} day={d} dayIdx={i} days={draft.days} setDays={setDays} layout={layouts[i]} dayCost={est.daily[i]?.total ?? 0} open={i < 2} />
                ))}
              </section>
            )}

            {tab === 'estimate' && (
              <section id="panel-estimate" role="tabpanel" aria-labelledby="tab-estimate" className="stack">
                <div className="glass panel pad">
                  <h2 style={{ fontSize: '1.4rem' }}>Expense breakdown</h2>
                  <table className="cost-table">
                    <thead><tr><th>Category</th><th className="r">Estimate</th><th className="r">Range</th></tr></thead>
                    <tbody>
                      {est.categories.map((x) => (
                        <tr key={x.key}>
                          <td><strong>{CATEGORY_LABELS[x.key]}</strong>{x.lines.map((l) => <div key={l} className="tiny muted">{l}</div>)}</td>
                          <td className="r">{money(x.amount)}</td>
                          <td className="r tiny muted">{money(x.low)}–{money(x.high)}<br />(×{RANGE[x.key][0]}–×{RANGE[x.key][1]})</td>
                        </tr>
                      ))}
                      <tr><td><strong>Contingency allowance</strong><div className="tiny muted">{c.contingencyPct}% of subtotal {money(est.subtotal)}</div></td><td className="r">{money(est.contingency)}</td><td /></tr>
                    </tbody>
                    <tfoot><tr><td>Total estimated trip expense</td><td className="r">{money(est.total)}</td><td className="r">{money(est.low)}–{money(est.high)}</td></tr>
                      <tr><td>Per person ({est.travellers})</td><td className="r">{money(est.perPerson)}</td><td /></tr></tfoot>
                  </table>
                </div>
                <div className="glass panel pad">
                  <h3>Daily expense breakdown</h3>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="cost-table small">
                      <thead><tr><th>Day</th>{(['mainTransport', 'accommodation', 'localTravel', 'meals', 'activities', 'guides', 'services'] as CategoryKey[]).map((k) => <th key={k} className="r">{CATEGORY_LABELS[k].split(' ')[0]}</th>)}<th className="r">Total</th></tr></thead>
                      <tbody>
                        {est.daily.map((d) => (
                          <tr key={d.index}><td>Day {d.index + 1}<br /><span className="tiny muted">{d.destName}</span></td>
                            {(['mainTransport', 'accommodation', 'localTravel', 'meals', 'activities', 'guides', 'services'] as CategoryKey[]).map((k) => <td key={k} className="r">{d.parts[k] ? money(d.parts[k]) : '—'}</td>)}
                            <td className="r"><strong>{money(d.total)}</strong></td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="tiny muted">Fees and contingency are applied to the trip total rather than individual days.</p>
                </div>
                <div className="grid grid-2">
                  <div className="glass pad"><h3>Inclusions</h3><ul className="small">{est.inclusions.map((x) => <li key={x}>{x}</li>)}</ul></div>
                  <div className="glass pad"><h3>Exclusions</h3><ul className="small">{est.exclusions.map((x) => <li key={x}>{x}</li>)}</ul></div>
                </div>
                <div className="glass panel pad">
                  <h3>Assumptions & calculation logic</h3>
                  <ul className="small">{est.assumptions.map((x) => <li key={x}>{x}</li>)}</ul>
                  <details className="small">
                    <summary style={{ cursor: 'pointer' }}>How each number is calculated</summary>
                    <ul>
                      <li><b>Main transport</b> = per-leg fare × adults + child fare × children (+ gateway ferry/rail/road transfer per person), or vehicle-km for road trips. Return leg included.</li>
                      <li><b>Accommodation</b> = rooms × nightly rate (by style) × season factor, + 25% per extra adult beyond 2 per room.</li>
                      <li><b>Local travel</b> = private vehicle day rate × vehicles, or public transport per person, × share of the day spent at the destination.</li>
                      <li><b>Meals</b> = destination meal budget × dining style × split (breakfast 20% / lunch 35% / dinner 45%) for each scheduled meal; children at 60%.</li>
                      <li><b>Activities</b> = each scheduled item’s per-person cost × (adults + 50% of children).</li>
                      <li><b>Guides</b> = guide day rate × destination price level on sightseeing days.</li>
                      <li><b>Optional services</b> = service base price × destination price level, by basis (per couple / person / group / trip).</li>
                      <li><b>Range</b> = each category multiplied by its low/high factor (shown above), plus contingency on the high end.</li>
                    </ul>
                    <p>Source: <code>src/lib/estimate.ts</code> and rate cards in <code>src/lib/geo.ts</code> and <code>src/data</code>.</p>
                  </details>
                </div>
                <div className="glass panel pad"><BudgetMeter config={c} perPerson={est.perPerson} onBudget={(v) => setConfig({ budgetPerPersonINR: v }, { regenerate: false })} /></div>
              </section>
            )}

            {tab === 'route' && (
              <section id="panel-route" role="tabpanel" aria-labelledby="tab-route" className="glass panel pad stack">
                <h2 style={{ fontSize: '1.4rem' }}>Animated journey route</h2>
                <RouteMap config={c} />
                <ul className="small">
                  {draft.days.flatMap((d) => d.items.filter((i) => i.type === 'transit' && i.groupCost !== undefined && i.costCategory === 'mainTransport').map((i) => ({ i, d }))).map(({ i, d }: { i: PlanItem; d: DayPlan }) => (
                    <li key={i.uid}>Day {d.index + 1}: {i.title} — {fmtDur(i.durationMin)}{i.groupCost ? ` · ${money(i.groupCost)}` : ''}</li>
                  ))}
                </ul>
              </section>
            )}

            <p className="tiny muted">Bookings are not made on this site. “Save this plan” stores it in this browser only; “Request a quote” prepares an enquiry for {COMPANY.name}.</p>
          </div>
        </div>
      </div>
    </main>
  );
}
