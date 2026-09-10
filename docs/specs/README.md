# Spec-Driven Development

Specs = **contrato vivo**. Código segue specs; discordância → corrige código ou atualiza a spec **no mesmo PR**.

**Milestone atual: Gilgalad** — cidade dirigível + downtown visível; guerra de hitch no drive ainda ativa (`01-product.md`).

## Como AIs devem usar

1. Mudar loading / drive-defer / boot → lê `02-loading.md`.
2. Mudar budgets / hitch / ship bar / leftover → lê `03-performance.md` (drive-defer detalhado está em **02**).
3. Mudar fence / biome / paved / vista → lê `04-world.md`.
4. Mudar vidro / interiores / cortinas / Todos → lê `05-apartments.md`.
5. Mudar hero car HUD / A/B / load times → lê `06-vehicles.md` (pipeline GLB core → **08**).
6. Mudar chrome HUD lista/resize/minimize → lê `07-hud.md`.
7. Mudar optimize GLB / profiles / keep-original / import budgets → lê `08-glb-import.md`.
8. **Same-PR:** mudança intencional de contrato atualiza a spec matching.
9. `OPTIMIZATION_*.md` = diários históricos — **não** contrato.

## Index

| Spec | Contrato |
|------|----------|
| [01-product.md](./01-product.md) | Pitch, Gilgalad, não-objetivos, menos é mais |
| [02-loading.md](./02-loading.md) | Idle/boot, playCore, drive-defer, admit, Fila |
| [03-performance.md](./03-performance.md) | Budgets, hitch tiers, ship bar |
| [04-world.md](./04-world.md) | Fence, orchard, biomes, vista, paved |
| [05-apartments.md](./05-apartments.md) | Glass, InstancedMesh, liveTarget, cortinas |
| [06-vehicles.md](./06-vehicles.md) | Hero HUD A/B, load times; pointer → profiles em **08** |
| [07-hud.md](./07-hud.md) | Minimizable list panels: resize/clip, persist |
| [08-glb-import.md](./08-glb-import.md) | Hybrid GLB optimize core + category profiles |

## Workflow

1. Intent → edita a spec matching (primeiro ou no mesmo commit).
2. Menor change que satisfaz a spec.
3. Deletar leftovers FPS-adapt/HOLD &gt; inventar personas novas.
