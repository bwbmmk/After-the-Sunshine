/*!
 * 晴天以后 · v2  |  palette.js
 * 调色引擎：把「地点 × 时段 × 天气」解算成一组 CSS 自定义属性。
 * 场景 SVG 只引用 var(--c-*)，因此换时段时整幅画面会平滑重新上色。
 */
(function (global) {
  'use strict';
  const SP = global.SP;
  const { mix, scale, clamp, rgba, luma } = SP;

  /* ------------------------------- 时段定义 ------------------------------- */

  const TIMES = {
    dawn: {
      label: '清晨',
      sky: ['#f0c69c', '#fbe4cb', '#dfe6df'],
      key: '#ffd8a2', keyA: 0.24, ambient: 1.0, star: 0,
      sun: { x: 0.14, y: 0.70, r: 96, c: '#ffeec2', a: 0.95, kind: 'sun' },
      glow: 0.75, fog: 0.22,
    },
    morning: {
      label: '上午',
      sky: ['#a6d5e2', '#dbead8', '#f7eacd'],
      key: '#fff4d2', keyA: 0.2, ambient: 1.05, star: 0,
      sun: { x: 0.76, y: 0.24, r: 80, c: '#fff8dc', a: 0.9, kind: 'sun' },
      glow: 0.8, fog: 0.1,
    },
    day: {
      label: '白天',
      sky: ['#8fc9dd', '#cde5dd', '#eff1dd'],
      key: '#fffaeb', keyA: 0.16, ambient: 1.1, star: 0,
      sun: { x: 0.68, y: 0.13, r: 74, c: '#fffdf0', a: 0.85, kind: 'sun' },
      glow: 0.85, fog: 0.06,
    },
    afternoon: {
      label: '午后',
      sky: ['#a6cee0', '#e4dcc6', '#f7dcb6'],
      key: '#ffe0af', keyA: 0.21, ambient: 1.03, star: 0,
      sun: { x: 0.16, y: 0.30, r: 82, c: '#ffeec4', a: 0.9, kind: 'sun' },
      glow: 0.78, fog: 0.12,
    },
    dusk: {
      label: '黄昏',
      sky: ['#6c7c99', '#c8918a', '#f0c49c'],
      key: '#ffb98a', keyA: 0.27, ambient: 0.85, star: 0.16,
      sun: { x: 0.12, y: 0.66, r: 92, c: '#ffd9a0', a: 0.95, kind: 'sun' },
      glow: 0.62, fog: 0.2,
    },
    night: {
      label: '夜晚',
      sky: ['#1d2e46', '#354e6b', '#586b7d'],
      key: '#a9c9ef', keyA: 0.15, ambient: 0.6, star: 1,
      sun: { x: 0.8, y: 0.19, r: 58, c: '#f4f0dd', a: 0.92, kind: 'moon' },
      glow: 0.28, fog: 0.14,
    },
    deep: {
      label: '深夜',
      sky: ['#101a2b', '#1f2f45', '#334255'],
      key: '#8fb4e0', keyA: 0.13, ambient: 0.46, star: 1,
      sun: { x: 0.84, y: 0.15, r: 54, c: '#eef0e2', a: 0.9, kind: 'moon' },
      glow: 0.2, fog: 0.12,
    },
  };

  const TIME_ORDER = ['dawn', 'morning', 'day', 'afternoon', 'dusk', 'night', 'deep'];

  /* ------------------------------- 天气定义 ------------------------------- */

  const WEATHERS = {
    clear: { label: '晴', darken: 1.0, desat: 1.0, cloud: 0.5, rain: 0, wet: 0, fogMul: 1, veil: 0 },
    fair: { label: '少云', darken: 1.0, desat: 1.0, cloud: 1.0, rain: 0, wet: 0, fogMul: 1.1, veil: 0.02 },
    overcast: { label: '阴', darken: 0.94, desat: 0.82, cloud: 1.6, rain: 0, wet: 0.05, fogMul: 1.5, veil: 0.06 },
    drizzle: { label: '微雨', darken: 0.88, desat: 0.74, cloud: 1.8, rain: 0.45, wet: 0.6, fogMul: 1.8, veil: 0.09 },
    rain: { label: '雨', darken: 0.8, desat: 0.66, cloud: 2.1, rain: 1, wet: 1, fogMul: 2.1, veil: 0.13 },
    fog: { label: '雾', darken: 1.0, desat: 0.7, cloud: 1.3, rain: 0, wet: 0.25, fogMul: 3.2, veil: 0.1 },
    snow: { label: '雪', darken: 0.96, desat: 0.6, cloud: 1.5, rain: 0.7, wet: 0.3, fogMul: 1.7, veil: 0.1, snow: 1 },
  };

  /* ------------------------- 地点基础色（白日基准） ------------------------ */

  const BASE = {
    far: '#a8c3c9', mid: '#8fae9c', near: '#6f9480',
    ground: '#86aa97', ground2: '#74988c', path: '#e8dcc3',
    wall: '#f9f3df', wall2: '#e7e0c9', roof: '#b77e71', trim: '#cfc6ad',
    trunk: '#6e806c', leaf: '#6f9a80', leaf2: '#94bda2',
    water: '#80b3b0', water2: '#689c9d',
    glass: '#a9ced0', warm: '#fff2cb', wood: '#baad96', metal: '#8b9b8c',
    accent: '#d98f7a', ink: '#3c5a5a', bloom: '#f0a0b4',
  };

  const SCENES = {
    campus: {
      label: '校门口',
      patch: {
        far: '#9fbcc6', mid: '#8bae9a', leaf: '#6f9a80', leaf2: '#9ac2a2',
        wall: '#faf4e0', roof: '#b77e71', accent: '#c9714f',
      },
    },
    avenue: {
      label: '林荫道',
      patch: {
        far: '#a9c6cd', mid: '#7ba083', leaf: '#5f8c72', leaf2: '#8ab894', ground: '#7fa38e',
        path: '#ded2b6',
      },
    },
    club: {
      label: '社团大道',
      patch: { far: '#a4c2ca', mid: '#87aa96', accent: '#e07f66', bloom: '#e79bb0', path: '#e6d9c0' },
    },
    canteen: {
      label: '食堂门口',
      patch: { wall: '#fdf3da', roof: '#c98a63', accent: '#e2a24f', glow: 1 },
    },
    plaza: {
      label: '广场公告栏',
      patch: {
        far: '#a9c5cc', mid: '#8db09b', leaf: '#6f9c82', leaf2: '#9bc3a4',
        wall: '#f8f1dc', roof: '#b98274', trim: '#d6cdb4', path: '#e4d7bc',
      },
    },
    classroom: {
      label: '专业课教室', interior: true,
      patch: {
        wall: '#f3eede', wall2: '#d2c8ac', wood: '#b68f57', trim: '#a2916f',
        glass: '#bcd8d7', ink: '#3b5250', floor: '#ab9668', warm: '#ffeec6',
      },
    },
    lecture: {
      label: '阶梯教室', interior: true,
      patch: {
        wall: '#eae4d4', wall2: '#c6bda2', wood: '#ab8a55', trim: '#98875f',
        glass: '#b6d0d2', ink: '#374b47', floor: '#a08a5c', warm: '#ffeec6',
      },
    },
    dorm: {
      label: '宿舍', interior: true,
      patch: {
        wall: '#d8dad3', wall2: '#adb2b3', wood: '#b79a70', trim: '#98a1a0',
        glass: '#93a8bb', ink: '#3c4c55', floor: '#a89c86', warm: '#ffe3ac',
      },
    },
    library: {
      label: '图书馆', interior: true,
      patch: {
        wall: '#eee5d1', wall2: '#cec0a0', wood: '#9c7c4f', trim: '#87765a',
        glass: '#c2d8d4', ink: '#454034', floor: '#b09a70', warm: '#ffe0a6',
      },
    },
    lake: {
      label: '校园湖边',
      patch: {
        far: '#b3ccd4', mid: '#84a893', water: '#7fb2b4', water2: '#5f9599',
        leaf: '#6d9a7d', leaf2: '#97c0a0', ground: '#8aab97', path: '#e2d6bb',
      },
    },
    cafe: {
      label: '校园咖啡馆', interior: true,
      patch: {
        wall: '#efdfc8', wall2: '#c9b394', wood: '#8f6a44', trim: '#a8865f',
        glass: '#a8c4c6', ink: '#453a2c', floor: '#a68a63', warm: '#ffd8a0',
        accent: '#c0764f',
      },
    },
    roof: {
      label: '教学楼天台',
      patch: {
        far: '#5f7b93', mid: '#6d8a90', near: '#5c7880', ground: '#7f9a9a', ground2: '#647f84',
        wall: '#c8c9c2', wall2: '#a3a8a5', trim: '#d6c9ae', metal: '#8f9a99',
      },
    },
    track: {
      label: '黄昏操场',
      patch: {
        far: '#6d7f96', mid: '#7d8f8b', near: '#5f7674', ground: '#7f9884', ground2: '#68806f',
        accent: '#c98a72', leaf: '#5e7f6c', leaf2: '#82a68c', path: '#d8c6ab',
      },
    },
    hall: {
      label: '社团放映室', interior: true,
      patch: {
        wall: '#d9d2c4', wall2: '#a8a49a', wood: '#8f7350', trim: '#7d7566',
        glass: '#8fa6b0', ink: '#2f3c44', floor: '#a89478', warm: '#ffd792',
      },
    },
  };

  /* ------------------------------ 解算主函数 ------------------------------ */

  /** 把基础色按「环境亮度 + 时段主光色」重新调色 */
  function gradeColor(hex, t, ambient, key, keyA, w) {
    let c = hex;
    if (w.desat !== 1) {
      const l = 0.2126 * SP.hex2rgb(c)[0] + 0.7152 * SP.hex2rgb(c)[1] + 0.0722 * SP.hex2rgb(c)[2];
      const [r, g, b] = SP.hex2rgb(c);
      c = SP.rgb2hex([l + (r - l) * w.desat, l + (g - l) * w.desat, l + (b - l) * w.desat]);
    }
    c = scale(c, ambient * w.darken);
    c = mix(c, key, keyA * 0.85);
    return c;
  }

  /**
   * @param {string} sceneKey 地点
   * @param {string} timeKey  时段
   * @param {string} weatherKey 天气
   * @returns {Object<string,string>} CSS 变量表
   */
  function theme(sceneKey, timeKey, weatherKey) {
    const t = TIMES[timeKey] || TIMES.day;
    const w = WEATHERS[weatherKey] || WEATHERS.clear;
    const scene = SCENES[sceneKey] || SCENES.campus;
    const base = Object.assign({}, BASE, scene.patch || {});
    // 室内有灯：给一个环境亮度下限，否则夜里会灰成一团
    const amb = scene.interior ? Math.max(t.ambient, 0.84) : t.ambient;
    const vars = {};

    // 天空
    const sky = t.sky.map((c, i) => {
      let out = scale(c, w.darken);
      out = mix(out, t.key, t.keyA * (i === 0 ? 0.5 : 0.2));
      if (w.desat !== 1) {
        const l = luma(out);
        out = mix(out, SP.rgb2hex([l * 255, l * 255, l * 255]), (1 - w.desat) * 0.45);
      }
      return out;
    });
    vars['--sky-1'] = sky[0];
    vars['--sky-2'] = sky[1];
    vars['--sky-3'] = sky[2];
    vars['--sky-mid'] = mix(sky[0], sky[1], 0.55);

    // 场景物
    for (const k in base) {
      vars['--c-' + k] = gradeColor(base[k], t, amb, t.key, t.keyA, w);
    }

    // 暖光：夜里反而更亮（窗里亮着灯）
    const nightBoost = clamp(1 + (1 - amb) * 1.5, 1, 1.9);
    vars['--c-warm'] = mix(scale(base.warm, amb * nightBoost), t.key, t.keyA * 0.4);
    vars['--c-lamp'] = mix(scale('#ffd98a', nightBoost), t.key, t.keyA * 0.3);

    // 光源
    vars['--sun-x'] = (t.sun.x * 100).toFixed(1) + '%';
    vars['--sun-y'] = (t.sun.y * 100).toFixed(1) + '%';
    vars['--sun-r'] = t.sun.r + 'px';
    vars['--sun-c'] = mix(t.sun.c, t.key, t.keyA * 0.5);
    vars['--sun-a'] = (t.sun.a * (w.rain > 0.5 ? 0.35 : 1)).toFixed(2);
    vars['--star-a'] = (t.star * (1 - Math.min(1, w.rain)) * (1 - Math.min(1, (w.fogMul - 1) / 2.5))).toFixed(2);
    vars['--moon-a'] = t.sun.kind === 'moon' ? 1 : 0;
    vars['--sun-op'] = t.sun.kind === 'moon' ? 0 : 1;

    // 氛围叠加
    vars['--amb-c'] = t.key;
    vars['--amb-o'] = (t.keyA * 0.9 + w.veil).toFixed(3);
    vars['--cloud-a'] = (0.5 * w.cloud).toFixed(2);
    vars['--glow-a'] = (t.glow * (w.rain > 0.5 ? 0.3 : 1)).toFixed(2);
    vars['--fog-a'] = clamp(t.fog * w.fogMul * 0.34, 0, 0.6).toFixed(3);
    vars['--wet-a'] = w.wet.toFixed(2);
    vars['--night'] = amb < 0.72 ? 1 : 0;
    vars['--veil-a'] = w.veil.toFixed(3);

    // 单位用：UI 背景色跟随天空，让界面与画面同色系
    vars['--ui-tint'] = sky[1];
    vars['--lamp-a'] = ((1 - clamp((amb - 0.4) / 0.6, 0, 1)) * 0.9 + 0.1).toFixed(2);

    return vars;
  }

  function applyTheme(el, sceneKey, timeKey, weatherKey) {
    const vars = theme(sceneKey, timeKey, weatherKey);
    for (const k in vars) el.style.setProperty(k, vars[k]);
    el.dataset.time = timeKey;
    el.dataset.weather = weatherKey;
    el.dataset.scene = sceneKey;
    return vars;
  }

  /** 时段插值：让剧情从白天走到夜晚是渐变的而不是跳变 */
  function timeTween(from, to, k) {
    const i = TIME_ORDER.indexOf(from), j = TIME_ORDER.indexOf(to);
    if (i < 0 || j < 0 || i === j) return { a: to, b: to, k: 0 };
    return { a: from, b: to, k: clamp(k, 0, 1) };
  }

  SP.palette = { TIMES, TIME_ORDER, WEATHERS, SCENES, BASE, theme, applyTheme, gradeColor, timeTween };
  // 便捷别名
  SP.SCENES = SCENES;
})(window);
