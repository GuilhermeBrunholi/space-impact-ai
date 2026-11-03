# Glossário

| Termo | Significado neste projeto |
|---|---|
| **Agente** | programa que observa o ambiente, decide e age, num ciclo. Aqui: `getState` → cérebro → `act`, a cada frame |
| **Ambiente** | o jogo (`game.js`) |
| **Sensor / observação** | o que o agente lê do ambiente: `getState()` e as 19 entradas de `getInputs()` |
| **Atuador / ação** | o que o agente faz: as 6 teclas aplicadas por `act()` |
| **Espaço de observação** | o conjunto de todas as entradas possíveis (19 números entre 0 e 1) |
| **Espaço de ação** | o conjunto de ações possíveis (6 teclas, cada uma apertada ou não) |
| **Política** | a regra que transforma observação em ação — aqui, a rede neural (ou as regras) |
| **Agente reativo** | decide só pelo que vê agora, sem memória do passado. Os dois cérebros do projeto são reativos |
| **Normalização (min-max)** | `(valor − min) ÷ (max − min)`, para deixar toda entrada entre 0 e 1 |
| **Flag** | entrada 0/1 que diz se algo existe ("existe tiro?") |
| **Feature engineering** | escolher e preparar o que a rede vê (posições relativas, flags, terreno) |
| **Neurônio** | soma ponderada das entradas + bias, passada por uma função de ativação |
| **Peso** | o número que multiplica uma entrada num neurônio; positivo liga, negativo desliga |
| **Bias** | número somado ao neurônio independentemente das entradas: a "vontade" padrão dele |
| **Sigmoide** | função `1 / (1 + e^−x)` que transforma qualquer número num valor entre 0 e 1 |
| **Camada escondida** | os 6 neurônios entre as entradas e as saídas |
| **Saturação** | quando a soma de um neurônio é tão grande (positiva ou negativa) que a sigmoide fica sempre em 0 ou 1; mudanças pequenas de peso não têm efeito |
| **Neurônio travado** | neurônio que não muda de estado para nenhuma entrada possível (`isStuck`) |
| **Limite para apertar** | valor da saída acima do qual a tecla é apertada (0,5) |
| **Peso da tecla** | valor fixo somado a uma saída antes da sigmoide (`actionWeights`) |
| **Genoma** | a rede achatada numa lista de 162 números |
| **Indivíduo** | uma nave = um genoma |
| **População** | as 30 naves de uma geração |
| **Geração** | uma rodada em que todas as naves jogam e a evolução cria a próxima população |
| **Fitness / nota** | quão bem uma nave jogou; aqui, a soma nas 8 fases de ½ `pontos ÷ recorde` + ½ progresso contra o chefe (0 a 8) |
| **Recorde da fase** | maior pontuação já vista numa fase; é a régua da nota |
| **Episódio** | uma fase jogada por uma nave, do início até perder a 1ª vida, matar o chefe ou 150 s |
| **Elitismo** | as melhores passam intactas para a próxima geração |
| **Seleção por torneio** | sorteia algumas naves e escolhe a melhor delas como pai |
| **Cruzamento (crossover) uniforme** | cada peso do filho vem de um dos dois pais, por sorteio |
| **Mutação gaussiana** | soma a um peso um número sorteado de uma distribuição normal |
| **Taxa / força de mutação** | chance de cada peso mudar / tamanho típico da mudança |
| **Diversidade** | o quanto as naves da população são diferentes entre si; sem ela a evolução não tem o que selecionar |
| **Neuroevolução** | treinar redes neurais com algoritmo genético |
| **Backpropagation** | o outro jeito de treinar redes, com gradiente; precisa de respostas certas para comparar (não usado aqui) |
| **Reward hacking** | a IA explora uma brecha da recompensa em vez de aprender a tarefa (ex.: tiro infinito) |
| **Ruído na nota** | variação de nota entre partidas da mesma rede, por causa da aleatoriedade do jogo |
| **Turbo** | rodar muitos frames do jogo por quadro da tela, sem desenhar os extras |
| **Frame** | um passo da simulação do jogo (1/60 de segundo de jogo) |
| **Hitbox** | o retângulo que realmente colide (menor que o desenho) |
| **Item coletável (`PowerUp`)** | vida, míssil, laser ou parede que o jogo lança na tela; não machuca, e fica na mesma lista dos inimigos (`isPowerUp`) |
| **Perigo iminente** | sensor que projeta o movimento de tiros e inimigos e diz se vão acertar a nave em até 1 s e de que lado desviar |
| **Tempo até o impacto** | `distância ÷ velocidade de aproximação`, em frames; base do sensor de perigo |
| **Progresso contra o chefe** | de 0 a 1: chegar nele vale 0,3, tirar vida até 0,95, matá-lo 1; metade da nota de cada fase |
| **Número de neurônios escondidos** | tamanho da camada escondida, ajustável no painel (2 a 32); o genoma muda de tamanho junto |
| **MCP (Model Context Protocol)** | padrão para dar ferramentas a uma IA; aqui, o Claude joga por `start_game`, `get_state`, `play` e `screenshot` |
| **Playwright** | biblioteca que controla um navegador por código; o servidor MCP a usa para abrir o jogo |
| **Headless** | navegador sem janela |
| **Subagente** | outra instância do Claude, chamada para uma tarefa (aqui, jogar uma partida) |
| **Clonagem de comportamento** | treinar a rede para repetir as jogadas de um demonstrador, como se fossem as respostas certas |
| **Demonstração** | um exemplo `(entradas → teclas)` gravado de uma partida do Claude |
| **Aprendizado por imitação** | treinar a rede para repetir as jogadas de quem jogou (aqui, você); ver [13](13-imitacao-tensorflow.md) |
| **TensorFlow.js (`tf`)** | biblioteca de redes neurais para o navegador; o `brain-tf.js` a usa, carregada de um CDN |
| **Epoch** | uma passada completa do treino por todos os exemplos gravados |
| **Loss / val_loss** | erro da rede nos frames de treino / nos 20% reservados para conferir; `val_loss` subindo com a `loss` caindo = decorando |
| **Limite calibrado** | limite por tecla, ajustado para a rede apertar na mesma proporção que o jogador (`tfThresholds`) |
| **Atraso de reação** | os 12 frames (`REACTION_DELAY`) entre ver a situação e apertar a tecla, aplicados nos dados de imitação |
| **Origin / Host** | cabeçalhos HTTP que dizem de que site veio um pedido e a que endereço ele foi; o `server.py` os confere |
| **DNS rebinding** | ataque em que um site malicioso faz o nome dele apontar para `localhost`, para falar com servidores locais |
| **Telemetria** | dados coletados durante o treino e mostrados em gráficos |
| **Mapa de calor** | grade colorida: linha = fase, coluna = geração, cor = pontuação |
