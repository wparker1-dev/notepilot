#!/usr/bin/env python3
"""One-time migration from the ORIGINAL LOCAL NotePilot SQLite database.

Run this on your own computer; never commit the generated JSON (private notes).
Usage: python tools/migrate_sqlite_to_backup.py path/to/notepilot.sqlite3 path/to/backup.json
"""
import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path


def migrate(src: Path, dst: Path) -> None:
    if not src.is_file():
        raise ValueError(f"Database not found: {src}")
    if dst.resolve() == src.resolve():
        raise ValueError("Output must be a different file.")
    if dst.exists():
        raise ValueError("Output file already exists. Choose a fresh filename.")
    # SQLite URI read-only mode ensures the migration never changes the original.
    conn = sqlite3.connect(src.resolve().as_uri() + "?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    try:
        documents = [
            dict(id=r['id'], name=r['name'], created=r['created'], units=json.loads(r['units']))
            for r in conn.execute('SELECT id,name,created,units FROM documents')
        ]
        materials = []
        columns = {r['name'] for r in conn.execute('PRAGMA table_info(materials)')}
        for row in conn.execute('SELECT * FROM materials'):
            item = dict(row)
            for field in ('items', 'source_ids', 'coverage'):
                item[field] = json.loads(item[field]) if field in item and item[field] else (None if field == 'coverage' else [])
            item['version'] = int(item.get('version') or 1)
            item['messages'] = [
                dict(role=r['role'], content=r['content'], refs=json.loads(r['refs']), created=r['created'])
                for r in conn.execute('SELECT role,content,refs,created FROM messages WHERE material_id=? ORDER BY id', (item['id'],))
            ]
            item['revisions'] = [
                dict(items=json.loads(r['items']), created=r['created'], reason=r['reason'])
                for r in conn.execute('SELECT items,created,reason FROM revisions WHERE material_id=? ORDER BY id', (item['id'],))
            ]
            item['coverage'] = item.get('coverage')
            materials.append(item)
        content = {
            'format': 'notepilot-backup-v1',
            'created': datetime.now(timezone.utc).isoformat(),
            'documents': documents,
            'materials': materials,
            'profile': {'id': 'profile', 'coins': 0, 'unlocked': ['lavender'], 'equipped': 'lavender', 'rewardedIds': []},
        }
        dst.write_text(json.dumps(content, ensure_ascii=False, indent=2), encoding='utf-8')
        print(f'Private backup created: {dst} ({len(documents)} sources; {len(materials)} study sets)')
        print('Do not upload this backup to your public GitHub repository.')
    finally:
        conn.close()


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit('Usage: python tools/migrate_sqlite_to_backup.py SOURCE.sqlite3 OUTPUT.json')
    try:
        migrate(Path(sys.argv[1]), Path(sys.argv[2]))
    except (ValueError, sqlite3.Error, OSError, json.JSONDecodeError) as exc:
        sys.exit(f'Migration failed: {exc}')
