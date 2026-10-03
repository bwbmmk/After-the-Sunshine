#!/usr/bin/env node
/**
 * 打包器 CSS 等价性校验
 * ------------------------------------------------------------------
 * 为什么需要它：
 *   build.mjs 带 --min 时会做 CSS 压缩（删注释、折叠空白）。压缩器一旦
 *   手抖把 `calc(100% - 68px)` 压成 `calc(100% -68px)`，或者把
 *   `var(--a) var(--b)` 压成 `var(--a)var(--b)`，这条声明就是**非法 CSS**，
 *   浏览器会静默丢弃 —— 打包自检照样通过，页面却在悄悄错位。
 *
 *   这类 bug 靠正则扫源码很难查（属性名里的 `-`、url(data:...) 全是误报），
 *   但**浏览器不会说谎**：非法 CSS 等于没有这条规则。
 *
 * 做法：
 *   分别产出「压缩版」与「原样版」两份单文件，抽出各自的 <style> 区块，
 *   塞进同一个页面交给 Chrome 解析，然后逐条规则比对：
 *     · 规则总数
 *     · 声明总数
 *     · 每个选择器的属性名集合与计算后的属性取值
 *   三者必须完全一致。任何差异都说明压缩器动了真格把 CSS 弄坏了。
 *
 * 退出码：0 等价 / 1 不等价（并逐条打印差异）
 */
import { execFile } from 'node:child_process';
import { readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const exec = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DIST = path.join(ROOT, 'dist');
const TMP = path.join(DIST, '.csscheck');

const CHROME = process.env.CHROME_BIN
  || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const C = process.stdout.isTTY
  ? { d: '\x1b[2m', g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', b: '\x1b[1m', x: '\x1b[0m' }
  : { d: '', g: '', r: '', y: '', b: '', x: '' };

const die = (m) => { console.error(`${C.r}✗ ${m}${C.x}`); process.exit(1); };

await mkdir(TMP, { recursive: true });
const MIN_HTML = path.join(TMP, 'min.html');
const RAW_HTML = path.join(TMP, 'raw.html');
const PAGE = path.join(TMP, 'probe.html');

console.log(`\n${C.b}CSS 压缩等价性校验${C.x}`);
console.log(`${C.d}比的是浏览器实际解析出的规则，不是源码文本${C.x}\n`);

/* 1. 产出两份（压缩 / 原样）━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
try {
  await exec(process.execPath, ['tools/build.mjs', '--out', 'min.html', '--min', '--quiet',
    '--dist', path.relative(ROOT, TMP)], { cwd: ROOT });
  await exec(process.execPath, ['tools/build.mjs', '--out', 'raw.html', '--quiet',
    '--dist', path.relative(ROOT, TMP)], { cwd: ROOT });
} catch (e) {
  die(`构建失败：${e.message}\n${(e.stderr || '').slice(0, 500)}`);
}

const minHtml = await readFile(MIN_HTML, 'utf8');
const rawHtml = await readFile(RAW_HTML, 'utf8');

const styles = (html) => [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
const A = styles(minHtml);
const B = styles(rawHtml);
console.log(`  压缩版 <style> 区块 ${A.length} 个，合计 ${A.join('').length} 字符`);
console.log(`  原样版 <style> 区块 ${B.length} 个，合计 ${B.join('').length} 字符`);
if (A.length !== B.length) die('两份产物的样式区块数量不一致，打包流程本身有问题');
if (A.join('').length >= B.join('').length) die('压缩没有生效（压缩版不小于原样版）');
console.log(`  ${C.g}压缩率 ${((1 - A.join('').length / B.join('').length) * 100).toFixed(1)}%${C.x}\n`);

/* 2. 造一个只装样式的探针页━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const wrap = (blocks) => blocks.map((s) => `<style>${s}</style>`).join('\n');
const NA = A.length;

const PROBE = [
  'function collect(sh) {',
  '  var map = {}, rules = 0, decls = 0;',
  '  function walk(list, prefix) {',
  '    for (var i = 0; i < list.length; i++) {',
  '      var r = list[i];',
  '      if (r.style) {',
  '        rules++;',
  '        var key = prefix + (r.selectorText || "@" + (r.constructor && r.constructor.name || "at"));',
  '        var props = [];',
  '        for (var j = 0; j < r.style.length; j++) {',
  '          var p = r.style[j];',
  '          props.push(p + ":" + r.style.getPropertyValue(p));',
  '          decls++;',
  '        }',
  '        if (map[key]) map[key] = map[key].concat(props); else map[key] = props;',
  '      }',
  '      if (r.cssRules) walk(r.cssRules, r.conditionText ? "@media " + r.conditionText + " " : prefix);',
  '    }',
  '  }',
  '  try { walk(sh.cssRules, ""); } catch (e) { map.__error = [String(e)]; }',
  '  return { map: map, rules: rules, decls: decls };',
  '}',
].join('\n');

const RUNNER = [
  'var NA = ' + NA + ';',
  'var sheets = document.styleSheets;',
  'var blockA = [], blockB = [], i;',
  'for (i = 0; i < NA; i++) blockA.push(collect(sheets[i]));',
  'for (i = 0; i < NA; i++) blockB.push(collect(sheets[NA + i]));',
  'document.getElementById("__out").textContent = JSON.stringify({ a: blockA, b: blockB });',
].join('\n');

const finalPage = [
  '<!doctype html><meta charset="utf-8"><title>cssprobe</title>',
  wrap(A),
  wrap(B),
  '<pre id="__out">pending</pre>',
  '<script>',
  PROBE,
  'try {',
  RUNNER,
  '} catch (e) { document.getElementById("__out").textContent = JSON.stringify({ fatal: String(e) }); }',
  '</' + 'script>',
].join('\n');
await writeFile(PAGE, finalPage, 'utf8');

/* 3. 让 Chrome 解析并回吐结果━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
let dom = '';
try {
  const r = await exec(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    '--allow-file-access-from-files',
    '--virtual-time-budget=3000',
    '--dump-dom', pathToFileURL(PAGE).href,
  ], { maxBuffer: 128 * 1024 * 1024, timeout: 120_000 });
  dom = r.stdout;
} catch (e) {
  die(`启动 Chrome 失败：${e.message}\n${(e.stderr || '').slice(0, 400)}`);
}

const m = dom.match(/<pre id="__out">([\s\S]*?)<\/pre>/);
if (!m) die('探针页没有产出结果容器');
const raw = m[1].trim();
if (raw === 'pending') die('探针没有执行（可能是 CSS 里有语法炸弹，或 Chrome 未就绪）');
const unesc = raw.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const data = JSON.parse(unesc);
if (data.fatal) die(`探针抛异常：${data.fatal}`);

/* 4. 逐区块比对━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* 取值归一化：
 * 只抹掉「纯排版差异」——多余空白、逗号两侧空格（color-mix(in srgb,a,b)）。
 * 刻意**保留** 符号与数字之间的空格差异，`calc(100% -68px)` 与
 * `calc(100% - 68px)` 依然会被判为不等。
 */
const norm = (s) => s.replace(/\s+/g, ' ').replace(/\s*,\s*/g, ',').trim();

let totalDiff = 0;
let blocksOk = 0;
/* 选择器归一化：@ 规则里的条件（@supports / @media）压缩时会去掉冒号周围
 * 的空格，那是合法的等价写法，不能算差异；普通选择器里的空格是有意义的
 * （`.a :hover` 与 `.a:hover` 不是一回事），所以只对 @ 规则做这层归一。 */
function normKey(k) {
  return k.startsWith('@')
    ? k.replace(/\s*:\s*/g, ':').replace(/\s+/g, ' ').trim()
    : k.trim();
}
function pick(map, key) {
  if (map[key]) return map[key];
  const want = normKey(key);
  for (const k in map) if (normKey(k) === want) return map[k];
  return undefined;
}

for (let i = 0; i < A.length; i++) {
  const a = data.a[i], b = data.b[i];
  const label = `区块 #${i + 1}`;
  const diffs = [];
  if (a.map.__error) { console.log(` ${C.r}✗${C.x} ${label} 解析异常：${a.map.__error[0]}`); totalDiff++; continue; }
  if (a.rules !== b.rules) diffs.push(`规则数 ${a.rules} ≠ ${b.rules}`);
  if (a.decls !== b.decls) diffs.push(`声明数 ${a.decls} ≠ ${b.decls}`);

  const keys = new Set([...Object.keys(a.map), ...Object.keys(b.map)]
    .filter((k) => !k.startsWith('__')).sort());
  for (const k of keys) {
    const av = pick(a.map, k), bv = pick(b.map, k);
    if (!av) { diffs.push(`选择器缺失（仅原样版有）：${k}`); continue; }
    if (!bv) { diffs.push(`选择器缺失（仅压缩版有）：${k}`); continue; }
    const as = [...av].sort(), bs = [...bv].sort();
    if (as.length !== bs.length) {
      const missing = bs.filter((x) => !as.includes(x));
      const extra = as.filter((x) => !bs.includes(x));
      diffs.push(`${k}\n        被丢弃 ${missing.length} 条：${missing.slice(0, 6).join(' | ')}`
        + (extra.length ? `\n        多出 ${extra.length} 条：${extra.slice(0, 6).join(' | ')}` : ''));
    } else {
      for (let j = 0; j < as.length; j++) {
        if (norm(as[j]) !== norm(bs[j])) diffs.push(`${k}\n        取值不同：${as[j]}  ⟷  ${bs[j]}`);
      }
    }
  }

  if (diffs.length === 0) {
    blocksOk++;
    console.log(` ${C.g}✓${C.x} ${label.padEnd(10)} ${C.d}规则 ${a.rules} · 声明 ${a.decls} · 完全一致${C.x}`);
  } else {
    totalDiff += diffs.length;
    console.log(` ${C.r}✗${C.x} ${label.padEnd(10)} ${C.r}${diffs.length} 处差异${C.x}`);
    for (const d of diffs.slice(0, 14)) console.log(`     ${C.y}${d}${C.x}`);
    if (diffs.length > 14) console.log(`     ${C.d}…另有 ${diffs.length - 14} 处${C.x}`);
  }
}

await rm(TMP, { recursive: true, force: true }).catch(() => {});

console.log();
if (totalDiff) {
  console.log(`${C.r}✗ 压缩后 CSS 与原样版不等价（${totalDiff} 处）—— 有声明被浏览器丢弃了${C.x}\n`);
  process.exit(1);
}
console.log(`${C.g}✓ ${blocksOk} 个样式区块完全等价：压缩没有破坏任何一条 CSS${C.x}\n`);
