// 管理者だけが試験モードを開けるか、サーバー側の鍵で確かめる。
// 鍵をURLの # 以降に置くことで、アクセスログや別サイトへの参照元には送らない。
const crypto = require("crypto");

function body(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch (e) { return {}; }
  }
  return {};
}

function sameSecret(got, expected) {
  const a = Buffer.from(String(got || ""), "utf8");
  const b = Buffer.from(String(expected || ""), "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.status(405).json({ error: "method" });
    return;
  }

  const expected = String(process.env.ADMIN_PREVIEW_KEY || "");
  if (expected.length < 32) {
    res.status(503).json({ error: "setup", message: "試験モードは準備中です。" });
    return;
  }

  const got = String(body(req).key || "");
  if (!sameSecret(got, expected)) {
    await new Promise((resolve) => setTimeout(resolve, 450));
    res.status(403).json({ error: "forbidden", message: "このURLでは試験モードを開けません。" });
    return;
  }

  res.status(200).json({ ok: true });
};
