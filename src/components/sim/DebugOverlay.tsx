import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { sampleAt, usePlayback, type PathSample } from "./store";

/**
 * In-scene debug overlay: road spline polyline, vehicle forward/right vectors,
 * axes helper on the car pivot, and a small HTML readout with heading + steering.
 * Rendered only when usePlayback.showDebug is true.
 */
export function DebugOverlay({ samples }: { samples: PathSample[] }) {
  const show = usePlayback((s) => s.showDebug);

  const splineGeom = useMemo(() => {
    if (samples.length < 2) return null;
    const pts = samples.map((s) => new THREE.Vector3(s.x, s.z + 0.05, -s.y));
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    return g;
  }, [samples]);

  const fwdRef = useRef<THREE.ArrowHelper>(null!);
  const rgtRef = useRef<THREE.ArrowHelper>(null!);
  const carRef = useRef<THREE.Group>(null!);
  const [readout, setReadout] = useState({ h: 0, steer: 0, spd: 0 });
  const readoutTick = useRef(0);

  useFrame((_, dt) => {
    if (!show) return;
    const st = usePlayback.getState();
    const s = sampleAt(st.samples, st.progress);
    if (!s) return;
    const h = s.heading_rad;
    const pos = new THREE.Vector3(s.x, s.z + 0.9, -s.y);
    const fwd = new THREE.Vector3(Math.cos(h), 0, -Math.sin(h));
    const rgt = new THREE.Vector3(-Math.sin(h), 0, -Math.cos(h));
    if (carRef.current) carRef.current.position.copy(pos);
    if (fwdRef.current) {
      fwdRef.current.position.copy(pos);
      fwdRef.current.setDirection(fwd);
    }
    if (rgtRef.current) {
      rgtRef.current.position.copy(pos);
      rgtRef.current.setDirection(rgt);
    }
    readoutTick.current += dt;
    if (readoutTick.current > 0.15) {
      readoutTick.current = 0;
      setReadout({ h: (h * 180) / Math.PI, steer: s.steering_deg, spd: s.speed_mps * 3.6 });
    }
  });

  if (!show || !splineGeom) return null;

  return (
    <group>
      {/* Road spline polyline */}
      <line>
        <primitive object={splineGeom} attach="geometry" />
        <lineBasicMaterial color="#22d3ee" transparent opacity={0.9} />
      </line>
      {/* Forward vector (green) & right vector (red) */}
      <arrowHelper
        ref={fwdRef}
        args={[new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 6, 0x22c55e, 1.2, 0.6]}
      />
      <arrowHelper
        ref={rgtRef}
        args={[new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 3, 0xef4444, 0.9, 0.5]}
      />
      {/* Pivot axes */}
      <group ref={carRef}>
        <axesHelper args={[2.5]} />
      </group>
      {/* HTML readout: rely on outer DOM overlay in Sim3DScene */}
      {typeof document !== "undefined" && (
        <DebugReadout h={readout.h} steer={readout.steer} spd={readout.spd} />
      )}
    </group>
  );
}

function DebugReadout({ h, steer, spd }: { h: number; steer: number; spd: number }) {
  // Uses R3F <Html> would be nicer, but keeping it dependency-lean: this
  // component just publishes to a global div created by Sim3DScene.
  if (typeof document === "undefined") return null;
  const el = document.getElementById("virtudrive-debug-readout");
  if (el) {
    el.textContent =
      `heading ${h.toFixed(1).padStart(6)}°   steer ${steer.toFixed(1).padStart(6)}°   spd ${spd.toFixed(1).padStart(6)} km/h`;
  }
  return null;
}
