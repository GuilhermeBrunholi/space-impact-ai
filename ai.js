// Base da IA: sensores, atuadores e loop. O cérebro fica em brain-*.js

// 👁 Sensores
function getState() {
    const level = currentLevel;   // variável global criada no game.js
    const player = level.player;

    return {
        player: {
            x: player.x,
            y: player.y,
            width: player.width,
            height: player.height,
            hitbox: {   // a área que realmente colide é menor que o desenho da nave
                y: player.hitbox.y,
                height: player.hitbox.height,
            },
        },
        lives: lives,             // global
        score: playerScore,       // global
        specialCount: specialCount,       // global: quantas armas especiais restam
        specialType: specialAtttack,      // global: "missile", "laser" ou "wall"

        enemies: level.enemies.map(enemy => ({
            x: enemy.x,
            y: enemy.y,
            width: enemy.width,
            height: enemy.height,
            vx: -enemy.speedX,
            movement: enemy.movement,
            isPowerUp: !!enemy.isPowerUp,   // item coletável (vive na mesma lista dos inimigos, mas não machuca)
            powerup: enemy.isPowerUp ? enemy.powerup : null,   // "life", "missile", "laser" ou "wall"
        })),

        enemyProjectiles: level.enemyProjectiles.map(shot => {
            if (shot instanceof EnemyMissile) {
                return {
                    x: shot.x,
                    y: shot.y,
                    width: shot.width,
                    height: shot.height,
                    vx: -shot.speedX,
                    vy: shot.speedY,
                    homing: true
                };
            }

            return {
                x: shot.x,
                y: shot.y,
                width: shot.width,
                height: shot.height,
                vx: shot.speed,
                vy: 0,
                homing: false
            };
        }),

        // terreno: chão, teto e pilares das fases 2 a 8. Encostar mata, mesmo com escudo
        terrain: level.background.flatMap(bg => bg.hitbox.map(block => ({
            x: block.x,
            y: block.y,
            width: block.width,
            height: block.height,
        }))),
    };
}

// ✋ Atuadores
// O tempo é contado em frames do jogo, e não no relógio: no treino acelerado, 10 frames passam num piscar de olhos
const FRAME_MS = 1000 / 60;
let fireCooldown = 200;   // ms entre tiros, ritmo de um humano apertando rápido (ajustável no painel)
let specialCooldown = 1000;   // ms entre armas especiais, para a rede não gastar tudo num instante
let aiFrame = 0;
let lastFireFrame = -Infinity;
let lastSpecialFrame = -Infinity;

function act(action) {
    keys.ArrowUp.pressed = action.up;
    keys.ArrowDown.pressed = action.down;
    keys.ArrowLeft.pressed = action.left;
    keys.ArrowRight.pressed = action.right;

    const player = currentLevel.player;
    if (action.fire && !player.delete && (aiFrame - lastFireFrame) * FRAME_MS >= fireCooldown) {
        // o mesmo que o keydown da barra de espaço faz no game.js (InputHandler)
        currentLevel.playerProjectiles.push(new Projectile(true, player));
        lastFireFrame = aiFrame;
    }
    if (action.special && specialCount > 0 && !player.delete && (aiFrame - lastSpecialFrame) * FRAME_MS >= specialCooldown) {
        // o mesmo que o keydown da tecla X faz no game.js (InputHandler)
        currentLevel.playerSpecial.push(createSpecial(currentLevel));
        specialCount--;
        lastSpecialFrame = aiFrame;
    }
}

function createSpecial(level) {
    switch (specialAtttack) {
        case "laser": return new Laser(level);
        case "wall": return new Wall(level);
        default: return new Missile(level);
    }
}

// 🧠 Quem controla a nave: "human" = você no teclado, "rules" = brain-rules.js, "nn" = brain-nn.js,
// "tf" = brain-tf.js (rede TensorFlow que imita as suas partidas gravadas), "dqn" = dqn.js (Deep Q-Learning)
let brainMode = "nn";
let recordingEnabled = false;    // caixa "Gravar partidas": só grava no modo humano e com ela marcada
let network = createNetwork();   // rede atual: aleatória no início, depois vem do treino

const RELEASE_ALL = { up: false, down: false, left: false, right: false, fire: false, special: false };

function setBrainMode(mode) {
    brainMode = mode;
    if (mode !== "nn") stopTraining();               // só a rede neural treina por neuroevolução
    if (mode !== "dqn") stopDqn();                   // e só o modo dqn treina por Q-learning
    if (mode === "human") act(RELEASE_ALL);         // solta as teclas que a IA estava segurando
}

// Um passo da IA: sensores → cérebro → atuadores
function aiStep() {
    aiFrame++;
    // fase vencida: o próprio jogo leva a nave até a borda. Se a IA segurar uma seta contra essa animação,
    // a nave nunca chega lá e a fase seguinte não começa
    if (currentLevel.levelComplete) {
        act(RELEASE_ALL);
        return RELEASE_ALL;
    }
    const state = getState();
    let action;
    if (brainMode === "nn") action = nnDecide(state, network);
    else if (brainMode === "tf") action = tfDecide(state);
    else if (brainMode === "dqn") action = dqnDecide(state);
    else action = decide(state);
    act(action);
    return action;   // o treino usa para contar quanto cada tecla é apertada
}

// 🔁 Loop: a cada frame da tela, um passo (jogo normal) ou vários (treino acelerado)
function aiLoop() {
    const gameRunning = !isMainScreen && !gameOver && !gamePause;

    if (brainMode !== "human" && gameRunning) {
        if (training.active) 
            runTrainingFrame();
        else if (dqn.active)
            runDqnFrame();
        else 
            aiStep();
    }
    else if (brainMode === "human" && gameRunning && recordingEnabled) {
        recordStep();
    }
    requestAnimationFrame(aiLoop);
}
aiLoop();

const recordedFrames = [];   // aqui ficam todos os frames gravados

function recordStep() {
    // 1. se a fase acabou (o jogo está controlando a nave), não grava nada
    if (currentLevel.levelComplete) {
        return;
    }
    // 2. pega o estado do jogo e transforma nos números de entrada (INPUT_COUNT)
    const inputs = getInputs(getState());
    
    // 3. monta a lista das 6 ações, na MESMA ORDEM do ACTION_KEYS:
    //    up, down, left, right, fire, special  (tudo em 0 ou 1)
    const actions = [
        keys.ArrowUp.pressed ? 1 : 0,
        keys.ArrowDown.pressed ? 1 : 0,
        keys.ArrowLeft.pressed ? 1 : 0,
        keys.ArrowRight.pressed ? 1 : 0,
        shotFiredThisFrame ? 1 : 0,
        specialFiredThisFrame ? 1 : 0,
    ];

    // 4. guarda no recordedFrames: { level, inputs, actions }
    recordedFrames.push({ level: currentLevel.number, inputs: inputs, actions });

    // 5. desmarca o tiro e o especial, para não contaminar o próximo frame
    shotFiredThisFrame = 0;
    specialFiredThisFrame = 0;
}

function downloadRecording() {
    // 1. transforma o recordedFrames em texto JSON
    const text = JSON.stringify(recordedFrames);

    // 2. cria um Blob com esse texto, do tipo "application/json"
    const blobJson = new Blob([text], { type: "application/json" });

    // 3. gera um endereço (URL) para esse Blob
    const url = URL.createObjectURL(blobJson);

    // 4. cria um link <a>, coloca o endereço no href,
    //    o nome do arquivo no download, e "clica" nele pelo código
    const link = document.createElement("a");
    link.href = url;
    link.download = `recording-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.json`;
    document.body.appendChild(link);
    link.click();

    // 5. libera o endereço da memória (URL.revokeObjectURL)
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// esvazia a gravação (é const, então zera o tamanho em vez de criar outra lista)
function clearRecording() {
    recordedFrames.length = 0;
}

// Fase 0: só observar
// setInterval(() => {
//     if (isMainScreen || gameOver) return;   // não há fase rodando
//
//     const state = getState();
//
//     console.table(state.enemyProjectiles);
// }, 500);
