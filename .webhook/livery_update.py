#!/usr/bin/env python3
"""
Notify Discord when livery.json changes.
"""

import json
import os
import sys
import requests


def main():
    with open('livery.json', 'r', encoding='utf-8') as f:
        data = json.load(f)

    total = 0
    aircraft_list = []

    for ac in data:
        name = ac.get('aircraft', '?')
        count = len(ac.get('liveries', []))
        total += count
        if count > 0:
            aircraft_list.append(f'{name} ({count})')

    commit_msg = os.environ.get('COMMIT_MSG', 'Manual update')
    author = os.environ.get('GITHUB_ACTOR', 'unknown')
    repo = os.environ.get('GITHUB_REPOSITORY', '8888CP/GeoFS-Livery-Switcher')

    content = '\n'.join([
        '🛫 **GeoFS Livery Switcher — Database Updated**',
        '',
        f'**Author**: {author}',
        f'**Commit**: {commit_msg}',
        f'**Total liveries**: {total}',
        f'**Aircraft covered**: {" | ".join(aircraft_list)}',
        '',
        f'[View repository](https://github.com/{repo})',
    ])

    webhook = os.environ.get('LIVERY_UPDATE_WEBHOOK')
    if not webhook:
        print('LIVERY_UPDATE_WEBHOOK not set, skipping.')
        return 0

    try:
        r = requests.post(webhook, json={'content': content}, timeout=10)
        if r.status_code >= 400:
            print(f'Discord returned {r.status_code}: {r.text}')
            return 1
        print('✅ Discord notified')
        return 0
    except Exception as e:
        print(f'Failed to send webhook: {e}')
        return 1


if __name__ == '__main__':
    sys.exit(main())
