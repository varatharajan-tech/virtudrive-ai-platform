
# VirtuDrive AI — MVP Build Plan

Enterprise-grade virtual vehicle testing platform. Real physics, stylized 3D sim, AI-explained predictions, PDF engineering reports.

## Stack (Lovable-native)

- **Frontend**: TanStack Start + React 19 + TS + Tailwind v4 + shadcn/ui + Zustand + TanStack Query
- **3D**: three + @react-three/fiber + @react-three/drei
- **Charts**: Recharts
- **Backend**: Lovable Cloud (Supabase — Postgres, Auth, RLS, Storage)
- **AI**: Lovable AI Gateway (`openai/gpt-5.5`) via server functions — used to generate natural-language explanations on top of deterministic physics/heuristic predictions. (Python/FastAPI is not runnable on Lovable; the AI layer is abstracted behind a typed interface so it can be swapped later.)
- **PDF**: `@react-pdf/renderer` (client-side, professional layout)

## Design system

Dark engineering theme. Deep slate `#0B0F14` base, panel `#111823`, hairline borders, cyan-teal accent `#22D3EE`, warning amber `#F59E0B`, danger `#EF4444`, success `#10B981`. Mono font (JetBrains Mono) for numerics, Inter for UI. Semantic tokens in `src/styles.css`; no hardcoded colors in components.

## Data model (Postgres, RLS on)

- `profiles` (id → auth.users, full_name, org, created_at)
- `vehicles` (id, owner_id nullable [null = seeded], name, category, mass_kg, wheelbase_m, track_m, cog_height_m, frontal_area_m2, drag_coeff, rolling_resist_coeff, tire_friction_mu, max_power_kw, max_torque_nm, gear_ratios jsonb, fuel_type, engine_efficiency, is_public bool)
- `roads` (id, owner_id, name, road_type enum, length_m, surface_mu, elevation_profile jsonb, curves jsonb[])
- `simulations` (id, owner_id, vehicle_id, road_id, params jsonb, results jsonb, ai_summary text, created_at, status)
- `simulation_samples` (sim_id, t, x, y, z, speed, lat_accel, long_accel, steering_deg, fuel_rate) — for charts/report
- Enums: `road_type`, `fuel_type`, `sim_status`
- Every table: GRANTs + RLS policies (`owner_id = auth.uid()`, seeded vehicles readable to all authenticated).

## Physics engine (`src/lib/physics/`)

Pure TS, deterministic, unit-tested equations:

- Safe cornering speed: `v = sqrt(μ·g·r)` (flat); with banking θ: `v = sqrt(g·r·(sin θ + μ cos θ)/(cos θ − μ sin θ))`
- Rollover threshold: `v_ro = sqrt(g·r·t/(2·h))` (t = track, h = CoG height); SSF = t/(2h)
- Skid vs rollover: whichever limit is lower governs.
- Lateral force: `F_lat = m·v²/r`; longitudinal: drivetrain − drag − rolling.
- Aero drag: `0.5·ρ·Cd·A·v²`; rolling: `Crr·m·g·cos θ`; grade: `m·g·sin θ`.
- Braking distance: `v²/(2·μ·g)`; stopping = reaction + braking.
- Fuel: brake-specific fuel consumption model with engine efficiency + LHV of fuel; instantaneous L/100km.
- Weight transfer (long/lat), tire grip circle, stability index (0–100 composite).
- Integrator: RK4 over road stations (Δs) producing per-sample state.

## AI layer (`src/lib/ai/`)

- Deterministic heuristic predictor: safe speed, safe slope, skid prob, rollover prob, steering recommendation per curve, safety score, fuel-optimal cruise speed — derived from physics outputs + margins.
- `explainPrediction` server function → Lovable AI Gateway (`openai/gpt-5.5`) with structured output (Zod) returning `{ summary, reasons[], risks[], recommendations[] }`. Prompt includes the physics inputs so explanations are grounded.

## Routes (TanStack file-based)

- `/` landing (public) — product overview
- `/auth` — email/password sign-in/up
- `/_authenticated/dashboard` — recent sims, KPIs
- `/_authenticated/vehicles` — list; `/vehicles/$id` detail/edit; `/vehicles/new`
- `/_authenticated/roads` — list/builder; `/roads/$id`; `/roads/new`
- `/_authenticated/simulate` — wizard (pick vehicle → pick/build road → params → run)
- `/_authenticated/simulations/$id` — results: 3D playback, charts, AI explanation, download PDF
- `/_authenticated/settings`

## 3D simulation (`src/components/sim3d/`)

R3F scene: procedural road ribbon extruded along curve list (straights + arcs with radius/angle), lane markings, banking; low-poly car mesh colored by category; chase camera with orbit toggle; HUD overlay (speed, lat-g, steering). Playback scrubber tied to `simulation_samples`. Uses `Suspense` + `<ClientOnly>` wrapper (no SSR for canvas).

## PDF report

`@react-pdf/renderer` document: cover (project, vehicle, road, timestamp, engineer), executive summary (AI), inputs table, physics results table, charts (rendered to PNG via off-screen Recharts → image), curve-by-curve safety table, recommendations, appendix with equations used.

## Wizard UX

Multi-step form with Zod validation at each step, Zustand store for draft state, autosave to `simulations` as `draft`, "Run" executes physics synchronously (Web Worker for long runs) → writes results + samples → navigates to results page → kicks off AI explanation query.

## Seed data

15 real vehicles (mix: Toyota Corolla, Honda Civic, Ford F-150, Tesla Model 3, Mahindra Thar, Porsche 911, Volvo FH truck, Royal Enfield 650, etc.) with published specs, in an idempotent migration. 5 preset roads (Highway, Mountain, Hairpin, Race Track, Off-road).

## Security / quality bar

- RLS on every table; owner-scoped policies; seeded rows readable to `authenticated`.
- Zod validation on all forms and server-fn inputs.
- Error boundaries + `notFoundComponent` on every route with a loader.
- Toasts (sonner) for all mutations; loading skeletons; empty states.
- No secrets in client; `LOVABLE_API_KEY` server-only.

## Delivery order (single build)

1. Enable Lovable Cloud, DB migration + seed, auth (email/password) + profiles trigger.
2. Design system + shell (sidebar nav, header, dark theme).
3. Vehicles CRUD + list/detail.
4. Road builder (curve editor) + list/detail.
5. Physics engine module + unit-tested helpers.
6. Simulation wizard + runner (Web Worker) + samples persistence.
7. Results page: charts + 3D playback.
8. AI explanation server fn + integration.
9. PDF report generator + download.
10. Dashboard KPIs, settings, landing page, SEO meta.

## Explicitly out of scope for this build

- Python/FastAPI microservice (not runnable on Lovable) — AI abstracted behind an interface.
- Admin panel, role-based access beyond owner/self (can add later).
- TensorFlow model training, high-fidelity car assets, terrain textures.
- Google OAuth.

Approve to start building end-to-end.
