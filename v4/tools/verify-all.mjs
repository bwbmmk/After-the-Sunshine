#!/usr/bin/env node
/**
 * 晴天以后 v2 · 一键全量校验
 * ------------------------------------------------------------------
 * 把散落的各个检查串成一条链，任何一步失败就停下并返回非 0。
 * 相当于这个项目的 CI。
 *
 *   1. 语法      — 所有 js 模块过一遍 node --check
 *   2. API       — 跨模块 SP.ns.member 调用与导出是否对得上
 *   3. 剧情      — 剧情图连通性、断链、孤儿、非法取值、结局可达
 *   4. 美术      — 每个场景四层是否都是合法 <svg>、元素量是否合理
 *   5. 打包      — 产出单文件并做自检（无外链、无外部请求）
 *   6. CSS 压缩  — 让 Chrome 解析压缩版/原样版，逐条比对（抓静默失效的 CSS）
 *   7. 运行时    — headless 真浏览器加载产物，断言 31 项真实状态
 *   8. 玩法      — 漫游 / 人物 / 地图 / 委托的端到端探针（26 项）
 *
 * 截图与截图体检不在默认链路里（较慢），需要时加 --shots。
 *
 * 用法：node tools/verify-all.mjs [--shots] [--quiet]
 */
import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisifyCb(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NODE = process.execPath;

const argv = process.argv.slice(2);
const QUIET = argv.includes('--quiet');
const WITH_SHOTS = argv.includes('--shots');

const C = process.stdout.isTTY
  ? { d: '\x1b[2m', g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', b: '\x1b[1m', x: '\x1b[0m' }
  : { d: '', g: '', r: '', y: '', b: '', x: '' };

const t0 = Date.now();
const results = [];

async function run(label, cmd, args, opts = {}) {
  const started = Date.now();
  try {
    const r = await exec(cmd, args, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024, timeout: 300_000, ...opts });
    const ms = Date.now() - started;
    results.push({ label, ok: true, ms, out: r.stdout });
    console.log(` ${C.g}✓${C.x} ${label.padEnd(34)} ${C.d}${String(ms).padStart(6)} ms${C.x}`);
    if (!QUIET && r.stdout) printSummary(r.stdout);
    return r.stdout;
  } catch (e) {
    const ms = Date.now() - started;
    const out = (e.stdout || '') + (e.stderr || '');
    results.push({ label, ok: false, ms, out });
    console.log(` ${C.r}✗ ${label.padEnd(34)} ${String(ms).padStart(6)} ms${C.x}`);
    console.log(indent(out.split('\n').slice(-26).join('\n')));
    return null;
  }
}

/** 从各工具输出里挑出最有信息量的几行，避免刷屏 */
function printSummary(out) {
  const lines = out.split('\n').filter((l) => l.trim());
  const keep = lines.filter((l) => /校验通过|全部通过|自检通过|✓|个场景|节点总数|结局数|元素合计|模块|产物大小|指纹/.test(l));
  const pick = (keep.length ? keep : lines).slice(0, 4);
  for (const l of pick) console.log(indent(l));
}
const indent = (s) => s.split('\n').map((l) => `     ${C.d}${l}${C.x}`).join('\n');

function promisifyCb(fn) {
  return (...args) => new Promise((res, rej) => fn(...args, (err, stdout, stderr) => err ? rej(Object.assign(err, { stdout, stderr })) : res({ stdout, stderr })));
}

console.log(`\n${C.b}晴天以后 · 留一盏灯（漫游版）全量校验${C.x}`);
console.log('═'.repeat(62));

/* 1. 语法 */
const jsFiles = (await readdir(path.join(ROOT, 'js'))).filter((f) => f.endsWith('.js')).sort();
let syntaxOk = true;
for (const f of jsFiles) {
  try { await exec(NODE, ['--check', path.join('js', f)], { cwd: ROOT }); }
  catch (e) { syntaxOk = false; console.log(` ${C.r}✗ js/${f}${C.x}\n${indent((e.stderr || '').slice(0, 600))}`); }
}
results.push({ label: `JS 语法（${jsFiles.length} 个模块）`, ok: syntaxOk, ms: 0 });
console.log(` ${syntaxOk ? `${C.g}✓${C.x}` : `${C.r}✗${C.x}`} ${`JS 语法（${jsFiles.length} 个模块）`.padEnd(34)}`);
if (!syntaxOk) { console.log(`\n${C.r}语法未通过，后续步骤已跳过${C.x}\n`); process.exit(1); }

/* 2. API 一致性 */
await run('跨模块 API 一致性', NODE, ['tools/check-api.mjs']);
/* 3. 剧情图 */
await run('剧情图校验', NODE, ['tools/validate-story.mjs']);
/* 4. 美术结构 */
await run('美术结构体检', NODE, ['tools/inspect-art.mjs']);
/* 5. 打包 */
await run('单文件打包', NODE, ['tools/build.mjs', '--min', '--out', '留一盏灯·漫游版.html']);
/* 6. CSS 压缩等价性（浏览器实算） */
await run('CSS 压缩等价性', NODE, ['tools/check-css.mjs']);
/* 7. 运行时冒烟 */
await run('运行时冒烟测试', NODE, ['tools/probe.mjs']);
/* 8. 漫游玩法端到端 */
await run('漫游玩法探针', NODE, ['tools/probe-roam.mjs']);
/* 9. jsdom 回归（存档不可变 / 漫游恢复 / 委托节奏 / 五闸门全通） */
await run('交互回归（jsdom）', NODE, ['tools/test-regressions.cjs']);

/* 可选：截图 + 截图体检 */
if (WITH_SHOTS) {
  await run('预览截图', NODE, ['tools/shots.mjs']);
  await run('截图体检', NODE, ['tools/check-shots.mjs']);
}

/* ── 汇总 ────────────────────────────────────────────────────────── */
const bad = results.filter((r) => !r.ok);
console.log('═'.repeat(62));
if (bad.length) {
  console.log(`${C.r}✗ ${bad.length}/${results.length} 步失败：${C.x}`);
  for (const b of bad) console.log(`   · ${b.label}`);
  console.log();
  process.exit(1);
}
console.log(`${C.g}✓ 全部 ${results.length} 步通过${C.x}   ${C.d}总耗时 ${((Date.now() - t0) / 1000).toFixed(1)} s${C.x}`);
console.log(`${C.d}  产物：dist/留一盏灯·漫游版.html（可直接双击打开，无外部依赖）${C.x}\n`);
