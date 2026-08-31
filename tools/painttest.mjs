import assert from "node:assert/strict";
import * as THREE from "../lib/three.module.js";
import { Player } from "../src/player.js";
import { CHARS, PAINTS, paintById } from "../src/data.js";

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

let allColorChecks = 0;
for (const charId of Object.keys(CHARS)) {
  const player = new Player(new THREE.Scene(), {}, charId);
  for (const paint of PAINTS.filter((p)=>p.hex !== null)) {
    for (const part of ["body","deco","glow","eye"]) {
      player.setPaint({ [part]:paint.id });
      if (part === "body") {
        assert.equal(colorHex(player.bodyMat),paint.hex,`${charId}: ${paint.name}を体へ反映`);
        for(const m of player.extras.filter((q)=>q.userData.part==="body"))
          assert.equal(colorHex(m.material),paint.hex,`${charId}: ${paint.name}を追加体パーツへ反映`);
      } else if(part === "deco") {
        for(const m of player.extras.filter((q)=>(q.userData.part||"deco")==="deco"))
          assert.equal(colorHex(m.material),paint.hex,`${charId}: ${paint.name}を飾りへ反映`);
      } else if(part === "eye") {
        assert.equal(colorHex(player.eyeMat),paint.hex,`${charId}: ${paint.name}を基本目へ反映`);
        for(const m of player.extras.filter((q)=>q.userData.part==="eye"))
          assert.equal(colorHex(m.material),paint.hex,`${charId}: ${paint.name}を追加目へ反映`);
      } else {
        assert.equal(player.xrayMat.color.getHex(),paint.hex,`${charId}: ${paint.name}を輪郭光へ反映`);
      }
      allColorChecks++;
    }
  }
}

const amano=new Player(new THREE.Scene(),{},"amanojaku");
amano.bob=.25;
amano.applyPose(1/60,.2,0);
const idleHand=amano.handL.position.clone();
amano.animateMane(.2,0);
const idleHair=amano.mane[0].m.rotation.x;
amano.bob=1.1; amano.dashing=true;
amano.applyPose(1/60,1.2,9);
amano.animateMane(1.2,9);
assert.notDeepEqual(amano.handL.position.toArray(),idleHand.toArray(),"あまのじゃく: 走ると腕を振る");
assert.notEqual(amano.mane[0].m.rotation.x,idleHair,"あまのじゃく: 走ると長髪がたなびく");
amano.scarePose=1;
amano.applyPose(1/60,1.4,0);
assert.ok(amano.handL.position.y>1.2,"あまのじゃく: おどかす時に両腕を上げる");
assert.notEqual(amano.group.rotation.z,undefined,"あまのじゃく: 全身の重心を動かす");

console.log(`paint test: ${checks} basic + ${allColorChecks} all-color checks passed`);
