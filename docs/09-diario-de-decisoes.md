# 09 — Diário de decisões

Este é o registro, em ordem, dos problemas encontrados, de **como foram descobertos** e de **por que** cada solução
foi escolhida. É a parte mais útil para estudar: quase todo avanço veio de medir algo e descobrir que a hipótese
estava errada.

---

## Fase 0 — Observar antes de controlar

Antes de qualquer cérebro, a IA só **lia** o jogo: um `setInterval` imprimia o estado com `console.table` (o trecho
continua comentado no fim de `ai.js`). Foi assim que apareceram os primeiros fatos:

- `x`/`y` são o **canto superior esquerdo**; `spriteSize` é o recorte da imagem, não o tamanho no jogo.
- Cada classe tem sua convenção de velocidade: `Projectile` usa `speed` com `x += speed`; `EnemyMissile` e inimigos
  usam `speedX` com `x -= speedX`. **Decisão:** os sensores convertem tudo para `vx` com sinal único (negativo =
  esquerda).

## Atirar: de `keys.space` a criar o tiro direto

**Problema:** a primeira ideia, `keys.space.pressed = true`, não atira. No jogo, o tiro só é criado dentro do
**`keydown`** — o `keys.space` só serve para impedir tiro repetido segurando a tecla.

**Tentativa 2:** disparar um `KeyboardEvent` sintético. Funciona, mas quebra no treino acelerado (vários frames por
evento) e depois de reiniciar a fase (cada `Level` tem seu próprio ouvinte de teclado).

**Decisão:** `act()` cria o tiro exatamente como o `keydown` cria: `new Projectile(true, player)`. Mesmo efeito,
sem depender de eventos.

## O tiro infinito

**Problema:** criando o tiro direto, a IA atirava **a cada frame** — 60 tiros por segundo, uma parede de balas que
nenhum humano consegue. Isso é *reward hacking*: a IA ganharia explorando uma brecha, sem aprender a jogar.

**Decisão:** intervalo mínimo entre tiros (`fireCooldown`, 200 ms, ritmo de um humano apertando rápido), dentro de
`act()` para valer **para qualquer cérebro**. Depois, o mesmo para a arma especial (`specialCooldown`, 1 s).

## Normalização: medir em vez de chutar

**Problema 1:** a altura da nave foi normalizada como `y / 480` e o máximo medido foi **0,86**. A teoria explicou a
medição: `y` é o topo da nave (70 px de altura), então o maior `y` é 410; e o menor é 50 (o placar). Com
`normalize(y, 50, 410)`, os extremos medidos ficaram em −0,003 e 1,006.

**Problema 2:** a posição horizontal como `x / 840` dava máximo 0,88. A pergunta foi: *"Ao considerar 740 não está
desconsiderando uma parte da nave? Já que a ponta encosta na borda"*. Não está: `x` é a traseira; quando a ponta
encosta na borda, `x = 840 − 100 = 740`. Então 740 é exatamente "encostado".

**Lição registrada como método** (ver [03](03-sensores-e-acoes.md#normalização)): ler o limite no código → medir os
extremos → comparar → normalizar e conferir ≈ 0 e ≈ 1.

## Entradas de tamanho fixo e a flag "existe?"

**Problema:** quando não havia tiro na tela, o código pulava as entradas do tiro e a lista ficava menor. A rede tem
um número fixo de entradas — tudo desalinhava (a "distância do inimigo" caía na posição do "tiro").

**Problema seguinte:** preencher "sem tiro" com `0,5` significava "tiro alinhado" — uma situação real e perigosa.

**Decisão:** sempre 3 números por objeto, e o primeiro é uma **flag** (`existe? 0/1`); sem objeto, `[0, 1, 0,5]` e a
rede aprende a ignorar o resto quando a flag é 0.

## "Até agora não vimos nada de IA"

Depois do cérebro de regras, a observação certeira: *"estamos criando comandos para ele reagir ao ambiente, mas
inteligência não existe"*. Regras escritas à mão fazem exatamente o que foi programado.

**Decisão:** **neuroevolução** — rede neural + algoritmo genético. Não há gabarito de "tecla certa" para usar
backpropagation, mas há uma nota no fim de cada partida, e é disso que a evolução precisa. O cérebro de regras ficou
como régua de comparação.

Na mesma época: separação em arquivos (`brain-rules.js`, `brain-nn.js`, `evolution.js`, `training.js`, `ai.js`) e
**todas as variáveis em inglês** (comentários em português).

## Jogar de novo sem recarregar a página

**Problema:** o jogo original cria todos os inimigos de todas as fases **uma vez**, ao carregar, e os altera durante a
partida. Por isso ele recarrega a página para jogar de novo — inviável para milhares de partidas.

**Decisão:** guardar uma cópia intacta de todas as ondas ao carregar e entregar cópias novas a cada partida, com uma
cópia profunda que **preserva a classe** dos objetos e não copia imagens (`cloneGameObject`). E desativar a fase
antiga, porque cada `Level` registra ouvintes de teclado que ficariam vivos.

## O tempo do treino em frames, não no relógio

**Problema:** o intervalo entre tiros medido em milissegundos reais quebra o treino acelerado — 10 frames do jogo
passam em 1 ms real, e a nave quase não atiraria.

**Decisão:** tudo que é tempo de jogo é contado em **frames** (`aiFrame`, `episodeFrames`), com 1 frame = 16,7 ms.

## Pequenos problemas de infraestrutura

| Problema | Causa | Decisão |
|---|---|---|
| Clicar rápido em "Iniciar treino" começava do zero | o treino salvo ainda estava carregando | `startTraining()` faz `await trainingLoaded` |
| Erro 404 no console toda vez que abria a página | não havia treino salvo | `GET` responde `200 null` |
| Dois servidores na mesma porta sem erro (Windows) | `SO_REUSEADDR` | `allow_reuse_address = False` |
| VS Code esperava o servidor para sempre | a linha "Space Impact em http" ficava no buffer | `print(..., flush=True)` |
| Treino guardado só no navegador | `localStorage` | `server.py` grava em `training-data/`; `localStorage` vira plano B |

## A nave parava no fim da fase

**Relato:** *"está parando na 5, quando termina"*.

**Investigação:** no jogo puro, a fase 5 terminava e passava para a 6. Testando com uma tecla segurada: com **↓**
segurada no fim da fase 2, a nave **travava**. No fim de cada fase o jogo anima a nave: sobe 2 px/frame até o topo e
anda para a direita (nas fases 5 e 6, que têm teto, ela **desce** até perto do chão e então anda para a direita). Na
fase 2, a IA descendo 3 px/frame vencia a animação, e a nave nunca chegava à borda.

**Decisão:** quando `currentLevel.levelComplete`, a IA solta tudo. O problema exato da fase 5 não foi reproduzido
naquele momento — e a explicação real apareceu depois (ver abaixo).

## Seletor de fases

Para testar fases específicas sem jogar as anteriores: botões 1–8 que recomeçam a partida na fase escolhida
(`selectLevel`, `resetGame(fase)`), com a cor de fundo certa de cada fase.

## Pontos em cada tela e a arma especial

**Pedido:** *"a nave tem que conseguir o maior número de pontos possíveis em cada tela e pode usar a segunda arma
quando quiser"*.

**Escolhas (feitas com o usuário):**

- cada nave joga **as 8 fases**, cada uma do zero; a fase acaba ao perder a **primeira vida**;
- antes, a partida era contínua com limite de 180 s — e só chegar ao chefe da fase 4 leva ~220 s, ou seja, **o
  treino nunca via a fase 5**;
- a rede ganhou uma saída `special` e uma entrada "tem especial?" (89 → 102 números), com conversão que não perde o
  aprendizado (peso 0 para a entrada nova, conferido: diferença 0 nas saídas antigas).

## Turbo: medir onde o tempo vai

**Pergunta:** *"E se colocarmos mais telas ao mesmo tempo?"*

**Medição:** o computador simulava ~11 mil frames/s desenhando e ~35 mil sem desenhar; o treino usava no máximo
1.800 (30×60). O gargalo era o **teto do slider** e o **desenho**, não o processador.

**Por que mais telas não ajudariam:** o JavaScript de uma página roda num núcleo só (4 telas = 4× mais lentas cada),
e o `game.js` usa variáveis globais — dois jogos na mesma página dividiriam vidas e inimigos.

**Decisão:** modo turbo — roda o máximo de frames que couber em cada quadro, sem desenhar os extras. Detalhe
descoberto testando: o painel de testes rodava a só 19 quadros/s, e um orçamento fixo de 12 ms usava 23% do tempo;
o orçamento passou a acompanhar o ritmo real da tela (75% do intervalo, entre 12 e 50 ms). Resultado: ~18 mil
frames/s numa tela de 60 Hz, ~10× o máximo antigo.

## Fases 5 e 6: a rede não enxergava o terreno

**Investigação:** rodando as naves do treino nas fases 5 e 6, **todas morriam no terreno**, várias em **0,1 s**. A
fase 5 tem o teto **15 px** acima da nave. As redes tinham aprendido nas fases 1–4 (terreno embaixo) que "subir
salva"; na fase 5 subiam e batiam no teto. E, principalmente, a rede **não tinha nenhum sensor de terreno**.

**Decisão:** entradas "espaço acima" e "espaço abaixo" (102 → 114 números, de novo com peso 0 nas entradas novas).

**Teste honesto:** uma evolução curta só nas fases 5 e 6, **com** e **sem** os sensores (o "sem" substituindo a
função por `[1, 1]`). Os dois casos melhoraram: o que mais destravou foi o treino **passar a cobrar** as fases 5 e 6.
Os sensores ajudaram a chegar mais cedo (fase 6 com 1.573 pontos já na geração 2, contra a geração 6 sem eles) — mas
uma rodada só não prova muito, e isso foi dito assim.

## A telemetria encontrou o próximo problema

Com o painel de telemetria pronto, a primeira geração mostrou: **30 de 30 naves morrendo no terreno** das fases 5 e 6,
mesmo com sensores. Hipótese: a nota era a soma dos pontos, a fase 7 valia ~2.000 e a fase 5 ~100 — aprender a fase 5
sumia no ruído da fase 7.

**Decisão:** nota equilibrada (versão 3) — cada fase vale `pontos ÷ recorde`, até 1. Com cuidados: a régua é a mesma
para a geração inteira, piso de 10 no recorde, e a melhor de todas é medida de novo a cada geração
(ver [06](06-treino.md#a-nota-fitness--versão-4)).

## Item coletável era "inimigo"

**Observação:** o subagente que jogou pelo servidor MCP notou que "colidir com inimigos grandes e lentos dá vida
extra". Eram os `PowerUp` (vida, míssil, laser, parede), que o jogo guarda na mesma lista dos inimigos. A rede os via
como ameaça e fugia deles.

**Decisão:** `getState()` passou a marcar `isPowerUp` e o tipo; a rede ganhou sensores próprios para o item mais
próximo (entradas 11–14) e o item saiu do sensor de inimigo. O `brain-rules.js` também os ignora.

## O tiro mais próximo não é o tiro perigoso

**Observação:** "tiro mais próximo" não diz se ele vai acertar. Um agente jogando pelo MCP desviava olhando a altura
de cada tiro e onde ele ia passar — informação que as 11 entradas não tinham.

**Decisão:** sensores de **perigo iminente** (entradas 15–18) para tiros e para inimigos: projetam o movimento em
linha reta, veem se cruza a hitbox em até 1 s (com 20 px de folga) e devolvem urgência e para que lado desviar.
Entradas novas entram no fim e os treinos antigos são convertidos com peso 0 (114 → 162 números).

**Tentativa que não deu certo:** aproveitar a partida do agente como "demonstração" (clonagem de comportamento).
Foram 592 pares estado → teclas; a rede só aprendeu a atirar (cima/baixo ficaram perto do que se acerta nunca
apertando). O motivo: as decisões do agente dependiam da posição exata de cada tiro, que as 11 entradas não mostravam.
Daí a decisão dos sensores acima. Dados e script ficaram em `training-data/claude-demos.json` e `tools/clone_demos.py`.

**Bug achado de passagem:** o servidor MCP mostrava `hitboxTop` somando o `y` duas vezes (nave em y = 220 aparecia com
hitbox em 450). O agente concluiu "a hitbox real é maior que a listada". Corrigido em `mcp-server/server.py`.

## Só se passa de fase matando o chefe

**Observação:** `levelComplete` só vira `true` quando o chefe morre, então, no treino, "cleared" exige vencê-lo. As
redes aleatórias nunca chegavam lá e a nota (só pontos) não diferenciava "morreu antes do chefe" de "chegou nele".

**Decisão:** nota versão 4 — metade da fase vale `pontos ÷ recorde`, metade o progresso contra o chefe (0,3 por chegar
vivo, até 0,95 tirando vida, 1 ao matar). Ver [06](06-treino.md#o-progresso-contra-o-chefe). Num teste, uma nave
aleatória chegou ao chefe e tirou vida dele nas fases 2 e 3 (progresso 0,84 e 0,69).

## Gráficos deslocados

**Problema:** os primeiros gráficos apareciam cortados e deslocados para a esquerda.

**Causa:** o `style.css` do jogo aplica `left: 50%; transform: translateX(-50%)` a **todo** `<canvas>` da página.

**Decisão:** anular isso só nos canvas da telemetria (`.tl-canvas`).

## A nave não descia: saturação dos pesos

**Pergunta:** *"Verifica se existe algum problema para a nave descer"*.

**Investigação, passo a passo:**

1. A tecla funciona: forçando ↓, a nave desce 3 px/frame. (E ↑ + ↓ juntas se anulam.)
2. Medindo as 30 naves: ↑ em 100% dos frames, ↓ em **0%**, em todas.
3. O neurônio de saída `down` tinha **bias −27,5**; sigmoide(−27) ≈ 0. Nenhuma entrada levava a soma perto de 0.
4. Os pesos: nasceram entre −1 e 1, mas depois de 125 gerações a **mediana era 6,3 e o máximo 31**. Nas 30 naves, o
   bias do `down` estava entre −25 e −32.

**Causa:** mutações sem limite se acumulam como um passeio aleatório. Com pesos enormes a sigmoide vira um interruptor
(sempre 0 ou sempre 1), uma mutação de ±0,5 não muda nada e a evolução **trava**. A saída `down` tinha morrido — e a
fase 5 começa colada no teto, onde a única saída é descer. Muito provavelmente era isso o "parando na 5" do começo.

**Decisão:**

- limite de **±4** nos pesos, aplicado na mutação;
- para o treino existente: **reescalar** cada neurônio (dividir pesos e bias pelo mesmo número positivo preserva o
  sinal da soma, ou seja, as decisões) e **sortear de novo as saídas travadas em metade da população**.

**Testado antes de aplicar:** só reescalar não revivia o `down`. Reescalar + reviver em metade: em 8 gerações de teste
a fase 5 foi de 0 para 207 e a fase 6 de 0 para 166. Aplicado de verdade, a primeira geração já mostrou a fase 5 com
**1.213 pontos**.

## Peso de cada tecla

**Pedido:** igualar cima e baixo, diminuir esquerda e direita, tiro com mais peso, especial com o menor.

**Decisão:** um valor fixo somado a cada saída antes da sigmoide (`actionWeights`), ajustável e salvo com o treino.

**Medição:** com valores de ±1 a ±2, quase nada mudava (especial 100% → 99%). Medindo as somas das saídas nas redes
treinadas: mediana **+9 no especial**, +7 no tiro. Os padrões passaram a ser −3 (esquerda/direita), +2 (tiro) e −8
(especial), e o especial caiu para ~27% dos frames. Registrado também: peso igual não iguala um **hábito aprendido**
(↑ 60% contra ↓ 18% com os dois em 0).

## Layout

Várias rodadas a partir de prints do usuário:

1. telemetria embaixo do jogo → dava para ver só rolando a página;
2. duas colunas (jogo + gráficos) e painel enxuto (as barras de entradas/saídas saíram porque o diagrama da rede já
   mostra os mesmos valores);
3. controles, descrição e "botões na tela" no **rodapé**;
4. jogo em **680 px** e gráficos esticando para preencher a altura;
5. o painel flutuante (`position: fixed`) cortava a barra do topo e cobria o rodapé → virou uma **coluna de verdade**
   entre topo e rodapé.

---

## Lições

1. **Meça antes de mudar.** O turbo, os sensores de terreno, a saturação e o peso das teclas só foram resolvidos
   direito depois de uma medição desmentir a primeira hipótese.
2. **A rede só aprende o que está nas entradas.** Sem sensor de terreno, nenhum treino ensinaria a fase 5.
3. **A nota define o que a evolução persegue.** Soma de pontos crus = ignorar fases difíceis.
4. **Dê espaço para a evolução andar.** Pesos sem limite saturam e congelam o aprendizado.
5. **Tempo de jogo ≠ tempo de relógio.** Tudo que é regra do jogo conta frames.
6. **Faça backup antes de mudar o formato do treino** — e escreva a conversão em vez de jogar o treino fora.
7. **Teste de controle.** Comparar "com" e "sem" (sensores) evitou atribuir a uma mudança um ganho que veio de outra.
8. **Cada coisa do jogo precisa de um sensor com o nome certo.** Um item coletável na lista dos inimigos virou
   "inimigo" para a rede.
9. **Dados de demonstração só ajudam se as entradas mostram o que o demonstrador via.**
