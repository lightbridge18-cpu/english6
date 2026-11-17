import sys, json, re, random, importlib, os
sys.path.insert(0, 'content')
from h import *
random.seed(20261117)
OUT = sys.argv[1] if len(sys.argv) > 1 else 'out'
os.makedirs(OUT + '/data', exist_ok=True)

words = json.load(open('words.json'))
for w in words:
    if w['w'] == 'was': w['zh'] = '是（am / is 的过去式）'
    if w['w'] == 'take': w['zh'] = '做（某个动作，如 take a trip 去旅行）'
    if w['w'] == 'earth': w['w'] = 'Earth'; w['note'] = '也写作 earth'
    if w['w'] == 'moon': w['w'] = 'the Moon'; w['note'] = '也写作 moon'
    w['proper'] = bool(re.match(r'^[A-Z]', w['w'])) and w['w'] not in ('Earth',)
    if w['w'] in ('the Red Army',): w['proper'] = True
def cjk(s): return re.search(r'[\u4e00-\u9fff]', s) is not None

# ---------- Appendix 4 useful expressions ----------
import pymupdf
doc = pymupdf.open('/workspace/files/uploads/六上-3e96313b5f67.pdf')
lines = []
for pn in (93, 94, 95):
    for l in doc[pn].get_text().split('\n'):
        l = l.strip()
        if not l or l in ('Appendix 4', 'Useful expressions') or '常 用' in l or '仅供' in l or l.isdigit(): continue
        lines.append(l)
expr = {}; unit = None; en = ''; zh = ''
def push():
    global en, zh
    if en and zh: expr.setdefault(unit, []).append([en.strip(), zh.strip()])
    en = ''; zh = ''
for l in lines:
    m = re.match(r'^Unit (\d)$', l)
    if m: push(); unit = int(m.group(1)); continue
    if cjk(l): zh += l
    else:
        if zh: push()
        en += (' ' if en else '') + l
push()
for k in expr:
    for p in expr[k]: p[0] = re.sub(r'\s+', ' ', p[0]).replace(' .', '.')

# ---------- Appendix 5 irregular verbs ----------
t = doc[96].get_text().split('\n')
t = [x.strip() for x in t if x.strip()]
i0 = t.index('be (am, is, are)')
seq = t[i0:]
seq = [x for x in seq if not x.isdigit() and '仅供' not in x]
v1 = seq[0:25]; p1 = seq[25:50]; v2 = seq[50:72]; p2 = seq[72:94]
irregular = [[a, b] for a, b in zip(v1 + v2, p1 + p2)]
assert irregular[0][1] == 'was, were' and irregular[-1] == ['write', 'wrote'], irregular[-3:]
IRR_ZH = dict(be='是', begin='开始', bring='带来', buy='买', catch='抓住', come='来', cut='切；剪', do='做', draw='画', drink='喝', drive='驾驶', eat='吃', feel='感觉', find='找到', fly='飞', get='得到', give='给', go='去', have='有；吃', hear='听见', hurt='疼；受伤', keep='保持；保存', know='知道', learn='学习', let='让', make='做；制作', meet='遇见', put='放', read='读', run='跑', say='说', see='看见', sell='卖', sing='唱', sit='坐', sleep='睡觉', speak='说（语言）', stand='站', swim='游泳', take='拿；乘坐', teach='教', tell='告诉；讲述', think='想；认为', wake='醒来', wear='穿；戴', win='赢', write='写')

# ---------- units ----------
mods = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'rev']
units = [importlib.import_module(m).U for m in mods]
wordmap = {}
for w in words: wordmap.setdefault(w['w'], []).append(w)

def find_word(name, uno):
    c = wordmap.get(name, [])
    for w in c:
        if w['unit'] == uno: return w
    return c[0] if c else None

def zh_of_sentence(unit, en):
    for p in unit['passages']:
        for sp, e, z in p['lines']:
            if e == en: return z
            if en in e and len(en) > 12: return None
    return None

def auto_questions(unit, lesson, uwords):
    qs = []
    lw = [find_word(n, unit['no']) for n in lesson.get('words', [])]
    lw = [w for w in lw if w]
    pool = [w for w in uwords if w['w'] not in ('was',)]
    random.shuffle(lw)
    def distract(w, k=2, key='zh'):
        cands = [x for x in pool if x['w'] != w['w'] and x[key] != w[key]]
        random.shuffle(cands)
        out = []
        for c in cands:
            if c[key] not in out: out.append(c[key])
            if len(out) == k: break
        return out
    for w in lw[:3]:
        opts = [w['zh']] + distract(w); random.shuffle(opts)
        qs.append(dict(t='choice', q='“%s” 的意思是？' % w['w'], say=w['w'], opts=opts, a=opts.index(w['zh']),
                       exp='%s %s：%s' % (w['w'], w['ph'], w['zh']), auto=1, word=w['w']))
    for w in lw[3:5] if len(lw) > 3 else lw[:1]:
        opts = [w['w']] + distract(w, 2, 'w'); random.shuffle(opts)
        qs.append(dict(t='listen', q='听一听，选出你听到的单词', say=w['w'], opts=opts, a=opts.index(w['w']),
                       exp='你听到的是 %s %s（%s）。' % (w['w'], w['ph'], w['zh']), auto=1, word=w['w']))
    for w in [x for x in lw if x['req'] and not x['proper'] and x['w'] != 'was'][:2]:
        ans = w['w']
        qs.append(dict(t='fill', q='根据中文写出单词：%s（首字母 %s）' % (w['zh'], ans[0]), a=ans,
                       exp='%s %s：%s。这是要求会运用的黑体词。' % (ans, w['ph'], w['zh']), auto=1, word=ans, say=ans))
    if len(lw) >= 3:
        m = lw[:4]
        qs.append(dict(t='match', q='把英文和中文配对', pairs=[[w['w'], w['zh'].split('；')[0]] for w in m],
                       exp='；'.join('%s = %s' % (w['w'], w['zh']) for w in m), auto=1))
    keys = lesson.get('key', [])
    short = [k for k in keys if 3 <= len(k.split()) <= 11]
    if short:
        s = random.choice(short)
        z = zh_of_sentence(unit, s) or ''
        qs.append(dict(t='order', q='听句子，连词成句' + ('：' + z if z else ''), a=s, say=s,
                       exp='正确句子：' + s + ('（' + z + '）' if z else ''), auto=1))
    withzh = [(k, zh_of_sentence(unit, k)) for k in keys]
    withzh = [x for x in withzh if x[1]]
    if withzh:
        s, z = random.choice(withzh)
        others = []
        for p in unit['passages']:
            for sp, e, zz in p['lines']:
                if zz != z and zz not in others: others.append(zz)
        random.shuffle(others)
        opts = [z] + others[:2]; random.shuffle(opts)
        qs.append(dict(t='listen', q='听句子，选出正确的中文意思', say=s, opts=opts, a=opts.index(z),
                       exp='%s —— %s' % (s, z), auto=1))
    return qs

GRAMMAR_QS = {
 'u1': [C('I ___ the Great Wall last weekend.',['climb','climbed','climbing'],1,'last weekend 是过去时间，用过去式 climbed。'),
        C('go 的过去式是：',['goed','went','gone'],1,'go → went。'),
        C('—What did you do yesterday? —I ___ a museum.',['visit','visited','visits'],1,'回答过去做了什么用过去式。'),
        C('How ___ your weekend?',['was','is','were'],0,'问过去的周末：How was your weekend?'),
        F('We ___ (see) the Terracotta Warriors.','saw','see → saw。'),
        F('She ___ (eat) hot dry noodles in Wuhan.','ate','eat → ate。'),
        C('哪个是正确的过去式？',['taked','took','tooked'],1,'take → took。'),
        O('你上周末做了什么？','What did you do last weekend?','What did you do + 过去时间？')],
 'u2': [C('—Did you watch the race? —Yes, I ___.',['did','do','was'],0,'Did 问，did 答。'),
        C('Did you ___ mooncakes?',['eat','ate','eating'],0,'Did 后面跟动词原形。'),
        C('—Did they take a trip? —No, they ___.',["didn't","don't","weren't"],0,"否定回答 No, they didn't."),
        F('The writer ___ (read) his book to us.','read','read 的过去式还是 read，读 /red/。'),
        F('They ___ (sing) their team song together.','sang','sing → sang。'),
        F('His team ___ (win) the race!','won','win → won。'),
        C('wear 的过去式是：',['weared','wore','worn'],1,'wear → wore。'),
        O('你喜欢它的哪一点？','What did you like about it?','What did you like about ...?')],
 'u3': [C('She ___ a cough.',['has','have','is'],0,'主语 she 用 has。'),
        C('My head ___.',['hurts','hurt','is hurt'],0,'my head 单数，hurts。'),
        C('You should ___ a doctor.',['see','sees','saw'],0,'should + 动词原形。'),
        C("___ stay up late.",["Don't","Not","Doesn't"],0,"祈使句否定用 Don't。"),
        C('—How do you feel? —I ___ ill.',['feel','feels','am feel'],0,'I feel ill. 我感觉不舒服。'),
        C('We ___ to eat healthy food.',['need','should','can'],0,'need to 需要；should 和 can 后面不加 to。'),
        F('He ___ (have) a fever.','has','he 是第三人称单数，have → has。'),
        O('你应该喝点水。','You should drink some water.','should + 动词原形。')],
 'u4': [C("I'm going to ___ a schoolbag.",['buy','buys','bought'],0,'be going to + 动词原形。'),
        C('She ___ going to wait for a sale.',['is','are','am'],0,'she 用 is。'),
        C('How ___ you going to spend your pocket money?',['are','is','do'],0,'主语 you 用 are。'),
        C('They ___ going to save up for a bike.',['are','is','am'],0,'they 用 are。'),
        C('He ___ to buy a robot show ticket.',['wants','want','wanting'],0,'he 用 wants。'),
        C('357 的英文是：',['three hundred and fifty-seven','three hundreds fifty-seven','three hundred fifty and seven'],0,'hundred 不加 s，后面加 and。'),
        F("We ___ going to make a spending plan.",'are','we 用 are。'),
        O('你打算买什么？','What are you going to buy?','What are you going to ...?')],
 'u5': [C('___ there any water on Mars?',['Is','Are','Do'],0,'water 不可数，用 Is there any ...?'),
        C('___ there any aliens?',['Are','Is','Does'],0,'aliens 复数，用 Are there any ...?'),
        C('—Is there any soil on Mars? —Yes, there ___.',['is','are','does'],0,'Is there ...? Yes, there is.'),
        C("There ___ any living things on Mars.",["aren't","isn't","don't"],0,'living things 复数。'),
        C('There ___ large oceans on Earth.',['are','is','be'],0,'oceans 复数用 are。'),
        C('The Moon ___ around Earth.',['travels','travel','travelling'],0,'主语单数，动词加 s。'),
        C('Is there ___ water on the Moon?',['any','some','a'],0,'疑问句用 any。'),
        O('火星上有水吗？','Is there any water on Mars?','Is there any + 不可数名词 + 地点？')],
 'u6': [C('We should ___ energy.',['save','saves','saving'],0,'should + 动词原形。'),
        C('We use solar power ___ light our homes.',['to','for','at'],0,'use ... to do 用……来做。'),
        C('Many resources are ___ out.',['running','run','runs'],0,'are running out 正在用完。'),
        C('We can ___ quick showers.',['take','takes','took'],0,'can + 动词原形。'),
        C('Use air conditioners ___.',['less','fewer','little'],0,'少用：use ... less。'),
        C('Recycle 的意思是：',['回收','减少','再利用'],0,'recycle 回收；reduce 减少；reuse 再利用。'),
        F('Small changes can make a big ___ (不同).','difference','difference 差别；不同（之处）。'),
        O('我们怎样节约能源？','How can we save energy?','How can we ...?')],
}

out_units = []
n_lessons = 0; n_q = 0; n_hand = 0
for U in units:
    uno = U['no']
    uwords = [w for w in words if w['unit'] == uno]
    lessons = []
    for L_ in U['lessons']:
        hand = L_.pop('qs')
        for q in hand: q.setdefault('hand', 1)
        auto = auto_questions(U, L_, uwords) if uwords else []
        L_['questions'] = hand + auto
        L_['unit'] = U['id']
        lessons.append(L_)
    if U['id'] in GRAMMAR_QS:
        g = U['grammar']
        gl = dict(id=U['id'] + '-g', part='G', title='语法加油站：' + g['title'].split('：')[0], page=None,
                  explain=g['points'], key=[], words=[], questions=GRAMMAR_QS[U['id']], unit=U['id'])
        lessons.append(gl)
    U['lessons'] = lessons
    U['words'] = [dict(w=w['w'], ph=w['ph'], zh=w['zh'], page=w['page'], req=w['req'], lvl2=w['lvl2'],
                      proper=w['proper'], **({'past': w['past'], 'pastPh': w['pastPh']} if 'past' in w else {}),
                      **({'note': w['note']} if 'note' in w else {})) for w in uwords]
    U['expressions'] = expr.get(uno, [])
    n_lessons += len(lessons); n_q += sum(len(l['questions']) for l in lessons)
    n_hand += sum(1 for l in lessons for q in l['questions'] if not q.get('auto'))
    out_units.append(U)

# ---------- past tense camp ----------
REG_QS = [
 C('visit 的过去式是：',['visited','visitted','visit'],0,'一般情况直接加 ed：visited。'),
 C('dance 的过去式是：',['danced','danceed','dancd'],0,'以不发音的 e 结尾，只加 d：danced。'),
 C('study 的过去式是：',['studied','studyed','studed'],0,'辅音字母 + y 结尾，变 y 为 i 再加 ed：studied。'),
 C('stop 的过去式是：',['stopped','stoped','stopt'],0,'重读闭音节末尾只有一个辅音字母，双写再加 ed：stopped。'),
 C('play 的过去式是：',['played','plaied','plaid'],0,'元音字母 + y 结尾，直接加 ed：played。'),
 C('哪一个 -ed 读 /ɪd/？',['wanted','watched','cleaned'],0,'t、d 结尾的动词，-ed 读 /ɪd/。'),
 C('哪一个 -ed 读 /t/？',['watched','played','visited'],0,'清辅音（如 /tʃ/ /k/ /s/）结尾，-ed 读 /t/。'),
 F('We ___ (travel) to Paris last summer.','travelled','英式拼写 travel → travelled（课本用法），美式也写作 traveled。',alts=['traveled']),
 F('My sister and I ___ (paste) fu on the door.','pasted','paste 以 e 结尾，加 d：pasted。'),
 F('He ___ (cry) last night.','cried','辅音 + y，变 y 为 i 加 ed：cried。'),
]
pt_lessons = [dict(id='pt-l0', part='P', title='规则动词：加 -ed 的秘密', page=None, unit='pt',
  explain=['一般过去时里，大多数动词直接加 ed：visit → visited, watch → watched, play → played。',
           '以不发音的 e 结尾只加 d：dance → danced, paste → pasted, live → lived。',
           '辅音字母 + y 结尾，把 y 变成 i 再加 ed：study → studied, cry → cried。',
           '重读闭音节、末尾只有一个辅音字母，双写再加 ed：stop → stopped, plan → planned。英式英语 travel → travelled。',
           '-ed 的读音：清辅音后读 /t/（watched），浊辅音和元音后读 /d/（played），t 和 d 后读 /ɪd/（wanted, visited）。'],
  key=[], words=[], questions=REG_QS)]
groups = [irregular[i:i + 12] for i in range(0, len(irregular), 12)]
for gi, grp in enumerate(groups):
    qs = []
    for v, p in grp:
        base = v.split(' ')[0]
        pa = p.split(',')[0].strip()
        allp = [x[1].split(',')[0].strip() for x in irregular if x[1] != p]
        wrong = base + ('d' if base.endswith('e') else 'ed')
        d = [wrong] + random.sample([x for x in allp if x != pa and x != wrong], 1)
        opts = [pa] + d; random.shuffle(opts)
        qs.append(dict(t='choice', q='%s（%s）的过去式是？' % (v, IRR_ZH.get(base, '')), say=base, opts=opts, a=opts.index(pa),
                       exp='%s → %s。不规则动词，不能直接加 ed。' % (v, p), auto=1))
    for v, p in random.sample(grp, min(6, len(grp))):
        base = v.split(' ')[0]; pa = p.split(',')[0].strip()
        qs.append(dict(t='fill', q='写出 %s（%s）的过去式' % (v, IRR_ZH.get(base, '')), a=pa,
                       alts=[x.strip() for x in p.split(',')], exp='%s → %s' % (v, p), auto=1, say=pa))
    m = random.sample(grp, 4)
    qs.append(dict(t='match', q='把动词原形和过去式配对', pairs=[[v.split(' ')[0], p.split(',')[0].strip()] for v, p in m],
                   exp='；'.join('%s → %s' % (v, p) for v, p in m), auto=1))
    pt_lessons.append(dict(id='pt-l%d' % (gi + 1), part='P', title='不规则动词 %d（%s—%s）' % (gi + 1, grp[0][0].split(' ')[0], grp[-1][0]),
        page=92, unit='pt', explain=['不规则动词的过去式要一个一个记。这一组：' + '，'.join('%s → %s' % (v, p) for v, p in grp) + '。',
        '小窍门：把相似的放一起记，比如 sing → sang, drink → drank, begin → began, swim → swam（i 变 a）；buy → bought, bring → brought, think → thought（都以 ought 结尾）。'],
        key=[], words=[], table=grp, questions=qs))
pt = dict(id='pt', no=8, title='Past tense camp', zh='过去式训练营', emoji='⏳', color='#ff86d0', bookPages=[92, 92],
          q='Irregular verbs (Appendix 5)', qzh='附录5 不规则动词 + 规则变化', isExtra=True, passages=[], stories=[],
          lessons=pt_lessons, words=[], expressions=[], irregular=irregular)
out_units.append(pt)
n_lessons += len(pt_lessons); n_q += sum(len(l['questions']) for l in pt_lessons)
n_hand += sum(1 for l in pt_lessons for q in l['questions'] if not q.get('auto'))

# sanity checks
for U in out_units:
    for l in U['lessons']:
        assert len(l['questions']) >= 6, (l['id'], len(l['questions']))
        for q in l['questions']:
            if q['t'] in ('choice', 'listen'):
                assert 0 <= q['a'] < len(q['opts']), (l['id'], q)
                assert len(set(q['opts'])) == len(q['opts']), (l['id'], q['opts'])
            assert q.get('exp'), (l['id'], q)
        if l.get('passage'): assert any(p['id'] == l['passage'] for p in U['passages']), l['id']
    for s in U.get('stories', []):
        for q in s['qs']: assert 0 <= q['a'] < len(q['opts'])

book = dict(
  title='六上英语闯关站', subtitle='人教PEP 英语 六年级上册（2026 新版）同步练习',
  version='2.0.0', built='2026-11-17',
  units=out_units, irregular=irregular, irregularZh=IRR_ZH,
  stats=dict(units=6, lessons=n_lessons, questions=n_q, handQuestions=n_hand,
             words=len(words), requiredWords=sum(1 for w in words if w['req']),
             passages=sum(len(U['passages']) for U in out_units),
             passageLines=sum(len(p['lines']) for U in out_units for p in U['passages']),
             stories=sum(len(U.get('stories', [])) for U in out_units),
             storyQuestions=sum(len(s['qs']) for U in out_units for s in U.get('stories', [])),
             songs=sum(1 for U in out_units if U.get('song')),
             expressions=sum(len(v) for v in expr.values()), irregular=len(irregular)))
s = json.dumps(book, ensure_ascii=False, separators=(',', ':'))
open(OUT + '/data/book.json', 'w').write(s)
open(OUT + '/data/book.js', 'w').write('/* 自动生成：python3 build.py — 内容来源见 README */\nwindow.BOOK=' + s + ';\n')
print(json.dumps(book['stats'], ensure_ascii=False, indent=1))
for U in out_units: print(U['id'], len(U['lessons']), 'lessons', sum(len(l['questions']) for l in U['lessons']), 'qs', len(U['words']), 'words', len(U['passages']), 'passages', len(U.get('stories', [])), 'stories', len(U['expressions']), 'expr')
