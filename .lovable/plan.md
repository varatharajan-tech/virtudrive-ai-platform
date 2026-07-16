## Phase 6 — Production-Quality Engineering Vehicle Upgrade

Scope is strictly `src/components/sim/Vehicle.tsx` and small new files under `src/components/sim/vehicle/`. No changes to physics, simulation, store, cameras, environment, road, backend, or existing tests.

### RCA — Current Vehicle Limitations

Inspected `Vehicle.tsx` (408 lines):
1. **Mesh fidelity**: entire body is ~15 axis-aligned `boxGeometry` slabs — no fenders, no hood curvature, no bumper shaping, no grille, no door handles, no plate holder.
2. **Materials**: single flat `bodyMat` (no normal / roughness / AO maps); glass, tires, chrome all use plain solid colors.
3. **Lighting**: two emissive rectangles for head/tail lamps only — no DRL, brake, reverse, indicator, fog, hazard, or interior illumination; no state binding to `throttle`/`brake`/`steer`.
4. **Wheels**: 5 box "spokes" and a naked cylinder tire — no tread, no sidewall, no caliper, no lug nuts, no hub cap detail; brake disc never glows.
5. **Suspension viz**: purely invisible — no arms, springs, dampers, anti-roll bar meshes.
6. **Steering**: front assemblies rotate but no rack, linkage, column, or animated interior steering wheel.
7. **Interior**: none — cabin is an opaque box; no dashboard, cluster, seats, pedals, mirrors, console.
8. **Instrument cluster**: no HUD driven by physics state (speed/rpm/gear/throttle/brake/steer/fuel/temp/roll/pitch/yaw/SI).
9. **Performance**: per-wheel geometries already memoized, but 4×(tire+rim+hub+disc+5 spokes)=36 draw calls just for wheels; lug nuts / calipers will multiply this without instancing. No LOD.

### Design

Split the monolithic file into focused, memoized subcomponents under `src/components/sim/vehicle/` — each purely presentational, driven either by static props or by reading `usePlayback.getState()` / refs written by the existing animation loop in `Vehicle.tsx`. `Vehicle.tsx` remains the single `useFrame` owner (no new frame loops) so physics/animation order and existing tests are preserved.

```text
src/components/sim/vehicle/
  materials.ts        // shared PBR materials + procedural PBR maps (paint, glass, chrome, rubber, plastic, carbon, emissive lamp mats)
  Body.tsx            // high-fidelity monocoque: hood, fenders, bumpers, grille, roof, mirrors, handles, plate holder
  Lights.tsx          // DRL, low/high beam, fog, tail, brake, reverse, L/R indicators, hazard, interior glow (emissive intensity bound via refs)
  Wheel.tsx           // tire (torus tread + sidewall), multi-spoke rim, hub, lug nuts, caliper, brake disc (with heat-glow emissive ref)
  Suspension.tsx      // control arms + coil spring + damper cylinder per corner (compression from susPos refs)
  Steering.tsx        // rack, tie rods, column (mapped from front steer refs)
  Interior.tsx        // dashboard, cluster housing, seats (driver/passenger/rear), console, gear selector, pedals, rear-view + side mirrors, steering wheel (rotated from steer refs)
  Cluster.tsx         // HTML overlay via <Html> from drei OR a 2D DOM panel positioned by `TelemetryOverlay` sibling — bound to store telemetry (already emitted at 30 Hz)
  lod.tsx             // useVehicleLOD(distance) → 'high' | 'mid' | 'low' switching wheel spokes/lug nuts/interior visibility
```

`Vehicle.tsx` refactor:
- Keep existing refs (`body`, `chassis`, `wheels`, `flAssembly`, `frAssembly`, `susPos`, `susVel`, `rollSmooth`, `pitchSmooth`, `steerLSmooth`, `steerRSmooth`, `spinRef`) and the entire `useFrame` body untouched.
- Add new refs for lamp emissive intensities, brake-disc temperature, steering-wheel Y rotation, suspension compression per corner, indicator blink phase. Populate them inside the SAME `useFrame` from existing signals (`throttle`, `brake`, `steer_deg`, `susPos`, `speed_mps`, indicator = sign(steer_deg) × recent turn).
- Replace inline body/wheel JSX with `<Body/>`, `<Wheel/>`, `<Suspension/>`, `<Steering/>`, `<Interior/>`, `<Lights/>` — passing refs down.

### M1–M11 Mapping
- **M1 Body**: `Body.tsx` — CatmullRom-lofted hood, sculpted fenders, bumpers with intakes, mesh grille, chrome trim strips, door handles, ORVMs, plate holder, roof rails.
- **M2 Lighting**: `Lights.tsx` — separate emissive meshes per lamp function; intensities driven by `throttle` (DRL always on, high-beam toggle stub), `brake` (tail dim → brake bright + reverse when `speed<0`), `steer_deg` (indicator blink at 1.5 Hz), plus SpotLight cones for head/fog gated by distance-LOD.
- **M3 Wheels**: `Wheel.tsx` — TorusGeometry tread w/ normal-mapped block pattern, cylinder sidewall, LatheGeometry spokes ×10, 5 lug nuts, caliper (bracket + piston), disc with emissive that fades from #000 → #ff5500 based on rolling avg of `brake`.
- **M4 Suspension**: `Suspension.tsx` — upper/lower A-arms, coil spring (TorusKnot-like helix or stacked torus), damper cylinder; length driven by per-corner `susPos`.
- **M5 Steering**: `Steering.tsx` — rack bar translates on X from `(steerL+steerR)/2`, tie rods rotate accordingly, column visible through firewall to interior steering wheel.
- **M6 Interior**: `Interior.tsx` — glass no longer fully opaque; add dashboard sweep, cluster housing, 4 seats (bucket front, bench rear), center console + gear knob, pedals, rear-view mirror, side mirrors (already), roof liner, door cards.
- **M7 Cluster**: `Cluster.tsx` — HUD panel (fixed-position DOM, sibling of existing `TelemetryOverlay`) subscribing to `usePlayback` telemetry slice: Speed, RPM, Gear (derived from RPM bands), Throttle%, Brake%, Steering°, Fuel% (fixed EV/ICE from vehicle spec), Battery%, Engine/Coolant temp (thermal model: baseline + throttle load - cooling), Suspension travel, Roll°, Pitch°, Yaw°, Stability Index (from existing safety heuristic).
- **M8 Animations**: already wired via existing refs — only need to bind interior steering wheel + suspension mesh compression to those refs.
- **M9 PBR**: `materials.ts` — procedural CanvasTexture generators (paint clearcoat, brushed metal, chrome, rubber tread, plastic, carbon weave, glass) producing base/normal/roughness/AO; reused across instances.
- **M10 Cameras**: adjust existing camera anchor offsets ONLY in a new `vehicle/anchors.ts` exporting driver / cockpit / hood / roof / rear / mirror positions — read by existing `Cameras.tsx` via optional prop (or by lookup key). Do not rewrite `Cameras.tsx` logic; only add anchor offsets if the current file already supports offset injection — otherwise leave `Cameras.tsx` untouched and expose anchors as data for a future hookup.
- **M11 Performance**: LOD gates (spokes, lug nuts, calipers, interior, suspension arms hidden beyond 25 m; body simplified beyond 80 m). All materials memoized module-level singletons in `materials.ts` (reused across corners). Wheel primitives share geometries (already partially done). Instanced lug nuts. Emissive updates via `material.emissiveIntensity = ref` (no React re-render). Target: keep frame cost within ~1.3× current.

### Testing
- Run `bunx tsgo --noEmit`, `bun run lint`, `bun run build`, `bunx vitest run` — ALL existing 101 tests must remain green (no test edits).
- Add `tests/vehicle.regression.test.ts` (pure-logic): asserts new helpers — `gearFromRpm`, `thermalStep`, `indicatorPhase`, `brakeGlowIntensity` — are deterministic and bounded.
- Live checks via Playwright on `/simulations/<id>`:
  1. canvas renders (screenshot #1 static)
  2. play, screenshot at t=2 s (wheels spinning, lights on)
  3. brake segment screenshot (brake lamps + disc glow)
  4. turn segment screenshot (indicator + steering wheel + Ackermann visible)
  5. 15-min playback smoke: sample FPS every 30 s via `stats` overlay, assert ≥ 55 avg, no memory growth > 20 %.

### Files
- **New**: `src/components/sim/vehicle/{materials.ts, Body.tsx, Lights.tsx, Wheel.tsx, Suspension.tsx, Steering.tsx, Interior.tsx, Cluster.tsx, anchors.ts, lod.tsx}`, `tests/vehicle.regression.test.ts`.
- **Modified**: `src/components/sim/Vehicle.tsx` (refactor render tree + add ref population inside existing useFrame; physics untouched). Optional: mount `<Cluster/>` from `Sim3DScene.tsx` overlay layer.
- **Untouched**: physics, simulation, store, road, environment, cameras (unless anchor injection is trivially available), backend, existing tests.

### Final Report Deliverable
After implementation, produce the 12-section report (root causes, upgrades, materials, animations, lights, files, perf before/after, FPS, memory, tests PASS/FAIL, remaining limitations, Production Readiness Score).
