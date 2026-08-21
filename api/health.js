// 診断用：設定の「有無」だけを返す。値は絶対に返さない。
module.exports = function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const out = {
    node: process.version,
    hasBlobToken: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    hasAuthSecret: Boolean(process.env.AUTH_SECRET),
    blobModule: "?",
    hasResponse: typeof Response !== "undefined",
  };
  try {
    const b = require("@vercel/blob");
    out.blobModule = (b && typeof b.put === "function" && typeof b.get === "function") ? "ok" : "loaded-but-odd";
  } catch (e) {
    out.blobModule = "missing: " + String(e && e.message).slice(0, 120);
  }
  res.status(200).json(out);
};
