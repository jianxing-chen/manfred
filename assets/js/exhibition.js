/* 《午夜，一盏灯》—— 虚拟展览引擎
 * 节点式行走（展厅内 2–4 个立足点）+ 2.5D 手绘透视渲染 + 视差环视。
 * 灯卡逐厅变暗（100→0），展线平面图实时同步，九件装置按《策展手册》逐一可交互。
 * 零依赖：Canvas 2D + Web Audio（音色复用 assets/js/audio.js 预设）。
 */
(function () {
  "use strict";

  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const FAST = /[?&]fast=1/.test(location.search);
  const D = (ms) => (FAST ? Math.max(150, ms / 6) : ms); // 等待缩放
  const $ = (s) => document.querySelector(s);
  const audio = window.MANFRED_AUDIO;

  /* ================= 渲染助手 ================= */
  let W = 0, H = 0;
  function vg(ctx, stops) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    for (const [c, p] of stops) g.addColorStop(p, c);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  function glow(ctx, x, y, r, rgb, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${a})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  /* 环视视差：深度 0（近）位移大，1（地平线）几乎不动 */
  function lk(s) { return -(state.look - 0.5) * W * 0.05 * (1.08 - s * 0.88); }
  /* 透视地面 */
  function floorGrid(ctx, hy, tint, tintFar) {
    const vpx = W / 2 + lk(0.6);
    ctx.lineWidth = 1;
    for (let i = -9; i <= 9; i++) {
      ctx.strokeStyle = tint;
      ctx.globalAlpha = 0.5 - Math.abs(i) * 0.028;
      ctx.beginPath();
      ctx.moveTo(W / 2 + i * W * 0.16, H + 4);
      ctx.lineTo(vpx + i * W * 0.012, hy);
      ctx.stroke();
    }
    for (let i = 1; i <= 7; i++) {
      const yy = hy + Math.pow(i / 7, 1.85) * (H - hy);
      ctx.strokeStyle = tintFar;
      ctx.globalAlpha = 0.14 + (i / 7) * 0.3;
      ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(W, yy); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function clamp01(x) { return Math.max(0, Math.min(1, x)); }

  /* ================= 全局状态 ================= */
  const state = {
    started: false, room: 0, node: 0,
    look: 0.5, lookT: 0.5,
    walk: null,            // {from,to,t,ms}
    fade: 1, fadeTarget: 1,
    lamp: 0,               // 灯卡 0..1
    lampLit: false,
    footprints: 0,
    flags: {},
    busy: false
  };
  window.EXH = state; // 测试钩子
  window.EXH_GOTO = (i) => gotoRoom(i); // 调试：直接跳厅

  /* ================= 字幕 ================= */
  const subsEl = $("#subs");
  let capTimer = null;
  function cap(item) {
    return new Promise((res) => {
      const d = document.createElement("div");
      d.className = "cap " + (item.cls || "");
      d.innerHTML = (item.who ? `<span class="who ${item.who === "曼弗雷德" ? "manfred" : ""}">${item.who}</span>` : "") +
        `<span class="body">${item.t}</span>`;
      subsEl.appendChild(d);
      requestAnimationFrame(() => d.classList.add("show"));
      const hold = D(1500) + item.t.length * (FAST ? 8 : 42);
      setTimeout(() => { d.classList.remove("show"); setTimeout(() => { d.remove(); res(); }, 720); }, hold);
    });
  }
  async function say(list) {
    state.busy = true;
    for (const it of list) await cap(it);
    state.busy = false;
  }

  /* ================= 提示按钮 ================= */
  const promptsEl = $("#prompts");
  function setPrompts(list) {
    promptsEl.innerHTML = "";
    const wish = $("#wish-box");
    if (wish) wish.classList.remove("show");
    (list || []).forEach(p => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = p.label;
      if (p.primary) b.classList.add("primary");
      if (p.ghost) b.classList.add("ghost");
      if (p.cls) b.classList.add(p.cls);
      if (p.id) b.id = p.id;
      const fire = () => { if (state.walking) return; p.on(); };
      if (p.holdMs) {
        b.innerHTML = p.label + '<span class="bar"></span>';
        let accum = 0, last = null, holding = false, done = false;
        const bar = b.querySelector(".bar");
        const tick = setInterval(() => {
          if (done) { clearInterval(tick); return; }
          const now = performance.now();
          if (holding) {
            if (last != null) accum += Math.min(300, now - last);
            last = now;
            const pr = clamp01(accum / D(p.holdMs));
            bar.style.width = (pr * 100) + "%";
            if (pr >= 1) { done = true; fire(); }
          } else last = now;
        }, 110);
        const on = () => { holding = true; };
        const off = () => { holding = false; last = null; };
        b.addEventListener("pointerdown", on);
        window.addEventListener("pointerup", off);
        b.addEventListener("keydown", e => { if (e.key === " " || e.key === "Enter") on(); });
        b.addEventListener("keyup", e => { if (e.key === " " || e.key === "Enter") off(); });
      } else {
        b.addEventListener("click", fire);
      }
      promptsEl.appendChild(b);
    });
    if (list && list.length) promptsEl.classList.add("show");
  }
  function clearPrompts() { promptsEl.innerHTML = ""; }

  /* ================= 展签 / 灯卡 / 平面图 ================= */
  function showPlate(no, title, quote) {
    const p = $("#plate");
    p.innerHTML = `<div class="no">${no}</div><h2>${title}</h2>${quote ? `<p class="quote">${quote}</p>` : ""}`;
    p.classList.remove("show");
    setTimeout(() => p.classList.add("show"), 500);
  }
  function setLamp(level, lit) {
    state.lamp = level; state.lampLit = lit;
    const svg = $("#lamp-card svg");
    svg.classList.toggle("unlit", !lit);
    $("#lamp-card .pct").textContent = lit ? "灯焰 " + Math.round(level * 100) + "%" : "灯焰未点";
  }
  const PLAN_CELLS = ["〇", "一", "二", "三", "四", "五", "六", "七", "八", "雪"];
  function buildPlan() {
    const cells = PLAN_CELLS.map((c, i) =>
      `<g><rect class="cell" id="plan-c${i}" x="${i * 22 + 4}" y="4" width="18" height="18"/><text x="${i * 22 + 13}" y="17" text-anchor="middle">${c}</text></g>`).join("");
    $("#plan svg").innerHTML = cells;
  }
  function planCur(i) {
    PLAN_CELLS.forEach((_, k) => {
      const cell = $("#plan-c" + k);
      cell.classList.toggle("cur", k === i);
      cell.classList.toggle("past", k < i);
      const t = cell.nextElementSibling;
      if (t) t.classList.toggle("cur", k === i);
    });
  }

  /* ================= 粒子 ================= */
  function makeParts(kind, seedN) {
    const list = [];
    const n = REDUCED ? 24 : 70;
    for (let i = 0; i < n; i++) {
      const r = Math.random();
      if (kind === "dust") list.push({ t: "dust", x: Math.random(), y: Math.random(), r: r * 1.2 + .3, ph: Math.random() * 6.28 });
      if (kind === "mist") list.push({ t: "mist", x: Math.random(), y: .5 + Math.random() * .5, r: 70 + Math.random() * 130, v: .004 + Math.random() * .01, a: .05 + Math.random() * .07 });
      if (kind === "snow") list.push({ t: "snow", x: Math.random(), y: Math.random(), r: Math.random() * 2 + .7, vy: .05 + Math.random() * .1, ph: Math.random() * 6.28 });
      if (kind === "smoke") list.push({ t: "smoke", x: Math.random(), y: Math.random(), r: 20 + Math.random() * 40, vy: .01 + Math.random() * .02, ph: Math.random() * 6.28 });
    }
    return list;
  }
  function drawParts(ctx, list, dt, env) {
    for (const p of list) {
      if (p.t === "dust") {
        const a = .12 + .18 * Math.abs(Math.sin(env.t * .0008 + p.ph));
        ctx.fillStyle = `rgba(210,222,238,${a})`;
        ctx.beginPath(); ctx.arc((p.x + Math.sin(env.t * .0002 + p.ph) * .01) * W, p.y * H, p.r, 0, 6.28); ctx.fill();
      } else if (p.t === "mist") {
        if (!REDUCED) { p.x += p.v * dt / 16.7; if (p.x > 1.3) p.x = -0.3; }
        glow(ctx, p.x * W, p.y * H, p.r, "200,216,238", p.a);
      } else if (p.t === "snow") {
        if (!REDUCED) {
          p.y += p.vy * dt / 16.7 / H * 90;
          p.x += Math.sin(env.t * .001 + p.ph) * .012 * dt / 16.7;
          if (p.y > 1.05) { p.y = -.05; p.x = Math.random(); }
        }
        ctx.fillStyle = "rgba(236,242,250,.85)";
        ctx.beginPath(); ctx.arc(p.x * W, p.y * H, p.r, 0, 6.28); ctx.fill();
      } else if (p.t === "smoke") {
        if (!REDUCED) { p.y -= p.vy * dt / 16.7 / H * 60; if (p.y < -.05) { p.y = 1.05; p.x = Math.random(); } }
        glow(ctx, p.x * W, p.y * H, p.r, "160,130,100", .05);
      }
    }
  }

  /* ================= 展厅定义 ================= */
  /* 每厅: { id,no,title,quote,audio,lamp,lit,parts,draw(env),nodes:[{id,label,z,arrive,exit}] } */
  const ROOMS = [];

  /* —— 厅〇 · 售灯处 —— */
  ROOMS.push({
    id: "ticket", no: "厅〇 · 售灯处", title: "灯要加油",
    quote: "「这盏孤零的油灯必须把油漆满，但这样也不能伴我将长夜熬守。」",
    audio: "overture", lamp: 1, lit: true, parts: makeParts("dust"),
    exitLabel: "穿过窄门 · 厅一「召唤」",
    draw(ctx, E) {
      const hy = H * 0.62;
      /* 背墙 */
      const wallG = ctx.createLinearGradient(0, 0, 0, hy);
      wallG.addColorStop(0, "#0a111e"); wallG.addColorStop(1, "#0e1626");
      ctx.fillStyle = wallG; ctx.fillRect(0, 0, W, hy);
      /* 地面 */
      ctx.fillStyle = "#0b1220"; ctx.fillRect(0, hy, W, H - hy);
      floorGrid(ctx, hy, "rgba(120,140,170,.16)", "rgba(120,140,170,.1)");
      /* 货架剪影 */
      ctx.fillStyle = "rgba(16,24,40,.9)";
      for (let i = 0; i < 3; i++) ctx.fillRect(W * (0.08 + i * 0.05) + lk(0.5), H * 0.2, W * 0.03, hy - H * 0.2);
      /* 窄门 + 光渗 */
      const dx = W * 0.72 + lk(0.85), dw = W * 0.09;
      const leak = E.room.filled ? 0.5 : 0.16;
      glow(ctx, dx + dw / 2, hy * 0.5, dw * (E.room.filled ? 3.4 : 1.6), "232,162,75", leak);
      ctx.fillStyle = `rgba(238,196,130,${E.room.filled ? .5 : .18})`;
      ctx.fillRect(dx, hy - H * 0.52, dw, H * 0.52);
      ctx.strokeStyle = "rgba(150,172,205,.4)"; ctx.strokeRect(dx, hy - H * 0.52, dw, H * 0.52);
      /* 桌 */
      const ty = H * 0.8, tw = W * 0.34, tx = W * 0.5 + lk(0.1) - tw / 2;
      ctx.fillStyle = "#1a1410";
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + tw, ty); ctx.lineTo(tx + tw * 0.82, H); ctx.lineTo(tx + tw * 0.18, H); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#241a12"; ctx.fillRect(tx - W * 0.01, ty - H * 0.018, tw + W * 0.02, H * 0.02);
      /* 桌上油灯 */
      const lx = W * 0.5 + lk(0.05), ly = ty - H * 0.018;
      const flick = 1 + Math.sin(E.t * 0.012) * 0.05;
      if (E.room.filled) glow(ctx, lx, ly - H * 0.06, H * 0.16 * flick, "232,162,75", .5);
      ctx.save(); ctx.translate(lx, ly);
      ctx.fillStyle = "rgba(248,214,150," + (E.room.filled ? .95 : .12) + ")";
      ctx.beginPath();
      ctx.moveTo(0, -H * 0.05 * flick);
      ctx.quadraticCurveTo(H * 0.014, -H * 0.02, 0, 0);
      ctx.quadraticCurveTo(-H * 0.014, -H * 0.02, 0, -H * 0.05 * flick);
      ctx.fill();
      ctx.fillStyle = "#1b2233"; ctx.strokeStyle = "#41506b";
      ctx.beginPath(); ctx.moveTo(-W * 0.012, 0); ctx.lineTo(W * 0.012, 0); ctx.lineTo(W * 0.007, H * 0.022); ctx.lineTo(-W * 0.007, H * 0.022); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
      drawParts(ctx, this.parts, E.dt, E);
      /* 暗角 */
      ctx.fillStyle = "rgba(3,5,10,.35)"; ctx.fillRect(0, 0, W, H);
    },
    nodes: [
      { id: "in", label: "环视 · 售灯处", z: 0.15, async arrive() {
          await say([
            { cls: "dim", t: "检票即添油。你领到一张灯卡——它将陪你走完九个厅。" },
            { cls: "dim", t: "灯焰随展厅逐厅变暗；在第八厅，它将熄灭。" }
          ]);
          setPrompts([{ label: "走到桌前", primary: true, on() { walkTo(1); } }]);
        } },
      { id: "table", label: "油灯", z: 0.55, async arrive() {
          if (state.flags.poured) { offerExit(); return; }
          setPrompts([{ label: "为灯添油", primary: true, holdMs: 2400, on() { poured(); } }]);
        } }
    ]
  });
  function poured() {
    state.flags.poured = true;
    setLamp(1, true);
    audio.bellStrike("small");
    say([
      { cls: "metaline", t: "灯卡已点亮——100%。" },
      { cls: "dim", t: "窄门开了。仅容一人通过。" }
    ]).then(() => offerExit());
  }
  function offerExit() {
    const next = state.room + 1;
    const nxt = ROOMS[next];
    setPrompts([{ label: ROOMS[state.room].exitLabel || ("穿过门 · " + (nxt ? nxt.no : "下一厅")), primary: true, on() { gotoRoom(next); } }]);
  }

  /* —— 厅一 · 召唤 —— */
  const SPIRITS = [
    { ch: "晨", rgb: "238,180,120", line: "我听从你的号令，驾一缕星光从天降临。" },
    { ch: "峰", rgb: "160,190,225", line: "勃朗峰是群山的君王……说吧，你对我有何要求！" },
    { ch: "海", rgb: "110,160,210", line: "面对着汪洋大海的精魂，快把你的心愿向我说明。" },
    { ch: "焰", rgb: "235,120,90", line: "你的咒语已经将我降服，我愿遵从你的旨意。" },
    { ch: "风", rgb: "200,214,232", line: "吾乃长风之御者……御风飞驰向你来。" },
    { ch: "夜", rgb: "120,110,160", line: "我的寓所是茫茫暗夜里的阴影。" },
    { ch: "星", rgb: "240,200,140", line: "主宰你命途的那个星座，地球形成前就听命于我。" }
  ];
  ROOMS.push({
    id: "summon", no: "厅一 · 召唤", title: "七个声音",
    quote: "「大地海洋空气暗夜群山暴风和你的星辰，都来听候你的吩咐，泥尘之子呀！」",
    audio: "corridor", lamp: .85, lit: true, parts: makeParts("dust"),
    draw(ctx, E) {
      vg(ctx, [["#05080f", 0], ["#0a1220", .6], ["#101a2c", 1]]);
      const hy = H * 0.6;
      floorGrid(ctx, hy, "rgba(120,140,170,.14)", "rgba(120,140,170,.1)");
      /* 七个环绕光点（椭圆轨道） */
      const cx = W / 2 + lk(0.8), cy = hy * 0.72;
      const rx = W * 0.36, ry = H * 0.2;
      E.room._orbs = [];
      SPIRITS.forEach((sp, i) => {
        const ang = -Math.PI * 0.92 + (i / 6) * Math.PI * 0.84;
        const x = cx + Math.cos(ang) * rx, y = cy + Math.sin(ang) * ry * -1;
        const heard = E.room.heard & (1 << i);
        const pulse = 1 + Math.sin(E.t * 0.003 + i) * 0.12;
        const r = H * (heard ? 0.028 : 0.02) * pulse;
        glow(ctx, x, y, r * 4, sp.rgb, heard ? .55 : .28);
        ctx.fillStyle = `rgba(${sp.rgb},${heard ? .95 : .7})`;
        ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, 6.28); ctx.fill();
        ctx.font = `${Math.round(H * 0.016)}px ${getComputedStyle(document.body).fontFamily}`;
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(207,220,236,.65)";
        ctx.fillText(sp.ch, x, y - r * 1.6);
        E.room._orbs.push({ x, y, r: r * 2.2, i });
      });
      /* 中央基座 */
      const py = H * 0.86;
      ctx.fillStyle = "#101828";
      ctx.beginPath(); ctx.ellipse(W / 2 + lk(0.2), py, W * 0.05, H * 0.014, 0, 0, 6.28); ctx.fill();
      ctx.fillStyle = "#182236";
      ctx.fillRect(W / 2 + lk(0.2) - W * 0.02, py - H * 0.05, W * 0.04, H * 0.05);
      drawParts(ctx, this.parts, E.dt, E);
    },
    nodes: [
      { id: "center", label: "立于圆心", z: 0.5, async arrive() {
          const R = ROOMS[state.room];
          const heardCount = () => SPIRITS.filter((_, i) => R.heard & (1 << i)).length;
          const prompts = () => {
            const ps = [];
            if (heardCount() < 7) {
              ps.push({ label: "逐一听完七个声音", primary: true, on: listenAll });
              ps.push({ label: "（或以指尖触碰各处光点）", ghost: true, cls: "ghost", on() {} });
            }
            if (heardCount() >= 7 && !state.flags.wished) ps.push({ label: "说出你的请求", primary: true, on: showWish });
            if (state.flags.wished) ps.push({ label: "离开 · 厅二「面容」", primary: true, on() { gotoRoom(2); } });
            setPrompts(ps);
          };
          R.refreshPrompts = prompts;
          if (!R._greeted) {
            R._greeted = true;
            await say([{ who: "七个精灵", cls: "spirit", t: "凡人啊，找我们有何贵干，快说吧！" }]);
          }
          prompts();
        } }
    ],
    click(x, y) {
      if (!this._orbs) return false;
      for (const o of this._orbs) {
        if ((x - o.x) ** 2 + (y - o.y) ** 2 < o.r ** 2) {
          if (!(this.heard & (1 << o.i))) {
            this.heard |= (1 << o.i);
            audio.bellStrike("small");
            say([{ who: "第" + "一二三四五六七"[o.i] + "个精灵", cls: "spirit", t: SPIRITS[o.i].line }])
              .then(() => { if (this.refreshPrompts) this.refreshPrompts(); });
          }
          return true;
        }
      }
      return false;
    },
    heard: 0
  });
  async function listenAll() {
    clearPrompts();
    const R = ROOMS[1];
    for (let i = 0; i < 7; i++) {
      if (R.heard & (1 << i)) continue;
      R.heard |= (1 << i);
      audio.bellStrike("small");
      await cap({ who: "第" + "一二三四五六七"[i] + "个精灵", cls: "spirit", t: SPIRITS[i].line });
    }
    await cap({ who: "七个精灵", cls: "spirit", t: "大地海洋空气暗夜群山暴风和你的星辰，都来听候你的吩咐，泥尘之子呀！" });
    R.refreshPrompts && R.refreshPrompts();
  }
  function showWish() {
    clearPrompts();
    const box = $("#wish-box");
    box.classList.add("show");
    const input = $("#wish-input");
    input.value = ""; input.focus();
    $("#wish-send").onclick = () => {
      const v = (input.value || "").trim();
      if (!v) return;
      box.classList.remove("show");
      state.flags.wished = true;
      if (/忘|forget|oblivion/i.test(v)) {
        audio.bellStrike("dark");
        say([
          { who: "七个精灵", cls: "spirit big", t: "我们做不到。" },
          { cls: "dim", t: "忘却不是我们的本性，而且也不归我们支配。不过——你可以去死。" }
        ]).then(() => ROOMS[1].refreshPrompts && ROOMS[1].refreshPrompts());
      } else {
        say([
          { who: "精灵", cls: "spirit", t: "向我们索要臣民、王权以及统治尘世的权力吧，全部或者部分——或是要一部管辖世间万物的符箓吧！" },
          { cls: "metaline", t: "……可他求的不是这些。" }
        ]).then(() => ROOMS[1].refreshPrompts && ROOMS[1].refreshPrompts());
      }
    };
    $("#wish-input").onkeydown = (e) => { if (e.key === "Enter") $("#wish-send").click(); };
  }

  /* —— 厅二 · 面容 —— */
  ROOMS.push({
    id: "mirror", no: "厅二 · 面容", title: "一闪即碎",
    quote: "「哦，我的心碎啦！」",
    audio: "corridorFall", lamp: .75, lit: true, parts: makeParts("dust"),
    draw(ctx, E) {
      vg(ctx, [["#04070e", 0], ["#081020", .6], ["#0d1526", 1]]);
      const hy = H * 0.58;
      /* 窄廊：两壁强透视 */
      const vx = W / 2 + lk(0.7) * 0.5;
      ctx.fillStyle = "#070d18";
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(vx - W * 0.06, hy * 0.18); ctx.lineTo(vx - W * 0.06, hy); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(W, 0); ctx.lineTo(vx + W * 0.06, hy * 0.18); ctx.lineTo(vx + W * 0.06, hy); ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
      floorGrid(ctx, hy, "rgba(120,140,170,.12)", "rgba(120,140,170,.08)");
      /* 半镀银镜 */
      const mw = W * 0.16, mh = H * 0.5;
      const mx = vx - mw / 2, my = hy - mh;
      const g = ctx.createLinearGradient(mx, my, mx + mw, my + mh);
      g.addColorStop(0, "rgba(190,205,225,.22)");
      g.addColorStop(.5, "rgba(120,140,170,.12)");
      g.addColorStop(1, "rgba(60,72,95,.2)");
      ctx.fillStyle = g;
      ctx.fillRect(mx, my, mw, mh);
      ctx.strokeStyle = "rgba(170,190,215,.5)"; ctx.strokeRect(mx, my, mw, mh);
      /* 镜中身影 */
      const sx = vx + lk(0.95) * 0.2, sy = my + mh * 0.62;
      if (!E.room.shattered) {
        const face = E.room.faceT > 0;
        ctx.fillStyle = face ? "rgba(232,210,190,.5)" : "rgba(10,14,24,.75)";
        ctx.beginPath(); ctx.arc(sx, sy - mh * 0.22, mw * (face ? 0.2 : 0.16), 0, 6.28); ctx.fill();
        ctx.beginPath(); ctx.ellipse(sx, sy + mh * 0.1, mw * 0.3, mh * 0.26, 0, 0, 6.28); ctx.fill();
        if (face) glow(ctx, sx, sy - mh * 0.22, mw, "238,196,150", .4);
      } else {
        /* 裂纹 */
        ctx.strokeStyle = "rgba(220,232,246,.75)";
        ctx.lineWidth = 1.1;
        for (let k = 0; k < 7; k++) {
          const a0 = k * 0.9 + 0.4;
          ctx.beginPath(); ctx.moveTo(sx, sy - mh * 0.2);
          let px = sx, py = sy - mh * 0.2;
          for (let s = 0; s < 4; s++) {
            px += Math.cos(a0 + Math.sin(k * 3 + s) * 0.5) * mw * 0.22;
            py += Math.sin(a0 + Math.sin(k * 3 + s) * 0.5) * mw * 0.22;
            ctx.lineTo(px, py);
          }
          ctx.stroke();
        }
      }
      drawParts(ctx, this.parts, E.dt, E);
      if (E.room.dark) { ctx.fillStyle = `rgba(2,4,9,${E.room.dark})`; ctx.fillRect(0, 0, W, H); }
    },
    nodes: [
      { id: "in", label: "步入窄廊", z: 0.12, arrive() {
          setPrompts([{ label: "走向镜子", primary: true, on() { walkTo(1); } }]);
        } },
      { id: "face", label: "镜子", z: 0.7, async arrive() {
          clearPrompts();
          const R = ROOMS[state.room];
          await new Promise(r => setTimeout(r, D(700)));
          R.faceT = 1; audio.bellStrike("small");
          await cap({ cls: "astarte", t: "（镜中忽然亮起一张美丽的面容）" });
          await new Promise(r => setTimeout(r, D(1400)));
          R.faceT = 0; R.shattered = true; audio.bellStrike("dark");
          await cap({ cls: "big", who: "曼弗雷德", t: "哦，我的心碎啦！" });
          R.dark = 0; const t0 = performance.now();
          await new Promise(res => { const iv = setInterval(() => {
            R.dark = Math.min(0.75, (performance.now() - t0) / D(2400));
            if (R.dark >= 0.75) { clearInterval(iv); res(); }
          }, 60); });
          state.flags.mirrorDone = true;
          setPrompts([{ label: "离开 · 厅三「悬崖」", primary: true, on() { gotoRoom(3); } }]);
        } }
    ]
  });

  /* —— 厅三 · 悬崖 —— */
  ROOMS.push({
    id: "cliff", no: "厅三 · 悬崖", title: "一步之外",
    quote: "「我感到了冲动，但是我没有跃下……它使得我的生命变成了我的灾难。」",
    audio: "dawn", lamp: .65, lit: true, parts: makeParts("dust"),
    draw(ctx, E) {
      vg(ctx, [["#232e48", 0], ["#7d90b0", .55], ["#d8b7a0", .82], ["#e8cfae", 1]]);
      const hy = H * 0.6;
      /* 投影：山脊与深渊 */
      ctx.save();
      ctx.globalAlpha = .85;
      const ridgeY = hy * 0.9;
      ctx.fillStyle = "#39465e";
      ctx.beginPath(); ctx.moveTo(0, ridgeY);
      for (let x = 0; x <= W; x += W / 24) ctx.lineTo(x, ridgeY - Math.abs(Math.sin(x * 0.004 + 1.2)) * hy * 0.5 - Math.sin(x * 0.011) * hy * 0.08);
      ctx.lineTo(W, ridgeY); ctx.closePath(); ctx.fill();
      ctx.restore();
      /* 地面 + 深渊投影 */
      ctx.fillStyle = "#1a2333"; ctx.fillRect(0, hy, W, H - hy);
      const ab = ctx.createRadialGradient(W / 2 + lk(0.3), H * 0.78, H * 0.02, W / 2 + lk(0.3), H * 0.78, H * 0.4);
      ab.addColorStop(0, "rgba(4,6,12,.95)");
      ab.addColorStop(1, "rgba(4,6,12,0)");
      ctx.fillStyle = ab; ctx.fillRect(0, hy, W, H - hy);
      /* 红色按钮座 */
      const bx = W * 0.78 + lk(0.05), by = H * 0.84;
      ctx.fillStyle = "#241a14"; ctx.fillRect(bx - W * 0.018, by - H * 0.045, W * 0.036, H * 0.045);
      glow(ctx, bx, by - H * 0.05, H * 0.05, "200,70,60", E.room.pressFlash ? .9 : .4);
      ctx.fillStyle = E.room.pressFlash ? "#e05a48" : "#a03a2e";
      ctx.beginPath(); ctx.arc(bx, by - H * 0.05, W * 0.011, 0, 6.28); ctx.fill();
      /* 实线 */
      ctx.strokeStyle = "rgba(224,90,72,.8)"; ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.moveTo(W * 0.3, H * 0.72); ctx.lineTo(W * 0.72, H * 0.8); ctx.stroke();
      ctx.setLineDash([]);
      drawParts(ctx, this.parts, E.dt, E);
    },
    nodes: [
      { id: "in", label: "走上平台", z: 0.15, arrive() {
          setPrompts([{ label: "走近那枚按钮", primary: true, on() { walkTo(1); } }]);
        } },
      { id: "btn", label: "按钮", z: 0.5, async arrive() {
          const R = ROOMS[state.room];
          const press = async () => {
            clearPrompts();
            R.pressFlash = true;
            state.fadeTarget = 1;
            await new Promise(r => setTimeout(r, D(320)));
            state.fadeTarget = 0;
            R.pressFlash = false;
            R.presses = (R.presses || 0) + 1;
            const lines = R.presses === 1
              ? [{ who: "羚羊猎人", cls: "big", t: "不要跳，疯子！" },
                 { cls: "dim", t: "即使你厌倦自己的生命，也不能用你罪恶的血玷污我们纯洁的山谷啊。" },
                 { cls: "dim", t: "（一股风从背后把你推了回来。）" }]
              : R.presses === 2
              ? [{ who: "羚羊猎人", t: "跟我走吧——我决不会撒手放开你的。" }]
              : [{ cls: "metaline", t: "这枚按钮没有别的功能：它只会重复这句话。" }];
            await say(lines);
            setPrompts([
              { label: "再按一次", ghost: true, on: press },
              { label: "离开 · 厅四「茅舍」", primary: true, on() { gotoRoom(4); } }
            ]);
          };
          setPrompts([{ label: "只此一跳", cls: "primary", id: "jump-btn", on: press }]);
        } }
    ]
  });

  /* —— 厅四 · 茅舍 —— */
  ROOMS.push({
    id: "hut", no: "厅四 · 茅舍", title: "杯口有血",
    quote: "「拿开，拿开！杯子口上有血！」",
    audio: "hut", lamp: .55, lit: true, parts: makeParts("smoke"),
    draw(ctx, E) {
      vg(ctx, [["#0a0710", 0], ["#140d0a", .6], ["#1c130c", 1]]);
      const hy = H * 0.6;
      floorGrid(ctx, hy, "rgba(180,140,100,.12)", "rgba(180,140,100,.08)");
      /* 炉火 */
      const fx = W * 0.16 + lk(0.3), fy = H * 0.74;
      const fl = 1 + Math.sin(E.t * 0.02) * 0.1 + Math.sin(E.t * 0.047) * 0.06;
      glow(ctx, fx, fy, H * 0.3 * fl, "238,150,70", .5);
      ctx.fillStyle = "#2a1c10";
      ctx.fillRect(fx - W * 0.03, fy, W * 0.06, H * 0.012);
      ctx.fillRect(fx - W * 0.018, fy - H * 0.008, W * 0.05, H * 0.012);
      /* 窗 */
      const wx = W * 0.82 + lk(0.6), wy = hy - H * 0.34;
      const ww = W * 0.09, wh = H * 0.18;
      ctx.fillStyle = "rgba(222,232,246,.16)"; ctx.fillRect(wx, wy, ww, wh);
      ctx.strokeStyle = "rgba(180,150,110,.7)";
      ctx.strokeRect(wx, wy, ww, wh);
      ctx.beginPath(); ctx.moveTo(wx + ww / 2, wy); ctx.lineTo(wx + ww / 2, wy + wh);
      ctx.moveTo(wx, wy + wh / 2); ctx.lineTo(wx + ww, wy + wh / 2); ctx.stroke();
      /* 威廉·退尔版画 */
      ctx.strokeStyle = "rgba(160,58,46,.8)";
      ctx.strokeRect(W * 0.08 + lk(0.5), hy - H * 0.36, W * 0.07, H * 0.16);
      /* 桌与杯 */
      const ty = H * 0.82, tw = W * 0.3, tx = W * 0.5 + lk(0.1) - tw / 2;
      ctx.fillStyle = "#241a12"; ctx.fillRect(tx, ty, tw, H * 0.02);
      ctx.fillStyle = "#1a1410"; ctx.fillRect(tx + tw * 0.06, ty + H * 0.02, tw * 0.88, H * 0.16);
      const c1x = tx + tw * 0.38, c2x = tx + tw * 0.62, cy = ty - H * 0.012;
      for (const [cx2, hot] of [[c1x, false], [c2x, E.room.stain > 0]]) {
        ctx.fillStyle = hot ? `rgba(${140 + E.room.stain * 60},40,45,.95)` : "rgba(60,50,44,.95)";
        ctx.beginPath(); ctx.ellipse(cx2, cy - H * 0.006, W * 0.011, H * 0.008, 0, 0, 6.28); ctx.fill();
        ctx.strokeStyle = "rgba(200,170,130,.5)";
        ctx.beginPath(); ctx.ellipse(cx2, cy - H * 0.012, W * 0.011, H * 0.008, 0, 0, 6.28); ctx.stroke();
        if (hot) glow(ctx, cx2, cy - H * 0.01, H * 0.035, "180,50,50", .5 * E.room.stain);
      }
      drawParts(ctx, this.parts, E.dt, E);
      ctx.fillStyle = "rgba(5,3,2,.3)"; ctx.fillRect(0, 0, W, H);
    },
    nodes: [
      { id: "in", label: "进屋取暖", z: 0.15, arrive() {
          setPrompts([{ label: "坐近桌子", primary: true, on() { walkTo(1); } }]);
        } },
      { id: "table", label: "杯子", z: 0.5, async arrive() {
          const R = ROOMS[state.room];
          const look = () => {
            clearPrompts();
            R.stain = 0;
            const bloom = () => new Promise(res => { const iv = setInterval(() => {
              R.stain = Math.min(1, R.stain + 0.06);
              if (R.stain >= 1) { clearInterval(iv); res(); }
            }, 50); });
            bloom().then(async () => {
              audio.bellStrike("small");
              await say([
                { who: "曼弗雷德", cls: "big", t: "拿开，拿开！杯子口上有血！" },
                { cls: "dim", t: "难道它从来没有——永远不会渗入地底吗？" },
                { cls: "dim", t: "我说那是血，是我的血！——当我们怀着同一颗心，像我们不该那样爱着，却彼此相爱的时候，它也奔流在我们的脉管里。" },
                { who: "羚羊猎人", t: "伙计，你口出谵言怪语……可是不管你怎样畏惧和痛苦，安慰还是存在的。" }
              ]);
              state.flags.hutDone = true;
              setPrompts([{ label: "离开 · 厅五「虹雾」", primary: true, on() { gotoRoom(5); } }]);
            });
          };
          setPrompts([{ label: "看看杯口", primary: true, on: look }]);
        } }
    ]
  });

  /* —— 厅五 · 虹雾 —— */
  ROOMS.push({
    id: "mist", no: "厅五 · 虹雾", title: "彩虹下的交易",
    quote: "「我决不会发誓——服从！……永远不可能！」",
    audio: "waterfall", lamp: .45, lit: true, parts: makeParts("mist"),
    draw(ctx, E) {
      vg(ctx, [["#0c1524", 0], ["#142238", .6], ["#1c2c46", 1]]);
      const hy = H * 0.58;
      floorGrid(ctx, hy, "rgba(140,180,220,.14)", "rgba(140,180,220,.1)");
      /* 光谱弧 */
      const cx = W / 2 + lk(0.5), cy = H * 0.86, r = Math.min(W, H) * 0.5;
      const dim = E.room.rainbowDim ? 0.35 : 1;
      const colors = [["224,82,96", .4], ["238,162,80", .36], ["238,222,120", .36], ["120,200,150", .34], ["110,160,220", .36], ["160,120,210", .3]];
      colors.forEach(([rgb, a], i) => {
        ctx.strokeStyle = `rgba(${rgb},${a * dim})`;
        ctx.lineWidth = H * 0.012;
        ctx.beginPath(); ctx.arc(cx, cy, r - i * H * 0.014, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      });
      /* 瀑布细流 */
      ctx.strokeStyle = "rgba(214,228,244,.5)";
      for (let i = 0; i < 5; i++) {
        const x = W * (0.3 + i * 0.1) + lk(0.7);
        ctx.beginPath(); ctx.moveTo(x, H * 0.1);
        ctx.lineTo(x + Math.sin(E.t * 0.001 + i) * 8, H * 0.42); ctx.stroke();
      }
      /* 跪垫 */
      const ky = H * 0.84 + (E.room.sink || 0) * H * 0.1;
      ctx.save();
      ctx.globalAlpha = 1 - (E.room.sink || 0) * 0.9;
      ctx.fillStyle = "#2c2434";
      ctx.beginPath(); ctx.ellipse(W / 2 + lk(0.15), ky, W * 0.045, H * 0.014, 0, 0, 6.28); ctx.fill();
      ctx.fillStyle = "#3a3044";
      ctx.beginPath(); ctx.ellipse(W / 2 + lk(0.15), ky - H * 0.012, W * 0.04, H * 0.012, 0, 0, 6.28); ctx.fill();
      ctx.restore();
      drawParts(ctx, this.parts, E.dt, E);
    },
    nodes: [
      { id: "in", label: "步入虹雾", z: 0.12, arrive() {
          setPrompts([{ label: "走近跪垫", primary: true, on() { walkTo(1); } }]);
        } },
      { id: "cushion", label: "跪垫", z: 0.55, async arrive() {
          clearPrompts();
          const R = ROOMS[state.room];
          await say([
            { who: "魔女", cls: "spirit", t: "只要你愿意发誓服从我的旨意，而且做我要求你去做的事情，我就可以帮助你，实现你的心愿。" }
          ]);
          setPrompts([
            { label: "跪下", on: async () => {
                clearPrompts();
                /* 垫子下沉 */
                await new Promise(res => { const iv = setInterval(() => {
                  R.sink = Math.min(1, (R.sink || 0) + 0.07);
                  if (R.sink >= 1) { clearInterval(iv); res(); }
                }, 50); });
                audio.bellStrike("dark");
                await say([
                  { cls: "metaline", t: "跪垫在你触及时撤去了支撑——这里的重力只听曼弗雷德的。" },
                  { who: "曼弗雷德", cls: "big", t: "我决不会发誓——服从！服从谁？充当那些为我服务的精灵的奴隶吗？永远不可能！" }
                ]);
                R.rainbowDim = true;
                state.flags.mistDone = true;
                setPrompts([{ label: "离开 · 厅六「殿堂」", primary: true, on() { gotoRoom(6); } }]);
              } },
            { label: "退开", ghost: true, on: async () => {
                clearPrompts();
                await say([
                  { who: "曼弗雷德", cls: "big", t: "我决不会发誓——服从！永远不可能！" }
                ]);
                R.rainbowDim = true;
                state.flags.mistDone = true;
                setPrompts([{ label: "离开 · 厅六「殿堂」", primary: true, on() { gotoRoom(6); } }]);
              } }
          ]);
        } }
    ]
  });

  /* —— 厅六 · 殿堂 —— */
  ROOMS.push({
    id: "palace", no: "厅六 · 殿堂", title: "不跪",
    quote: "「那我是知道的。可是，瞧吧！我就是不向你们下跪。」",
    audio: "palace", lamp: .35, lit: true, parts: makeParts("dust"),
    draw(ctx, E) {
      vg(ctx, [["#020308", 0], ["#05060e", .6], ["#090a14", 1]]);
      const hy = H * 0.56;
      /* 穹顶弧线 */
      ctx.strokeStyle = "rgba(120,110,150,.18)";
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath(); ctx.ellipse(W / 2 + lk(0.6), hy * 0.1, W * (0.3 + i * 0.12), H * (0.1 + i * 0.06), 0, Math.PI, 0); ctx.stroke();
      }
      /* 火球王座 */
      const x = W / 2 + lk(0.85), y = hy * 0.52;
      const blood = E.room.blood;
      const r = H * 0.12 * (1 + Math.sin(E.t * 0.0016) * 0.04);
      const g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r * 3);
      if (blood) {
        g.addColorStop(0, "rgba(220,80,70,.95)"); g.addColorStop(.22, "rgba(150,40,50,.55)"); g.addColorStop(.6, "rgba(90,20,40,.18)");
      } else {
        g.addColorStop(0, "rgba(238,140,70,.9)"); g.addColorStop(.22, "rgba(190,70,50,.5)"); g.addColorStop(.6, "rgba(120,40,60,.16)");
      }
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
      ctx.fillStyle = blood ? "rgba(255,150,130,.95)" : "rgba(255,196,120,.95)";
      ctx.beginPath(); ctx.arc(x, y, r * 0.42, 0, 6.28); ctx.fill();
      for (let i = 1; i <= 4; i++) {
        ctx.strokeStyle = "rgba(150,110,130,.2)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(x, y + r * (0.9 + i * 0.18), r * (1.6 + i * 0.34), r * (0.3 + i * 0.09), 0, 0, 6.28); ctx.stroke();
      }
      /* 三个跪位 */
      const kneelShift = (E.room.kneelDepth || 0);
      const kyBase = H * 0.86 - kneelShift * H * 0.1;
      for (let i = -1; i <= 1; i++) {
        const kx = W / 2 + i * W * 0.12 + lk(0.2);
        ctx.strokeStyle = "rgba(232,162,75,.5)";
        ctx.beginPath(); ctx.ellipse(kx, kyBase + Math.abs(i) * H * 0.008, W * 0.028, H * 0.009, 0, 0, 6.28); ctx.stroke();
      }
      drawParts(ctx, this.parts, E.dt, E);
      ctx.fillStyle = `rgba(2,3,6,${0.25 + (E.room.kneelDepth || 0) * 0.3})`;
      ctx.fillRect(0, 0, W, H);
    },
    nodes: [
      { id: "in", label: "步入殿堂", z: 0.15, arrive() {
          setPrompts([{ label: "走向王座", primary: true, on() { walkTo(1); } }]);
        } },
      { id: "throne", label: "跪位", z: 0.5, async arrive() {
          clearPrompts();
          const R = ROOMS[state.room];
          await say([
            { who: "众精灵", cls: "spirit", t: "跪下吧，你这戴罪的泥身，尘世的孩子！否则，就要你遭受最最可怕的痛苦。" }
          ]);
          setPrompts([
            { label: "跪上跪位", on: async () => {
                clearPrompts();
                /* 视线压低 */
                await new Promise(res => { const iv = setInterval(() => {
                  R.kneelDepth = Math.min(1, (R.kneelDepth || 0) + 0.08);
                  if (R.kneelDepth >= 1) { clearInterval(iv); res(); }
                }, 50); });
                R.blood = true; audio.bellStrike("dark");
                const words = "我就是——不——向——你们——下跪。";
                await cap({ who: "曼弗雷德", cls: "big", t: words });
                /* 顶起 */
                await new Promise(res => { const iv = setInterval(() => {
                  R.kneelDepth = Math.max(0, R.kneelDepth - 0.09);
                  if (R.kneelDepth <= 0) { clearInterval(iv); res(); }
                }, 40); });
                await say([
                  { who: "阿里曼涅斯", cls: "big", t: "——是的！" },
                  { cls: "dim", t: "（地下之王批准了他唯一的请求：把死者唤来。）" }
                ]);
                state.flags.palaceDone = true;
                setPrompts([{ label: "进入单人厅 · 阿丝塔忒", primary: true, on() { gotoRoom(7); } }]);
              } },
            { label: "不跪", ghost: true, on: async () => {
                clearPrompts();
                await say([
                  { who: "曼弗雷德", cls: "big", t: "那我是知道的。可是，瞧吧！我就是不向你们下跪。" }
                ]);
                state.flags.palaceDone = true;
                setPrompts([{ label: "进入单人厅 · 阿丝塔忒", primary: true, on() { gotoRoom(7); } }]);
              } }
          ]);
        } }
    ]
  });

  /* —— 厅七 · 阿丝塔忒 —— */
  ROOMS.push({
    id: "astarte", no: "厅七 · 阿丝塔忒", title: "一个词的房间",
    quote: "「她默然无声，而在这沉默里，我得到的东西比回答更多。」",
    audio: "astarte", lamp: .2, lit: true, parts: [],
    draw(ctx, E) {
      ctx.fillStyle = "#020204"; ctx.fillRect(0, 0, W, H);
      const br = 0.05 + 0.04 * Math.sin(E.t * 0.0006);
      glow(ctx, W / 2, H * 0.55, H * 0.2, "180,200,230", E.room.herWord ? 0.3 : br);
      if (E.room.herWord) {
        ctx.fillStyle = "rgba(232,239,248,.9)";
        ctx.font = `${Math.round(H * 0.03)}px ${getComputedStyle(document.body).fontFamily}`;
        ctx.textAlign = "center";
        ctx.letterSpacing = "0.5em";
        ctx.fillText(E.room.herWord, W / 2, H * 0.56);
      }
    },
    nodes: [
      { id: "alone", label: "独自", z: 0.5, async arrive() {
          clearPrompts();
          await cap({ cls: "dim", t: "（门在身后合上。此处原定九十秒——虚拟版为你保留二十四秒。）" });
          const total = D(24000);
          const t0 = performance.now();
          await new Promise(res => { const iv = setInterval(() => {
            if (performance.now() - t0 >= total) { clearInterval(iv); res(); }
          }, 200); });
          const R = ROOMS[state.room];
          R.herWord = "——曼弗雷德啊！"; audio.bellStrike("small");
          await new Promise(r => setTimeout(r, D(3400)));
          R.herWord = "明天，你尘世的生命就要结束了。";
          await new Promise(r => setTimeout(r, D(4200)));
          R.herWord = "——再会吧！"; audio.bellStrike("dark");
          await new Promise(r => setTimeout(r, D(3600)));
          R.herWord = null;
          await cap({ cls: "dim", t: "她去了，再也不能唤她来了。她的预言将会实现。" });
          state.flags.astarteDone = true;
          setPrompts([{ label: "离开 · 厅八「午夜」", primary: true, on() { gotoRoom(8); } }]);
        } }
    ]
  });

  /* —— 厅八 · 午夜 —— */
  ROOMS.push({
    id: "midnight", no: "厅八 · 午夜", title: "要死并不难",
    quote: "「老人家！要死并不太难啊！」",
    audio: "demons", lamp: 0, lit: true, parts: makeParts("dust"),
    draw(ctx, E) {
      vg(ctx, [["#05040a", 0], ["#0a0710", .55], ["#120b14", 1]]);
      const hy = H * 0.58;
      /* 塔楼窗（灯箱：雪峰星空） */
      const wx = W / 2 - W * 0.09 + lk(0.6), wy = hy - H * 0.36, ww = W * 0.18, wh = H * 0.34;
      const sg = ctx.createLinearGradient(0, wy, 0, wy + wh);
      sg.addColorStop(0, "#101a30"); sg.addColorStop(1, "#1a2540");
      ctx.fillStyle = sg; ctx.fillRect(wx, wy, ww, wh);
      for (let i = 0; i < 14; i++) {
        ctx.fillStyle = "rgba(222,232,246,.8)";
        ctx.fillRect(wx + ((i * 53) % 97) / 97 * ww, wy + ((i * 71) % 89) / 89 * wh * 0.7, 1.4, 1.4);
      }
      ctx.fillStyle = "#141d33";
      ctx.beginPath(); ctx.moveTo(wx, wy + wh);
      ctx.lineTo(wx + ww * 0.3, wy + wh * 0.55); ctx.lineTo(wx + ww * 0.55, wy + wh * 0.8); ctx.lineTo(wx + ww, wy + wh * 0.4);
      ctx.lineTo(wx + ww, wy + wh); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(160,140,110,.7)"; ctx.strokeRect(wx, wy, ww, wh);
      /* 合拢的阴影 */
      const adv = E.room.shadow || 0;
      for (const side of [-1, 1]) {
        const edge = W / 2 + side * (W * (0.52 - adv * 0.3));
        const g = ctx.createLinearGradient(edge, 0, W / 2 + side * W * 0.2, 0);
        g.addColorStop(0, "rgba(2,2,4,.98)"); g.addColorStop(1, "rgba(2,2,4,0)");
        ctx.fillStyle = g;
        ctx.fillRect(side === -1 ? 0 : edge, 0, side === -1 ? edge : W - edge, H);
      }
      /* 铜柄 */
      const hyx = W / 2, hyy = H * 0.9;
      glow(ctx, hyx, hyy, H * 0.05, "220,170,100", .35);
      ctx.strokeStyle = "rgba(220,170,100,.9)"; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(hyx, hyy, W * 0.011, 0, 6.28); ctx.stroke();
      ctx.lineWidth = 1;
      drawParts(ctx, this.parts, E.dt, E);
    },
    nodes: [
      { id: "window", label: "窗前", z: 0.45, async arrive() {
          clearPrompts();
          const R = ROOMS[state.room];
          await say([
            { cls: "dim", t: "午夜。窗外的雪峰与星空。灯卡在靠近门的一瞬暗了下去。" },
            { cls: "dim", t: "阴影从四壁合拢——抓住那枚铜柄，它们就止步。" }
          ]);
          /* 拉锯 */
          R.shadow = 0.15;
          let held = 0, releasedTotal = 0, ended = false;
          setPrompts([{ label: "按住 · 拖住阴影", primary: true, holdMs: 999999, id: "hold-handle", on() {} }]);
          /* 定制按住：按住时阴影退，松开时进；两条结束路径 */
          const btn = $("#hold-handle");
          let holding = false;
          const on = () => { holding = true; };
          const off = () => { holding = false; };
          btn.addEventListener("pointerdown", on);
          window.addEventListener("pointerup", off);
          btn.addEventListener("keydown", e => { if (e.key === " " || e.key === "Enter") on(); });
          btn.addEventListener("keyup", e => { if (e.key === " " || e.key === "Enter") off(); });
          const said = { a: false, b: false };
          const t0 = performance.now();
          await new Promise(res => { const iv = setInterval(() => {
            const dt = 0.006;
            if (holding) { R.shadow = Math.max(0.1, R.shadow - dt); held += 60; }
            else { R.shadow = Math.min(0.62, R.shadow + dt); releasedTotal += 60; }
            const p = releasedTotal / D(30000);
            if (!said.a && p > 0.25) { said.a = true; cap({ who: "修道院长老", cls: "dim", t: "滚开！你们这些邪恶的东西！在虔诚还有力量的地方，没有你们的用武之地！" }); }
            if (!said.b && p > 0.55) { said.b = true; cap({ who: "精灵", cls: "dim", t: "倔强的凡人……难道你是真的如此热爱生命，热爱那给你带来不幸的生命吗？" }); }
            if (releasedTotal >= D(30000) || held >= D(12000)) { clearInterval(iv); res(); }
          }, 60); });
          window.removeEventListener("pointerup", off);
          clearPrompts();
          /* 结局按剧本进行 */
          await say([
            { who: "曼弗雷德", cls: "big", t: "死神的手已经触到我的身体了——但那不是你们的手啊！" },
            { cls: "dim", t: "（众魔鬼隐去。老人跪在床边。）" },
            { who: "修道院长老", t: "凉的！凉了！简直是彻心地凉呀！可是作一次祈祷吧！" },
            { who: "曼弗雷德", cls: "big", t: "老人家！要死并不太难啊！" }
          ]);
          state.fadeTarget = 1; setLamp(0, false);
          await new Promise(r => setTimeout(r, D(1600)));
          await cap({ who: "修道院长老", cls: "dim", t: "他去了——他的灵魂已经凌空飞去。飞往哪里？我不敢去想——可是他去了。" });
          state.flags.midnightDone = true;
          gotoRoom(9);
        } }
    ]
  });

  /* —— 雪廊（出口） —— */
  ROOMS.push({
    id: "snow", no: "出口 · 雪廊", title: "雪停之前",
    quote: "「我们做不到。——七个精灵」",
    audio: "snow", lamp: 0, lit: false, parts: makeParts("snow"),
    draw(ctx, E) {
      vg(ctx, [["#b8c6da", 0], ["#d5deea", .6], ["#eef2f7", 1]]);
      const hy = H * 0.6;
      /* 雪廊两壁 */
      ctx.fillStyle = "#c3cfe0";
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W / 2 - W * 0.1 + lk(0.7) * 0.4, hy * 0.3); ctx.lineTo(W / 2 - W * 0.1, hy); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(W, 0); ctx.lineTo(W / 2 + W * 0.1 + lk(0.7) * 0.4, hy * 0.3); ctx.lineTo(W / 2 + W * 0.1, hy); ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
      /* 地面与脚印 */
      ctx.fillStyle = "#dbe3ee"; ctx.fillRect(0, hy, W, H - hy);
      for (let i = 1; i <= 6; i++) {
        const yy = hy + Math.pow(i / 6, 1.8) * (H - hy);
        ctx.strokeStyle = "rgba(140,158,185,.25)";
        ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(W, yy); ctx.stroke();
      }
      for (let f = 0; f < state.footprints; f++) {
        const fy = hy + H * 0.06 + f * H * 0.05;
        const side = f % 2 === 0 ? -1 : 1;
        ctx.fillStyle = "rgba(120,138,165,.4)";
        ctx.beginPath();
        ctx.ellipse(W / 2 + side * W * 0.012, fy, W * 0.004, H * 0.008, side * 0.15, 0, 6.28);
        ctx.fill();
      }
      /* 尽头之墙 */
      const wy = hy * 0.34;
      ctx.fillStyle = "rgba(70,84,108,.85)";
      ctx.fillRect(W / 2 - W * 0.11 + lk(0.9) * 0.2, wy - H * 0.16, W * 0.22, H * 0.16);
      ctx.fillStyle = "rgba(238,242,247,.9)";
      ctx.font = `${Math.round(Math.max(12, H * 0.018))}px ${getComputedStyle(document.body).fontFamily}`;
      ctx.textAlign = "center";
      ctx.fillText("我们做不到。", W / 2 + lk(0.9) * 0.2, wy - H * 0.07);
      drawParts(ctx, this.parts, E.dt, E);
    },
    nodes: [
      { id: "w1", label: "踏雪", z: 0.25, async arrive() {
          document.body.classList.add("snowlight");
          await cap({ cls: "dim", t: "灯油已尽。山里的雪，下了一夜。你走过的每一步都留在雪里。" });
          setPrompts([{ label: "走向尽头的墙", primary: true, on() { walkTo(1); } }]);
        } },
      { id: "wall", label: "墙", z: 0.75, async arrive() {
          clearPrompts();
          const tryForget = async (btn) => {
            btn.classList.add("shake");
            audio.bellStrike("dark");
            setTimeout(() => btn.classList.remove("shake"), 1200);
            await cap({ cls: "metaline", t: "（按钮不会亮。从来不会。）" });
            setPrompts([
              { label: "再试一次", ghost: true, cls: "forget", id: "forget-btn", on() { tryForget($("#forget-btn")); } },
              { label: "走向出口", primary: true, on() { walkTo(2); } }
            ]);
          };
          setPrompts([{ label: "忘却", primary: true, id: "forget-btn", on() { tryForget($("#forget-btn")); } }]);
          await say([{ cls: "dim", t: "墙上只有一行小字。你最后一次伸手，按向那颗「忘却」。" }]);
        } },
      { id: "out", label: "出口", z: 0.95, async arrive() {
          clearPrompts();
          /* 雪停 */
          const R = ROOMS[state.room];
          const target = R.parts.length;
          await new Promise(res => { const iv = setInterval(() => {
            if (R.parts.length > 0) R.parts.pop();
            if (R.parts.length === 0) { clearInterval(iv); res(); }
          }, 30); });
          $("#credits .footnote").textContent = `你的脚印留在了雪里——共 ${state.footprints} 步。`;
          $("#credits").classList.add("show");
        } }
    ]
  });

  /* ================= 行走与转场 ================= */
  const canvas = $("#stage");
  const ctx2 = canvas.getContext("2d");
  let dpr = 1;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    ctx2.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  function walkTo(idx) {
    if (state.walking) return;
    const R = ROOMS[state.room];
    const from = R.nodes[state.node].z, to = R.nodes[idx].z;
    state.walking = { from, to, t0: performance.now(), ms: D(Math.abs(to - from) * 2600 + 700) };
    clearPrompts();
    const check = setInterval(() => {
      const w = state.walking;
      if (!w) { clearInterval(check); return; }
      if (performance.now() - w.t0 >= w.ms) {
        clearInterval(check);
        state.walking = null;
        state.node = idx;
        if (state.room === 9) state.footprints++; /* 雪廊：每一步都留下脚印 */
        R.nodes[idx].arrive && R.nodes[idx].arrive();
      }
    }, 80);
  }

  async function gotoRoom(i) {
    clearPrompts();
    state.walking = null;
    state.fadeTarget = 1;
    document.body.classList.remove("snowlight");
    await new Promise(r => setTimeout(r, D(900)));
    state.room = i; state.node = 0;
    const R = ROOMS[i];
    audio.apply(R.audio);
    if (i === 9) document.body.classList.add("snowlight");
    setLamp(R.lamp, R.lit);
    planCur(i);
    showPlate(R.no, R.title, R.quote);
    state.fadeTarget = 0;
    await new Promise(r => setTimeout(r, D(700)));
    R.nodes[0].arrive && R.nodes[0].arrive();
  }

  /* ================= 主循环 ================= */
  let lastTs = 0;
  function loop(ts) {
    const dt = Math.min(60, ts - (lastTs || ts)); lastTs = ts;
    state.look += (state.lookT - state.look) * 0.06;
    state.fade += (state.fadeTarget - state.fade) * (REDUCED ? 1 : 0.05);
    const R = ROOMS[state.room];
    const E = { t: ts, dt, room: R };
    if (R) {
      let bob = 0, zoom = 0;
      if (state.walking) {
        const w = state.walking;
        const p = ease(clamp01((ts - w.t0) / w.ms));
        zoom = w.from + (w.to - w.from) * p;
        bob = Math.sin(p * Math.PI * 3) * H * 0.006;
      } else {
        zoom = R.nodes[state.node] ? R.nodes[state.node].z : 0;
      }
      E.zoom = zoom; E.bob = bob;
      ctx2.save();
      ctx2.translate(0, bob);
      R.draw(ctx2, E);
      ctx2.restore();
    } else {
      ctx2.fillStyle = "#04060c"; ctx2.fillRect(0, 0, W, H);
    }
    if (state.fade > 0.005) {
      ctx2.fillStyle = `rgba(3,5,10,${state.fade})`;
      ctx2.fillRect(0, 0, W, H);
    }
    requestAnimationFrame(loop);
  }

  window.addEventListener("pointermove", (e) => {
    state.lookT = e.clientX / window.innerWidth;
  }, { passive: true });
  /* 移动端：轻触左右半屏环视 */
  canvas.addEventListener("click", (e) => {
    const R = ROOMS[state.room];
    if (R && R.click && R.click(e.clientX, e.clientY)) return;
  });
  window.addEventListener("keydown", (e) => {
    if (!state.started) return;
    if (e.key === "Enter" || e.key === " ") {
      const first = promptsEl.querySelector("button:not(.ghost)");
      if (first && !state.walking) { e.preventDefault(); first.click(); }
    }
  });

  /* ================= 入场 ================= */
  $("#audio-toggle").addEventListener("click", () => {
    const muted = audio.toggleMute();
    $("#audio-toggle").textContent = muted ? "音效 关" : "音效 开";
  });
  $("#enter-btn").addEventListener("click", () => {
    $("#gate").classList.add("hidden");
    audio.start();
    state.started = true;
    const R = ROOMS[0];
    audio.apply(R.audio);
    setLamp(0, false);
    planCur(0);
    showPlate(R.no, R.title, R.quote);
    state.fadeTarget = 0;
    setTimeout(() => R.nodes[0].arrive(), D(1200));
  });

  buildPlan();
  requestAnimationFrame(loop);
})();
