## S1 — Root Cause Analysis

Traced click flow: `PageHeader` action → `<Link to="/vehicles/new">` → TanStack matches `_authenticated/vehicles.new.tsx` **as a child** of `_authenticated/vehicles.tsx` (dot-nested routing). But `vehicles.tsx` renders the list only — it has **no `<Outlet />`**. Result: the child route matches, URL updates, but the wizard never renders (list stays on screen or view goes blank on refresh). This is the identical defect we already fixed for `roads.tsx` earlier; `vehicles.tsx` was never migrated.

Permanent fix: split into a pathless layout + `index` child, mirroring the Roads structure.

## S2 — Implementation

### Routing refactor
- Rename current `vehicles.tsx` list body → new `vehicles.index.tsx`.
- Rewrite `vehicles.tsx` as a layout: `component: () => <Outlet />`.
- Keep `vehicles.new.tsx` and `vehicles.$id.tsx` (they auto-nest).

### Database migration (extend `public.vehicles`)
Add nullable engineering columns so wizard fields persist and existing seeded rows keep working. All nullable except the wizard-required set already present in schema:

```
ALTER TABLE public.vehicles
  ADD COLUMN vehicle_type text,
  ADD COLUMN model_year int,
  ADD COLUMN engine_type text,
  ADD COLUMN displacement_cc numeric,
  ADD COLUMN max_rpm int,
  ADD COLUMN idle_rpm int,
  ADD COLUMN cylinders int,
  ADD COLUMN compression_ratio numeric,
  ADD COLUMN turbocharged boolean,
  ADD COLUMN transmission_type text,
  ADD COLUMN drive_layout text,
  ADD COLUMN num_gears int,
  ADD COLUMN final_drive_ratio numeric,
  ADD COLUMN differential_type text,
  ADD COLUMN gvw_kg numeric,
  ADD COLUMN front_track_m numeric,
  ADD COLUMN rear_track_m numeric,
  ADD COLUMN ground_clearance_m numeric,
  ADD COLUMN length_m numeric,
  ADD COLUMN width_m numeric,
  ADD COLUMN height_m numeric,
  ADD COLUMN tire_radius_m numeric,
  ADD COLUMN tire_type text,
  ADD COLUMN tire_width_mm int,
  ADD COLUMN tire_pressure_kpa numeric,
  ADD COLUMN front_brake_type text,
  ADD COLUMN rear_brake_type text,
  ADD COLUMN brake_efficiency numeric,
  ADD COLUMN has_abs boolean,
  ADD COLUMN has_esc boolean,
  ADD COLUMN has_ebd boolean,
  ADD COLUMN lift_coeff numeric,
  ADD COLUMN rear_spoiler boolean,
  ADD COLUMN zero_to_100_s numeric,
  ADD COLUMN fuel_efficiency numeric;
```

No policy changes required (existing owner-scoped RLS on `vehicles` already applies).

### New wizard components (under `src/components/vehicles/wizard/`)
- `VehicleWizard.tsx` — Stepper shell (8 steps), Next/Back, per-step validation gate, final Save.
- `steps/` — one file per step:
  1. `BasicInfoStep.tsx` — Name, Manufacturer, Category, Vehicle Type, Model Year.
  2. `EngineStep.tsx` — Fuel/Engine type, Displacement, Power, Torque, Max/Idle RPM (+ optional cylinders, compression, turbo).
  3. `TransmissionStep.tsx` — Type, Drive layout, Gears (+ optional final drive, differential).
  4. `DimensionsStep.tsx` — Kerb weight, GVW, Wheelbase, Front/Rear track, CoG height, Ground clearance (+ optional L/W/H). Derives legacy `track_m` = avg(front, rear).
  5. `TiresStep.tsx` — Radius, μ, Type (+ optional width, pressure).
  6. `BrakingStep.tsx` — Front/Rear brake type, Efficiency (+ optional ABS/ESC/EBD).
  7. `AeroStep.tsx` — Cd, Frontal area (+ optional lift, spoiler).
  8. `PerformanceStep.tsx` — Max speed, Tank capacity, Fuel efficiency (+ optional 0-100).
- `validation.ts` — Zod schema per step + cross-field engineering checks (S3).
- `types.ts` — `VehicleWizardData` type; `toInsertRow()` maps wizard data → DB row (fills legacy `track_m`, converts HP→kW if user picks HP, mm→m, etc.).

### S3 — AI/Engineering validation
`validation.ts` runs on every "Next" and before Save:
- Required fields present per step.
- Numeric ranges: displacement > 0 (or 0 for electric); RPM 500–20000; idle < max; weight 200–60000 kg; GVW ≥ kerb; wheelbase 1.0–8.0 m; tracks 0.8–3.0 m; CoG height 0.2–2.5 m; tire μ 0.1–1.6; brake efficiency 0.2–1.0; Cd 0.1–1.5; frontal area 0.5–10 m²; top speed 20–500 km/h; tank 1–1000 L.
- Cross-field: power-to-weight ratio (kW/tonne) 5–2000 warn/block; CoG height < wheelbase; front + rear tracks within ±30% of each other; GVW ≤ 4× kerb.
- On failure: inline field errors + a summary banner; Save button disabled.

### S4 — Save
Insert into `public.vehicles` with `owner_id = auth.uid()`, `is_public = false`; invalidate `["vehicles"]`; toast success; navigate `/vehicles/$id`. Existing simulation flow (`useQuery(['vehicles'])`) picks the row up automatically.

### Files touched
| Action | Path |
|---|---|
| Rewrite | `src/routes/_authenticated/vehicles.tsx` (layout only) |
| New | `src/routes/_authenticated/vehicles.index.tsx` (list) |
| Rewrite | `src/routes/_authenticated/vehicles.new.tsx` (renders `<VehicleWizard />`) |
| New | `src/components/vehicles/wizard/VehicleWizard.tsx` |
| New | `src/components/vehicles/wizard/steps/*.tsx` (8 files) |
| New | `src/components/vehicles/wizard/validation.ts` |
| New | `src/components/vehicles/wizard/types.ts` |
| New migration | `vehicles` engineering columns |
| New test | `tests/vehicle-wizard.regression.test.ts` (validation edge cases) |

### Testing
- `tsgo` typecheck, ESLint, Vitest full suite, `bun run build`.
- Manual TC-1 – TC-7 via Playwright script (open wizard, invalid save blocked, valid save appears in list + simulate dropdown, refresh persists).

### Out of scope
- No changes to physics engine, PDF report, or simulation UI (new fields are additive metadata; core physics already uses existing columns).
- No edit-wizard yet (edit still uses existing `vehicles.$id.tsx` detail form); can be a follow-up.
