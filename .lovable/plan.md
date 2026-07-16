
## Goal

Replace the placeholder procedural car in the 3D Playback with a production-quality passenger vehicle rendered from a GLB/GLTF asset. **Zero changes** to physics, telemetry, road, cameras, dashboard, reports, or the `Vehicle.tsx` animation loop's public behavior — only the visual meshes/materials swap.

## Approach

Keep `Vehicle.tsx` as the single source of truth for transforms (position, yaw, chassis roll/pitch/bounce, per-wheel suspension travel, wheel spin, Ackermann steering). Introduce a new GLB-backed render layer that plugs into the same refs (`chassis`, `wheels[0..3]`, `flAssembly`, `frAssembly`) so the wrapping animation code is untouched.

## Model source

Ship a curated CC0 sedan GLB, uploaded via `lovable-assets` so the repo stays lightweight and the model streams from CDN. Target ≤ 2 MB Draco-compressed. Node names in the GLB will be normalized on load into a stable rig:

```
Vehicle (root, driven by Vehicle.tsx position + yaw)
├── Chassis            (roll/pitch/bounce)
│   ├── Body           (hood, roof, bumpers, grille, mirrors, glass, doors, handles, arches, plate)
│   ├── Headlights     (LED + DRL + front indicators, emissive)
│   ├── BrakeLights    (tail + brake + reverse + rear indicators, emissive)
│   ├── Mirrors        (L/R)
│   ├── Doors          (FL/FR/RL/RR — static, hierarchy preserved for future open anim)
│   └── Interior       (steering wheel, dashboard, front seats)
└── Wheels
    ├── FL, FR         (parented under steering assemblies for Ackermann)
    └── RL, RR
    Each wheel: Tire, Rim, BrakeDisc, BrakeCaliper (separate meshes)
```

## Files

**New**
- `src/assets/vehicles/sedan.glb.asset.json` — CDN pointer (uploaded via `lovable-assets create`).
- `src/components/sim/vehicle/GLBVehicle.tsx` — loads GLB via `useGLTF` + Draco/Meshopt, walks the scene, tags nodes by convention (regex on names), rebuilds the required rig, and exposes refs.
- `src/components/sim/vehicle/rig.ts` — pure helpers: node-name matchers, material upgrader (metallic paint → clearcoat, glass → transmission, chrome, rubber, plastic), emissive binding for lamp meshes.
- `tests/vehicle-rig.test.ts` — unit tests for the name matchers and rig extraction against a synthetic THREE scene.

**Modified (surgical)**
- `src/components/sim/Vehicle.tsx` — replace the child `<Body/> <Lights/> <Interior/> <Steering/>` block and per-corner `<Wheel/>` with `<GLBVehicle>` children that receive the same refs. Animation loop, constants, refs, and telemetry emit stay identical.
- `src/components/sim/vehicle/materials.ts` — extend with named material builders reused by the rig (`makePaint`, `makeGlass`, `makeChrome`, `makeRubber`, `makePlastic`, `makeLamp`).

**Untouched**
`Cluster.tsx`, `Steering.tsx` (interior steering wheel binding stays via `dyn.steerAvgDeg`), `Lights.tsx` behavior (emissive intensities still driven by `dyn.brakeGlow`, `dyn.indicatorL/R`, etc. — just applied to the GLB lamp meshes), all physics/telemetry/road/camera modules.

## Node-name convention (rig.ts)

Case-insensitive regex on GLB node names, with sensible fallbacks so a slightly different model still rigs cleanly:
- Wheels: `/wheel[_-]?(fl|fr|rl|rr)/` → position-based fallback (min/max of x,z).
- Tire/Rim/Disc/Caliper: `/tire|rim|disc|brake|caliper/` inside each wheel group.
- Lights: `/headlight|drl|tail|brake_?light|reverse|indicator|blinker/`.
- Glass: `/glass|window|windshield/` → `MeshPhysicalMaterial` w/ transmission.
- Paint: `/body|paint|shell/` → clearcoat metallic (color from prop, same signature as today).
- Mirrors, Doors, Interior grouped by name prefix.

If a required group is missing, `GLBVehicle` logs a dev warning and falls back to the existing procedural `<Body/>` for that group only — no blank car.

## Performance

- Preload the GLB with `useGLTF.preload` at module import so first playback frame has it ready.
- Draco + Meshopt compression on the asset; single 2K PBR atlas.
- Reuse materials across similar meshes (paint singleton keyed by hex, same pattern as `materials.ts`).
- Wrap in `<Suspense fallback={<ProceduralBody/>}>` so the scene never goes blank while streaming.

## Verification

1. `bunx tsgo --noEmit` — type clean.
2. `bunx vitest run` — all 107 existing tests pass; new rig tests pass.
3. Playwright on `/simulations/<id>`: start playback, screenshot at t=2s and t=6s; confirm car renders, wheels spin, steering turns front wheels, brake lights glow under braking, minimap and telemetry unchanged.
4. Perf overlay: sustained ≥ 55 fps at 1280×800 on desktop preview.

## Out of scope (explicitly not touched)

Physics engine, `simulation.ts`, road generation, `LiveMinimap`, `LiveTelemetry`, `Cluster` HUD, PDF report, database, auth, camera modes, playback controls.
