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

- **Chão pavimentado:** sem `COLOR_0` do MegaKit (meio-fio vermelho US em calçada **e** rua). `groundOpts()` / `sidewalkOpts()` strips vertex colors.

- **Chão pavimentado + prédios downtown:** sem `COLOR_0` vermelho do MegaKit (`groundOpts` / `castOpts` / `noCastOpts`). Natureza (`foliageOpts`) mantém VC.
- **Calçada:** só lajes cheias (`straight` / `broken*`). Nunca `Sidewalk_*_Stripe` nem `Inset_*` como tile — stripe é decal fino e inset abre buraco.

## Apartments

- Vidro real + interiores sob demanda + cortinas: ver [05-apartments.md](./05-apartments.md).
