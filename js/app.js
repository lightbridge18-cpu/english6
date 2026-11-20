/* 六上英语闯关站 v3 — Duolingo-style learning app (plain JS, no build step needed) */
(function () {
'use strict';

/* ================= utils ================= */
function $(s, el) { return (el || document).querySelector(s); }
function $$(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function shuffle(a, rnd) { rnd = rnd || Math.random; a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function pick(a, rnd) { return a[Math.floor((rnd || Math.random)() * a.length)]; }
function pad(n) { return (n < 10 ? '0' : '') + n; }
function dstr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function today() { return dstr(new Date()); }
function dayOffset(n, from) { var d = from ? new Date(from + 'T00:00:00') : new Date(); d.setDate(d.getDate() + n); return dstr(d); }
function daysBetween(a, b) { return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000); }
function hashStr(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function toast(msg, ms) { var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(function () { t.remove(); }, ms || 2200); }
function norm(s) { return String(s).toLowerCase().replace(/[’‘`]/g, "'").replace(/[“”]/g, '"').replace(/[^a-z0-9'\s-]/g, ' ').replace(/\s+/g, ' ').trim(); }
function words(s) { return norm(s).split(' ').filter(Boolean); }
function zhNorm(s) { return String(s).replace(/[\s，。！？、；：,.!?;:“”"'‘’（）()…—\-]/g, ''); }
function shortZh(z) { return String(z || '').replace(/（[^）]*）|\([^)]*\)/g, '').split(/[；;，,]/)[0].trim() || String(z || ''); }
function vibrate(p) { try { if (S && S.settings.haptics !== false && navigator.vibrate) navigator.vibrate(p); } catch (e) { } }
function fmtTime(sec) { return Math.floor(sec / 60) + ':' + pad(sec % 60); }
/* audio clip key — MUST match tools/audio_inventory.js + tools/gen_audio.py */
function akey(t) { return String(t).replace(/\/[^\/\s][^\/]*\//g, ' ').replace(/[’‘`]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().replace(/^[\s.,;:"'(]+|[\s.,;:"')]+$/g, '').toLowerCase(); }
function ahash(t) { var s = akey(t), h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ('0000000' + (h >>> 0).toString(16)).slice(-8); }
function mondayOf(dstrv) { var d = new Date((dstrv || today()) + 'T00:00:00'); var w = (d.getDay() + 6) % 7; d.setDate(d.getDate() - w); return dstr(d); }

/* ================= state (global learner + per-book progress) ================= */
var KEY = 'e6.v3', OLDKEY = 'e6.v2';
function defBook() { return { lessons: {}, chal: {}, wrong: {}, read: {}, stories: {}, chests: {}, tested: {}, readDay: null, focus: '', mocks: [], dictWrong: {}, scenes: {} }; }
function defState() {
  return {
    v: 3, xp: 0, gems: 100, hearts: 5, heartTs: Date.now(), streak: 0, bestStreak: 0, lastDay: null, days: {}, ach: {}, claimed: {}, wordp: 0,
    goal: 0, course: 'book', books: {}, freezes: 0, freezeDays: {}, owned: {}, outfit: '', theme: '', boostUntil: 0, badges: {},
    league: { week: '', tier: 0, result: null, best: 0 }, offUntil: { listen: 0, speak: 0 }, streakShown: '', name: '',
    settings: { rate: 0.9, zh: true, sfx: true, accent: 'us', autoExplain: false, haptics: true, eye: 20, dictZh: true },
    parent: { pin: '', limit: 0, extra: {}, unlockAll: false },
    stats: { lessons: 0, perfect: 0, maxCombo: 0, reviewed: 0, shadow: 0, reads: 0, chal: 0, chests: 0, spoken: 0, listened: 0, quests: 0, promos: 0, buys: 0, goalDays: 0 },
    unlock: ''
  };
}
var S;
function merge(a, b) { for (var k in b) { if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') merge(a[k], b[k]); else a[k] = b[k]; } return a; }
/* v2 → v3: v2 kept lessons/chal/wrong/read/stories at top level for the single book; move them under books.book */
function migrate(st) {
  if (!st) return st;
  if (!st.v || st.v < 3) {
    var bk = defBook();
    ['lessons', 'chal', 'wrong', 'read', 'stories', 'readDay'].forEach(function (k) { if (st[k] != null) { bk[k] = st[k]; delete st[k]; } });
    st.books = st.books || {}; st.books.book = merge(defBook(), bk);
    st.v = 3; st.migratedFrom = 2;
    if (st.gems == null) st.gems = 100 + Math.min(400, Object.keys(bk.lessons || {}).length * 10);
  }
  /* v3.3: per-book focus unit / mock history / dictation misses; eye-care + dictation settings */
  if (st.books) for (var b in st.books) { var x = st.books[b] || (st.books[b] = {}); if (x.focus == null) x.focus = ''; if (!Array.isArray(x.mocks)) x.mocks = []; if (!x.dictWrong || typeof x.dictWrong !== 'object') x.dictWrong = {}; if (!x.scenes || typeof x.scenes !== 'object') x.scenes = {}; }
  st.settings = st.settings || {}; if (st.settings.eye == null) st.settings.eye = 20; if (st.settings.dictZh == null) st.settings.dictZh = true;
  /* v3.4: per-book scene progress (books.*.scenes), scene subtitle toggle */
  if (st.settings.sceneZh == null) st.settings.sceneZh = true;
  return st;
}
function load() {
  var d = defState(), raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) { }
  try {
    if (raw) merge(d, migrate(JSON.parse(raw)));
    else { var old = localStorage.getItem(OLDKEY); if (old) merge(d, migrate(JSON.parse(old))); }
  } catch (e) { }
  S = d;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } }
load();
function P() { var b = S.books[S.course]; if (!b) b = S.books[S.course] = defBook(); for (var k in defBook()) if (b[k] === undefined) b[k] = defBook()[k]; return b; }
function D(d) { d = d || today(); if (!S.days[d]) S.days[d] = { xp: 0, lessons: 0, reviews: 0, reads: 0, stories: 0, sec: 0, combo: 0, perfect: 0, shadow: 0, chal: 0, wordp: 0, listenQ: 0, speakQ: 0, correct: 0, chests: 0, mins: 0 }; return S.days[d]; }
function bump(field, n) { D()[field] = (D()[field] || 0) + (n || 1); save(); }

/* ================= sound (WebAudio, generated) ================= */
var actx = null;
function ac() { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); return actx; } catch (e) { return null; } }
function note(f, t, dur, type, vol, glideTo) {
  var a = ac(); if (!a) return; var t0 = a.currentTime + t;
  var o = a.createOscillator(), g = a.createGain(); o.type = type || 'sine'; o.frequency.setValueAtTime(f, t0);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
  o.connect(g); g.connect(a.destination);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol || 0.16, t0 + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.start(t0); o.stop(t0 + dur + 0.03);
}
var sfx = {
  on: function () { return S.settings.sfx !== false; },
  tap: function () { if (this.on()) note(520, 0, 0.05, 'triangle', 0.06); },
  good: function () { if (!this.on()) return; note(880, 0, 0.12, 'sine', 0.16); note(1318.5, 0.09, 0.25, 'sine', 0.16); note(1760, 0.09, 0.18, 'triangle', 0.04); },
  bad: function () { if (!this.on()) return; note(196, 0, 0.22, 'sawtooth', 0.09, 150); note(147, 0.12, 0.25, 'square', 0.06, 110); },
  combo: function (n) { if (!this.on()) return; var base = 660 + Math.min(10, n) * 30; [0, 4, 7, 12].forEach(function (s, i) { note(base * Math.pow(2, s / 12), i * 0.06, 0.12, 'triangle', 0.1); }); },
  win: function () { if (!this.on()) return; [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) { note(f, i * 0.12, 0.2, 'triangle', 0.14); }); [523.25, 659.25, 783.99, 1046.5].forEach(function (f) { note(f, 0.55, 0.7, 'sine', 0.07); }); note(1568, 0.6, 0.6, 'sine', 0.05); },
  chest: function () { if (!this.on()) return; for (var i = 0; i < 6; i++) note(1200 + i * 220, i * 0.05, 0.12, 'sine', 0.08); },
  streak: function () { if (!this.on()) return; note(300, 0, 0.5, 'sawtooth', 0.05, 900); [784, 988, 1175].forEach(function (f, i) { note(f, 0.35 + i * 0.1, 0.25, 'triangle', 0.12); }); },
  buy: function () { if (!this.on()) return; note(988, 0, 0.08, 'square', 0.06); note(1319, 0.08, 0.2, 'square', 0.06); }
};

/* ================= TTS ================= */
var TTS = {
  ok: 'speechSynthesis' in window, voices: [], token: 0,
  init: function () { if (!this.ok) return; var self = this; var f = function () { try { self.voices = speechSynthesis.getVoices() || []; } catch (e) { } }; f(); if (speechSynthesis.addEventListener) speechSynthesis.addEventListener('voiceschanged', f); else speechSynthesis.onvoiceschanged = f; },
  // 精选英语发音：只留美音/英音里清晰柔和的女声，屏蔽系统里的怪声（Bubbles、Zarvox 等）
  BAD: /albert|bad ?news|bahh|bells|boing|bubbles|cellos|good ?news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|ralph|kathy|grandma|grandpa|eddy|flo\b|reed|rocko|sandy|shelley|hysterical|deranged|pipe|novelty|eloquence/i,
  RANK: {
    us: [/ava.*(premium|enhanced|natural|online)/i, /jenny.*(natural|online)/i, /aria.*(natural|online)/i, /emma.*(natural|online)/i, /ava/i, /samantha.*(premium|enhanced)/i, /google us english/i, /en-us-x-(sfg|iob|iog|tpc|tpf)/i, /allison/i, /samantha/i, /susan/i, /zira/i, /female/i],
    gb: [/sonia.*(natural|online)/i, /libby.*(natural|online)/i, /maisie.*(natural|online)/i, /(kate|serena|stephanie).*(premium|enhanced)/i, /google uk english female/i, /en-gb-x-(gba|gbc|gbg)/i, /serena/i, /kate/i, /stephanie/i, /martha/i, /hazel/i, /susan/i, /female/i]
  },
  MALE: /\b(guy|andrew|brian|christopher|eric|roger|steffan|ryan|thomas|daniel|arthur|oliver|alex|aaron|tom|evan|nathan|david|mark|george|male)\b|en-(us|gb)-x-(iol|iom|tpd|rjs|gbd)/i,
  norm: function (v) { return (v.lang || '').replace('_', '-').toLowerCase(); },
  best: function (acc) {
    var self = this, code = acc === 'gb' ? 'en-gb' : 'en-us';
    var c = this.voices.filter(function (v) { return self.norm(v).indexOf(code) === 0 && !self.BAD.test(v.name); });
    if (!c.length) return null;
    var r = this.RANK[acc] || this.RANK.us;
    for (var i = 0; i < r.length; i++) { var m = c.filter(function (v) { return r[i].test(v.name + ' ' + (v.voiceURI || '')); }); if (m.length) return m[0]; }
    var f = c.filter(function (v) { return !self.MALE.test(v.name + ' ' + (v.voiceURI || '')); });
    return f[0] || c[0];
  },
  pick: function (lang) {
    var vs = this.voices; if (!vs.length) return null; var self = this;
    if (lang.indexOf('en') === 0) {
      var acc = S.settings.accent === 'gb' ? 'gb' : 'us';
      var v = this.best(acc) || this.best(acc === 'gb' ? 'us' : 'gb');
      if (v) return v;
      var any = vs.filter(function (x) { return self.norm(x).indexOf('en') === 0 && !self.BAD.test(x.name); });
      return any[0] || null;
    }
    var pref = ['zh-cn', 'cmn', 'zh'];
    for (var p = 0; p < pref.length; p++) {
      var c = vs.filter(function (v) { return self.norm(v).indexOf(pref[p]) === 0; });
      if (c.length) {
        var zr = [/xiaoxiao/i, /xiaoyi/i, /xiaohan|xiaomo|xiaorui|xiaoshuang/i, /tingting.*(premium|enhanced)/i, /google.*(普通话|mandarin|中国)/i, /tingting/i, /lili|yaoyao|huihui|lanlan/i, /cmn-cn-x-(ccc|ssa)/i, /female|女/i];
        var nm = function (v) { return v.name + ' ' + (v.voiceURI || ''); };
        for (var z = 0; z < zr.length; z++) { var zm = c.filter(function (v) { return zr[z].test(nm(v)); }); if (zm.length) return zm[0]; }
        var zf = c.filter(function (v) { return !/yunxi|yunyang|yunjian|yunze|yunhao|kangkang|li-mu|liang|male|男|cmn-cn-x-(ccd|cce)/i.test(nm(v)); });
        return zf[0] || c[0];
      }
    }
    return null;
  },
  stop: function () { this.token++; this.audioStop(); if (this.ok) try { speechSynthesis.cancel(); } catch (e) { } },
  /* ---- pre-recorded mp3 (edge-tts Jenny 美音 / Sonia 英音) — falls back to speechSynthesis when a clip is missing ---- */
  au: null, afin: null, AUD: null,
  loadAudio: function () { var self = this; fetchJSON('audio/manifest.json').then(function (m) { var o = {}; ['us', 'gb'].forEach(function (a) { var set = {}; String(m[a] || '').split(' ').forEach(function (h) { if (h) set[h] = 1; }); o[a] = set; }); o.rate = m.rate || 0.9; self.AUD = o; }).catch(function () { }); },
  clip: function (text) { if (!this.AUD) return null; var acc = S.settings.accent === 'gb' ? 'gb' : 'us', h = ahash(text); return this.AUD[acc] && this.AUD[acc][h] ? 'audio/' + acc + '/' + h + '.mp3' : null; },
  audioStop: function () { if (this.au) try { this.au.pause(); } catch (e) { } var f = this.afin; this.afin = null; if (f) f(false); },
  unlock: function () { if (this.au) return; try { var a = this.au = new Audio(); a.preload = 'auto'; a.src = 'audio/silence.mp3'; var p = a.play(); if (p && p.catch) p.catch(function () { }); } catch (e) { this.au = null; } },
  playClip: function (url, text, rate, lang, res) {
    var self = this; if (!this.au) this.au = new Audio();
    var a = this.au; this.audioStop(); if (this.ok) try { speechSynthesis.cancel(); } catch (e) { }
    var done = false, started = false, tm = null;
    function fin(ok) { if (done) return; done = true; clearTimeout(tm); a.onended = a.onerror = a.onplaying = null; if (self.afin === fin) self.afin = null; res(ok); }
    this.afin = fin;
    a.onplaying = function () { started = true; };
    a.onended = function () { fin(true); };
    a.onerror = function () { if (done) return; done = true; clearTimeout(tm); if (self.afin === fin) self.afin = null; a.onended = a.onerror = null; self.speak(text, lang, rate).then(res); };
    var base = (this.AUD && this.AUD.rate) || 0.9, r = Math.max(0.5, Math.min(2, (rate || S.settings.rate || 0.9) / base));
    tm = setTimeout(function () { if (!started) { try { a.pause(); } catch (e) { } done = true; if (self.afin === fin) self.afin = null; self.speak(text, lang, rate).then(res); } else fin(true); }, 6000 + String(text).length * 160 / r);
    try {
      a.src = url; a.playbackRate = r; a.defaultPlaybackRate = r; try { a.preservesPitch = true; a.webkitPreservesPitch = true; } catch (e) { }
      var p = a.play();
      if (p && p.catch) p.catch(function (e) { if (done) return; if (e && e.name === 'AbortError') return; done = true; clearTimeout(tm); if (self.afin === fin) self.afin = null; self.speak(text, lang, rate).then(res); });
    } catch (e) { done = true; clearTimeout(tm); self.speak(text, lang, rate).then(res); }
  },
  say: function (text, lang, rate) {
    var self = this; lang = lang || 'en-US';
    if (text && lang.indexOf('en') === 0) { var url = this.clip(text); if (url) return new Promise(function (res) { self.playClip(url, text, rate, lang, res); }); }
    return this.speak(text, lang, rate);
  },
  speak: function (text, lang, rate) {
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
  mixed: function (text) {
    var self = this, my = ++this.token; var segs = this.segs(text); this.audioStop(); if (this.ok) try { speechSynthesis.cancel(); } catch (e) { }
    return segs.reduce(function (p, s) { return p.then(function () { if (my !== self.token) return; return self.say(s.t, s.l, s.l === 'en-US' ? S.settings.rate : 1.05); }); }, new Promise(function (r) { setTimeout(r, 60); })).then(function () { return my === self.token; });
  }
};
TTS.init();
['pointerdown', 'touchend', 'keydown'].forEach(function (ev) { document.addEventListener(ev, function () { TTS.unlock(); }, { once: true, capture: true }); });
function speakEn(t, slow) { return TTS.one(t, 'en-US', slow ? 0.55 : undefined); }

/* ================= speech recognition / recording ================= */
/* 微信内置浏览器：语音识别不可用、不能添加到主屏幕 */
var isWX = /MicroMessenger/i.test(navigator.userAgent || '');
var SR = isWX ? null : (window.SpeechRecognition || window.webkitSpeechRecognition);
function lcsMarks(target, heard) {
  var a = words(target), b = words(heard), n = a.length, m = b.length, dp = [];
  for (var i = 0; i <= n; i++) { dp.push(new Array(m + 1).fill(0)); }
  for (i = n - 1; i >= 0; i--) for (var j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  var marks = new Array(n).fill(false); i = 0; j = 0;
  while (i < n && j < m) { if (a[i] === b[j]) { marks[i] = true; i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++; }
  var ok = marks.filter(Boolean).length; return { words: a, marks: marks, score: n ? Math.round(ok * 100 / n) : 0 };
}
var activeRec = null;
function recognize(target, onInterim) {
  return new Promise(function (res, rej) {
    var r = new SR(); r.lang = 'en-US'; r.interimResults = !!onInterim; r.maxAlternatives = 3; activeRec = r;
    var best = null;
    r.onresult = function (e) {
      for (var k = e.resultIndex; k < e.results.length; k++) {
        var alts = e.results[k];
        if (!alts.isFinal) { if (onInterim) onInterim(lcsMarks(target, alts[0].transcript)); continue; }
        for (var i = 0; i < alts.length; i++) { var sc = lcsMarks(target, alts[i].transcript); sc.heard = alts[i].transcript; if (!best || sc.score > best.score) best = sc; }
      }
    };
    r.onerror = function (e) { activeRec = null; rej(e.error || 'error'); };
    r.onend = function () { activeRec = null; best ? res(best) : rej('no-speech'); };
    try { r.start(); } catch (e) { activeRec = null; rej(e); }
  });
}
var Rec = {
  mr: null, chunks: [], url: null,
  start: function () { var self = this; return navigator.mediaDevices.getUserMedia({ audio: true }).then(function (st) { self.chunks = []; self.mr = new MediaRecorder(st); self.mr.ondataavailable = function (e) { self.chunks.push(e.data); }; self.mr.start(); self.st = st; }); },
  stop: function () { var self = this; return new Promise(function (res) { if (!self.mr) return res(null); self.mr.onstop = function () { var b = new Blob(self.chunks, { type: self.mr.mimeType || 'audio/webm' }); if (self.url) URL.revokeObjectURL(self.url); self.url = URL.createObjectURL(b); self.st.getTracks().forEach(function (t) { t.stop(); }); self.mr = null; res(self.url); }; self.mr.stop(); }); }
};
var canRecord = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);

/* ================= mascot: "Pip 皮皮", an original star-sprout puffball ================= */
var OUTFITS = {
  hat: { name: '绅士礼帽', price: 100, e: '🎩' }, glasses: { name: '酷酷墨镜', price: 120, e: '🕶️' }, scarf: { name: '红色围巾', price: 80, e: '🧣' },
  crown: { name: '金色皇冠', price: 200, e: '👑' }, helmet: { name: '宇航头盔', price: 250, e: '🧑‍🚀' }
};
var THEMES = { '': { name: '经典', price: 0, e: '🌿' }, ocean: { name: '海洋', price: 150, e: '🌊' }, sakura: { name: '樱花', price: 150, e: '🌸' }, night: { name: '星空', price: 200, e: '🌌' } };
function mascot(mood, size, outfit) {
  mood = mood || 'idle'; size = size || 96; outfit = outfit === undefined ? S.outfit : outfit;
  var eyes, mouth, brows = '', extra = '', arms;
  if (mood === 'happy' || mood === 'cheer') {
    eyes = '<path d="M31 50 q7 -9 14 0" stroke="#2b2350" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M55 50 q7 -9 14 0" stroke="#2b2350" stroke-width="4" fill="none" stroke-linecap="round"/>';
    mouth = '<path d="M40 61 q10 14 20 0 z" fill="#c2185b"/><path d="M45 66 q5 5 10 0" fill="#ff8fab"/>';
  } else if (mood === 'sad') {
    eyes = '<circle cx="38" cy="51" r="8" fill="#fff"/><circle cx="62" cy="51" r="8" fill="#fff"/><circle cx="38" cy="54" r="4" fill="#2b2350"/><circle cx="62" cy="54" r="4" fill="#2b2350"/>';
    brows = '<path d="M30 41 l12 4" stroke="#2b2350" stroke-width="3" stroke-linecap="round"/><path d="M70 41 l-12 4" stroke="#2b2350" stroke-width="3" stroke-linecap="round"/>';
    mouth = '<path d="M42 68 q8 -7 16 0" stroke="#2b2350" stroke-width="3.5" fill="none" stroke-linecap="round"/>';
    extra = '<path d="M28 58 q-3 6 0 9 q3 -3 0 -9z" fill="#7fd3ff"/>';
  } else if (mood === 'think') {
    eyes = '<circle cx="38" cy="50" r="8" fill="#fff"/><circle cx="62" cy="50" r="8" fill="#fff"/><circle cx="41" cy="47" r="4" fill="#2b2350"/><circle cx="65" cy="47" r="4" fill="#2b2350"/>';
    mouth = '<circle cx="52" cy="65" r="3.5" fill="#2b2350"/>';
  } else {
    eyes = '<circle cx="38" cy="50" r="8.5" fill="#fff"/><circle cx="62" cy="50" r="8.5" fill="#fff"/><circle cx="39" cy="51" r="4.5" fill="#2b2350"/><circle cx="63" cy="51" r="4.5" fill="#2b2350"/><circle cx="40.5" cy="49" r="1.6" fill="#fff"/><circle cx="64.5" cy="49" r="1.6" fill="#fff"/>';
    mouth = '<path d="M43 63 q7 7 14 0" stroke="#2b2350" stroke-width="3.5" fill="none" stroke-linecap="round"/>';
  }
  arms = mood === 'cheer' ? '<ellipse cx="14" cy="40" rx="6" ry="11" fill="#8e6cff" transform="rotate(-30 14 40)"/><ellipse cx="86" cy="40" rx="6" ry="11" fill="#8e6cff" transform="rotate(30 86 40)"/>'
    : '<ellipse cx="15" cy="66" rx="6" ry="10" fill="#8e6cff" transform="rotate(25 15 66)"/><ellipse cx="85" cy="66" rx="6" ry="10" fill="#8e6cff" transform="rotate(-25 85 66)"/>';
  var head = '<path d="M50 22 L50 12" stroke="#5aa02c" stroke-width="3.5" stroke-linecap="round"/><path d="M50 15 q-11 -9 -16 -2 q8 6 16 2z" fill="#7ed957"/><path d="M50 15 q11 -9 16 -2 q-8 6 -16 2z" fill="#58cc02"/>' +
    '<path d="M50 1 l2.6 5.4 5.9 .8 -4.3 4.1 1 5.8 -5.2 -2.8 -5.2 2.8 1 -5.8 -4.3 -4.1 5.9 -.8z" fill="#ffc800" stroke="#e5a800" stroke-width="1"/>';
  var o = '';
  if (outfit === 'hat') { head = ''; o = '<rect x="30" y="20" width="40" height="6" rx="3" fill="#222"/><rect x="36" y="2" width="28" height="20" rx="3" fill="#333"/><rect x="36" y="15" width="28" height="4" fill="#ff4b4b"/>'; }
  if (outfit === 'crown') { head = ''; o = '<path d="M30 26 l4 -18 9 10 7 -14 7 14 9 -10 4 18z" fill="#ffc800" stroke="#e5a800" stroke-width="2" stroke-linejoin="round"/><circle cx="50" cy="19" r="3" fill="#ff4b4b"/>'; }
  if (outfit === 'glasses') o = '<rect x="27" y="43" width="20" height="13" rx="5" fill="#222"/><rect x="53" y="43" width="20" height="13" rx="5" fill="#222"/><rect x="46" y="47" width="8" height="3" fill="#222"/><path d="M30 46 l5 0" stroke="#666" stroke-width="2"/>';
  if (outfit === 'scarf') o = '<path d="M20 73 q30 12 60 0 l0 7 q-30 12 -60 0z" fill="#ff4b4b"/><rect x="60" y="76" width="9" height="16" rx="3" fill="#ea2b2b"/>';
  if (outfit === 'helmet') o = '<circle cx="50" cy="55" r="45" fill="rgba(170,230,255,.25)" stroke="#bfe8ff" stroke-width="4"/><path d="M24 30 q10 -12 22 -14" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" opacity=".8"/>';
  return '<svg class="pip pip-' + mood + '" width="' + size + '" height="' + size + '" viewBox="0 0 100 100" aria-label="皮皮">' +
    '<ellipse cx="50" cy="96" rx="26" ry="4" fill="rgba(0,0,0,.12)"/>' + head + arms +
    '<ellipse cx="38" cy="91" rx="9" ry="5" fill="#ff9600"/><ellipse cx="62" cy="91" rx="9" ry="5" fill="#ff9600"/>' +
    '<path d="M50 20 C78 20 88 40 88 60 C88 80 72 92 50 92 C28 92 12 80 12 60 C12 40 22 20 50 20Z" fill="#8e6cff"/>' +
    '<path d="M50 52 C68 52 74 64 72 76 C68 86 60 89 50 89 C40 89 32 86 28 76 C26 64 32 52 50 52Z" fill="#c9b8ff"/>' +
    '<path d="M24 36 q6 -10 16 -12" stroke="#b39dff" stroke-width="4" fill="none" stroke-linecap="round"/>' +
    '<ellipse cx="26" cy="62" rx="6" ry="4" fill="#ff8fab" opacity=".75"/><ellipse cx="74" cy="62" rx="6" ry="4" fill="#ff8fab" opacity=".75"/>' +
    brows + eyes + mouth + extra + o + '</svg>';
}
function bubble(text, mood, size) { return '<div class="pipline"><div class="pipwrap">' + mascot(mood || 'idle', size || 84) + '</div><div class="speech">' + text + '</div></div>'; }

/* ================= visual juice ================= */
function confetti(n) { var cs = ['#58cc02', '#1cb0f6', '#ffc800', '#ff4b4b', '#ce82ff', '#ff9600']; for (var i = 0; i < (n || 80); i++) { var c = document.createElement('i'); c.className = 'confetti' + (i % 3 ? '' : ' round'); c.style.left = Math.random() * 100 + 'vw'; c.style.background = cs[i % cs.length]; c.style.animationDuration = (1.6 + Math.random() * 1.8) + 's'; c.style.animationDelay = Math.random() * .5 + 's'; c.style.setProperty('--dx', (Math.random() * 160 - 80) + 'px'); document.body.appendChild(c); setTimeout(function (el) { el.remove(); }.bind(null, c), 4200); } }
function modal(html, onmount, cls) { var m = document.createElement('div'); m.className = 'modal ' + (cls || ''); m.innerHTML = '<div class="box">' + html + '</div>'; document.body.appendChild(m); var close = function () { m.remove(); }; m.addEventListener('click', function (e) { if (e.target === m && !m.classList.contains('sticky')) close(); }); if (onmount) onmount(m, close); return close; }

/* ================= books (course switcher) ================= */
var DEFAULT_MANIFEST = { books: [{ id: 'book', title: '六年级上册', short: '六上', sub: '人教PEP · 2026秋', file: 'data/book.json', js: 'data/book.js', emoji: '📘' }, { id: 'book-down', title: '六年级下册', short: '六下', sub: '人教PEP · 2027春', file: 'data/book-down.json', emoji: '📗' }] };
var BOOKS = [];      // available books (manifest entries whose data file loads)
var B, UNITS = [], LESSONS = {}, PASSAGES = {}, STORIES = {}, QIDX = {}, MAIN_UNITS = [], ALL_LESSON_IDS = [], PATH = [], WORDS = [], SENTZH = {};
function fetchJSON(url) { return fetch(url, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
function loadScript(src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
var MANIFEST = [], probed = {};
function loadManifest() {
  return fetchJSON('data/books.json').catch(function () { return DEFAULT_MANIFEST; }).then(function (m) {
    MANIFEST = (m && m.books) || DEFAULT_MANIFEST.books;
    BOOKS = MANIFEST.filter(function (b) { return b.id === 'book' || b.id === S.course || b.ready === true; });
    return BOOKS;
  });
}
/* other books are probed only when the course menu opens (avoids a 404 on every page load) */
function probeBooks() {
  return Promise.all(MANIFEST.map(function (b) {
    if (bookEntry(b.id) || b.ready === false || probed[b.id] === false) return null;
    return fetch(b.file, { method: 'HEAD', cache: 'no-cache' }).then(function (r) { probed[b.id] = r.ok; if (r.ok && !bookEntry(b.id)) BOOKS.push(b); }).catch(function () { probed[b.id] = false; });
  })).then(function () { BOOKS.sort(function (a, b) { return MANIFEST.indexOf(a) - MANIFEST.indexOf(b); }); return BOOKS; });
}
function loadBook(entry) {
  return fetchJSON(entry.file).catch(function () {
    if (!entry.js) throw new Error('no data');
    return loadScript(entry.js).then(function () { if (!window.BOOK) throw new Error('no data'); return window.BOOK; });
  });
}
function bookEntry(id) { return BOOKS.filter(function (b) { return b.id === id; })[0]; }
function switchCourse(id) { if (id === S.course) return; S.course = id; save(); location.hash = '#/'; location.reload(); }

/* emoji pictures for "select the correct image" (book-independent dictionary) */
var EMOJI = {
  climb: '🧗', kilometre: '📏', send: '📨', clay: '🏺', see: '👀', village: '🏘️', eat: '😋', view: '🏞️', bamboo: '🎋', pumpkin: '🎃', restaurant: '🍴', airport: '🛫', 'new zealand': '🇳🇿', paris: '🇫🇷', 'eiffel tower': '🗼', 'hong kong-zhuhai-macao bridge': '🌉', 'gingerbread house': '🏠',
  dress: '👗', gala: '🎭', 'count down': '⏱️', marathon: '🏅', race: '🏁', run: '🏃', cheer: '📣', 'book fair': '📚', writer: '✍️', read: '📖', make: '🛠️', sing: '🎤', wear: '🧥', notice: '📋', wake: '⏰', judge: '🧑‍⚖️', win: '🏆', winner: '🥇', exciting: '🤩', paste: '🧴',
  cold: '🤧', ill: '🤢', 'runny nose': '👃', fever: '🌡️', cough: '😷', discuss: '💬', diet: '🥗', 'stay up': '🦉', cry: '😢', call: '📞', email: '📧', unhappy: '☹️', glass: '🥛', video: '📹', better: '😊', head: '🙆',
  money: '💰', 'pocket money': '🪙', schoolbag: '🎒', goods: '🛍️', drink: '🥤', haircut: '💇', microscope: '🔬', lucky: '🍀', half: '🌗', 'save up': '🐷', sale: '🏷️', ticket: '🎫', jar: '🫙', sell: '💵',
  planet: '🪐', earth: '🌍', sky: '🌤️', daytime: '🌞', cloud: '☁️', 'the moon': '🌙', star: '⭐', space: '🌌', 'outer space': '🌠', 'space station': '🛰️', ocean: '🌊', marble: '🔮', satellite: '📡', soil: '🪴', alien: '👽', sunrise: '🌅', rover: '🚙', telescope: '🔭', astronaut: '🧑‍🚀', spaceship: '🚀', month: '🗓️', toothpaste: '🪥', question: '❓', sunset: '🌇', mars: '🔴',
  electricity: '🔌', solar: '☀️', energy: '⚡', light: '💡', heat: '🔥', cool: '🧊', shower: '🚿', drive: '🚗', reuse: '♻️', market: '🛒', bottle: '🍼', top: '🔝', dirty: '🦠', 'air conditioner': '🌬️', water: '💧', wind: '💨', tree: '🌳', fish: '🐟',
  apple: '🍎', banana: '🍌', bread: '🍞', milk: '🥛', rice: '🍚', noodles: '🍜', egg: '🥚', cake: '🍰', tea: '🍵', juice: '🧃', dog: '🐶', cat: '🐱', bird: '🐦', panda: '🐼', tiger: '🐯', rabbit: '🐰', horse: '🐴', cow: '🐮', duck: '🦆', book: '📕', pen: '🖊️', ruler: '📐', bike: '🚲', bus: '🚌', train: '🚆', plane: '✈️', ship: '🚢', car: '🚙', house: '🏡', school: '🏫', hospital: '🏥', park: '🏞️', zoo: '🦁', library: '🏛️', cinema: '🎬', museum: '🏛️', doctor: '🧑‍⚕️', teacher: '🧑‍🏫', farmer: '🧑‍🌾', scientist: '🧑‍🔬', police: '👮', football: '⚽', basketball: '🏀', swim: '🏊', dance: '💃', draw: '🎨', music: '🎵', piano: '🎹', guitar: '🎸', camera: '📷', phone: '📱', computer: '💻', clock: '🕰️', sun: '☀️', rain: '🌧️', snow: '❄️', rainbow: '🌈', flower: '🌸', mountain: '⛰️', river: '🏞️', beach: '🏖️', gift: '🎁', birthday: '🎂', happy: '😄', sad: '😢', tired: '😫', angry: '😠', hungry: '🍽️', sleep: '😴', cook: '🧑‍🍳', write: '✍️', listen: '👂', smile: '😊', kite: '🪁', umbrella: '☂️', hat: '👒', shoes: '👟', glasses: '👓', robot: '🤖', map: '🗺️', letter: '✉️', world: '🌏', china: '🇨🇳', island: '🏝️', bridge: '🌉', castle: '🏰', ice: '🧊', fruit: '🍇', vegetable: '🥦', medicine: '💊', tooth: '🦷', eye: '👁️', ear: '👂', hand: '✋', leg: '🦵', heart: '❤️', ball: '⚽', game: '🎮', festival: '🏮', lantern: '🏮', mooncake: '🥮', dumplings: '🥟', firework: '🎆', fireworks: '🎆', photo: '📸', picture: '🖼️', trip: '🧳', travel: '🧳'
};
function emojiOf(w) { return EMOJI[String(w).toLowerCase()] || null; }

function initBook(book) {
  B = book; UNITS = B.units; LESSONS = {}; PASSAGES = {}; STORIES = {}; QIDX = {}; WORDS = []; SENTZH = {};
  UNITS.forEach(function (u) {
    u.passages = u.passages || []; u.lessons = u.lessons || []; u.words = u.words || []; u.expressions = u.expressions || []; u.stories = u.stories || [];
    u.lessons.forEach(function (l, li) { l._u = u; l._i = li; l.questions = l.questions || []; l.key = l.key || []; l.explain = l.explain || []; LESSONS[l.id] = l; l.questions.forEach(function (q, qi) { q._key = l.id + '#' + qi; QIDX[q._key] = { q: q, unit: u.id, src: l.title }; }); });
    u.passages.forEach(function (p) { p._u = u; PASSAGES[p.id] = p; p.lines.forEach(function (x) { if (x[1] && x[2]) SENTZH[x[1]] = x[2]; }); });
    if (u.song) { var sp = { id: u.id + '-song', part: 'Song', kind: 'Song', title: u.song.title, zh: u.song.zh, page: u.song.page, lines: u.song.lines.map(function (x) { return ['', x[0], x[1]]; }), _u: u }; PASSAGES[sp.id] = sp; u._song = sp; }
    u.stories.forEach(function (s) { s._u = u; STORIES[s.id] = s; (s.qs || []).forEach(function (q, qi) { q._key = s.id + '#' + qi; QIDX[q._key] = { q: q, unit: u.id, src: s.title }; }); });
    u.expressions.forEach(function (e) { if (e[0] && e[1] && !SENTZH[e[0]]) SENTZH[e[0]] = e[1]; });
    u.words.forEach(function (w) { w._u = u; WORDS.push(w); });
  });
  MAIN_UNITS = UNITS.filter(function (u) { return !u.isExtra && !u.isRevision; });
  ALL_LESSON_IDS = Object.keys(LESSONS);
  buildPath();
}

/* ================= path model ================= */
function buildPath() {
  PATH = [];
  UNITS.forEach(function (u) {
    var items = [];
    u.lessons.forEach(function (l, i) {
      items.push({ type: 'lesson', id: l.id, l: l, u: u });
      if ((i === 2 || i === 5) && i < u.lessons.length - 1) items.push({ type: 'chest', id: u.id + '-c' + (i === 2 ? 1 : 2), u: u, after: l.id });
    });
    if (!u.isExtra && u.lessons.length) items.push({ type: 'trophy', id: u.id + '-trophy', u: u });
    u._items = items; PATH = PATH.concat(items);
  });
}
function lessonState(id) { return P().lessons[id] || {}; }
function lessonComplete(id) { return !!(lessonState(id).done || P().tested[id]); }
function seqOf(u) { return u.isExtra ? UNITS.filter(function (x) { return x.isExtra; }) : UNITS.filter(function (x) { return !x.isExtra; }); }
function lessonsBefore(u, l) { var out = []; var units = seqOf(u); for (var i = 0; i < units.length; i++) { var x = units[i]; for (var j = 0; j < x.lessons.length; j++) { if (x.lessons[j] === l) return out; out.push(x.lessons[j]); } } return out; }
function isUnlocked(l) { if (S.parent.unlockAll || lessonComplete(l.id)) return true; if (P().focus && l._u && l._u.id === P().focus) return true; return lessonsBefore(l._u, l).every(function (x) { return lessonComplete(x.id); }); }
function currentLesson(extra) { var units = UNITS.filter(function (x) { return !!x.isExtra === !!extra; }); for (var i = 0; i < units.length; i++) for (var j = 0; j < units[i].lessons.length; j++) if (!lessonComplete(units[i].lessons[j].id)) return units[i].lessons[j]; return null; }
function unitComplete(u) { return u.lessons.every(function (l) { return lessonComplete(l.id); }); }
function unitUnlocked(u) { return u.lessons.length ? isUnlocked(u.lessons[0]) : true; }
function chestUnlocked(it) { if (S.parent.unlockAll) return true; var l = LESSONS[it.after]; if (P().focus === l._u.id) return l._u.lessons.slice(0, l._i + 1).every(function (x) { return lessonComplete(x.id); }); return lessonComplete(l.id) && lessonsBefore(l._u, l).every(function (x) { return lessonComplete(x.id); }); }
function trophyUnlocked(u) { return S.parent.unlockAll || (unitComplete(u) && (unitUnlocked(u) || P().focus === u.id)); }
function lessonLevel(id) { var st = lessonState(id); return st.done ? Math.min(5, st.times || 1) : 0; }
function crowns() { return ALL_LESSON_IDS.reduce(function (a, k) { return a + lessonLevel(k); }, 0); }
function doneLessons() { return ALL_LESSON_IDS.filter(function (k) { return lessonState(k).done; }).length; }
function chalPassed() { return MAIN_UNITS.filter(function (u) { return P().chal[u.id] && P().chal[u.id].pass; }).length; }

/* ================= hearts / streak / xp / gems ================= */
var HEART_MS = 30 * 60 * 1000, MAXH = 5;
function regen() {
  if (S.hearts >= MAXH) { S.hearts = MAXH; S.heartTs = Date.now(); return; }
  var n = Math.floor((Date.now() - S.heartTs) / HEART_MS);
  if (n > 0) { S.hearts = Math.min(MAXH, S.hearts + n); S.heartTs += n * HEART_MS; if (S.hearts >= MAXH) S.heartTs = Date.now(); }
}
function nextHeartIn() { return Math.max(0, HEART_MS - (Date.now() - S.heartTs)); }
function loseHeart() { if (S.hearts >= MAXH) S.heartTs = Date.now(); S.hearts = Math.max(0, S.hearts - 1); save(); }
function gainHeart(n) { S.hearts = Math.min(MAXH, S.hearts + (n || 1)); if (S.hearts >= MAXH) S.heartTs = Date.now(); save(); }
/* streak freeze: covers missed days automatically when the app is opened again */
function applyFreezes() {
  if (!S.lastDay) return;
  var gap = daysBetween(S.lastDay, today()) - 1; // full missed days
  if (gap <= 0 || !S.streak) return;
  if (gap <= S.freezes) {
    for (var i = 1; i <= gap; i++) S.freezeDays[dayOffset(i, S.lastDay)] = 1;
    S.freezes -= gap; S.lastDay = dayOffset(-1); save();
    setTimeout(function () { toast('🧊 连胜冻结生效，保住了 ' + S.streak + ' 天连胜！', 3200); }, 800);
  }
}
function touchStreak() {
  var t = today(); if (S.lastDay === t) return false;
  S.streak = (S.lastDay === dayOffset(-1)) ? S.streak + 1 : 1;
  S.bestStreak = Math.max(S.bestStreak || 0, S.streak); S.lastDay = t; return true;
}
function streakNow() { return (S.lastDay === today() || S.lastDay === dayOffset(-1)) ? S.streak : 0; }
function streakToday() { return S.lastDay === today(); }
function boostOn() { return S.boostUntil > Date.now(); }
var streakJustUp = false;
function addXP(n, noBoost) {
  if (!n) return 0; if (boostOn() && !noBoost) n *= 2;
  S.xp += n; var d = D(); d.xp += n;
  if (touchStreak()) streakJustUp = true;
  if (S.goal && !d.goalHit && d.xp >= S.goal) { d.goalHit = 1; S.stats.goalDays = (S.stats.goalDays || 0) + 1; setTimeout(function () { toast('🎯 今日目标达成！' + S.goal + ' XP', 2600); }, 600); }
  save(); renderChrome(); checkAch(); return n;
}
function addGems(n, why) { S.gems += n; save(); renderChrome(); if (why) toast('💎 +' + n + ' ' + why); }

/* ================= achievements ================= */
var ACH = [
  ['first', '🐣', '第一步', '完成第一节小课', function () { return doneLessons() >= 1; }],
  ['l10', '📗', '勤学好问', '完成 10 节小课', function () { return doneLessons() >= 10; }],
  ['l30', '📚', '小学霸', '完成 30 节小课', function () { return doneLessons() >= 30; }],
  ['lall', '🎓', '全册通关', '完成本册全部小课', function () { return ALL_LESSON_IDS.length && doneLessons() >= ALL_LESSON_IDS.length; }],
  ['chal1', '🏆', '单元勇士', '通过 1 次单元挑战', function () { return chalPassed() >= 1; }],
  ['chal6', '👑', '单元之王', '通过本册全部单元挑战', function () { return MAIN_UNITS.length && chalPassed() >= MAIN_UNITS.length; }],
  ['xp100', '⭐', '百分起步', '累计 100 经验', function () { return S.xp >= 100; }],
  ['xp500', '🌟', '闪闪发光', '累计 500 经验', function () { return S.xp >= 500; }],
  ['xp2000', '🌌', '英语星河', '累计 2000 经验', function () { return S.xp >= 2000; }],
  ['s3', '🔥', '三天连胜', '连续学习 3 天', function () { return (S.bestStreak || 0) >= 3; }],
  ['s7', '☄️', '一周坚持', '连续学习 7 天', function () { return (S.bestStreak || 0) >= 7; }],
  ['s30', '🌋', '月度火焰', '连续学习 30 天', function () { return (S.bestStreak || 0) >= 30; }],
  ['c10', '⚡', '连击高手', '一次答题连击 10 题', function () { return S.stats.maxCombo >= 10; }],
  ['perfect', '💯', '完美小课', '一节小课全部一次答对', function () { return S.stats.perfect >= 1; }],
  ['rev20', '🔁', '知错就改', '在错题本答对 20 题', function () { return S.stats.reviewed >= 20; }],
  ['read10', '🎧', '小小听众', '完整听读 10 篇课文', function () { return S.stats.reads >= 10; }],
  ['shadow20', '🎤', '跟读达人', '跟读或口语题 20 句', function () { return S.stats.shadow + (S.stats.spoken || 0) >= 20; }],
  ['story1', '📖', '故事迷', '读完 1 个原创故事', function () { return Object.keys(P().stories).length >= 1; }],
  ['storyall', '🦄', '故事大王', '读完本册全部原创故事', function () { var ks = Object.keys(STORIES); return ks.length && ks.every(function (k) { return P().stories[k]; }); }],
  ['pt', '⏳', '过去式大师', '完成过去式训练营全部小课', function () { var u = UNITS.filter(function (x) { return x.id === 'pt'; })[0]; return u && u.lessons.every(function (l) { return lessonState(l.id).done; }); }],
  ['chest5', '🧰', '寻宝小能手', '打开 5 个宝箱', function () { return (S.stats.chests || 0) >= 5; }],
  ['gem500', '💎', '宝石收藏家', '同时拥有 500 宝石', function () { return S.gems >= 500; }],
  ['promo', '🥈', '步步高升', '在排行榜晋级一次', function () { return (S.stats.promos || 0) >= 1; }],
  ['goal7', '🎯', '目标达人', '累计 7 天达成每日目标', function () { return (S.stats.goalDays || 0) >= 7; }],
  ['shop1', '🛍️', '第一次购物', '在商店买 1 件东西', function () { return (S.stats.buys || 0) >= 1; }],
  ['quest10', '📜', '任务专家', '完成 10 个每日任务', function () { return (S.stats.quests || 0) >= 10; }]
];
function checkAch(silent) {
  var got = [];
  ACH.forEach(function (a) { try { if (!S.ach[a[0]] && a[4]()) { S.ach[a[0]] = Date.now(); got.push(a); } } catch (e) { } });
  if (got.length) { save(); if (!silent) got.forEach(function (a, i) { setTimeout(function () { sfx.win(); toast('🏅 解锁成就：' + a[1] + ' ' + a[2], 3000); }, 1500 + i * 1300); }); }
}

/* ================= daily quests + monthly badge ================= */
var TASKS = [
  ['xp30', '⚡', '获得 30 经验', 30, 'xp', 10], ['xp60', '⚡', '获得 60 经验', 60, 'xp', 20], ['les2', '📘', '完成 2 节小课', 2, 'lessons', 15], ['les3', '📚', '完成 3 节小课', 3, 'lessons', 20],
  ['rev5', '🔁', '在错题本答对 5 题', 5, 'reviews', 15], ['read1', '🎧', '完整听读 1 篇课文', 1, 'reads', 10], ['shad5', '🎤', '说出 5 个英语句子', 5, 'shadow', 15], ['story1', '📖', '读完 1 个故事并答题', 1, 'stories', 10],
  ['combo5', '🔥', '答题连击达到 5', 5, 'combo', 10], ['combo10', '🔥', '答题连击达到 10', 10, 'combo', 20], ['perfect', '💯', '完成 1 节全对小课', 1, 'perfect', 20], ['chal', '🏆', '挑战 1 次单元挑战', 1, 'chal', 15],
  ['wordp', '🔤', '完成 1 次单词练习', 1, 'wordp', 10], ['listen8', '👂', '答对 8 道听力题', 8, 'listenQ', 15], ['corr20', '✅', '答对 20 道题', 20, 'correct', 15], ['goal', '🎯', '达成每日经验目标', 1, 'goalHit', 15]
];
function todaysTasks() { var t = today(), r = mulberry32(parseInt(t.replace(/-/g, ''), 10)), pool = TASKS.slice(), out = []; var g = pool.splice(pool.length - 1, 1)[0]; if (S.goal) out.push(g); while (out.length < 3) { var i = Math.floor(r() * pool.length); out.push(pool.splice(i, 1)[0]); } return out; }
function taskVal(t) { return Math.min(t[3], D()[t[4]] || 0); }
function claimedToday() { return S.claimed[today()] = S.claimed[today()] || []; }
function monthKey(d) { return (d || today()).slice(0, 7); }
function monthQuests() { var m = monthKey(), n = 0; for (var k in S.claimed) if (k.slice(0, 7) === m) n += (S.claimed[k] || []).length; return n; }
var MONTH_GOAL = 30;
var MONTH_BADGE = ['⛄', '🏮', '🌱', '🌷', '🦋', '🌻', '🍉', '🐚', '🍂', '🎃', '🍁', '🎄'];
function claimTask(id) {
  var t = TASKS.filter(function (x) { return x[0] === id; })[0]; if (!t) return;
  var c = claimedToday(); if (c.indexOf(id) >= 0 || taskVal(t) < t[3]) return;
  c.push(id); S.stats.quests = (S.stats.quests || 0) + 1; sfx.chest(); vibrate(40); addGems(t[5], '任务奖励');
  if (monthQuests() >= MONTH_GOAL && !S.badges[monthKey()]) { S.badges[monthKey()] = Date.now(); save(); setTimeout(function () { confetti(); sfx.win(); modal('<div class="e">' + MONTH_BADGE[new Date().getMonth()] + '</div><h2>获得 ' + (new Date().getMonth() + 1) + ' 月徽章！</h2><p class="sub">本月完成了 ' + MONTH_GOAL + ' 个每日任务，太厉害了！</p><button class="btn block" data-close>好的</button>', function (m, close) { $('[data-close]', m).onclick = close; }); }, 700); }
  checkAch(); render();
}

/* ================= weekly league (simulated, deterministic bots) ================= */
var TIERS = [['青铜', '🥉', '#cd7f32'], ['白银', '🥈', '#a8b3bd'], ['黄金', '🥇', '#ffc800'], ['蓝宝石', '💠', '#1cb0f6'], ['红宝石', '♦️', '#ff4b4b'], ['翡翠', '💚', '#2fb344'], ['紫晶', '🔮', '#a560e8'], ['珍珠', '🦪', '#e9c7d8'], ['黑曜石', '🖤', '#4b4b4b'], ['钻石', '💎', '#7ad7f0']];
var BOT_NAMES = ['Lily', '小明', 'Tom', 'Anna', '王小雨', 'Leo', 'Kevin', '朵朵', 'Max', 'Sophie', 'Jack', '米粒', 'Emma', 'Ben', '可可', 'Sam', 'Mia', '豆豆', 'Oliver', 'Chloe', '乐乐', 'Lucas', '安安', 'Ella', 'Daniel', '团团', 'Grace', '小宇', 'Ryan', 'Zoe', '天天', 'Ivy', '小鱼', 'Eric', 'Luna', '果果', 'Nina', 'Alex', '晨晨', 'Ruby'];
var BOT_AV = ['🐼', '🦊', '🐯', '🐨', '🐸', '🐵', '🦁', '🐰', '🐻', '🐧', '🐙', '🦄', '🐳', '🐝', '🦖', '🐢', '🦉', '🐶', '🐱', '🐹'];
var LEAGUE_N = 15, PROMO = 5, DEMO = 5;
function weekXP(mon, upto) { var t = 0; for (var i = 0; i < 7; i++) { var d = dayOffset(i, mon); if (upto && d > upto) break; t += (S.days[d] && S.days[d].xp) || 0; } return t; }
function leagueBoard(mon, tier, final) {
  mon = mon || mondayOf(); tier = tier == null ? S.league.tier : tier;
  var r = mulberry32(hashStr('lg|' + mon + '|' + tier)), names = shuffle(BOT_NAMES, r).slice(0, LEAGUE_N - 1), avs = shuffle(BOT_AV, r);
  var now = new Date(), td = today(), frac = (now.getHours() * 60 + now.getMinutes()) / 1440;
  var rows = names.map(function (n, i) {
    var br = mulberry32(hashStr('bot|' + mon + '|' + tier + '|' + i)), rate = (12 + tier * 7) * (0.25 + br() * 1.9), xp = 0;
    for (var d = 0; d < 7; d++) {
      var day = dayOffset(d, mon), dr = br(), amt = dr < 0.18 ? 0 : Math.round(rate * (0.4 + br() * 1.2));
      if (!final && day > td) break;
      if (!final && day === td) { var start = 0.3 + (i % 5) * 0.08; amt = Math.round(amt * Math.max(0, Math.min(1, (frac - start) / 0.5))); }
      xp += amt;
    }
    return { name: n, av: avs[i % avs.length], xp: xp, bot: true };
  });
  rows.push({ name: S.name || '我', av: 'me', xp: weekXP(mon, final ? null : td), me: true });
  rows.sort(function (a, b) { return b.xp - a.xp || (a.me ? -1 : b.me ? 1 : 0); });
  return rows;
}
function myRank(rows) { for (var i = 0; i < rows.length; i++) if (rows[i].me) return i + 1; return rows.length; }
function leagueRollover() {
  var cur = mondayOf();
  if (!S.league.week) { S.league.week = cur; save(); return; }
  if (S.league.week === cur) return;
  var last = S.league.week, tier = S.league.tier, rows = leagueBoard(last, tier, true), rank = myRank(rows), mine = weekXP(last);
  var to = tier;
  if (mine > 0 && rank <= PROMO && tier < TIERS.length - 1) to = tier + 1;
  else if (rank > LEAGUE_N - DEMO && tier > 0) to = tier - 1;
  var gems = mine > 0 ? (rank === 1 ? 30 : rank === 2 ? 20 : rank === 3 ? 10 : 0) : 0;
  S.league = { week: cur, tier: to, best: Math.max(S.league.best || 0, to), result: { week: last, from: tier, to: to, rank: rank, xp: mine, gems: gems, seen: false } };
  if (to > tier) S.stats.promos = (S.stats.promos || 0) + 1;
  S.gems += gems; save();
}

/* ================= wrong book (spaced repetition) ================= */
var BOXDAYS = [0, 1, 2, 4, 7, 15];
function qKey(q) { return q._key || ('g|' + q.t + '|' + (q.prompt || q.q || '') + '|' + (q.ans || q.a || '')); }
function addWrong(q) {
  var k = qKey(q), W = P().wrong, w = W[k];
  if (!w) w = W[k] = { box: 0, n: 0, first: Date.now() };
  if (!q._key) { var c = {}; for (var x in q) if (x.charAt(0) !== '_') c[x] = q[x]; w.q = c; w.src = q._src || ''; }
  w.box = 0; w.n++; w.due = Date.now() + 10 * 60 * 1000; w.last = Date.now();
}
function wrongQ(k) { var w = P().wrong[k]; if (QIDX[k]) return QIDX[k].q; if (w && w.q) return w.q; return null; }
function wrongSrc(k) { return QIDX[k] ? QIDX[k].src : (P().wrong[k].src || '练习'); }
function activeWrong() { var W = P().wrong; return Object.keys(W).filter(function (k) { return wrongQ(k) && W[k].box < 5; }); }
function dueWrong() { var now = Date.now(), W = P().wrong; return activeWrong().filter(function (k) { return W[k].due <= now; }); }

/* ================= question generators (Duolingo-style types from words & sentences) ================= */
var SEG = null; try { if (window.Intl && Intl.Segmenter) SEG = new Intl.Segmenter('zh', { granularity: 'word' }); } catch (e) { SEG = null; }
function segZh(s) {
  s = String(s).replace(/（[^）]*）/g, '');
  var out = [];
  if (SEG) { var it = SEG.segment(s); for (var x of it) { if (x.isWordLike) out.push(x.segment); } }
  else { var c = zhNorm(s), i = 0; while (i < c.length) { var n = /[A-Za-z0-9]/.test(c[i]) ? (c.slice(i).match(/^[A-Za-z0-9']+/) || [c[i]])[0].length : 2; out.push(c.slice(i, i + n)); i += n; } }
  out = out.filter(function (t) { return zhNorm(t).length; });
  while (out.length > 9) { var j = 0, best = 99; for (var k = 0; k < out.length - 1; k++) { var L = out[k].length + out[k + 1].length; if (L < best) { best = L; j = k; } } out.splice(j, 2, out[j] + out[j + 1]); }
  return out;
}
function enTiles(s) { return String(s).replace(/[“”"]/g, '').split(/\s+/).map(function (t) { return t.replace(/^[^A-Za-z0-9']+|[^A-Za-z0-9']+$/g, ''); }).filter(Boolean); }
function wc(s) { return enTiles(s).length; }
function lessonWords(l) {
  var u = l._u, set = {}, out = [];
  (l.words || []).forEach(function (n) { var w = u.words.filter(function (x) { return x.w === n; })[0]; if (w && !set[w.w]) { set[w.w] = 1; out.push(w); } });
  shuffle(u.words).forEach(function (w) { if (!set[w.w]) { set[w.w] = 1; out.push(w); } });
  return out;
}
function sentPool(l, maxW) {
  maxW = maxW || 11; var u = l._u, seen = {}, out = [];
  function add(en, zh) { en = String(en || '').trim(); if (!en || seen[en] || /_{2,}|\.\.\.|…/.test(en)) return; var n = wc(en); if (n < 3 || n > maxW) return; seen[en] = 1; out.push({ en: en, zh: zh || SENTZH[en] || '' }); }
  (l.key || []).forEach(function (k) { add(k, SENTZH[k]); });
  var p = l.passage && PASSAGES[l.passage]; if (p) p.lines.forEach(function (x) { add(x[1], x[2]); });
  if (out.length < 3) u.expressions.forEach(function (e) { add(e[0], e[1]); });
  return out;
}
function otherSents(u, notEn) { var out = []; u.passages.forEach(function (p) { p.lines.forEach(function (x) { if (x[1] !== notEn && wc(x[1]) >= 3 && wc(x[1]) <= 12) out.push(x); }); }); if (out.length < 6) UNITS.forEach(function (uu) { uu.expressions.forEach(function (e) { out.push(['', e[0], e[1]]); }); }); return out; }
function distractTiles(target, u, n, zh) {
  var have = {}; target.forEach(function (t) { have[(zh ? t : t.toLowerCase())] = 1; });
  var cands = []; shuffle(otherSents(u, '')).slice(0, 12).forEach(function (x) { (zh ? segZh(x[2] || '') : enTiles(x[1])).forEach(function (t) { var k = zh ? t : t.toLowerCase(); if (!have[k] && (zh || /^[a-z]/i.test(t))) { have[k] = 1; cands.push(zh ? t : (/^(I|I'm|Mr|Mrs|Miss)$/.test(t) || /^[A-Z][a-z]+$/.test(t) && false ? t : t.toLowerCase())); } }); });
  return shuffle(cands).slice(0, n);
}
function mkTrans(s, dir, l) {
  var u = l._u;
  if (dir === 'ze') {
    var ans = enTiles(s.en); return { t: 'trans', dir: 'ze', prompt: s.zh, ans: s.en, ansTiles: ans, tiles: shuffle(ans.concat(distractTiles(ans, u, Math.min(4, Math.max(2, 9 - ans.length)), false))), exp: '正确翻译：' + s.en, _src: l.title };
  }
  var segs = segZh(s.zh); return { t: 'trans', dir: 'ez', prompt: s.en, say: s.en, ans: s.zh, ansTiles: segs, tiles: shuffle(segs.concat(distractTiles(segs, u, 3, true))), exp: s.en + ' = ' + s.zh, _src: l.title };
}
function genTransZE(l) { var c = sentPool(l, 10).filter(function (s) { return s.zh; }); if (!c.length) return null; return mkTrans(pick(c), 'ze', l); }
function genTransEZ(l) { var c = sentPool(l, 10).filter(function (s) { return s.zh && zhNorm(s.zh).length <= 22; }); if (!c.length) return null; return mkTrans(pick(c), 'ez', l); }
function genListenTap(l) { var c = sentPool(l, 9); if (!c.length) return null; var s = pick(c), ans = enTiles(s.en); return { t: 'ltap', say: s.en, ans: s.en, ansTiles: ans, zh: s.zh, tiles: shuffle(ans.concat(distractTiles(ans, l._u, 3, false))), exp: (s.zh ? s.en + '（' + s.zh + '）' : s.en), _src: l.title }; }
function genSpeak(l) { if (isWX) return genListenTap(l) || genTransZE(l); if (!SR || S.offUntil.speak > Date.now()) return null; var c = sentPool(l, 9); if (!c.length) return null; var s = pick(c); return { t: 'speak', say: s.en, zh: s.zh, exp: s.zh ? s.en + ' = ' + s.zh : s.en, _src: l.title }; }
function genMatch(l) {
  var pairs = [], seenZ = {};
  var tbl = (l.table && l.table.length) ? l.table : (l._u.comparatives && l._u.comparatives.length ? l._u.comparatives : null);
  if (tbl) { var cmpT = !l.table || l._u.id === 'cmp'; l = Object.assign({}, l, { table: tbl }); }
  if (l.table && l.table.length) { shuffle(l.table).forEach(function (r) { var a = r[0].split(' ')[0]; if (pairs.length < 5 && !seenZ[r[1]]) { seenZ[r[1]] = 1; pairs.push([a, r[1]]); } }); if (pairs.length < 4) return null; return { t: 'match', q: cmpT ? '把原级和比较级配对' : '把动词原形和过去式配对', pairs: pairs, exp: pairs.map(function (p) { return p[0] + ' → ' + p[1]; }).join('；'), _src: l.title }; }
  lessonWords(l).forEach(function (w) { var z = shortZh(w.zh); if (pairs.length < 5 && !seenZ[z] && w.w.length <= 22) { seenZ[z] = 1; pairs.push([w.w, z]); } });
  if (pairs.length < 4) return null;
  return { t: 'match', q: '点击配对', pairs: pairs, exp: pairs.map(function (p) { return p[0] + ' = ' + p[1]; }).join('；'), _src: l.title };
}
function genPic(l) {
  var lw = lessonWords(l).filter(function (w) { return emojiOf(w.w); }); if (!lw.length) return null;
  var w = (l.words || []).length ? (lw.filter(function (x) { return (l.words || []).indexOf(x.w) >= 0; })[0] || lw[0]) : pick(lw);
  w = pick(lw.slice(0, Math.max(1, Math.min(3, lw.length))));
  var used = {}; used[emojiOf(w.w)] = 1; var opts = [w];
  shuffle(WORDS).forEach(function (x) { var e = emojiOf(x.w); if (opts.length < 4 && e && !used[e] && x.w !== w.w && shortZh(x.zh) !== shortZh(w.zh)) { used[e] = 1; opts.push(x); } });
  if (opts.length < 3) return null;
  opts = shuffle(opts.slice(0, opts.length >= 4 && Math.random() < .6 ? 4 : 3));
  return { t: 'pic', prompt: shortZh(w.zh), word: w.w, opts: opts.map(function (x) { return { w: x.w, e: emojiOf(x.w) }; }), a: opts.indexOf(w), exp: w.w + ' ' + (w.ph || '') + '：' + w.zh, _src: l.title };
}
function genBlank(l) {
  var c = sentPool(l, 12); if (!c.length) return null;
  var lw = {}; lessonWords(l).forEach(function (w) { if (!/\s/.test(w.w)) lw[w.w.toLowerCase()] = 1; if (w.past) lw[w.past.toLowerCase()] = 1; });
  var tries = shuffle(c);
  for (var i = 0; i < tries.length; i++) {
    var s = tries[i], toks = enTiles(s.en), cand = toks.filter(function (t) { return lw[t.toLowerCase()]; });
    if (!cand.length) cand = toks.filter(function (t) { return t.length >= 4 && /^[a-z]/.test(t) && !/'/.test(t); });
    if (!cand.length) continue;
    var target = pick(cand), re = new RegExp('\\b' + target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b'), m = s.en.match(re); if (!m) continue;
    var before = s.en.slice(0, m.index), after = s.en.slice(m.index + target.length);
    var pool = {}; Object.keys(lw).forEach(function (k) { pool[k] = 1; }); otherSents(l._u, s.en).slice(0, 30).forEach(function (x) { enTiles(x[1]).forEach(function (t) { if (t.length >= 3 && /^[a-z]+$/.test(t)) pool[t] = 1; }); });
    delete pool[target.toLowerCase()];
    var ds = shuffle(Object.keys(pool)).filter(function (x) { return Math.abs(x.length - target.length) <= 4; }).slice(0, 2);
    if (ds.length < 2) continue;
    var opts = shuffle([target].concat(ds));
    return { t: 'blank', before: before, after: after, opts: opts, a: opts.indexOf(target), full: s.en, zh: s.zh, exp: '完整句子：' + s.en + (s.zh ? '（' + s.zh + '）' : ''), _src: l.title };
  }
  return null;
}
function genDialog(l) {
  var p = l.passage && PASSAGES[l.passage]; if (!p) return null;
  var L = p.lines, idx = [];
  for (var i = 0; i < L.length - 1; i++) if (L[i][0] && L[i + 1][0] && L[i][0] !== L[i + 1][0] && wc(L[i][1]) <= 16 && wc(L[i + 1][1]) <= 14) idx.push(i);
  if (!idx.length) return null;
  var k = pick(idx), right = L[k + 1][1];
  var others = shuffle(otherSents(l._u, right).filter(function (x) { return x[1] !== right && x[1] !== L[k][1] && x[0]; })).map(function (x) { return x[1]; });
  var ds = []; others.forEach(function (o) { if (ds.length < 2 && ds.indexOf(o) < 0 && o !== right) ds.push(o); });
  if (ds.length < 2) return null;
  var opts = shuffle([right].concat(ds));
  return { t: 'dialog', who: L[k][0], line: L[k][1], lineZh: L[k][2], me: L[k + 1][0], opts: opts, a: opts.indexOf(right), exp: right + '（' + L[k + 1][2] + '）', _src: l.title };
}
var GEN = { match: genMatch, pic: genPic, transZE: genTransZE, transEZ: genTransEZ, ltap: genListenTap, blank: genBlank, dialog: genDialog, speak: genSpeak };
function listenOff() { return S.offUntil.listen > Date.now(); }
function isListenType(q) { return q.t === 'listen' || q.t === 'ltap' || (q.t === 'order' && q.say && /听/.test(q.q || '')); }
function pickLessonQs(l) {
  var hand = shuffle(l.questions.filter(function (q) { return !q.auto; })), auto = shuffle(l.questions.filter(function (q) { return q.auto; }));
  var gen = [];
  ['pic', 'match', 'transZE', 'dialog', 'ltap', 'blank', 'transEZ', 'speak'].forEach(function (k) { try { var q = GEN[k](l); if (q) gen.push(q); } catch (e) { } });
  var nHand = Math.min(hand.length, Math.max(5, 14 - gen.length - 2));
  var out = hand.slice(0, nHand).concat(auto.slice(0, Math.max(1, 14 - nHand - gen.length))).concat(gen);
  if (listenOff()) out = out.filter(function (q) { return !isListenType(q); });
  out = shuffle(out.slice(0, 16));
  // open with a gentle question (picture / match) like Duolingo
  var fi = -1; out.forEach(function (q, i) { if (fi < 0 && (q.t === 'pic' || q.t === 'match')) fi = i; });
  if (fi > 0) out.unshift(out.splice(fi, 1)[0]);
  return out;
}
function startWordPractice(uid) {
  var u = UNITS.filter(function (x) { return x.id === uid; })[0]; if (!u || !u.words.length) return;
  var ws = shuffle(u.words.filter(function (w) { return w.w !== 'was'; })).slice(0, 9), qs = [];
  var fake = { _u: u, words: ws.map(function (w) { return w.w; }), title: '单词练习', key: [], questions: [] };
  var m = genMatch(fake); if (m) qs.push(m);
  ws.forEach(function (w, i) {
    var others = shuffle(u.words.filter(function (x) { return x.w !== w.w && x.zh !== w.zh; })).slice(0, 2);
    var kind = i % 4;
    if (kind === 0 && emojiOf(w.w)) { var pq = genPic({ _u: u, words: [w.w], title: '单词练习', key: [] }); if (pq) { qs.push(pq); return; } }
    if (kind <= 1) { var o1 = shuffle([w.zh].concat(others.map(function (x) { return x.zh; }))); qs.push({ t: 'choice', q: '“' + w.w + '” 的意思是？', say: w.w, opts: o1, a: o1.indexOf(w.zh), exp: w.w + ' ' + w.ph + '：' + w.zh, _src: '单词练习' }); }
    else if (kind === 2 && !listenOff()) { var o2 = shuffle([w.w].concat(others.map(function (x) { return x.w; }))); qs.push({ t: 'listen', q: '听一听，选出你听到的单词', say: w.w, opts: o2, a: o2.indexOf(w.w), exp: w.w + ' ' + w.ph + '：' + w.zh, _src: '单词练习' }); }
    else if (w.req && !w.proper) qs.push({ t: 'fill', q: '根据中文写出单词：' + w.zh + '（首字母 ' + w.w[0] + '）', a: w.w, exp: w.w + ' ' + w.ph + '：' + w.zh, _src: '单词练习' });
    else { var o3 = shuffle([w.w].concat(others.map(function (x) { return x.w; }))); qs.push({ t: 'choice', q: '“' + w.zh + '” 用英语怎么说？', opts: o3, a: o3.indexOf(w.w), exp: w.w + ' ' + w.ph + '：' + w.zh, _src: '单词练习' }); }
  });
  startSession({ mode: 'words', title: '单词练习', questions: qs, unitId: uid });
}
function practiceLessons() { var ls = ALL_LESSON_IDS.map(function (k) { return LESSONS[k]; }).filter(function (l) { return lessonComplete(l.id) || isUnlocked(l); }); return ls.length ? ls : [LESSONS[ALL_LESSON_IDS[0]]]; }
function startListenPractice() {
  var ls = shuffle(practiceLessons()), qs = [];
  ls.forEach(function (l) { if (qs.length >= 10) return; var a = genListenTap(l); if (a) qs.push(a); var b = shuffle(l.questions.filter(function (q) { return q.t === 'listen'; }))[0]; if (b && qs.length < 10) qs.push(b); });
  if (!qs.length) return toast('还没有可练的听力题');
  S.offUntil.listen = 0; startSession({ mode: 'practice', kind: 'listen', title: '听力练习', questions: qs.slice(0, 10) });
}
function startSpeakPractice() {
  if (isWX) return wxGuideModal();
  if (!SR) return modal('<div class="e">🎤</div><h2>当前浏览器不支持语音识别</h2><p class="sub">请用电脑或安卓上的 Chrome / Edge 打开本站；也可以去「课文听读」里录音跟读、回放对比。</p><button class="btn block" data-close>好的</button>', function (m, c) { $('[data-close]', m).onclick = c; });
  S.offUntil.speak = 0; var ls = shuffle(practiceLessons()), qs = [];
  ls.forEach(function (l) { if (qs.length < 8) { var q = genSpeak(l); if (q) qs.push(q); } });
  startSession({ mode: 'practice', kind: 'speak', title: '口语练习', questions: qs });
}
function startMixedPractice() {
  var ls = shuffle(practiceLessons().filter(lessonCompleteL)).slice(0, 6); if (!ls.length) ls = practiceLessons().slice(0, 2);
  var qs = []; ls.forEach(function (l) { qs = qs.concat(pickLessonQs(l).slice(0, 3)); });
  startSession({ mode: 'practice', kind: 'mix', title: '综合练习', questions: shuffle(qs).slice(0, 12) });
}
function lessonCompleteL(l) { return lessonComplete(l.id); }

/* ================= lesson session engine ================= */
var session = null;
var TYPE_TITLE = {
  choice: '选择正确答案', listen: '你听到了什么？', fill: '填写单词', order: '把单词排成句子', match: '点击配对',
  pic: '选择正确的图片', trans: '翻译这句话', ltap: '你听到了什么？', blank: '选词填空', dialog: '完成对话', speak: '大声读出这句话', dict: '听写单词'
};
var PRAISE = ['太棒了！', '答对了！', '真厉害！', 'Great!', 'Excellent!', 'Nice!', '完美！'];
var SAD = ['别灰心，再看一下', '差一点点！', '没关系，记住它', '下次一定行！'];
var COMBO_TXT = { 3: '三连对！', 5: '五连对！手感火热 🔥', 8: '八连对！停不下来！', 10: '十连对！你是超级明星 ⭐', 15: '十五连对！太强了！' };
function heartsHtml() { return '<span class="lhearts' + (S.hearts <= 1 ? ' low' : '') + '"><svg width="26" height="24" viewBox="0 0 24 22"><path d="M12 21 C5 15 1 11.5 1 7 C1 3.5 3.7 1 7 1 C9.2 1 11 2.3 12 4 C13 2.3 14.8 1 17 1 C20.3 1 23 3.5 23 7 C23 11.5 19 15 12 21Z" fill="#ff4b4b"/><path d="M6 5 q2 -2 4 0" stroke="#fff" stroke-width="2" fill="none" opacity=".6"/></svg><b>' + S.hearts + '</b></span>'; }
function startSession(o) {
  regen();
  if (o.mode === 'lesson' && S.hearts <= 0 && !S.parent.unlimitedHearts) { heartsOutModal(function () { startSession(o); }); return; }
  if (!o.questions || !o.questions.length) { toast('暂时没有题目'); return; }
  TTS.stop(); streakJustUp = false;
  session = { o: o, queue: o.questions.slice(), total: o.questions.length, done: 0, mistakes: 0, wrongSet: {}, combo: 0, maxCombo: 0, bonus: 0, t0: Date.now(), firstTry: 0, answered: 0, wasStreakToday: streakToday() };
  document.body.classList.add('inlesson');
  renderQ();
}
function heartsOutModal(onRefill, inLesson) {
  regen(); var mins = Math.ceil(nextHeartIn() / 60000), cost = 50;
  modal(mascot('sad', 90) + '<h2>爱心用完了</h2><p class="sub">每 30 分钟恢复 1 颗爱心（下一颗约 ' + mins + ' 分钟后）。<br>做一次练习可以赚回 1 颗爱心。</p>' +
    '<button class="btn block blue" id="hbuy"' + (S.gems < cost ? ' disabled' : '') + '>💎 ' + cost + ' 宝石补满爱心</button>' +
    '<button class="btn block" id="hprac" style="margin-top:12px">💪 去练习赚爱心</button>' +
    '<button class="btn block ghost" id="hno" style="margin-top:12px">' + (inLesson ? '退出本课' : '稍后再说') + '</button>', function (m, close) {
      $('#hbuy', m).onclick = function () { if (S.gems < cost) return; S.gems -= cost; S.stats.buys = (S.stats.buys || 0) + 1; gainHeart(5); sfx.buy(); close(); renderChrome(); onRefill && onRefill(); };
      $('#hprac', m).onclick = function () { close(); closeLesson(true); location.hash = '#/practice'; };
      $('#hno', m).onclick = function () { close(); if (inLesson) closeLesson(true); };
    }, 'sticky');
}
function closeLesson(silent) {
  TTS.stop(); clearInterval(mockTimer); try { if (activeRec) activeRec.abort(); } catch (e) { }
  $('#overlay').innerHTML = ''; document.body.classList.remove('inlesson'); document.onkeydown = null; session = null;
  if (!silent) render();
}
function topBarHtml(s) {
  var pct = Math.round(s.done * 100 / Math.max(1, s.total));
  var right = s.o.mode === 'mock' ? '<span class="lhearts mockt" id="mockt">⏱ ' + fmtTime(Math.max(0, Math.ceil((s.o.deadline - Date.now()) / 1000))) + '</span>' : s.o.mode === 'lesson' ? heartsHtml() : (s.o.maxMistakes ? '<span class="lhearts chal">✖ ' + s.mistakes + '/' + s.o.maxMistakes + '</span>' : '<span class="lhearts inf">∞</span>');
  return '<div class="ltop"><button class="x" id="qx" aria-label="退出">✕</button><div class="lbar' + (s.combo >= 3 ? ' hot' : '') + '"><i style="width:' + pct + '%"></i>' + (s.combo >= 3 ? '<span class="streaktag">🔥 ' + s.combo + ' 连对</span>' : '') + '</div>' + right + '</div>';
}
function tilesHtml(id) { return '<div class="tileans" id="' + id + 'A"></div><div class="tilebank" id="' + id + 'B"></div>'; }
function optCards(opts, cls) { return '<div class="opts ' + (cls || '') + '">' + opts.map(function (o, i) { return '<button class="opt" data-o="' + i + '"><span class="k">' + (i + 1) + '</span><span class="ot">' + esc(o) + '</span></button>'; }).join('') + '</div>'; }
function speakerBtns() { return '<div class="spkrow"><button class="spk" id="sp1" aria-label="播放">' + svgSpeaker() + '</button><button class="spk slow" id="sp2" aria-label="慢速">🐢</button></div>'; }
function svgSpeaker() { return '<svg width="38" height="38" viewBox="0 0 24 24"><path d="M3 9v6h4l5 4V5L7 9H3z" fill="#fff"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/></svg>'; }
function avatarFor(name) { var cs = ['#ff9600', '#1cb0f6', '#ce82ff', '#ff4b4b', '#2fb344', '#ffc800']; return '<span class="who" style="background:' + cs[hashStr(name || '?') % cs.length] + '">' + esc((name || '?').charAt(0)) + '</span>'; }

function renderQ() {
  var s = session; if (!s) return;
  if (!s.queue.length) return finishSession();
  var q = s.queue[0]; s.cur = q; s.answer = null; s.state = 'ask';
  var retry = s.wrongSet[qKey(q)];
  var h = '<div class="lesson"><div class="inner">' + topBarHtml(s) + '<div class="lbody" id="lbody"><button class="qflag" id="qflag" title="这道题有问题？">🚩 报错</button>' + (retry && s.o.mode !== 'mock' ? '<div class="retag">🔄 之前的错题</div>' : '') + (s.o.mode === 'mock' ? '<div class="mocktag">第 ' + (s.done + 1) + ' / ' + s.total + ' 题 · ' + MOCK_CAT[mockCat(q)][1] + '</div>' : '');
  var title = TYPE_TITLE[q.t] || '';
  var pipMood = 'idle';
  switch (q.t) {
    case 'choice':
      h += '<h2 class="qh">' + esc(q.q) + '</h2>' + (q.say ? '<div class="pipline"><div class="pipwrap qpip">' + mascot('idle', 76) + '</div><button class="speech say" id="sp1">🔊 ' + esc(q.say) + '</button></div>' : '') + optCards(q.opts); break;
    case 'listen':
      h += '<h2 class="qh">' + esc(q.q || title) + '</h2>' + speakerBtns() + optCards(q.opts); break;
    case 'fill':
      h += '<h2 class="qh">' + esc(q.q) + '</h2>' + (q.hint ? '<div class="sub">' + esc(q.hint) + '</div>' : '') + '<div class="pipline"><div class="pipwrap qpip">' + mascot('think', 76) + '</div><div class="speech">用键盘拼出这个单词 ✍️</div></div><input class="ans" id="fin" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="在这里输入英文">'; break;
    case 'order':
      q.ansTiles = q.a.split(' ');
      if (!s.tiles) { }
      h += '<h2 class="qh">' + esc(q.q || title) + '</h2>' + (q.say ? speakerBtns() : '') + tilesHtml('t'); break;
    case 'match':
      h += '<h2 class="qh">' + esc(title) + '</h2><div class="match">';
      var L = shuffle(q.pairs.map(function (p, i) { return { t: p[0], i: i }; })), R = shuffle(q.pairs.map(function (p, i) { return { t: p[1], i: i }; }));
      for (var i = 0; i < L.length; i++) h += '<button class="opt mt" data-l="' + L[i].i + '">' + esc(L[i].t) + '</button><button class="opt mt" data-r="' + R[i].i + '">' + esc(R[i].t) + '</button>';
      h += '</div>'; break;
    case 'pic':
      h += '<h2 class="qh">哪一个是 “' + esc(q.prompt) + '”？</h2><div class="pics n' + q.opts.length + '">' + q.opts.map(function (o, i) { return '<button class="pic opt" data-o="' + i + '"><span class="pe">' + o.e + '</span><span class="pw">' + esc(o.w) + '</span><span class="k">' + (i + 1) + '</span></button>'; }).join('') + '</div>'; break;
    case 'trans':
      h += '<h2 class="qh">' + title + '</h2><div class="pipline"><div class="pipwrap qpip">' + mascot('idle', 84) + '</div><div class="speech">' + (q.dir === 'ez' ? '<button class="ibtn sm" id="sp1">🔊</button> ' : '') + '<span class="' + (q.dir === 'ez' ? 'en' : 'zhp') + '">' + esc(q.prompt) + '</span></div></div>' + tilesHtml('t'); break;
    case 'ltap':
      h += '<h2 class="qh">' + title + '</h2>' + speakerBtns() + tilesHtml('t') + '<div class="kbwrap hidden"><textarea class="ans" id="kbin" rows="2" placeholder="用英语输入你听到的句子" autocomplete="off" autocapitalize="off" spellcheck="false"></textarea></div><button class="linkbtn" id="kbtog">⌨️ 用键盘输入</button>'; break;
    case 'blank':
      h += '<h2 class="qh">' + title + '</h2><div class="pipline"><div class="pipwrap qpip">' + mascot('think', 76) + '</div><div class="speech blanks"><span>' + esc(q.before) + '</span><span class="gap" id="gap">&nbsp;</span><span>' + esc(q.after) + '</span>' + (q.zh ? '<div class="zhs">' + esc(q.zh) + '</div>' : '') + '</div></div>' + '<div class="chips">' + q.opts.map(function (o, i) { return '<button class="opt chip" data-o="' + i + '">' + esc(o) + '</button>'; }).join('') + '</div>'; break;
    case 'dialog':
      h += '<h2 class="qh">' + title + '</h2><div class="dlg"><div class="dline">' + avatarFor(q.who) + '<div class="speech"><small>' + esc(q.who) + '</small><button class="ibtn sm" id="sp1">🔊</button> ' + esc(q.line) + (q.lineZh ? '<div class="zhs">' + esc(q.lineZh) + '</div>' : '') + '</div></div>' +
        '<div class="dline me"><div class="speech ghost">你是 <b>' + esc(q.me) + '</b>，该怎么回答？</div><div class="pipwrap qpip">' + mascot('think', 64) + '</div></div></div>' + optCards(q.opts, 'dopts'); break;
    case 'dict':
      h += '<h2 class="qh">' + title + '</h2>' + speakerBtns() + (S.settings.dictZh !== false ? '<div class="dicthint">💡 ' + esc(q.zh || '') + '</div>' : '<button class="linkbtn" id="dzh">💡 看中文提示</button><div class="dicthint hidden" id="dzht">💡 ' + esc(q.zh || '') + '</div>') +
        '<input class="ans dictin" id="fin" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="听一听，拼出这个单词">'; break;
    case 'speak':
      h += '<h2 class="qh">' + title + '</h2><div class="pipline"><div class="pipwrap qpip">' + mascot('idle', 84) + '</div><div class="speech"><button class="ibtn sm" id="sp1">🔊</button> <span class="spw">' + q.say.split(/\s+/).map(function (w, i) { return '<span data-w="' + i + '">' + esc(w) + '</span>'; }).join(' ') + '</span>' + (q.zh ? '<div class="zhs">' + esc(q.zh) + '</div>' : '') + '</div></div>' +
        '<button class="micbtn" id="mic"><span class="mic">🎤</span><span id="mict">点击开始说话</span></button><div class="sub center" id="heard"></div>'; break;
  }
  var skipTxt = s.o.mode === 'mock' ? '跳过这题' : (q.t === 'listen' || q.t === 'ltap' || (q.t === 'order' && q.say)) ? "CAN'T LISTEN NOW · 现在不方便听" : q.t === 'speak' ? "CAN'T SPEAK NOW · 现在不方便说" : '跳过';
  h += '</div><div class="lfoot" id="foot"><div class="fbrow"><div class="fb" id="fb"></div><div class="fbtns"><button class="btn ghost skip" id="skip">' + skipTxt + '</button><button class="btn gray" id="chk" disabled>CHECK · 检查</button></div></div></div></div></div>';
  $('#overlay').innerHTML = h;
  mountQ(q, s);
}
function mountQ(q, s) {
  var ov = $('#overlay'), chk = $('#chk', ov);
  function ready(v) { chk.disabled = !v; chk.className = 'btn' + (v ? '' : ' gray'); }
  $('#qx', ov).onclick = function () { quitConfirm(); };
  var sp1 = $('#sp1', ov), sp2 = $('#sp2', ov), text = q.say || (q.t === 'dialog' ? q.line : (q.t === 'trans' ? q.prompt : ''));
  if (sp1 && text) sp1.onclick = function () { speakEn(text); pulse(sp1); };
  if (sp2 && text) sp2.onclick = function () { speakEn(text, true); pulse(sp2); };
  if (q.t === 'listen' || q.t === 'ltap' || q.t === 'dict' || (q.t === 'order' && q.say) || (q.t === 'choice' && q.say) || q.t === 'dialog' || (q.t === 'trans' && q.dir === 'ez')) setTimeout(function () { if (session && session.cur === q) speakEn(text); }, 300);
  // options
  if (['choice', 'listen', 'pic', 'blank', 'dialog'].indexOf(q.t) >= 0) {
    $$('.opt[data-o]', ov).forEach(function (b) {
      b.onclick = function () {
        if (s.state !== 'ask') return; sfx.tap();
        $$('.opt[data-o]', ov).forEach(function (x) { x.classList.remove('sel'); }); b.classList.add('sel'); s.answer = +b.getAttribute('data-o'); ready(true);
        if (q.t === 'pic') speakEn(q.opts[s.answer].w);
        if (q.t === 'blank') { var g = $('#gap', ov); g.textContent = q.opts[s.answer]; g.classList.add('filled'); }
      };
    });
  }
  var dz = $('#dzh', ov); if (dz) dz.onclick = function () { dz.remove(); $('#dzht', ov).classList.remove('hidden'); };
  $('#qflag', ov).onclick = function () { reportModal(q, s.state === 'ask' ? null : s.answer); };
  if (q.t === 'fill' || q.t === 'dict') { var fi = $('#fin', ov); setTimeout(function () { try { fi.focus(); } catch (e) { } }, 50); fi.oninput = function () { s.answer = fi.value; ready(fi.value.trim().length > 0); }; fi.onkeydown = function (e) { if (e.key === 'Enter' && fi.value.trim()) { e.preventDefault(); chk.click(); } }; }
  if (q.t === 'order' || q.t === 'trans' || q.t === 'ltap') {
    var tiles = (q.t === 'order' ? (function () { var t = shuffle(q.ansTiles); if (t.join(' ') === q.ansTiles.join(' ') && t.length > 1) t.reverse(); return t; })() : q.tiles).map(function (t, i) { return { t: t, i: i }; });
    s.picked = [];
    var A = $('#tA', ov), Bk = $('#tB', ov);
    Bk.innerHTML = tiles.map(function (x, k) { return '<span class="slot"><button class="tile" data-b="' + k + '">' + esc(x.t) + '</button></span>'; }).join('');
    var draw = function () {
      A.innerHTML = s.picked.map(function (x, k) { return '<button class="tile in" data-k="' + k + '">' + esc(x.t) + '</button>'; }).join('');
      $$('[data-b]', Bk).forEach(function (b) { b.classList.toggle('used', s.picked.indexOf(tiles[+b.getAttribute('data-b')]) >= 0); });
      $$('[data-k]', A).forEach(function (b) { b.onclick = function () { if (s.state !== 'ask') return; sfx.tap(); s.picked.splice(+b.getAttribute('data-k'), 1); draw(); }; });
      s.answer = q.t === 'trans' && q.dir === 'ez' ? s.picked.map(function (x) { return x.t; }).join('') : s.picked.map(function (x) { return x.t; }).join(' ');
      ready(s.picked.length > 0 && (q.t !== 'order' || s.picked.length === tiles.length));
    };
    $$('[data-b]', Bk).forEach(function (b) { b.onclick = function () { if (s.state !== 'ask' || b.classList.contains('used')) return; sfx.tap(); var x = tiles[+b.getAttribute('data-b')]; s.picked.push(x); if (/^[A-Za-z]/.test(x.t) && q.t !== 'ltap') TTS.one(x.t, 'en-US'); draw(); }; });
    draw();
    var kt = $('#kbtog', ov);
    if (kt) kt.onclick = function () {
      var kw = $('.kbwrap', ov), on = kw.classList.toggle('hidden'); s.kb = !on; A.classList.toggle('hidden', s.kb); Bk.classList.toggle('hidden', s.kb);
      kt.textContent = s.kb ? '🧩 用单词块' : '⌨️ 用键盘输入';
      var ki = $('#kbin', ov); if (s.kb) { setTimeout(function () { ki.focus(); }, 30); s.answer = ki.value; ready(ki.value.trim().length > 0); } else draw();
      ki.oninput = function () { s.answer = ki.value; ready(ki.value.trim().length > 0); };
      ki.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); if (ki.value.trim()) chk.click(); } };
    };
  }
  if (q.t === 'match') {
    s.sel = null; s.matched = 0; s.matchErr = false;
    $$('.match .opt', ov).forEach(function (b) {
      b.onclick = function () {
        if (s.state !== 'ask' || b.classList.contains('done')) return;
        var side = b.hasAttribute('data-l') ? 'l' : 'r', idx = b.getAttribute('data-' + side);
        if (/^[A-Za-z]/.test(b.textContent)) speakEn(b.textContent); else sfx.tap();
        if (!s.sel || s.sel.side === side) { $$('.match .opt', ov).forEach(function (x) { x.classList.remove('sel'); }); b.classList.add('sel'); s.sel = { b: b, side: side, idx: idx }; return; }
        var a = s.sel.b;
        if (s.sel.idx === idx) {
          a.classList.remove('sel'); a.classList.add('ok'); b.classList.add('ok'); s.sel = null; s.matched++; sfx.good(); vibrate(15);
          setTimeout(function () { a.classList.add('done'); b.classList.add('done'); a.classList.remove('ok'); b.classList.remove('ok'); }, 380);
          if (s.matched === q.pairs.length) { s.answer = !s.matchErr; ready(true); setTimeout(function () { if (s.state === 'ask') check(); }, 450); }
        } else {
          s.matchErr = true; sfx.bad(); vibrate([40, 30, 40]); a.classList.add('bad', 'shake'); b.classList.add('bad', 'shake'); s.sel = null;
          setTimeout(function () { a.classList.remove('bad', 'shake', 'sel'); b.classList.remove('bad', 'shake'); }, 500);
        }
      };
    });
  }
  if (q.t === 'speak') {
    var mic = $('#mic', ov), mt = $('#mict', ov), heard = $('#heard', ov);
    var paint = function (r) { $$('[data-w]', ov).forEach(function (sp, i) { sp.className = r.marks[i] ? 'hit' : ''; }); };
    mic.onclick = function () {
      if (s.state !== 'ask') return;
      if (activeRec) { try { activeRec.stop(); } catch (e) { } return; }
      TTS.stop(); mic.classList.add('on'); mt.textContent = '正在听… 读完后会自动结束';
      recognize(q.say, paint).then(function (r) {
        mic.classList.remove('on'); paint(r); heard.textContent = '听到：' + (r.heard || ''); s.answer = r.score; s.spoke = r; mt.textContent = '再说一次';
        ready(true); if (r.score >= 60) check();
      }).catch(function (e) {
        mic.classList.remove('on'); mt.textContent = '点击开始说话';
        if (e === 'not-allowed' || e === 'service-not-allowed' || e === 'audio-capture') { heard.textContent = '无法使用麦克风，已为你跳过口语题'; S.offUntil.speak = Date.now() + 3600e3; save(); setTimeout(function () { skipQ(true); }, 900); }
        else heard.textContent = '没听清，再试一次吧（' + e + '）';
      });
    };
  }
  $('#skip', ov).onclick = function () { if (s.state !== 'ask') return; if (s.o.mode === 'mock') { mockRecord(q, false, true); s.queue.shift(); s.done++; renderQ(); return; } if (q.t === 'speak') { S.offUntil.speak = Date.now() + 3600e3; save(); dropTypes(function (x) { return x.t === 'speak'; }); toast('好的，接下来 1 小时不出口语题'); } else if (isListenType(q)) { S.offUntil.listen = Date.now() + 3600e3; save(); dropTypes(isListenType); toast('好的，接下来 1 小时不出听力题'); } else skipQ(false); };
  chk.onclick = function () { if (s.state === 'ask') { if (!chk.disabled) check(); } else next(); };
  document.onkeydown = function (e) {
    if (!session || !$('#chk')) return;
    var tag = (e.target && e.target.tagName) || '';
    if (e.key === 'Enter' && tag !== 'INPUT' && tag !== 'TEXTAREA') { e.preventDefault(); $('#chk').click(); }
    if (s.state === 'ask' && /^[1-4]$/.test(e.key) && tag !== 'INPUT' && tag !== 'TEXTAREA') { var b = $$('.opt[data-o]', $('#overlay'))[+e.key - 1]; if (b) b.click(); }
  };
}
function pulse(el) { el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); }
function quitConfirm() {
  var s = session; if (!s) return;
  modal(mascot('sad', 90) + '<h2>等一下，别走！</h2><p class="sub">现在退出，本节的进度不会保存哦。</p><button class="btn block" id="qk">继续学习</button><button class="btn block ghost red-t" id="qq" style="margin-top:12px">结束学习</button>', function (m, close) {
    $('#qk', m).onclick = close; $('#qq', m).onclick = function () { close(); closeLesson(); };
  });
}
function dropTypes(fn) {
  var s = session, before = s.queue.length; s.queue = s.queue.filter(function (x) { return !fn(x); });
  var removed = before - s.queue.length; s.total = Math.max(s.done, s.total - removed);
  if (!s.queue.length && s.done === 0) { closeLesson(); return; }
  renderQ();
}
function skipQ() { var s = session; s.queue.shift(); s.done++; renderQ(); }
function isRight(q, ans) {
  switch (q.t) {
    case 'choice': case 'listen': case 'pic': case 'blank': case 'dialog': return ans === q.a;
    case 'dict': return norm(ans) === norm(q.a);
    case 'fill': var a = norm(ans); return [q.a].concat(q.alts || []).some(function (x) { return norm(x) === a; });
    case 'order': return norm(ans) === norm(q.a);
    case 'ltap': return norm(ans) === norm(q.ans);
    case 'trans': if (q.dir === 'ez') return zhNorm(ans) === zhNorm(q.ans) || zhNorm(ans) === zhNorm(q.ansTiles.join('')); return norm(ans) === norm(q.ans);
    case 'match': return ans === true;
    case 'speak': return typeof ans === 'number' && ans >= 60;
  }
  return false;
}
function rightText(q) {
  switch (q.t) {
    case 'choice': case 'listen': case 'blank': case 'dialog': return q.opts[q.a];
    case 'pic': return q.opts[q.a].e + ' ' + q.opts[q.a].w;
    case 'match': return '';
    case 'trans': case 'ltap': return q.ans;
    case 'speak': return q.say;
  }
  return q.a;
}
function setPip(mood) { $$('.qpip', $('#overlay')).forEach(function (p) { var sv = p.querySelector('svg'); p.innerHTML = mascot(mood, sv ? +sv.getAttribute('width') : 76); p.classList.remove('jump'); void p.offsetWidth; p.classList.add('jump'); }); }
function check() {
  var s = session, q = s.cur, ok = isRight(q, s.answer), ov = $('#overlay'), key = qKey(q);
  s.state = 'shown'; s.answered++;
  var d0 = D(); d0.ans = (d0.ans || 0) + 1; if (!ok) trackMiss(q);
  if (q.t === 'dict') { var DW = P().dictWrong, wk = String(q.a).toLowerCase(); if (!ok) DW[wk] = (DW[wk] || 0) + 1; else if (DW[wk] && !s.wrongSet[key]) { DW[wk]--; if (DW[wk] <= 0) delete DW[wk]; } }
  if (s.o.mode === 'mock') {
    if (ok) { s.firstTry++; d0.correct = (d0.correct || 0) + 1; } else { s.mistakes++; s.wrongSet[key] = 1; addWrong(q); }
    mockRecord(q, ok); s.queue.shift(); s.done++; save(); sfx.tap(); renderQ(); return;
  }
  if (['choice', 'listen', 'pic', 'blank', 'dialog'].indexOf(q.t) >= 0) $$('.opt[data-o]', ov).forEach(function (b) { var i = +b.getAttribute('data-o'); if (i === q.a) b.classList.add('good'); else if (i === s.answer) b.classList.add('bad'); });
  var foot = $('#foot', ov), fb = $('#fb', ov), chk = $('#chk', ov), d = D();
  $('#skip', ov).style.display = 'none';
  if (ok) {
    sfx.good(); vibrate(25); s.done++; s.combo++; s.maxCombo = Math.max(s.maxCombo, s.combo); if (!s.wrongSet[key]) s.firstTry++;
    d.correct = (d.correct || 0) + 1; if (isListenType(q)) { d.listenQ = (d.listenQ || 0) + 1; S.stats.listened = (S.stats.listened || 0) + 1; }
    if (q.t === 'speak') { d.shadow = (d.shadow || 0) + 1; S.stats.spoken = (S.stats.spoken || 0) + 1; }
    if (s.o.mode === 'review') { var w = P().wrong[key]; if (w && !s.wrongSet[key]) { w.box++; w.due = Date.now() + BOXDAYS[Math.min(w.box, 5)] * 86400000; } S.stats.reviewed++; bump('reviews'); }
    if (s.combo >= 3) s.bonus += 1;
    d.combo = Math.max(d.combo || 0, s.combo); S.stats.maxCombo = Math.max(S.stats.maxCombo, s.combo);
    if (COMBO_TXT[s.combo] || (s.combo > 15 && s.combo % 5 === 0)) { setTimeout(function () { sfx.combo(s.combo); }, 260); var c = document.createElement('div'); c.className = 'combo'; c.innerHTML = '🔥 ' + (COMBO_TXT[s.combo] || s.combo + ' 连对！'); document.body.appendChild(c); setTimeout(function () { c.remove(); }, 1300); }
    foot.className = 'lfoot good'; setPip('happy');
    fb.innerHTML = '<div class="fbhead"><span class="fbic">✔</span><b>' + PRAISE[Math.floor(Math.random() * PRAISE.length)] + '</b></div>' + (q.t === 'speak' && s.spoke ? '<div class="exp">发音得分 ' + s.spoke.score + ' 分</div>' : '') + (q.t === 'trans' || q.t === 'ltap' ? '<div class="exp"><b>' + esc(q.ans) + '</b></div>' : '') + '<div class="exp">' + esc(q.exp || '') + '</div>';
    chk.className = 'btn'; chk.textContent = 'CONTINUE · 继续';
    s.queue.shift();
    var lb = $('#lbody', ov); lb.classList.add('pop');
  } else {
    sfx.bad(); vibrate([60, 40, 60]); s.combo = 0; s.mistakes++; s.wrongSet[key] = 1;
    if (s.o.mode === 'lesson' && !S.parent.unlimitedHearts) loseHeart();
    if (s.o.mode !== 'review' || !P().wrong[key]) addWrong(q); else { var ww = P().wrong[key]; ww.box = 0; ww.n++; ww.due = Date.now() + 10 * 60 * 1000; }
    var rt = rightText(q);
    foot.className = 'lfoot bad'; setPip('sad');
    fb.innerHTML = '<div class="fbhead"><span class="fbic">✖</span><b>' + (rt ? '正确答案：' : SAD[Math.floor(Math.random() * SAD.length)]) + '</b></div>' + (rt ? '<div class="ans-r">' + esc(rt) + '</div>' : '') + '<div class="exp">' + esc(q.exp || '') + '</div>';
    chk.className = 'btn red'; chk.textContent = 'CONTINUE · 知道了';
    var qq = s.queue.shift(); s.queue.splice(Math.min(s.queue.length, 2 + Math.floor(Math.random() * 3)), 0, qq);
    var lb2 = $('#lbody', ov); lb2.classList.add('shake'); setTimeout(function () { lb2.classList.remove('shake'); }, 450);
  }
  var bar = $('.lbar', ov); if (bar) { bar.classList.toggle('hot', s.combo >= 3); $('i', bar).style.width = Math.round(s.done * 100 / s.total) + '%'; var tg = $('.streaktag', bar); if (tg) tg.remove(); if (s.combo >= 3) bar.insertAdjacentHTML('beforeend', '<span class="streaktag">🔥 ' + s.combo + ' 连对</span>'); }
  var hs = $('.lhearts', ov); if (hs && s.o.mode === 'lesson') hs.outerHTML = heartsHtml();
  if (s.o.maxMistakes) { var hc = $('.lhearts.chal', ov); if (hc) hc.textContent = '✖ ' + s.mistakes + '/' + s.o.maxMistakes; }
  save(); renderChrome();
  var sayIt = ok ? null : (q.t === 'order' || q.t === 'fill' ? q.a : q.t === 'ltap' || q.t === 'speak' ? q.say : (q.t === 'trans' && q.dir === 'ze') ? q.ans : (/^[A-Za-z]/.test(rightText(q) || '') && q.t !== 'pic' ? rightText(q) : (q.t === 'pic' ? q.opts[q.a].w : null)));
  if (ok && (q.t === 'trans' && q.dir === 'ze' || q.t === 'blank')) sayIt = q.ans || q.full;
  if (sayIt) setTimeout(function () { speakEn(sayIt); }, 250);
  if (q.exp) { var ex = document.createElement('button'); ex.className = 'ibtn sm fbsay'; ex.textContent = '🔊'; ex.title = '朗读解析'; ex.onclick = function () { TTS.mixed(q.exp); }; $('.fbhead', fb).appendChild(ex); }
  if (!ok && s.o.mode !== 'mock') { var exb = document.createElement('button'); exb.className = 'fbflag fbex'; exb.textContent = '🤔 讲讲我错在哪'; var exAns = ansText(q, s.answer); exb.onclick = function () { explainWrong(q, exAns); }; fb.appendChild(exb); var ww0 = P().wrong[key]; if (ww0) ww0.la = exAns.slice(0, 120); }
  var fl = document.createElement('button'); fl.className = 'fbflag'; fl.textContent = '🚩 报错'; fl.title = '这道题有问题？'; var myAns = s.answer; fl.onclick = function () { reportModal(q, myAns); }; $('.fbhead', fb).appendChild(fl);
  if (s.o.mode === 'lesson' && S.hearts <= 0 && !ok && !S.parent.unlimitedHearts) chk.onclick = function () { heartsOutModal(function () { renderQ(); }, true); };
  if (s.o.maxMistakes && s.mistakes > s.o.maxMistakes) { chk.textContent = '查看结果'; chk.onclick = function () { finishSession(true); }; }
}
function next() { renderQ(); }

/* ---------- finishing: lesson complete → streak screen ---------- */
function finishSession(failed) {
  var s = session; if (!s) return; document.onkeydown = null;
  if (s.o.mode === 'mock') return finishMock(s);
  var o = s.o, acc = Math.round(s.firstTry * 100 / Math.max(1, s.answered ? Math.max(s.firstTry + Object.keys(s.wrongSet).length, 1) : 1)), secs = Math.round((Date.now() - s.t0) / 1000), perfect = s.mistakes === 0;
  acc = Math.round(s.firstTry * 100 / Math.max(1, s.firstTry + Object.keys(s.wrongSet).length));
  var base = 0, title = '小课完成！', mood = 'cheer', extra = '', passed = true, P0 = P();
  if (o.mode === 'lesson') {
    var st = P0.lessons[o.lessonId] = P0.lessons[o.lessonId] || {};
    var stars = perfect ? 3 : s.mistakes <= 2 ? 2 : 1, firstDone = !st.done;
    st.done = true; st.stars = Math.max(st.stars || 0, stars); st.best = Math.max(st.best || 0, acc); st.times = (st.times || 0) + 1; st.last = Date.now();
    base = 10 + (perfect ? 5 : 0) + (firstDone ? 5 : 0); S.stats.lessons++; bump('lessons'); if (perfect) { S.stats.perfect++; bump('perfect'); }
    title = perfect ? '完美！全部一次答对！' : '小课完成！';
    if (!firstDone) extra = '<p class="sub">👑 本课等级提升到 Lv.' + lessonLevel(o.lessonId) + '</p>';
    S.gems += 5;
  } else if (o.mode === 'challenge') {
    passed = !failed && s.mistakes <= o.maxMistakes; var cs = P0.chal[o.unitId] = P0.chal[o.unitId] || {}; bump('chal'); S.stats.chal++;
    if (passed) { var cst = s.mistakes <= 1 ? 3 : s.mistakes <= 2 ? 2 : 1; var firstPass = !cs.pass; cs.pass = true; cs.stars = Math.max(cs.stars || 0, cst); cs.best = Math.max(cs.best || 0, acc); base = 20 + cst * 5; title = '单元挑战成功！'; if (firstPass) { S.gems += 30; extra = '<p class="sub">🏆 获得单元奖杯 · 💎 +30</p>'; } }
    else { title = '差一点点！'; mood = 'sad'; extra = '<p class="sub">错了 ' + s.mistakes + ' 次，超过了 ' + o.maxMistakes + ' 次。错题已收进错题本，复习后再来挑战！</p>'; base = 5; }
  } else if (o.mode === 'jump') {
    passed = !failed && s.mistakes <= o.maxMistakes;
    if (passed) { o.skip.forEach(function (id) { if (!lessonState(id).done) P0.tested[id] = 1; }); base = 15; title = '跳级成功！'; extra = '<p class="sub">已解锁到 ' + esc(o.unitTitle) + '，跳过的小课随时可以回去学。</p>'; }
    else { title = '还差一点'; mood = 'sad'; extra = '<p class="sub">错了 ' + s.mistakes + ' 次。先按顺序学一学，再来跳级吧！</p>'; base = 3; }
  } else if (o.mode === 'review') {
    gainHeart(1); base = 2 * s.firstTry + 2; title = '复习完成！'; extra = '<p class="sub">❤️ 恢复 1 颗爱心</p>';
  } else if (o.mode === 'practice') {
    gainHeart(1); base = 10; title = o.title + '完成！'; extra = '<p class="sub">❤️ 练习赚回 1 颗爱心</p>';
  } else if (o.mode === 'story') {
    var first = !P0.stories[o.storyId]; P0.stories[o.storyId] = { best: Math.max((P0.stories[o.storyId] || {}).best || 0, acc), t: Date.now() }; bump('stories'); base = first ? 10 : 3; title = '故事读完啦！';
  } else if (o.mode === 'words') { bump('wordp'); base = 8; title = '单词练习完成！'; }
  else if (o.mode === 'dict') { bump('dict'); base = 8; title = '听写完成！'; extra = '<p class="sub">一次写对 ' + s.firstTry + ' / ' + s.total + ' 个单词' + (s.mistakes ? '，写错的单词已收进错题本和「错词」' : '') + '</p>'; }
  var bonus = passed ? s.bonus : 0;
  var got = addXP(base + bonus);
  var boostTxt = boostOn() ? ' <span class="pill boost">双倍经验</span>' : '';
  if (passed) { sfx.win(); confetti(); } else sfx.bad();
  var d = D(), goalPct = S.goal ? Math.min(100, Math.round(d.xp * 100 / S.goal)) : 0;
  var h = '<div class="lesson"><div class="inner"><div class="lbody result">' +
    '<div class="resmas ' + (passed ? 'bounce' : '') + '">' + mascot(mood, 150) + '</div><h1 class="rtitle">' + title + '</h1>' + extra +
    '<div class="rstats"><div class="rstat y"><small>总经验 XP</small><b>⚡ ' + got + '</b></div><div class="rstat g"><small>' + (acc >= 90 ? '惊人 Amazing' : acc >= 70 ? '很好 Good' : '正确率') + '</small><b>🎯 ' + acc + '%</b></div><div class="rstat b"><small>' + (secs < 180 ? '飞快 Speedy' : '用时 Time') + '</small><b>⏱ ' + fmtTime(secs) + '</b></div></div>' +
    (bonus ? '<div class="combobonus">🔥 连击奖励 COMBO BONUS +' + bonus + ' XP（最高 ' + s.maxCombo + ' 连对）' + boostTxt + '</div>' : boostTxt) +
    (S.goal ? '<div class="goalrow"><span>🎯 今日目标</span><div class="bar"><i style="width:' + goalPct + '%"></i></div><b>' + d.xp + '/' + S.goal + '</b></div>' : '') +
    (s.mistakes && o.mode !== 'review' ? '<p class="sub">答错的题已收进错题本 🔁</p>' : '') + '</div>' +
    '<div class="lfoot"><div class="fbtns"><button class="btn ghost" id="again">再练一次</button><button class="btn" id="cont">CONTINUE · 继续</button></div></div></div></div>';
  $('#overlay').innerHTML = h;
  var showStreak = streakJustUp && passed !== null && S.streakShown !== today();
  $('#cont').onclick = function () { if (showStreak) { S.streakShown = today(); save(); streakScreen(function () { afterFinish(o); }); } else afterFinish(o); };
  $('#again').onclick = function () { var oo = o; session = null; if (oo.mode === 'lesson') startSession({ mode: 'lesson', title: oo.title, questions: pickLessonQs(LESSONS[oo.lessonId]), lessonId: oo.lessonId }); else if (oo.mode === 'challenge') startChallenge(oo.unitId); else if (oo.mode === 'words') startWordPractice(oo.unitId); else if (oo.mode === 'dict') startDictation(oo.src); else if (oo.mode === 'jump') startJump(oo.unitId); else if (oo.mode === 'practice') { oo.kind === 'listen' ? startListenPractice() : oo.kind === 'speak' ? startSpeakPractice() : startMixedPractice(); } else startSession(oo); };
  session = null; save(); checkAch();
  Cloud.markDirty();
}
function afterFinish(o) {
  closeLesson(true); setTimeout(Eye.maybe, 400);
  if (o.mode === 'lesson' || o.mode === 'jump' || o.mode === 'challenge') { if (location.hash !== '#/' && location.hash !== '') location.hash = '#/'; else render(); setTimeout(scrollToCurrent, 120); }
  else render();
}
function weekStrip(withToday) {
  var mon = mondayOf(), wk = ['一', '二', '三', '四', '五', '六', '日'], h = '<div class="weekcal">';
  for (var i = 0; i < 7; i++) {
    var d = dayOffset(i, mon), dd = S.days[d], on = dd && dd.xp > 0, fz = S.freezeDays[d], isT = d === today();
    h += '<div class="wd' + (on ? ' on' : '') + (fz ? ' fz' : '') + (isT ? ' t' : '') + (withToday && isT ? ' pop' : '') + '"><small>' + wk[i] + '</small><span>' + (on ? '🔥' : fz ? '🧊' : d < today() ? '·' : '') + '</span></div>';
  }
  return h + '</div>';
}
function streakScreen(done) {
  sfx.streak(); vibrate([30, 30, 80]);
  var n = streakNow();
  var h = '<div class="lesson streakscr"><div class="inner"><div class="lbody result"><div class="bigflame"><span class="fl">' + flameSvg(true) + '</span><b class="count" id="scount">' + Math.max(0, n - 1) + '</b></div><h1 class="rtitle orange">' + n + ' 天连胜！</h1><p class="sub">' + (n === 1 ? '连胜开始啦！明天继续来保持火焰 🔥' : '太棒了！每天学一点，火焰越烧越旺。') + '</p>' + weekStrip(true) +
    '<p class="sub">' + (S.freezes ? '🧊 已装备 ' + S.freezes + ' 个连胜冻结' : '去商店买个 🧊 连胜冻结，忘记学习时也能保住连胜') + '</p></div><div class="lfoot"><div class="fbtns"><button class="btn orange" id="sok">CONTINUE · 继续</button></div></div></div></div>';
  $('#overlay').innerHTML = h;
  setTimeout(function () { var c = $('#scount'); if (c) { c.textContent = n; c.classList.add('pop'); } }, 500);
  $('#sok').onclick = done;
}
function startChallenge(uid) {
  var u = UNITS.filter(function (x) { return x.id === uid; })[0]; if (!u) return;
  var pool = []; u.lessons.forEach(function (l) { pool = pool.concat(l.questions); });
  var hand = shuffle(pool.filter(function (q) { return !q.auto; })).slice(0, 9), auto = shuffle(pool.filter(function (q) { return q.auto && q.t !== 'match'; })).slice(0, 3);
  var gen = []; shuffle(u.lessons).slice(0, 3).forEach(function (l) { var g = genTransZE(l) || genBlank(l); if (g) gen.push(g); });
  startSession({ mode: 'challenge', title: u.title + ' 单元挑战', questions: shuffle(hand.concat(auto, gen)), unitId: uid, maxMistakes: 3 });
}
function startJump(uid) {
  var u = UNITS.filter(function (x) { return x.id === uid; })[0]; if (!u || !u.lessons.length) return;
  var skip = lessonsBefore(u, u.lessons[0]).filter(function (l) { return !lessonComplete(l.id); });
  if (!skip.length) return;
  var pool = []; skip.forEach(function (l) { pool = pool.concat(l.questions.filter(function (q) { return q.t !== 'match'; })); });
  var qs = shuffle(pool).slice(0, 10); shuffle(skip).slice(0, 2).forEach(function (l) { var g = genTransZE(l); if (g) qs.push(g); });
  startSession({ mode: 'jump', title: '跳级测试', questions: shuffle(qs), unitId: uid, unitTitle: u.title, maxMistakes: 3, skip: skip.map(function (l) { return l.id; }) });
}
function startLesson(l) { startSession({ mode: 'lesson', title: l.title, questions: pickLessonQs(l), lessonId: l.id }); }

/* ================= chrome: nav, top bar, side panel, dropdowns ================= */
var V = $('#view');
var NAV = [['#/', 'learn', '学习'], ['#/practice', 'practice', '练习'], ['#/league', 'league', '排行榜'], ['#/quests', 'quests', '任务'], ['#/shop', 'shop', '商店'], ['#/me', 'me', '我的']];
var NAVICON = {
  learn: '<svg viewBox="0 0 32 32"><path d="M4 14 16 4l12 10v13a2 2 0 0 1-2 2h-6v-8h-8v8H6a2 2 0 0 1-2-2z" fill="#ffc800" stroke="#e5a800" stroke-width="2" stroke-linejoin="round"/><rect x="13" y="21" width="6" height="8" fill="#ff9600"/></svg>',
  practice: '<svg viewBox="0 0 32 32"><rect x="3" y="12" width="5" height="8" rx="2" fill="#1cb0f6"/><rect x="24" y="12" width="5" height="8" rx="2" fill="#1cb0f6"/><rect x="7" y="8" width="5" height="16" rx="2" fill="#ff4b4b"/><rect x="20" y="8" width="5" height="16" rx="2" fill="#ff4b4b"/><rect x="11" y="14" width="10" height="4" rx="2" fill="#afafaf"/></svg>',
  league: '<svg viewBox="0 0 32 32"><path d="M8 4h16v8a8 8 0 0 1-16 0z" fill="#ffc800" stroke="#e5a800" stroke-width="2"/><path d="M8 7H4v2a5 5 0 0 0 5 5M24 7h4v2a5 5 0 0 1-5 5" stroke="#e5a800" stroke-width="2" fill="none"/><rect x="14" y="19" width="4" height="5" fill="#e5a800"/><rect x="9" y="24" width="14" height="4" rx="2" fill="#ff9600"/></svg>',
  quests: '<svg viewBox="0 0 32 32"><rect x="5" y="12" width="22" height="15" rx="3" fill="#ff9600" stroke="#cc7800" stroke-width="2"/><path d="M5 15a11 7 0 0 1 22 0" fill="#ffc800" stroke="#e5a800" stroke-width="2"/><rect x="13" y="16" width="6" height="6" rx="1.5" fill="#ffc800" stroke="#cc7800" stroke-width="1.5"/></svg>',
  shop: '<svg viewBox="0 0 32 32"><path d="M5 11h22l-2 16H7z" fill="#ff4b4b" stroke="#ea2b2b" stroke-width="2" stroke-linejoin="round"/><path d="M11 11V9a5 5 0 0 1 10 0v2" stroke="#ea2b2b" stroke-width="2.5" fill="none"/><path d="M16 15l2 4 4 .5-3 3 .8 4-3.8-2-3.8 2 .8-4-3-3 4-.5z" fill="#ffc800"/></svg>',
  me: '<svg viewBox="0 0 32 32"><circle cx="16" cy="12" r="6" fill="#ce82ff"/><path d="M5 28a11 9 0 0 1 22 0z" fill="#ce82ff"/><circle cx="14" cy="11" r="1.2" fill="#fff"/><circle cx="18" cy="11" r="1.2" fill="#fff"/></svg>'
};
function curNav() {
  var r = location.hash || '#/';
  if (/^#\/(read|stories|words|review|mock|dict|p\/|s\/)/.test(r)) return '#/practice';
  if (/^#\/(parent|teacher)/.test(r)) return '#/me';
  var c = NAV.filter(function (n) { return n[0] !== '#/' && r.indexOf(n[0]) === 0; })[0]; return c ? c[0] : '#/';
}
function renderNav() {
  var cur = curNav();
  var html = NAV.map(function (n) { return '<button class="navbtn' + (n[0] === cur ? ' on' : '') + '" data-go="' + n[0] + '"><span class="ic">' + NAVICON[n[1]] + '</span><span class="lb">' + n[2] + '</span>' + (n[1] === 'quests' && questsReady() ? '<i class="dot"></i>' : '') + '</button>'; }).join('');
  $('#side').innerHTML = '<div class="logo">' + mascot('happy', 44) + '<span>pip<b>english</b></span></div>' + html + '<div class="grow"></div><div class="sidefoot">人教PEP · ' + esc((bookEntry(S.course) || {}).title || '') + '</div>';
  $('#bottom').innerHTML = html;
  $$('[data-go]').forEach(function (b) { b.onclick = function () { sfx.tap(); location.hash = b.getAttribute('data-go'); }; });
}
function questsReady() { var c = claimedToday(); return todaysTasks().some(function (t) { return taskVal(t) >= t[3] && c.indexOf(t[0]) < 0; }); }
function statsRow() {
  regen(); var be = bookEntry(S.course) || { emoji: '📘', short: '六上' };
  return '<button class="stat course" data-pop="course" title="切换课程">' + flagSvg(be) + '</button>' +
    '<button class="stat fire' + (streakToday() ? ' lit' : '') + '" data-pop="streak" title="连胜天数">' + flameSvg(streakToday()) + '<b>' + streakNow() + '</b></button>' +
    '<button class="stat gem" data-pop="gems" title="宝石">' + gemSvg() + '<b>' + S.gems + '</b></button>' +
    '<button class="stat heart" data-pop="hearts" title="爱心">' + heartSvg() + '<b>' + (S.parent.unlimitedHearts ? '∞' : S.hearts) + '</b></button>';
}
function flagSvg(be) { return '<span class="flag"><span class="fe">' + (be.emoji || '📘') + '</span><span class="ft">' + esc(be.short || '') + '</span></span>'; }
function flameSvg(lit) { return '<svg width="22" height="26" viewBox="0 0 22 26"><path d="M11 1C13 6 19 8 19 15a8 8 0 0 1-16 0c0-4 2-6 3-7 0 3 1 4 2 5 0-5 1-9 3-12z" fill="' + (lit ? '#ff9600' : '#e5e5e5') + '"/><path d="M11 13c1 2 4 3 4 6a4 4 0 0 1-8 0c0-2 1-3 2-4 0 1 1 2 1 2 0-2 0-3 1-4z" fill="' + (lit ? '#ffc800' : '#cfcfcf') + '"/></svg>'; }
function gemSvg() { return '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M5 2h12l4 6-10 13L1 8z" fill="#1cb0f6"/><path d="M1 8h20M7 2l4 19 4-19M5 2l2 6 4-6 4 6 2-6" stroke="#84d8ff" stroke-width="1.3" fill="none"/></svg>'; }
function heartSvg() { return '<svg width="24" height="22" viewBox="0 0 24 22"><path d="M12 21C5 15 1 11.5 1 7c0-3.5 2.7-6 6-6 2.2 0 4 1.3 5 3 1-1.7 2.8-3 5-3 3.3 0 6 2.5 6 6 0 4.5-4 8-11 14z" fill="#ff4b4b"/><path d="M6 5q2-2 4 0" stroke="#fff" stroke-width="2" fill="none" opacity=".6"/></svg>'; }
function renderTop() {
  var tb = $('#topbar'); if (tb) tb.innerHTML = statsRow();
  var rs = $('#rstats'); if (rs) rs.innerHTML = statsRow();
  $$('[data-pop]').forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); openPop(b.getAttribute('data-pop'), b); }; });
}
function renderChrome() { renderTop(); var rp = $('#rpanel'); if (rp && rp.offsetParent !== null) renderRight(); }
var popEl = null;
function closePop() { if (popEl) { popEl.remove(); popEl = null; } }
document.addEventListener('click', function (e) { if (popEl && !popEl.contains(e.target)) closePop(); });
function openPop(kind, anchor) {
  var was = popEl && popEl.getAttribute('data-k') === kind; closePop(); if (was) return; sfx.tap();
  var h = '';
  if (kind === 'course') {
    h = courseListHtml();
    probeBooks().then(function () { if (popEl && popEl.getAttribute('data-k') === 'course') { popEl.innerHTML = courseListHtml(); bindCourse(); } });
  } else if (kind === 'x') {
    h = '<h4>我的课程</h4>' + BOOKS.map(function (b) { return '<button class="poprow' + (b.id === S.course ? ' on' : '') + '" data-course="' + b.id + '"><span class="fe">' + (b.emoji || '📘') + '</span><span class="grow"><b>' + esc(b.title) + '</b><small>' + esc(b.sub || '') + '</small></span>' + (b.id === S.course ? '✔' : '') + '</button>'; }).join('') + (BOOKS.length < 2 ? '<p class="sub small">六年级下册即将上线</p>' : '');
  } else if (kind === 'streak') {
    var n = streakNow();
    h = '<div class="pophead orange">' + flameSvg(true) + '<div><b>' + n + ' 天连胜</b><small>' + (streakToday() ? '今天已完成，火焰点亮了！' : n ? '今天再学一课保持连胜' : '完成一节小课开始连胜') + '</small></div></div>' + weekStrip() +
      '<div class="sub small">🧊 连胜冻结：' + S.freezes + '/2 · 最长连胜 ' + (S.bestStreak || 0) + ' 天</div><button class="btn sm block ghost" data-go2="#/shop">去商店</button>';
  } else if (kind === 'gems') {
    h = '<div class="pophead blue">' + gemSvg() + '<div><b>' + S.gems + ' 宝石</b><small>完成小课、打开宝箱、完成任务都能获得宝石</small></div></div><button class="btn sm block blue" data-go2="#/shop">去商店</button>';
  } else if (kind === 'hearts') {
    regen(); var full = S.hearts >= MAXH, hs = '';
    for (var i = 0; i < MAXH; i++) hs += '<span class="hh' + (i < S.hearts ? '' : ' off') + '">' + heartSvg() + '</span>';
    h = '<h4>爱心</h4><div class="hrow">' + hs + '</div><p class="sub small">' + (S.parent.unlimitedHearts ? '家长已开启无限爱心' : full ? '爱心是满的，继续学习吧！' : '下一颗爱心 ' + Math.ceil(nextHeartIn() / 60000) + ' 分钟后恢复') + '</p>' +
      '<button class="btn sm block blue" id="prefill"' + (full || S.gems < 50 ? ' disabled' : '') + '>💎 50 补满爱心</button><button class="btn sm block" data-go2="#/practice" style="margin-top:8px">💪 练习赚爱心</button>';
  }
  popEl = document.createElement('div'); popEl.className = 'hpop'; popEl.setAttribute('data-k', kind); popEl.innerHTML = h; document.body.appendChild(popEl);
  var r = anchor.getBoundingClientRect(), w = Math.min(320, window.innerWidth - 16);
  popEl.style.width = w + 'px'; popEl.style.top = (r.bottom + window.scrollY + 10) + 'px';
  popEl.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
  popEl.style.setProperty('--ax', (r.left + r.width / 2 - parseFloat(popEl.style.left)) + 'px');
  bindCourse();
  $$('[data-go2]', popEl).forEach(function (b) { b.onclick = function () { closePop(); location.hash = b.getAttribute('data-go2'); }; });
  var pr = $('#prefill', popEl); if (pr) pr.onclick = function () { if (S.gems < 50) return; S.gems -= 50; S.stats.buys = (S.stats.buys || 0) + 1; gainHeart(5); sfx.buy(); closePop(); renderChrome(); toast('❤️ 爱心已补满'); };
}
function courseListHtml() { return '<h4>我的课程</h4>' + BOOKS.map(function (b) { return '<button class="poprow' + (b.id === S.course ? ' on' : '') + '" data-course="' + b.id + '"><span class="fe">' + (b.emoji || '📘') + '</span><span class="grow"><b>' + esc(b.title) + '</b><small>' + esc(b.sub || '') + '</small></span>' + (b.id === S.course ? '✔' : '') + '</button>'; }).join('') + (BOOKS.length < 2 ? '<p class="sub small">六年级下册即将上线</p>' : ''); }
function bindCourse() { if (popEl) $$('[data-course]', popEl).forEach(function (b) { b.onclick = function () { switchCourse(b.getAttribute('data-course')); }; }); }
function renderRight() {
  var rp = $('#rpanel'); if (!rp) return;
  var rows = leagueBoard(), rank = myRank(rows), T = TIERS[S.league.tier], tasks = todaysTasks(), c = claimedToday(), d = D();
  var h = '<div class="rstatsrow" id="rstats">' + statsRow() + '</div>' +
    '<div class="card side"><div class="row"><h3 class="grow">' + T[1] + ' ' + T[0] + '联赛</h3><a class="lnk" href="#/league">查看</a></div><div class="row"><span class="bigem">' + T[1] + '</span><div class="grow"><b>你现在排第 ' + rank + ' 名</b><div class="sub">本周 ' + weekXP(mondayOf()) + ' XP · 前 ' + PROMO + ' 名晋级</div></div></div></div>' +
    '<div class="card side"><div class="row"><h3 class="grow">每日任务</h3><a class="lnk" href="#/quests">查看全部</a></div>' +
    tasks.map(function (t) { var v = taskVal(t); return '<div class="qmini"><span class="qe">' + t[1] + '</span><div class="grow"><b>' + esc(t[2]) + '</b><div class="pbar"><i style="width:' + Math.round(v * 100 / t[3]) + '%"></i><span>' + v + '/' + t[3] + '</span></div></div><span class="qchest">' + (c.indexOf(t[0]) >= 0 ? '✅' : '🎁') + '</span></div>'; }).join('') + '</div>' +
    (S.goal ? '<div class="card side"><h3>🎯 每日目标</h3><div class="pbar"><i style="width:' + Math.min(100, Math.round(d.xp * 100 / S.goal)) + '%"></i><span>' + d.xp + '/' + S.goal + ' XP</span></div></div>' : '') +
    '<div class="sidecr">课本内容版权归人民教育出版社所有 · 仅供家庭学习</div>';
  rp.innerHTML = h; renderTop();
}

/* ================= learn: the winding path ================= */
var OFFS = [0, 44, 70, 44, 0, -44, -70, -44];
var PART_ICON = { A: 'star', B: 'star', C: 'book', Story: 'book', G: 'dumbbell', R: 'star', P: 'dumbbell' };
function nodeIcon(kind, color) {
  if (kind === 'lock') return '<svg width="34" height="34" viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="3" fill="#afafaf"/><path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="#afafaf" stroke-width="2.6" fill="none"/></svg>';
  if (kind === 'done') return '<svg width="38" height="38" viewBox="0 0 24 24"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" fill="#fff" stroke="rgba(0,0,0,.08)" stroke-width=".6" stroke-linejoin="round"/><rect x="5" y="19" width="14" height="2.6" rx="1.3" fill="#fff"/></svg>';
  if (kind === 'book') return '<svg width="36" height="36" viewBox="0 0 24 24"><path d="M3 5c3-1 6-1 9 1 3-2 6-2 9-1v14c-3-1-6-1-9 1-3-2-6-2-9-1z" fill="#fff"/><path d="M12 6v14" stroke="' + color + '" stroke-width="1.6"/></svg>';
  if (kind === 'dumbbell') return '<svg width="38" height="38" viewBox="0 0 24 24"><rect x="2" y="9" width="3" height="6" rx="1" fill="#fff"/><rect x="19" y="9" width="3" height="6" rx="1" fill="#fff"/><rect x="5" y="6" width="3.5" height="12" rx="1.2" fill="#fff"/><rect x="15.5" y="6" width="3.5" height="12" rx="1.2" fill="#fff"/><rect x="8" y="10.5" width="8" height="3" fill="#fff"/></svg>';
  return '<svg width="38" height="38" viewBox="0 0 24 24"><path d="M12 2.5l2.9 6 6.6.8-4.9 4.6 1.3 6.5L12 17.2l-5.9 3.2 1.3-6.5L2.5 9.3l6.6-.8z" fill="#fff" stroke-linejoin="round"/></svg>';
}
function chestSvg(state) {
  var open = state === 'open', gray = state === 'lock';
  var c1 = gray ? '#d7d7d7' : '#ff9600', c2 = gray ? '#bdbdbd' : '#cc7800', c3 = gray ? '#e5e5e5' : '#ffc800';
  return '<svg width="78" height="70" viewBox="0 0 78 70"><ellipse cx="39" cy="66" rx="30" ry="4" fill="rgba(0,0,0,.1)"/>' +
    (open ? '<path d="M10 28 L22 6 H56 L68 28z" fill="' + c2 + '"/><rect x="10" y="28" width="58" height="34" rx="7" fill="' + c1 + '"/><path d="M18 30h42v6H18z" fill="#7a3f00" opacity=".35"/><circle cx="30" cy="18" r="3" fill="#fff"/><circle cx="47" cy="12" r="2" fill="#fff"/>'
      : '<rect x="10" y="26" width="58" height="36" rx="7" fill="' + c1 + '"/><path d="M10 30a29 20 0 0 1 58 0v4H10z" fill="' + c2 + '"/><rect x="10" y="33" width="58" height="5" fill="' + c3 + '"/><rect x="33" y="30" width="12" height="14" rx="3" fill="' + c3 + '" stroke="' + c2 + '" stroke-width="2"/>') + '</svg>';
}
function trophySvg(state) { var c = state === 'lock' ? '#d7d7d7' : state === 'done' ? '#ffc800' : '#ff9600', d = state === 'lock' ? '#bdbdbd' : state === 'done' ? '#e5a800' : '#cc7800'; return '<svg width="44" height="44" viewBox="0 0 32 32"><path d="M8 4h16v8a8 8 0 0 1-16 0z" fill="#fff"/><path d="M8 7H4v2a5 5 0 0 0 5 5M24 7h4v2a5 5 0 0 1-5 5" stroke="#fff" stroke-width="2.4" fill="none"/><rect x="14" y="19" width="4" height="5" fill="#fff"/><rect x="9" y="24" width="14" height="4" rx="2" fill="#fff"/><path d="M16 7l1.2 2.5 2.7.3-2 1.9.5 2.7-2.4-1.3-2.4 1.3.5-2.7-2-1.9 2.7-.3z" fill="' + c + '"/><desc>' + d + '</desc></svg>'; }
function shade(hex, amt) { var n = parseInt(hex.slice(1), 16), r = Math.max(0, Math.min(255, (n >> 16) + amt)), g = Math.max(0, Math.min(255, (n >> 8 & 255) + amt)), b = Math.max(0, Math.min(255, (n & 255) + amt)); return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1); }
function unitLabel(u) { return u.isExtra ? '专项训练' : u.isRevision ? '复习单元 Revision' : '第 ' + u.no + ' 单元 · UNIT ' + u.no; }
function viewHome() {
  var cur = currentLesson(false), curX = currentLesson(true), due = dueWrong().length;
  var h = '<div class="learn">' + focusCardHtml(), fu = focusUnit(), fnx = fu ? focusNext(fu) : null;
  if (due) h += '<div class="revnote card click" data-href="#/review"><span class="bigem">🔁</span><div class="grow"><b>' + due + ' 道错题该复习了</b><div class="sub">复习不扣爱心，完成还能恢复 1 颗爱心</div></div><span class="chev">›</span></div>';
  UNITS.forEach(function (u, ui) {
    var col = u.color || '#58cc02', dark = shade(col, -40), locked = !unitUnlocked(u) && !S.parent.unlockAll;
    var dn = u.lessons.filter(function (l) { return lessonComplete(l.id); }).length;
    h += '<section class="unit' + (fu === u ? ' focus' : '') + '" id="unit-' + u.id + '" style="--uc:' + col + ';--ud:' + dark + '">' +
      '<div class="ubanner' + (locked ? ' locked' : '') + '"><div class="ut"><small>' + (fu === u ? '<span class="fcbadge">⭐ 本周重点</span> ' : '') + esc(unitLabel(u)) + '</small><b>' + esc(u.title) + '</b><span>' + esc(u.zh) + ' · ' + dn + '/' + u.lessons.length + '</span></div>' +
      '<button class="guide" data-guide="' + u.id + '"><svg width="22" height="22" viewBox="0 0 24 24"><path d="M3 5c3-1 6-1 9 1 3-2 6-2 9-1v14c-3-1-6-1-9 1-3-2-6-2-9-1z" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/><path d="M12 6v14" stroke="#fff" stroke-width="2"/></svg><span>GUIDEBOOK<br><small>指南</small></span></button></div>';
    if (locked && !u.isExtra && fu !== u) h += '<div class="jumpwrap"><button class="btn sm jump" data-jump="' + u.id + '">⏩ 跳到这里？</button></div>';
    h += '<div class="path">';
    var li = 0;
    u._items.forEach(function (it, k) {
      var off = OFFS[k % 8], cls = '', inner = '', extra = '', tag = '';
      if (it.type === 'lesson') {
        var l = it.l, done = lessonState(l.id).done, tested = P().tested[l.id] && !done, unl = isUnlocked(l), isCur = (fnx ? l === fnx : (l === cur || l === curX)) && unl, lv = lessonLevel(l.id);
        li++;
        cls = 'node ' + (done || tested ? 'done' : isCur ? 'cur' : unl ? 'open' : 'lock');
        inner = nodeIcon(done || tested ? 'done' : !unl ? 'lock' : PART_ICON[l.part] || 'star', col);
        if (isCur) tag = '<div class="startpop">START<i></i></div>';
        if (done) extra = '<span class="lv">' + lv + '</span>';
        h += '<div class="prow" style="--x:' + off + 'px">' + (isCur ? '<div class="ring"></div>' : '') + tag + '<button class="' + cls + '" data-node="' + l.id + '" aria-label="' + esc(l.title) + '">' + inner + extra + '</button>';
      } else if (it.type === 'chest') {
        var got = P().chests[it.id], cu = chestUnlocked(it);
        h += '<div class="prow" style="--x:' + off + 'px"><button class="chest' + (got ? ' open' : cu ? ' ready' : ' lock') + '" data-chest="' + it.id + '" aria-label="宝箱">' + chestSvg(got ? 'open' : cu ? 'ready' : 'lock') + '</button>';
      } else {
        var cs = P().chal[u.id] || {}, tu = trophyUnlocked(u);
        h += '<div class="prow" style="--x:' + off + 'px"><button class="node trophy ' + (cs.pass ? 'done' : tu ? 'open' : 'lock') + '" data-trophy="' + u.id + '" aria-label="单元挑战">' + trophySvg(cs.pass ? 'done' : tu ? 'open' : 'lock') + (cs.pass ? '<span class="lv">' + (cs.stars || 1) + '★</span>' : '') + '</button>';
      }
      if (k === 2 || (k === 7 && u._items.length > 9)) h += '<div class="pathpip ' + (OFFS[k % 8] > 0 ? 'left' : 'right') + '">' + mascot(k === 2 ? (ui % 2 ? 'cheer' : 'idle') : 'think', 110) + '</div>';
      h += '</div>';
    });
    var scn = sceneOfUnit(u);
    if (scn) { var sst = sceneSt(scn.id), sOpen = S.parent.unlockAll || !locked || fu === u; h += '<div class="prow" style="--x:0px"><button class="scnode' + (sOpen ? '' : ' lock') + (sst.watched ? ' done' : '') + '" data-scene="' + scn.id + '" aria-label="情景小剧场"><span class="scimg" style="background-image:url(' + scn.imgs[0] + ')"></span><span class="sctag">🎬 情景小剧场' + (sceneStars(scn.id) ? ' ' + '★★★'.slice(0, sceneStars(scn.id)) : '') + '</span><b>' + esc(scn.title) + '</b></button></div>'; }
    h += '</div></section>';
  });
  h += '<div class="pathend">' + mascot('cheer', 120) + '<p class="sub">继续加油，学完整本书！</p></div><footer class="cr">课本内容版权归人民教育出版社所有 · 仅供家庭学习使用 · 设计灵感来自 Duolingo 与 聪聪学堂（MIT）</footer></div>';
  V.innerHTML = h;
  $$('[data-node]', V).forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); nodePop(b, LESSONS[b.getAttribute('data-node')]); }; });
  $$('[data-chest]', V).forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); openChest(b); }; });
  $$('[data-trophy]', V).forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); trophyPop(b, b.getAttribute('data-trophy')); }; });
  $$('[data-guide]', V).forEach(function (b) { b.onclick = function () { guidebook(b.getAttribute('data-guide')); }; });
  $$('[data-scene]', V).forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); if (b.classList.contains('lock')) { toast('🔒 先学完前面的课，再来看这个单元的小剧场'); return; } location.hash = '#/scene/' + b.getAttribute('data-scene'); }; });
  $$('[data-jump]', V).forEach(function (b) { b.onclick = function () { jumpConfirm(b.getAttribute('data-jump')); }; });
  bindFocusCard();
}
function scrollToCurrent() { var fu = focusUnit(), n = (fu && ($('#unit-' + fu.id + ' .node.cur') || $('#unit-' + fu.id))) || $('.node.cur') || $('.chest.ready'); if (n) n.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
function nodePopShow(anchor, html, color) {
  closePop(); sfx.tap();
  popEl = document.createElement('div'); popEl.className = 'hpop npop'; popEl.innerHTML = html; if (color) { popEl.style.background = color; popEl.classList.add('colored'); }
  document.body.appendChild(popEl);
  var r = anchor.getBoundingClientRect(), w = Math.min(330, window.innerWidth - 24);
  popEl.style.width = w + 'px'; popEl.style.top = (r.bottom + window.scrollY + 14) + 'px';
  var left = Math.max(12, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w / 2)); popEl.style.left = left + 'px'; popEl.style.setProperty('--ax', (r.left + r.width / 2 - left) + 'px');
  var pb = popEl.getBoundingClientRect(); if (pb.bottom > window.innerHeight - 70) window.scrollBy({ top: pb.bottom - window.innerHeight + 90, behavior: 'smooth' });
  return popEl;
}
function nodePop(btn, l) {
  var u = l._u, unl = isUnlocked(l), st = lessonState(l.id), idx = u.lessons.indexOf(l) + 1, col = u.color || '#58cc02';
  if (!unl) {
    nodePopShow(btn, '<b>' + esc(l.title) + '</b><p>完成前面所有小课才能解锁这一课哦！</p><button class="btn block gray" disabled>LOCKED · 未解锁</button>');
    return;
  }
  var xp = st.done ? 5 : 10;
  var p = nodePopShow(btn, '<b>' + esc(l.title) + '</b><p>第 ' + idx + ' 课 / 共 ' + u.lessons.length + ' 课' + (st.done ? ' · 👑 Lv.' + lessonLevel(l.id) + ' · 最佳 ' + (st.best || 0) + '%' : '') + (l.page ? ' · 课本 p.' + l.page : '') + '</p>' +
    '<button class="btn block white" id="pgo" style="color:' + col + '">' + (st.done ? '复习 +' + xp + ' XP' : 'START · 开始 +' + xp + ' XP') + '</button>' +
    '<button class="btn block clear" id="ptips">💡 讲解 TIPS</button>', col);
  $('#pgo', p).onclick = function () { closePop(); startLesson(l); };
  $('#ptips', p).onclick = function () { closePop(); location.hash = '#/lesson/' + l.id; };
}
function trophyPop(btn, uid) {
  var u = UNITS.filter(function (x) { return x.id === uid; })[0], cs = P().chal[uid] || {};
  if (!trophyUnlocked(u)) { nodePopShow(btn, '<b>🏆 单元挑战</b><p>学完本单元全部小课，就能挑战单元奖杯！</p><button class="btn block gray" disabled>LOCKED · 未解锁</button>'); return; }
  var p = nodePopShow(btn, '<b>🏆 ' + esc(u.title) + ' 单元挑战</b><p>15 题，最多错 3 次。' + (cs.pass ? '已获得 ' + (cs.stars || 1) + '★，再挑战刷新纪录！' : '通过可获得奖杯和 💎30') + '</p><button class="btn block white" id="pgo" style="color:#ff9600">开始挑战 +30 XP</button>', '#ff9600');
  $('#pgo', p).onclick = function () { closePop(); startChallenge(uid); };
}
function openChest(btn) {
  var id = btn.getAttribute('data-chest'), it = PATH.filter(function (x) { return x.id === id; })[0];
  if (P().chests[id]) { nodePopShow(btn, '<b>宝箱已打开</b><p>这个宝箱里的宝石已经领取啦。</p>'); return; }
  if (!chestUnlocked(it)) { nodePopShow(btn, '<b>🔒 宝箱</b><p>完成前面的小课就能打开宝箱！</p>'); return; }
  var r = mulberry32(hashStr(id + S.course)), gems = 10 + Math.floor(r() * 4) * 5;
  P().chests[id] = Date.now(); S.stats.chests = (S.stats.chests || 0) + 1; bump('chests'); S.gems += gems; save();
  btn.classList.add('opening'); sfx.chest(); vibrate([20, 40, 20]);
  setTimeout(function () {
    confetti(40);
    modal('<div class="chestbig">' + chestSvg('open') + '<span class="gemfly">💎</span></div><h2>打开宝箱！</h2><p class="big blue">+' + gems + ' 宝石</p><button class="btn block" data-close>太好了</button>', function (m, close) { $('[data-close]', m).onclick = function () { close(); render(); }; });
    renderChrome(); checkAch();
  }, 450);
}
function jumpConfirm(uid) {
  var u = UNITS.filter(function (x) { return x.id === uid; })[0];
  modal(mascot('think', 90) + '<h2>想直接跳到「' + esc(u.title) + '」吗？</h2><p class="sub">通过一个小测试（最多错 3 次），就能解锁到这里。跳过的课以后也能随时回去学。</p><button class="btn block" id="jgo">开始测试</button><button class="btn block ghost" id="jno" style="margin-top:12px">取消</button>', function (m, close) {
    $('#jgo', m).onclick = function () { close(); startJump(uid); }; $('#jno', m).onclick = close;
  });
}
function guidebook(uid) {
  var u = UNITS.filter(function (x) { return x.id === uid; })[0]; if (!u) return;
  var h = '<div class="gbhead" style="background:' + (u.color || '#58cc02') + '"><small>' + esc(unitLabel(u)) + ' · GUIDEBOOK</small><h2>' + esc(u.title) + '</h2><div>' + esc(u.zh) + (u.q ? ' · ' + esc(u.q) : '') + '</div></div><div class="gbbody">';
  if (u.expressions.length) { h += '<h3>🗣️ 重点句型</h3>'; u.expressions.slice(0, 14).forEach(function (e) { h += '<div class="gbs" data-sayt="' + esc(e[0]) + '"><button class="ibtn sm">🔊</button><div><b>' + esc(e[0]) + '</b><small>' + esc(e[1]) + '</small></div></div>'; }); }
  else { var ks = []; u.lessons.forEach(function (l) { (l.key || []).forEach(function (k) { if (ks.length < 10 && ks.indexOf(k) < 0) ks.push(k); }); }); if (ks.length) { h += '<h3>🗣️ 重点句型</h3>'; ks.forEach(function (k) { h += '<div class="gbs" data-sayt="' + esc(k) + '"><button class="ibtn sm">🔊</button><div><b>' + esc(k) + '</b><small>' + esc(SENTZH[k] || '') + '</small></div></div>'; }); } }
  var kw = u.words.filter(function (w) { return w.req; }); if (!kw.length) kw = u.words.slice(0, 16);
  if (kw.length) { h += '<h3>🔤 重点单词</h3><div class="gbwords">'; kw.forEach(function (w) { h += '<button class="gbw" data-sayt="' + esc(w.w) + '">' + (emojiOf(w.w) ? '<span>' + emojiOf(w.w) + '</span>' : '') + '<b>' + esc(w.w) + '</b><small>' + esc(shortZh(w.zh)) + '</small></button>'; }); h += '</div>'; }
  if (u.comparatives && u.comparatives.length) { h += '<h3>📏 比较级</h3><div class="gbwords">'; u.comparatives.forEach(function (r) { h += '<button class="gbw" data-sayt="' + esc(r[0] + ', ' + r[1]) + '"><b>' + esc(r[0]) + ' → ' + esc(r[1]) + '</b><small>' + esc(r[2] || '') + '</small></button>'; }); h += '</div>'; }
  if (u.irregular || (u.id === 'pt' && B.irregular)) { h += '<h3>⏳ 不规则动词</h3><div class="gbwords">'; (u.irregular || B.irregular).slice(0, 47).forEach(function (r) { h += '<button class="gbw" data-sayt="' + esc(r[0].split(' ')[0] + ', ' + r[1]) + '"><b>' + esc(r[0].split(' ')[0]) + ' → ' + esc(r[1]) + '</b></button>'; }); h += '</div>'; }
  if (u.grammar && u.grammar.points) { h += '<h3>🧩 ' + esc(u.grammar.title || '语法') + '</h3>'; u.grammar.points.forEach(function (p) { h += '<p class="gbp">' + esc(p) + '</p>'; }); }
  h += '</div><div class="gbfoot"><button class="btn block" data-close>知道了</button></div>';
  modal(h, function (m, close) { $('[data-close]', m).onclick = close; $$('[data-sayt]', m).forEach(function (el) { el.onclick = function () { speakEn(el.getAttribute('data-sayt')); }; }); }, 'guide');
}

/* ================= cloud: class account, backup & real class leaderboard ================= */
/* One config constant; a custom domain can replace it later. Override per device: localStorage['e6.api'] = 'https://…' */
var API_BASE = 'https://api.tuv.indevs.in';
var ACCT_KEY = 'e6.acct', SYNC_GAP = 180000;
function apiBase() { try { var o = localStorage.getItem('e6.api'); if (o && /^https?:\/\//.test(o)) return o.replace(/\/+$/, ''); } catch (e) { } return API_BASE; }
/* ISO week id in Asia/Shanghai (Monday start) — same formula as the server */
function shWeekId(t) {
  var d = new Date((t || Date.now()) + 8 * 3600e3), day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  var y = d.getUTCFullYear(), f = new Date(Date.UTC(y, 0, 4));
  var w = 1 + Math.round(((d - f) / 864e5 - 3 + ((f.getUTCDay() + 6) % 7)) / 7);
  return y + '-W' + pad(w);
}
function shMonday() { var d = new Date(Date.now() + 8 * 3600e3); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return d.toISOString().slice(0, 10); }
function allDoneLessons() { var n = 0; for (var b in (S.books || {})) { var ls = (S.books[b] || {}).lessons || {}; for (var k in ls) if (ls[k] && ls[k].done) n++; } return n; }
function cloudStats() { return { xp: S.xp || 0, wxp: weekXP(shMonday()), st: streakNow(), lv: allDoneLessons(), da: daysActiveThisWeek(), la: S.lastActive || Date.now() }; }
function hasProgress() { return (S.xp || 0) > 0 || allDoneLessons() > 0; }
function fmtAgo(ts) {
  if (!ts) return '还没有同步'; var s = (Date.now() - ts) / 1000;
  if (s < 60) return '刚刚'; if (s < 3600) return Math.floor(s / 60) + ' 分钟前';
  var d = new Date(ts); return (dstr(d) === today() ? '今天 ' : (d.getMonth() + 1) + '月' + d.getDate() + '日 ') + pad(d.getHours()) + ':' + pad(d.getMinutes());
}
var Cloud = {
  acct: null, busy: false, timer: null, board: null, boardTs: 0, boardCls: '', boardErr: false, boardLoading: false, mode: 'w', lastNote: 0,
  load: function () { try { var a = JSON.parse(localStorage.getItem(ACCT_KEY) || 'null'); this.acct = a && a.cls && a.nick && a.pin ? a : null; } catch (e) { this.acct = null; } },
  saveAcct: function () { try { if (this.acct) localStorage.setItem(ACCT_KEY, JSON.stringify(this.acct)); else localStorage.removeItem(ACCT_KEY); } catch (e) { } },
  api: function (path, body) {
    var ctl = window.AbortController ? new AbortController() : null, tm = setTimeout(function () { if (ctl) ctl.abort(); }, 12000);
    var opt = body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) } : { method: 'GET' };
    if (ctl) opt.signal = ctl.signal;
    return fetch(apiBase() + path, opt).then(function (r) {
      clearTimeout(tm);
      return r.json().catch(function () { return { ok: false, code: 'http' + r.status, msg: '云端返回了错误（' + r.status + '）' }; });
    }, function (e) { clearTimeout(tm); throw { net: true, e: e }; });
  },
  note: function () {
    if (Date.now() - this.lastNote < 30000) return; this.lastNote = Date.now();
    var old = $('.cloudnote'); if (old) old.remove();
    var n = document.createElement('div'); n.className = 'cloudnote'; n.textContent = '☁️ 云端暂时连不上，进度已保存在本机'; document.body.appendChild(n);
    setTimeout(function () { n.classList.add('out'); setTimeout(function () { n.remove(); }, 400); }, 3500);
  },
  ident: function () { var a = this.acct; return { cls: a.cls, nick: a.nick, pin: a.pin }; },
  refreshUI: function () {
    /* only repaint the account card / class board; never touch an open lesson, result or streak screen or a dialog */
    var h = location.hash || '', ov = $('#overlay');
    if (session || (ov && ov.children.length) || $('.modal') || popEl) return;
    if (h.indexOf('#/me') === 0 && $('#acct')) { var c = $('#acct'); c.outerHTML = acctCardHtml(); bindAcctCard(); }
    else if (h.indexOf('#/league/class') === 0 || (h.replace(/\/$/, '') === '#/league' && $('.cboard'))) { viewClassBoard(); bindHrefs(V); }
  },
  /* called after every finished lesson / challenge / practice session */
  markDirty: function () { if (!this.acct) return; this.acct.dirty = true; this.saveAcct(); this.schedule(); },
  schedule: function () {
    var self = this; if (!this.acct || !this.acct.dirty) return; clearTimeout(this.timer);
    var wait = Math.max(1500, (this.acct.lastTry || 0) + SYNC_GAP - Date.now());
    this.timer = setTimeout(function () { self.sync(false); }, wait);
  },
  sync: function (manual) {
    var self = this, a = this.acct; if (!a) return Promise.resolve(false);
    if (this.busy) return Promise.resolve(false);
    clearTimeout(this.timer); this.timer = null;
    var body = this.ident(); body.data = S; body.stats = cloudStats(); try { body.miss = missStats(); } catch (e) { }
    var txt = JSON.stringify(body);
    if (txt.length > 390000) { toast('进度数据太大，无法上传云端'); return Promise.resolve(false); }
    this.busy = true; a.lastTry = Date.now(); this.saveAcct();
    if (manual) { var b = $('#csync'); if (b) { b.disabled = true; b.textContent = '同步中…'; } }
    return this.api('/api/sync', txt).then(function (r) {
      self.busy = false;
      if (!self.acct) return false;
      if (r && r.code === 'toofast') { self.schedule(); return false; }
      if (r && r.ok) { a.lastSync = Date.now(); a.cloudUpd = r.upd || a.lastSync; a.dirty = false; a.srvXp = r.xp; a.srvWxp = r.wxp; self.saveAcct(); self.boardTs = 0; if (manual) toast('☁️ 已同步到云端'); self.refreshUI(); return true; }
      if (r && r.code === 'nouser') { self.acct = null; self.saveAcct(); toast('云端找不到这个账号了，请重新登录', 3200); self.refreshUI(); return false; }
      toast((r && r.msg) || '同步失败', 3000); self.refreshUI(); return false;
    }, function () { self.busy = false; self.note(); self.refreshUI(); return false; });
  },
  loadBoard: function (force) {
    var self = this, a = this.acct; if (!a) return Promise.resolve();
    if (!force && this.board && this.boardCls === a.cls && Date.now() - this.boardTs < 30000) return Promise.resolve();
    if (this.boardLoading) return Promise.resolve();
    this.boardLoading = true;
    return this.api('/api/board?cls=' + encodeURIComponent(a.cls) + (force ? '&t=' + Date.now() : '')).then(function (r) {
      self.boardLoading = false;
      if (r && r.rows) { self.board = r; self.boardCls = a.cls; self.boardTs = Date.now(); self.boardErr = false; }
      else self.boardErr = (r && r.msg) || '读取失败';
    }, function () { self.boardLoading = false; self.boardErr = 'net'; self.note(); });
  }
};
Cloud.load();

/* ---------- account card (我的) ---------- */
function acctCardHtml() {
  var a = Cloud.acct;
  if (!a) {
    return '<div class="card form acct" id="acct"><div class="acchead"><span class="bigem">🏫</span><div class="grow"><b>加入班级</b><div class="sub">和同学一起上真实的班级排行榜，进度也会备份到云端，换手机也不怕丢。</div></div></div>' +
      '<label>班级码</label><input id="acls" maxlength="20" placeholder="例如：六3班-2026" autocomplete="off">' +
      '<label>昵称 <small class="warnt">不要写真名</small></label><input id="anick" maxlength="12" placeholder="例如：闪电小熊" autocomplete="off">' +
      '<label>4 位 PIN（记住它，换设备登录要用）</label><input id="apin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="••••" autocomplete="off">' +
      '<button class="btn block blue" id="alogin" style="margin-top:14px">登录 / 创建账号</button>' +
      '<p class="sub small" style="margin:10px 0 0">同一个班的同学填一样的班级码。新昵称会自动创建账号；已有昵称需要输入正确的 PIN。</p></div>';
  }
  return '<div class="card acct on" id="acct"><div class="acchead"><span class="bigem">🏫</span><div class="grow"><b>' + esc(a.cls) + '</b><div class="sub">昵称：<b>' + esc(a.nick) + '</b> · 上次同步：<span id="alast">' + fmtAgo(a.lastSync) + '</span>' + (a.dirty ? ' · <span class="pend">有新进度待同步</span>' : '') + '</div></div></div>' +
    '<div class="accbtns"><button class="btn sm blue" id="csync">☁️ 立即同步</button><button class="btn sm ghost" id="crest">⬇️ 从云端恢复</button><button class="btn sm ghost" id="cboard">🏆 班级榜</button><button class="btn sm ghost" id="cout">退出</button></div>' +
    '<button class="lnkbtn" id="cdel">删除云端数据</button></div>';
}
function bindAcctCard() {
  var lb = $('#alogin');
  if (lb) {
    var pin = $('#apin'); pin.oninput = function () { pin.value = pin.value.replace(/\D/g, '').slice(0, 4); };
    lb.onclick = function () { cloudLogin($('#acls').value, $('#anick').value, pin.value, lb); };
    return;
  }
  if (!$('#csync')) return;
  $('#csync').onclick = function () { Cloud.sync(true); };
  $('#crest').onclick = cloudRestorePrompt;
  $('#cboard').onclick = function () { location.hash = '#/league/class'; };
  $('#cout').onclick = function () {
    modal(mascot('think', 80) + '<h2>退出班级账号？</h2><p class="sub">本机进度会保留，只是不再自动同步。' + (Cloud.acct.dirty ? '<br><b>还有新进度没同步</b>，建议先点“立即同步”。' : '') + '</p><button class="btn block" id="oyes">退出</button><button class="btn block ghost" id="ono" style="margin-top:12px">取消</button>', function (m, close) {
      $('#oyes', m).onclick = function () { clearTimeout(Cloud.timer); Cloud.acct = null; Cloud.board = null; Cloud.saveAcct(); close(); toast('已退出班级账号'); render(); };
      $('#ono', m).onclick = close;
    });
  };
  $('#cdel').onclick = cloudDeletePrompt;
}
function cloudLogin(cls, nick, pin, btn) {
  cls = String(cls || '').trim(); nick = String(nick || '').trim(); pin = String(pin || '').trim();
  if (Array.from(cls).length < 2) return toast('班级码至少 2 个字');
  if (!nick) return toast('请填一个昵称（不要写真名）');
  if (!/^\d{4}$/.test(pin)) return toast('PIN 需要 4 位数字');
  if (btn) { btn.disabled = true; btn.textContent = '连接中…'; }
  var reset = function () { if (btn) { btn.disabled = false; btn.textContent = '登录 / 创建账号'; } };
  return Cloud.api('/api/login', { cls: cls, nick: nick, pin: pin }).then(function (r) {
    reset();
    if (!r || !r.ok) { toast((r && r.msg) || '登录失败', 3000); var p = $('#apin'); if (p) { p.classList.add('shake'); setTimeout(function () { p.classList.remove('shake'); }, 400); } return r; }
    Cloud.acct = { cls: r.cls || cls.toUpperCase(), nick: r.nick || nick, pin: pin, lastSync: 0, cloudUpd: r.upd || 0, dirty: false }; Cloud.saveAcct(); Cloud.board = null;
    sfx.good();
    if (r.created || !r.hasData) {
      toast(r.created ? '🎉 账号创建成功，欢迎加入 ' + Cloud.acct.cls : '✅ 登录成功');
      if (hasProgress()) { Cloud.acct.dirty = true; Cloud.saveAcct(); Cloud.sync(false); }
      render(); return r;
    }
    /* existing account with a cloud backup: compare, never overwrite silently */
    return Cloud.api('/api/restore', Cloud.ident()).then(function (rr) {
      if (!rr || !rr.ok || !rr.data) { toast('✅ 登录成功'); render(); return r; }
      render(); cloudChoice(rr.data, rr.upd, true); return r;
    }, function () { toast('✅ 登录成功（云端进度稍后再比较）'); Cloud.note(); render(); return r; });
  }, function () { reset(); Cloud.note(); toast('连不上云端，请检查网络后再试', 3000); });
}
/* cloud vs local: ask which one to keep */
function cloudChoice(data, upd, atLogin) {
  var cx = (data && data.xp) || 0, lx = S.xp || 0, fresh = !hasProgress();
  if (atLogin && !fresh && cx === lx) { Cloud.acct.lastSync = Date.now(); Cloud.acct.cloudUpd = upd; Cloud.saveAcct(); toast('✅ 登录成功，云端和本机进度一致'); render(); return; }
  var cloudMore = fresh || cx > lx || (cx === lx && (upd || 0) > (Cloud.acct.lastSync || 0));
  var title = cloudMore ? '云端有进度（' + cx + ' XP），要恢复到这台设备吗？' : '这台设备的进度更多（' + lx + ' XP），要上传到云端吗？';
  var sub = '云端：' + cx + ' XP（' + fmtAgo(upd) + '保存）<br>本机：' + lx + ' XP' + (fresh ? '（还没开始学）' : '');
  modal(mascot('think', 84) + '<h2>' + title + '</h2><p class="sub">' + sub + '</p>' +
    '<button class="btn block' + (cloudMore ? '' : ' ghost') + '" id="cc_r">⬇️ 恢复云端进度到这台设备</button>' +
    (fresh ? '' : '<button class="btn block' + (cloudMore ? ' ghost' : ' blue') + '" id="cc_u" style="margin-top:12px">⬆️ 用本机进度覆盖云端</button>') +
    '<button class="btn block ghost" id="cc_x" style="margin-top:12px">' + (atLogin ? '先不决定（退出登录）' : '取消') + '</button>', function (m, close) {
      $('#cc_r', m).onclick = function () { close(); applyCloudData(data, upd); };
      var u = $('#cc_u', m); if (u) u.onclick = function () { close(); Cloud.acct.dirty = true; Cloud.saveAcct(); Cloud.sync(true); };
      $('#cc_x', m).onclick = function () { close(); if (atLogin) { Cloud.acct = null; Cloud.saveAcct(); toast('已退出，本机进度没有变化'); render(); } };
    }, 'sticky');
}
function applyCloudData(data, upd) {
  if (!data || typeof data.xp !== 'number') { toast('云端数据格式不对，没有恢复'); return; }
  var st = migrate(JSON.parse(JSON.stringify(data)));
  try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { toast('保存失败：浏览器存储已满'); return; }
  S = merge(defState(), st);
  Cloud.acct.lastSync = Date.now(); Cloud.acct.cloudUpd = upd || 0; Cloud.acct.dirty = false; Cloud.saveAcct();
  toast('✅ 已恢复云端进度'); setTimeout(function () { location.reload(); }, 500);
}
function cloudRestorePrompt() {
  var b = $('#crest'); if (b) { b.disabled = true; b.textContent = '读取中…'; }
  Cloud.api('/api/restore', Cloud.ident()).then(function (r) {
    if (b) { b.disabled = false; b.textContent = '⬇️ 从云端恢复'; }
    if (!r || !r.ok) { toast((r && r.msg) || '读取失败', 3000); if (r && r.code === 'nouser') { Cloud.acct = null; Cloud.saveAcct(); render(); } return; }
    if (!r.data) { toast('云端还没有备份，先点“立即同步”吧'); return; }
    var cx = r.data.xp || 0;
    modal(mascot('think', 84) + '<h2>恢复云端进度？</h2><p class="sub">云端：' + cx + ' XP（' + fmtAgo(r.upd) + '保存）<br>本机：' + (S.xp || 0) + ' XP<br>恢复后会<b>替换</b>这台设备上的进度。</p><button class="btn block" id="ry">恢复</button><button class="btn block ghost" id="rn" style="margin-top:12px">取消</button>', function (m, close) {
      $('#ry', m).onclick = function () { close(); applyCloudData(r.data, r.upd); }; $('#rn', m).onclick = close;
    });
  }, function () { if (b) { b.disabled = false; b.textContent = '⬇️ 从云端恢复'; } Cloud.note(); });
}
function cloudDeletePrompt() {
  var go = function () {
    modal(mascot('sad', 84) + '<h2>删除云端数据？</h2><p class="sub">会删除「' + esc(Cloud.acct.nick) + '」在班级 ' + esc(Cloud.acct.cls) + ' 的云端备份和排行榜记录，不能撤销。本机进度会保留。</p><button class="btn block red" id="dy">确认删除</button><button class="btn block ghost" id="dn" style="margin-top:12px">取消</button>', function (m, close) {
      $('#dn', m).onclick = close;
      $('#dy', m).onclick = function () {
        this.disabled = true;
        Cloud.api('/api/delete', Cloud.ident()).then(function (r) {
          close();
          if (r && (r.ok || r.code === 'nouser')) { clearTimeout(Cloud.timer); Cloud.acct = null; Cloud.board = null; Cloud.saveAcct(); toast('云端数据已删除'); render(); }
          else toast((r && r.msg) || '删除失败', 3000);
        }, function () { close(); Cloud.note(); });
      };
    });
  };
  if (!S.parent.pin) return go();
  modal('<h2>👨‍👩‍👧 需要家长 PIN</h2><div class="form"><input id="dpin" type="password" inputmode="numeric" maxlength="8"></div><button class="btn block blue" id="dok" style="margin-top:12px">继续</button>', function (m, close) {
    $('#dok', m).onclick = function () { if ($('#dpin', m).value === S.parent.pin) { close(); go(); } else { toast('PIN 不正确'); $('#dpin', m).classList.add('shake'); setTimeout(function () { $('#dpin', m).classList.remove('shake'); }, 400); } };
  });
}

/* ---------- add to home screen ---------- */
var deferredInstall = null;
window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredInstall = e; });
function a2hsModal() {
  var ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
  modal('<h2>📲 添加到主屏幕</h2>' + (standalone ? '<p class="big">✅ 你已经是从主屏幕打开的啦！</p>' : '') +
    '<p class="sub">像 App 一样一键打开，全屏更好用；iPhone 上还能减少浏览器自动清理进度的情况。</p>' +
    (deferredInstall ? '<button class="btn block" id="a2go">一键安装到桌面</button>' : '') +
    '<div class="a2steps' + (ios ? ' first' : '') + '"><b>🍎 iPhone / iPad</b><ol><li>用 <b>Safari</b> 打开本网站</li><li>点底部的 <b>分享</b> 按钮 <span class="kbd">⬆️</span></li><li>往下滑，选 <b>“添加到主屏幕”</b></li><li>点右上角 <b>“添加”</b></li></ol></div>' +
    '<div class="a2steps"><b>🤖 安卓手机</b><ol><li>用 <b>Chrome</b> 或手机自带浏览器打开</li><li>点右上角 <b>⋮</b> 或底部 <b>≡ 菜单</b></li><li>选 <b>“添加到主屏幕”</b> / <b>“安装应用”</b> / <b>“添加到桌面”</b></li></ol></div>' +
    '<p class="note">提示：微信里打开时，先点右上角 ··· 选“在浏览器打开”。</p><button class="btn block ghost" data-close>知道了</button>', function (m, close) {
      $('[data-close]', m).onclick = close;
      var g = $('#a2go', m); if (g) g.onclick = function () { deferredInstall.prompt(); deferredInstall.userChoice.then(function () { deferredInstall = null; close(); }); };
    });
}
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () { }); });
}

/* ---------- 排行榜: 班级 (real) + 联赛 (simulated) ---------- */
function leagueSeg(seg) { return '<div class="seg"><button class="' + (seg === 'class' ? 'on' : '') + '" data-href="#/league/class">🏫 班级</button><button class="' + (seg === 'bots' ? 'on' : '') + '" data-href="#/league/bots">🏆 联赛</button></div>'; }
function viewLeague(seg) {
  seg = seg === 'class' || seg === 'bots' ? seg : (Cloud.acct ? 'class' : 'bots');
  if (seg === 'bots') { viewBotLeague(); var pg = $('.page.league', V); if (pg) pg.insertAdjacentHTML('afterbegin', leagueSeg('bots')); return; }
  viewClassBoard();
}
function classRows() {
  var a = Cloud.acct, rows = ((Cloud.board && Cloud.board.rows) || []).map(function (r) { return { nick: r.nick, xp: r.xp, wxp: r.wxp, st: r.st, lv: r.lv }; });
  var me = rows.filter(function (r) { return r.nick === a.nick; })[0], cs = cloudStats();
  if (!me) { me = { nick: a.nick, xp: 0, wxp: 0, st: 0, lv: 0 }; rows.push(me); }
  /* this device knows its own latest numbers; the board can lag up to a minute */
  me.me = true; if (a.dirty) { me.xp = Math.max(me.xp, a.srvXp != null ? Math.min(cs.xp, a.srvXp + 300) : cs.xp); me.wxp = Math.max(me.wxp, a.srvWxp != null ? Math.min(cs.wxp, a.srvWxp + 300) : cs.wxp); } me.st = cs.st; me.lv = Math.max(me.lv, cs.lv);
  var k = Cloud.mode === 'w' ? 'wxp' : 'xp';
  rows.sort(function (x, y) { return (y[k] - x[k]) || (y.xp - x.xp) || (x.nick < y.nick ? -1 : 1); });
  return rows;
}
function viewClassBoard() {
  var a = Cloud.acct, h = '<div class="page league cboard">' + leagueSeg('class');
  if (!a) {
    h += '<div class="cta center">' + mascot('cheer', 120) + '<h2>加入班级，和同学比一比！</h2><p class="sub">输入老师或同学给的班级码，起一个昵称（不要写真名），就能看到真实的班级排行榜，进度也会自动备份。</p><button class="btn block blue" id="gojoin">去加入班级</button><button class="btn block ghost" data-href="#/league/bots" style="margin-top:12px">先看模拟联赛</button></div></div>';
    V.innerHTML = h; $('#gojoin').onclick = function () { location.hash = '#/me'; setTimeout(function () { var c = $('#acct'); if (c) { c.scrollIntoView({ block: 'center' }); var i = $('#acls'); if (i) i.focus(); } }, 150); }; return;
  }
  var wk = (Cloud.board && Cloud.board.week) || shWeekId();
  h += '<div class="ptr" id="ptr">↓ 下拉刷新</div><h1 class="h center">🏫 ' + esc(a.cls) + '</h1><div class="sub center">' + (Cloud.mode === 'w' ? '本周榜 · 第 ' + (+wk.split('W')[1]) + ' 周 · 每周一 00:00（北京时间）清零' : '总榜 · 开始学习以来的全部经验') + '</div>' +
    '<div class="row cbar"><div class="tabs grow"><button class="' + (Cloud.mode === 'w' ? 'on' : '') + '" data-mode="w">📅 本周榜</button><button class="' + (Cloud.mode === 't' ? 'on' : '') + '" data-mode="t">🏆 总榜</button></div><button class="ibtn" id="crefresh" title="刷新">🔄</button></div>';
  if (!Cloud.board && Cloud.boardErr) {
    h += '<div class="cta center">' + mascot('sad', 100) + '<p class="sub">' + (Cloud.boardErr === 'net' ? '云端暂时连不上，稍后再刷新试试。学习进度不受影响。' : esc(Cloud.boardErr)) + '</p><button class="btn ghost" id="cretry">重试</button></div>';
  } else if (!Cloud.board) {
    h += '<div class="cta center"><div class="spin"></div><p class="sub">正在加载班级排行榜…</p></div>';
  } else {
    var rows = classRows(), k = Cloud.mode === 'w' ? 'wxp' : 'xp';
    h += '<div class="board">';
    rows.forEach(function (r, i) {
      var n = i + 1;
      h += '<div class="lrow' + (r.me ? ' me' : '') + '"><span class="rk r' + n + '">' + (n <= 3 && r[k] > 0 ? ['🥇', '🥈', '🥉'][n - 1] : n) + '</span><span class="av">' + (r.me ? mascot('happy', 40) : BOT_AV[hashStr(r.nick) % BOT_AV.length]) + '</span><div class="grow"><b>' + esc(r.nick) + (r.me ? '（你）' : '') + '</b><small class="cmeta">' + (r.st ? '🔥 ' + r.st + ' 天' : '🔥 0') + ' · 📘 ' + r.lv + ' 课</small></div><span class="lx">' + r[k] + ' XP</span></div>';
    });
    h += '</div>';
    if (rows.length < 2) h += '<div class="cta center small">' + mascot('think', 80) + '<p class="sub">班里只有你一个人哦！把班级码 <b>' + esc(a.cls) + '</b> 告诉同学，一起来比赛吧。</p></div>';
    if (Cloud.boardErr) h += '<p class="note center">☁️ 云端暂时连不上，显示的是上次的排行。</p>';
    h += '<p class="note center">排行约 1 分钟内更新 · 上次刷新 ' + fmtAgo(Cloud.boardTs) + (a.dirty ? ' · 你有新进度待同步' : '') + '</p>';
  }
  h += '</div>';
  V.innerHTML = h;
  $$('[data-mode]', V).forEach(function (b) { b.onclick = function () { Cloud.mode = b.getAttribute('data-mode'); sfx.tap(); viewClassBoard(); bindHrefs(V); }; });
  var rf = function () { var btn = $('#crefresh'); if (btn) btn.classList.add('spinning'); Cloud.loadBoard(true).then(function () { if (/^#\/league/.test(location.hash || '') && $('.cboard') && !$('#overlay').children.length) { viewClassBoard(); bindHrefs(V); } }); };
  $('#crefresh').onclick = rf; var rt = $('#cretry'); if (rt) rt.onclick = rf;
  if ((!Cloud.board || Date.now() - Cloud.boardTs > 30000) && Date.now() - (Cloud.boardTry || 0) > 20000) { Cloud.boardTry = Date.now(); if (!Cloud.boardLoading) Cloud.loadBoard(false).then(function () { if (/^#\/league/.test(location.hash || '') && $('.cboard') && !$('#overlay').children.length) { viewClassBoard(); bindHrefs(V); } }); }
  V._ptrRefresh = rf;
}
/* pull-to-refresh on the class board (touch) */
(function () {
  var y0 = null, dy = 0;
  document.addEventListener('touchstart', function (e) { if (!$('.cboard #ptr') || window.scrollY > 0) { y0 = null; return; } y0 = e.touches[0].clientY; dy = 0; }, { passive: true });
  document.addEventListener('touchmove', function (e) { if (y0 == null) return; dy = e.touches[0].clientY - y0; var p = $('#ptr'); if (p) { p.style.height = Math.max(0, Math.min(60, dy * 0.5)) + 'px'; p.textContent = dy > 90 ? '↻ 松开刷新' : '↓ 下拉刷新'; } }, { passive: true });
  document.addEventListener('touchend', function () { if (y0 == null) return; var p = $('#ptr'); if (p) p.style.height = '0'; if (dy > 90 && V._ptrRefresh) V._ptrRefresh(); y0 = null; dy = 0; });
})();

/* ================= practice hub ================= */
function hubCard(icon, title, sub, act, cls) { return '<button class="hub ' + (cls || '') + '" ' + act + '><span class="hi">' + icon + '</span><span class="grow"><b>' + title + '</b><small>' + sub + '</small></span><span class="chev">›</span></button>'; }
function viewPractice() {
  var due = dueWrong().length, act = activeWrong().length;
  var h = '<div class="page"><div class="phead">' + mascot('cheer', 90) + '<div><h1 class="h">练习中心</h1><div class="sub">练习不扣爱心，完成一次还能赚回 ❤️ 1 颗。</div></div></div>' +
    hubCard('🔁', '错题复习' + (due ? ' <span class="badge red">' + due + '</span>' : ''), act ? '错题本里有 ' + act + ' 题，按 1/2/4/7/15 天间隔复习' : '错题本是空的，太棒了！', 'data-href="#/review"', 'big') +
    hubCard('🏁', '期末冲刺', MOCK_N + ' 题 · ' + MOCK_MIN + ' 分钟模拟卷，满分 100' + ((P().mocks || []).length ? ' · 上次 ' + P().mocks[P().mocks.length - 1].score + ' 分' : ''), 'data-href="#/mock"', 'mock') +
    hubCard('🎬', '情景小剧场', '每单元一个动画小短剧：看 → 跟读 → 角色扮演', 'data-href="#/scenes"', 'scene') +
    hubCard('🤖', '和皮皮聊天', 'AI 英语对话：说英语或打字，皮皮回答你', 'data-href="#/chat"') +
    hubCard('🎧', '单词听写', '听读音拼单词，可开中文提示', 'data-href="#/dict"') +
    hubCard('👂', '听力练习', '听句子、点单词，支持 🐢 慢速', 'data-pr="listen"') +
    hubCard('🎤', '口语练习', SR ? '大声读句子，逐词识别打分' : isWX ? '微信里用不了，请在浏览器打开' : '当前浏览器不支持语音识别', 'data-pr="speak"') +
    hubCard('💪', '综合练习', '从学过的课里混合出题', 'data-pr="mix"') +
    '<h3 class="sech">单词</h3><div class="ugrid">' + UNITS.filter(function (u) { return u.words.length; }).map(function (u) { return '<button class="ucard" style="--uc:' + (u.color || '#58cc02') + '" data-act="wordp" data-u="' + u.id + '"><b>' + (u.emoji || '🔤') + ' U' + u.no + '</b><small>' + esc(u.title) + '</small><span>练单词 ›</span></button>'; }).join('') + '</div>' +
    '<h3 class="sech">听读与阅读</h3>' + hubCard('🎧', '课文听读', '逐句跟读课本对话和短文', 'data-href="#/read"') + hubCard('📖', '故事', '原创分级小故事 + 阅读理解', 'data-href="#/stories"') + hubCard('🔤', '单词表', '本册单元词汇、常用表达' + (B.irregular ? '、不规则动词' : ''), 'data-href="#/words"') + '</div>';
  V.innerHTML = h;
  $$('[data-pr]', V).forEach(function (b) { b.onclick = function () { var k = b.getAttribute('data-pr'); if (k === 'listen') startListenPractice(); else if (k === 'speak') startSpeakPractice(); else startMixedPractice(); }; });
}

/* ================= league (simulated bots; the real class board lives in 055_cloud.js) ================= */
function viewBotLeague() {
  var rows = leagueBoard(), rank = myRank(rows), t = S.league.tier, T = TIERS[t];
  var end = new Date(dayOffset(7, mondayOf()) + 'T00:00:00'), left = end - new Date(), dl = Math.floor(left / 86400000), hl = Math.floor(left % 86400000 / 3600000);
  var h = '<div class="page league"><div class="tiers">' + TIERS.map(function (x, i) { return '<span class="tier' + (i === t ? ' on' : i > t ? ' lock' : '') + '" style="--tc:' + x[2] + '">' + (i > t ? '🔒' : x[1]) + '</span>'; }).join('') + '</div>' +
    '<h1 class="h center">' + T[0] + '联赛</h1><div class="sub center">前 ' + PROMO + ' 名晋级' + (t < TIERS.length - 1 ? '到' + TIERS[t + 1][0] + '联赛' : '') + (t > 0 ? '，后 ' + DEMO + ' 名降级' : '') + ' · 还剩 ' + (dl ? dl + ' 天 ' : '') + hl + ' 小时</div><div class="board">';
  rows.forEach(function (r, i) {
    var n = i + 1;
    if (n === PROMO + 1 && t < TIERS.length - 1) h += '<div class="zone up">▲ 晋级区 PROMOTION ZONE ▲</div>';
    if (n === LEAGUE_N - DEMO + 1 && t > 0) h += '<div class="zone down">▼ 降级区 DEMOTION ZONE ▼</div>';
    h += '<div class="lrow' + (r.me ? ' me' : '') + (n <= PROMO && t < TIERS.length - 1 ? ' pz' : '') + (n > LEAGUE_N - DEMO && t > 0 ? ' dz' : '') + '"><span class="rk r' + n + '">' + (n <= 3 ? ['🥇', '🥈', '🥉'][n - 1] : n) + '</span><span class="av">' + (r.me ? mascot('happy', 40) : r.av) + '</span><b class="grow">' + esc(r.name) + (r.me ? '（你）' : '') + '</b><span class="lx">' + r.xp + ' XP</span></div>';
  });
  h += '</div><p class="note center">联赛里的其他同学是本站模拟的练习伙伴，每周一重新分组。真实同学请看「班级」榜。</p></div>';
  V.innerHTML = h;
  showLeagueResult();
}
function showLeagueResult() {
  var r = S.league.result; if (!r || r.seen) return;
  r.seen = true; save();
  var up = r.to > r.from, down = r.to < r.from;
  modal(mascot(up ? 'cheer' : down ? 'sad' : 'happy', 100) + '<h2>' + (up ? '晋级啦！欢迎来到' + TIERS[r.to][0] + '联赛 ' + TIERS[r.to][1] : down ? '降到了' + TIERS[r.to][0] + '联赛' : '保级成功！留在' + TIERS[r.to][0] + '联赛') + '</h2><p class="sub">上周你排第 ' + r.rank + ' 名，获得 ' + r.xp + ' XP' + (r.gems ? '，奖励 💎' + r.gems : '') + '。</p><button class="btn block" data-close>好的</button>', function (m, close) { $('[data-close]', m).onclick = close; if (up) { confetti(); sfx.win(); } });
}

/* ================= quests ================= */
function viewQuests() {
  var tasks = todaysTasks(), c = claimedToday(), now = new Date(), hl = 23 - now.getHours(), ml = 59 - now.getMinutes();
  var mq = monthQuests(), mk = monthKey(), mi = new Date().getMonth();
  var h = '<div class="page"><div class="qhero">' + mascot('cheer', 90) + '<div><h1 class="h">每日任务</h1><div class="sub">⏰ ' + hl + ' 小时 ' + ml + ' 分后刷新 · 完成后打开宝箱领宝石</div></div></div>';
  tasks.forEach(function (t) {
    var v = taskVal(t), ok = v >= t[3], got = c.indexOf(t[0]) >= 0;
    h += '<div class="quest"><span class="qe">' + t[1] + '</span><div class="grow"><b>' + esc(t[2]) + '</b><div class="pbar"><i style="width:' + Math.round(v * 100 / t[3]) + '%"></i><span>' + v + '/' + t[3] + '</span></div></div>' +
      (got ? '<span class="qdone">' + chestSvg('open') + '</span>' : ok ? '<button class="qclaim" data-claim="' + t[0] + '">' + chestSvg('ready') + '<small>领取 💎' + t[5] + '</small></button>' : '<span class="qlock">' + chestSvg('lock') + '<small>💎' + t[5] + '</small></span>') + '</div>';
  });
  h += '<h3 class="sech">' + (mi + 1) + ' 月挑战</h3><div class="month"><span class="mbadge' + (S.badges[mk] ? '' : ' dim') + '">' + MONTH_BADGE[mi] + '</span><div class="grow"><b>本月完成 ' + MONTH_GOAL + ' 个每日任务</b><div class="pbar"><i style="width:' + Math.min(100, Math.round(mq * 100 / MONTH_GOAL)) + '%"></i><span>' + Math.min(mq, MONTH_GOAL) + '/' + MONTH_GOAL + '</span></div><small class="sub">' + (S.badges[mk] ? '已获得本月徽章！' : '完成后获得 ' + (mi + 1) + ' 月限定徽章') + '</small></div></div>';
  var bs = Object.keys(S.badges).sort(); if (bs.length) h += '<div class="card"><b>我的徽章</b><div class="badges">' + bs.map(function (k) { return '<span title="' + k + '">' + MONTH_BADGE[+k.slice(5, 7) - 1] + '<small>' + k + '</small></span>'; }).join('') + '</div></div>';
  V.innerHTML = h + '</div>';
  $$('[data-claim]', V).forEach(function (b) { b.onclick = function () { b.classList.add('opening'); var id = b.getAttribute('data-claim'); setTimeout(function () { claimTask(id); confetti(30); }, 350); }; });
}

/* ================= shop ================= */
function shopItem(icon, title, sub, price, id, state) { return '<div class="sitem"><span class="si">' + icon + '</span><div class="grow"><b>' + title + '</b><small>' + sub + '</small></div><button class="btn sm ' + (state === 'equip' ? 'blue' : state === 'on' ? 'ghost' : state === 'off' ? 'gray' : '') + '" data-buy="' + id + '"' + (state === 'off' || state === 'on' ? ' disabled' : '') + '>' + (state === 'equip' ? '装备' : state === 'on' ? '使用中' : state === 'unequip' ? '取下' : '💎 ' + price) + '</button></div>'; }
function viewShop() {
  regen();
  var h = '<div class="page"><div class="shophead"><h1 class="h">商店</h1><span class="gembal">' + gemSvg() + ' ' + S.gems + '</span></div>' +
    '<h3 class="sech">道具</h3>' +
    shopItem(heartSvg(), '补满爱心', S.hearts >= MAXH ? '爱心已经满了' : '立刻恢复到 5 颗爱心', 50, 'refill', S.hearts >= MAXH || S.gems < 50 ? 'off' : '') +
    shopItem('🧊', '连胜冻结', '错过一天也能保住连胜（已有 ' + S.freezes + '/2）', 40, 'freeze', S.freezes >= 2 || S.gems < 40 ? 'off' : '') +
    shopItem('⚡', '双倍经验 15 分钟', boostOn() ? '生效中，还剩 ' + Math.ceil((S.boostUntil - Date.now()) / 60000) + ' 分钟' : '15 分钟内获得的经验翻倍', 80, 'boost', boostOn() || S.gems < 80 ? 'off' : '') +
    '<h3 class="sech">皮皮的装扮</h3><div class="pipshow">' + mascot('happy', 110) + '</div>';
  Object.keys(OUTFITS).forEach(function (k) { var o = OUTFITS[k], own = S.owned['o:' + k]; h += shopItem(o.e, o.name, '给皮皮换个造型', o.price, 'o:' + k, own ? (S.outfit === k ? 'unequip' : 'equip') : (S.gems < o.price ? 'off' : '')); });
  h += '<h3 class="sech">主题</h3>';
  Object.keys(THEMES).forEach(function (k) { var o = THEMES[k], own = !k || S.owned['t:' + k]; h += shopItem(o.e, o.name + '主题', '改变学习页面的背景', o.price, 't:' + k, own ? (S.theme === k ? 'on' : 'equip') : (S.gems < o.price ? 'off' : '')); });
  V.innerHTML = h + '<p class="note">宝石只是游戏里的奖励，不需要花真钱。</p></div>';
  $$('[data-buy]', V).forEach(function (b) { b.onclick = function () { buy(b.getAttribute('data-buy')); }; });
}
function buy(id) {
  var spend = function (n) { if (S.gems < n) { toast('宝石不够啦'); return false; } S.gems -= n; S.stats.buys = (S.stats.buys || 0) + 1; sfx.buy(); vibrate(30); return true; };
  if (id === 'refill') { if (S.hearts < MAXH && spend(50)) { gainHeart(5); toast('❤️ 爱心已补满'); } }
  else if (id === 'freeze') { if (S.freezes < 2 && spend(40)) { S.freezes++; toast('🧊 获得连胜冻结'); } }
  else if (id === 'boost') { if (!boostOn() && spend(80)) { S.boostUntil = Date.now() + 15 * 60000; toast('⚡ 双倍经验开始！'); } }
  else if (id.indexOf('o:') === 0) { var k = id.slice(2); if (S.owned[id]) S.outfit = S.outfit === k ? '' : k; else if (spend(OUTFITS[k].price)) { S.owned[id] = Date.now(); S.outfit = k; confetti(30); } }
  else if (id.indexOf('t:') === 0) { var t = id.slice(2); if (!t || S.owned[id]) S.theme = t; else if (spend(THEMES[t].price)) { S.owned[id] = Date.now(); S.theme = t; } applyTheme(); }
  save(); checkAch(); render();
}
function applyTheme() { document.body.className = document.body.className.replace(/\btheme-\S+/g, '').trim(); if (S.theme) document.body.classList.add('theme-' + S.theme); }

/* ================= profile ================= */
var GOALS = [[10, '轻松', 'Casual', '每天约 5 分钟'], [20, '常规', 'Regular', '每天约 10 分钟'], [30, '认真', 'Serious', '每天约 15 分钟'], [50, '疯狂', 'Intense', '每天约 20 分钟']];
function viewMe() {
  var T = TIERS[S.league.tier], be = bookEntry(S.course) || {};
  var h = '<div class="page"><div class="prof"><div class="pav">' + mascot('happy', 110) + '</div><div class="grow"><h1 class="h" id="pname">' + esc(S.name || '小小学习者') + ' <button class="ibtn sm" id="rename">✏️</button></h1><div class="sub">' + esc(be.title || '') + ' · ' + esc(be.sub || '') + '</div></div></div>' +
    '<h3 class="sech">班级账号</h3>' + acctCardHtml() +
    '<h3 class="sech">统计</h3><div class="sgrid">' +
    sbox('🔥', streakNow(), '连胜天数') + sbox('⚡', S.xp, '总经验') + sbox(T[1], T[0], '当前联赛') + sbox('👑', crowns(), '皇冠等级') + sbox('📘', doneLessons() + '/' + ALL_LESSON_IDS.length, '完成小课') + sbox('🏆', chalPassed() + '/' + MAIN_UNITS.length, '单元奖杯') + '</div>';
  h += '<h3 class="sech">每日目标</h3><div class="goals">' + GOALS.map(function (g) { return '<button class="goal' + (S.goal === g[0] ? ' on' : '') + '" data-goal="' + g[0] + '"><b>' + g[1] + ' ' + g[2] + '</b><small>' + g[0] + ' XP / 天</small></button>'; }).join('') + '</div>';
  var days = [], mx = 10; for (var i = 6; i >= 0; i--) { var d = dayOffset(-i), dd = S.days[d] || {}; days.push([d, dd.xp || 0]); mx = Math.max(mx, dd.xp || 0); }
  var wk = ['日', '一', '二', '三', '四', '五', '六'];
  h += '<h3 class="sech">本周经验</h3><div class="card"><div class="week">' + days.map(function (x, j) { return '<div class="col' + (j === 6 ? ' today' : '') + '"><b>' + x[1] + '</b><i style="height:' + Math.round(x[1] * 100 / mx) + '%"></i><small>' + (j === 6 ? '今天' : '周' + wk[new Date(x[0] + 'T00:00:00').getDay()]) + '</small></div>'; }).join('') + '</div></div>';
  h += '<h3 class="sech">成就 ' + Object.keys(S.ach).filter(function (k) { return ACH.some(function (a) { return a[0] === k; }); }).length + '/' + ACH.length + '</h3><div class="ach">' + ACH.map(function (a) { return '<div class="a' + (S.ach[a[0]] ? '' : ' no') + '"><span class="e">' + a[1] + '</span><b>' + a[2] + '</b><small>' + esc(a[3]) + '</small></div>'; }).join('') + '</div>';
  var vUS = TTS.best('us'), vGB = TTS.best('gb'), acc = S.settings.accent === 'gb' ? 'gb' : 'us';
  h += '<h3 class="sech">设置</h3><div class="card form"><label>英语朗读语速</label><select id="srate"><option value="0.7">慢 0.7</option><option value="0.8">较慢 0.8</option><option value="0.9">稍慢 0.9</option><option value="1">正常 1.0</option></select>' +
    '<label>英语发音</label><div class="seg" id="sacc"><button data-acc="us" class="' + (acc === 'us' ? 'on' : '') + '">🇺🇸 美音</button><button data-acc="gb" class="' + (acc === 'gb' ? 'on' : '') + '">🇬🇧 英音</button></div>' +
    '<small class="hint">英语、中文都自动选用这台设备上最清晰柔和的女声' + ((acc === 'gb' ? vGB : vUS) ? '' : '（这台设备暂未提供，用默认英语声音）') + '</small>' +
    '<label class="chk"><input type="checkbox" id="ssfx"' + (S.settings.sfx ? ' checked' : '') + '> 音效</label><label class="chk"><input type="checkbox" id="shap"' + (S.settings.haptics !== false ? ' checked' : '') + '> 振动反馈（支持的手机）</label><label class="chk"><input type="checkbox" id="sauto"' + (S.settings.autoExplain ? ' checked' : '') + '> 打开讲解时自动朗读</label>' +
    '<label>👀 护眼提醒（连续学习多久后提醒休息）</label><div class="seg" id="seye">' + [[10, '10 分钟'], [20, '20 分钟'], [30, '30 分钟'], [0, '关闭']].map(function (x) { return '<button data-eye="' + x[0] + '" class="' + (+(S.settings.eye == null ? 20 : S.settings.eye) === x[0] ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '</div>' +
    '<label>📍 这周学到哪</label><button class="btn sm ghost block" id="sfocus">' + (focusUnit() ? '本周重点：' + esc(unitLabel(focusUnit())) + ' ' + esc(focusUnit().title) + ' · 更换' : '选择课堂进度（本周重点单元）') + '</button>' +
    '<button class="btn sm ghost" id="stest" style="margin-top:8px">🔊 试听</button></div>';
  if (BOOKS.length > 1) h += '<h3 class="sech">我的课程</h3>' + BOOKS.map(function (b) { return hubCard(b.emoji || '📘', esc(b.title) + (b.id === S.course ? ' ✔' : ''), esc(b.sub || ''), 'data-course2="' + b.id + '"'); }).join('');
  h += '<h3 class="sech">更好用</h3>' + (isWX ? hubCard('🌐', '在浏览器中打开', '点右上角 ··· 选择「在浏览器打开」，口语题和添加到主屏幕才能用', 'id="a2hs"') : hubCard('📲', '添加到主屏幕', '像 App 一样打开 · iPhone / 安卓步骤', 'id="a2hs"'));
  h += '<button class="btn block blue" data-href="#/parent" style="margin-top:16px">👨‍👩‍👧 家长中心</button><footer class="cr">课本内容版权归人民教育出版社所有，本站仅供家庭学习使用。<br>交互参考 Duolingo 与 聪聪学堂 congcong-school（MIT）。数据保存在本浏览器' + (Cloud.acct ? '，并备份到班级云端' : '') + '。</footer></div>';
  V.innerHTML = h;
  bindAcctCard(); $('#a2hs').onclick = isWX ? wxGuideModal : a2hsModal;
  $$('#seye button').forEach(function (b) { b.onclick = function () { S.settings.eye = +b.getAttribute('data-eye'); save(); $$('#seye button').forEach(function (x) { x.classList.toggle('on', x === b); }); toast(S.settings.eye ? '👀 连续学习 ' + S.settings.eye + ' 分钟后提醒休息' : '已关闭护眼提醒'); }; });
  $('#sfocus').onclick = focusPicker;
  $('#srate').value = String(S.settings.rate);
  $('#srate').onchange = function () { S.settings.rate = parseFloat(this.value); save(); };
  Array.prototype.forEach.call(document.querySelectorAll('#sacc button'), function (b) { b.onclick = function () { S.settings.accent = b.getAttribute('data-acc'); delete S.settings.voice; save(); Array.prototype.forEach.call(document.querySelectorAll('#sacc button'), function (x) { x.classList.toggle('on', x === b); }); TTS.one(S.settings.accent === 'gb' ? 'Hello! Nice to meet you. Shall we read together?' : 'Hello! Nice to meet you. Let\'s read together!', 'en-US'); }; });
  $('#sauto').onchange = function () { S.settings.autoExplain = this.checked; save(); };
  $('#ssfx').onchange = function () { S.settings.sfx = this.checked; save(); };
  $('#shap').onchange = function () { S.settings.haptics = this.checked; save(); };
  $('#stest').onclick = function () { sfx.good(); TTS.mixed('Hello! 你好，我们一起学英语吧。 How was your weekend?'); };
  $('#rename').onclick = function () { modal('<h2>你的名字</h2><div class="form"><input id="nm" maxlength="12" value="' + esc(S.name || '') + '" placeholder="例如：小雨"></div><button class="btn block" id="nok" style="margin-top:12px">保存</button>', function (m, close) { $('#nok', m).onclick = function () { S.name = $('#nm', m).value.trim().slice(0, 12); save(); close(); render(); }; }); };
  $$('[data-goal]', V).forEach(function (b) { b.onclick = function () { S.goal = +b.getAttribute('data-goal'); save(); sfx.tap(); render(); }; });
  $$('[data-course2]', V).forEach(function (b) { b.onclick = function () { switchCourse(b.getAttribute('data-course2')); }; });
}
function sbox(e, v, l) { return '<div class="sbox"><span class="e">' + e + '</span><div><b>' + v + '</b><small>' + l + '</small></div></div>'; }

/* ================= parent center ================= */
var parentOK = false;
function viewParent() {
  if (S.parent.pin && !parentOK) {
    V.innerHTML = '<div class="page"><h1 class="h">👨‍👩‍👧 家长中心</h1><div class="card form"><label>请输入家长 PIN</label><input id="pin" type="password" inputmode="numeric" maxlength="8"><button class="btn block blue" id="pok" style="margin-top:12px">进入</button></div></div>';
    $('#pok').onclick = function () { if ($('#pin').value === S.parent.pin) { parentOK = true; viewParent(); } else { toast('PIN 不正确'); $('#pin').classList.add('shake'); } };
    return;
  }
  var t = D(), rows = '';
  for (var i = 6; i >= 0; i--) { var d = dayOffset(-i), dd = S.days[d] || {}; rows += '<tr><td>' + d.slice(5) + '</td><td>' + Math.round((dd.sec || 0) / 60) + ' 分</td><td>' + (dd.xp || 0) + '</td><td>' + (dd.lessons || 0) + '</td><td>' + (dd.reviews || 0) + '</td></tr>'; }
  var h = '<div class="page"><div class="row"><button class="ibtn" data-href="#/me">←</button><h1 class="h grow" style="margin:0">👨‍👩‍👧 家长中心</h1></div>' +
    '<div class="card"><b>今天已学习 ' + Math.round(t.sec / 60) + ' 分钟</b> · ' + t.xp + ' 经验 · ' + t.lessons + ' 节小课<table class="irr" style="margin-top:8px"><tr><th>日期</th><th>时长</th><th>经验</th><th>小课</th><th>复习</th></tr>' + rows + '</table></div>' +
    weeklyReportHtml() +
    '<div class="card"><div class="row"><h3 class="grow" style="margin:0">🚩 题目报错</h3><button class="ibtn sm" id="prref" title="刷新">🔄</button></div><div class="sub small">孩子在题目上点「🚩 报错」提交的问题' + (Cloud.acct ? '（班级 ' + esc(Cloud.acct.cls) + '）' : '（加入班级后可看到全班的报错）') + '</div><div id="preps"><div class="spin"></div></div></div>' +
    '<button class="btn block blue" data-href="#/teacher" style="margin:12px 0">🧑‍🏫 老师看板（班级码 + 教师 PIN）</button>' +
    '<div class="card form"><h3>🔓 学习路径</h3><label class="chk switch"><input type="checkbox" id="punlock"' + (S.parent.unlockAll ? ' checked' : '') + '><span class="sw"></span> 解锁全部小课（不必按顺序学习）</label>' +
    '<label class="chk switch"><input type="checkbox" id="pinf"' + (S.parent.unlimitedHearts ? ' checked' : '') + '><span class="sw"></span> 无限爱心（答错不扣爱心）</label></div>' +
    '<div class="card form"><h3>⏱️ 每日学习时间上限</h3><div class="sub">到时间后会出现休息提示；设置了 PIN 时需要 PIN 才能继续。0 = 不限制。</div><label>分钟</label><input id="plim" type="number" min="0" max="600" value="' + (S.parent.limit || 0) + '">' +
    '<h3 style="margin-top:16px">🔒 家长 PIN</h3><div class="sub">保护家长中心和时间限制。留空 = 不修改。</div><label>新 PIN（4–8 位数字）</label><input id="ppin" type="password" inputmode="numeric" maxlength="8" placeholder="' + (S.parent.pin ? '已设置，输入新的可修改' : '未设置') + '">' +
    '<button class="btn block" id="psave" style="margin-top:12px">保存设置</button>' + (S.parent.pin ? '<button class="btn block ghost" id="pclear" style="margin-top:10px">清除 PIN</button>' : '') + '</div>' +
    '<div class="card form"><h3>💾 导出 / 导入进度</h3><div class="sub">进度只保存在当前浏览器（上册、下册分开记录，一起导出）。换设备或清理浏览器前，请先导出备份。</div>' +
    '<button class="btn block blue" id="pexp" style="margin-top:10px">导出进度文件</button><label>导入（选择导出的 .json 文件，旧版 v2 备份也可以）</label><input type="file" id="pimp" accept=".json,application/json">' +
    '<label>或粘贴备份文本</label><textarea id="ptxt"></textarea><button class="btn block ghost" id="pimp2" style="margin-top:8px">从文本导入</button></div>' +
    '<div class="card"><h3>⚠️ 重置</h3><button class="btn red block" id="preset">清空全部学习进度</button></div>' +
    '<div class="card note">关于内容：单词、课文对话和短文转录自人教PEP《英语》课本，版权归人民教育出版社所有；知识讲解、练习题和原创故事为本站编写，可能有疏漏，欢迎家长结合课本使用。联赛中的其他玩家为本地模拟；「班级」榜是加入同一班级码的真实同学（只显示昵称）。</div></div>';
  V.innerHTML = h;
  $('#rprint').onclick = function () { document.body.classList.add('printrep'); setTimeout(function () { window.print(); setTimeout(function () { document.body.classList.remove('printrep'); }, 500); }, 50); };
  var loadReps = function () {
    var box = $('#preps'); if (!box) return;
    var local = Reports.queue().map(function (r) { var c = Object.assign({}, r); c.pending = 1; return c; });
    if (!Cloud.acct) { var mine = Reports.hist(); box.innerHTML = reportListHtml(mine.map(function (r) { var c = Object.assign({}, r); if (!r.sent) c.pending = 1; return c; }), { empty: '还没有提交过报错。' }); return; }
    box.innerHTML = '<div class="spin"></div>';
    Reports.flush().then(function () { return Cloud.api('/api/reports?cls=' + encodeURIComponent(Cloud.acct.cls)); }).then(function (r) {
      var b2 = $('#preps'); if (!b2) return;
      if (!r || !r.ok) { b2.innerHTML = '<p class="sub">' + esc((r && r.msg) || '读取失败') + '</p>'; return; }
      b2.innerHTML = reportListHtml(Reports.queue().map(function (x) { var c = Object.assign({}, x); c.pending = 1; return c; }).concat(r.rows));
    }, function () { var b2 = $('#preps'); if (b2) b2.innerHTML = '<p class="sub">☁️ 云端暂时连不上。</p>' + reportListHtml(local, { empty: '' }); });
  };
  loadReps(); $('#prref').onclick = loadReps;
  $('#punlock').onchange = function () { S.parent.unlockAll = this.checked; save(); toast(this.checked ? '已解锁全部小课' : '已恢复按顺序解锁'); };
  $('#pinf').onchange = function () { S.parent.unlimitedHearts = this.checked; save(); renderChrome(); };
  $('#psave').onclick = function () {
    var lim = Math.max(0, parseInt($('#plim').value || '0', 10) || 0), pin = $('#ppin').value.trim();
    if (pin && !/^\d{4,8}$/.test(pin)) return toast('PIN 需要 4–8 位数字');
    S.parent.limit = lim; if (pin) { S.parent.pin = pin; parentOK = true; } save(); toast('已保存'); viewParent();
  };
  var pc = $('#pclear'); if (pc) pc.onclick = function () { S.parent.pin = ''; save(); toast('已清除 PIN'); viewParent(); };
  $('#pexp').onclick = function () {
    var data = JSON.stringify({ app: 'english6', v: 3, exported: new Date().toISOString(), state: S });
    try { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' })); a.download = 'english6-progress-' + today() + '.json'; document.body.appendChild(a); a.click(); a.remove(); } catch (e) { }
    $('#ptxt').value = data; toast('已导出（下方文本框也有一份，可复制保存）');
  };
  function doImport(txt) { try { var o = JSON.parse(txt); var st = o.state || o; if (!st || typeof st.xp !== 'number') throw 0; st = migrate(st); var d = defState(); S = merge(d, st); save(); toast('导入成功！'); render(); } catch (e) { toast('文件格式不对，导入失败'); } }
  $('#pimp').onchange = function () { var f = this.files[0]; if (!f) return; var r = new FileReader(); r.onload = function () { doImport(r.result); }; r.readAsText(f); };
  $('#pimp2').onclick = function () { doImport($('#ptxt').value); };
  $('#preset').onclick = function () { if (confirm('确定清空全部学习进度吗？此操作不能撤销。')) { var p = S.parent; S = defState(); S.parent = p; save(); toast('已清空'); render(); } };
}

/* ================= reader lists / reader / words / review ================= */
function backBtn(def) { return '<button class="ibtn" data-back="' + def + '">←</button>'; }
function bindBack() { $$('[data-back]', V).forEach(function (b) { b.onclick = function () { location.hash = b.getAttribute('data-back'); }; }); }
function readerList(uid, kind) {
  var tabs = UNITS.filter(function (u) { return kind === 'stories' ? u.stories.length || u.passages.some(function (p) { return p.part === 'Story'; }) : u.passages.length; });
  uid = uid || (tabs[0] && tabs[0].id);
  var h = '<div class="page"><div class="row">' + backBtn('#/practice') + '<h1 class="h grow" style="margin:0">' + (kind === 'stories' ? '📖 故事阅读' : '🎧 课文听读') + '</h1></div><div class="sub">' +
    (kind === 'stories' ? '每单元原创分级小故事（配阅读理解题）+ 课本 Reading time。' : '逐句听读课本对话和短文：点句子朗读，“朗读全文”自动高亮，🎤 跟读打分。') + '</div><div class="tabs">';
  tabs.forEach(function (u) { h += '<button class="' + (u.id === uid ? 'on' : '') + '" data-href="#/' + kind + '/' + u.id + '">' + (u.emoji || '') + ' ' + (u.isRevision ? 'Revision' : u.isExtra ? u.zh : 'U' + u.no) + '</button>'; });
  h += '</div>';
  var u = UNITS.filter(function (x) { return x.id === uid; })[0];
  if (u) {
    h += '<div class="sub" style="margin:4px 0 8px"><b>' + esc(u.title) + '</b> ' + esc(u.zh) + '</div>';
    var items = [];
    if (kind === 'stories') {
      u.stories.forEach(function (s) { var d = P().stories[s.id]; items.push(['#/s/' + s.id, '🧸', s.title, s.zh + ' · 原创 ' + (s.level || '') + ' · ' + s.lines.length + ' 句 · ' + (s.qs || []).length + ' 道题', d ? '✅ ' + d.best + '%' : '']); });
      u.passages.filter(function (p) { return p.part === 'Story'; }).forEach(function (p) { items.push(['#/p/' + p.id, '📜', p.title, 'Reading time · ' + p.zh + (p.page ? ' · p.' + p.page : ''), P().read[p.id] ? '✅' : '']); });
    } else {
      u.passages.forEach(function (p) { items.push(['#/p/' + p.id, p.part === 'Story' ? '📜' : p.part === 'C' ? '🛠️' : p.part === 'R' ? '🏛️' : '💬', p.title, (p.part !== 'Story' && p.part !== 'R' ? 'Part ' + p.part + ' · ' : '') + (p.kind || '') + ' · ' + p.zh + (p.page ? ' · p.' + p.page : '') + ' · ' + p.lines.length + ' 句', P().read[p.id] ? '✅' : '']); });
      if (u._song) items.push(['#/p/' + u._song.id, '🎵', u.song.title, 'Song · ' + u.song.zh + (u.song.page ? ' · p.' + u.song.page : ''), P().read[u._song.id] ? '✅' : '']);
    }
    items.forEach(function (it) { h += '<div class="card click item" data-href="' + it[0] + '"><span class="em">' + it[1] + '</span><div class="grow"><b>' + esc(it[2]) + '</b><div class="sub">' + esc(it[3]) + '</div></div><span>' + it[4] + '</span></div>'; });
  }
  V.innerHTML = h + '</div>';
}
function viewReader(p, isStory) {
  var showZh = S.settings.zh;
  var h = '<div class="page"><div class="row">' + backBtn(isStory ? '#/stories/' + p._u.id : '#/read/' + p._u.id) + '<div class="grow"><h1 class="h" style="margin:0">' + esc(p.title) + '</h1><div class="sub">' +
    esc(p.zh) + (p.page ? ' · 课本 p.' + p.page : '') + (isStory ? ' · 原创故事 ' + (p.level || '') : (p.kind ? ' · ' + esc(p.kind) : '')) + '</div></div></div>' +
    '<div class="toolbar"><button class="btn sm blue" id="playall">▶ 朗读全文</button><button class="btn sm ghost" id="stopall">⏹ 停止</button>' +
    '<button class="ibtn' + (showZh ? ' on' : '') + '" id="tzh" title="显示/隐藏中文">中</button><button class="ibtn" id="rate" title="语速">' + (S.settings.rate < 0.8 ? '🐢' : S.settings.rate > 0.95 ? '🐇' : '🚶') + '</button>' +
    '<span class="note">' + (SR ? '🎤 跟读会识别发音并打分' : (canRecord ? '🎤 跟读：录音后回放对比' : '当前浏览器不支持录音')) + '</span></div>';
  var lines = isStory ? p.lines.map(function (l) { return ['', l[0], l[1]]; }) : p.lines;
  lines.forEach(function (l, i) {
    h += '<div class="sent" data-i="' + i + '">' + (l[0] ? avatarFor(l[0]) : '') + '<div class="tx">' + (l[0] ? '<div class="sp">' + esc(l[0]) + '</div>' : '') + '<div class="en">' + esc(l[1]) + '</div><div class="zh' + (showZh ? '' : ' hidden') + '">' + esc(l[2]) + '</div><div class="score" id="sc' + i + '"></div></div>' +
      '<div class="acts"><button class="ibtn" data-say="' + i + '" title="朗读">🔊</button>' + (SR || canRecord ? '<button class="ibtn" data-rec="' + i + '" title="跟读">🎤</button>' : '') + '</div></div>';
  });
  if (isStory && p.qs && p.qs.length) h += '<button class="btn block" id="storyq" style="margin-top:16px">读完了，去答题（' + p.qs.length + ' 题）</button>';
  else if (p.part !== 'Song') { var ls = Object.keys(LESSONS).filter(function (k) { return LESSONS[k].passage === p.id; }); if (ls.length) h += '<button class="btn block ghost" style="margin-top:16px" id="golesson" data-l="' + ls[0] + '">去做本课练习 ›</button>'; }
  V.innerHTML = h + '</div>';
  bindBack();
  var rows = $$('.sent', V);
  function hl(i) { rows.forEach(function (r, j) { r.classList.toggle('on', j === i); }); if (rows[i]) rows[i].scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  rows.forEach(function (r, i) { r.onclick = function (e) { if (e.target.closest('.acts')) return; hl(i); speakEn(lines[i][1]).then(function () { r.classList.remove('on'); }); }; });
  $$('[data-say]', V).forEach(function (b) { b.onclick = function () { var i = +b.getAttribute('data-say'); hl(i); speakEn(lines[i][1]); }; });
  $$('[data-rec]', V).forEach(function (b) { b.onclick = function () { shadow(+b.getAttribute('data-rec'), b); }; });
  function shadow(i, btn) {
    var box = $('#sc' + i); TTS.stop();
    if (SR) {
      btn.classList.add('on'); box.innerHTML = '<span class="sub">🎙️ 请读：' + esc(lines[i][1]) + '</span>';
      recognize(lines[i][1]).then(function (r) {
        btn.classList.remove('on');
        var html = r.words.map(function (w, k) { return '<span class="' + (r.marks[k] ? 'ok' : 'no') + '">' + esc(w) + '</span>'; }).join(' ');
        box.innerHTML = '<div class="scorebar"><b>' + r.score + '分</b> ' + (r.score >= 90 ? '🌟 太棒了！' : r.score >= 70 ? '👍 不错！' : '💪 再试一次') + '</div><div class="marks">' + html + '</div><div class="sub">听到：' + esc(r.heard) + '</div>';
        S.stats.shadow++; bump('shadow'); if (r.score >= 70) addXP(1); r.score >= 70 ? sfx.good() : sfx.bad(); checkAch();
      }).catch(function (e) { btn.classList.remove('on'); box.innerHTML = '<span class="sub">没有听清（' + esc(String(e)) + '），再试一次吧。需要允许使用麦克风。</span>'; });
      return;
    }
    if (!Rec.mr) { Rec.start().then(function () { btn.classList.add('on'); btn.textContent = '⏺'; box.innerHTML = '录音中……读完后再点一次 ⏺ 停止'; }).catch(function () { box.innerHTML = '无法使用麦克风（需要 HTTPS 和麦克风权限）。'; }); }
    else { Rec.stop().then(function (url) { btn.classList.remove('on'); btn.textContent = '🎤'; box.innerHTML = '<audio controls src="' + url + '"></audio> <button class="btn sm ghost" id="cmp' + i + '">听原音</button>'; $('#cmp' + i).onclick = function () { speakEn(lines[i][1]); }; S.stats.shadow++; bump('shadow'); addXP(1); checkAch(); }); }
  }
  $('#tzh').onclick = function () { S.settings.zh = !S.settings.zh; save(); $$('.zh', V).forEach(function (z) { z.classList.toggle('hidden', !S.settings.zh); }); this.classList.toggle('on', S.settings.zh); };
  $('#rate').onclick = function () { var r = S.settings.rate; S.settings.rate = r < 0.8 ? 0.9 : r < 0.95 ? 1.0 : 0.7; save(); this.textContent = S.settings.rate < 0.8 ? '🐢' : S.settings.rate > 0.95 ? '🐇' : '🚶'; toast('语速：' + (S.settings.rate < 0.8 ? '慢' : S.settings.rate > 0.95 ? '正常' : '稍慢')); };
  $('#stopall').onclick = function () { TTS.stop(); hl(-1); };
  $('#playall').onclick = function () {
    TTS.stop(); var my = TTS.token, i = 0;
    function nx() { if (my !== TTS.token) return; if (i >= lines.length) { hl(-1); finishRead(); return; } hl(i); TTS.say(lines[i][1], 'en-US').then(function () { i++; setTimeout(nx, 350); }); }
    setTimeout(nx, 80);
  };
  function finishRead() {
    var R = P(); R.read[p.id] = (R.read[p.id] || 0) + 1; S.stats.reads++; bump('reads');
    R.readDay = R.readDay || {}; if (R.readDay.d !== today()) R.readDay = { d: today(), ids: [] };
    if (R.readDay.ids.indexOf(p.id) < 0) { R.readDay.ids.push(p.id); addXP(5); toast('听完全文！+5 经验'); } save(); checkAch();
  }
  var sq = $('#storyq'); if (sq) sq.onclick = function () { TTS.stop(); startSession({ mode: 'story', title: p.title, questions: p.qs.slice(), storyId: p.id }); };
  var gl = $('#golesson'); if (gl) gl.onclick = function () { var l = LESSONS[gl.getAttribute('data-l')]; if (isUnlocked(l)) startLesson(l); else toast('这一课还没解锁'); };
}
function viewWords(uid, filter) {
  var tabs = UNITS.filter(function (u) { return u.words.length; }); uid = uid || (tabs[0] && tabs[0].id); filter = filter || 'all';
  var h = '<div class="page"><div class="row">' + backBtn('#/practice') + '<h1 class="h grow" style="margin:0">🔤 单词与表达</h1></div><div class="sub">来自课本单元词汇表' + (WORDS.some(function (w) { return w.req; }) ? '：<span class="pill req">会用</span>黑体词要求理解、运用；<span class="pill rec">认读</span>白体词仅要求在语境中理解' : '') + '；<span class="pill lv">二级</span>为课标二级词。</div><div class="tabs">';
  tabs.forEach(function (u) { h += '<button class="' + (u.id === uid ? 'on' : '') + '" data-href="#/words/' + u.id + '">' + (u.emoji || '') + ' U' + u.no + '</button>'; });
  if (B.irregular && B.irregular.length) h += '<button class="' + (uid === 'irr' ? 'on' : '') + '" data-href="#/words/irr">⏳ 不规则动词</button>';
  if (B.comparatives && B.comparatives.length) h += '<button class="' + (uid === 'cmp' ? 'on' : '') + '" data-href="#/words/cmp">📏 比较级</button>';
  h += '<button class="' + (uid === 'expr' ? 'on' : '') + '" data-href="#/words/expr">💬 常用表达</button></div>';
  if (uid === 'cmp' && B.comparatives) { h += '<div class="card"><table class="irr"><tr><th>原级</th><th>比较级</th><th>意思</th></tr>'; B.comparatives.forEach(function (r) { h += '<tr data-sayt="' + esc(r[0] + ', ' + r[1]) + '"><td><b>' + esc(r[0]) + '</b></td><td>' + esc(r[1]) + '</td><td class="sub">' + esc(r[2] || '') + '</td></tr>'; }); h += '</table></div>'; V.innerHTML = h + '</div>'; bindBack(); $$('[data-sayt]', V).forEach(function (el) { el.onclick = function (e) { e.stopPropagation(); speakEn(el.getAttribute('data-sayt')); }; }); return; }
  if (uid === 'irr' && B.irregular) {
    h += '<div class="sub">课本附录 Irregular verbs（点击一行朗读）</div><div class="card"><table class="irr"><tr><th>动词</th><th>过去式</th><th>意思</th></tr>';
    B.irregular.forEach(function (r) { var b = r[0].split(' ')[0]; h += '<tr data-sayt="' + esc(b + ', ' + r[1]) + '"><td><b>' + esc(r[0]) + '</b></td><td>' + esc(r[1]) + '</td><td class="sub">' + esc((B.irregularZh || {})[b] || '') + '</td></tr>'; });
    h += '</table></div>';
  } else if (uid === 'expr') {
    MAIN_UNITS.forEach(function (u) { if (!u.expressions.length) return; h += '<h3>' + (u.emoji || '') + ' Unit ' + u.no + ' ' + esc(u.title) + '</h3><div class="card">'; u.expressions.forEach(function (e) { h += '<div class="wrow" data-sayt="' + esc(e[0]) + '" style="cursor:pointer"><div class="grow"><div class="w" style="font-size:16px">' + esc(e[0]) + '</div><div class="zh sub">' + esc(e[1]) + '</div></div><span>🔊</span></div>'; }); h += '</div>'; });
  } else {
    var u = UNITS.filter(function (x) { return x.id === uid; })[0];
    if (u) {
      var ws = u.words.filter(function (w) { return filter === 'all' || (filter === 'req' ? w.req : !w.req); });
      var hasReq = u.words.some(function (w) { return w.req; }); if (!hasReq) filter = 'all';
      h += '<div class="row" style="margin:6px 0"><div class="tabs grow" style="padding:0">' + (!hasReq ? '<button class="on">全部 ' + u.words.length + '</button>' : [['all', '全部 ' + u.words.length], ['req', '会用 ' + u.words.filter(function (w) { return w.req; }).length], ['rec', '认读 ' + u.words.filter(function (w) { return !w.req; }).length]].map(function (f) { return '<button class="' + (f[0] === filter ? 'on' : '') + '" data-href="#/words/' + uid + '/' + f[0] + '">' + f[1] + '</button>'; }).join('')) + '</div>' +
        '<button class="btn sm" data-act="wordp" data-u="' + uid + '">练一练</button></div><div class="card">';
      ws.forEach(function (w) { h += '<div class="wrow">' + '<button class="ibtn" data-sayt="' + esc(w.w + (w.past ? ', ' + w.past : '')) + '">🔊</button>' + (emojiOf(w.w) ? '<span class="wem">' + emojiOf(w.w) + '</span>' : '') + '<div class="grow"><span class="w">' + esc(w.w) + '</span> <span class="ph">' + esc(w.ph || '') + '</span>' + (w.past ? ' <span class="sub">过去式 <b>' + esc(w.past) + '</b> ' + esc(w.pastPh || '') + '</span>' : '') +
        '<div class="zh">' + esc(w.zh) + (w.note ? '（' + esc(w.note) + '）' : '') + '</div><div>' + (w.req ? '<span class="pill req">会用</span>' : hasReq ? '<span class="pill rec">认读</span>' : '') + (w.lvl2 ? '<span class="pill lv">二级</span>' : '') + (w.proper ? '<span class="pill">专有名词</span>' : '') + (w.page ? '<span class="pill">p.' + w.page + '</span>' : '') + '</div></div></div>'; });
      h += '</div>';
    }
  }
  V.innerHTML = h + '</div>'; bindBack();
  $$('[data-sayt]', V).forEach(function (el) { el.onclick = function (e) { e.stopPropagation(); speakEn(el.getAttribute('data-sayt')); }; });
}
function qText(q) { if (q.q) return q.q; if (q.t === 'dict') return '听写：' + q.a + (q.zh ? '（' + shortZh(q.zh) + '）' : ''); if (q.t === 'trans') return '翻译：' + q.prompt; if (q.t === 'ltap' || q.t === 'speak') return (q.t === 'speak' ? '读句子：' : '听写：') + q.say; if (q.t === 'pic') return '哪一个是“' + q.prompt + '”'; if (q.t === 'blank') return q.before + '___' + q.after; if (q.t === 'dialog') return q.who + '：' + q.line; return ''; }
function viewReview() {
  var act = activeWrong(), due = dueWrong(), W = P().wrong, mastered = Object.keys(W).filter(function (k) { return W[k].box >= 5; }).length;
  var h = '<div class="page"><div class="row">' + backBtn('#/practice') + '<h1 class="h grow" style="margin:0">🔁 错题本</h1></div><div class="sub">答错的题会自动收进来，按间隔重复（1、2、4、7、15 天）安排复习；连续答对 5 轮就算掌握。复习不扣爱心，完成一轮恢复 1 颗爱心。</div>' +
    '<div class="sgrid" style="margin:12px 0">' + sbox('⏰', due.length, '现在该复习') + sbox('📒', act.length, '在本子里') + sbox('✅', mastered, '已掌握') + sbox('🏅', S.stats.reviewed, '累计复习答对') + '</div>';
  if (due.length) h += '<button class="btn block" id="revgo">开始复习（' + Math.min(10, due.length) + ' 题）</button>';
  else if (act.length) h += '<button class="btn block blue" id="revall">暂无到期错题 · 提前复习</button>';
  if (!act.length) h += '<div class="empty">' + mascot('happy', 110) + '<p>错题本是空的！<br>每一次尝试都在进步，去闯关吧。</p></div>';
  else {
    h += '<h3 class="sech">本子里的题</h3>';
    act.sort(function (a, b) { return W[a].due - W[b].due; }).forEach(function (k) {
      var w = W[k], q = wrongQ(k), ans = rightText(q);
      var dueTxt = w.due <= Date.now() ? '<b style="color:var(--r)">现在</b>' : new Date(w.due).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
      h += '<div class="card"><div class="sub">' + esc(wrongSrc(k)) + ' · 错 ' + w.n + ' 次 · 第 ' + w.box + '/5 轮 · 下次 ' + dueTxt + '</div><div style="font-weight:800">' + esc(qText(q)) + (q.say && q.t === 'listen' ? ' <span class="sub">（' + esc(q.say) + '）</span>' : '') + '</div>' + (ans ? '<div class="sub">答案：' + esc(ans) + '</div>' : '') + (w.la ? '<div class="sub">我上次答：' + esc(w.la) + '</div>' : '') + '<button class="btn sm ghost exbtn" data-ex="' + esc(k) + '">🤔 讲讲我错在哪</button></div>';
    });
  }
  V.innerHTML = h + '</div>'; bindBack();
  $$('[data-ex]', V).forEach(function (b) { b.onclick = function () { var k = b.getAttribute('data-ex'), q = wrongQ(k); if (q) explainWrong(q, (P().wrong[k] || {}).la || ''); }; });
  var g = $('#revgo') || $('#revall');
  if (g) g.onclick = function () { var keys = shuffle(due.length ? due : act).slice(0, 10); startSession({ mode: 'review', title: '错题复习', questions: keys.map(function (k) { var q = wrongQ(k); if (!q._key) q = Object.assign({}, q); return q; }) }); };
}

/* ================= lesson tips (知识讲解) ================= */
function viewLessonIntro(l) {
  var u = l._u, ws = (l.words || []).map(function (n) { return u.words.filter(function (w) { return w.w === n; })[0]; }).filter(Boolean);
  var p = l.passage && PASSAGES[l.passage];
  var h = '<div class="lesson tips"><div class="inner"><div class="ltop"><button class="x" id="lx">✕</button><div class="grow"><b>' + esc(l.title) + '</b><div class="sub">' + esc(unitLabel(u)) + ' ' + esc(u.title) + (l.page ? ' · 课本 p.' + l.page : '') + '</div></div></div>' +
    '<div class="lbody explain"><button class="qflag" id="tflag">🚩 报错</button>' + bubble('我们先看看这一课的要点吧！<button class="btn sm blue" id="readall">🔊 朗读讲解</button>', 'happy', 80);
  l.explain.forEach(function (t, i) { h += '<div class="para" data-p="' + i + '">' + esc(t) + '</div>'; });
  if (l.table) { h += '<div class="card"><table class="irr">'; l.table.forEach(function (r) { h += '<tr data-sayt="' + esc(r[0].split(' ')[0] + ', ' + r[1]) + '"><td><b>' + esc(r[0]) + '</b></td><td>→ ' + esc(r[1]) + '</td><td class="sub">' + esc(((B.irregularZh || {})[r[0].split(' ')[0]]) || '') + '</td><td>🔊</td></tr>'; }); h += '</table></div>'; }
  if (l.key.length) {
    h += '<h3>🗣️ 重点句型</h3><div class="keys">';
    l.key.forEach(function (k) { var zh = SENTZH[k] || ''; h += '<div class="k"><button class="ibtn" data-sayt="' + esc(k) + '">🔊</button><div><div class="en">' + esc(k) + '</div>' + (zh ? '<div class="zh">' + esc(zh) + '</div>' : '') + '</div></div>'; });
    h += '</div>';
  }
  if (ws.length) { h += '<h3>🔤 本课单词</h3><div class="wordchips">'; ws.forEach(function (w) { h += '<div class="wchip" data-sayt="' + esc(w.w) + '">' + (emojiOf(w.w) ? '<span class="wem">' + emojiOf(w.w) + '</span> ' : '') + '<b>' + esc(w.w) + '</b> <small>' + esc(w.ph || '') + '</small><br><small>' + esc(w.zh) + '</small>' + (w.req ? ' <span class="pill req">会用</span>' : '') + '</div>'; }); h += '</div>'; }
  if (p) h += '<div class="card click row" style="margin-top:16px" data-href2="#/p/' + p.id + '"><span style="font-size:28px">🎧</span><div class="grow"><b>课文听读：' + esc(p.title) + '</b><div class="sub">' + esc(p.kind || '') + ' · ' + p.lines.length + ' 句 · 可跟读</div></div><span>›</span></div>';
  h += '</div><div class="lfoot"><div class="fbtns"><button class="btn" id="lgo">' + (isUnlocked(l) ? 'START · 开始练习' : '🔒 还没解锁') + '</button></div></div></div></div>';
  var ov = $('#overlay'); ov.innerHTML = h;
  $('#lx', ov).onclick = function () { TTS.stop(); ov.innerHTML = ''; location.hash = '#/'; };
  $$('[data-sayt]', ov).forEach(function (el) { el.onclick = function () { speakEn(el.getAttribute('data-sayt')); }; });
  $$('[data-href2]', ov).forEach(function (el) { el.onclick = function () { TTS.stop(); ov.innerHTML = ''; location.hash = el.getAttribute('data-href2'); }; });
  var paras = $$('.para', ov);
  function readFrom(i) { if (i >= paras.length) { paras.forEach(function (x) { x.classList.remove('speaking'); }); return; } var my = TTS.token + 1; paras.forEach(function (x, j) { x.classList.toggle('speaking', j === i); }); TTS.mixed(l.explain[i]).then(function (ok) { if (ok && TTS.token === my) readFrom(i + 1); else if (paras[i]) paras[i].classList.remove('speaking'); }); }
  paras.forEach(function (pp, i) { pp.onclick = function () { readFrom(i); }; });
  $('#readall', ov).onclick = function () { readFrom(0); };
  $('#tflag', ov).onclick = function () { reportModal({ t: 'explain' }, null, { qid: 'explain:' + l.id, text: '讲解：' + l.title + ' — ' + (l.explain[0] || '').slice(0, 160), unit: u.id, qt: 'explain', right: '' }); };
  $('#lgo', ov).onclick = function () { if (!isUnlocked(l)) return; TTS.stop(); history.replaceState(null, '', '#/'); startLesson(l); };
  if (S.settings.autoExplain) setTimeout(function () { if ($('#readall', ov)) readFrom(0); }, 300);
}

/* ================= onboarding: daily goal ================= */
function onboarding() {
  var sel = 20;
  var h = '<div class="lesson onboard"><div class="inner"><div class="lbody">' + bubble(S.xp ? '嗨！我是皮皮 👋 新版闯关站上线啦！先选一个每日目标吧。' : '嗨！我是皮皮 👋 我们一起学六年级英语吧！先选一个每日目标。', 'cheer', 110) +
    '<div class="goallist">' + GOALS.map(function (g) { return '<button class="goalopt' + (g[0] === sel ? ' sel' : '') + '" data-g="' + g[0] + '"><b>' + g[1] + ' ' + g[2] + '</b><span>' + g[3] + ' · ' + g[0] + ' XP</span></button>'; }).join('') + '</div></div>' +
    '<div class="lfoot"><div class="fbtns"><button class="btn" id="gok">我决定了 · CONTINUE</button></div></div></div></div>';
  var ov = $('#overlay'); ov.innerHTML = h;
  $$('[data-g]', ov).forEach(function (b) { b.onclick = function () { sel = +b.getAttribute('data-g'); sfx.tap(); $$('[data-g]', ov).forEach(function (x) { x.classList.toggle('sel', x === b); }); }; });
  $('#gok', ov).onclick = function () { S.goal = sel; save(); ov.innerHTML = ''; sfx.good(); toast('🎯 每日目标：' + sel + ' XP'); render(); setTimeout(scrollToCurrent, 200); };
}

/* ================= time limit ================= */
var lastTick = Date.now();
setInterval(function () {
  var now = Date.now(), dt = Math.min(30, Math.round((now - lastTick) / 1000)); lastTick = now;
  if (document.visibilityState !== 'visible' || !B) return;
  var act = isActiveNow(); if (act) { D().sec += dt; S.lastActive = now; } regen(); save(); renderTop(); checkLimit();
  Eye.tick(dt, act, now - lastAct);
}, 15000);
function limitSec() { var ex = (S.parent.extra && S.parent.extra[today()]) || 0; return (S.parent.limit || 0) * 60 + ex * 60; }
var lockOpen = false;
function checkLimit() {
  if (!S.parent.limit || S.unlock === today() || lockOpen) return;
  if (D().sec < limitSec()) return;
  lockOpen = true; TTS.stop(); closeLesson(true);
  modal(mascot('sad', 90) + '<h2>今天的学习时间到啦！</h2><p class="sub">休息一下眼睛，明天再来闯关吧。</p>' +
    (S.parent.pin ? '<div class="form"><label>家长 PIN 解锁</label><input id="lkpin" type="password" inputmode="numeric" maxlength="8"></div><button class="btn blue block" id="lkok" style="margin-top:12px">解锁今天</button>' :
      '<p class="note">家长未设置 PIN。</p><button class="btn blue block" id="lk10">家长：再学 10 分钟</button>'), function (m, close) {
      var ok = $('#lkok', m); if (ok) ok.onclick = function () { if ($('#lkpin', m).value === S.parent.pin) { S.unlock = today(); save(); lockOpen = false; close(); } else { $('#lkpin', m).classList.add('shake'); setTimeout(function () { $('#lkpin', m).classList.remove('shake'); }, 400); } };
      var t = $('#lk10', m); if (t) t.onclick = function () { S.parent.extra = S.parent.extra || {}; S.parent.extra[today()] = (S.parent.extra[today()] || 0) + 10; save(); lockOpen = false; close(); };
    }, 'sticky');
}

/* ================= v3.3: 报错 · 期末冲刺 · 单词听写 · 本周重点 · 学习报告 · 老师看板 · 护眼 · 微信 ================= */
var APP_V = '3.5.0';
function isEnWord(t) { return /^[A-Za-z][A-Za-z'’\- ]*$/.test(String(t || '').trim()) && String(t).trim().split(/\s+/).length <= 3; }
/* which word a missed question was about (for "most-missed words") */
function missWordOf(q) {
  if (q.t === 'dict') return q.a;
  if (q.t === 'pic') return q.word || (q.opts[q.a] || {}).w;
  if (q.t === 'fill' && isEnWord(q.a)) return q.a;
  if ((q.t === 'choice' || q.t === 'listen') && q.say && isEnWord(q.say)) return q.say;
  if ((q.t === 'choice' || q.t === 'listen' || q.t === 'blank') && q.opts && isEnWord(q.opts[q.a])) return q.opts[q.a];
  return null;
}
function trackMiss(q) {
  var w = missWordOf(q); if (!w) return;
  w = String(w).trim().toLowerCase(); var d = D(); d.mw = d.mw || {}; d.mw[w] = (d.mw[w] || 0) + 1;
}
function topMissed(days, n) {
  var m = {}; for (var i = 0; i < days; i++) { var dd = S.days[dayOffset(-i)]; if (dd && dd.mw) for (var w in dd.mw) m[w] = (m[w] || 0) + dd.mw[w]; }
  return Object.keys(m).sort(function (a, b) { return m[b] - m[a] || (a < b ? -1 : 1); }).slice(0, n).map(function (w) { return [w, m[w]]; });
}
function wordZh(w) { w = String(w).toLowerCase(); for (var i = 0; i < WORDS.length; i++) if (WORDS[i].w.toLowerCase() === w) return shortZh(WORDS[i].zh); return ''; }
/* anonymized aggregate miss stats uploaded with the cloud backup (no answers, no timestamps per item) */
function missStats() {
  var w = {}; topMissed(30, 30).forEach(function (x) { w[x[0]] = x[1]; });
  var q = {}, all = [], cut = Date.now() - 30 * 864e5;
  for (var b in (S.books || {})) { var W = (S.books[b] || {}).wrong || {}; for (var k in W) { var x = W[k]; if (x && x.n && (x.last || x.first || 0) >= cut) all.push([b, k, x]); } }
  all.sort(function (a, c) { return c[2].n - a[2].n; }).slice(0, 30).forEach(function (r) {
    var qq = r[0] === S.course ? wrongQ(r[1]) : (r[2].q || null); var t = qq ? qText(qq) : (r[2].q ? qText(r[2].q) : r[1]);
    q[r[0] + ':' + r[1]] = [r[2].n, String(t || '').slice(0, 100), r[0]];
  });
  return { w: w, q: q };
}
function daysActiveThisWeek() { var mon = shMonday(), n = 0; for (var i = 0; i < 7; i++) { var dd = S.days[dayOffset(i, mon)]; if (dd && (dd.xp > 0 || (dd.sec || 0) >= 60)) n++; } return n; }

/* ---------- 报错 (question reports) with an offline queue ---------- */
var REASONS = [['答案不对', '❌'], ['题目看不懂', '🤔'], ['发音不对', '🔈'], ['其他', '💬']];
var Reports = {
  QK: 'e6.rq', HK: 'e6.rh', sending: false,
  queue: function () { try { return JSON.parse(localStorage.getItem(this.QK) || '[]'); } catch (e) { return []; } },
  setQueue: function (a) { try { localStorage.setItem(this.QK, JSON.stringify(a.slice(-60))); } catch (e) { } },
  hist: function () { try { return JSON.parse(localStorage.getItem(this.HK) || '[]'); } catch (e) { return []; } },
  addHist: function (r) { var h = this.hist(); h.unshift(r); try { localStorage.setItem(this.HK, JSON.stringify(h.slice(0, 40))); } catch (e) { } },
  add: function (r) { var q = this.queue(); q.push(r); this.setQueue(q); this.addHist(r); return this.flush(); },
  flush: function () {
    var self = this, q = this.queue(); if (!q.length || this.sending) return Promise.resolve(false);
    if (navigator.onLine === false) return Promise.resolve(false);
    this.sending = true; var batch = q.slice(0, 20);
    return Cloud.api('/api/report', { items: batch }).then(function (r) {
      self.sending = false;
      if (r && r.ok) { var ids = batch.map(function (x) { return x.time + '|' + x.qid; }); self.setQueue(self.queue().filter(function (x) { return ids.indexOf(x.time + '|' + x.qid) < 0; })); var h = self.hist(); h.forEach(function (x) { if (ids.indexOf(x.time + '|' + x.qid) >= 0) x.sent = 1; }); try { localStorage.setItem(self.HK, JSON.stringify(h)); } catch (e) { } if (self.queue().length) setTimeout(function () { self.flush(); }, 1500); return true; }
      return false;
    }, function () { self.sending = false; return false; });
  }
};
window.addEventListener('online', function () { Reports.flush(); });
setInterval(function () { Reports.flush(); }, 5 * 60000);
function ansText(q, a) {
  if (a == null || a === '') return '';
  if (q.t === 'match') return a === true ? '全部配对正确' : '配对时有错';
  if (q.t === 'speak') return typeof a === 'number' ? '发音得分 ' + a : '';
  if (typeof a === 'number' && q.opts) { var o = q.opts[a]; return o == null ? '' : typeof o === 'object' ? (o.e || '') + ' ' + (o.w || '') : String(o); }
  return String(a);
}
function reportModal(q, answer, extra) {
  var sel = '', qt = extra && extra.text ? extra.text : qText(q) + (q.opts && q.t !== 'pic' ? '（选项：' + q.opts.join(' / ') + '）' : '') + (q.pairs ? '（' + q.pairs.map(function (x) { return x[0] + ' = ' + x[1]; }).join('；') + '）' : '') + (q.t === 'pic' ? '（' + q.opts.map(function (o) { return o.w; }).join(' / ') + '）' : '');
  var h = '<div class="rephead">' + mascot('think', 64) + '<div><h2>这道题有问题吗？</h2><p class="sub">告诉皮皮哪里不对，老师和爸爸妈妈会看到 🙏</p></div></div>' +
    '<div class="repq">' + esc(qt).slice(0, 220) + '</div>' +
    '<div class="reasons">' + REASONS.map(function (r) { return '<button class="reason" data-r="' + r[0] + '"><span>' + r[1] + '</span>' + r[0] + '</button>'; }).join('') + '</div>' +
    '<textarea id="rnote" maxlength="200" rows="2" placeholder="还想说点什么？（可以不写）"></textarea>' +
    '<button class="btn block" id="rsend" disabled>提交报错</button><button class="btn block ghost" id="rno" style="margin-top:10px">取消</button>';
  modal(h, function (m, close) {
    $$('.reason', m).forEach(function (b) { b.onclick = function () { sfx.tap(); sel = b.getAttribute('data-r'); $$('.reason', m).forEach(function (x) { x.classList.toggle('on', x === b); }); $('#rsend', m).disabled = false; }; });
    $('#rno', m).onclick = close;
    $('#rsend', m).onclick = function () {
      if (!sel) return;
      var a = Cloud.acct || {}, r = {
        qid: (extra && extra.qid) || qKey(q), course: S.course, unit: (QIDX[q._key] || {}).unit || (extra && extra.unit) || '', qt: q.t || (extra && extra.qt) || '',
        text: String(qt).slice(0, 300), ans: ansText(q, answer).slice(0, 120), right: (extra && extra.right) || String(rightText(q) || '').slice(0, 120),
        reason: sel, note: $('#rnote', m).value.trim().slice(0, 200), cls: a.cls || '', nick: a.nick || S.name || '', time: Date.now(), v: APP_V
      };
      close(); sfx.good();
      Reports.add(r).then(function (ok) { toast(ok ? '🚩 谢谢你！报错已发送' : '🚩 已记下，联网后会自动发送', 2600); });
    };
  });
}
function reportListHtml(rows, opts) {
  opts = opts || {};
  if (!rows.length) return '<p class="sub">' + (opts.empty || '还没有报错，题目都很棒！') + '</p>';
  return rows.map(function (r) {
    return '<div class="reprow"><div class="reptop"><span class="pill req">' + esc(r.reason || '其他') + '</span><span class="sub small">' + esc(r.nick || '匿名') + ' · ' + fmtAgo(r.time) + (r.course ? ' · ' + (r.course === 'g6down' ? '六下' : '六上') : '') + (r.pending ? ' · <b class="pend">待发送</b>' : '') + '</span>' +
      (opts.del && r.key ? '<button class="lnkbtn repdel" data-del="' + esc(r.key) + '">删除</button>' : '') + '</div>' +
      '<div class="reptx">' + esc(r.text || r.qid) + '</div>' + (r.ans ? '<div class="sub small">孩子的答案：' + esc(r.ans) + '</div>' : '') + (r.right ? '<div class="sub small">本站答案：' + esc(r.right) + '</div>' : '') + (r.note ? '<div class="repnote">“' + esc(r.note) + '”</div>' : '') + '</div>';
  }).join('');
}

/* ---------- 期末冲刺 mock test ---------- */
var MOCK_N = 30, MOCK_MIN = 20, mockTimer = null;
var MOCK_CAT = { listen: ['👂', '听力'], choice: ['✅', '单项选择'], fill: ['✍️', '词汇填空'], read: ['📖', '阅读与对话'] };
var MOCK_QUOTA = { listen: 8, choice: 10, fill: 6, read: 6 };
function mockCat(q) {
  if (q._cat) return q._cat;
  if (isListenType(q)) return 'listen';
  if (q.t === 'fill' || q.t === 'blank' || q.t === 'order' || q.t === 'dict') return 'fill';
  if (q.t === 'dialog' || q.t === 'trans') return 'read';
  return 'choice';
}
function buildMock() {
  var units = MAIN_UNITS.filter(function (u) { return u.lessons.length; }), pools = { listen: [], choice: [], fill: [], read: [] };
  units.forEach(function (u) {
    u.lessons.forEach(function (l) {
      l.questions.forEach(function (q) {
        if (q.t === 'match' || q.t === 'speak') return;
        var c = mockCat(q); if (c === 'choice' && /^(C|Story|R)$/.test(l.part || '') && !q.say) { pools.read.push(q); return; }
        pools[c].push(q);
      });
    });
    u.lessons.forEach(function (l, i) {
      var gs = [genDialog]; if (i < 3) gs.push(genListenTap, genBlank); if (i % 2 === 0) gs.push(genTransEZ);
      gs.forEach(function (g) { try { var q = g(l); if (q) pools[mockCat(q)].push(q); } catch (e) { } });
    });
  });
  if (listenOff()) pools.listen = [];
  var out = [], used = {};
  function take(cat, n) {
    // spread across units: round-robin by unit
    var byU = {}; shuffle(pools[cat]).forEach(function (q) { var k = q._key ? (QIDX[q._key] || {}).unit : (q._src || ''); (byU[k] = byU[k] || []).push(q); });
    var keys = shuffle(Object.keys(byU)), got = 0, guard = 0;
    while (got < n && guard++ < 400) { var any = false; keys.forEach(function (k) { if (got >= n) return; var q = byU[k].shift(); if (!q) return; any = true; var id = qKey(q); if (used[id]) return; used[id] = 1; out.push(q); got++; }); if (!any) break; }
    return got;
  }
  var short = 0; ['listen', 'choice', 'fill', 'read'].forEach(function (c) { short += MOCK_QUOTA[c] - take(c, MOCK_QUOTA[c]); });
  if (short > 0) take('choice', short);
  // keep exam order: listening first, like a real paper
  var order = { listen: 0, choice: 1, fill: 2, read: 3 };
  return out.map(function (q) { var c = Object.assign({}, q); c._cat = mockCat(q); if (q._key) c._key = q._key; return c; }).sort(function (a, b) { return order[a._cat] - order[b._cat]; }).slice(0, MOCK_N);
}
function startMock() {
  var qs = buildMock(); if (qs.length < 10) return toast('题目还不够，先多学几课吧');
  TTS.stop();
  startSession({ mode: 'mock', title: '期末冲刺模拟卷', questions: qs, deadline: Date.now() + MOCK_MIN * 60000, res: [] });
  clearInterval(mockTimer);
  mockTimer = setInterval(function () {
    var s = session; if (!s || s.o.mode !== 'mock') { clearInterval(mockTimer); return; }
    var left = Math.max(0, Math.ceil((s.o.deadline - Date.now()) / 1000)), t = $('#mockt');
    if (t) { t.textContent = '⏱ ' + fmtTime(left); t.classList.toggle('low', left <= 120); }
    if (left <= 0) { clearInterval(mockTimer); TTS.stop(); toast('⏰ 时间到！', 1800); finishSession(); }
  }, 1000);
}
function mockRecord(q, ok, skipped) { var s = session; if (!s || !s.o.res) return; s.o.res.push({ c: q._cat || mockCat(q), ok: !!ok, sk: !!skipped }); }
function finishMock(s) {
  clearInterval(mockTimer); TTS.stop();
  var o = s.o, res = o.res, secs = Math.min(MOCK_MIN * 60, Math.round((Date.now() - s.t0) / 1000)), types = {};
  Object.keys(MOCK_CAT).forEach(function (c) { types[c] = [0, 0]; });
  o.questions.forEach(function (q, i) { var c = q._cat || mockCat(q), r = res[i]; types[c][1]++; if (r && r.ok) types[c][0]++; });
  var ok = res.filter(function (r) { return r.ok; }).length, total = o.questions.length, score = Math.round(ok * 100 / Math.max(1, total));
  var P0 = P(); P0.mocks = P0.mocks || []; P0.mocks.push({ t: Date.now(), score: score, ok: ok, n: total, secs: secs, types: types }); if (P0.mocks.length > 50) P0.mocks = P0.mocks.slice(-50);
  bump('mock'); var got = addXP(10 + Math.round(score / 10));
  var unanswered = total - res.length, wrong = total - ok - unanswered;
  var grade = score >= 90 ? ['优秀', 'cheer', '🏆'] : score >= 75 ? ['良好', 'happy', '🌟'] : score >= 60 ? ['合格', 'happy', '👍'] : ['继续加油', 'think', '💪'];
  if (score >= 60) { sfx.win(); confetti(score >= 90 ? 120 : 50); } else sfx.bad();
  var h = '<div class="lesson"><div class="inner"><div class="lbody result mockres">' +
    '<div class="resmas bounce">' + mascot(grade[1], 120) + '</div><h1 class="rtitle">期末冲刺 · 模拟卷</h1>' +
    '<div class="scorebig"><b>' + score + '</b><small>/ 100</small><span>' + grade[2] + ' ' + grade[0] + '</span></div>' +
    '<div class="mockbd">' + Object.keys(MOCK_CAT).filter(function (c) { return types[c][1]; }).map(function (c) { var t = types[c], pc = Math.round(t[0] * 100 / t[1]); return '<div class="mbrow"><span class="mbl">' + MOCK_CAT[c][0] + ' ' + MOCK_CAT[c][1] + '</span><div class="bar"><i style="width:' + pc + '%;background:' + (pc >= 80 ? 'var(--g)' : pc >= 60 ? 'var(--o)' : 'var(--r)') + '"></i></div><b>' + t[0] + '/' + t[1] + '</b></div>'; }).join('') + '</div>' +
    '<div class="rstats"><div class="rstat y"><small>经验 XP</small><b>⚡ ' + got + '</b></div><div class="rstat g"><small>答对</small><b>✅ ' + ok + '</b></div><div class="rstat b"><small>用时</small><b>⏱ ' + fmtTime(secs) + '</b></div></div>' +
    (wrong ? '<p class="sub">答错的 ' + wrong + ' 道题已收进错题本 🔁</p>' : '') + (unanswered ? '<p class="sub">还有 ' + unanswered + ' 道题没来得及做或跳过了</p>' : '') + '</div>' +
    '<div class="lfoot"><div class="fbtns"><button class="btn ghost" id="again">再考一次</button><button class="btn" id="cont">CONTINUE · 继续</button></div></div></div></div>';
  $('#overlay').innerHTML = h;
  $('#cont').onclick = function () { closeLesson(true); location.hash = '#/mock'; render(); setTimeout(Eye.maybe, 400); };
  $('#again').onclick = function () { session = null; startMock(); };
  session = null; save(); checkAch(); Cloud.markDirty();
}
function viewMock() {
  var ms = (P().mocks || []).slice().reverse(), best = ms.reduce(function (a, m) { return Math.max(a, m.score); }, 0);
  var h = '<div class="page"><div class="row">' + backBtn('#/practice') + '<h1 class="h grow" style="margin:0">🏁 期末冲刺</h1></div>' +
    '<div class="card mockintro">' + bubble('模拟一次期末考试！<br><b>' + MOCK_N + ' 道题 · ' + MOCK_MIN + ' 分钟</b>，覆盖全册各单元。', 'cheer', 80) +
    '<ul class="mocklist">' + Object.keys(MOCK_CAT).map(function (c) { return '<li>' + MOCK_CAT[c][0] + ' ' + MOCK_CAT[c][1] + ' <b>' + MOCK_QUOTA[c] + ' 题</b></li>'; }).join('') + '</ul>' +
    '<p class="sub small">不扣爱心 · 做题时不显示对错，交卷后出分（满分 100）· 错题自动进错题本' + (listenOff() ? '<br>⚠️ 你暂时关闭了听力题，本次没有听力部分' : '') + '</p>' +
    '<button class="btn block" id="mockgo">开始模拟考试</button></div>';
  h += '<h3 class="sech">成绩记录' + (ms.length ? ' · 最高 ' + best + ' 分' : '') + '</h3>';
  if (!ms.length) h += '<div class="empty">' + mascot('think', 90) + '<p>还没有考过，试一次吧！</p></div>';
  else {
    h += '<div class="card"><div class="mockchart">' + ms.slice(0, 10).reverse().map(function (m) { return '<div class="mcol"><b>' + m.score + '</b><i style="height:' + Math.max(4, m.score) + '%"></i><small>' + new Date(m.t).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) + '</small></div>'; }).join('') + '</div></div>';
    ms.slice(0, 20).forEach(function (m) { h += '<div class="card mockh"><b class="ms">' + m.score + '分</b><div class="grow"><div>' + new Date(m.t).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' · 用时 ' + fmtTime(m.secs || 0) + '</div><div class="sub small">' + Object.keys(m.types || {}).filter(function (c) { return m.types[c][1]; }).map(function (c) { return MOCK_CAT[c][1] + ' ' + m.types[c][0] + '/' + m.types[c][1]; }).join(' · ') + '</div></div></div>'; });
  }
  V.innerHTML = h + '</div>'; bindBack();
  $('#mockgo').onclick = startMock;
}

/* ---------- 单词听写 dictation ---------- */
function dictPool(src) {
  if (src === 'wrong') { var DW = P().dictWrong || {}; var out = []; Object.keys(DW).forEach(function (k) { var w = WORDS.filter(function (x) { return x.w.toLowerCase() === k; })[0]; if (w) out.push(w); }); topMissed(60, 40).forEach(function (x) { var w = WORDS.filter(function (y) { return y.w.toLowerCase() === x[0]; })[0]; if (w && out.indexOf(w) < 0) out.push(w); }); return out; }
  var u = UNITS.filter(function (x) { return x.id === src; })[0]; if (!u) return [];
  return u.words.filter(function (w) { return !w.proper && w.w.split(/\s+/).length <= 3 && /^[A-Za-z]/.test(w.w); });
}
function startDictation(src) {
  var pool = dictPool(src); if (!pool.length) return toast(src === 'wrong' ? '还没有错词，太棒了！' : '这个单元没有可听写的单词');
  var req = pool.filter(function (w) { return w.req; }), pick10 = shuffle(req.length >= 6 ? req : pool).slice(0, 10);
  if (pick10.length < 10) pick10 = pick10.concat(shuffle(pool.filter(function (w) { return pick10.indexOf(w) < 0; })).slice(0, 10 - pick10.length));
  var qs = pick10.map(function (w) { return { t: 'dict', say: w.w, a: w.w, zh: w.zh, exp: w.w + ' ' + (w.ph || '') + '：' + w.zh, _src: '单词听写' }; });
  startSession({ mode: 'dict', title: '单词听写', questions: qs, src: src });
}
function viewDict() {
  var DW = P().dictWrong || {}, nw = dictPool('wrong').length;
  var h = '<div class="page"><div class="row">' + backBtn('#/practice') + '<h1 class="h grow" style="margin:0">🎧 单词听写</h1></div>' +
    bubble('听皮皮读单词，用键盘拼出来！大小写和空格不用担心。', 'happy', 70) +
    '<div class="card form"><label class="chk switch"><input type="checkbox" id="dzhs"' + (S.settings.dictZh !== false ? ' checked' : '') + '><span class="sw"></span> 显示中文意思提示</label>' +
    '<div class="sub small">关掉后，做题时也可以点「💡 看中文提示」。</div></div>' +
    hubCard('🔁', '听写错词' + (nw ? ' <span class="badge red">' + nw + '</span>' : ''), nw ? '听写或练习中写错 / 答错的单词' : '还没有错词', 'data-dict="wrong"', 'big') +
    '<h3 class="sech">选择单元</h3><div class="ugrid">' + UNITS.filter(function (u) { return dictPool(u.id).length; }).map(function (u) { return '<button class="ucard" style="--uc:' + (u.color || '#58cc02') + '" data-dict="' + u.id + '"><b>' + (u.emoji || '🔤') + ' ' + (u.no ? 'U' + u.no : esc(u.zh || '')) + '</b><small>' + esc(u.title) + '</small><span>' + dictPool(u.id).length + ' 词 · 听写 ›</span></button>'; }).join('') + '</div></div>';
  V.innerHTML = h; bindBack();
  $('#dzhs').onchange = function () { S.settings.dictZh = this.checked; save(); };
  $$('[data-dict]', V).forEach(function (b) { b.onclick = function () { startDictation(b.getAttribute('data-dict')); }; });
}

/* ---------- 这周学到哪 (focus unit) ---------- */
function focusUnit() { var id = P().focus; return id ? UNITS.filter(function (u) { return u.id === id; })[0] || null : null; }
function focusNext(u) { for (var i = 0; i < u.lessons.length; i++) if (!lessonComplete(u.lessons[i].id)) return u.lessons[i]; return null; }
function focusPicker() {
  var cur = P().focus;
  modal('<h2>📍 这周学到哪？</h2><p class="sub">选课堂上这周在学的单元，首页会帮你定位，还能直接开始这个单元的下一课。</p><div class="fpick">' +
    UNITS.filter(function (u) { return u.lessons.length; }).map(function (u) { return '<button class="fopt' + (u.id === cur ? ' on' : '') + '" data-f="' + u.id + '" style="--uc:' + (u.color || '#58cc02') + '"><b>' + (u.emoji || '') + ' ' + esc(u.isExtra ? u.zh : u.isRevision ? 'Revision' : 'Unit ' + u.no) + '</b><small>' + esc(u.title) + '</small></button>'; }).join('') +
    '</div>' + (cur ? '<button class="btn block ghost" id="fclr" style="margin-top:10px">不设置（按顺序学）</button>' : '') + '<button class="btn block ghost" data-close style="margin-top:10px">取消</button>', function (m, close) {
      $('[data-close]', m).onclick = close;
      $$('[data-f]', m).forEach(function (b) { b.onclick = function () { P().focus = b.getAttribute('data-f'); save(); close(); sfx.good(); render(); setTimeout(scrollToCurrent, 150); }; });
      var c = $('#fclr', m); if (c) c.onclick = function () { P().focus = ''; save(); close(); render(); };
    });
}
function focusCardHtml() {
  var u = focusUnit();
  if (!u) return '<button class="focusset" id="focusset">📍 这周学到哪？<small>选课堂进度，一键直达</small><span class="chev">›</span></button>';
  var nx = focusNext(u), dn = u.lessons.filter(function (l) { return lessonComplete(l.id); }).length, pc = Math.round(dn * 100 / u.lessons.length);
  return '<div class="focuscard" style="--uc:' + (u.color || '#58cc02') + '"><div class="fctop"><span class="fctag">⭐ 本周重点</span><button class="lnkbtn" id="focusset">更换</button></div>' +
    '<div class="fcrow"><span class="fce">' + (u.emoji || '📘') + '</span><div class="grow"><b>' + esc(unitLabel(u)) + '</b><div>' + esc(u.title) + ' · ' + esc(u.zh) + '</div>' +
    '<div class="pbar"><i style="width:' + pc + '%"></i><span>' + dn + '/' + u.lessons.length + '</span></div></div></div>' +
    (nx ? '<button class="btn block white" id="focusgo">▶ 下一课：' + esc(nx.title) + '</button>' : '<button class="btn block white" id="focusgo">🏆 本单元学完了！去挑战奖杯</button>') + '</div>';
}
function bindFocusCard() {
  var fs = $('#focusset'); if (fs) fs.onclick = function (e) { e.stopPropagation(); focusPicker(); };
  var fg = $('#focusgo'); if (fg) fg.onclick = function () { var u = focusUnit(); if (!u) return; var nx = focusNext(u); if (nx) startLesson(nx); else startChallenge(u.id); };
}

/* ---------- 每周学习报告 (parent center) ---------- */
function weeklyReportHtml() {
  var mins = 0, xp = 0, les = 0, ans = 0, cor = 0, active = 0, days = [], mx = 5;
  for (var i = 6; i >= 0; i--) { var d = dayOffset(-i), dd = S.days[d] || {}; var m = Math.round((dd.sec || 0) / 60); mins += m; xp += dd.xp || 0; les += dd.lessons || 0; if (dd.ans) { ans += dd.ans; cor += Math.min(dd.correct || 0, dd.ans); } if (m > 0 || dd.xp > 0) active++; days.push([d, m, dd.xp || 0]); mx = Math.max(mx, m); }
  var acc = ans ? Math.round(cor * 100 / ans) : null, cut = Date.now() - 7 * 864e5, mocks = [];
  for (var b in (S.books || {})) ((S.books[b] || {}).mocks || []).forEach(function (m) { if (m.t >= cut) mocks.push([b, m]); });
  mocks.sort(function (a, c) { return a[1].t - c[1].t; });
  var top = topMissed(7, 10), wk = ['日', '一', '二', '三', '四', '五', '六'];
  var h = '<div class="card report" id="wreport"><div class="rphead">' + mascot('happy', 56) + '<div class="grow"><h3>📊 每周学习报告</h3><div class="sub small">' + esc(S.name || '小小学习者') + ' · ' + dayOffset(-6).slice(5).replace('-', '/') + ' – ' + today().slice(5).replace('-', '/') + '</div></div></div>' +
    '<div class="rpgrid"><div><b>' + mins + '</b><small>学习分钟</small></div><div><b>' + xp + '</b><small>获得经验</small></div><div><b>' + les + '</b><small>完成小课</small></div><div><b>' + (acc == null ? '—' : acc + '%') + '</b><small>答题正确率</small></div></div>' +
    '<div class="rpbars">' + days.map(function (x, j) { return '<div class="col' + (j === 6 ? ' today' : '') + '"><b>' + x[1] + '</b><i style="height:' + Math.round(x[1] * 100 / mx) + '%"></i><small>' + (j === 6 ? '今天' : '周' + wk[new Date(x[0] + 'T00:00:00').getDay()]) + '</small></div>'; }).join('') + '</div>' +
    '<div class="sub small center">学习了 ' + active + ' 天 · 柱子为每天学习分钟（只统计正在操作的时间）</div>' +
    '<h4>🔤 最常错的单词</h4>' + (top.length ? '<div class="rpwords">' + top.map(function (x, i) { return '<span><i>' + (i + 1) + '</i><b>' + esc(x[0]) + '</b><small>' + esc(wordZh(x[0])) + ' ×' + x[1] + '</small></span>'; }).join('') + '</div>' : '<p class="sub small">这周没有错词记录 👍</p>') +
    '<h4>🏁 期末冲刺成绩</h4>' + (mocks.length ? '<div class="rpmocks">' + mocks.map(function (x) { return '<span><b>' + x[1].score + '</b><small>' + (x[0] === 'g6down' ? '六下' : '六上') + ' ' + new Date(x[1].t).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) + '</small></span>'; }).join('') + '</div>' : '<p class="sub small">这周还没做模拟卷</p>') +
    '<div class="rpfoot">pip english · 皮皮英语 · ' + today() + '</div></div>' +
    '<button class="btn block ghost noprint" id="rprint">🖨️ 打印 / 保存报告</button>';
  return h;
}

/* ---------- 老师看板 teacher board  (#/teacher) ---------- */
var Teacher = { cls: '', tpin: '', data: null, err: '', loading: false };
try { var _t = JSON.parse(sessionStorage.getItem('e6.teacher') || 'null'); if (_t) { Teacher.cls = _t.cls; Teacher.tpin = _t.tpin; } } catch (e) { }
function teacherLoad(btn) {
  Teacher.loading = true; Teacher.err = ''; if (btn) { btn.disabled = true; btn.textContent = '读取中…'; }
  return Cloud.api('/api/teacher', { cls: Teacher.cls, tpin: Teacher.tpin }).then(function (r) {
    Teacher.loading = false;
    if (r && r.ok) { Teacher.data = r; Teacher.cls = r.cls; try { sessionStorage.setItem('e6.teacher', JSON.stringify({ cls: Teacher.cls, tpin: Teacher.tpin })); } catch (e) { } if (r.created) toast('✅ 已为班级 ' + r.cls + ' 设置教师 PIN，请牢记', 3500); }
    else { Teacher.data = null; Teacher.err = (r && r.msg) || '读取失败'; }
    if ((location.hash || '').indexOf('#/teacher') === 0) viewTeacher();
  }, function () { Teacher.loading = false; Teacher.err = '云端暂时连不上，请稍后再试'; if ((location.hash || '').indexOf('#/teacher') === 0) viewTeacher(); });
}
function viewTeacher() {
  var h = '<div class="page teacher"><div class="row">' + backBtn('#/parent') + '<h1 class="h grow" style="margin:0">🧑‍🏫 老师看板</h1></div>';
  var D0 = Teacher.data;
  if (!D0) {
    h += '<div class="card form">' + bubble('老师您好！输入班级码和教师 PIN，就能看到全班这周的学习情况。', 'happy', 64) +
      '<label>班级码</label><input id="tcls" maxlength="20" value="' + esc(Teacher.cls || (Cloud.acct && Cloud.acct.cls) || '') + '" placeholder="和学生填的一样">' +
      '<label>教师 PIN（4–8 位数字）</label><input id="tpin" type="password" inputmode="numeric" maxlength="8" placeholder="••••••">' +
      '<p class="sub small">第一次进入时，输入的 PIN 会成为这个班的教师 PIN（服务器只保存加密后的值）。之后需要同一个 PIN 才能查看。</p>' +
      (Teacher.err ? '<p class="errt">' + esc(Teacher.err) + '</p>' : '') + '<button class="btn block blue" id="tgo">进入看板</button></div></div>';
    V.innerHTML = h; bindBack();
    var tp = $('#tpin'); tp.oninput = function () { tp.value = tp.value.replace(/\D/g, '').slice(0, 8); };
    $('#tgo').onclick = function () { var c = $('#tcls').value.trim(), p = tp.value.trim(); if (Array.from(c).length < 2) return toast('班级码至少 2 个字'); if (!/^\d{4,8}$/.test(p)) return toast('教师 PIN 需要 4–8 位数字'); Teacher.cls = c; Teacher.tpin = p; teacherLoad($('#tgo')); };
    return;
  }
  var ms = D0.members || [], wkn = +(String(D0.week).split('W')[1] || 0), act = ms.filter(function (m) { return m.da > 0; }).length, sum = ms.reduce(function (a, m) { return a + m.wxp; }, 0);
  h += '<div class="row" style="margin:6px 0"><div class="sub grow">班级 <b>' + esc(D0.cls) + '</b> · 第 ' + wkn + ' 周<br><small>北京时间每周一 00:00 清零</small></div><button class="ibtn sm" id="trf" title="刷新">🔄</button><button class="btn sm ghost" id="tout">退出</button></div>' +
    '<div class="rpgrid"><div><b>' + ms.length + '</b><small>班级人数</small></div><div><b>' + act + '</b><small>本周学习人数</small></div><div><b>' + sum + '</b><small>全班本周 XP</small></div><div><b>' + (D0.reports || []).length + '</b><small>题目报错</small></div></div>' +
    '<h3 class="sech">👧 学生本周情况</h3><div class="card tbl"><table class="irr"><tr><th>昵称</th><th>本周XP</th><th>活跃天</th><th>最近学习</th></tr>' +
    (ms.length ? ms.map(function (m) { return '<tr><td><b>' + esc(m.nick) + '</b></td><td>' + m.wxp + '</td><td>' + m.da + '/7</td><td class="sub">' + (m.la ? fmtAgo(m.la) : '—') + '</td></tr>'; }).join('') : '<tr><td colspan="4" class="sub">还没有学生加入这个班级码</td></tr>') + '</table></div>' +
    '<h3 class="sech">🔤 全班最常错的单词</h3><div class="card">' + ((D0.words || []).length ? '<div class="rpwords">' + D0.words.slice(0, 15).map(function (x, i) { return '<span><i>' + (i + 1) + '</i><b>' + esc(x.w) + '</b><small>' + esc(wordZh(x.w)) + ' ×' + x.n + '</small></span>'; }).join('') + '</div>' : '<p class="sub">学生同步进度后，这里会出现汇总（匿名统计）。</p>') + '</div>' +
    '<h3 class="sech">❓ 全班最常错的题</h3><div class="card">' + ((D0.qs || []).length ? D0.qs.slice(0, 12).map(function (q) { return '<div class="tq"><span class="pill">' + q.kids + ' 人错 · ' + q.n + ' 次</span> ' + esc(q.text || q.k) + '</div>'; }).join('') : '<p class="sub">暂无数据</p>') + '</div>' +
    '<h3 class="sech">🚩 题目报错</h3><div class="card">' + reportListHtml(D0.reports || [], { del: true }) + '</div>' +
    '<p class="note center">统计只包含昵称和匿名的错题汇总，不含真实姓名。</p></div>';
  V.innerHTML = h; bindBack();
  $('#trf').onclick = function () { teacherLoad(); };
  $('#tout').onclick = function () { Teacher.data = null; Teacher.tpin = ''; try { sessionStorage.removeItem('e6.teacher'); } catch (e) { } viewTeacher(); };
  $$('[data-del]', V).forEach(function (b) { b.onclick = function () { var k = b.getAttribute('data-del'); b.disabled = true; Cloud.api('/api/teacher/delreport', { cls: Teacher.cls, tpin: Teacher.tpin, key: k }).then(function (r) { if (r && r.ok) { Teacher.data.reports = Teacher.data.reports.filter(function (x) { return x.key !== k; }); viewTeacher(); toast('已删除'); } else toast((r && r.msg) || '删除失败'); }, function () { Cloud.note(); }); }; });
}

/* ---------- 护眼提醒 eye-care ---------- */
var Eye = {
  sec: 0, due: false, open: false,
  tick: function (dt, active, idleFor) {
    var n = +(S.settings.eye == null ? 20 : S.settings.eye);
    if (idleFor > 5 * 60000) this.sec = 0;            // a real break resets the counter
    if (!n) { this.due = false; return; }
    if (active) this.sec += dt;
    if (this.sec >= n * 60) this.due = true;
    if (this.due && !session && !$('#overlay').children.length && !$('.modal')) this.show();
  },
  maybe: function () { if (Eye.due && !session && !$('.modal')) Eye.show(); },
  show: function () {
    if (this.open) return; this.open = true; this.due = false; TTS.stop();
    var left = 20, n = +(S.settings.eye || 20);
    modal('<div class="eyebox">' + mascot('happy', 110) + '<h2>休息一下眼睛吧 👀</h2><p class="sub">已经认真学了 ' + n + ' 分钟啦！<br>看看窗外远处的绿树或天空，眨眨眼睛～</p><div class="eyering"><b id="eyen">20</b><small>秒</small></div><button class="btn block" id="eyeok" disabled>还剩 20 秒…</button></div>', function (m, close) {
      var t = setInterval(function () {
        left--; var e = $('#eyen', m), b = $('#eyeok', m); if (!e) { clearInterval(t); return; }
        e.textContent = Math.max(0, left);
        if (left <= 0) { clearInterval(t); sfx.good(); b.disabled = false; b.textContent = '眼睛休息好了，继续学习！'; m.querySelector('.eyering').classList.add('done'); } else b.textContent = '还剩 ' + left + ' 秒…';
      }, 1000);
      $('#eyeok', m).onclick = function () { if (left > 0) return; Eye.sec = 0; Eye.open = false; close(); };
    }, 'sticky eye');
  }
};

/* ---------- WeChat in-app browser ---------- */
function wxGuideModal() {
  modal('<div class="wxarrow">↗</div><h2>请在浏览器中打开</h2><p class="sub">微信里不能使用<b>口语练习</b>和<b>添加到主屏幕</b>。</p><ol class="wxsteps"><li>点右上角 <span class="kbd">···</span></li><li>选择 <b>「在浏览器打开」</b>（iPhone 选「在 Safari 中打开」）</li><li>在浏览器里就能添加到主屏幕啦</li></ol><button class="btn block" data-close>知道了</button>', function (m, close) { $('[data-close]', m).onclick = close; }, 'wxguide');
}
function wxBanner() {
  if (!isWX) return; try { if (localStorage.getItem('e6.wxb')) return; } catch (e) { }
  var b = document.createElement('div'); b.className = 'wxbanner';
  b.innerHTML = '<span>💡 在微信里口语题用不了。点右上角 <b>···</b> 选择<b>「在浏览器打开」</b>，体验更好</span><button aria-label="关闭">✕</button>';
  document.body.insertBefore(b, document.body.firstChild); document.body.classList.add('haswxb');
  $('button', b).onclick = function () { try { localStorage.setItem('e6.wxb', '1'); } catch (e) { } b.remove(); document.body.classList.remove('haswxb'); if (window.fitChat) fitChat(); };
}

/* ---------- active-time tracking (for report minutes + eye care) ---------- */
var lastAct = Date.now();
['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach(function (ev) { document.addEventListener(ev, function () { lastAct = Date.now(); }, { passive: true, capture: true }); });
function isActiveNow() { return Date.now() - lastAct < 75000 || (session && Date.now() - lastAct < 150000); }

/* ================= router & boot ================= */
function render() {
  if (!B) return;
  TTS.stop(); closePop(); renderNav(); renderRight(); renderTop(); if (window.MicRec) MicRec.cancel(); SP = null; VT++;
  var r = (location.hash || '#/').slice(1).split('/').filter(Boolean);
  if (!session && r[0] !== 'lesson') $('#overlay').innerHTML = '';
  document.body.classList.toggle('onlearn', !r[0]); document.body.classList.toggle('onchat', r[0] === 'chat' && !!r[1]);
  window.scrollTo(0, 0);
  switch (r[0]) {
    case undefined: viewHome(); break;
    case 'practice': viewPractice(); break;
    case 'league': viewLeague(r[1]); break;
    case 'quests': viewQuests(); break;
    case 'shop': viewShop(); break;
    case 'me': viewMe(); break;
    case 'parent': viewParent(); break;
    case 'read': readerList(r[1], 'read'); break;
    case 'stories': readerList(r[1], 'stories'); break;
    case 'p': if (PASSAGES[r[1]]) viewReader(PASSAGES[r[1]], false); else viewHome(); break;
    case 's': if (STORIES[r[1]]) viewReader(STORIES[r[1]], true); else viewHome(); break;
    case 'words': viewWords(r[1], r[2]); break;
    case 'review': viewReview(); break;
    case 'mock': viewMock(); break;
    case 'dict': viewDict(); break;
    case 'teacher': viewTeacher(); break;
    case 'scenes': if (!SCN) loadScenes().then(function () { if (location.hash.indexOf('#/scenes') === 0) render(); }); viewScenes(); break;
    case 'scene': viewScene(r[1], r[2]); break;
    case 'chat': viewChat(r[1]); break;
    case 'lesson': viewHome(); if (LESSONS[r[1]]) viewLessonIntro(LESSONS[r[1]]); break;
    case 'challenge': viewHome(); if (UNITS.some(function (u) { return u.id === r[1]; }) && trophyUnlocked(UNITS.filter(function (u) { return u.id === r[1]; })[0])) startChallenge(r[1]); break;
    default: viewHome();
  }
  bindHrefs(V); bindHrefs($('#rpanel'));
  $$('#rpanel a.lnk').forEach(function () { });
  if (!r[0]) { var lr = S.league.result; if (lr && !lr.seen) setTimeout(showLeagueResult, 600); }
  checkLimit();
}
function bindHrefs(root) {
  if (!root) return;
  $$('[data-href]', root).forEach(function (el) { el.onclick = function () { location.hash = el.getAttribute('data-href'); }; });
  $$('[data-act="wordp"]', root).forEach(function (el) { el.onclick = function () { startWordPractice(el.getAttribute('data-u')); }; });
}
window.addEventListener('hashchange', function () { if (session) closeLesson(true); render(); });
document.addEventListener('visibilitychange', function () { lastTick = Date.now(); });
window.addEventListener('resize', function () { closePop(); });

function boot() {
  applyTheme();
  V.innerHTML = '<div class="loading">' + mascot('happy', 120) + '<p>正在打开课本…</p></div>';
  loadManifest().then(function () {
    var entry = bookEntry(S.course) || bookEntry('book') || BOOKS[0] || DEFAULT_MANIFEST.books[0];
    return loadBook(entry).catch(function (e) { if (entry.id !== 'book') { S.course = 'book'; save(); return loadBook(bookEntry('book') || DEFAULT_MANIFEST.books[0]); } throw e; }).then(function (book) {
      if (!bookEntry(S.course)) BOOKS.unshift(entry);
      initBook(book);
    });
  }).then(function () {
    applyFreezes(); regen(); leagueRollover(); P(); save(); checkAch(true); TTS.loadAudio(); loadScenes().then(function () { var h = location.hash || '#/'; if (h === '#/' || h === '#' || /^#\/(scene|chat|practice)/.test(h)) { if (!session && !$('.modal') && !(SP && SP.playing)) render(); } }); wxBanner(); setTimeout(function () { Reports.flush(); }, 2500);
    render();
    if (!S.goal) onboarding(); else setTimeout(scrollToCurrent, 300);
    if (Cloud.acct && Cloud.acct.dirty) Cloud.schedule();
  }).catch(function (e) {
    V.innerHTML = '<div class="loading">' + mascot('sad', 120) + '<p>课本数据加载失败，请刷新重试。</p><p class="sub">' + esc(String(e)) + '</p></div>';
  });
}
/* ================= v3.4: 情景小剧场 (scene player · 跟读 · 角色扮演) + AI 对话 with Pip + 讲讲我错在哪 ================= */
var SCN = null, SCN_IDX = {}, VT = 0; /* VT: bumped on every route render so stale async callbacks stop */
function loadScenes() { return fetchJSON('data/scenes.json?v=' + APP_V).then(function (d) { SCN = d; SCN_IDX = {}; (d.scenes || []).forEach(function (s) { SCN_IDX[s.id] = s; }); }).catch(function () { SCN = { scenes: [], chars: {} }; }); }
function sceneOfUnit(u) { return u && SCN ? SCN_IDX[S.course + '-' + u.id] || null : null; }
function sceneSt(id, w) { var b = P(); if (!b.scenes) b.scenes = {}; if (!w) return b.scenes[id] || {}; return b.scenes[id] = b.scenes[id] || {}; }
function sceneBookOk(sc) { return sc && sc.book === S.course; }
function charOf(who) { return (SCN && SCN.chars && SCN.chars[who]) || { zh: who, color: '#777' }; }
function avatarOf(who, size) {
  size = size || 40;
  if (who === 'Pip') return '<span class="scav pipav" style="width:' + size + 'px;height:' + size + 'px">' + mascot('happy', size, '') + '</span>';
  var c = charOf(who);
  return '<span class="scav" style="width:' + size + 'px;height:' + size + 'px;background:' + c.color + ';font-size:' + Math.round(size * .45) + 'px">' + esc(who.charAt(0)) + '</span>';
}
function sceneStars(id) { var st = sceneSt(id); return (st.watched ? 1 : 0) + (st.rep ? 1 : 0) + (st.role ? 1 : 0); }
function sceneCardHtml(sc) {
  var st = sceneSt(sc.id), n = sceneStars(sc.id);
  return '<button class="sccard" data-href="#/scene/' + sc.id + '"><span class="scthumb" style="background-image:url(' + sc.imgs[0] + ')"></span><span class="grow"><b>' + esc(sc.emoji + ' ' + sc.title) + '</b><small>' + esc(sc.zh) + ' · ' + sc.lines.length + ' 句</small><span class="scprog">' + ['🎬 看', '🎤 跟读', '🎭 表演'].map(function (t, i) { var on = i === 0 ? st.watched : i === 1 ? st.rep : st.role; return '<i class="' + (on ? 'on' : '') + '">' + t + '</i>'; }).join('') + '</span></span><span class="chev">›</span></button>';
}
function sceneReward(id, kind, xp, gems) {
  var st = sceneSt(id, true), first = !st[kind];
  var got = addXP(first ? xp : Math.max(2, Math.round(xp / 4)));
  if (first && gems) S.gems += gems;
  D().scenes = (D().scenes || 0) + 1; S.stats.scenes = (S.stats.scenes || 0) + 1;
  save(); renderChrome(); Cloud.markDirty();
  return { xp: got, gems: first ? gems : 0, first: first };
}

/* ---------- scene list ---------- */
function viewScenes() {
  var mine = (SCN && SCN.scenes || []).filter(sceneBookOk), other = (SCN && SCN.scenes || []).filter(function (s) { return !sceneBookOk(s); });
  var h = '<div class="page"><div class="row">' + backBtn('#/practice') + '<h1 class="h grow" style="margin:0">🎬 情景小剧场</h1></div>' +
    '<div class="sub">每个单元一个小动画：先看，再跟读、角色扮演，最后和皮皮自由聊天。用的都是本单元的单词和句型。</div>';
  if (!mine.length && !other.length) h += '<div class="empty">' + mascot('think', 100) + '<p>小剧场正在加载…</p></div>';
  mine.forEach(function (s) { h += sceneCardHtml(s); });
  if (other.length) h += '<h3 class="sech">' + (S.course === 'book' ? '六年级下册' : '六年级上册') + '</h3>' + other.map(sceneCardHtml).join('');
  h += '<button class="hub" data-href="#/chat"><span class="hi">🤖</span><span class="grow"><b>和皮皮聊天</b><small>AI 英语对话：说英语，皮皮会回答你</small></span><span class="chev">›</span></button></div>';
  V.innerHTML = h; bindBack();
}

/* ---------- scene player (animated short) ---------- */
var SP = null;
function viewScene(id, step) {
  var sc = SCN_IDX[id]; if (!sc) { if (!SCN) { loadScenes().then(render); V.innerHTML = '<div class="loading">' + mascot('happy', 100) + '<p>正在打开小剧场…</p></div>'; return; } location.hash = '#/scenes'; return; }
  if (step === 'rep') return viewSceneRepeat(sc);
  if (step === 'role') return viewSceneRole(sc);
  var zhOn = S.settings.sceneZh !== false;
  var h = '<div class="page scpage"><div class="row">' + backBtn('#/scenes') + '<div class="grow"><b class="sctitle">' + esc(sc.emoji + ' ' + sc.title) + '</b><div class="sub">' + esc(sc.zh) + '</div></div><button class="ibtn' + (zhOn ? ' on' : '') + '" id="sczh" title="中文字幕">中</button></div>' +
    '<div class="stage" id="stage"><div class="kb a"><img alt=""></div><div class="kb b"><img alt=""></div><div class="scbig" id="scbig">▶</div></div>' +
    '<div class="scbubble" id="scb"></div>' +
    '<div class="scctl"><button class="ibtn" id="scprev" aria-label="上一句">⏮</button><button class="btn blue scplay" id="scplay">▶ 播放</button><button class="ibtn" id="screp" aria-label="重播这句">🔁</button><button class="ibtn" id="scnext" aria-label="下一句">⏭</button></div>' +
    '<div class="scdots" id="scdots">' + sc.lines.map(function (_, i) { return '<i data-i="' + i + '"></i>'; }).join('') + '</div>' +
    '<div class="scsteps" id="scsteps">' + sceneStepsHtml(sc) + '</div></div>';
  V.innerHTML = h; bindBack(); bindHrefs(V);
  SP = { sc: sc, i: 0, playing: false, pid: 0, shot: -1, layer: 0, ended: false };
  sceneShow(0, false);
  $('#sczh').onclick = function () { S.settings.sceneZh = !(S.settings.sceneZh !== false); save(); this.classList.toggle('on', S.settings.sceneZh); var z = $('.sczh', V); if (z) z.classList.toggle('hidden', !S.settings.sceneZh); };
  $('#scplay').onclick = function () { if (SP.playing) scenePause(); else scenePlay(SP.ended ? 0 : SP.i); };
  $('#scbig').onclick = function () { scenePlay(SP.ended ? 0 : SP.i); };
  $('#screp').onclick = function () { scenePlay(SP.i, true); };
  $('#scprev').onclick = function () { var wasP = SP.playing; scenePause(); sceneShow(Math.max(0, SP.i - 1)); if (wasP) scenePlay(SP.i); };
  $('#scnext').onclick = function () { var wasP = SP.playing; scenePause(); if (SP.i < sc.lines.length - 1) { sceneShow(SP.i + 1); if (wasP) scenePlay(SP.i); } else sceneEnd(); };
  $$('#scdots i').forEach(function (d) { d.onclick = function () { scenePause(); sceneShow(+d.getAttribute('data-i')); }; });
  bindSceneSteps(sc);
  // preload all images of this scene
  sc.imgs.forEach(function (u) { var im = new Image(); im.src = u; });
}
function sceneStepsHtml(sc) {
  var st = sceneSt(sc.id);
  return '<h3 class="sech" style="margin-top:18px">看完了？来演一演 👇</h3>' +
    hubCard('🎤', '① 跟读' + (st.rep ? ' <span class="pill lv">✔ ' + st.rep + ' 分</span>' : ''), '一句一句跟着读，' + (aiOn() ? 'AI 听你读并打分' : '自己听录音对比'), 'data-step="rep"') +
    hubCard('🎭', '② 角色扮演' + (st.role ? ' <span class="pill lv">✔</span>' : ''), '选一个角色，你来说 TA 的台词', 'data-step="role"') +
    hubCard('🤖', '③ 自由对话', '和皮皮用英语聊聊这个话题（AI）', 'data-href="#/chat/' + sc.id + '"');
}
function bindSceneSteps(sc) { $$('[data-step]', V).forEach(function (b) { b.onclick = function () { TTS.stop(); location.hash = '#/scene/' + sc.id + '/' + b.getAttribute('data-step'); }; }); bindHrefs($('#scsteps')); }
function sceneShow(i, anim) {
  var sc = SP.sc, l = sc.lines[i]; SP.i = i; SP.ended = false;
  var shot = Math.min(sc.imgs.length - 1, l.shot || 0);
  if (shot !== SP.shot) {
    var st = $('#stage'); if (!st) return;
    SP.layer = 1 - SP.layer; var lay = $$('.kb', st)[SP.layer], other = $$('.kb', st)[1 - SP.layer];
    var img = $('img', lay); img.src = sc.imgs[shot];
    lay.className = 'kb ' + (SP.layer ? 'b' : 'a') + ' on m' + (shot % 4); other.classList.remove('on');
    SP.shot = shot;
    var nx = sc.imgs[shot + 1]; if (nx) { var pre = new Image(); pre.src = nx; }
  }
  var c = charOf(l.who), zhOn = S.settings.sceneZh !== false;
  var b = $('#scb'); if (!b) return;
  b.innerHTML = '<div class="scwho">' + avatarOf(l.who, 36) + '<b style="color:' + c.color + '">' + esc(l.who) + ' <small>' + esc(c.zh) + '</small></b><button class="ibtn sm" id="scsay">🔊</button></div><div class="scen">' + esc(l.en) + '</div><div class="sczh' + (zhOn ? '' : ' hidden') + '">' + esc(l.zh) + '</div>';
  if (anim !== false) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
  $('#scsay').onclick = function () { scenePlay(SP.i, true); };
  $$('#scdots i').forEach(function (d, k) { d.className = k < i ? 'done' : k === i ? 'cur' : ''; });
}
function playLine(sc, l) {
  return new Promise(function (res) {
    if (l.audio) TTS.playClip(l.audio, l.en, undefined, 'en-US', res); else TTS.say(l.en, 'en-US').then(res);
  });
}
function scenePlay(i, single) {
  if (!SP) return; TTS.stop(); var my = ++SP.pid; SP.playing = !single;
  var big = $('#scbig'); if (big) big.classList.add('hidden');
  $('#scplay').textContent = single ? '▶ 播放' : '⏸ 暂停'; $('#stage').classList.add('playing');
  sceneShow(i);
  playLine(SP.sc, SP.sc.lines[i]).then(function () {
    if (!SP || my !== SP.pid) return;
    if (single) { SP.playing = false; return; }
    setTimeout(function () {
      if (!SP || my !== SP.pid || !SP.playing) return;
      if (SP.i < SP.sc.lines.length - 1) scenePlay(SP.i + 1); else sceneEnd();
    }, 650);
  });
}
function scenePause() { if (!SP) return; SP.pid++; SP.playing = false; TTS.stop(); var p = $('#scplay'); if (p) p.textContent = '▶ 播放'; var st = $('#stage'); if (st) st.classList.remove('playing'); }
function sceneEnd() {
  scenePause(); SP.ended = true; $$('#scdots i').forEach(function (d) { d.className = 'done'; });
  var big = $('#scbig'); if (big) { big.textContent = '↺'; big.classList.remove('hidden'); }
  $('#scplay').textContent = '↺ 再看一遍';
  var st = sceneSt(SP.sc.id, true);
  if (!st.watched) { st.watched = Date.now(); var r = sceneReward(SP.sc.id, 'w', 5, 0); toast('🎬 看完小剧场 ⚡+' + r.xp + ' XP'); sfx.win(); } else st.watched = Date.now();
  save(); var ss = $('#scsteps'); if (ss) { ss.innerHTML = sceneStepsHtml(SP.sc); bindSceneSteps(SP.sc); ss.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
}

/* ---------- microphone recording (MediaRecorder; iOS Safari → audio/mp4, Chrome/WeChat Android → webm/opus) ---------- */
var MicRec = {
  MAX: 15000, st: null, mr: null, chunks: [], t0: 0, timer: null,
  supported: function () { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder); },
  mime: function () { var c = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/ogg;codecs=opus']; for (var i = 0; i < c.length; i++) try { if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(c[i])) return c[i]; } catch (e) { } return ''; },
  errText: function (e) {
    var n = (e && (e.name || e)) || '';
    if (!MicRec.supported()) return isWX ? '微信里暂时不能录音：请点右上角「···」→「在浏览器打开」，或者直接打字。' : '这个浏览器不能录音，请换 Safari / Chrome，或者直接打字。';
    if (/NotAllowed|Permission|Security/i.test(n)) return '麦克风没有被允许 🎤\n· iPhone：设置 › Safari 浏览器 › 麦克风 › 允许（微信里：允许微信使用麦克风）\n· 安卓：在浏览器地址栏左边的 🔒 里允许麦克风\n· 还不行就点右上角「···」用浏览器打开，或者直接打字。';
    if (/NotFound|DevicesNotFound/i.test(n)) return '没有找到麦克风，请检查耳机或设备，或者直接打字。';
    if (/NotReadable|TrackStart|Abort/i.test(n)) return '麦克风被别的应用占用了（比如在通话或录像），关掉后再试。';
    return '录音打不开（' + n + '），可以直接打字。';
  },
  start: function (onTick, onAuto) {
    var self = this;
    if (!this.supported()) return Promise.reject({ name: 'Unsupported' });
    return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } }).then(function (st) {
      self.st = st; self.chunks = []; var m = self.mime(), opt = { audioBitsPerSecond: 32000 }; if (m) opt.mimeType = m;
      try { self.mr = new MediaRecorder(st, opt); } catch (e) { self.mr = new MediaRecorder(st); }
      self.mr.ondataavailable = function (e) { if (e.data && e.data.size) self.chunks.push(e.data); };
      self.mr.start(250); self.t0 = Date.now();
      clearInterval(self.timer);
      self.timer = setInterval(function () { var ms = Date.now() - self.t0; if (onTick) onTick(ms); if (ms >= self.MAX) { clearInterval(self.timer); if (onAuto) onAuto(); } }, 200);
    });
  },
  stop: function () {
    var self = this; clearInterval(this.timer);
    return new Promise(function (res) {
      var mr = self.mr; if (!mr) return res(null);
      var ms = Date.now() - self.t0;
      mr.onstop = function () {
        var type = (mr.mimeType || self.chunks[0] && self.chunks[0].type || 'audio/webm').split(';')[0];
        var blob = new Blob(self.chunks, { type: type });
        if (self.st) self.st.getTracks().forEach(function (t) { t.stop(); });
        self.mr = null; self.st = null;
        res({ blob: blob, ms: ms, type: type, url: URL.createObjectURL(blob) });
      };
      try { mr.stop(); } catch (e) { res(null); }
    });
  },
  cancel: function () { clearInterval(this.timer); try { if (this.mr) this.mr.stop(); } catch (e) { } if (this.st) this.st.getTracks().forEach(function (t) { t.stop(); }); this.mr = null; this.st = null; }
};
function micErrModal(e) { modal(mascot('think', 80) + '<h2>麦克风用不了</h2><p class="sub" style="white-space:pre-line;text-align:left">' + esc(MicRec.errText(e)) + '</p><button class="btn block" id="mok">知道了</button>', function (m, close) { $('#mok', m).onclick = close; }); }
/* a round mic button bound to MicRec: tap to start, tap to stop (auto-stops at 15 s) */
function bindMic(btn, onDone, onStart) {
  var rec = false;
  function stop() {
    if (!rec) return; rec = false; btn.classList.remove('rec'); btn.style.removeProperty('--p');
    MicRec.stop().then(function (r) { if (r) onDone(r); });
  }
  btn.onclick = function () {
    if (rec) return stop();
    TTS.stop();
    MicRec.start(function (ms) { btn.style.setProperty('--p', Math.min(100, ms / MicRec.MAX * 100) + '%'); }, stop).then(function () { rec = true; btn.classList.add('rec'); if (onStart) onStart(); }).catch(function (e) { micErrModal(e); });
  };
  return { stop: stop, isRec: function () { return rec; } };
}
function playBlobUrl(url) { return new Promise(function (res) { TTS.stop(); var a = new Audio(url); a.onended = function () { res(true); }; a.onerror = function () { res(false); }; var p = a.play(); if (p && p.catch) p.catch(function () { res(false); }); }); }

/* ---------- AI client ---------- */
var AI = {
  q: null, qTs: 0, ready: null,
  ident: function () { return Cloud.acct ? Cloud.ident() : {}; },
  post: function (path, body, ms) {
    var ctl = window.AbortController ? new AbortController() : null, tm = setTimeout(function () { if (ctl) ctl.abort(); }, ms || 30000);
    var opt = { method: 'POST', body: body };
    if (!(body instanceof FormData)) { opt.headers = { 'content-type': 'application/json' }; opt.body = JSON.stringify(Object.assign({}, AI.ident(), body)); }
    if (ctl) opt.signal = ctl.signal;
    return fetch(apiBase() + path, opt).then(function (r) { clearTimeout(tm); return r.json().catch(function () { return { ok: false, code: 'http' + r.status, msg: '服务器返回了错误（' + r.status + '）' }; }); },
      function () { clearTimeout(tm); return { ok: false, code: 'net', msg: '网络连不上，请检查网络后再试' }; });
  },
  form: function (blob, meta) { var fd = new FormData(); var ext = /mp4|aac|m4a/.test(blob.type) ? 'm4a' : /ogg/.test(blob.type) ? 'ogg' : /wav/.test(blob.type) ? 'wav' : 'webm'; fd.append('audio', blob, 'rec.' + ext); fd.append('meta', JSON.stringify(Object.assign({}, AI.ident(), meta || {}))); return fd; },
  quota: function (force) {
    var self = this;
    if (!force && this.q && Date.now() - this.qTs < 60000) return Promise.resolve(this.q);
    return this.post('/api/ai/quota', {}, 12000).then(function (d) { if (d && d.ok) { self.q = d; self.qTs = Date.now(); self.ready = !!d.ready; } return d; });
  },
  setLeft: function (kind, d) { if (this.q && d && d.left != null && this.q[kind]) { this.q[kind].left = d.left; } }
};
function aiOn() { return AI.ready !== false && navigator.onLine !== false; }
function sttScore(target, blob) {
  return AI.post('/api/ai/stt', AI.form(blob, { target: target }), 30000).then(function (d) {
    AI.setLeft('stt', d);
    if (!d || !d.ok) return { err: d && d.msg || 'AI 打分暂时不可用', code: d && d.code };
    var sc = lcsMarks(target, d.heard || ''); sc.heard = d.heard || ''; return sc;
  });
}
function marksHtml(sc) { return sc.words.map(function (w, i) { return '<span class="' + (sc.marks[i] ? 'ok' : 'miss') + '">' + esc(w) + '</span>'; }).join(' '); }

/* ---------- step 1: 跟读 ---------- */
function viewSceneRepeat(sc) {
  var R = { i: 0, scores: [], rec: null }, vt = VT;
  AI.quota().then(function () { var n = $('#repai'); if (n) n.innerHTML = repAiNote(); });
  function repAiNote() { var q = AI.q && AI.q.stt; return aiOn() && q ? (q.left > 0 ? '🤖 AI 听你读并打分（今天还剩 ' + q.left + ' 次）' : '今天 AI 打分次数用完了，用「自己听」的方式练吧') : SR ? '用浏览器语音识别打分' : '录下来自己听，和原声比一比'; }
  function draw() {
    if (vt !== VT) return;
    var l = sc.lines[R.i], c = charOf(l.who);
    V.innerHTML = '<div class="page scpage"><div class="row">' + backBtn('#/scene/' + sc.id) + '<div class="grow"><b class="sctitle">🎤 跟读 · ' + esc(sc.title) + '</b><div class="sub" id="repai">' + repAiNote() + '</div></div></div>' +
      '<div class="lbar"><i style="width:' + Math.round(R.i * 100 / sc.lines.length) + '%"></i></div>' +
      '<div class="stage small"><div class="kb a on m' + (l.shot % 4) + '"><img src="' + sc.imgs[Math.min(sc.imgs.length - 1, l.shot)] + '" alt=""></div></div>' +
      '<div class="scbubble"><div class="scwho">' + avatarOf(l.who, 36) + '<b style="color:' + c.color + '">' + esc(l.who) + '</b><button class="ibtn sm" id="rsay">🔊</button><button class="ibtn sm" id="rslow">🐢</button></div><div class="scen" id="rtxt">' + esc(l.en) + '</div><div class="sczh">' + esc(l.zh) + '</div></div>' +
      '<div class="microw"><button class="micbtn" id="rmic" aria-label="录音">🎤</button><div class="sub" id="rhint">先听一遍，再点 🎤 跟着读（最多 15 秒）</div></div>' +
      '<div id="rres"></div><div class="fbtns" style="display:flex;gap:12px;margin-top:14px"><button class="btn ghost" id="rskip">跳过</button><button class="btn grow" id="rnext" disabled>下一句 ›</button></div></div>';
    bindBack();
    $('#rsay').onclick = function () { playLine(sc, l); };
    $('#rslow').onclick = function () { TTS.stop(); TTS.say(l.en, 'en-US', 0.6); };
    $('#rskip').onclick = function () { R.scores[R.i] = null; nextLine(); };
    $('#rnext').onclick = nextLine;
    bindMic($('#rmic'), function (r) { judge(l, r); }, function () { $('#rhint').textContent = '正在录音… 读完再点一下 ⏹'; });
    setTimeout(function () { if (vt === VT) playLine(sc, l); }, 300);
  }
  function judge(l, r) {
    var res = $('#rres'), hint = $('#rhint'); hint.textContent = '再点 🎤 可以重新读';
    var own = '<button class="btn sm ghost" id="rmine">▶ 听我的录音</button>';
    var useAI = aiOn() && AI.q && AI.q.stt && AI.q.stt.left > 0 && r.ms > 500;
    function selfCheck(note) {
      res.innerHTML = '<div class="card center">' + (note ? '<div class="sub">' + esc(note) + '</div>' : '') + '<p>听听自己读得像不像？</p>' + own + ' <button class="btn sm ghost" id="rorig">🔊 原声</button><div style="display:flex;gap:10px;margin-top:12px"><button class="btn sm ghost grow" id="rbad">再练练</button><button class="btn sm grow" id="rgood">👍 读得好</button></div></div>';
      $('#rmine').onclick = function () { playBlobUrl(r.url); }; $('#rorig').onclick = function () { playLine(sc, l); };
      $('#rbad').onclick = function () { res.innerHTML = ''; };
      $('#rgood').onclick = function () { R.scores[R.i] = 80; sfx.good(); $('#rnext').disabled = false; nextLine(); };
    }
    function show(sc2) {
      R.scores[R.i] = Math.max(R.scores[R.i] || 0, sc2.score);
      var good = sc2.score >= 80; if (good) sfx.good(); else sfx.bad && sfx.tap();
      res.innerHTML = '<div class="card center"><div class="bigscore ' + (good ? 'g' : sc2.score >= 50 ? 'y' : 'r') + '">' + sc2.score + ' 分</div><div class="marks">' + marksHtml(sc2) + '</div>' + (sc2.heard ? '<div class="sub">皮皮听到：' + esc(sc2.heard) + '</div>' : '') + '<div class="sub">' + (good ? '太棒了！' : '灰色的词再读清楚一点～') + '</div><div style="margin-top:8px">' + own + '</div></div>';
      $('#rmine').onclick = function () { playBlobUrl(r.url); };
      $('#rnext').disabled = false;
    }
    if (useAI) {
      res.innerHTML = '<div class="card center"><div class="thinking">' + mascot('think', 56) + '<span>皮皮在听…</span></div></div>';
      sttScore(l.en, r.blob).then(function (x) { if (vt !== VT || !$('#rres')) return; if (x.err) selfCheck(x.err); else show(x); });
    } else if (SR && !isWX) {
      selfCheck('');
    } else selfCheck('');
  }
  function nextLine() {
    if (vt !== VT) return; TTS.stop();
    if (R.i < sc.lines.length - 1) { R.i++; draw(); return; }
    var got = R.scores.filter(function (x) { return x != null; }), avg = got.length ? Math.round(got.reduce(function (a, b) { return a + b; }, 0) / got.length) : 0;
    var st = sceneSt(sc.id, true), rw = got.length ? sceneReward(sc.id, 'repD', avg >= 80 ? 15 : 10, 5) : { xp: 0, gems: 0 };
    if (got.length) { st.rep = Math.max(st.rep || 0, avg || 1); D().shadow = (D().shadow || 0) + got.length; S.stats.shadow = (S.stats.shadow || 0) + got.length; st.repD = 1; save(); }
    sfx.win(); confetti(60);
    V.innerHTML = '<div class="page center scpage">' + mascot('cheer', 130) + '<h1>跟读完成！</h1><p class="sub">读了 ' + got.length + ' / ' + sc.lines.length + ' 句' + (avg ? ' · 平均 ' + avg + ' 分' : '') + '</p><div class="rstats"><div class="rstat y"><small>经验 XP</small><b>⚡ ' + rw.xp + '</b></div>' + (rw.gems ? '<div class="rstat b"><small>宝石</small><b>💎 ' + rw.gems + '</b></div>' : '') + '</div>' +
      '<button class="btn block" data-href="#/scene/' + sc.id + '/role" style="margin-top:16px">下一步：🎭 角色扮演</button><button class="btn block ghost" data-href="#/scene/' + sc.id + '" style="margin-top:12px">回到小剧场</button></div>';
    bindHrefs(V);
  }
  draw();
}

/* ---------- step 2: 角色扮演 ---------- */
function viewSceneRole(sc) {
  var whos = []; sc.lines.forEach(function (l) { if (whos.indexOf(l.who) < 0) whos.push(l.who); });
  var h = '<div class="page scpage"><div class="row">' + backBtn('#/scene/' + sc.id) + '<div class="grow"><b class="sctitle">🎭 角色扮演 · ' + esc(sc.title) + '</b><div class="sub">选一个角色，轮到 TA 说话时，你来说！</div></div></div><div class="rolepick">' +
    whos.map(function (w) { var c = charOf(w), n = sc.lines.filter(function (l) { return l.who === w; }).length; return '<button class="rolebtn" data-who="' + w + '" style="--c:' + c.color + '">' + avatarOf(w, 64) + '<b>' + esc(w) + '</b><small>' + esc(c.zh) + ' · ' + n + ' 句</small></button>'; }).join('') +
    '</div><label class="tog"><input type="checkbox" id="rhide"> 挑战模式：先隐藏我的英文台词</label></div>';
  V.innerHTML = h; bindBack();
  $$('[data-who]', V).forEach(function (b) { b.onclick = function () { run(b.getAttribute('data-who'), $('#rhide').checked); }; });
  function run(me, hide) {
    var G = { i: 0, recs: {}, pid: 0 }, vt = VT;
    function draw() {
      if (vt !== VT) return;
      var l = sc.lines[G.i], c = charOf(l.who), mine = l.who === me, my = ++G.pid;
      V.innerHTML = '<div class="page scpage"><div class="row">' + backBtn('#/scene/' + sc.id + '/role') + '<div class="grow"><b class="sctitle">🎭 我是 ' + esc(me) + '</b><div class="sub">第 ' + (G.i + 1) + ' / ' + sc.lines.length + ' 句</div></div></div>' +
        '<div class="stage small"><div class="kb a on m' + (l.shot % 4) + '"><img src="' + sc.imgs[Math.min(sc.imgs.length - 1, l.shot)] + '" alt=""></div></div>' +
        '<div class="scbubble' + (mine ? ' mine' : '') + '"><div class="scwho">' + avatarOf(l.who, 36) + '<b style="color:' + c.color + '">' + esc(l.who) + (mine ? ' <span class="pill req">轮到你啦</span>' : '') + '</b></div><div class="scen' + (mine && hide ? ' blur' : '') + '" id="gtxt">' + esc(l.en) + '</div><div class="sczh">' + esc(l.zh) + '</div></div>' +
        (mine ? '<div class="microw"><button class="micbtn" id="gmic">🎤</button><div class="sub" id="ghint">' + (hide ? '看着中文说英语，点一下英文可以偷看' : '点 🎤 说出你的台词') + '</div></div><div id="gres"></div><div style="display:flex;gap:10px;margin-top:12px"><button class="btn ghost" id="ghelp">🔊 提示</button><button class="btn grow" id="gnext"' + (G.recs[G.i] ? '' : ' disabled') + '>下一句 ›</button></div>'
          : '<div class="sub center" style="margin-top:14px">' + esc(c.zh) + ' 在说话… 👂</div><div style="display:flex;gap:10px;margin-top:12px"><button class="btn ghost" id="gagain">🔁 再听</button><button class="btn grow" id="gnext">下一句 ›</button></div>') + '</div>';
      bindBack();
      if (mine) {
        $('#gtxt').onclick = function () { this.classList.remove('blur'); };
        $('#ghelp').onclick = function () { playLine(sc, l); };
        bindMic($('#gmic'), function (r) {
          G.recs[G.i] = r; $('#gnext').disabled = false;
          var res = $('#gres'); res.innerHTML = '<div class="card center"><button class="btn sm ghost" id="gplay">▶ 听我说的</button></div>';
          $('#gplay').onclick = function () { playBlobUrl(r.url); };
          if (aiOn() && AI.q && AI.q.stt && AI.q.stt.left > 0 && r.ms > 500) {
            res.insertAdjacentHTML('beforeend', '<div class="thinking center" id="gth">' + mascot('think', 40) + '<span>皮皮在听…</span></div>');
            sttScore(l.en, r.blob).then(function (x) { var th = $('#gth'); if (th) th.remove(); if (vt !== VT || my !== G.pid || x.err) return; G.recs[G.i].score = x.score; res.insertAdjacentHTML('beforeend', '<div class="marks">' + marksHtml(x) + '</div><div class="sub">' + (x.score >= 80 ? '说得真好！' : '再大声、清楚一点会更好～') + '</div>'); });
          }
        }, function () { $('#ghint').textContent = '正在录音… 说完再点一下 ⏹'; });
      } else {
        $('#gagain').onclick = function () { playLine(sc, l); };
        playLine(sc, l).then(function () { if (my !== G.pid) return; setTimeout(function () { if (my === G.pid) nextL(); }, 700); });
      }
      $('#gnext').onclick = nextL;
    }
    function nextL() { if (vt !== VT) return; TTS.stop(); if (G.i < sc.lines.length - 1) { G.i++; draw(); } else done(); }
    function done() {
      var n = Object.keys(G.recs).length, st = sceneSt(sc.id, true), rw = sceneReward(sc.id, 'role', 10, 5); st.role = Date.now(); save(); sfx.win(); confetti(60);
      V.innerHTML = '<div class="page center scpage">' + mascot('cheer', 130) + '<h1>表演结束！👏</h1><p class="sub">你扮演了 ' + esc(me) + '，说了 ' + n + ' 句台词</p><div class="rstats"><div class="rstat y"><small>经验 XP</small><b>⚡ ' + rw.xp + '</b></div>' + (rw.gems ? '<div class="rstat b"><small>宝石</small><b>💎 ' + rw.gems + '</b></div>' : '') + '</div>' +
        (n ? '<button class="btn block blue" id="gshow" style="margin-top:16px">▶ 听听我们的完整表演</button>' : '') +
        '<button class="btn block" data-href="#/chat/' + sc.id + '" style="margin-top:12px">下一步：🤖 和皮皮自由对话</button><button class="btn block ghost" data-href="#/scene/' + sc.id + '" style="margin-top:12px">回到小剧场</button></div>';
      bindHrefs(V);
      var sb = $('#gshow'); if (sb) sb.onclick = function () {
        var my = ++G.pid; sb.textContent = '⏸ 播放中…';
        sc.lines.reduce(function (p, l, k) { return p.then(function () { if (my !== G.pid) return; return vt !== VT ? null : G.recs[k] ? playBlobUrl(G.recs[k].url) : l.who === me ? null : playLine(sc, l); }); }, Promise.resolve()).then(function () { if (sb) sb.textContent = '▶ 再听一遍'; });
      };
    }
    draw();
  }
}

/* ---------- AI chat with Pip ---------- */
var CHAT = null;
function chatCtx(sid) {
  var sc = SCN_IDX[sid];
  if (sc) return { sid: sid, title: sc.title, unit: sc.zh, words: sc.words, patterns: sc.patterns, lines: sc.lines.map(function (l) { return l.who + ': ' + l.en; }), ask: sc.ask, emoji: sc.emoji };
  var u = UNITS.filter(function (x) { return x.id === sid; })[0] || focusUnit() || (currentLesson(false) || {})._u || MAIN_UNITS[0];
  if (!u) return { sid: 'free', title: 'Free talk', unit: '', words: [], patterns: [], lines: [], ask: "Hi! I'm Pip. What did you do today?", emoji: '💬' };
  var keys = []; u.lessons.forEach(function (l) { (l.key || []).forEach(function (k) { if (keys.length < 6) keys.push(k); }); });
  var ws = (u.words || []).slice(0, 14).map(function (w) { return w.w; });
  var q = keys.filter(function (k) { return /\?$/.test(k); })[0];
  return { sid: u.id, title: u.title, unit: 'Unit ' + u.no + ' ' + u.zh, words: ws, patterns: keys, lines: [], ask: "Hi! I'm Pip. Let's talk about " + u.title + ". " + (q || 'What do you like about it?'), emoji: u.emoji || '💬' };
}
function viewChatPick() {
  var mine = (SCN && SCN.scenes || []).filter(sceneBookOk);
  var h = '<div class="page"><div class="row">' + backBtn('#/practice') + '<h1 class="h grow" style="margin:0">🤖 和皮皮聊天</h1></div>' + bubble('选一个话题，用英语和我聊天吧！可以说，也可以打字。', 'happy', 70) +
    '<h3 class="sech">情景话题</h3>' + mine.map(function (s) { return hubCard(s.emoji, esc(s.title), esc(s.zh), 'data-href="#/chat/' + s.id + '"'); }).join('') +
    '<h3 class="sech">按单元聊</h3>' + MAIN_UNITS.filter(function (u) { return !u.isRevision; }).map(function (u) { return hubCard(u.emoji || '📘', 'Unit ' + u.no + ' ' + esc(u.title), esc(u.zh), 'data-href="#/chat/' + u.id + '"'); }).join('') + '</div>';
  V.innerHTML = h; bindBack();
}
function viewChat(sid) {
  if (!sid) return viewChatPick();
  if (!SCN && /-u\d/.test(sid)) { loadScenes().then(render); return; }
  var ctx = chatCtx(sid);
  if (!CHAT || CHAT.sid !== ctx.sid) CHAT = { sid: ctx.sid, ctx: ctx, msgs: [{ r: 'a', t: ctx.ask }], busy: false, typing: false, first: true };
  var h = '<div class="chatpage"><div class="chathead">' + backBtn(SCN_IDX[sid] ? '#/scene/' + sid : '#/chat') + '<div class="grow"><b>' + esc(ctx.emoji + ' ' + ctx.title) + '</b><div class="sub" id="cquota">和皮皮用英语聊天</div></div><button class="ibtn sm" id="cnew" title="重新开始">↺</button></div>' +
    '<div class="chatlog" id="clog"></div>' +
    '<div class="chatfoot"><div class="cinput hidden" id="ctext"><input id="cin" maxlength="200" placeholder="用英语打字…" autocomplete="off" enterkeyhint="send"><button class="btn sm" id="csend">发送</button></div>' +
    '<div class="cmicrow"><button class="ibtn" id="ckb" title="打字">⌨️</button><button class="micbtn" id="cmic">🎤</button><div class="sub cmh" id="chint">点 🎤 说英语（15 秒内）</div></div></div></div>';
  V.innerHTML = h; bindBack(); fitChat();
  drawLog();
  if (CHAT.first) { CHAT.first = false; setTimeout(function () { TTS.say(ctx.ask, 'en-US'); }, 400); }
  $('#cnew').onclick = function () { CHAT = null; viewChat(sid); };
  $('#ckb').onclick = function () { var t = $('#ctext'); t.classList.toggle('hidden'); if (!t.classList.contains('hidden')) $('#cin').focus(); };
  $('#csend').onclick = sendText;
  $('#cin').onkeydown = function (e) { if (e.key === 'Enter') sendText(); };
  if (!MicRec.supported()) { $('#ctext').classList.remove('hidden'); $('#chint').textContent = isWX ? '微信里不能录音，请打字（或右上角「···」用浏览器打开）' : '这个浏览器不能录音，请打字'; $('#cmic').disabled = true; }
  else bindMic($('#cmic'), function (r) {
    if (r.ms < 600) { toast('说得太短啦，再说一次'); return; }
    send({ blob: r.blob });
  }, function () { $('#chint').textContent = '正在听… 说完再点一下 ⏹'; });
  refreshQuota();
  function showLeft(left, max) { var el = $('#cquota'); if (el && left != null) el.innerHTML = '今天还能聊 <b>' + left + '</b>' + (max ? ' / ' + max : '') + ' 次'; }
  function refreshQuota(soft) {
    AI.quota(soft).then(function (d) {
      var el = $('#cquota'); if (!el) return;
      if (!d || !d.ok) { if (soft) return; el.textContent = '连不上 AI 服务器（' + ((d && d.msg) || '网络') + '）'; return; }
      if (!d.ready) { el.textContent = 'AI 还没开通，请家长稍后再试'; return; }
      el.innerHTML = '今天还能聊 <b>' + d.chat.left + '</b> / ' + d.chat.max + ' 次' + (d.login ? '' : ' · <a href="#/me">登录班级账号可以聊更多</a>');
    });
  }
  function drawLog() {
    var log = $('#clog'); if (!log) return;
    log.innerHTML = CHAT.msgs.map(function (m, k) {
      if (m.r === 'a') return '<div class="cmsg pip"><span class="cav">' + mascot(m.mood || 'happy', 40) + '</span><div class="cb"><div>' + esc(m.t) + '</div><button class="ibtn sm csay" data-k="' + k + '">🔊</button></div></div>';
      if (m.r === 'u') return '<div class="cmsg me"><div class="cb"><div>' + esc(m.t) + '</div>' + (m.stars != null ? '<div class="cstars">' + '★★★'.slice(0, m.stars) + '<i>' + '★★★'.slice(m.stars) + '</i></div>' : '') + (m.fix ? '<div class="cfix">✏️ ' + esc(m.fix) + '</div>' : '') + (m.tip ? '<div class="ctip">💡 ' + esc(m.tip) + '</div>' : '') + '</div></div>';
      if (m.r === 'e') return '<div class="cmsg sys">' + esc(m.t) + '</div>';
      return '';
    }).join('') + (CHAT.busy ? '<div class="cmsg pip"><span class="cav">' + mascot('think', 40) + '</span><div class="cb typing"><i></i><i></i><i></i></div></div>' : '');
    $$('.csay', log).forEach(function (b) { b.onclick = function () { TTS.one(CHAT.msgs[+b.getAttribute('data-k')].t, 'en-US'); }; });
    log.scrollTop = log.scrollHeight;
    var pg = $('.chatpage'); if (pg) setTimeout(function () { var last = log.lastElementChild; if (last) last.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, 30);
  }
  function sendText() { var v = $('#cin').value.trim(); if (!v) return; if (!/[A-Za-z]/.test(v)) { toast('试试用英语说哦 😊'); } $('#cin').value = ''; send({ text: v }); }
  function send(o) {
    if (CHAT.busy) return;
    if (CHAT.msgs.some(function (m) { return m.q; }) && AI.q && AI.q.chat && AI.q.chat.left === 0) { toast('今天的 AI 对话次数用完啦，明天再来吧'); return; }
    CHAT.busy = true;
    var my = CHAT;
    var meta = { title: ctx.title, unit: ctx.unit, words: ctx.words, patterns: ctx.patterns, lines: ctx.lines, hist: CHAT.msgs.filter(function (m) { return m.r === 'a' || m.r === 'u'; }).slice(-8).map(function (m) { return { r: m.r, t: m.t }; }) };
    var um = null;
    if (o.text) { um = { r: 'u', t: o.text }; CHAT.msgs.push(um); }
    else { um = { r: 'u', t: '🎤 …' }; CHAT.msgs.push(um); }
    drawLog(); $('#chint').textContent = '皮皮在想…';
    var p = o.blob ? AI.post('/api/ai/chat', AI.form(o.blob, meta), 40000) : AI.post('/api/ai/chat', Object.assign(meta, { text: o.text }), 40000);
    p.then(function (d) {
      if (CHAT !== my) return; CHAT.busy = false; AI.setLeft('chat', d);
      if (!d || !d.ok) { CHAT.msgs.splice(CHAT.msgs.indexOf(um), 1); if (d && d.code === 'quota') CHAT.msgs = CHAT.msgs.filter(function (m) { return !m.q; }); CHAT.msgs.push({ r: 'e', t: (d && d.msg) || 'AI 暂时不可用', q: d && d.code === 'quota' ? 1 : 0 }); drawLog(); if (d && d.code === 'quota') showLeft(0, d.max); else refreshQuota(); $('#chint').textContent = '点 🎤 说英语（15 秒内）'; return; }
      if (d.empty || !d.heard) { CHAT.msgs.splice(CHAT.msgs.indexOf(um), 1); CHAT.msgs.push({ r: 'e', t: '皮皮没听清 👂 请靠近一点、大声一点再说一次，或者点 ⌨️ 打字。' }); drawLog(); $('#chint').textContent = '点 🎤 再说一次'; return; }
      um.t = d.heard; um.stars = d.stars; um.tip = d.tip_zh; um.fix = d.fix && norm(d.fix) !== norm(d.heard) ? d.fix : '';
      CHAT.msgs.push({ r: 'a', t: d.reply, mood: d.stars >= 2 ? 'happy' : 'idle' });
      drawLog(); showLeft(d.left, d.max); refreshQuota(true);
      $('#chint').textContent = '点 🎤 接着说';
      TTS.one(d.reply, 'en-US');
      var xp = addXP(Math.max(1, d.stars || 0)); D().chat = (D().chat || 0) + 1; S.stats.chats = (S.stats.chats || 0) + 1; save(); Cloud.markDirty();
      if (d.stars >= 3) sfx.good();
      if (d.left === 0) CHAT.msgs.push({ r: 'e', t: '今天的 AI 对话次数用完啦，明天再来找皮皮聊天吧！🌙', q: 1 }), drawLog();
      if (xp) toast('⚡ +' + xp + ' XP', 1200);
    });
  }
}

window.fitChat = fitChat;
function fitChat() {
  var pg = $('.chatpage'); if (!pg) return;
  var nav = $('#bottom'), nb = nav && getComputedStyle(nav).display !== 'none' ? nav.offsetHeight : 0;
  var top = pg.getBoundingClientRect().top + (window.scrollY || 0);
  pg.style.height = Math.max(340, (window.innerHeight || 640) - top - nb) + 'px';
}
window.addEventListener('resize', function () { fitChat(); });
/* ---------- 讲讲我错在哪 ---------- */
function explainWrong(q, ans) {
  var qt = qText(q) + (q.opts && q.t !== 'pic' && q.t !== 'match' ? '（选项：' + q.opts.map(function (o) { return typeof o === 'object' ? (o.w || '') : o; }).join(' / ') + '）' : '');
  var body = { qid: qKey(q), q: String(qt).slice(0, 300), right: String(rightText(q) || '').slice(0, 160), ans: String(ans || '').slice(0, 160), exp: String(q.exp || '').slice(0, 300) };
  modal('<div class="rephead">' + mascot('think', 64) + '<div><h2>讲讲我错在哪</h2><p class="sub">皮皮老师来帮你看看 🧐</p></div></div><div class="repq">' + esc(body.q).slice(0, 200) + '</div>' +
    '<div class="exbox" id="exbox"><div class="thinking">' + mascot('think', 40) + '<span>皮皮在想…</span></div></div><div class="sub" id="exleft"></div><button class="btn block" id="exok" style="margin-top:12px">懂了！</button>', function (m, close) {
      $('#exok', m).onclick = function () { TTS.stop(); close(); };
      AI.post('/api/ai/explain', body, 40000).then(function (d) {
        AI.setLeft('explain', d); var box = $('#exbox', m); if (!box) return;
        if (!d || !d.ok) { box.innerHTML = '<p class="sub">' + esc((d && d.msg) || '讲解暂时不可用') + '</p>' + (q.exp ? '<p>' + esc(q.exp) + '</p>' : ''); return; }
        box.innerHTML = '<p>' + esc(d.text) + '</p><button class="ibtn sm" id="exsay">🔊</button>';
        $('#exsay', m).onclick = function () { TTS.mixed(d.text); };
        $('#exleft', m).textContent = d.cached ? '（这题讲过啦，不扣次数）' : d.left != null ? '今天还能讲解 ' + d.left + ' 次' : '';
      });
    });
}

window.__E6 = {
  sess: function () { return session; }, S: function () { return S; }, B: function () { return B; }, LESSONS: function () { return LESSONS; }, P: P,
  startSession: startSession, startLesson: function (id) { startLesson(LESSONS[id]); }, gen: GEN, leagueBoard: leagueBoard, render: render, save: save,
  setState: function (fn) { fn(S); save(); render(); },
  Cloud: Cloud, cloudStats: cloudStats, AI: AI, MicRec: MicRec, SCN: function () { return SCN; }, explainWrong: explainWrong, TTS: TTS, Eye: Eye, Reports: Reports, startMock: startMock, startDictation: startDictation, missStats: missStats, ahash: ahash, shWeekId: shWeekId, finishSession: function () { finishSession(); }
};
boot();
})();
