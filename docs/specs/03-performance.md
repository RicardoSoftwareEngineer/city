# 03 — Performance

## Purpose

Budgets Ultra/Simples, hitch taxonomy e ship bar. Drive-defer / admit completo: **`02-loading.md`**.

## Invariants / MUST / MUST NOT

- **MUST** Stable FPS > high FPS; ship bar tile→tile ≥30 FPS (ideal ≤~33 ms).
- **MUST** Drive smoothness first-class após playableMin (Fila pendente não autoriza hitch).
- **MUST** Preferir CPU main/display estável; GPU pode ser agressivo se protege o frame.
- **MUST** Hitches no HUD = observação — **não** disparam HOLD nem mudam raio.
- **MUST NOT** FPS HOLD / adaptive pauseDraw / ladder ao vivo por FPS.

## Knobs

| Knob | Ultra | Simples | Notas |
|------|-------|---------|-------|
| Stream CPU ms/frame | 4–6 | 2–3 | Hard; yield |
| Leftover play / drive | EMA &lt; ~28 / ~22 ms | idem | Drive: após playableMin |
| playCore / residency | ~160 / ~480 m | ~100 / ~220 m | |
| Soft-cap | ~280 | ~140 | Heap ainda bloqueia |
| instanceBatch / chunk | 32 / 16 | 12 / 4 | |
| Shadows / pixelRatio | on (pós-bake) / 2 | off / 1 | |

HUD preset: `#quality-preset-float` + boot + painel FPS.
HUD hora: `#day-night-float` (scrub; Play opcional). DayNight **não** regenera PMREM; hitch law / Ultra fixo inalterados.

## Hitch taxonomy

**hitch** = frame spike. HUD: **Hitches** (carga + FPS).

| Tier | frameMs | Badge |
|------|---------|-------|
| **ok** | ≤ 100 ms | ACEITÁVEL |
| **mitigate** | &gt; 100 … ≤ 1000 ms | MITIGAR |
| **bug** | &gt; 1000 ms | BUG |

Ideal drive ≤~33 ms (sub-33 fora da lista). Top ~50 HUD; dump: `hitchEntries` / `__cityHitches` / `dumpLoadLog()`.

## Ship bar

- **Primário:** focusGrid cell→cell ≥30 FPS estável, sem freezes multi-100ms / multi-segundo.
- **Drive:** após playableMin, streets-only — ver **`02-loading.md`**. Cold open → mínimo jogável com cidade visível.
- &gt;1 s = BUG; &gt;100…≤1 s = MITIGAR. “Worst &lt;10 s” = diagnóstico boot, não barra primária.

## Compile notes (curto)

Interactive: `pause: false`. Terrain Mesh: `instancersOnly: false` (senão first shadowed draw = `draw frame+shadows`). Shadow bake: `autoUpdate=false`; defer first `needsUpdate` ~1.5 s após `resumeShadows`. DayNight: sky `sunPosition` stays far; shadow DirectionalLight closer (`LIGHT_DISTANCE`) + `shadow.camera.far` headroom; Hora scrub / play pose changes set `needsUpdate` (throttled while playing). `zoneAwareOptions`: keep `castShadow` if any pose (or nearest-to-focus) is inner — not centroid-only (city trees are one InstancedMesh/species); outer-only batches still skip; `Renderer.requestShadowBake` when casting instances first reveal. Personas admit: `streamIntent` (`02` / `05`). Street lamps: pool ≤6–8 Spot(+Point) nearest poles only — never per-pole lights; `castShadow` off on pool lights.

## Ownership

`loadLog` (tiers) · `LoadGovernor` (budget/leftover) · `qualityPresets` · `streamIntent` (admit — contrato em `02`/`05`). Sky/sun: `DayNightController` (não mexe budgets).

## Same-PR rule

Budgets, hitch thresholds, ship bar, leftover → este arquivo. **Quando** deferir stream → `02-loading.md`.

## Out of scope

Essay de drive-defer / per-job abort → `02`. Adaptive FPS / HOLD.
