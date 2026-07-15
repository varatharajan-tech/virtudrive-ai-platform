import { useMemo } from "react";
import * as THREE from "three";
import type { PathSample } from "./store";
import { asphaltTexture, asphaltNormalTexture } from "./textures";

/**
 * Road ribbon built from Catmull-Rom-subdivided sample path.
 * Includes: PBR asphalt with tiled normal/albedo, paved shoulders,
 * solid edge lines (mesh strips), dashed centre line, start/finish markers.
 */
export function Road({ samples, width = 8 }: { samples: PathSample[]; width?: number }) {
  const geo = useMemo(() => {
    if (samples.length < 2)
      return null as null | {
        asphalt: THREE.BufferGeometry;
        shoulder: THREE.BufferGeometry;
        leftLine: THREE.BufferGeometry;
        rightLine: THREE.BufferGeometry;
        dashes: Array<{ pos: [number, number, number]; heading: number }>;
      };

    // Subdivide via Catmull-Rom for smooth curves
    const raw = samples.map((s) => new THREE.Vector3(s.x, s.z, s.y));
    const curve = new THREE.CatmullRomCurve3(raw, false, "catmullrom", 0.5);
    const subCount = Math.max(samples.length * 3, 200);
    const pts = curve.getPoints(subCount);

    const halfW = width / 2;
    const shoulderW = width / 2 + 1.6;
    const asphaltPos: number[] = [];
    const asphaltUv: number[] = [];
    const asphaltIdx: number[] = [];
    const shoulderPos: number[] = [];
    const shoulderIdx: number[] = [];
    const leftPos: number[] = [];
    const leftIdx: number[] = [];
    const rightPos: number[] = [];
    const rightIdx: number[] = [];
    const dashes: Array<{ pos: [number, number, number]; heading: number }> = [];

    let uAcc = 0;
    for (let i = 0; i < pts.length; i++) {
      const cur = pts[i];
      const nxt = pts[Math.min(i + 1, pts.length - 1)];
      const dx = nxt.x - cur.x;
      const dz = nxt.z - cur.z;
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len;
      const nz = dx / len; // left normal in XZ (sim y == world z here — sample z is elevation stored in y comp of vec)
      const elev = cur.y + 0.02;

      // asphalt vertices
      const lxA = cur.x + nx * halfW;
      const lzA = cur.z + nz * halfW;
      const rxA = cur.x - nx * halfW;
      const rzA = cur.z - nz * halfW;
      asphaltPos.push(lxA, elev, -lzA, rxA, elev, -rzA);
      asphaltUv.push(0, uAcc * 0.15, 1, uAcc * 0.15);

      // shoulder vertices (wider strip, slightly lower)
      const lxS = cur.x + nx * shoulderW;
      const lzS = cur.z + nz * shoulderW;
      const rxS = cur.x - nx * shoulderW;
      const rzS = cur.z - nz * shoulderW;
      shoulderPos.push(lxS, elev - 0.005, -lzS, rxS, elev - 0.005, -rzS);

      // edge line strips (thin quads flush with asphalt)
      const lineW = 0.15;
      const lxL1 = cur.x + nx * (halfW - lineW / 2);
      const lzL1 = cur.z + nz * (halfW - lineW / 2);
      const lxL2 = cur.x + nx * (halfW + lineW / 2);
      const lzL2 = cur.z + nz * (halfW + lineW / 2);
      leftPos.push(lxL1, elev + 0.008, -lzL1, lxL2, elev + 0.008, -lzL2);

      const rxL1 = cur.x - nx * (halfW - lineW / 2);
      const rzL1 = cur.z - nz * (halfW - lineW / 2);
      const rxL2 = cur.x - nx * (halfW + lineW / 2);
      const rzL2 = cur.z - nz * (halfW + lineW / 2);
      rightPos.push(rxL1, elev + 0.008, -rzL1, rxL2, elev + 0.008, -rzL2);

      if (i < pts.length - 1) {
        const a = i * 2;
        asphaltIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        shoulderIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        leftIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        rightIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      uAcc += len;

      // dashes ~ every 6m
      if (i % 8 === 0) {
        dashes.push({
          pos: [cur.x, elev + 0.012, -cur.z],
          heading: Math.atan2(dz, dx),
        });
      }
    }

    const buildIndexed = (pos: number[], idx: number[], uv?: number[]) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      if (uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    };

    return {
      asphalt: buildIndexed(asphaltPos, asphaltIdx, asphaltUv),
      shoulder: buildIndexed(shoulderPos, shoulderIdx),
      leftLine: buildIndexed(leftPos, leftIdx),
      rightLine: buildIndexed(rightPos, rightIdx),
      dashes,
    };
  }, [samples, width]);

  const asphaltMat = useMemo(() => {
    const map = asphaltTexture();
    const nrm = asphaltNormalTexture();
    map.repeat.set(1, 1);
    nrm.repeat.set(1, 1);
    return new THREE.MeshStandardMaterial({
      map,
      normalMap: nrm,
      normalScale: new THREE.Vector2(0.6, 0.6),
      roughness: 0.85,
      metalness: 0.05,
      color: "#4a4e56",
    });
  }, []);
  const shoulderMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#3a2f24", roughness: 1 }),
    [],
  );
  const lineMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: "#f4f4f4" }),
    [],
  );
  const dashMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: "#ffd54a" }),
    [],
  );

  if (!geo) return null;
  const first = samples[0];
  const last = samples[samples.length - 1];

  return (
    <group>
      <mesh geometry={geo.shoulder} material={shoulderMat} receiveShadow />
      <mesh geometry={geo.asphalt} material={asphaltMat} receiveShadow />
      <mesh geometry={geo.leftLine} material={lineMat} />
      <mesh geometry={geo.rightLine} material={lineMat} />
      {geo.dashes.map((d, i) => (
        <mesh key={i} position={d.pos} rotation={[-Math.PI / 2, 0, -d.heading]} material={dashMat}>
          <planeGeometry args={[2.4, 0.18]} />
        </mesh>
      ))}
      <mesh position={[first.x, first.z + 0.03, -first.y]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1, 2.8, 32]} />
        <meshBasicMaterial color="#22c55e" side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[last.x, last.z + 0.03, -last.y]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1, 2.8, 32]} />
        <meshBasicMaterial color="#ef4444" side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
