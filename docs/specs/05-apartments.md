# 05 — Apartments (glass + on-demand interiors)

## Purpose

Vidro real, um room template InstancedMesh, `liveTarget`/Todos, cortinas e pacing de stream.

## Invariants / MUST / MUST NOT

- **MUST** janelas = vidro transparente real (não FakeInterior emissive).
- **MUST** um room template; slots via **InstancedMesh** (não Mesh clones); on-demand only.
- **MUST** `liveTarget` default `'all'` / **Todos** = `want = ranked.length` — stream upgrades shells to full open interiors (curtain snap-hide on ready).
- **MUST** every registered facade window slot **without** a ready/open interior show a **visible closed sheer curtain** (Fabric 203 shared InstancedMesh) outside the glass — including idle, waiting-in-pump, and heap-demoted slots. Never blank white/black holes.
- **MUST** stream pump (`throughValve` + yields) owns pacing — nunca for-loop sync no click.
- **MUST** `applyWindowGlass` (~0.09 **MeshBasic** shared) + `stripKitInteriorShell` antes de `mergeBuilding`.
- **MUST** slots pré-merge de `MI_FakeInterior*` → `userData.apartmentSlots`; opening faces local −Z.
- **MUST** cortinas fora do vidro (−Z); open/close via instance **scale** (0 = hidden) — nunca mutar opacity shared.
- **MUST** closed / curtain-only shells = shared InstancedMesh sheer (ShareTextures Fabric 203, CC0) **MeshBasic** with color+**alphaMap** only (no normal/rough — VRAM + light-loop) — translucency for light/silhouettes; one material for all instances.
- **MUST** shell intent live in `ApartmentDirector` (`_ensureFacadeShells` / `_stripToCurtainOnly`) — not scattered per-slot flags.
- **MUST** sem per-room `PointLight`; room + curtain + shared glass = **MeshBasic** (emissive folded into color / opacity glass) — never join Ultra-night street Spot/Point light loop; compile `pause: false`; warm room+curtain **uma vez**.
- **MUST** enquanto `isApartmentLiveIntentActive`: defer nature/water/carpet (prio ≥4).
- **MUST NOT** sync-slam N rooms no click; FPS HOLD; unique furniture por unit; dispose shared curtain geo/mat no teardown.
- Heap ≥0.6/≥0.72: demote farthest full interiors → **curtain-only** shells (keep sheer visible).

## Knobs

| Knob | Valor | Notas |
|------|-------|-------|
| `liveTarget` | `number` \| `'all'` (default) | HUD `#apts-budget` |
| Glass opacity | ~0.09 | Shared MeshBasic |
| Curtain | register/shell (closed) → loading (closed) → ready (snap-hide) → open; demote → closed shell | Scale only; Fabric 203 sheer MeshBasic (albedo+alphaMap only) |
| Marker | First Large auto-mark | ~80 m billboard, beacon Y=160; `autoLoad` default true |

API (`window.__cityApartments`): `registerFacade`, `setLiveCount`, `getLiveTarget`, `loadedCount`, `curtainOnlyCount`, `load`/`loadCount`/`unload`, `update(dt)`, `pickFacadeNear`.

HUD Interiores: `−` / input / `+` / **Todos** → nearest facade → `markFacadeHouse({ autoLoad: false })` → `setLiveCount`. Hidden em `boot-idle`.

## Ownership

`ApartmentDirector` (intent/stamp/pump/HUD) · `streamIntent` (defer prio ≥4) · apartment prep (glass/strip/slots/bake).

## Same-PR rule

Glass, InstancedMesh, liveTarget/Todos, cortinas, marker ou apartment stream ownership → este arquivo.

## Out of scope

Quality adapt / HOLD. Unique layouts. Drive-defer streets-only → `02`.
