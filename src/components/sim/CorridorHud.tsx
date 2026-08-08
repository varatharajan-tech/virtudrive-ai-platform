import { ShieldAlert, X } from "lucide-react";
import { usePlayback } from "./store";

/**
 * CorridorHud — DOM readout for the protected-corridor debug overlay.
 * Shows terrain/prop breach counts from the live audit plus a per-frame
 * "nearest breach" line written straight into the DOM by CorridorOverlay.
 */
export function CorridorHud() {
  const show = usePlayback((s) => s.showCorridor);
  const stats = usePlayback((s) => s.corridorStats);
  const toggle = usePlayback((s) => s.toggleCorridor);

  if (!show) return null;

  const clear = stats.terrainHits === 0 && stats.propHits === 0;

  return (
    <div className="absolute top-3 left-3 w-56 bg-card/90 backdrop-blur border border-border rounded-md p-3 text-xs font-mono shadow-lg z-20 pointer-events-auto">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 font-semibold text-[11px] uppercase tracking-widest text-muted-foreground">
          <ShieldAlert className="w-3.5 h-3.5" /> Corridor
        </div>
        <button
          onClick={toggle}
          aria-label="Close corridor overlay"
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <Row label="Half-width" value={`${stats.halfWidth.toFixed(1)} m`} />
      <Row label="Probes" value={stats.terrainSamples.toLocaleString()} />
      <Row
        label="Terrain breaches"
        value={String(stats.terrainHits)}
        valueClass={stats.terrainHits ? "text-red-400" : "text-emerald-400"}
      />
      <Row
        label="Prop breaches"
        value={String(stats.propHits)}
        valueClass={stats.propHits ? "text-amber-400" : "text-emerald-400"}
      />
      <Row
        label="Worst overlap"
        value={`${stats.worstOverlap.toFixed(3)} m`}
        valueClass={stats.worstOverlap > 0.02 ? "text-red-400" : "text-emerald-400"}
      />

      <div
        id="virtudrive-corridor-readout"
        className={`mt-2 pt-2 border-t border-border text-[10px] leading-snug ${
          clear ? "text-emerald-400" : "text-amber-400"
        }`}
      />
    </div>
  );
}

function Row({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums ${valueClass ?? "text-foreground"}`}>{value}</span>
    </div>
  );
}
