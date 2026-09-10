# 07 — HUD (minimizable list panels)

## Purpose

Contrato de chrome dos painéis HUD minimizáveis com lista/corpo scrollável. Resize W/H deve manter conteúdo **dentro** do chrome (scroll + ellipsis), não estourar.

## Invariants / MUST / MUST NOT

- **MUST** painéis com `[data-min-id]`: título = minimize + drag; corners = resize; persist `localStorage` `city-hud-panels-v1` `{ min, left, top, width, height }` (`minimizableHud.js`).
- **MUST** **todas** as listas scrolláveis do HUD (Fila do foco, Ordem de carga, QualityAdapter/personas, Anel, Hitch, Recursos, Load carros, …) usam classe **`hud-list-panel`** + padrão flex clip — sem one-offs que quebram o contrato:
  - Root: `display:flex; flex-direction:column; overflow:hidden;` + default `max-height: min(55vh, 42rem)` (`.is-resized` levanta o teto).
  - Toggle: `flex-shrink: 0`.
  - `[data-min-body]`: preenche altura restante (`flex:1; min-height:0`).
  - Scroll em **`.hud-scroll-list`** (body-as-list **ou** lista aninhada): `overflow-y:auto; max-height:none` — **não** hard-cap na lista.
  - **MUST** linhas de lista: **nunca wrap**; truncar com `text-overflow: ellipsis` (`white-space:nowrap; overflow:hidden; min-width:0`). Em rows multi-coluna (`.lo-row` / label cell), o ellipsis vai na **célula do label** (`.lo-label`), não só no `<li>`. `title` opcional no texto completo.
- **MUST** minimize esconde `[data-min-body]`; handles de resize ocultos quando `.is-min`.
- **MUST NOT** `max-height` fixo na lista (ex. `9.5rem` / `14rem`) que lute com resize do painel.
- Cap default no **painel**, não na lista.

## Ownership

CSS: `src/style.css` (`.hud-list-panel` / `.hud-scroll-list`). JS: `minimizableHud.js`. Roots: `index.html` + persona / street-lights criados em JS.

## Same-PR rule

Novo painel lista minimizável ou mudança do padrão resize/clip → este arquivo.

## Out of scope

Lógica de detecção de hitch (`03`). Staging catalog bar (não é list panel minimizável).
