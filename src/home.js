// ============================================================
//  ホーム画面（ゲームを始める / ログイン / プロフィール）
// ============================================================
import * as S from "./save.js";
import { mountSupport } from "./support.js";
import { TRAPS, GHOSTS, MATERIALS, RANKS } from "./data.js";
import { STAGES, stageUnlocked, stageUrl } from "./stages.js";

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
    $("#stageList").addEventListener("click", (e) => {
      const b = e.target.closest && e.target.closest("button[data-stage]");
      if (!b || b.disabled || b.dataset.stage === this.game.stageId) return;
      location.href = stageUrl(b.dataset.stage);
    });

    $("#btnCreate").addEventListener("click", () => this.create());
    $("#newName").addEventListener("keydown", (e) => { if (e.key === "Enter") this.create(); });

    // スマホでは画面をなぞる操作が click を消すことがあるため、
    // 上の2ボタンは指を離した時点で直接実行する。
    const bindPress = (el, fn) => {
      el.addEventListener("pointerup", (e) => { e.preventDefault(); e.stopPropagation(); fn(); });
      el.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault(); fn();
      });
    };
    bindPress($("#btnHome"), () => this.game.goHome());
    $("#pResume").addEventListener("click", () => this.game.setPaused(false));
    $("#pSave").addEventListener("click", () => this.game.saveNow(true));
    $("#pHome").addEventListener("click", () => this.game.goHome());
    bindPress($("#btnSave"), () => this.game.saveNow(true));

    // 違うステージの部屋へ入ったときは、そのマップだけを読み直して自動で戻る。
    setTimeout(async () => {
      let q = null;
      try { q = JSON.parse(sessionStorage.getItem("haikou-obake:rejoin") || "null"); sessionStorage.removeItem("haikou-obake:rejoin"); } catch (e) { /* 保存不可 */ }
      if (!q || !q.code) return;
      if (!this.game.started) this.game.startGame(true);
      await this.game.roomJoin(q.code, q.name);
    }, 0);

    // --- ともだちと あそぶ ---------------------------------
    const g = this.game;
    const busy = (on) => {
      for (const id of ["#rCreate", "#rJoin", "#rLeave"]) $(id).disabled = on;
    };
    $("#pRoom").addEventListener("click", () => g.ui.openRoom(g.net));
    $("#rClose").addEventListener("click", () => g.ui.closeRoom());
    $("#room").addEventListener("click", (e) => { if (e.target.id === "room") g.ui.closeRoom(); });

    $("#rCreate").addEventListener("click", async () => {
      busy(true);
      g.ui.roomMsg("部屋をつくっています…", true);
      const r = await g.roomCreate(this.playerName());
      busy(false);
      g.ui.roomMsg(r.ok ? "" : r.why);
      g.ui.setRoom(g.net);
    });

    const code = $("#rCode");
    code.addEventListener("input", () => {
      code.value = code.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
    });
    code.addEventListener("keydown", (e) => { if (e.key === "Enter") $("#rJoin").click(); });

    $("#rJoin").addEventListener("click", async () => {
      const c = code.value.trim();
      if (c.length !== 4) { g.ui.roomMsg("あいことばは4文字です"); return; }
      busy(true);
      g.ui.roomMsg("部屋をさがしています…", true);
      const r = await g.roomJoin(c, this.playerName());
      busy(false);
      g.ui.roomMsg(r.ok ? "" : r.why);
      g.ui.setRoom(g.net);
    });

    // あいことばを おして コピーできるようにする。
    //  子どもが 書きうつさなくても、そのまま おくれるように
    $("#rCodeBig").addEventListener("click", async () => {
      const c = g.net.code;
      if (!c) return;
      try {
        await navigator.clipboard.writeText(c);
        g.ui.roomMsg("あいことば「" + c + "」を コピーしました", true);
      } catch (e) {
        // コピーできない ブラウザでは、えらんだ状態にして あげる
        const r = document.createRange();
        r.selectNodeContents($("#rCodeBig"));
        const s = window.getSelection();
        s.removeAllRanges(); s.addRange(r);
        g.ui.roomMsg("あいことばを えらびました。長おしで コピーできます", true);
      }
      g.audio.click();
    });

    // --- おどかし勝負 ---------------------------------------
    this.battleMin = 3;
    document.querySelectorAll(".bmin").forEach((el) => {
      el.addEventListener("click", () => {
        this.battleMin = Number(el.dataset.min);
        document.querySelectorAll(".bmin").forEach((o) => o.classList.toggle("on", o === el));
        g.audio.click();
      });
    });
    $("#rBattle").addEventListener("click", () => {
      if (!g.net.on || !g.net.isHost) { g.ui.roomMsg("部屋を作った人だけ はじめられます"); return; }
      if (!g.net.peers.size) { g.ui.roomMsg("ともだちが 入ってから はじめてください"); return; }
      if (!g.started) { g.ui.roomMsg("さきに ゲームを 始めてください"); return; }
      g.battle.start(this.battleMin);
    });
    $("#rsClose").addEventListener("click", () => { g.ui.hideResult(); g.audio.click(); });
    $("#result").addEventListener("click", (e) => { if (e.target.id === "result") g.ui.hideResult(); });

    $("#rLeave").addEventListener("click", async () => {
      busy(true);
      await g.roomLeave();
      busy(false);
      code.value = "";
      g.ui.roomMsg("部屋を出ました", true);
      g.ui.setRoom(g.net);
    });

    g.net.onEvent = (kind, detail) => {
      if (kind === "join") g.ui.toast("👋 " + detail + " が来た！", "gold");
      else if (kind === "part") g.ui.toast("👋 " + detail + " が出ていった", "good");
      else if (kind === "host") g.ui.toast("👑 " + detail, "gold");
      else if (kind === "back") g.ui.toast("🔌 " + detail, "good");
      else if (kind === "fast") g.ui.toast("⚡ " + detail, "gold", 4000);
      else if (kind === "lost") { g.ui.toast("⚠ " + detail, "bad"); g.roomLeave(); }
      g.ui.setRoom(g.net);
    };

    if (!S.storageAvailable()) {
      $("#loginMsg").textContent = "このブラウザでは記録を保存できません（プライベートモードかも）";
    }
  }

  profile() {
    const n = S.currentName();
    return n ? S.getProfile(n) : null;
  }

  // 部屋のなかで、ともだちに見える なまえ
  playerName() {
    const c = this.game.cloud;
    if (c && c.signedIn && c.name) return c.name;
    const p = this.profile();
    return (p && p.name) || "おばけ";
  }

  // 申請やさそいが来ていないか、そっと見にいく（タブの数字用）
  async pollFriends(quiet) {
    const c = this.game.cloud;
    if (!c || !c.signedIn) { this.fr = null; this.updateBadge(); return; }
    const r = await c.friends();
    if (!r.ok) return;
    this.fr = r.data;
    this.updateBadge();
    if (!quiet && this.tab === "friends") this.drawFriends();
  }

  show(tab) {
    const again = this.tab === tab;
    this.tab = tab;
    document.querySelectorAll(".htab").forEach((e) => e.classList.toggle("on", e.dataset.tab === tab));
    document.querySelectorAll(".hpanel").forEach((e) => e.classList.remove("on"));
    $("#hp" + tab[0].toUpperCase() + tab.slice(1)).classList.add("on");
    this.render();
    // 同じタブを押し直したときは、次に押す場所を光らせる
    if (again && tab === "play") {
      const b = $("#btnContinue").disabled ? $("#btnNew") : $("#btnContinue");
      b.classList.remove("pulse");
      void b.offsetWidth;
      b.classList.add("pulse");
    }
  }

  render() {
    if (this.tab === "play") this.renderPlay();
    else if (this.tab === "login") this.renderLogin();
    else if (this.tab === "friends") this.renderFriends();
    else this.renderProfile();
  }

  // ============================================================
  //  ともだち
  //   ・なまえが ぴったり合ったときだけ 見つかる
  //   ・申請は、相手が「うける」を押すまで つながらない
  //   ・「さそう」は、部屋のあいことばを相手にとどける
  // ============================================================
  async renderFriends() {
    const body = $("#frBody");
    const cloud = this.game.cloud;
    if (!cloud.signedIn) {
      body.innerHTML =
        "<div class='frnote'>ともだちきのうは、<b>「👤 ログイン」→「☁ どの端末でも」</b>で" +
        "なまえとあいことばを決めると使えます。<br>" +
        "この端末だけの記録では、ともだちになれません。</div>" +
        "<button class='bigbtn sub' id='frGoLogin'>ログインへ</button>";
      const b = $("#frGoLogin");
      if (b) b.addEventListener("click", () => { this.show("login"); this.showSub("mail"); });
      return;
    }
    if (!this.fr) body.innerHTML = "<div class='frnote'>よみこみ中…</div>";
    const r = await cloud.friends();
    if (!r.ok) { body.innerHTML = "<div class='frmsg'>" + esc(r.why) + "</div>"; return; }
    this.fr = r.data;
    this.drawFriends();
  }

  // 申請やさそいがとどいていたら、タブに数を出す
  updateBadge() {
    const el = $("#frBadge");
    if (!el) return;
    const n = this.fr ? (this.fr.reqIn || []).length + (this.fr.invite ? 1 : 0) : 0;
    el.hidden = n === 0;
    el.textContent = String(n);
  }

  frMsg(text, ok) {
    const e = $("#frMsg");
    if (!e) return;
    e.textContent = text || "";
    e.classList.toggle("ok", !!ok);
  }

  drawFriends() {
    const d = this.fr || { friends: [], reqIn: [], reqOut: [] };
    const body = $("#frBody");
    const row = (c, kind) => {
      const sm = c.has
        ? "追い出した " + c.kicked + " 人　いちばんの波 " + c.wave + " 陣　遊んだ時間 " + S.fmtTime(c.playSeconds)
        : "まだ 記録がありません";
      let btns = "";
      if (kind === "friend") {
        btns = "<button class='go' data-act='invite' data-id=\"" + esc(c.id) + "\">🎮 いっしょに あそぶ</button>" +
               "<button data-act='detail' data-id=\"" + esc(c.id) + "\">📋 くわしく</button>" +
               "<button class='no' data-act='remove' data-id=\"" + esc(c.id) + "\">やめる</button>";
      } else if (kind === "in") {
        btns = "<button class='yes' data-act='accept' data-id=\"" + esc(c.id) + "\">うける</button>" +
               "<button class='no' data-act='reject' data-id=\"" + esc(c.id) + "\">ことわる</button>";
      } else {
        btns = "<button class='no' data-act='cancel' data-id=\"" + esc(c.id) + "\">とりけす</button>";
      }
      return "<div class='frrow' data-row=\"" + esc(c.id) + "\">" +
        "<div class='top'><span class='nm'>" + esc(c.display) + "</span>" +
        (kind === "friend" && c.has ? "<span class='rk'>👑 " + esc(c.rank || "") + "</span>" : "") + "</div>" +
        "<div class='sm'>" + (kind === "friend" ? sm : "ともだち申請") + "</div>" +
        "<div class='btns'>" + btns + "</div>" +
        "<div class='detail' hidden></div></div>";
    };

    const g2 = this.game;
    const net = g2.net;
    let html = "";

    // いま 部屋に いるなら、あいことばと なかまを 見せる。
    //  ここから ともだちを 何人でも よべる（2人だけに ならない）
    if (net.on) {
      const names = [net.name || "じぶん"].concat(Array.from(net.peers.values()).map((p) => p.name));
      const full = names.length >= 4;
      html += "<div class='frroom'><div class='t'>🎮 いま みんなで あそんでいます（" + names.length + "／4人）</div>" +
        "<div class='cd' id='frCode' title='おすと コピー'>" + esc(net.code) + "</div>" +
        "<div class='who'>" + names.map(esc).join("　/　") + "</div>" +
        "<div class='btns'>" +
        (full ? "<button disabled style='opacity:.5'>いっぱいです</button>"
              : "<button class='go' id='frAll'>📣 ともだち みんなを さそう</button>") +
        "<button class='no' id='frLeave'>👋 部屋を出る</button></div></div>";
    } else {
      html += "<div class='frjoin'>" +
        "<input id='frCodeIn' maxlength='4' placeholder='ABCD' autocomplete='off' " +
        "autocapitalize='characters' spellcheck='false' inputmode='text'>" +
        "<button id='frCodeGo'>あいことばで 入る</button></div>" +
        "<div class='frnote' style='margin-top:-2px'>ともだちに 教えてもらった " +
        "<b>あいことば4文字</b>を 入れると、その部屋に 入れます。<br>" +
        "下の「いっしょに あそぶ」を おすと、部屋を つくって さそえます。</div>";
    }

    if (d.invite) {
      html += "<div class='frinvite'><div class='t'>🎮 <b>" + esc(d.invite.display) +
        "</b> が いっしょに あそぼうと さそっています</div>" +
        "<div class='btns' style='display:flex;gap:6px;margin-top:7px'>" +
        "<button class='go' id='frJoinInv'>入る</button>" +
        "<button class='no' id='frDropInv'>あとで</button></div></div>";
    }
    html += "<div class='frnote'>なまえが <b>ぴったり合ったときだけ</b> 見つかります。" +
      "ともだちに、なまえを教えてもらってね。</div>" +
      "<div class='frfind'><input id='frName' maxlength='24' placeholder='ともだちのなまえ' " +
      "autocomplete='off' spellcheck='false'><button id='frFind'>さがす</button></div>" +
      "<div class='frmsg' id='frMsg'></div>";

    html += "<div class='frsec'>🤝 ともだち（" + d.friends.length + "人）</div>";
    html += d.friends.length
      ? d.friends.map((c) => row(c, "friend")).join("")
      : "<div class='frempty'>まだ ともだちがいません。うえの まどで さがしてみよう。</div>";

    if (d.reqIn.length) {
      html += "<div class='frsec'>📨 とどいた申請（" + d.reqIn.length + "）</div>";
      html += d.reqIn.map((c) => row(c, "in")).join("");
    }
    if (d.reqOut.length) {
      html += "<div class='frsec'>📤 おくった申請（" + d.reqOut.length + "）</div>";
      html += d.reqOut.map((c) => row(c, "out")).join("");
    }
    body.innerHTML = html;
    this.updateBadge();
    this.bindFriends();
  }

  bindFriends() {
    const cloud = this.game.cloud;
    const name = $("#frName");
    const find = $("#frFind");
    if (find) {
      const go = async () => {
        const q = (name.value || "").trim();
        if (q.length < 2) { this.frMsg("なまえを2文字いじょう入れてください"); return; }
        find.disabled = true;
        this.frMsg("さがしています…", true);
        const r = await cloud.findFriend(q);
        find.disabled = false;
        if (!r.ok) { this.frMsg(r.why); return; }
        const f = r.data;
        if (!f.found) { this.frMsg(f.message || "見つかりませんでした"); return; }
        if (f.already) { this.frMsg(f.display + " は もう ともだちです", true); return; }
        if (f.sent) { this.frMsg(f.display + " には もう 申請ずみです", true); return; }
        if (f.got) { this.frMsg(f.display + " から 申請がとどいています。下で「うける」を押してね", true); return; }
        if (!confirm(f.display + " さんに ともだち申請を おくりますか？")) { this.frMsg(""); return; }
        const s = await cloud.askFriend(f.id);
        if (!s.ok) { this.frMsg(s.why); return; }
        this.fr = s.data;
        name.value = "";
        this.drawFriends();
        this.frMsg(f.display + " に 申請を おくりました", true);
      };
      find.addEventListener("click", go);
      name.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    }

    const inv = $("#frJoinInv");
    if (inv) {
      inv.addEventListener("click", async () => {
        const code = this.fr.invite.code;
        await cloud.clearInvite();
        if (!this.game.started) this.game.startGame(true);
        const r = await this.game.roomJoin(code, this.playerName());
        if (!r.ok) this.frMsg(r.why);
      });
    }
    const drop = $("#frDropInv");
    if (drop) {
      drop.addEventListener("click", async () => {
        const r = await cloud.clearInvite();
        if (r.ok) { this.fr = r.data; this.drawFriends(); }
      });
    }

    // あいことばで 入る
    const cin = $("#frCodeIn");
    if (cin) {
      cin.addEventListener("input", () => {
        cin.value = cin.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
      });
      const go = async () => {
        const c = cin.value.trim();
        if (c.length !== 4) { this.frMsg("あいことばは 4文字です"); return; }
        this.frMsg("部屋を さがしています…", true);
        if (!this.game.started) this.game.startGame(true);
        const r = await this.game.roomJoin(c, this.playerName());
        if (!r.ok) { this.frMsg(r.why); return; }
        this.frMsg("入りました！ みんなで あそぼう", true);
        this.drawFriends();
      };
      cin.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
      const gb = $("#frCodeGo");
      if (gb) gb.addEventListener("click", go);
    }
    // あいことばを コピー
    const cd = $("#frCode");
    if (cd) cd.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(this.game.net.code); this.frMsg("あいことばを コピーしました", true); }
      catch (e) { this.frMsg("長おしで コピーしてね", true); }
      this.game.audio.click();
    });
    // ともだち みんなを いっぺんに さそう
    const all = $("#frAll");
    if (all) all.addEventListener("click", () => this.inviteAll());
    const lv = $("#frLeave");
    if (lv) lv.addEventListener("click", async () => {
      await this.game.roomLeave();
      this.frMsg("部屋を 出ました", true);
      this.drawFriends();
    });

    $("#frBody").querySelectorAll("button[data-act]").forEach((b) => {
      b.addEventListener("click", async () => {
        const act = b.dataset.act, id = b.dataset.id;
        if (act === "detail") { this.showDetail(id); return; }
        if (act === "invite") { this.inviteTo(id); return; }
        if (act === "remove" && !confirm("ともだちを やめますか？")) return;
        b.disabled = true;
        const r = await cloud.answerFriend(act, id);
        b.disabled = false;
        if (!r.ok) { this.frMsg(r.why); return; }
        this.fr = r.data;
        this.drawFriends();
        if (act === "accept") this.frMsg("ともだちに なりました！", true);
      });
    });
  }

  async showDetail(id) {
    const rows = $("#frBody").querySelectorAll(".frrow");
    let box = null;
    for (const r of rows) if (r.getAttribute("data-row") === id) box = r.querySelector(".detail");
    if (!box) return;
    if (!box.hidden) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = "<div class='frempty'>よみこみ中…</div>";
    const r = await this.game.cloud.friendProfile(id);
    if (!r.ok) { box.innerHTML = "<div class='frmsg'>" + esc(r.why) + "</div>"; return; }
    const c = r.data.card;
    if (!c.has) { box.innerHTML = "<div class='frempty'>この人は まだ 記録をあずけていません。</div>"; return; }
    const s = c.stats || {};
    const st = (k, v) => "<div>" + k + "<b>" + v + "</b></div>";
    box.innerHTML = "<div class='frstats'>" +
      st("ランク", esc(c.rank || "?")) +
      st("追い出した", c.kicked + " 人") +
      st("いちばんの波", c.wave + " 陣") +
      st("遊んだ時間", S.fmtTime(c.playSeconds)) +
      st("おどかした", s.scares + " 回") +
      st("ふいうち", s.behind + " 回") +
      st("たたみかけ", s.combos + " 回") +
      st("最大こわがらせ", s.biggest) +
      st("仕掛けが動いた", s.trapsFired + " 回") +
      st("生み出したおばけ", s.ghostsSummoned + " 体") +
      st("集めた材料", s.materials + " 個") +
      st("笑われた", s.laughed + " 回") +
      "</div>";
  }

  // ともだち ぜんいんを、いまの 部屋に さそう。
  //  ひとりずつ おさなくても、みんなで あそべる
  async inviteAll() {
    const g = this.game;
    const list = (this.fr && this.fr.friends) || [];
    if (!list.length) { this.frMsg("まだ ともだちが いません"); return; }
    this.frMsg("部屋を よういしています…", true);
    if (!g.started) g.startGame(true);
    if (!g.net.on) {
      const r = await g.roomCreate(this.playerName());
      if (!r.ok) { this.frMsg(r.why); return; }
    }
    let ok = 0, ng = 0;
    for (const c of list) {
      const r = await g.cloud.inviteFriend(c.id, g.net.code);
      if (r.ok) ok++; else ng++;
    }
    this.frMsg(ok + "人を さそいました" + (ng ? "（" + ng + "人は とどきませんでした）" : "") +
      "。あいことばは「" + g.net.code + "」", true);
    this.drawFriends();
  }

  async inviteTo(id) {
    const g = this.game;
    this.frMsg("部屋を よういしています…", true);
    if (!g.started) g.startGame(true);
    if (!g.net.on) {
      const r = await g.roomCreate(this.playerName());
      if (!r.ok) { this.frMsg(r.why); return; }
    }
    const r = await g.cloud.inviteFriend(id, g.net.code);
    if (!r.ok) { this.frMsg(r.why); return; }
    this.frMsg(r.data.display + " を さそいました！ あいことばは「" + g.net.code +
      "」（5分いないに 入ってもらってね）", true);
    this.drawFriends();
  }

  // --- ゲームを始める ---------------------------------------
  renderPlay() {
    mountSupport(this.game.ui);
    const p = this.profile();
    $("#whoPlay").innerHTML = p
      ? "いま遊ぶ人： <b>" + esc(p.name) + "</b>　<span style='font-size:11px'>（「ログイン」で変えられます）</span>"
      : "なまえを決めると記録が残ります。<b>ゲスト</b>のままでも遊べます。";

    const card = $("#saveCard");
    const kicked = p ? Number(p.kicked || 0) : 0;
    $("#stageList").innerHTML = STAGES.map((s) => {
      const open = stageUnlocked(s, kicked);
      const on = s.id === this.game.stageId;
      const need = s.unlock ? (s.unlock + 1) + "人 追い出すと解放" : "はじめから遊べる";
      return "<button class='stagecard" + (on ? " on" : "") + "' data-stage='" + s.id + "' " + (open ? "" : "disabled") + ">" +
        "<span class='stageicon'>" + s.icon + "</span><span><b>" + esc(s.name) + "</b><small>" + esc(open ? s.desc : "🔒 " + need) + "</small></span>" +
        (on ? "<em>えらんでいます</em>" : "") + "</button>";
    }).join("");
    const cont = $("#btnContinue"), fresh = $("#btnNew");
    if (p && p.hasSave) {
      card.innerHTML =
        "<div class='savecard'><div class='t'>つづきの記録</div>" +
        "ランク <span>" + esc(p.rank) + "</span>　" +
        "追い出した人間 <span>" + p.kicked + "</span>人　" +
        "第 <span>" + p.wave + "</span> 陣まで<br>" +
        "作った仕掛け <span>" + this.trapCount(p) + "</span>個　" +
        "遊んだ時間 <span>" + S.fmtTime(p.playSeconds) + "</span><br>" +
        "<span style='color:var(--muted);font-size:11px'>さいごに遊んだ日：" + S.fmtDate(p.lastPlayed) + "</span></div>";
      cont.disabled = false;
      cont.textContent = "▶ つづきから始める";
      cont.className = "bigbtn";
      fresh.textContent = "さいしょから始める";
      fresh.className = "bigbtn sub";
    } else {
      // まだ記録がない人には、押すべきボタンをはっきり見せる
      card.innerHTML = "";
      cont.disabled = true;
      cont.textContent = "つづきの記録はまだありません";
      cont.className = "bigbtn sub";
      fresh.textContent = "▶ ゲームを始める";
      fresh.className = "bigbtn";
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
        "<button class='bigbtn sub' id='btnDel' style='border-color:var(--fear);color:var(--fear)'>このアカウントを消す</button>" +
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
      $("#btnDel").addEventListener("click", async () => {
        const pw = prompt("あずけた記録をぜんぶ消します。もとに戻せません。\nよろしければ、あいことばを入れてください。");
        if (pw === null) return;
        msg("消しています…", true);
        const r = await c.removeAccount(pw);
        if (r.ok) { this.game.audio.click(); this.renderMail(); $("#mailMsg").textContent = "消しました"; }
        else { msg(r.why, false); this.game.audio.deny(); }
      });
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
