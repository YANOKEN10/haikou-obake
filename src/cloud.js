// ============================================================
//  メールでのログインと、記録のクラウド保存
//   ・パスワードは扱わない（メールに届くリンクを開くだけ）
//   ・通信は fetch だけ。外部ライブラリは読みこまない
// ============================================================
import { CLOUD, cloudReady } from "./cloud-config.js";

const SESS = "haikou-obake:session";

function readSession() {
  try { return JSON.parse(localStorage.getItem(SESS) || "null"); } catch (e) { return null; }
}
function writeSession(s) {
  try {
    if (s) localStorage.setItem(SESS, JSON.stringify(s));
    else localStorage.removeItem(SESS);
  } catch (e) { /* 保存できなくても動作は続ける */ }
}

export class Cloud {
  constructor() {
    this.session = readSession();
    this.user = null;
  }

  get ready() { return cloudReady(); }
  get signedIn() { return Boolean(this.session && this.session.access_token); }
  get email() { return this.user ? this.user.email : (this.session ? this.session.email : null); }

  headers(auth = true) {
    const h = { "apikey": CLOUD.anonKey, "Content-Type": "application/json" };
    if (auth && this.session) h["Authorization"] = "Bearer " + this.session.access_token;
    return h;
  }

  // --- ログイン用のリンクを送る ------------------------------
  async sendLink(email) {
    if (!this.ready) return { ok: false, why: "まだサーバーにつながっていません" };
    email = String(email || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, why: "メールアドレスの形が正しくないようです" };
    const back = location.origin + location.pathname;
    try {
      const r = await fetch(CLOUD.url + "/auth/v1/otp?redirect_to=" + encodeURIComponent(back), {
        method: "POST",
        headers: this.headers(false),
        body: JSON.stringify({ email, create_user: true }),
      });
      if (!r.ok) {
        const t = await r.text();
        return { ok: false, why: "送れませんでした（" + r.status + "）" + (t ? "：" + t.slice(0, 120) : "") };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, why: "通信できませんでした。ネットにつながっているか確かめてください" };
    }
  }

  // --- メールのリンクから戻ってきたときの受けとり ------------
  captureFromUrl() {
    const h = location.hash.startsWith("#") ? location.hash.slice(1) : "";
    if (!h) return false;
    const p = new URLSearchParams(h);
    const at = p.get("access_token");
    if (!at) {
      if (p.get("error_description")) {
        history.replaceState(null, "", location.pathname);
        this.lastError = decodeURIComponent(p.get("error_description"));
      }
      return false;
    }
    this.session = {
      access_token: at,
      refresh_token: p.get("refresh_token") || "",
      expires_at: Date.now() + (Number(p.get("expires_in") || 3600) * 1000),
    };
    writeSession(this.session);
    history.replaceState(null, "", location.pathname);
    return true;
  }

  async refreshIfNeeded() {
    if (!this.session) return false;
    if (this.session.expires_at && Date.now() < this.session.expires_at - 60000) return true;
    if (!this.session.refresh_token) return false;
    try {
      const r = await fetch(CLOUD.url + "/auth/v1/token?grant_type=refresh_token", {
        method: "POST", headers: this.headers(false),
        body: JSON.stringify({ refresh_token: this.session.refresh_token }),
      });
      if (!r.ok) { this.signOut(); return false; }
      const d = await r.json();
      this.session = {
        access_token: d.access_token, refresh_token: d.refresh_token,
        expires_at: Date.now() + (d.expires_in || 3600) * 1000,
        email: this.session.email,
      };
      writeSession(this.session);
      return true;
    } catch (e) { return false; }
  }

  async loadUser() {
    if (!this.signedIn || !this.ready) return null;
    if (!(await this.refreshIfNeeded())) return null;
    try {
      const r = await fetch(CLOUD.url + "/auth/v1/user", { headers: this.headers() });
      if (!r.ok) { if (r.status === 401) this.signOut(); return null; }
      this.user = await r.json();
      if (this.session) { this.session.email = this.user.email; writeSession(this.session); }
      return this.user;
    } catch (e) { return null; }
  }

  signOut() {
    if (this.ready && this.session) {
      fetch(CLOUD.url + "/auth/v1/logout", { method: "POST", headers: this.headers() }).catch(() => {});
    }
    this.session = null; this.user = null;
    writeSession(null);
  }

  // --- 記録の読み書き ----------------------------------------
  //   saves テーブル: user_id(uuid, 主キー) / payload(jsonb) / updated_at
  async pull() {
    if (!this.signedIn || !this.ready) return null;
    if (!(await this.refreshIfNeeded())) return null;
    try {
      const r = await fetch(CLOUD.url + "/rest/v1/saves?select=payload,updated_at", { headers: this.headers() });
      if (!r.ok) return null;
      const rows = await r.json();
      return rows && rows[0] ? rows[0] : null;
    } catch (e) { return null; }
  }

  async push(payload) {
    if (!this.signedIn || !this.ready) return { ok: false, why: "ログインしていません" };
    if (!(await this.refreshIfNeeded())) return { ok: false, why: "ログインの有効期限が切れました。もう一度ログインしてください" };
    if (!this.user) await this.loadUser();
    if (!this.user) return { ok: false, why: "ログイン情報を確認できませんでした" };
    try {
      const r = await fetch(CLOUD.url + "/rest/v1/saves", {
        method: "POST",
        headers: { ...this.headers(), "Prefer": "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ user_id: this.user.id, payload, updated_at: new Date().toISOString() }),
      });
      if (!r.ok) {
        const t = await r.text();
        return { ok: false, why: "保存できませんでした（" + r.status + "）" + (t ? "：" + t.slice(0, 120) : "") };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, why: "通信できませんでした" };
    }
  }
}
