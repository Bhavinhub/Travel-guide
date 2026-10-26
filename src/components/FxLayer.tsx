import { useEffect, useRef } from 'react';

/**
 * Lightweight 2D particle atmosphere drawn over the real photographs:
 * leaves, rain, pollen, snow, sea spray, city bokeh, stars. Particles drift with the
 * cursor (parallax) and react to scroll speed. Effects only — no imagery is generated.
 */
export type Fx = 'leaves' | 'rain' | 'pollen' | 'snow' | 'spray' | 'bokeh' | 'stars';

interface P { x: number; y: number; z: number; v: number; s: number; h: number }

export function FxLayer({ fx, enabled }: { fx: Fx; enabled: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const fxRef = useRef(fx);
  fxRef.current = fx;
  useEffect(() => {
    if (!enabled) return;
    const c = ref.current!;
    const ctx = c.getContext('2d')!;
    let W = 0, H = 0, raf = 0, mx = 0, my = 0, lastY = scrollY, sv = 0;
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    const resize = () => { W = innerWidth; H = innerHeight; c.width = W * dpr; c.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    resize();
    const mk = (): P => ({ x: Math.random() * W, y: Math.random() * H, z: 0.3 + Math.random() * 0.9, v: Math.random(), s: Math.random(), h: Math.random() });
    let ps: P[] = Array.from({ length: 260 }, mk);
    const onMove = (e: PointerEvent) => { mx = e.clientX / W - 0.5; my = e.clientY / H - 0.5; };
    let alpha = 0;
    let current = fxRef.current;
    const draw = () => {
      const f = fxRef.current;
      if (f !== current) { alpha -= 0.04; if (alpha <= 0) { current = f; ps = Array.from({ length: 260 }, mk); } } else alpha = Math.min(1, alpha + 0.02);
      const v = scrollY - lastY; lastY = scrollY; sv += (v - sv) * 0.15;
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = Math.max(0, alpha);
      const n = { leaves: 50, rain: 260, pollen: 90, snow: 180, spray: 70, bokeh: 60, stars: 160 }[current];
      for (let i = 0; i < n; i++) {
        const p = ps[i];
        const px = p.x + mx * 60 * p.z;
        const py = p.y + my * 40 * p.z;
        switch (current) {
          case 'rain':
            ctx.strokeStyle = `rgba(210,230,245,${0.25 + p.z * 0.35})`; ctx.lineWidth = p.z;
            ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - 3 * p.z, py + 18 * p.z); ctx.stroke();
            p.y += (16 + sv * 0.4) * p.z; p.x -= 1.5 * p.z; break;
          case 'snow':
            ctx.fillStyle = `rgba(255,255,255,${0.5 + p.z * 0.4})`; ctx.beginPath(); ctx.arc(px, py, 1 + p.z * 2.2, 0, 6.28); ctx.fill();
            p.y += (0.3 + p.z * 0.7 + sv * 0.03); p.x += Math.sin((p.y + p.h * 400) * 0.02) * 0.6; break;
          case 'leaves': {
            ctx.save(); ctx.translate(px, py); ctx.rotate(p.y * 0.02 + p.h * 6);
            ctx.fillStyle = `hsla(${70 + p.h * 60}, 60%, ${35 + p.s * 25}%, ${0.6 + p.z * 0.3})`;
            ctx.beginPath(); ctx.ellipse(0, 0, 6 * p.z, 2.6 * p.z, 0, 0, 6.28); ctx.fill(); ctx.restore();
            p.y += 0.4 + p.z * 0.5; p.x += Math.sin((p.y + p.h * 300) * 0.015) * 1.2; break;
          }
          case 'pollen': case 'spray':
            ctx.fillStyle = current === 'pollen' ? `rgba(255,240,190,${0.35 * p.z})` : `rgba(235,250,255,${0.4 * p.z})`;
            ctx.beginPath(); ctx.arc(px, py, 1 + p.z * 2, 0, 6.28); ctx.fill();
            p.y -= 0.12 * p.z; p.x += Math.sin((p.y + p.h * 500) * 0.01) * 0.4; break;
          case 'bokeh': {
            const g = ctx.createRadialGradient(px, py, 0, px, py, 14 * p.z + 4);
            g.addColorStop(0, `hsla(${30 + p.h * 40}, 95%, 70%, ${0.35 * p.z})`); g.addColorStop(1, 'hsla(40, 90%, 60%, 0)');
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, 14 * p.z + 4, 0, 6.28); ctx.fill();
            p.y -= 0.15 * p.z; break;
          }
          case 'stars':
            ctx.fillStyle = `rgba(255,255,255,${(0.3 + 0.7 * Math.abs(Math.sin(performance.now() / 900 + p.h * 10))) * p.z})`;
            ctx.fillRect(px, py * 0.6, 1.4 * p.z, 1.4 * p.z); break;
        }
        if (p.y > H + 20) { p.y = -20; p.x = Math.random() * W; }
        if (p.y < -20) { p.y = H + 20; p.x = Math.random() * W; }
        if (p.x < -20) p.x = W + 20;
        if (p.x > W + 20) p.x = -20;
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    addEventListener('pointermove', onMove, { passive: true });
    addEventListener('resize', resize);
    return () => { cancelAnimationFrame(raf); removeEventListener('pointermove', onMove); removeEventListener('resize', resize); };
  }, [enabled]);
  if (!enabled) return null;
  return <canvas ref={ref} className="fx-canvas" aria-hidden />;
}
