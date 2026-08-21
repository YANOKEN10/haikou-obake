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

export class Human {
  constructor(scene, world, type, x, z) {
    this.world = world;
    this.type = type;
    this.name = type.name;
    this.x = x; this.z = z; this.y = 0;
    this.yaw = Math.PI;
    this.vx = 0; this.vz = 0;
    this.radius = 0.38;

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
    this.bubble.sprite.position.y = 2.55;
    this.group.add(this.bubble.sprite);
  }

  build(color) {
    const skin = new THREE.MeshLambertMaterial({ color: 0xe8c39e });
    const cloth = new THREE.MeshLambertMaterial({ color });
    const dark = new THREE.MeshLambertMaterial({ color: 0x2b2f3a });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.66, 0.28), cloth);
    torso.position.y = 1.15; this.group.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), skin);
    head.position.y = 1.62; this.group.add(head);
    this.head = head;
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), new THREE.MeshLambertMaterial({ color: 0x30262a }));
    hair.position.y = 1.64; this.group.add(hair);

    this.armL = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.55, 0.11), cloth);
    this.armR = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.55, 0.11), cloth);
    this.armL.position.set(-0.31, 1.16, 0); this.armR.position.set(0.31, 1.16, 0);
    this.armL.geometry.translate(0, -0.22, 0); this.armR.geometry.translate(0, -0.22, 0);
    this.group.add(this.armL, this.armR);

    this.legL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.72, 0.14), dark);
    this.legR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.72, 0.14), dark);
    this.legL.position.set(-0.12, 0.82, 0); this.legR.position.set(0.12, 0.82, 0);
    this.legL.geometry.translate(0, -0.3, 0); this.legR.geometry.translate(0, -0.3, 0);
    this.group.add(this.legL, this.legR);

    // 懐中電灯（光そのものは Game 側のライトプールが受けもつ。
    //   端末ごとに灯す本数を変えられるようにするため）
    this.sway = 0;
    this.torchHot = false;

    const beam = new THREE.Mesh(
      new THREE.ConeGeometry(1.5, 7, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffeec8, transparent: true, opacity: 0.055, depthWrite: false, side: THREE.DoubleSide })
    );
    beam.rotation.x = Math.PI / 2;
    beam.position.set(0.3, 1.05, 3.6);
    this.group.add(beam);
    this.beam = beam;
  }

  speak(text, dur = 3.2) { this.line = text; this.talkT = dur; }

  // --- 移動先を決める ---------------------------------------
  goTo(x, z) {
    const nav = this.world.nav;
    const a = nav.nearest(this.x, this.z, 0, this.world.colliders);
    const b = nav.nearest(x, z, 0, this.world.colliders);
    const p = nav.path(a, b);
    this.path = p ? p.map((i) => nav.nodes[i]) : null;
    this.pathI = 0;
    this.target = { x, z };
  }

  wanderSomewhere() {
    const rooms = this.world.rooms.filter((r) => r.kind !== "yard" || Math.random() < 0.35);
    const r = choice(rooms);
    const x = r.kind === "yard" ? rand(-34, 34) : r.cx + rand(-2, 2);
    if (r.kind === "stair") return this.goTo(r.cx, -5.5);
    const z = r.kind === "yard" ? rand(6, 30) : r.cz + rand(-1.5, 1.5);
    this.goTo(x, z);
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
    const d = dist(this.x, this.z, px, pz);
    if (d > range) return false;
    const ang = Math.atan2(px - this.x, pz - this.z);
    let diff = Math.abs(((ang - this.yaw + Math.PI) % (Math.PI * 2)) - Math.PI);
    if (diff > 1.05 && d > 2.4) return false;
    return this.world.colliders.lineOfSight(this.x, this.z, px, pz, 1.35, 0.7);
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
        if (!this.path) this.goTo(w.exit.x, w.exit.z);
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
      }
    }

    if (wantX !== null) {
      this.vx = lerp(this.vx, wantX * speed, clamp(dt * 8, 0, 1));
      this.vz = lerp(this.vz, wantZ * speed, clamp(dt * 8, 0, 1));
    } else {
      this.vx = lerp(this.vx, 0, clamp(dt * 9, 0, 1));
      this.vz = lerp(this.vz, 0, clamp(dt * 9, 0, 1));
    }

    const r = w.colliders.resolve(this.x + this.vx * dt, this.z + this.vz * dt, this.radius, 1.0);
    if (r.hit) {
      // 引っかかったら経路を引き直す
      this.stuck = (this.stuck || 0) + dt;
      if (this.stuck > 1.2 && this.target) { this.goTo(this.target.x, this.target.z); this.stuck = 0; }
    } else this.stuck = 0;
    this.x = r.x; this.z = r.z;

    const mv = Math.hypot(this.vx, this.vz);
    if (mv > 0.25 && this.state !== "spooked")
      this.yaw = angleLerp(this.yaw, Math.atan2(this.vx, this.vz), clamp(dt * 7, 0, 1));
    this.walkPhase += dt * (2.5 + mv * 2.2);

    this.render(dt, t, mv, ctx);
  }

  render(dt, t, mv, ctx) {
    const panic = this.state === "panic" || this.state === "flee";
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = this.yaw;

    const sw = Math.sin(this.walkPhase) * clamp(mv * 0.32, 0, 1.1);
    this.legL.rotation.x = sw; this.legR.rotation.x = -sw;
    this.armL.rotation.x = -sw * 0.8 - (panic ? 2.2 : 0);
    this.armR.rotation.x = sw * 0.8 - (panic ? 2.2 : 0);
    this.head.position.y = 1.62 + (panic ? Math.abs(Math.sin(t * 22)) * 0.035 : 0);

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
      this.bubble.sprite.position.y = 2.5 + Math.sin(t * 2 + this.x) * 0.05;
    }
  }
}
