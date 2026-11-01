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

// 🧠 Quem controla a nave: "human" = você no teclado, "rules" = brain-rules.js, "nn" = brain-nn.js
let brainMode = "nn";
let network = createNetwork();   // rede atual: aleatória no início, depois vem do treino

const RELEASE_ALL = { up: false, down: false, left: false, right: false, fire: false, special: false };

function setBrainMode(mode) {
    brainMode = mode;
    if (mode !== "nn") stopTraining();               // só a rede neural treina
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
    const action = brainMode === "nn" ? nnDecide(state, network) : decide(state);
    act(action);
    return action;   // o treino usa para contar quanto cada tecla é apertada
}

// 🔁 Loop: a cada frame da tela, um passo (jogo normal) ou vários (treino acelerado)
function aiLoop() {
    if (brainMode !== "human" && !isMainScreen && !gameOver && !gamePause) {
        if (training.active) runTrainingFrame();
        else aiStep();
    }
    requestAnimationFrame(aiLoop);
}
aiLoop();

// Fase 0: só observar
// setInterval(() => {
//     if (isMainScreen || gameOver) return;   // não há fase rodando
//
//     const state = getState();
//
//     console.table(state.enemyProjectiles);
// }, 500);
