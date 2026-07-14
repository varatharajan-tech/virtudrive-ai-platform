import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, Line } from "@react-three/drei";
import { useMemo, useRef, useState, useEffect } from "react";
import * as THREE from "three";

export interface PathSample { x: number; y: number; z: number; speed_mps: number; heading_rad: number }

export function Sim3DScene({ samples }: { samples: PathSample[] }) {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setT((v) => (v + 0.005) % 1), 30);
    return () => clearInterval(id);
  }, [playing]);

  return (
    <div className="relative w-full h-full">
      <Canvas shadows>
        <PerspectiveCamera makeDefault position={[40, 40, 40]} fov={50} />
        <color attach="background" args={["#0d1220"]} />
        <fog attach="fog" args={["#0d1220", 60, 400]} />
        <ambientLight intensity={0.4} />
        <directionalLight position={[50, 80, 30]} intensity={1.1} castShadow />
        <Ground />
        <RoadRibbon samples={samples} />
        <Car samples={samples} t={t} />
        <OrbitControls enablePan enableZoom enableRotate />
      </Canvas>
      <div className="absolute bottom-3 left-3 right-3 flex items-center gap-3 bg-card/80 backdrop-blur border border-border rounded-md p-2">
        <button
          onClick={() => setPlaying((p) => !p)}
          className="text-xs font-semibold px-3 py-1 rounded bg-primary text-primary-foreground"
        >{playing ? "Pause" : "Play"}</button>
        <input
          type="range" min={0} max={1} step={0.001} value={t}
          onChange={(e) => { setT(Number(e.target.value)); setPlaying(false); }}
          className="flex-1 accent-primary"
        />
        <div className="text-xs num text-muted-foreground w-20 text-right">
          {(samples[Math.floor(t * (samples.length - 1))]?.speed_mps * 3.6 || 0).toFixed(0)} km/h
        </div>
      </div>
    </div>
  );
}

function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[2000, 2000, 20, 20]} />
      <meshStandardMaterial color="#0f1729" roughness={1} />
    </mesh>
  );
}

function RoadRibbon({ samples }: { samples: PathSample[] }) {
  const points = useMemo(() => samples.map((s) => new THREE.Vector3(s.x, 0.05, -s.y)), [samples]);
  // ribbon: build a thin strip geometry
  const geometry = useMemo(() => {
    const width = 6;
    const positions: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i < samples.length; i++) {
      const cur = samples[i];
      const next = samples[Math.min(i + 1, samples.length - 1)];
      const dx = next.x - cur.x, dy = next.y - cur.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      positions.push(cur.x + nx * width / 2, 0.02, -(cur.y + ny * width / 2));
      positions.push(cur.x - nx * width / 2, 0.02, -(cur.y - ny * width / 2));
      if (i < samples.length - 1) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }, [samples]);
  return (
    <>
      <mesh geometry={geometry} receiveShadow>
        <meshStandardMaterial color="#1a2540" roughness={0.9} />
      </mesh>
      <Line points={points} color="#22d3ee" lineWidth={1.5} dashed={false} />
    </>
  );
}

function Car({ samples, t }: { samples: PathSample[]; t: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!ref.current) return;
    const i = Math.floor(t * (samples.length - 1));
    const s = samples[i];
    if (!s) return;
    ref.current.position.set(s.x, 0.6, -s.y);
    ref.current.rotation.y = -s.heading_rad;
  });
  return (
    <group ref={ref}>
      <mesh castShadow position={[0, 0.4, 0]}>
        <boxGeometry args={[2, 0.8, 4]} />
        <meshStandardMaterial color="#22d3ee" metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh castShadow position={[0, 1, -0.3]}>
        <boxGeometry args={[1.7, 0.6, 2]} />
        <meshStandardMaterial color="#111823" metalness={0.4} roughness={0.4} />
      </mesh>
    </group>
  );
}
