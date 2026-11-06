// Encaixa a interface na janela: em telas largas, mas baixas ou estreitas demais para o tamanho "de projeto",
// a página inteira é reduzida (zoom) até tudo caber sem rolar. Telas de celular não são mexidas.
const FIT_DESIGN_WIDTH = 1600;    // largura mínima para jogo + gráficos + painel lado a lado
const FIT_DESIGN_HEIGHT = 1130;   // altura que o painel da IA (a coluna mais alta) precisa
const FIT_DESKTOP_MIN = 1200;     // abaixo disso vale o layout de uma coluna do style.css
const FIT_WIDE_MIN = 1500;       // a partir daqui os gráficos ficam ao lado do jogo, com o painel aberto

function fitScreen() {
    const body = document.body;
    const realWidth = window.innerWidth;
    const realHeight = window.innerHeight;
    const desktop = realWidth >= FIT_DESKTOP_MIN;
    const scale = desktop ? Math.min(1, realWidth / FIT_DESIGN_WIDTH, realHeight / FIT_DESIGN_HEIGHT) : 1;

    // o tamanho que a página "enxerga": a janela dividida pela escala (o layout é calculado nele)
    const width = realWidth / scale;
    body.style.zoom = scale < 1 ? String(scale) : "";
    body.style.height = desktop ? `${realHeight / scale}px` : "";
    body.classList.toggle("desktop", width >= FIT_DESKTOP_MIN);
    body.classList.toggle("wide", width >= FIT_WIDE_MIN);
}

window.addEventListener("resize", fitScreen);
fitScreen();
