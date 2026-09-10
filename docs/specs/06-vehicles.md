# 06 — Vehicles (hero GLB pipeline)

## Purpose

Contrato do **pipeline oficial** de carros high-poly → runtime: triage → clean → decimate → bake → compress → integrate → quality gate. Originals sempre preservados para A/B. Load times por carro no HUD.

## Pitch

Hero car dirigível leve o bastante para não hitchar, bonito o bastante a 10–30 m. Equilíbrio: começa optimize em **~80–100k** tris; se suave demais → sobe até **~120k**; se hitchy → desce até **~50k**. NPC later: **8k–25k** (fora deste PR).

## Pipeline (MUST)

0. **Triage** — contar tris / meshes / materials / bytes.
   - ≤~150k tris + texturas razoáveis → integrar só com scale/wheels (ainda pode compress + keep original).
   - >~200k ou muitos materiais → pipeline completo.
1. **Clean** — strip cameras/lights/extras; weld; drop morph/skin/anim não usados.
2. **Decimate** — hero **50k–120k** tris; preferir simplify que preserve silhueta. Se já abaixo da banda, **não** forçar down.
3. **Bake materials** — colapsar a ~1–3 materiais; atlas **albedo** 1K–2K (MeshBasic world — PBR pesado só se preciso). **v1 script:** weld/dedup/prune/simplify/meshopt + `palette`/`metalRough` se disponível; **TODO Blender** quando bake/atlas completo não automatiza.
4. **Delivery compress** — meshopt (Draco opcional); texturas modestas (resize ≤2K).
5. **Integrate** — scale `PORSCHE_TARGET_LENGTH`, floor wheels, wheel discovery, HUD mode.
6. **Quality gate** — tris na banda (ou honestamente abaixo sem soft), ≤~3 hot materials (ou TODO bake), load OK, silhueta 10–30 m.

## Originals + A/B (MUST)

- Ao otimizar sob `public/models/<car>/`: **sempre** guardar original em `<car>.original.glb` (nunca sobrescrever se já existir). Default driven asset = otimizado (`<car>.glb`).
- HUD ciclo visual (PT): **Porsche → Mercedes → Mercedes (orig) → Defender → quadrado**.
- Modos glTF: `mercedes` → `/models/mercedes/mercedes.glb`; `mercedesOriginal` → `/models/mercedes/mercedes.original.glb`.
- Botão **Comparar A/B**: com modo `mercedes` (ou orig) ativo, toggle `compareAb` mostra o outro chassis offset **+3 m** no X local (ghost lado a lado). Dirigir usa o modo selecionado; free-flight + toggle também serve para comparar.

## Load times HUD (MUST)

- Por id glTF: medir **fetchMs**, **parseMs** (parse→setup), **totalMs**, **bytes** (arrayBuffer).
- `PorscheModel.getLoadStats()` → `[{ id, label, fetchMs, parseMs, totalMs, bytes, tris? }]`.
- HUD PT compacto **Load carros** atualiza ao completar loads. Defender/box = N/A / instantâneo.
- Porsche: load no boot (após first ring). Mercedes / orig: **lazy** no primeiro switch do HUD.

## Script

`node scripts/optimize-car-glb.mjs --in path.glb --out path.glb [--target-tris 90000] [--report] [--keep-original]`

`--keep-original` default **true** sob `public/models/…`. Não exige Blender para v1.

## Ownership

Pipeline / A/B / load HUD: este arquivo. Ciclo HUD labels também em `01-product.md`. Loader: `src/vehicle/PorscheModel.js`.

## Same-PR rule

Mudança de pipeline, originals, A/B ou contrato de load times → este arquivo (+ index README).

## Out of scope

Hitch war drive, furniture, wall textures, NPC traffic LOD além dos targets documentados.
