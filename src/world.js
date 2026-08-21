import * as THREE from "../lib/three.module.js";
import { MeshBuilder, wallWithHoles } from "./meshbuild.js";
import { Colliders, NavGraph, rand, choice } from "./util.js";
import { FLOOR_ROOMS, FLOOR_LABEL, ST_W, ST_E } from "./rooms.js";

export const FLOOR_H = 3.6;
export const WALL_T = 0.22;
export const FLOORS = 4;

// --- 配色（廃墟らしい退色パレット） --------------------------
const C = {
  wall: 0x8a8375, wallDark: 0x6e685c, ceil: 0x7d7869,
  floorHall: 0x5c6352, floorRoom: 0x7a6952, floorTile: 0x77766e,
  board: 0x2e3d31, desk: 0x9a7c50, metal: 0x555c62, locker: 0x76858d,
  ground: 0x54503f, grass: 0x36462f, concrete: 0x6a6a63,
  fence: 0x4e545a, wood: 0x6b5334, shelf: 0x7d6242, stone: 0x6f6f68, sakura: 0x53384a,
  rust: 0x5a4034, stain: 0x4a4438, mold: 0x44503c, curtain: 0x8e8b7e,
};

const RZ1 = -14, RZ2 = -4;        // 部屋の奥行き
const HZ1 = -4, HZ2 = 0;          // 廊下
const BX1 = -42, BX2 = 42;        // 校舎の東西端
const EH = { x1: -6, x2: 6, z1: 0, z2: 9 };        // 昇降口
const YARD = { x1: -42, x2: 42, z1: 0, z2: 34 };   // 中庭
const WR = { x: 26, z1: 9, z2: 26, w: 3.2 };       // 渡り廊下
const ANNEX = { x1: 20, x2: 33, z1: 26, z2: 33 };  // 渡り廊下の先の別棟

export const EXIT_POINT = { x: 0, z: 41 };
export const HUMAN_ENTRY = { x: 0, z: 37 };
export const floorY = (f) => f * FLOOR_H;

// 階段の段の位置（上下階で同じ形）
const STAIR_STEPS = 16;
const stairZ0 = RZ1 + 1.0;
const stairTopZ = stairZ0 + STAIR_STEPS * 0.42;

export function buildWorld(scene, opts = {}) {
  const col = new Colliders();
  const nav = new NavGraph();
  const mb = new MeshBuilder();
  const rooms = [];
  const spawnSpots = [];
  const props = [];
  const lightSpots = [];
  const ctx = { mb, col, nav, rooms, spawnSpots, props, lightSpots, opts };

  buildYard(ctx, opts.dust || 700);
  buildWatariRouka(ctx);
  for (let f = 0; f < FLOORS; f++) buildFloor(ctx, f);
  buildEntranceHall(ctx);
  buildRoof(ctx);

  linkNav(ctx);
  col.build();
  nav.autoLink(col, 12);
  linkStairs(ctx);

  const mat = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 2, specular: 0x0b0d12 });
  const staticMesh = mb.finish(mat);
  staticMesh.name = "school";
  scene.add(staticMesh);
  for (const p of props) scene.add(p.mesh);

  return {
    colliders: col, nav, rooms, spawnSpots, props, lightSpots,
    exit: EXIT_POINT, entry: HUMAN_ENTRY, staticMesh, triangles: mb.triangles,
    bounds: { x1: -46, x2: 46, z1: -18, z2: 44 },
    northOutsideZ: RZ1 - 1.6,
    floors: FLOORS,
    floorOf(y) { return Math.max(0, Math.min(FLOORS - 1, Math.round(y / FLOOR_H))); },
    // その位置が階段の吹き抜けの中か（おばけはここで上下に移動できる）
    inStairShaft(x, z) {
      if (z < RZ1 - 0.3 || z > RZ2 + 0.3) return false;
      return (x > ST_W.x1 && x < ST_W.x2) || (x > ST_E.x1 && x < ST_E.x2);
    },
    roomAt(x, z, y) {
      if (z > 1.6) {
        if (x > WR.x - WR.w && x < WR.x + WR.w && z > WR.z1 && z < WR.z2) return "渡り廊下";
        if (x > ANNEX.x1 && x < ANNEX.x2 && z > ANNEX.z1 && z < ANNEX.z2) return "部室棟";
        return "中庭";
      }
      if (z >= -0.2 && x > EH.x1 && x < EH.x2) return "昇降口";
      const f = Math.max(0, Math.min(FLOORS - 1, Math.round((y || 0) / FLOOR_H)));
      const label = FLOOR_LABEL[f];
      if (z > HZ1) return label + " 廊下";
      for (const r of FLOOR_ROOMS[f]) if (x >= r.x1 && x <= r.x2) return label + " " + r.name;
      return label + " 廊下";
    },
    isIndoors(x, z) { return z < 0.2 && z > RZ1 - 0.2 && x > BX1 && x < BX2; },
    update(dt, t) { for (const p of props) if (p.update) p.update(dt, t); },
  };
}

// ============================================================
//  1フロアぶんを建てる
// ============================================================
function buildFloor(ctx, f) {
  const { mb, col, spawnSpots, lightSpots, rooms } = ctx;
  const y0 = floorY(f);
  const y1 = y0 + FLOOR_H;
  const list = FLOOR_ROOMS[f];
  const label = FLOOR_LABEL[f];
  const decay = 0.25 + f * 0.16;            // 上の階ほど荒れている

  // --- 床（階段のところは吹き抜けにするので敷かない）--------
  tiled(mb, BX1, HZ1, BX2, HZ2, y0, 0.3, C.floorHall, 6);
  for (const r of list) {
    if (r.kind === "stair") continue;
    const fc = r.kind === "toilet" || r.kind === "science" ? C.floorTile : C.floorRoom;
    tiled(mb, r.x1, RZ1, r.x2, RZ2, y0 + 0.02, 0.3, fc, 5);
  }
  // 階段室は、上り口の手前だけ床を張る
  for (const s of [ST_W, ST_E]) {
    tiled(mb, s.x1, stairTopZ - 0.1, s.x2, RZ2, y0 + 0.02, 0.3, C.concrete, 4);
  }

  // --- 天井（最上階の上は屋上スラブが受けもつ）--------------
  if (f < FLOORS - 1) {
    tiled(mb, BX1, HZ1, BX2, HZ2, y1, 0.26, C.ceil, 6);
    for (const r of list) {
      if (r.kind === "stair") continue;
      tiled(mb, r.x1, RZ1, r.x2, RZ2, y1, 0.26, C.ceil, 5);
    }
  }

  // --- 外壁（南北）------------------------------------------
  const north = windowRow(BX1 + 2, BX2 - 2, 3.0, 4.6, y0 + 0.95, y0 + 2.55);
  wallWithHoles(mb, col, { axis: "x", fixed: RZ1, from: BX1, to: BX2, y1: y0, y2: y1, thick: WALL_T, color: C.wall, holes: north });
  const south = windowRow(BX1 + 2, BX2 - 2, 3.2, 4.6, y0 + 0.95, y0 + 2.6)
    .filter((h) => f > 0 || h.b < -7.5 || h.a > 7.5);
  if (f === 0) south.push({ a: -3, b: 3, y1: y0, y2: y0 + 2.5 });
  wallWithHoles(mb, col, { axis: "x", fixed: HZ2, from: BX1, to: BX2, y1: y0, y2: y1, thick: WALL_T, color: C.wall, holes: south });
  // 渡り廊下へ出る口（2階のみ）
  wallWithHoles(mb, col, { axis: "z", fixed: BX1, from: RZ1, to: HZ2, y1: y0, y2: y1, thick: WALL_T, color: C.wall });
  wallWithHoles(mb, col, { axis: "z", fixed: BX2, from: RZ1, to: HZ2, y1: y0, y2: y1, thick: WALL_T, color: C.wall });

  // --- 廊下と部屋のあいだ -----------------------------------
  const holes = [];
  for (const r of list) {
    const cx = (r.x1 + r.x2) / 2;
    holes.push({ a: cx - 0.9, b: cx + 0.9, y1: y0, y2: y0 + 2.3 });
    if (["class", "staff", "science", "library", "home", "music", "art", "av"].includes(r.kind)) {
      holes.push({ a: r.x1 + 1.2, b: cx - 1.6, y1: y0 + 1.0, y2: y0 + 2.4 });
      holes.push({ a: cx + 1.6, b: r.x2 - 1.2, y1: y0 + 1.0, y2: y0 + 2.4 });
    }
  }
  wallWithHoles(mb, col, { axis: "x", fixed: RZ2, from: BX1, to: BX2, y1: y0, y2: y1, thick: WALL_T, color: C.wallDark, holes });
  for (let i = 1; i < list.length; i++) {
    wallWithHoles(mb, col, { axis: "z", fixed: list[i].x1, from: RZ1, to: RZ2, y1: y0, y2: y1, thick: WALL_T, color: C.wallDark });
  }

  // --- 部屋の中身 -------------------------------------------
  for (const r of list) {
    const cx = (r.x1 + r.x2) / 2, cz = (RZ1 + RZ2) / 2;
    rooms.push({ ...r, floor: f, cx, cz, y: y0, z1: RZ1, z2: RZ2, doorX: cx, doorZ: RZ2, label: label + " " + r.name });
    furnish(ctx, r, f, y0, cx, cz, decay);
    for (let k = 0; k < 3; k++) {
      spawnSpots.push({ x: rand(r.x1 + 1.4, r.x2 - 1.4), z: rand(RZ1 + 1.4, RZ2 - 1.4), y: y0, floor: f });
    }
  }
  rooms.push({ id: "hall" + f, name: "廊下", floor: f, cx: 0, cz: -2, y: y0, x1: BX1, x2: BX2, z1: HZ1, z2: HZ2, kind: "hall", label: label + " 廊下" });

  // --- 廊下の備品と荒れ具合 ---------------------------------
  for (let x = BX1 + 5; x < BX2 - 4; x += 9) {
    mb.box(x, y0 + 0.55, HZ1 + 0.45, 0.32, 1.1, 0.32, 0xa03a2a, { jitter: 0.1 });
    spawnSpots.push({ x: x + rand(-3, 3), z: rand(HZ1 + 0.9, HZ2 - 0.9), y: y0, floor: f });
  }
  for (let x = BX1 + 3; x < BX2 - 3; x += 12) lightSpots.push({ x, y: y1 - 0.45, z: -2, floor: f });
  decorateCorridor(ctx, f, y0, decay);
}

// ============================================================
//  階段（吹き抜けでつながる）
// ============================================================
function buildStairs(ctx, r, f, y0) {
  const { mb, col, props, spawnSpots } = ctx;
  const x0 = r.x1 + 0.8, x1 = r.x2 - 0.8;
  // 上の階へ上がる段
  if (f < FLOORS - 1) {
    for (let i = 0; i < STAIR_STEPS; i++) {
      const y = y0 + (i + 1) * (FLOOR_H / STAIR_STEPS);
      const z = stairZ0 + i * 0.42;
      mb.box((x0 + x1) / 2, y - 0.09, z, x1 - x0, 0.18, 0.42, C.concrete, { jitter: 0.06 });
      col.add(x0, z - 0.21, x1, z + 0.21, y0, y, "stair");
    }
  }
  // 手すり
  for (const sx of [x0, x1]) {
    for (let i = 0; i < STAIR_STEPS; i += 2) {
      const y = y0 + (i + 1) * (FLOOR_H / STAIR_STEPS);
      mb.box(sx, y + 0.45, stairZ0 + i * 0.42, 0.06, 0.9, 0.06, C.metal, { jitter: 0.1 });
    }
  }
  // 上の階へ行けない場合は「結界」でふさぐ（いまは無し。全階つながっている）
  spawnSpots.push({ x: (x0 + x1) / 2, z: RZ2 - 1.2, y: y0, floor: f });
}

// ============================================================
//  昇降口と屋上
// ============================================================
function buildEntranceHall(ctx) {
  const { mb, col, rooms, lightSpots } = ctx;
  tiled(mb, EH.x1, EH.z1, EH.x2, EH.z2, 0.02, 0.3, C.floorTile, 4);
  tiled(mb, EH.x1, EH.z1, EH.x2, EH.z2, FLOOR_H, 0.28, C.ceil, 4);
  wallWithHoles(mb, col, { axis: "z", fixed: EH.x1, from: EH.z1, to: EH.z2, y1: 0, y2: FLOOR_H, thick: WALL_T, color: C.wall });
  wallWithHoles(mb, col, { axis: "z", fixed: EH.x2, from: EH.z1, to: EH.z2, y1: 0, y2: FLOOR_H, thick: WALL_T, color: C.wall });
  wallWithHoles(mb, col, {
    axis: "x", fixed: EH.z2, from: EH.x1, to: EH.x2, y1: 0, y2: FLOOR_H, thick: WALL_T, color: C.wall,
    holes: [{ a: -2.6, b: 2.6, y1: 0, y2: 2.6 }],
  });
  for (const sx of [-4.6, 4.6]) {
    for (let z = 1.4; z < 7.6; z += 2.1) {
      mb.box(sx, 1.0, z, 1.5, 2.0, 1.9, C.locker, { jitter: 0.12 });
      col.add(sx - 0.75, z - 0.95, sx + 0.75, z + 0.95, 0, 2.0, "wall");
    }
  }
  mb.box(0, 2.78, EH.z2 - 0.25, 4.2, 0.7, 0.3, C.wood, { jitter: 0.03 });
  // ひさし
  tiled(mb, EH.x1 - 0.4, EH.z1, EH.x2 + 0.4, EH.z2 + 0.4, FLOOR_H + 0.4, 0.4, 0x55524b, 4);
  mb.box(0, FLOOR_H + 0.05, EH.z2 + 1.4, 7.0, 0.28, 2.4, 0x6f6a5f, { jitter: 0.04 });
  for (const dx of [-3.0, 3.0]) mb.box(dx, (FLOOR_H - 0.1) / 2, EH.z2 + 2.3, 0.22, FLOOR_H - 0.1, 0.22, 0x5d5952);
  for (let x = -14; x <= 14; x += 7) lightSpots.push({ x, y: FLOOR_H - 0.5, z: 4.5, floor: 0 });
  rooms.push({ id: "entrance", name: "昇降口", floor: 0, cx: 0, cz: 4.5, y: 0, x1: EH.x1, x2: EH.x2, z1: EH.z1, z2: EH.z2, kind: "entrance", label: "昇降口" });
}

function buildRoof(ctx) {
  const { mb } = ctx;
  const top = floorY(FLOORS);
  tiled(mb, BX1, RZ1, BX2, HZ2, top, 0.34, 0x55524b, 8);
  for (const e of [RZ1, HZ2]) mb.box(0, top + 0.55, e, BX2 - BX1 + 0.5, 1.1, 0.34, 0x7a7469, { jitter: 0.05 });
  for (const x of [BX1, BX2]) mb.box(x, top + 0.55, (RZ1 + HZ2) / 2, 0.34, 1.1, HZ2 - RZ1, 0x7a7469, { jitter: 0.05 });
  mb.box(28, top + 4.2, -9, 3.0, 2.4, 3.0, 0x6e7a80, { jitter: 0.05 });
  for (const dx of [-1.2, 1.2]) for (const dz of [-1.2, 1.2]) mb.box(28 + dx, top + 1.6, -9 + dz, 0.18, 3.2, 0.18, 0x4d5459);
}

// ============================================================
//  渡り廊下と、その先の部室棟
// ============================================================
function buildWatariRouka(ctx) {
  const { mb, col, rooms, spawnSpots, lightSpots, props } = ctx;
  const w = WR.w, x = WR.x;
  // 床
  for (let z = WR.z1; z < WR.z2; z += 4) {
    mb.slab(x - w, z, x + w, Math.min(z + 4, WR.z2), 0.22, 0.24, C.concrete, { jitter: 0.16 });
  }
  // 柱と屋根
  for (let z = WR.z1; z <= WR.z2; z += 3.4) {
    for (const sx of [-w + 0.25, w - 0.25]) {
      mb.box(x + sx, 1.45, z, 0.22, 2.6, 0.22, C.concrete, { jitter: 0.08 });
      col.add(x + sx - 0.12, z - 0.12, x + sx + 0.12, z + 0.12, 0, 2.6, "wall");
    }
    mb.box(x, 2.86, z, w * 2 + 0.4, 0.16, 0.3, 0x6f6a5f, { jitter: 0.06 });
  }
  mb.slab(x - w - 0.3, WR.z1, x + w + 0.3, WR.z2, 3.05, 0.2, 0x5d5952, { jitter: 0.05 });
  // 腰の高さの手すり
  for (const sx of [-w, w]) {
    mb.wall(x + sx, WR.z1, x + sx, WR.z2, 0.9, 1.05, 0.1, C.metal, { jitter: 0.1 });
    for (let z = WR.z1; z <= WR.z2; z += 1.7) mb.box(x + sx, 0.62, z, 0.07, 0.85, 0.07, C.metal, { jitter: 0.12 });
    col.add(x + sx - 0.14, WR.z1, x + sx + 0.14, WR.z2, 0, 1.05, "wall");
  }
  for (let z = WR.z1 + 2; z < WR.z2; z += 5) {
    lightSpots.push({ x, y: 2.8, z, floor: 0 });
    spawnSpots.push({ x: x + rand(-1.6, 1.6), z, y: 0.22, floor: 0 });
  }
  // 落ち葉と水たまり
  for (let i = 0; i < 26; i++) {
    mb.box(x + rand(-w + 0.4, w - 0.4), 0.36, rand(WR.z1, WR.z2), rand(0.12, 0.3), 0.03, rand(0.12, 0.3),
      Math.random() < 0.5 ? 0x5c4433 : 0x4a5540, { jitter: 0.5, rotY: rand(0, 3.14) });
  }
  rooms.push({ id: "watari", name: "渡り廊下", floor: 0, cx: x, cz: (WR.z1 + WR.z2) / 2, y: 0.22,
    x1: x - w, x2: x + w, z1: WR.z1, z2: WR.z2, kind: "watari", label: "渡り廊下" });

  // --- 部室棟（渡り廊下の先の小さな建物）------------------
  const A = ANNEX;
  tiled(mb, A.x1, A.z1, A.x2, A.z2, 0.24, 0.3, C.floorTile, 5);
  tiled(mb, A.x1, A.z1, A.x2, A.z2, 3.2, 0.28, C.ceil, 5);
  wallWithHoles(mb, col, { axis: "x", fixed: A.z1, from: A.x1, to: A.x2, y1: 0, y2: 3.2, thick: WALL_T, color: C.wall,
    holes: [{ a: x - 1.3, b: x + 1.3, y1: 0, y2: 2.4 }] });
  wallWithHoles(mb, col, { axis: "x", fixed: A.z2, from: A.x1, to: A.x2, y1: 0, y2: 3.2, thick: WALL_T, color: C.wall,
    holes: windowRow(A.x1 + 1.5, A.x2 - 1.5, 2.4, 4.4, 1.0, 2.5) });
  wallWithHoles(mb, col, { axis: "z", fixed: A.x1, from: A.z1, to: A.z2, y1: 0, y2: 3.2, thick: WALL_T, color: C.wall });
  wallWithHoles(mb, col, { axis: "z", fixed: A.x2, from: A.z1, to: A.z2, y1: 0, y2: 3.2, thick: WALL_T, color: C.wall });
  mb.slab(A.x1 - 0.4, A.z1 - 0.4, A.x2 + 0.4, A.z2 + 0.4, 3.5, 0.3, 0x55524b, { jitter: 0.05 });
  // 中身：積み上げた机と、置きっぱなしの跳び箱
  for (let i = 0; i < 4; i++) {
    mb.box(A.x1 + 2.4, 0.5 + i * 0.36, A.z1 + 2.2, 1.2, 0.34, 0.7, C.desk, { jitter: 0.14, rotY: rand(-0.2, 0.2) });
  }
  col.add(A.x1 + 1.7, A.z1 + 1.8, A.x1 + 3.1, A.z1 + 2.6, 0, 2.0, "wall");
  for (let i = 0; i < 5; i++) {
    mb.box(A.x2 - 2.6, 0.4 + i * 0.28, A.z2 - 2.4, 1.5 - i * 0.14, 0.26, 0.9 - i * 0.06, 0xa8804a, { jitter: 0.08 });
  }
  col.add(A.x2 - 3.4, A.z2 - 2.9, A.x2 - 1.8, A.z2 - 1.9, 0, 1.8, "wall");
  props.push(makeCobweb(A.x1 + 0.6, 2.7, A.z1 + 0.6, 0.9));
  for (let i = 0; i < 4; i++) spawnSpots.push({ x: rand(A.x1 + 1, A.x2 - 1), z: rand(A.z1 + 1, A.z2 - 1), y: 0.24, floor: 0 });
  lightSpots.push({ x: (A.x1 + A.x2) / 2, y: 2.9, z: (A.z1 + A.z2) / 2, floor: 0 });
  rooms.push({ id: "annex", name: "部室棟", floor: 0, cx: (A.x1 + A.x2) / 2, cz: (A.z1 + A.z2) / 2, y: 0.24,
    x1: A.x1, x2: A.x2, z1: A.z1, z2: A.z2, kind: "annex", label: "部室棟" });
}

// ============================================================
//  部屋の中身
// ============================================================
function furnish(ctx, r, f, y0, cx, cz, decay) {
  const { mb, col, props, spawnSpots, opts } = ctx;
  const K = r.kind;

  if (K === "stair") { buildStairs(ctx, r, f, y0); return; }

  // どの部屋にも、荒れた床・しみ・くもの巣
  grime(mb, r.x1 + 0.5, RZ1 + 0.5, r.x2 - 0.5, RZ2 - 0.5, y0, decay);
  if (Math.random() < 0.35 + decay * 0.4) {
    props.push(makeCobweb(r.x1 + 0.7, y0 + FLOOR_H - 0.6, RZ1 + 0.7, 0.7 + Math.random() * 0.5));
  }
  // 破れたカーテン（窓ぎわ）
  if (["class", "staff", "music", "av", "art"].includes(K) && Math.random() < 0.7) {
    props.push(makeCurtain(cx + rand(-2.5, 2.5), y0 + 1.75, RZ1 + 0.42, 1.1 + Math.random()));
  }

  if (K === "class" || K === "staff" || K === "av") {
    const bw = Math.min(RZ2 - RZ1 - 2.4, 6.4), bz = cz;
    mb.box(r.x1 + 0.3, y0 + 1.75, bz, 0.14, 1.3, bw, C.board, { jitter: 0.04 });
    mb.box(r.x1 + 0.36, y0 + 1.05, bz, 0.22, 0.1, bw, C.wood, { jitter: 0.05 });
    mb.box(r.x1 + 1.5, y0 + 0.12, bz, 1.4, 0.22, 3.0, C.wood, { jitter: 0.05 });
    const face = -Math.PI / 2;
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) {
        const dx = r.x1 + 3.4 + i * 1.9 + rand(-0.15, 0.15);
        const dz = bz - 2.4 + j * 2.4 + rand(-0.18, 0.18);
        if (dx > r.x2 - 1.2) continue;
        // 荒れているほど、ひっくり返った机が増える
        if (Math.random() < decay * 0.45) { tippedDesk(mb, col, dx, dz, y0, rand(0, 6.28)); continue; }
        desk(mb, col, dx, dz, y0, face + rand(-0.3, 0.3));
        if (Math.random() < 0.5) chair(mb, col, dx + 0.95, dz, y0, face + rand(-0.8, 0.8));
      }
    for (let z = RZ1 + 1.2; z < RZ2 - 1.2; z += 1.0) {
      mb.box(r.x2 - 0.55, y0 + 0.9, z, 0.6, 1.8, 0.9, C.locker, { jitter: 0.14 });
      col.add(r.x2 - 0.9, z - 0.45, r.x2 - 0.25, z + 0.45, y0, y0 + 1.8, "wall");
    }
  }

  if (K === "science") {
    for (let i = 0; i < 2; i++)
      for (let j = 0; j < 3; j++) {
        const dx = cx + (i - 0.5) * 4.0, dz = RZ1 + 3.4 + j * 2.5;
        mb.box(dx, y0 + 0.78, dz, 3.0, 0.12, 1.2, 0x3a4a44, { jitter: 0.06 });
        for (const s of [-1.3, 1.3]) for (const s2 of [-0.45, 0.45]) mb.box(dx + s, y0 + 0.36, dz + s2, 0.1, 0.72, 0.1, C.metal);
        col.add(dx - 1.5, dz - 0.6, dx + 1.5, dz + 0.6, y0, y0 + 0.85, "furn");
      }
    mb.box(r.x1 + 0.3, y0 + 1.75, cz, 0.14, 1.3, 6, C.board, { jitter: 0.04 });
    props.push(makeJintai(r.x2 - 1.6, y0, RZ1 + 1.7));
    shelfRow(mb, col, r.x1 + 0.9, RZ1 + 2, r.x1 + 0.9, RZ2 - 2, y0, 1.9);
    // ホルマリン漬けの標本
    for (let i = 0; i < 4; i++) {
      mb.box(r.x1 + 0.9, y0 + 1.55, RZ1 + 2.4 + i * 1.1, 0.3, 0.42, 0.3, 0x6f8a7a, { jitter: 0.18 });
    }
    spawnSpots.push({ x: cx, z: RZ1 + 2.2, y: y0, floor: f });
  }

  if (K === "music") {
    props.push(makePiano(cx - 2.5, y0, RZ1 + 3.4));
    col.add(cx - 3.4, RZ1 + 2.2, cx - 1.6, RZ1 + 4.6, y0, y0 + 1.2, "furn");
    for (let a = -1.1; a <= 1.1; a += 0.26) {
      const cxx = cx + Math.sin(a) * 4.6, czz = RZ1 + 3.6 + Math.cos(a) * 4.6;
      if (czz > RZ2 - 1) continue;
      if (Math.random() < decay * 0.5) continue;
      chair(mb, col, cxx, czz, y0, a + Math.PI);
    }
    mb.box(r.x2 - 1.2, y0 + 1.6, RZ1 + 2.4, 0.5, 3.2, 2.6, C.shelf, { jitter: 0.06 });
    col.add(r.x2 - 1.5, RZ1 + 1.1, r.x2 - 0.9, RZ1 + 3.7, y0, y0 + 3.2, "wall");
    // 壁にならぶ作曲家の肖像画（目が合う気がするやつ）
    for (let i = 0; i < 5; i++) {
      const px = r.x1 + 2.5 + i * 2.2;
      if (px > r.x2 - 1.5) break;
      mb.box(px, y0 + 2.5, RZ1 + 0.34, 0.62, 0.78, 0.08, 0x3a2f24, { jitter: 0.08 });
      mb.box(px, y0 + 2.5, RZ1 + 0.4, 0.5, 0.64, 0.04, 0x7a6a58, { jitter: 0.12 });
    }
  }

  if (K === "library") {
    for (let x = r.x1 + 1.8; x < r.x2 - 1.2; x += 2.3) {
      const fallen = Math.random() < decay * 0.35;
      if (fallen) {
        mb.box(x, y0 + 0.34, cz + 0.4, 2.0, 0.66, 5.0, C.shelf, { jitter: 0.12, rotY: rand(-0.2, 0.2) });
        col.add(x - 1.0, cz - 2.1, x + 1.0, cz + 2.9, y0, y0 + 0.7, "furn");
      } else {
        mb.box(x, y0 + 1.05, cz + 0.4, 0.75, 2.1, 5.0, C.shelf, { jitter: 0.1 });
        col.add(x - 0.4, cz - 2.1, x + 0.4, cz + 2.9, y0, y0 + 2.1, "wall");
      }
      spawnSpots.push({ x, z: cz - 2.9, y: y0, floor: f });
    }
    for (let i = 0; i < 18; i++) {
      mb.box(rand(r.x1 + 1, r.x2 - 1), y0 + 0.2, rand(RZ1 + 1, RZ2 - 1), 0.24, 0.06, 0.18,
        choice([0x7a4a3a, 0x3a4a6a, 0x4a5a3a]), { jitter: 0.3, rotY: rand(0, 3.14) });
    }
  }

  if (K === "home") {
    for (let i = 0; i < 2; i++) {
      const dz = RZ1 + 3 + i * 3.4;
      mb.box(cx, y0 + 0.85, dz, 4.4, 0.14, 1.6, 0xa9a49a, { jitter: 0.06 });
      mb.box(cx, y0 + 0.42, dz, 4.2, 0.72, 1.4, C.wood, { jitter: 0.08 });
      col.add(cx - 2.2, dz - 0.8, cx + 2.2, dz + 0.8, y0, y0 + 0.92, "furn");
      // コンロと鍋
      for (const sx of [-1.4, 1.4]) {
        mb.box(cx + sx, y0 + 0.93, dz, 0.5, 0.04, 0.5, 0x3a3a40, { jitter: 0.1 });
        if (Math.random() < 0.6) mb.box(cx + sx, y0 + 1.02, dz, 0.34, 0.2, 0.34, C.metal, { jitter: 0.14 });
      }
    }
    // 食器棚
    mb.box(r.x2 - 0.7, y0 + 1.1, cz, 0.7, 2.2, 3.4, C.shelf, { jitter: 0.08 });
    col.add(r.x2 - 1.05, cz - 1.7, r.x2 - 0.35, cz + 1.7, y0, y0 + 2.2, "wall");
    spawnSpots.push({ x: cx - 2, z: RZ2 - 1.5, y: y0, floor: f });
  }

  if (K === "art") {
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 2; j++) {
        const dx = cx - 3 + i * 3, dz = RZ1 + 3.4 + j * 3.2;
        mb.box(dx, y0 + 0.76, dz, 2.4, 0.12, 1.4, 0x6f5a44, { jitter: 0.1 });
        col.add(dx - 1.2, dz - 0.7, dx + 1.2, dz + 0.7, y0, y0 + 0.82, "furn");
      }
    // イーゼルと石膏像
    for (let i = 0; i < 3; i++) {
      const px = r.x1 + 2 + i * 3.2;
      mb.box(px, y0 + 0.8, RZ2 - 1.6, 0.1, 1.6, 0.1, C.wood, { jitter: 0.14, rotY: rand(-0.3, 0.3) });
      mb.box(px, y0 + 1.35, RZ2 - 1.55, 0.9, 0.7, 0.06, 0xd8d2c4, { jitter: 0.1 });
    }
    mb.box(r.x2 - 1.6, y0 + 1.35, RZ1 + 1.6, 0.42, 0.6, 0.42, 0xd8d4cc, { jitter: 0.06 });
    mb.box(r.x2 - 1.6, y0 + 0.5, RZ1 + 1.6, 0.5, 1.0, 0.5, 0x6a6258, { jitter: 0.06 });
    col.add(r.x2 - 1.9, RZ1 + 1.3, r.x2 - 1.3, RZ1 + 1.9, y0, y0 + 1.7, "wall");
  }

  if (K === "nurse") {
    // ベッドとカーテンレール
    for (let i = 0; i < 2; i++) {
      const bz = RZ1 + 2.4 + i * 3.0;
      mb.box(r.x2 - 2.0, y0 + 0.42, bz, 1.1, 0.24, 2.1, 0xe4e0d6, { jitter: 0.06 });
      mb.box(r.x2 - 2.0, y0 + 0.2, bz, 1.2, 0.4, 2.2, C.metal, { jitter: 0.08 });
      col.add(r.x2 - 2.6, bz - 1.1, r.x2 - 1.4, bz + 1.1, y0, y0 + 0.6, "furn");
      props.push(makeCurtain(r.x2 - 3.0, y0 + 1.6, bz, 1.6));
    }
    mb.box(r.x1 + 1.4, y0 + 0.4, RZ2 - 1.4, 1.6, 0.8, 0.7, C.shelf, { jitter: 0.08 });
    col.add(r.x1 + 0.6, RZ2 - 1.75, r.x1 + 2.2, RZ2 - 1.05, y0, y0 + 0.85, "furn");
    spawnSpots.push({ x: r.x1 + 2, z: RZ1 + 2, y: y0, floor: f });
  }

  if (K === "plain") {
    // 準備室・資料室のたぐい。棚だらけで見通しが悪い
    for (let x = r.x1 + 1.4; x < r.x2 - 1.0; x += 2.0) {
      mb.box(x, y0 + 1.0, RZ1 + 2.4, 0.6, 2.0, 3.6, C.shelf, { jitter: 0.12 });
      col.add(x - 0.32, RZ1 + 0.6, x + 0.32, RZ1 + 4.2, y0, y0 + 2.0, "wall");
    }
    for (let i = 0; i < 6; i++) {
      mb.box(rand(r.x1 + 1, r.x2 - 1), y0 + 0.22, rand(RZ2 - 2.6, RZ2 - 0.8), rand(0.4, 0.8), 0.44, rand(0.3, 0.6),
        0x6b5334, { jitter: 0.2, rotY: rand(0, 3.14) });
    }
    spawnSpots.push({ x: cx, z: RZ2 - 1.6, y: y0, floor: f });
  }

  if (K === "toilet") {
    const male = r.sex === "m";
    const n = Math.max(2, Math.floor((r.x2 - r.x1 - 1.2) / 1.5));
    for (let i = 0; i <= n; i++) {
      const x = r.x1 + 0.9 + i * 1.5;
      mb.box(x - 0.75, y0 + 1.1, RZ1 + 2.2, 0.09, 2.2, 2.4, 0x8d9a8f, { jitter: 0.07 });
      col.add(x - 0.8, RZ1 + 1.0, x - 0.7, RZ1 + 3.4, y0, y0 + 2.2, "wall");
      if (i < n) mb.box(x, y0 + 0.3, RZ1 + 1.6, 0.55, 0.6, 0.85, 0xd8d6cc, { jitter: 0.06 });
    }
    if (male) {
      for (let i = 0; i < 3; i++) {
        const x = r.x1 + 1.0 + i * 1.1;
        if (x > r.x2 - 0.8) break;
        mb.box(x, y0 + 0.85, RZ2 - 0.5, 0.42, 0.9, 0.34, 0xdedad0, { jitter: 0.05 });
        col.add(x - 0.24, RZ2 - 0.72, x + 0.24, RZ2 - 0.28, y0, y0 + 1.0, "furn");
      }
    } else {
      mb.box(cx, y0 + 0.82, RZ2 - 1.0, r.x2 - r.x1 - 1.6, 0.16, 0.6, 0xc9c6ba, { jitter: 0.05 });
      col.add(r.x1 + 0.8, RZ2 - 1.3, r.x2 - 0.8, RZ2 - 0.7, y0, y0 + 0.9, "furn");
    }
    // 鏡（割れていることもある）
    mb.box(cx, y0 + 1.9, RZ2 - 0.78, r.x2 - r.x1 - 1.8, 0.9, 0.08,
      Math.random() < decay ? 0x3a3038 : 0x2a3138, { jitter: 0.1 });
    props.push(makeSign(cx, y0 + 2.5, RZ2 + 0.06, male));
    // 隠し要素：どこかの個室にひとつだけ
    if (opts && opts.poopRoom === r.id) {
      const st = Math.floor(rand(0, Math.max(1, n)));
      props.push(makePoop(r.x1 + 0.9 + st * 1.5, y0 + 0.62, RZ1 + 1.6));
    }
    spawnSpots.push({ x: cx, z: RZ2 - 1.7, y: y0, floor: f });
  }
}

// ============================================================
//  家具の部品
// ============================================================
function desk(mb, col, x, z, y0, rot) {
  mb.box(x, y0 + 0.72, z, 1.15, 0.08, 0.62, C.desk, { jitter: 0.12, rotY: rot });
  for (const sx of [-0.48, 0.48]) for (const sz of [-0.24, 0.24]) {
    const px = x + sx * Math.cos(rot) - sz * Math.sin(rot);
    const pz = z + sx * Math.sin(rot) + sz * Math.cos(rot);
    mb.box(px, y0 + 0.34, pz, 0.06, 0.68, 0.06, C.metal);
  }
  col.add(x - 0.6, z - 0.36, x + 0.6, z + 0.36, y0, y0 + 0.78, "furn");
}

function tippedDesk(mb, col, x, z, y0, rot) {
  mb.box(x, y0 + 0.34, z, 1.15, 0.62, 0.08, C.desk, { jitter: 0.16, rotY: rot });
  for (const sx of [-0.45, 0.45]) mb.box(x + sx * Math.cos(rot), y0 + 0.62, z + sx * Math.sin(rot), 0.06, 0.06, 0.62, C.metal);
  col.add(x - 0.6, z - 0.42, x + 0.6, z + 0.42, y0, y0 + 0.7, "furn");
}

function chair(mb, col, x, z, y0, rot) {
  mb.box(x, y0 + 0.44, z, 0.44, 0.06, 0.44, C.desk, { jitter: 0.12, rotY: rot });
  mb.box(x - Math.sin(rot) * 0.2, y0 + 0.72, z - Math.cos(rot) * 0.2, 0.44, 0.5, 0.06, C.desk, { jitter: 0.12, rotY: rot });
  for (const sx of [-0.17, 0.17]) for (const sz of [-0.17, 0.17]) mb.box(x + sx, y0 + 0.21, z + sz, 0.05, 0.42, 0.05, C.metal);
  col.add(x - 0.26, z - 0.26, x + 0.26, z + 0.26, y0, y0 + 0.5, "furn");
}

function shelfRow(mb, col, x1, z1, x2, z2, y0, h) {
  const w = 0.5;
  mb.box((x1 + x2) / 2, y0 + h / 2, (z1 + z2) / 2, Math.max(w, Math.abs(x2 - x1)), h, Math.max(w, Math.abs(z2 - z1)), C.shelf, { jitter: 0.1 });
  col.add(Math.min(x1, x2) - w / 2, Math.min(z1, z2) - w / 2, Math.max(x1, x2) + w / 2, Math.max(z1, z2) + w / 2, y0, y0 + h, "wall");
}

// 床のよごれ・落ちた天井材・ひび
function grime(mb, x1, z1, x2, z2, y0, decay) {
  const n = Math.floor(14 + decay * 26);
  for (let i = 0; i < n; i++) {
    const x = rand(x1, x2), z = rand(z1, z2);
    mb.box(x, y0 + 0.19, z, rand(0.3, 1.4), 0.02, rand(0.3, 1.4), C.stain, { jitter: 0.45, rotY: rand(0, 3.14) });
  }
  // 落ちた天井のかけら
  const m = Math.floor(decay * 12);
  for (let i = 0; i < m; i++) {
    mb.box(rand(x1, x2), y0 + 0.24, rand(z1, z2), rand(0.25, 0.6), 0.06, rand(0.25, 0.6), 0xa8a294, { jitter: 0.3, rotY: rand(0, 3.14) });
  }
}

// 廊下の荒れ具合
function decorateCorridor(ctx, f, y0, decay) {
  const { mb, props } = ctx;
  grime(mb, BX1 + 1, HZ1 + 0.6, BX2 - 1, HZ2 - 0.6, y0, decay * 0.8);
  // 掲示板（はがれかけの紙）
  for (let x = BX1 + 8; x < BX2 - 6; x += 14) {
    mb.box(x, y0 + 1.9, RZ2 + 0.22, 3.2, 1.2, 0.08, 0x4a4034, { jitter: 0.08 });
    for (let i = 0; i < 5; i++) {
      mb.box(x + rand(-1.3, 1.3), y0 + 1.9 + rand(-0.4, 0.4), RZ2 + 0.28, rand(0.3, 0.5), rand(0.35, 0.5), 0.02,
        0xc9c4b4, { jitter: 0.2, rotY: rand(-0.25, 0.25) });
    }
  }
  // 天井から垂れさがった配線
  for (let i = 0; i < Math.floor(decay * 8); i++) {
    const x = rand(BX1 + 3, BX2 - 3);
    props.push(makeWire(x, y0 + FLOOR_H - 0.3, rand(HZ1 + 0.6, HZ2 - 0.6), 0.5 + Math.random() * 0.8));
  }
  // くもの巣（角）
  for (const x of [BX1 + 1.2, BX2 - 1.2]) props.push(makeCobweb(x, y0 + FLOOR_H - 0.5, HZ1 + 1.0, 1.0));
}

function windowRow(from, to, w, pitch, y1, y2) {
  const holes = [];
  for (let x = from; x + w < to; x += pitch) holes.push({ a: x, b: x + w, y1, y2 });
  return holes;
}

function tiled(mb, x1, z1, x2, z2, y, thick, color, step) {
  for (let x = x1; x < x2 - 1e-6; x += step)
    for (let z = z1; z < z2 - 1e-6; z += step)
      mb.slab(x, z, Math.min(x + step, x2), Math.min(z + step, z2), y, thick, color, { jitter: 0.07 });
}

// ============================================================
//  経路の点をならべる
// ============================================================
function linkNav(ctx) {
  const { nav } = ctx;
  for (let f = 0; f < FLOORS; f++) {
    const y = floorY(f);
    for (let x = BX1 + 3; x <= BX2 - 3; x += 5) nav.addNode(x, -2, f, FLOOR_LABEL[f] + " 廊下", y);
    for (const r of FLOOR_ROOMS[f]) {
      const cx = (r.x1 + r.x2) / 2;
      nav.addNode(cx, RZ2 - 1.4, f, r.name, y);                 // ドアの内側
      nav.addNode(cx, (HZ1 + HZ2) / 2, f, "廊下", y);            // ドアの正面
      if (r.kind !== "stair") nav.addNode(cx, (RZ1 + RZ2) / 2, f, r.name, y);
      else nav.addNode(cx, RZ2 - 2.6, f, r.name, y);            // 階段の下り口
    }
  }
  // 1階まわり（昇降口・中庭・渡り廊下・校門）
  nav.addNode(0, 1.6, 0, "昇降口", 0); nav.addNode(0, 5, 0, "昇降口", 0); nav.addNode(0, 8.4, 0, "昇降口", 0);
  for (let x = -36; x <= 36; x += 8) for (let z = 12; z <= 32; z += 6.6) nav.addNode(x, z, 0, "中庭", 0);
  for (let x = -36; x <= 36; x += 7) nav.addNode(x, 10.5, 0, "中庭", 0);
  // 渡り廊下の北側をぐるりと回れるように
  for (let x = -38; x <= 38; x += 6) {
    if (Math.abs(x) < 7.5) continue;          // 昇降口の中は避ける
    nav.addNode(x, 6, 0, "中庭", 0);
  }
  for (let z = WR.z1 + 1; z < WR.z2; z += 3.2) nav.addNode(WR.x, z, 0, "渡り廊下", 0.22);
  nav.addNode(WR.x, ANNEX.z1 + 1.6, 0, "部室棟", 0.24);
  nav.addNode(ANNEX.x1 + 5.5, ANNEX.z1 + 3.4, 0, "部室棟", 0.24);
  nav.addNode(ANNEX.x2 - 5.5, ANNEX.z1 + 3.4, 0, "部室棟", 0.24);
  for (let x = -36; x <= 36; x += 9) nav.addNode(x, 37.2, 0, "校門前", 0);
  for (let x = -30; x <= 30; x += 10) nav.addNode(x, 41.5, 0, "校門前", 0);
  for (const z of [33, 35, 37.5, EXIT_POINT.z]) nav.addNode(EXIT_POINT.x, z, 0, "校門", 0);
}

// 階段の上下をつなぐ（autoLink は同じ階しか結ばないので、あとから手で結ぶ）
function linkStairs(ctx) {
  const { nav } = ctx;
  const find = (x, z, f) => {
    let best = -1, bd = 9;
    nav.nodes.forEach((n, i) => {
      if (n.floor !== f) return;
      const d = Math.hypot(n.x - x, n.z - z);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  };
  for (let f = 0; f < FLOORS - 1; f++) {
    for (const s of [ST_W, ST_E]) {
      const cx = (s.x1 + s.x2) / 2;
      const lower = find(cx, RZ2 - 2.6, f);
      const upper = find(cx, RZ2 - 2.6, f + 1);
      if (lower >= 0 && upper >= 0) nav.link(lower, upper);
    }
  }
}

// ============================================================
//  中庭
// ============================================================
function buildYard(ctx, dustCount) {
  const { mb, col, spawnSpots, props, rooms } = ctx;
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
    spawnSpots.push({ x: fx, z: fz + 1.7, y: 0, floor: 0 });
  }

  // 二宮金次郎像
  mb.box(-20, 0.35, 13, 1.6, 0.7, 1.6, C.stone, { jitter: 0.05 });
  mb.box(-20, 1.35, 13, 0.55, 1.3, 0.4, 0x6a6258, { jitter: 0.06 });
  mb.box(-20, 2.2, 13, 0.4, 0.4, 0.4, 0x6a6258, { jitter: 0.06 });
  mb.box(-20.42, 1.55, 13.25, 0.3, 0.4, 0.06, 0x8b7a5e);
  col.add(-20.8, 12.2, -19.2, 13.8, 0, 2.5, "wall");
  spawnSpots.push({ x: -20, z: 15.2, y: 0, floor: 0 });

  // ジャングルジム
  for (let i = 0; i <= 3; i++) for (let j = 0; j <= 3; j++)
    mb.box(20 + i * 1.1, 1.65, 16 + j * 1.1, 0.08, 3.3, 0.08, 0x7a4f3a, { jitter: 0.1 });
  for (let k = 1; k <= 3; k++) for (let i = 0; i <= 3; i++) {
    mb.box(21.65, 1.1 * k, 16 + i * 1.1, 3.4, 0.08, 0.08, 0x7a4f3a, { jitter: 0.1 });
    mb.box(20 + i * 1.1, 1.1 * k, 17.65, 0.08, 0.08, 3.4, 0x7a4f3a, { jitter: 0.1 });
  }
  col.add(19.6, 15.6, 23.7, 19.7, 0, 3.3, "soft");
  spawnSpots.push({ x: 21.6, z: 20.6, y: 0, floor: 0 });

  for (const b of [[30, 1.1], [32.4, 1.5]]) {
    const [bx, bh] = b;
    mb.box(bx, bh / 2, 10, 0.09, bh, 0.09, C.metal);
    mb.box(bx, bh / 2, 13, 0.09, bh, 0.09, C.metal);
    mb.box(bx, bh, 11.5, 0.07, 0.07, 3.1, C.metal);
  }

  mb.box(0, 0.35, 24, 4.4, 0.7, 2.6, C.concrete, { jitter: 0.05 });
  col.add(-2.2, 22.7, 2.2, 25.3, 0, 0.7, "furn");
  spawnSpots.push({ x: 0, z: 26.6, y: 0, floor: 0 });

  mb.box(-30, 0.4, 20, 2.6, 0.8, 1.0, 0x8a8f88, { jitter: 0.05 });
  col.add(-31.3, 19.5, -28.7, 20.5, 0, 0.8, "furn");
  for (let i = 0; i < 3; i++) mb.box(-31 + i, 0.95, 20, 0.07, 0.3, 0.07, C.metal);
  spawnSpots.push({ x: -30, z: 22, y: 0, floor: 0 });

  for (const t of [[-34, 27, 1.2], [-8, 29, 1.0], [12, 28, 1.15], [34, 24, 1.05], [-36, 14, 0.9]]) {
    tree(mb, col, t[0], t[1], t[2]);
    spawnSpots.push({ x: t[0] + 2.2, z: t[1] + 1.6, y: 0, floor: 0 });
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

// ============================================================
//  動くもの・小物
// ============================================================
function makePiano(x, y0, z) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.0, 2.4), new THREE.MeshLambertMaterial({ color: 0x1a1a20 }));
  body.position.y = 0.6; g.add(body);
  const keys = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.09, 0.42), new THREE.MeshLambertMaterial({ color: 0xe8e6dc }));
  keys.position.set(0, 1.02, 1.05); g.add(keys);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.08, 1.7), new THREE.MeshLambertMaterial({ color: 0x24242c }));
  lid.position.set(0, 1.12, -0.25); g.add(lid);
  g.position.set(x, y0, z);
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

function makeJintai(x, y0, z) {
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
  g.position.set(x, y0, z);
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
// --- くもの巣（部屋のすみ） ----------------------------------
function makeCobweb(x, y, z, s) {
  const g = new THREE.BufferGeometry();
  const v = [], n = 7;
  for (let i = 0; i < n; i++) {
    const a1 = (i / n) * Math.PI * 0.5, a2 = ((i + 1) / n) * Math.PI * 0.5;
    v.push(0, 0, 0,
      Math.cos(a1) * s, -Math.sin(a1) * s, 0,
      Math.cos(a2) * s, -Math.sin(a2) * s, 0);
  }
  g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
    color: 0xcfd6de, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false,
  }));
  m.position.set(x, y, z);
  m.rotation.y = rand(0, 6.28);
  return { mesh: m, kind: "web", x, z, update(dt, t) { m.rotation.z = Math.sin(t * 0.5) * 0.03; } };
}

// --- 破れたカーテン（風でゆれる） ----------------------------
function makeCurtain(x, y, z, h) {
  const g = new THREE.PlaneGeometry(0.9, h, 6, 5);
  const base = g.attributes.position.array.slice();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({
    color: C.curtain, transparent: true, opacity: 0.82, side: THREE.DoubleSide,
  }));
  m.position.set(x, y, z);
  return {
    mesh: m, kind: "curtain", x, z,
    update(dt, t) {
      const a = g.attributes.position;
      for (let i = 0; i < a.count; i++) {
        const by = base[i * 3 + 1], bx = base[i * 3];
        const k = (h / 2 - by) / h;             // 下ほど大きくゆれる
        a.array[i * 3 + 2] = Math.sin(t * 1.3 + by * 2.2 + x) * 0.16 * k;
        a.array[i * 3] = bx + Math.sin(t * 0.9 + by) * 0.03 * k;
      }
      a.needsUpdate = true;
    },
  };
}

// --- 天井から垂れた配線 --------------------------------------
function makeWire(x, y, z, len) {
  const g = new THREE.CylinderGeometry(0.012, 0.012, len, 5);
  g.translate(0, -len / 2, 0);
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0x2a2620 }));
  m.position.set(x, y, z);
  return {
    mesh: m, kind: "wire", x, z,
    update(dt, t) { m.rotation.z = Math.sin(t * 0.8 + x) * 0.06; m.rotation.x = Math.cos(t * 0.6 + z) * 0.05; },
  };
}

// --- トイレの表示（男女） ------------------------------------
function makeSign(x, y, z, male) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const c = cv.getContext("2d");
  c.fillStyle = male ? "#2f4f8f" : "#8f2f4f";
  c.fillRect(0, 0, 64, 64);
  c.fillStyle = "#f2f0e8";
  c.font = "bold 40px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
  c.fillText(male ? "男" : "女", 32, 34);
  const tex = new THREE.CanvasTexture(cv);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), new THREE.MeshBasicMaterial({ map: tex }));
  m.position.set(x, y, z);
  return { mesh: m, kind: "sign", x, z };
}

// --- 隠し要素：どこかのトイレに、ひとつだけ ------------------
function makePoop(x, y, z) {
  const g = new THREE.Group();
  const m = new THREE.MeshLambertMaterial({ color: 0x6b4526, emissive: 0x1a0f06, emissiveIntensity: 0.35 });
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.11 - i * 0.028, 0.075, 10), m);
    c.position.y = 0.035 + i * 0.062;
    g.add(c);
  }
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 6), m);
  tip.position.y = 0.225; g.add(tip);
  g.position.set(x, y, z);
  return { mesh: g, kind: "poop", x, z, found: false, update(dt, t) { g.rotation.y = Math.sin(t * 0.6) * 0.15; } };
}
