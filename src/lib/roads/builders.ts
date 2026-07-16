export interface SlopeDraft {
  direction: "up" | "down";
  deg: number;
  station_m: number;
  length_m: number;
}

export interface CurveDraft {
  station: number;
  radius: number;
  angle_deg: number;
  bank_deg: number;
}

/**
 * Build the "2 Up + 2 Down" preset — two ascending grades and two descending
 * grades evenly distributed along the track. Slopes alternate up/down/up/down
 * so ascent and descent occur simultaneously across the profile.
 */
export function buildTwoUpTwoDown(length_m: number, deg = 5): SlopeDraft[] {
  const n = 4;
  const seg = Math.max(200, Math.floor(length_m / (n + 1)));
  const dirs: Array<"up" | "down"> = ["up", "down", "up", "down"];
  return dirs.map((direction, i) => ({
    direction,
    deg,
    station_m: Math.floor((length_m * (i + 1)) / (n + 1)),
    length_m: seg,
  }));
}

/** Evenly distribute N curves across the track length with default geometry. */
export function buildEvenCurves(length_m: number, n: number): CurveDraft[] {
  if (n <= 0) return [];
  const out: CurveDraft[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      station: Math.floor((length_m * (i + 1)) / (n + 1)),
      radius: 150,
      angle_deg: 60,
      bank_deg: 0,
    });
  }
  return out;
}
