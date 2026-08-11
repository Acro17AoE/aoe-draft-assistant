"""Download AoE2 civ icons from aoe2cm.net into frontend/public/civs/."""

from __future__ import annotations

import urllib.error
import urllib.request
from pathlib import Path

CIVS = [
    'Armenians', 'Aztecs', 'Bengalis', 'Berbers', 'Bohemians', 'Britons', 'Bulgarians',
    'Burgundians', 'Burmese', 'Byzantines', 'Celts', 'Chinese', 'Cumans', 'Dravidians',
    'Ethiopians', 'Franks', 'Georgians', 'Goths', 'Gurjaras', 'Hindustanis', 'Huns',
    'Incas', 'Italians', 'Japanese', 'Jurchens', 'Khmer', 'Khitans', 'Koreans',
    'Lithuanians', 'Magyars', 'Malay', 'Malians', 'Mapuche', 'Mayans', 'Mongols',
    'Muisca', 'Persians', 'Poles', 'Portuguese', 'Romans', 'Saracens', 'Shu',
    'Sicilians', 'Slavs', 'Spanish', 'Tatars', 'Teutons', 'Tupi', 'Turks',
    'Vietnamese', 'Vikings', 'Wei', 'Wu',
]

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / 'public' / 'civs'
SOURCE = 'https://aoe2cm.net/images/civs/{slug}.png'


def slug(name: str) -> str:
    return name.lower().replace(' ', '')


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ok = 0
    failed: list[str] = []

    for civ in CIVS:
        target = OUT_DIR / f'{slug(civ)}.png'
        url = SOURCE.format(slug=slug(civ))
        request = urllib.request.Request(url, headers={'User-Agent': 'AoE-Draft-Assistant/1.0'})
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                data = response.read()
            if len(data) < 500:
                failed.append(civ)
                continue
            target.write_bytes(data)
            ok += 1
            print(f'OK  {civ}')
        except urllib.error.HTTPError:
            failed.append(civ)
            print(f'FAIL {civ}')

    print(f'\nDownloaded {ok}/{len(CIVS)} icons to {OUT_DIR}')
    if failed:
        raise SystemExit(f'Missing icons: {", ".join(failed)}')


if __name__ == '__main__':
    main()
