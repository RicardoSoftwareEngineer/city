# 03 — Performance

## Budgets (o que controlamos)

| Knob | Ultra | Simples | Notas |
- **HUD:** Ultra / Simples também no float `#quality-preset-float` (canto superior direito, sempre visível em play) além do boot gate e do painel FPS.
|------|-------|---------|-------|
| Stream CPU ms / frame (play) | 4–6 | 2–3 | Hard budget; yield quando esgota |
| Residency radius | ~900 m | ~220 m | Fixo no preset |
| Soft-cap (não-terrain) | ~280 | ~140 | Heap ainda pode bloquear |
| instanceBatch / chunk | 32 / 16 | 12 / 4 | Preset |
| Shadows | on (após bake) | off | |
| pixelRatio cap | 2 | 1 | |

Sem ladder ao vivo por FPS. Hardware decide o FPS real.

## Hitch = bug (definição)

- Frame com **> 1000 ms** de wall time durante play/stream = **bug** (não “custo aceitável de carga”).
- Travamentos listados no HUD são **observação**; não disparam HOLD nem mudam raio.
- HUD mostra top **~50** hitches (carga e FPS), listas scrolláveis (`#hitch-load-hud` / `#play-hitch-hud`); memória guarda todos em `hitchEntries` (`window.__cityHitches` / `dumpLoadLog()`).

### Meta interim (ship bar)

- **Worst Travamentos hitch &lt; 10 s** (`worstFrameMs` / top entry &lt; 10000 ms) on a typical Ultra boot/stream near downtown.
- Frames &gt;1 s still tag **BUG** in the HUD; tightening below 1 s comes later.
- Levers for this bar: merge furniture urlJobs that share a glTF; share materials on `loadGltf` clones; `clearLoadTag` across async glTF waits and GPU compile yields; interactive stream compiles use `pause: false` (no multi-10s `pauseDraw` sandwich); grower warmup compiles **only** the new batch meshes.
- **Post-#125 (14s `draw frame+shadows`):** screenshot hitch was **not** apartment rooms — it was shadowed first-draw (+N GL programs) while `terrain vista*` streamed, plus `Building_Large_*.gltf` merge. Fixes: terrain `compileSubtree(..., { instancersOnly: false, pause: false })` when interactive (terrain is plain Mesh, not `_streamInstancer`); defer `shadowMap.needsUpdate` bake ~1.5s after `resumeShadows` (timed; streaming stays true all session); `resumeShadows` no longer `pauseDraw`-sandwiches; Large merge yields + `clearLoadTag` every stride / half-bucket; bank/interactive same pause:false rule; apartment interiors = **1 merged mesh** (helps draws/programs at 128 vivos, separate from the shadow/terrain bar).

## O que medimos vs o que controlamos

| Medimos (HUD) | Controlamos (código/preset) |
|---------------|-----------------------------|
| Travamentos — carga / FPS | `budgetMs`, batch, chunk, radius |
| FPS instantâneo / EMA | Yield + hard stream budget |
| heap / ktri (diagnóstico) | Soft-cap, wantsTerrain/NatureLoad |
| Fila do foco restante | Prioridades + predicted focus |

## Técnicas preferidas

- Time-slice + yield (`throughValve`, `createBudget`)
- Warmup GPU antes de reveal (scoped to the new batch, not the whole city parent)
- Dedupe / merge urlJobs by glTF URL (awnings, shared props)
- Clone with shared materials so `_gpu*ProgramWarmed` sticks
- Predicted focus + phys pin real
- Deletar leftovers de FPS-adapt em vez de novas personas

## pauseDraw + stream ownership

- **Boot (pre-interactive):** WorldStream may still `pauseDraw()` around ring / building compiles (avoid compile-via-draw on the first programs).
- While **apartment live-intent** is active (`streamIntent.isApartmentLiveIntentActive`), nature / water / carpet (**prio ≥4**) are **deferred** — no pauseDraw compile for those lanes until the intent finishes. Apartment room compile stays `pause: false`.
- When **interactive**, **all** stream priorities (furniture, buildings, nature, carpet, **terrain**) compile with `compileSubtree(..., { pause: false })` and skip the multi-second `pauseDraw` sandwich — targets multi-10s Travamentos freezes (`gltf:parse` sticky tags, `gpu compile inst …`, `draw frame+shadows`) during downtown Ultra stream beside apartment Todos.
- **Terrain caveat:** tiles are plain `Mesh` (shared `terrainLambert`). Compiles must pass `instancersOnly: false` or the first shadowed `render()` compiles programs via draw (BUG LOAD `draw frame+shadows +Nprog`).
- **Shadow bake:** `shadowMap.autoUpdate = false`; after `resumeShadows`, defer the first `needsUpdate` bake by ~1.5s so it does not stack on first-draw program compiles (`loadGovernor.streaming` stays true all session — do not gate on it). `resumeShadows` keeps drawing (no pauseDraw) and budgets `compileAsync` with `clearLoadTag` / yields.
- Hitch law still applies: wall frame >1000 ms during play/stream = bug (Travamentos observation only; no HOLD). Interim ship bar: worst &lt; 10 s.
