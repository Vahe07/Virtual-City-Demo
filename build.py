"""Собирает index.html из папки src.

Запуск: python3 build.py
index.html в корне репозитория — готовый сайт для GitHub Pages. Руками его не правят:
меняют файлы в src/ и запускают сборку заново.
"""
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'src')
# порядок важен: каждый файл пользуется тем, что объявлено в предыдущих
ORDER = ['core.js', 'data.js', 'gen.js', 'geo.js', 'sim.js', 'draw.js', 'game.js', 'ui.js', 'gameui.js', 'boot.js']


def read(name):
    with open(os.path.join(SRC, name), encoding='utf-8') as f:
        return f.read()


def main():
    js = '\n'.join(read(f) for f in ORDER)
    node = shutil.which('node')
    if node:
        tmp = os.path.join(HERE, '.bundle-check.js')
        with open(tmp, 'w', encoding='utf-8') as f:
            f.write(js)
        r = subprocess.run([node, '--check', tmp], capture_output=True, text=True)
        os.remove(tmp)
        if r.returncode:
            print(r.stderr)
            sys.exit('Ошибка синтаксиса в JavaScript: index.html не собран')
    else:
        print('node не найден: проверка синтаксиса пропущена')
    html = read('shell.html').replace('/*CSS*/', read('style.css')).replace('/*JS*/', js)
    with open(os.path.join(HERE, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(html)
    print('index.html собран:', len(html.encode('utf-8')), 'байт')


if __name__ == '__main__':
    main()
