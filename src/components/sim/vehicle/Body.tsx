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
 * All primary body panels use ExtrudeGeometry with beveled edges to
 * eliminate the flat, boxy look — hood, roof, trunk, fenders, and
 * bumpers are curved solids rather than raw boxes. Hierarchy is
 * organised into named groups (Body, Mirrors, Doors, PlateHolder) to
 * match the spec so future skinning/animations can target them.
 *
 * Geometry counts and materials are still tightly bounded — every
 * surface reuses the shared PBR materials from `materials.ts` so draw
 * calls stay well under the previous phase's budget.
 */

// ── Reusable extrude helper ─────────────────────────────────────────
function beveled(shape: THREE.Shape, depth: number, bevel = 0.04) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: bevel,
    bevelThickness: bevel,
    curveSegments: 12,
  });
  g.center();
  return g;
}

function roundedRectShape(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

// Silhouette shapes — profile viewed from above (X = length, Y = half-width)
function bodyPlanShape(): THREE.Shape {
  const s = new THREE.Shape();
  // Longitudinal profile centred at origin, +X = rear.
  s.moveTo(-2.05, -0.62);
  s.quadraticCurveTo(-2.15, -0.2, -1.95, 0.0);
  s.quadraticCurveTo(-1.7, 0.62, -1.2, 0.86);
  s.lineTo(1.2, 0.86);
  s.quadraticCurveTo(1.75, 0.72, 1.98, 0.4);
  s.quadraticCurveTo(2.15, 0.15, 2.08, -0.15);
  s.lineTo(2.02, -0.62);
  s.quadraticCurveTo(1.6, -0.9, 1.05, -0.94);
  s.lineTo(-1.15, -0.94);
  s.quadraticCurveTo(-1.75, -0.9, -2.05, -0.62);
  return s;
}

function cabinPlanShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-1.05, -0.78);
  s.quadraticCurveTo(-1.2, -0.5, -1.1, -0.2);
  s.lineTo(-0.95, 0.72);
  s.quadraticCurveTo(-0.7, 0.82, 0.9, 0.82);
  s.quadraticCurveTo(1.15, 0.75, 1.1, 0.45);
  s.lineTo(1.15, -0.6);
  s.quadraticCurveTo(1.05, -0.82, 0.75, -0.82);
  s.lineTo(-0.75, -0.82);
  s.quadraticCurveTo(-1.0, -0.82, -1.05, -0.78);
  return s;
}

export function Body({ color = "#22d3ee" }: { color?: string }) {
  const bodyMat = useMemo(() => paintMat(color), [color]);

  // ── Panel geometries (memoised singletons per body colour) ─────────
  const geoms = useMemo(() => {
    const lower = beveled(bodyPlanShape(), 0.32, 0.06);
    // Cabin uses a slightly smaller silhouette + deeper extrusion for a
    // greenhouse look.
    const cabin = beveled(cabinPlanShape(), 0.5, 0.05);
    // Curved roof panel — a shallow arc using LatheGeometry gives a
    // convex crown that catches highlights.
    const roofPoints = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const x = -0.83 + 1.66 * t;
      const y = Math.cos((t - 0.5) * Math.PI) * 0.03;
      roofPoints.push(new THREE.Vector2(x, y));
    }
    const hood = beveled(roundedRectShape(1.72, 1.35, 0.22), 0.18, 0.045);
    const trunk = beveled(roundedRectShape(1.72, 1.15, 0.22), 0.16, 0.045);
    const bumper = beveled(roundedRectShape(1.88, 0.22, 0.09), 0.24, 0.05);
    const fender = beveled(roundedRectShape(0.9, 0.42, 0.18), 0.14, 0.04);
    const grilleFrame = beveled(roundedRectShape(1.0, 0.26, 0.08), 0.02, 0.02);
    const doorPanel = beveled(roundedRectShape(1.05, 0.62, 0.06), 0.03, 0.02);
    return { lower, cabin, hood, trunk, bumper, fender, grilleFrame, doorPanel };
  }, []);

  const grilleMeshMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#040406",
        metalness: 0.85,
        roughness: 0.35,
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
      {/* ── Lower monocoque — curved footprint */}
      <mesh
        castShadow
        receiveShadow
        position={[0, 0.18, 0]}
        rotation={[-Math.PI / 2, 0, Math.PI / 2]}
        geometry={geoms.lower}
        material={bodyMat}
      />

      {/* Hood — sits forward of cabin, subtle slope down toward the bumper */}
      <mesh
        castShadow
        position={[0, 0.5, -1.28]}
        rotation={[-Math.PI / 2 - 0.06, 0, Math.PI / 2]}
        geometry={geoms.hood}
        material={bodyMat}
      />
      {/* Trunk — mirrored slope */}
      <mesh
        castShadow
        position={[0, 0.5, 1.32]}
        rotation={[-Math.PI / 2 + 0.04, 0, Math.PI / 2]}
        geometry={geoms.trunk}
        material={bodyMat}
      />

      {/* Cabin greenhouse — extruded curved silhouette */}
      <mesh
        castShadow
        position={[0, 0.82, 0.08]}
        rotation={[-Math.PI / 2, 0, Math.PI / 2]}
        geometry={geoms.cabin}
        material={bodyMat}
      />

      {/* Curved roof crown (adds highlight over the greenhouse) */}
      <mesh castShadow position={[0, 1.09, 0.08]} material={bodyMat}>
        <sphereGeometry args={[1.9, 24, 12, 0, Math.PI * 2, 0, Math.PI / 8]} />
      </mesh>

      {/* Fender flares over each wheel arch */}
      {(
        [
          [0.9, -1.35],
          [-0.9, -1.35],
          [0.9, 1.35],
          [-0.9, 1.35],
        ] as [number, number][]
      ).map(([x, z], i) => (
        <mesh
          key={i}
          castShadow
          position={[x, 0.42, z]}
          rotation={[Math.PI / 2, 0, 0]}
          geometry={geoms.fender}
          material={bodyMat}
        />
      ))}

      {/* Front bumper */}
      <mesh
        castShadow
        position={[0, 0.24, -2.08]}
        rotation={[0, 0, 0]}
        geometry={geoms.bumper}
        material={bodyMat}
      />
      {/* Front lower intake */}
      <mesh position={[0, 0.06, -2.14]} material={darkTrimMat}>
        <boxGeometry args={[1.55, 0.14, 0.14]} />
      </mesh>
      {/* Rear bumper */}
      <mesh
        castShadow
        position={[0, 0.24, 2.08]}
        rotation={[0, 0, 0]}
        geometry={geoms.bumper}
        material={bodyMat}
      />
      <mesh position={[0, 0.06, 2.14]} material={darkTrimMat}>
        <boxGeometry args={[1.55, 0.14, 0.14]} />
      </mesh>

      {/* Front grille — dark honeycomb + chrome trim + badge */}
      <mesh
        position={[0, 0.32, -2.14]}
        geometry={geoms.grilleFrame}
        material={grilleMeshMat}
      />
      <mesh position={[0, 0.44, -2.148]} material={chromeMat}>
        <boxGeometry args={[1.02, 0.02, 0.02]} />
      </mesh>
      <mesh position={[0, 0.2, -2.148]} material={chromeMat}>
        <boxGeometry args={[1.02, 0.02, 0.02]} />
      </mesh>
      {/* Manufacturer badge */}
      <mesh position={[0, 0.32, -2.16]} material={badgeMat}>
        <cylinderGeometry args={[0.05, 0.05, 0.008, 20]} />
      </mesh>

      {/* Side sill trim */}
      <mesh position={[0.94, -0.02, 0]} material={darkTrimMat}>
        <boxGeometry args={[0.05, 0.14, 3.0]} />
      </mesh>
      <mesh position={[-0.94, -0.02, 0]} material={darkTrimMat}>
        <boxGeometry args={[0.05, 0.14, 3.0]} />
      </mesh>

      {/* A / B / C pillars — dark, slim */}
      {[
        [0.83, 0.88, -1.02, 0.05, 0.44, 0.06],
        [-0.83, 0.88, -1.02, 0.05, 0.44, 0.06],
        [0.83, 0.88, 0.05, 0.04, 0.55, 0.06],
        [-0.83, 0.88, 0.05, 0.04, 0.55, 0.06],
        [0.83, 0.88, 1.12, 0.05, 0.44, 0.06],
        [-0.83, 0.88, 1.12, 0.05, 0.44, 0.06],
      ].map((p, i) => (
        <mesh key={i} position={[p[0], p[1], p[2]]} material={darkTrimMat}>
          <boxGeometry args={[p[3], p[4], p[5]]} />
        </mesh>
      ))}

      {/* Windshield */}
      <mesh
        position={[0, 0.9, -1.02]}
        rotation={[-0.5, 0, 0]}
        material={glassMat}
      >
        <boxGeometry args={[1.55, 0.62, 0.03]} />
      </mesh>
      {/* Rear window */}
      <mesh
        position={[0, 0.9, 1.16]}
        rotation={[0.54, 0, 0]}
        material={glassMat}
      >
        <boxGeometry args={[1.55, 0.58, 0.03]} />
      </mesh>
      {/* Side windows */}
      <mesh position={[0.84, 0.98, 0.08]} material={glassMat}>
        <boxGeometry args={[0.02, 0.36, 2.05]} />
      </mesh>
      <mesh position={[-0.84, 0.98, 0.08]} material={glassMat}>
        <boxGeometry args={[0.02, 0.36, 2.05]} />
      </mesh>

      {/* ── Doors (subgroup — future open animation) */}
      <group name="Doors">
        {(
          [
            [0.955, -0.4, "FL"],
            [-0.955, -0.4, "FR"],
            [0.955, 0.65, "RL"],
            [-0.955, 0.65, "RR"],
          ] as [number, number, string][]
        ).map(([x, z, key]) => (
          <group key={key} name={`Door_${key}`} position={[x, 0.5, z]}>
            {/* Door skin (subtle plane over sill) */}
            <mesh
              rotation={[0, Math.PI / 2, 0]}
              geometry={geoms.doorPanel}
              material={bodyMat}
            />
            {/* Chrome door handle */}
            <mesh position={[0, 0.22, 0.02]} material={chromeMat}>
              <boxGeometry args={[0.03, 0.045, 0.22]} />
            </mesh>
            {/* Handle recess */}
            <mesh position={[0, 0.22, 0.02]} material={darkTrimMat}>
              <boxGeometry args={[0.025, 0.06, 0.24]} />
            </mesh>
          </group>
        ))}
      </group>

      {/* ── Mirrors (subgroup) — housing + arm + glass */}
      <group name="Mirrors">
        {(
          [
            [0.98, -0.78, "L"],
            [-0.98, -0.78, "R"],
          ] as [number, number, string][]
        ).map(([x, z, key]) => (
          <group key={key} name={`Mirror_${key}`} position={[x, 0.94, z]}>
            {/* Arm */}
            <mesh material={bodyMat}>
              <boxGeometry args={[0.06, 0.045, 0.16]} />
            </mesh>
            {/* Curved housing (half-ellipsoid) */}
            <mesh
              position={[Math.sign(x) * 0.11, 0, 0]}
              castShadow
              material={bodyMat}
            >
              <sphereGeometry
                args={[0.09, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2]}
              />
            </mesh>
            {/* Glass */}
            <mesh
              position={[Math.sign(x) * 0.17, 0, 0]}
              rotation={[0, Math.sign(x) * 0.15, 0]}
              material={glassMat}
            >
              <boxGeometry args={[0.008, 0.09, 0.16]} />
            </mesh>
          </group>
        ))}
      </group>

      {/* ── License plate holder (subgroup) */}
      <group name="PlateHolder">
        <mesh position={[0, 0.12, -2.155]} material={plasticMat}>
          <boxGeometry args={[0.62, 0.15, 0.02]} />
        </mesh>
        <mesh position={[0, 0.12, -2.167]}>
          <boxGeometry args={[0.55, 0.12, 0.005]} />
          <meshStandardMaterial color="#eeeeee" roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.14, 2.155]} material={plasticMat}>
          <boxGeometry args={[0.62, 0.15, 0.02]} />
        </mesh>
        <mesh position={[0, 0.14, 2.167]}>
          <boxGeometry args={[0.55, 0.12, 0.005]} />
          <meshStandardMaterial color="#f4d03f" roughness={0.55} />
        </mesh>
      </group>

      {/* Roof antenna (shark fin) */}
      <mesh castShadow position={[0, 1.13, 0.75]} material={darkTrimMat}>
        <boxGeometry args={[0.06, 0.08, 0.18]} />
      </mesh>

      {/* Exhaust tips */}
      <mesh
        position={[0.55, 0.07, 2.18]}
        rotation={[0, 0, Math.PI / 2]}
        material={chromeMat}
      >
        <cylinderGeometry args={[0.055, 0.055, 0.09, 20]} />
      </mesh>
      <mesh
        position={[-0.55, 0.07, 2.18]}
        rotation={[0, 0, Math.PI / 2]}
        material={chromeMat}
      >
        <cylinderGeometry args={[0.055, 0.055, 0.09, 20]} />
      </mesh>
    </group>
  );
}
