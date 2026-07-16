import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import { PerspectiveCamera, Environment as DreiEnvironment } from "@react-three/drei";
import { useEffect } from "react";
import { usePlayback, type PathSample } from "./sim/store";
import { Vehicle } from "./sim/Vehicle";
import { Road } from "./sim/Road";
import { SimEnvironment } from "./sim/Environment";
import { Cameras } from "./sim/Cameras";
import { SceneAdvancer } from "./sim/SceneAdvancer";
import { PlaybackControls } from "./sim/PlaybackControls";
import { CameraControls } from "./sim/CameraControls";
import { PerfProbe } from "./sim/PerfProbe";
import { PerfOverlay } from "./sim/PerfOverlay";
import { DebugOverlay } from "./sim/DebugOverlay";
import { TelemetryOverlay } from "./sim/TelemetryOverlay";


export type { PathSample } from "./sim/store";

/**
 * Sim3DScene — orchestrator.
 * Componentised:
 *  - Physics / motion source of truth  → sim/store (Zustand)
 *  - Vehicle Controller                → Vehicle
 *  - Road Manager                      → Road
 *  - Environment                       → SimEnvironment
 *  - Camera Manager                    → Cameras
 *  - Playback / Simulation Controller  → SceneAdvancer + PlaybackControls
 */
export function Sim3DScene({ samples, vehicleColor }: { samples: PathSample[]; vehicleColor?: string }) {
  const setSamples = usePlayback((s) => s.setSamples);
  const fov = usePlayback((s) => s.fov);
  const showDebug = usePlayback((s) => s.showDebug);

  useEffect(() => { setSamples(samples); }, [samples, setSamples]);

  return (
    <div className="relative w-full h-full">
      <Canvas
        shadows
        dpr={[1, 1.75]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
      >
        <PerspectiveCamera makeDefault position={[20, 20, 20]} fov={fov} near={0.1} far={4000} />
        <color attach="background" args={["#a8c3dc"]} />
        <fog attach="fog" args={["#b6cce0", 350, 1600]} />
        <DreiEnvironment preset="park" environmentIntensity={0.55} />
        <SimEnvironment samples={samples} />
        <Road samples={samples} />
        <Vehicle color={vehicleColor} />
        <Cameras />
        <SceneAdvancer />
        <PerfProbe />
        <DebugOverlay samples={samples} />
      </Canvas>
      <CameraControls />
      <PerfOverlay />
      <TelemetryOverlay />
      <PlaybackControls />

      {showDebug && (
        <div
          id="virtudrive-debug-readout"
          className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-card/85 backdrop-blur border border-border rounded px-3 py-1.5 text-[11px] font-mono tabular-nums text-muted-foreground pointer-events-none"
        />
      )}
    </div>
  );
}
