import { useState } from 'react';
import { COMPANY, ENV } from '../config/company';
import { getDeparture, mustDestination } from '../data/catalog';
import { estimateTrip } from '../lib/estimate';
import { useRoute } from '../lib/router';
import { storage, useMoney, useStore } from '../lib/store';
import { PUBLIC_KEY, sealForCompany } from '../lib/crypto';

const LIMITS = { name: 80, email: 120, phone: 20, message: 2000 };

interface Form { name: string; email: string; phone: string; message: string; includePlan: boolean; consent: boolean; website: string }

export default function Contact() {
  const route = useRoute();
  const draft = useStore((s) => s.draft);
  const money = useMoney();
  const [f, setF] = useState<Form>({ name: '', email: '', phone: '', message: '', includePlan: route.query.get('quote') === '1', consent: false, website: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'saved' | 'error'>('idle');
  const c = COMPANY.contact;
  const hasContact = c.email || c.phone || c.address;
  const est = estimateTrip(draft.config, draft.days);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  const validate = () => {
    const e: typeof errors = {};
    if (f.name.trim().length < 2) e.name = 'Please enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) e.email = 'Please enter a valid email address, e.g. name@example.com.';
    if (f.phone && !/^[+\d][\d\s-]{6,}$/.test(f.phone.trim())) e.phone = 'Use digits, spaces or dashes (optionally starting with +).';
    if (!f.includePlan && f.message.trim().length < 10) e.message = 'Tell us a little about your trip (at least 10 characters).';
    if (!f.consent) e.consent = 'Please confirm we may use these details to reply to you.';
    setErrors(e);
    return e;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    // Honeypot: real visitors never see or fill the "website" field; bots usually do.
    if (f.website) { setStatus('saved'); return; }
    const last = storage.get<number>('tg.lastQuote', 0);
    if (Date.now() - last < 30_000) { setErrors({ message: 'Please wait a few seconds before sending another request.' }); return; }
    const e = validate();
    const first = (['name', 'email', 'phone', 'message', 'consent'] as const).find((k) => e[k]);
    if (first) {
      document.getElementById(first === 'consent' ? 'consent' : first)?.focus();
      return;
    }
    storage.set('tg.lastQuote', Date.now());
    const clean = (s: string, n: number) => s.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
    const payload = {
      company: COMPANY.name, submittedAt: new Date().toISOString(), name: clean(f.name, LIMITS.name), email: clean(f.email, LIMITS.email), phone: clean(f.phone, LIMITS.phone), message: clean(f.message, LIMITS.message),
      plan: f.includePlan ? { name: draft.name, config: draft.config, estimateTotalINR: est.total, perPersonINR: est.perPerson } : null,
    };
    // Encrypt with Travel Guide's RSA public key when configured, so only the company can read it.
    const body = PUBLIC_KEY ? await sealForCompany(payload).catch(() => null) : payload;
    if (!body) { setStatus('error'); return; }
    if (ENV.quoteEndpoint) {
      setStatus('sending');
      try {
        const r = await fetch(ENV.quoteEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'omit', referrerPolicy: 'no-referrer' });
        setStatus(r.ok ? 'sent' : 'error');
      } catch {
        setStatus('error');
      }
    } else {
      const list = storage.get<unknown[]>('tg.quoteRequests', []);
      storage.set('tg.quoteRequests', [...list, body].slice(-20));
      setStatus('saved');
    }
  };

  const field = (k: keyof Form) => ({ 'aria-invalid': !!errors[k], 'aria-describedby': errors[k] ? `${k}-err` : undefined });

  return (
    <main className="page" id="main" tabIndex={-1}>
      <div className="page-bg" />
      <div className="wrap grid grid-2" style={{ alignItems: 'start', gap: '2rem' }}>
        <div className="stack">
          <span className="eyebrow">Contact {COMPANY.name}</span>
          <h1 style={{ fontSize: 'clamp(2.2rem, 5vw, 3.6rem)' }}>Request a quote</h1>
          <p className="lead">Share your plan and we’ll come back with real availability and pricing. Nothing is booked or charged here.</p>
          <div className="glass panel pad small">
            <strong>Contact details</strong>
            {hasContact ? (
              <ul>{c.email && <li>Email: <a href={`mailto:${c.email}`}>{c.email}</a></li>}{c.phone && <li>Phone: {c.phone}</li>}{c.address && <li>{c.address}</li>}{c.hours && <li>{c.hours}</li>}</ul>
            ) : (
              <p className="muted" style={{ margin: '0.4rem 0 0' }}>Verified contact details haven’t been added yet. Site owner: add them in <code>src/config/company.ts</code>.</p>
            )}
          </div>
          {f.includePlan && (
            <div className="glass panel pad small">
              <strong>Plan attached: {draft.name}</strong>
              <p className="muted" style={{ margin: '0.3rem 0 0' }}>
                {[...new Set(draft.config.destIds)].map((d) => mustDestination(d).name).join(' → ')} from {getDeparture(draft.config.departureId).name} · {draft.config.days} days · {draft.config.adults} adults{draft.config.children ? `, ${draft.config.children} children` : ''} · estimate {money(est.total)} (illustrative)
              </p>
            </div>
          )}
        </div>

        <form className="glass panel pad stack" onSubmit={submit} noValidate aria-describedby="form-note">
          {status === 'sent' && <div className="notice info" role="status">Thank you — your request was sent to {COMPANY.name}. You’ll hear back by email.</div>}
          {status === 'saved' && (
            <div className="notice" role="status">
              <strong>Saved on this device — not sent.</strong> Online submissions aren’t connected yet, so your request was stored in this browser only. Site owner: set <code>VITE_QUOTE_ENDPOINT</code> (see README) to deliver requests to {COMPANY.name}.
            </div>
          )}
          {status === 'error' && <div className="notice danger" role="alert">We couldn’t send your request. Please try again later.</div>}
          <div className="field">
            <label htmlFor="name">Your name *</label>
            <input id="name" className="input" autoComplete="name" value={f.name} maxLength={LIMITS.name} onChange={(e) => set('name', e.target.value)} {...field('name')} />
            {errors.name && <span id="name-err" className="error">{errors.name}</span>}
          </div>
          <div className="field">
            <label htmlFor="email">Email *</label>
            <input id="email" className="input" type="email" autoComplete="email" value={f.email} maxLength={LIMITS.email} onChange={(e) => set('email', e.target.value)} {...field('email')} />
            {errors.email && <span id="email-err" className="error">{errors.email}</span>}
          </div>
          <div className="field">
            <label htmlFor="phone">Phone (optional)</label>
            <input id="phone" className="input" type="tel" autoComplete="tel" value={f.phone} maxLength={LIMITS.phone} onChange={(e) => set('phone', e.target.value)} {...field('phone')} />
            {errors.phone && <span id="phone-err" className="error">{errors.phone}</span>}
          </div>
          <div className="field">
            <label htmlFor="message">Message {f.includePlan ? '(optional)' : '*'}</label>
            <textarea id="message" className="input" rows={5} value={f.message} maxLength={LIMITS.message} onChange={(e) => set('message', e.target.value)} {...field('message')} />
            {errors.message && <span id="message-err" className="error">{errors.message}</span>}
          </div>
          <div aria-hidden style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
            <label htmlFor="website">Leave this field empty</label>
            <input id="website" tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => set('website', e.target.value)} />
          </div>
          <label className="check"><input type="checkbox" checked={f.includePlan} onChange={(e) => set('includePlan', e.target.checked)} /> Attach my current plan ({draft.name})</label>
          <label className="check"><input id="consent" type="checkbox" checked={f.consent} onChange={(e) => set('consent', e.target.checked)} aria-invalid={!!errors.consent} aria-describedby={errors.consent ? 'consent-err' : undefined} /> I agree that {COMPANY.name} may use these details to respond to my enquiry. *</label>
          {errors.consent && <span id="consent-err" className="error">{errors.consent}</span>}
          <button className="btn btn-primary" type="submit" disabled={status === 'sending'}>{status === 'sending' ? 'Sending…' : 'Request a quote'}</button>
          <p id="form-note" className="tiny muted" style={{ margin: 0 }}>* Required. This is an enquiry, not a booking. {ENV.quoteEndpoint ? '' : 'Submissions currently stay on this device.'} {PUBLIC_KEY ? '🔒 Your details are encrypted in your browser (RSA-OAEP + AES-256-GCM) before they leave this page.' : ''}</p>
        </form>
      </div>
    </main>
  );
}
