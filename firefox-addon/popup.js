"use strict";

/* ツールバーの釦を押すと出る板。読んでいるページを離れずに入切と出すまでの間を
   変えるのが役目。APIキーのような長い物は入れず、歯車から設定画面へ渡す */

const el = {
  gear: document.getElementById("gear"),
  enabled: document.getElementById("enabled"),
  hover: document.getElementById("hover"),
  delay: document.getElementById("hover-delay"),
  engine: document.getElementById("engine"),
  note: document.getElementById("key-note"),
};

let settings = { ...SETTINGS_DEFAULTS };

/* 鍵を入れる欄はここに無いので、無いことだけは伝えて設定画面へ送る */
function showKeyState() {
  const info = engineInfo(el.engine.value);
  const has = String(settings[info.keyField] || "").trim();
  el.note.textContent = has ? "" : `${info.label} のAPIキーが未設定。歯車から入れてください`;
  el.note.classList.toggle("bad", !has);
}

async function init() {
  showVersion();
  settings = await loadSettings();
  applyLook(settings);
  el.enabled.checked = settings.enabled;
  el.hover.checked = settings.hover;
  fillDelaySelect(el.delay, settings.hoverDelay);
  fillEngineSelect(el.engine, settings.engine);
  showKeyState();
}

el.enabled.addEventListener("change", () => {
  browser.storage.local.set({ enabled: el.enabled.checked });
});

el.hover.addEventListener("change", () => {
  browser.storage.local.set({ hover: el.hover.checked });
});

el.delay.addEventListener("change", () => {
  browser.storage.local.set({ hoverDelay: Number(el.delay.value) });
});

el.engine.addEventListener("change", () => {
  settings.engine = el.engine.value;
  browser.storage.local.set({ engine: el.engine.value });
  showKeyState();
});

el.gear.addEventListener("click", () => {
  browser.runtime.openOptionsPage();
  window.close();
});

init();
