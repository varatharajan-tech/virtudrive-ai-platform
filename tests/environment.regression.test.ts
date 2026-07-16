import { describe, it, expect } from "vitest";
import { simulate } from "@/lib/physics/simulation";
import { createTerrainSampler } from "@/components/sim/terrain-height";
import { roadStraight, roadCurved, roadMixed, TEST_VEHICLE } from "./fixtures";
import type { PathSample } from "@/components/sim/store";

function toSamples(sim: ReturnType<typeof simulate>): PathSample[] {
  return sim.path.map((p) => ({
    x: p.x,
    y: p.y,
    z: p.z,
    heading: p.heading,
    speed: p.speed,
    lat_g: p.lat_g,
    long_g: p.long_g,
    fuel_l: p.fuel_l,
    stability: p.stability,
    station: p.station,
    time: p.time,
  }));
}

describe("environment / terrain sampler alignment", () => {
  const road = roadMixed(1200);
  const sim = simulate({ vehicle: TEST_VEHICLE, road });
  const samples = toSamples(sim);
  const sampler = createTerrainSampler(samples);

  it("returns finite heights everywhere inside bounds", () => {
    const { bounds } = sampler;
    for (let i = 0; i < 20; i++) {
      const t = i / 19;
      const x = bounds.minX + t * (bounds.maxX - bounds.minX);
      const z = bounds.minZ + t * (bounds.maxZ - bounds.minZ);
      const h = sampler.heightAt(x, z);
      expect(Number.isFinite(h)).toBe(true);
    }
  });

  it("returns road-follow height near the spline", () => {
    for (let i = 0; i < samples.length; i += 20) {
      const s = samples[i];
      const h = sampler.heightAt(s.x, -s.y);
      // On-road height should sit within 0.5m of road elev (offset -0.05 baked in)
      expect(Math.abs(h - s.z)).toBeLessThan(0.5);
    }
  });

  it("classifies bridges/tunnels deterministically across runs", () => {
    const sampler2 = createTerrainSampler(samples);
    for (let i = 0; i < samples.length; i += 30) {
      const s = samples[i];
      expect(sampler.heightAt(s.x, -s.y)).toBeCloseTo(sampler2.heightAt(s.x, -s.y), 4);
      expect(sampler.hillOnly(s.x, -s.y)).toBeCloseTo(sampler2.hillOnly(s.x, -s.y), 4);
    }
  });
});

describe("environment / prop placement invariants", () => {
  it("computes facility anchor with valid ground on any road", () => {
    for (const roadFn of [roadStraight, roadCurved, roadMixed]) {
      const sim = simulate({ vehicle: TEST_VEHICLE, road: roadFn(800) });
      const samples = toSamples(sim);
      const sampler = createTerrainSampler(samples);
      const s0 = samples[0];
      const s1 = samples[Math.min(samples.length - 1, 4)];
      const heading = Math.atan2(s1.y - s0.y, s1.x - s0.x);
      const nx = -Math.sin(heading);
      const ny = Math.cos(heading);
      const off = 130;
      const worldX = s0.x + nx * off;
      const worldZ = -(s0.y + ny * off);
      const groundY = sampler.heightAt(worldX, worldZ);
      expect(Number.isFinite(groundY)).toBe(true);
      // Facility should not be inside the road corridor
      expect(sampler.roadDistance(worldX, worldZ)).toBeGreaterThan(50);
    }
  });
});
