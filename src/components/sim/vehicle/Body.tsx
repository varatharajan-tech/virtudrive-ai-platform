import { useMemo } from "react";
import * as THREE from "three";
import {
  paintMat,
  darkTrimMat,
  matteBlackMat,
  pianoBlackMat,
} from "./materials";

/**
 * Modern autonomous sedan body — smooth, symmetric, curved silhouette.
 *
 * Approach: one `ExtrudeGeometry` for the main body silhouette (side
 * profile spline extruded across the width) plus small primitives for
 * bumpers, arches, mirrors, handles and the roof sensor pod. Every
 * offset is mirrored on ±X so the vehicle is perfectly symmetric.
 *
 * Local frame (this component lives inside chassis inside body group):
 *   Y = 0   ⇒ wheel-center height
 *   Y > 0   ⇒ upward
 *   Z < 0   ⇒ front of car
 *   Z > 0   ⇒ rear of car
 *
 * Dimensions preserved for physics:
 *   width = 1.72   (wheels sit outboard at x = ±0.85)
 *   length = 4.10  (front ≈ -2.05, rear ≈ +2.05)
 *   roof top ≈ y = 0.73  (world y = 1.15 with chassisRestY 0.42)
 */

const BODY_WIDTH = 1.72;
const HALF_W = BODY_WIDTH / 2;
const FRONT_Z = -2.05;
const REAR_Z = 2.05;

/**
 * Build the side profile as a Shape in local XY (shape.x → world Z,
 * shape.y → world Y). Extruded along local +Z, then rotated so the
 * extrusion axis maps to world +X.
 */
function buildSilhouette(): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  // Start at front-bumper bottom, walk the outline clockwise around the car.
  s.moveTo(-2.05, -0.35);
  s.lineTo(-2.08, 0.12);
  s.quadraticCurveTo(-2.09, 0.22, -2.02, 0.28);
  s.lineTo(-1.85, 0.30);
  // hood slope up
  s.quadraticCurveTo(-1.55, 0.34, -1.20, 0.36);
  s.lineTo(-0.85, 0.40);
  // windshield rake up to roof front
  s.quadraticCurveTo(-0.72, 0.55, -0.55, 0.73);
  // roof
  s.lineTo(0.85, 0.74);
  // rear glass slope down
  s.quadraticCurveTo(1.02, 0.60, 1.20, 0.48);
  // trunk lid
  s.lineTo(1.65, 0.42);
  s.quadraticCurveTo(1.92, 0.36, 2.05, 0.30);
  // rear bumper
  s.lineTo(2.08, 0.12);
  s.quadraticCurveTo(2.09, -0.20, 2.05, -0.35);
  // rocker bottom back to start
  s.lineTo(-2.05, -0.35);

  const g = new THREE.ExtrudeGeometry(s, {
    depth: BODY_WIDTH,
    bevelEnabled: true,
    bevelSegments: 4,
    bevelSize: 0.05,
    bevelThickness: 0.05,
    curveSegments: 24,
  });
  // Center extrusion around x=0 in local frame before mesh rotation.
  g.translate(0, 0, -HALF_W);
  return g;
}

/**
 * Greenhouse (glass area) profile — a thinner shape inset on top of the
 * silhouette so the tinted glass reads as a continuous DLO line.
 */
function buildGreenhouse(): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  s.moveTo(-0.55, 0.44);
  s.quadraticCurveTo(-0.72, 0.56, -0.55, 0.72);
  s.lineTo(0.85, 0.73);
  s.quadraticCurveTo(1.00, 0.60, 1.18, 0.46);
  s.lineTo(-0.55, 0.44);

  const g = new THREE.ExtrudeGeometry(s, {
    depth: BODY_WIDTH - 0.08,
    bevelEnabled: false,
    curveSegments: 20,
  });
  g.translate(0, 0, -(BODY_WIDTH - 0.08) / 2);
  return g;
}

export function Body({ color = "#1fb3a0" }: { color?: string }) {
  const bodyMat = useMemo(() => paintMat(color), [color]);
  const silhouetteGeom = useMemo(buildSilhouette, []);
  const greenhouseGeom = useMemo(buildGreenhouse, []);

  return (
    <group>
      {/* ── Main body shell (single extruded silhouette) ─────────────── */}
      <mesh
        castShadow
        receiveShadow
        rotation={[0, -Math.PI / 2, 0]}
        geometry={silhouetteGeom}
        material={bodyMat}
      />

      {/* ── Tinted greenhouse insert (glass reads as one continuous band) */}
      <mesh
        rotation={[0, -Math.PI / 2, 0]}
        geometry={greenhouseGeom}
        material={pianoBlackMat}
        position={[0, 0, 0]}
      />

      {/* ── Wheel arches — soft body-colored half-torus over each wheel  */}
      {([[0.86, -1.35], [-0.86, -1.35], [0.86, 1.35], [-0.86, 1.35]] as const).map(
        ([x, z], i) => (
          <mesh
            key={`arch-${i}`}
            castShadow
            position={[x, 0.02, z]}
            rotation={[0, Math.sign(x) > 0 ? Math.PI / 2 : -Math.PI / 2, 0]}
            material={bodyMat}
          >
            <torusGeometry args={[0.46, 0.055, 10, 24, Math.PI]} />
          </mesh>
        ),
      )}

      {/* ── Lower fascia strip (matte black under the body all around) */}
      <mesh position={[0, -0.28, 0]} material={matteBlackMat}>
        <boxGeometry args={[1.68, 0.10, 4.05]} />
      </mesh>

      {/* ── Front fascia: recessed matte-black grille + lower intake ── */}
      <mesh position={[0, 0.18, FRONT_Z + 0.06]} material={matteBlackMat}>
        <boxGeometry args={[1.05, 0.22, 0.06]} />
      </mesh>
      <mesh position={[0, -0.05, FRONT_Z + 0.05]} material={matteBlackMat}>
        <boxGeometry args={[1.30, 0.18, 0.06]} />
      </mesh>
      {/* Front bumper corner splitters */}
      {[1, -1].map((sx) => (
        <mesh
          key={`fspl-${sx}`}
          position={[sx * 0.75, -0.12, FRONT_Z + 0.05]}
          material={matteBlackMat}
        >
          <boxGeometry args={[0.22, 0.10, 0.10]} />
        </mesh>
      ))}

      {/* ── Rear fascia: matte black diffuser + bumper cut ──────────── */}
      <mesh position={[0, -0.08, REAR_Z - 0.05]} material={matteBlackMat}>
        <boxGeometry args={[1.40, 0.20, 0.06]} />
      </mesh>
      {[1, -1].map((sx) => (
        <mesh
          key={`rspl-${sx}`}
          position={[sx * 0.70, -0.16, REAR_Z - 0.05]}
          material={matteBlackMat}
        >
          <boxGeometry args={[0.20, 0.08, 0.10]} />
        </mesh>
      ))}

      {/* ── Rocker side sills (piano black, mirrored) ───────────────── */}
      {[1, -1].map((sx) => (
        <mesh
          key={`sill-${sx}`}
          position={[sx * 0.865, -0.24, 0]}
          material={darkTrimMat}
        >
          <boxGeometry args={[0.03, 0.16, 3.20]} />
        </mesh>
      ))}

      {/* ── Door handles — flush pill (mirrored) ────────────────────── */}
      {([[0.86, -0.45], [-0.86, -0.45], [0.86, 0.55], [-0.86, 0.55]] as const).map(
        ([x, z], i) => (
          <mesh
            key={`hdl-${i}`}
            position={[x, 0.32, z]}
            rotation={[0, 0, Math.PI / 2]}
            material={bodyMat}
          >
            <capsuleGeometry args={[0.018, 0.12, 4, 10]} />
          </mesh>
        ),
      )}

      {/* ── Mirrors (mirrored). Body-color teardrop housing + glass ─── */}
      {[1, -1].map((sx) => (
        <group key={`mir-${sx}`} position={[sx * 0.88, 0.48, -0.72]}>
          {/* stem */}
          <mesh position={[sx * 0.05, 0, 0]} material={darkTrimMat}>
            <boxGeometry args={[0.09, 0.04, 0.12]} />
          </mesh>
          {/* housing */}
          <mesh
            position={[sx * 0.14, 0.02, 0]}
            rotation={[0, 0, Math.PI / 2]}
            castShadow
            material={bodyMat}
          >
            <capsuleGeometry args={[0.05, 0.10, 4, 12]} />
          </mesh>
          {/* mirror glass insert */}
          <mesh
            position={[sx * 0.18, 0.02, 0]}
            rotation={[0, sx * 0.15, 0]}
            material={pianoBlackMat}
          >
            <boxGeometry args={[0.008, 0.075, 0.13]} />
          </mesh>
          {/* side camera nub */}
          <mesh position={[sx * 0.13, -0.03, 0.05]} material={matteBlackMat}>
            <boxGeometry args={[0.03, 0.02, 0.03]} />
          </mesh>
        </group>
      ))}

      {/* ── Window trim (thin piano-black stripe along DLO) ─────────── */}
      {[1, -1].map((sx) => (
        <mesh
          key={`dlo-${sx}`}
          position={[sx * 0.865, 0.44, 0.05]}
          material={pianoBlackMat}
        >
          <boxGeometry args={[0.012, 0.02, 1.6]} />
        </mesh>
      ))}

      {/* ── Roof sensor pod — central LiDAR + 4 corner sensors ─────── */}
      <group position={[0, 0.78, 0.05]}>
        {/* Central roof rack base */}
        <mesh material={matteBlackMat}>
          <boxGeometry args={[0.60, 0.03, 0.60]} />
        </mesh>
        {/* LiDAR base */}
        <mesh position={[0, 0.06, 0]} material={matteBlackMat}>
          <cylinderGeometry args={[0.09, 0.10, 0.05, 24]} />
        </mesh>
        {/* LiDAR spinning drum */}
        <mesh position={[0, 0.14, 0]} material={pianoBlackMat}>
          <cylinderGeometry args={[0.07, 0.07, 0.10, 24]} />
        </mesh>
        {/* LiDAR top cap */}
        <mesh position={[0, 0.21, 0]} material={matteBlackMat}>
          <cylinderGeometry args={[0.075, 0.075, 0.02, 24]} />
        </mesh>
        {/* Four corner sensor cubes */}
        {([[1, 1], [1, -1], [-1, 1], [-1, -1]] as const).map(([sx, sz], i) => (
          <group key={`sens-${i}`} position={[sx * 0.26, 0.05, sz * 0.26]}>
            <mesh material={matteBlackMat}>
              <boxGeometry args={[0.09, 0.09, 0.09]} />
            </mesh>
            <mesh position={[0, 0.06, 0]} material={pianoBlackMat}>
              <boxGeometry args={[0.07, 0.03, 0.07]} />
            </mesh>
          </group>
        ))}
      </group>

      {/* ── Small forward-facing camera under windshield ─────────────── */}
      <mesh position={[0, 0.65, -0.55]} material={matteBlackMat}>
        <boxGeometry args={[0.10, 0.04, 0.04]} />
      </mesh>

      {/* ── License plate recesses (front & rear) ───────────────────── */}
      <mesh position={[0, -0.18, FRONT_Z + 0.02]} material={matteBlackMat}>
        <boxGeometry args={[0.42, 0.10, 0.02]} />
      </mesh>
      <mesh position={[0, -0.18, REAR_Z - 0.02]} material={matteBlackMat}>
        <boxGeometry args={[0.42, 0.10, 0.02]} />
      </mesh>
    </group>
  );
}
