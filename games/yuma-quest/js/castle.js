// 駿府城あと：Lv.1「完成予定図の看板」→ Lv.2 天守かんせい → Lv.3 きんぴか → Lv.99 ぜんぶのせ
import * as THREE from 'three';

const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...o });

function signTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 600;
  const g = c.getContext('2d');
  g.fillStyle = '#f3ead2'; g.fillRect(0, 0, 1024, 600);
  g.strokeStyle = '#7a4a22'; g.lineWidth = 14; g.strokeRect(10, 10, 1004, 580);
  g.fillStyle = '#b0222e'; g.font = 'bold 74px "DotGothic16", sans-serif'; g.textAlign = 'center';
  g.fillText('天守閣　完成予定図', 512, 100);
  // 空
  g.fillStyle = '#cfe8ff'; g.fillRect(60, 130, 904, 360);
  // 完成予定の天守（かなり盛ってある）
  const tiers = [[250, 60, '#f4f1ea'], [200, 52, '#f4f1ea'], [160, 46, '#f4f1ea'], [120, 40, '#f4f1ea'], [84, 34, '#f4f1ea']];
  let y = 480;
  g.fillStyle = '#8b8b8b'; g.fillRect(250, y - 8, 524, 24);
  for (const [w, h, col] of tiers) {
    g.fillStyle = col; g.fillRect(512 - w / 2, y - h, w, h);
    g.fillStyle = '#3e4a52';
    g.beginPath(); g.moveTo(512 - w / 2 - 28, y - h); g.lineTo(512 + w / 2 + 28, y - h); g.lineTo(512 + w / 2 + 6, y - h - 22); g.lineTo(512 - w / 2 - 6, y - h - 22); g.fill();
    y -= h + 20;
  }
  g.fillStyle = '#e8c04a';
  g.beginPath(); g.arc(512, y - 6, 18, 0, 7); g.fill();
  g.font = '40px "DotGothic16", sans-serif'; g.fillStyle = '#e8c04a';
  g.fillText('★', 380, 260); g.fillText('★', 644, 260);
  g.fillStyle = '#6a3a1a'; g.font = '34px "DotGothic16", sans-serif';
  g.fillText('※ イメージです。 じっさいの ものとは ことなります。', 512, 550);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function roof(w, d, h, mat) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.7071, 1.2, h, 4, 1), mat);
  m.rotation.y = Math.PI / 4;
  m.scale.set(w * 1.0, 1, d * 1.0);
  return m;
}

export function buildCastle(scene) {
  const root = new THREE.Group();
  root.position.set(-26, 9.2, -88);
  scene.add(root);

  const white = std(0xf4f1ea, { roughness: 0.9 });
  const gray = std(0x3e4a52, { roughness: 0.6 });
  const gold = std(0xf2c640, { roughness: 0.35, metalness: 0.25, emissive: 0x6a4a00 });
  const wood = std(0x6a4020);
  const mats = { white, gray };

  // ---- Lv.1 ：完成予定図の看板とロープ
  const sign = new THREE.Group();
  const board = new THREE.Mesh(new THREE.BoxGeometry(11, 6.4, 0.3), new THREE.MeshBasicMaterial({ map: signTexture() }));
  board.position.y = 5.2;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(11.4, 6.8, 0.2), wood);
  frame.position.set(0, 5.2, -0.15);
  sign.add(frame, board);
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 5.6, 0.4), wood);
    post.position.set(sx * 5.2, 2.6 - 0.6, -0.1);
    sign.add(post);
  }
  const fenceM = std(0xe8b020);
  for (let i = 0; i < 8; i++) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 10), std(0xff6a1a));
    cone.position.set(-8 + i * 2.3, 0.45, 4.5);
    sign.add(cone);
  }
  const tape = new THREE.Mesh(new THREE.BoxGeometry(16, 0.08, 0.08), fenceM);
  tape.position.set(0, 0.8, 4.5);
  sign.add(tape);
  // 看板は公開前の建物の手前、中庭から見える向き（+Z側）
  sign.position.set(0, 0, 12);
  root.add(sign);

  // ---- Lv.2 ：天守
  const tenshu = new THREE.Group();
  const tiers = [[20, 15, 5.4], [16.5, 12, 4.6], [13.5, 9.5, 4.2], [10.5, 7.5, 3.8], [7.5, 5.5, 3.4]];
  const tierMeshes = [];
  let y = 0;
  const base = new THREE.Mesh(new THREE.BoxGeometry(24, 1.2, 19), std(0x8e8a80));
  base.position.y = 0.6;
  tenshu.add(base);
  y = 1.2;
  tiers.forEach(([w, d, h], i) => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), white);
    wall.position.y = y + h / 2;
    tenshu.add(wall);
    // 窓
    for (let k = -1; k <= 1; k++) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(w * 0.12, h * 0.4, 0.15), std(0x2a2f38));
      win.position.set(k * w * 0.28, y + h * 0.55, d / 2 + 0.05);
      tenshu.add(win);
    }
    const r = roof(w + 2.2, d + 2.2, 1.9, gray);
    r.position.y = y + h + 0.95;
    tenshu.add(r);
    tierMeshes.push(wall, r);
    y += h + 1.7;
  });
  const topY = y;
  // 金のしゃちほこ
  const shachis = new THREE.Group();
  for (const sx of [-1, 1]) {
    const s = new THREE.Group();
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.2, 10), gold);
    body.rotation.z = sx * 0.25;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), gold);
    head.position.set(0, 1.2, 0);
    s.add(body, head);
    s.position.set(sx * 3.2, topY + 0.4, 0);
    shachis.add(s);
  }
  tenshu.add(shachis);
  tenshu.visible = false;
  root.add(tenshu);

  // ---- Lv.3 ：きんぴか（色を金へ）＋ 旗とライト
  const flags = new THREE.Group();
  for (const [x, z] of [[-11, -8], [11, -8], [-11, 8], [11, 8]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 8, 6), gold);
    pole.position.set(x, 4.5, z);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.8), std(0xd02030, { side: THREE.DoubleSide }));
    flag.position.set(x + 1.5, 7.6, z);
    flag.name = 'flag';
    flags.add(pole, flag);
  }
  const beams = new THREE.Group();
  for (const [x, z, c] of [[-14, 12, 0xfff0a0], [14, 12, 0xa0e0ff], [-14, -12, 0xffa0e0], [14, -12, 0xa0ffb0]]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.6, 70, 12, 1, true), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    b.position.set(x, 35, z);
    b.userData.sway = Math.random() * 6;
    beams.add(b);
  }
  flags.visible = beams.visible = false;
  root.add(flags, beams);

  // ---- Lv.99 ：ぜんぶのせ（巨大な金のイヌ像・にじ・花火）
  const mega = new THREE.Group();
  const dog = new THREE.Group();
  const head = new THREE.Mesh(new THREE.SphereGeometry(4.2, 24, 18), gold);
  const snout = new THREE.Mesh(new THREE.SphereGeometry(2.2, 18, 14), gold);
  snout.position.set(0, -1, 3.6); snout.scale.set(1, 0.8, 1.1);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 10), std(0x151515));
  nose.position.set(0, -0.2, 5.7);
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(1.6, 5, 4), gold);
    ear.position.set(sx * 3.2, 3.8, 0); ear.rotation.z = -sx * 0.4;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), std(0x151515));
    eye.position.set(sx * 1.6, 1, 3.7);
    dog.add(ear, eye);
  }
  dog.add(head, snout, nose);
  dog.position.set(0, topY + 3.2, 0);
  mega.add(dog);
  const rainbow = new THREE.Group();
  [0xff3030, 0xff9a20, 0xffe020, 0x30c040, 0x30a0ff, 0x4050ff, 0x9040d0].forEach((c, i) => {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(46 - i * 1.6, 0.8, 8, 64, Math.PI), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85 }));
    arc.position.set(0, -4, -20);
    rainbow.add(arc);
  });
  mega.add(rainbow);
  mega.visible = false;
  root.add(mega);

  // 花火
  const fw = { list: [], on: false, t: 0 };
  function firework() {
    const n = 60, pos = new Float32Array(n * 3), vel = [];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, b = Math.acos(2 * Math.random() - 1), s = 6 + Math.random() * 6;
      vel.push(new THREE.Vector3(Math.sin(b) * Math.cos(a) * s, Math.cos(b) * s, Math.sin(b) * Math.sin(a) * s));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const col = [0xff5050, 0xffe050, 0x50e0ff, 0xff70e0, 0x80ff70][Math.floor(Math.random() * 5)];
    const p = new THREE.Points(geo, new THREE.PointsMaterial({ color: col, size: 1.2, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    p.position.set((Math.random() - 0.5) * 70, topY + 18 + Math.random() * 20, (Math.random() - 0.5) * 40 - 10);
    p.frustumCulled = false;
    root.add(p);
    fw.list.push({ p, vel, life: 1.6 });
  }

  // ---- 状態とアニメーション
  const tweens = [];
  function pop(obj, to = 1) {
    obj.visible = true;
    obj.scale.setScalar(0.001);
    return new Promise((res) => tweens.push({ obj, t: 0, dur: 0.9, to, res }));
  }
  const state = { level: 1 };
  function makeGold() {
    white.color.set(0xf2c640); white.metalness = 0.25; white.emissive.set(0x5a4200);
    gray.color.set(0xd09a20); gray.metalness = 0.3; gray.emissive.set(0x4a3000);
  }
  async function setLevel(n) {
    state.level = n;
    if (n >= 2) {
      sign.visible = false;
      if (!tenshu.visible) await pop(tenshu);
    }
    if (n >= 3) {
      makeGold();
      flags.visible = beams.visible = true;
      await pop(flags);
    }
    if (n >= 4) {
      await pop(mega);
      tenshu.scale.setScalar(1.15);
      fw.on = true;
    }
  }
  function update(dt, time) {
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      // 行き過ぎてから戻る（ぽよん）
      const e = 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2);
      tw.obj.scale.setScalar(Math.max(0.001, e * tw.to));
      if (k >= 1) { tw.obj.scale.setScalar(tw.to); tw.res(); tweens.splice(i, 1); }
    }
    if (beams.visible) beams.children.forEach((b) => { b.rotation.z = Math.sin(time * 1.3 + b.userData.sway) * 0.35; b.rotation.x = Math.cos(time * 1.1 + b.userData.sway) * 0.3; });
    flags.children.forEach((f) => { if (f.name === 'flag') f.rotation.y = Math.sin(time * 5 + f.position.x) * 0.3; });
    if (mega.visible) { dog.rotation.y = Math.sin(time * 1.2) * 0.5; rainbow.rotation.y = Math.sin(time * 0.3) * 0.05; }
    if (fw.on) {
      fw.t -= dt;
      if (fw.t <= 0) { fw.t = 0.45; firework(); }
    }
    for (let i = fw.list.length - 1; i >= 0; i--) {
      const f = fw.list[i];
      f.life -= dt;
      const a = f.p.geometry.attributes.position;
      for (let k = 0; k < f.vel.length; k++) {
        f.vel[k].y -= 6 * dt;
        a.setXYZ(k, a.getX(k) + f.vel[k].x * dt, a.getY(k) + f.vel[k].y * dt, a.getZ(k) + f.vel[k].z * dt);
      }
      a.needsUpdate = true;
      f.p.material.opacity = Math.max(0, f.life / 1.6);
      if (f.life <= 0) { root.remove(f.p); f.p.geometry.dispose(); f.p.material.dispose(); fw.list.splice(i, 1); }
    }
  }
  return { root, setLevel, update, get level() { return state.level; }, signPos: new THREE.Vector3(-26, 9.2, -76), topY };
}
