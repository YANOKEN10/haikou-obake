import * as THREE from "../lib/three.module.js";
import { clamp, lerp, angleLerp } from "./util.js";
import { FLOOR_H, FLOORS, stairSurface } from "./world.js";
import { CHARS, UPG_STEP, paintById } from "./data.js";

// ============================================================
//  プレイヤー（おばけ）と3人称カメラ
// ============================================================
// おばけの大きさ（1.0 が以前の大きさ。人間より小さくして、こそこそ感を出す）
export const GHOST_SCALE = 0.4;
// 屋根より 何メートル 上まで 浮けるか（校舎は 高さ14.4m）
const SKY_UP = 18;
const RISE = 3.4;        // 上がる速さ
const FALL_MAX = 5.5;    // 手をはなしたときの、下りる いちばんの速さ

export class Player {
  constructor(scene, world, charId) {
    this.world = world;
    this.charId = CHARS[charId] ? charId : "obake";
    this.C = CHARS[this.charId];
    // すがたごとの きょうか。{speed:3, scare:1, ...}
    //  CHARS そのものは みんなで つかう表なので、書きかえない。
    //  かわりに stat() で 足しあわせて つかう。
    this.up = {};
    // すがたごとの 色。{body:"kin", deco:"sora", ...}
    this.paint = {};
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
    this.applyPaint();                       // あかりの色も つけなおす
    this.group.scale.setScalar(GHOST_SCALE * this.C.size);
    return true;
  }

  // いまの すがたの きょうかレベルを 入れる
  setUpgrades(up) { this.up = up || {}; }

  // きょうかを 足した あとの 数値。
  //  例：河童の はやさ 1.28 に レベル1（+0.02）で 1.30
  stat(key) {
    const base = (this.C && this.C[key] !== undefined) ? this.C[key] : 1;
    return base + (this.up[key] || 0) * UPG_STEP;
  }

  build() {
    const C = this.C || CHARS.obake;
    this.smoke = null;
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

    // もとの色を おぼえておく。色をかえても、
    // 「もとの色」に もどせるように するため
    this.baseColors = {
      body: bodyMat.color.clone(),
      skirt: this.skirtMat ? this.skirtMat.color.clone() : null,
      eye: eyeMat.color.clone(),
      glow: new THREE.Color((this.C || CHARS.obake).glow),
      // 自分で光る色は すがたごとに ちがう（一つ目小僧の はかまなど）。
      //  ひかりの色を えらんでいないときは、これに もどす
      bodyE: bodyMat.emissive.clone(),
      skirtE: this.skirtMat ? this.skirtMat.emissive.clone() : null,
    };
    this.extraBase = this.extras.map((m) => (m.material ? m.material.color.clone() : null));
    this.extraEmis = this.extras.map((m) => (m.material && m.material.emissive ? m.material.emissive.clone() : null));
    this.applyPaint();
  }

  // --- 色がえ ------------------------------------------------
  //  paint = {body:"kin", deco:"sora", glow:"yami", eye:"snow"}
  //  「もとの色」のパーツは さわらない
  setPaint(paint) { this.paint = paint || {}; this.applyPaint(); }

  applyPaint() {
    const P = this.paint || {};
    const base = this.baseColors;
    if (!base) return;
    const hex = (k) => { const q = paintById(P[k]); return q && q.hex !== null && q.hex !== undefined ? q.hex : null; };

    // からだ（あたま・手・すそ）
    const b = hex("body");
    if (this.bodyMat) {
      if (b !== null) this.bodyMat.color.setHex(b); else this.bodyMat.color.copy(base.body);
    }
    if (this.skirtMat && base.skirt) {
      if (b !== null) this.skirtMat.color.setHex(b); else this.skirtMat.color.copy(base.skirt);
    }
    // 色を えらんだら、明るさの くせも そろえて 見本どおりに 見せる
    if (this.bodyMat) this.bodyMat.emissiveIntensity = b !== null ? 0.34 : 0.55;
    if (this.skirtMat) this.skirtMat.emissiveIntensity = b !== null ? 0.3 : 0.45;

    // ひかり（emissive と、かべごしの りんかく と 手あかり）
    const gcol = hex("glow");
    const gc = gcol !== null ? new THREE.Color(gcol) : base.glow;
    if (this.bodyMat) {
      if (gcol !== null) this.bodyMat.emissive.copy(gc); else this.bodyMat.emissive.copy(base.bodyE);
    }
    if (this.skirtMat && base.skirtE) {
      if (gcol !== null) this.skirtMat.emissive.copy(gc); else this.skirtMat.emissive.copy(base.skirtE);
    }
    if (this.xrayMat) this.xrayMat.color.copy(gc);
    if (this.light) this.light.color.copy(gc);

    // め と くち
    const e = hex("eye");
    if (this.eyeMat) {
      if (e !== null) this.eyeMat.color.setHex(e); else this.eyeMat.color.copy(base.eye);
    }

    // かざり（すがたごとの ぶひん）。
    //  もとの色みを のこしたいので、そのまま ぬりつぶさず
    //  えらんだ色に 7わり よせる
    const dcol = hex("deco");
    const ecol = hex("eye");
    for (let i = 0; i < this.extras.length; i++) {
      const m = this.extras[i], ob = this.extraBase[i];
      if (!m || !m.material || !ob) continue;
      const part = m.userData.part || "deco";
      const want = part === "eye" ? ecol : part === "body" ? b : dcol;
      if (want === null) {
        m.material.color.copy(ob);
        if (m.material.emissive && this.extraEmis[i]) m.material.emissive.copy(this.extraEmis[i]);
        continue;
      }
      // えらんだ色を そのまま。まぜない
      m.material.color.setHex(want);
      // 自分で光る色も 同じ色にして、見本どおりに 見えるようにする
      if (m.material.emissive) m.material.emissive.setHex(want).multiplyScalar(0.34);
    }
  }

  // すがたごとの かざり。参考の絵に合わせて 作ってある。
  //  からだ（あたま＋すそ）は そのまま使い、
  //  顔や 持ちものを つけかえて それらしくする。
  decorate(bodyMat, eyeMat) {
    const id = this.charId;
    const C = this.C;
    this.headScale = 1;
    this.tongue = null;
    this.smoke = null;
    this.wings = null;
    this.tails = null;
    this.foot = null;
    this.extras = [];
    const M = (c, opt) => new THREE.MeshLambertMaterial({ color: c, emissive: opt && opt.e !== undefined ? opt.e : c,
      emissiveIntensity: opt && opt.i !== undefined ? opt.i : 0.35 });
    const B = (c) => new THREE.MeshBasicMaterial({ color: c });
    // part … "deco"（かざり）か "eye"（目）。あとで 色を かえるとき つかう
    const add = (m, part) => {
      m.userData.part = part || "deco";
      this.group.add(m); this.extras.push(m); return m;
    };
    // まんまるの目玉（白目＋黒目）をひとつ作る
    const bigEye = (x, y, z, r, look) => {
      const white = add(new THREE.Mesh(new THREE.SphereGeometry(r, 16, 14), B(0xfdfbf4)), "eye");
      white.position.set(x, y, z); white.scale.set(1, 1, 0.55); white.renderOrder = 2;
      const pup = add(new THREE.Mesh(new THREE.SphereGeometry(r * 0.5, 12, 10), B(0x1a1418)), "eye");
      pup.position.set(x + (look || 0) * r * 0.25, y, z + r * 0.42); pup.scale.set(1, 1, 0.6); pup.renderOrder = 3;
      return { white, pup };
    };
    const cheeks = (y, z, c) => {
      for (const sx of [-0.38, 0.38]) {
        const ch = add(new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), B(c)));
        ch.position.set(sx, y, z); ch.scale.set(1.2, 0.8, 0.3); ch.renderOrder = 2;
      }
    };
    const tongue = (y, z, len) => {
      const tg = add(new THREE.Mesh(new THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(0.11, len, 4, 8)
        : new THREE.BoxGeometry(0.2, len, 0.08), B(0xf2887e)));
      tg.position.set(0, y - len / 2, z); tg.rotation.x = 0.25; tg.renderOrder = 2;
      this.tongue = tg;
      return tg;
    };

    if (id === "obake") {
      return;                                        // もとの すがた
    }

    if (id === "hitotsume") {
      // まん丸の あたまに 大きな目ひとつ。舌を出して、白い上着に 灰色のはかま
      this.eyeL.visible = false; this.eyeR.visible = false; this.mouth.visible = false;
      this.headScale = 1.15;
      bigEye(0, 1.32, 0.40, 0.30);
      cheeks(1.12, 0.40, 0xf7b8b0);
      tongue(1.06, 0.44, 0.34);
      this.skirtMat.color.setHex(0x35353d);           // 黒っぽい 鼠色の はかま
      this.skirtMat.emissive.setHex(0x14141a);        // 体は 光らせない（顔だけ ほんのり）
      this.skirtMat.emissiveIntensity = 0.3;
      const belt = add(new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.12, 18), B(0xfdfbf4)));
      belt.position.y = 1.02;
      const geta = add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.46), M(0xb08a52)));
      geta.position.set(0.2, 0.18, 0.12); geta.rotation.z = -0.2;
      this.foot = geta;

    } else if (id === "karakasa") {
      // まっ赤な傘のからだ。目ひとつと 長い舌、下に 一本足と 下駄
      this.head.visible = false; this.eyeL.visible = false; this.eyeR.visible = false; this.mouth.visible = false;
      this.handL.visible = false; this.handR.visible = false;
      this.skirt.visible = false;
      const canopy = add(new THREE.Mesh(new THREE.ConeGeometry(1.02, 1.5, 8), M(0x9a2026, { e: 0x5a1014, i: 0.4 })), "body");
      canopy.position.y = 1.32;
      for (let i = 0; i < 8; i++) {                    // 骨のすじ
        const a2 = (i / 8) * Math.PI * 2;
        const rib = add(new THREE.Mesh(new THREE.BoxGeometry(0.055, 1.5, 0.055), M(0x5a1014, { i: 0.2 })));
        rib.position.set(Math.cos(a2) * 0.5, 1.32, Math.sin(a2) * 0.5);
        rib.rotation.z = Math.cos(a2) * 0.33; rib.rotation.x = -Math.sin(a2) * 0.33;
      }
      const knob = add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.22, 8), M(0x7a6a2a)));
      knob.position.y = 2.14;
      bigEye(0, 1.24, 0.62, 0.30);
      tongue(0.98, 0.66, 0.40);
      const leg = add(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 1.0, 8), M(0xf2ddc4)));
      leg.position.y = 0.36;
      const geta = add(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.56), M(0xc09050)));
      geta.position.y = -0.14;
      for (const dz of [-0.16, 0.16]) {
        const t2 = add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.08), M(0x8a6030)));
        t2.position.set(0, -0.26, dz);
      }
      this.foot = geta;

    } else if (id === "amanojaku") {
      // 青おに。もらった絵に あわせて 作りなおした。
      //  ・まっ赤な 長い髪が あたまを おおい、うしろへ たなびく
      //  ・腹まきに 見えていた 腰みのを やめて、
      //    足もとは ジーニーのような ゆらめく けむりに
      //  ・手を 大きくして、するどい つめと 金のうでわを つけた
      this.headScale = 1.06;
      this.mouth.visible = false;
      this.eyeL.visible = false; this.eyeR.visible = false;
      const HAIR = 0xc41f28, HAIR2 = 0x8a1218;

      for (const sx of [-1, 1]) {                      // つり上がった 金の目
        const e = add(new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), B(0xffd23a)), "eye");
        e.position.set(sx * 0.2, 1.29, 0.45); e.scale.set(1.3, 0.8, 0.5); e.renderOrder = 2;
        const pu = add(new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), B(0x1a1418)), "eye");
        pu.position.set(sx * 0.2, 1.29, 0.51); pu.scale.set(0.85, 1.3, 0.5); pu.renderOrder = 3;
        const brow = add(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.055, 0.05), B(0x1e4a68)));
        brow.position.set(sx * 0.21, 1.44, 0.47); brow.rotation.z = sx * 0.5;
        const ear = add(new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.34, 4), M(this.C.body, { i: 0.2 })));
        ear.position.set(sx * 0.48, 1.36, -0.02);      // とがった 耳
        ear.rotation.set(0.2, 0, sx * -1.15);
      }

      // --- ぼさぼさの 長い髪 ---------------------------------
      //  あたまの まわりを ぐるりと おおい、うしろほど 長くして
      //  たなびいているように 見せる
      for (let i = 0; i < 22; i++) {
        const a2 = (i / 22) * Math.PI * 2;
        const back = (1 - Math.cos(a2)) / 2;                 // うしろほど 1に近い
        const len = 0.55 + back * 1.5 + (i % 3) * 0.12;
        const hair = add(new THREE.Mesh(new THREE.ConeGeometry(0.115, len, 5),
          M(i % 2 ? HAIR : HAIR2, { i: 0.3 })));
        hair.position.set(Math.cos(a2) * 0.46, 1.52 + Math.sin(i * 2.3) * 0.09, Math.sin(a2) * 0.46 - 0.05);
        hair.rotation.set(Math.sin(a2) * 0.9, -a2, -Math.cos(a2) * 0.9);
        hair.rotateX(-back * 1.35);                          // うしろの髪を ねかせる
      }
      // うしろへ 長く ながれる ひとふさ
      for (let i = 0; i < 5; i++) {
        const t2 = i / 4;
        const st = add(new THREE.Mesh(new THREE.ConeGeometry(0.24 - t2 * 0.16, 0.9, 6),
          M(i % 2 ? HAIR : HAIR2, { i: 0.32 })));
        st.position.set((i - 2) * 0.12, 1.78 + t2 * 0.5, -0.55 - t2 * 0.75);
        st.rotation.set(-1.15 - t2 * 0.5, (i - 2) * 0.14, 0);
      }
      // ひたいを おおう 前髪
      for (let i = 0; i < 7; i++) {
        const fx = -0.36 + i * 0.12;
        const fr = add(new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5 + (i % 2) * 0.16, 4), M(HAIR, { i: 0.3 })));
        fr.position.set(fx, 1.62, 0.3);
        fr.rotation.set(2.5, 0, fx * 1.2);
      }
      const horn = add(new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.34, 8), M(0xffc23a, { i: 0.45 })));
      horn.position.set(0, 1.8, 0.24); horn.rotation.x = -0.35;   // ひたいの 金のつの

      // --- 口と きば ----------------------------------------
      const mouth2 = add(new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), B(0x3a1218)));
      mouth2.position.set(0, 1.05, 0.44); mouth2.scale.set(1.15, 0.75, 0.4); mouth2.renderOrder = 2;
      for (const sx of [-0.12, 0.12]) {
        const f = add(new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.17, 4), B(0xfdfbf4)));
        f.position.set(sx, 1.12, 0.5); f.rotation.x = Math.PI; f.renderOrder = 3;
      }

      // --- 足もと：ジーニーのような けむり -------------------
      this.skirt.visible = false;
      this.smoke = [];
      const SEG = 7;                                   // けむりの わっか の数
      for (let i = 0; i < SEG; i++) {
        const t2 = i / (SEG - 1);                      // 0（こし）→ 1（さき）
        const rTop = 0.60 - t2 * 0.52;                 // 下へ いくほど 細くなる
        const rBot = 0.60 - (i + 1) / (SEG - 1) * 0.52;
        const s2 = add(new THREE.Mesh(
          new THREE.CylinderGeometry(Math.max(0.03, rBot), rTop, 0.3, 14, 1, true),
          M(this.C.body, { e: this.C.glow, i: 0.4 })), "body");
        s2.position.y = 0.88 - i * 0.27;               // こしから 下へ ずらりと
        s2.material.transparent = true;
        s2.material.opacity = 0.95 - t2 * 0.45;
        s2.material.side = THREE.DoubleSide;
        this.smoke.push(s2);
      }
      // さきっぽ。くるんと 上へ はねる
      const tip = add(new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.42, 10),
        M(this.C.body, { e: this.C.glow, i: 0.45 })), "body");
      tip.position.set(0.16, -1.02, 0.02); tip.rotation.z = -0.8;
      tip.material.transparent = true; tip.material.opacity = 0.5;
      this.smoke.push(tip);

      // --- 大きな 手 ----------------------------------------
      this.handL.scale.setScalar(1.7);
      this.handR.scale.setScalar(1.7);
      this.handL.position.set(-0.52, 0.92, 0.42);      // 前へ かまえる
      this.handR.position.set(0.52, 0.92, 0.42);
      for (const hand of [this.handL, this.handR]) {
        for (let i = 0; i < 3; i++) {                  // するどい つめ
          const cl = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.2, 4), B(0xf5e3b0));
          cl.position.set((i - 1) * 0.07, -0.13, 0.09);
          // 下へ 向けて、ちょっと 前がかりに（つかみかかる かたち）
          cl.rotation.set(Math.PI - 0.45, 0, (i - 1) * 0.34);
          cl.renderOrder = 2;
          cl.userData.part = "deco";
          hand.add(cl); this.extras.push(cl);
        }
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.03, 8, 16), M(0xffc23a, { i: 0.45 }));
        ring.rotation.x = Math.PI / 2; ring.position.y = 0.12;
        ring.userData.part = "deco";
        hand.add(ring); this.extras.push(ring);        // 金の うでわ
      }

    } else if (id === "kappa") {
      // 頭の皿と おかっぱ髪、大きな目、黄色いくちばし、白いおなか
      this.headScale = 1.1;
      this.eyeL.visible = false; this.eyeR.visible = false; this.mouth.visible = false;
      const dish = add(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.1, 16), B(0xfdfbf4)));
      dish.position.y = 1.64;
      const hairRing = add(new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.13, 8, 20), M(0x4a8a2a, { i: 0.2 })));
      hairRing.rotation.x = Math.PI / 2; hairRing.position.y = 1.5;
      for (let i = 0; i < 9; i++) {                    // ぎざぎざの前髪
        const a2 = (i / 9) * Math.PI * 2;
        const tip = add(new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 4), M(0x4a8a2a, { i: 0.2 })));
        tip.position.set(Math.cos(a2) * 0.48, 1.34, Math.sin(a2) * 0.48);
        tip.rotation.x = Math.PI;
      }
      bigEye(-0.2, 1.28, 0.40, 0.20, -0.3);
      bigEye(0.2, 1.28, 0.40, 0.20, 0.3);
      cheeks(1.1, 0.40, 0xf59ab4);
      const beak = add(new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.3, 6), B(0xf5b93a)));
      beak.position.set(0, 1.1, 0.48); beak.rotation.x = Math.PI / 2; beak.renderOrder = 2;
      const belly = add(new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 12), B(0xfdfbf4)), "body");
      belly.position.set(0, 0.86, 0.3); belly.scale.set(1, 0.9, 0.4);
      const shell = add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), M(0x3f6a2a, { i: 0.25 })));
      shell.position.set(0, 0.9, -0.34); shell.scale.set(1, 0.85, 0.45);
      for (const sx of [-1, 1]) {                      // 水かきの手
        const hand = add(new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.34, 5), M(0x6aae3a, { i: 0.2 })));
        hand.position.set(sx * 0.62, 0.98, 0.14); hand.rotation.z = sx * -1.5;
      }

    } else if (id === "tengu") {
      // まっ赤な顔に 長い鼻、白い髪とひげ、黒い頭巾、灰色の羽、葉うちわ
      this.headScale = 1.07;
      this.mouth.visible = false;
      this.eyeL.scale.set(1.2, 0.8, 0.6); this.eyeR.scale.set(1.2, 0.8, 0.6);
      this.eyeL.position.set(-0.19, 1.3, 0.42); this.eyeR.position.set(0.19, 1.3, 0.42);
      for (const sx of [-1, 1]) {
        const y = add(new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), B(0xffd23a)));
        y.position.set(sx * 0.19, 1.3, 0.4); y.scale.set(1.2, 0.85, 0.45); y.renderOrder = 1;
        const brow = add(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.07, 0.06), B(0xf2efe6)));
        brow.position.set(sx * 0.2, 1.45, 0.44); brow.rotation.z = sx * -0.3;
      }
      const nose = add(new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.95, 10), M(0xe8543a, { i: 0.3 })));
      nose.position.set(0, 1.22, 0.78); nose.rotation.x = Math.PI / 2; nose.renderOrder = 2;
      const cap = add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.24, 8), M(0x2a2028)));
      cap.position.set(0, 1.82, 0.02);
      for (let i = 0; i < 10; i++) {                   // 白い髪
        const a2 = (i / 10) * Math.PI * 2;
        const hair = add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.1), M(0xeceae2, { i: 0.2 })));
        hair.position.set(Math.cos(a2) * 0.46, 1.34, Math.sin(a2) * 0.46 - 0.08);
        hair.rotation.set(Math.sin(a2) * 0.4, -a2, -Math.cos(a2) * 0.4);
      }
      const beard = add(new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 8), M(0xeceae2, { i: 0.2 })));
      beard.position.set(0, 0.92, 0.34); beard.rotation.x = Math.PI;
      this.wings = [];
      for (const sx of [-1, 1]) {
        const wing = add(new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.44, 0.08), M(0x555c68, { e: 0x2a2f38, i: 0.3 })));
        wing.position.set(sx * 0.78, 1.06, -0.3); wing.rotation.set(0.12, sx * 0.55, sx * 0.3);
        this.wings.push(wing);
      }
      const fan = add(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.02, 0.05, 7), M(0x3a8a3a, { i: 0.3 })));
      fan.position.set(0.68, 1.5, 0.16); fan.rotation.set(Math.PI / 2, 0, -0.5);
      this.skirtMat.color.setHex(0x3a2a1e);            // 黒っぽい はかま
      const vest = add(new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.66, 0.5, 16), M(0x2a7a4a, { i: 0.2 })));
      vest.position.y = 0.94;

    } else if (id === "kyubi") {
      // 白ぎつね。とがった鼻づら、耳、赤い目、先がピンクの九つの尾
      this.headScale = 1.04;
      this.mouth.visible = false;
      this.eyeL.visible = false; this.eyeR.visible = false;
      for (const sx of [-1, 1]) {                      // 赤い切れ長の目
        const e = add(new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), B(0xe0323c)));
        e.position.set(sx * 0.2, 1.32, 0.42); e.scale.set(1.35, 0.55, 0.5); e.renderOrder = 2;
      }
      const snout = add(new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.5, 10), M(0xfaf6f2, { i: 0.25 })));
      snout.position.set(0, 1.16, 0.56); snout.rotation.x = Math.PI / 2;
      const nose2 = add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), B(0x3a2a2a)));
      nose2.position.set(0, 1.16, 0.82); nose2.renderOrder = 2;
      for (const sx of [-1, 1]) {                      // 耳
        const ear = add(new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.44, 5), M(0xfaf6f2, { i: 0.25 })));
        ear.position.set(sx * 0.3, 1.72, 0.0); ear.rotation.z = sx * 0.26;
        const inner = add(new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.28, 5), B(0xf3aeb0)));
        inner.position.set(sx * 0.3, 1.7, 0.07); inner.rotation.z = sx * 0.26;
      }
      this.tails = [];
      for (let i = 0; i < 9; i++) {
        const t2 = i / 8, a2 = (t2 - 0.5) * 2.5;
        const tail = add(new THREE.Mesh(new THREE.ConeGeometry(0.17, 1.3, 8), M(0xfaf6f2, { i: 0.25 })));
        tail.position.set(Math.sin(a2) * 0.62, 0.96 + Math.cos(a2) * 0.34, -0.5);
        tail.rotation.set(-0.95, 0, -a2 * 0.95);
        this.tails.push({ m: tail, a: a2, base: tail.rotation.z });
        const tip = add(new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.42, 8), B(0xf3949a)));
        tip.position.set(Math.sin(a2) * 1.0, 1.5 + Math.cos(a2) * 0.62, -0.72);
        tip.rotation.set(-0.95, 0, -a2 * 0.95);
        this.tails.push({ m: tip, a: a2, base: tip.rotation.z });
      }
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
    const kDash = this.stat("dash");
    if (this.dashing) this.stamina = Math.max(0, this.stamina - dt * 26 / kDash);
    else this.stamina = Math.min(100, this.stamina + dt * 17 * kDash);

    const speed = (this.dashing ? 9.6 : 5.4) * this.stat("speed");
    const accel = mag > 0 ? 22 : 13;
    this.vx = lerp(this.vx, dirX * speed, clamp(accel * dt, 0, 1));
    this.vz = lerp(this.vz, dirZ * speed, clamp(accel * dt, 0, 1));

    // --- すりぬけ ------------------------------------------
    this.phasing = input.k("KeyQ") && this.phase > 0;
    // すがたによって、すりぬけの もちが変わる
    const kPhase = this.stat("phase");
    if (this.phasing) this.phase = Math.max(0, this.phase - dt * 34 / kPhase);
    else this.phase = Math.min(100, this.phase + dt * 13 * kPhase);

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
    // 空のたかさ。屋根より ずっと上まで 行ける
    const skyTop = w.roofY + SKY_UP;
    // 屋根より うんと上にいる＝空をとんでいる
    const inSky = this.y > w.roofY + 3.0;

    if (up !== 0) {
      // 高く上がるほど、上がる速さが ゆっくりになる
      const room = clamp((skyTop - this.y) / 6, 0, 1);
      const rise = up > 0 ? RISE * (0.35 + 0.65 * room) : -RISE * 1.15;
      this.vy = lerp(this.vy, rise, clamp(9 * dt, 0, 1));
    } else {
      // 手をはなしたら、すーっと 下りてくる。
      //  高いところからでも 落ちないよう、速さに かぎりをつける
      const want = clamp((hover - this.y) * 3.2, -FALL_MAX, 3.0);
      this.vy = lerp(this.vy, want, clamp(6 * dt, 0, 1));
    }

    let lo = 0.38, hi = skyTop;
    const onRoof = indoors && !inSky && this.y > w.roofY - 1.0;
    if (inSky) {
      lo = 0.38; hi = skyTop;               // 空では さえぎるものが ない
    } else if (onRoof) {
      lo = w.roofY + 0.38; hi = skyTop;     // 屋根からも そのまま 上に行ける
    } else if (indoors) {
      lo = inShaft ? 0.38 : base + 0.38;
      hi = inShaft ? FLOORS * FLOOR_H + 2.4 : base + 2.55;
    } else if (w.inGym && w.inGym(this.x, this.z)) {
      hi = w.gymCeil;                       // 体育館は天井が高い
    }
    this.y = clamp(this.y + this.vy * dt, lo, hi);
    this.inSky = inSky;
    this.inShaft = inShaft;

    // --- 移動と衝突 ----------------------------------------
    let nx = this.x + this.vx * dt;
    let nz = this.z + this.vz * dt;
    // 屋上に いるときは、下の階の かべ（上が 屋根で おわっている）は
    //  見えない かべに なるので、見ないことにする。
    //  屋上の さくや 塔屋は 屋根より 上まで あるので、ちゃんと ぶつかる。
    const minTop = (this.y > w.roofY - 0.1) ? w.roofY + 0.25 : null;
    if (!this.phasing) {
      const r = w.colliders.resolve(nx, nz, this.radius, this.y, this.inShaft ? ["stair"] : null, minTop);
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
    if (this.smoke) {                                  // あまのじゃく：足もとの けむりが ゆれる
      for (let i = 0; i < this.smoke.length; i++) {
        const s2 = this.smoke[i];
        const ph = t * 2.4 - i * 0.55;                 // 下へ 波が つたわる
        const k = i / this.smoke.length;               // さきほど 大きく ゆれる
        s2.rotation.y = Math.sin(ph) * 0.6;
        s2.position.x = Math.sin(ph) * 0.16 * k;
        s2.position.z = Math.cos(ph * 0.85) * 0.13 * k;
      }
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
    const hs = this.headScale || 1;
    this.head.scale.set(sc * hs, (sc * 1.05 + p * 0.1) * hs, sc * 0.96 * hs);
    this.handL.position.set(-0.55 - p * 0.22, 1.0 + p * 0.75, 0.1 + p * 0.15);
    this.handR.position.set(0.55 + p * 0.22, 1.0 + p * 0.75, 0.1 + p * 0.15);
    if (this.mouth.visible) this.mouth.scale.set(0.85 + p * 0.5, 0.5 + p * 2.2, 0.4);
    if (this.eyeL.visible) this.eyeL.scale.set(1 + p * 0.5, 1.25 + p * 0.5, 0.6);
    if (this.eyeR.visible) this.eyeR.scale.set(1 + p * 0.5, 1.25 + p * 0.5, 0.6);
    if (this.tongue) this.tongue.rotation.x = 0.25 + Math.sin(t * 2.6) * 0.2 + p * 0.5;

    const op = this.phasing ? 0.34 : 0.93;
    this.bodyMat.opacity = lerp(this.bodyMat.opacity, op, clamp(dt * 10, 0, 1));
    this.skirtMat.opacity = this.bodyMat.opacity * 0.97;
    this.eyeMat.opacity = this.bodyMat.opacity;
    this.light.intensity = 1.6 + p * 3.6 + Math.sin(t * 3.1) * 0.12;

    if (!this.skirt.visible) return;
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


// すがた（キャラ）の 見た目だけを 作る。
//  Player の build をそのまま借りるので、
//  すがたを ふやしても ここは 直さなくていい。
export function buildGhostLook(charId) {
  const shell = Object.create(Player.prototype);      // Player のやり方を そのまま使う
  shell.charId = CHARS[charId] ? charId : "obake";
  shell.C = CHARS[shell.charId];
  shell.group = new THREE.Group();
  shell.build();
  return shell;
}
