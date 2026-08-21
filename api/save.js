// 記録の読み書き（ログインしている本人のぶんだけ）
const L = require("./_lib");

const MAX_BYTES = 200 * 1024;   // 記録1つの上限

module.exports = async function handler(req, res) {
  L.cors(req, res);
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (!L.configured()) { L.notReady(res); return; }

  const claim = L.readToken(L.bearer(req));
  if (!claim) { res.status(401).json({ error: "auth", message: "ログインしなおしてください。" }); return; }

  try {
    const user = await L.readUser(claim.id);
    if (!user) { res.status(404).json({ error: "gone", message: "データが見つかりませんでした。" }); return; }

    if (req.method === "GET") {
      res.status(200).json({ user: L.publicUser(user), payload: user.payload || null });
      return;
    }
    // アカウントごと消す（あいことばの確認が必要）
    if (req.method === "DELETE") {
      const bb = L.body(req);
      if (!L.checkPw(String(bb.pw == null ? "" : bb.pw), user)) {
        await L.slowDown();
        res.status(401).json({ error: "auth", message: "あいことばが ちがいます。" });
        return;
      }
      await L.deleteUser(claim.id);
      res.status(200).json({ deleted: true });
      return;
    }
    if (req.method !== "POST") { res.status(405).json({ error: "method" }); return; }

    const b = L.body(req);
    if (b.newPw != null) {
      const np = String(b.newPw);
      if (np.length < 4 || np.length > 64) {
        res.status(400).json({ error: "pw", message: "あいことばは4文字いじょうにしてください。" });
        return;
      }
      if (!L.checkPw(String(b.oldPw == null ? "" : b.oldPw), user)) {
        await L.slowDown();
        res.status(401).json({ error: "auth", message: "いまの あいことばが ちがいます。" });
        return;
      }
      user.pw = L.hashPw(np, user.salt);
      await L.writeUser(user);
      res.status(200).json({ user: L.publicUser(user), changed: true });
      return;
    }

    if (b.payload == null || typeof b.payload !== "object") {
      res.status(400).json({ error: "payload", message: "記録の中身がありません。" });
      return;
    }
    const size = Buffer.byteLength(JSON.stringify(b.payload));
    if (size > MAX_BYTES) {
      res.status(413).json({ error: "big", message: "記録が大きすぎます。" });
      return;
    }
    user.payload = b.payload;
    await L.writeUser(user);
    res.status(200).json({ user: L.publicUser(user), saved: true });
  } catch (e) {
    res.status(500).json({ error: "server", message: "サーバーにつながりませんでした。" });
  }
};
