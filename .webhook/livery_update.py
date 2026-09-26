#!/usr/bin/env python3
"""
Notify Discord with rich embeds when livery.json changes.
First message: title. Then one per aircraft. Last message: total.
"""

import json
import os
import subprocess
import sys
import time
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


def build_embeds(changes, all_data):
    """
    Build a list of embeds:
      [0]  Livery update (title)
      [1..n] one per aircraft
      [n+1] Total: X newly added / Y available
    """
    total_available = sum(len(ac.get('liveries', [])) for ac in all_data)
    total_added     = sum(len(ch['added']) for ch in changes)

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

    # Last embed: totals
    embeds.append({
        'description' : f"**Total**: `{total_added}` newly added / `{total_available}` available",
        'color'       : 0x5865f2,
    })

    return embeds


def send_embed(webhook, embed, index, total):
    payload = {
        'username': 'Livery updates',
        'embeds'  : [embed],
    }
    try:
        r = requests.post(webhook, json=payload, timeout=10)

        # Rate limited → wait and retry once
        if r.status_code == 429:
            retry_after = 1.0
            try:
                retry_after = float(r.json().get('retry_after', 1.0))
            except Exception:
                pass
            print(f'Rate limited, waiting {retry_after}s...')
            time.sleep(retry_after + 0.5)
            r = requests.post(webhook, json=payload, timeout=10)

        if r.status_code >= 400:
            print(f'Discord returned {r.status_code}: {r.text}')
            return False

        print(f'✓ Sent message {index + 1}/{total}')
        return True

    except Exception as e:
        print(f'Failed to send webhook: {e}')
        return False


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

    embeds = build_embeds(changes, curr)

    for i, embed in enumerate(embeds):
        ok = send_embed(webhook, embed, i, len(embeds))
        if not ok:
            return 1
        # Space out messages to avoid rate limits
        if i < len(embeds) - 1:
            time.sleep(1.2)

    print(f'✅ Sent {len(embeds)} message(s) to Discord')
    return 0


if __name__ == '__main__':
    sys.exit(main())
