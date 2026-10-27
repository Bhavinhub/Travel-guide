import { useEffect, useRef } from 'react';
import { useMotion } from '../lib/store';

/**
 * Site-wide cursor effects (mouse and pen only — never on touch, off for reduced motion):
 * - Cursor follow: a bright dot sits on the pointer while a glass ring follows it with eased
 *   lag, growing over links and buttons.
 * - Liquid trail: a glowing ribbon of light streams behind the cursor and fades out.
 * - Ripple: a soft ring spreads from every click.
 * The canvas draws only while something is moving, so an idle cursor costs nothing.
 */
export function CursorFX() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const dot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const { reduced } = useMotion();

  useEffect(() => {
    const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (reduced || !fine) return;
    const c = canvas.current!, ctx = c.getContext('2d')!;
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    const resize = () => { c.width = innerWidth * dpr; c.height = innerHeight * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    resize();
    document.documentElement.classList.add('has-cursor-fx');
    let x = innerWidth / 2, y = innerHeight / 2, rx = x, ry = y, raf = 0, hot = false, shown = false;
    const pts: { x: number; y: number; life: number }[] = [];
    const ripples: { x: number; y: number; r: number; life: number }[] = [];

    const frame = () => {
      raf = 0;
      rx += (x - rx) * 0.16; ry += (y - ry) * 0.16;
      if (ring.current) ring.current.style.transform = `translate3d(${rx}px, ${ry}px, 0) scale(${hot ? 1.7 : 1})`;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      // Liquid ribbon: smooth curve through recent points, thinning and fading towards the tail.
      for (const p of pts) p.life -= 0.035;
      while (pts.length && pts[0].life <= 0) pts.shift();
      if (pts.length > 2) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        for (let i = 1; i < pts.length - 1; i++) {
          const a = pts[i - 1], b = pts[i], n = pts[i + 1];
          const t = i / pts.length;
          ctx.strokeStyle = `hsla(${38 + t * 150}, 95%, 66%, ${b.life * 0.5})`;
          ctx.lineWidth = 2 + t * 9 * b.life;
          ctx.shadowColor = `hsla(${38 + t * 150}, 95%, 60%, .8)`;
          ctx.shadowBlur = 14;
          ctx.beginPath();
          ctx.moveTo((a.x + b.x) / 2, (a.y + b.y) / 2);
          ctx.quadraticCurveTo(b.x, b.y, (b.x + n.x) / 2, (b.y + n.y) / 2);
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
        ctx.globalCompositeOperation = 'source-over';
      }
      for (const r of ripples) {
        r.r += 3.2; r.life -= 0.03;
        ctx.strokeStyle = `rgba(244, 200, 120, ${Math.max(0, r.life) * 0.8})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.stroke();
      }
      while (ripples.length && ripples[0].life <= 0) ripples.shift();
      const moving = Math.abs(x - rx) > 0.3 || Math.abs(y - ry) > 0.3 || pts.length > 0 || ripples.length > 0;
      if (moving) raf = requestAnimationFrame(frame);
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
      x = e.clientX; y = e.clientY;
      if (!shown) { shown = true; rx = x; ry = y; document.documentElement.classList.add('cursor-fx-on'); }
      if (dot.current) dot.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      pts.push({ x, y, life: 1 });
      if (pts.length > 28) pts.shift();
      const h = !!(e.target as Element | null)?.closest?.('a, button, [role="button"], input, select, textarea, label, .card, .spot-card');
      if (h !== hot) { hot = h; ring.current?.classList.toggle('is-hot', h); }
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
      <div ref={ring} className="cfx-ring" />
      <div ref={dot} className="cfx-dot" />
    </div>
  );
}
