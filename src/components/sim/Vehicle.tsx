import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { sampleAt, usePlayback } from "./store";

/**
 * Vehicle Controller — data-driven kinematic animation:
 *  - Body: translation (interpolated) + yaw (heading) + roll (lateral G) + pitch (long G)
 *  - Wheels: spin by (speed * dt / radius); front wheels steer via steering_deg
 *  - Suspension: independent per-corner compression from weight transfer + noise
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

  // Reusable geometries / materials
  const wheelGeom = useMemo(() => new THREE.CylinderGeometry(0.36, 0.36, 0.28, 20), []);
  const rimGeom = useMemo(() => new THREE.CylinderGeometry(0.22, 0.22, 0.29, 12), []);
  const tireMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#0a0a0a", roughness: 0.9 }), []);
  const rimMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#c8ccd6", metalness: 0.7, roughness: 0.35 }), []);
  const bodyMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color, metalness: 0.7, roughness: 0.28 }),
    [color],
  );
  const darkMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#0e1420", metalness: 0.6, roughness: 0.4 }),
    [],
  );
  const glassMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#5aa9cc", metalness: 0.8, roughness: 0.15, transparent: true, opacity: 0.55 }),
    [],
  );
  const lightMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#fff6d0", emissive: "#fff6d0", emissiveIntensity: 1.4 }),
    [],
  );
  const brakeMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#5a0a0a", emissive: "#ff2020", emissiveIntensity: 0.6 }),
    [],
  );

  useFrame((_, dtRaw) => {
    const dt = Math.min(0.05, dtRaw);
    const st = usePlayback.getState();
    const s = sampleAt(st.samples, st.progress);
    if (!s || !body.current) return;

    // Position — mapping: sim x → world x, sim y → world -z (drive into -z), sim z → world y (elevation)
    body.current.position.set(s.x, 0.42 + s.z, -s.y);

    // Yaw smoothing (short-arc)
    let yaw = -s.heading_rad;
    if (lastYaw.current == null) lastYaw.current = yaw;
    let dy = yaw - lastYaw.current;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    lastYaw.current = lastYaw.current + dy * Math.min(1, 0.25 + st.speed * 0.1);
    body.current.rotation.y = lastYaw.current;

    // Body roll & pitch — smoothed toward target
    rollSmooth.current += (s.roll_rad - rollSmooth.current) * 0.12;
    pitchSmooth.current += (s.pitch_rad - pitchSmooth.current) * 0.12;
    if (chassis.current) {
      chassis.current.rotation.z = rollSmooth.current;
      chassis.current.rotation.x = pitchSmooth.current;
    }

    // Wheel spin
    const wheelR = 0.36;
    spinRef.current -= (s.speed_mps * dt * st.speed) / wheelR;
    for (const w of wheels.current) {
      if (w) w.rotation.x = spinRef.current;
    }

    // Steering — front wheels
    const steerRad = THREE.MathUtils.degToRad(Math.max(-35, Math.min(35, s.steering_deg)));
    if (flAssembly.current) flAssembly.current.rotation.y = steerRad;
    if (frAssembly.current) frAssembly.current.rotation.y = steerRad;

    // Independent suspension: outer wheels compress under lat G, front dives under braking.
    const G = 9.80665;
    const latN = Math.max(-1, Math.min(1, s.lat_accel / (0.9 * G)));
    const lonN = Math.max(-1, Math.min(1, s.long_accel / (0.9 * G)));
    // Base ride height offsets per wheel [FL, FR, RL, RR]. + = wheel pushes body up = compressed = body lower on that side.
    const flOff = -latN * 0.03 - lonN * 0.02;
    const frOff = latN * 0.03 - lonN * 0.02;
    const rlOff = -latN * 0.03 + lonN * 0.02;
    const rrOff = latN * 0.03 + lonN * 0.02;
    const offs = [flOff, frOff, rlOff, rrOff];
    for (let i = 0; i < 4; i++) {
      const w = wheels.current[i];
      if (w) {
        const target = offs[i];
        w.position.y = w.position.y + (target - w.position.y) * 0.15;
      }
    }
  });

  // Wheel positions (relative to chassis center)
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
        {/* Lower body */}
        <mesh castShadow receiveShadow position={[0, 0.05, 0]} material={bodyMat}>
          <boxGeometry args={[1.85, 0.55, 4.2]} />
        </mesh>
        {/* Hood + trunk shaping */}
        <mesh castShadow position={[0, 0.35, -1.35]} material={bodyMat}>
          <boxGeometry args={[1.7, 0.25, 1.35]} />
        </mesh>
        <mesh castShadow position={[0, 0.35, 1.35]} material={bodyMat}>
          <boxGeometry args={[1.7, 0.25, 1.35]} />
        </mesh>
        {/* Greenhouse (cabin) */}
        <mesh castShadow position={[0, 0.7, 0.05]} material={darkMat}>
          <boxGeometry args={[1.65, 0.55, 2.3]} />
        </mesh>
        {/* Windshield */}
        <mesh position={[0, 0.72, -1.05]} rotation={[-0.5, 0, 0]} material={glassMat}>
          <boxGeometry args={[1.55, 0.55, 0.05]} />
        </mesh>
        {/* Rear window */}
        <mesh position={[0, 0.72, 1.15]} rotation={[0.55, 0, 0]} material={glassMat}>
          <boxGeometry args={[1.55, 0.5, 0.05]} />
        </mesh>
        {/* Side glass */}
        <mesh position={[0.83, 0.78, 0.05]} material={glassMat}>
          <boxGeometry args={[0.03, 0.4, 2.1]} />
        </mesh>
        <mesh position={[-0.83, 0.78, 0.05]} material={glassMat}>
          <boxGeometry args={[0.03, 0.4, 2.1]} />
        </mesh>
        {/* Headlights */}
        <mesh position={[0.55, 0.25, -2.05]} material={lightMat}>
          <boxGeometry args={[0.35, 0.15, 0.08]} />
        </mesh>
        <mesh position={[-0.55, 0.25, -2.05]} material={lightMat}>
          <boxGeometry args={[0.35, 0.15, 0.08]} />
        </mesh>
        {/* Tail lights */}
        <mesh position={[0.6, 0.28, 2.05]} material={brakeMat}>
          <boxGeometry args={[0.32, 0.12, 0.08]} />
        </mesh>
        <mesh position={[-0.6, 0.28, 2.05]} material={brakeMat}>
          <boxGeometry args={[0.32, 0.12, 0.08]} />
        </mesh>

        {/* Wheels */}
        {wheelSlots.map(([idx, pos, key]) => {
          const isFront = key === "fl" || key === "fr";
          const steerRef = key === "fl" ? flAssembly : key === "fr" ? frAssembly : undefined;
          const inner = (
            <group ref={(el) => (wheels.current[idx] = el)}>
              <mesh castShadow rotation={[0, 0, Math.PI / 2]} geometry={wheelGeom} material={tireMat} />
              <mesh rotation={[0, 0, Math.PI / 2]} geometry={rimGeom} material={rimMat} />
            </group>
          );
          return isFront ? (
            <group key={key} position={pos} ref={steerRef}>{inner}</group>
          ) : (
            <group key={key} position={pos}>{inner}</group>
          );
        })}
      </group>
    </group>
  );
}
