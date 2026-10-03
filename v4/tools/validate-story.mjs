/**
 * 剧情图校验器
 * 用法： node tools/validate-story.mjs
 *
 * 检查项：
 *   1. 所有 next / choices.to 指向的节点都存在
 *   2. 所有节点都能从起点到达（无孤儿节点）
 *   3. 所有结局都能被走到
 *   4. 每个节点都有文案，且非结局节点的出边不为空
 *   5. 选项数量在 2~4 之间，label / hint 完整
 *   6. 条件选项的 requires 是可调用的函数
 *   7. 场景 / 时段 / 天气 / 情绪 / 人物 的取值都在允许集合内
 *   8. 未定义 scene 的节点会沿用上一个节点的场景（做一次静态推导，报告是否可能为 undefined）
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const win = {};
const load = (rel) => new Function('window', fs.readFileSync(path.join(root, rel), 'utf8'))(win);
load('js/util.js');            // 颜色与工具（palette 依赖它）
load('js/palette.js');
load('js/character.js');       // 立绘预设：角色名不再写死，随剧本走
load('js/story.js');
load('js/quests.js');          // 委托表：主线分路的 flag 取值从这儿来

const { NODES, ENDINGS, CHAPTERS, ACHIEVEMENTS, START, resolveEnding, segments } = win.SP.story;
const PAL = win.SP.palette;
const CHAR = win.SP.character;

/* ── flag 样本 ──────────────────────────────────────────────────────
 * 漫游版的节点 next 可以是函数：通向哪条支线由世界里的 flag 决定。
 * 静态查不出函数会返回什么，所以先按「剧本里实际会出现哪些取值」
 * 造一个样本集，再用它把每条 next 都求值一遍。
 * 取值来源是 quests.js 的 setFlags —— 也就是玩家真能造出来的那些。
 * ------------------------------------------------------------------ */
const FLAG_DOMAIN = {};
for (const qid in win.SP.quests.QUESTS) {
  const f = win.SP.quests.QUESTS[qid].setFlags;
  if (!f) continue;
  for (const k in f) (FLAG_DOMAIN[k] || (FLAG_DOMAIN[k] = new Set())).add(f[k]);
}
// 世界推导旗标（不在任何 setFlags 里，但剧情会读）：也得进取值空间，
// 否则妈妈那通一月电话会被判成孤儿节点。改动这类旗标时记得同步这里。
FLAG_DOMAIN.mom_near = FLAG_DOMAIN.mom_near || new Set([0, 1]);
FLAG_DOMAIN.mom_has = FLAG_DOMAIN.mom_has || new Set([0, 1]);
const FLAG_KEYS = Object.keys(FLAG_DOMAIN);
const FLAG_SAMPLES = [{}];
for (const k of FLAG_KEYS) {
  const vals = [...FLAG_DOMAIN[k]];
  const next = [];
  for (const base of FLAG_SAMPLES) for (const v of vals) next.push(Object.assign({}, base, { [k]: v }));
  FLAG_SAMPLES.length = 0;
  FLAG_SAMPLES.push(...next);
}
if (FLAG_SAMPLES.length > 4000) FLAG_SAMPLES.length = 4000;   // 兜底，防止组合爆炸

/** 一个节点的所有出边（字符串 next、函数 next 的全部取值、选项） */
function targetsOf(n) {
  const out = [];
  if (typeof n.next === 'string') out.push(n.next);
  else if (typeof n.next === 'function') {
    for (const f of FLAG_SAMPLES) {
      let t;
      try { t = n.next(f); } catch { t = null; }
      if (typeof t === 'string' && !out.includes(t)) out.push(t);
    }
  }
  if (n.choices) for (const c of n.choices) if (c.to) out.push(c.to);
  return out;
}

const ALLOWED_SCENE = new Set(Object.keys(PAL.SCENES));
const ALLOWED_TIME = new Set(PAL.TIME_ORDER.concat(['dawn', 'morning', 'day', 'afternoon', 'dusk', 'night', 'deep']));
const ALLOWED_WEATHER = new Set(Object.keys(PAL.WEATHERS));
const ALLOWED_MOOD = new Set(['warm', 'calm', 'melancholy', 'night', 'tender', 'hope']);
const ALLOWED_PERSON = new Set(Object.keys(CHAR.PRESETS));
const ALLOWED_EXPR = new Set(['calm', 'smile', 'laugh', 'sad', 'worry', 'surprise', 'think']);

const errors = [];
const warns = [];
const E = (m) => errors.push(m);
const W = (m) => warns.push(m);

const ids = Object.keys(NODES);

/* 1. 出边目标存在 */
for (const id of ids) {
  const n = NODES[id];
  if (n.next) {
    const t = typeof n.next === 'function' ? null : n.next;
    if (t && !NODES[t]) E(`节点 ${id}.next → 不存在的节点 "${t}"`);
    if (typeof n.next === 'function') {
      const seenT = new Set();
      for (const f of FLAG_SAMPLES) {
        let to;
        try { to = n.next(f); } catch (err) { E(`节点 ${id}.next 在 flag ${JSON.stringify(f)} 下抛错：${err.message}`); break; }
        if (to == null) { E(`节点 ${id}.next 在 flag ${JSON.stringify(f)} 下没有返回目标`); break; }
        if (!NODES[to]) { E(`节点 ${id}.next → 不存在的节点 "${to}"`); break; }
        seenT.add(to);
      }
      if (!seenT.size) E(`节点 ${id}.next 是函数，但没有任何 flag 组合能给出目标`);
    }
  }
  if (n.choices) {
    n.choices.forEach((c, i) => {
      if (!c.to) E(`节点 ${id}.choices[${i}] 缺少 to`);
      else if (!NODES[c.to]) E(`节点 ${id}.choices[${i}] → 不存在的节点 "${c.to}"`);
      if (!c.label) E(`节点 ${id}.choices[${i}] 缺少 label`);
      if (c.requires && typeof c.requires !== 'function') E(`节点 ${id}.choices[${i}].requires 不是函数`);
    });
  }
}

/* 2/3. 可达性 */
const reachable = new Set();
const stack = [START];
while (stack.length) {
  const id = stack.pop();
  if (reachable.has(id)) continue;
  reachable.add(id);
  const n = NODES[id];
  if (!n) continue;
  for (const t of targetsOf(n)) stack.push(t);
}
for (const id of ids) if (!reachable.has(id)) E(`节点 ${id} 从起点无法到达（孤儿节点）`);

const endingKeys = new Set(Object.keys(ENDINGS));
const reachableEndings = new Set();
// v2 剧本：结局写在节点/选项的 set.ending 上，静态可查；
// v3 及漫游版：结局由 resolveEnding(flags) 动态算出，交给下面的第 9 项枚举校验。
if (typeof resolveEnding !== 'function') {
  for (const id of reachable) {
    const n = NODES[id];
    const f = n.set || {};
    if (f.ending && endingKeys.has(f.ending)) reachableEndings.add(f.ending);
    if (n.choices) n.choices.forEach((c) => { if (c.set && c.set.ending) reachableEndings.add(c.set.ending); });
  }
  for (const k of endingKeys) {
    if (!reachableEndings.has(k)) E(`结局 ${k} 没有被任何节点或选项指向`);
  }
  for (const k of reachableEndings) if (!endingKeys.has(k)) E(`有节点指向了未定义的结局 ${k}`);
}

/* 4/5. 文案与结构性检查 */
const terminalEndings = ids.filter((id) => NODES[id].ending);
if (terminalEndings.length !== 1) W(`终端 ending 节点数量为 ${terminalEndings.length}（建议恰好 1 个）`);

for (const id of ids) {
  const n = NODES[id];
  if (n.ending) continue;
  if (!n.text) E(`节点 ${id} 没有文案`);
  else if (typeof n.text !== 'string' && typeof n.text !== 'function') E(`节点 ${id}.text 类型不合法`);
  const hasNext = !!n.next;
  const hasChoices = !!(n.choices && n.choices.length);
  if (!hasNext && !hasChoices) E(`节点 ${id} 既没有 next 也没有 choices，故事会卡住`);
  if (hasNext && hasChoices) W(`节点 ${id} 同时有 next 与 choices，choices 会优先`);
  if (hasChoices) {
    if (n.choices.length < 2) E(`节点 ${id} 的选项少于 2 个`);
    if (n.choices.length > 4) W(`节点 ${id} 的选项多于 4 个（快捷键只覆盖 1-4）`);
    const labels = new Set();
    n.choices.forEach((c) => {
      if (labels.has(c.label)) E(`节点 ${id} 存在重复选项文案 "${c.label}"`);
      labels.add(c.label);
    });
  }
  if (typeof n.text === 'function') {
    // 条件文案：检查它能不能安全地吃一个空 flags
    try {
      const out = n.text({}, {});
      if (typeof out !== 'string' || !out.length) E(`节点 ${id} 的条件文案在空 flags 下没有返回字符串`);
    } catch (err) {
      E(`节点 ${id} 的条件文案在空 flags 下抛错：${err.message}`);
    }
  }

  /* 分段一致性：node.text 必须等于分段拼平的结果。
   * 前者喂给故事记录、导出与旧存档，后者喂给渲染；
   * 两者一旦漂移，就会出现「屏幕上读到的」和「记录里存下的」不是同一句话。 */
  try {
    const segs = segments(n, {});
    if (!segs.length) E(`节点 ${id} 没有任何文本分段`);
    const KINDS = new Set(['n', 'd', 'i']);
    let flat = '';
    segs.forEach((s, i) => {
      if (!KINDS.has(s.k)) E(`节点 ${id}.seg[${i}] 的 kind "${s.k}" 非法（只允许 n/d/i）`);
      if (typeof s.s !== 'string') E(`节点 ${id}.seg[${i}].s 不是字符串`);
      else if (!s.s.trim()) W(`节点 ${id}.seg[${i}] 是空白分段`);
      flat += s.s;
    });
    const plain = typeof n.text === 'function' ? n.text({}) : n.text;
    if (flat !== plain) E(`节点 ${id} 的 text 与分段拼平结果不一致（记录里存的和屏幕上读到的会不一样）`);
  } catch (err) {
    E(`节点 ${id} 取分段时抛错：${err.message}`);
  }
}

/* 7. 取值合法性 */
let sceneCursor = null;
const order = [];
const seenForOrder = new Set();
const q = [START];
while (q.length) {
  const id = q.shift();
  if (seenForOrder.has(id)) continue;
  seenForOrder.add(id);
  order.push(id);
  const n = NODES[id];
  if (!n) continue;
  for (const t of targetsOf(n)) q.push(t);
}
for (const id of order) {
  const n = NODES[id];
  if (n.scene) {
    if (!ALLOWED_SCENE.has(n.scene)) E(`节点 ${id}.scene = "${n.scene}" 不是已定义场景`);
    sceneCursor = n.scene;
  } else if (id !== START && !sceneCursor) {
    E(`节点 ${id} 没有 scene，且此前没有可继承的场景`);
  }
  if (n.time && !ALLOWED_TIME.has(n.time)) E(`节点 ${id}.time = "${n.time}" 不是合法时段`);
  if (n.weather && !ALLOWED_WEATHER.has(n.weather)) E(`节点 ${id}.weather = "${n.weather}" 不是合法天气`);
  if (n.mood && !ALLOWED_MOOD.has(n.mood)) E(`节点 ${id}.mood = "${n.mood}" 不是合法情绪`);
  if (n.person && !ALLOWED_PERSON.has(n.person)) E(`节点 ${id}.person = "${n.person}" 没有对应立绘`);
  if (n.expr && !ALLOWED_EXPR.has(n.expr)) E(`节点 ${id}.expr = "${n.expr}" 不是合法表情`);
  if (n.bond) {
    for (const k in n.bond) if (!['man', 'yan', 'family', 'self'].includes(k)) E(`节点 ${id}.bond 键 "${k}" 不合法`);
  }
  if (n.choices) {
    n.choices.forEach((c, i) => {
      if (c.bond) for (const k in c.bond) if (!['man', 'yan', 'family', 'self'].includes(k)) E(`节点 ${id}.choices[${i}].bond 键 "${k}" 不合法`);
    });
  }
  if (n.p != null && (typeof n.p !== 'number' || n.p < 0 || n.p > 100)) E(`节点 ${id}.p 进度值不合法`);
}

/* 8. 章节一致性 */
for (const id of order) {
  const n = NODES[id];
  if (n.chapter && !CHAPTERS.some((c) => c.name === n.chapter)) E(`节点 ${id}.chapter = "${n.chapter}" 不在章节表中`);
}

/* 结局可达性：按剧本自身的判定规则枚举，确保每个结局都真的拿得到 */
if (NODES.finalChoice && NODES.finalChoice.choices) {
  // v2 剧本：校验隐藏选项
  const hiddenChoice = NODES.finalChoice.choices.find((c) => c.secret);
  if (!hiddenChoice) E('finalChoice 里找不到隐藏选项');
  else {
    const sample = { open: 1, creative: 1, rest: 1 };
    if (!hiddenChoice.requires(sample)) E('隐藏选项的解锁条件无法被满足（用 {open,creative,rest} 测试失败）');
  }
} else if (typeof resolveEnding === 'function') {
  // v3 / 漫游版剧本：六个结局由 flag 组合决定，逐一试出可达性
  const samples = [
    { release: 'public', focus: 'place' },
    { release: 'public', focus: 'people' },
    { release: 'local', venue: 'official' },
    { release: 'local', venue: 'room' },
    { release: 'next', agreement: 1 },
    { release: 'next' },
  ];
  const reached = new Set(samples.map((f) => resolveEnding(f)));
  for (const r of reached) reachableEndings.add(r);
  for (const id of Object.keys(ENDINGS)) {
    if (!reached.has(id)) E(`结局 ${id}（${ENDINGS[id].title}）没有任何 flag 组合能到达`);
  }
  const unknown = reached.difference ? [...reached].filter((r) => !ENDINGS[r]) : [];
  for (const id of unknown) E(`resolveEnding 会返回未定义的结局 ${id}`);
} else {
  E('剧本既没有 finalChoice 也没有 resolveEnding，无法校验结局可达性');
}

/* 成就数量 */
if (!Array.isArray(ACHIEVEMENTS) || ACHIEVEMENTS.length === 0) E('成就表为空');

/* 统计 */
const choiceNodes = order.filter((id) => NODES[id].choices).length;
const totalChoices = order.reduce((a, id) => a + (NODES[id].choices ? NODES[id].choices.length : 0), 0);
const words = order.reduce((a, id) => {
  const t = NODES[id].text;
  return a + (typeof t === 'string' ? t.length : 120);
}, 0);

console.log('晴天以后 · 剧情图校验');
console.log('─'.repeat(46));
console.log(`节点总数        ${order.length}`);
console.log(`含选项的节点    ${choiceNodes}`);
console.log(`选项总数        ${totalChoices}`);
console.log(`结局数          ${endingKeys.size}（可达 ${reachableEndings.size}）`);
console.log(`成就数          ${ACHIEVEMENTS.length}`);
console.log(`章节数          ${CHAPTERS.length}`);
console.log(`估算正文字数    ${words} 字（含条件文案按 120 字估）`);
console.log('─'.repeat(46));
for (const w of warns) console.log('提示  ' + w);
if (errors.length) {
  for (const e of errors) console.log('错误  ' + e);
  console.log('─'.repeat(46));
  console.log(`校验未通过：${errors.length} 个错误。`);
  process.exit(1);
}
console.log('校验通过：没有发现断链、孤儿节点或非法取值。');
