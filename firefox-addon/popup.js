"use strict";

/* ツールバーの釦を押すと出る板。読んでいるページを離れずに、訳す相手を選んで
   APIキーを入れたり、一時的に止めたりできるのが役目。細かい設定は設定画面に
   任せる */

const el = {
  enabled: document.getElementById("enabled"),
  engine: document.getElementById("engine"),
  key: document.getElementById("key-input"),
  keyLabel: document.getElementById("key-label"),
  peek: document.getElementById("peek"),
  note: document.getElementById("key-note"),
  more: document.getElementById("more"),
};

let settings = { ...SETTINGS_DEFAULTS };

function showKeyState(text, bad) {
  el.note.textContent = text;
  el.note.classList.toggle("bad", Boolean(bad));
}

/* 選んでいる相手の鍵だけを出す。入っているかどうかは、開いた時点で言う。
   鍵が無いまま選んでも「入っていません」としか出ないので、入れる場所が
   ここだと分かるようにしておく */
function showEngine(id) {
  const info = engineInfo(id);
  el.keyLabel.textContent = `${info.label} のAPIキー`;
  el.key.value = settings[info.keyField] || "";
  el.key.placeholder = id === "deepl" ? "xxxxxxxx-xxxx-...:fx" : "AIza...";
  showKeyState(
    el.key.value ? "入っています" : `まだ入っていません。ここに入れると${info.label}で訳せるようになります`,
    !el.key.value
  );
}

/* どの相手の鍵を打っているかは、打った時点で控える。書き込む時に見に行くと、
   書き終わる前に相手を選び替えられたとき、別の相手の欄へ入ってしまう */
let saveTimer = null;
let pendingKey = null;
function saveKeySoon() {
  pendingKey = { keyField: engineInfo(el.engine.value).keyField, value: el.key.value.trim() };
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushKey, 400);
}
async function flushKey() {
  clearTimeout(saveTimer);
  if (!pendingKey) return;
  const { keyField, value } = pendingKey;
  pendingKey = null;
  settings[keyField] = value;
  await browser.storage.local.set({ [keyField]: value });
  showKeyState(value ? "保存しました" : "空にしました。訳せなくなります", !value);
}

async function init() {
  showVersion();
  settings = await loadSettings();
  el.engine.replaceChildren(
    ...ENGINES_INFO.map((info) => {
      const option = document.createElement("option");
      option.value = info.id;
      option.textContent = info.label;
      return option;
    })
  );
  el.engine.value = settings.engine;
  el.enabled.checked = settings.enabled;
  showEngine(settings.engine);
}

el.engine.addEventListener("change", async () => {
  /* 打ちかけの鍵を捨てないよう、相手を替える前に書き終える */
  await flushKey();
  await browser.storage.local.set({ engine: el.engine.value });
  settings.engine = el.engine.value;
  showEngine(el.engine.value);
});

el.enabled.addEventListener("change", () => {
  browser.storage.local.set({ enabled: el.enabled.checked });
});

el.key.addEventListener("input", saveKeySoon);

el.peek.addEventListener("click", () => {
  const hidden = el.key.type === "password";
  el.key.type = hidden ? "text" : "password";
  el.peek.textContent = hidden ? "隠す" : "表示";
});

el.more.addEventListener("click", () => {
  browser.runtime.openOptionsPage();
  window.close();
});

init();
