import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/vehicles/new")({
  component: NewVehicle,
});

const CATEGORIES = ["sedan","suv","truck","sports","off_road","motorcycle","commercial","ev"] as const;
const FUELS = ["petrol","diesel","electric","hybrid","cng"] as const;

function NewVehicle() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [f, setF] = useState({
    name: "", manufacturer: "", category: "sedan" as typeof CATEGORIES[number],
    mass_kg: 1400, wheelbase_m: 2.7, track_m: 1.55, cog_height_m: 0.55,
    frontal_area_m2: 2.2, drag_coeff: 0.30, rolling_resist_coeff: 0.012,
    tire_friction_mu: 0.9, max_power_kw: 110, max_torque_nm: 200,
    top_speed_kmh: 200, fuel_type: "petrol" as typeof FUELS[number],
    engine_efficiency: 0.32, fuel_energy_mj_per_l: 32,
    tank_capacity_l: 50, notes: "",
  });
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { data, error } = await supabase.from("vehicles").insert({
        ...f, owner_id: u.user.id, is_public: false,
      }).select("id").single();
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["vehicles"] });
      toast.success("Vehicle created");
      nav({ to: "/vehicles/$id", params: { id: data.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  const num = (k: keyof typeof f) => ({
    value: String(f[k] ?? ""),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setF((p) => ({ ...p, [k]: Number(e.target.value) })),
  });

  return (
    <div className="p-8 max-w-4xl">
      <PageHeader title="New vehicle" subtitle="Define physical specs for accurate simulation." />

      <form onSubmit={save} className="panel p-6 space-y-6">
        <div className="grid md:grid-cols-3 gap-4">
          <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
          <Field label="Manufacturer"><Input value={f.manufacturer} onChange={(e) => setF({ ...f, manufacturer: e.target.value })} /></Field>
          <Field label="Category">
            <Select value={f.category} onValueChange={(v) => setF({ ...f, category: v as typeof CATEGORIES[number] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </div>

        <Section title="Dimensions & mass">
          <Field label="Mass (kg)"><Input type="number" step="1" {...num("mass_kg")} /></Field>
          <Field label="Wheelbase (m)"><Input type="number" step="0.001" {...num("wheelbase_m")} /></Field>
          <Field label="Track (m)"><Input type="number" step="0.001" {...num("track_m")} /></Field>
          <Field label="CoG height (m)"><Input type="number" step="0.01" {...num("cog_height_m")} /></Field>
        </Section>

        <Section title="Aero & tires">
          <Field label="Frontal area (m²)"><Input type="number" step="0.01" {...num("frontal_area_m2")} /></Field>
          <Field label="Drag Cd"><Input type="number" step="0.001" {...num("drag_coeff")} /></Field>
          <Field label="Rolling Crr"><Input type="number" step="0.0001" {...num("rolling_resist_coeff")} /></Field>
          <Field label="Tire μ"><Input type="number" step="0.01" {...num("tire_friction_mu")} /></Field>
        </Section>

        <Section title="Powertrain">
          <Field label="Peak power (kW)"><Input type="number" step="1" {...num("max_power_kw")} /></Field>
          <Field label="Peak torque (Nm)"><Input type="number" step="1" {...num("max_torque_nm")} /></Field>
          <Field label="Top speed (km/h)"><Input type="number" step="1" {...num("top_speed_kmh")} /></Field>
          <Field label="Fuel type">
            <Select value={f.fuel_type} onValueChange={(v) => setF({ ...f, fuel_type: v as typeof FUELS[number] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{FUELS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Engine efficiency"><Input type="number" step="0.01" min="0.05" max="0.99" {...num("engine_efficiency")} /></Field>
          <Field label="Fuel energy (MJ/L)"><Input type="number" step="0.1" {...num("fuel_energy_mj_per_l")} /></Field>
          <Field label="Tank (L)"><Input type="number" step="1" {...num("tank_capacity_l")} /></Field>
        </Section>

        <div>
          <Label>Notes</Label>
          <Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </div>

        <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Create vehicle"}</Button>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs uppercase tracking-widest text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">{title}</div>
      <div className="grid md:grid-cols-4 gap-4">{children}</div>
    </div>
  );
}
