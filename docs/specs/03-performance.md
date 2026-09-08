# 03 — Performance

## Product law

- **Stable FPS > high FPS.** Só subir meta de FPS quando já está estável.
- Ship bar de play: **célula → célula a ≥30 FPS estável** (frames ≤~33 ms) enquanto o próximo tile streama — sem Hitches multi-100ms / multi-segundo.
- **Drive smoothness first-class:** com o carro **em movimento**, FPS estável (~≥30) e Hitches raros/ausentes — mesmo que a Fila ainda mostre props/nature pendentes.
- Preferir CPU main/display estável; GPU memory/time podem ser agressivos se isso proteger o frame.
- Alavancas: leftover budget (mais apertado ao dirigir), playCore / raio menor, placeholder→upgrade, predicted focus, **drive-moving defer prio ≥1** (streets+terrain only). **Não** FPS HOLD / adaptive pauseDraw.

## Budgets (o que controlamos)

| Knob | Ultra | Simples | Notas |
|------|-------|---------|-------|
| Stream CPU ms / frame (play) | 4–6 | 2–3 | Hard budget; yield quando esgota |
| Play leftover admit | frameMs EMA &lt; ~28 ms | idem | Só gasta stream com headroom; meta wall ≤~33 ms |
| Drive leftover admit | frameMs EMA &lt; ~22 ms | idem | Enquanto `isDriveMovingActive`; crítico só |
| playCore (load tile) | ~160 m | ~100 m | Foco completo / Fila; anéis externos depois |
| Residency radius | ~480 m | ~220 m | Fixo no preset (círculo menor permitido) |
| Soft-cap (não-terrain) | ~280 | ~140 | Heap ainda pode bloquear |
| instanceBatch / chunk | 32 / 16 | 12 / 4 | Preset |
| Shadows | on (após bake) | off | |
| pixelRatio cap | 2 | 1 | |

Sem ladder ao vivo por FPS. Leftover é **admission** observacional (yield), não HOLD.

**HUD:** Ultra / Simples também no float `#quality-preset-float` (canto superior direito, sempre visível em play) além do boot gate e do painel FPS.

## Hitch taxonomy (definição)

Official name: **hitch** = frame spike / stutter. HUD lists are labeled **Hitches** (carga + FPS).

| Tier | frameMs | Badge | Meaning |
|------|---------|-------|---------|
| **ok** / aceitável | ≤ 100 ms | ACEITÁVEL (muted) | Occasional soft spike; may still appear if above list threshold |
| **mitigate** | &gt; 100 ms and ≤ 1000 ms | MITIGAR | Must work down — especially while driving |
| **bug** | &gt; 1000 ms | BUG | Max priority; not an “acceptable load cost” |

- Ideal **drive** target remains **≤ ~33 ms** (≥30 FPS stable). Sub-33 ms frames are **not** required in the Hitches list.
- Hitches no HUD são **observação**; não disparam HOLD nem mudam raio.
- HUD mostra top **~50** hitches (carga e FPS), listas scrolláveis (`#hitch-load-hud` / `#play-hitch-hud`); memória guarda todos em `hitchEntries` com `tier: 'ok'|'mitigate'|'bug'` (`window.__cityHitches` / `dumpLoadLog()`).

### Ship bar (play)

- **Primário:** tile→tile ≥30 FPS estável (sem freezes multi-100ms / multi-segundo ao cruzar focusGrid; ideal frames ≤~33 ms com stream do próximo cell).
- **Drive:** enquanto o carro se move, mesma barra — **prio ≥1 deferred** (só streets + terrain); Fila “faltam N props/nature” **não** autoriza hitch.
- Frames **&gt;1 s** marcam **BUG**; **&gt;100 ms…≤1 s** marcam **MITIGAR**.
- A meta interim “worst Hitches &lt; 10 s” **deixa de ser** a barra primária de ship para play (pode permanecer como diagnóstico histórico de boot).

## O que medimos vs o que controlamos

| Medimos (HUD) | Controlamos (código/preset) |
|---------------|-----------------------------|
| Hitches — carga / FPS (+ tier) | `budgetMs`, leftover headroom, batch, chunk, playCore / radius |
| FPS instantâneo / EMA / frameMs EMA | Yield + hard stream budget + leftover admit |
| heap / ktri (diagnóstico) | Soft-cap, wantsTerrain/NatureLoad, demote maps |
| Fila do foco restante | Prioridades + predicted focus + playCore |

## Técnicas preferidas

- Time-slice + yield (`throughValve`, `createBudget`) + **leftover admission**
- Warmup GPU antes de reveal (scoped to the new batch, not the whole city parent)
- Two-stage maps (placeholder → upgrade; demote sob pressão)
- Dedupe / merge urlJobs by glTF URL (awnings, shared props)
- Clone with shared materials so `_gpu*ProgramWarmed` sticks
- Predicted focus + phys pin real + focusGrid load tile
- playCore primeiro; anel externo só após Foco completo
- Drive-moving: defer prio ≥1 (streets+terrain only) + per-job admit / pre-parse abort + leftover ~22 ms + sem expand outer mid-drive
- Deletar leftovers de FPS-adapt em vez de novas personas

## pauseDraw + stream ownership

- **Boot (pre-interactive):** WorldStream may still `pauseDraw()` around ring / building compiles (avoid compile-via-draw on the first programs).
- While **apartment live-intent** is active (`streamIntent.isApartmentLiveIntentActive`), nature / water / carpet (**prio ≥4**) are **deferred** — no pauseDraw compile for those lanes until the intent finishes. Apartment room compile stays `pause: false`.
- While **drive-moving** is active (`streamIntent.isDriveMovingActive`, speed hysteresis), **prio ≥1** (furniture / bank / buildings / nature / carpet) is deferred; only **prio 0 streets** + **terrain** (independent bg) may stream; outer rings do not expand; leftover ~22 ms. Resume props when nearly stopped. **Per-job** `mayAdmitStreamWork` + `loadGltf({ shouldAbort })` so already-admitted furniture jobs abort **before** `gltf:parse` after fetch/yield (do not finish Prop_Sign parse mid-drive). Skip warmup/compile/reveal for deferred lanes until parked.
- When **interactive**, **all** stream priorities (furniture, buildings, nature, carpet, **terrain**) compile with `compileSubtree(..., { pause: false })` and skip the multi-second `pauseDraw` sandwich — targets multi-10s Hitches freezes (`gltf:parse` sticky tags, `gpu compile inst …`, `draw frame+shadows`) during downtown Ultra stream beside apartment Todos.
- **Terrain caveat:** tiles are plain `Mesh` (shared `terrainLambert`). Compiles must pass `instancersOnly: false` or the first shadowed `render()` compiles programs via draw (BUG LOAD `draw frame+shadows +Nprog`).
- **Shadow bake:** `shadowMap.autoUpdate = false`; after `resumeShadows`, defer the first `needsUpdate` bake by ~1.5s so it does not stack on first-draw program compiles (`loadGovernor.streaming` stays true all session — do not gate on it). `resumeShadows` keeps drawing (no pauseDraw) and budgets `compileAsync` with `clearLoadTag` / yields.
- Hitch law: &gt;1000 ms = BUG; &gt;100…≤1000 = MITIGAR; ≤100 = ACEITÁVEL (Hitches observation only; no HOLD). Ideal drive ≤~33 ms. Play ship bar = stable ≥30 FPS tile→tile.
