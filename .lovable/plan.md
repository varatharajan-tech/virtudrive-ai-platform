## Goal
Fix the blank/black 3D playback caused by an R3F mount error, and verify with a real simulation run.

## Root cause (hypothesis, confirmed by console)
The scene throws on first mount:

- `R3F: Cannot set "data-tsd-source"` — a JSX node inside the R3F tree isn't a valid three object, so R3F fails while applying props.
- `Cannot convert undefined or null to object` during `removeChildFromContainer` — React then tears down the half-built tree, the error boundary catches it, and WebGL loses context. Result: empty canvas.

The regression appeared after Phase 5 wired `FacilityComplex`, `Infrastructure`, `RoadsideKit`, and `Landscape` into `Environment.tsx`. One of those subtrees is producing an invalid child (stray DOM tag inside Canvas, `undefined`/`null`/hole from a `.map`, misplaced fragment, or a component that returns nothing on some path).

## Plan

### 1. Isolate the offending subtree (RCA, no guessing)
- Temporarily comment out the four Phase 5 components one at a time in `src/components/sim/Environment.tsx` and reload `/simulations/:id` to see which one triggers the R3F error. Confirm with the browser console.
- Read the guilty file end-to-end plus its helpers, looking specifically for:
  - Plain DOM elements (`<div>`, `<span>`, `<img>`) inside the Canvas tree.
  - `.map()` / `.flatMap()` callbacks that can return `undefined`/`false`/`null`.
  - Conditional renders like `{cond && <group>...}` where `cond` can be `0`/`NaN`.
  - Components whose function body has a code path with no `return`.
  - Fragments (`<>...</>`) used as the single child of an instanced mesh or a `LodInstancedMesh` build callback.
  - `<Html>` / `<Text>` from drei placed where a three primitive is expected.

### 2. Fix the actual defect
Apply a permanent fix in the offending file(s):
- Replace invalid nodes with valid three primitives or `<group>` wrappers.
- Ensure every `.map` returns an element (or filter first, then map).
- Give every component a single, always-defined return.
- Guard spline/sampler lookups so they never produce `NaN` positions that would make a downstream child throw.

### 3. Defensive hardening (small, targeted)
- In `Sim3DScene.tsx`, keep the existing `<Suspense>` boundaries; add an inner R3F error boundary around the `SimEnvironment` subtree so a future bad prop degrades gracefully instead of blanking the whole canvas.
- No changes to physics, camera, vehicle, telemetry, minimap, store, or backend.

### 4. Verification
- `bunx tsgo --noEmit` — TypeScript clean.
- `bunx vitest run` — all 101 regression tests still pass.
- Drive the live app with Playwright:
  1. Restore the injected Supabase session, navigate to `/simulations/0328bde0-0c40-455f-86ed-4551a830cb9b`.
  2. Wait for the Canvas, capture a screenshot, and read `document` for the error-boundary text.
  3. Assert the canvas has non-zero drawing output (check via a `readPixels` inside a `useFrame` probe, or by confirming the vehicle/road DOM overlays render and no runtime error is present in the console).
  4. Toggle Debug / switch camera modes; capture screenshots to confirm the scene stays rendered.
- Report the console: zero `R3F:` errors, zero `Cannot convert undefined or null to object`, no `Context Lost`.

## Deliverables
- Identified file + exact defect (named in the final report).
- Patch to that file plus the small error-boundary wrap in `Sim3DScene.tsx`.
- Test + Playwright evidence that the 3D playback renders on the current simulation route.
- Short final report: root cause, fix, files touched, test results, remaining risks.

## Non-goals
No changes to physics, vehicle dynamics, AI, backend, database, dashboard, telemetry, camera logic, or simulation logic.
