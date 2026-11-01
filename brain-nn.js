// Cérebro neural (Fase 2): estado → getInputs() → rede neural → ação

// ── Entradas: transforma o estado numa lista fixa de números entre 0 e 1 ──

const PLAY_TOP = 50;   // acima disso fica o placar (limite em game.js, Player.update)
const PLAY_LEFT = 0;
const MAX_SHOT_WIDTH = 50;     // o tiro mais largo é o EnemyMissile (o Projectile tem 20)
const MAX_ENEMY_WIDTH = 380;   // o maior inimigo é o Boss8 (os comuns têm até 100)
const TERRAIN_LOOKAHEAD = 150;   // quanto à frente da nave o terreno já conta (px)
const TERRAIN_RANGE = 150;       // espaço livre a partir do qual tanto faz: 1 = 150 px ou mais
const DANGER_HORIZON = 60;   // frames à frente em que um impacto já conta como perigo (60 = 1 s)
const DANGER_MARGIN = 20;    // folga vertical (px) em volta do objeto: a nave também se mexe até lá
const MAX_POWERUP_WIDTH = 80;
const INPUT_COUNT = 19;

// (valor − min) / (max − min), preso entre 0 e 1 para nenhum caso inesperado escapar da faixa
function normalize(value, min, max) {
    return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

// Mesma receita para tiros e inimigos: [existe?, distância, altura relativa] do objeto mais próximo à frente
function describeNearest(objects, player, maxObjectWidth) {
    const ahead = objects.filter(obj => obj.x + obj.width >= player.x && obj.x < mainCanvas.width);

    if (ahead.length === 0) {
        // não existe: "longe" e "alinhado" são só preenchimento, a primeira posição avisa a rede para ignorar
        return [0, 1, 0.5];
    }

    const nearest = ahead.reduce((a, b) => (a.x < b.x ? a : b));

    // maior distância: nave na borda esquerda, objeto na borda direita (840 − 100 = 740)
    const maxDistanceX = mainCanvas.width - player.width;
    // menor distância: o objeto mais largo quase saindo pela traseira da nave
    const minDistanceX = -(maxObjectWidth + player.width);
    const distance = nearest.x - (player.x + player.width);

    // maior diferença vertical: objeto no chão da tela, nave no topo (480 − 85 = 395)
    const maxVerticalGap = mainCanvas.height - (PLAY_TOP + player.height / 2);
    const verticalGap = (nearest.y + nearest.height / 2) - (player.y + player.height / 2);

    return [
        1,
        normalize(distance, minDistanceX, maxDistanceX),           // 0 = colado, 1 = longe
        normalize(verticalGap, -maxVerticalGap, maxVerticalGap),   // 0 = bem acima, 0,5 = alinhado, 1 = bem abaixo
    ];
}

// Perigo iminente: de todos os objetos, qual vai acertar a nave mais cedo se ela ficar parada?
// Projeta cada um em linha reta (vx, vy por frame) até a frente da nave e vê se a altura dele, com folga, cruza a hitbox.
// Devolve [perigo, altura relativa]: perigo 0 = nada vem na direção da nave, 1 = impacto agora;
// altura 0 = bem acima, 0,5 = alinhado, 1 = bem abaixo (diz para que lado desviar).
// Inimigos não informam vy, então valem como se andassem em linha reta; a folga cobre parte do erro.
function describeDanger(objects, player) {
    const hitTop = player.hitbox.y;
    const hitBottom = player.hitbox.y + player.hitbox.height;
    const front = player.x + player.width;

    let bestTime = Infinity;
    let bestY = 0;
    objects.forEach(obj => {
        if (obj.x + obj.width < player.x || obj.x >= mainCanvas.width) return;   // já passou ou ainda nem entrou na tela
        const closing = -obj.vx;   // px por frame em direção à nave
        const distance = obj.x - front;
        let time = 0;
        if (distance > 0) {
            if (closing <= 0) return;   // está longe e não se aproxima
            time = distance / closing;
        }
        if (time > DANGER_HORIZON) return;

        const top = obj.y + (obj.vy || 0) * time - DANGER_MARGIN;
        const bottom = obj.y + (obj.vy || 0) * time + obj.height + DANGER_MARGIN;
        if (bottom < hitTop || top > hitBottom) return;   // passa por cima ou por baixo

        if (time < bestTime) {
            bestTime = time;
            bestY = (top + bottom) / 2;
        }
    });

    if (bestTime === Infinity) return [0, 0.5];
    const maxVerticalGap = mainCanvas.height - (PLAY_TOP + player.height / 2);
    const gap = bestY - (player.y + player.height / 2);
    return [1 - bestTime / DANGER_HORIZON, normalize(gap, -maxVerticalGap, maxVerticalGap)];
}

// Item coletável mais próximo à frente: [existe?, distância, altura relativa, é vida?]
function describeCollectible(powerups, player) {
    const nearest = nearestAhead(powerups, player);
    return [...describeNearest(powerups, player, MAX_POWERUP_WIDTH), nearest && nearest.powerup === "life" ? 1 : 0];
}

function nearestAhead(objects, player) {
    const ahead = objects.filter(obj => obj.x + obj.width >= player.x && obj.x < mainCanvas.width);
    return ahead.length === 0 ? null : ahead.reduce((a, b) => (a.x < b.x ? a : b));
}

// Espaço livre acima e abaixo da nave, olhando a faixa que ela ocupa e um pouco à frente.
// Um bloco cujo centro fica acima do centro da nave é teto; abaixo, é chão (um pilar à frente também conta como chão).
// Sem terreno, os limites são as bordas da área de jogo.
function describeTerrain(terrain, player) {
    const left = player.x;
    const right = player.x + player.width + TERRAIN_LOOKAHEAD;
    const top = player.hitbox.y;
    const bottom = player.hitbox.y + player.hitbox.height;
    const center = (top + bottom) / 2;

    let ceiling = PLAY_TOP;
    let floor = mainCanvas.height;
    terrain.forEach(block => {
        if (block.x + block.width < left || block.x > right) return;   // fora da faixa
        if (block.y + block.height / 2 < center) ceiling = Math.max(ceiling, block.y + block.height);
        else floor = Math.min(floor, block.y);
    });

    return [
        normalize(top - ceiling, 0, TERRAIN_RANGE),    // 0 = encostando no teto, 1 = bastante espaço
        normalize(floor - bottom, 0, TERRAIN_RANGE),   // 0 = encostando no chão, 1 = bastante espaço
    ];
}

function getInputs(state) {
    const player = state.player;

    const playBottom = mainCanvas.height - player.height;   // maior y: base da nave encostada no chão
    const playRight = mainCanvas.width - player.width;      // maior x: ponta da nave encostada na borda direita

    const hostiles = state.enemies.filter(e => !e.isPowerUp);   // item coletável não machuca: sensor próprio
    const powerups = state.enemies.filter(e => e.isPowerUp);

    return [
        normalize(player.y, PLAY_TOP, playBottom),   // 0: altura da nave (0 = topo, 1 = base)
        normalize(player.x, PLAY_LEFT, playRight),   // 1: posição horizontal (0 = esquerda, 1 = direita)
        ...describeNearest(state.enemyProjectiles, player, MAX_SHOT_WIDTH),   // 2, 3, 4: tiro mais próximo
        ...describeNearest(hostiles, player, MAX_ENEMY_WIDTH),                // 5, 6, 7: inimigo mais próximo
        state.specialCount > 0 ? 1 : 0,                                       // 8: ainda tem arma especial?
        ...describeTerrain(state.terrain, player),                            // 9, 10: espaço livre acima e abaixo
        ...describeCollectible(powerups, player),                             // 11, 12, 13, 14: item mais próximo (existe, dist., altura, é vida?)
        ...describeDanger(state.enemyProjectiles, player),                    // 15, 16: perigo iminente de tiro (urgência, altura)
        ...describeDanger(hostiles, player),                                  // 17, 18: perigo iminente de inimigo (urgência, altura)
    ];
}

// ── Rede neural: 11 entradas → 6 neurônios escondidos → 6 saídas ──

const DEFAULT_HIDDEN_COUNT = 6;
const MIN_HIDDEN_COUNT = 2;
const MAX_HIDDEN_COUNT = 32;
let HIDDEN_COUNT = DEFAULT_HIDDEN_COUNT;   // ajustável no painel (setHiddenCount, em training.js); salvo junto com o treino
const ACTION_KEYS = ["up", "down", "left", "right", "fire", "special"];   // uma saída para cada tecla
const OUTPUT_COUNT = ACTION_KEYS.length;
let pressThreshold = 0.5;   // saída acima disso = tecla apertada (ajustável no painel)

// Peso de cada tecla: um empurrão fixo somado à saída antes da sigmoide, igual para todas as redes.
// Positivo = a tecla aperta com mais facilidade; negativo = a rede precisa "querer muito" para apertar.
// A evolução continua decidindo QUANDO apertar; o peso só muda o quanto cada tecla é fácil de apertar.
// As redes já treinadas somam valores grandes nas saídas (o especial tem mediana +9), então o peso precisa ser
// do mesmo tamanho para fazer diferença: com −2 o especial quase não mudava; com −8 ele cai de 100% para ~27% dos frames.
// (ajustável no painel; salvo junto com o treino)
const actionWeights = { up: 0, down: 0, left: -3, right: -3, fire: 2, special: -8 };

// Um neurônio: soma de (entrada × peso), mais o bias
function neuron(inputs, weights, bias) {
    let sum = bias;
    for (let i = 0; i < inputs.length; i++) {
        sum += inputs[i] * weights[i];
    }
    return sum;
}

// "Achata" qualquer número para ficar entre 0 e 1 (muito negativo → 0, zero → 0,5, muito positivo → 1)
function sigmoid(x) {
    return 1 / (1 + Math.exp(-x));
}

// Peso aleatório entre −1 e 1: é assim que toda rede nasce, sem saber nada
function randomWeight() {
    return Math.random() * 2 - 1;
}

// Uma camada é uma lista de neurônios; cada um tem um peso por entrada e um bias
function createLayer(inputCount, neuronCount) {
    const layer = [];
    for (let n = 0; n < neuronCount; n++) {
        const weights = [];
        for (let i = 0; i < inputCount; i++) {
            weights.push(randomWeight());
        }
        layer.push({ weights: weights, bias: randomWeight() });
    }
    return layer;
}

function createNetwork() {
    return {
        hidden: createLayer(INPUT_COUNT, HIDDEN_COUNT),   // neurônios × (19 pesos + 1 bias)
        output: createLayer(HIDDEN_COUNT, OUTPUT_COUNT),  // 6 neurônios × (neurônios escondidos + 1 bias)
    };
}

// Passa as entradas por uma camada: cada neurônio vira um número entre 0 e 1
function runLayer(inputs, layer) {
    return layer.map(n => sigmoid(neuron(inputs, n.weights, n.bias)));
}

// A conta completa: entradas → camada escondida → camada de saída (com o peso de cada tecla)
function predict(network, inputs) {
    const hidden = runLayer(inputs, network.hidden);
    return network.output.map((n, i) => sigmoid(neuron(hidden, n.weights, n.bias) + actionWeights[ACTION_KEYS[i]]));
}

// O cérebro neural: mesmo papel do decide() das regras, mas sem nenhum if escrito à mão
function nnDecide(state, network) {
    const outputs = predict(network, getInputs(state));

    const action = {};
    ACTION_KEYS.forEach((key, i) => {
        action[key] = outputs[i] > pressThreshold;
    });
    return action;
}
