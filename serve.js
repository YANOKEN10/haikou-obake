const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PORT = process.env.PORT ? Number(process.env.PORT) : 5178;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
};

const devshot = require("./devshot.js");

http.createServer((req, res) => {
  if (devshot(req, res, ROOT)) return;
  let rel = decodeURIComponent(req.url.split("?")[0]);
  if (rel === "/") rel = "/index.html";
  let clean = path.normalize(rel);
  while (clean.length && (clean[0] === "/" || clean.charCodeAt(0) === 92)) clean = clean.slice(1);
  const file = path.join(ROOT, clean);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end("forbidden"); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { "content-type": "text/plain" }).end("not found"); return; }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(data);
  });
}).listen(PORT, "127.0.0.1", () => console.log("serving " + ROOT + " on http://localhost:" + PORT));
