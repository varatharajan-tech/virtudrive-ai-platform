import * as THREE from "three";
import type { PathSample } from "./store";

/**
 * Shared road centreline.
 *
 * Both the visible road ribbon (Road.tsx) and the terrain corridor
 * (terrain-height.ts) consume the SAME Catmull-Rom subdivided polyline and
 * the SAME per-station bank/heading values so they agree to machine
 * precision on any elevation / bank / curvature combination.
 *
 * World frame convention (matches the rest of the renderer):
 *   world_x = sim.x
 *   world_y = sim.z   (elevation)
 *   world_z = -sim.y
 */

export interface RoadStation {
  /** world-space X */
  wx: number;
  /** world-space Y (elevation) */
  wy: number;
  /** world-space Z */
  wz: number;
  /** cumulative arc-length in world XZ from station 0 */
  s: number;
  /** unit tangent in world XZ */
  tx: number;
  tz: number;
  /** unit outward-left normal in world XZ (perpendicular to tangent) */
  nx: number;
  nz: number;
  /** heading (atan2 tz, tx) in world XZ */
  heading: number;
  /** road bank angle, linearly interpolated between raw samples */
  bank: number;
}

export interface RoadCurve {
  /** subdivided polyline, N ≈ samples.length * 4 */
  stations: RoadStation[];
  /** raw source sample count */
  rawCount: number;
}

/**
 * Build the shared road centreline. Bank is linearly interpolated between
 * raw samples so cross-sections change continuously (no faceted twist).
 */
export function createRoadCurve(samples: PathSample[]): RoadCurve | null {
  const N = samples.length;
  if (N < 2) return null;

  // Catmull-Rom in sim (x, elev, y) — matches the renderer's Road ribbon.
  const raw = samples.map((s) => new THREE.Vector3(s.x, s.z, s.y));
  const curve = new THREE.CatmullRomCurve3(raw, false, "catmullrom", 0.5);
  const subCount = Math.max(N * 4, 240);
  const pts = curve.getPoints(subCount);

  const stations: RoadStation[] = new Array(pts.length);
  let sAcc = 0;

  for (let i = 0; i < pts.length; i++) {
    const cur = pts[i];
    const nxt = pts[Math.min(i + 1, pts.length - 1)];
    const prv = pts[Math.max(i - 1, 0)];

    // Central-difference tangent for smoother heading than forward-diff.
    let dx = nxt.x - prv.x;
    let dz = nxt.z - prv.z;
    let len = Math.hypot(dx, dz);
    if (len < 1e-6) {
      dx = nxt.x - cur.x;
      dz = nxt.z - cur.z;
      len = Math.hypot(dx, dz) || 1;
    }
    const tx = dx / len;
    const tz = dz / len;
    // outward-left normal in world XZ
    const nx = -dz / len;
    const nz = dx / len;

    // Linear-interp bank between the two nearest raw samples.
    const f = (i / (pts.length - 1)) * (N - 1);
    const i0 = Math.floor(f);
    const i1 = Math.min(N - 1, i0 + 1);
    const t = f - i0;
    const bank =
      (samples[i0].bank_rad ?? 0) * (1 - t) + (samples[i1].bank_rad ?? 0) * t;

    if (i > 0) {
      const prev = stations[i - 1];
      sAcc += Math.hypot(cur.x - prev.wx * 1, cur.z - -prev.wz * 1);
      // The previous line depends on the world convention; recompute cleanly:
      sAcc = prev.s + Math.hypot(cur.x - prev.wx, cur.z + prev.wz);
    }

    // Convert sim → world: world_x = sim.x, world_y = sim.z (elev), world_z = -sim.y
    stations[i] = {
      wx: cur.x,
      wy: cur.y,
      wz: -cur.z,
      s: sAcc,
      tx,
      tz: -tz,
      nx,
      nz: -nz,
      heading: Math.atan2(-tz, tx),
      bank,
    };
  }

  return { stations, rawCount: N };
}
