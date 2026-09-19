"use strict";

/* 出す物はすべて Shadow DOM の中で作る。ページ側の リセットCSS や !important に
   崩されず、こちらの見た目もページに漏れないため。差し込むだけの軽い作りに
   して、読んでいるページの邪魔をしない */

const HOST_ID = "engoloyd-select-to-ja";

/* 長い範囲を選ぶと、待ち時間も料金も跳ね上がる。段落いくつか分は通したいので
   少し余裕を持たせた上限 */
const MAX_CHARS = 1200;

/* 選び直している最中に投げてしまわないための間。指を離してすぐ次の範囲へ
   移る人がいるので、ひと呼吸だけ待ってから頼む */
const SEND_DELAY_MS = 150;

const BUBBLE_CSS = `
.bubble{
  position:fixed; top:0; left:0;
  box-sizing:border-box;
  width:max-content; min-width:150px;
  padding:10px 12px 8px;
  border:1px solid #D6DBCF; border-radius:12px;
  background:#FFFFFF; color:#17211C;
  font-family:"Hiragino Sans","Noto Sans JP","Yu Gothic UI","Meiryo",system-ui,sans-serif;
  font-size:14px; line-height:1.7; text-align:left;
  box-shadow:0 1px 2px rgba(23,33,28,.06), 0 10px 28px rgba(23,33,28,.18);
  pointer-events:auto;
  animation:pop .12s ease-out;
}
.bubble[hidden]{display:none;}
.head{display:flex; align-items:flex-start; gap:8px;}
.src{
  flex:1; min-width:0;
  font-size:11.5px; line-height:1.5; color:#7C897E;
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
  word-break:break-word;
}
.x{
  flex:none; width:20px; height:20px; margin:-2px -4px 0 0; padding:0;
  border:0; border-radius:6px; background:transparent;
  color:#7C897E; font-size:15px; line-height:1; cursor:pointer;
}
.x:hover{background:#E7EBE2; color:#17211C;}
.body{
  margin-top:3px; font-size:15px; line-height:1.75;
  white-space:pre-wrap; word-break:break-word;
  max-height:40vh; overflow:auto;
  user-select:text; -moz-user-select:text;
}
.body.err{font-size:13.5px; color:#C74B3F;}
.body.wait{color:#7C897E;}
.foot{display:flex; flex-wrap:wrap; align-items:center; gap:6px; row-gap:6px; margin-top:8px;}
.foot[hidden]{display:none;}
.act{
  flex:none; padding:3px 10px;
  border:1px solid #D6DBCF; border-radius:999px; background:transparent;
  color:#1F6F63; font:inherit; font-size:12px; line-height:1.6; cursor:pointer;
}
.act:hover{background:#E7EBE2;}
.act[hidden]{display:none;}
.note{margin-left:auto; font-size:11px; color:#7C897E; white-space:nowrap;}
.dots i{
  display:inline-block; width:5px; height:5px; margin-right:3px;
  border-radius:50%; background:currentColor; opacity:.3;
  animation:blink 1s infinite;
}
.dots i:nth-child(2){animation-delay:.15s;}
.dots i:nth-child(3){animation-delay:.3s;}
@keyframes pop{from{opacity:0; transform:translateY(-4px) scale(.98);} to{opacity:1; transform:none;}}
@keyframes blink{0%,100%{opacity:.25;} 50%{opacity:.9;}}
@media (prefers-reduced-motion: reduce){
  .bubble{animation:none;}
  .dots i{animation:none; opacity:.5;}
}
@media (prefers-color-scheme: dark){
  .bubble{
    background:#182019; color:#ECF1E8; border-color:#2A342A;
    box-shadow:0 1px 2px rgba(0,0,0,.35), 0 10px 28px rgba(0,0,0,.5);
  }
  .src,.note,.x,.body.wait{color:#7E8B80;}
  .x:hover{background:#202A21; color:#ECF1E8;}
  .act{color:#4FBFA8; border-color:#2A342A;}
  .act:hover{background:#202A21;}
  .body.err{color:#E27B70;}
}
`;

/* innerHTML は使わない。差し込むのは決め打ちの文字列だけとはいえ、拡張機能では
   まず疑われる書き方なので、要素を組み立てて渡す */
function make(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "role" || key.startsWith("aria-")) node.setAttribute(key, value);
    else node[key] = value;
  }
  node.append(...children);
  return node;
}

function buildBubble() {
  const parts = {
    src: make("div", { className: "src" }),
    x: make("button", { className: "x", type: "button", title: "閉じる", textContent: "×", "aria-label": "閉じる" }),
    body: make("div", { className: "body" }),
    ask: make("button", { className: "act ask", type: "button", textContent: "訳す", hidden: true }),
    engoloyd: make("button", {
      className: "act engoloyd", type: "button", textContent: "EnGoloydで開く",
      title: "EnGoloyd で接辞に分解して覚える", hidden: true,
    }),
    settings: make("button", { className: "act settings", type: "button", textContent: "設定を開く", hidden: true }),
    note: make("span", { className: "note" }),
  };
  parts.foot = make("div", { className: "foot" }, parts.ask, parts.engoloyd, parts.settings, parts.note);
  parts.bubble = make(
    "div",
    { className: "bubble", role: "status", "aria-live": "polite", hidden: true },
    make("div", { className: "head" }, parts.src, parts.x),
    parts.body,
    parts.foot
  );
  return parts;
}

let settings = { ...SETTINGS_DEFAULTS };
let host = null;
let ui = null;
/* 吹き出しを貼り付けている相手。座標ではなく「範囲」を覚えておくと、
   ページをスクロールしても文に付いて回れる */
let anchor = null;
let shownText = "";
/* 選んだのが英単語一語のときだけ、その語。EnGoloyd へ渡せる形に整えてある */
let shownWord = "";
let translation = "";
/* 選び直した後に古い応答が返ってきて、新しい吹き出しを上書きするのを防ぐ */
let seq = 0;
/* 「設定を開く」を出すかどうか。鍵が無い・弾かれた類の失敗だけに出す */
let showSettingsFlag = false;
let placeQueued = false;
/* いま出ている吹き出しが、選んで出した物か、カーソルを合わせて出た物か。
   合わせて出た物だけ、離れたときに引っ込める */
let hoverSource = false;
let hoverTimer = null;
let hoverLeaveTimer = null;
let hoverPoint = null;

loadSettings().then((saved) => {
  settings = saved;
});

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  for (const [key, change] of Object.entries(changes)) settings[key] = change.newValue;
  if (!settings.enabled) hide();
  /* 合わせて出す方を切ったのに、出たままなのは気味が悪い */
  if (!settings.hover && hoverSource) hide();
});

/* ------------------------------------------------------------------ *
 * 影の中の組み立て
 * ------------------------------------------------------------------ */
function ensureUI() {
  if (ui && host && host.isConnected) return ui;
  if (ui && host) {
    /* 画面を作り替える類のページでは body ごと差し替えられて消える */
    (document.body || document.documentElement).appendChild(host);
    return ui;
  }

  host = document.createElement("div");
  host.id = HOST_ID;
  /* 影の中は守られるが、host そのものはページのCSSに晒される。位置と重なり順
     だけは後から勝てないように !important で押さえる。大きさを持たせないので
     ページの見た目には触らない */
  const fixed = {
    position: "fixed", top: "0", left: "0", width: "0", height: "0",
    margin: "0", padding: "0", border: "0",
    "z-index": "2147483647", "pointer-events": "none", "color-scheme": "light dark",
  };
  for (const [prop, value] of Object.entries(fixed)) host.style.setProperty(prop, value, "important");

  /* closed にしておくと、ページ側のスクリプトから中を触られない */
  const root = host.attachShadow({ mode: "closed" });
  ui = buildBubble();
  root.append(make("style", { textContent: BUBBLE_CSS }), ui.bubble);
  (document.body || document.documentElement).appendChild(host);

  const bubble = ui.bubble;

  /* 吹き出しの上での操作はページに流さない。押した拍子にページ側のメニューが
     閉じたり、リンクが開いたりするのを避ける */
  for (const type of ["mousedown", "mouseup", "click", "dblclick"]) {
    bubble.addEventListener(type, (e) => e.stopPropagation());
  }

  ui.x.addEventListener("click", hide);
  ui.ask.addEventListener("click", () => startTranslate(shownText));
  ui.settings.addEventListener("click", () => {
    browser.runtime.sendMessage({ type: "open-options" });
    hide();
  });
  ui.engoloyd.addEventListener("click", () => {
    const word = shownWord;
    hide();
    browser.runtime.sendMessage({ type: "open-engoloyd", word });
  });

  return ui;
}

/* ------------------------------------------------------------------ *
 * 選んだ文を読む
 * ------------------------------------------------------------------ */
function readSelection(target) {
  /* input / textarea の中の選択は window.getSelection() には出てこない。
     value を直に読む。文字単位の座標は取れないので、位置は入力欄そのもので
     代用する */
  const field = target && target.closest ? target.closest("input, textarea") : null;
  if (field && typeof field.selectionStart === "number" && field.selectionStart !== field.selectionEnd) {
    const text = String(field.value || "").slice(field.selectionStart, field.selectionEnd);
    return { text, rectOf: () => field.getBoundingClientRect() };
  }

  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const text = selection.toString();
  if (!text.trim()) return null;
  const range = selection.getRangeAt(0).cloneRange();
  return { text, rectOf: () => range.getBoundingClientRect() };
}

/* 英単語を一語だけ選んだときは、本体アプリで覚える方へも行けるようにする。
   「library.」のように句読点ごと選んでも拾えるよう端を削り、EnGoloyd が
   受け取れる形（英字とアポストロフィ・ハイフンだけ）に合うものだけ返す */
function wordOf(text) {
  const bare = text.replace(/^[^A-Za-z]+/, "").replace(/[^A-Za-z]+$/, "");
  return /^[A-Za-z][A-Za-z'-]*$/.test(bare) ? bare : "";
}

/* 押しただけ・記号だけ・元から日本語、で吹き出しが出ると邪魔でしかない */
function looksTranslatable(text) {
  const letters = (text.match(/[A-Za-z]/g) || []).length;
  /* 一文字の選択はほぼ誤操作。二文字から相手にする */
  if (letters < 2) return false;
  const japanese = (text.match(/[\u3040-\u30ff\u3400-\u9fff\uff66-\uff9d]/g) || []).length;
  if (japanese > letters) return false;
  return true;
}

/* ------------------------------------------------------------------ *
 * 置き場所
 * ------------------------------------------------------------------ */
function currentRect() {
  if (!anchor) return null;
  let rect = null;
  try {
    rect = anchor.rectOf();
  } catch {
    /* 選択元のノードがページの書き換えで消えると範囲も無効になる */
    return null;
  }
  if (!rect || (!rect.width && !rect.height)) return null;
  const vh = window.innerHeight;
  /* 貼り付けた文が画面の外まで流れたら、吹き出しだけ残っても意味がない */
  if (rect.bottom < -40 || rect.top > vh + 40) return null;
  return rect;
}

function place() {
  const rect = currentRect();
  if (!rect) {
    hide();
    return;
  }
  const bubble = ui.bubble;
  const vw = document.documentElement.clientWidth || window.innerWidth;
  const vh = window.innerHeight;
  bubble.style.maxWidth = `${Math.max(200, Math.min(380, vw - 16))}px`;

  const bw = bubble.offsetWidth;
  const bh = bubble.offsetHeight;
  const left = Math.min(Math.max(8, rect.left + rect.width / 2 - bw / 2), Math.max(8, vw - bw - 8));

  /* まず選んだ文の下。入らなければ上。どちらも入らないほど狭いときは、
     とにかく画面の中に収める（訳が読めないよりはまし） */
  let top = rect.bottom + 10;
  if (top + bh > vh - 8) {
    const above = rect.top - bh - 10;
    top = above >= 8 ? above : Math.max(8, vh - bh - 8);
  }

  bubble.style.left = `${Math.round(left)}px`;
  bubble.style.top = `${Math.round(top)}px`;
}

function queuePlace() {
  if (placeQueued || !ui || ui.bubble.hidden) return;
  placeQueued = true;
  requestAnimationFrame(() => {
    placeQueued = false;
    if (ui && !ui.bubble.hidden) place();
  });
}

/* ------------------------------------------------------------------ *
 * 吹き出しの中身
 * ------------------------------------------------------------------ */
function render({ kind, message = "", note = "" }) {
  ensureUI();
  ui.src.textContent = shownText;
  ui.note.textContent = note;
  ui.body.classList.toggle("err", kind === "error");
  ui.body.classList.toggle("wait", kind === "loading" || kind === "ask");

  if (kind === "loading") {
    ui.body.replaceChildren(
      make("span", { className: "dots" }, make("i"), make("i"), make("i")),
      document.createTextNode("訳しています")
    );
  } else {
    ui.body.textContent = kind === "ok" ? translation : message;
  }

  ui.ask.hidden = kind !== "ask";
  /* 訳が出せなかったときでも、単語なら本体アプリへは行ける */
  ui.engoloyd.hidden = !shownWord;
  ui.settings.hidden = !(kind === "error" && showSettingsFlag);
  ui.foot.hidden = ui.ask.hidden && ui.engoloyd.hidden && ui.settings.hidden && !note;

  ui.bubble.hidden = false;
  place();
  /* 文字が回り込んで高さが変わることがあるので、描かれた後にもう一度合わせる */
  requestAnimationFrame(place);
}

function hide() {
  seq += 1;
  anchor = null;
  shownText = "";
  shownWord = "";
  translation = "";
  hoverSource = false;
  clearHoverTimers();
  hoverPoint = null;
  if (ui) ui.bubble.hidden = true;
}

/* ------------------------------------------------------------------ *
 * 訳を頼む
 * ------------------------------------------------------------------ */
async function startTranslate(text) {
  if (!text) return;
  const mine = ++seq;
  translation = "";
  showSettingsFlag = false;
  render({ kind: "loading" });

  await new Promise((resolve) => setTimeout(resolve, SEND_DELAY_MS));
  if (mine !== seq) return;

  let res;
  try {
    res = await browser.runtime.sendMessage({ type: "translate", text });
  } catch {
    res = { ok: false, message: "拡張機能の裏側と話せませんでした。Firefoxを開き直してください" };
  }
  if (mine !== seq) return;

  if (res && res.ok) {
    translation = res.translation;
    render({ kind: "ok", note: res.cached ? "覚えていた訳" : res.via || "" });
  } else {
    showSettingsFlag = Boolean(res && res.showSettings);
    render({ kind: "error", message: (res && res.message) || "訳せませんでした" });
  }
}

/* ------------------------------------------------------------------ *
 * カーソルを合わせて意味を出す
 *    選ぶ手間が要らない代わりに、動かしている最中に出ては邪魔でしかない。
 *    同じ字の上で手が止まってから出す
 * ------------------------------------------------------------------ */
const HOVER_DELAY_MS = 1000;
/* 手の震えで数え直していると、いつまでも一秒が貯まらない */
const HOVER_JITTER_PX = 6;
/* 語から離れた瞬間に消すと、吹き出しの中の釦を押しに行けない */
const HOVER_LEAVE_MS = 300;
const HOVER_LEAVE_MARGIN_PX = 24;

function clearHoverTimers() {
  clearTimeout(hoverTimer);
  clearTimeout(hoverLeaveTimer);
  hoverTimer = null;
  hoverLeaveTimer = null;
}

/* その座標にある英単語を、端まで広げて取り出す */
function wordAtPoint(x, y) {
  let node = null;
  let offset = 0;
  if (document.caretPositionFromPoint) {
    const position = document.caretPositionFromPoint(x, y);
    if (!position) return null;
    node = position.offsetNode;
    offset = position.offset;
  } else if (document.caretRangeFromPoint) {
    /* Chromium系にはこちらしか無い。テストはそちらで動かしている */
    const range = document.caretRangeFromPoint(x, y);
    if (!range) return null;
    node = range.startContainer;
    offset = range.startOffset;
  }
  if (!node || node.nodeType !== Node.TEXT_NODE) return null;
  /* 入力欄の中身は書きかけの文であることが多く、合わせただけで訳すと邪魔 */
  if (node.parentElement && node.parentElement.closest("input, textarea")) return null;

  const text = node.nodeValue || "";
  const isWordChar = (ch) => /[A-Za-z'\u2019-]/.test(ch);
  let start = Math.min(offset, text.length);
  let end = start;
  while (start > 0 && isWordChar(text[start - 1])) start -= 1;
  while (end < text.length && isWordChar(text[end])) end += 1;
  if (end - start < 2) return null;

  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  const rect = range.getBoundingClientRect();
  /* 字の無い余白でも、いちばん近い場所を返してくる。本当にその字の上に
     居るときだけ相手にする */
  if (x < rect.left - 2 || x > rect.right + 2 || y < rect.top - 2 || y > rect.bottom + 2) return null;

  const word = wordOf(range.toString());
  if (!word) return null;
  return { word, range };
}

/* 手が止まって一秒 */
function onDwell(point) {
  hoverTimer = null;
  if (!settings.enabled || !settings.hover) return;
  /* 選んで出した吹き出しが出ているなら、そちらを立てる */
  if (ui && !ui.bubble.hidden && !hoverSource) return;

  const found = wordAtPoint(point.x, point.y);
  if (!found || !looksTranslatable(found.word)) return;
  /* 同じ語で出し直すと、覚えている訳でも一度消えて瞬く */
  if (hoverSource && found.word === shownText && ui && !ui.bubble.hidden) return;

  hoverSource = true;
  anchor = { text: found.word, rectOf: () => found.range.getBoundingClientRect() };
  shownText = found.word;
  shownWord = found.word;
  translation = "";
  showSettingsFlag = false;
  startTranslate(found.word);
}

/* ------------------------------------------------------------------ *
 * ページ側の出来事
 * ------------------------------------------------------------------ */
function insideUI(event) {
  if (!host) return false;
  const path = typeof event.composedPath === "function" ? event.composedPath() : [];
  return path.includes(host) || event.target === host;
}

function handleSelection(target) {
  const picked = readSelection(target);
  if (!picked) {
    hide();
    return;
  }
  const text = picked.text.trim().replace(/\s+/g, " ");
  if (!looksTranslatable(text)) {
    hide();
    return;
  }
  /* 同じ範囲を選び直しただけなら、出ている物をそのままにする */
  if (text === shownText && ui && !ui.bubble.hidden) {
    anchor = picked;
    return;
  }

  anchor = picked;
  shownText = text;
  shownWord = wordOf(text);
  translation = "";
  showSettingsFlag = false;
  hoverSource = false;
  clearHoverTimers();

  if (text.length > MAX_CHARS) {
    seq += 1;
    render({ kind: "error", message: `選んだ範囲が長すぎます（${MAX_CHARS}字まで）` });
    return;
  }
  if (settings.trigger === "button") {
    seq += 1;
    render({ kind: "ask", message: "" });
    return;
  }
  startTranslate(text);
}

/* ページ側が止めてしまう作りでも拾えるよう、降りていく段階（capture）で聞く */
document.addEventListener("mouseup", (event) => {
  if (!settings.enabled || insideUI(event)) return;
  /* 選択が確定するのは mouseup の後。ひと呼吸おいてから読む */
  const target = event.target;
  setTimeout(() => handleSelection(target), 0);
}, true);

document.addEventListener("mousemove", (event) => {
  if (!settings.enabled || !settings.hover) return;
  /* 吹き出しの上に居る間は引っ込めない。中の釦を押しに行けなくなる */
  if (insideUI(event)) {
    clearTimeout(hoverLeaveTimer);
    hoverLeaveTimer = null;
    return;
  }
  const point = { x: event.clientX, y: event.clientY };

  /* 合わせて出した吹き出しは、その語から離れたら引っ込める */
  if (hoverSource && ui && !ui.bubble.hidden) {
    const rect = currentRect();
    const away =
      !rect ||
      point.x < rect.left - HOVER_LEAVE_MARGIN_PX || point.x > rect.right + HOVER_LEAVE_MARGIN_PX ||
      point.y < rect.top - HOVER_LEAVE_MARGIN_PX || point.y > rect.bottom + HOVER_LEAVE_MARGIN_PX;
    if (away && !hoverLeaveTimer) {
      hoverLeaveTimer = setTimeout(() => {
        hoverLeaveTimer = null;
        if (hoverSource) hide();
      }, HOVER_LEAVE_MS);
    } else if (!away && hoverLeaveTimer) {
      clearTimeout(hoverLeaveTimer);
      hoverLeaveTimer = null;
    }
  }

  /* ほとんど動いていないなら数え直さない */
  if (
    hoverPoint &&
    Math.abs(point.x - hoverPoint.x) <= HOVER_JITTER_PX &&
    Math.abs(point.y - hoverPoint.y) <= HOVER_JITTER_PX
  ) {
    return;
  }
  hoverPoint = point;
  clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => onDwell(point), HOVER_DELAY_MS);
}, { capture: true, passive: true });

document.addEventListener("mousedown", (event) => {
  if (insideUI(event)) return;
  hide();
}, true);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && ui && !ui.bubble.hidden) hide();
}, true);

window.addEventListener("scroll", () => {
  /* 動いた先の字は、合わせていた字とは別物 */
  clearTimeout(hoverTimer);
  hoverTimer = null;
  queuePlace();
}, { capture: true, passive: true });
window.addEventListener("resize", queuePlace, { passive: true });
