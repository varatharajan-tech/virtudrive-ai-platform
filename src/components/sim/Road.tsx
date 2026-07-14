import { useMemo } from "react";
import * as THREE from "three";
import type { PathSample } from "./store";

/**
 * Road ribbon built from sample path (x, y, elevation z).
 * Includes: asphalt strip, dashed centre line, solid edge lines, start/finish markers.
 */
export function Road({ samples, width = 8 }: { samples: PathSample[]; width?: number }) {
  const { asphalt, edges, dashes } = useMemo(() => {
    if (samples.length < 2) return { asphalt: null, edges: null, dashes: [] as [number, number, number][] };

    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const leftEdge: THREE.Vector3[] = [];
    const rightEdge: THREE.Vector3[] = [];
    const dashPts: [number, number, number][] = [];

    let uAccum = 0;
    for (let i = 0; i < samples.length; i++) {
      const cur = samples[i];
      const next = samples[Math.min(i + 1, samples.length - 1)];
      const dx = next.x - cur.x;
      const dy = next.y - cur.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len; // left normal in sim plane
      const lx = cur.x + nx * width / 2, ly = cur.y + ny * width / 2;
      const rx = cur.x - nx * width / 2, ry = cur.y - ny * width / 2;
      const zEl = cur.z + 0.02;
      positions.push(lx, zEl, -ly);
      positions.push(rx, zEl, -ry);
      uvs.push(0, uAccum * 0.1);
      uvs.push(1, uAccum * 0.1);
      if (i < samples.length - 1) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      leftEdge.push(new THREE.Vector3(lx, zEl + 0.005, -ly));
      rightEdge.push(new THREE.Vector3(rx, zEl + 0.005, -ry));
      uAccum += len;

      if (i % 6 === 0) dashPts.push([cur.x, zEl + 0.01, -cur.y]);
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    const edgeGeom = new THREE.BufferGeometry();
    const edgePts: number[] = [];
    for (const p of leftEdge) edgePts.push(p.x, p.y, p.z);
    edgeGeom.setAttribute("position", new THREE.Float32BufferAttribute(edgePts, 3));

    const rightGeom = new THREE.BufferGeometry();
    const rightPts: number[] = [];
    for (const p of rightEdge) rightPts.push(p.x, p.y, p.z);
    rightGeom.setAttribute("position", new THREE.Float32BufferAttribute(rightPts, 3));

    return {
      asphalt: geom,
      edges: [edgeGeom, rightGeom] as [THREE.BufferGeometry, THREE.BufferGeometry],
      dashes: dashPts,
    };
  }, [samples, width]);

  if (!asphalt || !edges) return null;

  const first = samples[0];
  const last = samples[samples.length - 1];

  return (
    <group>
      <mesh geometry={asphalt} receiveShadow>
        <meshStandardMaterial color="#1a1e26" roughness={0.95} metalness={0} />
      </mesh>
      <line>
        <primitive object={edges[0]} attach="geometry" />
        <lineBasicMaterial color="#f7f7fa" />
      </line>
      <line>
        <primitive object={edges[1]} attach="geometry" />
        <lineBasicMaterial color="#f7f7fa" />
      </line>
      {/* Center dashes */}
      {dashes.map((p, i) => {
        const cur = samples[Math.min(samples.length - 1, i * 6)];
        const next = samples[Math.min(samples.length - 1, i * 6 + 1)];
        const heading = Math.atan2(next.y - cur.y, next.x - cur.x);
        return (
          <mesh key={i} position={p} rotation={[-Math.PI / 2, 0, heading]}>
            <planeGeometry args={[2.2, 0.18]} />
            <meshBasicMaterial color="#ffd54a" />
          </mesh>
        );
      })}
      {/* Start marker */}
      <mesh position={[first.x, first.z + 0.03, -first.y]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1, 2.8, 32]} />
        <meshBasicMaterial color="#22c55e" side={THREE.DoubleSide} />
      </mesh>
      {/* Finish marker */}
      <mesh position={[last.x, last.z + 0.03, -last.y]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1, 2.8, 32]} />
        <meshBasicMaterial color="#ef4444" side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
