import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { sampleAt, usePlayback } from "./store";
import { damp } from "./textures";

/**
 * Vehicle Controller — Phase 2.
 *
 * Hierarchy (physics-correct):
 *   body            → world position + yaw
 *     chassis       → roll + pitch + vertical bounce (spring average)
 *       body panels, cabin, glass, lights, mirrors
 *     wheels[4]     → OUT of chassis (stay grounded); local Y = suspension travel
 *                     (opposite sign to chassis compression), local rot.y = steering,
 *                     local rot.x = spin.
 *
 * Physics:
 *   - Per-wheel spring–damper: ẍ = -k(x-x_target) - c·ẋ
 *   - Target compression from lat/lon accel (weight transfer geometry)
 *   - Wheel spin from ground speed (RPM-accurate)
 *   - Ackermann steering: inner front wheel takes a larger angle than outer
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
  const steerLSmooth = useRef(0);
  const steerRSmooth = useRef(0);

  // Spring–damper state for each wheel (compression in meters, +compressed).
  const susPos = useRef<[number, number, number, number]>([0, 0, 0, 0]);
  const susVel = useRef<[number, number, number, number]>([0, 0, 0, 0]);
  const bodyBounce = useRef(0);
  const bodyBounceVel = useRef(0);

  // Telemetry throttling (write to store at ~30 Hz so React re-renders stay cheap).
  const teleAccum = useRef(0);

  // Reusable geometries
  const tireGeom = useMemo(() => new THREE.CylinderGeometry(0.36, 0.36, 0.28, 32), []);
  const rimGeom = useMemo(() => new THREE.CylinderGeometry(0.24, 0.24, 0.29, 24), []);
  const rimHubGeom = useMemo(() => new THREE.CylinderGeometry(0.08, 0.08, 0.3, 12), []);
  const brakeDiscGeom = useMemo(() => new THREE.CylinderGeometry(0.22, 0.22, 0.05, 24), []);
  const spokeGeom = useMemo(() => new THREE.BoxGeometry(0.44, 0.06, 0.06), []);

  // PBR materials
  const bodyMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color, metalness: 0.85, roughness: 0.28,
        clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.2,
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
        color: "#0f1a22", metalness: 0.1, roughness: 0.05,
        transmission: 0.6, thickness: 0.05, ior: 1.45,
        transparent: true, opacity: 0.65, envMapIntensity: 1.4,
      }),
    [],
  );
  const tireMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#080808", roughness: 0.95, metalness: 0 }),
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
    () =>
      new THREE.MeshStandardMaterial({
        color: "#fffbe6", emissive: "#fff5c8", emissiveIntensity: 1.6,
      }),
    [],
  );
  const taillightMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#3a0808", emissive: "#ff2a2a", emissiveIntensity: 0.9,
      }),
    [],
  );

  // Geometry constants
  const trackHalf = 0.85;
  const wheelBase = 2.7; // = 2 * wheelBaseHalf
  const wheelBaseHalf = 1.35;
  const wheelR = 0.36;
  const chassisRestY = 0.42; // world-Y of body group so wheels touch ground
  const MAX_STEER_RAD = THREE.MathUtils.degToRad(35);

  // Spring–damper coefficients (per wheel, unit mass 1). Critical damping
  // ratio ≈ c / (2 * sqrt(k)) ≈ 0.63 — quick settle, minimal overshoot.
  const K = 80;
  const C = 14;
  const MAX_TRAVEL = 0.06; // meters; clamp to prevent clipping
  const BODY_K = 30;
  const BODY_C = 8;

  // Priority -1: runs after SceneAdvancer(-2), before Cameras(+1).
  useFrame((_, dtRaw) => {
    const dt = Math.min(0.05, dtRaw);
    const st = usePlayback.getState();
    const s = sampleAt(st.samples, st.progress);
    if (!s || !body.current) return;

    // === World transform ===
    body.current.position.set(s.x, chassisRestY + s.z, -s.y);

    // Yaw — mesh forward is local -Z; world yaw = heading - π/2.
    const yawTarget = s.heading_rad - Math.PI / 2;
    if (lastYaw.current == null) lastYaw.current = yawTarget;
    let dy = yawTarget - lastYaw.current;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    lastYaw.current = lastYaw.current + dy * (1 - Math.exp(-18 * dt));
    body.current.rotation.y = lastYaw.current;

    // === Chassis roll & pitch (smoothed) ===
    rollSmooth.current = damp(rollSmooth.current, s.roll_rad, 8, dt);
    pitchSmooth.current = damp(pitchSmooth.current, s.pitch_rad, 8, dt);

    // === Spring–damper suspension per wheel ===
    // Target compression from normalized accelerations.
    // Convention: +compressed => wheel Y goes DOWN relative to hub attachment
    // (i.e. the chassis dips at that corner). Wheel visual Y is inverse
    // because wheels are outside the chassis and stay grounded.
    const G = 9.80665;
    const latN = Math.max(-1, Math.min(1, s.lat_accel / (0.9 * G)));
    const lonN = Math.max(-1, Math.min(1, s.long_accel / (0.9 * G)));

    // Signs (mesh axes: local +X = left side, +Z = rear, -Z = front):
    //   Braking (lonN < 0) → front compresses  → FL/FR target > 0
    //   Accel  (lonN > 0)  → rear compresses   → RL/RR target > 0
    //   Right turn (latN < 0 with sim convention) → right side compresses
    //     Right side wheels are at local -X (see wheelSlots below).
    // Weight-transfer magnitudes: h_cg/wheelbase and h_cg/track ~ 0.22 & 0.35
    const kLon = 0.032;
    const kLat = 0.028;
    const target = [
      /* FL: +X, -Z */ -latN * kLat + -lonN * kLon,
      /* FR: -X, -Z */ +latN * kLat + -lonN * kLon,
      /* RL: +X, +Z */ -latN * kLat + +lonN * kLon,
      /* RR: -X, +Z */ +latN * kLat + +lonN * kLon,
    ];

    let sumComp = 0;
    for (let i = 0; i < 4; i++) {
      const x = susPos.current[i];
      const v = susVel.current[i];
      const a = -K * (x - target[i]) - C * v;
      const vNew = v + a * dt;
      let xNew = x + vNew * dt;
      if (xNew > MAX_TRAVEL) xNew = MAX_TRAVEL;
      else if (xNew < -MAX_TRAVEL) xNew = -MAX_TRAVEL;
      susPos.current[i] = xNew;
      susVel.current[i] = vNew;
      sumComp += xNew;
    }

    // Body vertical bounce (average of four springs, softly filtered).
    const bAvg = sumComp / 4;
    const bA = -BODY_K * (bodyBounce.current - bAvg) - BODY_C * bodyBounceVel.current;
    bodyBounceVel.current += bA * dt;
    bodyBounce.current += bodyBounceVel.current * dt;

    if (chassis.current) {
      // Chassis dips downward by average compression (small, purely visual).
      chassis.current.position.y = -bodyBounce.current * 0.5;
      chassis.current.rotation.z = rollSmooth.current;
      chassis.current.rotation.x = pitchSmooth.current;
    }

    // Wheels stay grounded: their local Y is +compression (opposite sign to
    // chassis dip) so tire contact patch remains flush.
    for (let i = 0; i < 4; i++) {
      const w = wheels.current[i];
      if (w) w.position.y = susPos.current[i];
    }

    // === Wheel spin (RPM-accurate, direction-correct) ===
    // Visual dt = dt * playback speed; ground speed already in m/s.
    const visualDt = dt * st.speed;
    spinRef.current -= (s.speed_mps * visualDt) / wheelR;
    for (const w of wheels.current) {
      if (w) w.rotation.x = spinRef.current;
    }

    // === Ackermann steering ===
    // steering_deg (signed): +left, -right (matches +rotation.y).
    const steerAvg = THREE.MathUtils.clamp(
      THREE.MathUtils.degToRad(s.steering_deg),
      -MAX_STEER_RAD,
      MAX_STEER_RAD,
    );
    let steerL = steerAvg;
    let steerR = steerAvg;
    const EPS = 1e-3;
    if (Math.abs(steerAvg) > EPS) {
      // Turn radius from bicycle model: R = L / tan(δ_avg)
      const R = wheelBase / Math.tan(Math.abs(steerAvg));
      const inner = Math.atan(wheelBase / Math.max(0.4, R - trackHalf));
      const outer = Math.atan(wheelBase / (R + trackHalf));
      if (steerAvg > 0) {
        // Left turn: FL (left, +X) is inner
        steerL = inner;
        steerR = outer;
      } else {
        // Right turn: FR (right, -X) is inner
        steerL = -outer;
        steerR = -inner;
      }
    }
    steerLSmooth.current = damp(steerLSmooth.current, steerL, 14, dt);
    steerRSmooth.current = damp(steerRSmooth.current, steerR, 14, dt);
    if (flAssembly.current) flAssembly.current.rotation.y = steerLSmooth.current;
    if (frAssembly.current) frAssembly.current.rotation.y = steerRSmooth.current;

    // === Telemetry emit (~30 Hz) ===
    teleAccum.current += dtRaw;
    if (st.showTelemetry && teleAccum.current > 0.033) {
      teleAccum.current = 0;
      const rpm = (s.speed_mps / (2 * Math.PI * wheelR)) * 60;
      const throttle = Math.max(0, Math.min(1, s.long_accel / (0.5 * G)));
      const brake = Math.max(0, Math.min(1, -s.long_accel / (0.6 * G)));
      const gLat = s.lat_accel / G;
      const gLon = s.long_accel / G;
      // Longitudinal transfer (Δload_front / total) ≈ -h/L * a_x / g
      const dFront = -0.22 * gLon;
      // Lateral transfer (Δload_right / total) ≈ -h/T * a_y / g
      const dRight = -0.35 * gLat;
      st.setTelemetry({
        speed_kmh: s.speed_mps * 3.6,
        steer_deg: s.steering_deg,
        throttle,
        brake,
        wheelRpm: rpm,
        susTravel: [
          susPos.current[0], susPos.current[1],
          susPos.current[2], susPos.current[3],
        ],
        rollDeg: (rollSmooth.current * 180) / Math.PI,
        pitchDeg: (pitchSmooth.current * 180) / Math.PI,
        latG: gLat,
        lonG: gLon,
        gTotal: Math.hypot(gLat, gLon),
        weightFront: Math.max(0, Math.min(1, 0.5 + dFront)),
        weightRight: Math.max(0, Math.min(1, 0.5 + dRight)),
      });
    }
  }, -1);

  const wheelSlots: [number, [number, number, number], "fl" | "fr" | "rl" | "rr"][] = [
    [0, [trackHalf, 0, -wheelBaseHalf], "fl"],
    [1, [-trackHalf, 0, -wheelBaseHalf], "fr"],
    [2, [trackHalf, 0, wheelBaseHalf], "rl"],
    [3, [-trackHalf, 0, wheelBaseHalf], "rr"],
  ];

  return (
    <group ref={body}>
      {/* Chassis: rolls, pitches, bounces. Wheels are NOT children of this. */}
      <group ref={chassis}>
        {/* Main body — lower monocoque */}
        <mesh castShadow receiveShadow position={[0, 0.05, 0]} material={bodyMat}>
          <boxGeometry args={[1.85, 0.55, 4.2]} />
        </mesh>
        <mesh castShadow position={[0, 0.36, -1.35]} material={bodyMat}>
          <boxGeometry args={[1.72, 0.22, 1.35]} />
        </mesh>
        <mesh castShadow position={[0, 0.36, 1.35]} material={bodyMat}>
          <boxGeometry args={[1.72, 0.22, 1.35]} />
        </mesh>
        <mesh castShadow position={[0, 0.15, -2.15]} material={trimMat}>
          <boxGeometry args={[1.88, 0.35, 0.18]} />
        </mesh>
        <mesh castShadow position={[0, 0.15, 2.15]} material={trimMat}>
          <boxGeometry args={[1.88, 0.35, 0.18]} />
        </mesh>
        <mesh position={[0.94, -0.05, 0]} material={trimMat}>
          <boxGeometry args={[0.05, 0.25, 3.4]} />
        </mesh>
        <mesh position={[-0.94, -0.05, 0]} material={trimMat}>
          <boxGeometry args={[0.05, 0.25, 3.4]} />
        </mesh>
        <mesh castShadow position={[0, 0.72, 0.05]} material={cabinMat}>
          <boxGeometry args={[1.66, 0.52, 2.3]} />
        </mesh>
        <mesh position={[0, 0.74, -1.05]} rotation={[-0.5, 0, 0]} material={glassMat}>
          <boxGeometry args={[1.55, 0.55, 0.04]} />
        </mesh>
        <mesh position={[0, 0.74, 1.15]} rotation={[0.55, 0, 0]} material={glassMat}>
          <boxGeometry args={[1.55, 0.5, 0.04]} />
        </mesh>
        <mesh position={[0.835, 0.8, 0.05]} material={glassMat}>
          <boxGeometry args={[0.02, 0.38, 2.1]} />
        </mesh>
        <mesh position={[-0.835, 0.8, 0.05]} material={glassMat}>
          <boxGeometry args={[0.02, 0.38, 2.1]} />
        </mesh>
        <mesh castShadow position={[0, 1.0, 0.05]} material={bodyMat}>
          <boxGeometry args={[1.6, 0.05, 2.25]} />
        </mesh>
        <mesh position={[0.55, 0.28, -2.09]} material={headlightMat}>
          <boxGeometry args={[0.36, 0.14, 0.05]} />
        </mesh>
        <mesh position={[-0.55, 0.28, -2.09]} material={headlightMat}>
          <boxGeometry args={[0.36, 0.14, 0.05]} />
        </mesh>
        <mesh position={[0.6, 0.3, 2.09]} material={taillightMat}>
          <boxGeometry args={[0.34, 0.12, 0.05]} />
        </mesh>
        <mesh position={[-0.6, 0.3, 2.09]} material={taillightMat}>
          <boxGeometry args={[0.34, 0.12, 0.05]} />
        </mesh>
        <mesh position={[0, 0.12, -2.11]} material={trimMat}>
          <boxGeometry args={[0.9, 0.16, 0.03]} />
        </mesh>
        <mesh castShadow position={[0.95, 0.72, -0.85]} material={bodyMat}>
          <boxGeometry args={[0.16, 0.1, 0.24]} />
        </mesh>
        <mesh castShadow position={[-0.95, 0.72, -0.85]} material={bodyMat}>
          <boxGeometry args={[0.16, 0.1, 0.24]} />
        </mesh>
      </group>

      {/* Wheels — siblings of chassis. They stay grounded; each corner's Y
          holds the current suspension travel. Front wheels sit inside a
          steering assembly group whose rotation.y is the Ackermann angle. */}
      {wheelSlots.map(([idx, pos, key]) => {
        const isFront = key === "fl" || key === "fr";
        const steerRef = key === "fl" ? flAssembly : key === "fr" ? frAssembly : undefined;
        const outward = pos[0] > 0 ? 1 : -1;
        const inner = (
          <group ref={(el) => (wheels.current[idx] = el)}>
            <mesh castShadow rotation={[0, 0, Math.PI / 2]} geometry={tireGeom} material={tireMat} />
            <mesh rotation={[0, 0, Math.PI / 2]} geometry={rimGeom} material={rimMat} />
            <mesh
              position={[-outward * 0.05, 0, 0]}
              rotation={[0, 0, Math.PI / 2]}
              geometry={brakeDiscGeom}
              material={brakeMat}
            />
            <mesh rotation={[0, 0, Math.PI / 2]} geometry={rimHubGeom} material={rimMat} />
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
  );
}
