import { useEffect, useRef } from 'react';
import { useMotion } from '../lib/store';

/**
 * A transparent round cursor that glides after the normal pointer (mouse and pen only, never on touch).
 * Over links and buttons it becomes a gold ring; over photos it opens into a wider clear lens while the
 * liquid trail (LiquidHover) warps the image. It draws only while it moves.
 */
export function CursorRing() {
  const ring = useRef<HTMLDivElement>(null);
  const { reduced } = useMotion();
  useEffect(() => {
    if (reduced || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const el = ring.current!;
    let x = -100, y = -100, rx = x, ry = y, raf = 0, mode = '';
    const frame = () => {
      raf = 0;
      rx += (x - rx) * 0.22; ry += (y - ry) * 0.22;
      el.style.transform = `translate3d(${rx.toFixed(1)}px, ${ry.toFixed(1)}px, 0)`;
      if (Math.abs(x - rx) > 0.2 || Math.abs(y - ry) > 0.2) raf = requestAnimationFrame(frame);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      if (x < -50) { rx = e.clientX; ry = e.clientY; }
      x = e.clientX; y = e.clientY;
      el.classList.add('is-on');
      const t = e.target as Element | null;
      const next = t?.closest?.('.mapfly-map') ? '' : t?.closest?.('img, .top-photo, .ring-card, .portal, .pg-item, .moment') ? 'photo'
        : t?.closest?.('a, button, [role="button"], input, select, textarea, label, summary') ? 'link' : '';
      if (next !== mode) { mode = next; el.dataset.mode = next; }
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const onLeave = () => el.classList.remove('is-on');
    const onDown = () => el.classList.add('is-press');
    const onUp = () => el.classList.remove('is-press');
    addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    addEventListener('pointerdown', onDown, { passive: true });
    addEventListener('pointerup', onUp, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('pointermove', onMove); document.removeEventListener('pointerleave', onLeave);
      removeEventListener('pointerdown', onDown); removeEventListener('pointerup', onUp);
    };
  }, [reduced]);
  return <div ref={ring} className="cursor-ring" aria-hidden />;
}
