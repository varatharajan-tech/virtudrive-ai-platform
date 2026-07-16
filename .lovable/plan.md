## Vehicle Model Redesign — Scope Lock

**Only files modified:**
- `src/components/sim/vehicle/Body.tsx` — full mesh rewrite
- `src/components/sim/vehicle/materials.ts` — refine paint / glass / trim to match the teal reference (mint/teal metallic, matte-black grille, subtly tinted glass, gloss-black alloys)
- `src/components/sim/vehicle/Lights.tsx` — reshape headlight/taillight strips to match new fascia (slim LED bars) and re-anchor to new front/rear Z (`F = -2.05`, `R = 2.05`) so lamps sit flush with the new bumpers
- `src/components/sim/vehicle/Wheel.tsx` — swap silver multi-spoke rim look for modern gloss-black alloy (colors only; geometry radius/width unchanged)

**Untouched (hard constraint):** `Vehicle.tsx` physics loop, refs, `trackHalf=0.85`, `wheelBase=2.7`, `wheelR=0.36`, `chassisRestY=0.42`, suspension integrator, Ackermann steering, `SceneAdvancer`, `Cameras`, `Road`, `Environment`, `store`, all tests. All ref shapes (`chassis`, `flAssembly`, `frAssembly`, `wheels[]`) stay identical.

## Body rewrite approach

Replace box-primitive shell with curved primitives:

- **Lower body / rocker** — `RoundedBoxGeometry` (radius 0.08) 1.85 × 0.42 × 4.15 instead of hard box; slight bevel eliminates the blocky look while keeping the physics footprint.
- **Cabin / greenhouse** — single `ExtrudeGeometry` from a 2D side-profile spline (hood → windshield rake → roofline → rear glass → trunk), extruded across the car width with a beveled edge (bevelSize 0.04). Produces one continuous smooth silhouette instead of stacked boxes for hood/cabin/trunk/roof.
- **Fenders** — replaced with quarter-torus `TorusGeometry` segments over each wheel arch so wheels sit inside a true curved arch (fixes the "wheels intersect body" issue).
- **Bumpers** — `RoundedBoxGeometry` with sculpted lower intake using a smaller rounded inset; matte-black lower trim strip.
- **Grille** — recessed rounded rectangle (RoundedBox, matte black) instead of a plane; sits ~2cm behind bumper surface.
- **Headlights** — slim horizontal LED bars (RoundedBox 0.42 × 0.05 × 0.02) flanking the grille (matches reference).
- **Taillights** — full-width slim strip across trunk with a subtle center gap (two RoundedBoxes) matching reference.
- **Mirrors** — teardrop housing (`CapsuleGeometry`) on a short body-colored stem, glass insert.
- **Door handles** — flush pill (`CapsuleGeometry`, 0.12 long, body-colored) instead of chrome bars.
- **Roof sensor pod** (matches reference autonomous kit): small central LiDAR (`CylinderGeometry` + cap) plus 4 corner sensor cubes on the roof rack, matte black. Small camera nubs on mirror housings and one under the windshield.
- **Pillars & window trim** — glossy black `MeshPhysicalMaterial` following the greenhouse extrusion edges; single continuous DLO line.
- **Exhaust tips** — removed (electric sedan per reference).
- **Symmetry** — every offset mirrored on ±X programmatically (`[1,-1].map(sx => …)`) so left/right are guaranteed identical.

## Material updates

- `paintMat` default color set on caller side; reference teal `#1fb3a0` used as the vehicle default via `Vehicle color` prop pipeline. Bump `clearcoat` to 1, `clearcoatRoughness` 0.04 for a wet-gloss look.
- New `rimMat` variant: gloss-black alloy (color `#0f1114`, metalness 0.9, roughness 0.35, clearcoat 0.5).
- `glassMat`: darken tint slightly (`#0a0f16`, opacity 0.62) for the reference's privacy-tinted look.
- New `matteBlackMat` for grille / sensor housings / lower trim (roughness 0.85, metalness 0.1).

## Anchor / offset audit

All meshes re-anchored around the existing wheel positions:
- Front axle at `z = -1.35`, rear at `z = +1.35` — front overhang ends at `z ≈ -2.05`, rear at `z ≈ +2.05`.
- Wheel arch top at `y ≈ 0.55`, rocker bottom at `y ≈ 0.13` → wheels (radius 0.36) sit fully inside the arch with ~4cm clearance and never intersect the body.
- Cabin top at `y ≈ 1.12`, windshield rake ~28°, rear glass rake ~22° (matches reference proportions).

## Verification

Run the existing vitest regression suite (`tests/vehicle.regression.test.ts` + all 110 tests). None reference body geometry — all should stay green. Then Playwright screenshot the 3D playback (chase + side + front cameras via `CameraControls`) and inspect the captures to confirm:
1. No mesh intersection at any wheel
2. Symmetric L/R body panels
3. Continuous window line
4. Slim LED head/tail lamps visible
5. Roof sensor pod present
6. Canvas renders (no black screen / no WebGL context loss)

If a screenshot fails visual check, iterate on `Body.tsx` only before reporting done.
