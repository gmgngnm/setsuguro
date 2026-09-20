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
/* 漫画のセリフのように、元の文へ向かって尖らせる。角は少しだけ丸めて、
   影や動きは付けない。色は設定の明暗と色味に従う */
.bubble{
  --box:#D6DAF0; --line:#B7C5D9; --ink:#000000; --soft:#707070;
  --link:#34345C; --link-hover:#DD0000; --danger:#AF0A0F;
  position:fixed; top:0; left:0;
  box-sizing:border-box;
  width:max-content; min-width:110px;
  padding:5px 18px 6px 8px;
  border:1px solid var(--line); border-radius:7px;
  background:var(--box); color:var(--ink);
  font:13px/1.5 arial,helvetica,"Hiragino Kaku Gothic ProN","Yu Gothic","MS PGothic",sans-serif;
  text-align:left;
  pointer-events:auto;
}
.bubble[data-accent="orange"]{--box:#F0E0D6; --line:#D9BFB7; --link:#800000;}
.bubble[data-accent="green"]{--box:#D9EBDD; --line:#B3CDBA; --link:#17603A;}
.bubble[data-accent="gray"]{--box:#E4E4E4; --line:#BDBDBD; --link:#3A3A3A;}
@media (prefers-color-scheme: dark){
  .bubble:not([data-theme="light"]){--box:#282A2E; --line:#3F4247; --ink:#C5C8C6; --soft:#969896; --link:#81A2BE; --link-hover:#5F89AC; --danger:#CC6666;}
  .bubble:not([data-theme="light"])[data-accent="orange"]{--link:#DE935F;}
  .bubble:not([data-theme="light"])[data-accent="green"]{--link:#B5BD68;}
  .bubble:not([data-theme="light"])[data-accent="gray"]{--link:#C5C8C6;}
}
.bubble[data-theme="dark"]{--box:#282A2E; --line:#3F4247; --ink:#C5C8C6; --soft:#969896; --link:#81A2BE; --link-hover:#5F89AC; --danger:#CC6666;}
.bubble[data-theme="dark"][data-accent="orange"]{--link:#DE935F;}
.bubble[data-theme="dark"][data-accent="green"]{--link:#B5BD68;}
.bubble[data-theme="dark"][data-accent="gray"]{--link:#C5C8C6;}
.bubble[hidden]{display:none;}

/* しっぽ。枠の色と塗りの色で二枚重ね、下の一枚を1pxずらして枠線に見せる */
.bubble::before,.bubble::after{
  content:""; position:absolute; width:13px; height:10px;
  clip-path:polygon(0 0, 100% 100%, 0 100%);
}
.bubble::before{top:-10px; left:var(--tail-x,14px); background:var(--line);}
.bubble::after{top:-8px; left:calc(var(--tail-x,14px) + 2px); background:var(--box);}
/* 上に出したときは、下へ向けて尖らせる */
.bubble.up::before,.bubble.up::after{clip-path:polygon(0 0, 100% 0, 0 100%);}
.bubble.up::before{top:auto; bottom:-10px;}
.bubble.up::after{top:auto; bottom:-8px;}

.x{
  position:absolute; top:2px; right:3px;
  padding:0; border:0; background:none;
  color:var(--soft); font:inherit; font-size:11px; line-height:1; cursor:pointer;
}
.x:hover{color:var(--link-hover);}
.body{
  font-size:13px; line-height:1.55;
  white-space:pre-wrap; word-break:break-word;
  max-height:40vh; overflow:auto;
  user-select:text; -moz-user-select:text;
}
.body.err{color:var(--danger);}
.body.wait{color:var(--soft);}
.foot{display:flex; flex-wrap:wrap; align-items:baseline; gap:6px; margin-top:3px;}
.foot[hidden]{display:none;}
/* 釦らしくせず、掲示板の [返信] のような括弧付きの字にする */
.act{
  flex:none; padding:0; border:0; background:none;
  color:var(--link); font:inherit; font-size:11px; cursor:pointer;
}
.act::before{content:"[";}
.act::after{content:"]";}
.act:hover{color:var(--link-hover);}
.act[hidden]{display:none;}
.note{margin-left:auto; font-size:10px; color:var(--soft); white-space:nowrap;}
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
    parts.x,
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
  /* 見た目を変えたら、出ている吹き出しもその場で合わせる */
  applyBubbleLook();
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

/* 明暗と色味は設定に従う。影の中からはページ側の指定が見えないので、
   吹き出し自身に札を付けて中のCSSで拾う */
function applyBubbleLook() {
  if (!ui) return;
  ui.bubble.dataset.theme = settings.theme || SETTINGS_DEFAULTS.theme;
  ui.bubble.dataset.accent = settings.accent || SETTINGS_DEFAULTS.accent;
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
  /* しっぽが左斜め上を指すので、吹き出しは語の右下に置く。真ん中に揃えると
     しっぽが語から外れる */
  const left = Math.min(Math.max(8, rect.left - 6), Math.max(8, vw - bw - 8));

  /* まず語の下。入らなければ上。どちらも入らないほど狭いときは、とにかく
     画面の中に収める（訳が読めないよりはまし） */
  let top = rect.bottom + 11;
  let above = false;
  if (top + bh > vh - 8) {
    const overWord = rect.top - bh - 11;
    above = overWord >= 8;
    top = above ? overWord : Math.max(8, vh - bh - 8);
  }

  /* しっぽの先が語に触れるように、左右の位置を合わせる。画面端で吹き出しが
     ずれても、指し先だけは語に残す */
  const apex = rect.left + Math.min(12, rect.width / 2);
  const tailX = Math.min(Math.max(apex - left, 8), Math.max(8, bw - 26));
  bubble.style.setProperty("--tail-x", `${Math.round(tailX)}px`);
  bubble.classList.toggle("up", above);

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
  applyBubbleLook();
  ui.note.textContent = note;
  ui.body.classList.toggle("err", kind === "error");
  ui.body.classList.toggle("wait", kind === "loading" || kind === "ask");

  if (kind === "loading") {
    ui.body.textContent = "訳しています…";
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
    render({ kind: "ok", note: res.via || "" });
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
/* 手の震えで数え直していると、いつまでも時間が貯まらない */
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
  /* 待つ間は設定から。壊れた値が入っていても止まらないよう既定に落とす */
  const delay = Number(settings.hoverDelay) || SETTINGS_DEFAULTS.hoverDelay;
  hoverTimer = setTimeout(() => onDwell(point), delay);
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
