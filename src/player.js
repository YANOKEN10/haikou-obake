import * as THREE from "../lib/three.module.js";
import { clamp, lerp, angleLerp } from "./util.js";

// ============================================================
//  プレイヤー（おばけ）と3人称カメラ
// ============================================================
export class Player {
  constructor(scene, world) {
    this.world = world;
    this.x = 0; this.y = 1.5; this.z = 20;
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.yaw = Math.PI;
    this.camYaw = Math.PI;
    this.camPitch = 0.18;
    this.camDist = 6.0;
    this.curDist = 6.0;
    this.radius = 0.42;

    this.phase = 100;
    this.phasing = false;
    this.scareCooldown = 0;
    this.scarePose = 0;
    this.bob = 0;
    this.dashing = false;
    this.stamina = 100;

    this.group = new THREE.Group();
    this.build();
    scene.add(this.group);

    this.light = new THREE.PointLight(0x9fd8ff, 1.6, 14, 1.6);
    this.light.position.set(0, 1.4, 0);
    this.group.add(this.light);
  }

  build() {
    const bodyMat = new THREE.MeshLambertMaterial({
      color: 0xdfeaf5, emissive: 0x5d7fa8, emissiveIntensity: 0.55,
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
      color: 0xd6e3f0, emissive: 0x4a6b92, emissiveIntensity: 0.45,
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
      color: 0x9fd8ff, transparent: true, opacity: 0.42,
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

    const cos = Math.cos(this.camYaw), sin = Math.sin(this.camYaw);
    const dirX = mx * cos - mz * sin;
    const dirZ = mx * sin + mz * cos;

    this.dashing = (input.k("ShiftLeft") || input.dash) && mag > 0 && this.stamina > 1;
    if (this.dashing) this.stamina = Math.max(0, this.stamina - dt * 26);
    else this.stamina = Math.min(100, this.stamina + dt * 17);

    const speed = this.dashing ? 9.6 : 5.4;
    const accel = mag > 0 ? 22 : 13;
    this.vx = lerp(this.vx, dirX * speed, clamp(accel * dt, 0, 1));
    this.vz = lerp(this.vz, dirZ * speed, clamp(accel * dt, 0, 1));

    // --- すりぬけ ------------------------------------------
    this.phasing = input.k("KeyQ") && this.phase > 0;
    if (this.phasing) this.phase = Math.max(0, this.phase - dt * 34);
    else this.phase = Math.min(100, this.phase + dt * 13);

    // --- 上下 ----------------------------------------------
    const up = input.k("Space") ? 1 : input.k("KeyC") ? -1 : 0;
    const hover = 1.5 + Math.sin(t * 1.9) * 0.07;
    if (up !== 0) this.vy = lerp(this.vy, up * 3.4, clamp(9 * dt, 0, 1));
    else this.vy = lerp(this.vy, (hover - this.y) * 3.2, clamp(6 * dt, 0, 1));
    const ceilY = w.isIndoors(this.x, this.z) ? 2.75 : 5.4;
    this.y = clamp(this.y + this.vy * dt, 0.55, ceilY);

    // --- 移動と衝突 ----------------------------------------
    let nx = this.x + this.vx * dt;
    let nz = this.z + this.vz * dt;
    if (!this.phasing) {
      const r = w.colliders.resolve(nx, nz, this.radius, this.y);
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

    this.scareCooldown = Math.max(0, this.scareCooldown - dt);
    this.scarePose = Math.max(0, this.scarePose - dt);

    this.applyPose(dt, t, moving);
    this.updateCamera(dt, camera);
  }

  applyPose(dt, t, moving) {
    this.group.position.set(this.x, this.y - 1.1, this.z);
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
    const tx = this.x, ty = this.y + 0.75, tz = this.z;
    const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
    const dx = Math.sin(this.camYaw) * cp, dz = Math.cos(this.camYaw) * cp;
    const col = this.world.colliders;

    // 壁にぶつかる手前までカメラを寄せる
    let d = this.camDist;
    for (let s = 0.5; s <= this.camDist; s += 0.15) {
      const px = tx - dx * s, pz = tz - dz * s, py = ty + sp * s;
      if (this.blockedAt(px, py, pz, 0.3)) { d = Math.max(1.15, s - 0.42); break; }
    }
    this.curDist = lerp(this.curDist, d, clamp(dt * (d < this.curDist ? 24 : 6), 0, 1));

    // 近づくほど少し高い位置から見下ろして、おばけが隠れにくいようにする
    const tight = clamp(1 - (this.curDist - 1.15) / (this.camDist - 1.15), 0, 1);
    const lift = tight * 0.55;

    camera.position.set(
      tx - dx * this.curDist,
      ty + sp * this.curDist + 0.35 + lift,
      tz - dz * this.curDist
    );
    camera.lookAt(tx, ty + 0.15 - lift * 0.25, tz);

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
