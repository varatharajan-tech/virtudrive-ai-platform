import type { PathSample } from "./store";
import type { TerrainSampler } from "./terrain-height";
import { CORRIDOR_HALF_WIDTH } from "./terrain-height";
import {
  CLEARANCE,
  computeVegetation,
  computeGrassTufts,
  computeLandscape,
} from "./placement";

/**
 * Pure corridor audit.
 *
 * Rebuilds the protected-corridor volume (the flat roadbed prism that must stay
 * free of terrain and props) and reports every intersection found:
 *
 *   terrain  — corridor-interior sample where terrain elevation rises above the
 *              banked road plane (asphalt would be buried).
 *   prop     — a scattered tree / bush / grass tuft / rock / pond whose centre
 *              lies inside its clearance floor (i.e. inside the corridor).
 *
 * Kept free of three.js / R3F so the regression suite can consume it directly.
 */

/** Vertical clear height of the protected volume (m above the road plane). */
export const CORRIDOR_CLEAR_HEIGHT = 5.0;
/** Terrain is considered intruding above this margin over the road plane. */
export const TERRAIN_EPS = 0.02;

export interface CorridorRing {
  /** left edge (world) */
  lx: number; ly: number; lz: number;
  /** right edge (world) */
  rx: number; ry: number; rz: number;
  /** arc length at this station */
  s: number;
}

export interface TerrainHit {
  x: number; y: number; z: number;
  /** how far the terrain rises above the road plane (m) */
  overlap: number;
  s: number;
}

export type PropKind = "tree" | "bush" | "grass" | "rock" | "pond";

export interface PropHit {
  kind: PropKind;
  x: number; y: number; z: number;
  /** distance from road centreline (m) */
  dist: number;
  /** required clearance for this prop kind (m) */
  required: number;
}

export interface CorridorAudit {
  halfWidth: number;
  clearHeight: number;
  rings: CorridorRing[];
  terrainHits: TerrainHit[];
  propHits: PropHit[];
  /** total corridor interior samples tested */
  terrainSamples: number;
  worstOverlap: number;
}

export interface AuditOptions {
  /** take every Nth station of the shared road curve */
  stationStride?: number;
  /** lateral test points per side, inside the corridor */
  lateralSteps?: number;
}

export function auditCorridor(
  samples: PathSample[],
  sampler: TerrainSampler,
  opts: AuditOptions = {},
): CorridorAudit {
  const stride = Math.max(1, opts.stationStride ?? 2);
  const lateralSteps = Math.max(2, opts.lateralSteps ?? 6);
  const half = CORRIDOR_HALF_WIDTH;

  const rings: CorridorRing[] = [];
  const terrainHits: TerrainHit[] = [];
  let terrainSamples = 0;
  let worstOverlap = 0;

  const stations = sampler.curve?.stations ?? [];
  for (let i = 0; i < stations.length; i += stride) {
    const st = stations[i];
    const sinB = Math.sin(st.bank);
    const planeAt = (lat: number) => st.wy + lat * sinB;

    rings.push({
      lx: st.wx + st.nx * half,
      ly: planeAt(half),
      lz: st.wz + st.nz * half,
      rx: st.wx - st.nx * half,
      ry: planeAt(-half),
      rz: st.wz - st.nz * half,
      s: st.s,
    });

    for (let k = -lateralSteps; k <= lateralSteps; k++) {
      const lat = (k / lateralSteps) * half;
      const px = st.wx + st.nx * lat;
      const pz = st.wz + st.nz * lat;
      const plane = planeAt(lat);
      const terrain = sampler.heightAt(px, pz);
      terrainSamples++;
      const overlap = terrain - plane;
      if (overlap > TERRAIN_EPS) {
        if (overlap > worstOverlap) worstOverlap = overlap;
        terrainHits.push({ x: px, y: terrain, z: pz, overlap, s: st.s });
      }
    }
  }

  // Props: re-run the deterministic placement engine and re-verify clearance.
  const propHits: PropHit[] = [];
  const check = (
    kind: PropKind,
    items: { x: number; y: number; z: number }[],
    required: number,
  ) => {
    for (const it of items) {
      const dist = sampler.roadDistance(it.x, it.z);
      if (dist < required) {
        propHits.push({ kind, x: it.x, y: it.y, z: it.z, dist, required });
      }
    }
  };

  const { trees, bushes } = computeVegetation(samples, sampler);
  const tufts = computeGrassTufts(samples, sampler);
  const { rocks, ponds } = computeLandscape(samples, sampler);
  check("tree", trees, CLEARANCE.tree);
  check("bush", bushes, CLEARANCE.bush);
  check("grass", tufts, CLEARANCE.grass);
  check("rock", rocks, CLEARANCE.rock);
  check("pond", ponds, CLEARANCE.pond);

  return {
    halfWidth: half,
    clearHeight: CORRIDOR_CLEAR_HEIGHT,
    rings,
    terrainHits,
    propHits,
    terrainSamples,
    worstOverlap,
  };
}
