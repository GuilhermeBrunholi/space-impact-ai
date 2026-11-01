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

# Só esta máquina conversa com o servidor, mas "só localhost" não basta: qualquer página aberta no navegador
# consegue mandar um POST/DELETE para localhost:8000, e um DNS malicioso consegue fazer um site parecer ser
# localhost. Por isso o servidor confere o Host e, nas escritas, a Origin e o tipo do conteúdo.
ALLOWED_HOSTS = {f"localhost:{PORT}", f"127.0.0.1:{PORT}"}
ALLOWED_ORIGINS = {f"http://{host}" for host in ALLOWED_HOSTS}
# o jogo não precisa destes caminhos: ficam fora do que o servidor entrega (.git, .mcp.json, o ambiente Python...)
HIDDEN_FOLDERS = {"mcp-server"}


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

    def is_trusted(self, write=False):
        """Confere o Host (contra DNS rebinding) e, nas escritas, a Origin e o Content-Type (contra outros sites)."""
        if self.headers.get("Host") not in ALLOWED_HOSTS:
            return False
        if not write:
            return True
        origin = self.headers.get("Origin")
        if origin is not None and origin not in ALLOWED_ORIGINS:
            return False
        return self.headers.get("Content-Type", "").split(";")[0].strip() == "application/json" or self.command == "DELETE"

    def is_hidden(self):
        parts = [part for part in self.path.split("?")[0].split("/") if part]
        return any(part.startswith(".") or part in HIDDEN_FOLDERS for part in parts)

    def do_HEAD(self):
        if not self.is_trusted() or self.is_hidden():
            return self.send_json(403, {"error": "Acesso negado."})
        super().do_HEAD()

    def do_GET(self):
        if not self.is_trusted() or self.is_hidden():
            return self.send_json(403, {"error": "Acesso negado."})
        if self.path != API_PATH:
            return super().do_GET()
        if not os.path.exists(TRAINING_FILE):
            return self.send_json(200, None)   # nenhum treino salvo ainda
        with open(TRAINING_FILE, encoding="utf-8") as f:
            self.send_json(200, json.load(f))

    def do_POST(self):
        if not self.is_trusted(write=True):
            return self.send_json(403, {"error": "Acesso negado."})
        if self.path != API_PATH:
            return self.send_json(404, {"error": "Endereço desconhecido."})

        length = int(self.headers.get("Content-Length", 0))
        if length <= 0 or length > MAX_BODY_BYTES:
            return self.send_json(413, {"error": "Treino vazio ou grande demais."})
        try:
            data = json.loads(self.rfile.read(length))
        except json.JSONDecodeError:
            return self.send_json(400, {"error": "O treino enviado não é um JSON válido."})
        if not isinstance(data, dict) or not isinstance(data.get("genomes"), list):
            return self.send_json(400, {"error": "O treino enviado não tem o formato esperado."})

        os.makedirs(DATA_DIR, exist_ok=True)
        write_json(TRAINING_FILE, data)
        if isinstance(data.get("bestEver"), dict):
            write_json(BEST_FILE, data["bestEver"])
        self.send_json(200, {"saved": TRAINING_FILE})

    def do_DELETE(self):
        if not self.is_trusted(write=True):
            return self.send_json(403, {"error": "Acesso negado."})
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
