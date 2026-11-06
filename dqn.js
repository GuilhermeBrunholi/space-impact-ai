// Cérebro DQN (Deep Q-Learning): a rede aprende jogando, a cada passo, com gradiente.
// Em vez de uma nota por geração (neuroevolução), ela recebe uma recompensa a cada instante e aprende a estimar
// o valor Q de cada ação: "se eu fizer isto agora, quanto de recompensa espero juntar daqui para frente?".
//
// Peças clássicas do DQN, todas aqui:
//  - ação discreta: o DQN escolhe UMA entre N; por isso as 6 teclas viram 9 movimentos × atirar ou não (18 ações)
//  - ε-greedy: com chance ε faz uma ação aleatória (explora), senão a de maior Q (aproveita); ε cai com o tempo
//  - replay buffer: guarda as últimas transições e treina com amostras embaralhadas, para quebrar a correlação entre frames
//  - rede-alvo: uma cópia congelada da rede, usada para calcular o objetivo; é atualizada de tempos em tempos
//  - Double DQN: a rede atual escolhe a melhor ação do próximo estado e a rede-alvo diz quanto ela vale
//  - perda de Huber: erros grandes não explodem o gradiente

const DQN_FRAME_SKIP = 4;           // a rede decide a cada 4 frames do jogo e segura a ação entre eles
const DQN_MAX_SECONDS = 90;         // fase mais longa que isso é encerrada (tempo do jogo)
const DQN_GAMMA = 0.99;             // quanto o futuro vale (0 = só a recompensa de agora)
const DQN_LEARNING_RATE = 0.001;
const DQN_BATCH_SIZE = 64;
const DQN_BUFFER_SIZE = 50000;      // transições guardadas no replay buffer
const DQN_MIN_BUFFER = 1000;        // só começa a aprender depois de juntar isto
const DQN_TRAIN_EVERY = 4;          // um passo de aprendizado a cada 4 decisões
const DQN_TARGET_SYNC = 1000;       // decisões entre cada cópia rede atual → rede-alvo
const DQN_EPSILON_START = 1;
const DQN_EPSILON_END = 0.05;
const DQN_EPSILON_DECAY = 60000;    // decisões até o ε chegar no mínimo
const DQN_AUTOSAVE_EPISODES = 50;
const DQN_BROWSER_PATH = "indexeddb://space-impact-dqn";

// Recompensas (por episódio = uma fase, que acaba ao perder a primeira vida, ao vencer o chefe ou ao estourar o tempo)
const DQN_REWARD_POINTS = 1 / 25;    // por ponto do jogo ganho, até DQN_REWARD_POINTS_CAP pontos por frame
const DQN_REWARD_POINTS_CAP = 100;
const DQN_REWARD_BOSS = 3;           // vezes o progresso contra o chefe (0 a 1) ganho no frame
const DQN_REWARD_ALIVE = 0.001;      // por frame vivo
const DQN_REWARD_DEATH = -5;
const DQN_REWARD_CLEARED = 10;

// As 18 ações: 9 movimentos (parado + 8 direções) × (sem tiro, com tiro). A arma especial (X) fica de fora.
const DQN_MOVES = [
    { up: false, down: false, left: false, right: false },
    { up: true, down: false, left: false, right: false },
    { up: false, down: true, left: false, right: false },
    { up: false, down: false, left: true, right: false },
    { up: false, down: false, left: false, right: true },
    { up: true, down: false, left: true, right: false },
    { up: true, down: false, left: false, right: true },
    { up: false, down: true, left: true, right: false },
    { up: false, down: true, left: false, right: true },
];
const DQN_MOVE_LABELS = ["·", "↑", "↓", "←", "→", "↖", "↗", "↙", "↘"];
const DQN_ACTIONS = [false, true].flatMap(fire => DQN_MOVES.map(move => ({ ...move, fire, special: false })));
const DQN_ACTION_LABELS = [false, true].flatMap(fire => DQN_MOVE_LABELS.map(label => label + (fire ? "●" : "")));

const dqn = {
    active: false,
    turbo: false,
    speed: 8,                // frames do jogo por frame da tela, sem turbo
    onlySelectedLevel: false,   // false = cada episódio sorteia uma das 8 fases
    model: null,             // rede atual: 21 entradas → 18 valores Q
    target: null,            // rede-alvo
    optimizer: null,
    steps: 0,                // decisões tomadas
    learnSteps: 0,
    episodes: 0,
    loss: null,
    // episódio em andamento
    level: 1,
    frame: 0,
    action: 0,               // índice da ação que está sendo segurada
    last: null,              // { state, action } da última decisão, esperando a recompensa para virar transição
    pending: 0,              // recompensa juntada desde a última decisão
    episodeReturn: 0,
    prevScore: 0,
    prevBoss: 0,
    startLives: 0,
    bossMaxHp: 0,
    bossHp: 0,
    history: [],             // [{ ret, level, points, end }] dos últimos episódios (o gráfico de recompensa)
    watchFrame: 0,           // fora do treino: contador para segurar a ação entre decisões
    watchAction: 0,
    status: "",
};

// ── Replay buffer: anel de transições (estado, ação, recompensa, próximo estado, acabou?) ──

const replay = {
    size: 0,
    next: 0,
    states: new Float32Array(DQN_BUFFER_SIZE * INPUT_COUNT),
    nextStates: new Float32Array(DQN_BUFFER_SIZE * INPUT_COUNT),
    actions: new Int32Array(DQN_BUFFER_SIZE),
    rewards: new Float32Array(DQN_BUFFER_SIZE),
    notDone: new Float32Array(DQN_BUFFER_SIZE),   // 0 quando o episódio acabou aqui (não há futuro a somar)
};

function remember(state, action, reward, nextState, done) {
    const i = replay.next;
    replay.states.set(state, i * INPUT_COUNT);
    if (nextState) replay.nextStates.set(nextState, i * INPUT_COUNT);
    else replay.nextStates.fill(0, i * INPUT_COUNT, (i + 1) * INPUT_COUNT);
    replay.actions[i] = action;
    replay.rewards[i] = reward;
    replay.notDone[i] = done ? 0 : 1;
    replay.next = (i + 1) % DQN_BUFFER_SIZE;
    replay.size = Math.min(DQN_BUFFER_SIZE, replay.size + 1);
}

// ── Redes ──

function createQModel() {
    const model = tf.sequential();
    model.add(tf.layers.dense({ inputShape: [INPUT_COUNT], units: 64, activation: "relu" }));
    model.add(tf.layers.dense({ units: 64, activation: "relu" }));
    model.add(tf.layers.dense({ units: DQN_ACTIONS.length }));   // sem ativação: valor Q é um número qualquer
    return model;
}

async function ensureDqnModel() {
    // redes minúsculas rodam mais rápido na CPU do que indo e voltando da placa de vídeo a cada decisão
    if (tf.getBackend() !== "cpu") await tf.setBackend("cpu");
    await tf.ready();
    if (!dqn.model) dqn.model = createQModel();
    if (!dqn.target) {
        dqn.target = createQModel();
        syncTarget();
    }
    if (!dqn.optimizer) dqn.optimizer = tf.train.adam(DQN_LEARNING_RATE);
}

function syncTarget() {
    dqn.target.setWeights(dqn.model.getWeights());
}

function dqnEpsilon() {
    return Math.max(DQN_EPSILON_END, DQN_EPSILON_START - dqn.steps * (DQN_EPSILON_START - DQN_EPSILON_END) / DQN_EPSILON_DECAY);
}

// Valor Q de cada uma das 18 ações para um estado
function dqnQValues(inputs) {
    return tf.tidy(() => dqn.model.predict(tf.tensor2d([inputs])).dataSync());
}

function dqnGreedy(inputs) {
    const q = dqnQValues(inputs);
    let best = 0;
    for (let i = 1; i < q.length; i++) if (q[i] > q[best]) best = i;
    return best;
}

// Um passo de aprendizado: amostra o replay buffer e aproxima Q(s, a) de  r + γ · Q_alvo(s', melhor ação de s')
function dqnLearn() {
    const batch = DQN_BATCH_SIZE;
    const states = new Float32Array(batch * INPUT_COUNT);
    const nextStates = new Float32Array(batch * INPUT_COUNT);
    const actions = new Int32Array(batch);
    const rewards = new Float32Array(batch);
    const notDone = new Float32Array(batch);
    for (let b = 0; b < batch; b++) {
        const i = Math.floor(Math.random() * replay.size);
        states.set(replay.states.subarray(i * INPUT_COUNT, (i + 1) * INPUT_COUNT), b * INPUT_COUNT);
        nextStates.set(replay.nextStates.subarray(i * INPUT_COUNT, (i + 1) * INPUT_COUNT), b * INPUT_COUNT);
        actions[b] = replay.actions[i];
        rewards[b] = replay.rewards[i];
        notDone[b] = replay.notDone[i];
    }

    const count = DQN_ACTIONS.length;
    const loss = tf.tidy(() => {
        const s = tf.tensor2d(states, [batch, INPUT_COUNT]);
        const next = tf.tensor2d(nextStates, [batch, INPUT_COUNT]);
        const a = tf.oneHot(tf.tensor1d(actions, "int32"), count).cast("float32");

        const bestNext = tf.oneHot(dqn.model.predict(next).argMax(1), count).cast("float32");   // Double DQN
        const nextValue = dqn.target.predict(next).mul(bestNext).sum(1);
        const objective = tf.tensor1d(rewards).add(nextValue.mul(tf.tensor1d(notDone)).mul(DQN_GAMMA));

        return dqn.optimizer.minimize(() => {
            const q = dqn.model.predict(s).mul(a).sum(1);
            return tf.losses.huberLoss(objective, q);
        }, true, dqn.model.trainableWeights.map(w => w.val));
    });
    dqn.learnSteps++;
    if (dqn.learnSteps % 10 === 0) dqn.loss = loss.dataSync()[0];   // ler da rede custa; uma amostra a cada 10 basta
    loss.dispose();
}

// ── Episódio: uma fase ──

function dqnStartEpisode() {
    dqn.level = dqn.onlySelectedLevel ? startLevel : 1 + Math.floor(Math.random() * LEVEL_COUNT);
    resetGame(dqn.level);
    dqn.frame = 0;
    dqn.last = null;
    dqn.pending = 0;
    dqn.episodeReturn = 0;
    dqn.prevScore = 0;
    dqn.prevBoss = 0;
    dqn.startLives = lives;
    dqn.bossMaxHp = 0;
    dqn.bossHp = 0;
    lastDeathCause = null;
}

// Progresso contra o chefe, de 0 a 1 (as mesmas constantes do treino por neuroevolução)
function dqnBossProgress() {
    const boss = currentLevel.enemies.find(e => e.isBoss);
    if (boss) {
        if (dqn.bossMaxHp === 0) dqn.bossMaxHp = boss.hp;
        dqn.bossHp = Math.max(0, boss.hp);
    }
    if (currentLevel.levelComplete) return 1;
    if (dqn.bossMaxHp === 0) return 0;
    return BOSS_REACHED + BOSS_DAMAGE_MAX * (1 - Math.min(1, dqn.bossHp / dqn.bossMaxHp));
}

function dqnLevelOver() {
    return lives < dqn.startLives || gameOver || currentLevel.levelComplete || dqn.frame >= DQN_MAX_SECONDS * 60;
}

// A cada DQN_FRAME_SKIP frames: fecha a transição anterior, aprende e escolhe a próxima ação
function dqnDecideStep() {
    const inputs = getInputs(getState());
    if (dqn.last) {
        remember(dqn.last.state, dqn.last.action, dqn.pending, inputs, false);
        dqn.steps++;
        if (replay.size >= DQN_MIN_BUFFER && dqn.steps % DQN_TRAIN_EVERY === 0) dqnLearn();
        if (dqn.steps % DQN_TARGET_SYNC === 0) syncTarget();
    }
    dqn.pending = 0;
    dqn.action = Math.random() < dqnEpsilon() ? Math.floor(Math.random() * DQN_ACTIONS.length) : dqnGreedy(inputs);
    dqn.last = { state: inputs, action: dqn.action };
}

function dqnEndEpisode() {
    const dead = lives < dqn.startLives || gameOver;
    const cleared = currentLevel.levelComplete;
    const end = dead ? (lastDeathCause || "shot") : cleared ? "cleared" : "timeout";
    if (dead) dqn.pending += DQN_REWARD_DEATH;
    if (cleared) dqn.pending += DQN_REWARD_CLEARED;
    dqn.episodeReturn += dqn.pending;
    if (dqn.last) {
        remember(dqn.last.state, dqn.last.action, dqn.pending, null, true);
        dqn.steps++;
    }

    dqn.episodes++;
    dqn.history.push({ ret: dqn.episodeReturn, level: dqn.level, points: playerScore, end });
    if (dqn.history.length > 1000) dqn.history.shift();
    if (dqn.episodes % DQN_AUTOSAVE_EPISODES === 0) saveDqn(true);
    dqnStartEpisode();
}

// Um frame do jogo durante o treino: decide (se for a hora), age e junta a recompensa
function dqnGameFrame() {
    aiFrame++;
    if (currentLevel.levelComplete) {
        // fase vencida: o jogo leva a nave até a borda; segurar uma seta contra isso trava a animação
        act(RELEASE_ALL);
    }
    else {
        if (dqn.frame % DQN_FRAME_SKIP === 0) dqnDecideStep();
        act(DQN_ACTIONS[dqn.action]);
    }
    dqn.frame++;

    const gain = playerScore - dqn.prevScore;
    dqn.prevScore = playerScore;
    const boss = dqnBossProgress();
    const reward = Math.min(gain, DQN_REWARD_POINTS_CAP) * DQN_REWARD_POINTS
        + (boss - dqn.prevBoss) * DQN_REWARD_BOSS
        + DQN_REWARD_ALIVE;
    dqn.prevBoss = boss;
    dqn.pending += reward;
    dqn.episodeReturn += reward;

    if (dqnLevelOver()) dqnEndEpisode();
}

// Chamado pelo aiLoop a cada frame da tela enquanto o DQN treina: roda vários frames do jogo de uma vez
let lastDqnFrameStart = 0;
function runDqnFrame() {
    const start = performance.now();
    const screenInterval = start - lastDqnFrameStart;
    lastDqnFrameStart = start;
    const budget = Math.min(TURBO_MAX_MS, Math.max(TURBO_MIN_MS, screenInterval * TURBO_SHARE));

    if (dqn.turbo) setDrawing(false);
    try {
        for (let step = 0; ; step++) {
            const done = dqn.turbo ? performance.now() - start >= budget : step >= dqn.speed;
            if (done) break;
            if (step > 0) {
                mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
                bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
                currentLevel.update(FRAME_MS);
            }
            dqnGameFrame();
            countFrame();
        }
    }
    finally {
        if (dqn.turbo) setDrawing(true);
    }
}

// Fora do treino (assistir): sempre a melhor ação (ε = 0), segurada por DQN_FRAME_SKIP frames como no treino
function dqnDecide(state) {
    if (!dqn.model) return RELEASE_ALL;
    if (dqn.watchFrame % DQN_FRAME_SKIP === 0) dqn.watchAction = dqnGreedy(getInputs(state));
    dqn.watchFrame++;
    return DQN_ACTIONS[dqn.watchAction];
}

// ── Controles (usados pelo painel) ──

async function startDqn() {
    if (typeof tf === "undefined") {
        dqn.status = "O TensorFlow.js ainda não carregou.";
        return;
    }
    stopTraining();
    setBrainMode("dqn");
    await ensureDqnModel();
    dqn.active = true;
    dqnStartEpisode();
    dqn.status = "";
}

function stopDqn() {
    dqn.active = false;
}

function resetDqn() {
    stopDqn();
    if (dqn.model) dqn.model.dispose();
    if (dqn.target) dqn.target.dispose();
    if (dqn.optimizer) dqn.optimizer.dispose();
    dqn.model = dqn.target = dqn.optimizer = null;
    dqn.steps = dqn.learnSteps = dqn.episodes = 0;
    dqn.loss = null;
    dqn.history = [];
    dqn.last = null;
    replay.size = replay.next = 0;
    dqn.status = "Rede zerada: o próximo treino começa do zero.";
}

// Assistir: joga sem aprender, sempre com a melhor ação
function watchDqn() {
    if (!dqn.model) {
        dqn.status = "Ainda não há rede. Treine um pouco primeiro.";
        return;
    }
    stopDqn();
    setBrainMode("dqn");
    dqn.watchFrame = 0;
    resetGame();
}

// ── Salvar e carregar (IndexedDB do navegador) ──

async function saveDqn(auto = false) {
    if (!dqn.model) {
        dqn.status = "Treine antes de salvar.";
        return;
    }
    dqn.model.setUserDefinedMetadata({ steps: dqn.steps, episodes: dqn.episodes, history: dqn.history.slice(-300) });
    try {
        await dqn.model.save(DQN_BROWSER_PATH);
        dqn.status = (auto ? "Salvo automaticamente" : "Salvo no navegador") + " (" + dqn.episodes + " episódios).";
    } catch (error) {
        console.error(error);
        dqn.status = "Não foi possível salvar: " + error.message;
    }
}

async function loadDqn() {
    if (typeof tf === "undefined") {
        dqn.status = "O TensorFlow.js ainda não carregou.";
        return;
    }
    let model;
    try {
        model = await tf.loadLayersModel(DQN_BROWSER_PATH);
    } catch (error) {
        dqn.status = /cannot find model/i.test(error.message)
            ? "Nada salvo no navegador ainda."
            : "Não foi possível carregar: " + error.message;
        return;
    }
    if (model.inputs[0].shape[1] !== INPUT_COUNT || model.outputs[0].shape[1] !== DQN_ACTIONS.length) {
        model.dispose();
        dqn.status = "Esse modelo tem outro formato de entradas ou ações. Treine de novo.";
        return;
    }
    stopDqn();
    await ensureDqnModel();
    dqn.model.dispose();
    dqn.model = model;
    syncTarget();
    dqn.optimizer.dispose();
    dqn.optimizer = tf.train.adam(DQN_LEARNING_RATE);   // o estado do Adam não é salvo: recomeça
    const saved = model.getUserDefinedMetadata() || {};
    dqn.steps = saved.steps || 0;
    dqn.episodes = saved.episodes || 0;
    dqn.history = saved.history || [];
    replay.size = replay.next = 0;   // o replay buffer não é salvo: junta de novo antes de voltar a aprender
    dqn.status = "Carregado (" + dqn.episodes + " episódios, ε = " + dqnEpsilon().toFixed(2) + ").";
}
