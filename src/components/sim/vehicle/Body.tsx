import { useMemo } from "react";
import * as THREE from "three";
import {
  paintMat,
  darkTrimMat,
  matteBlackMat,
  pianoBlackMat,
  glassMat,
  chromeMat,
} from "./materials";

/**
 * Modern closed-cabin sedan body (Corolla-Altis class proportions).
 *
 * Built as a classic 3-box silhouette from predictable primitives so the
 * cabin is always closed, symmetric and readable:
 *
 *   ┌──────┐          roof
 *  ╱        ╲         A / C pillars + glass
 * ┌──┬──────┬──┐      belt line
 * │ hood │ trunk │    lower body
 * └───────────────┘
 *
 * Local frame (inside chassis → body group):
 *   Y = 0   ⇒ wheel-center height
 *   Z < 0   ⇒ front, Z > 0 ⇒ rear
 *
 * Dimensions preserved for physics:
 *   overall length ≈ 4.10, width = 1.72
 *   wheels at x = ±0.86, wheelbase ≈ 2.70
 */

const BODY_WIDTH = 1.72;
const HALF_W = BODY_WIDTH / 2;
const FRONT_Z = -2.05;
const REAR_Z = 2.05;

// Vertical bands ----------------------------------------------------------
const ROCKER_Y = -0.28;   // bottom of visible body (above wheel bottom)
const BELT_Y = 0.34;      // top of lower body / bottom of greenhouse
const ROOF_Y = 0.74;      // top of roof
const ROOF_MID = (BELT_Y + ROOF_Y) / 2;

// Longitudinal split (3-box) ---------------------------------------------
const HOOD_END_Z = -0.70;   // where hood meets windshield base
const TRUNK_START_Z = 1.15; // where rear glass meets trunk lid
const CABIN_FRONT_Z = -0.55; // roof front edge
const CABIN_REAR_Z = 1.00;   // roof rear edge

/** Angled glass panel between two Z stations at belt-to-roof height. */
function slantedGlass(
  zBottom: number,
  zTop: number,
  width: number,
  material: THREE.Material,
  key: string,
) {
  const dz = zTop - zBottom;
  const dy = ROOF_Y - BELT_Y;
  const len = Math.sqrt(dz * dz + dy * dy);
  const angle = Math.atan2(dz, dy); // rotate around X
  const cx = 0;
  const cy = (BELT_Y + ROOF_Y) / 2;
  const cz = (zBottom + zTop) / 2;
  return (
    <mesh
      key={key}
      position={[cx, cy, cz]}
      rotation={[angle, 0, 0]}
      material={material}
      castShadow
    >
      <boxGeometry args={[width, 0.02, len]} />
    </mesh>
  );
}

export function Body({ color = "#1fb3a0" }: { color?: string }) {
  const bodyMat = useMemo(() => paintMat(color), [color]);

  // Lower body dimensions
  const lowerH = BELT_Y - ROCKER_Y; // 0.62
  const lowerLen = REAR_Z - FRONT_Z; // 4.10
  const lowerCY = (ROCKER_Y + BELT_Y) / 2; // 0.03

  // Roof dimensions
  const roofLen = CABIN_REAR_Z - CABIN_FRONT_Z; // 1.55
  const roofH = 0.05;
  const roofCY = ROOF_Y - roofH / 2;
  const roofCZ = (CABIN_FRONT_Z + CABIN_REAR_Z) / 2;

  return (
    <group>
      {/* ── Lower body (rocker → belt line): main painted box ─────────── */}
      <mesh
        position={[0, lowerCY, (FRONT_Z + REAR_Z) / 2]}
        material={bodyMat}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[BODY_WIDTH, lowerH, lowerLen]} />
      </mesh>

      {/* Sculpted front nose (chamfered hood tip) */}
      <mesh
        position={[0, BELT_Y - 0.08, FRONT_Z + 0.02]}
        rotation={[Math.PI / 14, 0, 0]}
        material={bodyMat}
        castShadow
      >
        <boxGeometry args={[BODY_WIDTH - 0.04, 0.10, 0.35]} />
      </mesh>

      {/* Sculpted rear deck (trunk lid, slightly raised) */}
      <mesh
        position={[0, BELT_Y - 0.02, (TRUNK_START_Z + REAR_Z) / 2]}
        material={bodyMat}
        castShadow
      >
        <boxGeometry args={[BODY_WIDTH - 0.04, 0.06, REAR_Z - TRUNK_START_Z]} />
      </mesh>

      {/* ── Roof (slightly narrower than body for tumblehome) ─────────── */}
      <mesh
        position={[0, roofCY, roofCZ]}
        material={bodyMat}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[BODY_WIDTH - 0.12, roofH, roofLen]} />
      </mesh>

      {/* ── Side glass (one per side, spanning cabin length) ──────────── */}
      {[1, -1].map((sx) => (
        <mesh
          key={`sideglass-${sx}`}
          position={[sx * (HALF_W - 0.02), (BELT_Y + ROOF_Y) / 2, roofCZ]}
          material={glassMat}
        >
          <boxGeometry args={[0.015, ROOF_Y - BELT_Y - 0.04, roofLen - 0.05]} />
        </mesh>
      ))}

      {/* ── Windshield (angled forward) ───────────────────────────────── */}
      {slantedGlass(HOOD_END_Z, CABIN_FRONT_Z, BODY_WIDTH - 0.14, glassMat, "wshield")}

      {/* ── Rear windshield (angled rearward) ─────────────────────────── */}
      {slantedGlass(TRUNK_START_Z, CABIN_REAR_Z, BODY_WIDTH - 0.14, glassMat, "rshield")}

      {/* ── A-pillars (front, angled) ─────────────────────────────────── */}
      {[1, -1].map((sx) => {
        const zBottom = HOOD_END_Z;
        const zTop = CABIN_FRONT_Z;
        const len = Math.sqrt(
          (zTop - zBottom) ** 2 + (ROOF_Y - BELT_Y) ** 2,
        );
        const angle = Math.atan2(zTop - zBottom, ROOF_Y - BELT_Y);
        return (
          <mesh
            key={`apil-${sx}`}
            position={[sx * (HALF_W - 0.055), ROOF_MID, (zBottom + zTop) / 2]}
            rotation={[angle, 0, 0]}
            material={pianoBlackMat}
            castShadow
          >
            <boxGeometry args={[0.06, 0.08, len]} />
          </mesh>
        );
      })}

      {/* ── B-pillars (center, vertical) ──────────────────────────────── */}
      {[1, -1].map((sx) => (
        <mesh
          key={`bpil-${sx}`}
          position={[sx * (HALF_W - 0.02), ROOF_MID, 0.15]}
          material={pianoBlackMat}
          castShadow
        >
          <boxGeometry args={[0.02, ROOF_Y - BELT_Y, 0.10]} />
        </mesh>
      ))}

      {/* ── C-pillars (rear, angled, body-color) ──────────────────────── */}
      {[1, -1].map((sx) => {
        const zBottom = TRUNK_START_Z;
        const zTop = CABIN_REAR_Z;
        const len = Math.sqrt(
          (zTop - zBottom) ** 2 + (ROOF_Y - BELT_Y) ** 2,
        );
        const angle = Math.atan2(zTop - zBottom, ROOF_Y - BELT_Y);
        return (
          <mesh
            key={`cpil-${sx}`}
            position={[sx * (HALF_W - 0.055), ROOF_MID, (zBottom + zTop) / 2]}
            rotation={[angle, 0, 0]}
            material={bodyMat}
            castShadow
          >
            <boxGeometry args={[0.06, 0.14, len]} />
          </mesh>
        );
      })}

      {/* ── Wheel arches ──────────────────────────────────────────────── */}
      {([[0.86, -1.35], [-0.86, -1.35], [0.86, 1.35], [-0.86, 1.35]] as const).map(
        ([x, z], i) => (
          <mesh
            key={`arch-${i}`}
            castShadow
            position={[x, ROCKER_Y + 0.30, z]}
            rotation={[0, Math.sign(x) > 0 ? Math.PI / 2 : -Math.PI / 2, 0]}
            material={bodyMat}
          >
            <torusGeometry args={[0.46, 0.055, 10, 24, Math.PI]} />
          </mesh>
        ),
      )}

      {/* ── Belt-line chrome strip along both sides ───────────────────── */}
      {[1, -1].map((sx) => (
        <mesh
          key={`belt-${sx}`}
          position={[sx * HALF_W, BELT_Y, 0.1]}
          material={chromeMat}
        >
          <boxGeometry args={[0.012, 0.02, roofLen + 0.6]} />
        </mesh>
      ))}

      {/* ── Lower fascia strip ────────────────────────────────────────── */}
      <mesh position={[0, ROCKER_Y - 0.03, 0]} material={matteBlackMat}>
        <boxGeometry args={[1.68, 0.10, 4.05]} />
      </mesh>

      {/* ── Front fascia: grille + lower intake ───────────────────────── */}
      <mesh position={[0, 0.14, FRONT_Z + 0.03]} material={matteBlackMat}>
        <boxGeometry args={[1.10, 0.22, 0.05]} />
      </mesh>
      <mesh position={[0, -0.08, FRONT_Z + 0.02]} material={matteBlackMat}>
        <boxGeometry args={[1.30, 0.16, 0.06]} />
      </mesh>

      {/* ── Rear diffuser ─────────────────────────────────────────────── */}
      <mesh position={[0, -0.10, REAR_Z - 0.03]} material={matteBlackMat}>
        <boxGeometry args={[1.40, 0.18, 0.05]} />
      </mesh>

      {/* ── Rocker side sills ─────────────────────────────────────────── */}
      {[1, -1].map((sx) => (
        <mesh
          key={`sill-${sx}`}
          position={[sx * 0.865, ROCKER_Y + 0.08, 0]}
          material={darkTrimMat}
        >
          <boxGeometry args={[0.03, 0.14, 3.20]} />
        </mesh>
      ))}

      {/* ── Door handles ──────────────────────────────────────────────── */}
      {([[0.86, -0.35], [-0.86, -0.35], [0.86, 0.65], [-0.86, 0.65]] as const).map(
        ([x, z], i) => (
          <mesh
            key={`hdl-${i}`}
            position={[x, BELT_Y - 0.06, z]}
            rotation={[0, 0, Math.PI / 2]}
            material={chromeMat}
          >
            <capsuleGeometry args={[0.018, 0.12, 4, 10]} />
          </mesh>
        ),
      )}

      {/* ── Mirrors ───────────────────────────────────────────────────── */}
      {[1, -1].map((sx) => (
        <group key={`mir-${sx}`} position={[sx * (HALF_W + 0.02), BELT_Y + 0.02, HOOD_END_Z + 0.05]}>
          <mesh position={[sx * 0.05, 0, 0]} material={darkTrimMat}>
            <boxGeometry args={[0.09, 0.04, 0.10]} />
          </mesh>
          <mesh
            position={[sx * 0.13, 0.02, 0]}
            rotation={[0, 0, Math.PI / 2]}
            castShadow
            material={bodyMat}
          >
            <capsuleGeometry args={[0.05, 0.10, 4, 12]} />
          </mesh>
          <mesh
            position={[sx * 0.17, 0.02, 0]}
            rotation={[0, sx * 0.15, 0]}
            material={pianoBlackMat}
          >
            <boxGeometry args={[0.008, 0.075, 0.12]} />
          </mesh>
        </group>
      ))}

      {/* ── Roof sensor pod (autonomous LiDAR) ────────────────────────── */}
      <group position={[0, ROOF_Y + 0.03, 0.05]}>
        <mesh material={matteBlackMat}>
          <boxGeometry args={[0.60, 0.03, 0.60]} />
        </mesh>
        <mesh position={[0, 0.06, 0]} material={matteBlackMat}>
          <cylinderGeometry args={[0.09, 0.10, 0.05, 24]} />
        </mesh>
        <mesh position={[0, 0.14, 0]} material={pianoBlackMat}>
          <cylinderGeometry args={[0.07, 0.07, 0.10, 24]} />
        </mesh>
        <mesh position={[0, 0.21, 0]} material={matteBlackMat}>
          <cylinderGeometry args={[0.075, 0.075, 0.02, 24]} />
        </mesh>
        {([[1, 1], [1, -1], [-1, 1], [-1, -1]] as const).map(([sx, sz], i) => (
          <mesh
            key={`sens-${i}`}
            position={[sx * 0.26, 0.05, sz * 0.26]}
            material={matteBlackMat}
          >
            <boxGeometry args={[0.09, 0.09, 0.09]} />
          </mesh>
        ))}
      </group>

      {/* ── Forward camera under windshield ───────────────────────────── */}
      <mesh position={[0, ROOF_Y - 0.10, HOOD_END_Z + 0.02]} material={matteBlackMat}>
        <boxGeometry args={[0.10, 0.04, 0.04]} />
      </mesh>

      {/* ── License plate recesses ────────────────────────────────────── */}
      <mesh position={[0, -0.18, FRONT_Z + 0.02]} material={matteBlackMat}>
        <boxGeometry args={[0.42, 0.10, 0.02]} />
      </mesh>
      <mesh position={[0, -0.18, REAR_Z - 0.02]} material={matteBlackMat}>
        <boxGeometry args={[0.42, 0.10, 0.02]} />
      </mesh>
    </group>
  );
}
