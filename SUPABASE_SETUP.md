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
  created_at bigint,
  updated_at bigint,
  primary key (user_id, id)
);
alter table public.words enable row level security;
create policy "individuals manage their own words"
  on public.words for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

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

### 既存プロジェクトへの追加（synonyms / antonyms 列）

既に上記のテーブルを作成済みの場合、単語ごとの同義語・対義語を保存する
`synonyms` / `antonyms` 列が無いため、そのままだと単語の保存時にクラウド
同期がエラーになる（ローカルへの保存自体は影響を受けない）。SQL Editorで
以下を一度だけ実行して列を追加する。

```sql
alter table public.words
  add column if not exists synonyms jsonb,
  add column if not exists antonyms jsonb;
```

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

- サインイン直後に一度だけ、ローカル（IndexedDB）とクラウドをすり合わせる
  （`updated_at` が新しい方を採用する単純な last-write-wins）
- 以降、単語の保存・削除・暗記フラグの変更・履歴の更新のたびに、ローカルへの
  書き込みと同時にクラウドへも書き込む（ローカルの操作は先に完了するため、
  クラウド側が失敗してもUIは止まらずトーストで知らせるだけ）
- 複数タブ・複数端末間のリアルタイム反映（Supabase Realtime）には対応していない。
  次にその端末で保存・削除などの操作をしたタイミングか、次回サインイン時に
  すり合わされる
