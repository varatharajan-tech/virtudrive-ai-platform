import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { sampleAt, usePlayback } from "./store";

/**
 * Camera Manager.
 *
 * Runs at useFrame priority +1 so it always executes AFTER SceneAdvancer (-2)
 * and Vehicle (-1) within the same frame. This makes vehicle→camera fully
 * synchronous — no one-frame lag/lead oscillation that reads as jitter.
 *
 * All vectors are preallocated refs; the loop performs zero allocations.
 */
export function Cameras() {
  const { camera } = useThree();
  const orbit = useRef<any>(null);

  // Preallocated scratch vectors — no per-frame `new`.
  const targetPos = useRef(new THREE.Vector3(0, 5, 20));
  const targetLook = useRef(new THREE.Vector3(0, 0, 0));
  const smoothLook = useRef(new THREE.Vector3(0, 0, 0));
  const carPos = useRef(new THREE.Vector3());
  const forward = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  const up = useRef(new THREE.Vector3(0, 1, 0));
  const dronePos = useRef(new THREE.Vector3());

  const replayTimer = useRef(0);
  const replayMode = useRef<"chase" | "side" | "drone" | "top" | "hood">("chase");
  const droneAngle = useRef(0);
  const mouseInput = useRef({ dx: 0, dy: 0 });
  const initialised = useRef(false);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      mouseInput.current.dx = (e.clientX / window.innerWidth - 0.5) * 2;
      mouseInput.current.dy = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, []);

  useFrame((_, dtRaw) => {
    const dt = Math.min(0.05, dtRaw);
    const st = usePlayback.getState();
    const s = sampleAt(st.samples, st.progress);
    if (!s) return;

    // Vehicle world transform — computed from the SAME progress the Vehicle
    // hook already consumed this frame (SceneAdvancer priority ensures the
    // progress value is stable across all three hooks within one frame).
    const h = s.heading_rad;
    const cosH = Math.cos(h);
    const sinH = Math.sin(h);
    carPos.current.set(s.x, s.z + 0.42, -s.y);
    forward.current.set(cosH, 0, -sinH);
    right.current.set(-sinH, 0, -cosH);

    if (st.cameraMode === "free") {
      if (orbit.current) {
        orbit.current.enabled = true;
        if (st.autoFollow) orbit.current.target.lerp(carPos.current, 0.1);
      }
      return;
    }
    if (orbit.current) orbit.current.enabled = false;

    let mode = st.cameraMode;
    if (mode === "replay") {
      replayTimer.current += dt;
      if (replayTimer.current > 4) {
        replayTimer.current = 0;
        const opts: Array<typeof replayMode.current> = ["chase", "side", "drone", "top", "hood"];
        replayMode.current = opts[Math.floor(Math.random() * opts.length)];
      }
      mode = replayMode.current;
    }

    const dist = st.followDistance;
    const tp = targetPos.current;
    const tl = targetLook.current;

    switch (mode) {
      case "chase": {
        tp.copy(carPos.current).addScaledVector(forward.current, -dist).addScaledVector(up.current, dist * 0.45);
        tl.copy(carPos.current).addScaledVector(forward.current, 4);
        break;
      }
      case "driver": {
        tp.copy(carPos.current).addScaledVector(forward.current, 0.2).addScaledVector(up.current, 0.55).addScaledVector(right.current, -0.35);
        tl.copy(carPos.current).addScaledVector(forward.current, 15).addScaledVector(up.current, 0.3);
        break;
      }
      case "hood": {
        tp.copy(carPos.current).addScaledVector(forward.current, 1.7).addScaledVector(up.current, 0.55);
        tl.copy(carPos.current).addScaledVector(forward.current, 20).addScaledVector(up.current, 0.2);
        break;
      }
      case "roof": {
        tp.copy(carPos.current).addScaledVector(forward.current, 0.1).addScaledVector(up.current, 1.8);
        tl.copy(carPos.current).addScaledVector(forward.current, 18);
        break;
      }
      case "top": {
        tp.copy(carPos.current).addScaledVector(up.current, Math.max(30, dist * 4));
        tl.copy(carPos.current);
        break;
      }
      case "side": {
        tp.copy(carPos.current).addScaledVector(right.current, dist).addScaledVector(up.current, dist * 0.25);
        tl.copy(carPos.current);
        break;
      }
      case "front": {
        tp.copy(carPos.current).addScaledVector(forward.current, dist).addScaledVector(up.current, dist * 0.25);
        tl.copy(carPos.current);
        break;
      }
      case "drone": {
        droneAngle.current += dt * 0.25 * st.sensitivity;
        const r = Math.max(dist, 15);
        dronePos.current.set(Math.cos(droneAngle.current) * r, r * 0.6, Math.sin(droneAngle.current) * r);
        tp.copy(carPos.current).add(dronePos.current);
        tl.copy(carPos.current);
        break;
      }
    }

    // Snap to target on first frame — prevents a long ease-in on load.
    if (!initialised.current) {
      camera.position.copy(tp);
      smoothLook.current.copy(tl);
      camera.lookAt(smoothLook.current);
      initialised.current = true;
      return;
    }

    // Frame-rate independent exponential damping.
    const posRate = THREE.MathUtils.lerp(12, 1.5, st.smoothing);
    const lookRate = THREE.MathUtils.lerp(14, 2, st.smoothing);
    const posAlpha = 1 - Math.exp(-posRate * dt);
    const lookAlpha = 1 - Math.exp(-lookRate * dt);

    camera.position.lerp(tp, posAlpha);
    smoothLook.current.lerp(tl, lookAlpha);
    camera.lookAt(smoothLook.current);

    if ("fov" in camera) {
      const cam = camera as THREE.PerspectiveCamera;
      cam.fov += (st.fov - cam.fov) * (1 - Math.exp(-8 * dt));
      cam.updateProjectionMatrix();
    }
  }, 1);

  return <OrbitControls ref={orbit} makeDefault={false} enableDamping dampingFactor={0.12} enabled={false} />;
}
