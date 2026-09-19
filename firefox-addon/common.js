"use strict";

/* 設定は「ページ側の吹き出し」「裏方（background）」「設定画面」の3か所から
   読む。既定値がずれると、設定画面では自動になっているのにページでは動かない、
   といった噛み合わない状態になるので、ここ一枚に集めて全員が同じ物を見る */
const SETTINGS_DEFAULTS = {
  apiKey: "",
  /* 本体アプリ（EnGoloyd）と同じ既定モデル。速さの割に訳が崩れない */
  model: "gemini-3.7-flash",
  /* auto: 選んだらすぐ訳す / button: 「訳す」を押したときだけ訳す。
     自動は手数が要らない代わりに、選び直すたびにAPIを叩く */
  trigger: "auto",
  enabled: true,
};

async function loadSettings() {
  /* storage.local.get に既定値の入った物を渡すと、未保存の項目はその値で
     埋めて返ってくる */
  return browser.storage.local.get(SETTINGS_DEFAULTS);
}
