import { useMemo } from "react";
import * as THREE from "three";
import { Sky } from "@react-three/drei";
import type { PathSample } from "./store";

/**
 * Environment: sky, ground plane, decorative trees & barriers along the road.
 * All reused instances share geometries/materials to keep draw cost low.
 */
export function SimEnvironment({ samples }: { samples: PathSample[] }) {
  const { trees, barriers, bounds } = useMemo(() => {
    if (!samples.length) return { trees: [] as Array<[number, number, number]>, barriers: [] as Array<[number, number, number, number]>, bounds: { min: -100, max: 100 } };
    const treeArr: Array<[number, number, number]> = [];
    const barrierArr: Array<[number, number, number, number]> = [];
    let minC = Infinity, maxC = -Infinity;
    for (let i = 0; i < samples.length; i++) {
      const cur = samples[i];
      minC = Math.min(minC, cur.x, cur.y);
      maxC = Math.max(maxC, cur.x, cur.y);
    }
    // Trees at every 12th sample, both sides, jittered
    for (let i = 0; i < samples.length; i += 12) {
      const cur = samples[i];
      const next = samples[Math.min(samples.length - 1, i + 1)];
      const dx = next.x - cur.x, dy = next.y - cur.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const jitter = () => (Math.sin(i * 13.31) * 0.5 + 0.5) * 4 + 8;
      const lJ = jitter();
      const rJ = jitter() * 1.1;
      treeArr.push([cur.x + nx * lJ, cur.z, -(cur.y + ny * lJ)]);
      treeArr.push([cur.x - nx * rJ, cur.z, -(cur.y - ny * rJ)]);
    }
    // Guard-rail barriers every 4 samples
    for (let i = 0; i < samples.length - 1; i += 4) {
      const cur = samples[i];
      const next = samples[i + 1];
      const dx = next.x - cur.x, dy = next.y - cur.y;
      const heading = Math.atan2(dy, dx);
      const nx = -Math.sin(heading), ny = Math.cos(heading);
      const off = 5.5;
      barrierArr.push([cur.x + nx * off, cur.z, -(cur.y + ny * off), heading]);
      barrierArr.push([cur.x - nx * off, cur.z, -(cur.y - ny * off), heading]);
    }
    return { trees: treeArr, barriers: barrierArr, bounds: { min: minC - 400, max: maxC + 400 } };
  }, [samples]);

  const trunkGeom = useMemo(() => new THREE.CylinderGeometry(0.18, 0.22, 1.1, 6), []);
  const trunkMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#4a2f1c", roughness: 1 }), []);
  const canopyGeom = useMemo(() => new THREE.ConeGeometry(1.1, 2.4, 7), []);
  const canopyMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#2f6a3a", roughness: 1 }), []);
  const barrierGeom = useMemo(() => new THREE.BoxGeometry(3, 0.6, 0.15), []);
  const barrierMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#d8dbe2", metalness: 0.35, roughness: 0.6 }), []);

  const size = bounds.max - bounds.min;

  return (
    <group>
      <Sky sunPosition={[80, 30, 20]} turbidity={4} rayleigh={1.2} mieCoefficient={0.005} mieDirectionalG={0.8} />
      <hemisphereLight args={["#bcd8ff", "#2b3a20", 0.55]} />
      <directionalLight
        position={[80, 120, 40]}
        intensity={1.15}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-200}
        shadow-camera-right={200}
        shadow-camera-top={200}
        shadow-camera-bottom={-200}
      />
      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(bounds.min + bounds.max) / 2, -0.02, -(bounds.min + bounds.max) / 2]} receiveShadow>
        <planeGeometry args={[size, size]} />
        <meshStandardMaterial color="#3a5a35" roughness={1} />
      </mesh>
      {/* Trees (instanced-lite via reuse) */}
      {trees.map((p, i) => (
        <group key={i} position={p}>
          <mesh geometry={trunkGeom} material={trunkMat} position={[0, 0.55, 0]} castShadow />
          <mesh geometry={canopyGeom} material={canopyMat} position={[0, 2, 0]} castShadow />
        </group>
      ))}
      {/* Guard rails */}
      {barriers.map((b, i) => (
        <mesh key={i} geometry={barrierGeom} material={barrierMat} position={[b[0], b[1] + 0.35, b[2]]} rotation={[0, -b[3], 0]} castShadow />
      ))}
    </group>
  );
}
