import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import {
  corneringLimitSpeed, rolloverLimitSpeed, topSpeedFlat, maxSlopeRad,
  radToDeg, staticStabilityFactor,
} from "@/lib/physics";
import { PlayCircle } from "lucide-react";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { QueryStateView } from "@/components/QueryStateView";

export const Route = createFileRoute("/_authenticated/vehicles/$id")({
  component: VehicleDetail,
});

function VehicleDetail() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: v, isLoading, error, refetch } = useQuery({
    queryKey: ["vehicle", id],
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.from("vehicles").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Vehicles cascade to simulations + telemetry, so show the blast radius before deleting.
  const { data: impact } = useQuery({
    queryKey: ["vehicle-impact", id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("simulations")
        .select("id", { count: "exact", head: true })
        .eq("vehicle_id", id);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const del = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from("vehicles").delete().eq("id", id).select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Delete blocked (permission denied)");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vehicles"] });
      qc.invalidateQueries({ queryKey: ["sims"] });
      toast.success("Vehicle deleted");
      nav({ to: "/vehicles", replace: true });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (isLoading || error || !v) {
    return (
      <QueryStateView
        isLoading={isLoading}
        error={error}
        notFound={!isLoading && !error && !v}
        entity="vehicle"
        backTo="/vehicles"
        backLabel="Back to vehicles"
        onRetry={() => void refetch()}
      />
    );
  }

  const spec = {
    ...v,
    mass_kg: Number(v.mass_kg), wheelbase_m: Number(v.wheelbase_m), track_m: Number(v.track_m),
    cog_height_m: Number(v.cog_height_m), frontal_area_m2: Number(v.frontal_area_m2),
    drag_coeff: Number(v.drag_coeff), rolling_resist_coeff: Number(v.rolling_resist_coeff),
    tire_friction_mu: Number(v.tire_friction_mu), max_power_kw: Number(v.max_power_kw),
    max_torque_nm: Number(v.max_torque_nm), engine_efficiency: Number(v.engine_efficiency),
    fuel_energy_mj_per_l: Number(v.fuel_energy_mj_per_l),
  };
  const ssf = staticStabilityFactor(spec);
  const top = topSpeedFlat(spec) * 3.6;
  const maxSl = radToDeg(maxSlopeRad(spec));
  const sample = [50, 100, 200, 500].map((r) => ({
    r,
    skid: corneringLimitSpeed(r, spec.tire_friction_mu) * 3.6,
    roll: rolloverLimitSpeed(r, spec) * 3.6,
  }));

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <PageHeader
        title={v.manufacturer ? `${v.manufacturer} ${v.name}` : v.name}
        subtitle={`${v.category} • ${v.fuel_type}`}
        action={
          <>
            <Link to="/simulate" search={{ vehicleId: id }}>
              <Button><PlayCircle className="w-4 h-4 mr-2" /> Simulate</Button>
            </Link>
            {!v.is_public && (
              <ConfirmDeleteButton
                ariaLabel="Delete vehicle"
                pending={del.isPending}
                title="Delete this vehicle?"
                description={
                  <>
                    <p><strong>{v.name}</strong> will be permanently removed.</p>
                    {impact && impact > 0 ? (
                      <p className="text-destructive font-medium">
                        This also deletes {impact} simulation{impact === 1 ? "" : "s"} that used this vehicle, including all of their telemetry.
                      </p>
                    ) : (
                      <p>No simulations currently use this vehicle.</p>
                    )}
                    <p>This cannot be undone.</p>
                  </>
                }
                onConfirm={() => del.mutate()}
              />
            )}
          </>
        }
      />

      <div className="grid md:grid-cols-2 gap-4 md:gap-6">
        <div className="panel p-4 sm:p-6">
          <h3 className="text-sm uppercase tracking-widest text-muted-foreground mb-4">Specifications</h3>
          <dl className="grid grid-cols-2 gap-x-4 sm:gap-x-6 gap-y-2 text-sm num">
            <Row k="Mass" v={`${v.mass_kg} kg`} />
            <Row k="Wheelbase" v={`${v.wheelbase_m} m`} />
            <Row k="Track" v={`${v.track_m} m`} />
            <Row k="CoG height" v={`${v.cog_height_m} m`} />
            <Row k="Frontal area" v={`${v.frontal_area_m2} m²`} />
            <Row k="Drag Cd" v={String(v.drag_coeff)} />
            <Row k="Rolling Crr" v={String(v.rolling_resist_coeff)} />
            <Row k="Tire μ" v={String(v.tire_friction_mu)} />
            <Row k="Peak power" v={`${v.max_power_kw} kW`} />
            <Row k="Peak torque" v={`${v.max_torque_nm} Nm`} />
            <Row k="Engine η" v={String(v.engine_efficiency)} />
            <Row k="Fuel energy" v={`${v.fuel_energy_mj_per_l} MJ/L`} />
          </dl>
        </div>

        <div className="panel p-4 sm:p-6">
          <h3 className="text-sm uppercase tracking-widest text-muted-foreground mb-4">Derived limits</h3>
          <div className="space-y-3 num">
            <Big k="Static Stability Factor" v={ssf.toFixed(2)} note="t / (2h) — higher = harder to roll" />
            <Big k="Theoretical top speed (flat)" v={`${top.toFixed(0)} km/h`} note="Drive = drag balance" />
            <Big k="Max climbable slope" v={`${maxSl.toFixed(1)}°`} note="Traction-limited (μ − Crr)" />
          </div>
          <div className="mt-6">
            <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Cornering limits (km/h)</div>
            <div className="overflow-x-auto -mx-2 sm:mx-0">
              <table className="w-full min-w-[360px] text-sm num">
                <thead>
                  <tr className="text-muted-foreground text-xs uppercase tracking-widest">
                    <th className="text-left py-1 px-2">Radius</th>
                    <th className="text-right px-2">Skid</th>
                    <th className="text-right px-2">Rollover</th>
                    <th className="text-right px-2">Governs</th>
                  </tr>
                </thead>
                <tbody>
                  {sample.map((s) => (
                    <tr key={s.r} className="border-t border-border/40">
                      <td className="py-1 px-2">{s.r} m</td>
                      <td className="text-right px-2">{s.skid.toFixed(1)}</td>
                      <td className="text-right px-2">{s.roll.toFixed(1)}</td>
                      <td className="text-right px-2 text-primary">{Math.min(s.skid, s.roll).toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return (<><dt className="text-muted-foreground">{k}</dt><dd className="text-right">{v}</dd></>);
}
function Big({ k, v, note }: { k: string; v: string; note: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-border/40 pb-2">
      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">{k}</div>
        <div className="text-[11px] text-muted-foreground">{note}</div>
      </div>
      <div className="text-xl font-semibold text-primary">{v}</div>
    </div>
  );
}
