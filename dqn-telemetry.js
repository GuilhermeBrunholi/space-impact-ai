// Telemetria do Deep Q-Learning: só aparece no modo "dqn" (o ai-telemetry.js chama createDqnTelemetry e refreshDqnTelemetry).
// À esquerda, números do treino e como foi em cada fase; ao lado, o valor Q de cada ação agora e a recompensa por episódio.

const DQN_RETURN_WINDOW = 20;       // episódios na média móvel da recompensa
const DQN_CHART_EPISODES = 300;     // episódios mostrados no gráfico de recompensa
const DQN_STATS_EPISODES = 40;      // episódios considerados nos números por fase
let dqnChartKey = "";

function createDqnTelemetry() {
    // embaixo do jogo, no lugar da "geração em andamento"
    const progress = document.createElement("article");
    progress.className = "tl-card tl-dqn-only tl-dqn-left";
    progress.innerHTML = `
        <h4 title="Cada episódio é uma fase, sorteada entre as 8. Termina ao perder a primeira vida, ao vencer o chefe ou ao estourar o tempo.">DQN · TREINO</h4>
        <div class="tl-numbers">
            <div><span>episódios</span><strong id="tl-dqn-episodes">-</strong></div>
            <div><span>decisões</span><strong id="tl-dqn-steps">-</strong></div>
            <div><span>ε (acaso)</span><strong id="tl-dqn-epsilon">-</strong></div>
            <div><span>memória</span><strong id="tl-dqn-buffer">-</strong></div>
            <div><span>erro (loss)</span><strong id="tl-dqn-loss">-</strong></div>
            <div><span>recompensa</span><strong id="tl-dqn-return">-</strong></div>
            <div><span>vitórias</span><strong id="tl-dqn-wins">-</strong></div>
        </div>
        <p class="tl-note">Pontos médios por fase nos últimos episódios (borda = como mais terminou):</p>
        <div class="tl-levels" id="tl-dqn-levels">
            ${Array.from({ length: LEVEL_COUNT }, (_, i) => `<div><span>fase ${i + 1}</span><strong>-</strong><small>0 jogos</small></div>`).join("")}
        </div>
        <p class="tl-note">Recompensa: pontos ganhos, tirar vida do chefe e vencer a fase somam; morrer perde 5. ε é a chance de fazer uma ação aleatória para explorar, e cai com o tempo.</p>`;
    document.getElementById("game").after(progress);

    const side = document.getElementById("ai-side-column");
    const qCard = document.createElement("article");
    qCard.className = "tl-card tl-dqn-only";
    qCard.innerHTML = `
        <h4 title="Quanto a rede espera juntar de recompensa daqui para frente se fizer cada ação agora. Ela escolhe a maior (amarela).">VALOR Q DE CADA AÇÃO (AGORA)</h4>
        <canvas id="tl-dqn-q" class="tl-canvas tall" aria-label="Valor Q de cada uma das 18 ações"></canvas>
        <p class="tl-note">● = atirando · · = parado · barra amarela = ação com maior valor · contorno = ação que está sendo segurada</p>`;
    const returnCard = document.createElement("article");
    returnCard.className = "tl-card tl-evo tl-dqn-only";
    returnCard.innerHTML = `
        <h4>RECOMPENSA POR EPISÓDIO</h4>
        <canvas id="tl-dqn-returns" class="tl-canvas" aria-label="Recompensa de cada episódio e média móvel"></canvas>
        <p class="tl-note"><span class="tl-key" style="background:var(--panel-line)"></span>episódio
            <span class="tl-key" style="background:var(--lcd)"></span>média dos últimos ${DQN_RETURN_WINDOW}</p>`;
    side.append(qCard, returnCard);
}

function average(values) {
    return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
}

function refreshDqnTelemetry() {
    document.body.dataset.brain = brainMode;
    if (brainMode !== "dqn") return;

    const recent = dqn.history.slice(-DQN_RETURN_WINDOW);
    const avgReturn = average(recent.map(e => e.ret));
    const wins = dqn.history.slice(-DQN_STATS_EPISODES);
    setText("tl-dqn-episodes", dqn.episodes.toLocaleString("pt-BR"));
    setText("tl-dqn-steps", dqn.steps.toLocaleString("pt-BR"));
    setText("tl-dqn-epsilon", dqnEpsilon().toFixed(2));
    setText("tl-dqn-buffer", Math.round(replay.size / DQN_BUFFER_SIZE * 100) + "%");
    setText("tl-dqn-loss", dqn.loss === null ? "-" : dqn.loss.toFixed(3));
    setText("tl-dqn-return", avgReturn === null ? "-" : avgReturn.toFixed(1));
    setText("tl-dqn-wins", wins.length === 0 ? "-" : Math.round(wins.filter(e => e.end === "cleared").length / wins.length * 100) + "%");

    // por fase
    const stats = dqn.history.slice(-DQN_STATS_EPISODES);
    document.querySelectorAll("#tl-dqn-levels div").forEach((cell, i) => {
        const games = stats.filter(e => e.level === i + 1);
        const points = average(games.map(e => e.points));
        cell.querySelector("strong").textContent = points === null ? "-" : Math.round(points);
        cell.querySelector("small").textContent = games.length + (games.length === 1 ? " jogo" : " jogos");
        const counts = {};
        games.forEach(e => { counts[e.end] = (counts[e.end] || 0) + 1; });
        const common = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
        cell.style.borderBottomColor = common ? telemetryColors.ends[common] : "";
        cell.title = common ? END_LABELS[common] : "";
    });

    drawDqnQValues();

    const canvas = document.getElementById("tl-dqn-returns");
    const key = [dqn.episodes, canvas.clientWidth, canvas.clientHeight].join("|");
    if (key !== dqnChartKey) {
        dqnChartKey = key;
        drawDqnReturns();
    }
}

// Uma barra por ação, saindo do zero (o valor Q pode ser negativo)
function drawDqnQValues() {
    const chart = prepareCanvas("tl-dqn-q");
    const { ctx, width, height } = chart;
    const playing = !isMainScreen && currentLevel && currentLevel.player;
    if (!dqn.model) return emptyMessage(chart, "Clique em \"Iniciar treino\" para criar a rede.");
    if (!playing) return emptyMessage(chart, "Aparece durante a partida.");

    const q = dqnQValues(getInputs(getState()));
    let best = 0;
    q.forEach((value, i) => { if (value > q[best]) best = i; });
    const low = Math.min(0, ...q);
    const high = Math.max(0, ...q);
    const range = (high - low) || 1;

    const pad = { left: 44, right: 56, top: 4, bottom: 4 };
    const rowH = (height - pad.top - pad.bottom) / q.length;
    const barW = width - pad.left - pad.right;
    const zeroX = pad.left + (-low / range) * barW;

    q.forEach((value, i) => {
        const y = pad.top + i * rowH;
        const x = pad.left + ((value - low) / range) * barW;
        ctx.fillStyle = i === best ? telemetryColors.hot : telemetryColors.lcdDim;
        ctx.fillRect(Math.min(x, zeroX), y + 2, Math.max(1, Math.abs(x - zeroX)), rowH - 4);

        if (dqn.active && i === dqn.action) {
            ctx.strokeStyle = telemetryColors.fg;
            ctx.strokeRect(pad.left - 0.5, y + 1.5, barW + 1, rowH - 3);
        }
        ctx.fillStyle = i === best ? telemetryColors.hot : telemetryColors.fg;
        ctx.textAlign = "left";
        ctx.fillText(DQN_ACTION_LABELS[i], 6, y + rowH / 2);
        ctx.textAlign = "right";
        ctx.fillText(value.toFixed(2), width - 6, y + rowH / 2);
    });

    ctx.strokeStyle = telemetryColors.muted;
    ctx.beginPath();
    ctx.moveTo(zeroX, pad.top);
    ctx.lineTo(zeroX, height - pad.bottom);
    ctx.stroke();
}

function drawDqnReturns() {
    const chart = prepareCanvas("tl-dqn-returns");
    const { ctx, width, height } = chart;
    const episodes = dqn.history.slice(-DQN_CHART_EPISODES);
    if (episodes.length < 2) return emptyMessage(chart, "Aparece depois de 2 episódios.");

    const returns = episodes.map(e => e.ret);
    const averages = returns.map((_, i) => average(returns.slice(Math.max(0, i - DQN_RETURN_WINDOW + 1), i + 1)));
    const low = Math.min(0, ...returns);
    const high = Math.max(1, ...returns);
    const pad = { left: 44, right: 8, top: 8, bottom: 16 };
    const x = i => pad.left + (i / (returns.length - 1)) * (width - pad.left - pad.right);
    const y = v => height - pad.bottom - ((v - low) / (high - low)) * (height - pad.top - pad.bottom);

    ctx.strokeStyle = telemetryColors.line;
    ctx.beginPath();
    ctx.moveTo(pad.left, y(0));
    ctx.lineTo(width - pad.right, y(0));
    ctx.stroke();

    const line = (values, color, lineWidth) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        values.forEach((v, i) => (i === 0 ? ctx.moveTo(x(i), y(v)) : ctx.lineTo(x(i), y(v))));
        ctx.stroke();
    };
    line(returns, telemetryColors.line, 1);
    line(averages, telemetryColors.lcd, 2);
    ctx.lineWidth = 1;

    ctx.fillStyle = telemetryColors.muted;
    ctx.textAlign = "right";
    ctx.fillText(high.toFixed(0), pad.left - 6, y(high));
    ctx.fillText(low.toFixed(0), pad.left - 6, y(low));
    ctx.textAlign = "left";
    ctx.fillText("ep. " + (dqn.episodes - episodes.length + 1), pad.left, height - 6);
    ctx.textAlign = "right";
    ctx.fillText("ep. " + dqn.episodes, width - pad.right, height - 6);
}
