// ============================================================
//  ブラウザ同士を 直接つなぐ（WebRTC）
//
//  なぜ 要るか
//   これまでは 1秒に1回 サーバーへ 取りに行っていた。
//   ところが 実際に はかると、行って もどるまでに 1.1〜1.5秒
//   かかっていた（東京のサーバーまで 0.26秒＋置き場の読み書き 0.9秒）。
//   つまり ともだちの位置は「1.4秒に1回」しか とどいていない。
//   どんなに うまく よそうしても、これでは なめらかに ならない。
//
//  どうするか
//   さいしょの「あいさつ」だけ サーバー経由で やりとりして、
//   あとは ブラウザ同士を 直接つなぐ。
//   つながれば 30〜80ミリ秒、1秒に20回 やりとりできる。
//   ほとんど 同じ画面で 遊んでいるように なる。
//
//  つながらないとき
//   学校や 一部の携帯回線では 直接つなげないことがある。
//   そのときは だまって いままでの やりかたに もどる。
//   （つながっている人だけ 速く、ほかは これまでどおり）
// ============================================================

// あいさつのときだけ つかう。だれとでも つながるための 道しるべ。
//  ここが 使えなくても、ゲームは これまでどおり あそべる。
const ICE = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

const SEND_HZ = 20;            // 1秒に 何回 送るか
const GIVE_UP = 12000;         // これだけ たっても つながらなければ あきらめる

export class Rtc {
  constructor(net) {
    this.net = net;
    this.links = new Map();    // pid -> {pc, ch, ready, tried, born}
    this.onData = null;        // (pid, obj) => void
    this.lastSend = 0;
    this.supported = typeof RTCPeerConnection === "function";
  }

  get anyReady() {
    for (const l of this.links.values()) if (l.ready) return true;
    return false;
  }
  isReady(pid) { const l = this.links.get(pid); return !!(l && l.ready); }

  // --- 部屋の みんなと つなぎにいく --------------------------
  //  どちらが 声をかけるかは、番号の 大きい・小さいで 決める。
  //  そうしないと 両方から 声をかけて ぶつかる。
  ensure(pids) {
    if (!this.supported || !this.net.pid) return;
    for (const pid of pids) {
      if (this.links.has(pid)) continue;
      const mine = this.net.pid;
      const caller = mine < pid;        // 番号が 小さいほうが 声をかける
      this.open(pid, caller);
    }
    // いなくなった人は 片づける
    for (const [pid, l] of this.links) {
      if (pids.includes(pid)) continue;
      this.close(pid);
      void l;
    }
  }

  open(pid, caller) {
    let pc;
    try { pc = new RTCPeerConnection({ iceServers: ICE }); }
    catch (e) { return; }
    const link = { pc, ch: null, ready: false, caller, born: Date.now(), pend: [] };
    this.links.set(pid, link);

    pc.onicecandidate = (e) => {
      if (e.candidate) this.post(pid, "ice", e.candidate.toJSON());
    };
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === "failed" || s === "closed") this.close(pid);
    };
    pc.ondatachannel = (e) => this.bind(pid, e.channel);

    if (caller) {
      // 「順ばんを 守らない・とどかなくてもいい」設定。
      //  位置は つぎつぎ 送るので、古いものを 待つ必要がない
      const ch = pc.createDataChannel("g", { ordered: false, maxRetransmits: 0 });
      this.bind(pid, ch);
      pc.createOffer()
        .then((o) => pc.setLocalDescription(o).then(() => this.post(pid, "offer", o)))
        .catch(() => this.close(pid));
    }
  }

  bind(pid, ch) {
    const link = this.links.get(pid);
    if (!link) return;
    link.ch = ch;
    const opened = () => {
      if (link.ready) return;
      link.ready = true;
      if (this.onOpen) this.onOpen(pid);
    };
    // もう ひらいていることが ある。そのときは onopen が 来ないので、
    //  ここで 気づいて おく（これを 入れないと ずっと ready に ならない）
    if (ch.readyState === "open") opened();
    ch.onopen = opened;
    ch.onclose = () => { link.ready = false; };
    ch.onmessage = (e) => {
      if (!this.onData) return;
      try { this.onData(pid, JSON.parse(e.data)); } catch (err) { /* こわれた ぶんは すてる */ }
    };
  }

  // --- サーバーごしの あいさつ -------------------------------
  post(pid, kind, data) {
    this.net.sigOut.push({ to: pid, k: kind, d: JSON.stringify(data) });
    if (this.net.sigOut.length > 8) this.net.sigOut.shift();
  }

  // とどいた あいさつを うけとる
  async take(list) {
    for (const m of list || []) {
      const pid = m.from;
      let data = null;
      try { data = JSON.parse(m.d); } catch (e) { continue; }
      let link = this.links.get(pid);

      if (m.k === "offer") {
        // 声を かけられた。
        //  こちらに 古い つなぎが のこっていたら、いちど 捨てて 作りなおす。
        //  （相手が つなぎなおした ときに、かた方だけ 古いまま に ならないように）
        if (link && (link.ready || link.pc.signalingState !== "stable" ||
                     link.pc.connectionState === "failed")) {
          this.close(pid); link = null;
        }
        if (!link) { this.open(pid, false); link = this.links.get(pid); }
        if (!link) continue;
        try {
          await link.pc.setRemoteDescription(data);
          const ans = await link.pc.createAnswer();
          await link.pc.setLocalDescription(ans);
          this.post(pid, "answer", ans);
          for (const c of link.pend) { try { await link.pc.addIceCandidate(c); } catch (e) {} }
          link.pend.length = 0;
        } catch (e) { this.close(pid); }
      } else if (m.k === "answer") {
        if (!link) continue;
        try {
          await link.pc.setRemoteDescription(data);
          for (const c of link.pend) { try { await link.pc.addIceCandidate(c); } catch (e) {} }
          link.pend.length = 0;
        } catch (e) { this.close(pid); }
      } else if (m.k === "ice") {
        if (!link) continue;
        // まだ 相手の あいさつを 受けとる前なら、ためておく
        if (!link.pc.remoteDescription) { link.pend.push(data); continue; }
        try { await link.pc.addIceCandidate(data); } catch (e) { /* 古い ぶんは すてる */ }
      }
    }
  }

  // --- 毎フレーム ------------------------------------------
  //  つながっている 相手に、いまの ようすを 送る
  send(payload) {
    if (!this.links.size) return;
    const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
    if (now - this.lastSend < 1000 / SEND_HZ) return;
    this.lastSend = now;
    let s = null;
    for (const [pid, l] of this.links) {
      if (!l.ready || !l.ch || l.ch.readyState !== "open") {
        // いつまでも つながらないものは 片づける（ふつうの やりかたに もどる）
        if (!l.ready && Date.now() - l.born > GIVE_UP) this.close(pid);
        continue;
      }
      if (s === null) s = JSON.stringify(payload);
      try { l.ch.send(s); } catch (e) { /* いっぱいのときは とばす */ }
    }
  }

  close(pid) {
    const l = this.links.get(pid);
    if (!l) return;
    try { if (l.ch) l.ch.close(); } catch (e) {}
    try { l.pc.close(); } catch (e) {}
    this.links.delete(pid);
  }

  closeAll() {
    for (const pid of Array.from(this.links.keys())) this.close(pid);
  }
}
