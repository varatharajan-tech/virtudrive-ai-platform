import { useMemo } from "react";
import * as THREE from "three";
import {
  paintMat,
  chromeMat,
  darkTrimMat,
  plasticMat,
  glassMat,
} from "./materials";

/**
 * Production-quality passenger sedan shell.
 *
 * Rebuilt from a single unified side-profile silhouette extruded across
 * the width of the car, with the wheel arches cut into that silhouette
 * as concave arcs of the outer perimeter. That means the hood, cabin,
 * trunk, fenders and sills are one continuous painted panel — no
 * floating slabs, no visible seams.
 *
 * The greenhouse (windshield rake, roof arc, backlight rake) is a
 * second, slightly-narrower side-profile extrusion using the shared
 * `glassMat`. Its left/right extrusion faces become the side windows,
 * so all glass surfaces read as one continuous cabin volume.
 *
 * Body-local coordinate system (identical to previous phases so the
 * physics, animations and camera anchors continue to work):
 *   +Z = rear    −Z = front
 *   +X = left    −X = right
 *   +Y = up      y=0 ≈ wheel-hub height
 */

// ── Constants — sedan envelope (matches Vehicle.tsx wheelbase/track) ──
const LEN_HALF = 2.10;   // half length (±Z)
const WIDTH = 1.86;      // full width along X
const WIDTH_HALF = WIDTH / 2;
const CABIN_WIDTH = 1.68; // greenhouse width (inset for side-window frames)
const CABIN_WIDTH_HALF = CABIN_WIDTH / 2;

const WHEEL_Z = 1.35;
const ARCH_R = 0.5;
const SILL_Y = -0.05;

// ── Side-profile silhouette (u=x_shape≡z_local, v=y_shape≡y_local) ──
// Wound counter-clockwise so ExtrudeGeometry generates outward-facing
// normals. Traversal: start at front-top-of-hood → down the front →
// along the bottom LEFT to RIGHT (wheel arches arc UP into the body) →
// up the back → along the top RIGHT to LEFT (trunk → backlight → roof
// → windshield → hood) back to start.
function bodySideProfile(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-LEN_HALF, 0.55);
  // Front end down to bumper bottom
  s.quadraticCurveTo(-LEN_HALF - 0.05, 0.35, -LEN_HALF + 0.02, 0.18);
  s.lineTo(-1.9, SILL_Y);
  // Bottom edge LEFT → RIGHT with wheel arches arcing upward.
  s.lineTo(-WHEEL_Z - ARCH_R, SILL_Y);
  s.absarc(-WHEEL_Z, SILL_Y, ARCH_R, Math.PI, 0, true);
  s.lineTo(-WHEEL_Z + ARCH_R, SILL_Y);
  s.lineTo(WHEEL_Z - ARCH_R, SILL_Y);
  s.absarc(WHEEL_Z, SILL_Y, ARCH_R, Math.PI, 0, true);
  s.lineTo(WHEEL_Z + ARCH_R, SILL_Y);
  s.lineTo(1.9, SILL_Y);
  // Rear end up to trunk lip
  s.lineTo(LEN_HALF - 0.02, 0.18);
  s.quadraticCurveTo(LEN_HALF + 0.05, 0.35, LEN_HALF, 0.55);
  // Top edge RIGHT → LEFT: trunk deck → backlight → roof → windshield → hood
  s.quadraticCurveTo(LEN_HALF - 0.02, 0.6, 1.85, 0.62);
  s.lineTo(1.18, 0.78);
  s.quadraticCurveTo(1.05, 0.95, 0.8, 1.05);
  s.quadraticCurveTo(0.15, 1.14, -0.5, 1.05);
  s.quadraticCurveTo(-0.75, 0.95, -0.9, 0.82);
  s.quadraticCurveTo(-1.02, 0.74, -1.15, 0.72);
  s.lineTo(-1.85, 0.62);
  s.quadraticCurveTo(-LEN_HALF + 0.05, 0.62, -LEN_HALF, 0.55);
  return s;
}

function greenhouseProfile(): THREE.Shape {
  const s = new THREE.Shape();
  // Start at windshield base (cowl), trace top of glass, back to start.
  s.moveTo(-0.95, 0.78);
  s.quadraticCurveTo(-0.7, 0.92, -0.48, 1.02);
  s.quadraticCurveTo(0.15, 1.11, 0.78, 1.02);
  s.quadraticCurveTo(1.02, 0.92, 1.15, 0.76);
  s.lineTo(-0.95, 0.78);
  return s;
}

// Extrude a side-profile shape across the width, then orient so the
// shape's local X becomes world Z and the extrude depth becomes world X.
function extrudeAcrossWidth(shape: THREE.Shape, depth: number, bevel = 0.04) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: bevel,
    bevelThickness: bevel,
    curveSegments: 22,
  });
  g.translate(0, 0, -depth / 2);      // centre width around X=0
  g.rotateY(-Math.PI / 2);            // shape X → world Z, extrude Z → −world X (still centred)
  return g;
}

export function Body({ color = "#22d3ee" }: { color?: string }) {
  const bodyMat = useMemo(() => paintMat(color), [color]);

  const geoms = useMemo(() => {
    const body = extrudeAcrossWidth(bodySideProfile(), WIDTH, 0.05);
    const cabin = extrudeAcrossWidth(greenhouseProfile(), CABIN_WIDTH, 0.02);
    return { body, cabin };
  }, []);

  const grilleMeshMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#050608",
        metalness: 0.85,
        roughness: 0.32,
      }),
    [],
  );

  const badgeMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#e8ecf2",
        metalness: 1,
        roughness: 0.12,
        clearcoat: 1,
      }),
    [],
  );

  return (
    <group name="Body">
      {/* ── Unified painted shell (hood, cabin, trunk, fenders, sills) */}
      <mesh castShadow receiveShadow geometry={geoms.body} material={bodyMat} />

      {/* ── Greenhouse: windshield / roof / backlight / side windows */}
      <mesh castShadow geometry={geoms.cabin} material={glassMat} />

      {/* Chrome window trim strip along the greenhouse base */}
      <mesh position={[CABIN_WIDTH_HALF + 0.005, 0.76, 0.1]} material={chromeMat}>
        <boxGeometry args={[0.015, 0.02, 2.05]} />
      </mesh>
      <mesh position={[-(CABIN_WIDTH_HALF + 0.005), 0.76, 0.1]} material={chromeMat}>
        <boxGeometry args={[0.015, 0.02, 2.05]} />
      </mesh>

      {/* ── Front-end detail: grille, headlight housings, badge, valance */}
      <mesh position={[0, 0.36, -LEN_HALF - 0.01]} material={grilleMeshMat}>
        <boxGeometry args={[1.05, 0.22, 0.04]} />
      </mesh>
      <mesh position={[0, 0.48, -LEN_HALF - 0.012]} material={chromeMat}>
        <boxGeometry args={[1.08, 0.02, 0.02]} />
      </mesh>
      <mesh position={[0, 0.24, -LEN_HALF - 0.012]} material={chromeMat}>
        <boxGeometry args={[1.08, 0.02, 0.02]} />
      </mesh>
      <mesh position={[0, 0.36, -LEN_HALF - 0.03]} material={badgeMat}>
        <cylinderGeometry args={[0.055, 0.055, 0.008, 24]} />
      </mesh>
      {/* Front lower valance / intake */}
      <mesh position={[0, 0.08, -LEN_HALF - 0.008]} material={darkTrimMat}>
        <boxGeometry args={[1.55, 0.14, 0.05]} />
      </mesh>

      {/* Rear detail: tail-light strip + valance + reflectors */}
      <mesh position={[0, 0.42, LEN_HALF + 0.011]} material={darkTrimMat}>
        <boxGeometry args={[1.6, 0.14, 0.02]} />
      </mesh>
      <mesh position={[0, 0.08, LEN_HALF + 0.008]} material={darkTrimMat}>
        <boxGeometry args={[1.55, 0.14, 0.05]} />
      </mesh>

      {/* Side sill rocker trim (below the doors) */}
      <mesh position={[WIDTH_HALF - 0.01, -0.02, 0]} material={darkTrimMat}>
        <boxGeometry args={[0.04, 0.1, 1.7]} />
      </mesh>
      <mesh position={[-(WIDTH_HALF - 0.01), -0.02, 0]} material={darkTrimMat}>
        <boxGeometry args={[0.04, 0.1, 1.7]} />
      </mesh>

      {/* Beltline character crease — subtle dark inset along body sides */}
      <mesh position={[WIDTH_HALF + 0.002, 0.5, 0]} material={darkTrimMat}>
        <boxGeometry args={[0.005, 0.015, 3.3]} />
      </mesh>
      <mesh position={[-(WIDTH_HALF + 0.002), 0.5, 0]} material={darkTrimMat}>
        <boxGeometry args={[0.005, 0.015, 3.3]} />
      </mesh>

      {/* ── Doors (subgroup: door cut-lines + handles) */}
      <group name="Doors">
        {(
          [
            [WIDTH_HALF + 0.003, -0.4, "FL"],
            [-(WIDTH_HALF + 0.003), -0.4, "FR"],
            [WIDTH_HALF + 0.003, 0.65, "RL"],
            [-(WIDTH_HALF + 0.003), 0.65, "RR"],
          ] as [number, number, string][]
        ).map(([x, z, key]) => (
          <group key={key} name={`Door_${key}`} position={[x, 0.32, z]}>
            {/* Vertical door cut-line */}
            <mesh position={[0, 0, -0.5]} material={darkTrimMat}>
              <boxGeometry args={[0.006, 0.7, 0.008]} />
            </mesh>
            <mesh position={[0, 0, 0.5]} material={darkTrimMat}>
              <boxGeometry args={[0.006, 0.7, 0.008]} />
            </mesh>
            {/* Door handle (chrome) with dark recess */}
            <mesh position={[0, 0.24, 0]} material={darkTrimMat}>
              <boxGeometry args={[0.02, 0.055, 0.22]} />
            </mesh>
            <mesh position={[0.008, 0.24, 0]} material={chromeMat}>
              <boxGeometry args={[0.018, 0.035, 0.19]} />
            </mesh>
          </group>
        ))}
      </group>

      {/* ── Mirrors: arm + curved housing + glass */}
      <group name="Mirrors">
        {(
          [
            [WIDTH_HALF, -0.78, "L"],
            [-WIDTH_HALF, -0.78, "R"],
          ] as [number, number, string][]
        ).map(([x, z, key]) => {
          const sign = Math.sign(x);
          return (
            <group key={key} name={`Mirror_${key}`} position={[x, 0.86, z]}>
              <mesh material={bodyMat}>
                <boxGeometry args={[0.05, 0.04, 0.14]} />
              </mesh>
              <mesh position={[sign * 0.09, 0, 0]} castShadow material={bodyMat}>
                <sphereGeometry args={[0.085, 18, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
              </mesh>
              <mesh
                position={[sign * 0.145, 0, 0]}
                rotation={[0, sign * 0.15, 0]}
                material={glassMat}
              >
                <boxGeometry args={[0.008, 0.08, 0.15]} />
              </mesh>
            </group>
          );
        })}
      </group>

      {/* ── License plate holder (front + rear) */}
      <group name="PlateHolder">
        <mesh position={[0, 0.14, -LEN_HALF - 0.032]} material={plasticMat}>
          <boxGeometry args={[0.6, 0.14, 0.015]} />
        </mesh>
        <mesh position={[0, 0.14, -LEN_HALF - 0.041]}>
          <boxGeometry args={[0.54, 0.11, 0.004]} />
          <meshStandardMaterial color="#eeeeee" roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.14, LEN_HALF + 0.022]} material={plasticMat}>
          <boxGeometry args={[0.6, 0.14, 0.015]} />
        </mesh>
        <mesh position={[0, 0.14, LEN_HALF + 0.028]}>
          <boxGeometry args={[0.54, 0.11, 0.004]} />
          <meshStandardMaterial color="#f4d03f" roughness={0.55} />
        </mesh>
      </group>

      {/* Roof shark-fin antenna */}
      <mesh castShadow position={[0, 1.14, 0.72]} material={darkTrimMat}>
        <boxGeometry args={[0.055, 0.075, 0.16]} />
      </mesh>

      {/* Exhaust tips */}
      <mesh
        position={[0.55, 0.07, LEN_HALF + 0.05]}
        rotation={[0, 0, Math.PI / 2]}
        material={chromeMat}
      >
        <cylinderGeometry args={[0.055, 0.055, 0.09, 20]} />
      </mesh>
      <mesh
        position={[-0.55, 0.07, LEN_HALF + 0.05]}
        rotation={[0, 0, Math.PI / 2]}
        material={chromeMat}
      >
        <cylinderGeometry args={[0.055, 0.055, 0.09, 20]} />
      </mesh>
    </group>
  );
}
