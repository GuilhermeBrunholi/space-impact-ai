"""Clonagem de comportamento: ensina a rede 11-6-6 a imitar o Claude jogando (training-data/claude-demos.json).

Cada demonstração é (as 11 entradas no início do trecho, teclas seguradas, frames). A rede tem a mesma forma e
a mesma conta do brain-nn.js (sigmoide + peso fixo por tecla). Só a biblioteca padrão. Saída: training-data/demo-network.json

Uso:  python tools/clone_demos.py
"""

import json
import math
import os
import random

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "training-data")
KEYS = ["up", "down", "left", "right", "fire", "special"]
INPUTS, HIDDEN = 11, 6
LIMIT = 4.0   # WEIGHT_LIMIT do evolution.js
EPOCHS, RATE = 1500, 0.3
BALANCE = 8   # teclas raras (cima, baixo...) valem mais quando apertadas, senão a rede aprende só a atirar

random.seed(1)
demos = json.load(open(os.path.join(DATA, "claude-demos.json")))
offsets = json.load(open(os.path.join(DATA, "training.json")))["actionWeights"]
off = [offsets[k] for k in KEYS]


def sig(x):
    return 1 / (1 + math.exp(-max(-30, min(30, x))))


w1 = [[random.uniform(-1, 1) for _ in range(INPUTS)] + [random.uniform(-1, 1)] for _ in range(HIDDEN)]
w2 = [[random.uniform(-1, 1) for _ in range(HIDDEN)] + [random.uniform(-1, 1)] for _ in range(len(KEYS))]


def forward(x):
    h = [sig(sum(a * b for a, b in zip(x, n[:-1])) + n[-1]) for n in w1]
    o = [sig(sum(a * b for a, b in zip(h, n[:-1])) + n[-1] + off[i]) for i, n in enumerate(w2)]
    return h, o


data = [(d["sensors"], [1.0 if k in d["keys"] else 0.0 for k in KEYS], min(d["frames"], 60) / 60) for d in demos]

for epoch in range(EPOCHS):
    random.shuffle(data)
    for x, y, wt in data:
        h, o = forward(x)
        dz2 = [(o[i] - y[i]) * wt * (1 + BALANCE * y[i] * (i != KEYS.index("fire"))) for i in range(len(KEYS))]   # cross-entropy com sigmoide: erro = saída − alvo
        dh = [sum(dz2[i] * w2[i][j] for i in range(len(KEYS))) * h[j] * (1 - h[j]) for j in range(HIDDEN)]
        for i, n in enumerate(w2):
            for j in range(HIDDEN):
                n[j] = max(-LIMIT, min(LIMIT, n[j] - RATE * dz2[i] * h[j]))
            n[-1] = max(-LIMIT, min(LIMIT, n[-1] - RATE * dz2[i]))
        for j, n in enumerate(w1):
            for k in range(INPUTS):
                n[k] = max(-LIMIT, min(LIMIT, n[k] - RATE * dh[j] * x[k]))
            n[-1] = max(-LIMIT, min(LIMIT, n[-1] - RATE * dh[j]))

hits = [0] * len(KEYS)
for x, y, _ in data:
    o = forward(x)[1]
    for i in range(len(KEYS)):
        hits[i] += (o[i] > 0.5) == (y[i] > 0.5)
for k, h in zip(KEYS, hits):
    pressed = sum(1 for _, y, _ in data if y[KEYS.index(k)])
    print(f"{k:8s} acerto {h / len(data):.0%}  (apertada em {pressed} de {len(data)} trechos)")

net = {"hidden": [{"weights": n[:-1], "bias": n[-1]} for n in w1], "output": [{"weights": n[:-1], "bias": n[-1]} for n in w2]}
json.dump(net, open(os.path.join(DATA, "demo-network.json"), "w"))
print("salvo em training-data/demo-network.json")
