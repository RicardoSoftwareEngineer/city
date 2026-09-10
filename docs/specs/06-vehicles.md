# 06 — Vehicles (hero HUD / A/B)

## Purpose

Contrato do **hero car no runtime**: integrate (scale/wheels), originals A/B no HUD, load times por carro. O **pipeline GLB** (triage → clean → decimate → bake → compress → quality gate) e os budgets por perfil vivem em **`08-glb-import.md`**.

## Pitch

Hero car dirigível leve o bastante para não hitchar, bonito o bastante a 10–30 m. Budgets: perfil **`vehicle-hero`** em **08** (banda ~50–120k, default ~90k). NPC: perfil **`vehicle-npc`** (08).

## Pipeline pointer (MUST)

- Core + profiles: **`08-glb-import.md`**.
- `vehicle-hero` = antigo “car pipeline” deste arquivo — **não** duplicar novel aqui.
- Script: `node scripts/optimize-glb.mjs --profile vehicle-hero …`  
  Wrapper legado: `node scripts/optimize-car-glb.mjs …` (chama o mesmo perfil).

## Integrate (MUST)

- Scale `PORSCHE_TARGET_LENGTH`, floor wheels, wheel discovery, HUD mode.
- Quality gate visual 10–30 m; tris/mats metas = **08** (`vehicle-hero`).

## Originals + A/B (MUST)

- Regra keep-original sob `public/models/`: **08**. Runtime:
  - HUD ciclo visual (PT): **Porsche → Mercedes (otimizada) → Mercedes (high-poly) → Defender → quadrado**.
  - Modos glTF: `mercedes` → `/models/mercedes/mercedes.glb`; `mercedesOriginal` → `/models/mercedes/mercedes.original.glb`.
  - Botão **Comparar A/B**: com modo `mercedes` (ou orig) ativo, toggle `compareAb` mostra o outro chassis offset **+3 m** no X local (ghost lado a lado). Dirigir usa o modo selecionado; free-flight + toggle também serve para comparar.

## Load times HUD (MUST)

- Por id glTF: medir **fetchMs**, **parseMs** (parse→setup), **totalMs**, **bytes** (arrayBuffer).
- `PorscheModel.getLoadStats()` → `[{ id, label, fetchMs, parseMs, totalMs, bytes, tris? }]`.
- HUD PT compacto **Load carros** atualiza ao completar loads. Defender/box = N/A / instantâneo.
- Porsche: load no boot (após first ring). Mercedes otimizada + high-poly (pré-pipeline): **preload** fire-and-forget após porsche; `paintCarLoadHud` ao completar cada uma. Lazy `ensureVisualMode` permanece se o preload ainda não acabou.
- **Load carros** lista otimizada + original (high-poly pré-pipeline) para carros do pipeline — fetch/parse/total/bytes/tris assim que carregados.
- Linhas do **Load carros** selecionam o visual (`ensureVisualMode`); chrome `#car-visual-hud` (`data-min-id="car-visual"`, drag sem collapse) é arrastável e persiste em `city-hud-panels-v1`.

## Ownership

HUD A/B / load times / integrate hero: este arquivo. Optimize core / profiles / keep-original file rule: **08**. Loader: `src/vehicle/PorscheModel.js`.

## Same-PR rule

Mudança de HUD A/B, load times ou integrate hero → este arquivo. Mudança de banda/CLI/profiles → **08** (+ index).

## Out of scope

Hitch war drive, furniture, wall textures, plaza A/B de estudo (ver **08** out of scope).
