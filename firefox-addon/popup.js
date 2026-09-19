"use strict";

/* ツールバーの釦を押すと出る板。読んでいるページを離れずにAPIキーを入れたり、
   一時的に止めたりできるのが役目。細かい設定は設定画面に任せる */

const el = {
  enabled: document.getElementById("enabled"),
  apiKey: document.getElementById("api-key"),
  peek: document.getElementById("peek"),
  note: document.getElementById("key-note"),
  more: document.getElementById("more"),
};

function showKeyState(text, bad) {
  el.note.textContent = text;
  el.note.classList.toggle("bad", Boolean(bad));
}

let saveTimer = null;
function saveKeySoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const apiKey = el.apiKey.value.trim();
    await browser.storage.local.set({ apiKey });
    showKeyState(apiKey ? "保存しました" : "空にしました。訳せなくなります", !apiKey);
  }, 400);
}

async function init() {
  const settings = await loadSettings();
  el.enabled.checked = settings.enabled;
  el.apiKey.value = settings.apiKey;
  /* 鍵が無いまま選んでも「入っていません」としか出ない。入れる場所は
     ここだと分かるように、開いた時点で言っておく */
  showKeyState(settings.apiKey ? "入っています" : "まだ入っていません。ここに入れると訳せるようになります", !settings.apiKey);
}

el.enabled.addEventListener("change", () => {
  browser.storage.local.set({ enabled: el.enabled.checked });
});

el.apiKey.addEventListener("input", saveKeySoon);

el.peek.addEventListener("click", () => {
  const hidden = el.apiKey.type === "password";
  el.apiKey.type = hidden ? "text" : "password";
  el.peek.textContent = hidden ? "隠す" : "表示";
});

el.more.addEventListener("click", () => {
  browser.runtime.openOptionsPage();
  window.close();
});

init();
