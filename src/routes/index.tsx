import { createFileRoute, Link } from "@tanstack/react-router";
import { Gauge, Cpu, LineChart, FileText, Shield, Car } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen grid-bg">
      <header className="max-w-6xl mx-auto flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-accent grid place-items-center shadow-lg shadow-primary/20">
            <Gauge className="w-5 h-5 text-primary-foreground" />
          </div>
          <div className="leading-none">
            <div className="font-semibold tracking-tight">VirtuDrive</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">AI Test Lab</div>
          </div>
        </div>
        <Link
          to="/auth"
          className="rounded-md bg-primary text-primary-foreground text-sm font-semibold px-4 py-2 hover:opacity-90"
        >
          Sign in
        </Link>
      </header>

      <section className="max-w-6xl mx-auto px-6 pt-16 pb-24 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-card/50 px-3 py-1 text-xs text-muted-foreground mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-success" />
          AI-powered virtual vehicle dynamics
        </div>
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight bg-gradient-to-b from-foreground to-muted-foreground bg-clip-text text-transparent">
          Test any vehicle on any road<br />without leaving the lab.
        </h1>
        <p className="mt-6 max-w-2xl mx-auto text-muted-foreground text-lg">
          Configure a road, pick a vehicle, and VirtuDrive runs a real physics
          simulation — cornering limits, rollover, fuel, braking — then explains
          the results with an AI engineering report.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link
            to="/auth"
            className="rounded-md bg-primary text-primary-foreground font-semibold px-6 py-3 hover:opacity-90"
          >
            Start simulating
          </Link>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-24 grid md:grid-cols-3 gap-4">
        {[
          { icon: Cpu, title: "Real physics engine", body: "Cornering, rollover, aero drag, rolling resistance, grade, fuel — real equations, not toy numbers." },
          { icon: Shield, title: "Safety-first analytics", body: "Skid & rollover probability, safety score, and curve-by-curve limiting events." },
          { icon: Car, title: "15 seeded vehicles", body: "Real production specs from Toyota, Tesla, Porsche, Volvo trucks, motorcycles and more." },
          { icon: LineChart, title: "3D playback & charts", body: "Watch the vehicle drive the road in 3D. Speed, g-forces, and fuel plotted per station." },
          { icon: FileText, title: "PDF engineering report", body: "Professional multi-page report with equations, tables, and AI recommendations." },
          { icon: Gauge, title: "AI recommendations", body: "GPT-powered analysis explains WHY the vehicle behaves this way and how to improve." },
        ].map(({ icon: Icon, title, body }) => (
          <div key={title} className="panel p-5">
            <Icon className="w-5 h-5 text-primary mb-3" />
            <div className="font-semibold">{title}</div>
            <p className="text-sm text-muted-foreground mt-1">{body}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-border/60 py-6 text-center text-xs text-muted-foreground">
        Built for engineers, researchers, and automotive testing labs.
      </footer>
    </div>
  );
}
