# Source swap map — Downtown City MegaKit

Status of the Source pack in this repo. Clean glTFs live in
`public/models/downtown/Exports/glTF/` (not the Godot export — that splits
buildings into hundreds of `*-convcolonly` collision meshes).

| | Standard (Godot folder, roads) | Source (clean `Exports/glTF`) |
|---|---|---|
| Models | ~153 glTFs, 3 finished buildings | ~315 glTFs, 7 finished buildings |
| Used for | (leftover Godot folder only) | Streets, sidewalks, prefabs, bank, all street dressing |
| Shaders | None. Interiors were a grey `MI_FakeInterior` | Packed `T_lit_interior_*.png` + vertex-color wear |

Do **not** point `CityGrid` at Godot *building* prefabs.

---

## 1. The 7 city buildings — done

`src/world/buildings/catalog.js` loads the official Source prefabs, orients
them (facade at Z = 0, facing −Z), then `merge.js` bakes by material for
`CityBuildings` InstancedMesh. Roof sprites 1–7 still mark the types.

| Type # | Spec | File |
|---|---|---|
| 1 | Small_1 | `Building_Small_1.gltf` |
| 2 | Small_2 | `Building_Small_2.gltf` |
| 3 | Medium_1 | `Building_Medium_1.gltf` |
| 4 | Medium_2 | `Building_Medium_2.gltf` |
| 5 | Large_1 | `Building_Large_1.gltf` |
| 6 | Large_2 | `Building_Large_2.gltf` |
| 7 | Large_3 | `Building_Large_3.gltf` |

`src/world/buildings/kit.js` / `assemble.js` are unused leftovers from the
Standard kitbash.

---

## 2. Bank (TPA Savings) — done

`src/world/BankBuilding.js` is wired from `src/main.js`.
`CityBuildings` skips the south and west prefab faces of block `(0, 0)` so
they do not sit on top of the bank (west X = 9, south Z = 9).

| Piece | Source mesh |
|---|---|
| Shop windows | `Trim_FirstFloor_Window` + columns |
| 2nd floor, south | `Marble_WindowTriple` + `Prop_Ornament_1` |
| Awnings (south only) | `Prop_Awning` at Y = 0 (canopy is already at ~3 m) |
| Lettering | `Prop_Sign_Bank` (~12 m, on the south cornice) |
| Avenue portal | `Prop_EntranceArch` + `DoorFrame_Trim` + `Door_1` |
| Planters | `Prop_Planter_Single` + Nature `Plant_1` |

Extents stay `facadeX = 9`, `frontZ = 9`, `backZ = 33`, `backX = 25`.

There is no generic 3D alphabet in the pack. `Prop_Sign_Bank` is the bank
lettering, not a letter kit.

---

## 3. Window interiors — done (Three.js stand-in)

Source glTFs already name the material `MI_FakeInterior` / `MI_FakeInterior_*`
and the prefabs reference `T_lit_interior_1.png` / `T_lit_interior_2.png`
(copied next to the glTFs).

`src/world/buildings/interiors.js` paints that PNG onto modular windows that
ship without a map, then adds a little emissive. The Godot/Unity interior
shader is **not** ported.

---

## 4. Vertex-color wear — done (Three.js stand-in)

Downtown Source pieces and Nature foliage load with `{ keepVertexColors: true }`.
`merge.js` keeps `color` when every primitive in a material bucket has it, and
sets `material.vertexColors`. `CityGrid` now loads the same clean Source glTFs.

The real wear shader from the engine project is **not** ported.

---

## 5. Street props — done

`src/world/StreetFurniture.js` instances Source stairs + rails, shop kits
(Jade Garden, Bakery, Carmine’s, Deli/Pub, Hannigan, Mays, HW), branded
awnings, fire escapes, drains, bollards, AC units, manholes, planter rows,
column arch/trim, extra entrances, and the 2-/4-lane curve pieces on the
map edge.

Street lamp stays procedural — no lamp glTF in the pack.

---

## 6. Roads / corners — done

`CityGrid.js` loads Source `Exports/glTF` (asphalt, T, 4-way, sidewalks,
broken/inset tiles, bike lane, crosswalks, turn arrows, double yellow).
The 4×4 intersections stay T / 4-way so sidewalks keep matching. 2-lane
curves sit in the void just outside each map corner; extra 4-lane curves
sit further out so those meshes are in the scene.

---

## 7. Files you can ignore

- `src/world/Sidewalk.js`, `src/world/Avenue.js` — leftover; `main.js` uses `CityGrid.js` (paths already Source)
- Number sprites in `CityBuildings.js` / `Intersection.js` — debug, not kit
- Porsche / Nature trees — other packs
- Godot `Building_*` exports — collision-split; do not instance those
- Loose marble / white-brick / worn-brick *modules* — already inside the 7 official prefabs; not placed as extra kitbash walls

---

## Paths

- Game glTFs: `public/models/downtown/Exports/glTF/`
- Roads (Godot): `public/models/downtown/Exports/glTF (Godot)/`
- Zip (do not commit): `../quaternius/Downtown City MegaKit[Source].zip`
