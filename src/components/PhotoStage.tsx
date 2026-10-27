import { useEffect, useRef, useState } from 'react';
import type { Destination } from '../data/types';
import { creditLine, fileLabel, localImages, srcOf, srcSet, type LocalImage } from '../lib/localMedia';
import { useMedia } from '../lib/media';

/**
 * Real-photograph 3D stage.
 * - Full-bleed 4K photos (or real video loops) per chapter, cross-fading as you scroll.
 * - The whole stage tilts in 3D toward the cursor; layers parallax at different depths.
 * - Floating depth cards (also real photos) orbit gently in a never-ending loop.
 * All motion stops when motion is paused / reduced.
 */
export interface StageChapter {
  id: string;
  media: string; // local media id
  fallbackWiki?: string;
  accent: string;
  /** Vertical focal point 0 (top) … 1 (bottom), for tall photos. */
  focusY?: number;
  depth: { media: string; index?: number; label: string }[];
  video?: { src: string; poster?: string; credit: string; source: string };
}

/** Shared pointer + scroll state, smoothed every frame and exposed as CSS variables. */
export function usePointerDepth(enabled: boolean) {
  useEffect(() => {
    const root = document.documentElement;
    let tx = 0, ty = 0, x = 0, y = 0, sv = 0, lastY = scrollY, raf = 0;
    const onMove = (e: PointerEvent) => {
      tx = (e.clientX / innerWidth) * 2 - 1;
      ty = (e.clientY / innerHeight) * 2 - 1;
      root.style.setProperty('--cx', `${e.clientX}px`);
      root.style.setProperty('--cy', `${e.clientY}px`);
      root.style.setProperty('--hue', `${Math.round(((e.clientX / innerWidth) * 220 + scrollY * 0.05) % 360)}`);
    };
    const tick = () => {
      x += (tx - x) * 0.06;
      y += (ty - y) * 0.06;
      const v = scrollY - lastY;
      lastY = scrollY;
      sv += (Math.max(-60, Math.min(60, v)) - sv) * 0.1;
      root.style.setProperty('--mx', x.toFixed(4));
      root.style.setProperty('--my', y.toFixed(4));
      root.style.setProperty('--sv', sv.toFixed(3));
      raf = requestAnimationFrame(tick);
    };
    if (enabled) {
      addEventListener('pointermove', onMove, { passive: true });
      raf = requestAnimationFrame(tick);
    } else {
      ['--mx', '--my', '--sv'].forEach((k) => root.style.setProperty(k, '0'));
    }
    return () => {
      removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
    };
  }, [enabled]);
}

function Layer({ ch, on, out, near, motion }: { ch: StageChapter; on: boolean; out: boolean; near: boolean; motion: boolean }) {
  const img = localImages(ch.media)[0];
  const remote = useMedia(!img && ch.fallbackWiki ? ch.fallbackWiki : undefined, 1);
  const src = img ? srcOf(img, 'hero') : remote.lead?.srcLarge;
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (on && motion) v.play().catch(() => undefined);
    else v.pause();
  }, [on, motion]);
  return (
    <div className={`stage-layer ${on ? 'on' : ''} ${out ? 'out' : ''}`} aria-hidden>
      <div className="stage-photo">
        {near && ch.video ? (
          <video ref={videoRef} muted loop playsInline preload="metadata" poster={src}>
            <source src={ch.video.src} type="video/webm" />
          </video>
        ) : (
          src && (
            <>
              {/* 2.5D depth: the full photo is the far plane; a masked copy of the lower half is the
                  near plane and moves further with the cursor, so ground and sky separate in depth. */}
              <img className="depth-far" style={{ objectPosition: `50% ${(ch.focusY ?? 0.5) * 100}%` }} src={src} srcSet={img ? srcSet(img) : undefined} sizes="100vw" alt="" decoding="async" />
              <img className="depth-near" style={{ objectPosition: `50% ${(ch.focusY ?? 0.5) * 100}%` }} src={src} srcSet={img ? srcSet(img) : undefined} sizes="100vw" alt="" decoding="async" />
            </>
          )
        )}
      </div>
    </div>
  );
}

function DepthCard({ img, label, i, on }: { img?: LocalImage; label: string; i: number; on: boolean }) {
  if (!img) return null;
  return (
    <figure className={`depth-card d${i} ${on ? 'on' : ''}`} aria-hidden>
      <img src={srcOf(img, 'card')} alt="" loading="lazy" />
      <figcaption>{label}</figcaption>
    </figure>
  );
}

export function PhotoStage({ chapters, active, motion }: { chapters: StageChapter[]; active: number; motion: boolean }) {
  const ch = chapters[Math.min(active, chapters.length - 1)];
  // Remember the previous scene and direction so transitions dive in (down) or pull out (up).
  const [trail, setTrail] = useState({ prev: -1, cur: active, dir: 'down' as 'down' | 'up', n: 0 });
  useEffect(() => {
    setTrail((t) => (t.cur === active ? t : { prev: t.cur, cur: active, dir: active > t.cur ? 'down' : 'up', n: t.n + 1 }));
  }, [active]);
  return (
    <div className={`stage ${motion ? 'moving' : ''} dir-${trail.dir}`} style={{ ['--stage-accent' as string]: ch.accent }}>
      <div className="stage-rig">
        {chapters.map((c, i) => <Layer key={`${c.id}-${i === active ? trail.n : 'x'}`} ch={c} on={i === active} out={i === trail.prev && i !== active} near={Math.abs(i - active) <= 1} motion={motion} />)}
        {motion && trail.n > 0 && <div key={trail.n} className="stage-tunnel" aria-hidden />}
        <div className="stage-depth">
          {chapters.map((c, ci) => c.depth.map((d, i) => (
            <DepthCard key={`${c.id}-${i}`} img={localImages(d.media)[d.index ?? 0]} label={d.label} i={i} on={ci === active} />
          )))}
        </div>
      </div>
      <div className="stage-shade" aria-hidden />
      <div className="cursor-light" aria-hidden />
    </div>
  );
}

/** Continuously rotating 3D ring of real photos. Cursor left/right steers the spin. */
export function PhotoRing({ items, onOpen, motion, label, subtitle }: { items: Destination[]; onOpen: (d: Destination, e: { clientX: number; clientY: number }) => void; motion: boolean; label: string; subtitle: (d: Destination) => string }) {
  const ring = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  // Live interaction state lives in refs, so hovering never restarts the animation (it used to snap back).
  const over = useRef(false);
  const overCard = useRef(false);
  const dragMoved = useRef(0);
  const mouseOpened = useRef(false);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setNear(true); io.disconnect(); } }, { rootMargin: '1200px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const n = items.length;
  const cardW = 230;
  const radius = Math.round(cardW / 2 / Math.tan(Math.PI / n) + 60);
  useEffect(() => {
    let a = 0, speed = 6, target = 6, raf = 0, last = performance.now(), visible = false;
    // Touch: drag the ring with a finger, it keeps turning with the flick's momentum, then settles on a card.
    let drag: { lastX: number; lastT: number; v: number } | null = null, flung = false;
    const el = wrap.current;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      drag = { lastX: e.clientX, lastT: performance.now(), v: 0 }; dragMoved.current = 0; flung = false;
      if (!raf && visible) { last = performance.now(); raf = requestAnimationFrame(tick); }
    };
    const onDrag = (e: PointerEvent) => {
      if (!drag || e.pointerType === 'mouse') return;
      const now = performance.now(), dx = e.clientX - drag.lastX, dt = Math.max(1, now - drag.lastT) / 1000;
      a -= dx * 0.32; // degrees per pixel
      drag.v = drag.v * 0.6 + ((-dx * 0.32) / dt) * 0.4;
      drag.lastX = e.clientX; drag.lastT = now; dragMoved.current += Math.abs(dx);
      if (ring.current) ring.current.style.transform = `translateZ(${-radius}px) rotateY(${-a}deg)`;
    };
    const onUp = () => { if (!drag) return; speed = Math.max(-260, Math.min(260, drag.v)); drag = null; flung = true; };
    const onMove = (e: PointerEvent) => {
      const r = wrap.current?.getBoundingClientRect();
      if (!r || e.clientY < r.top - 100 || e.clientY > r.bottom + 100) { target = 6; return; }
      // Steer: cursor left/right of centre turns the ring that way, faster towards the edges;
      // a calm zone in the middle lets it glide to a stop so a card is easy to click.
      const off = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      const calm = Math.abs(off) < 0.18 ? 0 : (Math.abs(off) - 0.18) / 0.82;
      target = Math.sign(off) * calm * calm * 45;
    };
    const tick = (t: number) => {
      raf = 0;
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      if (drag) { if (visible) raf = requestAnimationFrame(tick); return; } // the finger is turning it
      if (flung) {
        // After a swipe: coast, slow down, and stop with a card squarely in front.
        speed *= Math.exp(-dt * 2.2);
        a += speed * dt;
        if (Math.abs(speed) < 12) { const step = 360 / n, nearest = Math.round(a / step) * step; a += (nearest - a) * (1 - Math.exp(-dt * 6)); }
        if (ring.current) ring.current.style.transform = `translateZ(${-radius}px) rotateY(${-a}deg)`;
        if (visible) raf = requestAnimationFrame(tick);
        return;
      }
      // Reduced motion: no automatic spin — the ring only turns when swiped.
      const goal = !motion ? 0 : over.current ? target : 6; // the calm zone in the middle is what stops it for clicking
      if (over.current && Math.abs(target) < 0.5 && Math.abs(speed) < 4) {
        // Resting in the calm zone: settle so a card faces you squarely (never a gap in the middle).
        const step = 360 / n, nearest = Math.round(a / step) * step;
        a += (nearest - a) * (1 - Math.exp(-dt * 6));
        speed *= 0.8;
      } else {
        speed += (goal - speed) * (1 - Math.exp(-dt * 4));
        a += speed * dt;
      }
      if (ring.current) ring.current.style.transform = `translateZ(${-radius}px) rotateY(${-a}deg)`;
      if (visible && (motion || Math.abs(speed) > 0.05)) raf = requestAnimationFrame(tick); // idle when a still ring has nothing to do
    };
    // Animate only while the ring is on screen.
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
    }, { rootMargin: '100px 0px' });
    if (wrap.current) io.observe(wrap.current);
    if (!motion) speed = 0;
    el?.addEventListener('pointerdown', onDown, { passive: true });
    el?.addEventListener('pointermove', onDrag, { passive: true });
    addEventListener('pointerup', onUp); addEventListener('pointercancel', onUp);
    if (motion) addEventListener('pointermove', onMove, { passive: true });
    else if (ring.current) ring.current.style.transform = `translateZ(${-radius}px)`;
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      removeEventListener('pointermove', onMove);
      el?.removeEventListener('pointerdown', onDown); el?.removeEventListener('pointermove', onDrag);
      removeEventListener('pointerup', onUp); removeEventListener('pointercancel', onUp);
    };
  }, [motion, radius, n]);
  return (
    <div className="ring-wrap" ref={wrap} onPointerEnter={(e) => { if (e.pointerType === 'mouse') over.current = true; }} onPointerLeave={() => { over.current = false; overCard.current = false; }}
      onClickCapture={(e) => { if (dragMoved.current > 10) { e.stopPropagation(); e.preventDefault(); dragMoved.current = 0; } }}>
      <div className="ring-scene" style={{ ['--r' as string]: `${radius}px` }}>
        <div className="ring" ref={ring} role="list" aria-label={label}>
          {items.map((d, i) => {
            const img = localImages(d.id)[0];
            return (
              <div role="listitem" key={d.id} className="ring-item" style={{ transform: `rotateY(${(360 / n) * i}deg) translateZ(${radius}px)` }}>
                <button className="ring-card" style={{ ['--pa' as string]: d.accent }}
                  onPointerEnter={() => { overCard.current = true; }} onPointerLeave={() => { overCard.current = false; }}
                  onFocus={() => { overCard.current = true; }} onBlur={() => { overCard.current = false; }}
                  // Mouse: open on release, even if the ring nudged the card a little while pressing.
                  onPointerUp={(e) => { if (e.pointerType === 'mouse' && e.button === 0) { mouseOpened.current = true; onOpen(d, e); } }}
                  onClick={(e) => { if (mouseOpened.current) { mouseOpened.current = false; return; } onOpen(d, e); }}>
                  {img ? <img src={near ? srcOf(img, 'thumb') : undefined} srcSet={near && img.sizes['480'] ? `${srcOf(img, 'thumb')} 480w, ${srcOf(img, 'card')} 960w` : undefined} sizes="460px" alt="" decoding="async" draggable={false} /> : <span className="photo-missing" />}
                  <span className="ring-meta"><b>{d.name}</b><small>{subtitle(d)}</small></span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <p className="tiny muted ring-hint"><span className="for-mouse">Move the cursor left or right to turn the ring · hold near the centre to stop · click a photo to open it</span><span className="for-touch">Swipe left or right to turn the ring · tap a photo to open it</span></p>
    </div>
  );
}

/** Endless 3D marquee of real “moments” (people, wildlife, city lights). */
export function MomentsMarquee({ ids }: { ids: string[] }) {
  const items = ids.map((id) => ({ id, img: localImages(id)[0] })).filter((x) => x.img);
  const scene = useRef<HTMLDivElement>(null);
  // The strip only moves while it is on screen (an endless off-screen animation still costs every frame).
  useEffect(() => {
    const el = scene.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => el.classList.toggle('is-on', e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  if (!items.length) return null;
  const loop = [...items, ...items];
  return (
    <div ref={scene} className="marquee-scene">
      <div className="marquee" aria-hidden>
        {loop.map((m, i) => (
          <figure key={`${m.id}-${i}`} className={`moment${i >= items.length ? ' is-dup' : ''}`}>
            <img src={srcOf(m.img!, 'card')} alt="" loading="lazy" />
            <figcaption>{fileLabel(m.img!)}<br /><span>{creditLine(m.img!)}</span></figcaption>
          </figure>
        ))}
      </div>
      <ul className="sr-only">{items.map((m) => <li key={m.id}>{fileLabel(m.img!)} — photo by {creditLine(m.img!)}</li>)}</ul>
    </div>
  );
}
