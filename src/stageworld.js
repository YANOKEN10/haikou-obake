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

// 歩いて中を見られる小施設。静的メッシュへ統合するので描画は1回のまま。
function openHall(mb, col, x1, z1, x2, z2, doorSide, color, roof = 4.2) {
  mb.slab(x1, z1, x2, z2, 0.12, 0.22, 0x30373b);
  mb.slab(x1, z1, x2, z2, roof, 0.24, 0x20262b);
  const sides = [["x", z1, x1, x2, "n"], ["x", z2, x1, x2, "s"],
    ["z", x1, z1, z2, "w"], ["z", x2, z1, z2, "e"]];
  for (const [axis, fixed, from, to, side] of sides) {
    const mid = (from + to) / 2;
    wallWithHoles(mb, col, { axis, fixed, from, to, y1: 0, y2: roof, thick: 0.24, color,
      holes: side === doorSide ? [{ a: mid - 2.1, b: mid + 2.1, y1: 0, y2: 2.8 }] : [] });
  }
}

function tableSet(mb, x, z, color = 0x655544, rotY = 0) {
  mb.box(x, 0.78, z, 2.4, 0.14, 1.15, color, { rotY });
  for (const sx of [-0.9, 0.9]) for (const sz of [-0.35, 0.35])
    mb.box(x + sx, 0.39, z + sz, 0.12, 0.78, 0.12, 0x34383b);
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
  mb.slab(bounds.x1, bounds.z1, bounds.x2, bounds.z2, 0, 0.3, 0x252e31);
  // 青白い月明かりに沈む、低いコンクリートのコの字校舎。
  const wings = [
    { x1: -38, x2: -10, z1: -28, z2: 18, c: 0x40575a },
    { x1: 10, x2: 38, z1: -28, z2: 18, c: 0x394f54 },
    { x1: -10, x2: 10, z1: -28, z2: -12, c: 0x354a50 },
  ];
  for (const w of wings) {
    mb.slab(w.x1, w.z1, w.x2, w.z2, 0.12, 0.24, 0x33474c);
    mb.slab(w.x1, w.z1, w.x2, w.z2, 3.55, 0.28, 0x202b31);
    for (const [axis, fixed, from, to] of [["x", w.z1, w.x1, w.x2], ["x", w.z2, w.x1, w.x2], ["z", w.x1, w.z1, w.z2], ["z", w.x2, w.z1, w.z2]])
      wallWithHoles(mb, col, { axis, fixed, from, to, y1: 0, y2: 3.6, thick: 0.25, color: w.c,
        holes: [{ a: (from + to) / 2 - 1.2, b: (from + to) / 2 + 1.2, y1: 0, y2: 2.5 }] });
    // 冷たい月色の連続窓と、ところどころ消えた蛍光灯。
    const n = Math.max(2, Math.floor((w.x2 - w.x1) / 5));
    for (let i = 0; i < n; i++) {
      mb.box(w.x1 + 2.5 + i * 5, 2.1, w.z2 + 0.15, 2.8, 1.0, 0.08, i%3===0?0x7daab8:0x456d78);
      mb.box(w.x1 + 2.5 + i * 5, 3.32, (w.z1+w.z2)/2, 2.5, 0.08, 0.28, i%4===0?0x243237:0x9bc9c8);
    }
  }
  const indoorRects = wings;
  addRoom(rooms, spawnSpots, "toilet", "青ざめた旧トイレ", "toilet", -36, -25, -12, -7, 0.7);
  addRoom(rooms, spawnSpots, "moonclass", "月明かりの教室", "class", -36, -5, -12, 15, 0.55);
  addRoom(rooms, spawnSpots, "desks", "机が残る教室", "class", 12, -25, 36, -7, 0.68);
  addRoom(rooms, spawnSpots, "candles", "ろうそくの特別教室", "music", 12, -5, 36, 15, 0.58);
  addRoom(rooms, spawnSpots, "archive", "明かりの消えた資料室", "library", -8, -26, 8, -14, 0.9);
  addRoom(rooms, spawnSpots, "court", "雨だまりの中庭", "yard", -9, -10, 9, 30, 0.35);

  // 米英の学校に共通する管理・食事・体育のゾーンを、古い分校向けに縮尺化。
  // 正面の車寄せから受付、左右に食堂と体育室、裏へサービス道がつながる。
  mb.slab(-8, 30, 8, 69, 0.07, 0.07, 0x3e4649);
  mb.slab(-52, 27, 52, 32, 0.07, 0.06, 0x343c40);
  for (const x of [-3.2, 3.2]) mb.box(x, 0.08, 49, 0.16, 0.04, 34, 0xb7aa72);
  openHall(mb, col, -48, 35, -18, 61, "e", 0x48585b, 5.2);
  openHall(mb, col, 18, 35, 48, 61, "w", 0x4d5652, 4.5);
  addRoom(rooms, spawnSpots, "gym", "古い集会体育室", "gym", -47, 36, -19, 60, 0.55);
  addRoom(rooms, spawnSpots, "dining", "配膳台のある食堂", "home", 19, 36, 47, 60, 0.55);
  indoorRects.push({ x1:-48,x2:-18,z1:35,z2:61 }, { x1:18,x2:48,z1:35,z2:61 });
  // 体育室：コート線、舞台、畳まれた観客席。
  mb.slab(-44, 39, -22, 57, .2, .035, 0x6b614e);
  for (const x of [-42,-34,-26]) mb.box(x,.235,48,.08,.025,16,0xd6c987);
  for (const z of [41,55]) mb.box(-33,.235,z,20,.025,.08,0xd6c987);
  mb.box(-45,1.0,48,3.2,2.0,13,0x3d4141);
  for(let i=0;i<5;i++) mb.box(-20.2,.35+i*.28,39+i*3.7,2.2,.18,3.0,0x4d5658);
  // 食堂：配膳カウンター、トレー棚、長机、厨房の作業台。
  mb.box(43.8,1.02,48,1.3,2.05,18,0x59666a);
  mb.box(42.9,1.18,48,1.05,.18,18,0x9ba49b);
  for(let z=40;z<=56;z+=4) mb.box(43.0,1.65,z,.12,.85,2.7,0x26383c);
  for(const x of [23,29,35,40]) for(const z of [41,48,55]) tableSet(mb,x,z,0x6c5b45);
  // 外構：スクールバスの車寄せ、歩道、駐輪場所、裏の搬入路。
  mb.slab(-15, 62, 15, 72, .06, .05, 0x292f33);
  mb.slab(-52, -38, 52, -33, .06, .05, 0x343b3d);
  for(let x=-46;x<=46;x+=8) mb.box(x,.12,-35.5,4.5,.04,.16,0xb5a85e);
  for(let i=0;i<9;i++){
    const x=20+i*2.8;
    mb.wall(x,66,x+1.1,64.5,.1,1.25,.08,0x596166);
    mb.box(x+1.1,.52,64.5,.08,.9,.65,0x596166);
  }

  // 長廊下の錆びたロッカーとベンチ。扉の濃淡を変えて放置感を出す。
  for (const sx of [-1,1]) for (let i=0;i<7;i++) {
    const x=sx*12.2,z=-24+i*6.1;
    mb.box(x,1.05,z,0.72,2.1,2.35,i%3===0?0x2d4852:0x42606a);
    mb.box(x-sx*.38,1.35,z,0.06,.16,1.45,0x182a31);
    if(i%2===0) mb.box(x-sx*1.2,.42,z+1.3,1.5,.18,.42,0x4a4640);
  }

  // 旧トイレ：青いタイル、個室、洗面台。赤い表現は使わず黒い水染みだけ。
  mb.slab(-36,-25,-12,-7,.16,.08,0x49666d);
  for(let i=0;i<4;i++){
    const x=-33+i*5.2;
    mb.box(x,1.25,-22.8,.16,2.5,4.0,0x557176);
    col.add(x-.1,-24.8,x+.1,-20.8,0,2.5,"furn");
    mb.box(x+2.2,.42,-23.2,1.15,.84,1.25,0xc4cbc3);
  }
  for(let i=0;i<4;i++){
    const x=-33+i*5.4;
    mb.box(x,.78,-9.0,2.1,.25,.85,0xb2c4c3);
    mb.box(x,1.45,-8.58,1.5,1.05,.06,0x416773);
  }

  // 二つの教室：机と椅子を中央の通路を空けて並べる。
  const deskRows=[
    {xs:[-33,-29,-19,-15],zs:[0,5,10],frontZ:14.5},
    {xs:[16,21,27,32],zs:[-22,-17,-12],frontZ:-7.5},
  ];
  for(const room of deskRows){
    for(const x of room.xs) for(const z of room.zs){
      mb.box(x,.82,z,2.1,.16,1.25,0x525451);
      mb.box(x,.42,z-.42,.16,.78,.16,0x303b3d);
      mb.box(x,.42,z+.42,.16,.78,.16,0x303b3d);
      mb.box(x,.62,z+1.0,1.35,.18,.22,0x3b4546);
    }
    mb.box((room.xs[0]+room.xs.at(-1))/2,1.65,room.frontZ,15.5,1.35,.12,0x182e2e);
    mb.box((room.xs[0]+room.xs.at(-1))/2,.35,room.frontZ-.8,4.2,.7,1.2,0x474a45);
  }

  // 特別教室：机を輪にして、紙とろうそくを置く。儀式めくが子ども向けの非残酷表現。
  const rx=24,rz=5;
  for(let i=0;i<12;i++){
    const a=i/12*Math.PI*2,x=rx+Math.cos(a)*6,z=rz+Math.sin(a)*6;
    mb.box(x,.72,z,2.1,.18,1.15,0x4a4547,{rotY:-a});
    mb.box(x,1.18,z,.16,.9,.16,0xf2df9a);
    mb.box(x,1.7,z,.22,.28,.22,i%3===0?0xb85b9b:0xf0b35b);
  }
  mb.slab(rx-2.3,rz-1.5,rx+2.3,rz+1.5,.2,.04,0xe0d3ad);
  for(let i=0;i<16;i++){
    const a=i/16*Math.PI*2;
    mb.box(rx+Math.cos(a)*3.3,.18,rz+Math.sin(a)*3.3,.38,.04,.16,0xc9c08a,{rotY:-a});
  }

  // ひび、はがれた床材、黒い雨染み。血ではなく経年劣化として見せる。
  const stains=[[-30,3,3.2,1.1],[-18,-16,2.4,.8],[29,-19,3.6,1.2],[18,10,2.8,.9],[-2,-19,3.3,1.0]];
  for(const [x,z,w,d] of stains) mb.slab(x-w/2,z-d/2,x+w/2,z+d/2,.205,.025,0x20282a);
  for(let i=0;i<18;i++) mb.box(-8+i*.9,.22,-12.2+(i%3)*.35,.75,.05,.12,i%2?0x627277:0x27373b,{rotY:(i%3-1)*.45});
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
  mb.slab(bounds.x1, bounds.z1, bounds.x2, bounds.z2, 0, 0.28, 0x171b25);
  // 添付写真の夜景を参考にした、雨上がりのネオン大通り。
  mb.slab(-17, -30, 17, 72, 0.04, 0.08, 0x242733);
  for (let z = -25; z < 70; z += 10) mb.box(0, 0.09, z, 0.28, 0.06, 5.5, 0xd7c56b);
  // 青・紫・赤の光を映す水たまり。透明材質を増やさず色面だけで軽く表す。
  const puddles = [[-8,61,7,2.3,0x214b72],[7,51,5,1.5,0x692d73],[-5,37,8,1.6,0x244f65],
    [6,22,6,2.1,0x713547],[-8,5,5,1.4,0x2b4c77],[5,-16,7,1.7,0x5f315e]];
  for (const [x,z,w,d,c] of puddles) mb.slab(x-w/2,z-d/2,x+w/2,z+d/2,0.095,0.025,c);

  // 両側に映画街のような古い商店。形は独自、看板は読めない光の板にする。
  for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) {
    const z = 21 + i * 14.5, x = sx * (49 - (i % 2) * 2.0);
    const w = 12, d = 9, h = 5.5 + (i % 3) * 1.6;
    const wall = i % 2 ? 0x34313e : 0x3b3037;
    mb.box(x, h/2, z, w, h, d, wall, { jitter: 0.04 });
    col.add(x-w/2,z-d/2,x+w/2,z+d/2,0,h,"wall");
    // 窓・ひさし・縦看板。明るい色面を細くしてネオンらしく見せる。
    const faceX = x - sx * (w/2 + 0.06);
    for (let k = -1; k <= 1; k++) mb.box(faceX, 2.2, z+k*2.25, 0.12, 2.5, 1.45, 0x315672);
    mb.box(faceX - sx*0.15, 4.5, z, 0.16, 0.24, 6.6, i%3===0?0xf04488:i%3===1?0x21d4d8:0xf0b83c);
    mb.box(faceX - sx*0.28, 3.4, z+3.7, 0.22, 2.7, 1.15, i%2?0x2bd6c8:0xe34986);
    for (let b = -2; b <= 2; b++) mb.box(faceX - sx*0.18, 5.05, z+b*1.25, 0.16, 0.16, 0.65,
      b%2?0x58d5ff:0xffcf55);
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
  // 大観覧車。外輪・内輪・放射状の電飾・ゴンドラをすべて静的メッシュに統合。
  const wx = 29, wz = 30, wy = 12, rr = 12;
  for (let i = 0; i < 36; i++) {
    const a = i / 36 * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    const neon = i%3===0 ? 0xf044b4 : i%3===1 ? 0x38cfff : 0x7c55ff;
    mb.box(wx+ca*rr,wy+sa*rr,wz,0.48,0.48,0.55,neon);
    mb.box(wx+ca*(rr-1.0),wy+sa*(rr-1.0),wz,0.28,0.28,0.5,0x8554bc);
    // 8本のスポークを点灯した小さな節でつなぐ。斜め箱を使わず軽量に見せる。
    if (i%4===0) for (let j=1;j<9;j++) mb.box(wx+ca*j*1.25,wy+sa*j*1.25,wz,0.22,0.22,0.35,
      j%2?0x35bfe8:0xb73fc8);
    if (i%3===0) {
      mb.box(wx+ca*rr,wy+sa*rr-0.72,wz,1.45,1.05,1.2,i%2?0x3c6f87:0x71456f);
      mb.box(wx+ca*rr,wy+sa*rr-0.55,wz+0.63,0.95,0.38,0.08,0xf3c452);
    }
  }
  mb.box(wx, wy, wz, 1.2, 1.2, 1.4, 0xffd75a);
  mb.wall(wx-10,wz,wx,wz,0,wy,0.55,0x5d4968);
  mb.wall(wx+10,wz,wx,wz,0,wy,0.55,0x5d4968);
  mb.box(wx,0.55,wz,22,1.1,7,0x342d3e);
  col.add(wx-11,wz-3.5,wx+11,wz+3.5,0,1.2,"furn");

  // 二層メリーゴーラウンド。屋根、電球、上下の木馬まで形を読めるようにする。
  const cx=-22, cz=25, cr=9;
  mb.box(cx,0.35,cz,19,0.7,19,0x4a2d46,{rotY:Math.PI/4});
  mb.box(cx,4.0,cz,19.5,0.35,19.5,0x7b2f43,{rotY:Math.PI/4});
  mb.box(cx,2.1,cz,0.9,4.2,0.9,0xd6a84d);
  for(let i=0;i<16;i++){
    const a=i/16*Math.PI*2, x=cx+Math.cos(a)*cr, z=cz+Math.sin(a)*cr;
    mb.box(x,3.82,z,0.45,0.35,0.45,i%2?0xffdc65:0xff6f9f);
    if(i%2===0){
      const hx=cx+Math.cos(a)*5.7,hz=cz+Math.sin(a)*5.7, hy=i%4===0?1.35:1.05;
      mb.box(hx,1.8,hz,0.15,3.2,0.15,0xbc8b47);
      mb.box(hx,hy,hz,1.35,0.55,0.48,i%4===0?0xe5e1cd:0xc5a9a5,{rotY:-a});
      mb.box(hx+Math.sin(a)*0.52,hy+0.15,hz-Math.cos(a)*0.52,0.48,0.72,0.42,0xd9c6ad,{rotY:-a});
      for(const q of [-0.42,0.42]) mb.box(hx+Math.cos(a)*q,hy-0.48,hz+Math.sin(a)*q,0.14,0.72,0.14,0x8e765e);
    }
  }
  col.add(cx-cr,cz-cr,cx+cr,cz+cr,0,0.9,"furn");
  // 回転木馬の待合・整備室：柵、切符窓口、工具棚まで歩いて見られる。
  for(let i=0;i<10;i++) mb.box(-35+i*1.6,.62,10.5+(i%2)*1.4,1.2,1.05,.16,0x6b5262);
  mb.box(-43,1.25,14,4.8,2.5,2.6,0x413444);
  mb.box(-41.7,1.45,12.65,1.25,.72,.08,0xe8b75a);
  for(let q=0;q<5;q++) mb.box(-45+q*.9,1.05,15.25,.18,1.8,.65,q%2?0x6f4d49:0x365c62);

  // 観覧車側の飲食広場と、内部を歩けるバンパーカー館。
  for(const x of [17,23,29,35,41]) for(const z of [47,53]) tableSet(mb,x,z,0x514b56);
  openHall(mb,col,20,-25,49,-8,"s",0x3f3d50,4.8);
  addRoom(rooms,spawnSpots,"bumper","火花の消えた電気自動車場","gym",21,-24,48,-9,.62);
  indoorRects.push({x1:20,x2:49,z1:-25,z2:-8});
  for(let x=24;x<=45;x+=7) for(let z=-21;z<=-13;z+=8){
    mb.box(x,.48,z,3.2,.65,2.0,(x+z)%2?0x4e6690:0x8d435f);
    mb.box(x,.92,z,1.0,.55,1.0,0x343641);
  }
  // 景品ゲーム館。筐体、景品棚、交換カウンターが残る。
  openHall(mb,col,-49,-25,-20,-8,"s",0x493846,4.8);
  addRoom(rooms,spawnSpots,"arcade","景品が残るゲーム館","art",-48,-24,-21,-9,.62);
  indoorRects.push({x1:-49,x2:-20,z1:-25,z2:-8});
  for(let x=-45;x<=-24;x+=5) for(const z of [-21,-16,-11]){
    mb.box(x,1.05,z,1.35,2.1,.9,(x+z)%2?0x344f72:0x673e69);
    mb.box(x,1.36,z+.48,.8,.5,.08,0x51c9d5);
  }
  mb.box(-46,1.0,-9.2,8,2,.7,0x5c4759);
  // 園内を一周する遊歩道と、四つの入口へ分岐する案内帯。
  mb.slab(-53,-29,53,-25,.055,.045,0x303541);
  mb.slab(-53,66,53,70,.055,.045,0x303541);
  mb.slab(-54,-29,-50,70,.055,.045,0x303541);
  mb.slab(50,-29,54,70,.055,.045,0x303541);
  // 大通りの端で止まったパレード車。電飾の台、巨大な仮面、風船を抽象化。
  for (const z of [48, 61]) {
    const x = z===48 ? 7 : -7, rot = z===48 ? 0.08 : -0.08;
    mb.box(x,0.75,z,9.5,1.35,4.2,0x3b3762,{rotY:rot});
    for(let k=-4;k<=4;k++) mb.box(x+k,1.4,z+2.0,0.42,0.28,0.24,k%3===0?0xffd55c:k%3===1?0x45d9e8:0xf052a2);
    mb.box(x,2.55,z,4.2,2.5,2.2,z===48?0x5d66b6:0xb04d78,{rotY:rot});
    mb.box(x,4.15,z,1.2,1.1,1.2,0xe3b54d);
    for(const sx of [-1,1]) mb.box(x+sx*1.1,3.1,z+1.15,0.5,0.5,0.2,0x45d8e2);
    col.add(x-4.8,z-2.2,x+4.8,z+2.2,0,2.1,"furn");
  }

  // 山側の朽ちたジェットコースター。起伏する軌道を短い節で表現する。
  for (const sx of [-1,1]) for(let i=0;i<28;i++){
    const t=i/27, x=-50+t*100, z=-37+Math.sin(t*Math.PI*3)*5+sx*0.55;
    const y=2.2+Math.sin(t*Math.PI)*9+Math.sin(t*Math.PI*4)*1.5;
    mb.box(x,y,z,3.8,0.22,0.22,i%5===0?0xb84b73:0x52455f);
    if(i%4===0) mb.box(x,y/2,z,0.25,y,0.25,0x353440);
  }
  // 入園アーチと切れかけた電飾。
  for(const sx of [-1,1]) mb.box(sx*7,4.2,68,1.0,8.4,1.0,0x463952);
  mb.box(0,8.0,68,15,1.1,1.0,0x52385d);
  for(let i=-6;i<=6;i++) mb.box(i*1.05,8.05,67.4,0.32,0.32,0.18,i%4===0?0x32263b:i%2?0xff4ca5:0x47d5ff);

  // 古い街灯と、幹だけ残った並木。ライト数は増やさず静的な光色で描く。
  for(const sx of [-1,1]) for(let z=-24;z<=66;z+=10){
    const x=sx*20;
    mb.box(x,2.0,z,0.18,4,0.18,0x41414b);
    mb.box(x,4.05,z,0.68,0.42,0.68,z%20?0xffce68:0x55d8ff);
    mb.box(x+sx*3.0,2.2,z+2,0.45,4.4,0.45,0x40362f);
    for(let q=0;q<4;q++) mb.box(x+sx*(3+q*.55),4.1+q*.2,z+2+(q%2?.5:-.5),1.4,.16,.16,0x315242);
  }
  addRoom(rooms, spawnSpots, "ghosthouse", "泣くお化け屋敷", "class", gh.x1, gh.z1, gh.x2, gh.z2, 0.9);
  addRoom(rooms, spawnSpots, "mirror", "くもった鏡の迷路", "art", mz.x1, mz.z1, mz.x2, mz.z2, 0.82);
  addRoom(rooms, spawnSpots, "wheel", "月色の大観覧車", "music", 18, 20, 40, 40, 0.72);
  addRoom(rooms, spawnSpots, "carousel", "二階建て回転木馬", "home", -32, 15, -12, 35, 0.55);
  addRoom(rooms, spawnSpots, "plaza", "雨のネオン大通り", "yard", -16, 38, 16, 67, 0.38);
  addRoom(rooms, spawnSpots, "coaster", "きしむ廃コースター", "yard", -44, -43, 44, -30, 0.68);
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
