// 汎用ユーティリティ ------------------------------------------
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

// 種をあたえると、いつも同じ順番の乱数になる（mulberry32）
// ともだちと遊ぶとき、全員が同じ校舎・同じ人たちを見るために使う
export function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let _rng = Math.random;
// seed に数を渡すと種つき、null にもどすと、ふつうのランダムにもどる
export function seedRandom(seed) { _rng = (seed == null) ? Math.random : makeRng(seed); }

export const rand = (a = 0, b = 1) => a + _rng() * (b - a);
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const choice = (arr) => arr[Math.floor(_rng() * arr.length)];
export const dist2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };
export const dist = (ax, az, bx, bz) => Math.sqrt(dist2(ax, az, bx, bz));

export function angleLerp(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// ============================================================
//  当たり判定：XZ平面の AABB 集合
//  box = {x1,z1,x2,z2, y1,y2, tag}
// ============================================================
export class Colliders {
  constructor() { this.boxes = []; this.grid = null; this.cell = 8; }

  add(x1, z1, x2, z2, y1 = 0, y2 = 3.2, tag = "wall") {
    this.boxes.push({
      x1: Math.min(x1, x2), z1: Math.min(z1, z2),
      x2: Math.max(x1, x2), z2: Math.max(z1, z2),
      y1, y2, tag,
    });
    this.grid = null;
    return this;
  }

  // 空間ハッシュを構築（一度だけ）
  build() {
    const g = new Map();
    const c = this.cell;
    for (let i = 0; i < this.boxes.length; i++) {
      const b = this.boxes[i];
      for (let gx = Math.floor(b.x1 / c); gx <= Math.floor(b.x2 / c); gx++)
        for (let gz = Math.floor(b.z1 / c); gz <= Math.floor(b.z2 / c); gz++) {
          const k = gx + "," + gz;
          if (!g.has(k)) g.set(k, []);
          g.get(k).push(i);
        }
    }
    this.grid = g;
    return this;
  }

  near(x, z, r = 1) {
    if (!this.grid) this.build();
    const c = this.cell, out = [], seen = new Set();
    for (let gx = Math.floor((x - r) / c); gx <= Math.floor((x + r) / c); gx++)
      for (let gz = Math.floor((z - r) / c); gz <= Math.floor((z + r) / c); gz++) {
        const arr = this.grid.get(gx + "," + gz);
        if (!arr) continue;
        for (const i of arr) if (!seen.has(i)) { seen.add(i); out.push(this.boxes[i]); }
      }
    return out;
  }

  // 円(x,z,r) を y の高さで箱から押し出す。戻り値 {x,z,hit}
  //  minTop … これより 上まで つづいている箱だけを 見る。
  //    屋上に立ったとき、下の階の かべ（上が 屋根と同じ高さで
  //    おわっている）に ぶつからないように するため。
  resolve(x, z, r, y = 1.0, ignore = null, minTop = null) {
    let hit = false;
    for (let pass = 0; pass < 2; pass++) {
      for (const b of this.near(x, z, r + 0.5)) {
        if (y + 0.6 < b.y1 || y - 0.6 > b.y2) continue;
        if (minTop !== null && b.y2 < minTop) continue;
        if (ignore && ignore.indexOf(b.tag) >= 0) continue;
        const cx = clamp(x, b.x1, b.x2);
        const cz = clamp(z, b.z1, b.z2);
        const dx = x - cx, dz = z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        hit = true;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          x = cx + (dx / d) * r;
          z = cz + (dz / d) * r;
        } else {
          // 中心が箱の内側 → いちばん近い面へ逃がす
          const l = x - b.x1, rr = b.x2 - x, u = z - b.z1, dn = b.z2 - z;
          const m = Math.min(l, rr, u, dn);
          if (m === l) x = b.x1 - r; else if (m === rr) x = b.x2 + r;
          else if (m === u) z = b.z1 - r; else z = b.z2 + r;
        }
      }
    }
    return { x, z, hit };
  }

  // 歩いて通り抜けられるか（腰高の窓で止まる高さで見る。机やイスは迂回できるので無視）
  navSight(ax, az, bx, bz, floorY = 0) {
    return this.lineOfSight(ax, az, bx, bz, floorY + 0.6, 0.12, ["furn"]);
  }

  // 視線が通るか（XZ平面のレイ vs AABB、指定の高さ帯のみ）
  lineOfSight(ax, az, bx, bz, y = 1.4, step = 0.15, ignore = null) {
    const dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) return true;
    const n = Math.ceil(len / Math.min(step, 0.15));
    for (let i = 1; i < n; i++) {
      const t = i / n, px = ax + dx * t, pz = az + dz * t;
      for (const b of this.near(px, pz, 0.2)) {
        if (b.tag === "soft") continue;
        if (ignore && ignore.indexOf(b.tag) >= 0) continue;
        if (y < b.y1 || y > b.y2) continue;
        if (px > b.x1 && px < b.x2 && pz > b.z1 && pz < b.z2) return false;
      }
    }
    return true;
  }
}

// ============================================================
//  簡易ウェイポイント・ナビ（人間・おばけの経路探索用）
// ============================================================
export class NavGraph {
  constructor() { this.nodes = []; this.links = []; }

  addNode(x, z, floor = 0, room = "", y = null) {
    this.nodes.push({ x, z, floor, room, y: y === null ? floor * 3.6 : y, i: this.nodes.length });
    this.links.push([]);
    return this.nodes.length - 1;
  }

  link(a, b) {
    if (a === b) return;
    if (!this.links[a].includes(b)) this.links[a].push(b);
    if (!this.links[b].includes(a)) this.links[b].push(a);
  }

  // 距離しきい値内かつ視線が通るノード同士を自動接続
  autoLink(colliders, maxDist = 14) {
    for (let i = 0; i < this.nodes.length; i++)
      for (let j = i + 1; j < this.nodes.length; j++) {
        const a = this.nodes[i], b = this.nodes[j];
        if (a.floor !== b.floor) continue;
        if (dist(a.x, a.z, b.x, b.z) > maxDist) continue;
        if (!colliders.navSight(a.x, a.z, b.x, b.z, a.y || 0)) continue;
        this.link(i, j);
      }
    return this;
  }

  // colliders を渡すと「壁ごしに近いだけの点」を除外する。
  // 近い順に見て、最初に歩いてたどり着けたノードを返す。
  nearest(x, z, floor = 0, colliders = null, maxR = 26, y = null) {
    const fy = y === null ? floor * 3.6 : y;
    const cand = [];
    let any = -1, ad = Infinity;
    const maxD2 = maxR * maxR;
    for (const n of this.nodes) {
      if (n.floor !== floor) continue;
      const d = dist2(x, z, n.x, n.z);
      if (d < ad) { ad = d; any = n.i; }
      if (d <= maxD2) cand.push({ i: n.i, d, n });
    }
    if (!colliders) return any;
    cand.sort((a, b) => a.d - b.d);
    for (const c of cand) {
      if (colliders.navSight(x, z, c.n.x, c.n.z, fy)) return c.i;
    }
    return any;   // どこへも歩けない位置なら、単純な最寄りで妥協する
  }

  // A*（ノード数が少ないのでダイクストラで十分）
  path(from, to) {
    if (from < 0 || to < 0) return null;
    if (from === to) return [from];
    const N = this.nodes.length;
    const g = new Float64Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1);
    const done = new Uint8Array(N);
    g[from] = 0;
    for (;;) {
      let u = -1, bd = Infinity;
      for (let i = 0; i < N; i++) if (!done[i] && g[i] < bd) { bd = g[i]; u = i; }
      if (u < 0) return null;
      if (u === to) break;
      done[u] = 1;
      for (const v of this.links[u]) {
        const a = this.nodes[u], b = this.nodes[v];
        const nd = g[u] + dist(a.x, a.z, b.x, b.z);
        if (nd < g[v]) { g[v] = nd; prev[v] = u; }
      }
    }
    const out = [];
    for (let c = to; c !== -1; c = prev[c]) out.push(c);
    return out.reverse();
  }
}
