import { COMPANY } from '../config/company';

/**
 * Travel Guide mark: a living 3D Earth. A real NASA Blue Marble texture (public domain) turns inside
 * a lit sphere with an atmospheric glow, and a gold orbit carries a plane that passes in front of and
 * behind the globe. Built at a 64px design size and scaled, so it stays crisp from the menu to the header.
 */
export function LogoMark({ size = 36, title }: { size?: number; title?: string }) {
  return (
    <span className="logo-mark logo-globe" style={{ width: size, height: size }} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <span className="lg-scale" style={{ transform: `scale(${size / 64})` }}>
        <svg className="lg-orbit lg-orbit-back" viewBox="0 0 64 64" aria-hidden><path d="M2 32 A30 9.5 0 0 1 62 32" /></svg>
        <span className="lg-earth" style={{ backgroundImage: `url(${import.meta.env.BASE_URL}media/brand/earth.jpg)` }} />
        <span className="lg-shade" />
        <svg className="lg-orbit lg-orbit-front" viewBox="0 0 64 64" aria-hidden><path d="M62 32 A30 9.5 0 0 1 2 32" /></svg>
        <span className="lg-plane-orbit"><span className="lg-plane">✈</span></span>
      </span>
    </span>
  );
}

export function Wordmark() {
  return (
    <span className="wordmark" aria-label={COMPANY.name}>
      <span className="wm-a" data-text="Travel">Travel</span> <span className="wm-b" data-text="Guide">Guide</span>
    </span>
  );
}
