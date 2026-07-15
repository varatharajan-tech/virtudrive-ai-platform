import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Sky } from "@react-three/drei";
import type { PathSample } from "./store";
import { grassTexture, terrainBlendTexture, barkTexture, fbm, hash2 } from "./textures";

/**
 * SimEnvironment (Phase 3, modular):
 *  - Terrain             — displaced plane w/ blended terrain material
 *  - Vegetation          — multi-species instanced trees + bush clusters
 *  - RoadsideBarriers    — steel guard rails (instanced)
 *  - LightPoles          — periodic lamp poles along road
 *  - Buildings           — sparse maintenance/observation structures
 *
 * Sky + lighting kept from Phase 1 for consistency with prior phases.
 */
export function SimEnvironment({ samples }: { samples: PathSample[] }) {
  const bounds = useMemo(() => {
    if (!samples.length) return { min: -200, max: 200, cx: 0, cy: 0 };
    let minC = Infinity, maxC = -Infinity;
    for (const c of samples) { minC = Math.min(minC, c.x, c.y); maxC = Math.max(maxC, c.x, c.y); }
    return { min: minC - 500, max: maxC + 500, cx: (minC + maxC) / 2, cy: (minC + maxC) / 2 };
  }, [samples]);

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
        shadow-camera-left={-160}
        shadow-camera-right={160}
        shadow-camera-top={160}
        shadow-camera-bottom={-160}
        shadow-bias={-0.0005}
      />
      <Terrain bounds={bounds} samples={samples} />
      <Vegetation samples={samples} />
      <RoadsideBarriers samples={samples} />
      <LightPoles samples={samples} />
      <Buildings samples={samples} bounds={bounds} />
    </group>
  );
}

/* --------------------------------- Terrain -------------------------------- */

function Terrain({
  bounds,
  samples,
}: {
  bounds: { min: number; max: number; cx: number; cy: number };
  samples: PathSample[];
}) {
  const size = bounds.max - bounds.min;

  // Distance from any road sample squared → flatten near road so it never
  // pokes through the asphalt.
  const roadFlat = useMemo(() => {
    // Downsample samples for perf
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < samples.length; i += 4) pts.push([samples[i].x, samples[i].y]);
    return pts;
  }, [samples]);

  const geo = useMemo(() => {
    const seg = 96;
    const g = new THREE.PlaneGeometry(size, size, seg, seg);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    // Displace in world XY (plane is centered at origin after rotate).
    for (let i = 0; i < pos.count; i++) {
      const wx = pos.getX(i) + bounds.cx;
      const wy = -pos.getZ(i) + bounds.cy; // sim y (plane z is negated in world)
      // rolling hills
      let h =
        (fbm(wx * 0.006, wy * 0.006, 4) - 0.5) * 22 +
        (fbm(wx * 0.02 + 10, wy * 0.02 - 3, 3) - 0.5) * 3.5;
      // flatten near road
      let minD2 = Infinity;
      for (const [rx, ry] of roadFlat) {
        const dx = wx - rx, dy = wy - ry;
        const d2 = dx * dx + dy * dy;
        if (d2 < minD2) minD2 = d2;
        if (d2 < 100) break;
      }
      const d = Math.sqrt(minD2);
      const flatten = Math.min(1, Math.max(0, (d - 8) / 30));
      h *= flatten;
      pos.setY(i, h - 0.05);
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    return g;
  }, [size, bounds.cx, bounds.cy, roadFlat]);

  const mat = useMemo(() => {
    const map = terrainBlendTexture();
    map.repeat.set(size / 60, size / 60);
    // grass detail is subtle high-freq mix — reuse grass tex as roughness variation
    const grass = grassTexture();
    grass.repeat.set(size / 12, size / 12);
    return new THREE.MeshStandardMaterial({
      map,
      roughness: 1,
      metalness: 0,
    });
  }, [size]);

  return (
    <mesh
      geometry={geo}
      material={mat}
      position={[bounds.cx, 0, -bounds.cy]}
      receiveShadow
    />
  );
}

/* --------------------------------- Vegetation ------------------------------ */

interface TreeInstance {
  x: number; y: number; z: number; scale: number; rot: number; species: 0 | 1 | 2;
}
interface BushInstance { x: number; y: number; z: number; scale: number; rot: number; }

function Vegetation({ samples }: { samples: PathSample[] }) {
  const { trees, bushes } = useMemo(() => {
    const treeArr: TreeInstance[] = [];
    const bushArr: BushInstance[] = [];
    if (!samples.length) return { trees: treeArr, bushes: bushArr };
    for (let i = 0; i < samples.length; i += 4) {
      const cur = samples[i];
      const next = samples[Math.min(samples.length - 1, i + 1)];
      const dx = next.x - cur.x, dy = next.y - cur.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      for (let side = -1; side <= 1; side += 2) {
        // dense forest bands: 4 trees per step
        for (let k = 0; k < 4; k++) {
          const off = 12 + hash2(i * 7 + k * 3 + side, k) * 60;
          const jitterS = 0.7 + hash2(i * 3 + k, side * 11) * 1.1;
          const jitter = (hash2(i + k * 2, side * 3) - 0.5) * 6;
          const jx = cur.x + side * nx * off + jitter;
          const jy = cur.y + side * ny * off + jitter;
          const species = Math.floor(hash2(i * 13 + k, side) * 3) as 0 | 1 | 2;
          treeArr.push({ x: jx, y: cur.z, z: -jy, scale: jitterS, rot: hash2(i + k * 5, 7) * Math.PI * 2, species });
        }
        // bushes closer to road
        for (let b = 0; b < 3; b++) {
          const off = 7 + hash2(i * 5 + b, side * 2) * 4;
          const jx = cur.x + side * nx * off + (hash2(i + b, 2) - 0.5) * 2;
          const jy = cur.y + side * ny * off + (hash2(i - b, 3) - 0.5) * 2;
          bushArr.push({ x: jx, y: cur.z, z: -jy, scale: 0.4 + hash2(i, b) * 0.6, rot: hash2(i + b, 9) * Math.PI * 2 });
        }
      }
    }
    return { trees: treeArr, bushes: bushArr };
  }, [samples]);

  // Species: 0 = pine (cone), 1 = broadleaf (sphere), 2 = tall broadleaf
  const pineByType = useMemo(() => trees.filter((t) => t.species === 0), [trees]);
  const roundByType = useMemo(() => trees.filter((t) => t.species === 1), [trees]);
  const tallByType = useMemo(() => trees.filter((t) => t.species === 2), [trees]);

  const trunkGeom = useMemo(() => new THREE.CylinderGeometry(0.16, 0.24, 1.4, 8), []);
  const pineCanopy = useMemo(() => new THREE.ConeGeometry(1.2, 3.2, 10), []);
  const roundCanopy = useMemo(() => new THREE.SphereGeometry(1.4, 10, 8), []);
  const tallCanopy = useMemo(() => new THREE.SphereGeometry(1.1, 10, 8), []);

  const trunkMat = useMemo(() => new THREE.MeshStandardMaterial({
    map: barkTexture(), color: "#5a3922", roughness: 1,
  }), []);
  const pineMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#2f5a34", roughness: 0.92 }), []);
  const roundMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#3d7a3a", roughness: 0.9 }), []);
  const tallMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#4a8a4a", roughness: 0.9 }), []);
  const bushMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#456f38", roughness: 1 }), []);
  const bushGeom = useMemo(() => new THREE.SphereGeometry(0.6, 8, 6), []);

  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const pineRef = useRef<THREE.InstancedMesh>(null);
  const roundRef = useRef<THREE.InstancedMesh>(null);
  const tallRef = useRef<THREE.InstancedMesh>(null);
  const bushRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const d = new THREE.Object3D();
    if (trunkRef.current) {
      trees.forEach((t, i) => {
        d.position.set(t.x, t.y + 0.7 * t.scale, t.z);
        d.rotation.set(0, t.rot, 0);
        d.scale.setScalar(t.scale);
        d.updateMatrix();
        trunkRef.current!.setMatrixAt(i, d.matrix);
      });
      trunkRef.current.instanceMatrix.needsUpdate = true;
    }
    const applyCanopy = (
      ref: React.RefObject<THREE.InstancedMesh | null>,
      list: TreeInstance[],
      yOff: number,
    ) => {
      if (!ref.current) return;
      list.forEach((t, i) => {
        d.position.set(t.x, t.y + yOff * t.scale, t.z);
        d.rotation.set(0, t.rot, 0);
        d.scale.setScalar(t.scale);
        d.updateMatrix();
        ref.current!.setMatrixAt(i, d.matrix);
      });
      ref.current.instanceMatrix.needsUpdate = true;
    };
    applyCanopy(pineRef, pineByType, 2.6);
    applyCanopy(roundRef, roundByType, 2.4);
    applyCanopy(tallRef, tallByType, 2.9);

    if (bushRef.current) {
      bushes.forEach((b, i) => {
        d.position.set(b.x, b.y + 0.3 * b.scale, b.z);
        d.rotation.set(0, b.rot, 0);
        d.scale.setScalar(b.scale);
        d.updateMatrix();
        bushRef.current!.setMatrixAt(i, d.matrix);
      });
      bushRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [trees, bushes, pineByType, roundByType, tallByType]);

  return (
    <group>
      {trees.length > 0 && (
        <instancedMesh ref={trunkRef} args={[trunkGeom, trunkMat, trees.length]} castShadow />
      )}
      {pineByType.length > 0 && (
        <instancedMesh ref={pineRef} args={[pineCanopy, pineMat, pineByType.length]} castShadow />
      )}
      {roundByType.length > 0 && (
        <instancedMesh ref={roundRef} args={[roundCanopy, roundMat, roundByType.length]} castShadow />
      )}
      {tallByType.length > 0 && (
        <instancedMesh ref={tallRef} args={[tallCanopy, tallMat, tallByType.length]} castShadow />
      )}
      {bushes.length > 0 && (
        <instancedMesh ref={bushRef} args={[bushGeom, bushMat, bushes.length]} castShadow />
      )}
    </group>
  );
}

/* ---------------------------- Roadside Barriers --------------------------- */

function RoadsideBarriers({ samples }: { samples: PathSample[] }) {
  const barriers = useMemo(() => {
    const arr: Array<{ x: number; y: number; z: number; heading: number }> = [];
    for (let i = 0; i < samples.length - 1; i += 4) {
      const cur = samples[i];
      const next = samples[i + 1];
      const heading = Math.atan2(next.y - cur.y, next.x - cur.x);
      const nx = -Math.sin(heading), ny = Math.cos(heading);
      const off = 5.8;
      arr.push({ x: cur.x + nx * off, y: cur.z, z: -(cur.y + ny * off), heading });
      arr.push({ x: cur.x - nx * off, y: cur.z, z: -(cur.y - ny * off), heading });
    }
    return arr;
  }, [samples]);

  const geom = useMemo(() => new THREE.BoxGeometry(3, 0.55, 0.12), []);
  const mat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#c2c6cf", metalness: 0.6, roughness: 0.35 }), [],
  );
  const postGeom = useMemo(() => new THREE.CylinderGeometry(0.06, 0.06, 0.9, 6), []);
  const postMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#6b6f78", metalness: 0.5, roughness: 0.6 }), [],
  );
  const railRef = useRef<THREE.InstancedMesh>(null);
  const postRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const d = new THREE.Object3D();
    if (railRef.current) {
      barriers.forEach((b, i) => {
        d.position.set(b.x, b.y + 0.55, b.z);
        d.rotation.set(0, -b.heading, 0);
        d.updateMatrix();
        railRef.current!.setMatrixAt(i, d.matrix);
      });
      railRef.current.instanceMatrix.needsUpdate = true;
    }
    if (postRef.current) {
      barriers.forEach((b, i) => {
        d.position.set(b.x, b.y + 0.35, b.z);
        d.rotation.set(0, -b.heading, 0);
        d.updateMatrix();
        postRef.current!.setMatrixAt(i, d.matrix);
      });
      postRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [barriers]);

  if (!barriers.length) return null;
  return (
    <group>
      <instancedMesh ref={railRef} args={[geom, mat, barriers.length]} castShadow />
      <instancedMesh ref={postRef} args={[postGeom, postMat, barriers.length]} castShadow />
    </group>
  );
}

/* ------------------------------- Light Poles ------------------------------ */

function LightPoles({ samples }: { samples: PathSample[] }) {
  const poles = useMemo(() => {
    const arr: Array<{ x: number; y: number; z: number; heading: number; side: 1 | -1 }> = [];
    for (let i = 0; i < samples.length; i += 40) {
      const cur = samples[i];
      const next = samples[Math.min(samples.length - 1, i + 1)];
      const heading = Math.atan2(next.y - cur.y, next.x - cur.x);
      const nx = -Math.sin(heading), ny = Math.cos(heading);
      const side: 1 | -1 = (i % 80 === 0 ? 1 : -1);
      const off = 8.5;
      arr.push({ x: cur.x + side * nx * off, y: cur.z, z: -(cur.y + side * ny * off), heading, side });
    }
    return arr;
  }, [samples]);

  const poleGeom = useMemo(() => new THREE.CylinderGeometry(0.09, 0.11, 6.4, 8), []);
  const armGeom = useMemo(() => new THREE.BoxGeometry(2.6, 0.08, 0.08), []);
  const headGeom = useMemo(() => new THREE.BoxGeometry(0.9, 0.18, 0.35), []);
  const poleMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#3a3f47", metalness: 0.4, roughness: 0.6 }), [],
  );
  const headMat = useMemo(
    () => new THREE.MeshStandardMaterial({
      color: "#c9cfd6", emissive: "#ffeecc", emissiveIntensity: 0.35, roughness: 0.4,
    }), [],
  );

  const poleRef = useRef<THREE.InstancedMesh>(null);
  const armRef = useRef<THREE.InstancedMesh>(null);
  const headRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const d = new THREE.Object3D();
    if (poleRef.current) {
      poles.forEach((p, i) => {
        d.position.set(p.x, p.y + 3.2, p.z);
        d.rotation.set(0, -p.heading, 0);
        d.updateMatrix();
        poleRef.current!.setMatrixAt(i, d.matrix);
      });
      poleRef.current.instanceMatrix.needsUpdate = true;
    }
    if (armRef.current) {
      poles.forEach((p, i) => {
        const nx = -Math.sin(p.heading), ny = Math.cos(p.heading);
        d.position.set(p.x - p.side * nx * 1.3, p.y + 6.2, p.z - p.side * -ny * 1.3);
        d.rotation.set(0, -p.heading, 0);
        d.updateMatrix();
        armRef.current!.setMatrixAt(i, d.matrix);
      });
      armRef.current.instanceMatrix.needsUpdate = true;
    }
    if (headRef.current) {
      poles.forEach((p, i) => {
        const nx = -Math.sin(p.heading), ny = Math.cos(p.heading);
        d.position.set(p.x - p.side * nx * 2.4, p.y + 6.1, p.z - p.side * -ny * 2.4);
        d.rotation.set(0, -p.heading, 0);
        d.updateMatrix();
        headRef.current!.setMatrixAt(i, d.matrix);
      });
      headRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [poles]);

  if (!poles.length) return null;
  return (
    <group>
      <instancedMesh ref={poleRef} args={[poleGeom, poleMat, poles.length]} castShadow />
      <instancedMesh ref={armRef} args={[armGeom, poleMat, poles.length]} castShadow />
      <instancedMesh ref={headRef} args={[headGeom, headMat, poles.length]} />
    </group>
  );
}

/* -------------------------------- Buildings ------------------------------- */

function Buildings({
  samples,
  bounds,
}: {
  samples: PathSample[];
  bounds: { min: number; max: number; cx: number; cy: number };
}) {
  const items = useMemo(() => {
    if (samples.length < 4) return [] as Array<{
      x: number; z: number; y: number; kind: "garage" | "tower" | "shed"; rot: number;
    }>;
    // Deterministic sparse placement: pick 6 samples roughly evenly spaced,
    // set building far off to the side on shoulder-outer.
    const arr: Array<{ x: number; z: number; y: number; kind: "garage" | "tower" | "shed"; rot: number }> = [];
    const step = Math.max(1, Math.floor(samples.length / 6));
    let k = 0;
    for (let i = step; i < samples.length; i += step) {
      const cur = samples[i];
      const next = samples[Math.min(samples.length - 1, i + 1)];
      const heading = Math.atan2(next.y - cur.y, next.x - cur.x);
      const nx = -Math.sin(heading), ny = Math.cos(heading);
      const side = k % 2 === 0 ? 1 : -1;
      const off = 90 + hash2(i, k) * 40;
      const kinds: Array<"garage" | "tower" | "shed"> = ["garage", "tower", "shed"];
      const kind = kinds[k % kinds.length];
      arr.push({
        x: cur.x + side * nx * off,
        y: -(cur.y + side * ny * off),
        z: cur.z,
        kind,
        rot: heading,
      });
      k++;
    }
    return arr;
    // bounds is only used for future expansion (parking, fences)
  }, [samples, bounds]);

  if (!items.length) return null;
  return (
    <group>
      {items.map((b, i) => (
        <group key={i} position={[b.x, b.z, b.y]} rotation={[0, -b.rot, 0]}>
          {b.kind === "garage" && (
            <>
              <mesh position={[0, 2.2, 0]} castShadow receiveShadow>
                <boxGeometry args={[14, 4.4, 8]} />
                <meshStandardMaterial color="#a4a8ad" roughness={0.85} />
              </mesh>
              <mesh position={[0, 4.7, 0]} castShadow>
                <boxGeometry args={[14.4, 0.4, 8.4]} />
                <meshStandardMaterial color="#3a3f47" roughness={0.9} />
              </mesh>
              <mesh position={[0, 1.5, 4.05]}>
                <planeGeometry args={[4, 3]} />
                <meshStandardMaterial color="#22262d" roughness={0.6} />
              </mesh>
            </>
          )}
          {b.kind === "tower" && (
            <>
              <mesh position={[0, 3, 0]} castShadow receiveShadow>
                <cylinderGeometry args={[1.2, 1.4, 6, 10]} />
                <meshStandardMaterial color="#dcdfe4" roughness={0.7} />
              </mesh>
              <mesh position={[0, 6.4, 0]} castShadow>
                <cylinderGeometry args={[2.4, 2.4, 1.4, 12]} />
                <meshStandardMaterial color="#22262d" roughness={0.6} />
              </mesh>
              <mesh position={[0, 6.4, 0]}>
                <cylinderGeometry args={[2.35, 2.35, 0.9, 12, 1, true]} />
                <meshStandardMaterial
                  color="#5a8ec2" transparent opacity={0.55} roughness={0.15}
                  metalness={0.2} side={THREE.DoubleSide}
                />
              </mesh>
            </>
          )}
          {b.kind === "shed" && (
            <mesh position={[0, 1.2, 0]} castShadow receiveShadow>
              <boxGeometry args={[6, 2.4, 4]} />
              <meshStandardMaterial color="#7c6a4d" roughness={0.95} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}
