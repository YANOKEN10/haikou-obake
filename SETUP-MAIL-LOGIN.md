# 「✉️ メールあり」ログインのつなぎ方（大人向け）

このゲームは静的なファイルを配っているだけなので、**記録をあずかるサーバー**をつなぐと
メールでのログインと、端末をまたいだ記録の同期ができるようになります。

コード側（`src/cloud.js` / `src/cloud-config.js`）はすでに書き終わっています。
下の手順で接続先を用意し、`src/cloud-config.js` に2つの値を書くだけで動きます。

---

## Supabase を使う場合（推奨）

### 1. プロジェクトを作る
1. <https://supabase.com> → 「Start your project」→ GitHub アカウントでサインイン
2. 「New project」
   - Name: `haikou-obake`
   - Database Password: 自動生成のままでOK（使いません。控えは取っておく）
   - Region: `Northeast Asia (Tokyo)`
3. 作成完了まで1〜2分待つ

### 2. 記録をしまう表を作る
左メニュー **SQL Editor** → 「New query」→ 下をそのまま貼って **Run**。

```sql
create table if not exists public.saves (
  user_id    uuid primary key references auth.users on delete cascade,
  payload    jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.saves enable row level security;

-- 自分の記録だけ読み書きできるようにする
create policy "read own save"   on public.saves for select using  (auth.uid() = user_id);
create policy "insert own save" on public.saves for insert with check (auth.uid() = user_id);
create policy "update own save" on public.saves for update using  (auth.uid() = user_id);
```

### 3. 戻り先のURLを許可する
左メニュー **Authentication → URL Configuration**

- **Site URL**: `https://haikou-obake-daisakusen.vercel.app/`
- **Redirect URLs** に次の2つを追加:
  - `https://haikou-obake-daisakusen.vercel.app/`
  - `http://localhost:5178/`（自分のパソコンで試すため）

### 4. 接続先の値を控える
左メニュー **Project Settings → API**

- **Project URL**（`https://xxxxxxxx.supabase.co`）
- **anon public** キー（`eyJ...` で始まる長い文字列）

> ⚠️ **service_role** キーは絶対に渡さないでください。こちらは使いません。
> anon public キーはブラウザに出てよい値です。

### 5. 私に渡す
上の **Project URL** と **anon public** キーを教えてください。
`src/cloud-config.js` に書きこんで、動作確認まで行います。

---

## 気をつけること

- **無料プランは1週間まったく使われないとプロジェクトが休止します。**
  休止すると、メールログインだけ使えなくなります（「メールなし」で遊ぶぶんには影響ありません）。
  Supabase の管理画面を開いて「Restore」を押せば戻ります。
  週に1回でも誰かがログインしていれば休止しません。
- 子どもには「📵 メールなし」を案内してください。メールあり側は大人向けです。
- メールアドレスは個人情報です。Supabase の管理画面から、いつでも利用者の削除ができます。

---

## Firebase を使う場合

Supabase の「1週間で休止」が困る場合は Firebase（Google）が選択肢になります。
休止はありませんが、設定項目がやや多くなります。
そちらで進める場合は、`src/cloud.js` を Firebase 用に書き直しますのでお知らせください。
