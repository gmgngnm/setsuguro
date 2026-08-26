"use strict";

const ICON_VOLUME_ON = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>';
const ICON_VOLUME_OFF = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>';
function speakerIconHtml() {
  return `<svg class="icon-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_VOLUME_ON}</svg>`;
}

/* 生成中に出す待ち表示。無機質なスピナーではなく、AIが今なにをしているか
   （らしきもの）を言葉で見せる。点は0〜3個を繰り返してCSSで動かす */
function goroLoadingHtml(label, suffix = "") {
  return `<div class="goro-loading" role="status" aria-live="polite">`
    + `<span class="goro-loading-label">${escapeHtml(label)}</span>`
    + `<span class="goro-loading-dots" aria-hidden="true"></span>`
    + (suffix ? `<span class="goro-loading-suffix">${suffix}</span>` : "")
    + `</div>`;
}

/* ごく低確率で紛れ込ませるネタの一文。接辞分解の固定シーケンス・
   語呂合わせの実況表示のどちらからも同じ確率で抽選する */
const LOADING_EASTER_EGGS = ["少女祈祷中", "少女瞑想中"];
const LOADING_EASTER_EGG_CHANCE = 0.02;

/* 接辞分解の待ち時間表示。実際の分解はAIへの単発の問い合わせで
   内部の工程を観測できないため、こちらは「それらしい」工程名を
   固定の順番で1つずつ見せる演出（本物の進捗ではない）。
   各工程の表示時間は100〜4000msの範囲でランダムだが、序盤の工程ほど
   短め・終盤の工程ほど長めになるようバイアスをかけてある（毎回同じ
   長さにならないよう、範囲そのものを工程ごとに引く） */
const DECOMPOSE_LOADING_STEPS = [
  "スペル精査中", "単語データベース照合中", "語源を照合中", "接辞候補を抽出中",
  "意味を推定中", "発音記号を生成中", "語根の表記ゆれを正規化中",
  "既知の接辞と照合中", "暗記のヒントを組み立て中", "自動修正を確認中",
];
/* 早送り時（分解自体は先に終わっている場合）の1工程あたりの表示時間 */
const DECOMPOSE_LOADING_FAST_MS = [80, 180];

function decomposeStepDwellRange(index, total) {
  const t = total > 1 ? index / (total - 1) : 0;
  return { min: 100 + t * 1100, max: 900 + t * 3100 };
}

/* コンテナIDごとに動いているタイマーを管理する。実際のコンテンツに
   差し替える側は必ずstopLoadingRotationを呼ぶこと（呼ばなくても次の
   start時に自動で片付くが、放置すると実体の消えたコンテナに向けて
   無駄にタイマーが動き続ける） */
const activeLoadingRotations = new Map();

function stopLoadingRotation(containerId) {
  const timerId = activeLoadingRotations.get(containerId);
  if (timerId) {
    clearTimeout(timerId);
    clearInterval(timerId);
    activeLoadingRotations.delete(containerId);
  }
}

/* 接辞分解の待ち表示を開始する。返り値のmarkWorkDone()は、裏側の実際の
   分解（AI応答 or デモの待機）が終わった時点で呼ぶ。まだ全10工程を
   見せ切っていなければ、残りは早送り（DECOMPOSE_LOADING_FAST_MS）で
   消化してから終わる。donePromiseは「全工程を見せ終えた」時点で解決する
   ので、呼び出し側はこれをawaitしてから次のアニメーションへ進むこと */
/* writePhraseを渡すと、工程名の書き込み先を差し替えられる（まとめ生成の
   進捗行のように、.goro-loading とは違う作りの表示に流し込むため） */
function startDecomposeLoadingSequence(containerId, writePhrase) {
  stopLoadingRotation(containerId);
  const container = document.getElementById(containerId);
  if (!container) return { markWorkDone() {}, donePromise: Promise.resolve() };

  const write = writePhrase || ((phrase) => {
    const labelEl = container.querySelector(".goro-loading-label");
    if (labelEl) labelEl.textContent = phrase;
    else container.innerHTML = goroLoadingHtml(phrase);
  });

  const total = DECOMPOSE_LOADING_STEPS.length;
  let stepIndex = 0;
  let workDone = false;
  let resolveDone;
  const donePromise = new Promise((resolve) => { resolveDone = resolve; });

  const scheduleNext = () => {
    let dwellMs;
    if (workDone) {
      const [fastMin, fastMax] = DECOMPOSE_LOADING_FAST_MS;
      dwellMs = fastMin + Math.random() * (fastMax - fastMin);
    } else {
      const { min, max } = decomposeStepDwellRange(stepIndex, total);
      dwellMs = min + Math.random() * (max - min);
    }
    activeLoadingRotations.set(containerId, setTimeout(showStep, dwellMs));
  };

  const showStep = () => {
    const phrase = Math.random() < LOADING_EASTER_EGG_CHANCE
      ? LOADING_EASTER_EGGS[Math.floor(Math.random() * LOADING_EASTER_EGGS.length)]
      : DECOMPOSE_LOADING_STEPS[stepIndex % total];
    write(phrase);

    stepIndex++;
    if (stepIndex >= total) {
      /* 全工程を出し切ったので、ここで初めて呼び出し側に完了を知らせる */
      activeLoadingRotations.delete(containerId);
      resolveDone();
      return;
    }
    scheduleNext();
  };
  showStep();

  return {
    markWorkDone() {
      if (workDone) return;
      workDone = true;
      /* 保留中の工程が長めの待ちで止まっている場合、早送りの待ち時間で
         すぐ次へ進むよう仕切り直す（実際の分解がもう終わっているのに、
         演出のためだけに長く待たせないため） */
      const pending = activeLoadingRotations.get(containerId);
      if (pending) {
        clearTimeout(pending);
        scheduleNext();
      }
    },
    donePromise,
  };
}

/* 語呂合わせ生成の待ち時間表示。こちらはgenerateGoro自身が今実際に
   実行している処理を都度reportGoroStatusで報告してくるのを、
   そのままラベルへ反映するだけ（タイマーによる自走はしていない）。
   コンテナに読み込み中の枠がまだ無ければここで作る */
function reportGoroStatus(containerId, phrase) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const labelEl = container.querySelector(".goro-loading-label");
  if (labelEl) labelEl.textContent = phrase;
  else container.innerHTML = goroLoadingHtml(phrase);
}

/* 接辞タイルの枠色の出し分けに使う。ローカル辞書に収録済みの定番の接辞か、
   辞書に無くAIがその場で調べたものかで色を変える */
function isKnownAffix(part) {
  return !!LOCAL_AFFIX_DICT[String(part || "").toLowerCase()];
}
function morphTileClass(part) {
  return isKnownAffix(part) ? "" : " morph-new";
}

const ICON_PENCIL = '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>';
function pencilIconHtml() {
  return `<svg class="icon-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PENCIL}</svg>`;
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
/* 接辞は語のどの位置に立ちうるかで扱いが変わる（分割不足の検出や
   フォールバック分解で、接尾辞を接頭辞として切り出さないため）ので、
   位置ごとに分けて持ち、参照用にひとつの辞書へまとめる */
const AFFIX_PREFIXES = {
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
  "be":     { reading: "ビ",       meaning: "強意・〜にする",      origin: "古英語 be-",         phonetic: "bɪ" },
  "de":     { reading: "ディ",     meaning: "下へ・離れて・否定",  origin: "ラテン語 de-",       phonetic: "dɪ" },
  "pro":    { reading: "プロ",     meaning: "前へ・賛成して",      origin: "ラテン語 pro-",      phonetic: "proʊ" },
  "mis":    { reading: "ミス",     meaning: "誤って・悪く",        origin: "古英語 mis-",        phonetic: "mɪs" },
  "non":    { reading: "ノン",     meaning: "〜でない",            origin: "ラテン語 non",       phonetic: "nɒn" },
  "anti":   { reading: "アンチ",   meaning: "反対の・対抗する",    origin: "ギリシャ語 anti-",   phonetic: "ˈænti" },
  "auto":   { reading: "オート",   meaning: "自ら・自動の",        origin: "ギリシャ語 autos",   phonetic: "ˈɔːtoʊ" },
  "over":   { reading: "オーヴァー", meaning: "過度に・上に",      origin: "古英語 ofer",        phonetic: "ˈoʊvər" },
  "under":  { reading: "アンダー", meaning: "下に・不足して",      origin: "古英語 under",       phonetic: "ˈʌndər" },
  "super":  { reading: "スーパー", meaning: "超えて・上位の",      origin: "ラテン語 super",     phonetic: "ˈsuːpər" },
  "semi":   { reading: "セミ",     meaning: "半分の",              origin: "ラテン語 semi-",     phonetic: "ˈsɛmi" },
  "multi":  { reading: "マルチ",   meaning: "多くの",              origin: "ラテン語 multus",    phonetic: "ˈmʌlti" },
  "tele":   { reading: "テレ",     meaning: "遠くへ",              origin: "ギリシャ語 tele",    phonetic: "ˈtɛlɪ" },
  "fore":   { reading: "フォア",   meaning: "前もって・前の",      origin: "古英語 fore",        phonetic: "fɔːr" },
  "ab":     { reading: "アブ",     meaning: "離れて・反対",        origin: "ラテン語 ab-",       phonetic: "æb" },
  "ad":     { reading: "アド",     meaning: "〜へ・向かって",      origin: "ラテン語 ad-",       phonetic: "æd" },
  "after":  { reading: "アフター", meaning: "後で・背後の",        origin: "古英語 æfter",       phonetic: "ˈæftər" },
  "up":     { reading: "アップ",   meaning: "上に・立ち上がる",    origin: "古英語 up",          phonetic: "ʌp" },
  "back":   { reading: "バック",   meaning: "戻る・背後の",        origin: "古英語 bæc",         phonetic: "bæk" },
  "bio":    { reading: "バイオ",   meaning: "生命",                origin: "ギリシャ語 bio-",    phonetic: "ˈbaɪoʊ" },
  "counter": { reading: "カウンター", meaning: "対抗・逆方向",    origin: "ラテン語 contra-",   phonetic: "ˈkaʊntər" },
  "cross":  { reading: "クロス",   meaning: "横切って",            origin: "ラテン語 crux",      phonetic: "krɔːs" },
  "down":   { reading: "ダウン",   meaning: "下へ・下降",          origin: "古英語 dun",         phonetic: "daʊn" },
  "eco":    { reading: "エコ",     meaning: "環境・家",            origin: "ギリシャ語 oikos",   phonetic: "ˈɛkoʊ" },
  "en":     { reading: "エン",     meaning: "中へ・〜にする",      origin: "ラテン語 in-",       phonetic: "ɛn" },
  "em":     { reading: "エム",     meaning: "中へ・〜にする",      origin: "ラテン語 in-",       phonetic: "ɛm" },
  "homo":   { reading: "ホモ",     meaning: "同じ",                origin: "ギリシャ語 homo-",   phonetic: "ˈhoʊmoʊ" },
  "hyper":  { reading: "ハイパー", meaning: "過度に・上に",        origin: "ギリシャ語 hyper-",  phonetic: "ˈhaɪpər" },
  "infra":  { reading: "インフラ", meaning: "下に・以下",          origin: "ラテン語 infra-",    phonetic: "ˈɪnfrə" },
  "macro":  { reading: "マクロ",   meaning: "大きい",              origin: "ギリシャ語 macro-",  phonetic: "ˈmækroʊ" },
  "micro":  { reading: "マイクロ", meaning: "小さい",              origin: "ギリシャ語 micro-",  phonetic: "ˈmaɪkroʊ" },
  "mid":    { reading: "ミッド",   meaning: "中央の",              origin: "古英語 mid",         phonetic: "mɪd" },
  "mono":   { reading: "モノ",     meaning: "一つの・単一",        origin: "ギリシャ語 mono-",   phonetic: "ˈmɒnoʊ" },
  "neo":    { reading: "ネオ",     meaning: "新しい",              origin: "ギリシャ語 neo-",    phonetic: "ˈniːoʊ" },
  "out":    { reading: "アウト",   meaning: "外へ・超える",        origin: "古英語 ut",          phonetic: "aʊt" },
  "para":   { reading: "パラ",     meaning: "横に・異常な",        origin: "ギリシャ語 para-",   phonetic: "ˈpærə" },
  "per":    { reading: "パー",     meaning: "〜を通じて・徹底的に", origin: "ラテン語 per-",    phonetic: "pər" },
  "poly":   { reading: "ポリ",     meaning: "多い・多数",          origin: "ギリシャ語 poly-",   phonetic: "ˈpɒli" },
  "pseudo": { reading: "スード",   meaning: "偽の・似た",          origin: "ギリシャ語 pseudo-", phonetic: "ˈsuːdoʊ" },
  "retro":  { reading: "レトロ",   meaning: "後ろに・過去に",      origin: "ラテン語 retro-",    phonetic: "ˈretrəʊ" },
  "syn":    { reading: "シン",     meaning: "一緒に・共に",        origin: "ギリシャ語 syn-",    phonetic: "sɪn" },
  "tri":    { reading: "トライ",   meaning: "三つの",              origin: "ラテン語 tri-",      phonetic: "traɪ" },
  "ultra":  { reading: "ウルトラ", meaning: "超える・極端な",      origin: "ラテン語 ultra-",    phonetic: "ˈʌltrə" },
  "uni":    { reading: "ユニ",     meaning: "一つの・単一",        origin: "ラテン語 uni-",      phonetic: "ˈjuːni" },
  "vice":   { reading: "ヴァイス", meaning: "代わり・副",          origin: "ラテン語 vice-",     phonetic: "ˈvaɪs" },
  /* --- 数・量 --- */
  "bi":     { reading: "バイ",     meaning: "二つの・二重の",      origin: "ラテン語 bi-",       phonetic: "baɪ" },
  "di":     { reading: "ダイ",     meaning: "二つの",              origin: "ギリシャ語 di-",     phonetic: "daɪ" },
  "tetra":  { reading: "テトラ",   meaning: "四つの",              origin: "ギリシャ語 tetra-",  phonetic: "ˈtɛtrə" },
  "quadr":  { reading: "クアドラ", meaning: "四つの",              origin: "ラテン語 quadri-",   phonetic: "ˈkwɒdr" },
  "penta":  { reading: "ペンタ",   meaning: "五つの",              origin: "ギリシャ語 penta-",  phonetic: "ˈpɛntə" },
  "hexa":   { reading: "ヘキサ",   meaning: "六つの",              origin: "ギリシャ語 hexa-",   phonetic: "ˈhɛksə" },
  "hepta":  { reading: "ヘプタ",   meaning: "七つの",              origin: "ギリシャ語 hepta-",  phonetic: "ˈhɛptə" },
  "octa":   { reading: "オクタ",   meaning: "八つの",              origin: "ギリシャ語 okto",    phonetic: "ˈɒktə" },
  "deca":   { reading: "デカ",     meaning: "十の",                origin: "ギリシャ語 deka",    phonetic: "ˈdɛkə" },
  "hemi":   { reading: "ヘミ",     meaning: "半分の",              origin: "ギリシャ語 hemi-",   phonetic: "ˈhɛmi" },
  "demi":   { reading: "デミ",     meaning: "半分の",              origin: "ラテン語 dimidius",  phonetic: "ˈdɛmi" },
  "kilo":   { reading: "キロ",     meaning: "千倍",                origin: "ギリシャ語 khilioi", phonetic: "ˈkɪloʊ" },
  "mega":   { reading: "メガ",     meaning: "巨大な・百万倍",      origin: "ギリシャ語 megas",   phonetic: "ˈmɛgə" },
  "giga":   { reading: "ギガ",     meaning: "十億倍・巨大な",      origin: "ギリシャ語 gigas",   phonetic: "ˈgɪgə" },
  "centi":  { reading: "センチ",   meaning: "百分の一",            origin: "ラテン語 centum",    phonetic: "ˈsɛnti" },
  "milli":  { reading: "ミリ",     meaning: "千分の一",            origin: "ラテン語 mille",     phonetic: "ˈmɪli" },
  "deci":   { reading: "デシ",     meaning: "十分の一",            origin: "ラテン語 decimus",   phonetic: "ˈdɛsi" },
  "nano":   { reading: "ナノ",     meaning: "極小・十億分の一",    origin: "ギリシャ語 nanos",   phonetic: "ˈnænoʊ" },
  "omni":   { reading: "オムニ",   meaning: "すべての",            origin: "ラテン語 omnis",     phonetic: "ˈɒmni" },
  "pan":    { reading: "パン",     meaning: "全ての・汎",          origin: "ギリシャ語 pan-",    phonetic: "pæn" },
  "holo":   { reading: "ホロ",     meaning: "全体の",              origin: "ギリシャ語 holos",   phonetic: "ˈhɒloʊ" },
  "equi":   { reading: "エクイ",   meaning: "等しい",              origin: "ラテン語 aequus",    phonetic: "ˈiːkwɪ" },
  "iso":    { reading: "アイソ",   meaning: "同じ・等しい",        origin: "ギリシャ語 isos",    phonetic: "ˈaɪsoʊ" },
  /* --- 位置・方向 --- */
  "circum": { reading: "サーカム", meaning: "周りを・囲んで",      origin: "ラテン語 circum",    phonetic: "ˈsɜːrkəm" },
  "peri":   { reading: "ペリ",     meaning: "周囲の",              origin: "ギリシャ語 peri-",   phonetic: "ˈpɛri" },
  "extra":  { reading: "エクストラ", meaning: "外の・範囲を超えた", origin: "ラテン語 extra",    phonetic: "ˈɛkstrə" },
  "exo":    { reading: "エクソ",   meaning: "外側の",              origin: "ギリシャ語 exo",     phonetic: "ˈɛksoʊ" },
  "endo":   { reading: "エンド",   meaning: "内側の",              origin: "ギリシャ語 endon",   phonetic: "ˈɛndoʊ" },
  "intra":  { reading: "イントラ", meaning: "内部の",              origin: "ラテン語 intra",     phonetic: "ˈɪntrə" },
  "intro":  { reading: "イントロ", meaning: "中へ・内へ",          origin: "ラテン語 intro",     phonetic: "ˈɪntroʊ" },
  "ante":   { reading: "アンテ",   meaning: "前の・先立つ",        origin: "ラテン語 ante",      phonetic: "ˈænti" },
  "apo":    { reading: "アポ",     meaning: "離れて",              origin: "ギリシャ語 apo-",    phonetic: "ˈæpoʊ" },
  "dia":    { reading: "ダイア",   meaning: "通って・横切って",    origin: "ギリシャ語 dia-",    phonetic: "ˈdaɪə" },
  "epi":    { reading: "エピ",     meaning: "上に・外側に",        origin: "ギリシャ語 epi-",    phonetic: "ˈɛpɪ" },
  "cata":   { reading: "カタ",     meaning: "下へ・完全に",        origin: "ギリシャ語 kata-",   phonetic: "ˈkætə" },
  "meta":   { reading: "メタ",     meaning: "超えて・変化",        origin: "ギリシャ語 meta-",   phonetic: "ˈmɛtə" },
  "hypo":   { reading: "ハイポ",   meaning: "下に・不足した",      origin: "ギリシャ語 hypo-",   phonetic: "ˈhaɪpoʊ" },
  "sur":    { reading: "サー",     meaning: "上に・超えて",        origin: "ラテン語 super",     phonetic: "sɜːr" },
  "off":    { reading: "オフ",     meaning: "離れて・外れて",      origin: "古英語 of",          phonetic: "ɔːf" },
  "with":   { reading: "ウィズ",   meaning: "後ろへ・反対に",      origin: "古英語 wið",         phonetic: "wɪð" },
  "amphi":  { reading: "アンフィ", meaning: "両方の・周囲の",      origin: "ギリシャ語 amphi-",  phonetic: "ˈæmfi" },
  "ana":    { reading: "アナ",     meaning: "上へ・再び",          origin: "ギリシャ語 ana-",    phonetic: "ˈænə" },
  /* --- 評価・性質 --- */
  "bene":   { reading: "ベネ",     meaning: "良い",                origin: "ラテン語 bene",      phonetic: "ˈbɛni" },
  "eu":     { reading: "ユー",     meaning: "良い・正常な",        origin: "ギリシャ語 eu-",     phonetic: "juː" },
  "dys":    { reading: "ディス",   meaning: "不良の・困難な",      origin: "ギリシャ語 dys-",    phonetic: "dɪs" },
  "contra": { reading: "コントラ", meaning: "反対の・逆の",        origin: "ラテン語 contra",    phonetic: "ˈkɒntrə" },
  "hetero": { reading: "ヘテロ",   meaning: "異なる",              origin: "ギリシャ語 heteros", phonetic: "ˈhɛtəroʊ" },
  "proto":  { reading: "プロト",   meaning: "最初の・原型の",      origin: "ギリシャ語 protos",  phonetic: "ˈproʊtoʊ" },
  "arch":   { reading: "アーチ",   meaning: "主要な・第一の",      origin: "ギリシャ語 arkhos",  phonetic: "ɑːrtʃ" },
  "quasi":  { reading: "クアシ",   meaning: "準〜・擬似の",        origin: "ラテン語 quasi",     phonetic: "ˈkweɪzaɪ" },
  "self":   { reading: "セルフ",   meaning: "自分自身の",          origin: "古英語 self",        phonetic: "sɛlf" },
  /* --- 分野・領域 --- */
  "geo":    { reading: "ジオ",     meaning: "地球・土地",          origin: "ギリシャ語 ge",      phonetic: "ˈdʒiːoʊ" },
  "hydro":  { reading: "ハイドロ", meaning: "水",                  origin: "ギリシャ語 hydor",   phonetic: "ˈhaɪdroʊ" },
  "thermo": { reading: "サーモ",   meaning: "熱",                  origin: "ギリシャ語 thermos", phonetic: "ˈθɜːrmoʊ" },
  "photo":  { reading: "フォト",   meaning: "光・写真",            origin: "ギリシャ語 phos",    phonetic: "ˈfoʊtoʊ" },
  "electro": { reading: "エレクトロ", meaning: "電気",            origin: "ギリシャ語 elektron", phonetic: "ɪˈlɛktroʊ" },
  "astro":  { reading: "アストロ", meaning: "星・宇宙",            origin: "ギリシャ語 astron",  phonetic: "ˈæstroʊ" },
  "chrono": { reading: "クロノ",   meaning: "時間",                origin: "ギリシャ語 khronos", phonetic: "ˈkrɒnoʊ" },
  "psycho": { reading: "サイコ",   meaning: "心・精神",            origin: "ギリシャ語 psykhe",  phonetic: "ˈsaɪkoʊ" },
  "socio":  { reading: "ソシオ",   meaning: "社会",                origin: "ラテン語 socius",    phonetic: "ˈsoʊsioʊ" },
  "cardio": { reading: "カルディオ", meaning: "心臓",              origin: "ギリシャ語 kardia",  phonetic: "ˈkɑːrdioʊ" },
  "physio": { reading: "フィジオ", meaning: "自然・身体",          origin: "ギリシャ語 physis",  phonetic: "ˈfɪzioʊ" },
  "philo":  { reading: "フィロ",   meaning: "愛する・好む",        origin: "ギリシャ語 philos",  phonetic: "ˈfɪloʊ" },
  "xeno":   { reading: "ゼノ",     meaning: "異質の・外国の",      origin: "ギリシャ語 xenos",   phonetic: "ˈzɛnoʊ" },
  "zoo":    { reading: "ズー",     meaning: "動物",                origin: "ギリシャ語 zoion",   phonetic: "ˈzoʊoʊ" },
  "audio":  { reading: "オーディオ", meaning: "音・聴覚",          origin: "ラテン語 audire",    phonetic: "ˈɔːdioʊ" },
  "video":  { reading: "ビデオ",   meaning: "映像・見る",          origin: "ラテン語 videre",    phonetic: "ˈvɪdioʊ" },
  "radio":  { reading: "レディオ", meaning: "放射・電波",          origin: "ラテン語 radius",    phonetic: "ˈreɪdioʊ" },
  "cyber":  { reading: "サイバー", meaning: "電脳の・情報の",      origin: "ギリシャ語 kybernetes", phonetic: "ˈsaɪbər" },
  "euro":   { reading: "ユーロ",   meaning: "ヨーロッパの",        origin: "ギリシャ語 Europe",  phonetic: "ˈjʊroʊ" },
};

const AFFIX_ROOTS = {
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
  /* 語根は接頭辞・接尾辞と違って語中に現れるため、部分一致で拾われる。
     接頭辞・接尾辞と綴りが重ならないキーだけを置く（LOCAL_AFFIX_DICTは
     接尾辞を最後に展開するので、重複させると意味が上書きされてしまう） */
  "aud":    { reading: "オード",   meaning: "聞く",                origin: "ラテン語 audire",    phonetic: "ɔːd" },
  "bell":   { reading: "ベル",     meaning: "戦い",                origin: "ラテン語 bellum",    phonetic: "bɛl" },
  "brev":   { reading: "ブレヴ",   meaning: "短い",                origin: "ラテン語 brevis",    phonetic: "brɛv" },
  "cap":    { reading: "キャプ",   meaning: "取る・頭",            origin: "ラテン語 capere",    phonetic: "kæp" },
  "carn":   { reading: "カーン",   meaning: "肉",                  origin: "ラテン語 caro",      phonetic: "kɑːrn" },
  "ced":    { reading: "セド",     meaning: "行く・譲る",          origin: "ラテン語 cedere",    phonetic: "siːd" },
  "cess":   { reading: "セス",     meaning: "行く・進む",          origin: "ラテン語 cedere",    phonetic: "sɛs" },
  "circ":   { reading: "サーク",   meaning: "輪・円",              origin: "ラテン語 circus",    phonetic: "sɜːrk" },
  "clam":   { reading: "クラム",   meaning: "叫ぶ",                origin: "ラテン語 clamare",   phonetic: "klæm" },
  "clud":   { reading: "クルード", meaning: "閉じる",              origin: "ラテン語 claudere",  phonetic: "kluːd" },
  "clus":   { reading: "クルース", meaning: "閉じる",              origin: "ラテン語 claudere",  phonetic: "kluːs" },
  "cogn":   { reading: "コグン",   meaning: "知る",                origin: "ラテン語 cognoscere", phonetic: "kɒgn" },
  "corp":   { reading: "コープ",   meaning: "体",                  origin: "ラテン語 corpus",    phonetic: "kɔːrp" },
  "cur":    { reading: "キュア",   meaning: "気にかける・走る",    origin: "ラテン語 cura",      phonetic: "kjʊr" },
  "curr":   { reading: "カー",     meaning: "走る・流れる",        origin: "ラテン語 currere",   phonetic: "kɜːr" },
  "dem":    { reading: "デム",     meaning: "民衆",                origin: "ギリシャ語 demos",   phonetic: "dɛm" },
  "dent":   { reading: "デント",   meaning: "歯",                  origin: "ラテン語 dens",      phonetic: "dɛnt" },
  "derm":   { reading: "ダーム",   meaning: "皮膚",                origin: "ギリシャ語 derma",   phonetic: "dɜːrm" },
  "doc":    { reading: "ドク",     meaning: "教える",              origin: "ラテン語 docere",    phonetic: "dɒk" },
  "dorm":   { reading: "ドーム",   meaning: "眠る",                origin: "ラテン語 dormire",   phonetic: "dɔːrm" },
  "equ":    { reading: "エク",     meaning: "等しい",              origin: "ラテン語 aequus",    phonetic: "ɛkw" },
  "fac":    { reading: "ファク",   meaning: "作る・なす",          origin: "ラテン語 facere",    phonetic: "fæk" },
  "fer":    { reading: "ファー",   meaning: "運ぶ",                origin: "ラテン語 ferre",     phonetic: "fɜːr" },
  "fid":    { reading: "フィド",   meaning: "信じる",              origin: "ラテン語 fides",     phonetic: "fɪd" },
  "fin":    { reading: "フィン",   meaning: "終わり・限界",        origin: "ラテン語 finis",     phonetic: "fɪn" },
  "flect":  { reading: "フレクト", meaning: "曲げる",              origin: "ラテン語 flectere",  phonetic: "flɛkt" },
  "flu":    { reading: "フル",     meaning: "流れる",              origin: "ラテン語 fluere",    phonetic: "fluː" },
  "fort":   { reading: "フォート", meaning: "強い",                origin: "ラテン語 fortis",    phonetic: "fɔːrt" },
  "fract":  { reading: "フラクト", meaning: "壊す・折る",          origin: "ラテン語 frangere",  phonetic: "frækt" },
  "grad":   { reading: "グラド",   meaning: "段階・歩む",          origin: "ラテン語 gradus",    phonetic: "græd" },
  "grat":   { reading: "グラト",   meaning: "喜ばせる・感謝",      origin: "ラテン語 gratus",    phonetic: "græt" },
  "greg":   { reading: "グレグ",   meaning: "群れ",                origin: "ラテン語 grex",      phonetic: "grɛg" },
  "jud":    { reading: "ジュド",   meaning: "裁く",                origin: "ラテン語 judex",     phonetic: "dʒuːd" },
  "junct":  { reading: "ジャンクト", meaning: "つなぐ",            origin: "ラテン語 jungere",   phonetic: "dʒʌŋkt" },
  "lat":    { reading: "ラト",     meaning: "運ぶ",                origin: "ラテン語 latus",     phonetic: "læt" },
  "lev":    { reading: "レヴ",     meaning: "軽くする・上げる",    origin: "ラテン語 levare",    phonetic: "lɛv" },
  "liber":  { reading: "リバー",   meaning: "自由",                origin: "ラテン語 liber",     phonetic: "lɪbər" },
  "loc":    { reading: "ロク",     meaning: "場所",                origin: "ラテン語 locus",     phonetic: "loʊk" },
  "luc":    { reading: "ルク",     meaning: "光",                  origin: "ラテン語 lux",       phonetic: "luːs" },
  "man":    { reading: "マン",     meaning: "手",                  origin: "ラテン語 manus",     phonetic: "mæn" },
  "mater":  { reading: "マター",   meaning: "母",                  origin: "ラテン語 mater",     phonetic: "ˈmɑːtər" },
  "med":    { reading: "メド",     meaning: "中間・癒す",          origin: "ラテン語 medius",    phonetic: "mɛd" },
  "memor":  { reading: "メモア",   meaning: "記憶",                origin: "ラテン語 memor",     phonetic: "ˈmɛmər" },
  "migr":   { reading: "マイグル", meaning: "移動する",            origin: "ラテン語 migrare",   phonetic: "maɪgr" },
  "mort":   { reading: "モート",   meaning: "死",                  origin: "ラテン語 mors",      phonetic: "mɔːrt" },
  "mov":    { reading: "ムーヴ",   meaning: "動く",                origin: "ラテン語 movere",    phonetic: "muːv" },
  "mut":    { reading: "ミュート", meaning: "変える",              origin: "ラテン語 mutare",    phonetic: "mjuːt" },
  "nat":    { reading: "ナト",     meaning: "生まれる",            origin: "ラテン語 nasci",     phonetic: "næt" },
  "nav":    { reading: "ナヴ",     meaning: "船",                  origin: "ラテン語 navis",     phonetic: "næv" },
  "nov":    { reading: "ノヴ",     meaning: "新しい",              origin: "ラテン語 novus",     phonetic: "nɒv" },
  "pater":  { reading: "パター",   meaning: "父",                  origin: "ラテン語 pater",     phonetic: "ˈpɑːtər" },
  "path":   { reading: "パス",     meaning: "感じる・苦しむ",      origin: "ギリシャ語 pathos",  phonetic: "pæθ" },
  "ped":    { reading: "ペド",     meaning: "足・子ども",          origin: "ラテン語 pes",       phonetic: "pɛd" },
  "pel":    { reading: "ペル",     meaning: "追いやる",            origin: "ラテン語 pellere",   phonetic: "pɛl" },
  "pend":   { reading: "ペンド",   meaning: "吊るす・重さを量る",  origin: "ラテン語 pendere",   phonetic: "pɛnd" },
  "phon":   { reading: "フォン",   meaning: "音・声",              origin: "ギリシャ語 phone",   phonetic: "fɒn" },
  "plic":   { reading: "プリク",   meaning: "折る・重ねる",        origin: "ラテン語 plicare",   phonetic: "plɪk" },
  "pon":    { reading: "ポン",     meaning: "置く",                origin: "ラテン語 ponere",    phonetic: "poʊn" },
  "pos":    { reading: "ポズ",     meaning: "置く",                origin: "ラテン語 ponere",    phonetic: "poʊz" },
  "puls":   { reading: "パルス",   meaning: "打つ・追いやる",      origin: "ラテン語 pellere",   phonetic: "pʌls" },
  "punct":  { reading: "パンクト", meaning: "点・刺す",            origin: "ラテン語 punctum",   phonetic: "pʌŋkt" },
  "rupt":   { reading: "ラプト",   meaning: "破る",                origin: "ラテン語 rumpere",   phonetic: "rʌpt" },
  "scend":  { reading: "センド",   meaning: "登る",                origin: "ラテン語 scandere",  phonetic: "sɛnd" },
  "sci":    { reading: "サイ",     meaning: "知る",                origin: "ラテン語 scire",     phonetic: "saɪ" },
  "sect":   { reading: "セクト",   meaning: "切る",                origin: "ラテン語 secare",    phonetic: "sɛkt" },
  "sens":   { reading: "センス",   meaning: "感じる",              origin: "ラテン語 sentire",   phonetic: "sɛns" },
  "sequ":   { reading: "セク",     meaning: "続く",                origin: "ラテン語 sequi",     phonetic: "siːkw" },
  "sign":   { reading: "サイン",   meaning: "しるし",              origin: "ラテン語 signum",    phonetic: "saɪn" },
  "simil":  { reading: "シミル",   meaning: "似た",                origin: "ラテン語 similis",   phonetic: "ˈsɪmɪl" },
  "sist":   { reading: "シスト",   meaning: "立つ",                origin: "ラテン語 sistere",   phonetic: "sɪst" },
  "solv":   { reading: "ソルヴ",   meaning: "解く・緩める",        origin: "ラテン語 solvere",   phonetic: "sɒlv" },
  "somn":   { reading: "ソムン",   meaning: "眠り",                origin: "ラテン語 somnus",    phonetic: "sɒmn" },
  "son":    { reading: "ソン",     meaning: "音",                  origin: "ラテン語 sonus",     phonetic: "sɒn" },
  "soph":   { reading: "ソフ",     meaning: "知恵",                origin: "ギリシャ語 sophia",  phonetic: "sɒf" },
  "spir":   { reading: "スパイア", meaning: "息をする",            origin: "ラテン語 spirare",   phonetic: "spaɪər" },
  "struct": { reading: "ストラクト", meaning: "建てる",            origin: "ラテン語 struere",   phonetic: "strʌkt" },
  "tang":   { reading: "タング",   meaning: "触れる",              origin: "ラテン語 tangere",   phonetic: "tæŋ" },
  "temp":   { reading: "テンプ",   meaning: "時",                  origin: "ラテン語 tempus",    phonetic: "tɛmp" },
  "ten":    { reading: "テン",     meaning: "保つ",                origin: "ラテン語 tenere",    phonetic: "tɛn" },
  "term":   { reading: "ターム",   meaning: "限界・終わり",        origin: "ラテン語 terminus",  phonetic: "tɜːrm" },
  "terr":   { reading: "テラ",     meaning: "土地",                origin: "ラテン語 terra",     phonetic: "tɛr" },
  "test":   { reading: "テスト",   meaning: "証言する",            origin: "ラテン語 testis",    phonetic: "tɛst" },
  "text":   { reading: "テキスト", meaning: "織る",                origin: "ラテン語 texere",    phonetic: "tɛkst" },
  "tort":   { reading: "トート",   meaning: "ねじる",              origin: "ラテン語 torquere",  phonetic: "tɔːrt" },
  "vac":    { reading: "ヴァク",   meaning: "空の",                origin: "ラテン語 vacuus",    phonetic: "væk" },
  "ven":    { reading: "ヴェン",   meaning: "来る",                origin: "ラテン語 venire",    phonetic: "vɛn" },
  "ver":    { reading: "ヴァー",   meaning: "真実",                origin: "ラテン語 verus",     phonetic: "vɛr" },
  "vert":   { reading: "ヴァート", meaning: "向きを変える",        origin: "ラテン語 vertere",   phonetic: "vɜːrt" },
  "vict":   { reading: "ヴィクト", meaning: "征服する",            origin: "ラテン語 vincere",   phonetic: "vɪkt" },
  "viv":    { reading: "ヴィヴ",   meaning: "生きる",              origin: "ラテン語 vivere",    phonetic: "vɪv" },
  "voc":    { reading: "ヴォク",   meaning: "呼ぶ・声",            origin: "ラテン語 vocare",    phonetic: "voʊk" },
  "volv":   { reading: "ヴォルヴ", meaning: "回る・巻く",          origin: "ラテン語 volvere",   phonetic: "vɒlv" },
};

const AFFIX_SUFFIXES = {
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
  "ity":    { reading: "イティ",   meaning: "名詞化（性質・状態）", origin: "ラテン語 -itas",     phonetic: "ɪti" },
  "ance":   { reading: "アンス",   meaning: "名詞化（こと・状態）", origin: "ラテン語 -antia",    phonetic: "əns" },
  "ence":   { reading: "エンス",   meaning: "名詞化（こと・状態）", origin: "ラテン語 -entia",    phonetic: "əns" },
  "ant":    { reading: "アント",   meaning: "〜する人・もの",      origin: "ラテン語 -ans",      phonetic: "ənt" },
  "ent":    { reading: "エント",   meaning: "〜する人・もの",      origin: "ラテン語 -ens",      phonetic: "ənt" },
  "age":    { reading: "エイジ",   meaning: "名詞化（行為・結果）", origin: "ラテン語 -aticum",   phonetic: "ɪdʒ" },
  "ism":    { reading: "イズム",   meaning: "主義・状態",          origin: "ギリシャ語 -ismos",  phonetic: "ɪzəm" },
  "al":     { reading: "アル",     meaning: "〜に関する（形容詞化）", origin: "ラテン語 -alis",  phonetic: "əl" },
  "ic":     { reading: "イック",   meaning: "〜的な（形容詞化）",  origin: "ギリシャ語 -ikos",   phonetic: "ɪk" },
  "ize":    { reading: "アイズ",   meaning: "〜にする（動詞化）",  origin: "ギリシャ語 -izein",  phonetic: "aɪz" },
  "ify":    { reading: "イファイ", meaning: "〜にする（動詞化）",  origin: "ラテン語 -ificare",  phonetic: "ɪfaɪ" },
  "ly":     { reading: "リ",       meaning: "〜のように（副詞化）", origin: "古英語 -lice",       phonetic: "li" },
  "ship":   { reading: "シップ",   meaning: "状態・立場",          origin: "古英語 -scipe",      phonetic: "ʃɪp" },
  "hood":   { reading: "フッド",   meaning: "状態・時期",          origin: "古英語 -had",        phonetic: "hʊd" },
  "ward":   { reading: "ワード",   meaning: "〜の方向へ",          origin: "古英語 -weard",      phonetic: "wərd" },
  /* --- 名詞化（動作・状態・性質） ---
     -ation / -ition / -sion は -ion / -tion と競合するが、キーが別なので
     長い方が優先される（fallbackDecomposeは最長一致、接辞RAGは全候補提示） */
  "ation":  { reading: "エイション", meaning: "名詞化（〜すること）", origin: "ラテン語 -atio",   phonetic: "ˈeɪʃən" },
  "ition":  { reading: "イション", meaning: "名詞化（〜すること）", origin: "ラテン語 -itio",     phonetic: "ˈɪʃən" },
  "sion":   { reading: "ジョン",   meaning: "名詞化（〜すること）", origin: "ラテン語 -sio",      phonetic: "ʒən" },
  "ure":    { reading: "ユア",     meaning: "名詞化（行為・結果）", origin: "ラテン語 -ura",      phonetic: "ər" },
  "ture":   { reading: "チャー",   meaning: "名詞化（行為・結果）", origin: "ラテン語 -tura",     phonetic: "tʃər" },
  "ty":     { reading: "ティ",     meaning: "名詞化（性質・状態）", origin: "ラテン語 -tas",      phonetic: "ti" },
  "cy":     { reading: "シー",     meaning: "名詞化（性質・状態）", origin: "ギリシャ語 -kia",    phonetic: "si" },
  "acy":    { reading: "アシー",   meaning: "名詞化（性質・状態）", origin: "ラテン語 -atia",     phonetic: "əsi" },
  "ancy":   { reading: "アンシー", meaning: "名詞化（性質・状態）", origin: "ラテン語 -antia",    phonetic: "ənsi" },
  "ency":   { reading: "エンシー", meaning: "名詞化（性質・状態）", origin: "ラテン語 -entia",    phonetic: "ənsi" },
  "itude":  { reading: "イチュード", meaning: "名詞化（性質・状態）", origin: "ラテン語 -itudo",  phonetic: "ɪtjuːd" },
  "tude":   { reading: "チュード", meaning: "名詞化（性質・状態）", origin: "ラテン語 -tudo",     phonetic: "tjuːd" },
  "dom":    { reading: "ダム",     meaning: "領域・状態",          origin: "古英語 -dom",        phonetic: "dəm" },
  "ry":     { reading: "リー",     meaning: "名詞化（行為・場所）", origin: "フランス語 -erie",   phonetic: "ri" },
  "ade":    { reading: "エイド",   meaning: "行為・産物",          origin: "ラテン語 -ata",      phonetic: "eɪd" },
  "mony":   { reading: "モニー",   meaning: "名詞化（状態・結果）", origin: "ラテン語 -monium",   phonetic: "moʊni" },
  "ics":    { reading: "イクス",   meaning: "〜学・〜術",          origin: "ギリシャ語 -ika",    phonetic: "ɪks" },
  "ing":    { reading: "イング",   meaning: "動名詞・進行",        origin: "古英語 -ing",        phonetic: "ɪŋ" },
  "ization": { reading: "イゼイション", meaning: "〜化すること",   origin: "ギリシャ語 -izein",  phonetic: "ɪˈzeɪʃən" },
  /* --- 人・行為者 --- */
  "or":     { reading: "オー",     meaning: "〜する人・もの",      origin: "ラテン語 -or",       phonetic: "ər" },
  "ee":     { reading: "イー",     meaning: "〜される人",          origin: "フランス語 -é",      phonetic: "iː" },
  "eer":    { reading: "イア",     meaning: "〜に従事する人",      origin: "ラテン語 -arius",    phonetic: "ɪr" },
  "ier":    { reading: "イア",     meaning: "〜する人",            origin: "フランス語 -ier",    phonetic: "ɪr" },
  "ster":   { reading: "スター",   meaning: "〜する人",            origin: "古英語 -estre",      phonetic: "stər" },
  "ard":    { reading: "アード",   meaning: "〜する人（多く軽蔑）", origin: "ゲルマン語 -hard",   phonetic: "ərd" },
  "ian":    { reading: "イアン",   meaning: "〜の人・〜に属する",  origin: "ラテン語 -ianus",    phonetic: "iən" },
  "arian":  { reading: "エアリアン", meaning: "〜主義の人",        origin: "ラテン語 -arius",    phonetic: "ˈɛəriən" },
  "ician":  { reading: "イシャン", meaning: "〜の専門家",          origin: "ラテン語 -icianus",  phonetic: "ˈɪʃən" },
  /* --- 形容詞化 --- */
  "ish":    { reading: "イッシュ", meaning: "〜のような・やや〜",  origin: "古英語 -isc",        phonetic: "ɪʃ" },
  "like":   { reading: "ライク",   meaning: "〜のような",          origin: "古英語 gelic",       phonetic: "laɪk" },
  "some":   { reading: "サム",     meaning: "〜をもたらす",        origin: "古英語 -sum",        phonetic: "səm" },
  "ial":    { reading: "イアル",   meaning: "〜に関する",          origin: "ラテン語 -ialis",    phonetic: "iəl" },
  "ile":    { reading: "アイル",   meaning: "〜しやすい",          origin: "ラテン語 -ilis",     phonetic: "aɪl" },
  "ine":    { reading: "イン",     meaning: "〜の性質の",          origin: "ラテン語 -inus",     phonetic: "aɪn" },
  "ese":    { reading: "イーズ",   meaning: "〜の国の・〜語",      origin: "ラテン語 -ensis",    phonetic: "iːz" },
  "esque":  { reading: "エスク",   meaning: "〜風の",              origin: "イタリア語 -esco",   phonetic: "ɛsk" },
  "ose":    { reading: "オース",   meaning: "〜に満ちた",          origin: "ラテン語 -osus",     phonetic: "oʊs" },
  "otic":   { reading: "オティック", meaning: "〜の状態の",        origin: "ギリシャ語 -otikos", phonetic: "ˈɒtɪk" },
  "oid":    { reading: "オイド",   meaning: "〜に似た",            origin: "ギリシャ語 -oeides", phonetic: "ɔɪd" },
  "form":   { reading: "フォーム", meaning: "〜の形の",            origin: "ラテン語 forma",     phonetic: "fɔːrm" },
  "fold":   { reading: "フォールド", meaning: "〜倍の",            origin: "古英語 -feald",      phonetic: "foʊld" },
  "proof":  { reading: "プルーフ", meaning: "〜を防ぐ",            origin: "ラテン語 probare",   phonetic: "pruːf" },
  "worthy": { reading: "ワージー", meaning: "〜に値する",          origin: "古英語 weorþ",       phonetic: "ˈwɜːrði" },
  "wise":   { reading: "ワイズ",   meaning: "〜の方向に・〜に関して", origin: "古英語 wise",      phonetic: "waɪz" },
  "ory":    { reading: "オリー",   meaning: "〜の性質の・〜する場所", origin: "ラテン語 -orius", phonetic: "ɔːri" },
  /* --- 縮小辞 --- */
  "let":    { reading: "レット",   meaning: "小さい〜",            origin: "フランス語 -let",    phonetic: "lət" },
  "ling":   { reading: "リング",   meaning: "小さい〜・〜に属する", origin: "古英語 -ling",       phonetic: "lɪŋ" },
  "ette":   { reading: "エット",   meaning: "小さい〜・女性の",    origin: "フランス語 -ette",   phonetic: "ˈɛt" },
  "kin":    { reading: "キン",     meaning: "小さい〜",            origin: "中英語 -kin",        phonetic: "kɪn" },
  "cule":   { reading: "キュール", meaning: "小さい〜",            origin: "ラテン語 -culus",    phonetic: "kjuːl" },
  /* --- 学問・計測・医学 --- */
  "logy":   { reading: "ロジー",   meaning: "〜学・〜論",          origin: "ギリシャ語 -logia",  phonetic: "lədʒi" },
  "graphy": { reading: "グラフィー", meaning: "〜記述・〜写法",    origin: "ギリシャ語 -graphia", phonetic: "grəfi" },
  "graph":  { reading: "グラフ",   meaning: "書くもの・図",        origin: "ギリシャ語 graphein", phonetic: "græf" },
  "gram":   { reading: "グラム",   meaning: "書かれたもの・記録",  origin: "ギリシャ語 gramma", phonetic: "græm" },
  "meter":  { reading: "メーター", meaning: "計測器・測ること",    origin: "ギリシャ語 metron",  phonetic: "mɪtər" },
  "metry":  { reading: "メトリー", meaning: "測定法",              origin: "ギリシャ語 metron",  phonetic: "mɪtri" },
  "scope":  { reading: "スコープ", meaning: "見るための器具",      origin: "ギリシャ語 skopein", phonetic: "skoʊp" },
  "scopy":  { reading: "スコピー", meaning: "観察・検査",          origin: "ギリシャ語 skopein", phonetic: "skəpi" },
  "nomy":   { reading: "ノミー",   meaning: "〜学・法則",          origin: "ギリシャ語 nomos",   phonetic: "nəmi" },
  "cracy":  { reading: "クラシー", meaning: "〜による支配・政治",  origin: "ギリシャ語 kratos",  phonetic: "krəsi" },
  "crat":   { reading: "クラット", meaning: "〜支配者・〜主義者",  origin: "ギリシャ語 kratos",  phonetic: "kræt" },
  "archy":  { reading: "アーキー", meaning: "〜による支配・政治",  origin: "ギリシャ語 arkhia",  phonetic: "ɑːrki" },
  "onym":   { reading: "オニム",   meaning: "名前",                origin: "ギリシャ語 onyma",   phonetic: "ənɪm" },
  "phone":  { reading: "フォン",   meaning: "音・声",              origin: "ギリシャ語 phone",   phonetic: "foʊn" },
  "phony":  { reading: "フォニー", meaning: "音・響き",            origin: "ギリシャ語 phone",   phonetic: "fəni" },
  "phile":  { reading: "フィル",   meaning: "〜を好む人",          origin: "ギリシャ語 philos",  phonetic: "faɪl" },
  "philia": { reading: "フィリア", meaning: "〜への嗜好",          origin: "ギリシャ語 philia",  phonetic: "ˈfɪliə" },
  "phobia": { reading: "フォビア", meaning: "〜恐怖症",            origin: "ギリシャ語 phobos",  phonetic: "ˈfoʊbiə" },
  "pathy":  { reading: "パシー",   meaning: "感情・病気・療法",    origin: "ギリシャ語 pathos",  phonetic: "pəθi" },
  "itis":   { reading: "アイティス", meaning: "〜炎",              origin: "ギリシャ語 -itis",   phonetic: "ˈaɪtɪs" },
  "osis":   { reading: "オーシス", meaning: "〜症・〜の状態",      origin: "ギリシャ語 -osis",   phonetic: "ˈoʊsɪs" },
  "oma":    { reading: "オーマ",   meaning: "腫瘍",                origin: "ギリシャ語 -oma",    phonetic: "ˈoʊmə" },
  "emia":   { reading: "イーミア", meaning: "血液の状態",          origin: "ギリシャ語 haima",   phonetic: "ˈiːmiə" },
  "algia":  { reading: "アルジア", meaning: "痛み",                origin: "ギリシャ語 algos",   phonetic: "ˈældʒə" },
  "ectomy": { reading: "エクトミー", meaning: "切除",              origin: "ギリシャ語 ektome",  phonetic: "ˈɛktəmi" },
  "tomy":   { reading: "トミー",   meaning: "切開",                origin: "ギリシャ語 tome",    phonetic: "təmi" },
  "plasty": { reading: "プラスティ", meaning: "形成術",            origin: "ギリシャ語 plassein", phonetic: "plæsti" },
  "therapy": { reading: "セラピー", meaning: "療法",               origin: "ギリシャ語 therapeia", phonetic: "ˈθɛrəpi" },
  "trophy": { reading: "トロフィー", meaning: "栄養・発育",        origin: "ギリシャ語 trophe",  phonetic: "trəfi" },
  "stasis": { reading: "ステイシス", meaning: "停止・平衡",        origin: "ギリシャ語 stasis",  phonetic: "ˈsteɪsɪs" },
  "morph":  { reading: "モーフ",   meaning: "形・形態",            origin: "ギリシャ語 morphe",  phonetic: "mɔːrf" },
  "gen":    { reading: "ジェン",   meaning: "生じるもの・genesis", origin: "ギリシャ語 genes",   phonetic: "dʒən" },
  "genic":  { reading: "ジェニック", meaning: "〜を生む・〜に適した", origin: "ギリシャ語 -genes", phonetic: "ˈdʒɛnɪk" },
  "cide":   { reading: "サイド",   meaning: "殺すこと・殺す物",    origin: "ラテン語 caedere",   phonetic: "saɪd" },
};

const LOCAL_AFFIX_DICT = { ...AFFIX_PREFIXES, ...AFFIX_ROOTS, ...AFFIX_SUFFIXES };

/* demo_words.csv の語呂合わせ本文にだけ登場する接辞（LOCAL_AFFIX_DICTに
   収録の無いもの）の読み・意味・語源・発音記号。DEMO_WORD_DATAをCSVから
   組み立てる際、goroText中の(part)注釈をここと LOCAL_AFFIX_DICT で解決する。
   isKnownAffix()の判定には使わない（＝これらは常に「新しく調べた接辞」の
   オレンジ色で表示される。実際、辞書未収録の語根として扱うのが正しい） */
const DEMO_CUSTOM_MORPHEMES = {
  "ation":  { reading: "エーション", meaning: "名詞化（〜すること）", origin: "ラテン語 -atio", phonetic: "eɪʃən" },
  "or":     { reading: "オア", meaning: "〜する人・もの", origin: "ラテン語 -or", phonetic: "ɔːr" },
  "ure":    { reading: "ユア", meaning: "〜すること・こと", origin: "ラテン語 -ura", phonetic: "jʊər" },
  "ing":    { reading: "イング", meaning: "名詞化（動名詞）", origin: "古英語 -ing", phonetic: "ɪŋ" },
  "lock":   { reading: "ロック", meaning: "錠・閉じる", origin: "古英語 loc", phonetic: "lɒk" },
  "build":  { reading: "ビルド", meaning: "建てる", origin: "古英語 byldan", phonetic: "bɪld" },
  "order":  { reading: "オーダー", meaning: "順序・命令", origin: "ラテン語 ordo", phonetic: "ˈɔːrdər" },
  "view":   { reading: "ヴュー", meaning: "見る・眺め", origin: "ラテン語 videre", phonetic: "vjuː" },
  "gradu":  { reading: "グラジュ", meaning: "段階を踏む", origin: "ラテン語 gradus", phonetic: "grædʒu" },
  "cult":   { reading: "カルト", meaning: "耕す・育てる", origin: "ラテン語 colere", phonetic: "kʌlt" },
  "lat":    { reading: "ラト", meaning: "運ぶ・移す", origin: "ラテン語 latus", phonetic: "leɪt" },
  "clud":   { reading: "クルード", meaning: "閉じる", origin: "ラテン語 claudere", phonetic: "kluːd" },
  "oper":   { reading: "オペル", meaning: "働く", origin: "ラテン語 operari", phonetic: "ˈɒpər" },
  "nect":   { reading: "ネクト", meaning: "結ぶ", origin: "ラテン語 nectere", phonetic: "nɛkt" },
  "pact":   { reading: "パクト", meaning: "締める・固める", origin: "ラテン語 pangere", phonetic: "pækt" },
  "leg":    { reading: "レグ", meaning: "法律", origin: "ラテン語 lex/legis", phonetic: "liːg" },
  "poss":   { reading: "ポッス", meaning: "できる・力", origin: "ラテン語 posse", phonetic: "pɒs" },
  "regul":  { reading: "レギュル", meaning: "規則・定める", origin: "ラテン語 regula", phonetic: "ˈregjʊl" },
  "friend": { reading: "フレンド", meaning: "友", origin: "古英語 freond", phonetic: "frɛnd" },
  "frost":  { reading: "フロスト", meaning: "霜・凍る", origin: "古英語 forst", phonetic: "frɒst" },
  "sens":   { reading: "センス", meaning: "感じる", origin: "ラテン語 sentire", phonetic: "sɛns" },
  "mat":    { reading: "マト", meaning: "自ら動く", origin: "ギリシャ語 -matos", phonetic: "mæt" },
  "come":   { reading: "カム", meaning: "来る", origin: "古英語 cuman", phonetic: "kʌm" },
  "estim":  { reading: "エスティム", meaning: "見積もる", origin: "ラテン語 aestimare", phonetic: "ˈɛstɪm" },
  "vis":    { reading: "ヴィス", meaning: "見る", origin: "ラテン語 videre", phonetic: "vɪs" },
  "fin":    { reading: "フィン", meaning: "終わり・限り", origin: "ラテン語 finis", phonetic: "fɪn" },
  "ply":    { reading: "プライ", meaning: "折る・重ねる", origin: "ラテン語 plicare", phonetic: "plaɪ" },
  "cast":   { reading: "キャスト", meaning: "投げる", origin: "古ノルド語 kasta", phonetic: "kæst" },
  "norm":   { reading: "ノーム", meaning: "基準・規範", origin: "ラテン語 norma", phonetic: "nɔːrm" },
  "vent":   { reading: "ヴェント", meaning: "来る", origin: "ラテン語 venire", phonetic: "vɛnt" },
  "noon":   { reading: "ヌーン", meaning: "正午", origin: "ラテン語 nona", phonetic: "nuːn" },
  "grade":  { reading: "グレード", meaning: "段階", origin: "ラテン語 gradus", phonetic: "greɪd" },
  "act":    { reading: "アクト", meaning: "行う", origin: "ラテン語 agere", phonetic: "ækt" },
  "road":   { reading: "ロード", meaning: "道", origin: "古英語 rad", phonetic: "roʊd" },
  "load":   { reading: "ロード", meaning: "積む・荷", origin: "古英語 lad", phonetic: "loʊd" },
  "system": { reading: "システム", meaning: "組織・体系", origin: "ギリシャ語 systema", phonetic: "ˈsɪstəm" },
  "brace":  { reading: "ブレース", meaning: "腕・締める", origin: "ラテン語 bracchium", phonetic: "breɪs" },
  "gene":   { reading: "ジーン", meaning: "生まれ・種", origin: "ギリシャ語 genos", phonetic: "dʒiːn" },
  "struct": { reading: "ストラクト", meaning: "組み立てる", origin: "ラテン語 struere", phonetic: "strʌkt" },
  "scop":   { reading: "スコープ", meaning: "見る道具", origin: "ギリシャ語 skopein", phonetic: "skoʊp" },
  "night":  { reading: "ナイト", meaning: "夜", origin: "古英語 niht", phonetic: "naɪt" },
  "nat":    { reading: "ナト", meaning: "生まれる", origin: "ラテン語 nasci", phonetic: "næt" },
  "stand":  { reading: "スタンド", meaning: "立つ", origin: "古英語 standan", phonetic: "stænd" },
  "dox":    { reading: "ドクス", meaning: "意見・信条", origin: "ギリシャ語 doxa", phonetic: "dɒks" },
  "fect":   { reading: "フェクト", meaning: "作る・行う", origin: "ラテン語 facere", phonetic: "fɛkt" },
  "nym":    { reading: "ニム", meaning: "名前", origin: "ギリシャ語 onyma", phonetic: "nɪm" },
  "chron":  { reading: "クロン", meaning: "時間", origin: "ギリシャ語 chronos", phonetic: "krɒn" },
  "cycl":   { reading: "サイクル", meaning: "輪・円", origin: "ギリシャ語 kyklos", phonetic: "ˈsaɪkl" },
  "viol":   { reading: "ヴァイオ", meaning: "紫・すみれ", origin: "ラテン語 viola", phonetic: "ˈvaɪə" },
  "form":   { reading: "フォーム", meaning: "形", origin: "ラテン語 forma", phonetic: "fɔːrm" },
  "roy":    { reading: "ロイ", meaning: "王", origin: "ラテン語 rex/regis", phonetic: "rɔɪ" },
  "milit":  { reading: "ミリト", meaning: "兵士", origin: "ラテン語 miles/militis", phonetic: "ˈmɪlɪt" },
  "power":  { reading: "パワー", meaning: "力", origin: "ラテン語 posse", phonetic: "ˈpaʊər" },
  "care":   { reading: "ケア", meaning: "気づかい", origin: "古英語 caru", phonetic: "kɛr" },
  "equip":  { reading: "イクイプ", meaning: "備える", origin: "古フランス語 equiper", phonetic: "ɪˈkwɪp" },
  "kind":   { reading: "カインド", meaning: "親切な・種類", origin: "古英語 gecynde", phonetic: "kaɪnd" },
  "art":    { reading: "アート", meaning: "技・芸術", origin: "ラテン語 ars/artis", phonetic: "ɑːrt" },
  "abil":   { reading: "アビル", meaning: "できる・力", origin: "ラテン語 habilis", phonetic: "əˈbɪl" },
  "pack":   { reading: "パック", meaning: "包む", origin: "中世オランダ語 pak", phonetic: "pæk" },
  "tour":   { reading: "ツアー", meaning: "巡る", origin: "ラテン語 tornus", phonetic: "tʊər" },
  "simpl":  { reading: "シンプル", meaning: "単純な", origin: "ラテン語 simplex", phonetic: "ˈsɪmpl" },
  "quick":  { reading: "クイック", meaning: "素早い", origin: "古英語 cwic", phonetic: "kwɪk" },
  "child":  { reading: "チャイルド", meaning: "子ども", origin: "古英語 cild", phonetic: "tʃaɪld" },
  "man":    { reading: "マン", meaning: "手", origin: "ラテン語 manus", phonetic: "mæn" },
  "photo":  { reading: "フォト", meaning: "光", origin: "ギリシャ語 phos/photos", phonetic: "ˈfoʊtoʊ" },
  "phon":   { reading: "フォン", meaning: "音・声", origin: "ギリシャ語 phone", phonetic: "foʊn" },
  "audi":   { reading: "オーディ", meaning: "聞く", origin: "ラテン語 audire", phonetic: "ˈɔːdi" },
  "path":   { reading: "パス", meaning: "感じる・苦しむ", origin: "ギリシャ語 pathos", phonetic: "pæθ" },
  "sign":   { reading: "サイン", meaning: "印・しるし", origin: "ラテン語 signum", phonetic: "saɪn" },
  "solu":   { reading: "ソル", meaning: "解く・ゆるめる", origin: "ラテン語 solvere", phonetic: "sɒl" },
  "main":   { reading: "メイン", meaning: "手・主要な", origin: "ラテン語 manus", phonetic: "meɪn" },
  "tain":   { reading: "テイン", meaning: "保つ", origin: "ラテン語 tenere", phonetic: "teɪn" },
  "valu":   { reading: "ヴァル", meaning: "価値", origin: "ラテン語 valere", phonetic: "ˈvælju" },
  "ver":    { reading: "ヴェル", meaning: "真実", origin: "ラテン語 verus", phonetic: "vɛr" },
  "vinc":   { reading: "ヴィンク", meaning: "打ち勝つ", origin: "ラテン語 vincere", phonetic: "vɪns" },
  "voc":    { reading: "ヴォク", meaning: "声・呼ぶ", origin: "ラテン語 vox/vocis", phonetic: "voʊk" },
  "terr":   { reading: "テル", meaning: "土地", origin: "ラテン語 terra", phonetic: "tɛr" },
  "ain":    { reading: "アイン", meaning: "〜に関する", origin: "ラテン語 -anus", phonetic: "eɪn" },
  "mem":    { reading: "メモ", meaning: "記憶", origin: "ラテン語 memor", phonetic: "mɛm" },
  "nov":    { reading: "ノヴ", meaning: "新しい", origin: "ラテン語 novus", phonetic: "nɒv" },
  "prim":   { reading: "プリム", meaning: "最初の", origin: "ラテン語 primus", phonetic: "praɪm" },
  "it":     { reading: "イト", meaning: "行く", origin: "ラテン語 ire", phonetic: "ɪt" },
  "cor":    { reading: "コル", meaning: "共に（com-の異形）", origin: "ラテン語 com- の異形", phonetic: "kɔːr" },
  "rupt":   { reading: "ラプト", meaning: "破る", origin: "ラテン語 rumpere", phonetic: "rʌpt" },
  "sect":   { reading: "セクト", meaning: "切る", origin: "ラテン語 secare", phonetic: "sɛkt" },
  "sequ":   { reading: "セク", meaning: "続く", origin: "ラテン語 sequi", phonetic: "siːkw" },
  "son":    { reading: "ソン", meaning: "音", origin: "ラテン語 sonus", phonetic: "sɒn" },
  "tact":   { reading: "タクト", meaning: "触れる", origin: "ラテン語 tangere", phonetic: "tækt" },
  "ile":    { reading: "イル", meaning: "〜しやすい", origin: "ラテン語 -ilis", phonetic: "aɪl" },
  "urb":    { reading: "ウルブ", meaning: "都市", origin: "ラテン語 urbs", phonetic: "ɜːrb" },
  "an":     { reading: "アン", meaning: "〜に関する", origin: "ラテン語 -anus", phonetic: "ən" },
  "sur":    { reading: "サー", meaning: "上に・超えて", origin: "ラテン語 super", phonetic: "sɜːr" },
  "viv":    { reading: "ヴィヴ", meaning: "生きる", origin: "ラテン語 vivere", phonetic: "vɪv" },
  "cap":    { reading: "キャプ", meaning: "取る・つかむ", origin: "ラテン語 capere", phonetic: "kæp" },
  "af":     { reading: "アフ", meaning: "〜へ（ad-の異形）", origin: "ラテン語 ad- の異形", phonetic: "əf" },
  "flu":    { reading: "フル", meaning: "流れる", origin: "ラテン語 fluere", phonetic: "fluː" },
  "fund":   { reading: "ファンド", meaning: "底・基礎", origin: "ラテン語 fundus", phonetic: "fʌnd" },
  "col":    { reading: "コル", meaning: "共に（com-の異形）", origin: "ラテン語 com- の異形", phonetic: "kɒl" },
  "lect":   { reading: "レクト", meaning: "集める・選ぶ", origin: "ラテン語 legere", phonetic: "lɛkt" },
  "ar":     { reading: "アー", meaning: "〜の・〜に関する", origin: "ラテン語 -aris", phonetic: "ər" },
  "as":     { reading: "アス", meaning: "〜へ（ad-の異形）", origin: "ラテン語 ad- の異形", phonetic: "əs" },
  "at":     { reading: "アト", meaning: "〜へ（ad-の異形）", origin: "ラテン語 ad- の異形", phonetic: "æt" },
  "dif":    { reading: "ディフ", meaning: "分離・異なる方向へ", origin: "ラテン語 dis- の異形", phonetic: "dɪf" },
  "fer":    { reading: "ファー", meaning: "運ぶ", origin: "ラテン語 ferre", phonetic: "fɜːr" },
  "sist":   { reading: "シスト", meaning: "立つ", origin: "ラテン語 sistere", phonetic: "sɪst" },
  "duct":   { reading: "ダクト", meaning: "導く", origin: "ラテン語 ducere", phonetic: "dʌkt" },
  "graph":  { reading: "グラフ", meaning: "書く・描く", origin: "ギリシャ語 graphein", phonetic: "græf" },
  "lead":   { reading: "リード", meaning: "導く", origin: "古英語 lædan", phonetic: "liːd" },
  "loc":    { reading: "ロク", meaning: "場所", origin: "ラテン語 locus", phonetic: "loʊk" },
  "lumin":  { reading: "ルミン", meaning: "光", origin: "ラテン語 lumen", phonetic: "ˈluːmɪn" },
  "mot":    { reading: "モート", meaning: "動く", origin: "ラテン語 movere", phonetic: "moʊt" },
  "pend":   { reading: "ペンド", meaning: "ぶら下がる・重さを量る", origin: "ラテン語 pendere", phonetic: "pɛnd" },
  "plic":   { reading: "プリク", meaning: "折る・重ねる", origin: "ラテン語 plicare", phonetic: "plɪk" },
  "tens":   { reading: "テンス", meaning: "張る", origin: "ラテン語 tendere", phonetic: "tɛns" },
  "test":   { reading: "テスト", meaning: "証言する", origin: "ラテン語 testis", phonetic: "tɛst" },
  "funct":  { reading: "ファンクト", meaning: "働く・機能", origin: "ラテン語 fungi", phonetic: "fʌŋkt" },
  "velop":  { reading: "ヴェロプ", meaning: "包む", origin: "古フランス語 voloper", phonetic: "ˈvɛləp" },
};

/* ------------------------------------------------------------------ *
 * 1. IndexedDB ラッパー
 * ------------------------------------------------------------------ */
const DB_NAME = "setsugoro-db";
const DB_VERSION = 3;
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("words")) db.createObjectStore("words", { keyPath: "id" });
      /* 未知の語根（AI推定・辞書未収録）の表記をembeddingで統合するための
         ローカルのみのキャッシュ。part（接辞の綴り）をキーに、初めて見た
         意味を正としてvector（meaningのembedding）とともに保存する */
      if (!db.objectStoreNames.contains("affixes")) db.createObjectStore("affixes", { keyPath: "part" });
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv", { keyPath: "key" });
      /* 語呂合わせの動的Few-shot・マンネリ検出用コーパス（ローカルのみ、
         クラウド同期はしない）。DEMO_WORD_DATAの種データ＋ユーザーが
         保存した語呂を、意味のembeddingとともに蓄積する */
      if (!db.objectStoreNames.contains("goro_corpus")) db.createObjectStore("goro_corpus", { keyPath: "id" });
      /* まとめて登録した単語の待ち行列（ローカルのみ、クラウド同期はしない）。
         登録しただけの単語と、生成は済んだがまだ確認していない結果を持つ。
         単語帳に保存した時点でこのストアからは消える */
      if (!db.objectStoreNames.contains("batch_queue")) db.createObjectStore("batch_queue", { keyPath: "id" });
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
/* 接辞辞書が数十〜百件規模に育つと、単語と無関係な接辞まで毎回
   まるごとプロンプトに入れることになりノイズが増える。単語の綴りに
   前方一致・後方一致する接頭辞・接尾辞、部分一致する語根だけを
   抽出して渡す（接辞RAG。埋め込みではなく文字列マッチで十分な
   ことが多いため、ここはembeddingを使わない軽量な絞り込み） */
function relevantAffixesForWord(word) {
  const w = (word || "").toLowerCase();
  const prefixes = Object.keys(AFFIX_PREFIXES).filter((k) => w.startsWith(k) && k.length < w.length);
  const suffixes = Object.keys(AFFIX_SUFFIXES).filter((k) => w.endsWith(k) && k.length < w.length);
  const roots = Object.keys(AFFIX_ROOTS).filter((k) => w.includes(k));
  return [...new Set([...prefixes, ...suffixes, ...roots])];
}

/* この単語の綴りに一致する既知の接辞を、プロンプトに載せる形に整える。
   1語ずつの経路とまとめ経路で同じ絞り込みを使う */
function knownAffixesFor(word) {
  const relevant = relevantAffixesForWord(word);
  return relevant.length
    ? relevant.join(", ")
    : "（この単語の綴りに前方一致・後方一致・部分一致する既知の接辞はありません。教科書的に広く認められている接辞で分割してください）";
}

function decomposeSystemPrompt(word) {
  return DECOMPOSE_SYS_TEMPLATE(knownAffixesFor(word));
}

/* 分解プロンプトの本文。単語ごとに変わるのは「既知の接辞一覧」と出力形式
   だけで、規則そのものは共通なので定数として切り出しておく。1語ずつ
   処理する DECOMPOSE_SYS_TEMPLATE と、複数語をまとめて1リクエストで
   処理する BATCH_DECOMPOSE_SYS_TEMPLATE の両方が、ここにある同一の文面を
   使う（まとめ処理用に規則を書き写すと、片方だけ直したときに精度が
   静かに食い違っていくため） */
const DECOMPOSE_ROLE_RULES = [
  "あなたは英語の語源・形態素解析の専門家です。",
  "まず、入力が実在の英単語かどうかを判定してください。この判定はできるだけ寛容に行い、少しでも実在の英単語のタイプミスである可能性があれば、word_existsをfalseにせず積極的に修正候補を採用してください。",
  "具体的には、1〜2文字程度の入れ替え・欠落・余分・置き換え（例: teh→the, recieve→receive, seperate→separate, langage→language, adress→address, occured→occurred, definately→definitely）や、キーボード上で隣接するキーの打ち間違い、二重母音・子音の重複ミスなど、よくあるタイプミスのパターンは、単語がある程度長ければ2〜3文字程度異なっていても、最も綴りが近く一般的な実在の英単語に積極的に修正し、word_existsをtrue、corrected_wordにその修正後の単語、was_correctedをtrueにしてください。迷った場合も、実在する単語である可能性が少しである方に倒してください。誤りがなければword_existsをtrue、corrected_wordに入力そのもの、was_correctedをfalseにしてください。",
  "word_existsをfalseにしてよいのは、ランダムな文字の羅列など、どう読んでも英単語のタイプミスとは考えられず、綴りの近い実在の英単語も思い当たらない場合に限ります。この場合、corrected_wordには入力そのものを入れ、word_meaning・memory_tipは空文字、morphemesは空配列で構いません（それ以上分析しないでください）。",
  "word_existsがtrueの場合のみ、以降の分割・分析を、修正後の単語（corrected_word）に対して行ってください。",
  "corrected_wordを接頭辞・語根・接尾辞（接辞 = morpheme）に分割してください。",
];

const DECOMPOSE_AFFIX_HINT = (knownAffixes) => `次の既知の接頭辞・接尾辞一覧を優先的に使ってください: ${knownAffixes}`;

const DECOMPOSE_SPLIT_RULES = [
  "単語がこの一覧のいずれかの文字列で始まる・終わる場合は、必ずその一覧の文字列と完全に一致する形で切り出してください（例: 一覧に'con'があれば'co'ではなく'con'を使う）。一覧にない場合のみ、教科書的に広く認められている接辞を使ってください。",
  "接頭辞・接尾辞を取り除いた後に残る中間部分（語根候補）についても、その先頭や末尾がさらに一覧の接頭辞・接尾辞（教科書的に広く認められている接辞を含む）と完全に一致する場合は、それ以上一致する接辞がなくなるまで再帰的に切り出しを続けてください。例えば competition は com(接頭辞) / pet(語根) / ition(接尾辞) のように、中間部分 compet の先頭にある com も一覧にあるため接頭辞として分離してください。単に語根が長い・見慣れないという理由だけで分割を諦めず、既知の接辞パターンに一致する部分がないか必ず確認してください。",
  "ただし、分割しすぎて1〜2文字だけの無意味な断片や、教育的に不自然な分割にはしないでください。それ以上分解すると学習上の意味を持たない断片になる場合は、そこで分割を止めて語根としてください。",
  "最終的に残った、それ以上分解できない中心部分だけを語根とし、接尾辞の一部（活用語尾や連結母音など）を語根に含めないでください。",
  "各要素を連結するとcorrected_wordと完全に一致するようにしてください（文字の欠落・重複がないこと）。",
  "各要素について、そのカタカナ読み（reading）・日本語での意味（meaning）・由来（origin、簡潔に）・国際音声記号によるその要素単体の発音記号（phonetic、IPA表記、スラッシュや括弧は付けない）を必ず付けてください。語根が一般に馴染みのないものでも、meaningとoriginを空にせず最も可能性の高い語源を推定して記入してください。",
  "あわせて、単語全体の日本語での意味（word_meaning、簡潔な訳語や説明）と、単語全体の国際音声記号による発音記号（word_phonetic、IPA表記、スラッシュや括弧は付けない）も必ず記入してください。",
  "さらに、各接辞の意味を踏まえたうえでこの単語をどう覚えればよいかを示す一文（memory_tip）を、日本語で100文字以内で必ず記入してください。",
  "memory_tipで言及する分割は、morphemesの分割と必ず一致させてください。memory_tipにmorphemesより細かい分割を書いてしまう場合（例: morphemesはbereave/mentなのにmemory_tipには「be-(強調)+reave(奪う)+ment(結果)」と書く）は、memory_tipの方が正しく、morphemesの分割が不足しています。その場合はmemory_tipに合わせてmorphemesを分割し直してから出力してください。",
  "また、この単語の類義語（synonyms、意味がほぼ同じ実在する一般的な英単語）を最大5個、対義語（antonyms、意味が反対・対照的な実在する一般的な英単語）を最大5個、それぞれ配列で挙げてください。該当する単語が少ない、または特に無い場合は無理に埋めず、空配列や少ない件数のままで構いません。",
];

const DECOMPOSE_EXAMPLES = [
  "例: investigation → in(接頭辞) / vestig(語根、探る) / ation(接尾辞、〜すること) のように、既知の接尾辞パターン（-ation, -tion, -able 等）はまとめて一つの要素として扱ってください。",
  "例: competition → com(接頭辞、共に) / pet(語根、求める) / ition(接尾辞、〜すること) のように、接尾辞を除いた語根候補 compet がさらに一覧の接頭辞 com で始まっている場合は、com も分離して3つ以上の要素に分割してください。",
];

const DECOMPOSE_SYS_TEMPLATE = (knownAffixes) => [
  ...DECOMPOSE_ROLE_RULES,
  DECOMPOSE_AFFIX_HINT(knownAffixes),
  ...DECOMPOSE_SPLIT_RULES,
  "出力は次のJSON形式のみを返し、それ以外の文章は一切書かないでください。",
  '{"word_exists":true,"corrected_word":"investigation","was_corrected":false,"word_meaning":"調査する・捜査する","word_phonetic":"ɪnˌvɛstɪˈɡeɪʃən","memory_tip":"in(中へ)+vestig(足跡を)+ation(たどること)で、痕跡を中まで追う=調査する、と覚える。","synonyms":["inquiry","probe","examination"],"antonyms":["neglect"],"morphemes":[{"part":"dict","reading":"ジクト","meaning":"言う","origin":"ラテン語 dicere","phonetic":"dɪkt"},{"part":"ion","reading":"イオン","meaning":"名詞化（〜すること）","origin":"ラテン語 -io","phonetic":"ən"}]}',
  ...DECOMPOSE_EXAMPLES,
].join("\n");

/* 語呂合わせプロンプトのうち、対象の単語によらず常に同じ規則。
   1語ずつ作る goroSystemPrompt と、複数語を1リクエストにまとめる
   batchGoroSystemPrompt が、まったく同じ文面をここから使う。
   まとめ生成のために規則を書き写してしまうと、片方だけ手を入れた
   ときにまとめ生成の精度だけが静かに落ちるため、必ず共有する */
const GORO_RULE_MATERIAL = [
  "各接辞の【意味の直訳】ではなく【カタカナ読み（音）】を素材にしてください。読みはひとまとまりの単語として丸ごと使おうとせず、1〜2音程度の断片に分解し、実在する別々の日本語表現の中に散りばめてください。",
  /* 音の扱い。「省略してよい」と書いていたら接辞の音がごっそり
  抜け落ちるようになったため、崩すのは自由・省略は不可、と
  はっきり分ける */
  "【重要】どの接辞も省略せず、全ての接辞の音を必ず一文の中に登場させてください。ただし元の発音に忠実である必要はまったくありません。pre(プレ)を「プリッ」、sent(セント)を「せんと」、ation(エーション)を「A賞」のように、日本語として面白く自然になるなら大胆に音を崩して構いません。崩すのは自由、省略は不可です。",
  /* 出力書式。どの音がどの接辞に対応するかを読み手に示すため、
  音の直後に接辞の綴りをカッコで添えさせる。この注釈は表示上の
  補助であって本文ではないので、文字数には数えない */
  "音を担っている箇所の直後に、対応する接辞の綴りを半角カッコで添えてください（例:「プリッ(pre)と」）。カッコに入れてよいのは接辞の綴りだけで、意味の日本語訳を書いてはいけません。このカッコは表示上の補助なので、文字数には数えません。",
  "【重要】注釈は1つの接辞につき1箇所だけです。その接辞の音はひとまとまりの箇所でまとめて担わせてください。1音ずつ区切って同じ注釈を繰り返してはいけません（✗「べ(bed)ッ(bed)ド(bed)」→ ○「ベッド(bed)」）。",
  "接辞が1つしかない単語（それ以上分解できない語）の場合も同じで、注釈は1箇所だけ付けます。",
  "お手本: pre(プレ)/sent(セント)/ation(エーション)、意味「発表」 → 「プリッ(pre)とせんと(sent)A賞(ation)もらえないぞ！」",
  "お手本: dict(ジクト)/ion(イオン)/ary(アリー)、意味「辞書」 → 「軸(dict)にイオン(ion)がぶつかり電気あり(ary)、大慌てだ！」",
].join("\n");

/* 「意味を連想できる情景にする」だけでは、読みの断片化に気を取られて
   意味と無関係な場面になりがちだったため、意味を表す言葉そのものを
   本文にそのまま含めるよう明示する。単語ごとの具体的な意味は、この
   定数の外側（1語ずつの経路ならプロンプト冒頭、まとめ経路なら
   単語ごとのブロック）で既に示されているため、ここでは特定の単語の
   意味を書き写さず「上記で示した意味」とだけ参照する（1語ずつ/
   まとめ両方の経路から同じ文面で共有するため） */
const GORO_RULE_MEANING_ALIGN = "一文の中に、単語全体の意味（上記で示した日本語）を表す言葉そのものを、読みの断片とは別にそのまま含めてください。単語に複数の意味がある場合は、全てを1文に詰め込もうとせず、自然に組み込める意味を1つだけ選んでください。読みの音を成立させるためだけのこじつけの情景にはせず、音と意味の両方をこの一文だけで思い出せるようにしてください。";

/* wordMeaningを「・」「/」区切りで複数の意味に分ける。区切りが無ければ
   全体を1つの意味として扱う（demo_words.csvの意味欄はこの書式で複数の
   意味を持たせている。例:「混乱・障害」「試写・下見」） */
function splitWordMeanings(wordMeaning) {
  return String(wordMeaning || "").split(/[・/]/).map((s) => s.trim()).filter(Boolean);
}

/* 複数の意味を持つ単語を作り直す(avoidTexts有り)場合、既に使われた意味を
   避けて別の意味を選ぶよう促す。「複数の意味がある場合は無理がなければ
   複数の文章に分けて含める」という狙いを、作り直しのたびに違う意味へ
   誘導することで実現する（1回の一文に全部詰め込ませるのは不自然になる
   ため避ける）。1つ目の生成(avoidTextsが空)や意味が1つしか無い場合、
   全ての意味が既に出尽くしている場合は何もしない */
function goroUnusedMeaningHint(wordMeaning, avoidTexts) {
  const senses = splitWordMeanings(wordMeaning);
  if (senses.length < 2 || !avoidTexts || !avoidTexts.length) return "";
  const usedSenses = senses.filter((s) => avoidTexts.some((t) => stripGoroAnnotations(t).includes(s)));
  const unusedSenses = senses.filter((s) => !usedSenses.includes(s));
  if (!usedSenses.length || !unusedSenses.length) return "";
  return `この単語の複数の意味のうち「${usedSenses.join("」「")}」は既に登場済みです。今回は「${unusedSenses.join("」「")}」側の意味を含めることを優先してください（自然に書けない場合は無理に含めなくて構いません）。`;
}

const GORO_RULE_BAD_PATTERNS = [
  "次のパターンは日本語として不自然になるため禁止します。いずれも「読みをカタカナの塊のまま置く」ことが原因なので、上の断片化の指示を徹底すれば避けられます。",
  "✗ 意味の日本語訳をカッコ書きで注釈する:「セイシェイション（飽食）して」「エーター（刑務所）へ」 → ○ カッコに入れるのは接辞の綴りだけ。意味は情景そのもので伝える。",
  "✗ 隣り合う接辞の読みをそのまま連結し、対象単語や既存の外来語をなぞる:「インター」+「アクト」→「インターアクト」 → ○ 読みは互いに離し、それぞれ別の日本語表現の一部にする。",
  "✗ 読みをそのまま実在しない一単語として使い、助詞を付けて主語・修飾語にする:「オクシールは」「イアリーな」「オノミが」 → ○ 読みの音は、実在する日本語の言葉の一部分の音として溶け込ませる。",
  "✗ 読みを人名・人物のように扱う。「〜さん」「〜くん」といった呼び方だけでなく、読みそのままのカタカナ語を主語にして話す・教える・歩くなど人間的な動作をさせることも含む:「オノミが分類法を教えた」 → ○ 人物を出す場合は名前ではなく役割・属性（店員、少年、先生 など）の実在する言葉で表現する。",
  "✗ 音を似せるためだけの不自然なカタカナ語（外来語）で無理やり埋める → ○ 読み以外はふつうの日本語（和語・漢語）で自然に構成する。",
  "✗ カタカナ語に「する」を付けて動詞にする:「マッシュしたら」「ジクトして」 → ○ 「マッシュポテトを潰す」のように、実在する日本語の動詞で動作を表す。実在の外来語（テストする、セットする など）以外は、カタカナを動詞にしない。",
  "✗ 意味のつながらない出来事を「〜したら、〜」で並べる:「キャラがマッシュしたら、すぐに隠し箱へ潜り込む」（何が起きたのか読み手に伝わらない） → ○ 描くのは一つの出来事だけにし、原因と結果が自然につながった一場面にする。",
].join("\n");

const GORO_RULE_FINAL = [
  "最優先事項として、日本語として文法的に自然で、一つの筋が通った情景・出来事を描写する一文にしてください。意味のつながらない不自然な文は不可とします。誰が読んでも情景がすっと思い浮かぶ、破綻のない一文にしてください。",
  /* 「音は合っているが何を言っているのか分からない」候補を防ぐ最終確認。
  抽象的に「自然に」と言うより、読み手がその場面を絵にできるか、
  という具体的な合格条件に落とした方が守られやすい */
  "出力する前に必ず自分で読み返し、この一文だけを読んだ人が『誰が・何をして・どうなったのか』を映像として思い浮かべられるか確認してください。思い浮かべられないなら、音を大胆に崩してでも、日常にありふれた分かりやすい出来事に書き直してください（崩すのは自由ですが、接辞を省略してはいけません）。",
  "描くのは一つの出来事だけにしてください。関係のない場面を「〜したら、〜」「〜して、〜」でつなげて複数並べないでください。",
  "接辞の注釈を除いて10〜18文字程度、長くても22文字までに収めてください。短ければ短いほど覚えやすいので、意味が通る限り短くしてください。",
  "【重要】書き終えたら、無くても意味が通る語を全て削ってください。特に、情景に何も足していない締めの呼びかけ（「みんな！」「さあ！」「なんてね」など）や、飾りだけの修飾語は不要です（✗「コードが燃えるぜ、みんな！」→ ○「コードが燃えるぜ！」）。",
  /* ユーモアと文体。「面白く」とだけ言うと、どれも
  「〜して、〜した」の淡々とした説明文になりがちなので、
  具体的な笑いの作り方と、使ってよい文末の型を並べて示す */
  "【重要】覚えやすさは面白さから生まれます。読んだ人が思わずニヤリとする一文にしてください。大げさな誇張、ばかばかしい取り合わせ、身も蓋もない本音、ずっこけるオチ、あるあるネタなどを積極的に使ってください。擬音語・擬態語（ドカン、ジンジン、ぐらぐら など）も歓迎です。下品・差別的な表現は避けてください。",
  "【重要】文体を毎回変えてください。「〜して、〜した」という淡々とした説明調ばかりにならないよう、次のような型から、その単語に合うものを選んでください: 呼びかけ・警告（「〜せんと〜ないぞ！」）、感嘆（「〜だ！」）、疑問・ツッコミ（「〜なのか!?」）、ぼやき（「〜、あーあ」）、伝聞（「〜だってさ」）、体言止め、セリフ調。",
].join("\n");

const GORO_RULE_SELF_CHECK = "出力前に最後の確認: (1)全ての接辞の綴りが1回ずつカッコで登場しているか (2)注釈を除いた本文が22文字以内か (3)読んだ人が情景を思い浮かべられるか (4)説明調になっていないか (5)削れる語が残っていないか。";

/* 動的Few-shotの例示と、機械チェックで不合格になった候補のフィードバック。
   1語ずつの経路とまとめ経路で同じ見せ方をする */
const GORO_EXAMPLE_BLOCK = (examples) => `参考として、意味が近い単語で過去に作れた語呂合わせの例を示します。読みを断片化して自然な日本語に溶け込ませる「作り方」、接辞の綴りをカッコで添える書式、面白さと文体の付け方を参考にしてください。ただし言い回しや情景はこの単語向けに必ず変えてください（例の使い回し・丸写しは不可）:\n${examples.map((e) => `- ${e.word}（${e.meaning}）→「${e.goroText}」`).join("\n")}`;

const GORO_REJECTED_BLOCK = (rejectedNotes) => `【重要】直前の試行で作った次の候補は、機械的なチェックで不合格になりました。指摘された点を必ず直し、同じ失敗を繰り返さないでください:\n${rejectedNotes.map((n, i) => `${i + 1}. 「${n.text}」\n   → 不合格の理由: ${n.reasons.join(" / ")}`).join("\n")}`;

function goroSystemPrompt(word, morphemes, wordMeaning, avoidTexts, rejectedNotes, examples) {
  const partList = morphemes.map((m) => `${m.part}(${m.reading})`).join(" / ");
  return [
    "あなたは日本語の語呂合わせ作家です。",
    `対象の英単語は "${word}"。接辞とカタカナ読みは次の通りです: ${partList}`,
    wordMeaning ? `この単語全体の意味は「${wordMeaning}」です。` : "",

    /* ①動的Few-shot。過去の語呂合わせ例から無作為に抽出して見せる。
       丸写しされると新しいマンネリの元になるため、型だけ参考にして
       言い回しは変えるよう明示する */
    (examples && examples.length)
      ? GORO_EXAMPLE_BLOCK(examples)
      : "",

    GORO_RULE_MATERIAL,

    wordMeaning ? GORO_RULE_MEANING_ALIGN : "",
    wordMeaning ? goroUnusedMeaningHint(wordMeaning, avoidTexts) : "",

    GORO_RULE_BAD_PATTERNS,

    (avoidTexts && avoidTexts.length)
      ? `この単語では既に次の語呂合わせ候補が使われましたが、ユーザーが気に入らず作り直しを求めています。同じような言い回し・情景・オチの焼き直しは不可です。読みの活かし方・情景・オチの方向性を意図的に変え、明確に異なる新しい一文を考えてください:\n${avoidTexts.map((t, i) => `${i + 1}. ${t}`).join("\n")}`
      : "",

    GORO_RULE_FINAL,

    (rejectedNotes && rejectedNotes.length)
      ? GORO_REJECTED_BLOCK(rejectedNotes)
      : "",
    "候補を1件作ってください。文法的に自然で意味の通った一文になるよう、時間をかけてよく考えてから出力してください。意味のつながらない不自然な候補は不可とします。",
    GORO_RULE_SELF_CHECK,
    "候補を1件、次のJSON形式のみを返してください。それ以外の文章は書かないでください。",
    '{"candidates":[{"text":"軸(dict)にイオン(ion)がぶつかり電気あり(ary)、大慌てだ！","highlight":[{"part":"dict","in_text":"軸"}]}]}',
  ].filter(Boolean).join("\n");
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
  groq: {
    label: "Groq",
    modelsUrl: "https://api.groq.com/openai/v1/models",
    /* 語呂合わせは「読みの音を含む実在の日本語を探す」制約充足タスクで、
       推論を有効にした方が不自然な造語が出にくい。ただしモデルによっては
       推論系のパラメータを受け付けず400を返すため、その場合はまとめて
       外して一度だけ再試行し、機能自体が止まらないようにする */
    reasoning: true,
    async chat(apiKey, systemPrompt, userPrompt, temperature) {
      const body = {
        model: "qwen/qwen3.6-27b",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature,
      };
      if (this.reasoning) {
        body.reasoning_effort = "default";
        /* 推論の途中経過が本文に混ざるとJSONとして壊れるため、最終回答
           だけを返させる。JSONモードでは raw を指定できない */
        body.reasoning_format = "hidden";
      }
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const detail = await extractErrorDetail(res);
        if (res.status === 400 && this.reasoning && /reasoning/i.test(detail)) {
          console.warn("Groq rejected the reasoning parameters, retrying without them:", detail);
          this.reasoning = false;
          return this.chat(apiKey, systemPrompt, userPrompt, temperature);
        }
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
    modelsUrl: "https://api.ai.sakura.ad.jp/v1/models",
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

/* 設定できる生成AIはさくらのAIのみ。以前Groqを選んでいた端末が
   古い保存値を引きずらないよう、ここで読み替える */
async function getActiveProvider() {
  const provider = await kvGet("provider", "sakura");
  return provider === "groq" ? "sakura" : provider;
}

/* ------------------------------------------------------------------ *
 * 3.4 Gemini（写真から単語を読み取る専用。分解・語呂合わせの
 *     プロバイダ選択には出てこない、独立した機能のためのAPIキー）
 *    無料枠の使いやすさと画像認識（手書き含む）の精度・速度のバランスで
 *    Geminiを採用。OpenAI互換ではないため、AI_ADAPTERSとは別に持つ。
 * ------------------------------------------------------------------ */
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

async function verifyGeminiApiKey(apiKey) {
  const res = await fetch(`${GEMINI_API_BASE}/models?pageSize=1`, {
    headers: { "x-goog-api-key": apiKey },
  });
  if (res.status === 401 || res.status === 403 || res.status === 400) {
    throw new Error("APIキーが受け付けられませんでした");
  }
  if (!res.ok) {
    const detail = await extractErrorDetail(res);
    throw new Error(`Gemini API エラー (${res.status})${detail ? `: ${detail}` : ""}`);
  }
}

/* 画像(dataURL)を渡すと、写っている英単語をJSON配列で返す。
   手書き・活字どちらのノートでも読める前提のプロンプトにしてある */
async function recognizeWordsFromImage(dataUrl, apiKey) {
  const [, mimeType, base64] = dataUrl.match(/^data:([^;]+);base64,(.*)$/s) || [];
  if (!base64) throw new Error("画像の読み込みに失敗しました");

  const sys = [
    "あなたはノートや単語帳の写真から英単語を読み取るアシスタントです。",
    "画像に写っている英単語をできる限りすべて読み取ってください。手書き文字も含みます。",
    "各単語はスペルミスを補正せず、写っている綴りのまま出力してください。ただし大文字は小文字に統一してください。",
    "日本語の意味・訳注・記号・数字・見出しなど、英単語以外のものは含めないでください。",
    "英単語が1つも見つからない場合は空配列を返してください。",
    "出力は次のJSON形式のみを返し、それ以外の文章は一切書かないでください。",
    '{"words":["abandon","bereavement"]}',
  ].join("\n");

  const res = await fetch(`${GEMINI_API_BASE}/models/${GEMINI_MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: sys },
          { inline_data: { mime_type: mimeType, data: base64 } },
        ],
      }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
    }),
  });
  if (!res.ok) {
    const detail = await extractErrorDetail(res);
    throw new Error(`Gemini API エラー (${res.status})${detail ? `: ${detail}` : ""}`);
  }
  const json = await res.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  let words = [];
  try { words = JSON.parse(text).words || []; } catch { words = []; }
  return words.filter((w) => typeof w === "string");
}

/* カメラ写真は数MBになりがちで、そのまま送るとAPIが重く遅くなるため、
   長辺を縮小してJPEG圧縮してからdataURLにする（文字が読み取れる範囲で
   十分な解像度に抑える） */
function compressImageForRecognition(file, maxDim = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("画像の読み込みに失敗しました")); };
    img.src = url;
  });
}

/* 疎通確認は生成を伴わない /v1/models で行う。生成させて確かめると、
   キーが正しくてもモデルの出力揺れ (JSON検証エラーなど) で失敗し、
   キーの問題だと誤認させてしまうため */
async function verifyApiKey(provider, apiKey) {
  const adapter = AI_ADAPTERS[provider];
  if (!adapter) throw new Error("未対応のプロバイダです");
  const res = await fetch(adapter.modelsUrl, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (res.status === 401 || res.status === 403) throw new Error("APIキーが受け付けられませんでした");
  if (!res.ok) {
    const detail = await extractErrorDetail(res);
    throw new Error(`${adapter.label} API エラー (${res.status})${detail ? `: ${detail}` : ""}`);
  }
}

/* ------------------------------------------------------------------ *
 * 3.5 Embeddings（さくらのAI /v1/embeddings, multilingual-e5-large）
 *    語呂合わせの動的Few-shot・意味整合チェック・マンネリ検出・
 *    接辞の表記ゆれ統合で共通に使う。埋め込み専用なのでプロバイダは
 *    さくらのAIのみ対応。呼び出し元は必ずtry/catchし、失敗時は
 *    その機能だけを静かにスキップして本筋の生成は止めないこと
 *    （TTSと同様、APIキーによって機能が有効化されていない場合がある）。
 * ------------------------------------------------------------------ */
const EMBEDDING_ENDPOINTS = {
  sakura: {
    url: "https://api.ai.sakura.ad.jp/v1/embeddings",
    model: "multilingual-e5-large",
  },
};

/* E5系モデルは、検索側(query)と索引側(passage)で接頭辞を分けないと
   精度が落ちる。ここでの「意味」同士の比較は非対称な検索ではないが、
   校正時と実行時で同じ組み合わせを使う限り一貫していれば問題ないため、
   用途ごとに固定の接頭辞を使う */
function e5Prefix(kind) {
  return kind === "query" ? "query: " : "passage: ";
}

async function embedTexts(texts, apiKey, kind = "passage") {
  const cfg = EMBEDDING_ENDPOINTS.sakura;
  if (!apiKey) throw new Error("APIキーが設定されていません");
  const input = texts.map((t) => e5Prefix(kind) + String(t || ""));
  const res = await fetch(cfg.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: cfg.model, input }),
  });
  if (!res.ok) {
    const detail = await extractErrorDetail(res);
    throw new Error(`embeddings API エラー (${res.status})${detail ? `: ${detail}` : ""}`);
  }
  const json = await res.json();
  const rows = Array.isArray(json.data) ? json.data.slice() : [];
  rows.sort((a, b) => (a.index || 0) - (b.index || 0));
  const vectors = rows.map((d) => d.embedding);
  if (vectors.length !== texts.length || vectors.some((v) => !Array.isArray(v))) {
    throw new Error("embeddings API の応答が不正です");
  }
  return vectors;
}

/* embeddings（/v1/embeddings）はさくらのAIの無料枠に含まれず、有効にすると
   別途課金が発生しうるため、既定はオフ。設定画面のトグルで明示的に
   オンにした場合のみ、RAG関連のembedding呼び出しを行う */
async function isRagEnabled() {
  return !!(await kvGet("rag_enabled", false));
}

function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom ? dot / denom : 0;
}

const RETRYABLE_STATUS = [429, 500, 502, 503, 504];
const RETRY_DELAYS_MS = [1000, 2000, 4000];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function statusFromError(err) {
  const match = /\((\d+)\)/.exec(err.message || "");
  return match ? Number(match[1]) : null;
}

/* JSONモードでは、モデルがJSONとして壊れた出力をした回だけ400が返る。
   恒久的な不正リクエストではなく引き直せば直ることが多いので、
   400でも例外的に再試行の対象にする */
function isJsonValidationFailure(err) {
  return /failed to validate json|json_validate_failed/i.test(err.message || "");
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
      const retryable = RETRYABLE_STATUS.includes(status) || isJsonValidationFailure(err);
      const canRetry = retryable && attempt < RETRY_DELAYS_MS.length;
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

/* 辞書未収録の語根（AI推定）は、呼ぶたびに meaning の言い回しが
   微妙にブレる（例:「見る」/「見ること」）。同じpartについて過去に
   embeddingしたmeaningと今回のmeaningを比較し、意味的に十分近ければ
   前回の表記に統一する。初出のpartはそのまま正としてaffixesストアに
   保存する（provider/apiKeyがない、またはembeddings呼び出しに失敗した
   場合はAIの出力をそのまま使い、この統合をスキップするだけで
   処理は止めない） */
const AFFIX_NOTE_SIM_THRESHOLD = 0.88;

async function reconcileUnknownAffix(part, aiEntry, apiKey) {
  const [meaningVec] = await embedTexts([aiEntry.meaning], apiKey, "passage");
  const existing = await idbGet("affixes", part);
  if (existing && Array.isArray(existing.vector) && cosineSim(meaningVec, existing.vector) >= AFFIX_NOTE_SIM_THRESHOLD) {
    return { part: aiEntry.part, reading: existing.reading, meaning: existing.meaning, origin: existing.origin, phonetic: existing.phonetic || aiEntry.phonetic };
  }
  await idbPut("affixes", {
    part, reading: aiEntry.reading, meaning: aiEntry.meaning, origin: aiEntry.origin, phonetic: aiEntry.phonetic,
    vector: meaningVec, updatedAt: Date.now(),
  });
  return aiEntry;
}

async function reconcileWithLocalDict(morphemes, provider, apiKey) {
  const ragOn = (provider === "sakura" && apiKey) ? await isRagEnabled() : false;
  const out = [];
  for (const m of (morphemes || [])) {
    const key = (m.part || "").toLowerCase();
    const local = LOCAL_AFFIX_DICT[key];
    if (local) {
      out.push({ part: m.part, reading: local.reading, meaning: local.meaning, origin: local.origin, phonetic: local.phonetic || "" });
      continue;
    }
    const aiEntry = {
      part: m.part,
      reading: m.reading || m.part,
      meaning: m.meaning || MEANING_UNAVAILABLE,
      origin: m.origin || "—",
      phonetic: m.phonetic || "",
    };
    if (ragOn && key && aiEntry.meaning !== MEANING_UNAVAILABLE) {
      try {
        out.push(await reconcileUnknownAffix(key, aiEntry, apiKey));
        continue;
      } catch (err) {
        console.warn(`未知接辞 "${key}" の表記統合に失敗しました（スキップします）:`, err);
      }
    }
    out.push(aiEntry);
  }
  return out;
}

async function fallbackDecompose(word) {
  // ローカル辞書のみによるルールベース分割（API失敗時の最終手段）
  const w = word.toLowerCase();
  const byLongest = (dict) => Object.keys(dict).sort((a, b) => b.length - a.length);
  const prefix = byLongest(AFFIX_PREFIXES).find((k) => w.startsWith(k) && k.length < w.length);
  const suffix = byLongest(AFFIX_SUFFIXES).find((k) => w.endsWith(k) && k.length < w.length && k !== prefix);
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

function sanitizeWordList(list, excludeWord) {
  const excludeLower = (excludeWord || "").toLowerCase();
  const seen = new Set();
  return (Array.isArray(list) ? list : [])
    .map((w) => (typeof w === "string" ? w.trim() : ""))
    .filter((w) => /^[A-Za-z][A-Za-z'-]*$/.test(w))
    .filter((w) => {
      const lower = w.toLowerCase();
      if (lower === excludeLower || seen.has(lower)) return false;
      seen.add(lower);
      return true;
    })
    .slice(0, 5);
}

async function decomposeWord(word, provider, apiKey) {
  try {
    const sys = decomposeSystemPrompt(word);
    const json = await callAI(provider, apiKey, sys, `単語: ${word}`, 0.2);
    if (json.word_exists === false) {
      return { correctedWord: word, wasCorrected: false, wordExists: false, meaning: "", phonetic: "", memoryTip: "", synonyms: [], antonyms: [], morphemes: [] };
    }
    let morphemes = await reconcileWithLocalDict(json.morphemes, provider, apiKey);
    if (!morphemes.length) throw new Error("empty");
    let wordMeaning = json.word_meaning || "";
    let wordPhonetic = json.word_phonetic || "";
    let memoryTip = (json.memory_tip || "").slice(0, 100);

    if (!wordMeaning || !wordPhonetic || !memoryTip || morphemes.some((m) => m.meaning === MEANING_UNAVAILABLE)) {
      try {
        const retryPrompt = `単語: ${word}\n前回の応答ではword_meaning/word_phonetic/memory_tipや一部の接辞のreading/meaning/originが空でした。今回はすべての項目を必ず埋めてください。`;
        const retryJson = await callAI(provider, apiKey, sys, retryPrompt, 0.2);
        const retryMorphemes = await reconcileWithLocalDict(retryJson.morphemes, provider, apiKey);
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
    const synonyms = sanitizeWordList(json.synonyms, correctedWord);
    const antonyms = sanitizeWordList(json.antonyms, correctedWord).filter((w) => !synonyms.some((s) => s.toLowerCase() === w.toLowerCase()));

    morphemes = await validateDecomposition(correctedWord, morphemes, provider, apiKey, memoryTip);

    return { correctedWord, wasCorrected, wordExists: true, meaning: wordMeaning, phonetic: wordPhonetic, memoryTip, synonyms, antonyms, morphemes };
  } catch (err) {
    console.warn("Stage1 failed, falling back to local dictionary:", err);
    return { correctedWord: word, wasCorrected: false, wordExists: true, meaning: "", phonetic: "", memoryTip: "", synonyms: [], antonyms: [], morphemes: await fallbackDecompose(word) };
  }
}

/* 分割不足の検出。プロンプトに「一致しなくなるまで再帰的に切り出せ」と
   書くだけではAIが途中で分割をやめてしまうことが多いため、疑わしい箇所を
   コード側で特定し、校閲パスに具体的な指摘として渡す */
const UNDER_SPLIT_MIN_REST = 3;

/* 語根として残された要素が、まだ既知の接頭辞で始まる・接尾辞で終わる場合は、
   切り出しそびれの可能性が高い（例: bereave に接頭辞 be が残っている）。
   残りが短すぎる場合は、分割しても無意味な断片になるだけなので対象外 */
function findLeftoverAffixes(morphemes) {
  return morphemes.flatMap((m) => {
    const part = (m.part || "").toLowerCase();
    if (LOCAL_AFFIX_DICT[part]) return [];
    const fits = (dict) => Object.keys(dict).filter((k) => part.length - k.length >= UNDER_SPLIT_MIN_REST);
    const heads = fits(AFFIX_PREFIXES).filter((k) => part.startsWith(k));
    const tails = fits(AFFIX_SUFFIXES).filter((k) => part.endsWith(k));
    if (!heads.length && !tails.length) return [];
    const where = [
      heads.length ? `先頭が接頭辞 ${heads.join("/")} と一致` : "",
      tails.length ? `末尾が接尾辞 ${tails.join("/")} と一致` : "",
    ].filter(Boolean).join("、");
    return [`"${m.part}" は${where}しており、さらに分割できる可能性があります。`];
  });
}

/* memory_tipは「in(中へ)+vestig(足跡を)+ation(たどること)で、…」の形で返る。
   ここから分割を取り出す。連結して対象単語に一致する場合に限り、
   AI自身が語った信頼できる分割として扱う（一致しなければ、単語の一部だけを
   説明しているか別語に言及しているので採用しない） */
function memoryTipSegments(word, memoryTip) {
  const segments = [...String(memoryTip || "").matchAll(/([A-Za-z]+)\s*-?\s*[(（]/g)].map((m) => m[1].toLowerCase());
  if (segments.length < 2) return null;
  if (segments.join("") !== String(word || "").toLowerCase()) return null;
  return segments;
}

/* memory_tipで説明されている分割が実際のmorphemesより細かい場合、AI自身が
   自分の分割結果と矛盾したことを言っている（＝分割不足の確かな証拠）。
   この場合はmemory_tip側が正しい分割として確定しているので、単なる指摘では
   なく「必ずこう分割せよ」という強制の材料として使う */
function requiredSegmentation(word, morphemes, memoryTip) {
  const segments = memoryTipSegments(word, memoryTip);
  if (!segments || segments.length <= morphemes.length) return null;
  return segments;
}

function findMemoryTipContradiction(word, morphemes, memoryTip) {
  const segments = requiredSegmentation(word, morphemes, memoryTip);
  if (!segments) return [];
  return [`memory_tipでは "${segments.join(" + ")}" と${segments.length}分割で説明しているのに、morphemesは${morphemes.length}分割になっており矛盾しています。`];
}

function sameSegmentation(morphemes, segments) {
  if (!segments || morphemes.length !== segments.length) return false;
  return morphemes.every((m, i) => (m.part || "").toLowerCase() === segments[i]);
}

function findUnderSplitHints(word, morphemes, memoryTip) {
  return [
    ...findMemoryTipContradiction(word, morphemes, memoryTip),
    ...findLeftoverAffixes(morphemes),
  ].slice(0, 4);
}

/* 分解の校閲基準と指摘の文面。1語ずつ校閲する decomposeValidationPrompt と、
   複数語をまとめて校閲する batchDecomposeValidationUserPrompt が共有する */
const DECOMPOSE_VALIDATION_CRITERIA = [
  "①各要素を順番に連結すると、対象の英単語と文字列として完全に一致すること（文字の欠落・重複・誤字がないこと）。",
  "②各要素への切り方が、言語学的・語源的に見て妥当な形態素分割になっていること（実在しない、あるいは明らかに誤った分割になっていないこと）。",
  "③各要素の意味（meaning）・由来（origin）・カタカナ読み（reading）・発音記号（phonetic）が、その要素について事実として正確であること（誤りや当てずっぽうの記載がないこと）。",
  "④分割し切れていない箇所がないこと。語根として残した要素の先頭・末尾が、さらに教科書的に広く認められている接頭辞・接尾辞と一致する場合は、一致するものがなくなるまで分割し直してください（例: bereavement を bereave / ment で止めず、be / reave / ment まで分ける）。単に語根が長い・見慣れないというだけで分割を諦めないでください。ただし、分割すると1〜2文字の無意味な断片が生じる場合や、語源的な根拠がない場合は、分割せずそのままにしてください。",
].join("\n");

const DECOMPOSE_HINT_BLOCK = (hints) => `次の点は分割不足の疑いが強いので、④として特に重点的に確認してください。\n${hints.map((h) => `- ${h}`).join("\n")}`;

const DECOMPOSE_REQUIRED_BLOCK = (requiredParts) => `【必須】この単語の分割は ${requiredParts.join(" / ")} で確定しています。morphemesは必ずこの${requiredParts.length}要素、この順序で出力してください。要素を統合したり、これ以外の分割にしたりしてはいけません。あなたの仕事は、この分割を前提に各要素のreading・meaning・origin・phoneticを正確に埋めることです。`;

function decomposeValidationPrompt(word, morphemes, hints, requiredParts) {
  const partsList = morphemes
    .map((m, i) => `${i + 1}. ${m.part} - 読み:${m.reading} / 意味:${m.meaning} / 由来:${m.origin} / 発音記号:${m.phonetic}`)
    .join("\n");
  return [
    "あなたは英語の語源・形態素解析の専門家であり、厳格な校閲者です。",
    `対象の英単語は "${word}"。以下は、この単語を接頭辞・語根・接尾辞（接辞）に分割した結果です。`,
    partsList,
    "各要素について、次の点を厳しく確認してください。",
    DECOMPOSE_VALIDATION_CRITERIA,
    hints && hints.length
      ? DECOMPOSE_HINT_BLOCK(hints)
      : "",
    /* memory_tipから正しい分割が確定している場合は、指摘ではなく命令として
       渡す。「疑いがある」程度の書き方だとAIが「問題なし」と判断して
       分割不足のまま素通りさせてしまうため */
    (requiredParts && requiredParts.length)
      ? DECOMPOSE_REQUIRED_BLOCK(requiredParts)
      : "",
    "いずれかに誤りが見つかった場合は、正しい分割・正しい情報にすべて書き直してください。問題がなければそのまま使ってください。",
    "出力は、書き直した場合も含め、必ず全要素を次のJSON形式のみで返してください。それ以外の文章は一切書かないでください。",
    '{"morphemes":[{"part":"in","reading":"イン","meaning":"中へ","origin":"ラテン語 in-","phonetic":"ɪn"}]}',
  ].filter(Boolean).join("\n");
}

/* 確定した分割を前提に、各要素の情報だけを埋めさせる最終手段。
   校閲パスに分割を命じてもなお統合された形で返してくる場合に使う。
   「分割し直す」より「決まった要素の項目を埋める」ほうが遥かに易しい
   タスクなので、ここまで来ればほぼ確実に通る */
async function fillRequiredSegmentation(word, requiredParts, memoryTip, provider, apiKey) {
  const sys = [
    "あなたは英語の語源・形態素解析の専門家です。",
    `英単語 "${word}" は ${requiredParts.join(" / ")} の${requiredParts.length}要素に分割することが既に確定しています。`,
    memoryTip ? `参考: この単語の覚え方は「${memoryTip}」です。` : "",
    "この分割は変更できません。要素を統合したり、分割し直したり、順序を変えたりしないでください。",
    "各要素について、カタカナ読み（reading）・日本語での意味（meaning）・由来（origin、簡潔に）・その要素単体の発音記号（phonetic、IPA表記、スラッシュや括弧は付けない）を埋めてください。",
    "語根が一般に馴染みのないものでも、meaningとoriginを空にせず、最も可能性の高い語源を推定して記入してください。",
    `partには ${requiredParts.join(" / ")} をこの順序でそのまま入れてください。`,
    "出力は次のJSON形式のみを返し、それ以外の文章は一切書かないでください。",
    '{"morphemes":[{"part":"in","reading":"イン","meaning":"中へ","origin":"ラテン語 in-","phonetic":"ɪn"}]}',
  ].filter(Boolean).join("\n");
  const json = await callAI(provider, apiKey, sys, "確定した分割のまま、各要素の情報を埋めてJSON形式で出力してください。", 0.2);
  return reconcileWithLocalDict(json.morphemes, provider, apiKey);
}

async function validateDecomposition(word, morphemes, provider, apiKey, memoryTip) {
  if (!morphemes.length) return morphemes;
  /* memory_tipから正しい分割が確定できる場合、校閲パスの結果が
     それに従っているかどうかまで検証する。検出しても強制しなければ、
     AIが「問題なし」と判断した時点で分割不足がそのまま通ってしまう */
  const requiredParts = requiredSegmentation(word, morphemes, memoryTip);
  const accept = (revised) => {
    if (!revised.length) return false;
    if (revised.map((m) => m.part).join("").toLowerCase() !== word.toLowerCase()) return false;
    return requiredParts ? sameSegmentation(revised, requiredParts) : true;
  };

  try {
    const sys = decomposeValidationPrompt(word, morphemes, findUnderSplitHints(word, morphemes, memoryTip), requiredParts);
    const json = await callAI(provider, apiKey, sys, "各接辞を精査し、必要なら修正して、全要素をJSON形式で出力してください。", 0.2);
    const revised = await reconcileWithLocalDict(json.morphemes, provider, apiKey);
    if (accept(revised)) return revised;

    if (requiredParts) {
      console.warn(`校閲パスが確定分割 ${requiredParts.join("/")} に従わなかったため、項目のみを埋め直します`);
      const filled = await fillRequiredSegmentation(word, requiredParts, memoryTip, provider, apiKey);
      if (accept(filled)) return filled;
      console.warn("確定分割の適用に失敗しました。元の分割を使います");
    }
    return morphemes;
  } catch (err) {
    console.warn("Decomposition validation pass failed, using original morphemes:", err);
    return morphemes;
  }
}

/* ------------------------------------------------------------------ *
 * 4.5 語呂合わせの機械的な品質チェック
 *   プロンプトに禁止事項として書くだけではAIが守りきれない不良パターンの
 *   うち、コード側で確定的に判定できるものをここで検出する。検出された
 *   候補はそのまま採用せず、不合格の理由をAIに伝えて作り直させる
 *   （goroSystemPrompt の rejectedNotes / generateGoro の再生成ループ）。
 * ------------------------------------------------------------------ */

/* 接辞の読みと一致しうるカタカナ語のうち、日本語として実在し、そのまま
   一単語として文中で使っても自然なもの。これらは造語判定の対象外とする。
   （例: tax(タックス) を「タックスを払う」と使うのは正しい語呂合わせ） */
const GORO_REAL_KATAKANA_WORDS = new Set([
  "イオン", "タックス", "ビール", "ポスト", "トランス", "ポート", "サブ", "インター",
  "テスト", "ミット", "アウト", "セット", "カード", "コース", "ライト", "レース",
  "ボール", "ドア", "ガス", "パス", "ペース", "メーター", "モーター", "センター",
  "オーバー", "ケース", "コート", "サイン", "スープ", "チーム", "データ", "ネット",
  "パート", "ページ", "ベース", "ホール", "マーク", "ルート", "レベル", "ワイン",
  /* 「カタカナ＋する」が日本語として自然に成立する、ごく一般的な外来語。
     サ変動詞化チェック(④)の誤検出を防ぐために持つ */
  "ノック", "キャッチ", "チェック", "カット", "コピー", "メモ", "ジャンプ", "ダッシュ",
  "ノート", "スタート", "ゴール", "キック", "ヒット", "タッチ", "プレー", "ミス",
  "カバー", "リード", "ケア", "サポート", "アップ", "ダウン", "オープン", "クリア",
]);

const GORO_PARTICLE_CLASS = "[はがをのなにへでともや]";

/* カタカナ語をそのままサ変動詞にした形（「マッシュしたら」「ジクトして」）。
   実在の外来語以外でこれをやると日本語として意味をなさない */
const GORO_SURU_FORMS = "(する|すれ|します|した|して|しろ|しよう|しない|され|させ|せず)";

/* 語呂合わせの長さの上限。プロンプトでは22文字までを目安として指示している
   ので、そこから少しだけ余裕を持たせた値をコード側の不合格ラインとする
   （毎回きっちり22文字で弾くと再生成ばかりになり実用に耐えないため）。
   接辞の注釈「(pre)」は読み手への補助表示であって本文ではないため、
   長さを数えるときは取り除いてから数える */
const GORO_MAX_LENGTH = 26;

/* 「プリッ(pre)とせんと(sent)」のように、音を担っている箇所の直後に
   対応する接辞の綴りを添える書式。注釈は必ず半角英字のみとする */
const GORO_ANNOTATION_RE = /[（(]\s*([A-Za-z][A-Za-z'-]*)\s*[）)]/g;

function stripGoroAnnotations(text) {
  return String(text || "").replace(GORO_ANNOTATION_RE, "");
}

/* 語呂合わせ一文を機械的に検査し、不良箇所を返す。
   戻り値は {code, reason} の配列（空配列なら合格）。
   reason はそのまま再生成時のフィードバックとしてAIに渡す */
function goroViolations(text, morphemes) {
  const violations = [];
  if (!text) return violations;
  const readings = (morphemes || []).map((m) => (m.reading || "").trim()).filter(Boolean);
  const parts = (morphemes || []).map((m) => (m.part || "").trim().toLowerCase()).filter(Boolean);
  const partSet = new Set(parts);
  /* 注釈は表示上の補助なので、日本語として自然かどうかを見る検査は
     注釈を取り除いた本文に対して行う。生の文字列のまま調べると、
     「ベッド(bed)して」の (bed) が語と活用語尾の間に割り込むせいで
     サ変動詞化を見逃すなど、注釈の有無で判定が変わってしまう */
  const bare = stripGoroAnnotations(text);

  /* ①カッコの中身。接辞の綴りを添えるのは必須の書式なので許可し、
       意味の日本語訳を注釈しているもの（例:「エーター（刑務所）へ」）や、
       実際には存在しない接辞名を書いているものだけを弾く */
  for (const m of text.matchAll(/[（(]([^）)]{0,20})[）)]/g)) {
    const inner = m[1].trim();
    if (/^[A-Za-z][A-Za-z'-]*$/.test(inner) && partSet.has(inner.toLowerCase())) continue;
    violations.push({
      code: "gloss-in-parens",
      reason: `「（${inner}）」というカッコ書きは使えません。カッコの中に書いてよいのは、その直前の音が対応する接辞の綴り（${parts.join(" / ") || "対象の接辞"}）だけです。意味の日本語訳をカッコで注釈しないでください。`,
    });
  }

  /* ②全ての接辞の音が、過不足なくちょうど1回ずつ使われているか。
       不足だけを見ていた頃は、1形態素の語で「べ(bed)ッ(bed)ド(bed)」のように
       1音ごとに同じ注釈を振る出力が素通りしていた。接辞と注釈は1対1に
       対応させる（同じ接辞が語中に2回現れる語では、その回数だけ必要） */
  const expected = new Map();
  for (const p of parts) expected.set(p, (expected.get(p) || 0) + 1);
  const actual = new Map();
  for (const m of text.matchAll(GORO_ANNOTATION_RE)) {
    const k = m[1].toLowerCase();
    actual.set(k, (actual.get(k) || 0) + 1);
  }
  const missing = [...expected.keys()].filter((p) => (actual.get(p) || 0) < expected.get(p));
  if (missing.length) {
    violations.push({
      code: "missing-morpheme",
      reason: `接辞 ${missing.join(" / ")} の音が一文の中に見当たりません。全ての接辞について、その音を担う箇所を作り、直後に ${missing.map((p) => `(${p})`).join(" ")} のように綴りを添えてください。音は元の発音どおりでなくてよく、崩して構いません。`,
    });
  }
  const excess = [...expected.keys()].filter((p) => (actual.get(p) || 0) > expected.get(p));
  if (excess.length) {
    violations.push({
      code: "duplicate-morpheme",
      reason: `接辞 ${excess.map((p) => `(${p})`).join(" ")} の注釈を複数回付けています。1つの接辞に対して注釈は1箇所だけです。その接辞の音はひとまとまりの箇所で担わせ、1音ずつ区切って同じ注釈を繰り返さないでください（例:「べ(bed)ッ(bed)ド(bed)」は不可、「ベッド(bed)」とする）。`,
    });
  }

  /* ②隣り合う接辞の読みをそのまま連結（例: リーヴ+メント →「リーヴメント」）。
       対象単語自体をカタカナでなぞるだけの手抜きになる */
  for (let i = 0; i < readings.length - 1; i++) {
    const joined = readings[i] + readings[i + 1];
    if (joined.length >= 3 && bare.includes(joined)) {
      violations.push({
        code: "adjacent-readings",
        reason: `「${readings[i]}」と「${readings[i + 1]}」を隣接させて「${joined}」という実在しないカタカナ語を作っています。各接辞の読みは文中の離れた位置に、それぞれ別の実在する日本語の一部として組み込んでください。`,
      });
    }
  }

  /* ③読みをそのまま独立した一単語として使用（例:「オノミが」「オクシールは」）。
       カタカナの連続が読みとぴったり一致する場合、実在の外来語でない限り造語とみなす。
       ただし、それ以上分解できない1形態素の語（bed など）は、音を分散させる
       相手の接辞がそもそも無く、読みをそのまま使うのが唯一の自然な書き方に
       なる。ここで弾くと「ベッド(bed)」も「べ(bed)ッ(bed)ド(bed)」も不合格に
       なり、どう書いても合格できなくなるため、接辞が2つ以上ある語に限る */
  for (const run of readings.length >= 2 ? (bare.match(/[ァ-ヶー]+/g) || []) : []) {
    if (run.length < 3 || GORO_REAL_KATAKANA_WORDS.has(run)) continue;
    if (!readings.includes(run)) continue;
    const withParticle = new RegExp(run + GORO_PARTICLE_CLASS).test(bare);
    violations.push({
      code: withParticle ? "bare-reading-particle" : "bare-reading-word",
      reason: `「${run}」という読みを、そのまま実在しない一単語として文中に置いています${withParticle ? "（助詞を付けて主語や修飾語のように使っています）" : ""}。読みの音は、実在する日本語の言葉の一部分の音として溶け込ませてください。`,
    });
  }

  /* ④カタカナ語のサ変動詞化（例:「マッシュしたら」）。
       ③は読みと完全一致する場合しか捕まえられないため、読みを少し崩した
       カタカナ（読みが「マシュ」なのに「マッシュ」と書く等）をすり抜けて
       いた。動詞化は読みと一致するかに関わらず日本語として不自然なので、
       実在の外来語でないカタカナ語すべてを対象に判定する */
  for (const run of bare.match(/[ァ-ヶー]+/g) || []) {
    if (run.length < 3 || GORO_REAL_KATAKANA_WORDS.has(run)) continue;
    if (!new RegExp(run + GORO_SURU_FORMS).test(bare)) continue;
    violations.push({
      code: "katakana-suru-verb",
      reason: `「${run}」というカタカナ語に「する」を付けて動詞にしていますが、これは実在しない言い回しで意味が伝わりません。実在する日本語の動詞で動作を表してください。`,
    });
  }

  /* ⑤長すぎる候補。プロンプトの目安だけでは守られないことが多く、
       長い候補は説明的になって覚えにくいため、コード側でも足切りする。
       接辞の注釈は表示上の補助なので、長さには数えない */
  const visibleLength = bare.length;
  if (visibleLength > GORO_MAX_LENGTH) {
    violations.push({
      code: "too-long",
      reason: `接辞の注釈を除いて${visibleLength}文字と長すぎます。10〜18文字程度に収まるよう、描く出来事を一つに絞り、無くても意味が通る語（締めの呼びかけや飾りの修飾語）を削ってください。`,
    });
  }

  return violations;
}

/* 校閲パスの合否基準。対象の単語によらず同じ文面なので、1語ずつ校閲する
   goroValidationPrompt と、複数語をまとめて校閲する
   batchGoroValidationPrompt で共有する */
const GORO_VALIDATION_CRITERIA = (wordMeaning) => [
  "①自然さ: 日本語として文法的に自然で、一つの筋が通った意味のある文になっていること。読みを詰め込むための不自然な言い回しや、音を似せるためだけの不自然なカタカナ語（外来語）がないこと。",
  "②読みの扱い: 読みを丸ごとの単語・注釈として使っていないこと。具体的には (a)隣り合う接辞の読みをそのまま連結していない（例:「インターアクト」は不可）、(b)読みをそのまま実在しない一単語として助詞付きで使っていない（例:「オクシールは」「オノミが」は不可）、(c)カッコの中に接辞の綴り以外のもの、特に意味の日本語訳を書いていない（例:「エーター（刑務所）」は不可）。読みは1〜2音の断片に分解して実在する日本語表現の一部分の音として溶け込ませてあればよい。",
  "②-2 書式と音の網羅: 音を担っている箇所の直後に、対応する接辞の綴りが半角カッコで添えられていること（例:「プリッ(pre)とせんと(sent)A賞(ation)もらえないぞ！」）。全ての接辞がひとつ残らず、かつ1接辞につきちょうど1箇所だけ登場していること。ただし元の発音に忠実である必要はなく、pre(プレ)を「プリッ」、ation(エーション)を「A賞」のように大胆に崩してあってよい。接辞が抜け落ちている場合はその音を足し、同じ接辞の注釈が複数回付いている場合はひとまとまりに直すこと（✗「べ(bed)ッ(bed)ド(bed)」→ ○「ベッド(bed)」）。書き直す際もこのカッコの書式は必ず保つこと。",
  "③人名化していないこと: 「〜さん」「〜くん」といった明示的な呼び方だけでなく、読みそのままのカタカナ語を主語にして話す・教える・歩くなど人間的な動作をさせているパターンも不可。人物を出す場合は名前ではなく役割・属性（店員、少年、先生 など）で表現されていること。また、実在の外来語以外のカタカナ語に「する」を付けて動詞にしていないこと（例:「マッシュしたら」は不可）。",
  "④簡潔であること（接辞の注釈を除いて10〜18文字程度、長くても22文字までが目安）。無くても意味が通る語、特に情景に何も足していない締めの呼びかけ（「みんな！」「さあ！」など）や飾りだけの修飾語が残っていないこと。残っていれば削って短くすること。",
  "④-2 面白いこと: 読んだ人が思わずニヤリとする一文になっていること。淡々とした説明調（「〜して、〜した」）で終わっている場合は、誇張・ばかばかしい取り合わせ・ずっこけるオチ・ぼやき・呼びかけなどを使って、文体ごと書き直すこと。",
  "⑤読み手に伝わること: この一文だけを読んだ人が『誰が・何をして・どうなったのか』を映像として思い浮かべられること。関係のない出来事を「〜したら、〜」で並べただけの、何を言っているのか分からない文は不可（例:「キャラがマッシュしたら、すぐに隠し箱へ潜り込む」）。描かれている出来事は一つに絞られていること。",
  wordMeaning ? "⑥単語全体の意味（上記で示した日本語）を表す言葉そのものが、読みの断片とは別に一文の中にそのまま含まれていること（活用形・助詞の変化は可）。複数の意味がある場合は、そのうち自然に組み込める1つが含まれていれば十分で、全てを詰め込む必要はない。含まれていない場合は、無理のない範囲でその言葉を足して書き直すこと。" : "",
].filter(Boolean).join("\n");

function goroValidationPrompt(word, morphemes, candidates, wordMeaning) {
  const partList = morphemes.map((m) => `${m.part}(${m.reading})`).join(" / ");
  const candList = candidates.map((c, i) => `${i + 1}. ${c.text}`).join("\n");
  return [
    "あなたは日本語の語呂合わせの校閲者です。",
    `対象の英単語は "${word}"。接辞とカタカナ読みは次の通りです: ${partList}`,
    wordMeaning ? `単語全体の意味は「${wordMeaning}」です。` : "",
    "以下は語呂合わせ候補の一文です。各文について、次の基準をすべて満たしているか厳しく確認してください。",
    GORO_VALIDATION_CRITERIA(wordMeaning),
    "いずれかを満たしていない候補は書き直してください。その際、どの接辞の音も省略してはいけません（元の発音から大胆に崩すのは自由です）。すべて満たしている候補はそのまま使ってください。",
    candList,
    "書き直した場合も含め、必ず1件を出力してください。接辞の綴りを添えるカッコの書式は必ず保ってください。次のJSON形式のみを返し、それ以外の文章は一切書かないでください。",
    '{"candidates":[{"text":"軸(dict)にイオン(ion)がぶつかり電気あり(ary)、大慌てだ！"}]}',
  ].filter(Boolean).join("\n");
}

async function validateGoroCandidates(word, morphemes, candidates, provider, apiKey, wordMeaning) {
  try {
    const sys = goroValidationPrompt(word, morphemes, candidates, wordMeaning);
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

/* ------------------------------------------------------------------ *
 * 4.6 語呂合わせコーパス（①動的Few-shot / ②意味整合ゲート / ③マンネリ検出）
 *   DEMO_WORD_DATAの種データ＋ユーザーが保存した語呂を、意味のembedding
 *   とともにローカル(goro_corpusストア)に蓄積する。使うほど、その端末の
 *   ユーザーの作風に寄っていく。すべてローカルのみでクラウド同期はしない。
 * ------------------------------------------------------------------ */
/* 種データの本文を書き換えるたびに再シードが必要なため、ここを上げる
   （v2: styleOkの付与 / v3,v4: 種データ30件の書き直し /
    v5: demo_words.csv化・126件に拡充 / v6: morphemesを追加し①の
    お手本抽出で接辞の重なりを見られるようにした） */
const GORO_SEED_VERSION = "v6";
const GORO_EXAMPLE_TOPK = 4;
/* マンネリ検出のしきい値。意味整合ゲートより厳しく（同じ言い回しの
   使い回しだけを弾きたい）、これも直感値ではなく将来的に実データで
   調整できるよう定数として独立させている */
const GORO_REPEAT_SIM_THRESHOLD = 0.93;

/* 種データは、単語の意味と語呂合わせの対応そのものは正しいが、書かれた
   のが品質ルールを厳しくする前なので、現在の機械チェック（長さ・読みの
   丸ごと使用など）には通らないものが多い。②の閾値校正には「意味と語呂が
   対応している実例」として全件使ってよい一方、①のFew-shot例としてそのまま
   見せるとAIに古い作風を学習させてしまうため、styleOkで区別して持つ */
function buildGoroSeedCorpus() {
  return Object.entries(DEMO_WORD_DATA)
    .filter(([, d]) => d && d.meaning && d.goroText)
    .map(([word, d]) => ({
      id: `seed:${word}`, word, meaning: d.meaning, goroText: d.goroText, source: "seed",
      morphemes: d.morphemes || [],
      styleOk: goroViolations(d.goroText, d.morphemes || []).length === 0,
    }));
}

/* 種データを一度だけembeddingしてgoro_corpusに保存し、あわせて
   ②意味整合ゲートのしきい値を実測で校正する。「単語の意味」と
   「実際に採用された語呂合わせ」の組は、良質な語呂の実例として
   30件分揃っているので、当てずっぽうの閾値を決め打ちする代わりに、
   その分布の最小値付近を境界として使う */
async function ensureGoroCorpusReady(provider, apiKey) {
  if (provider !== "sakura" || !apiKey) return;
  if ((await kvGet("goro_seed_version", null)) === GORO_SEED_VERSION) return;
  try {
    await demoWordDataReady;
    const seeds = buildGoroSeedCorpus();
    if (!seeds.length) return;
    const [meaningPassageVecs, meaningQueryVecs, goroVecs] = await Promise.all([
      embedTexts(seeds.map((s) => s.meaning), apiKey, "passage"),
      embedTexts(seeds.map((s) => s.meaning), apiKey, "query"),
      embedTexts(seeds.map((s) => s.goroText), apiKey, "passage"),
    ]);
    const sims = seeds.map((_, i) => cosineSim(meaningQueryVecs[i], goroVecs[i]));
    const threshold = Math.max(0, Math.min(...sims) - 0.03);
    await Promise.all(seeds.map((s, i) => idbPut("goro_corpus", {
      id: s.id, word: s.word, meaning: s.meaning, goroText: s.goroText,
      /* vector: 意味のembedding（②意味整合ゲート用）
         goroVector: 語呂合わせ本文のembedding（③のマンネリ検出用）
         morphemes: ①お手本抽出で接辞の重なりを見るために持つ */
      vector: meaningPassageVecs[i], goroVector: goroVecs[i], morphemes: s.morphemes,
      source: "seed", styleOk: s.styleOk, createdAt: Date.now(),
    })));
    await kvSet("goro_gate_threshold", threshold);
    await kvSet("goro_seed_version", GORO_SEED_VERSION);
  } catch (err) {
    console.warn("語呂合わせコーパスの初期化に失敗しました（スキップします）:", err);
  }
}

/* ユーザーが実際に採用して保存した語呂合わせを、種データと同じ形で
   goro_corpusに追加する。idはwordから決まるので、同じ単語を作り直して
   再保存した場合は自動的に最新の語呂合わせに上書きされる */
async function growGoroCorpusFromSave(word, wordMeaning, goroText, morphemes, provider, apiKey) {
  if (provider !== "sakura" || !apiKey || !wordMeaning || !goroText) return;
  if (!(await isRagEnabled())) return;
  try {
    const [meaningVec] = await embedTexts([wordMeaning], apiKey, "passage");
    const [goroVec] = await embedTexts([goroText], apiKey, "passage");
    await idbPut("goro_corpus", {
      id: `user:${word.toLowerCase()}`, word, meaning: wordMeaning, goroText,
      vector: meaningVec, goroVector: goroVec, morphemes: morphemes || [], source: "user", createdAt: Date.now(),
    });
  } catch (err) {
    console.warn("語呂合わせコーパスへの追加に失敗しました（スキップします）:", err);
  }
}

/* ②意味整合ゲート・③マンネリ検出の不合格理由。1語ずつの経路と
   まとめ経路で同じ文面をAIに返せるよう、生成側に切り出しておく */
function semanticDriftViolation(wordMeaning) {
  return {
    code: "semantic-drift",
    reason: `この語呂合わせの情景は、単語の意味「${wordMeaning}」との結びつきが弱いようです。読みの断片を活かしたまま、単語の意味を連想できる情景に描き直してください。`,
  };
}

function phrasingReuseViolation(similarWord) {
  return {
    code: "phrasing-reuse",
    reason: `この語呂合わせは、以前「${similarWord}」で使った言い回し・情景と似すぎています。読みの活かし方や情景の型を変えてください。`,
  };
}

/* 機械チェックに通らなかった場合に作り直す最大回数。
   1回目で合格すれば追加のAPI呼び出しは発生しない */
const GORO_MAX_ATTEMPTS = 3;

async function generateGoro(word, morphemes, provider, apiKey, wordMeaning, avoidTexts, onStatus) {
  /* 呼び出し元に今実際に何をしているかを知らせる。呼び出し元を
     指定しない場合（バッチ処理など）は何もしない */
  const report = onStatus || (() => {});

  /* 機械チェックで弾いた候補と、その不合格理由。次の試行でAIに具体的に
     伝えることで、同じ失敗の繰り返しを防ぐ */
  const rejectedNotes = [];
  /* 全試行が不合格でも語呂合わせ自体は出せるよう、違反の最も少ない候補を
     保険として持っておく（チェックの厳しさでユーザーの操作を失敗させない） */
  let fallback = null;

  /* embeddingsが使える場合のみ、①examples検索・②③の材料を用意する。
     どこかで失敗しても本筋の生成は止めず、以降の機能を静かに諦める */
  const useEmbeddings = provider === "sakura" && !!apiKey && (await isRagEnabled());
  let examples = [];
  let corpus = [];
  let meaningQueryVec = null;
  let gateThreshold = null;
  if (useEmbeddings) {
    try {
      report("お手本を準備中");
      await ensureGoroCorpusReady(provider, apiKey);
      corpus = await idbGetAll("goro_corpus");
      gateThreshold = await kvGet("goro_gate_threshold", null);
      /* ①のFew-shot例は「同じ接辞をどう音として捌いたか」の実例を優先する。
         意味の近さ（embedding類似度）は語呂の技法とあまり相関がなく
         参考にならなかったが、接辞そのものが同じなら、その読みをどう
         断片化して自然な日本語に溶け込ませたかがそのまま参考になる。
         共有接辞数の多い順に並べ、同数の中はランダムにして、
         GORO_EXAMPLE_TOPK件を選ぶ（一致が無ければ実質ランダム抽出のまま） */
      examples = corpus
        /* styleOk===false は現在の品質ルールに通らない古い作風の種データ。
           ③のマンネリ検出には引き続き使うが、手本としては見せない */
        .filter((c) => c.word.toLowerCase() !== word.toLowerCase() && c.styleOk !== false)
        .map((c) => ({
          ...c,
          affixOverlap: (c.morphemes || []).filter((cm) =>
            morphemes.some((m) => (m.part || "").toLowerCase() === (cm.part || "").toLowerCase())
          ).length,
          sortKey: Math.random(),
        }))
        .sort((a, b) => b.affixOverlap - a.affixOverlap || a.sortKey - b.sortKey)
        .slice(0, GORO_EXAMPLE_TOPK);
      /* meaningQueryVecは②意味整合ゲートで使うため、examples抽出とは
         切り離した上で引き続き取得する */
      if (wordMeaning) {
        report("単語の意味を解析中");
        [meaningQueryVec] = await embedTexts([wordMeaning], apiKey, "query");
      }
    } catch (err) {
      console.warn("語呂合わせのRAG準備に失敗しました（スキップします）:", err);
    }
  }

  for (let attempt = 0; attempt < GORO_MAX_ATTEMPTS; attempt++) {
    report(attempt === 0 ? "語呂合わせを生成中" : "語呂合わせを作り直し中");
    const sys = goroSystemPrompt(word, morphemes, wordMeaning, avoidTexts, rejectedNotes, examples);
    const json = await callAI(provider, apiKey, sys, "語呂合わせ候補を1件、JSON形式で出力してください。");
    const candidates = (json.candidates || []).map((c) => ({ text: c.text, highlight: c.highlight || [] }));
    if (!candidates.length) throw new Error("語呂合わせが生成できませんでした");

    report("機械チェック中");
    const violations = goroViolations(candidates[0].text, morphemes);

    /* ②単語の意味との結びつきが弱い（読みの音を成立させるためだけの
       こじつけの情景になっている）候補と、③既存の語呂と言い回しが
       似すぎている候補を、機械チェックの違反として同じ土俵で扱う。
       既に機械チェック(goroViolations)で不合格が確定している場合は
       無駄なembedding呼び出しをしない */
    if (useEmbeddings && !violations.length) {
      try {
        report("意味の整合性を確認中");
        const [candVec] = await embedTexts([candidates[0].text], apiKey, "passage");
        if (meaningQueryVec && gateThreshold != null) {
          const alignScore = cosineSim(candVec, meaningQueryVec);
          if (alignScore < gateThreshold) violations.push(semanticDriftViolation(wordMeaning));
        }
        const repeatHit = corpus
          .filter((c) => Array.isArray(c.goroVector) && c.word.toLowerCase() !== word.toLowerCase())
          .find((c) => cosineSim(candVec, c.goroVector) >= GORO_REPEAT_SIM_THRESHOLD);
        if (repeatHit) violations.push(phrasingReuseViolation(repeatHit.word));
      } catch (err) {
        console.warn("意味整合ゲート/マンネリ検出の計算に失敗しました（スキップします）:", err);
      }
    }

    if (violations.length) {
      if (!fallback || violations.length < fallback.violations.length) {
        fallback = { candidates, violations };
      }
      rejectedNotes.push({ text: candidates[0].text, reasons: violations.map((v) => v.reason) });
      continue;
    }

    /* 機械チェックを通った候補だけ、AIによる自然さ・面白さの校閲にかける。
       校閲で新たな違反が入り込む場合は、校閲前の合格版をそのまま使う */
    report("校閲中");
    const revised = await validateGoroCandidates(word, morphemes, candidates, provider, apiKey, wordMeaning);
    return goroViolations(revised[0]?.text, morphemes).length ? candidates : revised;
  }

  console.warn("Goro deterministic check failed on all attempts, using best candidate:", fallback.violations);
  return fallback.candidates;
}

async function bumpUsage(tokens) {
  const calls = (await kvGet("usage_calls", 0)) + 1;
  const total = (await kvGet("usage_tokens", 0)) + (tokens || 0);
  await kvSet("usage_calls", calls);
  await kvSet("usage_tokens", total);
}

/* ------------------------------------------------------------------ *
 * 4.7 まとめ生成（複数の単語を1リクエストに束ねる）
 *   さくらのAI Engineはリクエスト単位で課金されるため、1語につき4〜6回
 *   呼んでいた分解・語呂合わせを、数語ぶんまとめて1回にする。
 *
 *   語呂合わせの精度を落とさないために、次の2つは必ず守る。
 *     ・プロンプトの規則本文は1語ずつの経路とまったく同じ定数を共有する
 *       （DECOMPOSE_* / GORO_RULE_* / GORO_VALIDATION_CRITERIA）。
 *       まとめ用に書き写すと、片方だけ直したときに、まとめ生成の精度だけが
 *       誰にも気づかれずに落ちていく。
 *     ・生成後の機械チェック(goroViolations)・意味整合ゲート・マンネリ検出・
 *       不合格時の作り直しループ・AIによる校閲パスを、1語ずつの経路と
 *       まったく同じものを同じ順で通す。
 *   つまり、まとめるのは「送り方」だけで、合否の基準は一切変えない。
 *   まとめたせいで応答が雑になれば機械チェックが捕まえて作り直しに回るので、
 *   手抜きがそのまま単語帳に入ることはない。
 * ------------------------------------------------------------------ */

/* 1リクエストにまとめる単語数。増やすほど課金は減るが、1回の応答で
   書かせる量が増えるぶん品質は落ちやすくなる。落ちた分は機械チェックが
   捕まえて作り直しに回してくれるものの、作り直しが増えれば結局
   リクエストも増えるので、割に合う範囲としてこの値にしている */
const BATCH_CHUNK_SIZE = 5;

function chunkArray(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/* まとめ応答を単語で引けるようにする。AIが綴りを直して返してきたり、
   wordを省いたりすることがあるので、単語で引けない場合に限り、渡した
   順序を頼りに対応づける（順序を保つことはプロンプトで指示している）。
   どちらでも引けない語は取り違えるくらいなら未生成のまま残す */
function indexAiResultsByWord(results, words) {
  const rows = Array.isArray(results) ? results : [];
  const byWord = new Map();
  rows.forEach((r) => {
    const key = (r && typeof r.word === "string") ? r.word.trim().toLowerCase() : "";
    if (key && !byWord.has(key)) byWord.set(key, r);
  });
  const out = new Map();
  words.forEach((w, i) => {
    const hit = byWord.get(w.toLowerCase()) || (rows.length === words.length ? rows[i] : null);
    if (hit) out.set(w.toLowerCase(), hit);
  });
  return out;
}

/* --- まとめ分解 --- */

const BATCH_DECOMPOSE_SYS = [
  ...DECOMPOSE_ROLE_RULES,
  "既知の接頭辞・接尾辞の一覧は、単語ごとにユーザーメッセージで示します。その単語について示された一覧を優先的に使ってください。",
  ...DECOMPOSE_SPLIT_RULES,
  "複数の英単語をまとめて渡します。単語ごとに独立して判定・分割・分析し、渡された順序のまま、渡された単語すべてについて結果を返してください。単語を飛ばしたり、複数の単語をまとめたりしてはいけません。まとめて処理するからといって、1語ずつ扱う場合より内容を簡略化しないでください。",
  "出力は次のJSON形式のみを返し、それ以外の文章は一切書かないでください。resultsの各要素のwordには、渡された単語（修正前の綴り）をそのまま入れてください。",
  '{"results":[{"word":"investigation","word_exists":true,"corrected_word":"investigation","was_corrected":false,"word_meaning":"調査する・捜査する","word_phonetic":"ɪnˌvɛstɪˈɡeɪʃən","memory_tip":"in(中へ)+vestig(足跡を)+ation(たどること)で、痕跡を中まで追う=調査する、と覚える。","synonyms":["inquiry","probe","examination"],"antonyms":["neglect"],"morphemes":[{"part":"dict","reading":"ジクト","meaning":"言う","origin":"ラテン語 dicere","phonetic":"dɪkt"},{"part":"ion","reading":"イオン","meaning":"名詞化（〜すること）","origin":"ラテン語 -io","phonetic":"ən"}]}]}',
  ...DECOMPOSE_EXAMPLES,
].join("\n");

function batchDecomposeUserPrompt(words) {
  return [
    `次の${words.length}語について、それぞれ判定・分割・分析してください。`,
    ...words.map((w, i) => `【${i + 1}】単語: ${w}\n  ${DECOMPOSE_AFFIX_HINT(knownAffixesFor(w))}`),
  ].join("\n\n");
}

/* AIの応答1件を、decomposeWord の戻り値と同じ形に整える */
async function buildDecomposeResult(word, json, provider, apiKey) {
  const morphemes = await reconcileWithLocalDict(json.morphemes, provider, apiKey);
  const validCorrection = typeof json.corrected_word === "string" && /^[A-Za-z][A-Za-z'-]*$/.test(json.corrected_word);
  const correctedWord = validCorrection ? json.corrected_word : word;
  const wasCorrected = validCorrection && !!json.was_corrected && correctedWord.toLowerCase() !== word.toLowerCase();
  const synonyms = sanitizeWordList(json.synonyms, correctedWord);
  const antonyms = sanitizeWordList(json.antonyms, correctedWord).filter((w) => !synonyms.some((s) => s.toLowerCase() === w.toLowerCase()));
  return {
    correctedWord, wasCorrected, wordExists: true,
    meaning: json.word_meaning || "",
    phonetic: json.word_phonetic || "",
    memoryTip: (json.memory_tip || "").slice(0, 100),
    synonyms, antonyms, morphemes,
  };
}

/* 1語ずつの経路には、項目が欠けていたときに埋め直す再試行がある。
   まとめ経路でそこまで作り込むと分岐が増えるので、欠けのある語だけ
   1語ずつの経路にそのまま渡す。まとめたせいで内容の薄い単語が
   混ざることを防げて、追加の課金も欠けた語のぶんだけで済む */
function isDecomposeResultComplete(result) {
  return !!(result.morphemes.length && result.meaning && result.phonetic && result.memoryTip
    && !result.morphemes.some((m) => m.meaning === MEANING_UNAVAILABLE));
}

async function batchDecomposeWords(words, provider, apiKey) {
  const out = new Map();
  const fallbackToSingle = async (word) => {
    try {
      out.set(word.toLowerCase(), await decomposeWord(word, provider, apiKey));
    } catch (err) {
      console.warn(`"${word}" の分解に失敗しました:`, err);
    }
  };

  let json;
  try {
    json = await callAI(provider, apiKey, BATCH_DECOMPOSE_SYS, batchDecomposeUserPrompt(words), 0.2);
  } catch (err) {
    console.warn("まとめ分解に失敗しました。1語ずつの経路で処理します:", err);
    for (const word of words) await fallbackToSingle(word);
    return out;
  }

  const byWord = indexAiResultsByWord(json.results, words);
  const validationTargets = [];
  for (const word of words) {
    const row = byWord.get(word.toLowerCase());
    if (!row) { await fallbackToSingle(word); continue; }
    if (row.word_exists === false) {
      out.set(word.toLowerCase(), {
        correctedWord: word, wasCorrected: false, wordExists: false,
        meaning: "", phonetic: "", memoryTip: "", synonyms: [], antonyms: [], morphemes: [],
      });
      continue;
    }
    const result = await buildDecomposeResult(word, row, provider, apiKey);
    if (!isDecomposeResultComplete(result)) { await fallbackToSingle(word); continue; }
    out.set(word.toLowerCase(), result);
    validationTargets.push({ word, result });
  }

  await batchValidateDecompositions(validationTargets, provider, apiKey);
  return out;
}

const BATCH_DECOMPOSE_VALIDATION_SYS = [
  "あなたは英語の語源・形態素解析の専門家であり、厳格な校閲者です。",
  "複数の英単語について、接頭辞・語根・接尾辞（接辞）に分割した結果をまとめて渡します。単語ごとに独立して、次の点を厳しく確認してください。",
  DECOMPOSE_VALIDATION_CRITERIA,
  "単語によっては、特に重点的に確認すべき点や、既に確定している分割が添えられています。添えられている場合は必ずその指示に従ってください。",
  "いずれかに誤りが見つかった場合は、正しい分割・正しい情報にすべて書き直してください。問題がなければそのまま使ってください。",
  "渡された単語すべてについて、渡された順序のまま結果を返してください。単語を飛ばしてはいけません。wordには渡された単語をそのまま入れてください。",
  "出力は、書き直した場合も含め、必ず全単語・全要素を次のJSON形式のみで返してください。それ以外の文章は一切書かないでください。",
  '{"results":[{"word":"investigation","morphemes":[{"part":"in","reading":"イン","meaning":"中へ","origin":"ラテン語 in-","phonetic":"ɪn"}]}]}',
].join("\n");

function batchDecomposeValidationUserPrompt(targets) {
  return targets.map((t, i) => [
    `【${i + 1}】単語: ${t.result.correctedWord}`,
    t.result.morphemes
      .map((m, j) => `  ${j + 1}. ${m.part} - 読み:${m.reading} / 意味:${m.meaning} / 由来:${m.origin} / 発音記号:${m.phonetic}`)
      .join("\n"),
    t.hints.length ? DECOMPOSE_HINT_BLOCK(t.hints) : "",
    t.requiredParts ? DECOMPOSE_REQUIRED_BLOCK(t.requiredParts) : "",
  ].filter(Boolean).join("\n")).join("\n\n");
}

/* validateDecomposition と同じ受け入れ条件で、まとめて校閲する。
   条件を満たさなかった語は、1語ずつの経路と同じく元の分割のまま残す
   （校閲結果を無理に採用して分割を壊す方が害が大きい） */
async function batchValidateDecompositions(entries, provider, apiKey) {
  const targets = entries
    .filter((e) => e.result.morphemes.length)
    .map((e) => ({
      ...e,
      hints: findUnderSplitHints(e.result.correctedWord, e.result.morphemes, e.result.memoryTip),
      requiredParts: requiredSegmentation(e.result.correctedWord, e.result.morphemes, e.result.memoryTip),
    }));
  if (!targets.length) return;

  try {
    const json = await callAI(provider, apiKey, BATCH_DECOMPOSE_VALIDATION_SYS, batchDecomposeValidationUserPrompt(targets), 0.2);
    const byWord = indexAiResultsByWord(json.results, targets.map((t) => t.result.correctedWord));
    for (const t of targets) {
      const row = byWord.get(t.result.correctedWord.toLowerCase());
      if (!row || !Array.isArray(row.morphemes)) continue;
      const revised = await reconcileWithLocalDict(row.morphemes, provider, apiKey);
      if (!revised.length) continue;
      if (revised.map((m) => m.part).join("").toLowerCase() !== t.result.correctedWord.toLowerCase()) continue;
      if (t.requiredParts && !sameSegmentation(revised, t.requiredParts)) continue;
      t.result.morphemes = revised;
    }
  } catch (err) {
    console.warn("まとめ校閲に失敗しました（元の分割をそのまま使います）:", err);
  }
}

/* --- まとめ語呂合わせ生成 --- */

function batchGoroSystemPrompt(count) {
  return [
    "あなたは日本語の語呂合わせ作家です。",
    `${count}語の英単語について、それぞれ語呂合わせを1件ずつ作ってください。単語ごとの接辞・カタカナ読み・意味は、ユーザーメッセージで単語ごとに示します。`,
    GORO_RULE_MATERIAL,
    GORO_RULE_MEANING_ALIGN,
    GORO_RULE_BAD_PATTERNS,
    GORO_RULE_FINAL,
    /* まとめて作らせたときにだけ起きる崩れ方が2つある。1語目だけ丁寧で
       残りが雑になることと、同じ型の一文を全語で使い回すこと。どちらも
       1語ずつの経路では起きないので、この注意はまとめ経路にだけ足す */
    "【重要】1語ずつ、上の規則をすべて満たしているか確認してから次の語に進んでください。まとめて作るからといって、1語ずつ作る場合より雑にしてはいけません。",
    "【重要】単語ごとに情景・オチ・文体を必ず変えてください。同じ型・同じ言い回しの一文を複数の単語で使い回してはいけません。",
    GORO_RULE_SELF_CHECK,
    "渡された単語すべてについて、渡された順序のまま1件ずつ返してください。単語を飛ばしてはいけません。wordには渡された単語をそのまま入れてください。",
    "次のJSON形式のみを返し、それ以外の文章は一切書かないでください。",
    '{"results":[{"word":"dictionary","text":"軸(dict)にイオン(ion)がぶつかり電気あり(ary)、大慌てだ！","highlight":[{"part":"dict","in_text":"軸"}]}]}',
  ].join("\n");
}

function batchGoroWordBlock(item, index) {
  return [
    `【${index + 1}】単語: ${item.word}`,
    `  接辞とカタカナ読み: ${item.morphemes.map((m) => `${m.part}(${m.reading})`).join(" / ")}`,
    item.wordMeaning ? `  単語全体の意味: ${item.wordMeaning}` : "",
  ].filter(Boolean).join("\n");
}

function batchGoroUserPrompt(states, rag) {
  return states.map((s, i) => [
    batchGoroWordBlock(s.item, i),
    (rag && (rag.examples.get(s.item.word) || []).length) ? GORO_EXAMPLE_BLOCK(rag.examples.get(s.item.word)) : "",
    s.notes.length ? GORO_REJECTED_BLOCK(s.notes) : "",
  ].filter(Boolean).join("\n")).join("\n\n");
}

/* 1チャンク分のRAG材料をまとめて用意する。embeddingsは1リクエストで
   複数テキストを送れるので、単語数によらず呼び出しは数回で済む。
   どこかで失敗しても本筋の生成は止めず、静かにRAGだけ諦める */
async function prepareBatchGoroRag(items, provider, apiKey) {
  if (provider !== "sakura" || !apiKey || !(await isRagEnabled())) return null;
  try {
    await ensureGoroCorpusReady(provider, apiKey);
    const corpus = await idbGetAll("goro_corpus");
    const gateThreshold = await kvGet("goro_gate_threshold", null);
    const meaningVecs = new Map();
    const examples = new Map();
    const withMeaning = items.filter((it) => it.wordMeaning);
    if (withMeaning.length) {
      const vecs = await embedTexts(withMeaning.map((it) => it.wordMeaning), apiKey, "query");
      withMeaning.forEach((it, i) => {
        meaningVecs.set(it.word, vecs[i]);
        examples.set(it.word, corpus
          .filter((c) => c.word.toLowerCase() !== it.word.toLowerCase() && Array.isArray(c.vector) && c.styleOk !== false)
          .map((c) => ({ ...c, score: cosineSim(vecs[i], c.vector) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, GORO_EXAMPLE_TOPK));
      });
    }
    return { corpus, gateThreshold, meaningVecs, examples };
  } catch (err) {
    console.warn("まとめ生成のRAG準備に失敗しました（スキップします）:", err);
    return null;
  }
}

/* 機械チェック・意味整合ゲート・マンネリ検出を、チャンク内の全候補に
   同じ基準で適用する。generateGoro と同じく、機械チェックで既に不合格が
   確定している候補にはembeddingを使わない */
async function batchGoroViolations(fresh, rag, apiKey) {
  const out = new Map();
  for (const f of fresh) out.set(f, goroViolations(f.cand.text, f.state.item.morphemes));
  const clean = fresh.filter((f) => !out.get(f).length);
  if (!rag || !clean.length) return out;

  try {
    const vecs = await embedTexts(clean.map((f) => f.cand.text), apiKey, "passage");
    clean.forEach((f, i) => {
      const violations = out.get(f);
      const item = f.state.item;
      const meaningVec = rag.meaningVecs.get(item.word);
      if (meaningVec && rag.gateThreshold != null && cosineSim(vecs[i], meaningVec) < rag.gateThreshold) {
        violations.push(semanticDriftViolation(item.wordMeaning));
      }
      const repeatHit = rag.corpus
        .filter((c) => Array.isArray(c.goroVector) && c.word.toLowerCase() !== item.word.toLowerCase())
        .find((c) => cosineSim(vecs[i], c.goroVector) >= GORO_REPEAT_SIM_THRESHOLD);
      if (repeatHit) violations.push(phrasingReuseViolation(repeatHit.word));
    });
  } catch (err) {
    console.warn("意味整合ゲート/マンネリ検出の計算に失敗しました（スキップします）:", err);
  }
  return out;
}

function batchGoroValidationSystemPrompt(count) {
  return [
    "あなたは日本語の語呂合わせの校閲者です。",
    `${count}語ぶんの語呂合わせ候補をまとめて渡します。単語ごとに独立して、次の基準をすべて満たしているか厳しく確認してください。`,
    GORO_VALIDATION_CRITERIA(true),
    "いずれかを満たしていない候補は書き直してください。その際、どの接辞の音も省略してはいけません（元の発音から大胆に崩すのは自由です）。すべて満たしている候補はそのまま使ってください。",
    "渡された単語すべてについて、渡された順序のまま1件ずつ返してください。単語を飛ばしてはいけません。wordには渡された単語をそのまま入れてください。",
    "書き直した場合も含め、接辞の綴りを添えるカッコの書式は必ず保ってください。次のJSON形式のみを返し、それ以外の文章は一切書かないでください。",
    '{"results":[{"word":"dictionary","text":"軸(dict)にイオン(ion)がぶつかり電気あり(ary)、大慌てだ！"}]}',
  ].join("\n");
}

function batchGoroValidationUserPrompt(states) {
  return states.map((s, i) => [
    batchGoroWordBlock(s.item, i),
    `  候補: ${s.cand.text}`,
  ].join("\n")).join("\n\n");
}

/* 機械チェックを通った候補だけを、まとめて校閲にかける。校閲で新たな
   違反が入り込んだ語は校閲前の合格版に戻す（1語ずつの経路と同じ扱い） */
async function batchValidateGoro(states, provider, apiKey) {
  if (!states.length) return;
  try {
    const json = await callAI(provider, apiKey, batchGoroValidationSystemPrompt(states.length), batchGoroValidationUserPrompt(states), 0.4);
    const byWord = indexAiResultsByWord(json.results, states.map((s) => s.item.word));
    for (const s of states) {
      const row = byWord.get(s.item.word.toLowerCase());
      const text = (row && typeof row.text === "string") ? row.text.trim() : "";
      if (!text || goroViolations(text, s.item.morphemes).length) continue;
      s.cand = { text, highlight: s.cand.highlight };
    }
  } catch (err) {
    console.warn("まとめ語呂の校閲に失敗しました（校閲前の候補を使います）:", err);
  }
}

/* items: [{ word, wordMeaning, morphemes }]（1チャンク分）
   戻り値: Map<word, {text, highlight}>。作れなかった語は入らない */
async function batchGenerateGoro(items, provider, apiKey, rag, onStatus) {
  /* 1語ずつの経路(generateGoro)と同じく、今実際に何をしているかを
     呼び出し元へ報告する。指定が無ければ何もしない */
  const report = onStatus || (() => {});
  const states = items.map((item) => ({ item, notes: [], best: null, cand: null, passed: false }));

  for (let attempt = 0; attempt < GORO_MAX_ATTEMPTS; attempt++) {
    const pending = states.filter((s) => !s.cand);
    if (!pending.length) break;

    report(attempt === 0 ? "語呂合わせを生成中" : "語呂合わせを作り直し中");
    let json;
    try {
      json = await callAI(provider, apiKey, batchGoroSystemPrompt(pending.length), batchGoroUserPrompt(pending, rag));
    } catch (err) {
      /* 1回目で失敗したら候補が1つも無いので呼び出し元に投げる。
         2回目以降は手元に候補があるので、作り直しを諦めてそれを使う */
      if (attempt === 0) throw err;
      console.warn("まとめ語呂の作り直しに失敗しました:", err);
      break;
    }

    const byWord = indexAiResultsByWord(json.results, pending.map((s) => s.item.word));
    const fresh = [];
    for (const state of pending) {
      const row = byWord.get(state.item.word.toLowerCase());
      const text = (row && typeof row.text === "string") ? row.text.trim() : "";
      if (!text) continue; // 応答から漏れた語は次の試行に持ち越す
      fresh.push({ state, cand: { text, highlight: Array.isArray(row.highlight) ? row.highlight : [] } });
    }

    report(rag ? "意味の整合性を確認中" : "機械チェック中");
    const violationsOf = await batchGoroViolations(fresh, rag, apiKey);
    for (const f of fresh) {
      const violations = violationsOf.get(f) || [];
      if (!violations.length) { f.state.cand = f.cand; f.state.passed = true; continue; }
      if (!f.state.best || violations.length < f.state.best.violations.length) {
        f.state.best = { cand: f.cand, violations };
      }
      f.state.notes.push({ text: f.cand.text, reasons: violations.map((v) => v.reason) });
    }
  }

  /* 全試行が不合格だった語は、1語ずつの経路と同じく違反の最も少ない
     候補を使う（チェックの厳しさで操作そのものを失敗させない） */
  for (const state of states) {
    if (state.cand || !state.best) continue;
    console.warn(`"${state.item.word}" は機械チェックを通らなかったため、違反の最も少ない候補を使います:`, state.best.violations);
    state.cand = state.best.cand;
  }

  report("校閲中");
  await batchValidateGoro(states.filter((s) => s.passed), provider, apiKey);

  const out = new Map();
  for (const state of states) if (state.cand) out.set(state.item.word, state.cand);
  return out;
}

/* ------------------------------------------------------------------ *
 * 5. 読み上げ
 *    日本語(語呂合わせ・単語の意味)はさくらのAIのTTS(VOICEVOX)で読み、
 *    英単語そのものと、TTSが使えない場合はブラウザ内蔵の音声合成に戻す。
 * ------------------------------------------------------------------ */

/* OpenAIのTTS API互換で、model / voice / input を渡すと音声バイナリが
   返る。対応プロバイダを増やす場合はここに足せば、利用可否の判定も
   フォールバックもこのマップの有無だけで動く */
const TTS_ENDPOINTS = {
  sakura: {
    speechUrl: "https://api.ai.sakura.ad.jp/v1/audio/speech",
    modelsUrl: "https://api.ai.sakura.ad.jp/v1/models",
  },
};

/* さくらのAI EngineのTTSは、modelに話者、voiceにその話者のスタイルを渡す
   （例: 春日部つむぎのノーマル → model:"kasukabetsumugi", voice:"normal"）。
   話者IDは話者名のローマ字表記だが、区切り文字の有無など正確な綴りが
   公開情報から確定できないものがある。ここにあるのはあくまで確認の
   出発点で、綴りは /v1/models の実際の一覧で上書きし、使えるかどうかは
   実際に鳴らして判断する（この一覧をそのまま選択肢として見せない） */
const TTS_SPEAKERS = [
  { id: "zundamon", label: "ずんだもん" },
  { id: "shikokumetan", label: "四国めたん" },
  { id: "kasukabetsumugi", label: "春日部つむぎ" },
  { id: "meimeihimari", label: "冥鳴ひまり" },
  { id: "tohokuzunko", label: "東北ずん子" },
  { id: "tohokukiritan", label: "東北きりたん" },
  { id: "tohokuitako", label: "東北イタコ" },
  { id: "ankomon", label: "あんこもん" },
];
const TTS_VOICE = "normal";

/* 規約に同意済みで、実際に鳴ることを確認できている話者。検出を一度も
   実行していない端末でも最初から選べるようにする。検出を実行した後は
   その結果を優先する（実測を、確認済みの決め打ちより信用する） */
const TTS_SPEAKERS_CONFIRMED = ["zundamon"];
const TTS_SPEAKER_DEFAULT = "zundamon";

/* 以前は話者検出が通信エラーで空振りしただけでブラウザ標準("")が保存され、
   その後ずんだもんに戻らなくなっていた。取りこぼした端末を一度だけ既定へ
   戻す。この移行より後に自分でブラウザ標準を選んだ場合はそのまま尊重する */
async function migrateTtsSpeakerDefaultOnce() {
  if (await kvGet("tts_speaker_default_migrated", false)) return;
  await kvSet("tts_speaker_default_migrated", true);
  if ((await kvGet("tts_speaker", null)) === "") await kvSet("tts_speaker", TTS_SPEAKER_DEFAULT);
}

/* 綴りの揺れ（ハイフンやアンダースコアの有無）を無視して突き合わせる */
function normalizeSpeakerId(id) {
  return String(id || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function fetchModelIds(endpoint, apiKey) {
  try {
    const res = await fetch(endpoint.modelsUrl, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) return [];
    const json = await res.json();
    return (json.data || []).map((m) => m && m.id).filter((id) => typeof id === "string");
  } catch (err) {
    console.warn("Failed to list models:", err);
    return [];
  }
}

/* 一覧が取れた場合は、実在が確認できた話者だけを返す（IDもAPIが返した
   綴りそのものを使う）。取れなかった場合は判断材料が無いので既知の
   一覧をそのまま返し、実際に鳴るかは試聴で確かめてもらう */
/* 同じ語呂合わせを繰り返し聞くことが多いので、生成済みの音声は
   使い回す。青天井に持たないよう、古いものから捨てる */
const TTS_CACHE_LIMIT = 30;
const ttsCache = new Map();

function putTtsCache(key, url) {
  if (ttsCache.size >= TTS_CACHE_LIMIT) {
    const oldest = ttsCache.keys().next().value;
    URL.revokeObjectURL(ttsCache.get(oldest));
    ttsCache.delete(oldest);
  }
  ttsCache.set(key, url);
}

let currentTtsAudio = null;
/* 音声の取得中に次の読み上げが始まることがあるので、世代を持たせて
   古い方の再生を捨てる（そのままだと2つ同時に鳴る） */
let ttsGeneration = 0;

function stopSpeaking() {
  ttsGeneration++;
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  if (currentTtsAudio) {
    currentTtsAudio.pause();
    currentTtsAudio.onended = null;
    currentTtsAudio.onerror = null;
    currentTtsAudio = null;
  }
}

/* カッコ書きの注釈は読み上げても分かりにくいだけなので落とす */
function spokenTextOf(text) {
  const raw = String(text || "");
  return raw.replace(/[（(][^）)]*[）)]/g, "").replace(/\s{2,}/g, " ").trim() || raw.trim();
}

function speakWithBrowser(spoken, onEnd, lang) {
  if (!("speechSynthesis" in window)) { if (onEnd) onEnd(); return; }
  const u = new SpeechSynthesisUtterance(spoken);
  u.lang = lang;
  u.rate = 1.0;
  if (onEnd) u.onend = onEnd;
  window.speechSynthesis.speak(u);
}

function requestTtsAudio(endpoint, apiKey, model, spoken) {
  return fetch(endpoint.speechUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, voice: TTS_VOICE, input: spoken }),
  });
}

/* 音声モデルは /v1/models に載っていても、さくらのクラウドのコントロール
   パネルで話者ごとに利用規約へ同意するまで使えず、呼ぶと400
   "This model is not available." が返る。話者IDの綴り間違いと症状が
   紛らわしく、実際この切り分けで一度実装が止まっているため言い分ける */
function ttsErrorHint(err) {
  return /not available/i.test(err.message || "")
    ? "この話者はまだ利用できません。さくらのクラウドのコントロールパネルで「AI Engine」→「利用可能な音声モデル」を開き、この話者の利用規約に同意してください（反映に数分かかることがあります）。"
    : "";
}

/* 失敗してもブラウザ内蔵の音声で読み上げは続くため、黙っていると
   VOICEVOXが使えていないことに気づけない。セッション中に一度だけ知らせる */
let ttsFallbackNotified = false;

async function fetchTtsAudioUrl(endpoint, apiKey, speaker, spoken) {
  const cacheKey = `${speaker}\n${spoken}`;
  const cached = ttsCache.get(cacheKey);
  if (cached) return cached;

  const res = await requestTtsAudio(endpoint, apiKey, speaker, spoken);
  if (!res.ok) {
    const detail = await extractErrorDetail(res);
    throw new Error(`TTS API エラー (${res.status})${detail ? `: ${detail}` : ""}`);
  }
  const url = URL.createObjectURL(await res.blob());
  putTtsCache(cacheKey, url);
  return url;
}

/* 読み上げが完全に止まるより、声が変わってでも読まれる方がよいので、
   キー未設定・通信失敗・再生失敗のいずれでもブラウザ内蔵の合成に戻す。
   onEndは自動再生の進行に使われるため、どの経路でも必ず呼ぶ */
async function speak(text, onEnd, lang = "ja-JP") {
  stopSpeaking();
  const gen = ttsGeneration;
  const spoken = spokenTextOf(text);
  if (!spoken) { if (onEnd) onEnd(); return; }

  /* VOICEVOXは日本語専用なので、英単語の読み上げは常にブラウザ内蔵の合成 */
  const provider = await getActiveProvider();
  const endpoint = lang === "ja-JP" ? TTS_ENDPOINTS[provider] : null;
  const speaker = endpoint ? await kvGet("tts_speaker", TTS_SPEAKER_DEFAULT) : "";
  const apiKey = speaker ? await loadApiKey(provider) : "";
  if (gen !== ttsGeneration) { if (onEnd) onEnd(); return; }
  if (!apiKey) { speakWithBrowser(spoken, onEnd, lang); return; }

  try {
    const url = await fetchTtsAudioUrl(endpoint, apiKey, speaker, spoken);
    if (gen !== ttsGeneration) { if (onEnd) onEnd(); return; }
    const audio = new Audio(url);
    currentTtsAudio = audio;
    audio.onended = () => { if (currentTtsAudio === audio) currentTtsAudio = null; if (onEnd) onEnd(); };
    audio.onerror = () => {
      if (currentTtsAudio === audio) currentTtsAudio = null;
      speakWithBrowser(spoken, onEnd, lang);
    };
    await audio.play();
  } catch (err) {
    console.warn("TTS playback failed, falling back to the browser voice:", err);
    if (currentTtsAudio) currentTtsAudio = null;
    if (!ttsFallbackNotified) {
      ttsFallbackNotified = true;
      toast(ttsErrorHint(err) ? "音声モデルが未承諾のため端末の音声で読み上げます" : "読み上げに失敗したため端末の音声を使います");
    }
    speakWithBrowser(spoken, onEnd, lang);
  }
}

/* ------------------------------------------------------------------ *
 * 6. 画面遷移
 * ------------------------------------------------------------------ */
function showScreen(id) {
  if (id !== "screen-memorize" && memorizeAutoPlay) {
    memorizeAutoPlay = false;
    clearMemorizeAutoTimer();
  }
  if (id === "screen-home") {
    /* CSV出力/読み込みの選択シートや学習モードの選択シートを開いたままホームに
       戻った場合、次に単語帳を開いた時などに開きっぱなしで残ってしまうため、
       ホームに戻るタイミングで内部的に必ず閉じておく */
    const csvSheet = document.getElementById("csv-choice-sheet");
    if (csvSheet) csvSheet.style.display = "none";
    const memorizeSheet = document.getElementById("memorize-mode-sheet");
    if (memorizeSheet) memorizeSheet.style.display = "none";
  }
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  /* 画面切り替え時、前の画面のスクロール位置が残ってしまうことがあるため、
     常にページ最上部から表示されるようにする */
  window.scrollTo(0, 0);
}
document.querySelectorAll("[data-nav]").forEach((el) => {
  el.addEventListener("click", () => {
    const target = el.dataset.nav;
    if (target === "home") {
      showScreen("screen-home");
      document.getElementById("word-input").value = "";
      document.getElementById("home-error").textContent = "";
      /* 語呂合わせ画面などで単語を保存/削除した直後に戻ってくる場合があるため、
         履歴チップの保存マークを常に最新の状態へ更新しておく */
      renderRecentChips();
      /* スマホ版では自動フォーカスするとキーボードが開いてしまい使い勝手が悪いため、
         テキストボックスの自動フォーカスはPC版のみで行う */
      if (window.innerWidth >= 860) document.getElementById("word-input").focus();
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

/* PC（デスクトップ幅）では長押しではなくクリック開始・クリック終了の
   トグル操作にする。#appの min-width:860px のレイアウト切り替えと
   同じ基準に合わせている */
const desktopMicQuery = window.matchMedia("(min-width: 860px)");
const isDesktopMic = () => desktopMicQuery.matches;
const micHintIdle = () => (isDesktopMic() ? "クリックで入力" : "長押しで入力");

/* Whisper の文字起こしエンドポイント。OpenAI 互換で
   multipart/form-data の file + model を受け付ける。
   対応プロバイダを増やす場合はここに足せば、選択可否の判定も
   フォールバックもこのマップの有無だけで動く */
const WHISPER_ENDPOINTS = {
  sakura: { url: "https://api.ai.sakura.ad.jp/v1/audio/transcriptions", model: "whisper-large-v3-turbo" },
};

/* ほぼ無音の録音を渡すと、Whisper が学習データ由来の定型句を
   でっち上げて返すことがある。単語として採用しないよう弾く */
const WHISPER_NOISE = new Set([
  "you", "thankyou", "thanksforwatching", "bye", "goodbye", "okay", "ok",
  "so", "pleasesubscribe", "subtitlesbytheamaraorgcommunity", "hmm",
]);

/* マイク入力は「英単語をひとつ」言う前提。認識結果が複数語に割れても
   捨てずに連結して1語へ組み直す (responsibility が "response ability"、
   abandon が "a bandon" と割れるなど)。多少崩れても、分解時のタイポ
   訂正が実在語へ寄せてくれるので、先頭だけ拾うより取りこぼしが少ない */
function transcriptToWord(transcript) {
  /* 英字以外 (空白・句読点・語中のハイフンやアポストロフィ) をすべて
     落として1語に畳む。"response ability" も "re-construction" も
     つながった1語になる */
  const word = String(transcript || "").toLowerCase().replace(/[^a-z]+/g, "");
  return WHISPER_NOISE.has(word) ? "" : word;
}

async function transcribeWithWhisper(blob, provider, apiKey, filename) {
  const cfg = WHISPER_ENDPOINTS[provider];
  if (!cfg) throw new Error("このプロバイダは音声認識に未対応です");
  const form = new FormData();
  form.append("file", blob, filename);
  form.append("model", cfg.model);
  /* OpenAI 互換の任意パラメータ。英単語1語だと文脈が無く
     他言語に引きずられやすいので言語を固定する。
     受け付けないサーバでも単に無視される */
  form.append("language", "en");
  form.append("response_format", "json");

  /* Content-Type は boundary 付きで FormData に組み立てさせる */
  const res = await fetch(cfg.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    const detail = await extractErrorDetail(res);
    throw new Error(`音声認識エラー (${res.status})${detail ? `: ${detail}` : ""}`);
  }
  const json = await res.json();
  return json.text || "";
}

function pickRecorderMime() {
  /* さくらのAI側はmp3/wav/m4a/mp4が明示されているのに対しwebmの記載が
     ないため、対応していればmp4 (=m4a) を優先する。webmしか録音できない
     ブラウザでも、拒否された場合はAPIのエラーがそのままトーストに出る */
  const candidates = [
    "audio/mp4",
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
  ];
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return "";
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || "";
}

function mimeToFilename(mime) {
  if (mime.includes("mp4")) return "speech.m4a";
  if (mime.includes("ogg")) return "speech.ogg";
  return "speech.webm";
}

const canRecord = !!(navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined" && pickRecorderMime());

if (!SpeechRecognitionCtor && !canRecord) {
  micSection.style.display = "none";
} else {
  /* busy: 押してから認識完了までの一連の処理が進行中
     released: その最中に既にボタンを離したか
     キー読み出しやマイク許可の待ち時間中に離されることがあるため、
     この2つで「起動を続けてよいか」を判断する */
  let busy = false;
  let released = false;
  let engineInUse = null;

  const setMicState = (active, hint) => {
    micOverlayBtn.classList.toggle("listening", active);
    micOverlayHint.textContent = hint;
  };

  const resetMic = () => {
    busy = false;
    engineInUse = null;
    setMicState(false, micHintIdle());
  };

  /* 操作説明（ヒント文言・aria-label）をPC/モバイルの現在のレイアウトに
     合わせる。録音中に呼んでも表示中の状態文言を上書きしないよう、
     アイドル時のみヒントを差し替える */
  const refreshMicHintForLayout = () => {
    if (!busy) micOverlayHint.textContent = micHintIdle();
    micOverlayBtn.setAttribute("aria-label", isDesktopMic() ? "クリックで音声入力" : "長押しで音声入力");
  };
  refreshMicHintForLayout();
  desktopMicQuery.addEventListener("change", refreshMicHintForLayout);

  const submitWord = (transcript) => {
    const word = transcriptToWord(transcript);
    if (!word) {
      toast("聞き取れませんでした");
      return;
    }
    wordInput.value = word;
    homeError.textContent = "";
    startDecompose(word);
  };

  /* --- エンジンA: ブラウザ内蔵の音声認識 (APIキー不要) ---
     continuous=true では発話が複数のresultに分割されるため、
     resultIndex から全件を積み上げる。確定と送信はボタンを離した
     後 (onend) に一度だけ行う。onresult の時点で送信すると、長い
     単語の途中で確定した仮説がそのまま送られてしまう */
  const browserEngine = {
    recognition: null,
    start() {
      const recognition = new SpeechRecognitionCtor();
      this.recognition = recognition;
      recognition.lang = "en-US";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      let finalText = "";
      let interimText = "";
      let failed = false;

      recognition.onresult = (e) => {
        interimText = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const chunk = e.results[i][0]?.transcript || "";
          if (e.results[i].isFinal) finalText += ` ${chunk}`;
          else interimText += ` ${chunk}`;
        }
        /* 認識の途中経過は入力欄に映すだけに留める */
        wordInput.value = transcriptToWord(`${finalText} ${interimText}`);
      };
      recognition.onerror = (e) => {
        /* 離した直後に発話が無いと no-speech / aborted が飛ぶが、
           これは異常ではないので黙って終える */
        if (e.error !== "no-speech" && e.error !== "aborted") failed = true;
      };
      recognition.onend = () => {
        this.recognition = null;
        resetMic();
        if (failed) { toast("音声入力に失敗しました"); return; }
        submitWord(finalText || interimText);
      };

      recognition.start();
      setMicState(true, "話してください…");
    },
    stop() {
      if (this.recognition) this.recognition.stop();
    },
  };

  /* --- エンジンB: 録音して Whisper に投げる (高精度・APIキー必要) ---
     押している間だけ録音し、離してから音声全体を1リクエストで送る。
     発話を区切る余地がそもそも無いので、長い単語でも切れない */
  const whisperEngine = {
    recorder: null,
    stream: null,
    start(provider, apiKey) {
      const mime = pickRecorderMime();
      setMicState(true, "準備中…");
      navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        /* マイク許可を待つ間に指が離れていたら、録音せず後始末だけする */
        if (released) { stream.getTracks().forEach((t) => t.stop()); resetMic(); return; }
        this.stream = stream;
        const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        this.recorder = recorder;
        const chunks = [];
        const startedAt = Date.now();

        recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
        recorder.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          this.recorder = null;
          this.stream = null;
          const elapsed = Date.now() - startedAt;
          const blob = new Blob(chunks, { type: mime || "audio/webm" });

          /* 短すぎる録音は Whisper が幻聴を返しやすいので送らない */
          if (elapsed < 350 || blob.size < 1200) {
            resetMic();
            toast("もう少し長く押しながら話してください");
            return;
          }

          setMicState(false, "認識中…");
          try {
            const text = await transcribeWithWhisper(blob, provider, apiKey, mimeToFilename(mime || "audio/webm"));
            resetMic();
            submitWord(text);
          } catch (err) {
            console.warn("Whisper transcription failed:", err);
            resetMic();
            toast(err.message || "音声認識に失敗しました");
          }
        };

        recorder.start();
        setMicState(true, "話してください…");
      }).catch((err) => {
        console.warn("getUserMedia failed:", err);
        resetMic();
        toast("マイクを使用できませんでした");
      });
    },
    stop() {
      if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
      else if (this.stream) {
        /* 録音開始前に離された場合 */
        this.stream.getTracks().forEach((t) => t.stop());
        this.stream = null;
      }
    },
  };

  const startListening = async (e) => {
    if (busy) return;
    busy = true;
    released = false;
    /* 押している最中に指が少しずれても離したと扱われないよう、
       ポインタをボタンに固定する */
    if (e && e.pointerId !== undefined && micOverlayBtn.setPointerCapture) {
      try { micOverlayBtn.setPointerCapture(e.pointerId); } catch { /* 無視 */ }
    }
    setMicState(true, "準備中…");

    const mode = await kvGet("voice_engine", "auto");
    const provider = await getActiveProvider();
    const apiKey = WHISPER_ENDPOINTS[provider] ? await loadApiKey(provider) : "";
    const useWhisper = mode !== "browser" && canRecord && !!apiKey;

    /* 設定の読み出しを待つ間に離されていたら起動しない */
    if (released) { resetMic(); return; }

    if (useWhisper) {
      engineInUse = whisperEngine;
      whisperEngine.start(provider, apiKey);
    } else if (SpeechRecognitionCtor) {
      engineInUse = browserEngine;
      browserEngine.start();
    } else {
      resetMic();
      toast("音声入力にはAPIキーの設定が必要です");
    }
  };

  const stopListening = () => {
    if (!busy || released) return;
    released = true;
    /* engineInUse が未設定なら、まだ起動処理の途中。
       起動側が released を見て自分で中断する */
    if (engineInUse) engineInUse.stop();
  };

  /* モバイルは長押し（押している間だけ録音）、PCはクリックで開始・
     もう一度クリックで終了のトグル。タップ操作の後にはブラウザが
     合成のclickイベントも発火させるため、互いのハンドラは現在の
     レイアウトに合わない方をその場で無視する（二重発火防止） */
  micOverlayBtn.addEventListener("pointerdown", (e) => {
    if (isDesktopMic()) return;
    startListening(e);
  });
  micOverlayBtn.addEventListener("pointerup", (e) => {
    if (isDesktopMic()) return;
    stopListening();
  });
  micOverlayBtn.addEventListener("pointercancel", (e) => {
    if (isDesktopMic()) return;
    stopListening();
  });
  /* pointerleave では止めない。指がボタンからわずかにずれただけで
     録音が切れてしまい、長い単語の途中で終わる原因になる */

  micOverlayBtn.addEventListener("click", (e) => {
    if (!isDesktopMic()) return;
    if (busy) stopListening();
    else startListening(e);
  });
}

/* APIキー未登録でも分割アニメーション・語呂合わせをそのまま体験できるよう、
   デモ用の分解結果・語呂合わせを実行時に demo_words.csv から読み込んで
   組み立てる（AI応答(decomposeWord/generateGoroの戻り値)と同じ形に揃える）。
   単語を増やしたい・語呂を直したい場合はこのJSファイルを触らずに、
   GitHub上で demo_words.csv （word, meaning, goroText の3列）を編集
   するだけでよいようにするための仕組み。
   goroText中の(part)注釈から使われている接辞を割り出し、
   LOCAL_AFFIX_DICT → DEMO_CUSTOM_MORPHEMES の順で読み・意味・語源・
   発音記号を引く。phonetic（単語全体の発音）とmemoryTipは、その接辞情報
   から機械的に組み立てる（多少大まかだが、デモ表示としては十分） */
let DEMO_WORD_DATA = {};

/* RFC4180ふうの簡易CSVパーサ。ダブルクォートで囲んだフィールド内の
   カンマ・改行・エスケープされたクォート("" )に対応する */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { field += c; }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      rows.push(row); row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

function morphemesFromGoroText(goroText) {
  const seen = [];
  for (const m of goroText.matchAll(/[（(]([A-Za-z][A-Za-z'-]*)[）)]/g)) {
    const part = m[1].toLowerCase();
    if (!seen.includes(part)) seen.push(part);
  }
  return seen.map((part) => {
    const d = LOCAL_AFFIX_DICT[part] || DEMO_CUSTOM_MORPHEMES[part];
    if (!d) {
      console.warn(`demo_words.csv: 接辞 "${part}" の辞書定義が見つかりません（このデモ単語では表示に空欄が出ます）`);
      return { part, reading: "", meaning: "", origin: "", phonetic: "" };
    }
    return { part, ...d };
  });
}

async function loadDemoWordData() {
  try {
    const res = await fetch("./demo_words.csv");
    if (!res.ok) throw new Error(`demo_words.csv の取得に失敗しました (${res.status})`);
    const rows = parseCsv(await res.text());
    const [header, ...body] = rows;
    const idx = {
      word: header.indexOf("word"),
      meaning: header.indexOf("meaning"),
      goroText: header.indexOf("goroText"),
    };
    const data = {};
    for (const r of body) {
      const word = (r[idx.word] || "").trim().toLowerCase();
      const meaning = (r[idx.meaning] || "").trim();
      const goroText = (r[idx.goroText] || "").trim();
      if (!word || !meaning || !goroText) continue;
      const morphemes = morphemesFromGoroText(goroText);
      const memoryTip = `${morphemes.map((m) => `${m.part}(${m.meaning})`).join("+")}で、${meaning}、と覚える。`;
      const phonetic = morphemes.map((m) => m.phonetic).join("");
      data[word] = { meaning, phonetic, memoryTip, morphemes, goroText };
    }
    DEMO_WORD_DATA = data;
  } catch (err) {
    console.warn("デモ単語データ(demo_words.csv)の読み込みに失敗しました（デモ体験なしで続行します）:", err);
  }
}
const demoWordDataReady = loadDemoWordData();

function pickSampleWords(count, exclude = []) {
  const excludeLower = new Set(exclude.map((w) => w.toLowerCase()));
  const pool = Object.keys(DEMO_WORD_DATA).filter((w) => !excludeLower.has(w.toLowerCase()));
  const picked = [];
  while (picked.length < count && pool.length) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

async function renderRecentChips() {
  await demoWordDataReady;
  const recent = await kvGet("recent_words", []);
  /* チップは.chip-row側のCSSで3行分の高さに収まるようにしているので、
     ここでは行数に関わらず十分な数を用意しておけばよい */
  const limit = 20;
  const words = recent.length < limit ? [...recent, ...pickSampleWords(limit - recent.length, recent)] : recent.slice(0, limit);
  const wrap = document.getElementById("recent-chips");
  wrap.innerHTML = "";
  const savedFlags = await Promise.all(words.map((w) => idbGet("words", w.toLowerCase())));
  words.forEach((w, i) => {
    const chip = document.createElement("button");
    chip.className = savedFlags[i] ? "chip chip-saved" : "chip";
    if (savedFlags[i]) chip.title = "保存済み";
    chip.textContent = w;
    chip.addEventListener("click", () => startDecompose(w));
    wrap.appendChild(chip);
  });
}

async function pushRecentWord(word) {
  let recent = await kvGet("recent_words", []);
  recent = [word, ...recent.filter((w) => w.toLowerCase() !== word.toLowerCase())].slice(0, 20);
  await kvSet("recent_words", recent);
  await syncRecentWords(recent);
  renderRecentChips();
}

/* 高さが不明な内容を後から流し込む要素を、現在の高さへ一旦固定してから
   mutateで中身を差し替え、必要になる高さへCSSのtransitionで滑らかに
   伸ばす。中身の自然な高さ(auto)はそのままではtransitionできず、内容を
   差し込んだ瞬間に一気にその高さへスナップしてしまう（単語ごとに長さが
   違うため、決め打ちの高さでは実際の高さとずれる）ため、height+
   overflow:hiddenで一旦固定してから目的の高さへ動かす、autoheightを
   アニメーションさせる定石を使う。要素側にtransition:height / min-heightを
   持たせず、box-sizingがcontent-boxであることが前提 */
function growToFitContent(el, mutate) {
  const from = el.offsetHeight;
  el.style.height = `${from}px`;
  el.style.overflow = "hidden";
  mutate();
  /* 固定した高さが一度描画されてから、次のフレームで目的の高さへ動かす。
     同じフレーム内で連続してheightを書き換えると、ブラウザは中間状態を
     描画せず最終値へ直接ジャンプしてしまいtransitionが起きない */
  requestAnimationFrame(() => {
    el.style.height = `${el.scrollHeight}px`;
  });
}

/* ------------------------------------------------------------------ *
 * 9. 分解アニメーション → 結果画面フロー
 * ------------------------------------------------------------------ */
let currentWord = "";
let currentWordMeaning = "";
let currentWordPhonetic = "";
let currentMemoryTip = "";
let currentSynonyms = [];
let currentAntonyms = [];
let currentMorphemes = [];
let currentCandidates = [];

async function startDecompose(rawWord) {
  const word = (rawWord || "").trim().toLowerCase();
  if (!word) return;
  if (!/^[A-Za-z][A-Za-z'-]*$/.test(word)) {
    homeError.textContent = "英単語を入力してください（英字のみ）";
    return;
  }
  homeError.textContent = "";

  const provider = await getActiveProvider();
  const apiKey = await loadApiKey(provider);
  if (!apiKey) await demoWordDataReady;
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
  spinnerRow.style.visibility = "hidden";
  document.getElementById("decompose-appbar").style.display = "none";
  const decomposeWordMeaningEl = document.getElementById("decompose-word-meaning");
  decomposeWordMeaningEl.innerHTML = "";
  decomposeWordMeaningEl.classList.remove("show");
  decomposeWordMeaningEl.style.height = "";
  decomposeWordMeaningEl.style.overflow = "";
  const decomposeMemoryTipEl = document.getElementById("decompose-memory-tip");
  decomposeMemoryTipEl.textContent = "";
  decomposeMemoryTipEl.style.height = "";
  decomposeMemoryTipEl.style.overflow = "";
  decomposeMemoryTipEl.classList.remove("show");
  const errorMsgEl = document.getElementById("word-error-msg");
  errorMsgEl.textContent = "";
  errorMsgEl.classList.remove("show");
  errorMsgEl.style.display = "none";

  const placeholder = document.createElement("div");
  placeholder.className = "morph word-pulse";
  placeholder.textContent = word;
  splitEl.appendChild(placeholder);

  /* 分解の応答待ちの間、無言のパルス演出だけだと止まって見えるため、
     下に「スペル精査中…」のような具体的な文言を切り替えながら出す */
  spinnerRow.style.visibility = "visible";
  const decomposeLoadingSeq = startDecomposeLoadingSequence("decompose-spinner");

  let morphemes;
  if (demo) {
    /* 本来はAI分解の応答待ちが入る箇所。デモ単語は即座にデータが揃ってしまい
       不自然にノータイムで進んでしまうため、ダミーの待ち時間を入れる */
    await sleep(1000);
    morphemes = demo.morphemes;
    currentWordMeaning = demo.meaning;
    currentWordPhonetic = demo.phonetic;
    currentMemoryTip = demo.memoryTip;
    currentSynonyms = [];
    currentAntonyms = [];
  } else {
    try {
      const decomposed = await decomposeWord(word, provider, apiKey);
      if (decomposed.wordExists === false) {
        stopLoadingRotation("decompose-spinner");
        spinnerRow.style.visibility = "hidden";
        await playNotFoundError(placeholder, word);
        return;
      }
      morphemes = decomposed.morphemes;
      currentWordMeaning = decomposed.meaning;
      currentWordPhonetic = decomposed.phonetic;
      currentMemoryTip = decomposed.memoryTip;
      currentSynonyms = decomposed.synonyms || [];
      currentAntonyms = decomposed.antonyms || [];
      if (decomposed.wasCorrected) {
        await playSpellingFix(placeholder, word, decomposed.correctedWord);
        currentWord = decomposed.correctedWord.toLowerCase();
        /* 修正後の綴りを確認する間を置いてから、亀裂などの分割アニメーションに入る */
        await sleep(1500);
      }
    } catch (err) {
      placeholder.remove();
      stopLoadingRotation("decompose-spinner");
      spinnerRow.style.visibility = "visible";
      spinnerRow.innerHTML = `<span class="spin-label">分解に失敗しました。ホームに戻ってお試しください。</span>`;
      document.getElementById("decompose-appbar").style.display = "flex";
      console.error(err);
      return;
    }
  }

  /* 単語の意味・接辞を踏まえた一文は、後で表示するタイミングより先にここで
     コンテンツを流し込んでおく（要素自体はopacity:0/visibility:hiddenで
     見えないまま）。こうすることで、実際に表示する瞬間はopacityのフェード
     だけで済み、接辞カードなどが後から押し上げられるようなレイアウトの
     ずれが起きない。
     ここで流し込むのは「まだ見せていない工程の早送り」より前、データが
     揃った直後：これより後（ローディング演出の帳尻合わせの待ち時間の後）に
     流し込むと、空の状態から実際の高さへと箱がここで初めて伸び、まだ
     脈打っているプレースホルダーや下の「〜中…」の文字が数px不自然に
     ずれて見えてしまう。中身の長さは単語ごとに違い固定値では読めないため、
     ずれを完全には避けられないが、growToFitContentでスナップではなく
     滑らかな伸びに変えることで、突然ずれたようには見えなくする */
  if (currentWordMeaning) {
    const phoneticHtml = currentWordPhonetic ? `<span class="phonetic">[${escapeHtml(currentWordPhonetic)}]</span>` : "";
    growToFitContent(decomposeWordMeaningEl, () => {
      decomposeWordMeaningEl.innerHTML = `<div class="word-meaning-word">${escapeHtml(currentWord)}${phoneticHtml}</div><div class="word-meaning-text">${escapeHtml(currentWordMeaning)}</div>`;
    });
  }
  if (currentMemoryTip) {
    growToFitContent(decomposeMemoryTipEl, () => {
      decomposeMemoryTipEl.textContent = currentMemoryTip;
    });
  }

  /* 実際の分解はもう終わっているので、まだ見せていない工程があれば
     早送りで消化してから次へ進む（一応、全工程を出し切ってから遷移する） */
  decomposeLoadingSeq.markWorkDone();
  await decomposeLoadingSeq.donePromise;
  spinnerRow.style.visibility = "hidden";
  currentMorphemes = morphemes;

  /* Stage2(語呂合わせ生成)は接辞が確定した時点で先行開始し、分解アニメーションの
     再生時間と並行して進める。結果画面へは、両方が揃うまで遷移しない。
     デモ単語(APIキー未登録時)は、あらかじめ用意した語呂合わせをそのまま使う */
  document.getElementById("regen-btn").disabled = true;
  /* 新しい単語の初回生成では、別の単語の候補を「避けるべき前回の候補」として
     引き継いでしまわないようにリセットする */
  currentCandidates = [];
  if (demo) {
    currentCandidates = [{ text: demo.goroText, highlight: [] }];
    renderGoroList();
    document.getElementById("regen-btn").disabled = false;
  } else {
    /* 待たずに裏側で先行実行する。完了はloadGoroCandidates内のrenderGoroList
       が、進捗はgenerateGoroからのreportGoroStatusがgoro-listへ直接反映する */
    loadGoroCandidates(provider, apiKey);
  }

  const animStyle = resolveAnimStyle(await kvGet("decompose_anim", "random"));
  /* 分割する接辞が1つ（＝単語全体がそのまま1要素）しかない場合は、
     分割演出そのものが意味を持たないため省略する */
  if (morphemes.length > 1) {
    await animStyle.intro(placeholder, currentWord, morphemes);
  }
  placeholder.remove();

  if (currentWordMeaning) {
    requestAnimationFrame(() => decomposeWordMeaningEl.classList.add("show"));
  }

  splitEl.innerHTML = "";
  const mid = (morphemes.length - 1) / 2;
  morphemes.forEach((m, i) => {
    const el = document.createElement("div");
    el.className = `morph ${animStyle.tileClass}${morphTileClass(m.part)}`;
    Object.entries(animStyle.tileVars(i, mid)).forEach(([prop, val]) => el.style.setProperty(prop, val));
    el.style.animationDelay = `${i * 0.08}s`;

    const partEl = document.createElement("div");
    partEl.className = "morph-part";
    partEl.textContent = m.part;

    const meaningEl = document.createElement("div");
    meaningEl.className = "morph-meaning";
    meaningEl.textContent = m.meaning || "";

    el.appendChild(partEl);
    el.appendChild(meaningEl);
    splitEl.appendChild(el);
    animStyle.mountTile?.(el, i, mid);
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
      requestAnimationFrame(() => decomposeMemoryTipEl.classList.add("show"));
    }, lastMeaningDelay);
  }

  /* アニメーションが一通り終わったら、語呂合わせの生成完了を待たずに
     一定時間だけ置いて次の画面へ進む。以前は未完了なら「語呂合わせを
     準備中…」と出して待っていたが、分解結果を読む時間としては長すぎ、
     待たされている感じが強かった。語呂合わせは到着し次第
     loadGoroCandidates が描画するので、遷移を止める必要はない */
  const DECOMPOSE_READ_MS = 3000;
  await sleep(lastMeaningDelay + DECOMPOSE_READ_MS);
  /* 遷移した時点でまだ生成中でも、goro-listにはgenerateGoro自身が
     reportGoroStatusで書き込んだ現在の実況がすでに反映されている
     （loadGoroCandidatesの初回reportが分解アニメーションの再生中に
     とっくに発火しているため）ので、ここで別途プレースホルダーを
     出す必要はない */

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

/* 設定画面の「アニメーション オン/オフ」トグル。同期的に参照する必要が
   あるため、起動時に一度だけ読み込んでおく */
let animationsEnabled = true;
async function loadAnimationsEnabledSetting() {
  animationsEnabled = await kvGet("anim_enabled", true);
}
loadAnimationsEnabledSetting();

function reducedMotion() {
  return !animationsEnabled || (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

/* .morphのテキストはWebフォント(JetBrains Mono)で描画されるが、フォントの読み込みが
   間に合わないうちに幅を計測すると、フォールバックフォントの狭い幅で亀裂/ハサミの
   位置を計算してしまい、フォント切り替わり後に実際の文字幅とずれてしまう。
   （デコンポーズ画面への遷移直後はAPI待ち時間が無く、特に発生しやすい）
   計測前にフォントの読み込み完了を待つことでこれを防ぐ */
let morphFontReady = null;
function ensureMorphFontLoaded() {
  if (!morphFontReady) {
    morphFontReady = (document.fonts && document.fonts.load)
      ? Promise.all([
          document.fonts.load('700 20px "JetBrains Mono"'),
          document.fonts.load('400 20px "JetBrains Mono"'),
        ]).catch(() => {})
      : Promise.resolve();
  }
  return morphFontReady;
}

/* ---- 「ひび割れ」アニメーション: Canvasで実際に破片が飛び散るガラス割れ演出 ---- */
function roundRectPath(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function shardClipPath(ctx, leftPath, rightPath) {
  ctx.beginPath();
  ctx.moveTo(leftPath[0].x, leftPath[0].y);
  for (let i = 1; i < leftPath.length; i++) ctx.lineTo(leftPath[i].x, leftPath[i].y);
  for (let i = rightPath.length - 1; i >= 0; i--) ctx.lineTo(rightPath[i].x, rightPath[i].y);
  ctx.closePath();
}

/* 単語カードをそのままCanvas上に再現し、各接辞の境界(ギザギザの亀裂)で
   実際に破片として切り分けて物理的に吹き飛ばす。placeholder自体は
   visibility:hiddenにして隠し、その上に重ねたcanvasだけを見せる */
async function runCrackShatter(placeholder, word, morphemes, rect) {
  const cs = getComputedStyle(placeholder);
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);

  const padX = rect.width * 0.65;
  const padTop = rect.height * 0.5;
  const padBottom = rect.height * 2.4;
  const canvasW = rect.width + padX * 2;
  const canvasH = rect.height + padTop + padBottom;

  const canvas = document.createElement("canvas");
  canvas.className = "crack-canvas";
  canvas.style.left = `${-padX}px`;
  canvas.style.top = `${-padTop}px`;
  canvas.width = Math.round(canvasW * dpr);
  canvas.height = Math.round(canvasH * dpr);
  canvas.style.width = `${canvasW}px`;
  canvas.style.height = `${canvasH}px`;

  placeholder.appendChild(canvas);
  placeholder.style.visibility = "hidden";
  canvas.style.visibility = "visible";

  const ctx = canvas.getContext("2d");

  const bg = cs.backgroundColor;
  const borderColor = cs.borderTopColor;
  const borderWidth = parseFloat(cs.borderTopWidth) || 1.5;
  const radius = parseFloat(cs.borderTopLeftRadius) || 12;
  const textColor = cs.color;
  const font = `${cs.fontWeight || 700} ${cs.fontSize || "20px"} ${cs.fontFamily || "'JetBrains Mono',monospace"}`;

  /* 元絵(無傷のカード)を一度だけオフスクリーンに描き、破片を切り抜く元画像にする */
  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = Math.round(rect.width * dpr);
  srcCanvas.height = Math.round(rect.height * dpr);
  const srcCtx = srcCanvas.getContext("2d");
  srcCtx.scale(dpr, dpr);
  roundRectPath(srcCtx, borderWidth / 2, borderWidth / 2, rect.width - borderWidth, rect.height - borderWidth, radius);
  srcCtx.fillStyle = bg;
  srcCtx.fill();
  srcCtx.lineWidth = borderWidth;
  srcCtx.strokeStyle = borderColor;
  srcCtx.stroke();
  srcCtx.font = font;
  srcCtx.fillStyle = textColor;
  srcCtx.textAlign = "center";
  srcCtx.textBaseline = "middle";
  srcCtx.fillText(word, rect.width / 2, rect.height / 2);

  /* 各接辞の文字数比率の位置に、ギザギザの亀裂境界線を作る */
  let acc = 0;
  const boundaryFracs = [];
  morphemes.slice(0, -1).forEach((m) => {
    acc += (m.part || "").length;
    boundaryFracs.push(acc / word.length);
  });

  const JAG_STEPS = 6;
  const jagPaths = boundaryFracs.map((frac) => {
    const baseX = rect.width * frac;
    const pts = [];
    for (let j = 0; j <= JAG_STEPS; j++) {
      const y = (rect.height / JAG_STEPS) * j;
      const jitter = j === 0 || j === JAG_STEPS ? 0 : (Math.random() - 0.5) * Math.min(rect.width * 0.1, 14);
      pts.push({ x: baseX + jitter, y });
    }
    return pts;
  });
  const leftEdge = [{ x: 0, y: 0 }, { x: 0, y: rect.height }];
  const rightEdge = [{ x: rect.width, y: 0 }, { x: rect.width, y: rect.height }];
  const allBoundaries = [leftEdge, ...jagPaths, rightEdge];

  const shardCount = morphemes.length;
  const shards = allBoundaries.slice(0, -1).map((leftPath, i) => {
    const rightPath = allBoundaries[i + 1];
    const xs = [...leftPath, ...rightPath].map((p) => p.x);
    const dir = i - (shardCount - 1) / 2;
    return {
      leftPath, rightPath,
      pivotX: (Math.min(...xs) + Math.max(...xs)) / 2,
      pivotY: rect.height / 2,
      x: 0, y: 0,
      vx: dir * (60 + Math.random() * 50),
      vy: -(110 + Math.random() * 70),
      rot: 0,
      vrot: (dir === 0 ? Math.random() - 0.5 : Math.sign(dir)) * (140 + Math.random() * 160) * (Math.PI / 180),
      opacity: 1,
    };
  });

  const rootStyle = getComputedStyle(document.documentElement);
  const dustColor = rootStyle.getPropertyValue("--accent-2").trim() || "#E2622F";
  const crackColor = rootStyle.getPropertyValue("--danger").trim() || "#C74B3F";
  const dust = [];
  jagPaths.forEach((path) => {
    const mid = path[Math.floor(path.length / 2)];
    for (let k = 0; k < 4; k++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 90;
      dust.push({
        x: mid.x, y: mid.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 40,
        r: 1 + Math.random() * 1.8,
        opacity: 1,
      });
    }
  });

  const CRACK_MS = 150;
  const FLY_MS = 560;
  const FADE_FROM = FLY_MS * 0.5;
  const start = performance.now();

  return new Promise((resolve) => {
    function frame(now) {
      const t = now - start;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, canvasW, canvasH);

      if (t < CRACK_MS) {
        /* フェーズA: まだ砕けず、揺れながら亀裂が走っていく
           (rAFの最初のコールバックのtimestampがperformance.now()より
           わずかに前になることがあり、tが負になる場合があるためクランプする) */
        const p = Math.max(0, t / CRACK_MS);
        const shake = (1 - p) * 3;
        ctx.save();
        ctx.translate(padX + (Math.random() - 0.5) * shake, padTop + (Math.random() - 0.5) * shake);
        ctx.drawImage(srcCanvas, 0, 0, srcCanvas.width, srcCanvas.height, 0, 0, rect.width, rect.height);
        ctx.strokeStyle = crackColor;
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.globalAlpha = Math.min(1, p * 2.2);
        jagPaths.forEach((path) => {
          const reveal = Math.max(0, Math.min(path.length - 1, p * (path.length - 1) * 1.3));
          ctx.beginPath();
          ctx.moveTo(path[0].x, path[0].y);
          for (let i = 1; i <= Math.floor(reveal); i++) ctx.lineTo(path[i].x, path[i].y);
          const frac = reveal - Math.floor(reveal);
          if (frac > 0 && Math.floor(reveal) + 1 < path.length) {
            const a = path[Math.floor(reveal)];
            const b = path[Math.floor(reveal) + 1];
            ctx.lineTo(a.x + (b.x - a.x) * frac, a.y + (b.y - a.y) * frac);
          }
          ctx.stroke();
        });
        ctx.restore();
        requestAnimationFrame(frame);
        return;
      }

      /* フェーズB: 破片が物理的に砕け散る */
      const ft = t - CRACK_MS;
      const dt = 1 / 60;
      const gravity = 900;

      ctx.save();
      ctx.translate(padX, padTop);

      shards.forEach((s) => {
        if (s.opacity <= 0) return;
        s.vy += gravity * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.rot += s.vrot * dt;
        if (ft > FADE_FROM) s.opacity = Math.max(0, 1 - (ft - FADE_FROM) / (FLY_MS - FADE_FROM));

        ctx.save();
        ctx.globalAlpha = s.opacity;
        ctx.translate(s.pivotX + s.x, s.pivotY + s.y);
        ctx.rotate(s.rot);
        ctx.translate(-s.pivotX, -s.pivotY);
        shardClipPath(ctx, s.leftPath, s.rightPath);
        ctx.clip();
        ctx.drawImage(srcCanvas, 0, 0, srcCanvas.width, srcCanvas.height, 0, 0, rect.width, rect.height);
        ctx.restore();
      });

      dust.forEach((d) => {
        if (d.opacity <= 0) return;
        d.vy += gravity * 0.5 * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.opacity -= dt / 0.4;
        if (d.opacity <= 0) return;
        ctx.save();
        ctx.globalAlpha = Math.max(0, d.opacity);
        ctx.fillStyle = dustColor;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      ctx.restore();

      if (ft >= FLY_MS) { resolve(); return; }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
}

/* 単語カードをそのままCanvas上に再現し、各接辞の境界で破片として切り分けて
   火球・衝撃波・火の粉・煙とともに爆発的に吹き飛ばす。placeholder自体は
   visibility:hiddenにして隠し、その上に重ねたcanvasだけを見せる（亀裂演出と同じ手法） */
async function runBurstExplosion(placeholder, word, morphemes, rect) {
  const cs = getComputedStyle(placeholder);
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);

  const padX = rect.width * 1.3;
  const padTop = rect.height * 1.7;
  const padBottom = rect.height * 2.1;
  const canvasW = rect.width + padX * 2;
  const canvasH = rect.height + padTop + padBottom;

  const canvas = document.createElement("canvas");
  canvas.className = "burst-canvas";
  canvas.style.left = `${-padX}px`;
  canvas.style.top = `${-padTop}px`;
  canvas.width = Math.round(canvasW * dpr);
  canvas.height = Math.round(canvasH * dpr);
  canvas.style.width = `${canvasW}px`;
  canvas.style.height = `${canvasH}px`;

  placeholder.appendChild(canvas);
  placeholder.style.visibility = "hidden";
  canvas.style.visibility = "visible";

  const ctx = canvas.getContext("2d");

  const bg = cs.backgroundColor;
  const borderColor = cs.borderTopColor;
  const borderWidth = parseFloat(cs.borderTopWidth) || 1.5;
  const radius = parseFloat(cs.borderTopLeftRadius) || 12;
  const textColor = cs.color;
  const font = `${cs.fontWeight || 700} ${cs.fontSize || "20px"} ${cs.fontFamily || "'JetBrains Mono',monospace"}`;

  /* 元絵(無傷のカード)を一度だけオフスクリーンに描き、破片を切り抜く元画像にする */
  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = Math.round(rect.width * dpr);
  srcCanvas.height = Math.round(rect.height * dpr);
  const srcCtx = srcCanvas.getContext("2d");
  srcCtx.scale(dpr, dpr);
  roundRectPath(srcCtx, borderWidth / 2, borderWidth / 2, rect.width - borderWidth, rect.height - borderWidth, radius);
  srcCtx.fillStyle = bg;
  srcCtx.fill();
  srcCtx.lineWidth = borderWidth;
  srcCtx.strokeStyle = borderColor;
  srcCtx.stroke();
  srcCtx.font = font;
  srcCtx.fillStyle = textColor;
  srcCtx.textAlign = "center";
  srcCtx.textBaseline = "middle";
  srcCtx.fillText(word, rect.width / 2, rect.height / 2);

  /* 各接辞の文字数比率の位置で、破片に切り分ける境界線(わずかにギザギザ) */
  let acc = 0;
  const boundaryFracs = [];
  morphemes.slice(0, -1).forEach((m) => {
    acc += (m.part || "").length;
    boundaryFracs.push(acc / word.length);
  });

  const JAG_STEPS = 5;
  const jagPaths = boundaryFracs.map((frac) => {
    const baseX = rect.width * frac;
    const pts = [];
    for (let j = 0; j <= JAG_STEPS; j++) {
      const y = (rect.height / JAG_STEPS) * j;
      const jitter = j === 0 || j === JAG_STEPS ? 0 : (Math.random() - 0.5) * Math.min(rect.width * 0.12, 16);
      pts.push({ x: baseX + jitter, y });
    }
    return pts;
  });
  const leftEdge = [{ x: 0, y: 0 }, { x: 0, y: rect.height }];
  const rightEdge = [{ x: rect.width, y: 0 }, { x: rect.width, y: rect.height }];
  const allBoundaries = [leftEdge, ...jagPaths, rightEdge];

  const shardCount = morphemes.length;
  const cx = rect.width / 2, cy = rect.height / 2;
  const shards = allBoundaries.slice(0, -1).map((leftPath, i) => {
    const rightPath = allBoundaries[i + 1];
    const xs = [...leftPath, ...rightPath].map((p) => p.x);
    const pivotX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const pivotY = rect.height / 2;
    const dir = shardCount > 1 ? (i - (shardCount - 1) / 2) / ((shardCount - 1) / 2) : 0;
    /* 上向き中心に左右へ広がる扇状に、接辞の並び順を反映した角度で吹き飛ばす */
    const angle = -Math.PI / 2 + dir * (Math.PI * 0.4) + (Math.random() - 0.5) * 0.4;
    const speed = 330 + Math.random() * 230;
    return {
      leftPath, rightPath, pivotX, pivotY,
      x: 0, y: 0,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rot: 0,
      vrot: (Math.random() < 0.5 ? -1 : 1) * (240 + Math.random() * 280) * (Math.PI / 180),
      opacity: 1,
    };
  });

  const rootStyle = getComputedStyle(document.documentElement);
  const accentColor = rootStyle.getPropertyValue("--accent-2").trim() || "#E2622F";
  const smokeColor = rootStyle.getPropertyValue("--ink-faint").trim() || "#8A8A8A";

  /* 火の粉 */
  const embers = Array.from({ length: 28 }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 150 + Math.random() * 340;
    return {
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 60,
      r: 1.3 + Math.random() * 2.4,
      lifeMs: 420 + Math.random() * 340,
      hot: Math.random(),
    };
  });

  /* 煙: 重なって塊状の灰色ブロブにならないよう、控えめな数・薄さ・広がりに抑える */
  const smokes = Array.from({ length: 4 }, () => {
    const angle = Math.random() * Math.PI * 2;
    const dist = rect.height * 0.18 + Math.random() * rect.height * 0.22;
    return {
      x: cx + Math.cos(angle) * dist, y: cy + Math.sin(angle) * dist,
      vx: Math.cos(angle) * (14 + Math.random() * 18),
      vy: -(22 + Math.random() * 30),
      r0: 5 + Math.random() * 6,
      grow: 20 + Math.random() * 22,
      delayMs: 90 + Math.random() * 160,
    };
  });

  const SHAKE_MS = 130;
  const FLASH_PEAK_MS = 110;
  const BURST_MS = 700;
  const FADE_FROM = BURST_MS * 0.4;
  const gravity = 640;
  const dt = 1 / 60;
  const start = performance.now();

  return new Promise((resolve) => {
    function frame(now) {
      /* rAFの最初のコールバックのtimestampがperformance.now()より
         わずかに前になることがあるため、経過時間は0未満にならないようクランプする */
      const t = Math.max(0, now - start);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, canvasW, canvasH);

      ctx.save();
      const shakeP = Math.max(0, 1 - t / SHAKE_MS);
      const shakeMag = shakeP * shakeP * 7;
      ctx.translate(
        padX + (Math.random() - 0.5) * shakeMag,
        padTop + (Math.random() - 0.5) * shakeMag
      );

      /* 衝撃波リング */
      const ringP = Math.min(1, t / (BURST_MS * 0.75));
      if (ringP < 1) {
        const ringR = ringP * Math.max(rect.width, rect.height) * 1.35;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = (1 - ringP) * 0.85;
        ctx.strokeStyle = "#fff8e6";
        ctx.lineWidth = Math.max(1, 9 * (1 - ringP));
        ctx.beginPath();
        ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      /* 火球: 中心から白熱→黄→橙→赤へグラデーションする光の玉 */
      const fireGrow = Math.min(1, t / FLASH_PEAK_MS);
      const fireFadeEnd = FLASH_PEAK_MS + BURST_MS * 0.55;
      const fireAlpha = t < FLASH_PEAK_MS ? 1 : Math.max(0, 1 - (t - FLASH_PEAK_MS) / (fireFadeEnd - FLASH_PEAK_MS));
      if (fireAlpha > 0) {
        const fireR = rect.height * (0.5 + fireGrow * 0.85) * (1 + (Math.max(0, t - FLASH_PEAK_MS) / BURST_MS) * 0.7);
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = fireAlpha;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, fireR);
        grad.addColorStop(0, "#ffffff");
        grad.addColorStop(0.16, "#fff6c9");
        grad.addColorStop(0.38, "#ffd25f");
        grad.addColorStop(0.62, accentColor);
        grad.addColorStop(1, "rgba(200,60,20,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, fireR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      /* 破片: 接辞ごとに切り分けたカードの断片が吹き飛ぶ */
      shards.forEach((s) => {
        if (s.opacity <= 0) return;
        s.vy += gravity * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.rot += s.vrot * dt;
        if (t > FADE_FROM) s.opacity = Math.max(0, 1 - (t - FADE_FROM) / (BURST_MS - FADE_FROM));

        ctx.save();
        ctx.globalAlpha = s.opacity;
        ctx.translate(s.pivotX + s.x, s.pivotY + s.y);
        ctx.rotate(s.rot);
        ctx.translate(-s.pivotX, -s.pivotY);
        shardClipPath(ctx, s.leftPath, s.rightPath);
        ctx.clip();
        ctx.drawImage(srcCanvas, 0, 0, srcCanvas.width, srcCanvas.height, 0, 0, rect.width, rect.height);
        if (t < 220) {
          /* 爆発直後は火球の光を浴びて一瞬白飛びする */
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = s.opacity * Math.max(0, 1 - t / 220) * 0.6;
          ctx.fillStyle = "#fff3c4";
          ctx.fillRect(0, 0, rect.width, rect.height);
        }
        ctx.restore();
      });

      /* 火の粉 */
      embers.forEach((e) => {
        if (t > e.lifeMs) return;
        e.vy += gravity * 0.35 * dt;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        const lifeP = t / e.lifeMs;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = Math.max(0, 1 - lifeP);
        const col = e.hot < 0.5 ? "#ffe58a" : "#ff7a3c";
        const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r * 3);
        g.addColorStop(0, col);
        g.addColorStop(1, "rgba(255,120,50,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r * 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      /* 煙: 火球が収まった後、輪郭をぼかして薄く漂わせる(fill+strokeの二重塗りを避け
         隣接する煙同士が重なっても濃い塊にならないよう、ごく低いピーク濃度に抑える) */
      smokes.forEach((sm) => {
        const lt = t - sm.delayMs;
        if (lt < 0) return;
        const p = Math.min(1, lt / (BURST_MS - sm.delayMs));
        sm.x += sm.vx * dt;
        sm.y += sm.vy * dt;
        const r = sm.r0 + sm.grow * p;
        const fadeIn = Math.min(1, lt / 120);
        ctx.save();
        ctx.globalAlpha = Math.max(0, 0.12 * fadeIn * (1 - p));
        const g = ctx.createRadialGradient(sm.x, sm.y, 0, sm.x, sm.y, r);
        g.addColorStop(0, smokeColor);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(sm.x, sm.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      ctx.restore();

      if (t >= BURST_MS) { resolve(); return; }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
}

/* ---- 「マトリックス」アニメーション: 単語カードが上から緑の数字の雨へと
   分解されて消え、続いて接辞カードが数字の雨として降ってきてカードの形へと
   収束する。仕組みはひび割れ/爆発と同じく、無傷の見た目を一度オフスクリーン
   に描いた上で、要素本体はvisibility:hiddenにして隠し、重ねたcanvasだけを見せる ---- */

/* 単語カードを上から順に緑の数字の滝へと置き換えながら消し去る（分解アニメ本体） */
async function runMatrixDissolve(placeholder, word, morphemes, rect) {
  const cs = getComputedStyle(placeholder);
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);

  const padX = 24, padTop = 50, padBottom = 100;
  const canvasW = rect.width + padX * 2;
  const canvasH = rect.height + padTop + padBottom;

  const canvas = document.createElement("canvas");
  canvas.className = "matrix-canvas";
  canvas.style.left = `${-padX}px`;
  canvas.style.top = `${-padTop}px`;
  canvas.width = Math.round(canvasW * dpr);
  canvas.height = Math.round(canvasH * dpr);
  canvas.style.width = `${canvasW}px`;
  canvas.style.height = `${canvasH}px`;

  placeholder.appendChild(canvas);
  placeholder.style.visibility = "hidden";
  canvas.style.visibility = "visible";

  const ctx = canvas.getContext("2d");

  const bg = cs.backgroundColor;
  const borderColor = cs.borderTopColor;
  const borderWidth = parseFloat(cs.borderTopWidth) || 1.5;
  const radius = parseFloat(cs.borderTopLeftRadius) || 12;
  const textColor = cs.color;
  const font = `${cs.fontWeight || 700} ${cs.fontSize || "20px"} ${cs.fontFamily || "'JetBrains Mono',monospace"}`;

  /* 無傷のカードを一度だけオフスクリーンに描き、消去ラインの下側を
     そのまま切り出して見せるための元絵にする */
  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = Math.round(rect.width * dpr);
  srcCanvas.height = Math.round(rect.height * dpr);
  const srcCtx = srcCanvas.getContext("2d");
  srcCtx.scale(dpr, dpr);
  roundRectPath(srcCtx, borderWidth / 2, borderWidth / 2, rect.width - borderWidth, rect.height - borderWidth, radius);
  srcCtx.fillStyle = bg;
  srcCtx.fill();
  srcCtx.lineWidth = borderWidth;
  srcCtx.strokeStyle = borderColor;
  srcCtx.stroke();
  srcCtx.font = font;
  srcCtx.fillStyle = textColor;
  srcCtx.textAlign = "center";
  srcCtx.textBaseline = "middle";
  srcCtx.fillText(word, rect.width / 2, rect.height / 2);

  /* 各接辞の文字数比率の位置で、カードを縦に区切る（crackの境界線と同じ考え方）。
     区切ったセグメントごとに消去の開始時刻をずらすことで、単語全体が
     一斉にではなく接辞ごとに順番に数字の雨へ分解されていくように見せる */
  let acc = 0;
  const boundaryFracs = [];
  morphemes.slice(0, -1).forEach((m) => {
    acc += (m.part || "").length;
    boundaryFracs.push(acc / word.length);
  });
  const fracs = [0, ...boundaryFracs, 1];
  const segments = fracs.slice(0, -1).map((f, i) => ({ xStart: f * rect.width, xEnd: fracs[i + 1] * rect.width }));

  const rainColor = "#39ff6a", rainGlow = "#c9ffda";
  const CELL = 15, TRAIL = 7;
  const colsCount = Math.ceil(rect.width / CELL) + 2;
  const columns = [];
  for (let c = -1; c < colsCount - 1; c++) {
    const x = c * CELL + CELL / 2;
    /* このコラムがどのセグメント（接辞）に属するかを、中心のx座標から決める */
    let segIndex = segments.findIndex((s) => x >= s.xStart && x < s.xEnd);
    if (segIndex === -1) segIndex = x < 0 ? 0 : segments.length - 1;
    columns.push({
      x, segIndex,
      jitter: (Math.random() - 0.5) * 70,
      speed: 620 + Math.random() * 340,
      seed: Math.floor(Math.random() * 999),
    });
  }

  /* セグメント数が多い（＝接辞が多い）ほど全体の再生時間が伸びすぎないよう、
     ずらし幅はセグメント数に応じて少し詰める */
  const SEG_STAGGER = segments.length >= 4 ? 100 : 140;
  const ERASE_MS = 560, TAIL_MS = 420;
  const lastSegDelay = (segments.length - 1) * SEG_STAGGER;
  const TOTAL_MS = lastSegDelay + ERASE_MS + TAIL_MS;
  const easeInQuad = (p) => p * p;

  /* セグメントiの消去進捗と、それに基づく消去ラインの高さ */
  function segState(i, t) {
    const segT = Math.max(0, t - i * SEG_STAGGER);
    const eraseP = Math.min(1, segT / ERASE_MS);
    const boundaryY = -30 + easeInQuad(eraseP) * (rect.height + 60);
    const fade = segT > ERASE_MS ? Math.max(0, 1 - (segT - ERASE_MS) / TAIL_MS) : 1;
    return { segT, boundaryY, fade };
  }

  const start = performance.now();

  return new Promise((resolve) => {
    function frame(now) {
      const t = Math.max(0, now - start);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, canvasW, canvasH);
      ctx.save();
      ctx.translate(padX, padTop);

      /* セグメントごとに、無傷部分の描画・ノイズ帯・消去ラインを個別に描く。
         こうすると各接辞の破片が、自分の番が来るまでは無傷のまま待ち、
         順番が来たら自分の幅の範囲だけ数字の雨へ変わっていくように見える */
      segments.forEach((seg, i) => {
        const { boundaryY, fade } = segState(i, t);
        const segW = seg.xEnd - seg.xStart;

        if (boundaryY < rect.height) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(seg.xStart, Math.max(0, boundaryY), segW, rect.height - Math.max(0, boundaryY));
          ctx.clip();
          ctx.drawImage(srcCanvas, 0, 0, srcCanvas.width, srcCanvas.height, 0, 0, rect.width, rect.height);
          ctx.restore();

          /* ラインのすぐ上、わずかな帯だけ左右にずらしたコピーを重ねて
             デジタルノイズが走っているように見せる */
          const glitchH = 8;
          const gy = Math.max(0, boundaryY - glitchH);
          if (gy < rect.height) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(seg.xStart, gy, segW, Math.min(glitchH, rect.height - gy));
            ctx.clip();
            ctx.globalCompositeOperation = "lighter";
            ctx.globalAlpha = 0.5;
            ctx.drawImage(srcCanvas, 0, 0, srcCanvas.width, srcCanvas.height, -3, 0, rect.width, rect.height);
            ctx.drawImage(srcCanvas, 0, 0, srcCanvas.width, srcCanvas.height, 3, 0, rect.width, rect.height);
            ctx.restore();
          }
        }

        /* 消去ラインの位置を示す、発光する走査線（このセグメントの幅だけ） */
        if (fade > 0 && boundaryY > -10 && boundaryY < rect.height + 10) {
          ctx.save();
          ctx.globalAlpha = fade;
          ctx.shadowColor = rainColor;
          ctx.shadowBlur = 10;
          ctx.strokeStyle = rainGlow;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(seg.xStart, boundaryY);
          ctx.lineTo(seg.xEnd, boundaryY);
          ctx.stroke();
          ctx.restore();
        }
      });

      /* 消去ラインに寄り添いながら緑の数字が滝のように流れ落ちる。
         各コラムは自分が属するセグメントの消去タイミングに従う */
      ctx.font = `700 ${CELL - 2}px 'JetBrains Mono',monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      columns.forEach((col) => {
        const { segT, boundaryY, fade } = segState(col.segIndex, t);
        if (fade <= 0) return;
        const headY = boundaryY + col.jitter + (segT > ERASE_MS ? (segT - ERASE_MS) * col.speed / 1000 : 0);
        for (let k = 0; k < TRAIL; k++) {
          const gy = headY - k * CELL;
          if (gy < -padTop || gy > rect.height + padBottom) continue;
          const a = (1 - k / TRAIL) * fade;
          if (a <= 0.02) continue;
          const digit = (col.seed + k * 7 + Math.floor(t / 70)) % 10;
          ctx.save();
          ctx.globalAlpha = a;
          ctx.fillStyle = k === 0 ? rainGlow : rainColor;
          if (k === 0) { ctx.shadowColor = rainColor; ctx.shadowBlur = 6; }
          ctx.fillText(String(digit), col.x, gy);
          ctx.restore();
        }
      });

      ctx.restore();

      if (t >= TOTAL_MS) { resolve(); return; }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
}

/* 接辞カードが緑の数字の雨として上から降ってきて、数字が定まるにつれて
   実際のカードの見た目へと収束する（単語側の消去演出と対になる、逆方向の演出） */
async function runMatrixTileResolve(el, delayMs) {
  await ensureMorphFontLoaded();
  el.style.position = "relative";
  const rect = { width: el.offsetWidth, height: el.offsetHeight };
  const partEl = el.querySelector(".morph-part");
  const elBox = el.getBoundingClientRect();
  const partBox = partEl ? partEl.getBoundingClientRect() : elBox;
  const partCenterY = partBox.top - elBox.top + partBox.height / 2;

  el.style.visibility = "hidden";
  if (delayMs > 0) await sleep(delayMs);
  if (!el.isConnected) return;

  const cs = getComputedStyle(el);
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const padX = 18, padTop = 60, padBottom = 18;
  const canvasW = rect.width + padX * 2;
  const canvasH = rect.height + padTop + padBottom;

  const canvas = document.createElement("canvas");
  canvas.className = "matrix-canvas";
  canvas.style.left = `${-padX}px`;
  canvas.style.top = `${-padTop}px`;
  canvas.width = Math.round(canvasW * dpr);
  canvas.height = Math.round(canvasH * dpr);
  canvas.style.width = `${canvasW}px`;
  canvas.style.height = `${canvasH}px`;
  el.appendChild(canvas);
  canvas.style.visibility = "visible";
  const ctx = canvas.getContext("2d");

  const bg = cs.backgroundColor;
  const borderColor = cs.borderTopColor;
  const borderWidth = parseFloat(cs.borderTopWidth) || 1.5;
  const radius = parseFloat(cs.borderTopLeftRadius) || 12;
  const textColor = cs.color;
  const partText = partEl ? partEl.textContent : "";
  const partCs = partEl ? getComputedStyle(partEl) : cs;
  const font = `${partCs.fontWeight || 700} ${partCs.fontSize || "20px"} ${partCs.fontFamily || "'JetBrains Mono',monospace"}`;

  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = Math.round(rect.width * dpr);
  srcCanvas.height = Math.round(rect.height * dpr);
  const srcCtx = srcCanvas.getContext("2d");
  srcCtx.scale(dpr, dpr);
  roundRectPath(srcCtx, borderWidth / 2, borderWidth / 2, rect.width - borderWidth, rect.height - borderWidth, radius);
  srcCtx.fillStyle = bg;
  srcCtx.fill();
  srcCtx.lineWidth = borderWidth;
  srcCtx.strokeStyle = borderColor;
  srcCtx.stroke();
  srcCtx.font = font;
  srcCtx.fillStyle = textColor;
  srcCtx.textAlign = "center";
  srcCtx.textBaseline = "middle";
  srcCtx.fillText(partText, rect.width / 2, partCenterY);

  const rainColor = "#39ff6a", rainGlow = "#c9ffda";
  const CELL = 13, TRAIL = 6;
  const colsCount = Math.ceil(rect.width / CELL) + 2;
  /* 収束ラインとは無関係に、各列が独立して上から降り続ける。
     開始位置をカード上端よりさらに上(canvas天井付近)に散らし、
     「数字が外から降ってきてカードの中に入っていく」瞬間から見せる */
  const columns = [];
  for (let c = -1; c < colsCount - 1; c++) {
    columns.push({
      x: c * CELL + CELL / 2,
      headY0: -padTop + Math.random() * padTop * 0.6,
      speed: 300 + Math.random() * 220,
      seed: Math.floor(Math.random() * 999),
    });
  }

  const RESOLVE_MS = 680;
  const easeInOutCubic = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  const start = performance.now();

  await new Promise((resolve) => {
    function frame(now) {
      const t = Math.max(0, now - start);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, canvasW, canvasH);
      ctx.save();
      ctx.translate(padX, padTop);

      const p = Math.min(1, t / RESOLVE_MS);
      const lineY = easeInOutCubic(p) * rect.height;

      /* 収束ラインより上は、すでに定まった実際のカードの見た目 */
      if (lineY > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, rect.width, Math.min(rect.height, lineY));
        ctx.clip();
        ctx.drawImage(srcCanvas, 0, 0, srcCanvas.width, srcCanvas.height, 0, 0, rect.width, rect.height);
        ctx.restore();

        /* ラインのすぐ下、わずかな帯だけ色ズレしたコピーを重ねてノイズを走らせる */
        const glitchH = 6;
        const gy = Math.max(0, lineY - glitchH);
        if (gy < rect.height) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, gy, rect.width, Math.min(glitchH, rect.height - gy));
          ctx.clip();
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = 0.5;
          ctx.drawImage(srcCanvas, 0, 0, srcCanvas.width, srcCanvas.height, -2, 0, rect.width, rect.height);
          ctx.drawImage(srcCanvas, 0, 0, srcCanvas.width, srcCanvas.height, 2, 0, rect.width, rect.height);
          ctx.restore();
        }
      }

      /* 収束ラインを示す、発光する走査線 */
      if (lineY > -10 && lineY < rect.height + 10) {
        ctx.save();
        ctx.globalAlpha = 1 - p * 0.3;
        ctx.shadowColor = rainColor;
        ctx.shadowBlur = 8;
        ctx.strokeStyle = rainGlow;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, lineY);
        ctx.lineTo(rect.width, lineY);
        ctx.stroke();
        ctx.restore();
      }

      /* まだ収束していない下側は、上から降り続ける数字の雨で満たしておく
         （収束ラインより上の確定領域には重ねて描かないようクリップする） */
      if (lineY < rect.height) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, Math.max(0, lineY), rect.width, rect.height - Math.max(0, lineY));
        ctx.clip();
        const fadeIn = Math.min(1, t / 90);
        ctx.font = `700 ${CELL - 2}px 'JetBrains Mono',monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        columns.forEach((col) => {
          const head = col.headY0 + (t * col.speed) / 1000;
          for (let k = 0; k < TRAIL; k++) {
            const gy = head - k * CELL;
            if (gy < -padTop || gy > rect.height) continue;
            const a = (1 - k / TRAIL) * fadeIn;
            if (a <= 0.02) continue;
            const digit = (col.seed + k * 7 + Math.floor(t / 60)) % 10;
            ctx.save();
            ctx.globalAlpha = a;
            ctx.fillStyle = k === 0 ? rainGlow : rainColor;
            if (k === 0) { ctx.shadowColor = rainColor; ctx.shadowBlur = 5; }
            ctx.fillText(String(digit), col.x, gy);
            ctx.restore();
          }
        });
        ctx.restore();
      }

      ctx.restore();

      if (t >= RESOLVE_MS) { resolve(); return; }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });

  canvas.remove();
  el.style.visibility = "visible";
}

/* ---- 「プリズム」アニメーション: 単語カードに白色光が差し込み、プリズムのように
   七色へ分光しながら砕け、万華鏡状に対称なスペクトル粒子となって拡散して消える。
   続く接辞カードは、外側の万華鏡から粒子が渦を巻いて収束し、ずれていた七色の像が
   重なり合って一枚の像を結ぶ（分光の逆再生）。
   仕組みは他のスタイルと同じく、無傷の見た目を一度オフスクリーンに描いた上で、
   要素本体はvisibility:hiddenにして隠し、重ねたcanvasだけを見せる ---- */

/* プリズムが白色光を分解したときの七色帯。分光ゴーストの着色に使う。
   彩度を大きく抑えたくすみ寄りの色で、加算合成で重ねても
   派手なネオンにならない、控えめな発色にしている */
const PRISM_BANDS = [
  "hsl(355,38%,78%)", "hsl(32,38%,76%)", "hsl(50,38%,78%)", "hsl(140,32%,74%)",
  "hsl(195,32%,76%)", "hsl(228,32%,78%)", "hsl(280,32%,80%)",
];
const prismEaseOut = (p) => 1 - Math.pow(1 - p, 3);
const prismEaseInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

/* 発光粒子のスプライトは色相ごとに一度だけ描いてキャッシュする。
   粒子ごとにグラデーションやshadowBlurを作ると数百個描いた時点で破綻するため、
   出来合いの画像をdrawImageで貼るだけにして毎フレームのコストを抑える */
const PRISM_HUE_STEPS = 18;
const prismSpriteCache = new Array(PRISM_HUE_STEPS).fill(null);
let prismFlashCache = null;

function prismGlowSprite(hue) {
  const step = 360 / PRISM_HUE_STEPS;
  const idx = ((Math.round(hue / step) % PRISM_HUE_STEPS) + PRISM_HUE_STEPS) % PRISM_HUE_STEPS;
  if (prismSpriteCache[idx]) return prismSpriteCache[idx];
  const size = 64;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const h = idx * step;
  /* 彩度を35%程度まで抑え、中心の不透明度も1未満にして、
     加算合成で重なっても白飛びしない、控えめな光にする */
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, `hsla(${h},35%,90%,.7)`);
  grad.addColorStop(0.2, `hsla(${h},35%,80%,.52)`);
  grad.addColorStop(0.52, `hsla(${h},35%,70%,.16)`);
  grad.addColorStop(1, `hsla(${h},35%,66%,0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  prismSpriteCache[idx] = c;
  return c;
}

/* 分光した光が一点で再合成される瞬間の白い閃光 */
function prismFlashSprite() {
  if (prismFlashCache) return prismFlashCache;
  const size = 128;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.18, "rgba(255,255,255,.85)");
  grad.addColorStop(0.45, "rgba(214,236,255,.28)");
  grad.addColorStop(1, "rgba(190,220,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  prismFlashCache = c;
  return c;
}

/* 無傷のカードの見た目をオフスクリーンに一度だけ描き出す（分光・粒子化の元絵）。
   filled=false では地の塗りを省いて枠線と文字だけにする。小さい接辞カードでは
   塗りごと7枚を加算合成すると中が真っ白に飛んでしまうため、そちらを使う */
function prismRenderCard(cs, text, textCs, rect, textCenterY, dpr, filled = true) {
  const c = document.createElement("canvas");
  c.width = Math.round(rect.width * dpr);
  c.height = Math.round(rect.height * dpr);
  const g = c.getContext("2d");
  g.scale(dpr, dpr);
  const borderWidth = parseFloat(cs.borderTopWidth) || 1.5;
  const radius = parseFloat(cs.borderTopLeftRadius) || 12;
  roundRectPath(g, borderWidth / 2, borderWidth / 2, rect.width - borderWidth, rect.height - borderWidth, radius);
  if (filled) {
    g.fillStyle = cs.backgroundColor;
    g.fill();
  }
  g.lineWidth = borderWidth;
  g.strokeStyle = cs.borderTopColor;
  g.stroke();
  g.font = `${textCs.fontWeight || 700} ${textCs.fontSize || "20px"} ${textCs.fontFamily || "'JetBrains Mono',monospace"}`;
  g.fillStyle = textCs.color || cs.color;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, rect.width / 2, textCenterY);
  return c;
}

/* カード画像を1色に染めた複製（分光ゴーストの素材）。
   これらをlighterで重ねると、ズレのない位置では元の白色光に戻る。
   solid=false: multiplyで着色したあとdestination-inで元のアルファを塗り直す。
     地の塗りがある単語カードでは、文字や枠の濃淡を残したまま色が乗る。
   solid=true: source-inで形だけ残して色を置き換える。枠線と文字だけの像は
     元の色が濃く、multiplyでは暗く濁ってしまうため、こちらで発色させる */
function prismTintedCopy(src, color, solid = false) {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const g = c.getContext("2d");
  g.drawImage(src, 0, 0);
  if (solid) {
    g.globalCompositeOperation = "source-in";
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    return c;
  }
  g.globalCompositeOperation = "multiply";
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = "destination-in";
  g.drawImage(src, 0, 0);
  return c;
}

/* 単語カードが白色光で分光し、七色の像へ割れたのち、
   万華鏡状のスペクトル粒子となって飛散する（分解アニメ本体） */
async function runPrismDissolve(placeholder, word, morphemes, rect) {
  const cs = getComputedStyle(placeholder);
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);

  /* 粒子が万華鏡状に大きく広がるため、余白はカードの実寸に比例して広く取る */
  const padX = Math.max(160, rect.width * 1.05);
  const padY = Math.max(150, rect.height * 3.2);
  const canvasW = rect.width + padX * 2;
  const canvasH = rect.height + padY * 2;

  const canvas = document.createElement("canvas");
  canvas.className = "prism-canvas";
  canvas.style.left = `${-padX}px`;
  canvas.style.top = `${-padY}px`;
  canvas.width = Math.round(canvasW * dpr);
  canvas.height = Math.round(canvasH * dpr);
  canvas.style.width = `${canvasW}px`;
  canvas.style.height = `${canvasH}px`;

  placeholder.appendChild(canvas);
  placeholder.style.visibility = "hidden";
  canvas.style.visibility = "visible";

  const ctx = canvas.getContext("2d");
  const radius = parseFloat(cs.borderTopLeftRadius) || 12;
  const srcCanvas = prismRenderCard(cs, word, cs, rect, rect.height / 2, dpr);
  const ghosts = PRISM_BANDS.map((color) => prismTintedCopy(srcCanvas, color));

  const cx = rect.width / 2, cy = rect.height / 2;
  const DISP_ANG = 0.36;          // 分散軸の傾き（プリズムを透過した光が開く向き）
  const KSECTORS = 6;             // 万華鏡の対称数
  /* 光の届く半径は「カード中心からcanvasの縁までの最短距離」で頭打ちにする。
     これを超えると扇や暗幕がcanvasの縁で直線に切れて、四角い切り口が見えてしまう */
  const reach = Math.min(padX + cx, padY + cy);
  const flashSprite = prismFlashSprite();

  /* 加算合成のスペクトルは明るい紙の上では白く飛んでしまうため、
     カードの周囲だけをうっすらと落とす。純黒に近い暗幕は淡い色調と
     組み合わさるとコントラストが強すぎて目に刺さるため、
     グレーがかった浅い幕にとどめている */
  const dimGrad = ctx.createRadialGradient(cx, cy, rect.height * 0.18, cx, cy, reach);
  dimGrad.addColorStop(0, "rgba(40,44,54,1)");
  dimGrad.addColorStop(0.55, "rgba(40,44,54,.7)");
  dimGrad.addColorStop(1, "rgba(40,44,54,0)");

  const T_SPLIT0 = 200;           // 分光が始まる
  const T_SPLIT1 = 640;           // 七色が開ききる
  const T_BEAM = 300;             // 白色光が走査しきる
  const T_BURST = 580;            // 最初のセグメントが砕け散り始める

  /* 各接辞の文字数比率の位置で、カードを縦にセグメント分けする
     （matrix/crackの境界線と同じ考え方）。セグメントごとに砕ける時刻を
     ずらすことで、単語全体が一斉にではなく接辞ごとに順番に砕けていく
     ように見せる */
  let acc = 0;
  const boundaryFracs = [];
  morphemes.slice(0, -1).forEach((m) => {
    acc += (m.part || "").length;
    boundaryFracs.push(acc / word.length);
  });
  const fracs = [0, ...boundaryFracs, 1];
  const segments = fracs.slice(0, -1).map((f, i) => ({ xStart: f * rect.width, xEnd: fracs[i + 1] * rect.width }));
  const SEG_STAGGER = segments.length >= 4 ? 90 : 130;
  const lastBurstT = T_BURST + (segments.length - 1) * SEG_STAGGER;
  const T_FADE = lastBurstT + 600;    // 全体が消え始める
  const TOTAL_MS = lastBurstT + 880;

  /* 生成位置はカード面上に散らし、中心から見た方角で色相を決める。
     同じ方角の粒子が同じ色になるので、放射状に虹が並ぶ。
     どのセグメント（接辞）の上に生まれたかで、砕け始める時刻を決める */
  const parts = [];
  for (let i = 0; i < 96; i++) {
    const px = Math.random() * rect.width;
    const py = Math.random() * rect.height;
    const ang = Math.atan2(py - cy, px - cx) + (Math.random() - 0.5) * 0.35;
    const speed = 70 + Math.random() * 240;
    const shard = Math.random() < 0.42;
    let segIndex = segments.findIndex((s) => px >= s.xStart && px < s.xEnd);
    if (segIndex === -1) segIndex = px < 0 ? 0 : segments.length - 1;
    parts.push({
      x: px, y: py,
      vx: Math.cos(ang) * speed * (1 + Math.random() * 0.5),
      vy: Math.sin(ang) * speed * 0.85 - Math.random() * 40,
      hue: ((ang * 180) / Math.PI + 360) % 360,
      size: shard ? 3 + Math.random() * 6 : 5 + Math.random() * 10,
      shard,
      rot: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 7,
      delay: Math.random() * 220,
      life: 620 + Math.random() * 430,
      mirror: Math.random() < 0.55,   // 万華鏡側にも複製するか
      burstT: T_BURST + segIndex * SEG_STAGGER,
    });
  }

  /* 速度に指数減衰（空気抵抗）をかけた位置を閉じた式で求める。
     毎フレーム積分しないので、フレームレートが揺れても軌道が変わらない */
  const TAU = 0.42;
  function drawParticle(p, t, mul) {
    const lt = t - p.burstT - p.delay;
    if (lt <= 0) return;
    const lp = lt / p.life;
    if (lp >= 1) return;
    const s = lt / 1000;
    const travel = TAU * (1 - Math.exp(-s / TAU));
    const x = p.x + p.vx * travel;
    const y = p.y + p.vy * travel + 65 * s * s;
    const a = Math.min(1, lt / 90) * Math.pow(1 - lp, 1.6) * mul;
    if (a <= 0.02) return;
    const hue = p.hue + t * 0.05;
    if (p.shard) {
      /* ガラスの破片: 細長い菱形。lighter合成で縁が発光して見える */
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(x, y);
      ctx.rotate(p.rot + p.spin * s);
      ctx.fillStyle = `hsl(${hue % 360},35%,82%)`;
      ctx.beginPath();
      ctx.moveTo(0, -p.size * 1.9);
      ctx.lineTo(p.size * 0.5, 0);
      ctx.lineTo(0, p.size * 1.9);
      ctx.lineTo(-p.size * 0.5, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else {
      const r = p.size * (1 + lp * 1.1);
      ctx.globalAlpha = a * 0.95;
      ctx.drawImage(prismGlowSprite(hue), x - r, y - r, r * 2, r * 2);
    }
  }

  const start = performance.now();

  return new Promise((resolve) => {
    function frame(now) {
      const t = Math.max(0, now - start);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, canvasW, canvasH);
      ctx.save();
      ctx.translate(padX, padY);

      const outFade = t < T_FADE ? 1 : Math.max(0, 1 - (t - T_FADE) / (TOTAL_MS - T_FADE));

      /* 0) 周囲を落とす暗幕。粒子が痩せていくのに合わせて先に幕を上げないと、
            光が消えたあとに灰色の膜だけが残って見える */
      const stage = Math.min(1, Math.max(0, (t - 120) / 320))
        * (t < 900 ? 1 : Math.max(0, 1 - (t - 900) / 480));
      const dimA = stage * 0.38 * outFade;
      if (dimA > 0.01) {
        ctx.save();
        ctx.globalAlpha = dimA;
        ctx.fillStyle = dimGrad;
        ctx.fillRect(-padX, -padY, canvasW, canvasH);
        ctx.restore();
      }


      /* 2) カード本体と、分散軸に沿って扇状に開いていく七色のゴースト。
            分光の開始・破裂のタイミングをセグメント（接辞）ごとにずらし、
            単語全体が一斉にではなく接辞ごとに順番に崩れていくようにする。
            セグメントのx範囲でクリップして描くので、まだ自分の番が来ていない
            接辞は無傷のまま残り、番が来た接辞だけが分光・分散していく */
      segments.forEach((seg, i) => {
        const segT0 = T_SPLIT0 + i * SEG_STAGGER;
        const segT1 = T_SPLIT1 + i * SEG_STAGGER;
        const segBurstT = T_BURST + i * SEG_STAGGER;
        const sp = t <= segT0 ? 0 : Math.min(1, (t - segT0) / (segT1 - segT0));
        const disp = prismEaseOut(sp) * (18 + rect.width * 0.06);
        const segW = seg.xEnd - seg.xStart;

        const baseA = (1 - sp) * outFade;
        if (baseA > 0.01) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(seg.xStart, 0, segW, rect.height);
          ctx.clip();
          ctx.globalAlpha = baseA;
          ctx.drawImage(srcCanvas, 0, 0, srcCanvas.width, srcCanvas.height, 0, 0, rect.width, rect.height);
          ctx.restore();
        }
        const ghostA = Math.min(1, sp * 2.1)
          * (t > segBurstT ? Math.max(0, 1 - (t - segBurstT) / 340) : 1) * outFade;
        if (ghostA > 0.01) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(seg.xStart, 0, segW, rect.height);
          ctx.clip();
          ctx.globalCompositeOperation = "lighter";
          ghosts.forEach((gc, k) => {
            const o = k - (ghosts.length - 1) / 2;
            ctx.save();
            ctx.globalAlpha = ghostA * 0.42;
            ctx.translate(cx + Math.cos(DISP_ANG) * o * disp, cy + Math.sin(DISP_ANG) * o * disp);
            ctx.rotate(o * 0.02 * sp);
            const sc = 1 + Math.abs(o) * 0.012 * sp;
            ctx.scale(sc, sc);
            ctx.drawImage(gc, 0, 0, gc.width, gc.height, -cx, -cy, rect.width, rect.height);
            ctx.restore();
          });
          ctx.restore();
        }
      });

      /* 3) カードを斜めに横切る入射光。カードの角丸で切り抜いて内側だけ光らせる */
      if (t < T_BEAM + 150) {
        const bp = Math.min(1, t / T_BEAM);
        const beamA = (1 - Math.max(0, (t - T_BEAM) / 150)) * outFade;
        if (beamA > 0.01) {
          ctx.save();
          roundRectPath(ctx, 0, 0, rect.width, rect.height, radius);
          ctx.clip();
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = beamA;
          ctx.translate(cx, cy);
          ctx.rotate(-0.42);
          const span = rect.width * 1.5 + rect.height;
          const bx = -span / 2 + bp * span;
          const bw = 30;
          const grad = ctx.createLinearGradient(bx - bw, 0, bx + bw, 0);
          grad.addColorStop(0, "rgba(255,255,255,0)");
          grad.addColorStop(0.5, "rgba(255,255,255,.85)");
          grad.addColorStop(1, "rgba(255,255,255,0)");
          ctx.fillStyle = grad;
          ctx.fillRect(bx - bw, -span, bw * 2, span * 2);
          ctx.restore();
        }
      }

      /* 4) 各セグメント（接辞）が砕ける瞬間の閃光。セグメントごとに
            タイミングをずらし、その場所だけで光るようにする */
      segments.forEach((seg, i) => {
        const rw = t - (T_BURST + i * SEG_STAGGER);
        if (rw <= -70 || rw >= 300) return;
        const fa = (rw < 0 ? (rw + 70) / 70 : Math.max(0, 1 - rw / 300)) * outFade;
        if (fa <= 0.01) return;
        const segCx = (seg.xStart + seg.xEnd) / 2;
        const segW = Math.max(seg.xEnd - seg.xStart, rect.height * 0.6);
        const fr = segW * 0.55 * (1 + Math.max(0, rw) / 300);
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = fa * 0.65;
        ctx.drawImage(flashSprite, segCx - fr, cy - fr, fr * 2, fr * 2);
        ctx.restore();
      });

      /* 5) スペクトル粒子。中心まわりに回転・鏡像を重ねて万華鏡の対称模様にする。
            反射コピーは淡くして、本体の粒子が埋もれないようにする */
      if (t > T_BURST) {
        const kaleido = Math.min(1, Math.max(0, (t - T_BURST - 120) / 380));
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        parts.forEach((p) => drawParticle(p, t, outFade));
        if (kaleido > 0.01) {
          ctx.translate(cx, cy);
          for (let k = 1; k < KSECTORS; k++) {
            ctx.save();
            ctx.rotate((k * Math.PI * 2) / KSECTORS);
            if (k % 2 === 1) ctx.scale(1, -1);
            ctx.translate(-cx, -cy);
            parts.forEach((p) => { if (p.mirror) drawParticle(p, t, kaleido * 0.5 * outFade); });
            ctx.restore();
          }
        }
        ctx.restore();
      }

      ctx.restore();

      if (t >= TOTAL_MS) { resolve(); return; }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
}

/* 接辞カードが、外側の万華鏡から渦を巻いて集まるスペクトル粒子として現れ、
   ずれていた七色の像が一点で重なって像を結ぶ（単語側の分光と対になる逆再生） */
async function runPrismTileResolve(el, delayMs) {
  await ensureMorphFontLoaded();
  el.style.position = "relative";
  const rect = { width: el.offsetWidth, height: el.offsetHeight };
  const partEl = el.querySelector(".morph-part");
  const elBox = el.getBoundingClientRect();
  const partBox = partEl ? partEl.getBoundingClientRect() : elBox;
  const partCenterY = partBox.top - elBox.top + partBox.height / 2;

  el.style.visibility = "hidden";
  if (delayMs > 0) await sleep(delayMs);
  if (!el.isConnected) return;

  const cs = getComputedStyle(el);
  const partCs = partEl ? getComputedStyle(partEl) : cs;
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);

  const padX = Math.max(110, rect.width * 0.95);
  const padY = Math.max(95, rect.height * 1.7);
  const canvasW = rect.width + padX * 2;
  const canvasH = rect.height + padY * 2;

  const canvas = document.createElement("canvas");
  canvas.className = "prism-canvas";
  canvas.style.left = `${-padX}px`;
  canvas.style.top = `${-padY}px`;
  canvas.width = Math.round(canvasW * dpr);
  canvas.height = Math.round(canvasH * dpr);
  canvas.style.width = `${canvasW}px`;
  canvas.style.height = `${canvasH}px`;
  el.appendChild(canvas);
  canvas.style.visibility = "visible";

  const ctx = canvas.getContext("2d");
  const radius = parseFloat(cs.borderTopLeftRadius) || 12;
  const partText = partEl ? partEl.textContent : "";
  const srcCanvas = prismRenderCard(cs, partText, partCs, rect, partCenterY, dpr);
  /* ゴーストは地の塗りを抜いた枠線＋文字だけの像から作る。
     接辞カードは小さく像の重なりが深いので、塗りごと加算すると中身が白く飛ぶ */
  const inkCanvas = prismRenderCard(cs, partText, partCs, rect, partCenterY, dpr, false);
  const ghosts = PRISM_BANDS.map((color) => prismTintedCopy(inkCanvas, color, true));

  const cx = rect.width / 2, cy = rect.height / 2;
  const DISP_ANG = 0.36;
  const KSECTORS = 6;
  const flashSprite = prismFlashSprite();

  /* カード周りだけを浅く落とす暗幕。接辞カードは隣り合って同時に動くので、
     暗幕が重なっても斑にならないよう単語側より弱く・狭くかける */
  const reach = Math.min(padX + cx, padY + cy);
  const dimGrad = ctx.createRadialGradient(cx, cy, rect.height * 0.2, cx, cy, reach);
  dimGrad.addColorStop(0, "rgba(40,44,54,1)");
  dimGrad.addColorStop(0.5, "rgba(40,44,54,.62)");
  dimGrad.addColorStop(1, "rgba(40,44,54,0)");

  const T_GHOST0 = 120;           // 七色の像が寄り始める
  const T_LAND = 620;             // 像が一点で重なる（結像の瞬間）
  const TOTAL_MS = 840;

  /* 外周からカード中心へ、渦を巻きながら収束する粒子。
     湧き出す半径はcanvasに収まる範囲で頭打ちにする。これを超えると
     粒子がcanvasの縁で直線に切り落とされ、四角い切り口が見えてしまう
     （軌道はカードの縦横比に合わせて横1.3倍・縦0.82倍の楕円） */
  const maxR = Math.min((padX + cx) / 1.3, (padY + cy) / 0.82) * 0.95;
  const parts = [];
  for (let i = 0; i < 84; i++) {
    const ang0 = Math.random() * Math.PI * 2;
    const shard = Math.random() < 0.4;
    parts.push({
      ang0,
      r0: 45 + Math.random() * Math.max(25, maxR - 45),
      swirl: (0.7 + Math.random() * 1.5) * (Math.random() < 0.5 ? -1 : 1),
      hue: ((ang0 * 180) / Math.PI + 360) % 360,
      size: shard ? 3 + Math.random() * 5 : 4 + Math.random() * 8,
      shard,
      spin: (Math.random() - 0.5) * 8,
      delay: Math.random() * 170,
      dur: 430 + Math.random() * 190,
      mirror: Math.random() < 0.55,
    });
  }

  function drawParticle(p, t, mul) {
    const lt = t - p.delay;
    if (lt <= 0) return;
    const q = Math.min(1, lt / p.dur);
    /* 収束するほど半径が縮み、同時に角度が回る。カードの縦横比に合わせて楕円軌道にする */
    const r = p.r0 * Math.pow(1 - q, 1.4);
    const ang = p.ang0 + p.swirl * q;
    const x = cx + Math.cos(ang) * r * 1.3;
    const y = cy + Math.sin(ang) * r * 0.82;
    /* 着地間際で素早く消し、粒子がカードの中に吸い込まれたように見せる */
    const a = Math.min(1, lt / 90) * (q < 0.8 ? 1 : Math.max(0, (1 - q) / 0.2)) * mul;
    if (a <= 0.02) return;
    const hue = p.hue + t * 0.08;
    if (p.shard) {
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(x, y);
      ctx.rotate(ang + p.spin * (lt / 1000));
      ctx.fillStyle = `hsl(${hue % 360},35%,84%)`;
      ctx.beginPath();
      ctx.moveTo(0, -p.size * 1.8);
      ctx.lineTo(p.size * 0.5, 0);
      ctx.lineTo(0, p.size * 1.8);
      ctx.lineTo(-p.size * 0.5, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else {
      const rr = p.size * (1 + (1 - q) * 0.9);
      ctx.globalAlpha = a * 0.95;
      ctx.drawImage(prismGlowSprite(hue), x - rr, y - rr, rr * 2, rr * 2);
    }
  }

  const start = performance.now();

  await new Promise((resolve) => {
    function frame(now) {
      const t = Math.max(0, now - start);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, canvasW, canvasH);
      ctx.save();
      ctx.translate(padX, padY);

      /* 0) 周囲を浅く落とす暗幕。結像したら速やかに引き上げる */
      const dimA = Math.min(1, t / 200)
        * (t < T_LAND - 120 ? 1 : Math.max(0, 1 - (t - (T_LAND - 120)) / 260)) * 0.2;
      if (dimA > 0.01) {
        ctx.save();
        ctx.globalAlpha = dimA;
        ctx.fillStyle = dimGrad;
        ctx.fillRect(-padX, -padY, canvasW, canvasH);
        ctx.restore();
      }

      /* 1) 万華鏡から渦を巻いて集まる粒子（結像後は急速に消える） */
      const partMul = t < T_LAND ? 1 : Math.max(0, 1 - (t - T_LAND) / 180);
      if (partMul > 0.01) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        parts.forEach((p) => drawParticle(p, t, partMul));
        ctx.translate(cx, cy);
        for (let k = 1; k < KSECTORS; k++) {
          ctx.save();
          ctx.rotate((k * Math.PI * 2) / KSECTORS);
          if (k % 2 === 1) ctx.scale(1, -1);
          ctx.translate(-cx, -cy);
          parts.forEach((p) => { if (p.mirror) drawParticle(p, t, partMul * 0.5); });
          ctx.restore();
        }
        ctx.restore();
      }

      /* 2) 七色の像が分散軸に沿って寄り集まり、重なるほど白く戻っていく */
      const gp = t <= T_GHOST0 ? 0 : Math.min(1, (t - T_GHOST0) / (T_LAND - T_GHOST0));
      const disp = (1 - prismEaseInOut(gp)) * (13 + rect.width * 0.05);
      const ghostA = Math.min(1, (t - T_GHOST0) / 120) * (1 - Math.pow(gp, 3) * 0.4);
      if (gp > 0 && ghostA > 0.01) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ghosts.forEach((gc, k) => {
          const o = k - (ghosts.length - 1) / 2;
          ctx.save();
          ctx.globalAlpha = ghostA * 0.6;
          ctx.translate(cx + Math.cos(DISP_ANG) * o * disp, cy + Math.sin(DISP_ANG) * o * disp);
          ctx.rotate(o * 0.02 * (1 - gp));
          ctx.drawImage(gc, 0, 0, gc.width, gc.height, -cx, -cy, rect.width, rect.height);
          ctx.restore();
        });
        ctx.restore();
      }

      /* 3) 結像したカード本体。像が重なるにつれて実体化する */
      const baseA = Math.max(0, Math.min(1, (t - (T_LAND - 260)) / 300));
      if (baseA > 0.01) {
        ctx.save();
        ctx.globalAlpha = baseA;
        ctx.drawImage(srcCanvas, 0, 0, srcCanvas.width, srcCanvas.height, 0, 0, rect.width, rect.height);
        ctx.restore();
      }

      /* 4) 結像の瞬間の閃光と、カード面を走り抜ける虹の一閃 */
      const fw = t - T_LAND;
      if (fw > -90 && fw < 240) {
        const fa = fw < 0 ? (fw + 90) / 90 : Math.max(0, 1 - fw / 240);
        if (fa > 0.01) {
          const fr = rect.width * 0.45 * (1 + Math.max(0, fw) / 260);
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = fa * 0.52;
          ctx.drawImage(flashSprite, cx - fr, cy - fr, fr * 2, fr * 2);
          /* 結像の瞬間だけ横一文字に走るレンズの光条 */
          const lw = rect.width * (1.25 + Math.max(0, fw) / 240);
          const lh = Math.max(2.5, 12 * (1 - Math.max(0, fw) / 240));
          ctx.globalAlpha = fa * 0.58;
          ctx.drawImage(flashSprite, cx - lw, cy - lh, lw * 2, lh * 2);
          ctx.restore();
        }
      }
      if (fw > -40 && fw < 260) {
        const wp = Math.min(1, Math.max(0, (fw + 40) / 300));
        ctx.save();
        roundRectPath(ctx, 0, 0, rect.width, rect.height, radius);
        ctx.clip();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = (1 - wp) * 0.55;
        ctx.translate(cx, cy);
        ctx.rotate(-0.42);
        const span = rect.width * 1.5 + rect.height;
        const bx = -span / 2 + wp * span;
        const bw = 22;
        const grad = ctx.createLinearGradient(bx - bw, 0, bx + bw, 0);
        grad.addColorStop(0, "rgba(225,210,215,0)");
        grad.addColorStop(0.3, "rgba(230,220,200,.4)");
        grad.addColorStop(0.5, "rgba(255,255,255,.6)");
        grad.addColorStop(0.7, "rgba(205,220,225,.4)");
        grad.addColorStop(1, "rgba(215,205,220,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(bx - bw, -span, bw * 2, span * 2);
        ctx.restore();
      }

      ctx.restore();

      if (t >= TOTAL_MS) { resolve(); return; }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });

  canvas.remove();
  el.style.visibility = "visible";
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
    /* 単語ブロックが実際にガラスのように砕け、破片が物理的に飛び散る */
    async intro(placeholder, word, morphemes) {
      if (reducedMotion()) return;
      await ensureMorphFontLoaded();

      placeholder.classList.remove("word-pulse");
      /* word-pulse解除でmax-widthが150pxに縮むと長い単語が2行に折り返り、
         幅の割合だけで算出する亀裂の位置がずれるため、計測前に1行表示・広めの幅に固定する */
      placeholder.style.whiteSpace = "nowrap";
      placeholder.style.maxWidth = window.innerWidth >= 860 ? "min(60vw, 620px)" : "min(90vw, 320px)";
      /* getBoundingClientRect()は、出現時の pop アニメーション(transform:scale(.5→1))が
         再生中だと縮小された見た目のサイズを返してしまう。offsetWidth/offsetHeightは
         transformの影響を受けないレイアウト上の実寸なので、こちらを使う */
      const rect = { width: placeholder.offsetWidth, height: placeholder.offsetHeight };
      placeholder.style.position = "relative";
      await runCrackShatter(placeholder, word, morphemes, rect);
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
    /* 単語ブロックが接辞ごとの破片になり、火球・衝撃波・火の粉とともに爆発する */
    async intro(placeholder, word, morphemes) {
      if (reducedMotion()) return;
      await ensureMorphFontLoaded();

      placeholder.classList.remove("word-pulse");
      /* word-pulse解除でmax-widthが150pxに縮むと長い単語が2行に折り返り、
         幅の割合だけで算出する破片境界の位置がずれるため、計測前に1行表示・広めの幅に固定する */
      placeholder.style.whiteSpace = "nowrap";
      placeholder.style.maxWidth = window.innerWidth >= 860 ? "min(60vw, 620px)" : "min(90vw, 320px)";
      const rect = { width: placeholder.offsetWidth, height: placeholder.offsetHeight };
      placeholder.style.position = "relative";
      await runBurstExplosion(placeholder, word, morphemes, rect);
    },
  },

  matrix: {
    label: "マトリックス",
    tileClass: "matrix-in",
    tileVars() {
      return {};
    },
    /* 単語ブロックが接辞ごとに順番に、上から緑の数字の雨へと分解されて消え去る */
    async intro(placeholder, word, morphemes) {
      if (reducedMotion()) return;
      await ensureMorphFontLoaded();

      placeholder.classList.remove("word-pulse");
      placeholder.style.whiteSpace = "nowrap";
      placeholder.style.maxWidth = window.innerWidth >= 860 ? "min(60vw, 620px)" : "min(90vw, 320px)";
      const rect = { width: placeholder.offsetWidth, height: placeholder.offsetHeight };
      placeholder.style.position = "relative";
      await runMatrixDissolve(placeholder, word, morphemes, rect);
    },
    /* 接辞カードが数字の雨として降ってきて、カードの形へ収束する */
    mountTile(el, i) {
      if (reducedMotion()) return;
      runMatrixTileResolve(el, i * 110);
    },
  },

  prism: {
    label: "プリズム",
    tileClass: "prism-in",
    tileVars() {
      return {};
    },
    /* 単語ブロックが白色光で七色に分光し、接辞ごとに順番に
       万華鏡状のスペクトル粒子となって砕け散る */
    async intro(placeholder, word, morphemes) {
      if (reducedMotion()) return;
      await ensureMorphFontLoaded();

      placeholder.classList.remove("word-pulse");
      placeholder.style.whiteSpace = "nowrap";
      placeholder.style.maxWidth = window.innerWidth >= 860 ? "min(60vw, 620px)" : "min(90vw, 320px)";
      const rect = { width: placeholder.offsetWidth, height: placeholder.offsetHeight };
      placeholder.style.position = "relative";
      await runPrismDissolve(placeholder, word, morphemes, rect);
    },
    /* 接辞カードが万華鏡から渦を巻いて集まり、七色の像が重なって結像する */
    mountTile(el, i) {
      if (reducedMotion()) return;
      runPrismTileResolve(el, i * 120);
    },
  },
};

/* 設定で「ランダム」が選ばれている場合、実行のたびに実在のスタイルから1つ抽選する */
function resolveAnimStyle(key) {
  if (key === "random") {
    const keys = Object.keys(DECOMPOSE_ANIM_STYLES);
    return DECOMPOSE_ANIM_STYLES[keys[Math.floor(Math.random() * keys.length)]];
  }
  return DECOMPOSE_ANIM_STYLES[key] || DECOMPOSE_ANIM_STYLES.crack;
}

function affixCardHtml(m) {
  return `<div class="m">${escapeHtml(m.part)}${m.phonetic ? `<span class="phonetic">[${escapeHtml(m.phonetic)}]</span>` : ""}</div>
      <div class="mean">${escapeHtml(m.meaning)}（${escapeHtml(m.origin)}）</div>`;
}

/* 単語の意味カードの下に、同義語・対義語をタップ可能なチップとして表示する */
function buildWordRelatedChip(word) {
  const chip = document.createElement("button");
  chip.className = "word-related-chip";
  chip.type = "button";
  chip.textContent = word;
  chip.addEventListener("click", () => startDecompose(word));
  return chip;
}

/* コンテナの横幅に収まる分のチップだけを残し、その行に入りきらない
   チップは削除する（折り返して次の行に侵食しないようにするため）。
   呼び出し時点でまだ画面が非表示で幅が測れないことがあるため、
   実際に幅が測れるようになるまで数フレームだけ再試行する */
function fitRowChips(container, attemptsLeft = 10) {
  const available = container.clientWidth;
  if (!available) {
    if (attemptsLeft > 0) requestAnimationFrame(() => fitRowChips(container, attemptsLeft - 1));
    return;
  }
  const gap = 6;
  let used = -gap;
  [...container.children].forEach((chip) => {
    used += gap + chip.offsetWidth;
    if (used > available) chip.remove();
  });
}

/* screen-result（"word-"接頭辞）とscreen-word-detail（"word-detail-"接頭辞）の
   両方から、同じ同義語・対義語カードの描画を共有する */
function renderWordRelatedCard(synonyms, antonyms, idPrefix = "word") {
  const cardEl = document.getElementById(`${idPrefix}-related-card`);
  const synonymsRow = document.getElementById(`${idPrefix}-synonyms-row`);
  const synonymsChips = document.getElementById(`${idPrefix}-synonyms-chips`);
  const antonymsRow = document.getElementById(`${idPrefix}-antonyms-row`);
  const antonymsChips = document.getElementById(`${idPrefix}-antonyms-chips`);

  synonymsChips.innerHTML = "";
  (synonyms || []).forEach((w) => synonymsChips.appendChild(buildWordRelatedChip(w)));
  synonymsRow.style.display = synonyms && synonyms.length ? "flex" : "none";

  antonymsChips.innerHTML = "";
  (antonyms || []).forEach((w) => antonymsChips.appendChild(buildWordRelatedChip(w)));
  antonymsRow.style.display = antonyms && antonyms.length ? "flex" : "none";

  cardEl.style.display = (synonyms && synonyms.length) || (antonyms && antonyms.length) ? "flex" : "none";

  fitRowChips(synonymsChips);
  fitRowChips(antonymsChips);
}

/* ---- 接辞カード（タップで同じ接辞を含む単語一覧へ） ---- */
async function renderResultScreen() {
  const wordMeaningEl = document.getElementById("word-meaning");
  if (currentWordMeaning) {
    const phoneticHtml = currentWordPhonetic ? `<span class="phonetic">[${escapeHtml(currentWordPhonetic)}]</span>` : "";
    wordMeaningEl.innerHTML = `
      <div class="word-meaning-word-row">
        <span class="word-meaning-word">${escapeHtml(currentWord)}${phoneticHtml}</span>
        <button class="word-speak-btn" type="button" aria-label="英単語を読み上げ">${speakerIconHtml()}</button>
      </div>
      <div class="word-meaning-text">${escapeHtml(currentWordMeaning)}</div>`;
    wordMeaningEl.style.display = "block";
    const speakBtn = wordMeaningEl.querySelector(".word-speak-btn");
    speakBtn.addEventListener("click", () => {
      speakBtn.classList.add("speaking");
      speak(currentWord, () => speakBtn.classList.remove("speaking"), "en-US");
    });
  } else {
    wordMeaningEl.innerHTML = "";
    wordMeaningEl.style.display = "none";
  }
  renderWordRelatedCard(currentSynonyms, currentAntonyms);

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
    card.className = "affix-card tappable";
    card.innerHTML = affixCardHtml(m);
    card.addEventListener("click", () => openAffixWordsScreen(m, currentWord, "screen-result"));
    list.appendChild(card);
  });

  await refreshSaveWordBtn();
}

/* ---- 語呂合わせ候補（タップ=読み上げ / 保存） ---- */
async function loadGoroCandidates(provider, apiKey) {
  /* 再生成の場合、直前の候補は気に入らなかったということなので、
     同じような内容を繰り返さないようAIに明示的に伝える */
  const previousTexts = currentCandidates.map((c) => c.text).filter(Boolean);
  try {
    currentCandidates = await generateGoro(currentWord, currentMorphemes, provider, apiKey, currentWordMeaning, previousTexts, (phrase) => reportGoroStatus("goro-list", phrase));
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

/* 語呂合わせカードを編集状態に切り替える。生成結果はだいたい良くても
   一語だけ直したいことがあるため、作り直しや自作をやり直させるのではなく
   その場で手を入れられるようにする */
function startGoroEdit(card, idx) {
  const original = currentCandidates[idx].text;
  card.classList.add("editing");
  card.innerHTML = `
    <textarea class="goro-edit-input" rows="2" aria-label="語呂合わせを編集">${escapeHtml(original)}</textarea>
    <div class="goro-edit-actions">
      <button class="goro-edit-cancel" type="button">取消</button>
      <button class="goro-edit-save" type="button">保存</button>
    </div>`;

  const input = card.querySelector(".goro-edit-input");
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);

  const close = async (text) => {
    if (text !== null) {
      currentCandidates[idx] = { text, highlight: [] };
    }
    renderGoroList();
    await refreshSaveWordBtn();
  };
  const commit = () => {
    const text = input.value.trim();
    close(text && text !== original ? text : null);
  };

  card.querySelector(".goro-edit-save").addEventListener("click", commit);
  card.querySelector(".goro-edit-cancel").addEventListener("click", () => close(null));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commit(); }
    if (e.key === "Escape") close(null);
  });
}

function renderGoroList() {
  const list = document.getElementById("goro-list");
  list.innerHTML = "";
  currentCandidates.forEach((c, idx) => {
    const card = document.createElement("div");
    card.className = "goro-card";
    card.dataset.idx = idx;
    card.innerHTML = `
      <div class="goro-body"><span class="txt">${escapeHtml(c.text)}</span></div>
      <button class="goro-edit-btn" type="button" title="編集" aria-label="語呂合わせを編集">${pencilIconHtml()}</button>`;
    list.appendChild(card);

    card.querySelector(".goro-edit-btn").addEventListener("click", () => startGoroEdit(card, idx));
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
    await deleteWordRecord(id);
  } else {
    const provider = await getActiveProvider();
    await saveWordRecord({
      id,
      word: currentWord,
      word_meaning: currentWordMeaning,
      word_phonetic: currentWordPhonetic,
      word_memory_tip: currentMemoryTip,
      morphemes: currentMorphemes,
      synonyms: currentSynonyms,
      antonyms: currentAntonyms,
      goro_text: newGoroText,
      goro_highlight: c ? c.highlight : [],
      provider,
      memorized: existing ? existing.memorized : false,
      created_at: existing ? existing.created_at : Date.now(),
    });
    /* ユーザーが良いと判断して保存した語呂合わせを、今後の①Few-shot例・
       ③マンネリ検出の材料として蓄積する。保存操作の成否には影響させない */
    loadApiKey(provider)
      .then((apiKey) => growGoroCorpusFromSave(currentWord, currentWordMeaning, newGoroText, currentMorphemes, provider, apiKey))
      .catch((err) => console.warn("語呂合わせコーパスへの追加に失敗しました（スキップします）:", err));
  }
  await refreshSaveWordBtn();
}

document.getElementById("save-word-btn").addEventListener("click", toggleSaveWord);

document.getElementById("regen-btn").addEventListener("click", async () => {
  const provider = await getActiveProvider();
  const apiKey = await loadApiKey(provider);
  if (!apiKey) {
    homeError.textContent = "設定画面でAPIキーを登録してください";
    showScreen("screen-settings");
    refreshUsageDisplay();
    return;
  }
  document.getElementById("regen-btn").disabled = true;
  reportGoroStatus("goro-list", "語呂合わせを作り直し中");
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
  const memorizedPct = rows.length ? Math.round((memorizedCount / rows.length) * 100) : 0;
  document.getElementById("book-stats").textContent =
    `全${rows.length}語 ・ 暗記済み${memorizedCount}（${memorizedPct}%） ・ 未暗記${rows.length - memorizedCount}`;

  if (!rows.length) { listEl.innerHTML = `<div class="empty-note">まだ記録がありません</div>`; return; }
  rows.forEach((r) => {
    const title = r.memorized ? `✓ ${r.word}` : r.word;
    const row = buildBookRow(title, r.word_phonetic || "", r.word_meaning || "", r.created_at, () => openWordDetail(r), async () => {
      await deleteWordRecord(r.id);
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
  for (const r of records) await saveWordRecord(r);
  toast(`${records.length}件の単語を読み込みました`);
  renderBookList();
});

/* 単語帳の1件をタップした際に、単語・意味・接辞・接辞の意味・語呂合わせをまとめて表示する */
function renderWordDetailGoro(record) {
  const goroList = document.getElementById("word-detail-goro");
  goroList.innerHTML = "";
  if (record.goro_text) {
    const card = document.createElement("div");
    card.className = "goro-card";
    card.innerHTML = `<div class="goro-body"><span class="txt">${escapeHtml(record.goro_text)}</span></div>`;
    goroList.appendChild(card);
  } else {
    goroList.innerHTML = `<div class="empty-note">語呂合わせは登録されていません</div>`;
  }
}

let currentWordDetailRecord = null;

function openWordDetail(record) {
  currentWordDetailRecord = record;

  const meaningEl = document.getElementById("word-detail-meaning");
  const phoneticHtml = record.word_phonetic ? `<span class="phonetic">[${escapeHtml(record.word_phonetic)}]</span>` : "";
  const meaningTextHtml = record.word_meaning ? `<div class="word-meaning-text">${escapeHtml(record.word_meaning)}</div>` : "";
  meaningEl.innerHTML = `<div class="word-meaning-word">${escapeHtml(record.word)}${phoneticHtml}</div>${meaningTextHtml}`;
  meaningEl.style.display = "block";

  renderWordRelatedCard(record.synonyms, record.antonyms, "word-detail");

  const affixList = document.getElementById("word-detail-affixes");
  affixList.innerHTML = "";
  (record.morphemes || []).forEach((m) => {
    const card = document.createElement("div");
    card.className = "affix-card tappable";
    card.innerHTML = affixCardHtml(m);
    card.addEventListener("click", () => openAffixWordsScreen(m, record.word, "screen-word-detail"));
    affixList.appendChild(card);
  });
  if (!affixList.children.length) {
    affixList.innerHTML = `<div class="empty-note">接辞の記録がありません</div>`;
  }

  const memoryTipEl = document.getElementById("word-detail-memory-tip");
  memoryTipEl.textContent = record.word_memory_tip || "";
  memoryTipEl.style.display = record.word_memory_tip ? "block" : "none";

  renderWordDetailGoro(record);

  showScreen("screen-word-detail");
}

document.getElementById("word-detail-regen-btn").addEventListener("click", async () => {
  const record = currentWordDetailRecord;
  if (!record) return;

  const provider = await getActiveProvider();
  const apiKey = await loadApiKey(provider);
  if (!apiKey) {
    homeError.textContent = "設定画面でAPIキーを登録してください";
    showScreen("screen-settings");
    refreshUsageDisplay();
    return;
  }

  const btn = document.getElementById("word-detail-regen-btn");
  btn.disabled = true;
  reportGoroStatus("word-detail-goro", "語呂合わせを作り直し中");

  try {
    const candidates = await generateGoro(record.word, record.morphemes || [], provider, apiKey, record.word_meaning, [record.goro_text].filter(Boolean), (phrase) => reportGoroStatus("word-detail-goro", phrase));
    const c = candidates[0];
    record.goro_text = c.text;
    record.goro_highlight = c.highlight || [];
    await saveWordRecord(record);
    renderWordDetailGoro(record);
  } catch (err) {
    document.getElementById("word-detail-goro").innerHTML =
      `<div class="empty-note">語呂合わせの生成に失敗しました（${err.message}）。もう一度お試しください。</div>`;
    console.error(err);
  }
  btn.disabled = false;
});

/* ---- 接辞タップ → 同じ接辞を含む単語一覧（マイ単語→AI検索の順） ---- */
const RELATED_WORDS_TARGET = 20;

function relatedWordsPrompt(morpheme, excludeWords, count) {
  return [
    "あなたは英語の語彙・語源の専門家です。",
    `接頭辞・語根・接尾辞のいずれかとして "${morpheme.part}"（読み: ${morpheme.reading}、意味: ${morpheme.meaning}、由来: ${morpheme.origin}）を含む、実在する英単語を探してください。`,
    `次の単語は候補から除外してください（既出のため）: ${excludeWords.length ? excludeWords.join(", ") : "なし"}`,
    `実在する一般的な英単語を、見つかる限り多く、最大${count}件挙げてください。${count}件に満たない場合は見つかった分だけで構いません。`,
    "各単語は小文字の英字のみで構成される、実在の一般的な英単語にしてください（固有名詞・造語・除外リストの単語は不可）。",
    "各単語について、国際音声記号による発音記号（phonetic、IPA表記、スラッシュや括弧は付けない）と、日本語での簡潔な意味（meaning）も必ず付けてください。",
    "出力は次のJSON形式のみを返してください。それ以外の文章は一切書かないでください。",
    '{"words":[{"word":"portable","phonetic":"ˈpɔːrtəbl","meaning":"持ち運びできる"}]}',
  ].join("\n");
}

async function findRelatedWordsViaAI(morpheme, excludeWords, count, provider, apiKey) {
  try {
    const sys = relatedWordsPrompt(morpheme, excludeWords, count);
    const json = await callAI(provider, apiKey, sys, "実在する単語をJSON形式で出力してください。", 0.5);
    const words = Array.isArray(json.words) ? json.words : [];
    const excludeLower = new Set(excludeWords.map((w) => w.toLowerCase()));
    const seen = new Set();
    return words
      .map((w) => (w && typeof w === "object" ? w : { word: w }))
      .map((w) => ({
        word: typeof w.word === "string" ? w.word.trim() : "",
        phonetic: typeof w.phonetic === "string" ? w.phonetic.trim() : "",
        meaning: typeof w.meaning === "string" ? w.meaning.trim() : "",
      }))
      .filter((w) => /^[A-Za-z][A-Za-z'-]*$/.test(w.word))
      .filter((w) => {
        const lower = w.word.toLowerCase();
        if (excludeLower.has(lower) || seen.has(lower)) return false;
        seen.add(lower);
        return true;
      })
      .slice(0, count);
  } catch (err) {
    console.warn("AI関連単語検索に失敗:", err);
    return [];
  }
}

function buildRelatedWordButton(entry) {
  const { word, phonetic, meaning } = entry;
  const btn = document.createElement("button");
  btn.className = "related-word-btn";
  btn.type = "button";
  const phoneticHtml = phonetic ? `<span class="phonetic">[${escapeHtml(phonetic)}]</span>` : "";
  const meaningHtml = meaning ? `<div class="rw-mean">${escapeHtml(meaning)}</div>` : "";
  btn.innerHTML = `<div class="rw-word">${escapeHtml(word)}${phoneticHtml}</div>${meaningHtml}`;
  btn.addEventListener("click", () => startDecompose(word));
  return btn;
}

let affixWordsReturnScreen = "screen-result";
let affixWordsRequestId = 0;

async function openAffixWordsScreen(morpheme, sourceWord, returnScreenId) {
  const requestId = ++affixWordsRequestId;
  affixWordsReturnScreen = returnScreenId || "screen-result";

  const cardEl = document.getElementById("affix-words-card");
  cardEl.innerHTML = "";
  const card = document.createElement("div");
  card.className = "affix-card";
  card.innerHTML = affixCardHtml(morpheme);
  cardEl.appendChild(card);

  const part = (morpheme.part || "").toLowerCase();
  const allWords = await idbGetAll("words");
  const localRecords = allWords
    .filter((r) => (r.morphemes || []).some((m) => (m.part || "").toLowerCase() === part))
    .filter((r) => !sourceWord || r.word.toLowerCase() !== sourceWord.toLowerCase())
    .sort((a, b) => b.created_at - a.created_at);
  const localMatches = localRecords.map((r) => ({ word: r.word, phonetic: r.word_phonetic || "", meaning: r.word_meaning || "" }));
  const localWords = localRecords.map((r) => r.word);

  const listEl = document.getElementById("affix-words-list");
  listEl.innerHTML = "";
  localMatches.forEach((entry) => listEl.appendChild(buildRelatedWordButton(entry)));

  showScreen("screen-affix-words");

  const remaining = RELATED_WORDS_TARGET - localMatches.length;
  if (remaining <= 0) return;

  const provider = await getActiveProvider();
  const apiKey = await loadApiKey(provider);
  if (requestId !== affixWordsRequestId) return;
  if (!apiKey) {
    if (!localMatches.length) {
      listEl.innerHTML = `<div class="empty-note">この接辞を含む保存済みの単語はありません（設定画面でAPIキーを登録すると他の単語もAIで検索できます）</div>`;
    }
    return;
  }

  const loadingEl = document.createElement("div");
  loadingEl.className = "empty-note";
  loadingEl.innerHTML = `AIで検索中<span class="goro-loading-dots" aria-hidden="true"></span>`;
  listEl.appendChild(loadingEl);

  const exclude = [sourceWord, ...localWords].filter(Boolean);
  const aiWords = await findRelatedWordsViaAI(morpheme, exclude, remaining, provider, apiKey);
  if (requestId !== affixWordsRequestId) return;
  loadingEl.remove();

  aiWords.forEach((entry) => listEl.appendChild(buildRelatedWordButton(entry)));

  if (!localMatches.length && !aiWords.length) {
    listEl.innerHTML = `<div class="empty-note">この接辞を含む単語は見つかりませんでした</div>`;
  }
}

document.getElementById("affix-words-back-btn").addEventListener("click", () => {
  showScreen(affixWordsReturnScreen);
});

function buildBookRow(title, phonetic, sub, createdAt, onTap, onDelete) {
  const wrap = document.createElement("div");
  wrap.className = "book-row";
  const date = new Date(createdAt);
  const dateStr = `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
  const phoneticHtml = phonetic ? `<span class="phonetic">[${escapeHtml(phonetic)}]</span>` : "";
  const subHtml = sub ? `<div class="g">${escapeHtml(sub)}</div>` : "";
  wrap.innerHTML = `
    <div class="del-reveal">🗑 削除</div>
    <div class="row-body">
      <div><div class="w">${escapeHtml(title)}${phoneticHtml}</div>${subHtml}</div>
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

let memorizeRandomOrder = true;
async function loadMemorizeRandomSetting() {
  memorizeRandomOrder = await kvGet("memorize_random", true);
}
loadMemorizeRandomSetting();

function renderMemorizeRandomToggle() {
  const btn = document.getElementById("memorize-random-toggle");
  btn.textContent = memorizeRandomOrder ? "オン" : "オフ";
  btn.classList.toggle("on", memorizeRandomOrder);
}
document.getElementById("memorize-random-toggle").addEventListener("click", async (e) => {
  e.stopPropagation();
  memorizeRandomOrder = !memorizeRandomOrder;
  await kvSet("memorize_random", memorizeRandomOrder);
  renderMemorizeRandomToggle();
});

/* 自動再生モードの再生速度（表面表示→裏返し→次のカードへ進むまでの
   待ち時間の基準値を、この倍率で割ったものを実際の待ち時間として使う） */
const MEMORIZE_REVEAL_DELAY = 1800;
const MEMORIZE_ADVANCE_DELAY = 3800;
const MEMORIZE_SPEED_STEPS = [1, 1.5, 2, 0.5];
let memorizeAutoSpeed = 1;
async function loadMemorizeAutoSpeedSetting() {
  memorizeAutoSpeed = await kvGet("memorize_auto_speed", 1);
}
loadMemorizeAutoSpeedSetting();

function renderMemorizeSpeedBtn() {
  document.getElementById("memorize-speed-btn").textContent = `${memorizeAutoSpeed}x`;
}
document.getElementById("memorize-speed-btn").addEventListener("click", async () => {
  const idx = MEMORIZE_SPEED_STEPS.indexOf(memorizeAutoSpeed);
  memorizeAutoSpeed = MEMORIZE_SPEED_STEPS[(idx + 1) % MEMORIZE_SPEED_STEPS.length];
  await kvSet("memorize_auto_speed", memorizeAutoSpeed);
  renderMemorizeSpeedBtn();
});

/* 自動再生モード中、現在のカードの表示サイクル(表→裏→次のカードへ)の
   進み具合をシークバーとして表示する */
let memorizeSeekRAF = null;
let memorizeCardCycleStart = 0;
function startMemorizeSeekBar() {
  cancelMemorizeSeekBar();
  memorizeCardCycleStart = performance.now();
  const totalMs = (MEMORIZE_REVEAL_DELAY + MEMORIZE_ADVANCE_DELAY) / memorizeAutoSpeed;
  const fillEl = document.getElementById("memorize-seek-fill");
  function tick() {
    const elapsed = performance.now() - memorizeCardCycleStart;
    const pct = Math.max(0, Math.min(100, (elapsed / totalMs) * 100));
    fillEl.style.width = `${pct}%`;
    if (pct < 100 && memorizeAutoPlay) memorizeSeekRAF = requestAnimationFrame(tick);
  }
  memorizeSeekRAF = requestAnimationFrame(tick);
}
function cancelMemorizeSeekBar() {
  if (memorizeSeekRAF) { cancelAnimationFrame(memorizeSeekRAF); memorizeSeekRAF = null; }
}

const memorizeModeSheet = document.getElementById("memorize-mode-sheet");
document.getElementById("memorize-entry-btn").addEventListener("click", () => {
  renderMemorizeRandomToggle();
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
  memorizeQueue = memorizeRandomOrder ? pool.sort(() => Math.random() - 0.5) : pool.sort((a, b) => b.created_at - a.created_at);
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
  const hintEl = document.getElementById("memorize-hint");
  const actionsEl = document.getElementById("memorize-actions");

  if (!memorizeQueue.length) {
    clearMemorizeAutoTimer();
    cancelMemorizeSeekBar();
    emptyEl.textContent = memorizeEmptyMessage;
    emptyEl.style.display = "flex";
    swipeEl.style.display = "none";
    hintEl.style.display = "none";
    actionsEl.style.display = "none";
    progressEl.textContent = "";
    return;
  }
  if (memorizeIndex >= memorizeQueue.length) {
    clearMemorizeAutoTimer();
    cancelMemorizeSeekBar();
    emptyEl.innerHTML = "";
    const msgEl = document.createElement("div");
    msgEl.textContent = "お疲れさまでした！全カードをチェックしました。";
    emptyEl.appendChild(msgEl);
    const finishBtn = document.createElement("button");
    finishBtn.type = "button";
    finishBtn.className = "memorize-finish-btn";
    finishBtn.textContent = "終了";
    finishBtn.addEventListener("click", () => {
      renderBookList();
      showScreen("screen-book");
    });
    emptyEl.appendChild(finishBtn);
    emptyEl.style.display = "flex";
    swipeEl.style.display = "none";
    hintEl.style.display = "none";
    actionsEl.style.display = "none";
    progressEl.textContent = "";
    return;
  }

  emptyEl.style.display = "none";
  swipeEl.style.display = "block";
  /* 自動再生中はタップ/スワイプ操作の説明文は不要なので表示しない */
  hintEl.style.display = memorizeAutoPlay ? "none" : "block";
  /* 自動再生中はマルバツボタンも表示しない */
  actionsEl.style.display = memorizeAutoPlay ? "none" : "flex";
  progressEl.textContent = `${memorizeIndex + 1} / ${memorizeQueue.length}`;

  const record = memorizeQueue[memorizeIndex];
  memorizeRevealed = false;

  const card = document.getElementById("memorize-card");
  const cardInner = document.getElementById("memorize-card-inner");
  card.classList.toggle("memorized-tag", !!record.memorized);
  /* 新しいカードに切り替える瞬間は、直前のカードのスワイプ/裏返しの状態を
     アニメーションなしで一旦リセットする */
  card.style.transition = "none";
  cardInner.style.transition = "none";
  card.style.transform = "translateX(0)";
  card.style.opacity = "1";
  card.classList.remove("flipped");
  document.getElementById("memorize-reveal").classList.remove("reveal-left", "reveal-right");

  const wordEl = document.getElementById("memorize-word");
  wordEl.textContent = record.word;

  const detailEl = document.getElementById("memorize-detail");
  detailEl.innerHTML = "";

  const extraEl = document.getElementById("memorize-extra");
  extraEl.innerHTML = "";
  extraEl.classList.remove("show");
  extraEl.style.display = "none";

  resizeMemorizeCard(document.getElementById("memorize-face-front-content"));
  /* リセット直後に transition を戻し、以降の裏返し操作はアニメーションさせる */
  requestAnimationFrame(() => {
    card.style.transition = "";
    cardInner.style.transition = "";
  });

  if (memorizeSpeechOn) speak(record.word, null, "en-US");

  const autoplayBar = document.getElementById("memorize-autoplay-bar");
  if (memorizeAutoPlay) {
    renderMemorizeSpeedBtn();
    autoplayBar.style.display = "flex";
    startMemorizeSeekBar();
  } else {
    autoplayBar.style.display = "none";
    cancelMemorizeSeekBar();
  }

  scheduleMemorizeAutoPlay();
}

/* カードの高さを表示中の面の実際のコンテンツ高さに合わせる。
   表と裏で高さが異なっても、裏返しアニメーションと同時に滑らかに
   高さも変化するため、周囲の要素が瞬間的にずれることがない */
function resizeMemorizeCard(faceEl) {
  const card = document.getElementById("memorize-card");
  card.style.height = `${Math.max(320, faceEl.offsetHeight)}px`;
}

function scheduleMemorizeAutoPlay() {
  clearMemorizeAutoTimer();
  if (!memorizeAutoPlay) return;
  if (!memorizeQueue.length || memorizeIndex >= memorizeQueue.length) return;
  memorizeAutoTimer = setTimeout(revealMemorizeDetail, MEMORIZE_REVEAL_DELAY / memorizeAutoSpeed);
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
    tile.className = `morph shatter-in${morphTileClass(m.part)}`;
    tile.style.animationDelay = `${i * 0.08}s`;
    tile.innerHTML = `<div class="morph-part">${escapeHtml(m.part)}</div><div class="morph-meaning show">${escapeHtml(m.meaning || "")}</div>`;
    splitEl.appendChild(tile);
  });
  detailEl.appendChild(splitEl);

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
    goroCard.innerHTML = `<div class="goro-body"><span class="txt">${escapeHtml(record.goro_text)}</span></div>`;
    extraEl.appendChild(goroCard);
  }
  const hasExtra = extraEl.children.length > 0;
  extraEl.style.display = hasExtra ? "flex" : "none";

  /* 裏面のコンテンツ高さに合わせてカードの高さを変化させつつ、裏返す */
  resizeMemorizeCard(document.getElementById("memorize-face-back-content"));
  document.getElementById("memorize-card").classList.add("flipped");
  if (hasExtra) requestAnimationFrame(() => extraEl.classList.add("show"));

  if (memorizeSpeechOn && record.word_meaning) {
    speak(record.word_meaning);
  }
  if (memorizeAutoPlay) {
    clearMemorizeAutoTimer();
    memorizeAutoTimer = setTimeout(advanceMemorizeAutoPlay, MEMORIZE_ADVANCE_DELAY / memorizeAutoSpeed);
  }
}

/* 裏面を表示中に再タップされた時、表面(単語のみ)に戻す */
function hideMemorizeDetail() {
  if (!memorizeRevealed) return;
  const record = memorizeQueue[memorizeIndex];
  if (!record) return;
  memorizeRevealed = false;
  clearMemorizeAutoTimer();

  resizeMemorizeCard(document.getElementById("memorize-face-front-content"));
  document.getElementById("memorize-card").classList.remove("flipped");

  /* 接辞を踏まえた一文・語呂合わせは、一度裏返して表示させたら
     表に戻しても表示したままにしておく */

  if (memorizeSpeechOn) speak(record.word, null, "en-US");

  scheduleMemorizeAutoPlay();
}

async function classifyMemorizeCard(memorized) {
  const record = memorizeQueue[memorizeIndex];
  if (!record) return;
  clearMemorizeAutoTimer();
  record.memorized = memorized;
  await saveWordRecord(record);

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
const PROVIDER_LABELS = { groq: "Groq", sakura: "さくらのAI" };
let activeProvider = "sakura";

async function initSettingsScreen() {
  activeProvider = await getActiveProvider();
  document.querySelectorAll(".provider-pill").forEach((p) => {
    p.classList.toggle("on", p.dataset.provider === activeProvider);
  });
  document.getElementById("key-label").textContent = `${PROVIDER_LABELS[activeProvider]} API キー`;
  document.getElementById("api-key-input").value = await loadApiKey(activeProvider);
  document.getElementById("gemini-api-key-input").value = await loadApiKey("gemini");
  await refreshUsageDisplay();

  document.querySelectorAll("#anim-toggle-row .mode-pill").forEach((p) => {
    p.classList.toggle("on", p.dataset.animToggle === (animationsEnabled ? "on" : "off"));
  });

  const ragOn = await isRagEnabled();
  document.querySelectorAll("#rag-toggle-row .mode-pill").forEach((p) => {
    p.classList.toggle("on", p.dataset.ragToggle === (ragOn ? "on" : "off"));
  });

  const activeAnim = await kvGet("decompose_anim", "random");
  document.querySelectorAll(".anim-pill").forEach((p) => {
    p.classList.toggle("on", p.dataset.anim === activeAnim);
  });

  renderModePills(await kvGet("theme_mode", "light"));
  renderThemeSwatches(await kvGet("theme_color", "blue"));

  await refreshVoiceEngineUI();
  await refreshTtsSpeakerUI();
  await initGoogleAuth();
}

/* ------------------------------------------------------------------ *
 * 12d. 読み上げの声（さくらのAI TTS）
 * ------------------------------------------------------------------ */
const TTS_PREVIEW_TEXT = "軸にイオンがぶつかり電気あり。";

/* 実際に鳴った話者だけを候補として残す。/v1/models に載っていることも、
   IDの綴りが正しいことも、その話者を使える保証にはならない（規約に
   同意していない話者は 400 "This model is not available." になる）ため、
   一度鳴らしてみた結果だけを信用する */
const BROWSER_VOICE_OPTION = { id: "", label: "ブラウザ標準（APIを使わない）" };
const TTS_PROBE_TEXT = "テスト";

async function loadKnownGoodSpeakers() {
  const saved = await kvGet("tts_speakers_ok", null);
  const confirmed = TTS_SPEAKERS.filter((s) => TTS_SPEAKERS_CONFIRMED.includes(s.id));
  if (!Array.isArray(saved)) return confirmed;
  /* 検出が通信エラーなどで一度でも空振りすると、確認済みの話者まで候補から
     消えてブラウザ標準に落ちたまま戻らなくなる。確認済みの話者は検出結果に
     関わらず候補に残し、鳴らなかった場合は再生時のフォールバックに任せる */
  const savedIds = new Set(saved.map((s) => normalizeSpeakerId(s && s.id)));
  return confirmed.filter((s) => !savedIds.has(normalizeSpeakerId(s.id))).concat(saved);
}

/* 候補を1つずつ鳴らしてみて、成功したものだけを残す。規約に同意して
   いない話者は弾かれるので、結果がそのまま「今使える話者」になる */
async function detectUsableSpeakers(endpoint, apiKey, onProgress) {
  const ids = await fetchModelIds(endpoint, apiKey);
  const byNormalized = new Map(ids.map((id) => [normalizeSpeakerId(id), id]));
  /* 一覧が取れた場合はそこに載っているIDを優先し、取れなければ
     既知の綴りをそのまま試す */
  const candidates = TTS_SPEAKERS.map((s) => ({
    id: byNormalized.get(normalizeSpeakerId(s.id)) || s.id,
    label: s.label,
  }));

  const usable = [];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (onProgress) onProgress(i + 1, candidates.length, c.label);
    try {
      const res = await requestTtsAudio(endpoint, apiKey, c.id, TTS_PROBE_TEXT);
      if (res.ok) {
        /* 鳴らせることの確認が目的なので、音声そのものは捨てる */
        await res.arrayBuffer().catch(() => {});
        usable.push(c);
      } else {
        console.info(`TTS: ${c.label}(${c.id}) は利用できません`, await extractErrorDetail(res));
      }
    } catch (err) {
      console.warn(`TTS: ${c.label}(${c.id}) の確認に失敗しました`, err);
    }
  }
  await kvSet("tts_speakers_ok", usable);
  return usable;
}

async function refreshTtsSpeakerUI() {
  const select = document.getElementById("tts-speaker-select");
  const note = document.getElementById("tts-note");
  const detectBtn = document.getElementById("tts-detect-btn");
  const provider = await getActiveProvider();
  const endpoint = TTS_ENDPOINTS[provider];
  const apiKey = endpoint ? await loadApiKey(provider) : "";
  /* 未設定(null)と「ブラウザ標準を明示的に選んだ」("")を区別する。
     既定はずんだもんだが、自分でブラウザ標準を選んだ場合はそれを尊重する */
  const chosen = await kvGet("tts_speaker", null);

  if (!apiKey) {
    select.innerHTML = "";
    select.appendChild(new Option(BROWSER_VOICE_OPTION.label, ""));
    select.value = "";
    select.disabled = true;
    detectBtn.disabled = true;
    note.textContent = "APIキーを保存すると、使える話者を調べられるようになります。";
    return;
  }

  const speakers = await loadKnownGoodSpeakers();
  select.disabled = false;
  detectBtn.disabled = false;
  select.innerHTML = "";
  for (const s of [BROWSER_VOICE_OPTION].concat(speakers)) select.appendChild(new Option(s.label, s.id));

  /* 使えなくなった話者が保存されたままだと鳴らない声を選び続けることになるので、
     候補に無ければ既定のずんだもんへ戻す（APIの綴り揺れも吸収する）。
     ずんだもんすら候補に無いときだけブラウザ標準に落とす */
  const available = new Set(speakers.map((s) => s.id));
  const defaultSpeaker = speakers.find(
    (s) => normalizeSpeakerId(s.id) === normalizeSpeakerId(TTS_SPEAKER_DEFAULT)
  );
  const fallback = defaultSpeaker ? defaultSpeaker.id : "";
  select.value = chosen === "" ? "" : (chosen && available.has(chosen) ? chosen : fallback);
  if (select.value !== chosen) await kvSet("tts_speaker", select.value);

  note.textContent = speakers.length
    ? "日本語の読み上げにVOICEVOXを使います（英単語はVOICEVOXが日本語専用のため端末の音声のまま）。他の話者は、コントロールパネルで利用規約に同意したうえで「話者を調べる」を押すと追加されます。"
    : "使える話者がありません。VOICEVOXの話者は、さくらのクラウドのコントロールパネルで「AI Engine」→「利用可能な音声モデル」から話者ごとに利用規約へ同意しないと使えません。";
}

document.getElementById("tts-speaker-select").addEventListener("change", async (e) => {
  await kvSet("tts_speaker", e.target.value);
});

document.getElementById("tts-detect-btn").addEventListener("click", async () => {
  const btn = document.getElementById("tts-detect-btn");
  const note = document.getElementById("tts-note");
  const provider = await getActiveProvider();
  const endpoint = TTS_ENDPOINTS[provider];
  const apiKey = endpoint ? await loadApiKey(provider) : "";
  if (!apiKey) { note.textContent = "先にAPIキーを保存してください。"; return; }

  btn.disabled = true;
  try {
    const usable = await detectUsableSpeakers(endpoint, apiKey, (done, total, label) => {
      note.textContent = `確認中… ${done}/${total}（${label}）`;
    });
    await refreshTtsSpeakerUI();
    if (!usable.length) {
      note.textContent = "使える話者は見つかりませんでした。さくらのクラウドのコントロールパネルで「AI Engine」→「利用可能な音声モデル」から利用規約に同意すると使えるようになります。";
    }
  } catch (err) {
    console.warn("TTS speaker detection failed:", err);
    note.textContent = `話者の確認に失敗しました（${err.message}）。`;
  }
  btn.disabled = false;
});

document.getElementById("tts-preview-btn").addEventListener("click", async () => {
  const btn = document.getElementById("tts-preview-btn");
  const note = document.getElementById("tts-note");
  const speaker = document.getElementById("tts-speaker-select").value;
  if (!speaker) { speak(TTS_PREVIEW_TEXT); return; }

  const provider = await getActiveProvider();
  const endpoint = TTS_ENDPOINTS[provider];
  const apiKey = endpoint ? await loadApiKey(provider) : "";
  if (!apiKey) { note.textContent = "先にAPIキーを保存してください。"; return; }

  btn.disabled = true;
  note.textContent = "試聴を生成中…";
  try {
    /* ここでは speak() を通さない。フォールバックが働くと、鳴った声が
       さくらのAIのものかブラウザのものか区別できず、確認にならないため */
    stopSpeaking();
    const url = await fetchTtsAudioUrl(endpoint, apiKey, speaker, TTS_PREVIEW_TEXT);
    const audio = new Audio(url);
    currentTtsAudio = audio;
    await audio.play();
    note.textContent = "✓ この声で読み上げます。";
  } catch (err) {
    console.warn("TTS preview failed:", err);
    const hint = ttsErrorHint(err);
    note.textContent = hint || `試聴に失敗しました（${err.message}）。別の話者を選ぶか、APIキーをご確認ください。`;
  }
  btn.disabled = false;
});

document.querySelectorAll("#anim-toggle-row .mode-pill").forEach((pill) => {
  pill.addEventListener("click", async () => {
    animationsEnabled = pill.dataset.animToggle === "on";
    await kvSet("anim_enabled", animationsEnabled);
    document.querySelectorAll("#anim-toggle-row .mode-pill").forEach((p) => p.classList.toggle("on", p === pill));
  });
});

document.querySelectorAll("#rag-toggle-row .mode-pill").forEach((pill) => {
  pill.addEventListener("click", async () => {
    await kvSet("rag_enabled", pill.dataset.ragToggle === "on");
    document.querySelectorAll("#rag-toggle-row .mode-pill").forEach((p) => p.classList.toggle("on", p === pill));
  });
});

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

/* プロバイダを選び直しただけでは kv の provider は保存されないため、
   音声入力の説明文は保存後の initSettingsScreen で追従させる */

document.getElementById("toggle-key-visibility").addEventListener("click", () => {
  const input = document.getElementById("api-key-input");
  input.type = input.type === "password" ? "text" : "password";
});

document.getElementById("clear-key-input").addEventListener("click", () => {
  const input = document.getElementById("api-key-input");
  input.value = "";
  input.focus();
  document.getElementById("settings-status").textContent = "";
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
    await verifyApiKey(activeProvider, key);
    status.textContent = "✓ 保存しました。接続を確認できました。";
  } catch (err) {
    status.textContent = `保存しましたが、疎通確認に失敗しました（${err.message}）。`;
  }
  btn.disabled = false;
  await refreshUsageDisplay();
  /* Whisperの可否も話者一覧の取得もキーに依存するので、あわせて更新する */
  await refreshVoiceEngineUI();
  await refreshTtsSpeakerUI();
});

document.getElementById("toggle-gemini-key-visibility").addEventListener("click", () => {
  const input = document.getElementById("gemini-api-key-input");
  input.type = input.type === "password" ? "text" : "password";
});

document.getElementById("clear-gemini-key-input").addEventListener("click", () => {
  const input = document.getElementById("gemini-api-key-input");
  input.value = "";
  input.focus();
  document.getElementById("gemini-settings-status").textContent = "";
});

document.getElementById("save-gemini-key-btn").addEventListener("click", async () => {
  const status = document.getElementById("gemini-settings-status");
  const btn = document.getElementById("save-gemini-key-btn");
  const key = document.getElementById("gemini-api-key-input").value.trim();
  if (!key) { status.textContent = "APIキーを入力してください"; return; }

  btn.disabled = true;
  status.textContent = "疎通確認中…";
  await saveApiKey("gemini", key);
  await refreshGeminiKeyAvailability();

  try {
    await verifyGeminiApiKey(key);
    status.textContent = "✓ 保存しました。接続を確認できました。";
  } catch (err) {
    status.textContent = `保存しましたが、疎通確認に失敗しました（${err.message}）。`;
  }
  btn.disabled = false;
});

async function refreshUsageDisplay() {
  const calls = await kvGet("usage_calls", 0);
  const tokens = await kvGet("usage_tokens", 0);
  document.getElementById("usage-calls").textContent = `${calls} 回`;
  document.getElementById("usage-tokens").textContent = `約 ${tokens.toLocaleString()}`;
}

/* ------------------------------------------------------------------ *
 * 12b. 音声入力の設定
 * ------------------------------------------------------------------ */
async function refreshVoiceEngineUI() {
  const mode = await kvGet("voice_engine", "auto");
  const provider = await getActiveProvider();
  const whisperSupported = !!WHISPER_ENDPOINTS[provider];
  const selectable = whisperSupported && canRecord;
  const hasKey = whisperSupported && !!(await loadApiKey(provider));

  /* Whisperを選べない構成では、実際に動く「ブラウザ標準」の方を
     選択済みとして見せる。保存された設定自体は書き換えないので、
     さくらのAIに戻せば元の選択が復活する */
  const shown = selectable ? mode : "browser";
  document.querySelectorAll("#voice-engine-row .mode-pill").forEach((p) => {
    const isWhisper = p.dataset.voiceEngine === "auto";
    p.classList.toggle("on", p.dataset.voiceEngine === shown);
    /* 押せなくするのではなく薄く見せるだけにする。disabled にすると
       押しても何も起きず、ボタンが壊れているようにしか見えないため */
    p.classList.toggle("pill-muted", isWhisper && !selectable);
  });

  const note = document.getElementById("voice-engine-note");
  if (!canRecord) {
    note.textContent = "このブラウザは録音に対応していないため、ブラウザ内蔵の音声認識を使います。";
  } else if (!whisperSupported) {
    note.textContent = `Whisperによる音声認識はさくらのAIを選んでいるときだけ使えます。現在は${PROVIDER_LABELS[provider]}のため、ブラウザ内蔵の音声認識を使います。`;
  } else if (mode === "browser") {
    note.textContent = "ブラウザ内蔵の音声認識を使います。APIキーを消費しません。";
  } else if (!hasKey) {
    note.textContent = "さくらのAIのAPIキーが未設定のため、当面はブラウザ内蔵の音声認識を使います。";
  } else {
    note.textContent = "押している間の音声をさくらのAIのWhisperで認識します。1回の発話をまとめて送るため、長い単語でも途中で切れません。";
  }
}

document.querySelectorAll("#voice-engine-row .mode-pill").forEach((pill) => {
  pill.addEventListener("click", async () => {
    if (pill.dataset.voiceEngine === "auto") {
      if (!canRecord) { toast("このブラウザは録音に対応していません"); return; }
      const provider = await getActiveProvider();
      if (!WHISPER_ENDPOINTS[provider]) {
        toast("Whisperを使うには、上の「利用する生成AI」でさくらのAIを選んで保存してください");
        return;
      }
    }
    await kvSet("voice_engine", pill.dataset.voiceEngine);
    await refreshVoiceEngineUI();
  });
});

/* ------------------------------------------------------------------ *
 * 12c. Googleサインイン
 *   受け取ったIDトークンはこの画面用の表示（名前・メール・アイコン）に
 *   使うだけで、それ自体の署名検証はしていない。下のSupabase同期(12d)
 *   が設定されている場合は、同じIDトークンをSupabase Authにも渡して
 *   署名検証済みのセッションを作り、単語帳・履歴のクラウド同期に使う。
 *   Supabaseが未設定なら表示専用のまま(単語帳もAPIキーも従来どおり
 *   この端末のIndexedDBにだけ残る)。
 *   利用にはGoogle Cloudで発行したOAuthクライアントIDと、そこへの
 *   このアプリのオリジンの登録が必要。
 * ------------------------------------------------------------------ */
/* OAuthクライアントIDはリポジトリのオーナーが Google Cloud で発行し、
   ここに直接記入する。利用者ごとに設定画面から入れさせる形は取らない
   (クライアントIDはアプリ固有の値で、利用者が用意するものではないため)。
   空のままなら、サインインUIは出さず未設定である旨だけを表示する。
   発行時は、このアプリを配信するオリジンを対象クライアントの
   Authorized JavaScript origins に登録すること */
const GOOGLE_CLIENT_ID = "942903543011-r2hgervtelhkqfqgs9g2qnokjsdjaj6r.apps.googleusercontent.com";

const GSI_SRC = "https://accounts.google.com/gsi/client";
let gsiLoadPromise = null;
let gsiInitializedFor = null;

function loadGsiLibrary() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gsiLoadPromise) return gsiLoadPromise;
  gsiLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GSI_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gsiLoadPromise = null;
      reject(new Error("Googleのライブラリを読み込めませんでした"));
    };
    document.head.appendChild(script);
  });
  return gsiLoadPromise;
}

/* IDトークンのペイロードだけを取り出す。署名検証はしていないので、
   ここで得た値は表示以外の用途に使わないこと */
function decodeJwtPayload(token) {
  const segment = String(token).split(".")[1] || "";
  const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const bytes = atob(padded);
  const json = decodeURIComponent(
    Array.from(bytes, (c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`).join("")
  );
  return JSON.parse(json);
}

function renderGoogleUser(user) {
  const profile = document.getElementById("google-profile");
  const slot = document.getElementById("google-signin-btn");
  if (!user) {
    profile.hidden = true;
    return;
  }
  document.getElementById("google-name").textContent = user.name || "(名前なし)";
  document.getElementById("google-email").textContent = user.email || "";
  const avatar = document.getElementById("google-avatar");
  if (user.picture) { avatar.src = user.picture; avatar.hidden = false; } else { avatar.hidden = true; }
  profile.hidden = false;
  slot.innerHTML = "";
}

async function handleGoogleCredential(response) {
  const status = document.getElementById("google-status");
  try {
    const payload = decodeJwtPayload(response.credential);
    const user = {
      sub: payload.sub || "",
      name: payload.name || "",
      email: payload.email || "",
      picture: payload.picture || "",
      signedInAt: Date.now(),
    };
    await kvSet("google_user", user);
    renderGoogleUser(user);
    status.textContent = "";
    toast(`${user.name || user.email} でサインインしました`);
    await signInToCloud(response.credential);
  } catch (err) {
    console.warn("Google credential decode failed:", err);
    status.textContent = "サインイン情報を読み取れませんでした。";
  }
}

async function initGoogleAuth() {
  const status = document.getElementById("google-status");
  const slot = document.getElementById("google-signin-btn");
  const clientId = GOOGLE_CLIENT_ID;

  const user = await kvGet("google_user", null);
  renderGoogleUser(user);
  if (user) return; // サインイン済みならボタンは出さない

  slot.innerHTML = "";
  if (!clientId) {
    status.textContent = "Googleサインインは未設定です。";
    return;
  }

  try {
    await loadGsiLibrary();
    if (gsiInitializedFor !== clientId) {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleGoogleCredential,
        auto_select: false,
      });
      gsiInitializedFor = clientId;
    }
    window.google.accounts.id.renderButton(slot, {
      theme: "outline",
      size: "large",
      shape: "pill",
      text: "signin_with",
      locale: "ja",
    });
    status.textContent = "";
  } catch (err) {
    console.warn("Google Identity Services init failed:", err);
    status.textContent = err.message || "Googleサインインを初期化できませんでした。";
  }
}

document.getElementById("google-signout-btn").addEventListener("click", async () => {
  if (window.google?.accounts?.id) window.google.accounts.id.disableAutoSelect();
  await idbDelete("kv", "google_user");
  renderGoogleUser(null);
  toast("サインアウトしました");
  await signOutFromCloud();
  await initGoogleAuth();
});

/* ------------------------------------------------------------------ *
 * 12d. Supabaseクラウド同期（任意）
 *   Googleサインインした場合だけ、単語帳(words)と履歴(recent_words)を
 *   Supabaseに同期する。サインインしなければ今まで通りIndexedDBのみで
 *   完結し、ネットワークには一切触れない。
 *   利用にはSupabaseプロジェクトのURL・anon keyと、Supabase側での
 *   Google認証プロバイダの設定（GOOGLE_CLIENT_IDと同じ値を
 *   「Authorized Client IDs」に登録）が必要。空のままなら同期は無効化
 *   されたままで、Googleサインイン自体は12cの表示専用のまま動く。
 * ------------------------------------------------------------------ */
/* リポジトリのオーナーがSupabaseプロジェクトを作成し、ここに直接記入する。
   anon keyはRLS(行レベルセキュリティ)で保護される前提の公開鍵なので、
   フロントエンドに埋め込んでよい値（Supabase公式ドキュメント通り）。
   テーブル定義・RLSポリシーはリポジトリのSUPABASE_SETUP.mdを参照 */
let SUPABASE_URL = "https://ubvqigsydtrrfcovvpxk.supabase.co";
let SUPABASE_ANON_KEY = "sb_publishable_FXz2avQ5_H8i0c5YY1e3MQ_cc_BcBqN";

const SUPABASE_SRC = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js";
let supabaseLoadPromise = null;
let supabaseClient = null;
let cloudUserId = null;
/* signInToCloud が失敗した場合、cloudUserId がまだ無いので再試行は
   同じIDトークンでサインインからやり直す必要がある */
let lastFailedIdToken = null;

function cloudSyncConfigured() {
  return !!(SUPABASE_URL && SUPABASE_ANON_KEY);
}

function loadSupabaseLibrary() {
  if (window.supabase?.createClient) return Promise.resolve();
  if (supabaseLoadPromise) return supabaseLoadPromise;
  supabaseLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SUPABASE_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      supabaseLoadPromise = null;
      reject(new Error("Supabaseのライブラリを読み込めませんでした"));
    };
    document.head.appendChild(script);
  });
  return supabaseLoadPromise;
}

async function getSupabaseClient() {
  if (!cloudSyncConfigured()) return null;
  if (supabaseClient) return supabaseClient;
  await loadSupabaseLibrary();
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return supabaseClient;
}

function setSyncStatus(text, cls) {
  const el = document.getElementById("cloud-sync-status");
  if (!el) return;
  if (!text) { el.hidden = true; el.textContent = ""; el.className = "sync-status"; return; }
  el.hidden = false;
  el.textContent = text;
  el.className = `sync-status${cls ? ` ${cls}` : ""}`;
}

/* エラー後だけ再試行ボタンを出す。自動リトライの最中は、押しても
   二重に走らせないよう回転アイコンにしてクリックを無視する */
function setSyncRetryVisible(visible, spinning) {
  const btn = document.getElementById("cloud-sync-retry-btn");
  if (!btn) return;
  btn.hidden = !visible;
  btn.classList.toggle("spinning", !!spinning);
}

/* Supabaseは自前でリトライしないため、電波の悪い環境での失敗が
   そのままユーザーに見えてしまう。指数バックオフで数回だけ自動的に
   やり直し、それでも失敗したら諦めて再試行ボタンを出す */
async function withCloudRetry(fn, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try {
      const result = await fn();
      setSyncRetryVisible(false);
      return result;
    } catch (err) {
      const isLast = i === attempts - 1;
      if (isLast) throw err;
      setSyncRetryVisible(true, true);
      await sleep(800 * Math.pow(2, i));
    }
  }
}

function localWordToCloudRow(w) {
  return {
    id: w.id, user_id: cloudUserId, word: w.word, word_meaning: w.word_meaning || "",
    word_phonetic: w.word_phonetic || "", word_memory_tip: w.word_memory_tip || "",
    morphemes: w.morphemes || [], synonyms: w.synonyms || [], antonyms: w.antonyms || [],
    goro_text: w.goro_text || "", goro_highlight: w.goro_highlight || [],
    provider: w.provider || "", memorized: !!w.memorized, created_at: w.created_at || Date.now(),
    updated_at: w.updated_at || Date.now(),
  };
}
function cloudRowToLocalWord(r) {
  return {
    id: r.id, word: r.word, word_meaning: r.word_meaning || "", word_phonetic: r.word_phonetic || "",
    word_memory_tip: r.word_memory_tip || "", morphemes: r.morphemes || [],
    synonyms: r.synonyms || [], antonyms: r.antonyms || [],
    goro_text: r.goro_text || "", goro_highlight: r.goro_highlight || [], provider: r.provider || "",
    memorized: !!r.memorized, created_at: r.created_at || Date.now(), updated_at: r.updated_at || Date.now(),
  };
}

/* サインイン直後に一度だけ、クラウドとローカルをすり合わせる。
   同じidが両方にあれば updated_at が新しい方を採用する、単純な
   last-write-winsマージ（端末を跨いで使う場合の想定） */
async function pullAndMergeCloudData() {
  const sb = supabaseClient;
  if (!sb || !cloudUserId) return;
  setSyncStatus("同期中…", "syncing");
  try {
    await withCloudRetry(async () => {
      const [{ data: remoteWords, error: wErr }, { data: remoteRecentRow, error: rErr }] = await Promise.all([
        sb.from("words").select("*").eq("user_id", cloudUserId),
        sb.from("recent_words").select("words").eq("user_id", cloudUserId).maybeSingle(),
      ]);
      if (wErr) throw wErr;
      if (rErr) throw rErr;

      const localWords = await idbGetAll("words");
      const localById = new Map(localWords.map((w) => [w.id, w]));
      const remoteById = new Map((remoteWords || []).map((w) => [w.id, w]));

      for (const remote of remoteWords || []) {
        const local = localById.get(remote.id);
        if (!local || (remote.updated_at || 0) > (local.updated_at || 0)) {
          await idbPut("words", cloudRowToLocalWord(remote));
        }
      }
      const toUpload = localWords.filter((w) => {
        const remote = remoteById.get(w.id);
        return !remote || (w.updated_at || 0) > (remote.updated_at || 0);
      });
      if (toUpload.length) {
        const { error } = await sb.from("words").upsert(toUpload.map(localWordToCloudRow));
        if (error) throw error;
      }

      const localRecent = await kvGet("recent_words", []);
      const remoteRecentList = (remoteRecentRow && remoteRecentRow.words) || [];
      const mergedRecent = [
        ...localRecent,
        ...remoteRecentList.filter((w) => !localRecent.some((lw) => lw.toLowerCase() === w.toLowerCase())),
      ].slice(0, 20);
      if (mergedRecent.length) {
        await kvSet("recent_words", mergedRecent);
        const { error } = await sb.from("recent_words")
          .upsert({ user_id: cloudUserId, words: mergedRecent, updated_at: new Date().toISOString() });
        if (error) throw error;
      }
    });

    setSyncStatus("☁️ 同期済み");
    renderBookList();
    renderRecentChips();
  } catch (err) {
    console.warn("Cloud sync (pull) failed:", err);
    setSyncStatus("同期に失敗しました。", "error");
    setSyncRetryVisible(true, false);
  }
}

document.getElementById("cloud-sync-retry-btn").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  if (btn.classList.contains("spinning")) return;
  if (!cloudUserId && lastFailedIdToken) {
    await signInToCloud(lastFailedIdToken);
  } else {
    await pullAndMergeCloudData();
  }
});

/* 単語の保存・削除・分類のたびに呼ばれる。ローカルの書き込みは既に
   完了しているので、クラウド側が失敗してもUIは止めずトーストで知らせる
   だけにする（次にオンラインになった操作で改めて同期される） */
async function syncWordUpsert(record) {
  if (!supabaseClient || !cloudUserId) return;
  try {
    const { error } = await supabaseClient.from("words").upsert(localWordToCloudRow(record));
    if (error) throw error;
  } catch (err) {
    console.warn("Cloud sync (word upsert) failed:", err);
    toast("クラウドへの同期に失敗しました");
  }
}
async function syncWordDelete(id) {
  if (!supabaseClient || !cloudUserId) return;
  try {
    const { error } = await supabaseClient.from("words").delete().eq("user_id", cloudUserId).eq("id", id);
    if (error) throw error;
  } catch (err) {
    console.warn("Cloud sync (word delete) failed:", err);
    toast("クラウドへの同期に失敗しました");
  }
}
async function syncRecentWords(list) {
  if (!supabaseClient || !cloudUserId) return;
  try {
    const { error } = await supabaseClient.from("recent_words")
      .upsert({ user_id: cloudUserId, words: list, updated_at: new Date().toISOString() });
    if (error) throw error;
  } catch (err) {
    console.warn("Cloud sync (recent words) failed:", err);
  }
}

/* ローカルの単語書き込み・削除の唯一の入口。呼び出し元は idbPut/idbDelete
   を直接使わず、必ずこの2関数を経由すること（クラウド同期の抜け漏れを
   防ぐため）。updated_at はここで一括して付与する */
async function saveWordRecord(record) {
  record.updated_at = Date.now();
  await idbPut("words", record);
  await syncWordUpsert(record);
}
async function deleteWordRecord(id) {
  await idbDelete("words", id);
  await syncWordDelete(id);
}

/* GoogleサインインのIDトークンをそのままSupabase Authに渡し、
   署名検証済みのセッションを作る(signInWithIdToken)。この方式なら
   Supabase側にGoogleのクライアントシークレットを別途登録する必要はなく、
   GOOGLE_CLIENT_IDと同じ値を「Authorized Client IDs」に登録するだけでよい */
async function signInToCloud(idToken) {
  if (!cloudSyncConfigured()) return;
  setSyncStatus("同期中…", "syncing");
  try {
    const data = await withCloudRetry(async () => {
      const sb = await getSupabaseClient();
      const { data, error } = await sb.auth.signInWithIdToken({ provider: "google", token: idToken });
      if (error) throw error;
      return data;
    });
    cloudUserId = data.user.id;
    lastFailedIdToken = null;
    await pullAndMergeCloudData();
  } catch (err) {
    console.warn("Supabase sign-in failed:", err);
    setSyncStatus("クラウド同期を開始できませんでした。", "error");
    lastFailedIdToken = idToken;
    setSyncRetryVisible(true, false);
  }
}

async function signOutFromCloud() {
  cloudUserId = null;
  setSyncStatus("");
  if (!supabaseClient) return;
  try { await supabaseClient.auth.signOut(); } catch (err) { console.warn("Supabase sign-out failed:", err); }
}

/* 起動直後、以前サインインしたブラウザならSupabaseのセッションが
   localStorageに残っているので、それを使って静かに同期を復元する。
   google_user(表示用)が端末に残っていてもSupabase側のセッションが
   切れていることがあるため、判定はSupabase側のセッションだけで行う */
async function restoreCloudSession() {
  if (!cloudSyncConfigured()) return;
  try {
    const sb = await getSupabaseClient();
    const { data } = await sb.auth.getSession();
    if (data?.session?.user) {
      cloudUserId = data.session.user.id;
      await pullAndMergeCloudData();
    }
  } catch (err) {
    console.warn("Failed to restore Supabase session:", err);
  }
}

/* ------------------------------------------------------------------ *
 * 12e. まとめて登録 / まとめて確認（設定画面から入る）
 *   ホーム画面の流れは「1語入力 → 分解と語呂生成を待つ → 保存」で、
 *   単語を思いついた勢いで次々に登録することができない。ここでは
 *   「単語だけ先に溜める」「あとでまとめて生成する」「あとでまとめて
 *   確認して単語帳に入れる」の3段階に分け、待ち時間と操作を切り離す。
 *   ホーム画面の流れには一切手を入れていない。
 * ------------------------------------------------------------------ */
const BATCH_STORE = "batch_queue";

/* 生成中に二重で走らせないためのフラグ。実行中はボタンを押せなくする。
   まとめて登録の画面を離れても生成は止まらないので、戻ってきたときに
   このフラグから進行中かどうかを復元して表示する */
let batchRunning = false;

/* 改行・カンマ・空白など、英字とハイフン/アポストロフィ以外は全て区切りとして扱う。
   単語帳のCSVを貼り付けても、メモから改行で貼り付けても同じように拾えるようにする */
function parseBatchWordInput(text) {
  const seen = new Set();
  const out = [];
  for (const raw of String(text || "").split(/[^A-Za-z'-]+/)) {
    const word = raw.replace(/^[-']+|[-']+$/g, "").toLowerCase();
    if (word.length < 2 || !/^[a-z][a-z'-]*$/.test(word) || seen.has(word)) continue;
    seen.add(word);
    out.push(word);
  }
  return out;
}

async function loadBatchQueue() {
  const rows = await idbGetAll(BATCH_STORE);
  return rows.sort((a, b) => a.created_at - b.created_at);
}

async function putBatchRow(row) {
  row.updated_at = Date.now();
  await idbPut(BATCH_STORE, row);
}

/* 生成結果を単語帳のレコードの形に移す。まとめ経路でも1語ずつの経路でも
   単語帳に入る形は同じでなければならないので、変換はここ1か所に閉じる */
function batchRowToWordRecord(row, existing) {
  return {
    id: wordCardId(row.result.word),
    word: row.result.word,
    word_meaning: row.result.word_meaning,
    word_phonetic: row.result.word_phonetic,
    word_memory_tip: row.result.word_memory_tip,
    morphemes: row.result.morphemes,
    synonyms: row.result.synonyms,
    antonyms: row.result.antonyms,
    goro_text: row.result.goro_text,
    goro_highlight: row.result.goro_highlight,
    provider: row.result.provider,
    memorized: existing ? existing.memorized : false,
    created_at: existing ? existing.created_at : Date.now(),
  };
}

async function addBatchWords(words) {
  if (!words.length) { toast("英単語が見つかりませんでした"); return; }

  const queued = new Set((await loadBatchQueue()).map((r) => r.id));
  const saved = new Set((await idbGetAll("words")).map((r) => r.id));
  let added = 0, skipped = 0;
  for (const word of words) {
    const id = wordCardId(word);
    if (queued.has(id) || saved.has(id)) { skipped++; continue; }
    await putBatchRow({ id, word, status: "pending", error: "", result: null, created_at: Date.now() });
    added++;
  }
  toast(skipped ? `${added}語を追加（${skipped}語は登録済みのため除外）` : `${added}語を追加しました`);
  await renderBatchQueue();
}

/* まとめて登録用のCSVは、単語帳のCSV(CSV_COLUMNS)とは別物で、
   ユーザーが手で書くことを前提にした「wordの1列だけ」の最小の書式。
   単語帳のCSVをそのまま読ませても、word列だけを拾って動く */
function batchCsvTemplate() {
  return ["word", "abandon", "bereavement", "competition"].join("\r\n");
}

/* CSVから英単語を取り出す。word列があればそれを、無ければ全セルを対象に
   parseBatchWordInputへ渡して、英単語として妥当なものだけを拾う
   （ヘッダ行の"word"という文字自体は英単語として拾われうるが、
   word列を持つCSVではヘッダ行を読み飛ばすので混入しない） */
function batchWordsFromCsv(text) {
  const rows = parseCSV(text);
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const wordCol = headers.indexOf("word");
  const cells = wordCol >= 0
    ? rows.slice(1).map((r) => r[wordCol] ?? "")
    : rows.flat();
  return parseBatchWordInput(cells.join("\n"));
}

/* いま表示している工程名。生成中に画面を離れて戻ってきたとき、
   進捗行を元の工程名のまま復元するために覚えておく */
let batchProgressPhrase = "";

function setBatchProgress(label) {
  batchProgressPhrase = label || "";
  const row = document.getElementById("batch-progress");
  const text = document.getElementById("batch-progress-label");
  if (!row || !text) return;
  row.style.display = label ? "flex" : "none";
  /* 回転リングではなく、他の待ち表示（AIで検索中…など）と同じく
     文字の後ろに1つずつ増える点で表す */
  text.innerHTML = label
    ? `${escapeHtml(label)}<span class="goro-loading-dots" aria-hidden="true"></span>`
    : "";
}

async function renderBatchQueue() {
  const listEl = document.getElementById("batch-list");
  const statsEl = document.getElementById("batch-stats");
  if (!listEl || !statsEl) return;

  const rows = await loadBatchQueue();
  const pending = rows.filter((r) => r.status === "pending");
  const failed = rows.filter((r) => r.status === "failed");
  statsEl.textContent = `未生成${pending.length} ・ 失敗${failed.length}`;

  const runBtn = document.getElementById("batch-run-btn");
  if (runBtn) {
    /* 入力欄が空でも、積み残しの未生成語があれば押せる。
       生成中だけは二重起動を防ぐために止める */
    runBtn.disabled = batchRunning;
    runBtn.textContent = batchRunning
      ? "生成中…"
      : (pending.length ? `${pending.length}語を登録` : "登録");
  }

  listEl.innerHTML = "";
  if (!rows.length) {
    listEl.innerHTML = `<div class="empty-note">まだ登録されていません</div>`;
    return;
  }
  rows.forEach((r) => {
    const item = document.createElement("div");
    item.className = `batch-item batch-item-${r.status}`;
    const sub = r.status === "failed" ? r.error : (r.result?.word_meaning || "");
    /* 失敗は通信エラーなど一時的な理由のことが多い。未生成に戻せる口を
       用意しておかないと、登録し直すまでその単語だけ置き去りになる */
    const retryBtn = r.status === "failed"
      ? `<button class="btn-ghost batch-item-retry" type="button">再試行</button>`
      : "";
    item.innerHTML = `
      <div class="batch-item-main">
        <div class="batch-item-word">${escapeHtml(r.word)}</div>
        ${sub ? `<div class="batch-item-sub">${escapeHtml(sub)}</div>` : ""}
      </div>
      ${retryBtn}
      <button class="batch-item-del" type="button" aria-label="${escapeHtml(r.word)} を取り消す">✕</button>`;
    item.querySelector(".batch-item-del").addEventListener("click", async () => {
      await idbDelete(BATCH_STORE, r.id);
      await renderBatchQueue();
    });
    item.querySelector(".batch-item-retry")?.addEventListener("click", async () => {
      r.status = "pending";
      r.error = "";
      await putBatchRow(r);
      await renderBatchQueue();
    });
    listEl.appendChild(item);
  });
}

async function markBatchFailed(row, message) {
  row.status = "failed";
  row.error = message || "生成に失敗しました";
  await putBatchRow(row);
}

async function runBatchGeneration() {
  if (batchRunning) return;
  const provider = await getActiveProvider();
  const apiKey = await loadApiKey(provider);
  if (!apiKey) { toast("設定画面でAPIキーを登録してください"); return; }

  const queue = (await loadBatchQueue()).filter((r) => r.status === "pending");
  if (!queue.length) { toast("生成待ちの単語がありません"); return; }

  batchRunning = true;
  await renderBatchQueue();
  let saved = 0;
  setBatchProgress("接辞に分解中");

  try {
    for (const chunk of chunkArray(queue, BATCH_CHUNK_SIZE)) {
      try {
        /* 分解はAIへの単発の問い合わせで内部の工程を観測できないため、
           1語ずつの経路と同じく「それらしい」工程名を回して見せる。
           語呂合わせ側は実際の処理をそのまま報告できるので、
           そちらはonStatusで受け取った文言を出す */
        startDecomposeLoadingSequence("batch-progress", setBatchProgress);
        const decomposed = await batchDecomposeWords(chunk.map((r) => r.word), provider, apiKey);
        stopLoadingRotation("batch-progress");

        const items = [];
        for (const row of chunk) {
          const d = decomposed.get(row.word.toLowerCase());
          if (!d) { await markBatchFailed(row, "分解できませんでした"); continue; }
          if (d.wordExists === false) { await markBatchFailed(row, "英単語として認識できませんでした"); continue; }
          if (!d.morphemes.length) { await markBatchFailed(row, "接辞に分解できませんでした"); continue; }
          items.push({ row, decomposed: d, word: d.correctedWord, wordMeaning: d.meaning, morphemes: d.morphemes });
        }
        if (items.length) {
          setBatchProgress("お手本を準備中");
          const rag = await prepareBatchGoroRag(items, provider, apiKey);
          const goro = await batchGenerateGoro(items, provider, apiKey, rag, setBatchProgress);
          setBatchProgress("単語帳に保存中");
          for (const it of items) {
            const cand = goro.get(it.word);
            if (!cand) { await markBatchFailed(it.row, "語呂合わせを生成できませんでした"); continue; }
            it.row.status = "ready";
            it.row.error = "";
            it.row.result = {
              word: it.decomposed.correctedWord,
              word_meaning: it.decomposed.meaning,
              word_phonetic: it.decomposed.phonetic,
              word_memory_tip: it.decomposed.memoryTip,
              morphemes: it.decomposed.morphemes,
              synonyms: it.decomposed.synonyms,
              antonyms: it.decomposed.antonyms,
              goro_text: cand.text,
              goro_highlight: cand.highlight,
              provider,
            };
            /* 生成できた語はその場で単語帳へ入れ、キューからは外す。
               チャンクごとに確定させておくことで、途中で画面を離れても
               通信が切れても、そこまでの成果はそのまま残る */
            await saveGeneratedBatchRow(it.row, provider, apiKey);
            saved++;
          }
        }
      } catch (err) {
        console.error("まとめ生成に失敗しました:", err);
        /* 分解の途中で落ちた場合、工程名を回すタイマーが残ってしまう */
        stopLoadingRotation("batch-progress");
        for (const row of chunk) {
          if (row.status === "pending") await markBatchFailed(row, err.message);
        }
      }
      await renderBatchQueue();
    }
    toast(saved ? `${saved}語を単語帳に保存しました` : "まとめ生成が終わりました");
  } finally {
    batchRunning = false;
    stopLoadingRotation("batch-progress");
    setBatchProgress("");
    await renderBatchQueue();
    renderBookList();
  }
}

/* 生成できた1語を単語帳へ保存し、キューから外す */
async function saveGeneratedBatchRow(row, provider, apiKey) {
  const existing = await idbGet("words", wordCardId(row.result.word));
  await saveWordRecord(batchRowToWordRecord(row, existing));
  await idbDelete(BATCH_STORE, row.id);
  /* ユーザーが使うと判断した語呂を、今後のFew-shot例・マンネリ検出の
     材料として蓄積する。1語ずつ保存したときと同じ扱いにする */
  growGoroCorpusFromSave(row.result.word, row.result.word_meaning, row.result.goro_text, provider, apiKey)
    .catch((err) => console.warn("語呂合わせコーパスへの追加に失敗しました（スキップします）:", err));
}

/* 撮影ボタンのクリックハンドラは、iOS Safariの制約により
   file inputのclick()まで一切awaitを挟めない（awaitを跨ぐと
   ユーザー操作由来の呼び出しとみなされなくなり、ファイル選択が
   無反応になる）。そのためキーの有無だけを先に読み出して同期的に
   参照できるようにしておく */
let geminiKeyAvailable = false;
async function refreshGeminiKeyAvailability() {
  geminiKeyAvailable = !!(await loadApiKey("gemini"));
}

/* 確認画面を廃止する前のバージョンで「確認待ち」のまま残った生成結果を、
   単語帳へ移して回収する。放置すると、確認する画面が無くなった以上
   もう二度と取り出せない結果になってしまう */
async function flushPendingReviewRows() {
  const rows = (await loadBatchQueue()).filter((r) => r.status === "ready" && r.result);
  if (!rows.length) return;
  const provider = await getActiveProvider();
  const apiKey = await loadApiKey(provider).catch(() => "");
  for (const row of rows) await saveGeneratedBatchRow(row, provider, apiKey);
  toast(`生成済みだった${rows.length}語を単語帳に保存しました`);
  renderBookList();
}

async function openBatchScreen() {
  showScreen("screen-batch");
  refreshGeminiKeyAvailability();
  /* 画面を離れている間も生成は続いている。戻ってきたときに、
     進行中なら進捗表示をそのまま復元する */
  if (batchRunning) setBatchProgress(batchProgressPhrase || "生成中…");
  await flushPendingReviewRows();
  await renderBatchQueue();
}

/* アプリ内で画面を移っても生成は動き続けるが、タブ/アプリごと閉じられると
   JSごと止まるため、そこだけは確認を挟む（保存済みの語はそのまま残る） */
window.addEventListener("beforeunload", (e) => {
  if (!batchRunning) return;
  e.preventDefault();
  e.returnValue = "";
});

document.getElementById("batch-entry-btn").addEventListener("click", openBatchScreen);

/* 入力欄の内容をキューに足してから、そのまま生成〜保存まで走らせる。
   入力が空でも、前回までに積み残した未生成の語があれば生成を続ける */
document.getElementById("batch-run-btn").addEventListener("click", async () => {
  const input = document.getElementById("batch-input");
  const words = parseBatchWordInput(input.value);
  if (words.length) {
    await addBatchWords(words);
    input.value = "";
  }
  await runBatchGeneration();
});

const batchCsvSheet = document.getElementById("batch-csv-sheet");
document.getElementById("batch-csv-btn").addEventListener("click", () => {
  batchCsvSheet.style.display = "flex";
});
document.getElementById("batch-csv-sheet-close").addEventListener("click", () => {
  batchCsvSheet.style.display = "none";
});
document.getElementById("batch-csv-template-btn").addEventListener("click", () => {
  batchCsvSheet.style.display = "none";
  downloadCSV(batchCsvTemplate(), "engolo-batch-template");
});

const batchCsvInput = document.getElementById("batch-csv-input");
/* iOS対策として、file inputのclick()までawaitを挟まない */
document.getElementById("batch-csv-import-btn").addEventListener("click", () => {
  batchCsvSheet.style.display = "none";
  batchCsvInput.click();
});
batchCsvInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  const text = await file.text();
  const words = batchWordsFromCsv(text);
  if (!words.length) { toast("読み込める英単語が見つかりませんでした"); return; }
  await addBatchWords(words);
});

const batchPhotoInput = document.getElementById("batch-photo-input");
/* awaitを挟むとiOS Safariでファイル選択が開かなくなるため、
   このハンドラは同期のまま保つこと（キーの有無は事前に読んだ
   geminiKeyAvailableで判定する） */
document.getElementById("batch-photo-btn").addEventListener("click", () => {
  if (!geminiKeyAvailable) {
    toast("設定画面でGemini APIキーを登録してください");
    showScreen("screen-settings");
    return;
  }
  batchPhotoInput.click();
});
batchPhotoInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;

  const btn = document.getElementById("batch-photo-btn");
  const progress = document.getElementById("batch-photo-progress");
  btn.disabled = true;
  progress.style.display = "flex";
  try {
    const apiKey = await loadApiKey("gemini");
    if (!apiKey) { toast("設定画面でGemini APIキーを登録してください"); return; }
    const dataUrl = await compressImageForRecognition(file);
    const rawWords = await recognizeWordsFromImage(dataUrl, apiKey);
    /* 認識精度は完璧ではないため、キューへ直接足さずテキスト欄に
       差し込んで確認・修正してから「リストに追加」を押させる */
    const words = parseBatchWordInput(rawWords.join("\n"));
    if (!words.length) {
      toast("英単語を読み取れませんでした");
    } else {
      const input = document.getElementById("batch-input");
      input.value = input.value.trim() ? `${input.value.trim()}\n${words.join("\n")}` : words.join("\n");
      toast(`${words.length}語を読み取りました。内容を確認して「リストに追加」を押してください`);
    }
  } catch (err) {
    console.error(err);
    toast(`画像の読み取りに失敗しました（${err.message}）`);
  }
  btn.disabled = false;
  progress.style.display = "none";
});

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
  document.querySelectorAll("#mode-row .mode-pill").forEach((p) => {
    p.classList.toggle("on", p.dataset.mode === activeMode);
  });
}

document.querySelectorAll("#mode-row .mode-pill").forEach((pill) => {
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

/* ホーム画面右上のビルドタグはこれまでPRをマージするたびに手動で
   書き換えていたが、更新を忘れて古いままになることがあったため、
   GitHub上で直近にmainへマージされたPR番号を自動取得して表示する。
   検索APIをupdated順で引くとマージ後にコメント等が付いたPRが繰り上がり
   最新マージと食い違うことがあるため、mainの最新コミット（常に
   「Merge pull request #NNN from ...」の形になる）からPR番号を直接読む。
   取得できた値はkvにキャッシュし、オフライン時や取得失敗時は前回
   キャッシュ値（初回はHTMLの初期値）をそのまま表示し続ける */
async function refreshBuildTag() {
  const el = document.getElementById("build-tag");
  if (!el) return;
  const cached = await kvGet("build_tag_pr", null);
  if (cached) el.textContent = `#${cached}`;
  try {
    const res = await fetch("https://api.github.com/repos/gmgngnm/setsuguro/commits/main");
    if (!res.ok) return;
    const json = await res.json();
    const match = /Merge pull request #(\d+)/.exec((json.commit && json.commit.message) || "");
    const number = match && match[1];
    if (number) {
      el.textContent = `#${number}`;
      await kvSet("build_tag_pr", number);
    }
  } catch (err) {
    console.warn("ビルドタグの自動取得に失敗しました(キャッシュ値のまま表示します):", err);
  }
}

renderRecentChips();
applyThemeMode();
restoreCloudSession();
refreshBuildTag();
migrateTtsSpeakerDefaultOnce();
refreshGeminiKeyAvailability();
/* 起動直後、ホーム画面のテキストボックスを常にフォーカス状態にしておく
   (スマホ版はキーボードが開いてしまい使い勝手が悪いためPC版のみ) */
if (window.innerWidth >= 860) wordInput.focus();
