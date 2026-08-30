import * as THREE from "../lib/three.module.js";
import { MeshBuilder, wallWithHoles } from "./meshbuild.js";
import { Colliders, NavGraph, rand } from "./util.js";

const FLOOR_H = 3.6;

function rectangleHelpers(bounds) {
  const inPlay = (x, z) => x >= bounds.x1 + 1 && x <= bounds.x2 - 1 && z >= bounds.z1 + 1 && z <= bounds.z2 - 1;
  const clampPlay = (x, z) => ({
    x: Math.min(Math.max(x, bounds.x1 + 1.5), bounds.x2 - 1.5),
    z: Math.min(Math.max(z, bounds.z1 + 1.5), bounds.z2 - 1.5),
  });
  return { inPlay, clampPlay };
}

function fence(mb, col, bounds, gates, color) {
  const holesX1 = gates.filter((g) => g.axis === "x" && g.at === bounds.z1);
  const holesX2 = gates.filter((g) => g.axis === "x" && g.at === bounds.z2);
  const holesZ1 = gates.filter((g) => g.axis === "z" && g.at === bounds.x1);
  const holesZ2 = gates.filter((g) => g.axis === "z" && g.at === bounds.x2);
  const line = (axis, fixed, from, to, holes) => wallWithHoles(mb, col, {
    axis, fixed, from, to, y1: 0, y2: 2.3, thick: 0.16, color,
    holes: holes.map((g) => ({ a: (axis === "x" ? g.in.x : g.in.z) - g.w / 2,
      b: (axis === "x" ? g.in.x : g.in.z) + g.w / 2, y1: 0, y2: 2.5 })),
  });
  line("x", bounds.z1, bounds.x1, bounds.x2, holesX1);
  line("x", bounds.z2, bounds.x1, bounds.x2, holesX2);
  line("z", bounds.x1, bounds.z1, bounds.z2, holesZ1);
  line("z", bounds.x2, bounds.z1, bounds.z2, holesZ2);
  for (let x = bounds.x1; x <= bounds.x2; x += 5) {
    mb.box(x, 1.3, bounds.z1, 0.18, 2.6, 0.18, color);
    mb.box(x, 1.3, bounds.z2, 0.18, 2.6, 0.18, color);
  }
  for (let z = bounds.z1; z <= bounds.z2; z += 5) {
    mb.box(bounds.x1, 1.3, z, 0.18, 2.6, 0.18, color);
    mb.box(bounds.x2, 1.3, z, 0.18, 2.6, 0.18, color);
  }
}

function addRoom(rooms, spawnSpots, id, name, kind, x1, z1, x2, z2, far = 0.45) {
  const r = { id, name, kind, floor: 0, y: 0, x1, z1, x2, z2, cx: (x1 + x2) / 2, cz: (z1 + z2) / 2 };
  rooms.push(r);
  for (let i = 0; i < 8; i++) spawnSpots.push({ x: rand(x1 + 1.2, x2 - 1.2), z: rand(z1 + 1.2, z2 - 1.2), y: 0, floor: 0, far });
  return r;
}

function roomName(rooms, x, z) {
  const r = rooms.find((q) => x > q.x1 && x < q.x2 && z > q.z1 && z < q.z2);
  return r ? r.name : "そと";
}

function gridNav(nav, col, bounds, rooms, step = 10) {
  for (let x = bounds.x1 + 5; x <= bounds.x2 - 5; x += step)
    for (let z = bounds.z1 + 5; z <= bounds.z2 - 5; z += step)
      if (!col.resolve(x, z, 0.45, 0.7).hit) nav.addNode(x, z, 0, roomName(rooms, x, z), 0);
  for (const r of rooms) nav.addNode(r.cx, r.cz, 0, r.name, 0);
  nav.autoLink(col, step * 1.55);
}

function finalize(scene, id, mb, col, nav, rooms, spawnSpots, lightSpots, gates, ways, bounds, indoorRects, start) {
  col.build();
  const staticMesh = mb.finish(new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 2, specular: 0x0b0d12 }));
  staticMesh.name = id;
  scene.add(staticMesh);
  const h = rectangleHelpers(bounds);
  return {
    id, colliders: col, nav, rooms, spawnSpots, lightSpots, props: [], gates, ways,
    exit: gates[0].out, entry: start, staticMesh, triangles: mb.triangles, bounds,
    northOutsideZ: bounds.z1 + 2, floors: 1, floorHeight: FLOOR_H, roofY: FLOOR_H,
    start, secret: null, inSecret() { return false; }, floorOf() { return 0; },
    stairCenterX() { return 0; }, inStairShaft() { return false; }, stairSurface() { return 0; },
    roomAt(x, z) { return roomName(rooms, x, z); },
    isIndoors(x, z) { return indoorRects.some((r) => x > r.x1 && x < r.x2 && z > r.z1 && z < r.z2); },
    inGym() { return false; }, gymCeil: 7, inPlay: h.inPlay, clampPlay: h.clampPlay,
    update() {},
  };
}

function buildBranch(scene, opts) {
  const mb = new MeshBuilder(), col = new Colliders(), nav = new NavGraph();
  const rooms = [], spawnSpots = [], lightSpots = [];
  const bounds = { x1: -54, x2: 54, z1: -42, z2: 74 };
  const gates = [
    { id: "s", name: "さびた正門", in: { x: 0, z: 68 }, out: { x: 0, z: 79 }, axis: "x", at: bounds.z2, w: 6 },
    { id: "e", name: "給食門", in: { x: 49, z: 18 }, out: { x: 60, z: 18 }, axis: "z", at: bounds.x2, w: 4 },
    { id: "w", name: "プール門", in: { x: -49, z: 45 }, out: { x: -60, z: 45 }, axis: "z", at: bounds.x1, w: 4 },
    { id: "n", name: "山側の門", in: { x: 28, z: -37 }, out: { x: 28, z: -48 }, axis: "x", at: bounds.z1, w: 4 },
  ];
  const ways = [
    { id: "court", name: "中庭の玄関", out: { x: 0, z: 18 }, in: { x: 0, z: 8 } },
    { id: "east", name: "給食室のドア", out: { x: 39, z: 3 }, in: { x: 31, z: 3 } },
    { id: "west", name: "割れた美術室", out: { x: -39, z: -4 }, in: { x: -31, z: -4 } },
  ];
  mb.slab(bounds.x1, bounds.z1, bounds.x2, bounds.z2, 0, 0.3, 0x394340);
  // 以前の木造四階建てと重ならない、低いコンクリートのコの字校舎。
  const wings = [
    { x1: -38, x2: -10, z1: -28, z2: 18, c: 0x596269 },
    { x1: 10, x2: 38, z1: -28, z2: 18, c: 0x536069 },
    { x1: -10, x2: 10, z1: -28, z2: -12, c: 0x4d5962 },
  ];
  for (const w of wings) {
    mb.slab(w.x1, w.z1, w.x2, w.z2, 0.12, 0.24, 0x4b5052);
    mb.slab(w.x1, w.z1, w.x2, w.z2, 3.55, 0.28, 0x30383e);
    for (const [axis, fixed, from, to] of [["x", w.z1, w.x1, w.x2], ["x", w.z2, w.x1, w.x2], ["z", w.x1, w.z1, w.z2], ["z", w.x2, w.z1, w.z2]])
      wallWithHoles(mb, col, { axis, fixed, from, to, y1: 0, y2: 3.6, thick: 0.25, color: w.c,
        holes: [{ a: (from + to) / 2 - 1.2, b: (from + to) / 2 + 1.2, y1: 0, y2: 2.5 }] });
    // 青緑の連続窓が、この分校の見分けやすいしるし。
    const n = Math.max(2, Math.floor((w.x2 - w.x1) / 5));
    for (let i = 0; i < n; i++) mb.box(w.x1 + 2.5 + i * 5, 2.1, w.z2 + 0.15, 2.8, 1.0, 0.08, 0x49737a);
  }
  const indoorRects = wings;
  addRoom(rooms, spawnSpots, "science", "標本だらけの理科室", "science", -36, -25, -12, -7, 0.7);
  addRoom(rooms, spawnSpots, "art", "石こう像の美術室", "art", -36, -5, -12, 15, 0.55);
  addRoom(rooms, spawnSpots, "lunch", "止まった給食室", "home", 12, -25, 36, -7, 0.68);
  addRoom(rooms, spawnSpots, "broadcast", "霧の放送室", "music", 12, -5, 36, 15, 0.58);
  addRoom(rooms, spawnSpots, "archive", "地下資料庫への入口", "library", -8, -26, 8, -14, 0.9);
  addRoom(rooms, spawnSpots, "court", "ひびわれた中庭", "yard", -9, -10, 9, 30, 0.35);
  // 中庭の枯れた噴水と時計塔。
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    mb.box(Math.cos(a) * 5, 0.45, 22 + Math.sin(a) * 5, 1.4, 0.9, 0.7, 0x50575b, { rotY: -a });
  }
  mb.box(0, 5.5, -24, 4.6, 11, 4.6, 0x414b54);
  mb.box(0, 7.5, -21.65, 2.3, 2.3, 0.08, 0xd8d1b5);
  for (let i = 0; i < 5; i++) mb.box(-0.8 + i * 0.4, 7.5, -21.55, 0.08, 0.9 - Math.abs(i - 2) * 0.2, 0.06, 0x25252b);
  fence(mb, col, bounds, gates, 0x3b464b);
  for (let i = 0; i < 90 * (opts.grass || 1); i++) mb.tuft(rand(-48, 48), rand(22, 66), 0.08, rand(0.35, 0.8), 0x26382f, 0x465449, 2);
  for (const x of [-28, 0, 28]) for (const z of [-20, 8, 35, 60]) lightSpots.push({ x, y: 3.0, z, floor: 0 });
  // 奥棟の中央ドアへ正面から入る点。斜めの最短線だと壁の角をかすめる。
  nav.addNode(0, -10, 0, "地下資料庫への入口", 0);
  gridNav(nav, col, bounds, rooms, 9);
  return finalize(scene, "branch", mb, col, nav, rooms, spawnSpots, lightSpots, gates, ways, bounds, indoorRects, { x: 0, z: 56 });
}

function buildPark(scene, opts) {
  const mb = new MeshBuilder(), col = new Colliders(), nav = new NavGraph();
  const rooms = [], spawnSpots = [], lightSpots = [];
  const bounds = { x1: -60, x2: 60, z1: -48, z2: 78 };
  const gates = [
    { id: "s", name: "入園ゲート", in: { x: 0, z: 71 }, out: { x: 0, z: 84 }, axis: "x", at: bounds.z2, w: 8 },
    { id: "e", name: "従業員口", in: { x: 55, z: 20 }, out: { x: 67, z: 20 }, axis: "z", at: bounds.x2, w: 4 },
    { id: "w", name: "搬入口", in: { x: -55, z: -4 }, out: { x: -67, z: -4 }, axis: "z", at: bounds.x1, w: 4 },
    { id: "n", name: "山の非常口", in: { x: 24, z: -43 }, out: { x: 24, z: -55 }, axis: "x", at: bounds.z1, w: 4 },
  ];
  const ways = [
    { id: "plaza", name: "チケット売り場", out: { x: 0, z: 63 }, in: { x: 0, z: 54 } },
    { id: "ghost", name: "お化け屋敷の裏口", out: { x: -45, z: 1 }, in: { x: -35, z: 1 } },
    { id: "maze", name: "鏡の迷路", out: { x: 45, z: 2 }, in: { x: 35, z: 2 } },
  ];
  mb.slab(bounds.x1, bounds.z1, bounds.x2, bounds.z2, 0, 0.28, 0x30343b);
  // 中央広場の放射状の色あせた舗装。
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2;
    mb.wall(0, 24, Math.sin(a) * 25, 24 + Math.cos(a) * 25, 0.02, 0.08, 1.2, i % 2 ? 0x55424f : 0x4a5260);
  }
  const indoorRects = [
    { x1: -50, x2: -24, z1: -18, z2: 12 },
    { x1: 25, x2: 50, z1: -18, z2: 12 },
  ];
  // お化け屋敷。傾いた入口と、ぎざぎざの屋根で大きな顔に見える。
  const gh = indoorRects[0];
  mb.slab(gh.x1, gh.z1, gh.x2, gh.z2, 0.12, 0.24, 0x2b202a);
  mb.slab(gh.x1, gh.z1, gh.x2, gh.z2, 5.0, 0.35, 0x1c1720);
  for (const [axis, fixed, from, to] of [["x", gh.z1, gh.x1, gh.x2], ["x", gh.z2, gh.x1, gh.x2], ["z", gh.x1, gh.z1, gh.z2], ["z", gh.x2, gh.z1, gh.z2]])
    wallWithHoles(mb, col, { axis, fixed, from, to, y1: 0, y2: 5, thick: 0.3, color: 0x3b2638,
      holes: [{ a: (from + to) / 2 - 1.4, b: (from + to) / 2 + 1.4, y1: 0, y2: 2.8 }] });
  mb.box(-40, 3.6, 12.2, 2.0, 0.45, 0.2, 0xf1cf55, { rotY: 0.35 });
  mb.box(-34, 3.6, 12.2, 2.0, 0.45, 0.2, 0xf1cf55, { rotY: -0.35 });
  // 鏡の迷路は低い壁を何本もずらして、屋敷と全く違う歩き場にする。
  const mz = indoorRects[1];
  mb.slab(mz.x1, mz.z1, mz.x2, mz.z2, 0.12, 0.24, 0x55707a);
  for (let i = 0; i < 7; i++) {
    const x = 28 + i * 3.3, gapZ = i % 2 ? 4 : -9;
    mb.box(x, 1.4, gapZ, 0.18, 2.8, 12, 0x829aa8);
    col.add(x - 0.12, gapZ - 6, x + 0.12, gapZ + 6, 0, 2.8, "wall");
  }
  // 観覧車。すべて静的メッシュへまとめ、車輪のためにドローコールを増やさない。
  const wx = 25, wz = 39, wy = 10, rr = 10;
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * Math.PI * 2;
    mb.box(wx + Math.cos(a) * rr, wy + Math.sin(a) * rr, wz, 0.7, 0.7, 0.45, i % 3 ? 0x785564 : 0xb68a4c);
    if (i % 3 === 0) mb.box(wx + Math.cos(a) * rr, wy + Math.sin(a) * rr - 0.8, wz, 1.5, 1.1, 1.1, 0x514a66);
  }
  mb.wall(wx - 9, wz, wx, wz, 0, 10, 0.45, 0x4a4248);
  mb.wall(wx + 9, wz, wx, wz, 0, 10, 0.45, 0x4a4248);
  // メリーゴーラウンドと止まったティーカップ。
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    mb.box(Math.cos(a) * 8, 0.5, 24 + Math.sin(a) * 8, 3.3, 0.6, 2.2, i % 2 ? 0x6a4262 : 0x395b68, { rotY: -a });
    if (i % 2 === 0) mb.box(Math.cos(a) * 5.4, 1.6, 24 + Math.sin(a) * 5.4, 0.2, 3, 0.2, 0xc4a45a);
  }
  mb.box(0, 4.0, 24, 18, 0.4, 18, 0x49334c, { rotY: Math.PI / 4 });
  mb.box(0, 2.0, 24, 0.8, 4, 0.8, 0xc6a65c);
  for (let i = 0; i < 6; i++) {
    const x = -22 + i * 8.5;
    mb.box(x, 1.3, 56, 5.5, 2.6, 3.5, i % 2 ? 0x4a596a : 0x68454d);
    col.add(x - 2.75, 54.25, x + 2.75, 57.75, 0, 2.6, "furn");
  }
  addRoom(rooms, spawnSpots, "ghosthouse", "泣くお化け屋敷", "class", gh.x1, gh.z1, gh.x2, gh.z2, 0.9);
  addRoom(rooms, spawnSpots, "mirror", "くもった鏡の迷路", "art", mz.x1, mz.z1, mz.x2, mz.z2, 0.82);
  addRoom(rooms, spawnSpots, "wheel", "止まった観覧車", "music", 13, 27, 38, 52, 0.72);
  addRoom(rooms, spawnSpots, "carousel", "夜の回転木馬", "home", -12, 12, 12, 36, 0.55);
  addRoom(rooms, spawnSpots, "plaza", "色あせた中央広場", "yard", -22, 37, 22, 63, 0.38);
  fence(mb, col, bounds, gates, 0x443d48);
  for (let i = 0; i < 70 * (opts.grass || 1); i++) mb.tuft(rand(-55, 55), rand(-40, 70), 0.08, rand(0.3, 0.7), 0x2a3330, 0x45463d, 2);
  for (const x of [-40, -20, 0, 20, 40]) for (const z of [-25, 20, 55]) lightSpots.push({ x, y: 3.2, z, floor: 0 });
  gridNav(nav, col, bounds, rooms, 9);
  return finalize(scene, "park", mb, col, nav, rooms, spawnSpots, lightSpots, gates, ways, bounds, indoorRects, { x: 0, z: 64 });
}

export function buildStageWorld(scene, id, opts = {}) {
  if (id === "branch") return buildBranch(scene, opts);
  if (id === "park") return buildPark(scene, opts);
  throw new Error("知らないステージ: " + id);
}
