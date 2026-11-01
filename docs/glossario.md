# Glossário

| Termo | Significado neste projeto |
|---|---|
| **Agente** | programa que observa o ambiente, decide e age, num ciclo. Aqui: `getState` → cérebro → `act`, a cada frame |
| **Ambiente** | o jogo (`game.js`) |
| **Sensor / observação** | o que o agente lê do ambiente: `getState()` e as 11 entradas de `getInputs()` |
| **Atuador / ação** | o que o agente faz: as 6 teclas aplicadas por `act()` |
| **Espaço de observação** | o conjunto de todas as entradas possíveis (11 números entre 0 e 1) |
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
| **Genoma** | a rede achatada numa lista de 114 números |
| **Indivíduo** | uma nave = um genoma |
| **População** | as 30 naves de uma geração |
| **Geração** | uma rodada em que todas as naves jogam e a evolução cria a próxima população |
| **Fitness / nota** | quão bem uma nave jogou; aqui, `Σ pontos ÷ recorde` nas 8 fases (0 a 8) |
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
| **Telemetria** | dados coletados durante o treino e mostrados em gráficos |
| **Mapa de calor** | grade colorida: linha = fase, coluna = geração, cor = pontuação |
