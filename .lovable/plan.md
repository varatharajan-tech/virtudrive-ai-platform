# Fix: Blank 3D Playback in Simulation View

## Root Cause Analysis

Console logs show repeated warnings during render:
```
THREE.WebGLShadowMap: PCFSoftShadowMap has been deprecated. Using PCFShadowMap instead.
```
This fires on every frame from `WebGLRenderer.render`, which means the shadow subsystem is being stressed. Combined with the "blank canvas" symptom, the most likely cause is **WebGL texture-unit / shadow-map exhaustion → GPU context loss → black canvas**.

Contributing factors we need to verify in code:
1. `Sim3DScene.tsx` sets `shadowMap.type = PCFSoftShadowMap` (deprecated in this three.js build → falls back with warning).
2. Multiple modules add `castShadow` lights: facility spotlights (garage/tower), tunnel interior lights (`Infrastructure.tsx`), vehicle head/tail lights (`Lights.tsx`), plus the main directional sun. Together this exceeds the safe budget (~3–5 shadow casters) and can silently drop the framebuffer on lower-tier GPUs.
3. Vehicle emissive lights refactor (Phase 6) may add extra `SpotLight`/`PointLight` with `castShadow`.

## Investigation Steps (before code changes)

1. Read `src/components/Sim3DScene.tsx` — confirm shadow map type and light setup.
2. `rg -n "castShadow"` across `src/components/sim/**` — enumerate every shadow-casting light.
3. Read `src/components/sim/vehicle/Lights.tsx`, `Infrastructure.tsx`, `facility/FacilityComplex.tsx` for offenders.
4. Check browser console during a live run via Playwright for `WebGL context lost` events (not just the shadow warning).

## Fix Plan

### F1 — Replace deprecated shadow map type
In `Sim3DScene.tsx`: switch `PCFSoftShadowMap` → `PCFShadowMap` (or `VSMShadowMap`). Eliminates per-frame warning and the internal fallback path.

### F2 — Enforce a global shadow-caster budget (≤ 4)
- Keep `castShadow` **only** on the main directional sun light.
- Remove `castShadow` from: all facility spotlights, tunnel point lights, vehicle head/tail lights, roadside lamps. They keep their light contribution; they just stop writing to shadow maps.
- Reduce sun `shadow.mapSize` to 2048 (from 4096 if higher) and tighten `shadow.camera` frustum around the vehicle for crisper, cheaper shadows.

### F3 — Guard against context loss
In `Sim3DScene.tsx` add `onCreated` handler on `<Canvas>` that listens for `webglcontextlost` / `webglcontextrestored` on the GL canvas and calls `event.preventDefault()` + logs to console so we get a visible signal rather than a silent black screen next time.

### F4 — Regression test
Extend `tests/environment.regression.test.ts` (or new `tests/rendering.regression.test.ts`) with a static scan asserting that only one `castShadow` light is exported from the sim modules (parse source, count occurrences per file, fail if > budget).

## Verification

1. `bunx tsgo --noEmit` — typecheck.
2. `bunx vitest run` — expect existing 107 + new tests pass.
3. Playwright: open `/simulations/<id>`, wait for canvas, screenshot the 3D playback panel, confirm road + vehicle visible and no `webglcontextlost` in console.
4. Verify console no longer emits the PCFSoftShadowMap warning.

## Files touched
- `src/components/Sim3DScene.tsx` (shadow map type, context-loss handler)
- `src/components/sim/vehicle/Lights.tsx` (drop castShadow)
- `src/components/sim/Infrastructure.tsx` (tunnel lights → no shadow)
- `src/components/sim/facility/FacilityComplex.tsx` (facility spots → no shadow)
- `src/components/sim/RoadsideKit.tsx` (if lamp lights cast shadow)
- `tests/rendering.regression.test.ts` (new)

Nothing else — physics, store, cameras, telemetry, minimap, DB, and routes are untouched.
