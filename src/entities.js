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
