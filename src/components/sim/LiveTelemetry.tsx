import { useEffect, useMemo, useRef } from "react";
import { usePlayback, type PathSample } from "./store";

interface Channel {
  key: keyof PathSample | "speed_kmh" | "lat_g" | "long_g";
  label: string;
  color: string;
  unit: string;
  transform: (s: PathSample) => number;
}

const G = 9.80665;

const CHANNELS: Channel[] = [
  { key: "speed_kmh", label: "Speed", color: "#22d3ee", unit: "km/h", transform: (s) => s.speed_mps * 3.6 },
  { key: "lat_g", label: "Lateral acceleration", color: "#f5b042", unit: "g", transform: (s) => s.lat_accel / G },
  { key: "long_g", label: "Longitudinal acceleration", color: "#8b5cf6", unit: "g", transform: (s) => s.long_accel / G },
  { key: "fuel_rate_lps", label: "Fuel rate", color: "#ef4444", unit: "L/s", transform: (s) => s.fuel_rate_lps },
  { key: "safety_score", label: "Safety score", color: "#22c55e", unit: "/100", transform: (s) => s.safety_score },
];

/**
 * Live telemetry — canvas-plotted, drawn left→right as the vehicle progresses.
 * Reads from the same playback store as the 3D scene → zero drift.
 */
export function LiveTelemetry({ samples }: { samples: PathSample[] }) {
  const totalT = samples.length ? samples[samples.length - 1].t_s : 0;

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {CHANNELS.map((c) => (
        <ChannelChart key={c.label} samples={samples} channel={c} totalT={totalT} />
      ))}
    </div>
  );
}

function ChannelChart({ samples, channel, totalT }: { samples: PathSample[]; channel: Channel; totalT: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const valueRef = useRef<HTMLSpanElement>(null);

  // Precompute values + y range once per samples/channel
  const { values, yMin, yMax } = useMemo(() => {
    const values = samples.map(channel.transform);
    let yMin = Math.min(...values, 0);
    let yMax = Math.max(...values, 0);
    if (yMax - yMin < 0.001) { yMax = yMin + 1; }
    const pad = (yMax - yMin) * 0.08;
    return { values, yMin: yMin - pad, yMax: yMax + pad };
  }, [samples, channel]);

  useEffect(() => {
    const draw = (progress: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width, h = rect.height;
      if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // Axes / grid
      ctx.strokeStyle = "oklch(0.3 0.02 240 / 0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= 4; i++) {
        const y = (i / 4) * (h - 20) + 4;
        ctx.moveTo(30, y); ctx.lineTo(w - 6, y);
      }
      ctx.stroke();

      // Y axis labels
      ctx.fillStyle = "oklch(0.7 0.02 240)";
      ctx.font = "10px system-ui, sans-serif";
      for (let i = 0; i <= 4; i++) {
        const val = yMax - (i / 4) * (yMax - yMin);
        const y = (i / 4) * (h - 20) + 8;
        ctx.fillText(val.toFixed(Math.abs(val) < 10 ? 2 : 0), 2, y);
      }

      // Progress cursor position in samples
      const iMax = Math.max(1, Math.floor(progress * (values.length - 1)) + 1);

      // Line
      ctx.strokeStyle = channel.color;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      for (let i = 0; i < iMax; i++) {
        const x = 30 + (i / Math.max(1, values.length - 1)) * (w - 36);
        const y = 4 + (1 - (values[i] - yMin) / (yMax - yMin)) * (h - 20);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Playhead
      const px = 30 + progress * (w - 36);
      ctx.strokeStyle = "oklch(0.85 0.15 60 / 0.9)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h - 12); ctx.stroke();

      // X label
      ctx.fillStyle = "oklch(0.6 0.02 240)";
      ctx.fillText("0s", 30, h - 2);
      ctx.fillText(`${totalT.toFixed(1)}s`, w - 30, h - 2);

      // Live value
      if (valueRef.current) {
        const idx = Math.min(values.length - 1, Math.max(0, Math.round(progress * (values.length - 1))));
        valueRef.current.textContent = `${values[idx].toFixed(2)} ${channel.unit}`;
      }
    };
    draw(usePlayback.getState().progress);
    const unsub = usePlayback.subscribe((st) => draw(st.progress));
    const onResize = () => draw(usePlayback.getState().progress);
    window.addEventListener("resize", onResize);
    return () => { unsub(); window.removeEventListener("resize", onResize); };
  }, [values, yMin, yMax, channel, totalT]);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">{channel.label}</div>
        <span ref={valueRef} className="text-xs num tabular-nums" style={{ color: channel.color }}>—</span>
      </div>
      <div className="h-40 rounded border border-border/60 bg-background/40 overflow-hidden">
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>
    </div>
  );
}
