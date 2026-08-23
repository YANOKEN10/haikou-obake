import * as THREE from "../lib/three.module.js";
import { clamp, lerp, angleLerp, dist, rand, choice } from "./util.js";
import { HUMAN_DROPS, HABITUATED_LINES } from "./data.js";

// 頭上のふきだし（キャンバス→スプライト）
function makeBubble() {
  const cv = document.createElement("canvas");
  cv.width = 512; cv.height = 160;
  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true, depthWrite: false });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(3.0, 0.94, 1);
  sp.renderOrder = 10;
  sp.visible = false;
  return { cv, ctx: cv.getContext("2d"), tex, sprite: sp };
}

function drawBubble(b, name, text, fear, color) {
  const g = b.ctx;
  g.clearRect(0, 0, 512, 160);
  g.fillStyle = "rgba(12,14,22,0.82)";
  roundRect(g, 6, 6, 500, 108, 18); g.fill();
  g.strokeStyle = color; g.lineWidth = 3;
  roundRect(g, 6, 6, 500, 108, 18); g.stroke();
  g.fillStyle = color;
  g.font = "bold 26px 'DotGothic16', sans-serif";
  g.fillText(name, 22, 40);
  g.fillStyle = "#f2f0e8";
  g.font = "26px 'DotGothic16', sans-serif";
  const t = text.length > 22 ? text.slice(0, 21) + "…" : text;
  g.fillText(t, 22, 84);
  // 恐怖ゲージ
  g.fillStyle = "rgba(255,255,255,0.16)";
  roundRect(g, 8, 124, 496, 20, 10); g.fill();
  const w = clamp(fear / 100, 0, 1) * 492;
  const hue = 190 - clamp(fear, 0, 100) * 1.7;
  g.fillStyle = "hsl(" + hue + ",85%,58%)";
  roundRect(g, 10, 126, Math.max(6, w), 16, 8); g.fill();
  b.tex.needsUpdate = true;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// 人間の大きさ（1.0 が以前。おばけと同じく小さめにして、廊下を広く見せる）
export const HUMAN_SCALE = 0.72;
// 目の高さ（腰高の窓ごしでも相手が見えるよう、下がりすぎないようにする）
export const EYE_Y = Math.max(1.05, 1.35 * HUMAN_SCALE);

export class Human {
  constructor(scene, world, type, x, z) {
    this.world = world;
    this.type = type;
    this.name = type.name;
    this.x = x; this.z = z; this.y = 0; this.floor = 0;
    this.yaw = Math.PI;
    this.vx = 0; this.vz = 0;
    this.radius = 0.38 * HUMAN_SCALE;

    this.fear = 0;
    this.maxFear = type.courage;
    this.state = "wander";
    this.stateT = 0;
    this.path = null; this.pathI = 0;
    this.target = null;
    this.walkPhase = 0;
    this.talkT = 0;
    this.idleTalkT = rand(2, 9);
    this.line = "";
    this.seenGhostT = 0;
    this.habit = {};          // 仕掛け種別ごとの慣れ
    this.dropped = 0;
    this.out = false;
    this.scaredCount = 0;
    this.lookYaw = 0;

    this.group = new THREE.Group();
    this.build(type.color);
    scene.add(this.group);

    this.bubble = makeBubble();
    this.bubble.sprite.position.y = 1.95 * HUMAN_SCALE + 0.55;
    this.group.add(this.bubble.sprite);
  }

  build(color) {
    const T = this.type;
    const skin = new THREE.MeshLambertMaterial({ color: 0xe8c39e });
    const blazer = new THREE.MeshLambertMaterial({ color: T.blazer || color });
    const trim = new THREE.MeshLambertMaterial({ color: T.trim || color });
    const dark = new THREE.MeshLambertMaterial({ color: 0x2b2f3a });
    const shirtMat = new THREE.MeshLambertMaterial({ color: 0xf0f2f6 });
    this.skin = skin;

    // 転んだり破けたりするので、体はひとつの入れ物にまとめて傾けられるようにする
    this.body = new THREE.Group();
    this.body.scale.setScalar(HUMAN_SCALE);
    this.group.add(this.body);

    // 白シャツ（上着が破けると出てくる）
    const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.62, 0.25), shirtMat);
    shirt.position.y = 1.15; this.body.add(shirt);

    // 制服の上着
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.66, 0.29), blazer);
    torso.position.y = 1.15; this.body.add(torso);
    this.torso = torso;
    // えり
    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.31), trim);
    collar.position.y = 1.44; this.body.add(collar);
    this.collar = collar;
    // ネクタイ／リボン
    const tie = new THREE.Mesh(
      T.sex === "f" ? new THREE.BoxGeometry(0.16, 0.09, 0.06) : new THREE.BoxGeometry(0.07, 0.26, 0.06), trim);
    tie.position.set(0, T.sex === "f" ? 1.37 : 1.28, 0.16); this.body.add(tie);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), skin);
    head.position.y = 1.62; this.body.add(head);
    this.head = head;
    // 髪（女子は長め）
    const hairMat = new THREE.MeshLambertMaterial({ color: T.hair || 0x30262a });
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.205, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), hairMat);
    hair.position.y = 1.64; this.body.add(hair);
    if (T.sex === "f") {
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.34, 0.14), hairMat);
      back.position.set(0, 1.47, -0.13); this.body.add(back);
    }

    this.armL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.12), blazer);
    this.armR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.12), blazer);
    this.armL.position.set(-0.32, 1.16, 0); this.armR.position.set(0.32, 1.16, 0);
    this.armL.geometry.translate(0, -0.22, 0); this.armR.geometry.translate(0, -0.22, 0);
    this.body.add(this.armL, this.armR);
    // 破けたときに出てくる素肌の腕
    this.bareL = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.5, 0.115), skin);
    this.bareR = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.5, 0.115), skin);
    this.bareL.position.copy(this.armL.position); this.bareR.position.copy(this.armR.position);
    this.bareL.geometry.translate(0, -0.2, 0); this.bareR.geometry.translate(0, -0.2, 0);
    this.bareL.visible = this.bareR.visible = false;
    this.body.add(this.bareL, this.bareR);

    // 下半身：女子はスカート、男子はズボン
    if (T.sex === "f") {
      const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.36, 0.34, 12), new THREE.MeshLambertMaterial({ color: T.skirt || 0x574a70 }));
      skirt.position.y = 0.72; this.body.add(skirt);
      this.skirt = skirt;
    }
    this.legL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.72, 0.14), T.sex === "f" ? skin : dark);
    this.legR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.72, 0.14), T.sex === "f" ? skin : dark);
    this.legL.position.set(-0.12, 0.82, 0); this.legR.position.set(0.12, 0.82, 0);
    this.legL.geometry.translate(0, -0.3, 0); this.legR.geometry.translate(0, -0.3, 0);
    this.body.add(this.legL, this.legR);
    // 上履き
    for (const s2 of [-0.12, 0.12]) {
      const sh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.09, 0.24), new THREE.MeshLambertMaterial({ color: 0xe8e2d0 }));
      sh.position.set(s2, 0.06, 0.03); this.body.add(sh);
      if (s2 < 0) this.shoeL = sh; else this.shoeR = sh;
    }

    // --- 持ち物・かぶり物（人ごとの見わけ） -------------------
    const acc = T.acc || "none";
    const hairM2 = new THREE.MeshLambertMaterial({ color: T.hair || 0x30262a });
    if (acc === "glasses") {
      const gm = new THREE.MeshLambertMaterial({ color: 0x2a2a30 });
      for (const sx of [-0.085, 0.085]) {
        const l = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.09, 0.02), gm);
        l.position.set(sx, 1.63, 0.185); this.body.add(l);
      }
      const br = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, 0.02), gm);
      br.position.set(0, 1.63, 0.185); this.body.add(br);
    } else if (acc === "cap") {
      const cm = new THREE.MeshLambertMaterial({ color: T.trim || 0x8899aa });
      const c = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), cm);
      c.position.y = 1.68; this.body.add(c);
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.03, 0.18), cm);
      brim.position.set(0, 1.68, 0.2); this.body.add(brim);
    } else if (acc === "beanie") {
      const bm = new THREE.MeshLambertMaterial({ color: T.trim || 0x99aa88 });
      const c = new THREE.Mesh(new THREE.SphereGeometry(0.215, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), bm);
      c.position.y = 1.66; this.body.add(c);
      const p2 = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), bm);
      p2.position.set(0, 1.86, 0); this.body.add(p2);
    } else if (acc === "headphone") {
      const hm = new THREE.MeshLambertMaterial({ color: 0x2a2f3a });
      for (const sx of [-0.2, 0.2]) {
        const e = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.14), hm);
        e.position.set(sx, 1.62, 0); this.body.add(e);
      }
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.022, 6, 12, Math.PI), hm);
      band.position.y = 1.62; band.rotation.y = Math.PI / 2; this.body.add(band);
    } else if (acc === "scarf") {
      const sm = new THREE.MeshLambertMaterial({ color: T.trim || 0xcc6677 });
      const s1 = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.13, 0.3), sm);
      s1.position.y = 1.44; this.body.add(s1);
      const s2 = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.4, 0.06), sm);
      s2.position.set(0.13, 1.24, 0.17); this.body.add(s2);
    } else if (acc === "backpack") {
      const pm = new THREE.MeshLambertMaterial({ color: 0x554466 });
      const p3 = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.46, 0.2), pm);
      p3.position.set(0, 1.16, -0.24); this.body.add(p3);
    } else if (acc === "camera") {
      const cm2 = new THREE.MeshLambertMaterial({ color: 0x22242a });
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.12), cm2);
      c.position.set(0, 1.18, 0.2); this.body.add(c);
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.1, 10), cm2);
      lens.rotation.x = Math.PI / 2; lens.position.set(0, 1.18, 0.3); this.body.add(lens);
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.014, 6, 14), cm2);
      strap.position.y = 1.35; strap.rotation.x = Math.PI / 2; this.body.add(strap);
    } else if (acc === "hood") {
      const hm2 = new THREE.MeshLambertMaterial({ color: T.blazer || 0x445566 });
      const hd = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 9, 0, Math.PI * 2, 0, Math.PI * 0.6), hm2);
      hd.position.set(0, 1.6, -0.03); this.body.add(hd);
    } else if (acc === "mask") {
      const mm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.06),
        new THREE.MeshLambertMaterial({ color: 0xf0f2f6 }));
      mm.position.set(0, 1.56, 0.14); this.body.add(mm);
    } else if (acc === "ribbon") {
      const rm = new THREE.MeshLambertMaterial({ color: T.trim || 0xff88aa });
      for (const sx of [-0.1, 0.1]) {
        const w2 = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.1, 0.06), rm);
        w2.position.set(sx, 1.78, -0.06); this.body.add(w2);
      }
    } else if (acc === "ponytail") {
      const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.04, 0.5, 8), hairM2);
      tail.position.set(0, 1.42, -0.22); tail.rotation.x = -0.35; this.body.add(tail);
    } else if (acc === "ahoge") {
      const ah = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.24, 6), hairM2);
      ah.position.set(0.03, 1.88, -0.02); ah.rotation.z = 0.5; this.body.add(ah);
    } else if (acc === "towel") {
      const tm = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.26),
        new THREE.MeshLambertMaterial({ color: 0xe8e2d0 }));
      tm.position.set(0, 1.44, -0.02); this.body.add(tm);
    }

    // 懐中電灯（光は Game 側のライトプールが受けもつ）
    this.sway = 0;
    this.torchHot = false;

    const beam = new THREE.Mesh(
      new THREE.ConeGeometry(1.5, 7, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffeec8, transparent: true, opacity: 0.055, depthWrite: false, side: THREE.DoubleSide })
    );
    beam.rotation.x = Math.PI / 2;
    beam.position.set(0.3, 1.05, 3.6);
    this.body.add(beam);
    this.beam = beam;

    // 転倒・破裂の演出用
    this.gag = null; this.gagT = 0;
    this.stars = null;
  }

  speak(text, dur = 3.2) { this.line = text; this.talkT = dur; }

  // ==========================================================
  //  こわがったときの、ちょっと笑えるリアクション
  //   女子 → ド派手に一回転して尻もち、頭に星、上履きが飛ぶ
  //   男子 → 上着が弾けとんで、下のランニングシャツ姿で逃げる
  // ==========================================================
  startGag(strength) {
    if (this.gagT > 0) return null;
    const f = this.type.sex === "f";
    // よほど怖がったときだけ
    if (strength < 26 || Math.random() > (f ? 0.55 : 0.5)) return null;
    this.gag = f ? "tumble" : "burst";
    this.gagT = f ? 2.1 : 1.5;
    if (f) {
      this.shoeFly = { x: rand(-1, 1), y: 3.4, z: rand(-1, 1), t: 0 };
      this.makeStars();
      return choice(["すってんころりん！", "いたーい！", "こ、腰が…！"]);
    }
    // 上着が弾けとぶ
    this.torso.visible = false;
    this.collar.visible = false;
    this.armL.visible = this.armR.visible = false;
    this.bareL.visible = this.bareR.visible = true;
    this.burstPieces = [];
    for (let i = 0; i < 6; i++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.05),
        new THREE.MeshLambertMaterial({ color: this.type.blazer || 0x334 }));
      p.position.set(0, 1.2, 0);
      p.userData.v = { x: rand(-2.6, 2.6), y: rand(2.4, 4.4), z: rand(-2.6, 2.6),
                       rx: rand(-9, 9), rz: rand(-9, 9) };
      this.body.add(p);
      this.burstPieces.push(p);
    }
    return choice(["うわああ服がァ！", "やぶけたァ！", "もう知らん！！"]);
  }

  makeStars() {
    if (this.stars) return;
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.075, 0),
        new THREE.MeshBasicMaterial({ color: 0xffe14d }));
      s.userData.a = (i / 5) * Math.PI * 2;
      g.add(s);
    }
    g.position.y = 1.05;
    this.group.add(g);
    this.stars = g;
  }

  // リアクションの動きを進める
  updateGag(dt, t) {
    if (this.gagT <= 0) {
      if (this.gag) this.endGag();
      return;
    }
    this.gagT -= dt;
    const p = this.gag === "tumble" ? 1 - this.gagT / 2.1 : 1 - this.gagT / 1.5;

    if (this.gag === "tumble") {
      // 一回転して尻もち → よろよろ起き上がる
      const spin = Math.min(1, p / 0.35);
      const up = p > 0.72 ? (p - 0.72) / 0.28 : 0;
      this.body.rotation.x = (Math.PI * 0.55) * spin * (1 - up);
      this.body.rotation.z = Math.sin(p * 14) * 0.16 * (1 - up);
      this.body.position.y = -0.34 * spin * (1 - up);
      if (this.stars) {
        this.stars.visible = p < 0.8;
        this.stars.position.y = 1.05 - 0.3 * spin * (1 - up);
        this.stars.children.forEach((s) => {
          const a = s.userData.a + t * 5.5;
          s.position.set(Math.cos(a) * 0.34, Math.sin(a * 2) * 0.05, Math.sin(a) * 0.34);
          s.rotation.y = t * 4;
        });
      }
      if (this.shoeFly && this.shoeR) {
        this.shoeFly.t += dt;
        const ft = this.shoeFly.t;
        this.shoeR.position.set(0.12 + this.shoeFly.x * ft, 0.06 + this.shoeFly.y * ft - 5 * ft * ft, 0.03 + this.shoeFly.z * ft);
        this.shoeR.rotation.x = ft * 12;
      }
    } else {
      // のけぞってから、脱兎のごとく
      this.body.rotation.x = -Math.sin(Math.min(1, p / 0.3) * Math.PI) * 0.5;
      if (this.burstPieces) {
        for (const q of this.burstPieces) {
          const v = q.userData.v;
          q.position.x += v.x * dt; q.position.z += v.z * dt;
          q.position.y += v.y * dt; v.y -= 9.5 * dt;
          q.rotation.x += v.rx * dt; q.rotation.z += v.rz * dt;
          if (q.position.y < 0.05) { q.position.y = 0.05; v.y = 0; v.x *= 0.7; v.z *= 0.7; }
        }
      }
    }
  }

  endGag() {
    this.body.rotation.set(0, 0, 0);
    this.body.position.y = 0;
    if (this.stars) { this.group.remove(this.stars); this.stars = null; }
    if (this.shoeR) { this.shoeR.position.set(0.12, 0.06, 0.03); this.shoeR.rotation.x = 0; }
    if (this.burstPieces) { for (const q of this.burstPieces) this.body.remove(q); this.burstPieces = null; }
    this.gag = null;
    // 上着は破けたまま（そのほうがおかしい）ので戻さない
  }

  // --- 移動先を決める ---------------------------------------
  goTo(x, z, floor) {
    const nav = this.world.nav;
    const to = floor === undefined ? this.floor : floor;
    const a = nav.nearest(this.x, this.z, this.floor, this.world.colliders, 26, this.y);
    const b = nav.nearest(x, z, to, this.world.colliders);
    const p = nav.path(a, b);
    this.path = p ? p.map((i) => nav.nodes[i]) : null;
    this.pathI = 0;
    this.target = { x, z, floor: to };
  }

  wanderSomewhere() {
    const all = this.world.rooms.filter((r) => r.kind !== "yard" || Math.random() < 0.3);
    const r = choice(all);
    const f = r.floor || 0;
    if (r.kind === "stair") return this.goTo(r.cx, -5.5, f);
    if (r.kind === "yard") return this.goTo(rand(-34, 34), rand(6, 30), 0);
    if (r.kind === "watari") return this.goTo(r.cx, rand(r.z1 + 1, r.z2 - 1), 0);
    this.goTo(r.cx + rand(-2, 2), r.cz + rand(-1.5, 1.5), f);
  }

  // --- 恐怖を与える -----------------------------------------
  addFear(amount, sx, sz, key = "misc", label = "") {
    if (this.out) return 0;
    const h = this.habit[key] || 0;
    // 同じ手は飽きられるが、完全には効かなくならない
    let eff = amount * Math.max(0.32, Math.pow(0.83, h));

    // 暗がり・ひとりぼっちだと怖さ倍率アップ
    if (this.world.isIndoors(this.x, this.z)) eff *= 1.25;
    if (this.alone) eff *= 1.3;

    // 別の手を立て続けに食らうと「たたみかけ」ボーナス
    this.comboT = this.comboT || 0;
    const combo = this.lastKey && this.lastKey !== key && this.comboT > 0;
    if (combo) eff *= 1.45;
    this.lastKey = key;
    this.comboT = 6.5;

    this.habit[key] = h + 1;

    if (eff < 3.5) {
      this.speak(choice(HABITUATED_LINES), 3.0);
      this.fear = Math.max(this.fearFloor || 0, this.fear - 3);
      this.state = "spooked"; this.stateT = 1.0;
      this.fearSrc = { x: sx, z: sz };
      return 0;
    }

    this.fear += eff;
    this.scaredCount++;
    this.lastCombo = combo;
    // 一度植えつけた恐怖は完全には消えない
    this.fearFloor = Math.max(this.fearFloor || 0, this.fear * 0.62);
    this.fearSrc = { x: sx, z: sz };
    this.yaw = Math.atan2(sx - this.x, sz - this.z);

    if (this.fear >= this.maxFear) {
      this.state = "flee"; this.stateT = 0;
      this.speak(choice(this.type.flee), 4.5);
      this.goTo(this.world.exit.x, this.world.exit.z);
    } else {
      this.state = "panic"; this.stateT = clamp(eff / 22, 1.0, 3.2);
      this.speak(choice(this.type.scared), 3.0);
    }
    // ときどき、ド派手なリアクションが出る
    const gagLine = this.startGag(eff);
    if (gagLine) { this.speak(gagLine, 3.2); this.stateT = Math.max(this.stateT, 2.0); }
    return eff;
  }

  // 落とし物（呼び出し側がワールドに配置する）
  takeDrop() {
    if (this.dropped >= 7) return null;
    if (Math.random() > 0.72) return null;
    this.dropped++;
    return choice(HUMAN_DROPS);
  }

  // プレイヤーが視界にいるか
  canSee(px, py, pz, range = 17) {
    if (Math.abs((py || 0) - this.y) > 2.4) return false;   // 別の階にいる相手は見えない
    const d = dist(this.x, this.z, px, pz);
    if (d > range) return false;
    const ang = Math.atan2(px - this.x, pz - this.z);
    let diff = Math.abs(((ang - this.yaw + Math.PI) % (Math.PI * 2)) - Math.PI);
    if (diff > 1.05 && d > 2.4) return false;
    return this.world.colliders.lineOfSight(this.x, this.z, px, pz, this.y + EYE_Y, 0.7);
  }

  // ==========================================================
  update(dt, t, ctx) {
    if (this.out) return;
    const w = this.world;
    this.stateT -= dt;
    this.talkT -= dt;
    this.seenGhostT = Math.max(0, this.seenGhostT - dt);
    this.comboT = Math.max(0, (this.comboT || 0) - dt);
    this.fear = Math.max(this.fearFloor || 0, this.fear - dt * 0.85);  // ゆっくり落ち着く（が完全には戻らない）

    let speed = this.type.speed;
    if (this.gagT > 0 && this.gag === "tumble") speed = 0;   // 転んでいるあいだは動けない
    let wantX = null, wantZ = null;

    switch (this.state) {
      case "wander": {
        this.idleTalkT -= dt;
        if (this.idleTalkT <= 0) { this.speak(choice(this.type.idle), 3.4); this.idleTalkT = rand(7, 16); }
        if (!this.path || this.stateT <= 0) { this.wanderSomewhere(); this.stateT = rand(14, 26); }
        break;
      }
      case "investigate": {
        speed *= 1.05;
        if (this.stateT <= 0) { this.state = "wander"; this.stateT = 0; this.path = null; }
        break;
      }
      case "spooked": {
        speed *= 0.35;
        if (this.fearSrc) this.yaw = angleLerp(this.yaw, Math.atan2(this.fearSrc.x - this.x, this.fearSrc.z - this.z), clamp(dt * 5, 0, 1));
        this.path = null;
        if (this.stateT <= 0) { this.state = "wander"; this.stateT = 0; }
        break;
      }
      case "panic": {
        speed *= 1.75;
        this.path = null;
        if (this.fearSrc) {
          const ax = this.x - this.fearSrc.x, az = this.z - this.fearSrc.z;
          const m = Math.hypot(ax, az) || 1;
          wantX = ax / m; wantZ = az / m;
        }
        if (this.stateT <= 0) {
          this.state = "spooked"; this.stateT = 1.6;
        }
        break;
      }
      case "flee": {
        speed *= 1.9;
        if (!this.path) this.goTo(w.exit.x, w.exit.z, 0);
        if (dist(this.x, this.z, w.exit.x, w.exit.z) < 2.5) {
          this.out = true;
          this.group.visible = false;
          if (ctx && ctx.onEscape) ctx.onEscape(this);
          return;
        }
        break;
      }
    }

    // --- 経路追従 ------------------------------------------
    if (wantX === null && this.path && this.pathI < this.path.length) {
      const n = this.path[this.pathI];
      const d = dist(this.x, this.z, n.x, n.z);
      if (d < 1.3) {
        this.pathI++;
        if (this.pathI >= this.path.length) { this.path = null; if (this.state === "investigate") this.stateT = Math.min(this.stateT, 2.6); }
      } else {
        wantX = (n.x - this.x) / d; wantZ = (n.z - this.z) / d;
        // 目ざす点の高さへ、なめらかに上り下りする
        const ty = n.y === undefined ? 0 : n.y;
        this.y = lerp(this.y, ty, clamp(dt * (Math.abs(ty - this.y) > 1.5 ? 2.2 : 5), 0, 1));
        this.floor = n.floor;
      }
    }

    if (wantX !== null) {
      this.vx = lerp(this.vx, wantX * speed, clamp(dt * 8, 0, 1));
      this.vz = lerp(this.vz, wantZ * speed, clamp(dt * 8, 0, 1));
    } else {
      this.vx = lerp(this.vx, 0, clamp(dt * 9, 0, 1));
      this.vz = lerp(this.vz, 0, clamp(dt * 9, 0, 1));
    }

    const r = w.colliders.resolve(this.x + this.vx * dt, this.z + this.vz * dt, this.radius, this.y + 1.0 * HUMAN_SCALE, ["stair"]);
    if (r.hit) {
      // 引っかかったら経路を引き直す
      this.stuck = (this.stuck || 0) + dt;
      if (this.stuck > 1.2 && this.target) { this.goTo(this.target.x, this.target.z, this.target.floor); this.stuck = 0; }
    } else this.stuck = 0;
    this.x = r.x; this.z = r.z;

    const mv = Math.hypot(this.vx, this.vz);
    if (mv > 0.25 && this.state !== "spooked")
      this.yaw = angleLerp(this.yaw, Math.atan2(this.vx, this.vz), clamp(dt * 7, 0, 1));
    this.walkPhase += dt * (2.5 + mv * 2.2);

    this.updateGag(dt, t);
    this.render(dt, t, mv, ctx);
  }

  // --- ともだちと遊ぶとき ---------------------------------
  //  おや（部屋を作った人）から来た位置に、そっと合わせていく。
  //  1秒に1回しか来ないので、そのあいだは自分でなめらかにつなぐ
  setNet(x, y, z, yaw, fear, state, out) {
    this.netT = { x, y, z, yaw };
    this.fear = fear;
    if (!this.out) this.state = state;
    if (out && !this.out) { this.out = true; this.outT = 0; return true; }
    return false;
  }

  updateRemote(dt, t, ctx) {
    const n = this.netT;
    if (!n) return;
    const px = this.x, pz = this.z;
    if (Math.abs(n.x - this.x) > 12 || Math.abs(n.z - this.z) > 12) {
      this.x = n.x; this.y = n.y; this.z = n.z;      // ワープしたときは、いきなり合わせる
    } else {
      const k = Math.min(1, dt * 5);
      this.x += (n.x - this.x) * k;
      this.y += (n.y - this.y) * k;
      this.z += (n.z - this.z) * k;
    }
    let d = ((n.yaw - this.yaw + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, dt * 6);
    this.floor = Math.max(0, Math.round(this.y / 3.6));

    const mv = Math.hypot(this.x - px, this.z - pz) / Math.max(dt, 1e-4);
    this.walkPhase += dt * (2.2 + mv * 1.3);
    this.talkT -= dt;
    this.updateGag(dt, t);
    this.render(dt, t, mv, ctx);
  }

  render(dt, t, mv, ctx) {
    const panic = this.state === "panic" || this.state === "flee";
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = this.yaw;

    // 転倒中は手足の動きを演出側にゆずる（ふきだしなどは動かし続ける）
    if (!(this.gagT > 0 && this.gag === "tumble")) {
      const sw = Math.sin(this.walkPhase) * clamp(mv * 0.32, 0, 1.1);
      this.legL.rotation.x = sw; this.legR.rotation.x = -sw;
      const armSwing = -sw * 0.8 - (panic ? 2.2 : 0);
      this.armL.rotation.x = armSwing; this.armR.rotation.x = sw * 0.8 - (panic ? 2.2 : 0);
      this.bareL.rotation.x = armSwing; this.bareR.rotation.x = sw * 0.8 - (panic ? 2.2 : 0);
      this.head.position.y = 1.62 + (panic ? Math.abs(Math.sin(t * 22)) * 0.035 : 0);
    }

    // 懐中電灯は少しふらつく／パニックで乱れる
    const sway = panic ? Math.sin(t * 13) * 0.9 : Math.sin(t * 1.1 + this.walkPhase * 0.2) * 0.28;
    this.sway = sway;
    this.torchHot = panic;
    this.torchAimY = panic ? 0.2 + Math.abs(Math.sin(t * 9)) * 1.2 : 0.55;
    this.beam.rotation.z = -sway * 0.16;

    // ふきだし
    const show = this.talkT > 0;
    this.bubble.sprite.visible = show || this.fear > 6;
    if (this.bubble.sprite.visible) {
      const txt = show ? this.line : "";
      if (txt !== this._lastTxt || Math.abs(this.fear - (this._lastFear || 0)) > 1.5) {
        drawBubble(this.bubble, this.name, txt, this.fear / this.maxFear * 100, "#" + new THREE.Color(this.type.color).getHexString());
        this._lastTxt = txt; this._lastFear = this.fear;
      }
      this.bubble.sprite.position.y = 1.95 * HUMAN_SCALE + 0.55 + Math.sin(t * 2 + this.x) * 0.05;
    }
  }
}
