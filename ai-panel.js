// Painel da IA: os controles (quem joga, treino, fase, parâmetros). O que acontece no treino fica na telemetria.

const INPUT_LABELS = [
    "Altura nave", "Horizontal nave",
    "Existe tiro?", "Dist. tiro", "Altura tiro",
    "Existe inimigo?", "Dist. inimigo", "Altura inimigo",
    "Tem especial?",
    "Espaço acima", "Espaço abaixo",
];
const SPECIAL_NAMES = { missile: "míssil", laser: "laser", wall: "parede" };
const KEY_NAMES = { up: "↑ cima", down: "↓ baixo", left: "← esquerda", right: "→ direita", fire: "tiro", special: "especial" };
const PANEL_REFRESH_MS = 100;

function createPanel() {
    const panel = document.createElement("aside");
    panel.id = "ai-panel";
    panel.innerHTML = `
        <div class="ai-header">
            <span>Painel da IA</span>
            <button type="button" id="ai-collapse" aria-expanded="true">recolher</button>
        </div>
        <div class="ai-body">
            <section class="ai-section">
                <h4>QUEM CONTROLA</h4>
                <div class="ai-modes">
                    <button type="button" data-mode="human">Você</button>
                    <button type="button" data-mode="rules">Regras</button>
                    <button type="button" data-mode="nn">Rede</button>
                </div>
            </section>

            <section class="ai-section">
                <h4>TREINO (NEUROEVOLUÇÃO)</h4>
                <div class="ai-train-buttons">
                    <button type="button" id="ai-train-toggle">Iniciar treino</button>
                    <button type="button" id="ai-watch-best">Assistir a melhor</button>
                    <button type="button" id="ai-copy-best">Copiar melhor</button>
                    <button type="button" id="ai-reset-training">Zerar treino</button>
                </div>
                <button type="button" id="ai-turbo" aria-pressed="false">Turbo: desligado</button>
                <div class="ai-param">
                    <label for="ai-speed"><span>Velocidade sem turbo</span><span id="ai-speed-value"></span></label>
                    <input type="range" id="ai-speed" min="1" max="30" step="1">
                </div>
                <p class="ai-note" id="ai-best-note"></p>
                <p class="ai-note" id="ai-saved-to"></p>
                <p class="ai-note" id="ai-train-message"></p>
            </section>

            <section class="ai-section">
                <h4>JOGO</h4>
                <div class="ai-stats">
                    <div><span>fase</span><strong id="ai-level">-</strong></div>
                    <div><span>vidas</span><strong id="ai-lives">-</strong></div>
                    <div><span>pontos</span><strong id="ai-score">-</strong></div>
                </div>
                <p class="ai-note" id="ai-special"></p>
                <p class="ai-note">Fase inicial (para jogar e para "Assistir a melhor"; o treino passa pelas 8):</p>
                <div class="ai-levels" role="group" aria-label="Fase inicial">
                    ${Array.from({ length: LEVEL_COUNT }, (_, i) => `<button type="button" data-level="${i + 1}">${i + 1}</button>`).join("")}
                </div>
            </section>

            <section class="ai-section">
                <h4>REDE E PARÂMETROS</h4>
                <button type="button" id="ai-new-network">Nova rede aleatória (${countWeights(network)} pesos)</button>
                <div class="ai-param">
                    <label for="ai-threshold"><span>Limite para apertar</span><span id="ai-threshold-value"></span></label>
                    <input type="range" id="ai-threshold" min="0.1" max="0.9" step="0.05">
                </div>
                <p class="ai-note">Peso de cada tecla (+ aperta mais fácil, − mais difícil):</p>
                <div class="ai-key-weights">
                    ${ACTION_KEYS.map(key => `
                        <label for="ai-weight-${key}">${KEY_NAMES[key]}</label>
                        <input type="range" id="ai-weight-${key}" min="-10" max="10" step="0.5">
                        <span id="ai-weight-${key}-value"></span>`).join("")}
                </div>
                <div class="ai-param">
                    <label for="ai-cooldown"><span>Intervalo entre tiros</span><span id="ai-cooldown-value"></span></label>
                    <input type="range" id="ai-cooldown" min="50" max="1000" step="50">
                </div>
                <div class="ai-param">
                    <label for="ai-mutation-rate"><span>Taxa de mutação</span><span id="ai-mutation-rate-value"></span></label>
                    <input type="range" id="ai-mutation-rate" min="0.01" max="0.5" step="0.01">
                </div>
                <div class="ai-param">
                    <label for="ai-mutation-strength"><span>Força da mutação</span><span id="ai-mutation-strength-value"></span></label>
                    <input type="range" id="ai-mutation-strength" min="0.05" max="2" step="0.05">
                </div>
            </section>
        </div>`;
    document.getElementById("app-body").appendChild(panel);
    document.body.classList.add("ai-panel-open");

    // recolher / expandir
    const collapse = panel.querySelector("#ai-collapse");
    collapse.addEventListener("click", () => {
        const collapsed = panel.classList.toggle("collapsed");
        document.body.classList.toggle("ai-panel-open", !collapsed);
        collapse.textContent = collapsed ? "abrir" : "recolher";
        collapse.setAttribute("aria-expanded", String(!collapsed));
    });

    // quem controla
    panel.querySelectorAll("[data-mode]").forEach(button => {
        button.addEventListener("click", () => setBrainMode(button.dataset.mode));
    });

    // fase inicial
    panel.querySelectorAll("[data-level]").forEach(button => {
        button.addEventListener("click", () => selectLevel(Number(button.dataset.level)));
    });

    // nova rede
    panel.querySelector("#ai-new-network").addEventListener("click", () => {
        network = createNetwork();
    });

    // parâmetros
    bindSlider("ai-threshold", () => pressThreshold, value => { pressThreshold = value; }, value => value.toFixed(2));
    bindSlider("ai-cooldown", () => fireCooldown, value => { fireCooldown = value; }, value => value + " ms");
    bindSlider("ai-mutation-rate", () => mutationRate, value => { mutationRate = value; }, value => Math.round(value * 100) + "%");
    bindSlider("ai-mutation-strength", () => mutationStrength, value => { mutationStrength = value; }, value => value.toFixed(2));
    bindSlider("ai-speed", () => training.speed, value => { training.speed = value; }, value => value + "x");
    const formatWeight = value => (value > 0 ? "+" : "") + value.toFixed(1);
    ACTION_KEYS.forEach(key => {
        bindSlider("ai-weight-" + key, () => actionWeights[key], value => { actionWeights[key] = value; }, formatWeight);
    });
    // o treino salvo pode trazer outros pesos: quando ele terminar de carregar, os sliders acompanham
    trainingLoaded.then(() => {
        ACTION_KEYS.forEach(key => {
            document.getElementById("ai-weight-" + key).value = actionWeights[key];
            document.getElementById("ai-weight-" + key + "-value").textContent = formatWeight(actionWeights[key]);
        });
    });

    // turbo
    panel.querySelector("#ai-turbo").addEventListener("click", () => {
        training.turbo = !training.turbo;
    });

    // treino
    const trainMessage = panel.querySelector("#ai-train-message");
    panel.querySelector("#ai-train-toggle").addEventListener("click", () => {
        if (training.active) stopTraining();
        else startTraining();
    });
    panel.querySelector("#ai-watch-best").addEventListener("click", () => {
        if (training.bestEver === null) trainMessage.textContent = "Ainda não há melhor nave. Treine ao menos uma geração.";
        else watchBest();
    });
    panel.querySelector("#ai-copy-best").addEventListener("click", () => {
        const json = exportBest();
        if (json === null) {
            trainMessage.textContent = "Ainda não há melhor nave para copiar.";
            return;
        }
        console.log(json);
        navigator.clipboard.writeText(json)
            .then(() => { trainMessage.textContent = "Melhor rede copiada. Cole num arquivo best-network.json."; })
            .catch(() => { trainMessage.textContent = "Não deu para copiar. A rede foi impressa no console (F12)."; });
    });
    panel.querySelector("#ai-reset-training").addEventListener("click", () => {
        resetTraining();
        trainMessage.textContent = "Treino zerado. A próxima geração começa do zero.";
    });

    setInterval(refreshPanel, PANEL_REFRESH_MS);
    refreshPanel();
}

function bindSlider(id, getValue, setValue, format) {
    const slider = document.getElementById(id);
    const label = document.getElementById(id + "-value");
    slider.value = getValue();
    label.textContent = format(getValue());
    slider.addEventListener("input", () => {
        setValue(Number(slider.value));
        label.textContent = format(Number(slider.value));
    });
}

function countWeights(net) {
    return [...net.hidden, ...net.output].reduce((total, n) => total + n.weights.length + 1, 0);
}

function refreshPanel() {
    document.querySelectorAll("#ai-panel [data-mode]").forEach(button => {
        button.classList.toggle("active", button.dataset.mode === brainMode);
    });
    document.querySelectorAll("#ai-panel [data-level]").forEach(button => {
        button.classList.toggle("active", Number(button.dataset.level) === startLevel);
    });

    const playing = !isMainScreen && currentLevel && currentLevel.player;
    document.getElementById("ai-level").textContent = playing ? currentLevel.number : "-";
    document.getElementById("ai-lives").textContent = playing ? lives : "-";
    document.getElementById("ai-score").textContent = playing ? playerScore : "-";
    document.getElementById("ai-special").textContent = "Arma especial (tecla X): " + SPECIAL_NAMES[specialAtttack] + " × " + specialCount;

    refreshTraining();
}

function refreshTraining() {
    document.getElementById("ai-train-toggle").textContent = training.active ? "Pausar treino" : "Iniciar treino";

    const turbo = document.getElementById("ai-turbo");
    turbo.textContent = training.turbo ? "Turbo: ligado" : "Turbo: desligado";
    turbo.classList.toggle("active", training.turbo);
    turbo.setAttribute("aria-pressed", String(training.turbo));
    document.getElementById("ai-speed").disabled = training.turbo;   // no turbo, a velocidade é a máxima possível

    const best = training.bestEver;
    let bestText = "Nenhuma geração completa ainda.";
    if (best && best.fitness === -Infinity) {
        bestText = "Melhor nave: a do treino antigo (geração " + best.generation + "). Ainda sem nota na regra nova.";
    }
    else if (best) {
        bestText = "Melhor nota até agora: " + best.fitness.toFixed(2) + " de " + LEVEL_COUNT + " (geração " + best.generation + ")";
        if (best.levelScores) bestText += ". Pontos por fase: " + best.levelScores.map(Math.round).join(" · ");
    }
    document.getElementById("ai-best-note").textContent = bestText;
    document.getElementById("ai-saved-to").textContent = "Salvo em: " + savedTo;
}

createPanel();
