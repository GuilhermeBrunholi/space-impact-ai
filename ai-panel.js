// Painel da IA: os controles (quem joga, treino, fase, parâmetros). O que acontece no treino fica na telemetria.

const INPUT_LABELS = [
    "Altura nave", "Horizontal nave",
    "Existe tiro?", "Dist. tiro", "Altura tiro",
    "Existe inimigo?", "Dist. inimigo", "Altura inimigo",
    "Tem especial?",
    "Espaço acima", "Espaço abaixo",
    "Existe item?", "Dist. item", "Altura item", "Item é vida?",
    "Perigo tiro", "Onde: tiro",
    "Perigo inimigo", "Onde: inimigo",
    "Teto à frente", "Chão à frente",
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
                    <button type="button" data-mode="tf">Rede TensorFlow (imitação)</button>
                    <button type="button" data-mode="dqn">Deep Q-Learning (DQN)</button>
                </div>
            </section>

            <!-- data-modes: em quais modos de "Quem controla" a seção aparece (sem o atributo, aparece sempre) -->
            <section class="ai-section" data-modes="human">
                <h4>GRAVAÇÃO (VOCÊ JOGANDO)</h4>
                <label class="ai-check"><input type="checkbox" id="ai-record-toggle"> Gravar partidas</label>
                <div class="ai-train-buttons">
                    <button type="button" id="ai-record-download">Baixar gravação</button>
                    <button type="button" id="ai-record-clear">Limpar gravação</button>
                </div>
                <p class="ai-note" id="ai-record-count"></p>
            </section>

            <section class="ai-section" data-modes="tf">
                <h4>TREINO (IMITAÇÃO)</h4>
                <label class="ai-note" for="recordingFiles">Gravações (.json):</label>
                <input type="file" id="recordingFiles" accept=".json" multiple>
                <button type="button" id="ai-tf-train">Treinar</button>
                <p class="ai-note" id="ai-tf-status">Carregue gravações e clique em Treinar.</p>
                <div class="ai-train-buttons">
                    <button type="button" id="ai-tf-save-browser" disabled>Salvar no navegador</button>
                    <button type="button" id="ai-tf-load-browser">Carregar do navegador</button>
                    <button type="button" id="ai-tf-download" disabled>Baixar modelo</button>
                    <button type="button" id="ai-tf-load-files">Carregar arquivos do modelo</button>
                </div>
                <!-- escondido: o botão acima abre a janela; escolha o .json e o .bin juntos -->
                <input type="file" id="tfModelFiles" accept=".json,.bin" multiple hidden>
            </section>

            <section class="ai-section" data-modes="dqn">
                <h4>TREINO (DEEP Q-LEARNING)</h4>
                <div class="ai-train-buttons">
                    <button type="button" id="ai-dqn-toggle">Iniciar treino</button>
                    <button type="button" id="ai-dqn-watch">Assistir (sem aprender)</button>
                    <button type="button" id="ai-dqn-save">Salvar no navegador</button>
                    <button type="button" id="ai-dqn-load">Carregar do navegador</button>
                </div>
                <button type="button" id="ai-dqn-turbo" aria-pressed="false">Turbo: desligado</button>
                <div class="ai-param">
                    <label for="ai-dqn-speed"><span>Velocidade sem turbo</span><span id="ai-dqn-speed-value"></span></label>
                    <input type="range" id="ai-dqn-speed" min="1" max="30" step="1">
                </div>
                <label class="ai-check"><input type="checkbox" id="ai-dqn-only-level"> Só a fase escolhida</label>
                <button type="button" id="ai-dqn-reset">Zerar rede</button>
                <p class="ai-note" id="ai-dqn-status"></p>
                <p class="ai-note">Aprende a cada passo, com recompensa. Sem "Só a fase escolhida", cada episódio sorteia uma das 8 fases. A arma especial (X) não é usada.</p>
            </section>

            <section class="ai-section" data-modes="nn">
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

            <section class="ai-section" data-modes="rules nn tf dqn">
                <h4>NAVE DA IA</h4>
                <div class="ai-param">
                    <label for="ai-cooldown"><span>Intervalo entre tiros</span><span id="ai-cooldown-value"></span></label>
                    <input type="range" id="ai-cooldown" min="50" max="1000" step="50">
                </div>
            </section>

            <section class="ai-section" data-modes="nn">
                <h4>REDE E PARÂMETROS</h4>
                <button type="button" id="ai-new-network"></button>
                <div class="ai-param">
                    <label for="ai-hidden"><span>Neurônios escondidos</span><span id="ai-hidden-value"></span></label>
                    <input type="range" id="ai-hidden" min="${MIN_HIDDEN_COUNT}" max="${MAX_HIDDEN_COUNT}" step="1">
                </div>
                <p class="ai-note" id="ai-hidden-note"></p>
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

    // gravação
    const recordToggle = panel.querySelector("#ai-record-toggle");
    recordToggle.checked = recordingEnabled;
    recordToggle.addEventListener("change", () => { recordingEnabled = recordToggle.checked; });
    panel.querySelector("#ai-record-download").addEventListener("click", downloadRecording);
    panel.querySelector("#ai-record-clear").addEventListener("click", clearRecording);

    // treino por imitação (as funções de ML ficam no brain-tf.js; o gráfico de loss, na telemetria)
    panel.querySelector("#recordingFiles").addEventListener("change", event => loadRecordings(event.target.files));
    panel.querySelector("#ai-tf-train").addEventListener("click", async () => {
        resetTfLossChart();   // cada treino começa um gráfico novo
        setTfSaveButtonsEnabled(false);   // durante o treino não dá para salvar um modelo pela metade
        await trainModel();
        setTfSaveButtonsEnabled(tfTrainingInfo !== null);
    });

    // salvar e carregar o modelo treinado (as funções ficam no brain-tf.js)
    panel.querySelector("#ai-tf-save-browser").addEventListener("click", () => saveTfModel(TF_BROWSER_PATH));
    panel.querySelector("#ai-tf-download").addEventListener("click", () => saveTfModel(TF_DOWNLOAD_PATH));
    panel.querySelector("#ai-tf-load-browser").addEventListener("click", () => loadTfModel(TF_BROWSER_PATH));
    const modelFilesInput = panel.querySelector("#tfModelFiles");
    panel.querySelector("#ai-tf-load-files").addEventListener("click", () => modelFilesInput.click());
    modelFilesInput.addEventListener("change", () => {
        loadTfModelFromFiles(modelFilesInput.files);
        modelFilesInput.value = "";   // permite escolher os mesmos arquivos de novo
    });

    // fase inicial
    panel.querySelectorAll("[data-level]").forEach(button => {
        button.addEventListener("click", () => selectLevel(Number(button.dataset.level)));
    });

    // nova rede
    panel.querySelector("#ai-new-network").addEventListener("click", () => {
        network = createNetwork();
    });

    // neurônios escondidos: o número vale ao soltar o slider (mudar o tamanho mexe em todas as redes do treino)
    const hiddenSlider = panel.querySelector("#ai-hidden");
    const hiddenNote = panel.querySelector("#ai-hidden-note");
    hiddenSlider.value = HIDDEN_COUNT;
    document.getElementById("ai-hidden-value").textContent = HIDDEN_COUNT;
    hiddenSlider.addEventListener("input", () => {
        document.getElementById("ai-hidden-value").textContent = hiddenSlider.value;
    });
    hiddenSlider.addEventListener("change", () => {
        const count = Number(hiddenSlider.value);
        if (count < HIDDEN_COUNT && !confirm("Diminuir corta neurônios: as redes podem jogar diferente, a geração recomeça e a melhor nave perde a nota. Continuar?")) {
            hiddenSlider.value = HIDDEN_COUNT;
        }
        else {
            setHiddenCount(count);
            hiddenNote.textContent = "Rede com " + HIDDEN_COUNT + " neurônios escondidos. Ao aumentar, as naves jogam igual e a evolução ajusta os novos.";
        }
        document.getElementById("ai-hidden-value").textContent = hiddenSlider.value;
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
        hiddenSlider.value = HIDDEN_COUNT;
        document.getElementById("ai-hidden-value").textContent = HIDDEN_COUNT;
        ACTION_KEYS.forEach(key => {
            document.getElementById("ai-weight-" + key).value = actionWeights[key];
            document.getElementById("ai-weight-" + key + "-value").textContent = formatWeight(actionWeights[key]);
        });
    });

    // Deep Q-Learning (as funções ficam no dqn.js; os gráficos, no dqn-telemetry.js)
    panel.querySelector("#ai-dqn-toggle").addEventListener("click", () => {
        if (dqn.active) stopDqn();
        else startDqn();
    });
    panel.querySelector("#ai-dqn-watch").addEventListener("click", watchDqn);
    panel.querySelector("#ai-dqn-save").addEventListener("click", () => saveDqn());
    panel.querySelector("#ai-dqn-load").addEventListener("click", loadDqn);
    panel.querySelector("#ai-dqn-reset").addEventListener("click", () => {
        if (dqn.episodes === 0 || confirm("Zerar a rede do DQN? O que ela aprendeu (e não foi salvo) se perde.")) resetDqn();
    });
    panel.querySelector("#ai-dqn-turbo").addEventListener("click", () => { dqn.turbo = !dqn.turbo; });
    panel.querySelector("#ai-dqn-only-level").addEventListener("change", event => { dqn.onlySelectedLevel = event.target.checked; });
    bindSlider("ai-dqn-speed", () => dqn.speed, value => { dqn.speed = value; }, value => value + "x");

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
    document.getElementById("ai-new-network").textContent = "Nova rede aleatória (" + countWeights(network) + " pesos)";
    document.querySelectorAll("#ai-panel [data-mode]").forEach(button => {
        button.classList.toggle("active", button.dataset.mode === brainMode);
    });
    document.querySelectorAll("#ai-panel [data-modes]").forEach(section => {
        section.hidden = !section.dataset.modes.split(" ").includes(brainMode);
    });
    document.getElementById("ai-record-count").textContent = "Frames gravados: " + recordedFrames.length;
    document.querySelectorAll("#ai-panel [data-level]").forEach(button => {
        button.classList.toggle("active", Number(button.dataset.level) === startLevel);
    });

    const playing = !isMainScreen && currentLevel && currentLevel.player;
    document.getElementById("ai-level").textContent = playing ? currentLevel.number : "-";
    document.getElementById("ai-lives").textContent = playing ? lives : "-";
    document.getElementById("ai-score").textContent = playing ? playerScore : "-";
    document.getElementById("ai-special").textContent = "Arma especial (tecla X): " + SPECIAL_NAMES[specialAtttack] + " × " + specialCount;

    refreshTraining();
    refreshDqnPanel();
}

function refreshDqnPanel() {
    document.getElementById("ai-dqn-toggle").textContent = dqn.active ? "Pausar treino" : "Iniciar treino";
    const turbo = document.getElementById("ai-dqn-turbo");
    turbo.textContent = dqn.turbo ? "Turbo: ligado" : "Turbo: desligado";
    turbo.classList.toggle("active", dqn.turbo);
    turbo.setAttribute("aria-pressed", String(dqn.turbo));
    document.getElementById("ai-dqn-speed").disabled = dqn.turbo;
    document.getElementById("ai-dqn-status").textContent = dqn.status;
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
        bestText = "Melhor nave: de antes de uma mudança de regra ou de rede (geração " + best.generation + "). Ainda sem nota.";
    }
    else if (best) {
        bestText = "Melhor nota até agora: " + best.fitness.toFixed(2) + " de " + LEVEL_COUNT + " (geração " + best.generation + ")";
        if (best.levelScores) bestText += ". Pontos por fase: " + best.levelScores.map(Math.round).join(" · ");
    }
    document.getElementById("ai-best-note").textContent = bestText;
    document.getElementById("ai-saved-to").textContent = "Salvo em: " + savedTo;
}

createPanel();
