import asyncio, json, os, subprocess, tempfile, sys
import edge_tts
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import scenes_src as SS
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def post(raw,out):
    r=subprocess.run(['ffmpeg','-y','-loglevel','error','-i',raw,'-af','silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.15,areverse','-ac','1','-ar','24000','-b:a','32k',out],capture_output=True)
    return r.returncode==0 and os.path.getsize(out)>500
async def one(sem,voice,text,out,st):
    async with sem:
        for a in range(4):
            try:
                fd,raw=tempfile.mkstemp(suffix='.mp3'); os.close(fd)
                await edge_tts.Communicate(text,voice,rate='-10%').save(raw)
                ok=await asyncio.to_thread(post,raw,out); os.remove(raw)
                if ok: st['ok']+=1; return
            except Exception as e: st['err']=str(e)[:200]; await asyncio.sleep(2+3*a)
        st['fail']+=1
async def main():
    sem=asyncio.Semaphore(6); st={'ok':0,'fail':0}; jobs=[]
    for s in SS.S:
        d=f"{ROOT}/scenes/{s['id']}/a"; os.makedirs(d,exist_ok=True)
        for i,l in enumerate(s['lines']):
            out=f"{d}/{i+1}.mp3"
            if not os.path.exists(out): jobs.append(one(sem,SS.CHARS[l['who']]['voice'],l['en'],out,st))
    await asyncio.gather(*jobs); print(st)
asyncio.run(main())
