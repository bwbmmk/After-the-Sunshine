#!/usr/bin/env node
/**
 * 晴天以后 v2 · 跨模块 API 一致性检查
 * ------------------------------------------------------------------
 * 背景：这个项目用 `SP.xxx` 命名空间 + 立即执行函数串起 11 个模块，
 * 没有打包器的静态导入检查。所以「调用了一个没被导出的方法」这种错
 * 编译器抓不到 —— 之前就真的踩了一次：engine.js 里调用
 * `SP.engine.markRead()`，但 markRead 只挂在 SP.storage 上，
 * 结果每次打字机打完字都抛一次异常，而「快进已读」功能静默失效。
 *
 * 这个脚本就专门抓这一类问题：
 *   1. 收集每个模块 `SP.ns = { ... }` 实际导出的名字
 *   2. 扫描全项目 `SP.ns.member` 的调用点
 *   3. 报告「调用了但没导出」的成员（会抛 TypeError 的）
 *   4. 顺带报告导出但从未被使用的成员（提示死代码）
 *
 * 用法：node tools/check-api.mjs
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JSDIR = path.join(ROOT, 'js');

const C = process.stdout.isTTY
  ? { d: '\x1b[2m', g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', b: '\x1b[1m', x: '\x1b[0m' }
  : { d: '', g: '', r: '', y: '', b: '', x: '' };

const files = (await readdir(JSDIR)).filter((f) => f.endsWith('.js')).sort();
const sources = new Map();
for (const f of files) sources.set(f, await readFile(path.join(JSDIR, f), 'utf8'));

/* ── 1. 解析导出 ────────────────────────────────────────────────────
 * 支持四种写法：
 *   1. SP.ns = Object.assign(Ns, { ... })
 *   2. SP.ns = { ... }
 *   3. Object.defineProperty(SP.ns, 'member', { get … })   ← getter 导出专用
 *   4. SP.ns.member = fn / SP.ns.member = () => …          ← 后置挂载
 * 注意第 3 种的必要性：Object.assign 会把 getter **求值**成静态快照，
 * 所以模块里的状态字段（如 engine.lastTime / lastWeather）必须在 assign
 * 之后用 defineProperty 单独挂上去，静态检查也得认识它，否则会误报。
 * ------------------------------------------------------------------ */
const exportsByNs = new Map();   // ns -> Set(member)
const nsSource = new Map();      // ns -> 定义它的文件

/** 从 `{ a, b, c }` 取出顶层标识符名（跳过 get/set 与嵌套大括号） */
function namesInObjectLiteral(body) {
  const names = new Set();
  let depth = 0;
  let buf = '';
  const push = () => {
    let s = buf.trim();
    buf = '';
    if (!s) return;
    s = s.replace(/^\.\.\./, '').trim();
    if (/^(get|set)\s/.test(s)) s = s.replace(/^(get|set)\s+/, '');
    const m = s.match(/^([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:[:=]|$)/);
    if (m) names.add(m[1]);
  };
  for (const ch of body) {
    if (ch === '{' || ch === '(' || ch === '[') { depth++; buf += ch; continue; }
    if (ch === '}' || ch === ')' || ch === ']') { depth--; buf += ch; continue; }
    if (ch === ',' && depth === 0) { push(); continue; }
    buf += ch;
  }
  push();
  return names;
}

for (const [file, src] of sources) {
  // SP.ns = Object.assign(Target, { ... });
  const reAssign = /SP\.([A-Za-z_$][\w$]*)\s*=\s*Object\.assign\(\s*[A-Za-z_$][\w$]*\s*,\s*\{/g;
  for (const m of src.matchAll(reAssign)) {
    const ns = m[1];
    const start = m.index + m[0].length;
    const body = sliceBalanced(src, start - 1);
    if (body === null) continue;
    if (!exportsByNs.has(ns)) { exportsByNs.set(ns, new Set()); nsSource.set(ns, file); }
    for (const n of namesInObjectLiteral(body)) exportsByNs.get(ns).add(n);
  }
  // SP.ns = { ... };  （例如 storage）
  const reDirect = /SP\.([A-Za-z_$][\w$]*)\s*=\s*\{/g;
  for (const m of src.matchAll(reDirect)) {
    const ns = m[1];
    const start = m.index + m[0].length;
    const body = sliceBalanced(src, start - 1);
    if (body === null) continue;
    if (!exportsByNs.has(ns)) { exportsByNs.set(ns, new Set()); nsSource.set(ns, file); }
    for (const n of namesInObjectLiteral(body)) exportsByNs.get(ns).add(n);
  }
  // SP.ns = Object.assign(Ns, { 多行 }) 之外的：SP.util 之类
  // 3. Object.defineProperty(SP.ns, 'member', { … })        getter / 特挂字段
  //    限制：只往「本文件已经声明过的命名空间」里补成员。
  //    否则像 main.js 里的 `SP.audio.tts = …`（只是读写别人字段）会把 audio
  //    凭空注册成只含一项的命名空间，进而把真正的音频 API 全判成缺失。
  const reDefine = /Object\.defineProperty\(\s*SP\.([A-Za-z_$][\w$]*)\s*,\s*['"]([A-Za-z_$][\w$]*)['"]/g;
  for (const m of src.matchAll(reDefine)) {
    const ns = m[1];
    if (!exportsByNs.has(ns)) continue;               // 不是本文件定义的，忽略
    exportsByNs.get(ns).add(m[2]);
  }
  // 4. SP.ns.member = …                                    后置挂载
  const reMember = /^[\t ]*SP\.([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\s*=/gm;
  for (const m of src.matchAll(reMember)) {
    const ns = m[1];
    if (!exportsByNs.has(ns)) continue;
    exportsByNs.get(ns).add(m[2]);
  }
}

/** 从 idx 处的 `{` 开始，返回配对大括号内的内容 */
function sliceBalanced(src, idx) {
  if (src[idx] !== '{') return null;
  let depth = 0;
  for (let i = idx; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(idx + 1, i); }
  }
  return null;
}

/* ── 2. 收集调用点 ───────────────────────────────────────────────── */
const BUILTIN = new Set(['window', 'document', 'console', 'Math', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Date', 'Promise', 'Set', 'Map', 'Infinity', 'NaN', 'undefined']);

function scan(dir, files, out) {
  for (const file of files) {
    const src = sources.get(file) ?? '';
    void src;
  }
}

const jsFiles = [...sources.keys()];
const calls = [];   // {ns, member, file, line, raw}  —— 用于「缺失」判定
const allUse = new Set();  // 所有出现过的 ns.member（含 tools/），用于「未使用」判定

const collect = (file, src, pushCalls) => {
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '');
    for (const m of code.matchAll(/SP\.([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)/g)) {
      allUse.add(`${m[1]}.${m[2]}`);
      if (pushCalls) calls.push({ ns: m[1], member: m[2], file, line: i + 1, raw: line.trim() });
    }
  });
};

for (const f of jsFiles) collect(f, sources.get(f), true);

// tools/ 下的工装也调用同一套 API，计入「已使用」以免误报死代码
let toolFiles = [];
try {
  toolFiles = (await readdir(path.join(ROOT, 'tools'))).filter((f) => /\.(mjs|js|html)$/.test(f));
  for (const f of toolFiles) {
    collect('tools/' + f, await readFile(path.join(ROOT, 'tools', f), 'utf8'), false);
  }
} catch { /* tools 不存在就算了 */ }

/* ── 3. 比对 ─────────────────────────────────────────────────────── */
// 直接挂在对象上的状态字段（不在 Object.assign 的导出表里）
const ENGINE_STATE = new Set([
  'state', 'auto', 'skip', 'visible', 'typing', 'fullText', 'busy', 'ended',
  'currentScene', 'currentChar', 'currentExpr', 'autoTimer', 'logOpen', 'chapter',
]);
const STAGE_STATE = new Set([
  'el', 'world', 'layers', 'canvas', 'ctx', 'dpr', 'w', 'hgt', 'reduced', 'busy',
  'scene', 'time', 'weather', 'particles', 'weatherMix', 'targetMix', 'targetSnow',
  'snowMix', 'parallax', 'raf', 'light', 'clouds', 'stars', 'shoot', 'celestial', 'transition',
]);
const STATE_PROPS = { engine: ENGINE_STATE, stage: STAGE_STATE };

const missing = [];
const seen = new Set();
for (const c of calls) {
  if (c.ns === 'story' && c.member === 'NODES') continue;       // 数据结构，非方法
  if (BUILTIN.has(c.ns)) continue;
  const key = `${c.ns}.${c.member}`;
  if (seen.has(key + c.file + c.line)) continue;
  seen.add(key + c.file + c.line);

  const exp = exportsByNs.get(c.ns);
  if (!exp) continue;                                          // 该命名空间不由本仓库定义
  const stateProps = STATE_PROPS[c.ns];
  if (stateProps && stateProps.has(c.member)) continue;
  if (!exp.has(c.member)) missing.push(c);
}

/* ── 4. 未被使用的导出 ───────────────────────────────────────────── */
const unused = [];
for (const [ns, set] of exportsByNs) {
  for (const n of set) {
    if (!allUse.has(`${ns}.${n}`)) unused.push(`${ns}.${n}`);
  }
}

/* ── 报告 ────────────────────────────────────────────────────────── */
console.log(`\n${C.b}晴天以后 · 留一盏灯（漫游版） 跨模块 API 一致性${C.x}`);
console.log('─'.repeat(72));
console.log(` 扫描 ${files.length} 个模块 · ${calls.length} 处命名空间调用 · ${exportsByNs.size} 个命名空间`);
console.log('─'.repeat(72));

for (const [ns, set] of [...exportsByNs].sort()) {
  console.log(` ${C.d}SP.${ns.padEnd(10)}${C.x} ${String(set.size).padStart(3)} 个导出  ${C.d}${nsSource.get(ns)}${C.x}`);
}

if (missing.length) {
  console.log(`\n${C.r}✗ 调用了未导出的成员（运行时会抛 TypeError）：${C.x}`);
  for (const m of missing) {
    console.log(`   · SP.${m.ns}.${m.member}   ${C.d}${m.file}:${m.line}${C.x}`);
    console.log(`     ${C.d}${m.raw.slice(0, 110)}${C.x}`);
  }
} else {
  console.log(`\n${C.g}✓ 所有 SP.ns.member 调用都能对上导出${C.x}`);
}

if (unused.length) {
  console.log(`\n${C.y}! 未在 SP.ns.member 形式下被引用的导出（多数是本模块内部调用、`);
  console.log(`  或调用方用了别名/destructuring，属于正常；仅用于发现真正的死代码）：${C.x}`);
  console.log(`   ${C.d}${unused.sort().join('  ')}${C.x}`);
}

console.log();
process.exit(missing.length ? 1 : 0);
