# 02 — Loading (contract)

Market-style open-world load. Fixed Ultra/Simples knobs. **No FPS-driven throttle / HOLD.**

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

## Estágios de prontidão

| Estágio | Significado | Critério |
|---------|-------------|----------|
| **Mínimo jogável** | Dá para dirigir com chão e asfalto próximo | phys pin OK + ruas do spawn prontas + terreno perto revelado |
| **Foco completo** | Disco de foco (preset R) sem trabalho **core** pendente | `Fila do foco` total core === 0 |

Carpet / fundo opcional **não** entra no total da Fila do foco e **não** bloqueia *Foco completo*.

## Presets — raio fixo

| Preset | Raio (streets/veg/buildings) | Stream CPU ms/frame (play) |
|--------|------------------------------|----------------------------|
| Ultra (default) | ~900 m | ~4–6 ms |
| Simples | ~220 m | ~2–3 ms |

Sem shrink/expand por FPS. Heap / soft-cap ainda podem pausar *novos* residentes; drain do foco core continua.

## Frame stream budget

- Orçamento **duro** de CPU de stream por frame de display (valor do preset).
- `throughValve` / pumps / `createBudget` **respeitam** o budget e **yield** quando esgotado.
- Sem Valve HOLD por FPS.

## GPU warmup (obrigatório)

Nunca revelar batch de `InstancedMesh` até:

1. capacidade-1 alocada para o template, e
2. `compileAsync` / warmup desse template concluído

Qualquer path em `WorldStream` que crie grower deve warmup **antes** do primeiro `reveal`.

## Predicted focus

- Foco de stream / Guardian = **posição + velocity × horizonte (2–3 s)** (Chebyshev / planar XZ).
- **Phys pin** permanece sob a **posição real do carro** (não sob o ponto previsto).

## Fila do foco

- Conta só **core** (terrain in-scope + streets…nature prio ≤ 4 + buildings).
- Carpet = opcional (linha “fundo opcional” no HUD).
