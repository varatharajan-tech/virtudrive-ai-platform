import { useMemo } from "react";
import * as THREE from "three";
import {
  paintMat,
  matteBlackMat,
  pianoBlackMat,
  glassMat,
  chromeMat,
  makeEmissive,
} from "./materials";

/**
 * Low-poly stylized sports car body.
 *
 * The chassis is a SINGLE continuous mesh built from an ExtrudeGeometry:
 * a 2D side profile (length × height) is extruded across the vehicle width
 * with bevelled edges, so every silhouette corner is rounded — no boxy
 * panels. Semicircular holes in the profile become full-width wheel arches
 * that the wheels sit recessed inside.
 *
 * Local frame (inside chassis group):
 *   +X = right, +Y = up, +Z = rear   (car forward is -Z)
 *   Y=0 is wheel-center height.
 *
 * Preserved for physics (do NOT change):
 *   overall length ≈ 4.10, width ≈ 1.72
 *   wheels at |x| = 0.86,  wheelbase = 2.70
 */

const LENGTH = 4.10;
const WIDTH = 1.72;
const HALF_W = WIDTH / 2;
const FRONT_Z = -LENGTH / 2;    // -2.05
const REAR_Z = LENGTH / 2;      // +2.05
const ROCKER_Y = -0.24;

// Wheel arch parameters (must line up with Vehicle.tsx wheelBaseHalf=1.35, trackHalf=0.85)
const ARCH_R = 0.50;
const FRONT_WHEEL_U = 0.70;     // u along profile (u=0 is front bumper)
const REAR_WHEEL_U = 3.40;

/**
 * Build a rounded-edge, tapered sports-car silhouette in the (u=length, v=height)
 * plane, with two semicircular arch holes at the wheel stations.
 * Returned as a THREE.Shape ready for extrusion across the body width.
 */
function buildSilhouette(): THREE.Shape {
  const s = new THREE.Shape();
  // Points along the top of the silhouette (front → rear), CCW when
  // paired with the flat rocker along the bottom.
  const pts: [number, number][] = [
    [0.00, -0.10],              // front bumper, low chin
    [0.10,  0.08],              // splitter → nose rise
    [0.35,  0.24],              // hood slope
    [0.75,  0.30],              // hood high
    [1.35,  0.34],              // hood flat / cowl
    [1.55,  0.36],              // windshield base
    [1.95,  0.76],              // roof front (windshield top)
    [2.55,  0.78],              // roof rear (fastback peak)
    [3.05,  0.58],              // rear glass fall
    [3.55,  0.42],              // rear deck / spoiler lip
    [3.90,  0.36],              // trunk lip
    [4.05,  0.22],              // rear bumper top
    [4.10, -0.05],              // rear bumper corner
  ];

  s.moveTo(0, ROCKER_Y);
  // bottom edge front → rear
  s.lineTo(LENGTH, ROCKER_Y);
  // rear corner up
  s.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
  // top profile rear → front using quadratic curves for smoothness
  for (let i = pts.length - 2; i >= 0; i--) {
    const [x, y] = pts[i];
    const [px, py] = pts[i + 1];
    const cx = (x + px) / 2;
    const cy = Math.max(y, py) + 0.01;
    s.quadraticCurveTo(cx, cy, x, y);
  }
  s.lineTo(0, ROCKER_Y);

  // Wheel-arch holes (semicircles opening downward through the rocker)
  const archHole = (uCenter: number) => {
    const h = new THREE.Path();
    // Start at right-most point on the arch (u+R, ROCKER_Y), sweep CCW up
    // and over, ending at left-most point (u-R, ROCKER_Y). Because this is
    // a *hole* inside the outer CCW shape, we traverse it CW.
    h.moveTo(uCenter + ARCH_R, ROCKER_Y);
    h.absarc(uCenter, ROCKER_Y, ARCH_R, 0, Math.PI, false);
    h.lineTo(uCenter - ARCH_R, ROCKER_Y);
    return h;
  };
  s.holes.push(archHole(FRONT_WHEEL_U));
  s.holes.push(archHole(REAR_WHEEL_U));

  return s;
}

export function Body({ color = "#1fb3a0" }: { color?: string }) {
  const bodyMat = useMemo(() => paintMat(color), [color]);

  // Chassis: one continuous extruded mesh with bevelled edges.
  const chassisGeo = useMemo(() => {
    const shape = buildSilhouette();
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: WIDTH,
      curveSegments: 18,
      bevelEnabled: true,
      bevelThickness: 0.09,
      bevelSize: 0.09,
      bevelSegments: 4,
    });
    // Center in width and length. Currently: u∈[-bevel, LENGTH+bevel] on X,
    // v on Y, extruded 0..WIDTH on Z. We want length on Z (front = -Z),
    // width on X, centered on origin.
    geo.translate(-LENGTH / 2, 0, -WIDTH / 2);
    // Rotate so profile length axis (X) → -Z (vehicle forward = -Z),
    // and extrusion axis (Z) → +X.
    geo.rotateY(-Math.PI / 2);
    geo.computeVertexNormals();
    return geo;
  }, []);

  // Cabin glass "canopy": smaller extrude covering only the greenhouse.
  const canopyGeo = useMemo(() => {
    const s = new THREE.Shape();
    // Greenhouse profile (u, v) — from windshield base up over roof to rear glass
    const g: [number, number][] = [
      [1.55, 0.36],
      [1.95, 0.76],
      [2.55, 0.78],
      [3.05, 0.58],
      [3.05, 0.35],
      [1.55, 0.35],
    ];
    s.moveTo(g[0][0], g[0][1]);
    for (let i = 1; i < g.length; i++) s.lineTo(g[i][0], g[i][1]);
    s.lineTo(g[0][0], g[0][1]);

    const geo = new THREE.ExtrudeGeometry(s, {
      depth: WIDTH - 0.16,
      curveSegments: 8,
      bevelEnabled: true,
      bevelThickness: 0.04,
      bevelSize: 0.04,
      bevelSegments: 2,
    });
    geo.translate(-LENGTH / 2, 0, -(WIDTH - 0.16) / 2);
    geo.rotateY(-Math.PI / 2);
    geo.computeVertexNormals();
    return geo;
  }, []);

  // Wheel-well liner (dark cylinder inside each arch, spanning width)
  const linerGeo = useMemo(
    () => new THREE.CylinderGeometry(ARCH_R - 0.02, ARCH_R - 0.02, WIDTH - 0.04, 20, 1, true, 0, Math.PI),
    [],
  );

  // Emissive lamp materials (simple, always-on DRLs baked into body — the
  // dynamic headlights live in Lights.tsx and overlay on top).
  const drlMat = useMemo(() => makeEmissive("#e6f2ff", 1.0), []);
  const tailMat = useMemo(() => makeEmissive("#ff2b2b", 0.55), []);

  return (
    <group>
      {/* ── Main chassis (single continuous mesh) ───────────────────── */}
      <mesh geometry={chassisGeo} material={bodyMat} castShadow receiveShadow />

      {/* ── Cabin glass canopy ──────────────────────────────────────── */}
      <mesh geometry={canopyGeo} material={glassMat} />

      {/* ── Wheel-well liners (matte black tunnel through each arch) ─ */}
      {[-1.35, 1.35].map((z) => (
        <mesh
          key={`liner-${z}`}
          position={[0, 0, z]}
          rotation={[0, 0, Math.PI / 2]}
          geometry={linerGeo}
          material={matteBlackMat}
        />
      ))}

      {/* ── Belt-line chrome accent ─────────────────────────────────── */}
      {[1, -1].map((sx) => (
        <mesh
          key={`belt-${sx}`}
          position={[sx * (HALF_W - 0.01), 0.30, 0.2]}
          material={chromeMat}
        >
          <boxGeometry args={[0.012, 0.018, 2.4]} />
        </mesh>
      ))}

      {/* ── Front grille (matte black slot) ─────────────────────────── */}
      <mesh position={[0, 0.02, FRONT_Z + 0.04]} material={matteBlackMat}>
        <boxGeometry args={[1.20, 0.14, 0.05]} />
      </mesh>

      {/* ── Baked DRL strip in the grille (bright accent) ───────────── */}
      <mesh position={[0, 0.10, FRONT_Z + 0.05]} material={drlMat}>
        <boxGeometry args={[1.10, 0.03, 0.02]} />
      </mesh>

      {/* ── Rear tail-light bar (slim LED strip across the trunk) ───── */}
      <mesh position={[0, 0.32, REAR_Z - 0.02]} material={tailMat}>
        <boxGeometry args={[1.50, 0.05, 0.02]} />
      </mesh>

      {/* ── License plate recess ────────────────────────────────────── */}
      <mesh position={[0, 0.08, REAR_Z - 0.01]} material={matteBlackMat}>
        <boxGeometry args={[0.42, 0.10, 0.02]} />
      </mesh>

      {/* ── Door handles (small, flush) ─────────────────────────────── */}
      {([[0.86, 0.15], [-0.86, 0.15]] as const).map(([x, z], i) => (
        <mesh
          key={`hdl-${i}`}
          position={[x, 0.28, z]}
          rotation={[0, 0, Math.PI / 2]}
          material={chromeMat}
        >
          <capsuleGeometry args={[0.014, 0.10, 4, 8]} />
        </mesh>
      ))}

      {/* ── Side mirrors (compact, body-color pod) ──────────────────── */}
      {[1, -1].map((sx) => (
        <group key={`mir-${sx}`} position={[sx * (HALF_W + 0.02), 0.42, -0.30]}>
          <mesh
            position={[sx * 0.09, 0, 0]}
            rotation={[0, 0, Math.PI / 2]}
            material={bodyMat}
            castShadow
          >
            <capsuleGeometry args={[0.045, 0.08, 4, 10]} />
          </mesh>
          <mesh
            position={[sx * 0.13, 0.015, 0]}
            rotation={[0, sx * 0.15, 0]}
            material={pianoBlackMat}
          >
            <boxGeometry args={[0.008, 0.065, 0.10]} />
          </mesh>
        </group>
      ))}

      {/* ── Small roof sensor pod (compact, proportional) ───────────── */}
      <group position={[0, 0.82, 0.0]}>
        <mesh material={pianoBlackMat}>
          <cylinderGeometry args={[0.06, 0.07, 0.04, 20]} />
        </mesh>
        <mesh position={[0, 0.03, 0]} material={matteBlackMat}>
          <cylinderGeometry args={[0.05, 0.05, 0.02, 20]} />
        </mesh>
      </group>
    </group>
  );
}
