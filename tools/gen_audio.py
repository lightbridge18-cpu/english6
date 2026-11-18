#!/usr/bin/env python3
"""Generate pre-recorded female TTS mp3s with edge-tts for every string in tools/audio_inventory.json.
audio/us/<hash>.mp3 (en-US-JennyNeural: words + sentences + explanation segments)
audio/gb/<hash>.mp3 (en-GB-SoniaNeural: words only)
then writes audio/manifest.json  {"v":1,"us":"hash hash ...","gb":"..."}
Run with proxies unset:  env -u HTTPS_PROXY -u https_proxy -u HTTP_PROXY -u http_proxy python3 tools/gen_audio.py
"""
import asyncio, json, os, re, subprocess, sys, tempfile
import edge_tts

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RATE = '-10%'
VOICES = {'us': 'en-US-JennyNeural', 'gb': 'en-GB-SoniaNeural'}

def akey(t):  # MUST match js/app.js akey()
    t = re.sub(r'/[^/\s][^/]*/', ' ', str(t))
    t = re.sub(r"[’‘`]", "'", t); t = re.sub(r'[“”]', '"', t)
    t = re.sub(r'\s+', ' ', t).strip()
    t = re.sub(r'''^[\s.,;:"'(]+|[\s.,;:"')]+$''', '', t)
    return t.lower()

def ahash(t):
    s = akey(t); h = 2166136261
    for ch in s:
        # JS charCodeAt = UTF-16 code units
        for cu in (ch.encode('utf-16-le')[i:i+2] for i in range(0, len(ch.encode('utf-16-le')), 2)):
            h ^= int.from_bytes(cu, 'little'); h = (h * 16777619) & 0xffffffff
    return '%08x' % h

def post(raw, out):
    # trim leading/trailing silence, mono 24kHz 32kbps
    r = subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', raw, '-af',
                        'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.12,areverse',
                        '-ac', '1', '-ar', '24000', '-b:a', '32k', out], capture_output=True)
    return r.returncode == 0 and os.path.getsize(out) > 500

async def one(sem, voice, text, out, stats):
    async with sem:
        for attempt in range(4):
            try:
                fd, raw = tempfile.mkstemp(suffix='.mp3'); os.close(fd)
                await edge_tts.Communicate(text, voice, rate=RATE).save(raw)
                ok = await asyncio.to_thread(post, raw, out)
                os.remove(raw)
                if ok: stats['ok'] += 1; return
            except Exception as e:
                stats['err_last'] = str(e)[:200]
                await asyncio.sleep(2 + attempt * 3)
        stats['fail'] += 1
        if os.path.exists(out): os.remove(out)

async def main():
    inv = json.load(open(os.path.join(ROOT, 'tools/audio_inventory.json')))
    jobs = []
    for t in inv['words'] + inv['sentences'] + inv['mixed']: jobs.append(('us', t))
    for t in inv['words']: jobs.append(('gb', t))
    for acc in VOICES: os.makedirs(os.path.join(ROOT, 'audio', acc), exist_ok=True)
    todo = []
    for acc, t in jobs:
        out = os.path.join(ROOT, 'audio', acc, ahash(t) + '.mp3')
        if not os.path.exists(out): todo.append((acc, t, out))
    print('jobs', len(jobs), 'todo', len(todo), flush=True)
    sem = asyncio.Semaphore(int(os.environ.get('CONC', '8')))
    stats = {'ok': 0, 'fail': 0}
    B = 200
    for i in range(0, len(todo), B):
        await asyncio.gather(*[one(sem, VOICES[a], t, o, stats) for a, t, o in todo[i:i + B]])
        print('progress', i + B, '/', len(todo), stats, flush=True)
    man = {'v': 1, 'rate': 0.9}
    for acc in VOICES:
        hs = sorted(f[:-4] for f in os.listdir(os.path.join(ROOT, 'audio', acc)) if f.endswith('.mp3'))
        man[acc] = ' '.join(hs)
    json.dump(man, open(os.path.join(ROOT, 'audio/manifest.json'), 'w'), separators=(',', ':'))
    print('DONE', stats, {a: len(man[a].split()) for a in VOICES}, flush=True)

if __name__ == '__main__':
    asyncio.run(main())
