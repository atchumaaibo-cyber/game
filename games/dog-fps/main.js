import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

// ---------------------------------------------------------------------------
// データ（好物や大きさはここで変えられる）
// ---------------------------------------------------------------------------
const TREATS = {
  mikan:   { name: 'みかん',     color: '#ff9a1f' },
  senbei:  { name: 'せんべい',   color: '#b9772f' },
  manju:   { name: 'まんじゅう', color: '#f3e3c3' },
  shirasu: { name: 'しらす',     color: '#eef4f7' },
  hamburg: { name: 'ハンバーグ', color: '#6b3a1e' },
};
const TREAT_KEYS = Object.keys(TREATS);

// height: ゲームでの見せ寸（m）。fav: 好物
const CHARS = {
  yuma:    { name: 'ユウマ',   kind: 'チワワ',         height: 1.0,  fav: 'mikan',   playable: true },
  poodle:  { name: 'プードル', kind: 'トイプードル',   height: 1.2,  fav: 'senbei',  playable: true },
  pome:    { name: 'ポメ',     kind: 'ポメラニアン',   height: 1.15, fav: 'manju',   playable: true },
  ponneko: { name: 'ぽんねこ', kind: '三毛猫',         height: 1.15, fav: 'shirasu', playable: true },
  atchi:   { name: 'あっち',   kind: '飼い主',         height: 1.75, fav: 'hamburg', playable: false },
};

// 舞台: 箱庭の安倍川公園（glTF 座標。-Z が北）
const ARENA = { minX: -394, maxX: -346, minZ: -158, maxZ: 68 };
const SPAWN = new THREE.Vector3(-370, 0, 55);

const WAVES = [4, 6, 8];      // 各ウェーブの敵の数（ぜんぶ止めたらクリア）
const AMMO_START = 10, AMMO_MAX = 20, AMMO_PER_WAVE = 6, AMMO_PER_BOX = 8;
const BOX_COUNT = 2;          // 地面に置くオヤツ箱の数
// 手元に見せる毛・肌の色
const SKIN = { yuma: '#6b4430', poodle: '#c98a4b', pome: '#f2f0ec', ponneko: '#e8a050', atchi: '#f0c9a0' };

const PLAYER_HEARTS = 3;
const WALK = 4.5, RUN = 8;
const WRONG_TREAT_STOP = 3; // 好物じゃないオヤツで止まる秒数

// ---------------------------------------------------------------------------
// 基本のしくみ
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#a9d6f5');
scene.fog = new THREE.Fog('#a9d6f5', 120, 520);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 1500);
camera.rotation.order = 'YXZ';

scene.add(new THREE.HemisphereLight('#ffffff', '#6b8a4a', 1.6));
const sun = new THREE.DirectionalLight('#fff3dc', 2.2);
sun.position.set(-60, 120, 40);
scene.add(sun);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------------------
// 読み込み
// ---------------------------------------------------------------------------
const manager = new THREE.LoadingManager();
manager.onProgress = (_url, done, total) => { $('loading').querySelector('.bar div').style.width = (done / total * 100) + '%'; };
const loader = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);
const load = (url) => new Promise((res, rej) => loader.load(url, res, undefined, rej));

const groundMeshes = [];
const blockers = []; // 木の幹やトイレなど、通り抜けられない物（XZ の箱）

async function loadStage() {
  const gltf = await load('lite/stage.glb');
  const stage = gltf.scene;
  scene.add(stage);
  stage.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const pad = 20;
  stage.traverse((o) => {
    if (!o.isMesh) return;
    box.setFromObject(o);
    const inArena = box.max.x > ARENA.minX - pad && box.min.x < ARENA.maxX + pad && box.max.z > ARENA.minZ - pad && box.min.z < ARENA.maxZ + pad;
    if (!inArena) return;
    groundMeshes.push(o);
    const sx = box.max.x - box.min.x, sz = box.max.z - box.min.z;
    // 公園の地面（z≈-2.2）から 1.2m 以上立っている小さめの物は壁あつかい
    if (box.min.y < -1.5 && box.max.y > -1.0 && sx < 12 && sz < 12) {
      blockers.push({ minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z, top: box.max.y });
    }
  });
}

const ray = new THREE.Raycaster();
const DOWN = new THREE.Vector3(0, -1, 0);
const tmpV = new THREE.Vector3();
// (x, z) の地面の高さ。fromY より下で一番上の面。見つからなければ null
function groundAt(x, z, fromY) {
  ray.set(tmpV.set(x, fromY, z), DOWN);
  ray.far = 30;
  const hit = ray.intersectObjects(groundMeshes, false)[0];
  return hit ? hit.point.y : null;
}

function pushOut(pos, radius, feetY) {
  for (const b of blockers) {
    if (b.top < feetY + 0.4) continue; // 乗り越えられる高さ
    const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
    const dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2);
      pos.x = cx + dx / d * radius;
      pos.z = cz + dz / d * radius;
    } else {
      // 箱の中に入ってしまったら一番近い辺へ
      const opts = [[b.minX - radius - pos.x, 0], [b.maxX + radius - pos.x, 0], [0, b.minZ - radius - pos.z], [0, b.maxZ + radius - pos.z]];
      opts.sort((a, c) => Math.abs(a[0] + a[1]) - Math.abs(c[0] + c[1]));
      pos.x += opts[0][0]; pos.z += opts[0][1];
    }
  }
  pos.x = Math.max(ARENA.minX, Math.min(ARENA.maxX, pos.x));
  pos.z = Math.max(ARENA.minZ, Math.min(ARENA.maxZ, pos.z));
}

// キャラ: glb を読んでおく（同じ子を何体も出せるよう、出すたびに複製する）
async function loadProto(id) {
  const c = CHARS[id];
  const gltf = await load(`lite/${id}.glb`);
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const s = c.height / (box.max.y - box.min.y);
  return { id, ...c, gltf, s, footY: -box.min.y * s };
}

// 足の裏が 0・見せ寸の高さになる入れ物に入れる
function buildChar(proto) {
  const model = cloneSkinned(proto.gltf.scene);
  model.traverse((o) => { if (o.isSkinnedMesh || o.isMesh) o.frustumCulled = false; });
  model.scale.setScalar(proto.s);
  model.position.y = proto.footY;
  const root = new THREE.Group();
  const body = new THREE.Group(); // 揺れや傾きはこちらにかける
  body.add(model);
  root.add(body);
  const mixer = new THREE.AnimationMixer(model);
  const clips = Object.fromEntries(proto.gltf.animations.map((a) => [a.name, a]));
  const bones = {};
  model.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  const ch = { id: proto.id, name: proto.name, kind: proto.kind, height: proto.height, fav: proto.fav, root, body, model, mixer, clips, bones, action: null };
  ch.label = textSprite(`${ch.name}　すき: ${TREATS[ch.fav].name}`, { size: 36 });
  root.add(ch.label);
  // 食べているオヤツ（足元の前）
  ch.treat = makeTreatMesh(ch.fav);
  ch.treat.position.set(0, 0.05, 0.45);
  ch.treat.visible = false;
  root.add(ch.treat);
  return ch;
}

function play(ch, name, speed = 1) {
  const clip = ch.clips[name] || ch.clips.idle;
  const next = ch.mixer.clipAction(clip);
  next.timeScale = speed;
  if (ch.action === next) return;
  next.reset().fadeIn(0.25).play();
  if (ch.action) ch.action.fadeOut(0.25);
  ch.action = next;
}

// ---------------------------------------------------------------------------
// 絵（オヤツ・吹き出し・ハート）
// ---------------------------------------------------------------------------
function makeTreatMesh(key) {
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 });
  if (key === 'mikan') {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), mat('#ff9a1f'));
    m.scale.y = 0.85; g.add(m);
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), mat('#3f9a3a'));
    leaf.scale.set(1.4, 0.4, 0.8); leaf.position.y = 0.1; g.add(leaf);
  } else if (key === 'senbei') {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.035, 20), mat('#b9772f'));
    g.add(m);
    const nori = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.037, 0.28), mat('#1e2a1c'));
    g.add(nori);
  } else if (key === 'manju') {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), mat('#f3e3c3'));
    m.scale.y = 0.6; g.add(m);
    const mark = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.01, 12), mat('#8a4a2a'));
    mark.position.y = 0.07; g.add(mark);
  } else if (key === 'shirasu') {
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.03, 20), mat('#3b6fb6'));
    g.add(plate);
    for (let i = 0; i < 14; i++) {
      const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.008, 0.05, 2, 4), mat('#f4f7f8'));
      f.position.set((Math.random() - 0.5) * 0.14, 0.03 + Math.random() * 0.03, (Math.random() - 0.5) * 0.14);
      f.rotation.set(Math.PI / 2, 0, Math.random() * Math.PI);
      g.add(f);
    }
  } else {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), mat('#6b3a1e'));
    m.scale.set(1.2, 0.45, 0.9); g.add(m);
    const sauce = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), mat('#8a1f10'));
    sauce.scale.set(1.2, 0.2, 0.9); sauce.position.y = 0.045; g.add(sauce);
  }
  return g;
}

function textSprite(text, { color = '#3a2a1a', bg = 'rgba(255,248,236,.92)', size = 44 } = {}) {
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d');
  const font = `bold ${size}px "Hiragino Maru Gothic ProN","Yu Gothic","Meiryo",sans-serif`;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + size;
  cv.width = w; cv.height = size * 1.6;
  ctx.font = font;
  if (bg) {
    ctx.fillStyle = bg; ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.roundRect(3, 3, w - 6, cv.height - 6, 18); ctx.fill(); ctx.stroke();
  }
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, cv.height / 2 + 2);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  const h = 0.32;
  sp.scale.set(h * w / cv.height, h, 1);
  sp.renderOrder = 10;
  return sp;
}

const floaters = []; // ふわっと上がって消えるもの
function floatUp(sprite, pos, life = 1.4) {
  sprite.position.copy(pos);
  scene.add(sprite);
  floaters.push({ sprite, life, t: 0, vx: (Math.random() - 0.5) * 0.4 });
}
const heartTex = (() => { const s = textSprite('♥', { color: '#ff4f7b', bg: null, size: 64 }); return s.material.map; })();
function heart(pos) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTex, transparent: true, depthTest: false }));
  sp.scale.set(0.35, 0.35, 1);
  floatUp(sp, pos, 1.2);
}

// ---------------------------------------------------------------------------
// 音（WebAudio で作る簡単な音）
// ---------------------------------------------------------------------------
let actx = null;
function beep(freq, dur, type = 'square', vol = 0.12, slide = 0) {
  actx ??= new AudioContext();
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.value = freq;
  if (slide) o.frequency.linearRampToValueAtTime(freq + slide, actx.currentTime + dur);
  g.gain.setValueAtTime(vol, actx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
  o.connect(g).connect(actx.destination);
  o.start(); o.stop(actx.currentTime + dur);
}
const sfx = {
  throw: () => beep(500, 0.12, 'triangle', 0.15, 300),
  yum: () => { beep(660, 0.1, 'square', 0.08); setTimeout(() => beep(880, 0.1, 'square', 0.08), 90); setTimeout(() => beep(1320, 0.18, 'square', 0.08), 180); },
  pickup: () => { beep(784, 0.08, 'square', 0.08); setTimeout(() => beep(1047, 0.12, 'square', 0.08), 70); },
  nope: () => beep(220, 0.25, 'sawtooth', 0.08, -80),
  hurt: () => beep(160, 0.35, 'sawtooth', 0.15, -100),
  growl: () => beep(90, 0.4, 'sawtooth', 0.05, 30),
  win: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.25, 'square', 0.09), i * 150)),
};

// ---------------------------------------------------------------------------
// ゲームの状態
// ---------------------------------------------------------------------------
const chars = {};
const player = { pos: new THREE.Vector3(), vy: 0, onGround: true, hearts: PLAYER_HEARTS, invuln: 0, char: null, eye: 1 };
let enemies = [];
let flying = [];   // 飛んでいるオヤツ
let dropped = [];  // 地面に落ちたオヤツ
let treatIdx = 0;
let mode = 'loading'; // loading / select / play / pause / result
let elapsed = 0;
let throwCool = 0;
let wave = 0, score = 0, ammo = 0, combo = 0, comboT = 0, nextWaveT = -1;
let boxes = [];
let portraitWait = 0;
const protos = {};
const portraits = {};
const keys = {};

function setTreat(i) {
  treatIdx = (i + TREAT_KEYS.length) % TREAT_KEYS.length;
  document.querySelectorAll('.treat').forEach((el, j) => el.classList.toggle('on', j === treatIdx));
  refreshViewTreat();
}

// ---------------------------------------------------------------------------
// 手元（画面の右下に、自分の手とオヤツを見せる）
// ---------------------------------------------------------------------------
const view = new THREE.Group();
const holder = new THREE.Group();
view.add(holder);
camera.add(view);
scene.add(camera);
view.visible = false;
let viewTreat = null, viewKick = 0;
function overlay(obj) {
  obj.traverse((o) => { if (o.isMesh) { o.renderOrder = 999; o.material.depthTest = false; o.material.depthWrite = false; } });
}
function refreshViewTreat() {
  if (viewTreat) holder.remove(viewTreat);
  viewTreat = makeTreatMesh(TREAT_KEYS[treatIdx]);
  viewTreat.position.set(0, 0.11, -0.02);
  viewTreat.scale.setScalar(0.75);
  overlay(viewTreat);
  holder.add(viewTreat);
}
function buildView(ch) {
  holder.clear();
  const skin = new THREE.MeshStandardMaterial({ color: SKIN[ch.id], roughness: 0.8 });
  const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.22, 4, 10), skin);
  arm.rotation.x = -Math.PI / 2;
  arm.position.set(0, 0, 0.17);
  const paw = new THREE.Mesh(new THREE.SphereGeometry(0.065, 14, 10), skin);
  holder.add(arm, paw);
  overlay(holder);
  viewTreat = null;
  refreshViewTreat();
}
function updateView(dt, t, moving) {
  viewKick = Math.max(0, viewKick - dt * 4);
  const k = Math.sin(viewKick * Math.PI / 1.0) ;
  const sway = moving ? Math.sin(t * 10) * 0.012 : Math.sin(t * 2) * 0.004;
  holder.position.set(0.24, -0.26 + sway, -0.55 - k * 0.3);
  holder.rotation.set(0.3 - k * 0.7, 0.12, 0);
}

function toast(text, ms = 1400) {
  const el = $('toast');
  el.textContent = text; el.style.opacity = 1;
  clearTimeout(toast.t); toast.t = setTimeout(() => (el.style.opacity = 0), ms);
}

function updateHud() {
  $('hearts').textContent = '♥'.repeat(player.hearts) + '♡'.repeat(PLAYER_HEARTS - player.hearts);
  const fed = enemies.filter((e) => e.state === 'eat').length;
  $('wave').textContent = `ウェーブ ${wave} / ${WAVES.length}`;
  $('fed').textContent = `夢中: ${fed} / ${enemies.length}`;
  $('score').textContent = `${score} 点` + (combo > 1 && comboT > 0 ? `　${combo}コンボ！` : '');
  $('time').textContent = `${elapsed.toFixed(1)} 秒`;
  $('ammo').innerHTML = `オヤツ <b>×${ammo}</b>`;
  $('ammo').classList.toggle('low', ammo <= 2);
}

// 顔写真（キャラ選びで並べた状態から、顔だけを撮る）
const portraitRT = new THREE.WebGLRenderTarget(160, 160);
portraitRT.texture.colorSpace = THREE.SRGBColorSpace;
function makePortrait(ch) {
  const size = 160;
  const saved = scene.children.map((o) => [o, o.visible]);
  const bg = scene.background, fog = scene.fog;
  scene.children.forEach((o) => { if (!o.isLight) o.visible = false; });
  ch.root.visible = true; ch.label.visible = false;
  scene.background = new THREE.Color('#cfe8fb'); scene.fog = null;
  const cam = new THREE.PerspectiveCamera(28, 1, 0.05, 50);
  const p = ch.root.position, h = ch.height;
  cam.position.set(p.x, p.y + h * 0.82, p.z + h * 1.1);
  cam.lookAt(p.x, p.y + h * 0.82, p.z);
  renderer.setRenderTarget(portraitRT);
  renderer.render(scene, cam);
  renderer.setRenderTarget(null);
  saved.forEach(([o, v]) => { o.visible = v; });
  scene.background = bg; scene.fog = fog;
  const buf = new Uint8Array(size * size * 4);
  renderer.readRenderTargetPixels(portraitRT, 0, 0, size, size, buf);
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) img.data.set(buf.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
  ctx.putImageData(img, 0, 0);
  return cv.toDataURL('image/png');
}

// ---------------------------------------------------------------------------
// キャラ選び: 公園に全員を並べて見せる
// ---------------------------------------------------------------------------
const LINEUP = ['yuma', 'poodle', 'pome', 'ponneko', 'atchi'];
function showSelect() {
  mode = 'select';
  $('select').classList.remove('hidden');
  $('hud').classList.add('hidden');
  $('result').classList.add('hidden');
  view.visible = false;
  for (const e of enemies) scene.remove(e.root);
  enemies = [];
  const cx = SPAWN.x, cz = SPAWN.z - 6;
  LINEUP.forEach((id, i) => {
    const ch = chars[id];
    ch.root.visible = true;
    ch.body.rotation.set(0, 0, 0);
    ch.body.position.set(0, 0, 0);
    ch.label.visible = false;
    ch.treat.visible = false;
    const x = cx + (i - 2) * 1.9;
    ch.root.position.set(x, groundAt(x, cz, 5) ?? -2.2, cz);
    ch.root.rotation.y = 0; // +Z（カメラ側）を向く
    play(ch, 'idle');
  });
  const gy = groundAt(cx, cz + 6, 5) ?? -2.2;
  camera.position.set(cx, gy + 1.4, cz + 6.2);
  camera.rotation.set(-0.08, 0, 0);
  const cards = $('cards');
  cards.innerHTML = '';
  for (const id of LINEUP.filter((k) => CHARS[k].playable)) {
    const c = CHARS[id];
    const el = document.createElement('div');
    el.className = 'card';
    el.innerHTML = `<img data-id="${id}" ${portraits[id] ? `src="${portraits[id]}"` : ''} alt=""><b>${c.name}</b><small>${c.kind}</small>`;
    el.onmouseenter = () => play(chars[id], 'wave');
    el.onmouseleave = () => play(chars[id], 'idle');
    el.onclick = () => startGame(id);
    cards.appendChild(el);
  }
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function startGame(id) {
  $('select').classList.add('hidden');
  $('result').classList.add('hidden');
  $('hud').classList.remove('hidden');
  player.char = chars[id];
  LINEUP.forEach((k) => { chars[k].root.visible = false; });
  player.eye = player.char.height * 0.92;
  player.pos.copy(SPAWN);
  player.pos.y = groundAt(SPAWN.x, SPAWN.z, 5) ?? -2.2;
  player.vy = 0; player.hearts = PLAYER_HEARTS; player.invuln = 0;
  camera.rotation.set(0, 0, 0); // 北（-Z）を向く
  for (const t of [...flying, ...dropped]) scene.remove(t.mesh);
  for (const e of enemies) scene.remove(e.root);
  flying = []; dropped = []; enemies = [];
  elapsed = 0; score = 0; combo = 0; comboT = 0; nextWaveT = -1;
  ammo = AMMO_START - AMMO_PER_WAVE; // 第1波の開始で AMMO_PER_WAVE 足される
  if (portraits[id]) $('meFace').src = portraits[id];
  $('meName').textContent = player.char.name;
  buildView(player.char);
  view.visible = true;
  setupBoxes();
  startWave(1);
  mode = 'pause';
  $('pause').classList.remove('hidden');
}

function spawnEnemy(id, n) {
  const ch = buildChar(protos[id]);
  scene.add(ch.root);
  let x, z, tries = 0;
  do {
    const a = Math.random() * Math.PI * 2, r = 24 + Math.random() * 10;
    x = player.pos.x + Math.sin(a) * r; z = player.pos.z + Math.cos(a) * r; tries++;
  } while (tries < 40 && (x < ARENA.minX + 2 || x > ARENA.maxX - 2 || z < ARENA.minZ + 2 || z > ARENA.maxZ - 2 || groundAt(x, z, 3) === null));
  if (tries >= 40) { x = player.pos.x; z = Math.max(ARENA.minZ + 2, player.pos.z - 25); }
  ch.root.position.set(x, groundAt(x, z, 3) ?? -2.2, z);
  ch.state = 'chase';
  ch.stopT = 0; ch.lungeT = 0; ch.nextLunge = 2 + Math.random() * 3;
  ch.phase = Math.random() * 10;
  ch.speed = (id === 'atchi' ? 2.0 : 2.4 + Math.random() * 0.4) * (1 + 0.1 * (n - 1));
  ch.heartT = 0;
  play(ch, id === 'atchi' ? 'walk_original' : 'walk', 1.6);
  return ch;
}

function startWave(n) {
  wave = n;
  for (const e of enemies) scene.remove(e.root);
  const others = shuffle(LINEUP.filter((k) => k !== player.char.id));
  enemies = [];
  for (let i = 0; i < WAVES[n - 1]; i++) enemies.push(spawnEnemy(others[i % others.length], n));
  ammo = Math.min(AMMO_MAX, ammo + AMMO_PER_WAVE);
  if (n > 1 && player.hearts < PLAYER_HEARTS) player.hearts++;
  setTreat(TREAT_KEYS.indexOf(enemies[0].fav));
  toast(n === 1 ? '好物をあげてとめよう！' : `ウェーブ ${n}！ ${enemies.length}人くるよ`, 2500);
  updateHud();
}

function waveCleared() {
  if (nextWaveT > 0) return;
  score += 200;
  toast(wave >= WAVES.length ? '全ウェーブクリア！ +200' : `ウェーブ ${wave} クリア！ +200`, 2500);
  nextWaveT = wave >= WAVES.length ? 1.5 : 3;
  updateHud();
}

// オヤツ箱: 近くを通るとオヤツがふえる
function makeBoxMesh() {
  const g = new THREE.Group();
  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.45, 0.6), new THREE.MeshStandardMaterial({ color: '#c98a4b', roughness: 0.8 }));
  crate.position.y = 0.225;
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.12, 0.62), new THREE.MeshStandardMaterial({ color: '#ffd23f', roughness: 0.6 }));
  band.position.y = 0.3;
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 14, 16, 1, true), new THREE.MeshBasicMaterial({ color: '#ffe36a', transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
  beacon.position.y = 7;
  const tag = textSprite('オヤツ箱', { size: 40 });
  tag.position.y = 1.1;
  g.add(crate, band, beacon, tag);
  g.userData.crate = crate;
  return g;
}
function placeBox(b) {
  let x, z, tries = 0;
  do {
    const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 16;
    x = player.pos.x + Math.sin(a) * r; z = player.pos.z + Math.cos(a) * r; tries++;
  } while (tries < 40 && (x < ARENA.minX + 2 || x > ARENA.maxX - 2 || z < ARENA.minZ + 2 || z > ARENA.maxZ - 2 || groundAt(x, z, 3) === null));
  b.mesh.position.set(x, groundAt(x, z, 3) ?? -2.2, z);
  b.mesh.visible = true;
  b.respawn = 0;
}
function setupBoxes() {
  for (const b of boxes) scene.remove(b.mesh);
  boxes = [];
  for (let i = 0; i < BOX_COUNT; i++) {
    const b = { mesh: makeBoxMesh(), respawn: 0 };
    scene.add(b.mesh);
    placeBox(b);
    boxes.push(b);
  }
}
function updateBoxes(dt, t) {
  for (const b of boxes) {
    if (b.respawn > 0) { b.respawn -= dt; if (b.respawn <= 0) placeBox(b); continue; }
    b.mesh.userData.crate.rotation.y = t * 1.5;
    const p = b.mesh.position;
    if (ammo < AMMO_MAX && Math.hypot(player.pos.x - p.x, player.pos.z - p.z) < 1.5 && Math.abs(player.pos.y - p.y) < 2) {
      ammo = Math.min(AMMO_MAX, ammo + AMMO_PER_BOX);
      b.mesh.visible = false; b.respawn = 8;
      sfx.pickup();
      toast(`オヤツ +${AMMO_PER_BOX}`, 1000);
      updateHud();
    }
  }
}

function endGame(win) {
  mode = 'result';
  document.exitPointerLock?.();
  view.visible = false;
  for (const b of boxes) b.mesh.visible = false;
  $('pause').classList.add('hidden');
  $('hud').classList.add('hidden');
  $('result').classList.remove('hidden');
  $('resultTitle').textContent = win ? 'みんなオヤツに夢中！' : 'つかまった〜！';
  let best = 0;
  try { best = +localStorage.getItem('dogfps.best') || 0; if (score > best) { best = score; localStorage.setItem('dogfps.best', String(score)); } } catch { best = Math.max(best, score); }
  $('resultText').innerHTML = (win
    ? `${player.char.name}の勝ち！　${WAVES.length} ウェーブぜんぶクリア（${elapsed.toFixed(1)} 秒）`
    : `ウェーブ ${wave} でつかまった…（${elapsed.toFixed(1)} 秒）`)
    + `<br><b style="font-size:24px">${score} 点</b>　ベスト ${best} 点`;
  if (win) sfx.win(); else sfx.hurt();
}
$('again').onclick = () => showSelect();

// ---------------------------------------------------------------------------
// 操作
// ---------------------------------------------------------------------------
const canvas = renderer.domElement;
$('pause').addEventListener('click', () => canvas.requestPointerLock());
canvas.addEventListener('click', () => { if (mode === 'pause') canvas.requestPointerLock(); });
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) {
    if (mode === 'pause') { mode = 'play'; $('pause').classList.add('hidden'); }
  } else if (mode === 'play') {
    mode = 'pause'; $('pause').classList.remove('hidden');
  }
});
document.addEventListener('mousemove', (e) => {
  if (mode !== 'play') return;
  camera.rotation.y -= e.movementX * 0.0022;
  camera.rotation.x = Math.max(-1.4, Math.min(1.4, camera.rotation.x - e.movementY * 0.0022));
});
document.addEventListener('mousedown', (e) => { if (mode === 'play' && e.button === 0) throwTreat(); });
document.addEventListener('wheel', (e) => { if (mode === 'play') setTreat(treatIdx + Math.sign(e.deltaY)); });
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (mode === 'play' && /^Digit[1-5]$/.test(e.code)) setTreat(+e.code.slice(5) - 1);
});
addEventListener('keyup', (e) => { keys[e.code] = false; });

const fwd = new THREE.Vector3();
function throwTreat() {
  if (throwCool > 0) return;
  if (ammo <= 0) { throwCool = 0.5; sfx.nope(); toast('オヤツがない！オヤツ箱をさがそう', 1500); return; }
  throwCool = 0.35;
  ammo--; viewKick = 1; updateHud();
  const key = TREAT_KEYS[treatIdx];
  const mesh = makeTreatMesh(key);
  camera.getWorldDirection(fwd);
  mesh.position.copy(camera.position).addScaledVector(fwd, 0.5);
  mesh.position.y -= 0.15;
  const vel = fwd.clone().multiplyScalar(16);
  vel.y += 3.5;
  scene.add(mesh);
  flying.push({ key, mesh, vel, spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, 0) });
  sfx.throw();
}

// ---------------------------------------------------------------------------
// 敵の動き
// ---------------------------------------------------------------------------
const qA = new THREE.Quaternion(), qB = new THREE.Quaternion(), qC = new THREE.Quaternion();
const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3();
// 骨を、子の骨へ向かう向きが worldDir になるように回す（ゾンビの前へ突き出す腕）
function aimBone(bone, child, worldDir, weight) {
  if (!bone || !child) return;
  bone.getWorldPosition(vA);
  child.getWorldPosition(vB);
  vB.sub(vA).normalize();
  qA.setFromUnitVectors(vB, worldDir);
  bone.getWorldQuaternion(qB);
  bone.parent.getWorldQuaternion(qC);
  qA.multiply(qB);
  qC.invert().multiply(qA);
  bone.quaternion.slerp(qC, weight);
  bone.updateMatrixWorld(true);
}

function feed(e, key) {
  if (e.state === 'eat') return;
  if (key === e.fav) {
    e.state = 'eat';
    e.treat.visible = true;
    e.label.visible = false;
    play(e, 'idle', 0.6);
    sfx.yum();
    for (let i = 0; i < 6; i++) heart(e.root.position.clone().add(vC.set((Math.random() - 0.5), e.height + Math.random() * 0.5, (Math.random() - 0.5))));
    combo = comboT > 0 ? combo + 1 : 1; comboT = 4;
    const near = Math.hypot(player.pos.x - e.root.position.x, player.pos.z - e.root.position.z) < 6 ? 50 : 0;
    const pts = 100 + (combo - 1) * 50 + near;
    score += pts;
    floatUp(textSprite(`ナイス！ +${pts}` + (combo > 1 ? `　${combo}コンボ` : ''), { color: '#d1431f', size: 40 }), e.root.position.clone().add(vC.set(0, e.height + 0.9, 0)), 1.8);
    if (enemies.every((x) => x.state === 'eat')) waveCleared();
  } else {
    e.state = 'sniff';
    e.stopT = WRONG_TREAT_STOP;
    play(e, 'idle', 1.5);
    sfx.nope();
    toast(`${e.name}「くんくん…${TREATS[key].name}じゃない！」`);
  }
  updateHud();
}

function updateEnemy(e, dt, t) {
  e.mixer.update(dt);
  const p = e.root.position;
  const toPlayer = vA.set(player.pos.x - p.x, 0, player.pos.z - p.z);
  const dist = toPlayer.length();
  e.label.position.set(0, e.height + 0.35, 0);

  if (e.state === 'eat') {
    // 座り込んで、頭を上下させて食べ続ける
    e.body.rotation.set(0.45 + Math.sin(t * 9 + e.phase) * 0.12, 0, 0);
    e.body.position.y = -e.height * 0.12;
    e.heartT -= dt;
    if (e.heartT <= 0) { e.heartT = 0.6; heart(p.clone().add(vB.set(0, e.height, 0))); }
    return;
  }
  if (e.state === 'sniff') {
    e.stopT -= dt;
    e.body.rotation.set(0.3, Math.sin(t * 6) * 0.4, 0);
    if (e.stopT <= 0) { e.state = 'chase'; play(e, e.id === 'atchi' ? 'walk_original' : 'walk', 1.6); }
    return;
  }
  if (e.state === 'back') {
    e.stopT -= dt;
    p.addScaledVector(toPlayer.normalize(), -1.5 * dt);
    if (e.stopT <= 0) e.state = 'chase';
  }

  // ゾンビ歩き: 左右にぐらぐら・前のめり・ときどきガバッと飛びかかる
  e.nextLunge -= dt;
  if (e.nextLunge <= 0 && dist < 18 && e.state === 'chase') {
    e.lungeT = 0.7; e.nextLunge = 3 + Math.random() * 3;
    sfx.growl();
    floatUp(textSprite(e.id === 'atchi' ? 'まてぇ〜' : 'ウガーッ', { size: 40 }), p.clone().add(vB.set(0, e.height + 0.6, 0)), 1);
  }
  e.lungeT = Math.max(0, e.lungeT - dt);
  const lurch = 0.45 + 0.9 * Math.max(0, Math.sin(t * 2.6 + e.phase));
  const speed = e.speed * (e.lungeT > 0 ? 2.6 : lurch);
  if (e.state === 'chase' && dist > 0.6) {
    toPlayer.normalize();
    p.addScaledVector(toPlayer, speed * dt);
  }
  e.root.rotation.y = Math.atan2(player.pos.x - p.x, player.pos.z - p.z);
  const sway = Math.sin(t * 3.2 + e.phase);
  e.body.rotation.set(0.22 + (e.lungeT > 0 ? 0.25 : 0), 0, sway * 0.28);
  e.body.position.y = Math.abs(Math.sin(t * 6.4 + e.phase)) * 0.08;

  // 犬たちは両腕を前へ突き出す（あっちは腕を上げない決まりなのでそのまま）
  if (e.id !== 'atchi') {
    const b = e.bones;
    e.root.getWorldDirection(vC); // +Z が正面
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? 1 : -1;
      const dir = vB.copy(vC).multiplyScalar(1).add(vA.set(0, -0.15 + Math.sin(t * 5 + s) * 0.12, 0));
      // キャラの左右（+X が左）へ少し開く
      dir.add(new THREE.Vector3(Math.cos(e.root.rotation.y), 0, -Math.sin(e.root.rotation.y)).multiplyScalar(0.18 * s)).normalize();
      aimBone(b[`upper_arm.${side}`], b[`forearm.${side}`], dir, 0.9);
      aimBone(b[`forearm.${side}`], b[`hand.${side}`], dir, 0.9);
    }
  }

  // 周りとの押し合い
  for (const o of enemies) {
    if (o === e) continue;
    const dx = p.x - o.root.position.x, dz = p.z - o.root.position.z;
    const d = Math.hypot(dx, dz);
    if (d > 0 && d < 0.9) { p.x += dx / d * (0.9 - d) * 0.5; p.z += dz / d * (0.9 - d) * 0.5; }
  }
  pushOut(p, 0.35, p.y);
  const gy = groundAt(p.x, p.z, p.y + 0.6);
  if (gy !== null) p.y = gy;

  // つかまえる
  if (dist < 0.8 && e.state === 'chase' && player.invuln <= 0) {
    player.hearts--; player.invuln = 1.5;
    e.state = 'back'; e.stopT = 1.2;
    sfx.hurt();
    const f = $('flash'); f.style.opacity = 0.5; setTimeout(() => (f.style.opacity = 0), 150);
    toast(`${e.name}につかまった！`);
    updateHud();
    if (player.hearts <= 0) endGame(false);
  }
}

// ---------------------------------------------------------------------------
// 毎フレーム
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
const move = new THREE.Vector3();
function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (mode === 'select') {
    for (const id of LINEUP) chars[id].mixer.update(dt);
  }
  if (mode === 'pause') updateView(dt, t, false);
  // 顔写真は、絵（テクスチャ）が読み終わった数フレーム後に撮る
  if ((mode === 'select' || mode === 'pause') && !portraits.done && ++portraitWait > 20) {
    for (const id of LINEUP) { chars[id].mixer.update(0.3); chars[id].root.updateMatrixWorld(true); }
    for (const id of LINEUP) portraits[id] = makePortrait(chars[id]);
    portraits.done = true;
    document.querySelectorAll('.card img').forEach((im) => { im.src = portraits[im.dataset.id]; });
    if (player.char) $('meFace').src = portraits[player.char.id];
  }

  if (mode === 'play') {
    elapsed += dt;
    throwCool -= dt;
    player.invuln -= dt;
    comboT -= dt;
    if (nextWaveT > 0) {
      nextWaveT -= dt;
      if (nextWaveT <= 0) { nextWaveT = -1; if (wave >= WAVES.length) endGame(true); else startWave(wave + 1); }
    }

    // 歩く
    const sp = keys.ShiftLeft || keys.ShiftRight ? RUN : WALK;
    move.set((keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0), 0, (keys.KeyS ? 1 : 0) - (keys.KeyW ? 1 : 0));
    if (move.lengthSq() > 0) {
      move.normalize().applyAxisAngle(THREE.Object3D.DEFAULT_UP, camera.rotation.y).multiplyScalar(sp * dt);
      const nx = player.pos.x + move.x, nz = player.pos.z + move.z;
      const gy = groundAt(nx, nz, player.pos.y + 0.6);
      if (gy !== null) { player.pos.x = nx; player.pos.z = nz; }
    }
    pushOut(player.pos, 0.3, player.pos.y);
    if (keys.Space && player.onGround) { player.vy = 5; player.onGround = false; }
    player.vy -= 14 * dt;
    player.pos.y += player.vy * dt;
    const gy = groundAt(player.pos.x, player.pos.z, player.pos.y + 0.6);
    if (gy !== null && player.pos.y <= gy) { player.pos.y = gy; player.vy = 0; player.onGround = true; }
    const bob = player.onGround && move.lengthSq() > 0 ? Math.sin(t * (sp === RUN ? 14 : 10)) * 0.04 : 0;
    camera.position.set(player.pos.x, player.pos.y + player.eye + bob, player.pos.z);

    for (const e of enemies) updateEnemy(e, dt, t);
    updateBoxes(dt, t);
    updateView(dt, t, move.lengthSq() > 0);

    // 飛んでいるオヤツ
    for (const f of flying) {
      f.vel.y -= 9.8 * dt;
      f.mesh.position.addScaledVector(f.vel, dt);
      f.mesh.rotation.x += f.spin.x * dt; f.mesh.rotation.y += f.spin.y * dt;
      const fp = f.mesh.position;
      for (const e of enemies) {
        if (e.state === 'eat') continue;
        const ep = e.root.position;
        if (Math.hypot(fp.x - ep.x, fp.z - ep.z) < 0.55 && fp.y > ep.y - 0.1 && fp.y < ep.y + e.height + 0.2) {
          feed(e, f.key); f.done = true; break;
        }
      }
      if (f.done) { scene.remove(f.mesh); continue; }
      const g = groundAt(fp.x, fp.z, fp.y + 0.3);
      if (g !== null && fp.y <= g + 0.05) {
        fp.y = g + 0.05; f.mesh.rotation.set(0, Math.random() * 6, 0);
        dropped.push({ key: f.key, mesh: f.mesh, life: 12 });
        f.done = true;
      } else if (fp.y < -30) { scene.remove(f.mesh); f.done = true; }
    }
    flying = flying.filter((f) => !f.done);

    // 落ちたオヤツ: 近くを通った子はにおいで気づく
    for (const d of dropped) {
      d.life -= dt;
      for (const e of enemies) {
        if (e.state !== 'chase' || d.life <= 0) continue;
        if (e.root.position.distanceTo(d.mesh.position) < 1.1) { feed(e, d.key); if (e.state === 'eat' || e.state === 'sniff') d.life = e.state === 'eat' ? 0 : d.life; }
      }
      if (d.life <= 0) scene.remove(d.mesh);
    }
    dropped = dropped.filter((d) => d.life > 0);
    if (Math.floor(elapsed * 10) !== Math.floor((elapsed - dt) * 10)) updateHud();
  }

  for (const fl of floaters) {
    fl.t += dt;
    fl.sprite.position.y += dt * 0.8;
    fl.sprite.position.x += fl.vx * dt;
    fl.sprite.material.opacity = 1 - fl.t / fl.life;
    if (fl.t >= fl.life) scene.remove(fl.sprite);
  }
  for (let i = floaters.length - 1; i >= 0; i--) if (floaters[i].t >= floaters[i].life) floaters.splice(i, 1);

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

// ---------------------------------------------------------------------------
// はじめ
// ---------------------------------------------------------------------------
async function main() {
  const [, ...list] = await Promise.all([loadStage(), ...LINEUP.map(loadProto)]);
  for (const p of list) {
    protos[p.id] = p;
    chars[p.id] = buildChar(p);
    scene.add(chars[p.id].root);
  }
  $('treats').innerHTML = TREAT_KEYS.map((k, i) => `<div class="treat"><i style="background:${TREATS[k].color}"></i>${i + 1} ${TREATS[k].name}</div>`).join('');
  $('loading').classList.add('hidden');
  showSelect();
  requestAnimationFrame(tick);
}
main().catch((err) => {
  console.error(err);
  $('loadmsg').textContent = '読み込みに失敗しました: ' + err.message + '（index.html を直接開かず、start の手順でサーバーから開いてください）';
});

// 動作確認用（ブラウザのコンソールから触れる）
window.__game = { portraits, chars, player, startWave, get score() { return score; }, get ammo() { return ammo; }, set ammo(v) { ammo = v; }, get wave() { return wave; }, get boxes() { return boxes; }, throwTreat, setTreat, get enemies() { return enemies; }, startGame, showSelect, feed, get mode() { return mode; }, set mode(v) { mode = v; }, camera };
