import json,re
raw=json.load(open('words_raw.json'))
over={
 'was':dict(w='was',ph='/wəz/',zh='（be 的第一和第三人称单数过去式）是',past=None),
 'power':dict(w='power',ph='/ˈpaʊə(r)/',zh='能；能量'),
}
out=[]
for r in raw:
    s=r['raw'].replace('\t',' ')
    if '*was' in s: s='*was'+s.split('*was',1)[1]
    s=re.sub(r'\s+',' ',s).strip()
    star=s.startswith('*'); s=s.lstrip('*').strip()
    past=None
    m=re.search(r'（过去式\s*(\w+)\s*(/[^/]+/)）',s)
    if m: past=dict(w=m.group(1),ph=m.group(2)); s=s[:m.start()]+' '+s[m.end():]
    phs=re.findall(r'/[^/]+/',s)
    # head: remove phonetics
    head=re.sub(r'/[^/]+/','',s)
    # split english vs chinese
    m2=re.search(r'[\u4e00-\u9fff（(]',head)
    # careful: "(also Earth)" in english
    head=head.replace('(also Earth)','').replace('(also the Moon)','')
    m2=re.search(r'[\u4e00-\u9fff（]',head)
    en=head[:m2.start()].strip(); zh=head[m2.start():].strip()
    en=re.sub(r'\s+',' ',en).replace(' -','-').replace('- ','-')
    zh=zh.replace(' ','')
    ph=' '.join(phs)
    e=dict(w=en,ph=ph,zh=zh,page=r['page'],unit=r['unit'],req=r['bold'],lvl2=star)
    if past: e['past']=past['w']; e['pastPh']=past['ph']
    if en=='' or en.startswith('单'): e.update(over['was'])
    if 'power' in r['raw'] and r['head']=='': e.update(over['power'])
    if en=='cool': e['ph']='/kuːl/'
    if 'kilometre' in en: e['zh']='千米；公里（=km）'
    out.append(e)
for e in out: print(e['unit'],e['page'],e['w'],e['ph'],e['zh'],e.get('past',''),'REQ' if e['req'] else '')
json.dump(out,open('words.json','w'),ensure_ascii=False,indent=1)
