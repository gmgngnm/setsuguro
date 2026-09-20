"use strict";

const el = {
  enabled: document.getElementById("enabled"),
  hover: document.getElementById("hover"),
  delay: document.getElementById("hover-delay"),
  trigger: document.getElementById("trigger"),
  engine: document.getElementById("engine"),
  model: document.getElementById("model"),
  modelList: document.getElementById("model-list"),
  theme: document.getElementById("theme"),
  accent: document.getElementById("accent"),
  status: document.getElementById("status"),
};

/* 鍵の欄は相手の数だけある。どれも同じ扱いなので表で回す */
const keyInputs = ENGINES_INFO.map((info) => ({ info, input: document.getElementById(info.inputId) }));

let statusTimer = null;
function say(text) {
  el.status.textContent = text;
  el.status.classList.add("on");
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => el.status.classList.remove("on"), 1600);
}

/* 保存釦は置かない。押し忘れで動かない事故の方が多いため。打っている最中に
   毎打鍵書きに行かないよう、手が止まってからまとめて保存する。
   待っている分は溜めてから一度に書く。時計を一つで使い回して上書きすると、
   鍵を打った直後に相手を選び替えたときに、打った鍵ごと消える */
let saveTimer = null;
let pending = {};
function saveSoon(values, delay = 400) {
  Object.assign(pending, values);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, delay);
}
async function flushSave() {
  clearTimeout(saveTimer);
  if (!Object.keys(pending).length) return;
  const values = pending;
  pending = {};
  await browser.storage.local.set(values);
  say("保存しました");
}

/* 選んでいる相手の行だけ出す。使わない鍵の欄まで並ぶと、どれに入れればよいか
   分からなくなる */
function showEngineRows(engine) {
  for (const row of document.querySelectorAll("[data-engine]")) {
    row.hidden = row.dataset.engine !== engine;
  }
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
  showVersion();
  const settings = await loadSettings();
  for (const { info, input } of keyInputs) input.value = settings[info.keyField];
  el.enabled.checked = settings.enabled;
  el.hover.checked = settings.hover;
  fillDelaySelect(el.delay, settings.hoverDelay);
  fillEngineSelect(el.engine, settings.engine);
  el.trigger.value = settings.trigger;
  el.model.value = settings.model;
  fillSelect(el.theme, THEMES, settings.theme);
  fillSelect(el.accent, ACCENTS, settings.accent);
  applyLook(settings);
  showEngineRows(settings.engine);
  if (settings.apiKey) fillModelList();
}

for (const { info, input } of keyInputs) {
  input.addEventListener("input", () => {
    saveSoon({ [info.keyField]: input.value.trim() });
  });
}

/* Gemini の鍵を入れ終えた頃に、そのキーで使えるモデルを候補へ */
const geminiInput = keyInputs.find((k) => k.info.id === "gemini").input;
geminiInput.addEventListener("change", () => {
  setTimeout(fillModelList, 500);
});

for (const button of document.querySelectorAll(".peek")) {
  button.addEventListener("click", () => {
    const input = document.getElementById(button.dataset.for);
    const hidden = input.type === "password";
    input.type = hidden ? "text" : "password";
    button.textContent = hidden ? "隠す" : "表示";
  });
}

el.engine.addEventListener("change", () => {
  showEngineRows(el.engine.value);
  saveSoon({ engine: el.engine.value }, 0);
});

el.enabled.addEventListener("change", () => saveSoon({ enabled: el.enabled.checked }, 0));
el.hover.addEventListener("change", () => saveSoon({ hover: el.hover.checked }, 0));
el.delay.addEventListener("change", () => saveSoon({ hoverDelay: Number(el.delay.value) }, 0));
el.trigger.addEventListener("change", () => saveSoon({ trigger: el.trigger.value }, 0));

el.model.addEventListener("input", () => {
  /* 空のまま保存すると訳せなくなるので、その時は既定へ戻す */
  saveSoon({ model: el.model.value.trim() || SETTINGS_DEFAULTS.model });
});

/* 見た目は選んだ場で確かめられた方がよいので、保存を待たずに当てる */
el.theme.addEventListener("change", () => {
  applyLook({ theme: el.theme.value, accent: el.accent.value });
  saveSoon({ theme: el.theme.value }, 0);
});

el.accent.addEventListener("change", () => {
  applyLook({ theme: el.theme.value, accent: el.accent.value });
  saveSoon({ accent: el.accent.value }, 0);
});

init();
