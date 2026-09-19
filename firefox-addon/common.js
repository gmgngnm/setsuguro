"use strict";

/* 設定は「ページ側の吹き出し」「裏方（background）」「設定画面」「板」から
   読む。既定値がずれると、設定画面では自動になっているのにページでは動かない、
   といった噛み合わない状態になるので、ここ一枚に集めて全員が同じ物を見る */
const SETTINGS_DEFAULTS = {
  /* 訳す相手。gemini / deepl / google */
  engine: "gemini",
  /* 鍵はエンジンごとに別に持つ。行き来するたびに入れ直さずに済む。
     Gemini の鍵だけ名前が素っ気ないのは、エンジンが一つだった頃に
     入れてもらった鍵をそのまま使えるようにしているため */
  apiKey: "",
  deeplKey: "",
  googleKey: "",
  /* 本体アプリ（EnGoloyd）と同じ既定モデル。速さの割に訳が崩れない。
     Gemini のときだけ使う */
  model: "gemini-3.7-flash",
  /* auto: 選んだらすぐ訳す / button: 「訳す」を押したときだけ訳す。
     自動は手数が要らない代わりに、選び直すたびにAPIを叩く */
  trigger: "auto",
  /* カーソルを英単語に1秒あわせたら、その語の意味を出す。選ぶ手間が要らない
     代わりに、読んでいるだけで呼ぶことになるので、切れるようにしてある */
  hover: true,
  enabled: true,
  /* 単語を一語だけ選んだときに出る「EnGoloydで開く」の飛び先。既定は
     GitHub Pages に置いてある本体アプリ。自分で配る場所が違う人もいるので
     設定から差し替えられる */
  engoloydUrl: "https://gmgngnm.github.io/setsuguro/",
};

/* どのエンジンがどの鍵を使うか。設定画面・板・裏方で同じ対応を見るための表 */
const ENGINES_INFO = [
  { id: "gemini", label: "Gemini", keyField: "apiKey", inputId: "api-key" },
  { id: "deepl", label: "DeepL", keyField: "deeplKey", inputId: "deepl-key" },
  { id: "google", label: "Google翻訳", keyField: "googleKey", inputId: "google-key" },
];

function engineInfo(id) {
  return ENGINES_INFO.find((e) => e.id === id) || ENGINES_INFO[0];
}

async function loadSettings() {
  /* storage.local.get に既定値の入った物を渡すと、未保存の項目はその値で
     埋めて返ってくる */
  return browser.storage.local.get(SETTINGS_DEFAULTS);
}

/* いま読み込まれているのがどの版か、設定画面と板の見出しに出す。本体アプリの
   ビルド番号と同じ役目で、直したつもりが古いままだった、を見分けるためのもの */
function showVersion() {
  const el = document.getElementById("version");
  if (!el) return;
  const version = browser.runtime.getManifest?.().version;
  if (version) el.textContent = `v${version}`;
}
