// ============================================================
//  ともだちと一緒にあそぶ（かんたん版・ポーリング方式）
//   ・1秒に1回、自分のようすを送って、みんなのようすをもらう
//   ・受けとった位置へ「なめらかに寄せていく」ので、
//     1秒に1回でもスーッと動いて見える
//   ・部屋を作った人（ホスト）が人間たちを動かし、
//     ほかの人は、その人間たちを見ている
//   ・おどかした合図だけをホストに送り、ホストが結果を返す
// ============================================================
const API = "/api/room";
const TICK = 700;           // ふだんの送信かんかく
const TICK_SLOW = 2500;     // 画面を見ていないとき
const PREDICT_MAX = 1.4;    // 「このまま進む」と よそうしていい 秒数

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

    // とどいた位置から「そのまま進んだら いまここ」を よそうして、
    // そこへ なめらかに 寄せる。こうすると 止まって見えない。
    const k = Math.min(1, dt * 9);
    for (const p of this.peers.values()) {
      p.age = (p.age || 0) + dt;
      // よそうしすぎないように、上限をつける（とどかなかったとき用）
      const ah = Math.min(p.age, PREDICT_MAX);
      const px = p.tx + (p.vx || 0) * ah;
      const pz = p.tz + (p.vz || 0) * ah;
      const py = p.ty + (p.vy || 0) * ah;
      p.x += (px - p.x) * k;
      p.y += (py - p.y) * k;
      p.z += (pz - p.z) * k;
      let d = ((p.tyaw - p.yaw + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (d < -Math.PI) d += Math.PI * 2;
      p.yaw += d * Math.min(1, dt * 10);
    }

    this.send();
  }

  // ゲームの進みぐあいではなく、ほんとうの時計で数える。
  // （画面を見ていないとタイマーがゆっくりになるブラウザがあるため）
  send() {
    if (!this.on || this.busy || !this.pending) return;
    const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
    const gap = (document.hidden ? TICK_SLOW : TICK) + this.fails * 1500;
    if (this.lastSend && now - this.lastSend < gap) return;
    this.lastSend = now;
    this.busy = true;

    const { me, placed, world } = this.pending;
    const body = { action: "sync", code: this.code, pid: this.pid, g: me, placed: placed || [] };
    if (this.isHost && world) body.world = world;
    else if (!this.isHost) body.acts = this.outActs;   // 消さずに、そのまま送りつづける

    this.call(body).then((r) => {
      this.busy = false;
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
      if (o.g) {
        // まえにとどいた所からの ずれで、動く速さを 出す
        const now = (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
        const gap = p.last ? Math.min(2.5, Math.max(0.15, now - p.last)) : 0;
        if (gap > 0) {
          p.vx = (o.g.x - p.tx) / gap;
          p.vy = (o.g.y - p.ty) / gap;
          p.vz = (o.g.z - p.tz) / gap;
          // 速すぎる値は 通信のゆらぎ。おさえておく
          const sp = Math.hypot(p.vx, p.vz);
          if (sp > 14) { p.vx = p.vx / sp * 14; p.vz = p.vz / sp * 14; }
        } else { p.vx = p.vy = p.vz = 0; }
        p.last = now;
        p.age = 0;
        p.tx = o.g.x; p.ty = o.g.y; p.tz = o.g.z; p.tyaw = o.g.yaw;
        p.phasing = !!o.g.p; p.scaring = o.g.s || 0;
        p.charId = o.g.c || "obake";           // ともだちの すがた
        p.score = o.g.sc || 0;                 // おどかし勝負の 人数
        p.got = o.g.got || [];                 // その人が 拾った 拾いものの 番号
        p.isHost = !!o.g.h;                    // この人が おや か
        if (o.g.h) this.remoteBattle = o.g.bt || null;   // 勝負の ようす
        // はなれすぎていたら（ワープしたときなど）、いきなり合わせる
        if (Math.abs(p.tx - p.x) > 14 || Math.abs(p.tz - p.z) > 14) {
          p.x = p.tx; p.y = p.ty; p.z = p.tz; p.vx = p.vy = p.vz = 0;
        }
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

  // ホストが、たまった合図を取りだす
  takeActs() { const a = this.inActs; this.inActs = []; return a; }
}
