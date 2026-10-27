import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { localImages, srcOf, srcSet } from '../lib/localMedia';
import { useMotion } from '../lib/store';

/**
 * Scroll-controlled 3D camera dolly behind every page.
 * Real photographs sit one behind another. Scrolling down pushes the camera into the current
 * photo (it grows towards you) while the next one emerges from behind it; scrolling up
 * reverses the move. The cursor swings the camera slightly in 3D.
 *
 * Kept light on purpose: photos are shown at close to their native size (sharp, never blown up),
 * only the two photos involved in the current transition are rendered, and every change is a
 * GPU-composited transform/opacity — no layout, no repaint, no blur over the moving image.
 */
const ZOOM = 0.3;
const smooth = (t: number) => t * t * (3 - 2 * t);

export interface BackdropPhoto { src: string; srcSet?: string; fill?: string }
/** Pages whose photos come from live sources (e.g. a searched place) publish them here. */
export const useBackdrop = create<{ photos: BackdropPhoto[] }>(() => ({ photos: [] }));
export const setBackdrop = (photos: BackdropPhoto[]) => useBackdrop.setState({ photos });
 // how far the camera pushes into a photo before it hands over to the next

/** `source` lets a page drive the camera itself (e.g. the home page's chapter progress, 0…n-1). */
export function PageDolly({ ids = [], photos, source }: { ids?: string[]; photos?: BackdropPhoto[]; source?: { progress: number } }) {
  const local = ids.map((id) => localImages(id)[0]).filter(Boolean).map((im) => ({ src: srcOf(im!, 'large')!, srcSet: srcSet(im!), fill: srcOf(im!, 'card'), key: im!.sizes['960'] ?? im!.file }));
  const imgs = (photos?.length ? photos.map((p) => ({ ...p, key: p.src })) : local).filter((x, i, a) => !!source || a.findIndex((y) => y.key === x.key) === i).slice(0, source ? 40 : 8); // keep order intact when a page drives the camera
  const camera = useRef<HTMLDivElement>(null);
  const layers = useRef<(HTMLDivElement | null)[]>([]);
  const mains = useRef<(HTMLImageElement | null)[]>([]);
  const { reduced } = useMotion();
  const n = imgs.length;
  const key = imgs.map((i) => i.key).join();

  useEffect(() => {
    if (!n) return;
    const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
    let raf = 0, cur = 0, target = 0, mx = 0, my = 0, cmx = 0, cmy = 0, lastT = performance.now();
    const read = () => {
      if (source) { target = Math.min(n - 1, Math.max(0, source.progress)); return; }
      const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
      target = Math.min(1, Math.max(0, scrollY / max)) * (n - 1);
    };
    const frame = () => {
      raf = 0;
      if (source) read();
      const now = performance.now(), dt = Math.min(0.05, (now - lastT) / 1000 || 0.016);
      lastT = now;
      cur += (target - cur) * (reduced ? 1 : 1 - Math.exp(-dt * 2.4)); // slow, soft camera glide
      if (Math.abs(target - cur) < 0.0005) cur = target;
      cmx += (mx - cmx) * 0.07; cmy += (my - cmy) * 0.07;
      if (camera.current) camera.current.style.transform = `perspective(1100px) rotateY(${(cmx * 6).toFixed(3)}deg) rotateX(${(-cmy * 4).toFixed(3)}deg) translate3d(${(-cmx * 26).toFixed(1)}px, ${(-cmy * 18).toFixed(1)}px, 0)`;
      const i0 = Math.floor(cur), f = cur - i0;
      layers.current.forEach((el, i) => {
        if (!el) return;
        let o = 0, s = 1, z = 0;
        if (i === i0) { o = 1 - smooth(Math.max(0, (f - 0.68) / 0.32)); s = 1 + Math.max(0, f - 0.6) * ZOOM * 0.5; z = f; } // slow zoom across the whole stretch, gentle dissolve at the end
        else if (i === i0 + 1) { o = 1; } // the next scene waits behind, whole and fully visible
        // At rest the photo shows at its widest framing; scrolling zooms the camera in towards the next
        // scene, and scrolling back pulls out again.
        const img = mains.current[i];
        if (img) {
          const k = z; // linear: the zoom keeps moving steadily with the scroll
          img.style.transform = `scale(${(1 + 0.24 * k).toFixed(4)})`; // widest framing at rest → in towards the next scene
        }
        const drift = i === i0 ? f : i === i0 + 1 ? f - 1 : 0; // a gentle cinematic drift between scenes
        const show = o > 0.001;
        el.style.display = show ? '' : 'none';
        if (show) { el.style.opacity = o.toFixed(3); el.style.transform = `translate3d(${(drift * -18).toFixed(1)}px, ${(drift * -10).toFixed(1)}px, 0) rotate(${(drift * 0.6).toFixed(3)}deg) scale(${s.toFixed(4)})`; el.style.zIndex = String(i === i0 ? 2 : 1); }
      });
      const settled = cur === target && (!source || Math.abs(source.progress - cur) < 0.0005) && Math.abs(mx - cmx) < 0.001 && Math.abs(my - cmy) < 0.001;
      if (!reduced && !settled) raf = requestAnimationFrame(frame);
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
    // With an external source (the home page's chapters), that page updates its progress in its own
    // frame after the scroll — look again one frame later so the camera never stops on stale progress.
    const onScroll = () => { read(); kick(); if (source) requestAnimationFrame(() => requestAnimationFrame(() => { read(); kick(); })); };
    const onMove = (e: PointerEvent) => {
      if (reduced || !fine || e.pointerType !== 'mouse') return;
      mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; kick();
    };
    read(); cur = target; frame();
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
    addEventListener('pointermove', onMove, { passive: true });
    // Page height changes as lazy content loads — re-read, but at most once per frame.
    const ro = new ResizeObserver(onScroll);
    ro.observe(document.body);
    return () => { cancelAnimationFrame(raf); removeEventListener('scroll', onScroll); removeEventListener('resize', onScroll); removeEventListener('pointermove', onMove); ro.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, reduced, key]);

  if (!n) return null;
  return (
    <div className="page-dolly" aria-hidden>
      <div ref={camera} className="pd-camera">
        {imgs.map((im, i) => (
          <div key={`${i}-${im.key}`} ref={(el) => { layers.current[i] = el; }} className="pd-layer" style={i > 1 ? { display: 'none' } : undefined}>
            <div className="pd-breathe">
              {/* small copy shown instantly (never a dark screen while the 4K photo loads) */}
              <img className="pd-fill" src={im.fill ?? im.src} alt="" decoding="async" loading={i < 2 ? 'eager' : 'lazy'} referrerPolicy="no-referrer" />
              <img className="pd-main" src={im.src} srcSet={im.srcSet} sizes="100vw" alt="" decoding="async" loading={i < 2 ? 'eager' : 'lazy'} referrerPolicy="no-referrer"
                onLoad={(e) => { e.currentTarget.classList.add('is-loaded'); window.dispatchEvent(new Event('scroll')); }}
                ref={(img) => { mains.current[i] = img; if (img?.complete && img.naturalWidth) img.classList.add('is-loaded'); }} />
            </div>
          </div>
        ))}
      </div>
      <div className="pd-shade" />
    </div>
  );
}
