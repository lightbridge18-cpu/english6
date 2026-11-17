import pymupdf, re, json
d=pymupdf.open('/workspace/files/uploads/六上-3e96313b5f67.pdf')
stream=[]
for pn in range(85,89):
    for b in d[pn].get_text('dict')['blocks']:
        for l in b.get('lines',[]):
            for sp in l['spans']:
                f=sp['font'].split('+')[-1]; t=sp['text']
                if 'SimSun' in f or (f.startswith('ABeeZee') and t.strip().isdigit()): continue
                if 'Poppins-Bo' in f:
                    m=re.match(r'Unit (\d)',t.strip())
                    if m: stream.append(('UNIT',m.group(1)))
                    continue
                stream.append((f,t))
entries=[];cur=[];unit=None
for f,t in stream:
    if f=='UNIT': unit=int(t); continue
    m=re.search(r'p\.\s*(\d+)',t)
    if m and f.startswith('FZ'):
        cur.append((f,t[:m.start()]))
        entries.append((unit,int(m.group(1)),cur)); cur=[]
    else: cur.append((f,t))
out=[]
for unit,page,sp in entries:
    star=False; head=[]; bold=False; phon=[]; zh=''; past=None
    txt=''.join(t for f,t in sp)
    # parse
    stage='head'
    for f,t in sp:
        if t.strip()=='*' and f.startswith('ABeeZee') and stage=='head' and not head: star=True; continue
        if t.strip().startswith('*') and f.startswith('ABeeZee') and not head: star=True; t=t.strip()[1:]
        if stage=='head' and (f.startswith('Poppins') or f.startswith('ABeeZee')) and '过去式' not in zh:
            if f.startswith('Poppins'): bold=True
            if zh: continue
            head.append(t)
        elif f.startswith('FZ') or f.startswith('Adobe'):
            zh+=t
        elif f.startswith('Cambria'):
            phon.append(t)
    out.append(dict(unit=unit,page=page,raw=txt.strip(),star=star,bold=bold,head=''.join(head).strip(),zh=zh.strip()))
for o in out: print(o['unit'],o['page'],'*' if o['star'] else ' ','B' if o['bold'] else ' ',repr(o['head']),'|',o['raw'][:90].replace('\t',' '))
print(len(out))
json.dump(out,open('words_raw.json','w'),ensure_ascii=False,indent=0)
