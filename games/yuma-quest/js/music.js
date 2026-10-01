// BGM / 効果音。外部の音源は使わず、Web Audio で自作したシンセを鳴らす（著作権フリー）。
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ---- 楽譜（すべてオリジナル）。[midi, 拍] の並びで、midi=null は休符 ----
const seq = (notes) => {
  let b = 0;
  return notes.map(([m, d]) => { const e = { b, m, d }; b += d; return e; });
};
const chordsOf = (list) => list.map((c, i) => ({ b: i * 4, c }));

const C = (r) => [r, r + 4, r + 7];
const F = (r) => [r, r + 4, r + 7];

const TRACKS = {
  // 王様の間〜城の外へ：荘厳な行進曲（16小節）
  royal: {
    bpm: 92, beats: 64,
    melody: seq([
      [60, 1], [64, 1], [67, 1], [72, 1],            // 1
      [76, 2], [74, 1], [72, 1],                     // 2
      [69, 1], [72, 1], [77, 1.5], [76, 0.5],        // 3
      [74, 3], [67, 1],                              // 4
      [72, 1], [71, 0.5], [72, 0.5], [74, 1], [76, 1],// 5
      [79, 2], [76, 1], [72, 1],                     // 6
      [77, 1.5], [76, 0.5], [74, 1], [71, 1],        // 7
      [72, 4],                                       // 8
      [76, 1.5], [74, 0.5], [72, 1], [69, 1],        // 9  Am
      [72, 1.5], [69, 0.5], [65, 2],                 // 10 F
      [74, 1], [76, 1], [77, 1], [79, 1],            // 11 G
      [76, 2], [72, 2],                              // 12 C
      [81, 1.5], [79, 0.5], [76, 1], [72, 1],        // 13 Am
      [77, 1.5], [76, 0.5], [72, 1], [69, 1],        // 14 F
      [74, 1], [79, 1], [83, 1], [86, 1],            // 15 G
      [84, 4],                                       // 16 C
    ]),
    chords: chordsOf([
      [48, 55, 64], [48, 55, 64], [53, 57, 65], [55, 59, 67],
      [48, 55, 64], [48, 55, 64], [53, 57, 65], [55, 59, 62],
      [45, 57, 64], [41, 57, 65], [43, 59, 67], [48, 55, 64],
      [45, 57, 64], [41, 57, 65], [43, 59, 67], [48, 55, 64],
    ]),
    bass: [48, 48, 41, 43, 48, 48, 41, 43, 45, 41, 43, 48, 45, 41, 43, 36],
    timp: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60, 61, 62, 63],
  },
  // オヤツ発見：はずむジングル（4小節ループ）
  snack: {
    bpm: 132, beats: 16,
    melody: seq([
      [76, .5], [79, .5], [84, 1], [79, .5], [76, .5], [79, 1],
      [77, .5], [81, .5], [84, 1], [81, .5], [77, .5], [81, 1],
      [79, .5], [83, .5], [86, 1], [83, .5], [79, .5], [83, 1],
      [84, 1], [79, 1], [76, 1], [72, 1],
    ]),
    chords: chordsOf([[48, 55, 64], [53, 57, 65], [55, 59, 67], [48, 55, 64]]),
    bass: [48, 53, 55, 48],
    bounce: true,
  },
  // エンディング：オルゴール調の子守歌（8小節）
  ending: {
    bpm: 72, beats: 32,
    melody: seq([
      [79, 1], [76, 1], [72, 1], [76, 1],
      [77, 1], [74, 1], [71, 1], [74, 1],
      [76, 1], [79, 1], [84, 1], [79, 1],
      [77, 1], [74, 1], [79, 2],
      [81, 1], [77, 1], [74, 1], [77, 1],
      [79, 1], [76, 1], [72, 1], [76, 1],
      [77, 1], [79, 1], [81, 1], [83, 1],
      [84, 4],
    ]),
    chords: chordsOf([[48, 55, 64], [43, 55, 62], [48, 55, 64], [43, 55, 62], [41, 57, 65], [48, 55, 64], [43, 55, 62], [48, 55, 64]]),
    bass: [48, 43, 48, 43, 41, 48, 43, 48],
    soft: true,
  },
};

export class Music {
  constructor() {
    this.ctx = null;
    this.bus = null;
    this.name = null;
    this.timer = null;
  }

  start() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const ctx = this.ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0.55;
      const comp = ctx.createDynamicsCompressor();
      this.master.connect(comp).connect(ctx.destination);
      // 簡易リバーブ（減衰するノイズ）
      const len = ctx.sampleRate * 2.2;
      const ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
      }
      this.reverb = ctx.createConvolver();
      this.reverb.buffer = ir;
      this.wet = ctx.createGain();
      this.wet.gain.value = 0.35;
      this.reverb.connect(this.wet).connect(this.master);
      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = 0.9;
      this.sfxBus.connect(this.master);
      this.sfxBus.connect(this.reverb);
      const nl = ctx.sampleRate * 0.5;
      this.noise = ctx.createBuffer(1, nl, ctx.sampleRate);
      const nd = this.noise.getChannelData(0);
      for (let i = 0; i < nl; i++) nd[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  // ---- 楽器 ----
  _env(g, t, a, d, s, dur, r, peak) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.linearRampToValueAtTime(peak * s, t + a + d);
    g.gain.setValueAtTime(peak * s, Math.max(t + a + d, t + dur));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + r);
  }
  _osc(type, freq, t, end, detune = 0) {
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.value = freq; o.detune.value = detune;
    o.start(t); o.stop(end);
    return o;
  }
  brass(out, t, m, dur, v = 0.12) {
    const ctx = this.ctx, g = ctx.createGain(), f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(500, t);
    f.frequency.linearRampToValueAtTime(2600, t + 0.09);
    f.frequency.linearRampToValueAtTime(1500, t + dur);
    this._env(g, t, 0.05, 0.12, 0.75, dur, 0.18, v);
    for (const dt of [-7, 7]) this._osc('sawtooth', mtof(m), t, t + dur + 0.3, dt).connect(f);
    f.connect(g).connect(out);
  }
  strings(out, t, notes, dur, v = 0.035) {
    const ctx = this.ctx;
    for (const m of notes) {
      const g = ctx.createGain(), f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 1400;
      this._env(g, t, 0.35, 0.2, 0.85, dur, 0.5, v);
      for (const dt of [-9, 0, 9]) this._osc('sawtooth', mtof(m), t, t + dur + 0.8, dt).connect(f);
      f.connect(g).connect(out);
    }
  }
  bassNote(out, t, m, dur, v = 0.22) {
    const g = this.ctx.createGain();
    this._env(g, t, 0.02, 0.1, 0.7, dur, 0.15, v);
    this._osc('triangle', mtof(m), t, t + dur + 0.3).connect(g);
    this._osc('sine', mtof(m - 12), t, t + dur + 0.3).connect(g);
    g.connect(out);
  }
  pluck(out, t, m, dur = 0.5, v = 0.16, type = 'triangle') {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    this._osc(type, mtof(m), t, t + dur + 0.05).connect(g);
    this._osc('sine', mtof(m + 12), t, t + dur + 0.05).connect(g);
    g.connect(out);
  }
  timp(out, t, v = 0.5) {
    const ctx = this.ctx, g = ctx.createGain();
    const o = this._osc('sine', 120, t, t + 0.7);
    o.frequency.exponentialRampToValueAtTime(52, t + 0.35);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(g).connect(out);
    this._noiseHit(out, t, 0.06, 400, v * 0.3);
  }
  _noiseHit(out, t, dur, freq, v, type = 'lowpass') {
    const ctx = this.ctx, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = this.noise; f.type = type; f.frequency.value = freq;
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(out);
    s.start(t); s.stop(t + dur + 0.05);
  }

  // ---- 曲の再生 ----
  play(name) {
    if (!this.ctx || this.name === name) return;
    this.stop(0.6);
    const tr = TRACKS[name];
    this.name = name;
    this.tr = tr;
    this.bus = this.ctx.createGain();
    this.bus.gain.value = 1;
    this.bus.connect(this.master);
    this.bus.connect(this.reverb);
    this.beat = 60 / tr.bpm;
    this.loopStart = this.ctx.currentTime + 0.15;
    this._schedule();
    this.timer = setInterval(() => this._tick(), 120);
  }
  stop(fade = 0.6) {
    clearInterval(this.timer);
    if (this.bus) {
      const bus = this.bus, t = this.ctx.currentTime;
      bus.gain.setValueAtTime(bus.gain.value, t);
      bus.gain.linearRampToValueAtTime(0, t + fade);
      setTimeout(() => bus.disconnect(), fade * 1000 + 300);
    }
    this.bus = null; this.name = null;
  }
  _tick() {
    const tr = this.tr, len = tr.beats * this.beat;
    if (this.ctx.currentTime + 0.4 > this.loopStart + len) {
      this.loopStart += len;
      this._schedule();
    }
  }
  _schedule() {
    const tr = this.tr, B = this.beat, t0 = this.loopStart, out = this.bus;
    for (const n of tr.melody) {
      if (n.m == null) continue;
      const t = t0 + n.b * B, dur = n.d * B * 0.92;
      if (tr.soft) this.pluck(out, t, n.m, 1.2, 0.2, 'sine');
      else if (tr.bounce) { this.pluck(out, t, n.m, 0.35, 0.16, 'square'); }
      else { this.brass(out, t, n.m, dur); this.brass(out, t, n.m - 12, dur, 0.05); }
    }
    for (const c of tr.chords) {
      const t = t0 + c.b * B;
      if (tr.soft) c.c.forEach((m, i) => this.pluck(out, t + i * 0.18 * B * 2, m, 1.6, 0.08, 'sine'));
      else if (tr.bounce) for (let k = 0; k < 4; k++) { c.c.forEach((m) => this.pluck(out, t + (k + 0.5) * B, m, 0.18, 0.05, 'triangle')); }
      else this.strings(out, t, c.c, 4 * B * 0.98);
    }
    tr.bass.forEach((m, i) => {
      const t = t0 + i * 4 * B;
      if (tr.soft) this.bassNote(out, t, m, 3.5 * B, 0.12);
      else if (tr.bounce) for (let k = 0; k < 4; k++) this.bassNote(out, t + k * B, k % 2 ? m + 7 : m, 0.45 * B, 0.2);
      else { this.bassNote(out, t, m, 2 * B); this.bassNote(out, t + 2 * B, m, 1.8 * B); }
    });
    if (tr.timp) for (const b of tr.timp) this.timp(out, t0 + b * B, b >= 60 ? 0.45 : (b % 4 === 0 ? 0.55 : 0.3));
    if (tr.bounce) for (let b = 0; b < tr.beats * 2; b++) if (b % 2) this._noiseHit(out, t0 + b * B / 2, 0.05, 6000, 0.05, 'highpass');
  }

  // ---- 効果音 ----
  blip(f = 520) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, g = this.ctx.createGain();
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    this._osc('square', f, t, t + 0.06).connect(g).connect(this.sfxBus);
  }
  munch() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._noiseHit(this.sfxBus, t, 0.09, 1800, 0.5);
    this._noiseHit(this.sfxBus, t + 0.12, 0.09, 1200, 0.4);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.15, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    const o = this._osc('sine', 260, t, t + 0.2);
    o.frequency.exponentialRampToValueAtTime(120, t + 0.15);
    o.connect(g).connect(this.sfxBus);
  }
  found() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [72, 76, 79, 84, 88, 91].forEach((m, i) => this.pluck(this.sfxBus, t + i * 0.07, m, 0.6, 0.18, 'triangle'));
  }
  bark() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.25, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 2;
    const o = this._osc('sawtooth', 420, t, t + 0.2);
    o.frequency.exponentialRampToValueAtTime(240, t + 0.16);
    o.connect(f).connect(g).connect(this.sfxBus);
  }
}
