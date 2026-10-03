/*!
 * 晴天以后 · v2  |  stage.js
 * 舞台：四层视差 SVG + 天气粒子画布 + 光照叠加 + 场景转场。
 */
(function (global) {
  'use strict';
  const SP = global.SP;
  const { $, h, clamp, lerp, rng } = SP;

  const Stage = {
    el: null,
    world: null,
    layers: {},
    canvas: null,
    ctx: null,
    dpr: 1,
    w: 0,
    hgt: 0,
    scene: null,          // 初始为 null，保证首个场景一定会被构建
    time: 'day',
    weather: 'clear',
    transition: 'fade',
    parallax: { x: 0, y: 0, tx: 0, ty: 0 },
    particles: [],
    weatherMix: 0,      // 0 无雨 → 1 暴雨
    targetMix: 0,
    snowMix: 0,
    targetSnow: 0,
    raf: null,
    reduced: false,
    busy: false,
  };

  const DEPTH = { far: 0.22, mid: 0.46, near: 0.78, fore: 1.12, celestial: 0.12, clouds: 0.3 };

  /* -------------------------------- 初始化 ------------------------------- */

  function init(root) {
    Stage.reduced = global.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    Stage.el = h('div.stage', { id: 'stage', 'aria-hidden': 'true' });
    Stage.world = h('div.world');
    for (const k of ['far', 'mid', 'near', 'fore']) {
      Stage.layers[k] = h('div.layer.l-' + k, { data: { depth: k } });
      Stage.world.append(Stage.layers[k]);
    }
    Stage.celestial = h('div.celestial', {}, h('div.sun'), h('div.moon'), h('div.sun-halo'));
    Stage.clouds = h('div.clouds');
    // 星空：所有场景共用一层，透明度由 --star-a 控制
    Stage.stars = h('div.starlayer', { html: SP.art.stars(20260917, 170, 560) });
    Stage.shoot = h('div.shoot', {}, h('i'), h('i'));
    Stage.world.prepend(Stage.clouds, Stage.celestial, Stage.stars, Stage.shoot);

    Stage.canvas = h('canvas.fx');
    // 光照组：光柱 → 太阳 bloom → 虚焦光斑 → 湿地反光 → 暗角 → 颗粒
    Stage.bloom = h('div.sun-bloom');
    Stage.bokeh = h('div.bokeh', {},
      ...Array.from({ length: 8 }, (_, i) => h('i', { data: { i: i + 1 } })));
    Stage.light = h('div.light', {}, h('div.rays'), Stage.bloom, Stage.bokeh, h('div.wet'), h('div.vignette'), h('div.grain'));
    Stage.el.append(Stage.world, Stage.canvas, Stage.light);
    root.prepend(Stage.el);

    Stage.ctx = Stage.canvas.getContext('2d');
    resize();
    global.addEventListener('resize', resize);
    if (!Stage.reduced) {
      global.addEventListener('pointermove', onPointer, { passive: true });
      global.addEventListener('pointerleave', () => {
        Stage.parallax.tx = 0;
        Stage.parallax.ty = 0;
      });
    }
    buildClouds();
    loop();
    return Stage;
  }

  function buildClouds() {
    const defs = [
      { top: 12, left: 6, scale: 1.0, dur: 96, seed: 2, cls: 'c1' },
      { top: 22, left: 46, scale: 0.68, dur: 128, seed: 5, cls: 'c2' },
      { top: 7, left: 68, scale: 1.25, dur: 150, seed: 9, cls: 'c3' },
      { top: 31, left: 24, scale: 0.52, dur: 176, seed: 13, cls: 'c4' },
      { top: 17, left: 84, scale: 0.8, dur: 112, seed: 17, cls: 'c5' },
    ];
    Stage.clouds.innerHTML = defs
      .map(
        (d) =>
          `<div class="cloud ${d.cls}" style="--top:${d.top}%;--left:${d.left}%;--s:${d.scale};--dur:${d.dur}s">${SP.cloudShape(d.seed)}</div>`
      )
      .join('');
  }

  function resize() {
    if (!Stage.canvas || !Stage.el) return;
    const r = Stage.el.getBoundingClientRect();
    Stage.w = r.width || 1280;
    Stage.hgt = r.height || 720;
    Stage.dpr = Math.min(global.devicePixelRatio || 1, 2);
    Stage.canvas.width = Math.floor(Stage.w * Stage.dpr);
    Stage.canvas.height = Math.floor(Stage.hgt * Stage.dpr);
    Stage.canvas.style.width = Stage.w + 'px';
    Stage.canvas.style.height = Stage.hgt + 'px';
    if (Stage.ctx) Stage.ctx.setTransform(Stage.dpr, 0, 0, Stage.dpr, 0, 0);
    seedParticles();
  }

  /* -------------------------------- 视差 --------------------------------- */

  function onPointer(e) {
    const r = Stage.el.getBoundingClientRect();
    Stage.parallax.tx = clamp((e.clientX - r.left) / r.width - 0.5, -0.5, 0.5) * 2;
    Stage.parallax.ty = clamp((e.clientY - r.top) / r.height - 0.5, -0.5, 0.5) * 2;
  }

  function applyParallax() {
    if (Stage.reduced) return;
    const p = Stage.parallax;
    p.x = lerp(p.x, p.tx, 0.06);
    p.y = lerp(p.y, p.ty, 0.06);
    if (Math.abs(p.x - p.tx) < 0.001 && Math.abs(p.y - p.ty) < 0.001) return;
    for (const k in Stage.layers) {
      const d = DEPTH[k] || 0.5;
      Stage.layers[k].style.transform = `translate3d(${(-p.x * 14 * d).toFixed(2)}px, ${(-p.y * 8 * d).toFixed(2)}px, 0) scale(${(1 + d * 0.012).toFixed(4)})`;
    }
    Stage.celestial.style.transform = `translate3d(${(-p.x * 8).toFixed(2)}px, ${(-p.y * 5).toFixed(2)}px, 0)`;
    Stage.clouds.style.transform = `translate3d(${(-p.x * 10).toFixed(2)}px, 0, 0)`;
  }

  /* ------------------------------- 场景渲染 ------------------------------ */

  function buildScene(sceneKey) {
    const parts = SP.art.build(sceneKey);
    Stage.layers.far.innerHTML = parts.far || '';
    Stage.layers.mid.innerHTML = parts.mid || '';
    Stage.layers.near.innerHTML = parts.near || '';
    Stage.layers.fore.innerHTML = parts.fore || '';
    Stage.scene = sceneKey;
    Stage.el.dataset.scene = sceneKey;
    seedParticles();
  }

  /**
   * 切换场景
   * @param {string} sceneKey
   * @param {{time?:string,weather?:string,transition?:string,instant?:boolean}} opts
   */
  function setScene(sceneKey, opts = {}) {
    const time = opts.time || Stage.time;
    const weather = opts.weather || Stage.weather;
    const transition = opts.transition || 'fade';
    const changedScene = sceneKey !== Stage.scene;

    Stage.time = time;
    Stage.weather = weather;

    // 调色：改 CSS 变量，@property 会让颜色平滑过渡
    SP.palette.applyTheme(Stage.el, sceneKey, time, weather);
    setWeatherMix(weather);

    if (!changedScene) {
      Stage.el.dataset.transition = transition;
      return;
    }

    if (opts.instant || Stage.reduced) {
      buildScene(sceneKey);
      return;
    }

    // 转场：把当前四层整块复制成 ghost，再渲染新场景，最后淡出 ghost
    const ghost = h('div.world.ghost', { data: { t: transition } });
    for (const k of ['far', 'mid', 'near', 'fore']) ghost.append(Stage.layers[k].cloneNode(true));
    Stage.world.after(ghost);
    Stage.el.dataset.transition = transition;
    Stage.busy = true;

    buildScene(sceneKey);
    // 新场景的四个层从“被推开”的位置进来
    const enters = { fade: 0, slide: 1, zoom: 1, wipe: 0, slowfade: 0 };
    const mode = enters[transition] ? transition : 'fade';
    for (const k of ['far', 'mid', 'near', 'fore']) {
      Stage.layers[k].classList.add('enter', 'enter-' + mode);
    }
    requestAnimationFrame(() => {
      for (const k of ['far', 'mid', 'near', 'fore']) Stage.layers[k].classList.remove('enter', 'enter-' + mode);
      ghost.classList.add('gone');
      setTimeout(() => {
        ghost.remove();
        Stage.busy = false;
      }, transition === 'slowfade' ? 1600 : 900);
    });
    if (transition === 'slowfade') ghost.dataset.t = 'slowfade';
  }

  function setTime(timeKey, sceneKey) {
    if (timeKey === Stage.time && !sceneKey) return;
    Stage.time = timeKey;
    SP.palette.applyTheme(Stage.el, sceneKey || Stage.scene, timeKey, Stage.weather);
  }

  function setWeather(w) {
    Stage.weather = w;
    SP.palette.applyTheme(Stage.el, Stage.scene, Stage.time, w);
    setWeatherMix(w);
  }

  function setWeatherMix(w) {
    const cfg = SP.palette.WEATHERS[w] || SP.palette.WEATHERS.clear;
    Stage.targetMix = cfg.rain || 0;
    Stage.targetSnow = cfg.snow || 0;
    Stage.el.dataset.weather = w;
  }

  /* ------------------------------- 粒子系统 ------------------------------ */

  function seedParticles() {
    const area = Math.max(Stage.w * Stage.hgt, 1);
    const n = Stage.reduced ? 0 : Math.round(clamp(area / 5200, 60, 260));
    // Stage.scene 初始为 null（尚未构建任何场景），这里必须容错
    const key = Stage.scene || 'boot';
    const r = rng(9871 + key.length * 31);
    Stage.particles = [];
    for (let i = 0; i < n; i++) {
      Stage.particles.push({
        x: r() * Stage.w,
        y: r() * Stage.hgt,
        z: 0.35 + r() * 0.65,              // 深度：影响大小与速度
        vx: (r() - 0.5) * 0.6,
        vy: 0.4 + r() * 1.1,
        ph: r() * Math.PI * 2,
        rs: 0.6 + r() * 1.6,
      });
    }
  }

  /** 常驻浮尘：慢慢往上浮的小光点。房间和户外都用得上，透明度压得很低 */
  function drawMotes(dt) {
    const ctx = Stage.ctx;
    const W = Stage.w, H = Stage.hgt;
    const n = Math.min(Stage.particles.length, 56);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const p = Stage.particles[i];
      p.ph += dt * (0.24 + p.z * 0.4);
      p.y -= (5 + p.z * 13) * dt;
      p.x += Math.sin(p.ph) * 9 * dt;
      if (p.y < -10) { p.y = H + 10; p.x = Math.random() * W; }
      const r = 0.45 + p.z * 1.25;
      const a = 0.035 + p.z * 0.075;
      ctx.fillStyle = 'rgba(255, 246, 226, ' + a.toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawParticles(dt) {
    const ctx = Stage.ctx;
    if (!ctx) return;
    const W = Stage.w, H = Stage.hgt;
    ctx.clearRect(0, 0, W, H);
    const rain = Stage.weatherMix;
    const snow = Stage.targetSnow;

    drawMotes(dt);                                  // 常驻：一点点浮尘，画面才有空气
    if (rain < 0.02 && snow < 0.02) return;

    ctx.save();
    if (rain >= 0.02) {
      ctx.strokeStyle = 'rgba(214,232,240,0.55)';
      ctx.lineWidth = 1.1;
      ctx.lineCap = 'round';
      const count = Math.floor(Stage.particles.length * rain);
      const speed = 900 + rain * 700;
      const slant = 90 + rain * 70;
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const p = Stage.particles[i];
        p.y += speed * p.z * dt;
        p.x += slant * p.z * dt;
        if (p.y > H + 20) { p.y = -20; p.x = Math.random() * W * 1.2 - W * 0.1; }
        if (p.x > W + 30) p.x = -30;
        const len = 9 + p.z * 22 * (0.6 + rain);
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - slant * 0.028 * len * 0.5, p.y + len);
      }
      ctx.stroke();
    }

    if (snow >= 0.02) {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      const count = Math.floor(Stage.particles.length * snow);
      for (let i = 0; i < count; i++) {
        const p = Stage.particles[i];
        p.ph += dt * 1.4;
        p.y += (26 + p.z * 60) * dt;
        p.x += Math.sin(p.ph) * 22 * dt;
        if (p.y > H) { p.y = -8; p.x = Math.random() * W; }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.rs * 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /* --------------------------------- 主循环 ------------------------------ */

  let last = 0;

  function loop(t) {
    Stage.raf = requestAnimationFrame(loop);
    const now = t || 0;
    const dt = Math.min((now - last) / 1000 || 0.016, 0.05);
    last = now;
    if (document.hidden) return;

    Stage.weatherMix = lerp(Stage.weatherMix, Stage.targetMix, Math.min(1, dt * 1.6));
    applyParallax();
    if (!Stage.reduced) drawParticles(dt);
  }

  /** 章节切换时的白场 */
  function wash(ms = 460) {
    const w = Stage.light.querySelector('.wash') || h('div.wash');
    if (!w.parentNode) Stage.light.append(w);
    w.classList.add('active');
    setTimeout(() => w.classList.remove('active'), ms);
  }

  /**
   * 手动推进一帧（视差 + 粒子）。给截图工装和自动化测试用：
   * headless 环境合成帧极少，靠 rAF 跑不到天气效果，这里可以确定性地画。
   * @param {number} dt 秒
   */
  function renderFrame(dt = 0.016) {
    if (Stage.reduced) return;
    applyParallax();
    drawParticles(dt);
  }

  SP.stage = Object.assign(Stage, {
    init, setScene, setTime, setWeather, buildScene, wash, resize, renderFrame,
  });
})(window);
