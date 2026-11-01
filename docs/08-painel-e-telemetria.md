# 08 — Painel e telemetria

A interface tem duas partes:

- **Painel da IA** (coluna da direita, `ai-panel.js`) — os **controles**.
- **Telemetria** (embaixo do jogo e na coluna do meio, `ai-telemetry.js`) — o que está **acontecendo** no treino.

Ambos se atualizam a cada 100 ms (`PANEL_REFRESH_MS`).

## Painel da IA

### Quem controla

`Você` / `Regras` / `Rede` — troca o cérebro (`setBrainMode`). Sair de `Rede` pausa o treino; ir para `Você` solta
as teclas que a IA estava segurando.

### Treino (neuroevolução)

| Controle | O que faz |
|---|---|
| Iniciar / Pausar treino | liga e desliga o treino (ver [06](06-treino.md#controles-do-treino)) |
| Assistir a melhor | a melhor nave de todas joga, a partir da fase inicial escolhida |
| Copiar melhor | copia a rede da melhor em JSON |
| Zerar treino | volta à geração 1 e apaga o arquivo salvo |
| Turbo | roda o máximo de frames possível sem desenhar os extras (~10× mais rápido) |
| Velocidade sem turbo | 1 a 30 frames do jogo por quadro da tela (desativado com o turbo ligado) |
| Melhor nota até agora | nota (0 a 8), geração em que apareceu e pontos por fase |
| Salvo em | arquivo ou `localStorage` |

### Jogo

Fase, vidas e pontos atuais; arma especial equipada e munição; e os botões **1–8** da **fase inicial** — para jogar
e para "Assistir a melhor". O treino ignora essa escolha e sempre passa pelas 8 fases.

### Rede e parâmetros

| Controle | Variável | Faixa | Efeito |
|---|---|---|---|
| Nova rede aleatória | `network` | — | sorteia um cérebro novo (não mexe no treino) |
| Limite para apertar | `pressThreshold` | 0,1 – 0,9 | saída acima disso = tecla apertada |
| Peso de cada tecla | `actionWeights` | −10 – +10 | empurrão fixo em cada saída ([04](04-rede-neural.md#peso-de-cada-tecla-actionweights)) |
| Intervalo entre tiros | `fireCooldown` | 50 – 1000 ms | ritmo máximo de tiro |
| Taxa de mutação | `mutationRate` | 1% – 50% | chance de cada peso mudar |
| Força da mutação | `mutationStrength` | 0,05 – 2 | tamanho da mudança |

Os pesos das teclas são salvos com o treino e, ao carregar, os sliders acompanham o valor salvo. Os outros
parâmetros valem só para a sessão.

## Telemetria

### Treino · geração em andamento (embaixo do jogo)

| Número | Significado |
|---|---|
| geração | geração que está jogando |
| nave | qual das 30 está jogando |
| fase | qual das 8 fases essa nave está jogando |
| nota atual | prévia da nota da nave (recordes atuais) |
| frames/s | frames do jogo simulados por segundo real |
| tempo | quanto a geração já levou (tempo real; pausas não contam) |
| falta | previsão: `tempo ÷ naves concluídas × naves restantes` (conta frações de nave pelas fases já jogadas) |

Abaixo:

- **30 casinhas**, uma por nave: verde = já jogou, amarela = jogando agora.
- **Pontos da nave atual por fase**: 8 cartões; a cor da **borda de baixo** diz como a fase terminou (mesmas cores
  do gráfico "o que matou"); a fase em andamento fica amarela com a pontuação parcial. Passe o mouse para ver o
  motivo por escrito.
- **Teclas apertadas nesta geração**: % dos frames em que cada tecla esteve apertada, somando todas as naves
  da geração até agora.

### Rede neural ao vivo

O diagrama da rede **atual** (a nave jogando, a melhor sendo assistida, ou a rede aleatória):

- à esquerda, as **11 entradas** com o valor atual de cada uma;
- no meio, os **6 neurônios escondidos**;
- à direita, as **6 saídas** com o valor (já com o peso da tecla);
- cada **linha** é um peso: verde = positivo, vermelho = negativo; grossura e opacidade = tamanho do peso;
- cada **bolinha** acende conforme o valor do neurônio (0 = escura, 1 = clara); saída **amarela** = tecla apertada.

Funciona até no modo `Você`: dá para jogar e ver o que a rede faria.

### Evolução da nota (0 a 8)

Linha **verde** = melhor nota de cada geração; linha **cinza** = média. A escala vai de 0 até a maior nota do
histórico. Olhe a tendência da **média** — a melhor oscila com o ruído da partida
(ver [05](05-neuroevolucao.md#ruído-na-nota)). A nota pode cair quando um recorde sobe.

### Melhor pontuação por fase (mapa de calor)

- uma **linha por fase** (F1–F8), uma **coluna por geração** (as últimas 60);
- quanto mais **claro**, mais pontos a melhor nave da geração fez naquela fase;
- a cor usa a **raiz quadrada** da pontuação: sem isso, uma fase de 1.900 pontos deixaria todas as de 100 pretas;
- à direita: `melhor da última geração / recorde da fase` — o recorde é a régua da nota.

Uma linha escura constante = fase em que a evolução não está avançando (foi assim que as fases 5 e 6 foram
diagnosticadas).

### Como as fases terminaram (o que matou)

Para a **última geração completa**: uma barra por fase com as 30 naves divididas pelo motivo do fim — venceu o
chefe, tempo esgotado, terreno, inimigo, chefe, tiro. Diz **o que** treinar: muita morte por terreno = falta
informação ou controle sobre o terreno; muita morte por tiro = falta desviar/derrubar tiros.

### Notas da última geração

As 30 notas da última geração, da maior para a menor. As 2 primeiras (verde claro) são a **elite**, que passa intacta.
Uma "escada" suave = população diversa; um bloco todo igual = população convergiu (todas parecidas).

## Layout

A página é montada em três faixas: barra do topo, conteúdo (`#app-body`) e rodapé.

```
<nav>                 barra do topo (logo)
<div id="app-body">
  <main id="ai-layout">
    <div id="ai-game-column">   jogo + "Treino · geração em andamento"
    <div id="ai-side-column">   rede neural ao vivo + 4 gráficos
  </main>
  <aside id="ai-panel">        Painel da IA (inserido pelo ai-panel.js)
</div>
<footer id="game-footer">     controles · objetivo · botões na tela
```

| Largura da janela | Comportamento |
|---|---|
| ≥ 1500 px (painel aberto) ou ≥ 1200 px (painel recolhido) | duas colunas de conteúdo: jogo com **680 px** e gráficos com o resto; os gráficos **esticam** para preencher a altura |
| ≥ 1200 px | a página tem a altura exata da janela; o painel é uma coluna de 300 px; conteúdo e painel **rolam cada um por dentro** |
| < 1200 px | uma coluna (jogo com até 840 px, gráficos embaixo); o painel volta a **flutuar** à direita e pode ser recolhido |
| < 760 px | os gráficos ficam um embaixo do outro, e os números do progresso passam de 7 para 4 colunas |

Detalhes:

- **O jogo diminui só na tela.** O canvas continua 840 × 480 por dentro; o CSS só o desenha menor. Nada muda no jogo
  nem nos sensores.
- O `style.css` do jogo centraliza **todo** `<canvas>` da página (`left: 50%; transform: translateX(-50%)`). Os
  gráficos da telemetria anulam isso (`.tl-canvas`), senão aparecem deslocados.
- Os gráficos são redesenhados quando há geração nova **ou** quando a janela muda de tamanho (a chave
  `staticChartsKey` inclui largura e altura). `prepareCanvas()` ajusta a resolução do canvas ao tamanho na tela e à
  densidade de pixels, para não ficar borrado.
- Os canvas que esticam usam `flex: 1 1 0` com `min-height` fixo — sem isso, o tamanho do desenho viraria o tamanho
  do elemento e os gráficos cresceriam a cada redesenho.

### Rodapé

Uma faixa com os controles do teclado (setas, espaço, X), o objetivo e o interruptor **Botões na tela** (para celular).
O interruptor tem `role="switch"`, `aria-checked` e liga com Enter quando focado. Com os botões na tela ligados, a
legenda do teclado some.
