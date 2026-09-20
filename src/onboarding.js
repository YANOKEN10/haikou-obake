// 初回だけ、記録の保存とホーム画面への追加を案内する。
import { profileNames } from "./save.js";
const KEY = "haikou-obake:onboarding-v1";
export class Onboarding {
  constructor(home) {
    this.home = home;
    this.waitingLogin = false;
    try {
      if (localStorage.getItem(KEY) || profileNames().length || home.game.cloud.token) return;
      // スキップ・×・途中の再読み込みでも、案内を繰り返さない。
      localStorage.setItem(KEY, "seen");
    } catch (_) { /* 保存できない端末でも、案内自体は使える */ }
    const style = document.createElement("style");
    style.textContent = `
      #firstGuide{box-sizing:border-box;width:min(520px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:auto;padding:26px;border:2px solid #a487ed;border-radius:24px;background:#19132c;color:#faf6ff;box-shadow:0 20px 80px #0009;font-family:inherit;line-height:1.7}
      #firstGuide::backdrop{background:#080512c9}
      #firstGuide *{box-sizing:border-box}#firstGuide h2{font-size:23px;line-height:1.4;margin:12px 0}#firstGuide p{margin:12px 0}
      #firstGuide .guide-top{display:flex;align-items:center;justify-content:space-between;color:#bfa9f1;font-size:13px}
      #firstGuide button,#guideContinue{font:inherit;cursor:pointer;border-radius:12px;min-height:44px;padding:10px 15px;border:1px solid #9474ce;color:#faf6ff;background:#302242}
      #firstGuide .guide-close{font-size:24px;line-height:1;padding:8px 14px}#firstGuide .guide-primary{background:#90edce;color:#172c26;border:0;font-weight:bold;width:100%}
      #firstGuide .guide-actions{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}#firstGuide .guide-actions button{flex:1}
      #firstGuide .guide-note{font-size:13px;color:#d1c6e3}#firstGuide .guide-box{padding:14px 18px;border-radius:14px;background:#282039;margin:14px 0}
      #firstGuide ol{padding-left:22px;margin:0}#firstGuide li+li{margin-top:9px}#firstGuide select{width:100%;padding:10px;border-radius:8px;background:#302242;color:white;font:inherit;border:1px solid #9474ce}
      #firstGuide button:focus-visible,#firstGuide select:focus-visible{outline:3px solid #ffdf77;outline-offset:2px}#guideContinue{display:block;margin:12px auto;border-color:#90edce}
      @media(max-height:480px){#firstGuide{padding:16px}#firstGuide h2{font-size:20px;margin:8px 0}#firstGuide p{margin:8px 0}}
    `;
    document.head.append(style);
    this.dialog = document.createElement("dialog");
    this.dialog.id = "firstGuide";
    this.dialog.setAttribute("aria-labelledby", "guideTitle");
    this.dialog.addEventListener("cancel", (e) => { e.preventDefault(); this.close(); });
    document.body.append(this.dialog);
    this.show(1);
  }
  close() {
    this.waitingLogin = false;
    this.dialog?.close();
    document.getElementById("guideContinue")?.remove();
  }
  show(step) {
    if (!this.dialog) return;
    this.waitingLogin = false;
    document.getElementById("guideContinue")?.remove();
    const installed = navigator.standalone || matchMedia("(display-mode: standalone)").matches;
    this.dialog.innerHTML = `<div class="guide-top"><span>はじめての あそびかた · ${step} / 2</span><button class="guide-close" aria-label="案内を閉じる">×</button></div>` + (step === 1 ? `
      <h2 id="guideTitle">☁ 記録を守るために<br>ログインしよう！</h2>
      <p><b>メールアドレスは いりません。</b><br>「なまえ」と「あいことば」だけで、かんたんに登録できます。</p>
      <div class="guide-box">ログインすると、セーブした記録をネットにあずけられます。<b>この端末のデータが消えても、同じなまえと あいことばで記録をとりだせます。</b></div>
      <p class="guide-note">ネットにつないでセーブしてね。あいことばは忘れないように、大切に覚えておこう。</p>
      <button class="guide-primary" id="guideLogin">ログイン・はじめての登録へ</button>
      <div class="guide-actions"><button id="guideNext">あとでログイン・次へ</button><button id="guideSkip">スキップ</button></div>` : `
      <h2 id="guideTitle">📱 ホーム画面に追加しよう！</h2>
      <p>${installed ? "ホーム画面から開けています！ 次からもアイコンを押して遊べます。" : "ゲームのアイコンを置けば、次からはタップするだけで すぐに遊べます。"}</p>
      ${installed ? "" : `<label for="guideDevice">使っている端末</label><select id="guideDevice"><option value="ios">iPhone・iPad（Safari）</option><option value="android">Android（Chrome）</option><option value="desktop">パソコン（Chrome・Edge）</option></select><div class="guide-box" id="guideSteps"></div><p class="guide-note">項目が見つからないときは、Safari や Chrome でこのゲームを開いてね。追加はあとからでもできます。</p>`}
      <button class="guide-primary" id="guideDone">わかった！ ホームへ</button>
      <div class="guide-actions"><button id="guideBack">前へ</button><button id="guideSkip">スキップ</button></div>`);
    this.dialog.querySelector(".guide-close").onclick = () => this.close();
    this.dialog.querySelector("#guideSkip").onclick = () => this.close();
    if (step === 1) {
      this.dialog.querySelector("#guideNext").onclick = () => this.show(2);
      this.dialog.querySelector("#guideLogin").onclick = () => {
        this.dialog.close();
        this.waitingLogin = true;
        this.home.show("login");
        this.home.showSub("mail");
        const next = document.createElement("button");
        next.id = "guideContinue";
        next.textContent = "次の案内：ホーム画面に追加する →";
        next.onclick = () => this.show(2);
        document.getElementById("hpLogin").prepend(next);
        document.getElementById("cId")?.focus();
      };
    } else {
      this.dialog.querySelector("#guideDone").onclick = () => { this.close(); this.home.show("play"); };
      this.dialog.querySelector("#guideBack").onclick = () => this.show(1);
      const device = this.dialog.querySelector("#guideDevice");
      if (device) {
        device.value = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) ? "ios" : /Android/.test(navigator.userAgent) ? "android" : "desktop";
        const render = () => {
          const steps = {
            ios: ["Safari の共有ボタン（□から↑）を押す。メニューの中にあることもあります。", "「ホーム画面に追加」を選ぶ。", "「追加」を押す。ホーム画面にゲームのアイコンができます！"],
            android: ["Chrome の右上の「⋮」を押す。", "「ホーム画面に追加」または「アプリをインストール」を選ぶ。", "画面の案内にそって「追加」または「インストール」を押す。"],
            desktop: ["Chrome や Edge でこのゲームを開く。", "アドレスバーのインストールアイコン、またはメニューの「アプリ」からインストールを選ぶ。", "確認画面で「インストール」を押す。次からはアプリ一覧から開けます。"]
          };
          this.dialog.querySelector("#guideSteps").innerHTML = "<ol>" + steps[device.value].map(s => "<li>" + s + "</li>").join("") + "</ol>";
        };
        device.onchange = render; render();
      }
    }
    if (!this.dialog.open) this.dialog.showModal();
    this.dialog.querySelector(".guide-primary").focus();
  }
}
