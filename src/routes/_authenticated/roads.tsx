import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Plus, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/roads")({
  component: RoadsList,
});

function RoadsList() {
  const { data, isLoading } = useQuery({
    queryKey: ["roads"],
    queryFn: async () => {
      const { data, error } = await supabase.from("roads").select("*").order("is_public", { ascending: true }).order("name");
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="p-8">
      <PageHeader
        title="Roads"
        subtitle="Build custom routes or use seeded test tracks."
        action={
          <Link to="/roads/new" className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:opacity-90">
            <Plus className="w-4 h-4" /> New road
          </Link>
        }
      />
      {isLoading ? (<div className="text-muted-foreground text-sm">Loading…</div>) : (
        <div className="grid md:grid-cols-2 gap-4">
          {data?.map((r) => {
            const curves = (r.curves as Array<{ radius: number }>) ?? [];
            const minR = curves.length ? Math.min(...curves.map((c) => c.radius)) : null;
            const slopes = ((r.elevation_profile as { slopes?: Array<{ direction: string }> } | null)?.slopes) ?? [];
            const ups = slopes.filter((s) => s.direction === "up").length;
            const downs = slopes.filter((s) => s.direction === "down").length;
            return (
              <Link to="/roads/$id" params={{ id: r.id }} key={r.id} className="panel p-5 hover:border-primary/60 transition-colors">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="text-xs uppercase tracking-widest text-muted-foreground">{r.road_type}</div>
                    <div className="font-semibold mt-1">{r.name}</div>
                  </div>
                  {r.is_public && <span className="text-[10px] uppercase tracking-widest text-primary inline-flex items-center gap-1"><Sparkles className="w-3 h-3" /> seeded</span>}
                </div>
                <div className="grid grid-cols-4 gap-2 text-xs num mt-3">
                  <Stat k="Length" v={`${(Number(r.length_m)/1000).toFixed(2)} km`} />
                  <Stat k="μ" v={String(r.surface_mu)} />
                  <Stat k="Slope" v={`${r.base_slope_deg}°`} />
                  <Stat k="Curves" v={String(curves.length)} />
                  {minR !== null && <Stat k="Min R" v={`${minR} m`} />}
                  {slopes.length > 0 && <Stat k="Slopes" v={`${ups}↑ ${downs}↓`} />}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
function Stat({ k, v }: { k: string; v: string }) {
  return (<div><div className="text-[10px] uppercase text-muted-foreground tracking-widest">{k}</div><div>{v}</div></div>);
}
