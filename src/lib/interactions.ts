import { audio } from './audio';

/**
 * One coordinated interaction layer, installed once:
 * - soft click ripples on buttons
 * - magnetic pull on [data-magnetic] (fine pointers only)
 * - gentle 3D tilt on [data-tilt]
 * - liquid-glass highlight that follows the pointer on .glass
 * Respects reduced motion: when <html data-motion="reduced">, only the ripple remains (as a fade).
 */
const LIQUID = '.btn, .chip, .segmented button, .tabs button, .card, .spot-card, .top-card, .mode-card, select.input, .pack-head';

/**
 * Cursor-reactive parallax: eased --px / --py (-0.5…0.5) on <html>, read by CSS to shift
 * destination photos and background layers. Fine pointers only; paused for reduced motion.
 */
function installParallax(reduced: () => boolean) {
  const root = document.documentElement;
  let tx = 0, ty = 0, x = 0, y = 0, raf = 0;
  const tick = () => {
    raf = 0;
    if (reduced()) { x = y = 0; } else { x += (tx - x) * 0.07; y += (ty - y) * 0.07; }
    root.style.setProperty('--px', x.toFixed(4));
    root.style.setProperty('--py', y.toFixed(4));
    if (Math.abs(tx - x) > 0.0005 || Math.abs(ty - y) > 0.0005) raf = requestAnimationFrame(tick);
  };
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
    tx = e.clientX / innerWidth - 0.5; ty = e.clientY / innerHeight - 0.5;
    if (!raf) raf = requestAnimationFrame(tick);
  }, { passive: true });
  document.addEventListener('pointerleave', () => { tx = ty = 0; if (!raf) raf = requestAnimationFrame(tick); });
}

export function installInteractions() {
  const fine = window.matchMedia('(pointer: fine)').matches;
  const reduced = () => document.documentElement.dataset.motion === 'reduced';

  document.addEventListener('pointerdown', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('.btn, [data-ripple]');
    if (!el || el.hasAttribute('disabled')) return;
    audio.click();
    const r = el.getBoundingClientRect();
    const s = document.createElement('span');
    s.className = 'ripple';
    const size = Math.max(r.width, r.height) * 1.6;
    s.style.width = s.style.height = `${size}px`;
    s.style.left = `${e.clientX - r.left - size / 2}px`;
    s.style.top = `${e.clientY - r.top - size / 2}px`;
    el.appendChild(s);
    setTimeout(() => s.remove(), 650);
  });

  if (!fine) return;
  installParallax(reduced);

  let raf = 0;
  document.addEventListener('pointermove', (e) => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const target = e.target as HTMLElement;
      // Liquid-glass sheen: the light spot follows the pointer on glass panels and every control.
      for (const sel of ['.glass', LIQUID]) {
        const el = target.closest<HTMLElement>(sel);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
        el.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
      }
      if (reduced()) return;
      const mag = target.closest<HTMLElement>('[data-magnetic]');
      document.querySelectorAll<HTMLElement>('[data-magnetic].is-pulled').forEach((m) => {
        if (m !== mag) { m.style.transform = ''; m.classList.remove('is-pulled'); }
      });
      if (mag) {
        const r = mag.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        mag.style.transform = `translate(${dx * 0.18}px, ${dy * 0.25}px)`;
        mag.classList.add('is-pulled');
      }
      const tilt = target.closest<HTMLElement>('[data-tilt]');
      document.querySelectorAll<HTMLElement>('[data-tilt].is-tilted').forEach((t) => {
        if (t !== tilt) { t.style.transform = ''; t.classList.remove('is-tilted'); }
      });
      if (tilt) {
        const r = tilt.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        tilt.style.transform = `perspective(900px) rotateX(${(-py * 6).toFixed(2)}deg) rotateY(${(px * 8).toFixed(2)}deg) translateZ(0)`;
        tilt.classList.add('is-tilted');
      }
    });
  });
  document.addEventListener('pointerleave', () => {
    document.querySelectorAll<HTMLElement>('.is-pulled, .is-tilted').forEach((m) => {
      m.style.transform = '';
      m.classList.remove('is-pulled', 'is-tilted');
    });
  });
}

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

/** Rough device capability tier used for adaptive rendering. */
export function deviceTier(): 'low' | 'medium' | 'high' {
  const mem = (navigator as any).deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency ?? 4;
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  if (mem <= 2 || cores <= 2) return 'low';
  if (mobile || mem <= 4 || cores <= 4) return 'medium';
  return 'high';
}
