import { useEffect, useRef } from 'react';
import { useMotion } from '../lib/store';

/**
 * Site-wide cursor effects (mouse and pen only — never on touch, off for reduced motion):
 * - Cursor follow: a small ring follows the pointer with eased lag; over links it turns gold.
 *   Over photos (as in the reference): one watery white lens follows the pointer, inverting the
 *   colours beneath it and stretching slightly as it moves.
 * - Dust trail: rough, grainy specks of light scatter behind the cursor, drift and fade (no lines).
 * - Ripple: a soft ring spreads from every click.
 * The canvas draws only while something is moving, so an idle cursor costs nothing.
 */
export function CursorFX() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const dot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const lens = useRef<HTMLDivElement>(null);
  const { reduced } = useMotion();

  useEffect(() => {
    const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (reduced || !fine) return;
    const c = canvas.current!, ctx = c.getContext('2d')!;
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    const resize = () => { c.width = innerWidth * dpr; c.height = innerHeight * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    resize();
    document.documentElement.classList.add('has-cursor-fx');
    let dark = document.documentElement.dataset.theme !== 'light';
    let x = innerWidth / 2, y = innerHeight / 2, rx = x, ry = y, lx = x, ly = y, raf = 0, hover = '', shown = false;
    // Dust: each speck has its own drift, size, hue and lifespan, so the trail looks rough and natural.
    const pts: { x: number; y: number; vx: number; vy: number; r: number; hue: number; life: number; decay: number }[] = [];
    const ripples: { x: number; y: number; r: number; life: number }[] = [];

    const frame = () => {
      raf = 0;
      rx += (x - rx) * 0.2; ry += (y - ry) * 0.2;
      lx += (x - lx) * 0.16; ly += (y - ly) * 0.16; // one circle that follows smoothly
      if (ring.current) ring.current.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
      if (lens.current) {
        const stretch = Math.min(0.18, Math.hypot(x - lx, y - ly) / 400); // squashes a little when moving fast
        const ang = Math.atan2(y - ly, x - lx);
        lens.current.style.transform = `translate3d(${lx}px, ${ly}px, 0) rotate(${ang}rad) scale(${1 + stretch}, ${1 - stretch * 0.6})`;
      }
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      dark = document.documentElement.dataset.theme !== 'light'; // follows the Sun / Moon switch
      // Rough dust: scattered specks, no connecting lines.
      for (const p of pts) { p.x += p.vx; p.y += p.vy; p.vx *= 0.96; p.vy = p.vy * 0.96 + 0.02; p.life -= p.decay; }
      while (pts.length && pts[0].life <= 0) pts.shift();
      for (const p of pts) {
        if (p.life <= 0) continue;
        const a = p.life * p.life;
        ctx.fillStyle = `hsla(${p.hue}, 90%, ${dark ? 72 : 42}%, ${a * 0.9})`;
        ctx.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r); // square grains read as rough dust
        if (p.r > 1.8) { ctx.fillStyle = `hsla(${p.hue}, 95%, ${dark ? 80 : 50}%, ${a * 0.25})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 1.8, 0, Math.PI * 2); ctx.fill(); }
      }
      for (const r of ripples) {
        r.r += 3.2; r.life -= 0.03;
        ctx.strokeStyle = `rgba(244, 200, 120, ${Math.max(0, r.life) * 0.8})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.stroke();
      }
      while (ripples.length && ripples[0].life <= 0) ripples.shift();
      const moving = Math.abs(x - rx) > 0.3 || Math.abs(y - ry) > 0.3 || Math.abs(x - lx) > 0.3 || Math.abs(y - ly) > 0.3 || pts.length > 0 || ripples.length > 0;
      if (moving) raf = requestAnimationFrame(frame);
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
      x = e.clientX; y = e.clientY;
      if (!shown) { shown = true; rx = x; ry = y; document.documentElement.classList.add('cursor-fx-on'); }
      if (dot.current) dot.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      // A few specks per move, more when moving fast.
      const speed = Math.min(30, Math.hypot(e.movementX || 0, e.movementY || 0));
      const count = 1 + Math.round(speed / 8);
      for (let k = 0; k < count; k++) {
        const ang = Math.random() * Math.PI * 2, sp = 0.2 + Math.random() * 1.1;
        pts.push({ x: x + (Math.random() - 0.5) * 10, y: y + (Math.random() - 0.5) * 10, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 0.2, r: 0.8 + Math.random() * 2.6, hue: 32 + Math.random() * 30, life: 1, decay: 0.018 + Math.random() * 0.03 });
      }
      if (pts.length > 160) pts.splice(0, pts.length - 160);
      // Over a photo: the colour-inverting disc. Over links/buttons: a gold ring. Elsewhere: a small ring.
      const t = e.target as Element | null;
      // The 3D map keeps a plain small ring: an inverting lens over a live map just hides what you're looking at.
      const next = t?.closest?.('.mapfly-map') ? ''
        : t?.closest?.('img, video, .pg-item, .top-photo, .media, .hero-fit, .zoom-loop') ? 'img'
        : t?.closest?.('a, button, [role="button"], input, select, textarea, label') ? 'link' : '';
      if (next !== hover) {
        hover = next;
        ring.current?.classList.toggle('is-img', next === 'img');
        ring.current?.classList.toggle('is-hot', next === 'link');
        dot.current?.classList.toggle('is-img', next === 'img');
        lens.current?.classList.toggle('is-img', next === 'img');
      }
      kick();
    };
    const onDown = (e: PointerEvent) => { if (e.pointerType === 'mouse' || e.pointerType === 'pen') { ripples.push({ x: e.clientX, y: e.clientY, r: 6, life: 1 }); kick(); } };
    const onLeave = () => { shown = false; document.documentElement.classList.remove('cursor-fx-on'); };
    addEventListener('pointermove', onMove, { passive: true });
    addEventListener('pointerdown', onDown, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('pointermove', onMove); removeEventListener('pointerdown', onDown);
      document.removeEventListener('pointerleave', onLeave); removeEventListener('resize', resize);
      document.documentElement.classList.remove('has-cursor-fx', 'cursor-fx-on');
    };
  }, [reduced]);

  return (
    <div className="cursor-fx" aria-hidden>
      <canvas ref={canvas} className="cfx-trail" />
      <div ref={lens} className="cfx-lens" />
      <div ref={ring} className="cfx-ring" />
      <div ref={dot} className="cfx-dot" />
    </div>
  );
}
