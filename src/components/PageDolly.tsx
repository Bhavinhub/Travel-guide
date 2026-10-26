import { useEffect, useRef } from 'react';
import { localImages, srcOf } from '../lib/localMedia';
import { useMotion } from '../lib/store';

/**
 * Scroll-controlled 3D camera dolly behind every page.
 * Real photographs stand one behind another in CSS 3D space. Scrolling down moves the
 * camera forward through them (each photo grows, then dissolves into the next scene);
 * scrolling up reverses the move. The cursor gently swings the camera. GPU-composited
 * transforms only — no WebGL needed — so it runs smoothly on every page and phone.
 */
const DEPTH = 900; // px between photo planes
const PERSPECTIVE = 1000;

export function PageDolly({ ids }: { ids: string[] }) {
  const imgs = ids.map((id) => localImages(id)[0]).filter(Boolean).slice(0, 5);
  const world = useRef<HTMLDivElement>(null);
  const layers = useRef<(HTMLDivElement | null)[]>([]);
  const { reduced } = useMotion();
  const n = imgs.length;

  useEffect(() => {
    if (!n) return;
    let raf = 0, cur = 0, target = 0, mx = 0, my = 0, cmx = 0, cmy = 0;
    const read = () => {
      const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
      target = Math.min(1, scrollY / max) * (n - 1);
    };
    const frame = () => {
      raf = 0;
      // Eased follow so the dolly glides rather than jumps.
      cur += (target - cur) * (reduced ? 1 : 0.09);
      cmx += (mx - cmx) * 0.06; cmy += (my - cmy) * 0.06;
      if (world.current) world.current.style.transform = `translateZ(${cur * DEPTH}px) rotateY(${cmx * 2.5}deg) rotateX(${-cmy * 1.8}deg)`;
      layers.current.forEach((el, i) => {
        if (!el) return;
        const d = i - cur; // >0 ahead of the camera, <0 passed
        // The photo in front stays solid; as the camera passes through it, it dissolves into the next one.
        const o = d < -0.35 ? 0 : d < 0 ? 1 + d / 0.35 : d < 1 ? 1 : Math.max(0, 1 - (d - 1) * 2);
        el.style.opacity = o.toFixed(3);
        el.style.visibility = o < 0.01 ? 'hidden' : 'visible';
      });
      if (!reduced && (Math.abs(target - cur) > 0.0005 || Math.abs(mx - cmx) > 0.001 || Math.abs(my - cmy) > 0.001)) raf = requestAnimationFrame(frame);
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
    const onScroll = () => { read(); kick(); };
    const onMove = (e: PointerEvent) => { if (reduced) return; mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; kick(); };
    read(); cur = target; frame();
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
    addEventListener('pointermove', onMove, { passive: true });
    // Page height changes as lazy content loads.
    const ro = new ResizeObserver(onScroll);
    ro.observe(document.body);
    return () => { cancelAnimationFrame(raf); removeEventListener('scroll', onScroll); removeEventListener('resize', onScroll); removeEventListener('pointermove', onMove); ro.disconnect(); };
  }, [n, reduced, ids.join()]);

  if (!n) return null;
  return (
    <div className="page-dolly" aria-hidden>
      <div className="pd-camera" style={{ perspective: `${PERSPECTIVE}px` }}>
        <div ref={world} className="pd-world">
          {imgs.map((im, i) => (
            <div key={im.sizes['960'] ?? i} ref={(el) => { layers.current[i] = el; }} className="pd-layer"
              // Each plane is pre-scaled so it exactly fills the screen when the camera is parked in front of it.
              style={{ transform: `translateZ(${-i * DEPTH}px) scale(${(PERSPECTIVE + i * DEPTH) / PERSPECTIVE})`, zIndex: n - i }}>
              <img src={srcOf(im, 'large')} alt="" decoding="async" loading={i < 2 ? 'eager' : 'lazy'} />
            </div>
          ))}
        </div>
      </div>
      <div className="pd-shade" />
    </div>
  );
}
