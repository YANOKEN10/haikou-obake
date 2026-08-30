import assert from "node:assert/strict";
import { CHARS, hiddenUnlockReady, hiddenUnlockValue } from "../src/data.js";

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

console.log(`hidden character test: ${hidden.length} unlock conditions passed`);
