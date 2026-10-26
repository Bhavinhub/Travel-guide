import { useEffect, useMemo, useState } from 'react';
import { getDestination } from '../data/catalog';
import { useWeather } from '../lib/live';
import { packingFor, packKey, type ForecastHint } from '../lib/packing';
import { storage } from '../lib/store';
import type { TripConfig } from '../lib/trip';

/**
 * "What to carry" checklist for a plan or package. Ticks are remembered on this device per plan.
 * When the trip starts within the live forecast window, the clothing advice uses the forecast.
 */
const KEY = 'tg.packing';

export function PackingChecklist({ c, compact = false }: { c: TripConfig; compact?: boolean }) {
  const d = getDestination(c.destIds[0]);
  const w = useWeather(d?.lat ?? 0, d?.lon ?? 0);
  const forecast: ForecastHint | undefined = useMemo(() => {
    if (w.status !== 'ready') return undefined;
    const days = w.daily.filter((x) => x.date >= c.startDate).slice(0, c.days);
    if (!days.length) return undefined;
    return { min: Math.min(...days.map((x) => x.min)), max: Math.max(...days.map((x) => x.max)), rain: Math.max(...days.map((x) => x.rain)) };
  }, [w, c.startDate, c.days]);
  const sections = useMemo(() => packingFor(c, forecast), [c, forecast]);
  const key = packKey(c);
  const [ticks, setTicks] = useState<Record<string, boolean>>(() => storage.get<Record<string, Record<string, boolean>>>(KEY, {})[key] ?? {});
  useEffect(() => { setTicks(storage.get<Record<string, Record<string, boolean>>>(KEY, {})[key] ?? {}); }, [key]);
  const toggle = (id: string) => {
    const next = { ...ticks, [id]: !ticks[id] };
    setTicks(next);
    const all = storage.get<Record<string, Record<string, boolean>>>(KEY, {});
    storage.set(KEY, { ...all, [key]: next });
  };
  const items = sections.flatMap((s) => s.items.map((i) => `${s.id}:${i.id}`));
  const done = items.filter((k) => ticks[k]).length;
  const [open, setOpen] = useState<string[]>(compact ? ['docs'] : sections.map((s) => s.id));
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const text = sections.map((s) => `${s.title}\n${s.items.map((i) => `${ticks[`${s.id}:${i.id}`] ? '☑' : '☐'} ${i.qty ? `${i.qty} × ` : ''}${i.label}`).join('\n')}`).join('\n\n');
    navigator.clipboard?.writeText(`Travel Guide — what to carry\n\n${text}`).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); });
  };

  return (
    <div className="packing stack" style={{ gap: '.8rem' }}>
      <div className="row between" style={{ flexWrap: 'wrap', gap: '.6rem' }}>
        <div style={{ flex: '1 1 220px' }}>
          <div className="pack-progress" role="progressbar" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={done} aria-label="Packed items">
            <span style={{ width: `${(done / Math.max(1, items.length)) * 100}%` }} />
          </div>
          <p className="tiny muted" style={{ margin: '.3rem 0 0' }}>{done} of {items.length} ready{forecast ? ` · clothing tuned to the live forecast (${Math.round(forecast.min)}–${Math.round(forecast.max)}°C)` : ' · based on season and destination'}</p>
        </div>
        <div className="row" style={{ gap: '.4rem' }}>
          <button className="btn btn-sm" onClick={copy}>{copied ? '✓ Copied' : 'Copy list'}</button>
          <button className="btn btn-sm" onClick={() => window.print()}>Print</button>
        </div>
      </div>
      {sections.map((s) => {
        const isOpen = open.includes(s.id);
        const sd = s.items.filter((i) => ticks[`${s.id}:${i.id}`]).length;
        return (
          <div key={s.id} className="pack-sec">
            <button className="pack-head" aria-expanded={isOpen} onClick={() => setOpen((o) => (isOpen ? o.filter((x) => x !== s.id) : [...o, s.id]))}>
              <span aria-hidden>{s.icon}</span><b>{s.title}</b><span className="tiny muted">{sd}/{s.items.length}</span><span aria-hidden className="chev">{isOpen ? '▾' : '▸'}</span>
            </button>
            {isOpen && (
              <ul className="pack-list">
                {s.items.map((i) => {
                  const k = `${s.id}:${i.id}`;
                  return (
                    <li key={k} className={ticks[k] ? 'is-done' : ''}>
                      <label>
                        <input type="checkbox" checked={!!ticks[k]} onChange={() => toggle(k)} />
                        <span>
                          {i.qty ? <b className="qty">{i.qty}×</b> : null} {i.label}
                          {i.critical && <span className="tag tag-warn pack-must">Must have</span>}
                          {i.why && <span className="tiny muted pack-why">{i.why}</span>}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
      <p className="tiny muted" style={{ margin: 0 }}>General guidance, not legal advice. Visa, permit, ID and baggage rules change — confirm with the airline, operator and official government sources before you travel.</p>
    </div>
  );
}
