import sys,re,importlib
sys.path.insert(0,'content')
def norm(s): 
    s=s.replace('’',"'").replace('‘',"'").replace('“','"').replace('”','"')
    return re.sub(r'[^a-z0-9]','',s.lower())
T=norm(open('pdftext.txt').read())
for m in sys.argv[1:]:
    U=importlib.import_module(m).U
    bad=0
    for p in U['passages']+([dict(id='song',lines=[['',a,b] for a,b in U['song']['lines']])] if U.get('song') else []):
        for sp,en,zh in p['lines']:
            if norm(en) not in T:
                bad+=1; print(m,p['id'],'NOT FOUND:',en)
    print(m,'passage lines',sum(len(p['lines']) for p in U['passages']),'bad',bad)
