#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
README = ROOT / 'README.md'
PROGRESS = ROOT / 'nalog docs' / 'Прогресс'


def require_contains(text: str, needle: str, label: str):
    if needle not in text:
        raise AssertionError(f'{label}: expected to find {needle!r}')


def require_absent(text: str, needle: str, label: str):
    if needle in text:
        raise AssertionError(f'{label}: unexpected legacy wording {needle!r}')


def main():
    readme = README.read_text(encoding='utf-8')
    progress = PROGRESS.read_text(encoding='utf-8')

    # README should describe the current product, not the old active KS-3 / multi-sheet model.
    require_contains(readme, 'production-full **single-sheet** веб-форма', 'README.md')
    require_contains(readme, 'КС-3 выведен из активного пользовательского сценария', 'README.md')
    require_contains(readme, 'связанный комплект **`P + Z`**', 'README.md')
    require_absent(readme, 'production-full веб-форма по КС-2 / КС-3 / удержаниям', 'README.md')

    # Progress doc should reflect one current KS-2 sheet as the active UX.
    require_contains(progress, 'удобную **single-sheet** веб-форму', 'nalog docs/Прогресс')
    require_contains(progress, 'одного текущего листа КС-2', 'nalog docs/Прогресс')
    require_contains(progress, 'КС-3 и multi-sheet логику только как legacy-совместимость', 'nalog docs/Прогресс')
    require_contains(progress, 'один текущий лист КС-2', 'nalog docs/Прогресс')
    require_contains(progress, 'КС-3 и multi-sheet данные больше не являются активным UX-сценарием', 'nalog docs/Прогресс')
    require_absent(progress, 'вводить и редактировать данные КС-2 / КС-3 / удержаний', 'nalog docs/Прогресс')
    require_absent(progress, 'несколько листов КС-2;', 'nalog docs/Прогресс')
    require_absent(progress, 'вкладка КС-3;', 'nalog docs/Прогресс')

    print('OK: single-sheet docs contract regression passed')


if __name__ == '__main__':
    main()
