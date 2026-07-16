import { useMemo } from "react";
import * as THREE from "three";
import { paintMat, chromeMat, darkTrimMat, plasticMat, glassMat } from "./materials";

/**
 * High-fidelity body shell. Still box-primitive-composed (production
 * WebGL-safe, ~40 draw calls) but with realistic proportions, fender
 * flares, hood cut-lines, bumpers, grille, mirrors, door handles, and
 * plate holder.
 */
export function Body({ color = "#22d3ee" }: { color?: string }) {
  const bodyMat = useMemo(() => paintMat(color), [color]);

  const grilleGeom = useMemo(() => new THREE.PlaneGeometry(0.9, 0.2, 12, 4), []);
  const grilleMat = useMemo(
    () => new THREE.MeshStandardMaterial({
      color: "#050505", metalness: 0.7, roughness: 0.45, side: THREE.DoubleSide,
    }),
    [],
  );

  return (
    <group>
      {/* ── Lower monocoque (chassis floor) */}
      <mesh castShadow receiveShadow position={[0, 0.05, 0]} material={bodyMat}>
        <boxGeometry args={[1.85, 0.45, 4.2]} />
      </mesh>

      {/* Front hood section — slightly sloped */}
      <mesh castShadow position={[0, 0.42, -1.35]} rotation={[-0.05, 0, 0]} material={bodyMat}>
        <boxGeometry args={[1.78, 0.24, 1.35]} />
      </mesh>
      {/* Rear trunk section */}
      <mesh castShadow position={[0, 0.42, 1.35]} rotation={[0.03, 0, 0]} material={bodyMat}>
        <boxGeometry args={[1.78, 0.24, 1.35]} />
      </mesh>

      {/* Fender flares over each wheel */}
      {[[0.94, -1.35], [-0.94, -1.35], [0.94, 1.35], [-0.94, 1.35]].map(([x, z], i) => (
        <mesh
          key={i} castShadow
          position={[x, 0.34, z]} material={bodyMat}
        >
          <boxGeometry args={[0.12, 0.36, 0.9]} />
        </mesh>
      ))}

      {/* Front bumper with lower intake */}
      <mesh castShadow position={[0, 0.20, -2.14]} material={bodyMat}>
        <boxGeometry args={[1.85, 0.32, 0.18]} />
      </mesh>
      <mesh position={[0, 0.04, -2.16]} material={darkTrimMat}>
        <boxGeometry args={[1.55, 0.14, 0.14]} />
      </mesh>
      {/* Rear bumper */}
      <mesh castShadow position={[0, 0.20, 2.14]} material={bodyMat}>
        <boxGeometry args={[1.85, 0.32, 0.18]} />
      </mesh>
      <mesh position={[0, 0.04, 2.16]} material={darkTrimMat}>
        <boxGeometry args={[1.55, 0.14, 0.14]} />
      </mesh>

      {/* Front grille */}
      <mesh position={[0, 0.28, -2.11]} material={grilleMat} geometry={grilleGeom} />
      <mesh position={[0, 0.28, -2.115]} material={chromeMat}>
        <boxGeometry args={[0.94, 0.03, 0.02]} />
      </mesh>
      <mesh position={[0, 0.19, -2.115]} material={chromeMat}>
        <boxGeometry args={[0.94, 0.02, 0.02]} />
      </mesh>

      {/* Side sill trim */}
      <mesh position={[0.94, -0.08, 0]} material={darkTrimMat}>
        <boxGeometry args={[0.06, 0.2, 3.2]} />
      </mesh>
      <mesh position={[-0.94, -0.08, 0]} material={darkTrimMat}>
        <boxGeometry args={[0.06, 0.2, 3.2]} />
      </mesh>

      {/* Cabin box */}
      <mesh castShadow position={[0, 0.78, 0.05]} material={bodyMat}>
        <boxGeometry args={[1.66, 0.58, 2.3]} />
      </mesh>

      {/* Roof panel */}
      <mesh castShadow position={[0, 1.06, 0.05]} material={bodyMat}>
        <boxGeometry args={[1.62, 0.04, 2.15]} />
      </mesh>

      {/* A / B / C pillars */}
      {[
        [0.83, 0.87, -1.05, 0.04, 0.35, 0.06],
        [-0.83, 0.87, -1.05, 0.04, 0.35, 0.06],
        [0.83, 0.87, 0.05, 0.04, 0.55, 0.06],
        [-0.83, 0.87, 0.05, 0.04, 0.55, 0.06],
        [0.83, 0.87, 1.15, 0.04, 0.35, 0.06],
        [-0.83, 0.87, 1.15, 0.04, 0.35, 0.06],
      ].map((p, i) => (
        <mesh key={i} position={[p[0], p[1], p[2]]} material={darkTrimMat}>
          <boxGeometry args={[p[3], p[4], p[5]]} />
        </mesh>
      ))}

      {/* Windshield */}
      <mesh position={[0, 0.82, -1.06]} rotation={[-0.52, 0, 0]} material={glassMat}>
        <boxGeometry args={[1.56, 0.62, 0.03]} />
      </mesh>
      {/* Rear window */}
      <mesh position={[0, 0.82, 1.18]} rotation={[0.55, 0, 0]} material={glassMat}>
        <boxGeometry args={[1.56, 0.56, 0.03]} />
      </mesh>
      {/* Side windows */}
      <mesh position={[0.835, 0.9, 0.05]} material={glassMat}>
        <boxGeometry args={[0.02, 0.4, 2.1]} />
      </mesh>
      <mesh position={[-0.835, 0.9, 0.05]} material={glassMat}>
        <boxGeometry args={[0.02, 0.4, 2.1]} />
      </mesh>

      {/* Mirrors — housing + arm + glass */}
      {[[0.98, -0.78], [-0.98, -0.78]].map(([x, z], i) => (
        <group key={i} position={[x, 0.9, z]}>
          <mesh material={bodyMat}>
            <boxGeometry args={[0.06, 0.05, 0.16]} />
          </mesh>
          <mesh position={[Math.sign(x) * 0.09, 0, 0]} castShadow material={bodyMat}>
            <boxGeometry args={[0.14, 0.11, 0.22]} />
          </mesh>
          <mesh position={[Math.sign(x) * 0.16, 0, 0]} rotation={[0, Math.sign(x) * 0.15, 0]} material={glassMat}>
            <boxGeometry args={[0.01, 0.09, 0.19]} />
          </mesh>
        </group>
      ))}

      {/* Door handles */}
      {[[0.94, -0.4], [-0.94, -0.4], [0.94, 0.65], [-0.94, 0.65]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.72, z]} material={chromeMat}>
          <boxGeometry args={[0.03, 0.05, 0.22]} />
        </mesh>
      ))}

      {/* Door cut-lines (subtle dark inserts to break up flat panels) */}
      {[[0.94, 0.15], [-0.94, 0.15]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.5, z]} material={darkTrimMat}>
          <boxGeometry args={[0.03, 0.9, 0.03]} />
        </mesh>
      ))}

      {/* Plate holder — front */}
      <mesh position={[0, 0.12, -2.115]} material={plasticMat}>
        <boxGeometry args={[0.6, 0.14, 0.02]} />
      </mesh>
      <mesh position={[0, 0.12, -2.126]}>
        <boxGeometry args={[0.55, 0.12, 0.005]} />
        <meshStandardMaterial color="#eeeeee" roughness={0.6} />
      </mesh>
      {/* Plate holder — rear */}
      <mesh position={[0, 0.20, 2.115]} material={plasticMat}>
        <boxGeometry args={[0.6, 0.14, 0.02]} />
      </mesh>
      <mesh position={[0, 0.20, 2.126]}>
        <boxGeometry args={[0.55, 0.12, 0.005]} />
        <meshStandardMaterial color="#f4d03f" roughness={0.55} />
      </mesh>

      {/* Roof antenna (shark fin) */}
      <mesh castShadow position={[0, 1.13, 0.75]} material={darkTrimMat}>
        <boxGeometry args={[0.06, 0.08, 0.18]} />
      </mesh>

      {/* Exhaust tips */}
      <mesh position={[0.55, 0.05, 2.18]} rotation={[0, 0, Math.PI / 2]} material={chromeMat}>
        <cylinderGeometry args={[0.05, 0.05, 0.08, 16]} />
      </mesh>
      <mesh position={[-0.55, 0.05, 2.18]} rotation={[0, 0, Math.PI / 2]} material={chromeMat}>
        <cylinderGeometry args={[0.05, 0.05, 0.08, 16]} />
      </mesh>
    </group>
  );
}
