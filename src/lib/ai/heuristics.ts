/**
 * Deterministic AI-style predictions derived from physics.
 * These are the ground truth the LLM narrates over.
 */
import type { SimResults } from "@/lib/physics/simulation";
import type { VehicleSpec } from "@/lib/physics";

export interface AIPrediction {
  safety_score: number;
  risk_level: "low" | "moderate" | "high" | "critical";
  skid_probability: number; // 0..1
  rollover_probability: number; // 0..1
  recommended_cruise_kmh: number;
  fuel_optimal_kmh: number;
  key_risks: string[];
  recommendations: string[];
}

export function predictFromResults(v: VehicleSpec, r: SimResults): AIPrediction {
  const s = r.summary;
  const latUsage = s.max_lat_g / Math.max(0.5, v.tire_friction_mu);
  const skidP = clamp(latUsage - 0.6, 0, 1);
  const ssf = v.track_m / (2 * v.cog_height_m);
  const rollP = clamp(s.max_lat_g / Math.max(0.6, ssf) - 0.5, 0, 1);
  const risk =
    s.min_safety_score < 25 ? "critical" :
    s.min_safety_score < 50 ? "high" :
    s.min_safety_score < 75 ? "moderate" : "low";

  const risks: string[] = [];
  if (skidP > 0.4) risks.push(`High skid probability (${(skidP * 100).toFixed(0)}%) — lateral demand approaches tire grip limit.`);
  if (rollP > 0.4) risks.push(`Rollover exposure (${(rollP * 100).toFixed(0)}%) — SSF ${ssf.toFixed(2)} vs peak lat ${s.max_lat_g.toFixed(2)}g.`);
  if (s.min_safety_score < 40) risks.push(`Safety margin critical at ${s.min_safety_score.toFixed(0)}/100 in tightest curve.`);
  if (s.max_slope_deg > 8) risks.push(`Sustained grade of ${s.max_slope_deg.toFixed(1)}° impacts braking and fuel.`);

  const recs: string[] = [];
  const cruiseKmh = Math.min(s.top_speed_kmh, s.avg_speed_kmh + 15);
  recs.push(`Recommended cruise speed: ${cruiseKmh.toFixed(0)} km/h for balanced pace and grip.`);
  recs.push(`Reduce entry speed to ${(s.top_speed_kmh * 0.7).toFixed(0)} km/h before curves under ${(s.avg_speed_kmh).toFixed(0)} km/h average zones.`);
  const fuelOptimal = Math.max(60, Math.min(90, cruiseKmh - 15));
  recs.push(`Fuel-optimal steady cruise ≈ ${fuelOptimal.toFixed(0)} km/h based on drag & rolling losses.`);
  if (rollP > 0.3) recs.push("Consider stiffer anti-roll bars or lowered CoG to increase SSF.");
  if (skidP > 0.3) recs.push("Higher grip tires (μ ≥ 1.0) or wider contact patch would raise the skid ceiling.");

  return {
    safety_score: Math.round(s.avg_safety_score),
    risk_level: risk,
    skid_probability: skidP,
    rollover_probability: rollP,
    recommended_cruise_kmh: cruiseKmh,
    fuel_optimal_kmh: fuelOptimal,
    key_risks: risks,
    recommendations: recs,
  };
}

function clamp(x: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, x)); }
