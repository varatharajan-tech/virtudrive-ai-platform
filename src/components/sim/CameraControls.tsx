import { CAMERA_MODES, usePlayback } from "./store";
import { Camera, RefreshCw, Activity, Bug } from "lucide-react";

export function CameraControls() {
  const mode = usePlayback((s) => s.cameraMode);
  const fov = usePlayback((s) => s.fov);
  const dist = usePlayback((s) => s.followDistance);
  const sens = usePlayback((s) => s.sensitivity);
  const smooth = usePlayback((s) => s.smoothing);
  const autoFollow = usePlayback((s) => s.autoFollow);

  return (
    <div className="absolute top-3 left-3 bg-card/85 backdrop-blur border border-border rounded-md p-3 space-y-2 text-xs w-56">
      <div className="flex items-center gap-2 font-semibold text-[11px] uppercase tracking-widest text-muted-foreground">
        <Camera className="w-3.5 h-3.5" /> Camera
      </div>
      <select
        value={mode}
        onChange={(e) => usePlayback.getState().setCamera(e.target.value as never)}
        className="w-full bg-background border border-border rounded px-2 py-1 text-xs"
        aria-label="Camera mode"
      >
        {CAMERA_MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
      </select>

      <Slider label="FOV" value={fov} min={20} max={110} step={1} onChange={(v) => usePlayback.getState().setFov(v)} suffix="°" />
      <Slider label="Distance" value={dist} min={3} max={60} step={1} onChange={(v) => usePlayback.getState().setFollowDistance(v)} suffix="m" />
      <Slider label="Sensitivity" value={sens} min={0.1} max={3} step={0.1} onChange={(v) => usePlayback.getState().setSensitivity(v)} />
      <Slider label="Smoothing" value={smooth} min={0} max={1} step={0.05} onChange={(v) => usePlayback.getState().setSmoothing(v)} />

      <label className="flex items-center gap-2 text-muted-foreground cursor-pointer">
        <input type="checkbox" checked={autoFollow} onChange={(e) => usePlayback.getState().setAutoFollow(e.target.checked)} />
        Auto-follow
      </label>

      <div className="grid grid-cols-2 gap-1.5">
        <button
          onClick={() => {
            const st = usePlayback.getState();
            st.setFov(55); st.setFollowDistance(10); st.setSensitivity(1); st.setSmoothing(0.15); st.setAutoFollow(true);
          }}
          className="inline-flex items-center justify-center gap-1 py-1 rounded border border-border hover:bg-muted"
        >
          <RefreshCw className="w-3 h-3" /> Reset
        </button>
        <button
          onClick={() => usePlayback.getState().togglePerf()}
          aria-pressed={usePlayback((s) => s.showPerf)}
          className={`inline-flex items-center justify-center gap-1 py-1 rounded border ${
            usePlayback((s) => s.showPerf)
              ? "border-primary text-primary bg-primary/10"
              : "border-border hover:bg-muted"
          }`}
          title="Toggle performance overlay"
        >
          <Activity className="w-3 h-3" /> Perf
        </button>
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange, suffix }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; suffix?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-muted-foreground">
        <span>{label}</span>
        <span className="num tabular-nums">{value.toFixed(step < 1 ? 2 : 0)}{suffix ?? ""}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary"
        aria-label={label}
      />
    </div>
  );
}
