import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { geom, rubberMat, rimMat, caliperMat } from "./materials";
import { useVehicleDynamics } from "./dynamics";

/**
 * Production-quality wheel assembly.
 *
 * Named groups: Tire, Rim, BrakeDisc, BrakeCaliper.
 *
 * Alloy design: 5 dual-Y spokes with a machined outer lip and central
 * hub cap + 5 lug nuts. Brake disc has a ventilated inner ring and
 * heat-glow driven by dyn.brakeGlow. Caliper is a curved segment that
 * hugs the disc (via TorusGeometry arc), not a raw box.
 *
 * `outward` = +1 for LEFT wheels (mesh at +X), -1 for RIGHT.
 */
export function Wheel({ outward }: { outward: 1 | -1 }) {
  const dyn = useVehicleDynamics();

  const discMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#3d4048",
        metalness: 0.75,
        roughness: 0.3,
        emissive: new THREE.Color("#ff3300"),
        emissiveIntensity: 0,
      }),
    [],
  );

  const spokeMat = rimMat;
  const lipMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#e2e6ec",
        metalness: 1,
        roughness: 0.14,
        clearcoat: 0.8,
      }),
    [],
  );

  const discRef = useRef<THREE.Mesh>(null);
  useFrame(() => {
    discMat.emissiveIntensity = dyn.brakeGlow.v * 2.5;
    void discRef;
  });

  // 5 dual-Y spokes → 10 geometric spokes offset in pairs
  const spokePairs = useMemo(() => {
    const arr: { a: number; offset: number }[] = [];
    for (let i = 0; i < 5; i++) {
      const base = (i * 2 * Math.PI) / 5;
      arr.push({ a: base - 0.18, offset: 0 });
      arr.push({ a: base + 0.18, offset: 0 });
    }
    return arr;
  }, []);

  const caliperGeom = useMemo(
    () => new THREE.TorusGeometry(0.22, 0.03, 8, 12, Math.PI * 0.35),
    [],
  );

  return (
    <group>
      {/* ── Tire ── */}
      <group name="Tire">
        <mesh
          castShadow
          rotation={[0, 0, Math.PI / 2]}
          geometry={geom.tire}
          material={rubberMat}
        />
        <mesh
          rotation={[0, 0, Math.PI / 2]}
          geometry={geom.tireTread}
          material={rubberMat}
        />
        {/* Sidewall detail ring (subtle inner shoulder) */}
        <mesh
          position={[outward * 0.135, 0, 0]}
          rotation={[0, 0, Math.PI / 2]}
          material={rubberMat}
        >
          <torusGeometry args={[0.33, 0.012, 8, 32]} />
        </mesh>
      </group>

      {/* ── Rim ── */}
      <group name="Rim">
        {/* Rim barrel */}
        <mesh
          rotation={[0, 0, Math.PI / 2]}
          geometry={geom.rim}
          material={spokeMat}
        />
        {/* Machined outer lip */}
        <mesh
          position={[outward * 0.13, 0, 0]}
          rotation={[0, 0, Math.PI / 2]}
          material={lipMat}
        >
          <torusGeometry args={[0.24, 0.014, 8, 40]} />
        </mesh>
        {/* Face disk */}
        <mesh
          position={[outward * 0.128, 0, 0]}
          rotation={[0, outward > 0 ? -Math.PI / 2 : Math.PI / 2, 0]}
          geometry={geom.rimFace}
          material={spokeMat}
        />
        {/* Dual-Y spokes */}
        {spokePairs.map((s, i) => (
          <mesh
            key={i}
            position={[outward * 0.118, 0, 0]}
            rotation={[s.a, 0, 0]}
            material={spokeMat}
          >
            <boxGeometry args={[0.018, 0.022, 0.42]} />
          </mesh>
        ))}
        {/* Hub cap */}
        <mesh
          position={[outward * 0.14, 0, 0]}
          rotation={[0, 0, Math.PI / 2]}
          geometry={geom.hub}
          material={lipMat}
        />
        {/* 5 lug nuts */}
        {[0, 1, 2, 3, 4].map((i) => {
          const a = (i * 2 * Math.PI) / 5;
          return (
            <mesh
              key={i}
              position={[
                outward * 0.148,
                Math.cos(a) * 0.055,
                Math.sin(a) * 0.055,
              ]}
              rotation={[0, 0, Math.PI / 2]}
              geometry={geom.lugNut}
              material={spokeMat}
            />
          );
        })}
      </group>

      {/* ── Brake disc + caliper ── */}
      <group name="BrakeDisc">
        <mesh
          ref={discRef}
          position={[-outward * 0.06, 0, 0]}
          rotation={[0, 0, Math.PI / 2]}
          geometry={geom.brakeDisc}
          material={discMat}
        />
        {/* Ventilation ring */}
        <mesh
          position={[-outward * 0.06, 0, 0]}
          rotation={[0, 0, Math.PI / 2]}
          material={discMat}
        >
          <torusGeometry args={[0.16, 0.012, 6, 32]} />
        </mesh>
      </group>
      <group name="BrakeCaliper">
        <mesh
          position={[-outward * 0.06, 0.02, 0.0]}
          rotation={[Math.PI / 2, 0, Math.PI / 2 - 0.6]}
          geometry={caliperGeom}
          material={caliperMat}
        />
      </group>
    </group>
  );
}
