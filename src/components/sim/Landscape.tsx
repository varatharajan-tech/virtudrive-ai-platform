import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { PathSample } from "./store";
import { hash2 } from "./textures";
import type { TerrainSampler } from "./terrain-height";

/**
 * Landscape enrichment: rocks and small ponds scattered on the terrain,
 * placed away from the road corridor. All Y positions come from the shared
 * terrain sampler so nothing floats or clips.
 */
export function Landscape({
  samples,
  sampler,
}: {
  samples: PathSample[];
  sampler: TerrainSampler;
}) {
  const { rocks, ponds } = useMemo(() => {
    const rocksArr: Array<{ x: number; y: number; z: number; scale: number; rot: number }> = [];
    const pondsArr: Array<{ x: number; y: number; z: number; radius: number }> = [];
    if (!samples.length) return { rocks: rocksArr, ponds: pondsArr };

    // Scatter rocks around the road, biased into small clusters
    for (let i = 0; i < samples.length; i += 8) {
      const cur = samples[i];
      const next = samples[Math.min(samples.length - 1, i + 1)];
      const dx = next.x - cur.x,
        dy = next.y - cur.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len,
        ny = dx / len;

      for (let side = -1; side <= 1; side += 2) {
        const cluster = hash2(i, side);
        if (cluster < 0.55) continue; // Sparse
        const off = 80 + hash2(i * 3, side * 5) * 180;
        const jx = cur.x + side * nx * off;
        const jy = cur.y + side * ny * off;
        // 3-5 rocks per cluster
        const count = 3 + Math.floor(hash2(i * 7, side * 11) * 3);
        for (let k = 0; k < count; k++) {
          const rx = jx + (hash2(i + k, side * 13) - 0.5) * 8;
          const rz = -(jy + (hash2(i - k, side * 17) - 0.5) * 8);
          const groundY = sampler.heightAt(rx, rz);
          // Skip if too close to road (safety)
          if (sampler.roadDistance(rx, rz) < 15) continue;
          rocksArr.push({
            x: rx,
            y: groundY,
            z: rz,
            scale: 0.7 + hash2(i * k + 3, k) * 1.6,
            rot: hash2(i * 5 + k, 7) * Math.PI * 2,
          });
        }
      }
    }

    // A couple of ponds at terrain minima far from the road
    const attempts = 8;
    for (let a = 0; a < attempts; a++) {
      const seedI = Math.floor((a / attempts) * samples.length);
      const cur = samples[seedI];
      const next = samples[Math.min(samples.length - 1, seedI + 1)];
      const dx = next.x - cur.x,
        dy = next.y - cur.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len,
        ny = dx / len;
      const side = a % 2 === 0 ? 1 : -1;
      const off = 160 + hash2(a, seedI) * 90;
      const px = cur.x + side * nx * off;
      const py = cur.y + side * ny * off;
      const wx = px,
        wz = -py;
      // Only accept where road is far (safety) and hills are low (valley)
      if (sampler.roadDistance(wx, wz) < 90) continue;
      const y = sampler.heightAt(wx, wz);
      // Ponds only in relatively low valleys
      if (y > -2) continue;
      pondsArr.push({ x: wx, y, z: wz, radius: 8 + hash2(a * 3, seedI) * 10 });
      if (pondsArr.length >= 3) break;
    }

    return { rocks: rocksArr, ponds: pondsArr };
  }, [samples, sampler]);

  return (
    <group>
      <Rocks rocks={rocks} />
      {ponds.map((p, i) => (
        <Pond key={i} pond={p} />
      ))}
    </group>
  );
}

function Rocks({
  rocks,
}: {
  rocks: Array<{ x: number; y: number; z: number; scale: number; rot: number }>;
}) {
  const geom = useMemo(() => {
    const g = new THREE.IcosahedronGeometry(1, 0);
    const pos = g.attributes.position as THREE.BufferAttribute;
    // Slight vertex jitter for irregular rock silhouette (deterministic per vertex)
    for (let i = 0; i < pos.count; i++) {
      const j = 1 + (hash2(i, 3) - 0.5) * 0.35;
      pos.setXYZ(i, pos.getX(i) * j, pos.getY(i) * j, pos.getZ(i) * j);
    }
    g.computeVertexNormals();
    return g;
  }, []);
  const mat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#8a8781", roughness: 0.95 }),
    [],
  );
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const d = new THREE.Object3D();
    rocks.forEach((r, i) => {
      d.position.set(r.x, r.y + r.scale * 0.3, r.z);
      d.rotation.set(0, r.rot, 0);
      d.scale.setScalar(r.scale);
      d.updateMatrix();
      ref.current?.setMatrixAt(i, d.matrix);
    });
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
  }, [rocks]);
  if (!rocks.length) return null;
  return <instancedMesh ref={ref} args={[geom, mat, rocks.length]} castShadow receiveShadow />;
}

function Pond({ pond }: { pond: { x: number; y: number; z: number; radius: number } }) {
  return (
    <group position={[pond.x, pond.y + 0.02, pond.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[pond.radius, 24]} />
        <meshStandardMaterial
          color="#2a5a7e"
          transparent
          opacity={0.85}
          roughness={0.15}
          metalness={0.35}
        />
      </mesh>
      {/* Rim: darker ring, slightly below water */}
      <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[pond.radius, pond.radius + 1.6, 24]} />
        <meshStandardMaterial color="#5c4a35" roughness={1} />
      </mesh>
    </group>
  );
}
