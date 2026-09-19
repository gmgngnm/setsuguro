"use strict";

const el = {
  apiKey: document.getElementById("api-key"),
  peek: document.getElementById("peek"),
  model: document.getElementById("model"),
  modelList: document.getElementById("model-list"),
  enabled: document.getElementById("enabled"),
  test: document.getElementById("test"),
  testResult: document.getElementById("test-result"),
  status: document.getElementById("status"),
};

/* 「試す」に使う一文。訳が崩れたらすぐ分かる程度に普通の文 */
const TEST_SENTENCE = "The quick brown fox jumps over the lazy dog.";

let statusTimer = null;
function say(text) {
  el.status.textContent = text;
  el.status.classList.add("on");
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => el.status.classList.remove("on"), 1600);
}

/* 保存釦は置かない。設定が3つしか無いので、押し忘れで動かない方が事故が多い。
   打っている最中に毎打鍵書きに行かないよう、手が止まってからまとめて保存する */
let saveTimer = null;
function saveSoon(values, delay = 400) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    await browser.storage.local.set(values);
    say("保存しました");
  }, delay);
}

async function fillModelList() {
  const res = await browser.runtime.sendMessage({ type: "models" });
  if (!res || !res.ok || !res.models.length) return;
  el.modelList.replaceChildren(
    ...res.models.map((name) => {
      const option = document.createElement("option");
      option.value = name;
      return option;
    })
  );
}

async function init() {
  const settings = await loadSettings();
  el.apiKey.value = settings.apiKey;
  el.model.value = settings.model;
  el.enabled.checked = settings.enabled;
  for (const radio of document.querySelectorAll('input[name="trigger"]')) {
    radio.checked = radio.value === settings.trigger;
  }
  if (settings.apiKey) fillModelList();
}

el.apiKey.addEventListener("input", () => {
  saveSoon({ apiKey: el.apiKey.value.trim() });
});
/* キーを入れ終えた頃に、そのキーで使えるモデルを候補へ */
el.apiKey.addEventListener("change", () => {
  setTimeout(fillModelList, 500);
});

el.peek.addEventListener("click", () => {
  const hidden = el.apiKey.type === "password";
  el.apiKey.type = hidden ? "text" : "password";
  el.peek.textContent = hidden ? "隠す" : "表示";
});

el.model.addEventListener("input", () => {
  /* 空のまま保存すると訳せなくなるので、その時は既定へ戻す */
  saveSoon({ model: el.model.value.trim() || SETTINGS_DEFAULTS.model });
});

el.enabled.addEventListener("change", () => {
  saveSoon({ enabled: el.enabled.checked }, 0);
});

for (const radio of document.querySelectorAll('input[name="trigger"]')) {
  radio.addEventListener("change", () => {
    if (radio.checked) saveSoon({ trigger: radio.value }, 0);
  });
}

el.test.addEventListener("click", async () => {
  /* 打ちかけの設定で試すと結果が食い違う。待っている保存を先に片付ける */
  clearTimeout(saveTimer);
  await browser.storage.local.set({
    apiKey: el.apiKey.value.trim(),
    model: el.model.value.trim() || SETTINGS_DEFAULTS.model,
  });

  el.test.disabled = true;
  el.testResult.classList.remove("err");
  el.testResult.textContent = "訳しています…";
  const res = await browser.runtime.sendMessage({ type: "translate-fresh", text: TEST_SENTENCE });
  el.test.disabled = false;

  if (res && res.ok) {
    el.testResult.textContent = `${TEST_SENTENCE}\n→ ${res.translation}`;
  } else {
    el.testResult.classList.add("err");
    el.testResult.textContent = (res && res.message) || "訳せませんでした";
  }
});

init();
