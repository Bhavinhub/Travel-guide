import { useEffect, useRef, useState } from 'react';
import type { Destination } from '../data/types';
import { creditLine, fileLabel, localImages, srcOf, srcSet } from '../lib/localMedia';
import { useMedia } from '../lib/media';
import { Illustration } from './Illustration';

/**
 * Real photograph for a destination: locally hosted copy first (with srcset up to 4K),
 * then a live Wikimedia lookup, then a neutral placeholder.
 */
export function DestImage({ dest, large = false, credit = true, mediaId, index = 0, sizes = '(max-width: 700px) 100vw, 33vw' }: { dest: Destination; large?: boolean; credit?: boolean; mediaId?: string; index?: number; sizes?: string }) {
  const local = localImages(mediaId ?? dest.id)[index];
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(!!local);
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    if (local || !ref.current) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setVisible(true), io.disconnect()), { rootMargin: '300px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [local]);
  const m = useMedia(!local && visible ? dest.wiki : undefined, 1);
  if (local && !broken) {
    return (
      <div ref={ref} style={{ position: 'absolute', inset: 0 }}>
        <img src={srcOf(local, large ? 'large' : 'card')} srcSet={srcSet(local)} sizes={large ? '100vw' : sizes} alt={`${dest.name} — ${fileLabel(local)}`} loading="lazy" decoding="async" onError={() => setBroken(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        {credit && <a className="media-credit" href={local.source} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>Photo: {creditLine(local)}</a>}
      </div>
    );
  }
  const img = m.lead;
  return (
    <div ref={ref} style={{ position: 'absolute', inset: 0 }}>
      {(!visible || m.status === 'loading') && <div className="skeleton" style={{ position: 'absolute', inset: 0 }} aria-hidden />}
      {visible && m.status !== 'loading' && (!img || broken) && <Illustration accent={dest.accent} />}
      {img && !broken && (
        <>
          <img src={large ? img.srcLarge : img.src} alt={`${dest.name}: ${img.title.replace(/^File:/, '').replace(/\.[a-z]+$/i, '').replace(/_/g, ' ')}`} loading="lazy" decoding="async" onError={() => setBroken(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          {credit && <a className="media-credit" href={img.page} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>Photo: {img.author ? img.author.slice(0, 40) : 'Wikimedia Commons'}{img.license ? ` · ${img.license}` : ''}</a>}
        </>
      )}
    </div>
  );
}
