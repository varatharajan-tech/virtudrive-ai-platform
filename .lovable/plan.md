# VirtuDrive AI — Engineering Documentation Extraction

Goal: produce `VirtuDrive_Engineering_Documentation.zip` in `/mnt/documents/` containing exhaustive, verified documentation of every equation, constant, metric, chart, and calculation used by the app. **No application source code will be modified.**

## Approach

1. **Exhaustive read-only scan** of every file that owns physics, dynamics, telemetry, rendering math, or reporting:
   - `src/lib/physics/index.ts`, `src/lib/physics/simulation.ts`
   - `src/lib/ai/heuristics.ts`, `src/lib/ai/explain.functions.ts`
   - `src/lib/roads/surface.ts`, `src/lib/roads/validate.ts`
   - `src/components/sim/store.ts`, `SceneAdvancer.tsx`, `Vehicle.tsx`, `Cameras.tsx`, `LiveMinimap.tsx`, `LiveTelemetry.tsx`, `TelemetryOverlay.tsx`, `PlaybackControls.tsx`
   - `src/components/sim/vehicle/*` (dynamics, helpers, suspension, steering, wheel)
   - `src/components/sim/terrain-height.ts`, `Road.tsx`, `Environment.tsx`, `Infrastructure.tsx`, `lod.tsx`
   - `src/components/ResultsCharts.tsx`, `RoadMap.tsx`
   - `src/lib/pdf/report.tsx`, `src/lib/pdf/snapshots.ts`
   - `src/components/vehicles/wizard/validation.ts`, `types.ts`
   - Vitest fixtures/regression files to cross-check invariants.

2. **Formula extraction table** capturing per entry: name, purpose, symbolic equation (LaTeX + plain), variables, SI units, source file, function, and call sites. Cover S2–S6 lists — cornering/rollover, drag, rolling/grade resistance, top speed on slope, braking/stopping, fuel rate & L/100km, lateral G, Ackermann, safety score, weight transfer, road curvature integration, elevation sampling (`sampleZAtDistance`), body pitch from axle heights, wheel spin ω = v/r, suspension damping, camera easing constants, minimap projection.

3. **Dashboard & telemetry mapping** (S3–S4): trace each displayed KPI/chart back to its store selector and physics call, noting sampling step (`step_m`), update cadence (`useFrame` @ 60Hz), and any smoothing (`damp`, EMA) used.

4. **Constants inventory** (S6): G, AIR_DENSITY, μ defaults, Crr defaults, playback smoothing k values, wheelbase/track defaults, safety thresholds, sim `step_m`, PDF layout constants.

5. **Verification pass** (S9): for every dashboard/chart/PDF field, confirm the value originates from an extracted equation. Log duplicates, gaps, unused helpers, and inconsistencies (e.g. `topSpeedFlat` vs `topSpeedOnSlope` usage).

6. **Flow diagram** (S7): Mermaid flowchart User Inputs → Vehicle/Road → Physics → Dynamics → Safety → Telemetry → Charts → Report.

7. **Documentation build** (S10) — 13 sections as specified, in both Markdown and PDF (ReportLab, DejaVu font per PDF skill, with visual QA of every page):
   - `01_Project_Overview.md/pdf`
   - `02_Engineering_Equations.md/pdf`
   - `03_Vehicle_Dynamics.md/pdf`
   - `04_Road_Geometry.md/pdf`
   - `05_Suspension_System.md/pdf`
   - `06_Fuel_Model.md/pdf`
   - `07_Telemetry_Calculations.md/pdf`
   - `08_Safety_Calculations.md/pdf`
   - `09_Dashboard_Calculations.md/pdf`
   - `10_PDF_Report_Calculations.md/pdf`
   - `11_Constants.md/pdf`
   - `12_Source_Code_Mapping.md/pdf` (CSV companion)
   - `13_Calculation_Flow.md/pdf` + `flow.mmd` + rendered `flow.png`
   - `Equation_Reference_Sheet.pdf` (single-page cheat sheet)
   - `Verification_Report.md/pdf`
   - `Formula_Index.csv` (machine-readable master table)

8. **Package** all artifacts into `/mnt/documents/VirtuDrive_Engineering_Documentation.zip` and surface it via a `<presentation-artifact>` tag. QA the ZIP contents listing and spot-check rendered PDFs before delivery.

## Deliverable

Single downloadable ZIP at `/mnt/documents/VirtuDrive_Engineering_Documentation.zip` containing every document above. No app code touched; only files written are under `/mnt/documents/` and `/tmp/` scratch.

## Out of scope

- Any change to physics, rendering, routes, or UI.
- Re-deriving formulas that don't exist in the codebase (documentation reflects actual implementation; gaps will be listed in the Verification Report, not silently added).
