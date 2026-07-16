import { useLayoutEffect, useMemo, useRef, useCallback } from "react";
import * as THREE from "three";
import { Sky, Cloud, Clouds } from "@react-three/drei";
import type { PathSample } from "./store";
import { grassTexture, terrainBlendTexture, barkTexture, hash2 } from "./textures";
import { LodInstancedMesh } from "./lod";
import { createTerrainSampler, hillHeight, type TerrainSampler } from "./terrain-height";

/**
 * SimEnvironment — road ↔ terrain integration owner.
 *
 * The sampler is built once from the road samples and used by:
 *   - TerrainSurface  (vertex Y comes from sampler.heightAt)
 *   - GrassTufts / Vegetation / Buildings (placement Y comes from sampler.heightAt)
 *   - DistantHorizon  (hillOnly, no road influence)
 *
 * Because the terrain and every placed prop share one height function, the
 * road is embedded in a smooth 10 m roadbed + 50 m embankment corridor — no
 * floating road, no clipping, no floating trees/grass.
 */
export function SimEnvironment({ samples }: { samples: PathSample[] }) {
  const sampler = useMemo(() => createTerrainSampler(samples), [samples]);

  // Sim-space centre (used for Sky/Cloud/Mountain placement so their pivots
  // sit above the middle of the road region). world_x = sim.x, world_z = -sim.y.
  const centre = useMemo(() => {
    if (!samples.length) return { cxSim: 0, cySim: 0 };
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const s of samples) {
      if (s.x < minX) minX = s.x;
      if (s.x > maxX) maxX = s.x;
      if (s.y < minY) minY = s.y;
      if (s.y > maxY) maxY = s.y;
    }
    return { cxSim: (minX + maxX) / 2, cySim: (minY + maxY) / 2 };
  }, [samples]);
  const cx = centre.cxSim;
  const cy = centre.cySim; // sim y; world z = -cy

  return (
    <group>
      <Sky
        sunPosition={[80, 30, 20]}
        turbidity={3}
        rayleigh={1.4}
        mieCoefficient={0.005}
        mieDirectionalG={0.85}
      />
      <Clouds material={THREE.MeshBasicMaterial} limit={40}>
        <Cloud
          seed={1}
          segments={30}
          bounds={[220, 8, 220]}
          volume={80}
          position={[cx, 140, -cy - 200]}
          color="#ffffff"
          opacity={0.55}
        />
        <Cloud
          seed={4}
          segments={26}
          bounds={[180, 6, 180]}
          volume={60}
          position={[cx + 260, 165, -cy + 180]}
          color="#f4f7fb"
          opacity={0.45}
        />
        <Cloud
          seed={7}
          segments={24}
          bounds={[160, 5, 160]}
          volume={55}
          position={[cx - 300, 155, -cy - 60]}
          color="#eef2f8"
          opacity={0.4}
        />
      </Clouds>
      <DistantHorizon centreX={cx} centreZ={-cy} />
      <hemisphereLight args={["#cfe0f5", "#3a4a2a", 0.7]} />
      <ambientLight intensity={0.28} />
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
      <TerrainSurface sampler={sampler} />
      <GrassTufts samples={samples} sampler={sampler} />
      <Vegetation samples={samples} sampler={sampler} />
      <RoadsideBarriers samples={samples} />
      <DelineatorPosts samples={samples} />
      <LightPoles samples={samples} />
      <Buildings samples={samples} sampler={sampler} />
    </group>
  );
}

/* ------------------------------ Distant Horizon --------------------------- */
/**
 * Two-band mountain ring, both bands anchored at ground level (Y = 0) rather
 * than the old "float at Y=40" cylinder. Bottom of each band sits below the
 * terrain so no straight vertical seam is ever visible. Fog is disabled on
 * these materials so scene fog doesn't clip the far half of the ring into
 * the "wall" the user reported.
 *
 * Near band (dark ridge)  : R ≈ 1050, ridge amplitude ~90 m
 * Far band  (hazy silhouette): R ≈ 1750, ridge amplitude ~140 m, softer colour
 */
function DistantHorizon({ centreX, centreZ }: { centreX: number; centreZ: number }) {
  const bands = useMemo(() => {
    const build = (R: number, ampA: number, ampB: number, colour: string, seed: number) => {
      const segs = 180;
      // Tall cylinder — bottom is buried well below any terrain we generate.
      const g = new THREE.CylinderGeometry(R, R, 260, segs, 1, true);
      const pos = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        if (y <= 0) continue; // only lift the top ring into a ridge
        const x = pos.getX(i),
          z = pos.getZ(i);
        const ang = Math.atan2(z, x);
        // deterministic per-band ridge profile
        const ridge =
          Math.abs(Math.sin(ang * 5 + seed)) * ampA +
          Math.abs(Math.sin(ang * 11 + seed * 2 + 0.7)) * ampB;
        pos.setY(i, y + ridge);
      }
      pos.needsUpdate = true;
      g.computeVertexNormals();
      const m = new THREE.MeshBasicMaterial({
        color: colour,
        side: THREE.BackSide,
        fog: false, // don't let scene fog swallow the ring
        depthWrite: false,
      });
      return { geo: g, mat: m };
    };
    return {
      near: build(1050, 70, 22, "#6f8aa2", 0.3),
      far: build(1750, 110, 32, "#a6b6c8", 1.9),
    };
  }, []);

  // Bury the bottom of the cylinders well below terrain (Y = -110) so the
  // vertical side quads never emerge as a visible wall.
  return (
    <group>
      <mesh
        geometry={bands.far.geo}
        material={bands.far.mat}
        position={[centreX, -110, centreZ]}
        renderOrder={-2}
      />
      <mesh
        geometry={bands.near.geo}
        material={bands.near.mat}
        position={[centreX, -110, centreZ]}
        renderOrder={-1}
      />
    </group>
  );
}

/* --------------------------------- Terrain -------------------------------- */
/**
 * Single high-res displaced plane driven by the shared height sampler.
 *
 * Resolution:
 *   Spacing target = 4.5 m per segment (fine enough to seat an 8 m road
 *   corridor with a 50 m embankment). Segs clamped to [140, 320] so we never
 *   go below usable fidelity or blow past ~100k vertices.
 *
 * Texture repeat is deliberately low-frequency to avoid the previous ~15×
 * tile pattern; the terrainBlendTexture is fBm-based so seams read as
 * organic colour variation rather than a grid.
 */
function TerrainSurface({ sampler }: { sampler: TerrainSampler }) {
  const { bounds } = sampler;

  const geo = useMemo(() => {
    const spacing = 4.5;
    const segX = THREE.MathUtils.clamp(Math.round(bounds.sizeX / spacing), 140, 320);
    const segZ = THREE.MathUtils.clamp(Math.round(bounds.sizeZ / spacing), 140, 320);
    const g = new THREE.PlaneGeometry(bounds.sizeX, bounds.sizeZ, segX, segZ);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    // Plane is centred at (0,0,0) after rotate; translate into world XZ
    // by adding the terrain centre. Y comes straight from the sampler,
    // so the road corridor is baked into the geometry.
    for (let i = 0; i < pos.count; i++) {
      const wx = pos.getX(i) + bounds.cx;
      const wz = pos.getZ(i) + bounds.cz;
      pos.setY(i, sampler.heightAt(wx, wz));
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    return g;
  }, [sampler, bounds]);

  const mat = useMemo(() => {
    const map = terrainBlendTexture();
    // Big organic tile (~200 m) — repeats but reads as natural colour drift.
    map.repeat.set(bounds.sizeX / 220, bounds.sizeZ / 220);
    // Kept for future roughness variation; not currently used but retains
    // the cached texture warm.
    const grass = grassTexture();
    grass.repeat.set(bounds.sizeX / 90, bounds.sizeZ / 90);
    return new THREE.MeshStandardMaterial({
      map,
      color: "#7d8a5c",
      roughness: 1,
      metalness: 0,
    });
  }, [bounds.sizeX, bounds.sizeZ]);

  return <mesh geometry={geo} material={mat} position={[bounds.cx, 0, bounds.cz]} receiveShadow />;
}

/* --------------------------------- Vegetation ------------------------------ */

interface TreeInstance {
  x: number;
  y: number;
  z: number;
  scale: number;
  rot: number;
  species: 0 | 1 | 2;
}
interface BushInstance {
  x: number;
  y: number;
  z: number;
  scale: number;
  rot: number;
}

function Vegetation({ samples, sampler }: { samples: PathSample[]; sampler: TerrainSampler }) {
  const { trees, bushes } = useMemo(() => {
    const treeArr: TreeInstance[] = [];
    const bushArr: BushInstance[] = [];
    if (!samples.length) return { trees: treeArr, bushes: bushArr };
    for (let i = 0; i < samples.length; i += 4) {
      const cur = samples[i];
      const next = samples[Math.min(samples.length - 1, i + 1)];
      const dx = next.x - cur.x,
        dy = next.y - cur.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len,
        ny = dx / len;
      for (let side = -1; side <= 1; side += 2) {
        // dense forest bands: 4 trees per step
        for (let k = 0; k < 4; k++) {
          const off = 12 + hash2(i * 7 + k * 3 + side, k) * 60;
          const jitterS = 0.7 + hash2(i * 3 + k, side * 11) * 1.1;
          const jitter = (hash2(i + k * 2, side * 3) - 0.5) * 6;
          const jx = cur.x + side * nx * off + jitter;
          const jy = cur.y + side * ny * off + jitter;
          const worldX = jx,
            worldZ = -jy;
          const groundY = sampler.heightAt(worldX, worldZ);
          const species = Math.floor(hash2(i * 13 + k, side) * 3) as 0 | 1 | 2;
          treeArr.push({
            x: worldX,
            y: groundY,
            z: worldZ,
            scale: jitterS,
            rot: hash2(i + k * 5, 7) * Math.PI * 2,
            species,
          });
        }
        // bushes closer to road
        for (let b = 0; b < 3; b++) {
          const off = 7 + hash2(i * 5 + b, side * 2) * 4;
          const jx = cur.x + side * nx * off + (hash2(i + b, 2) - 0.5) * 2;
          const jy = cur.y + side * ny * off + (hash2(i - b, 3) - 0.5) * 2;
          const worldX = jx,
            worldZ = -jy;
          const groundY = sampler.heightAt(worldX, worldZ);
          bushArr.push({
            x: worldX,
            y: groundY,
            z: worldZ,
            scale: 0.4 + hash2(i, b) * 0.6,
            rot: hash2(i + b, 9) * Math.PI * 2,
          });
        }
      }
    }
    return { trees: treeArr, bushes: bushArr };
  }, [samples, sampler]);

  // Species: 0 = pine (cone), 1 = broadleaf (sphere), 2 = tall broadleaf
  const pineByType = useMemo(() => trees.filter((t) => t.species === 0), [trees]);
  const roundByType = useMemo(() => trees.filter((t) => t.species === 1), [trees]);
  const tallByType = useMemo(() => trees.filter((t) => t.species === 2), [trees]);

  const trunkGeom = useMemo(() => new THREE.CylinderGeometry(0.16, 0.24, 1.4, 8), []);
  const pineCanopy = useMemo(() => new THREE.ConeGeometry(1.2, 3.2, 10), []);
  const roundCanopy = useMemo(() => new THREE.SphereGeometry(1.4, 10, 8), []);
  const tallCanopy = useMemo(() => new THREE.SphereGeometry(1.1, 10, 8), []);

  const trunkMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: barkTexture(),
        color: "#5a3922",
        roughness: 1,
      }),
    [],
  );
  const pineMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#2f5a34", roughness: 0.92 }),
    [],
  );
  const roundMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#3d7a3a", roughness: 0.9 }),
    [],
  );
  const tallMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#4a8a4a", roughness: 0.9 }),
    [],
  );
  const bushMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#456f38", roughness: 1 }),
    [],
  );
  const bushGeom = useMemo(() => new THREE.SphereGeometry(0.6, 8, 6), []);

  // Build callbacks are stable per-instance transforms — LodInstancedMesh
  // caches the resulting matrix and only swaps to a hidden matrix past farDist.
  const buildTrunk = useCallback((d: THREE.Object3D, t: TreeInstance) => {
    d.position.set(t.x, t.y + 0.7 * t.scale, t.z);
    d.rotation.set(0, t.rot, 0);
    d.scale.setScalar(t.scale);
  }, []);
  const buildCanopyFactory = useCallback(
    (yOff: number) => (d: THREE.Object3D, t: TreeInstance) => {
      d.position.set(t.x, t.y + yOff * t.scale, t.z);
      d.rotation.set(0, t.rot, 0);
      d.scale.setScalar(t.scale);
    },
    [],
  );
  const buildPine = useMemo(() => buildCanopyFactory(2.6), [buildCanopyFactory]);
  const buildRound = useMemo(() => buildCanopyFactory(2.4), [buildCanopyFactory]);
  const buildTall = useMemo(() => buildCanopyFactory(2.9), [buildCanopyFactory]);
  const buildBush = useCallback((d: THREE.Object3D, b: BushInstance) => {
    d.position.set(b.x, b.y + 0.3 * b.scale, b.z);
    d.rotation.set(0, b.rot, 0);
    d.scale.setScalar(b.scale);
  }, []);
  const treePos = useCallback((t: TreeInstance) => [t.x, t.y, t.z] as const, []);
  const bushPos = useCallback((b: BushInstance) => [b.x, b.y, b.z] as const, []);

  // LOD tiers (metres): shadow ring / cull ring.
  //   Trees   : shadow within 120m, drawn within 340m
  //   Bushes  : shadow within 55m,  drawn within 160m
  return (
    <group>
      {trees.length > 0 && (
        <LodInstancedMesh
          instances={trees}
          geom={trunkGeom}
          mat={trunkMat}
          build={buildTrunk}
          posOf={treePos}
          nearDist={120}
          farDist={340}
          castShadow
        />
      )}
      {pineByType.length > 0 && (
        <LodInstancedMesh
          instances={pineByType}
          geom={pineCanopy}
          mat={pineMat}
          build={buildPine}
          posOf={treePos}
          nearDist={120}
          farDist={340}
          castShadow
        />
      )}
      {roundByType.length > 0 && (
        <LodInstancedMesh
          instances={roundByType}
          geom={roundCanopy}
          mat={roundMat}
          build={buildRound}
          posOf={treePos}
          nearDist={120}
          farDist={340}
          castShadow
        />
      )}
      {tallByType.length > 0 && (
        <LodInstancedMesh
          instances={tallByType}
          geom={tallCanopy}
          mat={tallMat}
          build={buildTall}
          posOf={treePos}
          nearDist={120}
          farDist={340}
          castShadow
        />
      )}
      {bushes.length > 0 && (
        <LodInstancedMesh
          instances={bushes}
          geom={bushGeom}
          mat={bushMat}
          build={buildBush}
          posOf={bushPos}
          nearDist={55}
          farDist={160}
          castShadow
        />
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
      const nx = -Math.sin(heading),
        ny = Math.cos(heading);
      const off = 5.8;
      arr.push({ x: cur.x + nx * off, y: cur.z, z: -(cur.y + ny * off), heading });
      arr.push({ x: cur.x - nx * off, y: cur.z, z: -(cur.y - ny * off), heading });
    }
    return arr;
  }, [samples]);

  const geom = useMemo(() => new THREE.BoxGeometry(3, 0.55, 0.12), []);
  const mat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#c2c6cf", metalness: 0.6, roughness: 0.35 }),
    [],
  );
  const postGeom = useMemo(() => new THREE.CylinderGeometry(0.06, 0.06, 0.9, 6), []);
  const postMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#6b6f78", metalness: 0.5, roughness: 0.6 }),
    [],
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
      const nx = -Math.sin(heading),
        ny = Math.cos(heading);
      const side: 1 | -1 = i % 80 === 0 ? 1 : -1;
      const off = 8.5;
      arr.push({
        x: cur.x + side * nx * off,
        y: cur.z,
        z: -(cur.y + side * ny * off),
        heading,
        side,
      });
    }
    return arr;
  }, [samples]);

  const poleGeom = useMemo(() => new THREE.CylinderGeometry(0.09, 0.11, 6.4, 8), []);
  const armGeom = useMemo(() => new THREE.BoxGeometry(2.6, 0.08, 0.08), []);
  const headGeom = useMemo(() => new THREE.BoxGeometry(0.9, 0.18, 0.35), []);
  const poleMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#3a3f47", metalness: 0.4, roughness: 0.6 }),
    [],
  );
  const headMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#c9cfd6",
        emissive: "#ffeecc",
        emissiveIntensity: 0.35,
        roughness: 0.4,
      }),
    [],
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
        const nx = -Math.sin(p.heading),
          ny = Math.cos(p.heading);
        d.position.set(p.x - p.side * nx * 1.3, p.y + 6.2, p.z - p.side * -ny * 1.3);
        d.rotation.set(0, -p.heading, 0);
        d.updateMatrix();
        armRef.current!.setMatrixAt(i, d.matrix);
      });
      armRef.current.instanceMatrix.needsUpdate = true;
    }
    if (headRef.current) {
      poles.forEach((p, i) => {
        const nx = -Math.sin(p.heading),
          ny = Math.cos(p.heading);
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

function Buildings({ samples, sampler }: { samples: PathSample[]; sampler: TerrainSampler }) {
  const items = useMemo(() => {
    if (samples.length < 4)
      return [] as Array<{
        x: number;
        z: number;
        y: number;
        kind: "garage" | "tower" | "shed";
        rot: number;
      }>;
    // Deterministic sparse placement: pick 6 samples roughly evenly spaced,
    // set building far off to the side on shoulder-outer. Ground Y comes
    // from the shared height sampler so buildings sit on the hills.
    const arr: Array<{
      x: number;
      z: number;
      y: number;
      kind: "garage" | "tower" | "shed";
      rot: number;
    }> = [];
    const step = Math.max(1, Math.floor(samples.length / 6));
    let k = 0;
    for (let i = step; i < samples.length; i += step) {
      const cur = samples[i];
      const next = samples[Math.min(samples.length - 1, i + 1)];
      const heading = Math.atan2(next.y - cur.y, next.x - cur.x);
      const nx = -Math.sin(heading),
        ny = Math.cos(heading);
      const side = k % 2 === 0 ? 1 : -1;
      const off = 90 + hash2(i, k) * 40;
      const kinds: Array<"garage" | "tower" | "shed"> = ["garage", "tower", "shed"];
      const kind = kinds[k % kinds.length];
      const worldX = cur.x + side * nx * off;
      const worldZ = -(cur.y + side * ny * off);
      arr.push({
        x: worldX,
        y: worldZ,
        z: sampler.heightAt(worldX, worldZ),
        kind,
        rot: heading,
      });
      k++;
    }
    return arr;
  }, [samples, sampler]);

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
                  color="#5a8ec2"
                  transparent
                  opacity={0.55}
                  roughness={0.15}
                  metalness={0.2}
                  side={THREE.DoubleSide}
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

/* ------------------------------ Grass Tufts ------------------------------- */

function GrassTufts({ samples, sampler }: { samples: PathSample[]; sampler: TerrainSampler }) {
  const tufts = useMemo(() => {
    const arr: Array<{ x: number; y: number; z: number; rot: number; scale: number }> = [];
    if (!samples.length) return arr;
    for (let i = 0; i < samples.length; i += 2) {
      const cur = samples[i];
      const next = samples[Math.min(samples.length - 1, i + 1)];
      const dx = next.x - cur.x,
        dy = next.y - cur.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len,
        ny = dx / len;
      for (let side = -1; side <= 1; side += 2) {
        for (let k = 0; k < 6; k++) {
          const off = 6 + hash2(i * 5 + k, side * 3) * 22;
          const jx = cur.x + side * nx * off + (hash2(i + k, side) - 0.5) * 3;
          const jy = cur.y + side * ny * off + (hash2(i - k, side) - 0.5) * 3;
          const worldX = jx,
            worldZ = -jy;
          arr.push({
            x: worldX,
            z: worldZ,
            y: sampler.heightAt(worldX, worldZ),
            rot: hash2(i + k, 11) * Math.PI * 2,
            scale: 0.6 + hash2(i + k, 5) * 0.9,
          });
        }
      }
    }
    return arr;
  }, [samples, sampler]);

  const geom = useMemo(() => {
    // Cross-billboard: two crossed vertical quads with alpha
    const g = new THREE.BufferGeometry();
    const w = 0.7,
      h = 0.5;
    const verts = new Float32Array([
      -w,
      0,
      0,
      w,
      0,
      0,
      w,
      h,
      0,
      -w,
      0,
      0,
      w,
      h,
      0,
      -w,
      h,
      0,
      0,
      0,
      -w,
      0,
      0,
      w,
      0,
      h,
      w,
      0,
      0,
      -w,
      0,
      h,
      w,
      0,
      h,
      -w,
    ]);
    const uvs = new Float32Array([
      0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1,
    ]);
    g.setAttribute("position", new THREE.BufferAttribute(verts, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    g.computeVertexNormals();
    return g;
  }, []);

  const mat = useMemo(() => {
    // procedural grass-tuft alpha texture
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, 64, 64);
    for (let i = 0; i < 22; i++) {
      const x = 8 + Math.random() * 48;
      const bh = 30 + Math.random() * 30;
      const shade = 60 + Math.floor(Math.random() * 60);
      ctx.strokeStyle = `rgba(${Math.floor(shade * 0.6)}, ${shade + 30}, ${Math.floor(shade * 0.55)}, 0.95)`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x, 64);
      ctx.quadraticCurveTo(
        x + (Math.random() - 0.5) * 6,
        64 - bh / 2,
        x + (Math.random() - 0.5) * 8,
        64 - bh,
      );
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.35,
      side: THREE.DoubleSide,
      roughness: 1,
      metalness: 0,
      depthWrite: false,
    });
  }, []);

  const buildTuft = useCallback(
    (d: THREE.Object3D, t: { x: number; y: number; z: number; rot: number; scale: number }) => {
      d.position.set(t.x, t.y, t.z);
      d.rotation.set(0, t.rot, 0);
      d.scale.setScalar(t.scale);
    },
    [],
  );
  const tuftPos = useCallback(
    (t: { x: number; y: number; z: number }) => [t.x, t.y, t.z] as const,
    [],
  );

  if (!tufts.length) return null;
  // Grass tufts are transparent billboards — aggressive cull at 75m keeps
  // overdraw + alpha-test cost bounded when the camera drives away.
  return (
    <LodInstancedMesh
      instances={tufts}
      geom={geom}
      mat={mat}
      build={buildTuft}
      posOf={tuftPos}
      farDist={75}
      frustumCulled={false}
      intervalMs={120}
    />
  );
}

/* ---------------------------- Delineator Posts ---------------------------- */

function DelineatorPosts({ samples }: { samples: PathSample[] }) {
  const posts = useMemo(() => {
    const arr: Array<{ x: number; y: number; z: number; heading: number }> = [];
    for (let i = 0; i < samples.length - 1; i += 6) {
      const cur = samples[i];
      const next = samples[i + 1];
      const heading = Math.atan2(next.y - cur.y, next.x - cur.x);
      const nx = -Math.sin(heading),
        ny = Math.cos(heading);
      const off = 5.2;
      arr.push({ x: cur.x + nx * off, y: cur.z, z: -(cur.y + ny * off), heading });
      arr.push({ x: cur.x - nx * off, y: cur.z, z: -(cur.y - ny * off), heading });
    }
    return arr;
  }, [samples]);

  const postGeom = useMemo(() => new THREE.BoxGeometry(0.08, 0.9, 0.08), []);
  const postMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#f4f6f8", roughness: 0.75 }),
    [],
  );
  const reflGeom = useMemo(() => new THREE.BoxGeometry(0.1, 0.14, 0.02), []);
  const reflMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#ff2a1a",
        emissive: "#ff5a3a",
        emissiveIntensity: 0.45,
        roughness: 0.4,
      }),
    [],
  );

  const postRef = useRef<THREE.InstancedMesh>(null);
  const reflRef = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const d = new THREE.Object3D();
    if (postRef.current) {
      posts.forEach((p, i) => {
        d.position.set(p.x, p.y + 0.45, p.z);
        d.rotation.set(0, -p.heading, 0);
        d.scale.setScalar(1);
        d.updateMatrix();
        postRef.current!.setMatrixAt(i, d.matrix);
      });
      postRef.current.instanceMatrix.needsUpdate = true;
    }
    if (reflRef.current) {
      posts.forEach((p, i) => {
        d.position.set(p.x, p.y + 0.78, p.z);
        d.rotation.set(0, -p.heading, 0);
        d.scale.setScalar(1);
        d.updateMatrix();
        reflRef.current!.setMatrixAt(i, d.matrix);
      });
      reflRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [posts]);

  if (!posts.length) return null;
  return (
    <group>
      <instancedMesh ref={postRef} args={[postGeom, postMat, posts.length]} castShadow />
      <instancedMesh ref={reflRef} args={[reflGeom, reflMat, posts.length]} />
    </group>
  );
}
