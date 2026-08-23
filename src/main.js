import * as THREE from "../lib/three.module.js";
import { buildWorld } from "./world.js";
import { buildSky } from "./sky.js";
import { TouchControls, isTouchDevice, goFullscreen } from "./touch.js";
import { Home } from "./home.js";
import * as S from "./save.js";
import { Cloud } from "./cloud.js";
import { Player } from "./player.js";
import { Human, HUMAN_SCALE } from "./human.js";
import { Pickup, Trap, Summon, FloatText, RedLady, Cat, Confession, PeerGhost } from "./entities.js";
import { Net } from "./net.js";
import { UI } from "./ui.js";
import { Audio } from "./audio.js";
import { MATERIALS, TRAPS, GHOSTS, RANKS } from "./data.js";
import { Roster } from "./people.js";
import { clamp, rand, randi, choice, dist } from "./util.js";
const FLOOR_HEIGHT_HALF = 3.2;

// ============================================================
//  入力
// ============================================================
class Input {
  constructor(el) {
    this.keys = new Set();
    this.mouseDX = 0; this.mouseDY = 0;
    this.axisX = 0; this.axisZ = 0;   // タッチのスティック（-1〜1）
    this.dash = false;                // タッチのダッシュ
    this.locked = false;
    this.pressed = new Set();
    this.wheel = 0;

    addEventListener("keydown", (e) => {
      if (["Tab", "Space", "ArrowUp", "ArrowDown"].includes(e.code) || e.code === "Tab") e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener("keyup", (e) => this.keys.delete(e.code));
    addEventListener("blur", () => this.keys.clear());

    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === el;
    });
    // ポインタロックが使えない環境ではドラッグで視点を回せるようにする
    this.dragging = false;
    el.addEventListener("mousedown", () => { if (!this.locked) this.dragging = true; });
    addEventListener("mouseup", () => { this.dragging = false; });
    addEventListener("mousemove", (e) => {
      if (!this.locked && !this.dragging) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    addEventListener("wheel", (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    this.el = el;
  }
  k(code) { return this.keys.has(code); }
  once(code) { if (this.pressed.has(code)) { this.pressed.delete(code); return true; } return false; }
  endFrame() { this.pressed.clear(); this.wheel = 0; }
  lock() {
    if (!this.el.requestPointerLock) return;
    try { const p = this.el.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* 埋め込みブラウザなどでは使えない */ }
  }
  unlock() { document.exitPointerLock && document.exitPointerLock(); }
}

// ============================================================
//  ゲーム本体
// ============================================================
// 端末に応じた画質設定（スマホは軽さ優先）
function pickQuality() {
  const touch = isTouchDevice();
  const small = Math.min(innerWidth, innerHeight) < 520;
  if (touch && small) return { name: "mobile", torches: 2, lamps: 2, dust: 200, pickups: 40, maxPickups: 70, pixelRatio: 1.0, aa: false, far: 190, fov: 68 };
  if (touch) return { name: "tablet", torches: 3, lamps: 3, dust: 380, pickups: 50, maxPickups: 90, pixelRatio: 1.25, aa: true, far: 220, fov: 65 };
  return { name: "desktop", torches: 5, lamps: 4, dust: 700, pickups: 60, maxPickups: 110, pixelRatio: 1.75, aa: true, far: 260, fov: 62 };
}

const NET_STATES = ["wander", "investigate", "spooked", "panic", "flee"];

class Game {
  constructor() {
    this.q = pickQuality();
    this.renderer = new THREE.WebGLRenderer({ antialias: this.q.aa, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.q.pixelRatio));
    this.renderer.setSize(Math.max(1, innerWidth || 1), Math.max(1, innerHeight || 1));
    this.renderer.setClearColor(0x0a0d1e);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    document.getElementById("app").appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x131a2e, 0.0145);
    this.camera = new THREE.PerspectiveCamera(this.q.fov, Math.max(1, innerWidth || 1) / Math.max(1, innerHeight || 1), 0.08, this.q.far);

    this.input = new Input(this.renderer.domElement);
    this.audio = new Audio();
    this.ui = new UI(this);

    this.inv = {};                       // 所持材料
    this.built = {};                     // 作った仕掛けの在庫
    this.kicked = 0;                     // 追い出した人数
    this.selTrap = 0;
    this.paused = false;
    this.started = false;
    this.wave = 0;
    this.waveTimer = 0;
    this.spawnTimer = 6;
    this.scareFx = 0;
    this.rankName = RANKS[0].name;

    this.roster = new Roster(100);
    this.humans = [];
    this.net = new Net();
    this.peerGhosts = new Map();
    this.hidNext = 1;
    this.pickups = [];
    this.traps = [];
    this.summons = [];
    this.texts = [];

    this.resize = () => {
      // スマホはブラウザのバーで見える高さが変わるので、実際に見えている大きさを使う
      const vv = window.visualViewport;
      let w = Math.max(1, (vv ? vv.width : innerWidth) || innerWidth || 1);
      let h = Math.max(1, (vv ? vv.height : innerHeight) || innerHeight || 1);
      w = Math.round(w); h = Math.round(h);
      document.documentElement.style.setProperty("--vvh", h + "px");
      if (w === this._w && h === this._h) return;
      this._w = w; this._h = h;
      this.renderer.setSize(w, h);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    };
    addEventListener("resize", this.resize);
    if (window.visualViewport) {
      visualViewport.addEventListener("resize", this.resize);
      visualViewport.addEventListener("scroll", this.resize);
    }
    addEventListener("orientationchange", () => setTimeout(this.resize, 300));
  }

  // --- 初期化 ------------------------------------------------
  build() {
    const t0 = performance.now();
    // 隠し要素：全階のトイレから、毎回ランダムにひとつ選ぶ
    const toilets = [];
    for (let f = 1; f <= 4; f++) { toilets.push("wc_m" + f, "wc_f" + f); }
    this.world = buildWorld(this.scene, { dust: this.q.dust, poopRoom: choice(toilets) });

    this.sky = buildSky(this.scene);

    // 照明（夜だけど、ちゃんと見える明るさ）
    this.scene.add(new THREE.AmbientLight(0x4b5c86, 2.4));
    this.scene.add(new THREE.HemisphereLight(0x8fa6d8, 0x5b6280, 2.6));
    const moon = new THREE.DirectionalLight(0xbfd2f5, 1.9);
    moon.position.set(-60, 80, 80);
    this.scene.add(moon);
    const fill = new THREE.DirectionalLight(0x6d5f9a, 0.5);
    fill.position.set(40, 30, -50);
    this.scene.add(fill);

    // 非常灯（見た目）＋ 近くだけを照らすライトプール
    const lampMat = new THREE.MeshBasicMaterial({ color: 0x86ffb4 });
    for (const s of this.world.lightSpots) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.1), lampMat);
      m.position.set(s.x, s.y, s.z);
      this.scene.add(m);
    }
    this.lampPool = [];
    for (let i = 0; i < this.q.lamps; i++) {
      const l = new THREE.PointLight(0x7fffc0, 0, 11, 1.9);
      this.scene.add(l);
      this.lampPool.push(l);
    }

    // 懐中電灯のライトプール（人数ぶん作らず、近い人だけを灯す）
    this.torchPool = [];
    for (let i = 0; i < this.q.torches; i++) {
      const l = new THREE.SpotLight(0xffe9c0, 0, 22, 0.44, 0.45, 1.2);
      const tgt = new THREE.Object3D();
      this.scene.add(l, tgt);
      l.target = tgt;
      this.torchPool.push(l);
    }

    this.redLady = new RedLady(this.scene);
    this.cat = new Cat(this.scene);
    this.confession = new Confession(this.scene);

    this.player = new Player(this.scene, this.world);
    this.player.x = 0; this.player.z = 16;

    // 材料をばらまく
    for (let i = 0; i < this.q.pickups; i++) this.spawnPickup();

    this.ui.setRank(0);
    this.ui.setBag(this.inv);
    this.ui.setHotbar(this.built, this.selTrap);
    this.buildMs = Math.round(performance.now() - t0);
    console.log("[廃校] built in", this.buildMs, "ms /", this.world.triangles, "tris /",
      this.world.colliders.boxes.length, "colliders /", this.world.nav.nodes.length, "nav nodes");
  }

  spawnPickup() {
    const spots = this.world.spawnSpots;
    if (!spots.length || this.pickups.length > this.q.maxPickups) return;
    const s = choice(spots);
    const table = ["hokori", "hokori", "hokori", "chalk", "chalk", "uwabaki", "pan", "denchi", "nurunuru"];
    const kind = choice(table);
    const y = s.y || 0;
    const r = this.world.colliders.resolve(s.x + rand(-0.8, 0.8), s.z + rand(-0.8, 0.8), 0.3, y + 0.6);
    this.pickups.push(new Pickup(this.scene, kind, r.x, r.z, y + rand(0.45, 0.75)));
  }

  dropAt(kind, x, z, y) {
    const yy = y || 0;
    const r = this.world.colliders.resolve(x + rand(-0.6, 0.6), z + rand(-0.6, 0.6), 0.3, yy + 0.6);
    this.pickups.push(new Pickup(this.scene, kind, r.x, r.z, yy + 0.55));
  }

  // --- 人間の襲来 --------------------------------------------
  spawnWave() {
    if (this.isGuest && !this._netSpawn) return;   // お客さんは、おやに合わせてだけ出す
    this.wave++;
    const group = this.roster.next();
    const e = this.world.entry;
    for (let i = 0; i < group.members.length; i++) {
      const t = group.members[i];
      const h = new Human(this.scene, this.world, t, e.x + rand(-3, 3), e.z + rand(-2, 2));
      h.hid = this.hidNext++;
      h.speak(choice(t.idle), 4 + i * 0.4);
      h.goTo(rand(-25, 25), rand(8, 28), 0);
      this.humans.push(h);
    }
    this.ui.toast("第" + this.wave + "陣：" + group.label + "（" + group.members.length + "人）が来た…", "bad");
    this.audio.tone(180, 0.7, "sawtooth", 0.1, 90);
  }

  // --- 作成 --------------------------------------------------
  canAfford(cost) {
    for (const k in cost) if ((this.inv[k] || 0) < cost[k]) return false;
    return true;
  }
  pay(cost) { for (const k in cost) this.inv[k] -= cost[k]; this.ui.setBag(this.inv); }

  craft(kind, id) {
    const d = kind === "trap" ? TRAPS[id] : GHOSTS[id];
    if (kind === "ghost" && this.kicked < d.unlockAt) { this.audio.deny(); return; }
    if (!this.canAfford(d.cost)) {
      this.audio.deny();
      this.ui.toast("材料が足りない…", "bad");
      return;
    }
    this.pay(d.cost);
    if (kind === "trap") {
      this.built[id] = (this.built[id] || 0) + 1;
      this.bump("trapsBuilt"); this.bumpIn("byTrap", id);
      this.selTrap = Object.keys(TRAPS).indexOf(id);
      this.ui.setHotbar(this.built, this.selTrap);
      this.ui.toast(d.icon + " " + d.name + " ができた！ F で置ける", "good");
      this.audio.place();
    } else {
      const p = this.player;
      const r = this.world.colliders.resolve(p.x + rand(-2, 2), p.z + rand(-2, 2), 0.4, 1.2);
      this.summons.push(new Summon(this.scene, this.world, id, r.x, r.z));
      this.bump("ghostsSummoned"); this.bumpIn("byGhost", id);
      this.ui.toast(d.icon + " " + d.name + " を生み出した！", "gold");
      this.audio.summon();
      this.texts.push(new FloatText(this.scene, "召喚！", p.x, p.y + 2.2, p.z, "#c9a6ff", 2.2));
    }
  }

  placeTrap() {
    const keys = Object.keys(TRAPS);
    const id = keys[this.selTrap];
    if (!this.built[id]) { this.audio.deny(); this.ui.toast("その仕掛けの在庫がない（Tabで作る）", "bad"); return; }
    const p = this.player;
    const fx = p.x + Math.sin(p.yaw) * 1.7, fz = p.z + Math.cos(p.yaw) * 1.7;
    const r = this.world.colliders.resolve(fx, fz, 0.55, 1.0);
    for (const t of this.traps) if (dist(t.x, t.z, r.x, r.z) < 1.6) { this.audio.deny(); this.ui.toast("近すぎる！", "bad"); return; }
    this.traps.push(new Trap(this.scene, id, r.x, r.z, p.yaw));
    this.built[id]--;
    this.ui.setHotbar(this.built, this.selTrap);
    this.audio.place();
    this.ui.toast(TRAPS[id].name + " を設置した", "good");
  }

  // --- 回収（置いた仕掛け・おばけを取りもどす） ---------------
  //  近くの仕掛けは在庫にもどり、おばけは材料にもどる。
  //  持ちなおして置きなおせるので、配置を何度でもやりなおせる。
  retrieve() {
    const p = this.player;
    let best = null, bd = 3.4, kind = null;
    for (const tr of this.traps) {
      const d = dist(tr.x, tr.z, p.x, p.z);
      if (d < bd) { bd = d; best = tr; kind = "trap"; }
    }
    for (const s of this.summons) {
      const d = dist(s.x, s.z, p.x, p.z);
      if (d < bd) { bd = d; best = s; kind = "ghost"; }
    }
    if (!best) {
      this.audio.deny();
      this.ui.toast("回収できるものが近くにない", "bad");
      return;
    }
    if (kind === "trap") {
      this.built[best.id] = (this.built[best.id] || 0) + 1;
      this.selTrap = Object.keys(TRAPS).indexOf(best.id);
      this.ui.setHotbar(this.built, this.selTrap);
      this.texts.push(new FloatText(this.scene, "回収", best.x, 1.8, best.z, "#b6ffd0", 1.5));
      this.ui.toast(best.def.name + " を回収した（F でまた置ける）", "good");
      best.dispose();
      this.traps.splice(this.traps.indexOf(best), 1);
    } else {
      // 召喚したおばけは、材料の半分をかえしてくれる
      let back = 0;
      for (const k in best.def.cost) {
        const n = Math.max(1, Math.round(best.def.cost[k] * 0.5));
        this.inv[k] = (this.inv[k] || 0) + n;
        back += n;
      }
      this.ui.setBag(this.inv);
      this.texts.push(new FloatText(this.scene, "…おやすみ", best.x, 2.0, best.z, "#c9a6ff", 1.6));
      this.ui.toast(best.def.name + " を回収した（材料 " + back + " こ もどった）", "good");
      best.dispose();
      this.summons.splice(this.summons.indexOf(best), 1);
    }
    this.bump("retrieved");
    this.audio.place();
  }

  // --- おどかす ----------------------------------------------
  doScare() {
    const p = this.player;
    if (p.scareCooldown > 0) return;
    let best = null, bd = 5.2;
    for (const h of this.humans) {
      if (h.out) continue;
      const d = dist(p.x, p.z, h.x, h.z);
      if (d < bd && this.world.colliders.lineOfSight(p.x, p.z, h.x, h.z, 1.3, 0.6)) { bd = d; best = h; }
    }
    p.scareCooldown = 1.5;
    p.scarePose = 0.75;
    // 告白の最中なら、台なしにする（材料はどっさり）
    if (this.confession && this.confession.active &&
        dist(this.confession.g.position.x, this.confession.g.position.z, p.x, p.z) < 6) {
      this.confession.interrupt();
      this.audio.scream(1.2);
      this.bump("ruined");
      this.ui.toast("💔 告白を台なしにしてしまった…", "bad");
      for (let i = 0; i < 6; i++) this.dropAt("onnen", this.confession.g.position.x, this.confession.g.position.z, 0);
      return;
    }
    if (!best) {
      this.audio.tone(420, 0.14, "triangle", 0.06, 260);
      this.texts.push(new FloatText(this.scene, "わっ！", p.x, p.y + 2.1, p.z, "#8fa8c8", 1.4));
      return;
    }

    // 背後からの不意打ちはよく効く
    const ang = Math.atan2(p.x - best.x, p.z - best.z);
    let diff = Math.abs(((ang - best.yaw + Math.PI) % (Math.PI * 2)) - Math.PI);
    const behind = diff > 1.7;
    let amount = 34 * (behind ? 1.75 : 1.0) * (bd < 2.5 ? 1.2 : 1.0);
    if (best.seenGhostT > 0.2) amount *= 0.7;      // 見られていると効きが悪い

    const eff = best.addFear(amount, p.x, p.z, "direct", "おどかし");
    if (this.net.on) this.net.reportScare(best.hid, amount, "direct");
    this.texts.push(new FloatText(this.scene, "わっ！", p.x, p.y + 2.1, p.z, "#ffe27a", 2.3));

    if (eff > 0) {
      this.bump("scares"); this.best("biggest", eff);
      if (behind) this.bump("behind");
      if (best.lastCombo) this.bump("combos");
      this.audio.scare();
      this.audio.scream(best.type.courage < 90 ? 1.35 : 1);
      this.ui.flash(behind ? 0.5 : 0.28);
      this.scareFx = 0.85;
      const tag = best.lastCombo ? "たたみかけ！ +" : behind ? "ふいうち成功！ +" : "+";
      this.texts.push(new FloatText(this.scene, tag + Math.round(eff),
        best.x, 2.9, best.z, best.lastCombo ? "#9dffe0" : behind ? "#ff8ac4" : "#ffd45e", (behind || best.lastCombo) ? 2.2 : 1.7));
      const drop = best.takeDrop();
      if (drop) { this.dropAt(drop, best.x, best.z, best.y); this.texts.push(new FloatText(this.scene, MATERIALS[drop].icon + "落とした", best.x, 2.0, best.z, "#7fe8b8", 1.5)); }
    } else {
      this.bump("laughed");
      this.audio.laugh();
      this.texts.push(new FloatText(this.scene, "笑われた…", best.x, 2.7, best.z, "#8fa8c8", 1.6));
    }
  }

  // --- 人間が逃げ切った --------------------------------------
  onEscape(h) {
    this.kicked++;
    this.bumpIn("byHuman", h.name);
    this.best("bestWave", this.wave);
    const before = this.rankName;
    const r = this.ui.setRank(this.kicked);
    this.ui.toast("🎉 " + h.name + " を追い出した！（計 " + this.kicked + " 人）", "gold");
    this.audio.escape();
    for (let i = 0; i < 3; i++) this.dropAt("onnen", this.world.exit.x + rand(-4, 4), 30 + rand(-3, 3));
    this.dropAt("onnen", h.x, h.z, h.y);
    if (r.name !== before) {
      this.rankName = r.name;
      this.audio.rankUp();
      this.ui.toast("👑 ランクアップ！ " + r.name, "gold");
      setTimeout(() => this.ui.toast(r.note, "gold"), 900);
    }
  }

  // --- 毎フレーム --------------------------------------------
  update(dt, t) {
    const inp = this.input, p = this.player, w = this.world;

    // 遊んだ時間と自動セーブ
    if (this.profile) {
      this.profile.playSeconds = (this.profile.playSeconds || 0) + dt;
      this._autosaveT = (this._autosaveT || 0) + dt;
      if (this._autosaveT > 45) this.saveNow(false);
    }

    // メニュー・ポーズ
    if (inp.once("Tab")) {
      this.ui.toggleCraft();
      if (this.ui.craftOpen) inp.unlock(); else if (!this.touch) inp.lock();
    }
    if (inp.once("Escape")) {
      if (this.ui.craftOpen) { this.ui.closeCraft(); if (!this.touch) inp.lock(); }
      else this.setPaused(!this.paused);
    }
    // ポーズ中は S でセーブ、H でホームへ
    if (this.paused) {
      if (inp.once("KeyS")) { this.saveNow(true); }
      if (inp.once("KeyH")) { this.goHome(); return; }
    }
    if (this.ui.craftOpen || this.paused) { w.update(0, t); this.sky.update(0, t); this.renderer.render(this.scene, this.camera); inp.endFrame(); return; }

    // 仕掛けの選択
    for (let i = 0; i < 6; i++) if (inp.once("Digit" + (i + 1))) { this.selTrap = i; this.audio.click(); }
    if (inp.wheel) { this.selTrap = (this.selTrap + inp.wheel + 6) % 6; this.audio.click(); }
    if (inp.once("KeyF")) this.placeTrap();
    if (inp.once("KeyR")) this.retrieve();
    if (inp.once("KeyE")) this.doScare();

    p.update(dt, inp, this.camera, t);
    w.update(dt, t);
    this.sky.update(dt, t);

    // --- 材料の自動回収 ------------------------------------
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const it = this.pickups[i];
      it.update(dt, t);
      if (dist(it.x, it.z, p.x, p.z) < 1.35 && Math.abs(it.y - p.y) < 1.8) {
        this.inv[it.kind] = (this.inv[it.kind] || 0) + 1;
        this.bump("materials");
        this.audio.pickup();
        this.texts.push(new FloatText(this.scene, MATERIALS[it.kind].icon + "+1", it.x, it.y + 0.9, it.z, "#9fe8ff", 1.15));
        it.dispose();
        this.pickups.splice(i, 1);
        if (this.ui.craftOpen) this.ui.renderCraft();
      }
    }
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) { this.spawnTimer = rand(7, 13); this.spawnPickup(); }

    // --- 人間 ----------------------------------------------
    const ctx = { onEscape: (h) => this.onEscape(h) };
    let alive = 0;
    for (const h of this.humans) {
      if (h.out) continue;
      alive++;
      // 仲間が近くにいるか（ひとりだと怖さ倍率アップ）
      h.alone = true;
      for (const o of this.humans) if (o !== h && !o.out && dist(o.x, o.z, h.x, h.z) < 9) { h.alone = false; break; }
      if (this.isGuest) { h.updateRemote(dt, t, ctx); continue; }
      h.update(dt, t, ctx);

      // おばけが見えていると、じわじわ怖くなる
      if (!p.phasing && h.canSee(p.x, p.y, p.z, 16)) {
        h.seenGhostT = 0.5;
        if (h.state === "wander") {
          h.fear += dt * 4.2;
          if (h.fear > h.maxFear * 0.35 && Math.random() < dt * 0.6) {
            h.state = "spooked"; h.stateT = 1.4; h.fearSrc = { x: p.x, z: p.z };
            h.speak(choice(h.type.scared), 2.4);
          }
          if (h.fear >= h.maxFear) h.addFear(1, p.x, p.z, "stare");
        }
      }
    }
    // 退場した人間を片付ける
    for (let i = this.humans.length - 1; i >= 0; i--) {
      const h = this.humans[i];
      if (h.out) {
        h.outT = (h.outT || 0) + dt;
        if (h.outT > 4) { this.scene.remove(h.group); this.humans.splice(i, 1); }
      }
    }

    // --- 回収の案内 -----------------------------------------
    {
      let near = false;
      for (const tr of this.traps) if (dist(tr.x, tr.z, p.x, p.z) < 3.4) { near = true; break; }
      if (!near) for (const s of this.summons) if (dist(s.x, s.z, p.x, p.z) < 3.4) { near = true; break; }
      if (near !== this.nearPlaced) {
        this.nearPlaced = near;
        const el = document.getElementById("bTake");
        if (el) el.classList.toggle("ready", near);
      }
    }

    // --- 仕掛けの発動 ---------------------------------------
    for (const tr of this.traps) {
      tr.update(dt, t);
      if (tr.cool > 0) continue;
      for (const h of this.humans) {
        if (h.out) continue;
        const d = dist(tr.x, tr.z, h.x, h.z);
        if (d > tr.def.radius) continue;
        if (!w.colliders.lineOfSight(tr.x, tr.z, h.x, h.z, 1.2, 0.7)) continue;
        const eff = h.addFear(tr.def.fear, tr.x, tr.z, "trap:" + tr.id, tr.def.name);
        if (this.net.on) this.net.reportScare(h.hid, tr.def.fear, "trap:" + tr.id);
        tr.fire();
        this.bump("trapsFired");
        if (dist(tr.x, tr.z, p.x, p.z) < 34) this.audio.trapSound(tr.id);
        this.texts.push(new FloatText(this.scene, tr.def.line, tr.x, 2.4, tr.z, eff > 0 ? "#ffb3e0" : "#8fa8c8", 1.9));
        if (eff > 0) {
          this.audio.scream(h.type.courage < 90 ? 1.3 : 1);
          const drop = h.takeDrop();
          if (drop) this.dropAt(drop, h.x, h.z, h.y);
          // 理科室・音楽室の備品も呼応する
          for (const pr of w.props) {
            if ((tr.id === "piano" && pr.kind === "piano") || (tr.id === "jintai" && pr.kind === "jintai")) {
              if (dist(pr.x, pr.z, tr.x, tr.z) < 40) pr.excited = 2.5;
            }
          }
        }
        break;
      }
    }

    // --- 召喚したおばけ -------------------------------------
    for (let i = this.summons.length - 1; i >= 0; i--) {
      const s = this.summons[i];
      const res = s.update(dt, t, this.humans);
      if (res) {
        const eff = res.human.addFear(res.amount, s.x, s.z, "summon:" + s.id, s.def.name);
        this.texts.push(new FloatText(this.scene, res.line, s.x, 2.3, s.z, eff > 0 ? "#b6ffd0" : "#8fa8c8", 1.8));
        if (eff > 0) {
          this.audio.scream(res.human.type.courage < 90 ? 1.3 : 1);
          const drop = res.human.takeDrop();
          if (drop) this.dropAt(drop, res.human.x, res.human.z, res.human.y);
        }
      }
      if (s.dead) {
        this.texts.push(new FloatText(this.scene, "…成仏", s.x, 2.0, s.z, "#8fa8c8", 1.5));
        s.dispose();
        this.summons.splice(i, 1);
      }
    }

    // --- 浮き文字 -------------------------------------------
    for (let i = this.texts.length - 1; i >= 0; i--) {
      this.texts[i].update(dt);
      if (this.texts[i].dead) this.texts.splice(i, 1);
    }

    // --- 次の波 ---------------------------------------------
    if (alive === 0) {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0 && !this.isGuest) { this.spawnWave(); this.waveTimer = 26; }
    } else this.waveTimer = 26;

    // --- 隠し要素 -------------------------------------------
    if (this.redLady && this.redLady.update(dt, w, p, this.humans) === "appeared") {
      this.audio.tone(70, 1.6, "sine", 0.05, 55);
      this.bump("redLady");
      if (!this.sawRedLady) { this.sawRedLady = true; this.ui.toast("⋯窓の外を、なにかが通った気がした", "bad"); }
    }
    if (this.cat && this.cat.update(dt, t, w, p) === "appeared") {
      if (!this.sawCat) { this.sawCat = true; this.ui.toast("🐈 …ネコだ。こっちを見ている", "good"); }
      this.bump("cat");
    }
    if (this.cat && this.cat.active && !this.cat.found &&
        dist(this.cat.g.position.x, this.cat.g.position.z, p.x, p.z) < 2.2) {
      this.cat.found = true;
      this.bump("catClose");
      this.ui.toast("🐈 ネコに近づけた（おばけは怖くないらしい）", "gold");
      this.texts.push(new FloatText(this.scene, "にゃー", this.cat.g.position.x, 0.9, this.cat.g.position.z, "#ffe27a", 1.5));
      for (let i = 0; i < 3; i++) this.dropAt("onnen", this.cat.g.position.x, this.cat.g.position.z, 0);
    }
    if (this.confession && this.confession.update(dt, t, w, p) === "appeared") {
      if (!this.sawConfess) { this.sawConfess = true; this.ui.toast("💌 体育館の裏に、だれかいる…", "good"); }
      this.bump("confession");
    }

    for (const pr of w.props) {
      if (pr.kind !== "poop" || pr.found) continue;
      if (dist(pr.x, pr.z, p.x, p.z) > 1.6) continue;
      if (Math.abs(pr.mesh.position.y - p.y) > 1.8) continue;
      pr.found = true;
      this.bump("poop");
      this.audio.laugh();
      this.ui.toast("💩 見つけてしまった…（誰のだ）", "gold");
      this.texts.push(new FloatText(this.scene, "うわっ", pr.x, 1.6, pr.z, "#c9a06a", 1.8));
      for (let i = 0; i < 4; i++) this.dropAt("onnen", pr.x, pr.z, pr.mesh.position.y - 0.6);
    }

    // --- 懐中電灯ライトプール（プレイヤーに近い人だけ灯す） --
    const lit = this.humans
      .filter((h) => !h.out)
      .map((h) => ({ h, d: dist(h.x, h.z, p.x, p.z) }))
      .sort((a, b) => a.d - b.d);
    for (let i = 0; i < this.torchPool.length; i++) {
      const l = this.torchPool[i], e = lit[i];
      if (!e || e.d > 46) { l.intensity = 0; continue; }
      const h = e.h;
      const c = Math.cos(h.yaw), sn = Math.sin(h.yaw);
      // 手もとの位置（体のローカル座標 0.3, 1.1, 0.25 をワールドへ）
      const S = HUMAN_SCALE;
      l.position.set(h.x + 0.3 * S * c + 0.25 * S * sn, 1.1 * S, h.z - 0.3 * S * sn + 0.25 * S * c);
      // 照らす先（ふらつきぶんを横にずらす）
      const ax = (0.3 + (h.sway || 0) * 2.4) * S;
      l.target.position.set(h.x + ax * c + 8 * sn, (h.torchAimY !== undefined ? h.torchAimY : 0.55) * S, h.z - ax * sn + 8 * c);
      l.target.updateMatrixWorld();
      l.intensity = h.torchHot ? 26 : 20;
    }

    // --- 非常灯ライトプール ---------------------------------
    const spots = w.lightSpots
      .filter((s) => Math.abs((s.y - 1.8) - p.y) < FLOOR_HEIGHT_HALF)
      .map((s) => ({ s, d: dist(s.x, s.z, p.x, p.z) }))
      .sort((a, b) => a.d - b.d);
    for (let i = 0; i < this.lampPool.length; i++) {
      const l = this.lampPool[i], e = spots[i];
      if (e && e.d < 26) {
        l.position.set(e.s.x, e.s.y, e.s.z);
        l.intensity = 5.5 * clamp(1 - e.d / 26, 0, 1) * (0.85 + Math.sin(t * 9 + i) * 0.15);
      } else l.intensity = 0;
    }

    // 端末の向きの変化を取りこぼさないための保険
    if (this.touch) {
      this._orientT = (this._orientT || 0) + dt;
      if (this._orientT > 0.5) { this._orientT = 0; this.touch.checkOrientation(); this.resize(); }
    }

    this.updateHud(dt, t);
    this.renderer.render(this.scene, this.camera);
    inp.endFrame();
  }

  // --- HUD ---------------------------------------------------
  updateHud(dt, t) {
    const p = this.player, w = this.world;
    this.ui.setPlace(w.roomAt(p.x, p.z, p.y));
    this.ui.setBag(this.inv);
    this.ui.setHotbar(this.built, this.selTrap);
    this.ui.setHumans(this.humans, this.netPeerList());
    this.ui.setGauges(Math.round(p.phase), Math.round(p.stamina));

    this.scareFx = Math.max(0, this.scareFx - dt * 1.4);
    let danger = this.scareFx;
    for (const h of this.humans) if (!h.out && h.state === "panic" && dist(h.x, h.z, p.x, p.z) < 12) danger = Math.max(danger, 0.35);
    this.ui.vignette(danger);

    if (this.net.on) this.syncNet(dt, t);

    // 状況に応じたヒント
    let hint = "";
    let near = null, nd = 5.2;
    for (const h of this.humans) {
      if (h.out) continue;
      const d = dist(p.x, p.z, h.x, h.z);
      if (d < nd) { nd = d; near = h; }
    }
    if (this.nearPlaced) hint = this.touch ? "「もどす」で回収できる" : "R キーで回収できる";
    if (w.inStairShaft && w.isIndoors(p.x, p.z, p.y) && w.inStairShaft(p.x, p.z)) {
      hint = "階段：おくへ進むと上の階、てまえへ戻ると下の階";
    }
    for (const b of w.colliders.near(p.x, p.z, 2.2)) {
      if (b.tag === "barrier") hint = "上の階へ続く結界。まだ力が足りない…";
    }
    if (near) hint = "E で " + near.name + " をおどかす" + (p.scareCooldown > 0 ? "（ためている…）" : "");
    else if (!hint && this.pickups.length && this.kicked === 0 && this.wave === 0) hint = "光るカケラに近づくと材料が手に入る";
    this.ui.hint(hint);
  }

  loop = (now) => {
    requestAnimationFrame(this.loop);
    if (!this.started) return;
    const dt = Math.min(0.05, (now - (this._last || now)) / 1000);
    this._last = now;
    this._t = (this._t || 0) + dt;
    try {
      this.update(dt, this._t);
    } catch (e) {
      console.error(e);
      this.started = false;
      document.getElementById("loading").textContent = "エラー: " + e.message;
    }
  };

  // ==========================================================
  //  ホーム画面とのやりとり・セーブ
  // ==========================================================
  ensureProfile() {
    let n = S.currentName();
    if (!n) {
      if (!S.getProfile("ゲスト")) S.createProfile("ゲスト");
      else S.setCurrent("ゲスト");
      n = "ゲスト";
    }
    return S.getProfile(n) || S.blank("ゲスト");
  }

  // いまの状態をセーブデータに写す
  collectSave() {
    const p = this.profile;
    if (!p) return null;
    p.hasSave = true;
    p.kicked = this.kicked;
    p.wave = this.wave;
    p.rank = this.rankName;
    p.inv = { ...this.inv };
    p.built = { ...this.built };
    p.selTrap = this.selTrap;
    p.traps = this.traps.map((t) => ({ id: t.id, x: +t.x.toFixed(2), z: +t.z.toFixed(2), uses: t.uses }));
    p.pos = { x: +this.player.x.toFixed(2), z: +this.player.z.toFixed(2) };
    p.playSeconds = Math.round(p.playSeconds || 0);
    p.stats = p.stats || S.blank(p.name).stats;
    p.stats.bestWave = Math.max(p.stats.bestWave || 0, this.wave);
    return p;
  }

  saveNow(showToast) {
    if (!this.profile) return false;
    const ok = S.saveProfile(this.collectSave());
    if (showToast) {
      if (ok) { this.ui.toast("💾 「" + this.profile.name + "」の記録をセーブしました", "good"); this.audio.pickup(); }
      else { this.ui.toast("セーブできませんでした", "bad"); this.audio.deny(); }
    }
    this._autosaveT = 0;
    if (this.cloud && this.cloud.signedIn) this.cloud.push({ v: 1, profile: this.profile }).catch(() => {});
    return ok;
  }

  // セーブデータを読みこんで反映する
  applySave(p) {
    this.kicked = p.kicked || 0;
    this.wave = p.wave || 0;
    this.inv = { ...(p.inv || {}) };
    this.built = { ...(p.built || {}) };
    this.selTrap = p.selTrap || 0;
    for (const t of p.traps || []) {
      if (!TRAPS[t.id]) continue;
      const tr = new Trap(this.scene, t.id, t.x, t.z, 0);
      tr.uses = t.uses || 0;
      this.traps.push(tr);
    }
    if (p.pos) { this.player.x = p.pos.x; this.player.z = p.pos.z; }
    this.rankName = this.ui.setRank(this.kicked).name;
    this.ui.setBag(this.inv);
    this.ui.setHotbar(this.built, this.selTrap);
  }

  // 前回のゲームの後片づけ
  resetSession() {
    for (const h of this.humans) this.scene.remove(h.group);
    for (const t of this.traps) t.dispose();
    for (const s of this.summons) s.dispose();
    for (const it of this.pickups) it.dispose();
    for (const x of this.texts) this.scene.remove(x.sprite);
    this.humans = []; this.traps = []; this.summons = []; this.pickups = []; this.texts = [];
    this.inv = {}; this.built = {};
    this.kicked = 0; this.wave = 0; this.selTrap = 0;
    this.waveTimer = 0; this.spawnTimer = 6; this.scareFx = 0;
    this.rankName = RANKS[0].name;
    this.paused = false;
    this.ui.closeCraft();
    this.player.x = 0; this.player.z = 16; this.player.y = 1.5;
    this.player.vx = 0; this.player.vz = 0; this.player.camYaw = Math.PI;
    for (let i = 0; i < this.q.pickups; i++) this.spawnPickup();
    this.ui.setRank(0);
    this.ui.setBag(this.inv);
    this.ui.setHotbar(this.built, this.selTrap);
    this.ui.setHumans(this.humans);
    this.ui.vignette(0);
  }

  startGame(cont) {
    this.profile = this.ensureProfile();
    this.resetSession();
    if (cont && this.profile.hasSave) this.applySave(this.profile);

    this.started = true;
    this.setPaused(false);
    this.audio.start();
    this.ui.hideScreen();
    if (this.touch) goFullscreen(); else this.input.lock();
    this._last = performance.now();
    this._autosaveT = 0;

    if (cont && this.profile.hasSave) {
      this.ui.toast("おかえり、" + this.profile.name + "。つづきから始めます", "good");
      setTimeout(() => this.spawnWave(), 3000);
    } else {
      this.ui.toast("材料を集めて、人間たちを追い出そう！", "good");
      setTimeout(() => this.spawnWave(), 3500);
    }
  }


  // ============================================================
  //  ともだちと一緒にあそぶ
  //   ・部屋を作った人（おや）が人間たちを動かす
  //   ・ほかの人は、その人間たちを見て、おどかした合図を送る
  //   ・おばけの位置は、みんながそれぞれ送りあう
  // ============================================================
  get isGuest() { return this.net.on && !this.net.isHost; }

  netPeerList() {
    if (!this.net.on) return null;
    return Array.from(this.net.peers.values()).map((p) => ({ name: p.name }));
  }

  // 部屋に入ったら、来る人たちの順番をそろえる
  netReseed(seed) {
    this.roster = new Roster(100, seed);
    for (const h of this.humans) this.scene.remove(h.group);
    this.humans = [];
    this.wave = 0;
    this.hidNext = 1;
    this.waveTimer = this.net.isHost ? 4 : 9e9;
  }

  async roomCreate(name) {
    const r = await this.net.create(name || (this.profile && this.profile.name) || "おばけ");
    if (!r.ok) return r;
    this.netReseed(r.data.seed);
    this.ui.toast("🚪 あいことば「" + this.net.code + "」でともだちを呼ぼう！", "gold");
    this.audio.rankUp();
    return r;
  }

  async roomJoin(code, name) {
    const r = await this.net.join(code, name || (this.profile && this.profile.name) || "おばけ");
    if (!r.ok) return r;
    this.netReseed(r.data.seed);
    this.ui.toast("🚪 部屋「" + this.net.code + "」に入りました", "gold");
    this.audio.rankUp();
    return r;
  }

  async roomLeave() {
    await this.net.leave();
    for (const [, g] of this.peerGhosts) g.dispose();
    this.peerGhosts.clear();
    this.waveTimer = 6;
    this.ui.toast("ひとりで遊ぶモードに もどりました", "good");
  }

  hostSnapshot() {
    const hs = [];
    for (const h of this.humans) {
      hs.push([h.hid, +h.x.toFixed(2), +h.y.toFixed(2), +h.z.toFixed(2), +h.yaw.toFixed(2),
        Math.round(h.fear), NET_STATES.indexOf(h.state), h.out ? 1 : 0]);
    }
    return { wave: this.wave, hs };
  }

  applyRemoteWorld(rw) {
    let guard = 0;
    this._netSpawn = true;
    while (this.wave < rw.wave && guard++ < 24) this.spawnWave();
    this._netSpawn = false;   // 同じ順番で同じ人たちが来る
    const by = new Map();
    for (const h of this.humans) by.set(h.hid, h);
    for (const a of rw.hs || []) {
      const h = by.get(a[0]);
      if (!h) continue;
      if (h.setNet(a[1], a[2], a[3], a[4], a[5], NET_STATES[a[6]] || "wander", a[7])) this.onEscape(h);
    }
  }

  syncNet(dt, t) {
    const p = this.player;
    const me = {
      x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), yaw: +p.yaw.toFixed(2),
      p: p.phasing ? 1 : 0, s: p.scarePose > 0 ? 1 : 0,
    };
    const placed = [];
    for (const tr of this.traps) placed.push({ k: "t", id: tr.id, x: +tr.x.toFixed(1), z: +tr.z.toFixed(1) });
    for (const s of this.summons) placed.push({ k: "g", id: s.id, x: +s.x.toFixed(1), z: +s.z.toFixed(1) });

    this.net.update(dt, me, placed, this.net.isHost ? this.hostSnapshot() : null);

    if (this.net.isHost) {
      // ともだちが おどかしたぶんを、こちらで反映する
      for (const a of this.net.takeActs()) {
        if (a.k !== "scare") continue;
        for (const h of this.humans) {
          if (h.hid !== a.hid || h.out) continue;
          h.addFear(a.a, h.x, h.z, a.w || "mate", "ともだち");
          break;
        }
      }
    } else if (this.net.remoteWorld) {
      this.applyRemoteWorld(this.net.remoteWorld);
    }

    // ともだちのおばけを出す
    const seen = new Set();
    for (const [pid, pr] of this.net.peers) {
      seen.add(pid);
      let g = this.peerGhosts.get(pid);
      if (!g) { g = new PeerGhost(this.scene, this.peerGhosts.size, pr.name); this.peerGhosts.set(pid, g); }
      g.setName(pr.name);
      g.update(dt, t, pr);
    }
    for (const [pid, g] of this.peerGhosts) {
      if (!seen.has(pid)) { g.dispose(); this.peerGhosts.delete(pid); }
    }
    this.ui.setRoom(this.net);
  }

  setPaused(on) {
    this.paused = on;
    document.getElementById("pause").classList.toggle("on", on);
    if (on) this.input.unlock();
    else if (!this.touch && this.started) this.input.lock();
    if (on && this.touch) this.touch.release();
  }

  goHome() {
    if (this.net.on) this.roomLeave();
    this.ui.closeRoom();
    // ゲーム中でなくても、ポーズ画面は必ず閉じる
    this.setPaused(false);
    this.ui.closeCraft();
    if (!this.started) { this.ui.showScreen(); this.home.render(); return; }
    const ok = this.saveNow(false);
    this.started = false;
    this.setPaused(false);
    this.ui.closeCraft();
    this.input.unlock();
    if (this.touch) this.touch.release();
    this.ui.showScreen();
    this.home.show(this.home.tab);
    this.home.render();
    if (ok) this.ui.toast("記録をセーブしました", "good");
  }

  // --- クラウド（メールでログインしている人だけ） -------------
  async pushToCloud() {
    if (!this.cloud || !this.cloud.signedIn) return { ok: false, why: "ログインしていません" };
    const p = this.started ? this.collectSave() : (this.profile || this.ensureProfile());
    if (this.started) S.saveProfile(p);
    return await this.cloud.push({ v: 1, profile: p });
  }

  async pullFromCloud() {
    if (!this.cloud || !this.cloud.signedIn) return { ok: false, why: "ログインしていません" };
    const r = await this.cloud.pull();
    if (!r.ok) return r;
    if (!r.payload || !r.payload.profile) return { ok: false, why: "あずけた記録がまだありません" };
    const p = r.payload.profile;
    if (!p.name || p.name === "ゲスト") p.name = this.cloud.name || "クラウド";
    S.saveProfile(p);
    S.setCurrent(p.name);
    this.profile = S.getProfile(p.name);
    return { ok: true };
  }

  // 統計をためる（プロフィール画面に出る）
  bump(key, n) {
    if (!this.profile || !this.profile.stats) return;
    this.profile.stats[key] = (this.profile.stats[key] || 0) + (n === undefined ? 1 : n);
  }
  bumpIn(bucket, key) {
    if (!this.profile || !this.profile.stats) return;
    const b = this.profile.stats[bucket] || (this.profile.stats[bucket] = {});
    b[key] = (b[key] || 0) + 1;
  }
  best(key, v) {
    if (!this.profile || !this.profile.stats) return;
    if (v > (this.profile.stats[key] || 0)) this.profile.stats[key] = v;
  }
}

// ============================================================
const game = new Game();
window.game = game;
game.build();
game.loop(performance.now());

game.resize();
game.cloud = new Cloud();
game.home = new Home(game);
game.cloud.restore().then((ok) => {
  if (ok && game.home.tab === "login" && game.home.sub === "mail") game.home.renderLogin();
});
document.getElementById("loading").textContent =
  "廃校の準備完了（" + game.world.triangles.toLocaleString() + " 面 / " + game.buildMs + "ms）";
game.home.show("play");

// 閉じる・タブを切りかえる直前にも自動でセーブする
addEventListener("beforeunload", () => { if (game.started) game.saveNow(false); });
addEventListener("pagehide", () => { if (game.started) game.saveNow(false); });
document.addEventListener("visibilitychange", () => {
  if (document.hidden && game.started) game.saveNow(false);
});

// PCではポインタが画面に吸着してボタンを押せないので、
// 上の帯は「ESCでメニュー」の案内に置きかえる（タッチ端末ではボタンのまま）
if (!isTouchDevice()) {
  const bar = document.getElementById("sysbar");
  if (bar) bar.innerHTML = '<div class="sysbtn" style="cursor:default;opacity:.75">' +
    '<kbd style="font-family:var(--px);font-size:10px;border:1px solid var(--edge);border-radius:5px;' +
    'padding:2px 6px;margin-right:7px">ESC</kbd>ポーズ・セーブ・ホーム</div>';
}

// --- スマホ・タブレットならタッチ操作に切り替える ------------
if (isTouchDevice()) {
  game.touch = new TouchControls(game.input, game);
  const keys = document.querySelector(".keys");
  if (keys) {
    keys.innerHTML = [
      ["左下のまる", "うごく（はじまで倒すとダッシュ）"],
      ["画面をなぞる", "見まわす"],
      ["😱 おどかす", "人間をおどろかす"],
      ["👻 すりぬけ", "おしているあいだ壁を通る"],
      ["⬆ うく", "ふわっと浮かぶ"],
      ["📍 おく", "えらんだ仕掛けを置く"],
      ["🛠 おばけ工房", "仕掛けとおばけを作る"],
      ["下のならび", "仕掛けをえらぶ（タップ）"],
    ].map((r) => "<div><b>" + r[0] + "</b>" + r[1] + "</div>").join("");
  }
  const th = document.getElementById("touchHint");
  if (th) {
    th.style.display = "block";
    th.innerHTML = "左下のまるで移動、画面をなぞって見まわす。<br>右下のボタンで おどかす・すりぬけ・うく・仕掛けを置く。";
  }
} else {
  const keys = document.querySelector(".keys");
  if (keys) {
    keys.innerHTML = [
      ["WASD", "うごく"], ["マウス", "見まわす"], ["Shift", "ダッシュ"],
      ["Space/C", "浮く・沈む"], ["E", "おどかす"], ["Q", "すりぬけ（壁を通る）"],
      ["Tab", "おばけ工房"], ["F", "選んだ仕掛けを置く"], ["1〜6", "仕掛けをえらぶ"],
      ["Esc", "ポーズ"],
    ].map((r) => "<div><b>" + r[0] + "</b>" + r[1] + "</div>").join("");
  }
  document.getElementById("app").addEventListener("click", () => {
    if (game.started && !game.ui.craftOpen && !game.paused && !game.input.locked) game.input.lock();
  });
}

console.log("[廃校] 画質:", game.q.name, "/ 懐中電灯", game.q.torches, "本 / 塵", game.q.dust);
