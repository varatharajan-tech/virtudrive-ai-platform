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
import { Plus, Trash2, Shuffle } from "lucide-react";

const ROAD_TYPES = ["highway","mountain","hairpin","race_track","off_road","urban","village"] as const;

interface CurveDraft { station: number; radius: number; angle_deg: number; bank_deg: number }

export const Route = createFileRoute("/_authenticated/roads/new")({
  component: NewRoad,
});

function NewRoad() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [f, setF] = useState({
    name: "", road_type: "highway" as typeof ROAD_TYPES[number],
    length_m: 5000, surface_mu: 0.9, base_slope_deg: 0, notes: "",
  });
  const [curves, setCurves] = useState<CurveDraft[]>([
    { station: 1000, radius: 200, angle_deg: 45, bank_deg: 0 },
  ]);
  const [saving, setSaving] = useState(false);

  function addCurve() {
    const lastStation = curves.length ? curves[curves.length - 1].station : 0;
    setCurves([...curves, { station: Math.min(f.length_m - 500, lastStation + 800), radius: 150, angle_deg: 60, bank_deg: 0 }]);
  }
  function randomize() {
    const n = 4 + Math.floor(Math.random() * 5);
    const arr: CurveDraft[] = [];
    for (let i = 0; i < n; i++) {
      const st = Math.floor((f.length_m * (i + 1)) / (n + 1));
      arr.push({ station: st, radius: 40 + Math.floor(Math.random() * 300), angle_deg: 30 + Math.floor(Math.random() * 120), bank_deg: 0 });
    }
    setCurves(arr);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { data, error } = await supabase.from("roads").insert({
        ...f, curves, owner_id: u.user.id, is_public: false,
      }).select("id").single();
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["roads"] });
      toast.success("Road created");
      nav({ to: "/roads/$id", params: { id: data.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally { setSaving(false); }
  }

  return (
    <div className="p-8 max-w-5xl">
      <PageHeader title="New road" subtitle="Design a road profile with curves, surface, and slope." />
      <form onSubmit={save} className="panel p-6 space-y-6">
        <div className="grid md:grid-cols-3 gap-4">
          <div><Label>Name</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></div>
          <div><Label>Type</Label>
            <Select value={f.road_type} onValueChange={(v) => setF({ ...f, road_type: v as typeof ROAD_TYPES[number] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ROAD_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Length (m)</Label><Input type="number" min="500" step="100" value={f.length_m} onChange={(e) => setF({ ...f, length_m: Number(e.target.value) })} /></div>
          <div><Label>Surface μ (0.4 mud – 1.1 track)</Label><Input type="number" step="0.01" min="0.3" max="1.2" value={f.surface_mu} onChange={(e) => setF({ ...f, surface_mu: Number(e.target.value) })} /></div>
          <div><Label>Base slope (°)</Label><Input type="number" step="0.5" value={f.base_slope_deg} onChange={(e) => setF({ ...f, base_slope_deg: Number(e.target.value) })} /></div>
          <div><Label>Notes</Label><Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm uppercase tracking-widest text-muted-foreground">Curves ({curves.length})</div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={randomize}><Shuffle className="w-3 h-3 mr-1" /> Randomize</Button>
              <Button type="button" size="sm" onClick={addCurve}><Plus className="w-3 h-3 mr-1" /> Add curve</Button>
            </div>
          </div>
          <div className="space-y-2">
            {curves.map((c, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end panel/50 border border-border/60 rounded-md p-2">
                <div className="col-span-1 text-xs text-muted-foreground pt-2 num">#{i + 1}</div>
                <div className="col-span-3"><Label className="text-[10px] uppercase text-muted-foreground">Station (m)</Label><Input type="number" value={c.station} onChange={(e) => update(i, { station: Number(e.target.value) })} /></div>
                <div className="col-span-3"><Label className="text-[10px] uppercase text-muted-foreground">Radius (m)</Label><Input type="number" min="10" value={c.radius} onChange={(e) => update(i, { radius: Number(e.target.value) })} /></div>
                <div className="col-span-2"><Label className="text-[10px] uppercase text-muted-foreground">Angle (°)</Label><Input type="number" min="5" max="360" value={c.angle_deg} onChange={(e) => update(i, { angle_deg: Number(e.target.value) })} /></div>
                <div className="col-span-2"><Label className="text-[10px] uppercase text-muted-foreground">Bank (°)</Label><Input type="number" step="0.5" value={c.bank_deg} onChange={(e) => update(i, { bank_deg: Number(e.target.value) })} /></div>
                <div className="col-span-1"><Button type="button" variant="destructive" size="sm" onClick={() => setCurves(curves.filter((_, j) => j !== i))}><Trash2 className="w-3 h-3" /></Button></div>
              </div>
            ))}
          </div>
        </div>

        <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Create road"}</Button>
      </form>
    </div>
  );

  function update(i: number, patch: Partial<CurveDraft>) {
    setCurves(curves.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  }
}
