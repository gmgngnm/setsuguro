"use strict";

const ICON_VOLUME_ON = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>';
const ICON_VOLUME_OFF = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>';
function speakerIconHtml() {
  return `<svg class="icon-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_VOLUME_ON}</svg>`;
}

/* =========================================================================
   EnGoloyd — app.js
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
  "un":     { reading: "アン",     meaning: "〜でない・否定",      origin: "古英語 un-",         phonetic: "ʌn" },
  "re":     { reading: "リ",       meaning: "再び・戻す",          origin: "ラテン語 re-",       phonetic: "riː" },
  "dis":    { reading: "ディス",   meaning: "否定・分離",          origin: "ラテン語 dis-",      phonetic: "dɪs" },
  "pre":    { reading: "プリ",     meaning: "前もって",            origin: "ラテン語 prae-",     phonetic: "priː" },
  "post":   { reading: "ポスト",   meaning: "後で",                origin: "ラテン語 post",      phonetic: "poʊst" },
  "sub":    { reading: "サブ",     meaning: "下に・副次的な",      origin: "ラテン語 sub-",      phonetic: "sʌb" },
  "inter":  { reading: "インター", meaning: "〜の間",              origin: "ラテン語 inter-",    phonetic: "ˈɪntər" },
  "trans":  { reading: "トランス", meaning: "越えて・移す",        origin: "ラテン語 trans-",    phonetic: "trænz" },
  "ex":     { reading: "エクス",   meaning: "外へ",                origin: "ラテン語 ex-",       phonetic: "ɛks" },
  "in":     { reading: "イン",     meaning: "中へ／〜でない",      origin: "ラテン語 in-",       phonetic: "ɪn" },
  "co":     { reading: "コ",       meaning: "共に",                origin: "ラテン語 com-",      phonetic: "koʊ" },
  "con":    { reading: "コン",     meaning: "共に",                origin: "ラテン語 com- の異形", phonetic: "kən" },
  "com":    { reading: "コム",     meaning: "共に",                origin: "ラテン語 com-",      phonetic: "kəm" },
  "il":     { reading: "イル",     meaning: "〜でない",            origin: "ラテン語 in- の異形", phonetic: "ɪl" },
  "im":     { reading: "イム",     meaning: "〜でない",            origin: "ラテン語 in- の異形", phonetic: "ɪm" },
  "ir":     { reading: "イル",     meaning: "〜でない",            origin: "ラテン語 in- の異形", phonetic: "ɪr" },
  "dict":   { reading: "ジクト",   meaning: "言う",                origin: "ラテン語 dicere",    phonetic: "dɪkt" },
  "duc":    { reading: "デュク",   meaning: "導く",                origin: "ラテン語 ducere",    phonetic: "djuːk" },
  "tract":  { reading: "トラクト", meaning: "引く",                origin: "ラテン語 trahere",   phonetic: "trækt" },
  "port":   { reading: "ポート",   meaning: "運ぶ",                origin: "ラテン語 portare",   phonetic: "pɔːrt" },
  "spect":  { reading: "スペクト", meaning: "見る",                origin: "ラテン語 specere",   phonetic: "spɛkt" },
  "scrib":  { reading: "スクライブ", meaning: "書く",              origin: "ラテン語 scribere",  phonetic: "skraɪb" },
  "vol":    { reading: "ヴォル",   meaning: "望む・意志",          origin: "ラテン語 velle",     phonetic: "vɒl" },
  "ben":    { reading: "ベン",     meaning: "良い",                origin: "ラテン語 bene",      phonetic: "bɛn" },
  "mal":    { reading: "マル",     meaning: "悪い",                origin: "ラテン語 malus",     phonetic: "mæl" },
  "vid":    { reading: "ヴィド",   meaning: "見る",                origin: "ラテン語 videre",    phonetic: "vɪd" },
  "ject":   { reading: "ジェクト", meaning: "投げる",              origin: "ラテン語 jacere",    phonetic: "dʒɛkt" },
  "mit":    { reading: "ミット",   meaning: "送る",                origin: "ラテン語 mittere",   phonetic: "mɪt" },
  "serv":   { reading: "サーヴ",   meaning: "仕える・保つ",        origin: "ラテン語 servare",   phonetic: "sɜːrv" },
  "cred":   { reading: "クレド",   meaning: "信じる",              origin: "ラテン語 credere",   phonetic: "krɛd" },
  "gress":  { reading: "グレス",   meaning: "歩む",                origin: "ラテン語 gradi",     phonetic: "grɛs" },
  "ion":    { reading: "イオン",   meaning: "名詞化（〜すること）", origin: "ラテン語 -io",       phonetic: "ən" },
  "tion":   { reading: "ション",   meaning: "名詞化（〜すること）", origin: "ラテン語 -tio",      phonetic: "ʃən" },
  "ary":    { reading: "アリー",   meaning: "〜に関する（名詞化）", origin: "ラテン語 -arius",    phonetic: "ɛri" },
  "able":   { reading: "アブル",   meaning: "〜できる",            origin: "ラテン語 -abilis",   phonetic: "əbl" },
  "ible":   { reading: "イブル",   meaning: "〜できる",            origin: "ラテン語 -ibilis",   phonetic: "ɪbl" },
  "ful":    { reading: "フル",     meaning: "〜に満ちた",          origin: "古英語 -full",       phonetic: "fəl" },
  "less":   { reading: "レス",     meaning: "〜がない",            origin: "古英語 -leas",       phonetic: "ləs" },
  "ment":   { reading: "メント",   meaning: "名詞化（結果・状態）", origin: "ラテン語 -mentum",   phonetic: "mənt" },
  "ness":   { reading: "ネス",     meaning: "名詞化（性質・状態）", origin: "古英語 -nes",        phonetic: "nəs" },
  "ive":    { reading: "イヴ",     meaning: "〜の傾向がある",      origin: "ラテン語 -ivus",     phonetic: "ɪv" },
  "ous":    { reading: "アス",     meaning: "〜に満ちた",          origin: "ラテン語 -osus",     phonetic: "əs" },
  "ate":    { reading: "エイト",   meaning: "〜にする（動詞化）",  origin: "ラテン語 -atus",     phonetic: "eɪt" },
  "ist":    { reading: "イスト",   meaning: "〜する人",            origin: "ギリシャ語 -istes",  phonetic: "ɪst" },
  "er":     { reading: "アー",     meaning: "〜する人・もの",      origin: "古英語 -ere",        phonetic: "ər" },
  "ology":  { reading: "オロジー", meaning: "〜学",                origin: "ギリシャ語 -logia",  phonetic: "ˈɒlədʒi" },
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
  "まず、入力が実在の英単語かどうかを判定してください。単純なスペルミスとして妥当な範囲であれば、最も可能性の高い正しい英単語に修正し、word_existsをtrue、corrected_wordにその修正後の単語、was_correctedをtrueにしてください。誤りがなければword_existsをtrue、corrected_wordに入力そのもの、was_correctedをfalseにしてください。",
  "一方、意味のない文字列や、どの英単語のスペルミスとも考えにくいもの（実在するどの英単語からも大きくかけ離れている場合）は、word_existsをfalseにしてください。この場合、corrected_wordには入力そのものを入れ、word_meaning・memory_tipは空文字、morphemesは空配列で構いません（それ以上分析しないでください）。",
  "word_existsがtrueの場合のみ、以降の分割・分析を、修正後の単語（corrected_word）に対して行ってください。",
  "corrected_wordを接頭辞・語根・接尾辞（接辞 = morpheme）に分割してください。",
  `次の既知の接頭辞・接尾辞一覧を優先的に使ってください: ${KNOWN_AFFIXES}`,
  "単語がこの一覧のいずれかの文字列で始まる・終わる場合は、必ずその一覧の文字列と完全に一致する形で切り出してください（例: 一覧に'con'があれば'co'ではなく'con'を使う）。一覧にない場合のみ、教科書的に広く認められている接辞を使ってください。",
  "残った中間部分は語根として一つの要素にまとめ、接尾辞の一部（活用語尾や連結母音など）を語根に含めないでください。",
  "各要素を連結するとcorrected_wordと完全に一致するようにしてください（文字の欠落・重複がないこと）。",
  "各要素について、そのカタカナ読み（reading）・日本語での意味（meaning）・由来（origin、簡潔に）・国際音声記号によるその要素単体の発音記号（phonetic、IPA表記、スラッシュや括弧は付けない）を必ず付けてください。語根が一般に馴染みのないものでも、meaningとoriginを空にせず最も可能性の高い語源を推定して記入してください。",
  "あわせて、単語全体の日本語での意味（word_meaning、簡潔な訳語や説明）と、単語全体の国際音声記号による発音記号（word_phonetic、IPA表記、スラッシュや括弧は付けない）も必ず記入してください。",
  "さらに、各接辞の意味を踏まえたうえでこの単語をどう覚えればよいかを示す一文（memory_tip）を、日本語で100文字以内で必ず記入してください。",
  "出力は次のJSON形式のみを返し、それ以外の文章は一切書かないでください。",
  '{"word_exists":true,"corrected_word":"investigation","was_corrected":false,"word_meaning":"調査する・捜査する","word_phonetic":"ɪnˌvɛstɪˈɡeɪʃən","memory_tip":"in(中へ)+vestig(足跡を)+ation(たどること)で、痕跡を中まで追う=調査する、と覚える。","morphemes":[{"part":"dict","reading":"ジクト","meaning":"言う","origin":"ラテン語 dicere","phonetic":"dɪkt"},{"part":"ion","reading":"イオン","meaning":"名詞化（〜すること）","origin":"ラテン語 -io","phonetic":"ən"}]}',
  "例: investigation → in(接頭辞) / vestig(語根、探る) / ation(接尾辞、〜すること) のように、既知の接尾辞パターン（-ation, -tion, -able 等）はまとめて一つの要素として扱ってください。",
].join("\n");

function goroSystemPrompt(word, morphemes) {
  const partList = morphemes.map((m) => `${m.part}(${m.reading})`).join(" / ");
  return [
    "あなたは日本語の語呂合わせ作家です。",
    `対象の英単語は "${word}"。接辞とカタカナ読みは次の通りです: ${partList}`,
    "各接辞の【意味の直訳】ではなく【カタカナ読み（音）】を素材にして、音が似た日本語表現を組み合わせ、意味の通る一文の語呂合わせを作ってください。",
    "例: dict(ジクト)/ion(イオン)/ary(アリー) → 「軸と(dict)イオン(ion)がガチャン!とぶつかって起電力あり(ary)、なんて愉快な実験だ」",
    "最優先事項として、生成する一文は日本語として文法的に自然で、一つの筋が通った情景・出来事を描写する文にしてください。読みを詰め込むために言葉を無理やり羅列しただけの、意味のつながらない不自然な文は不可とします。誰が読んでも情景がすっと思い浮かぶ、破綻のない一文にしてください。",
    "各接辞の読みは一音も欠かさず文中のどこかに反映してください。ただし、読みをそのまま人名として使うこと（「〜という名の…」「〜さん」「〜くん」など、実在・架空を問わず人物の名前として読みを当てはめること）は禁止します。人物を登場させる場合は、名前ではなく役割や属性（店員、少年、隣人、先生 など）で表現してください。下品・差別的な表現も避けてください。",
    "各文は簡潔にしてください。目安として40〜60文字程度に収め、冗長な修飾語や説明は削ってください。",
    "文法的な自然さを保った上で、思わずクスッと笑えるようなユーモアのある内容にしてください。意外な組み合わせ、ズッコケるようなオチ、大げさな展開などを取り入れつつも、あくまで一つの筋の通った話として成立させてください。",
    "擬音語・擬態語（例: ドカン、ズキューン、ガタガタ、ワクワク、ニヤリ、ドキドキ など）も、文脈上自然に使える場合に限り取り入れ、コミカルで記憶に残りやすい一文にしてください。無理に押し込む必要はありません。",
    "候補を1件作ってください。文法的に自然で意味の通った一文になるよう、時間をかけてよく考えてから出力してください。意味のつながらない不自然な候補は不可とします。",
    "候補を1件、次のJSON形式のみを返してください。それ以外の文章は書かないでください。",
    '{"candidates":[{"text":"軸とイオンがガチャン!とぶつかって起電力発生、なんとも愉快な実験だ","highlight":[{"part":"dict","in_text":"軸と"}]}]}',
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
  sakura: {
    label: "さくらのAI",
    async chat(apiKey, systemPrompt, userPrompt, temperature) {
      const res = await fetch("https://api.ai.sakura.ad.jp/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "gpt-oss-120b",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature,
        }),
      });
      if (!res.ok) {
        const detail = await extractErrorDetail(res);
        throw new Error(`さくらのAI API エラー (${res.status})${detail ? `: ${detail}` : ""}`);
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
      return { part: m.part, reading: local.reading, meaning: local.meaning, origin: local.origin, phonetic: local.phonetic || "" };
    }
    return {
      part: m.part,
      reading: m.reading || m.part,
      meaning: m.meaning || MEANING_UNAVAILABLE,
      origin: m.origin || "—",
      phonetic: m.phonetic || "",
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
      return { part: m.part, reading: better.reading, meaning: better.meaning, origin: better.origin, phonetic: better.phonetic || m.phonetic || "" };
    }
    return m;
  });
}

async function decomposeWord(word, provider, apiKey) {
  try {
    const json = await callAI(provider, apiKey, DECOMPOSE_SYS, `単語: ${word}`, 0.2);
    if (json.word_exists === false) {
      return { correctedWord: word, wasCorrected: false, wordExists: false, meaning: "", phonetic: "", memoryTip: "", morphemes: [] };
    }
    let morphemes = reconcileWithLocalDict(json.morphemes);
    if (!morphemes.length) throw new Error("empty");
    let wordMeaning = json.word_meaning || "";
    let wordPhonetic = json.word_phonetic || "";
    let memoryTip = (json.memory_tip || "").slice(0, 100);

    if (!wordMeaning || !wordPhonetic || !memoryTip || morphemes.some((m) => m.meaning === MEANING_UNAVAILABLE)) {
      try {
        const retryPrompt = `単語: ${word}\n前回の応答ではword_meaning/word_phonetic/memory_tipや一部の接辞のreading/meaning/originが空でした。今回はすべての項目を必ず埋めてください。`;
        const retryJson = await callAI(provider, apiKey, DECOMPOSE_SYS, retryPrompt, 0.2);
        const retryMorphemes = reconcileWithLocalDict(retryJson.morphemes);
        if (retryMorphemes.length) morphemes = mergeMissingMeanings(morphemes, retryMorphemes);
        if (!wordMeaning) wordMeaning = retryJson.word_meaning || "";
        if (!wordPhonetic) wordPhonetic = retryJson.word_phonetic || "";
        if (!memoryTip) memoryTip = (retryJson.memory_tip || "").slice(0, 100);
      } catch (retryErr) {
        console.warn("Stage1 retry for missing meanings failed:", retryErr);
      }
    }

    const validCorrection = typeof json.corrected_word === "string" && /^[A-Za-z][A-Za-z'-]*$/.test(json.corrected_word);
    const correctedWord = validCorrection ? json.corrected_word : word;
    const wasCorrected = validCorrection && !!json.was_corrected && correctedWord.toLowerCase() !== word.toLowerCase();

    morphemes = await validateDecomposition(correctedWord, morphemes, provider, apiKey);

    return { correctedWord, wasCorrected, wordExists: true, meaning: wordMeaning, phonetic: wordPhonetic, memoryTip, morphemes };
  } catch (err) {
    console.warn("Stage1 failed, falling back to local dictionary:", err);
    return { correctedWord: word, wasCorrected: false, wordExists: true, meaning: "", phonetic: "", memoryTip: "", morphemes: fallbackDecompose(word) };
  }
}

function decomposeValidationPrompt(word, morphemes) {
  const partsList = morphemes
    .map((m, i) => `${i + 1}. ${m.part} - 読み:${m.reading} / 意味:${m.meaning} / 由来:${m.origin} / 発音記号:${m.phonetic}`)
    .join("\n");
  return [
    "あなたは英語の語源・形態素解析の専門家であり、厳格な校閲者です。",
    `対象の英単語は "${word}"。以下は、この単語を接頭辞・語根・接尾辞（接辞）に分割した結果です。`,
    partsList,
    "各要素について、次の点を厳しく確認してください。",
    "①各要素を順番に連結すると、対象の英単語と文字列として完全に一致すること（文字の欠落・重複・誤字がないこと）。",
    "②各要素への切り方が、言語学的・語源的に見て妥当な形態素分割になっていること（実在しない、あるいは明らかに誤った分割になっていないこと）。",
    "③各要素の意味（meaning）・由来（origin）・カタカナ読み（reading）・発音記号（phonetic）が、その要素について事実として正確であること（誤りや当てずっぽうの記載がないこと）。",
    "いずれかに誤りが見つかった場合は、正しい分割・正しい情報にすべて書き直してください。問題がなければそのまま使ってください。",
    "出力は、書き直した場合も含め、必ず全要素を次のJSON形式のみで返してください。それ以外の文章は一切書かないでください。",
    '{"morphemes":[{"part":"in","reading":"イン","meaning":"中へ","origin":"ラテン語 in-","phonetic":"ɪn"}]}',
  ].join("\n");
}

async function validateDecomposition(word, morphemes, provider, apiKey) {
  if (!morphemes.length) return morphemes;
  try {
    const sys = decomposeValidationPrompt(word, morphemes);
    const json = await callAI(provider, apiKey, sys, "各接辞を精査し、必要なら修正して、全要素をJSON形式で出力してください。", 0.2);
    const revised = reconcileWithLocalDict(json.morphemes);
    const concatenated = revised.map((m) => m.part).join("").toLowerCase();
    if (revised.length && concatenated === word.toLowerCase()) {
      return revised;
    }
    return morphemes;
  } catch (err) {
    console.warn("Decomposition validation pass failed, using original morphemes:", err);
    return morphemes;
  }
}

function goroValidationPrompt(word, morphemes, candidates) {
  const partList = morphemes.map((m) => `${m.part}(${m.reading})`).join(" / ");
  const candList = candidates.map((c, i) => `${i + 1}. ${c.text}`).join("\n");
  return [
    "あなたは日本語の語呂合わせの校閲者です。",
    `対象の英単語は "${word}"。接辞とカタカナ読みは次の通りです: ${partList}`,
    "以下は語呂合わせ候補の一文です。各文について、次の3点をすべて満たしているか厳しく確認してください。",
    "①読みを人名として扱っていないこと（「〜という名の…」「〜さん」「〜くん」など、実在・架空を問わず人物の名前として読みを当てはめていないこと）。",
    "②日本語として文法的に自然で、一つの筋が通った意味のある文になっていること（読みを詰め込むための不自然な言い回しがないこと）。",
    "③簡潔であること（40〜60文字程度が目安。冗長な修飾語や説明がないこと）。",
    "いずれかを満たしていない候補は、対象接辞の読みをすべて維持したまま書き直してください。3点をすべて満たしている候補はそのまま使ってください。",
    candList,
    "書き直した場合も含め、必ず1件を出力してください。次のJSON形式のみを返し、それ以外の文章は一切書かないでください。",
    '{"candidates":[{"text":"（最終テキスト）"}]}',
  ].join("\n");
}

async function validateGoroCandidates(word, morphemes, candidates, provider, apiKey) {
  try {
    const sys = goroValidationPrompt(word, morphemes, candidates);
    const json = await callAI(provider, apiKey, sys, "候補を精査し、必要なら書き直して、1件をJSON形式で出力してください。", 0.4);
    const revised = (json.candidates || []).map((c, i) => ({
      text: (c && c.text) || candidates[i]?.text || "",
      highlight: candidates[i]?.highlight || [],
    }));
    if (revised.length === candidates.length && revised.every((c) => c.text)) {
      return revised;
    }
    return candidates;
  } catch (err) {
    console.warn("Goro validation pass failed, using original candidates:", err);
    return candidates;
  }
}

async function generateGoro(word, morphemes, provider, apiKey) {
  const sys = goroSystemPrompt(word, morphemes);
  const json = await callAI(provider, apiKey, sys, "語呂合わせ候補を1件、JSON形式で出力してください。");
  let candidates = (json.candidates || []).map((c) => ({ text: c.text, highlight: c.highlight || [] }));
  if (!candidates.length) throw new Error("語呂合わせが生成できませんでした");

  candidates = await validateGoroCandidates(word, morphemes, candidates, provider, apiKey);

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
function speak(text, onEnd, lang = "ja-JP") {
  if (!("speechSynthesis" in window)) { if (onEnd) onEnd(); return; }
  window.speechSynthesis.cancel();
  const spoken = text.replace(/[（(][^）)]*[）)]/g, "").replace(/\s{2,}/g, " ").trim() || text;
  const u = new SpeechSynthesisUtterance(spoken);
  u.lang = lang;
  u.rate = 1.0;
  if (onEnd) u.onend = onEnd;
  window.speechSynthesis.speak(u);
}

/* ------------------------------------------------------------------ *
 * 6. 画面遷移
 * ------------------------------------------------------------------ */
function showScreen(id) {
  if (id !== "screen-memorize" && memorizeAutoPlay) {
    memorizeAutoPlay = false;
    clearMemorizeAutoTimer();
  }
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
document.getElementById("word-submit-btn").addEventListener("click", () => startDecompose(wordInput.value));

const micSection = document.getElementById("mic-section");
const micOverlayBtn = document.getElementById("mic-overlay-btn");
const micOverlayHint = document.getElementById("mic-overlay-hint");
const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;

if (!SpeechRecognitionCtor) {
  micSection.style.display = "none";
} else {
  let recognition = null;
  let listening = false;

  const startListening = () => {
    if (listening) return;
    listening = true;
    recognition = new SpeechRecognitionCtor();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    micOverlayBtn.classList.add("listening");
    micOverlayHint.textContent = "話してください…";
    recognition.onresult = (e) => {
      const transcript = (e.results[0]?.[0]?.transcript || "").trim();
      const firstWord = transcript.split(/\s+/)[0] || "";
      wordInput.value = firstWord;
      homeError.textContent = "";
      if (firstWord) startDecompose(firstWord);
    };
    recognition.onerror = () => {
      toast("音声入力に失敗しました");
    };
    recognition.onend = () => {
      listening = false;
      micOverlayBtn.classList.remove("listening");
      micOverlayHint.textContent = "長押しで入力";
    };
    recognition.start();
  };
  const stopListening = () => {
    if (!listening || !recognition) return;
    recognition.stop();
  };

  micOverlayBtn.addEventListener("pointerdown", startListening);
  micOverlayBtn.addEventListener("pointerup", stopListening);
  micOverlayBtn.addEventListener("pointerleave", stopListening);
  micOverlayBtn.addEventListener("pointercancel", stopListening);
}

/* 単語履歴が少ない(初回起動時・6件に満たない間)に埋め合わせで表示する、
   接辞分解しがいのある長め単語のサンプル */
const SAMPLE_WORDS = [
  "presentation", "reincarnation", "visualization", "immortality", "reconstruction",
  "architecture", "transformation", "disqualification", "misunderstanding", "unbelievable",
  "extraordinary", "international", "responsibility", "communication", "appreciation",
  "imagination", "popularity", "opportunity", "personality", "information",
  "application", "organization", "illustration", "examination", "celebration",
  "inspiration", "exploration", "observation", "publication", "graduation",
];

function pickSampleWords(count, exclude = []) {
  const excludeLower = new Set(exclude.map((w) => w.toLowerCase()));
  const pool = SAMPLE_WORDS.filter((w) => !excludeLower.has(w.toLowerCase()));
  const picked = [];
  while (picked.length < count && pool.length) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

/* APIキー未登録でも分割アニメーション・語呂合わせをそのまま体験できるよう、
   SAMPLE_WORDS全単語ぶんの分解結果・語呂合わせをあらかじめ用意したデモ用データ。
   AI応答(decomposeWord/generateGoroの戻り値)と同じ形に揃えてある */
const DEMO_WORD_DATA = {
  presentation: {
    meaning: "発表・提示すること", phonetic: "prɛzənˈteɪʃən",
    memoryTip: "pre(前もって)+sent(示す)+ation(すること)で、前もって示すこと=発表、と覚える。",
    morphemes: [
      { part: "pre", reading: "プリ", meaning: "前もって", origin: "ラテン語 prae-", phonetic: "priː" },
      { part: "sent", reading: "セント", meaning: "感じる・示す", origin: "ラテン語 sentire", phonetic: "sɛnt" },
      { part: "ation", reading: "エーション", meaning: "名詞化（〜すること）", origin: "ラテン語 -atio", phonetic: "eɪʃən" },
    ],
    goroText: "プリンにセント硬貨を飾り、エーション会場で発表するちょっと変わったプレゼンだ",
  },
  reincarnation: {
    meaning: "生まれ変わり・輪廻転生", phonetic: "ˌriːɪnkɑːrˈneɪʃən",
    memoryTip: "re(再び)+in(中へ)+carn(肉体)+ation(すること)で、再び肉体の中へ入ること=生まれ変わり、と覚える。",
    morphemes: [
      { part: "re", reading: "リ", meaning: "再び・戻す", origin: "ラテン語 re-", phonetic: "riː" },
      { part: "in", reading: "イン", meaning: "中へ", origin: "ラテン語 in-", phonetic: "ɪn" },
      { part: "carn", reading: "カーン", meaning: "肉体・肉", origin: "ラテン語 caro/carnis", phonetic: "kɑːrn" },
      { part: "ation", reading: "エーション", meaning: "名詞化（〜すること）", origin: "ラテン語 -atio", phonetic: "eɪʃən" },
    ],
    goroText: "「リ」と唱えインへ進むと、カーンと鐘が鳴りエーションの地で新しい体に生まれ変わった",
  },
  visualization: {
    meaning: "視覚化すること・可視化", phonetic: "ˌvɪʒuəlaɪˈzeɪʃən",
    memoryTip: "vis(見る)+ual(〜の)+ization(〜化すること)で、見えるようにすること=視覚化、と覚える。",
    morphemes: [
      { part: "vis", reading: "ヴィス", meaning: "見る", origin: "ラテン語 videre", phonetic: "vɪs" },
      { part: "ual", reading: "アル", meaning: "〜に関する", origin: "ラテン語 -alis", phonetic: "əl" },
      { part: "ization", reading: "ゼーション", meaning: "〜化すること", origin: "ラテン語 -izatio", phonetic: "zeɪʃən" },
    ],
    goroText: "ヴィスの視力訓練でアルバムをゼーション処理して、見えなかった図がくっきり浮かんだ",
  },
  immortality: {
    meaning: "不死・不滅", phonetic: "ˌɪmɔːrˈtæləti",
    memoryTip: "im(〜でない)+mort(死)+al(〜の)+ity(〜性)で、死なない性質=不死、と覚える。",
    morphemes: [
      { part: "im", reading: "イム", meaning: "〜でない", origin: "ラテン語 in- の異形", phonetic: "ɪm" },
      { part: "mort", reading: "モート", meaning: "死", origin: "ラテン語 mors/mortis", phonetic: "mɔːrt" },
      { part: "al", reading: "アル", meaning: "〜の", origin: "ラテン語 -alis", phonetic: "əl" },
      { part: "ity", reading: "イティ", meaning: "名詞化（〜性・〜さ）", origin: "ラテン語 -itas", phonetic: "ɪti" },
    ],
    goroText: "イムキャラがモートの谷でアルバムを開くと、イティと輝く不死の力が宿った",
  },
  reconstruction: {
    meaning: "再建・再構築", phonetic: "ˌriːkənˈstrʌkʃən",
    memoryTip: "re(再び)+con(共に)+struct(組み立てる)+ion(すること)で、再び共に組み立てること=再建、と覚える。",
    morphemes: [
      { part: "re", reading: "リ", meaning: "再び・戻す", origin: "ラテン語 re-", phonetic: "riː" },
      { part: "con", reading: "コン", meaning: "共に", origin: "ラテン語 com- の異形", phonetic: "kən" },
      { part: "struct", reading: "ストラクト", meaning: "組み立てる", origin: "ラテン語 struere", phonetic: "strʌkt" },
      { part: "ion", reading: "イオン", meaning: "名詞化（〜すること）", origin: "ラテン語 -io", phonetic: "ən" },
    ],
    goroText: "リフォーム班がコンビでストラクトの柱をイオンのように組み直し、街を再建した",
  },
  architecture: {
    meaning: "建築・構造", phonetic: "ˈɑːrkɪtektʃər",
    memoryTip: "archi(主要な)+tect(建てる)+ure(こと)で、中心となって建てること=建築、と覚える。",
    morphemes: [
      { part: "archi", reading: "アーキ", meaning: "主要な・第一の", origin: "ギリシャ語 arkhi-", phonetic: "ɑːrki" },
      { part: "tect", reading: "テクト", meaning: "建てる", origin: "ギリシャ語 tekton", phonetic: "tɛkt" },
      { part: "ure", reading: "ユア", meaning: "〜すること・こと", origin: "ラテン語 -ura", phonetic: "jʊər" },
    ],
    goroText: "アーキ隊長がテクト班にユアの設計図を渡し、壮大な建築が始まった",
  },
  transformation: {
    meaning: "変形・変化", phonetic: "ˌtrænsfərˈmeɪʃən",
    memoryTip: "trans(越えて)+form(形)+ation(すること)で、形を越えて変わること=変形、と覚える。",
    morphemes: [
      { part: "trans", reading: "トランス", meaning: "越えて・移す", origin: "ラテン語 trans-", phonetic: "trænz" },
      { part: "form", reading: "フォーム", meaning: "形", origin: "ラテン語 forma", phonetic: "fɔːrm" },
      { part: "ation", reading: "エーション", meaning: "名詞化（〜すること）", origin: "ラテン語 -atio", phonetic: "eɪʃən" },
    ],
    goroText: "トランス状態でフォームを変え、エーションの光とともに姿がガラリと変形した",
  },
  disqualification: {
    meaning: "資格取り消し・失格", phonetic: "ˌdɪskwɒlɪfɪˈkeɪʃən",
    memoryTip: "dis(否定)+quali(資格)+fication(〜化すること)で、資格を無くすこと=失格、と覚える。",
    morphemes: [
      { part: "dis", reading: "ディス", meaning: "否定・分離", origin: "ラテン語 dis-", phonetic: "dɪs" },
      { part: "quali", reading: "クオリ", meaning: "質・資格", origin: "ラテン語 qualis", phonetic: "kwɒli" },
      { part: "fication", reading: "フィケーション", meaning: "〜化すること", origin: "ラテン語 facere 由来", phonetic: "fɪkeɪʃən" },
    ],
    goroText: "ディスと審判が叫び、クオリ選手はフィケーションの書類とともに失格になった",
  },
  misunderstanding: {
    meaning: "誤解", phonetic: "ˌmɪsʌndərˈstændɪŋ",
    memoryTip: "mis(誤って)+under(下に)+stand(立つ)+ing(すること)で、誤った理解=誤解、と覚える。",
    morphemes: [
      { part: "mis", reading: "ミス", meaning: "誤って", origin: "古英語 mis-", phonetic: "mɪs" },
      { part: "under", reading: "アンダー", meaning: "下に", origin: "古英語 under", phonetic: "ʌndər" },
      { part: "stand", reading: "スタンド", meaning: "立つ", origin: "古英語 standan", phonetic: "stænd" },
      { part: "ing", reading: "イング", meaning: "名詞化（動名詞）", origin: "古英語 -ing", phonetic: "ɪŋ" },
    ],
    goroText: "ミスして相手のアンダーにスタンドし続けたせいで、イングとすれ違う誤解が生まれた",
  },
  unbelievable: {
    meaning: "信じられない", phonetic: "ˌʌnbɪˈliːvəbl",
    memoryTip: "un(〜でない)+believ(信じる)+able(〜できる)で、信じられない、と覚える。",
    morphemes: [
      { part: "un", reading: "アン", meaning: "〜でない・否定", origin: "古英語 un-", phonetic: "ʌn" },
      { part: "believ", reading: "ビリーヴ", meaning: "信じる", origin: "古英語 belyfan", phonetic: "bɪliːv" },
      { part: "able", reading: "アブル", meaning: "〜できる", origin: "ラテン語 -abilis", phonetic: "əbl" },
    ],
    goroText: "アンと驚く声とともに、ビリーヴした話がアブルほど現実離れしていた",
  },
  extraordinary: {
    meaning: "並外れた・驚くべき", phonetic: "ɪkˈstrɔːrdəneri",
    memoryTip: "extra(超えて)+ordin(順序)+ary(〜に関する)で、普通の順序を超えたこと=並外れた、と覚える。",
    morphemes: [
      { part: "extra", reading: "エクストラ", meaning: "外に・超えて", origin: "ラテン語 extra", phonetic: "ɛkstrə" },
      { part: "ordin", reading: "オーディン", meaning: "順序", origin: "ラテン語 ordo", phonetic: "ɔːrdɪn" },
      { part: "ary", reading: "アリー", meaning: "〜に関する（名詞化）", origin: "ラテン語 -arius", phonetic: "ɛri" },
    ],
    goroText: "エクストラの舞台でオーディン神がアリーと舞い、並外れた光景が広がった",
  },
  international: {
    meaning: "国際的な", phonetic: "ˌɪntərˈnæʃənəl",
    memoryTip: "inter(〜の間)+nation(国家)+al(〜の)で、国家の間の=国際的な、と覚える。",
    morphemes: [
      { part: "inter", reading: "インター", meaning: "〜の間", origin: "ラテン語 inter-", phonetic: "ˈɪntər" },
      { part: "nation", reading: "ネーション", meaning: "国家・国民", origin: "ラテン語 natio", phonetic: "neɪʃən" },
      { part: "al", reading: "アル", meaning: "〜の", origin: "ラテン語 -alis", phonetic: "əl" },
    ],
    goroText: "インターハイにネーションの旗が並び、アルな空気で国際色豊かな大会になった",
  },
  responsibility: {
    meaning: "責任", phonetic: "rɪˌspɒnsəˈbɪləti",
    memoryTip: "respons(応じる)+ibil(〜できる)+ity(〜性)で、応じられる性質=責任、と覚える。",
    morphemes: [
      { part: "respons", reading: "レスポンス", meaning: "応じる", origin: "ラテン語 respondere", phonetic: "rɪspɒns" },
      { part: "ibil", reading: "イビル", meaning: "〜できる", origin: "ラテン語 -ibilis", phonetic: "ɪbɪl" },
      { part: "ity", reading: "イティ", meaning: "名詞化（〜性・〜さ）", origin: "ラテン語 -itas", phonetic: "ɪti" },
    ],
    goroText: "レスポンスが遅れた部長はイビルな表情のままイティと頭を下げ、責任を認めた",
  },
  communication: {
    meaning: "伝達・意思疎通", phonetic: "kəˌmjuːnɪˈkeɪʃən",
    memoryTip: "com(共に)+muni(共有する)+cation(〜化すること)で、共に分かち合うこと=伝達、と覚える。",
    morphemes: [
      { part: "com", reading: "コム", meaning: "共に", origin: "ラテン語 com-", phonetic: "kəm" },
      { part: "muni", reading: "ミューニ", meaning: "共有する", origin: "ラテン語 munis", phonetic: "mjuːni" },
      { part: "cation", reading: "ケーション", meaning: "〜化すること", origin: "ラテン語 -catio", phonetic: "keɪʃən" },
    ],
    goroText: "コムジャーからミューニ信号が届き、ケーションの塔を通じて仲間と意思疎通できた",
  },
  appreciation: {
    meaning: "感謝・鑑賞", phonetic: "əˌpriːʃiˈeɪʃən",
    memoryTip: "ap(〜へ)+preci(価値)+ation(すること)で、価値を認めること=感謝、と覚える。",
    morphemes: [
      { part: "ap", reading: "アプ", meaning: "〜へ（ad-の異形）", origin: "ラテン語 ad-", phonetic: "æp" },
      { part: "preci", reading: "プレシ", meaning: "価値", origin: "ラテン語 pretium", phonetic: "prɛsi" },
      { part: "ation", reading: "エーション", meaning: "名詞化（〜すること）", origin: "ラテン語 -atio", phonetic: "eɪʃən" },
    ],
    goroText: "アプと手を挙げプレシ品の価値を見抜き、エーション式典で感謝を伝えた",
  },
  imagination: {
    meaning: "想像力", phonetic: "ɪˌmædʒɪˈneɪʃən",
    memoryTip: "imagin(心に描く)+ation(すること)で、想像すること=想像力、と覚える。",
    morphemes: [
      { part: "imagin", reading: "イマジン", meaning: "心に描く", origin: "ラテン語 imaginari", phonetic: "ɪmædʒɪn" },
      { part: "ation", reading: "エーション", meaning: "名詞化（〜すること）", origin: "ラテン語 -atio", phonetic: "eɪʃən" },
    ],
    goroText: "イマジンの国でエーションの光が広がり、子どもたちの想像力が羽ばたいた",
  },
  popularity: {
    meaning: "人気", phonetic: "ˌpɒpjuˈlærəti",
    memoryTip: "popul(民衆)+ar(〜の)+ity(〜性)で、民衆に好かれる性質=人気、と覚える。",
    morphemes: [
      { part: "popul", reading: "ポピュル", meaning: "民衆", origin: "ラテン語 populus", phonetic: "pɒpjʊl" },
      { part: "ar", reading: "アー", meaning: "〜の", origin: "ラテン語 -aris", phonetic: "ər" },
      { part: "ity", reading: "イティ", meaning: "名詞化（〜性・〜さ）", origin: "ラテン語 -itas", phonetic: "ɪti" },
    ],
    goroText: "ポピュルという歌姫がアーな衣装でイティと登場し、一気に人気者になった",
  },
  opportunity: {
    meaning: "好機・機会", phonetic: "ˌɒpərˈtjuːnəti",
    memoryTip: "op(〜へ)+portun(港へ向いた)+ity(〜性)で、港へ向かう好い頃合い=好機、と覚える。",
    morphemes: [
      { part: "op", reading: "オプ", meaning: "〜へ向かって（ob-の異形）", origin: "ラテン語 ob-", phonetic: "ɒp" },
      { part: "portun", reading: "ポーチュン", meaning: "港へ向いた・好機の", origin: "ラテン語 portus 由来", phonetic: "pɔːrtjuːn" },
      { part: "ity", reading: "イティ", meaning: "名詞化（〜性・〜さ）", origin: "ラテン語 -itas", phonetic: "ɪti" },
    ],
    goroText: "オプと号令がかかりポーチュン号がイティと出港、絶好の好機が訪れた",
  },
  personality: {
    meaning: "個性・人格", phonetic: "ˌpɜːrsəˈnæləti",
    memoryTip: "person(人)+al(〜の)+ity(〜性)で、人としての性質=個性、と覚える。",
    morphemes: [
      { part: "person", reading: "パーソン", meaning: "人", origin: "ラテン語 persona", phonetic: "pɜːrsən" },
      { part: "al", reading: "アル", meaning: "〜の", origin: "ラテン語 -alis", phonetic: "əl" },
      { part: "ity", reading: "イティ", meaning: "名詞化（〜性・〜さ）", origin: "ラテン語 -itas", phonetic: "ɪti" },
    ],
    goroText: "パーソン先輩がアルバムを開き、イティと語る姿ににじみ出る強い個性があった",
  },
  information: {
    meaning: "情報", phonetic: "ˌɪnfərˈmeɪʃən",
    memoryTip: "in(中へ)+form(形)+ation(すること)で、中に形作られたもの=情報、と覚える。",
    morphemes: [
      { part: "in", reading: "イン", meaning: "中へ", origin: "ラテン語 in-", phonetic: "ɪn" },
      { part: "form", reading: "フォーム", meaning: "形", origin: "ラテン語 forma", phonetic: "fɔːrm" },
      { part: "ation", reading: "エーション", meaning: "名詞化（〜すること）", origin: "ラテン語 -atio", phonetic: "eɪʃən" },
    ],
    goroText: "インした部屋でフォームに記入すると、エーション画面に最新情報が表示された",
  },
  application: {
    meaning: "申請・応用・アプリ", phonetic: "ˌæplɪˈkeɪʃən",
    memoryTip: "ap(〜へ)+plic(重ねる)+ation(すること)で、重ねて当てはめること=応用・申請、と覚える。",
    morphemes: [
      { part: "ap", reading: "アプ", meaning: "〜へ（ad-の異形）", origin: "ラテン語 ad-", phonetic: "æp" },
      { part: "plic", reading: "プリク", meaning: "重ねる・折りたたむ", origin: "ラテン語 plicare", phonetic: "plɪk" },
      { part: "ation", reading: "エーション", meaning: "名詞化（〜すること）", origin: "ラテン語 -atio", phonetic: "eɪʃən" },
    ],
    goroText: "アプと声をかけプリクを重ね、エーション窓口で応募申請を済ませた",
  },
  organization: {
    meaning: "組織・団体", phonetic: "ˌɔːrɡənaɪˈzeɪʃən",
    memoryTip: "organ(組織)+iz(〜化する)+ation(すること)で、組織化すること=組織、と覚える。",
    morphemes: [
      { part: "organ", reading: "オーガン", meaning: "器官・組織", origin: "ギリシャ語 organon", phonetic: "ɔːrgən" },
      { part: "iz", reading: "アイズ", meaning: "〜化する", origin: "ギリシャ語 -izein", phonetic: "aɪz" },
      { part: "ation", reading: "エーション", meaning: "名詞化（〜すること）", origin: "ラテン語 -atio", phonetic: "eɪʃən" },
    ],
    goroText: "オーガン奏者がアイズを合図にエーションホールへ集まり、新しい組織が生まれた",
  },
  illustration: {
    meaning: "説明図・イラスト", phonetic: "ˌɪləˈstreɪʃən",
    memoryTip: "il(〜の中へ)+lustr(輝かせる)+ation(すること)で、中を輝かせて示すこと=説明図、と覚える。",
    morphemes: [
      { part: "il", reading: "イル", meaning: "〜の中へ・〜の上に", origin: "ラテン語 in- の異形（否定ではない用法）", phonetic: "ɪl" },
      { part: "lustr", reading: "ラストル", meaning: "輝かせる", origin: "ラテン語 lustrare", phonetic: "lʌstər" },
      { part: "ation", reading: "エーション", meaning: "名詞化（〜すること）", origin: "ラテン語 -atio", phonetic: "eɪʃən" },
    ],
    goroText: "イルカがラストルの光で照らされ、エーションの紙面に美しいイラストが描かれた",
  },
  examination: {
    meaning: "試験・検査", phonetic: "ɪɡˌzæmɪˈneɪʃən",
    memoryTip: "ex(外へ)+amin(調べる)+ation(すること)で、外に調べ出すこと=試験、と覚える。",
    morphemes: [
      { part: "ex", reading: "エクス", meaning: "外へ", origin: "ラテン語 ex-", phonetic: "ɛks" },
      { part: "amin", reading: "アミン", meaning: "調べる", origin: "ラテン語 examinare", phonetic: "æmɪn" },
      { part: "ation", reading: "エーション", meaning: "名詞化（〜すること）", origin: "ラテン語 -atio", phonetic: "eɪʃən" },
    ],
    goroText: "エクスと呼ばれた受験生がアミン先生の前でエーション試験に挑んだ",
  },
  celebration: {
    meaning: "祝賀・お祝い", phonetic: "ˌsɛlɪˈbreɪʃən",
    memoryTip: "celebr(祝う)+ation(すること)で、祝うこと=お祝い、と覚える。",
    morphemes: [
      { part: "celebr", reading: "セレブル", meaning: "祝う", origin: "ラテン語 celebrare", phonetic: "sɛləbr" },
      { part: "ation", reading: "エーション", meaning: "名詞化（〜すること）", origin: "ラテン語 -atio", phonetic: "eɪʃən" },
    ],
    goroText: "セレブルな面々が集まり、エーション会場は盛大なお祝いムードに包まれた",
  },
  inspiration: {
    meaning: "ひらめき・霊感", phonetic: "ˌɪnspəˈreɪʃən",
    memoryTip: "in(中へ)+spir(息をする)+ation(すること)で、中に息を吹き込むこと=ひらめき、と覚える。",
    morphemes: [
      { part: "in", reading: "イン", meaning: "中へ", origin: "ラテン語 in-", phonetic: "ɪn" },
      { part: "spir", reading: "スピル", meaning: "息をする", origin: "ラテン語 spirare", phonetic: "spɪr" },
      { part: "ation", reading: "エーション", meaning: "名詞化（〜すること）", origin: "ラテン語 -atio", phonetic: "eɪʃən" },
    ],
    goroText: "インした瞬間スピルと深呼吸すると、エーションのごとくひらめきが降ってきた",
  },
  exploration: {
    meaning: "探検・探査", phonetic: "ˌɛkspləˈreɪʃən",
    memoryTip: "ex(外へ)+plor(探し求める)+ation(すること)で、外へ探し求めること=探検、と覚える。",
    morphemes: [
      { part: "ex", reading: "エクス", meaning: "外へ", origin: "ラテン語 ex-", phonetic: "ɛks" },
      { part: "plor", reading: "プロール", meaning: "叫ぶ・探し求める", origin: "ラテン語 plorare", phonetic: "plɔːr" },
      { part: "ation", reading: "エーション", meaning: "名詞化（〜すること）", origin: "ラテン語 -atio", phonetic: "eɪʃən" },
    ],
    goroText: "エクス隊がプロールの森を進み、エーションの奥地で未知の遺跡を探検した",
  },
  observation: {
    meaning: "観察", phonetic: "ˌɒbzərˈveɪʃən",
    memoryTip: "ob(〜に向かって)+serv(見張る)+ation(すること)で、見張ること=観察、と覚える。",
    morphemes: [
      { part: "ob", reading: "オブ", meaning: "〜に向かって", origin: "ラテン語 ob-", phonetic: "ɒb" },
      { part: "serv", reading: "サーヴ", meaning: "仕える・保つ", origin: "ラテン語 servare", phonetic: "sɜːrv" },
      { part: "ation", reading: "エーション", meaning: "名詞化（〜すること）", origin: "ラテン語 -atio", phonetic: "eɪʃən" },
    ],
    goroText: "オブと望遠鏡を構えサーヴ班がエーション星を一晩じっくり観察した",
  },
  publication: {
    meaning: "出版・公表", phonetic: "ˌpʌblɪˈkeɪʃən",
    memoryTip: "publ(民衆の)+ic(〜の)+ation(すること)で、公にすること=出版、と覚える。",
    morphemes: [
      { part: "publ", reading: "パブル", meaning: "民衆の", origin: "ラテン語 publicus", phonetic: "pʌbl" },
      { part: "ic", reading: "イク", meaning: "〜の（形容詞化）", origin: "ラテン語 -icus", phonetic: "ɪk" },
      { part: "ation", reading: "エーション", meaning: "名詞化（〜すること）", origin: "ラテン語 -atio", phonetic: "eɪʃən" },
    ],
    goroText: "パブルな広場でイクつもの原稿がエーション印刷され、新刊が出版された",
  },
  graduation: {
    meaning: "卒業", phonetic: "ˌɡrædʒuˈeɪʃən",
    memoryTip: "gradu(段階を踏む)+ation(すること)で、段階を踏み終えること=卒業、と覚える。",
    morphemes: [
      { part: "gradu", reading: "グラジュ", meaning: "段階を踏む", origin: "ラテン語 gradus", phonetic: "grædʒu" },
      { part: "ation", reading: "エーション", meaning: "名詞化（〜すること）", origin: "ラテン語 -atio", phonetic: "eɪʃən" },
    ],
    goroText: "グラジュ坂を上りきった生徒たちが、エーション式典で晴れやかに卒業した",
  },
};

async function renderRecentChips() {
  const recent = await kvGet("recent_words", []);
  const words = recent.length < 6 ? [...recent, ...pickSampleWords(6 - recent.length, recent)] : recent;
  const wrap = document.getElementById("recent-chips");
  wrap.innerHTML = "";
  words.forEach((w) => {
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
let currentWordPhonetic = "";
let currentMemoryTip = "";
let currentMorphemes = [];
let currentCandidates = [];

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
  const demo = !apiKey ? DEMO_WORD_DATA[word.toLowerCase()] : null;
  if (!apiKey && !demo) {
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
  decomposeWordMeaningEl.innerHTML = "";
  decomposeWordMeaningEl.classList.remove("show");
  decomposeWordMeaningEl.style.display = "none";
  const decomposeMemoryTipEl = document.getElementById("decompose-memory-tip");
  decomposeMemoryTipEl.textContent = "";
  decomposeMemoryTipEl.classList.remove("show");
  decomposeMemoryTipEl.style.display = "none";
  const errorMsgEl = document.getElementById("word-error-msg");
  errorMsgEl.textContent = "";
  errorMsgEl.classList.remove("show");
  errorMsgEl.style.display = "none";

  const placeholder = document.createElement("div");
  placeholder.className = "morph word-pulse";
  placeholder.textContent = word;
  splitEl.appendChild(placeholder);

  let morphemes;
  if (demo) {
    morphemes = demo.morphemes;
    currentWordMeaning = demo.meaning;
    currentWordPhonetic = demo.phonetic;
    currentMemoryTip = demo.memoryTip;
  } else {
    try {
      const decomposed = await decomposeWord(word, provider, apiKey);
      if (decomposed.wordExists === false) {
        await playNotFoundError(placeholder, word);
        return;
      }
      morphemes = decomposed.morphemes;
      currentWordMeaning = decomposed.meaning;
      currentWordPhonetic = decomposed.phonetic;
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
  }
  currentMorphemes = morphemes;

  /* Stage2(語呂合わせ生成)は接辞が確定した時点で先行開始し、分解アニメーションの
     再生時間と並行して進める。結果画面へは、両方が揃うまで遷移しない。
     デモ単語(APIキー未登録時)は、あらかじめ用意した語呂合わせをそのまま使う */
  document.getElementById("regen-btn").disabled = true;
  let goroDone = false;
  let goroPromise;
  if (demo) {
    currentCandidates = [{ text: demo.goroText, highlight: [] }];
    renderGoroList();
    goroDone = true;
    goroPromise = Promise.resolve();
    document.getElementById("regen-btn").disabled = false;
  } else {
    goroPromise = loadGoroCandidates(provider, apiKey).then(() => { goroDone = true; });
  }

  const animStyle = DECOMPOSE_ANIM_STYLES[await kvGet("decompose_anim", "crack")] || DECOMPOSE_ANIM_STYLES.crack;
  await animStyle.intro(placeholder, currentWord, morphemes);
  placeholder.remove();

  if (currentWordMeaning) {
    const phoneticHtml = currentWordPhonetic ? `<span class="phonetic">[${escapeHtml(currentWordPhonetic)}]</span>` : "";
    decomposeWordMeaningEl.innerHTML = `<div class="word-meaning-word">${escapeHtml(currentWord)}${phoneticHtml}</div><div class="word-meaning-text">${escapeHtml(currentWordMeaning)}</div>`;
    decomposeWordMeaningEl.style.display = "block";
    requestAnimationFrame(() => decomposeWordMeaningEl.classList.add("show"));
  }

  splitEl.innerHTML = "";
  const mid = (morphemes.length - 1) / 2;
  morphemes.forEach((m, i) => {
    const el = document.createElement("div");
    el.className = `morph ${animStyle.tileClass}`;
    Object.entries(animStyle.tileVars(i, mid)).forEach(([prop, val]) => el.style.setProperty(prop, val));
    el.style.animationDelay = `${i * 0.08}s`;

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

  const SHATTER_MS = 650;
  const STAGGER_MS = 460;
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

  const totalDelay = lastMeaningDelay + 1700;
  await sleep(totalDelay);

  if (!goroDone) {
    document.getElementById("decompose-label").textContent = "語呂合わせを準備中…";
    spinnerRow.style.display = "flex";
    await goroPromise;
    spinnerRow.style.display = "none";
  }

  renderResultScreen();
  showScreen("screen-result");
}

/* スペルミスを検出した場合、赤く揺れてから正しい綴りにクロスフェードする */
/* originalWord→correctedWordの文字単位の差分を取り、correctedWordの各文字が
   変更箇所かどうかを返す（最長共通部分列に含まれない文字を「変更あり」とする） */
function diffCorrectedWordChars(originalWord, correctedWord) {
  const a = originalWord.toLowerCase();
  const b = correctedWord.toLowerCase();
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const matched = new Array(m).fill(false);
  let i = n, j = m;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      matched[j - 1] = true;
      i--; j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  return correctedWord.split("").map((char, idx) => ({ char, changed: !matched[idx] }));
}

/* placeholderはdisplay:flex;flex-direction:columnのため、差分spanを混ぜたHTMLを
   直接innerHTMLに入れるとテキストの各断片が別々のflexアイテムとして縦積みされてしまう。
   1つのspanで包んで単一のflexアイテムにし、中は通常のインライン折り返しにする */
function correctedWordHtml(originalWord, correctedWord) {
  const inner = diffCorrectedWordChars(originalWord, correctedWord)
    .map((c) => (c.changed ? `<span class="letter-fix">${escapeHtml(c.char)}</span>` : escapeHtml(c.char)))
    .join("");
  return `<span class="word-fix-wrap">${inner}</span>`;
}

async function playSpellingFix(placeholder, originalWord, correctedWord) {
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    placeholder.innerHTML = correctedWordHtml(originalWord, correctedWord);
    return;
  }
  placeholder.classList.remove("word-pulse");
  placeholder.classList.add("card-flip-out");
  await sleep(250);
  placeholder.innerHTML = correctedWordHtml(originalWord, correctedWord);
  placeholder.classList.remove("card-flip-out");
  placeholder.classList.add("card-flip-in");
  await sleep(250);
  placeholder.classList.remove("card-flip-in");
}

/* 実在しない単語と判定した場合、単語ブロックをゴミ箱に投げ込んでからホームへ戻る */
async function playNotFoundError(placeholder, word) {
  const splitEl = document.getElementById("word-split");
  const errorMsgEl = document.getElementById("word-error-msg");
  const trashEl = document.createElement("div");
  trashEl.className = "trash-can";
  trashEl.textContent = "🗑️";
  splitEl.appendChild(trashEl);

  if (reducedMotion()) {
    placeholder.remove();
  } else {
    placeholder.classList.remove("word-pulse");
    placeholder.classList.add("trash-shake");
    await sleep(400);
    placeholder.classList.remove("trash-shake");
    placeholder.classList.add("trash-toss");
    trashEl.classList.add("show");
    await sleep(600);
    placeholder.remove();
  }

  errorMsgEl.textContent = `"${word}" という英単語は見つかりませんでした`;
  errorMsgEl.style.display = "block";
  requestAnimationFrame(() => errorMsgEl.classList.add("show"));

  await sleep(reducedMotion() ? 900 : 1300);

  showScreen("screen-home");
  wordInput.value = "";
  homeError.textContent = "";
  errorMsgEl.classList.remove("show");
  errorMsgEl.style.display = "none";
  errorMsgEl.textContent = "";
  splitEl.innerHTML = "";
}

function reducedMotion() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* ---- 分解アニメーション（設定画面から選択可能） ---- */
const DECOMPOSE_ANIM_STYLES = {
  crack: {
    label: "ひび割れ",
    tileClass: "shatter-in",
    tileVars(i, mid) {
      const dir = i - mid;
      return { "--from-x": `${-dir * 22}px`, "--from-y": "0px", "--from-rot": `${dir * 5}deg` };
    },
    /* 単語ブロックに亀裂が入り、揺れてから砕ける */
    async intro(placeholder, word, morphemes) {
      if (reducedMotion()) return;

      placeholder.classList.remove("word-pulse");
      /* word-pulse解除でmax-widthが150pxに縮むと長い単語が2行に折り返り、
         幅の割合だけで算出する亀裂の位置がずれるため、計測前に1行表示・広めの幅に固定する */
      placeholder.style.whiteSpace = "nowrap";
      placeholder.style.maxWidth = "min(90vw, 320px)";
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
        path.style.animationDelay = `${i * 0.09}s`;
        svg.appendChild(path);
      });

      placeholder.style.position = "relative";
      placeholder.appendChild(svg);
      placeholder.classList.add("crack-shake");
      await sleep(620);
    },
  },

  burst: {
    label: "爆発",
    tileClass: "burst-in",
    tileVars(i, mid) {
      const dir = i - mid || (i % 2 === 0 ? -0.5 : 0.5);
      const dist = 60 + Math.abs(dir) * 32;
      return {
        "--from-x": `${Math.sign(dir) * dist}px`,
        "--from-y": `${-28 - Math.random() * 26}px`,
        "--from-rot": `${dir * 36}deg`,
      };
    },
    /* 単語ブロックが閃光と火花を伴って本格的に爆発する */
    async intro(placeholder) {
      if (reducedMotion()) return;

      placeholder.classList.remove("word-pulse");
      const rect = placeholder.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      placeholder.style.position = "relative";

      const core = document.createElement("div");
      core.className = "burst-core-flash";
      core.style.left = `${cx}px`;
      core.style.top = `${cy}px`;
      placeholder.appendChild(core);

      const ring1 = document.createElement("div");
      ring1.className = "burst-flash ring1";
      ring1.style.left = `${cx}px`;
      ring1.style.top = `${cy}px`;
      placeholder.appendChild(ring1);

      const ring2 = document.createElement("div");
      ring2.className = "burst-flash ring2";
      ring2.style.left = `${cx}px`;
      ring2.style.top = `${cy}px`;
      placeholder.appendChild(ring2);

      const sparkCount = 12;
      for (let i = 0; i < sparkCount; i++) {
        const spark = document.createElement("div");
        spark.className = "burst-spark";
        const angle = (Math.PI * 2 * i) / sparkCount + (Math.random() - 0.5) * 0.5;
        const dist = 40 + Math.random() * 60;
        spark.style.left = `${cx}px`;
        spark.style.top = `${cy}px`;
        spark.style.setProperty("--spark-x", `${Math.cos(angle) * dist}px`);
        spark.style.setProperty("--spark-y", `${Math.sin(angle) * dist}px`);
        spark.style.animationDelay = `${Math.random() * 0.08}s`;
        placeholder.appendChild(spark);
      }

      placeholder.classList.add("burst-shake");
      await sleep(900);
    },
  },

  spin: {
    label: "回転",
    tileClass: "spin-in",
    tileVars(i) {
      const fromY = i % 2 === 0 ? -38 : 38;
      const rot = i % 2 === 0 ? -200 : 200;
      return { "--from-x": "0px", "--from-y": `${fromY}px`, "--from-rot": `${rot}deg` };
    },
    /* 単語ブロックが勢いよく回って消える */
    async intro(placeholder) {
      if (reducedMotion()) return;
      placeholder.classList.remove("word-pulse");
      placeholder.classList.add("spin-wind-up");
      await sleep(620);
    },
  },

  warp: {
    label: "ワープ",
    tileClass: "warp-in",
    tileVars(i) {
      return { "--from-x": "0px", "--from-y": `${-60 - i * 14}px`, "--from-rot": "0deg" };
    },
    /* 単語ブロックが光の帯とともに縦に圧縮されてワープする */
    async intro(placeholder) {
      if (reducedMotion()) return;
      placeholder.classList.remove("word-pulse");
      placeholder.style.position = "relative";
      const beam = document.createElement("div");
      beam.className = "warp-beam";
      placeholder.appendChild(beam);
      placeholder.classList.add("warp-shrink");
      await sleep(560);
    },
  },

  glitch: {
    label: "グリッチ",
    tileClass: "glitch-in",
    tileVars(i) {
      const jitter = (i % 2 === 0 ? -1 : 1) * (6 + (i % 3) * 4);
      return { "--from-x": `${jitter}px`, "--from-y": "0px", "--from-rot": "0deg" };
    },
    /* 単語ブロックがRGBずれとスキャンラインで乱れて消える */
    async intro(placeholder) {
      if (reducedMotion()) return;
      placeholder.classList.remove("word-pulse");
      placeholder.style.position = "relative";
      const text = placeholder.textContent;
      const cyan = document.createElement("div");
      cyan.className = "glitch-ghost cyan";
      cyan.textContent = text;
      const magenta = document.createElement("div");
      magenta.className = "glitch-ghost magenta";
      magenta.textContent = text;
      placeholder.appendChild(cyan);
      placeholder.appendChild(magenta);
      placeholder.classList.add("glitch-out");
      await sleep(460);
    },
  },

  confetti: {
    label: "紙吹雪",
    tileClass: "confetti-in",
    tileVars(i) {
      const fromY = i % 2 === 0 ? -36 : 36;
      const rot = i % 2 === 0 ? -140 : 140;
      return { "--from-x": "0px", "--from-y": `${fromY}px`, "--from-rot": `${rot}deg` };
    },
    /* 単語ブロックが色とりどりの紙吹雪とともに弾ける */
    async intro(placeholder) {
      if (reducedMotion()) return;
      placeholder.classList.remove("word-pulse");
      placeholder.style.position = "relative";
      const rect = placeholder.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const colors = ["#FFD166", "#EF476F", "#06D6A0", "#118AB2", "#8B5CF6"];
      const pieceCount = 16;
      for (let i = 0; i < pieceCount; i++) {
        const piece = document.createElement("div");
        piece.className = "confetti-piece";
        const angle = (Math.PI * 2 * i) / pieceCount + (Math.random() - 0.5) * 0.6;
        const dist = 50 + Math.random() * 60;
        piece.style.left = `${cx}px`;
        piece.style.top = `${cy}px`;
        piece.style.background = colors[i % colors.length];
        piece.style.setProperty("--cx", `${Math.cos(angle) * dist}px`);
        piece.style.setProperty("--cy", `${Math.sin(angle) * dist + 24}px`);
        piece.style.setProperty("--crot", `${(Math.random() - 0.5) * 720}deg`);
        piece.style.animationDelay = `${Math.random() * 0.06}s`;
        placeholder.appendChild(piece);
      }
      placeholder.classList.add("confetti-pop");
      await sleep(780);
    },
  },

  scatter: {
    label: "散乱",
    tileClass: "scatter-in",
    tileVars(i) {
      const angle = (i * 137.5) % 360;
      const rad = (angle * Math.PI) / 180;
      const dist = 90 + (i % 3) * 30;
      return {
        "--from-x": `${Math.cos(rad) * dist}px`,
        "--from-y": `${Math.sin(rad) * dist}px`,
        "--from-rot": `${(i % 2 === 0 ? -1 : 1) * (180 + i * 40)}deg`,
      };
    },
    /* 単語ブロックが細かい欠片となって四方へ散らばり、接辞として再構成される */
    async intro(placeholder) {
      if (reducedMotion()) return;
      placeholder.classList.remove("word-pulse");
      placeholder.style.position = "relative";
      const rect = placeholder.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const shardCount = 14;
      for (let i = 0; i < shardCount; i++) {
        const shard = document.createElement("div");
        shard.className = "scatter-shard";
        const angle = Math.random() * Math.PI * 2;
        const dist = 40 + Math.random() * 70;
        shard.style.left = `${cx}px`;
        shard.style.top = `${cy}px`;
        shard.style.setProperty("--sx", `${Math.cos(angle) * dist}px`);
        shard.style.setProperty("--sy", `${Math.sin(angle) * dist}px`);
        shard.style.setProperty("--srot", `${(Math.random() - 0.5) * 500}deg`);
        shard.style.animationDelay = `${Math.random() * 0.05}s`;
        placeholder.appendChild(shard);
      }
      placeholder.classList.add("scatter-out");
      await sleep(560);
    },
  },

  centrifuge: {
    label: "遠心分離",
    tileClass: "centrifuge-in",
    tileVars(i, mid) {
      const dir = i - mid || (i % 2 === 0 ? -0.5 : 0.5);
      return {
        "--from-x": `${Math.sign(dir) * (70 + Math.abs(dir) * 26)}px`,
        "--from-y": "0px",
        "--from-rot": `${Math.sign(dir) * 720}deg`,
      };
    },
    /* 単語ブロックの回転がどんどん加速し、勢いよく弾け飛んで接辞が現れる */
    async intro(placeholder) {
      if (reducedMotion()) return;
      placeholder.classList.remove("word-pulse");
      placeholder.classList.add("centrifuge-spin");
      await sleep(700);
    },
  },

  scissors: {
    label: "はさみ",
    tileClass: "scissors-in",
    tileVars(i, mid) {
      const dir = i - mid;
      return { "--from-x": `${-dir * 26}px`, "--from-y": "0px", "--from-rot": `${dir * 3}deg` };
    },
    /* 各接辞の境界にハサミが現れ、チョキンと切り分ける */
    async intro(placeholder, word, morphemes) {
      if (reducedMotion()) return;
      placeholder.classList.remove("word-pulse");
      placeholder.style.position = "relative";
      const rect = placeholder.getBoundingClientRect();

      let acc = 0;
      const boundaries = [];
      morphemes.slice(0, -1).forEach((m) => {
        acc += (m.part || "").length;
        boundaries.push(acc / word.length);
      });

      boundaries.forEach((frac, i) => {
        const x = rect.width * frac;
        const line = document.createElement("div");
        line.className = "scissors-line";
        line.style.left = `${x}px`;
        placeholder.appendChild(line);

        const scissors = document.createElement("div");
        scissors.className = "scissors-icon";
        scissors.textContent = "✂️";
        scissors.style.left = `${x}px`;
        scissors.style.animationDelay = `${i * 0.16}s`;
        placeholder.appendChild(scissors);
      });

      placeholder.classList.add("scissors-cut");
      await sleep(boundaries.length * 160 + 380);
    },
  },

  box: {
    label: "ボックス投入",
    tileClass: "box-out-in",
    tileVars(i, mid) {
      const dir = i - mid || (i % 2 === 0 ? -0.5 : 0.5);
      return {
        "--from-x": `${Math.sign(dir) * (18 + Math.abs(dir) * 10)}px`,
        "--from-y": "50px",
        "--from-rot": `${dir * 14}deg`,
      };
    },
    /* 単語ブロックが箱に落ちて消え、箱から接辞がポンポン飛び出してくる */
    async intro(placeholder) {
      if (reducedMotion()) return;
      placeholder.classList.remove("word-pulse");
      placeholder.style.position = "relative";
      const box = document.createElement("div");
      box.className = "drop-box";
      box.textContent = "📦";
      placeholder.appendChild(box);
      placeholder.classList.add("box-drop");
      await sleep(560);
      box.classList.add("shake");
      await sleep(300);
    },
  },
};

/* ---- 接辞カード（スワイプで接辞帳へ保存） ---- */
async function renderResultScreen() {
  const wordMeaningEl = document.getElementById("word-meaning");
  if (currentWordMeaning) {
    const phoneticHtml = currentWordPhonetic ? `<span class="phonetic">[${escapeHtml(currentWordPhonetic)}]</span>` : "";
    wordMeaningEl.innerHTML = `<div class="word-meaning-word">${escapeHtml(currentWord)}${phoneticHtml}</div><div class="word-meaning-text">${escapeHtml(currentWordMeaning)}</div>`;
    wordMeaningEl.style.display = "block";
  } else {
    wordMeaningEl.innerHTML = "";
    wordMeaningEl.style.display = "none";
  }

  const memoryTipEl = document.getElementById("memory-tip");
  memoryTipEl.textContent = currentMemoryTip || "";
  memoryTipEl.style.display = currentMemoryTip ? "block" : "none";

  document.getElementById("add-goro-form").style.display = "none";
  document.getElementById("add-goro-btn").style.display = "block";
  document.getElementById("add-goro-input").value = "";

  document.getElementById("result-word-label").textContent = `${currentWord} の接辞`;
  const list = document.getElementById("affix-list");
  list.innerHTML = "";

  currentMorphemes.forEach((m) => {
    const card = document.createElement("div");
    card.className = "affix-card";
    card.innerHTML = `
      <div class="m">${escapeHtml(m.part)}${m.phonetic ? `<span class="phonetic">[${escapeHtml(m.phonetic)}]</span>` : ""}</div>
      <div class="mean">${escapeHtml(m.meaning)}（${escapeHtml(m.reading)} / ${escapeHtml(m.origin)}）</div>`;
    list.appendChild(card);
  });

  await refreshSaveWordBtn();
}

/* ---- 語呂合わせ候補（タップ=読み上げ / 保存） ---- */
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
  renderGoroList();
  await refreshSaveWordBtn();
  document.getElementById("regen-btn").disabled = false;
}

function renderGoroList() {
  const list = document.getElementById("goro-list");
  list.innerHTML = "";
  currentCandidates.forEach((c, idx) => {
    const card = document.createElement("div");
    card.className = "goro-card";
    card.dataset.idx = idx;
    card.innerHTML = `
      <div class="goro-tap" data-idx="${idx}">
        <span class="spk">${speakerIconHtml()}</span><span class="txt">「${escapeHtml(c.text)}」</span>
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
}

/* 単語帳のレコードIDは単語そのものだけで決める(語呂合わせの内容を含めない)。
   含めてしまうと、同じ単語を語呂合わせを変えて後から保存した際に別レコードとして
   二重登録されてしまう */
function wordCardId(word) {
  return word.toLowerCase();
}

function currentWordRecordId() {
  return wordCardId(currentWord);
}

async function refreshSaveWordBtn() {
  const btn = document.getElementById("save-word-btn");
  if (!btn) return;
  const existing = await idbGet("words", currentWordRecordId());
  btn.classList.toggle("on", !!existing);
  btn.textContent = existing ? "✓ 単語を保存済み" : "💾 単語を保存";
}

async function toggleSaveWord() {
  const id = currentWordRecordId();
  const existing = await idbGet("words", id);
  const c = currentCandidates[0] || null;
  const newGoroText = c ? c.text : "";

  /* 既に保存済みでも、現在表示中の語呂合わせが保存内容と同じ時だけ「取り消し」扱いにする。
     語呂合わせを作り直して再保存した場合は、既存レコードを上書き更新する */
  if (existing && existing.goro_text === newGoroText) {
    await idbDelete("words", id);
  } else {
    const provider = await kvGet("provider", "openai");
    await idbPut("words", {
      id,
      word: currentWord,
      word_meaning: currentWordMeaning,
      word_phonetic: currentWordPhonetic,
      word_memory_tip: currentMemoryTip,
      morphemes: currentMorphemes,
      goro_text: newGoroText,
      goro_highlight: c ? c.highlight : [],
      provider,
      memorized: existing ? existing.memorized : false,
      created_at: existing ? existing.created_at : Date.now(),
    });
  }
  await refreshSaveWordBtn();
}

document.getElementById("save-word-btn").addEventListener("click", toggleSaveWord);

document.getElementById("regen-btn").addEventListener("click", async () => {
  const provider = await kvGet("provider", "openai");
  const apiKey = await loadApiKey(provider);
  if (!apiKey) {
    homeError.textContent = "設定画面でAPIキーを登録してください";
    showScreen("screen-settings");
    refreshUsageDisplay();
    return;
  }
  document.getElementById("regen-btn").disabled = true;
  document.getElementById("goro-list").innerHTML = `<div class="empty-note">作り直しています…</div>`;
  await loadGoroCandidates(provider, apiKey);
});

const addGoroBtn = document.getElementById("add-goro-btn");
const addGoroForm = document.getElementById("add-goro-form");
const addGoroInput = document.getElementById("add-goro-input");

addGoroBtn.addEventListener("click", () => {
  addGoroForm.style.display = "flex";
  addGoroBtn.style.display = "none";
  addGoroInput.focus();
});

async function submitCustomGoro() {
  const text = addGoroInput.value.trim();
  if (!text) return;

  currentCandidates = [{ text, highlight: [] }];
  renderGoroList();
  await refreshSaveWordBtn();

  addGoroInput.value = "";
  addGoroForm.style.display = "none";
  addGoroBtn.style.display = "block";
}

document.getElementById("add-goro-submit").addEventListener("click", submitCustomGoro);
addGoroInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitCustomGoro();
});

/* ------------------------------------------------------------------ *
 * 10. 単語帳（単語 / 接辞）
 * ------------------------------------------------------------------ */
async function renderBookList() {
  const listEl = document.getElementById("book-list");
  listEl.innerHTML = "";

  let rows = await idbGetAll("words");
  rows.sort((a, b) => b.created_at - a.created_at);

  const memorizedCount = rows.filter((r) => r.memorized).length;
  document.getElementById("book-stats").textContent =
    `全${rows.length}語 ・ 暗記済み${memorizedCount} ・ 未暗記${rows.length - memorizedCount}`;

  if (!rows.length) { listEl.innerHTML = `<div class="empty-note">まだ記録がありません</div>`; return; }
  rows.forEach((r) => {
    const title = r.memorized ? `✓ ${r.word}` : r.word;
    const row = buildBookRow(title, "", r.created_at, () => openWordDetail(r), async () => {
      await idbDelete("words", r.id);
      renderBookList();
    });
    listEl.appendChild(row);
  });
}

/* --- CSV出力 / 読み込み（単語帳） --- */
const CSV_COLUMNS = [
  "id", "word", "word_meaning", "word_phonetic", "word_memory_tip", "morphemes",
  "goro_text", "goro_highlight", "provider", "memorized", "created_at",
];

function csvField(value) {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCSV(csvBody, filenamePrefix) {
  const csv = "\uFEFF" + csvBody;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function wordsToCSV(records) {
  const lines = [CSV_COLUMNS.join(",")];
  records.forEach((r) => {
    lines.push([
      r.id,
      r.word,
      r.word_meaning || "",
      r.word_phonetic || "",
      r.word_memory_tip || "",
      JSON.stringify(r.morphemes || []),
      r.goro_text || "",
      JSON.stringify(r.goro_highlight || []),
      r.provider || "",
      r.memorized ? "1" : "0",
      r.created_at || "",
    ].map(csvField).join(","));
  });
  return lines.join("\r\n");
}

function parseCSV(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field); field = "";
    } else if (ch === "\n") {
      row.push(field); rows.push(row); row = []; field = "";
    } else if (ch === "\r") {
      // ignore; paired \n handles the line break
    } else {
      field += ch;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

function csvToWords(text) {
  const rows = parseCSV(text);
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim());
  const colIndex = {};
  headers.forEach((h, i) => { colIndex[h] = i; });
  const get = (row, key) => (colIndex[key] !== undefined ? (row[colIndex[key]] ?? "") : "");

  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const word = get(row, "word").trim();
    if (!word) continue;
    let morphemes = [];
    try { morphemes = JSON.parse(get(row, "morphemes") || "[]"); } catch { morphemes = []; }
    let goroHighlight = [];
    try { goroHighlight = JSON.parse(get(row, "goro_highlight") || "[]"); } catch { goroHighlight = []; }
    const memorizedRaw = get(row, "memorized").trim().toLowerCase();
    out.push({
      id: get(row, "id").trim() || wordCardId(word),
      word,
      word_meaning: get(row, "word_meaning"),
      word_phonetic: get(row, "word_phonetic"),
      word_memory_tip: get(row, "word_memory_tip"),
      morphemes,
      goro_text: get(row, "goro_text"),
      goro_highlight: goroHighlight,
      provider: get(row, "provider"),
      memorized: memorizedRaw === "1" || memorizedRaw === "true",
      created_at: Number(get(row, "created_at")) || Date.now(),
    });
  }
  return out;
}

const csvChoiceSheet = document.getElementById("csv-choice-sheet");
document.getElementById("csv-menu-btn").addEventListener("click", () => {
  csvChoiceSheet.style.display = "flex";
});
document.getElementById("csv-choice-close").addEventListener("click", () => {
  csvChoiceSheet.style.display = "none";
});

document.getElementById("csv-choice-export").addEventListener("click", async () => {
  csvChoiceSheet.style.display = "none";
  const rows = await idbGetAll("words");
  if (!rows.length) { toast("保存された単語がありません"); return; }
  downloadCSV(wordsToCSV(rows), "engolo-wordbook");
  toast(`${rows.length}件をCSV出力しました`);
});

const csvImportInput = document.getElementById("csv-import-input");
document.getElementById("csv-choice-import").addEventListener("click", () => {
  csvChoiceSheet.style.display = "none";
  csvImportInput.click();
});
csvImportInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  const text = await file.text();
  const records = csvToWords(text);
  if (!records.length) { toast("読み込めるデータが見つかりませんでした"); return; }
  for (const r of records) await idbPut("words", r);
  toast(`${records.length}件の単語を読み込みました`);
  renderBookList();
});

/* 単語帳の1件をタップした際に、単語・意味・接辞・接辞の意味・語呂合わせをまとめて表示する */
function openWordDetail(record) {
  const meaningEl = document.getElementById("word-detail-meaning");
  const phoneticHtml = record.word_phonetic ? `<span class="phonetic">[${escapeHtml(record.word_phonetic)}]</span>` : "";
  const meaningTextHtml = record.word_meaning ? `<div class="word-meaning-text">${escapeHtml(record.word_meaning)}</div>` : "";
  meaningEl.innerHTML = `<div class="word-meaning-word">${escapeHtml(record.word)}${phoneticHtml}</div>${meaningTextHtml}`;
  meaningEl.style.display = "block";

  const affixList = document.getElementById("word-detail-affixes");
  affixList.innerHTML = "";
  (record.morphemes || []).forEach((m) => {
    const card = document.createElement("div");
    card.className = "affix-card";
    card.innerHTML = `
      <div class="m">${escapeHtml(m.part)}${m.phonetic ? `<span class="phonetic">[${escapeHtml(m.phonetic)}]</span>` : ""}</div>
      <div class="mean">${escapeHtml(m.meaning)}（${escapeHtml(m.reading)} / ${escapeHtml(m.origin)}）</div>`;
    affixList.appendChild(card);
  });
  if (!affixList.children.length) {
    affixList.innerHTML = `<div class="empty-note">接辞の記録がありません</div>`;
  }

  const memoryTipEl = document.getElementById("word-detail-memory-tip");
  memoryTipEl.textContent = record.word_memory_tip || "";
  memoryTipEl.style.display = record.word_memory_tip ? "block" : "none";

  const goroList = document.getElementById("word-detail-goro");
  goroList.innerHTML = "";
  if (record.goro_text) {
    const card = document.createElement("div");
    card.className = "goro-card";
    card.innerHTML = `<div class="goro-tap"><span class="spk">${speakerIconHtml()}</span><span class="txt">「${escapeHtml(record.goro_text)}」</span></div>`;
    const tap = card.querySelector(".goro-tap");
    tap.addEventListener("click", () => {
      tap.classList.add("speaking");
      speak(record.goro_text, () => tap.classList.remove("speaking"));
    });
    goroList.appendChild(card);
  } else {
    goroList.innerHTML = `<div class="empty-note">語呂合わせは登録されていません</div>`;
  }

  showScreen("screen-word-detail");
}

function buildBookRow(title, sub, createdAt, onTap, onDelete) {
  const wrap = document.createElement("div");
  wrap.className = "book-row";
  const date = new Date(createdAt);
  const dateStr = `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
  const subHtml = sub ? `<div class="g">${escapeHtml(sub)}</div>` : "";
  wrap.innerHTML = `
    <div class="del-reveal">🗑 削除</div>
    <div class="row-body">
      <div><div class="w">${escapeHtml(title)}</div>${subHtml}</div>
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
 * 11. 暗記モード（単語帳のカードをスワイプで暗記済み／未暗記に仕分け）
 * ------------------------------------------------------------------ */
let memorizeQueue = [];
let memorizeIndex = 0;
let memorizeRevealed = false;
let memorizeAutoPlay = false;
let memorizeAutoTimer = null;
let memorizeEmptyMessage = "保存された単語がまだありません";
let memorizeSpeechOn = true;

function renderMemorizeSpeechToggle() {
  const icon = document.getElementById("memorize-speech-icon");
  icon.innerHTML = memorizeSpeechOn ? ICON_VOLUME_ON : ICON_VOLUME_OFF;
  const btn = document.getElementById("memorize-speech-toggle");
  btn.title = memorizeSpeechOn ? "読み上げ: オン" : "読み上げ: オフ";
  btn.setAttribute("aria-label", btn.title);
}

document.getElementById("memorize-speech-toggle").addEventListener("click", async () => {
  memorizeSpeechOn = !memorizeSpeechOn;
  await kvSet("memorize_speech_on", memorizeSpeechOn);
  renderMemorizeSpeechToggle();
});

const memorizeModeSheet = document.getElementById("memorize-mode-sheet");
document.getElementById("memorize-entry-btn").addEventListener("click", () => {
  memorizeModeSheet.style.display = "flex";
});
document.getElementById("memorize-mode-close").addEventListener("click", () => {
  memorizeModeSheet.style.display = "none";
});
document.getElementById("mode-btn-all").addEventListener("click", () => {
  memorizeModeSheet.style.display = "none";
  startMemorizeMode("all");
});
document.getElementById("mode-btn-unlearned").addEventListener("click", () => {
  memorizeModeSheet.style.display = "none";
  startMemorizeMode("unlearned");
});
document.getElementById("mode-btn-auto").addEventListener("click", () => {
  memorizeModeSheet.style.display = "none";
  startMemorizeMode("auto");
});

function clearMemorizeAutoTimer() {
  if (memorizeAutoTimer) { clearTimeout(memorizeAutoTimer); memorizeAutoTimer = null; }
}

async function startMemorizeMode(mode = "all") {
  const words = await idbGetAll("words");
  const pool = mode === "unlearned" ? words.filter((w) => !w.memorized) : words;
  memorizeQueue = pool.sort(() => Math.random() - 0.5);
  memorizeIndex = 0;
  memorizeAutoPlay = mode === "auto";
  memorizeEmptyMessage = mode === "unlearned"
    ? "未学習のカードはありません"
    : "保存された単語がまだありません";
  memorizeSpeechOn = await kvGet("memorize_speech_on", true);
  renderMemorizeSpeechToggle();
  showScreen("screen-memorize");
  renderMemorizeCard();
}

function renderMemorizeCard() {
  const emptyEl = document.getElementById("memorize-empty");
  const swipeEl = document.getElementById("memorize-swipe");
  const progressEl = document.getElementById("memorize-progress");

  if (!memorizeQueue.length) {
    clearMemorizeAutoTimer();
    emptyEl.textContent = memorizeEmptyMessage;
    emptyEl.style.display = "flex";
    swipeEl.style.display = "none";
    progressEl.textContent = "";
    return;
  }
  if (memorizeIndex >= memorizeQueue.length) {
    clearMemorizeAutoTimer();
    emptyEl.innerHTML = "";
    const msgEl = document.createElement("div");
    msgEl.textContent = "お疲れさまでした！全カードをチェックしました。";
    emptyEl.appendChild(msgEl);
    const finishBtn = document.createElement("button");
    finishBtn.type = "button";
    finishBtn.className = "memorize-finish-btn";
    finishBtn.textContent = "終了";
    finishBtn.addEventListener("click", () => showScreen("screen-book"));
    emptyEl.appendChild(finishBtn);
    emptyEl.style.display = "flex";
    swipeEl.style.display = "none";
    progressEl.textContent = "";
    return;
  }

  emptyEl.style.display = "none";
  swipeEl.style.display = "block";
  progressEl.textContent = `${memorizeIndex + 1} / ${memorizeQueue.length}${memorizeAutoPlay ? " 🔊" : ""}`;

  const record = memorizeQueue[memorizeIndex];
  memorizeRevealed = false;

  const card = document.getElementById("memorize-card");
  card.classList.toggle("memorized-tag", !!record.memorized);
  card.style.transition = "none";
  card.style.transform = "translateX(0)";
  card.style.opacity = "1";
  document.getElementById("memorize-reveal").classList.remove("reveal-left", "reveal-right");

  const wordEl = document.getElementById("memorize-word");
  wordEl.textContent = record.word;
  wordEl.style.display = "";

  const detailEl = document.getElementById("memorize-detail");
  detailEl.innerHTML = "";
  detailEl.style.display = "none";

  const extraEl = document.getElementById("memorize-extra");
  extraEl.innerHTML = "";
  extraEl.style.display = "none";

  if (memorizeSpeechOn) speak(record.word, null, "en-US");

  scheduleMemorizeAutoPlay();
}

function scheduleMemorizeAutoPlay() {
  clearMemorizeAutoTimer();
  if (!memorizeAutoPlay) return;
  if (!memorizeQueue.length || memorizeIndex >= memorizeQueue.length) return;
  memorizeAutoTimer = setTimeout(revealMemorizeDetail, 1800);
}

function advanceMemorizeAutoPlay() {
  if (!memorizeAutoPlay) return;
  memorizeIndex++;
  renderMemorizeCard();
}

function revealMemorizeDetail() {
  if (memorizeRevealed) return;
  const record = memorizeQueue[memorizeIndex];
  if (!record) return;
  memorizeRevealed = true;

  document.getElementById("memorize-word").style.display = "none";

  const detailEl = document.getElementById("memorize-detail");
  detailEl.innerHTML = "";
  if (record.word_meaning) {
    const phoneticHtml = record.word_phonetic ? `<span class="phonetic">[${escapeHtml(record.word_phonetic)}]</span>` : "";
    const meaningEl = document.createElement("div");
    meaningEl.className = "word-meaning";
    meaningEl.innerHTML = `<div class="word-meaning-word">${escapeHtml(record.word)}${phoneticHtml}</div><div class="word-meaning-text">${escapeHtml(record.word_meaning)}</div>`;
    detailEl.appendChild(meaningEl);
  }
  const splitEl = document.createElement("div");
  splitEl.className = "word-split";
  (record.morphemes || []).forEach((m, i) => {
    const tile = document.createElement("div");
    tile.className = "morph shatter-in";
    tile.style.animationDelay = `${i * 0.08}s`;
    tile.innerHTML = `<div class="morph-part">${escapeHtml(m.part)}</div><div class="morph-meaning show">${escapeHtml([m.reading, m.meaning].filter(Boolean).join(" ・ "))}</div>`;
    splitEl.appendChild(tile);
  });
  detailEl.appendChild(splitEl);
  detailEl.style.display = "";

  const extraEl = document.getElementById("memorize-extra");
  extraEl.innerHTML = "";
  if (record.word_memory_tip) {
    const tipEl = document.createElement("div");
    tipEl.className = "memory-tip";
    tipEl.textContent = record.word_memory_tip;
    extraEl.appendChild(tipEl);
  }

  if (record.goro_text) {
    const goroCard = document.createElement("div");
    goroCard.className = "goro-card";
    goroCard.innerHTML = `<div class="goro-tap"><span class="spk">${speakerIconHtml()}</span><span class="txt">「${escapeHtml(record.goro_text)}」</span></div>`;
    const tap = goroCard.querySelector(".goro-tap");
    tap.addEventListener("click", () => {
      tap.classList.add("speaking");
      speak(record.goro_text, () => tap.classList.remove("speaking"));
    });
    extraEl.appendChild(goroCard);
  }
  extraEl.style.display = extraEl.children.length ? "flex" : "none";

  if (memorizeSpeechOn && record.word_meaning) {
    speak(record.word_meaning);
  }
  if (memorizeAutoPlay) {
    clearMemorizeAutoTimer();
    memorizeAutoTimer = setTimeout(advanceMemorizeAutoPlay, 3800);
  }
}

/* 裏面を表示中に再タップされた時、表面(単語のみ)に戻す */
function hideMemorizeDetail() {
  if (!memorizeRevealed) return;
  const record = memorizeQueue[memorizeIndex];
  if (!record) return;
  memorizeRevealed = false;
  clearMemorizeAutoTimer();

  document.getElementById("memorize-word").style.display = "";
  document.getElementById("memorize-detail").style.display = "none";
  document.getElementById("memorize-extra").style.display = "none";

  if (memorizeSpeechOn) speak(record.word, null, "en-US");

  scheduleMemorizeAutoPlay();
}

async function classifyMemorizeCard(memorized) {
  const record = memorizeQueue[memorizeIndex];
  if (!record) return;
  clearMemorizeAutoTimer();
  record.memorized = memorized;
  await idbPut("words", record);

  const card = document.getElementById("memorize-card");
  card.style.transition = "transform .25s ease, opacity .25s ease";
  card.style.transform = `translateX(${memorized ? "-140%" : "140%"}) rotate(${memorized ? "-14" : "14"}deg)`;
  card.style.opacity = "0";

  await sleep(220);
  memorizeIndex++;
  renderMemorizeCard();
}

document.getElementById("memorize-btn-correct").addEventListener("click", () => classifyMemorizeCard(true));
document.getElementById("memorize-btn-wrong").addEventListener("click", () => classifyMemorizeCard(false));

(function attachMemorizeSwipe() {
  const card = document.getElementById("memorize-card");
  const revealEl = document.getElementById("memorize-reveal");
  let startX = 0, dx = 0, dragging = false, moved = false;
  const threshold = 90;
  const clientX = (e) => (e.touches ? e.touches[0].clientX : e.clientX);

  card.addEventListener("pointerdown", (e) => {
    dragging = true; moved = false; startX = clientX(e); dx = 0;
    card.style.transition = "none";
  });
  card.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    dx = clientX(e) - startX;
    if (Math.abs(dx) > 6) moved = true;
    card.style.transform = `translateX(${dx}px) rotate(${dx / 24}deg)`;
    if (dx < 0) {
      revealEl.textContent = "✓ 暗記済み";
      revealEl.classList.add("reveal-left");
      revealEl.classList.remove("reveal-right");
    } else if (dx > 0) {
      revealEl.textContent = "📕 未暗記";
      revealEl.classList.add("reveal-right");
      revealEl.classList.remove("reveal-left");
    }
  });
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    if (moved && Math.abs(dx) > threshold) {
      classifyMemorizeCard(dx < 0);
      return;
    }
    card.style.transition = "transform .18s ease";
    card.style.transform = "translateX(0)";
    revealEl.classList.remove("reveal-left", "reveal-right");
    if (!moved) {
      if (memorizeRevealed) hideMemorizeDetail();
      else revealMemorizeDetail();
    }
  };
  card.addEventListener("pointerup", onUp);
  card.addEventListener("pointercancel", onUp);
  card.addEventListener("pointerleave", () => {
    if (!dragging) return;
    dragging = false;
    card.style.transition = "transform .18s ease";
    card.style.transform = "translateX(0)";
    revealEl.classList.remove("reveal-left", "reveal-right");
  });
})();

/* ------------------------------------------------------------------ *
 * 12. API設定画面
 * ------------------------------------------------------------------ */
const PROVIDER_LABELS = { openai: "ChatGPT", gemini: "Gemini", claude: "Claude", groq: "Groq", sakura: "さくらのAI" };
let activeProvider = "openai";

async function initSettingsScreen() {
  activeProvider = await kvGet("provider", "openai");
  document.querySelectorAll(".provider-pill").forEach((p) => {
    p.classList.toggle("on", p.dataset.provider === activeProvider);
  });
  document.getElementById("key-label").textContent = `${PROVIDER_LABELS[activeProvider]} API キー`;
  document.getElementById("api-key-input").value = await loadApiKey(activeProvider);
  await refreshUsageDisplay();

  const activeAnim = await kvGet("decompose_anim", "crack");
  document.querySelectorAll(".anim-pill").forEach((p) => {
    p.classList.toggle("on", p.dataset.anim === activeAnim);
  });

  renderModePills(await kvGet("theme_mode", "light"));
  renderThemeSwatches(await kvGet("theme_color", "blue"));
}

document.querySelectorAll(".anim-pill").forEach((pill) => {
  pill.addEventListener("click", async () => {
    document.querySelectorAll(".anim-pill").forEach((p) => p.classList.toggle("on", p === pill));
    await kvSet("decompose_anim", pill.dataset.anim);
  });
});

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
 * 13. テーマカラー
 * ------------------------------------------------------------------ */
const THEME_COLORS = {
  teal:   { label: "ティール",   light: { accent: "#1F6F63", accentInk: "#0E3A33" }, dark: { accent: "#4FBFA8", accentInk: "#BEEFE1" } },
  blue:   { label: "ブルー",     light: { accent: "#2F6FED", accentInk: "#123A91" }, dark: { accent: "#7CA2FF", accentInk: "#D7E4FF" } },
  purple: { label: "パープル",   light: { accent: "#8B5CF6", accentInk: "#3E1980" }, dark: { accent: "#B49CFF", accentInk: "#EDE4FF" } },
  pink:   { label: "ピンク",     light: { accent: "#E0457B", accentInk: "#7A1D42" }, dark: { accent: "#FF9DC0", accentInk: "#FFE3ED" } },
  orange: { label: "オレンジ",   light: { accent: "#E2622F", accentInk: "#7A2E0F" }, dark: { accent: "#F0855A", accentInk: "#FFE3D4" } },
  green:  { label: "グリーン",   light: { accent: "#2E8B45", accentInk: "#114420" }, dark: { accent: "#7ED99A", accentInk: "#DFFBE7" } },
  red:    { label: "レッド",     light: { accent: "#D6483C", accentInk: "#6E1710" }, dark: { accent: "#FF8F84", accentInk: "#FFE0DC" } },
};

async function isDarkActive() {
  const mode = await kvGet("theme_mode", "light");
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
}

async function applyThemeMode() {
  const mode = await kvGet("theme_mode", "light");
  const root = document.documentElement;
  if (mode === "light") root.setAttribute("data-theme", "light");
  else if (mode === "dark") root.setAttribute("data-theme", "dark");
  else root.removeAttribute("data-theme");
  await applyThemeColor();
}

function renderModePills(activeMode) {
  document.querySelectorAll(".mode-pill").forEach((p) => {
    p.classList.toggle("on", p.dataset.mode === activeMode);
  });
}

document.querySelectorAll(".mode-pill").forEach((pill) => {
  pill.addEventListener("click", async () => {
    await kvSet("theme_mode", pill.dataset.mode);
    renderModePills(pill.dataset.mode);
    await applyThemeMode();
  });
});

async function applyThemeColor() {
  const key = await kvGet("theme_color", "blue");
  const preset = THEME_COLORS[key] || THEME_COLORS.teal;
  const isDark = await isDarkActive();
  const variant = isDark ? preset.dark : preset.light;
  const root = document.documentElement;
  root.style.setProperty("--accent", variant.accent);
  root.style.setProperty("--accent-ink", variant.accentInk);
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) themeMeta.setAttribute("content", variant.accent);
}

function renderThemeSwatches(activeKey) {
  const row = document.getElementById("theme-swatch-row");
  if (!row) return;
  row.innerHTML = "";
  Object.entries(THEME_COLORS).forEach(([key, preset]) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `theme-swatch${key === activeKey ? " on" : ""}`;
    btn.style.background = preset.light.accent;
    btn.title = preset.label;
    btn.setAttribute("aria-label", preset.label);
    btn.addEventListener("click", async () => {
      await kvSet("theme_color", key);
      await applyThemeColor();
      renderThemeSwatches(key);
    });
    row.appendChild(btn);
  });
}

if (window.matchMedia) {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyThemeColor);
}

/* ------------------------------------------------------------------ *
 * 14. ユーティリティ / 初期化
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
applyThemeMode();
