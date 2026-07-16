## Root Cause

Toggling **Debug** makes the car vibrate because `DebugOverlay` forces expensive React re-renders inside the render loop, which starves the frame budget and destabilises the vehicle's suspension integrator.

Two concrete faults in `src/components/sim/DebugOverlay.tsx`:

1. **`setReadout` inside `useFrame` (every ~150 ms)** triggers a React re-render of the overlay while the 3D scene is rendering. On each re-render, this JSX runs:
   ```tsx
   <arrowHelper args={[new THREE.Vector3(1,0,0), new THREE.Vector3(), 6, 0x22c55e, 1.2, 0.6]} />
   ```
   The `args` array contains freshly-allocated `THREE.Vector3` instances, so R3F sees "new args" every time and **disposes + reconstructs the arrowHelper objects** ~6×/sec. Same for the second arrow. This causes GC pressure and frame-time spikes.

2. **`DebugReadout` writes to the DOM from inside render** (`el.textContent = …`) — a side-effect during render, which React 19 can double-invoke in dev.

Under those frame spikes, the vehicle's explicit-Euler spring–damper in `Vehicle.tsx` (`K=80, C=14`) receives large `dt` values. Explicit Euler with a stiff spring is only stable when `dt < ~2/√K ≈ 0.022 s`. A 60→20 fps stutter pushes `dt` past the stability limit and the springs **oscillate visibly = the "vibration / little jumping"** the user sees. Turning Debug off removes the re-renders, `dt` stays small, springs settle → car is smooth again.

## Fix

Edits are scoped to two files, no behaviour change to physics or other overlays.

**`src/components/sim/DebugOverlay.tsx`** — make the overlay allocation-free and render-free:
- Remove `useState` + `setReadout` entirely.
- Hoist the arrow-helper constructor args to stable module-level constants (or `useMemo` returning the same references) so R3F never reconstructs them.
- Write heading / steer / speed straight into `#virtudrive-debug-readout` from inside `useFrame` (throttled to ~7 Hz), no React state involved.
- Compute the readout only when `show` is true.

**`src/components/sim/Vehicle.tsx`** — harden the suspension integrator so a one-off frame spike from anywhere (debug, tab switch, GC) can never make the car jump:
- Sub-step the per-wheel spring–damper and body-bounce integrator with a fixed inner `h ≤ 0.008 s`, iterating `ceil(dt / h)` times per frame. Cost is negligible (4 springs × a few iters) and it makes the integrator unconditionally stable for the current `K, C`.
- Keep the existing clamps and API; nothing else changes.

No changes to `store.ts`, cameras, road, or telemetry.

## Verification

1. `bunx vitest run` — all 97 existing playback/simulation regression tests must still pass (they exercise the same interpolation + world transform).
2. Playwright script that:
   - opens `/simulations/<id>`,
   - waits for the canvas,
   - toggles **Debug** on via the camera controls,
   - samples the car's world `position.y` and `rotation.z` for ~3 seconds via `page.evaluate` on the R3F scene,
   - asserts the standard deviation of `position.y` stays under a small threshold (e.g. `< 0.01 m`) and no per-frame delta exceeds `~0.02 m` — i.e. no vibration.
3. Screenshot with Debug on for visual confirmation the arrows/spline still render and the readout updates.

Only mark the fix complete when both the automated assertion and the screenshot agree.
