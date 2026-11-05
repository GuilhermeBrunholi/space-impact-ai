# Space Impact com IA

Uma inteligência artificial que **aprende sozinha a jogar Space Impact**, o jogo de nave do Nokia 3310, por
**neuroevolução**: redes neurais escritas à mão cujos pesos são descobertos por um algoritmo genético, sem nenhuma
regra de jogo programada.

Projeto de estudo de IA construído sobre a versão web do jogo feita por
[sidsinr/Space-Impact-Web](https://github.com/sidsinr/Space-Impact-Web). O jogo original (`game.js`) quase não foi
modificado (só duas variáveis que marcam o momento do tiro e do especial, usadas na gravação de partidas): a IA o
controla "por fora", como um jogador.

## O que tem aqui

- **Sensores:** a cada frame, o jogo vira 19 números entre 0 e 1 — altura e posição da nave, tiro e inimigo mais
  próximos, munição especial, espaço livre acima e abaixo, item coletável mais próximo (vida, míssil...) e o perigo
  iminente de tiros e inimigos.
- **Rede neural:** 21 entradas → 6 neurônios (ajustável no painel, de 2 a 32) → 6 teclas (cima, baixo, esquerda, direita, tiro, especial); 174 pesos com 6 neurônios.
- **Neuroevolução:** 30 naves por geração; elitismo, torneio, cruzamento e mutação criam a próxima geração.
- **Treino:** cada nave joga as 8 fases, cada uma do zero; cada fase vale até 1: metade `pontos ÷ recorde`, metade o progresso contra o chefe (0 a 8).
- **Turbo:** ~18 mil frames do jogo por segundo, desligando o desenho dos frames extras.
- **Telemetria:** rede neural ao vivo, evolução da nota, mapa de calor por fase, o que matou as naves e as notas
  de cada geração.
- **Persistência:** o treino é salvo em `training-data/training.json` por um pequeno servidor Python.
- **Cérebro de regras:** um jogador escrito à mão com `if`s, para comparar com o que a evolução descobre.
- **Imitação com TensorFlow.js:** você joga com **Gravar partidas** ligado, baixa o `.json` e treina uma rede
  (19 → 32 → 16 → 6) que imita as suas jogadas, com gráfico de loss ao vivo. Precisa de internet (a biblioteca vem
  de um CDN). Ver [`docs/13`](docs/13-imitacao-tensorflow.md).

## Como rodar

Precisa de **Python 3** (só a biblioteca padrão) e de um navegador moderno. O TensorFlow.js do modo de imitação é
carregado de um CDN, então esse modo precisa de internet; o resto funciona offline.

```bash
python server.py
```

Abra **http://localhost:8000**. No VS Code, aperte **F5** e escolha "Jogar (Edge)" ou "Jogar (Chrome)".

O **Painel da IA** tem quatro modos em **Quem controla**: **Você** (teclado), **Regras**, **Rede** (evolução) e
**Rede TensorFlow (imitação)**. Cada modo mostra só os controles que usa.

Para treinar por evolução: no modo **Rede**, clique em **Iniciar treino** e ligue o **Turbo**. Mantenha a aba visível — o
navegador desacelera abas escondidas. Depois de algumas gerações, **Pausar treino** e **Assistir a melhor**.

Para treinar por imitação (precisa de internet):

1. No modo **Você**, marque **Gravar partidas**, jogue e clique em **Baixar gravação** (um `.json` por partida).
2. Mude para **Rede TensorFlow (imitação)**, escolha os arquivos em **Gravações (.json)** e clique em **Treinar**.
3. Acompanhe o gráfico de loss; ao terminar, a nave joga sozinha. O modelo não é salvo: recarregar a página exige
   treinar de novo.

O servidor é necessário para o treino por evolução, porque é ele que o grava em arquivo; sem ele, o treino fica só no `localStorage`
do navegador.

## Controles

| Tecla | Ação |
|---|---|
| Setas | mover |
| Espaço | tiro |
| X | arma especial |

O interruptor **Botões na tela**, no rodapé, mostra botões de toque para jogar no celular.

## Deixar o Claude jogar (MCP)

O `mcp-server/server.py` é um servidor MCP: o Claude Code joga o jogo chamando ferramentas. O jogo roda num Edge
(ou Chrome) sem janela, e o tempo só passa quando o Claude pede, um frame por vez, como no treino acelerado.

Instalação, uma vez (Windows):

```bash
python -m venv mcp-server/.venv
mcp-server/.venv/Scripts/python.exe -m pip install -r mcp-server/requirements.txt
```

O `.mcp.json` da raiz registra o servidor; ao abrir o projeto no Claude Code, aprove o servidor `space-impact`.
Ele sobe o `server.py` sozinho se a porta 8000 estiver livre.

| Ferramenta | O que faz |
|---|---|
| `start_game(level)` | partida nova na fase 1 a 8 |
| `get_state()` | nave, inimigos, tiros e terreno à frente, vidas, pontos e as 19 entradas da rede |
| `play(keys, frames, stop_on_event)` | segura as teclas por N frames (60 = 1 s) e devolve o estado; para ao perder vida |
| `screenshot()` | imagem do jogo |

**Assistir:** o `.mcp.json` define `SPACE_IMPACT_HEADED=0`: o jogo roda sem janela e o mais rápido possível. Mude para
`1` para abrir uma janela do Edge e ver os frames passarem em tempo real (60 por segundo). Entre uma chamada e outra o
jogo fica parado, esperando a jogada seguinte. O caminho do Python no `.mcp.json` é o do Windows
(`.venv/Scripts/python.exe`); em Linux/macOS use `.venv/bin/python`.

## Segurança

O `server.py` escuta só em `127.0.0.1` e confere o `Host`, a `Origin` e o `Content-Type` das escritas, para que outro
site aberto no navegador não consiga apagar ou trocar o treino. Ele não entrega `.git`, arquivos que começam com `.`
nem `mcp-server/`. Detalhes em [`docs/07-persistencia.md`](docs/07-persistencia.md#segurança-do-servidor).

## Documentação

Tudo está explicado em português em [`docs/`](docs/README.md): que tipo de IA é esta, arquitetura, sensores, rede
neural, neuroevolução, treino, persistência, telemetria, imitação com TensorFlow, o diário de decisões (com os erros
encontrados e como foram resolvidos), a referência de todas as funções e um glossário.

A mesma documentação em uma página só, com sumário e diagramas: [`docs/documentacao.html`](docs/documentacao.html).
Ela é gerada a partir dos `.md` com:

```bash
python tools/build_docs.py
```

## Estrutura

| Caminho | Papel |
|---|---|
| `game.js`, `style.css`, `img/` | o jogo original (com 2 variáveis a mais para a gravação) |
| `ai.js` | sensores, atuadores, o loop da IA e a gravação de partidas |
| `brain-rules.js` | cérebro de regras |
| `brain-nn.js` | entradas normalizadas e a rede neural |
| `brain-tf.js` | rede TensorFlow.js que imita partidas gravadas |
| `evolution.js` | algoritmo genético |
| `training.js` | treino, nota, turbo, salvar e carregar |
| `ai-panel.js`, `ai-panel.css` | painel de controle e layout da página |
| `ai-telemetry.js` | telemetria |
| `server.py` | servidor local e API do treino |
| `mcp-server/`, `.mcp.json` | servidor MCP para o Claude jogar |
| `training-data/` | treino salvo e backups |
| `docs/`, `tools/` | documentação e o gerador da versão HTML |
| `.vscode/` | rodar com F5 no VS Code |

## Créditos

- Jogo web original, arte e código: [sidsinr](https://github.com/sidsinr/Space-Impact-Web).
- Botões na tela: [OpenGameArt](https://opengameart.org).

## Aviso

Space Impact é uma marca registrada da Nokia. Este é um projeto pessoal, apenas para fins educacionais (estudo de
inteligência artificial, JavaScript e HTML Canvas), sem qualquer intenção de uso comercial ou distribuição.
