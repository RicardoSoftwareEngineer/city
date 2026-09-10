# 08 — GLB import (hybrid core + profiles)

## Purpose

Contrato do **pipeline híbrido** de import/otimização de GLB: um núcleo compartilhado + perfis por categoria (`vehicle-hero`, `vehicle-npc`, `building`, `interior-prop`, opcional `prop-street`). Originals sempre preservados. FPS study: **Windows PC do Ricardo é a régua** (≥30 FPS sólido); box/VM não aceita como barra.

## Pitch

Um script, vários budgets. Hero car, NPC, prédio de estudo e prop de interior compartilham triage → clean → decimate → bake → compress → quality gate; só mudam as metas do perfil. Dual study (A/B original vs otimizado + plaza) é **próximo PR** — aqui só o core + contrato.

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
- Estudo completo original vs otimizado na cidade (plaza + inventário quaternius): **fora deste PR**.

## FPS study law (MUST)

- **Régua:** PC Windows do Ricardo (DESKTOP-PVUSTUO / RX 580 / 32 GB) — **≥30 FPS sólido** no cenário de estudo.
- Box/VM é mais fraco — **MUST NOT** usar FPS do box como accept bar.
- Load time maior é **OK** se o frame steady-state passa no Windows.
- Validação Windows desta study: ver também nota em `03-performance.md`. Inventário completo + plaza A/B = próximo PR.

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

## Study assets (inventory next PR)

Pasta Windows (não copiar OneDrive neste PR):

`C:\Users\ricei\OneDrive\Documents\Easyplay\repositorios\quaternius\estudo sobre otimização`

(~14 `.glb` soltos ~217 MB + ~20 `*_glb.zip` ~257 MB). Sample pequeno ok se já estiver no box; inventário + plaza = follow-up.

## Ownership

Core / profiles / keep-original / FPS study law: este arquivo. Hero HUD / A/B car: `06-vehicles.md`. Ship bar geral: `03-performance.md`.

## Same-PR rule

Novo perfil, mudança de banda/default, CLI do core, ou regra de originals → este arquivo (+ index README). Mudança só de HUD carro → `06`.

## Out of scope (este PR)

- Plaza A/B completa com todos os assets de estudo
- Unzip dos 20 zips no jogo
- Declarar FPS pass sem drive no Windows
