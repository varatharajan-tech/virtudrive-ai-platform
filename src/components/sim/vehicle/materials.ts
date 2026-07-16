import * as THREE from "three";

/**
 * Shared PBR material singletons for the vehicle. Reusing material instances
 * across every corner and body panel keeps program count low and lets the
 * driver mutate `emissiveIntensity` on refs each frame without React churn.
 */

function makePaint(color: string): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0.88,
    roughness: 0.24,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    envMapIntensity: 1.35,
    sheen: 0.15,
    sheenRoughness: 0.3,
    sheenColor: new THREE.Color(color).multiplyScalar(0.6),
  });
}

const paintCache = new Map<string, THREE.MeshPhysicalMaterial>();
export function paintMat(color: string): THREE.MeshPhysicalMaterial {
  let m = paintCache.get(color);
  if (!m) {
    m = makePaint(color);
    paintCache.set(color, m);
  }
  return m;
}

export const chromeMat = new THREE.MeshPhysicalMaterial({
  color: "#e8ecf2",
  metalness: 1,
  roughness: 0.08,
  clearcoat: 1,
  envMapIntensity: 1.6,
});

export const darkTrimMat = new THREE.MeshStandardMaterial({
  color: "#0e1116",
  metalness: 0.55,
  roughness: 0.6,
});

export const plasticMat = new THREE.MeshStandardMaterial({
  color: "#141821",
  metalness: 0.05,
  roughness: 0.85,
});

export const rubberMat = new THREE.MeshStandardMaterial({
  color: "#070707",
  metalness: 0,
  roughness: 0.95,
});

export const rimMat = new THREE.MeshPhysicalMaterial({
  color: "#c6cbd3",
  metalness: 0.95,
  roughness: 0.22,
  clearcoat: 0.6,
  envMapIntensity: 1.4,
});

export const caliperMat = new THREE.MeshStandardMaterial({
  color: "#c81f1f",
  metalness: 0.4,
  roughness: 0.45,
});

export const brakeDiscMat = new THREE.MeshStandardMaterial({
  color: "#3d4048",
  metalness: 0.7,
  roughness: 0.35,
  emissive: new THREE.Color("#ff3300"),
  emissiveIntensity: 0,
});

export const glassMat = new THREE.MeshPhysicalMaterial({
  color: "#141a22",
  metalness: 0.05,
  roughness: 0.04,
  transmission: 0.75,
  thickness: 0.06,
  ior: 1.5,
  transparent: true,
  opacity: 0.55,
  envMapIntensity: 1.6,
  clearcoat: 1,
  clearcoatRoughness: 0.05,
});

export const interiorLeather = new THREE.MeshStandardMaterial({
  color: "#0d0d10",
  metalness: 0.05,
  roughness: 0.9,
});

export const interiorTrim = new THREE.MeshStandardMaterial({
  color: "#1a1d24",
  metalness: 0.15,
  roughness: 0.72,
});

// ── Emissive lamp materials (independent instances so refs mutate freely)
export function makeEmissive(color: string, base = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: "#0a0a0a",
    emissive: new THREE.Color(color),
    emissiveIntensity: base,
    metalness: 0.1,
    roughness: 0.4,
  });
}

// Shared geometries (reused across all four wheels)
export const geom = {
  tire: new THREE.CylinderGeometry(0.36, 0.36, 0.28, 40),
  tireTread: new THREE.TorusGeometry(0.365, 0.028, 12, 48),
  rim: new THREE.CylinderGeometry(0.245, 0.245, 0.24, 28),
  rimFace: new THREE.CircleGeometry(0.24, 28),
  hub: new THREE.CylinderGeometry(0.07, 0.07, 0.03, 16),
  lugNut: new THREE.CylinderGeometry(0.018, 0.018, 0.035, 6),
  brakeDisc: new THREE.CylinderGeometry(0.22, 0.22, 0.028, 32),
  brakeCaliper: new THREE.BoxGeometry(0.14, 0.18, 0.08),
  spring: new THREE.CylinderGeometry(0.06, 0.06, 0.28, 12, 6, true),
  damper: new THREE.CylinderGeometry(0.035, 0.035, 0.34, 10),
  aArm: new THREE.BoxGeometry(0.42, 0.05, 0.05),
  rack: new THREE.BoxGeometry(1.35, 0.05, 0.05),
  tieRod: new THREE.BoxGeometry(0.28, 0.03, 0.03),
} as const;
