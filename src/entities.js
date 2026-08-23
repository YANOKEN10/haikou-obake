import * as THREE from "../lib/three.module.js";
import { clamp, lerp, rand, choice, dist } from "./util.js";
import { MATERIALS, TRAPS, GHOSTS } from "./data.js";

// ============================================================
//  落ちている材料
// ============================================================
export class Pickup {
  constructor(scene, kind, x, z, y = 0.55) {
    this.kind = kind; this.x = x; this.z = z; this.y = y;
    this.taken = false;
    const def = MATERIALS[kind];
    const mat = new THREE.MeshLambertMaterial({
      color: def.color, emissive: def.color, emissiveIntensity: 0.75,
      transparent: true, opacity: 0.95,
    });
    this.mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), mat);
    this.mesh.position.set(x, y, z);
    this.mat = mat;
    this.phase = rand(0, 6.3);
    scene.add(this.mesh);
    this.scene = scene;
  }
  update(dt, t) {
    this.mesh.rotation.y += dt * 1.6;
    this.mesh.rotation.x = Math.sin(t * 1.3 + this.phase) * 0.3;
    this.mesh.position.y = this.y + Math.sin(t * 2.2 + this.phase) * 0.12;
    this.mat.emissiveIntensity = 0.6 + Math.sin(t * 3 + this.phase) * 0.25;
  }
  dispose() { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mat.dispose(); }
}

// ============================================================
//  設置した仕掛け
// ============================================================
const TRAP_COLOR = {
  locker: 0x89a0ad, chalk: 0xe8e2c8, uwabaki: 0xd9cfb4,
  piano: 0x2a2a3a, suido: 0x7fd0e8, jintai: 0xd7a58f,
  tsuru: 0xffd97a, kagami: 0xb8d8e8, housou: 0xd8a85e,
  fumikiri: 0x8a7a4a, ofuda: 0xe8e4d4, kyuushoku: 0xc9c4b4,
};

export class Trap {
  constructor(scene, id, x, z, yaw = 0) {
    this.id = id; this.def = TRAPS[id];
    this.x = x; this.z = z;
    this.cool = 0; this.fireT = 0; this.uses = 0;
    this.group = new THREE.Group();
    this.group.position.set(x, 0, z);
    this.group.rotation.y = yaw;

    const col = TRAP_COLOR[id] || 0x88ccaa;
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 1.4, 0.55),
      new THREE.MeshLambertMaterial({ color: col, emissive: col, emissiveIntensity: 0.12 })
    );
    body.position.y = 0.72;
    this.body = body;
    this.group.add(body);
    if (this.def.slip) {
      // ワックスの水たまり。低くて広い
      body.scale.set(1.1, 0.07, 1.1);
      body.position.y = 0.06;
      const pool = new THREE.Mesh(
        new THREE.CircleGeometry(this.def.radius, 22),
        new THREE.MeshBasicMaterial({ color: 0xffd97a, transparent: true, opacity: 0.16,
          side: THREE.DoubleSide, depthWrite: false })
      );
      pool.rotation.x = -Math.PI / 2;
      pool.position.y = 0.035;
      this.pool = pool;
      this.group.add(pool);
    }

    // 足元の魔法陣
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 1.0, 26),
      new THREE.MeshBasicMaterial({ color: 0x8f6bff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    this.ring = ring;
    this.group.add(ring);

    // 発動時に広がる波紋
    const wave = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.15, 30),
      new THREE.MeshBasicMaterial({ color: 0xff6bd0, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
    );
    wave.rotation.x = -Math.PI / 2;
    wave.position.y = 0.06;
    this.wave = wave;
    this.group.add(wave);

    this.icon = makeIconSprite(this.def.icon);
    this.icon.position.y = 1.85;
    this.group.add(this.icon);

    scene.add(this.group);
    this.scene = scene;
  }

  update(dt, t) {
    if (this.pool) this.pool.material.opacity = 0.12 + Math.sin(t * 2.1 + this.x) * 0.05;

    this.cool = Math.max(0, this.cool - dt);
    this.fireT = Math.max(0, this.fireT - dt);
    const f = this.fireT > 0 ? this.fireT / 0.9 : 0;
    this.body.rotation.z = f ? Math.sin(t * 55) * 0.22 * f : 0;
    this.body.position.y = 0.72 + (f ? Math.abs(Math.sin(t * 30)) * 0.16 * f : 0);
    this.ring.material.opacity = (this.cool > 0 ? 0.12 : 0.32) + Math.sin(t * 2.4) * 0.06;
    this.icon.position.y = 1.85 + Math.sin(t * 2.1) * 0.06;

    if (f > 0) {
      const k = 1 + (1 - f) * 5;
      this.wave.scale.set(k, k, k);
      this.wave.material.opacity = f * 0.6;
    } else this.wave.material.opacity = 0;
  }

  fire() { this.cool = this.def.cooldown; this.fireT = 0.9; this.uses++; }
  dispose() { this.scene.remove(this.group); }
}

function makeIconSprite(ch) {
  const cv = document.createElement("canvas");
  cv.width = 96; cv.height = 96;
  const g = cv.getContext("2d");
  g.font = "70px serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(ch, 48, 52);
  const tex = new THREE.CanvasTexture(cv);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(0.7, 0.7, 1);
  return sp;
}

// ============================================================
//  召喚したおばけ（お供）
// ============================================================
export class Summon {
  constructor(scene, world, id, x, z) {
    this.id = id; this.def = GHOSTS[id];
    this.world = world;
    this.x = x; this.z = z; this.y = 1.2;
    this.yaw = 0;
    this.life = this.def.life;
    this.cool = 0;
    this.dead = false;
    this.phase = rand(0, 6.3);
    this.wanderT = 0;
    this.tx = x; this.tz = z;

    this.group = new THREE.Group();
    buildSummonMesh(this.group, id);
    this.group.position.set(x, this.y, z);
    scene.add(this.group);
    this.scene = scene;
  }

  update(dt, t, humans) {
    this.life -= dt;
    this.cool = Math.max(0, this.cool - dt);
    if (this.life <= 0) { this.dead = true; return null; }

    // いちばん近い人間を探す
    let best = null, bd = 1e9;
    for (const h of humans) {
      if (h.out) continue;
      const d = dist(this.x, this.z, h.x, h.z);
      if (d < bd) { bd = d; best = h; }
    }

    const spd = this.def.speed;
    if (spd > 0) {
      let tx, tz;
      if (best && bd < 26) { tx = best.x; tz = best.z; }
      else {
        this.wanderT -= dt;
        if (this.wanderT <= 0) {
          this.wanderT = rand(3, 7);
          this.tx = this.x + rand(-12, 12); this.tz = this.z + rand(-12, 12);
        }
        tx = this.tx; tz = this.tz;
      }
      const d = dist(this.x, this.z, tx, tz);
      if (d > 0.8) {
        const nx = this.x + ((tx - this.x) / d) * spd * dt;
        const nz = this.z + ((tz - this.z) / d) * spd * dt;
        const r = this.world.colliders.resolve(nx, nz, 0.35, this.y);
        this.x = r.x; this.z = r.z;
        this.yaw = Math.atan2(tx - this.x, tz - this.z);
      }
    }

    this.y = 1.15 + Math.sin(t * 2.4 + this.phase) * 0.18;
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = this.yaw;
    this.group.rotation.z = Math.sin(t * 3 + this.phase) * 0.06;

    // 射程内の人間を驚かす
    if (best && bd < this.def.radius && this.cool <= 0) {
      if (this.world.colliders.lineOfSight(this.x, this.z, best.x, best.z, 1.3, 0.7)) {
        this.cool = 4.5;
        return { human: best, amount: this.def.fear, line: choice(this.def.lines) };
      }
    }
    return null;
  }

  dispose() { this.scene.remove(this.group); }
}

function buildSummonMesh(g, id) {
  if (id === "hitotsume") {
    const m = new THREE.MeshLambertMaterial({ color: 0xa8e6a3, emissive: 0x3d7a48, emissiveIntensity: 0.5 });
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 12), m); g.add(b);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 12), new THREE.MeshBasicMaterial({ color: 0xfdfdf5 }));
    eye.position.set(0, 0.06, 0.32); g.add(eye);
    const pup = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: 0x151515 }));
    pup.position.set(0, 0.06, 0.46); g.add(pup);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.26), m);
    foot.position.set(-0.16, -0.42, 0.08); g.add(foot);
    const foot2 = foot.clone(); foot2.position.x = 0.16; g.add(foot2);
  } else if (id === "randoseru") {
    const m = new THREE.MeshLambertMaterial({ color: 0xc0392b, emissive: 0x5a1b14, emissiveIntensity: 0.4 });
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.56, 0.34), m); g.add(b);
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.3, 0.06), m);
    flap.position.set(0, 0.16, 0.2); g.add(flap);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe14d }));
    eye.position.set(-0.13, 0.05, 0.2); g.add(eye);
    const eye2 = eye.clone(); eye2.position.x = 0.13; g.add(eye2);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.3, 0.07), new THREE.MeshLambertMaterial({ color: 0x40342c }));
    leg.position.set(-0.14, -0.4, 0); g.add(leg);
    const leg2 = leg.clone(); leg2.position.x = 0.14; g.add(leg2);
  } else if (id === "kubinashi") {
    // くびなし体操服：白い体操服だけが 準備運動をしている
    const m = new THREE.MeshLambertMaterial({ color: 0xf2efe6, emissive: 0x6a7a8a, emissiveIntensity: 0.4,
      transparent: true, opacity: 0.94 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.6, 0.26), m);
    body.position.y = 0.1; g.add(body);
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.02),
      new THREE.MeshBasicMaterial({ color: 0xd44a3a }));
    line.position.set(0, 0.2, 0.14); g.add(line);          // 赤い ゼッケンの線
    for (const sx of [-0.32, 0.32]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.44, 0.14), m);
      arm.position.set(sx, 0.16, 0); arm.rotation.z = sx > 0 ? -0.9 : 0.9; g.add(arm);
    }
    const pants = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.3, 0.28),
      new THREE.MeshLambertMaterial({ color: 0x2f3f6a }));
    pants.position.y = -0.32; g.add(pants);
    for (const sx of [-0.13, 0.13]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.3, 0.14), m);
      leg.position.set(sx, -0.6, 0); g.add(leg);
    }
    // 首から上は、なにもない
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.15, 12),
      new THREE.MeshBasicMaterial({ color: 0x090a10, side: THREE.DoubleSide }));
    hole.rotation.x = -Math.PI / 2; hole.position.y = 0.41; g.add(hole);

  } else if (id === "kagerou") {
    // かげろう先生：細長い影。近づくほど 背がのびて見える
    const m = new THREE.MeshLambertMaterial({ color: 0x14121c, emissive: 0x241f38,
      emissiveIntensity: 0.6, transparent: true, opacity: 0.88 });
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.3, 2.3, 10, 1, true), m);
    body.position.y = 0.2; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), m);
    head.position.y = 1.34; head.scale.set(0.85, 1.25, 0.85); g.add(head);
    for (const sx of [-0.2, 0.2]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
      eye.position.set(sx * 0.55, 1.36, 0.17); g.add(eye);
    }
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.1, 0.09), m);
    arm.position.set(-0.28, 0.7, 0.05); arm.rotation.z = 0.16; g.add(arm);
    const arm2 = arm.clone(); arm2.position.x = 0.28; arm2.rotation.z = -0.16; g.add(arm2);
    const chalk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 6),
      new THREE.MeshBasicMaterial({ color: 0xf2efe4 }));
    chalk.position.set(0.3, 0.16, 0.08); g.add(chalk);

  } else if (id === "ranchi") {
    // からっぽ椅子の大合唱：椅子が かさなって 立ちあがっている
    const wood = new THREE.MeshLambertMaterial({ color: 0x8a6a3a, emissive: 0x4a2f1a, emissiveIntensity: 0.4 });
    const iron = new THREE.MeshLambertMaterial({ color: 0x4a4a52, emissive: 0x22222a, emissiveIntensity: 0.3 });
    for (let k = 0; k < 3; k++) {
      const y = -0.5 + k * 0.52, s = 1 - k * 0.13, rot = k * 1.1;
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42 * s, 0.06, 0.4 * s), wood);
      seat.position.set(0, y, 0); seat.rotation.y = rot; g.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.42 * s, 0.3 * s, 0.05), wood);
      back.position.set(Math.sin(rot) * 0.18, y + 0.2 * s, Math.cos(rot) * -0.18);
      back.rotation.y = rot; g.add(back);
      for (const sx of [-0.16, 0.16]) for (const sz of [-0.16, 0.16]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.24 * s, 0.03), iron);
        const rx = sx * Math.cos(rot) - sz * Math.sin(rot), rz = sx * Math.sin(rot) + sz * Math.cos(rot);
        leg.position.set(rx * s * 2, y - 0.15 * s, rz * s * 2); g.add(leg);
      }
    }
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xffd45e, transparent: true, opacity: 0.09, depthWrite: false }));
    g.add(glow);

  } else if (id === "ookami") {
    // 巨大てるてる坊主
    const cloth = new THREE.MeshLambertMaterial({ color: 0xefe9de, emissive: 0x8a7f6a,
      emissiveIntensity: 0.4, transparent: true, opacity: 0.93 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 14), cloth);
    head.position.y = 0.6; g.add(head);
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.95, 1.7, 16, 1, true), cloth);
    body.position.y = -0.6; g.add(body);
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.07, 8, 18),
      new THREE.MeshLambertMaterial({ color: 0x8a2a3a }));
    tie.rotation.x = Math.PI / 2; tie.position.y = 0.08; g.add(tie);
    for (const sx of [-0.24, 0.24]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0x14100f }));
      eye.position.set(sx, 0.68, 0.52); eye.scale.set(1, 1.4, 0.5); g.add(eye);
    }
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0x14100f }));
    mouth.position.set(0, 0.42, 0.56); mouth.scale.set(1.1, 0.45, 0.35); g.add(mouth);
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 6),
      new THREE.MeshBasicMaterial({ color: 0x8a7a52 }));
    rope.position.y = 2.0; g.add(rope);

  } else {
    // トイレのハナコさん
    const m = new THREE.MeshLambertMaterial({ color: 0xf0e8e2, emissive: 0x8a4f6a, emissiveIntensity: 0.35, transparent: true, opacity: 0.92 });
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.25, 14, 1, true), m);
    body.position.y = -0.15; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 12), m);
    head.position.y = 0.62; g.add(head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.27, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.7),
      new THREE.MeshLambertMaterial({ color: 0x1e1a1e }));
    hair.position.y = 0.64; g.add(hair);
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.28), new THREE.MeshLambertMaterial({ color: 0xd4453f }));
    skirt.position.y = 0.18; g.add(skirt);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    eye.position.set(-0.09, 0.62, 0.21); g.add(eye);
    const eye2 = eye.clone(); eye2.position.x = 0.09; g.add(eye2);
  }
}

// ============================================================
//  「わっ！」などの浮き上がるテキスト
// ============================================================
export class FloatText {
  constructor(scene, text, x, y, z, color = "#ffe27a", size = 1.9) {
    const cv = document.createElement("canvas");
    cv.width = 512; cv.height = 128;
    const g = cv.getContext("2d");
    g.font = "bold 76px 'DotGothic16', sans-serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.lineWidth = 10; g.strokeStyle = "rgba(0,0,0,0.85)";
    g.strokeText(text, 256, 66);
    g.fillStyle = color;
    g.fillText(text, 256, 66);
    const tex = new THREE.CanvasTexture(cv);
    this.mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
    this.sprite = new THREE.Sprite(this.mat);
    this.sprite.scale.set(size * 2, size * 0.5, 1);
    this.sprite.position.set(x, y, z);
    this.sprite.renderOrder = 20;
    scene.add(this.sprite);
    this.scene = scene;
    this.life = 1.6;
    this.dead = false;
  }
  update(dt) {
    this.life -= dt;
    this.sprite.position.y += dt * 1.15;
    this.mat.opacity = clamp(this.life / 0.7, 0, 1);
    const s = 1 + (1.6 - this.life) * 0.12;
    this.sprite.scale.set(this.sprite.scale.x, this.sprite.scale.y, 1);
    if (this.life <= 0) { this.dead = true; this.scene.remove(this.sprite); this.mat.map.dispose(); this.mat.dispose(); }
  }
}

// ============================================================
//  隠し要素①：赤いワンピースの女の子
//   誰もいない部屋にいるとき、窓の外をスーッと横切る。
//   音もなく、数秒で消える。気づけた人だけのごほうび。
// ============================================================
export class RedLady {
  constructor(scene) {
    this.g = new THREE.Group();
    const dress = new THREE.MeshLambertMaterial({ color: 0x8e1220, emissive: 0x2a0207, emissiveIntensity: 0.5 });
    const skin = new THREE.MeshLambertMaterial({ color: 0xd9c3b4, emissive: 0x2a2226, emissiveIntensity: 0.3 });
    const hairM = new THREE.MeshLambertMaterial({ color: 0x0b0a0d });

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.34, 1.15, 12), dress);
    body.position.y = 0.72; this.g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 12, 10), skin);
    head.position.y = 1.45; this.g.add(head);
    // 顔をおおう長い黒髪
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.86, 0.28), hairM);
    hair.position.set(0, 1.20, -0.01); this.g.add(hair);
    const front = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.30, 0.06), hairM);
    front.position.set(0, 1.46, 0.13); this.g.add(front);
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.5, 0.07), skin);
    armL.position.set(-0.2, 1.02, 0.02); this.g.add(armL);
    const armR = armL.clone(); armR.position.x = 0.2; this.g.add(armR);

    this.g.visible = false;
    scene.add(this.g);
    this.scene = scene;
    this.t = 0;
    this.cool = 70;            // 最初はしばらく出ない
    this.active = false;
  }

  // 出てよい状況か（誰もいない部屋にひとりでいる）
  canAppear(world, player, humans) {
    if (!world.isIndoors(player.x, player.z)) return false;
    const room = world.roomAt(player.x, player.z);
    if (room === "廊下" || room === "昇降口" || room === "中庭") return false;
    for (const h of humans) if (!h.out && dist(h.x, h.z, player.x, player.z) < 22) return false;
    return true;
  }

  update(dt, world, player, humans) {
    if (this.active) {
      this.t += dt;
      const p = this.t / 5.2;
      if (p >= 1) { this.active = false; this.g.visible = false; return null; }
      this.g.position.x = this.from + (this.to - this.from) * p;
      // 出はじめと終わりは、すうっと薄れる
      const fade = Math.min(1, Math.min(p, 1 - p) * 5);
      this.g.traverse((o) => { if (o.material) { o.material.transparent = true; o.material.opacity = 0.9 * fade; } });
      this.g.rotation.y = this.face + Math.sin(this.t * 0.7) * 0.05;
      this.g.position.y = Math.sin(this.t * 3.1) * 0.012;   // 足を動かさず、すべるように
      return null;
    }

    this.cool -= dt;
    if (this.cool > 0) return null;
    if (!this.canAppear(world, player, humans)) return null;
    if (Math.random() > dt * 0.35) return null;              // ごくたまに

    // 北側の窓の外を、プレイヤーの正面あたりで横切らせる
    const z = world.northOutsideZ;
    const dir = Math.random() < 0.5 ? 1 : -1;
    this.from = player.x - dir * 9;
    this.to = player.x + dir * 9;
    this.g.position.set(this.from, 0, z);
    this.face = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    this.g.visible = true;
    this.active = true;
    this.t = 0;
    this.cool = 150 + Math.random() * 180;                   // 次はずっと先
    return "appeared";
  }
}

// ============================================================
//  隠し要素③：運動場のネコ
//   たまにあらわれて、うろうろして、近づくと逃げる
// ============================================================
export class Cat {
  constructor(scene) {
    const g = new THREE.Group();
    const fur = choice([0x2b2723, 0xd8c9a8, 0x8a6a4a, 0xe8e4dc, 0x5a5248]);
    const m = new THREE.MeshLambertMaterial({ color: fur });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry
      ? new THREE.CapsuleGeometry(0.10, 0.22, 4, 8) : new THREE.CylinderGeometry(0.1, 0.1, 0.34, 8), m);
    body.rotation.x = Math.PI / 2; body.position.y = 0.17; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.095, 10, 8), m);
    head.position.set(0, 0.22, 0.2); g.add(head);
    for (const sx of [-0.05, 0.05]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.07, 4), m);
      ear.position.set(sx, 0.30, 0.2); g.add(ear);
    }
    for (const sx of [-0.045, 0.045]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.017, 6, 5),
        new THREE.MeshBasicMaterial({ color: 0xc8e86a }));
      eye.position.set(sx, 0.235, 0.28); g.add(eye);
    }
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.008, 0.3, 6), m);
    tail.position.set(0, 0.24, -0.2); tail.rotation.x = -0.7; g.add(tail);
    this.tail = tail;
    for (const sx of [-0.06, 0.06]) for (const sz of [-0.09, 0.11]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.14, 6), m);
      leg.position.set(sx, 0.07, sz); g.add(leg);
    }
    g.scale.setScalar(1.5);          // 小さすぎて見えないので、すこし大きめに
    g.visible = false;
    scene.add(g);
    this.g = g;
    this.active = false;
    this.cool = 40 + Math.random() * 40;
    this.tx = 0; this.tz = 0;
    this.life = 0;
    this.found = false;
    this.startled = 0;
    this.hop = 0;
    this.rest = 0;
  }

  update(dt, t, world, player) {
    if (!this.active) {
      this.cool -= dt;
      if (this.cool > 0) return null;
      // 運動場のどこかに、そっとあらわれる
      const px = player.x, pz = player.z;
      if (pz < 38 || pz > 70) { this.cool = 6; return null; }     // 運動場にいるときだけ
      this.g.position.set(px + rand(-16, 16), 0.02, pz + rand(-14, 14));
      this.g.position.x = clamp(this.g.position.x, -44, 44);
      this.g.position.z = clamp(this.g.position.z, 38, 70);
      this.g.visible = true;
      this.active = true;
      this.life = 30 + Math.random() * 30;
      this.pickTarget();
      this.cool = 70 + Math.random() * 90;
      return "appeared";
    }

    this.life -= dt;
    this.rest = (this.rest || 0) - dt;
    this.startled = Math.max(0, (this.startled || 0) - dt);
    this.hop = Math.max(0, (this.hop || 0) - dt * 2.2);
    const d = dist(this.g.position.x, this.g.position.z, player.x, player.z);
    // ふだんは その場にすわって、たまにゆっくり歩く。
    // 近づかれたときだけ、ぱっと逃げる。
    let sp = 0.75;
    if (this.startled > 0) {
      sp = 6.2;                                  // おどかされたら 全力で走る
    } else if (d < 5) {
      this.tx = this.g.position.x + (this.g.position.x - player.x) * 2;
      this.tz = this.g.position.z + (this.g.position.z - player.z) * 2;
      this.rest = 0;
      sp = 3.2;
    } else if (this.rest > 0) {
      sp = 0;                                   // すわって、じっとしている
    } else if (dist(this.g.position.x, this.g.position.z, this.tx, this.tz) < 0.8) {
      this.pickTarget();
      this.rest = 5 + Math.random() * 9;        // つぎに動くまで、しばらく休む
    }
    const dx = this.tx - this.g.position.x, dz = this.tz - this.g.position.z;
    const len = Math.hypot(dx, dz) || 1;
    this.g.position.x = clamp(this.g.position.x + (dx / len) * sp * dt, -44, 44);
    this.g.position.z = clamp(this.g.position.z + (dz / len) * sp * dt, 38, 70);
    if (sp > 0.2) this.g.rotation.y += ((Math.atan2(dx, dz) - this.g.rotation.y + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 3);
    this.tail.rotation.z = Math.sin(t * 1.1) * 0.16;
    this.g.position.y = 0.02 + (sp > 0.2 ? Math.abs(Math.sin(t * 6)) * (sp > 2 ? 0.05 : 0.01) : 0);

    if (this.startled > 0) {
      const k = 1 + this.hop * 0.35;
      this.g.scale.setScalar(1.5 * k);           // 毛がさかだつ
      this.g.position.y += this.hop * 0.5;       // 飛びあがる
      this.tail.rotation.x = -1.5;               // しっぽをぴんと立てる
    } else {
      this.g.scale.setScalar(1.5);
      this.tail.rotation.x = -0.7;
    }
    if (this.life <= 0) { this.active = false; this.g.visible = false; }
    return null;
  }

  // おどかされた！毛をさかだてて 飛びあがり、いちもくさんに逃げる
  scare(px, pz) {
    if (!this.active || this.startled > 0) return false;
    this.startled = 2.6;
    this.hop = 1;
    this.rest = 0;
    const dx = this.g.position.x - px, dz = this.g.position.z - pz;
    const len = Math.hypot(dx, dz) || 1;
    this.tx = clamp(this.g.position.x + (dx / len) * 22, -44, 44);
    this.tz = clamp(this.g.position.z + (dz / len) * 22, 38, 70);
    this.life = Math.min(this.life, 5.5);        // びっくりして、どこかへ行ってしまう
    return true;
  }

  pickTarget() {
    this.tx = clamp(this.g.position.x + rand(-4.5, 4.5), -42, 42);
    this.tz = clamp(this.g.position.z + rand(-4, 4), 39, 69);
  }
}

// ============================================================
//  隠し要素④：体育館の裏の告白
//   まれに、二人組が体育館の裏で話しこんでいる。
//   おどかすと台なしになる（けれど材料はたくさん落とす）
// ============================================================
const CONFESS = [
  ["あの…前から言おうと思ってて", "…うん", "す、好きです！", "……はい"],
  ["ここなら誰も来ないと思って", "そうだね", "その、つきあってください", "え、いいの？"],
  ["手紙、読んでくれた？", "読んだ…", "返事、聞かせて", "……こちらこそ"],
  ["練習してきたセリフあるんだ", "うん", "ええと…忘れた", "ふふっ"],
];

export class Confession {
  constructor(scene) {
    this.scene = scene;
    this.g = new THREE.Group();
    this.people = [];
    for (let i = 0; i < 2; i++) {
      const p = new THREE.Group();
      const cloth = new THREE.MeshLambertMaterial({ color: 0x2b3350 });      // 制服の上着
      const skirtM = new THREE.MeshLambertMaterial({ color: 0x46304f });
      const skin = new THREE.MeshLambertMaterial({ color: 0xe8c39e });
      const hairM = new THREE.MeshLambertMaterial({ color: i ? 0x6b4a2f : 0x2b2228 });
      const t2 = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.48, 0.21), cloth);
      t2.position.y = 0.83; p.add(t2);
      const hd = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), skin);
      hd.position.y = 1.17; p.add(hd);
      const hr = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), hairM);
      hr.position.y = 1.19; p.add(hr);
      if (i) {
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.3, 0.1), hairM);
        back.position.set(0, 1.06, -0.1); p.add(back);
        const sk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 0.25, 10), skirtM);
        sk.position.y = 0.52; p.add(sk);
      }
      for (const sx of [-0.1, 0.1]) {
        const lg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.52, 0.1),
          new THREE.MeshLambertMaterial({ color: i ? 0xe8c39e : 0x2b2f3a }));
        lg.position.set(sx, 0.3, 0); p.add(lg);
      }
      // うで（そわそわ用に、あとで動かす）
      const arms = [];
      for (const sx of [-0.23, 0.23]) {
        const ar = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.42, 0.085), cloth);
        ar.position.set(sx, 0.83, 0); p.add(ar);
        arms.push(ar);
      }
      p.userData.arms = arms;
      this.g.add(p);
      this.people.push(p);
    }
    this.bubble = makeTalkBubble();
    this.bubble.sprite.position.y = 1.7;
    this.g.add(this.bubble.sprite);
    this.g.visible = false;
    scene.add(this.g);
    this.active = false;
    this.cool = 90 + Math.random() * 150;
    this.line = 0; this.lineT = 0;
    this.script = CONFESS[0];
  }

  // 体育館の裏（校舎から見えない南がわ）
  place(gym) {
    const bx = rand(gym.x1 + 4, gym.x2 - 4), bz = gym.z2 + 3.0;
    this.g.position.set(bx, 0.02, bz);
    this.people[0].position.set(-0.45, 0, 0);
    this.people[1].position.set(0.45, 0, 0);
    this.people[0].rotation.y = Math.PI / 2;
    this.people[1].rotation.y = -Math.PI / 2;
  }

  update(dt, t, world, player) {
    if (!this.active) {
      this.cool -= dt;
      if (this.cool > 0) return null;
      // プレイヤーが体育館の近くにいるときだけ、そっと始まる
      const G = world.gym;
      if (!G) { this.cool = 5; return null; }
      // 運動場にいて、まだ体育館の裏をのぞきこんでいないとき
      if (player.z < 38 || player.z > G.z2 + 1.5 || player.x > G.x2 + 12) { this.cool = 5; return null; }
      this.place(G);
      this.script = choice(CONFESS);
      this.line = 0; this.lineT = 0;
      this.g.visible = true;
      this.active = true;
      this.life = 40;
      return "appeared";
    }
    this.life -= dt;
    this.lineT -= dt;
    if (this.lineT <= 0) {
      this.lineT = 3.4;
      drawTalk(this.bubble, this.script[this.line % this.script.length], this.line % 2 ? "#ffb0d0" : "#9fd0e8");
      this.bubble.sprite.position.x = this.line % 2 ? 0.45 : -0.45;
      this.line++;
      if (this.line > this.script.length + 1) this.end();
    }
    // そわそわする
    this.people[0].position.y = Math.abs(Math.sin(t * 2.2)) * 0.02;
    this.people[1].rotation.y = -Math.PI / 2 + Math.sin(t * 1.1) * 0.12;
    const a0 = this.people[0].userData.arms, a1 = this.people[1].userData.arms;
    if (a0) { a0[0].rotation.x = Math.sin(t * 2.6) * 0.22; a0[1].rotation.x = -Math.sin(t * 2.6) * 0.22; }
    if (a1) { a1[0].rotation.x = Math.sin(t * 1.4 + 1) * 0.1; a1[1].rotation.x = Math.sin(t * 1.4) * 0.1; }
    if (this.life <= 0) this.end();
    return null;
  }

  end() {
    this.active = false;
    this.g.visible = false;
    this.cool = 180 + Math.random() * 240;   // つぎは、だいぶ先
  }

  // おどかされた（＝台なしになった）
  interrupt() {
    if (!this.active) return null;
    drawTalk(this.bubble, choice(["いいところだったのに！！", "空気読んでよ！！", "もういい！！帰る！"]), "#ff8a9c");
    this.lineT = 1.6;
    this.life = 1.6;
    return true;
  }
}

function makeTalkBubble() {
  const cv = document.createElement("canvas");
  cv.width = 512; cv.height = 96;
  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(2.6, 0.49, 1);
  return { cv, ctx: cv.getContext("2d"), tex, sprite: sp };
}

function drawTalk(b, text, color) {
  const g = b.ctx;
  g.clearRect(0, 0, 512, 96);
  g.fillStyle = "rgba(12,14,22,0.86)";
  g.beginPath(); g.roundRect ? g.roundRect(6, 6, 500, 84, 16) : g.rect(6, 6, 500, 84); g.fill();
  g.strokeStyle = color; g.lineWidth = 3; g.stroke();
  g.fillStyle = "#f2f0e8";
  g.font = "30px 'DotGothic16', sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text.length > 18 ? text.slice(0, 17) + "…" : text, 256, 48);
  b.tex.needsUpdate = true;
}

// ============================================================
//  ともだちのおばけ
//   ネットからとどいた位置に立たせる。色は人ごとに変えて見分けやすく
// ============================================================
const PEER_SCALE = 0.5;
const PEER_COLORS = [0xffd45e, 0x8fe6b0, 0xffa8d8, 0x9fd8ff, 0xd0b0ff, 0xffc39a];

export class PeerGhost {
  constructor(scene, index, name) {
    this.scene = scene;
    const tint = PEER_COLORS[index % PEER_COLORS.length];
    this.tint = tint;
    const g = new THREE.Group();
    g.scale.setScalar(PEER_SCALE);

    const bodyMat = new THREE.MeshLambertMaterial({
      color: 0xeaf2fa, emissive: tint, emissiveIntensity: 0.5,
      transparent: true, opacity: 0.86,
    });
    this.bodyMat = bodyMat;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), bodyMat);
    head.position.y = 1.25; head.scale.set(1, 1.05, 0.96); g.add(head);
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.66, 0.95, 16, 1, true),
      new THREE.MeshLambertMaterial({ color: 0xdfe9f4, emissive: tint, emissiveIntensity: 0.4,
        transparent: true, opacity: 0.82, side: THREE.DoubleSide }));
    skirt.position.y = 0.78; g.add(skirt);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111820 });
    const eyeGeo = new THREE.SphereGeometry(0.105, 10, 8);
    for (const sx of [-0.17, 0.17]) {
      const e = new THREE.Mesh(eyeGeo, eyeMat);
      e.position.set(sx, 1.32, 0.44); e.scale.set(1, 1.25, 0.6); g.add(e);
    }
    for (const sx of [-0.55, 0.55]) {
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), bodyMat);
      h.position.set(sx, 1.0, 0.1); g.add(h);
    }
    // 壁ごしでも、どこにいるか分かるように輪郭を手前に出す
    const xm = new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0.3,
      depthTest: false, depthWrite: false });
    const xh = new THREE.Mesh(head.geometry, xm);
    xh.position.copy(head.position); xh.scale.copy(head.scale);
    xh.renderOrder = 890;
    g.add(xh);

    this.g = g;
    scene.add(g);

    // なまえの札
    this.plate = makePlate(name, tint);
    this.plate.position.y = 2.35;
    g.add(this.plate);
    this.name = name;
    this.bob = Math.random() * 6.3;
  }

  setName(name) {
    if (name === this.name) return;
    this.name = name;
    this.g.remove(this.plate);
    this.plate = makePlate(name, this.tint);
    this.plate.position.y = 2.35;
    this.g.add(this.plate);
  }

  update(dt, t, p) {
    this.bob += dt * 2.2;
    this.g.position.set(p.x, p.y - 1.1 * PEER_SCALE + Math.sin(this.bob) * 0.04, p.z);
    this.g.rotation.y = p.yaw;
    this.bodyMat.opacity = p.phasing ? 0.4 : 0.86;
    const s = p.scaring ? 1 + p.scaring * 0.25 : 1;
    this.g.scale.setScalar(PEER_SCALE * s);
  }

  dispose() {
    this.scene.remove(this.g);
    if (this.plate.material.map) this.plate.material.map.dispose();
    this.plate.material.dispose();
  }
}

function makePlate(name, tint) {
  const cv = document.createElement("canvas");
  cv.width = 256; cv.height = 64;
  const c = cv.getContext("2d");
  c.fillStyle = "rgba(10,12,20,0.78)";
  if (c.roundRect) { c.beginPath(); c.roundRect(4, 12, 248, 40, 12); c.fill(); }
  else c.fillRect(4, 12, 248, 40);
  c.strokeStyle = "#" + new THREE.Color(tint).getHexString();
  c.lineWidth = 3;
  if (c.roundRect) { c.beginPath(); c.roundRect(4, 12, 248, 40, 12); c.stroke(); }
  c.fillStyle = "#f2f0e8";
  c.font = "26px 'DotGothic16', sans-serif";
  c.textAlign = "center"; c.textBaseline = "middle";
  c.fillText(name.length > 10 ? name.slice(0, 9) + "…" : name, 128, 33);
  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
  sp.renderOrder = 895;
  sp.scale.set(1.9, 0.48, 1);
  return sp;
}
