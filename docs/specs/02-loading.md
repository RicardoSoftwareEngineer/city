# 02 — Loading / streaming

## Purpose

Boot, focusGrid/playCore, admit e **drive-moving defer**. Fonte única da policy de drive — `03` só aponta para cá.

## Invariants / MUST / MUST NOT

- **MUST** Stable FPS > high FPS; drive smoothness first-class após playableMin.
- **MUST** Idle: phys pin sob spawn + shell; sem stream cidade/campo antes de *Começar*.
- **MUST** Após *Começar*: stream ao redor + predicted focus; sem black screen bloqueante.
- **MUST** Ordem core: phys → streets (0) → near terrain → buildings/bank/furniture → nature (4) → carpet (5, opcional).
- **MUST** focusGrid cell = load tile; Foco completo = playCore core === 0 (`Fila do foco`).
- **MUST** Predicted focus = pos + velocity × 2–3 s; **phys pin** sob posição real.
- **MUST** Anéis externos só após Foco completo; troca de célula re-trava outer.
- **MUST** GPU warmup antes de revelar batch `InstancedMesh` (cap-1 + `compileAsync`).
- **MUST** Two-stage maps: placeholder → upgrade; MemoryGuardian pode demote.
- **MUST NOT** FPS HOLD / adaptive pauseDraw.
- **MUST NOT** mid-drive: `gltf:parse` furniture/nature, novos `TERRAIN_MESH`, expand outer, warmup/reveal deferidos.
- **MUST NOT** despejar anel enorme num único frame.

## Drive-moving defer (após playableMin)

- `isDriveMovingActive` = speed hysteresis **AND** `isPlayableMinReady`.
- **Antes** playableMin: boot admite normal (streets + terrainMesh + cidade visível) — mesmo com carro a rolar.
- **Depois**, se ativo: só **prio 0 streets**; defere prio ≥1 + `STREAM_LANE.TERRAIN_MESH`. Phys (`ensureGroundAround`) fora da policy.
- Admit: `streamIntent.mayAdmitStreamWork(priority|lane)` — re-checa **por urlJob/tile**; `loadGltf({ shouldAbort })` aborta **antes** de `gltf:parse`. Retry ao estacionar.
- Pumps terrain/nature/carpet early-return via `mayAdmitStreamWork`. Ao parar: retoma. Dirigir > Fila (após playable).

## Knobs

| Knob | Ultra | Simples | Notas |
|------|-------|---------|-------|
| playCore | ~160 m | ~100 m | Load tile / Fila |
| Residency | ~480 m | ~220 m | Fixo |
| Stream CPU ms/frame | ~4–6 | ~2–3 | Hard; yield |
| Leftover play / drive | EMA &lt; ~28 / ~22 ms | idem | Meta wall ≤~33 ms |
| Drive enter / exit | 2.5 / 0.8 m/s | — | ≈9 / 2.9 km/h (×3.6) |
| Predict horizon | 2–3 s | — | |

| Estágio | Critério |
|---------|----------|
| **Mínimo jogável** | phys pin + ruas spawn + terreno perto |
| **Foco completo** | Fila core playCore === 0 |

Carpet / outer / vista **não** entram na Fila nem bloqueiam Foco completo.

## Ownership

`streamIntent` (admit/lanes/speed) · `focusRemain` (playableMin/Fila) · `WorldStream` (pumps/urlJobs) · `LoadGovernor` (budget/leftover) · `qualityPresets` · `AssetLoader` (abort pre-parse).

## Same-PR rule

Drive-defer, playableMin gate, playCore, leftover, Fila, warmup ou predicted focus → este arquivo (+ knobs em `03` se budgets mudarem).

## Out of scope

FPS HOLD. Hitch tiers / ship bar → `03`. Apartment live-intent → `05`.
