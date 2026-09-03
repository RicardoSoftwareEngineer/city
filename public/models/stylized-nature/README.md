# Stylized Nature MegaKit — shortlist (Passo 10)

Official Quaternius **Stylized Nature MegaKit [Source]** glTFs used by the open-terrain Witcher pass.

## Layout

```
public/models/stylized-nature/Exports/glTF/   # ≤15 glTF + bins + textures they reference
```

Do **not** commit `Engine Projects/`, Godot shaders, or the full Source zip.

## Shortlist (15 glTF)

| # | File | Role |
|---|---|---|
| 1 | `Grass_Wide_Tall.gltf` | dense carpet |
| 2 | `Grass_Wide_Short.gltf` | low carpet |
| 3 | `Grass_Wheat.gltf` | height variety |
| 4 | `Flower_1_Group.gltf` | color A |
| 5 | `Flower_2_Group.gltf` | color B |
| 6 | `Flower_7_Group.gltf` | tall spikes |
| 7 | `Bush_Large_Flowers.gltf` | mid layer |
| 8 | `Bush_Long_1.gltf` | path edge / vale |
| 9 | `TallThick_1.gltf` | canopy tree |
| 10 | `TallThick_2.gltf` | canopy variant |
| 11 | `Birch_1.gltf` | light grove |
| 12 | `CherryBlossom_1.gltf` | orchard accent |
| 13 | `GiantPine_1.gltf` | horizon / LOD far |
| 14 | `Plant_5.gltf` | vertical plant |
| 15 | `Rock_Big_1.gltf` | outcrop |

## Textures (not counted in the 15)

Leaves_*, Bark_*, Grass.png, Flowers.png, Noise_Wind.png, Noise_Perlin.png,
PathRocks_Diffuse.png, Rocks_Diffuse.png, and normals as referenced by the glTFs.

## Fallbacks

If a shortlist file is missing at runtime, `src/world/terrain/kitUrls.js` maps to
existing `/models/nature/` equivalents so the game still builds (see SOURCE_SWAP.md).
