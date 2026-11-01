# 10 — Referência do código

Todas as funções, constantes e variáveis globais dos arquivos da IA, arquivo por arquivo. Para o **porquê** de cada
uma, siga os links para os outros documentos.

Convenções do projeto: nomes de variáveis e funções **em inglês**, comentários **em português**, sem bibliotecas,
scripts clássicos compartilhando variáveis globais (a ordem de carregamento está em
[01](01-visao-geral.md#ordem-de-carregamento-dos-scripts)).

---

## Do `game.js` (usado pela IA, não modificado)

| Nome | Tipo | Usado para |
|---|---|---|
| `currentLevel` | `Level` | a fase em jogo: `player`, `enemies`, `enemyProjectiles`, `playerProjectiles`, `playerSpecial`, `background`, `levelComplete`, `active`, `number`, `update(deltaTime)`, `playerDead()` |
| `keys` | objeto | `keys.ArrowUp.pressed` etc. — o que move a nave |
| `lives`, `playerScore`, `specialCount`, `specialAtttack` | globais | vidas, pontos, munição e tipo da arma especial (o nome `specialAtttack` tem 3 "t" no original) |
| `gameOver`, `gamePause`, `isMainScreen` | globais | estado da partida |
| `mainCanvas`, `bgCanvas`, `mainCtx`, `bgCtx` | canvas | tamanho da tela e desenho |
| `Level`, `Projectile`, `EnemyMissile`, `Missile`, `Laser`, `Wall` | classes | criar fases, tiros e armas especiais |
| `enemiesLvl1` … `enemiesLvl8` | arrays de ondas `{ time, object: [...] }` | inimigos de cada fase |
| `checkCollision(a, b)` | função | colisão de retângulos |
| `gameStart()` | função | sai da tela inicial |

---

## `ai.js` — sensores, atuadores e loop

| Nome | Descrição |
|---|---|
| `getState()` | lê o jogo e devolve `{ player, lives, score, specialCount, specialType, enemies, enemyProjectiles, terrain }` ([03](03-sensores-e-acoes.md#camada-1--getstate-aijs)) |
| `FRAME_MS` | `1000 / 60` — duração de um frame do jogo |
| `fireCooldown` | ms mínimos entre tiros (200; painel) |
| `specialCooldown` | ms mínimos entre armas especiais (1000) |
| `aiFrame` | contador de frames da IA (o relógio dos intervalos) |
| `lastFireFrame`, `lastSpecialFrame` | frame do último tiro / especial |
| `act(action)` | aplica `{ up, down, left, right, fire, special }`: escreve em `keys`, cria tiros e especiais respeitando intervalos e munição |
| `createSpecial(level)` | cria `Missile`, `Laser` ou `Wall` conforme `specialAtttack` |
| `brainMode` | `"human"`, `"rules"` ou `"nn"` |
| `network` | a rede que joga no modo `"nn"` |
| `RELEASE_ALL` | ação com todas as teclas soltas |
| `setBrainMode(mode)` | troca o cérebro; sair de `"nn"` pausa o treino; `"human"` solta as teclas |
| `aiStep()` | um passo: sensores → cérebro → `act()`; com fase vencida, solta tudo. Devolve a ação (o treino conta as teclas) |
| `aiLoop()` | roda a cada quadro da tela: `runTrainingFrame()` se treinando, senão `aiStep()` |

## `brain-rules.js` — cérebro de regras

| Nome | Descrição |
|---|---|
| `DANGER_DIST` | 250 px — distância a partir da qual um inimigo é ameaça |
| `decide(state)` | sempre atira; se há ameaça, move para cima/baixo em direção ao lado do centro da ameaça mais próxima |
| `isThreat(player, threat)` | ameaça = mesma faixa vertical (`sameRow`) + à frente (`ahead`) + perto (`close`) |

## `brain-nn.js` — entradas e rede neural

| Nome | Descrição |
|---|---|
| `PLAY_TOP` (50), `PLAY_LEFT` (0) | limites da área de jogo |
| `MAX_SHOT_WIDTH` (50), `MAX_ENEMY_WIDTH` (380) | maiores larguras de tiro e inimigo, para a distância mínima |
| `TERRAIN_LOOKAHEAD` (150), `TERRAIN_RANGE` (150) | alcance e escala dos sensores de terreno |
| `DANGER_HORIZON` (60), `DANGER_MARGIN` (20), `MAX_POWERUP_WIDTH` (80) | horizonte (frames) e folga vertical (px) do perigo iminente; maior largura de item |
| `INPUT_COUNT` (19) | número de entradas |
| `normalize(value, min, max)` | normalização min-max presa entre 0 e 1 |
| `describeNearest(objects, player, maxObjectWidth)` | `[existe?, distância, altura relativa]` do objeto mais próximo à frente |
| `describeTerrain(terrain, player)` | `[espaço acima, espaço abaixo]` |
| `describeDanger(objects, player)` | `[urgência, altura]` do objeto que vai acertar a nave primeiro ([03](03-sensores-e-acoes.md#describedanger--perigo-iminente-entradas-1518)) |
| `describeCollectible(powerups, player)` | `[existe?, distância, altura, é vida?]` do item mais próximo |
| `nearestAhead(objects, player)` | o objeto mais próximo à frente da nave, ou `null` |
| `getInputs(state)` | as 19 entradas ([03](03-sensores-e-acoes.md#camada-2--getinputsstate-brain-nnjs)) |
| `HIDDEN_COUNT` (variável, padrão `DEFAULT_HIDDEN_COUNT` = 6; de `MIN_HIDDEN_COUNT` 2 a `MAX_HIDDEN_COUNT` 32), `ACTION_KEYS`, `OUTPUT_COUNT` (6) | formato da rede |
| `pressThreshold` | limite para apertar (0,5; painel) |
| `actionWeights` | peso fixo de cada tecla (painel; salvo com o treino) |
| `neuron(inputs, weights, bias)` | soma ponderada + bias |
| `sigmoid(x)` | `1 / (1 + e^−x)` |
| `randomWeight()` | número aleatório entre −1 e 1 |
| `createLayer(inputCount, neuronCount)` | camada de neurônios aleatórios `[{ weights, bias }]` |
| `createNetwork()` | rede aleatória `{ hidden, output }` |
| `runLayer(inputs, layer)` | aplica uma camada (soma + sigmoide) |
| `predict(network, inputs)` | entradas → 6 saídas entre 0 e 1 (com `actionWeights`) |
| `nnDecide(state, network)` | `getInputs` → `predict` → teclas acima do limite |

## `evolution.js` — algoritmo genético

| Nome | Descrição |
|---|---|
| `POPULATION_SIZE` (30), `ELITE_COUNT` (2), `TOURNAMENT_SIZE` (3) | parâmetros fixos |
| `mutationRate` (0,1), `mutationStrength` (0,5) | parâmetros do painel |
| `WEIGHT_LIMIT` (4) | limite absoluto de cada peso |
| `networkToGenome(net)` / `genomeToNetwork(genome, hiddenCount)` | rede ↔ lista de números (162 com 6 neurônios) |
| `resizeGenome(genome, from, to)` | muda o número de neurônios escondidos |
| `setHiddenCount(count)` (training.js) | muda o tamanho de todas as redes do treino; diminuir recomeça a geração |
| `randomGenome()` | genoma aleatório |
| `LEGACY_SHAPES`, `genomeLength(inputs, outputs)` | formatos antigos de rede (8→5 e 9→6) |
| `upgradeGenome(genome)` | converte genoma antigo: peso 0 nas entradas novas, saídas novas aleatórias |
| `randomGaussian()` | número normal (Box-Muller) |
| `tournament(population)` | melhor de 3 sorteados |
| `crossover(genomeA, genomeB)` | cruzamento uniforme |
| `mutate(genome)` | mutação gaussiana com limite |
| `clampWeight(value)` | prende entre −4 e +4 |
| `rescaleNeuron(neuron)` | divide pesos e bias pelo mesmo fator até caber no limite (preserva o sinal da soma) |
| `isStuck(neuron)` | o neurônio nunca muda de estado com entradas entre 0 e 1? |
| `repairGenome(genome, reviveStuck)` | reescala tudo e, se pedido, sorteia de novo as saídas travadas |
| `createPopulation()` | 30 genomas aleatórios |
| `nextGeneration(population)` | elitismo + torneio + cruzamento + mutação ([05](05-neuroevolucao.md)) |

## `training.js` — treino, nota, turbo, persistência

### Estado

| Nome | Descrição |
|---|---|
| `training` | objeto com todo o estado do treino: `active`, `speed`, `turbo`, `generation`, `population`, `levelRecords`, `index`, `level`, `levelScores`, `levelEnds`, `levelBoss`, `bossMaxHp`, `bossHp`, `episodeFrames`, `startLives`, `bestEver`, `history`, `lastScores`, `generationMs`, `actionFrames`, `actionTotal` |
| `MAX_LEVEL_SECONDS` (150) | limite de cada fase em tempo de jogo |
| `SURVIVAL_POINTS_PER_SECOND` (0,1) | desempate por tempo vivo |
| `FITNESS_VERSION` (4) | versão da fórmula da nota |
| `BOSS_REACHED` (0,3), `BOSS_DAMAGE_MAX` (0,65), `POINTS_SHARE` (0,5) | pesos do progresso contra o chefe e da parte de pontos na nota |
| `MIN_LEVEL_RECORD` (10) | piso do recorde de cada fase |
| `LEVEL_COUNT` (8), `startLevel` | número de fases; fase inicial para jogar/assistir |
| `STORAGE_KEY`, `TRAINING_API`, `savedTo` | `localStorage`, endereço da API e onde foi o último salvamento |

### Morte e fim de fase

| Nome | Descrição |
|---|---|
| `END_REASONS` | `cleared`, `timeout`, `terrain`, `enemy`, `boss`, `shot` |
| `lastDeathCause` | causa da última morte (preenchida pelo `playerDead` envolvido) |
| `Level.prototype.playerDead` (envolvido) | registra a causa e chama o original |
| `deathCause(level)` | no que a hitbox da nave está encostando: terreno, chefe, inimigo ou tiro |
| `levelEndReason()` | como a fase atual terminou |
| `levelOver()` | perdeu vida, game over, chefe morto ou 150 s |

### Reiniciar o jogo

| Nome | Descrição |
|---|---|
| `ENEMY_LEVELS`, `pristineWaves` | ondas de todas as fases e a cópia intacta delas |
| `cloneGameObject(value, seen)` | cópia profunda que preserva classes, compartilha imagens e aguenta ciclos |
| `restoreEnemies()` | entrega cópias novas das ondas ao jogo |
| `isDarkLevel(number)` | fases 1, 5 e 6 têm fundo escuro |
| `resetGame(levelNumber)` | zera vidas, pontos, especial; cria a fase |
| `selectLevel(number)` | fase inicial (recomeça a partida se não estiver treinando) |

### Nota

| Nome | Descrição |
|---|---|
| `levelFitness()` | pontos da fase atual + desempate por tempo vivo |
| `levelReference(level, records)` | recorde da fase com o piso de 10 |
| `trackBoss()` | guarda a vida do chefe da fase (`bossMaxHp`, `bossHp`) a cada frame |
| `bossProgress()` | progresso contra o chefe, de 0 a 1 |
| `balancedFitness(levelScores, records, levelBoss)` | `Σ ½ min(1, pontos ÷ recorde) + ½ progresso`; sem `levelBoss` (treino antigo), só a parte de pontos |
| `currentFitness()` | prévia da nota da nave em jogo |

### Ciclo

| Nome | Descrição |
|---|---|
| `loadIndividual()` | carrega a rede da nave atual e começa na fase 1 |
| `startLevelRun()` | reinicia o jogo na fase atual |
| `finishLevel()` | guarda pontos e motivo; passa à próxima fase, nave ou geração |
| `endGeneration()` | atualiza recordes, calcula notas, `bestEver`, histórico, cria a próxima geração e salva |
| `countEnds(reasons)` | conta os motivos de fim de uma fase |
| `countActions(action)` | conta frames de cada tecla |
| `runTrainingFrame()` | roda vários frames do jogo (velocidade fixa ou turbo) |

### Turbo

| Nome | Descrição |
|---|---|
| `TURBO_SHARE` (0,75), `TURBO_MIN_MS` (12), `TURBO_MAX_MS` (50) | orçamento de tempo por quadro |
| `lastTrainingFrameStart` | para medir o intervalo entre quadros |
| `DRAW_METHODS`, `doNothing`, `setDrawing(enabled)` | desliga/religa o desenho dos canvas |
| `countFrame()`, `trainingFramesPerSecond` | medidor de frames/s |

### Controles e persistência

| Nome | Descrição |
|---|---|
| `startTraining()`, `stopTraining()`, `watchBest()`, `resetTraining()`, `exportBest()` | botões do painel ([06](06-treino.md#controles-do-treino)) |
| `trainingSnapshot()` | objeto salvo em `training.json` |
| `applySnapshot(saved)` | carrega e converte versões antigas ([07](07-persistencia.md#compatibilidade-com-treinos-antigos)) |
| `saveTraining()` | `POST` no servidor; senão, `localStorage` |
| `loadTraining()` | `GET` no servidor; senão, `localStorage` |
| `deleteSavedTraining()` | `DELETE` no servidor e limpa o `localStorage` |
| `trainingLoaded` | a promessa do carregamento inicial |

## `ai-panel.js` — painel de controle

| Nome | Descrição |
|---|---|
| `INPUT_LABELS` | nomes das 19 entradas (usados na telemetria) |
| `SPECIAL_NAMES`, `KEY_NAMES` | nomes em português |
| `PANEL_REFRESH_MS` (100) | intervalo de atualização |
| `createPanel()` | monta o painel dentro de `#app-body` e liga os controles |
| `bindSlider(id, getValue, setValue, format)` | liga um slider a uma variável |
| `countWeights(net)` | número de pesos da rede (162) |
| `refreshPanel()`, `refreshTraining()` | atualizam os textos e estados dos botões |

## `ai-telemetry.js` — telemetria

| Nome | Descrição |
|---|---|
| `END_LABELS`, `ACTION_LABELS` | rótulos em português |
| `HEATMAP_GENERATIONS` (60) | gerações no mapa de calor |
| `telemetryColors` | cores lidas das variáveis CSS |
| `staticChartsKey` | chave que decide quando redesenhar os gráficos de gerações |
| `createTelemetry()` | monta o card de progresso (embaixo do jogo) e os gráficos (`#ai-side-column`) |
| `refreshTelemetry()` | atualiza progresso e rede sempre; gráficos só quando a chave muda |
| `refreshProgress()` | números, casinhas, pontos por fase, teclas |
| `setText(id, text)`, `formatDuration(seconds)` | utilitários |
| `prepareCanvas(id)` | ajusta resolução (inclusive densidade de pixels) e limpa |
| `emptyMessage(chart, text)` | mensagem quando ainda não há dados |
| `drawEvolution()` | linhas de melhor e média |
| `mixColor(a, b, t)` | mistura duas cores hex |
| `drawHeatmap()` | mapa de calor fase × geração |
| `drawEnds()` | barras empilhadas "o que matou" |
| `drawLastScores()` | barras das notas da última geração |
| `drawNetwork()` | diagrama da rede ao vivo |

## `ai-panel.css` — estilos

| Seção | Conteúdo |
|---|---|
| Variáveis em `#ai-panel, #ai-layout` | cores: `--panel-*`, `--chart-bg`, `--lcd`, `--hot`, `--bad`, `--end-*` (uma por motivo de fim) |
| `#ai-panel` | painel flutuante (< 1200 px) ou coluna (≥ 1200 px) |
| `#app-body`, `#ai-layout`, colunas | layout de altura total, jogo em 680 px nas telas largas, gráficos que esticam |
| `#game-footer` | rodapé |
| `.tl-*` | cards e gráficos da telemetria |

## `server.py`

| Nome | Descrição |
|---|---|
| `PORT` (8000), `ROOT`, `DATA_DIR`, `TRAINING_FILE`, `BEST_FILE`, `API_PATH`, `MAX_BODY_BYTES` | configuração |
| `Server` | `ThreadingHTTPServer` com `allow_reuse_address = False` |
| `Handler` | serve os arquivos sem cache e responde `GET`/`POST`/`DELETE` em `/api/training` |
| `ALLOWED_HOSTS`, `ALLOWED_ORIGINS`, `HIDDEN_FOLDERS` | `Host` e `Origin` aceitos; pastas que não são entregues |
| `Handler.is_trusted(write)` | confere `Host` e, nas escritas, `Origin` e `Content-Type` ([07](07-persistencia.md#segurança-do-servidor)) |
| `Handler.is_hidden()` | nega caminhos com trecho começando em `.` e `mcp-server/` |
| `write_json(path, data)` | gravação atômica (`.tmp` + `os.replace`) |

## `mcp-server/server.py` — servidor MCP

| Nome | Descrição |
|---|---|
| `PAGE_SCRIPT` | script injetado na página: `mcpStep`, `mcpStart`, `mcpSnapshot`, `mcpPlay` (o tempo só passa quando uma ferramenta pede) |
| `Game` | abre o navegador (Edge → Chrome → Chromium) com o Playwright, sobe o `server.py` do jogo se a porta estiver livre |
| `SENSOR_NAMES` | nomes das 19 entradas, na ordem de `getInputs()` |
| `KEYS`, `MAX_FRAMES` (600) | teclas aceitas e frames máximos por chamada |
| `HEADED` | `SPACE_IMPACT_HEADED=1`: janela visível e frames em tempo real |
| `start_game`, `get_state`, `play`, `screenshot` | as 4 ferramentas ([11](11-claude-jogando-mcp.md)) |

## `tools/clone_demos.py` — clonagem de comportamento

| Nome | Descrição |
|---|---|
| `EPOCHS` (1500), `RATE` (0,3), `LIMIT` (4), `BALANCE` (8) | passadas, taxa, limite de pesos e peso extra das teclas raras |
| `forward(x)` | mesma conta do `predict()` do `brain-nn.js`, com o peso de cada tecla |
| (script) | lê `training-data/claude-demos.json`, treina e grava `training-data/demo-network.json` ([11](11-claude-jogando-mcp.md#aproveitar-a-partida-clonagem-de-comportamento)) |

## `tools/` — documentação em HTML

| Arquivo | Conteúdo |
|---|---|
| `build_docs.py` | junta `docs/README.md`, `docs/01…12-*.md` e `docs/glossario.md` em `docs/documentacao.html`; cada `.md` vira um `<script type="text/markdown">` (com `</script` escapado) |
| `docs-template.html` | o modelo da página: estilos, sumário lateral e o script que, no navegador, converte o Markdown com o marked.js, cria os ids dos títulos no estilo do GitHub (prefixados pelo nome do documento), troca links `06-treino.md#…` por âncoras da própria página e desenha os diagramas Mermaid |

## `.vscode/`

| Arquivo | Conteúdo |
|---|---|
| `tasks.json` | tarefa "Servidor Space Impact" (`python server.py`, em segundo plano, tarefa de build padrão) |
| `launch.json` | "Jogar (Edge)" e "Jogar (Chrome)" com `preLaunchTask` |
