# helpers for authoring
def C(q,opts,a,exp,say=None):
    d=dict(t='choice',q=q,opts=opts,a=a,exp=exp)
    if say: d['say']=say
    return d
def L(say,opts,a,exp,q='听一听，选出你听到的内容'):
    return dict(t='listen',q=q,say=say,opts=opts,a=a,exp=exp)
def F(q,ans,exp,hint=None,alts=None):
    d=dict(t='fill',q=q,a=ans,exp=exp)
    if hint: d['hint']=hint
    if alts: d['alts']=alts
    return d
def O(zh,en,exp):
    return dict(t='order',q='连词成句：'+zh,a=en,exp=exp)
def TF(stmt,ans,exp,q='判断对错'):
    return dict(t='choice',q=q+'：'+stmt,opts=['对 ✔','错 ✘'],a=0 if ans else 1,exp=exp)
