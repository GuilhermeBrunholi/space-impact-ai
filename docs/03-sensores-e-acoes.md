# 03 — Sensores e ações

Este documento explica o que a IA **enxerga** e o que ela **consegue fazer**. É a parte mais importante de todo
o projeto: uma rede neural só aprende o que estiver nas entradas dela. Se a informação não chega, nenhum treino
resolve — foi exatamente o que aconteceu com o terreno das fases 5 e 6 (ver
[09 — Diário de decisões](09-diario-de-decisoes.md#fases-5-e-6-a-rede-não-enxergava-o-terreno)).

## Fatos do jogo que os sensores usam

| Fato | Valor | Onde está no `game.js` |
|---|---|---|
| Tamanho da tela | 840 × 480 px | `mainCanvas.width/height` |
| Tamanho da nave | 100 × 70 px | `Player` (`width`, `height`) |
| Área que colide da nave (hitbox) | 90 × 50 px, 10 px abaixo do topo | `new Hitbox(x, y, width − 10, height − 20, 0, 10)` |
| Velocidade da nave | 2,5 px/frame na horizontal, 3 px/frame na vertical | `Player.speedX`, `speedY` |
| Limites da nave | `y` de 50 (abaixo do placar) a 410 (480 − 70); `x` de 0 a 740 (840 − 100) | `Player.update` |
| Posição de qualquer objeto | `x`, `y` = **canto superior esquerdo**; tamanho em `width`, `height` | todas as classes |
| `spriteSize` | só o recorte da imagem na folha de sprites — **não** é o tamanho no jogo | |

Convenções de velocidade (cada classe do jogo tem a sua):

| Objeto | Campo | Movimento |
|---|---|---|
| `Projectile` (tiro comum) | `speed` | `x += speed` (negativo = para a esquerda) |
| `EnemyMissile` (míssil teleguiado) | `speedX`, `speedY` | `x -= speedX` |
| Inimigos | `speedX` | `x -= speedX` |

Nos sensores tudo é convertido para uma convenção só: **`vx` negativo = indo para a esquerda**.

## Camada 1 — `getState()` (ai.js)

Lê o jogo e devolve um objeto "limpo", sem referências às classes do jogo:

```js
{
  player: { x, y, width, height, hitbox: { y, height } },
  lives, score, specialCount, specialType,         // globais do jogo
  enemies:          [{ x, y, width, height, vx, movement, isPowerUp, powerup }],
  enemyProjectiles: [{ x, y, width, height, vx, vy, homing }],
  terrain:          [{ x, y, width, height }],     // hitboxes do cenário (chão, teto, pilares)
}
```

- `enemies` inclui os **chefes** (Boss1–8, até 380 × 380 px) — eles vivem em `currentLevel.enemies` como os outros.
- `enemies` também inclui os **itens coletáveis** (`PowerUp`: vida, míssil, laser ou parede). Eles **não machucam**:
  encostar neles dá vida ou munição. `isPowerUp: true` os distingue e `powerup` diz qual é. Antes disso a rede os
  tratava como inimigos e fugia deles.
- `enemyProjectiles` mistura `EnemyMissile` (`homing: true`) e tiros comuns de inimigos (`Projectile`).
- `terrain` vem de `currentLevel.background[].hitbox[]`. **Encostar no terreno mata, mesmo com escudo.**

O `getState()` é usado tanto pelo cérebro de regras (que trabalha com pixels) quanto pela rede (que precisa de
números normalizados — próxima camada).

## Camada 2 — `getInputs(state)` (brain-nn.js)

Transforma o estado numa **lista fixa de 19 números entre 0 e 1**. Fixa porque a rede tem exatamente 19 entradas:
se um número faltar (por exemplo, quando não há tiros na tela), tudo desalinha.

| # | Nome no painel | Como é calculado | 0 significa | 1 significa |
|---|---|---|---|---|
| 0 | Altura nave | `normalize(y, 50, 410)` | topo | base |
| 1 | Horizontal nave | `normalize(x, 0, 740)` | borda esquerda | borda direita |
| 2 | Existe tiro? | 1 se há tiro inimigo à frente | não há | há |
| 3 | Dist. tiro | distância horizontal até o tiro mais próximo | colado | longe |
| 4 | Altura tiro | diferença vertical entre os centros | tiro bem acima | tiro bem abaixo (0,5 = alinhado) |
| 5 | Existe inimigo? | 1 se há inimigo à frente | não há | há |
| 6 | Dist. inimigo | igual ao 3, para inimigos | colado | longe |
| 7 | Altura inimigo | igual ao 4, para inimigos | inimigo bem acima | bem abaixo |
| 8 | Tem especial? | `specialCount > 0` | sem munição especial | tem |
| 9 | Espaço acima | espaço livre até o teto | encostando no teto | 150 px ou mais livres |
| 10 | Espaço abaixo | espaço livre até o chão | encostando no chão | 150 px ou mais livres |
| 11 | Existe item? | 1 se há item coletável à frente | não há | há |
| 12 | Dist. item | igual ao 3, para itens (largura máxima 80) | colado | longe |
| 13 | Altura item | igual ao 4, para itens | item bem acima | bem abaixo |
| 14 | Item é vida? | o item mais próximo é uma vida | outro item (ou nenhum) | vida |
| 15 | Perigo tiro | urgência do tiro que vai acertar a nave primeiro | nada vem na direção da nave | impacto agora |
| 16 | Onde: tiro | altura (com folga) de onde o tiro vai passar, em relação à nave | bem acima | bem abaixo (0,5 = alinhado) |
| 17 | Perigo inimigo | igual ao 15, para inimigos | nada vem | impacto agora |
| 18 | Onde: inimigo | igual ao 16, para inimigos | bem acima | bem abaixo |

### Normalização

```js
function normalize(value, min, max) {
    return Math.min(1, Math.max(0, (value - min) / (max - min)));   // min-max, preso entre 0 e 1
}
```

Por que normalizar: os pesos da rede multiplicam as entradas. Se uma entrada vai de 0 a 740 e outra de 0 a 1, a
primeira domina tudo. Com todas entre 0 e 1, cada entrada começa com a mesma chance de influenciar.

O **método** usado para achar o `min` e o `max` de cada entrada (e que vale para qualquer sensor novo):

1. ler no código onde o jogo limita aquele valor;
2. registrar (`console.log`) o valor real nos extremos, jogando;
3. comparar teoria e medição;
4. normalizar e conferir que o resultado fica perto de 0 e de 1 nos extremos.

Exemplo real: a altura da nave. A primeira tentativa dividia por 480 (a altura da tela) e o máximo medido era 0,86.
Por quê? A nave tem 70 px de altura e `y` é o **topo** dela, então o maior `y` possível é 480 − 70 = 410. E o menor
não é 0, é 50 (o placar ocupa o topo). Com `normalize(y, 50, 410)` os extremos medidos ficaram em −0,003 e 1,006 —
a pequena sobra é o jogo deixando passar 1 frame antes de travar, e o `Math.min/max` cuida disso.

### `describeNearest()` — tiros e inimigos

A mesma receita serve para tiros (entradas 2–4) e inimigos (5–7):

1. **Filtra** os objetos que ainda importam: `obj.x + obj.width >= player.x` (ainda não passaram totalmente pela
   nave) e `obj.x < 840` (já entraram na tela — inimigos nascem fora da tela, em x até 2280).
2. Se não sobrou nenhum, devolve `[0, 1, 0.5]`: **existe = 0**, e os outros dois são só preenchimento.
3. Senão pega o **mais próximo em x** e calcula:
   - distância = `nearest.x − (player.x + player.width)` (da ponta da nave até o objeto), normalizada entre
     `−(maior largura do objeto + 100)` (objeto quase saindo pela traseira) e `740` (nave na esquerda, objeto na
     borda direita). A maior largura é 50 para tiros (`EnemyMissile`) e 380 para inimigos (Boss8);
   - diferença vertical entre os **centros**, normalizada entre `−395` e `+395` (`480 − (50 + 35)`).

Por que a entrada "existe?": sem ela, "não há inimigo" virava `[1, 0.5]` = "inimigo longe e alinhado", que é uma
situação real e diferente. A flag avisa a rede para ignorar os outros dois números.

Por que posição **relativa** e não absoluta: a rede precisa saber "o inimigo está acima de mim", não "o inimigo está
em y = 230". A posição absoluta da nave já entra nas entradas 0 e 1.

Nos inimigos (entradas 5–7) os itens coletáveis ficam **de fora**: eles têm o sensor próprio, 11–14.

### `describeDanger()` — perigo iminente (entradas 15–18)

"O tiro mais próximo" não diz se ele vai **acertar**: um tiro 100 px à frente, mas 200 px acima, é inofensivo; um
tiro mais longe, na altura da nave, não. Para cada tiro (ou inimigo) à frente, a função **projeta o movimento em
linha reta** até a ponta da nave:

1. `tempo = distância ÷ velocidade de aproximação` (em frames); se o objeto se afasta, é ignorado;
2. só conta o que chega em até **60 frames** (1 s, `DANGER_HORIZON`);
3. a altura do objeto nesse instante (`y + vy × tempo`), com **20 px de folga** em cima e embaixo
   (`DANGER_MARGIN`, porque a nave também se mexe até lá), cruza a hitbox da nave?
4. dos que cruzam, vale o que chega **primeiro**.

Saída: `[urgência, altura]`. Urgência = `1 − tempo ÷ 60` (0 = nada vem, 1 = impacto agora); a altura diz **para que
lado desviar**. Limite: os inimigos não informam `vy`, então valem como se andassem em linha reta (ondas e zigue-zague
fogem disso); só os mísseis teleguiados informam `vy`. A folga cobre parte do erro. O terreno não entra aqui — já tem
os sensores 9 e 10.

### `describeTerrain()` — espaço acima e abaixo

Olha a **faixa** que vai da traseira da nave até 150 px à frente da ponta (`TERRAIN_LOOKAHEAD`). Para cada bloco de
terreno nessa faixa:

- se o centro do bloco está **acima** do centro da hitbox da nave → é **teto**: o teto fica na base do bloco;
- senão → é **chão**: o chão fica no topo do bloco (um pilar logo à frente conta como chão alto).

Sem terreno, o teto é o limite da área de jogo (50) e o chão é a borda da tela (480). O resultado é o espaço livre
entre a **hitbox** da nave e o teto/chão, normalizado entre 0 e 150 px (`TERRAIN_RANGE`): mais longe que 150 px é
"bastante espaço" e vale 1.

Exemplos medidos logo após o início de cada fase:

| Fase | Espaço acima | Espaço abaixo | Por quê |
|---|---|---|---|
| 1 | 1,00 | 1,00 | sem terreno |
| 3 | 1,00 | 0,93 | chão com pilares |
| 5 | **0,10** | 1,00 | teto a só 15 px da nave |
| 6 | 0,90 | 1,00 | teto mais alto no começo |
| 7 | 1,00 | 1,00 | chão em y = 430, a 150 px |

## Camada 3 — ações e `act(action)` (ai.js)

Todo cérebro devolve o mesmo formato:

```js
{ up, down, left, right, fire, special }   // true = tecla apertada neste frame
```

`act()` aplica a ação:

| Ação | Como é aplicada | Restrições |
|---|---|---|
| `up`, `down`, `left`, `right` | escreve em `keys.ArrowUp.pressed` etc. — o `Player.update` do jogo lê isso e move a nave | `up` + `down` juntos **se anulam** (sobe 3 e desce 3 no mesmo frame) |
| `fire` | cria `new Projectile(true, player)` direto, como o `keydown` da barra de espaço | no máximo 1 tiro a cada `fireCooldown` (200 ms) |
| `special` | cria `Missile`, `Laser` ou `Wall` conforme `specialAtttack`, e desconta `specialCount` | precisa ter munição; no máximo 1 a cada `specialCooldown` (1000 ms) |

### Por que os intervalos (cooldowns)

O tiro no jogo original só acontece no **`keydown`** — um humano precisa soltar e apertar de novo. A rede, se pudesse,
apertaria a cada frame e criaria **60 tiros por segundo**: um "tiro infinito" que nenhum humano consegue e que
estraga o aprendizado (ela ganharia sem precisar mirar). Isso é um exemplo de *reward hacking* — a IA explora uma
brecha em vez de aprender a jogar.

O intervalo fica no `act()`, e não no cérebro, para valer **para qualquer cérebro** (regras ou rede).

### Por que contar o tempo em frames

`aiFrame` conta frames do jogo, e o intervalo é `(aiFrame − lastFireFrame) × 16,7 ms`. Se fosse medido no relógio
(`performance.now()`), o treino acelerado — que roda dezenas de frames do jogo em poucos milissegundos reais —
dispararia muito menos do que deveria. Em frames, 200 ms de jogo são sempre 12 frames, em qualquer velocidade.

### Fim de fase: a IA solta tudo

Quando o chefe morre, o próprio jogo assume a nave e faz uma animação até a borda direita (sobe até o topo e anda
para a direita; nas fases 5 e 6 desce em vez de subir); só então a fase seguinte começa. Se a IA segurasse uma seta contra essa animação, a nave nunca chegaria lá. Por isso `aiStep()` faz:

```js
if (currentLevel.levelComplete) { act(RELEASE_ALL); return RELEASE_ALL; }
```

## O cérebro de regras (brain-rules.js)

Para comparação, o cérebro escrito à mão:

- **sempre atira**;
- procura **ameaças**: inimigos que se sobrepõem verticalmente à nave (`sameRow`), estão à frente (`ahead`) e a
  menos de 250 px (`DANGER_DIST`);
- pega a ameaça mais próxima e move a nave para cima ou para baixo conforme o centro da ameaça.

A direção do desvio é **invertida de propósito** (vai *em direção* ao lado da ameaça): foi uma escolha do autor
durante os estudos e foi mantida.
