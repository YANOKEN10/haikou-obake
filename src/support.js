// ============================================================
//  おうえん（寄付）ボタン
//   ・このゲームは これからも ぜんぶ 無料であそべます。
//     ここは「よかったら お礼を」というだけの場所です。
//   ・買うものは ありません。ゲームの中身は 1ミリも 変わりません。
//     お礼として、名前のよこに 小さな しるしが つくだけです。
//   ・お金のやりとりは すべて Stripe の画面でおこないます。
//     このゲームは カード番号を 受けとりません。見ることもできません。
// ============================================================

// Stripe の「支払いリンク」をここに貼る。
//  空のままなら、ボタンは 出ません（こわれた見た目にならないように）。
//  作りかた：Stripeダッシュボード → 商品カタログ → 商品を追加
//    → 料金は「お客様が価格を決定」（JPY・最低100円）
//    → 「支払いリンクを作成」
//    → 完了後のリダイレクト先に
//       https://haikou-obake-daisakusen.vercel.app/?support=thanks
export const SUPPORT_URL = "";

const KEY = "haikou-obake:supporter";

export function isSupporter() {
  try { return localStorage.getItem(KEY) === "1"; } catch (e) { return false; }
}

function markSupporter() {
  try { localStorage.setItem(KEY, "1"); } catch (e) { /* 使えない環境もある */ }
}

// もどってきたときに「ありがとう」を出す
//  URL の ?support=thanks を見るだけ。お金の情報は いっさい さわらない。
export function checkReturn(ui) {
  let q;
  try { q = new URL(location.href).searchParams.get("support"); } catch (e) { return false; }
  if (q !== "thanks") return false;
  markSupporter();
  // アドレスから ?support=thanks を消して、きれいにしておく
  try { history.replaceState(null, "", location.pathname); } catch (e) { /* 気にしない */ }
  if (ui) {
    ui.toast("💛 応援ありがとうございます！", "gold");
    setTimeout(() => ui.toast("おばけたちが よろこんでいます", "good"), 900);
  }
  return true;
}

// ホーム画面に ボタンを置く
export function mountSupport(ui) {
  const box = document.getElementById("supportBox");
  if (!box) return;
  if (!SUPPORT_URL) { box.hidden = true; return; }   // リンク未設定なら 出さない
  box.hidden = false;

  const done = isSupporter();
  box.innerHTML =
    '<a class="supbtn' + (done ? " done" : "") + '" id="supLink" target="_blank" rel="noopener noreferrer">' +
    (done ? "💛 応援してくれてありがとう" : "☕ このゲームを応援する") + "</a>" +
    '<div class="supnote">' +
    (done
      ? "いただいた応援は、サーバー代に使わせてもらっています。"
      : "おとなの方へ：このゲームは これからも すべて無料です。<br>" +
        "応援は まったくの任意で、ゲームの内容は 一切変わりません。") +
    "</div>";
  const a = document.getElementById("supLink");
  if (a) a.href = SUPPORT_URL;
}
