# EnGoloyd の作業メモ

英単語を接辞に分解し、日本語の語呂合わせで覚えるPWA。
ビルド手順もパッケージも無く、`app.js` / `index.html` / `styles.css` / `sw.js`
をそのままGitHub Pagesが配信する。

## マージ

**テストが通ったら、確認を取らずにそのままマージしてよい**（2026-09-15 に利用者が
指示）。スカッシュマージで、コミット名は `タイトル (#番号)` の形に揃える。

マージしたあとに続きの作業をする場合は、枝を main から引き直すこと。
スカッシュマージ後は同じ変更が main 側と枝側に別のコミットとして残り、
そのまま続けると必ず衝突する。

```
git fetch origin main && git checkout -B <枝> origin/main
```

## ビルド番号

ホーム画面右上に出る番号は「いま端末が読み込んでいる app.js」を示すためのもの。
**変更のたびに2か所を必ず一緒に上げる**。片方だけ直すと、更新できているかの
確認に使えなくなる。

- `app.js` の `const APP_BUILD = "..."`
- `index.html` の `<span class="build-tag" id="build-tag">#...</span>`

Service Worker はシェル（index.html / app.js / styles.css など）をHTTPキャッシュを
通さずに取りに行く。キャッシュの持ち方を変えたときは `sw.js` の `CACHE` 名も上げる。

## Firefox アドオン（`firefox-addon/`）

ページの英文を選ぶとその場に日本語訳を出す拡張機能。PWA とは別物で、置き場所を
同じリポジトリにしているだけ。Gemini のAPIキーも拡張機能側で別に持つ。
入れ方と中身は `firefox-addon/README.md` に書いてある。

直したら `manifest.json` の `version` を上げる。ビルド番号のような表示は無いので、
`about:debugging` で読み込み直したものかどうかはここで見分ける。

アドオンは英単語を一語だけ選んだとき `index.html?w=単語` で本体アプリを開く。
それを受ける口が `app.js` の `startDecomposeFromQuery`。アドオン側の唯一の
繋ぎ目なので、消すなら向こうの「EnGoloydで開く」も一緒に外すこと。

## 確認のしかた

テストは Playwright で、実際に画面を動かして確かめる。作業用のファイルは
リポジトリに入れず、スクラッチ領域に置く。

- Playwright: `NODE_PATH=/opt/node22/lib/node_modules`
- Chromium: `executablePath: "/opt/pw-browsers/chromium"`
- 配信: プロジェクト直下で `python3 -m http.server 8940`
  （`setsid nohup ... </dev/null &` で起こすこと）
- Gemini API は `page.route` で差し替える。実際には呼ばない

見た目を変えたときは、明るいテーマと暗いテーマの両方を撮って確かめる。
時間や見え方の主張は、測らずに書かないこと。

「直した」と言う前に、**変更前のコードで実際に症状が出ることを確かめる**。
出ないなら、それは直した対象ではない。

## 書き方

- 画面に出る文言・コミット・PRの説明は日本語
- コメントは「なぜそう書いたか」を書く。何をしているかはコードが語る
- 既存のコメントの密度と語り口に合わせる
