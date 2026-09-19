import assert from "node:assert/strict";
import * as THREE from "../lib/three.module.js";
import { buildWorld } from "../src/world.js";
import { buildStageWorld } from "../src/stageworld.js";
import { Player } from "../src/player.js";

// 最初から屋根上に置くだけでなく、降下・横からの進入・端から離れる操作を再現する。
// Nodeでは看板の描画だけを省く。地形・当たり判定・プレイヤーは実装をそのまま使う。
globalThis.document = { createElement: () => ({ getContext: () => ({ fillRect() {}, fillText() {} }) }) };
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
const input = (keys = []) => ({ mouseDX: 0, mouseDY: 0, axisX: 0, axisZ: 0, k: k => keys.includes(k) });
const worlds = {
  school: buildWorld(scene, { grass: 0.1, dust: 1 }),
  branch: buildStageWorld(scene, "branch", { grass: 0.1 }),
  park: buildStageWorld(scene, "park", { grass: 0.1 }),
};
const cases = [
  ["school", "体育館の棟", -32, 52, 14.51],
  ["school", "渡り廊下", 26, 18, 3.05],
  ["school", "部室棟", 27, 30, 3.5],
  ["school", "校舎", 0, -8, 14.4],
  ["branch", "体育館", -33, 48, 5.2],
  ["branch", "食堂", 33, 48, 4.5],
  ["branch", "渡り廊下", -28, 26, 3.55],
  ["branch", "校舎", -24, -8, 14.4],
  ["park", "お化け屋敷", -36, 0, 5],
  ["park", "電気自動車場", 34, -21, 4.8],
  ["park", "ゲーム館", -36, -21, 4.8],
  ["park", "列車庫", 0, -20, 6.2],
];
function player(world, x, z, y) {
  const p = new Player(new THREE.Scene(), world, "obake");
  p.x = x; p.z = z; p.y = y;
  return p;
}
function run(p, keys, seconds, dt = 1 / 60) {
  const i = input(keys);
  for (let t = dt; t <= seconds + 1e-6; t += dt) p.update(dt, i, camera, t);
}
let checks = 0;
for (const [id, name, x, z, roof] of cases) {
  for (const dt of [1 / 60, 1 / 20]) {
    const p = player(worlds[id], x, z, roof + 12);
    run(p, [], 10, dt);
    assert.ok(Math.abs(p.y - roof - 1.02) < 0.15, `${id}/${name}: 上空から着地 y=${p.y}, roof=${roof}`);
    run(p, ["KeyC"], 2, dt);
    assert.ok(p.y >= roof + 0.38 - 1e-6, `${id}/${name}: しずむ操作でも屋根を抜けない`);
    run(p, ["Space"], 1, dt);
    assert.ok(p.y > roof + 2, `${id}/${name}: 屋根から再び浮ける`);
    checks += 3;
  }
}
// 体育館の軒へ、地上で浮いてから前進する。着地後、棟まで斜面を歩く。
const gym = player(worlds.school, -32, 37, 1.02);
run(gym, ["Space"], 3.2);
gym.camYaw = 0;
run(gym, ["KeyW"], 2.5);
assert.ok(gym.z > 48 && gym.y > 12, `体育館の軒から棟へ移動: z=${gym.z}, y=${gym.y}`);
// 屋根の端を離れれば、その場に浮いたままにならず地上へ降りる。
const edge = player(worlds.branch, -28, 26, 4.57);
edge.camYaw = Math.PI / 2;
run(edge, ["KeyW"], 3);
run(edge, [], 5);
assert.ok(edge.x > -15 && edge.y < 1.2, "渡り廊下の端から離れて地上へ降りる");
// 回転木馬は斜めの屋根。実物の外の角には着地しない。
assert.equal(worlds.park.roofSurfaceAt(-10, 37), null, "回転木馬の外側には見えない屋根がない");
const carousel = player(worlds.park, -22, 25, 17);
run(carousel, [], 10);
assert.ok(Math.abs(carousel.y - 5.195) < .15, "回転木馬の屋根に着地する");
// 屋根のない空間には見えない床を作らない。
const outside = player(worlds.branch, 0, 45, 20);
run(outside, [], 10);
assert.ok(outside.y < 1.2, "屋根のない中庭へは地上まで降りる");
// 屋内から屋根へ吸い上げない。既存の天井制限も保つ。
for (const [id, x, z, ceiling] of [["school", -32, 52, 8.2], ["branch", -24, -8, 2.55]]) {
  const inside = player(worlds[id], x, z, 1.02);
  run(inside, ["Space"], 5);
  assert.ok(inside.y <= ceiling + 1e-6, `${id}: 室内の天井を抜けない`);
}
console.log(`roof test: ${checks + 7} checks passed (着地・進入・斜面・上下操作・屋内と屋外)`);
// 天井付近でも、入力なしに上階へ吸い上げられない。
for (const floor of [0, 1, 2]) {
  const p = player(worlds.school, 0, -10, floor * 3.6 + 2.95);
  run(p, [], 3);
  assert.ok(Math.abs(p.y - (floor * 3.6 + 1.02)) < .15, `天井から元の階へ戻る: ${floor}, y=${p.y}`);
}
// 分校の資料室は階段ではない。旧版で埋まった位置からも元の床へ戻る。
for(const x of [-3,0,3])for(const z of [-25,-20,-15]){
 const p=player(worlds.branch,x,z,2.9);run(p,[],4);
 assert.equal(p.inShaft,false);assert.ok(Math.abs(p.y-1.02)<.15,`資料室 ${x},${z}: ${p.y}`);
}
// 実際の階段を1階から屋上へ、同じ道を逆向きにたどって1階まで戻る。
const stair=player(worlds.branch,6.5,-14,1.02);
function trace(x1,z1,x2,z2){for(let i=0;i<=120;i++){stair.x=x1+(x2-x1)*i/120;stair.z=z1+(z2-z1)*i/120;run(stair,[],.05);}}
for(let f=0;f<4;f++){
 trace(6.5,-14,6.5,-24);trace(6.5,-24,8.5,-24);trace(8.5,-24,8.5,-14);run(stair,[],1);
 assert.ok(Math.abs(stair.y-((f+1)*3.6+1.02))<.18,`階段上り ${f}: ${stair.y}`);
 trace(8.5,-14,6.5,-14);
}
for(let f=4;f>0;f--){
 trace(6.5,-14,8.5,-14);trace(8.5,-14,8.5,-24);trace(8.5,-24,6.5,-24);trace(6.5,-24,6.5,-14);run(stair,[],1);
 assert.ok(Math.abs(stair.y-((f-1)*3.6+1.02))<.18,`階段下り ${f}: ${stair.y}`);
}
console.log('branch archive: 9 no-rise cases and 8 stair ascent/descent cases passed');
