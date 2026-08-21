// ============================================================
//  メールでログインするための接続先（Supabase）
//
//  ここを書きかえるだけで「✉️ メールあり」が使えるようになります。
//  URL と anonKey は、ブラウザに公開してよい値です
//  （秘密の鍵ではありません。誰が見ても安全なように作られています）。
//  ※ service_role キーは絶対にここに書かないでください。
// ============================================================
export const CLOUD = {
  url: "",      // 例: "https://xxxxxxxxxxxx.supabase.co"
  anonKey: "",  // 例: "eyJhbGciOi..."（Project Settings → API の anon public）
};

export const cloudReady = () => Boolean(CLOUD.url && CLOUD.anonKey);
