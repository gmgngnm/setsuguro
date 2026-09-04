# Supabase クラウド同期のセットアップ

EnGoloydは既定でサーバを持たないローカル専用アプリです。この設定を行うと、
**Googleサインインした人だけ**、単語帳（`words`）と履歴（`recent_words`）が
Supabaseにも同期されるようになります。サインインしない場合の挙動は変わりません
（IndexedDBのみで完結し、ネットワークには一切触れません）。

## 1. Supabaseプロジェクトを作成する

1. https://supabase.com でアカウントを作成し、New Project でプロジェクトを作成する
2. プロジェクトのダッシュボード → **Settings → API** を開き、次の2つを控える
   - **Project URL**（例: `https://xxxxxxxx.supabase.co`）
   - **anon / public key**（`service_role` key ではなく `anon` key の方。RLSで保護される前提の公開鍵で、フロントエンドに埋め込んで問題ない）

## 2. テーブルとRLSポリシーを作成する

ダッシュボードの **SQL Editor** で以下を実行する。

このファイルのSQLはすべて**何度実行しても安全**な形で書いてある。SQL Editor
は貼り付けた内容を1つのトランザクションで流すため、1文でもエラーになると
前の行まで巻き戻り、**何も適用されないまま終わる**。`create policy` や
`alter publication ... add table` は「既にある」だけでエラーになるので、
そのまま並べると2回目以降が丸ごと無効になる。

```sql
create table public.words (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  word text not null,
  word_meaning text,
  word_phonetic text,
  word_memory_tip text,
  morphemes jsonb,
  synonyms jsonb,
  antonyms jsonb,
  goro_text text,
  goro_highlight jsonb,
  provider text,
  memorized boolean default false,
  deleted boolean not null default false,
  created_at bigint,
  updated_at bigint,
  primary key (user_id, id)
);
alter table public.words enable row level security;
create policy "individuals manage their own words"
  on public.words for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 別端末での保存・削除をその場で受け取るために、wordsテーブルの
-- Realtime配信を有効にする
alter publication supabase_realtime add table public.words;
-- 削除イベントに単語のidを載せるため（既定では主キーのみ配信される）
alter table public.words replica identity full;

create table public.recent_words (
  user_id uuid primary key references auth.users(id) on delete cascade,
  words jsonb not null default '[]'::jsonb,
  updated_at timestamptz default now()
);
alter table public.recent_words enable row level security;
create policy "individuals manage their own recent words"
  on public.recent_words for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

RLSにより、各行は自分の`user_id`のものしか読み書きできない。anon keyだけを
配布していても、他人のデータが見えたり書き換えられたりすることはない。

### 既存プロジェクトへの追加（deleted 列 / Realtime）

端末をまたいだ単語帳の統合とリアルタイム反映のために、削除済みの目印を
持つ `deleted` 列と、`words` テーブルのRealtime配信が必要になった。既に
テーブルを作成済みの場合は、SQL Editorで以下を一度だけ実行する。

```sql
alter table public.words
  add column if not exists deleted boolean not null default false;

-- 既にpublicationに入っているとalter publicationはエラーになる。
-- SQL Editorは全体を1つのトランザクションで流すので、1文でも転ぶと
-- 前の行（列の追加など）まで巻き戻り、何も適用されないまま終わる
do $$
begin
  alter publication supabase_realtime add table public.words;
exception when duplicate_object then null;
end $$;
alter table public.words replica identity full;

-- 列や表を足しても、PostgRESTが持っている定義の控えが古いままだと
-- 「schema cacheに見つからない」と言われ続ける
notify pgrst, 'reload schema';
```

`deleted` 列が無いままでも保存・同期は止まらない（アプリ側が列の不在を
検出して、削除の同期だけ従来の物理削除に自動で切り替える）。ただしその
場合、片方の端末で消した単語が、削除を知らない別端末との突き合わせで
復活することがある。Realtimeが未設定の場合も同期は止まらず、次に画面へ
戻ったタイミングでの突き合わせで反映される。

これは `deleted` に限った話ではない。アプリは、テーブルに無いと言われた
列を落として送り直すので、**どの列が足りなくても同期そのものは止まらない**
（その項目だけがクラウドに乗らない）。足りない列は設定画面の
「同期の状態を確認」が名指しし、追加用のSQLもそこに出る。

### 既存プロジェクトへの追加（synonyms / antonyms 列）

既に上記のテーブルを作成済みの場合、単語ごとの同義語・対義語を保存する
`synonyms` / `antonyms` 列が無いため、そのままだと単語の保存時にクラウド
同期がエラーになる（ローカルへの保存自体は影響を受けない）。SQL Editorで
以下を一度だけ実行して列を追加する。

```sql
alter table public.words
  add column if not exists synonyms jsonb,
  add column if not exists antonyms jsonb;

notify pgrst, 'reload schema';
```

### 分解結果の共有（decompositions テーブル・任意）

ある単語をどう接辞に分けるかは誰が引いても同じ結果になるので、サインイン
した利用者どうしで使い回せる。この表を作ると、誰かが既に調べた単語は
AIに訊かずに済み、待ち時間もAPIの消費も減る。

行に `user_id` は持たせない。したがって**誰がどの単語を調べたかは残らない**。
共有されるのは「単語 → 分解結果」だけ。表を作らなくてもアプリは従来どおり
動く（毎回自分で分解する）。サインインしていない利用者は読み書きともに
行わないため、ネットワークに触れない点も変わらない。

```sql
create table if not exists public.decompositions (
  word text not null,
  version int not null,
  payload jsonb not null,
  created_at bigint,
  primary key (word, version)
);
alter table public.decompositions enable row level security;
-- create policy には if not exists が無いので、作り直す形にしておく。
-- こうしないと2回目の実行で転び、同じスクリプトの他の行まで巻き戻る
drop policy if exists "signed in users read decompositions" on public.decompositions;
create policy "signed in users read decompositions"
  on public.decompositions for select
  to authenticated using (true);
drop policy if exists "signed in users add decompositions" on public.decompositions;
create policy "signed in users add decompositions"
  on public.decompositions for insert
  to authenticated with check (true);

notify pgrst, 'reload schema';
```

追加だけを許し、更新・削除は許していない。先に書かれた結果がそのまま残る
ので、同じ単語の分解が引くたびに入れ替わることがない。アプリ側は、校閲
（`validateDecomposition`）を通った結果だけを差し出し、読み込む側でも
「接辞をつなぐと単語に戻るか」を確かめてから使う。

`version` は `DECOMPOSE_CACHE_VERSION` と同じ値で、分解のプロンプトを
変えたときに上げる。古い版の結果を引かなくなる。

## 3. GoogleサインインをSupabase Authに接続する

アプリは Google Identity Services（GSI）のボタンで取得したIDトークンを、
そのまま `supabase.auth.signInWithIdToken()` に渡す方式を使っている。この方式は
**Googleのクライアントシークレットを別途Supabaseに登録する必要がない**（IDトークン
の署名検証だけで済むため）。

1. 既に `app.js` の `GOOGLE_CLIENT_ID`（12cセクション）にGoogle CloudのOAuth
   クライアントID（種類: ウェブアプリケーション）を設定していること。まだなら
   Google Cloud Console → APIとサービス → 認証情報 で作成し、
   「承認済みのJavaScript生成元」にこのアプリの配信オリジンを登録する
2. Supabaseダッシュボード → **Authentication → Providers → Google** を開く
3. **Enabled** をオンにする
4. **Client IDs**（Authorized Client IDs）に、手順1と同じクライアントIDを入力する
   （Client Secretはこの方式では不要）
5. 保存する

## 4. アプリ側に値を設定する

`app.js` の「12d. Supabaseクラウド同期」セクション先頭にある、次の2行を書き換える。

```js
let SUPABASE_URL = "";       // ← 手順1で控えたProject URL
let SUPABASE_ANON_KEY = "";  // ← 手順1で控えたanon key
```

保存してデプロイすれば、設定画面でGoogleサインインした人から順にクラウド同期が
有効になる。空のままなら、これまで通りGoogleサインインは表示専用のまま動作する
（`app.js` 12cセクション参照）。

## 補足: 同期の仕組み

同じGoogleアカウントでサインインしている端末は、**単語帳を1つに統合して共有する**。

- **突き合わせ**: サインイン直後・Realtimeの購読が切れて張り直した直後・画面に
  戻ってきた時に、ローカル（IndexedDB）とクラウドをすり合わせる。両方にある単語は
  `updated_at` が新しい方を採用し（last-write-wins）、片方にしか無い単語は両方へ
  行き渡らせる。単語のidは見出し語そのもの（小文字）なので、2つの端末が別々に同じ
  単語を保存していても重複せず1件にまとまる
- **リアルタイム反映**: `words` テーブルの変更をSupabase Realtimeで購読しており、
  片方の端末で保存・削除すると、もう片方の単語帳にもその場で反映される。短時間に
  複数件届く場合（まとめて登録など）は少しまとめてから描画する。自分が書き込んだ
  変更も返ってくるが、`updated_at` の比較で打ち消されるため二重には反映されない
- **削除**: 行をそのまま消すのではなく `deleted = true` の目印（tombstone）を残す。
  物理削除だと、その削除を知らない別端末が次の突き合わせで「クラウドに無い＝自分
  だけが持っている単語」と見なして再アップロードし、消したはずの単語が復活して
  しまうため
- 単語の保存・削除・暗記フラグの変更・履歴の更新のたびに、ローカルへの書き込みと
  同時にクラウドへも書き込む（ローカルの操作は先に完了するため、クラウド側が失敗
  してもUIは止まらない）
- **送信に失敗した場合**: 通信の失敗なら少し間を空けて数回やり直し、それでも駄目な
  ときは「送信箱」（`kv` の `cloud_outbox`）に貯めて、オンラインに戻った時・画面に
  戻ってきた時・次の突き合わせの時にまとめて送り直す。オフラインの間は通信を試みず
  黙って貯める。設定画面の同期欄に未送信の件数が出て、待たずに送りたい場合は再試行
  ボタンから送れる。失敗の通知は連続しても30秒に1回までにまとめる
- 突き合わせは必ず送信箱を送ってから読み込む。逆順だと、送れていない削除がクラウド
  に残ったまま読み込まれ、削除したはずの単語が復活してしまう
- アクセストークンの期限切れ（401）を検出した場合は、セッションを1度更新してから
  やり直す
- サインインしない場合の挙動はこれまで通りで、ネットワークには一切触れない
