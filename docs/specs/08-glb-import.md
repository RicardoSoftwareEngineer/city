# 08 — GLB import (hybrid core + profiles)

## Purpose

Contrato do **pipeline híbrido** de import/otimização de GLB: um núcleo compartilhado + perfis por categoria (`vehicle-hero`, `vehicle-npc`, `building`, `interior-prop`, opcional `prop-street`). Originals sempre preservados. FPS study: **Windows PC do Ricardo é a régua** (≥30 FPS sólido); box/VM não aceita como barra.

## Pitch

Um script, vários budgets. Hero car, NPC, prédio de estudo e prop de interior compartilham triage → clean → decimate → bake → compress → quality gate; só mudam as metas do perfil. Dual study **A/B original vs otimizado** vive na **plaza in-city** (`src/world/optStudyPlaza.js`) — amostra curada, não o inventário completo.

## Core pipeline (MUST)

0. **Triage** — contar tris / meshes / materials / bytes. Limiares light vs full dependem do perfil (ver tabela).
1. **Clean** — `metalRough`, weld, dedup, prune (keep attributes; drop leaves mortas).
2. **Decimate** — simplify (meshopt) até `--target-tris` (default do perfil). Se já ≤ target, **não** forçar down; raising tris não é automatizado.
3. **Bake materials** — `palette` / cleanup; meta ≤~N hot mats por perfil. **TODO Blender** quando atlas albedo completo não automatiza (script nunca falha por falta de Blender).
4. **Compress** — texture resize (sharp, se disponível) ao tamanho preferido do perfil (≤ `textureMax`); meshopt medium no write.
5. **Integrate notes** — paths sob `public/models/…`; scale/wheels/HUD = ownership do domínio (ex.: veículos em `06-vehicles.md`).
6. **Quality gate** — tris na banda (ou honestamente abaixo sem soft), mats ≤ goal (ou TODO bake), silhueta ok na distância típica do perfil.

## Profile targets (MUST)

| Profile | Tris band | Default `--target-tris` | Texture max | Preferred | Materials goal |
|---------|-----------|-------------------------|-------------|-----------|----------------|
| `vehicle-hero` | 50k–120k | ~90k | ≤2K | 2K | ≤~3 |
| `vehicle-npc` | 8k–25k | ~15k | ≤2K | **1K** | ≤~3 |
| `building` | 20k–80k | ~40k (study props) | ≤2K | 2K | ≤~4 |
| `interior-prop` | 5k–30k | ~15k | ≤2K | **1K** | ≤~3 |
| `prop-street` (opt.) | 2k–20k | ~8k | ≤2K | **1K** | ≤~3 |

`building`: hero facade vs distant pode subir/descer dentro da banda via `--target-tris`.

## Originals + A/B (MUST)

- Ao escrever sob `public/models/`: **sempre** guardar `<stem>.original.glb` se ainda não existir (`--keep-original` default **true**). Nunca sobrescrever original existente.
- Default driven/runtime asset = otimizado (`*.glb`). A/B UI e load-times HUD de carros: **`06-vehicles.md`**.
- Plaza A/B in-city (amostra curada): `public/models/opt-study/<id>/model.glb` + `model.original.glb`; spawn lazy em `optStudyPlaza.js` (grama leste do staging apt / Large_3, ~x=248). Debug: `window.__cityOptStudy`.
- Inventário Quaternius completo (~80 MB+ restante): **fora** — só packs leves da amostra neste PR.

## FPS study law (MUST)

- **Régua:** PC Windows do Ricardo (DESKTOP-PVUSTUO / RX 580 / 32 GB) — **≥30 FPS sólido** no cenário de estudo.
- Box/VM é mais fraco — **MUST NOT** usar FPS do box como accept bar.
- Load time maior é **OK** se o frame steady-state passa no Windows.
- Validação Windows desta study: ver também nota em `03-performance.md`. **Régua FPS ≥30 sólido só no PC Windows do Ricardo** — a plaza no box é para julgar qualidade visual A/B, não para aceitar FPS.
- Inventário Quaternius restante (zips / 80 MB+) = follow-up; não declarar pass de FPS neste PR.

## Script

```bash
node scripts/optimize-glb.mjs --in path.glb --out path.glb \
  --profile vehicle-hero|vehicle-npc|building|interior-prop|prop-street \
  [--target-tris N] [--report] [--keep-original|--no-keep-original]
```

`scripts/optimize-car-glb.mjs` = **thin wrapper** que chama o core com `--profile vehicle-hero` (mesmos flags de antes, sem `--profile`).

## Pointer → vehicles

- Perfil **`vehicle-hero`** = antigo pipeline de carro em `06-vehicles.md` (não duplicar o novel aqui).
- Em `06`: HUD A/B, load times, ciclo visual, integrate (scale/wheels). Aqui: budgets + core + demais categorias.

## Study assets (A/B plaza)

Amostra curada sob `public/models/opt-study/` (source no box `/workspace/uploads/opt-study/*/source.glb`):

| id | nota | profile | antes (tris / MB) | depois (tris / MB) |
|----|------|---------|-------------------|--------------------|
| `pack_8XGZ` | viatura policial | `vehicle-npc` | 4250 / 0.49 | 4250 / 0.19 |
| `pack_0BMQ` | monster truck vermelho | `vehicle-hero` | 15183 / 1.73 | 15183 / 0.61 |
| `pack_WHTC` | pickup / camper | `vehicle-hero` | 14233 / 1.73 | 14233 / 0.77 |
| `pack_AS5Q` | Alfa 4C branca | `vehicle-hero` | 32651 / 8.45 | 32651 / 1.74 |
| `pack_FG5K` | BMW M3 cinza | `vehicle-hero` | 27946 / 9.68 | 27930 / 2.02 |

**Como achar in-game:** leste do staging apt / `Large_3@171,30` — voar/dirigir para ~`x=248`, `z=6…50` (grama). Labels PT: original à esquerda, otimizado à direita (~5 m).

Pasta Windows (não copiar OneDrive neste PR; restante ~80 MB+ / zips = follow-up):

`C:\Users\ricei\OneDrive\Documents\Easyplay\repositorios\quaternius\estudo sobre otimização`

Nota: alguns packs Quaternius trazem `images[]` sem `bufferView`/`uri` — strip antes do `optimize-glb` (NodeIO falha com "Missing resource URI or buffer view").

## Ownership

Core / profiles / keep-original / FPS study law / plaza A/B study: este arquivo. Hero HUD / A/B car: `06-vehicles.md`. Ship bar geral: `03-performance.md`. Plaza code: `src/world/optStudyPlaza.js`.

## Same-PR rule

Novo perfil, mudança de banda/default, CLI do core, ou regra de originals → este arquivo (+ index README). Mudança só de HUD carro → `06`.

## Out of scope

- Inventário completo / unzip dos 20 zips / GLBs ~80 MB+ restantes no jogo
- Declarar FPS pass (≥30) sem drive no **Windows** do Ricardo
- Aceitar FPS medido na box/VM
