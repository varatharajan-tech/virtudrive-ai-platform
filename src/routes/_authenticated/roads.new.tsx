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
import { Plus, Trash2, Shuffle, ArrowUp, ArrowDown, MountainSnow } from "lucide-react";
import { buildTwoUpTwoDown, buildEvenCurves, type SlopeDraft } from "@/lib/roads/builders";

const ROAD_TYPES = ["highway", "mountain", "hairpin", "race_track", "off_road", "urban", "village"] as const;
const LENGTH_PRESETS_KM = [1, 2, 5, 10];

interface CurveDraft { station: number; radius: number; angle_deg: number; bank_deg: number }

export const Route = createFileRoute("/_authenticated/roads/new")({
  component: NewRoad,
});

function NewRoad() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [f, setF] = useState({
    name: "",
    road_type: "highway" as typeof ROAD_TYPES[number],
    length_m: 5000,
    surface_mu: 0.9,
    base_slope_deg: 0,
    notes: "",
  });
  const [curveCount, setCurveCount] = useState(1);
  const [curves, setCurves] = useState<CurveDraft[]>([
    { station: 1000, radius: 200, angle_deg: 45, bank_deg: 0 },
  ]);
  const [slopes, setSlopes] = useState<SlopeDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  function setLength(m: number) {
    setF((p) => ({ ...p, length_m: m }));
  }

  function regenCurves(n: number) {
    setCurveCount(n);
    if (n <= 0) { setCurves([]); return; }
    setCurves(buildEvenCurves(f.length_m, n));
  }
  function addCurve() {
    const lastStation = curves.length ? curves[curves.length - 1].station : 0;
    const next = [...curves, { station: Math.min(f.length_m - 500, lastStation + 800), radius: 150, angle_deg: 60, bank_deg: 0 }];
    setCurves(next);
    setCurveCount(next.length);
  }
  function randomize() {
    const n = 4 + Math.floor(Math.random() * 5);
    const arr: CurveDraft[] = [];
    for (let i = 0; i < n; i++) {
      const st = Math.floor((f.length_m * (i + 1)) / (n + 1));
      arr.push({ station: st, radius: 40 + Math.floor(Math.random() * 300), angle_deg: 30 + Math.floor(Math.random() * 120), bank_deg: 0 });
    }
    setCurves(arr);
    setCurveCount(n);
  }

  function apply2Up2Down(deg = 5) {
    setSlopes(buildTwoUpTwoDown(f.length_m, deg));
  }
  function setSlopeCount(n: number) {
    const clamped = Math.max(0, Math.min(10, n));
    if (clamped === slopes.length) return;
    if (clamped < slopes.length) { setSlopes(slopes.slice(0, clamped)); return; }
    const add: SlopeDraft[] = [];
    const segLen = Math.max(200, Math.floor(f.length_m / (clamped + 1)));
    for (let i = slopes.length; i < clamped; i++) {
      add.push({
        direction: i % 2 === 0 ? "up" : "down",
        deg: 4,
        station_m: Math.floor((f.length_m * (i + 1)) / (clamped + 1)),
        length_m: segLen,
      });
    }
    setSlopes([...slopes, ...add]);
  }
  function updateSlope(i: number, patch: Partial<SlopeDraft>) {
    setSlopes(slopes.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrMsg(null);
    try {
      const { data: u, error: uerr } = await supabase.auth.getUser();
      if (uerr) throw uerr;
      if (!u.user) throw new Error("Not signed in");
      if (!f.name.trim()) throw new Error("Name is required");
      const elevation_profile = { slopes };
      const { data, error } = await supabase.from("roads").insert({
        name: f.name.trim(),
        road_type: f.road_type,
        length_m: f.length_m,
        surface_mu: f.surface_mu,
        base_slope_deg: f.base_slope_deg,
        notes: f.notes || null,
        curves: curves as unknown as never,
        elevation_profile: elevation_profile as unknown as never,
        owner_id: u.user.id,
        is_public: false,
      }).select("id").single();
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["roads"] });
      toast.success("Road created");
      nav({ to: "/roads/$id", params: { id: data.id } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create road";
      setErrMsg(msg);
      toast.error(msg);
    } finally { setSaving(false); }
  }

  return (
    <div className="p-8 max-w-5xl">
      <PageHeader title="New road" subtitle="Design a road profile with curves, slopes, and surface." />
      <form onSubmit={save} className="panel p-6 space-y-6">
        {errMsg && (
          <div className="rounded-md border border-destructive/60 bg-destructive/10 text-destructive text-sm px-3 py-2">
            {errMsg}
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-4">
          <div><Label>Name</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required placeholder="e.g. Ghat Test 6km" /></div>
          <div><Label>Type</Label>
            <Select value={f.road_type} onValueChange={(v) => setF({ ...f, road_type: v as typeof ROAD_TYPES[number] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ROAD_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Track length (m)</Label>
            <Input type="number" min="500" step="100" value={f.length_m} onChange={(e) => setLength(Number(e.target.value))} />
            <div className="flex gap-1 mt-1">
              {LENGTH_PRESETS_KM.map((km) => (
                <button key={km} type="button" onClick={() => setLength(km * 1000)}
                  className={`text-[10px] px-2 py-0.5 rounded border ${f.length_m === km * 1000 ? "bg-primary text-primary-foreground border-primary" : "border-border/60 hover:border-primary/60"}`}>
                  {km} km
                </button>
              ))}
            </div>
          </div>
          <div><Label>Surface μ (0.4 mud – 1.1 track)</Label><Input type="number" step="0.01" min="0.3" max="1.2" value={f.surface_mu} onChange={(e) => setF({ ...f, surface_mu: Number(e.target.value) })} /></div>
          <div><Label>Base slope (°)</Label><Input type="number" step="0.5" value={f.base_slope_deg} onChange={(e) => setF({ ...f, base_slope_deg: Number(e.target.value) })} /></div>
          <div><Label>Notes</Label><Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
        </div>

        {/* Slopes */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <MountainSnow className="w-4 h-4" /> Slopes ({slopes.length})
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-[10px] uppercase text-muted-foreground">Count</Label>
              <Input type="number" min="0" max="10" value={slopes.length} onChange={(e) => setSlopeCount(Number(e.target.value))} className="w-20" />
              <Button type="button" variant="outline" size="sm" onClick={() => apply2Up2Down(5)}>2 Up + 2 Down</Button>
            </div>
          </div>
          <div className="space-y-2">
            {slopes.length === 0 && (
              <div className="text-xs text-muted-foreground">No slopes. Use the preset for 2 ascending + 2 descending grades, or set a count.</div>
            )}
            {slopes.map((s, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end border border-border/60 rounded-md p-2">
                <div className="col-span-1 text-xs text-muted-foreground pt-2 num">#{i + 1}</div>
                <div className="col-span-3">
                  <Label className="text-[10px] uppercase text-muted-foreground">Direction</Label>
                  <Select value={s.direction} onValueChange={(v) => updateSlope(i, { direction: v as "up" | "down" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="up"><span className="flex items-center gap-1"><ArrowUp className="w-3 h-3" /> Up</span></SelectItem>
                      <SelectItem value="down"><span className="flex items-center gap-1"><ArrowDown className="w-3 h-3" /> Down</span></SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2"><Label className="text-[10px] uppercase text-muted-foreground">Degree (°)</Label><Input type="number" step="0.5" min="0" max="15" value={s.deg} onChange={(e) => updateSlope(i, { deg: Number(e.target.value) })} /></div>
                <div className="col-span-3"><Label className="text-[10px] uppercase text-muted-foreground">Station (m)</Label><Input type="number" min="0" value={s.station_m} onChange={(e) => updateSlope(i, { station_m: Number(e.target.value) })} /></div>
                <div className="col-span-2"><Label className="text-[10px] uppercase text-muted-foreground">Length (m)</Label><Input type="number" min="50" value={s.length_m} onChange={(e) => updateSlope(i, { length_m: Number(e.target.value) })} /></div>
                <div className="col-span-1"><Button type="button" variant="destructive" size="sm" onClick={() => setSlopes(slopes.filter((_, j) => j !== i))}><Trash2 className="w-3 h-3" /></Button></div>
              </div>
            ))}
          </div>
        </div>

        {/* Curves */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm uppercase tracking-widest text-muted-foreground">Curves ({curves.length})</div>
            <div className="flex items-center gap-2">
              <Label className="text-[10px] uppercase text-muted-foreground">Count</Label>
              <Input type="number" min="0" max="20" value={curveCount} onChange={(e) => regenCurves(Number(e.target.value))} className="w-20" />
              <Button type="button" variant="outline" size="sm" onClick={randomize}><Shuffle className="w-3 h-3 mr-1" /> Randomize</Button>
              <Button type="button" size="sm" onClick={addCurve}><Plus className="w-3 h-3 mr-1" /> Add</Button>
            </div>
          </div>
          <div className="space-y-2">
            {curves.map((c, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end border border-border/60 rounded-md p-2">
                <div className="col-span-1 text-xs text-muted-foreground pt-2 num">#{i + 1}</div>
                <div className="col-span-3"><Label className="text-[10px] uppercase text-muted-foreground">Station (m)</Label><Input type="number" value={c.station} onChange={(e) => update(i, { station: Number(e.target.value) })} /></div>
                <div className="col-span-3"><Label className="text-[10px] uppercase text-muted-foreground">Radius (m)</Label><Input type="number" min="10" value={c.radius} onChange={(e) => update(i, { radius: Number(e.target.value) })} /></div>
                <div className="col-span-2"><Label className="text-[10px] uppercase text-muted-foreground">Angle (°)</Label><Input type="number" min="5" max="360" value={c.angle_deg} onChange={(e) => update(i, { angle_deg: Number(e.target.value) })} /></div>
                <div className="col-span-2"><Label className="text-[10px] uppercase text-muted-foreground">Bank (°)</Label><Input type="number" step="0.5" value={c.bank_deg} onChange={(e) => update(i, { bank_deg: Number(e.target.value) })} /></div>
                <div className="col-span-1"><Button type="button" variant="destructive" size="sm" onClick={() => { const next = curves.filter((_, j) => j !== i); setCurves(next); setCurveCount(next.length); }}><Trash2 className="w-3 h-3" /></Button></div>
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
