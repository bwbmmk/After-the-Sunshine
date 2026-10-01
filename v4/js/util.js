/*!
 * 晴天以后 · v2  |  util.js
 * 基础工具层：DOM、颜色运算、动画、存储、数学。
 * 无依赖，挂载到 window.SP。
 */
(function (global) {
  'use strict';
  const SP = (global.SP = global.SP || {});

  /* ---------------------------------- DOM --------------------------------- */

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /** 创建元素：h('div.cls#id', {attr}, ...children) */
  function h(spec, attrs, ...children) {
    const m = /^([a-z0-9]+)?(.*)$/i.exec(spec);
    const tag = m[1] || 'div';
    const el = document.createElement(tag);
    const idm = /#([\w-]+)/.exec(m[2] || '');
    if (idm) el.id = idm[1];
    const clsm = (m[2] || '').match(/\.([\w-]+)/g);
    if (clsm) el.className = clsm.map((s) => s.slice(1)).join(' ');
    if (attrs && (typeof attrs !== 'object' || attrs.nodeType || Array.isArray(attrs))) {
      children.unshift(attrs);
      attrs = null;
    }
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = (el.className ? el.className + ' ' : '') + v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'text') el.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'data' && typeof v === 'object') for (const d in v) el.dataset[d] = v[d];
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    append(el, children);
    return el;
  }

  function append(el, children) {
    for (const c of children) {
      if (c == null || c === false) continue;
      if (Array.isArray(c)) append(el, c);
      else el.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
  }

  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
    return el;
  }

  /* --------------------------------- 颜色 --------------------------------- */

  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function hex2rgb(hex) {
    let s = String(hex).trim().replace('#', '');
    if (s.length === 3) s = s.split('').map((c) => c + c).join('');
    const n = parseInt(s, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgb2hex(rgb) {
    return (
      '#' +
      rgb
        .map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0'))
        .join('')
    );
  }
  /** 按比例缩放亮度 */
  function scale(hex, k) {
    return rgb2hex(hex2rgb(hex).map((v) => v * k));
  }
  /** 线性混合两色，t=0 → a，t=1 → b */
  function mix(a, b, t) {
    const A = hex2rgb(a), B = hex2rgb(b);
    return rgb2hex([lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)]);
  }
  /** 相对亮度 0~1 */
  function luma(hex) {
    const [r, g, b] = hex2rgb(hex);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }
  /** 提高/降低饱和度 */
  function saturate(hex, k) {
    const [r, g, b] = hex2rgb(hex);
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return rgb2hex([l + (r - l) * k, l + (g - l) * k, l + (b - l) * k]);
  }
  function rgba(hex, a) {
    const [r, g, b] = hex2rgb(hex);
    return `rgba(${r},${g},${b},${a})`;
  }

  /* --------------------------------- 数学 --------------------------------- */

  /** 确定性伪随机（同一个 seed 永远得到同一串数） */
  function rng(seed) {
    let s = seed >>> 0 || 1;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  /* --------------------------------- 存储 --------------------------------- */

  const Store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        if (raw == null) return fallback;
        return JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    },
    del(key) {
      try {
        localStorage.removeItem(key);
      } catch {}
    },
  };

  /* --------------------------------- 杂项 --------------------------------- */

  function fmtTime(ts) {
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function relativeTime(ts) {
    const diff = Date.now() - ts;
    if (diff < 60e3) return '刚刚';
    if (diff < 3600e3) return Math.floor(diff / 60e3) + ' 分钟前';
    if (diff < 86400e3) return Math.floor(diff / 3600e3) + ' 小时前';
    if (diff < 7 * 86400e3) return Math.floor(diff / 86400e3) + ' 天前';
    return fmtTime(ts).slice(0, 10);
  }

  /** 中文字数友好的逐字节奏 */
  function typeDelay(ch, baseSpeed) {
    if (/[。！？…—]/.test(ch)) return 4.2;
    if (/[，、；：]/.test(ch)) return 2.1;
    if (/[“”「」『』]/.test(ch)) return 1.4;
    return 1;
  }

  function debounce(fn, wait) {
    let t = null;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  /** 下载一段文本为文件 */
  function download(filename, text, mime = 'application/json') {
    const blob = new Blob([text], { type: mime + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /** 复制文本到剪贴板（带回退） */
  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
      } catch {
        return false;
      }
    }
  }

  Object.assign(SP, {
    $, $$, h, append, clear,
    clamp, lerp, hex2rgb, rgb2hex, scale, mix, luma, saturate, rgba,
    rng, easeOut, easeInOut,
    Store, fmtTime, relativeTime, typeDelay, debounce, download, copy,
  });
})(window);
