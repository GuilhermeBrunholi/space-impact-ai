// Telemetria do treino: mostra como a evolução está indo, geração a geração.
// A geração em andamento fica embaixo do jogo; os gráficos ficam na coluna ao lado (ou embaixo, em telas estreitas).

const END_LABELS = {
    cleared: "venceu o chefe",
    timeout: "tempo esgotado",
    terrain: "terreno",
    enemy: "inimigo",
    boss: "chefe",
    shot: "tiro",
};
const ACTION_LABELS = { up: "↑ cima", down: "↓ baixo", left: "← esquerda", right: "→ direita", fire: "tiro", special: "especial" };
const HEATMAP_GENERATIONS = 60;   // quantas gerações o mapa de calor mostra (as mais recentes)

let telemetryColors = null;
let staticChartsKey = "";   // os gráficos de gerações só são redesenhados quando algo muda
const tfLoss = { epochs: [], total: 0 };   // treino por imitação: { loss, valLoss } de cada epoch e o total de epochs
let tfLossKey = "";         // o gráfico de loss também só é redesenhado quando algo muda

function createTelemetry() {
    // embaixo do jogo: o que está acontecendo agora
    const progress = document.createElement("article");
    progress.className = "tl-card";
    progress.id = "tl-progress";
    progress.innerHTML = `
        <h4>TREINO · GERAÇÃO EM ANDAMENTO</h4>
        <div class="tl-numbers">
            <div><span>geração</span><strong id="tl-generation">-</strong></div>
            <div><span>nave</span><strong id="tl-ship">-</strong></div>
            <div><span>fase</span><strong id="tl-level">-</strong></div>
            <div><span>nota atual</span><strong id="tl-fitness">-</strong></div>
            <div><span>frames/s</span><strong id="tl-fps">-</strong></div>
            <div><span>tempo</span><strong id="tl-elapsed">-</strong></div>
            <div><span>falta</span><strong id="tl-eta">-</strong></div>
        </div>
        <div class="tl-ships" id="tl-ships" aria-label="Naves da geração"></div>
        <div class="tl-columns">
            <div>
                <p class="tl-note">Pontos da nave atual por fase e progresso contra o chefe (borda = como terminou):</p>
                <div class="tl-levels" id="tl-levels">
                    ${Array.from({ length: LEVEL_COUNT }, (_, i) => `<div><span>fase ${i + 1}</span><strong>-</strong><small>chefe -</small></div>`).join("")}
                </div>
            </div>
            <div>
                <p class="tl-note">Teclas apertadas nesta geração (% dos frames):</p>
                <div id="tl-actions"></div>
            </div>
        </div>`;
    document.getElementById("game").after(progress);

    // na coluna ao lado: a rede e os gráficos das gerações
    const telemetry = document.getElementById("ai-side-column");
    telemetry.innerHTML = `
        <article class="tl-card">
            <h4>REDE NEURAL AO VIVO</h4>
            <canvas id="tl-network" class="tl-canvas tall" aria-label="Diagrama da rede neural com os valores atuais"></canvas>
            <p class="tl-note"><span class="tl-key" style="background:var(--lcd)"></span>peso positivo
                <span class="tl-key" style="background:var(--bad)"></span>peso negativo · linha grossa = peso forte ·
                bolinha clara = valor alto · amarela = tecla apertada</p>
        </article>
        <div class="tl-grid">
            <article class="tl-card">
                <h4 title="Cada fase vale até 1: metade é pontos da fase ÷ recorde da fase, metade é o progresso contra o chefe (0,3 por chegar nele, até 0,95 tirando vida, 1 ao matá-lo). Quando um recorde sobe, a régua fica mais exigente e a nota pode cair.">EVOLUÇÃO DA NOTA (0 A 8)</h4>
                <canvas id="tl-evolution" class="tl-canvas" aria-label="Melhor nota e média por geração"></canvas>
                <p class="tl-note"><span class="tl-key" style="background:var(--lcd)"></span>melhor
                    <span class="tl-key" style="background:var(--panel-muted)"></span>média · cada fase vale até 1 (½ pontos ÷ recorde, ½ progresso contra o chefe)</p>
            </article>

            <article class="tl-card">
                <h4>MELHOR PONTUAÇÃO POR FASE</h4>
                <canvas id="tl-heatmap" class="tl-canvas" aria-label="Mapa de calor: melhor pontuação de cada fase em cada geração"></canvas>
                <p class="tl-note">Coluna = geração, claro = mais pontos · à direita: última geração / recorde</p>
            </article>

            <article class="tl-card">
                <h4>COMO AS FASES TERMINARAM (O QUE MATOU)</h4>
                <canvas id="tl-ends" class="tl-canvas" aria-label="Como cada fase terminou na última geração"></canvas>
                <p class="tl-note" id="tl-ends-legend"></p>
            </article>

            <article class="tl-card">
                <h4>NOTAS DA ÚLTIMA GERAÇÃO</h4>
                <canvas id="tl-scores" class="tl-canvas" aria-label="Nota de cada nave da última geração"></canvas>
                <p class="tl-note"><span class="tl-key" style="background:var(--lcd)"></span>elite (passa intacta)
                    <span class="tl-key" style="background:var(--lcd-dim)"></span>demais, da melhor para a pior</p>
            </article>
        </div>`;

    // no painel, junto do treino por imitação: fica dentro da seção do modo TF, então só aparece nesse modo
    const tfCard = document.createElement("article");
    tfCard.className = "tl-card";
    tfCard.innerHTML = `
        <h4 title="Loss é o erro da rede: quanto menor, mais ela acerta as teclas que você apertou. A validação usa 20% dos frames que a rede não vê no treino.">ERRO POR EPOCH (LOSS)</h4>
        <div class="tl-numbers tl-tf-numbers">
            <div><span>epoch</span><strong id="tl-tf-epoch">-</strong></div>
            <div><span>loss</span><strong id="tl-tf-loss">-</strong></div>
            <div><span>val_loss</span><strong id="tl-tf-val-loss">-</strong></div>
        </div>
        <canvas id="tl-tf-chart" class="tl-canvas" aria-label="Loss de treino e de validação por epoch"></canvas>
        <p class="tl-note"><span class="tl-key" style="background:var(--lcd)"></span>loss (treino)
            <span class="tl-key" style="background:var(--hot)"></span>val_loss (validação)</p>`;
    document.getElementById("ai-tf-status").after(tfCard);

    progress.querySelector("#tl-actions").innerHTML = ACTION_KEYS.map(key => `
        <div class="ai-row" id="tl-action-${key}">
            <span class="label">${ACTION_LABELS[key]}</span>
            <div class="ai-bar"><div class="fill"></div></div>
            <span class="value">-</span>
        </div>`).join("");

    telemetry.querySelector("#tl-ends-legend").innerHTML = END_REASONS
        .map(reason => `<span class="tl-key" style="background:var(--end-${reason})"></span>${END_LABELS[reason]}`)
        .join(" ");

    const style = getComputedStyle(telemetry);
    const color = name => style.getPropertyValue(name).trim();
    telemetryColors = {
        bg: color("--chart-bg"), line: color("--panel-line"), fg: color("--panel-fg"), muted: color("--panel-muted"),
        lcd: color("--lcd"), lcdDim: color("--lcd-dim"), hot: color("--hot"), bad: color("--bad"),
        ends: Object.fromEntries(END_REASONS.map(reason => [reason, color("--end-" + reason)])),
    };

    window.addEventListener("resize", () => { staticChartsKey = ""; });
    setInterval(refreshTelemetry, PANEL_REFRESH_MS);
    refreshTelemetry();
}

// ── Atualização ──

function refreshTelemetry() {
    refreshProgress();
    drawNetwork();
    refreshTfLoss();

    const last = training.history[training.history.length - 1];
    // o tamanho da janela entra na chave: os gráficos esticam com ela e precisam ser redesenhados
    const key = [training.history.length, last && last.generation, training.lastScores.length,
        document.body.clientWidth, window.innerHeight].join("|");
    if (key !== staticChartsKey) {
        staticChartsKey = key;
        drawEvolution();
        drawHeatmap();
        drawEnds();
        drawLastScores();
    }
}

function refreshProgress() {
    const shipsDone = training.index + training.levelScores.length / LEVEL_COUNT;
    const running = training.active && training.population !== null;

    setText("tl-generation", training.generation);
    setText("tl-ship", training.population ? (training.index + 1) + "/" + POPULATION_SIZE : "-");
    setText("tl-level", running ? training.level + "/" + LEVEL_COUNT : "-");
    setText("tl-fitness", running ? currentFitness().toFixed(2) : "-");
    setText("tl-fps", running ? trainingFramesPerSecond.toLocaleString("pt-BR") : "-");
    setText("tl-elapsed", training.generationMs > 0 ? formatDuration(training.generationMs / 1000) : "-");
    setText("tl-eta", running && shipsDone > 0
        ? formatDuration(training.generationMs / 1000 / shipsDone * (POPULATION_SIZE - shipsDone))
        : "-");

    // uma casinha por nave: já jogou, jogando agora, ainda vai jogar
    const ships = document.getElementById("tl-ships");
    if (ships.children.length !== POPULATION_SIZE) {
        ships.innerHTML = Array.from({ length: POPULATION_SIZE }, () => "<span></span>").join("");
    }
    [...ships.children].forEach((cell, i) => {
        cell.className = i < training.index ? "done" : i === training.index && running ? "current" : "";
    });

    document.querySelectorAll("#tl-levels div").forEach((cell, i) => {
        const done = i < training.levelScores.length;
        const current = running && i === training.levelScores.length;
        cell.querySelector("strong").textContent = done ? Math.round(training.levelScores[i])
            : current ? Math.round(levelFitness()) : "-";
        cell.classList.toggle("current", current);
        cell.style.borderBottomColor = done ? telemetryColors.ends[training.levelEnds[i]] : "";
        cell.title = done ? END_LABELS[training.levelEnds[i]] : "";
        const boss = done ? training.levelBoss[i] : current ? bossProgress() : null;
        cell.querySelector("small").textContent = boss === null ? "chefe -"
            : boss >= 1 ? "chefe ✓" : boss === 0 ? "chefe 0%" : "chefe " + Math.round(boss * 100) + "%";
    });

    ACTION_KEYS.forEach(key => {
        const row = document.getElementById("tl-action-" + key);
        const share = training.actionTotal > 0 ? (training.actionFrames[key] || 0) / training.actionTotal : null;
        row.querySelector(".fill").style.width = (share === null ? 0 : share * 100) + "%";
        row.querySelector(".value").textContent = share === null ? "-" : Math.round(share * 100) + "%";
    });
}

// Chamado ao clicar em "Treinar": o gráfico de loss recomeça do zero
function resetTfLossChart() {
    tfLoss.epochs = [];
    tfLoss.total = 0;
}

// Chamado no onEpochEnd do trainModel com os logs do fit
function addTfLossEpoch(epoch, logs, totalEpochs) {
    tfLoss.epochs[epoch] = { loss: logs.loss, valLoss: logs.val_loss };
    tfLoss.total = totalEpochs;
    refreshTfLoss();
}

function refreshTfLoss() {
    const last = tfLoss.epochs[tfLoss.epochs.length - 1];
    setText("tl-tf-epoch", last ? tfLoss.epochs.length + "/" + tfLoss.total : "-");
    setText("tl-tf-loss", last ? last.loss.toFixed(4) : "-");
    setText("tl-tf-val-loss", last ? last.valLoss.toFixed(4) : "-");

    // o tamanho entra na chave: com a seção escondida o canvas mede 0, e precisa ser redesenhado quando ela aparece
    const canvas = document.getElementById("tl-tf-chart");
    const key = [tfLoss.epochs.length, canvas.clientWidth, canvas.clientHeight].join("|");
    if (key !== tfLossKey) {
        tfLossKey = key;
        drawTfLoss();
    }
}

function setText(id, text) {
    document.getElementById(id).textContent = text;
}

function formatDuration(seconds) {
    if (!isFinite(seconds)) return "-";
    const minutes = Math.floor(seconds / 60);
    return minutes > 0 ? minutes + "min " + String(Math.round(seconds % 60)).padStart(2, "0") + "s" : Math.round(seconds) + "s";
}

// ── Desenho ──

// Ajusta a resolução do canvas ao tamanho na tela (e à densidade de pixels), e limpa
function prepareCanvas(id) {
    const canvas = document.getElementById(id);
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.font = "15px VT323, monospace";
    ctx.textBaseline = "middle";
    return { ctx, width, height };
}

function emptyMessage(chart, text) {
    chart.ctx.fillStyle = telemetryColors.muted;
    chart.ctx.textAlign = "center";
    chart.ctx.fillText(text, chart.width / 2, chart.height / 2);
}

function drawEvolution() {
    const chart = prepareCanvas("tl-evolution");
    const { ctx, width, height } = chart;
    const history = training.history;
    if (history.length < 2) return emptyMessage(chart, "Aparece depois de 2 gerações completas.");

    const pad = { left: 44, right: 8, top: 10, bottom: 18 };
    const top = Math.max(...history.map(h => h.best)) || 1;
    const x = i => pad.left + (i / (history.length - 1)) * (width - pad.left - pad.right);
    const y = v => height - pad.bottom - (v / top) * (height - pad.top - pad.bottom);

    // grade com 3 linhas de referência
    ctx.textAlign = "right";
    [0, 0.5, 1].forEach(f => {
        ctx.strokeStyle = telemetryColors.line;
        ctx.beginPath();
        ctx.moveTo(pad.left, y(top * f));
        ctx.lineTo(width - pad.right, y(top * f));
        ctx.stroke();
        ctx.fillStyle = telemetryColors.muted;
        ctx.fillText((top * f).toFixed(1), pad.left - 6, y(top * f));
    });
    ctx.textAlign = "left";
    ctx.fillText("ger. " + history[0].generation, pad.left, height - 7);
    ctx.textAlign = "right";
    ctx.fillText("ger. " + history[history.length - 1].generation, width - pad.right, height - 7);

    [["average", telemetryColors.muted], ["best", telemetryColors.lcd]].forEach(([field, color]) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        history.forEach((h, i) => (i === 0 ? ctx.moveTo(x(i), y(h[field])) : ctx.lineTo(x(i), y(h[field]))));
        ctx.stroke();
        ctx.lineWidth = 1;
    });
}

// Loss de treino e de validação por epoch. O eixo x vai até o total de epochs: a linha cresce conforme o treino anda
function drawTfLoss() {
    const chart = prepareCanvas("tl-tf-chart");
    const { ctx, width, height } = chart;
    const epochs = tfLoss.epochs;
    if (epochs.length === 0) return emptyMessage(chart, "Aparece no fim da 1ª epoch.");

    // o eixo y vai do menor ao maior valor (com folga): as diferenças de loss costumam ser pequenas
    const values = epochs.flatMap(e => [e.loss, e.valLoss]);
    const margin = (Math.max(...values) - Math.min(...values)) * 0.1 || Math.max(...values) * 0.1 || 0.01;
    const low = Math.max(0, Math.min(...values) - margin);
    const high = Math.max(...values) + margin;

    const pad = { left: 44, right: 8, top: 10, bottom: 18 };
    const x = i => pad.left + (i / Math.max(1, tfLoss.total - 1)) * (width - pad.left - pad.right);
    const y = v => height - pad.bottom - ((v - low) / (high - low)) * (height - pad.top - pad.bottom);

    // grade com 3 linhas de referência
    ctx.textAlign = "right";
    [0, 0.5, 1].forEach(f => {
        const v = low + (high - low) * f;
        ctx.strokeStyle = telemetryColors.line;
        ctx.beginPath();
        ctx.moveTo(pad.left, y(v));
        ctx.lineTo(width - pad.right, y(v));
        ctx.stroke();
        ctx.fillStyle = telemetryColors.muted;
        ctx.fillText(v.toFixed(3), pad.left - 6, y(v));
    });
    ctx.textAlign = "left";
    ctx.fillText("epoch 1", pad.left, height - 7);
    ctx.textAlign = "right";
    ctx.fillText("epoch " + tfLoss.total, width - pad.right, height - 7);

    // linha + bolinha em cada epoch (com uma epoch só, a bolinha é o que aparece)
    [["loss", telemetryColors.lcd], ["valLoss", telemetryColors.hot]].forEach(([field, color]) => {
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        epochs.forEach((e, i) => (i === 0 ? ctx.moveTo(x(i), y(e[field])) : ctx.lineTo(x(i), y(e[field]))));
        ctx.stroke();
        epochs.forEach((e, i) => {
            ctx.beginPath();
            ctx.arc(x(i), y(e[field]), 2.5, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.lineWidth = 1;
    });
}

// Mistura duas cores "#rrggbb": t = 0 → a, t = 1 → b
function mixColor(a, b, t) {
    const parse = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    const [ca, cb] = [parse(a), parse(b)];
    return "rgb(" + ca.map((v, i) => Math.round(v + (cb[i] - v) * t)).join(",") + ")";
}

function drawHeatmap() {
    const chart = prepareCanvas("tl-heatmap");
    const { ctx, width, height } = chart;
    const history = training.history.slice(-HEATMAP_GENERATIONS);
    if (!history.some(h => h.levelBest)) return emptyMessage(chart, "Aparece depois da 1ª geração completa.");

    const pad = { left: 30, right: 84, top: 2, bottom: 2 };
    const cellW = (width - pad.left - pad.right) / history.length;
    const cellH = (height - pad.top - pad.bottom) / LEVEL_COUNT;
    const max = Math.max(1, ...history.filter(h => h.levelBest).flatMap(h => h.levelBest));

    for (let l = 0; l < LEVEL_COUNT; l++) {
        const rowY = pad.top + l * cellH;
        ctx.fillStyle = telemetryColors.muted;
        ctx.textAlign = "left";
        ctx.fillText("F" + (l + 1), 4, rowY + cellH / 2);

        history.forEach((h, g) => {
            // raiz quadrada: sem ela, uma fase de 1.900 pontos apagaria todas as de 100
            ctx.fillStyle = h.levelBest
                ? mixColor(telemetryColors.bg, telemetryColors.lcd, Math.sqrt(h.levelBest[l] / max))
                : telemetryColors.bg;
            ctx.fillRect(pad.left + g * cellW, rowY + 1, Math.max(1, cellW - 1), cellH - 2);
        });

        const last = history[history.length - 1];
        ctx.fillStyle = telemetryColors.fg;
        ctx.textAlign = "right";
        const lastBest = last.levelBest ? Math.round(last.levelBest[l]) : "-";
        ctx.fillText(lastBest + " / " + Math.round(levelReference(l, training.levelRecords)), width - 4, rowY + cellH / 2);
    }
}

function drawEnds() {
    const chart = prepareCanvas("tl-ends");
    const { ctx, width, height } = chart;
    const last = [...training.history].reverse().find(h => h.levelEnds);
    if (!last) return emptyMessage(chart, "Aparece depois da 1ª geração completa.");

    const pad = { left: 30, right: 8, top: 2, bottom: 2 };
    const barH = (height - pad.top - pad.bottom) / LEVEL_COUNT;
    const barW = width - pad.left - pad.right;

    last.levelEnds.forEach((counts, l) => {
        const total = END_REASONS.reduce((sum, reason) => sum + counts[reason], 0) || 1;
        const rowY = pad.top + l * barH;
        ctx.fillStyle = telemetryColors.muted;
        ctx.textAlign = "left";
        ctx.fillText("F" + (l + 1), 4, rowY + barH / 2);

        let x = pad.left;
        END_REASONS.forEach(reason => {
            const w = (counts[reason] / total) * barW;
            if (w <= 0) return;
            ctx.fillStyle = telemetryColors.ends[reason];
            ctx.fillRect(x, rowY + 2, w, barH - 4);
            if (w > 18) {
                ctx.fillStyle = "#1b2117";
                ctx.textAlign = "center";
                ctx.fillText(counts[reason], x + w / 2, rowY + barH / 2);
            }
            x += w;
        });
    });
}

function drawLastScores() {
    const chart = prepareCanvas("tl-scores");
    const { ctx, width, height } = chart;
    const scores = training.lastScores;
    if (scores.length === 0) return emptyMessage(chart, "Aparece depois da 1ª geração completa.");

    const pad = { left: 44, right: 4, top: 10, bottom: 4 };
    const max = Math.max(1, scores[0]);
    const barW = (width - pad.left - pad.right) / scores.length;
    const y = v => height - pad.bottom - (v / max) * (height - pad.top - pad.bottom);

    ctx.textAlign = "right";
    ctx.fillStyle = telemetryColors.muted;
    ctx.fillText(max.toFixed(1), pad.left - 6, y(max));
    ctx.fillText("0", pad.left - 6, y(0));

    scores.forEach((score, i) => {
        ctx.fillStyle = i < ELITE_COUNT ? telemetryColors.lcd : telemetryColors.lcdDim;
        ctx.fillRect(pad.left + i * barW + 1, y(score), Math.max(1, barW - 2), y(0) - y(score));
    });
}

// O diagrama da rede: entradas à esquerda, camada escondida no meio, saídas à direita
function drawNetwork() {
    const chart = prepareCanvas("tl-network");
    const { ctx, width, height } = chart;

    const playing = !isMainScreen && currentLevel && currentLevel.player;
    const inputs = playing ? getInputs(getState()) : new Array(INPUT_COUNT).fill(0);
    const hidden = runLayer(inputs, network.hidden);
    const outputs = predict(network, inputs);   // já inclui o peso de cada tecla

    const columns = [
        { x: 150, values: inputs, labels: INPUT_LABELS },
        { x: width / 2, values: hidden, labels: null },
        { x: width - 120, values: outputs, labels: ACTION_KEYS.map(key => ACTION_LABELS[key]) },
    ];
    const pad = 14;
    columns.forEach(column => {
        const step = (height - pad * 2) / column.values.length;
        column.y = column.values.map((_, i) => pad + step * (i + 0.5));
    });

    // linhas: uma por peso
    const layers = [network.hidden, network.output];
    const maxWeight = Math.max(...layers.flat().flatMap(n => n.weights.map(Math.abs))) || 1;
    layers.forEach((layer, l) => {
        const from = columns[l];
        const to = columns[l + 1];
        layer.forEach((neuron, n) => {
            neuron.weights.forEach((weight, i) => {
                const strength = Math.abs(weight) / maxWeight;
                ctx.strokeStyle = weight >= 0 ? telemetryColors.lcd : telemetryColors.bad;
                ctx.globalAlpha = 0.1 + strength * 0.7;
                ctx.lineWidth = 0.5 + strength * 2.5;
                ctx.beginPath();
                ctx.moveTo(from.x, from.y[i]);
                ctx.lineTo(to.x, to.y[n]);
                ctx.stroke();
            });
        });
    });
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;

    // bolinhas: o valor de cada neurônio agora
    columns.forEach((column, c) => {
        column.values.forEach((value, i) => {
            const isOutput = c === 2;
            const pressed = isOutput && value > pressThreshold;
            ctx.fillStyle = pressed ? telemetryColors.hot : mixColor(telemetryColors.bg, telemetryColors.lcd, value);
            ctx.strokeStyle = telemetryColors.line;
            ctx.beginPath();
            ctx.arc(column.x, column.y[i], 7, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            if (!column.labels) return;
            ctx.fillStyle = pressed ? telemetryColors.hot : telemetryColors.fg;
            ctx.textAlign = isOutput ? "left" : "right";
            const labelX = isOutput ? column.x + 14 : column.x - 14;
            ctx.fillText(column.labels[i] + (isOutput ? "  " + value.toFixed(2) : ""), labelX, column.y[i]);
            if (!isOutput) {
                ctx.fillStyle = telemetryColors.muted;
                ctx.textAlign = "left";
                ctx.fillText(value.toFixed(2), 4, column.y[i]);
            }
        });
    });
}

createTelemetry();
