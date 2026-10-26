import { useId } from 'react';
import { COMPANY } from '../config/company';

/**
 * Travel Guide mark: a brushed-brass compass bezel framing a Himalayan dusk — layered
 * ridges in aerial perspective, snow-lit peak, glowing sky and a lake reflection — under
 * a glass dome, with a north needle. Drawn entirely in SVG so the brand owns it outright
 * (stock and Commons photo licences do not permit use as a trademark).
 */
export function LogoMark({ size = 36, title }: { size?: number; title?: string }) {
  const u = useId().replace(/:/g, '');
  const id = (n: string) => `${n}-${u}`;
  const url = (n: string) => `url(#${id(n)})`;
  return (
    <svg className="logo-mark" width={size} height={size} viewBox="0 0 64 64" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <defs>
        <linearGradient id={id('brass')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff3cf" />
          <stop offset=".22" stopColor="#e2b866" />
          <stop offset=".5" stopColor="#8a5a1c" />
          <stop offset=".72" stopColor="#f1cf86" />
          <stop offset="1" stopColor="#6b4213" />
        </linearGradient>
        <linearGradient id={id('brassIn')} x1="1" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#fbe3a6" />
          <stop offset=".5" stopColor="#7a4d17" />
          <stop offset="1" stopColor="#e9c27a" />
        </linearGradient>
        <linearGradient id={id('sky')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b2a52" />
          <stop offset=".45" stopColor="#6a4a7a" />
          <stop offset=".75" stopColor="#f08a4b" />
          <stop offset="1" stopColor="#ffd38a" />
        </linearGradient>
        <radialGradient id={id('sun')} cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#fff6d8" />
          <stop offset=".35" stopColor="#ffd27a" stopOpacity=".9" />
          <stop offset="1" stopColor="#ff9a4a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id('far')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8b78a8" />
          <stop offset="1" stopColor="#c58a7e" />
        </linearGradient>
        <linearGradient id={id('peak')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#3a3f63" />
          <stop offset=".55" stopColor="#4e4a6e" />
          <stop offset="1" stopColor="#272b48" />
        </linearGradient>
        <linearGradient id={id('snow')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fffaf0" />
          <stop offset=".6" stopColor="#ffd6b0" />
          <stop offset="1" stopColor="#c9a6c8" />
        </linearGradient>
        <linearGradient id={id('near')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1d3b3a" />
          <stop offset="1" stopColor="#0b1d1c" />
        </linearGradient>
        <linearGradient id={id('lake')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f3a868" />
          <stop offset=".35" stopColor="#6b5a86" />
          <stop offset="1" stopColor="#142443" />
        </linearGradient>
        <radialGradient id={id('glass')} cx=".35" cy=".25" r=".75">
          <stop offset="0" stopColor="#fff" stopOpacity=".55" />
          <stop offset=".35" stopColor="#fff" stopOpacity=".08" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id('vignette')} cx=".5" cy=".5" r=".5">
          <stop offset=".7" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".55" />
        </radialGradient>
        <linearGradient id={id('needle')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffe9a8" />
          <stop offset=".5" stopColor="#ffe9a8" />
          <stop offset=".5" stopColor="#c88a2c" />
          <stop offset="1" stopColor="#c88a2c" />
        </linearGradient>
        <clipPath id={id('dial')}><circle cx="32" cy="32" r="24.2" /></clipPath>
        <filter id={id('shadow')} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1.2" stdDeviation="1.1" floodColor="#000" floodOpacity=".55" />
        </filter>
      </defs>

      {/* Outer bezel with bevel */}
      <circle cx="32" cy="32" r="31" fill={url('brass')} filter={url('shadow')} />
      <circle cx="32" cy="32" r="28.4" fill={url('brassIn')} />
      <circle cx="32" cy="32" r="26" fill="#120d08" />

      {/* Landscape */}
      <g clipPath={url('dial')}>
        <rect x="6" y="6" width="52" height="52" fill={url('sky')} />
        <circle cx="41" cy="33" r="9" fill={url('sun')} />
        <path d="M6 37 L14 31 L19 33.5 L25 28.5 L31 32 L37 27.5 L44 31.5 L50 29 L58 33 V44 H6 Z" fill={url('far')} opacity=".85" />
        <path d="M8 40 L20 25 L25 29 L31 18 L37 26 L41 23.5 L52 38 L56 40 V44 H8 Z" fill={url('peak')} />
        {/* Sunlit snow faces */}
        <path d="M31 18 L33.6 22.4 L32.2 22 L34.6 26.4 L31.8 24.4 L30.4 26.6 L29.6 23.2 L27.8 24.6 Z" fill={url('snow')} />
        <path d="M20 25 L22.2 27.6 L21 27.4 L22.6 30 L20.4 28.8 L19 30.4 L18.6 27.2 Z" fill={url('snow')} opacity=".9" />
        <path d="M41 23.5 L43.4 26.6 L42 26.4 L43.6 29 L41.4 27.8 L40.4 29.6 L40 26.4 Z" fill={url('snow')} opacity=".85" />
        <path d="M6 42 C 14 37, 20 40, 26 38.5 C 33 36.5, 40 40.5, 58 37.5 V46 H6 Z" fill={url('near')} />
        {/* Lake with reflection and shimmer */}
        <rect x="6" y="44" width="52" height="14" fill={url('lake')} />
        <path d="M8 44 L20 52 L25 49.5 L31 57 L37 51 L41 53 L52 45 L56 44 Z" fill="#2b2f55" opacity=".45" />
        <path d="M34 46.2 H 46 M 30 48.4 H 44 M 33 50.6 H 41" stroke="#ffd7a0" strokeWidth=".55" strokeLinecap="round" opacity=".75" />
        <path d="M6 44 H58" stroke="#ffcf96" strokeWidth=".4" opacity=".6" />
        <circle cx="32" cy="32" r="26" fill={url('vignette')} />
      </g>

      {/* Compass ticks */}
      <g stroke="#f6dca2" strokeLinecap="round" opacity=".9">
        {Array.from({ length: 16 }, (_, i) => {
          const a = (i * Math.PI) / 8, major = i % 4 === 0;
          const r1 = major ? 23.2 : 24.2, r2 = 26.2;
          return <line key={i} x1={32 + r1 * Math.sin(a)} y1={32 - r1 * Math.cos(a)} x2={32 + r2 * Math.sin(a)} y2={32 - r2 * Math.cos(a)} strokeWidth={major ? 1.1 : 0.5} />;
        })}
      </g>

      {/* North needle */}
      <g filter={url('shadow')}>
        <path d="M32 9.5 L35 20 L32 18.2 L29 20 Z" fill={url('needle')} />
        <circle cx="32" cy="32" r="1.6" fill="#f6dca2" stroke="#7a4d17" strokeWidth=".5" />
      </g>

      {/* Glass dome highlight */}
      <circle cx="32" cy="32" r="26" fill={url('glass')} />
      <path d="M14 22 A 20 20 0 0 1 36 10.6" fill="none" stroke="#fff" strokeOpacity=".45" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="wordmark" aria-label={COMPANY.name}>
      Travel <span>Guide</span>
    </span>
  );
}
