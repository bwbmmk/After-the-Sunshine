/*!
 * 晴天以后 · v2  |  art.js
 * 参数化 SVG 场景引擎。所有颜色都引用 CSS 变量（--c-*），
 * 因此调色引擎改一个变量，整幅画就会重新上色。
 */
(function (global) {
  'use strict';
  const SP = global.SP;
  const { rng } = SP;

  const W = 1600, H = 900, HORIZON = 520;

  /* ------------------------------- 基础工具 ------------------------------- */

  const n = (v) => Math.round(v * 10) / 10;

  /** 平滑折线点集 → 贝塞尔路径 */
  function smooth(pts) {
    let d = `M ${n(pts[0][0])} ${n(pts[0][1])}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || pts[i + 1];
      d += ` C ${n(p1[0] + (p2[0] - p0[0]) / 6)} ${n(p1[1] + (p2[1] - p0[1]) / 6)}` +
           ` ${n(p2[0] - (p3[0] - p1[0]) / 6)} ${n(p2[1] - (p3[1] - p1[1]) / 6)}` +
           ` ${n(p2[0])} ${n(p2[1])}`;
    }
    return d;
  }

  /** 折线点集 → 直线路径 */
  function poly(pts) {
    return pts.map((p, i) => `${i ? 'L' : 'M'} ${n(p[0])} ${n(p[1])}`).join(' ');
  }

  function svg(inner, cls = '') {
    return `<svg class="${cls}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${inner}</svg>`;
  }

  /** 用基础色生成细腻的渐变，避免大色块 */
  function grad(id, stops, x2 = 0, y2 = 1) {
    const s = stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a != null ? ` stop-opacity="${a}"` : ''}/>`).join('');
    return `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${s}</linearGradient>`;
  }
  function rgrad(id, stops) {
    const s = stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a != null ? ` stop-opacity="${a}"` : ''}/>`).join('');
    return `<radialGradient id="${id}">${s}</radialGradient>`;
  }

  /* -------------------------------- 图元库 -------------------------------- */

  /** 远山：一层柔和的丘陵 */
  function hills(y, amp, color, seed, opacity = 1) {
    const r = rng(seed);
    const pts = [];
    const N = 7;
    for (let i = 0; i <= N; i++) {
      pts.push([-80 + ((W + 160) * i) / N, y - amp * (0.25 + 0.75 * r())]);
    }
    pts[0][1] = y - amp * 0.15;
    pts[N][1] = y - amp * 0.15;
    return `<path d="${smooth(pts)} L ${W + 80} ${H + 80} L -80 ${H + 80} Z" fill="${color}" opacity="${opacity}"/>`;
  }

  /** 起伏的地面 / 草地 */
  function groundLine(y, color, seed, amp = 16) {
    const r = rng(seed);
    const pts = [];
    for (let i = 0; i <= 8; i++) pts.push([-80 + ((W + 160) * i) / 8, y - amp * r()]);
    return `<path d="${smooth(pts)} L ${W + 80} ${H + 80} L -80 ${H + 80} Z" fill="${color}"/>`;
  }

  /** 一棵树：树干 + 三团树冠，确定性随机让每棵都不同 */
  function tree(x, y, s, seed, leafVar = 'var(--c-leaf)', leafVar2 = 'var(--c-leaf2)') {
    const r = rng(seed);
    const h = 210 * s;
    const trunk = `<path d="M ${n(x - 6 * s)} ${n(y)} q ${n(3 * s)} ${n(-h * 0.5)} ${n(2 * s)} ${n(-h)} l ${n(8 * s)} 0 q ${n(4 * s)} ${n(h * 0.55)} ${n(3 * s)} ${n(h)} z" fill="var(--c-trunk)"/>`;
    let canopy = '';
    const blobs = [
      [0, -h * 1.02, 84 * s, 70 * s],
      [-46 * s, -h * 0.82, 62 * s, 52 * s],
      [48 * s, -h * 0.86, 66 * s, 55 * s],
      [8 * s, -h * 1.24, 56 * s, 44 * s],
      [-18 * s, -h * 1.16, 46 * s, 38 * s],
    ];
    blobs.forEach((b, i) => {
      const jx = (r() - 0.5) * 16 * s, jy = (r() - 0.5) * 12 * s;
      canopy += `<ellipse cx="${n(x + b[0] + jx)}" cy="${n(y + b[1] + jy)}" rx="${n(b[2])}" ry="${n(b[3])}" fill="${i % 2 ? leafVar2 : leafVar}"/>`;
    });
    return `<g class="obj-tree">${trunk}${canopy}</g>`;
  }

  /** 建筑：墙体 + 屋顶 + 窗格（夜里会亮灯） */
  function building(x, y, w, hgt, opts = {}) {
    const o = Object.assign(
      { wall: 'var(--c-wall)', roof: 'var(--c-roof)', cols: 4, rows: 3, lit: 0.55, seed: 7, roofStyle: 'flat', win: 'var(--c-glass)', scale: 1 },
      opts
    );
    const r = rng(o.seed);
    let s = `<rect x="${n(x)}" y="${n(y - hgt)}" width="${n(w)}" height="${n(hgt)}" fill="${o.wall}"/>`;
    // 屋顶
    if (o.roofStyle === 'gable') {
      s += `<path d="M ${n(x - w * 0.07)} ${n(y - hgt)} L ${n(x + w / 2)} ${n(y - hgt - w * 0.16)} L ${n(x + w * 1.07)} ${n(y - hgt)} Z" fill="${o.roof}"/>`;
    } else {
      s += `<rect x="${n(x - w * 0.03)}" y="${n(y - hgt - 12)}" width="${n(w * 1.06)}" height="${n(14)}" fill="${o.roof}"/>`;
    }
    // 窗
    const padX = w * 0.1, padY = hgt * 0.12;
    const cw = (w - padX * 2) / o.cols, ch = (hgt - padY * 2) / o.rows;
    for (let i = 0; i < o.cols; i++) {
      for (let j = 0; j < o.rows; j++) {
        const wx = x + padX + i * cw + cw * 0.16;
        const wy = y - hgt + padY + j * ch + ch * 0.14;
        const ww = cw * 0.68, wh = ch * 0.62;
        s += `<rect x="${n(wx)}" y="${n(wy)}" width="${n(ww)}" height="${n(wh)}" fill="${o.win}"/>`;
        if (r() < o.lit) {
          s += `<rect class="win-lit" x="${n(wx)}" y="${n(wy)}" width="${n(ww)}" height="${n(wh)}" fill="var(--c-warm)" opacity="var(--lamp-a)"/>`;
        }
        s += `<rect x="${n(wx + ww / 2 - 1)}" y="${n(wy)}" width="2" height="${n(wh)}" fill="var(--c-wall2)" opacity=".7"/>`;
      }
    }
    return `<g class="obj-building">${s}</g>`;
  }

  /** 灌木 / 花坛 */
  function bush(x, y, s, seed, color = 'var(--c-leaf2)') {
    const r = rng(seed);
    let s2 = '';
    for (let i = 0; i < 5; i++) {
      s2 += `<ellipse cx="${n(x + (r() - 0.5) * 90 * s)}" cy="${n(y - r() * 34 * s)}" rx="${n((34 + r() * 26) * s)}" ry="${n((24 + r() * 16) * s)}" fill="${color}"/>`;
    }
    return `<g opacity=".92">${s2}</g>`;
  }

  /** 云（CSS 负责飘动，这里只给形状） */
  function cloud(seed) {
    const r = rng(seed);
    let s = '';
    const base = 26 + r() * 16;
    for (let i = 0; i < 5; i++) {
      s += `<ellipse cx="${n(i * 46 - 90)}" cy="${n(-r() * 16)}" rx="${n(34 + r() * 40)}" ry="${n(base + r() * 12)}"/>`;
    }
    return `<g fill="#ffffff">${s}</g>`;
  }

  /** 星空 */
  function stars(seed, count = 130, maxY = HORIZON) {
    const r = rng(seed);
    let s = '';
    for (let i = 0; i < count; i++) {
      const x = r() * W, y = r() * maxY * 0.92;
      const rad = r() < 0.88 ? 1.2 : 2.1;
      const op = 0.35 + r() * 0.65;
      s += `<circle cx="${n(x)}" cy="${n(y)}" r="${rad}" fill="#fff" opacity="${op.toFixed(2)}"/>`;
    }
    return `<g class="stars-g" opacity="var(--star-a)">${s}</g>`;
  }

  /** 石板 / 砖路 */
  function brickPath(x0, x1, yTop, yBottom, color = 'var(--c-path)') {
    return `<path d="${poly([[x0, yTop], [x1, yTop], [x1 + 220, yBottom], [x0 - 220, yBottom]])}" fill="${color}"/>`;
  }

  /** 简单人物剪影（远景群众用） */
  function figure(x, y, s, color = 'var(--c-ink)', seed = 1) {
    const r = rng(seed);
    const hh = 74 * s * (0.92 + r() * 0.18);
    return (
      `<g opacity=".78"><circle cx="${n(x)}" cy="${n(y - hh)}" r="${n(hh * 0.155)}" fill="${color}"/>` +
      `<path d="M ${n(x - hh * 0.2)} ${n(y)} q ${n(hh * 0.03)} ${n(-hh * 0.72)} ${n(hh * 0.2)} ${n(-hh * 0.72)} q ${n(hh * 0.17)} 0 ${n(hh * 0.2)} ${n(hh * 0.72)} z" fill="${color}"/></g>`
    );
  }

  /** 前景草坡：柔和的暗色剪影 + 细草叶，避免出现生硬的色块 */
  function grassFore(yTop, opacity = 0.45, seed = 1, tuftColor = 'var(--c-leaf)') {
    const r = rng(seed);
    const pts = [];
    for (let i = 0; i <= 9; i++) pts.push([-80 + ((W + 160) * i) / 9, yTop + (r() - 0.5) * 30]);
    let s = `<path d="${smooth(pts)} L ${W + 80} ${H + 60} L -80 ${H + 60} Z" fill="var(--c-ground2)" opacity="${opacity}"/>`;
    let tufts = '';
    for (let i = 0; i < 30; i++) {
      const x = r() * W, y2 = yTop + 10 + r() * 70;
      const hh2 = 18 + r() * 46;
      tufts += `<path d="M ${n(x)} ${n(y2)} q ${n((r() - 0.5) * 14)} ${n(-hh2 * 0.6)} ${n((r() - 0.5) * 20)} ${n(-hh2)}" stroke="${tuftColor}" stroke-width="${n(2 + r() * 3.4)}" fill="none" opacity=".45" stroke-linecap="round"/>`;
    }
    return s + `<g>${tufts}</g>`;
  }

  /** 地平线雾气带 */
  function hazeBand(y, hgt = 120, alpha = 0.5) {
    return (
      `<rect x="0" y="${n(y - hgt / 2)}" width="${W}" height="${n(hgt)}" fill="var(--c-far)" opacity="${(alpha * 0.5).toFixed(2)}" filter="blur(18px)"/>` +
      `<rect x="0" y="${n(y - hgt / 3)}" width="${W}" height="${n(hgt / 1.6)}" fill="#ffffff" opacity="${(alpha * 0.16).toFixed(2)}" filter="blur(26px)"/>`
    );
  }

  /** 长椅 */
  function bench(x, y, s) {    return (
      `<g><rect x="${n(x)}" y="${n(y)}" width="${n(120 * s)}" height="${n(9 * s)}" rx="3" fill="var(--c-wood)"/>` +
      `<rect x="${n(x)}" y="${n(y - 22 * s)}" width="${n(120 * s)}" height="${n(7 * s)}" rx="3" fill="var(--c-wood)"/>` +
      `<rect x="${n(x + 8 * s)}" y="${n(y + 9 * s)}" width="${n(7 * s)}" height="${n(26 * s)}" fill="var(--c-metal)"/>` +
      `<rect x="${n(x + 105 * s)}" y="${n(y + 9 * s)}" width="${n(7 * s)}" height="${n(26 * s)}" fill="var(--c-metal)"/></g>`
    );
  }

  /** 路灯：灯头夜里会亮 */
  function lamp(x, y, s, seed = 3) {
    const r = rng(seed);
    const hh = 250 * s;
    return (
      `<g><rect x="${n(x)}" y="${n(y - hh)}" width="${n(9 * s)}" height="${n(hh)}" fill="var(--c-metal)"/>` +
      `<path d="M ${n(x - 14 * s)} ${n(y - hh)} q ${n(18 * s)} ${n(-26 * s)} ${n(36 * s)} 0 z" fill="var(--c-metal)"/>` +
      `<circle cx="${n(x + 4 * s)}" cy="${n(y - hh + 8 * s)}" r="${n(13 * s)}" fill="var(--c-lamp)" opacity="var(--lamp-a)"/>` +
      `<circle cx="${n(x + 4 * s)}" cy="${n(y - hh + 8 * s)}" r="${n(46 * s)}" fill="var(--c-lamp)" opacity="${(0.16 * (0.4 + r() * 0.2)).toFixed(2)}" class="lamp-halo"/></g>`
    );
  }

  /* ------------------------------ 室内通用件 ------------------------------ */

  /** 窗户（外面透出天空色，夜里透出暖灯） */
  function window4(x, y, w, hgt, panesX = 2, panesY = 2, sill = true) {
    let s = `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(hgt)}" rx="4" fill="var(--c-glass)"/>`;
    s += `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(hgt)}" rx="4" fill="var(--c-warm)" opacity="${'calc(var(--lamp-a) * .35)'}" class="win-warm"/>`;
    for (let i = 1; i < panesX; i++) s += `<rect x="${n(x + (w * i) / panesX - 3)}" y="${n(y)}" width="6" height="${n(hgt)}" fill="var(--c-wall)"/>`;
    for (let j = 1; j < panesY; j++) s += `<rect x="${n(x)}" y="${n(y + (hgt * j) / panesY - 3)}" width="${n(w)}" height="6" fill="var(--c-wall)"/>`;
    s += `<rect x="${n(x - 10)}" y="${n(y - 10)}" width="${n(w + 20)}" height="${n(hgt + 20)}" rx="6" fill="none" stroke="var(--c-wall)" stroke-width="14"/>`;
    if (sill) s += `<rect x="${n(x - 22)}" y="${n(y + hgt + 8)}" width="${n(w + 44)}" height="14" rx="4" fill="var(--c-trim)"/>`;
    return s;
  }

  /** 课桌（俯视微透视） */
  function desk(x, y, w, s = 1) {
    const d = w * 0.34;
    return (
      `<g><path d="${poly([[x, y], [x + w, y], [x + w + d, y + d * 0.72], [x - d, y + d * 0.72]])}" fill="var(--c-wood)"/>` +
      `<rect x="${n(x + 8 * s)}" y="${n(y + d * 0.72)}" width="${n(w * 0.86)}" height="${n(d * 0.5)}" fill="var(--c-wall2)" opacity=".9"/></g>`
    );
  }

  function chair(x, y, s = 1) {
    return `<g opacity=".95"><rect x="${n(x)}" y="${n(y)}" width="${n(46 * s)}" height="${n(9 * s)}" rx="3" fill="var(--c-metal)"/>` +
      `<rect x="${n(x)}" y="${n(y + 9 * s)}" width="${n(46 * s)}" height="${n(38 * s)}" rx="4" fill="var(--c-metal)" opacity=".55"/>` +
      `<rect x="${n(x + 3 * s)}" y="${n(y + 47 * s)}" width="${n(40 * s)}" height="${n(30 * s)}" rx="3" fill="var(--c-metal)" opacity=".35"/></g>`;
  }

  /** 课桌 + 椅子一组，带落地阴影，读起来更像家具 */
  function deskPair(x, y, w, s = 1, seed = 1) {
    const d = w * 0.3;
    return (
      `<g class="obj-desk">` +
      `<ellipse cx="${n(x + w / 2)}" cy="${n(y + d * 1.5)}" rx="${n(w * 0.6)}" ry="${n(d * 0.42)}" fill="var(--c-ink)" opacity=".13"/>` +
      `<path d="${poly([[x, y], [x + w, y], [x + w + d, y + d * 0.68], [x - d, y + d * 0.68]])}" fill="var(--c-wood)"/>` +
      `<path d="${poly([[x - d, y + d * 0.68], [x + w + d, y + d * 0.68], [x + w + d, y + d * 1.08], [x - d, y + d * 1.08]])}" fill="var(--c-ink)" opacity=".45"/>` +
      `<path d="${poly([[x - d, y + d * 0.68], [x + w + d, y + d * 0.68], [x + w + d, y + d * 1.08], [x - d, y + d * 1.08]])}" fill="var(--c-wood)" opacity=".18"/>` +
      `<path d="${poly([[x, y], [x + w, y], [x + w + d, y + d * 0.68], [x - d, y + d * 0.68]])}" fill="#ffffff" opacity=".16"/>` +
      `<path d="M ${n(x + 14)} ${n(y + d * 0.7)} l 0 ${n(d * 0.42)} M ${n(x + w - 14)} ${n(y + d * 0.7)} l 0 ${n(d * 0.44)}" stroke="var(--c-ink)" stroke-width="3" opacity=".25"/>` +
      `<rect x="${n(x + w * 0.1)}" y="${n(y + d * 0.76)}" width="${n(w * 0.8)}" height="${n(d * 0.2)}" rx="3" fill="var(--c-wall2)" opacity=".45"/>` +
      chair(x + w * 0.18, y - 60 * s, s) +
      `</g>`
    );
  }

  /** 挂钟 */
  function clock(cx, cy, r = 30) {
    return (
      `<g><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="var(--c-wall)" stroke="var(--c-trim)" stroke-width="5"/>` +
      `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * 0.82)}" fill="#f7f4e8" opacity=".8"/>` +
      `<path d="M ${n(cx)} ${n(cy)} L ${n(cx)} ${n(cy - r * 0.5)} M ${n(cx)} ${n(cy)} L ${n(cx + r * 0.42)} ${n(cy + r * 0.2)}" stroke="var(--c-ink)" stroke-width="3.4" stroke-linecap="round"/>` +
      `<circle cx="${n(cx)}" cy="${n(cy)}" r="3" fill="var(--c-ink)"/></g>`
    );
  }

  /** 室内吸顶灯（条灯） */
  function ceilingLight(x, y, w, seed = 1) {
    return (
      `<g class="ceiling-light"><rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="14" rx="6" fill="var(--c-wall2)"/>` +
      `<rect x="${n(x + 8)}" y="${n(y + 2)}" width="${n(w - 16)}" height="9" rx="4" fill="var(--c-lamp)" opacity="var(--lamp-a)"/>` +
      `<ellipse cx="${n(x + w / 2)}" cy="${n(y + 40)}" rx="${n(w * 0.62)}" ry="${n(140)}" fill="url(#soft-light)" opacity="calc(var(--lamp-a) * .5)"/></g>`
    );
  }

  /** 灯泡串 / 挂灯 */
  function pendant(x, y, drop, seed = 1) {
    return (
      `<g><rect x="${n(x)}" y="0" width="3.5" height="${n(drop)}" fill="var(--c-ink)" opacity=".55"/>` +
      `<circle cx="${n(x + 1.7)}" cy="${n(drop + 12)}" r="13" fill="var(--c-lamp)" opacity="var(--lamp-a)"/>` +
      `<ellipse cx="${n(x + 1.7)}" cy="${n(drop + 60)}" rx="110" ry="80" fill="url(#soft-light)" opacity="var(--lamp-a)"/></g>`
    );
  }

  /** 书脊墙（书架） */
  function bookshelf(x, y, w, hgt, seed, rows = 5) {
    const r = rng(seed);
    const bookColors = ['#c47a6a', '#7d9e8c', '#c9a濃'.replace('濃', 'a06e'), '#8d93b5', '#b08fa8', '#9fae7f', '#d0b283'];
    let s = `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(hgt)}" fill="var(--c-wood)"/>`;
    const rowH = hgt / rows;
    for (let j = 0; j < rows; j++) {
      const ry = y + j * rowH;
      s += `<rect x="${n(x + w * 0.04)}" y="${n(ry + rowH * 0.12)}" width="${n(w * 0.92)}" height="${n(rowH * 0.74)}" fill="var(--c-ink)" opacity=".45"/>`;
      let bx = x + w * 0.06;
      while (bx < x + w * 0.94) {
        const bw = 6 + r() * 11, bh = rowH * (0.45 + r() * 0.28);
        const c = bookColors[Math.floor(r() * bookColors.length)];
        s += `<rect x="${n(bx)}" y="${n(ry + rowH * 0.86 - bh)}" width="${n(bw)}" height="${n(bh)}" fill="${c}" opacity="${(0.55 + r() * 0.4).toFixed(2)}"/>`;
        bx += bw + 1.5;
      }
      s += `<rect x="${n(x)}" y="${n(ry + rowH * 0.86)}" width="${n(w)}" height="${n(rowH * 0.12)}" fill="var(--c-trim)"/>`;
    }
    s += `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(hgt)}" fill="none" stroke="var(--c-trim)" stroke-width="10"/>`;
    return `<g class="obj-shelf">${s}</g>`;
  }

  /** 室内地面 + 后墙 */
  function roomShell(floorY, wallColor = 'var(--c-wall)', floorColor = 'var(--c-floor)') {
    return (
      `<rect x="0" y="0" width="${W}" height="${n(floorY)}" fill="${wallColor}"/>` +
      `<rect x="0" y="${n(floorY)}" width="${W}" height="${n(H - floorY)}" fill="${floorColor}"/>` +
      `<rect x="0" y="${n(floorY - 16)}" width="${W}" height="18" fill="var(--c-trim)" opacity=".9"/>`
    );
  }

  /** 黑板 */
  function blackboard(x, y, w, hgt, seed = 5) {
    const r = rng(seed);
    let chalk = '';
    for (let i = 0; i < 7; i++) {
      const cx = x + w * (0.08 + r() * 0.6);
      const cy = y + hgt * (0.2 + r() * 0.55);
      const len = 30 + r() * 120;
      chalk += `<rect x="${n(cx)}" y="${n(cy)}" width="${n(len)}" height="4" rx="2" fill="#eef3ea" opacity="${(0.18 + r() * 0.3).toFixed(2)}"/>`;
    }
    return (
      `<g><rect x="${n(x - 14)}" y="${n(y - 14)}" width="${n(w + 28)}" height="${n(hgt + 28)}" rx="8" fill="var(--c-wood)"/>` +
      `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(hgt)}" fill="#3c4f4a"/>` +
      `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(hgt)}" fill="url(#bb-sheen)"/>${chalk}` +
      `<rect x="${n(x - 20)}" y="${n(y + hgt + 16)}" width="${n(w + 40)}" height="12" rx="5" fill="var(--c-wood)"/></g>`
    );
  }

  function defsCommon() {
    return (
      `<defs>` +
      grad('bb-sheen', [[0, '#ffffff', 0.06], [0.5, '#ffffff', 0.02], [1, '#ffffff', 0]]) +
      rgrad('soft-light', [[0, 'var(--c-lamp)', 0.5], [0.55, 'var(--c-lamp)', 0.12], [1, 'var(--c-lamp)', 0]]) +
      grad('water-grad', [[0, 'var(--c-water)', 1], [1, 'var(--c-water2)', 1]]) +
      grad('wall-v', [[0, '#ffffff', 0.14], [0.6, '#ffffff', 0], [1, '#000000', 0.16]]) +
      rgrad('focus', [[0, 'var(--c-warm)', 0.35], [1, 'var(--c-warm)', 0]]) +
      // 地平线那一条暖光：把天地接起来，画面才不像两块布贴在一起
      grad('horizon-glow', [[0, 'var(--c-warm)', 0], [0.55, 'var(--c-warm)', 0.16], [1, 'var(--c-warm)', 0]]) +
      `</defs>`
    );
  }

  /* ---------------------------- 天空 / 天体层 ----------------------------- */

  function skyExtra(sceneKey, seed = 11) {
    // 云层由独立 DOM 层负责飘动，这里只放静态的远景霞光
    return svg(
      defsCommon() +
        `<g class="haze" opacity="var(--glow-a)">` +
        `<ellipse cx="${W * 0.72}" cy="${H * 0.2}" rx="520" ry="240" fill="var(--c-warm)" opacity=".18"/>` +
        `<ellipse cx="${W * 0.22}" cy="${H * 0.3}" rx="420" ry="190" fill="var(--c-warm)" opacity=".1"/>` +
        `<rect x="0" y="${HORIZON - 74}" width="${W}" height="140" fill="url(#horizon-glow)"/>` +
        `<ellipse cx="${W * 0.13}" cy="${HORIZON - 26}" rx="640" ry="128" fill="var(--sky-mid)" opacity=".2"/>` +
        `<ellipse cx="${W * 0.9}" cy="${HORIZON - 2}" rx="580" ry="116" fill="var(--sky-2)" opacity=".16"/>` +
        `</g>`
    );
  }

  /* ------------------------------- 场景合成 ------------------------------- */

  const BUILDERS = {
    /* ---- 校门口 ---- */
    campus() {
      let mid = hills(HORIZON + 6, 46, 'var(--c-mid)', 21, 0.85);
      mid += building(980, HORIZON + 10, 560, 300, { cols: 6, rows: 3, seed: 31, roofStyle: 'flat', lit: 0.4 });
      mid += building(120, HORIZON + 14, 320, 210, { cols: 3, rows: 2, seed: 44, roofStyle: 'gable', lit: 0.35 });
      // 校门：两根柱子 + 横梁 + 校名牌
      mid +=
        `<g class="obj-gate"><rect x="612" y="${HORIZON - 260}" width="34" height="280" fill="var(--c-wall)"/>` +
        `<rect x="954" y="${HORIZON - 260}" width="34" height="280" fill="var(--c-wall)"/>` +
        `<rect x="596" y="${HORIZON - 300}" width="66" height="26" rx="6" fill="var(--c-roof)"/>` +
        `<rect x="938" y="${HORIZON - 300}" width="66" height="26" rx="6" fill="var(--c-roof)"/>` +
        `<rect x="612" y="${HORIZON - 292}" width="376" height="42" rx="8" fill="var(--c-wall)"/>` +
        `<rect x="612" y="${HORIZON - 292}" width="376" height="42" rx="8" fill="var(--c-trim)" opacity=".35"/>` +
        `<text x="800" y="${HORIZON - 262}" text-anchor="middle" font-size="30" letter-spacing="10" fill="var(--c-accent)" font-family="serif">晴 天 大 学</text>` +
        `</g>`;
      mid += tree(220, HORIZON + 26, 1.0, 7) + tree(1380, HORIZON + 20, 1.15, 9) + tree(430, HORIZON + 22, 0.7, 13);
      mid += lamp(540, HORIZON + 30, 0.9, 5) + lamp(1070, HORIZON + 30, 0.9, 6);

      let near = groundLine(HORIZON + 40, 'var(--c-ground)', 3, 18);
      near += brickPath(700, 900, HORIZON + 30, H + 40);
      near += `<path d="M 700 ${HORIZON + 30} L 900 ${HORIZON + 30} L 1140 ${H + 40} L 460 ${H + 40} Z" fill="var(--c-path)" opacity=".55"/>`;
      near += bush(150, HORIZON + 86, 1.1, 17) + bush(1460, HORIZON + 92, 1.2, 19) + bush(1120, HORIZON + 60, 0.7, 23);
      near += `<g opacity=".5"><rect x="250" y="${HORIZON + 40}" width="190" height="8" rx="3" fill="var(--c-trim)"/></g>`;
      near += tree(60, HORIZON + 130, 1.7, 41) + tree(1560, HORIZON + 150, 1.85, 43);

      let fore = `<path d="M -20 ${H - 120} q 340 -70 760 -34 q 420 36 880 96 L ${W + 20} ${H + 20} L -20 ${H + 20} Z" fill="var(--c-ground2)" opacity=".55"/>`;
      fore += `<g opacity=".5">${bush(90, H - 88, 1.6, 61)}${bush(1520, H - 100, 1.8, 63)}</g>`;

      return { far: svg(hills(HORIZON - 60, 90, 'var(--c-far)', 5, 0.7)), mid: svg(mid), near: svg(near), fore: svg(fore) };
    },

    /* ---- 林荫道 ---- */
    avenue() {
      let mid = hills(HORIZON - 10, 60, 'var(--c-far)', 71, 0.6);
      mid += `<path d="M 700 ${HORIZON - 40} L 900 ${HORIZON - 40} L 1180 ${H} L 420 ${H} Z" fill="var(--c-path)" opacity=".7"/>`;
      mid += building(620, HORIZON - 30, 360, 170, { cols: 4, rows: 2, seed: 77, lit: 0.5, roofStyle: 'gable' });
      // 两侧行道树，越靠前越大，形成隧道
      for (let i = 0; i < 5; i++) {
        const t = i / 4;
        const s = 0.72 + t * 1.1;
        const y = HORIZON - 20 + t * 300;
        mid += tree(180 - t * 130, y, s, 100 + i * 7);
        mid += tree(1420 + t * 150, y, s, 140 + i * 5);
      }
      // 头顶树冠
      let canopy = '';
      for (let i = 0; i < 9; i++) {
        const r2 = rng(200 + i);
        canopy += `<ellipse cx="${n(140 + i * 180 + r2() * 80)}" cy="${n(-40 + r2() * 130)}" rx="${n(190 + r2() * 90)}" ry="${n(120 + r2() * 60)}" fill="${i % 2 ? 'var(--c-leaf)' : 'var(--c-leaf2)'}" opacity=".92"/>`;
      }
      canopy += `<g class="dapple" opacity=".5">`;
      const r3 = rng(303);
      for (let i = 0; i < 12; i++) canopy += `<ellipse cx="${n(r3() * W)}" cy="${n(r3() * 120)}" rx="${n(30 + r3() * 60)}" ry="${n(20 + r3() * 40)}" fill="var(--c-warm)" opacity=".5"/>`;
      canopy += `</g>`;

      let near = groundLine(HORIZON + 20, 'var(--c-ground)', 8, 14);
      near += `<path d="M 700 ${HORIZON} L 900 ${HORIZON} L 1240 ${H + 40} L 360 ${H + 40} Z" fill="var(--c-path)"/>`;
      const rp = rng(404);
      for (let i = 0; i < 26; i++) {
        const y = HORIZON + i * 15;
        near += `<rect x="${n(700 - i * 13 + rp() * 6)}" y="${n(y)}" width="${n(200 + i * 26)}" height="3" fill="var(--c-trim)" opacity=".35"/>`;
      }
      near += bench(150, HORIZON + 190, 1.3) + bench(1330, HORIZON + 240, 1.5);
      near += lamp(480, HORIZON + 90, 0.8, 8) + lamp(1160, HORIZON + 120, 0.95, 9);

      const fore = `<g>${bush(40, H - 60, 2.2, 91)}${bush(1560, H - 40, 2.4, 93)}</g>`;
      return {
        far: svg(defsCommon() + hills(HORIZON - 120, 110, 'var(--c-far)', 61, 0.5) + svgWrap(canopy)),
        mid: svg(mid),
        near: svg(near),
        fore: svg(fore),
      };
    },

    /* ---- 社团大道 ---- */
    club() {
      let mid = hills(HORIZON, 40, 'var(--c-mid)', 111, 0.75);
      mid += building(1120, HORIZON + 6, 460, 260, { cols: 5, rows: 3, seed: 113, lit: 0.45 });
      const bannerColors = ['var(--c-accent)', 'var(--c-bloom)', 'var(--c-leaf2)', 'var(--c-trim)', 'var(--c-water)'];
      // 摊位
      for (let i = 0; i < 5; i++) {
        const x = 150 + i * 300;
        const s = 0.85 + i * 0.06;
        const y = HORIZON + 30 + i * 12;
        const c = bannerColors[i % bannerColors.length];
        mid +=
          `<g class="obj-booth"><rect x="${n(x)}" y="${n(y - 130 * s)}" width="${n(200 * s)}" height="${n(8 * s)}" fill="var(--c-trim)"/>` +
          `<rect x="${n(x + 6 * s)}" y="${n(y - 132 * s)}" width="${n(9 * s)}" height="${n(132 * s)}" fill="var(--c-trim)"/>` +
          `<rect x="${n(x + 186 * s)}" y="${n(y - 132 * s)}" width="${n(9 * s)}" height="${n(132 * s)}" fill="var(--c-trim)"/>` +
          `<path d="${poly([[x - 14 * s, y - 132 * s], [x + 214 * s, y - 132 * s], [x + 196 * s, y - 178 * s], [x + 4 * s, y - 178 * s]])}" fill="${c}"/>` +
          `<path d="${poly([[x - 14 * s, y - 132 * s], [x - 14 * s, y - 178 * s + 46], [x + 30 * s, y - 178 * s + 40], [x + 30 * s, y - 132 * s]])}" fill="#000" opacity=".1"/>` +
          `<rect x="${n(x + 30 * s)}" y="${n(y - 62 * s)}" width="${n(140 * s)}" height="${n(62 * s)}" fill="var(--c-wall)"/>` +
          `<rect x="${n(x + 42 * s)}" y="${n(y - 50 * s)}" width="${n(116 * s)}" height="${n(30 * s)}" fill="${c}" opacity=".55"/></g>`;
      }
      mid += tree(760, HORIZON + 14, 0.95, 131) + lamp(1420, HORIZON + 24, 0.85, 12);

      let near = groundLine(HORIZON + 44, 'var(--c-ground)', 13, 16);
      near += `<path d="${poly([[520, HORIZON + 40], [1080, HORIZON + 40], [1420, H + 40], [180, H + 40]])}" fill="var(--c-path)" opacity=".85"/>`;
      near += figure(360, HORIZON + 130, 2.6, 'var(--c-ink)', 141) + figure(470, HORIZON + 150, 2.9, 'var(--c-ink)', 143);
      near += figure(1180, HORIZON + 140, 2.7, 'var(--c-ink)', 145) + figure(1290, HORIZON + 170, 3.1, 'var(--c-ink)', 147);
      near += bush(60, HORIZON + 110, 1.5, 149) + bush(1540, HORIZON + 120, 1.6, 151);

      const fore = `<path d="M -20 ${H - 90} q 400 -60 820 -22 q 420 38 820 84 L ${W + 20} ${H + 20} L -20 ${H + 20} Z" fill="var(--c-ground2)" opacity=".5"/>`;
      return { far: svg(hills(HORIZON - 50, 80, 'var(--c-far)', 101, 0.6)), mid: svg(mid), near: svg(near), fore: svg(fore) };
    },

    /* ---- 食堂门口 ---- */
    canteen() {
      let mid = hills(HORIZON - 6, 42, 'var(--c-mid)', 211, 0.7);
      mid += building(240, HORIZON + 12, 1120, 320, { cols: 8, rows: 3, seed: 213, lit: 0.75, win: 'var(--c-glass)' });
      mid +=
        `<g><rect x="330" y="${HORIZON - 218}" width="940" height="60" rx="10" fill="var(--c-accent)" opacity=".9"/>` +
        `<text x="800" y="${HORIZON - 176}" text-anchor="middle" font-size="38" letter-spacing="14" fill="#fffaf0" font-family="serif">食 堂</text></g>`;
      // 蒸汽
      mid += `<g class="steam" opacity=".5">` +
        [0, 1, 2, 3].map((i) => `<ellipse class="steam-puff" style="animation-delay:${(i * 1.4).toFixed(1)}s" cx="${n(420 + i * 230)}" cy="${HORIZON - 260}" rx="${n(34 + i * 6)}" ry="${n(24 + i * 4)}" fill="#fff" opacity=".5"/>`).join('') +
        `</g>`;
      mid += tree(140, HORIZON + 30, 1.2, 221) + tree(1470, HORIZON + 26, 1.15, 223);
      // 底部墙裙与入口
      mid += `<rect x="240" y="${HORIZON - 74}" width="1120" height="86" fill="var(--c-wall2)"/>`;
      mid += `<rect x="240" y="${HORIZON - 82}" width="1120" height="9" fill="var(--c-trim)"/>`;
      mid += `<g><rect x="686" y="${HORIZON - 152}" width="228" height="164" rx="6" fill="var(--c-glass)"/>` +
        `<rect x="686" y="${HORIZON - 152}" width="228" height="164" rx="6" fill="var(--c-warm)" opacity="calc(var(--lamp-a) * .3)"/>` +
        `<rect x="796" y="${HORIZON - 152}" width="8" height="164" fill="var(--c-wall)"/>` +
        `<rect x="676" y="${HORIZON - 162}" width="248" height="14" rx="5" fill="var(--c-trim)"/></g>`;

      let near = groundLine(HORIZON + 46, 'var(--c-ground)', 23, 16);
      near += `<path d="${poly([[400, HORIZON + 46], [1200, HORIZON + 46], [1440, H + 40], [160, H + 40]])}" fill="var(--c-path)"/>`;
      for (let i = 0; i < 4; i++) {
        near += `<rect x="${n(300 + i * 340)}" y="${n(HORIZON + 60 + i * 22)}" width="${n(300 + i * 40)}" height="12" rx="4" fill="var(--c-trim)" opacity=".6"/>`;
      }
      // 自行车棚
      near += `<g opacity=".9">`;
      near += `<rect x="150" y="${HORIZON + 120}" width="300" height="9" rx="4" fill="var(--c-metal)"/>`;
      near += [0, 1, 2].map((i) => `<rect x="${n(170 + i * 90)}" y="${HORIZON + 96}" width="9" height="120" fill="var(--c-metal)"/>`).join('');
      near += [0, 1].map((i) =>
        `<g transform="translate(${n(196 + i * 90)},${n(HORIZON + 118)}) scale(0.9)">` +
        `<circle cx="0" cy="0" r="20" fill="none" stroke="var(--c-ink)" stroke-width="5" opacity=".7"/>` +
        `<circle cx="58" cy="0" r="20" fill="none" stroke="var(--c-ink)" stroke-width="5" opacity=".7"/>` +
        `<path d="M 0 0 L 28 -32 L 58 0 M 28 -32 L 22 -40" fill="none" stroke="var(--c-ink)" stroke-width="5" opacity=".7"/></g>`
      ).join('');
      near += `</g>`;
      near += bush(1500, HORIZON + 120, 1.5, 231) + bush(90, HORIZON + 140, 1.6, 233);
      const fore = grassFore(H - 92, 0.4, 235);
      return { far: svg(hills(HORIZON - 70, 86, 'var(--c-far)', 201, 0.55) + hazeBand(HORIZON, 160, 0.85)), mid: svg(mid), near: svg(near), fore: svg(fore) };
    },

    /* ---- 广场公告栏 ---- */
    plaza() {
      let mid = hills(HORIZON - 4, 44, 'var(--c-mid)', 251, 0.72);
      mid += building(60, HORIZON + 8, 420, 250, { cols: 4, rows: 3, seed: 253, lit: 0.5, roofStyle: 'gable' });
      mid += building(1180, HORIZON + 4, 400, 300, { cols: 4, rows: 3, seed: 255, lit: 0.45 });
      mid += tree(560, HORIZON + 20, 1.35, 257) + tree(1010, HORIZON + 16, 1.15, 259) + tree(1380, HORIZON + 24, 0.85, 261);
      // 公告栏：木框 + 两张海报
      mid +=
        `<g class="obj-board"><rect x="700" y="${HORIZON - 150}" width="14" height="180" fill="var(--c-trim)"/>` +
        `<rect x="1000" y="${HORIZON - 150}" width="14" height="180" fill="var(--c-trim)"/>` +
        `<rect x="672" y="${HORIZON - 268}" width="380" height="150" rx="6" fill="var(--c-wood)"/>` +
        `<rect x="688" y="${HORIZON - 254}" width="348" height="122" fill="var(--c-wall2)"/>` +
        `<rect x="706" y="${HORIZON - 244}" width="140" height="100" rx="3" fill="var(--c-water)" opacity=".85"/>` +
        `<rect x="864" y="${HORIZON - 244}" width="150" height="100" rx="3" fill="var(--c-accent)" opacity=".8"/>` +
        `<g opacity=".55">${[0, 1, 2].map((i) => `<rect x="722" y="${n(HORIZON - 220 + i * 20)}" width="${n(70 + i * 22)}" height="6" rx="3" fill="#fff"/>`).join('')}</g>` +
        `<g opacity=".5">${[0, 1, 2].map((i) => `<rect x="882" y="${n(HORIZON - 220 + i * 20)}" width="${n(60 + i * 26)}" height="6" rx="3" fill="#fff"/>`).join('')}</g>` +
        `<path d="M 660 ${HORIZON - 274} L 1064 ${HORIZON - 274} L 1046 ${HORIZON - 296} L 678 ${HORIZON - 296} Z" fill="var(--c-roof)"/></g>`;
      mid += bench(180, HORIZON + 120, 1.4) + bench(1320, HORIZON + 140, 1.5);

      let near = groundLine(HORIZON + 40, 'var(--c-ground)', 263, 16);
      near += `<ellipse cx="800" cy="${HORIZON + 190}" rx="330" ry="86" fill="var(--c-path)"/>`;
      near += `<ellipse cx="800" cy="${HORIZON + 190}" rx="240" ry="58" fill="var(--c-water)" opacity=".7"/>`;
      near += `<g class="fountain" opacity=".9"><rect x="782" y="${HORIZON + 70}" width="36" height="60" fill="var(--c-trim)"/>` +
        (() => { const r = rng(265); let s = ''; for (let i = 0; i < 22; i++) s += `<ellipse cx="${n(800 + (r() - 0.5) * 120)}" cy="${n(HORIZON + 30 + r() * 70)}" rx="${n(3 + r() * 5)}" ry="${n(5 + r() * 9)}" fill="#eaf7f4" opacity="${(0.25 + r() * 0.4).toFixed(2)}"/>`; return s; })() + `</g>`;
      near += bush(480, HORIZON + 96, 1.3, 267) + bush(1120, HORIZON + 104, 1.4, 269);
      near += lamp(300, HORIZON + 60, 0.85, 26) + lamp(1290, HORIZON + 54, 0.85, 27);

      const fore = `<path d="M -20 ${H - 100} q 420 -50 860 -18 q 420 32 800 78 L ${W + 20} ${H + 20} L -20 ${H + 20} Z" fill="var(--c-ground2)" opacity=".45"/>`;
      return { far: svg(hills(HORIZON - 80, 90, 'var(--c-far)', 249, 0.6)), mid: svg(mid), near: svg(near), fore: svg(fore) };
    },

    /* ---- 专业课教室 ---- */
    classroom() {
      const floorY = 612;
      let far = defsCommon();
      far += `<rect x="0" y="0" width="${W}" height="${floorY}" fill="var(--c-wall)"/>`;
      far += `<rect x="0" y="0" width="${W}" height="30" fill="var(--c-wall2)"/>`;
      far += `<rect x="0" y="30" width="${W}" height="9" fill="var(--c-trim)" opacity=".75"/>`;
      far += `<rect x="0" y="${floorY - 152}" width="${W}" height="152" fill="var(--c-wall2)"/>`;
      far += `<rect x="0" y="${floorY - 160}" width="${W}" height="9" fill="var(--c-trim)"/>`;
      far += `<rect x="0" y="${floorY - 18}" width="${W}" height="18" fill="var(--c-trim)"/>`;
      far += `<rect x="0" y="${floorY}" width="${W}" height="${H - floorY}" fill="var(--c-floor)"/>`;
      far += `<g opacity=".16">` +
        Array.from({ length: 9 }, (_, i) => `<path d="M ${n(800 + (i - 4) * 150)} ${floorY} L ${n(800 + (i - 4) * 620)} ${H}" stroke="var(--c-ink)" stroke-width="2.4"/>`).join('') +
        `<path d="M 0 ${floorY + 70} L ${W} ${floorY + 70}" stroke="var(--c-ink)" stroke-width="2.4"/>` +
        `<path d="M 0 ${floorY + 170} L ${W} ${floorY + 170}" stroke="var(--c-ink)" stroke-width="2.4"/></g>`;
      far += blackboard(420, 116, 600, 208, 12);
      far += window4(74, 150, 250, 262, 3, 3);
      far += window4(1292, 150, 226, 262, 3, 3);
      far += clock(1160, 108, 32);
      far += ceilingLight(200, 46, 420, 1) + ceilingLight(980, 46, 420, 2);
      far += `<g opacity=".5">${[0, 1].map((i) => `<rect x="${n(1386 + i * 0)}" y="300" width="0" height="0"/>`).join('')}</g>`;

      let mid = '';
      for (let row = 0; row < 3; row++) {
        const y = 496 + row * 104;
        const s = 0.78 + row * 0.16;
        for (let col = 0; col < 4; col++) {
          const x = 118 + col * 348 - row * 16;
          mid += deskPair(x, y, 176 * s, s, row * 10 + col);
        }
      }
      // 讲台与投影幕残余
      mid += `<g opacity=".9"><rect x="1340" y="336" width="200" height="16" rx="4" fill="var(--c-wood)"/>` +
        `<rect x="1352" y="352" width="176" height="140" fill="var(--c-wood)" opacity=".75"/>` +
        `<rect x="1364" y="342" width="70" height="12" rx="3" fill="var(--c-ink)" opacity=".4"/></g>`;

      const near = `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#wall-v)" opacity=".4"/>` +
        `<g opacity=".9">${deskPair(-140, 790, 520, 2.4, 99)}</g>`;
      return { far: svg(far), mid: svg(mid), near: svg(near), fore: svg(`<rect x="0" y="0" width="${W}" height="${H}" fill="var(--c-ink)" opacity=".05"/>`) };
    },

    /* ---- 阶梯教室 ---- */
    lecture() {
      let far = defsCommon() + `<rect x="0" y="0" width="${W}" height="${H}" fill="var(--c-wall2)"/>`;
      far += `<rect x="0" y="0" width="${W}" height="26" fill="var(--c-wall)"/>`;
      far += `<path d="M 120 66 Q 800 26 1480 66 L 1480 356 Q 800 396 120 356 Z" fill="var(--c-wood)"/>`;
      far += `<path d="M 158 100 Q 800 66 1442 100 L 1442 322 Q 800 356 158 322 Z" fill="#33463f"/>`;
      far += `<path d="M 158 100 Q 800 66 1442 100" fill="none" stroke="#ffffff" stroke-width="3" opacity=".12"/>`;
      far += `<g opacity=".5">` + (() => { const r = rng(31); let s = ''; for (let i = 0; i < 10; i++) s += `<rect x="${n(250 + r() * 760)}" y="${n(140 + r() * 150)}" width="${n(40 + r() * 140)}" height="5" rx="2" fill="#eef3ea" opacity=".62"/>`; return s; })() + `</g>`;
      far += window4(54, 130, 108, 380, 1, 4, false) + window4(1438, 130, 108, 380, 1, 4, false);
      far += ceilingLight(260, 40, 380, 3) + ceilingLight(960, 40, 380, 4);
      far += `<g opacity=".9"><rect x="1210" y="86" width="240" height="170" rx="6" fill="var(--c-wall)"/>` +
        `<rect x="1230" y="104" width="200" height="10" rx="3" fill="var(--c-ink)" opacity=".3"/>` +
        `<rect x="1230" y="126" width="150" height="10" rx="3" fill="var(--c-ink)" opacity=".2"/></g>`;

      let mid = '';
      for (let row = 0; row < 4; row++) {
        const y = 486 + row * 88;
        const s = 0.7 + row * 0.15;
        // 阶梯层
        mid += `<path d="${poly([[-40, y + 30], [W + 40, y + 30], [W + 40, y + 30 + 16 * s], [-40, y + 30 + 16 * s]])}" fill="var(--c-trim)" opacity=".5"/>`;
        for (let col = 0; col < 6; col++) {
          const x = 34 + col * 256 - row * 14;
          mid += deskPair(x, y, 140 * s, s * 0.92, 200 + row * 10 + col);
        }
      }
      const near = `<path d="M -20 846 Q 800 800 1620 846 L 1620 920 L -20 920 Z" fill="var(--c-floor)"/>` +
        `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#wall-v)" opacity=".5"/>`;
      return { far: svg(far), mid: svg(mid), near: svg(near), fore: svg(`<rect x="0" y="0" width="${W}" height="${H}" fill="#0b1a1f" opacity=".05"/>`) };
    },

    /* ---- 宿舍 ---- */
    dorm() {
      const floorY = 606;
      let far = defsCommon() + roomShell(floorY);
      far += `<rect x="0" y="0" width="${W}" height="24" fill="var(--c-wall2)"/>`;
      far += `<rect x="0" y="24" width="${W}" height="9" fill="var(--c-trim)" opacity=".7"/>`;
      // 地板
      far += `<g opacity=".13">${[0, 1, 2].map((i) => `<path d="M 0 ${n(floorY + 60 + i * 74)} L ${W} ${n(floorY + 60 + i * 74)}" stroke="var(--c-ink)" stroke-width="3"/>`).join('')}</g>`;
      // 窗与夜景
      far += window4(1080, 128, 340, 296, 2, 2);
      far += `<g class="night-city" opacity="var(--night)">` +
        (() => { const r = rng(51); let s = ''; for (let i = 0; i < 22; i++) s += `<rect x="${n(1104 + r() * 300)}" y="${n(196 + r() * 182)}" width="${n(4 + r() * 11)}" height="${n(6 + r() * 18)}" fill="var(--c-lamp)" opacity="${(0.35 + r() * 0.6).toFixed(2)}"/>`; return s; })() + `</g>`;
      // 墙上海报
      far += `<g><rect x="118" y="118" width="186" height="238" rx="6" fill="var(--c-wall2)" transform="rotate(-3 211 237)"/>` +
        `<rect x="130" y="134" width="162" height="112" rx="4" fill="var(--c-water)" opacity=".7" transform="rotate(-3 211 237)"/>` +
        `<rect x="130" y="258" width="120" height="8" rx="4" fill="var(--c-ink)" opacity=".2" transform="rotate(-3 211 237)"/>` +
        `<rect x="332" y="152" width="148" height="188" rx="6" fill="var(--c-bloom)" opacity=".55" transform="rotate(4 406 246)"/>` +
        `<rect x="348" y="170" width="116" height="86" rx="4" fill="#ffffff" opacity=".55" transform="rotate(4 406 246)"/></g>`;
      // 晾衣绳
      far += `<path d="M 500 96 Q 660 130 820 96" fill="none" stroke="var(--c-ink)" stroke-width="3" opacity=".45"/>`;
      far += `<g>${['var(--c-accent)', 'var(--c-water)', 'var(--c-leaf2)', 'var(--c-trim)']
        .map((c, i) => `<path d="M ${n(540 + i * 76)} ${n(110 + i * 3)} q -16 74 12 128 q 24 -54 12 -128 z" fill="${c}" opacity=".85"/>`)
        .join('')}</g>`;
      far += ceilingLight(960, 44, 320, 7);

      // 上下铺
      let mid = '';
      const bedX = 40, bedW = 460, bedTop = floorY - 330;
      mid += `<g class="obj-bunk">` +
        `<rect x="${bedX}" y="${bedTop}" width="${bedW}" height="30" rx="7" fill="var(--c-metal)"/>` +
        `<rect x="${bedX}" y="${bedTop}" width="${bedW}" height="17" rx="7" fill="var(--c-wall)"/>` +
        `<rect x="${bedX + 8}" y="${bedTop - 4}" width="132" height="40" rx="12" fill="var(--c-wall2)"/>` +
        `<rect x="${bedX}" y="${bedTop + 178}" width="${bedW}" height="30" rx="7" fill="var(--c-metal)"/>` +
        `<rect x="${bedX}" y="${bedTop + 178}" width="${bedW}" height="17" rx="7" fill="var(--c-wall)"/>` +
        `<rect x="${bedX + 8}" y="${bedTop + 174}" width="132" height="40" rx="12" fill="var(--c-wall2)"/>` +
        `<rect x="${bedX + 12}" y="${bedTop}" width="18" height="330" fill="var(--c-metal)"/>` +
        `<rect x="${bedX + bedW - 30}" y="${bedTop}" width="18" height="330" fill="var(--c-metal)"/>` +
        `<rect x="${bedX + 4}" y="${bedTop + 152}" width="${bedW - 8}" height="14" rx="6" fill="var(--c-metal)" opacity=".5"/></g>`;
      // 书桌
      mid += `<g><rect x="620" y="${floorY - 156}" width="430" height="20" rx="6" fill="var(--c-wood)"/>` +
        `<rect x="620" y="${floorY - 136}" width="430" height="12" fill="var(--c-ink)" opacity=".22"/>` +
        `<rect x="644" y="${floorY - 124}" width="16" height="124" fill="var(--c-wood)"/>` +
        `<rect x="1010" y="${floorY - 124}" width="16" height="124" fill="var(--c-wood)"/>` +
        `<rect x="1050" y="${floorY - 226}" width="104" height="68" rx="7" fill="var(--c-ink)" opacity=".85"/>` +
        `<rect x="1064" y="${floorY - 219}" width="76" height="48" rx="3" fill="var(--c-water)" opacity=".8"/>` +
        `<rect x="700" y="${floorY - 186}" width="86" height="30" rx="4" fill="var(--c-accent)" opacity=".8"/>` +
        `<rect x="800" y="${floorY - 176}" width="60" height="20" rx="4" fill="var(--c-trim)"/></g>`;
      // 台灯光晕
      mid += `<g class="desk-lamp"><ellipse cx="906" cy="${floorY - 168}" rx="180" ry="86" fill="url(#soft-light)" opacity="var(--lamp-a)"/>` +
        `<rect x="890" y="${floorY - 250}" width="8" height="96" fill="var(--c-metal)"/>` +
        `<path d="M 858 ${floorY - 250} h 70 l -14 -30 h -42 z" fill="var(--c-accent)"/>` +
        `<circle cx="893" cy="${floorY - 252}" r="12" fill="var(--c-lamp)" opacity="var(--lamp-a)"/></g>`;
      mid += bookshelf(1200, 292, 210, 268, 61, 3);

      const near = `<g opacity=".92">${deskPair(-120, 806, 560, 2.2, 77)}</g>` +
        `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#wall-v)" opacity=".42"/>`;
      return { far: svg(far), mid: svg(mid), near: svg(near), fore: svg(`<rect x="0" y="0" width="${W}" height="${H}" fill="#0d1b24" opacity=".05"/>`) };
    },

    /* ---- 图书馆 ---- */
    library() {
      const floorY = 640;
      let far = defsCommon() + roomShell(floorY);
      far += bookshelf(40, 150, 300, 430, 71, 6);
      far += bookshelf(360, 150, 300, 430, 73, 6);
      far += bookshelf(1240, 150, 320, 430, 75, 6);
      far += `<path d="M 700 130 Q 800 60 900 130 L 900 470 Q 800 500 700 470 Z" fill="var(--c-glass)"/>`;
      far += `<path d="M 700 130 Q 800 60 900 130 L 900 470 Q 800 500 700 470 Z" fill="var(--c-warm)" opacity=".22"/>`;
      far += `<g>${[0, 1, 2, 3].map((i) => `<rect x="752" y="${n(150 + i * 92)}" width="96" height="8" fill="var(--c-wall)" opacity=".85"/>`).join('')}</g>`;
      far += `<rect x="700" y="126" width="200" height="12" rx="4" fill="var(--c-trim)"/>`;

      let mid = '';
      for (let row = 0; row < 3; row++) {
        const y = 500 + row * 96;
        const s = 0.85 + row * 0.16;
        for (let col = 0; col < 4; col++) {
          const x = 150 + col * 340 - row * 14;
          mid += chair(x + 60 * s, y - 66 * s, s);
          mid += `<g><rect x="${n(x)}" y="${n(y)}" width="${n(240 * s)}" height="${n(14 * s)}" rx="5" fill="var(--c-wood)"/>` +
            `<rect x="${n(x + 12 * s)}" y="${n(y + 14 * s)}" width="${n(14 * s)}" height="${n(60 * s)}" fill="var(--c-wood)"/>` +
            `<rect x="${n(x + 214 * s)}" y="${n(y + 14 * s)}" width="${n(14 * s)}" height="${n(60 * s)}" fill="var(--c-wood)"/>` +
            `<path d="M ${n(x + 112 * s)} ${n(y - 4 * s)} q ${n(26 * s)} ${n(-30 * s)} ${n(52 * s)} 0 z" fill="var(--c-leaf2)"/>` +
            `<circle cx="${n(x + 138 * s)}" cy="${n(y + 16 * s)}" r="${n(30 * s)}" fill="url(#soft-light)" opacity="var(--lamp-a)"/></g>`;
        }
      }
      mid += `<g opacity=".9"><rect x="1420" y="300" width="14" height="360" fill="var(--c-wood)" transform="rotate(9 1427 480)"/></g>`;

      const near = `<path d="M -20 790 Q 800 736 1620 790 L 1620 920 L -20 920 Z" fill="var(--c-floor)"/>` +
        `<g opacity=".95">${[0, 1, 2].map((i) => `<rect x="${n(-30 + i * 74)}" y="${n(700 - i * 26)}" width="${n(220 + i * 30)}" height="${n(30 + i * 6)}" rx="5" fill="${['var(--c-accent)', 'var(--c-water)', 'var(--c-leaf)'] [i]}" opacity=".9"/>`).join('')}</g>` +
        `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#wall-v)" opacity=".4"/>`;
      return { far: svg(far), mid: svg(mid), near: svg(near), fore: svg(`<rect x="0" y="0" width="${W}" height="${H}" fill="#1d2a20" opacity=".05"/>`) };
    },

    /* ---- 湖边 ---- */
    lake() {
      const lakeTop = HORIZON + 30;
      const shoreY = HORIZON + 268;
      let mid = hills(HORIZON - 26, 78, 'var(--c-far)', 301, 0.9);
      mid += hills(HORIZON + 6, 40, 'var(--c-mid)', 303, 0.85);
      // 对岸树线
      let farTrees = '';
      for (let i = 0; i < 9; i++) {
        const r2 = rng(305 + i * 3);
        farTrees += `<ellipse cx="${n(-40 + i * 220 + r2() * 90)}" cy="${n(lakeTop - 24 - r2() * 28)}" rx="${n(46 + r2() * 46)}" ry="${n(30 + r2() * 26)}" fill="var(--c-mid)"/>`;
      }
      mid += `<g opacity=".92">${farTrees}</g>`;
      mid += tree(140, lakeTop + 6, 1.25, 307) + tree(1530, lakeTop + 8, 1.35, 309) + tree(360, lakeTop + 4, 0.85, 311);
      // 垂柳
      mid += `<g class="willow">` +
        `<path d="M 486 ${lakeTop - 70} q -12 -130 -20 -172 q 42 24 66 20 q 18 64 -8 152 z" fill="var(--c-trunk)"/>` +
        (() => { const r = rng(313); let s = ''; for (let i = 0; i < 20; i++) s += `<path d="M ${n(462 + i * 7)} ${n(lakeTop - 232)} q ${n((r() - 0.5) * 54)} 96 ${n((r() - 0.5) * 40)} ${n(126 + r() * 100)}" stroke="var(--c-leaf2)" stroke-width="${n(3 + r() * 3)}" fill="none" opacity=".85"/>`; return s; })() + `</g>`;
      // 湖面
      mid += `<rect x="0" y="${lakeTop}" width="${W}" height="${n(shoreY - lakeTop)}" fill="url(#water-grad)"/>`;
      mid += `<rect x="0" y="${lakeTop}" width="${W}" height="24" fill="var(--c-far)" opacity=".5"/>`;
      // 对岸倒影
      mid += `<g class="reflect" opacity=".3" transform="translate(0,${n((lakeTop + 8) * 2)}) scale(1,-1)">${hills(HORIZON + 6, 40, 'var(--c-mid)', 303, 0.8)}</g>`;
      mid += `<g class="lake-lines">` +
        (() => { const r = rng(317); let s = ''; for (let i = 0; i < 32; i++) { const y = lakeTop + 14 + r() * (shoreY - lakeTop - 24); const w2 = 100 + r() * 560; const x = r() * (W - w2); s += `<rect x="${n(x)}" y="${n(y)}" width="${n(w2)}" height="${n(1.6 + r() * 3)}" rx="2" fill="#eaf8f0" opacity="${(0.1 + r() * 0.3).toFixed(2)}"/>`; } return s; })() + `</g>`;
      mid += `<g class="sun-glint" opacity="var(--glow-a)">` +
        `<ellipse cx="${W * 0.7}" cy="${lakeTop + 74}" rx="210" ry="26" fill="var(--c-warm)" opacity=".5"/>` +
        `<ellipse cx="${W * 0.7}" cy="${lakeTop + 118}" rx="140" ry="18" fill="var(--c-warm)" opacity=".34"/>` +
        `<ellipse cx="${W * 0.7}" cy="${lakeTop + 158}" rx="88" ry="12" fill="var(--c-warm)" opacity=".24"/></g>`;
      // 鸭子
      mid += `<g class="duck"><ellipse cx="1180" cy="${lakeTop + 92}" rx="27" ry="15" fill="#f6f2e4"/>` +
        `<circle cx="1206" cy="${lakeTop + 75}" r="11.5" fill="#f6f2e4"/><path d="M 1216 ${lakeTop + 75} l 15 5 l -15 5 z" fill="var(--c-accent)"/></g>`;
      // 岸边
      mid += `<path d="M -20 ${shoreY - 30} Q 420 ${shoreY - 62} 900 ${shoreY - 30} Q 1300 ${shoreY - 4} 1620 ${shoreY - 40} L 1620 ${H + 20} L -20 ${H + 20} Z" fill="var(--c-ground)"/>`;
      mid += `<path d="M -20 ${shoreY - 30} Q 420 ${shoreY - 62} 900 ${shoreY - 30} Q 1300 ${shoreY - 4} 1620 ${shoreY - 40}" fill="none" stroke="#ffffff" stroke-width="4" opacity=".2"/>`;

      let near = `<path d="M -20 ${H - 176} Q 500 ${H - 232} 1000 ${H - 184} Q 1300 ${H - 154} 1620 ${H - 194} L 1620 ${H + 20} L -20 ${H + 20} Z" fill="var(--c-ground2)"/>`;
      near += `<path d="${poly([[540, H - 206], [1090, H - 192], [1270, H + 40], [380, H + 40]])}" fill="var(--c-path)"/>`;
      near += `<g>${(() => { const r = rng(323); let s = ''; for (let i = 0; i < 44; i++) { const x = r() * W; const y3 = H - 176 + r() * 120; s += `<path d="M ${n(x)} ${n(y3)} q 6 -50 24 -76" stroke="var(--c-leaf)" stroke-width="${n(2 + r() * 2.4)}" fill="none" opacity=".8" stroke-linecap="round"/>`; } return s; })()}</g>`;
      near += `<g>${(() => { const r = rng(325); let s = ''; for (let i = 0; i < 7; i++) s += `<ellipse cx="${n(60 + r() * (W - 120))}" cy="${n(H - 90 + r() * 70)}" rx="${n(20 + r() * 34)}" ry="${n(10 + r() * 16)}" fill="var(--c-trim)" opacity=".5"/>`; return s; })()}</g>`;
      near += bush(120, H - 120, 1.5, 327) + bush(1500, H - 136, 1.6, 329);
      const fore = grassFore(H - 56, 0.32, 331, 'var(--c-leaf2)');
      return { far: svg(hills(HORIZON - 130, 110, 'var(--c-far)', 291, 0.55) + hazeBand(HORIZON - 40, 160, 0.8)), mid: svg(defsCommon() + mid), near: svg(near), fore: svg(fore) };
    },

    /* ---- 咖啡馆 ---- */
    cafe() {
      const floorY = 630;
      let far = defsCommon() + roomShell(floorY);
      far += `<rect x="0" y="0" width="${W}" height="20" fill="var(--c-trim)" opacity=".8"/>`;
      // 吊灯
      far += `<g class="pendant">${[0, 1, 2].map((i) => `<g><rect x="${n(280 + i * 500)}" y="0" width="4" height="${n(120 + i * 18)}" fill="var(--c-ink)" opacity=".6"/><path d="M ${n(240 + i * 500)} ${n(120 + i * 18)} h 84 l -16 44 h -52 z" fill="var(--c-accent)" opacity=".9"/><ellipse cx="${n(282 + i * 500)}" cy="${n(174 + i * 18)}" rx="46" ry="16" fill="var(--c-lamp)" opacity="var(--lamp-a)"/><ellipse cx="${n(282 + i * 500)}" cy="${n(230 + i * 18)}" rx="150" ry="90" fill="url(#soft-light)" opacity="var(--lamp-a)"/></g>`).join('')}</g>`;
      far += window4(1150, 210, 380, 300, 2, 2);
      far += `<g opacity=".85"><rect x="70" y="150" width="330" height="230" rx="10" fill="var(--c-ink)" opacity=".82"/>` +
        `<text x="235" y="205" text-anchor="middle" font-size="24" letter-spacing="6" fill="#fff6e2" font-family="serif">MENU</text>` +
        (() => { const r = rng(331); let s = ''; for (let i = 0; i < 6; i++) s += `<rect x="105" y="${n(230 + i * 22)}" width="${n(60 + r() * 180)}" height="6" rx="3" fill="#fff6e2" opacity="${(0.3 + r() * 0.4).toFixed(2)}"/>`; return s; })() + `</g>`;

      let mid = '';
      // 吧台
      mid += `<g><rect x="480" y="${floorY - 190}" width="700" height="22" rx="6" fill="var(--c-wood)"/><rect x="500" y="${floorY - 168}" width="660" height="170" fill="var(--c-wood)" opacity=".85"/>` +
        `<rect x="500" y="${floorY - 168}" width="660" height="170" fill="#000" opacity=".12"/>` +
        `<g opacity=".95">${[0, 1, 2].map((i) => `<rect x="${n(540 + i * 90)}" y="${n(floorY - 176)}" width="46" height="52" rx="6" fill="var(--c-wall)" opacity=".8"/>`).join('')}</g>` +
        `<rect x="800" y="${floorY - 260}" width="150" height="72" rx="8" fill="var(--c-metal)"/><rect x="820" y="${floorY - 248}" width="60" height="46" rx="4" fill="var(--c-ink)" opacity=".5"/></g>`;
      // 吧台椅
      mid += `<g>${[0, 1, 2].map((i) => `<g><ellipse cx="${n(580 + i * 220)}" cy="${n(floorY - 118)}" rx="34" ry="12" fill="var(--c-accent)"/><rect x="${n(576 + i * 220)}" y="${n(floorY - 108)}" width="8" height="108" fill="var(--c-metal)"/><ellipse cx="${n(580 + i * 220)}" cy="${n(floorY + 2)}" rx="26" ry="8" fill="var(--c-metal)"/></g>`).join('')}</g>`;
      mid += `<g opacity=".9">${[[0, 0], [1, 0]].map(([i, j]) => `<g><rect x="${n(120 + i * 250)}" y="${n(470 + j * 10)}" width="180" height="12" rx="5" fill="var(--c-wood)"/><rect x="${n(130 + i * 250)}" y="${n(482 + j * 10)}" width="12" height="70" fill="var(--c-wood)"/><rect x="${n(278 + i * 250)}" y="${n(482 + j * 10)}" width="12" height="70" fill="var(--c-wood)"/><ellipse cx="${n(210 + i * 250)}" cy="${n(464 + j * 10)}" rx="22" ry="8" fill="var(--c-wall)"/></g>`).join('')}</g>`;

      // 前景：靠窗的桌子与那杯热饮
      const cx = 1130, cyT = 748;
      const near =
        `<path d="M 700 ${cyT + 34} Q 1130 ${cyT - 4} 1600 ${cyT + 26} L 1600 ${H + 20} L 700 ${H + 20} Z" fill="var(--c-wood)"/>` +
        `<path d="M 700 ${cyT + 34} Q 1130 ${cyT - 4} 1600 ${cyT + 26} L 1600 ${cyT + 54} Q 1130 ${cyT + 26} 700 ${cyT + 62} Z" fill="#ffffff" opacity=".16"/>` +
        `<path d="M 700 ${cyT + 34} Q 1130 ${cyT - 4} 1600 ${cyT + 26}" fill="none" stroke="#ffffff" stroke-width="3" opacity=".3"/>` +
        `<rect x="0" y="${cyT + 90}" width="${W}" height="${H - cyT - 90 + 20}" fill="var(--c-floor)"/>` +
        `<g class="cup">` +
        `<ellipse cx="${cx}" cy="${cyT + 8}" rx="92" ry="26" fill="var(--c-wall)" opacity=".35"/>` +
        `<path d="M ${cx - 78} ${cyT - 66} h 156 l -16 84 q -6 22 -62 22 q -56 0 -62 -22 z" fill="var(--c-wall)"/>` +
        `<path d="M ${cx - 78} ${cyT - 66} h 156 l -4 20 h -148 z" fill="#ffffff" opacity=".35"/>` +
        `<ellipse cx="${cx}" cy="${cyT - 66}" rx="78" ry="20" fill="#6f4c34"/>` +
        `<ellipse cx="${cx}" cy="${cyT - 66}" rx="60" ry="13" fill="#8a6246" opacity=".9"/>` +
        `<path d="M ${cx + 78} ${cyT - 46} q 46 4 36 38 q -8 26 -42 20" fill="none" stroke="var(--c-wall)" stroke-width="13" stroke-linecap="round"/>` +
        `<g class="cup-steam">${[0, 1, 2].map((i) => `<ellipse cx="${n(cx - 34 + i * 34)}" cy="${n(cyT - 130)}" rx="17" ry="26" fill="#fff" opacity=".45" style="animation-delay:${(i * 1.3).toFixed(1)}s"/>`).join('')}</g></g>` +
        `<g opacity=".95"><rect x="120" y="${cyT + 60}" width="420" height="16" rx="7" fill="var(--c-wood)"/>` +
        `<rect x="150" y="${cyT + 76}" width="16" height="130" fill="var(--c-wood)"/>` +
        `<rect x="494" y="${cyT + 76}" width="16" height="130" fill="var(--c-wood)"/></g>` +
        `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#wall-v)" opacity=".38"/>`;
      return { far: svg(far), mid: svg(mid), near: svg(near), fore: svg(`<rect x="0" y="0" width="${W}" height="${H}" fill="#3a2413" opacity=".06"/>`) };
    },

    /* ---- 天台 ---- */
    roof() {
      let mid = hills(HORIZON + 40, 50, 'var(--c-far)', 401, 0.9);
      // 城市剪影
      const r = rng(403);
      let city = '';
      for (let i = 0; i < 26; i++) {
        const w2 = 40 + r() * 130, h2 = 60 + r() * 260, x = i * 68 - 40;
        city += `<rect x="${n(x)}" y="${n(HORIZON + 46 - h2)}" width="${n(w2)}" height="${n(h2)}" fill="var(--c-far)" opacity=".92"/>`;
        for (let k = 0; k < 4; k++) {
          if (r() < 0.5) city += `<rect x="${n(x + 8 + k * 18)}" y="${n(HORIZON + 30 - h2 * 0.8 + r() * h2 * 0.6)}" width="7" height="9" fill="var(--c-warm)" opacity="var(--lamp-a)"/>`;
        }
      }
      mid += `<g class="skyline">${city}</g>`;
      mid += tree(120, HORIZON + 60, 0.7, 405) + tree(1500, HORIZON + 50, 0.8, 407);
      // 水塔
      mid += `<g class="watertower"><rect x="240" y="${HORIZON - 150}" width="14" height="180" fill="var(--c-metal)"/><rect x="420" y="${HORIZON - 150}" width="14" height="180" fill="var(--c-metal)"/><rect x="215" y="${HORIZON - 250}" width="244" height="106" rx="10" fill="var(--c-wall2)"/><path d="M 205 ${HORIZON - 250} L 337 ${HORIZON - 296} L 469 ${HORIZON - 250} Z" fill="var(--c-roof)"/></g>`;
      // 空调外机与天线
      mid += `<g opacity=".9"><rect x="1180" y="${HORIZON - 110}" width="150" height="110" rx="8" fill="var(--c-wall2)"/><circle cx="1255" cy="${HORIZON - 55}" r="34" fill="none" stroke="var(--c-metal)" stroke-width="8"/><rect x="1420" y="${HORIZON - 200}" width="8" height="200" fill="var(--c-metal)"/><path d="M 1424 ${HORIZON - 200} l 60 40 M 1424 ${HORIZON - 176} l -56 34" stroke="var(--c-metal)" stroke-width="6"/></g>`;

      // 地面 + 围栏
      const deckY = HORIZON + 120;
      let near = `<rect x="0" y="${deckY}" width="${W}" height="${H - deckY}" fill="var(--c-ground)"/>`;
      near += `<rect x="0" y="${deckY}" width="${W}" height="16" fill="var(--c-trim)"/>`;
      // 混凝土分块缝
      near += `<g opacity=".14">` +
        Array.from({ length: 7 }, (_, i) => `<path d="M ${n(400 + (i - 3) * 190)} ${deckY} L ${n(400 + (i - 3) * 520)} ${H}" stroke="var(--c-ink)" stroke-width="3"/>`).join('') +
        [0, 1, 2].map((i) => `<path d="M 0 ${n(deckY + 60 + i * 76)} L ${W} ${n(deckY + 60 + i * 76)}" stroke="var(--c-ink)" stroke-width="3"/>`).join('') +
        `</g>`;
      // 女儿墙 + 栏杆（落在画面下半部，不挡住天际线）
      near += `<g class="railing">` +
        `<rect x="0" y="${n(deckY + 96)}" width="${W}" height="26" fill="var(--c-wall2)"/>` +
        `<rect x="0" y="${n(deckY + 122)}" width="${W}" height="12" fill="var(--c-trim)"/>` +
        [0, 1].map((i) => `<rect x="0" y="${n(deckY + 40 + i * 30)}" width="${W}" height="5" fill="var(--c-metal)" opacity=".9"/>`).join('') +
        Array.from({ length: 12 }, (_, i) => `<rect x="${n(40 + i * 136)}" y="${deckY + 34}" width="8" height="70" fill="var(--c-metal)" opacity=".9"/>`).join('') +
        `</g>`;
      // 空调外机
      near += `<g opacity=".95"><rect x="120" y="${deckY + 150}" width="190" height="120" rx="8" fill="var(--c-wall2)"/>` +
        `<circle cx="215" cy="${deckY + 210}" r="38" fill="none" stroke="var(--c-metal)" stroke-width="8"/>` +
        `<rect x="142" y="${deckY + 168}" width="146" height="12" rx="4" fill="var(--c-metal)" opacity=".6"/></g>`;
      near += `<g opacity=".9"><rect x="1260" y="${deckY + 190}" width="150" height="90" rx="6" fill="var(--c-metal)" opacity=".85"/></g>`;
      near += `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#wall-v)" opacity=".28"/>`;
      const fore = grassFore(H - 60, 0.26, 419, 'var(--c-metal)');
      return { far: svg(defsCommon() + hills(HORIZON - 60, 90, 'var(--c-far)', 399, 0.6) + hazeBand(HORIZON + 30, 130, 0.7)), mid: svg(mid), near: svg(near), fore: svg(fore) };
    },

    /* ---- 操场 ---- */
    track() {
      let mid = hills(HORIZON - 40, 70, 'var(--c-far)', 501, 0.9);
      mid += `<g class="skyline">${(() => { const r = rng(503); let s = ''; for (let i = 0; i < 16; i++) { const w2 = 50 + r() * 120, h2 = 50 + r() * 180; s += `<rect x="${n(i * 100 - 20)}" y="${n(HORIZON - 10 - h2)}" width="${n(w2)}" height="${n(h2)}" fill="var(--c-far)" opacity=".85"/>`; } return s; })()}</g>`;
      // 看台
      mid += `<g opacity=".95">${[0, 1, 2, 3, 4].map((i) => `<rect x="1080" y="${n(HORIZON + 10 + i * 26)}" width="520" height="24" fill="${i % 2 ? 'var(--c-wall2)' : 'var(--c-wall)'}"/>`).join('')}` +
        `<rect x="1080" y="${HORIZON - 60}" width="520" height="70" fill="var(--c-wall)" opacity=".9"/><path d="M 1060 ${HORIZON - 60} L 1340 ${HORIZON - 108} L 1620 ${HORIZON - 60} Z" fill="var(--c-roof)"/></g>`;
      // 跑道
      const ty = HORIZON + 60;
      mid += `<ellipse cx="760" cy="${ty + 300}" rx="880" ry="330" fill="var(--c-accent)" opacity=".85"/>`;
      mid += `<ellipse cx="760" cy="${ty + 300}" rx="700" ry="240" fill="var(--c-ground)"/>`;
      mid += `<g opacity=".5">${[0, 1, 2, 3].map((i) => `<ellipse cx="760" cy="${ty + 300}" rx="${880 - i * 42}" ry="${330 - i * 22}" fill="none" stroke="#ffffff" stroke-width="4" opacity=".5"/>`).join('')}</g>`;
      // 球门与灯柱
      mid += `<g class="goal"><rect x="180" y="${ty + 120}" width="10" height="90" fill="#fff" opacity=".9"/><rect x="380" y="${ty + 120}" width="10" height="90" fill="#fff" opacity=".9"/><rect x="180" y="${ty + 120}" width="210" height="8" fill="#fff" opacity=".9"/></g>`;
      mid += lamp(240, HORIZON + 190, 1.4, 21) + lamp(1300, HORIZON + 130, 1.3, 22) + lamp(760, HORIZON + 240, 1.7, 23);

      let near = `<path d="M -20 ${H - 150} Q 700 ${H - 210} 1620 ${H - 140} L 1620 ${H + 20} L -20 ${H + 20} Z" fill="var(--c-ground2)"/>`;
      near += `<path d="${poly([[0, H - 150], [1620, H - 130], [1620, H - 86], [0, H - 116]])}" fill="var(--c-path)" opacity=".55"/>`;
      near += `<g class="fence" opacity=".85">${Array.from({ length: 13 }, (_, i) => `<rect x="${n(i * 132)}" y="${H - 250}" width="10" height="140" fill="var(--c-metal)"/>`).join('')}` +
        `<rect x="0" y="${H - 244}" width="${W}" height="7" fill="var(--c-metal)"/><rect x="0" y="${H - 180}" width="${W}" height="7" fill="var(--c-metal)"/></g>`;
      const fore = grassFore(H - 62, 0.34, 511);
      return { far: svg(defsCommon() + hills(HORIZON - 110, 120, 'var(--c-far)', 499, 0.6) + hazeBand(HORIZON - 20, 160, 0.75)), mid: svg(mid), near: svg(near), fore: svg(fore) };
    },

    /* ---- 放映室 ---- */
    hall() {
      let far = defsCommon() + `<rect x="0" y="0" width="${W}" height="${H}" fill="#1b242a"/>`;
      far += `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#wall-v)" opacity=".3"/>`;
      // 幕布
      far += `<rect x="300" y="70" width="1000" height="470" rx="10" fill="#0f171b"/>`;
      far += `<rect x="316" y="86" width="968" height="438" rx="6" fill="#f2f5e9"/>`;
      far += `<rect x="316" y="86" width="968" height="438" rx="6" fill="var(--c-water)" opacity=".22"/>`;
      far += `<rect x="316" y="86" width="968" height="438" rx="6" fill="url(#focus)" opacity="var(--lamp-a)"/>`;
      // 幕上的画面：湖与树
      far += `<g opacity=".5"><rect x="316" y="330" width="968" height="194" fill="var(--c-water2)" opacity=".5"/>` +
        `<ellipse cx="620" cy="352" rx="120" ry="46" fill="var(--c-mid)" opacity=".8"/>` +
        `<ellipse cx="1080" cy="366" rx="150" ry="40" fill="var(--c-mid)" opacity=".7"/>` +
        `<circle cx="1120" cy="180" r="52" fill="var(--c-warm)" opacity=".8"/></g>`;
      // 投影光束
      far += `<g class="projector-beam"><path d="M 1250 336 L 1480 900 L 1180 900 Z" fill="#ffffff" opacity=".06"/></g>`;
      // 观众席的浮尘
      far += `<g opacity=".4">${(() => { const r = rng(601); let s = ''; for (let i = 0; i < 46; i++) s += `<circle cx="${n(140 + r() * 1320)}" cy="${n(420 + r() * 300)}" r="${n(1 + r() * 2)}" fill="#fff" opacity="${(0.2 + r() * 0.5).toFixed(2)}"/>`; return s; })()}</g>`;

      let mid = '';
      for (let row = 0; row < 5; row++) {
        const y = 556 + row * 68;
        const s = 0.58 + row * 0.15;
        mid += `<g>`;
        for (let col = 0; col < 8; col++) {
          const x = -20 + col * 214 - row * 10;
          mid += `<path d="M ${n(x)} ${n(y)} h ${n(168 * s)} q ${n(34 * s)} ${n(-60 * s)} ${n(116 * s)} 0 z" fill="var(--c-ink)" opacity="${(0.75 + row * 0.05).toFixed(2)}"/>`;
          mid += `<circle cx="${n(x + 34 * s)}" cy="${n(y - 20 * s)}" r="${n(28 * s)}" fill="var(--c-ink)"/>`;
          mid += `<path d="M ${n(x)} ${n(y)} h ${n(168 * s)}" stroke="#ffffff" stroke-width="2.4" opacity=".14"/>`;
        }
        mid += `</g>`;
      }
      const near = `<path d="M -20 ${H - 56} q 800 -46 1640 0 L 1640 920 L -20 920 Z" fill="#111a1f"/>` +
        `<path d="M -20 ${H - 56} q 800 -46 1640 0" fill="none" stroke="#ffffff" stroke-width="3" opacity=".1"/>`;
      return { far: svg(far), mid: svg(mid), near: svg(near), fore: svg(`<rect x="0" y="0" width="${W}" height="${H}" fill="#000" opacity=".05"/>`) };
    },
  };

  // avenue 用到的小工具（保持作用域干净）
  function svgWrap(c) {
    return `<g class="avenue-canopy">${c}</g>`;
  }

  /** 未知地点回退到校门口 */
  function build(key) {
    const fn = BUILDERS[key] || BUILDERS.campus;
    const out = fn();
    return Object.assign({ sky: skyExtra(key) }, out);
  }

  SP.art = { build, BUILDERS, W, H, HORIZON, cloud, stars, defsCommon, tree, hills, smooth };
  SP.cloudShape = (seed) => svg(cloud(seed), 'cloud-svg');
})(window);
