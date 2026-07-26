import type { PathSample } from "./store";
import { fbm } from "./textures";
import { createRoadCurve, type RoadCurve } from "./road-curve";

/**
 * Terrain height field used by BOTH the terrain surface and every object
 * placed on the ground.
 *
 * Composition per query (world XZ → world Y):
 *
 *   nearest-station projection on shared road curve (spatial grid, O(1) avg)
 *          |
 *          +-- |lateral| <= SHOULDER    → banked road plane (elev + lat·sin(bank))
 *          +-- |lateral| <= SHOULDER+EMBANK  → smoothstep blend to hillBiased
 *          +-- else                     → hillBiased (rolling terrain +
 *                                          long-range mountain body under
 *                                          elevated road corridors)
 *
 * Coordinate convention:
 *   Sim frame:   (s.x, s.y, s.z)  z = elevation
 *   World frame: (s.x, s.z, -s.y)
 */

const SHOULDER = 6.0; // metres from centreline treated as banked road plane
const EMBANK = 46.0; // metres over which we blend road plane → hills
const HILL_AMPL = 22.0; // metres, main hill amplitude
const CELL = 18.0; // spatial grid cell size in metres
const EMBANK_FALLOFF = 120.0; // metres — mountain body support falloff
const REACH = SHOULDER + EMBANK;

export interface TerrainBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  cx: number;
  cz: number;
  sizeX: number;
  sizeZ: number;
}

export interface TerrainSampler {
  bounds: TerrainBounds;
  heightAt(worldX: number, worldZ: number): number;
  roadDistance(worldX: number, worldZ: number): number;
  hillOnly(worldX: number, worldZ: number): number;
  curve: RoadCurve | null;
}

/** Pure hill height (no road influence). Also usable for distant terrain. */
export function hillHeight(wx: number, wz: number): number {
  return (
    (fbm(wx * 0.006, wz * 0.006, 4) - 0.5) * HILL_AMPL +
    (fbm(wx * 0.02 + 10, wz * 0.02 - 3, 3) - 0.5) * 3.5
  );
}

function smoothstep01(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

interface RoadInfo {
  dist: number;
  lateral: number; // signed distance along outward-left normal
  elev: number;
  bank: number;
}

export function createTerrainSampler(samples: PathSample[], pad = 320): TerrainSampler {
  const curve = createRoadCurve(samples);

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  if (curve) {
    for (const st of curve.stations) {
      if (st.wx < minX) minX = st.wx;
      if (st.wx > maxX) maxX = st.wx;
      if (st.wz < minZ) minZ = st.wz;
      if (st.wz > maxZ) maxZ = st.wz;
    }
  }
  if (!isFinite(minX)) {
    minX = -pad; maxX = pad; minZ = -pad; maxZ = pad;
  }

  const gMinX = minX - REACH - 4;
  const gMaxX = maxX + REACH + 4;
  const gMinZ = minZ - REACH - 4;
  const gMaxZ = maxZ + REACH + 4;
  const cols = Math.max(1, Math.ceil((gMaxX - gMinX) / CELL));
  const rows = Math.max(1, Math.ceil((gMaxZ - gMinZ) / CELL));
  const grid: number[][] = new Array(cols * rows);
  for (let i = 0; i < cols * rows; i++) grid[i] = [];

  if (curve) {
    const stations = curve.stations;
    for (let i = 0; i < stations.length - 1; i++) {
      const a = stations[i];
      const b = stations[i + 1];
      const sMinX = Math.min(a.wx, b.wx), sMaxX = Math.max(a.wx, b.wx);
      const sMinZ = Math.min(a.wz, b.wz), sMaxZ = Math.max(a.wz, b.wz);
      const c0 = Math.max(0, Math.floor((sMinX - gMinX) / CELL) - 1);
      const c1 = Math.min(cols - 1, Math.floor((sMaxX - gMinX) / CELL) + 1);
      const r0 = Math.max(0, Math.floor((sMinZ - gMinZ) / CELL) - 1);
      const r1 = Math.min(rows - 1, Math.floor((sMaxZ - gMinZ) / CELL) + 1);
      for (let r = r0; r <= r1; r++) {
        const rowOff = r * cols;
        for (let c = c0; c <= c1; c++) grid[rowOff + c].push(i);
      }
    }
  }

  const NO_ROAD: RoadInfo = { dist: Infinity, lateral: 0, elev: 0, bank: 0 };

  function roadInfo(qx: number, qz: number): RoadInfo {
    if (!curve) return NO_ROAD;
    if (qx < gMinX || qx > gMaxX || qz < gMinZ || qz > gMaxZ) return NO_ROAD;
    const c = Math.min(cols - 1, Math.max(0, Math.floor((qx - gMinX) / CELL)));
    const r = Math.min(rows - 1, Math.max(0, Math.floor((qz - gMinZ) / CELL)));
    const cell = grid[r * cols + c];
    if (cell.length === 0) return NO_ROAD;

    const stations = curve.stations;
    let bestD2 = Infinity;
    let bestT = 0;
    let bestI = -1;
    for (let k = 0; k < cell.length; k++) {
      const i = cell[k];
      const a = stations[i];
      const b = stations[i + 1];
      const dx = b.wx - a.wx;
      const dz = b.wz - a.wz;
      const L2 = dx * dx + dz * dz;
      let t = L2 > 1e-6 ? ((qx - a.wx) * dx + (qz - a.wz) * dz) / L2 : 0;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const px = a.wx + dx * t;
      const pz = a.wz + dz * t;
      const ex = qx - px;
      const ez = qz - pz;
      const d2 = ex * ex + ez * ez;
      if (d2 < bestD2) {
        bestD2 = d2;
        bestT = t;
        bestI = i;
      }
    }
    if (bestI < 0) return NO_ROAD;
    const a = stations[bestI];
    const b = stations[bestI + 1];
    const px = a.wx + (b.wx - a.wx) * bestT;
    const pz = a.wz + (b.wz - a.wz) * bestT;
    const elev = a.wy + (b.wy - a.wy) * bestT;
    const bank = a.bank + (b.bank - a.bank) * bestT;
    // outward-left normal interpolated + renormalised
    let nx = a.nx + (b.nx - a.nx) * bestT;
    let nz = a.nz + (b.nz - a.nz) * bestT;
    const nl = Math.hypot(nx, nz) || 1;
    nx /= nl; nz /= nl;
    const ex = qx - px;
    const ez = qz - pz;
    const lateral = ex * nx + ez * nz;
    return { dist: Math.sqrt(bestD2), lateral, elev, bank };
  }

  /** Baseline bias so hills rise to meet elevated roads (mountain body). */
  function hillBiased(qx: number, qz: number, info: RoadInfo): number {
    const base = hillHeight(qx, qz);
    if (!isFinite(info.dist)) return base;
    // Support: strongest near road, decays with EMBANK_FALLOFF
    const w = Math.exp(-Math.max(0, info.dist - SHOULDER) / EMBANK_FALLOFF);
    // Blend hill baseline toward the road elevation. Only lifts terrain
    // toward the road (never pulls it below the natural hills).
    const roadFloor = info.elev - 2.5; // sit ~2.5 m below road for embankment feel
    return base * (1 - w) + Math.max(base, roadFloor) * w;
  }

  function heightAt(x: number, z: number): number {
    const info = roadInfo(x, z);
    if (info.dist >= REACH) return hillBiased(x, z, info);
    // Banked road plane at query point
    const roadPlane = info.elev + info.lateral * Math.sin(info.bank) - 0.05;
    if (info.dist <= SHOULDER) return roadPlane;
    // Blend from shoulder edge (banked plane at ± SHOULDER) → hillBiased
    const t = smoothstep01((info.dist - SHOULDER) / EMBANK);
    const hill = hillBiased(x, z, info);
    return roadPlane * (1 - t) + hill * t;
  }

  function roadDistance(x: number, z: number): number {
    return roadInfo(x, z).dist;
  }

  return {
    bounds: {
      minX: minX - pad,
      maxX: maxX + pad,
      minZ: minZ - pad,
      maxZ: maxZ + pad,
      cx: (minX + maxX) / 2,
      cz: (minZ + maxZ) / 2,
      sizeX: maxX - minX + pad * 2,
      sizeZ: maxZ - minZ + pad * 2,
    },
    heightAt,
    roadDistance,
    hillOnly: hillHeight,
    curve,
  };
}
