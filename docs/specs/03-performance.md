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

## O que medimos vs o que controlamos

| Medimos (HUD) | Controlamos (código/preset) |
|---------------|-----------------------------|
| Travamentos — carga / FPS | `budgetMs`, batch, chunk, radius |
| FPS instantâneo / EMA | Yield + hard stream budget |
| heap / ktri (diagnóstico) | Soft-cap, wantsTerrain/NatureLoad |
| Fila do foco restante | Prioridades + predicted focus |

## Técnicas preferidas

- Time-slice + yield (`throughValve`, `createBudget`)
- Warmup GPU antes de reveal
- Predicted focus + phys pin real
- Deletar leftovers de FPS-adapt em vez de novas personas

## pauseDraw + stream ownership

- WorldStream still uses `renderer.pauseDraw()` around building / low-prio ring compiles (avoid compile-via-draw).
- While **apartment live-intent** is active (`streamIntent.isApartmentLiveIntentActive`), nature / water / carpet (**prio ≥4**) are **deferred** — no pauseDraw compile for those lanes until the intent finishes. Apartment room compile stays `pause: false`.
- When **interactive**, nature / carpet / stream ring **prio ≥4** compiles use `compileSubtree(..., { pause: false })` and skip the multi-second `pauseDraw` sandwich — eliminates ~8s Travamentos BUG LOAD (`stream ring` / `nature bg`) freezes before or beside apartment intent.
- Hitch law still applies: wall frame >1000 ms during play/stream = bug (Travamentos observation only; no HOLD).
