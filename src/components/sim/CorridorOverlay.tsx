import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { sampleAt, usePlayback, type PathSample } from "./store";
import { auditCorridor, type CorridorAudit } from "./corridor-audit";

/**
 * CorridorOverlay — in-playback debug visualisation of the protected road
 * corridor.
 *
 * Renders:
 *   • the corridor volume — translucent left/right walls + roof, plus crisp
 *     edge polylines, banked exactly like the asphalt (uses the shared road
 *     curve, so it is the same geometry the terrain solver protects);
 *   • red markers wherever terrain rises above the banked road plane inside
 *     the corridor;
 *   • amber markers on any tree / bush / grass tuft / rock / pond that landed
 *     inside its clearance floor.
 *
 * The audit itself is pure (corridor-audit.ts) and memoised per road; the
 * per-frame work is only a pulse + a nearest-violation-ahead readout, so the
 * overlay costs nothing measurable at 60 FPS.
 */

const TERRAIN_COLOR = new THREE.Color("#ef4444");
const PROP_COLOR = new THREE.Color("#f59e0b");

export function CorridorOverlay({ samples }: { samples: PathSample[] }) {
  const show = usePlayback((s) => s.showCorridor);
  const sampler = usePlayback((s) => s.terrainSampler);
  const setStats = usePlayback((s) => s.setCorridorStats);

  const audit: CorridorAudit | null = useMemo(() => {
    if (!show || !sampler || samples.length < 2) return null;
    return auditCorridor(samples, sampler);
  }, [show, sampler, samples]);

  useEffect(() => {
    if (!audit) return;
    setStats({
      terrainHits: audit.terrainHits.length,
      propHits: audit.propHits.length,
      worstOverlap: audit.worstOverlap,
      terrainSamples: audit.terrainSamples,
      halfWidth: audit.halfWidth,
    });
  }, [audit, setStats]);

  const geo = useMemo(() => {
    if (!audit || audit.rings.length < 2) return null;
    const n = audit.rings.length;
    const h = audit.clearHeight;

    // Wall ribbons (left + right) and roof, as indexed triangle strips.
    const wall = (side: "l" | "r") => {
      const pos = new Float32Array(n * 2 * 3);
      for (let i = 0; i < n; i++) {
        const r = audit.rings[i];
        const x = side === "l" ? r.lx : r.rx;
        const y = side === "l" ? r.ly : r.ry;
        const z = side === "l" ? r.lz : r.rz;
        pos.set([x, y, z], i * 6);
        pos.set([x, y + h, z], i * 6 + 3);
      }
      return stripGeometry(pos, n);
    };

    const roofPos = new Float32Array(n * 2 * 3);
    for (let i = 0; i < n; i++) {
      const r = audit.rings[i];
      roofPos.set([r.lx, r.ly + h, r.lz], i * 6);
      roofPos.set([r.rx, r.ry + h, r.rz], i * 6 + 3);
    }

    const edge = (pick: (i: number) => [number, number, number]) => {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < n; i++) pts.push(new THREE.Vector3(...pick(i)));
      return new THREE.BufferGeometry().setFromPoints(pts);
    };

    return {
      left: wall("l"),
      right: wall("r"),
      roof: stripGeometry(roofPos, n),
      edges: [
        edge((i) => [audit.rings[i].lx, audit.rings[i].ly + 0.02, audit.rings[i].lz]),
        edge((i) => [audit.rings[i].rx, audit.rings[i].ry + 0.02, audit.rings[i].rz]),
        edge((i) => [audit.rings[i].lx, audit.rings[i].ly + h, audit.rings[i].lz]),
        edge((i) => [audit.rings[i].rx, audit.rings[i].ry + h, audit.rings[i].rz]),
      ],
    };
  }, [audit]);

  useEffect(() => {
    return () => {
      if (!geo) return;
      geo.left.dispose();
      geo.right.dispose();
      geo.roof.dispose();
      geo.edges.forEach((e) => e.dispose());
    };
  }, [geo]);

  const terrainRef = useRef<THREE.InstancedMesh>(null);
  const propRef = useRef<THREE.InstancedMesh>(null);
  const pulseRef = useRef<THREE.MeshBasicMaterial>(null);
  const readoutTick = useRef(0);

  useEffect(() => {
    if (!audit) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    if (terrainRef.current) {
      audit.terrainHits.forEach((hit, i) => {
        const s = 0.5 + Math.min(2, hit.overlap) * 0.6;
        m.compose(new THREE.Vector3(hit.x, hit.y + s * 0.5, hit.z), q, one.clone().multiplyScalar(s));
        terrainRef.current!.setMatrixAt(i, m);
      });
      terrainRef.current.count = audit.terrainHits.length;
      terrainRef.current.instanceMatrix.needsUpdate = true;
    }
    if (propRef.current) {
      audit.propHits.forEach((hit, i) => {
        m.compose(new THREE.Vector3(hit.x, hit.y + 1.4, hit.z), q, new THREE.Vector3(1.1, 1.6, 1.1));
        propRef.current!.setMatrixAt(i, m);
      });
      propRef.current.count = audit.propHits.length;
      propRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [audit]);

  useFrame((state, dt) => {
    if (!audit) return;
    // Pulse the violation markers so they read instantly against terrain.
    if (pulseRef.current) {
      pulseRef.current.opacity = 0.55 + 0.35 * Math.sin(state.clock.elapsedTime * 5);
    }
    readoutTick.current += dt;
    if (readoutTick.current < 0.2) return;
    readoutTick.current = 0;
    if (typeof document === "undefined") return;
    const el = document.getElementById("virtudrive-corridor-readout");
    if (!el) return;
    const st = usePlayback.getState();
    const s = sampleAt(st.samples, st.progress);
    if (!s) return;
    const cx = s.x;
    const cz = -s.y;
    let nearest = Infinity;
    let kind = "";
    for (const t of audit.terrainHits) {
      const d = Math.hypot(t.x - cx, t.z - cz);
      if (d < nearest) { nearest = d; kind = `terrain +${t.overlap.toFixed(2)} m`; }
    }
    for (const p of audit.propHits) {
      const d = Math.hypot(p.x - cx, p.z - cz);
      if (d < nearest) { nearest = d; kind = `${p.kind} @ ${p.dist.toFixed(1)} m`; }
    }
    el.textContent = isFinite(nearest)
      ? `nearest breach ${nearest.toFixed(0)} m — ${kind}`
      : "corridor clear";
  });

  if (!show || !audit || !geo) return null;

  return (
    <group renderOrder={5}>
      {[geo.left, geo.right, geo.roof].map((g, i) => (
        <mesh key={i} geometry={g}>
          <meshBasicMaterial
            color="#22d3ee"
            transparent
            opacity={i === 2 ? 0.06 : 0.12}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ))}
      {geo.edges.map((g, i) => (
        <line key={`e${i}`}>
          <primitive object={g} attach="geometry" />
          <lineBasicMaterial color="#22d3ee" transparent opacity={0.85} depthTest={false} />
        </line>
      ))}

      <instancedMesh
        ref={terrainRef}
        args={[undefined, undefined, Math.max(1, audit.terrainHits.length)]}
        frustumCulled={false}
      >
        <sphereGeometry args={[0.5, 10, 8]} />
        <meshBasicMaterial
          ref={pulseRef}
          color={TERRAIN_COLOR}
          transparent
          opacity={0.8}
          depthTest={false}
        />
      </instancedMesh>

      <instancedMesh
        ref={propRef}
        args={[undefined, undefined, Math.max(1, audit.propHits.length)]}
        frustumCulled={false}
      >
        <octahedronGeometry args={[1, 0]} />
        <meshBasicMaterial
          color={PROP_COLOR}
          transparent
          opacity={0.75}
          depthTest={false}
          wireframe
        />
      </instancedMesh>
    </group>
  );
}

/** Build an indexed triangle strip from a 2-row vertex ladder. */
function stripGeometry(pos: Float32Array, n: number) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const idx: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, b, c, b, d, c);
  }
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
