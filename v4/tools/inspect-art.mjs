#!/usr/bin/env node
/**
 * 晴天以后 v2 · 美术体检
 * ------------------------------------------------------------------
 * 逐个场景构建 SVG，统计每层的元素数量与体积，检查：
 *   1. 每层是否包在 <svg> 根里（否则用 div.innerHTML 注入不会渲染！）
 *   2. 是否有空层、超小层
 *   3. 全场景元素总量、最大/最小场景
 *
 * 用法：node tools/inspect-art.mjs [sceneKey]
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const win = { matchMedia: () => ({ matches: false }), addEventListener() {}, document: { createElement: () => ({ style: {} }) } };
for (const f of ['js/util.js', 'js/palette.js', 'js/art.js']) {
  new Function('window', await readFile(path.join(ROOT, f), 'utf8'))(win);
}
const SP = win.SP;

const count = (s) => (s.match(/<(path|rect|circle|ellipse|polygon|polyline|line|text|g|use|image)\b/g) || []).length;
const LAYERS = ['far', 'mid', 'near', 'fore'];

const only = process.argv[2];
const scenes = only ? [only] : Object.keys(SP.palette.SCENES);

const C = process.stdout.isTTY
  ? { d: '\x1b[2m', g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', b: '\x1b[1m', x: '\x1b[0m' }
  : { d: '', g: '', r: '', y: '', b: '', x: '' };

console.log(`\n${C.b}晴天以后 · 美术体检${C.x}  ${C.d}（${scenes.length} 个场景）${C.x}`);
console.log('─'.repeat(78));
console.log(` ${'场景'.padEnd(12)} ${'far'.padStart(6)} ${'mid'.padStart(6)} ${'near'.padStart(6)} ${'fore'.padStart(6)}  ${'字符'.padStart(8)}  结构`);
console.log('─'.repeat(78));

const problems = [];
let total = 0;
let maxScene = { k: '', n: 0 };
let minScene = { k: '', n: Infinity };

for (const key of scenes) {
  let parts;
  try { parts = SP.art.build(key); }
  catch (e) { problems.push(`${key} 构建失败：${e.message}`); console.log(` ${key.padEnd(12)} ${C.r}构建异常：${e.message}${C.x}`); continue; }

  const nums = LAYERS.map((k) => count(parts[k] || ''));
  const n = nums.reduce((a, b) => a + b, 0);
  const chars = LAYERS.reduce((a, k) => a + (parts[k] || '').length, 0);
  total += n;
  if (n > maxScene.n) maxScene = { k: key, n };
  if (n < minScene.n) minScene = { k: key, n };

  const flags = [];
  for (let i = 0; i < LAYERS.length; i++) {
    const raw = parts[LAYERS[i]] || '';
    if (!raw.trim()) { flags.push(`${LAYERS[i]} 空层`); problems.push(`${key}: ${LAYERS[i]} 是空的`); }
    else if (!/^\s*<svg[\s>]/.test(raw)) { flags.push(`${LAYERS[i]} 缺 <svg> 根`); problems.push(`${key}: ${LAYERS[i]} 没有 <svg> 根，div.innerHTML 注入不会渲染`); }
  }
  if (nums.every((v) => v === 0)) { flags.push('无图形元素'); problems.push(`${key}: 四层都没有图形元素`); }

  const struct = flags.length ? `${C.r}${flags.join(' / ')}${C.x}` : `${C.g}✓ svg 根完整${C.x}`;
  console.log(` ${key.padEnd(12)} ${nums.map((v) => String(v).padStart(6)).join(' ')}  ${String(chars).padStart(8)}  ${struct}`);
}

console.log('─'.repeat(78));
console.log(` 元素合计 ${C.b}${total}${C.x}   最丰富 ${maxScene.k}(${maxScene.n})   最简 ${minScene.k}(${minScene.n})`);
console.log(` 平均每场景 ${Math.round(total / Math.max(scenes.length, 1))} 个图形元素`);
if (problems.length) {
  console.log(`\n${C.r}✗ 发现 ${problems.length} 个问题：${C.x}`);
  for (const p of problems) console.log(`   · ${p}`);
  console.log();
  process.exit(1);
}
console.log(`${C.g}✓ 全部场景结构完整，可直接注入渲染${C.x}\n`);
