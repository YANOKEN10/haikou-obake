import assert from "node:assert/strict";
import * as THREE from "../lib/three.module.js";
import { buildStageWorld } from "../src/stageworld.js";
import { STAGES, stageUnlocked } from "../src/stages.js";
import { Player } from "../src/player.js";

assert.equal(stageUnlocked(STAGES[1], 1000), false, "1000人ちょうどでは分校は未解放");
assert.equal(stageUnlocked(STAGES[1], 1001), true, "1000人を超えると分校を解放");
assert.equal(stageUnlocked(STAGES[2], 2000), false, "2000人ちょうどでは遊園地は未解放");
assert.equal(stageUnlocked(STAGES[2], 2001), true, "2000人を超えると遊園地を解放");

for (const id of ["branch", "park"]) {
  const scene = new THREE.Scene();
  const world = buildStageWorld(scene, id, { grass: 0.4 });
  assert.equal(scene.children.length, 1, `${id}: 静的マップは1メッシュだけ`);
  // 遊園地は観覧車の電飾と木馬を増やしても、校舎（約44万面）より十分軽い。
  assert.ok(world.triangles < 18000, `${id}: 軽量な三角形数`);
  assert.ok(world.spawnSpots.length >= 40, `${id}: 拾いものの場所`);
  assert.equal(world.gates.length, 4, `${id}: 人間の出入口は4か所`);
  assert.ok(world.rooms.length >= 8, `${id}: 内部を含む8エリア以上`);
  const start = world.nav.nearest(world.entry.x, world.entry.z, 0, world.colliders, 99, 0);
  assert.ok(start >= 0, `${id}: 開始地点に道がある`);
  for (const room of world.rooms) {
    const goal = world.nav.nearest(room.cx, room.cz, 0, world.colliders, 99, 0);
    assert.ok(world.nav.path(start, goal), `${id}: ${room.name}へ人間が歩ける`);
    // 正門だけでなく、四方向のどの入口を選んでも全施設へ到達できる。
    for (const gate of world.gates) {
      const from = world.nav.nearest(gate.in.x, gate.in.z, 0, world.colliders, 99, 0);
      assert.ok(from >= 0 && world.nav.path(from, goal),
        `${id}: ${gate.name}から${room.name}へ歩ける`);
    }
  }
  const player = new Player(scene, world, "obake");
  player.x = world.start.x; player.z = world.start.z;
  const input = { mouseDX: 0, mouseDY: 0, axisX: 0, axisZ: -1, dash: false, k: () => false };
  const camera = new THREE.PerspectiveCamera();
  for (let i = 1; i <= 120; i++) player.update(1 / 60, input, camera, i / 60);
  assert.ok(Number.isFinite(player.x + player.y + player.z), `${id}: 2秒間の移動計算`);
  assert.ok(world.inPlay(player.x, player.z), `${id}: プレイヤーがマップ内にいる`);
}

console.log("stage test: 解放境界4件・別マップ2件・4入口から全エリアへの経路を確認");
