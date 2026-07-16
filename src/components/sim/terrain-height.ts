import type { PathSample } from "./store";
import { fbm } from "./textures";

/**
 * Terrain height field used by BOTH the terrain surface and every object
 * placed on the ground (grass, trees, bushes, buildings). One authoritative
 * function — so nothing can drift out of alignment with the road anymore.
 *
 * Composition per query (world XZ → world Y):
 *
 *   distance-to-road-spline (spatial grid, O(1) avg)
 *          |
 *          +-- d <= CORRIDOR         → road-follow height (roadElev - 0.05)
 *          +-- d <= CORRIDOR+EMBANK  → smoothstep blend to hill fBm
 *          +-- else                  → pure hill fBm (rolling terrain)
 *
 * Coordinate convention:
 *   Sim frame:   (s.x, s.y, s.z)  z = elevation
 *   World frame: (s.x, s.z, -s.y)  → world_x = sim.x, world_z = -sim.y
 */

const CORRIDOR = 10.0; // metres from spline treated as roadbed
const EMBANK = 50.0; // metres over which we blend roadbed → hills
const HILL_AMPL = 22.0; // metres, main hill amplitude
const CELL = 18.0; // spatial grid cell size in metres

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

export function createTerrainSampler(samples: PathSample[], pad = 320): TerrainSampler {
  const N = samples.length;
  const wx = new Float32Array(Math.max(1, N));
  const wz = new Float32Array(Math.max(1, N));
  const wy = new Float32Array(Math.max(1, N));

  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (let i = 0; i < N; i++) {
    const s = samples[i];
    const x = s.x;
    const z = -s.y;
    wx[i] = x;
    wz[i] = z;
    wy[i] = s.z;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  if (!isFinite(minX)) {
    minX = -pad;
    maxX = pad;
    minZ = -pad;
    maxZ = pad;
  }

  // Spatial grid covering the road-influence corridor.
  const REACH = CORRIDOR + EMBANK;
  const gMinX = minX - REACH - 4;
  const gMaxX = maxX + REACH + 4;
  const gMinZ = minZ - REACH - 4;
  const gMaxZ = maxZ + REACH + 4;
  const cols = Math.max(1, Math.ceil((gMaxX - gMinX) / CELL));
  const rows = Math.max(1, Math.ceil((gMaxZ - gMinZ) / CELL));
  const grid: number[][] = new Array(cols * rows);
  for (let i = 0; i < cols * rows; i++) grid[i] = [];

  // Stamp each segment [i, i+1] into every cell its bbox touches (+ a 1-cell
  // halo so nearest-segment queries within CELL/2 always find it).
  for (let i = 0; i < N - 1; i++) {
    const ax = wx[i],
      az = wz[i],
      bx = wx[i + 1],
      bz = wz[i + 1];
    const sMinX = Math.min(ax, bx),
      sMaxX = Math.max(ax, bx);
    const sMinZ = Math.min(az, bz),
      sMaxZ = Math.max(az, bz);
    const c0 = Math.max(0, Math.floor((sMinX - gMinX) / CELL) - 1);
    const c1 = Math.min(cols - 1, Math.floor((sMaxX - gMinX) / CELL) + 1);
    const r0 = Math.max(0, Math.floor((sMinZ - gMinZ) / CELL) - 1);
    const r1 = Math.min(rows - 1, Math.floor((sMaxZ - gMinZ) / CELL) + 1);
    for (let r = r0; r <= r1; r++) {
      const rowOff = r * cols;
      for (let c = c0; c <= c1; c++) grid[rowOff + c].push(i);
    }
  }

  function roadInfo(qx: number, qz: number): { dist: number; elev: number } {
    if (qx < gMinX || qx > gMaxX || qz < gMinZ || qz > gMaxZ) {
      return { dist: Infinity, elev: 0 };
    }
    const c = Math.min(cols - 1, Math.max(0, Math.floor((qx - gMinX) / CELL)));
    const r = Math.min(rows - 1, Math.max(0, Math.floor((qz - gMinZ) / CELL)));
    const cell = grid[r * cols + c];
    if (cell.length === 0) return { dist: Infinity, elev: 0 };

    let bestD2 = Infinity;
    let bestElev = 0;
    for (let k = 0; k < cell.length; k++) {
      const i = cell[k];
      const ax = wx[i],
        az = wz[i];
      const dx = wx[i + 1] - ax;
      const dz = wz[i + 1] - az;
      const L2 = dx * dx + dz * dz;
      let t = L2 > 1e-6 ? ((qx - ax) * dx + (qz - az) * dz) / L2 : 0;
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
      const px = ax + dx * t,
        pz = az + dz * t;
      const ex = qx - px,
        ez = qz - pz;
      const d2 = ex * ex + ez * ez;
      if (d2 < bestD2) {
        bestD2 = d2;
        bestElev = wy[i] + (wy[i + 1] - wy[i]) * t;
      }
    }
    return { dist: Math.sqrt(bestD2), elev: bestElev };
  }

  function heightAt(x: number, z: number): number {
    const info = roadInfo(x, z);
    if (info.dist >= REACH) return hillHeight(x, z);
    if (info.dist <= CORRIDOR) return info.elev - 0.05;
    const t = smoothstep01((info.dist - CORRIDOR) / EMBANK);
    const roadbed = info.elev - 0.05;
    const hill = hillHeight(x, z);
    return roadbed * (1 - t) + hill * t;
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
  };
}
