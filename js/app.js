/* 六上英语闯关站 v2 — plain JS, no build step. Data: window.BOOK (data/book.js) */
(function () {
'use strict';
var B = window.BOOK;
if (!B) { document.getElementById('view').innerHTML = '<p style="padding:20px">数据加载失败，请刷新页面。</p>'; return; }

/* ---------------- utils ---------------- */
function $(s, el) { return (el || document).querySelector(s); }
function $$(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function pad(n) { return (n < 10 ? '0' : '') + n; }
function dstr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function today() { return dstr(new Date()); }
function dayOffset(n) { var d = new Date(); d.setDate(d.getDate() + n); return dstr(d); }
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function toast(msg, ms) { var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(function () { t.remove(); }, ms || 2200); }
function norm(s) { return String(s).toLowerCase().replace(/[’‘`]/g, "'").replace(/[“”]/g, '"').replace(/[^a-z0-9'\s-]/g, ' ').replace(/\s+/g, ' ').trim(); }
function words(s) { return norm(s).split(' ').filter(Boolean); }

/* ---------------- index ---------------- */
var UNITS = B.units, LESSONS = {}, PASSAGES = {}, STORIES = {}, QIDX = {};
UNITS.forEach(function (u) {
  u.lessons.forEach(function (l, li) { l._u = u; l._i = li; LESSONS[l.id] = l; l.questions.forEach(function (q, qi) { q._key = l.id + '#' + qi; QIDX[q._key] = { q: q, unit: u.id, src: l.title }; }); });
  (u.passages || []).forEach(function (p) { p._u = u; PASSAGES[p.id] = p; });
  if (u.song) { var sp = { id: u.id + '-song', part: 'Song', kind: 'Song', title: u.song.title, zh: u.song.zh, page: u.song.page, lines: u.song.lines.map(function (x) { return ['', x[0], x[1]]; }), _u: u }; PASSAGES[sp.id] = sp; u._song = sp; }
  (u.stories || []).forEach(function (s) { s._u = u; STORIES[s.id] = s; s.qs.forEach(function (q, qi) { q._key = s.id + '#' + qi; QIDX[q._key] = { q: q, unit: u.id, src: s.title }; }); });
});
var MAIN_UNITS = UNITS.filter(function (u) { return !u.isExtra && !u.isRevision; });
var ALL_LESSON_IDS = Object.keys(LESSONS);

/* ---------------- state ---------------- */
var KEY = 'e6.v2';
function defState() {
  return { v: 2, xp: 0, hearts: 5, heartTs: Date.now(), streak: 0, bestStreak: 0, lastDay: null, days: {}, lessons: {}, chal: {}, wrong: {}, ach: {}, claimed: {}, read: {}, stories: {}, wordp: 0,
    settings: { rate: 0.9, zh: true, sfx: true, voice: '', autoExplain: true },
    parent: { pin: '', limit: 0, extra: {} }, stats: { lessons: 0, perfect: 0, maxCombo: 0, reviewed: 0, shadow: 0, reads: 0, chal: 0 }, unlock: '' };
}
var S;
function merge(a, b) { for (var k in b) { if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') merge(a[k], b[k]); else a[k] = b[k]; } return a; }
function load() { var d = defState(); try { var raw = localStorage.getItem(KEY); if (raw) merge(d, JSON.parse(raw)); } catch (e) { } S = d; }
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } }
load();
function D(d) { d = d || today(); if (!S.days[d]) S.days[d] = { xp: 0, lessons: 0, reviews: 0, reads: 0, stories: 0, sec: 0, combo: 0, perfect: 0, shadow: 0, chal: 0, wordp: 0 }; return S.days[d]; }
var HEART_MS = 30 * 60 * 1000, MAXH = 5;
function regen() {
  if (S.hearts >= MAXH) { S.hearts = MAXH; S.heartTs = Date.now(); return; }
  var n = Math.floor((Date.now() - S.heartTs) / HEART_MS);
  if (n > 0) { S.hearts = Math.min(MAXH, S.hearts + n); S.heartTs += n * HEART_MS; if (S.hearts >= MAXH) S.heartTs = Date.now(); }
}
function touchStreak() {
  var t = today();
  if (S.lastDay === t) return;
  S.streak = (S.lastDay === dayOffset(-1)) ? S.streak + 1 : 1;
  S.bestStreak = Math.max(S.bestStreak || 0, S.streak);
  S.lastDay = t;
}
function streakNow() { return (S.lastDay === today() || S.lastDay === dayOffset(-1)) ? S.streak : 0; }
function addXP(n) { S.xp += n; D().xp += n; touchStreak(); save(); renderTop(); checkAch(); }
function bump(field, n) { D()[field] = (D()[field] || 0) + (n || 1); save(); }

/* ---------------- sound ---------------- */
var actx = null;
function tone(freqs, dur, type) {
  if (!S.settings.sfx) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    var t0 = actx.currentTime;
    freqs.forEach(function (f, i) {
      var o = actx.createOscillator(), g = actx.createGain();
      o.type = type || 'sine'; o.frequency.value = f; o.connect(g); g.connect(actx.destination);
      var st = t0 + i * dur; g.gain.setValueAtTime(0.0001, st); g.gain.exponentialRampToValueAtTime(0.18, st + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, st + dur);
      o.start(st); o.stop(st + dur + 0.02);
    });
  } catch (e) { }
}
var sfx = { good: function () { tone([660, 880], 0.12); }, bad: function () { tone([220, 180], 0.16, 'square'); }, win: function () { tone([523, 659, 784, 1046], 0.13); } };

/* ---------------- TTS ---------------- */
var TTS = {
  ok: 'speechSynthesis' in window, voices: [], token: 0,
  init: function () { if (!this.ok) return; var self = this; var f = function () { self.voices = speechSynthesis.getVoices() || []; }; f(); if (speechSynthesis.addEventListener) speechSynthesis.addEventListener('voiceschanged', f); else speechSynthesis.onvoiceschanged = f; },
  pick: function (lang) {
    var vs = this.voices; if (!vs.length) return null;
    if (lang.indexOf('en') === 0 && S.settings.voice) { for (var i = 0; i < vs.length; i++) if (vs[i].name === S.settings.voice) return vs[i]; }
    var pref = lang.indexOf('en') === 0 ? ['en-US', 'en_US', 'en-GB', 'en'] : ['zh-CN', 'zh_CN', 'cmn', 'zh'];
    for (var p = 0; p < pref.length; p++) {
      var c = vs.filter(function (v) { return (v.lang || '').replace('_', '-').toLowerCase().indexOf(pref[p].replace('_', '-').toLowerCase()) === 0; });
      if (c.length) { var good = c.filter(function (v) { return /natural|neural|google|samantha|xiaoxiao|tingting|online/i.test(v.name); }); return (good[0] || c[0]); }
    }
    return null;
  },
  stop: function () { this.token++; if (this.ok) try { speechSynthesis.cancel(); } catch (e) { } },
  say: function (text, lang, rate) {
    var self = this; lang = lang || 'en-US';
    return new Promise(function (res) {
      if (!self.ok || !text) return res(false);
      var u = new SpeechSynthesisUtterance(String(text).replace(/\/[^\/\s][^\/]*\//g, ' '));
      u.lang = lang; var v = self.pick(lang); if (v) u.voice = v;
      u.rate = rate || (lang.indexOf('en') === 0 ? S.settings.rate : 1.0);
      var done = false; function fin(ok) { if (done) return; done = true; clearTimeout(tm); res(ok); }
      u.onend = function () { fin(true); }; u.onerror = function () { fin(false); };
      var tm = setTimeout(function () { fin(true); }, 1500 + String(text).length * 140 / (u.rate || 1));
      try { speechSynthesis.speak(u); } catch (e) { fin(false); }
    });
  },
  one: function (text, lang, rate) { this.stop(); var self = this; return new Promise(function (r) { setTimeout(function () { self.say(text, lang, rate).then(r); }, 60); }); },
  segs: function (text) {
    var out = [], re = /[A-Za-z][A-Za-z0-9'’\-\s,.!?"…°()]*[A-Za-z0-9.!?'"…)]|[A-Za-z]/g, last = 0, m;
    text = String(text).replace(/\/[^\/\s][^\/]*\//g, ' ');
    while ((m = re.exec(text))) { if (m.index > last) out.push({ t: text.slice(last, m.index), l: 'zh-CN' }); out.push({ t: m[0], l: 'en-US' }); last = m.index + m[0].length; }
    if (last < text.length) out.push({ t: text.slice(last), l: 'zh-CN' });
    return out.filter(function (s) { return /[A-Za-z0-9\u4e00-\u9fff]/.test(s.t); });
  },
  mixed: function (text) { var self = this, my = ++this.token; var segs = this.segs(text); if (this.ok) try { speechSynthesis.cancel(); } catch (e) { }
    return segs.reduce(function (p, s) { return p.then(function () { if (my !== self.token) return; return self.say(s.t, s.l, s.l === 'en-US' ? S.settings.rate : 1.05); }); }, new Promise(function (r) { setTimeout(r, 60); })).then(function () { return my === self.token; }); }
};
TTS.init();
function speakEn(t) { return TTS.one(t, 'en-US'); }

/* ---------------- speech recognition / recording ---------------- */
var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
function lcsMarks(target, heard) {
  var a = words(target), b = words(heard), n = a.length, m = b.length, dp = [];
  for (var i = 0; i <= n; i++) { dp.push(new Array(m + 1).fill(0)); }
  for (i = n - 1; i >= 0; i--) for (var j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  var marks = new Array(n).fill(false); i = 0; j = 0;
  while (i < n && j < m) { if (a[i] === b[j]) { marks[i] = true; i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++; }
  var ok = marks.filter(Boolean).length; return { words: a, marks: marks, score: n ? Math.round(ok * 100 / n) : 0 };
}
function recognize(target) {
  return new Promise(function (res, rej) {
    var r = new SR(); r.lang = 'en-US'; r.interimResults = false; r.maxAlternatives = 3;
    var best = null;
    r.onresult = function (e) { var alts = e.results[0]; for (var i = 0; i < alts.length; i++) { var sc = lcsMarks(target, alts[i].transcript); sc.heard = alts[i].transcript; if (!best || sc.score > best.score) best = sc; } };
    r.onerror = function (e) { rej(e.error || 'error'); };
    r.onend = function () { best ? res(best) : rej('no-speech'); };
    try { r.start(); } catch (e) { rej(e); }
  });
}
var Rec = { mr: null, chunks: [], url: null,
  start: function () { var self = this; return navigator.mediaDevices.getUserMedia({ audio: true }).then(function (st) { self.chunks = []; self.mr = new MediaRecorder(st); self.mr.ondataavailable = function (e) { self.chunks.push(e.data); }; self.mr.start(); self.st = st; }); },
  stop: function () { var self = this; return new Promise(function (res) { if (!self.mr) return res(null); self.mr.onstop = function () { var b = new Blob(self.chunks, { type: self.mr.mimeType || 'audio/webm' }); if (self.url) URL.revokeObjectURL(self.url); self.url = URL.createObjectURL(b); self.st.getTracks().forEach(function (t) { t.stop(); }); self.mr = null; res(self.url); }; self.mr.stop(); }); }
};
var canRecord = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);

/* ---------------- confetti & modal ---------------- */
function confetti() { var cs = ['#58cc02', '#1cb0f6', '#ffc800', '#ff4b4b', '#ce82ff', '#ff9600']; for (var i = 0; i < 60; i++) { var c = document.createElement('i'); c.className = 'confetti'; c.style.left = Math.random() * 100 + 'vw'; c.style.background = cs[i % cs.length]; c.style.animationDuration = (1.6 + Math.random() * 1.8) + 's'; c.style.animationDelay = Math.random() * .5 + 's'; document.body.appendChild(c); setTimeout(function (el) { el.remove(); }.bind(null, c), 4200); } }
function modal(html, onmount) { var m = document.createElement('div'); m.className = 'modal'; m.innerHTML = '<div class="box">' + html + '</div>'; document.body.appendChild(m); var close = function () { m.remove(); }; if (onmount) onmount(m, close); return close; }

/* ---------------- achievements ---------------- */
function doneLessons() { return Object.keys(S.lessons).filter(function (k) { return S.lessons[k].done && LESSONS[k]; }).length; }
function chalPassed() { return MAIN_UNITS.filter(function (u) { return S.chal[u.id] && S.chal[u.id].pass; }).length; }
var ORIG_STORIES = Object.keys(STORIES);
var ACH = [
  ['first', '🐣', '第一步', '完成第一节小课', function () { return doneLessons() >= 1; }],
  ['l10', '📗', '勤学好问', '完成 10 节小课', function () { return doneLessons() >= 10; }],
  ['l30', '📚', '小学霸', '完成 30 节小课', function () { return doneLessons() >= 30; }],
  ['lall', '🎓', '全册通关', '完成全部小课', function () { return doneLessons() >= ALL_LESSON_IDS.length; }],
  ['chal1', '🏆', '单元勇士', '通过 1 次单元挑战', function () { return chalPassed() >= 1; }],
  ['chal6', '👑', '六单元之王', '通过全部 6 个单元挑战', function () { return chalPassed() >= 6; }],
  ['xp100', '⭐', '百分起步', '累计 100 经验', function () { return S.xp >= 100; }],
  ['xp500', '🌟', '闪闪发光', '累计 500 经验', function () { return S.xp >= 500; }],
  ['xp2000', '🌌', '英语星河', '累计 2000 经验', function () { return S.xp >= 2000; }],
  ['s3', '🔥', '三天连胜', '连续学习 3 天', function () { return (S.bestStreak || 0) >= 3; }],
  ['s7', '☄️', '一周坚持', '连续学习 7 天', function () { return (S.bestStreak || 0) >= 7; }],
  ['c10', '⚡', '连击高手', '一次答题连击 10 题', function () { return S.stats.maxCombo >= 10; }],
  ['perfect', '💯', '完美小课', '一节小课全部一次答对', function () { return S.stats.perfect >= 1; }],
  ['rev20', '🔁', '知错就改', '在错题本答对 20 题', function () { return S.stats.reviewed >= 20; }],
  ['read10', '🎧', '小小听众', '完整听读 10 篇课文', function () { return S.stats.reads >= 10; }],
  ['shadow20', '🎤', '跟读达人', '跟读 20 个句子', function () { return S.stats.shadow >= 20; }],
  ['story1', '📖', '故事迷', '读完 1 个原创故事', function () { return Object.keys(S.stories).length >= 1; }],
  ['storyall', '🦄', '故事大王', '读完全部原创故事', function () { return ORIG_STORIES.every(function (k) { return S.stories[k]; }); }],
  ['pt', '⏳', '过去式大师', '完成过去式训练营全部小课', function () { var u = UNITS.filter(function (x) { return x.id === 'pt'; })[0]; return u && u.lessons.every(function (l) { return S.lessons[l.id] && S.lessons[l.id].done; }); }]
];
function checkAch(silent) {
  var got = [];
  ACH.forEach(function (a) { if (!S.ach[a[0]] && a[4]()) { S.ach[a[0]] = Date.now(); got.push(a); } });
  if (got.length) { save(); if (!silent) got.forEach(function (a, i) { setTimeout(function () { sfx.win(); confetti(); toast('🏅 解锁成就：' + a[1] + ' ' + a[2], 3000); }, i * 1200); }); }
}

/* ---------------- daily tasks ---------------- */
var TASKS = [
  ['xp30', '⭐', '获得 30 经验', 30, 'xp'], ['xp60', '🌟', '获得 60 经验', 60, 'xp'], ['les2', '📘', '完成 2 节小课', 2, 'lessons'], ['les3', '📚', '完成 3 节小课', 3, 'lessons'],
  ['rev5', '🔁', '在错题本答对 5 题', 5, 'reviews'], ['read1', '🎧', '完整听读 1 篇课文', 1, 'reads'], ['shad5', '🎤', '跟读 5 个句子', 5, 'shadow'], ['story1', '📖', '读完 1 个故事并答题', 1, 'stories'],
  ['combo5', '🔥', '答题连击达到 5', 5, 'combo'], ['perfect', '💯', '完成 1 节全对小课', 1, 'perfect'], ['chal', '🏆', '挑战 1 次单元挑战', 1, 'chal'], ['wordp', '🔤', '完成 1 次单词练习', 1, 'wordp']
];
function todaysTasks() { var t = today(), seed = parseInt(t.replace(/-/g, ''), 10), r = mulberry32(seed), pool = TASKS.slice(), out = []; while (out.length < 3) { var i = Math.floor(r() * pool.length); out.push(pool.splice(i, 1)[0]); } return out; }
function taskVal(t) { return Math.min(t[3], D()[t[4]] || 0); }
function claimTask(id) { var c = S.claimed[today()] = S.claimed[today()] || []; if (c.indexOf(id) >= 0) return; c.push(id); addXP(15); sfx.win(); toast('任务完成！+15 经验'); render(); }

/* ---------------- wrong book (SRS) ---------------- */
var BOXDAYS = [0, 1, 2, 4, 7, 15];
function addWrong(q) { if (!q._key) return; var w = S.wrong[q._key]; if (!w) w = S.wrong[q._key] = { box: 0, n: 0, first: Date.now() }; w.box = 0; w.n++; w.due = Date.now() + 10 * 60 * 1000; w.last = Date.now(); }
function dueWrong() { var now = Date.now(); return Object.keys(S.wrong).filter(function (k) { return QIDX[k] && S.wrong[k].box < 5 && S.wrong[k].due <= now; }); }
function activeWrong() { return Object.keys(S.wrong).filter(function (k) { return QIDX[k] && S.wrong[k].box < 5; }); }

/* ---------------- time limit ---------------- */
var lastTick = Date.now();
setInterval(function () {
  var now = Date.now(), dt = Math.min(30, Math.round((now - lastTick) / 1000)); lastTick = now;
  if (document.visibilityState !== 'visible') return;
  D().sec += dt; regen(); save(); renderTop(); checkLimit();
}, 15000);
function limitSec() { var ex = (S.parent.extra && S.parent.extra[today()]) || 0; return (S.parent.limit || 0) * 60 + ex * 60; }
var lockOpen = false;
function checkLimit() {
  if (!S.parent.limit || S.unlock === today() || lockOpen) return;
  if (D().sec < limitSec()) return;
  lockOpen = true; TTS.stop(); closeLesson(true);
  modal('<div class="e">🌙</div><h2>今天的学习时间到啦！</h2><p class="sub">休息一下眼睛，明天再来闯关吧。</p>' +
    (S.parent.pin ? '<div class="form"><label>家长 PIN 解锁</label><input id="lkpin" type="password" inputmode="numeric" maxlength="8"></div><button class="btn blue block" id="lkok" style="margin-top:12px">解锁今天</button>' :
      '<p class="note">家长未设置 PIN。</p><button class="btn blue block" id="lk10">家长：再学 10 分钟</button>'), function (m, close) {
      var ok = $('#lkok', m); if (ok) ok.onclick = function () { if ($('#lkpin', m).value === S.parent.pin) { S.unlock = today(); save(); lockOpen = false; close(); } else { $('#lkpin', m).classList.add('shake'); setTimeout(function () { $('#lkpin', m).classList.remove('shake'); }, 400); } };
      var t = $('#lk10', m); if (t) t.onclick = function () { S.parent.extra = S.parent.extra || {}; S.parent.extra[today()] = (S.parent.extra[today()] || 0) + 10; save(); lockOpen = false; close(); };
    });
}

/* ---------------- chrome (nav/top) ---------------- */
var NAV = [['#/', '🏠', '学习'], ['#/read', '🎧', '听读'], ['#/stories', '📖', '故事'], ['#/words', '🔤', '单词'], ['#/review', '🔁', '错题本'], ['#/me', '🦉', '我的']];
function renderNav() {
  var r = location.hash || '#/'; var cur = NAV.filter(function (n) { return n[0] !== '#/' && r.indexOf(n[0]) === 0; })[0]; cur = cur ? cur[0] : '#/';
  if (/^#\/(p|s|parent)\//.test(r) || r === '#/parent') { if (r.indexOf('#/s/') === 0) cur = '#/stories'; else if (r.indexOf('#/p/') === 0) cur = '#/read'; else cur = '#/me'; }
  var html = NAV.map(function (n) { return '<button class="navbtn' + (n[0] === cur ? ' on' : '') + '" data-go="' + n[0] + '"><span class="ic">' + n[1] + '</span><span>' + n[2] + '</span></button>'; }).join('');
  $('#side').innerHTML = '<div class="logo">🦉 六上英语闯关站</div>' + html + '<div style="flex:1"></div><div class="note" style="padding:8px">人教PEP 六年级上册 · 2026新版</div>';
  $('#bottom').innerHTML = html;
  $$('[data-go]').forEach(function (b) { b.onclick = function () { location.hash = b.getAttribute('data-go'); }; });
}
function renderTop() {
  regen(); var due = dueWrong().length;
  $('#topbar').innerHTML = '<span class="stat fire" title="连续学习天数">🔥 ' + streakNow() + '</span><span class="stat xp" title="经验值">⭐ ' + S.xp + '</span>' +
    '<span class="stat gem" title="待复习错题" style="cursor:pointer" onclick="location.hash=\'#/review\'">🔁 ' + due + '</span><span class="stat heart" title="爱心（每30分钟恢复1颗）">❤️ ' + S.hearts + '</span>';
}

/* ---------------- views ---------------- */
var V = $('#view');
function lessonState(id) { return S.lessons[id] || {}; }
function curLesson(u) { for (var i = 0; i < u.lessons.length; i++) if (!lessonState(u.lessons[i].id).done) return u.lessons[i].id; return null; }
var PART_ICON = { A: '🅰️', B: '🅱️', C: '🛠️', Story: '📜', G: '🧩', R: '🏛️', P: '⏳' };
function stars(n) { var s = ''; for (var i = 0; i < 3; i++) s += i < n ? '⭐' : '☆'; return '<span class="stars">' + s + '</span>'; }

function viewHome() {
  var tasks = todaysTasks(), done = tasks.filter(function (t) { return taskVal(t) >= t[3]; }).length;
  var h = '<div class="hero"><div class="m mascot">🦉</div><div><b>' + esc(B.title) + '</b><div style="font-size:13px;opacity:.95">' + esc(B.subtitle) + '</div>' +
    '<div class="tasksmini"><span>今日任务 ' + done + '/3</span><span>今日 ' + (D().xp) + ' 经验</span><span>' + Math.round(D().sec / 60) + ' 分钟</span></div></div></div>';
  var due = dueWrong().length;
  if (due) h += '<div class="page" style="padding-bottom:0"><div class="card click row" onclick="location.hash=\'#/review\'"><span style="font-size:30px">🔁</span><div class="grow"><b>有 ' + due + ' 道错题该复习了</b><div class="sub">复习不扣爱心，还能赚经验、恢复爱心</div></div><span>›</span></div></div>';
  UNITS.forEach(function (u) {
    var dn = u.lessons.filter(function (l) { return lessonState(l.id).done; }).length;
    h += '<div class="unithead" style="--uc:' + u.color + '"><div style="font-size:34px">' + u.emoji + '</div><div class="t">' +
      (u.isExtra ? '<small>专项训练</small>' : u.isRevision ? '<small>Revision · p.' + u.bookPages[0] + '–' + u.bookPages[1] + '</small>' : '<small>Unit ' + u.no + ' · p.' + u.bookPages[0] + '–' + u.bookPages[1] + '</small>') +
      '<b>' + esc(u.title) + '</b><small>' + esc(u.zh) + ' · ' + dn + '/' + u.lessons.length + ' 课</small></div>' +
      (u.words.length ? '<button class="ub" data-href="#/words/' + u.id + '">单词</button>' : '') + '</div>';
    var q = [];
    if (u.passages.length) q.push('<button data-href="#/read/' + u.id + '">🎧 课文听读</button>');
    if (u.stories && u.stories.length) q.push('<button data-href="#/stories/' + u.id + '">📖 故事</button>');
    if (u._song) q.push('<button data-href="#/p/' + u._song.id + '">🎵 ' + esc(u.song.title) + '</button>');
    if (u.words.length) q.push('<button data-act="wordp" data-u="' + u.id + '">🔤 单词练习</button>');
    if (u.q) q.push('<button style="cursor:default;color:#999">❓ ' + esc(u.qzh) + '</button>');
    h += '<div class="quick">' + q.join('') + '</div><div class="path" style="--uc:' + u.color + '">';
    var cur = curLesson(u);
    u.lessons.forEach(function (l, i) {
      var st = lessonState(l.id), off = [0, 60, 90, 60, 0, -60, -90, -60][i % 8];
      var cls = 'node' + (st.done ? ' done' : '') + (l.id === cur ? ' cur' : '');
      h += '<div class="nodewrap' + (l.id === cur ? ' curw' : '') + '" style="transform:translateX(' + off + 'px)">' + (l.id === cur ? '<div class="startpop">开始</div>' : '') +
        '<button class="' + cls + '" data-href="#/lesson/' + l.id + '" title="' + esc(l.title) + '">' + (st.done ? '👑' : (PART_ICON[l.part] || '⭐')) + '</button>' +
        '<div class="nodelabel">' + esc(l.title) + (st.done ? '<br>' + stars(st.stars || 1) : '') + '</div></div>';
    });
    if (!u.isExtra) {
      var cs = S.chal[u.id] || {};
      h += '<div class="nodewrap"><button class="node chal' + (cs.pass ? ' done' : '') + '" data-href="#/challenge/' + u.id + '" style="background:' + (cs.pass ? '' : '#ff9600') + ';box-shadow:0 8px 0 ' + (cs.pass ? '' : '#cc7800') + '">🏆</button><div class="nodelabel">单元挑战' + (cs.pass ? '<br>' + stars(cs.stars) : '') + '</div></div>';
    }
    h += '</div>';
  });
  h += '<footer class="cr">课本内容版权归人民教育出版社所有 · 仅供家庭学习使用<br>设计灵感来自 聪聪学堂（MIT）</footer>';
  V.innerHTML = h;
}

function readerList(uid, kind) {
  var tabs = UNITS.filter(function (u) { return kind === 'stories' ? (u.stories && u.stories.length) || u.passages.some(function (p) { return p.part === 'Story'; }) : u.passages.length; });
  uid = uid || (tabs[0] && tabs[0].id);
  var h = '<div class="page"><h1 class="h">' + (kind === 'stories' ? '📖 故事阅读' : '🎧 课文听读') + '</h1><div class="sub">' +
    (kind === 'stories' ? '每单元 2 篇原创分级小故事（配阅读理解题）+ 课本 Reading time。' : '逐句听读课本对话和短文：点句子朗读，“朗读全文”自动高亮，🎤 跟读打分。') + '</div><div class="tabs">';
  tabs.forEach(function (u) { h += '<button class="' + (u.id === uid ? 'on' : '') + '" data-href="#/' + (kind === 'stories' ? 'stories' : 'read') + '/' + u.id + '">' + u.emoji + ' ' + (u.isRevision ? 'Revision' : 'U' + u.no) + '</button>'; });
  h += '</div>';
  var u = UNITS.filter(function (x) { return x.id === uid; })[0];
  if (u) {
    h += '<div class="sub" style="margin:4px 0 8px"><b>' + esc(u.title) + '</b> ' + esc(u.zh) + '</div><div class="lst">';
    var items = [];
    if (kind === 'stories') {
      (u.stories || []).forEach(function (s) { var d = S.stories[s.id]; items.push(['#/s/' + s.id, '🧸', s.title, s.zh + ' · 原创 ' + s.level + ' · ' + s.lines.length + ' 句 · ' + s.qs.length + ' 道题', d ? '✅ ' + d.best + '%' : '']); });
      u.passages.filter(function (p) { return p.part === 'Story'; }).forEach(function (p) { items.push(['#/p/' + p.id, '📜', p.title, 'Reading time · ' + p.zh + ' · p.' + p.page, S.read[p.id] ? '✅' : '']); });
    } else {
      u.passages.forEach(function (p) { items.push(['#/p/' + p.id, p.part === 'Story' ? '📜' : p.part === 'C' ? '🛠️' : p.part === 'R' ? '🏛️' : '💬', p.title, (p.part !== 'Story' && p.part !== 'R' ? 'Part ' + p.part + ' · ' : '') + p.kind + ' · ' + p.zh + ' · p.' + p.page + ' · ' + p.lines.length + ' 句', S.read[p.id] ? '✅' : '']); });
      if (u._song) items.push(['#/p/' + u._song.id, '🎵', u.song.title, 'Song · ' + u.song.zh + ' · p.' + u.song.page, S.read[u._song.id] ? '✅' : '']);
    }
    items.forEach(function (it) { h += '<div class="card click item" data-href="' + it[0] + '"><span class="em">' + it[1] + '</span><div class="grow"><b>' + esc(it[2]) + '</b><div class="sub">' + esc(it[3]) + '</div></div><span>' + it[4] + '</span></div>'; });
    h += '</div>';
  }
  V.innerHTML = h + '</div>';
}

/* reader for passage / story */
var readerCtl = null;
function viewReader(p, isStory) {
  var showZh = S.settings.zh;
  var h = '<div class="page"><div class="row"><button class="ibtn" data-back="1">←</button><div class="grow"><h1 class="h" style="margin:0">' + esc(p.title) + '</h1><div class="sub">' +
    esc(p.zh) + (p.page ? ' · 课本 p.' + p.page : '') + (isStory ? ' · 原创故事 ' + p.level : (p.kind ? ' · ' + esc(p.kind) : '')) + '</div></div></div>' +
    '<div class="toolbar"><button class="btn sm blue" id="playall">▶ 朗读全文</button><button class="btn sm ghost" id="stopall">⏹ 停止</button>' +
    '<button class="ibtn' + (showZh ? ' on' : '') + '" id="tzh" title="显示/隐藏中文">中</button><button class="ibtn" id="rate" title="语速">' + (S.settings.rate < 0.8 ? '🐢' : S.settings.rate > 0.95 ? '🐇' : '🚶') + '</button>' +
    '<span class="note">' + (SR ? '🎤 跟读会识别发音并打分' : (canRecord ? '🎤 跟读：录音后回放对比' : '当前浏览器不支持录音')) + '</span></div>';
  var lines = isStory ? p.lines.map(function (l) { return ['', l[0], l[1]]; }) : p.lines;
  lines.forEach(function (l, i) {
    h += '<div class="sent" data-i="' + i + '">' + (l[0] ? '<div class="sp">' + esc(l[0]) + '</div>' : '') + '<div class="tx"><div class="en">' + esc(l[1]) + '</div><div class="zh' + (showZh ? '' : ' hidden') + '">' + esc(l[2]) + '</div><div class="score" id="sc' + i + '"></div></div>' +
      '<div class="acts"><button class="ibtn" data-say="' + i + '" title="朗读">🔊</button>' + (SR || canRecord ? '<button class="ibtn" data-rec="' + i + '" title="跟读">🎤</button>' : '') + '</div></div>';
  });
  if (isStory) h += '<button class="btn block" id="storyq" style="margin-top:16px">读完了，去答题（' + p.qs.length + ' 题）</button>';
  else if (p.part !== 'Song') { var ls = Object.keys(LESSONS).filter(function (k) { return LESSONS[k].passage === p.id; }); if (ls.length) h += '<button class="btn block ghost" style="margin-top:16px" data-href="#/lesson/' + ls[0] + '">去做本课练习 ›</button>'; }
  V.innerHTML = h + '</div>';
  var rows = $$('.sent', V);
  function hl(i) { rows.forEach(function (r, j) { r.classList.toggle('on', j === i); }); if (rows[i]) rows[i].scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  rows.forEach(function (r, i) { r.onclick = function (e) { if (e.target.closest('.acts')) return; hl(i); speakEn(lines[i][1]).then(function () { r.classList.remove('on'); }); }; });
  $$('[data-say]', V).forEach(function (b) { b.onclick = function () { var i = +b.getAttribute('data-say'); hl(i); speakEn(lines[i][1]); }; });
  $$('[data-rec]', V).forEach(function (b) { b.onclick = function () { shadow(+b.getAttribute('data-rec'), b); }; });
  function shadow(i, btn) {
    var box = $('#sc' + i); TTS.stop();
    if (SR) {
      btn.classList.add('on'); box.innerHTML = '🎙️ 请朗读这句话……';
      recognize(lines[i][1]).then(function (r) {
        btn.classList.remove('on');
        var html = r.words.map(function (w, k) { return '<span class="' + (r.marks[k] ? 'ok' : 'no') + '">' + esc(w) + '</span>'; }).join(' ');
        var msg = r.score >= 90 ? '太棒了！' : r.score >= 70 ? '很好！' : r.score >= 40 ? '再试一次吧' : '没听清，再来一次';
        box.innerHTML = '<b>' + r.score + ' 分</b> ' + msg + '<br>' + html + '<br><span class="note">识别到：' + esc(r.heard) + '</span>';
        S.stats.shadow++; bump('shadow'); if (r.score >= 70) addXP(1); else save(); checkAch();
      }).catch(function (e) {
        btn.classList.remove('on');
        if (e === 'not-allowed' || e === 'service-not-allowed') box.innerHTML = '需要麦克风权限（请在浏览器地址栏允许麦克风）。' + (canRecord ? '' : '');
        else box.innerHTML = '没有听到声音，点 🎤 再试一次。';
      });
    } else if (canRecord) {
      if (!Rec.mr) { Rec.start().then(function () { btn.classList.add('on'); btn.textContent = '⏺'; box.innerHTML = '录音中……读完后再点一次 ⏺ 停止'; }).catch(function () { box.innerHTML = '无法使用麦克风（需要 HTTPS 和麦克风权限）。'; }); }
      else { Rec.stop().then(function (url) { btn.classList.remove('on'); btn.textContent = '🎤'; box.innerHTML = '<audio controls src="' + url + '"></audio> <button class="btn sm ghost" id="cmp' + i + '">听原音</button>'; $('#cmp' + i).onclick = function () { speakEn(lines[i][1]); }; S.stats.shadow++; bump('shadow'); addXP(1); checkAch(); }); }
    }
  }
  $('#tzh').onclick = function () { S.settings.zh = !S.settings.zh; save(); $$('.zh', V).forEach(function (z) { z.classList.toggle('hidden', !S.settings.zh); }); this.classList.toggle('on', S.settings.zh); };
  $('#rate').onclick = function () { var r = S.settings.rate; S.settings.rate = r < 0.8 ? 0.9 : r < 0.95 ? 1.0 : 0.7; save(); this.textContent = S.settings.rate < 0.8 ? '🐢' : S.settings.rate > 0.95 ? '🐇' : '🚶'; toast('语速：' + (S.settings.rate < 0.8 ? '慢' : S.settings.rate > 0.95 ? '正常' : '稍慢')); };
  $('#stopall').onclick = function () { TTS.stop(); hl(-1); };
  $('#playall').onclick = function () {
    TTS.stop(); var my = TTS.token, i = 0;
    function next() { if (my !== TTS.token) return; if (i >= lines.length) { hl(-1); finishRead(); return; } hl(i); TTS.say(lines[i][1], 'en-US').then(function () { i++; setTimeout(next, 350); }); }
    setTimeout(next, 80);
  };
  function finishRead() {
    var first = !S.read[p.id]; S.read[p.id] = (S.read[p.id] || 0) + 1; S.stats.reads++; bump('reads');
    S.readDay = S.readDay || {}; if (S.readDay.d !== today()) S.readDay = { d: today(), ids: [] };
    if (S.readDay.ids.indexOf(p.id) < 0) { S.readDay.ids.push(p.id); addXP(5); toast('听完全文！+5 经验'); } save(); checkAch();
  }
  var sq = $('#storyq'); if (sq) sq.onclick = function () { TTS.stop(); startSession({ mode: 'story', title: p.title, questions: p.qs.slice(), storyId: p.id }); };
  var bk = $('[data-back]', V); if (bk) bk.onclick = function () { history.length > 1 ? history.back() : (location.hash = '#/read'); };
}

function viewWords(uid, filter) {
  var tabs = MAIN_UNITS.slice(); uid = uid || 'u1'; filter = filter || 'all';
  var h = '<div class="page"><h1 class="h">🔤 单词与表达</h1><div class="sub">来自课本附录 2「单元词汇表」：<span class="pill req">会用</span>黑体词要求理解、运用；<span class="pill rec">认读</span>白体词仅要求在语境中理解；<span class="pill lv">二级</span>为课标二级词。</div><div class="tabs">';
  tabs.forEach(function (u) { h += '<button class="' + (u.id === uid ? 'on' : '') + '" data-href="#/words/' + u.id + '">' + u.emoji + ' U' + u.no + '</button>'; });
  h += '<button class="' + (uid === 'irr' ? 'on' : '') + '" data-href="#/words/irr">⏳ 不规则动词</button><button class="' + (uid === 'expr' ? 'on' : '') + '" data-href="#/words/expr">💬 常用表达</button></div>';
  if (uid === 'irr') {
    h += '<div class="sub">课本附录 5 Irregular verbs（点击一行朗读）</div><div class="card"><table class="irr"><tr><th>动词</th><th>过去式</th><th>意思</th></tr>';
    B.irregular.forEach(function (r) { var b = r[0].split(' ')[0]; h += '<tr data-sayt="' + esc(b + ', ' + r[1]) + '"><td><b>' + esc(r[0]) + '</b></td><td>' + esc(r[1]) + '</td><td class="sub">' + esc(B.irregularZh[b] || '') + '</td></tr>'; });
    h += '</table></div><a class="btn block" href="#/lesson/pt-l1">去过去式训练营 ›</a>';
  } else if (uid === 'expr') {
    MAIN_UNITS.forEach(function (u) { h += '<h3>' + u.emoji + ' Unit ' + u.no + ' ' + esc(u.title) + '</h3><div class="card">'; u.expressions.forEach(function (e) { h += '<div class="wrow" data-sayt="' + esc(e[0]) + '" style="cursor:pointer"><div class="grow"><div class="w" style="font-size:16px">' + esc(e[0]) + '</div><div class="zh sub">' + esc(e[1]) + '</div></div><span>🔊</span></div>'; }); h += '</div>'; });
    h += '<div class="note">来自课本附录 4 Useful expressions。</div>';
  } else {
    var u = UNITS.filter(function (x) { return x.id === uid; })[0];
    var ws = u.words.filter(function (w) { return filter === 'all' || (filter === 'req' ? w.req : !w.req); });
    h += '<div class="row" style="margin:6px 0"><div class="tabs grow" style="padding:0">' + [['all', '全部 ' + u.words.length], ['req', '会用 ' + u.words.filter(function (w) { return w.req; }).length], ['rec', '认读 ' + u.words.filter(function (w) { return !w.req; }).length]].map(function (f) { return '<button class="' + (f[0] === filter ? 'on' : '') + '" data-href="#/words/' + uid + '/' + f[0] + '">' + f[1] + '</button>'; }).join('') + '</div>' +
      '<button class="btn sm" data-act="wordp" data-u="' + uid + '">练一练</button></div><div class="card">';
    ws.forEach(function (w) { h += '<div class="wrow"><button class="ibtn" data-sayt="' + esc(w.w + (w.past ? ', ' + w.past : '')) + '">🔊</button><div class="grow"><span class="w">' + esc(w.w) + '</span> <span class="ph">' + esc(w.ph) + '</span>' + (w.past ? ' <span class="sub">过去式 <b>' + esc(w.past) + '</b> ' + esc(w.pastPh || '') + '</span>' : '') +
      '<div class="zh">' + esc(w.zh) + (w.note ? '（' + esc(w.note) + '）' : '') + '</div><div>' + (w.req ? '<span class="pill req">会用</span>' : '<span class="pill rec">认读</span>') + (w.lvl2 ? '<span class="pill lv">二级</span>' : '') + (w.proper ? '<span class="pill">专有名词</span>' : '') + '<span class="pill">p.' + w.page + '</span></div></div></div>'; });
    h += '</div>';
  }
  V.innerHTML = h + '</div>';
  $$('[data-sayt]', V).forEach(function (el) { el.onclick = function (e) { e.stopPropagation(); speakEn(el.getAttribute('data-sayt')); }; });
}

function viewReview() {
  var act = activeWrong(), due = dueWrong(), mastered = Object.keys(S.wrong).filter(function (k) { return S.wrong[k].box >= 5; }).length;
  var h = '<div class="page"><h1 class="h">🔁 错题本</h1><div class="sub">答错的题会自动收进来，按间隔重复（1、2、4、7、15 天）安排复习；连续答对 5 轮就算掌握。复习不扣爱心，每答对 1 题 +2 经验，完成一轮恢复 1 颗爱心。</div>' +
    '<div class="grid2" style="margin:12px 0"><div class="sbox"><span class="e">⏰</span><div><b>' + due.length + '</b><small>现在该复习</small></div></div><div class="sbox"><span class="e">📒</span><div><b>' + act.length + '</b><small>在本子里</small></div></div><div class="sbox"><span class="e">✅</span><div><b>' + mastered + '</b><small>已掌握</small></div></div><div class="sbox"><span class="e">🏅</span><div><b>' + S.stats.reviewed + '</b><small>累计复习答对</small></div></div></div>';
  if (due.length) h += '<button class="btn block" id="revgo">开始复习（' + Math.min(10, due.length) + ' 题）</button>';
  else if (act.length) h += '<button class="btn block blue" id="revall">暂无到期错题 · 提前复习全部</button>';
  if (!act.length) h += '<div class="empty"><div class="e">🌈</div><p>错题本是空的！<br>每一次尝试都在进步，去闯关吧。</p></div>';
  else {
    h += '<h3>本子里的题</h3>';
    act.sort(function (a, b) { return S.wrong[a].due - S.wrong[b].due; }).forEach(function (k) {
      var it = QIDX[k], w = S.wrong[k], q = it.q, ans = q.t === 'choice' || q.t === 'listen' ? q.opts[q.a] : q.t === 'match' ? '' : q.a;
      var dueTxt = w.due <= Date.now() ? '<b style="color:var(--r)">现在</b>' : new Date(w.due).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
      h += '<div class="card"><div class="sub">' + esc(it.src) + ' · 错 ' + w.n + ' 次 · 第 ' + w.box + '/5 轮 · 下次 ' + dueTxt + '</div><div style="font-weight:800">' + esc(q.q) + (q.say && q.t === 'listen' ? ' <span class="sub">（' + esc(q.say) + '）</span>' : '') + '</div>' + (ans ? '<div class="sub">答案：' + esc(ans) + '</div>' : '') + '</div>';
    });
  }
  V.innerHTML = h + '</div>';
  var g = $('#revgo') || $('#revall');
  if (g) g.onclick = function () { var keys = shuffle(due.length ? due : act).slice(0, 10); startSession({ mode: 'review', title: '错题复习', questions: keys.map(function (k) { return QIDX[k].q; }) }); };
}

function viewMe() {
  var tasks = todaysTasks(), claimed = S.claimed[today()] || [];
  var h = '<div class="page"><h1 class="h">🦉 我的</h1><div class="grid2">' +
    '<div class="sbox"><span class="e">🔥</span><div><b>' + streakNow() + ' 天</b><small>连续学习（最长 ' + (S.bestStreak || 0) + '）</small></div></div>' +
    '<div class="sbox"><span class="e">⭐</span><div><b>' + S.xp + '</b><small>总经验</small></div></div>' +
    '<div class="sbox"><span class="e">👑</span><div><b>' + doneLessons() + '/' + ALL_LESSON_IDS.length + '</b><small>完成小课</small></div></div>' +
    '<div class="sbox"><span class="e">🏆</span><div><b>' + chalPassed() + '/6</b><small>单元挑战</small></div></div></div>';
  h += '<div class="card"><h3 style="margin:4px 0">📅 每日任务</h3><div class="sub">每天 3 个，按日期生成；完成后领取 +15 经验</div>';
  tasks.forEach(function (t) { var v = taskVal(t), ok = v >= t[3], c = claimed.indexOf(t[0]) >= 0;
    h += '<div class="task"><span class="e">' + t[1] + '</span><div class="grow"><b>' + t[2] + '</b><div class="bar"><i style="width:' + Math.round(v * 100 / t[3]) + '%"></i></div><small class="sub">' + v + '/' + t[3] + '</small></div>' +
      (c ? '<span class="pill req">已领取</span>' : ok ? '<button class="btn sm yellow" data-claim="' + t[0] + '">领取</button>' : '') + '</div>'; });
  h += '</div>';
  var days = [], tot = 0, last = 0, mins = 0;
  for (var i = 6; i >= 0; i--) { var d = dayOffset(-i), dd = S.days[d] || {}; days.push([d, dd.xp || 0, Math.round((dd.sec || 0) / 60)]); tot += dd.xp || 0; mins += Math.round((dd.sec || 0) / 60); }
  for (i = 13; i >= 7; i--) { var d2 = S.days[dayOffset(-i)] || {}; last += d2.xp || 0; }
  var mx = Math.max(10, Math.max.apply(null, days.map(function (x) { return x[1]; })));
  var wk = ['日', '一', '二', '三', '四', '五', '六'];
  h += '<div class="card"><h3 style="margin:4px 0">📊 本周报告</h3><div class="sub">近 7 天共 <b>' + tot + '</b> 经验、学习 <b>' + mins + '</b> 分钟；' + (tot >= last ? '比上周多 ' + (tot - last) : '比上周少 ' + (last - tot)) + ' 经验 ' + (tot >= last ? '📈' : '📉') + '</div><div class="week">';
  days.forEach(function (x, j) { var dt = new Date(x[0] + 'T00:00:00'); h += '<div class="col' + (j === 6 ? ' today' : '') + '"><b>' + x[1] + '</b><i style="height:' + Math.round(x[1] * 100 / mx) + '%"></i><small>' + (j === 6 ? '今天' : '周' + wk[dt.getDay()]) + '</small></div>'; });
  h += '</div></div>';
  h += '<div class="card"><h3 style="margin:4px 0">🏅 成就 ' + Object.keys(S.ach).length + '/' + ACH.length + '</h3><div class="ach">';
  ACH.forEach(function (a) { h += '<div class="a' + (S.ach[a[0]] ? '' : ' no') + '"><span class="e">' + a[1] + '</span><b>' + a[2] + '</b>' + esc(a[3]) + '</div>'; });
  h += '</div></div>';
  var vs = (TTS.voices || []).filter(function (v) { return /^en/i.test(v.lang); });
  h += '<div class="card form"><h3 style="margin:4px 0">⚙️ 设置</h3><label>英语朗读语速</label><select id="srate"><option value="0.7">慢 0.7</option><option value="0.8">较慢 0.8</option><option value="0.9">稍慢 0.9</option><option value="1">正常 1.0</option></select>' +
    '<label>英语发音（' + (vs.length ? vs.length + ' 个可选' : '浏览器未提供英语语音') + '）</label><select id="svoice"><option value="">自动（优先美式 en-US）</option>' + vs.map(function (v) { return '<option' + (v.name === S.settings.voice ? ' selected' : '') + '>' + esc(v.name) + '</option>'; }).join('') + '</select>' +
    '<label><input type="checkbox" id="sauto" style="width:auto"' + (S.settings.autoExplain ? ' checked' : '') + '> 进入小课时自动朗读知识讲解</label><label><input type="checkbox" id="ssfx" style="width:auto"' + (S.settings.sfx ? ' checked' : '') + '> 答题音效</label>' +
    '<button class="btn sm ghost" id="stest" style="margin-top:8px">🔊 试听</button></div>';
  h += '<button class="btn block blue" data-href="#/parent">👨‍👩‍👧 家长中心</button>';
  h += '<footer class="cr">课本内容版权归人民教育出版社所有，本站仅供家庭学习使用。<br>交互设计参考 聪聪学堂 congcong-school（MIT）。数据保存在本浏览器。</footer>';
  V.innerHTML = h + '</div>';
  $('#srate').value = String(S.settings.rate);
  $('#srate').onchange = function () { S.settings.rate = parseFloat(this.value); save(); };
  $('#svoice').onchange = function () { S.settings.voice = this.value; save(); };
  $('#sauto').onchange = function () { S.settings.autoExplain = this.checked; save(); };
  $('#ssfx').onchange = function () { S.settings.sfx = this.checked; save(); };
  $('#stest').onclick = function () { TTS.mixed('Hello! 你好，我们一起学英语吧。 How was your weekend?'); };
  $$('[data-claim]', V).forEach(function (b) { b.onclick = function () { claimTask(b.getAttribute('data-claim')); }; });
}

var parentOK = false;
function viewParent() {
  if (S.parent.pin && !parentOK) {
    V.innerHTML = '<div class="page"><h1 class="h">👨‍👩‍👧 家长中心</h1><div class="card form"><label>请输入家长 PIN</label><input id="pin" type="password" inputmode="numeric" maxlength="8"><button class="btn block blue" id="pok" style="margin-top:12px">进入</button></div></div>';
    $('#pok').onclick = function () { if ($('#pin').value === S.parent.pin) { parentOK = true; viewParent(); } else toast('PIN 不正确'); };
    return;
  }
  var t = D(), rows = '';
  for (var i = 6; i >= 0; i--) { var d = dayOffset(-i), dd = S.days[d] || {}; rows += '<tr><td>' + d.slice(5) + '</td><td>' + Math.round((dd.sec || 0) / 60) + ' 分</td><td>' + (dd.xp || 0) + '</td><td>' + (dd.lessons || 0) + '</td><td>' + (dd.reviews || 0) + '</td></tr>'; }
  var h = '<div class="page"><div class="row"><button class="ibtn" data-href="#/me">←</button><h1 class="h grow" style="margin:0">👨‍👩‍👧 家长中心</h1></div>' +
    '<div class="card"><b>今天已学习 ' + Math.round(t.sec / 60) + ' 分钟</b> · ' + t.xp + ' 经验 · ' + t.lessons + ' 节小课<table class="irr" style="margin-top:8px"><tr><th>日期</th><th>时长</th><th>经验</th><th>小课</th><th>复习</th></tr>' + rows + '</table></div>' +
    '<div class="card form"><h3 style="margin:4px 0">⏱️ 每日学习时间上限</h3><div class="sub">到时间后会出现休息提示；设置了 PIN 时需要 PIN 才能继续。0 = 不限制。</div><label>分钟</label><input id="plim" type="number" min="0" max="600" value="' + (S.parent.limit || 0) + '">' +
    '<h3 style="margin:16px 0 4px">🔒 家长 PIN</h3><div class="sub">保护家长中心和时间限制。留空 = 不设 PIN。</div><label>新 PIN（4–8 位数字）</label><input id="ppin" type="password" inputmode="numeric" maxlength="8" placeholder="' + (S.parent.pin ? '已设置，输入新的可修改' : '未设置') + '">' +
    '<button class="btn block" id="psave" style="margin-top:12px">保存设置</button>' + (S.parent.pin ? '<button class="btn block ghost" id="pclear" style="margin-top:10px">清除 PIN</button>' : '') + '</div>' +
    '<div class="card form"><h3 style="margin:4px 0">💾 导出 / 导入进度</h3><div class="sub">进度只保存在当前浏览器。换设备或清理浏览器前，请先导出备份。</div>' +
    '<button class="btn block blue" id="pexp" style="margin-top:10px">导出进度文件</button><label>导入（选择导出的 .json 文件）</label><input type="file" id="pimp" accept=".json,application/json">' +
    '<label>或粘贴备份文本</label><textarea id="ptxt" style="width:100%;height:70px;border:2px solid var(--line);border-radius:12px;font-size:12px"></textarea><button class="btn block ghost" id="pimp2" style="margin-top:8px">从文本导入</button></div>' +
    '<div class="card"><h3 style="margin:4px 0">⚠️ 重置</h3><button class="btn red block" id="preset">清空全部学习进度</button></div>' +
    '<div class="card note">关于内容：单词、课文对话和短文转录自人教PEP《英语》六年级上册（2026 新版），版权归人民教育出版社所有；知识讲解、练习题和原创故事为本站编写，可能有疏漏，欢迎家长结合课本使用。</div></div>';
  V.innerHTML = h;
  $('#psave').onclick = function () {
    var lim = Math.max(0, parseInt($('#plim').value || '0', 10) || 0), pin = $('#ppin').value.trim();
    if (pin && !/^\d{4,8}$/.test(pin)) return toast('PIN 需要 4–8 位数字');
    S.parent.limit = lim; if (pin) S.parent.pin = pin; save(); toast('已保存'); viewParent();
  };
  var pc = $('#pclear'); if (pc) pc.onclick = function () { S.parent.pin = ''; save(); toast('已清除 PIN'); viewParent(); };
  $('#pexp').onclick = function () {
    var data = JSON.stringify({ app: 'english6', exported: new Date().toISOString(), state: S });
    try { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' })); a.download = 'english6-progress-' + today() + '.json'; document.body.appendChild(a); a.click(); a.remove(); } catch (e) { }
    $('#ptxt').value = data; toast('已导出（下方文本框也有一份，可复制保存）');
  };
  function doImport(txt) { try { var o = JSON.parse(txt); var st = o.state || o; if (!st || typeof st.xp !== 'number') throw 0; var d = defState(); S = merge(d, st); save(); toast('导入成功！'); render(); } catch (e) { toast('文件格式不对，导入失败'); } }
  $('#pimp').onchange = function () { var f = this.files[0]; if (!f) return; var r = new FileReader(); r.onload = function () { doImport(r.result); }; r.readAsText(f); };
  $('#pimp2').onclick = function () { doImport($('#ptxt').value); };
  $('#preset').onclick = function () { if (confirm('确定清空全部学习进度吗？此操作不能撤销。')) { var p = S.parent; S = defState(); S.parent = p; save(); toast('已清空'); render(); } };
}

/* ---------------- lesson intro (知识讲解) ---------------- */
function viewLessonIntro(l) {
  var u = l._u, ws = (l.words || []).map(function (n) { return u.words.filter(function (w) { return w.w === n; })[0]; }).filter(Boolean);
  var p = l.passage && PASSAGES[l.passage];
  var h = '<div class="lesson"><div class="inner"><div class="ltop"><button class="x" id="lx">✕</button><div class="grow"><b>' + esc(l.title) + '</b><div class="sub">' + (u.isExtra ? u.zh : (u.isRevision ? 'Revision' : 'Unit ' + u.no + ' ' + u.title)) + (l.page ? ' · 课本 p.' + l.page : '') + '</div></div></div>' +
    '<div class="lbody explain"><div class="row"><h2 class="grow" style="margin:6px 0">📘 知识讲解</h2><button class="btn sm blue" id="readall">🔊 朗读讲解</button></div>';
  l.explain.forEach(function (t, i) { h += '<div class="para" data-p="' + i + '">' + esc(t) + '</div>'; });
  if (l.table) { h += '<div class="card"><table class="irr">'; l.table.forEach(function (r) { h += '<tr data-sayt="' + esc(r[0].split(' ')[0] + ', ' + r[1]) + '"><td><b>' + esc(r[0]) + '</b></td><td>→ ' + esc(r[1]) + '</td><td class="sub">' + esc(B.irregularZh[r[0].split(' ')[0]] || '') + '</td><td>🔊</td></tr>'; }); h += '</table></div>'; }
  if (l.key && l.key.length) {
    h += '<h3>🗣️ 重点句型</h3><div class="keys">';
    l.key.forEach(function (k) { var zh = ''; if (p) p.lines.forEach(function (x) { if (x[1] === k) zh = x[2]; }); if (!zh) u.passages.forEach(function (pp) { pp.lines.forEach(function (x) { if (!zh && x[1] === k) zh = x[2]; }); });
      h += '<div class="k"><button class="ibtn" data-sayt="' + esc(k) + '">🔊</button><div><div class="en">' + esc(k) + '</div>' + (zh ? '<div class="zh">' + esc(zh) + '</div>' : '') + '</div></div>'; });
    h += '</div>';
  }
  if (ws.length) { h += '<h3>🔤 本课单词</h3><div class="wordchips">'; ws.forEach(function (w) { h += '<div class="wchip" data-sayt="' + esc(w.w) + '"><b>' + esc(w.w) + '</b> <small>' + esc(w.ph) + '</small><br><small>' + esc(w.zh) + '</small>' + (w.req ? ' <span class="pill req">会用</span>' : '') + '</div>'; }); h += '</div>'; }
  if (p) h += '<div class="card click row" style="margin-top:16px" data-href="#/p/' + p.id + '"><span style="font-size:28px">🎧</span><div class="grow"><b>课文听读：' + esc(p.title) + '</b><div class="sub">' + esc(p.kind) + ' · ' + p.lines.length + ' 句 · 可跟读</div></div><span>›</span></div>';
  h += '</div><div class="lfoot"><div class="fb"><b style="color:var(--ink);font-size:15px">' + pickLessonQs(l).length + ' 道练习 · 题库 ' + l.questions.length + ' 题</b><div class="exp">答对才前进，答错的题稍后再出现</div></div><button class="btn" id="lgo">开始练习</button></div></div></div>';
  $('#overlay').innerHTML = h;
  var ov = $('#overlay');
  $('#lx', ov).onclick = function () { TTS.stop(); closeLesson(); };
  $$('[data-sayt]', ov).forEach(function (el) { el.onclick = function () { speakEn(el.getAttribute('data-sayt')); }; });
  $$('[data-href]', ov).forEach(function (el) { el.onclick = function () { TTS.stop(); location.hash = el.getAttribute('data-href'); }; });
  var paras = $$('.para', ov);
  function readFrom(i) { if (i >= paras.length) { paras.forEach(function (x) { x.classList.remove('speaking'); }); return; } var my = TTS.token + 1; paras.forEach(function (x, j) { x.classList.toggle('speaking', j === i); }); TTS.mixed(l.explain[i]).then(function (ok) { if (ok && TTS.token === my) readFrom(i + 1); else paras[i] && paras[i].classList.remove('speaking'); }); }
  paras.forEach(function (pp, i) { pp.onclick = function () { readFrom(i); }; });
  $('#readall', ov).onclick = function () { readFrom(0); };
  $('#lgo', ov).onclick = function () { TTS.stop(); startSession({ mode: 'lesson', title: l.title, questions: pickLessonQs(l), lessonId: l.id }); };
  if (S.settings.autoExplain) setTimeout(function () { if ($('#readall', ov)) readFrom(0); }, 300);
}
function pickLessonQs(l) {
  var hand = l.questions.filter(function (q) { return !q.auto; }), auto = shuffle(l.questions.filter(function (q) { return q.auto; }));
  var n = Math.max(10, hand.length); var out = hand.concat(auto.slice(0, Math.max(0, n - hand.length)));
  if (!hand.length) out = auto.slice(0, 12);
  return shuffle(out);
}
function closeLesson(silent) { $('#overlay').innerHTML = ''; document.body.style.overflow = ''; session = null; if (!silent && /^#\/(lesson|challenge)/.test(location.hash)) { if (history.length > 1) history.back(); else location.hash = '#/'; } }

/* ---------------- practice session ---------------- */
var session = null;
var TYPE_LABEL = { choice: '选择题', listen: '听力题', fill: '填空题', order: '连词成句', match: '配对题' };
function startSession(o) {
  regen();
  if ((o.mode === 'lesson') && S.hearts <= 0) {
    modal('<div class="e">💔</div><h2>爱心用完了</h2><p class="sub">去错题本复习一轮可以恢复 1 颗爱心；或者等 30 分钟自动恢复。</p><button class="btn block" id="m1">去错题本</button><button class="btn block ghost" id="m2" style="margin-top:10px">好的</button>', function (m, close) { $('#m1', m).onclick = function () { close(); $('#overlay').innerHTML = ''; location.hash = '#/review'; }; $('#m2', m).onclick = close; });
    return;
  }
  session = { o: o, queue: o.questions.map(function (q) { return q; }), total: o.questions.length, correct: 0, mistakes: 0, wrongSet: {}, combo: 0, maxCombo: 0, xp: 0, t0: Date.now(), firstTry: 0 };
  renderQ();
}
function renderQ() {
  var s = session; if (!s) return;
  if (!s.queue.length) return finishSession();
  var q = s.queue[0]; s.cur = q; s.answer = null; s.state = 'ask';
  var pct = Math.round(s.correct * 100 / s.total);
  var h = '<div class="lesson"><div class="inner"><div class="ltop"><button class="x" id="qx">✕</button><div class="bar"><i style="width:' + pct + '%"></i></div>' +
    (s.o.mode === 'lesson' ? '<span class="hearts">❤️ ' + S.hearts + '</span>' : s.o.mode === 'challenge' ? '<span class="hearts">✖ ' + s.mistakes + '/' + s.o.maxMistakes + '</span>' : '<span class="hearts" style="color:var(--b)">' + (s.o.mode === 'review' ? '🔁' : '📖') + '</span>') + '</div>' +
    '<div class="lbody"><div class="qtype">' + (s.wrongSet[q._key || q.q] ? '🔄 再试一次 · ' : '') + TYPE_LABEL[q.t] + '</div>';
  if (q.t === 'listen') {
    h += '<h2>' + esc(q.q) + '</h2><div class="prompt"><button class="spk" id="sp1">🔊</button><button class="spk slow" id="sp2" title="慢速">🐢</button></div>' + optsHtml(q);
  } else if (q.t === 'choice') {
    h += '<h2>' + (q.say ? '<button class="ibtn" id="sp1" style="vertical-align:middle;margin-right:6px">🔊</button>' : '') + esc(q.q) + '</h2>' + optsHtml(q);
  } else if (q.t === 'fill') {
    h += '<h2>' + esc(q.q) + '</h2>' + (q.hint ? '<div class="sub">' + esc(q.hint) + '</div>' : '') + '<input class="ans" id="fin" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="在这里输入英文">';
  } else if (q.t === 'order') {
    var toks = q.a.split(' '); s.tiles = shuffle(toks.map(function (t, i) { return { t: t, i: i }; })); s.picked = [];
    if (s.tiles.map(function (x) { return x.t; }).join(' ') === q.a && toks.length > 1) s.tiles.reverse();
    h += '<h2>' + esc(q.q) + '</h2>' + (q.say ? '<div class="prompt"><button class="spk slow" id="sp1">🔊</button><span class="sub">听一听</span></div>' : '') + '<div class="tiles" id="ansline"></div><div class="tiles" id="bank" style="border:0"></div>';
  } else if (q.t === 'match') {
    s.left = q.pairs.map(function (p, i) { return { t: p[0], i: i }; }); s.right = shuffle(q.pairs.map(function (p, i) { return { t: p[1], i: i }; })); s.sel = null; s.matched = 0; s.matchErr = false;
    h += '<h2>' + esc(q.q) + '</h2><div class="match">';
    for (var i = 0; i < s.left.length; i++) h += '<button class="opt" data-l="' + s.left[i].i + '">' + esc(s.left[i].t) + '</button><button class="opt" data-r="' + s.right[i].i + '">' + esc(s.right[i].t) + '</button>';
    h += '</div>';
  }
  h += '</div><div class="lfoot" id="foot"><div class="fb" id="fb"></div><button class="btn gray" id="chk" disabled>检查</button></div></div></div>';
  $('#overlay').innerHTML = h; document.body.style.overflow = 'hidden';
  var ov = $('#overlay');
  $('#qx', ov).onclick = function () { if (confirm('确定退出吗？本次练习进度不会保存。')) { TTS.stop(); closeLesson(); } };
  var chk = $('#chk', ov);
  function ready(v) { chk.disabled = !v; chk.className = 'btn' + (v ? '' : ' gray'); }
  if (q.t === 'listen') { $('#sp1', ov).onclick = function () { speakEn(q.say); }; $('#sp2', ov).onclick = function () { TTS.one(q.say, 'en-US', 0.6); }; setTimeout(function () { speakEn(q.say); }, 250); }
  if (q.t === 'choice' && q.say) { $('#sp1', ov).onclick = function () { speakEn(q.say); }; setTimeout(function () { speakEn(q.say); }, 250); }
  if (q.t === 'order' && q.say) { $('#sp1', ov).onclick = function () { speakEn(q.say); }; }
  if (q.t === 'choice' || q.t === 'listen') {
    $$('.opt', ov).forEach(function (b) { b.onclick = function () { if (s.state !== 'ask') return; $$('.opt', ov).forEach(function (x) { x.classList.remove('sel'); }); b.classList.add('sel'); s.answer = +b.getAttribute('data-o'); ready(true); if (/^[A-Za-z]/.test(q.opts[s.answer]) && q.t === 'listen') { } }; });
  }
  if (q.t === 'fill') { var fi = $('#fin', ov); setTimeout(function () { try { fi.focus(); } catch (e) { } }, 50); fi.oninput = function () { s.answer = fi.value; ready(fi.value.trim().length > 0); }; fi.onkeydown = function (e) { if (e.key === 'Enter' && fi.value.trim()) { e.preventDefault(); chk.click(); } }; }
  if (q.t === 'order') {
    var drawTiles = function () {
      $('#ansline', ov).innerHTML = s.picked.map(function (x, k) { return '<button class="tile" data-k="' + k + '">' + esc(x.t) + '</button>'; }).join('');
      $('#bank', ov).innerHTML = s.tiles.map(function (x, k) { return '<button class="tile' + (s.picked.indexOf(x) >= 0 ? ' used' : '') + '" data-b="' + k + '">' + esc(x.t) + '</button>'; }).join('');
      $$('[data-k]', ov).forEach(function (b) { b.onclick = function () { if (s.state !== 'ask') return; s.picked.splice(+b.getAttribute('data-k'), 1); drawTiles(); }; });
      $$('[data-b]', ov).forEach(function (b) { b.onclick = function () { if (s.state !== 'ask') return; var x = s.tiles[+b.getAttribute('data-b')]; s.picked.push(x); if (/^[A-Za-z]/.test(x.t)) TTS.one(x.t.replace(/[^A-Za-z' -]/g, ''), 'en-US'); drawTiles(); }; });
      s.answer = s.picked.map(function (x) { return x.t; }).join(' '); ready(s.picked.length === s.tiles.length);
    };
    drawTiles();
  }
  if (q.t === 'match') {
    $$('.match .opt', ov).forEach(function (b) {
      b.onclick = function () {
        if (s.state !== 'ask' || b.classList.contains('done')) return;
        var isL = b.hasAttribute('data-l');
        if (isL) { $$('[data-l]', ov).forEach(function (x) { x.classList.remove('sel'); }); b.classList.add('sel'); s.sel = b; if (/^[A-Za-z]/.test(b.textContent)) speakEn(b.textContent); return; }
        if (!s.sel) { b.classList.add('shake'); setTimeout(function () { b.classList.remove('shake'); }, 400); return; }
        if (s.sel.getAttribute('data-l') === b.getAttribute('data-r')) { s.sel.classList.remove('sel'); s.sel.classList.add('done'); b.classList.add('done'); s.sel = null; s.matched++; sfx.good(); if (s.matched === s.left.length) { s.answer = !s.matchErr; ready(true); chk.click(); } }
        else { s.matchErr = true; sfx.bad(); b.classList.add('bad', 'shake'); var l = s.sel; l.classList.add('bad'); setTimeout(function () { b.classList.remove('bad', 'shake'); l.classList.remove('bad'); }, 500); }
      };
    });
  }
  chk.onclick = function () { if (s.state === 'ask') { if (!chk.disabled) check(); } else next(); };
  document.onkeydown = function (e) {
    if (!session || !$('#chk')) return;
    if (e.key === 'Enter' && !(q.t === 'fill' && s.state === 'ask')) { e.preventDefault(); $('#chk').click(); }
    if ((q.t === 'choice' || q.t === 'listen') && s.state === 'ask' && /^[1-4]$/.test(e.key)) { var b = $$('.opt', $('#overlay'))[+e.key - 1]; if (b) b.click(); }
  };
}
function optsHtml(q) { return '<div class="opts">' + q.opts.map(function (o, i) { return '<button class="opt" data-o="' + i + '"><span class="k">' + (i + 1) + '</span><span>' + esc(o) + '</span></button>'; }).join('') + '</div>'; }
function isRight(q, ans) {
  if (q.t === 'choice' || q.t === 'listen') return ans === q.a;
  if (q.t === 'fill') { var a = norm(ans); return [q.a].concat(q.alts || []).some(function (x) { return norm(x) === a; }); }
  if (q.t === 'order') return norm(ans) === norm(q.a);
  if (q.t === 'match') return ans === true;
  return false;
}
function rightText(q) { if (q.t === 'choice' || q.t === 'listen') return q.opts[q.a]; if (q.t === 'match') return ''; return q.a; }
function check() {
  var s = session, q = s.cur, ok = isRight(q, s.answer), ov = $('#overlay');
  s.state = 'shown';
  var key = q._key || q.q;
  if (q.t === 'choice' || q.t === 'listen') $$('.opt', ov).forEach(function (b) { var i = +b.getAttribute('data-o'); if (i === q.a) b.classList.add('good'); else if (i === s.answer) b.classList.add('bad'); });
  var foot = $('#foot', ov), fb = $('#fb', ov), chk = $('#chk', ov);
  if (ok) {
    sfx.good(); s.correct++; s.combo++; s.maxCombo = Math.max(s.maxCombo, s.combo); if (!s.wrongSet[key]) s.firstTry++;
    if (s.o.mode === 'review') { var w = S.wrong[key]; if (w && !s.wrongSet[key]) { w.box++; w.due = Date.now() + BOXDAYS[Math.min(w.box, 5)] * 86400000; } S.stats.reviewed++; bump('reviews'); s.xp += 2; }
    if (s.combo >= 3) s.xp += 1;
    if (s.combo === 3 || s.combo === 5 || s.combo === 10 || (s.combo > 10 && s.combo % 5 === 0)) { var c = document.createElement('div'); c.className = 'combo'; c.textContent = '🔥 连击 ×' + s.combo + '！'; document.body.appendChild(c); setTimeout(function () { c.remove(); }, 1000); }
    D().combo = Math.max(D().combo || 0, s.combo); S.stats.maxCombo = Math.max(S.stats.maxCombo, s.combo);
    foot.className = 'lfoot good'; fb.innerHTML = '<b>' + ['太棒了！', '答对了！', 'Great!', '真厉害！', 'Excellent!'][Math.floor(Math.random() * 5)] + '</b><div class="exp">' + esc(q.exp) + '</div>';
    chk.className = 'btn'; chk.textContent = '继续';
    s.queue.shift();
    var bar = $('.ltop .bar i', ov); if (bar) bar.style.width = Math.round(s.correct * 100 / s.total) + '%';
  } else {
    sfx.bad(); s.combo = 0; s.mistakes++; s.wrongSet[key] = 1;
    if (s.o.mode === 'lesson') { S.hearts = Math.max(0, S.hearts - 1); if (S.hearts < MAXH && S.hearts === MAXH - 1) S.heartTs = Date.now(); var hs = $('.hearts', ov); if (hs) hs.textContent = '❤️ ' + S.hearts; }
    if (s.o.mode !== 'review' || !S.wrong[key]) addWrong(q); else { S.wrong[key].box = 0; S.wrong[key].n++; S.wrong[key].due = Date.now() + 10 * 60 * 1000; }
    if (s.o.mode === 'challenge') { var hs2 = $('.hearts', ov); if (hs2) hs2.textContent = '✖ ' + s.mistakes + '/' + s.o.maxMistakes; }
    var rt = rightText(q);
    foot.className = 'lfoot bad'; fb.innerHTML = '<b>' + (rt ? '正确答案：' + esc(rt) : '有配错的地方') + '</b><div class="exp">' + esc(q.exp) + '</div>';
    chk.className = 'btn red'; chk.textContent = '知道了';
    var qq = s.queue.shift(); s.queue.splice(Math.min(s.queue.length, 2 + Math.floor(Math.random() * 3)), 0, qq);
    var lb = $('.lbody', ov); if (lb) { lb.classList.add('shake'); setTimeout(function () { lb.classList.remove('shake'); }, 400); }
  }
  save(); renderTop();
  var sayIt = (q.t === 'order' || q.t === 'fill') ? q.a : (q.t === 'listen' ? q.say : (q.t === 'choice' && /^[A-Za-z]/.test(rightText(q)) ? rightText(q) : null));
  if (sayIt && typeof sayIt === 'string') setTimeout(function () { speakEn(sayIt); }, 200);
  var ex = document.createElement('button'); ex.className = 'ibtn'; ex.textContent = '🔊'; ex.title = '朗读解析'; ex.onclick = function () { TTS.mixed(q.exp); }; fb.appendChild(ex);
  if (s.o.mode === 'lesson' && S.hearts <= 0 && !ok) { chk.textContent = '爱心用完了'; chk.onclick = function () { TTS.stop(); closeLesson(); setTimeout(function () { startSession({ mode: 'lesson', questions: [] }); }, 50); }; }
  if (s.o.mode === 'challenge' && s.mistakes > s.o.maxMistakes) { chk.textContent = '查看结果'; chk.onclick = function () { finishSession(true); }; }
}
function next() { renderQ(); }
function finishSession(failed) {
  var s = session; if (!s) return; document.onkeydown = null;
  var o = s.o, acc = Math.round(s.firstTry * 100 / Math.max(1, s.total)), secs = Math.round((Date.now() - s.t0) / 1000), perfect = s.mistakes === 0;
  var title = '练习完成！', big = '🎉', extra = '';
  if (o.mode === 'lesson') {
    var st = S.lessons[o.lessonId] = S.lessons[o.lessonId] || {};
    var stars = perfect ? 3 : s.mistakes <= 2 ? 2 : 1;
    var firstDone = !st.done; st.done = true; st.stars = Math.max(st.stars || 0, stars); st.best = Math.max(st.best || 0, acc); st.times = (st.times || 0) + 1; st.last = Date.now();
    s.xp += 10 + (perfect ? 5 : 0) + (firstDone ? 5 : 0); S.stats.lessons++; bump('lessons'); if (perfect) { S.stats.perfect++; bump('perfect'); }
    title = perfect ? '完美！全部一次答对！' : '小课完成！'; big = perfect ? '🏆' : '🎉';
  } else if (o.mode === 'challenge') {
    var pass = !failed && s.mistakes <= o.maxMistakes; var cs = S.chal[o.unitId] = S.chal[o.unitId] || {}; bump('chal'); S.stats.chal++;
    if (pass) { var cst = s.mistakes <= 1 ? 3 : s.mistakes <= 2 ? 2 : 1; cs.pass = true; cs.stars = Math.max(cs.stars || 0, cst); cs.best = Math.max(cs.best || 0, acc); s.xp += 20 + cst * 5; title = '挑战成功！'; big = '👑'; }
    else { title = '差一点点！'; big = '💪'; extra = '<p class="sub">错了 ' + s.mistakes + ' 次，超过了 ' + o.maxMistakes + ' 次。错题已收进错题本，复习后再来挑战！</p>'; s.xp += 5; }
  } else if (o.mode === 'review') {
    S.hearts = Math.min(MAXH, S.hearts + 1); title = '复习完成！'; big = '🔁'; extra = '<p class="sub">❤️ 恢复 1 颗爱心</p>';
  } else if (o.mode === 'story') {
    var first = !S.stories[o.storyId]; S.stories[o.storyId] = { best: Math.max((S.stories[o.storyId] || {}).best || 0, acc), t: Date.now() }; bump('stories'); s.xp += first ? 10 : 3; title = '故事读完啦！'; big = '📖';
  } else if (o.mode === 'words') { bump('wordp'); s.xp += 8; title = '单词练习完成！'; big = '🔤'; }
  addXP(s.xp);
  sfx.win(); if (big !== '💪') confetti();
  var h = '<div class="lesson"><div class="inner"><div class="lbody result"><div class="big">' + big + '</div><h2>' + title + '</h2>' + extra +
    '<div class="rstats"><div class="rstat"><small>经验</small><b>+' + s.xp + '</b></div><div class="rstat g"><small>一次答对率</small><b>' + acc + '%</b></div><div class="rstat b"><small>用时</small><b>' + Math.floor(secs / 60) + ':' + pad(secs % 60) + '</b></div></div>' +
    (s.maxCombo >= 3 ? '<p class="sub">最高连击 🔥 ' + s.maxCombo + '</p>' : '') + (s.mistakes ? '<p class="sub">答错的 ' + Object.keys(s.wrongSet).length + ' 道题已收入错题本 🔁</p>' : '') + '</div>' +
    '<div class="lfoot"><button class="btn ghost" id="again">再练一次</button><button class="btn" id="cont">继续</button></div></div></div>';
  $('#overlay').innerHTML = h;
  $('#cont').onclick = function () { closeLesson(); if (o.mode === 'review') render(); };
  $('#again').onclick = function () { var oo = o; session = null; if (oo.mode === 'lesson') startSession({ mode: 'lesson', title: oo.title, questions: pickLessonQs(LESSONS[oo.lessonId]), lessonId: oo.lessonId }); else if (oo.mode === 'challenge') startChallenge(oo.unitId); else if (oo.mode === 'words') startWordPractice(oo.unitId); else startSession(oo); };
  session = null; checkAch();
}
function startChallenge(uid) {
  var u = UNITS.filter(function (x) { return x.id === uid; })[0]; if (!u) return;
  var pool = []; u.lessons.forEach(function (l) { pool = pool.concat(l.questions); });
  var hand = shuffle(pool.filter(function (q) { return !q.auto; })).slice(0, 10), auto = shuffle(pool.filter(function (q) { return q.auto && q.t !== 'match'; })).slice(0, 5);
  startSession({ mode: 'challenge', title: u.title + ' 单元挑战', questions: shuffle(hand.concat(auto)), unitId: uid, maxMistakes: 3 });
}
function startWordPractice(uid) {
  var u = UNITS.filter(function (x) { return x.id === uid; })[0]; if (!u || !u.words.length) return;
  var ws = shuffle(u.words.filter(function (w) { return w.w !== 'was'; })).slice(0, 10), qs = [];
  ws.forEach(function (w, i) {
    var others = shuffle(u.words.filter(function (x) { return x.w !== w.w && x.zh !== w.zh; })).slice(0, 2);
    var kind = i % 3;
    if (kind === 0) { var o1 = shuffle([w.zh].concat(others.map(function (x) { return x.zh; }))); qs.push({ t: 'choice', q: '“' + w.w + '” 的意思是？', say: w.w, opts: o1, a: o1.indexOf(w.zh), exp: w.w + ' ' + w.ph + '：' + w.zh}); }
    else if (kind === 1) { var o2 = shuffle([w.w].concat(others.map(function (x) { return x.w; }))); qs.push({ t: 'listen', q: '听一听，选出你听到的单词', say: w.w, opts: o2, a: o2.indexOf(w.w), exp: w.w + ' ' + w.ph + '：' + w.zh }); }
    else if (w.req && !w.proper) qs.push({ t: 'fill', q: '根据中文写出单词：' + w.zh + '（首字母 ' + w.w[0] + '）', a: w.w, exp: w.w + ' ' + w.ph + '：' + w.zh });
    else { var o3 = shuffle([w.w].concat(others.map(function (x) { return x.w; }))); qs.push({ t: 'choice', q: '“' + w.zh + '” 用英语怎么说？', opts: o3, a: o3.indexOf(w.w), exp: w.w + ' ' + w.ph + '：' + w.zh }); }
  });
  startSession({ mode: 'words', title: '单词练习', questions: qs, unitId: uid });
}

/* ---------------- router ---------------- */
function render() {
  TTS.stop(); renderNav(); renderTop();
  var r = (location.hash || '#/').slice(1).split('/').filter(Boolean);
  if (r[0] !== 'lesson' && r[0] !== 'challenge') { if (!session) $('#overlay').innerHTML = ''; document.body.style.overflow = ''; }
  window.scrollTo(0, 0);
  switch (r[0]) {
    case undefined: viewHome(); break;
    case 'read': readerList(r[1], 'read'); break;
    case 'stories': readerList(r[1], 'stories'); break;
    case 'p': if (PASSAGES[r[1]]) viewReader(PASSAGES[r[1]], false); else viewHome(); break;
    case 's': if (STORIES[r[1]]) viewReader(STORIES[r[1]], true); else viewHome(); break;
    case 'words': viewWords(r[1], r[2]); break;
    case 'review': viewReview(); break;
    case 'me': viewMe(); break;
    case 'parent': viewParent(); break;
    case 'lesson': if (V.innerHTML === '') viewHome(); if (LESSONS[r[1]]) viewLessonIntro(LESSONS[r[1]]); else viewHome(); break;
    case 'challenge': if (V.innerHTML === '') viewHome(); startChallenge(r[1]); break;
    default: viewHome();
  }
  bindHrefs(V);
  checkLimit();
}
function bindHrefs(root) {
  $$('[data-href]', root).forEach(function (el) { el.onclick = function () { location.hash = el.getAttribute('data-href'); }; });
  $$('[data-act="wordp"]', root).forEach(function (el) { el.onclick = function () { startWordPractice(el.getAttribute('data-u')); }; });
}
window.addEventListener('hashchange', function () { if (session && !/^#\/(lesson|challenge)/.test(location.hash)) { session = null; } render(); });
document.addEventListener('visibilitychange', function () { lastTick = Date.now(); });
touchStreakSoft();
function touchStreakSoft() { regen(); save(); }
checkAch(true);
render();
window.__E6 = { sess: function () { return session; }, S: function () { return S; }, B: B, LESSONS: LESSONS, startSession: startSession };
})();
