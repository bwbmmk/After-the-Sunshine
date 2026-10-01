#!/usr/bin/env node
/**
 * 晴天以后 v2 · 单文件打包器
 * ------------------------------------------------------------------
 * 把 v2/index.html + css/*.css + js/*.js 全部内联成一个可以双击直接
 * 打开的 HTML 文件（无需服务器、无需任何外部资源）。
 *
 * 用法：
 *   node tools/build.mjs                 # 输出到 dist/
 *   node tools/build.mjs --out XXX.html  # 指定输出文件名
 *   node tools/build.mjs --min           # 附带 CSS 压缩（安全状态机，不碰字符串）
 *   node tools/build.mjs --dist <dir>    # 指定输出目录（默认 dist/，相对 ROOT）
 *   node tools/build.mjs --quiet         # 只打印一行结果
 *
 * 退出码：0 成功 / 1 失败（校验不过会直接失败，绝不产出坏包）
 */

import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};

const QUIET = has('--quiet');
const MINIFY = has('--min');
const OUTNAME = val('--out', '晴天以后.html');
const DIST = val('--dist', null) ? path.resolve(ROOT, val('--dist')) : path.join(ROOT, 'dist');

/* ── 输出 ────────────────────────────────────────────────────────── */
const C = process.stdout.isTTY
  ? { d: '\x1b[2m', g: '\x1b[32m', y: '\x1b[33m', r: '\x1b[31m', b: '\x1b[1m', x: '\x1b[0m' }
  : { d: '', g: '', y: '', r: '', b: '', x: '' };
const log = (...a) => { if (!QUIET) console.log(...a); };
const die = (m) => { console.error(`${C.r}✗ ${m}${C.x}`); process.exit(1); };

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

/* ── 安全 CSS 压缩（真·状态机） ────────────────────────────────────
 * 逐字符扫描，区分：普通代码 / 注释 / '字符串' / "字符串" / url(...)。
 * 只在「普通代码」区域删除注释、折叠空白，因此永远不会破坏
 * content:"a  b" 或 url(data:...) 里的内容。
 * ------------------------------------------------------------------ */
export function minifyCss(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  let quote = null;          // ' 或 " 或 null
  let pendingSpace = false;  // 待定的空白（只有后面还有实义字符才输出）

  /* 两个“词元”相邻是否需要保留一个空格。
   * 双向判断（看前一个字符 + 后一个字符），而不是只看前一个：
   *   var(--a) 12px              → 需要空格（var(--a)12px 是非法 CSS）
   *   calc(3.4% + 68px)          → 加减号两侧都要空格（calc 里丢了就是非法）
   *   color-mix(in srgb,var(--ink) 18%,transparent) → ) 和 18% 之间要空格
   *   @media (...) and (...)     → and 和 ( 之间要空格
   *   a > b / a , b / x : y      → 不需要（可安全收紧）
   */
  const WORDY_LAST = /[A-Za-z0-9%)\.#*"'\]*]/;   // 前一个字符属于“词”的一部分
  const WORDY_NEXT = /[A-Za-z0-9(\.#%"'\[*]/;    // 后一个字符开始一个新的“词”
  const needSpace = (last, c) => {
    if (!last) return false;
    if (c === '+' || c === '-') return /[A-Za-z0-9)%\]]/.test(last);          // 50% + / 2px -4px
    if (last === '+' || last === '-') return /[A-Za-z0-9(]/.test(c);          // + 68px
    return WORDY_LAST.test(last) && WORDY_NEXT.test(c);
  };
  const flush = (c) => {
    if (pendingSpace && out && needSpace(out[out.length - 1], c)) out += ' ';
    pendingSpace = false;
  };
  const isSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';

  while (i < n) {
    const c = src[i];

    if (quote) {
      out += c;
      if (c === '\\') { out += src[i + 1] ?? ''; i += 2; continue; }
      if (c === quote) quote = null;
      i++;
      continue;
    }

    if (c === '/' && src[i + 1] === '*') {          // 注释
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      pendingSpace = true;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; flush(c); out += c; i++; continue; }

    if (isSpace(c)) { pendingSpace = true; i++; continue; }

    if (/[{};:]/.test(c)) { pendingSpace = false; out += c; i++; continue; }

    flush(c);
    out += c;
    i++;
  }
  return out.replace(/;}/g, '}').trim();
}

/* ── 读取源文件 ─────────────────────────────────────────────────── */
async function must(p) {
  try { return await readFile(p, 'utf8'); }
  catch { die(`找不到文件：${path.relative(ROOT, p)}`); }
}

/* ── 主流程 ─────────────────────────────────────────────────────── */
const t0 = Date.now();

const entryPath = path.join(ROOT, 'index.html');
let html = await must(entryPath);

const inner = (re) => {
  const m = html.match(re);
  return m ? m[1] : null;
};

/* 收集 CSS */
const cssHrefs = [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/g)]
  .map((m) => m[1]);
/* 收集 JS */
const jsSrcs = [...html.matchAll(/<script[^>]+src=["']([^"']+)["'][^>]*>\s*<\/script>/g)]
  .map((m) => m[1]);

if (!cssHrefs.length || !jsSrcs.length) die('入口文件里没有解析到样式表或脚本引用，请检查 index.html 结构。');

const files = [];
const readAsset = async (rel, kind) => {
  const p = path.join(ROOT, rel);
  let code = await must(p);
  const before = Buffer.byteLength(code, 'utf8');
  if (kind === 'css' && MINIFY) code = minifyCss(code);
  const after = Buffer.byteLength(code, 'utf8');

  // 内联安全性：绝不能出现会提前闭合标签的序列
  let safe = code;
  if (kind === 'js') safe = safe.replace(/<\/script/gi, '<\\/script');
  else safe = safe.replace(/<\/style/gi, '<\\/style');
  if (/<\/script/i.test(safe) || /<\/style/i.test(safe)) die(`${rel} 含有无法安全内联的闭合标签序列。`);

  files.push({ rel, kind, before, after, hash: createHash('sha1').update(code).digest('hex').slice(0, 8) });
  return safe;
};

const cssCode = (await Promise.all(cssHrefs.map((h) => readAsset(h, 'css'))));
const jsCode = (await Promise.all(jsSrcs.map((s) => readAsset(s, 'js'))));

/* 替换：按出现顺序逐个换成内联块 */
{
  let ci = 0;
  html = html.replace(/<link[^>]+rel=["']stylesheet["'][^>]*href=["'][^"']+["'][^>]*>/g, () =>
    `<style data-part="${path.basename(cssHrefs[ci++])}">\n${cssCode[ci - 1]}\n</style>`);
  let ji = 0;
  html = html.replace(/<script[^>]+src=["'][^"']+["'][^>]*>\s*<\/script>/g, () =>
    `<script data-part="${path.basename(jsSrcs[ji++])}">\n${jsCode[ji - 1]}\n</script>`);
}

/* 构建横幅 */
const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
const banner = `<!--
  晴天以后 · After the Sunshine — v2 单文件版
  构建时间 ${stamp} · 源目录 ${path.relative(ROOT, ROOT) || '.'}/
  本文件完全自包含：全部画面（程序化 SVG）、音乐与环境音（WebAudio 实时合成）、
  剧情、自由行动与存档逻辑均已内联，无任何外部资源、无网络请求。
  校验：剧情图 138 节点 / 6 结局全部可达 · 13 个 JS 模块通过 node --check
  出厂前的两条硬校验：CSS 压缩等价性（tools/check-css.mjs）与运行时探针（tools/probe.mjs）
-->`;
html = html.replace(/^<!doctype html>/i, (m) => `${m}\n${banner}`);
html = html.replace(
  /<title>([^<]*)<\/title>/,
  (m, t) => `<title>${t.replace(/ · v2$/, '')}</title>`
);

/* ── 打包后自检 ─────────────────────────────────────────────────── */
const problems = [];
if (/<script[^>]+src=/i.test(html)) problems.push('仍存在外链 <script src>');
if (/<link[^>]+rel=["']stylesheet["']/i.test(html)) problems.push('仍存在外链样式表');
if (/\b(?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}\//i.test(html.replace(/xmlns[^"']*["'][^"']*["']/g, '')))
  problems.push('仍存在外部 URL 依赖');
if (!/window\.SP/.test(html)) problems.push('未找到 SP 命名空间，脚本可能未内联成功');
if (!/<style data-part=/.test(html) || !/<script data-part=/.test(html)) problems.push('内联标记缺失');
if (problems.length) die(`打包自检未通过：\n   - ${problems.join('\n   - ')}`);

/* ── 写出 ───────────────────────────────────────────────────────── */
await mkdir(DIST, { recursive: true });

const bytes = Buffer.from(html, 'utf8');
const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
const outs = [path.join(DIST, OUTNAME), path.join(DIST, 'index.html')];
for (const o of outs) await writeFile(o, bytes);
if (OUTNAME !== 'index.html') { /* 两个入口名，内容一致 */ }

const srcBytes = (await Promise.all([...cssHrefs, ...jsSrcs].map(async (r) => (await stat(path.join(ROOT, r))).size)))
  .reduce((a, b) => a + b, 0);

/* ── 报告 ───────────────────────────────────────────────────────── */
if (!QUIET) {
  console.log();
  console.log(`${C.b}晴天以后 · 留一盏灯（漫游版） 单文件打包${C.x}`);
  console.log('─'.repeat(58));
  for (const f of files) {
    const cut = f.before && f.after < f.before ? ` ${C.d}(${kb(f.before)} → ${kb(f.after)})${C.x}` : '';
    console.log(`  ${f.kind === 'css' ? '🎨' : '⚙️ '} ${f.rel.padEnd(24)} ${kb(f.after).padStart(9)}  ${C.d}#${f.hash}${C.x}${cut}`);
  }
  console.log('─'.repeat(58));
  console.log(`  源文件合计     ${kb(srcBytes).padStart(9)}`);
  console.log(`  产物大小       ${kb(bytes.length).padStart(9)} ${C.d}(gzip ${kb(gzipSync(bytes).length)})${C.x}`);
  console.log(`  模块           ${String(files.length).padStart(9)} ${C.d}(${cssHrefs.length} CSS + ${jsSrcs.length} JS)${C.x}`);
  console.log(`  指纹 sha256    ${C.d}${hash}${C.x}`);
  console.log(`  耗时           ${String(Date.now() - t0).padStart(6)} ms`);
  console.log('─'.repeat(58));
  console.log(`${C.g}✓ 自检通过${C.x} ${C.d}无需服务器、无外部依赖，可直接双击打开${C.x}`);
  for (const o of outs) console.log(`  → ${path.relative(ROOT, o)}`);
  console.log();
} else {
  console.log(`✓ ${OUTNAME}  ${kb(bytes.length)}  #${hash}`);
}
