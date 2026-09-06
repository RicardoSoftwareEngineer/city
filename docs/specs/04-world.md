# 04 — World

## Fence / escala

- Cerca do campo: **√10** em área vs mapa legado (±560 m) → `GROUND_BODY_HALF ≈ 1770` m.
- `WORLD_LINEAR_SCALE = √10` para centros/raios de bioma.

## Orchard heightmap

- White Orchard: **elevação só** (heightfield / mesh Y).
- Não redefine regras de vegetação por si — biomes cuidam de tint/veg.

## Biomes

- Tint de terreno + densidade/tipo de vegetação por campo suave.
- Escala linear √10; cidade 4×4 perto da origem.

## Vista tiles

- Terreno grosso pode preencher até a cerca (`TERRAIN_VISTA_RADIUS` / `allowsTerrainAt`) mesmo com R de Guardian menor.
- Heap ainda pode pausar novos tiles de vista.

## Cidade paved

- Retângulo paved (`CITY_PAVED_MIN`…`CITY_PAVED_MAX`) **inalterado**: asfalto/MegaKit não “viram grama”.
- Terrain enterra sob a paved; phys da cidade usa box plana + pin no campo.
