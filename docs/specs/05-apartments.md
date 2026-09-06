# 05 — Apartments (glass + on-demand interiors)

## Contract

- Downtown MegaKit windows are **real transparent glass** (not FakeInterior emissive textures).
- **Um template; todas as janelas são slots; no máx. 3 renderizados por vez (budget).**
- One reusable **apartment room template**; every window slot *can* use that same template (cloned).
- Interiors are **on-demand only**. Buildings do not preload all apartments.
- Budget: at most **`MAX_LOADED`** apartments in the scene at once (default **3**). Further loads unload oldest first (`_ensureBudget`), or the HUD unloads the target facade before `loadCount(facadeId, 3)`.

## Glass + kit shell

- `applyWindowGlass` replaces `MI_FakeInterior*` / `MI_Glass` with shared transparent glass (opacity ~0.22).
- `stripKitInteriorShell` removes meshes whose materials are `MI_InteriorWall` / `MI_InteriorFloor` **before** `mergeBuilding`, so clear glass shows our room — not the dark MegaKit shell.
- On merge, transparent materials get `castShadow: false`.

## Slots

- Extracted **before** `mergeBuilding` from `MI_FakeInterior*` triangle centroids, clustered into window-sized slots.
- Stored on the merged template as `userData.apartmentSlots` (local space of the prepared template).
- Curtains + room meshes are **scene overlays** (not InstancedMesh), posed `slotLocal → building world`.

## Command API (`ApartmentDirector`)

Exposed as `window.__cityApartments` (`maxLoaded` default 3).

| Call | Effect |
|------|--------|
| `registerFacade(id, { slots, pose, parent })` | Remember a revealed building placement |
| `load(facadeId, slotIds)` | Load one or more apartments on that facade |
| `loadCount(facadeId, n)` | Load `n` more idle slots on that facade |
| `unload(facadeId?, slotIds?)` | Remove interiors + curtains |
| `update(dt)` | Animate curtain open |
| `pickFacadeNear(x, z)` | Nearest registered facade to planar point |

## HUD (`Apts 3`)

- Click: nearest facade (free-fly camera if active, else car) → **unload that facade’s units** → `loadCount(facadeId, 3)`.
- Label shows how many apartments are currently loaded (`Apts N`).

## Curtain states (per apartment)

`idle` → `loading` (curtain **closed**) → `ready` (interior in scene, optional `compileAsync`) → `open` (curtain animates open).

Curtain opens **only** after the interior is added and warmed. No FPS adapt.

## Out of scope

- Per-frame quality adapt / HOLD for apartments.
- Unique furniture per unit (one shared template is enough).
- Loading interiors for every window at once.

## Marker

- After **Apts 3**, a **🏠** billboard sits above the active facade so the player can confirm which building received the interiors.
