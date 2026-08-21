// ============================================================
//  ホーム画面（ゲームを始める / ログイン / プロフィール）
// ============================================================
import * as S from "./save.js";
import { TRAPS, GHOSTS, MATERIALS, RANKS } from "./data.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export class Home {
  constructor(game) {
    this.game = game;
    this.tab = "play";

    document.querySelectorAll(".htab").forEach((el) => {
      el.addEventListener("click", () => this.show(el.dataset.tab));
    });
    this.sub = "local";
    document.querySelectorAll(".stab").forEach((el) => {
      el.addEventListener("click", () => this.showSub(el.dataset.sub));
    });

    $("#btnContinue").addEventListener("click", () => this.game.startGame(true));
    $("#btnNew").addEventListener("click", () => {
      const p = this.profile();
      if (p && p.hasSave && !confirm("いまの記録は消えます。さいしょから始めますか？")) return;
      this.game.startGame(false);
    });

    $("#btnCreate").addEventListener("click", () => this.create());
    $("#newName").addEventListener("keydown", (e) => { if (e.key === "Enter") this.create(); });

    $("#btnHome").addEventListener("click", () => this.game.goHome());
    $("#btnSave").addEventListener("click", () => this.game.saveNow(true));

    if (!S.storageAvailable()) {
      $("#loginMsg").textContent = "このブラウザでは記録を保存できません（プライベートモードかも）";
    }
  }

  profile() {
    const n = S.currentName();
    return n ? S.getProfile(n) : null;
  }

  show(tab) {
    this.tab = tab;
    document.querySelectorAll(".htab").forEach((e) => e.classList.toggle("on", e.dataset.tab === tab));
    document.querySelectorAll(".hpanel").forEach((e) => e.classList.remove("on"));
    $("#hp" + tab[0].toUpperCase() + tab.slice(1)).classList.add("on");
    this.render();
  }

  render() {
    if (this.tab === "play") this.renderPlay();
    else if (this.tab === "login") this.renderLogin();
    else this.renderProfile();
  }

  // --- ゲームを始める ---------------------------------------
  renderPlay() {
    const p = this.profile();
    $("#whoPlay").innerHTML = p
      ? "いま遊ぶ人： <b>" + esc(p.name) + "</b>　<span style='font-size:11px'>（「ログイン」で変えられます）</span>"
      : "なまえを決めると記録が残ります。<b>ゲスト</b>のままでも遊べます。";

    const card = $("#saveCard");
    if (p && p.hasSave) {
      card.innerHTML =
        "<div class='savecard'><div class='t'>つづきの記録</div>" +
        "ランク <span>" + esc(p.rank) + "</span>　" +
        "追い出した人間 <span>" + p.kicked + "</span>人　" +
        "第 <span>" + p.wave + "</span> 陣まで<br>" +
        "作った仕掛け <span>" + this.trapCount(p) + "</span>個　" +
        "遊んだ時間 <span>" + S.fmtTime(p.playSeconds) + "</span><br>" +
        "<span style='color:var(--muted);font-size:11px'>さいごに遊んだ日：" + S.fmtDate(p.lastPlayed) + "</span></div>";
      $("#btnContinue").disabled = false;
      $("#btnContinue").textContent = "つづきから";
    } else {
      card.innerHTML = "";
      $("#btnContinue").disabled = true;
      $("#btnContinue").textContent = "つづきから（まだ記録がありません）";
    }
  }

  trapCount(p) {
    let n = (p.traps || []).length;
    for (const k in p.built || {}) n += p.built[k];
    return n;
  }

  showSub(sub) {
    this.sub = sub;
    document.querySelectorAll(".stab").forEach((e) => e.classList.toggle("on", e.dataset.sub === sub));
    document.querySelectorAll(".spanel").forEach((e) => e.classList.remove("on"));
    $(sub === "mail" ? "#lgMail" : "#lgLocal").classList.add("on");
    this.renderLogin();
  }

  // --- ログイン ---------------------------------------------
  renderLogin() {
    if (this.sub === "mail") return this.renderMail();
    this.renderLocal();
  }

  renderLocal() {
    const cur = S.currentName();
    const names = S.profileNames();
    const list = $("#nameList");
    if (!names.length) {
      list.innerHTML = "<div class='note' style='margin:0'>まだ、なまえがありません。<br>下の欄に入れて「つくる」を押してください。</div>";
    } else {
      list.innerHTML = names.map((n) => {
        const p = S.getProfile(n);
        return "<div class='namerow" + (n === cur ? " on" : "") + "' data-n='" + esc(n) + "'>" +
          "<div class='nm'>" + (n === cur ? "✅ " : "") + esc(n) + "</div>" +
          "<div class='meta'>" + esc(p.rank) + "<br>" + p.kicked + "人 追い出した</div>" +
          "<button class='del' data-del='" + esc(n) + "' title='このなまえを消す'>🗑</button></div>";
      }).join("");
      list.querySelectorAll(".namerow").forEach((row) => {
        row.addEventListener("click", (e) => {
          if (e.target.dataset.del !== undefined) return;
          S.setCurrent(row.dataset.n);
          this.game.audio.click();
          this.msg("");
          this.renderLogin();
        });
      });
      list.querySelectorAll(".del").forEach((b) => {
        b.addEventListener("click", (e) => {
          e.stopPropagation();
          const n = b.dataset.del;
          if (!confirm("「" + n + "」の記録をぜんぶ消します。よろしいですか？")) return;
          S.deleteProfile(n);
          this.renderLogin();
          this.msg("「" + n + "」を消しました");
        });
      });
    }
  }

  msg(t) { $("#loginMsg").textContent = t; }

  create() {
    const el = $("#newName");
    const r = S.createProfile(el.value);
    if (!r.ok) { this.msg(r.why); this.game.audio.deny(); return; }
    el.value = "";
    this.game.audio.pickup();
    this.msg("「" + r.name + "」でログインしました");
    this.renderLogin();
  }

  // --- プロフィール ------------------------------------------
  renderProfile() {
    const p = this.profile();
    const body = $("#profBody");
    if (!p) {
      body.innerHTML = "<div class='note' style='margin:0;font-size:13px'>" +
        "まだ、なまえがありません。<br>「👤 ログイン」でなまえを作ると、ここに記録が出ます。</div>";
      return;
    }
    const s = p.stats || {};
    const next = RANKS.find((r) => r.at > p.kicked);
    const stat = (k, v, unit) => "<div class='stat'><div class='k'>" + k + "</div>" +
      "<div class='v'>" + v + (unit ? "<small> " + unit + "</small>" : "") + "</div></div>";

    body.innerHTML =
      "<div class='rankbig'>👑 " + esc(p.rank) + "</div>" +
      "<div class='who'><b>" + esc(p.name) + "</b>　" +
      (next ? "次のランクまで あと " + (next.at - p.kicked) + " 人" : "すべてのランクを制覇！") + "</div>" +
      "<div class='stats'>" +
        stat("追い出した人間", p.kicked, "人") +
        stat("いちばん進んだ波", Math.max(s.bestWave || 0, p.wave || 0), "陣") +
        stat("おどかした回数", s.scares || 0, "回") +
        stat("ふいうち成功", s.behind || 0, "回") +
        stat("たたみかけ", s.combos || 0, "回") +
        stat("最大のこわがらせ", Math.round(s.biggest || 0), "") +
        stat("仕掛けが動いた", s.trapsFired || 0, "回") +
        stat("作った仕掛け", s.trapsBuilt || 0, "個") +
        stat("生み出したおばけ", s.ghostsSummoned || 0, "体") +
        stat("集めた材料", s.materials || 0, "個") +
        stat("笑われた回数", s.laughed || 0, "回") +
        stat("遊んだ時間", S.fmtTime(p.playSeconds), "") +
      "</div>" +
      this.favBlock(s) +
      "<div class='namenew' style='margin-top:12px'>" +
      "<input id='renameTo' type='text' maxlength='12' placeholder='なまえを変える' value='" + esc(p.name) + "'>" +
      "<button id='btnRename'>変える</button></div>" +
      "<div class='msg' id='profMsg'></div>";

    $("#btnRename").addEventListener("click", () => {
      const r = S.renameProfile(p.name, $("#renameTo").value);
      $("#profMsg").textContent = r.ok ? "「" + r.name + "」に変えました" : r.why;
      if (r.ok) { this.game.audio.pickup(); this.renderProfile(); }
      else this.game.audio.deny();
    });
  }

  // --- どの端末でも（なまえ＋あいことば） ---------------------
  renderMail() {
    const body = $("#mailBody");
    const c = this.game.cloud;

    if (c.signedIn) {
      body.innerHTML =
        "<div class='who'>ログイン中： <b>" + esc(c.name) + "</b></div>" +
        "<button class='bigbtn' id='btnPush'>☁ いまの記録をあずける</button>" +
        "<button class='bigbtn sub' id='btnPull'>⬇ あずけた記録をとりだす</button>" +
        "<button class='bigbtn sub' id='btnOut'>ログアウト</button>" +
        "<div class='msg' id='mailMsg'></div>" +
        "<div class='note'>ほかの端末でも、同じ<b>なまえ</b>と<b>あいことば</b>でログインすれば、" +
        "「とりだす」でつづきから遊べます。<br>" +
        "「とりだす」を押すと、この端末の記録はあずけたものに置きかわります。</div>";

      const msg = (t, ok) => { const m = $("#mailMsg"); m.style.color = ok ? "var(--mint)" : "var(--fear)"; m.textContent = t; };
      $("#btnPush").addEventListener("click", async () => {
        msg("あずけています…", true);
        const r = await this.game.pushToCloud();
        msg(r.ok ? "あずけました" : r.why, r.ok);
        this.game.audio[r.ok ? "pickup" : "deny"]();
      });
      $("#btnPull").addEventListener("click", async () => {
        msg("とりだしています…", true);
        const r = await this.game.pullFromCloud();
        msg(r.ok ? "とりだしました" : r.why, r.ok);
        this.game.audio[r.ok ? "pickup" : "deny"]();
        if (r.ok) this.show("play");
      });
      $("#btnOut").addEventListener("click", () => { c.signOut(); this.game.audio.click(); this.renderMail(); });
      return;
    }

    body.innerHTML =
      "<div class='who'>なまえと あいことばで、どの端末からでも つづきから遊べます</div>" +
      "<div class='namenew' style='margin-bottom:7px'>" +
      "<input id='cId' type='text' maxlength='24' placeholder='なまえ' autocomplete='username'></div>" +
      "<div class='namenew'>" +
      "<input id='cPw' type='password' maxlength='64' placeholder='あいことば（4文字いじょう）' autocomplete='current-password'></div>" +
      "<div style='display:flex;gap:8px;margin-top:9px'>" +
      "<button class='bigbtn' id='btnIn' style='margin:0'>ログイン</button>" +
      "<button class='bigbtn sub' id='btnUp' style='margin:0'>はじめて（とうろく）</button></div>" +
      "<div class='msg' id='mailMsg'></div>" +
      "<div class='note'>メールアドレスは いりません。<br>" +
      "⚠️ <b>あいことばを忘れると、あずけた記録は取り出せません。</b>忘れないものにしてください。</div>";

    const msg = (t, ok) => { const m = $("#mailMsg"); m.style.color = ok ? "var(--mint)" : "var(--fear)"; m.textContent = t; };
    const go = async (how) => {
      const id = $("#cId").value, pw = $("#cPw").value;
      $("#btnIn").disabled = $("#btnUp").disabled = true;
      msg(how === "signup" ? "とうろくしています…" : "ログインしています…", true);
      const r = how === "signup" ? await c.signup(id, pw) : await c.login(id, pw);
      $("#btnIn").disabled = $("#btnUp").disabled = false;
      if (!r.ok) { msg(r.why, false); this.game.audio.deny(); return; }
      this.game.audio.pickup();
      this.renderMail();
    };
    $("#btnIn").addEventListener("click", () => go("login"));
    $("#btnUp").addEventListener("click", () => go("signup"));
    $("#cPw").addEventListener("keydown", (e) => { if (e.key === "Enter") go("login"); });
  }

  favBlock(s) {
    const top = (obj, table, label) => {
      const e = Object.entries(obj || {});
      if (!e.length) return "";
      e.sort((a, b) => b[1] - a[1]);
      const d = table[e[0][0]];
      return "<div class='stat' style='margin-top:8px'><div class='k'>" + label + "</div>" +
        "<div class='v'><small>" + (d ? d.icon + " " + d.name : e[0][0]) + "　" + e[0][1] + "回</small></div></div>";
    };
    const t = top(s.byTrap, TRAPS, "いちばん使った仕掛け");
    const g = top(s.byGhost, GHOSTS, "いちばん呼んだおばけ");
    const h = Object.entries(s.byHuman || {}).sort((a, b) => b[1] - a[1])[0];
    const hh = h ? "<div class='stat' style='margin-top:8px'><div class='k'>いちばん追い出した人</div>" +
      "<div class='v'><small>" + esc(h[0]) + "　" + h[1] + "回</small></div></div>" : "";
    return (t || g || hh) ? "<div class='stats' style='margin-top:0'>" + t + g + hh + "</div>" : "";
  }
}
