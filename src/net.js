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
const TICK = 1000;          // ふだんの送信かんかく
const TICK_SLOW = 2500;     // 画面を見ていないとき

export class Net {
  constructor() {
    this.code = "";
    this.pid = "";
    this.name = "";
    this.isHost = false;
    this.peers = new Map();      // pid -> {name, tx,ty,tz,tyaw, x,y,z,yaw, placed, seen}
    this.remoteWorld = null;     // ホストからとどいた人間たち
    this.outActs = [];           // ホストへ送る「おどかした」合図
    this.inActs = [];            // ホストが受けとった合図
    this.on = false;
    this.busy = false;
    this.wait = 0;
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
    this.isHost = true; this.on = true; this.wait = 0; this.fails = 0;
    this.peers.clear(); this.remoteWorld = null;
    this.status = "部屋をつくりました";
    return r;
  }

  async join(code, name) {
    const r = await this.call({ action: "join", code, name });
    if (!r.ok) return r;
    this.code = r.data.code; this.pid = r.data.pid; this.name = r.data.name;
    this.isHost = r.data.room.youAreHost; this.on = true; this.wait = 0; this.fails = 0;
    this.peers.clear(); this.remoteWorld = null;
    this.apply(r.data.room);
    this.status = "部屋に入りました";
    return r;
  }

  async leave() {
    const code = this.code, pid = this.pid;
    this.on = false; this.code = ""; this.pid = ""; this.isHost = false;
    this.peers.clear(); this.remoteWorld = null; this.outActs.length = 0;
    if (code && pid) await this.call({ action: "leave", code, pid });
  }

  // おどかしたことをホストへ知らせる（自分がホストなら、そのまま自分で使う）
  reportScare(hid, amount, why) {
    if (!this.on) return;
    if (this.isHost) this.inActs.push({ k: "scare", hid, a: amount, w: why });
    else this.outActs.push({ k: "scare", hid, a: amount, w: why });
  }

  // --- 毎フレーム ------------------------------------------
  //  me    = {x,y,z,yaw,phasing,scaring}
  //  place = 置いてあるもの [{k,id,x,z}]
  //  world = ホストのときだけ渡す {humans:[...], wave, kicked}
  update(dt, me, placed, world) {
    if (!this.on) return;

    // とどいた位置へ、なめらかに寄せる
    const k = Math.min(1, dt * 6);
    for (const p of this.peers.values()) {
      p.x += (p.tx - p.x) * k;
      p.y += (p.ty - p.y) * k;
      p.z += (p.tz - p.z) * k;
      let d = ((p.tyaw - p.yaw + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (d < -Math.PI) d += Math.PI * 2;
      p.yaw += d * k;
    }

    this.wait -= dt * 1000;
    if (this.busy || this.wait > 0) return;
    this.wait = (document.hidden ? TICK_SLOW : TICK) + this.fails * 1500;
    this.busy = true;

    const body = { action: "sync", code: this.code, pid: this.pid, g: me, placed: placed || [] };
    if (this.isHost && world) body.world = world;
    else if (this.outActs.length) { body.acts = this.outActs.slice(0, 12); this.outActs.length = 0; }

    this.call(body).then((r) => {
      this.busy = false;
      if (!r.ok) {
        this.fails++;
        this.status = r.why;
        if (r.code === "none" || this.fails > 6) {          // 部屋がなくなった
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

  apply(room) {
    const wasHost = this.isHost;
    this.isHost = room.youAreHost;
    if (this.isHost && !wasHost && this.onEvent) this.onEvent("host", "あなたが おやになりました");

    const seen = new Set();
    for (const o of room.others || []) {
      seen.add(o.pid);
      let p = this.peers.get(o.pid);
      if (!p) {
        const g = o.g || {};
        p = { name: o.name, x: g.x || 0, y: g.y || 1.2, z: g.z || 0, yaw: g.yaw || 0,
              tx: g.x || 0, ty: g.y || 1.2, tz: g.z || 0, tyaw: g.yaw || 0, placed: [], phasing: false, scaring: 0 };
        this.peers.set(o.pid, p);
        if (this.onEvent) this.onEvent("join", o.name);
      }
      p.name = o.name;
      p.placed = o.placed || [];
      if (o.g) {
        p.tx = o.g.x; p.ty = o.g.y; p.tz = o.g.z; p.tyaw = o.g.yaw;
        p.phasing = !!o.g.p; p.scaring = o.g.s || 0;
        // はなれすぎていたら（ワープしたときなど）、いきなり合わせる
        if (Math.abs(p.tx - p.x) > 14 || Math.abs(p.tz - p.z) > 14) { p.x = p.tx; p.y = p.ty; p.z = p.tz; }
      }
    }
    for (const [pid, p] of this.peers) {
      if (!seen.has(pid)) { this.peers.delete(pid); if (this.onEvent) this.onEvent("part", p.name); }
    }

    if (!this.isHost) this.remoteWorld = room.world || null;
    if (this.isHost && room.acts && room.acts.length) this.inActs.push(...room.acts);
  }

  // ホストが、たまった合図を取りだす
  takeActs() { const a = this.inActs; this.inActs = []; return a; }
}
