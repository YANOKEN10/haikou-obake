import assert from "node:assert/strict";
import * as THREE from "../lib/three.module.js";
import { Player } from "../src/player.js";
import { CHARS, paintById } from "../src/data.js";

const choice = { body: "ai", deco: "momo", glow: "hisui", eye: "kin" };
const expected = Object.fromEntries(
  Object.entries(choice).map(([part, id]) => [part, paintById(id).hex]),
);

function colorHex(material) {
  return material.color.getHex();
}

let checks = 0;
for (const charId of Object.keys(CHARS)) {
  const player = new Player(new THREE.Scene(), {}, charId);
  const fixedBefore = player.extras
    .filter((mesh) => mesh.userData.part === "fixed")
    .map((mesh) => colorHex(mesh.material));

  player.setPaint(choice);

  assert.equal(colorHex(player.bodyMat), expected.body, `${charId}: あたま・手の色`);
  assert.equal(colorHex(player.skirtMat), expected.body, `${charId}: すその色`);
  for (const mesh of player.extras.filter((mesh) => mesh.userData.part === "body")) {
    assert.equal(colorHex(mesh.material), expected.body, `${charId}: 追加のからだパーツ`);
  }
  checks++;

  for (const mesh of player.extras.filter((mesh) => (mesh.userData.part || "deco") === "deco")) {
    assert.equal(colorHex(mesh.material), expected.deco, `${charId}: かざりパーツ`);
  }
  checks++;

  assert.equal(player.bodyMat.emissive.getHex(), expected.glow, `${charId}: からだのひかり`);
  assert.equal(player.skirtMat.emissive.getHex(), expected.glow, `${charId}: すそのひかり`);
  assert.equal(player.xrayMat.color.getHex(), expected.glow, `${charId}: りんかくのひかり`);
  assert.equal(player.light.color.getHex(), expected.glow, `${charId}: 手あかり`);
  checks++;

  assert.equal(colorHex(player.eyeMat), expected.eye, `${charId}: 基本の目と口`);
  const eyeParts = player.extras.filter((mesh) => mesh.userData.part === "eye");
  for (const mesh of eyeParts) {
    assert.equal(colorHex(mesh.material), expected.eye, `${charId}: 追加の目パーツ`);
  }
  const visibleBasicEye = player.eyeL.visible || player.eyeR.visible || player.mouth.visible;
  assert.ok(visibleBasicEye || eyeParts.length > 0, `${charId}: 色が見える目または口がある`);
  checks++;

  const fixedAfter = player.extras
    .filter((mesh) => mesh.userData.part === "fixed")
    .map((mesh) => colorHex(mesh.material));
  assert.deepEqual(fixedAfter, fixedBefore, `${charId}: 黒目など固定する細部`);
}

assert.equal(
  new Player(new THREE.Scene(), {}, "kyubi").extras.filter((mesh) => mesh.userData.part === "eye").length,
  2,
  "九尾の左右の目が色がえ対象に登録されている",
);

console.log(`paint test: ${Object.keys(CHARS).length} characters x 4 parts = ${checks} checks passed`);
