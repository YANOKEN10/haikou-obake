// ============================================================
//  ともだちと一緒にあそぶ（かんたん版・ポーリング方式）
//   ・1秒に1回、自分のようすを送って、みんなのようすをもらう
//   ・受けとった位置へ「なめらかに寄せていく」ので、
//     1秒に1回でもスーッと動いて見える
//   ・部屋を作った人（ホスト）が人間たちを動かし、
//     ほかの人は、その人間たちを見ている
//   ・おどかした合図だけをホストに送り、ホストが結果を返す
// ============================================================
import { Rtc } from "./rtc.js";

const API = "/api/room";
const TICK = 520;           // ふだんの送信かんかく
const TICK_SLOW = 2500;     // 画面を見ていないとき
const TICK_FAST_OK = 2500;  // 直接つながっているとき（なかま確認だけ）
const PREDICT_MAX = 2.0;    // 「このまま進む」と よそうしていい 秒数
const FIX_MAX = 4.0;        // ずれを 直すときの いちばんの速さ（m/秒）
//  おばけの ふつうの速さ（5.4）より おそくしてある。
//  こうすると「追いつくために 走っている」ようには 見えない。
const WARP = 20;            // これいじょう はなれたら すぐ 合わせる
//  すりぬけや 階の 行き来など、ほんとうに とんだときだけ。
//  ここを 小さくすると、ぐるぐる 走る人で カクッと なる

// 角どの ちがい（-π〜π に おさめる）
function angDiff(to, from) {
  let d = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class Net {
  constructor() {
    this.code = "";
    this.pid = "";
    this.name = "";
    this.isHost = false;
    this.peers = new Map();      // pid -> {name, tx,ty,tz,tyaw, x,y,z,yaw, placed, seen}
    this.remoteWorld = null;     // ホストからとどいた人間たち
    this.remoteBattle = null;    // おやからとどいた「おどかし勝負」のようす
    this.outActs = [];           // ホストへ送る「おどかした」合図（番号つき・何回か送りなおす）
    this.actNo = 1;
    this.inActs = [];            // ホストが受けとった合図
    this.actSeen = new Map();    // だれの何番まで使ったか（同じ合図を二度きかせない）
    this.on = false;
    this.busy = false;
    this.lastSend = 0;
    this.pending = null;
    this.beat = null;
    this.rejoining = false;
    this.fails = 0;
    this.status = "";
    this.onEvent = null;         // (kind, detail) => void

    // --- ブラウザ同士を 直接つなぐ ---------------------------
    //  サーバーごしだと 行って もどるのに 1.1〜1.5秒 かかる。
    //  直接つなげば 30〜80ミリ秒、1秒に20回 やりとりできる。
    //  つながらない ネットの人は、これまでどおり サーバーごし。
    this.sigOut = [];            // 相手へ おくる あいさつ
    this.rtc = new Rtc(this);
    this.rtc.onData = (pid, msg) => this.takeDirect(pid, msg);
    this.rtc.onOpen = (pid) => {
      const p = this.peers.get(pid);
      if (this.onEvent) this.onEvent("fast", (p ? p.name : "ともだち") + " と 直接つながりました");
    };
  }

  get playerCount() { return this.on ? this.peers.size + 1 : 0; }

  async call(payload) {
    let r;
    try {
      r = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      return { ok: false, why: "つながりませんでした。ネットにつながっているか確かめてください" };
    }
    let d = null;
    try { d = await r.json(); } catch (e) { d = null; }
    if (!r.ok) return { ok: false, why: (d && d.message) || "つうしんが うまくいきませんでした", code: d && d.error };
    return { ok: true, data: d };
  }

  async create(name) {
    const r = await this.call({ action: "create", name });
    if (!r.ok) return r;
    this.code = r.data.code; this.pid = r.data.pid; this.name = r.data.name;
    this.isHost = true; this.on = true; this.fails = 0;
    this.peers.clear(); this.remoteWorld = null;
    this.status = "部屋をつくりました";
    this.lastSend = 0; this.pending = null;
    this.startBeat();
    return r;
  }

  async join(code, name) {
    const r = await this.call({ action: "join", code, name });
    if (!r.ok) return r;
    this.code = r.data.code; this.pid = r.data.pid; this.name = r.data.name;
    this.isHost = r.data.room.youAreHost; this.on = true; this.fails = 0;
    this.peers.clear(); this.remoteWorld = null;
    this.apply(r.data.room);
    this.status = "部屋に入りました";
    this.lastSend = 0; this.pending = null;
    this.startBeat();
    return r;
  }

  async leave() {
    this.rtc.closeAll();
    this.sigOut.length = 0;
    this.stopBeat();
    this.pending = null;
    const code = this.code, pid = this.pid;
    this.on = false; this.code = ""; this.pid = ""; this.isHost = false;
    this.peers.clear(); this.remoteWorld = null; this.outActs.length = 0;
    this.inActs.length = 0; this.actSeen.clear(); this.actNo = 1;
    if (code && pid) await this.call({ action: "leave", code, pid });
  }

  // おどかしたことをホストへ知らせる（自分がホストなら、そのまま自分で使う）
  reportScare(hid, amount, why) {
    if (!this.on || hid == null) return;
    if (this.isHost) { this.inActs.push({ k: "scare", hid, a: Math.round(amount), w: why }); return; }
    // 1回とどかなくても大丈夫なように、しばらく同じ合図を送りつづける。
    // おやは番号を見て、同じものは1回しか使わない
    this.outActs.push({ i: this.actNo++, k: "scare", hid, a: Math.round(amount), w: why });
    if (this.outActs.length > 8) this.outActs.shift();
  }

  // --- 毎フレーム ------------------------------------------
  //  me    = {x,y,z,yaw,phasing,scaring}
  //  place = 置いてあるもの [{k,id,x,z}]
  //  world = ホストのときだけ渡す {humans:[...], wave, kicked}
  update(dt, me, placed, world) {
    if (!this.on) return;
    this.pending = { me, placed, world };

    // ともだちのおばけを なめらかに 動かす。
    //  ① いつも その人の 速さで 進みつづける（止まらない）
    //  ② とどいた位置との ずれは、ゆっくり 一定の速さで 直す
    //     （追いつくために 走らないので、ワープに 見えない）
    for (const p of this.peers.values()) {
      p.age = (p.age || 0) + dt;
      const ah = Math.min(p.age, PREDICT_MAX);

      // その人の 速さで 進む
      p.x += (p.vx || 0) * dt;
      p.y += (p.vy || 0) * dt;
      p.z += (p.vz || 0) * dt;

      // 「とどいた位置＋そのあと 進んだはず のぶん」＝ いるはずの ところ
      const tx = p.tx + (p.vx || 0) * ah;
      const ty = p.ty + (p.vy || 0) * ah;
      const tz = p.tz + (p.vz || 0) * ah;

      const ex = tx - p.x, ey = ty - p.y, ez = tz - p.z;
      const err = Math.hypot(ex, ez);
      if (err > WARP) {
        // はなれすぎ。すりぬけや 階の 行き来。すぐ 合わせる
        p.x = tx; p.y = ty; p.z = tz;
      } else if (err > 0.001) {
        // 直す 速さに かぎりを つける。
        //  ずれが 大きいほど 速く 直すが、上限を こえない
        const want = Math.min(err * 2.4, FIX_MAX) * dt;
        const k = Math.min(1, want / err);
        p.x += ex * k;
        p.z += ez * k;
      }
      // たかさは ゆっくりでも 気にならないので そのまま ならす
      p.y += ey * Math.min(1, dt * 4);

      // 向きは 進んでいるほうへ。止まっているときは とどいた向き
      const sp = Math.hypot(p.vx || 0, p.vz || 0);
      const want2 = sp > 0.3 ? Math.atan2(p.vx, p.vz) : p.tyaw;
      p.yaw += angDiff(want2, p.yaw) * Math.min(1, dt * 8);
    }

    // 直接つないでいる 相手には、1秒に20回 じかに おくる
    if (this.rtc.links.size) {
      this.rtc.send({
        g: me,
        placed: placed || [],
        world: this.isHost && world ? world : undefined,
        acts: !this.isHost ? this.outActs : undefined,
      });
    }

    this.send();
  }

  // ゲームの進みぐあいではなく、ほんとうの時計で数える。
  // （画面を見ていないとタイマーがゆっくりになるブラウザがあるため）
  send() {
    if (!this.on || this.busy || !this.pending) return;
    const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
    // 直接つながっている人が いるなら、サーバーごしは
    //  なかまの ようすを 見るだけで よいので ゆっくりでいい
    const base = document.hidden ? TICK_SLOW : (this.rtc.anyReady ? TICK_FAST_OK : TICK);
    const gap = base + this.fails * 1500;
    if (this.lastSend && now - this.lastSend < gap) return;
    this.lastSend = now;
    this.busy = true;

    const { me, placed, world } = this.pending;
    const body = { action: "sync", code: this.code, pid: this.pid, g: me, placed: placed || [] };
    // 手紙は、ちゃんと とどいたのを 見てから 消す。
    //  さきに 消すと、通信に しっぱいしたとき あいさつが 消えてしまい、
    //  いつまでも つながらなく なる
    const sigSent = this.sigOut.length ? this.sigOut.slice() : null;
    if (sigSent) body.sig = sigSent;
    if (this.isHost && world) body.world = world;
    else if (!this.isHost) body.acts = this.outActs;   // 消さずに、そのまま送りつづける

    this.call(body).then((r) => {
      this.busy = false;
      if (r.ok && sigSent) {
        // とどいたので、送った ぶんだけ 消す
        this.sigOut.splice(0, sigSent.length);
      }
      if (!r.ok) {
        this.fails++;
        this.status = r.why;
        // しばらく画面を見ていないと、部屋からはずれることがある。
        // そのときは、同じあいことばで だまって入りなおす
        if (r.code === "none") { this.rejoin(); return; }
        if (this.fails > 8) {
          this.on = false;
          this.peers.clear();
          if (this.onEvent) this.onEvent("lost", r.why);
        }
        return;
      }
      this.fails = 0;
      this.status = "";
      if (!r.data.room) { this.on = false; this.peers.clear(); if (this.onEvent) this.onEvent("lost", "部屋がとじました"); return; }
      this.apply(r.data.room);
      // あいさつが とどいていたら すすめる
      if (r.data.room && r.data.room.sig && r.data.room.sig.length) {
        this.rtc.take(r.data.room.sig);
      }
      // まだ つないでいない ともだちが いたら つなぎにいく
      this.rtc.ensure(Array.from(this.peers.keys()));
    });
  }

  async rejoin() {
    if (this.rejoining || !this.code) return;
    this.rejoining = true;
    const r = await this.call({ action: "join", code: this.code, name: this.name });
    this.rejoining = false;
    if (!r.ok) {
      this.on = false;
      this.peers.clear();
      if (this.onEvent) this.onEvent("lost", "部屋がとじました");
      return;
    }
    this.pid = r.data.pid;
    this.isHost = r.data.room.youAreHost;
    this.fails = 0;
    this.peers.clear();
    this.apply(r.data.room);
    if (this.onEvent) this.onEvent("back", "部屋につなぎなおしました");
  }

  // ゲームの絵が止まっていても、部屋にいることだけは伝えつづける
  startBeat() {
    this.stopBeat();
    this.beat = setInterval(() => { if (this.on) this.send(); }, 3000);
  }
  stopBeat() { if (this.beat) { clearInterval(this.beat); this.beat = null; } }

  apply(room) {
    const wasHost = this.isHost;
    this.isHost = room.youAreHost;
    if (this.isHost && !wasHost && this.onEvent) this.onEvent("host", "あなたが おやになりました");

    const seen = new Set();
    let sawHost = false;
    for (const o of room.others || []) {
      if (o.g && o.g.h) sawHost = true;
      seen.add(o.pid);
      let p = this.peers.get(o.pid);
      if (!p) {
        const g = o.g || {};
        p = { name: o.name, x: g.x || 0, y: g.y || 1.2, z: g.z || 0, yaw: g.yaw || 0,
              tx: g.x || 0, ty: g.y || 1.2, tz: g.z || 0, tyaw: g.yaw || 0,
              vx: 0, vy: 0, vz: 0, age: 0, last: 0, charId: g.c || "obake",
              score: 0, isHost: false, got: [],
              placed: [], phasing: false, scaring: 0 };
        this.peers.set(o.pid, p);
        if (this.onEvent) this.onEvent("join", o.name);
      }
      p.name = o.name;
      p.placed = o.placed || [];
      // 直接つながっている人の ようすは、そちらの ほうが ずっと 新しい。
      //  サーバーごしの 古いもので 上書きしない
      if (o.g && !(p.fast && Date.now() - (p.fastT || 0) < 3000)) {
        // 速さは 本人が はかって 送ってくれている。
        //  通信の ゆらぎが まざらないので、これが いちばん たしか
        if (o.g.vx !== undefined) { p.vx = o.g.vx; p.vy = o.g.vy || 0; p.vz = o.g.vz; }
        else { p.vx = 0; p.vy = 0; p.vz = 0; }
        p.tx = o.g.x; p.ty = o.g.y; p.tz = o.g.z; p.tyaw = o.g.yaw;
        p.age = 0;
        if (p.first === undefined) { p.first = 1; p.x = p.tx; p.y = p.ty; p.z = p.tz; p.yaw = p.tyaw; }
        p.phasing = !!o.g.p; p.scaring = o.g.s || 0;
        p.charId = o.g.c || "obake";           // ともだちの すがた
        p.score = o.g.sc || 0;                 // おどかし勝負の 人数
        p.got = o.g.got || [];                 // その人が 拾った 拾いものの 番号
        p.isHost = !!o.g.h;                    // この人が おや か
        if (o.g.h) this.remoteBattle = o.g.bt || null;   // 勝負の ようす
      }
    }
    if (!sawHost && !this.isHost) this.remoteBattle = null;   // おやが いない＝勝負は なし
    for (const [pid, p] of this.peers) {
      if (!seen.has(pid)) { this.peers.delete(pid); if (this.onEvent) this.onEvent("part", p.name); }
    }

    if (!this.isHost) {
      this.remoteWorld = room.world || null;
      if (this.remoteWorld) this.worldSeq = (this.worldSeq || 0) + 1;   // 新しくとどいた しるし
    }
    if (this.isHost && room.acts && room.acts.length) {
      for (const a of room.acts) {
        const key = a.q || "?";
        const last = this.actSeen.get(key) || 0;
        if (!a.i || a.i <= last) continue;            // もう使った合図はとばす
        this.actSeen.set(key, a.i);
        this.inActs.push(a);
      }
    }
  }

  // 直接 とどいた ようす。
  //  サーバーごしと 中身は 同じ。とどくのが ずっと 速いだけ。
  takeDirect(pid, msg) {
    const p = this.peers.get(pid);
    if (!p || !msg) return;
    p.fast = true;                       // この人は 直接つながっている
    p.fastT = Date.now();
    if (msg.g) {
      const g = msg.g;
      if (g.vx !== undefined) { p.vx = g.vx; p.vy = g.vy || 0; p.vz = g.vz; }
      p.tx = g.x; p.ty = g.y; p.tz = g.z; p.tyaw = g.yaw;
      p.age = 0;
      if (p.first === undefined) { p.first = 1; p.x = p.tx; p.y = p.ty; p.z = p.tz; p.yaw = p.tyaw; }
      p.phasing = !!g.p; p.scaring = g.s || 0;
      p.charId = g.c || "obake";
      p.score = g.sc || 0;
      p.got = g.got || [];
      p.isHost = !!g.h;
      if (g.h) this.remoteBattle = g.bt || null;
    }
    if (msg.placed) p.placed = msg.placed;
    // おやから とどいた 人間たちの ようす
    if (msg.world && !this.isHost) {
      this.remoteWorld = msg.world;
      this.worldSeq = (this.worldSeq || 0) + 1;
    }
    // おきゃくさんから とどいた「おどかした」合図
    if (this.isHost && Array.isArray(msg.acts)) {
      for (const a of msg.acts) {
        const key = pid;
        const last = this.actSeen.get(key) || 0;
        if (!a.i || a.i <= last) continue;
        this.actSeen.set(key, a.i);
        this.inActs.push(a);
      }
    }
  }

  // ホストが、たまった合図を取りだす
  takeActs() { const a = this.inActs; this.inActs = []; return a; }
}
