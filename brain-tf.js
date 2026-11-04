// Cérebro TensorFlow (Fase 3): aprendizado por imitação.
// Você joga com "Gravar partidas" ligado, baixa as gravações, carrega aqui e treina uma rede que imita você.

let tfModel = null;        // o modelo treinado (tf.Sequential, por exemplo). null = ainda não treinou

// Escreve uma linha de status na área de treino do painel (use dentro do trainModel para mostrar o progresso)
function setTfStatus(text) {
    document.getElementById("ai-tf-status").textContent = text;
}

// Decide a ação do frame a partir do estado, usando o modelo treinado
function tfDecide(state) {
    // 1. se o modelo ainda não foi treinado, não aperta nada
    if (!tfModel) return RELEASE_ALL;

    // 2. os mesmos 19 números da gravação
    const inputs = getInputs(state);

    // 3 e 5. pergunta para a rede, e o tf.tidy limpa os tensores criados aqui dentro
    const outputs = tf.tidy(() => {
        const inputTensor = tf.tensor2d([inputs]);        // formato [1, 19]: um frame só
        return tfModel.predict(inputTensor).dataSync();   // devolve as 6 notas como números comuns
    });

    // 4 e 6. aperta as teclas cuja nota passou do limite, igual ao nnDecide
    const action = {};
    ACTION_KEYS.forEach((key, i) => {
        action[key] = outputs[i] > tfThresholds[i];
    });

    if (Math.random() < 0.02) {
        console.log(
            "notas:", Array.from(outputs).map(v => v.toFixed(2)),
            "| limites:", tfThresholds.map(t => t.toFixed(2)),
            "| ação:", ACTION_KEYS.filter(k => action[k])
        );
    }

    return action;
}

// Lê os arquivos .json escolhidos no <input type="file"> e junta todos os frames
const REACTION_DELAY = 12;   // frames entre ver a situação e apertar a tecla

async function loadRecordings(files) {
    const allFrames = [];

    for (const file of files) {
        const frames = JSON.parse(await file.text());

        // liga o que você VIU no frame i com o que você FEZ no frame i + REACTION_DELAY
        for (let i = 0; i < frames.length - REACTION_DELAY; i++) {
            allFrames.push({
                level: frames[i].level,
                inputs: frames[i].inputs,
                actions: frames[i + REACTION_DELAY].actions,
            });
        }
    }

    return allFrames;
}

// Transforma a lista de frames nos tensores que o treino usa
function buildDataset(frames) {
    const xs = [], ys = [];
    
    frames.forEach(frame => {
        xs.push(frame.inputs);
        ys.push(frame.actions);
    });

    return { xs: tf.tensor2d(xs), ys: tf.tensor2d(ys) };
}

function createModel() {
    // 1. modelo sequencial: as camadas ficam empilhadas, uma depois da outra
    const model = tf.sequential();

    // 2. camada oculta 1: recebe os 19 números do jogo
    model.add(tf.layers.dense({ inputShape: [19], units: 32, activation: "relu" }));

    // 3. camada oculta 2
    model.add(tf.layers.dense({ units: 16, activation: "relu" }));

    // 4. camada de saída: uma "nota" de 0 a 1 para cada tecla
    model.add(tf.layers.dense({ units: 6, activation: "sigmoid" }));

    // 5. como medir o erro (loss) e como corrigir os pesos (optimizer)
    model.compile({ optimizer: "adam", loss: "binaryCrossentropy" });

    return model;
}

// Cria o modelo, treina com os frames carregados e deixa pronto para o tfDecide
async function trainModel() {
    let lastLogs = null;
    const files = document.getElementById("recordingFiles").files;

    if (files.length === 0) {
        setTfStatus("Escolha pelo menos um arquivo de gravação.");
        return;
    }

    // 1. carrega os arquivos escolhidos no input
    setTfStatus("Carregando gravações...");
    const frames = await loadRecordings(files);
    shuffleFrames(frames);

    // 2. transforma em tensores
    const { xs, ys } = buildDataset(frames);

    // 3. cria o modelo e guarda no tfModel
    tfModel = createModel();

    // 4. treina
    await tfModel.fit(xs, ys, {
        epochs: 20,
        batchSize: 64,
        shuffle: true,          // embaralha: frames vizinhos são quase iguais
        validationSplit: 0.2,   // 20% ficam de fora, só para conferir
        callbacks: {
            onEpochEnd: (epoch, logs) => {
                lastLogs = logs;
                setTfStatus(`Epoch ${epoch + 1}/20 | loss: ${logs.loss.toFixed(4)} | val_loss: ${logs.val_loss.toFixed(4)}`);
                addTfLossEpoch(epoch, logs, 20);   // manda para o gráfico de loss da telemetria
            }
        }
    });

    calibrateThresholds(frames);
    
    // libera a memória dos tensores, que não são mais necessários
    xs.dispose();
    ys.dispose();

    // guarda os dados do treino para salvar junto com o modelo
    tfTrainingInfo = {
        trainedAt: new Date().toISOString(),
        frameCount: frames.length,
        loss: lastLogs.loss,
        valLoss: lastLogs.val_loss,
        reactionDelay: REACTION_DELAY,
    };

    // 5. avisa que terminou
    setTfStatus(`Treino concluído com ${frames.length} frames | loss: ${lastLogs.loss.toFixed(4)} | val_loss: ${lastLogs.val_loss.toFixed(4)}`);
}

let tfThresholds = [];   // um limite para cada tecla, na ordem do ACTION_KEYS

// Calcula o limite de cada tecla para a rede apertar na mesma proporção que o jogador
function calibrateThresholds(frames) {
    const preds = tf.tidy(() => tfModel.predict(tf.tensor2d(frames.map(f => f.inputs))).arraySync());

    tfThresholds = ACTION_KEYS.map((key, i) => {
        const pressCount = frames.filter(f => f.actions[i] === 1).length;
        if (pressCount < 50) return pressThreshold;   // poucos exemplos: calibrar seria chute

        const pressRate = pressCount / frames.length;

        const sorted = preds.map(p => p[i]).sort((a, b) => b - a);   // da maior para a menor
        return sorted[Math.floor(pressRate * sorted.length)];
    });

    console.log("Limites calibrados:", tfThresholds.map(t => t.toFixed(3)));
}

// Embaralha uma lista no lugar (algoritmo de Fisher-Yates)
function shuffleFrames(frames) {
    for (let i = frames.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [frames[i], frames[j]] = [frames[j], frames[i]];   // troca os dois de lugar
    }
}

// ---------- Salvar e carregar o modelo treinado ----------

const TF_BROWSER_PATH = "indexeddb://space-impact-tf";    // guardado no IndexedDB do navegador
const TF_DOWNLOAD_PATH = "downloads://space-impact-tf";   // baixa space-impact-tf.json + space-impact-tf.weights.bin

let tfTrainingInfo = null;   // dados do último treino (data, frames, loss, val_loss, atraso). null = nada treinado ainda

// Liga ou desliga os botões de salvar (só faz sentido salvar depois de treinar ou carregar)
function setTfSaveButtonsEnabled(enabled) {
    document.getElementById("ai-tf-save-browser").disabled = !enabled;
    document.getElementById("ai-tf-download").disabled = !enabled;
}

// Monta o texto de status com as informações salvas junto do modelo
function describeTfTrainingInfo(info) {
    const date = new Date(info.trainedAt).toLocaleString("pt-BR");
    return `treinado em ${date} | ${info.frameCount} frames | loss: ${info.loss.toFixed(4)} | val_loss: ${info.valLoss.toFixed(4)}`;
}

// Salva o modelo com os limites e os dados do treino nos metadados, para nunca se separarem
async function saveTfModel(path) {
    if (!tfModel || !tfTrainingInfo) {
        setTfStatus("Treine ou carregue um modelo antes de salvar.");
        return;
    }

    tfModel.setUserDefinedMetadata({ thresholds: tfThresholds, ...tfTrainingInfo });

    try {
        await tfModel.save(path);
        const where = path === TF_BROWSER_PATH ? "Salvo no navegador" : "Arquivos baixados (.json e .bin)";
        setTfStatus(`${where} | ${describeTfTrainingInfo(tfTrainingInfo)}`);
    } catch (error) {
        console.error(error);
        setTfStatus(`Não foi possível salvar o modelo: ${error.message}`);
    }
}

// Carrega do navegador (path) ou de arquivos (um IOHandler do tf.io.browserFiles)
async function loadTfModel(source) {
    setTfStatus("Carregando modelo...");

    let model;
    try {
        model = await tf.loadLayersModel(source);
    } catch (error) {
        console.error(error);
        if (source === TF_BROWSER_PATH && /cannot find model/i.test(error.message)) {
            setTfStatus("Nada salvo no navegador ainda. Treine um modelo e clique em \"Salvar no navegador\".");
        } else {
            setTfStatus(`Não foi possível carregar o modelo: ${error.message}`);
        }
        return;
    }

    // troca o modelo antigo pelo novo e libera a memória do antigo
    if (tfModel) tfModel.dispose();
    tfModel = model;

    const metadata = model.getUserDefinedMetadata() || {};
    const { thresholds, ...info } = metadata;

    // sem os limites a rede não aperta nada: avisa em vez de quebrar
    if (!Array.isArray(thresholds) || thresholds.length !== ACTION_KEYS.length) {
        tfThresholds = [];
        tfTrainingInfo = null;
        setTfSaveButtonsEnabled(false);
        setTfStatus("Modelo carregado, mas sem os limites nos metadados: a rede não vai apertar nenhuma tecla. Treine de novo para gerar os limites.");
        return;
    }

    tfThresholds = thresholds;
    tfTrainingInfo = info;
    setTfSaveButtonsEnabled(true);
    console.log("Limites carregados:", tfThresholds.map(t => t.toFixed(3)));
    setTfStatus(`Modelo carregado | ${describeTfTrainingInfo(info)} | atraso: ${info.reactionDelay} frames`);
}

// Carrega o .json e o .bin escolhidos no <input type="file" multiple>
function loadTfModelFromFiles(files) {
    const list = Array.from(files);
    const jsonFile = list.find(file => file.name.endsWith(".json"));
    const binFiles = list.filter(file => file.name.endsWith(".bin"));

    if (!jsonFile || binFiles.length === 0) {
        setTfStatus("Escolha os dois arquivos do modelo juntos: o .json e o .bin.");
        return;
    }

    // o tf.io.browserFiles exige o .json em primeiro lugar
    return loadTfModel(tf.io.browserFiles([jsonFile, ...binFiles]));
}
