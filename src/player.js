import * as THREE from "../lib/three.module.js";
import { clamp, lerp, angleLerp } from "./util.js";
import { FLOOR_H, FLOORS, stairSurface } from "./world.js";
import { CHARS } from "./data.js";

// ============================================================
//  プレイヤー（おばけ）と3人称カメラ
// ============================================================
// おばけの大きさ（1.0 が以前の大きさ。人間より小さくして、こそこそ感を出す）
export const GHOST_SCALE = 0.4;

export class Player {
  constructor(scene, world, charId) {
    this.world = world;
    this.charId = CHARS[charId] ? charId : "hitotsume";
    this.C = CHARS[this.charId];
    this.x = 0; this.y = 1.5; this.z = 20;
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.yaw = Math.PI;
    this.camYaw = Math.PI;
    this.camPitch = 0.18;
    this.camDist = 4.4;
    this.curDist = 4.4;
    this.radius = 0.42 * GHOST_SCALE;

    this.phase = 100;
    this.phasing = false;
    this.scareCooldown = 0;
    this.scarePose = 0;
    this.bob = 0;
    this.dashing = false;
    this.stamina = 100;

    this.group = new THREE.Group();
    this.group.scale.setScalar(GHOST_SCALE * this.C.size);
    this.build();
    scene.add(this.group);

    this.light = new THREE.PointLight(0x9fd8ff, 1.6, 12, 1.6);
    this.light.position.set(0, 1.4, 0);
    this.group.add(this.light);
  }

  // すがたを 着がえる（かけらで 開放したキャラに）
  setChar(id) {
    if (!CHARS[id] || id === this.charId) return false;
    this.charId = id;
    this.C = CHARS[id];
    // いまの見た目を すべて消して、作りなおす
    while (this.group.children.length) {
      const o = this.group.children[0];
      this.group.remove(o);
      o.traverse && o.traverse((q) => {
        if (q.geometry) q.geometry.dispose();
        if (q.material && q.material !== this.bodyMat && q.material !== this.eyeMat) q.material.dispose();
      });
    }
    this.build();
    this.group.add(this.light);
    this.group.scale.setScalar(GHOST_SCALE * this.C.size);
    return true;
  }

  build() {
    const C = this.C || CHARS.hitotsume;
    const bodyMat = new THREE.MeshLambertMaterial({
      color: C.body, emissive: C.glow, emissiveIntensity: 0.55,
      transparent: true, opacity: 0.93,
    });
    this.bodyMat = bodyMat;

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 14), bodyMat);
    head.position.y = 1.25;
    head.scale.set(1, 1.05, 0.96);
    head.renderOrder = 1;
    this.group.add(head);
    this.head = head;

    const skirtGeo = new THREE.CylinderGeometry(0.5, 0.66, 0.95, 22, 4, true);
    this.skirtGeo = skirtGeo;
    this.skirtBase = skirtGeo.attributes.position.array.slice();
    const skirt = new THREE.Mesh(skirtGeo, new THREE.MeshLambertMaterial({
      color: C.body, emissive: C.glow, emissiveIntensity: 0.45,
      transparent: true, opacity: 0.9, side: THREE.DoubleSide,
    }));
    this.skirtMat = skirt.material;
    skirt.position.y = 0.78;
    skirt.renderOrder = 1;
    this.group.add(skirt);
    this.skirt = skirt;

    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111820, transparent: true });
    this.eyeMat = eyeMat;
    const eyeGeo = new THREE.SphereGeometry(0.105, 12, 10);
    this.eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    this.eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    this.eyeL.position.set(-0.17, 1.32, 0.44);
    this.eyeR.position.set(0.17, 1.32, 0.44);
    this.eyeL.scale.set(1, 1.25, 0.6);
    this.eyeR.scale.set(1, 1.25, 0.6);
    this.eyeL.renderOrder = 2; this.eyeR.renderOrder = 2;
    this.group.add(this.eyeL, this.eyeR);

    const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), eyeMat);
    mouth.position.set(0, 1.06, 0.46);
    mouth.scale.set(0.85, 0.5, 0.4);
    mouth.renderOrder = 2;
    this.group.add(mouth);
    this.mouth = mouth;

    // 壁にさえぎられたときに、輪郭だけ手前に描くためのコピー
    const xrayMat = new THREE.MeshBasicMaterial({
      color: C.glow, transparent: true, opacity: 0.42,
      depthTest: false, depthWrite: false,
    });
    this.xrayMat = xrayMat;
    this.xray = new THREE.Group();
    this.xray.renderOrder = 900;
    this.xray.visible = false;
    const xHead = new THREE.Mesh(head.geometry, xrayMat);
    xHead.position.copy(head.position); xHead.scale.copy(head.scale);
    const xSkirt = new THREE.Mesh(skirtGeo, xrayMat);
    xSkirt.position.copy(skirt.position);
    this.xray.add(xHead, xSkirt);
    this.xHead = xHead;
    this.group.add(this.xray);

    const handGeo = new THREE.SphereGeometry(0.15, 10, 8);
    this.handL = new THREE.Mesh(handGeo, bodyMat);
    this.handR = new THREE.Mesh(handGeo, bodyMat);
    this.handL.position.set(-0.55, 1.0, 0.1);
    this.handR.position.set(0.55, 1.0, 0.1);
    this.group.add(this.handL, this.handR);

    this.decorate(bodyMat, eyeMat);
  }

  // すがたごとの かざり。ここだけ 変えれば 見た目が変わる
  decorate(bodyMat, eyeMat) {
    const id = this.charId;
    const C = this.C;
    const accent = new THREE.MeshLambertMaterial({ color: C.glow, emissive: C.glow, emissiveIntensity: 0.5 });
    this.extras = [];
    const add = (m) => { this.group.add(m); this.extras.push(m); return m; };

    if (id === "hitotsume") {
      // 目をひとつにする（右目を消して、左目を まんなかに大きく）
      this.eyeR.visible = false;
      this.eyeL.position.set(0, 1.34, 0.44);
      this.eyeL.scale.set(1.9, 2.0, 0.8);
      const white = add(new THREE.Mesh(new THREE.SphereGeometry(0.29, 14, 12),
        new THREE.MeshBasicMaterial({ color: 0xfdfdf5 })));
      white.position.set(0, 1.34, 0.36);
      white.scale.set(1, 1, 0.6);
      this.group.remove(this.eyeL); this.group.add(this.eyeL);   // 白目より手前へ

    } else if (id === "karakasa") {
      // 開いた傘と、一本足と、長い舌
      const canopy = add(new THREE.Mesh(new THREE.ConeGeometry(0.92, 0.62, 10, 1, true), accent));
      canopy.position.y = 1.72;
      for (let i = 0; i < 10; i++) {
        const rib = add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.9),
          new THREE.MeshBasicMaterial({ color: 0x4a3524 })));
        const a = (i / 10) * Math.PI * 2;
        rib.position.set(Math.cos(a) * 0.44, 1.58, Math.sin(a) * 0.44);
        rib.rotation.set(0.32, -a, 0);
      }
      const pole = add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.5, 8),
        new THREE.MeshLambertMaterial({ color: 0x6a4a2a })));
      pole.position.y = 1.1;
      const foot = add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.6),
        new THREE.MeshLambertMaterial({ color: 0x3a2a1a })));
      foot.position.set(0, 0.16, 0.08);
      this.foot = foot;
      const tongue = add(new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.42, 0.06),
        new THREE.MeshBasicMaterial({ color: 0xd8455a })));
      tongue.position.set(0, 0.92, 0.44);
      this.tongue = tongue;
      this.eyeR.visible = false;
      this.eyeL.position.set(0, 1.34, 0.44);
      this.eyeL.scale.set(1.7, 1.8, 0.8);

    } else if (id === "amanojaku") {
      // 小さな2本の角と、とがった歯
      for (const sx of [-0.2, 0.2]) {
        const horn = add(new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.34, 6), accent));
        horn.position.set(sx, 1.72, 0.06);
        horn.rotation.z = sx > 0 ? -0.24 : 0.24;
      }
      for (let i = 0; i < 5; i++) {
        const tooth = add(new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.12, 4),
          new THREE.MeshBasicMaterial({ color: 0xfdfdf5 })));
        tooth.position.set(-0.18 + i * 0.09, 1.03, 0.46);
        tooth.rotation.x = Math.PI;
      }
      this.eyeL.scale.set(1.2, 0.7, 0.6);
      this.eyeR.scale.set(1.2, 0.7, 0.6);

    } else if (id === "kappa") {
      // 頭の皿、くちばし、背中の甲羅
      const dish = add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.09, 14),
        new THREE.MeshLambertMaterial({ color: 0xf2e9a0, emissive: 0x8a7a20, emissiveIntensity: 0.4 })));
      dish.position.y = 1.66;
      const water = add(new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.05, 14),
        new THREE.MeshBasicMaterial({ color: 0x6ac8ff, transparent: true, opacity: 0.8 })));
      water.position.y = 1.71;
      const beak = add(new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.34, 8), accent));
      beak.position.set(0, 1.16, 0.5);
      beak.rotation.x = Math.PI / 2;
      const shell = add(new THREE.Mesh(new THREE.SphereGeometry(0.46, 12, 10),
        new THREE.MeshLambertMaterial({ color: 0x3f6a4a, emissive: 0x1a3a24, emissiveIntensity: 0.4 })));
      shell.position.set(0, 0.92, -0.3);
      shell.scale.set(1, 0.85, 0.5);

    } else if (id === "tengu") {
      // 長い鼻、黒い羽、頭の小さな箱
      const nose = add(new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.72, 8), accent));
      nose.position.set(0, 1.24, 0.68);
      nose.rotation.x = Math.PI / 2;
      for (const sx of [-1, 1]) {
        const wing = add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.07),
          new THREE.MeshLambertMaterial({ color: 0x1e1a22, emissive: 0x3a2a2a, emissiveIntensity: 0.3 })));
        wing.position.set(sx * 0.72, 1.14, -0.24);
        wing.rotation.set(0.1, sx * 0.5, sx * 0.35);
        this.wings = this.wings || [];
        this.wings.push(wing);
      }
      const cap = add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.2),
        new THREE.MeshLambertMaterial({ color: 0x2a2a4a })));
      cap.position.set(0, 1.76, 0.1);
      this.eyeL.scale.set(1.1, 1.5, 0.6);
      this.eyeR.scale.set(1.1, 1.5, 0.6);

    } else if (id === "kyubi") {
      // 九つの尾と、けものの耳
      this.tails = [];
      for (let i = 0; i < 9; i++) {
        const t = i / 8;
        const tail = add(new THREE.Mesh(new THREE.ConeGeometry(0.13, 1.15, 7), accent));
        const a = (t - 0.5) * 2.3;
        tail.position.set(Math.sin(a) * 0.5, 0.92 + Math.cos(a) * 0.28, -0.42 - Math.abs(Math.sin(a)) * 0.12);
        tail.rotation.set(-1.0, 0, -a * 0.9);
        this.tails.push({ m: tail, a, base: tail.rotation.z });
        const tip = add(new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.34, 7),
          new THREE.MeshBasicMaterial({ color: 0xfff4d8 })));
        tip.position.copy(tail.position);
        tip.position.y += Math.cos(a) * 0.5 + 0.42;
        tip.position.x += Math.sin(a) * 0.42;
        tip.position.z -= 0.3;
        tip.rotation.copy(tail.rotation);
        this.tails.push({ m: tip, a, base: tip.rotation.z });
      }
      for (const sx of [-0.26, 0.26]) {
        const ear = add(new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.38, 5), accent));
        ear.position.set(sx, 1.74, 0.02);
        ear.rotation.z = sx > 0 ? -0.3 : 0.3;
      }
      this.eyeL.scale.set(1.3, 1.1, 0.6);
      this.eyeR.scale.set(1.3, 1.1, 0.6);
    }
  }

  get pos() { return { x: this.x, y: this.y, z: this.z }; }

  update(dt, input, camera, t) {
    const w = this.world;

    // --- 視点回転 ------------------------------------------
    this.camYaw -= input.mouseDX * 0.0026;
    this.camPitch = clamp(this.camPitch + input.mouseDY * 0.0022, -0.6, 1.15);
    input.mouseDX = 0; input.mouseDY = 0;

    // --- 移動入力（キーボード or タッチのスティック） --------
    let mx = 0, mz = 0;
    if (input.k("KeyW")) mz -= 1;
    if (input.k("KeyS")) mz += 1;
    if (input.k("KeyA")) mx -= 1;
    if (input.k("KeyD")) mx += 1;
    let mag = Math.hypot(mx, mz);
    if (mag > 0) { mx /= mag; mz /= mag; }
    else if (input.axisX || input.axisZ) {
      mx = input.axisX; mz = input.axisZ;
      mag = Math.min(1, Math.hypot(mx, mz));
    }

    // 画面の奥へ進む向き＝カメラが見ている方向。その右手が「右」。
    //   mz: -1 が前（W・スティック上）、mx: +1 が右（D・スティック右）
    const cos = Math.cos(this.camYaw), sin = Math.sin(this.camYaw);
    const fwd = -mz, rgt = mx;
    const dirX = fwd * sin - rgt * cos;
    const dirZ = fwd * cos + rgt * sin;

    this.dashing = (input.k("ShiftLeft") || input.dash) && mag > 0 && this.stamina > 1;
    // すがたによって、だっしゅの もちが変わる
    if (this.dashing) this.stamina = Math.max(0, this.stamina - dt * 26 / this.C.dash);
    else this.stamina = Math.min(100, this.stamina + dt * 17 * this.C.dash);

    const speed = (this.dashing ? 9.6 : 5.4) * this.C.speed;
    const accel = mag > 0 ? 22 : 13;
    this.vx = lerp(this.vx, dirX * speed, clamp(accel * dt, 0, 1));
    this.vz = lerp(this.vz, dirZ * speed, clamp(accel * dt, 0, 1));

    // --- すりぬけ ------------------------------------------
    this.phasing = input.k("KeyQ") && this.phase > 0;
    // すがたによって、すりぬけの もちが変わる
    if (this.phasing) this.phase = Math.max(0, this.phase - dt * 34 / this.C.phase);
    else this.phase = Math.min(100, this.phase + dt * 13 * this.C.phase);

    // --- 上下 ----------------------------------------------
    const up = input.k("Space") ? 1 : input.k("KeyC") ? -1 : 0;
    const indoors = w.isIndoors(this.x, this.z, this.y);
    const inShaft = indoors && w.inStairShaft(this.x, this.z);
    // いま何階にいるか（階段の途中では、近いほうの階に落ち着く）
    this.floor = clamp(Math.round((this.y - 1.02) / FLOOR_H), 0, FLOORS);
    const base = indoors ? Math.min(this.floor, FLOORS) * FLOOR_H : 0;
    let hover = base + 1.02 + Math.sin(t * 1.9) * 0.05;
    if (inShaft) {
      // 階段では、段の高さに沿って自然に上り下りする（奥へ進むと上へ）
      const rel = stairSurface(this.x, this.z, w.stairCenterX(this.x));
      let best = null;
      for (let f = 0; f <= FLOORS; f++) {
        const cand = f * FLOOR_H + rel + 1.02;
        if (best === null || Math.abs(cand - this.y) < Math.abs(best - this.y)) best = cand;
      }
      hover = clamp(best, 1.02, FLOORS * FLOOR_H + 1.02);
    }
    if (up !== 0) this.vy = lerp(this.vy, up * 3.0, clamp(9 * dt, 0, 1));
    else this.vy = lerp(this.vy, (hover - this.y) * 3.2, clamp(6 * dt, 0, 1));
    let lo = 0.38, hi = 5.0;
    const onRoof = indoors && this.y > w.roofY - 1.0;
    if (onRoof) {
      lo = w.roofY + 0.38; hi = w.roofY + 3.2;
    } else if (indoors) {
      lo = inShaft ? 0.38 : base + 0.38;
      hi = inShaft ? FLOORS * FLOOR_H + 2.4 : base + 2.55;
    } else if (w.inGym && w.inGym(this.x, this.z)) {
      hi = w.gymCeil;                       // 体育館は天井が高い
    }
    this.y = clamp(this.y + this.vy * dt, lo, hi);
    this.inShaft = inShaft;

    // --- 移動と衝突 ----------------------------------------
    let nx = this.x + this.vx * dt;
    let nz = this.z + this.vz * dt;
    if (!this.phasing) {
      const r = w.colliders.resolve(nx, nz, this.radius, this.y, this.inShaft ? ["stair"] : null);
      if (r.hit) { this.vx *= 0.55; this.vz *= 0.55; }
      nx = r.x; nz = r.z;
    } else {
      for (const b of w.colliders.near(nx, nz, this.radius + 0.4)) {
        if (b.tag !== "barrier") continue;
        if (nx > b.x1 - this.radius && nx < b.x2 + this.radius && nz > b.z1 - this.radius && nz < b.z2 + this.radius) {
          const back = w.colliders.resolve(nx, nz, this.radius, this.y);
          nx = back.x; nz = back.z;
        }
      }
    }
    const B = w.bounds;
    this.x = clamp(nx, B.x1, B.x2);
    this.z = clamp(nz, B.z1, B.z2);

    const moving = Math.hypot(this.vx, this.vz);
    if (moving > 0.4) this.yaw = angleLerp(this.yaw, Math.atan2(this.vx, this.vz), clamp(dt * 9, 0, 1));
    this.bob += dt * (2.0 + moving * 0.35);

    // すがたごとの うごき
    if (this.foot) {                                   // 唐傘：ぴょんぴょん はねる
      const hop = Math.abs(Math.sin(this.bob * 1.6));
      this.group.position.y += hop * 0.16;
      this.foot.rotation.x = Math.sin(this.bob * 1.6) * 0.4;
      if (this.tongue) this.tongue.rotation.x = 0.4 + Math.sin(t * 3.2) * 0.35;
    }
    if (this.wings) {                                  // 天狗：はばたく
      for (let i = 0; i < this.wings.length; i++) {
        const s = i ? 1 : -1;
        this.wings[i].rotation.z = s * (0.35 + Math.sin(t * 5.5) * 0.4);
      }
    }
    if (this.tails) {                                  // 九尾：尾が ゆらめく
      for (let i = 0; i < this.tails.length; i++) {
        const T2 = this.tails[i];
        T2.m.rotation.z = T2.base + Math.sin(t * 2.2 + T2.a * 2.4) * 0.16;
      }
    }
    this.scareCooldown = Math.max(0, this.scareCooldown - dt);
    this.scarePose = Math.max(0, this.scarePose - dt);

    this.applyPose(dt, t, moving);
    this.updateCamera(dt, camera);
  }

  applyPose(dt, t, moving) {
    this.group.position.set(this.x, this.y - 1.1 * GHOST_SCALE, this.z);
    this.group.rotation.y = this.yaw;

    const p = this.scarePose > 0 ? Math.min(1, this.scarePose * 2.2) : 0;
    const sc = 1 + p * 0.28 + Math.sin(this.bob) * 0.022;
    this.head.scale.set(sc, sc * 1.05 + p * 0.1, sc * 0.96);
    this.handL.position.set(-0.55 - p * 0.22, 1.0 + p * 0.75, 0.1 + p * 0.15);
    this.handR.position.set(0.55 + p * 0.22, 1.0 + p * 0.75, 0.1 + p * 0.15);
    this.mouth.scale.set(0.85 + p * 0.5, 0.5 + p * 2.2, 0.4);
    this.eyeL.scale.set(1 + p * 0.5, 1.25 + p * 0.5, 0.6);
    this.eyeR.scale.set(1 + p * 0.5, 1.25 + p * 0.5, 0.6);

    const op = this.phasing ? 0.34 : 0.93;
    this.bodyMat.opacity = lerp(this.bodyMat.opacity, op, clamp(dt * 10, 0, 1));
    this.skirtMat.opacity = this.bodyMat.opacity * 0.97;
    this.eyeMat.opacity = this.bodyMat.opacity;
    this.light.intensity = 1.6 + p * 3.6 + Math.sin(t * 3.1) * 0.12;

    const a = this.skirtGeo.attributes.position;
    const base = this.skirtBase;
    for (let i = 0; i < a.count; i++) {
      const by = base[i * 3 + 1];
      if (by > -0.2) continue;
      const bx = base[i * 3], bz = base[i * 3 + 2];
      const ang = Math.atan2(bz, bx);
      const wv = Math.sin(ang * 4 + t * 4.5) * 0.11 + Math.sin(ang * 7 - t * 2.6) * 0.06;
      const k = 1 + wv * (0.6 + moving * 0.05);
      a.array[i * 3] = bx * k;
      a.array[i * 3 + 2] = bz * k;
      a.array[i * 3 + 1] = by + Math.sin(ang * 5 + t * 5) * 0.07;
    }
    a.needsUpdate = true;
  }

  updateCamera(dt, camera) {
    const tx = this.x, ty = this.y + 0.48, tz = this.z;
    const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
    const dx = Math.sin(this.camYaw) * cp, dz = Math.cos(this.camYaw) * cp;
    const col = this.world.colliders;

    // 壁にぶつかる手前までカメラを寄せる
    let d = this.camDist;
    for (let s = 0.5; s <= this.camDist; s += 0.15) {
      const px = tx - dx * s, pz = tz - dz * s, py = ty + sp * s;
      if (this.blockedAt(px, py, pz, 0.26)) { d = Math.max(0.95, s - 0.36); break; }
    }
    this.curDist = lerp(this.curDist, d, clamp(dt * (d < this.curDist ? 24 : 6), 0, 1));

    // 近づくほど少し高い位置から見下ろして、おばけが隠れにくいようにする
    const tight = clamp(1 - (this.curDist - 0.95) / (this.camDist - 0.95), 0, 1);
    const lift = tight * 0.42;

    camera.position.set(
      tx - dx * this.curDist,
      ty + sp * this.curDist + 0.26 + lift,
      tz - dz * this.curDist
    );
    camera.lookAt(tx, ty + 0.10 - lift * 0.25, tz);

    // それでも壁ごしになるときは、輪郭を手前に描く
    const hidden = this.occluded(camera.position, tx, ty, tz);
    if (this.xray) {
      this.xray.visible = hidden;
      if (hidden) {
        this.xHead.scale.copy(this.head.scale);
        this.xrayMat.opacity = 0.30 + (this.scarePose > 0 ? 0.25 : 0);
      }
    }
  }

  // (px,py,pz) が壁などの中に入っているか
  blockedAt(px, py, pz, pad) {
    for (const b of this.world.colliders.near(px, pz, pad + 0.2)) {
      if (b.tag === "soft" || b.tag === "barrier" || b.tag === "furn") continue;
      if (py < b.y1 - 0.12 || py > b.y2 + 0.12) continue;
      if (px > b.x1 - pad && px < b.x2 + pad && pz > b.z1 - pad && pz < b.z2 + pad) return true;
    }
    return false;
  }

  // カメラとおばけのあいだに壁があるか（高さも見る）
  occluded(camPos, tx, ty, tz) {
    const dx = tx - camPos.x, dy = ty - camPos.y, dz = tz - camPos.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.4) return false;
    const n = Math.min(40, Math.max(4, Math.ceil(len / 0.18)));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (this.blockedAt(camPos.x + dx * t, camPos.y + dy * t, camPos.z + dz * t, 0.02)) return true;
    }
    return false;
  }
}
