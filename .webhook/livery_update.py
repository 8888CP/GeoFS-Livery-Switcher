#!/usr/bin/env python3
"""
Notify Discord with rich embeds when livery.json changes.
"""

import json
import os
import subprocess
import sys
import requests


def load_previous():
    try:
        result = subprocess.run(
            ['git', 'show', 'HEAD^:livery.json'],
            capture_output=True, text=True, check=True
        )
        return json.loads(result.stdout)
    except (subprocess.CalledProcessError, json.JSONDecodeError):
        return []


def load_current():
    with open('livery.json', 'r', encoding='utf-8') as f:
        return json.load(f)


def index_liveries(data):
    idx = {}
    for ac in data:
        ac_id = str(ac.get('id', '?'))
        ac_name = ac.get('aircraft', '?')
        lv_map = {}
        for lv in ac.get('liveries', []):
            lv_name = lv.get('name', '?')
            lv_map[lv_name] = lv
        idx[ac_id] = {'aircraft': ac_name, 'liveries': lv_map}
    return idx


def detect_changes(prev_idx, curr_idx):
    changes = []
    for ac_id, curr in curr_idx.items():
        prev = prev_idx.get(ac_id, {'aircraft': curr['aircraft'], 'liveries': {}})
        added_names = set(curr['liveries'].keys()) - set(prev['liveries'].keys())

        if not added_names:
            continue

        added = []
        for name in sorted(added_names):
            info = curr['liveries'][name]
            added.append({
                'name'  : name,
                'author': info.get('author', 'Unknown'),
            })

        changes.append({
            'aircraft_id': ac_id,
            'aircraft'   : curr['aircraft'],
            'added'      : added,
            'total'      : len(curr['liveries']),
        })

    return changes


def build_embeds(changes):
    embeds = [{
        'title' : 'Livery update',
        'color' : 0x2b2d31,
    }]

    for ch in changes:
        lines = []
        for item in ch['added']:
            lines.append(f"{item['name']} *by: {item['author']}*")
        lines.append('')
        lines.append(f"`{len(ch['added'])} newly added / {ch['total']} available`")

        embeds.append({
            'title'       : ch['aircraft'],
            'description' : '\n'.join(lines),
            'color'       : 0x2b2d31,
        })

    return embeds


def main():
    prev = load_previous()
    curr = load_current()

    prev_idx = index_liveries(prev)
    curr_idx = index_liveries(curr)

    changes = detect_changes(prev_idx, curr_idx)

    if not changes:
        print('No new liveries detected, skipping Discord notification.')
        return 0

    webhook = os.environ.get('LIVERY_UPDATE_WEBHOOK')
    if not webhook:
        print('LIVERY_UPDATE_WEBHOOK not set.')
        return 1

    embeds = build_embeds(changes)

    for i in range(0, len(embeds), 10):
        payload = {
            'username': 'Livery updates',
            'embeds'  : embeds[i:i + 10],
        }
        try:
            r = requests.post(webhook, json=payload, timeout=10)
            if r.status_code >= 400:
                print(f'Discord returned {r.status_code}: {r.text}')
                return 1
        except Exception as e:
            print(f'Failed to send webhook: {e}')
            return 1

    print(f'✅ Sent {len(changes)} aircraft update(s) to Discord')
    return 0


if __name__ == '__main__':
    sys.exit(main())
