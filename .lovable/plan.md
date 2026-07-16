
# Phase 5 — Proving-Ground Environment

Scope constraint recap: **visual environment only**. Vehicle physics, camera logic, simulation math, telemetry, minimap, backend, dashboard, and existing tests stay untouched. All new geometry is procedurally anchored to the current road spline via the existing `TerrainSampler` — no new roads are generated (that would require touching simulation logic), and no `PathSample` data is mutated.

## Root-Cause Analysis (current world gen)

Findings from `Environment.tsx` + `terrain-height.ts`:

1. **Facility is absent.** `Buildings` places 6 primitive boxes (`garage / tower / shed`) at random offsets. No garage complex, workshop, tower, plaza, gate, fuel/EV stations, inspection bay, service road, or parking.
2. **Roadside kit is thin.** Only guardrails, delineator posts, and light poles. Missing utility poles, power lines, signs, chevron boards, km markers, culverts, drainage, fencing, concrete Jersey barriers.
3. **Landscape is uniform.** Trees + bushes packed on both sides identically; no forest patches, rocky zones, ponds, dry riverbeds — the "avoid repetitive layouts" issue.
4. **No infrastructure.** Elevation changes exist in samples but nothing spans them: no bridges over gullies, no tunnels through hills.
5. **LOD gap for large objects.** Buildings/poles use plain `<instancedMesh>` — they render at any distance. Fine now but doesn't scale with more props.
6. **Scale drift risk.** Existing garage is 14×4.4×8 m (fine); new facility must match real-world dims to avoid the current "toy" reading.

## Approach

Reuse the shared `TerrainSampler` for every new prop so nothing floats or clips. Every asset placed off-road snaps `y = sampler.heightAt(worldX, worldZ)`. Bridges/tunnels detect their span from the spline (elevation dip / hill intersection) — no override of road geometry, purely decorative structure that the car passes through.

## Module Plan

### M1 — Engineering facility (`src/components/sim/facility/*`)
Single facility cluster placed at the sample nearest the road start, offset ~120 m to one side, oriented along local heading. New files:

- `FacilityComplex.tsx` — top-level layout: entry plaza → security gate → service road spur → parking → main garage + workshop → control tower + observation deck → research lab → fuel + EV bays → inspection bay.
- `buildings.tsx` — parameterized prefabs (Garage, Workshop, Lab, Tower, Shed, InspectionBay, FuelCanopy, EVCanopy, GateHouse, Barrier) built from box/cylinder primitives + PBR materials from `textures.ts`. Real-world dims (garage 30×12×8 m, tower 6×6×18 m, canopies 12×8×5 m, etc.).
- `facilityPlacement.ts` — computes a rectangular plot, terrain-flattened via sampler query + local averaging so the plot sits level.

Replaces the current sparse `Buildings` component (the 3 primitive boxes) with the single anchored complex; keeps the same call site in `SimEnvironment`.

### M2 — Road network expansion (visual only)
The simulator drives a single spline; generating branch roads would change simulation. Instead:
- `ServiceRoad.tsx` — a thin cosmetic asphalt ribbon from the facility gate joining the main road tangentially (no samples added, decorative only, not drivable).
- Existing curves already cover straights/hairpins/S/large/tight/incline/decline through user-created road data — surface those as **visual cues** (banking chevrons, incline gradient signs, "Test Zone" placards) inserted at spline points classified by curvature/pitch.
- Skip roundabout / merge / exit / emergency-braking layout changes (would require simulation edits).

### M3 — Bridges & tunnels (spline-classified, decorative)
`Infrastructure.tsx` scans the sample list once:
- **Bridge spans**: contiguous samples where local terrain (sampler hill-only) drops ≥ 4 m below road elevation → render deck sides, piers down to terrain, guardrails, expansion joints.
- **Tunnels**: contiguous samples where hill-only terrain rises ≥ 3 m above road elevation → render tunnel portal + inner tube (open-ended box with concave interior) with emissive strip-lights, portal signage. Vehicle passes through since geometry has no collision.
- Steel/concrete variants chosen deterministically per span length.

### M4 — Roadside kit (`RoadsideKit.tsx`)
Additions to what already exists:
- Utility poles + catenary power-line strips (LineSegments) every ~60 m alternating sides.
- Sign boards: speed limit, warning, distance markers, chevron boards on curves (curvature-driven).
- Concrete Jersey barriers at high-speed straights.
- Culvert boxes + drainage channel strip on shoulder low points.
- Perimeter chain-link fencing at facility side.
All are instanced meshes with existing `LodInstancedMesh` (nearDist 90 / farDist 260).

### M5 — Landscape enrichment (`Landscape.tsx`)
- Split existing vegetation into **forest patches** (Poisson-disc clusters) instead of uniform bands.
- Rocky zones (instanced icosahedra with rock albedo).
- Bush clusters, small pond (flat blue disc + rim rocks) at terrain minima away from road, dry riverbed strip through a valley.
- Distant mountain silhouettes already exist — keep, but darken near band for depth cue.
- All placement uses blue-noise/hash to avoid repetition.

### M6 — Streaming & LOD
- Migrate `Buildings`, `LightPoles`, `RoadsideBarriers`, `DelineatorPosts`, and new roadside kit to `LodInstancedMesh` with tuned near/far.
- Chunk-based visibility: partition prop lists into ~200 m tiles keyed by camera XZ; skip tile-instance updates entirely when tile centre > 500 m from camera (leverages existing 7 Hz throttled LOD).
- Texture streaming: existing `textures.ts` already caches; add explicit `.dispose()` on unmount of `SimEnvironment` to prevent leaks over long playback sessions.

### M7 — Visual consistency pass
- Sampler-driven placement guarantees no floating props / no terrain clipping.
- Bridge deck top = sample elevation exactly; piers extend to `hillOnly()` height.
- Tunnel floor = sample elevation; ceiling = elevation + 5.2 m.
- Lighting unchanged (already Phase 4 tuned).

## Files

New:
- `src/components/sim/facility/FacilityComplex.tsx`
- `src/components/sim/facility/buildings.tsx`
- `src/components/sim/facility/facilityPlacement.ts`
- `src/components/sim/Infrastructure.tsx` (bridges + tunnels)
- `src/components/sim/RoadsideKit.tsx`
- `src/components/sim/Landscape.tsx`
- `src/components/sim/ServiceRoad.tsx`
- `tests/environment.regression.test.ts`

Modified (visual only):
- `src/components/sim/Environment.tsx` — swap `Buildings` for `FacilityComplex`; mount new visual components; keep existing signature.
- `src/components/sim/textures.ts` — add concrete, brick, metal-cladding, tunnel-tile, rock textures (cached).

Untouched: `store.ts`, `Vehicle.tsx`, `Cameras.tsx`, `SceneAdvancer.tsx`, `Road.tsx`, physics, simulation, backend, telemetry, minimap, all route files, existing tests.

## Test Plan

Existing 97 tests must still pass. Add `tests/environment.regression.test.ts`:
- Facility placement: every prop `y === sampler.heightAt(x, z)` within ±0.05 m.
- Bridge spans: for every classified bridge sample, deck y matches sample z.
- Tunnel spans: portal count > 0 when synthetic hill fixture provided; zero when flat road.
- LOD sanity: instance counts finite; no NaN transforms.
- Deterministic placement across two builds with same samples.

Additionally run: `tsgo`, ESLint, `vitest run`, and a Playwright smoke that opens the simulation, toggles Debug, and captures a screenshot to confirm the facility renders.

## Deliverables

Final report will cover: RCA (above), env improvements, assets added, files modified, FPS + memory before/after (Playwright PerfProbe read), test matrix, remaining limitations, and a Production Readiness Score.

## Out of Scope (called out explicitly)

- New drivable roads / roundabouts / merge / exit / emergency-braking pads — would require simulation edits, forbidden by constraints.
- Real physics collision on bridges/tunnels — decorative only; car continues on its spline.
- GLTF asset imports — kept fully procedural to preserve bundle size and offline determinism.
