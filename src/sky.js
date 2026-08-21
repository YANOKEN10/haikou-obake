import * as THREE from "../lib/three.module.js";
import { rand } from "./util.js";

// ============================================================
//  夜空（グラデーションのドーム＋星＋月）
// ============================================================
export function buildSky(scene) {
  const geo = new THREE.SphereGeometry(170, 28, 18);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const top = new THREE.Color(0x0a0d1e);
  const mid = new THREE.Color(0x1b2141);
  const low = new THREE.Color(0x2f2b4a);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const h = Math.max(0, pos.getY(i) / 170);
    if (h > 0.35) c.copy(mid).lerp(top, (h - 0.35) / 0.65);
    else c.copy(low).lerp(mid, Math.max(0, h) / 0.35);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  const dome = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  dome.renderOrder = -10;
  scene.add(dome);

  // 星
  const N = 950;
  const sp = new Float32Array(N * 3);
  const sc = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const th = rand(0, Math.PI * 2), ph = Math.acos(rand(0.02, 1));
    const r = 158;
    sp[i * 3] = Math.sin(ph) * Math.cos(th) * r;
    sp[i * 3 + 1] = Math.cos(ph) * r;
    sp[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * r;
    const b = rand(0.45, 1);
    sc[i * 3] = b; sc[i * 3 + 1] = b * rand(0.9, 1); sc[i * 3 + 2] = b;
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
  sg.setAttribute("color", new THREE.BufferAttribute(sc, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.5, vertexColors: true, fog: false, transparent: true, opacity: 0.9, sizeAttenuation: true }));
  stars.renderOrder = -9;
  scene.add(stars);

  // 月
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(7.5, 20, 16),
    new THREE.MeshBasicMaterial({ color: 0xf6f1d8, fog: false })
  );
  moon.position.set(-72, 96, 96);
  moon.renderOrder = -8;
  scene.add(moon);

  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(15, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xbcd0f0, transparent: true, opacity: 0.11, fog: false, depthWrite: false })
  );
  halo.position.copy(moon.position);
  scene.add(halo);

  return { dome, stars, moon, update(dt, t) { stars.rotation.y = t * 0.004; } };
}
