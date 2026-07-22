/**
 * VirtuDrive AI — road-following simulation.
 *
 * Given a road (signed curves + per-segment elevation + banking + friction)
 * and a vehicle, produce a station-by-station sample trace with speed profile
 * that respects cornering, rollover, drive, and brake limits.
 *
 * Every Road Editor parameter feeds this function:
 *   curve.type           → sign of curvature (left/right/hairpin/s-curve/banked)
 *   curve.radius         → 1/radius magnitude of κ(s)
 *   curve.length_m       → authoritative arc length (fallback to radius·angle)
 *   curve.angle_deg      → arc length when length_m absent + validation
 *   curve.bank_deg       → banking during the curve
 *   slope.direction      → +uphill / -downhill sign
 *   slope.angle_deg      → grade magnitude
 *   slope.length_m       → grade extent
 *   slope.transition_m   → linear fade back to base slope
 *   slope.bank_deg       → superelevation across this segment
 *   slope.bank_dir       → +left / -right / 0=flat sign
 *   base_slope_deg       → default grade outside slope segments
 */
import {
  G,
  ackermannSteeringDeg,
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

export type CurveType = "left" | "right" | "hairpin_left" | "hairpin_right" | "s_curve" | "banked";

export interface Curve {
  station: number;      // metres from start where curve begins
  radius: number;       // metres
  angle_deg: number;    // sweep angle (fallback arc when length_m absent)
  length_m?: number;    // authoritative arc length
  bank_deg?: number;
  type?: CurveType;     // defaults to "right"
}

export interface SlopeSpec {
  direction: "uphill" | "downhill";
  angle_deg: number;
  length_m: number;
  transition_m: number;
  bank_deg: number;
  bank_dir: "left" | "right" | "flat";
}

export interface RoadSpec {
  length_m: number;
  surface_mu: number;
  base_slope_deg: number;
  curves: Curve[];
  slopes?: SlopeSpec[];
}

export interface SimParams {
  driver_target_kmh?: number;
  reaction_time_s?: number;
  step_m?: number;
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
  lat_accel: number;
  long_accel: number;
  steering_deg: number;
  fuel_rate_lps: number;
  safety_score: number;
  radius_m: number | null;
  slope_rad: number;
  bank_rad: number;
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

/** Arc length of a curve — prefer explicit length_m over angle-derived. */
function curveArcLen(c: Curve): number {
  const derived = (c.radius * c.angle_deg * Math.PI) / 180;
  const l = c.length_m && c.length_m > 0 ? c.length_m : derived;
  // Clamp to what geometry can actually sweep so length can't exceed 2π·r.
  return Math.min(l, 2 * Math.PI * c.radius);
}

/** +1 = curves left (CCW), -1 = curves right (CW). Defaults to right. */
function curveDirection(t: CurveType | undefined): 1 | -1 {
  switch (t) {
    case "left":
    case "hairpin_left":
      return 1;
    case "right":
    case "hairpin_right":
    case "banked":
    default:
      return -1;
    case "s_curve":
      // handled specially: first half one way, second half other
      return 1;
  }
}

function bankDirSign(d: SlopeSpec["bank_dir"]): number {
  return d === "left" ? 1 : d === "right" ? -1 : 0;
}

/** Precompute slope segment ranges laid end-to-end from s=0. */
function buildSlopeRanges(slopes: SlopeSpec[] | undefined) {
  const ranges: Array<{
    start: number; end: number; transEnd: number;
    grade_rad: number; bank_rad: number;
  }> = [];
  if (!slopes) return ranges;
  let cursor = 0;
  for (const sl of slopes) {
    const gradeSign = sl.direction === "uphill" ? 1 : -1;
    const grade_rad = degToRad(sl.angle_deg) * gradeSign;
    const bank_rad = degToRad(sl.bank_deg) * bankDirSign(sl.bank_dir);
    const start = cursor;
    const end = cursor + sl.length_m;
    ranges.push({ start, end, transEnd: end + sl.transition_m, grade_rad, bank_rad });
    cursor = end + sl.transition_m;
  }
  return ranges;
}

/**
 * Signed curvature (rad/m), banking (rad), and slope (rad) at station s.
 * κ > 0 turns left, κ < 0 turns right. All Road Editor parameters flow here.
 */
function roadAt(
  s: number,
  curves: Curve[],
  slopeRanges: ReturnType<typeof buildSlopeRanges>,
  baseSlopeRad: number,
) {
  // curvature + curve banking
  let kappa = 0;
  let radius: number | null = null;
  let curveBank_rad = 0;
  for (const c of curves) {
    const arcLen = curveArcLen(c);
    if (s >= c.station && s <= c.station + arcLen) {
      radius = c.radius;
      let sign = curveDirection(c.type);
      if (c.type === "s_curve") {
        const rel = (s - c.station) / arcLen;
        sign = rel < 0.5 ? 1 : -1;
      }
      kappa = (1 / c.radius) * sign;
      curveBank_rad = degToRad(c.bank_deg ?? 0) * sign; // outer edge lifts with turn
      break;
    }
  }

  // slope + slope-segment bank
  let slope_rad = baseSlopeRad;
  let slopeBank_rad = 0;
  for (const r of slopeRanges) {
    if (s >= r.start && s <= r.end) {
      slope_rad = r.grade_rad;
      slopeBank_rad = r.bank_rad;
      break;
    }
    if (r.transEnd > r.end && s > r.end && s <= r.transEnd) {
      const t = (s - r.end) / (r.transEnd - r.end);
      slope_rad = r.grade_rad * (1 - t) + baseSlopeRad * t;
      slopeBank_rad = r.bank_rad * (1 - t);
      break;
    }
  }

  // Curve bank overrides slope bank when both present.
  const bank_rad = curveBank_rad !== 0 ? curveBank_rad : slopeBank_rad;
  return { kappa, radius, bank_rad, slope_rad };
}

/** Integrate x/y (planar) and z (elevation) from signed κ and per-station slope. */
function integrateGeometry(
  road: RoadSpec,
  step: number,
  slopeRanges: ReturnType<typeof buildSlopeRanges>,
  baseSlopeRad: number,
) {
  const pts: { x: number; y: number; z: number; heading: number }[] = [];
  let x = 0, y = 0, z = 0, heading = 0;
  const n = Math.ceil(road.length_m / step) + 1;
  for (let i = 0; i < n; i++) {
    const s = i * step;
    pts.push({ x, y, z, heading });
    const { kappa, slope_rad } = roadAt(s, road.curves, slopeRanges, baseSlopeRad);
    // Horizontal step scales by cos(slope) so total path length along the ramp equals `step`.
    const hStep = step * Math.cos(slope_rad);
    heading += kappa * hStep;
    x += Math.cos(heading) * hStep;
    y += Math.sin(heading) * hStep;
    z += step * Math.sin(slope_rad);
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
  const baseSlopeRad = degToRad(road.base_slope_deg);
  const slopeRanges = buildSlopeRanges(road.slopes);

  const geom = integrateGeometry(road, step, slopeRanges, baseSlopeRad);
  const n = geom.length;

  // Peak uphill slope anywhere on the road → sets un-climbable guard.
  let peakSlope = baseSlopeRad;
  for (const r of slopeRanges) if (r.grade_rad > peakSlope) peakSlope = r.grade_rad;

  const topFlat = topSpeedFlat(vehicle);
  const topOnPeak = topSpeedOnSlope(vehicle, peakSlope);
  if (peakSlope > 0 && topOnPeak <= 0.5) {
    throw new Error(
      `Peak uphill slope of ${radToDeg(peakSlope).toFixed(1)}° exceeds vehicle capability. ` +
      `Maximum climbable slope for this vehicle is ${radToDeg(maxSlopeRad(vehicle)).toFixed(1)}°. ` +
      `Reduce the road's slope or choose a vehicle with more torque / grip.`,
    );
  }

  // 1) Per-station speed cap from cornering, rollover, and per-station top speed on slope.
  const speedCap = new Array<number>(n);
  const radii = new Array<number | null>(n);
  const banks = new Array<number>(n);
  const slopes_rad = new Array<number>(n);
  const events: LimitingEvent[] = [];
  const seenCurves = new Set<number>();

  for (let i = 0; i < n; i++) {
    const s = i * step;
    const at = roadAt(s, road.curves, slopeRanges, baseSlopeRad);
    radii[i] = at.radius;
    banks[i] = at.bank_rad;
    slopes_rad[i] = at.slope_rad;

    const stationTopSpeed = at.slope_rad > 0
      ? topSpeedOnSlope(vehicle, at.slope_rad)
      : topFlat;
    const stationCap = Math.min(targetMps, topFlat, stationTopSpeed);

    if (at.radius == null) {
      speedCap[i] = stationCap;
    } else {
      const bank_deg_signed = radToDeg(at.bank_rad);
      // safeCornerSpeed expects unsigned bank in the direction of the turn — magnitude reads the same.
      const r = safeCornerSpeed(at.radius, vehicle, road.surface_mu, Math.abs(bank_deg_signed));
      speedCap[i] = Math.min(stationCap, r.limit_mps * 0.95);
      const idKey = Math.round(at.radius * 1000) + Math.round(s);
      if (!seenCurves.has(idKey)) {
        seenCurves.add(idKey);
        events.push({
          station: s,
          radius: at.radius,
          limit_kmh: r.limit_mps * 3.6,
          limiting: r.limiting,
          lat_g_at_limit: lateralG(r.limit_mps, at.radius),
          steering_deg: ackermannSteeringDeg(vehicle.wheelbase_m, at.radius),
          bank_deg: bank_deg_signed,
        });
      }
    }
  }

  // 2) Backward pass: brake capacity.
  const muBrake = Math.min(vehicle.tire_friction_mu, road.surface_mu);
  const brakeDecel = muBrake * G;
  for (let i = n - 2; i >= 0; i--) {
    const vNext2 = speedCap[i + 1] * speedCap[i + 1];
    const maxHere = Math.sqrt(vNext2 + 2 * brakeDecel * step);
    speedCap[i] = Math.min(speedCap[i], maxHere);
  }

  // 3) Forward pass: engine acceleration limit with per-station slope.
  const samples: SimSample[] = [];
  let v = 0;
  let t = 0;
  let fuelL = 0;
  let maxLatG = 0;
  let maxLongG = 0;
  const maxSlope = maxSlopeRad(vehicle);

  for (let i = 0; i < n; i++) {
    const slope_rad = slopes_rad[i];
    if (i > 0) {
      const netF = maxDriveForce(vehicle, v) - totalResistance(vehicle, v, slope_rad);
      const dv2 = v * v + 2 * (netF / vehicle.mass_kg) * step;
      const vAccel = Math.sqrt(Math.max(0, dv2));
      v = Math.min(vAccel, speedCap[i]);
    } else {
      v = Math.min(1, speedCap[0]);
    }
    v = Math.max(1.0, v);

    const g = geom[i];
    const radius = radii[i];
    const latA = radius ? (v * v) / radius : 0;
    const longA = i > 0 ? (v - samples[i - 1].speed_mps) / Math.max(0.01, step / v) : 0;
    const fuelRate = fuelRateLps(vehicle, v, slope_rad);
    const dt = step / v;
    fuelL += fuelRate * dt;
    t += dt;

    const latG = latA / G;
    const longG = longA / G;
    if (latG > maxLatG) maxLatG = latG;
    if (Math.abs(longG) > maxLongG) maxLongG = Math.abs(longG);
    const latLimit = Math.min(vehicle.tire_friction_mu, road.surface_mu);
    const score = safetyScore(latG, latLimit, slope_rad, maxSlope);

    // Signed steering: sign matches curve direction (κ sign at this station).
    const steerMag = radius ? ackermannSteeringDeg(vehicle.wheelbase_m, radius) : 0;
    const steer = steerMag * Math.sign(radius ? (g.heading - (samples[i - 1]?.heading_rad ?? g.heading)) || 1 : 0);

    samples.push({
      idx: i,
      s_m: i * step,
      t_s: t,
      x: g.x,
      y: g.y,
      z: g.z,
      heading_rad: g.heading,
      speed_mps: v,
      lat_accel: latA,
      long_accel: longA,
      steering_deg: Math.abs(steer),
      fuel_rate_lps: fuelRate,
      safety_score: score,
      radius_m: radius,
      slope_rad,
      bank_rad: banks[i],
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
      max_slope_deg: radToDeg(peakSlope),
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
