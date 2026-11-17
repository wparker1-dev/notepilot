#!/usr/bin/env python3
"""Build the public GitHub Pages website from a GitHub Actions secret.

IMPORTANT: The key will be visible to all visitors in the published config.js.
No secret is printed, checked into Git, or written outside the _site build folder.
Use only a disposable, free-tier demonstration key, never a paid key.
"""
import json
import os
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT / '_site'


def build() -> None:
    key = os.environ.get('NOTEPILOT_GEMINI_API_KEY', '').strip()
    if not key:
        raise SystemExit(
            'Missing NOTEPILOT_GEMINI_API_KEY. Add it under repository Settings '
            '-> Secrets and variables -> Actions, then re-run the deploy workflow.'
        )
    if '\n' in key or '\r' in key:
        raise SystemExit('The Gemini key contains an invalid line break.')
    if OUTPUT == ROOT or ROOT in OUTPUT.parents and OUTPUT.name != '_site':
        raise SystemExit('Build output must be the _site folder or an external test directory.')
    OUTPUT.mkdir(parents=True, exist_ok=True)
    shutil.copy2(ROOT / 'index.html', OUTPUT / 'index.html')
    shutil.copy2(ROOT / '.nojekyll', OUTPUT / '.nojekyll')
    shutil.copytree(ROOT / 'static', OUTPUT / 'static', dirs_exist_ok=True)
    config = {'geminiApiKey': key, 'geminiModel': 'gemini-3.5-flash-lite'}
    (OUTPUT / 'config.js').write_text(
        'window.NOTEPILOT_CONFIG = ' + json.dumps(config, ensure_ascii=True) + ';\n',
        encoding='utf-8',
    )
    print('Created public NotePilot deployment files (API key not printed).')


if __name__ == '__main__':
    build()
