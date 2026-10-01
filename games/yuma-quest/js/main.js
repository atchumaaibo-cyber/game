import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Music } from './music.js';
import { buildCastle } from './castle.js';
import { dressHero, dressButler, dressFriend } from './dress.js';

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const DEBUG = new URLSearchParams(location.search);

// ---------------------------------------------------------------- 舞台の座標（glTF座標：-Zが北）
const KING_POS = new THREE.Vector3(0, 3.7, -24);
const YUMA_START = new THREE.Vector3(0, 3.7, 8);
const YUMA_MEET = new THREE.Vector3(0, 3.7, -17.5);
const SNACK_POS = new THREE.Vector3(0, 0.7, 69);
const BRIDGE_Y = 0.9;
const RAMP_Z0 = 36, RAMP_Z1 = 48, BRIDGE_END = 59;

// 歩ける範囲と地面の高さ。範囲の外は null
function groundAt(x, z) {
  if (Math.abs(x) <= 3.2 && z > RAMP_Z0 && z <= BRIDGE_END) {
    const t = clamp((z - RAMP_Z0) / (RAMP_Z1 - RAMP_Z0), 0, 1);
    return 3.7 + (BRIDGE_Y - 3.7) * t;
  }
  if (z <= RAMP_Z0) return Math.abs(x) <= 60 && z >= -108 ? 3.7 : null;
  if (z > BRIDGE_END && z <= 76) return Math.abs(x) <= 18 ? 0.7 : null;
  return null;
}

// ---------------------------------------------------------------- three.js の準備
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbfe0ff);
scene.fog = new THREE.Fog(0xcfe6f7, 160, 900);
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 3000);
scene.add(new THREE.HemisphereLight(0xdcecff, 0x8a7a5a, 1.6));
const sun = new THREE.DirectionalLight(0xfff0d0, 2.6);
sun.position.set(60, 120, 40);
scene.add(sun);

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const music = new Music();

// ---------------------------------------------------------------- 読み込み
const loader = new GLTFLoader();
const sizes = { yuma: 7.9, atchi: 7.4, stage: 16.1, poodle: 12.5, pome: 5.9, ponneko: 13.2 };
const loaded = { yuma: 0, atchi: 0, stage: 0, poodle: 0, pome: 0, ponneko: 0 };
function load(key, url) {
  return new Promise((res, rej) => loader.load(url, res, (e) => {
    loaded[key] = e.loaded / 1048576;
    const sum = Object.values(loaded).reduce((a, b) => a + b, 0);
    const tot = Object.values(sizes).reduce((a, b) => a + b, 0);
    $('bar').style.width = clamp((sum / tot) * 100, 0, 100) + '%';
    $('loadmsg').textContent = `${sum.toFixed(1)} / ${tot.toFixed(0)} MB`;
  }, rej));
}

// ---------------------------------------------------------------- キャラクター
const shadowTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,.55)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();

function makeChar(gltf, height) {
  const model = gltf.scene;
  const drop = [];
  model.traverse((o) => { if (o.isMesh && /reference/i.test(o.name)) drop.push(o); });
  drop.forEach((o) => o.parent.remove(o));
  model.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model, true);
  const s = height / (box.max.y - box.min.y);
  model.scale.setScalar(s);
  model.position.y = -box.min.y * s;
  const group = new THREE.Group();
  group.add(model);
  const dims = { top: (box.max.y - box.min.y) * s, cx: (box.min.x + box.max.x) / 2 * s, cz: (box.min.z + box.max.z) / 2 * s };
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.04;
  shadow.scale.setScalar(height * 0.7);
  group.add(shadow);
  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  gltf.animations.forEach((c) => { actions[c.name] = mixer.clipAction(c); });
  const ch = {
    group, model, mixer, actions, current: null, scale: s, height, dims,
    play(name, fade = 0.25, speed = 1) {
      const a = actions[name];
      if (!a || this.current === a) { if (a) a.timeScale = speed; return; }
      a.reset().setEffectiveTimeScale(speed).setEffectiveWeight(1).fadeIn(fade).play();
      if (this.current) this.current.fadeOut(fade);
      this.current = a;
    },
    bone: (n) => model.getObjectByName(n),
  };
  return ch;
}

// ---------------------------------------------------------------- 状態
let yuma, king, stage, snack, crumbs, confetti, poodle, pome, butler, castle;
const trail = [];
let following = false;
let state = 'loading';
let started = 0;
const keys = {};
const stick = { x: 0, y: 0 };
let camYaw = 0;
const camTarget = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
const camLook = new THREE.Vector3();
let camSnap = true;
let orbit = null;           // エンディングのカメラ回転
let eatBob = 0, eating = false, eatBase = null;
const eatQ = new THREE.Quaternion(), eatAxis = new THREE.Vector3(1, 0, 0);
let sparkles = [];

// ---------------------------------------------------------------- UI（ドラクエ風メッセージ）
const dlg = $('dialog');
let dlgResolve = null, typing = null;
function say(who, text) {
  return new Promise((resolve) => {
    dlg.style.display = 'block';
    dlg.querySelector('.who').textContent = who;
    dlg.querySelector('.who').style.display = who ? 'block' : 'none';
    const box = dlg.querySelector('.text'), nxt = dlg.querySelector('.next');
    box.textContent = '';
    nxt.style.visibility = 'hidden';
    let i = 0;
    const full = text;
    typing = setInterval(() => {
      i++;
      box.textContent = full.slice(0, i);
      if (i % 2 === 0) music.blip(480 + (i % 4) * 30);
      if (i >= full.length) finish();
    }, 38);
    function finish() {
      clearInterval(typing); typing = null;
      box.textContent = full;
      nxt.style.visibility = 'visible';
      dlgResolve = () => { dlgResolve = null; resolve(); };
    }
    dlgResolve = () => { if (typing) finish(); };
    dlg._finish = finish;
  });
}
function advance() {
  if (typing) { dlg._finish(); return; }
  if (dlgResolve) dlgResolve();
}
function hideDialog() { dlg.style.display = 'none'; }
async function talk(lines) {
  for (const [who, text] of lines) await say(who, text);
  hideDialog();
}
dlg.addEventListener('pointerdown', (e) => { e.stopPropagation(); advance(); });

let subTimer = null;
function subtitle(text, ms = 3200) {
  const s = $('sub');
  s.textContent = text; s.style.display = 'block';
  clearTimeout(subTimer);
  subTimer = setTimeout(() => { s.style.display = 'none'; }, ms);
}
function objective(text) {
  const h = $('hud');
  if (!text) { h.style.display = 'none'; return; }
  h.textContent = text; h.style.display = 'block';
}

// ---------------------------------------------------------------- 入力
addEventListener('keydown', (e) => {
  if (['Space', 'Enter', 'KeyZ'].includes(e.code)) { e.preventDefault(); if (state !== 'title') advance(); }
  keys[e.code] = true;
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
let drag = null;
canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, id: e.pointerId }; });
addEventListener('pointermove', (e) => {
  if (drag && drag.id === e.pointerId && state === 'play') { camYaw -= (e.clientX - drag.x) * 0.006; drag.x = e.clientX; }
});
addEventListener('pointerup', () => { drag = null; });
if (matchMedia('(pointer:coarse)').matches) document.body.classList.add('touch');
{
  const el = $('stick'), knob = el.firstElementChild;
  let pid = null;
  const set = (e) => {
    const r = el.getBoundingClientRect();
    let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    stick.x = x; stick.y = y;
    knob.style.transform = `translate(${x * 36}px, ${y * 36}px)`;
  };
  el.addEventListener('pointerdown', (e) => { pid = e.pointerId; el.setPointerCapture(pid); set(e); e.stopPropagation(); });
  el.addEventListener('pointermove', (e) => { if (e.pointerId === pid) set(e); });
  const up = (e) => { if (e.pointerId === pid) { pid = null; stick.x = stick.y = 0; knob.style.transform = ''; } };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
}

// ---------------------------------------------------------------- 小道具の組み立て
function buildProps() {
  // 赤いじゅうたんと玉座
  const carpet = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 56), new THREE.MeshStandardMaterial({ color: 0xa3182a, roughness: 0.9 }));
  carpet.rotation.x = -Math.PI / 2;
  carpet.position.set(0, 3.74, 1);
  scene.add(carpet);
  for (const sx of [-1, 1]) {
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 56), new THREE.MeshStandardMaterial({ color: 0xe8c04a, roughness: 0.5, metalness: 0.4 }));
    edge.rotation.x = -Math.PI / 2;
    edge.position.set(sx * 1.7, 3.745, 1);
    scene.add(edge);
  }
  const gold = new THREE.MeshStandardMaterial({ color: 0xe8c04a, roughness: 0.4, metalness: 0.25, emissive: 0x5a4200 });
  const throne = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 1.6), new THREE.MeshStandardMaterial({ color: 0x7a1020 }));
  seat.position.y = 0.5;
  const back = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.4, 0.4), new THREE.MeshStandardMaterial({ color: 0x7a1020 }));
  back.position.set(0, 1.7, -0.8);
  const top = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1, 4), gold);
  top.position.set(0, 3.9, -0.8); top.rotation.y = Math.PI / 4;
  throne.add(seat, back, top);
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 1.5), gold);
    arm.position.set(sx * 1.15, 1.2, 0);
    throne.add(arm);
  }
  throne.position.set(0, 3.7, -31);
  scene.add(throne);
  // たいまつの柱
  for (const [x, z] of [[-4, -26], [4, -26], [-4, -8], [4, -8], [-4, 10], [4, 10]]) {
    const p = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 2.6, 8), new THREE.MeshStandardMaterial({ color: 0x8a8070 }));
    post.position.y = 1.3;
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.7, 8), new THREE.MeshBasicMaterial({ color: 0xffa030 }));
    flame.position.y = 3.0; flame.name = 'flame';
    p.add(post, flame);
    p.position.set(x, 3.7, z);
    scene.add(p);
    const l = new THREE.PointLight(0xffa040, 6, 14);
    l.position.set(x, 3.7 + 3, z);
    scene.add(l);
  }
  // 大手橋につながる木のスロープ（箱庭のお堀の段差をつなぐ）
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a30, roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.9 });
  const run = RAMP_Z1 - RAMP_Z0, drop = 3.7 - BRIDGE_Y;
  const len = Math.hypot(run, drop), ang = Math.atan2(drop, run);
  const ramp = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.3, len), wood);
  ramp.add(deck);
  for (let i = 0; i < 12; i++) {
    const pl = new THREE.Mesh(new THREE.BoxGeometry(6.9, 0.05, 0.12), dark);
    pl.position.set(0, 0.17, -len / 2 + (i + 0.5) * (len / 12));
    ramp.add(pl);
  }
  for (const sx of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, len), dark);
    rail.position.set(sx * 3.3, 1.0, 0);
    ramp.add(rail);
    for (let i = 0; i <= 6; i++) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.1, 0.18), dark);
      post.position.set(sx * 3.3, 0.5, -len / 2 + i * (len / 6));
      ramp.add(post);
    }
  }
  ramp.position.set(0, (3.7 + BRIDGE_Y) / 2 - 0.17, (RAMP_Z0 + RAMP_Z1) / 2);
  ramp.rotation.x = ang;
  scene.add(ramp);
  // 目的地のひかりの柱（橋のむこう）
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 40, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  beam.position.set(0, 20.7, 63);
  beam.name = 'beam';
  scene.add(beam);

  // オヤツ（大きなほねガム）
  snack = new THREE.Group();
  const bm = new THREE.MeshStandardMaterial({ color: 0xe9b86a, roughness: 0.45, metalness: 0.05 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.5, 16), bm);
  shaft.rotation.z = Math.PI / 2;
  snack.add(shaft);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const k = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), bm);
    k.position.set(sx * 0.82, 0, sz * 0.2);
    snack.add(k);
  }
  const ribbon = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.05, 8, 20), new THREE.MeshStandardMaterial({ color: 0xe0304a }));
  ribbon.rotation.y = Math.PI / 2;
  snack.add(ribbon);
  snack.position.copy(SNACK_POS).add(new THREE.Vector3(0, 0.9, 0));
  snack.scale.setScalar(0.001);
  snack.visible = false;
  scene.add(snack);
  // かけら
  crumbs = [];
  // 紙ふぶき
  const N = 360, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), vel = [];
  const palette = [0xff5a5a, 0xffd34a, 0x5ad1ff, 0x8aff7a, 0xff8ae6].map((c) => new THREE.Color(c));
  for (let i = 0; i < N; i++) {
    const c = palette[i % palette.length];
    col.set([c.r, c.g, c.b], i * 3);
    vel.push(new THREE.Vector3((Math.random() - 0.5) * 1.5, -(0.8 + Math.random() * 1.6), (Math.random() - 0.5) * 1.5));
  }
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  cg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  confetti = new THREE.Points(cg, new THREE.PointsMaterial({ size: 0.18, vertexColors: true, transparent: true, depthWrite: false }));
  confetti.userData = { vel, N, active: false };
  confetti.frustumCulled = false;
  confetti.visible = false;
  scene.add(confetti);
}

// 王様：あっち（飼い主）に王冠とマントを着せる
function dressKing(ch) {
  const head = ch.bone('head'), chest = ch.bone('chest') || ch.bone('spine');
  ch.group.updateMatrixWorld(true);
  const headMesh = ch.model.getObjectByName('Atchi_Head_Preserved');
  const hb = new THREE.Box3().setFromObject(headMesh, true);
  const headW = hb.max.x - hb.min.x;
  const topWorld = new THREE.Vector3((hb.min.x + hb.max.x) / 2, hb.max.y, (hb.min.z + hb.max.z) / 2);
  const gold = new THREE.MeshStandardMaterial({ color: 0xf2c640, roughness: 0.35, metalness: 0.25, emissive: 0x6a4a00 });
  const crown = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.45, 0.28, 20), gold);
  crown.add(base);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.34, 8), gold);
    spike.position.set(Math.cos(a) * 0.43, 0.3, Math.sin(a) * 0.43);
    crown.add(spike);
    const gem = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), new THREE.MeshStandardMaterial({ color: i % 2 ? 0xe02a3a : 0x2a6ae0, roughness: 0.2 }));
    gem.position.set(Math.cos(a) * 0.5, 0.0, Math.sin(a) * 0.5);
    crown.add(gem);
  }
  const wScale = (headW * 0.72) / 1.0;
  const w2l = (v) => head.worldToLocal(v.clone());
  crown.position.copy(w2l(topWorld.clone().add(new THREE.Vector3(0, -0.04 * headW, 0))));
  const bs = new THREE.Vector3(); head.getWorldScale(bs);
  crown.scale.setScalar(wScale / bs.x);
  head.add(crown);
  // マント（背中側 = -Z）
  const capeMat = new THREE.MeshStandardMaterial({ color: 0xb01830, roughness: 0.8, side: THREE.DoubleSide });
  const cape = new THREE.Group();
  const cw = 1.0, chh = 1.0;
  const body = new THREE.Mesh(new THREE.PlaneGeometry(cw, chh, 1, 1), capeMat);
  body.position.set(0, -chh / 2 + 0.15, 0);
  const trim = new THREE.Mesh(new THREE.PlaneGeometry(cw + 0.04, 0.16), new THREE.MeshStandardMaterial({ color: 0xf4f0e6, side: THREE.DoubleSide }));
  trim.position.set(0, 0.15 - chh + 0.04, 0.003);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.07, 8, 20), new THREE.MeshStandardMaterial({ color: 0xf4f0e6 }));
  collar.rotation.x = Math.PI / 2; collar.position.set(0, 0.12, 0.0);
  cape.add(body, trim, collar);
  const cworld = new THREE.Vector3(); chest.getWorldPosition(cworld);
  // 背中より少しうしろ、首の下あたり
  const hbm = new THREE.Box3().setFromObject(ch.model.getObjectByName('Atchi_Body_LowTrial'), true);
  const shoulderY = hbm.min.y + (hbm.max.y - hbm.min.y) * 0.78;
  const backZ = cworld.z - (hbm.max.z - hbm.min.z) * 0.32;
  cape.position.copy(chest.worldToLocal(new THREE.Vector3(cworld.x, shoulderY, backZ)));
  const cs = new THREE.Vector3(); chest.getWorldScale(cs);
  const cScale = ((hbm.max.x - hbm.min.x) * 0.9) / cw / cs.x;
  cape.scale.set(cScale, (1.15 / cs.x), cScale);
  cape.rotation.x = -0.12;
  chest.add(cape);
}

// ---------------------------------------------------------------- カメラ
function setCam(pos, look, snap = false) {
  camTarget.pos.copy(pos); camTarget.look.copy(look);
  if (snap) camSnap = true;
}
function updateCamera(dt) {
  if (orbit) {
    orbit.a += dt * 0.35;
    const c = orbit.center;
    camTarget.pos.set(c.x + Math.sin(orbit.a) * orbit.r, c.y + orbit.h, c.z + Math.cos(orbit.a) * orbit.r);
    camTarget.look.set(c.x, c.y + 1.0, c.z);
  } else if (state === 'play') {
    const p = yuma.group.position;
    camTarget.pos.set(p.x - Math.sin(camYaw) * 5.6, p.y + 3.1, p.z - Math.cos(camYaw) * 5.6);
    camTarget.look.set(p.x, p.y + 1.0, p.z);
  }
  const k = camSnap ? 1 : 1 - Math.exp(-dt * 4.5);
  camera.position.lerp(camTarget.pos, k);
  camLook.lerp(camTarget.look, k);
  camSnap = false;
  camera.lookAt(camLook);
}

// ---------------------------------------------------------------- プレイヤー操作
function faceTo(ch, dx, dz, dt, rate = 10) {
  const target = Math.atan2(dx, dz);
  let d = target - ch.group.rotation.y;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  ch.group.rotation.y += d * (1 - Math.exp(-dt * rate));
}
function walkTo(ch, target, speed, dt, minDist = 0.05) {
  const p = ch.group.position;
  const dx = target.x - p.x, dz = target.z - p.z, d = Math.hypot(dx, dz);
  if (d <= minDist) return true;
  const step = Math.min(d, speed * dt);
  p.x += (dx / d) * step; p.z += (dz / d) * step;
  const g = groundAt(p.x, p.z);
  if (g != null) p.y = g;
  faceTo(ch, dx, dz, dt, 14);
  return d - step <= minDist;
}
function playerUpdate(dt) {
  let ax = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + stick.x;
  let az = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) - stick.y;
  if (keys.KeyQ) camYaw += dt * 1.6;
  if (keys.KeyE) camYaw -= dt * 1.6;
  const mag = Math.min(1, Math.hypot(ax, az));
  const p = yuma.group.position;
  if (mag > 0.08) {
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    const rx = -Math.cos(camYaw), rz = Math.sin(camYaw);
    let dx = fx * az + rx * ax, dz = fz * az + rz * ax;
    const l = Math.hypot(dx, dz); dx /= l; dz /= l;
    const sp = 5.6 * mag * dt;
    let nx = p.x + dx * sp, nz = p.z + dz * sp;
    if (groundAt(nx, nz) == null) {          // かべにそって すべる
      if (groundAt(nx, p.z) != null) nz = p.z;
      else if (groundAt(p.x, nz) != null) nx = p.x;
      else { nx = p.x; nz = p.z; }
    }
    p.x = nx; p.z = nz;
    const g = groundAt(nx, nz);
    if (g != null) p.y += (g - p.y) * (1 - Math.exp(-dt * 20));
    faceTo(yuma, dx, dz, dt);
    yuma.play('walk', 0.15, 0.9 + mag * 0.5);
  } else {
    yuma.play('idle', 0.25);
  }
}

// ---------------------------------------------------------------- 演出パーツ
function burstSparkles(center, n = 24) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.1 + Math.random() * 0.08), new THREE.MeshBasicMaterial({ color: [0xfff08a, 0xffffff, 0xffc04a][i % 3], transparent: true }));
    m.position.copy(center);
    const a = Math.random() * Math.PI * 2, u = 1.5 + Math.random() * 2.5;
    m.userData = { v: new THREE.Vector3(Math.cos(a) * u, 2 + Math.random() * 3, Math.sin(a) * u), life: 1 };
    scene.add(m); sparkles.push(m);
  }
}
function burstCrumbs(center) {
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.05 + Math.random() * 0.05, 6, 6), new THREE.MeshBasicMaterial({ color: 0xe9b86a, transparent: true }));
    m.position.copy(center);
    const a = Math.random() * Math.PI * 2, u = 0.8 + Math.random() * 1.6;
    m.userData = { v: new THREE.Vector3(Math.cos(a) * u, 1.5 + Math.random() * 2, Math.sin(a) * u), life: 1 };
    scene.add(m); sparkles.push(m);
  }
}
function updateFx(dt, time) {
  for (let i = sparkles.length - 1; i >= 0; i--) {
    const m = sparkles[i];
    m.userData.life -= dt * 1.1;
    m.userData.v.y -= 9 * dt;
    m.position.addScaledVector(m.userData.v, dt);
    m.material.opacity = Math.max(0, m.userData.life);
    if (m.userData.life <= 0) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); sparkles.splice(i, 1); }
  }
  if (confetti.userData.active) {
    const { vel, N } = confetti.userData, a = confetti.geometry.attributes.position, c = orbit ? orbit.center : yuma.group.position;
    for (let i = 0; i < N; i++) {
      let y = a.getY(i) + vel[i].y * dt;
      if (confetti.userData.init !== true || y < c.y - 0.2) {
        a.setXYZ(i, c.x + (Math.random() - 0.5) * 16, c.y + 6 + Math.random() * 6, c.z + (Math.random() - 0.5) * 16);
      } else {
        a.setXYZ(i, a.getX(i) + Math.sin(time * 2 + i) * dt * 0.8 + vel[i].x * dt, y, a.getZ(i) + vel[i].z * dt);
      }
    }
    confetti.userData.init = true;
    a.needsUpdate = true;
  }
  const beam = scene.getObjectByName('beam');
  if (beam) {
    beam.visible = state === 'play';
    beam.material.opacity = 0.18 + Math.sin(time * 3) * 0.06;
  }
  scene.traverse((o) => { if (o.name === 'flame') { o.scale.y = 1 + Math.sin(time * 14 + o.parent.position.x) * 0.2; } });
}

// ---------------------------------------------------------------- 物語の進行
async function intro() {
  state = 'cut1';
  music.play('royal');
  yuma.group.position.copy(YUMA_START);
  yuma.group.rotation.y = Math.PI;
  setCam(new THREE.Vector3(5, 5.2, YUMA_START.z + 9), new THREE.Vector3(0, 5, -4), true);
  yuma.play('walk', 0.1, 1.15);
  king.play('idle');
  // 玉座の前へ歩いていく
  await new Promise((res) => {
    let last = performance.now();
    const tick = () => {
      if (state !== 'cut1') return res();
      const now = performance.now(), dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      walkTo(yuma, YUMA_MEET, 6.5, dt, 0.05);
      const p = yuma.group.position;
      setCam(new THREE.Vector3(6, p.y + 2.6, p.z + 6), new THREE.Vector3(0, p.y + 1.2, p.z - 6));
      if (p.z <= YUMA_MEET.z + 0.1) return res();
      requestAnimationFrame(tick);
    };
    tick();
  });
  yuma.play('idle');
  await wait(300);
  const meetCam = () => setCam(new THREE.Vector3(4.4, 5.5, -10), new THREE.Vector3(0.2, 4.9, -21));
  meetCam();
  king.play('wave', 0.2);
  await talk([
    ['王様', 'おお ゆうしゃ ユウマよ！ よくぞ きてくれた！'],
    ['王様', 'となりに おるのは しつじの ぽんねこじゃ。 なんでも めいれい するが よい。'],
    ['ぽんねこ', 'ぽんねこで ございます にゃ。 どうぞ おみしりおきを。'],
    ['王様', 'いま この くにに 魔王が ふたたび めざめ、 そらは くもり ひとびとは ふるえて おる。'],
    ['王様', 'そなたの ちからが ひつようなのじゃ。 どうか 魔王を うちたおして おくれ！'],
    ['王様', 'これは ささやかな ほうしゅうじゃ。 ひのきの ぼうと 5ゴールド！'],
    ['', 'ユウマは ひのきの ぼうを てにいれた！ …ちょっと かじってみた。'],
    ['王様', 'ひとりでは しんぱいじゃ。 なかまを しょうかいしよう！ …これ、 はいりなさい！'],
  ]);
  king.play('idle', 0.4);
  // 仲間のかけつけ
  poodle.group.visible = pome.group.visible = true;
  poodle.group.position.set(-2.1, 3.7, 14);
  pome.group.position.set(2.1, 3.7, 14);
  poodle.group.rotation.y = pome.group.rotation.y = Math.PI;
  const camFollow = () => setCam(new THREE.Vector3(5.5, 5.2, poodle.group.position.z + 8), new THREE.Vector3(0, 4.9, poodle.group.position.z - 5));
  await Promise.all([
    moveChar(poodle, new THREE.Vector3(-2.1, 3.7, -17.5), 7, camFollow),
    moveChar(pome, new THREE.Vector3(2.1, 3.7, -17.5), 7),
  ]);
  for (const c of [poodle, pome]) c.group.rotation.y = Math.PI;
  meetCam();
  poodle.play('wave', 0.2);
  await talk([
    ['プードル', 'はじめまして ゆうしゃさま。 プードルですわ。 おそばで おつかえ しますの。'],
  ]);
  poodle.play('idle', 0.3); pome.play('wave', 0.2);
  await talk([
    ['ポメ', 'ポメです！ ふわふわで ゆうしゃさまを まもるよ！'],
  ]);
  pome.play('idle', 0.3);
  music.found();
  await talk([['', 'プードルと ポメが なかまに くわわった！']]);
  // 縦ならび（ドラクエ2）で ついてくる準備
  trail.length = 0;
  for (let i = 0; i < 40; i++) trail.push(new THREE.Vector3(YUMA_MEET.x, 3.7, YUMA_MEET.z - 0.3 * (i + 1)));
  following = true;

  // 城をレベルアップ
  await talk([
    ['王様', 'ところで ここは すんぷじょうの あと。 いまは てんしゅが ないのが なやみ なのじゃ…。'],
    ['王様', 'そこで！ ゆうしゃの たびだちを いわって、 この しろを レベルアップ させるぞ！！'],
  ]);
  await castleShow();

  setCam(new THREE.Vector3(4.4, 5.5, -10), new THREE.Vector3(0.2, 4.9, -21), true);
  king.play('wave', 0.2);
  await talk([
    ['王様', 'うむ！ これで あんしんじゃ！ ゆうしゃ ユウマと なかまたちよ、 しろを でて 魔王の しろを めざせ！ たのんだぞ！'],
  ]);
  music.bark();
  await talk([['ユウマ', 'ワンッ！ まかせて！']]);
  king.play('idle', 0.4);
  objective('もくてき：しろの そとへ 出て、 魔王の しろを めざせ！　（ひかりの はしらの むこう）');
  yuma.group.rotation.y = Math.PI;
  state = 'play';
  document.body.classList.add('playing');
}

function moveChar(ch, target, speed = 6.5, camFn) {
  return new Promise((res) => {
    let last = performance.now();
    const tick = () => {
      const now = performance.now(), dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const done = walkTo(ch, target, speed, dt, 0.05);
      ch.play(done ? 'idle' : 'walk', 0.15, 1.3);
      if (camFn) camFn();
      if (done) return res();
      requestAnimationFrame(tick);
    };
    tick();
  });
}

const lvEl = $('lv');
function showLv(text) { lvEl.textContent = text; lvEl.style.display = 'block'; }
async function castleShow() {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  setCam(V(-26, 13, -56), V(-26, 14, -80), true);
  showLv('しろレベル　Lv.1　〜 かんばん だけ 〜');
  await wait(3200);
  music.found();
  showLv('しろレベル　Lv.2　〜 てんしゅ かんせい！ 〜');
  setCam(V(-4, 20, -44), V(-26, 22, -88));
  await castle.setLevel(2);
  await wait(2400);
  music.found();
  showLv('しろレベル　Lv.3　〜 きんぴか！！ 〜');
  setCam(V(10, 24, -34), V(-26, 26, -88));
  await castle.setLevel(3);
  await wait(2400);
  music.found();
  showLv('しろレベル　Lv.99　〜 ぜんぶ のせ！！！ 〜');
  setCam(V(26, 30, -24), V(-26, 32, -88));
  await castle.setLevel(4);
  await wait(4200);
  showLv('しろレベル　Lv.99');
}

// ---- なかま（縦ならびで ついてくる）
const FOLLOW_GAP = [2.0, 4.0];
function updateTrail() {
  const p = yuma.group.position, l = trail[0];
  if (!l || Math.hypot(p.x - l.x, p.z - l.z) > 0.25) { trail.unshift(p.clone()); if (trail.length > 80) trail.pop(); }
}
function followerUpdate(ch, gap, dt) {
  let acc = 0, prev = yuma.group.position, target = prev;
  for (const t of trail) {
    acc += Math.hypot(t.x - prev.x, t.z - prev.z); prev = t; target = t;
    if (acc >= gap) break;
  }
  const p = ch.group.position;
  const dx = target.x - p.x, dz = target.z - p.z, d = Math.hypot(dx, dz);
  if (d > 0.12) {
    const sp = clamp(d * 4.5, 0, 8);
    const step = Math.min(d, sp * dt);
    p.x += dx / d * step; p.z += dz / d * step;
    faceTo(ch, dx, dz, dt, 12);
    ch.play('walk', 0.15, clamp(sp / 4.5, 0.6, 1.8));
  } else ch.play('idle', 0.2);
  const g = groundAt(p.x, p.z);
  if (g != null) p.y += (g - p.y) * (1 - Math.exp(-dt * 15));
}

let kingCheered = false, hintShown = false;
async function snackScene() {
  state = 'cut2';
  document.body.classList.remove('playing');
  objective('');
  music.found();
  music.play('snack');
  yuma.play('idle', 0.15);
  const p = yuma.group.position;
  faceTo(yuma, 0, 1, 1, 100);
  snack.visible = true;
  burstSparkles(snack.position, 30);
  // ぽんっと現れる
  const t0 = performance.now();
  await new Promise((res) => {
    const tick = () => {
      const t = clamp((performance.now() - t0) / 500, 0, 1);
      snack.scale.setScalar(1.3 * (1 - Math.pow(1 - t, 3)) * (1 + Math.sin(t * Math.PI) * 0.25));
      if (t >= 1) return res();
      requestAnimationFrame(tick);
    };
    tick();
  });
  setCam(new THREE.Vector3(p.x + 2.8, p.y + 1.5, p.z + 3.2), new THREE.Vector3(0, p.y + 1.2, p.z + 6));
  await talk([['', '！！！　ユウマの はなが ぴくぴく うごいた。'], ['ユウマ', 'くんくん…… この においは…… オヤツだーっ！！']]);
  // かけよる
  yuma.play('walk', 0.1, 1.9);
  const goal = new THREE.Vector3(SNACK_POS.x, SNACK_POS.y, SNACK_POS.z - 1.9);
  await new Promise((res) => {
    const prev = camTarget.pos.clone();
    const tick = (now) => {
      const dt = 1 / 60;
      const done = walkTo(yuma, goal, 7.5, dt, 0.05);
      const q = yuma.group.position;
      setCam(new THREE.Vector3(q.x + 3.2, q.y + 1.6, q.z - 1.0), new THREE.Vector3(snack.position.x, q.y + 0.9, snack.position.z - 0.6));
      if (done) return res();
      requestAnimationFrame(tick);
    };
    tick();
  });
  yuma.play('idle', 0.2);
  yuma.group.rotation.y = 0;
  // むさぼり食う
  eating = true;
  setCam(new THREE.Vector3(SNACK_POS.x + 3.4, 1.7, SNACK_POS.z - 1.6), new THREE.Vector3(SNACK_POS.x, 1.0, SNACK_POS.z - 0.6));
  await wait(500);
  const bites = 7;
  for (let i = 0; i < bites; i++) {
    music.munch();
    burstCrumbs(new THREE.Vector3(SNACK_POS.x, 1.3, SNACK_POS.z - 1.1));
    snack.scale.setScalar(1.3 * (1 - (i + 1) / (bites + 0.2)));
    snack.position.z = SNACK_POS.z - 0.1 * i;
    await wait(330);
  }
  snack.visible = false;
  burstSparkles(new THREE.Vector3(SNACK_POS.x, 1.4, SNACK_POS.z - 1.0), 18);
  eating = false;
  await talk([
    ['ユウマ', 'もぐ もぐ もぐ…… うまーーーい！！'],
    ['', 'ユウマは ほねガムを ぺろりと たいらげた！'],
    ['ユウマ', 'ん？ ぼく なにか たいせつな ことを たのまれて いたような……'],
    ['ユウマ', '…… まあ いっか！ オヤツ おいしかったし！'],
  ]);
  await ending();
}

async function ending() {
  state = 'ending';
  music.play('ending');
  yuma.play('hiphop', 0.3);
  following = false;
  const c = yuma.group.position.clone();
  poodle.group.position.set(c.x - 1.9, c.y, c.z + 0.4); pome.group.position.set(c.x + 1.9, c.y, c.z + 0.4);
  poodle.group.rotation.y = pome.group.rotation.y = 0;
  poodle.play('wave', 0.3); pome.play('wave', 0.3);
  orbit = { center: c, a: Math.PI * 0.15, r: 5.2, h: 1.9 };
  confetti.visible = true; confetti.userData.active = true;
  $('end').style.display = 'flex';
  await wait(1500);
  $('end').classList.add('show');
  await wait(300);
  $('e1').classList.add('on');
  await wait(2600);
  $('e2').classList.add('on');
  await wait(3400);
  $('efin').classList.add('on');
  const sec = Math.round((performance.now() - started) / 1000);
  $('e3').textContent = `プレイじかん ${Math.floor(sec / 60)}ふん ${sec % 60}びょう`;
  $('e3').classList.add('on');
  await wait(1200);
  $('again').classList.add('on');
}
$('again').addEventListener('click', () => location.reload());

// ---------------------------------------------------------------- メインループ
const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05), time = clock.elapsedTime;
  if (yuma) {
    if (state === 'play') {
      playerUpdate(dt);
      const p = yuma.group.position;
      if (!kingCheered && p.z > 4) { kingCheered = true; subtitle('王様「ゆけ ユウマよ！ たのんだぞーっ！」'); king.play('wave', 0.3); }
      if (!hintShown && p.z > RAMP_Z0 + 4) { hintShown = true; subtitle('…… なんだか いい においが する！？', 3500); }
      if (p.z >= SNACK_POS.z - 8 && groundAt(p.x, p.z) != null && p.z > BRIDGE_END + 1.5) snackScene();
    }
    if (following) {
      updateTrail();
      followerUpdate(poodle, FOLLOW_GAP[0], dt);
      followerUpdate(pome, FOLLOW_GAP[1], dt);
    }
    for (const c of [yuma, king, poodle, pome, butler]) c.mixer.update(dt);
    castle.update(dt, time);
    if (eating) {
      eatBob += dt * 16;
      const head = yuma.bone('neck') || yuma.bone('head');
      if (head) {
        if (!eatBase) eatBase = head.quaternion.clone();
        head.quaternion.copy(eatBase).multiply(eatQ.setFromAxisAngle(eatAxis, 0.55 + Math.sin(eatBob) * 0.35));
      }
      yuma.group.position.y = 0.7 + Math.abs(Math.sin(eatBob * 0.5)) * 0.05;
    }
    snack.rotation.y += dt * 1.2;
    if (snack.visible && !eating) snack.position.y = 0.9 + Math.sin(time * 3) * 0.12 + SNACK_POS.y - 0.7;
    updateCamera(dt);
    updateFx(dt, time);
  } else if (stage) {
    camera.lookAt(0, 4, 0);
  }
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------- タイトルの星空
function twinkle() {
  const c = $('stars'), g = c.getContext('2d');
  const fit = () => { c.width = c.clientWidth; c.height = c.clientHeight; };
  fit(); addEventListener('resize', fit);
  const st = Array.from({ length: 140 }, () => ({ x: Math.random(), y: Math.random() * 0.8, r: Math.random() * 1.6 + 0.4, p: Math.random() * 6 }));
  const draw = (t) => {
    if (state !== 'title') return;
    g.clearRect(0, 0, c.width, c.height);
    for (const s of st) {
      g.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(t / 900 + s.p));
      g.fillStyle = '#fff';
      g.fillRect(s.x * c.width, s.y * c.height, s.r, s.r);
    }
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
}

// ---------------------------------------------------------------- 起動
async function boot() {
  const [gy, ga, gs, gp, gm, gb] = await Promise.all([
    load('yuma', '../../assets/models/yuma/yuma.glb'),
    load('atchi', '../../assets/models/atchi/atchi.glb'),
    load('stage', '../../assets/stage/shizuoka_hakoniwa.glb'),
    load('poodle', '../../assets/models/poodle/poodle.glb'),
    load('pome', '../../assets/models/pome/pome.glb'),
    load('ponneko', '../../assets/models/ponneko/ponneko.glb'),
  ]);
  stage = gs.scene;
  scene.add(stage);
  stage.updateMatrixWorld(true);
  stage.traverse((o) => { o.matrixAutoUpdate = false; });
  yuma = makeChar(gy, 1.6);
  king = makeChar(ga, 1.75);
  yuma.group.position.copy(YUMA_START);
  king.group.position.copy(KING_POS);
  king.group.rotation.y = 0;
  poodle = makeChar(gp, 1.5);
  pome = makeChar(gm, 1.45);
  butler = makeChar(gb, 1.6);
  king.group.position.copy(KING_POS).add(new THREE.Vector3(-0.8, 0, 0));
  butler.group.position.set(2.0, 3.7, -24);
  butler.group.rotation.y = -0.25;
  poodle.group.position.set(-1.8, 3.7, 14);
  pome.group.position.set(1.8, 3.7, 14);
  poodle.group.visible = pome.group.visible = false;
  scene.add(yuma.group, king.group, poodle.group, pome.group, butler.group);
  for (const c of [yuma, king, poodle, pome, butler]) { c.group.updateMatrixWorld(true); c.play('idle', 0); }
  dressKing(king);
  dressHero(yuma);
  dressButler(butler);
  dressFriend(poodle, 0xe0306a);
  dressFriend(pome, 0x2a7ae0);
  buildProps();
  castle = buildCastle(scene);
  camera.position.set(8, 6.5, -4);
  camLook.set(0, 5, -20);
  camTarget.pos.copy(camera.position); camTarget.look.copy(camLook);
  $('loading').style.display = 'none';
  $('title').style.display = 'flex';
  state = 'title';
  window.__game = { THREE, scene, camera, yuma, king, poodle, pome, butler, castle, castleShow, setCam, snackScene, ending, get state() { return state; }, groundAt, set camYaw(v) { camYaw = v; } };
  // タイトル画面ではお城を見せる
  setCam(new THREE.Vector3(7, 6.2, -9), new THREE.Vector3(0, 4.8, -24), true);
  const startGame = () => {
    if (state !== 'title') return;
    $('title').style.display = 'none';
    music.start();
    started = performance.now();
    intro();
  };
  $('title').addEventListener('pointerdown', startGame);
  twinkle();
  addEventListener('keydown', (e) => { if (state === 'title' && ['Space', 'Enter'].includes(e.code)) startGame(); });
  if (DEBUG.has('autostart')) startGame();
}
frame();
boot().catch((e) => { $('loadmsg').textContent = 'よみこみに しっぱいしました: ' + e.message; console.error(e); });
