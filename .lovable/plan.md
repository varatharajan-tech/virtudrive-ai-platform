# Low-Poly Sports Car GLB — Integration Plan

## Goal
Retire the hand-built primitive body/wheels in `src/components/sim/vehicle/*` and drive the visual vehicle from a real GLB asset that meets the spec (single smooth body, integrated arches, 4 named wheel nodes, PBR paint, glass, <15k tris). Physics, telemetry, cameras, road, and tests stay untouched.

## 1. Asset acquisition
Lovable's image/video tools can't emit GLB. Options — pick one:

- **A. Procedurally generate the GLB at build-time** with a small Node script using `@gltf-transform/core` (lathe/extrude a spline chassis, boolean-cut arches, generate 4 wheel nodes, assign PBR + glass materials, export `public/models/car.glb`). Deterministic, no external download, ~8–12k tris, matches spec exactly. Recommended.
- **B. Bundle a hand-picked CC0 low-poly roadster GLB** (e.g. Poly Pizza / Kenney / Quaternius). Fast, but style/tri-count/naming won't exactly match the spec and licensing text must ship.
- **C. User uploads their own GLB** into `public/models/`. Zero ambiguity, but requires the user to provide the file.

## 2. Loader + component wiring
- Add `public/models/car.glb` (from step 1).
- New `src/components/sim/vehicle/CarModel.tsx` using `useGLTF('/models/car.glb')` + `useGLTF.preload`.
- Traverse the scene once: locate `Body`, `Wheel_FL`, `Wheel_FR`, `Wheel_RL`, `Wheel_RR`, `Glass` nodes; stash refs.
- Reapply shared PBR materials from `src/components/sim/vehicle/materials.ts` (paint tinted by `color` prop, glass, rubber, rim) so theme + existing material cache still apply.
- Normalize: center pivot, scale to current wheelbase/track constants used by physics (no physics change — visual only).

## 3. Replace primitive meshes in `Vehicle.tsx`
- Remove `<Body />`, `<Wheel />`, `<Lights />` primitive geometry usage for the body/wheels; keep the existing refs and the `VehicleDynamics` context intact.
- Wire GLB wheel node refs into the existing suspension/steering/spin update loop (same math, just point at GLB nodes instead of primitive meshes).
- Keep `Lights`, `Interior`, `Steering`, `SuspensionCorner`, `Cluster` overlays as-is — they attach to the chassis group.
- Add a `<Suspense fallback={null}>` boundary around the model.

## 4. Cleanup
- Delete only the now-unused primitive body geometry inside `Body.tsx` (or keep as fallback behind a flag). Wheel primitive component can stay unused or be removed.
- No changes to `store.ts`, `SceneAdvancer`, `Cameras`, `Road`, `Environment`, physics, or tests.

## 5. Verification
- `bun run build` + existing 110 tests (must stay green — none reference primitive geometry).
- Playwright screenshot of `/simulations/:id` chase cam confirming: smooth silhouette, wheels recessed in arches, glass distinct from paint, no floating parts, 4 wheels rotating.

## Technical notes
- GLB path `/models/car.glb` served from `public/` (no bundler import needed).
- `useGLTF` requires `@react-three/drei` (already installed).
- Naming contract for wheel nodes is enforced in the loader; if names differ the component throws a clear error at mount.
- Tri budget target ~10k; single 1k texture atlas OR vertex colors + material params (spec allows either).

## Decision needed
Which asset source (A / B / C)? A is the most reliable fit for the spec; confirm before I switch to build mode.