"""Build a self-contained HTML file using only Python's standard library."""
import base64
import json
import mimetypes
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def data_uri(path):
    data = path.read_bytes()
    # Some upstream assets use a .png name for GIF bytes.
    mime = 'image/gif' if data[:6] in (b'GIF87a', b'GIF89a') else mimetypes.guess_type(path.name)[0]
    return 'data:' + (mime or 'application/octet-stream') + ';base64,' + base64.b64encode(data).decode('ascii')


def embed_paths(text):
    return re.sub(r'assets/[A-Za-z0-9_-]+\.(?:png|jpg|gif|mp3)', lambda match: data_uri(ROOT / match.group()), text)


def main():
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    css = embed_paths((ROOT / 'style.css').read_text(encoding='utf-8'))
    html = html.replace('<link rel="stylesheet" href="style.css">', '<style>' + css + '</style>')
    audio = {path.stem: data_uri(path) for path in sorted((ROOT / 'assets').glob('*.mp3'))}
    for name in ['assets/chapters.js', 'assets/sprites.js', 'assets/justin-sprites.js', 'assets/pingpong-sprites.js', 'plants.js', 'game.js']:
        code = embed_paths((ROOT / name).read_text(encoding='utf-8'))
        if name == 'assets/sprites.js':
            code += '\nwindow.AUDIO_SOURCES=' + json.dumps(audio) + ';'
        html = html.replace('<script src="' + name + '"></script>', '<script>' + code + '</script>')
    html = embed_paths(html)
    if '<script src=' in html or '<link rel="stylesheet"' in html or re.search(r'(?:src|href)=["\']assets/', html):
        raise RuntimeError('External runtime resources remain in offline HTML.')
    output = ROOT / 'dist/justin-nut.html'
    output.parent.mkdir(exist_ok=True)
    output.write_text(html, encoding='utf-8')
    print(f'Built dist/justin-nut.html ({output.stat().st_size:,} bytes)')


if __name__ == '__main__':
    main()
