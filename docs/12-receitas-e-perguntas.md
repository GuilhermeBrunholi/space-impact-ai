# 12 — Receitas, parâmetros e perguntas frequentes

Este documento é para **consulta**: "como eu mudo X?", "o que acontece se eu mexer em Y?", "por que a IA faz Z?". Cada
resposta aponta para o documento que explica o assunto por inteiro.

## Receitas

### Comparar os três jeitos de jogar

No painel, em **Quem controla**: **Você** (teclado), **Regras** (`brain-rules.js`, `if`s escritos à mão) e **Rede**
(`brain-nn.js`). Use as **Regras** como régua: se a rede treinada não ganha delas, o treino ainda não achou nada de
útil. Ver [01](01-visao-geral.md#quem-controla-a-nave).

### Treinar e acompanhar

1. **Iniciar treino** e ligar o **Turbo**. Manter a aba visível ([02](02-como-rodar.md)).
2. Olhar a **média** da nota (a melhor oscila por sorte) e o gráfico **o que matou**: se 30 de 30 morrem no terreno de
   uma fase, a rede não está vendo ou não está aprendendo aquela fase ([08](08-painel-e-telemetria.md)).
3. **Pausar treino** e **Assistir a melhor**.

O treino é salvo no fim de cada geração; fechar a página não perde nada ([07](07-persistencia.md)).

### Guardar uma cópia antes de mudar algo grande

Copie `training-data/training.json` e `training-data/best-network.json` para nomes como
`training-antes-<mudança>.json`. Foi o que se fez antes de cada mudança de formato ([07](07-persistencia.md#backups)).
Para voltar, copie de volta sobre o nome original **com o servidor parado ou a página fechada** (senão a geração em
andamento grava por cima).

### Zerar o treino

**Zerar treino** no painel apaga os dois arquivos. Faça backup antes.

### Mudar o número de neurônios escondidos

Slider **Neurônios escondidos** (2 a 32). Aumentar não muda como as naves jogam; diminuir corta neurônios e recomeça a
geração ([04](04-rede-neural.md#número-de-neurônios-escondidos-configurável)). É salvo no treino.

### Adicionar um sensor novo

O formato da rede muda, então siga a ordem:

1. Se o jogo tem a informação mas o `getState()` não a expõe, acrescente o campo em `ai.js`
   ([03](03-sensores-e-acoes.md#camada-1--getstate-aijs)).
2. Escreva a função que calcula os números em `brain-nn.js`, **normalizados entre 0 e 1**, e meça os extremos jogando
   (o método está em [03](03-sensores-e-acoes.md#normalização)).
3. Acrescente os valores **no fim** da lista de `getInputs()` e aumente `INPUT_COUNT`.
4. Em `evolution.js`, acrescente em `LEGACY_SHAPES` o formato **antigo** (`{ inputs: <antigo>, outputs: 6 }`): é ele
   que permite carregar treinos salvos com peso 0 nas entradas novas ([04](04-rede-neural.md#como-a-rede-cresceu-e-como-treinos-antigos-são-aproveitados)).
5. Nomes: `INPUT_LABELS` em `ai-panel.js` (rótulos da rede ao vivo) e `SENSOR_NAMES` em `mcp-server/server.py`.
6. Faça backup do treino, recarregue a página e confira: o número de pesos do botão "Nova rede aleatória" e se
   `population[0].genome.length` bate com o esperado.
7. Atualize a documentação ([03](03-sensores-e-acoes.md), [04](04-rede-neural.md), [10](10-referencia-do-codigo.md)).

Por que no fim: o genoma é uma lista; entradas novas no meio deslocariam todos os pesos seguintes e o treino salvo
viraria lixo.

### Mudar a nota (fitness)

1. Edite `balancedFitness()` / `levelFitness()` em `training.js`.
2. **Aumente `FITNESS_VERSION`.** As notas de versões diferentes não se comparam: ao carregar, o treino mantém os
   pesos, recria os recordes e zera o histórico ([06](06-treino.md#histórico-das-versões-da-nota)).
3. Se a nota depender de um dado novo por nave (como `levelBoss`), guarde-o no indivíduo, no `bestEver` e no
   salvamento, e trate o caso "treino antigo sem esse dado".
4. Registre o motivo no [diário](09-diario-de-decisoes.md).

### Mudar a população ou a evolução

`POPULATION_SIZE`, `ELITE_COUNT`, `TOURNAMENT_SIZE` em `evolution.js`; taxa e força da mutação nos sliders do painel
([05](05-neuroevolucao.md#os-números-do-algoritmo)). Uma população salva com outro tamanho é refeita na geração
seguinte.

### Deixar o Claude jogar

Aprovar o servidor `space-impact` no Claude Code e pedir para ele jogar ([11](11-claude-jogando-mcp.md)).

### Atualizar esta documentação

Edite os `.md` de `docs/` e rode `python tools/build_docs.py`. Nunca edite `docs/documentacao.html` à mão.

## Parâmetros: o que cada número controla

| Parâmetro | Valor | Onde | Efeito de aumentar |
|---|---|---|---|
| `DEFAULT_HIDDEN_COUNT` | 6 (2 a 32 no painel) | `brain-nn.js` | mais capacidade; busca mais lenta |
| `POPULATION_SIZE` | 30 | `evolution.js` | mais diversidade; geração mais lenta |
| `ELITE_COUNT` | 2 | `evolution.js` | menos risco de piorar; menos renovação |
| `TOURNAMENT_SIZE` | 3 | `evolution.js` | pais melhores; menos diversidade |
| `mutationRate` | 10% (painel) | `evolution.js` | explora mais; estraga mais o que funciona |
| `mutationStrength` | 0,5 (painel) | `evolution.js` | passos maiores |
| `WEIGHT_LIMIT` | 4 | `evolution.js` | pesos maiores; risco de saturar |
| `REVIVE_CHANCE` | 0,3 | `evolution.js` | mais filhos com cima/baixo ressorteados se travados |
| `MAX_LEVEL_SECONDS` | 150 | `training.js` | fases mais longas por nave |
| `SURVIVAL_POINTS_PER_SECOND` | 0,1 | `training.js` | mais desempate por tempo vivo |
| `MIN_LEVEL_RECORD` | 10 | `training.js` | régua mínima mais alta |
| `POINTS_SHARE` | 0,5 | `training.js` | mais peso nos pontos, menos no chefe |
| `BOSS_REACHED` / `BOSS_DAMAGE_MAX` | 0,3 / 0,65 | `training.js` | mais prêmio por chegar / por ferir o chefe |
| `DANGER_HORIZON` | 60 frames | `brain-nn.js` | perigo enxergado de mais longe |
| `DANGER_MARGIN` | 20 px | `brain-nn.js` | alarme mais cedo (folga maior) |
| `TERRAIN_LOOKAHEAD` / `TERRAIN_RANGE` | 150 / 150 px | `brain-nn.js` | terreno visto de mais longe |
| `fireCooldown` | 200 ms (painel) | `ai.js` | tiros mais espaçados |
| `specialCooldown` | 1000 ms | `ai.js` | especiais mais espaçados |
| `pressThreshold` | 0,5 (painel) | `brain-nn.js` | teclas mais difíceis de apertar |
| `actionWeights` | ↑0 ↓0 ←−3 →−3 tiro+2 especial−8 (padrão) | `brain-nn.js` | tecla aperta com mais facilidade |
| `TURBO_SHARE` / `TURBO_MIN_MS` / `TURBO_MAX_MS` | 0,75 / 12 / 50 | `training.js` | mais frames por segundo; tela menos responsiva |
| `HEATMAP_GENERATIONS` | 60 | `ai-telemetry.js` | mapa de calor com mais gerações |

## Perguntas frequentes

**Por que a nota cai sem a rede ter piorado?**
Porque a régua sobe: a nota usa o recorde de cada fase, e quando uma geração bate o recorde, todos passam a ser
medidos por um recorde mais exigente ([06](06-treino.md#detalhes-que-importam)). Também há ruído: o mesmo cérebro faz
notas diferentes em partidas diferentes ([05](05-neuroevolucao.md#ruído-na-nota)). Olhe a tendência da média.

**Por que a nave só sobe (ou só desce)?**
Pesos que crescem demais fazem a saída virar um interruptor travado. Isso já aconteceu com o `down`; há limite de pesos
(±4) e conserto automático ([05](05-neuroevolucao.md#conserto-de-redes-saturadas--repairgenome),
[09](09-diario-de-decisoes.md#a-nave-não-descia-saturação-dos-pesos)). O peso de cada tecla também influencia
([04](04-rede-neural.md#peso-de-cada-tecla-actionweights)).

**Por que a IA atira o tempo todo?**
Atirar quase nunca atrapalha, e o peso padrão do tiro é +2. O intervalo de 200 ms impede o "tiro infinito" (reward
hacking) ([03](03-sensores-e-acoes.md#por-que-os-intervalos-cooldowns)).

**Por que a nota de uma fase fica em 0%/"chefe 0%"?**
A nave morreu antes de o chefe aparecer, ou a fase acabou pelo tempo. O progresso contra o chefe só começa quando ele
entra na fase ([06](06-treino.md#o-progresso-contra-o-chefe)).

**Por que a "melhor nave" aparece sem nota?**
Veio de um treino de antes de uma mudança de regra da nota ou de rede, ou perdeu a nota ao diminuir os neurônios. Ela
ainda pode ser assistida; qualquer nave nova a supera ([06](06-treino.md#detalhes-que-importam)).

**O treino anda mais devagar com a aba em segundo plano. É normal?**
Sim: o navegador quase congela abas escondidas. Mantenha a aba visível ([02](02-como-rodar.md)).

**Mudei o jogo e o treino salvo parou de funcionar.**
Se mudou o número de entradas ou saídas, é preciso registrar o formato antigo em `LEGACY_SHAPES` para o treino ser
convertido ([04](04-rede-neural.md#como-a-rede-cresceu-e-como-treinos-antigos-são-aproveitados)). Sem isso o genoma não
é reconhecido.

**O que é uma "fase vencida"?**
Matar o chefe. Só então `levelComplete` vira `true` e o jogo leva a nave sozinho até a próxima fase.

**Posso treinar sem o `server.py`?**
Sim, mas o treino fica só no `localStorage` do navegador ([07](07-persistencia.md#onde-fica)).

**Posso expor o servidor na rede?**
Não. Ele não tem login e confere que quem fala com ele é a própria máquina
([07](07-persistencia.md#segurança-do-servidor)).

**O Claude consegue jogar melhor que a rede?**
Numa partida, passou pelos chefes das fases 1 a 7 ([11](11-claude-jogando-mcp.md)). Mas usar as jogadas dele como
exemplo para a rede não funcionou com as 11 entradas antigas.

## Mapa: onde está cada coisa

| Quero entender… | Arquivo | Documento |
|---|---|---|
| o que a IA vê | `ai.js` (`getState`), `brain-nn.js` (`getInputs`) | [03](03-sensores-e-acoes.md) |
| como ela decide | `brain-nn.js` (`predict`, `nnDecide`) | [04](04-rede-neural.md) |
| como ela aperta teclas | `ai.js` (`act`) | [03](03-sensores-e-acoes.md#camada-3--ações-e-actaction-aijs) |
| como as redes evoluem | `evolution.js` | [05](05-neuroevolucao.md) |
| como a nota é calculada | `training.js` | [06](06-treino.md) |
| como o treino é salvo | `training.js`, `server.py` | [07](07-persistencia.md) |
| o que cada gráfico mostra | `ai-telemetry.js` | [08](08-painel-e-telemetria.md) |
| por que cada decisão foi tomada | — | [09](09-diario-de-decisoes.md) |
| uma função específica | todos | [10](10-referencia-do-codigo.md) |
| o Claude jogando | `mcp-server/server.py` | [11](11-claude-jogando-mcp.md) |
| um termo | — | [Glossário](glossario.md) |
