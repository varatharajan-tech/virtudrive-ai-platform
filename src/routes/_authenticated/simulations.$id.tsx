import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Suspense, lazy, useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, Sparkles, Loader2, Trash2 } from "lucide-react";
import { explainSimulation, type AIExplanation } from "@/lib/ai/explain.functions";
import { useServerFn } from "@tanstack/react-start";
import { predictFromResults } from "@/lib/ai/heuristics";
import type { SimResults } from "@/lib/physics/simulation";
import { LiveMinimap } from "@/components/sim/LiveMinimap";
import { LiveTelemetry } from "@/components/sim/LiveTelemetry";
import type { PathSample } from "@/components/sim/store";

const Scene3D = lazy(() => import("@/components/Sim3DScene").then((m) => ({ default: m.Sim3DScene })));

export const Route = createFileRoute("/_authenticated/simulations/$id")({
  component: SimResultsPage,
});

interface SimRow {
  id: string; name: string; created_at: string;
  vehicle: { id: string; name: string; manufacturer: string | null; category: string; mass_kg: number; wheelbase_m: number; track_m: number; cog_height_m: number; tire_friction_mu: number; fuel_type: string } | null;
  road: { id: string; name: string; road_type: string; length_m: number; surface_mu: number; base_slope_deg: number; curves: unknown } | null;
  results: { summary: SimResults["summary"]; prediction: ReturnType<typeof predictFromResults> } | null;
  ai_summary: AIExplanation | null;
}

function SimResultsPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const explain = useServerFn(explainSimulation);
  const [generatingAI, setGeneratingAI] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["sim", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("simulations")
        .select("*, vehicle:vehicles(*), road:roads(*)").eq("id", id).single();
      if (error) throw error;
      return data as unknown as SimRow;
    },
  });

  const { data: samples } = useQuery({
    queryKey: ["sim-samples", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("simulation_samples").select("*").eq("simulation_id", id).order("idx");
      if (error) throw error;
      return data;
    },
  });

  const del = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("simulations").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Deleted"); window.location.href = "/dashboard"; },
  });

  async function generateAI() {
    if (!data?.results || !data.vehicle || !data.road) return;
    setGeneratingAI(true);
    try {
      const ssf = Number(data.vehicle.track_m) / (2 * Number(data.vehicle.cog_height_m));
      const curves = (data.road.curves as Array<{ radius: number }>) ?? [];
      const minR = curves.length ? Math.min(...curves.map((c) => c.radius)) : null;
      const explanation = await explain({
        data: {
          vehicle: {
            name: data.vehicle.name, manufacturer: data.vehicle.manufacturer,
            category: data.vehicle.category, mass_kg: Number(data.vehicle.mass_kg),
            ssf, tire_friction_mu: Number(data.vehicle.tire_friction_mu),
          },
          road: {
            name: data.road.name, road_type: data.road.road_type,
            length_m: Number(data.road.length_m), surface_mu: Number(data.road.surface_mu),
            base_slope_deg: Number(data.road.base_slope_deg),
            num_curves: curves.length, min_radius: minR,
          },
          summary: {
            top_speed_kmh: data.results.summary.top_speed_kmh,
            avg_speed_kmh: data.results.summary.avg_speed_kmh,
            max_lat_g: data.results.summary.max_lat_g,
            min_safety_score: data.results.summary.min_safety_score,
            fuel_per_100km: data.results.summary.fuel_per_100km,
            total_time_s: data.results.summary.total_time_s,
          },
          prediction: {
            safety_score: data.results.prediction.safety_score,
            risk_level: data.results.prediction.risk_level,
            skid_probability: data.results.prediction.skid_probability,
            rollover_probability: data.results.prediction.rollover_probability,
            key_risks: data.results.prediction.key_risks,
            recommendations: data.results.prediction.recommendations,
          },
        },
      });
      const { error } = await supabase.from("simulations").update({ ai_summary: explanation as never }).eq("id", id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["sim", id] });
      toast.success("AI report generated");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "AI failed";
      if (msg.includes("429")) toast.error("AI rate limit — please try again in a moment");
      else if (msg.includes("402")) toast.error("AI credits exhausted");
      else toast.error(msg);
    } finally { setGeneratingAI(false); }
  }

  async function downloadPDF() {
    if (!data?.results || !data.vehicle || !data.road) return;
    try {
      const [{ generatePdfReport }, snap] = await Promise.all([
        import("@/lib/pdf/report"),
        import("@/lib/pdf/snapshots"),
      ]);
      const scene = snap.captureSceneSnapshot();
      const path = snap.renderPathSnapshot(pathSamples);
      const elevation = snap.renderElevationSnapshot(pathSamples);
      const blob = await generatePdfReport({
        simName: data.name, simId: data.id, createdAt: data.created_at,
        vehicle: data.vehicle, road: data.road,
        summary: data.results.summary, prediction: data.results.prediction,
        ai: data.ai_summary,
        samples: pathSamples,
        snapshots: { scene, path, elevation },
      });
      if (!blob || blob.size === 0) throw new Error("PDF generation produced an empty file");
      // Force MIME so browsers treat the object URL as a downloadable PDF.
      const pdfBlob = blob.type === "application/pdf" ? blob : new Blob([blob], { type: "application/pdf" });
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${data.name.replace(/[/\\?%*:|"<>]/g, "_")}.pdf`;
      a.rel = "noopener";
      // Anchor must be in the DOM for Firefox; revoke only after the download stream starts.
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(url);
      }, 4000);
      toast.success("Report downloaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PDF generation failed");
    }
  }

  const pathSamples: PathSample[] = useMemo(
    () => (samples ?? []).map((r) => ({
      idx: Number(r.idx),
      s_m: Number(r.s_m),
      t_s: Number(r.t_s),
      x: Number(r.x),
      y: Number(r.y),
      z: Number(r.z),
      heading_rad: Number(r.heading_rad),
      speed_mps: Number(r.speed_mps),
      lat_accel: Number(r.lat_accel),
      long_accel: Number(r.long_accel),
      steering_deg: Number(r.steering_deg),
      fuel_rate_lps: Number(r.fuel_rate_lps),
      safety_score: Number(r.safety_score),
      radius_m: null,
    })),
    [samples],
  );

  if (isLoading || !data) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!data.results) return <div className="p-8 text-muted-foreground">Simulation has no results.</div>;

  const s = data.results.summary;
  const p = data.results.prediction;


  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader
        title={data.name}
        subtitle={`${data.vehicle?.name} • ${data.road?.name} • ${new Date(data.created_at).toLocaleString()}`}
        action={
          <>
            <Button variant="outline" onClick={downloadPDF}><Download className="w-4 h-4 mr-2" /> PDF Report</Button>
            <Button variant="destructive" size="icon" onClick={() => del.mutate()} aria-label="Delete simulation"><Trash2 className="w-4 h-4" /></Button>
          </>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3 mb-6">
        <KPI k="Top speed" v={`${s.top_speed_kmh.toFixed(0)} km/h`} tone="primary" />
        <KPI k="Avg speed" v={`${s.avg_speed_kmh.toFixed(0)} km/h`} />
        <KPI k="Peak lateral" v={`${s.max_lat_g.toFixed(2)} g`} tone={s.max_lat_g > 0.8 ? "warn" : undefined} />
        <KPI k="Safety score" v={`${p.safety_score}/100`} tone={p.risk_level === "critical" || p.risk_level === "high" ? "danger" : p.risk_level === "moderate" ? "warn" : "success"} />
        <KPI k="Fuel / 100km" v={`${s.fuel_per_100km.toFixed(2)} L*`} />
        <KPI k="Duration" v={`${s.total_time_s.toFixed(1)} s`} />
        <KPI k="Skid P" v={`${(p.skid_probability * 100).toFixed(0)}%`} />
        <KPI k="Rollover P" v={`${(p.rollover_probability * 100).toFixed(0)}%`} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 lg:gap-6">
        <div className="panel p-3 sm:p-4 lg:col-span-2">
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">3D playback</div>
          <div className="h-[60vh] min-h-[320px] sm:h-[480px] lg:h-[560px] rounded-md overflow-hidden border border-border/60">
            <Suspense fallback={<div className="grid place-items-center h-full text-muted-foreground text-sm">Loading 3D…</div>}>
              {pathSamples.length > 0 && <Scene3D samples={pathSamples} />}
            </Suspense>
          </div>
        </div>
        <div className="panel p-3 sm:p-4 space-y-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Live minimap</div>
            {pathSamples.length > 0 && <LiveMinimap samples={pathSamples} />}
          </div>
          <CameraControls inline />
        </div>
      </div>

      <div className="mt-6 panel p-3 sm:p-4">
        <div className="text-xs uppercase tracking-widest text-muted-foreground mb-4">Live telemetry</div>
        {pathSamples.length > 0 && <LiveTelemetry samples={pathSamples} />}
      </div>


      <div className="mt-6 grid md:grid-cols-2 gap-4 md:gap-6">
        <div className="panel p-4 sm:p-6">
          <h3 className="text-sm uppercase tracking-widest text-muted-foreground mb-3">Key risks</h3>
          {p.key_risks.length ? (
            <ul className="text-sm space-y-2 list-disc list-inside">{p.key_risks.map((r, i) => <li key={i}>{r}</li>)}</ul>
          ) : (<div className="text-sm text-muted-foreground">No significant risks detected.</div>)}
        </div>
        <div className="panel p-4 sm:p-6">
          <h3 className="text-sm uppercase tracking-widest text-muted-foreground mb-3">Baseline recommendations</h3>
          <ul className="text-sm space-y-2 list-disc list-inside">{p.recommendations.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </div>
      </div>

      <div className="mt-6 panel p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h3 className="text-sm uppercase tracking-widest text-muted-foreground">AI Engineering Report</h3>
            <p className="text-xs text-muted-foreground mt-1">GPT-powered analysis grounded in physics results.</p>
          </div>
          {!data.ai_summary && (
            <Button onClick={generateAI} disabled={generatingAI} className="w-full sm:w-auto">
              {generatingAI ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating…</> : <><Sparkles className="w-4 h-4 mr-2" /> Generate</>}
            </Button>
          )}
        </div>
        {data.ai_summary ? (
          <div className="space-y-4 text-sm">
            <AiSection label="Executive summary" body={data.ai_summary.executive_summary} />
            <AiSection label="Performance analysis" body={data.ai_summary.performance_analysis} />
            <AiSection label="Safety analysis" body={data.ai_summary.safety_analysis} />
            <AiSection label="Fuel / energy" body={data.ai_summary.fuel_analysis} />
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Engineering recommendations</div>
              <ul className="list-disc list-inside space-y-1">{data.ai_summary.engineering_recommendations.map((r, i) => <li key={i}>{r}</li>)}</ul>
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">Click Generate to add narrative analysis.</div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground mt-6">
        * Fuel/100km uses the vehicle's fuel energy density; for EVs this is a kWh-equivalent based on the configured energy per litre.{" "}
        <Link to="/simulate" className="text-primary hover:underline">Run another simulation →</Link>
      </p>
    </div>
  );
}

function KPI({ k, v, tone }: { k: string; v: string; tone?: "primary" | "warn" | "danger" | "success" }) {
  const c = tone === "danger" ? "text-destructive" : tone === "warn" ? "text-warning" : tone === "success" ? "text-success" : tone === "primary" ? "text-primary" : "";
  return (
    <div className="panel p-3 sm:p-4">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground truncate">{k}</div>
      <div className={`text-lg sm:text-2xl font-semibold num mt-1 ${c}`}>{v}</div>
    </div>
  );
}
function AiSection({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">{label}</div>
      <p className="leading-relaxed">{body}</p>
    </div>
  );
}
