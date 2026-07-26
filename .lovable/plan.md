
# Road / Terrain / Playback Engineering Audit — Fix Plan

Scope agreed: implement core root-cause fixes, then verify with 3 auto-captured roads (steep uphill, banked highway, mountain/hairpin). Skip the full 11-road matrix.

## Confirmed root causes (traced in code)

### R1 — Bank is nearest-neighbour along the ribbon
`src/components/sim/Road.tsx:68` picks `bank_rad` from the closest raw sample via `Math.floor((i / (pts.length - 1)) * (samples.length - 1))`. The ribbon has ~4× the vertex density of the source samples, so bank changes step-wise between stations and adjacent cross-sections rotate by discrete jumps. This shows as a faceted, twisted asphalt strip on banked curves and as tiny seams between segments.

### R2 — Road elevation ≠ terrain corridor elevation
- Road ribbon uses `CatmullRomCurve3.getPoints(subCount)` — cubic-interpolated X/Y/Z.
- Terrain corridor in `terrain-height.ts:roadInfo` interpolates elevation **linearly** between raw sample points on the nearest segment.
On curved vertical profiles (crest/sag), the two disagree by up to a few cm — visible as flicker/z-fight along road edges and terrain intruding into asphalt on crests.

### R3 — Corridor width ignores road bank lift
`heightAt` sets terrain = `roadElev - 0.05` inside `CORRIDOR = 10 m` regardless of bank. The banked asphalt edge lifts by `halfW·sin(bank)` (up to ~1 m at 15°). Result on banked sections: terrain floor stays flat while road edge lifts → asphalt floats on the high side and terrain pokes through the shoulder on the low side. Same root cause behind "missing embankment / vertical wall at road edge".

### R4 — Terrain vertex grid too coarse near the road
`Environment.tsx:TerrainSurface` uses `spacing = 4.5 m` clamped to 140–320 segs on the whole map. Nearest terrain vertex can sit >2 m from the shoulder outer edge, so the sampler's step at `d = CORRIDOR` is rasterised at low resolution → visible sawtooth along the road/terrain seam, especially on elevated sections.

### R5 — No vertical fill / embankment under elevated road
`hillHeight` fBm is centred on y = 0 (±~11 m). For a road that climbs to +50 m, the sampler blends road-elev → hill-elev over `EMBANK = 50 m`, producing a ~45–60° cliff around the whole road. There is no mountain body under the road, so elevated roads look like a ribbon suspended over a pit with vertical walls at the corridor edge.

### R6 — Side-wall extrusion ignores bank
`Road.tsx:93–95` extrudes `wallL/wallR` straight down world-Y from the (banked) asphalt edge. On banked sections the wall is offset from the shoulder cross-section, leaving a triangular gap between asphalt underside and paved shoulder — reads as a broken road slab.

### R7 — Vehicle wheel grounding on grade
`Vehicle.tsx` positions the body at `chassisRestY + zAvg` and then rotates by `roadPitch` on local X. Because the pitch pivot is the body origin (not the contact point), on steep grades the wheel contact drifts by `wheelBaseHalf·(1-cos θ)` — noticeable clipping/floating past ~20°. Same issue for bank on the lateral axis.

## Fixes

### F1 — Continuous cross-section attributes on the ribbon (fixes R1)
In `Road.tsx`, replace nearest-neighbour lookup with linear interpolation of `bank_rad`, `heading_rad` and any per-station attribute the ribbon consumes. Compute a float source index `f = i / (pts.length - 1) * (samples.length - 1)`; blend `samples[⌊f⌋]` and `samples[⌈f⌉]` by `f - ⌊f⌋`. Do the same for the shoulder, wall and painted-line strips so all layers share one banked frame.

### F2 — Single elevation source (fixes R2)
Add a Catmull-Rom road curve inside `terrain-height.ts` (or export the built curve from `Road.tsx` via a shared module) and have `roadInfo` return `curve`-interpolated elevation instead of segment-linear. Road mesh and terrain corridor now agree to machine precision.

### F3 — Bank-aware corridor + shoulder-matched width (fixes R3, R6)
- Extend `roadInfo` to also return the local `bank_rad` and outward normal at the nearest station.
- `heightAt` inside `CORRIDOR` returns `roadElev + signed_lateral·sin(bank) - 0.05` (signed_lateral = signed distance from centreline along the road normal, clamped to shoulder half-width). Beyond the shoulder edge, blend continues to hill height.
- Increase `CORRIDOR` to `shoulderHalfWidth + small margin` (≈6 m for width=8) so the flat corridor exactly covers the paved surface.
- Rebuild side walls perpendicular to the banked surface (rotate the down-vector by `bank_rad` around the road tangent) so the slab underside meets the shoulder without a gap.

### F4 — Corridor-refined terrain mesh (fixes R4)
Replace the uniform `PlaneGeometry` with a two-tier mesh:
- Coarse outer plane (current spacing) covering `bounds`.
- Fine inner strip built from the road curve: extrude terrain vertices ±`REACH` from the centreline at ~2 m longitudinal / ~1.5 m lateral spacing, welded to the coarse grid at REACH via a shared edge ring.
This gives crisp road/terrain contact without exploding the whole map's vertex budget.

### F5 — Embankment mountain body under elevated roads (fixes R5)
In `hillHeight`, bias the fBm baseline toward the road's smoothed elevation trend using the sampler's spline: `baseline(x,z) = mix(0, roadElevAtNearest, exp(-d/EMBANK_FALLOFF))` with `EMBANK_FALLOFF ≈ 120 m`. Result: terrain rises to meet elevated roads, producing natural fill slopes / mountain shoulders instead of a plunging cliff, and remains flat far from the corridor.

Keep the current `smoothstep01` blend for the near-corridor transition; F5 only changes the *far* baseline so it doesn't fight F3.

### F6 — Contact-point grounding for vehicle (fixes R7)
In `Vehicle.tsx`, compute body position so the wheelbase midpoint's contact matches the road surface: `body.y = zAvg + chassisRestY·cos(roadPitch)·cos(roadBank)`, and add a lateral offset `chassisRestY·sin(roadBank)` on local X after the yaw. This keeps all four wheels on the banked/graded surface at any inclination without the current small-angle approximation. Update the regression harness values in `tests/vehicle.regression.test.ts` if the new expected Y changes.

## Verification

1. Run `bunx vitest run` — expect all 116 existing tests green; adjust vehicle-grounding expected values only if F6 shifts them.
2. Launch Playwright headless against `http://localhost:8080` with the authenticated session:
   - Create 3 roads via existing wizard fixtures: **steep uphill 8%**, **banked highway (12° max bank)**, **mountain hairpin with rolling elevation**.
   - Run each simulation; capture screenshots at 0/25/50/75/100 % from Chase, Drone and Orbit cameras (15 shots per road, 45 total).
   - Save under `/tmp/browser/road-audit/<road>/<cam>_<pct>.png` and view each with `code--view` to confirm: no floating road, no terrain intrusion, wheels on surface, no seam at road/terrain, embankment present on elevated sections, chassis rolls with bank.
3. If any defect remains, iterate on the specific fix (F1–F6) rather than a blanket rework.

## Files to modify

- `src/components/sim/Road.tsx` — F1, F3 (walls), F6-adjacent normal export.
- `src/components/sim/terrain-height.ts` — F2, F3 (bank-aware corridor), F5 (baseline bias).
- `src/components/sim/Environment.tsx` — F4 (corridor-refined terrain mesh).
- `src/components/sim/Vehicle.tsx` — F6 (contact-point grounding).
- `tests/vehicle.regression.test.ts` — expected pose only if F6 shifts values.
- New: `src/components/sim/road-curve.ts` — shared Catmull-Rom curve + station lookup consumed by both `Road.tsx` and `terrain-height.ts`.

## Deliverables at end of build

1. Root Cause Analysis Report (R1–R7 with file:line refs, above).
2. Road / Terrain / Elevation / Banking / Vehicle-Alignment / Camera reports — one paragraph each, evidence from the 45 screenshots.
3. Before/after screenshot pairs for the 3 roads.
4. Modified files list (matches "Files to modify").
5. E2E Simulation Verification Report — pass/fail per road, per camera, per timestamp.

Marked COMPLETE only when all 45 screenshots show zero visual defects in the audited categories.
