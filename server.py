"""Servidor local do Space Impact com IA.

Serve os arquivos do jogo e grava o treino em training-data/, para ele não ficar preso no navegador.

Uso:  python server.py        (abre em http://localhost:8000)
"""

import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = 8000
ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(ROOT, "training-data")
TRAINING_FILE = os.path.join(DATA_DIR, "training.json")
BEST_FILE = os.path.join(DATA_DIR, "best-network.json")
API_PATH = "/api/training"
MAX_BODY_BYTES = 5 * 1024 * 1024


class Server(ThreadingHTTPServer):
    # no Windows, reaproveitar o endereço deixaria dois servidores escutarem a mesma porta sem erro
    allow_reuse_address = False


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        # sem cache: ao editar um .js, recarregar a página já pega a versão nova
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path != API_PATH:
            return super().do_GET()
        if not os.path.exists(TRAINING_FILE):
            return self.send_json(200, None)   # nenhum treino salvo ainda
        with open(TRAINING_FILE, encoding="utf-8") as f:
            self.send_json(200, json.load(f))

    def do_POST(self):
        if self.path != API_PATH:
            return self.send_json(404, {"error": "Endereço desconhecido."})

        length = int(self.headers.get("Content-Length", 0))
        if length <= 0 or length > MAX_BODY_BYTES:
            return self.send_json(413, {"error": "Treino vazio ou grande demais."})
        try:
            data = json.loads(self.rfile.read(length))
        except json.JSONDecodeError:
            return self.send_json(400, {"error": "O treino enviado não é um JSON válido."})

        os.makedirs(DATA_DIR, exist_ok=True)
        write_json(TRAINING_FILE, data)
        if data.get("bestEver"):
            write_json(BEST_FILE, data["bestEver"])
        self.send_json(200, {"saved": TRAINING_FILE})

    def do_DELETE(self):
        if self.path != API_PATH:
            return self.send_json(404, {"error": "Endereço desconhecido."})
        for path in (TRAINING_FILE, BEST_FILE):
            if os.path.exists(path):
                os.remove(path)
        self.send_json(200, {"deleted": True})


def write_json(path, data):
    # grava num arquivo temporário e troca no fim, para nunca deixar um arquivo pela metade
    temp = path + ".tmp"
    with open(temp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=1)
    os.replace(temp, path)


if __name__ == "__main__":
    try:
        # só aceita conexões desta máquina
        server = Server(("127.0.0.1", PORT), Handler)
    except OSError:
        # a porta já está em uso: provavelmente o servidor já está rodando de uma execução anterior
        print(f"Space Impact em http://localhost:{PORT}  (o servidor já estava rodando)", flush=True)
        raise SystemExit(0)

    # flush=True: sem ele, o VS Code só veria a mensagem depois, e ficaria esperando o servidor "subir"
    print(f"Space Impact em http://localhost:{PORT}  (treino salvo em {DATA_DIR})", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Servidor encerrado.")
