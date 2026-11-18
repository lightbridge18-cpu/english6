// Scan course data for every English string the app speaks via TTS, output tools/audio_inventory.json
// Usage: node tools/audio_inventory.js
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
// MUST match akey()/ahash() in js/app.js
function akey(t) {
  return String(t).replace(/\/[^\/\s][^\/]*\//g, ' ').replace(/[’‘`]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim()
    .replace(/^[\s.,;:"'(]+|[\s.,;:"')]+$/g, '').toLowerCase();
}
function ahash(t) { const s = akey(t); let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, '0'); }
function segs(text) { // same as TTS.segs
  const out = [], re = /[A-Za-z][A-Za-z0-9'’\-\s,.!?"…°()]*[A-Za-z0-9.!?'"…)]|[A-Za-z]/g; let last = 0, m;
  text = String(text).replace(/\/[^\/\s][^\/]*\//g, ' ');
  while ((m = re.exec(text))) { if (m.index > last) out.push({ t: text.slice(last, m.index), l: 'zh' }); out.push({ t: m[0], l: 'en' }); last = m.index + m[0].length; }
  return out.filter(s => s.l === 'en').map(s => s.t);
}
function enTiles(s) { return String(s).replace(/[“”"]/g, '').split(/\s+/).map(t => t.replace(/^[^A-Za-z0-9']+|[^A-Za-z0-9']+$/g, '')).filter(Boolean); }
const isEn = s => typeof s === 'string' && /^[\s"“(]*[A-Za-z]/.test(s) && !/[\u4e00-\u9fff]/.test(s);
const W = new Map(), SENT = new Map(), MIX = new Map();
function add(map, t) { if (!t || !isEn(t)) return; const k = akey(t); if (!k || !/[a-z]/.test(k)) return; if (!map.has(k)) map.set(k, String(t).replace(/\/[^\/\s][^\/]*\//g, ' ').replace(/\s+/g, ' ').trim()); }
function addS(t) { if (!isEn(t)) return; const n = enTiles(t).length; (n <= 2 ? add(W, t) : add(SENT, t)); }
const books = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/books.json'))).books;
for (const b of books) {
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, b.file)));
  (d.irregular || []).forEach(r => { const v = r[0].split(' ')[0]; add(W, v); add(W, r[1]); add(W, v + ', ' + r[1]); });
  (d.comparatives || []).forEach(r => { add(W, r[0]); add(W, r[1]); add(W, r[0] + ', ' + r[1]); });
  for (const u of d.units) {
    (u.words || []).forEach(w => { add(W, w.w); if (w.past) { add(W, w.past); add(W, w.w + ', ' + w.past); } });
    (u.comparatives || []).forEach(r => { add(W, r[0]); add(W, r[1]); add(W, r[0] + ', ' + r[1]); });
    (u.irregular || []).forEach(r => { const v = r[0].split(' ')[0]; add(W, v + ', ' + r[1]); });
    (u.expressions || []).forEach(e => addS(e[0]));
    (u.passages || []).forEach(p => p.lines.forEach(x => addS(x[1])));
    if (u.song) u.song.lines.forEach(x => addS(x[0]));
    (u.stories || []).forEach(s => { s.lines.forEach(x => addS(x[0])); (s.qs || []).forEach(q => scanQ(q)); });
    (u.lessons || []).forEach(l => {
      (l.key || []).forEach(addS);
      (l.explain || []).forEach(t => segs(t).forEach(x => add(MIX, x)));
      (l.table || []).forEach(r => { add(W, r[0].split(' ')[0]); add(W, r[1]); add(W, r[0].split(' ')[0] + ', ' + r[1]); });
      l.questions.forEach(scanQ);
    });
  }
}
function scanQ(q) {
  if (q.say) addS(q.say);
  if ((q.t === 'fill' || q.t === 'order') && q.a) addS(q.a);
  if (q.opts && typeof q.a === 'number' && isEn(q.opts[q.a])) addS(q.opts[q.a]);
  (q.opts || []).forEach(o => { if (isEn(o) && enTiles(o).length <= 2) add(W, o); });
  if (q.pairs) q.pairs.forEach(p => add(W, p[0]));
  if (q.exp) segs(q.exp).forEach(x => add(MIX, x));
}
// tiles: every token of every sentence (order/trans/ltap tiles speak single tokens)
for (const t of [...SENT.values()]) enTiles(t).forEach(x => { if (/^[A-Za-z]/.test(x)) add(W, x); });
// settings preview lines
['Hello! Nice to meet you. Shall we read together?', "Hello! Nice to meet you. Let's read together!", 'Hello!', 'How was your weekend?'].forEach(addS);
// mixed segments that are already words/sentences don't need a second entry
for (const k of [...MIX.keys()]) if (W.has(k) || SENT.has(k)) MIX.delete(k);
const out = { words: [...W.values()], sentences: [...SENT.values()], mixed: [...MIX.values()] };
// collision check
const seen = {}; let col = 0;
for (const t of [...out.words, ...out.sentences, ...out.mixed]) { const h = ahash(t), k = akey(t); if (seen[h] && seen[h] !== k) { col++; console.error('COLLISION', h, seen[h], '|', k); } seen[h] = k; }
fs.writeFileSync(path.join(__dirname, 'audio_inventory.json'), JSON.stringify(out, null, 0));
console.log('words', out.words.length, 'sentences', out.sentences.length, 'mixed', out.mixed.length, 'collisions', col,
  'chars', [...out.words, ...out.sentences, ...out.mixed].join('').length);
