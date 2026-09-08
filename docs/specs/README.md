# Spec-Driven Development

Specs = **contrato vivo**. Código segue specs; discordância → corrige código ou atualiza a spec **no mesmo PR**.

**Milestone atual: Gilgalad** — cidade dirigível + downtown visível; guerra de hitch no drive ainda ativa (`01-product.md`).

## Como AIs devem usar

1. Mudar loading / drive-defer / boot → lê `02-loading.md`.
2. Mudar budgets / hitch / ship bar / leftover → lê `03-performance.md` (drive-defer detalhado está em **02**).
3. Mudar fence / biome / paved / vista → lê `04-world.md`.
4. Mudar vidro / interiores / cortinas / Todos → lê `05-apartments.md`.
5. **Same-PR:** mudança intencional de contrato atualiza a spec matching.
6. `OPTIMIZATION_*.md` = diários históricos — **não** contrato.

## Index

| Spec | Contrato |
|------|----------|
| [01-product.md](./01-product.md) | Pitch, Gilgalad, não-objetivos, menos é mais |
| [02-loading.md](./02-loading.md) | Idle/boot, playCore, drive-defer, admit, Fila |
| [03-performance.md](./03-performance.md) | Budgets, hitch tiers, ship bar |
| [04-world.md](./04-world.md) | Fence, orchard, biomes, vista, paved |
| [05-apartments.md](./05-apartments.md) | Glass, InstancedMesh, liveTarget, cortinas |

## Workflow

1. Intent → edita a spec matching (primeiro ou no mesmo commit).
2. Menor change que satisfaz a spec.
3. Deletar leftovers FPS-adapt/HOLD &gt; inventar personas novas.
