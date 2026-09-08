# 02 — Loading (contract)

Market-style open-world load. Fixed Ultra/Simples knobs. **No FPS-driven throttle / HOLD.**

## Product law (play)

- **Stable FPS > high FPS.** Only raise FPS targets when already stable.
- Near-term play goal: **fully load one focus/load tile → drive the car into the next tile at ≥30 FPS with no Hitches** (no multi-100ms / multi-second freezes; ideally frames ≤~33ms while streaming the next cell).
- **Drive smoothness is first-class:** while the car is **moving**, display frames must stay stable (~≥30 FPS, no multi-100ms / multi-second Hitches). Filling furniture / nature / carpet is **secondary** to a lovely drive.
- Conscious, sustainable, **simple** code; MemoryGuardian-friendly; may use GPU memory / GPU time aggressively if it keeps the **CPU main/display frame stable**.
- Allowed levers: smaller residency circle, **lightweight placeholder before real texture**, predicted warm of next cell, hard stream leftover budget, **drive-moving defer of prio ≥1 + terrainMesh / nature glTF** — **not** FPS HOLD / adaptive pauseDraw valve.

## Idle

Before *Começar a carregar*:

- **Mínimo phys** sob o spawn (`PHYS_PIN` / Heightfield pin)
- **Shell** jogável (chão boot + carro placeholder + GameLoop)
- Sem stream de cidade / campo

## On Começar

- Stream **ao redor do jogador** (e foco previsto — ver abaixo)
- Sem exigir black screen / tela de loading bloqueante
- Ordem de prioridade (core):

  1. **phys** (sempre sob o carro real)
  2. **spawn streets** (prio 0)
  3. **near terrain** (mesh perto)
  4. **buildings** (+ bank / furniture conforme prioridades do stream)
  5. **nature** (veg base, prio 4)
  6. **carpet** (prio 5) — **opcional** para o foco

## Tile contract (focusGrid)

- **focusGrid cell = load tile.** Stream / Fila do foco medem o disco **playCore** da célula (não o raio Ultra inteiro de uma vez).
- Predicted focus (velocity × 2–3 s) deve **pré-aquecer a próxima célula** antes de cruzar a borda (histerese do grid).
- Ao sair da célula: preferir a próxima já warming; **nunca** despejar um anel enorme novo num único frame.
- Anéis externos (playCore → radius do preset) só depois de **Foco completo** na célula atual; mudança de célula re-trava o anel externo até o novo playCore fechar.

## Estágios de prontidão

| Estágio | Significado | Critério |
|---------|-------------|----------|
| **Mínimo jogável** | Dá para dirigir com chão e asfalto próximo | phys pin OK + ruas do spawn prontas + terreno perto revelado |
| **Foco completo** | Disco **playCore** da célula de foco sem trabalho **core** pendente | `Fila do foco` total core === 0 (playCore) |

Carpet / fundo opcional / anel externo / terreno vista **não** entram no total da Fila do foco e **não** bloqueiam *Foco completo*.

## Presets — raio fixo

| Preset | playCore (load tile) | Residency max | Stream CPU ms/frame (play) |
|--------|----------------------|---------------|----------------------------|
| Ultra (default) | ~160 m | ~480 m | ~4–6 ms |
| Simples | ~100 m | ~220 m | ~2–3 ms |

Sem shrink/expand por FPS. Heap / soft-cap ainda podem pausar *novos* residentes; drain do foco core continua. Círculo menor (Ultra 480) é alavanca explícita de estabilidade.

## Frame stream budget + leftover

- Orçamento **duro** de CPU de stream por frame de display (valor do preset).
- **Leftover (play):** enquanto interactive, `throughValve` / pumps só gastam stream se o wall `frameMs` recente (EMA) estiver **&lt; ~28 ms**; senão **yield** (continua apresentando). Meta: não empurrar o frame acima de ~33 ms.
- **Leftover (drive):** com o carro em movimento, gate mais apertado (**&lt; ~22 ms**) — só stream crítico entra.
- Observation-gated admission — **não** é pauseDraw HOLD / adaptive valve.
- `throughValve` / pumps / `createBudget` respeitam budget + leftover e yield quando fechados.

## Drive-moving defer (prio ≥1 + terrainMesh)

- **Boot gate:** drive-defer aplica-se só **depois** de **Mínimo jogável** (`focusRemain.playableMin` / `isPlayableMinReady`). Antes disso o stream de boot admite normal (streets + terrain mesh + o necessário para a cidade aparecer) — mesmo com o carro a rolar no limiar de crawl. Histerese de velocidade pode latchar cedo; a policy fica off até o gate.
- **Depois** de playableMin, enquanto velocidade planar &gt; limiar (~2.5 m/s enter ≈ 9 km/h / ~0.8 m/s exit ≈ 2.9 km/h; HUD = m/s × 3.6), `streamIntent.isDriveMovingActive`:
  - **Defere furniture / bank / buildings / nature / carpet (prio ≥1)** e **novos tiles de terrain visual** (`STREAM_LANE.TERRAIN_MESH`) — só **prio 0 streets** entram no ring pump.
  - **Terrain phys** (height/collision) permanece on-demand via `ensureGroundAround` — fora desta policy; preferir meshes já residentes / placeholders para vista.
  - Street furniture (`Prop_Sign_HW_*`, planters, …) is prio 1 — must **not** `gltf:parse` mid-drive.
  - Countryside veg (`Bush_Large_Flowers`, trees, …) is `STREAM_LANE.NATURE` / prio 4 — must **not** `gltf:parse` mid-drive (nature bg + treeLod).
  - **Admit único:** `streamIntent.mayAdmitStreamWork(priority|lane)` — WorldStream re-checa **por urlJob / terrain tile**; `AssetLoader.loadGltf({ shouldAbort })` aborta **antes** de `gltf:parse` após fetch/yield se a lane deferiu. Job fica sem grower → retry ao estacionar.
  - Não continua warmup/compile/reveal de furniture/nature mid-drive; leftover drive (~22 ms) só para streets.
  - **Não** expande anéis externos nem despeja props/nature/terrainMesh em mudança de focus-cell mid-drive.
  - `pumpTerrainSlice` / `pumpNatureSlice` / `pumpCarpetSlice` early-return while drive-moving (via `mayAdmitStreamWork`).
- Ao quase parar / estacionar: retoma props + nature/carpet + terrainMesh. Dirigir &gt; encher Fila (após playable).

## Two-stage assets (Pareto)

- Meshes texturizados do stream: revelar com **placeholder compartilhado** (1×1 / sólido) primeiro; **upgrade** para o mapa real quando o leftover admitir.
- MemoryGuardian / pressão de heap pode **re-demote** upgrades.
- Manter enxuto — não inventar um segundo engine de materiais.

## GPU warmup (obrigatório)

Nunca revelar batch de `InstancedMesh` até:

1. capacidade-1 alocada para o template, e
2. `compileAsync` / warmup desse template concluído

Qualquer path em `WorldStream` que crie grower deve warmup **antes** do primeiro `reveal`.

## Predicted focus

- Foco de stream / Guardian = **posição + velocity × horizonte (2–3 s)** (Chebyshev / planar XZ), quantizado no **focusGrid**.
- **Phys pin** permanece sob a **posição real do carro** (não sob o ponto previsto).

## Fila do foco

- Conta só **core** dentro de **playCore** (terrain perto + streets…nature prio ≤ 4 + buildings).
- Carpet / anel externo / terreno vista = opcional (linhas de fundo no HUD).
