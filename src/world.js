import * as THREE from "../lib/three.module.js";
import { MeshBuilder, wallWithHoles } from "./meshbuild.js";
import { Colliders, NavGraph, rand } from "./util.js";

export const FLOOR_H = 3.6;
export const WALL_T = 0.22;

// --- 配色（廃墟らしい退色パレット） --------------------------
const C = {
  wall: 0x8a8375, wallDark: 0x6e685c, ceil: 0x7d7869,
  floorHall: 0x5c6352, floorRoom: 0x7a6952, floorTile: 0x77766e,
  board: 0x2e3d31, desk: 0x9a7c50, metal: 0x555c62, locker: 0x76858d,
  glass: 0x1b2733, ground: 0x54503f, grass: 0x36462f, concrete: 0x6a6a63,
  fence: 0x4e545a, wood: 0x6b5334, shelf: 0x7d6242, stone: 0x6f6f68, sakura: 0x53384a,
};

const ROOMS = [
  { id: "w_stair", name: "西階段",   x1: -42, x2: -35, kind: "stair" },
  { id: "c11",     name: "1年1組",  x1: -35, x2: -26, kind: "class" },
  { id: "c12",     name: "1年2組",  x1: -26, x2: -17, kind: "class" },
  { id: "toilet",  name: "トイレ",   x1: -17, x2: -11, kind: "toilet" },
  { id: "staff",   name: "職員室",   x1: -11, x2: -1,  kind: "staff" },
  { id: "science", name: "理科室",   x1: -1,  x2: 9,   kind: "science" },
  { id: "music",   name: "音楽室",   x1: 9,   x2: 19,  kind: "music" },
  { id: "library", name: "図書室",   x1: 19,  x2: 28,  kind: "library" },
  { id: "home",    name: "家庭科室", x1: 28,  x2: 35,  kind: "home" },
  { id: "e_stair", name: "東階段",   x1: 35,  x2: 42,  kind: "stair" },
];

const RZ1 = -14, RZ2 = -4;
const HZ1 = -4, HZ2 = 0;
const BX1 = -42, BX2 = 42;
const EH = { x1: -6, x2: 6, z1: 0, z2: 9 };
const YARD = { x1: -42, x2: 42, z1: 0, z2: 34 };
export const EXIT_POINT = { x: 0, z: 41 };
export const HUMAN_ENTRY = { x: 0, z: 37 };

export function buildWorld(scene, opts = {}) {
  const col = new Colliders();
  const nav = new NavGraph();
  const mb = new MeshBuilder();
  const rooms = [];
  const spawnSpots = [];
  const props = [];
  const lightSpots = [];

  buildYard(mb, col, spawnSpots, props, opts.dust || 700);

  // --- 床と天井 ---------------------------------------------
  tiled(mb, BX1, RZ1, BX2, HZ2, 0, 0.3, C.floorHall, 6);
  for (const r of ROOMS) {
    const fc = r.kind === "toilet" || r.kind === "science" ? C.floorTile : C.floorRoom;
    tiled(mb, r.x1, RZ1, r.x2, RZ2, 0.02, 0.3, fc, 5);
  }
  tiled(mb, EH.x1, EH.z1, EH.x2, EH.z2, 0.02, 0.3, C.floorTile, 4);
  tiled(mb, BX1, RZ1, BX2, HZ2, FLOOR_H, 0.28, C.ceil, 6);
  tiled(mb, EH.x1, EH.z1, EH.x2, EH.z2, FLOOR_H, 0.28, C.ceil, 4);

  // --- 外壁 -------------------------------------------------
  wallWithHoles(mb, col, {
    axis: "x", fixed: RZ1, from: BX1, to: BX2, y1: 0, y2: FLOOR_H, thick: WALL_T,
    color: C.wall, holes: windowRow(BX1 + 2, BX2 - 2, 3.0, 4.6, 0.95, 2.55),
  });
  wallWithHoles(mb, col, { axis: "z", fixed: BX1, from: RZ1, to: HZ2, y1: 0, y2: FLOOR_H, thick: WALL_T, color: C.wall });
  wallWithHoles(mb, col, { axis: "z", fixed: BX2, from: RZ1, to: HZ2, y1: 0, y2: FLOOR_H, thick: WALL_T, color: C.wall });

  const southHoles = windowRow(BX1 + 2, BX2 - 2, 3.2, 4.6, 0.95, 2.6).filter((h) => h.b < -7.5 || h.a > 7.5);
  southHoles.push({ a: -3, b: 3, y1: 0, y2: 2.5 });
  wallWithHoles(mb, col, {
    axis: "x", fixed: HZ2, from: BX1, to: BX2, y1: 0, y2: FLOOR_H, thick: WALL_T, color: C.wall, holes: southHoles,
  });

  // --- 廊下と教室の間仕切り ---------------------------------
  const innerHoles = [];
  for (const r of ROOMS) {
    const cx = (r.x1 + r.x2) / 2;
    innerHoles.push({ a: cx - 0.9, b: cx + 0.9, y1: 0, y2: 2.3 });
    if (["class", "staff", "science", "music", "library"].includes(r.kind)) {
      innerHoles.push({ a: r.x1 + 1.2, b: cx - 1.6, y1: 1.0, y2: 2.4 });
      innerHoles.push({ a: cx + 1.6, b: r.x2 - 1.2, y1: 1.0, y2: 2.4 });
    }
  }
  wallWithHoles(mb, col, {
    axis: "x", fixed: RZ2, from: BX1, to: BX2, y1: 0, y2: FLOOR_H, thick: WALL_T, color: C.wallDark, holes: innerHoles,
  });
  for (let i = 1; i < ROOMS.length; i++) {
    wallWithHoles(mb, col, { axis: "z", fixed: ROOMS[i].x1, from: RZ1, to: RZ2, y1: 0, y2: FLOOR_H, thick: WALL_T, color: C.wallDark });
  }

  // --- 昇降口 -----------------------------------------------
  wallWithHoles(mb, col, { axis: "z", fixed: EH.x1, from: EH.z1, to: EH.z2, y1: 0, y2: FLOOR_H, thick: WALL_T, color: C.wall });
  wallWithHoles(mb, col, { axis: "z", fixed: EH.x2, from: EH.z1, to: EH.z2, y1: 0, y2: FLOOR_H, thick: WALL_T, color: C.wall });
  wallWithHoles(mb, col, {
    axis: "x", fixed: EH.z2, from: EH.x1, to: EH.x2, y1: 0, y2: FLOOR_H, thick: WALL_T, color: C.wall,
    holes: [{ a: -2.6, b: 2.6, y1: 0, y2: 2.6 }],
  });
  for (const sx of [-4.6, 4.6]) {
    for (let z = 1.4; z < 7.6; z += 2.1) {
      mb.box(sx, 1.0, z, 1.5, 2.0, 1.9, C.locker, { jitter: 0.08 });
      col.add(sx - 0.75, z - 0.95, sx + 0.75, z + 0.95, 0, 2.0, "wall");
    }
  }
  mb.box(0, 2.78, EH.z2 - 0.25, 4.2, 0.7, 0.3, C.wood, { jitter: 0.03 });

  buildUpperFloors(mb, col);

  // --- 各部屋の中身 -----------------------------------------
  for (const r of ROOMS) {
    const cx = (r.x1 + r.x2) / 2, cz = (RZ1 + RZ2) / 2;
    rooms.push({ ...r, cx, cz, z1: RZ1, z2: RZ2, doorX: cx, doorZ: RZ2 });
    furnish(mb, col, props, spawnSpots, r, cx, cz);
    for (let k = 0; k < 3; k++) spawnSpots.push({ x: rand(r.x1 + 1.4, r.x2 - 1.4), z: rand(RZ1 + 1.4, RZ2 - 1.4), room: r.name });
  }
  rooms.push({ id: "hall", name: "廊下", cx: 0, cz: -2, x1: BX1, x2: BX2, z1: HZ1, z2: HZ2, kind: "hall" });
  rooms.push({ id: "entrance", name: "昇降口", cx: 0, cz: 4.5, x1: EH.x1, x2: EH.x2, z1: EH.z1, z2: EH.z2, kind: "entrance" });
  rooms.push({ id: "yard", name: "中庭", cx: 0, cz: 18, x1: YARD.x1, x2: YARD.x2, z1: 2, z2: YARD.z2, kind: "yard" });

  for (let x = BX1 + 5; x < BX2 - 4; x += 9) {
    mb.box(x, 0.55, HZ1 + 0.45, 0.32, 1.1, 0.32, 0xa03a2a, { jitter: 0.1 });
    spawnSpots.push({ x: x + rand(-3, 3), z: rand(HZ1 + 0.9, HZ2 - 0.9), room: "廊下" });
  }
  for (let x = BX1 + 3; x < BX2 - 3; x += 12) lightSpots.push({ x, y: FLOOR_H - 0.45, z: -2 });
  for (let x = -14; x <= 14; x += 7) lightSpots.push({ x, y: FLOOR_H - 0.5, z: 4.5 });

  // --- ナビゲーション ---------------------------------------
  for (let x = BX1 + 3; x <= BX2 - 3; x += 5) nav.addNode(x, -2, 0, "廊下");
  for (const r of rooms) {
    if (r.kind === "hall" || r.kind === "yard") continue;
    if (r.doorX !== undefined) {
      nav.addNode(r.doorX, RZ2 - 1.4, 0, r.name);     // ドアの内側
      nav.addNode(r.doorX, (HZ1 + HZ2) / 2, 0, "廊下"); // ドアの正面（廊下側）
    }
    if (r.kind !== "stair") nav.addNode(r.cx, r.cz, 0, r.name);
  }
  nav.addNode(0, 1.6, 0, "昇降口"); nav.addNode(0, 5, 0, "昇降口"); nav.addNode(0, 8.4, 0, "昇降口");
  for (let x = -36; x <= 36; x += 8) for (let z = 12; z <= 32; z += 6.6) nav.addNode(x, z, 0, "中庭");
  for (let x = -36; x <= 36; x += 7) nav.addNode(x, 10.5, 0, "中庭");
  for (let x = -36; x <= 36; x += 9) nav.addNode(x, 37.2, 0, "校門前");
  for (let x = -30; x <= 30; x += 10) nav.addNode(x, 41.5, 0, "校門前");
  nav.addNode(EXIT_POINT.x, 33, 0, "校門");
  nav.addNode(EXIT_POINT.x, 35, 0, "校門");
  nav.addNode(EXIT_POINT.x, 37.5, 0, "校門");
  nav.addNode(EXIT_POINT.x, EXIT_POINT.z, 0, "校門");

  col.build();
  nav.autoLink(col, 12);

  const mat = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 2, specular: 0x0b0d12, flatShading: false });
  const staticMesh = mb.finish(mat);
  staticMesh.name = "school";
  scene.add(staticMesh);
  for (const p of props) scene.add(p.mesh);

  return {
    colliders: col, nav, rooms, spawnSpots, props, lightSpots,
    exit: EXIT_POINT, entry: HUMAN_ENTRY, staticMesh, triangles: mb.triangles,
    bounds: { x1: -46, x2: 46, z1: -18, z2: 44 },
    roomAt(x, z) {
      if (z > 1.6) return "中庭";
      if (z >= -0.2 && x > EH.x1 && x < EH.x2) return "昇降口";
      if (z > HZ1) return "廊下";
      for (const r of ROOMS) if (x >= r.x1 && x <= r.x2) return r.name;
      return "廊下";
    },
    isIndoors(x, z) { return z < 0.2 && z > RZ1 - 0.2 && x > BX1 && x < BX2; },
    update(dt, t) { for (const p of props) if (p.update) p.update(dt, t); },
  };
}

function windowRow(from, to, w, pitch, y1, y2) {
  const holes = [];
  for (let x = from; x + w < to; x += pitch) holes.push({ a: x, b: x + w, y1, y2 });
  return holes;
}

// ============================================================
//  部屋ごとの家具
// ============================================================
function furnish(mb, col, props, spawnSpots, r, cx, cz) {
  const W = r.x2 - r.x1;

  if (r.kind === "class" || r.kind === "staff") {
    mb.box(cx, 1.75, RZ1 + 0.3, Math.min(W - 2.2, 7), 1.3, 0.14, C.board, { jitter: 0.04 });
    mb.box(cx, 1.05, RZ1 + 0.36, Math.min(W - 2.2, 7), 0.1, 0.22, C.wood, { jitter: 0.05 });
    mb.box(cx, 0.12, RZ1 + 1.6, 3.0, 0.22, 1.4, C.wood, { jitter: 0.05 });
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 4; j++) {
        const dx = cx + (i - 1) * 2.4 + rand(-0.18, 0.18);
        const dz = RZ1 + 3.8 + j * 1.85 + rand(-0.15, 0.15);
        if (dz > RZ2 - 1.1) continue;
        const rot = rand(-0.35, 0.35);
        desk(mb, col, dx, dz, rot);
        if (Math.random() < 0.5) chair(mb, col, dx, dz + 0.95, rot + rand(-0.8, 0.8));
      }
    for (let x = r.x1 + 1.0; x < r.x2 - 1.2; x += 1.0) {
      if (Math.abs(x - cx) < 1.3) continue;
      mb.box(x, 0.9, RZ2 - 0.55, 0.9, 1.8, 0.6, C.locker, { jitter: 0.12 });
      col.add(x - 0.45, RZ2 - 0.9, x + 0.45, RZ2 - 0.25, 0, 1.8, "wall");
    }
  }

  if (r.kind === "science") {
    for (let i = 0; i < 2; i++)
      for (let j = 0; j < 3; j++) {
        const dx = cx + (i - 0.5) * 4.0, dz = RZ1 + 3.4 + j * 2.5;
        mb.box(dx, 0.78, dz, 3.0, 0.12, 1.2, 0x3a4a44, { jitter: 0.05 });
        for (const s of [-1.3, 1.3]) for (const s2 of [-0.45, 0.45]) mb.box(dx + s, 0.36, dz + s2, 0.1, 0.72, 0.1, C.metal);
        col.add(dx - 1.5, dz - 0.6, dx + 1.5, dz + 0.6, 0, 0.85, "furn");
      }
    mb.box(cx, 1.75, RZ1 + 0.3, 6, 1.3, 0.14, C.board, { jitter: 0.04 });
    props.push(makeJintai(r.x2 - 1.6, RZ1 + 1.7));
    shelfRow(mb, col, r.x1 + 0.9, RZ1 + 2, r.x1 + 0.9, RZ2 - 2, 1.9);
    spawnSpots.push({ x: cx, z: RZ1 + 2.2, room: r.name }, { x: cx + 3, z: RZ2 - 2, room: r.name });
  }

  if (r.kind === "music") {
    props.push(makePiano(cx - 1.5, RZ1 + 3.4));
    col.add(cx - 2.4, RZ1 + 2.2, cx - 0.6, RZ1 + 4.6, 0, 1.2, "furn");
    for (let a = -1.1; a <= 1.1; a += 0.28) {
      const cxx = cx + Math.sin(a) * 4.6, czz = RZ1 + 3.6 + Math.cos(a) * 4.6;
      if (czz > RZ2 - 1) continue;
      chair(mb, col, cxx, czz, a + Math.PI);
    }
    mb.box(r.x2 - 1.2, 1.6, RZ1 + 2.4, 0.5, 3.2, 2.6, C.shelf, { jitter: 0.06 });
    col.add(r.x2 - 1.5, RZ1 + 1.1, r.x2 - 0.9, RZ1 + 3.7, 0, 3.2, "wall");
  }

  if (r.kind === "library") {
    for (let x = r.x1 + 1.8; x < r.x2 - 1.2; x += 2.3) {
      mb.box(x, 1.05, cz + 0.4, 0.75, 2.1, 5.0, C.shelf, { jitter: 0.1 });
      col.add(x - 0.4, cz - 2.1, x + 0.4, cz + 2.9, 0, 2.1, "wall");
      spawnSpots.push({ x, z: cz - 2.9, room: r.name });
    }
  }

  if (r.kind === "home") {
    for (let i = 0; i < 2; i++) {
      const dz = RZ1 + 3 + i * 3.4;
      mb.box(cx, 0.85, dz, 4.4, 0.14, 1.6, 0xa9a49a, { jitter: 0.05 });
      mb.box(cx, 0.42, dz, 4.2, 0.72, 1.4, C.wood, { jitter: 0.06 });
      col.add(cx - 2.2, dz - 0.8, cx + 2.2, dz + 0.8, 0, 0.92, "furn");
    }
    spawnSpots.push({ x: cx - 2, z: RZ2 - 1.5, room: r.name });
  }

  if (r.kind === "toilet") {
    for (let i = 0; i <= 3; i++) {
      const x = r.x1 + 1.2 + i * 1.7;
      mb.box(x - 0.85, 1.1, RZ1 + 2.2, 0.1, 2.2, 2.4, 0x8d9a8f, { jitter: 0.05 });
      col.add(x - 0.9, RZ1 + 1.0, x - 0.8, RZ1 + 3.4, 0, 2.2, "wall");
      if (i < 3) mb.box(x, 0.3, RZ1 + 1.6, 0.6, 0.6, 0.9, 0xd8d6cc, { jitter: 0.04 });
    }
    mb.box(cx + 1.2, 0.82, RZ2 - 1.0, 3.0, 0.16, 0.6, 0xc9c6ba, { jitter: 0.04 });
    mb.box(cx + 1.2, 1.9, RZ2 - 0.78, 3.0, 0.9, 0.08, 0x2a3138, { jitter: 0.03 });
    col.add(cx - 0.3, RZ2 - 1.3, cx + 2.7, RZ2 - 0.7, 0, 0.9, "furn");
    spawnSpots.push({ x: cx + 1, z: RZ2 - 1.7, room: r.name });
  }

  if (r.kind === "stair") {
    const steps = 16, x0 = r.x1 + 0.8, x1 = r.x2 - 0.8;
    for (let i = 0; i < steps; i++) {
      const y = (i + 1) * (FLOOR_H / steps);
      const z = RZ1 + 1.0 + i * 0.42;
      mb.box((x0 + x1) / 2, y - 0.09, z, x1 - x0, 0.18, 0.42, C.concrete, { jitter: 0.05 });
      col.add(x0, z - 0.21, x1, z + 0.21, 0, y, "stair");
    }
    const bz = RZ1 + 1.0 + steps * 0.42 + 0.4;
    props.push(makeBarrier((x0 + x1) / 2, FLOOR_H + 1.4, bz, x1 - x0, 3.0));
    col.add(x0, bz - 0.2, x1, bz + 0.2, 0, 8, "barrier");
    spawnSpots.push({ x: (x0 + x1) / 2, z: RZ2 - 1.2, room: r.name });
  }
}

function desk(mb, col, x, z, rot) {
  mb.box(x, 0.72, z, 1.15, 0.08, 0.62, C.desk, { jitter: 0.1, rotY: rot });
  for (const sx of [-0.48, 0.48]) for (const sz of [-0.24, 0.24]) {
    const px = x + sx * Math.cos(rot) - sz * Math.sin(rot);
    const pz = z + sx * Math.sin(rot) + sz * Math.cos(rot);
    mb.box(px, 0.34, pz, 0.06, 0.68, 0.06, C.metal);
  }
  col.add(x - 0.6, z - 0.36, x + 0.6, z + 0.36, 0, 0.78, "furn");
}

function chair(mb, col, x, z, rot) {
  mb.box(x, 0.44, z, 0.44, 0.06, 0.44, C.desk, { jitter: 0.1, rotY: rot });
  mb.box(x - Math.sin(rot) * 0.2, 0.72, z - Math.cos(rot) * 0.2, 0.44, 0.5, 0.06, C.desk, { jitter: 0.1, rotY: rot });
  for (const sx of [-0.17, 0.17]) for (const sz of [-0.17, 0.17]) mb.box(x + sx, 0.21, z + sz, 0.05, 0.42, 0.05, C.metal);
  col.add(x - 0.26, z - 0.26, x + 0.26, z + 0.26, 0, 0.5, "furn");
}

function shelfRow(mb, col, x1, z1, x2, z2, h) {
  const w = 0.5;
  mb.box((x1 + x2) / 2, h / 2, (z1 + z2) / 2, Math.max(w, Math.abs(x2 - x1)), h, Math.max(w, Math.abs(z2 - z1)), C.shelf, { jitter: 0.08 });
  col.add(Math.min(x1, x2) - w / 2, Math.min(z1, z2) - w / 2, Math.max(x1, x2) + w / 2, Math.max(z1, z2) + w / 2, 0, h, "wall");
}

// ============================================================
//  中庭・地面
// ============================================================
function buildYard(mb, col, spawnSpots, props, dustCount) {
  // 地面はタイル状に分割（点光源のムラを防ぐ）
  for (let x = -84; x < 84; x += 8)
    for (let z = -44; z < 64; z += 8)
      mb.slab(x, z, x + 8, z + 8, -0.02, 0.5, C.ground, { jitter: 0.3 });
  for (let x = YARD.x1; x < YARD.x2; x += 6)
    for (let z = 1.6; z < YARD.z2; z += 6)
      mb.slab(x, z, Math.min(x + 6, YARD.x2), Math.min(z + 6, YARD.z2), 0.0, 0.3, 0x5c5340, { jitter: 0.34 });
  for (let x = BX1; x < BX2; x += 6)
    mb.slab(x, 0, Math.min(x + 6, BX2), 2.4, 0.04, 0.2, C.concrete, { jitter: 0.22 });

  fence(mb, col, YARD.x1, 0.5, YARD.x1, YARD.z2);
  fence(mb, col, YARD.x2, 0.5, YARD.x2, YARD.z2);
  fence(mb, col, YARD.x1, YARD.z2, -5.0, YARD.z2);
  fence(mb, col, 5.0, YARD.z2, YARD.x2, YARD.z2);
  for (const gx of [-5.0, 5.0]) {
    mb.box(gx, 1.6, YARD.z2, 0.6, 3.2, 0.6, C.stone, { jitter: 0.05 });
    col.add(gx - 0.3, YARD.z2 - 0.3, gx + 0.3, YARD.z2 + 0.3, 0, 3.2, "wall");
  }

  for (const f of [[-30, 6, 10], [-16, 6, 10], [16, 6, 10], [30, 6, 10]]) {
    const [fx, fz, fw] = f;
    mb.box(fx, 0.22, fz, fw, 0.44, 2.0, C.stone, { jitter: 0.08 });
    mb.box(fx, 0.5, fz, fw - 0.5, 0.2, 1.6, C.grass, { jitter: 0.18 });
    col.add(fx - fw / 2, fz - 1, fx + fw / 2, fz + 1, 0, 0.5, "furn");
    spawnSpots.push({ x: fx, z: fz + 1.7, room: "中庭" });
  }

  // 二宮金次郎像
  mb.box(-20, 0.35, 13, 1.6, 0.7, 1.6, C.stone, { jitter: 0.05 });
  mb.box(-20, 1.35, 13, 0.55, 1.3, 0.4, 0x6a6258, { jitter: 0.06 });
  mb.box(-20, 2.2, 13, 0.4, 0.4, 0.4, 0x6a6258, { jitter: 0.06 });
  mb.box(-20.42, 1.55, 13.25, 0.3, 0.4, 0.06, 0x8b7a5e);
  col.add(-20.8, 12.2, -19.2, 13.8, 0, 2.5, "wall");
  spawnSpots.push({ x: -20, z: 15.2, room: "中庭" });

  // ジャングルジム
  for (let i = 0; i <= 3; i++) for (let j = 0; j <= 3; j++)
    mb.box(20 + i * 1.1, 1.65, 16 + j * 1.1, 0.08, 3.3, 0.08, 0x7a4f3a, { jitter: 0.1 });
  for (let k = 1; k <= 3; k++) for (let i = 0; i <= 3; i++) {
    mb.box(21.65, 1.1 * k, 16 + i * 1.1, 3.4, 0.08, 0.08, 0x7a4f3a, { jitter: 0.1 });
    mb.box(20 + i * 1.1, 1.1 * k, 17.65, 0.08, 0.08, 3.4, 0x7a4f3a, { jitter: 0.1 });
  }
  col.add(19.6, 15.6, 23.7, 19.7, 0, 3.3, "soft");
  spawnSpots.push({ x: 21.6, z: 20.6, room: "中庭" });

  for (const b of [[30, 1.1], [32.4, 1.5]]) {
    const [bx, bh] = b;
    mb.box(bx, bh / 2, 10, 0.09, bh, 0.09, C.metal);
    mb.box(bx, bh / 2, 13, 0.09, bh, 0.09, C.metal);
    mb.box(bx, bh, 11.5, 0.07, 0.07, 3.1, C.metal);
  }

  mb.box(0, 0.35, 24, 4.4, 0.7, 2.6, C.concrete, { jitter: 0.05 });
  col.add(-2.2, 22.7, 2.2, 25.3, 0, 0.7, "furn");
  spawnSpots.push({ x: 0, z: 26.6, room: "中庭" });

  mb.box(-30, 0.4, 20, 2.6, 0.8, 1.0, 0x8a8f88, { jitter: 0.05 });
  col.add(-31.3, 19.5, -28.7, 20.5, 0, 0.8, "furn");
  for (let i = 0; i < 3; i++) mb.box(-31 + i, 0.95, 20, 0.07, 0.3, 0.07, C.metal);
  spawnSpots.push({ x: -30, z: 22, room: "中庭" });

  for (const t of [[-34, 27, 1.2], [-8, 29, 1.0], [12, 28, 1.15], [34, 24, 1.05], [-36, 14, 0.9]]) {
    tree(mb, col, t[0], t[1], t[2]);
    spawnSpots.push({ x: t[0] + 2.2, z: t[1] + 1.6, room: "中庭" });
  }

  for (const b of [[-12, 20], [8, 18], [26, 27]]) {
    const [bx, bz] = b;
    mb.box(bx, 0.42, bz, 2.0, 0.1, 0.5, C.wood, { jitter: 0.08 });
    mb.box(bx, 0.2, bz - 0.2, 0.1, 0.44, 0.1, C.metal);
    mb.box(bx, 0.2, bz + 0.2, 0.1, 0.44, 0.1, C.metal);
    col.add(bx - 1, bz - 0.3, bx + 1, bz + 0.3, 0, 0.5, "furn");
  }

  for (let i = 0; i < 26; i++) spawnSpots.push({ x: rand(-38, 38), z: rand(4, 32), room: "中庭" });
  scatterYardDetail(mb);
  props.push(makeDust(dustCount));
}

function fence(mb, col, x1, z1, x2, z2) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const n = Math.max(1, Math.ceil(len / 2.4));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    mb.box(x1 + (x2 - x1) * t, 1.1, z1 + (z2 - z1) * t, 0.12, 2.2, 0.12, C.fence, { jitter: 0.1 });
  }
  mb.wall(x1, z1, x2, z2, 0.0, 2.1, 0.06, 0x4a5057, { jitter: 0.06 });
  const t = 0.35;
  col.add(Math.min(x1, x2) - t, Math.min(z1, z2) - t, Math.max(x1, x2) + t, Math.max(z1, z2) + t, 0, 2.2, "wall");
}

function tree(mb, col, x, z, s) {
  mb.box(x, 1.5 * s, z, 0.5 * s, 3.0 * s, 0.5 * s, 0x4a3524, { jitter: 0.12 });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2, r = rand(0.9, 2.0) * s;
    mb.box(x + Math.cos(a) * r, rand(3.2, 4.6) * s, z + Math.sin(a) * r,
      rand(2.0, 3.2) * s, rand(1.2, 1.9) * s, rand(2.0, 3.2) * s, C.sakura, { jitter: 0.22 });
  }
  col.add(x - 0.35 * s, z - 0.35 * s, x + 0.35 * s, z + 0.35 * s, 0, 3 * s, "wall");
}

// ============================================================
//  動くオブジェクト
// ============================================================
function makePiano(x, z) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.0, 2.4), new THREE.MeshLambertMaterial({ color: 0x1a1a20 }));
  body.position.y = 0.6; g.add(body);
  const keys = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.09, 0.42), new THREE.MeshLambertMaterial({ color: 0xe8e6dc }));
  keys.position.set(0, 1.02, 1.05); g.add(keys);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.08, 1.7), new THREE.MeshLambertMaterial({ color: 0x24242c }));
  lid.position.set(0, 1.12, -0.25); g.add(lid);
  g.position.set(x, 0, z);
  return {
    mesh: g, kind: "piano", x, z, excited: 0,
    update(dt, t) {
      this.excited = Math.max(0, this.excited - dt);
      const e = this.excited > 0;
      keys.position.y = 1.02 + (e ? Math.sin(t * 40) * 0.03 : 0);
      lid.rotation.x = e ? Math.sin(t * 9) * 0.08 - 0.06 : 0;
    },
  };
}

function makeJintai(x, z) {
  const g = new THREE.Group();
  const m = new THREE.MeshLambertMaterial({ color: 0xc98d7a });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.7, 0.24), m); torso.position.y = 1.2; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), m); head.position.y = 1.72; g.add(head);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.62, 0.1), m); arm.position.set(0.3, 1.25, 0); g.add(arm);
  const arm2 = arm.clone(); arm2.position.x = -0.3; g.add(arm2);
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.8, 0.13), m); leg.position.set(0.12, 0.42, 0); g.add(leg);
  const leg2 = leg.clone(); leg2.position.x = -0.12; g.add(leg2);
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.06, 10), new THREE.MeshLambertMaterial({ color: 0x4a4a50 }));
  g.add(stand);
  g.position.set(x, 0, z);
  return {
    mesh: g, kind: "jintai", x, z, excited: 0,
    update(dt, t) {
      this.excited = Math.max(0, this.excited - dt);
      const e = this.excited > 0;
      arm.rotation.x = e ? -1.6 + Math.sin(t * 8) * 0.5 : -0.05;
      g.rotation.y = e ? Math.sin(t * 3) * 0.4 : Math.sin(t * 0.4) * 0.03;
      head.rotation.z = e ? Math.sin(t * 11) * 0.3 : 0;
    },
  };
}

function makeBarrier(x, y, z, w, h) {
  const mat = new THREE.MeshBasicMaterial({ color: 0x6be0ff, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(x, y, z);
  return {
    mesh: m, kind: "barrier", x, z,
    update(dt, t) { mat.opacity = 0.10 + Math.sin(t * 2.2) * 0.05 + Math.sin(t * 7.3) * 0.02; },
  };
}

function makeDust(N) {
  N = N || 700;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = rand(-45, 45);
    pos[i * 3 + 1] = rand(0.2, 6);
    pos[i * 3 + 2] = rand(-16, 38);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: 0xbfd0e0, size: 0.055, transparent: true, opacity: 0.4, depthWrite: false });
  const pts = new THREE.Points(g, m);
  return {
    mesh: pts, kind: "dust", x: 0, z: 0,
    update(dt, t) {
      const a = g.attributes.position.array;
      for (let i = 1; i < a.length; i += 3) { a[i] += dt * 0.14; if (a[i] > 6) a[i] = 0.2; }
      g.attributes.position.needsUpdate = true;
      pts.rotation.y = t * 0.006;
    },
  };
}

// 大きな床・天井をタイル状に分割する（点光源のムラ防止）
function tiled(mb, x1, z1, x2, z2, y, thick, color, step) {
  for (let x = x1; x < x2 - 1e-6; x += step)
    for (let z = z1; z < z2 - 1e-6; z += step)
      mb.slab(x, z, Math.min(x + step, x2), Math.min(z + step, z2), y, thick, color, { jitter: 0.07 });
}

// ============================================================
//  2〜4階の外観（内部は今後の拡張。いまは外殻と屋上）
// ============================================================
function buildUpperFloors(mb, col) {
  const wallC = 0x8a8375, bandC = 0x6b6459, roofC = 0x55524b;
  for (let f = 1; f <= 3; f++) {
    const y0 = f * FLOOR_H;
    const y1 = y0 + FLOOR_H;
    // 階の床スラブ（下の階の天井）
    tiled(mb, BX1, RZ1, BX2, HZ2, y0, 0.3, 0x6a655c, 8);
    // 帯（階の境目）
    mb.box(0, y0 + 0.16, RZ1 - 0.06, BX2 - BX1, 0.32, 0.34, bandC, { jitter: 0.05 });
    mb.box(0, y0 + 0.16, HZ2 + 0.06, BX2 - BX1, 0.32, 0.34, bandC, { jitter: 0.05 });
    // 北面・南面（窓つき）
    wallWithHoles(mb, col, {
      axis: "x", fixed: RZ1, from: BX1, to: BX2, y1: y0, y2: y1, thick: WALL_T, color: wallC,
      holes: windowRow(BX1 + 2, BX2 - 2, 3.0, 4.6, y0 + 0.95, y0 + 2.55),
    });
    wallWithHoles(mb, col, {
      axis: "x", fixed: HZ2, from: BX1, to: BX2, y1: y0, y2: y1, thick: WALL_T, color: wallC,
      holes: windowRow(BX1 + 2, BX2 - 2, 3.2, 4.6, y0 + 0.95, y0 + 2.6),
    });
    wallWithHoles(mb, col, { axis: "z", fixed: BX1, from: RZ1, to: HZ2, y1: y0, y2: y1, thick: WALL_T, color: wallC });
    wallWithHoles(mb, col, { axis: "z", fixed: BX2, from: RZ1, to: HZ2, y1: y0, y2: y1, thick: WALL_T, color: wallC });
  }
  // 屋上
  const top = 4 * FLOOR_H;
  tiled(mb, BX1, RZ1, BX2, HZ2, top, 0.34, roofC, 8);
  for (const e of [[BX1, RZ1, BX2, RZ1], [BX1, HZ2, BX2, HZ2]]) {
    mb.box((e[0] + e[2]) / 2, top + 0.55, e[1], e[2] - e[0] + 0.5, 1.1, 0.34, 0x7a7469, { jitter: 0.05 });
  }
  for (const x of [BX1, BX2]) mb.box(x, top + 0.55, (RZ1 + HZ2) / 2, 0.34, 1.1, HZ2 - RZ1, 0x7a7469, { jitter: 0.05 });
  // 屋上の給水塔
  mb.box(28, top + 4.2, -9, 3.0, 2.4, 3.0, 0x6e7a80, { jitter: 0.05 });
  for (const dx of [-1.2, 1.2]) for (const dz of [-1.2, 1.2])
    mb.box(28 + dx, top + 1.6, -9 + dz, 0.18, 3.2, 0.18, 0x4d5459);
  // 昇降口の屋根とひさし
  tiled(mb, EH.x1 - 0.4, EH.z1, EH.x2 + 0.4, EH.z2 + 0.4, FLOOR_H + 0.4, 0.4, roofC, 4);
  mb.box(0, FLOOR_H + 0.72, EH.z2 + 0.35, EH.x2 - EH.x1 + 1.2, 0.5, 0.3, 0x7a7469, { jitter: 0.05 });
  mb.box(0, FLOOR_H + 0.05, EH.z2 + 1.4, 7.0, 0.28, 2.4, 0x6f6a5f, { jitter: 0.04 });
  for (const dx of [-3.0, 3.0]) mb.box(dx, (FLOOR_H - 0.1) / 2, EH.z2 + 2.3, 0.22, FLOOR_H - 0.1, 0.22, 0x5d5952);
}

// 中庭の細かい描き込み（雑草・ひび・落ち葉・白線）
function scatterYardDetail(mb) {
  // 消えかけた白線（トラックの名残）
  for (let i = 0; i < 90; i++) {
    const a = (i / 90) * Math.PI * 2;
    const x = Math.cos(a) * 26, z = 20 + Math.sin(a) * 11;
    if (z < 4) continue;
    mb.box(x, 0.16, z, 1.5, 0.025, 0.13, 0x6e6b60, { jitter: 0.4, rotY: a });
  }
  // 雑草
  for (let i = 0; i < 150; i++) {
    const x = rand(-40, 40), z = rand(3, 33);
    const h = rand(0.03, 0.09);
    mb.box(x, 0.15 + h / 2, z, rand(0.25, 0.75), h, rand(0.25, 0.75), 0x4e5540, { jitter: 0.42, rotY: rand(0, 3.14) });
  }
  // 落ち葉・がれき
  for (let i = 0; i < 200; i++) {
    const x = rand(-41, 41), z = rand(2.5, 33.5);
    mb.box(x, 0.165, z, rand(0.1, 0.24), 0.025, rand(0.1, 0.24),
      Math.random() < 0.5 ? 0x5c4433 : 0x63604f, { jitter: 0.6, rotY: rand(0, 3.14) });
  }
  // 校舎前のひび割れ
  for (let i = 0; i < 70; i++) {
    const x = rand(-41, 41), z = rand(0.3, 2.2);
    mb.box(x, 0.2, z, rand(0.5, 1.6), 0.03, 0.07, 0x3a3a36, { jitter: 0.4, rotY: rand(-0.5, 0.5) });
  }
  // 廊下・教室の床の汚れ
  for (let i = 0; i < 160; i++) {
    const x = rand(-41, 41), z = rand(-13.6, -0.4);
    mb.box(x, 0.19, z, rand(0.3, 1.3), 0.02, rand(0.3, 1.3), 0x4a4a42, { jitter: 0.5, rotY: rand(0, 3.14) });
  }
}
