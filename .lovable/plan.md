
## Root cause (from the screenshots + `src/components/sim/vehicle/Body.tsx`)

The current model is assembled from independent panels that never merge into one silhouette:

- **Hood and trunk** are separate extruded rounded rectangles floating at `y=0.5` on top of a shallow lower monocoque (`y=0.18`, depth `0.32`). That's why you see a raised deck with a visible gap between the hood and the front bumper/fenders.
- **Cabin** is an extruded top-view plan with 0.5m of straight vertical wall — no windshield/backlight rake — so the greenhouse reads as a shoebox.
- **Roof crown** is a `sphereGeometry` polar cap sitting above the cabin. From the side it looks like a flying saucer disc (visible in both uploaded images).
- **Fenders** are flat rounded slabs stuck onto the sides, not blended into the body — they poke out like shelves.
- **Windows** are axis-aligned `boxGeometry` slabs; side windows are a 2mm-thin vertical wall that reflects like a black stripe.
- **Wheels/arches** aren't cut into the body, so the tires look tiny under a tall wall.

The net effect is a "toy truck" silhouette instead of a passenger car.

The physics/animation refs (`Chassis`, `Doors[FL..RR]`, `Mirrors`, `Wheel_*`), materials singletons, sizing envelope (~4.2m × 1.9m × 1.45m) and mount points must stay identical — only the visual mesh construction changes.

## Fix strategy

Rebuild `Body.tsx` around **one unified side-profile silhouette** extruded along the car's width, then add only small detail meshes on top. This is the standard technique for stylised-but-believable cars.

### 1. Unified sedan side profile
Author one `THREE.Shape` in the X (length) / Y (height) plane that traces the full sedan outline in a single closed curve:

```text
       ___________
      /   roof    \___
     / windshield     \___ backlight
    /                     \
 __/  hood                 \  trunk __
|                                     |
|_____________________________________|
   FL wheel arch      RL wheel arch
```

Include the wheel-arch cut-outs as inner holes in the shape so the arches are part of the body, not slabs glued on. Extrude with `depth = trackWidth (~1.85m)` and `bevelEnabled` for rounded edges. Result: hood, cabin, trunk, fenders and sills are one continuous panel — no floating slabs, no visible gaps.

### 2. Greenhouse as its own tinted extrusion
A second, smaller side-profile shape for the glass area only (windshield rake, roof arc, backlight rake), extruded slightly narrower than the body and rendered with `glassMat`. This gives real windshield/backlight angles instead of vertical walls, and the side windows become the exposed sides of this extrusion (no more 2mm slab).

### 3. Roof crown → part of the greenhouse shape
Delete the sphere-cap disc. The convex roof is baked into the greenhouse silhouette arc, so highlights read as a real roof, not a UFO.

### 4. Front & rear detail overlays (kept, but re-fit)
Keep the existing hardware but re-anchor to the new silhouette:
- Grille, bumper valance, badge, headlight housings (front)
- Tail-light housings, plate recess, exhaust tips (rear)
- Chrome window trim strip along the greenhouse base
- ORVMs mounted to the A-pillar base (keep `Mirrors` subgroup)
- Door cut-lines as thin dark inset strips inside the `Doors` subgroup (keep names `Door_FL/FR/RL/RR` for the animation system)

### 5. Wheel arch fit
Because the arches are now cut into the silhouette, the existing wheels from `Wheel.tsx` will sit inside real arches. Verify wheel radius/track match the arch cut-outs — adjust only the cut-out radii in the shape, never the wheel component itself.

### 6. Materials & performance
- Reuse `paintMat(color)`, `chromeMat`, `glassMat`, `darkTrimMat`, `plasticMat`, `badgeMat` from `materials.ts` — no new material files.
- Memoise the two extrude geometries once per body colour (already the pattern).
- Draw-call budget stays within the current envelope (~25 meshes for the body group).

## Preserved (do NOT touch)

- `Vehicle.tsx` dynamics wiring, transforms, refs, `useFrame` order
- `Wheel.tsx`, `Suspension.tsx`, `Steering.tsx`, `Interior.tsx`, `Lights.tsx`, `Cluster.tsx`
- Physics engine, simulation store, cameras, road, environment, telemetry, minimap, dashboard, backend
- Named hierarchy exposed to animations: `Vehicle / Chassis / Body / Doors[FL..RR] / Mirrors / PlateHolder`
- Overall bounding envelope (length ≈ 4.2m, width ≈ 1.85m, height ≈ 1.45m) so cameras and collision anchors stay valid

## Verification

1. `bunx tsgo --noEmit`
2. `bunx vitest run` — expect the current 107/107 to remain green (no physics/logic touched)
3. Playwright pass on the existing simulation route:
   - Chase camera screenshot (rear 3/4)
   - Drone/top-down screenshot (proportions)
   - Driver/hood screenshot (windshield rake)
   - Side screenshot mid-run (silhouette + wheel arches)
4. Visually confirm against the two uploaded reference frames: no floating disc roof, hood merges into fenders, cabin has real windshield/backlight angles, wheels sit in real arches.

## Files touched

- `src/components/sim/vehicle/Body.tsx` — full rewrite of the mesh assembly (same exports, same props, same group names)

No other files change.
