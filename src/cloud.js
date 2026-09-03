// ============================================================
//  なまえ＋あいことば でのログインと、記録のクラウド保存
//   ・メールアドレスは使わない
//   ・あいことばはサーバーへ送るだけで、端末には保存しない
//   ・保存されるのはログインの券（1年で切れる）だけ
// ============================================================
const TOK = "haikou-obake:token";

export class Cloud {
  constructor() {
    this.token = "";
    this.user = null;
    try { this.token = localStorage.getItem(TOK) || ""; } catch (e) { /* 使えない環境もある */ }
  }

  get ready() { return true; }              // 自前のサーバーなので設定は不要
  get signedIn() { return Boolean(this.token && this.user); }
  get name() { return this.user ? this.user.display : null; }

  setToken(t) {
    this.token = t || "";
    try {
      if (t) localStorage.setItem(TOK, t);
      else localStorage.removeItem(TOK);
    } catch (e) { /* 保存できなくてもその場では動く */ }
  }

  async call(path, opt) {
    const o = opt || {};
    const h = { "Content-Type": "application/json" };
    if (this.token) h["Authorization"] = "Bearer " + this.token;
    let r;
    try {
      r = await fetch(path, { method: o.method || "GET", headers: h, body: o.body ? JSON.stringify(o.body) : undefined });
    } catch (e) {
      return { ok: false, why: "つながりませんでした。ネットにつながっているか確かめてください" };
    }
    let d = null;
    try { d = await r.json(); } catch (e) { d = null; }
    if (!r.ok) {
      if (r.status === 401 && this.user) { this.setToken(""); this.user = null; }
      // サーバー機能がまだ無い場所（自分のパソコンなど）で開いたとき
      if (r.status === 404 && !d) {
        const local = location.hostname === "localhost" || location.hostname === "127.0.0.1";
        return {
          ok: false, status: 404, missing: true,
          why: local
            ? "自分のパソコンではクラウド機能は使えません。公開URLでお試しください"
            : "クラウド機能がまだ準備できていません",
        };
      }
      return { ok: false, why: (d && d.message) || "うまくいきませんでした（" + r.status + "）", status: r.status };
    }
    return { ok: true, data: d || {} };
  }

  // 券が生きているか確かめる（起動時に1回）
  async restore() {
    if (!this.token) return false;
    const r = await this.call("/api/save");
    if (!r.ok) {
      if (!r.missing && r.status !== 503 && (r.status === 401 || r.status === 404)) { this.setToken(""); this.user = null; }
      return false;
    }
    this.user = r.data.user;
    return true;
  }

  async signup(id, pw) { return await this.enter("signup", id, pw); }
  async login(id, pw) { return await this.enter("login", id, pw); }

  async enter(action, id, pw) {
    const r = await this.call("/api/auth", { method: "POST", body: { action, id, pw } });
    if (!r.ok) return r;
    this.setToken(r.data.token);
    this.user = r.data.user;
    return { ok: true, user: this.user };
  }

  signOut() { this.setToken(""); this.user = null; }

  async pull() {
    const r = await this.call("/api/save");
    if (!r.ok) return r;
    this.user = r.data.user;
    return { ok: true, payload: r.data.payload };
  }

  async push(payload) {
    const r = await this.call("/api/save", { method: "POST", body: { payload } });
    if (r.ok) this.user = r.data.user;
    return r;
  }

  async removeAccount(pw) {
    const r = await this.call("/api/save", { method: "DELETE", body: { pw } });
    if (r.ok) this.signOut();
    return r;
  }

  async changePw(oldPw, newPw) {
    return await this.call("/api/save", { method: "POST", body: { oldPw, newPw } });
  }

  // --- ともだち --------------------------------------------
  async friends() { return await this.call("/api/friends"); }
  async friendAct(body) { return await this.call("/api/friends", { method: "POST", body }); }
  async findFriend(name) { return await this.friendAct({ action: "search", name }); }
  async askFriend(id) { return await this.friendAct({ action: "request", id }); }
  async answerFriend(act, id) { return await this.friendAct({ action: act, id }); }
  async friendProfile(id) { return await this.friendAct({ action: "profile", id }); }
  async inviteFriend(id, code) { return await this.friendAct({ action: "invite", id, code }); }
  async clearInvite() { return await this.friendAct({ action: "clearInvite" }); }
  async createTrade(id, giveKind, giveN, wantKind, wantN) {
    return await this.friendAct({ action: "tradeCreate", id, giveKind, giveN, wantKind, wantN });
  }
  async answerTrade(action, tradeId) { return await this.friendAct({ action, tradeId }); }
}
