// Algoritmo genético: como uma geração de redes vira a próxima

const POPULATION_SIZE = 30;     // quantas naves por geração
const ELITE_COUNT = 2;          // as melhores passam intactas para a próxima geração
const TOURNAMENT_SIZE = 3;      // na seleção, sorteia 3 e fica com a melhor
let mutationRate = 0.1;         // chance de cada peso sofrer mutação (ajustável no painel)
let mutationStrength = 0.5;     // tamanho típico da mutação (ajustável no painel)

// Nenhum peso passa disto. Sem limite, as mutações se acumulam e os pesos crescem sem parar (chegaram a 31).
// Com pesos enormes, cada neurônio fica sempre 100% ligado ou 100% desligado: uma mutação de ±0,5 não muda nada,
// e a evolução trava. Foi assim que a saída "down" morreu (bias −27: a nave nunca mais conseguia descer).
const WEIGHT_LIMIT = 4;

// ── Genoma: a rede "achatada" numa lista única com os 114 números ──

function networkToGenome(net) {
    const genome = [];
    [...net.hidden, ...net.output].forEach(n => {
        genome.push(...n.weights, n.bias);
    });
    return genome;
}

// hiddenCount diferente do atual só serve para converter genomas entre tamanhos (resizeGenome)
function genomeToNetwork(genome, hiddenCount = HIDDEN_COUNT) {
    let position = 0;
    function readLayer(inputCount, neuronCount) {
        const layer = [];
        for (let n = 0; n < neuronCount; n++) {
            const weights = genome.slice(position, position + inputCount);
            position += inputCount;
            layer.push({ weights: weights, bias: genome[position++] });
        }
        return layer;
    }
    return {
        hidden: readLayer(INPUT_COUNT, hiddenCount),
        output: readLayer(hiddenCount, OUTPUT_COUNT),
    };
}

// Muda o número de neurônios escondidos de um genoma.
// Para mais: os neurônios novos nascem aleatórios, mas com peso 0 nas saídas, então a rede continua jogando igual
// e a evolução ajusta os novos. Para menos: os últimos neurônios são cortados, e a rede pode jogar diferente.
function resizeGenome(genome, fromCount, toCount) {
    if (fromCount === toCount) return genome;
    const net = genomeToNetwork(genome, fromCount);
    if (toCount > fromCount) {
        const extra = toCount - fromCount;
        net.hidden.push(...createLayer(INPUT_COUNT, extra));
        net.output.forEach(n => n.weights.push(...new Array(extra).fill(0)));
    } else {
        net.hidden.length = toCount;
        net.output.forEach(n => { n.weights.length = toCount; });
    }
    return networkToGenome(net);
}

function randomGenome() {
    return networkToGenome(createNetwork());
}

// ── Genoma antigo → novo ──
// A rede foi crescendo: entradas e saídas novas sempre entram no fim da lista. Para não perder o que já foi aprendido:
//   - cada neurônio escondido ganha peso 0 para cada entrada nova: ele continua calculando exatamente o mesmo
//   - a camada de saída ganha neurônios novos, aleatórios, que a evolução vai ajustar
const LEGACY_SHAPES = [
    { inputs: 8, outputs: 5 },   // 89 números: a primeira versão
    { inputs: 9, outputs: 6 },   // 102 números: + "tem especial?" e a saída "special"
    { inputs: 11, outputs: 6 },  // 114 números: + espaço livre acima e abaixo (terreno)
];

function genomeLength(inputs, outputs) {
    return HIDDEN_COUNT * (inputs + 1) + outputs * (HIDDEN_COUNT + 1);
}

function upgradeGenome(genome) {
    const shape = LEGACY_SHAPES.find(s => genomeLength(s.inputs, s.outputs) === genome.length);
    if (!shape) return genome;   // já está no formato atual

    const upgraded = [];
    let position = 0;
    for (let n = 0; n < HIDDEN_COUNT; n++) {
        const weights = genome.slice(position, position + shape.inputs);
        const bias = genome[position + shape.inputs];
        const newWeights = new Array(INPUT_COUNT - shape.inputs).fill(0);
        upgraded.push(...weights, ...newWeights, bias);
        position += shape.inputs + 1;
    }
    upgraded.push(...genome.slice(position));   // as saídas antigas, sem mudança

    createLayer(HIDDEN_COUNT, OUTPUT_COUNT - shape.outputs).forEach(n => upgraded.push(...n.weights, n.bias));
    return upgraded;
}

// ── Operadores genéticos ──

// Número aleatório com distribuição normal (Box-Muller): quase sempre perto de 0, às vezes longe
function randomGaussian() {
    const u = 1 - Math.random();
    const v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Seleção por torneio: sorteia alguns indivíduos e devolve o de maior nota
function tournament(population) {
    let best = null;
    for (let i = 0; i < TOURNAMENT_SIZE; i++) {
        const candidate = population[Math.floor(Math.random() * population.length)];
        if (best === null || candidate.fitness > best.fitness) best = candidate;
    }
    return best;
}

// Cruzamento uniforme: cada peso do filho vem do pai A ou do pai B, como numa moeda
function crossover(genomeA, genomeB) {
    return genomeA.map((gene, i) => (Math.random() < 0.5 ? gene : genomeB[i]));
}

// Mutação: alguns pesos levam um empurrão aleatório (sem passar do limite)
function mutate(genome) {
    return genome.map(gene => (Math.random() < mutationRate ? clampWeight(gene + randomGaussian() * mutationStrength) : gene));
}

function clampWeight(value) {
    return Math.max(-WEIGHT_LIMIT, Math.min(WEIGHT_LIMIT, value));
}

// ── Consertar uma rede saturada (treinos feitos antes do limite) ──

// Divide os pesos e o bias de um neurônio pelo mesmo número positivo até caberem no limite.
// O sinal da soma não muda, então o neurônio continua "decidindo" igual; só fica menos radical.
function rescaleNeuron(neuron) {
    const largest = Math.max(Math.abs(neuron.bias), ...neuron.weights.map(Math.abs));
    if (largest <= WEIGHT_LIMIT) return;
    const factor = WEIGHT_LIMIT / largest;
    neuron.weights = neuron.weights.map(w => w * factor);
    neuron.bias *= factor;
}

// Um neurônio travado nunca muda de estado, qualquer que seja a entrada (as entradas vão de 0 a 1):
// travado desligado se nem somando todos os pesos positivos ele passa de 0; travado ligado se nem os negativos o derrubam
function isStuck(neuron) {
    const highest = neuron.bias + neuron.weights.reduce((sum, w) => sum + Math.max(w, 0), 0);
    const lowest = neuron.bias + neuron.weights.reduce((sum, w) => sum + Math.min(w, 0), 0);
    return highest < 0 || lowest > 0;
}

// reviveStuck: sorteia de novo as saídas travadas (ex.: "down" que nunca aperta), para a evolução poder testá-las
function repairGenome(genome, reviveStuck) {
    const net = genomeToNetwork(genome);
    [...net.hidden, ...net.output].forEach(rescaleNeuron);
    if (reviveStuck) {
        net.output = net.output.map(neuron => (isStuck(neuron) ? createLayer(HIDDEN_COUNT, 1)[0] : neuron));
    }
    return networkToGenome(net);
}

// ── Gerações ──

function createPopulation() {
    const population = [];
    for (let i = 0; i < POPULATION_SIZE; i++) {
        population.push({ genome: randomGenome(), fitness: 0 });
    }
    return population;
}

// Recebe a geração já avaliada (com fitness) e devolve a próxima, ainda sem nota
function nextGeneration(population) {
    const ranked = [...population].sort((a, b) => b.fitness - a.fitness);
    const next = [];

    // elitismo: as melhores sobrevivem sem mudança, para a evolução nunca andar para trás
    for (let i = 0; i < ELITE_COUNT; i++) {
        next.push({ genome: [...ranked[i].genome], fitness: 0 });
    }

    // o resto nasce de dois pais escolhidos por torneio, com cruzamento e mutação
    while (next.length < POPULATION_SIZE) {
        const parentA = tournament(ranked);
        const parentB = tournament(ranked);
        const child = mutate(crossover(parentA.genome, parentB.genome));
        next.push({ genome: Math.random() < REVIVE_CHANCE ? reviveVerticalOutputs(child) : child, fitness: 0 });
    }

    return next;
}

// Cima e baixo travados fazem a nave só subir (ou só descer): o `down` voltava a morrer no limite dos pesos (bias −4,
// soma máxima < 0) e, como o conserto só rodava ao carregar o treino, nenhuma geração conseguia testá-lo de novo.
// Aqui, parte dos filhos de cada geração ganha um `up`/`down` sorteado de novo se o atual estiver travado.
const REVIVE_CHANCE = 0.3;
const VERTICAL_OUTPUTS = [0, 1];   // posições de "up" e "down" em ACTION_KEYS

function reviveVerticalOutputs(genome) {
    const net = genomeToNetwork(genome);
    VERTICAL_OUTPUTS.forEach(i => {
        if (isStuck(net.output[i])) net.output[i] = createLayer(HIDDEN_COUNT, 1)[0];
    });
    return networkToGenome(net);
}
