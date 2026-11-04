// Botão "Reiniciar": recomeça a partida na fase escolhida sem recarregar a página.
// O game.js não é alterado: usa o resetGame do training.js e só arruma os botões que o game.js mexe.

const restartButton = document.getElementById("restart-button");

function restartGame() {
    if (training.active) return;   // durante o treino quem reinicia as partidas é o próprio treino

    resetGame();   // 4 vidas, 0 pontos, fase escolhida no painel (também tira o pause)

    // o game.js esconde o Pause e mostra o Exit no fim de jogo; volta ao normal
    pauseButton.textContent = "Pause";
    pauseButton.style.visibility = "visible";
    exitButton.style.display = "none";
    restartButton.blur();   // tira o foco para a barra de espaço não "clicar" no botão de novo
}

// Só aparece durante a partida (no fim de jogo quem reinicia é o botão grande), e fica desligado enquanto o treino roda
function refreshRestartButton() {
    restartButton.style.visibility = isMainScreen || gameOver ? "hidden" : "visible";
    restartButton.disabled = training.active;
}

restartButton.addEventListener("click", restartGame);

// O botão "Exit" do fim de jogo virou "Reiniciar". O game.js recarrega a página no clique dele;
// este ouvinte pega o clique antes (fase de captura, no #game) e não deixa chegar até lá.
document.getElementById("game").addEventListener("click", event => {
    if (event.target !== exitButton) return;
    event.stopPropagation();
    restartGame();
}, true);
setInterval(refreshRestartButton, 100);
refreshRestartButton();
