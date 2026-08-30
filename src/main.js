import * as THREE from "../lib/three.module.js";
import { buildWorld, clampPlay, inPlay } from "./world.js";
import { buildStageWorld } from "./stageworld.js";
import { STAGES, stageById, stageUnlocked, requestedStage, stageUrl } from "./stages.js";
import { buildSky } from "./sky.js";
import { TouchControls, isTouchDevice, goFullscreen } from "./touch.js";
import { Home } from "./home.js";
import { verifyAdminPreview } from "./admin-preview.js";
import * as S from "./save.js";
import { Cloud } from "./cloud.js";
import { Player } from "./player.js";
import { Human, HUMAN_SCALE } from "./human.js";
import { Pickup, Trap, Summon, FloatText, RedLady, Cat, Confession, PeerGhost } from "./entities.js";
import { Net } from "./net.js";
import { Battle } from "./battle.js";
import { checkReturn } from "./support.js";
import { UI } from "./ui.js";
import { Audio } from "./audio.js";
import { MATERIALS, TRAPS, GHOSTS, RANKS, RARITY, pickRarity, CHARS, EXCHANGE, HUMAN_DROPS, hiddenUnlockReady,
  validOwnedChars, UPGRADES, UPG_MAX, UPG_STEP, upgCost, PARTS, PAINTS, paintById } from "./data.js";
import { Roster } from "./people.js";
import { clamp, rand, randi, choice, dist, nearOnFloor, makeRng } from "./util.js";
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
  if (touch && small) return { name: "mobile", torches: 2, lamps: 2, dust: 200, grass: 0.4, pickups: 40, maxPickups: 70, pixelRatio: 1.0, aa: false, far: 190, fov: 68 };
  if (touch) return { name: "tablet", torches: 3, lamps: 3, dust: 380, grass: 0.65, pickups: 50, maxPickups: 90, pixelRatio: 1.25, aa: true, far: 220, fov: 65 };
  return { name: "desktop", torches: 5, lamps: 4, dust: 700, grass: 1, pickups: 60, maxPickups: 110, pixelRatio: 1.75, aa: true, far: 260, fov: 62 };
}

// ともだちと やったとき わけあう 材料
const SHARE_DROPS = HUMAN_DROPS;

// マップに いっぺんに いられる 人数
const MAX_ALIVE = 15;

const NET_STATES = ["wander", "investigate", "spooked", "panic", "flee"];

class Game {
  constructor(adminPreview = false) {
    const savedName = S.currentName();
    const savedProfile = savedName ? S.getProfile(savedName) : null;
    this.adminPreview = adminPreview;
    this.stageId = requestedStage(savedProfile ? savedProfile.kicked : 0, adminPreview);
    this.stage = stageById(this.stageId);
    this.q = pickQuality();
    this.renderer = new THREE.WebGLRenderer({ antialias: this.q.aa, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.q.pixelRatio));
    this.renderer.setSize(Math.max(1, innerWidth || 1), Math.max(1, innerHeight || 1));
    this.renderer.setClearColor(0x0b0510);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    document.getElementById("app").appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    const fog = this.stageId === "branch" ? 0x26343a : this.stageId === "park" ? 0x171123 : 0x131a2e;
    this.scene.fog = new THREE.FogExp2(fog, this.stageId === "branch" ? 0.019 : 0.0145);
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
    this.waveRoom = new Map();      // 波の番号 → その波で 入れた人数
    this.battle = new Battle(this);  // ともだちとの おどかし勝負
    this.myScareT = new Map();      // 自分がおどかした時こく（hid → 時こく）
    this.trackHid = 0;              // さがしている人の番号（0はさがしていない）
    this.beacon = null;             // その人のところに 立てる 光の柱
    this.bindFind();
    this.scareFx = 0;
    this.rankName = RANKS[0].name;
    this.charId = "obake";
    if (this.player && this.player.setChar) this.player.setChar("obake");

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
    const worldOpts = { dust: this.q.dust, grass: this.q.grass, poopRoom: choice(toilets) };
    // 3マップを同時に置くと重くなる。選んだ1つだけを生成する。
    this.world = this.stageId === "school" ? buildWorld(this.scene, worldOpts) : buildStageWorld(this.scene, this.stageId, worldOpts);

    this.sky = buildSky(this.scene);

    // 照明（夜だけど、ちゃんと見える明るさ）
    // 見えなくならない明るさは保ちつつ、色を赤黒く寄せる
    this.scene.add(new THREE.AmbientLight(0x5b4a60, 3.0));
    this.scene.add(new THREE.HemisphereLight(0xac7f84, 0x554a40, 3.1));
    const moon = new THREE.DirectionalLight(0xf0cdae, 2.3);
    moon.position.set(-60, 80, 80);
    this.scene.add(moon);
    const fill = new THREE.DirectionalLight(0x8a4a58, 0.7);
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

    this.redLady = this.stageId === "school" ? new RedLady(this.scene) : null;
    this.cat = this.stageId === "school" ? new Cat(this.scene) : null;
    this.confession = this.stageId === "school" ? new Confession(this.scene) : null;

    this.player = new Player(this.scene, this.world);
    this.player.x = this.world.start ? this.world.start.x : 0;
    this.player.z = this.world.start ? this.world.start.z : 16;

    // 材料をばらまく
    for (let i = 0; i < this.q.pickups; i++) this.spawnPickup();

    this.ui.setRank(0);
    this.ui.setBag(this.inv);
    this.ui.setHotbar(this.built, this.selTrap);
    this.buildMs = Math.round(performance.now() - t0);
    console.log("[" + this.stage.name + "] built in", this.buildMs, "ms /", this.world.triangles, "tris /",
      this.world.colliders.boxes.length, "colliders /", this.world.nav.nodes.length, "nav nodes");
  }

  spawnPickup() {
    const spots = this.world.spawnSpots;
    if (!spots.length || this.pickups.length > this.q.maxPickups) return;
    // ともだちと遊ぶときは、みんなで 同じ たねから 出す。
    //  そうすると おなじ場所に おなじものが わく
    const R = this.pickRng || Math.random;
    const id = ++this.pickSeq;
    const s = spots[Math.floor(R() * spots.length) % spots.length];
    const table = ["hokori", "hokori", "hokori", "chalk", "chalk", "uwabaki", "pan", "denchi", "nurunuru", "wax", "kami"];
    const kind = table[Math.floor(R() * table.length) % table.length];
    const y = s.y || 0;
    const r = this.world.colliders.resolve(
      s.x + (R() * 1.6 - 0.8), s.z + (R() * 1.6 - 0.8), 0.3, y + 0.6);
    // へんぴな場所ほど、いい色が出る
    const tier = pickRarity(s.far || 0, undefined, R);
    const p = new Pickup(this.scene, kind, r.x, r.z, y + 0.45 + R() * 0.3, tier);
    p.pid = id;                     // みんなで そろえる 通し番号
    this.pickups.push(p);
  }

  // 人間が落とすもの。おどかした場所が へんぴなら、いい色で落ちる
  dropAt(kind, x, z, y, tier) {
    const yy = y || 0;
    // 門のそとなど、おばけが 行けない所には 落とさない。
    //  ずらしたあと・かべから 押しだされたあとも、もう一度 見る
    const keepIn = this.world.clampPlay || clampPlay;
    let c = keepIn(x, z);
    const r = this.world.colliders.resolve(c.x + rand(-0.6, 0.6), c.z + rand(-0.6, 0.6), 0.3, yy + 0.6);
    c = keepIn(r.x, r.z);
    const t = tier === undefined ? pickRarity(this.remoteAt(c.x, c.z, yy) * 0.7) : tier;
    this.pickups.push(new Pickup(this.scene, kind, c.x, c.z, yy + 0.55, t));
    this.trimPickups();
  }

  // 拾いものが たまりすぎたら、遠くの 安い色から 片づける。
  //  （人間が15人になって 落としものが ふえたため。
  //    そばにあるものや、いい色のものは 消さない）
  trimPickups() {
    const cap = (this.q.maxPickups || 110) * 2;
    if (this.pickups.length <= cap) return;
    const p = this.player;
    let worst = -1, score = -1;
    for (let i = 0; i < this.pickups.length; i++) {
      const q = this.pickups[i];
      const d = dist(q.x, q.z, p.x, p.z);
      if (d < 22) continue;                       // 近くのものは のこす
      if ((q.tier || 0) >= 3) continue;           // 赤より上は のこす
      const s = d - (q.tier || 0) * 12;
      if (s > score) { score = s; worst = i; }
    }
    if (worst < 0) return;
    const q = this.pickups[worst];
    if (q.dispose) q.dispose(); else this.scene.remove(q.mesh || q.g);
    this.pickups.splice(worst, 1);
  }

  // その場所の「へんぴさ」を、近くの湧き場所から しらべる
  remoteAt(x, z, y) {
    let best = 0.35, bd = 1e9;
    for (const s of this.world.spawnSpots) {
      if (Math.abs((s.y || 0) - (y || 0)) > 2.5) continue;
      const d = dist(s.x, s.z, x, z);
      if (d < bd) { bd = d; best = s.far === undefined ? 0.35 : s.far; }
    }
    return best;
  }

  // つぎの波まで 何秒 待つか。
  //  遊びはじめは ゆっくり、なれてきたら どんどん来る。
  //  だれもいないときは 待たせない。
  nextWaveGap(alive) {
    const min = (this.profile && this.profile.playSeconds) ? this.profile.playSeconds / 60 : 0;
    // 0分で26秒 → 10分で12秒 → 20分いこう 7秒
    const base = Math.max(7, 26 - min * 1.1);
    if (alive === 0) return Math.min(5, base);
    // まだ のこっている人数が多いほど、すこし待つ
    return base * (0.7 + alive / MAX_ALIVE * 0.6);
  }

  // --- 人間の襲来 --------------------------------------------
  //  room … いま あと何人 入れるか（マップの上限まで）
  spawnWave(room) {
    if (this.isGuest && !this._netSpawn) return;   // お客さんは、おやに合わせてだけ出す
    this.wave++;
    // 人数を わたされていなければ、いまの あきを 数える
    if (room === undefined && !this._netSpawn) {
      let n = 0;
      for (const h of this.humans) if (!h.out) n++;
      room = MAX_ALIVE - n;
    }
    // お客さんは、おやが使った人数を そのまま使う
    if (this._netSpawn) room = this.waveRoom.get(this.wave);
    else if (this.net.on) {
      this.waveRoom.set(this.wave, room === undefined ? 99 : room);
      // 古いものは 捨てる（送るのは さいきんの ぶんだけ）
      if (this.waveRoom.size > 60) this.waveRoom.delete(this.wave - 60);
    }
    const group = this.roster.next();
    // 毎回、4つの門から どれかを えらんで そこから入ってくる
    const gates = this.world.gates || [{ in: this.world.entry, out: this.world.exit, name: "正門" }];
    const G = gates[Math.floor(Math.random() * gates.length)];
    const e = { x: G.in.x, z: G.in.z };
    // いま校舎にいる人と同じ名まえの人は、こんかいは来ない
    //  （番号はずらさない。ともだちと遊ぶとき、おやとお客さんで番号がそろわなくなるため）
    const live = new Set();
    for (const h0 of this.humans) if (!h0.out) live.add(h0.name);
    let came = 0;
    const made = [];
    // 入れる人数。番号（hid）は へらさずに 進めるので、
    // ともだちと遊ぶときも おやとお客さんで 番号がそろう
    const canCome = room === undefined ? 99 : Math.max(0, room);
    for (let i = 0; i < group.members.length; i++) {
      const t = group.members[i];
      const hid = this.hidNext++;
      if (live.has(t.name)) continue;
      if (came >= canCome) continue;               // マップが いっぱい
      live.add(t.name);
      came++;
      const h = new Human(this.scene, this.world, t, e.x + rand(-2.4, 2.4), e.z + rand(-2, 2));
      h.hid = hid;
      h.gate = G.out;                              // 帰るときも この門から
      h.gateIn = G.in;                             // 落としものは 門のうちがわに
      made.push(h);
      h.speak(choice(t.idle), 4 + i * 0.4);
      h.goTo(rand(-25, 25), rand(8, 28), 0);
      this.humans.push(h);
    }
    if (came === 0) return;                       // 全員かぶったときは、なにも起きない
    this.planGroup(made, G);                      // 入りかたと 道すじを 決める
    this.ui.toast("第" + this.wave + "陣：" + group.label + "（" + came + "人）が " + G.name + "から来た…", "bad");
    this.audio.tone(180, 0.7, "sawtooth", 0.1, 90);
  }

  // ============================================================
  //  交換所：かけらを、仕掛け・おばけ・すがた と ひきかえる
  // ============================================================
  canPayShards(cost) {
    for (const k in cost) if ((this.shards[k] || 0) < cost[k]) return false;
    return true;
  }
  payShards(cost) {
    for (const k in cost) this.shards[k] -= cost[k];
    this.ui.setShards(this.shards);
  }
  shardCostText(cost) {
    return Object.keys(cost).map((k) => RARITY[k].name + "×" + cost[k]).join("　");
  }

  exchange(kind, id) {
    const cost = kind === "char" ? (CHARS[id] || {}).cost : (EXCHANGE[kind === "trap" ? "traps" : "ghosts"] || {})[id];
    if (!cost || (kind === "char" && CHARS[id] && CHARS[id].hidden)) { this.audio.deny(); return; }
    if (kind === "char" && this.chars[id]) { this.setChar(id); return; }
    if (!this.canPayShards(cost)) {
      this.audio.deny();
      this.ui.toast("かけらが 足りない（" + this.shardCostText(cost) + "）", "bad");
      return;
    }
    this.payShards(cost);
    if (kind === "trap") {
      this.built[id] = (this.built[id] || 0) + 1;
      this.selTrap = Object.keys(TRAPS).indexOf(id);
      this.ui.setHotbar(this.built, this.selTrap);
      this.ui.toast(TRAPS[id].icon + " " + TRAPS[id].name + " と ひきかえた！", "good");
      this.audio.place();
    } else if (kind === "ghost") {
      const pl = this.player;
      const r = this.world.colliders.resolve(pl.x + rand(-2, 2), pl.z + rand(-2, 2), 0.4, pl.y);
      this.summons.push(new Summon(this.scene, this.world, id, r.x, r.z, this.summonFloorY()));
      this.bump("ghostsSummoned"); this.bumpIn("byGhost", id);
      this.ui.toast(GHOSTS[id].icon + " " + GHOSTS[id].name + " と ひきかえた！", "gold");
      this.audio.summon();
    } else {
      this.chars[id] = 1;
      this.bumpIn("byChar", id);
      this.ui.toast("✨ " + CHARS[id].icon + " " + CHARS[id].name + " が つかえるようになった！", "gold");
      this.audio.rankUp();
      this.setChar(id);
    }
    this.ui.renderCraft();
  }

  // すがたを 着がえる
  setChar(id) {
    if (!this.chars[id]) { this.audio.deny(); return; }
    if (this.player.setChar(id)) {
      this.charId = id;
      this.player.setUpgrades(this.upg[id]);
      this.player.setPaint(this.paint[id]);
      this.ui.toast(CHARS[id].icon + " " + CHARS[id].name + " に なった！", "good");
      this.ui.setCharChip(CHARS[id]);
      this.audio.summon();
      this.ui.renderCraft();
    }
  }

  // ============================================================
  //  グループごとの 入りかたと 道すじ
  //   ・毎回おなじ「正面から まっすぐ」に ならないよう、
  //     入りくちと 寄り道を くじで 決める
  //   ・一列でゆっくり、はぐれる子、トイレに寄る子、
  //     体育館に 寄り道する子 などを 混ぜる
  // ============================================================
  planGroup(members, gate) {
    if (!members.length) return;
    const w = this.world;
    const ways = w.ways || [];
    if (!ways.length) return;

    // 門から いちばん近い入りくちを えらびやすくしつつ、たまに 遠回りもする
    const scored = ways.map((y) => ({ y, d: dist(y.out.x, y.out.z, gate.in.x, gate.in.z) }));
    scored.sort((a, b) => a.d - b.d);
    const way = Math.random() < 0.55 ? scored[0].y : choice(ways);

    // グループのくせ（雰囲気）を ひとつ えらぶ
    const mood = choice(["normal", "normal", "line", "scatter", "gym"]);
    const rooms = w.rooms.filter((r) => r.kind === "class" || r.kind === "science" ||
      r.kind === "music" || r.kind === "library" || r.kind === "home" || r.kind === "art");
    const toilets = w.rooms.filter((r) => r.kind === "toilet");
    const gym = w.rooms.find((r) => r.kind === "gym");

    // ぜんいん 共通の 道すじ：門 → 入りくちの外 → 中 → どこかの部屋
    const common = [
      { x: way.out.x, z: way.out.z, floor: 0,
        say: choice(["ここから 入れそうじゃない？", "うわ、窓 割れてる…", "こっちから 行こう",
          "ほんとに 入るの？", "だれか 先に 行ってよ"]) },
      { x: way.in.x, z: way.in.z, floor: 0 },
    ];

    members.forEach((h, i) => {
      const steps = common.map((s) => ({ ...s, say: i === 0 ? s.say : undefined }));

      if (mood === "line") {
        // 1列で こわがりながら ゆっくり
        if (i === 0) {
          h.role = "leader";
          steps.push({ x: rand(-30, 30), z: rand(-12, -5), floor: 0, hold: rand(1.2, 2.4),
            say: choice(["しずかに…足音たてないで", "一列で 行こう。はぐれないように", "ぼくが 先頭でいい？よくない？"]) });
        } else {
          h.role = "follower";
          h.leader = members[i - 1];
        }
        h.type = { ...h.type, speed: h.type.speed * 0.6 };
      } else if (mood === "scatter" && i >= members.length - 1) {
        // はぐれる子：ひとりだけ ぜんぜん ちがう所へ行く
        h.role = "straggler";
        const r = choice(rooms.concat(toilets));
        steps.push({ x: r.cx, z: r.cz, floor: r.floor || 0, hold: rand(2, 5),
          say: choice(["あれ、みんな どこ行った？", "ちょっと こっち 見てくる", "はぐれた…かも"]) });
      } else if (mood === "gym" && i % 2 === 0 && gym) {
        // 体育館に 寄り道
        steps.length = 0;
        steps.push({ x: gym.cx + rand(-6, 6), z: gym.cz + rand(-6, 6), floor: 0, hold: rand(2, 4),
          say: choice(["体育館 先に見ようよ", "ステージ 上がってみたい", "ここ、声が ひびくね"] ) });
        steps.push({ x: way.out.x, z: way.out.z, floor: 0 });
        steps.push({ x: way.in.x, z: way.in.z, floor: 0 });
      }

      // だれか ひとりは トイレに 寄る
      if (toilets.length && Math.random() < 0.22) {
        const t2 = choice(toilets);
        steps.push({ x: t2.cx, z: t2.cz, floor: t2.floor || 0, hold: rand(3, 6),
          say: choice(["ごめん、トイレ", "先 行ってて。すぐ 追いつく", "うわ…ここ 使えるの？"]) });
      }
      // さいごに どこかの部屋へ
      const r2 = choice(rooms);
      if (r2) steps.push({ x: r2.cx + rand(-2, 2), z: r2.cz + rand(-1.5, 1.5), floor: r2.floor || 0,
        hold: rand(1, 3) });

      h.setPlan(steps, h.role);
      // 歩く速さも 一人ひとり すこし ちがう
      h.type = { ...h.type, speed: h.type.speed * rand(0.86, 1.14) };
    });
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
      this.summons.push(new Summon(this.scene, this.world, id, r.x, r.z, this.summonFloorY()));
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
    const floorY = this.summonFloorY();
    const r = this.world.colliders.resolve(fx, fz, 0.55, p.y);
    for (const t of this.traps) if (nearOnFloor(t.x, t.z, t.baseY, r.x, r.z, floorY, 1.6)) {
      this.audio.deny(); this.ui.toast("近すぎる！", "bad"); return;
    }
    this.traps.push(new Trap(this.scene, id, r.x, r.z, p.yaw, floorY));
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
    const floorY = this.summonFloorY();
    let best = null, bd = 3.4, kind = null;
    for (const tr of this.traps) {
      const d = dist(tr.x, tr.z, p.x, p.z);
      if (nearOnFloor(tr.x, tr.z, tr.baseY, p.x, p.z, floorY, bd)) { bd = d; best = tr; kind = "trap"; }
    }
    for (const s of this.summons) {
      const d = dist(s.x, s.z, p.x, p.z);
      if (nearOnFloor(s.x, s.z, s.baseY, p.x, p.z, floorY, bd)) { bd = d; best = s; kind = "ghost"; }
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
      this.texts.push(new FloatText(this.scene, "回収", best.x, best.baseY + 1.8, best.z, "#b6ffd0", 1.5));
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
    let best = null, bd = 5.2 * p.stat("reach");
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
    // ネコも おどろく（人間より すこし近くでないと気づかない）
    if (this.cat && this.cat.active && this.cat.startled <= 0) {
      const cp = this.cat.g.position;
      if (dist(cp.x, cp.z, p.x, p.z) < 4.2 * p.stat("reach") &&
          this.world.colliders.lineOfSight(p.x, p.z, cp.x, cp.z, 1.0, 0.6) &&
          this.cat.scare(p.x, p.z)) {
        this.audio.scare();
        this.audio.tone(900, 0.22, "sawtooth", 0.07, 380);      // ふしゃーっ
        this.ui.flash(0.24);
        this.texts.push(new FloatText(this.scene, "シャーッ！！", cp.x, 1.1, cp.z, "#ffe27a", 2.0));
        this.bump("catScared");
        if (!this.catScaredOnce) {
          this.catScaredOnce = true;
          this.ui.toast("🐈 ネコをおどろかせた！（おばけの実力）", "gold");
        }
        for (let i = 0; i < 4; i++) this.dropAt("onnen", cp.x + rand(-1, 1), cp.z + rand(-1, 1), 0);
        return;
      }
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
    // あまのじゃくは ふいうちが とくい
    const behindK = p.charId === "amanojaku" ? 2.5 : 1.75;
    // ともだちと はさみうちにすると、うんと よく効く
    const mate = this.pincerWith(best);
    let amount = 34 * p.stat("scare") * (behind ? behindK : 1.0) * (bd < 2.5 ? 1.2 : 1.0)
      * (mate ? 2.1 : 1.0);
    if (best.seenGhostT > 0.2) amount *= 0.7;      // 見られていると効きが悪い

    const eff = best.addFear(amount, p.x, p.z, "direct", "おどかし");
    if (this.net.on) { this.net.reportScare(best.hid, amount, "direct"); this.myScareT.set(best.hid, Date.now()); }
    this.texts.push(new FloatText(this.scene, "わっ！", p.x, p.y + 2.1, p.z, "#ffe27a", 2.3));

    if (eff > 0) {
      this.battle.countScare();                  // 勝負ちゅうなら 1人 かぞえる
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
      if (mate) {
        // はさみうち大成功。よい色の材料が どっさり落ちる
        this.bump("pincer");
        this.audio.rankUp();
        this.ui.flash(0.6);
        this.texts.push(new FloatText(this.scene, "はさみうち成功！ " + mate.name + " と",
          best.x, 3.5, best.z, "#ffd45e", 2.6));
        this.ui.toast("🤝 はさみうち成功！ " + mate.name + " と いっしょに おどかした", "gold", 4000);
        const far = Math.max(this.remoteAt(best.x, best.z, best.y), 0.55);
        for (let i = 0; i < 3; i++)
          this.dropAt(choice(SHARE_DROPS), best.x + rand(-1.6, 1.6), best.z + rand(-1.6, 1.6),
            best.y, pickRarity(far, 1));
      }
    } else {
      this.bump("laughed");
      this.audio.laugh();
      this.texts.push(new FloatText(this.scene, "笑われた…", best.x, 2.7, best.z, "#8fa8c8", 1.6));
    }
  }

  // 人間をはさんで、ともだちが 反対がわに いるか？
  //  いれば「はさみうち」。こわさも 材料も うんと よくなる。
  pincerWith(h) {
    if (!this.net.on || !this.net.peers.size) return null;
    const p = this.player;
    const myA = Math.atan2(p.x - h.x, p.z - h.z);
    const myD = dist(p.x, p.z, h.x, h.z);
    if (myD > 16) return null;
    for (const pr of this.net.peers.values()) {
      const d2 = dist(pr.x, pr.z, h.x, h.z);
      if (d2 > 16) continue;
      if (Math.abs((pr.y || 0) - h.y) > 3) continue;        // ちがう階なら はさめない
      const a2 = Math.atan2(pr.x - h.x, pr.z - h.z);
      let diff = Math.abs(((a2 - myA + Math.PI) % (Math.PI * 2)) - Math.PI);
      if (diff > 2.1) return pr;                            // 120度より 外＝反対がわ
    }
    return null;
  }

  // だれかが おどかしたら、この画面の おばけにも 材料を 1つ わたす。
  //  ともだちと やっていると、自分が おどかしていなくても もらえる。
  //  （拾いものは 画面ごとに 別なので、取りあいには ならない）
  giveShare(h, why) {
    const p = this.player;
    // ひといきに 出しすぎない（1秒に3つまで）
    const now = Date.now();
    if (now - (this._shareT || 0) > 1000) { this._shareT = now; this._shareN = 0; }
    if (++this._shareN > 3) return;
    const kind = choice(SHARE_DROPS);
    const bonus = this.remoteAt(h.x, h.z, h.y) * 0.7;
    // ともだちの ぶんは、自分の すぐそばに 落とす（かならず 取れるように）
    this.dropAt(kind, p.x + rand(-1.2, 1.2), p.z + rand(-1.2, 1.2), p.y < 0.6 ? 0 : p.y, pickRarity(bonus));
    this.texts.push(new FloatText(this.scene, MATERIALS[kind].icon + (why || "ともだちの ぶんも！"),
      p.x, p.y + 1.6, p.z, "#ffd45e", 1.8));
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
    // 逃げきった人の 落としものは、門の うちがわに まとめて 置く。
    //  門のそとに 置くと、おばけが 取りに行けない
    const inside = this.world.inPlay || inPlay;
    const gi = (!inside(h.x, h.z) && h.gateIn) ? h.gateIn : { x: h.x, z: h.z };
    for (let i = 0; i < 3; i++) this.dropAt("onnen", gi.x + rand(-3, 3), gi.z + rand(-3, 3), 0);
    this.dropAt("onnen", gi.x, gi.z, 0);
    for (const s of STAGES) {
      if (s.unlock && this.kicked === s.unlock + 1)
        this.ui.toast("🔓 新しいステージ「" + s.name + "」が えらべるようになった！", "gold", 7000);
    }
    if (r.name !== before) {
      this.rankName = r.name;
      this.audio.rankUp();
      this.ui.toast("👑 ランクアップ！ " + r.name, "gold");
      setTimeout(() => this.ui.toast(r.note, "gold"), 900);
    }
  }

  // 名まえの行を おしたら、その人を さがす／やめる
  bindFind() {
    const list = document.getElementById("humanList");
    if (list) list.addEventListener("click", (e) => {
      const row = e.target.closest ? e.target.closest(".hrow") : null;
      if (!row || !row.dataset.hid) return;
      this.setTrack(Number(row.dataset.hid));
    });
    const stop = document.getElementById("findStop");
    if (stop) stop.addEventListener("click", () => this.setTrack(0));
  }

  setTrack(hid) {
    const same = this.trackHid === hid;
    this.trackHid = same ? 0 : hid;
    this.ui._humanSig = null;                    // 行を えがきなおす
    if (this.trackHid) {
      const h = this.humans.find((x) => x.hid === this.trackHid && !x.out);
      if (h) { this.ui.toast("🔎 「" + h.name + "」を さがしています", "gold", 4000); this.audio.pickup(); }
      else { this.trackHid = 0; }
    } else {
      this.ui.setFind(null);
      this.audio.click();
      if (this.beacon) this.beacon.visible = false;
    }
  }

  // 光の柱を つくる（一度だけ）
  makeBeacon() {
    const g = new THREE.Group();
    const mat = (o) => new THREE.MeshBasicMaterial({ color: 0xffd45e, transparent: true,
      opacity: o, depthTest: false, depthWrite: false });
    // ほそい柱
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.34, 26, 8, 1, true), mat(0.3));
    pole.position.y = 13; g.add(pole);
    // 足もとの わ
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.05, 22), mat(0.62));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; g.add(ring);
    // 頭の上の しるし
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.7, 4), mat(0.9));
    tip.rotation.x = Math.PI; tip.position.y = 3.1; g.add(tip);
    g.traverse((o) => { o.renderOrder = 999; });   // かべの手前に えがく
    g.visible = false;
    this.scene.add(g);
    return g;
  }

  // 毎フレーム、やじるしと 光の柱を あわせる
  updateFind(dt, t) {
    if (!this.trackHid) return;
    const h = this.humans.find((x) => x.hid === this.trackHid);
    if (!h || h.out) {
      const gone = h ? h.name : "その人";
      this.trackHid = 0; this.ui.setFind(null); this.ui._humanSig = null;
      if (this.beacon) this.beacon.visible = false;
      this.ui.toast("🔎 「" + gone + "」は 出ていきました", "good", 3500);
      return;
    }
    if (!this.beacon) this.beacon = this.makeBeacon();
    this.beacon.visible = true;
    this.beacon.position.set(h.x, h.y, h.z);
    const pulse = 0.75 + Math.sin(t * 5) * 0.25;
    this.beacon.scale.set(pulse, 1, pulse);

    // 画面から見て どっちの向きか
    const v = new THREE.Vector3(h.x, h.y + 1.2, h.z);
    this.camera.worldToLocal(v);
    const bearing = Math.atan2(v.x, -v.z);        // 0 = まっすぐ前
    const p = this.player;
    const d = Math.hypot(h.x - p.x, h.z - p.z);
    // どの階にいるか、上か下か
    let where = this.world.roomAt(h.x, h.z, h.y);
    const dy = h.y - p.y;
    if (dy > 1.6) where = "⬆ " + where;
    else if (dy < -1.6) where = "⬇ " + where;
    this.ui.setFind(h.name, bearing - Math.PI / 2, d, where);
  }

  // --- 毎フレーム --------------------------------------------
  update(dt, t) {
    const inp = this.input, p = this.player, w = this.world;

    // 遊んだ時間と自動セーブ
    if (this.profile) {
      this.profile.playSeconds = (this.profile.playSeconds || 0) + dt;
      this._hiddenT = (this._hiddenT || 0) + dt;
      if (this._hiddenT >= 1) { this._hiddenT = 0; this.refreshHiddenChars(true); }
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
    // 仕掛けは12種あるので、1〜9 と 0 でえらべるようにする
    const nTrap = Object.keys(TRAPS).length;
    for (let i = 0; i < 9 && i < nTrap; i++) {
      if (inp.once("Digit" + (i + 1))) { this.selTrap = i; this.audio.click(); }
    }
    if (nTrap > 9 && inp.once("Digit0")) { this.selTrap = 9; this.audio.click(); }
    if (inp.wheel) { this.selTrap = (this.selTrap + inp.wheel + nTrap) % nTrap; this.audio.click(); }
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
        // ともだちにも「これを 拾った」と 知らせる。
        //  むこうの画面からも 消えて、材料は むこうも もらえる
        if (this.net.on && it.pid) {
          this.gotOut.push(it.pid);
          if (this.gotOut.length > 24) this.gotOut.shift();
        }
        const R = RARITY[it.tier || 0];
        this.inv[it.kind] = (this.inv[it.kind] || 0) + R.mult;
        this.bump("materials");
        this.bumpIn("byRarity", R.name);
        this.best("bestRarity", it.tier || 0);
        // 白いじょうは「かけら」も もらえる。交換所で つかう
        if (it.tier >= 1) {
          this.shards[it.tier] = (this.shards[it.tier] || 0) + 1;
          this.ui.setShards(this.shards);
        }
        this.audio.pickup(it.tier || 0);
        const col = "#" + R.glow.toString(16).padStart(6, "0");
        this.texts.push(new FloatText(this.scene,
          MATERIALS[it.kind].icon + "+" + R.mult + (it.tier ? "（" + R.name + "）" : ""),
          it.x, it.y + 0.9, it.z, col, 1.15 + (it.tier || 0) * 0.12));
        // 赤いじょうは、見つけたことを ちゃんと知らせる
        if ((it.tier || 0) >= 3) {
          this.ui.toast(["", "", "", "🔴 赤の", "🟣 紫の", "⚪ 銀の", "🟡 金の"][it.tier] +
            MATERIALS[it.kind].name + " を見つけた！　＋" + R.mult,
            it.tier >= 5 ? "gold" : "good");
          this.ui.flash(0.1 + it.tier * 0.04);
        }
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
      const floorY = this.summonFloorY();
      for (const tr of this.traps) if (nearOnFloor(tr.x, tr.z, tr.baseY, p.x, p.z, floorY, 3.4)) { near = true; break; }
      if (!near) for (const s of this.summons) if (nearOnFloor(s.x, s.z, s.baseY, p.x, p.z, floorY, 3.4)) { near = true; break; }
      if (near !== this.nearPlaced) {
        this.nearPlaced = near;
        const el = document.getElementById("bTake");
        if (el) el.classList.toggle("ready", near);
      }
    }

    // --- 仕掛けの発動 ---------------------------------------
    for (const tr of this.traps) {
      tr.update(dt, t);
      // ツルツルトラップ：上を通った人間は みんな すべる。おばけは 浮いているので平気
      if (tr.def.slip) {
        for (const h of this.humans) {
          if (h.out || h.slipCool > 0) continue;
          if (Math.abs(h.y - tr.baseY) >= 2.4) continue;
          if (dist(tr.x, tr.z, h.x, h.z) > tr.def.radius) continue;
          const line = h.slip();
          if (!line) continue;
          h.addFear(tr.def.fear, tr.x, tr.z, "trap:" + tr.id, tr.def.name);
          if (this.net.on) { this.net.reportScare(h.hid, tr.def.fear, "trap:" + tr.id); this.myScareT.set(h.hid, Date.now()); }
          h.speak(line, 3.0);
          this.bump("slipped");
          tr.fire();
          if (dist(tr.x, tr.z, p.x, p.z) < 34) this.audio.trapSound(tr.id);
          this.texts.push(new FloatText(this.scene, "ツルーッ！", h.x, 2.4, h.z, "#ffd97a", 1.8));
          const drop = h.takeDrop();
          if (drop) this.dropAt(drop, h.x, h.z, h.y);
        }
        continue;
      }
      if (tr.cool > 0) continue;
      for (const h of this.humans) {
        if (h.out) continue;
        if (Math.abs(h.y - tr.baseY) >= 2.4) continue;
        const d = dist(tr.x, tr.z, h.x, h.z);
        if (d > tr.def.radius) continue;
        if (!w.colliders.lineOfSight(tr.x, tr.z, h.x, h.z, tr.baseY + 1.2, 0.7)) continue;
        const eff = h.addFear(tr.def.fear, tr.x, tr.z, "trap:" + tr.id, tr.def.name);
        if (this.net.on) { this.net.reportScare(h.hid, tr.def.fear, "trap:" + tr.id); this.myScareT.set(h.hid, Date.now()); }
        tr.fire();
        this.bump("trapsFired");
        if (dist(tr.x, tr.z, p.x, p.z) < 34) this.audio.trapSound(tr.id);
        this.texts.push(new FloatText(this.scene, tr.def.line, tr.x, tr.baseY + 2.4, tr.z,
          eff > 0 ? "#ffb3e0" : "#8fa8c8", 1.9));
        if (eff > 0) {
          this.audio.scream(h.type.courage < 90 ? 1.3 : 1);
          this.battle.countScare();              // 仕掛けの ぶんも かぞえる
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
          this.battle.countScare();              // 召喚おばけの ぶんも かぞえる
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
    //  ・だれもいなければ すぐ来る
    //  ・のこっていても、時間がたつほど 早く つぎが来る
    //  ・ただし マップには MAX_ALIVE 人までしか いない
    this.aliveNow = alive;
    if (!this.isGuest && alive < MAX_ALIVE) {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) {
        this.spawnWave(MAX_ALIVE - alive);
        this.waveTimer = this.nextWaveGap(alive);
      }
    } else if (alive >= MAX_ALIVE) {
      // いっぱいのときは、待ち時間を すこしだけ もどしておく
      this.waveTimer = Math.min(this.waveTimer, 4);
    }

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
    this.updateFind(dt, t);

    // --- おどかし勝負 ---------------------------------------
    this.battle.update(dt);
    if (this.battle.on) {
      const rows = [];
      for (const [pid, pr] of this.net.peers) rows.push({ name: pr.name, score: pr.score || 0 });
      rows.sort((a, b) => b.score - a.score);
      this.ui.setBattle({ left: this.battle.left, score: this.battle.score, rows });
    } else if (this._battleWas) {
      this.ui.setBattle(null);
    }
    this._battleWas = this.battle.on;
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
    p.stageId = this.stageId;
    p.wave = this.wave;
    p.rank = this.rankName;
    p.inv = { ...this.inv };
    p.built = { ...this.built };
    p.selTrap = this.selTrap;
    p.shards = { ...this.shards };
    p.chars = { ...this.chars };
    p.charId = this.charId;
    p.upg = JSON.parse(JSON.stringify(this.upg || {}));   // すがたごとの きょうか
    p.paints = { ...this.paints };                        // 手に入れた色
    p.paint = JSON.parse(JSON.stringify(this.paint || {}));  // すがたごとの 色
    p.traps = this.traps.map((t) => ({ id: t.id, x: +t.x.toFixed(2), z: +t.z.toFixed(2),
      y: +(t.baseY || 0).toFixed(2), uses: t.uses }));
    p.pos = { x: +this.player.x.toFixed(2), z: +this.player.z.toFixed(2) };
    p.playSeconds = Math.round(p.playSeconds || 0);
    p.stats = p.stats || S.blank(p.name).stats;
    p.stats.bestWave = Math.max(p.stats.bestWave || 0, this.wave);
    return p;
  }

  saveNow(showToast) {
    if (this.adminPreview) {
      if (showToast) this.ui.toast("🧪 試験モードは記録に保存されません", "good");
      return true;
    }
    if (!this.profile) return false;
    const ok = S.saveProfile(this.collectSave());
    if (showToast) {
      if (ok) { this.ui.toast("💾 セーブできました", "good"); this.audio.pickup(); }
      else { this.ui.toast("セーブできませんでした", "bad"); this.audio.deny(); }
    }
    this._autosaveT = 0;
    if (this.cloud && this.cloud.signedIn) this.cloud.push({ v: 1, profile: this.profile }).catch(() => {});
    return ok;
  }

  // セーブデータを読みこんで反映する
  applySave(p) {
    const sameStage = (p.stageId || "school") === this.stageId;
    this.kicked = p.kicked || 0;
    this.shards = { ...(p.shards || {}) };
    this.chars = validOwnedChars(p.chars, p);
    this.refreshHiddenChars(false);
    this.upg = JSON.parse(JSON.stringify(p.upg || {}));
    this.paints = { base: 1, snow: 1, sumi: 1, ...(p.paints || {}) };
    this.paint = JSON.parse(JSON.stringify(p.paint || {}));
    if (p.charId && this.chars[p.charId]) { this.charId = p.charId; this.player.setChar(p.charId); }
    this.player.setUpgrades(this.upg[this.charId]);
    this.player.setPaint(this.paint[this.charId]);
    this.ui.setShards(this.shards);
    this.ui.setCharChip(CHARS[this.charId]);
    this.wave = p.wave || 0;
    this.inv = { ...(p.inv || {}) };
    this.built = { ...(p.built || {}) };
    this.selTrap = p.selTrap || 0;
    for (const t of sameStage ? (p.traps || []) : []) {
      if (!TRAPS[t.id]) continue;
      const tr = new Trap(this.scene, t.id, t.x, t.z, 0, t.y || 0);
      tr.uses = t.uses || 0;
      this.traps.push(tr);
    }
    if (sameStage && p.pos) { this.player.x = p.pos.x; this.player.z = p.pos.z; }
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
    this.shards = {};                      // 色ごとの かけら
    this.chars = { obake: 1 };          // 使えるすがた
    this.upg = {};                      // すがたごとの きょうか {kappa:{speed:3}}
    this.pickSeq = 0;             // 拾いものの 通し番号（みんなで そろえる）
    this.pickRng = null;          // 部屋のときは みんなで 同じ たね
    this.gotOut = [];             // 「拾った」と みんなに 知らせる 番号
    this.gotSeen = new Set();     // もう 消した 番号
    this.paints = { base: 1, snow: 1, sumi: 1 };   // 手に入れた色（すがた共通）
    this.paint = {};                    // すがたごとの 色 {kappa:{body:"kin"}}
    this.charId = "obake";
    this.kicked = 0; this.wave = 0; this.selTrap = 0;
    this.waveTimer = 0; this.spawnTimer = 6; this.scareFx = 0;
    this.rankName = RANKS[0].name;
    this.paused = false;
    this.ui.closeCraft();
    this.player.x = this.world.start ? this.world.start.x : 0;
    this.player.z = this.world.start ? this.world.start.z : 16;
    this.player.y = 1.5;
    this.player.vx = 0; this.player.vz = 0; this.player.camYaw = Math.PI;
    for (let i = 0; i < this.q.pickups; i++) this.spawnPickup();
    this.ui.setRank(0);
    this.ui.setBag(this.inv);
    this.ui.setHotbar(this.built, this.selTrap);
    this.ui.setShards(this.shards);
    this.ui.setCharChip(CHARS[this.charId] || CHARS.obake);
    this.ui.setHumans(this.humans);
    this.ui.vignette(0);
    this.refreshHiddenChars(false);
  }

  // 試験用のタブだけに、全ステージ・全キャラ・全道具をそろえる。
  // 通常の記録とクラウドには書かないため、確認後に元の進み具合へ戻れる。
  applyAdminPreview() {
    this.kicked = 9999;
    this.chars = Object.fromEntries(Object.keys(CHARS).map((id) => [id, 1]));
    this.inv = Object.fromEntries(Object.keys(MATERIALS).map((id) => [id, 9999]));
    this.built = Object.fromEntries(Object.keys(TRAPS).map((id) => [id, 99]));
    this.shards = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((id) => [id, 9999]));
    this.paints = Object.fromEntries(PAINTS.map((p) => [p.id, 1]));
    this.upg = Object.fromEntries(Object.keys(CHARS).map((id) => [
      id, Object.fromEntries(Object.keys(UPGRADES).map((key) => [key, UPG_MAX])),
    ]));
    this.player.setUpgrades(this.upg[this.charId]);
    this.ui.setRank(this.kicked);
    this.ui.setBag(this.inv);
    this.ui.setHotbar(this.built, this.selTrap);
    this.ui.setShards(this.shards);
    this.ui.setCharChip(CHARS[this.charId]);
  }

  startGame(cont) {
    this.profile = this.ensureProfile();
    this.resetSession();
    if (cont && this.profile.hasSave) this.applySave(this.profile);
    if (this.adminPreview) this.applyAdminPreview();

    this.started = true;
    this.setPaused(false);
    this.audio.start();
    this.ui.hideScreen();
    if (this.touch) goFullscreen(); else this.input.lock();
    this._last = performance.now();
    this._autosaveT = 0;

    if (this.adminPreview) {
      this.ui.toast("🧪 全ステージ・全17キャラを試せます", "gold");
      setTimeout(() => this.spawnWave(), 1500);
    } else if (cont && this.profile.hasSave) {
      this.ui.toast("おかえり、" + this.profile.name + "。つづきから始めます", "good");
      setTimeout(() => this.spawnWave(), 3000);
    } else {
      this.ui.toast("材料を集めて、人間たちを追い出そう！", "good");
      setTimeout(() => this.spawnWave(), 3500);
    }
  }


  // ============================================================
  //  すがたの きょうか（レベルアップ）
  //   ・すがたごとに 上げる。河童を上げても 天狗は 上がらない
  //   ・材料と かけらを つかう
  //   ・1レベルで +0.02（はやさ ×1.28 → ×1.30 のように）
  // ============================================================
  upgLevel(charId, key) {
    const u = this.upg[charId];
    return (u && u[key]) || 0;
  }

  canUpgrade(charId, key) {
    const lv = this.upgLevel(charId, key);
    if (lv >= UPG_MAX) return "max";
    const c = upgCost(key, lv);
    for (const k in c.mats) if ((this.inv[k] || 0) < c.mats[k]) return false;
    for (const t in c.shards) if ((this.shards[t] || 0) < c.shards[t]) return false;
    return true;
  }

  upgrade(charId, key) {
    if (!CHARS[charId] || !UPGRADES[key]) return false;
    if (!this.chars[charId]) { this.ui.toast("まだ 使えない すがたです", "bad"); this.audio.deny(); return false; }
    const ok = this.canUpgrade(charId, key);
    if (ok === "max") { this.ui.toast("もう いちばん 上です", "bad"); this.audio.deny(); return false; }
    if (!ok) { this.ui.toast("材料か かけらが たりません", "bad"); this.audio.deny(); return false; }

    const lv = this.upgLevel(charId, key);
    const c = upgCost(key, lv);
    for (const k in c.mats) this.inv[k] -= c.mats[k];
    for (const t in c.shards) this.shards[t] -= c.shards[t];
    if (!this.upg[charId]) this.upg[charId] = {};
    this.upg[charId][key] = lv + 1;
    if (charId === this.charId) this.player.setUpgrades(this.upg[charId]);

    const U = UPGRADES[key];
    const before = (CHARS[charId][key] + lv * UPG_STEP).toFixed(2);
    const after = (CHARS[charId][key] + (lv + 1) * UPG_STEP).toFixed(2);
    this.ui.toast(U.icon + " " + CHARS[charId].name + "の「" + U.name + "」が ×" +
      before + " → ×" + after + "（Lv" + (lv + 1) + "）", "gold", 5000);
    this.audio.rankUp();
    this.ui.setBag(this.inv);
    this.ui.setShards(this.shards);
    this.ui.setCharChip(CHARS[this.charId]);
    this.saveNow(false);
    return true;
  }

  // 召喚おばけを 置く 階の、床の 高さ。
  //  これを わたさないと、4階で 出しても 1階に あらわれてしまう
  summonFloorY() {
    const h = this.world.floorHeight || 3.6;
    const floors = this.world.floors === undefined ? 4 : this.world.floors;
    const f = clamp(Math.round((this.player.y - 1.02) / h), 0, floors);   // 1階が0
    return f * h;
  }

  // ============================================================
  //  色がえ
  //   ・色は 材料で 手に入れる。いちど手に入れれば
  //     どの すがたでも つかえる
  //   ・どの色を ぬるかは すがたごと・パーツごと
  // ============================================================
  hasPaint(id) { return !!this.paints[id]; }

  canBuyPaint(id) {
    const q = paintById(id);
    if (!q || !q.cost) return false;
    if (this.paints[id]) return "have";
    for (const k in q.cost) if ((this.inv[k] || 0) < q.cost[k]) return false;
    for (const t in (q.shards || {})) if ((this.shards[t] || 0) < q.shards[t]) return false;
    return true;
  }

  buyPaint(id) {
    const q = paintById(id);
    const ok = this.canBuyPaint(id);
    if (ok === "have") return true;
    if (!ok) { this.ui.toast("材料か かけらが たりません", "bad"); this.audio.deny(); return false; }
    for (const k in q.cost) this.inv[k] -= q.cost[k];
    for (const t in (q.shards || {})) this.shards[t] -= q.shards[t];
    this.paints[id] = 1;
    this.ui.toast("🎨 「" + q.name + "」が つかえるように なりました", "gold", 4500);
    this.audio.rankUp();
    this.ui.setBag(this.inv);
    this.ui.setShards(this.shards);
    this.saveNow(false);
    return true;
  }

  // すがたの パーツに 色を ぬる
  setPaintOn(charId, part, paintId) {
    if (!CHARS[charId] || !PARTS[part]) return false;
    if (!this.paints[paintId]) { this.ui.toast("その色は まだ もっていません", "bad"); this.audio.deny(); return false; }
    if (!this.paint[charId]) this.paint[charId] = {};
    if (paintId === "base") delete this.paint[charId][part];
    else this.paint[charId][part] = paintId;
    if (charId === this.charId) this.player.setPaint(this.paint[charId]);
    this.audio.pickup();
    this.saveNow(false);
    return true;
  }

  paintOn(charId, part) {
    const c = this.paint[charId];
    return (c && c[part]) || "base";
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
    // 拾いものも みんなで そろえる。
    //  いま出ているものを 片づけて、同じ たねから 出しなおす
    this.pickRng = makeRng((seed ^ 0x1f2e3d4c) >>> 0);
    this.pickSeq = 0;
    this.gotOut.length = 0;
    this.gotSeen.clear();
    for (const q of this.pickups) q.dispose();
    this.pickups.length = 0;
    for (let i = 0; i < this.q.pickups; i++) this.spawnPickup();
    this.roster = new Roster(100, seed);
    for (const h of this.humans) this.scene.remove(h.group);
    this.humans = [];
    this.wave = 0;
    this.hidNext = 1;
    this.waveTimer = this.net.isHost ? 4 : 9e9;
  }

  async roomCreate(name) {
    const r = await this.net.create(name || (this.home && this.home.playerName ? this.home.playerName() : "おばけ"), this.stageId);
    if (!r.ok) return r;
    this.netReseed(r.data.seed);
    this.ui.toast("🚪 あいことば「" + this.net.code + "」でともだちを呼ぼう！", "gold", 30000);
    this.audio.rankUp();
    return r;
  }

  async roomJoin(code, name) {
    const r = await this.net.join(code, name || (this.home && this.home.playerName ? this.home.playerName() : "おばけ"));
    if (!r.ok) return r;
    const roomStage = stageById((r.data.room && r.data.room.stage) || "school");
    if (roomStage.id !== this.stageId) {
      await this.net.leave();
      if (!stageUnlocked(roomStage, this.profile ? this.profile.kicked : 0, this.adminPreview))
        return { ok: false, why: "おやは「" + roomStage.name + "」にいます。まだ このステージは開いていません。" };
      try { sessionStorage.setItem("haikou-obake:rejoin", JSON.stringify({ code, name })); } catch (e) { /* 保存不可 */ }
      location.href = stageUrl(roomStage.id);
      return { ok: true, reloading: true };
    }
    this.netReseed(r.data.seed);
    this.ui.toast("🚪 部屋「" + this.net.code + "」に入りました", "gold", 30000);
    this.audio.rankUp();
    return r;
  }

  async roomLeave() {
    this.pickRng = null;                    // ひとりに もどったら 自由に わく
    if (this.battle.on) this.battle.finish(true);
    if (this.peerPlaced) { for (const o of this.peerPlaced.values()) o.dispose(); this.peerPlaced.clear(); }
    await this.net.leave();
    for (const [, g] of this.peerGhosts) g.dispose();
    this.peerGhosts.clear();
    this.waveTimer = 6;
    this.ui.toast("ひとりで遊ぶモードに もどりました", "good");
  }

  // ともだちの 置きもの（仕掛け・召喚おばけ）を 画面に 出す。
  //  作りなおしを へらすため、しるし（キー）で 見わけて
  //  変わったものだけ 足したり 消したりする。
  syncPlaced() {
    if (!this.peerPlaced) this.peerPlaced = new Map();
    const want = new Map();
    if (this.net.on) {
      for (const [pid, pr] of this.net.peers) {
        const list = pr.placed || [];
        for (let i = 0; i < list.length; i++) {
          const q = list[i];
          // しるしに 場所を 入れない。
          //  入れると おばけが 動くたびに 作りなおしになって 重い
          want.set(pid + "|" + q.k + "|" + q.id + "|" + i, q);
        }
      }
    }
    // いらなくなったものを 消す
    for (const [key, obj] of this.peerPlaced) {
      if (want.has(key)) continue;
      obj.dispose();
      this.peerPlaced.delete(key);
    }
    // 新しく 置かれたものを 足し、あるものは 場所だけ 合わせる
    for (const [key, q] of want) {
      let obj = this.peerPlaced.get(key);
      if (!obj) {
        if (q.k === "t" && TRAPS[q.id]) obj = new Trap(this.scene, q.id, q.x, q.z, 0, q.y || 0);
        else if (q.k === "g" && GHOSTS[q.id]) obj = new Summon(this.scene, this.world, q.id, q.x, q.z, q.y || 0);
        if (!obj) continue;
        obj.isPeer = true;                    // 見た目だけ。発動は 置いた人の画面で
        this.peerPlaced.set(key, obj);
      }
      // とどいた 場所へ なめらかに 寄せる（ワープに 見えないように）
      obj.x = q.x; obj.z = q.z;
      const gy = q.k === "g" ? (q.y || 0) + 1.15 : (q.y || 0);
      const gp = obj.group.position;
      gp.x += (q.x - gp.x) * 0.25;
      gp.z += (q.z - gp.z) * 0.25;
      gp.y = gy;
      if (obj.life !== undefined && obj.def) obj.life = obj.def.life;   // 勝手に 消えないように
    }
  }

  hostSnapshot() {
    const hs = [];
    for (const h of this.humans) {
      hs.push([h.hid, +h.x.toFixed(2), +h.y.toFixed(2), +h.z.toFixed(2), +h.yaw.toFixed(2),
        Math.round(h.fear), NET_STATES.indexOf(h.state), h.out ? 1 : 0,
        // 歩く 速さ。むこうで なめらかに 動かすのに つかう
        +(h.vx || 0).toFixed(2), +(h.vz || 0).toFixed(2)]);
    }
    // さいきん40波ぶんの「入れた人数」も いっしょに送る
    const rooms = [];
    for (let k = Math.max(1, this.wave - 40); k <= this.wave; k++) {
      const v = this.waveRoom.get(k);
      if (v !== undefined) rooms.push([k, v]);
    }
    return { wave: this.wave, hs, rooms };
  }

  applyRemoteWorld(rw) {
    let guard = 0;
    for (const [k, v] of rw.rooms || []) this.waveRoom.set(k, v);
    this._netSpawn = true;
    while (this.wave < rw.wave && guard++ < 24) this.spawnWave();
    this._netSpawn = false;   // 同じ順番で同じ人たちが来る
    const by = new Map();
    for (const h of this.humans) by.set(h.hid, h);
    const now = Date.now();
    for (const a of rw.hs || []) {
      const h = by.get(a[0]);
      if (!h) continue;
      const was = h.fear;
      const escaped = h.setNet(a[1], a[2], a[3], a[4], a[5], NET_STATES[a[6]] || "wander", a[7], a[8], a[9]);
      // こわさが ぐんと上がった＝だれかが おどかした。
      //  自分がおどかしたぶんは、すでに 材料をもらっているので よける
      const mine = this.myScareT.get(h.hid) || 0;
      if (!escaped && h.fear - was >= 10 && now - mine > 3500) this.giveShare(h);
      if (escaped) this.onEscape(h);
    }
  }

  syncNet(dt, t) {
    const p = this.player;
    const me = {
      x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), yaw: +p.yaw.toFixed(2),
      p: p.phasing ? 1 : 0, s: p.scarePose > 0 ? 1 : 0,
      // 動く 速さも いっしょに 送る。
      //  むこうは これで「いま どこに いるはず か」を 出すので、
      //  とどく間かくが ゆらいでも なめらかに 動く
      vx: +p.vx.toFixed(2), vy: +(p.vy || 0).toFixed(2), vz: +p.vz.toFixed(2),
      c: this.charId || "obake",                   // どの すがたで 遊んでいるか
      st: this.stageId,                             // みんなが同じマップにいるか確認する
      sc: this.battle.score,                       // おどかし勝負で おどかした人数
      h: this.net.isHost ? 1 : 0,                  // この人が おや か
      bt: this.net.isHost ? this.battle.netState() : undefined,
      got: this.gotOut.slice(),                    // 拾ったものの 番号
    };
    const placed = [];
    for (const tr of this.traps) placed.push({ k: "t", id: tr.id, x: +tr.x.toFixed(1), z: +tr.z.toFixed(1),
      y: +(tr.baseY || 0).toFixed(1) });
    for (const s of this.summons) placed.push({ k: "g", id: s.id, x: +s.x.toFixed(1), z: +s.z.toFixed(1), y: +(s.baseY || 0).toFixed(1) });

    this.net.update(dt, me, placed, this.net.isHost ? this.hostSnapshot() : null);

    if (this.net.isHost) {
      // ともだちが おどかしたぶんを、こちらで反映する
      for (const a of this.net.takeActs()) {
        if (a.k !== "scare") continue;
        for (const h of this.humans) {
          if (h.hid !== a.hid || h.out) continue;
          const eff = h.addFear(a.a, h.x, h.z, a.w || "mate", "ともだち");
          // ともだちが おどかしてくれたぶん、こちらにも 材料が 1つ
          if (eff > 0) this.giveShare(h);
          break;
        }
      }
    } else if (this.net.remoteWorld && this.net.worldSeq !== this._worldSeen) {
      this._worldSeen = this.net.worldSeq;
      this.applyRemoteWorld(this.net.remoteWorld);
    }

    // 勝負の ようすを 合わせる
    if (!this.net.isHost) this.battle.applyRemote(this.net.remoteBattle);
    this.battle.peerScores = {};
    for (const [pid, pr] of this.net.peers) this.battle.peerScores[pid] = pr.score || 0;

    // ともだちが 拾ったものを、こちらの画面からも 消す。
    //  材料は こちらにも 入る（取りあいに ならない）
    for (const [, pr] of this.net.peers) {
      for (const gid of pr.got || []) {
        if (this.gotSeen.has(gid)) continue;
        this.gotSeen.add(gid);
        const i = this.pickups.findIndex((q) => q.pid === gid);
        if (i < 0) continue;
        const it = this.pickups[i];
        const R = RARITY[it.tier || 0];
        this.inv[it.kind] = (this.inv[it.kind] || 0) + R.mult;
        if (it.tier >= 1) this.shards[it.tier] = (this.shards[it.tier] || 0) + 1;
        this.texts.push(new FloatText(this.scene,
          MATERIALS[it.kind].icon + "+" + R.mult + "（ともだちが 拾った）",
          it.x, it.y + 0.9, it.z, "#ffd45e", 1.4));
        it.dispose();
        this.pickups.splice(i, 1);
        this.ui.setBag(this.inv);
        this.ui.setShards(this.shards);
      }
    }
    if (this.gotSeen.size > 400) this.gotSeen.clear();

    // ともだちが 置いた 仕掛け・おばけを 出す
    this.syncPlaced();

    // ともだちのおばけを出す
    const seen = new Set();
    for (const [pid, pr] of this.net.peers) {
      seen.add(pid);
      let g = this.peerGhosts.get(pid);
      if (!g) { g = new PeerGhost(this.scene, this.peerGhosts.size, pr.name, pr.charId); this.peerGhosts.set(pid, g); }
      g.setName(pr.name);
      g.setChar(pr.charId || "obake");
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
    // 「戻る」は、直前にプロフィール等を見ていても必ずゲーム開始画面へ戻す。
    this.home.show("play");
    this.home.render();
    if (ok) this.ui.toast("💾 セーブできました", "good");
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
    this.refreshHiddenChars(true);
  }

  refreshHiddenChars(show) {
    if (!this.profile || !this.chars) return false;
    let changed = false;
    for (const [id, c] of Object.entries(CHARS)) {
      if (!c.hidden || this.chars[id] || !hiddenUnlockReady(c, this.profile)) continue;
      this.chars[id] = 1;
      changed = true;
      if (show && this.ui) this.ui.toast("✨ ひみつのすがた「" + c.name + "」を見つけた！", "gold", 4200);
    }
    if (changed && show) {
      if (this.audio) this.audio.rankUp();
      if (this.ui && this.ui.craftOpen) this.ui.renderCraft();
      this.saveNow(false);
    }
    return changed;
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
const adminPreview = await verifyAdminPreview();
const game = new Game(adminPreview);
window.game = game;
game.build();
game.loop(performance.now());

game.resize();
game.cloud = new Cloud();
game.home = new Home(game);
game.cloud.restore().then((ok) => {
  if (ok && game.home.tab === "login" && game.home.sub === "mail") game.home.renderLogin();
  if (ok) game.home.pollFriends(true);
});
// ホーム画面を見ているあいだだけ、申請やさそいが来ていないか ときどき見にいく
setInterval(() => {
  if (!game.started && game.cloud.signedIn && !document.hidden) game.home.pollFriends(game.home.tab !== "friends");
}, 20000);
document.getElementById("loading").textContent =
  game.stage.name + "の準備完了（" + game.world.triangles.toLocaleString() + " 面 / " + game.buildMs + "ms）";
game.home.show("play");
// 応援から もどってきたら、お礼を出す
checkReturn(game.ui);

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
      ["Tab", "おばけ工房"], ["F", "選んだ仕掛けを置く"], ["R", "置いたものを回収"], ["1〜9・0", "仕掛けをえらぶ"],
      ["Esc", "ポーズ"],
    ].map((r) => "<div><b>" + r[0] + "</b>" + r[1] + "</div>").join("");
  }
  document.getElementById("app").addEventListener("click", () => {
    if (game.started && !game.ui.craftOpen && !game.paused && !game.input.locked) game.input.lock();
  });
}

console.log("[廃校] 画質:", game.q.name, "/ 懐中電灯", game.q.torches, "本 / 塵", game.q.dust);
