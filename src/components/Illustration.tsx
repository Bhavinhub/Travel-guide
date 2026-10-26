import type { Destination } from '../data/types';

/**
 * Neutral placeholder shown only if no real photograph could be loaded.
 * (No drawn or generated imagery is used anywhere on the site.)
 */
export function Illustration({ accent, label = true, className }: { scene?: Destination['scene']; accent?: string; label?: boolean; className?: string }) {
  return (
    <div className={`illus photo-missing ${className ?? ''}`} style={{ ['--pm' as string]: accent ?? '#2a4a44' }} role="img" aria-label="Photo unavailable">
      {label && <span>Photo unavailable</span>}
    </div>
  );
}
