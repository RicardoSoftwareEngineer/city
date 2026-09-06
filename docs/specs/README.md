# Spec-Driven Development

Specs in this folder are the **source of truth** for product behavior, loading/streaming, performance budgets, and world rules.

## Rules

1. **Specs win.** Code follows the specs. If code and a spec disagree, fix the code — or update the spec in the **same PR** when the contract intentionally changes.
2. **Same-PR updates.** Any change to loading, streaming, presets (Ultra/Simples), focus/Fila, phys pin, or world/fence/biome/orchard/vista rules **must** update the matching spec file in that PR.
3. **Keep each file short.** Enough to control behavior — not a novel. Portuguese is fine for product voice; English is fine for technical IDs (`phys`, `Fila do foco`, `Ultra`).
4. **Historical notes are not the contract.** Root `OPTIMIZATION_LOADING.md` and `OPTIMIZATION_MAP_ITEMS.md` are diaries of past hitches and file ownership. Prefer linking them; do not treat them as the live contract.

## Index

| Spec | Contract |
|------|----------|
| [01-product.md](./01-product.md) | Product: downtown + open campo, presets, playability |
| [02-loading.md](./02-loading.md) | **Loading / streaming** (market open-world style) |
| [03-performance.md](./03-performance.md) | Budgets, hitch definition, what we measure vs control |
| [04-world.md](./04-world.md) | Fence, orchard, biomes, vista, city paved |
| [05-apartments.md](./05-apartments.md) | Glass windows, on-demand interiors, curtains |

## Workflow

1. Change intent → edit the relevant `docs/specs/*.md` first (or in the same commit as code).
2. Implement the smallest maintainable change that satisfies the spec.
3. Prefer deleting dead FPS-adapt / HOLD leftovers over adding new adaptive personas.
