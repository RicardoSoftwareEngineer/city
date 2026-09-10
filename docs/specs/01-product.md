# 01 — Product

## Purpose

Pitch e leis de produto. Knobs de implementação: `02`–`05`.

## Pitch

Dirigir no **downtown MegaKit** (Quaternius) e sair para um **campo aberto** estilo Witcher / White Orchard: cidade no centro, countryside streamável até a cerca √10.

## Milestone Gilgalad (atual)

- Cidade **dirigível**; downtown **visível** no cold open (mínimo jogável).
- **Guerra de hitch no drive** ainda ativa — stable drive é a war em curso.
- Ship bar: célula→célula ≥30 FPS estável → `03-performance.md`.
- **Day/night (fases 1–2):** `DayNightController` owns Sky + sun orbit + hemi/sun/moon + stars; HUD **Hora** scrub 0–24h. Sem PMREM/frame, sem `@takram/three-atmosphere`, sem FPS HOLD. Postes GLB acendem à noite (`nightFactor` + pool ≤6 SpotLights + Point fill, wash asfalto/calçada/grama do meio-fio). HUD estudo **Iluminação** (minimizable, localStorage) tweaka `setParams` ao vivo. Bússola HUD (N/S/L/O) após Começar.

## Invariants / MUST / MUST NOT

- **MUST** português no HUD/boot/Fila; IDs técnicos em inglês (`phys`, `Ultra`, `stream`).
- **MUST** jogável antes do mundo terminar (idle phys+shell; após *Começar*, stream sem black screen).
- **MUST** presets fixos **Ultra** (default) / **Simples** — sem ladder contínuo por FPS.
- **MUST** Stable FPS > high FPS; dirigir suave é first-class.
- **MUST NOT** FPS HOLD / adaptive pauseDraw / personas de adaptação contínua.
- **Menos é mais** — contrato curto e código sustentável &gt; features adaptivas.


## Vehicle visuals (HUD)

- Botão `#car-visual-btn`: ciclo **Porsche → Mercedes → Mercedes (orig) → Defender → quadrado**.
- Labels PT: `Carro: Porsche` / `Carro: Mercedes` / `Carro: Mercedes (orig)` / `Carro: Defender` / `Carro: quadrado`.
- A/B: botão **Comparar A/B** offset +3 m no X local quando Mercedes/orig carregados — contrato em `06-vehicles.md`.
- Load times: painel **Load carros** (`getLoadStats()`).
- glTFs em `public/models/porsche/` e `public/models/mercedes/` (`.original.glb` preservado); loader em `src/vehicle/PorscheModel.js`.
- Escala visual = `PORSCHE_TARGET_LENGTH` (`RoadDimensions`); física do chassis inalterada.
- Rodas: discovery por nome legado ou cluster XZ em meshes mesclados (Porsche Sketchfab / Mercedes por material `TARMAC_*`); se <4 cantos, corpo ok e animação de roda degrada.

## Ownership

Pitch/milestone: este arquivo. Knobs: `02`–`05`. Presets: `qualityPresets`. Sky/sun cycle: `DayNightController` (`src/world/DayNightController.js`).

## Same-PR rule

Pitch, milestone, não-objetivos ou “menos é mais” → este arquivo.

## Out of scope

Sandbox de adaptividade FPS. Carpet/vista longe como bloqueio de mínimo jogável ou Foco completo (`02`).
