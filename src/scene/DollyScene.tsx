import { useTexture } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

/**
 * Scroll-controlled 3D image scene.
 * Real photographs stand one behind another along a corridor. Scroll position drives a
 * camera dolly: scrolling down dollies in — through each photo into the next scene —
 * and scrolling up dollies back out. Smaller photo cards float beside the path for
 * parallax. The cursor gently steers the camera. Nothing is generated: every surface is a photo.
 */
import { dolly } from './dollyState';
export { dolly };

const GAP = 42; // distance between scene photos
const VIEW = 11; // camera distance in front of a photo when "parked" on it
const FOV = 50;

export interface DollyChapter { image: string; focusY?: number; cards: { image: string; label: string }[] }

const pointer = { x: 0, y: 0 };
if (typeof window !== 'undefined') {
  addEventListener('pointermove', (e) => { pointer.x = (e.clientX / innerWidth) * 2 - 1; pointer.y = (e.clientY / innerHeight) * 2 - 1; }, { passive: true });
}

function ScenePlane({ tex, index, focusY = 0.5 }: { tex: THREE.Texture; index: number; focusY?: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const { camera, size } = useThree();
  const img = tex.image as HTMLImageElement;
  const aspect = img ? img.width / img.height : 1.6;
  // Size the plane to over-cover the viewport when the camera is parked VIEW units away.
  const h = 2 * VIEW * Math.tan(((FOV / 2) * Math.PI) / 180) * 1.18;
  const w = Math.max(h * aspect, h * (size.width / size.height) * 1.05);
  const hh = w / aspect;
  useFrame(() => {
    if (!ref.current || !mat.current) return;
    const z = -index * GAP;
    const d = camera.position.z - z; // distance in front of this photo
    // Fade in from the depths, and dissolve as the camera passes through it.
    const far = THREE.MathUtils.smoothstep(GAP * 1.6 - d, 0, GAP * 0.6);
    const near = THREE.MathUtils.smoothstep(d, 0.4, VIEW * 0.35); // stay fully visible until the camera is very close
    mat.current.opacity = Math.min(far, near);
    ref.current.visible = mat.current.opacity > 0.01;
  });
  return (
    // Shift tall photos so the chosen focal point sits in the middle of the frame.
    <mesh ref={ref} position={[0, (focusY - 0.5) * Math.max(h, hh) * (hh > h * 1.05 ? 1 : 0), -index * GAP]} renderOrder={-index}>
      <planeGeometry args={[w, Math.max(h, hh)]} />
      <meshBasicMaterial ref={mat} map={tex} transparent toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

function Card({ tex, pos, rot, label }: { tex: THREE.Texture; pos: [number, number, number]; rot: number; label: string }) {
  const ref = useRef<THREE.Group>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const { camera } = useThree();
  const img = tex.image as HTMLImageElement;
  const aspect = img ? img.width / img.height : 1.5;
  const seed = useMemo(() => Math.random() * 10, []);
  useFrame(({ clock }) => {
    if (!ref.current || !mat.current) return;
    const d = camera.position.z - pos[2];
    mat.current.opacity = THREE.MathUtils.smoothstep(d, 0.5, 6) * THREE.MathUtils.smoothstep(GAP * 1.2 - d, 0, 10);
    // Slow orbit-like float so cards never stop moving.
    const t = clock.elapsedTime * 0.2 + seed;
    ref.current.position.set(pos[0] + Math.sin(t) * 0.3, pos[1] + Math.cos(t * 1.3) * 0.25, pos[2]);
    ref.current.rotation.y = rot + Math.sin(t * 0.7) * 0.08;
  });
  return (
    <group ref={ref} position={pos}>
      <mesh>
        <planeGeometry args={[3.2 * aspect / 1.5, 3.2 / 1.5 * 1.0]} />
        <meshBasicMaterial ref={mat} map={tex} transparent toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0, -0.02]}>
        <planeGeometry args={[3.2 * aspect / 1.5 + 0.12, 3.2 / 1.5 + 0.12]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.12} />
      </mesh>
      <group userData={{ label }} />
    </group>
  );
}

function Rig({ count }: { count: number }) {
  const { camera, invalidate } = useThree();
  const z = useRef(VIEW);
  useEffect(() => {
    const on = () => invalidate();
    addEventListener('scroll', on, { passive: true });
    addEventListener('pointermove', on, { passive: true });
    return () => { removeEventListener('scroll', on); removeEventListener('pointermove', on); };
  }, [invalidate]);
  useFrame((_, dt) => {
    const target = -dolly.progress * GAP + VIEW;
    // Smooth dolly: eased follow of the scroll-scrubbed target (in and out).
    z.current += (target - z.current) * (1 - Math.exp(-Math.min(dt, 0.05) * 1.6)); // slow, cinematic glide
    const between = Math.abs(((dolly.progress % 1) + 1) % 1 - 0.5) * 2; // 1 when parked, 0 mid-flight
    camera.position.set(pointer.x * 0.8, -pointer.y * 0.45 + (1 - between) * 0.4, z.current);
    camera.lookAt(pointer.x * 0.3, -pointer.y * 0.2, z.current - VIEW);
    (camera as THREE.PerspectiveCamera).fov = FOV + (1 - between) * 4; // subtle zoom swell mid-dolly
    camera.updateProjectionMatrix();
    if (Math.abs(target - z.current) > 0.01) invalidate();
  });
  void count;
  return null;
}

function World({ chapters }: { chapters: DollyChapter[] }) {
  const urls = useMemo(() => [...chapters.map((c) => c.image), ...chapters.flatMap((c) => c.cards.map((k) => k.image))], [chapters]);
  const textures = useTexture(urls) as THREE.Texture[];
  textures.forEach((t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; });
  const cards = useMemo(() => {
    let k = chapters.length;
    return chapters.flatMap((c, i) => c.cards.map((card, j) => {
      const side = j % 2 ? 1 : -1;
      const depth = -i * GAP - 8 - (j * (GAP - 14)) / Math.max(1, c.cards.length);
      return { tex: k++, label: card.label, pos: [side * (5.2 + (j % 3) * 1.4), ((j * 37) % 5) - 2.2, depth] as [number, number, number], rot: -side * 0.45 };
    }));
  }, [chapters]);
  return (
    <>
      {chapters.map((c, i) => <ScenePlane key={i} tex={textures[i]} index={i} focusY={c.focusY} />)}
      {cards.map((c, i) => <Card key={i} tex={textures[c.tex]} pos={c.pos} rot={c.rot} label={c.label} />)}
      <Rig count={chapters.length} />
    </>
  );
}

export default function DollyScene({ chapters, motion }: { chapters: DollyChapter[]; motion: boolean }) {
  return (
    <div className="dolly-scene" aria-hidden>
      <Canvas frameloop={motion ? 'always' : 'demand'} dpr={[1, 1.75]} camera={{ fov: FOV, near: 0.1, far: 400, position: [0, 0, VIEW] }} gl={{ antialias: true, alpha: true, premultipliedAlpha: false }} onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}>
        <World chapters={chapters} />
      </Canvas>
    </div>
  );
}
