# Terreno aberto — passos por domínio

## Backup

Branch `backup/pre-open-terrain` @ `6d1967c` (#29).

## Kit Source (status)

Zip: `…/repositorios/quaternius/Stylized Nature MegaKit[Source].zip` — **já no disco**. 116 glTF em `glTF/`. Shortlist travada no `MVP_TERRAIN_WITCHER.md`. Entra no **Passo 10**, não antes. `Engine Projects/` ignorado.

## Como cada passo funciona

Um domínio por vez. Hitch loop até aceitar; só então o próximo.
Sem `THREE.Cache`, sem `compile(scene)`, sem InstancedMesh gigante.
North star: Witcher 3 (paisagem legível, densidade local, não um mapa infinito genérico).

## Degrau 1 (simples, zero compra) — passos 0–9

| Passo | Domínio | Aceite | Por que sozinho | Loop |
|------:|---------|--------|-----------------|------|
| 0 | Docs (opcional) | Roadmap e checklist alinhados com o time | Evita retrabalho antes de código | Ler → ajustar → ok |
| 1 | Mapa aberto + `heightAt` + tiles 40 m + remover 4 paredes Cannon | Mundo contínuo sem caixas; altura consultável; tiles de 40 m | Muda a base espacial e física do chão | Abrir mapa → hitch → aceitar altura/tiles |
| 2 | Física Heightfield por tile | Colisão/ride alinhados ao heightmap do tile | Física isolada do visual | Gerar HF → testar hitch → aceitar |
| 3 | Primeiro caminho de terra ~4 m rideable | Faixa transitável ~4 m sem buracos | Valida rideabilidade antes de vegetação | Colocar path → hitch → aceitar |
| 4 | Material de vento + 200 `Grass_Common_Tall` | 200 tall grass com vento, estável | Capacidade de shader/material sem scatter | Material + 200 → hitch → aceitar |
| 5 | Scatter de grama prio 4, recusa leito do path | Densidade no campo; path livre de grama | Scatter sem misturar com flores/árvores | Scatter prio 4 → hitch → aceitar |
| 6 | Flores + arbustos | Camada baixa colorida e arbustos | Separado da grama e das árvores | Colocar → hitch → aceitar |
| 7 | Bosques de árvores | Groves legíveis, LOD ok no Degrau 1 | Árvores pesam; isoladas | Groves → hitch → aceitar |
| 8 | Rede de 2–4 caminhos | 2–4 paths conectados, rideable | Rede depois do path piloto | Expandir → hitch → aceitar |
| 9 | Gate: checklist MVP simples + hitch estável | Checklist verde; hitch estável no loop | Gate antes do Degrau 2 | Checklist + hitch → aceitar |

## Degrau 2 (Witcher) — passos 10–15 (somente após o 9)

| Passo | Domínio | Aceite | Por que sozinho | Loop |
|------:|---------|--------|-----------------|------|
| 10 | Extrair shortlist do Source já comprado ≤15 glTFs + `SOURCE_SWAP` | ≤15 glTF da shortlist; swap documentado | Assets já no disco; só extrair/listar | Extrair shortlist → hitch → aceitar |
| 11 | Amplitude 4–12 m + splat | Relevo 4–12 m com splat coerente | Relevo + splat juntos no visual | Amplitude/splat → hitch → aceitar |
| 12 | Grama densa em chunks 20–30 m, prio 5 + `uGust` | Chunks 20–30 m; prio 5; vento `uGust` | Densidade + vento avançado | Chunks → hitch → aceitar |
| 13 | Flores 3 cores + ombro do path | 3 cores; ombro do caminho preenchido | Detalhe fino pós-grama densa | Flores/ombro → hitch → aceitar |
| 14 | LOD de árvores + 4–8 paths | LOD estável; rede 4–8 paths | LOD + rede juntos no Degrau 2 | LOD + paths → hitch → aceitar |
| 15 | `FogExp2` + Sky/animais opcionais | FogExp2; Sky/fauna opcional sem quebrar hitch | Atmosfera no fim | Fog (+opcional) → hitch → aceitar |

## Fora de escopo por agora

Cavalo como veículo, fauna densa, rio, mapa ≫360 m, grama GPU.

## Ordem e próximo passo

Ordem: 0→1→…→9, depois 10→…→15. Próximo a implementar quando o usuário disser **pode começar** = **Passo 1**.
