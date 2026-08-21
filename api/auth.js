// なまえ＋あいことば でのとうろく／ログイン（メールは使いません）
const crypto = require("crypto");
const L = require("./_lib");

const ID_RE = /^[^\s<>]{2,24}$/;
const PW_MIN = 4, PW_MAX = 64;

module.exports = async function handler(req, res) {
  L.cors(req, res);
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "method" }); return; }

  const b = L.body(req);
  const rawId = String(b.id == null ? "" : b.id).trim();
  const id = L.normId(rawId);
  const pw = String(b.pw == null ? "" : b.pw);
  const action = b.action === "signup" ? "signup" : "login";

  if (!ID_RE.test(rawId)) {
    res.status(400).json({ error: "id", message: "なまえは2〜24文字で、スペースなしにしてください。" });
    return;
  }
  if (pw.length < PW_MIN || pw.length > PW_MAX) {
    res.status(400).json({ error: "pw", message: "あいことばは4文字いじょうにしてください。" });
    return;
  }

  try {
    const existing = await L.readUser(id);

    if (action === "signup") {
      if (existing) {
        res.status(409).json({ error: "taken", message: "そのなまえは、もう つかわれています。" });
        return;
      }
      const salt = crypto.randomBytes(16).toString("hex");
      const user = {
        id, display: rawId, salt, pw: L.hashPw(pw, salt),
        payload: null, created: Date.now(),
      };
      await L.writeUser(user);
      res.status(200).json({ token: L.makeToken(id), user: L.publicUser(user) });
      return;
    }

    if (!existing || !L.checkPw(pw, existing)) {
      await L.slowDown();
      res.status(401).json({ error: "auth", message: "なまえか あいことばが ちがいます。" });
      return;
    }
    res.status(200).json({ token: L.makeToken(id), user: L.publicUser(existing) });
  } catch (e) {
    res.status(500).json({ error: "server", message: "サーバーにつながりませんでした。" });
  }
};
