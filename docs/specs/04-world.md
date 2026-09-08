# 04 — World

## Purpose

Fence, orchard heightmap, biomes, vista tiles e downtown paved.

## Invariants / MUST / MUST NOT

- **MUST** cerca √10 vs legado (±560 m) → `GROUND_BODY_HALF ≈ 1770` m; `WORLD_LINEAR_SCALE = √10`.
- **MUST** orchard = elevação só; biomes cuidam tint/veg.
- **MUST** paved (`CITY_PAVED_MIN`…`MAX`) **inalterada** — MegaKit não vira grama.
- **MUST** strip `COLOR_0` vermelho no chão paved + prédios (`groundOpts` / `sidewalkOpts` / `castOpts` / `noCastOpts`); `foliageOpts` mantém VC.
- **MUST** calçada: só lajes cheias (`straight` / `broken*`).
- **MUST NOT** `Sidewalk_*_Stripe` nem `Inset_*` como tile.
- Vista: terreno grosso até a cerca (`TERRAIN_VISTA_RADIUS`); heap pode pausar novos tiles.

## Knobs

| Knob | Valor |
|------|-------|
| Fence / body half | √10 / ≈1770 m |
| Biome linear scale | √10 (cidade 4×4 na origem) |
| Paved | `CITY_PAVED_*` — terrain enterra; phys = box + pin campo |

## Ownership

World modules (biomes, terrain, city ground). Apartments → `05`.
Sky / sun / moon / stars → `DayNightController` (product note in `01`; not a hitch knob). Ultra daytime shadows: light along `sunDir` at `LIGHT_DISTANCE` (not sky distance) so asphalt/sidewalk stay inside the ortho frustum.

## Same-PR rule

Fence, paved, sidewalk tiles, biome scale ou vista radius → este arquivo.

## Out of scope

Loading/budgets → `02`/`03`. Glass/interiors → `05`.
