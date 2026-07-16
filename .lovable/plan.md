# Phase 6 — Road Creation Wizard

## S1 — Root Cause Analysis

Trace of the "New Road" click on `/roads`:

- Button lives in `src/routes/_authenticated/roads.tsx` as a TanStack `<Link to="/roads/new">` inside `PageHeader`'s `action` slot — event binding is correct, no nested `<a>` conflict.
- Target route `src/routes/_authenticated/roads.new.tsx` exists and is registered in `src/routeTree.gen.ts` as `/_authenticated/roads/new` → fullPath `/roads/new`. So navigation itself is not broken.
- The page it opens is a single-screen form (name / type / length / μ / slope / notes + flat curves table). It is functional but does NOT match the Phase 6 spec (no category "custom", no lane/shoulder/median, no per-slope config, no curve type, no 3D preview, no validation, no thumbnail). Users experience this as "the button doesn't work / does nothing useful" because the wizard they expect never appears.

Root cause: the `/roads/new` destination is a legacy stub, not the Road Creation Wizard. Fix = replace the destination page with the real wizard (and make sure the Link continues to point at `/roads/new`). No routing, RLS, or import-graph issue is involved.

Backend gap: `public.roads` today only has `road_type, length_m, surface_mu, base_slope_deg, curves, elevation_profile, notes`. The wizard needs additional structured fields; we extend the schema additively (nullable / defaulted) so existing seeded roads and the current playback keep working.

## S2–S9 — Wizard Implementation

### Schema migration (additive, backwards-compatible)
Add to `public.roads`:
- `description text`
- `category text` (Highway | Mountain | Hairpin | Urban | Village | Race Track | Off-road | Custom) — mirrors existing `road_type` enum but allows "custom"
- `preview_thumbnail text` (data URL from canvas snapshot)
- `road_width_m numeric default 12`
- `lane_count int default 2`
- `lane_width_m numeric default 3.5`
- `shoulder_width_m numeric default 1.5`
- `median_width_m numeric default 0`
- `surface_type text default 'asphalt'` (Asphalt | Concrete | Gravel | Mud | Snow | Ice | Sand | Wet Asphalt) — drives `surface_mu` via lookup
- `slopes jsonb default '[]'` — array of `{ direction, angle_deg, length_m, transition_m, bank_deg, bank_dir }`

`curves` jsonb extended shape: `{ station, radius, length_m, angle_deg, bank_deg, type }` where `type ∈ {left,right,hairpin_left,hairpin_right,s_curve,banked}`. Existing rows (with only `station/radius/angle_deg/bank_deg`) remain valid — reader treats missing fields as defaults.

Grants + RLS unchanged (columns inherit table policies).

### New components under `src/components/roads/wizard/`
- `RoadWizard.tsx` — stepper shell, step state, Next/Back/Save, validation gate.
- `steps/StepBasics.tsx` — name, description, category, thumbnail (auto-generated from preview, user can regenerate).
- `steps/StepTrack.tsx` — length presets + custom, lane count, widths, surface type (μ auto-filled + editable).
- `steps/StepElevation.tsx` — slope list editor + `ElevationChart.tsx` (SVG profile).
- `steps/StepCurves.tsx` — curve list editor with type/radius/length/angle/bank; auto-station distribution.
- `steps/StepPreview.tsx` — embeds `<Live3DPreview />` (see below) plus 2D minimap using existing `RoadMap.tsx`.
- `steps/StepValidate.tsx` — runs `validateRoad()` and lists engineering messages.
- `Live3DPreview.tsx` — thin R3F canvas reusing existing `src/components/sim/Road.tsx`, `Environment.tsx`, and a static chase camera. Rebuilds spline via `buildRoadSpec()` on every change (debounced 150ms). Reuses existing lights / renderer settings so it inherits Phase 5 visual fidelity.

### New utilities under `src/lib/roads/`
- `spec.ts` — `RoadSpec` type + `buildRoadSpec(form)` that produces the same shape existing playback consumes (length, curves array, elevation samples). This is the single source of truth shared by preview, save, and playback.
- `surface.ts` — surface → μ table.
- `validate.ts` — checks: max slope ≤ 20°, min radius per curve type (hairpin ≥ 10 m, banked ≥ 30 m, else ≥ 20 m), transition length ≥ 0.5× slope length delta, cumulative curve angle ≤ 360° × 3, no overlapping curve stations, spline continuity (Δheading between adjacent samples < 25°), total road length matches sum of segments ±2%. Returns `{ ok, errors[], warnings[] }`.
- `thumbnail.ts` — offscreen canvas render of top-down road for `preview_thumbnail`.

### Route wiring
- Replace body of `src/routes/_authenticated/roads.new.tsx` with `<RoadWizard />`. Keep the same route ID so the existing `<Link to="/roads/new">` on the roads list keeps working (S2 requirement — no button change needed).
- On Save: insert into `roads` with all new columns, `curves` and `slopes` jsonb, `preview_thumbnail`, invalidate `["roads"]` query, `nav({ to: "/roads/$id", params: { id } })`. Road appears in list immediately (S3, S7).
- `roads.$id.tsx` gets a small extension to render the new fields (read-only) when present; falls back gracefully for legacy rows.

### Playback integration (S10)
No changes needed to `simulate.tsx` / `Sim3DScene` / physics loop — they already read `roads.length_m`, `roads.curves`, `roads.base_slope_deg`, `roads.surface_mu`. `buildRoadSpec` writes back into those existing columns as well as the new structured ones, so every saved road is immediately selectable and playable.

## Testing

- Unit: `validate.ts` (min-radius, slope cap, station overlap, continuity), `surface.ts`, `buildRoadSpec`.
- Integration (Playwright via shell): TC-1 button opens wizard; TC-2 build 10 km / 4+4 slopes / 6 curves and see preview updates; TC-3 Save then verify row visible on `/roads` immediately; TC-4 reload page still visible; TC-5 open `/simulate`, select new road, run simulation, confirm vehicle drives the spline without misalignment.
- Regression: run existing suites (`simulation`, `environment`, `vehicle`, `rendering`, `playback`) unchanged — target 100% pass.
- Static: `tsgo`, `bunx eslint`, `bun run build`.

## Files

Modified: `src/routes/_authenticated/roads.new.tsx`, `src/routes/_authenticated/roads.$id.tsx`, `src/routes/_authenticated/roads.tsx` (minor: show category badge & thumbnail if present).
New: `src/components/roads/wizard/*`, `src/lib/roads/{spec,surface,validate,thumbnail}.ts`, `tests/roads.wizard.test.ts`.
Migration: additive columns on `public.roads`.

## Out of scope / limitations

- Custom uploaded preview images (thumbnail is auto-generated from canvas; no file upload UI).
- Real terrain-height baking beyond what current playback derives from `base_slope_deg` + elevation samples.
- Editing existing roads through the wizard (this phase adds create only; `/roads/$id` remains view-only). Editing can follow in a later phase.
