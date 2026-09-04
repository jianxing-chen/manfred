/* 曼弗雷德：遗忘实验 —— 生成音景引擎
 * 纯 Web Audio，无采样：风（带通噪声）、持续低音（失谐振荡器）、
 * 动机音序（每幕一个模式）、钟、合唱垫、心跳脉冲、水声。
 * 各场景 = 层参数组合，切换时交叉淡入淡出。
 */
(function () {
  "use strict";

  const NOTE = { // 十二平均律（A4 = 440）
    B1: 61.74, C2: 65.41, D2: 73.42, E2: 82.41, F2: 87.31, F2s: 92.50, G2: 98.00,
    A2: 110.00, B2: 123.47, C3: 130.81, D3: 146.83, E3: 164.81, F3s: 185.00, G3: 196.00,
    A3: 220.00, B3: 246.94, C4: 261.63, D4: 293.66, E4: 329.63, F4s: 369.99, G4: 392.00,
    A4: 440.00, B4: 493.88, D5: 587.33, F5s: 739.99
  };

  function makeNoiseBuffer(ctx, seconds) {
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  class Reverb {
    constructor(ctx, dryGain) {
      this.input = ctx.createGain();
      this.wet = ctx.createGain();
      this.wet.gain.value = 0.35;
      this.d1 = ctx.createDelay(2.0); this.d1.delayTime.value = 0.311;
      this.d2 = ctx.createDelay(2.0); this.d2.delayTime.value = 0.473;
      this.f1 = ctx.createBiquadFilter(); this.f1.type = "lowpass"; this.f1.frequency.value = 2200;
      this.f2 = ctx.createBiquadFilter(); this.f2.type = "lowpass"; this.f2.frequency.value = 1600;
      this.fb1 = ctx.createGain(); this.fb1.gain.value = 0.42;
      this.fb2 = ctx.createGain(); this.fb2.gain.value = 0.38;
      this.input.connect(dryGain);
      this.input.connect(this.d1); this.d1.connect(this.f1);
      this.f1.connect(this.d2); this.d2.connect(this.f2);
      this.f2.connect(this.fb1); this.fb1.connect(this.d1);
      this.f1.connect(this.fb2); this.fb2.connect(this.d2);
      this.f2.connect(this.wet); this.wet.connect(dryGain);
    }
  }

  class Wind {
    constructor(ctx, dest) {
      this.g = ctx.createGain(); this.g.gain.value = 0;
      this.f = ctx.createBiquadFilter(); this.f.type = "bandpass";
      this.f.frequency.value = 420; this.f.Q.value = 0.7;
      this.noise = ctx.createBufferSource();
      this.noise.buffer = makeNoiseBuffer(ctx, 3);
      this.noise.loop = true;
      this.lfo = ctx.createOscillator(); this.lfo.frequency.value = 0.07;
      this.lfoG = ctx.createGain(); this.lfoG.gain.value = 180;
      this.lfo.connect(this.lfoG); this.lfoG.connect(this.f.frequency);
      this.noise.connect(this.f); this.f.connect(this.g); this.g.connect(dest);
      this.noise.start(); this.lfo.start();
    }
    set(level) { this.g.gain.setTargetAtTime(level, this.ctxTime(), 1.2); }
    ctxTime() { return this.g.context.currentTime; }
  }

  class Drone {
    constructor(ctx, dest) {
      this.ctx = ctx;
      this.g = ctx.createGain(); this.g.gain.value = 0;
      this.oscs = [];
      for (let i = 0; i < 3; i++) {
        const o = ctx.createOscillator(); o.type = i === 2 ? "triangle" : "sawtooth";
        const og = ctx.createGain(); og.gain.value = i === 2 ? 0.12 : 0.2;
        const det = ctx.createOscillator(); det.frequency.value = 0.11 + i * 0.07;
        const detG = ctx.createGain(); detG.gain.value = 1.4 + i;
        det.connect(detG); detG.connect(o.detune); det.start();
        o.connect(og); og.connect(this.g);
        this.oscs.push({ o, og });
      }
      this.lp = ctx.createBiquadFilter(); this.lp.type = "lowpass"; this.lp.frequency.value = 700;
      this.g.connect(this.lp); this.lp.connect(dest);
      this.oscs.forEach(x => x.o.start());
    }
    set(freqs, level) {
      const t = this.ctx.currentTime;
      this.oscs.forEach((x, i) => {
        if (freqs[i] != null) x.o.frequency.setTargetAtTime(freqs[i], t, 0.8);
      });
      this.g.gain.setTargetAtTime(level, t, 1.5);
    }
  }

  class Seq { // 动机音序器
    constructor(ctx, dest, engine) {
      this.ctx = ctx; this.dest = dest; this.engine = engine;
      this.g = ctx.createGain(); this.g.gain.value = 1; this.g.connect(dest);
      this.pattern = null;
      this.level = 0.5;
      this.tick();
    }
    tick() {
      const eng = this.engine;
      if (this.pattern && eng.running && !eng.muted) {
        const notes = this.pattern.notes;
        const idx = this.pattern.i % notes.length; this.pattern.i++;
        const f = notes[idx];
        if (f) this.pluck(f, this.level * (0.55 + Math.random() * 0.45));
      }
      const interval = this.pattern ? this.pattern.ms : 900;
      setTimeout(() => this.tick(), interval * (0.92 + Math.random() * 0.16));
    }
    pluck(freq, vel) {
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator(); o.type = "triangle";
      o.frequency.value = freq;
      const o2 = this.ctx.createOscillator(); o2.type = "sine"; o2.frequency.value = freq * 2; // 八度泛音
      const g = this.ctx.createGain(); const g2 = this.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vel * 0.16, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
      g2.gain.setValueAtTime(0, t);
      g2.gain.linearRampToValueAtTime(vel * 0.045, t + 0.01);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      o.connect(g); o2.connect(g2); g.connect(this.g); g2.connect(this.g);
      o.start(t); o2.start(t); o.stop(t + 2.6); o2.stop(t + 1.3);
    }
    set(pattern, level) {
      if (pattern !== this.pattern) { if (pattern) pattern.i = 0; }
      this.pattern = pattern;
      this.level = level != null ? level : 0.5;
    }
  }

  class Bell {
    constructor(ctx, dest) { this.ctx = ctx; this.dest = dest; }
    strike(freq, vel = 0.5) {
      if (!this.dest.ctx.running) return;
      const t = this.ctx.currentTime;
      [1, 2.01, 2.98, 4.5].forEach((h, i) => {
        const o = this.ctx.createOscillator(); o.frequency.value = freq * h;
        const g = this.ctx.createGain();
        const a = vel * [0.14, 0.07, 0.045, 0.02][i];
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(a, t + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 4.5 - i);
        o.connect(g); g.connect(this.dest.input);
        o.start(t); o.stop(t + 5);
      });
    }
  }

  class Choir {
    constructor(ctx, dest) {
      this.ctx = ctx; this.g = ctx.createGain(); this.g.gain.value = 0;
      this.vces = [];
      for (let i = 0; i < 4; i++) {
        const o = ctx.createOscillator(); o.type = "sine";
        const vib = ctx.createOscillator(); vib.frequency.value = 4.3 + i * 0.4;
        const vibG = ctx.createGain(); vibG.gain.value = 3.5;
        vib.connect(vibG); vibG.connect(o.detune); vib.start();
        const og = ctx.createGain(); og.gain.value = 0.16;
        o.connect(og); og.connect(this.g);
        o.start();
        this.vces.push(o);
      }
      const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 120;
      this.g.connect(hp); hp.connect(dest);
    }
    set(freqs, level) {
      const t = this.ctx.currentTime;
      this.vces.forEach((o, i) => { if (freqs[i] != null) o.frequency.setTargetAtTime(freqs[i], t, 1.2); });
      this.g.gain.setTargetAtTime(level, t, 2.2);
    }
  }

  class Heart {
    constructor(ctx, dest, engine) {
      this.ctx = ctx; this.dest = dest; this.engine = engine;
      this.g = ctx.createGain(); this.g.gain.value = 0; this.g.connect(dest);
      this.timer = null; this.on = false;
    }
    set(level) {
      this.g.gain.setTargetAtTime(level, this.ctx.currentTime, 1.0);
      this.on = level > 0.01;
      if (this.on && !this.timer) this.loop();
      if (!this.on && this.timer) { clearTimeout(this.timer); this.timer = null; }
    }
    loop() {
      const beat = () => {
        if (!this.on || !this.engine.running) return;
        const t = this.ctx.currentTime;
        [0, 0.22].forEach((dt, i) => {
          const o = this.ctx.createOscillator(); o.type = "sine";
          o.frequency.setValueAtTime(58, t + dt);
          const g = this.ctx.createGain();
          g.gain.setValueAtTime(0, t + dt);
          g.gain.linearRampToValueAtTime(i ? 0.4 : 0.62, t + dt + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.3);
          o.connect(g); g.connect(this.g);
          o.start(t + dt); o.stop(t + dt + 0.35);
        });
        this.timer = setTimeout(beat, 1050);
      };
      beat();
    }
  }

  class Water {
    constructor(ctx, dest) {
      this.ctx = ctx;
      this.g = ctx.createGain(); this.g.gain.value = 0;
      this.hp = ctx.createBiquadFilter(); this.hp.type = "highpass"; this.hp.frequency.value = 500;
      this.lp = ctx.createBiquadFilter(); this.lp.type = "lowpass"; this.lp.frequency.value = 5200;
      this.noise = ctx.createBufferSource(); this.noise.buffer = makeNoiseBuffer(ctx, 3); this.noise.loop = true;
      this.lfo = ctx.createOscillator(); this.lfo.frequency.value = 0.16;
      this.lfoG = ctx.createGain(); this.lfoG.gain.value = 900;
      this.lfo.connect(this.lfoG); this.lfoG.connect(this.lp.frequency);
      this.noise.connect(this.hp); this.hp.connect(this.lp); this.lp.connect(this.g); this.g.connect(dest);
      this.noise.start(); this.lfo.start();
    }
    set(level) { this.g.gain.setTargetAtTime(level, this.ctx.currentTime, 1.1); }
  }

  /* 场景预设：层参数组合 */
  const SCENE_AUDIO = {
    overture: { wind: 0.10, drone: { f: [NOTE.B1, NOTE.F2s, null], v: 0.045 }, seq: null, choir: null, heart: 0, water: 0 },
    corridor: { wind: 0.05, drone: { f: [NOTE.B1, NOTE.F2, NOTE.B2], v: 0.06 }, seq: { ms: 2600, notes: [NOTE.B3, NOTE.A3, NOTE.F3s, NOTE.B2, 0, NOTE.F2s, 0, 0] }, choir: null, heart: 0, water: 0 },
    corridorFall: { wind: 0.07, drone: { f: [NOTE.B1, NOTE.F2, NOTE.B2], v: 0.08 }, seq: null, choir: null, heart: 0, water: 0 },
    dawn: { wind: 0.14, drone: { f: [NOTE.B2, NOTE.D3, NOTE.F3s], v: 0.035 }, seq: { ms: 1500, notes: [NOTE.D4, 0, NOTE.F4s, NOTE.E4, NOTE.A3, 0, NOTE.F4s, NOTE.D4] }, choir: null, heart: 0, water: 0 },
    hut: { wind: 0.09, drone: { f: [NOTE.B2, NOTE.D3, NOTE.G3], v: 0.03 }, seq: { ms: 3400, notes: [NOTE.D4, 0, NOTE.B3] }, choir: null, heart: 0, water: 0 },
    waterfall: { wind: 0.10, drone: { f: [NOTE.B2, NOTE.F3s, NOTE.D3], v: 0.03 }, seq: { ms: 950, notes: [NOTE.B3, NOTE.D4, NOTE.F4s, NOTE.B4, NOTE.F4s, NOTE.D4] }, choir: { f: [NOTE.B3, NOTE.D4, NOTE.F4s, NOTE.B4], v: 0.012 }, heart: 0, water: 0.16 },
    palace: { wind: 0.03, drone: { f: [NOTE.B1, NOTE.F2, NOTE.F2s], v: 0.085 }, seq: null, choir: { f: [NOTE.B2, NOTE.C3, NOTE.F2s, NOTE.A3], v: 0.02 }, heart: 0, water: 0 },
    astarte: { wind: 0.02, drone: { f: [NOTE.B1, NOTE.F2s, null], v: 0.05 }, seq: null, choir: { f: [NOTE.B3, NOTE.C4, NOTE.F4s, NOTE.D5], v: 0.05 }, heart: 0, water: 0 },
    midnight: { wind: 0.06, drone: { f: [NOTE.B1, NOTE.B2, null], v: 0.06 }, seq: { ms: 4200, notes: [NOTE.F3s, 0, 0, NOTE.E3, 0, 0] }, choir: null, heart: 0.14, water: 0 },
    demons: { wind: 0.04, drone: { f: [NOTE.B1, NOTE.C2, NOTE.F2s], v: 0.10 }, seq: null, choir: { f: [NOTE.B2, NOTE.C3, NOTE.F2s, NOTE.G3], v: 0.028 }, heart: 0.3, water: 0 },
    snow: { wind: 0.12, drone: { f: [NOTE.B2, NOTE.F3s, null], v: 0.02 }, seq: { ms: 5200, notes: [NOTE.D5, 0, 0] }, choir: { f: [NOTE.B3, NOTE.D4, NOTE.F4s, NOTE.B4], v: 0.016 }, heart: 0, water: 0 },
    off: { wind: 0, drone: { f: [null, null, null], v: 0 }, seq: null, choir: null, heart: 0, water: 0 }
  };

  class Engine {
    constructor() {
      this.ctx = null; this.running = false; this.muted = false;
      this.scene = "off";
    }
    init() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
      this.dry = this.ctx.createGain(); this.dry.gain.value = 1;
      this.dry.connect(this.master);
      this.reverb = new Reverb(this.ctx, this.master);
      this.reverb.input.connect ? null : null;
      // 所有层都汇入 reverb.input（内含干声通路）
      this.wind = new Wind(this.ctx, this.reverb.input);
      this.drone = new Drone(this.ctx, this.reverb.input);
      this.seq = new Seq(this.ctx, this.reverb.input, this);
      this.choir = new Choir(this.ctx, this.reverb.input);
      this.heart = new Heart(this.ctx, this.reverb.input, this);
      this.water = new Water(this.ctx, this.reverb.input);
      this.bell = new Bell(this.ctx, { input: this.master, ctx: this.ctx });
    }
    start() {
      this.init();
      if (this.ctx.state === "suspended") this.ctx.resume();
      this.running = true;
      this.apply(this.scene, true);
    }
    toggleMute() {
      this.muted = !this.muted;
      if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.15);
      return this.muted;
    }
    bellStrike(kind) {
      if (!this.ctx || this.muted) return;
      if (kind === "act") this.bell.strike(NOTE.B2, 0.5);
      if (kind === "dark") this.bell.strike(NOTE.F2, 0.55);
      if (kind === "small") this.bell.strike(NOTE.F3s, 0.28);
    }
    apply(name, force) {
      if (!this.ctx || (!force && name === this.scene)) { this.scene = name; return; }
      this.scene = name;
      const p = SCENE_AUDIO[name] || SCENE_AUDIO.off;
      this.wind.set(p.wind);
      this.drone.set(p.drone.f, p.drone.v);
      this.seq.set(p.seq ? Object.assign({ i: 0 }, p.seq) : null, p.seq ? 0.55 : 0);
      this.choir.set(p.choir ? p.choir.f : [null, null, null, null], p.choir ? p.choir.v : 0);
      this.heart.set(p.heart);
      this.water.set(p.water);
    }
  }

  window.MANFRED_AUDIO = new Engine();
})();
