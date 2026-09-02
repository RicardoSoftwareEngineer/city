# MVP Terreno Simples — campo aberto vivo ao redor da cidade

Audience: coding agent + Ricardo. **Plano de implementação**, não código.
Não altera o miolo 4×4 (ruas, banco, prédios), o stream da cidade, nem as leis de hitch.

Companheiro: `MVP_TERRAIN_WITCHER.md` (mesmo norte, mais densidade / splat / LOD / kit).
Leis de hitch que este MVP **herda** sem negociar: `OPTIMIZATION_LOADING.md`, `OPTIMIZATION_MAP_ITEMS.md`, `SOURCE_SWAP.md`.

---

## Lei permanente — natureza = The Witcher 3

**Toda** a natureza deste jogo (campo, grama, flor, árvore, arbusto, pedra, caminho de terra, vento, horizonte) é inspirada no The Witcher 3. Sempre. Não nas texturas PBR — Quaternius cobre isso e textura se troca depois — e sim na **qualidade e quantidade de coisas vivas na tela**: relevo que se lê, carpete que esconde o plano, flores em mancha, bosque com volume, trilha que dá vontade de seguir, vento contínuo.

Este MVP simples é o **primeiro degrau**, não um estilo paralelo. Se agora a densidade for menor, o caminho mais estreito, o bosque mais ralo, a pergunta de cada PR futuro é: *isso deixa o campo mais perto do Witcher 3 ou mais longe?* Se mais longe, não entra.

Não vamos chegar no White Orchard neste PR. Vamos chegar em meses ou anos, melhorando o mesmo sistema. O alvo não muda.

Referência: as capturas de pradaria anexas (morros suaves, grama até o joelho, papoulas, espigas, caminhos de terra, bosque, haze). Cidade Downtown continua Downtown. Campo é Witcher.

---

## O que este MVP é

Um **mapa aberto** em volta do AABB da cidade: montes e vales baixos, vegetação se mexendo no vento, bosques, e **caminhos de terra largos o bastante para passar a cavalo** (hoje a Porsche; amanhã o cavalo). Sai da última rua e **entra no campo**. Não é vitrine atrás de muro.

Pé no chão: usa **só o que já está no repo** + Three.js nativo / addons oficiais. **Zero compra.** Textura perfeita não importa. Quantidade e vida importam.

A malha 4×4 **não se substitui** por heightmap. O campo começa onde `isInsideCity` acaba, com blend liso.

---

## O que já temos hoje (não reinventar)

### Cidade

| Dado | Valor |
|---|---|
| Grade | 4×4 ruas, `GRID_PITCH = 60` |
| `cityBounds()` | X/Z ≈ **−24 … 204** (~228 × 228 m) |
| Superfície | calçada `Y = 0`, asfalto `Y = −0.15` |
| Física do chão | `GROUND_BODY_HALF = 300` (caixa plana já maior que a cidade) |
| Stream | anéis 10 m Chebyshev; prio 0 ruas, 1 móveis/árvores de calçada, 2 banco, 3 prédios |
| Árvores na cidade | `CommonTree_1`–`5` em `/models/nature/` (prio 1) |
| Paredes | 4 Cannon invisíveis no AABB — **saem** neste MVP (senão o mapa aberto é mentira) |

O vazio “ao redor” já é um plano físico de 600 × 600 m. Falta **malha com relevo + vegetação + trilhas transitáveis** só **fora** de `isInsideCity(x, z)`, e física que acompanhe.

### Pacote Nature já no disco

`public/models/nature/` — Ultimate Nature Pack (Quaternius, CC0, glTF). Já usado nas calçadas.

**Gramíneas (tufos, não lâmina por lâmina):**

- `Grass_Common_Short.gltf` / `Grass_Common_Tall.gltf`
- `Grass_Wispy_Short.gltf` / `Grass_Wispy_Tall.gltf`
- atlas `Grass.png`

**Flores / rasteiras:**

- `Flower_3_Group` / `Flower_3_Single`, `Flower_4_Group` / `Flower_4_Single`
- `Clover_1` / `Clover_2`, `Petal_1`–`5`
- `Bush_Common`, `Bush_Common_Flowers`
- `Fern_1`, `Plant_1`, `Plant_1_Big`, `Plant_7`, `Plant_7_Big`

**Árvores:**

- `CommonTree_1`–`5` (já no stream da cidade — **mesmo glTF**, novo instancer de poses de campo)
- `Pine_1`–`5`, `TwistedTree_1`–`5`, `DeadTree_1`–`3` no máximo (variedade, poucos)

**Chão / caminho:**

- `PathRocks_Diffuse.png` — albedo da trilha
- `RockPath_Round_*` / `RockPath_Square_*` — acento na beira, não o leito
- `Rock_Medium_1`–`3`, seixos, `Rocks_Diffuse.png`

**Não usar neste MVP:** cogumelos como “bioma”, todos os 5 `DeadTree`, todos os pinheiros. Poucos glTFs únicos = poucos programas GPU.

### Three.js nativo / addon (sem lib de terreno)

| Peça | API |
|---|---|
| Malha do chão | `PlaneGeometry` por tile + escrever `position.y` |
| Ruído | `three/addons/math/ImprovedNoise.js` ou `SimplexNoise.js` |
| Instância | `createGrowingInstancedGltf` + `reveal` (já existe) |
| Vento | `ShaderMaterial` **ou** `MeshLambertMaterial.onBeforeCompile` (um programa só) |
| Caminho | spline 2D + corredor sem vegetação + albedo terra no tile |
| Névoa rasa | `THREE.Fog` / `FogExp2` (leve; horizonte não pode parecer fim de mapa) |
| Relógio | `Clock.getElapsedTime()` no `GameLoop` → `uTime` |
| Altura | `heightAt(x, z)` compartilhado (CPU), visual **e** física |
| Física aberta | Cannon `Heightfield` fatiado **ou** caixa por tile alinhada a `heightAt` — o corpo único plano de 300 m **não basta** quando o relevo sobe 4 m |

Não puxar `Sky.js` neste MVP. Não puxar água. Não `THREE.Cache`.

---

## Alvo visual (primeiro degrau Witcher)

O olho, saindo da última rua, tem que ler **campo**, não “plano verde com 40 árvores”. Densidade deste degrau é menor que o outro arquivo; a *intenção* é a mesma.

- Relevo: colinas de **1,5–4 m**, vales rasos, blend **liso para Y = 0** na borda da cidade (8–16 m). Sem penhasco, sem degrau no asfalto.
- Grama: tufos Quaternius. Espaçamento 2,5–3,5 m no campo; **zero tufo no leito da trilha**.
- Flores: clusters de `Flower_*_Group` + clover a cada ~15–25 m, longe do caminho.
- Árvores: 40–80 no campo, em 6–10 bosques. Folga ≥ 8 m da cidade e ≥ 5 m do eixo da trilha (copa não tapa o cavalo).
- Caminhos de terra: **2–4 saídas** da cidade, largura de cavalo, chão de terra, grama só na beira comendo a borda.
- Vento: grama, flor, folha, arbusto. Tronco parado. Sem vento = natureza morta = fora do norte.
- Animais: não neste degrau (pack separado).

FPS alvo no stream: o mesmo da cidade (~45). Hitch: mesmas regras. Um `InstancedMesh` gigante de 50 k tufos **é proibido**.

---

## Mapa aberto (não é anel-vitrine)

```
          outer (físico + visual ≈ ±300, casa com GROUND_BODY_HALF;
                 o horizonte pode ir um pouco além, sem colisão)
    ┌─────────────────────────────────────┐
    │     campo jogável + relevo          │
    │     trilhas de terra ────────────   │
    │     ┌───────────────────────┐       │
    │     │  cidade −24…204       │       │
    │     │  (ruas intactas)      │       │
    │     └───┬───────────────┬───┘       │
    │         │ saídas        │           │
    └─────────────────────────────────────┘
```

1. **Furo no meio.** Vértices com `isInsideCity` ficam em `Y = 0` e **não** desenham em cima do asfalto. A cidade continua cidade.
2. **Tiles 40 × 40 m.** Não um `PlaneGeometry(600, 600, 256, 256)`. Só o tile no anel de stream nasce.
3. **Segmentação.** 40 m / 2 m = 21 segs. Displace no CPU em fatia.
4. **Saídas.** Onde uma rua 4×4 aponta para o void (T da borda, curvas 2-lane já no canto), a trilha **nasce alinhada** com o asfalto. O jogador não “pula um muro”: a rua vira terra.
5. **Paredes Cannon somem** no mesmo PR que o primeiro tile jogável. Sem “campo lindo + muro invisível”.
6. **Void.** Além do outer: respawn / empurrão suave de volta, igual o carro fora da cidade hoje. Não cair no infinito.

---

## Caminhos de terra — dá para passar a cavalo

Inspiração: as trilhas das capturas (bege, borda comida pela grama, largura de montaria, rede irregular — não grid).

Medida deste degrau (cavalo / Porsche):

| | |
|---|---|
| Largura útil do leito | **3,5–4,5 m** (dois sentidos apertados / um cavalo folgado) |
| Ombro | 1–1,5 m de cada lado com grama rala, sem arbusto/árvore |
| Falloff da terra | 2–3 m até virar 100% grama (ruído na borda, sem linha reta de shader) |
| Inclinação | seguir `heightAt`; sem degrau; slope no leito < ~0.25 para o carro não empinar |
| Quantidade | **2–4** splines saindo de bordas reais da cidade, 80–180 m, morrendo num bosque ou cruzando outro caminho |
| Vegetação | scatter **recusa** ponto a menos de ~2,2 m do eixo (leito limpo). Ombro pode ter clover / grama curta |

Implementação simples (sem splat de 3 texturas ainda):

1. Splines 2D (catmull / bezier) em `paths.js`, seed fixo.
2. No displace do tile: vértices perto da spline descem um pouco (~5–10 cm) e recebem albedo terra (`PathRocks_Diffuse` ou Lambert hex bege). Resto verde + `Grass.png`.
3. Pode ser dois materiais no mesmo tile (índices) **ou** um Lambert com `map` misturado no CPU na vertex color / UV2. Um programa extra no máximo. Sem Standard.
4. Pedra `RockPath_*` só em curvas / entrada da cidade — acento, não o piso.

O caminho é **parte do mapa**, não decal. Física usa o mesmo corredor: o Heightfield / caixa do tile já está mais baixo e livre. Cavalo futuro anda aqui sem clipar em tufo.

---

## Vento (os dois MVPs nascem vivos)

Um único `ShaderMaterial` (ou `onBeforeCompile` compartilhado) para **grama, flor, folha, arbusto**.

Uniforms: `uTime`, `uWindDir` (vec2), `uWindStrength` (~0.15–0.35 neste degrau).

Vértice:

- Âncora = `position.y` local ≈ 0. Topo balança.
- Sem base em y=0: atributo `aBend` (0–1) gerado **uma vez** no prepare do template.
- `sin(uTime * 1.4 + worldXZ · windDir) * aBend * strength`.
- Folha ~0.4× da grama.

**Não** importar shader Godot/Unity. **Não** `compile(cena)` para “esquentar” vento. Compile no primeiro `reveal`.

`GameLoop` seta `uTime`. Zero sistema novo de tick.

---

## Scatter (CPU, determinístico)

`src/world/terrain/scatter.js`

- Seed fixo. Mesmo mundo em todo boot.
- Grade + jitter. Sem `Math.random` no stream.
- Recusar se `isInsideCity` ou `distOutsideCity < 4`.
- Recusar se dentro do corredor da trilha (eixo + 2,2 m) — **exceto** grama curta / clover no ombro.
- Recusar grama alta se `slopeAt > ~0.55`.
- Y = `heightAt(x, z)`. Yaw livre. Escala 0.85–1.25.

Orçamento deste degrau (~80–120 m de largura de campo):

| Camada | glTF (máx. únicos) | Densidade | Ordem de grandeza |
|---|---|---|---|
| Grama alta | `Grass_Common_Tall` | 1 / ~9 m² fora da trilha | 4–8 k |
| Grama fina | `Grass_Wispy_Short` | 1 / ~14 m² | 3–5 k |
| Flor group | `Flower_3_Group` + `Flower_4_Group` | clusters | 200–400 |
| Clover | `Clover_1` | ralo + ombro da trilha | 150–250 |
| Arbusto | `Bush_Common` / `_Flowers` | bosques, longe da trilha | 80–150 |
| Árvore | `CommonTree_*` (3) + 1 `Pine_*` | bosques | 40–80 |

Vários `InstancedMesh` com capacity do governor (4–32) via `createGrowingInstancedGltf`. **Não** um mesh `x8000`.

---

## Encaixe no stream (LOADING)

Prio **4**, depois dos prédios. Cidade primeiro, campo depois. Porsche + GameLoop no boot não mudam.

O stream **continua no campo**: anéis 10 m não param no AABB. Dirigir/cavalgar para fora puxa tiles + vegetação na frente, como rua.

Jobs:

1. `urlJobs` dos glTFs de campo — poses fora da cidade e fora do leito.
2. `tasks` por tile: displace + pintar trilha + add mesh. `waitIfSlow` / `waitUntilSmooth` se passar de uns ms.
3. Task das paredes: remover os 4 bodies no boot do terreno (ou não criá-los se o terreno registrou).

Governor igual (carga cap 2, `budgetMs` 6, chunk ≤ 8). Compile só do instancer/tile revelado. Sem `THREE.Cache`.

Log: `terrain tile {ix},{iz}`, `path spline {n}`, `gltf:parse Grass_Common_Tall`. HUD Travamentos tem que ver isso.

Atualizar `OPTIMIZATION_LOADING.md` (prio 4 + anéis além da cidade) e `OPTIMIZATION_MAP_ITEMS.md` (campo aberto, trilha, sombra) **no mesmo PR** que o código.

---

## Física / jogo (mapa aberto neste degrau)

- As 4 paredes **saem**. Sem elas o “aberto” é mentira.
- Visual e colisão compartilham `heightAt`. Carro/cavalo sobem o morro; não flutuam nem enterram.
- Preferência: Cannon `Heightfield` **por tile 40 m**, criado na mesma task do mesh, fatiado. Um heightfield 600×600 de uma vez é hitch.
- Alternativa mais pobre (só se Heightfield travar o PR): caixas por tile com Y = altura média — aceitável no plano, mentira no vale. Trocar no próximo PR, não abandonar o norte.
- Chão único plano `GROUND_BODY_HALF = 300` **não** cobre relevo. Pode ficar como fallback sob a cidade (Y asfalto) e **não** se estender como a única colisão do campo.
- Spawn continua na cidade. Se o corpo cair no void além do outer: respawn no último ponto válido da trilha ou na cidade.
- Cavalo ainda não existe. A trilha já nasce com largura e leito limpo para quando existir. A Porsche é o teste de “dá para passar” hoje.

---

## Arquivos a criar (quando for implementar)

| Arquivo | Função |
|---|---|
| `src/world/terrain/heightField.js` | `heightAt`, `slopeAt`, ruído 2 oitavas, blend da cidade |
| `src/world/terrain/paths.js` | 2–4 splines, corredor, máscara, saídas alinhadas às ruas |
| `src/world/terrain/windMaterial.js` | Lambert + vento; uma vez no template |
| `src/world/terrain/scatter.js` | poses; recusa cidade + leito da trilha |
| `src/world/terrain/TerrainWorld.js` | tiles 40 m, furo, física por tile, registra jobs |
| `src/world/registerCity.js` | `registerTerrain(stream)` prio 4; **não** cria as 4 paredes |

**Não mexer:** `CityGrid.js` (árvores de calçada), catálogo de prédios, Porsche, Downtown `SOURCE_SWAP`, gerencial-api.

Onde as paredes nascem hoje: achar e **condicionar** a `false` quando o terreno aberto registra. Não deixar os dois sistemas brigando.

---

## Passos de implementação (ordem)

1. `heightAt` + 1 tile jogável fora da cidade + **paredes off**. Sair de um T da borda sem bater em invisível. Asfalto intacto, blend liso.
2. Física do tile alinhada a `heightAt` (Heightfield fatiado). Porsche sobe um morro de 2 m.
3. 1 spline de terra saindo dessa rua, 4 m de leito, scatter recusa o corredor. Passar de ponta a ponta sem capinar tufo.
4. Vento no `Grass_Common_Tall` (~200 poses ao lado da trilha).
5. Scatter das duas gramas + flores + arbustos no campo, growing instancer, prio 4.
6. Bosques `CommonTree` (reusa parse da calçada, key `url|vc:1`).
7. 1–3 trilhas extras nas outras bordas.
8. Fog leve se o horizonte ainda parecer fim de plano.
9. Jogar até `dumpLoadLog` / Travamentos. Hitch > 1 s: um patch, não três.

Pronto quando: sai da cidade, pega um caminho de terra, atravessa o campo com relevo e vegetação no vento, chega num bosque, cidade intacta atrás, nenhum instancer = campo inteiro, nenhum `compile(scene)`.

---

## Compras

Nenhuma. Nature no disco cobre tufo, flor, árvore, pedra, albedo de trilha.

Se a grama parecer 4 clones, este degrau responde com **mais poses / `Grass_Wispy_Tall`**, não com compra. MegaKit é o outro arquivo.

---

## Fora de escopo (deste degrau — não do jogo)

Isto **não** é “nunca vamos fazer”. É “não neste PR / neste arquivo”. O norte Witcher continua.

- Densidade tipo captura (chunks 20 m, 4 camadas de grama) — `MVP_TERRAIN_WITCHER.md`
- Splat 3 texturas + MegaKit Source
- `THREE.LOD` de árvore / silhueta de montanha
- Grama por lâmina (GPU grass)
- Animais / cavalo como veículo (a **trilha** já espera o cavalo)
- Sky.js, rio, clima
- Mapa além ~300–320 m
- glTF Godot `convcolonly`

---

## Critério de aceite

- Cidade 4×4 idêntica por dentro.
- **Mapa aberto:** paredes fora; dá para sair e circular o campo.
- Relevo 1,5–4 m + vegetação viva (vento contínuo) o bastante para não ler “chão infinito liso”.
- **Pelo menos 2 caminhos de terra** largos (~4 m), leito limpo, dá para a Porsche (e um cavalo futuro) passar ponta a ponta.
- Stream prio 4 além do AABB, fatiado, sem `THREE.Cache`, sem instancer único do campo.
- Cada escolha deste PR deixa o campo **mais perto** do Witcher 3, não mais longe.
- Travamentos: > 1 s é ponto real. FPS da VM ≠ “o Windows ficou liso”.
