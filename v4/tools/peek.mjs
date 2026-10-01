#!/usr/bin/env node
/**
 * 晴天以后 v2 · 终端看图（ASCII 缩略图）
 * ------------------------------------------------------------------
 * 自动化流程里没人能「看」截图。这个脚本把 PNG 解码后降采样成
 * 字符画打印到终端，用亮度做灰阶、用色相做标记，于是在纯文本环境里
 * 也能大致判断画面布局：天空在上、地面在下、面板有没有盖住画面等。
 *
 * 用法：
 *   node tools/peek.mjs <png路径|dist/shots 里的文件名> [更多…]
 *   node tools/peek.mjs --all             # 看全部
 *   node tools/peek.mjs 12_分支图 --cols 40 --rows 18
 */
import { readdir, writeFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const exec = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'dist', 'shots');
const TMP = path.join(SHOTS, '__peek.html');

const CHROME = process.env.CHROME_BIN
  || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

/* ── 参数 ─────────────────────────────────────────────────────────── */
const argv = process.argv.slice(2);
const num = (flag, d) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : d;
};
const COLS = num('--cols', 30);
const ROWS = num('--rows', 13);
const ALL = argv.includes('--all');
const names = argv.filter((a, a_i) => !a.startsWith('--') && !(a_i > 0 && argv[a_i - 1].startsWith('--')));

const C = process.stdout.isTTY
  ? { d: '\x1b[2m', g: '\x1b[32m', b: '\x1b[1m', x: '\x1b[0m' }
  : { d: '', g: '', b: '', x: '' };

let files;
if (ALL) files = (await readdir(SHOTS)).filter((f) => f.endsWith('.png')).sort();
else {
  const all = (await readdir(SHOTS)).filter((f) => f.endsWith('.png'));
  files = names.map((n) => {
    const hit = all.find((f) => f === n || f.includes(n));
    return hit || n;
  });
}
if (!files.length) { console.error('用法：node tools/peek.mjs <文件名…> | --all'); process.exit(2); }

/* ── 解码 + 降采样 ────────────────────────────────────────────────── */
const page = `<!doctype html><html><head><meta charset="utf-8"><title>peek</title>
<style>body{margin:0;background:#111}canvas{display:none}</style></head><body>
<pre id="__peek"></pre><script>
var FILES = ${JSON.stringify(files)};
var COLS = ${COLS}, ROWS = ${ROWS};
var out = [];
var i = 0;
function next() {
  if (i >= FILES.length) {
    document.getElementById('__peek').textContent = '@@PK' + 'K@@' + JSON.stringify(out) + '@@ENDPK' + 'K@@';
    return;
  }
  var name = FILES[i++];
  var img = new Image();
  img.onload = function () {
    try { out.push(grab(name, img)); } catch (e) { out.push({ name: name, error: String(e) }); }
    next();
  };
  img.onerror = function () { out.push({ name: name, error: 'load failed' }); next(); };
  img.src = name;
}
function grab(name, img) {
  var W = img.naturalWidth, H = img.naturalHeight;
  var cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  var g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  var d = g.getImageData(0, 0, W, H).data;
  var cells = [];
  for (var ry = 0; ry < ROWS; ry++) {
    var row = [];
    for (var rx = 0; rx < COLS; rx++) {
      var x0 = Math.floor(rx * W / COLS), x1 = Math.floor((rx + 1) * W / COLS);
      var y0 = Math.floor(ry * H / ROWS), y1 = Math.floor((ry + 1) * H / ROWS);
      var r = 0, gg = 0, b = 0, n = 0;
      for (var y = y0; y < y1; y += 2) {
        for (var x = x0; x < x1; x += 2) {
          var p = (y * W + x) * 4;
          r += d[p]; gg += d[p + 1]; b += d[p + 2]; n++;
        }
      }
      r = r / n; gg = gg / n; b = b / n;
      var lum = r * 0.2126 + gg * 0.7152 + b * 0.0722;
      var mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
      var sat = mx === 0 ? 0 : (mx - mn) / mx;
      var hue = 0;
      if (mx === mn) hue = -1;
      else if (mx === r) hue = ((gg - b) / (mx - mn) + 6) % 6;
      else if (mx === gg) hue = (b - r) / (mx - mn) + 2;
      else hue = (r - gg) / (mx - mn) + 4;
      row.push({ lum: Math.round(lum), hex: '#' + [r, gg, b].map(function (v) { return Math.round(v).toString(16).padStart(2, '0'); }).join(''), sat: +sat.toFixed(2), hue: hue < 0 ? -1 : Math.round(hue * 60) });
    }
    cells.push(row);
  }
  return { name: name, w: W, h: H, cells: cells };
}
next();
</script></body></html>`;

await writeFile(TMP, page, 'utf8');
let dom = '';
try {
  const r = await exec(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--disable-extensions', '--allow-file-access-from-files',
    '--window-size=400,300', '--virtual-time-budget=20000', '--dump-dom',
    pathToFileURL(TMP).href,
  ], { maxBuffer: 128 * 1024 * 1024, timeout: 120_000, encoding: 'utf8' });
  dom = r.stdout;
} catch (e) { dom = e.stdout || ''; }
await rm(TMP, { force: true });

const m = dom.match(/@@PKK@@([\s\S]*?)@@ENDPKK@@/);
if (!m) { console.error('看图页没有回传结果'); process.exit(1); }
const imgs = JSON.parse(m[1]);

/* ── 打印 ─────────────────────────────────────────────────────────── */
/* 灰阶：暗 → 亮 */
const RAMP = '@%#*+=-:. ';
/* 有饱和度的格子改用色相标记，方便区分天空（青蓝）与地面（绿黄） */
const HUE_CH = (h) => {
  if (h < 0) return null;
  if (h < 20 || h >= 330) return 'R';   // 红
  if (h < 45) return 'O';               // 橙
  if (h < 70) return 'Y';               // 黄
  if (h < 160) return 'G';              // 绿
  if (h < 200) return 'C';              // 青
  if (h < 260) return 'B';              // 蓝
  if (h < 330) return 'P';              // 紫
  return null;
};

for (const im of imgs) {
  if (im.error) { console.log(`\n${C.b}${im.name}${C.x}\n  ✗ ${im.error}`); continue; }
  console.log(`\n${C.b}${im.name}${C.x} ${C.d}${im.w}×${im.h} → ${COLS}×${ROWS}${C.x}`);
  console.log('  ┌' + '─'.repeat(COLS) + '┐');
  for (const row of im.cells) {
    let line = '  │';
    for (const c of row) {
      const hueChar = c.sat > 0.14 ? HUE_CH(c.hue) : null;
      if (hueChar) line += hueChar;
      else {
        const idx = Math.min(RAMP.length - 1, Math.floor((c.lum / 255) * RAMP.length));
        line += RAMP[idx];
      }
    }
    line += '│';
    console.log(line);
  }
  console.log('  └' + '─'.repeat(COLS) + '┘');
  // 抽查几个位置的实色，便于核对
  const at = (fy, fx) => im.cells[Math.floor(fy * ROWS)][Math.floor(fx * COLS)];
  console.log(`  ${C.d}采样 左上${at(0.1, 0.1).hex}  上中${at(0.08, 0.5).hex}  中${at(0.5, 0.5).hex}  下中${at(0.9, 0.5).hex}  下左${at(0.92, 0.12).hex}${C.x}`);
}
console.log(`\n${C.d}灰阶 @最暗 → 空格最亮；彩格用色相字母 R红 O橙 Y黄 G绿 C青 B蓝 P紫（饱和度高时）${C.x}\n`);
