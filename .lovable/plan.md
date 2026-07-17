
## Goal
Replace the current sports-car body in the 3D playback with a brand-new, clean **modern sedan** model. Nothing else changes — physics, road, camera, lighting, telemetry, tests, and dynamics refs stay identical.

## Scope (touch only these)
- `src/components/sim/vehicle/Body.tsx` — full rewrite of the mesh
- `src/components/sim/vehicle/materials.ts` — small tweaks only if a new material is needed (e.g. taillight red, satin trim)
- `src/components/sim/vehicle/Lights.tsx` — reposition lamp emissive planes to match new body only if lamp anchor points change

Do NOT modify: `Vehicle.tsx`, `Wheel.tsx`, `Suspension.tsx`, `Steering.tsx`, `Interior.tsx`, `Cluster.tsx`, physics, store, cameras, road, environment, tests.

## New Vehicle Design — Modern Sedan
Silhouette: four-door sedan, three-box proportions (hood / cabin / trunk), gently arched roofline, long wheelbase.

Construction — clean primitives + one extruded lower body:
- **Lower body**: extruded rounded rectangle (bevelled) forming chassis + fenders in a single continuous shell with recessed wheel arches (Lathe-cut arches, same technique already used).
- **Hood**: slightly sloped, chamfered box merging flush into lower body.
- **Trunk**: short rear deck, chamfered.
- **Greenhouse (cabin)**: tapered box with angled A-pillar (windshield rake), vertical B-pillar, angled C-pillar (rear glass rake). Roof narrower than beltline (tumblehome).
- **Glass**: windshield, rear window, 4 side windows — real transparent glass material (already in `materials.ts`).
- **Pillars**: matte-black A/B/C pillars framing the glass.
- **Details**: slim LED headlight bars, wide low grille, front splitter, side skirts, flush door handles (2 per side), teardrop mirrors on the beltline, slim LED taillight bar across the trunk, dual exhaust tips, small shark-fin antenna. No roof sensor pod (removed — user wants a clean sedan).
- **Paint**: keep the existing `paintMat(color)` — colour still controlled by the `vehicleColor` prop.

Dimensions kept identical to current constants so wheels, suspension attach points, camera anchors, and Ackermann geometry all stay valid:
- length 4.6 m, width 1.85 m, height 1.42 m, wheelbase 2.75 m, track 1.58 m.

## Verification
1. `bun run build` and `bunx vitest run` — expect 110/110 to still pass (no physics/logic changed).
2. Playwright script under `/tmp/browser/sedan-verify/`:
   - Log in with injected Supabase session, open `/simulate`, start a sim, land on `/simulations/:id`.
   - Cycle through camera modes (Chase, Driver, Hood, Drone, Orbit) and capture a screenshot at each.
   - Additional orbit screenshots at 0°, 45°, 90°, 135°, 180°, 270° yaw offsets by using the Drone camera + a short scrub of the timeline so the car passes through different headings.
   - Close-ups: front (headlights + grille), rear (taillight bar + exhausts), side (doors + handles + mirrors + wheels), top (roof + glass), 3/4 front, 3/4 rear.
3. View each screenshot with `code--view` and confirm: symmetry, no floating parts, no gaps between body/roof/glass, wheels recessed in arches, pillars framing all windows, lights aligned, no clipping while the car moves and steers on the road.
4. Report PASS/FAIL per checklist item with the screenshot paths.

## Out of Scope
Road, terrain, sky, lighting rig, camera behaviour, HUD, minimap, telemetry, PDF report, database, auth, tests.
