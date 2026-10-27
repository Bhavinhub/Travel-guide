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
/** Where each floating world photo sits around the centre (angle) and how far along the flight path. */
const FIELD_SPOTS = Array.from({ length: 18 }, (_, k) => ({ a: k * 2.39996 + 0.4, phase: (k * 0.618034) % 1, r: 0.9 + ((k * 7) % 5) * 0.12 }));

/**
 * `field`: photos that float in 3D around the scene and fly past the camera as you scroll (home page).
 * `hero`: the first photo starts further back — whole and framed like a print in space — and the
 * camera pushes in until it fills the screen.
 */
export function PageDolly({ ids = [], photos, source, field = [], hero = false, heroBackdrop }: { ids?: string[]; photos?: BackdropPhoto[]; source?: { progress: number }; field?: string[]; hero?: boolean; heroBackdrop?: string }) {
  const local = ids.map((id) => localImages(id)[0]).filter(Boolean).map((im) => ({ src: srcOf(im!, 'large')!, srcSet: srcSet(im!), fill: srcOf(im!, 'card'), key: im!.sizes['960'] ?? im!.file }));
  const imgs = (photos?.length ? photos.map((p) => ({ ...p, key: p.src })) : local).filter((x, i, a) => !!source || a.findIndex((y) => y.key === x.key) === i).slice(0, source ? 40 : 8); // keep order intact when a page drives the camera
  const camera = useRef<HTMLDivElement>(null);
  const layers = useRef<(HTMLDivElement | null)[]>([]);
  const mains = useRef<(HTMLImageElement | null)[]>([]);
  const cards = useRef<(HTMLDivElement | null)[]>([]);
  const heroBg = useRef<HTMLDivElement>(null);
  const heroBgImg = heroBackdrop ? localImages(heroBackdrop)[0] : undefined;
  const fieldImgs = field.map((id) => localImages(id)[0]).filter(Boolean).slice(0, FIELD_SPOTS.length).map((im) => ({ src: srcOf(im!, 'card')!, key: im!.file }));
  const { reduced } = useMotion();
  const n = imgs.length;
  const key = imgs.map((i) => i.key).join() + fieldImgs.length;

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
      const vw = innerWidth, vh = innerHeight;
      // A full photograph fills the space around the floating hero; the next scene covers it as the camera pushes in.
      if (heroBg.current) {
        const show = cur < 1;
        heroBg.current.style.display = show ? '' : 'none';
        if (show) heroBg.current.style.transform = `scale(${(1.04 + cur * 0.12).toFixed(4)}) translate3d(${(-cmx * 14).toFixed(1)}px, ${(-cmy * 10).toFixed(1)}px, 0)`;
      }
      // Floating world photos: each sits somewhere on a long flight path; scrolling flies the camera
      // forward through them (they grow and spread outwards as they pass), scrolling up flies back.
      cards.current.forEach((el, k) => {
        if (!el) return;
        const spot = FIELD_SPOTS[k];
        const d = (((spot.phase - cur * 0.42) % 1) + 1) % 1; // 0 = at the camera, 1 = far away
        const dist = 0.12 + d * 1.25, sc = 0.32 / dist;
        const fadeIn = Math.min(1, (1 - d) / 0.18), fadeOut = Math.min(1, Math.max(0, (dist - 0.2) / 0.22));
        const heroCalm = hero && cur < 0.25 ? 0.55 + cur * 1.8 : 1; // a quieter field while the hero is whole
        const o = Math.max(0, Math.min(1, fadeIn * fadeOut * heroCalm));
        el.style.opacity = o.toFixed(3);
        el.style.display = o < 0.01 ? 'none' : '';
        if (o >= 0.01) {
          const R = Math.min(vw, vh) * 0.62 * spot.r * sc;
          const x = Math.cos(spot.a) * R * (vw / Math.min(vw, vh)) * 0.8 - cmx * 70 * sc, y = Math.sin(spot.a) * R * 0.75 - cmy * 50 * sc;
          el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${sc.toFixed(4)}) rotate(${(Math.cos(spot.a * 3) * 4).toFixed(2)}deg)`;
          el.style.zIndex = String(3 + Math.round(sc * 10));
        }
      });
      layers.current.forEach((el, i) => {
        if (!el) return;
        let o = 0, s = 1, z = 0;
        if (i === i0) { o = 1 - smooth(Math.max(0, (f - 0.68) / 0.32)); s = 1 + Math.max(0, f - 0.6) * ZOOM * 0.5; z = f; } // slow zoom across the whole stretch, gentle dissolve at the end
        else if (i === i0 + 1) { o = hero && i0 === 0 ? smooth(Math.max(0, Math.min(1, (f - 0.3) / 0.4))) : 1; } // the next scene waits behind (after the hero: it appears as the camera pushes in)
        // At rest the photo shows at its widest framing; scrolling zooms the camera in towards the next
        // scene, and scrolling back pulls out again.
        const img = mains.current[i];
        if (img && hero && i === 0) {
          // The hero starts further back — the whole photo, framed in space — and the camera pushes in
          // until it fills the screen, then on towards the next scene.
          const w = img.offsetWidth || 1, h = img.offsetHeight || 1;
          const cover = Math.max(vw / w, vh / h) * 1.04;
          img.style.transform = `scale(${(0.86 + (cover * 1.18 - 0.86) * smooth(Math.min(1, z / 0.85))).toFixed(4)})`;
        } else if (img) {
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
        {heroBgImg && (
          <div ref={heroBg} className="pd-herobg">
            <img src={srcOf(heroBgImg, 'large')} srcSet={srcSet(heroBgImg)} sizes="100vw" alt="" decoding="async" referrerPolicy="no-referrer" />
          </div>
        )}
        {imgs.map((im, i) => (
          <div key={`${i}-${im.key}`} ref={(el) => { layers.current[i] = el; }} className={`pd-layer${hero && i === 0 ? ' pd-hero' : ''}`} style={i > 1 ? { display: 'none' } : undefined}>
            <div className="pd-breathe">
              {/* small copy shown instantly (never a dark screen while the 4K photo loads) */}
              <img className="pd-fill" src={im.fill ?? im.src} alt="" decoding="async" loading={i < 2 ? 'eager' : 'lazy'} referrerPolicy="no-referrer" />
              <img className="pd-main" src={im.src} srcSet={im.srcSet} sizes="100vw" alt="" decoding="async" loading={i < 2 ? 'eager' : 'lazy'} referrerPolicy="no-referrer"
                onLoad={(e) => { e.currentTarget.classList.add('is-loaded'); window.dispatchEvent(new Event('scroll')); }}
                ref={(img) => { mains.current[i] = img; if (img?.complete && img.naturalWidth) img.classList.add('is-loaded'); }} />
            </div>
          </div>
        ))}
        {fieldImgs.map((c, k) => (
          <div key={c.key} ref={(el) => { cards.current[k] = el; }} className="pd-card" style={{ display: 'none' }}>
            <img src={c.src} alt="" decoding="async" loading="lazy" referrerPolicy="no-referrer" />
          </div>
        ))}
      </div>
      <div className="pd-shade" />
    </div>
  );
}
