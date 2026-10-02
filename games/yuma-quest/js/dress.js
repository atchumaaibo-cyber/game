// キャラの衣装（モデルは触らず、ボーンに小物をくっつける）
import * as THREE from 'three';

const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...o });
const GOLD = () => std(0xf2c640, { roughness: 0.35, metalness: 0.25, emissive: 0x6a4a00 });

// obj をボーンの子にする。worldPos=いまのワールド座標、size=ワールドでの大きさ倍率、euler=ワールドでの向き
function attach(ch, boneName, obj, worldPos, size = 1, euler = new THREE.Euler()) {
  const bone = ch.bone(boneName);
  ch.group.updateMatrixWorld(true);
  const s = new THREE.Vector3(); bone.getWorldScale(s);
  const bq = new THREE.Quaternion(); bone.getWorldQuaternion(bq);
  obj.position.copy(bone.worldToLocal(worldPos.clone()));
  obj.quaternion.copy(bq.invert().multiply(new THREE.Quaternion().setFromEuler(euler)));
  obj.scale.setScalar(size / s.x);
  bone.add(obj);
  return bone;
}
const headTop = (ch, drop) => { const h = boneWorld(ch, 'head'); return new THREE.Vector3(h.x, ch.group.position.y + ch.height - drop, h.z); };
// 手ではなく腰のボーンにつけて、体の横に立てて持たせる（腕の動きでぶれない）
function holdAtSide(ch, obj, side, midY, size) {
  const r = ch.group.rotation.y, c = Math.cos(r), sn = Math.sin(r);
  const lx = side * ch.height, lz = 0.06 * ch.height;
  const p = new THREE.Vector3(ch.group.position.x + lx * c + lz * sn, ch.group.position.y + midY * ch.height, ch.group.position.z - lx * sn + lz * c);
  attach(ch, 'hips', obj, p, size);
}
const boneWorld = (ch, name) => { ch.group.updateMatrixWorld(true); return ch.bone(name).getWorldPosition(new THREE.Vector3()); };

export function dressHero(ch) {
  const H = ch.dims; // { top, height, cx, cz }
  const head = boneWorld(ch, 'head');
  const chest = boneWorld(ch, 'chest');
  // ターバン（むらさき）：頭にまいた布 + 結び目 + 金の宝石
  const turban = new THREE.Group();
  const cloth = std(0x6a2fa8, { roughness: 0.8 });
  const wrap = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 14), cloth);
  wrap.scale.set(1, 0.72, 1);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.1, 10, 28), std(0x8a4ad0, { roughness: 0.8 }));
  band.rotation.x = Math.PI / 2; band.position.y = -0.1;
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), GOLD());
  gem.position.set(0, 0.0, 0.52);
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), cloth);
  knot.position.set(0.3, 0.05, 0.42);
  const tail1 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 0.05), cloth);
  tail1.position.set(0, -0.35, -0.5); tail1.rotation.x = 0.35;
  const tail2 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.55, 0.05), std(0x8a4ad0));
  tail2.position.set(0.18, -0.3, -0.5); tail2.rotation.set(0.3, 0, -0.35);
  turban.add(wrap, band, gem, knot, tail1, tail2);
  const headSize = ch.height * 0.31;
  attach(ch, 'head', turban, new THREE.Vector3(ch.group.position.x + H.cx, head.y + ch.height * 0.29, head.z + ch.height * 0.0), headSize);
  turban.scale.x *= 0.92;
  // マント（青）
  const cape = new THREE.Group();
  const capeGeo = new THREE.PlaneGeometry(1, 1);
  const cp = capeGeo.attributes.position;
  for (let i = 0; i < cp.count; i++) if (cp.getY(i) > 0) cp.setX(i, cp.getX(i) * 0.45);
  const body = new THREE.Mesh(capeGeo, std(0x2a56c8, { side: THREE.DoubleSide, roughness: 0.8 }));
  body.position.y = -0.5;
  const trim = new THREE.Mesh(new THREE.PlaneGeometry(1.02, 0.1), std(0xf4f0e6, { side: THREE.DoubleSide }));
  trim.position.set(0, -0.96, 0.003);
  cape.add(body, trim);
  cape.scale.set(1, 1, 1);
  const capeW = ch.height * 0.5, capeL = ch.height * 0.42;
  attach(ch, 'chest', cape, new THREE.Vector3(ch.group.position.x + H.cx, chest.y + ch.height * 0.12, chest.z - ch.height * 0.1), 1);
  cape.scale.set(capeW / ch.bone('chest').getWorldScale(new THREE.Vector3()).x, capeL / ch.bone('chest').getWorldScale(new THREE.Vector3()).x, 1);
  cape.rotateX(-0.1);
  // 大きな剣（背中にかつぐ）
  const sword = new THREE.Group();
  const steel = std(0xdfe6ee, { roughness: 0.25, metalness: 0.5, emissive: 0x20262c });
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.7, 0.05), steel);
  blade.position.y = 0.95;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 4), steel);
  tip.position.y = 1.95; tip.rotation.y = Math.PI / 4; tip.scale.set(1, 1, 0.3);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.1, 0.12), GOLD());
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.34, 8), std(0x5a2a1a));
  grip.position.y = -0.2;
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), GOLD());
  pommel.position.y = -0.42;
  sword.add(blade, tip, guard, grip, pommel);
  const swSize = ch.height * 0.27;
  attach(ch, 'chest', sword, new THREE.Vector3(ch.group.position.x + H.cx + ch.height * 0.08, chest.y + ch.height * 0.02, chest.z - ch.height * 0.17), swSize, new THREE.Euler(0, 0, 2.4));
  // 着替えの演出まではかくしておく
  const pieces = { turban, cape, sword };
  for (const o of Object.values(pieces)) { o.userData.base = o.scale.clone(); o.scale.setScalar(0.0001); o.visible = false; }
  return pieces;
}

export function dressButler(ch) {
  const neck = boneWorld(ch, 'neck');
  const chest = boneWorld(ch, 'chest');
  // 蝶ネクタイ
  const tie = new THREE.Group();
  const red = std(0x1a1a22);
  for (const sx of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.34, 3), red);
    w.rotation.z = -sx * Math.PI / 2; w.position.x = sx * 0.17; w.scale.z = 0.5;
    tie.add(w);
  }
  tie.add(new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 8), red));
  attach(ch, 'neck', tie, new THREE.Vector3(neck.x, neck.y - ch.height * 0.02, neck.z + ch.height * 0.1), ch.height * 0.23);
  // 黒いベスト（前だけ）と白いえり
  const vest = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), std(0x15151c, { side: THREE.DoubleSide }));
  const sc = new THREE.Vector3(); ch.bone('chest').getWorldScale(sc);
  attach(ch, 'chest', vest, new THREE.Vector3(chest.x, chest.y - ch.height * 0.02, chest.z + ch.height * 0.115), 1);
  vest.scale.set(ch.height * 0.2 / sc.x, ch.height * 0.2 / sc.x, 1);
  // モノクル
  const mono = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.07, 8, 20), GOLD());
  const head = boneWorld(ch, 'head');
  attach(ch, 'head', mono, new THREE.Vector3(head.x + ch.height * 0.06, head.y + ch.height * 0.07, head.z + ch.height * 0.12), ch.height * 0.05);
}

// 遊び人（プードル）：2本角のピエロぼうし・大きな蝶ネクタイ・さいころ
export function dressJester(ch) {
  const head = boneWorld(ch, 'head'), neck = boneWorld(ch, 'neck');
  const hat = new THREE.Group();
  const cols = [0xe0306a, 0xf2c640];
  [-1, 1].forEach((sx, i) => {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.1, 12), std(cols[i]));
    horn.position.set(sx * 0.45, 0.45, 0); horn.rotation.z = -sx * 0.9;
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), GOLD());
    bell.position.set(sx * 0.98, 0.88, 0);
    hat.add(horn, bell);
  });
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.5, 0.22, 20), std(0x6a2fa8));
  hat.add(band);
  attach(ch, 'head', hat, headTop(ch, 0.1), 0.65);
  // 蝶ネクタイ
  const tie = new THREE.Group();
  for (const sx of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.5, 3), std(0xe0306a));
    w.rotation.z = -sx * Math.PI / 2; w.position.x = sx * 0.25; w.scale.z = 0.5;
    tie.add(w);
  }
  tie.add(new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), std(0xf2c640)));
  attach(ch, 'neck', tie, new THREE.Vector3(neck.x, neck.y - ch.height * 0.01, neck.z + ch.height * 0.1), ch.height * 0.16);
  // 腰のさいころ（赤）
  const die = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), std(0xf4f0e6));
  for (const [x, y] of [[0, 0]]) {
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), std(0xd02030));
    dot.position.set(x, y, 0.5); die.add(dot);
  }
  const hips = boneWorld(ch, 'hips');
  attach(ch, 'hips', die, new THREE.Vector3(hips.x + ch.height * 0.14, hips.y - ch.height * 0.02, hips.z + ch.height * 0.06), ch.height * 0.07);
}

// 僧侶（ポメ）：白い司教ぼうし・金の十字・ほうじょう（杖）
export function dressPriest(ch) {
  const head = boneWorld(ch, 'head'), neck = boneWorld(ch, 'neck');
  const white = std(0xf8f4ea, { roughness: 0.8 });
  const hat = new THREE.Group();
  const mitre = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.0, 4), white);
  mitre.position.y = 0.45; mitre.rotation.y = Math.PI / 4; mitre.scale.set(1, 1, 0.55);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.2, 18), GOLD());
  const v = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.05), GOLD());
  v.position.set(0, 0.5, 0.29);
  const h = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.05), GOLD());
  h.position.set(0, 0.58, 0.29);
  hat.add(mitre, band, v, h);
  attach(ch, 'head', hat, headTop(ch, 0.08), 0.7);
  // 金のしるしのペンダント
  const pend = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.09, 8, 20), GOLD());
  pend.rotation.x = Math.PI / 2;
  attach(ch, 'neck', pend, new THREE.Vector3(neck.x, neck.y - ch.height * 0.01, neck.z), ch.height * 0.17);
  // ほうじょう：右手に持つ
  const staff = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 1.6, 8), std(0x7a4a22));
  pole.position.y = 0.2;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 8, 20), GOLD());
  ring.position.y = 1.15;
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), std(0x7ad0ff, { emissive: 0x2a80c0 }));
  orb.position.y = 1.15;
  staff.add(pole, ring, orb);
  holdAtSide(ch, staff, 0.33, 0.43, 0.9);
}

// 兵士（あっちのクローン）：てつかぶと・やり
export function dressGuard(ch) {
  const head = boneWorld(ch, 'head');
  const steel = std(0xb8c2cc, { roughness: 0.35, metalness: 0.5 });
  const helm = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.5, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), steel);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 8, 24), steel);
  rim.rotation.x = Math.PI / 2;
  const plume = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.45, 8), std(0xd02030));
  plume.position.y = 0.65;
  helm.add(dome, rim, plume);
  attach(ch, 'head', helm, headTop(ch, 0.3), 0.86);
  const spear = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 8), std(0x7a4a22));
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.35, 8), steel);
  tip.position.y = 1.25;
  spear.add(shaft, tip);
  holdAtSide(ch, spear, -0.3, 0.55, 0.8);
}

// 商人（ぽんねこのクローン）：大きなリュックと旅のぼうし
export function dressMerchant(ch) {
  const head = boneWorld(ch, 'head'), chest = boneWorld(ch, 'chest');
  const hat = new THREE.Group();
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.06, 24), std(0xb8864a));
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.4, 20), std(0xb8864a));
  top.position.y = 0.2;
  const ribbon = new THREE.Mesh(new THREE.CylinderGeometry(0.51, 0.51, 0.1, 20), std(0x2a56c8));
  ribbon.position.y = 0.08;
  hat.add(brim, top, ribbon);
  attach(ch, 'head', hat, headTop(ch, 0.15), 0.56);
  const pack = new THREE.Group();
  const bag = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.3, 0.7), std(0x3a8a4a, { roughness: 0.9 }));
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.2, 14), std(0xd8c8a0));
  roll.rotation.z = Math.PI / 2; roll.position.y = 0.85;
  pack.add(bag, roll);
  attach(ch, 'chest', pack, new THREE.Vector3(chest.x, chest.y - ch.height * 0.02, chest.z - ch.height * 0.17), ch.height * 0.22);
}

// おでん屋（あっちのクローン）：はちまき・まえかけ
export function dressOden(ch) {
  const head = boneWorld(ch, 'head'), chest = boneWorld(ch, 'chest');
  const band = new THREE.Group();
  const cloth = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.09, 8, 24), std(0xf8f4ea));
  cloth.rotation.x = Math.PI / 2;
  const sun = new THREE.Mesh(new THREE.CircleGeometry(0.12, 16), std(0xd02030));
  sun.position.set(0, 0, 0.57);
  band.add(cloth, sun);
  attach(ch, 'head', band, headTop(ch, 0.27), 0.8);
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), std(0xf8f4ea, { side: THREE.DoubleSide }));
  const sc = new THREE.Vector3(); ch.bone('chest').getWorldScale(sc);
  attach(ch, 'chest', apron, new THREE.Vector3(chest.x, chest.y - ch.height * 0.1, chest.z + ch.height * 0.12), 1);
  apron.scale.set(ch.height * 0.2 / sc.x, ch.height * 0.26 / sc.x, 1);
  // おでんの串
  const skewer = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.1, 6), std(0xd8c8a0));
  skewer.add(stick);
  [[0.25, 0x3a2a1a], [0.0, 0xf4e8c8], [-0.25, 0xd8a050]].forEach(([y, c]) => {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), std(c));
    b.position.y = y; b.scale.y = 1.2; skewer.add(b);
  });
  holdAtSide(ch, skewer, -0.3, 0.5, 0.6);
}
