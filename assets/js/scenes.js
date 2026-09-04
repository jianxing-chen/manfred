/* 曼弗雷德：遗忘实验 —— Canvas 场景渲染器
 * 每个场景 = 天空渐变 + 种子化山脊（多层视差）+ 粒子（星/雪/烬/雾）+ 特色元素。
 * 全部程序化生成，无图片资源。尊重 prefers-reduced-motion。
 */
(function () {
  "use strict";

  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* 确定性伪随机 */
  function mulberry(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* 山脊线：多正弦叠加 */
  function ridge(w, h, seed, baseY, amp, roughness) {
    const rnd = mulberry(seed);
    const phases = [];
    for (let i = 0; i < 5; i++) phases.push(rnd() * Math.PI * 2);
    const pts = [];
    const steps = 90;
    for (let s = 0; s <= steps; s++) {
      const x = (s / steps) * w;
      const t = s / steps;
      let y = baseY
        + Math.sin(t * Math.PI * (1.1 + roughness) + phases[0]) * amp
        + Math.sin(t * Math.PI * (2.3 + roughness * 2) + phases[1]) * amp * 0.45
        + Math.sin(t * Math.PI * (4.7 + roughness * 3) + phases[2]) * amp * 0.22
        + Math.sin(t * Math.PI * (8.9 + roughness * 4) + phases[3]) * amp * 0.1
        + Math.sin(t * Math.PI * (17.3 + roughness * 5) + phases[4]) * amp * 0.05;
      pts.push([x, y]);
    }
    return pts;
  }

  const SCENES = {
    /* 序幕：黑夜里的一盏灯 */
    overture: {
      seed: 11, ground: "#060b16",
      sky: [["#05080f", 0], ["#0a1220", .55], ["#101a2c", 1]],
      ridges: [], particles: "stars-sparse",
      lamp: { x: .5, y: .78, scale: 1.4 },
      moon: null
    },
    /* 第一幕：哥特长廊（几何描线 + 高窗星野） */
    corridor: {
      seed: 23, ground: "#04070e",
      sky: [["#04070e", 0], ["#081020", .6], ["#0d1526", 1]],
      ridges: [], particles: "stars-sparse",
      corridor: true, lamp: { x: .5, y: .72, scale: .8 }, moon: null
    },
    /* 第一幕二场：少女峰清晨 */
    dawn: {
      seed: 41, ground: "#1a2333",
      sky: [["#2a3550", 0], ["#7d90b0", .62], ["#d8b7a0", .88], ["#e8cfae", 1]],
      ridges: [
        { seed: 5, baseY: .58, amp: .16, rough: 1.1, color: "#39465e", alpha: 1 },
        { seed: 9, baseY: .70, amp: .12, rough: 1.5, color: "#2b3550", alpha: 1 },
        { seed: 13, baseY: .82, amp: .09, rough: 1.8, color: "#1d2537", alpha: 1 }
      ],
      ridgedSnow: true, particles: "mist", moon: "sunrise"
    },
    /* 猎人茅舍：雪夜暖窗 */
    hut: {
      seed: 57, ground: "#0d1420",
      sky: [["#070d18", 0], ["#0d1626", .6], ["#141f33", 1]],
      ridges: [
        { seed: 21, baseY: .66, amp: .13, rough: 1.3, color: "#1a2338", alpha: 1 },
        { seed: 25, baseY: .80, amp: .1, rough: 1.7, color: "#111827", alpha: 1 }
      ],
      ridgedSnow: true, particles: "snow", window: true, moon: "moon-thin"
    },
    /* 瀑布与魔女 */
    waterfall: {
      seed: 73, ground: "#0a111c",
      sky: [["#0c1524", 0], ["#142238", .6], ["#1c2c46", 1]],
      ridges: [
        { seed: 31, baseY: .52, amp: .18, rough: 1.0, color: "#16233b", alpha: 1 },
        { seed: 35, baseY: .74, amp: .12, rough: 1.4, color: "#0f1a2c", alpha: 1 }
      ],
      particles: "mist-dense", waterfall: true, rainbow: true, moon: null
    },
    /* 阿里曼涅斯的殿堂 */
    palace: {
      seed: 89, ground: "#03040a",
      sky: [["#020308", 0], ["#05060e", .6], ["#090a14", 1]],
      ridges: [], particles: "embers",
      fireball: true, moon: null
    },
    /* 午夜塔楼 */
    midnight: {
      seed: 101, ground: "#0a0f1c",
      sky: [["#060a16", 0], ["#0c1426", .55], ["#15203a", 1]],
      ridges: [
        { seed: 45, baseY: .60, amp: .15, rough: 1.1, color: "#141d33", alpha: 1 },
        { seed: 49, baseY: .78, amp: .1, rough: 1.6, color: "#0c1220", alpha: 1 }
      ],
      ridgedSnow: true, particles: "stars-dense+snow-light", tower: true, moon: "moon"
    },
    /* 群魔（午夜变体：更暗） */
    demons: {
      seed: 101, ground: "#07060a",
      sky: [["#050308", 0], ["#0a0710", .55], ["#120b14", 1]],
      ridges: [
        { seed: 45, baseY: .62, amp: .15, rough: 1.1, color: "#0e0a14", alpha: 1 }
      ],
      particles: "embers-dark", tower: true, moon: "moon-blood"
    },
    /* 尾声：落雪转白 */
    snow: {
      seed: 131, ground: "#c9d4e4",
      sky: [["#b8c6da", 0], ["#d5deea", .6], ["#eef2f7", 1]],
      ridges: [
        { seed: 61, baseY: .64, amp: .13, rough: 1.2, color: "#a9b8cd", alpha: 1 },
        { seed: 65, baseY: .8, amp: .1, rough: 1.6, color: "#93a5bd", alpha: 1 }
      ],
      particles: "snow-sparse", moon: null
    }
  };

  class StageRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.scene = null;
      this.name = null;
      this.t = 0;
      this.fade = 1;        // 黑场程度 0..1
      this.fadeTarget = 1;
      this.pointerX = 0.5;
      this.brightness = 1;  // 全局亮度（灯灭时降低）
      this.brightnessTarget = 1;
      window.addEventListener("pointermove", (e) => {
        this.pointerX = e.clientX / window.innerWidth;
      }, { passive: true });
      window.addEventListener("resize", () => this.resize());
      this.resize();
      this.particles = [];
      const loop = (ts) => { this.draw(ts); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    }
    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.w = window.innerWidth; this.h = window.innerHeight;
      this.canvas.width = this.w * dpr; this.canvas.height = this.h * dpr;
      this.canvas.style.width = this.w + "px"; this.canvas.style.height = this.h + "px";
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (this.scene) this.buildParticles();
    }
    setScene(name, opts) {
      if (!SCENES[name]) return;
      this.name = name;
      this.scene = SCENES[name];
      this.opts = opts || {};
      this.buildParticles();
      this.fadeTarget = 1;         // 先落黑
      setTimeout(() => { this.fadeTarget = 0; }, REDUCED ? 80 : 620);
    }
    buildParticles() {
      const s = this.scene, rnd = mulberry(s.seed * 7 + 1);
      const kind = s.particles || "";
      const list = [];
      const n = REDUCED ? 40 : 130;
      if (kind.includes("stars")) {
        const count = kind.includes("dense") ? 170 : 70;
        for (let i = 0; i < count; i++) {
          list.push({ type: "star", x: rnd(), y: rnd() * .7, r: rnd() * 1.1 + .2, tw: rnd() * 6.28, sp: .3 + rnd() });
        }
      }
      if (kind.includes("snow") || kind === "snow-sparse") {
        const count = kind === "snow-sparse" ? 60 : (kind === "snow-light" ? 30 : 110);
        for (let i = 0; i < count; i++) {
          list.push({ type: "snow", x: rnd(), y: rnd(), r: rnd() * 2 + .6, vy: .04 + rnd() * .1, vx: (rnd() - .5) * .02, ph: rnd() * 6.28 });
        }
      }
      if (kind === "mist" || kind === "mist-dense") {
        const count = kind === "mist-dense" ? 26 : 14;
        for (let i = 0; i < count; i++) {
          list.push({ type: "mist", x: rnd(), y: .55 + rnd() * .45, r: 60 + rnd() * 130, v: .004 + rnd() * .012, a: .04 + rnd() * .06 });
        }
      }
      if (kind === "embers" || kind === "embers-dark") {
        for (let i = 0; i < (REDUCED ? 12 : 36); i++) {
          list.push({ type: "ember", x: rnd(), y: rnd(), r: rnd() * 1.6 + .4, vy: .02 + rnd() * .05, ph: rnd() * 6.28, dark: kind === "embers-dark" });
        }
      }
      this.particles = list;
    }
    drawRidge(r, parallax) {
      const c = this.ctx, w = this.w, h = this.h;
      const pts = ridge(w, h, r.seed, 0, r.amp * h, r.rough);
      c.save();
      c.globalAlpha = r.alpha;
      c.fillStyle = r.color;
      c.beginPath();
      c.moveTo(-40 * parallax, h + 10);
      for (const [x, y] of pts) c.lineTo(x - (parallax * 60), y + r.baseY * h - r.amp * h);
      c.lineTo(w + 10, h + 10);
      c.closePath(); c.fill();
      if (this.scene.ridgedSnow) {
        c.save();
        c.globalAlpha = r.alpha * .5;
        c.strokeStyle = "rgba(222,232,246,.5)";
        c.lineWidth = 1.1;
        c.beginPath();
        let started = false;
        for (const [x, y] of pts) {
          const yy = y + r.baseY * h - r.amp * h;
          if (!started) { c.moveTo(x - parallax * 60, yy); started = true; }
          else c.lineTo(x - parallax * 60, yy);
        }
        c.stroke(); c.restore();
      }
      c.restore();
    }
    drawSky() {
      const c = this.ctx, w = this.w, h = this.h, s = this.scene;
      const g = c.createLinearGradient(0, 0, 0, h);
      for (const [col, pos] of s.sky) g.addColorStop(pos, col);
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      /* 月/日 */
      const m = s.moon;
      if (m) {
        const px = (this.pointerX - .5) * 12;
        let x = w * .76 - px, y = h * .22, r = h * .055, col;
        if (m === "moon") col = "rgba(222,232,246,.92)";
        if (m === "moon-thin") { col = "rgba(200,214,232,.8)"; r = h * .032; }
        if (m === "moon-blood") col = "rgba(200,120,110,.85)";
        if (m === "sunrise") { y = h * .70; x = w * .24 - px; r = h * .07; col = "rgba(238,196,150,.95)"; }
        const halo = c.createRadialGradient(x, y, r * .4, x, y, r * 4.2);
        halo.addColorStop(0, col); halo.addColorStop(1, "rgba(0,0,0,0)");
        c.globalAlpha = .16; c.fillStyle = halo;
        c.fillRect(x - r * 4.2, y - r * 4.2, r * 8.4, r * 8.4);
        c.globalAlpha = 1;
        c.fillStyle = col;
        c.beginPath(); c.arc(x, y, r, 0, 6.283); c.fill();
        if (m === "moon" || m === "moon-thin") {
          c.fillStyle = "rgba(10,16,32,.88)";
          c.beginPath(); c.arc(x - r * .38, y - r * .22, r * .92, 0, 6.283); c.fill();
        }
      }
    }
    drawCorridor() {
      const c = this.ctx, w = this.w, h = this.h;
      const t = this.t;
      c.save();
      c.strokeStyle = "rgba(150,172,205,.34)";
      c.lineWidth = 1.2;
      /* 透视拱廊：两侧渐远的哥特尖拱 */
      const vpx = w / 2, vpy = h * .46;
      for (let i = 0; i < 7; i++) {
        const p = i / 7;
        const scale = Math.pow(.78, i);
        const colW = w * .10 * scale, colH = h * .62 * scale;
        const xL = vpx - (w * .42) * scale - colW / 2 + Math.sin(t * .05) * 0;
        const xR = vpx + (w * .42) * scale + colW / 2;
        for (const x of [xL, xR]) {
          c.beginPath();
          c.rect(x - colW / 2 + p * 0, vpy - colH * .1, colW, colH);
          c.stroke();
          /* 尖拱 */
          c.beginPath();
          c.moveTo(x - colW / 2, vpy - colH * .1);
          c.quadraticCurveTo(x, vpy - colH * .55, x + colW / 2, vpy - colH * .1);
          c.stroke();
        }
      }
      /* 地砖透视线 */
      c.strokeStyle = "rgba(150,172,205,.14)";
      for (let i = -6; i <= 6; i++) {
        c.beginPath();
        c.moveTo(vpx + i * w * .08, h);
        c.lineTo(vpx, vpy);
        c.stroke();
      }
      for (let i = 1; i < 8; i++) {
        const y = vpy + Math.pow(i / 8, 1.9) * (h - vpy);
        c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke();
      }
      c.restore();
    }
    drawTower() {
      const c = this.ctx, w = this.w, h = this.h;
      c.save();
      c.fillStyle = this.scene.name === "demons" ? "#050307" : "#080d18";
      const bx = w * .68, bw = w * .075, th = h * .46;
      c.fillRect(bx, h - th - (h * this.scene.ridges ? 0 : 0), bw, th);
      c.fillRect(bx - bw * .18, h - th, bw * 1.36, h * .016);
      /* 城齿 */
      for (let i = 0; i < 4; i++) c.fillRect(bx - bw * .18 + i * bw * .42, h - th - h * .022, bw * .22, h * .024);
      /* 窗 */
      c.fillStyle = "rgba(232,162,75,.75)";
      c.fillRect(bx + bw * .36, h - th * .55, bw * .28, h * .05);
      c.restore();
    }
    drawWindow() {
      const c = this.ctx, w = this.w, h = this.h;
      const x = w * .5, y = h * .52, ww = w * .062, wh = h * .13;
      const glow = c.createRadialGradient(x + ww / 2, y + wh / 2, 4, x + ww / 2, y + wh / 2, h * .22);
      glow.addColorStop(0, "rgba(232,162,75,.34)");
      glow.addColorStop(1, "rgba(232,162,75,0)");
      c.fillStyle = glow; c.fillRect(0, 0, w, h);
      c.fillStyle = "rgba(236,178,102,.92)";
      c.fillRect(x, y, ww, wh);
      c.fillStyle = "rgba(20,16,10,.9)";
      c.fillRect(x + ww * .44, y, ww * .12, wh);
      c.fillRect(x, y + wh * .46, ww, wh * .1);
    }
    drawWaterfall() {
      const c = this.ctx, w = this.w, h = this.h, t = this.t;
      const x = w * .5, top = h * .18, bottom = h * .86;
      const width = w * .16;
      const g = c.createLinearGradient(0, top, 0, bottom);
      g.addColorStop(0, "rgba(214,228,244,.75)");
      g.addColorStop(1, "rgba(214,228,244,.28)");
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(x - width * .5, top);
      for (let y = top; y <= bottom; y += 14) {
        const sway = Math.sin(y * .02 + t * .0012) * width * .07;
        c.lineTo(x - width * .5 + sway, y);
      }
      for (let y = bottom; y >= top; y -= 14) {
        const sway = Math.sin(y * .02 + t * .0012) * width * .07;
        c.lineTo(x + width * .5 + sway, y);
      }
      c.closePath(); c.fill();
      /* 水纹亮线 */
      c.strokeStyle = "rgba(238,246,255,.5)";
      for (let i = 0; i < 8; i++) {
        const off = ((t * .12) + i * 160) % 900;
        const y = top + (off / 900) * (bottom - top);
        c.globalAlpha = .5 * (1 - off / 900);
        c.beginPath();
        const sway = Math.sin(y * .02 + t * .0012) * width * .07;
        c.moveTo(x - width * .3 + sway, y);
        c.lineTo(x + width * .18 + sway, y);
        c.stroke();
      }
      c.globalAlpha = 1;
      /* 彩虹 */
      if (this.scene.rainbow) {
        const cx = x, cy = bottom - h * .06, r = Math.min(w, h) * .42;
        const colors = ["rgba(224,82,96,.34)", "rgba(238,162,80,.3)", "rgba(238,222,120,.3)", "rgba(120,200,150,.28)", "rgba(110,160,220,.3)", "rgba(160,120,210,.26)"];
        colors.forEach((col, i) => {
          c.strokeStyle = col;
          c.lineWidth = h * .012;
          c.beginPath();
          c.arc(cx, cy, r - i * h * .014, Math.PI * 1.12, Math.PI * 1.88);
          c.stroke();
        });
      }
    }
    drawFireball() {
      const c = this.ctx, w = this.w, h = this.h, t = this.t;
      const x = w * .5, y = h * .40, r = h * .13 * (1 + Math.sin(t * .0016) * .04);
      const g = c.createRadialGradient(x, y, r * .1, x, y, r * 3);
      g.addColorStop(0, "rgba(238,140,70,.9)");
      g.addColorStop(.22, "rgba(190,70,50,.5)");
      g.addColorStop(.6, "rgba(120,40,60,.16)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = g;
      c.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
      c.fillStyle = "rgba(255,196,120,.95)";
      c.beginPath(); c.arc(x, y, r * .42, 0, 6.283); c.fill();
      /* 王座台阶弧线 */
      c.strokeStyle = "rgba(150,110,130,.2)";
      for (let i = 1; i <= 5; i++) {
        c.lineWidth = 1;
        c.beginPath(); c.ellipse(x, y + r * (0.9 + i * .16), r * (1.6 + i * .3), r * (.34 + i * .08), 0, 0, 6.283); c.stroke();
      }
    }
    drawLampGlow() {
      const s = this.scene;
      const lp = s.lamp;
      if (!lp) return;
      const c = this.ctx, w = this.w, h = this.h;
      const x = w * lp.x, y = h * lp.y;
      const flick = REDUCED ? 1 : (1 + Math.sin(this.t * .012) * .05 + Math.sin(this.t * .031) * .03);
      const r = h * .13 * lp.scale * flick * this.opts.lampLevel;
      const g = c.createRadialGradient(x, y, r * .05, x, y, r);
      g.addColorStop(0, "rgba(238,186,110,.5)");
      g.addColorStop(.4, "rgba(200,130,60,.18)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = g;
      c.fillRect(x - r, y - r, r * 2, r * 2);
      /* 灯焰本体 */
      c.save();
      c.translate(x, y);
      c.fillStyle = "rgba(248,214,150,.95)";
      c.beginPath();
      c.moveTo(0, -h * .022 * lp.scale * flick);
      c.quadraticCurveTo(h * .012 * lp.scale, -h * .008, 0, h * .006);
      c.quadraticCurveTo(-h * .012 * lp.scale, -h * .008, 0, -h * .022 * lp.scale * flick);
      c.fill();
      c.restore();
    }
    drawParticles(dt) {
      const c = this.ctx, w = this.w, h = this.h;
      for (const p of this.particles) {
        if (p.type === "star") {
          const a = .35 + .5 * Math.abs(Math.sin(this.t * .001 * p.sp + p.tw));
          c.fillStyle = `rgba(222,232,246,${a})`;
          c.beginPath(); c.arc(p.x * w, p.y * h, p.r, 0, 6.283); c.fill();
        } else if (p.type === "snow") {
          if (!REDUCED) {
            p.y += p.vy * dt / 16.7 / h * 120;
            p.x += (p.vx + Math.sin(this.t * .001 + p.ph) * .01) * dt / 16.7;
            if (p.y > 1.05) { p.y = -0.05; p.x = Math.random(); }
            if (p.x > 1.05) p.x = -0.05; if (p.x < -0.05) p.x = 1.05;
          }
          c.fillStyle = "rgba(228,236,248,.8)";
          c.beginPath(); c.arc(p.x * w, p.y * h, p.r, 0, 6.283); c.fill();
        } else if (p.type === "mist") {
          if (!REDUCED) { p.x += p.v * dt / 16.7; if (p.x > 1.3) p.x = -0.3; }
          const g = c.createRadialGradient(p.x * w, p.y * h, 0, p.x * w, p.y * h, p.r);
          g.addColorStop(0, `rgba(205,220,240,${p.a})`);
          g.addColorStop(1, "rgba(205,220,240,0)");
          c.fillStyle = g;
          c.beginPath(); c.arc(p.x * w, p.y * h, p.r, 0, 6.283); c.fill();
        } else if (p.type === "ember") {
          if (!REDUCED) {
            p.y -= p.vy * dt / 16.7 / h * 120;
            if (p.y < -.02) { p.y = 1.02; p.x = Math.random(); }
          }
          const a = .5 + .4 * Math.sin(this.t * .002 + p.ph);
          c.fillStyle = p.dark ? `rgba(140,80,90,${a * .5})` : `rgba(238,160,90,${a * .6})`;
          c.beginPath(); c.arc(p.x * w, p.y * h, p.r, 0, 6.283); c.fill();
        }
      }
    }
    draw(ts) {
      const dt = Math.min(50, ts - (this.lastTs || ts)); this.lastTs = ts;
      this.t = ts || 0;
      const c = this.ctx, w = this.w, h = this.h;
      /* 黑场过渡 */
      this.fade += (this.fadeTarget - this.fade) * (REDUCED ? 1 : .06);
      this.brightness += (this.brightnessTarget - this.brightness) * .04;
      if (!this.scene) {
        c.fillStyle = "#04060c"; c.fillRect(0, 0, w, h);
        return;
      }
      const s = this.scene;
      const parallax = (this.pointerX - .5);
      this.drawSky();
      if (s.particles && s.particles.includes("stars")) {
        // 星星画在山后面
        this.drawParticles(dt);
      }
      if (s.corridor) this.drawCorridor();
      if (s.fireball) this.drawFireball();
      if (s.ridges) for (const r of s.ridges) this.drawRidge(r, parallax * (r.baseY < .7 ? 1 : 1.6));
      if (s.waterfall) this.drawWaterfall();
      if (s.tower) this.drawTower();
      if (s.window) this.drawWindow();
      if (s.lamp) this.drawLampGlow();
      if (s.particles && !s.particles.includes("stars")) this.drawParticles(dt);
      /* 亮度罩层（灯灭） */
      if (this.brightness < .99) {
        c.fillStyle = `rgba(2,4,8,${1 - this.brightness})`;
        c.fillRect(0, 0, w, h);
      }
      /* 黑场 */
      if (this.fade > .005) {
        c.fillStyle = `rgba(3,5,10,${this.fade})`;
        c.fillRect(0, 0, w, h);
      }
    }
    blackout() { this.fadeTarget = 1; }
    resume() { this.fadeTarget = 0; }
  }

  window.MANFRED_STAGE = StageRenderer;
})();
