import * as THREE from "../lib/three.module.js";

// ============================================================
//  静的ジオメトリをひとつのメッシュにまとめるビルダー
//  （廃校まるごとを 1〜2 ドローコールで描くため）
// ============================================================
const FACES = [
  // dir, normal, 4 corners (単位立方体 -0.5..0.5)
  { n: [0, 0, 1],  v: [[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5]] },      // +Z
  { n: [0, 0,-1],  v: [[.5,-.5,-.5],[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5]] },  // -Z
  { n: [1, 0, 0],  v: [[.5,-.5,.5],[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5]] },      // +X
  { n: [-1,0, 0],  v: [[-.5,-.5,-.5],[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5]] },  // -X
  { n: [0, 1, 0],  v: [[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5],[-.5,.5,-.5]] },      // +Y
  { n: [0,-1, 0],  v: [[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5],[-.5,-.5,.5]] },  // -Y
];

const _c = new THREE.Color();

export class MeshBuilder {
  constructor() {
    this.pos = []; this.nor = []; this.col = []; this.idx = [];
    this.count = 0;
  }

  // 中心(cx,cy,cz) サイズ(sx,sy,sz) の直方体
  box(cx, cy, cz, sx, sy, sz, color, opt = {}) {
    const shade = opt.shade !== undefined ? opt.shade : 0.12; // 面ごとの陰影
    const jitter = opt.jitter || 0;
    const rotY = opt.rotY || 0;
    const cos = Math.cos(rotY), sin = Math.sin(rotY);
    _c.set(color);
    if (jitter) {
      const j = 1 + (Math.random() - 0.5) * jitter;
      _c.multiplyScalar(j);
    }
    const base = [_c.r, _c.g, _c.b];
    for (let f = 0; f < 6; f++) {
      const F = FACES[f];
      // 上面は明るく、下面は暗く、側面は方向で微差
      let k = 1;
      if (F.n[1] === 1) k = 1 + shade * 1.4;
      else if (F.n[1] === -1) k = 1 - shade * 0.8;
      else if (F.n[0] !== 0) k = 1 - shade * 0.55;
      else k = 1 + shade * 0.15;
      const r = base[0] * k, g = base[1] * k, b = base[2] * k;
      let nx = F.n[0], nz = F.n[2];
      if (rotY) { const t = nx * cos - nz * sin; nz = nx * sin + nz * cos; nx = t; }
      const s = this.count;
      for (let i = 0; i < 4; i++) {
        let vx = F.v[i][0] * sx, vy = F.v[i][1] * sy, vz = F.v[i][2] * sz;
        if (rotY) { const t = vx * cos - vz * sin; vz = vx * sin + vz * cos; vx = t; }
        this.pos.push(cx + vx, cy + vy, cz + vz);
        this.nor.push(nx, F.n[1], nz);
        this.col.push(r, g, b);
      }
      this.idx.push(s, s + 1, s + 2, s, s + 2, s + 3);
      this.count += 4;
    }
    return this;
  }

  // 2点(x1,z1)-(x2,z2)を結ぶ厚み t・高さ y1..y2 の壁
  wall(x1, z1, x2, z2, y1, y2, t, color, opt = {}) {
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) return this;
    const ang = Math.atan2(dx, dz); // Z方向を基準
    return this.box((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2,
      t, y2 - y1, len, color, { ...opt, rotY: ang });
  }

  // 水平な床/天井の板
  slab(x1, z1, x2, z2, y, thick, color, opt = {}) {
    return this.box((x1 + x2) / 2, y - thick / 2, (z1 + z2) / 2,
      Math.abs(x2 - x1), thick, Math.abs(z2 - z1), color, opt);
  }

  finish(material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return new THREE.Mesh(g, material);
  }

  get triangles() { return this.idx.length / 3; }
}

// 開口部（ドア・窓）をあけた壁を生成するヘルパー
// axis: "x" なら z 固定で x1→x2、"z" なら x 固定で z1→z2
// holes: [{a, b, y1, y2}]  a,b は軸方向の座標範囲
export function wallWithHoles(mb, colliders, opt) {
  const { axis, fixed, from, to, y1, y2, thick, color, holes = [], tag = "wall", collide = true, jitter = 0.06 } = opt;
  const segs = [];
  const sorted = [...holes].sort((p, q) => p.a - q.a);
  let cur = from;
  for (const h of sorted) {
    const ha = Math.max(from, Math.min(h.a, h.b));
    const hb = Math.min(to, Math.max(h.a, h.b));
    if (hb <= cur) continue;
    if (ha > cur) segs.push({ a: cur, b: ha, y1, y2 });
    // 開口の上下に残る壁（まぐさ・腰壁）
    const hy1 = h.y1 !== undefined ? h.y1 : 0;
    const hy2 = h.y2 !== undefined ? h.y2 : y2;
    if (hy1 > y1) segs.push({ a: ha, b: hb, y1, y2: hy1, low: true });
    if (hy2 < y2) segs.push({ a: ha, b: hb, y1: hy2, y2, high: true });
    cur = Math.max(cur, hb);
  }
  if (cur < to) segs.push({ a: cur, b: to, y1, y2 });

  for (const s of segs) {
    if (s.b - s.a < 1e-3) continue;
    if (axis === "x") {
      mb.box((s.a + s.b) / 2, (s.y1 + s.y2) / 2, fixed, s.b - s.a, s.y2 - s.y1, thick, color, { jitter });
      if (collide) colliders.add(s.a, fixed - thick / 2, s.b, fixed + thick / 2, s.y1, s.y2, s.high ? "lintel" : tag);
    } else {
      mb.box(fixed, (s.y1 + s.y2) / 2, (s.a + s.b) / 2, thick, s.y2 - s.y1, s.b - s.a, color, { jitter });
      if (collide) colliders.add(fixed - thick / 2, s.a, fixed + thick / 2, s.b, s.y1, s.y2, s.high ? "lintel" : tag);
    }
  }
}
