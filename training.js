// Treino: cada nave da população joga as 8 fases, ganha uma nota e, no fim da geração, a evolução cria a próxima

const MAX_LEVEL_SECONDS = 150;            // fase mais longa que isso é encerrada (tempo do jogo, não do relógio)
const SURVIVAL_POINTS_PER_SECOND = 0.1;   // só desempate: no começo quase nenhuma nave pontua, e sem isso todas empatam em 0
// 1 = uma partida só, nota com tempo vivo; 2 = soma dos pontos nas 8 fases; 3 = cada fase vale até 1 (pontos ÷ recorde)
const FITNESS_VERSION = 3;
const STORAGE_KEY = "spaceImpactTraining";

const training = {
    active: false,
    speed: 5,            // quantos frames do jogo rodam a cada frame da tela
    turbo: false,        // ligado: roda o máximo de frames que couber, sem desenhar os extras
    generation: 1,
    population: null,    // [{ genome, fitness, points, levelScores, levelEnds }]
    levelRecords: [],    // maior pontuação já vista em cada fase (a régua da nota)
    index: 0,            // qual nave da população está jogando
    level: 1,            // qual fase a nave atual está jogando
    levelScores: [],     // nota da nave atual em cada fase que já terminou
    levelEnds: [],       // como cada fase da nave atual terminou (uma das END_REASONS)
    episodeFrames: 0,    // frames que a nave atual já sobreviveu na fase atual
    startLives: 0,
    bestEver: null,      // { genome, fitness, generation, levelScores }
    // [{ generation, best, average, levelBest, levelAverage, levelEnds, seconds }]; as gerações antigas só têm as 3 primeiras
    history: [],
    lastScores: [],      // nota de cada nave da última geração completa, da maior para a menor
    generationMs: 0,     // tempo real gasto na geração em andamento
    actionFrames: {},    // na geração em andamento: em quantos frames cada tecla ficou apertada
    actionTotal: 0,      // frames contados em actionFrames
};

// ── Como uma fase termina ──
const END_REASONS = ["cleared", "timeout", "terrain", "enemy", "boss", "shot"];

// Descobre o que matou a nave: o game.js só tira a vida, sem dizer por quê.
// Envolvemos o playerDead() de toda fase para, no instante da morte, ver no que a nave estava encostando.
let lastDeathCause = null;
const originalPlayerDead = Level.prototype.playerDead;
Level.prototype.playerDead = function () {
    lastDeathCause = deathCause(this);
    originalPlayerDead.call(this);
};

function deathCause(level) {
    const hitbox = level.player.hitbox;
    if (level.background.some(bg => bg.hitbox.some(block => checkCollision(hitbox, block)))) return "terrain";
    if (level.enemies.some(e => e.isBoss && e.hitbox.some(block => checkCollision(block, hitbox)))) return "boss";
    if (level.enemies.some(e => !e.isBoss && !e.isPowerUp && checkCollision(e, hitbox))) return "enemy";
    return "shot";
}

function levelEndReason() {
    if (lives < training.startLives || gameOver) return lastDeathCause || "shot";
    if (currentLevel.levelComplete) return "cleared";
    return "timeout";
}

// ── Reiniciar a partida ──
// Os inimigos de cada fase são criados uma única vez quando o game.js carrega, e o jogo os altera enquanto roda.
// Por isso o jogo original recarrega a página para jogar de novo. Aqui guardamos uma cópia intacta de todas
// as ondas e entregamos cópias novas a cada partida.

const ENEMY_LEVELS = [enemiesLvl1, enemiesLvl2, enemiesLvl3, enemiesLvl4, enemiesLvl5, enemiesLvl6, enemiesLvl7, enemiesLvl8];

// Cópia profunda que mantém a classe de cada objeto (Meteor continua Meteor, Hitbox continua Hitbox)
function cloneGameObject(value, seen = new Map()) {
    if (value === null || typeof value !== "object") return value;
    if (value instanceof HTMLImageElement) return value;   // imagens são compartilhadas, não precisam de cópia
    if (seen.has(value)) return seen.get(value);

    const copy = Array.isArray(value) ? [] : Object.create(Object.getPrototypeOf(value));
    seen.set(value, copy);
    for (const key of Object.keys(value)) {
        copy[key] = cloneGameObject(value[key], seen);
    }
    return copy;
}

const pristineWaves = ENEMY_LEVELS.map(level => level.map(wave => wave.object.map(obj => cloneGameObject(obj))));

function restoreEnemies() {
    ENEMY_LEVELS.forEach((level, l) => {
        level.forEach((wave, w) => {
            wave.object = pristineWaves[l][w].map(obj => cloneGameObject(obj));
        });
    });
}

// Fase onde cada partida começa (escolhida no painel). Vale para jogar, treinar e assistir a melhor.
let startLevel = 1;
const LEVEL_COUNT = 8;

// as mesmas cores que o game.js usa ao trocar de fase: 1, 5 e 6 têm fundo escuro
function isDarkLevel(number) {
    return number === 1 || number === 5 || number === 6;
}

function resetGame(levelNumber = startLevel) {
    restoreEnemies();
    currentLevel.active = false;   // desliga os ouvintes de teclado da fase antiga
    lives = 4;
    playerScore = 0;
    gameOver = false;
    gamePause = false;
    specialCount = 3;
    specialAtttack = "missile";
    currentLevel = new Level(levelNumber, isDarkLevel(levelNumber));
    if (isMainScreen) gameStart();
}

// No treino a nave sempre passa pelas 8 fases; a fase escolhida vale para jogar e para "Assistir a melhor"
function selectLevel(number) {
    startLevel = number;
    if (!training.active) resetGame();
}

// ── Nota (fitness) ──
// Cada fase começa do zero (4 vidas, 0 pontos), então ir mal numa fase não atrapalha a próxima.
// Somar os pontos crus deixava as fases desiguais: a fase 7 rende ~2.000 e a fase 5 rende ~100, e aprender a fase 5
// sumia no meio da sorte da fase 7. Por isso cada fase vale até 1: pontos da fase ÷ recorde da fase.
// Ir de 0 a 100 numa fase cujo recorde é 100 vale tanto quanto ir de 0 a 2.000 numa fase cujo recorde é 2.000.
// A nota final vai de 0 a 8.

function levelFitness() {
    return playerScore + (training.episodeFrames / 60) * SURVIVAL_POINTS_PER_SECOND;
}

// O recorde nunca fica abaixo disto: numa fase em que ninguém pontua, 10 equivale a 100 segundos vivo.
// Sem esse piso, sobreviver 1 segundo a mais numa fase sem recorde valeria uma fase inteira.
const MIN_LEVEL_RECORD = 10;

function levelReference(level, records) {
    return Math.max(MIN_LEVEL_RECORD, records[level] || 0);
}

function balancedFitness(levelScores, records) {
    return levelScores.reduce((sum, score, level) => sum + Math.min(1, score / levelReference(level, records)), 0);
}

// Nota parcial da nave em jogo, medida pelos recordes de agora (a nota oficial sai no fim da geração)
function currentFitness() {
    return balancedFitness([...training.levelScores, levelFitness()], training.levelRecords);
}

// A fase acaba ao perder a primeira vida, ao matar o chefe ou ao estourar o tempo
function levelOver() {
    return lives < training.startLives
        || gameOver
        || currentLevel.levelComplete
        || training.episodeFrames >= MAX_LEVEL_SECONDS * 60;
}

// ── Ciclo do treino ──

function loadIndividual() {
    network = genomeToNetwork(training.population[training.index].genome);
    training.level = 1;
    training.levelScores = [];
    training.levelEnds = [];
    startLevelRun();
}

function startLevelRun() {
    resetGame(training.level);
    training.episodeFrames = 0;
    training.startLives = lives;
    lastDeathCause = null;
}

function finishLevel() {
    training.levelScores.push(levelFitness());
    training.levelEnds.push(levelEndReason());
    training.level++;
    if (training.level <= LEVEL_COUNT) {
        startLevelRun();
        return;
    }

    // passou pelas 8 fases: a nave ganha a nota final e a próxima entra
    const individual = training.population[training.index];
    individual.levelScores = training.levelScores;
    individual.levelEnds = training.levelEnds;
    individual.points = training.levelScores.reduce((a, b) => a + b, 0);
    training.index++;
    if (training.index >= training.population.length) endGeneration();
    loadIndividual();
}

function endGeneration() {
    const population = training.population;
    const levels = Array.from({ length: LEVEL_COUNT }, (_, l) => l);

    // 1) os recordes sobem com o que esta geração fez; 2) todas as naves são medidas pelos mesmos recordes
    levels.forEach(l => {
        training.levelRecords[l] = Math.max(training.levelRecords[l] || 0, ...population.map(ind => ind.levelScores[l]));
    });
    population.forEach(ind => { ind.fitness = balancedFitness(ind.levelScores, training.levelRecords); });

    const scores = population.map(ind => ind.fitness);
    const best = Math.max(...scores);
    const average = scores.reduce((a, b) => a + b, 0) / scores.length;
    const points = population.map(ind => ind.points);

    // a melhor de todas também é medida de novo pelos recordes de agora, para a comparação ser justa
    if (training.bestEver && training.bestEver.levelScores) {
        training.bestEver.fitness = balancedFitness(training.bestEver.levelScores, training.levelRecords);
    }
    if (training.bestEver === null || best > training.bestEver.fitness) {
        const champion = population.find(ind => ind.fitness === best);
        training.bestEver = {
            genome: [...champion.genome],
            fitness: best,
            points: champion.points,
            generation: training.generation,
            levelScores: champion.levelScores,
        };
    }
    // telemetria: o que aconteceu em cada fase, somando todas as naves da geração
    training.history.push({
        generation: training.generation,
        best: best,
        average: average,
        bestPoints: Math.max(...points),
        averagePoints: points.reduce((a, b) => a + b, 0) / points.length,
        levelBest: levels.map(l => Math.max(...population.map(ind => ind.levelScores[l]))),
        levelAverage: levels.map(l => population.reduce((sum, ind) => sum + ind.levelScores[l], 0) / population.length),
        levelEnds: levels.map(l => countEnds(population.map(ind => ind.levelEnds[l]))),
        seconds: Math.round(training.generationMs / 1000),
    });
    training.lastScores = [...scores].sort((a, b) => b - a);

    training.population = nextGeneration(population);
    training.generation++;
    training.index = 0;
    training.generationMs = 0;
    training.actionFrames = {};
    training.actionTotal = 0;
    saveTraining();
}

// ["terrain", "cleared", "terrain"] → { cleared: 1, timeout: 0, terrain: 2, ... }
function countEnds(reasons) {
    const counts = {};
    END_REASONS.forEach(reason => { counts[reason] = 0; });
    reasons.forEach(reason => { counts[reason]++; });
    return counts;
}

// ── Turbo ──
// Desenhar é o que mais pesa: medido aqui, ~11 mil frames/s desenhando e ~35 mil sem desenhar.
// No turbo, os frames extras rodam sem desenho e o treino usa quase todo o tempo de cada quadro da tela,
// em vez de um número fixo de frames. A tela continua mostrando um frame por quadro, desenhado pelo animate().
// O treino usa 75% do intervalo entre quadros da tela; o resto fica para a tela e o painel.
// A 60 quadros/s isso dá ~12 ms. Se a tela estiver mais lenta, o orçamento cresce junto, até 50 ms,
// para os botões continuarem respondendo.
const TURBO_SHARE = 0.75;
const TURBO_MIN_MS = 12;
const TURBO_MAX_MS = 50;
let lastTrainingFrameStart = 0;
const DRAW_METHODS = ["arc", "beginPath", "clearRect", "closePath", "drawImage", "fill", "fillRect", "fillText", "restore", "save"];
const doNothing = () => {};

function setDrawing(enabled) {
    [mainCtx, bgCtx].forEach(ctx => {
        DRAW_METHODS.forEach(method => {
            // um método próprio do objeto esconde o do protótipo; apagá-lo devolve o desenho original
            if (enabled) delete ctx[method];
            else ctx[method] = doNothing;
        });
    });
}

// frames do jogo por segundo, para o painel mostrar quanto o treino está rendendo
let framesThisSecond = 0;
let secondStart = performance.now();
let trainingFramesPerSecond = 0;

function countFrame() {
    framesThisSecond++;
    const now = performance.now();
    if (now - secondStart >= 1000) {
        trainingFramesPerSecond = Math.round(framesThisSecond * 1000 / (now - secondStart));
        framesThisSecond = 0;
        secondStart = now;
    }
}

function countActions(action) {
    ACTION_KEYS.forEach(key => {
        if (action[key]) training.actionFrames[key] = (training.actionFrames[key] || 0) + 1;
    });
    training.actionTotal++;
}

// Chamado pelo aiLoop a cada frame da tela enquanto treina: roda vários frames do jogo de uma vez
function runTrainingFrame() {
    const start = performance.now();
    const screenInterval = start - lastTrainingFrameStart;
    lastTrainingFrameStart = start;
    const budget = Math.min(TURBO_MAX_MS, Math.max(TURBO_MIN_MS, screenInterval * TURBO_SHARE));
    // tempo real da geração; o teto ignora as pausas (treino parado, aba escondida)
    training.generationMs += Math.min(screenInterval, 100);

    if (training.turbo) setDrawing(false);
    try {
        for (let step = 0; ; step++) {
            const done = training.turbo ? performance.now() - start >= budget : step >= training.speed;
            if (done) break;
            if (step > 0) {
                // o animate() do game.js já rodou um frame; os extras rodamos aqui
                mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
                bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
                currentLevel.update(FRAME_MS);
            }
            countActions(aiStep());
            training.episodeFrames++;
            countFrame();
            if (levelOver()) {
                finishLevel();
                if (!training.turbo) break;   // sem turbo, a fase nova aparece na tela antes de continuar
            }
        }
    }
    finally {
        if (training.turbo) setDrawing(true);   // mesmo se der erro, o jogo volta a desenhar
    }
}

// ── Controles (usados pelo painel) ──

async function startTraining() {
    await trainingLoaded;   // espera o treino salvo carregar, para não começar do zero por engano
    if (training.population === null) training.population = createPopulation();
    training.active = true;
    setBrainMode("nn");
    loadIndividual();   // a nave atual recomeça da fase 1, para a nota ser justa
}

function stopTraining() {
    training.active = false;
}

function watchBest() {
    if (training.bestEver === null) return;
    stopTraining();
    network = genomeToNetwork(training.bestEver.genome);
    setBrainMode("nn");
    resetGame();
}

function resetTraining() {
    stopTraining();
    training.generation = 1;
    training.population = null;
    training.index = 0;
    training.level = 1;
    training.levelScores = [];
    training.levelEnds = [];
    training.bestEver = null;
    training.levelRecords = [];
    training.history = [];
    training.lastScores = [];
    training.generationMs = 0;
    training.actionFrames = {};
    training.actionTotal = 0;
    deleteSavedTraining();
}

function exportBest() {
    return training.bestEver === null ? null : JSON.stringify(genomeToNetwork(training.bestEver.genome));
}

// ── Salvar e carregar ──
// O principal é o arquivo training-data/training.json, gravado pelo server.py.
// Se a página não estiver rodando pelo server.py (ex.: GitHub Pages), cai para o localStorage do navegador.

const TRAINING_API = "api/training";
let savedTo = "nada salvo ainda";   // onde foi o último salvamento, para o painel mostrar

function trainingSnapshot() {
    return {
        fitnessVersion: FITNESS_VERSION,
        weightLimit: WEIGHT_LIMIT,
        actionWeights: actionWeights,
        generation: training.generation,
        genomes: training.population.map(ind => ind.genome),
        bestEver: training.bestEver,
        history: training.history,
        lastScores: training.lastScores,
        levelRecords: training.levelRecords,
    };
}

function applySnapshot(saved) {
    training.generation = saved.generation;
    training.population = saved.genomes.map(genome => ({ genome: upgradeGenome(genome), fitness: 0 }));

    if (saved.weightLimit !== WEIGHT_LIMIT) {
        // treino de antes do limite de pesos: reescala todas as redes e, em metade da população,
        // sorteia de novo as saídas travadas. A outra metade fica como estava, para não perder o que funciona.
        training.population.forEach((ind, i) => { ind.genome = repairGenome(ind.genome, i % 2 === 1); });
    }
    training.bestEver = saved.bestEver;
    training.history = saved.history;
    training.lastScores = saved.lastScores || [];
    training.levelRecords = saved.levelRecords || [];
    if (saved.actionWeights) Object.assign(actionWeights, saved.actionWeights);   // as redes treinaram com estes pesos
    if (training.bestEver) training.bestEver.genome = upgradeGenome(training.bestEver.genome);
    if (training.bestEver && saved.weightLimit !== WEIGHT_LIMIT) {
        training.bestEver.genome = repairGenome(training.bestEver.genome, false);
    }

    if (saved.fitnessVersion !== FITNESS_VERSION) {
        // treino da regra antiga: os pesos continuam valendo, mas as notas não se comparam com as novas.
        // Os recordes de cada fase saem do que já foi registrado (melhor nave e telemetria), em pontos crus.
        const pointRecords = [training.bestEver && training.bestEver.levelScores, ...training.history.map(h => h.levelBest)]
            .filter(Boolean);
        training.levelRecords = Array.from({ length: LEVEL_COUNT }, (_, l) => Math.max(0, ...pointRecords.map(r => r[l])));

        // a melhor nave continua para assistir; se a nota dela por fase é conhecida, ela ganha a nota nova
        if (training.bestEver) {
            training.bestEver.fitness = training.bestEver.levelScores
                ? balancedFitness(training.bestEver.levelScores, training.levelRecords)
                : -Infinity;
        }
        training.history = [];
        training.lastScores = [];
    }
}

async function saveTraining() {
    const json = JSON.stringify(trainingSnapshot());
    try {
        const response = await fetch(TRAINING_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: json });
        if (!response.ok) throw new Error("servidor respondeu " + response.status);
        savedTo = "arquivo training-data/training.json";
    } catch (e) {
        try {
            localStorage.setItem(STORAGE_KEY, json);
            savedTo = "localStorage do navegador (rode o server.py para salvar em arquivo)";
        } catch (e2) {
            savedTo = "não foi possível salvar";
            console.warn("Não foi possível salvar o treino:", e, e2);
        }
    }
}

async function loadTraining() {
    try {
        const response = await fetch(TRAINING_API);
        const contentType = response.headers.get("Content-Type") || "";
        if (response.ok && contentType.includes("application/json")) {
            // o server.py está rodando: o arquivo manda, mesmo que ainda não exista (null)
            const saved = await response.json();
            if (saved) {
                applySnapshot(saved);
                savedTo = "arquivo training-data/training.json";
            }
            return;
        }
    } catch (e) { /* sem server.py: tenta o localStorage */ }

    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (saved) {
            applySnapshot(saved);
            savedTo = "localStorage do navegador";
        }
    } catch (e) {
        console.warn("Não foi possível carregar o treino salvo:", e);
    }
}

async function deleteSavedTraining() {
    try { await fetch(TRAINING_API, { method: "DELETE" }); } catch (e) { /* sem server.py, nada a apagar */ }
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* sem armazenamento, nada a apagar */ }
    savedTo = "nada salvo ainda";
}

const trainingLoaded = loadTraining();
