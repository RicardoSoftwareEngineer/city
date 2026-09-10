# Mercedes GLB (hero car visual)

- **Default (optimized):** `mercedes.glb` (~1.9 MB after pipeline — meshopt + ≤2K textures; ~33k tris)
- **Original (A/B):** `mercedes.original.glb` (~8.4 MB pre-optimize) — never overwrite once saved
- Provenance: **user-provided asset** (Sketchfab-style download; exact listing/license unknown at import time).
- Do **not** treat this as a verified Creative Commons or commercial license — confirm rights before redistribution beyond this private project.
- Runtime: `/models/mercedes/mercedes.glb` (default) and `/models/mercedes/mercedes.original.glb`
- Pipeline: `docs/specs/06-vehicles.md` + `scripts/optimize-car-glb.mjs`
- HUD: Mercedes / Mercedes (orig) + Comparar A/B (`PorscheModel`)

Meshes are unnamed; materials include `CAR_BODY_PAINT`, `TARMAC_TYRE_*`, `DISCS`, etc. Wheel spin/steer uses material-based merged-mesh clustering.
