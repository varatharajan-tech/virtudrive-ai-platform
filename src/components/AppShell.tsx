import { Link, Outlet, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard, Car, Route as RouteIcon, PlayCircle, Settings as SettingsIcon,
  LogOut, Gauge,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/simulate", label: "Simulate", icon: PlayCircle },
  { to: "/vehicles", label: "Vehicles", icon: Car },
  { to: "/roads", label: "Roads", icon: RouteIcon },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

export function AppShell() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <aside className="w-60 shrink-0 border-r border-border/60 bg-card/40 backdrop-blur px-3 py-5 flex flex-col">
        <Link to="/dashboard" className="flex items-center gap-2 px-2 mb-6">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-accent grid place-items-center shadow-lg shadow-primary/20">
            <Gauge className="w-5 h-5 text-primary-foreground" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="font-semibold tracking-tight">VirtuDrive</span>
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">AI Test Lab</span>
          </div>
        </Link>
        <nav className="flex-1 flex flex-col gap-0.5">
          {NAV.map((item) => {
            const active = path === item.to || path.startsWith(item.to + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                  active
                    ? "bg-primary/15 text-primary border-l-2 border-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/10",
                )}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <button
          onClick={signOut}
          className="mt-4 flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
        >
          <LogOut className="w-4 h-4" /> Sign out
        </button>
      </aside>
      <main className="flex-1 min-w-0 overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}
