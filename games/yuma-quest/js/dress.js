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

export function dressFriend(ch, color) {
  const neck = boneWorld(ch, 'neck');
  // スカーフ
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.17, 10, 24), std(color, { roughness: 0.7 }));
  scarf.rotation.x = Math.PI / 2;
  attach(ch, 'neck', scarf, new THREE.Vector3(neck.x, neck.y - ch.height * 0.01, neck.z), ch.height * 0.17);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.5, 0.06), std(color));
  attach(ch, 'neck', tail, new THREE.Vector3(neck.x + ch.height * 0.03, neck.y - ch.height * 0.07, neck.z + ch.height * 0.09), ch.height * 0.17);
  // 小さな冒険者のぼうし代わりのリボン
  const head = boneWorld(ch, 'head');
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.5), GOLD());
  attach(ch, 'head', gem, new THREE.Vector3(head.x, head.y + ch.height * 0.19, head.z), ch.height * 0.035);
}
