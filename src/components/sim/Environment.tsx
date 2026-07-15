import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Sky } from "@react-three/drei";
import type { PathSample } from "./store";
import { grassTexture } from "./textures";

/**
 * Environment: sky, PBR grass terrain, InstancedMesh trees & guard rails.
 * All instanced to keep draw calls low.
 */
export function SimEnvironment({ samples }: { samples: PathSample[] }) {
  const { trees, barriers, bounds } = useMemo(() => {
    if (!samples.length)
      return {
        trees: [] as Array<{ x: number; y: number; z: number; scale: number; rot: number }>,
        barriers: [] as Array<{ x: number; y: number; z: number; heading: number }>,
        bounds: { min: -100, max: 100 },
      };
    const treeArr: Array<{ x: number; y: number; z: number; scale: number; rot: number }> = [];
    const barrierArr: Array<{ x: number; y: number; z: number; heading: number }> = [];
    let minC = Infinity,
      maxC = -Infinity;
    for (const c of samples) {
      minC = Math.min(minC, c.x, c.y);
      maxC = Math.max(maxC, c.x, c.y);
    }
    for (let i = 0; i < samples.length; i += 10) {
      const cur = samples[i];
      const next = samples[Math.min(samples.length - 1, i + 1)];
      const dx = next.x - cur.x,
        dy = next.y - cur.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len,
        ny = dx / len;
      const hash = (n: number) => Math.abs(Math.sin(n * 12.9898) * 43758.5453) % 1;
      for (let side = -1; side <= 1; side += 2) {
        for (let k = 0; k < 3; k++) {
          const off = 9 + hash(i * 7 + k * 3 + side) * 22;
          const jitterS = 0.7 + hash(i * 3 + k) * 0.9;
          const tx = cur.x + side * nx * off + (hash(i + k) - 0.5) * 3;
          const ty = cur.y + side * ny * off + (hash(i - k) - 0.5) * 3;
          treeArr.push({ x: tx, y: cur.z, z: -ty, scale: jitterS, rot: hash(i + k * 5) * Math.PI * 2 });
        }
      }
    }
    for (let i = 0; i < samples.length - 1; i += 4) {
      const cur = samples[i];
      const next = samples[i + 1];
      const heading = Math.atan2(next.y - cur.y, next.x - cur.x);
      const nx = -Math.sin(heading),
        ny = Math.cos(heading);
      const off = 5.5;
      barrierArr.push({ x: cur.x + nx * off, y: cur.z, z: -(cur.y + ny * off), heading });
      barrierArr.push({ x: cur.x - nx * off, y: cur.z, z: -(cur.y - ny * off), heading });
    }
    return { trees: treeArr, barriers: barrierArr, bounds: { min: minC - 500, max: maxC + 500 } };
  }, [samples]);

  const trunkGeom = useMemo(() => new THREE.CylinderGeometry(0.18, 0.24, 1.2, 8), []);
  const canopyGeom = useMemo(() => new THREE.ConeGeometry(1.2, 2.8, 10), []);
  const trunkMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#4a2f1c", roughness: 1 }), []);
  const canopyMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#2f6a3a", roughness: 0.9 }), []);
  const barrierGeom = useMemo(() => new THREE.BoxGeometry(3, 0.55, 0.12), []);
  const barrierMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#c2c6cf", metalness: 0.6, roughness: 0.4 }),
    [],
  );

  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const canopyRef = useRef<THREE.InstancedMesh>(null);
  const barrierRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    if (trunkRef.current) {
      trees.forEach((t, i) => {
        dummy.position.set(t.x, t.y + 0.6 * t.scale, t.z);
        dummy.rotation.set(0, t.rot, 0);
        dummy.scale.setScalar(t.scale);
        dummy.updateMatrix();
        trunkRef.current!.setMatrixAt(i, dummy.matrix);
      });
      trunkRef.current.instanceMatrix.needsUpdate = true;
    }
    if (canopyRef.current) {
      trees.forEach((t, i) => {
        dummy.position.set(t.x, t.y + 2.2 * t.scale, t.z);
        dummy.rotation.set(0, t.rot, 0);
        dummy.scale.setScalar(t.scale);
        dummy.updateMatrix();
        canopyRef.current!.setMatrixAt(i, dummy.matrix);
      });
      canopyRef.current.instanceMatrix.needsUpdate = true;
    }
    if (barrierRef.current) {
      barriers.forEach((b, i) => {
        dummy.position.set(b.x, b.y + 0.32, b.z);
        dummy.rotation.set(0, -b.heading, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        barrierRef.current!.setMatrixAt(i, dummy.matrix);
      });
      barrierRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [trees, barriers]);

  const size = bounds.max - bounds.min;
  const grassMat = useMemo(() => {
    const t = grassTexture();
    t.repeat.set(size / 8, size / 8);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 1, metalness: 0 });
  }, [size]);

  return (
    <group>
      <Sky sunPosition={[80, 30, 20]} turbidity={4} rayleigh={1.2} mieCoefficient={0.005} mieDirectionalG={0.8} />
      <hemisphereLight args={["#bcd8ff", "#3a4a2a", 0.65]} />
      <ambientLight intensity={0.25} />
      <directionalLight
        position={[80, 120, 40]}
        intensity={1.35}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-120}
        shadow-camera-right={120}
        shadow-camera-top={120}
        shadow-camera-bottom={-120}
        shadow-bias={-0.0005}
      />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[(bounds.min + bounds.max) / 2, -0.02, -(bounds.min + bounds.max) / 2]}
        receiveShadow
      >
        <planeGeometry args={[size, size]} />
        <primitive object={grassMat} attach="material" />
      </mesh>
      {trees.length > 0 && (
        <>
          <instancedMesh ref={trunkRef} args={[trunkGeom, trunkMat, trees.length]} castShadow />
          <instancedMesh ref={canopyRef} args={[canopyGeom, canopyMat, trees.length]} castShadow />
        </>
      )}
      {barriers.length > 0 && (
        <instancedMesh ref={barrierRef} args={[barrierGeom, barrierMat, barriers.length]} castShadow />
      )}
    </group>
  );
}
