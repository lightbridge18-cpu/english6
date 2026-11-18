#!/usr/bin/env python3
"""Write data/scenes.json from tools/scenes_src.py (v3.4 情景小剧场). Images: scenes/<id>/<n>.webp, audio: scenes/<id>/a/<n>.mp3
Audio: env -u HTTPS_PROXY -u https_proxy -u HTTP_PROXY -u http_proxy python3 tools/gen_scene_audio.py"""
import json, os, sys, subprocess
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import scenes_src as SS
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = {'v': 1, 'chars': SS.CHARS, 'scenes': []}
for s in SS.S:
    d = os.path.join(ROOT, 'scenes', s['id'])
    shots = sorted(f for f in os.listdir(d) if f.endswith('.webp'))
    s2 = dict(s); s2['imgs'] = ['scenes/%s/%s' % (s['id'], f) for f in shots]; s2.pop('shots', None)
    for i, l in enumerate(s2['lines']):
        a = os.path.join(d, 'a', '%d.mp3' % (i + 1))
        if os.path.exists(a):
            l['audio'] = 'scenes/%s/a/%d.mp3' % (s['id'], i + 1)
            dur = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', a], capture_output=True, text=True).stdout.strip()
            l['dur'] = round(float(dur or 0), 2)
    out['scenes'].append(s2)
json.dump(out, open(os.path.join(ROOT, 'data/scenes.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
print('scenes', len(out['scenes']), 'lines', sum(len(s['lines']) for s in out['scenes']))
