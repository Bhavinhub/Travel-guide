import { useEffect } from 'react';
import { useMotion } from '../lib/store';

/**
 * Liquid cursor distortion on destination photos (mouse and pen only).
 * Moving the pointer across a photo leaves a short, smooth fluid trail that warps the image, with
 * subtle rainbow RGB edges where it bends, and the trail fades away within a second. The normal
 * pointer stays visible.
 *
 * How: one small WebGL canvas is slipped in right after the hovered <img>, inside the same card, so
 * titles and badges still sit on top. It redraws that photo (object-fit: cover, same crop) with a
 * displacement built from the last few pointer positions, and renders only while the trail is alive.
 */
const TARGETS = '.top-photo img, .dcard img, .card .media img, .spot-card img, .portal img, .ring-card img, .pg-item img, .moment img, .dhero .bg img, .trip-hero img, .gallery img, .route-strip img';
const MAX_PTS = 32, LIFE = 1.1; // seconds a trail point lives

const VERT = `attribute vec2 p; varying vec2 uv; void main(){ uv = vec2(p.x * .5 + .5, .5 - p.y * .5); gl_Position = vec4(p, 0., 1.); }`;
const FRAG = `precision mediump float;
varying vec2 uv;
uniform sampler2D tex;
uniform vec2 box, img, pos;
uniform vec4 pts[${MAX_PTS}];
uniform float life[${MAX_PTS}];
vec2 cover(vec2 q) {
  float br = box.x / box.y, ir = img.x / img.y;
  vec2 s = br > ir ? vec2(1., ir / br) : vec2(br / ir, 1.);
  return q * s + pos * (1. - s);
}
void main() {
  vec2 d = vec2(0.);
  float aspect = box.x / box.y;
  for (int i = 0; i < ${MAX_PTS}; i++) {
    float l = life[i];
    if (l <= 0.) continue;
    vec2 diff = (uv - pts[i].xy) * vec2(aspect, 1.);
    float r = .06 + .05 * (1. - l);               // each blob widens as it fades, like spreading liquid
    float f = exp(-dot(diff, diff) / (r * r)) * l * l;
    d += pts[i].zw * f;
  }
  vec2 q = clamp(uv - d, 0., 1.);
  float k = clamp(length(d) * 1.1, 0., .016);       // a hint of rainbow only where the image bends
  vec2 dir = normalize(d + 1e-6) * k;
  float rC = texture2D(tex, cover(clamp(q + dir, 0., 1.))).r;
  float gC = texture2D(tex, cover(q)).g;
  float bC = texture2D(tex, cover(clamp(q - dir, 0., 1.))).b;
  gl_FragColor = vec4(rC, gC, bC, 1.);
}`;

export function LiquidHover() {
  const { reduced } = useMotion();
  useEffect(() => {
    if (reduced || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'liquid-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: false });
    if (!gl) return;

    const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const ap = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(ap); gl.vertexAttribPointer(ap, 2, gl.FLOAT, false, 0, 0);
    const U = (n: string) => gl.getUniformLocation(prog, n);
    const uBox = U('box'), uImg = U('img'), uPos = U('pos'), uPts = U('pts'), uLife = U('life');
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach((w) => gl.texParameteri(gl.TEXTURE_2D, w, gl.CLAMP_TO_EDGE));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

    // Pixels of each photo, loaded once with CORS so WebGL may read them (local and Wikimedia photos allow it).
    const sources = new Map<string, Promise<HTMLImageElement | null>>();
    const load = (src: string) => {
      if (!sources.has(src)) sources.set(src, new Promise((res) => {
        const im = new Image(); im.crossOrigin = 'anonymous'; im.decoding = 'async';
        im.onload = () => res(im); im.onerror = () => res(null); im.src = src;
      }));
      return sources.get(src)!;
    };

    let target: HTMLImageElement | null = null, ready = false, nat = [1, 1], raf = 0, checked = false, broken = false, ref = -1;
    const avg = (px: Uint8Array | Uint8ClampedArray, step: number) => { let t = 0, n = 0; for (let i = 0; i < px.length; i += step) { t += px[i] + px[i + 1] + px[i + 2]; n += 3; } return t / Math.max(1, n); };
    const looksRight = (w: number, h: number) => {
      const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const got = avg(px, 4 * 7);
      return ref < 0 || Math.abs(got - ref) < 55;
    };
    const pts: { x: number; y: number; vx: number; vy: number; t: number }[] = [];
    const ptsArr = new Float32Array(MAX_PTS * 4), lifeArr = new Float32Array(MAX_PTS);

    const detach = () => { canvas.remove(); target = null; ready = false; pts.length = 0; };
    const attach = (img: HTMLImageElement) => {
      target = img; ready = false; pts.length = 0;
      const src = img.currentSrc || img.src;
      load(src).then((im) => {
        if (target !== img || !im) return;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, im); } catch { detach(); return; }
        nat = [im.naturalWidth, im.naturalHeight];
        try { const c2 = document.createElement('canvas'); c2.width = 24; c2.height = 24; const x2 = c2.getContext('2d')!; x2.drawImage(im, 0, 0, 24, 24); ref = avg(x2.getImageData(0, 0, 24, 24).data, 4); } catch { ref = -1; }
        ready = true; checked = false; kick();
      });
    };
    // Keep the canvas exactly over the photo: same box, same crop, same rounding and any transform the photo has.
    const place = (img: HTMLImageElement) => {
      if (canvas.previousElementSibling !== img) img.after(canvas);
      const cs = getComputedStyle(img);
      canvas.style.left = `${img.offsetLeft}px`; canvas.style.top = `${img.offsetTop}px`;
      canvas.style.width = `${img.offsetWidth}px`; canvas.style.height = `${img.offsetHeight}px`;
      canvas.style.borderRadius = cs.borderRadius; canvas.style.transform = cs.transform === 'none' ? '' : cs.transform;
      canvas.style.translate = cs.translate === 'none' ? '' : cs.translate; canvas.style.scale = cs.scale === 'none' ? '' : cs.scale;
      // No CSS filter on the canvas: on some Macs a filtered WebGL canvas composites as a white sheet.
      canvas.style.filter = 'none';
      const dpr = Math.min(devicePixelRatio || 1, 1.5);
      const w = Math.max(1, Math.round(img.offsetWidth * dpr)), h = Math.max(1, Math.round(img.offsetHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      const [px, py] = cs.objectPosition.split(' ').map((v) => (v.endsWith('%') ? parseFloat(v) / 100 : 0.5));
      return { w, h, px: isNaN(px) ? 0.5 : px, py: isNaN(py) ? 0.5 : py };
    };

    const frame = () => {
      raf = 0;
      if (!target || !target.isConnected) { detach(); return; }
      const now = performance.now() / 1000;
      while (pts.length && now - pts[0].t > LIFE) pts.shift();
      if (!pts.length) { canvas.style.opacity = '0'; if (canvas.isConnected && !overTarget) detach(); return; } // trail gone: show the photo itself
      if (!ready) { kick(); return; }
      const { w, h, px, py } = place(target);
      ptsArr.fill(0); lifeArr.fill(0);
      pts.forEach((p, i) => {
        const l = 1 - (now - p.t) / LIFE;
        ptsArr.set([p.x, p.y, p.vx, p.vy], i * 4); lifeArr[i] = Math.max(0, l * (2 - l)); // ease-out fade
      });
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uBox, w, h); gl.uniform2f(uImg, nat[0], nat[1]); gl.uniform2f(uPos, px, py);
      gl.uniform4fv(uPts, ptsArr); gl.uniform1fv(uLife, lifeArr);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (!checked) {
        // Safety: the canvas must look like the photo. If this device draws it washed out (or black), the
        // effect switches itself off for the visit and the photo simply stays as it is.
        checked = true;
        if (!looksRight(w, h)) { broken = true; detach(); return; }
      }
      canvas.style.opacity = '1';
      raf = requestAnimationFrame(frame);
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };

    let overTarget = false, last: { x: number; y: number } | null = null;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const img = (e.target as Element | null)?.closest?.('a, button, article, figure, .portal, .ring-card, .top-photo, .bg, .gallery, .pg-item')?.querySelector?.('img') as HTMLImageElement | null;
      const hit = img && img.matches(TARGETS) ? img : null;
      overTarget = !!hit;
      if (broken) return;
      if (hit && hit !== target) { detach(); attach(hit); last = null; }
      if (!target || !hit) { last = null; if (target) kick(); return; }
      const r = target.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      if (last) {
        // Velocity in photo units, softened and capped: fast flicks bend more, but never tear the image.
        const vx = Math.max(-0.06, Math.min(0.06, (x - last.x) * 0.8)), vy = Math.max(-0.06, Math.min(0.06, (y - last.y) * 0.8));
        if (Math.abs(vx) + Math.abs(vy) > 0.0008) { pts.push({ x, y, vx, vy, t: performance.now() / 1000 }); if (pts.length > MAX_PTS) pts.shift(); }
      }
      last = { x, y };
      kick();
    };
    addEventListener('pointermove', onMove, { passive: true });
    return () => { removeEventListener('pointermove', onMove); cancelAnimationFrame(raf); detach(); gl.getExtension('WEBGL_lose_context')?.loseContext(); };
  }, [reduced]);
  return null;
}
