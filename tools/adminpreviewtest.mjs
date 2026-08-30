import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { STAGES, stageUnlocked } from "../src/stages.js";
import { CHARS, MATERIALS, TRAPS, PAINTS, UPGRADES } from "../src/data.js";

const require = createRequire(import.meta.url);
const handler = require("../api/admin-preview.js");
const KEY = "test-admin-preview-key-32-characters";

function request(method, key) {
  return new Promise((resolve, reject) => {
    const req = { method, headers: {}, body: { key } };
    const out = { status: 200, headers: {} };
    const res = {
      setHeader(k, v) { out.headers[k] = v; },
      status(n) { out.status = n; return this; },
      json(body) { out.body = body; resolve(out); },
      end() { resolve(out); },
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

assert.equal(stageUnlocked(STAGES[1], 0, true), true, "管理者は分校を試験できる");
assert.equal(stageUnlocked(STAGES[2], 0, true), true, "管理者は遊園地を試験できる");
assert.equal(Object.keys(CHARS).length, 17, "試験対象は全17キャラ");
assert.ok(Object.keys(MATERIALS).length > 0 && Object.keys(TRAPS).length > 0, "全材料・仕掛けの表がある");
assert.ok(PAINTS.length > 3 && Object.keys(UPGRADES).length === 5, "全色・全強化の表がある");
const main = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
for (const marker of ["Object.keys(CHARS)", "Object.keys(MATERIALS)", "Object.keys(TRAPS)", "PAINTS.map", "UPG_MAX"]) {
  assert.ok(main.includes(marker), "管理者状態に " + marker + " を使う");
}

const old = process.env.ADMIN_PREVIEW_KEY;
try {
  delete process.env.ADMIN_PREVIEW_KEY;
  let r = await request("POST", KEY);
  assert.equal(r.status, 503, "鍵が未設定なら閉じる");

  process.env.ADMIN_PREVIEW_KEY = KEY;
  r = await request("GET", KEY);
  assert.equal(r.status, 405, "POST以外は拒否");

  r = await request("POST", "wrong-key");
  assert.equal(r.status, 403, "違う鍵は拒否");

  r = await request("POST", KEY);
  assert.equal(r.status, 200, "正しい鍵だけ許可");
  assert.equal(r.body.ok, true);
  assert.equal(r.headers["Cache-Control"], "no-store", "認証結果をキャッシュしない");
} finally {
  if (old === undefined) delete process.env.ADMIN_PREVIEW_KEY;
  else process.env.ADMIN_PREVIEW_KEY = old;
}

console.log("admin preview test: 全17キャラ・全道具・ステージ2件・認証4件成功");
