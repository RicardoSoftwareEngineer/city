# MVP Terreno “The Witcher 3” — mapa aberto, natureza viva

Audience: coding agent + Ricardo. **Plano de implementação**, não código.
Não implementa nada agora. Sobe em cima do `MVP_TERRAIN_SIMPLE.md` (mesmo furo da cidade, mesmo stream, mesmas leis de hitch, **mesmo norte**).

---

## Lei permanente — natureza = The Witcher 3

**Toda** a natureza deste jogo é inspirada no The Witcher 3. Sempre. Vale para este MVP, para o simples, e para **qualquer** alteração futura de campo, vegetação, trilha, vento, horizonte, fauna, céu.

Não nas texturas. Textura se acha no Quaternius e se troca. O que não se negocia:

- **Quantidade** — a tela cheia de vida (grama, flor, arbusto, árvore, pedra), sem buracos de plano nu na média distância.
- **Qualidade de leitura** — o olho entende vale, morro, trilha, bosque, horizonte. Não um tapete plano com props.
- **Movimento** — vento na grama, na flor alta, na copa. Natureza parada é natureza morta.
- **Caminho** — terra que dá para seguir a cavalo, borda comida pela grama, rede irregular como nas capturas.
- **Mapa aberto** — o campo é lugar para estar, não poster atrás da cidade.

Se um PR futuro de “otimização” rarear o campo até parecer vazio, ele **feriu esta lei**, mesmo que o FPS suba. Otimiza fatiando (LOADING / MAP), não matando o norte.

Não vamos chegar no White Orchard neste arquivo. Vamos chegar em meses ou anos no **mesmo** sistema (tiles, `heightAt`, trilhas, chunks, vento). Cada degrau aponta para as capturas. O alvo não muda.

Cidade Downtown continua Downtown (MegaKit urbano). O mundo **fora** das ruas é Witcher.

---

## O que este MVP é

O campo aberto do simples, no **nível das capturas**: amplitude de morro/vale, carpete de vegetação em camadas, bosques com volume, **rede de caminhos de terra transitáveis a cavalo**, vento em grama e copa, horizonte com haze.

Ainda não é um continente. A malha 4×4 **não se substitui**. Outer ~320–360 m neste degrau; crescer o mapa depois é o mesmo sistema, tiles novos.

Dois andares:

1. **Arte / variedade** — Stylized Nature MegaKit Source, só glTF oficial.
2. **Sistemas Three.js** — heightmap + splat + chunks + LOD + vento + física aberta. Shaders **nossos**.

---

## Relação com o MVP simples

Faça o simples **primeiro** se ainda não existirem: `heightAt`, tiles com furo, paredes fora, 2+ trilhas passáveis, vento, growing instancers prio 4, física por tile.

Este arquivo **não** reabre “campo só visual / paredes ficam”. Isso foi descartado. Os dois MVPs são mapa aberto.

O que muda aqui: amplitude, densidade na tela, splat, mais trilhas / cruzamentos, LOD, compra, haze, (opcional) bicho.

Um sistema por PR. Não empilhar.

---

## Alvo visual (o que as capturas pedem)

| Camada | Nas fotos | Aqui |
|---|---|---|
| Relevo | morros rolantes, vales rasos, sem grade | 4–12 m longe da cidade; 0 no asfalto (blend 20–30 m) |
| Chão | terra na trilha, grama no resto, pedra no afloramento | splat 2–3 albedos no shader do tile |
| Grama | carpete, tornozelo→joelho, plano escondido | tufos Quaternius densos + 4 malhas; **ainda tufos, não lâmina GPU** |
| Flores | papoula, espiga roxa, amarelo, branco | 3 papéis de cor, clusters Poisson |
| Arbusto | camada entre grama e árvore | beira de vale e bosque, **fora** do leito |
| Árvore | agrupadas, copa cheia | bosques + `THREE.LOD` |
| Caminho | rede irregular, largura de cavalo, borda viva | splines + corredor limpo + ombro comido |
| Horizonte | floresta-parede + montanha azul | `FogExp2` + silhueta |
| Céu | azul + cúmulo | `Sky.js` por último |
| Bicho | poucos, vivos | só se o pack animado estiver no disco |

“Qualidade e quantidade de itens na tela” = estas camadas **ao mesmo tempo** na média distância, como nas refs — não uma delas sozinha.

---

## Compra (para o código ficar simples)

`public/models/nature/` não tem 40 árvores nem 35 plantas. Para encher a tela sem inventar mesh:

### Obrigatório — Stylized Nature MegaKit [Source] — **JÁ COMPRADO**

- Zip no Windows: `C:\Users\ricei\OneDrive\Documents\Easyplay\repositorios\quaternius\Stylized Nature MegaKit[Source].zip` (~685 MB, 02/09/2026)
- Inventário real do zip: **116** `.gltf` em `glTF/`, mais FBX/OBJ/Blends, `License_Source.txt`, previews
- `Engine Projects/` (Godot / Unity URP / UE) = **não usar** (shaders de engine; vento continua sendo o nosso `windMaterial`)
- CC0; pasta no jogo (só o que o scatter citar):

```
public/models/stylized-nature/Exports/glTF/   # ≤ 15 glTF + texturas que eles apontam
```

Zip fica fora do git (igual Downtown). Listar oficiais em `SOURCE_SWAP.md` no Passo 10.

#### O que o Source acrescenta ao Nature que já está em `public/models/nature/` (~68 glTF)

Novos úteis pro Witcher (não estão no pack antigo): `Birch_*`, `CherryBlossom_*`, `TallThick_*`, `GiantPine_*`, `Bush_Large*`, `Bush_Long_*`, `Grass_Wheat`, `Grass_Wide_*`, `Flower_1/2/6/7_*`, `Plant_2`–`6`, `Rock_Big_*`, `Fern_2`, `Noise_Wind.png`, `Noise_Perlin.png`, folhas extras (`Leaves_Birch`, `Leaves_CherryBlossom`, `Leaves_TallThick`, …).

O degrau 1 **continua** no Nature antigo. O Source entra no **Passo 10**.

#### Shortlist travada (≤ 15 glTF novos no `public/`)

| # | glTF | Papel Witcher |
|---|---|---|
| 1 | `Grass_Wide_Tall` | carpete denso |
| 2 | `Grass_Wide_Short` | carpete baixo |
| 3 | `Grass_Wheat` | variedade de altura |
| 4 | `Flower_1_Group` | mancha cor A |
| 5 | `Flower_2_Group` | mancha cor B |
| 6 | `Flower_7_Group` | espiga alta |
| 7 | `Bush_Large_Flowers` | camada média florida |
| 8 | `Bush_Long_1` | quebra-vale / beira (fora do leito) |
| 9 | `TallThick_1` | árvore guarda-chuva |
| 10 | `TallThick_2` | variante |
| 11 | `Birch_1` | bosque claro |
| 12 | `CherryBlossom_1` | pomar (1 espécie) |
| 13 | `GiantPine_1` | horizonte |
| 14 | `Plant_5` | planta vertical |
| 15 | `Rock_Big_1` | afloramento |

Texturas que sobem junto (não contam no teto de 15): as que esses glTF referenciam + `Noise_Wind.png` / `Noise_Perlin.png` + `PathRocks_Diffuse.png` se faltar no splat.

`CommonTree_*`, `Grass_Common_*`, `Grass_Wispy_*`, `Flower_3/4_*` já no Nature — reutilizar, não duplicar.

### Opcional — animais / cavalo

- [Ultimate Animated Animal Pack](https://quaternius.com/packs/ultimateanimatedanimals.html) — 12 bichos, glTF + clips. 3–6 meshes idle/walk, sem instancer animado. Só se o zip estiver no disco.
- Cavalo como **veículo** (montar, seguir a trilha) é o destino do norte Witcher. **Não** é este PR. A trilha e a física aberta já nascem prontas para ele. Quando vier, entra neste sistema, não num mapa novo.

Não comprar terrain Unity com nome parecido. Não photogrammetry / Nanite / shader store.

---

## Three.js nativo — o que entra a mais

| Sistema | API | Nota |
|---|---|---|
| Heightmap | `PlaneGeometry` por tile + `ImprovedNoise` 4 oitavas | um `heightAt` só |
| Splat | `ShaderMaterial`: grama / terra / pedra + máscara | máscara = ruído + distância à spline |
| Grama densa | growing instancer por `(glTF × chunk 20–30 m)` | nunca o prado inteiro |
| LOD árvore | `THREE.LOD` | full / low / some copa |
| Vento | `uGust` + papéis grama / flor / folha | |
| Haze | `FogExp2` | cidade a 100 m ainda lê |
| Sky | `addons/objects/Sky.js` | último |
| Física aberta | Cannon `Heightfield` **por tile** | paredes já saíram no simples; aqui o relevo é alto demais para caixa média |

Sem `THREE.Cache`. Sem `BatchedMesh` neste MVP. Sem `compile(cena)`.

---

## Relevo (nível das fotos)

Outer visual ~**±320–360 m**. Física acompanha os tiles que existem (crescer mapa = mais tiles, mesmo código).

```
n = fbm(x * 0.012, z * 0.012, octaves=4)
ridge = abs(n)
amp = mix(4, 12, saturate(distOutside / 80))
y = ridge * amp * cityBlend
```

- `cityBlend` 20–30 m. Sem degrau no asfalto.
- 1–2 vales largos (frequência baixa) para o olho ler monte de verdade.
- `slopeAt > 0.65` → splat pedra, sem grama alta.
- No **leito da trilha**: amplitude amenizada (o caminho “corta” o morro como nas refs, slope < ~0.25).

Tiles **30 × 30 m**, ~2 m/seg. Task + yield.

---

## Caminhos de terra — rede para cavalgar

Nas fotos a trilha é o jeito de **atravessar** o mundo, não um decal. Aqui também.

| | |
|---|---|
| Largura útil | **4–5 m** (cavalo folgado; dois corpos se cruzam no aperto) |
| Ombro vivo | 1,5–2,5 m; grama curta + flor rala **comem** a terra; sem arbusto no eixo |
| Falloff | 2–4 m + ruído fino (sem linha de shader) |
| Rede | **4–8** splines: saídas em **todas** as bordas da cidade (alinhadas às ruas/T/curvas), 1–2 cruzamentos, 1 anel que contorna a cidade a ~40–80 m |
| Comprimento | 120–250 m cada, morrem em bosque ou noutra trilha — não no void |
| Leito | 5–12 cm abaixo do campo; albedo terra; **proibido** tufo alto / árvore / rocha média no corredor (eixo + 2,4 m) |
| Física | o Heightfield do tile **é** o leito. Cavalo/Porsche não “sobem na grama invisível” |

1. `paths.js`: splines seed fixo + `distToPath(x,z)` + `pathFrame` (eixo, tangente) para spawn futuro do cavalo.
2. Máscara G do splat = `smoothstep` da distância à spline.
3. Albedo terra: MegaKit ou `PathRocks_Diffuse`. Grama: `Grass.png`. Pedra: `Rocks_Diffuse`.
4. Um programa de chão para todos os tiles.
5. `RockPath_*` só em curva fechada e na boca da cidade (asfalto → terra).

Aceite da trilha: **cavalgar / dirigir uma volta** saindo de um T, cruzando um cruzamento, entrando num bosque e voltando à cidade, sem clipar vegetação no leito.

---

## Vegetação densa (quantidade na tela)

GPU grass (lâmina) **não** entra agora. Densidade Witcher neste motor = **mais instâncias + mais espécies + chunks menores + LOD de scatter**.

Chunks **20–30 m**. `reveal` só da célula no anel. Dirigir no aberto puxa o próximo chunk na frente.

| # | Conteúdo | Perto da câmera | Notas |
|---|---|---|---|
| 1 | `Grass_Common_Short` + `Grass_Wispy_Short` | 0,8–1,2 m | carpete; sem sombra; **fora** do leito |
| 2 | `Grass_Common_Tall` + `Grass_Wispy_Tall` | 1,4–2,0 m | joelho |
| 3 | Flores (Nature + MegaKit, **≤ 6** glTFs) | clusters 8–15 m | 3 cores, não 20 arquivos |
| 4 | Clover + petal | vale + **ombro** da trilha | a borda “viva” das fotos |
| 5 | Arbusto / plant big | vale e beira de bosque | `castShadow`; longe do eixo |
| 6 | Árvores LOD | 8–14 m no bosque | 3–5 espécies; 7 leaf maps se for o mesmo programa |

Longe (> 50 m Chebyshev): camadas 2, 5, 6, espaçamento ×2.

Dezenas de milhares de tufos no total, batches 4–32. Precisou 10 k no mesmo mesh → **parte** noutro instancer do mesmo glTF.

Folha MegaKit: 7 variedades = clone de Lambert + outro mapa, **um** parse.

---

## Vento “vivo”

1. `uGust = sin(uTime * 0.35 + 0.1 * worldX)` — o campo inteiro respira junto.
2. Flor alta / espiga `1.1×`.
3. Copa só em vértice de folha. Tronco `aBend = 0`.

Um programa herbácea, um folha. Tronco+folha no mesmo material do glTF → separar no prepare (MAP).

---

## Bosque, horizonte, haze

- 8–15 bosques: 6–20 árvores, mais densos no fundo da câmera inicial (parede verde).
- Trilha **entra** em pelo menos 2 bosques (nas fotos o caminho some entre troncos).
- `THREE.LOD`: 0 full; ~45 m low; ~90 m some copa se draw alto com `+prog = 0`.
- Horizonte: pinheiros sem sombra, prio 5 tardio, ou silhueta (plane + noise). Crescer o open world depois = mais tiles, não um segundo motor.
- `FogExp2` azul-claro.

---

## Stream e hitch

Prio **4** tiles + splat + leito. Prio **5** vegetação / bosque / horizonte. Depois dos prédios.

Anéis 10 m **não morrem** na cidade: o mapa aberto é o mesmo `pumpTo` / `continueAfter`, raio maior.

MegaKit: **≤ 15** glTFs no `public/`. `waitUntilSmooth` + `waitIfSlow` entre URLs.

Sombra: grama off; arbusto+árvore depois de `resumeShadows`. Sem sombra cedo no campo.

Log fraco → o único FAÇA do ciclo é loadLog/HUD.

Hitch da VM ≠ FPS do Windows.

---

## Física / jogo

Já é mapa aberto (simples tirou as paredes). Aqui o relevo é maior: Heightfield **por tile 30 m** é obrigatório, não caixa média.

- Mesmo `heightAt` no visual, na trilha e no body.
- Tile nasce → heightfield nasce na mesma task (fatiado).
- Void além do outer: respawn no último `pathFrame` ou na cidade.
- Não copiar para OneDrive Windows; branch + PR no GitHub.

Não misturar “15 glTFs + Heightfield + Sky + animais” num branch.

---

## Arquivos (quando for implementar)

| Arquivo | Função |
|---|---|
| `src/world/terrain/heightField.js` | fbm 4 oitavas, slope, cityBlend, leito amenizado |
| `src/world/terrain/splatMaterial.js` | 1 programa grama/terra/pedra |
| `src/world/terrain/paths.js` | rede 4–8, `distToPath`, `pathFrame` (cavalo futuro) |
| `src/world/terrain/windMaterial.js` | gust + papéis |
| `src/world/terrain/scatter.js` | camadas + recusa de leito + LOD de densidade |
| `src/world/terrain/TerrainWorld.js` | tiles 30 m, prio 4, Heightfield por tile |
| `src/world/terrain/VegetationChunks.js` | chunks 20–30 m, prio 5 |
| `src/world/terrain/TreeLod.js` | `THREE.LOD` + 3–5 espécies |
| `SOURCE_SWAP.md` | Stylized Nature oficial, o que não instanciar |
| `OPTIMIZATION_LOADING.md` | prio 4/5, anéis no aberto |
| `OPTIMIZATION_MAP_ITEMS.md` | splat, cap de instancer, trilha, sombra |

Animais se o zip existir: `Critters.js` — 3–6 `AnimationMixer`, prio 5 tardio.

Cavalo (futuro, mesmo norte): veículo no `pathFrame`, não um mundo novo.

---

## Passos de implementação (ordem)

1. Extrair shortlist do Source já comprado (zip no disco). ≤ 15 glTFs em `public/…`. `SOURCE_SWAP.md`.
2. Amplitude + tiles 30 m + blend 25 m. Play aberto (já sem parede).
3. Heightfield por tile no relevo novo. Subir um vale de 8 m e voltar.
4. Splat + rede de trilhas (saídas nas 4 bordas + 1 cruzamento). Volta a cavalo/Porsche.
5. Grama camadas 1–2 em chunks 20 m, vento com gust. Travamentos; se > 1 s, **para e patch**.
6. Flores (3 cores) + clover no ombro da trilha.
7. Bosques + LOD; 2 trilhas entram no bosque.
8. FogExp2 + silhueta.
9. (Opcional) Sky.js.
10. (Opcional) 3 animais idle.

Um sistema por PR.

Pronto quando: sai da cidade por uma trilha, o olho lê pradaria Witcher (volume, carpete, flor, bosque, haze), o leito está livre para cavalgar, vento contínuo, stream fatiado, Travamentos sem frame > 2 s na VM (> 1 s = ponto real).

---

## Fora de escopo (deste degrau — não do norte)

Vamos chegar. Não agora, no mesmo sistema.

- Continente / mapa >> 360 m (é mais tile, não outro motor)
- GPU grass / compute
- Shader Godot/Unity do zip
- Photogrammetry, Megascans, Nanite
- Cavalo jogável, fauna densa, IA
- Rio, chuva no mato, ciclo dia/noite no campo (quando vier, tem que **servir** o Witcher, não um céu genérico)
- Substituir Downtown por campo

---

## Critério de aceite

- Mapa **aberto**: circular o campo e voltar à cidade por uma trilha.
- Relevo no nível das refs (lê monte e vale; blend zero na cidade).
- Tela cheia de vegetação em camadas na média distância; vento em grama, flor alta e folha.
- Rede de terra: largura de cavalo, borda viva, pelo menos um cruzamento e duas entradas de bosque; leito sem clip.
- ≤ 15 glTFs novos, oficiais.
- Nenhum instancer = campo inteiro; compile só do que revelou.
- Qualquer recorte de escopo **mantém** o norte Witcher (adiar densidade ≠ trocar por estilo low-poly morto).
- Hitch daqui é desta VM. Windows valida o Ricardo.
