import * as THREE from "../lib/three.module.js";
import { MeshBuilder, wallWithHoles } from "./meshbuild.js";
import { Colliders, NavGraph, rand, choice, clamp, dist2 } from "./util.js";
import { FLOOR_ROOMS, FLOOR_LABEL, ST_W, ST_E } from "./rooms.js";

export const FLOOR_H = 3.6;
export const WALL_T = 0.22;
export const FLOORS = 4;

// --- 配色（廃墟らしい退色パレット） --------------------------
// 木造校舎。長い年月で黒ずんだ下見板張りと、飴色になった床板。
const C = {
  wall: 0x4b3b2b, wallDark: 0x3f3122, siding: 0x5a4630, post: 0x2f2519,
  plaster: 0x6a6151, wains: 0x4d3a26,          // 内壁：上は古い漆喰、下は腰板
  ceil: 0x453a2c,
  floorHall: 0x4a3520, floorRoom: 0x574227, floorTile: 0x5b5a50,
  board: 0x1f2b25, desk: 0x7a5f3a, metal: 0x414846, locker: 0x58635e,
  ground: 0x453f30, grass: 0x2c3a24, grassDry: 0x565033, concrete: 0x545449,
  fence: 0x3c423e, wood: 0x4c3b25, shelf: 0x5e472e, stone: 0x555549, sakura: 0x3b2934,
  rust: 0x4a3226, stain: 0x362f1e, mold: 0x2f3a28, curtain: 0x6a6454,
  sash: 0x9a927c, tile: 0x2e3138, ivy: 0x2b3a22,   // 窓枠（白木）・瓦・蔦
};

const RZ1 = -14, RZ2 = -4;        // 部屋の奥行き
const HZ1 = -4, HZ2 = 0;          // 廊下
const BX1 = -42, BX2 = 42;        // 校舎の東西端
const EH = { x1: -6, x2: 6, z1: 0, z2: 9 };        // 昇降口
const YARD = { x1: -42, x2: 42, z1: 0, z2: 34 };   // 中庭
const WR = { x: 26, z1: 9, z2: 26, w: 3.2 };       // 渡り廊下
const ANNEX = { x1: 20, x2: 33, z1: 26, z2: 33 };  // 渡り廊下の先の別棟

const FIELD = { x1: -48, x2: 48, z1: 36, z2: 72 };            // 運動場
const GYM = { x1: -46, x2: -18, z1: 40, z2: 64, h: 9.2 };     // 体育館
const GYM_DOOR = { z: 50, w: 2.6 };                            // 体育館の入口（東面）
// 廃校の まわりの 4つの出入り口。
//  人間たちは 毎回 このどれかから 入ってきて、
//  こわくなったら 自分が入ってきた門から 帰っていく。
//  in  … 門のうちがわ（ここへ向かって歩く）
//  out … 門のそとがわ（ここまで行くと 帰った ことになる）
// ============================================================
//  おばけが 行ける ところ かどうか
//   人間は 門の そとまで 歩いて 帰るので、そのまま 落としものを
//   させると、フェンスの そとに 材料が 落ちて 取れなくなる。
//   だから 落としものは かならず この中に 置きなおす。
// ============================================================
const PLAY = [
  { x1: -44, x2: 44, z1: -20, z2: 35.5 },   // 校舎・裏口のあたり・中庭
  { x1: 5, x2: 35, z1: -34, z2: -18 },      // すりぬけでしか行けない 秘密の教室
  { x1: -47.4, x2: 47.4, z1: 34.4, z2: 71.4 },   // 運動場・体育館
  { x1: 19, x2: 34, z1: 25, z2: 34 },       // 渡りろうかの 先の 別棟
];

export function inPlay(x, z) {
  for (const r of PLAY) if (x >= r.x1 && x <= r.x2 && z >= r.z1 && z <= r.z2) return true;
  return false;
}

// はみ出していたら、いちばん近い 中へ 引きもどす
export function clampPlay(x, z) {
  if (inPlay(x, z)) return { x, z };
  let best = null, bd = 1e9;
  for (const r of PLAY) {
    const cx = Math.min(Math.max(x, r.x1 + 1.2), r.x2 - 1.2);
    const cz = Math.min(Math.max(z, r.z1 + 1.2), r.z2 - 1.2);
    const d = (cx - x) * (cx - x) + (cz - z) * (cz - z);
    if (d < bd) { bd = d; best = { x: cx, z: cz }; }
  }
  return best || { x, z };
}

// 校舎に 入る道。人間は このどれかを えらんで 入ってくる。
//  out … 校舎の外がわ、in … 校舎の中がわ
export const WAYS = [
  { id: "front",  name: "昇降口",       out: { x: 0,   z: 12 },  in: { x: 0,   z: 3 } },
  { id: "back",   name: "裏口",         out: { x: -30, z: -17 }, in: { x: -30, z: -11 } },
  { id: "win_e",  name: "割れた窓（東）", out: { x: 21,  z: 2.4 }, in: { x: 21,  z: -2 } },
  { id: "win_w",  name: "割れた窓（西）", out: { x: -21, z: 2.4 }, in: { x: -21, z: -2 } },
];

export const GATES = [
  { id: "s", name: "正門",     in: { x: 0, z: 70 },   out: { x: 0, z: 79 },   axis: "x", at: 72, w: 5.0 },
  { id: "e", name: "東の通用門", in: { x: 45, z: 52 }, out: { x: 55, z: 52 },  axis: "z", at: 48, w: 3.4 },
  { id: "w", name: "西の裏門",  in: { x: -45, z: 68 }, out: { x: -56, z: 68 }, axis: "z", at: -48, w: 3.4 },
  { id: "n", name: "北の勝手口", in: { x: 39, z: 16 }, out: { x: 52, z: 16 },  axis: "z", at: 42, w: 3.0 },
];
export const EXIT_POINT = GATES[0].out;                        // 正門の外（もとからの名前）
export const HUMAN_ENTRY = { x: GATES[0].in.x, z: GATES[0].in.z + 6 };
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
  buildField(ctx);
  buildGym(ctx);
  buildEntranceHall(ctx);
  buildRoof(ctx);
  buildSecret(ctx);
  buildForest(ctx);
  buildMountains(ctx);

  markRemote(ctx);
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
    exit: EXIT_POINT, entry: HUMAN_ENTRY, gates: GATES, ways: WAYS, staticMesh, triangles: mb.triangles,
    bounds: { x1: -52, x2: 52, z1: -36, z2: 82 },
    northOutsideZ: RZ1 - 1.6,
    floors: FLOORS, floorHeight: FLOOR_H,
    roofY: floorY(FLOORS),
    secret: SECRET,
    inSecret(x, z, y) { return x > SECRET.x1 && x < SECRET.x2 && z > SECRET.z1 && z < SECRET.z2 && Math.abs(y - SECRET.y) < 4; },
    floorOf(y) { return Math.max(0, Math.min(FLOORS - 1, Math.round(y / FLOOR_H))); },
    // その位置が階段の吹き抜けの中か（おばけはここで上下に移動できる）
    stairCenterX(x) { return (x < 0 ? (ST_W.x1 + ST_W.x2) : (ST_E.x1 + ST_E.x2)) / 2; },
    stairSurface,
    inStairShaft(x, z) {
      if (z < RZ1 - 0.3 || z > RZ2 + 0.3) return false;
      return (x > ST_W.x1 && x < ST_W.x2) || (x > ST_E.x1 && x < ST_E.x2);
    },
    roomAt(x, z, y) {
      if (z < RZ1 - 1 && x > SECRET.x1 - 3 && x < SECRET.x2 && (y || 0) > SECRET.y - 2) return "？？？";
      if (z > 1.6) {
        if (x > GYM.x1 && x < GYM.x2 && z > GYM.z1 && z < GYM.z2) return "体育館";
        if (z > 34.5) return "運動場";
        if (x > WR.x - WR.w && x < WR.x + WR.w && z > WR.z1 && z < WR.z2) return "渡り廊下";
        if (x > ANNEX.x1 && x < ANNEX.x2 && z > ANNEX.z1 && z < ANNEX.z2) return "部室棟";
        return "中庭";
      }
      if (z >= -0.2 && x > EH.x1 && x < EH.x2) return "昇降口";
      if ((y || 0) > floorY(FLOORS) - 1.2) return "屋上";
      const f = Math.max(0, Math.min(FLOORS - 1, Math.round((y || 0) / FLOOR_H)));
      const label = FLOOR_LABEL[f];
      if (z > HZ1) return label + " 廊下";
      for (const r of FLOOR_ROOMS[f]) if (x >= r.x1 && x <= r.x2) return label + " " + r.name;
      return label + " 廊下";
    },
    isIndoors(x, z, y = 0) {
      if (z < 0.2 && z > RZ1 - 0.2 && x > BX1 && x < BX2) return true;
      // 秘密の通路と忘れられた教室。4階の高さにいるときだけ「屋内」あつかい
      if (y > SECRET.y - 1.5) {
        if (x > 21.4 && x < 24.6 && z < RZ1 + 0.2 && z > RZ1 - 4.4) return true;
        if (x > SECRET.x1 && x < SECRET.x2 && z > SECRET.z1 && z < SECRET.z2) return true;
      }
      return false;
    },
    inGym(x, z) { return x > GYM.x1 && x < GYM.x2 && z > GYM.z1 && z < GYM.z2; },
    gymCeil: GYM.h - 1.0,
    gym: { x1: GYM.x1, x2: GYM.x2, z1: GYM.z1, z2: GYM.z2 },
    inPlay, clampPlay,
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
  //  木造校舎らしく、下見板張り＋柱＋格子窓＋ひさし で仕上げる
  const north = windowRow(BX1 + 2, BX2 - 2, 3.0, 4.6, y0 + 0.95, y0 + 2.55)
    .filter((hh) => f > 0 || hh.b < -32.4 || hh.a > -27.6);        // 1階の裏口ぶんは あけておく
  if (f === 0) north.push({ a: -32.4, b: -27.6, y1: y0, y2: y0 + 2.5 });   // 裏口
  wallWithHoles(mb, col, { axis: "x", fixed: RZ1, from: BX1, to: BX2, y1: y0, y2: y1, thick: WALL_T, color: C.wall, holes: north });
  siding(mb, "x", RZ1, BX1, BX2, y0, y1, -1, 0.42, north);
  posts(mb, "x", RZ1, BX1, BX2, y0, y1, -1, 4.6, north);
  for (const h of north) {
    if (f === 0 && h.a === -32.4) continue;             // 裏口は 戸が あいたまま
    sash(mb, "x", RZ1 - 0.06, h.a, h.b, h.y1, h.y2, 2);
  }
  eave(mb, "x", RZ1, BX1, BX2, y0 + 2.78, 0.72, -1);

  const BROKEN = [[19.4, 22.6], [-22.6, -19.4]];   // 割れた窓（1階・床まで あいている）
  const south = windowRow(BX1 + 2, BX2 - 2, 3.2, 4.6, y0 + 0.95, y0 + 2.6)
    .filter((h) => f > 0 || h.b < -7.5 || h.a > 7.5)
    // 割れた窓に かぶる ふつうの窓は 消す。
    //  残したままだと 窓の下の「腰壁」が 開口を ふさいで しまう
    .filter((h) => f > 0 || !BROKEN.some((p) => h.b > p[0] - 0.05 && h.a < p[1] + 0.05));
  if (f === 0) {
    south.push({ a: -3, b: 3, y1: y0, y2: y0 + 2.5 });              // 昇降口へ
    // 割れた窓。枠ごと外れていて、床まで あいている
    south.push({ a: 19.4, b: 22.6, y1: y0, y2: y0 + 2.55 });
    south.push({ a: -22.6, b: -19.4, y1: y0, y2: y0 + 2.55 });
  }
  wallWithHoles(mb, col, { axis: "x", fixed: HZ2, from: BX1, to: BX2, y1: y0, y2: y1, thick: WALL_T, color: C.wall, holes: south });
  siding(mb, "x", HZ2, BX1, BX2, y0, y1, 1, 0.42, south);
  posts(mb, "x", HZ2, BX1, BX2, y0, y1, 1, 4.6, south);
  for (const h of south) {
    if (f === 0 && h.a === -3) continue;                 // 昇降口は枠なし
    if (f === 0 && (h.a === 19.4 || h.a === -22.6)) continue;   // 割れた窓は 枠ごと外れている
    sash(mb, "x", HZ2 + 0.06, h.a, h.b, h.y1, h.y2, 2);
  }
  eave(mb, "x", HZ2, BX1, BX2, y0 + 2.84, 0.78, 1);

  // 1階：割れた窓と 裏口の しるし
  if (f === 0) {
    for (const wx of [21, -21]) {
      // 外れた枠が ころがっている
      mb.box(wx + rand(-0.8, 0.8), 0.08, HZ2 + rand(0.7, 1.6), 1.5, 0.09, 0.14, C.sash,
        { jitter: 0.2, rotY: rand(0, 3.14) });
      mb.box(wx + rand(-0.8, 0.8), 0.07, HZ2 + rand(0.7, 1.6), 0.12, 0.08, 1.2, C.sash,
        { jitter: 0.2, rotY: rand(0, 3.14) });
      // 割れたガラスの かけら
      for (let i = 0; i < 9; i++) {
        mb.box(wx + rand(-1.4, 1.4), 0.05, HZ2 + rand(0.3, 2.0), rand(0.1, 0.26), 0.02, rand(0.1, 0.26),
          0xa8c8d8, { jitter: 0.4, rotY: rand(0, 3.14) });
      }
      // 窓ぎわに 残った ぎざぎざのガラス
      for (let i = 0; i < 5; i++) {
        mb.box(wx - 1.4 + i * 0.7, 2.5, HZ2 + 0.05, 0.4, 0.22, 0.05, 0xb8d8e8, { jitter: 0.4 });
      }
      // ふみ台がわりの コンクリブロック
      mb.box(wx, 0.14, HZ2 + 0.7, 0.7, 0.28, 0.5, C.concrete, { jitter: 0.12, rotY: rand(-0.3, 0.3) });
    }
    // 裏口の 開きっぱなしの ドア
    mb.box(-27.4, 1.25, RZ1 - 0.1, 0.08, 2.4, 1.9, C.wood, { jitter: 0.14, rotY: 0.5 });
    mb.box(-30, 0.06, RZ1 - 1.1, 2.6, 0.1, 1.8, C.concrete, { jitter: 0.16 });
  }

  // 渡り廊下へ出る口（2階のみ）
  wallWithHoles(mb, col, { axis: "z", fixed: BX1, from: RZ1, to: HZ2, y1: y0, y2: y1, thick: WALL_T, color: C.wall });
  wallWithHoles(mb, col, { axis: "z", fixed: BX2, from: RZ1, to: HZ2, y1: y0, y2: y1, thick: WALL_T, color: C.wall });
  siding(mb, "z", BX1, RZ1, HZ2, y0, y1, -1);
  siding(mb, "z", BX2, RZ1, HZ2, y0, y1, 1);
  posts(mb, "z", BX1, RZ1, HZ2, y0, y1, -1, 3.4);
  posts(mb, "z", BX2, RZ1, HZ2, y0, y1, 1, 3.4);

  // 下のほうの階ほど、蔦がびっしり這っている
  if (f < 2) {
    const dens = f === 0 ? 40 : 20;
    ivy(mb, "x", RZ1, BX1 + 1, BX2 - 1, y0, FLOOR_H, -1, dens, north);
    ivy(mb, "x", HZ2, BX1 + 1, -9, y0, FLOOR_H, 1, dens * 0.6, south);
    ivy(mb, "x", HZ2, 9, BX2 - 1, y0, FLOOR_H, 1, dens * 0.6, south);
    ivy(mb, "z", BX1, RZ1 + 1, HZ2 - 1, y0, FLOOR_H, -1, dens * 0.5);
    ivy(mb, "z", BX2, RZ1 + 1, HZ2 - 1, y0, FLOOR_H, 1, dens * 0.5);
  }

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
  wallWithHoles(mb, col, { axis: "x", fixed: RZ2, from: BX1, to: BX2, y1: y0, y2: y1, thick: WALL_T, color: C.plaster, holes });
  // 腰板（廊下がわ・教室がわ）と、ぐるりの回り縁。
  //  入口の前は切りぬいて、ちゃんと通れるように見せる
  for (const side of [-1, 1]) wainscot(mb, "x", RZ2, BX1, BX2, y0, side, holes);
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
    mb.box(x, y0 + 0.55, HZ1 + 0.45, 0.32, 1.1, 0.32, 0x8a2f22, { jitter: 0.14 });
    spawnSpots.push({ x: x + rand(-3, 3), z: rand(HZ1 + 0.9, HZ2 - 0.9), y: y0, floor: f });
  }
  for (let x = BX1 + 3; x < BX2 - 3; x += 12) lightSpots.push({ x, y: y1 - 0.45, z: -2, floor: f });
  decorateCorridor(ctx, f, y0, decay);
}

// ============================================================
//  階段（吹き抜けでつながる）
// ============================================================
function buildStairs(ctx, r, f, y0) {
  const { mb, col, spawnSpots } = ctx;
  const cx = (r.x1 + r.x2) / 2;
  const zS = RZ2 - 1.4;              // 手前（廊下側）の踊り場
  const zN = RZ1 + 1.3;              // 奥（北側）の折り返し
  const half = FLOOR_H / 2;
  const N = 9;                        // 1本あたりの段数

  // 折り返しの踊り場（奥）
  mb.slab(r.x1 + 0.6, zN - 1.4, r.x2 - 0.6, zN + 0.2, y0 + half, 0.24, C.concrete, { jitter: 0.06 });
  col.add(r.x1 + 0.6, zN - 1.4, r.x2 - 0.6, zN + 0.2, y0, y0 + half, "stair");

  {
    // 上り①：手前 → 奥（西半分）
    for (let i = 0; i < N; i++) {
      const t = (i + 1) / N;
      const z = zS - (zS - zN) * (i / N);
      const y = y0 + half * t;
      mb.box(cx - 1.65, y - 0.09, z, 3.0, 0.18, (zS - zN) / N + 0.06, C.concrete, { jitter: 0.07 });
      col.add(cx - 3.15, z - 0.4, cx - 0.15, z + 0.4, y0, y, "stair");
    }
    // 上り②：奥 → 手前（東半分）
    for (let i = 0; i < N; i++) {
      const t = (i + 1) / N;
      const z = zN + (zS - zN) * (i / N);
      const y = y0 + half + half * t;
      mb.box(cx + 1.65, y - 0.09, z, 3.0, 0.18, (zS - zN) / N + 0.06, C.concrete, { jitter: 0.07 });
      col.add(cx + 0.15, z - 0.4, cx + 3.15, z + 0.4, y0, y, "stair");
    }
    // 中央の仕切り壁（低め）
    mb.box(cx, y0 + half * 0.6, (zS + zN) / 2, 0.18, half * 1.2, zS - zN - 1.0, C.wallDark, { jitter: 0.06 });
    // 手すり
    for (const sx of [-3.2, -0.35, 0.35, 3.2]) {
      for (let i = 0; i <= N; i += 2) {
        const t = i / N;
        const west = sx < 0;
        const z = west ? zS - (zS - zN) * t : zN + (zS - zN) * t;
        const y = y0 + (west ? half * t : half + half * t);
        mb.box(cx + sx, y + 0.5, z, 0.06, 1.0, 0.06, C.metal, { jitter: 0.12 });
      }
    }
  }
  spawnSpots.push({ x: cx, z: zS, y: y0, floor: f });
}

// 階段のどのあたりにいるかで、床の高さを返す（おばけが自然に上り下りするため）
export function stairSurface(x, z, cx) {
  const zS = RZ2 - 1.4, zN = RZ1 + 1.3;
  const t = Math.max(0, Math.min(1, (zS - z) / (zS - zN)));
  const half = FLOOR_H / 2;
  return x < cx ? half * t : half + half * (1 - t);
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
  // 玄関まわりも板張りに
  const ehDoor = [{ a: -2.6, b: 2.6, y1: 0, y2: 2.6 }];
  siding(mb, "z", EH.x1, EH.z1, EH.z2, 0, FLOOR_H, -1);
  siding(mb, "z", EH.x2, EH.z1, EH.z2, 0, FLOOR_H, 1);
  siding(mb, "x", EH.z2, EH.x1, EH.x2, 0, FLOOR_H, 1, 0.42, ehDoor);
  posts(mb, "z", EH.x1, EH.z1, EH.z2, 0, FLOOR_H, -1, 3.0);
  posts(mb, "z", EH.x2, EH.z1, EH.z2, 0, FLOOR_H, 1, 3.0);

  // ひさし：木の垂木のうえに瓦をふいた、こしのある屋根
  tiled(mb, EH.x1 - 0.4, EH.z1, EH.x2 + 0.4, EH.z2 + 0.4, FLOOR_H + 0.4, 0.4, C.wood, 4);
  mb.box(0, FLOOR_H + 0.1, EH.z2 + 1.5, 7.4, 0.2, 2.8, C.wood, { jitter: 0.06 });
  for (let x = -3.4; x <= 3.4; x += 0.55) {                 // 垂木
    mb.box(x, FLOOR_H - 0.06, EH.z2 + 1.5, 0.1, 0.12, 2.8, C.post, { jitter: 0.14 });
  }
  for (let x = -3.6; x <= 3.6; x += 0.42) {                 // 瓦
    mb.box(x, FLOOR_H + 0.26, EH.z2 + 1.5, 0.36, 0.12, 2.9, C.tile, { jitter: 0.18 });
  }
  mb.box(0, FLOOR_H + 0.36, EH.z2 + 0.15, 7.6, 0.2, 0.34, C.tile, { jitter: 0.1 });   // 棟
  for (const dx of [-3.0, 3.0]) mb.box(dx, (FLOOR_H - 0.1) / 2, EH.z2 + 2.4, 0.22, FLOOR_H - 0.1, 0.22, C.post);
  for (let x = -14; x <= 14; x += 7) lightSpots.push({ x, y: FLOOR_H - 0.5, z: 4.5, floor: 0 });
  rooms.push({ id: "entrance", name: "昇降口", floor: 0, cx: 0, cz: 4.5, y: 0, x1: EH.x1, x2: EH.x2, z1: EH.z1, z2: EH.z2, kind: "entrance", label: "昇降口" });
}

function buildRoof(ctx) {
  const { mb, col, rooms, spawnSpots, props, lightSpots } = ctx;
  const top = floorY(FLOORS);

  // 床（歩けるように、当たり判定つきの手すりで囲む）
  tiled(mb, BX1, RZ1, BX2, HZ2, top, 0.34, 0x63605a, 7);
  grime(mb, BX1 + 2, RZ1 + 1, BX2 - 2, HZ2 - 1, top - 0.02, 0.55);

  // 低い立ち上がり＋その上の金網フェンス
  const fenceH = 1.9;
  const edges = [[BX1, RZ1, BX2, RZ1], [BX1, HZ2, BX2, HZ2]];
  for (const e of edges) {
    mb.box((e[0] + e[2]) / 2, top + 0.35, e[1], e[2] - e[0] + 0.6, 0.7, 0.34, 0x7a7469, { jitter: 0.06 });
    col.add(Math.min(e[0], e[2]) - 0.3, e[1] - 0.3, Math.max(e[0], e[2]) + 0.3, e[1] + 0.3, top, top + fenceH, "wall");
    for (let x = e[0]; x <= e[2]; x += 2.2) mb.box(x, top + 1.3, e[1], 0.09, 1.3, 0.09, C.fence, { jitter: 0.12 });
    mb.wall(e[0], e[1], e[2], e[1], top + 0.7, top + fenceH, 0.05, 0x4a5057, { jitter: 0.07 });
    mb.box((e[0] + e[2]) / 2, top + fenceH, e[1], e[2] - e[0], 0.1, 0.14, C.metal, { jitter: 0.05 });
  }
  for (const x of [BX1, BX2]) {
    mb.box(x, top + 0.35, (RZ1 + HZ2) / 2, 0.34, 0.7, HZ2 - RZ1, 0x7a7469, { jitter: 0.06 });
    col.add(x - 0.3, RZ1, x + 0.3, HZ2, top, top + fenceH, "wall");
    for (let z = RZ1; z <= HZ2; z += 2.2) mb.box(x, top + 1.3, z, 0.09, 1.3, 0.09, C.fence, { jitter: 0.12 });
    mb.wall(x, RZ1, x, HZ2, top + 0.7, top + fenceH, 0.05, 0x4a5057, { jitter: 0.07 });
  }

  // 階段室から屋上へ出る小屋（東西とも）
  for (const s of [ST_W, ST_E]) {
    const cx = (s.x1 + s.x2) / 2;
    const hx1 = cx - 2.2, hx2 = cx + 2.2, hz1 = RZ2 - 3.4, hz2 = RZ2 - 0.6;
    wallWithHoles(mb, col, { axis: "x", fixed: hz1, from: hx1, to: hx2, y1: top, y2: top + 2.6, thick: 0.22, color: C.wall,
      holes: [{ a: cx - 0.9, b: cx + 0.9, y1: top, y2: top + 2.1 }] });
    wallWithHoles(mb, col, { axis: "x", fixed: hz2, from: hx1, to: hx2, y1: top, y2: top + 2.6, thick: 0.22, color: C.wall });
    wallWithHoles(mb, col, { axis: "z", fixed: hx1, from: hz1, to: hz2, y1: top, y2: top + 2.6, thick: 0.22, color: C.wall });
    wallWithHoles(mb, col, { axis: "z", fixed: hx2, from: hz1, to: hz2, y1: top, y2: top + 2.6, thick: 0.22, color: C.wall });
    mb.slab(hx1 - 0.3, hz1 - 0.3, hx2 + 0.3, hz2 + 0.3, top + 2.9, 0.3, 0x55524b, { jitter: 0.05 });
    lightSpots.push({ x: cx, y: top + 2.3, z: hz1 - 0.6, floor: FLOORS });
  }

  // 給水塔
  mb.box(28, top + 4.4, -9, 3.2, 2.6, 3.2, 0x6e7a80, { jitter: 0.05 });
  col.add(26.4, -10.6, 29.6, -7.4, top, top + 6, "wall");
  for (const dx of [-1.3, 1.3]) for (const dz of [-1.3, 1.3]) mb.box(28 + dx, top + 1.7, -9 + dz, 0.2, 3.4, 0.2, 0x4d5459);
  // はしご
  for (let i = 0; i < 8; i++) mb.box(26.2, top + 0.5 + i * 0.4, -9, 0.7, 0.06, 0.06, C.metal, { jitter: 0.1 });

  // ベンチと、置きっぱなしの物
  for (const b2 of [[-20, -9], [8, -6], [-6, -11]]) {
    mb.box(b2[0], top + 0.42, b2[1], 2.0, 0.1, 0.5, C.wood, { jitter: 0.1 });
    for (const s2 of [-0.8, 0.8]) mb.box(b2[0] + s2, top + 0.2, b2[1], 0.1, 0.44, 0.4, C.metal);
    col.add(b2[0] - 1, b2[1] - 0.3, b2[0] + 1, b2[1] + 0.3, top, top + 0.5, "furn");
    spawnSpots.push({ x: b2[0] + 1.6, z: b2[1] + 1, y: top, floor: FLOORS , roof: true });
  }
  // 水たまりと落ち葉
  for (let i = 0; i < 60; i++) {
    mb.box(rand(BX1 + 2, BX2 - 2), top + 0.02, rand(RZ1 + 1, HZ2 - 1), rand(0.3, 1.2), 0.02, rand(0.3, 1.2),
      choice([0x4a4438, 0x3a4a44, 0x5c4433]), { jitter: 0.4, rotY: rand(0, 3.14) });
  }
  for (let i = 0; i < 10; i++) spawnSpots.push({ x: rand(BX1 + 3, BX2 - 3), z: rand(RZ1 + 2, HZ2 - 2), y: top, floor: FLOORS , roof: true });
  props.push(makeCobweb(BX1 + 1.5, top + 1.5, RZ1 + 1.5, 1.1));

  rooms.push({ id: "roof", name: "屋上", floor: FLOORS, cx: 0, cz: -7, y: top,
    x1: BX1, x2: BX2, z1: RZ1, z2: HZ2, kind: "roof", label: "屋上" });
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
    // 木の個室。仕切りと、あけっぱなしの引き戸が奥にならぶ
    const DOOR = 0x5a4831, PART = 0x6a563a;
    for (let i = 0; i <= n; i++) {
      const x = r.x1 + 0.9 + i * 1.5;
      mb.box(x - 0.75, y0 + 1.1, RZ1 + 2.2, 0.09, 2.2, 2.4, PART, { jitter: 0.16 });
      // 仕切りの板目
      for (let k = 0; k < 5; k++) {
        mb.box(x - 0.71, y0 + 0.35 + k * 0.42, RZ1 + 2.2, 0.02, 0.05, 2.35, 0x483a26, { jitter: 0.3 });
      }
      col.add(x - 0.8, RZ1 + 1.0, x - 0.7, RZ1 + 3.4, y0, y0 + 2.2, "wall");
      if (i < n) {
        mb.box(x, y0 + 0.3, RZ1 + 1.6, 0.55, 0.6, 0.85, 0xd8d6cc, { jitter: 0.06 });   // 便器
        mb.box(x, y0 + 0.02, RZ1 + 2.6, 1.3, 0.05, 1.4, 0x6b5a3c, { jitter: 0.22 });   // すのこ
        // 戸（半びらき・ぜんぶ閉まっている・外れている、のどれか）
        const st = Math.random();
        if (st < 0.4) {
          mb.box(x, y0 + 1.05, RZ1 + 3.36, 1.36, 2.1, 0.07, DOOR, { jitter: 0.18 });   // 閉まっている
          mb.box(x + 0.5, y0 + 1.05, RZ1 + 3.3, 0.12, 0.16, 0.06, 0x8a7a52);           // 取っ手
        } else if (st < 0.78) {
          mb.box(x - 0.55, y0 + 1.05, RZ1 + 3.1, 0.07, 2.1, 1.3, DOOR,
            { jitter: 0.18, rotY: 0.6 });                                              // 半びらき
        } else {
          mb.box(x, y0 + 0.06, RZ1 + 4.1, 1.3, 0.09, 2.0, DOOR, { jitter: 0.2, rotY: rand(-0.3, 0.3) });
        }
      }
    }
    // 入口のすぐ内がわに、目かくしの板（通り道はあけておく）
    mb.box(r.x2 - 0.42, y0 + 1.0, RZ2 - 1.5, 0.1, 2.0, 2.6, PART, { jitter: 0.16 });
    col.add(r.x2 - 0.5, RZ2 - 2.8, r.x2 - 0.34, RZ2 - 0.2, y0, y0 + 2.0, "wall");
    // 床のすのこ（入口から奥へ、まっすぐ1本）
    for (let z = RZ2 - 1.2; z > RZ1 + 3.8; z -= 0.34) {
      mb.box(cx, y0 + 0.04, z, 1.1, 0.06, 0.22, 0x6b5a3c, { jitter: 0.26 });
    }
    // 入口は RZ2 の壁のまんなか（cx ± 0.9）にある。
    // そこをふさがないよう、手洗いも小便器も「横の壁」に寄せて並べる。
    const wallX = r.x1 + 0.32;                 // 西がわの壁ぎわ
    if (male) {
      for (let i = 0; i < 3; i++) {
        const z = RZ2 - 2.3 - i * 1.1;
        mb.box(wallX, y0 + 0.85, z, 0.34, 0.9, 0.42, 0xdedad0, { jitter: 0.05 });
        col.add(wallX - 0.2, z - 0.24, wallX + 0.22, z + 0.24, y0, y0 + 1.0, "furn");
      }
      // 足もとの受け
      mb.box(wallX, y0 + 0.06, RZ2 - 3.4, 0.44, 0.12, 3.0, 0xc4c2b6, { jitter: 0.06 });
    } else {
      const z0 = RZ2 - 2.2, z1b = RZ2 - 5.2;
      mb.box(wallX + 0.06, y0 + 0.82, (z0 + z1b) / 2, 0.6, 0.16, z0 - z1b, 0xc9c6ba, { jitter: 0.05 });
      col.add(wallX - 0.24, z1b, wallX + 0.36, z0, y0, y0 + 0.9, "furn");
      for (let i = 0; i < 3; i++) {            // 蛇口
        mb.box(wallX - 0.06, y0 + 0.95, z0 - 0.5 - i * 1.0, 0.1, 0.12, 0.1, 0x6f6a58, { jitter: 0.12 });
      }
    }
    // 鏡（割れていることもある）。手洗いと同じ、横の壁に
    mb.box(wallX - 0.14, y0 + 1.75, RZ2 - 3.6, 0.07, 0.9, 2.6,
      Math.random() < decay ? 0x3a3038 : 0x2a3138, { jitter: 0.1 });
    // 入口のまわりは、なにも置かない（通れることを守る）
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

// その高さで、あな（窓やドア）にじゃまされずに板を張れる範囲を返す
//  これをしないと、通れるはずの入口の上に板が張られ、壁に見えてしまう
function freeSpans(from, to, y, holes) {
  const cut = (holes || [])
    .filter((h) => y > (h.y1 === undefined ? -1e9 : h.y1) - 0.02 && y < (h.y2 === undefined ? 1e9 : h.y2) + 0.02)
    .map((h) => [Math.min(h.a, h.b), Math.max(h.a, h.b)])
    .sort((p, q) => p[0] - q[0]);
  const out = [];
  let cur = from;
  for (const [a, b] of cut) {
    if (b <= cur) continue;
    if (a > cur) out.push([cur, Math.min(a, to)]);
    cur = Math.max(cur, b);
    if (cur >= to) break;
  }
  if (cur < to) out.push([cur, to]);
  return out.filter((s) => s[1] - s[0] > 0.05);
}

// 下見板張り：壁の面に、横板の影を何本も走らせる（あなは避ける）
function siding(mb, axis, fixed, from, to, y1, y2, side, pitch = 0.42, holes = null) {
  const off = 0.13 * side;
  for (let y = y1 + pitch; y < y2 - 0.05; y += pitch) {
    for (const [a, b] of freeSpans(from, to, y, holes)) {
      if (axis === "x") mb.box((a + b) / 2, y, fixed + off, b - a, 0.055, 0.05, C.siding, { jitter: 0.4 });
      else mb.box(fixed + off, y, (a + b) / 2, 0.05, 0.055, b - a, C.siding, { jitter: 0.4 });
    }
  }
}

// 柱：板張りのあいだに、たてに走る太い木（あなの前には立てない）
function posts(mb, axis, fixed, from, to, y1, y2, side, pitch = 4.6, holes = null) {
  const off = 0.16 * side;
  for (let p = from + pitch / 2; p < to; p += pitch) {
    // あなにかかる柱は、あなの上下に残った壁ぶんだけにする
    const blocked = (holes || []).some((h) => p > Math.min(h.a, h.b) - 0.2 && p < Math.max(h.a, h.b) + 0.2);
    if (blocked) continue;
    if (axis === "x") mb.box(p, (y1 + y2) / 2, fixed + off, 0.26, y2 - y1, 0.08, C.post, { jitter: 0.18 });
    else mb.box(fixed + off, (y1 + y2) / 2, p, 0.08, y2 - y1, 0.26, C.post, { jitter: 0.18 });
  }
}

// 腰板と回り縁：ドアの前は切りぬく
function wainscot(mb, axis, fixed, from, to, y0, side, holes) {
  const off = 0.13 * side;
  for (const [a, b] of freeSpans(from, to, y0 + 0.5, holes)) {
    if (axis === "x") {
      mb.box((a + b) / 2, y0 + 0.52, fixed + off, b - a, 1.04, 0.06, C.wains, { jitter: 0.16 });
      mb.box((a + b) / 2, y0 + 1.08, fixed + off * 1.15, b - a, 0.07, 0.09, C.post, { jitter: 0.1 });
    } else {
      mb.box(fixed + off, y0 + 0.52, (a + b) / 2, 0.06, 1.04, b - a, C.wains, { jitter: 0.16 });
      mb.box(fixed + off * 1.15, y0 + 1.08, (a + b) / 2, 0.09, 0.07, b - a, C.post, { jitter: 0.1 });
    }
  }
}

// 蔦も、窓やドアの前には垂らさない
function ivyFree(holes, p, y) {
  return !(holes || []).some((h) => p > Math.min(h.a, h.b) - 0.2 && p < Math.max(h.a, h.b) + 0.2 &&
    y > (h.y1 === undefined ? -1e9 : h.y1) - 0.2 && y < (h.y2 === undefined ? 1e9 : h.y2) + 0.2);
}

// 窓わく：白木の枠と、たて・よこの桟（格子窓）
function sash(mb, axis, fixed, a, b, y1, y2, mullions = 2) {
  const t = 0.09, d = 0.16;
  const put = (p, y, len, hh) => {
    if (axis === "x") mb.box(p, y, fixed, len, hh, d, C.sash, { jitter: 0.14 });
    else mb.box(fixed, y, p, d, hh, len, C.sash, { jitter: 0.14 });
  };
  const mid = (a + b) / 2, wlen = b - a;
  put(mid, y1 + t / 2, wlen, t);            // 下枠
  put(mid, y2 - t / 2, wlen, t);            // 上枠
  put(a + t / 2, (y1 + y2) / 2, t, y2 - y1);   // 左
  put(b - t / 2, (y1 + y2) / 2, t, y2 - y1);   // 右
  // たての桟
  for (let i = 1; i <= mullions; i++) {
    put(a + (wlen * i) / (mullions + 1), (y1 + y2) / 2, 0.055, y2 - y1);
  }
  // よこの桟（腰高のところに1本）
  put(mid, y1 + (y2 - y1) * 0.52, wlen, 0.055);
}

// ひさし：窓の上に張り出す小さな木の屋根
function eave(mb, axis, fixed, from, to, y, depth, side) {
  const off = (depth / 2 + 0.16) * side;
  if (axis === "x") {
    mb.box((from + to) / 2, y, fixed + off, to - from, 0.2, depth, C.wood, { jitter: 0.14 });
    // 瓦を1枚ずつ並べて、へりのぎざぎざを出す
    for (let p = from; p < to; p += 0.44) {
      mb.box(p, y + 0.19, fixed + off * 1.04, 0.38, 0.13, depth * 0.96, C.tile, { jitter: 0.2 });
    }
    // 垂木の小口
    for (let p = from; p < to; p += 0.9) {
      mb.box(p, y - 0.16, fixed + off * 1.1, 0.11, 0.14, depth * 0.5, C.post, { jitter: 0.16 });
    }
  } else {
    mb.box(fixed + off, y, (from + to) / 2, depth, 0.2, to - from, C.wood, { jitter: 0.14 });
    for (let p = from; p < to; p += 0.44) {
      mb.box(fixed + off * 1.04, y + 0.19, p, depth * 0.96, 0.13, 0.38, C.tile, { jitter: 0.2 });
    }
  }
}

// 蔦：壁をはい上がる葉のかたまり
function ivy(mb, axis, fixed, from, to, y1, h, side, density = 26, holes = null) {
  const off = 0.15 * side;
  for (let i = 0; i < density; i++) {
    const p = rand(from, to);
    const yy = y1 + Math.pow(Math.random(), 1.7) * h;
    if (!ivyFree(holes, p, yy)) continue;
    const s = rand(0.3, 0.95) * (1 - (yy - y1) / h * 0.5);
    if (axis === "x") mb.box(p, yy, fixed + off, s, s * rand(0.7, 1.5), 0.06, C.ivy, { jitter: 0.5, rotY: rand(0, 3.14) });
    else mb.box(fixed + off, yy, p, 0.06, s * rand(0.7, 1.5), s, C.ivy, { jitter: 0.5 });
  }
}

// まんなかを中心に、左右そろえて 同じ数の窓をならべる。
//  端から数える windowRow とちがって、両はしの余白が そろうので
//  4つの壁で 窓の位置が きれいにそろう。
function windowGrid(from, to, count, w, y1, y2) {
  const span = to - from;
  const pitch = span / count;
  const holes = [];
  for (let i = 0; i < count; i++) {
    const c = from + pitch * (i + 0.5);
    holes.push({ a: c - w / 2, b: c + w / 2, y1, y2 });
  }
  return holes;
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
// それぞれの湧き場所が「どれくらい へんぴか」を決める
function markRemote(ctx) {
  const { spawnSpots } = ctx;
  for (const s of spawnSpots) {
    let far = 0;
    const x = s.x, z = s.z, f = s.floor || 0;

    if (s.rich) {
      far = 1.0;                                   // 秘密の教室：すりぬけでしか行けない
    } else if (z > FIELD.z1) {
      // 運動場：まんなか（トラック）は ふつう、すみへ行くほど へんぴ
      const ex = Math.min(x - FIELD.x1, FIELD.x2 - x) / ((FIELD.x2 - FIELD.x1) / 2);
      const ez = Math.min(z - FIELD.z1, FIELD.z2 - z) / ((FIELD.z2 - FIELD.z1) / 2);
      far = 1 - Math.min(1, Math.min(ex, ez) * 1.3);
      // 四すみは とくに へんぴ
      if (Math.min(ex, ez) < 0.16) far = Math.max(far, 0.92);
      // 体育館の裏（校舎から見えない南がわ）
      if (x > GYM.x1 - 3 && x < GYM.x2 + 3 && z > GYM.z2) far = Math.max(far, 0.9);
    } else if (z > 1.6) {
      // 中庭：校舎ぎわは ふつう、フェンスぎわほど へんぴ
      const ex = Math.min(x - YARD.x1, YARD.x2 - x) / ((YARD.x2 - YARD.x1) / 2);
      far = Math.max(0, Math.min(1, (z - 6) / 26) * 0.55 + (1 - Math.min(1, ex * 1.4)) * 0.6);
    } else {
      // 校舎のなか：上の階ほど、そして 東西のはしの部屋ほど へんぴ
      far = f * 0.17 + (Math.abs(x) / 42) * 0.4;
      if (f >= 3) far += 0.14;                     // 4階は だれも上がってこない
    }
    // 屋上は とくべつ
    if (s.roof) far = Math.max(far, 0.88);
    s.far = Math.max(0, Math.min(1, far));
  }
}

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
  // 中庭の門を出たところ
  for (let x = -36; x <= 36; x += 9) nav.addNode(x, 37.2, 0, "運動場", 0);
  for (const z of [33, 35]) nav.addNode(0, z, 0, "校門", 0);
  // 運動場（体育館の中は避ける）
  for (let x = FIELD.x1 + 5; x <= FIELD.x2 - 5; x += 7)
    for (let z = 41; z <= FIELD.z2 - 4; z += 6.5) {
      if (x > GYM.x1 - 2.5 && x < GYM.x2 + 2.5 && z > GYM.z1 - 2.5 && z < GYM.z2 + 2.5) continue;
      nav.addNode(x, z, 0, "運動場", 0);
    }
  // 体育館の入口の前と中
  nav.addNode(GYM.x2 + 2.4, GYM_DOOR.z, 0, "運動場", 0);
  nav.addNode(GYM.x2 - 1.6, GYM_DOOR.z, 0, "体育館", 0.24);
  for (let x = GYM.x1 + 6; x < GYM.x2 - 2; x += 6)
    for (let z = GYM.z1 + 6; z < GYM.z2 - 7; z += 6) nav.addNode(x, z, 0, "体育館", 0.24);
  // 屋上
  for (let x = BX1 + 6; x <= BX2 - 6; x += 7) {
    for (const z of [-11, -6]) nav.addNode(x, z, FLOORS, "屋上", floorY(FLOORS));
  }
  for (const s of [ST_W, ST_E]) nav.addNode((s.x1 + s.x2) / 2, RZ2 - 2.6, FLOORS, "屋上", floorY(FLOORS));

  // 正門とその外
  // 校舎の 入りくち4つ：外 → 入口 → 中 を まっすぐ つなぐ。
  //  こうしておくと、道さがしが かならず ここを通れる
  for (const way of WAYS) {
    const a2 = nav.addNode(way.out.x, way.out.z, 0, way.name + "（外）", 0);
    const b2 = nav.addNode((way.out.x + way.in.x) / 2, (way.out.z + way.in.z) / 2, 0, way.name, 0);
    const c2 = nav.addNode(way.in.x, way.in.z, 0, way.name + "（中）", 0);
    nav.link(a2, b2); nav.link(b2, c2);
  }

  // 4つの門：うちがわ → 門のところ → そとがわ を つなぐ
  for (const g of GATES) {
    const dx = g.out.x - g.in.x, dz = g.out.z - g.in.z;
    const len = Math.hypot(dx, dz) || 1;
    let prev = -1;
    for (let k = -1; k <= 4; k++) {
      const t = k / 4;
      const n = nav.addNode(g.in.x + (dx / len) * (len * t), g.in.z + (dz / len) * (len * t), 0, g.name, 0);
      if (prev >= 0) nav.link(prev, n);
      prev = n;
    }
  }
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
  for (let f = 0; f < FLOORS; f++) {
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
  // 中庭も、もう手入れされていない。校舎から離れるほど草が出てくる
  for (let x = YARD.x1; x < YARD.x2; x += 4)
    for (let z = 1.6; z < YARD.z2; z += 4) {
      const e = Math.min(1, Math.max(0, (z - 3) / 26));
      const c = new THREE.Color(C.ground).lerp(new THREE.Color(C.grass), clamp(e * 0.55 + rand(-0.14, 0.14), 0, 1));
      mb.slab(x, z, Math.min(x + 4, YARD.x2), Math.min(z + 4, YARD.z2), 0.0, 0.3, c.getHex(), { jitter: 0.28 });
    }
  for (let x = BX1; x < BX2; x += 6)
    mb.slab(x, 0, Math.min(x + 6, BX2), 2.4, 0.04, 0.2, C.concrete, { jitter: 0.22 });
  // ひび割れから伸びた雑草。校舎ぎわと、フェンスぎわに多い
  const YQ = ctx.opts && ctx.opts.grass !== undefined ? ctx.opts.grass : 1;
  for (let i = 0; i < 900 * YQ; i++) {
    const x = rand(YARD.x1 + 0.5, YARD.x2 - 0.5), z = rand(2.6, YARD.z2 - 0.5);
    const nearWall = z < 4.6 ? 1 : 0;
    const nearFence = z > YARD.z2 - 4 || x < YARD.x1 + 4 || x > YARD.x2 - 4 ? 1 : 0;
    const e = Math.min(1, (z - 2) / 30) * 0.7 + nearWall * 0.5 + nearFence * 0.6;
    if (Math.random() > 0.1 + e * 0.75) continue;
    mb.tuft(x, z, 0.04, rand(0.12, 0.34) + e * rand(0.1, 0.5), 0x334523, choice([0x53603a, 0x625a3c]), 3, 0.2);
  }

  fence(mb, col, YARD.x1, 0.5, YARD.x1, YARD.z2);
  // 東の石垣に、北の勝手口をあける
  const gN = GATES[3];
  fence(mb, col, YARD.x2, 0.5, YARD.x2, gN.in.z - gN.w);
  fence(mb, col, YARD.x2, gN.in.z + gN.w, YARD.x2, YARD.z2);
  gatePosts(mb, col, YARD.x2, gN.in.z, "z", gN.w, true);
  // 中庭と運動場のあいだの柵はなくし、そのまま行き来できるようにする
  //  （校門の柱だけ、目じるしとして残す）
  for (const gx of [-5.0, 5.0]) {
    for (let r = 0; r < 6; r++) {
      mb.box(gx, 0.26 + r * 0.52, YARD.z2, 0.72 - r * 0.02, 0.5, 0.72 - r * 0.02,
        choice([0x54514a, 0x4a4740, 0x5d5950]), { jitter: 0.2 });
    }
    mb.box(gx, 3.24, YARD.z2, 0.86, 0.16, 0.86, 0x5f5a51, { jitter: 0.12 });
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

  spawnSpots.push({ x: 0, z: 25.0, y: 0, floor: 0 });

  mb.box(-30, 0.4, 20, 2.6, 0.8, 1.0, 0x8a8f88, { jitter: 0.05 });
  col.add(-31.3, 19.5, -28.7, 20.5, 0, 0.8, "furn");
  for (let i = 0; i < 3; i++) mb.box(-31 + i, 0.95, 20, 0.07, 0.3, 0.07, C.metal);
  spawnSpots.push({ x: -30, z: 22, y: 0, floor: 0 });

  for (const t of [[-34, 27, 1.2], [-8, 29, 1.0], [12, 28, 1.15], [34, 24, 1.05], [-36, 14, 0.9],
                   [-40, 31, 1.1], [-24, 31.5, 0.95], [-12, 32, 1.15], [4, 31.5, 1.0],
                   [24, 32, 1.1], [38, 30, 0.9], [40, 18, 1.05], [-40, 22, 1.0],
                   [-38, 5, 0.85], [38, 6, 0.9], [28, 27, 0.95]]) {
    if (GATES.some((G) => dist2(t[0], t[1], G.in.x, G.in.z) < 36 || dist2(t[0], t[1], G.out.x, G.out.z) < 36)) continue;
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

// 運動場・体育館がわの柵。
//  さびた金あみのフェンスに、ツタがからみ、
//  ところどころ「立入禁止」の札が下がっている。
function wireFence(mb, col, x1, z1, x2, z2) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  if (len < 0.2) return;
  const ux = (x2 - x1) / len, uz = (z2 - z1) / len;
  const nx = -uz, nz = ux;
  const ang = Math.atan2(ux, uz);
  const H = 2.4;
  const RUST = 0x4e4a42, WIRE = 0x6a6a62;

  // 支柱と、上下の横パイプ
  const n = Math.max(1, Math.ceil(len / 2.5));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const px = x1 + (x2 - x1) * t, pz = z1 + (z2 - z1) * t;
    mb.box(px, H / 2, pz, 0.11, H, 0.11, RUST, { jitter: 0.16 });
    mb.box(px, 0.12, pz, 0.3, 0.24, 0.3, 0x4a4740, { jitter: 0.2 });      // 根もとのコンクリ
  }
  mb.wall(x1, z1, x2, z2, H - 0.09, H - 0.01, 0.09, RUST, { jitter: 0.12 });
  mb.wall(x1, z1, x2, z2, 0.16, 0.24, 0.08, RUST, { jitter: 0.12 });

  // 金あみ（たて糸・よこ糸）
  for (let d = 0; d < len; d += 0.34) {
    mb.box(x1 + ux * d, H / 2, z1 + uz * d, 0.03, H - 0.2, 0.03, WIRE, { jitter: 0.35, rotY: ang });
  }
  for (let y = 0.35; y < H - 0.1; y += 0.34) {
    mb.wall(x1, z1, x2, z2, y, y + 0.035, 0.035, WIRE, { jitter: 0.3 });
  }

  // からみついた ツタ
  const ivyN = Math.round(len * 2.2);
  for (let i = 0; i < ivyN; i++) {
    const d = rand(0, len);
    const side = Math.random() < 0.5 ? -1 : 1;
    const yy = Math.pow(Math.random(), 1.4) * H;
    const s = rand(0.2, 0.6) * (1 - yy / H * 0.3);
    mb.box(x1 + ux * d + nx * 0.09 * side, yy, z1 + uz * d + nz * 0.09 * side,
      s, s * rand(0.7, 1.6), 0.06, C.ivy, { jitter: 0.5, rotY: ang + rand(-0.4, 0.4) });
  }
  // 立入禁止の札
  for (let d = rand(3, 9); d < len - 2; d += rand(11, 20)) {
    const px = x1 + ux * d, pz = z1 + uz * d;
    mb.box(px, 1.35, pz, 0.86, 0.5, 0.05, 0xc9c2ae, { jitter: 0.08, rotY: ang + rand(-0.12, 0.12) });
    mb.box(px, 1.5, pz - nz * 0.04, 0.66, 0.1, 0.04, 0x8e2a24, { jitter: 0.1, rotY: ang });
    mb.box(px, 1.24, pz - nz * 0.04, 0.66, 0.1, 0.04, 0x8e2a24, { jitter: 0.1, rotY: ang });
    mb.box(px - 0.2, 1.37, pz - nz * 0.05, 0.16, 0.2, 0.03, 0x2a2620, { jitter: 0.15, rotY: ang });
    mb.box(px + 0.06, 1.37, pz - nz * 0.05, 0.16, 0.2, 0.03, 0x2a2620, { jitter: 0.15, rotY: ang });
  }
  // 足もとの草
  for (let i = 0; i < len * 0.9; i++) {
    const d = rand(0, len);
    const side = Math.random() < 0.5 ? -1 : 1;
    mb.tuft(x1 + ux * d + nx * rand(0.1, 0.7) * side, z1 + uz * d + nz * rand(0.1, 0.7) * side,
      0.02, rand(0.25, 0.8), 0x2b3a1f, choice([0x475331, 0x5a5236]), 3, 0.24);
  }

  const t = 0.3;
  col.add(Math.min(x1, x2) - t, Math.min(z1, z2) - t, Math.max(x1, x2) + t, Math.max(z1, z2) + t, 0, H, "wall");
}

// 敷地をかこむ石垣。
//  大きさのちがう石を積み、上に笠石をのせ、ツタをはわせる。
//  長い年月で ところどころ石が抜け、草が生えている。
// 門のりょうがわに立てる 石の柱と、上をわたす かんぬき
function gatePosts(mb, col, fixed, at, axis, half, stone) {
  const H = stone ? 2.6 : 2.9;
  for (const s of [-1, 1]) {
    const px = axis === "z" ? fixed : at + s * half;
    const pz = axis === "z" ? at + s * half : fixed;
    for (let r = 0; r < 5; r++) {
      mb.box(px, 0.26 + r * 0.52, pz, 0.7 - r * 0.02, 0.5, 0.7 - r * 0.02,
        choice([0x54514a, 0x4a4740, 0x5d5950]), { jitter: 0.2 });
    }
    mb.box(px, H, pz, 0.84, 0.16, 0.84, 0x5f5a51, { jitter: 0.12 });
    col.add(px - 0.36, pz - 0.36, px + 0.36, pz + 0.36, 0, H, "wall");
  }
  // 上をわたす さびた かんぬき
  if (axis === "z") mb.box(fixed, H + 0.24, at, 0.28, 0.22, half * 2 + 0.6, 0x4e4a42, { jitter: 0.14 });
  else mb.box(at, H + 0.24, fixed, half * 2 + 0.6, 0.22, 0.28, 0x4e4a42, { jitter: 0.14 });
  // 足もとの わだち
  mb.box(axis === "z" ? fixed : at, 0.05, axis === "z" ? at : fixed,
    axis === "z" ? 3.2 : half * 2, 0.04, axis === "z" ? half * 2 : 3.2, 0x565044, { jitter: 0.25 });
}

function fence(mb, col, x1, z1, x2, z2) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  if (len < 0.2) return;
  const ux = (x2 - x1) / len, uz = (z2 - z1) / len;        // 石垣の向き
  const nx = -uz, nz = ux;                                 // 横向き（面のほう）
  const ang = Math.atan2(ux, uz);
  const H = 2.0, TH = 0.62;                                // 高さ・厚み

  // 芯（すきまから向こうが見えないように）
  mb.wall(x1, z1, x2, z2, 0.0, H - 0.12, TH * 0.72, 0x3f3a33, { jitter: 0.1 });

  // 石を積む。段ごとに石の大きさを変えて、乱積みに見せる
  const rows = 5;
  for (let r = 0; r < rows; r++) {
    const y0 = (H - 0.2) * (r / rows);
    const hh = (H - 0.2) / rows;
    const sw = 0.62 + r * 0.1;                             // 上の段ほど小さい石
    const off = (r % 2) * sw * 0.5;                        // 目地をずらす
    for (let d = off; d < len; d += sw) {
      const wd = Math.min(sw * rand(0.72, 1.0), len - d);
      if (wd < 0.12) continue;
      const px = x1 + ux * (d + wd / 2), pz = z1 + uz * (d + wd / 2);
      const grey = choice([0x54514a, 0x4a4740, 0x5d5950, 0x46433c, 0x615c52]);
      // ときどき石が抜けている
      if (Math.random() < 0.05) continue;
      for (const side of [-1, 1]) {
        mb.box(px + nx * (TH * 0.38) * side, y0 + hh / 2, pz + nz * (TH * 0.38) * side,
          wd * 0.92, hh * rand(0.82, 0.97), TH * 0.3, grey, { jitter: 0.24, rotY: ang });
      }
    }
  }
  // 笠石（いちばん上にのせる ひらたい石）
  for (let d = 0; d < len; d += 0.9) {
    const wd = Math.min(0.9 * rand(0.85, 1.0), len - d);
    if (wd < 0.15) continue;
    mb.box(x1 + ux * (d + wd / 2), H - 0.09, z1 + uz * (d + wd / 2),
      wd, 0.18, TH * 1.06, choice([0x5f5a51, 0x565148]), { jitter: 0.18, rotY: ang });
  }

  // ツタ。石垣の両面をはい上がり、上のふちから垂れさがる
  const ivyN = Math.round(len * 2.6);
  for (let i = 0; i < ivyN; i++) {
    const d = rand(0, len);
    const px = x1 + ux * d, pz = z1 + uz * d;
    const side = Math.random() < 0.5 ? -1 : 1;
    const yy = Math.pow(Math.random(), 1.5) * H;
    const s = rand(0.22, 0.62) * (1 - yy / H * 0.35);
    mb.box(px + nx * (TH * 0.5) * side, yy, pz + nz * (TH * 0.5) * side,
      s, s * rand(0.7, 1.5), 0.07, C.ivy, { jitter: 0.5, rotY: ang + rand(-0.4, 0.4) });
  }
  // ふちから垂れる ツタの房
  for (let d = rand(0, 3); d < len; d += rand(1.6, 5.0)) {
    const px = x1 + ux * d, pz = z1 + uz * d;
    const side = Math.random() < 0.5 ? -1 : 1;
    const drop = rand(0.4, 1.3);
    mb.box(px + nx * (TH * 0.52) * side, H - drop / 2, pz + nz * (TH * 0.52) * side,
      rand(0.3, 0.7), drop, 0.08, 0x2f4024, { jitter: 0.4, rotY: ang });
  }
  // 足もとの草と、こけ
  for (let i = 0; i < len * 1.1; i++) {
    const d = rand(0, len);
    const side = Math.random() < 0.5 ? -1 : 1;
    mb.tuft(x1 + ux * d + nx * (TH * 0.55 + rand(0, 0.5)) * side, z1 + uz * d + nz * (TH * 0.55 + rand(0, 0.5)) * side,
      0.02, rand(0.2, 0.6), 0x2b3a1f, choice([0x475331, 0x5a5236]), 3, 0.22);
  }

  const t = TH * 0.6;
  col.add(Math.min(x1, x2) - t, Math.min(z1, z2) - t, Math.max(x1, x2) + t, Math.max(z1, z2) + t, 0, H, "wall");
}

// 遠くの木。行けない場所に立つだけなので、段を減らして軽くする
function treeFar(mb, x, z, s) {
  const H = 3.6 * s, W = 1.5 * s;
  mb.box(x, H * 0.5, z, 0.16 * s, H, 0.16 * s, 0x33261a, { jitter: 0.16 });
  const twist = rand(0, 1.57);
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const y = 0.62 * s + t * (H - 0.95 * s);
    const wd = W * (1 - t * 0.82);
    mb.box(x, y, z, wd, (0.58 - t * 0.16) * s, wd * 0.72,
      i % 2 ? 0x1e2a15 : 0x253119, { jitter: 0.26, rotY: twist + i * 0.45 });
  }
  mb.box(x, H - 0.1 * s, z, 0.18 * s, 0.55 * s, 0.18 * s, 0x1e2a15, { jitter: 0.24 });
}

// マップの外がわを、ぐるりと針葉樹の林でかこむ。
//  行けない場所なので、当たり判定は付けない。
//  空がのぞく高さにおさえ、奥ほど背を低くして遠くに見せる。
// 針葉樹林の、さらに向こうにつらなる山。
//  遠くにあるので、空気にかすんで青むらさきに見える。
//  近づけないので当たり判定はなし。スマホの描画距離（190m）の内がわに置く。
function buildMountains(ctx) {
  const { mb } = ctx;
  const CX = 0, CZ = 26;

  // 山ひとつ。四角い箱を積むと ビルに見えてしまうので、
  // 「稜線（りょうせん）」を1本ひいて、その線ぞいに
  // 三角の板を立てていく。どこから見ても 山の形に見える。
  const peak = (mx, mz, H, W, base, faceA) => {
    const SEG = 18;                                    // 稜線を きざむ数
    // 稜線の高さ：まんなかが てっぺんで、両はしが すそ
    const prof = [];
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG;
      const s = Math.sin(t * Math.PI);                 // 0→1→0 の山なり
      // ぎざぎざを すこし足して、自然な形に
      const rough = 1 + Math.sin(t * 11.3 + mx) * 0.07 + Math.sin(t * 23.7 + mz) * 0.04;
      prof.push(Math.max(0.5, H * Math.pow(s, 0.78) * rough));
    }
    const ux = Math.cos(faceA), uz = Math.sin(faceA);  // 稜線の向き
    for (let i = 0; i < SEG; i++) {
      const t0 = i / SEG - 0.5, t1 = (i + 1) / SEG - 0.5;
      const h0 = prof[i], h1 = prof[i + 1];
      const hh = (h0 + h1) / 2;
      const seg = (W / SEG) * 1.35;                    // 少し重ねて すきまを消す
      const px = mx + ux * ((t0 + t1) / 2) * W;
      const pz = mz + uz * ((t0 + t1) / 2) * W;
      // 稜線ぞいの板（うすい壁）を、少しずつ高さを変えて立てる
      mb.box(px, -6 + hh / 2, pz, seg, hh + 6, seg * 0.5, base, { jitter: 0.07, rotY: faceA });
      // 手前へ張りだす すそ（横から見ても 厚みが出るように）
      const foot = Math.max(0.1, hh * 0.5);
      mb.box(px - uz * W * 0.11, -6 + foot / 2, pz + ux * W * 0.11,
        seg, foot + 6, seg * 0.75, base, { jitter: 0.1, rotY: faceA });
      mb.box(px + uz * W * 0.11, -6 + foot / 2, pz - ux * W * 0.11,
        seg, foot + 6, seg * 0.75, base, { jitter: 0.1, rotY: faceA });
    }
  };

  // 手前の低い尾根 → 奥の高い山、の2列で 奥ゆきを出す
  const ridges = [
    { dist: 108, count: 13, h: [15, 25], wide: [42, 64], col: [0x2c2b36, 0x32303d] },
    { dist: 148, count: 11, h: [28, 48], wide: [56, 88], col: [0x342e44, 0x3b3550] },
  ];
  for (const R of ridges) {
    for (let i = 0; i < R.count; i++) {
      const a2 = (i / R.count) * Math.PI * 2 + rand(-0.12, 0.12);
      const d = R.dist * rand(0.94, 1.06);
      const mx = CX + Math.cos(a2) * d, mz = CZ + Math.sin(a2) * d;
      // 稜線は、こちらを向く向き（見る側に 横顔を見せる）
      peak(mx, mz, rand(R.h[0], R.h[1]), rand(R.wide[0], R.wide[1]),
        choice(R.col), a2 + Math.PI / 2 + rand(-0.25, 0.25));
    }
  }
  // いちばん奥に、うっすら もやの層
  for (let i = 0; i < 26; i++) {
    const a2 = (i / 26) * Math.PI * 2;
    mb.box(CX + Math.cos(a2) * 132, 4, CZ + Math.sin(a2) * 132,
      44, 14, 10, 0x2a2739, { jitter: 0.16, rotY: a2 + Math.PI / 2 });
  }
}

function buildForest(ctx) {
  const { mb, opts } = ctx;
  const Q = opts && opts.grass !== undefined ? opts.grass : 1;

  // 遊べる場所（この中には生やさない）
  const inPlay = (x, z) =>
    (x > -50 && x < 50 && z > 34 && z < 74) ||          // 運動場
    (x > -44 && x < 44 && z > -2 && z < 36) ||          // 中庭
    (x > -46 && x < 46 && z > -17 && z < 2) ||          // 校舎
    (x > -9 && x < 9 && z > -2 && z < 11) ||            // 昇降口まわり
    (x > 4 && x < 36 && z > -36 && z < -16);            // 秘密の教室の下

  // 遊べる場所のふちから、どれだけ離れているか
  const outDist = (x, z) => {
    const dx = Math.max(Math.abs(x) - 50, 0);
    const dz = z > 20 ? Math.max(z - 74, 0) : Math.max(-17 - z, 0);
    return Math.max(0.0, Math.hypot(dx, dz));
  };

  // 林の地面。空がのぞかないよう、外がわ ぜんぶに敷く
  for (let x = -150; x < 150; x += 15) {
    for (let z = -110; z < 165; z += 15) {
      mb.slab(x, z, x + 15, z + 15, -0.03, 0.5, 0x1f2718, { jitter: 0.3 });
    }
  }

  // 木。フェンスのすぐ外は高く密に、遠くへいくほど小さく
  const N = Math.round(1500 * Q);
  let made = 0;
  for (let i = 0; i < N * 5 && made < N; i++) {
    const x = rand(-140, 140), z = rand(-100, 155);
    if (inPlay(x, z)) continue;
    const d = outDist(x, z);
    if (d > 78) continue;
    const near = 1 - Math.min(1, d / 78);              // 1=フェンスぎわ 0=いちばん奥
    // ぎわは びっしり、奥は すこし まばらに
    if (Math.random() > 0.34 + near * 0.62) continue;
    // ぎわの木ほど大きく、奥は小さく見せる（遠近感）
    const s = (0.55 + near * near * 1.5) * rand(0.8, 1.3);
    treeFar(mb, x, z, s);
    made++;
  }
  // フェンスにいちばん近い列は、とくに背を高くして 壁のように立てる
  const edge = [];
  for (let x = -56; x <= 56; x += 3.4) { edge.push([x, 78 + rand(-1.6, 2.6)]); edge.push([x, -22 - rand(0, 3)]); }
  for (let z = -22; z <= 80; z += 3.4) { edge.push([-56 - rand(0, 3), z]); edge.push([56 + rand(0, 3), z]); }
  for (const [ex, ez] of edge) {
    if (inPlay(ex, ez)) continue;
    if (Math.random() > 0.82) continue;
    treeFar(mb, ex, ez, rand(1.7, 2.6));
    made++;
  }
  return made;
}

// 針葉樹。細い幹に、上へいくほど小さくなる枝の段を重ねて
// とがった形をつくる。大きすぎないよう、ぜんたいで3.5mほど。
function tree(mb, col, x, z, s) {
  const H = 3.4 * s;                       // 木のたかさ
  const W = 1.55 * s;                      // いちばん下の枝のひろがり
  // 幹
  mb.box(x, 0.55 * s, z, 0.2 * s, 1.1 * s, 0.2 * s, 0x3f2f20, { jitter: 0.14 });
  mb.box(x, H * 0.55, z, 0.13 * s, H * 0.9, 0.13 * s, 0x3a2b1d, { jitter: 0.12 });
  // 枝の段（下ほど大きく、上へいくほど細く）
  const tiers = 8;
  const twist = rand(0, 1.57);
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);             // 0=下 1=上
    const y = 0.72 * s + t * (H - 1.05 * s);
    const wd = W * (1 - t * 0.8);
    const th = (0.5 - t * 0.16) * s;       // 段どうしが かさなる厚み
    const dark = i % 2 === 0 ? 0x243019 : 0x2c3c21;
    // 十字に2枚かさねると、どの向きから見ても枝らしく見える
    mb.box(x, y, z, wd, th, wd * 0.5, dark, { jitter: 0.22, rotY: twist + i * 0.42 });
    mb.box(x, y + th * 0.16, z, wd * 0.5, th * 0.86, wd, dark, { jitter: 0.22, rotY: twist + i * 0.42 });
  }
  // てっぺんのとがり
  mb.box(x, H - 0.1 * s, z, 0.2 * s, 0.5 * s, 0.2 * s, 0x2b3a20, { jitter: 0.2 });
  // 根もとの落ち葉と、下草
  mb.box(x, 0.06, z, 1.5 * s, 0.05, 1.5 * s, 0x3a3320, { jitter: 0.35, rotY: twist });
  col.add(x - 0.26 * s, z - 0.26 * s, x + 0.26 * s, z + 0.26 * s, 0, H * 0.8, "wall");
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
function makeCurtain(x, y, z, h, color = C.curtain, wide = 0.9) {
  const g = new THREE.PlaneGeometry(wide, h, 6, 5);
  const base = g.attributes.position.array.slice();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({
    color, transparent: true, opacity: 0.9, side: THREE.DoubleSide,
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

// ============================================================
//  運動場
// ============================================================
function buildField(ctx) {
  const { mb, col, rooms, spawnSpots, props } = ctx;
  const F = FIELD;

  // 土のグラウンド。ながく使われていないので、隅へ行くほど草に飲まれている
  //  中央は土のまま、へりは草の色。あいだはまだらに。
  const edgeness = (x, z) => {
    const ex = Math.min(x - F.x1, F.x2 - x) / ((F.x2 - F.x1) / 2);
    const ez = Math.min(z - F.z1, F.z2 - z) / ((F.z2 - F.z1) / 2);
    return 1 - Math.min(1, Math.min(ex, ez) * 1.35);      // 0=まんなか 1=すみ
  };
  for (let x = F.x1; x < F.x2; x += 4)
    for (let z = F.z1; z < F.z2; z += 4) {
      const e = edgeness(x + 2, z + 2);
      const c = new THREE.Color(C.ground).lerp(new THREE.Color(C.grass), clamp(e * 1.25 + rand(-0.18, 0.18), 0, 1));
      mb.slab(x, z, Math.min(x + 4, F.x2), Math.min(z + 4, F.z2), 0.02, 0.3, c.getHex(), { jitter: 0.26 });
    }

  // トラックの白線（消えかけた楕円）
  const cxT = 15, czT = 54, rx = 27, rz = 13;
  for (const k of [1, 0.72]) {
    for (let i = 0; i < 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      const x = cxT + Math.cos(a) * rx * k, z = czT + Math.sin(a) * rz * k;
      if (x < F.x1 + 2 || x > F.x2 - 2) continue;
      mb.box(x, 0.18, z, 1.4, 0.025, 0.14, 0x8e8a7c, { jitter: 0.45, rotY: a + Math.PI / 2 });
    }
  }
  // スタートライン
  for (let i = 0; i < 5; i++) mb.box(cxT - 26 + i * 0.02, 0.18, czT + rz - 1 + i * 1.4, 0.16, 0.025, 1.2, 0x9a9688, { jitter: 0.3 });

  // 外周のフェンスと正門
  // 運動場・体育館がわは、ツタのからんだ 立入禁止フェンス。
  //  東（x=48）と 西（x=-48）に、通用門の あなをあける。
  const gE = GATES[1], gW = GATES[2];
  wireFence(mb, col, F.x1, F.z1, F.x1, gW.in.z - gW.w);
  wireFence(mb, col, F.x1, gW.in.z + gW.w, F.x1, F.z2);
  wireFence(mb, col, F.x2, F.z1, F.x2, gE.in.z - gE.w);
  wireFence(mb, col, F.x2, gE.in.z + gE.w, F.x2, F.z2);
  wireFence(mb, col, F.x1, F.z2, -5, F.z2);
  wireFence(mb, col, 5, F.z2, F.x2, F.z2);
  gatePosts(mb, col, F.x1, gW.in.z, "z", gW.w);
  gatePosts(mb, col, F.x2, gE.in.z, "z", gE.w);
  // 中庭の石垣の東西の外側（校門の左右）をつなぐ
  wireFence(mb, col, F.x1, F.z1, -42, F.z1);
  wireFence(mb, col, 42, F.z1, F.x2, F.z1);
  for (const gx of [-5.2, 5.2]) {
    mb.box(gx, 1.8, F.z2, 0.7, 3.6, 0.7, C.stone, { jitter: 0.05 });
    col.add(gx - 0.35, F.z2 - 0.35, gx + 0.35, F.z2 + 0.35, 0, 3.6, "wall");
  }
  mb.box(0, 3.5, F.z2, 11.2, 0.35, 0.35, C.metal, { jitter: 0.06 });
  mb.box(-3.4, 2.5, F.z2 + 0.1, 1.2, 1.6, 0.12, 0x6b5334, { jitter: 0.05 });  // 校名の札

  // サッカーゴール
  //  運動場の東はし（校舎がわではなく横）に、向かいあわせで2つ。
  //  行き来のじゃまにならないよう、トラックの外に置く。
  soccerGoal(mb, col, props, 44, 43, 1);      // 開いている向き：南（+z）
  soccerGoal(mb, col, props, 44, 65, -1);     // 開いている向き：北（-z）

  // バックネットは、視界をふさぐのでなくした

  // 砂場と百葉箱
  mb.slab(30, 40, 38, 46, 0.16, 0.2, 0xb0a184, { jitter: 0.2 });
  for (const e of [[30, 40, 38, 40], [30, 46, 38, 46], [30, 40, 30, 46], [38, 40, 38, 46]])
    mb.wall(e[0], e[1], e[2], e[3], 0.02, 0.3, 0.2, C.wood, { jitter: 0.1 });
  mb.box(42, 1.3, 60, 0.9, 0.9, 0.9, 0xd8d6cc, { jitter: 0.06 });
  for (const dx of [-0.35, 0.35]) for (const dz of [-0.35, 0.35]) mb.box(42 + dx, 0.42, 60 + dz, 0.09, 0.85, 0.09, C.wood);
  col.add(41.4, 59.4, 42.6, 60.6, 0, 1.8, "wall");

  // 二宮金次郎の像（運動場の、校舎がわの奥）
  //  台座のうえに、薪を背負って本を読む すがた
  {
    const sx = 23, sz = F.z1 + 3.2;
    mb.box(sx, 0.5, sz, 2.0, 1.0, 2.0, C.stone, { jitter: 0.06 });          // 台座（下）
    mb.box(sx, 1.25, sz, 1.4, 0.6, 1.4, C.stone, { jitter: 0.05 });         // 台座（上）
    mb.box(sx, 1.58, sz + 0.72, 0.9, 0.3, 0.08, 0x6a6258, { jitter: 0.06 }); // 名まえの札
    const by = 1.55;                                                         // 像の足もと
    const BR = 0x6d675c;                                                     // にぶく光る銅
    mb.box(sx - 0.13, by + 0.35, sz, 0.16, 0.7, 0.18, BR, { jitter: 0.05 }); // 左足
    mb.box(sx + 0.14, by + 0.33, sz + 0.18, 0.16, 0.66, 0.18, BR, { jitter: 0.05 });
    mb.box(sx, by + 1.0, sz + 0.05, 0.44, 0.66, 0.28, BR, { jitter: 0.05 }); // 胴
    mb.box(sx, by + 1.5, sz + 0.02, 0.3, 0.32, 0.3, BR, { jitter: 0.05 });   // 頭
    mb.box(sx, by + 1.66, sz - 0.02, 0.34, 0.1, 0.34, 0x5c564c, { jitter: 0.08 });
    // 背負った薪（たきぎ）
    for (let i = 0; i < 5; i++) {
      mb.box(sx + rand(-0.16, 0.16), by + 1.05 + i * 0.09, sz - 0.28, 0.5, 0.09, 0.12,
        0x4a3a26, { jitter: 0.24, rotY: rand(-0.25, 0.25) });
    }
    // 前へ差し出した うでと、ひらいた本
    mb.box(sx - 0.28, by + 1.1, sz + 0.26, 0.13, 0.13, 0.42, BR, { jitter: 0.06 });
    mb.box(sx + 0.28, by + 1.1, sz + 0.26, 0.13, 0.13, 0.42, BR, { jitter: 0.06 });
    mb.box(sx, by + 1.14, sz + 0.48, 0.46, 0.06, 0.32, 0xa89f88, { jitter: 0.08 });
    col.add(sx - 1.0, sz - 1.0, sx + 1.0, sz + 1.0, 0, 3.4, "wall");
    spawnSpots.push({ x: sx + 2.4, z: sz + 2.0, y: 0, floor: 0 });
    // 台座のまわりは草に埋もれかけている
    for (let i = 0; i < 60 * (ctx.opts && ctx.opts.grass !== undefined ? ctx.opts.grass : 1); i++) {
      const a = rand(0, 6.3), rr = rand(1.0, 2.6);
      mb.tuft(sx + Math.cos(a) * rr, sz + Math.sin(a) * rr, 0.16, rand(0.3, 0.8), 0x334523, 0x53603a, 3, 0.28);
    }
  }

  // 外周の木立
  for (const t of [[-44, 68, 1.2], [-30, 69, 1.0], [8, 69.5, 1.15], [30, 69, 1.05], [45, 66, 1.1],
                   [45, 44, 1.0], [45, 52, 0.9],
                   [-37, 70, 1.05], [-20, 70.5, 0.9], [-6, 70, 1.1], [18, 70.5, 0.95],
                   [40, 70, 1.15], [46, 58, 0.95], [46, 50, 1.05],
                   [-47, 69, 1.0], [-24, 67.5, 1.05], [46, 38, 0.9]]) {
    // 体育館に めりこむ場所には 生やさない（木が壁を つきぬけてしまう）
    if (t[0] > GYM.x1 - 3.2 && t[0] < GYM.x2 + 3.2 && t[1] > GYM.z1 - 3.2 && t[1] < GYM.z2 + 3.2) continue;
    // 門の 通り道も ふさがない
    if (GATES.some((G) => dist2(t[0], t[1], G.in.x, G.in.z) < 36 || dist2(t[0], t[1], G.out.x, G.out.z) < 36)) continue;
    tree(mb, col, t[0], t[1], t[2]);
    spawnSpots.push({ x: t[0] + 2.2, z: t[1] - 2, y: 0, floor: 0 });
  }
  // 草。運動場のすみほど背が高く、びっしり生えている
  const inGym = (x, z) => x > GYM.x1 - 1.4 && x < GYM.x2 + 1.4 && z > GYM.z1 - 1.4 && z < GYM.z2 + 1.4;
  const gLow = 0x334523, gTop = 0x53603a, gDry = 0x6d6242;
  const GQ = ctx.opts && ctx.opts.grass !== undefined ? ctx.opts.grass : 1;
  let tufts = 0;
  for (let i = 0; i < 9000 && tufts < 2600 * GQ; i++) {
    const x = rand(F.x1 + 0.5, F.x2 - 0.5), z = rand(F.z1 + 0.5, F.z2 - 0.5);
    if (inGym(x, z)) continue;
    const e = edgeness(x, z);
    // まんなかは 8% ほど、すみは ほぼ確実に生える
    if (Math.random() > 0.06 + e * e * 1.05) continue;
    const h = (0.16 + e * 0.75) * rand(0.6, 1.35);
    const dry = Math.random() < 0.28;
    mb.tuft(x, z, 0.16, h, gLow, dry ? gDry : gTop, h > 0.5 ? 4 : 3, 0.22 + e * 0.3);
    tufts++;
  }
  // すみの4か所は、腰までのススキの原
  for (const [ax, az] of [[F.x1 + 5, F.z1 + 5], [F.x2 - 5, F.z1 + 5], [F.x1 + 5, F.z2 - 5], [F.x2 - 5, F.z2 - 5]]) {
    for (let i = 0; i < 150 * GQ; i++) {
      const x = ax + rand(-7, 7), z = az + rand(-7, 7);
      if (x < F.x1 || x > F.x2 || z < F.z1 || z > F.z2 || inGym(x, z)) continue;
      mb.tuft(x, z, 0.16, rand(0.7, 1.5), gLow, choice([gTop, gDry, 0x6e653f]), 4, 0.4);
    }
  }
  // フェンスぎわにも、線のように草が伸びている
  for (let i = 0; i < 320 * GQ; i++) {
    const side = Math.floor(rand(0, 4));
    let x, z;
    if (side === 0) { x = rand(F.x1, F.x2); z = F.z1 + rand(0, 1.6); }
    else if (side === 1) { x = rand(F.x1, F.x2); z = F.z2 - rand(0, 1.6); }
    else if (side === 2) { x = F.x1 + rand(0, 1.6); z = rand(F.z1, F.z2); }
    else { x = F.x2 - rand(0, 1.6); z = rand(F.z1, F.z2); }
    if (inGym(x, z)) continue;
    mb.tuft(x, z, 0.16, rand(0.6, 1.3), gLow, choice([gTop, gDry]), 4, 0.32);
  }
  // 体育館のきわは、雨だれのあとに草がびっしり
  for (let i = 0; i < 420 * GQ; i++) {
    const side = Math.floor(rand(0, 4));
    let x, z;
    if (side === 0) { x = rand(GYM.x1 - 1, GYM.x2 + 1); z = GYM.z1 - rand(0.4, 2.2); }
    else if (side === 1) { x = rand(GYM.x1 - 1, GYM.x2 + 1); z = GYM.z2 + rand(0.4, 2.2); }
    else if (side === 2) { x = GYM.x1 - rand(0.4, 2.2); z = rand(GYM.z1 - 1, GYM.z2 + 1); }
    else { x = GYM.x2 + rand(0.4, 2.2); z = rand(GYM.z1 - 1, GYM.z2 + 1); }
    if (x < F.x1 || x > F.x2 || z < F.z1 || z > F.z2) continue;
    mb.tuft(x, z, 0.16, rand(0.5, 1.2), gLow, choice([gTop, gDry]), 4, 0.3);
  }

  // 小石
  for (let i = 0; i < 90; i++) {
    const x = rand(F.x1 + 1, F.x2 - 1), z = rand(F.z1 + 1, F.z2 - 1);
    if (inGym(x, z)) continue;
    const h = rand(0.03, 0.09);
    mb.box(x, 0.18 + h / 2, z, rand(0.2, 0.6), h, rand(0.2, 0.6), 0x4e4a3e, { jitter: 0.45, rotY: rand(0, 3.14) });
  }
  for (let i = 0; i < 34; i++) spawnSpots.push({ x: rand(F.x1 + 3, F.x2 - 3), z: rand(F.z1 + 3, F.z2 - 3), y: 0, floor: 0 });

  rooms.push({ id: "field", name: "運動場", floor: 0, cx: 16, cz: 54, y: 0,
    x1: F.x1, x2: F.x2, z1: F.z1, z2: F.z2, kind: "field", label: "運動場" });
}

// ============================================================
//  体育館
// ============================================================
function buildGym(ctx) {
  const { mb, col, rooms, spawnSpots, props, lightSpots } = ctx;
  const G = GYM, H = G.h;
  const cx = (G.x1 + G.x2) / 2, cz = (G.z1 + G.z2) / 2;

  // 板張りの床（コートの線を引く）
  for (let x = G.x1; x < G.x2; x += 6)
    for (let z = G.z1; z < G.z2; z += 6)
      mb.slab(x, z, Math.min(x + 6, G.x2), Math.min(z + 6, G.z2), 0.24, 0.3, 0x6a5232, { jitter: 0.24 });
  // コートの白線
  const cL = { x1: G.x1 + 3, x2: G.x2 - 3, z1: G.z1 + 3, z2: G.z2 - 3 };
  for (const e of [[cL.x1, cL.z1, cL.x2, cL.z1], [cL.x1, cL.z2, cL.x2, cL.z2],
                   [cL.x1, cL.z1, cL.x1, cL.z2], [cL.x2, cL.z1, cL.x2, cL.z2],
                   [cL.x1, cz, cL.x2, cz]]) {
    mb.wall(e[0], e[1], e[2], e[3], 0.26, 0.285, 0.12, 0xa8a390, { jitter: 0.26 });
  }
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    mb.box(cx + Math.cos(a) * 2.4, 0.27, cz + Math.sin(a) * 2.4, 0.34, 0.02, 0.12, 0xa8a390, { jitter: 0.3, rotY: a });
  }

  // 壁（東面に入口、南北の高いところに窓の帯）
  //  外は下見板張り、中は腰まで剥げかけた壁、その上に格子窓がずらりと並ぶ
  const GW = 0x453626;                              // 板張りの外壁
  // 窓は、上下2段。上下で 位置をそろえ、4つの壁で 同じ形にする。
  //  幅・高さ・すきまを そろえたので、ならびが きれいに見える。
  const WW = 2.8;                       // 窓の幅
  const HI1 = 5.5, HI2 = 7.5;           // 上の段の 高さ
  const LO1 = 2.6, LO2 = 4.3;           // 下の段の 高さ
  const NX = 7, NZ = 6;                 // 東西の壁に7つ、南北の壁に6つ
  const winRow     = windowGrid(G.x1, G.x2, NX, WW, HI1, HI2);   // 北・南の 上
  const winLow     = windowGrid(G.x1, G.x2, NX, WW, LO1, LO2);   // 北の 下
  const winSide    = windowGrid(G.z1, G.z2, NZ, WW, HI1, HI2);   // 東・西の 上
  const winSideLow = windowGrid(G.z1, G.z2, NZ, WW, LO1, LO2)
    .filter((h) => h.b < GYM_DOOR.z - GYM_DOOR.w - 0.6 || h.a > GYM_DOOR.z + GYM_DOOR.w + 0.6);
  const nHoles = winRow.concat(winLow);
  wallWithHoles(mb, col, { axis: "x", fixed: G.z1, from: G.x1, to: G.x2, y1: 0, y2: H, thick: 0.3, color: GW, holes: nHoles });
  wallWithHoles(mb, col, { axis: "x", fixed: G.z2, from: G.x1, to: G.x2, y1: 0, y2: H, thick: 0.3, color: GW, holes: winRow });
  wallWithHoles(mb, col, { axis: "z", fixed: G.x1, from: G.z1, to: G.z2, y1: 0, y2: H, thick: 0.3, color: GW,
    holes: winSide.concat(winSideLow) });
  wallWithHoles(mb, col, {
    axis: "z", fixed: G.x2, from: G.z1, to: G.z2, y1: 0, y2: H, thick: 0.3, color: GW,
    holes: winSide.concat(winSideLow, [{ a: GYM_DOOR.z - GYM_DOOR.w, b: GYM_DOOR.z + GYM_DOOR.w, y1: 0, y2: 3.0 }]),
  });
  const gDoor = [{ a: GYM_DOOR.z - GYM_DOOR.w, b: GYM_DOOR.z + GYM_DOOR.w, y1: 0, y2: 3.0 }];
  siding(mb, "x", G.z1, G.x1, G.x2, 0, H, -1, 0.5, nHoles);
  siding(mb, "x", G.z2, G.x1, G.x2, 0, H, 1, 0.5, winRow);
  siding(mb, "z", G.x1, G.z1, G.z2, 0, H, -1, 0.5, winSide.concat(winSideLow));
  siding(mb, "z", G.x2, G.z1, G.z2, 0, H, 1, 0.5, winSide.concat(gDoor));
  posts(mb, "x", G.z1, G.x1, G.x2, 0, H, -1, 5.0, nHoles);
  posts(mb, "x", G.z2, G.x1, G.x2, 0, H, 1, 5.0, winRow);
  ivy(mb, "x", G.z1, G.x1 + 1, G.x2 - 1, 0, 5.0, -1, 34, nHoles);
  ivy(mb, "z", G.x1, G.z1 + 1, G.z2 - 1, 0, 5.0, -1, 30, winSideLow);
  // 窓の格子（外がわ・内がわ）と、内壁の腰の汚れ
  //  窓の格子。段ごとに 桟の数をそろえる（上は4本、下は3本）
  const sideAll = winSide.concat(winSideLow);
  for (const h of nHoles) {
    const n = h.y1 > 5 ? 4 : 3;
    sash(mb, "x", G.z1 - 0.06, h.a, h.b, h.y1, h.y2, n);
    sash(mb, "x", G.z1 + 0.06, h.a, h.b, h.y1, h.y2, n);
  }
  for (const h of winRow) {
    sash(mb, "x", G.z2 + 0.06, h.a, h.b, h.y1, h.y2, 4);
    sash(mb, "x", G.z2 - 0.06, h.a, h.b, h.y1, h.y2, 4);
  }
  for (const h of sideAll) {
    const n = h.y1 > 5 ? 4 : 3;
    sash(mb, "z", G.x1 + 0.06, h.a, h.b, h.y1, h.y2, n);
    sash(mb, "z", G.x1 - 0.06, h.a, h.b, h.y1, h.y2, n);
    sash(mb, "z", G.x2 - 0.06, h.a, h.b, h.y1, h.y2, n);
    sash(mb, "z", G.x2 + 0.06, h.a, h.b, h.y1, h.y2, n);
  }
  //  上下の段のあいだに、ぐるりと 水平の帯を走らせて ならびを ひきしめる
  for (const [zz, side] of [[G.z1, 1], [G.z2, -1]]) {
    mb.box(cx, LO2 + 0.28, zz + 0.17 * side, G.x2 - G.x1, 0.2, 0.12, 0x4a4534, { jitter: 0.12 });
    mb.box(cx, HI2 + 0.3, zz + 0.17 * side, G.x2 - G.x1, 0.16, 0.1, 0x4a4534, { jitter: 0.12 });
  }
  for (const [xx, side] of [[G.x1, 1], [G.x2, -1]]) {
    mb.box(xx + 0.17 * side, LO2 + 0.28, cz, 0.12, 0.2, G.z2 - G.z1, 0x4a4534, { jitter: 0.12 });
    mb.box(xx + 0.17 * side, HI2 + 0.3, cz, 0.1, 0.16, G.z2 - G.z1, 0x4a4534, { jitter: 0.12 });
  }
  //  腰壁は、窓の下（高さ2.4まで）だけにする。窓をふさがないように
  for (const [zz, side, hs] of [[G.z1, 1, nHoles], [G.z2, -1, winRow]]) {
    for (const [a, b] of freeSpans(G.x1, G.x2, 1.2, hs)) {
      mb.box((a + b) / 2, 1.25, zz + 0.16 * side, b - a, 2.5, 0.05, 0x7d7452, { jitter: 0.3 });   // 剥げかけた腰壁
      mb.box((a + b) / 2, 2.54, zz + 0.18 * side, b - a, 0.14, 0.1, 0x4a4534, { jitter: 0.12 });
    }
  }
  for (const [xx, side, hs] of [[G.x1, 1, winSideLow], [G.x2, -1, winSideLow.concat(gDoor)]]) {
    for (const [a, b] of freeSpans(G.z1, G.z2, 1.2, hs)) {
      mb.box(xx + 0.16 * side, 1.25, (a + b) / 2, 0.05, 2.5, b - a, 0x7d7452, { jitter: 0.3 });
      mb.box(xx + 0.18 * side, 2.54, (a + b) / 2, 0.1, 0.14, b - a, 0x4a4534, { jitter: 0.12 });
    }
  }

  // 屋根：波トタンの天井と、緑色にぬられた鉄骨のトラス
  const TRUSS = 0x3d5544;                            // 体育館らしい くすんだ緑
  tiled(mb, G.x1, G.z1, G.x2, G.z2, H, 0.36, 0x554c3e, 7);          // 中から見える天井

  // 外から見える 切妻屋根（三角のかたち）。
  //  むねは東西に走り、東と西のはしに三角の妻（つま）が見える。
  {
    const RISE = 5.2;                                   // むねの高さ
    const halfD = (G.z2 - G.z1) / 2 + 0.9;              // 軒（のき）の出
    const cz2 = (G.z1 + G.z2) / 2;
    const STEPS = 16;
    const ROOF = 0x2c2b2c, ROOF2 = 0x353334;            // 黒っぽい かわら
    for (let k = 0; k < STEPS; k++) {
      const t = k / STEPS, t2 = (k + 1) / STEPS;
      const y = H - 0.2 + t * RISE;
      const hh = (RISE / STEPS) * 1.5;
      for (const s of [-1, 1]) {
        const zA = cz2 + s * halfD * (1 - t);
        const zB = cz2 + s * halfD * (1 - t2);
        mb.box(G.x1 - 0.7 + (G.x2 - G.x1 + 1.4) / 2, y + hh / 2, (zA + zB) / 2,
          G.x2 - G.x1 + 1.4, hh, Math.abs(zA - zB) + 0.34,
          k % 2 ? ROOF : ROOF2, { jitter: 0.14 });
      }
    }
    // むね（いちばん上の かわら）
    mb.box((G.x1 + G.x2) / 2, H - 0.2 + RISE + 0.14, cz2, G.x2 - G.x1 + 1.6, 0.34, 0.7, 0x232223, { jitter: 0.1 });

    // 東と西の 妻（つま）：三角の板壁でふさぐ
    for (const [xx, side] of [[G.x1, -1], [G.x2, 1]]) {
      for (let k = 0; k < STEPS; k++) {
        const t = k / STEPS, t2 = (k + 1) / STEPS;
        const y = H - 0.2 + t * RISE;
        const hh = (RISE / STEPS) * 1.12;
        const wd = (halfD - 0.9) * 2 * (1 - t2);
        if (wd < 0.2) continue;
        mb.box(xx + side * 0.12, y + hh / 2, cz2, 0.3, hh, wd, GW, { jitter: 0.2 });
        mb.box(xx + side * 0.3, y + hh / 2, cz2, 0.06, hh * 0.5, wd * 0.98, C.siding, { jitter: 0.35 });
      }
      // 妻のてっぺんの、小さな明かりとり窓
      mb.box(xx + side * 0.2, H + RISE * 0.52, cz2, 0.16, 0.9, 1.6, C.sash, { jitter: 0.1 });
      mb.box(xx + side * 0.26, H + RISE * 0.52, cz2, 0.06, 0.7, 1.36, 0x1a1620, { jitter: 0.1 });
      // 破風板（はふいた）：三角のふちに走る白い板
      for (const s of [-1, 1]) {
        for (let k = 0; k < STEPS; k += 2) {
          const t = k / STEPS;
          const zz = cz2 + s * halfD * (1 - t);
          mb.box(xx + side * 0.34, H - 0.1 + t * RISE + 0.16, zz, 0.16, 0.5, 0.5, 0x6f6656, { jitter: 0.18 });
        }
      }
    }
    // 軒（のき）の下の 垂木（たるき）
    for (let x = G.x1; x <= G.x2; x += 1.1) {
      for (const s of [-1, 1]) {
        mb.box(x, H - 0.32, cz2 + s * (halfD - 0.35), 0.12, 0.16, 1.0, C.post, { jitter: 0.16 });
      }
    }
  }
  for (let z = G.z1 + 2.4; z < G.z2; z += 3.0) {
    // 山形の梁（まんなかが高い）
    for (const s of [-1, 1]) {
      mb.box(cx + s * (G.x2 - G.x1) * 0.25, H - 1.15, z, (G.x2 - G.x1) * 0.52, 0.2, 0.22, TRUSS,
        { jitter: 0.1, rotY: 0 });
    }
    mb.box(cx, H - 0.62, z, 1.6, 0.2, 0.22, TRUSS, { jitter: 0.1 });
    for (const sx of [-0.36, -0.18, 0.18, 0.36]) {
      mb.box(cx + (G.x2 - G.x1) * sx, H - 1.6, z, 0.12, 0.95, 0.14, TRUSS, { jitter: 0.14 });
    }
    for (const sx of [-0.32, 0.32]) mb.box(cx + (G.x2 - G.x1) * sx, H - 1.05, z, 0.16, 1.2, 0.16, TRUSS, { jitter: 0.1 });
  }
  // 母屋（もや）：梁と直角に走る細い材
  for (let x = G.x1 + 2; x < G.x2; x += 1.9) {
    mb.box(x, H - 0.85, cz, 0.11, 0.13, G.z2 - G.z1 - 1.0, TRUSS, { jitter: 0.16 });
  }
  // 雨もりのしみ
  for (let i = 0; i < 26; i++) {
    mb.box(rand(G.x1 + 2, G.x2 - 2), H - 0.4, rand(G.z1 + 2, G.z2 - 2),
      rand(1.2, 3.4), 0.03, rand(1.0, 3.0), 0x2a2418, { jitter: 0.4 });
  }
  // 天井からたれ下がる のぼり綱
  for (const [rx, rz] of [[cx + 4.5, G.z1 + 8], [cx + 4.5, G.z1 + 11], [cx - 5.2, G.z1 + 9.5]]) {
    const top = H - 1.3, bot = 1.1;
    mb.box(rx, (top + bot) / 2, rz, 0.05, top - bot, 0.05, 0x6e5a34, { jitter: 0.2 });
    mb.box(rx, bot - 0.06, rz, 0.09, 0.14, 0.09, 0x5a4826, { jitter: 0.1 });   // 綱のこぶ
  }

  // 入口のひさし（木の垂木に瓦）
  mb.box(G.x2 + 0.9, 3.2, GYM_DOOR.z, 2.0, 0.24, 4.4, C.wood, { jitter: 0.08 });
  mb.box(G.x2 + 0.9, 3.36, GYM_DOOR.z, 2.1, 0.1, 4.5, C.tile, { jitter: 0.12 });
  for (const dz of [-1.8, 1.8]) mb.box(G.x2 + 1.7, 1.6, GYM_DOOR.z + dz, 0.2, 3.2, 0.2, C.post);

  // 舞台（南のはし）
  const stZ = G.z2 - 5.5;
  mb.box(cx, 0.85, stZ + 2.6, G.x2 - G.x1 - 1.2, 1.2, 5.2, 0x7a5f3a, { jitter: 0.08 });
  col.add(G.x1 + 0.6, stZ, G.x2 - 0.6, G.z2 - 0.4, 0, 1.45, "wall");
  mb.box(cx, 1.5, stZ, G.x2 - G.x1 - 1.2, 0.1, 0.3, 0x5a4326, { jitter: 0.06 });
  // 舞台の緞帳。まっ赤な幕が、左右にひらいたまま垂れさがっている
  const RED = 0x8e1b26;
  for (const [ex, side] of [[G.x1 + 2.6, 1], [G.x2 - 2.6, -1]]) {
    props.push(makeCurtain(ex, 4.0, stZ - 0.25, 5.6, RED, 3.4));
    props.push(makeCurtain(ex + side * 2.0, 4.0, stZ - 0.32, 5.6, 0x741620, 2.2));
    // 幕をたばねるふさ
    mb.box(ex + side * 1.5, 3.4, stZ - 0.4, 0.16, 0.5, 0.16, 0xb8963c, { jitter: 0.12 });
  }
  mb.box(cx, 6.9, stZ - 0.25, G.x2 - G.x1 - 1.0, 0.95, 0.26, RED, { jitter: 0.12 });   // 上部の幕
  for (let x = G.x1 + 1; x < G.x2 - 0.5; x += 0.5) {                                    // ひだ
    mb.box(x, 6.9, stZ - 0.4, 0.16, 0.95, 0.14, 0x741620, { jitter: 0.24 });
  }
  mb.box(cx, 7.45, stZ - 0.3, G.x2 - G.x1 - 0.8, 0.16, 0.34, 0x3a2a1c, { jitter: 0.08 }); // 幕のレール

  // ステージのうえの、ふたが開いたままのピアノ
  {
    const px = cx + 4.2, pz = stZ + 2.4, py = 1.45;          // 舞台の高さ
    mb.box(px, py + 0.55, pz, 1.5, 0.55, 1.55, 0x241c22, { jitter: 0.05 });     // 本体
    mb.box(px, py + 0.86, pz, 1.56, 0.09, 1.6, 0x181218, { jitter: 0.05 });     // 天板
    mb.box(px + 0.1, py + 1.3, pz - 0.5, 1.3, 0.06, 1.0, 0x2c2028,
      { jitter: 0.06, rotY: 0.0 });                                             // 開いたふた
    mb.box(px + 0.72, py + 1.06, pz - 0.1, 0.07, 0.5, 0.07, 0x6a5a3a);          // つっかえ棒
    mb.box(px, py + 0.66, pz + 0.56, 1.24, 0.06, 0.32, 0xc4c0b0, { jitter: 0.05 }); // 鍵ばん
    mb.box(px, py + 0.8, pz + 0.7, 1.42, 0.22, 0.1, 0x1c161a, { jitter: 0.06 });   // 鍵ばんのふた
    for (let i = 0; i < 14; i++) {                                              // 黒鍵
      mb.box(px - 0.56 + i * 0.086, py + 0.71, pz + 0.5, 0.035, 0.04, 0.18, 0x14100f, { jitter: 0.1 });
    }
    for (const dx of [-0.62, 0.62]) for (const dz of [-0.5, 0.5]) {
      mb.box(px + dx, py + 0.14, pz + dz * 1.2, 0.11, 0.56, 0.11, 0x241c22);      // 脚
    }
    mb.box(px, py + 0.06, pz + 0.94, 0.5, 0.12, 0.3, 0x241c22, { jitter: 0.06 }); // ペダル箱
    // ピアノいす（たおれている）
    mb.box(px - 1.6, py + 0.12, pz + 0.9, 0.7, 0.24, 0.4, 0x3a2c22, { jitter: 0.1, rotY: 0.5 });
    col.add(px - 0.9, pz - 0.8, px + 0.9, pz + 1.1, 1.45, 2.6, "furn");
    props.push(makePiano(px, py, pz + 0.6));      // ひとりでに鳴る、あの音
    spawnSpots.push({ x: px - 2.6, z: pz, y: 1.45, floor: 0 });
  }

  // バスケットゴール（片方は傾いている）
  for (const [gz, tilt] of [[G.z1 + 2.2, 0], [stZ - 2.0, 0.22]]) {
    mb.box(cx, 4.3, gz, 1.8, 1.05, 0.09, 0xcfc9b8, { jitter: 0.06 });        // 板
    mb.box(cx, 4.15, gz - 0.05, 0.62, 0.48, 0.03, 0x8a3f2c, { jitter: 0.08 }); // 四角い印
    mb.box(cx, 3.72, gz + 0.3, 0.52, 0.06, 0.5, 0xa8571c, { jitter: 0.08 });   // リング
    mb.box(cx, 5.4, gz - 0.2, 0.14, 2.2, 0.14, C.metal, { jitter: 0.08 });     // 吊り金具
    if (tilt) mb.box(cx + 1.2, 2.6, gz + 0.5, 2.2, 0.1, 0.5, 0xdedad0, { jitter: 0.1, rotY: tilt });
  }

  // 肋木（ろくぼく）
  for (let z = G.z1 + 5; z < stZ - 3; z += 0.42) {
    mb.box(G.x1 + 0.5, 1.7, z, 0.4, 0.09, 0.09, 0xa07f4e, { jitter: 0.14 });
  }
  col.add(G.x1 + 0.3, G.z1 + 4.6, G.x1 + 0.8, stZ - 2.8, 0, 3.4, "wall");

  // 積み上げたマットと跳び箱
  for (let i = 0; i < 5; i++) mb.box(G.x2 - 3.4, 0.42 + i * 0.24, G.z1 + 4.2, 3.0, 0.22, 1.4, choice([0x3f5a7a, 0x6b3a44]), { jitter: 0.1 });
  col.add(G.x2 - 5.0, G.z1 + 3.4, G.x2 - 1.8, G.z1 + 5.0, 0, 1.7, "wall");
  for (let i = 0; i < 6; i++) mb.box(G.x1 + 4.0, 0.4 + i * 0.3, G.z1 + 4.0, 1.6 - i * 0.13, 0.28, 1.0 - i * 0.06, 0xa8804a, { jitter: 0.08 });
  col.add(G.x1 + 3.1, G.z1 + 3.4, G.x1 + 4.9, G.z1 + 4.6, 0, 2.2, "wall");

  // 転がったボールと、床のよごれ
  for (let i = 0; i < 5; i++) {
    props.push(makeBall(rand(G.x1 + 4, G.x2 - 4), 0.36, rand(G.z1 + 5, stZ - 2)));
  }
  grime(mb, G.x1 + 1, G.z1 + 1, G.x2 - 1, stZ - 1, 0.06, 0.5);
  props.push(makeCobweb(G.x1 + 1.0, H - 1.4, G.z1 + 1.0, 1.6));
  props.push(makeCobweb(G.x2 - 1.0, H - 1.4, G.z1 + 1.0, 1.6));

  for (const z of [G.z1 + 5, cz, stZ - 2]) lightSpots.push({ x: cx, y: H - 0.7, z, floor: 0 });
  for (let i = 0; i < 8; i++) spawnSpots.push({ x: rand(G.x1 + 2, G.x2 - 2), z: rand(G.z1 + 2, stZ - 1), y: 0.24, floor: 0 });

  rooms.push({ id: "gym", name: "体育館", floor: 0, cx, cz: cz - 2, y: 0.24,
    x1: G.x1, x2: G.x2, z1: G.z1, z2: G.z2, kind: "gym", label: "体育館" });
}

// 転がったボール
// サッカーゴール。柱・クロスバー・後ろへ傾いた支柱・ネットまで作る。
//  dir は「ゴールが開いている向き」（+1なら南むき）
function soccerGoal(mb, col, props, gx, gz, dir) {
  const W = 3.66, H = 2.44, D = 1.9;          // 半幅・高さ・おくゆき
  const POST = 0xe4e0d4, NET = 0xa8aeb4;
  const back = gz - dir * D;                  // ネットの後ろがわ
  // 両わきの柱
  for (const sx of [-W, W]) {
    mb.box(gx + sx, H / 2, gz, 0.15, H, 0.15, POST, { jitter: 0.06 });
    col.add(gx + sx - 0.11, gz - 0.11, gx + sx + 0.11, gz + 0.11, 0, H, "wall");
    // 後ろへ傾いた支柱
    mb.box(gx + sx, H / 2 - 0.15, gz - dir * D / 2, 0.11, 0.11, D * 1.06, POST,
      { jitter: 0.08, rotY: 0 });
    mb.box(gx + sx, 0.35, back, 0.12, 0.7, 0.12, POST, { jitter: 0.08 });
  }
  // クロスバー
  mb.box(gx, H - 0.07, gz, W * 2 + 0.15, 0.15, 0.15, POST, { jitter: 0.05 });
  mb.box(gx, 0.62, back, W * 2 + 0.12, 0.12, 0.12, POST, { jitter: 0.07 });

  // ネット：後ろの面（たてよこ）
  for (let x = -W; x <= W + 0.01; x += 0.42) {
    mb.box(gx + x, 0.35, back, 0.03, 0.7, 0.03, NET, { jitter: 0.3 });
  }
  for (let y = 0.15; y < 0.7; y += 0.2) {
    mb.box(gx, y, back, W * 2, 0.03, 0.03, NET, { jitter: 0.3 });
  }
  // ネット：上の面（クロスバーから後ろへ、ゆるやかに下がる）
  for (let x = -W; x <= W + 0.01; x += 0.42) {
    for (let k = 0; k < 4; k++) {
      const t = (k + 0.5) / 4;
      mb.box(gx + x, H - 0.1 - t * (H - 0.8), gz - dir * (D * t), 0.03, 0.03, D / 4, NET, { jitter: 0.3 });
    }
  }
  // ネット：両わきの三角
  for (const sx of [-W, W]) {
    for (let k = 0; k < 5; k++) {
      const t = (k + 0.5) / 5;
      const hh = (H - 0.1) * (1 - t) + 0.7 * t;
      mb.box(gx + sx, hh / 2, gz - dir * (D * t), 0.03, hh, 0.03, NET, { jitter: 0.3 });
    }
  }
  // ゴールの前の芝はげ（よく蹴られていた あと）
  mb.box(gx, 0.05, gz + dir * 1.6, W * 2.2, 0.04, 3.4, 0x5a5140, { jitter: 0.3 });

  // ボールを ころがしておく
  props.push(makeBall(gx + rand(-1.6, 1.6), 0.24, gz - dir * rand(0.3, 1.2), 0.22, true));
  props.push(makeBall(gx + rand(-4.5, 4.5), 0.24, gz + dir * rand(2.0, 5.0), 0.22, true));
}

function makeBall(x, y, z, r, soccer) {
  const rr = r || 0.12;
  const g = new THREE.Group();
  const col0 = soccer ? 0xdedad0 : choice([0xd8721f, 0xc9c4b4, 0x7a4a3a]);
  const m = new THREE.Mesh(new THREE.SphereGeometry(rr, soccer ? 14 : 12, soccer ? 12 : 10),
    new THREE.MeshLambertMaterial({ color: col0 }));
  g.add(m);
  if (soccer) {
    // 黒いパネルを ぺたぺた貼って、サッカーボールらしく
    const dark = new THREE.MeshLambertMaterial({ color: 0x2a2a30 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2, b = i % 2 ? 0.55 : -0.55;
      const p = new THREE.Mesh(new THREE.SphereGeometry(rr * 0.42, 6, 5), dark);
      p.position.set(Math.cos(a) * rr * 0.85, Math.sin(b) * rr * 0.85, Math.sin(a) * rr * 0.85);
      p.scale.set(1, 1, 0.45);
      p.lookAt(0, 0, 0);
      g.add(p);
    }
  }
  g.position.set(x, y, z);
  return { mesh: g, kind: "ball", x, z, update(dt, t) { g.rotation.y = t * 0.2; } };
}

// ============================================================
//  秘密のマップ
//   4階「音楽準備室」の奥の壁は、すりぬけでしか通れない。
//   その先に、忘れられた教室がひろがっている。
// ============================================================
const SECRET = { x1: 6, x2: 34, z1: -34, z2: -18, y: floorY(3), h: 5.2 };

function buildSecret(ctx) {
  const { mb, col, rooms, spawnSpots, props, lightSpots } = ctx;
  const S = SECRET, y0 = S.y, H = S.h;
  const cx = (S.x1 + S.x2) / 2, cz = (S.z1 + S.z2) / 2;

  // 床と天井
  tiled(mb, S.x1, S.z1, S.x2, S.z2, y0 + 0.02, 0.3, 0x6a5a72, 6);
  tiled(mb, S.x1, S.z1, S.x2, S.z2, y0 + H, 0.28, 0x3a3244, 6);
  // 四方の壁（外からは入れない）
  for (const e of [[S.z1, "x"], [S.z2, "x"]]) {
    wallWithHoles(mb, col, { axis: "x", fixed: e[0], from: S.x1, to: S.x2, y1: y0, y2: y0 + H, thick: 0.3, color: 0x5a4f6a });
  }
  wallWithHoles(mb, col, { axis: "z", fixed: S.x1, from: S.z1, to: S.z2, y1: y0, y2: y0 + H, thick: 0.3, color: 0x5a4f6a });
  wallWithHoles(mb, col, { axis: "z", fixed: S.x2, from: S.z1, to: S.z2, y1: y0, y2: y0 + H, thick: 0.3, color: 0x5a4f6a });

  // 入口となる「すりぬけ専用の壁」
  //   4階の音楽準備室（x 20〜26）の北の外壁ぎわに、細い通路をつなぐ
  const gate = { x: 23, z1: RZ1, z2: S.z2 };
  tiled(mb, gate.x - 1.4, gate.z1 - 4.2, gate.x + 1.4, gate.z1 + 0.2, y0 + 0.02, 0.3, 0x6a5a72, 3);
  tiled(mb, gate.x - 1.4, gate.z1 - 4.2, gate.x + 1.4, gate.z1 + 0.2, y0 + 3.2, 0.28, 0x3a3244, 3);
  for (const sx of [gate.x - 1.4, gate.x + 1.4]) {
    wallWithHoles(mb, col, { axis: "z", fixed: sx, from: gate.z1 - 4.2, to: gate.z1 + 0.2, y1: y0, y2: y0 + 3.2, thick: 0.24, color: 0x5a4f6a });
  }
  // 目印：床にうっすら光る印
  for (let i = 0; i < 4; i++) {
    mb.box(gate.x, y0 + 0.06, RZ1 + 2.2 - i * 0.5, 0.62 - i * 0.11, 0.03, 0.16, 0x8f6bff, { jitter: 0.15 });
  }
  props.push(makeSecretGlow(gate.x, y0 + 1.5, RZ1 + 0.28));

  // 中身：忘れられた教室
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 3; j++) {
      const dx = S.x1 + 4 + i * 5.5, dz = S.z1 + 4 + j * 4;
      if (Math.random() < 0.3) { tippedDesk(mb, col, dx, dz, y0, rand(0, 6.28)); continue; }
      desk(mb, col, dx, dz, y0, rand(0, 6.28));
      chair(mb, col, dx + 0.9, dz, y0, rand(0, 6.28));
    }
  // 中央に、ぽつんと置かれた古いオルガン
  mb.box(cx, y0 + 0.55, cz, 1.6, 1.1, 0.8, 0x2a2230, { jitter: 0.06 });
  mb.box(cx, y0 + 1.14, cz + 0.3, 1.3, 0.08, 0.34, 0xe8e6dc, { jitter: 0.05 });
  col.add(cx - 0.9, cz - 0.5, cx + 0.9, cz + 0.5, y0, y0 + 1.2, "furn");
  // 黒板に書かれた、消えかけの文字
  mb.box(S.x1 + 0.4, y0 + 2.0, cz, 0.14, 1.4, 7.0, C.board, { jitter: 0.04 });
  for (let i = 0; i < 12; i++) {
    mb.box(S.x1 + 0.5, y0 + 1.7 + rand(0, 0.7), cz - 3 + i * 0.55, 0.03, rand(0.1, 0.3), rand(0.1, 0.3),
      0xd8d4c8, { jitter: 0.3 });
  }
  // 宙に浮くカケラ（雰囲気）
  props.push(makeSecretMotes(cx, y0 + 2.2, cz));
  props.push(makeCobweb(S.x1 + 1, y0 + H - 0.8, S.z1 + 1, 1.6));
  props.push(makeCobweb(S.x2 - 1, y0 + H - 0.8, S.z1 + 1, 1.6));
  for (const z of [S.z1 + 4, cz, S.z2 - 4]) lightSpots.push({ x: cx, y: y0 + H - 0.6, z, floor: 3 });

  // 材料がたっぷり
  for (let i = 0; i < 34; i++) {
    spawnSpots.push({ x: rand(S.x1 + 1.5, S.x2 - 1.5), z: rand(S.z1 + 1.5, S.z2 - 1.5), y: y0, floor: 3, rich: true });
  }
  rooms.push({ id: "secret", name: "忘れられた教室", floor: 3, cx, cz, y: y0,
    x1: S.x1, x2: S.x2, z1: S.z1, z2: S.z2, kind: "secret", label: "？？？", secret: true });
}

function makeSecretGlow(x, y, z) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.9),
    new THREE.MeshBasicMaterial({ color: 0xa98bff, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }));
  m.position.set(x, y, z);
  return { mesh: m, kind: "secretGate", x, z,
    update(dt, t) { m.material.opacity = 0.2 + Math.sin(t * 1.6) * 0.09 + Math.sin(t * 5.1) * 0.03; } };
}

function makeSecretMotes(x, y, z) {
  const N = 90, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = x + rand(-13, 13); pos[i * 3 + 1] = y + rand(-1.6, 2.4); pos[i * 3 + 2] = z + rand(-7, 7);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xc9a6ff, size: 0.09, transparent: true, opacity: 0.6, depthWrite: false }));
  return { mesh: pts, kind: "motes", x, z,
    update(dt, t) {
      const a = g.attributes.position.array;
      for (let i = 1; i < a.length; i += 3) { a[i] += dt * 0.09; if (a[i] > y + 2.6) a[i] = y - 1.6; }
      g.attributes.position.needsUpdate = true;
    } };
}
