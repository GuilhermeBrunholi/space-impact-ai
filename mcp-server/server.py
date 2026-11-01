"""Servidor MCP do Space Impact: deixa o Claude jogar o jogo.

O jogo roda num navegador sem janela (Playwright) e este servidor chama as funções do próprio jogo
(getState, act, currentLevel.update). O tempo é controlado: o jogo só avança quando uma ferramenta pede,
um frame de cada vez (1 frame = 1/60 s de jogo), igual ao treino acelerado.

Uso: o Claude Code lê o .mcp.json da raiz e sobe este arquivo sozinho (stdio).
"""

import json
import os
import socket
import subprocess
import sys
import time
from contextlib import asynccontextmanager

from mcp.server.fastmcp import FastMCP, Image
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8000
URL = f"http://localhost:{PORT}"
KEYS = ("up", "down", "left", "right", "fire", "special")
MAX_FRAMES = 600   # 10 s de jogo por chamada
# SPACE_IMPACT_HEADED=1 abre uma janela do navegador para você assistir; os frames passam em tempo real (60 fps)
HEADED = os.environ.get("SPACE_IMPACT_HEADED") == "1"

# Roda dentro da página, depois do game.js e do ai.js. Fica em window para as chamadas seguintes.
PAGE_SCRIPT = """
() => {
    // o animate() do game.js e o aiLoop() do ai.js avançariam o jogo sozinhos, em tempo real:
    // o animate vira um loop vazio e o aiLoop não faz nada em modo "human"
    window.animate = () => requestAnimationFrame(window.animate);
    setBrainMode("human");

    // um frame de jogo, igual ao que o treino acelerado faz (training.js, runTrainingFrame)
    window.mcpStep = (action) => {
        aiFrame++;
        if (isMainScreen || gameOver) return;
        act(currentLevel.levelComplete ? RELEASE_ALL : action);   // fase vencida: o jogo leva a nave sozinho
        mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
        bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
        currentLevel.update(FRAME_MS);
        if (gameOver) lives > 0 ? gameWin() : gameLose();
    };

    window.mcpStart = (level) => {
        gamePause = false;
        selectLevel(level);          // resetGame(level): 4 vidas, 0 pontos, 3 especiais
        if (isMainScreen) gameStart();
        act(RELEASE_ALL);
    };

    // o que está na tela e à frente da nave, do mais próximo ao mais longe
    const visible = (o, p) => o.x < mainCanvas.width && o.x + o.width >= p.x;
    const byX = (a, b) => a.x - b.x;
    const round = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "number" ? Math.round(v * 10) / 10 : v]));

    window.mcpSnapshot = () => {
        const s = getState();
        const p = s.player;
        const inputs = getInputs(s).map(v => Math.round(v * 100) / 100);
        return {
            level: currentLevel.number,
            lives, score: playerScore, special: s.specialCount, specialType: s.specialType,
            gameOver, levelComplete: currentLevel.levelComplete, frame: aiFrame,
            player: round({ x: p.x, y: p.y, width: p.width, height: p.height, hitboxTop: p.hitbox.y,hitboxHeight: p.hitbox.height }),
            enemies: s.enemies.filter(e => visible(e, p)).sort(byX).map(round),
            enemyProjectiles: s.enemyProjectiles.filter(e => visible(e, p)).sort(byX).map(round),
            terrain: s.terrain.filter(t => visible(t, p)).sort(byX).map(round),
            sensors: inputs,
        };
    };

    // segura as teclas por N frames; para antes se perder vida, mudar de fase ou acabar o jogo
    // paced = true (janela visível): espera o redesenho entre os frames, para dar para acompanhar a 60 fps
    window.mcpPlay = async (action, frames, stopOnEvent, paced) => {
        const startLives = lives, startLevel = currentLevel.number, startScore = playerScore;
        let ran = 0, stoppedBy = null;
        while (ran < frames) {
            if (paced) await new Promise(requestAnimationFrame);
            window.mcpStep(action);
            ran++;
            if (gameOver) { stoppedBy = lives > 0 ? "game_won" : "game_over"; break; }
            if (stopOnEvent && lives < startLives) { stoppedBy = "lost_life"; break; }
            if (stopOnEvent && currentLevel.number !== startLevel) { stoppedBy = "new_level"; break; }
        }
        act(RELEASE_ALL);
        return { ran, stoppedBy, scoreGained: playerScore - startScore, livesLost: startLives - lives };
    };
}
"""

SENSOR_NAMES = [
    "player_y", "player_x", "has_shot", "shot_dist", "shot_dy", "has_enemy", "enemy_dist", "enemy_dy",
    "has_special", "space_above", "space_below",
    "has_item", "item_dist", "item_dy", "item_is_life",
    "shot_danger", "shot_danger_dy", "enemy_danger", "enemy_danger_dy",
]


class Game:
    """Navegador + página do jogo, criados na primeira ferramenta usada."""

    def __init__(self):
        self.playwright = None
        self.browser = None
        self.page = None
        self.http_server = None

    async def ensure(self):
        if self.page is not None:
            return self.page
        self._start_http_server()
        self.playwright = await async_playwright().start()
        # usa o Edge/Chrome já instalado; o Chromium do Playwright só se nenhum dos dois existir
        for channel in ("msedge", "chrome", None):
            try:
                options = {"headless": not HEADED}
                if channel:
                    options["channel"] = channel
                self.browser = await self.playwright.chromium.launch(**options)
                break
            except Exception:
                if channel is None:
                    raise
        # só guarda a página depois de pronta: se algo falhar aqui, a próxima chamada tenta de novo do zero
        page = await self.browser.new_page(viewport={"width": 1100, "height": 700})
        try:
            await page.goto(URL)
            await page.wait_for_function("typeof aiLoop === 'function' && typeof getInputs === 'function'")
            await page.evaluate(PAGE_SCRIPT)
            await page.wait_for_function("typeof window.mcpStart === 'function'", timeout=5000)
        except Exception:
            await page.close()
            raise
        self.page = page
        return self.page

    def _start_http_server(self):
        if _port_open():
            return   # já há um server.py rodando (ex.: aberto pelo VS Code)
        self.http_server = subprocess.Popen(
            [sys.executable, os.path.join(ROOT, "server.py")], cwd=ROOT,
            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        for _ in range(50):
            if _port_open():
                return
            time.sleep(0.1)
        raise RuntimeError("O server.py não subiu na porta 8000.")

    async def close(self):
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()
        if self.http_server:
            self.http_server.terminate()


def _port_open():
    with socket.socket() as s:
        s.settimeout(0.2)
        return s.connect_ex(("127.0.0.1", PORT)) == 0


game = Game()


@asynccontextmanager
async def lifespan(_server):
    try:
        yield
    finally:
        await game.close()


mcp = FastMCP("space-impact", lifespan=lifespan)


async def snapshot(page):
    data = await page.evaluate("() => window.mcpSnapshot()")
    data["sensors"] = dict(zip(SENSOR_NAMES, data["sensors"]))
    return data


@mcp.tool()
async def start_game(level: int = 1) -> str:
    """Começa uma partida nova na fase escolhida (1 a 8): 4 vidas, 0 pontos, 3 armas especiais.

    A nave começa parada e o tempo do jogo só passa quando você chama `play`.
    Devolve o estado inicial. Veja `get_state` para o significado dos campos.
    """
    if not 1 <= level <= 8:
        raise ValueError("A fase vai de 1 a 8.")
    page = await game.ensure()
    await page.evaluate("level => window.mcpStart(level)", level)
    return json.dumps(await snapshot(page), ensure_ascii=False)


@mcp.tool()
async def get_state() -> str:
    """Estado atual do jogo, sem avançar o tempo.

    Coordenadas em pixels numa tela de 840x480; x e y são o canto superior esquerdo. A nave tem 100x70 e só
    colide pela hitbox (hitboxTop/hitboxHeight). Ela se move entre y=50 e y=410 e x=0 e x=740.
    - enemies / enemyProjectiles / terrain: só o que está na tela e à frente da nave, do mais próximo ao mais longe.
      vx negativo = indo para a esquerda. Chefes (até 380x380) também aparecem em enemies.
    - terrain: chão, teto e pilares. Encostar mata, mesmo com escudo.
    - enemies com isPowerUp=true são itens coletáveis (powerup: life, missile, laser ou wall), não machucam: colida com eles.
    - sensors: as 19 entradas (0 a 1) que a rede neural da IA enxerga, para comparar.
    - frame: contador de frames; 60 frames = 1 s de jogo.
    """
    page = await game.ensure()
    return json.dumps(await snapshot(page), ensure_ascii=False)


@mcp.tool()
async def play(keys: list[str], frames: int = 10, stop_on_event: bool = True) -> str:
    """Segura as teclas por `frames` frames de jogo (60 = 1 s) e devolve o estado no fim.

    keys: qualquer combinação de "up", "down", "left", "right", "fire", "special". Lista vazia = soltar tudo.
      A nave anda 3 px/frame na vertical e 2,5 px/frame na horizontal. "up" e "down" juntos se anulam.
      "fire" respeita um intervalo de 200 ms entre tiros e "special" de 1 s (e precisa de munição),
      então segurar a tecla é seguro. O mesmo vale para a IA.
    frames: de 1 a 600. Frames curtos (5 a 15) dão controle fino em tiroteio; longos servem em trechos calmos.
    stop_on_event: para na hora se perder uma vida, mudar de fase ou o jogo acabar. `stoppedBy` diz o motivo.
    """
    unknown = [k for k in keys if k not in KEYS]
    if unknown:
        raise ValueError(f"Teclas desconhecidas: {unknown}. Use: {list(KEYS)}")
    if not 1 <= frames <= MAX_FRAMES:
        raise ValueError(f"frames deve ficar entre 1 e {MAX_FRAMES}.")
    page = await game.ensure()
    action = {k: k in keys for k in KEYS}
    result = await page.evaluate("([a, n, s, p]) => window.mcpPlay(a, n, s, p)", [action, frames, stop_on_event, HEADED])
    result["state"] = await snapshot(page)
    return json.dumps(result, ensure_ascii=False)


@mcp.tool()
async def screenshot() -> Image:
    """Imagem do jogo neste instante (PNG), sem avançar o tempo."""
    page = await game.ensure()
    png = await page.locator("#game").screenshot()
    return Image(data=png, format="png")


if __name__ == "__main__":
    mcp.run()
