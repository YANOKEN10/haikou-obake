// 開発用: ブラウザから送られた PNG を shots/ に保存するだけのエンドポイント
const fs = require("fs");
const path = require("path");

module.exports = function devshot(req, res, ROOT) {
  if (req.method !== "POST" || !req.url.startsWith("/__shot")) return false;
  let body = "";
  req.on("data", (c) => { body += c; if (body.length > 40e6) req.destroy(); });
  req.on("end", () => {
    const raw = new URL(req.url, "http://x").searchParams.get("n") || "shot";
    const name = raw.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) || "shot";
    const dir = path.join(ROOT, "shots");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    const i = body.indexOf(",");
    const data = body.startsWith("data:") && i > 0 ? body.slice(i + 1) : body;
    fs.writeFileSync(path.join(dir, name + ".png"), Buffer.from(data, "base64"));
    res.writeHead(200, { "content-type": "text/plain" }).end("ok " + name);
  });
  return true;
};
