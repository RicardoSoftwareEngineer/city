# 08 — GLB import (hybrid core + profiles)

## Purpose

Contrato do **pipeline híbrido** de import/otimização de GLB: um núcleo compartilhado + perfis por categoria (`vehicle-hero`, `vehicle-npc`, `building`, `interior-prop`, opcional `prop-street`). Originals sempre preservados. FPS study: **Windows PC do Ricardo é a régua** (≥30 FPS sólido); box/VM não aceita como barra.

## Pitch

Um script, vários budgets. Hero car, NPC, prédio de estudo e prop de interior compartilham triage → clean → decimate → bake → compress → quality gate; só mudam as metas do perfil. Dual study **A/B original vs otimizado** vive na **showroom in-city** (`src/world/optStudyPlaza.js`) — **inventário completo (33 pads)**, um slot por GLB único.

## Core pipeline (MUST)

0. **Triage** — contar tris / meshes / materials / bytes. Limiares light vs full dependem do perfil (ver tabela).
1. **Clean** — `metalRough`, weld, dedup, prune (keep attributes; drop leaves mortas).
2. **Decimate** — simplify (meshopt) até `--target-tris` (default do perfil). Se já ≤ target, **não** forçar down; raising tris não é automatizado.
3. **Bake materials** — `palette` / cleanup; meta ≤~N hot mats por perfil. **TODO Blender** quando atlas albedo completo não automatiza (script nunca falha por falta de Blender).
4. **Compress** — texture resize (sharp, se disponível) ao tamanho preferido do perfil (≤ `textureMax`); meshopt medium no write.
5. **Integrate notes** — paths sob `public/models/…`; scale/wheels/HUD = ownership do domínio (ex.: veículos em `06-vehicles.md`).
6. **Quality gate** — tris na banda (ou honestamente abaixo sem soft), mats ≤ goal (ou TODO bake), silhueta ok na distância típica do perfil.

### Draco GLBs (MUST)

Alguns loose GLBs usam `KHR_draco_mesh_compression`. O core registra `draco3dgltf` decoder/encoder via `NodeIO.registerDependencies` (devDep `draco3dgltf`). Sem isso, `io.read` falha com `DT_FLOAT32`.

### Quaternius empty-image repair (MUST)

Alguns packs Quaternius listam `images[]` com `mimeType` mas **sem** `bufferView`/`uri`. `NodeIO` falha com `"Missing resource URI or buffer view"`. O core **strip** essas images + textures órfãs e remapeia materiais **antes** do optimize (temp copy; source original intacto).

### Batch / auto-profile

```bash
# single
node scripts/optimize-glb.mjs --in path.glb --out path.glb \
  --profile vehicle-hero|vehicle-npc|building|interior-prop|prop-street \
  [--target-tris N] [--report] [--keep-original|--no-keep-original]

# batch folder
node scripts/optimize-glb.mjs --in-dir dir [--out-dir dir] \
  [--profile ID | --auto-profile] [--report]

# study inventory → public/models/opt-study/<id>/
node scripts/import-opt-study.mjs [--inventory path] [--only id] [--force]
```

`--auto-profile` escolhe perfil por heurística de nome/tamanho (carros → vehicle-*; casas/apts → building; mobília → interior-prop/prop-street). Preferir perfil explícito no inventário da study.

Arquivos ≥ **100 MB** (limite duro GitHub): otimizar primeiro; **não** commitar blob que exceda o limite; reportar skipped. Nunca force-push.

## Profile targets (MUST)

| Profile | Tris band | Default `--target-tris` | Texture max | Preferred | Materials goal |
|---------|-----------|-------------------------|-------------|-----------|----------------|
| `vehicle-hero` | 50k–120k | ~90k | ≤2K | 2K | ≤~3 |
| `vehicle-npc` | 8k–25k | ~15k | ≤2K | **1K** | ≤~3 |
| `building` | 20k–80k | ~40k (study props) | ≤2K | 2K | ≤~4 |
| `interior-prop` | 5k–30k | ~15k | ≤2K | **1K** | ≤~3 |
| `prop-street` (opt.) | 2k–20k | ~8k | ≤2K | **1K** | ≤~3 |

`building`: hero facade vs distant pode subir/descer dentro da banda via `--target-tris`.

## Originals + A/B showroom (MUST)

- Ao escrever sob `public/models/`: **sempre** guardar `<stem>.original.glb` se ainda não existir (`--keep-original` default **true**). Nunca sobrescrever original existente.
- Default driven/runtime asset = otimizado (`*.glb`). A/B UI e load-times HUD de carros: **`06-vehicles.md`**.
- **Showroom completo (33 pads):** `public/models/opt-study/<id>/model.glb` + `model.original.glb` (+ `preview.jpg` opcional).
  - Layout: seções PT (Carros, Caminhões / utilitários, Casas, Apartamentos / prédios, Props…).
  - Cada pad: **original à esquerda / otimizado à direita (~5 m)** com labels PT.
  - Spawn lazy em `optStudyPlaza.js` (grama leste do staging apt / Large_3, ~x=248).
  - Debug: `window.__cityOptStudy` → `howToFind`, `howToVisit(id)`, `pads[]`, `inventory`, `visitAll()`.
  - MeshBasic **mantém maps** (não strip texturas) para prova visual / screenshots por pad.
- Inventário study (fonte Windows):

`C:\Users\ricei\OneDrive\Documents\Easyplay\repositorios\quaternius\estudo sobre otimização`

(33 GLBs únicos; skip `*(1).glb` duplicata.)

## FPS study law (MUST)

- **Régua:** PC Windows do Ricardo (DESKTOP-PVUSTUO / RX 580 / 32 GB) — **≥30 FPS sólido** no cenário de estudo.
- Box/VM é mais fraco — **MUST NOT** usar FPS do box como accept bar.
- Load time maior é **OK** se o frame steady-state passa no Windows.
- Validação Windows desta study: ver também nota em `03-performance.md`. **Régua FPS ≥30 sólido só no PC Windows do Ricardo** — a showroom no box é para julgar qualidade visual A/B e screenshots por pad, **não** para aceitar FPS.
- **Não declarar pass de FPS neste PR** — Ricardo valida no Windows depois.

## Script

`scripts/optimize-car-glb.mjs` = **thin wrapper** que chama o core com `--profile vehicle-hero` (mesmos flags de antes, sem `--profile`).

`scripts/import-opt-study.mjs` = importa o inventário completo para `public/models/opt-study/`.

## Pointer → vehicles

- Perfil **`vehicle-hero`** = antigo pipeline de carro em `06-vehicles.md` (não duplicar o novel aqui).
- Em `06`: HUD A/B, load times, ciclo visual, integrate (scale/wheels). Aqui: budgets + core + demais categorias.

## Study assets (A/B showroom)

Paths: `public/models/opt-study/<id>/` · ids estáveis `pack_XXXX` / `loose_<hash6>`.

| Seção | Contagem | Exemplos |
|-------|----------|----------|
| Carros | 14 | viatura, monster truck, Alfa, BMW M3, Lambo, GT-R, Mustang… |
| Caminhões / utilitários | 7 | caminhão corrida, MAZ, ônibus, APC, Jeep, locomotiva… |
| Casas | 4 | casa moderna, madeira, módulos |
| Apartamentos / prédios | 3 | apt corpo, lajes, estrutura grande |
| Props / interiores / outros | 5 | quarto neon, sofá, mobília, banheiro, aeronave |
| **Total** | **33** | um pad A/B por GLB |

**Como achar in-game:** leste do staging apt / `Large_3@171,30` — voar/dirigir para ~`x=248`, `z=6…` (grama). Seções em fileiras; aisles claros. Labels PT: **original** à esquerda, **otimizado** à direita (~5 m).

`window.__cityOptStudy.howToVisit('pack_FG5K')` / `.visitAll()` para roteiro de screenshots (1 por pad).

## Ownership

Core / profiles / keep-original / FPS study law / showroom A/B study: este arquivo. Hero HUD / A/B car: `06-vehicles.md`. Ship bar geral: `03-performance.md`. Showroom code: `src/world/optStudyPlaza.js`.

## Same-PR rule

Novo perfil, mudança de banda/default, CLI do core, ou regra de originals → este arquivo (+ index README). Mudança só de HUD carro → `06`.

## Out of scope

- Declarar FPS pass (≥30) sem drive no **Windows** do Ricardo
- Aceitar FPS medido na box/VM
- Copiar para OneDrive city-passo1 (Vite pós-merge = parent)
