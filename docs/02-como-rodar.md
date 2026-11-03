# 02 — Como rodar

## Requisitos

- **Python 3** no PATH como `python` (testado com 3.10). Só a biblioteca padrão — nada para instalar.
- Um navegador moderno (Edge ou Chrome; a telemetria usa recursos de CSS e canvas atuais).

## Por que precisa de um servidor

Abrir o `index.html` direto (`file://`) até mostra a página, mas:

1. o navegador bloqueia algumas coisas em `file://`;
2. **o treino precisa ser gravado num arquivo**, e uma página web não consegue escrever no disco sozinha.

O `server.py` resolve os dois: serve os arquivos do jogo e oferece uma pequena API para gravar o treino em
`training-data/`. Detalhes em [07 — Salvar e carregar](07-persistencia.md).

## Opção 1 — terminal

```bash
python server.py
```

Abra **http://localhost:8000**. Para parar: `Ctrl+C` no terminal.

Se a porta 8000 já estiver em uso (por exemplo, o servidor já está aberto em outro terminal), ele avisa
`(o servidor já estava rodando)` e encerra sem erro — basta abrir o endereço.

## Opção 2 — VS Code (recomendado)

O projeto vem com `.vscode/tasks.json` e `.vscode/launch.json`.

| Atalho | O que faz |
|---|---|
| **F5** → "Jogar (Edge)" ou "Jogar (Chrome)" | Sobe o `server.py` num terminal e abre o jogo **conectado ao depurador** |
| **Ctrl+Shift+B** | Só sobe o servidor |

Com o depurador conectado dá para colocar **breakpoints nos arquivos `.js`** (clique à esquerda do número da linha).
Lugares bons para estudar a IA:

- `nnDecide()` em `brain-nn.js` — ver as entradas e as saídas da rede num frame;
- `endGeneration()` em `training.js` — ver as notas da geração antes da evolução;
- `nextGeneration()` em `evolution.js` — ver seleção, cruzamento e mutação acontecendo.

Como funciona por baixo:

- a tarefa **"Servidor Space Impact"** roda `python server.py` em segundo plano;
- um *problem matcher* espera a linha `Space Impact em http…` aparecer no terminal para saber que o servidor subiu
  (por isso o `server.py` imprime com `flush=True` — sem isso a linha ficaria presa no buffer e o VS Code esperaria
  para sempre);
- as configurações de `launch.json` usam essa tarefa como `preLaunchTask` e abrem `http://localhost:8000`.

O servidor **continua rodando** depois de fechar o navegador. Para parar: `Ctrl+C` no terminal
"Servidor Space Impact" ou o ícone de lixeira do terminal.

## Primeiro uso — roteiro rápido

1. Abra o jogo. A coluna da direita é o **Painel da IA**.
2. Em **Quem controla**, clique em **Regras** e depois em **Play** no jogo: o cérebro de regras joga.
3. Clique em **Rede**: uma rede aleatória (ou a do treino salvo) joga.
4. Clique em **Iniciar treino** e ligue o **Turbo**. Acompanhe a telemetria:
   - "Treino · geração em andamento" mostra a nave e a fase atuais e a previsão de fim da geração;
   - a cada geração completa, os gráficos ganham uma coluna/ponto novo.
5. Depois de algumas gerações, **Pausar treino** e **Assistir a melhor**.

Mantenha a aba **visível** enquanto treina: navegadores quase congelam abas escondidas (`requestAnimationFrame`
desacelera para ~1 quadro por segundo), e o treino cai junto.

## Opcional: imitação com TensorFlow.js

O modo **Rede TensorFlow (imitação)** usa a biblioteca `tf.min.js`, carregada de um CDN (`cdn.jsdelivr.net`) no fim do
`index.html`: precisa de **internet**. Os outros modos não dependem dela. Como gravar e treinar:
[13 — Imitação com TensorFlow](13-imitacao-tensorflow.md).

## Opcional: deixar o Claude jogar (MCP)

Precisa de Python 3 com um ambiente virtual e do Edge ou Chrome. A instalação e o uso estão em
[11 — Claude jogando](11-claude-jogando-mcp.md#instalação). O treino e o jogo normal **não** dependem disso.

## Atalhos de teclado do jogo

| Tecla | Ação |
|---|---|
| Setas | Mover |
| Espaço | Tiro |
| X | Arma especial |

Os sliders do painel funcionam só com o mouse: o jogo chama `preventDefault()` em toda tecla de seta/espaço.
