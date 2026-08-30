import assert from "node:assert/strict";
import { CHARS, hiddenUnlockReady, hiddenUnlockValue, validOwnedChars } from "../src/data.js";

const hidden = Object.entries(CHARS).filter(([, c]) => c.hidden);
assert.equal(Object.keys(CHARS).length, 17, "既存7体と隠し10体が登録されている");
assert.equal(hidden.length, 10, "隠しキャラが10体ある");
assert.equal(new Set(hidden.map(([, c]) => c.order)).size, 10, "表示順が重複していない");

for (const [id, c] of hidden) {
  assert.ok(c.unlock && c.unlock.key && c.unlock.at > 0 && c.unlock.label, `${id}: 解放条件がある`);
  const below = { playSeconds: 0, stats: { [c.unlock.key]: c.unlock.at - 1 } };
  const ready = { playSeconds: 0, stats: { [c.unlock.key]: c.unlock.at } };
  if (c.unlock.key === "playSeconds") {
    below.playSeconds = c.unlock.at - 1;
    ready.playSeconds = c.unlock.at;
  }
  assert.equal(hiddenUnlockValue(c, below), c.unlock.at - 1, `${id}: 条件値を読む`);
  assert.equal(hiddenUnlockReady(c, below), false, `${id}: 1不足では未解放`);
  assert.equal(hiddenUnlockReady(c, ready), true, `${id}: ちょうど達成で解放`);
}

const stale = { obake: 1, kyubi: 1, nurikabe: 1 };
const below = { stats: { trapsFired: CHARS.nurikabe.unlock.at - 1 } };
const cleaned = validOwnedChars(stale, below);
assert.equal(cleaned.obake, 1, "最初のキャラは残す");
assert.equal(cleaned.kyubi, 1, "交換で入手した通常キャラは残す");
assert.equal(cleaned.nurikabe, undefined, "条件未達のぬりかべは古い印を除去");

const ready = { stats: { trapsFired: CHARS.nurikabe.unlock.at } };
assert.equal(validOwnedChars(stale, ready).nurikabe, 1, "条件達成済みのぬりかべは残す");

console.log(`hidden character test: ${hidden.length} unlock conditions + stale save cleanup passed`);
