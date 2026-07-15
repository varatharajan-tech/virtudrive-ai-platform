import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

export interface PathSample {
  idx: number;
  s_m: number;
  t_s: number;
  x: number;
  y: number;
  z: number;
  heading_rad: number;
  speed_mps: number;
  lat_accel: number;
  long_accel: number;
  steering_deg: number;
  fuel_rate_lps: number;
  safety_score: number;
  radius_m: number | null;
}

export type CameraMode =
  | "chase"
  | "driver"
  | "hood"
  | "roof"
  | "top"
  | "side"
  | "front"
  | "drone"
  | "free"
  | "replay";

export const CAMERA_MODES: { id: CameraMode; label: string }[] = [
  { id: "chase", label: "Chase" },
  { id: "driver", label: "Driver" },
  { id: "hood", label: "Hood" },
  { id: "roof", label: "Roof" },
  { id: "top", label: "Top" },
  { id: "side", label: "Side" },
  { id: "front", label: "Front" },
  { id: "drone", label: "Drone" },
  { id: "free", label: "Free" },
  { id: "replay", label: "Replay" },
];

export interface InterpSample extends PathSample {
  /** interpolation-derived instantaneous body pitch (rad, +nose up) */
  pitch_rad: number;
  /** instantaneous body roll (rad, +right side down) */
  roll_rad: number;
}

interface PlaybackState {
  samples: PathSample[];
  duration: number;
  progress: number; // 0..1
  playing: boolean;
  speed: number; // playback multiplier
  cameraMode: CameraMode;
  fov: number;
  followDistance: number;
  sensitivity: number;
  smoothing: number;
  autoFollow: boolean;

  // perf monitor
  showPerf: boolean;
  perfStats: PerfStats;

  // debug overlay (spline, forward/right vectors, heading readout)
  showDebug: boolean;

  // dev telemetry HUD (physics readouts)
  showTelemetry: boolean;
  telemetry: TelemetryFrame;


  // actions
  setSamples: (s: PathSample[]) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  restart: () => void;
  setProgress: (p: number) => void;
  advance: (dt: number) => void;
  stepFrame: (dir: 1 | -1) => void;
  setSpeed: (v: number) => void;
  setCamera: (m: CameraMode) => void;
  setFov: (v: number) => void;
  setFollowDistance: (v: number) => void;
  setSensitivity: (v: number) => void;
  setSmoothing: (v: number) => void;
  setAutoFollow: (v: boolean) => void;
  togglePerf: () => void;
  setPerfStats: (p: Partial<PerfStats>) => void;
  toggleDebug: () => void;
  toggleTelemetry: () => void;
  setTelemetry: (t: Partial<TelemetryFrame>) => void;
}

export interface TelemetryFrame {
  speed_kmh: number;
  steer_deg: number;
  throttle: number; // 0..1
  brake: number; // 0..1
  wheelRpm: number;
  susTravel: [number, number, number, number]; // meters, +compressed
  rollDeg: number;
  pitchDeg: number;
  latG: number;
  lonG: number;
  gTotal: number;
  weightFront: number; // 0..1 fraction of total load on front axle
  weightRight: number; // 0..1 fraction on right side
}

export interface PerfStats {

  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
  memoryMB: number | null;
  memoryLimitMB: number | null;
  renderer: string;
}

export const usePlayback = create<PlaybackState>()(
  subscribeWithSelector((set, get) => ({
    samples: [],
    duration: 0,
    progress: 0,
    playing: true,
    speed: 1,
    cameraMode: "chase",
    fov: 55,
    followDistance: 10,
    sensitivity: 1,
    smoothing: 0.15,
    autoFollow: true,
    showPerf: false,
    perfStats: {
      fps: 0, frameMs: 0, drawCalls: 0, triangles: 0,
      geometries: 0, textures: 0, programs: 0,
      memoryMB: null, memoryLimitMB: null, renderer: "",
    },
    showDebug: false,
    showTelemetry: false,
    telemetry: {
      speed_kmh: 0, steer_deg: 0, throttle: 0, brake: 0, wheelRpm: 0,
      susTravel: [0, 0, 0, 0], rollDeg: 0, pitchDeg: 0,
      latG: 0, lonG: 0, gTotal: 0, weightFront: 0.5, weightRight: 0.5,
    },


    setSamples: (s) => {
      const duration = s.length ? s[s.length - 1].t_s : 0;
      set({ samples: s, duration, progress: 0, playing: true });
    },
    play: () => set({ playing: true }),
    pause: () => set({ playing: false }),
    toggle: () => set((st) => ({ playing: !st.playing })),
    restart: () => set({ progress: 0, playing: true }),
    setProgress: (p) => set({ progress: Math.max(0, Math.min(1, p)) }),
    advance: (dt) => {
      const { playing, progress, speed, duration } = get();
      if (!playing || duration <= 0) return;
      const next = progress + (dt * speed) / duration;
      if (next >= 1) set({ progress: 1, playing: false });
      else set({ progress: next });
    },
    stepFrame: (dir) => {
      const { samples, progress } = get();
      if (samples.length < 2) return;
      const frameStep = 1 / (samples.length - 1);
      set({
        progress: Math.max(0, Math.min(1, progress + dir * frameStep)),
        playing: false,
      });
    },
    setSpeed: (v) => set({ speed: Math.max(0.1, Math.min(8, v)) }),
    setCamera: (m) => set({ cameraMode: m }),
    setFov: (v) => set({ fov: Math.max(20, Math.min(110, v)) }),
    setFollowDistance: (v) => set({ followDistance: Math.max(3, Math.min(60, v)) }),
    setSensitivity: (v) => set({ sensitivity: Math.max(0.1, Math.min(3, v)) }),
    setSmoothing: (v) => set({ smoothing: Math.max(0, Math.min(1, v)) }),
    setAutoFollow: (v) => set({ autoFollow: v }),
    togglePerf: () => set((st) => ({ showPerf: !st.showPerf })),
    setPerfStats: (p) => set((st) => ({ perfStats: { ...st.perfStats, ...p } })),
    toggleDebug: () => set((st) => ({ showDebug: !st.showDebug })),
  })),
);

/** Interpolate a sample at fractional index i (0..n-1). */
export function sampleAt(samples: PathSample[], progress: number): InterpSample | null {
  if (!samples.length) return null;
  const n = samples.length;
  const f = Math.max(0, Math.min(1, progress)) * (n - 1);
  const i0 = Math.floor(f);
  const i1 = Math.min(n - 1, i0 + 1);
  const t = f - i0;
  const a = samples[i0];
  const b = samples[i1];
  // shortest-arc heading interp
  let dh = b.heading_rad - a.heading_rad;
  while (dh > Math.PI) dh -= Math.PI * 2;
  while (dh < -Math.PI) dh += Math.PI * 2;
  const heading = a.heading_rad + dh * t;

  const speed = a.speed_mps + (b.speed_mps - a.speed_mps) * t;
  const lat = a.lat_accel + (b.lat_accel - a.lat_accel) * t;
  const lon = a.long_accel + (b.long_accel - a.long_accel) * t;
  const steerMag = a.steering_deg + (b.steering_deg - a.steering_deg) * t;

  // Turn direction sign from cross-product of consecutive segments in sim (x,y).
  // Positive cross → CCW turn in sim = "left" turn.
  const prev = samples[Math.max(0, i0 - 1)];
  const nxt = samples[Math.min(n - 1, i1 + 1)];
  const v1x = a.x - prev.x, v1y = a.y - prev.y;
  const v2x = nxt.x - b.x, v2y = nxt.y - b.y;
  const cross = v1x * v2y - v1y * v2x;
  const turnSign = cross > 0 ? 1 : cross < 0 ? -1 : 0;

  const G = 9.80665;
  // Body dynamics — magnitudes calibrated for stylized realism.
  const roll_rad = -turnSign * Math.min(0.12, (Math.abs(lat) / G) * 0.06);
  const pitch_rad = Math.max(-0.09, Math.min(0.09, (-lon / G) * 0.05));

  // Signed steering: positive = left turn (matches +rotation.y on front wheels
  // when mesh forward is -Z).
  const steer = steerMag * turnSign;

  return {
    idx: i0,
    s_m: a.s_m + (b.s_m - a.s_m) * t,
    t_s: a.t_s + (b.t_s - a.t_s) * t,
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
    heading_rad: heading,
    speed_mps: speed,
    lat_accel: lat,
    long_accel: lon,
    steering_deg: steer,
    fuel_rate_lps: a.fuel_rate_lps + (b.fuel_rate_lps - a.fuel_rate_lps) * t,
    safety_score: a.safety_score + (b.safety_score - a.safety_score) * t,
    radius_m: a.radius_m,
    pitch_rad,
    roll_rad,
  };
}

/**
 * Convert an interpolated sim sample into world-space transform data.
 * Sim (x,y,z) → world (x, z, -y). Heading h is measured CCW in sim (x,y).
 * World travel direction = (cos h, 0, -sin h).
 * Mesh convention: vehicle model's front points along local -Z, so
 * body rotation.y must equal (h - π/2).
 */
export function worldFromSample(s: InterpSample) {
  const h = s.heading_rad;
  const cos = Math.cos(h);
  const sin = Math.sin(h);
  return {
    position: [s.x, s.z, -s.y] as [number, number, number],
    yaw: h - Math.PI / 2,
    forward: [cos, 0, -sin] as [number, number, number],
    right: [-sin, 0, -cos] as [number, number, number],
  };
}
