import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { sampleAt, usePlayback } from "./store";
import { damp } from "./textures";

/**
 * Vehicle Controller — PBR body, physical glass, detailed wheels with brake discs.
 * Data-driven kinematics: translation, yaw, roll, pitch, wheel spin, steering,
 * independent suspension. All smoothing is frame-rate independent via `damp()`.
 */
export function Vehicle({ color = "#22d3ee" }: { color?: string }) {
  const body = useRef<THREE.Group>(null!);
  const chassis = useRef<THREE.Group>(null!);
  const wheels = useRef<Array<THREE.Group | null>>([null, null, null, null]);
  const flAssembly = useRef<THREE.Group>(null!);
  const frAssembly = useRef<THREE.Group>(null!);
  const spinRef = useRef(0);
  const lastYaw = useRef<number | null>(null);
  const rollSmooth = useRef(0);
  const pitchSmooth = useRef(0);
  const steerSmooth = useRef(0);

  // Reusable geometries
  const tireGeom = useMemo(() => new THREE.CylinderGeometry(0.36, 0.36, 0.28, 32), []);
  const rimGeom = useMemo(() => new THREE.CylinderGeometry(0.24, 0.24, 0.29, 24), []);
  const rimHubGeom = useMemo(() => new THREE.CylinderGeometry(0.08, 0.08, 0.30, 12), []);
  const brakeDiscGeom = useMemo(() => new THREE.CylinderGeometry(0.22, 0.22, 0.05, 24), []);
  const spokeGeom = useMemo(() => new THREE.BoxGeometry(0.44, 0.06, 0.06), []);

  // PBR materials
  const bodyMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color,
        metalness: 0.85,
        roughness: 0.28,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        envMapIntensity: 1.2,
      }),
    [color],
  );
  const trimMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#111418", metalness: 0.6, roughness: 0.5 }),
    [],
  );
  const cabinMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#0a0d13", metalness: 0.4, roughness: 0.55 }),
    [],
  );
  const glassMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#0f1a22",
        metalness: 0.1,
        roughness: 0.05,
        transmission: 0.6,
        thickness: 0.05,
        ior: 1.45,
        transparent: true,
        opacity: 0.65,
        envMapIntensity: 1.4,
      }),
    [],
  );
  const tireMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#080808", roughness: 0.95, metalness: 0.0 }),
    [],
  );
  const rimMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#d4d8e0", metalness: 0.95, roughness: 0.22 }),
    [],
  );
  const brakeMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#6b6f78", metalness: 0.85, roughness: 0.35 }),
    [],
  );
  const headlightMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#fffbe6", emissive: "#fff5c8", emissiveIntensity: 1.6 }),
    [],
  );
  const taillightMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#3a0808", emissive: "#ff2a2a", emissiveIntensity: 0.9 }),
    [],
  );

  useFrame((_, dtRaw) => {
    const dt = Math.min(0.05, dtRaw);
    const st = usePlayback.getState();
    const s = sampleAt(st.samples, st.progress);
    if (!s || !body.current) return;

    // Position — sim x→world x, sim y→world -z, sim z→world y (elevation)
    body.current.position.set(s.x, 0.42 + s.z, -s.y);

    // Yaw — mesh forward is local -Z, so world yaw = heading - π/2.
    // Shortest-arc, frame-rate-independent smoothing.
    const yawTarget = s.heading_rad - Math.PI / 2;
    if (lastYaw.current == null) lastYaw.current = yawTarget;
    let dy = yawTarget - lastYaw.current;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    lastYaw.current = lastYaw.current + dy * (1 - Math.exp(-18 * dt));
    body.current.rotation.y = lastYaw.current;

    // Body roll & pitch — smoothed toward target (frame-rate independent)
    rollSmooth.current = damp(rollSmooth.current, s.roll_rad, 8, dt);
    pitchSmooth.current = damp(pitchSmooth.current, s.pitch_rad, 8, dt);
    if (chassis.current) {
      chassis.current.rotation.z = rollSmooth.current;
      chassis.current.rotation.x = pitchSmooth.current;
    }

    // Wheel spin (RPM-accurate)
    const wheelR = 0.36;
    spinRef.current -= (s.speed_mps * dt * st.speed) / wheelR;
    for (const w of wheels.current) {
      if (w) w.rotation.x = spinRef.current;
    }

    // Steering — front wheels, smoothed
    const targetSteer = THREE.MathUtils.degToRad(Math.max(-35, Math.min(35, s.steering_deg)));
    steerSmooth.current = damp(steerSmooth.current, targetSteer, 14, dt);
    if (flAssembly.current) flAssembly.current.rotation.y = steerSmooth.current;
    if (frAssembly.current) frAssembly.current.rotation.y = steerSmooth.current;

    // Independent suspension (weight-transfer driven, dt-independent)
    const G = 9.80665;
    const latN = Math.max(-1, Math.min(1, s.lat_accel / (0.9 * G)));
    const lonN = Math.max(-1, Math.min(1, s.long_accel / (0.9 * G)));
    const offs = [
      -latN * 0.03 - lonN * 0.02, // FL
      latN * 0.03 - lonN * 0.02, // FR
      -latN * 0.03 + lonN * 0.02, // RL
      latN * 0.03 + lonN * 0.02, // RR
    ];
    for (let i = 0; i < 4; i++) {
      const w = wheels.current[i];
      if (w) w.position.y = damp(w.position.y, offs[i], 10, dt);
    }
  });

  const trackHalf = 0.85;
  const wheelBaseHalf = 1.35;
  const wheelSlots: [number, [number, number, number], "fl" | "fr" | "rl" | "rr"][] = [
    [0, [trackHalf, 0, -wheelBaseHalf], "fl"],
    [1, [-trackHalf, 0, -wheelBaseHalf], "fr"],
    [2, [trackHalf, 0, wheelBaseHalf], "rl"],
    [3, [-trackHalf, 0, wheelBaseHalf], "rr"],
  ];

  return (
    <group ref={body}>
      <group ref={chassis}>
        {/* Main body — lower monocoque */}
        <mesh castShadow receiveShadow position={[0, 0.05, 0]} material={bodyMat}>
          <boxGeometry args={[1.85, 0.55, 4.2]} />
        </mesh>
        {/* Hood */}
        <mesh castShadow position={[0, 0.36, -1.35]} material={bodyMat}>
          <boxGeometry args={[1.72, 0.22, 1.35]} />
        </mesh>
        {/* Trunk */}
        <mesh castShadow position={[0, 0.36, 1.35]} material={bodyMat}>
          <boxGeometry args={[1.72, 0.22, 1.35]} />
        </mesh>
        {/* Front bumper */}
        <mesh castShadow position={[0, 0.15, -2.15]} material={trimMat}>
          <boxGeometry args={[1.88, 0.35, 0.18]} />
        </mesh>
        {/* Rear bumper */}
        <mesh castShadow position={[0, 0.15, 2.15]} material={trimMat}>
          <boxGeometry args={[1.88, 0.35, 0.18]} />
        </mesh>
        {/* Rocker panels */}
        <mesh position={[0.94, -0.05, 0]} material={trimMat}>
          <boxGeometry args={[0.05, 0.25, 3.4]} />
        </mesh>
        <mesh position={[-0.94, -0.05, 0]} material={trimMat}>
          <boxGeometry args={[0.05, 0.25, 3.4]} />
        </mesh>
        {/* Cabin greenhouse */}
        <mesh castShadow position={[0, 0.72, 0.05]} material={cabinMat}>
          <boxGeometry args={[1.66, 0.52, 2.3]} />
        </mesh>
        {/* Windshield */}
        <mesh position={[0, 0.74, -1.05]} rotation={[-0.5, 0, 0]} material={glassMat}>
          <boxGeometry args={[1.55, 0.55, 0.04]} />
        </mesh>
        {/* Rear window */}
        <mesh position={[0, 0.74, 1.15]} rotation={[0.55, 0, 0]} material={glassMat}>
          <boxGeometry args={[1.55, 0.5, 0.04]} />
        </mesh>
        {/* Side windows */}
        <mesh position={[0.835, 0.8, 0.05]} material={glassMat}>
          <boxGeometry args={[0.02, 0.38, 2.1]} />
        </mesh>
        <mesh position={[-0.835, 0.8, 0.05]} material={glassMat}>
          <boxGeometry args={[0.02, 0.38, 2.1]} />
        </mesh>
        {/* Roof */}
        <mesh castShadow position={[0, 1.0, 0.05]} material={bodyMat}>
          <boxGeometry args={[1.6, 0.05, 2.25]} />
        </mesh>
        {/* Headlights */}
        <mesh position={[0.55, 0.28, -2.09]} material={headlightMat}>
          <boxGeometry args={[0.36, 0.14, 0.05]} />
        </mesh>
        <mesh position={[-0.55, 0.28, -2.09]} material={headlightMat}>
          <boxGeometry args={[0.36, 0.14, 0.05]} />
        </mesh>
        {/* Tail lights */}
        <mesh position={[0.6, 0.3, 2.09]} material={taillightMat}>
          <boxGeometry args={[0.34, 0.12, 0.05]} />
        </mesh>
        <mesh position={[-0.6, 0.3, 2.09]} material={taillightMat}>
          <boxGeometry args={[0.34, 0.12, 0.05]} />
        </mesh>
        {/* Grille */}
        <mesh position={[0, 0.12, -2.11]} material={trimMat}>
          <boxGeometry args={[0.9, 0.16, 0.03]} />
        </mesh>
        {/* Side mirrors */}
        <mesh castShadow position={[0.95, 0.72, -0.85]} material={bodyMat}>
          <boxGeometry args={[0.16, 0.1, 0.24]} />
        </mesh>
        <mesh castShadow position={[-0.95, 0.72, -0.85]} material={bodyMat}>
          <boxGeometry args={[0.16, 0.1, 0.24]} />
        </mesh>

        {/* Wheels */}
        {wheelSlots.map(([idx, pos, key]) => {
          const isFront = key === "fl" || key === "fr";
          const steerRef = key === "fl" ? flAssembly : key === "fr" ? frAssembly : undefined;
          const outward = pos[0] > 0 ? 1 : -1;
          const inner = (
            <group ref={(el) => (wheels.current[idx] = el)}>
              {/* Tire */}
              <mesh castShadow rotation={[0, 0, Math.PI / 2]} geometry={tireGeom} material={tireMat} />
              {/* Rim */}
              <mesh rotation={[0, 0, Math.PI / 2]} geometry={rimGeom} material={rimMat} />
              {/* Brake disc (inside wheel) */}
              <mesh
                position={[-outward * 0.05, 0, 0]}
                rotation={[0, 0, Math.PI / 2]}
                geometry={brakeDiscGeom}
                material={brakeMat}
              />
              {/* Hub */}
              <mesh rotation={[0, 0, Math.PI / 2]} geometry={rimHubGeom} material={rimMat} />
              {/* Spokes */}
              {[0, 1, 2, 3, 4].map((i) => (
                <mesh
                  key={i}
                  rotation={[(i * Math.PI) / 5, 0, 0]}
                  position={[outward * 0.02, 0, 0]}
                  geometry={spokeGeom}
                  material={rimMat}
                />
              ))}
            </group>
          );
          return isFront ? (
            <group key={key} position={pos} ref={steerRef}>
              {inner}
            </group>
          ) : (
            <group key={key} position={pos}>
              {inner}
            </group>
          );
        })}
      </group>
    </group>
  );
}
