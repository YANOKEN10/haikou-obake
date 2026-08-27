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

// 連絡さき。
//  ふだんは 空のままで かまいません。
//  Stripe の「公開ビジネス情報 → サポートメール」を 設定しておけば、
//  支払い画面と 領収メールに 連絡先が のります。
//  払った おとなだけが それを見るので、
//  子どもが 見るページに 個人の連絡先を 出さずに すみます。
//
//  もし ゲームの画面にも のせたい場合は、
//  <b>このゲーム専用に 作った メールアドレス</b>を 入れてください。
//  ふだん使いの携帯メールは、迷惑メールが 増えたり
//  変えにくかったり するので おすすめしません。
export const CONTACT_MAIL = "";

export const TOKUSHOHO_URL = "";

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

// 「応援について」の中身
export function supportText() {
  return [
    { h: "これは なんですか", p:
      "「廃校おばけ大作戦」を 気に入ってくださった方から、" +
      "任意で いただく 応援（寄付）です。<br>" +
      "<b>買っていただく商品は ありません。</b>" +
      "このゲームは これからも すべて 無料で あそべます。" },
    { h: "応援すると なにか もらえますか", p:
      "ゲームの中身は <b>一切 変わりません</b>。" +
      "おばけが 強くなったり、早く進めるように なったりも しません。<br>" +
      "お礼として、ホーム画面のボタンが「ありがとう」に変わるだけです。" +
      "これは この端末の中だけの しるしです。" },
    { h: "お金は どこへ いきますか", p:
      "サーバー代（このゲームを 置いておく費用）に 使わせてもらいます。" },
    { h: "支払いは 安全ですか", p:
      "支払いは すべて <b>Stripe</b>（世界中で使われている決済会社）の画面で 行われます。<br>" +
      "このゲームは カード番号を <b>受けとりませんし、見ることも できません</b>。" },
    { h: "返金について", p:
      "任意の応援のため、送っていただいたあとの お客様都合による返金には 対応していません。<br>" +
      "二重に 決済されてしまった場合や、手ちがいがあった場合は、" +
      "確認のうえ 返金します。<br>" +
      (CONTACT_MAIL
        ? "決済の日時を そえて、下の連絡さきまで お知らせください。"
        : "<b>お支払いのときに Stripe から とどく 領収メール</b>に 連絡さきが 書いてあります。" +
          "決済の日時を そえて、そちらへ ご連絡ください。") },
    { h: "おとなの方へ・おねがい", p:
      "お子さんが かってに 決済することが ないよう、" +
      "スマホやタブレットの <b>お支払い制限</b>を かけておくことを おすすめします。<br>" +
      "お子さまが 保護者の同意なく 応援してしまった場合は、ご連絡ください。取り消します。" },
  ];
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
    ' <button class="suplink" id="supMore">応援について</button>' +
    '<div class="supnote">' +
    (done
      ? "いただいた応援は、サーバー代に使わせてもらっています。"
      : "おとなの方へ：このゲームは これからも すべて無料です。<br>" +
        "応援は まったくの任意で、ゲームの内容は 一切変わりません。") +
    "</div>";
  const a = document.getElementById("supLink");
  if (a) a.href = SUPPORT_URL;
  const more = document.getElementById("supMore");
  if (more) more.addEventListener("click", () => openSupportInfo());
}

// 「応援について」を ひらく
export function openSupportInfo() {
  const box = document.getElementById("supInfo");
  if (!box) return;
  box.innerHTML =
    '<div class="sibox"><h3>☕ 応援について</h3>' +
    supportText().map((x) => "<h4>" + x.h + "</h4><p>" + x.p + "</p>").join("") +
    (CONTACT_MAIL
      ? '<h4>連絡さき</h4><p><a href="mailto:' + CONTACT_MAIL + '">' + CONTACT_MAIL + "</a></p>"
      : "") +
    (TOKUSHOHO_URL
      ? '<p><a href="' + TOKUSHOHO_URL + '" target="_blank" rel="noopener noreferrer">特定商取引法に基づく表記</a></p>'
      : "") +
    '<button class="pbtn sub" id="supClose">とじる</button></div>';
  box.classList.add("on");
  const c = document.getElementById("supClose");
  if (c) c.addEventListener("click", () => box.classList.remove("on"));
  box.addEventListener("click", (e) => { if (e.target === box) box.classList.remove("on"); });
}
