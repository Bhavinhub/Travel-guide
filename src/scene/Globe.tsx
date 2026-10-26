import { Html, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import gsap from 'gsap';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { mesh } from 'topojson-client';
import type { Topology } from 'topojson-specification';
import world from 'world-atlas/countries-110m.json';
import type { Destination } from '../data/types';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
const SUN = new THREE.Vector3(1.2, 0.5, 0.9).normalize();

/** Earth with NASA Blue Marble (day) and DMSP city lights (night), both public domain. */
function Earth() {
  const [day, night] = useLoader(THREE.TextureLoader, [`${BASE}/media/globe/day.jpg`, `${BASE}/media/globe/night.jpg`]);
  day.colorSpace = THREE.SRGBColorSpace;
  night.colorSpace = THREE.SRGBColorSpace;
  day.anisotropy = night.anisotropy = 8;
  const mat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uDay: { value: day }, uNight: { value: night }, uSun: { value: SUN } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vView;
      void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 wp = modelMatrix * vec4(position,1.0); vView = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `uniform sampler2D uDay, uNight; uniform vec3 uSun; varying vec2 vUv; varying vec3 vN; varying vec3 vView;
      void main(){
        float l = dot(normalize(vN), uSun);
        float dayMix = smoothstep(-0.15, 0.25, l);
        vec3 d = texture2D(uDay, vUv).rgb * (0.25 + 0.95 * max(l, 0.0));
        vec3 n = texture2D(uNight, vUv).rgb * vec3(1.0, 0.85, 0.6) * 1.6;
        vec3 col = mix(n + vec3(0.01, 0.02, 0.04), d, dayMix);
        float spec = pow(max(dot(reflect(-uSun, normalize(vN)), vView), 0.0), 40.0) * dayMix * 0.35;
        float rim = pow(1.0 - max(dot(normalize(vN), vView), 0.0), 3.0);
        gl_FragColor = vec4(col + spec + rim * vec3(0.35, 0.7, 1.0) * 0.6, 1.0);
      }`,
  }), [day, night]);
  return <mesh material={mat}><sphereGeometry args={[1, 96, 96]} /></mesh>;
}

export function latLonToVec(lat: number, lon: number, r = 1) {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
}

function useCountryLines() {
  return useMemo(() => {
    const topo = world as unknown as Topology;
    const ml = mesh(topo, topo.objects.countries as any) as GeoJSON.MultiLineString;
    const pts: number[] = [];
    ml.coordinates.forEach((line) => {
      for (let i = 0; i < line.length - 1; i++) {
        const a = latLonToVec(line[i][1], line[i][0], 1.002);
        const b = latLonToVec(line[i + 1][1], line[i + 1][0], 1.002);
        pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, []);
}

function useGraticule() {
  return useMemo(() => {
    const pts: number[] = [];
    for (let lat = -60; lat <= 60; lat += 30) {
      for (let lon = -180; lon < 180; lon += 4) {
        const a = latLonToVec(lat, lon, 1.001);
        const b = latLonToVec(lat, lon + 4, 1.001);
        pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
    for (let lon = -180; lon < 180; lon += 30) {
      for (let lat = -80; lat < 80; lat += 4) {
        const a = latLonToVec(lat, lon, 1.001);
        const b = latLonToVec(lat + 4, lon, 1.001);
        pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, []);
}

function Marker({ d, selected, hovered, onHover, onSelect }: { d: Destination; selected: boolean; hovered: boolean; onHover: (id: string | null) => void; onSelect: (id: string) => void }) {
  const pos = useMemo(() => latLonToVec(d.lat, d.lon, 1.01), [d]);
  const ring = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ring.current) {
      const s = selected ? 1 + Math.sin(clock.elapsedTime * 3) * 0.25 : 1;
      ring.current.scale.setScalar(s);
    }
  });
  const quat = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), pos.clone().normalize()), [pos]);
  return (
    <group position={pos} quaternion={quat}>
      <mesh
        onPointerOver={(e) => { e.stopPropagation(); onHover(d.id); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { onHover(null); document.body.style.cursor = ''; }}
        onClick={(e) => { e.stopPropagation(); onSelect(d.id); }}
      >
        <sphereGeometry args={[selected || hovered ? 0.022 : 0.015, 12, 12]} />
        <meshBasicMaterial color={selected ? '#f4c56a' : d.scope === 'india' ? '#9fe0b8' : '#9fd2ff'} />
      </mesh>
      <mesh ref={ring}>
        <ringGeometry args={[0.026, 0.032, 24]} />
        <meshBasicMaterial color={selected ? '#f4c56a' : '#ffffff'} transparent opacity={selected ? 0.9 : hovered ? 0.6 : 0.2} side={THREE.DoubleSide} />
      </mesh>
      {(hovered || selected) && (
        <Html center distanceFactor={undefined} style={{ pointerEvents: 'none' }} position={[0, 0, 0.06]}>
          <div className="globe-tip">{d.name}</div>
        </Html>
      )}
    </group>
  );
}

function FocusController({ target, controls, reduced, replayKey }: { target?: Destination; controls: React.MutableRefObject<any>; reduced: boolean; replayKey: number }) {
  const { camera, invalidate } = useThree();
  useEffect(() => {
    if (!target) return;
    const dist = 1.85; // dive close to the surface
    const end = latLonToVec(target.lat, target.lon, 1).normalize().multiplyScalar(dist);
    // Short, finite camera move that settles into a usable view.
    if (reduced) {
      camera.position.copy(end);
      camera.lookAt(0, 0, 0);
      controls.current?.update();
      invalidate();
      return;
    }
    const start = camera.position.clone();
    const st = { t: 0 };
    const tw = gsap.to(st, {
      t: 1, duration: 1.3, ease: 'power3.inOut',
      onUpdate: () => {
        const v = start.clone().normalize().lerp(end.clone().normalize(), st.t).normalize();
        const r = THREE.MathUtils.lerp(start.length(), end.length(), st.t) + Math.sin(st.t * Math.PI) * 0.9; // pull out, then dive in
        camera.position.copy(v.multiplyScalar(r));
        camera.lookAt(0, 0, 0);
        controls.current?.update();
        invalidate();
      },
    });
    return () => { tw.kill(); };
  }, [target, reduced, replayKey, camera, controls, invalidate]);
  return null;
}

export default function Globe({ destinations, selectedId, onSelect, paused, reduced, initial = 'india', replayKey = 0 }: {
  destinations: Destination[]; selectedId?: string; onSelect: (id: string) => void; paused: boolean; reduced: boolean; initial?: 'india' | 'world'; replayKey?: number;
}) {
  const lines = useCountryLines();
  const grat = useGraticule();
  const [hover, setHover] = useState<string | null>(null);
  const controls = useRef<any>(null);
  const target = destinations.find((d) => d.id === selectedId);
  const start = initial === 'india' ? latLonToVec(20, 78, 3.3) : latLonToVec(25, 40, 3.6);
  return (
    <Canvas frameloop={paused ? 'demand' : 'always'} dpr={[1, 1.75]} camera={{ fov: 40, position: start.toArray(), near: 0.1, far: 50 }} aria-hidden>
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 2, 4]} intensity={1.6} />
      <Suspense fallback={<mesh><sphereGeometry args={[1, 64, 64]} /><meshStandardMaterial color="#0d2b3a" /></mesh>}>
        <Earth />
      </Suspense>
      <mesh scale={1.12}>
        <sphereGeometry args={[1, 48, 48]} />
        <shaderMaterial
          transparent
          side={THREE.BackSide}
          depthWrite={false}
          vertexShader="varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }"
          fragmentShader="varying vec3 vN; void main(){ float i = pow(0.75 - dot(vN, vec3(0,0,1.0)), 3.0); gl_FragColor = vec4(0.45, 0.85, 0.75, 1.0) * i; }"
        />
      </mesh>
      <lineSegments geometry={grat}>
        <lineBasicMaterial color="#9fd2ff" transparent opacity={0.08} />
      </lineSegments>
      <lineSegments geometry={lines}>
        <lineBasicMaterial color="#e9fff4" transparent opacity={0.28} />
      </lineSegments>
      {destinations.map((d) => (
        <Marker key={d.id} d={d} selected={d.id === selectedId} hovered={hover === d.id} onHover={setHover} onSelect={onSelect} />
      ))}
      <OrbitControls ref={controls} enablePan={false} enableZoom={false} minDistance={1.8} maxDistance={4.6} rotateSpeed={0.5} zoomSpeed={0.6} autoRotate={!paused && !selectedId} autoRotateSpeed={0.35} enableDamping={!reduced} />
      <FocusController target={target} controls={controls} reduced={reduced} replayKey={replayKey} />
    </Canvas>
  );
}
