import { describe, it, expect } from "vitest";
import { buildTwoUpTwoDown, buildEvenCurves } from "@/lib/roads/builders";

describe("road builders", () => {
  it("2 Up + 2 Down preset produces exactly 2 up and 2 down slopes", () => {
    const s = buildTwoUpTwoDown(6000, 6);
    expect(s).toHaveLength(4);
    expect(s.filter((x) => x.direction === "up")).toHaveLength(2);
    expect(s.filter((x) => x.direction === "down")).toHaveLength(2);
    expect(s.every((x) => x.deg === 6)).toBe(true);
    // stations strictly increasing and inside the track
    for (let i = 1; i < s.length; i++) expect(s[i].station_m).toBeGreaterThan(s[i - 1].station_m);
    expect(s[0].station_m).toBeGreaterThan(0);
    expect(s[s.length - 1].station_m).toBeLessThan(6000);
  });

  it("buildEvenCurves distributes N curves along the track", () => {
    const c = buildEvenCurves(5000, 4);
    expect(c).toHaveLength(4);
    for (let i = 1; i < c.length; i++) expect(c[i].station).toBeGreaterThan(c[i - 1].station);
  });

  it("buildEvenCurves returns empty for 0", () => {
    expect(buildEvenCurves(5000, 0)).toEqual([]);
  });
});
