# 05 — Apartments (glass + on-demand interiors)

## Contract

- Downtown MegaKit windows are **real transparent glass** (not FakeInterior emissive textures).
- One reusable **apartment room template**; instances are posed behind window slots.
- Interiors are **on-demand only**. Buildings do not preload all apartments.
- Budget: at most **`MAX_LOADED`** apartments in the scene at once (default 8). Further loads unload oldest first, or no-op until unload.

## Slots

- Extracted **before** `mergeBuilding` from `MI_FakeInterior*` triangle centroids, clustered into window-sized slots.
- Stored on the merged template as `userData.apartmentSlots` (local space of the prepared template).
- Curtains + room meshes are **scene overlays** (not InstancedMesh), posed `slotLocal → building world`.

## Command API (`ApartmentDirector`)

| Call | Effect |
|------|--------|
| `registerFacade(id, { slots, pose, parent })` | Remember a revealed building placement |
| `load(facadeId, slotIds)` | Load one or more apartments on that facade |
| `loadCount(facadeId, n)` | Load `n` more idle slots on that facade |
| `unload(facadeId?, slotIds?)` | Remove interiors + curtains |
| `update(dt)` | Animate curtain open |

## Curtain states (per apartment)

`idle` → `loading` (curtain **closed**) → `ready` (interior in scene, optional `compileAsync`) → `open` (curtain animates open).

Curtain opens **only** after the interior is added and warmed. No FPS adapt.

## Out of scope

- Per-frame quality adapt / HOLD for apartments.
- Unique furniture per unit (one shared template is enough).
