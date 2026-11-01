// Cérebro de regras (Fase 1) — serve de régua para comparar com a rede neural

const DANGER_DIST = 250;   // a partir de quantos pixels eu começo a me preocupar

function decide(state) {
    const action = {
        up: false,
        down: false,
        left: false,
        right: false,
        fire: true
    };

    const player = state.player;

    const threats = state.enemies.filter(threat => isThreat(player, threat));

    if (threats.length > 0) {
        // pega a ameaça mais próxima
        const closest = threats.reduce((a, b) => (a.x < b.x ? a : b));

        const threatCenter = closest.y + closest.height / 2;
        const playerCenter = player.y + player.height / 2;

        if (threatCenter < playerCenter)
            action.up = true;
        else
            action.down = true;
    }

    return action;
}

function isThreat(player, threat) {
    // 1. Vertical: os intervalos [topo, base] se sobrepõem?
    const sameRow =
        threat.y < player.y + player.height &&     // topo da ameaça acima da base da nave
        threat.y + threat.height > player.y;       // base da ameaça abaixo do topo da nave

    // 2. Horizontal: a ameaça está à minha frente e perto?
    const distance = threat.x - (player.x + player.width);   // da ponta da nave até a ameaça
    const ahead = threat.x + threat.width > player.x;        // ainda não passou por mim
    const close = distance < DANGER_DIST;

    return sameRow && ahead && close;
}
