# 03 — Performance

## Product law

- **Stable FPS > high FPS.** Só subir meta de FPS quando já está estável.
- Ship bar de play: **célula → célula a ≥30 FPS estável** (frames ≤~33 ms) enquanto o próximo tile streama — sem Travamentos multi-100ms / multi-segundo.
- Preferir CPU main/display estável; GPU memory/time podem ser agressivos se isso proteger o frame.
- Alavancas: leftover budget, playCore / raio menor, placeholder→upgrade, predicted focus. **Não** FPS HOLD / adaptive pauseDraw.

## Budgets (o que controlamos)

| Knob | Ultra | Simples | Notas |
|------|-------|---------|-------|
| Stream CPU ms / frame (play) | 4–6 | 2–3 | Hard budget; yield quando esgota |
| Play leftover admit | frameMs EMA &lt; ~28 ms | idem | Só gasta stream com headroom; meta wall ≤~33 ms |
| playCore (load tile) | ~160 m | ~100 m | Foco completo / Fila; anéis externos depois |
| Residency radius | ~480 m | ~220 m | Fixo no preset (círculo menor permitido) |
| Soft-cap (não-terrain) | ~280 | ~140 | Heap ainda pode bloquear |
| instanceBatch / chunk | 32 / 16 | 12 / 4 | Preset |
| Shadows | on (após bake) | off | |
| pixelRatio cap | 2 | 1 | |

Sem ladder ao vivo por FPS. Leftover é **admission** observacional (yield), não HOLD.

**HUD:** Ultra / Simples também no float `#quality-preset-float` (canto superior direito, sempre visível em play) além do boot gate e do painel FPS.

## Hitch = bug (definição)

- Frame com **> 1000 ms** de wall time durante play/stream = **bug** (não “custo aceitável de carga”).
- Travamentos listados no HUD são **observação**; não disparam HOLD nem mudam raio.
- HUD mostra top **~50** hitches (carga e FPS), listas scrolláveis (`#hitch-load-hud` / `#play-hitch-hud`); memória guarda todos em `hitchEntries` (`window.__cityHitches` / `dumpLoadLog()`).

### Ship bar (play)

- **Primário:** tile→tile ≥30 FPS estável (sem freezes multi-100ms / multi-segundo ao cruzar focusGrid; ideal frames ≤~33 ms com stream do próximo cell).
- Frames **&gt;1 s** ainda marcam **BUG** no HUD (tag de caça).
- A meta interim “worst Travamentos &lt; 10 s” **deixa de ser** a barra primária de ship para play (pode permanecer como diagnóstico histórico de boot).

## O que medimos vs o que controlamos

| Medimos (HUD) | Controlamos (código/preset) |
|---------------|-----------------------------|
| Travamentos — carga / FPS | `budgetMs`, leftover headroom, batch, chunk, playCore / radius |
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
- Deletar leftovers de FPS-adapt em vez de novas personas

## pauseDraw + stream ownership

- **Boot (pre-interactive):** WorldStream may still `pauseDraw()` around ring / building compiles (avoid compile-via-draw on the first programs).
- While **apartment live-intent** is active (`streamIntent.isApartmentLiveIntentActive`), nature / water / carpet (**prio ≥4**) are **deferred** — no pauseDraw compile for those lanes until the intent finishes. Apartment room compile stays `pause: false`.
- When **interactive**, **all** stream priorities (furniture, buildings, nature, carpet, **terrain**) compile with `compileSubtree(..., { pause: false })` and skip the multi-second `pauseDraw` sandwich — targets multi-10s Travamentos freezes (`gltf:parse` sticky tags, `gpu compile inst …`, `draw frame+shadows`) during downtown Ultra stream beside apartment Todos.
- **Terrain caveat:** tiles are plain `Mesh` (shared `terrainLambert`). Compiles must pass `instancersOnly: false` or the first shadowed `render()` compiles programs via draw (BUG LOAD `draw frame+shadows +Nprog`).
- **Shadow bake:** `shadowMap.autoUpdate = false`; after `resumeShadows`, defer the first `needsUpdate` bake by ~1.5s so it does not stack on first-draw program compiles (`loadGovernor.streaming` stays true all session — do not gate on it). `resumeShadows` keeps drawing (no pauseDraw) and budgets `compileAsync` with `clearLoadTag` / yields.
- Hitch law: wall frame >1000 ms during play/stream = bug (Travamentos observation only; no HOLD). Play ship bar = stable ≥30 FPS tile→tile.
