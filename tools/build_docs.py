"""Gera docs/documentacao.html a partir dos arquivos docs/*.md.

Cada .md vira um <script type="text/markdown"> dentro da página; no navegador, o marked.js converte para HTML,
monta o sumário e corrige os links entre documentos. Assim a página fica sempre igual aos .md.

Uso (na raiz do projeto):  python tools/build_docs.py
"""

import html
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS_DIR = ROOT / "docs"
TEMPLATE = Path(__file__).resolve().parent / "docs-template.html"
OUTPUT = DOCS_DIR / "documentacao.html"

# o template não tem <html>/<head>: estas partes completam a página para abrir direto no navegador
PAGE_START = """<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>body { margin: 0; } [hidden] { display: none !important; }</style>
"""
PAGE_END = "\n</body>\n</html>\n"


def main():
    order = ["README.md"] + sorted(p.name for p in DOCS_DIR.glob("[0-9][0-9]-*.md")) + ["glossario.md"]

    blocks = []
    for name in order:
        text = (DOCS_DIR / name).read_text(encoding="utf-8")
        key = "inicio" if name == "README.md" else Path(name).stem
        # um </script> dentro do texto fecharia a tag antes da hora; a página desfaz a troca ao ler
        text = text.replace("</script", "<\\/script")
        blocks.append(f'<script type="text/markdown" data-key="{key}" data-file="{html.escape(name)}">\n{text}\n</script>')

    body = TEMPLATE.read_text(encoding="utf-8").replace("<!--DOCS-->", "\n".join(blocks))
    # o <title> e os <link>/<style> do template vão para o <head>; o resto vai para o <body>
    head_end = body.index("</style>") + len("</style>")
    page = PAGE_START + body[:head_end] + "\n</head>\n<body>\n" + body[head_end:] + PAGE_END

    OUTPUT.write_text(page, encoding="utf-8")
    print(f"{len(order)} documentos -> {OUTPUT.relative_to(ROOT)} ({len(page):,} caracteres)")


if __name__ == "__main__":
    main()
