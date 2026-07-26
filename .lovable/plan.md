
# 3D Playback Redesign — Closing Pass

Most of S1–S8 landed in the previous turn (shared road curve, banked corridor, view-protection ring, camera terrain-clearance guard, expanded horizon). Validation across chase/drone/side/top/front passed. This plan closes the three remaining gaps and re-runs the full validation matrix.

## Gaps still open

1. **S7 — Terrain quality.** `TerrainSurface` uses a single uniform `PlaneGeometry` (~4.5 m spacing, capped 320 segments). Far from the road that's overkill; near the corridor + banked shoulders it can still under-resolve, producing subtle triangle facets on tight embankments.
2. **S5 — Vehicle orientation audit.** Current `Vehicle.tsx` derives road pitch from `sampleZAtDistance` at ±wheelBase/2 and rolls with `s.bank_rad`. This works, but heading is taken straight from `s.heading_rad` rather than the shared `road-curve.ts` tangent used by terrain. On tight Catmull-Rom subdivisions the two can disagree by a fraction of a degree, which reads as micro-yaw wobble on hairpins.
3. **S6 — Camera look-ahead.** Chase distance is user-controlled but there is no explicit "100–150 m of upcoming road visible" guarantee, and drone/side don't bias toward the vehicle's forward direction.
4. **S8 — Re-validation.** After the changes above, re-run the visual matrix (chase, drone, side, top, banked curve, steep slope) on three representative road types.

## Changes

### F1 — Adaptive terrain mesh (S7)

`src/components/sim/Environment.tsx :: TerrainSurface`

- Replace uniform `PlaneGeometry` with a two-ring approach:
  - **Near ring** — a corridor strip generated from `sampler.curve.stations`, ~24 m half-width per side, 1.5 m longitudinal × 1.0 m lateral spacing. Vertices snap exactly to `sampler.heightAt` (which already returns the banked road plane inside the corridor), giving crack-free contact with the road ribbon.
  - **Far field** — the existing plane, but with a hole (or alpha-masked overlap) where the near ring covers, and coarser spacing (8 m) so far triangles stay cheap.
- Both rings share the same sampler, so seams are numerically identical.

### F2 — Road-frame vehicle transform (S5)

`src/components/sim/Vehicle.tsx`

- Add a helper on the store or in `road-curve.ts` that returns `{ pos, tangent, normal, bank, grade }` for the current arc length `s.s_m`.
- Use the curve tangent for yaw (fallback to `s.heading_rad` when the curve isn't ready) and the curve grade for pitch. Keeps vehicle and terrain in one reference frame; eliminates hairpin micro-wobble.

### F3 — Camera look-ahead (S6)

`src/components/sim/Cameras.tsx`

- For `chase`, bias `targetLook` further down the tangent (≈ clamp(1.5·speed, 40, 120) m ahead) instead of a fixed 4 m offset.
- For `drone` and `side`, offset the camera slightly toward the vehicle's rear-quarter so the upcoming road stays visible, not just the vehicle.
- Keep the existing terrain clearance guard; add a second guard that raises the camera if the ray from camera to `targetLook + 80 m` intersects terrain (prevents crest occlusion on steep hills).

### F4 — Validation sweep (S8)

- Playwright script under `/tmp/browser/road-sim-v2/`.
- Three representative simulations: flat/curvy, banked oval, mountain hairpin.
- Six cameras each: chase, drone, side, top, front, driver.
- Assert programmatically where possible (canvas non-empty, no WebGL context loss in console); rely on screenshot review for occlusion/floating/clipping.
- Iterate: any failure → identify root cause in the affected module → fix → re-run only the failing shots.

## Out of scope

- Guard-rail geometry rework (already follows road via shared curve).
- New terrain textures / vegetation redistribution.
- Physics changes.

## Technical notes

```text
Terrain rings
─────────────
   ┌─────── far plane (8 m spacing) ─────────┐
   │                                          │
   │        ┌──── near strip ────┐            │
   │        │   corridor ± ~24 m │            │
   │        │  1.5×1.0 m spacing │            │
   │        └────────────────────┘            │
   │                                          │
   └──────────────────────────────────────────┘
```

Near strip vertices are keyed off `sampler.curve.stations[i]` ± `k·normal`, so lateral rows track the road exactly and the banked-plane region in `terrain-height.ts` matches to machine precision.

## Success criteria (unchanged)

Road dominant in every shot · terrain never overlaps road · shoulders/rails continuous · vehicle centered and rolling with bank · camera shows vehicle + upcoming road · no clipping/floating/seams across all six cameras on all three test roads.
