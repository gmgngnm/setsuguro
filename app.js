"use strict";

/* =========================================================================
   セツゴロ — app.js
   仕様書 (SPEC-01) に基づくプロトタイプ実装。
   - Stage 1: 接辞分解プロンプト（軽量・即時実行）
   - Stage 2: 語呂合わせ生成プロンプト（Stage1完了後、裏側で先行実行）
   - ローカル接辞辞書とのハイブリッド構成で表記・読みのブレを抑える
   - IndexedDB でローカルファースト保存（単語帳 / 接辞帳）
   - APIキーは Web Crypto (AES-GCM) で暗号化して端末内にのみ保存
   ========================================================================= */

/* ------------------------------------------------------------------ *
 * 0. ローカル接辞辞書（頻出接辞のハイブリッド照合用・抜粋版）
 * ------------------------------------------------------------------ */
const LOCAL_AFFIX_DICT = {
  "un":     { reading: "アン",     meaning: "〜でない・否定",      origin: "古英語 un-" },
  "re":     { reading: "リ",       meaning: "再び・戻す",          origin: "ラテン語 re-" },
  "dis":    { reading: "ディス",   meaning: "否定・分離",          origin: "ラテン語 dis-" },
  "pre":    { reading: "プリ",     meaning: "前もって",            origin: "ラテン語 prae-" },
  "post":   { reading: "ポスト",   meaning: "後で",                origin: "ラテン語 post" },
  "sub":    { reading: "サブ",     meaning: "下に・副次的な",      origin: "ラテン語 sub-" },
  "inter":  { reading: "インター", meaning: "〜の間",              origin: "ラテン語 inter-" },
  "trans":  { reading: "トランス", meaning: "越えて・移す",        origin: "ラテン語 trans-" },
  "ex":     { reading: "エクス",   meaning: "外へ",                origin: "ラテン語 ex-" },
  "in":     { reading: "イン",     meaning: "中へ／〜でない",      origin: "ラテン語 in-" },
  "co":     { reading: "コ",       meaning: "共に",                origin: "ラテン語 com-" },
  "con":    { reading: "コン",     meaning: "共に",                origin: "ラテン語 com- の異形" },
  "com":    { reading: "コム",     meaning: "共に",                origin: "ラテン語 com-" },
  "il":     { reading: "イル",     meaning: "〜でない",            origin: "ラテン語 in- の異形" },
  "im":     { reading: "イム",     meaning: "〜でない",            origin: "ラテン語 in- の異形" },
  "ir":     { reading: "イル",     meaning: "〜でない",            origin: "ラテン語 in- の異形" },
  "dict":   { reading: "ジクト",   meaning: "言う",                origin: "ラテン語 dicere" },
  "duc":    { reading: "デュク",   meaning: "導く",                origin: "ラテン語 ducere" },
  "tract":  { reading: "トラクト", meaning: "引く",                origin: "ラテン語 trahere" },
  "port":   { reading: "ポート",   meaning: "運ぶ",                origin: "ラテン語 portare" },
  "spect":  { reading: "スペクト", meaning: "見る",                origin: "ラテン語 specere" },
  "scrib":  { reading: "スクライブ", meaning: "書く",              origin: "ラテン語 scribere" },
  "vol":    { reading: "ヴォル",   meaning: "望む・意志",          origin: "ラテン語 velle" },
  "ben":    { reading: "ベン",     meaning: "良い",                origin: "ラテン語 bene" },
  "mal":    { reading: "マル",     meaning: "悪い",                origin: "ラテン語 malus" },
  "vid":    { reading: "ヴィド",   meaning: "見る",                origin: "ラテン語 videre" },
  "ject":   { reading: "ジェクト", meaning: "投げる",              origin: "ラテン語 jacere" },
  "mit":    { reading: "ミット",   meaning: "送る",                origin: "ラテン語 mittere" },
  "serv":   { reading: "サーヴ",   meaning: "仕える・保つ",        origin: "ラテン語 servare" },
  "cred":   { reading: "クレド",   meaning: "信じる",              origin: "ラテン語 credere" },
  "gress":  { reading: "グレス",   meaning: "歩む",                origin: "ラテン語 gradi" },
  "ion":    { reading: "イオン",   meaning: "名詞化（〜すること）", origin: "ラテン語 -io" },
  "tion":   { reading: "ション",   meaning: "名詞化（〜すること）", origin: "ラテン語 -tio" },
  "ary":    { reading: "アリー",   meaning: "〜に関する（名詞化）", origin: "ラテン語 -arius" },
  "able":   { reading: "アブル",   meaning: "〜できる",            origin: "ラテン語 -abilis" },
  "ible":   { reading: "イブル",   meaning: "〜できる",            origin: "ラテン語 -ibilis" },
  "ful":    { reading: "フル",     meaning: "〜に満ちた",          origin: "古英語 -full" },
  "less":   { reading: "レス",     meaning: "〜がない",            origin: "古英語 -leas" },
  "ment":   { reading: "メント",   meaning: "名詞化（結果・状態）", origin: "ラテン語 -mentum" },
  "ness":   { reading: "ネス",     meaning: "名詞化（性質・状態）", origin: "古英語 -nes" },
  "ive":    { reading: "イヴ",     meaning: "〜の傾向がある",      origin: "ラテン語 -ivus" },
  "ous":    { reading: "アス",     meaning: "〜に満ちた",          origin: "ラテン語 -osus" },
  "ate":    { reading: "エイト",   meaning: "〜にする（動詞化）",  origin: "ラテン語 -atus" },
  "ist":    { reading: "イスト",   meaning: "〜する人",            origin: "ギリシャ語 -istes" },
  "er":     { reading: "アー",     meaning: "〜する人・もの",      origin: "古英語 -ere" },
  "ology":  { reading: "オロジー", meaning: "〜学",                origin: "ギリシャ語 -logia" },
};

/* ------------------------------------------------------------------ *
 * 1. IndexedDB ラッパー
 * ------------------------------------------------------------------ */
const DB_NAME = "setsugoro-db";
const DB_VERSION = 1;
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("words")) db.createObjectStore("words", { keyPath: "id" });
      if (!db.objectStoreNames.contains("affixes")) db.createObjectStore("affixes", { keyPath: "part" });
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv", { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function idbGet(store, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const r = tx.objectStore(store).get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function idbPut(store, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function idbDelete(store, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function idbGetAll(store) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const r = tx.objectStore(store).getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  });
}

async function kvGet(key, fallback) {
  const row = await idbGet("kv", key);
  return row ? row.value : fallback;
}
async function kvSet(key, value) {
  await idbPut("kv", { key, value });
}

/* ------------------------------------------------------------------ *
 * 2. Web Crypto — APIキーの暗号化保存
 *    端末内で生成した非公開鍵 (CryptoKey) をそのまま IndexedDB に保管し、
 *    APIキーは暗号文 (iv + ciphertext) のみを kv ストアに保存する。
 * ------------------------------------------------------------------ */
async function getOrCreateCryptoKey() {
  const existing = await idbGet("kv", "__cryptokey");
  if (existing && existing.value) return existing.value;
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  await idbPut("kv", { key: "__cryptokey", value: key });
  return key;
}

async function encryptSecret(plainText) {
  const key = await getOrCreateCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(plainText);
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  return { iv, cipher };
}
async function decryptSecret(record) {
  if (!record) return "";
  const key = await getOrCreateCryptoKey();
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: record.iv }, key, record.cipher);
  return new TextDecoder().decode(plain);
}

async function saveApiKey(provider, plainText) {
  const record = await encryptSecret(plainText);
  await kvSet(`apikey_${provider}`, record);
}
async function loadApiKey(provider) {
  const record = await kvGet(`apikey_${provider}`, null);
  if (!record) return "";
  try { return await decryptSecret(record); } catch { return ""; }
}

/* ------------------------------------------------------------------ *
 * 3. 生成AIアダプタ層（OpenAI / Gemini / Claude）
 *    共通インターフェース: decompose(word) / goro(word, morphemes)
 * ------------------------------------------------------------------ */
const KNOWN_AFFIXES = Object.keys(LOCAL_AFFIX_DICT).join(", ");

const DECOMPOSE_SYS = [
  "あなたは英語の語源・形態素解析の専門家です。",
  "まず、与えられた単語のスペルが実在の英単語として誤っている可能性がないか確認してください。誤っていると判断した場合は、最も可能性の高い正しい英単語に修正し、corrected_wordにその修正後の単語を入れ、was_correctedをtrueにしてください。誤りがない場合はcorrected_wordに入力そのものを入れ、was_correctedをfalseにしてください。",
  "以降の分割・分析は、修正後の単語（corrected_word）に対して行ってください。",
  "corrected_wordを接頭辞・語根・接尾辞（接辞 = morpheme）に分割してください。",
  `次の既知の接頭辞・接尾辞一覧を優先的に使ってください: ${KNOWN_AFFIXES}`,
  "単語がこの一覧のいずれかの文字列で始まる・終わる場合は、必ずその一覧の文字列と完全に一致する形で切り出してください（例: 一覧に'con'があれば'co'ではなく'con'を使う）。一覧にない場合のみ、教科書的に広く認められている接辞を使ってください。",
  "残った中間部分は語根として一つの要素にまとめ、接尾辞の一部（活用語尾や連結母音など）を語根に含めないでください。",
  "各要素を連結するとcorrected_wordと完全に一致するようにしてください（文字の欠落・重複がないこと）。",
  "各要素について、そのカタカナ読み（reading）・日本語での意味（meaning）・由来（origin、簡潔に）を必ず付けてください。語根が一般に馴染みのないものでも、meaningとoriginを空にせず最も可能性の高い語源を推定して記入してください。",
  "あわせて、単語全体の日本語での意味（word_meaning、簡潔な訳語や説明）も必ず記入してください。",
  "さらに、各接辞の意味を踏まえたうえでこの単語をどう覚えればよいかを示す一文（memory_tip）を、日本語で100文字以内で必ず記入してください。",
  "出力は次のJSON形式のみを返し、それ以外の文章は一切書かないでください。",
  '{"corrected_word":"investigation","was_corrected":false,"word_meaning":"調査する・捜査する","memory_tip":"in(中へ)+vestig(足跡を)+ation(たどること)で、痕跡を中まで追う=調査する、と覚える。","morphemes":[{"part":"dict","reading":"ジクト","meaning":"言う","origin":"ラテン語 dicere"},{"part":"ion","reading":"イオン","meaning":"名詞化（〜すること）","origin":"ラテン語 -io"}]}',
  "例: investigation → in(接頭辞) / vestig(語根、探る) / ation(接尾辞、〜すること) のように、既知の接尾辞パターン（-ation, -tion, -able 等）はまとめて一つの要素として扱ってください。",
].join("\n");

function goroSystemPrompt(word, morphemes) {
  const partList = morphemes.map((m) => `${m.part}(${m.reading})`).join(" / ");
  return [
    "あなたは日本語の語呂合わせ作家です。",
    `対象の英単語は "${word}"。接辞とカタカナ読みは次の通りです: ${partList}`,
    "各接辞の【意味の直訳】ではなく【カタカナ読み（音）】を素材にして、音が似た日本語表現を組み合わせ、意味の通る一文の語呂合わせを作ってください。",
    "例: dict(ジクト)/ion(イオン)/ary(アリー) → 「軸と(dict)イオン(ion)で起電力あり(ary)」",
    "各接辞の読みは一音も欠かさず文中のどこかに反映してください。下品・差別的・実在の人物名を用いた表現は避けてください。",
    "候補を3件作り、次のJSON形式のみを返してください。それ以外の文章は書かないでください。",
    '{"candidates":[{"text":"軸とイオンで起電力あり","highlight":[{"part":"dict","in_text":"軸と"}]}]}',
  ].join("\n");
}

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("JSONが見つかりません");
  return JSON.parse(text.slice(start, end + 1));
}

async function extractErrorDetail(res) {
  try {
    const json = await res.json();
    return json.error?.message || json.message || "";
  } catch {
    return "";
  }
}

const AI_ADAPTERS = {
  openai: {
    label: "ChatGPT",
    async chat(apiKey, systemPrompt, userPrompt, temperature) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
          temperature,
        }),
      });
      if (!res.ok) {
        const detail = await extractErrorDetail(res);
        throw new Error(`OpenAI API エラー (${res.status})${detail ? `: ${detail}` : ""}`);
      }
      const json = await res.json();
      const text = json.choices?.[0]?.message?.content || "{}";
      const tokens = json.usage?.total_tokens || Math.round(text.length / 2);
      return { text, tokens };
    },
  },
  gemini: {
    label: "Gemini",
    async chat(apiKey, systemPrompt, userPrompt, temperature) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature },
        }),
      });
      if (!res.ok) {
        const detail = await extractErrorDetail(res);
        throw new Error(`Gemini API エラー (${res.status})${detail ? `: ${detail}` : ""}`);
      }
      const json = await res.json();
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
      const tokens = json.usageMetadata?.totalTokenCount || Math.round(text.length / 2);
      return { text, tokens };
    },
  },
  claude: {
    label: "Claude",
    async chat(apiKey, systemPrompt, userPrompt, temperature) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-sonnet-5",
          max_tokens: 1024,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
          temperature,
        }),
      });
      if (!res.ok) {
        const detail = await extractErrorDetail(res);
        throw new Error(`Claude API エラー (${res.status})${detail ? `: ${detail}` : ""}`);
      }
      const json = await res.json();
      const text = json.content?.[0]?.text || "{}";
      const tokens = (json.usage?.input_tokens || 0) + (json.usage?.output_tokens || 0) || Math.round(text.length / 2);
      return { text, tokens };
    },
  },
  groq: {
    label: "Groq",
    async chat(apiKey, systemPrompt, userPrompt, temperature) {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "qwen/qwen3.6-27b",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
          reasoning_effort: "none",
          temperature,
        }),
      });
      if (!res.ok) {
        const detail = await extractErrorDetail(res);
        throw new Error(`Groq API エラー (${res.status})${detail ? `: ${detail}` : ""}`);
      }
      const json = await res.json();
      const text = json.choices?.[0]?.message?.content || "{}";
      const tokens = json.usage?.total_tokens || Math.round(text.length / 2);
      return { text, tokens };
    },
  },
};

const RETRYABLE_STATUS = [429, 500, 502, 503, 504];
const RETRY_DELAYS_MS = [1000, 2000, 4000];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function statusFromError(err) {
  const match = /\((\d+)\)/.exec(err.message || "");
  return match ? Number(match[1]) : null;
}

async function callAI(provider, apiKey, systemPrompt, userPrompt, temperature = 0.9) {
  const adapter = AI_ADAPTERS[provider];
  if (!adapter) throw new Error("未対応のプロバイダです");
  if (!apiKey) throw new Error("APIキーが設定されていません");

  let lastErr;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const { text, tokens } = await adapter.chat(apiKey, systemPrompt, userPrompt, temperature);
      await bumpUsage(tokens);
      return extractJson(text);
    } catch (err) {
      lastErr = err;
      const status = statusFromError(err);
      const canRetry = RETRYABLE_STATUS.includes(status) && attempt < RETRY_DELAYS_MS.length;
      if (!canRetry) throw err;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
  throw lastErr;
}

/* ------------------------------------------------------------------ *
 * 4. ローカル辞書とのハイブリッド照合・フォールバック分解
 * ------------------------------------------------------------------ */
const MEANING_UNAVAILABLE = "（意味を取得できませんでした）";

function reconcileWithLocalDict(morphemes) {
  return (morphemes || []).map((m) => {
    const key = (m.part || "").toLowerCase();
    const local = LOCAL_AFFIX_DICT[key];
    if (local) {
      return { part: m.part, reading: local.reading, meaning: local.meaning, origin: local.origin };
    }
    return {
      part: m.part,
      reading: m.reading || m.part,
      meaning: m.meaning || MEANING_UNAVAILABLE,
      origin: m.origin || "—",
    };
  });
}

function fallbackDecompose(word) {
  // ローカル辞書のみによるルールベース分割（API失敗時の最終手段）
  const w = word.toLowerCase();
  const known = Object.keys(LOCAL_AFFIX_DICT).sort((a, b) => b.length - a.length);
  const prefix = known.find((k) => w.startsWith(k) && k.length < w.length);
  const suffix = known.find((k) => w.endsWith(k) && k.length < w.length && k !== prefix);
  const parts = [];
  let rest = w;
  if (prefix) { parts.push(prefix); rest = rest.slice(prefix.length); }
  if (suffix && rest.endsWith(suffix)) {
    rest = rest.slice(0, rest.length - suffix.length);
  }
  if (rest) parts.push(rest);
  if (suffix) parts.push(suffix);
  if (parts.length === 0) parts.push(w);
  return reconcileWithLocalDict(parts.map((p) => ({ part: p })));
}

function mergeMissingMeanings(morphemes, betterMorphemes) {
  const byPart = new Map(betterMorphemes.map((m) => [m.part.toLowerCase(), m]));
  return morphemes.map((m) => {
    if (m.meaning !== MEANING_UNAVAILABLE) return m;
    const better = byPart.get(m.part.toLowerCase());
    if (better && better.meaning !== MEANING_UNAVAILABLE) {
      return { part: m.part, reading: better.reading, meaning: better.meaning, origin: better.origin };
    }
    return m;
  });
}

async function decomposeWord(word, provider, apiKey) {
  try {
    const json = await callAI(provider, apiKey, DECOMPOSE_SYS, `単語: ${word}`, 0.2);
    let morphemes = reconcileWithLocalDict(json.morphemes);
    if (!morphemes.length) throw new Error("empty");
    let wordMeaning = json.word_meaning || "";
    let memoryTip = (json.memory_tip || "").slice(0, 100);

    if (!wordMeaning || !memoryTip || morphemes.some((m) => m.meaning === MEANING_UNAVAILABLE)) {
      try {
        const retryPrompt = `単語: ${word}\n前回の応答ではword_meaning/memory_tipや一部の接辞のreading/meaning/originが空でした。今回はすべての項目を必ず埋めてください。`;
        const retryJson = await callAI(provider, apiKey, DECOMPOSE_SYS, retryPrompt, 0.2);
        const retryMorphemes = reconcileWithLocalDict(retryJson.morphemes);
        if (retryMorphemes.length) morphemes = mergeMissingMeanings(morphemes, retryMorphemes);
        if (!wordMeaning) wordMeaning = retryJson.word_meaning || "";
        if (!memoryTip) memoryTip = (retryJson.memory_tip || "").slice(0, 100);
      } catch (retryErr) {
        console.warn("Stage1 retry for missing meanings failed:", retryErr);
      }
    }

    const validCorrection = typeof json.corrected_word === "string" && /^[A-Za-z][A-Za-z'-]*$/.test(json.corrected_word);
    const correctedWord = validCorrection ? json.corrected_word : word;
    const wasCorrected = validCorrection && !!json.was_corrected && correctedWord.toLowerCase() !== word.toLowerCase();
    return { correctedWord, wasCorrected, meaning: wordMeaning, memoryTip, morphemes };
  } catch (err) {
    console.warn("Stage1 failed, falling back to local dictionary:", err);
    return { correctedWord: word, wasCorrected: false, meaning: "", memoryTip: "", morphemes: fallbackDecompose(word) };
  }
}

async function generateGoro(word, morphemes, provider, apiKey) {
  const sys = goroSystemPrompt(word, morphemes);
  const json = await callAI(provider, apiKey, sys, "語呂合わせ候補を3件、JSON形式で出力してください。");
  const candidates = (json.candidates || []).map((c) => ({ text: c.text, highlight: c.highlight || [] }));
  if (!candidates.length) throw new Error("語呂合わせが生成できませんでした");
  return candidates;
}

async function bumpUsage(tokens) {
  const calls = (await kvGet("usage_calls", 0)) + 1;
  const total = (await kvGet("usage_tokens", 0)) + (tokens || 0);
  await kvSet("usage_calls", calls);
  await kvSet("usage_tokens", total);
}

/* ------------------------------------------------------------------ *
 * 5. 読み上げ (Web Speech API)
 * ------------------------------------------------------------------ */
function speak(text, onEnd) {
  if (!("speechSynthesis" in window)) { if (onEnd) onEnd(); return; }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ja-JP";
  u.rate = 1.0;
  if (onEnd) u.onend = onEnd;
  window.speechSynthesis.speak(u);
}

/* ------------------------------------------------------------------ *
 * 6. 画面遷移
 * ------------------------------------------------------------------ */
function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}
document.querySelectorAll("[data-nav]").forEach((el) => {
  el.addEventListener("click", () => {
    const target = el.dataset.nav;
    if (target === "home") {
      showScreen("screen-home");
      document.getElementById("word-input").value = "";
      document.getElementById("home-error").textContent = "";
    }
    if (target === "book") { showScreen("screen-book"); renderBookList(); }
    if (target === "settings") { showScreen("screen-settings"); refreshUsageDisplay(); }
  });
});

/* ------------------------------------------------------------------ *
 * 7. トースト
 * ------------------------------------------------------------------ */
let toastTimer = null;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
}

/* ------------------------------------------------------------------ *
 * 8. ホーム画面
 * ------------------------------------------------------------------ */
const wordInput = document.getElementById("word-input");
const homeError = document.getElementById("home-error");

wordInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") startDecompose(wordInput.value);
});

async function renderRecentChips() {
  const recent = await kvGet("recent_words", []);
  const wrap = document.getElementById("recent-chips");
  wrap.innerHTML = "";
  recent.forEach((w) => {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.textContent = w;
    chip.addEventListener("click", () => startDecompose(w));
    wrap.appendChild(chip);
  });
}

async function pushRecentWord(word) {
  let recent = await kvGet("recent_words", []);
  recent = [word, ...recent.filter((w) => w.toLowerCase() !== word.toLowerCase())].slice(0, 6);
  await kvSet("recent_words", recent);
  renderRecentChips();
}

/* ------------------------------------------------------------------ *
 * 9. 分解アニメーション → 結果画面フロー
 * ------------------------------------------------------------------ */
let currentWord = "";
let currentWordMeaning = "";
let currentMemoryTip = "";
let currentMorphemes = [];
let currentCandidates = [];
let candidateStates = []; // { saved, feedback }

async function startDecompose(rawWord) {
  const word = (rawWord || "").trim();
  if (!word) return;
  if (!/^[A-Za-z][A-Za-z'-]*$/.test(word)) {
    homeError.textContent = "英単語を入力してください（英字のみ）";
    return;
  }
  homeError.textContent = "";

  const provider = await kvGet("provider", "openai");
  const apiKey = await loadApiKey(provider);
  if (!apiKey) {
    homeError.textContent = "設定画面でAPIキーを登録してください";
    showScreen("screen-settings");
    refreshUsageDisplay();
    return;
  }

  currentWord = word;
  showScreen("screen-decompose");
  const splitEl = document.getElementById("word-split");
  const spinnerRow = document.getElementById("decompose-spinner");
  splitEl.innerHTML = "";
  spinnerRow.style.display = "none";
  document.getElementById("decompose-appbar").style.display = "none";
  const decomposeWordMeaningEl = document.getElementById("decompose-word-meaning");
  decomposeWordMeaningEl.textContent = "";
  decomposeWordMeaningEl.classList.remove("show");
  decomposeWordMeaningEl.style.display = "none";
  const decomposeMemoryTipEl = document.getElementById("decompose-memory-tip");
  decomposeMemoryTipEl.textContent = "";
  decomposeMemoryTipEl.classList.remove("show");
  decomposeMemoryTipEl.style.display = "none";

  const placeholder = document.createElement("div");
  placeholder.className = "morph word-pulse";
  placeholder.textContent = word;
  splitEl.appendChild(placeholder);

  let morphemes;
  try {
    const decomposed = await decomposeWord(word, provider, apiKey);
    morphemes = decomposed.morphemes;
    currentWordMeaning = decomposed.meaning;
    currentMemoryTip = decomposed.memoryTip;
    if (decomposed.wasCorrected) {
      await playSpellingFix(placeholder, word, decomposed.correctedWord);
      currentWord = decomposed.correctedWord;
    }
  } catch (err) {
    placeholder.remove();
    spinnerRow.style.display = "flex";
    document.getElementById("decompose-appbar").style.display = "flex";
    document.getElementById("decompose-label").textContent = "分解に失敗しました。ホームに戻ってお試しください。";
    console.error(err);
    return;
  }
  currentMorphemes = morphemes;

  await playCrack(placeholder, currentWord, morphemes);
  placeholder.remove();

  if (currentWordMeaning) {
    decomposeWordMeaningEl.textContent = currentWordMeaning;
    decomposeWordMeaningEl.style.display = "block";
    requestAnimationFrame(() => decomposeWordMeaningEl.classList.add("show"));
  }

  splitEl.innerHTML = "";
  const mid = (morphemes.length - 1) / 2;
  morphemes.forEach((m, i) => {
    const el = document.createElement("div");
    el.className = "morph shatter-in";
    const dir = i - mid;
    el.style.setProperty("--from-x", `${-dir * 22}px`);
    el.style.setProperty("--from-rot", `${dir * 5}deg`);
    el.style.animationDelay = `${i * 0.05}s`;

    const partEl = document.createElement("div");
    partEl.className = "morph-part";
    partEl.textContent = m.part;

    const meaningEl = document.createElement("div");
    meaningEl.className = "morph-meaning";
    meaningEl.textContent = [m.reading, m.meaning].filter(Boolean).join(" ・ ");

    el.appendChild(partEl);
    el.appendChild(meaningEl);
    splitEl.appendChild(el);
  });

  await pushRecentWord(currentWord);

  const SHATTER_MS = 450;
  const STAGGER_MS = 320;
  const meaningEls = splitEl.querySelectorAll(".morph-meaning");
  meaningEls.forEach((el, i) => {
    setTimeout(() => el.classList.add("show"), SHATTER_MS + i * STAGGER_MS);
  });
  const lastMeaningDelay = SHATTER_MS + meaningEls.length * STAGGER_MS;

  if (currentMemoryTip) {
    setTimeout(() => {
      decomposeMemoryTipEl.textContent = currentMemoryTip;
      decomposeMemoryTipEl.style.display = "block";
      requestAnimationFrame(() => decomposeMemoryTipEl.classList.add("show"));
    }, lastMeaningDelay);
  }

  const totalDelay = lastMeaningDelay + 400;

  setTimeout(() => {
    renderResultScreen();
    showScreen("screen-result");
    loadGoroCandidates(provider, apiKey); // Stage2をバックグラウンドで先行実行
  }, totalDelay);
}

/* スペルミスを検出した場合、赤く揺れてから正しい綴りにクロスフェードする */
async function playSpellingFix(placeholder, originalWord, correctedWord) {
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    placeholder.textContent = correctedWord;
    toast(`✎ "${originalWord}" → "${correctedWord}" に修正しました`);
    return;
  }
  placeholder.classList.remove("word-pulse");
  placeholder.classList.add("typo-shake");
  await sleep(400);
  placeholder.classList.remove("typo-shake");
  placeholder.classList.add("typo-out");
  await sleep(180);
  placeholder.textContent = correctedWord;
  placeholder.classList.remove("typo-out");
  placeholder.classList.add("typo-in");
  await sleep(220);
  placeholder.classList.remove("typo-in");
  toast(`✎ "${originalWord}" → "${correctedWord}" に修正しました`);
}

/* 単語ブロックに亀裂が入り、揺れてから砕けるアニメーション */
async function playCrack(placeholder, word, morphemes) {
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  placeholder.classList.remove("word-pulse");
  const rect = placeholder.getBoundingClientRect();
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("class", "crack-overlay");
  svg.setAttribute("width", rect.width);
  svg.setAttribute("height", rect.height);

  let acc = 0;
  const boundaries = [];
  morphemes.slice(0, -1).forEach((m) => {
    acc += (m.part || "").length;
    boundaries.push(acc / word.length);
  });

  boundaries.forEach((frac, i) => {
    const x = rect.width * frac;
    const steps = 5;
    const points = Array.from({ length: steps }, (_, j) => {
      const y = (rect.height / (steps - 1)) * j;
      const jitter = (j % 2 === 0 ? -1 : 1) * (3 + Math.random() * 4);
      return `${(x + jitter).toFixed(1)},${y.toFixed(1)}`;
    });
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", `M ${points.join(" L ")}`);
    path.setAttribute("class", "crack-line");
    path.style.animationDelay = `${i * 0.06}s`;
    svg.appendChild(path);
  });

  placeholder.style.position = "relative";
  placeholder.appendChild(svg);
  placeholder.classList.add("crack-shake");
  await sleep(420);
}

/* ---- 接辞カード（スワイプで接辞帳へ保存） ---- */
async function renderResultScreen() {
  const wordMeaningEl = document.getElementById("word-meaning");
  wordMeaningEl.textContent = currentWordMeaning || "";
  wordMeaningEl.style.display = currentWordMeaning ? "block" : "none";

  const memoryTipEl = document.getElementById("memory-tip");
  memoryTipEl.textContent = currentMemoryTip || "";
  memoryTipEl.style.display = currentMemoryTip ? "block" : "none";

  document.getElementById("result-word-label").textContent = `${currentWord} の接辞`;
  const list = document.getElementById("affix-list");
  list.innerHTML = "";

  const hintSeen = await kvGet("affix_hint_seen", false);

  for (const [i, m] of currentMorphemes.entries()) {
    const existing = await idbGet("affixes", m.part.toLowerCase());
    const wrap = document.createElement("div");
    wrap.className = "affix-swipe";
    wrap.innerHTML = `
      <div class="reveal">✓ 接辞帳に保存</div>
      <div class="affix-card ${existing ? "saved" : ""}">
        ${existing ? '<span class="saved-tag">✓ 保存済み</span>' : ""}
        <div class="m">${escapeHtml(m.part)}</div>
        <div class="mean">${escapeHtml(m.meaning)}（${escapeHtml(m.reading)} / ${escapeHtml(m.origin)}）</div>
      </div>`;
    const card = wrap.querySelector(".affix-card");
    attachAffixSwipe(card, m, wrap);
    if (i === 0 && !hintSeen) {
      card.classList.add("wiggle");
      kvSet("affix_hint_seen", true);
      document.getElementById("swipe-hint").textContent = "← スライドで保存（初回ヒント）";
    }
    list.appendChild(wrap);
  }

  document.getElementById("goro-list").innerHTML = `<div class="empty-note">語呂合わせを準備中…</div>`;
  document.getElementById("regen-btn").disabled = true;
}

function attachAffixSwipe(card, morpheme, wrapEl) {
  let startX = 0, dx = 0, dragging = false;
  const threshold = 64;

  const onDown = (e) => {
    dragging = true; startX = clientX(e); dx = 0;
    card.style.transition = "none";
  };
  const onMove = (e) => {
    if (!dragging) return;
    dx = clientX(e) - startX;
    card.style.transform = `translateX(${dx}px)`;
  };
  const onUp = async () => {
    if (!dragging) return;
    dragging = false;
    card.style.transition = "transform .18s ease";
    if (Math.abs(dx) > threshold) {
      await saveAffixToBook(morpheme, currentWord);
      card.classList.add("saved");
      if (!card.querySelector(".saved-tag")) {
        const tag = document.createElement("span");
        tag.className = "saved-tag";
        tag.textContent = "✓ 保存済み";
        card.prepend(tag);
      }
      toast(`「${morpheme.part}」を接辞帳に保存しました`);
    }
    card.style.transform = "translateX(0)";
  };
  const clientX = (e) => (e.touches ? e.touches[0].clientX : e.clientX);

  card.addEventListener("pointerdown", onDown);
  card.addEventListener("pointermove", onMove);
  card.addEventListener("pointerup", onUp);
  card.addEventListener("pointerleave", onUp);
}

async function saveAffixToBook(m, word) {
  const key = m.part.toLowerCase();
  const existing = await idbGet("affixes", key);
  const sourceWords = new Set(existing ? existing.source_words : []);
  sourceWords.add(word);
  await idbPut("affixes", {
    part: key,
    display: m.part,
    reading: m.reading,
    meaning: m.meaning,
    origin: m.origin,
    source_words: Array.from(sourceWords),
    created_at: existing ? existing.created_at : Date.now(),
  });
}

/* ---- 語呂合わせ候補（タップ=読み上げ / 👍👎 / 保存） ---- */
async function loadGoroCandidates(provider, apiKey) {
  try {
    currentCandidates = await generateGoro(currentWord, currentMorphemes, provider, apiKey);
  } catch (err) {
    const list = document.getElementById("goro-list");
    list.innerHTML = "";
    const note = document.createElement("div");
    note.className = "empty-note";
    note.textContent = `語呂合わせの生成に失敗しました（${err.message}）。作り直すボタンでもう一度お試しください。`;
    list.appendChild(note);
    document.getElementById("regen-btn").disabled = false;
    console.error(err);
    return;
  }
  candidateStates = currentCandidates.map(() => ({ saved: false, feedback: null }));
  renderGoroList();
  document.getElementById("regen-btn").disabled = false;
}

function renderGoroList() {
  const list = document.getElementById("goro-list");
  list.innerHTML = "";
  currentCandidates.forEach((c, idx) => {
    const state = candidateStates[idx];
    const card = document.createElement("div");
    card.className = "goro-card";
    card.innerHTML = `
      ${idx === 0 ? '<span class="badge">NEW</span>' : ""}
      <div class="goro-tap" data-idx="${idx}">
        <span class="spk">🔊</span><span class="txt">「${escapeHtml(c.text)}」</span>
      </div>
      <div class="goro-actions">
        <button class="act-btn up ${state.feedback === "up" ? "on" : ""}" data-idx="${idx}" aria-label="良い">👍</button>
        <button class="act-btn down ${state.feedback === "down" ? "on" : ""}" data-idx="${idx}" aria-label="いまいち">👎</button>
        <button class="save-btn ${state.saved ? "on" : ""}" data-idx="${idx}">💾 ${state.saved ? "保存済み" : "保存"}</button>
      </div>`;
    list.appendChild(card);
  });

  list.querySelectorAll(".goro-tap").forEach((el) => {
    el.addEventListener("click", () => {
      const idx = Number(el.dataset.idx);
      el.classList.add("speaking");
      speak(currentCandidates[idx].text, () => el.classList.remove("speaking"));
    });
  });
  list.querySelectorAll(".act-btn.up").forEach((el) => {
    el.addEventListener("click", () => toggleFeedback(Number(el.dataset.idx), "up"));
  });
  list.querySelectorAll(".act-btn.down").forEach((el) => {
    el.addEventListener("click", () => toggleFeedback(Number(el.dataset.idx), "down"));
  });
  list.querySelectorAll(".save-btn").forEach((el) => {
    el.addEventListener("click", () => toggleSave(Number(el.dataset.idx)));
  });
}

function toggleFeedback(idx, kind) {
  const s = candidateStates[idx];
  s.feedback = s.feedback === kind ? null : kind;
  renderGoroList();
  persistIfSaved(idx);
}

async function toggleSave(idx) {
  const s = candidateStates[idx];
  s.saved = !s.saved;
  if (s.saved) {
    await persistIfSaved(idx);
    toast("記録帳に保存しました");
  } else {
    await idbDelete("words", wordCardId(currentWord, idx));
    toast("保存を取り消しました");
  }
  renderGoroList();
}

function wordCardId(word, idx) {
  return `${word.toLowerCase()}__${idx}`;
}

async function persistIfSaved(idx) {
  const s = candidateStates[idx];
  if (!s.saved) return;
  const c = currentCandidates[idx];
  const provider = await kvGet("provider", "openai");
  await idbPut("words", {
    id: wordCardId(currentWord, idx),
    word: currentWord,
    morphemes: currentMorphemes,
    goro_text: c.text,
    goro_highlight: c.highlight,
    provider,
    feedback: s.feedback,
    created_at: Date.now(),
  });
}

document.getElementById("regen-btn").addEventListener("click", async () => {
  const provider = await kvGet("provider", "openai");
  const apiKey = await loadApiKey(provider);
  document.getElementById("regen-btn").disabled = true;
  document.getElementById("goro-list").innerHTML = `<div class="empty-note">作り直しています…</div>`;
  await loadGoroCandidates(provider, apiKey);
});

/* ------------------------------------------------------------------ *
 * 10. 記録帳（単語帳 / 接辞帳）
 * ------------------------------------------------------------------ */
let bookTab = "words";
document.getElementById("tab-words").addEventListener("click", () => { bookTab = "words"; renderBookList(); });
document.getElementById("tab-affixes").addEventListener("click", () => { bookTab = "affixes"; renderBookList(); });
document.getElementById("book-search").addEventListener("input", () => renderBookList());

async function renderBookList() {
  document.getElementById("tab-words").classList.toggle("on", bookTab === "words");
  document.getElementById("tab-affixes").classList.toggle("on", bookTab === "affixes");

  const q = document.getElementById("book-search").value.trim().toLowerCase();
  const listEl = document.getElementById("book-list");
  listEl.innerHTML = "";

  if (bookTab === "words") {
    let rows = await idbGetAll("words");
    rows = rows.filter((r) => !q || r.word.toLowerCase().includes(q));
    rows.sort((a, b) => b.created_at - a.created_at);
    if (!rows.length) { listEl.innerHTML = `<div class="empty-note">まだ記録がありません</div>`; return; }
    rows.forEach((r) => {
      const row = buildBookRow(r.word, r.goro_text, r.created_at, () => speak(r.goro_text), async () => {
        await idbDelete("words", r.id);
        renderBookList();
      });
      listEl.appendChild(row);
    });
  } else {
    let rows = await idbGetAll("affixes");
    rows = rows.filter((r) => !q || r.part.toLowerCase().includes(q));
    rows.sort((a, b) => b.created_at - a.created_at);
    if (!rows.length) { listEl.innerHTML = `<div class="empty-note">まだ記録がありません</div>`; return; }
    rows.forEach((r) => {
      const row = buildBookRow(r.display, r.meaning, r.created_at, () => speak(r.reading), async () => {
        await idbDelete("affixes", r.part);
        renderBookList();
      });
      listEl.appendChild(row);
    });
  }
}

function buildBookRow(title, sub, createdAt, onTap, onDelete) {
  const wrap = document.createElement("div");
  wrap.className = "book-row";
  const date = new Date(createdAt);
  const dateStr = `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
  wrap.innerHTML = `
    <div class="del-reveal">🗑 削除</div>
    <div class="row-body">
      <div><div class="w">${escapeHtml(title)}</div><div class="g">${escapeHtml(sub)}</div></div>
      <div class="date">${dateStr}</div>
    </div>`;
  const body = wrap.querySelector(".row-body");

  let startX = 0, dx = 0, dragging = false, moved = false;
  const clientX = (e) => (e.touches ? e.touches[0].clientX : e.clientX);
  body.addEventListener("pointerdown", (e) => { dragging = true; moved = false; startX = clientX(e); body.style.transition = "none"; });
  body.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    dx = Math.min(0, clientX(e) - startX);
    if (Math.abs(dx) > 4) moved = true;
    body.style.transform = `translateX(${dx}px)`;
  });
  body.addEventListener("pointerup", () => {
    if (!dragging) return;
    dragging = false;
    body.style.transition = "transform .18s ease";
    if (dx < -80) { onDelete(); return; }
    body.style.transform = "translateX(0)";
    if (!moved) onTap();
  });
  body.addEventListener("pointerleave", () => {
    if (!dragging) return;
    dragging = false;
    body.style.transition = "transform .18s ease";
    body.style.transform = "translateX(0)";
  });
  return wrap;
}

/* ------------------------------------------------------------------ *
 * 11. API設定画面
 * ------------------------------------------------------------------ */
const PROVIDER_LABELS = { openai: "ChatGPT", gemini: "Gemini", claude: "Claude", groq: "Groq" };
let activeProvider = "openai";

async function initSettingsScreen() {
  activeProvider = await kvGet("provider", "openai");
  document.querySelectorAll(".provider-pill").forEach((p) => {
    p.classList.toggle("on", p.dataset.provider === activeProvider);
  });
  document.getElementById("key-label").textContent = `${PROVIDER_LABELS[activeProvider]} API キー`;
  document.getElementById("api-key-input").value = await loadApiKey(activeProvider);
  await refreshUsageDisplay();
}

document.querySelectorAll(".provider-pill").forEach((pill) => {
  pill.addEventListener("click", async () => {
    activeProvider = pill.dataset.provider;
    document.querySelectorAll(".provider-pill").forEach((p) => p.classList.toggle("on", p === pill));
    document.getElementById("key-label").textContent = `${PROVIDER_LABELS[activeProvider]} API キー`;
    document.getElementById("api-key-input").value = await loadApiKey(activeProvider);
    document.getElementById("settings-status").textContent = "";
  });
});

document.getElementById("toggle-key-visibility").addEventListener("click", () => {
  const input = document.getElementById("api-key-input");
  input.type = input.type === "password" ? "text" : "password";
});

document.getElementById("save-key-btn").addEventListener("click", async () => {
  const status = document.getElementById("settings-status");
  const btn = document.getElementById("save-key-btn");
  const key = document.getElementById("api-key-input").value.trim();
  if (!key) { status.textContent = "APIキーを入力してください"; return; }

  btn.disabled = true;
  status.textContent = "疎通確認中…";
  await kvSet("provider", activeProvider);
  await saveApiKey(activeProvider, key);

  try {
    await callAI(activeProvider, key, DECOMPOSE_SYS, "単語: test");
    status.textContent = "✓ 保存しました。接続を確認できました。";
  } catch (err) {
    status.textContent = `保存しましたが、疎通確認に失敗しました（${err.message}）。キーをご確認ください。`;
  }
  btn.disabled = false;
  await refreshUsageDisplay();
});

async function refreshUsageDisplay() {
  const calls = await kvGet("usage_calls", 0);
  const tokens = await kvGet("usage_tokens", 0);
  document.getElementById("usage-calls").textContent = `${calls} 回`;
  document.getElementById("usage-tokens").textContent = `約 ${tokens.toLocaleString()}`;
}

/* ------------------------------------------------------------------ *
 * 12. ユーティリティ / 初期化
 * ------------------------------------------------------------------ */
function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// 設定画面へ遷移するたび、選択中プロバイダのキー・使用量表示を最新化する
document.querySelectorAll('[data-nav="settings"]').forEach((el) => {
  el.addEventListener("click", initSettingsScreen);
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => console.warn("SW registration failed:", err));
  });
}

renderRecentChips();
