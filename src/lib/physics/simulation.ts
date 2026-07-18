/**
 * VirtuDrive AI — road-following simulation.
 *
 * Given a road (curves + base slope + friction) and a vehicle,
 * produce a station-by-station sample trace with speed profile
 * that respects cornering, rollover, drive, and brake limits.
 */
import {
  G,
  ackermannSteeringDeg,
  brakingDistance,
  degToRad,
  fuelRateLps,
  lateralG,
  maxDriveForce,
  maxSlopeRad,
  radToDeg,
  safeCornerSpeed,
  safetyScore,
  topSpeedFlat,
  topSpeedOnSlope,
  totalResistance,
  type VehicleSpec,
} from "./index";

export interface Curve {
  station: number; // metres from start where curve begins
  radius: number; // metres
  angle_deg: number; // sweep angle
  bank_deg?: number;
}

export interface RoadSpec {
  length_m: number;
  surface_mu: number;
  base_slope_deg: number;
  curves: Curve[];
}

export interface SimParams {
  driver_target_kmh?: number; // capped by physics limits
  reaction_time_s?: number;
  step_m?: number; // integration station spacing
}

export interface SimSample {
  idx: number;
  s_m: number;
  t_s: number;
  x: number;
  y: number;
  z: number;
  heading_rad: number;
  speed_mps: number;
  lat_accel: number; // m/s^2
  long_accel: number;
  steering_deg: number;
  fuel_rate_lps: number;
  safety_score: number;
  radius_m: number | null;
}

export interface SimResults {
  samples: SimSample[];
  summary: {
    top_speed_kmh: number;
    avg_speed_kmh: number;
    min_speed_kmh: number;
    max_lat_g: number;
    max_long_g: number;
    max_slope_deg: number;
    total_time_s: number;
    total_distance_m: number;
    total_fuel_l: number;
    fuel_per_100km: number;
    min_safety_score: number;
    avg_safety_score: number;
    theoretical_top_speed_kmh: number;
    max_climbable_slope_deg: number;
    limiting_events: LimitingEvent[];
  };
}

export interface LimitingEvent {
  station: number;
  radius: number;
  limit_kmh: number;
  limiting: "skid" | "rollover";
  lat_g_at_limit: number;
  steering_deg: number;
  bank_deg: number;
}

/** Build a curvature array κ(s) from curve list. Curves are arcs of constant radius. */
function curvatureAt(s: number, curves: Curve[]): { radius: number | null; bank_deg: number } {
  for (const c of curves) {
    const arcLen = (c.radius * c.angle_deg * Math.PI) / 180;
    if (s >= c.station && s <= c.station + arcLen) {
      return { radius: c.radius, bank_deg: c.bank_deg ?? 0 };
    }
  }
  return { radius: null, bank_deg: 0 };
}

/** Compute (x,y,heading) by integrating heading from curvature. */
function integrateGeometry(road: RoadSpec, step: number) {
  const pts: { x: number; y: number; heading: number }[] = [];
  let x = 0, y = 0, heading = 0;
  const n = Math.ceil(road.length_m / step) + 1;
  for (let i = 0; i < n; i++) {
    const s = i * step;
    pts.push({ x, y, heading });
    const { radius } = curvatureAt(s, road.curves);
    const kappa = radius ? 1 / radius : 0;
    heading += kappa * step;
    x += Math.cos(heading) * step;
    y += Math.sin(heading) * step;
  }
  return pts;
}

export function runSimulation(
  vehicle: VehicleSpec,
  road: RoadSpec,
  params: SimParams = {},
): SimResults {
  const step = params.step_m ?? 5;
  const targetMps = params.driver_target_kmh ? params.driver_target_kmh / 3.6 : Infinity;
  const slopeRad = degToRad(road.base_slope_deg);
  const geom = integrateGeometry(road, step);
  const n = geom.length;

  // 1) Compute per-station speed cap from cornering + rollover
  const speedCap = new Array<number>(n);
  const radii = new Array<number | null>(n);
  const banks = new Array<number>(n);
  const events: LimitingEvent[] = [];
  const seenCurves = new Set<number>();

  const topFlat = topSpeedFlat(vehicle);
  const globalCap = Math.min(targetMps, topFlat);

  for (let i = 0; i < n; i++) {
    const s = i * step;
    const cur = curvatureAt(s, road.curves);
    radii[i] = cur.radius;
    banks[i] = cur.bank_deg;
    if (cur.radius == null) {
      speedCap[i] = globalCap;
    } else {
      const r = safeCornerSpeed(cur.radius, vehicle, road.surface_mu, cur.bank_deg);
      speedCap[i] = Math.min(globalCap, r.limit_mps * 0.95); // 5% safety margin
      // record one event per curve
      const idKey = Math.round(cur.radius * 1000);
      if (!seenCurves.has(idKey)) {
        seenCurves.add(idKey);
        events.push({
          station: s,
          radius: cur.radius,
          limit_kmh: r.limit_mps * 3.6,
          limiting: r.limiting,
          lat_g_at_limit: lateralG(r.limit_mps, cur.radius),
          steering_deg: ackermannSteeringDeg(vehicle.wheelbase_m, cur.radius),
          bank_deg: cur.bank_deg,
        });
      }
    }
  }

  // 2) Backward pass: brake capacity — v[i]^2 ≤ v[i+1]^2 + 2·a_brake·step
  const muBrake = Math.min(vehicle.tire_friction_mu, road.surface_mu);
  const brakeDecel = muBrake * G; // m/s^2
  for (let i = n - 2; i >= 0; i--) {
    const vNext2 = speedCap[i + 1] * speedCap[i + 1];
    const maxHere = Math.sqrt(vNext2 + 2 * brakeDecel * step);
    speedCap[i] = Math.min(speedCap[i], maxHere);
  }

  // 3) Forward pass: engine acceleration limit
  const samples: SimSample[] = [];
  let v = 0;
  let t = 0;
  let fuelL = 0;
  let maxLatG = 0;
  let maxLongG = 0;
  const maxSlope = maxSlopeRad(vehicle);

  for (let i = 0; i < n; i++) {
    if (i > 0) {
      const dv2 = v * v + 2 * ((maxDriveForce(vehicle, v) - totalResistance(vehicle, v, slopeRad)) / vehicle.mass_kg) * step;
      const vAccel = Math.sqrt(Math.max(0.01, dv2));
      v = Math.min(vAccel, speedCap[i]);
    } else {
      v = Math.min(1, speedCap[0]);
    }
    v = Math.max(0.5, v);

    const g = geom[i];
    const radius = radii[i];
    const latA = radius ? (v * v) / radius : 0;
    const longA = i > 0 ? (v - samples[i - 1].speed_mps) / Math.max(0.01, step / v) : 0;
    const fuelRate = fuelRateLps(vehicle, v, slopeRad);
    const dt = step / v;
    fuelL += fuelRate * dt;
    t += dt;

    const latG = latA / G;
    const longG = longA / G;
    if (latG > maxLatG) maxLatG = latG;
    if (Math.abs(longG) > maxLongG) maxLongG = Math.abs(longG);
    const latLimit = Math.min(vehicle.tire_friction_mu, road.surface_mu);
    const score = safetyScore(latG, latLimit, slopeRad, maxSlope);

    samples.push({
      idx: i,
      s_m: i * step,
      t_s: t,
      x: g.x,
      y: g.y,
      z: (i * step) * Math.tan(slopeRad),
      heading_rad: g.heading,
      speed_mps: v,
      lat_accel: latA,
      long_accel: longA,
      steering_deg: radius ? ackermannSteeringDeg(vehicle.wheelbase_m, radius) : 0,
      fuel_rate_lps: fuelRate,
      safety_score: score,
      radius_m: radius,
    });
  }

  const speeds = samples.map((s) => s.speed_mps);
  const scores = samples.map((s) => s.safety_score);
  const avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
  const totalDist = road.length_m;

  return {
    samples,
    summary: {
      top_speed_kmh: Math.max(...speeds) * 3.6,
      avg_speed_kmh: avgSpeed * 3.6,
      min_speed_kmh: Math.min(...speeds) * 3.6,
      max_lat_g: maxLatG,
      max_long_g: maxLongG,
      max_slope_deg: road.base_slope_deg,
      total_time_s: t,
      total_distance_m: totalDist,
      total_fuel_l: fuelL,
      fuel_per_100km: (fuelL / totalDist) * 100_000,
      min_safety_score: Math.min(...scores),
      avg_safety_score: scores.reduce((a, b) => a + b, 0) / scores.length,
      theoretical_top_speed_kmh: topFlat * 3.6,
      max_climbable_slope_deg: radToDeg(maxSlope),
      limiting_events: events.sort((a, b) => a.station - b.station),
    },
  };
}
