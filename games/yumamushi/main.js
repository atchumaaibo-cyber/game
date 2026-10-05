import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/meshopt_decoder.module.js';

// ---------- 設定 ----------
const Q = new URLSearchParams(location.search);
const CHICK_DIST = Q.has('near') ? 4 : 22;   // ヒヨコまでの距離（?near で近く：動作確認用）
const WAVE_SPEED = 5.2;                      // 這う波の速さ（rad/秒）
const WAVE_JOINT = 0.9;                      // 隣の節との位相ずれ（README の見本と同じ）
const WAVE_AMP = 0.2;                        // 上下の振れ（見本は 0.11。気持ち悪さ増しで大きめ）
const FIELD_X = 9;

const $ = (id) => document.getElementById(id);
const isPortrait = () => innerWidth < innerHeight;

// ---------- 画面の土台 ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#bfe8ff');
scene.fog = new THREE.Fog('#d6f2ff', 18, 60);
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 120);
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = isPortrait() ? 68 : 55;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

scene.add(new THREE.HemisphereLight('#ffffff', '#6a9a3a', 1.5));
const sun = new THREE.DirectionalLight('#fff4d6', 2.2);
sun.position.set(-6, 12, -4);
scene.add(sun);

// ---------- 読み込み ----------
const manager = new THREE.LoadingManager();
manager.onProgress = (_u, n, t) => { $('bar').style.width = (n / t * 100) + '%'; };
const loader = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);
const load = (url) => new Promise((ok, ng) => loader.load(url, ok, undefined, ng));

// ---------- 音（Web Audio の自作シンセ。音源ファイルなし） ----------
let ac = null, master = null, bgmTimer = null;
function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination);
    startBgm();
  } catch (e) { ac = null; }
}
function tone(freq, when, dur, type = 'sine', vol = 0.2, freqEnd = null) {
  if (!ac) return;
  const t = ac.currentTime + when;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
function jingleTirorirorin() {          // ティロリロリン
  const seq = [79, 84, 88, 91, 88, 91, 96, 91, 96, 100];
  seq.forEach((n, i) => tone(NOTE(n), i * 0.075, 0.18, 'triangle', 0.22));
  tone(NOTE(103), seq.length * 0.075, 0.9, 'sine', 0.25);
}
function fanfare() {
  [60, 64, 67, 72].forEach((n, i) => tone(NOTE(n), i * 0.13, 0.5, 'square', 0.1));
  [72, 76, 79, 84].forEach((n) => tone(NOTE(n), 0.55, 1.4, 'triangle', 0.16));
  tone(NOTE(48), 0.55, 1.4, 'triangle', 0.2);
}
function sfxChick() { tone(1800, 0, 0.12, 'sine', 0.15, 2600); tone(2000, 0.14, 0.1, 'sine', 0.12, 2800); }
function sfxSquelch() { tone(170, 0, 0.35, 'sawtooth', 0.05, 80); tone(95, 0, 0.3, 'sine', 0.1, 60); }
function sfxPop() { tone(300, 0, 0.2, 'sine', 0.25, 900); }
function startBgm() {                    // ゆるい行進曲（ペンタトニック）
  const melody = [67, 69, 72, 69, 67, 64, 62, 64, 67, 69, 72, 76, 74, 72, 69, 67];
  const bass = [48, 48, 55, 55, 53, 53, 55, 55];
  let step = 0;
  bgmTimer = setInterval(() => {
    if (!ac || ac.state !== 'running') return;
    const quiet = (state === 'pupa' || state === 'burst') ? 0.4 : 1;
    tone(NOTE(melody[step % melody.length]), 0, 0.22, 'triangle', 0.07 * quiet);
    if (step % 2 === 0) tone(NOTE(bass[(step / 2) % bass.length | 0]), 0, 0.4, 'sine', 0.1 * quiet);
    step++;
  }, 260);
}

// ---------- 世界づくり ----------
function rnd(a, b) { return a + Math.random() * (b - a); }
const world = new THREE.Group(); scene.add(world);

function buildWorld() {
  // 地面
  const g = new THREE.PlaneGeometry(80, 120, 40, 60); g.rotateX(-Math.PI / 2);
  const col = []; const c = new THREE.Color();
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    c.set('#79c24a').offsetHSL(rnd(-0.02, 0.02), rnd(-0.05, 0.05), rnd(-0.05, 0.05));
    col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  const ground = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
  ground.position.set(0, 0, 25); world.add(ground);
  // 道（土）
  const road = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 70).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#d8b878' }));
  road.position.set(0, 0.01, 27); world.add(road);

  // 草（インスタンス）
  const grassGeo = new THREE.ConeGeometry(0.06, 0.45, 4);
  const grass = new THREE.InstancedMesh(grassGeo, new THREE.MeshLambertMaterial({ color: '#4fa22c' }), 700);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 700; i++) {
    m.compose(new THREE.Vector3(rnd(-30, 30), 0.2, rnd(-6, 70)), new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd(-.2, .2), rnd(0, 6), rnd(-.2, .2))), new THREE.Vector3(1, rnd(.7, 1.6), 1));
    grass.setMatrixAt(i, m);
  }
  world.add(grass);

  // 花
  const colors = ['#ff6b8a', '#ffd23f', '#ffffff', '#b57bff', '#ff9a3c'];
  const stemGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.5, 5);
  const headGeo = new THREE.SphereGeometry(0.12, 8, 6);
  const stems = new THREE.InstancedMesh(stemGeo, new THREE.MeshLambertMaterial({ color: '#3e8a22' }), 90);
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshLambertMaterial({ color: '#ffffff' }), 90);
  for (let i = 0; i < 90; i++) {
    let x = rnd(-14, 14); if (Math.abs(x) < 2.2) x += Math.sign(x || 1) * 2.2;
    const z = rnd(-4, 60), s = rnd(.8, 1.5);
    m.compose(new THREE.Vector3(x, 0.25 * s, z), new THREE.Quaternion(), new THREE.Vector3(1, s, 1)); stems.setMatrixAt(i, m);
    m.compose(new THREE.Vector3(x, 0.52 * s, z), new THREE.Quaternion(), new THREE.Vector3(1, .7, 1)); heads.setMatrixAt(i, m);
    heads.setColorAt(i, c.set(colors[i % colors.length]));
  }
  world.add(stems, heads);

  // 木
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 2.4, 7);
  const leafGeo = new THREE.IcosahedronGeometry(1.5, 0);
  const trunkMat = new THREE.MeshLambertMaterial({ color: '#7a5230' });
  const leafMat = new THREE.MeshLambertMaterial({ color: '#3f9a3a', flatShading: true });
  for (let i = 0; i < 34; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * rnd(FIELD_X + 0.5, FIELD_X + 12), z = rnd(-6, 70), s = rnd(.8, 1.5);
    const t = new THREE.Group();
    const tr = new THREE.Mesh(trunkGeo, trunkMat); tr.position.y = 1.2;
    const lf = new THREE.Mesh(leafGeo, leafMat); lf.position.y = 3.2; lf.rotation.y = rnd(0, 3);
    t.add(tr, lf); t.scale.setScalar(s); t.position.set(x, 0, z); world.add(t);
  }
  // きのこ
  const capGeo = new THREE.SphereGeometry(0.28, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const stalkGeo = new THREE.CylinderGeometry(0.07, 0.09, 0.22, 8);
  for (let i = 0; i < 12; i++) {
    const g2 = new THREE.Group();
    const cap = new THREE.Mesh(capGeo, new THREE.MeshLambertMaterial({ color: '#e5483c' })); cap.position.y = 0.22;
    const st = new THREE.Mesh(stalkGeo, new THREE.MeshLambertMaterial({ color: '#f6efe0' })); st.position.y = 0.11;
    g2.add(cap, st);
    let x = rnd(-9, 9); if (Math.abs(x) < 2.2) x += 3;
    g2.position.set(x, 0, rnd(0, 50)); g2.scale.setScalar(rnd(.8, 1.6)); world.add(g2);
  }
}

// かわいい影
function blob(r) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.25, depthWrite: false }));
  m.position.y = 0.03; return m;
}

// ---------- ヒヨコ（モデルがないので部品で作った仮の姿） ----------
function makeChick() {
  const g = new THREE.Group();
  const yel = new THREE.MeshLambertMaterial({ color: '#ffd93a' });
  const org = new THREE.MeshLambertMaterial({ color: '#ff9a2e' });
  const blk = new THREE.MeshBasicMaterial({ color: '#222' });
  const body = new THREE.Group(); g.add(body);
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), yel); b.position.y = 0.55; b.scale.set(1, .95, 1.05); body.add(b);
  const h = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), yel); h.position.set(0, 1.1, 0.12); body.add(h);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.2, 8), org); beak.rotation.x = Math.PI / 2; beak.position.set(0, 1.07, 0.5); body.add(beak);
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), blk); e.position.set(s * 0.13, 1.17, 0.42); body.add(e);
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), yel); w.scale.set(.35, .8, 1); w.position.set(s * 0.5, 0.6, -0.02); w.userData.wing = s; body.add(w);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 6), org); leg.position.set(s * 0.17, 0.1, 0.05); g.add(leg);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.22), org); foot.position.set(s * 0.17, 0.02, 0.1); g.add(foot);
  }
  const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 6), yel); tuft.position.set(0, 1.45, 0.1); body.add(tuft);
  g.add(blob(0.55));
  g.userData.body = body;
  return g;
}

// ---------- パーティクル ----------
class Burst {
  constructor(n) {
    this.n = n;
    this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3); this.life = new Float32Array(n);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.pts.frustumCulled = false; scene.add(this.pts);
  }
  emit(origin, count, speed, palette, up = 2.5) {
    const c = new THREE.Color();
    for (let k = 0; k < count; k++) {
      const i = this.next = ((this.next ?? -1) + 1) % this.n;
      this.pos.set([origin.x, origin.y, origin.z], i * 3);
      const a = rnd(0, Math.PI * 2), s = rnd(.3, 1) * speed;
      this.vel.set([Math.cos(a) * s, rnd(0, 1) * up + 1, Math.sin(a) * s], i * 3);
      c.set(palette[(Math.random() * palette.length) | 0]);
      this.col.set([c.r, c.g, c.b], i * 3);
      this.life[i] = rnd(.8, 1.8);
    }
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -99; continue; }
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= 4 * dt;
      for (let k = 0; k < 3; k++) this.pos[i * 3 + k] += this.vel[i * 3 + k] * dt;
    }
    this.pts.geometry.attributes.position.needsUpdate = true;
    this.pts.geometry.attributes.color.needsUpdate = true;
  }
}
let burst;

// ---------- 状態 ----------
let state = 'loading';
let cat, catParts = [], catWrap, pupa, pupaGlow, pupaMat, dog, dogMixer, chick;
const heading = { v: 0 };
let steerInput = 0, steerSmooth = 0, phase = 0, timeInState = 0, lastSquelch = 0;
let chickAI = { t: 0, hopT: 0 };

const catPos = new THREE.Vector3(0, 0, 0);
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
let camMode = 'follow', camOrbit = 0;

function setState(s) { state = s; timeInState = 0; }

function makePupa() {
  const prof = [[0, 0], [.16, .03], [.27, .22], [.33, .5], [.3, .78], [.18, 1.0], [.06, 1.12], [0, 1.16]].map(([r, y]) => new THREE.Vector2(r, y));
  const mat = new THREE.MeshStandardMaterial({ color: '#8fae3a', roughness: .55, emissive: '#ffffff', emissiveIntensity: 0 });
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 24), mat); g.add(body);
  const bandMat = new THREE.MeshStandardMaterial({ color: '#5e7a22', roughness: .6 });
  for (let i = 0; i < 5; i++) {
    const y = .22 + i * .15;
    const r = prof.reduce((best, p, k) => k && prof[k - 1].y <= y && p.y >= y ? THREE.MathUtils.lerp(prof[k - 1].x, p.x, (y - prof[k - 1].y) / (p.y - prof[k - 1].y)) : best, .3);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r + .004, .012, 6, 24), bandMat); ring.rotation.x = Math.PI / 2; ring.position.y = y; g.add(ring);
  }
  // 糸（上から垂らす）
  const thread = new THREE.Mesh(new THREE.CylinderGeometry(.008, .008, 3, 4), new THREE.MeshBasicMaterial({ color: '#f2f2ea' }));
  thread.position.y = 1.16 + 1.5; thread.visible = false; g.add(thread);
  g.userData = { mat, body };
  g.add(blob(.4));
  return g;
}

async function init() {
  buildWorld();
  burst = new Burst(300);
  $('loadmsg').textContent = 'イモムシを よんでいます…';
  const [im, yu] = await Promise.all([load('./models/imomushi.glb'), load('./models/yuma.glb')]);

  // イモムシ：GLB の節の親子（head → seg1 … seg6）をそのまま使い、回転だけで動かす
  const root = im.scene;
  const byName = {}; root.traverse((o) => { byName[o.name] = o; });
  catParts = ['head', 'seg1', 'seg2', 'seg3', 'seg4', 'seg5', 'seg6'].map((n) => byName[n]).filter(Boolean);
  catWrap = new THREE.Group(); catWrap.add(root);
  root.position.set(0, 0, -0.45);                 // 体の中ほどが足元の中心に来るようにずらす
  root.traverse((o) => { if (o.isMesh) { o.material.side = THREE.DoubleSide; } });
  cat = new THREE.Group(); cat.add(catWrap); cat.add(blob(0.7));
  scene.add(cat);

  // 犬（ユウマ）
  const dogModel = yu.scene;
  dogModel.traverse((o) => { if (o.isMesh || o.isSkinnedMesh) o.frustumCulled = false; });
  const dbox = new THREE.Box3().setFromObject(dogModel);
  const ds = 1.1 / (dbox.max.y - dbox.min.y);       // 見た目の高さをそろえ、足の裏を地面に置く
  dogModel.scale.setScalar(ds); dogModel.position.y = -dbox.min.y * ds;
  dog = new THREE.Group(); dog.add(dogModel); dog.visible = false;
  scene.add(dog);
  dogMixer = new THREE.AnimationMixer(dogModel);
  const clip = yu.animations.find((a) => a.name === 'wave') || yu.animations.find((a) => a.name === 'idle');
  if (clip) { dog.userData.wave = dogMixer.clipAction(clip); }
  const idle = yu.animations.find((a) => a.name === 'idle');
  if (idle) dog.userData.idle = dogMixer.clipAction(idle);

  pupa = makePupa(); pupa.visible = false; scene.add(pupa);
  pupaGlow = new THREE.PointLight('#fff6b0', 0, 9); scene.add(pupaGlow);

  chick = makeChick(); scene.add(chick);
  chick.position.set(rnd(-1.5, 1.5), 0, CHICK_DIST);
  chick.rotation.y = Math.PI;

  $('loading').style.display = 'none';
  setState('title');
  $('title').style.display = 'flex';
  camPos.set(0, 2, -3.5); camLook.set(0, .4, 1);
  if (Q.has('autostart')) startGame();
}

function startGame() {
  initAudio();
  $('title').style.display = 'none';
  $('hud').style.display = 'block'; $('steer').style.display = 'block'; $('hint').style.display = 'block';
  setTimeout(() => { $('hint').style.display = 'none'; }, 5000);
  setState('play');
}

// ---------- 入力（よこドラッグ／キーボード） ----------
let dragging = false, keyL = false, keyR = false;
addEventListener('pointerdown', (e) => {
  if (state === 'title') { startGame(); return; }
  if (e.target.closest && e.target.closest('button')) return;
  initAudio();
  dragging = true; pointerSteer(e);
});
addEventListener('pointermove', (e) => { if (dragging) pointerSteer(e); });
addEventListener('pointerup', () => { dragging = false; });
addEventListener('pointercancel', () => { dragging = false; });
function pointerSteer(e) { steerInput = THREE.MathUtils.clamp((e.clientX / innerWidth - 0.5) * 2.6, -1, 1); }
addEventListener('keydown', (e) => {
  if (state === 'title' && (e.key === ' ' || e.key === 'Enter')) { startGame(); return; }
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keyL = true;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keyR = true;
});
addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keyL = false;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keyR = false;
});
$('again').onclick = () => { location.href = location.pathname + '?autostart'; };
$('home').onclick = () => { location.href = '../../'; };
$('title').addEventListener('click', () => { if (state === 'title') startGame(); });

// ---------- イモムシの動き（気持ち悪いやつ） ----------
function animateCat(dt, moving, curl = 0) {
  phase += dt * WAVE_SPEED * (moving ? 1 : 0.7);
  const t = phase;
  catParts.forEach((p, i) => {
    // 這う波：後ろから前へ進む（見本と同じ。振れを大きく）
    const up = WAVE_AMP * Math.sin(t + i * WAVE_JOINT) * (i === 0 ? 1.4 : 1);
    // くねくね左右のゆらぎ
    const wag = 0.16 * Math.sin(t * 0.5 + i * 0.7);
    // ハンドルを切ったほうへ体が曲がる
    const bend = steerSmooth * 0.14;
    // 蛹になる前に体を丸める
    p.rotation.set(up + curl * 0.42, wag * (1 - curl) + bend, 0);
  });
  // ぐにょっと伸び縮み（ぜんたい）
  const lurch = Math.sin(t);
  catWrap.scale.set(1 - lurch * 0.04, 1 + lurch * 0.07, 1 + lurch * 0.05);
  // 頭のうねり
  const head = catParts[0];
  if (head) head.rotation.z = 0.12 * Math.sin(t * 1.7);
  return Math.max(0, lurch);
}

// ---------- ヒヨコの動き ----------
function updateChick(dt, t) {
  const toCat = new THREE.Vector3().subVectors(catPos, chick.position); toCat.y = 0;
  const dist = toCat.length();
  chickAI.t += dt;
  let speed = 0;
  if (state === 'play' && dist < 11) {            // 気づいて、とことこ近づく
    speed = 0.9;
    const want = Math.atan2(toCat.x, toCat.z);
    chick.rotation.y = lerpAngle(chick.rotation.y, want, 4 * dt);
    chick.position.addScaledVector(new THREE.Vector3(Math.sin(chick.rotation.y), 0, Math.cos(chick.rotation.y)), speed * dt);
  } else if (state === 'play') {                  // きょろきょろ、ぴょんぴょん
    const sway = Math.sin(chickAI.t * 0.7) * 1.2;
    chick.position.x += sway * dt * 0.8;
    chick.position.x = THREE.MathUtils.clamp(chick.position.x, -FIELD_X + 2, FIELD_X - 2);
    chick.rotation.y = lerpAngle(chick.rotation.y, Math.PI + Math.sin(chickAI.t * 0.9) * 0.6, 3 * dt);
    speed = 0.4;
  } else {
    chick.rotation.y = lerpAngle(chick.rotation.y, Math.atan2(toCat.x, toCat.z), 6 * dt);
  }
  const hop = Math.abs(Math.sin(chickAI.t * (speed > 0.6 ? 7 : 4.5))) * (speed > 0 || state === 'talk' ? 0.22 : 0.05);
  chick.userData.body.position.y = hop;
  chick.userData.body.rotation.z = Math.sin(chickAI.t * 7) * 0.05 * (speed > 0.6 ? 1 : 0.4);
  chick.userData.body.children.forEach((c) => { if (c.userData.wing) c.rotation.z = c.userData.wing * (0.2 + 0.5 * Math.abs(Math.sin(chickAI.t * 9))); });
  if (state === 'play' && dist < 14 && Math.random() < dt * 0.6) sfxChick();
  return dist;
}
function lerpAngle(a, b, k) {
  let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * Math.min(1, k);
}

// ---------- しゃべる窓 ----------
function say(who, text) {
  $('talk').querySelector('.who').textContent = who;
  $('talk').querySelector('.text').textContent = text;
  $('talk').style.display = 'block';
}
const hideSay = () => { $('talk').style.display = 'none'; };

// ---------- 演出（蛹 → 犬） ----------
const confetti = ['#ff6b8a', '#ffd23f', '#ffffff', '#7be0ff', '#b57bff', '#9be04a'];
let flashA = 0;

function startTalk() {
  setState('talk');
  $('hud').style.display = 'none'; $('steer').style.display = 'none'; $('hint').style.display = 'none';
  say('ヒヨコ', 'ユウマ もう 羽化したほうが いいよ');
  sfxChick();
  setTimeout(jingleTirorirorin, 700);
}

function updateScene(dt) {
  timeInState += dt;
  const t = timeInState;
  const fwd = new THREE.Vector3(Math.sin(heading.v), 0, Math.cos(heading.v));
  let moving = false, curl = 0;

  if (state === 'play') {
    // ステアリング
    const kb = (keyR ? 1 : 0) - (keyL ? 1 : 0);
    if (kb) steerInput = kb; else if (!dragging) steerInput *= Math.pow(0.02, dt);
    steerSmooth += (steerInput - steerSmooth) * Math.min(1, 6 * dt);
    heading.v = THREE.MathUtils.clamp(heading.v - steerSmooth * 1.5 * dt, -1.1, 1.1);
    // 這う：波にあわせて「ぐいっ」と進む
    const lurch = animateCat(dt, true);
    moving = true;
    const spd = 0.45 + 1.5 * lurch;
    fwd.set(Math.sin(heading.v), 0, Math.cos(heading.v));
    catPos.addScaledVector(fwd, spd * dt);
    catPos.x = THREE.MathUtils.clamp(catPos.x, -FIELD_X, FIELD_X);
    if (catPos.z > CHICK_DIST + 16) catPos.z = CHICK_DIST + 16;
    // 這う音
    if (phase - lastSquelch > Math.PI * 2) { lastSquelch = phase; sfxSquelch(); }
    const dist = updateChick(dt, t);
    $('hud').textContent = '🐥 ヒヨコまで あと ' + Math.max(0, dist - 1.1).toFixed(0) + ' m';
    $('steer').firstElementChild.style.left = (50 + steerSmooth * 46) + '%';
    if (dist < 1.25) startTalk();
  } else if (state === 'talk') {
    animateCat(dt, false);
    updateChick(dt, t);
    if (t > 3.2) { hideSay(); setState('curl'); sfxSquelch(); }
  } else if (state === 'curl') {
    updateChick(dt, t);
    curl = Math.min(1, t / 2.2);
    animateCat(dt, false, curl);
    const s = 1 - Math.max(0, (t - 1.6) / 1.4) * 0.7;
    cat.scale.setScalar(s);
    if (Math.random() < dt * 40) burst.emit(new THREE.Vector3(catPos.x, 0.4, catPos.z), 2, 1.2, ['#ffffff', '#e8ffd0'], 1.2);
    if (t > 3.0) {
      cat.visible = false;
      pupa.position.copy(catPos); pupa.rotation.y = heading.v;
      pupa.visible = true; pupa.scale.setScalar(0.01);
      sfxPop();
      say('', 'ユウマは さなぎに なった……');
      setState('pupa');
    }
  } else if (state === 'pupa') {
    updateChick(dt, t);
    const grow = Math.min(1, t / 0.6);
    pupa.scale.setScalar(1.2 * (1 - Math.pow(1 - grow, 3)));
    const shake = Math.max(0, t - 0.8) * 0.03;
    pupa.rotation.z = Math.sin(t * 30) * shake;
    pupa.rotation.x = Math.cos(t * 26) * shake;
    pupa.position.y = Math.abs(Math.sin(t * 9)) * Math.max(0, t - 1.6) * 0.035;
    const glow = Math.max(0, (t - 1.0) / 2.6);
    pupa.userData.mat.emissiveIntensity = glow * 1.2;
    pupaGlow.position.set(catPos.x, 1, catPos.z); pupaGlow.intensity = glow * 14;
    if (t > 1.2) hideSay();
    if (t > 1.4 && Math.random() < dt * 30 * glow) burst.emit(new THREE.Vector3(catPos.x, 0.6, catPos.z), 2, 0.8, ['#fff6b0', '#ffffff'], 2);
    if (t > 3.8) {
      setState('burst'); flashA = 1; fanfare();
      pupa.visible = false; pupaGlow.intensity = 0;
      dog.visible = true;
      dog.position.set(catPos.x, 0, catPos.z);
      dog.rotation.y = heading.v + Math.PI;
      dog.scale.setScalar(0.01);
      if (dog.userData.wave) dog.userData.wave.reset().play();
      burst.emit(new THREE.Vector3(catPos.x, 0.8, catPos.z), 200, 5, confetti, 5);
    }
  } else if (state === 'burst' || state === 'dog') {
    updateChick(dt, t);
    const grow = Math.min(1, t / 0.5);
    const s = 1.0 * (1 - Math.pow(1 - grow, 3)) * (1 + 0.12 * Math.sin(grow * Math.PI));
    dog.scale.setScalar(Math.max(0.01, s));
    if (state === 'burst' && t > 0.5) {
      setState('dog');
      say('', 'ユウマは 犬に もどった！');
    } else if (state === 'dog') {
      if (t > 2.4) hideSay();
      if (t > 2.8 && !$('end').classList.contains('show')) showEnd();
    }
  }

  if (state !== 'play' && state !== 'title') catPos.y = 0;
  cat.position.copy(catPos); cat.rotation.y = heading.v;
  if (state === 'curl') cat.position.y = 0;
  if (dogMixer) dogMixer.update(dt);
  burst.update(dt);

  // フラッシュ
  flashA = Math.max(0, flashA - dt * 1.8);
  $('flash').style.opacity = state === 'pupa' ? String(Math.max(0, (timeInState - 3.0) / 0.8)) : String(flashA);

  // カメラ
  updateCamera(dt);
}

function showEnd() {
  $('end').style.display = 'flex';
  requestAnimationFrame(() => $('end').classList.add('show'));
  const secs = Math.round(playTime);
  $('e3').textContent = 'クリアタイム ' + secs + ' びょう';
  setTimeout(() => $('e1').classList.add('on'), 400);
  setTimeout(() => $('e2').classList.add('on'), 1600);
  setTimeout(() => $('efin').classList.add('on'), 3000);
  setTimeout(() => { $('e3').classList.add('on'); $('again').classList.add('on'); $('home').classList.add('on'); }, 4200);
  $('again').style.opacity = 0; $('home').style.opacity = 0;
  setTimeout(() => { $('again').style.opacity = 1; $('home').style.opacity = 1; }, 4200);
}

function updateCamera(dt) {
  const k = Math.min(1, 4 * dt);
  const portrait = isPortrait();
  let want, look;
  const fwd = new THREE.Vector3(Math.sin(heading.v), 0, Math.cos(heading.v));
  if (state === 'title') {
    const a = performance.now() / 6000;
    want = new THREE.Vector3(Math.sin(a) * 4, 2.2, -3.5); look = new THREE.Vector3(0, .4, 0);
  } else if (state === 'play') {
    const back = portrait ? 4.0 : 3.2, h = portrait ? 2.1 : 1.6;
    want = catPos.clone().addScaledVector(fwd, -back); want.y = h;
    look = catPos.clone().addScaledVector(fwd, 1.6); look.y = 0.35;
  } else {
    // 演出中：ユウマとヒヨコを横から見るカメラ
    const side = new THREE.Vector3(fwd.z, 0, -fwd.x);
    const zoom = state === 'pupa' ? Math.max(2.4, 4.4 - timeInState * 0.35) : 4.4;
    want = catPos.clone().addScaledVector(side, zoom * 0.8).addScaledVector(fwd, -zoom * 0.45); want.y = portrait ? 2.1 : 1.6;
    const mid = catPos.clone().lerp(chick.position, state === 'talk' ? 0.5 : 0.25);
    look = mid; look.y = state === 'pupa' ? 0.7 : 0.6;
  }
  camPos.lerp(want, k); camLook.lerp(look, k);
  camera.position.copy(camPos); camera.lookAt(camLook);
}

// ---------- ループ ----------
let last = performance.now(), playTime = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (state === 'title' && cat) {
    animateCat(dt, true);
    updateChick(dt, 0);
    updateCamera(dt);
    cat.position.copy(catPos);
  } else if (state !== 'loading') {
    if (state === 'play') playTime += dt;
    updateScene(dt);
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

init().catch((e) => {
  $('loadmsg').textContent = 'よみこみに しっぱいしました: ' + e;
  console.error(e);
});

// 動作確認用
window.__yuma = { get state() { return state; }, catPos, startGame };
