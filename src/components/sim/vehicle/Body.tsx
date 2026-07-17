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
 * Modern 4-door sedan body.
 *
 * Built from clean primitives so the silhouette is predictable and symmetric:
 *  1. Lower body  — rounded-rectangle slab extruded along Y (chassis + fenders
 *                   in one continuous shell, bevelled edges).
 *  2. Greenhouse  — tapered roof slab + angled windshield/rear glass + 4 side
 *                   windows framed by A/B/C pillars.
 *  3. Details     — grille, splitter, side skirts, flush handles, teardrop
 *                   mirrors, slim LED strips, exhaust tips, shark-fin antenna.
 *
 * Local frame (inside chassis group):
 *   +X = right, +Y = up, +Z = rear   (car forward is -Z)
 *   Y=0 is wheel-center height.
 *
 * Preserved for physics (do NOT change):
 *   overall length ≈ 4.10, width ≈ 1.72
 *   wheels at |x| = 0.86, wheelbase = 2.70
 *   Lights.tsx anchors at Z = ±2.06
 */

const LENGTH = 4.10;
const WIDTH = 1.72;
const HALF_W = WIDTH / 2;
const FRONT_Z = -LENGTH / 2;  // -2.05
const REAR_Z = LENGTH / 2;    //  2.05
const ROCKER_Y = -0.24;       //  bottom of body (top of tires ~ y=+0.12)
const BELT_Y = 0.42;          //  top of lower body / bottom of greenhouse
const ROOF_Y = 0.86;          //  top of roof
const ROOF_FRONT_Z = -0.20;
const ROOF_REAR_Z = 0.60;
const CABIN_FRONT_Z = -0.70;  // windshield base on the beltline
const CABIN_REAR_Z = 0.92;    // rear glass base on the beltline

/**
 * Rounded-rectangle plan-view slab, extruded along +Y with bevelled edges.
 * Returns a geometry centered on origin in X and Z, sitting from y=0 to y=height.
 */
function roundedSlab(
  lengthZ: number,
  widthX: number,
  height: number,
  radius: number,
  bevel = 0.04,
): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  const w = widthX / 2;
  const l = lengthZ / 2;
  const r = Math.min(radius, w - 0.01, l - 0.01);
  // Build a rounded rect in the XZ plane (X horizontal, Z vertical in shape space).
  s.moveTo(-w + r, -l);
  s.lineTo(w - r, -l);
  s.quadraticCurveTo(w, -l, w, -l + r);
  s.lineTo(w, l - r);
  s.quadraticCurveTo(w, l, w - r, l);
  s.lineTo(-w + r, l);
  s.quadraticCurveTo(-w, l, -w, l - r);
  s.lineTo(-w, -l + r);
  s.quadraticCurveTo(-w, -l, -w + r, -l);

  const geo = new THREE.ExtrudeGeometry(s, {
    depth: height,
    curveSegments: 16,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
  });
  // Shape lives in XY plane; extrusion is +Z. Rotate so extrusion becomes +Y.
  geo.rotateX(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

/** Trapezoidal roof plan-view slab (wider at front-beltline, narrower at roof). */
function tapezRoofSlab(
  frontZ: number,
  rearZ: number,
  widthX: number,
  height: number,
  radius: number,
): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  const w = widthX / 2;
  const r = radius;
  s.moveTo(-w + r, frontZ);
  s.lineTo(w - r, frontZ);
  s.quadraticCurveTo(w, frontZ, w, frontZ + r);
  s.lineTo(w, rearZ - r);
  s.quadraticCurveTo(w, rearZ, w - r, rearZ);
  s.lineTo(-w + r, rearZ);
  s.quadraticCurveTo(-w, rearZ, -w, rearZ - r);
  s.lineTo(-w, frontZ + r);
  s.quadraticCurveTo(-w, frontZ, -w + r, frontZ);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: height,
    curveSegments: 12,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: 2,
  });
  geo.rotateX(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

export function Body({ color = "#1fb3a0" }: { color?: string }) {
  const bodyMat = useMemo(() => paintMat(color), [color]);

  // ── Lower body: one continuous shell from rockers to beltline.
  const lowerGeo = useMemo(
    () => roundedSlab(LENGTH, WIDTH, BELT_Y - ROCKER_Y, 0.34, 0.06),
    [],
  );

  // ── Roof slab (narrower than beltline — tumblehome).
  const roofGeo = useMemo(
    () => tapezRoofSlab(ROOF_FRONT_Z, ROOF_REAR_Z, 1.48, 0.06, 0.22),
    [],
  );

  // ── Hood dome (subtle raised hood surface).
  const hoodGeo = useMemo(
    () => roundedSlab(1.35, 1.42, 0.04, 0.20, 0.02),
    [],
  );

  // ── Trunk dome (short rear deck raise).
  const trunkGeo = useMemo(
    () => roundedSlab(1.05, 1.42, 0.03, 0.20, 0.02),
    [],
  );

  // Wheel-well liners
  const linerGeo = useMemo(
    () => new THREE.CylinderGeometry(0.44, 0.44, WIDTH - 0.04, 20, 1, true, 0, Math.PI),
    [],
  );

  // DRL / tail strip emissives baked into body (Lights.tsx overlays dynamic ones)
  const drlMat = useMemo(() => makeEmissive("#eaf5ff", 0.8), []);
  const tailMat = useMemo(() => makeEmissive("#ff2222", 0.5), []);

  // Helper: an angled thin glass panel (thin slab, then rotated about X).
  const glassPanel = (w: number, h: number, thickness = 0.02) =>
    new THREE.BoxGeometry(w, h, thickness);

  const windshieldGeo = useMemo(
    () => glassPanel(1.52, Math.hypot(ROOF_FRONT_Z - CABIN_FRONT_Z, ROOF_Y - BELT_Y)),
    [],
  );
  const rearGlassGeo = useMemo(
    () => glassPanel(1.48, Math.hypot(CABIN_REAR_Z - ROOF_REAR_Z, ROOF_Y - BELT_Y)),
    [],
  );

  // Windshield tilt: from (y=BELT, z=CABIN_FRONT_Z) up to (y=ROOF, z=ROOF_FRONT_Z)
  const wsDZ = ROOF_FRONT_Z - CABIN_FRONT_Z; // positive (roof is behind cabin front)
  const wsDY = ROOF_Y - BELT_Y;
  const wsAngle = Math.atan2(wsDZ, wsDY); // rotation about X
  const wsCenter: [number, number, number] = [
    0,
    (BELT_Y + ROOF_Y) / 2,
    (CABIN_FRONT_Z + ROOF_FRONT_Z) / 2,
  ];

  // Rear glass tilt: from (BELT, CABIN_REAR_Z) up to (ROOF, ROOF_REAR_Z)
  const rgDZ = ROOF_REAR_Z - CABIN_REAR_Z; // negative
  const rgDY = ROOF_Y - BELT_Y;
  const rgAngle = Math.atan2(rgDZ, rgDY);
  const rgCenter: [number, number, number] = [
    0,
    (BELT_Y + ROOF_Y) / 2,
    (CABIN_REAR_Z + ROOF_REAR_Z) / 2,
  ];

  // Side windows: 2 per side, front door + rear door.
  const sideWindowH = 0.32;
  const sideWinFront = { zc: -0.25, len: 0.78 }; // front door glass
  const sideWinRear = { zc: 0.42, len: 0.72 };   // rear door glass
  const sideWinY = BELT_Y + sideWindowH / 2 + 0.03;

  // Pillar (thin gloss-black box) helper
  const pillarBox = (t: number, h: number, len: number) =>
    new THREE.BoxGeometry(t, h, len);

  const aPillarLen = Math.hypot(ROOF_FRONT_Z - CABIN_FRONT_Z, ROOF_Y - BELT_Y);
  const cPillarLen = Math.hypot(CABIN_REAR_Z - ROOF_REAR_Z, ROOF_Y - BELT_Y);

  return (
    <group>
      {/* ── Lower body shell ────────────────────────────────────────── */}
      <mesh
        geometry={lowerGeo}
        material={bodyMat}
        position={[0, ROCKER_Y, 0]}
        castShadow
        receiveShadow
      />

      {/* Hood (raised subtly above beltline for a proper crown) */}
      <mesh
        geometry={hoodGeo}
        material={bodyMat}
        position={[0, BELT_Y, -1.35]}
        castShadow
      />
      {/* Trunk deck */}
      <mesh
        geometry={trunkGeo}
        material={bodyMat}
        position={[0, BELT_Y, 1.45]}
        castShadow
      />

      {/* ── Wheel-well liners (matte tunnel per wheel; 2 per side) ── */}
      {[-1.35, 1.35].map((z) =>
        [-1, 1].map((sx) => (
          <mesh
            key={`liner-${z}-${sx}`}
            position={[sx * 0.86, 0, z]}
            rotation={[0, 0, Math.PI / 2]}
            geometry={linerGeo}
            material={matteBlackMat}
          />
        )),
      )}

      {/* ── Side skirts (matte black lower cladding along rockers) ── */}
      {[-1, 1].map((sx) => (
        <mesh
          key={`skirt-${sx}`}
          position={[sx * (HALF_W - 0.005), ROCKER_Y + 0.09, 0]}
          material={matteBlackMat}
        >
          <boxGeometry args={[0.02, 0.11, 2.55]} />
        </mesh>
      ))}

      {/* ── Roof panel (tapered, narrower than beltline) ─────────── */}
      <mesh geometry={roofGeo} material={bodyMat} position={[0, ROOF_Y, 0]} castShadow />

      {/* ── Windshield ──────────────────────────────────────────── */}
      <mesh
        geometry={windshieldGeo}
        material={glassMat}
        position={wsCenter}
        rotation={[wsAngle, 0, 0]}
      />
      {/* ── Rear glass ─────────────────────────────────────────── */}
      <mesh
        geometry={rearGlassGeo}
        material={glassMat}
        position={rgCenter}
        rotation={[rgAngle, 0, 0]}
      />

      {/* ── Side windows (front & rear door) ────────────────────── */}
      {[-1, 1].map((sx) => (
        <group key={`sw-${sx}`}>
          <mesh
            position={[sx * (HALF_W - 0.02), sideWinY, sideWinFront.zc]}
            rotation={[0, sx > 0 ? -Math.PI / 2 : Math.PI / 2, 0]}
            material={glassMat}
          >
            <boxGeometry args={[sideWinFront.len, sideWindowH, 0.015]} />
          </mesh>
          <mesh
            position={[sx * (HALF_W - 0.02), sideWinY, sideWinRear.zc]}
            rotation={[0, sx > 0 ? -Math.PI / 2 : Math.PI / 2, 0]}
            material={glassMat}
          >
            <boxGeometry args={[sideWinRear.len, sideWindowH, 0.015]} />
          </mesh>
        </group>
      ))}

      {/* ── A / B / C pillars (piano-black, framing all windows) ── */}
      {[-1, 1].map((sx) => (
        <group key={`pillars-${sx}`}>
          {/* A-pillar: from beltline front to roof front, angled */}
          <mesh
            geometry={pillarBox(0.055, 0.06, aPillarLen)}
            material={pianoBlackMat}
            position={[
              sx * (HALF_W - 0.08),
              (BELT_Y + ROOF_Y) / 2,
              (CABIN_FRONT_Z + ROOF_FRONT_Z) / 2,
            ]}
            rotation={[wsAngle, 0, 0]}
          />
          {/* B-pillar: vertical, mid-cabin */}
          <mesh
            geometry={pillarBox(0.05, ROOF_Y - BELT_Y, 0.09)}
            material={pianoBlackMat}
            position={[sx * (HALF_W - 0.02), (BELT_Y + ROOF_Y) / 2, 0.09]}
          />
          {/* C-pillar: from roof rear to beltline rear */}
          <mesh
            geometry={pillarBox(0.06, 0.06, cPillarLen)}
            material={pianoBlackMat}
            position={[
              sx * (HALF_W - 0.08),
              (BELT_Y + ROOF_Y) / 2,
              (CABIN_REAR_Z + ROOF_REAR_Z) / 2,
            ]}
            rotation={[rgAngle, 0, 0]}
          />
        </group>
      ))}

      {/* ── Beltline / window-trim chrome accent ────────────────── */}
      {[-1, 1].map((sx) => (
        <mesh
          key={`belt-${sx}`}
          position={[sx * (HALF_W + 0.001), BELT_Y + 0.005, 0.1]}
          material={chromeMat}
        >
          <boxGeometry args={[0.012, 0.015, 2.1]} />
        </mesh>
      ))}

      {/* ── Front fascia: wide low grille + splitter ───────────── */}
      <mesh position={[0, 0.04, FRONT_Z + 0.03]} material={matteBlackMat}>
        <boxGeometry args={[1.30, 0.22, 0.04]} />
      </mesh>
      {/* Grille horizontal chrome slat */}
      <mesh position={[0, 0.06, FRONT_Z + 0.045]} material={chromeMat}>
        <boxGeometry args={[1.28, 0.012, 0.02]} />
      </mesh>
      {/* Front splitter (lower matte lip) */}
      <mesh position={[0, ROCKER_Y + 0.03, FRONT_Z + 0.06]} material={matteBlackMat}>
        <boxGeometry args={[1.55, 0.06, 0.10]} />
      </mesh>
      {/* Baked DRL bar just above the grille */}
      <mesh position={[0, 0.22, FRONT_Z + 0.045]} material={drlMat}>
        <boxGeometry args={[1.20, 0.02, 0.02]} />
      </mesh>

      {/* ── Rear fascia: full-width tail strip + diffuser ──────── */}
      <mesh position={[0, 0.22, REAR_Z - 0.02]} material={tailMat}>
        <boxGeometry args={[1.48, 0.06, 0.02]} />
      </mesh>
      {/* Rear diffuser */}
      <mesh position={[0, ROCKER_Y + 0.04, REAR_Z - 0.05]} material={matteBlackMat}>
        <boxGeometry args={[1.40, 0.08, 0.12]} />
      </mesh>
      {/* License plate recess */}
      <mesh position={[0, 0.10, REAR_Z - 0.01]} material={matteBlackMat}>
        <boxGeometry args={[0.42, 0.10, 0.02]} />
      </mesh>
      {/* Dual exhaust tips */}
      {[-0.55, 0.55].map((x) => (
        <mesh
          key={`exh-${x}`}
          position={[x, ROCKER_Y + 0.02, REAR_Z + 0.005]}
          rotation={[Math.PI / 2, 0, 0]}
          material={chromeMat}
        >
          <cylinderGeometry args={[0.045, 0.045, 0.06, 16]} />
        </mesh>
      ))}

      {/* ── Door handles (flush, 2 per side) ───────────────────── */}
      {[-1, 1].flatMap((sx) =>
        [-0.28, 0.42].map((z) => (
          <mesh
            key={`hdl-${sx}-${z}`}
            position={[sx * (HALF_W + 0.005), BELT_Y - 0.10, z]}
            rotation={[0, 0, Math.PI / 2]}
            material={chromeMat}
          >
            <capsuleGeometry args={[0.012, 0.11, 4, 8]} />
          </mesh>
        )),
      )}

      {/* ── Side mirrors (teardrop pods on the beltline) ───────── */}
      {[-1, 1].map((sx) => (
        <group key={`mir-${sx}`} position={[sx * (HALF_W + 0.06), BELT_Y + 0.03, -0.55]}>
          <mesh material={bodyMat} castShadow>
            <sphereGeometry args={[0.075, 12, 10]} />
          </mesh>
          <mesh
            position={[sx * 0.055, 0.01, 0]}
            rotation={[0, sx * 0.2, 0]}
            material={pianoBlackMat}
          >
            <boxGeometry args={[0.006, 0.07, 0.10]} />
          </mesh>
          {/* Mirror stalk into the A-pillar area */}
          <mesh
            position={[-sx * 0.055, -0.02, 0]}
            rotation={[0, 0, sx * 0.4]}
            material={bodyMat}
          >
            <cylinderGeometry args={[0.018, 0.022, 0.09, 10]} />
          </mesh>
        </group>
      ))}

      {/* ── Shark-fin antenna ──────────────────────────────────── */}
      <mesh position={[0, ROOF_Y + 0.05, 0.35]} material={pianoBlackMat}>
        <coneGeometry args={[0.05, 0.10, 12]} />
      </mesh>

      {/* ── Sunroof panel (subtle darker inlay in the roof) ────── */}
      <mesh position={[0, ROOF_Y + 0.031, 0.15]} material={pianoBlackMat}>
        <boxGeometry args={[0.85, 0.005, 0.55]} />
      </mesh>
    </group>
  );
}
