## Root Cause: "New road" fails on submit

Clicking **+ New road** does navigate to `/roads/new`, so the link works. The failure is on **Create road submit**:

- The form inserts with `road_type: "highway" | "mountain" | ...` but the DB column is a Postgres enum (`USER-DEFINED`) that likely doesn't include every value in `ROAD_TYPES` (e.g. `urban`, `village`) → insert throws `invalid input value for enum road_type`.
- `name` is left blank on first mount and `.single()` after an insert error surfaces a generic toast, so the failure looks like the button "does nothing".
- No slope/elevation UI exists today, so the requested elevation features aren't captured.

## Plan

### 1. Fix the enum / insert failure
- Query the actual enum values from Postgres and align the `ROAD_TYPES` constant in `roads.new.tsx` to them (drop `urban`/`village` if absent, or add a migration that extends the enum — I'll pick alignment with existing enum to avoid schema churn).
- Add inline error surfacing (show the Supabase error message in a red banner in addition to the toast).

### 2. Add the new road-authoring features
Extend `roads.new.tsx` UI (no schema change — store in existing `elevation_profile jsonb`):

- **Track length** already exists (numeric input). Add sensible presets (1 / 2 / 5 / 10 km) as quick-pick chips.
- **Slopes editor** — new section:
  - Slider/number: "Number of slopes" (0–8).
  - For each slope row: direction (▲ Up / ▼ Down), degree (0–15°), station (m), length (m).
  - Quick action: **"2 Up + 2 Down"** button that auto-lays out 2 ascending and 2 descending slopes evenly along the track (matches the requested "2 upward + 2 downward simultaneously" preset).
  - Persist as `elevation_profile: { slopes: [{ dir, deg, station_m, length_m }] }`.
- **Curves count** — add a "Number of curves" numeric input that regenerates the curves array evenly spaced along the track when changed (keeps existing per-curve editor for fine-tuning).

### 3. Detail route + list card
- Update `/roads/$id` to display the slopes summary.
- Update the roads list card `Stat` grid to show "Slopes: N".

### 4. Test
- Create sample road **"Test Ghat 6km"** via the new form: length 6000 m, 4 curves, "2 Up + 2 Down" preset (6° each).
- Verify insert succeeds, appears in list, opens correctly, and simulation still runs on it.
- Add a small vitest ensuring the "2 Up + 2 Down" preset produces exactly 2 up + 2 down evenly spaced slopes for a given length.

### Technical notes
- No DB migration needed if enum already covers used types; if it doesn't, extend enum with a migration (`ALTER TYPE road_type ADD VALUE ...`) rather than dropping options.
- Elevation data lives entirely in the existing `elevation_profile jsonb` column — no simulation-engine changes required for this task (physics already reads slope arrays where present; if absent, `base_slope_deg` remains the fallback).