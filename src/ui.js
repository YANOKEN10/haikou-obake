import { MATERIALS, TRAPS, GHOSTS, RANKS } from "./data.js";
import { clamp } from "./util.js";

const $ = (s) => document.querySelector(s);

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

export class UI {
  constructor(game) {
    this.game = game;
    this.craftTab = "trap";
    this.craftOpen = false;
    this._hint = "";
    this._bagSig = "";
    this._humanSig = "";

    // ホットバーはタップ／クリックでも選べる
    const bar = $("#hotbar");
    if (bar) bar.addEventListener("pointerdown", (e) => {
      const s = e.target.closest(".slot");
      if (!s) return;
      e.preventDefault();
      this.game.selTrap = Number(s.dataset.i);
      this.game.audio.click();
      this.setHotbar(this.game.built, this.game.selTrap);
    });

    document.querySelectorAll(".ctab").forEach((el) => {
      el.addEventListener("click", () => {
        this.craftTab = el.dataset.tab;
        document.querySelectorAll(".ctab").forEach((e) => e.classList.toggle("on", e === el));
        this.renderCraft();
      });
    });
  }

  // --- ランク ------------------------------------------------
  setRank(kicked) {
    let r = RANKS[0], next = null;
    for (const x of RANKS) if (kicked >= x.at) r = x;
    for (const x of RANKS) if (x.at > kicked) { next = x; break; }
    $("#rankName").textContent = r.name;
    $("#rankNote").textContent = r.note;
    $("#kicked").innerHTML = "追い出した人間 <b>" + kicked + "</b> 人";
    const p = next ? clamp((kicked - r.at) / (next.at - r.at), 0, 1) : 1;
    $("#progBar").style.width = (p * 100) + "%";
    return r;
  }

  setPlace(name) { const e = $("#place"); if (e.textContent !== name) e.textContent = name; }

  // --- 所持材料 ----------------------------------------------
  setBag(inv) {
    const keys = Object.keys(MATERIALS);
    const sig = keys.map((k) => inv[k] || 0).join(",");
    if (sig === this._bagSig) return;
    this._bagSig = sig;
    $("#bag").innerHTML = keys
      .map((k) => '<div title="' + MATERIALS[k].desc + '">' + MATERIALS[k].icon + '<i class="nm"> ' + MATERIALS[k].name + '</i><span>' + (inv[k] || 0) + "</span></div>")
      .join("");
  }

  // --- ホットバー --------------------------------------------
  setHotbar(built, sel) {
    const keys = Object.keys(TRAPS);
    let html = "";
    keys.forEach((k, i) => {
      const n = built[k] || 0;
      html += '<div class="slot' + (i === sel ? " sel" : "") + (n ? "" : " empty") + '" data-i="' + i + '">' +
        '<span class="num">' + (i < 9 ? i + 1 : i === 9 ? 0 : "") + "</span>" + TRAPS[k].icon +
        '<span class="cnt">' + n + "</span></div>";
    });
    const bar = $("#hotbar");
    if (bar.dataset.sig !== html) { bar.innerHTML = html; bar.dataset.sig = html; }
  }

  // --- 人間リスト --------------------------------------------
  setHumans(humans, peers) {
    const extra = peers && peers.length ? peers.map((p) => p.name).join(",") : "";
    const sig = humans.map((h) => h.name + "|" + Math.round(h.fear) + "|" + h.state + "|" + h.out).join(";") + "#" + extra;
    if (sig === this._humanSig) return;
    this._humanSig = sig;
    const label = { wander: "うろうろ", investigate: "様子を見に行った", spooked: "びくびく", panic: "パニック！", flee: "逃走中！！" };
    // まだ校舎にいる人・こわがっている人を先に見せる
    const list = humans.slice().sort((a, b) => (a.out ? 1 : 0) - (b.out ? 1 : 0) || b.fear / b.maxFear - a.fear / a.maxFear);
    const box = $("#humanList");
    let html = "";
    if (peers && peers.length) {
      html += peers.map((p) =>
        '<div class="hrow mate"><div class="n"><span>👻 ' + esc(p.name) + '</span><span class="st">ともだち</span></div></div>').join("");
    }
    html += list.map((h) => {
      const p = clamp(h.fear / h.maxFear, 0, 1);
      const hue = 165 - p * 165;
      const st = h.out ? "追い出した！" : (label[h.state] || h.state);
      return '<div class="hrow' + (h.out ? " gone" : "") + '">' +
        '<div class="n"><span>' + esc(h.name) + '</span><span class="st">' + st + "</span></div>" +
        '<div class="hbar"><i style="width:' + (p * 100) + "%;background:hsl(" + hue + ',85%,58%)"></i></div></div>';
    }).join("");
    box.classList.remove("s1", "s2", "s3", "s4", "bare");
    box.innerHTML = html + '<div class="hmore" hidden></div>';
    this.trimHumanList(box);
  }

  // 全員の名まえが 必ず見えるようにする。
  //  入りきらないときは、行そのものを小さくして 詰めていく。
  //  （まえは「ほか◯人」とまとめていたが、だれが来ているか
  //    分からなくなるので やめた）
  trimHumanList(box) {
    const more = box.lastElementChild;
    more.hidden = true;
    const rows = Array.prototype.slice.call(box.children, 0, -1);
    for (const r of rows) r.hidden = false;
    const limit = box.clientHeight;
    if (!limit || !rows.length) return;

    // まずは ふつうの大きさで。あふれたら、段階的に小さくする
    const steps = ["", "s1", "s2", "s3", "s4"];
    for (const cls of steps) {
      box.classList.remove("s1", "s2", "s3", "s4");
      if (cls) box.classList.add(cls);
      if (box.scrollHeight <= limit + 1) return;
    }
    // いちばん小さくしても あふれるときだけ、バーを消してさらに詰める
    box.classList.add("s4", "bare");
  }

  setGauges(phase, stamina) {
    $("#phaseBar").firstElementChild.style.width = phase + "%";
    $("#staBar").firstElementChild.style.width = stamina + "%";
  }

  hint(text) {
    if (text === this._hint) return;
    this._hint = text;
    const e = $("#hint");
    e.textContent = text || "";
    e.classList.toggle("on", !!text);
  }

  toast(text, cls = "") {
    const e = document.createElement("div");
    e.className = "toast " + cls;
    e.textContent = text;
    const box = $("#toasts");
    box.appendChild(e);
    while (box.children.length > 5) box.removeChild(box.firstChild);
    setTimeout(() => { e.style.transition = "opacity .4s,transform .4s"; e.style.opacity = "0"; e.style.transform = "translateY(-10px)"; }, 2200);
    setTimeout(() => e.remove(), 2700);
  }

  vignette(v) { $("#vignette").style.opacity = clamp(v, 0, 1); }

  flash(strength = 0.55) {
    const f = $("#flash");
    f.style.transition = "none"; f.style.opacity = strength;
    requestAnimationFrame(() => { f.style.transition = "opacity .45s"; f.style.opacity = "0"; });
  }

  // --- おばけ工房 --------------------------------------------
  openCraft() { this.craftOpen = true; $("#craft").classList.add("on"); this.renderCraft(); }
  closeCraft() { this.craftOpen = false; $("#craft").classList.remove("on"); }
  toggleCraft() { this.craftOpen ? this.closeCraft() : this.openCraft(); }

  renderCraft() {
    const g = this.game;
    const grid = $("#cgrid");
    const isTrap = this.craftTab === "trap";
    const src = isTrap ? TRAPS : GHOSTS;
    grid.innerHTML = Object.entries(src).map(([id, d]) => {
      const locked = !isTrap && g.kicked < d.unlockAt;
      const can = !locked && g.canAfford(d.cost);
      const cost = Object.entries(d.cost).map(([m, n]) => {
        const have = g.inv[m] || 0;
        return "<b class='" + (have >= n ? "" : "lack") + "'>" + MATERIALS[m].icon + MATERIALS[m].name + " " + have + "/" + n + "</b>";
      }).join("");
      const stat = isTrap
        ? "こわさ " + d.fear + " ／ 範囲 " + d.radius + "m ／ 再発動 " + d.cooldown + "秒"
        : "こわさ " + d.fear + " ／ 範囲 " + d.radius + "m ／ 持続 " + d.life + "秒";
      const owned = isTrap ? "　所持 " + (g.built[id] || 0) : "";
      return "<div class='card " + (locked ? "locked" : can ? "can" : "no") + "' data-id='" + id + "' data-kind='" + (isTrap ? "trap" : "ghost") + "'>" +
        "<h4>" + d.icon + " " + d.name + owned + "</h4>" +
        "<div class='d'>" + d.desc + "</div>" +
        "<div class='stat'>" + stat + "</div>" +
        "<div class='cost'>" + cost + "</div>" +
        (locked ? "<div class='stat' style='color:var(--fear)'>🔒 " + d.unlockAt + "人 追い出すと解放</div>" : "") +
        "</div>";
    }).join("");

    grid.querySelectorAll(".card").forEach((c) => {
      c.addEventListener("click", () => {
        if (c.classList.contains("locked")) { g.audio.deny(); return; }
        g.craft(c.dataset.kind, c.dataset.id);
        this.renderCraft();
      });
    });
  }

  showScreen(html) {
    const s = $("#screen");
    s.classList.remove("off");
    if (html) s.querySelector(".sbox").innerHTML = html;
  }
  hideScreen() { $("#screen").classList.add("off"); }
}
