# Space Impact com IA

Uma inteligência artificial que **aprende sozinha a jogar Space Impact**, o jogo de nave do Nokia 3310, por
**neuroevolução**: redes neurais escritas à mão cujos pesos são descobertos por um algoritmo genético, sem nenhuma
regra de jogo programada.

Projeto de estudo de IA construído sobre a versão web do jogo feita por
[sidsinr/Space-Impact-Web](https://github.com/sidsinr/Space-Impact-Web). O jogo original (`game.js`) não foi
modificado: a IA o controla "por fora", como um jogador.

## O que tem aqui

- **Sensores:** a cada frame, o jogo vira 11 números entre 0 e 1 — altura e posição da nave, tiro e inimigo mais
  próximos, munição especial, espaço livre acima e abaixo.
- **Rede neural:** 11 entradas → 6 neurônios → 6 teclas (cima, baixo, esquerda, direita, tiro, especial); 114 pesos.
- **Neuroevolução:** 30 naves por geração; elitismo, torneio, cruzamento e mutação criam a próxima geração.
- **Treino:** cada nave joga as 8 fases, cada uma do zero; a nota soma `pontos ÷ recorde` de cada fase (0 a 8).
- **Turbo:** ~18 mil frames do jogo por segundo, desligando o desenho dos frames extras.
- **Telemetria:** rede neural ao vivo, evolução da nota, mapa de calor por fase, o que matou as naves e as notas
  de cada geração.
- **Persistência:** o treino é salvo em `training-data/training.json` por um pequeno servidor Python.
- **Cérebro de regras:** um jogador escrito à mão com `if`s, para comparar com o que a evolução descobre.

## Como rodar

Precisa de **Python 3** (só a biblioteca padrão) e de um navegador moderno.

```bash
python server.py
```

Abra **http://localhost:8000**. No VS Code, aperte **F5** e escolha "Jogar (Edge)" ou "Jogar (Chrome)".

Para treinar: no **Painel da IA**, clique em **Iniciar treino** e ligue o **Turbo**. Mantenha a aba visível — o
navegador desacelera abas escondidas. Depois de algumas gerações, **Pausar treino** e **Assistir a melhor**.

O servidor é necessário porque é ele que grava o treino em arquivo; sem ele, o treino fica só no `localStorage`
do navegador.

## Controles

| Tecla | Ação |
|---|---|
| Setas | mover |
| Espaço | tiro |
| X | arma especial |

O interruptor **Botões na tela**, no rodapé, mostra botões de toque para jogar no celular.

## Documentação

Tudo está explicado em português em [`docs/`](docs/README.md): que tipo de IA é esta, arquitetura, sensores, rede
neural, neuroevolução, treino, persistência, telemetria, o diário de decisões (com os erros encontrados e como foram
resolvidos), a referência de todas as funções e um glossário.

A mesma documentação em uma página só, com sumário e diagramas: [`docs/documentacao.html`](docs/documentacao.html).
Ela é gerada a partir dos `.md` com:

```bash
python tools/build_docs.py
```

## Estrutura

| Caminho | Papel |
|---|---|
| `game.js`, `style.css`, `img/` | o jogo original |
| `ai.js` | sensores, atuadores e o loop da IA |
| `brain-rules.js` | cérebro de regras |
| `brain-nn.js` | entradas normalizadas e a rede neural |
| `evolution.js` | algoritmo genético |
| `training.js` | treino, nota, turbo, salvar e carregar |
| `ai-panel.js`, `ai-panel.css` | painel de controle e layout da página |
| `ai-telemetry.js` | telemetria |
| `server.py` | servidor local e API do treino |
| `training-data/` | treino salvo e backups |
| `docs/`, `tools/` | documentação e o gerador da versão HTML |
| `.vscode/` | rodar com F5 no VS Code |

## Créditos

- Jogo web original, arte e código: [sidsinr](https://github.com/sidsinr/Space-Impact-Web).
- Botões na tela: [OpenGameArt](https://opengameart.org).

## Aviso

Space Impact é uma marca registrada da Nokia. Este é um projeto pessoal, apenas para fins educacionais (estudo de
inteligência artificial, JavaScript e HTML Canvas), sem qualquer intenção de uso comercial ou distribuição.
