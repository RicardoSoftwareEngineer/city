# 03 — Performance

## Budgets (o que controlamos)

| Knob | Ultra | Simples | Notas |
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
