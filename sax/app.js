/* =========================================================================
   SaxChord — サックスのためのコード＆運指クイズ
   - コード構成音を「記譜（吹く音）」と「実音」の両方で扱う
   - 答えは必ずサックスの運指図つきで提示する
   - マイクで実際に吹いた音を判定する
   ========================================================================= */
(() => {
"use strict";

/* ===================== 1. 音名とコードの理論 ===================== */

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const LETTER_SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// 度数 → 半音数 / 音度（音名を何文字ずらすか）
const DEG_SEMI = {
  "1": 0, "b2": 1, "2": 2, "#2": 3, "b3": 3, "3": 4, "4": 5, "#4": 6,
  "b5": 6, "5": 7, "#5": 8, "b6": 8, "6": 9, "bb7": 9, "b7": 10, "7": 11,
  "b9": 13, "9": 14, "#9": 15, "11": 17, "#11": 18, "b13": 20, "13": 21
};
const DEG_LETTER = {
  "1": 0, "b2": 1, "2": 1, "#2": 1, "b3": 2, "3": 2, "4": 3, "#4": 3,
  "b5": 4, "5": 4, "#5": 4, "b6": 5, "6": 5, "bb7": 6, "b7": 6, "7": 6,
  "b9": 1, "9": 1, "#9": 1, "11": 3, "#11": 3, "b13": 5, "13": 5
};

// 内部表記 "C#" "Bb" "Bbb" → 表示用 "C♯" "B♭" "B𝄫"
function pretty(name) {
  return name.replace(/bb/g, "\u{1D12B}").replace(/b/g, "♭").replace(/##/g, "\u{1D12A}").replace(/#/g, "♯");
}
// ドイツ音名（吹奏楽・ジャズの現場で使われる読み）
const GERMAN = {
  C: "ツェー", "C#": "ツィス", Db: "デス", D: "デー", "D#": "ディス", Eb: "エス",
  E: "エー", Fb: "フェス", "E#": "エイス", F: "エフ", "F#": "フィス", Gb: "ゲス",
  G: "ゲー", "G#": "ギス", Ab: "アス", A: "アー", "A#": "アイス", Bb: "ベー",
  B: "ハー", Cb: "ツェス", "B#": "ヒス"
};
function germanOf(name) {
  if (GERMAN[name]) return GERMAN[name];
  return GERMAN[simplify(name)] || "";
}

// 音名 → ピッチクラス(0-11)
function nameToPc(name) {
  const m = /^([A-G])(#{1,2}|b{1,2})?$/.exec(name);
  if (!m) return null;
  let pc = LETTER_SEMI[m[1]];
  const acc = m[2] || "";
  if (acc[0] === "#") pc += acc.length;
  if (acc[0] === "b") pc -= acc.length;
  return ((pc % 12) + 12) % 12;
}
// 綴りを作る：letterIndex(0-6) と pitchClass から "Eb" などを返す
function spell(letterIdx, pc) {
  const letter = LETTERS[((letterIdx % 7) + 7) % 7];
  let alter = (((pc - LETTER_SEMI[letter]) % 12) + 12) % 12;
  if (alter > 6) alter -= 12;              // -5..6 → 実際は -2..2 に収まる
  const acc = alter > 0 ? "#".repeat(alter) : alter < 0 ? "b".repeat(-alter) : "";
  return letter + acc;
}
// 重変化を避けた読みやすい表記（Bbb → A）
const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
function simplify(name) {
  const pc = nameToPc(name);
  if (pc === null) return name;
  return /b/.test(name) ? FLAT_NAMES[pc] : SHARP_NAMES[pc];
}
function isMessy(name) { return /bb|##/.test(name); }

// 音名の移調（綴りを保ったまま）: semi 半音、step 音度
function transposeName(name, semi, step) {
  const m = /^([A-G])/.exec(name);
  const li = LETTERS.indexOf(m[1]);
  const pc = (nameToPc(name) + semi) % 12;
  return spell(li + step, ((pc % 12) + 12) % 12);
}

/* ---------- コード定義 ---------- */
const CHORD_TYPES = [
  // level 1: まずこれだけで大半のスタンダードは吹ける
  { id: "maj", suffix: "", jp: "メジャー", degs: ["1", "3", "5"], level: 1 },
  { id: "min", suffix: "m", jp: "マイナー", degs: ["1", "b3", "5"], level: 1 },
  { id: "dom7", suffix: "7", jp: "セブンス", degs: ["1", "3", "5", "b7"], level: 1 },
  { id: "maj7", suffix: "maj7", jp: "メジャーセブンス", degs: ["1", "3", "5", "7"], level: 1 },
  { id: "min7", suffix: "m7", jp: "マイナーセブンス", degs: ["1", "b3", "5", "b7"], level: 1 },
  // level 2: ここまでで II-V-I とブルースが回る
  { id: "m7b5", suffix: "m7(♭5)", jp: "ハーフディミニッシュ", degs: ["1", "b3", "b5", "b7"], level: 2 },
  { id: "dim7", suffix: "dim7", jp: "ディミニッシュセブンス", degs: ["1", "b3", "b5", "bb7"], level: 2 },
  { id: "six", suffix: "6", jp: "シックス", degs: ["1", "3", "5", "6"], level: 2 },
  { id: "min6", suffix: "m6", jp: "マイナーシックス", degs: ["1", "b3", "5", "6"], level: 2 },
  { id: "sus4", suffix: "sus4", jp: "サスフォー", degs: ["1", "4", "5"], level: 2 },
  { id: "7sus4", suffix: "7sus4", jp: "セブンス・サスフォー", degs: ["1", "4", "5", "b7"], level: 2 },
  { id: "aug", suffix: "aug", jp: "オーギュメント", degs: ["1", "3", "#5"], level: 2 },
  { id: "7s5", suffix: "7(♯5)", jp: "オルタード系セブンス", degs: ["1", "3", "#5", "b7"], level: 2 },
  { id: "mMaj7", suffix: "mMaj7", jp: "マイナーメジャーセブンス", degs: ["1", "b3", "5", "7"], level: 2 },
  // level 3: テンション
  { id: "nine", suffix: "9", jp: "ナインス", degs: ["1", "3", "5", "b7", "9"], level: 3 },
  { id: "m9", suffix: "m9", jp: "マイナーナインス", degs: ["1", "b3", "5", "b7", "9"], level: 3 },
  { id: "maj9", suffix: "maj9", jp: "メジャーナインス", degs: ["1", "3", "5", "7", "9"], level: 3 },
  { id: "7b9", suffix: "7(♭9)", jp: "セブンス・フラットナインス", degs: ["1", "3", "5", "b7", "b9"], level: 3 },
  { id: "7s9", suffix: "7(♯9)", jp: "セブンス・シャープナインス", degs: ["1", "3", "5", "b7", "#9"], level: 3 },
  { id: "7s11", suffix: "7(♯11)", jp: "リディアン7th", degs: ["1", "3", "5", "b7", "#11"], level: 3 },
  { id: "7_13", suffix: "7(13)", jp: "セブンス・サーティーンス", degs: ["1", "3", "5", "b7", "13"], level: 3 },
  { id: "7b13", suffix: "7(♭13)", jp: "セブンス・フラットサーティーンス", degs: ["1", "3", "5", "b7", "b13"], level: 3 },
  { id: "add9", suffix: "add9", jp: "アドナインス", degs: ["1", "3", "5", "9"], level: 3 },
  { id: "six9", suffix: "6(9)", jp: "シックスナインス", degs: ["1", "3", "5", "6", "9"], level: 3 }
];
const TYPE_BY_ID = Object.fromEntries(CHORD_TYPES.map((t) => [t.id, t]));

const ROOTS_MAIN = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const ROOTS_EXTRA = ["C#", "Gb"];

// コードを組み立てる。root は綴り付きの音名、type は CHORD_TYPES の要素
function buildChord(root, type) {
  const rootLetter = LETTERS.indexOf(root[0]);
  const rootPc = nameToPc(root);
  const tones = type.degs.map((d) => {
    const pc = (rootPc + DEG_SEMI[d]) % 12;
    return { deg: d, name: spell(rootLetter + DEG_LETTER[d], pc), pc };
  });
  return { root, type, tones, label: root + type.suffix };
}

/* ---------- 楽器と移調 ---------- */
// written(記譜) = concert(実音) + semi
const INSTRUMENTS = {
  alto: { id: "alto", jp: "アルト (E♭)", semi: 9, step: 5, octSemi: 9, lowest: 58, highest: 89 },
  tenor: { id: "tenor", jp: "テナー (B♭)", semi: 2, step: 1, octSemi: 14, lowest: 58, highest: 89 },
  soprano: { id: "soprano", jp: "ソプラノ (B♭)", semi: 2, step: 1, octSemi: 2, lowest: 58, highest: 89 },
  bari: { id: "bari", jp: "バリトン (E♭)", semi: 9, step: 5, octSemi: 21, lowest: 56, highest: 89 },
  c: { id: "c", jp: "C管 (フルート等)", semi: 0, step: 0, octSemi: 0, lowest: 58, highest: 89 }
};

/* ===================== 2. 運指データ ===================== */
/* キーID:
   oct(オクターブキー) / palmF palmEb palmD frontF / L1 bis L2 L3 / gs csL bL bbL
   R1 fs R2 R3 / sideE sideC sideBb highFs / ebR cR                       */

// 記譜音 B♭3(58) 〜 C♯5(73) の基本運指
const BASE_FINGERING = {
  58: ["L1", "L2", "L3", "R1", "R2", "R3", "bbL"],          // low B♭
  59: ["L1", "L2", "L3", "R1", "R2", "R3", "bL"],           // low B
  60: ["L1", "L2", "L3", "R1", "R2", "R3", "cR"],           // low C
  61: ["L1", "L2", "L3", "R1", "R2", "R3", "csL"],          // low C♯
  62: ["L1", "L2", "L3", "R1", "R2", "R3"],                 // D
  63: ["L1", "L2", "L3", "R1", "R2", "R3", "ebR"],          // E♭
  64: ["L1", "L2", "L3", "R1", "R2"],                       // E
  65: ["L1", "L2", "L3", "R1"],                             // F
  66: ["L1", "L2", "L3", "R2"],                             // F♯
  67: ["L1", "L2", "L3"],                                   // G
  68: ["L1", "L2", "L3", "gs"],                             // G♯
  69: ["L1", "L2"],                                         // A
  70: ["L1", "bis"],                                        // B♭ (バイス)
  71: ["L1"],                                               // B
  72: ["L2"],                                               // C
  73: []                                                    // C♯（オールオープン）
};
// 代替運指（ヒントとして表示）
const ALT_FINGERING = {
  66: { keys: ["L1", "L2", "L3", "fs"], note: "右手薬指のF♯キー（F→F♯の連結に）" },
  70: { keys: ["L1", "R1"], note: "1と1（1&1）。B♭→A の動きで使う" },
  72: { keys: ["L1", "sideC"], note: "サイドCキー。B→C の連結に" }
};
const ALT_FINGERING_HI = {
  90: { keys: ["oct", "frontF", "L2", "L3", "fs"], note: "フロントF系のF♯" }
};

function fingeringFor(midi) {
  if (midi >= 58 && midi <= 73) return BASE_FINGERING[midi].slice();
  if (midi >= 74 && midi <= 85) return ["oct"].concat(BASE_FINGERING[midi - 12]);
  if (midi === 86) return ["oct", "palmD"];                                   // 高音D
  if (midi === 87) return ["oct", "palmD", "palmEb"];                         // 高音E♭
  if (midi === 88) return ["oct", "palmD", "palmEb", "sideE"];                // 高音E
  if (midi === 89) return ["oct", "palmD", "palmEb", "palmF"];                // 高音F
  if (midi === 90) return ["oct", "palmD", "palmEb", "palmF", "highFs"];      // 高音F♯
  return null;
}
function altFingeringFor(midi) {
  if (ALT_FINGERING[midi]) return ALT_FINGERING[midi];
  if (midi >= 74 && midi <= 85 && ALT_FINGERING[midi - 12]) {
    const a = ALT_FINGERING[midi - 12];
    return { keys: ["oct"].concat(a.keys), note: a.note };
  }
  if (ALT_FINGERING_HI[midi]) return ALT_FINGERING_HI[midi];
  if (midi === 89) return { keys: ["oct", "frontF", "L2", "L3"], note: "フロントF。速いパッセージで多用" };
  return null;
}

/* 運指図のレイアウト（縦長の模式図） */
const KEY_LAYOUT = [
  { id: "palmF", shape: "pill", x: 18, y: 26, w: 34, h: 15, label: "F" },
  { id: "palmEb", shape: "pill", x: 18, y: 47, w: 34, h: 15, label: "E♭" },
  { id: "palmD", shape: "pill", x: 18, y: 68, w: 34, h: 15, label: "D" },
  { id: "frontF", shape: "dot", cx: 100, cy: 62, r: 7.5, label: "F" },
  { id: "oct", shape: "pill", x: 20, y: 96, w: 32, h: 16, label: "Oct" },
  { id: "L1", shape: "hole", cx: 100, cy: 102, r: 14, label: "1" },
  { id: "bis", shape: "dot", cx: 100, cy: 124, r: 7, label: "bis" },
  { id: "L2", shape: "hole", cx: 100, cy: 146, r: 14, label: "2" },
  { id: "L3", shape: "hole", cx: 100, cy: 186, r: 14, label: "3" },
  { id: "gs", shape: "pill", x: 30, y: 196, w: 30, h: 14, label: "G♯" },
  { id: "csL", shape: "pill", x: 30, y: 214, w: 30, h: 14, label: "C♯" },
  { id: "bL", shape: "pill", x: 30, y: 232, w: 30, h: 14, label: "B" },
  { id: "bbL", shape: "pill", x: 30, y: 250, w: 30, h: 14, label: "B♭" },
  { id: "highFs", shape: "pill", x: 140, y: 168, w: 34, h: 14, label: "F♯" },
  { id: "sideE", shape: "pill", x: 140, y: 194, w: 34, h: 14, label: "E" },
  { id: "sideC", shape: "pill", x: 140, y: 214, w: 34, h: 14, label: "C" },
  { id: "sideBb", shape: "pill", x: 140, y: 234, w: 34, h: 14, label: "B♭" },
  { id: "R1", shape: "hole", cx: 100, cy: 262, r: 14, label: "1" },
  { id: "fs", shape: "dot", cx: 124, cy: 284, r: 7, label: "F♯" },
  { id: "R2", shape: "hole", cx: 100, cy: 302, r: 14, label: "2" },
  { id: "R3", shape: "hole", cx: 100, cy: 342, r: 14, label: "3" },
  { id: "ebR", shape: "pill", x: 132, y: 356, w: 32, h: 14, label: "E♭" },
  { id: "cR", shape: "pill", x: 132, y: 376, w: 32, h: 14, label: "C" }
];

function fingeringSVG(midi, opts) {
  const o = opts || {};
  const keys = o.keys || fingeringFor(midi) || [];
  const on = new Set(keys);
  let body = '<rect class="sax-body" x="76" y="16" width="48" height="380" rx="24"/>' +
    '<rect class="sax-body" x="84" y="396" width="32" height="18" rx="9"/>';
  let parts = "";
  for (const k of KEY_LAYOUT) {
    const cls = "k " + (on.has(k.id) ? "on" : "off");
    if (k.shape === "pill") {
      parts += `<rect class="${cls}" x="${k.x}" y="${k.y}" width="${k.w}" height="${k.h}" rx="${k.h / 2}"/>` +
        `<text class="kl" x="${k.x + k.w / 2}" y="${k.y + k.h / 2 + 3.4}">${k.label}</text>`;
    } else {
      const r = k.r;
      parts += `<circle class="${cls}" cx="${k.cx}" cy="${k.cy}" r="${r}"/>`;
      if (k.shape === "hole") parts += `<text class="kl kl-hole" x="${k.cx}" y="${k.cy + 4.4}">${k.label}</text>`;
      else parts += `<text class="kl kl-sm" x="${k.cx}" y="${k.cy + 2.6}">${k.label}</text>`;
    }
  }
  return `<svg class="fing" viewBox="0 0 192 420" role="img" aria-label="運指図">${body}${parts}</svg>`;
}

/* ===================== 3. 設定と保存 ===================== */

const STORE_KEY = "saxchord.v1";
const DEFAULT_SETTINGS = {
  instrument: "alto",
  // "written": 譜面が移調済み（書かれたコードをそのまま吹く）
  // "concert": 実音（ピアノ譜）で出題され、自分で移調して答える
  chartPitch: "written",
  types: ["maj", "min", "dom7", "maj7", "min7"],
  roots: ROOTS_MAIN.slice(),
  german: false,
  a4: 442,
  autoAdvance: true,
  sound: true
};

let S = loadSettings();
let STATS = loadStats();

function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    return Object.assign({}, DEFAULT_SETTINGS, raw.settings || {});
  } catch (e) { return Object.assign({}, DEFAULT_SETTINGS); }
}
function loadStats() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    return Object.assign({ byType: {}, byRoot: {}, total: 0, correct: 0, best: 0 }, raw.stats || {});
  } catch (e) { return { byType: {}, byRoot: {}, total: 0, correct: 0, best: 0 }; }
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ settings: S, stats: STATS })); } catch (e) {}
}
function inst() { return INSTRUMENTS[S.instrument] || INSTRUMENTS.alto; }

function recordAnswer(typeId, root, ok) {
  const t = STATS.byType[typeId] || (STATS.byType[typeId] = { n: 0, ok: 0 });
  const r = STATS.byRoot[root] || (STATS.byRoot[root] = { n: 0, ok: 0 });
  t.n++; r.n++; STATS.total++;
  if (ok) { t.ok++; r.ok++; STATS.correct++; }
  save();
}
// 苦手なものを出やすくする重み
function weightOf(map, key) {
  const s = map[key];
  if (!s || s.n < 3) return 2.2;            // まだ聞いていないものを優先
  const acc = s.ok / s.n;
  return 0.5 + (1 - acc) * 3.5;
}
function weightedPick(arr, weigh) {
  const w = arr.map(weigh);
  let sum = w.reduce((a, b) => a + b, 0);
  let r = Math.random() * sum;
  for (let i = 0; i < arr.length; i++) { r -= w[i]; if (r <= 0) return arr[i]; }
  return arr[arr.length - 1];
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/* ===================== 4. 音高ユーティリティ ===================== */

// サックスの現場で普通に使う呼び方（C♯・F♯ は♯、E♭・A♭・B♭ は♭）
const PREF_FLAT_PC = new Set([3, 8, 10]);
function commonName(pc) {
  pc = ((pc % 12) + 12) % 12;
  return PREF_FLAT_PC.has(pc) ? FLAT_NAMES[pc] : SHARP_NAMES[pc];
}
function commonLabel(midi) { return commonName(midi) + (Math.floor(midi / 12) - 1); }

function midiToName(midi, preferFlat) {
  const names = preferFlat ? FLAT_NAMES : SHARP_NAMES;
  return names[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}
function midiToFreq(midi) { return S.a4 * Math.pow(2, (midi - 69) / 12); }
function freqToMidi(f) { return 69 + 12 * Math.log2(f / S.a4); }

// 記譜音のピッチクラスから、演奏しやすい音域の midi を選ぶ
function writtenMidiFor(pc, from) {
  const lo = from || 60;
  let m = lo + (((pc - lo) % 12) + 12) % 12;
  if (m > 85) m -= 12;
  if (m < 58) m += 12;
  return m;
}
// コードを下から積んだ記譜 midi 列にする。
// 13th などは 2 オクターブ近く開くので、和音全体が運指表の範囲（低B♭58〜ハイF♯90）に
// 収まる位置にルートを置く。
function voiceChord(tones) {
  const rel = [0];
  for (let i = 1; i < tones.length; i++) {
    let step = ((((tones[i].pc - tones[i - 1].pc) % 12) + 12) % 12);
    if (step === 0) step = 12;
    rel.push(rel[i - 1] + step);
  }
  const span = rel[rel.length - 1];
  const rootPc = (((tones[0].pc % 12) + 12) % 12);
  let root = 60 + (((rootPc - 60) % 12) + 12) % 12;   // 中音域 D4 あたりから始める
  if (root + span > 90) root -= 12;                    // はみ出すならオクターブ下げる
  return rel.map((r) => root + r);
}

// 記譜 midi → 実音 midi
function concertMidi(writtenMidi) { return writtenMidi - inst().octSemi; }

/* ===================== 5. 音を鳴らす ===================== */

let AC = null;
function audioCtx() {
  if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
  if (AC.state === "suspended") AC.resume();
  return AC;
}
// リード楽器っぽい音で 1 音鳴らす（実音で鳴らす）
function tone(freq, at, dur, gain) {
  const ac = audioCtx();
  const t0 = ac.currentTime + at;
  const osc = ac.createOscillator();
  const osc2 = ac.createOscillator();
  const g = ac.createGain();
  const lp = ac.createBiquadFilter();
  osc.type = "sawtooth"; osc2.type = "square";
  osc.frequency.value = freq; osc2.frequency.value = freq * 2.005;
  lp.type = "lowpass"; lp.frequency.value = Math.min(4200, freq * 6); lp.Q.value = 0.7;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.03);
  g.gain.setTargetAtTime(0.0001, t0 + dur * 0.7, 0.12);
  osc.connect(lp); osc2.connect(lp); lp.connect(g); g.connect(ac.destination);
  osc.start(t0); osc2.start(t0); osc.stop(t0 + dur + 0.4); osc2.stop(t0 + dur + 0.4);
}
function playWrittenMidis(midis, opts) {
  if (!S.sound) return;
  const o = opts || {};
  const gap = o.gap == null ? 0.42 : o.gap;
  const dur = o.dur == null ? 0.5 : o.dur;
  midis.forEach((m, i) => tone(midiToFreq(concertMidi(m)), i * gap, dur, 0.16));
  if (o.chord) midis.forEach((m) => tone(midiToFreq(concertMidi(m)), midis.length * gap + 0.15, 1.1, 0.11));
}

/* ===================== 6. マイクでの音程検出 ===================== */

const Mic = {
  ctx: null, stream: null, analyser: null, buf: null, running: false,
  rms: 0, freq: 0, midi: 0, cents: 0, conf: 0, onFrame: null, raf: 0, err: "",

  async start() {
    if (this.running) return true;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      });
    } catch (e) {
      this.err = e && e.name === "NotAllowedError"
        ? "マイクの使用が許可されませんでした。ブラウザの設定で許可してください。"
        : "マイクを開けませんでした（" + (e && e.name) + "）";
      return false;
    }
    const ac = audioCtx();
    this.ctx = ac;
    const src = ac.createMediaStreamSource(this.stream);
    const hp = ac.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = 60;
    this.analyser = ac.createAnalyser();
    this.analyser.fftSize = 4096;
    src.connect(hp); hp.connect(this.analyser);
    this.buf = new Float32Array(this.analyser.fftSize);
    this.running = true;
    this.err = "";
    this.loop();
    return true;
  },
  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null; this.analyser = null;
  },
  loop() {
    if (!this.running) return;
    this.raf = requestAnimationFrame(() => this.loop());
    if (!this.analyser) return;
    this.tick = (this.tick || 0) + 1;
    if (this.tick % 2) return;                     // 解析は 30fps 程度で十分
    this.analyser.getFloatTimeDomainData(this.buf);
    const r = detectPitch(this.buf, this.ctx.sampleRate);
    this.rms = r.rms;
    if (r.freq > 0) {
      this.freq = r.freq; this.conf = r.clarity;
      const m = freqToMidi(r.freq);
      this.midi = Math.round(m);
      this.cents = Math.round((m - this.midi) * 100);
    } else {
      this.conf = 0;
    }
    if (this.onFrame) this.onFrame(r);
  }
};

/* NSDF（McLeod 法の簡易版）による基本周波数推定。
   サックスは倍音が強くオクターブ誤検出しやすいので、自己相関のピークを
   「最大値の 0.85 倍を超える最初のピーク」で選ぶ。 */
function detectPitch(buf, sampleRate) {
  const W = 2048;
  let rms = 0;
  for (let i = 0; i < W; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / W);
  if (rms < 0.012) return { freq: 0, clarity: 0, rms };

  const minLag = Math.max(2, Math.floor(sampleRate / 1400));
  const maxLag = Math.min(W - 8, Math.floor(sampleRate / 55));
  const nsdf = new Float32Array(maxLag + 1);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let acf = 0, m = 0;
    const n = W - lag;
    for (let i = 0; i < n; i++) {
      const a = buf[i], b = buf[i + lag];
      acf += a * b; m += a * a + b * b;
    }
    nsdf[lag] = m > 0 ? (2 * acf) / m : 0;
  }
  // 極大値を拾う
  const peaks = [];
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    if (nsdf[lag] > nsdf[lag - 1] && nsdf[lag] >= nsdf[lag + 1] && nsdf[lag] > 0.3) peaks.push(lag);
  }
  if (!peaks.length) return { freq: 0, clarity: 0, rms };
  let best = peaks[0];
  for (const p of peaks) if (nsdf[p] > nsdf[best]) best = p;
  const thresh = nsdf[best] * 0.85;
  let chosen = best;
  for (const p of peaks) { if (nsdf[p] >= thresh) { chosen = p; break; } }
  // 放物線補間で lag をサブサンプル精度に
  const y1 = nsdf[chosen - 1], y2 = nsdf[chosen], y3 = nsdf[chosen + 1];
  const denom = 2 * (2 * y2 - y1 - y3);
  const shift = denom !== 0 ? (y3 - y1) / denom : 0;
  const lag = chosen + shift;
  const freq = sampleRate / lag;
  if (!isFinite(freq) || freq < 60 || freq > 1500) return { freq: 0, clarity: 0, rms };
  return { freq, clarity: nsdf[chosen], rms };
}

/* ===================== 7. 画面の土台 ===================== */

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
function h(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; }
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

let currentScreen = "home";
function nav(name) {
  if (currentScreen === "play" && name !== "play") stopPlayMode();
  if (currentScreen === "tuner" && name !== "tuner") Mic.stop();
  currentScreen = name;
  $$(".screen").forEach((s) => s.classList.remove("active"));
  const el = document.getElementById("screen-" + name);
  if (el) el.classList.add("active");
  window.scrollTo(0, 0);
  if (name === "settings") renderSettings();
  if (name === "stats") renderStats();
  if (name === "chart") renderChart();
  if (name === "tuner") renderTuner();
}

/* 記譜/実音の呼び分け */
function usesConcertChart() { return S.chartPitch === "concert" && inst().semi !== 0; }
function toWrittenName(name) { return usesConcertChart() ? transposeName(name, inst().semi, inst().step) : name; }
function toConcertName(name) { return usesConcertChart() ? name : transposeName(name, -inst().semi + 12, -inst().step + 7); }

function noteHTML(name, opts) {
  const o = opts || {};
  const simple = simplify(name);
  const sub = S.german ? germanOf(name) : (isMessy(name) ? "＝" + pretty(simple) : "");
  return `<span class="note ${o.cls || ""}">${pretty(name)}${sub ? `<span class="note-sub">${esc(sub)}</span>` : ""}</span>`;
}

/* ===================== 8. 出題 ===================== */

function enabledTypes() {
  const list = CHORD_TYPES.filter((t) => S.types.includes(t.id));
  return list.length ? list : CHORD_TYPES.filter((t) => t.level === 1);
}
function enabledRoots() { return S.roots.length ? S.roots : ROOTS_MAIN.slice(); }

function newChord() {
  const type = weightedPick(enabledTypes(), (t) => weightOf(STATS.byType, t.id));
  const root = weightedPick(enabledRoots(), (r) => weightOf(STATS.byRoot, r));
  return buildChord(root, type);
}

// 表示されるコードから「実際に吹く音（記譜）」を得る
function writtenTones(chord) {
  return chord.tones.map((t) => {
    const name = toWrittenName(t.name);
    return { deg: t.deg, name, pc: nameToPc(name) };
  });
}

const Quiz = {
  mode: "tones", q: null, answered: false, n: 0, ok: 0, streak: 0, selected: new Set(),

  start(mode) {
    this.mode = mode; this.n = 0; this.ok = 0; this.streak = 0;
    nav("quiz");
    this.next();
  },
  next() {
    this.answered = false; this.selected = new Set(); this.picked = null;
    const chord = newChord();
    const wt = writtenTones(chord);
    let q = { chord, wt };
    if (this.mode === "name") q.choices = nameChoices(chord);
    if (this.mode === "degree") q.deg = chord.tones[1 + ((Math.random() * (chord.tones.length - 1)) | 0)].deg;
    if (this.mode === "fingering") {
      q.sub = Math.random() < 0.5 ? "read" : "make";
      q.midi = writtenMidiFor(wt[(Math.random() * wt.length) | 0].pc, 60);
      if (q.sub === "make") q.fchoices = fingeringChoices(q.midi);
    }
    this.q = q;
    renderQuiz();
  },
  judge(ok) {
    this.answered = true; this.n++;
    if (ok) { this.ok++; this.streak++; if (this.streak > (STATS.best || 0)) { STATS.best = this.streak; } }
    else this.streak = 0;
    recordAnswer(this.q.chord.type.id, this.q.chord.root, ok);
    renderQuiz(ok);
    if (S.sound) {
      const midis = voiceChord(this.q.wt);
      playWrittenMidis(ok ? midis : midis.slice(0, 1), { gap: 0.26, dur: 0.34 });
    }
  }
};

function nameChoices(chord) {
  const out = [chord.label];
  const types = enabledTypes();
  const roots = enabledRoots();
  let guard = 0;
  while (out.length < 4 && guard++ < 200) {
    let cand;
    if (Math.random() < 0.6 && types.length > 1) {
      const t = types[(Math.random() * types.length) | 0];
      cand = chord.root + t.suffix;
    } else {
      const r = roots[(Math.random() * roots.length) | 0];
      cand = r + chord.type.suffix;
    }
    if (!out.includes(cand) && !sameTones(cand, chord)) out.push(cand);
  }
  // 選択肢が集まらないとき（設定を絞り込んでいるとき）は 12 キーから埋める
  for (const r of shuffle(ROOTS_MAIN.slice())) {
    if (out.length >= 4) break;
    const cand = r + chord.type.suffix;
    if (!out.includes(cand) && !sameTones(cand, chord)) out.push(cand);
  }
  return shuffle(out);
}
function sameTones(label, chord) {
  const m = /^([A-G](?:#|b)?)(.*)$/.exec(label);
  if (!m) return false;
  const t = CHORD_TYPES.find((x) => x.suffix === m[2]);
  if (!t) return false;
  const a = buildChord(m[1], t).tones.map((x) => x.pc).sort().join();
  const b = chord.tones.map((x) => x.pc).sort().join();
  return a === b;
}
function fingeringChoices(midi) {
  const out = [midi];
  let guard = 0;
  while (out.length < 4 && guard++ < 100) {
    const d = [-3, -2, -1, 1, 2, 3, 5, 7][(Math.random() * 8) | 0];
    const c = midi + d;
    if (c >= 58 && c <= 90 && !out.includes(c) && fingeringFor(c)) out.push(c);
  }
  return shuffle(out);
}

/* ===================== 9. クイズ画面の描画 ===================== */

// 12音ボタンを♭表記で出すか♯表記で出すかは「答えの綴り」に合わせる
function preferFlat(q) {
  const names = q.wt.map((t) => t.name);
  const sharps = names.filter((n) => /#/.test(n)).length;
  const flats = names.filter((n) => /b/.test(n)).length;
  if (sharps !== flats) return flats > sharps;
  return /b/.test(q.chord.root) || ["F", "C"].includes(q.chord.root) || /♭/.test(q.chord.type.suffix);
}

function pcButtonsHTML(flat, selected, disabled, marks) {
  const names = flat ? FLAT_NAMES : SHARP_NAMES;
  const other = flat ? SHARP_NAMES : FLAT_NAMES;
  let out = '<div class="pc-grid">';
  for (let pc = 0; pc < 12; pc++) {
    const alt = other[pc] !== names[pc] ? `<span class="pc-alt">${pretty(other[pc])}</span>` : "";
    let on = selected && selected.has(pc) ? " sel" : "";
    if (marks) on += marks.right.has(pc) ? " right" : marks.wrong.has(pc) ? " wrong" : "";
    out += `<button class="pc-btn${on}" data-pc="${pc}" type="button"${disabled ? " disabled" : ""}>` +
      `<span class="pc-main">${pretty(names[pc])}</span>${alt}` +
      (S.german ? `<span class="pc-ger">${esc(germanOf(names[pc]))}</span>` : "") + "</button>";
  }
  return out + "</div>";
}

function pitchBadge() {
  return usesConcertChart()
    ? '<span class="badge badge-concert">実音（ピアノ譜）</span>'
    : '<span class="badge badge-written">記譜（吹く音）</span>';
}

function fingerCardHTML(wtone, midi) {
  const alt = altFingeringFor(midi);
  const cm = concertMidi(midi);
  return `<div class="fcard">
    <div class="fcard-head">
      <span class="fcard-deg">${esc(degLabel(wtone.deg))}</span>
      <span class="fcard-note">${pretty(wtone.name)}</span>
    </div>
    ${fingeringSVG(midi)}
    <div class="fcard-foot">
      <span>記譜 ${esc(midiToName(midi, /b/.test(wtone.name)))}</span>
      <span class="dim">実音 ${esc(commonLabel(cm))}</span>
    </div>
    ${alt ? `<div class="fcard-alt">別指: ${esc(alt.note)}</div>` : ""}
  </div>`;
}
function degLabel(d) {
  const map = { "1": "R", "b3": "♭3", "3": "3", "b5": "♭5", "5": "5", "#5": "♯5", "6": "6",
    "bb7": "♭♭7", "b7": "♭7", "7": "M7", "4": "4", "9": "9", "b9": "♭9", "#9": "♯9",
    "11": "11", "#11": "♯11", "13": "13", "b13": "♭13", "#2": "♯2", "2": "2" };
  return map[d] || d;
}

function answerPanelHTML(q, ok) {
  const midis = voiceChord(q.wt);
  const cards = q.wt.map((t, i) => fingerCardHTML(t, midis[i])).join("");
  const concertLine = usesConcertChart()
    ? `<div class="ap-line"><span class="ap-key">実音</span>${q.chord.tones.map((t) => noteHTML(t.name)).join('<span class="sep">·</span>')}</div>`
    : "";
  const writtenLine = `<div class="ap-line"><span class="ap-key">${usesConcertChart() ? "あなたが吹く音" : "構成音"}</span>${q.wt.map((t) => `<span class="tone"><span class="tone-deg">${esc(degLabel(t.deg))}</span>${noteHTML(t.name)}</span>`).join("")}</div>`;
  return `<div class="answer-panel ${ok ? "ok" : "ng"}">
    <div class="ap-head">
      <span class="ap-verdict">${ok ? "正解" : "不正解"}</span>
      <span class="ap-chord">${pretty(q.chord.label)}<span class="ap-jp">${esc(q.chord.type.jp)}</span></span>
    </div>
    ${concertLine}${writtenLine}
    <div class="fcards">${cards}</div>
    <div class="ap-actions">
      <button class="btn btn-ghost" id="ap-play" type="button">♪ 鳴らす</button>
      <button class="btn btn-ghost" id="ap-blow" type="button">🎤 これを吹いて確認</button>
      <button class="btn btn-primary" id="ap-next" type="button">次の問題 →</button>
    </div>
  </div>`;
}

// 答え合わせ後、12音ボタンに正解・誤答の色をつける
function pcMarks(q) {
  const right = new Set(), wrong = new Set();
  if (Quiz.mode === "tones") {
    q.wt.forEach((t) => right.add(t.pc));
    Quiz.selected.forEach((pc) => { if (!right.has(pc)) wrong.add(pc); });
  } else if (Quiz.mode === "degree") {
    const t = q.wt.find((x) => x.deg === q.deg);
    if (t) right.add(t.pc);
    Quiz.selected.forEach((pc) => { if (!right.has(pc)) wrong.add(pc); });
  } else if (Quiz.mode === "fingering" && q.sub === "read") {
    right.add(q.midi % 12);
    Quiz.selected.forEach((pc) => { if (!right.has(pc)) wrong.add(pc); });
  }
  return { right, wrong };
}

function renderQuiz(ok) {
  const q = Quiz.q;
  const body = $("#quiz-body");
  const flat = preferFlat(q);
  const marks = Quiz.answered ? pcMarks(q) : null;
  let head = "", input = "";

  if (Quiz.mode === "tones") {
    head = `<div class="qcard">
      <div class="q-label">構成音をすべて選ぶ ${pitchBadge()}</div>
      <div class="q-main">${pretty(q.chord.label)}</div>
      <div class="q-sub">${esc(q.chord.type.jp)}${usesConcertChart() ? " ／ 答えは<b>あなたが吹く音</b>で" : ""}</div>
    </div>`;
    input = pcButtonsHTML(flat, Quiz.selected, Quiz.answered, marks) +
      `<div class="pc-actions"><span class="pc-count" id="pc-count"></span>
       <button class="btn btn-primary" id="pc-check" type="button"${Quiz.answered ? " disabled" : ""}>判定</button></div>`;
  } else if (Quiz.mode === "degree") {
    head = `<div class="qcard">
      <div class="q-label">この度数の音は？ ${pitchBadge()}</div>
      <div class="q-main">${pretty(q.chord.label)}<span class="q-deg">の ${esc(degLabel(q.deg))}</span></div>
      <div class="q-sub">${usesConcertChart() ? "答えは<b>あなたが吹く音</b>で" : "&nbsp;"}</div>
    </div>`;
    input = pcButtonsHTML(flat, Quiz.selected, Quiz.answered, marks);
  } else if (Quiz.mode === "name") {
    const shown = q.wt.map((t) => noteHTML(t.name)).join('<span class="sep">·</span>');
    head = `<div class="qcard">
      <div class="q-label">${usesConcertChart() ? "この音を吹いている。実音のコード名は？" : "このコード名は？"}</div>
      <div class="q-main q-main-notes">${shown}</div>
      <div class="q-sub">${usesConcertChart() ? "表示は記譜（吹く音）" : "&nbsp;"}</div>
    </div>`;
    input = '<div class="choice-grid">' + q.choices.map((c) =>
      `<button class="choice${Quiz.answered ? (c === q.chord.label ? " right" : (Quiz.picked === c ? " wrong" : "")) : ""}" data-choice="${esc(c)}" type="button"${Quiz.answered ? " disabled" : ""}>${pretty(c)}</button>`).join("") + "</div>";
  } else if (Quiz.mode === "fingering") {
    if (q.sub === "read") {
      head = `<div class="qcard">
        <div class="q-label">この運指の音は？（記譜）</div>
        <div class="q-fing">${fingeringSVG(q.midi)}</div>
      </div>`;
      input = pcButtonsHTML(flat, Quiz.selected, Quiz.answered, marks);
    } else {
      const name = (flat ? FLAT_NAMES : SHARP_NAMES)[q.midi % 12];
      head = `<div class="qcard">
        <div class="q-label">この音の運指は？（記譜）</div>
        <div class="q-main">${pretty(name)}<span class="q-oct">${Math.floor(q.midi / 12) - 1}</span></div>
      </div>`;
      input = '<div class="fing-choice">' + q.fchoices.map((m) =>
        `<button class="fchoice${Quiz.answered ? (m === q.midi ? " right" : (Quiz.picked === m ? " wrong" : "")) : ""}" data-fmidi="${m}" type="button"${Quiz.answered ? " disabled" : ""}>${fingeringSVG(m)}</button>`).join("") + "</div>";
    }
  }

  body.innerHTML = head + `<div class="q-input">${input}</div>` +
    (Quiz.answered ? answerPanelHTML(q, ok) : "");
  $("#score-text").textContent = `${Quiz.ok} / ${Quiz.n}`;
  $("#streak-text").textContent = Quiz.streak >= 3 ? `🔥 ${Quiz.streak}連続` : "";
  updatePcCount();
  if (Quiz.answered) {
    const panel = $(".answer-panel");
    if (panel) panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

function updatePcCount() {
  const el = $("#pc-count");
  if (!el || !Quiz.q) return;
  el.textContent = `${Quiz.selected.size} / ${Quiz.q.wt.length} 音`;
}

/* ===================== 10. クイズ画面の操作 ===================== */

$("#quiz-body").addEventListener("click", (e) => {
  const q = Quiz.q;
  if (!q) return;

  const pcBtn = e.target.closest(".pc-btn");
  if (pcBtn && !Quiz.answered) {
    const pc = Number(pcBtn.dataset.pc);
    if (Quiz.mode === "tones") {
      if (Quiz.selected.has(pc)) Quiz.selected.delete(pc); else Quiz.selected.add(pc);
      pcBtn.classList.toggle("sel");
      updatePcCount();
      if (S.sound) tone(midiToFreq(concertMidi(writtenMidiFor(pc, 62))), 0, 0.28, 0.12);
      if (Quiz.selected.size === q.wt.length) checkTones();
    } else {
      Quiz.selected = new Set([pc]);
      Quiz.picked = pc;
      if (Quiz.mode === "degree") {
        const t = q.wt.find((x) => x.deg === q.deg);
        Quiz.judge(!!t && t.pc === pc);
      } else {
        Quiz.judge(pc === q.midi % 12);
      }
    }
    return;
  }
  if (e.target.closest("#pc-check") && !Quiz.answered) { checkTones(); return; }

  const ch = e.target.closest(".choice");
  if (ch && !Quiz.answered) { Quiz.picked = ch.dataset.choice; Quiz.judge(ch.dataset.choice === q.chord.label); return; }

  const fc = e.target.closest(".fchoice");
  if (fc && !Quiz.answered) { const m = Number(fc.dataset.fmidi); Quiz.picked = m; Quiz.judge(m === q.midi); return; }

  if (e.target.closest("#ap-next")) { Quiz.next(); return; }
  if (e.target.closest("#ap-play")) { playWrittenMidis(voiceChord(q.wt), { chord: true }); return; }
  if (e.target.closest("#ap-blow")) { startPlayMode(q.chord); return; }
});

function checkTones() {
  const want = new Set(Quiz.q.wt.map((t) => t.pc));
  let ok = want.size === Quiz.selected.size;
  if (ok) for (const pc of want) if (!Quiz.selected.has(pc)) { ok = false; break; }
  Quiz.judge(ok);
}

document.addEventListener("keydown", (e) => {
  if (currentScreen !== "quiz") return;
  if ((e.key === "Enter" || e.key === " ") && Quiz.answered) { e.preventDefault(); Quiz.next(); }
});

/* ===================== 11. 吹いて答えるモード ===================== */

const Play = {
  chord: null, wt: [], midis: [], idx: 0, done: [], hold: 0, n: 0, ok: 0,
  order: "up", listening: false, lastMsg: ""
};

function startPlayMode(chord) {
  Play.chord = chord || newChord();
  Play.wt = writtenTones(Play.chord);
  Play.midis = voiceChord(Play.wt);
  if (Play.order === "random") {
    const idx = shuffle(Play.wt.map((_, i) => i));
    Play.wt = idx.map((i) => Play.wt[i]);
    Play.midis = idx.map((i) => Play.midis[i]);
  }
  Play.idx = 0; Play.done = Play.wt.map(() => false); Play.hold = 0;
  nav("play");
  renderPlay();
  ensureMic();
}

function stopPlayMode() { Mic.onFrame = null; Mic.stop(); Play.listening = false; }

async function ensureMic() {
  const okMic = await Mic.start();
  Play.listening = okMic;
  if (!okMic) { renderPlay(); return; }
  Mic.onFrame = onPlayFrame;
  renderPlay();
}

function onPlayFrame(r) {
  if (currentScreen !== "play") return;
  const targetMidi = Play.midis[Play.idx];
  if (targetMidi == null) return;
  const targetPc = ((concertMidi(targetMidi) % 12) + 12) % 12;

  const live = $("#play-live");
  const heard = r.freq > 0 && r.clarity > 0.62;
  if (live) {
    if (!heard) {
      live.className = "play-live idle";
      live.innerHTML = `<span class="pl-note">—</span><span class="pl-hint">吹いてください</span>`;
    } else {
      const pc = ((Mic.midi % 12) + 12) % 12;
      const hit = pc === targetPc;
      live.className = "play-live " + (hit ? "hit" : "miss");
      live.innerHTML = `<span class="pl-note">${pretty(commonName(pc))}<span class="pl-oct">${Math.floor(Mic.midi / 12) - 1}</span></span>` +
        `<span class="pl-cents ${Math.abs(Mic.cents) <= 15 ? "in" : ""}">${Mic.cents > 0 ? "+" : ""}${Mic.cents}¢</span>` +
        `<span class="pl-hint">${hit ? "その音！" : "実音 " + pretty(commonName(targetPc)) + " を狙う"}</span>`;
    }
    const bar = $("#play-meter-fill");
    if (bar) bar.style.width = Math.min(100, Math.round(Mic.rms * 900)) + "%";
    const needle = $("#play-needle");
    if (needle && heard) needle.style.transform = `translateX(${Math.max(-50, Math.min(50, Mic.cents))}px)`;
  }

  if (heard && ((Mic.midi % 12) + 12) % 12 === targetPc && Math.abs(Mic.cents) <= 45 && r.rms > 0.014) {
    Play.hold++;
  } else if (Play.hold > 0) {
    Play.hold = Math.max(0, Play.hold - 1);
  }
  if (Play.hold >= 5) {
    Play.hold = 0;
    Play.done[Play.idx] = true;
    Play.n++; Play.ok++;
    if (S.sound) tone(1320, 0, 0.09, 0.06);
    Play.idx++;
    if (Play.idx >= Play.wt.length) {
      recordAnswer(Play.chord.type.id, Play.chord.root, true);
      renderPlay(true);
      setTimeout(() => { if (currentScreen === "play") startPlayMode(newChord()); }, 1600);
    } else {
      renderPlay();
    }
  }
}

function renderPlay(cleared) {
  const body = $("#play-body");
  if (!Play.chord) { body.innerHTML = ""; return; }
  const chips = Play.wt.map((t, i) => {
    const st = Play.done[i] ? "done" : i === Play.idx ? "now" : "todo";
    return `<span class="pchip ${st}"><span class="pchip-deg">${esc(degLabel(t.deg))}</span>${pretty(t.name)}</span>`;
  }).join("");
  const i = Math.min(Play.idx, Play.wt.length - 1);
  const cur = Play.wt[i], curMidi = Play.midis[i];

  body.innerHTML = `
    <div class="qcard">
      <div class="q-label">この音を順番に吹く ${pitchBadge()}</div>
      <div class="q-main">${pretty(Play.chord.label)}</div>
      <div class="pchips">${chips}</div>
    </div>
    ${cleared ? '<div class="play-cleared">全部吹けました 🎉</div>' : ""}
    <div class="play-target">
      <div class="pt-left">
        <div class="pt-deg">${esc(degLabel(cur.deg))}</div>
        <div class="pt-note">${pretty(cur.name)}</div>
        <div class="pt-sub">記譜 ${esc(midiToName(curMidi, /b/.test(cur.name)))} ／ 実音 ${esc(commonLabel(concertMidi(curMidi)))}</div>
        ${S.german ? `<div class="pt-ger">${esc(germanOf(cur.name))}</div>` : ""}
      </div>
      <div class="pt-right">${fingeringSVG(curMidi)}</div>
    </div>
    ${Play.listening ? `
      <div class="play-live idle" id="play-live"><span class="pl-note">—</span><span class="pl-hint">吹いてください</span></div>
      <div class="tuner-scale"><div class="tuner-center"></div><div class="tuner-needle" id="play-needle"></div></div>
      <div class="play-meter"><div class="play-meter-fill" id="play-meter-fill"></div></div>
    ` : `
      <div class="mic-off">
        <p>${esc(Mic.err || "マイクを使うと、吹いた音を自動で判定します。")}</p>
        <button class="btn btn-primary" id="play-mic-on" type="button">マイクを使う</button>
      </div>
    `}
    <div class="play-actions">
      <button class="btn btn-ghost" id="play-listen" type="button">♪ お手本</button>
      <button class="btn btn-ghost" id="play-skip" type="button">この音をとばす</button>
      <button class="btn btn-ghost" id="play-order" type="button">${Play.order === "up" ? "順番：上行" : "順番：ランダム"}</button>
      <button class="btn btn-primary" id="play-next" type="button">次のコード →</button>
    </div>`;
  $("#play-score-text").textContent = `${Play.ok} 音クリア`;
}

$("#play-body").addEventListener("click", (e) => {
  if (e.target.closest("#play-mic-on")) { ensureMic(); return; }
  if (e.target.closest("#play-listen")) { playWrittenMidis([Play.midis[Math.min(Play.idx, Play.midis.length - 1)]], { dur: 0.9 }); return; }
  if (e.target.closest("#play-skip")) {
    Play.idx = Math.min(Play.idx + 1, Play.wt.length);
    if (Play.idx >= Play.wt.length) startPlayMode(newChord()); else renderPlay();
    return;
  }
  if (e.target.closest("#play-order")) {
    Play.order = Play.order === "up" ? "random" : "up";
    startPlayMode(Play.chord); return;
  }
  if (e.target.closest("#play-next")) { startPlayMode(newChord()); return; }
});

/* ===================== 12. 運指表 ===================== */

const CHART_SECTIONS = [
  { from: 58, to: 61, title: "低音域", desc: "小指のテーブルキー" },
  { from: 62, to: 73, title: "中音域（オクターブキーなし）", desc: "ここが運指の基本形" },
  { from: 74, to: 85, title: "オクターブキーつき", desc: "中音域と同じ指＋オクターブキー" },
  { from: 86, to: 90, title: "高音域（パームキー）", desc: "左手のひらで押す 3 つのキー" }
];
function renderChart() {
  const wrap = $("#chart-wrap");
  let cells = "";
  for (let m = 58; m <= 90; m++) {
    const sec = CHART_SECTIONS.find((x) => x.from === m);
    if (sec) cells += `</div><h3 class="sec-title">${esc(sec.title)}<em> ${esc(sec.desc)}</em></h3><div class="chart-grid">`;
    const name = commonName(m);
    const alt = altFingeringFor(m);
    cells += `<div class="chart-cell" data-midi="${m}">
      <div class="chart-name">${pretty(name)}<span class="chart-oct">${Math.floor(m / 12) - 1}</span></div>
      ${fingeringSVG(m)}
      <div class="chart-sub">実音 ${esc(commonLabel(concertMidi(m)))}</div>
      ${alt ? `<div class="chart-alt">別指あり</div>` : ""}
    </div>`;
  }
  wrap.innerHTML = `<p class="chart-lead">${esc(inst().jp)}の記譜音（低い B♭ 〜 ハイ F♯）。タップで実音が鳴ります。<br>
    塗りつぶし＝押さえるキー。左の縦列は上からパームキー F / E♭ / D とオクターブキー、右の縦列はサイドキーです。</p>
    <div class="chart-grid">${cells}</div>`.replace('<div class="chart-grid"></div>', "");
}
$("#chart-wrap").addEventListener("click", (e) => {
  const c = e.target.closest(".chart-cell");
  if (c) playWrittenMidis([Number(c.dataset.midi)], { dur: 0.8 });
});

/* ===================== 13. チューナー / 音当て ===================== */

function renderTuner() {
  const wrap = $("#tuner-wrap");
  wrap.innerHTML = `
    <div class="tuner-card">
      <div class="tuner-note" id="tuner-note">—</div>
      <div class="tuner-cents" id="tuner-cents">マイクを許可してください</div>
      <div class="tuner-scale"><div class="tuner-center"></div><div class="tuner-needle" id="tuner-needle"></div></div>
      <div class="play-meter"><div class="play-meter-fill" id="tuner-meter"></div></div>
    </div>
    <div class="tuner-fing" id="tuner-fing"></div>
    <p class="chart-lead">吹いた音の<b>実音</b>を表示し、${esc(inst().jp)}での<b>記譜音と運指</b>を並べます。基準 A = ${S.a4}Hz（設定で変更）。</p>`;
  Mic.start().then((ok) => {
    if (!ok) { $("#tuner-cents").textContent = Mic.err; return; }
    Mic.onFrame = onTunerFrame;
  });
}
function onTunerFrame(r) {
  if (currentScreen !== "tuner") return;
  const note = $("#tuner-note"), cents = $("#tuner-cents"), needle = $("#tuner-needle"),
    meter = $("#tuner-meter"), fing = $("#tuner-fing");
  if (!note) return;
  if (meter) meter.style.width = Math.min(100, Math.round(r.rms * 900)) + "%";
  if (!(r.freq > 0 && r.clarity > 0.62)) {
    note.textContent = "—"; note.className = "tuner-note";
    cents.textContent = "吹いてください";
    return;
  }
  const pc = ((Mic.midi % 12) + 12) % 12;
  note.innerHTML = pretty(commonName(pc)) + `<span class="tn-oct">${Math.floor(Mic.midi / 12) - 1}</span>`;
  note.className = "tuner-note " + (Math.abs(Mic.cents) <= 10 ? "in" : "out");
  cents.textContent = `${Mic.cents > 0 ? "+" : ""}${Mic.cents} ¢ ／ ${Mic.freq.toFixed(1)} Hz（実音）`;
  needle.style.transform = `translateX(${Math.max(-50, Math.min(50, Mic.cents))}px)`;
  const written = Mic.midi + inst().octSemi;
  const wName = commonName(written);
  const shown = Math.max(58, Math.min(90, writtenMidiFor(((written % 12) + 12) % 12, 60)));
  fing.innerHTML = `<div class="fcard">
      <div class="fcard-head"><span class="fcard-deg">記譜</span><span class="fcard-note">${pretty(wName)}</span></div>
      ${fingeringSVG(shown)}
      <div class="fcard-foot"><span>この運指の音です</span></div>
    </div>`;
}

/* ===================== 14. 成績 ===================== */

function renderStats() {
  const wrap = $("#stats-wrap");
  const acc = STATS.total ? Math.round((STATS.correct / STATS.total) * 100) : 0;
  const rows = CHORD_TYPES.filter((t) => STATS.byType[t.id] && STATS.byType[t.id].n)
    .map((t) => {
      const s = STATS.byType[t.id];
      const a = Math.round((s.ok / s.n) * 100);
      return { t, a, n: s.n };
    }).sort((x, y) => x.a - y.a);
  const rootRows = enabledRoots().map((r) => {
    const s = STATS.byRoot[r] || { n: 0, ok: 0 };
    return { r, a: s.n ? Math.round((s.ok / s.n) * 100) : null, n: s.n };
  }).sort((x, y) => (x.a === null ? 999 : x.a) - (y.a === null ? 999 : y.a));

  wrap.innerHTML = `
    <div class="stat-top">
      <div class="stat-big"><b>${acc}</b><span>%</span><em>正答率</em></div>
      <div class="stat-big"><b>${STATS.total}</b><em>問</em></div>
      <div class="stat-big"><b>${STATS.best || 0}</b><em>最高連続</em></div>
    </div>
    <h3 class="sec-title">コード別（下ほど苦手 → 出題が増えます）</h3>
    ${rows.length ? rows.map((x) => `
      <div class="bar-row"><span class="bar-label">${pretty(x.t.suffix || "major")}<em>${esc(x.t.jp)}</em></span>
      <span class="bar"><span class="bar-fill" style="width:${x.a}%"></span></span>
      <span class="bar-num">${x.a}%<em>${x.n}問</em></span></div>`).join("")
      : '<p class="dim">まだデータがありません。</p>'}
    <h3 class="sec-title">ルート別</h3>
    <div class="root-grid">${rootRows.map((x) => `<span class="root-pill ${x.a === null ? "none" : x.a < 70 ? "weak" : "good"}">${pretty(x.r)}<em>${x.a === null ? "—" : x.a + "%"}</em></span>`).join("")}</div>
    <button class="btn btn-ghost danger" id="stats-reset" type="button">成績を消す</button>`;
}
$("#stats-wrap").addEventListener("click", (e) => {
  if (e.target.closest("#stats-reset")) {
    if (confirm("成績を消しますか？")) { STATS = { byType: {}, byRoot: {}, total: 0, correct: 0, best: 0 }; save(); renderStats(); }
  }
});

/* ===================== 15. 設定 ===================== */

function renderSettings() {
  const wrap = $("#settings-wrap");
  const instBtns = Object.values(INSTRUMENTS).map((i) =>
    `<button class="seg ${S.instrument === i.id ? "on" : ""}" data-inst="${i.id}" type="button">${esc(i.jp)}</button>`).join("");
  const typeGroup = (lv, title, desc) => `
    <div class="type-group">
      <div class="type-head"><span>${esc(title)}<em>${esc(desc)}</em></span>
        <span class="type-btns">
          <button class="mini" data-lvon="${lv}" type="button">全部入れる</button>
          <button class="mini" data-lvoff="${lv}" type="button">外す</button>
        </span></div>
      <div class="chk-grid">${CHORD_TYPES.filter((t) => t.level === lv).map((t) =>
        `<label class="chk ${S.types.includes(t.id) ? "on" : ""}"><input type="checkbox" data-type="${t.id}" ${S.types.includes(t.id) ? "checked" : ""}>
          <span class="chk-name">${pretty(t.suffix || "（メジャー）")}</span><span class="chk-jp">${esc(t.jp)}</span></label>`).join("")}</div>
    </div>`;

  wrap.innerHTML = `
    <h3 class="sec-title">楽器</h3>
    <div class="seg-row">${instBtns}</div>
    <p class="dim small">記譜（あなたの譜面）は実音より ${inst().semi ? "＋" + inst().semi + " 半音" : "同じ"}。運指図はつねに記譜で表示します。</p>

    <h3 class="sec-title">出題するコードの書かれ方</h3>
    <div class="seg-row">
      <button class="seg ${S.chartPitch === "written" ? "on" : ""}" data-pitch="written" type="button">記譜（移調済みの譜面）</button>
      <button class="seg ${S.chartPitch === "concert" ? "on" : ""}" data-pitch="concert" type="button">実音（ピアノ譜・原曲キー）</button>
    </div>
    <p class="dim small">実音を選ぶと「実音 C△7 を吹くなら、自分の譜面では A△7」という移調の訓練になります。セッションでピアノの譜面を渡されたとき用。</p>

    <h3 class="sec-title">出題するコード</h3>
    ${typeGroup(1, "レベル1", "まずここから。三和音とセブンス")}
    ${typeGroup(2, "レベル2", "II-V-I とブルースが回る")}
    ${typeGroup(3, "レベル3", "テンション")}

    <h3 class="sec-title">ルート</h3>
    <div class="chk-grid chk-grid-root">
      ${ROOTS_MAIN.concat(ROOTS_EXTRA).map((r) =>
        `<label class="chk ${S.roots.includes(r) ? "on" : ""}"><input type="checkbox" data-root="${esc(r)}" ${S.roots.includes(r) ? "checked" : ""}><span class="chk-name">${pretty(r)}</span></label>`).join("")}
    </div>
    <div class="seg-row">
      <button class="mini" id="roots-all" type="button">12キー全部</button>
      <button class="mini" id="roots-flat" type="button">♭系だけ（管楽器に多い）</button>
    </div>

    <h3 class="sec-title">その他</h3>
    <label class="toggle"><input type="checkbox" id="set-german" ${S.german ? "checked" : ""}><span>ドイツ音名のカタカナを併記（ツェー / エス …）</span></label>
    <label class="toggle"><input type="checkbox" id="set-sound" ${S.sound ? "checked" : ""}><span>音を鳴らす</span></label>
    <label class="toggle toggle-num"><span>基準ピッチ A =</span>
      <input type="number" id="set-a4" min="392" max="466" step="1" value="${S.a4}"><span>Hz</span></label>
    <p class="dim small">吹奏楽・ジャズの現場では 442Hz が多め。マイク判定の精度に効きます。</p>
    <button class="btn btn-ghost danger" id="set-reset" type="button">設定を初期化</button>`;
}

$("#settings-wrap").addEventListener("click", (e) => {
  const i = e.target.closest("[data-inst]");
  if (i) { S.instrument = i.dataset.inst; save(); renderSettings(); updateBadge(); return; }
  const p = e.target.closest("[data-pitch]");
  if (p) { S.chartPitch = p.dataset.pitch; save(); renderSettings(); updateBadge(); return; }
  const on = e.target.closest("[data-lvon]");
  if (on) {
    const lv = Number(on.dataset.lvon);
    CHORD_TYPES.filter((t) => t.level === lv).forEach((t) => { if (!S.types.includes(t.id)) S.types.push(t.id); });
    save(); renderSettings(); return;
  }
  const off = e.target.closest("[data-lvoff]");
  if (off) {
    const lv = Number(off.dataset.lvoff);
    S.types = S.types.filter((id) => TYPE_BY_ID[id] && TYPE_BY_ID[id].level !== lv);
    if (!S.types.length) S.types = ["maj7", "dom7", "min7"];
    save(); renderSettings(); return;
  }
  if (e.target.closest("#roots-all")) { S.roots = ROOTS_MAIN.slice(); save(); renderSettings(); return; }
  if (e.target.closest("#roots-flat")) { S.roots = ["C", "Db", "Eb", "F", "Gb", "Ab", "Bb", "D", "G", "A"]; save(); renderSettings(); return; }
  if (e.target.closest("#set-reset")) {
    if (confirm("設定を初期状態に戻しますか？")) { S = Object.assign({}, DEFAULT_SETTINGS); save(); renderSettings(); updateBadge(); }
  }
});
$("#settings-wrap").addEventListener("change", (e) => {
  const t = e.target;
  if (t.dataset && t.dataset.type) {
    if (t.checked) { if (!S.types.includes(t.dataset.type)) S.types.push(t.dataset.type); }
    else S.types = S.types.filter((x) => x !== t.dataset.type);
    if (!S.types.length) { S.types = [t.dataset.type]; t.checked = true; }
    t.closest(".chk").classList.toggle("on", t.checked);
    save(); return;
  }
  if (t.dataset && t.dataset.root) {
    if (t.checked) { if (!S.roots.includes(t.dataset.root)) S.roots.push(t.dataset.root); }
    else S.roots = S.roots.filter((x) => x !== t.dataset.root);
    if (!S.roots.length) { S.roots = [t.dataset.root]; t.checked = true; }
    t.closest(".chk").classList.toggle("on", t.checked);
    save(); return;
  }
  if (t.id === "set-german") { S.german = t.checked; save(); return; }
  if (t.id === "set-sound") { S.sound = t.checked; save(); return; }
  if (t.id === "set-a4") { const v = Number(t.value); if (v >= 392 && v <= 466) { S.a4 = v; save(); } return; }
});

/* ===================== 16. 起動 ===================== */

function updateBadge() {
  $("#inst-badge").textContent = inst().jp;
  const note = $("#home-note");
  if (note) {
    note.innerHTML = usesConcertChart()
      ? `いまは<b>実音で出題</b>。${esc(inst().jp)}なので、実音 C のコードは <b>${pretty(transposeName("C", inst().semi, inst().step))}</b> として吹きます。`
      : `いまは<b>記譜で出題</b>（譜面に書かれたまま吹く）。${esc(inst().jp)}の記譜 C は実音 <b>${pretty(transposeName("C", -inst().semi + 12, -inst().step + 7))}</b>。`;
  }
}

document.addEventListener("click", (e) => {
  const n = e.target.closest("[data-nav]");
  if (n) { nav(n.dataset.nav); return; }
  const m = e.target.closest("[data-mode]");
  if (m) {
    audioCtx();                       // ユーザー操作のうちに AudioContext を起こす
    if (m.dataset.mode === "play") startPlayMode(newChord());
    else Quiz.start(m.dataset.mode);
  }
});

updateBadge();
nav("home");

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

// デバッグ・テスト用に主要関数を公開する
window.__TYPES = CHORD_TYPES;
window.SaxChord = { __svg: fingeringSVG, buildChord, fingeringFor, transposeName, spell, detectPitch, voiceChord, S: () => S, Quiz, Play };
})();
