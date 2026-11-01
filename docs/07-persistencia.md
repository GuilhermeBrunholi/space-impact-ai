# 07 — Salvar e carregar o treino

O treino é salvo **no fim de cada geração** (`saveTraining()` dentro de `endGeneration()`) e carregado quando a
página abre (`loadTraining()`).

## Onde fica

| Situação | Destino |
|---|---|
| Página aberta pelo `server.py` (normal) | arquivo `training-data/training.json` (+ `best-network.json`) |
| Página aberta de outro jeito (ex.: GitHub Pages, sem servidor) | `localStorage` do navegador, chave `spaceImpactTraining` |

O painel mostra onde foi o último salvamento ("Salvo em: …").

## A API do `server.py`

O `server.py` é um servidor HTTP da biblioteca padrão do Python (`ThreadingHTTPServer` + `SimpleHTTPRequestHandler`)
que serve os arquivos do projeto e responde em **um endereço**:

| Método | Endereço | Resposta |
|---|---|---|
| `GET` | `/api/training` | `200` com o JSON salvo, ou `200` com `null` se ainda não há treino |
| `POST` | `/api/training` | grava o corpo em `training.json` e o campo `bestEver` em `best-network.json` |
| `DELETE` | `/api/training` | apaga os dois arquivos (botão "Zerar treino") |

Detalhes de implementação:

- **Só aceita conexões desta máquina** (escuta em `127.0.0.1`).
- **Sem cache** (`Cache-Control: no-store`): ao editar um `.js`, recarregar a página já pega a versão nova.
- **Gravação atômica** (`write_json`): grava num `.tmp` e troca com `os.replace`. Se o computador desligar no meio,
  o arquivo antigo continua inteiro — nunca fica um JSON pela metade.
- **Limite de 5 MB** por envio e validação de JSON (`413` e `400` nos erros).
- `GET` sem treino devolve `200 null` (e não `404`) para não sujar o console a cada abertura.
- `allow_reuse_address = False`: no Windows, reaproveitar o endereço deixaria **dois servidores** escutarem a mesma
  porta sem erro. Se a porta 8000 estiver ocupada, ele avisa e encerra com código 0 (o VS Code segue normalmente).

### Como a página decide entre arquivo e `localStorage`

`loadTraining()` faz um `GET /api/training`. Se a resposta tem `Content-Type: application/json`, **o servidor manda**
— mesmo que a resposta seja `null` (ainda não há treino). Só se não houver servidor (erro de rede ou resposta que não
é JSON, como a página 404 de um site estático) é que ele tenta o `localStorage`.

`startTraining()` espera o carregamento terminar (`await trainingLoaded`) antes de criar uma população — sem isso,
clicar rápido em "Iniciar treino" poderia começar do zero e sobrescrever o treino salvo.

## Formato do `training.json`

```jsonc
{
  "fitnessVersion": 3,            // versão da fórmula da nota (ver 06 — Treino)
  "weightLimit": 4,               // limite de pesos com que estas redes treinaram (ver 05)
  "actionWeights": { "up": 0, "down": 0, "left": -3, "right": -3, "fire": 2, "special": -8 },
  "generation": 26,               // próxima geração a jogar
  "genomes": [[…114 números…], …],          // as 30 redes da população atual (ainda sem nota)
  "bestEver": {
    "genome": […114 números…],
    "fitness": 4.23,              // nota (0 a 8) medida pelos recordes atuais
    "points": 5612,               // soma dos pontos crus
    "generation": 5,
    "levelScores": [532, 534, 434, 440, 1010, 1703, 433, 26]
  },
  "history": [                    // uma entrada por geração completa
    {
      "generation": 25, "best": 4.1, "average": 2.3,
      "bestPoints": 5100, "averagePoints": 3020,
      "levelBest":    [8 números],          // melhor pontuação em cada fase
      "levelAverage": [8 números],
      "levelEnds":    [8 × { "cleared": 0, "timeout": 0, "terrain": 0, "enemy": 0, "boss": 0, "shot": 0 }],
      "seconds": 54                         // tempo real que a geração levou
    }
  ],
  "lastScores": [30 números],     // notas da última geração, da maior para a menor
  "levelRecords": [8 números]     // recorde de cada fase: a régua da nota
}
```

O arquivo cresce ~1 KB por geração de histórico (~140 KB com 40 gerações). A população é salva **sem notas**: ao recarregar, a geração
atual recomeça da primeira nave.

`best-network.json` guarda só o `bestEver` (genoma, nota, fases). Para obter a rede em formato legível
(`{ hidden: […], output: […] }`), use o botão **Copiar melhor**.

## Compatibilidade com treinos antigos

`applySnapshot()` aceita qualquer versão já usada e converte na hora:

| Diferença no arquivo | O que acontece ao carregar |
|---|---|
| Genomas de 89 ou 102 números | `upgradeGenome()`: entradas novas com peso 0, saídas novas aleatórias ([04](04-rede-neural.md#como-a-rede-cresceu-e-como-treinos-antigos-são-aproveitados)) |
| Sem `weightLimit` (ou diferente de 4) | `repairGenome()`: reescala todas as redes e revive saídas travadas em metade da população; o `bestEver` só é reescalado ([05](05-neuroevolucao.md#conserto-de-redes-saturadas--repairgenome)) |
| `fitnessVersion` diferente | mantém os pesos; recria os recordes a partir da melhor nave e do histórico; zera o histórico e as notas da última geração |
| Sem `actionWeights` | usa os pesos de tecla padrão |
| Sem `lastScores` / `levelRecords` | começa vazio |

## Backups

Antes de cada mudança que alterava o formato ou a população, foi feita uma cópia em `training-data/`:

| Arquivo | Geração | Antes de… |
|---|---|---|
| `training-antes-especial.json` | 87 | arma especial na rede (89 → 102 números) e treino nas 8 fases |
| `training-antes-terreno.json` | 88 | sensores de terreno (102 → 114 números) |
| `training-antes-equilibrio.json` | 115 | nota equilibrada por fase (versão 3) |
| `training-antes-limite-pesos.json` | 128 | limite de ±4 e conserto das redes saturadas |

Para voltar a um backup: pare o treino, renomeie o backup para `training.json` e recarregue a página. A conversão
automática cuida do formato.
