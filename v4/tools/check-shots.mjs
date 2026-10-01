#!/usr/bin/env node
/**
 * 晴天以后 v2 · 截图体检
 * ------------------------------------------------------------------
 * 为什么需要它：截图是给人看的，但自动化流程里没人看图。
 * 一张「纯黑 / 纯色 / 没渲染出来」的图和一张正常的图，文件大小可能差不多。
 * 所以这里用浏览器把 PNG 真正解码出来，逐像素统计：
 *
 *   · 平均亮度 / 亮度标准差   → 判断是不是全黑、全白、死平
 *   · 颜色多样性（5bit 量化去重）→ 判断是不是单色块
 *   · 边缘密度（横向梯度）    → 判断有没有真实的画面结构
 *   · 主色 Top3              → 判断调色是否符合预期（比如夜景该偏暗青）
 *
 * 用法：node tools/check-shots.mjs
 */
import { readdir, writeFile, rm, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const exec = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'dist', 'shots');
const TMP = path.join(SHOTS, '__analyze.html');

const CHROME = process.env.CHROME_BIN
  || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const C = process.stdout.isTTY
  ? { d: '\x1b[2m', g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', b: '\x1b[1m', x: '\x1b[0m' }
  : { d: '', g: '', r: '', y: '', b: '', x: '' };

const files = (await readdir(SHOTS)).filter((f) => f.endsWith('.png')).sort();
if (!files.length) { console.error(`${C.r}dist/shots 里没有 PNG，请先跑 node tools/shots.mjs${C.x}`); process.exit(2); }

/* 分析页：逐个解码 + 统计，结果写进 <pre id="__stats"> */
const page = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>analyze</title>
<style>body{margin:0;background:#111;color:#eee;font:12px monospace}canvas{display:none}</style></head>
<body><pre id="__stats"></pre><script>
var FILES = ${JSON.stringify(files)};
var out = [];
var i = 0;
function next() {
  if (i >= FILES.length) {
    document.getElementById('__stats').textContent = '@@STAT' + 'S@@' + JSON.stringify(out) + '@@END' + 'STATS@@';
    return;
  }
  var name = FILES[i++];
  var img = new Image();
  img.onload = function () {
    try { out.push(analyze(name, img)); } catch (e) { out.push({ name: name, error: String(e) }); }
    next();
  };
  img.onerror = function () { out.push({ name: name, error: 'load failed' }); next(); };
  img.src = name;
}
function analyze(name, img) {
  var cv = document.createElement('canvas');
  cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  var g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  var d = g.getImageData(0, 0, cv.width, cv.height).data;
  var n = cv.width * cv.height;
  var sum = 0, sum2 = 0, edges = 0;
  var colors = {}; var cn = 0;
  var step = 1;
  for (var y = 0; y < cv.height; y++) {
    for (var x = 0; x < cv.width; x++) {
      var p = (y * cv.width + x) * 4;
      var r = d[p], gg = d[p + 1], b = d[p + 2];
      var lum = (r * 0.2126 + gg * 0.7152 + b * 0.0722);
      sum += lum; sum2 += lum * lum;
      var key = ((r >> 3) << 10) | ((gg >> 3) << 5) | (b >> 3);
      if (colors[key] === undefined) { colors[key] = 0; cn++; }
      colors[key]++;
      if (x > 0) {
        var q = p - 4;
        var dr = Math.abs(r - d[q]), dg = Math.abs(gg - d[q + 1]), db = Math.abs(b - d[q + 2]);
        if (dr + dg + db > 34) edges++;
      }
    }
  }
  var mean = sum / n;
  var sd = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
  var top = Object.keys(colors).sort(function (a, b) { return colors[b] - colors[a]; }).slice(0, 3)
    .map(function (k) {
      var v = +k;
      var r = ((v >> 10) & 31) << 3, gg = ((v >> 5) & 31) << 3, b = (v & 31) << 3;
      return { hex: '#' + [r, gg, b].map(function (c) { return c.toString(16).padStart(2, '0'); }).join(''), pct: +(colors[k] / n * 100).toFixed(1) };
    });
  return {
    name: name, w: cv.width, h: cv.height,
    lum: +mean.toFixed(1), sd: +sd.toFixed(1),
    colors: cn, uniquePct: +(cn / n * 100).toFixed(1),
    edgePct: +(edges / n * 100).toFixed(1),
    top: top,
  };
}
next();
</script></body></html>`;

await writeFile(TMP, page, 'utf8');

const args = [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  '--disable-extensions', '--allow-file-access-from-files',
  '--window-size=400,300', '--virtual-time-budget=20000', '--dump-dom',
  pathToFileURL(TMP).href,
];

let dom = '';
try {
  const r = await exec(CHROME, args, { maxBuffer: 128 * 1024 * 1024, timeout: 120_000, encoding: 'utf8' });
  dom = r.stdout;
} catch (e) { dom = e.stdout || ''; }
await rm(TMP, { force: true });

const m = dom.match(/@@STATS@@([\s\S]*?)@@ENDSTATS@@/);
if (!m) { console.error(`${C.r}分析页没有回传结果${C.x}`); process.exit(1); }
const rows = JSON.parse(m[1]);

/* ── 判定 ───────────────────────────────────────────────────────────
 * 场景图和 UI 面板要用不同的尺子量：
 * 场景图是满屏渐变 + 图形，边缘密度天然高；
 * 面板/文字为主的画面是「浅底 + 细字」，降采样和阈值统计都会偏低，
 * 它有没有内容由 shots.mjs 的 DOM 统计负责保证（元素数 / 文本长度），
 * 这里只要求它「不是一片死平」。
 * ------------------------------------------------------------------ */
const UI_HEAVY = /封面|分支图|结局图鉴|设置|故事记录|记录|存档|菜单|成就/;
const problems = [];
const judged = rows.map((r) => {
  if (r.error) { problems.push(`${r.name}: ${r.error}`); return { ...r, ok: false, why: r.error }; }
  const ui = UI_HEAVY.test(r.name);
  const minEdge = ui ? 0.55 : 1.2;
  const minColors = ui ? 120 : 40;
  const why = [];
  if (r.w < 100 || r.h < 100) why.push('尺寸异常');
  if (r.lum < 6) why.push('几乎全黑');
  if (r.lum > 250) why.push('几乎全白');
  if (r.sd < 6) why.push('画面死平（无明暗层次）');
  if (r.colors < minColors) why.push(`颜色过少(${r.colors} < ${minColors})`);
  if (r.edgePct < minEdge) why.push(`结构过少(边缘${r.edgePct}% < ${minEdge}%)`);
  const ok = why.length === 0;
  if (!ok) problems.push(`${r.name}: ${why.join('、')}`);
  return { ...r, ok, why: why.join('、'), ui };
});

/* ── 报告 ───────────────────────────────────────────────────────── */
const W = 26;
console.log(`\n${C.b}晴天以后 · 留一盏灯（漫游版） 截图体检${C.x} ${C.d}（逐像素解码 ${rows.length} 张）${C.x}`);
console.log('─'.repeat(104));
console.log(` ${'文件'.padEnd(W)} ${'尺寸'.padStart(11)} ${'亮度'.padStart(6)} ${'层次'.padStart(6)} ${'颜色数'.padStart(7)} ${'边缘%'.padStart(6)}  主色`);
console.log('─'.repeat(104));
for (const r of judged) {
  if (r.error) { console.log(` ${C.r}${r.name.padEnd(W)} ${r.error}${C.x}`); continue; }
  const tone = r.lum < 55 ? '夜景' : r.lum < 120 ? '中间调' : '日景';
  const top = (r.top || []).map((t) => `${t.hex} ${String(t.pct).padStart(4)}%`).join('  ');
  console.log(` ${r.ok ? `${C.g}✓${C.x}` : `${C.r}✗${C.x}`} ${r.name.padEnd(W - 2)} ${String(r.w + '×' + r.h).padStart(11)} `
    + `${String(r.lum).padStart(6)} ${String(r.sd).padStart(6)} ${String(r.colors).padStart(7)} ${String(r.edgePct).padStart(6)}  `
    + `${C.d}${r.ui ? '[面板] ' : ''}${tone} · ${top}${C.x}`);
}
console.log('─'.repeat(104));

const lum = judged.filter((r) => !r.error).map((r) => r.lum);
const dark = judged.filter((r) => !r.error && r.lum < 90).length;
console.log(` 亮度区间 ${Math.min(...lum).toFixed(0)} ~ ${Math.max(...lum).toFixed(0)}   偏暗画面 ${dark} 张   `
  + `平均边缘密度 ${(judged.filter((r) => !r.error).reduce((a, r) => a + r.edgePct, 0) / lum.length).toFixed(1)}%`);

if (problems.length) {
  console.log(`\n${C.r}✗ ${problems.length} 张可疑：${C.x}`);
  for (const p of problems) console.log(`   · ${p}`);
  console.log();
  process.exit(1);
}
console.log(`${C.g}✓ ${judged.length} 张全部通过：有明暗层次、颜色丰富、结构清晰${C.x}\n`);
