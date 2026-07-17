import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Trash2, PlayCircle } from "lucide-react";
import { RoadMap } from "@/components/RoadMap";

export const Route = createFileRoute("/_authenticated/roads/$id")({
  component: RoadDetail,
});

function RoadDetail() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: r, isLoading } = useQuery({
    queryKey: ["road", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("roads").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const del = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from("roads").delete().eq("id", id).select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Delete blocked (permission denied)");
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["roads"] }); toast.success("Deleted"); nav({ to: "/roads" }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (isLoading || !r) return <div className="p-4 sm:p-8 text-muted-foreground">Loading…</div>;
  const curves = (r.curves as Array<{ station: number; radius: number; angle_deg: number; bank_deg?: number }>) ?? [];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <PageHeader
        title={r.name}
        subtitle={`${r.road_type} • ${(Number(r.length_m) / 1000).toFixed(2)} km • μ ${r.surface_mu}`}
        action={
          <>
            <Link to="/simulate" search={{ roadId: id }}><Button><PlayCircle className="w-4 h-4 mr-2" /> Simulate</Button></Link>
            {!r.is_public && <Button variant="destructive" onClick={() => del.mutate()} aria-label="Delete road"><Trash2 className="w-4 h-4" /></Button>}
          </>
        }
      />

      <div className="grid md:grid-cols-3 gap-4 md:gap-6">
        <div className="panel p-3 sm:p-4 md:col-span-2">
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Layout</div>
          <RoadMap length_m={Number(r.length_m)} curves={curves} />
        </div>
        <div className="panel p-4 sm:p-6">
          <h3 className="text-sm uppercase tracking-widest text-muted-foreground mb-4">Curves ({curves.length})</h3>
          <div className="space-y-2 text-sm num">
            {curves.map((c, i) => (
              <div key={i} className="grid grid-cols-4 gap-2 py-2 border-b border-border/40 last:border-0">
                <span className="text-muted-foreground">#{i + 1} @ {c.station}m</span>
                <span>R {c.radius}m</span>
                <span>{c.angle_deg}°</span>
                <span className="text-right">Bank {c.bank_deg ?? 0}°</span>
              </div>
            ))}
            {curves.length === 0 && <div className="text-muted-foreground text-sm">Straight road</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
