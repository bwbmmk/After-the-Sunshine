#!/usr/bin/env node
/**
 * 晴天以后 v2 · 预览截图
 * ------------------------------------------------------------------
 * 注意：这里截的是 **打包后的单文件产物**，不是源文件 ——
 * 所以这些图本身就是「交付物确实能跑」的证据。
 *
 * 做法：把产物复制一份，尾部追加一段「驱动脚本」把游戏摆到指定状态，
 * 然后 headless Chrome 截图。
 *
 * 用法：node tools/shots.mjs [名字…]      # 不传则全部
 * 产物：dist/shots/<名字>.png + dist/shots/index.html（联排看板）
 */
import { readFile, writeFile, mkdir, rm, copyFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const exec = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(DIST, 'shots');
const SRC = path.join(DIST, 'index.html');

const CHROME = process.env.CHROME_BIN
  || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const W = 1600, H = 900;

const C = process.stdout.isTTY
  ? { d: '\x1b[2m', g: '\x1b[32m', r: '\x1b[31m', b: '\x1b[1m', x: '\x1b[0m' }
  : { d: '', g: '', r: '', b: '', x: '' };

/* ── 截图清单 ───────────────────────────────────────────────────────
 * node  → 摆到该剧情节点（scene/time/weather 由驱动脚本覆盖）
 * panel → 打开某个面板
 * cover → 封面
 * ------------------------------------------------------------------ */
const SHOTS = [
  { name: '01_封面', kind: 'cover', desc: '开始界面：进度统计、四个入口' },
  { name: '02_校门口·午后', kind: 'node', node: 'arrival', desc: '开学第一天，行李箱卡在砖缝里' },
  { name: '03_寝室·第一夜', kind: 'node', node: 'lights1', desc: '程野定好六点的闹钟，台灯落在空白笔记本上' },
  { name: '04_食堂·清晨', kind: 'node', node: 'breakfast2', desc: '陈姨拖出凳子，窗边还剩一张空椅子' },
  { name: '05_图书馆·器材处', kind: 'node', node: 'loan1', desc: '阿言给转接线贴编号' },
  { name: '06_公共课教室', kind: 'node', node: 'class0', desc: '周老师翻过一页讲义' },
  { name: '07_雨夜·图书馆外', kind: 'node', node: 'rain1', desc: '雨打在伞上，要靠得很近才听得清' },
  { name: '08_湖边·补拍雪景', kind: 'node', node: 'snow0', desc: '雪落在灯罩上，开关却迟迟没有动静' },
  { name: '09_放映厅·开场前', kind: 'node', node: 'setup1', desc: '门口写着：放完以后，有话可以说，也可以直接走' },
  { name: '10_教学楼·大雪', kind: 'node', node: 'class0', weather: 'snow', desc: '强制雪天，验证天气系统' },
  { name: '11_分支图', kind: 'panel', panel: 'flow', desc: 'BFS 自动布局的全剧情图' },
  { name: '12_结局图鉴', kind: 'panel', panel: 'gallery', desc: '连环进度 + 已解锁卡片' },
  { name: '13_设置', kind: 'panel', panel: 'settings', desc: '文字 / 音频 / 视觉 / 数据 四组' },
  { name: '14_故事记录', kind: 'panel', panel: 'log', desc: '带筛选的历史文本' },
  // ── 漫游版新增 ──
  { name: '15_漫游·报到日东门', kind: 'roam', window: 'w1', loc: 'campus', desc: '自由行动：小满在东门等手推车，HUD 显示主线目标' },
  { name: '16_漫游·与程野对话', kind: 'roam', window: 'w1', loc: 'dorm', talk: 'cheng', lines: 2, desc: '点人物标记开出的漫游对话框（含立绘与选项）' },
  { name: '17_校园地图', kind: 'panel', panel: 'map', window: 'w2', loc: 'club', desc: '14 处地点的手绘校园导览，含当前位置与委托标记' },
  { name: '18_任务手账', kind: 'panel', panel: 'journal', window: 'w2', loc: 'club', desc: '委托进度、这个月没做的、六位人物的熟络度' },
  { name: '19_口袋', kind: 'panel', panel: 'notebook', window: 'w2', loc: 'club', desc: '口袋分三栏：手上的事 / 留念 / 角落里的小东西' },
];

/* ── 驱动脚本（注入到产物副本尾部） ───────────────────────────────── */
function driver(s) {
  const spec = JSON.stringify(s);
  return `<script id="__shot">
(function () {
  var s = ${spec};
  var errors = [];
  window.__SHOT_ERRORS = errors;
  window.addEventListener('error', function (e) { errors.push(String(e.message) + ' @ ' + (e.lineno||0)); });
  window.addEventListener('unhandledrejection', function (e) { errors.push('promise: ' + e.reason); });

  function ready(state, stats) {
    var d = document.createElement('div');
    d.id = '__shotstate';
    d.style.display = 'none';
    d.textContent = state + '|' + JSON.stringify(errors) + '|' + JSON.stringify(stats || {});
    document.body.appendChild(d);
  }

  function panelStats() {
    // 面板类截图靠像素判断不可靠（浅底 + 细字，降采样后就糊成一片），
    // 所以这里直接把 DOM 里的内容量统计出来，作为「面板确实有内容」的证据。
    var p = document.getElementById('panel');
    var ov = document.getElementById('overlay');
    return {
      mode: ov ? (ov.dataset.mode || '') : '',
      hidden: ov ? ov.classList.contains('hidden') : true,
      els: p ? p.querySelectorAll('*').length : 0,
      text: p ? (p.textContent || '').replace(/\\s+/g, ' ').trim().length : 0,
      buttons: p ? p.querySelectorAll('button').length : 0,
      inputs: p ? p.querySelectorAll('input,select').length : 0,
      svgs: p ? p.querySelectorAll('svg').length : 0,
      svgShapes: p ? p.querySelectorAll('svg *').length : 0,
      imgs: p ? p.querySelectorAll('img').length : 0,
      headings: p ? p.querySelectorAll('h1,h2,.panel-title').length : 0,
    };
  }

  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () {
      var SP = window.SP;
      try {
        // 固定动效与字号，保证每次截图一致
        document.documentElement.dataset.motion = 'off';
        SP.stage.reduced = true;

        if (s.kind === 'cover') {
          SP.ui.showCover();
        } else if (s.kind === 'node') {
          SP.engine.init(null);
          var node = SP.story.NODES[s.node];
          var flags = {};
          if (s.flags) s.flags.split(',').forEach(function (f) { flags[f] = 1; });
          flags.club = 'photo';
          SP.engine.state.flags = flags;
          SP.engine.state.bonds = { man: 4, yan: 3, family: 2, self: 5 };
          if (s.time) node.time = s.time;
          if (s.weather) node.weather = s.weather;
          if (s.chapter) { node.chapter = s.chapter; SP.engine.chapter = s.chapter; }
          SP.stage.reduced = false;                 // 让天气粒子能画出来
          SP.engine.show(s.node, { instant: true, noCard: true });
          SP.engine.finishText();
          // headless 帧数极少，这里手动把天气推到满并确定性地画若干帧
          if (SP.stage.targetMix || SP.stage.targetSnow) {
            SP.stage.weatherMix = SP.stage.targetMix;
            for (var i = 0; i < 26; i++) SP.stage.renderFrame(0.016);
          }
          SP.stage.reduced = true;
        } else if (s.kind === 'roam') {
          // 自由行动：进入指定漫游窗口，可指定旅行到某处、并打开与某人的对话
          SP.engine.init(null);
          SP.engine.state.flags = { first: 'film', focus: 'place' };
          SP.engine.state.bonds = { man: 4, yan: 3, family: 2, self: 4 };
          var win = SP.game.WINDOWS[s.window];
          SP.engine.state.id = win.gate;
          SP.roam.enter(win.next);
          if (s.loc) SP.roam.travel(s.loc);
          if (s.talk) {
            var spot = document.querySelector('#npcLayer .npc-spot[data-npc="' + s.talk + '"]');
            if (spot) {
              spot.click();
              for (var d = 0; d < (s.lines || 2); d++) {
                var nx = document.getElementById('rdNext');
                if (nx) nx.click();
              }
            }
          }
          SP.stage.reduced = false;
          if (SP.stage.targetMix || SP.stage.targetSnow) {
            SP.stage.weatherMix = SP.stage.targetMix;
            for (var i2 = 0; i2 < 26; i2++) SP.stage.renderFrame(0.016);
          }
          SP.stage.reduced = true;
          SP.roam.renderHUD();
          ready('ok', {
            npcs: document.querySelectorAll('#npcLayer .npc-spot').length,
            dialog: !document.getElementById('roamDialog').classList.contains('hidden'),
            hud: (document.getElementById('roamObjText').textContent || '').slice(0, 30),
          });
          return;
        } else if (s.kind === 'panel') {
          SP.engine.init(null);
          SP.engine.state.flags = { open: 1, creative: 1, rest: 1, explore: 1, watched: 1, club: 'photo' };
          SP.engine.state.bonds = { man: 5, yan: 4, family: 3, self: 6 };
          SP.engine.state.id = 'roof';
          SP.engine.state.choices = 9;
          SP.engine.state.log = [
            { kind: 'say', speaker: '小满', text: '我的短片没选上。难过了半小时，后来发现里面有两个镜头我还挺喜欢。', place: '宿舍', chapter: '第三章 · 十一月' },
            { kind: 'choice', speaker: '我的选择', text: '陪她把短片重看一遍', place: '宿舍', chapter: '第三章 · 十一月' },
            { kind: 'say', speaker: '阿言', text: '我能决定的通常只是下一步。下一步走完，人也会变。', place: '教学楼天台', chapter: '第三章 · 十一月' },
            { kind: 'mine', speaker: '我', text: '那我们先走下一步吧。', place: '教学楼天台', chapter: '第三章 · 十一月' }
          ];
          SP.storage.markRead(Object.keys(SP.story.NODES).slice(0, 34));
          ['research_lab', 'create_film', 'still_together', 'go_home'].forEach(function (e) {
            try { SP.storage.unlockEnding(e); } catch (err) {}
          });
          ['begin', 'firstChoice', 'clubLife', 'nightOwl'].forEach(function (a) {
            try { SP.storage.unlockAchievement(a); } catch (err) {}
          });
          // 漫游版新增的三个面板：先塞一份进行中的存档状态，画面才有内容可看
          if (s.panel === 'map' || s.panel === 'journal' || s.panel === 'notebook') {
            var w = SP.game.ensure();
            w.notes = ['q_screws', 'q_sound'];
            w.quests = { q_screws: { stage: 1 }, q_sound: { stage: 0, done: true }, q_poster: { stage: 1 }, q_line089: { stage: 2 } };
            w.rapport = { man: 3, cheng: 4, yan: 5, aunt: 3, teacher: 1, mom: 2 };
            w.keepsakes = ['yan'];
            w.items = ['i_screw_bag', 'i_washer_note', 'i_form_copy', 'k_yan', 'e_garlic', 'e_bookcard', 'e_popcorn'];
            w.visited = ['campus', 'avenue', 'dorm', 'canteen', 'library', 'club'];
            if (!w.unlocked.includes('classroom')) w.unlocked.push('classroom');
            var w2 = SP.game.WINDOWS[s.window || 'w2'];
            SP.engine.state.id = w2.gate;
            SP.roam.enter(w2.next);
            if (s.loc) SP.roam.travel(s.loc);
          }
          if (s.panel === 'map') SP.roam.openMap();
          if (s.panel === 'journal') SP.roam.openJournal();
          if (s.panel === 'notebook') SP.ui.openNotebook();
          if (s.panel === 'settings') SP.ui.openSettings();
          if (s.panel === 'save') SP.ui.openSaves('save');
          if (s.panel === 'load') SP.ui.openSaves('load');
          if (s.panel === 'log') SP.ui.openLog();
          if (s.panel === 'gallery') SP.ui.openGallery();
          if (s.panel === 'achievements') SP.ui.openAchievements();
          if (s.panel === 'flow') SP.ui.openFlow();
          if (s.panel === 'menu') SP.ui.openMenu();
        }
        ready('ok', panelStats());
      } catch (e) {
        ready('error:' + (e && e.message), null);
      }
    }, 140);
  });
})();
</script>`;
}

/* ── 主流程 ───────────────────────────────────────────────────────── */
if (!(await (async () => { try { await readFile(SRC); return true; } catch { return false; } })())) {
  console.error(`${C.r}找不到 dist/index.html，请先跑 node tools/build.mjs${C.x}`);
  process.exit(2);
}

const bundle = await readFile(SRC, 'utf8');
await mkdir(OUT, { recursive: true });

const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const list = only.length ? SHOTS.filter((s) => only.some((o) => s.name.includes(o))) : SHOTS;
if (!list.length) { console.error(`${C.r}没有匹配的截图名${C.x}`); process.exit(2); }

console.log(`\n${C.b}晴天以后 · 留一盏灯（漫游版） 预览截图${C.x} ${C.d}（截打包产物，${list.length} 张）${C.x}`);
console.log('─'.repeat(74));

const results = [];
const SHOT_FAILS = [];

for (const s of list) {
  const tmp = path.join(OUT, '__' + s.name + '.html');
  const png = path.join(OUT, s.name + '.png');
  const html = bundle.replace(/<\/body>/, driver(s) + '\n</body>');
  await writeFile(tmp, html, 'utf8');

  const args = [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--disable-extensions', '--allow-file-access-from-files', '--hide-scrollbars',
    `--window-size=${W},${H}`, '--force-device-scale-factor=1',
    '--virtual-time-budget=6000',
    `--screenshot=${png}`,
    '--dump-dom',
    pathToFileURL(tmp).href,
  ];

  let dom = '';
  try {
    const r = await exec(CHROME, args, { maxBuffer: 64 * 1024 * 1024, timeout: 90_000, encoding: 'utf8' });
    dom = r.stdout;
  } catch (e) { dom = e.stdout || ''; }

  const st = dom.match(/<div id="__shotstate"[^>]*>([\s\S]*?)<\/div>/);
  const raw = st ? st[1] : 'missing';
  const [state, errJson, statsJson] = raw.split('|');
  const okState = state.startsWith('ok');
  let errs = [];
  try { errs = JSON.parse(errJson || '[]'); } catch {}
  let stats = {};
  try { stats = JSON.parse(statsJson || '{}'); } catch {}

  let size = 0;
  try { size = (await readFile(png)).length; } catch {}

  // 面板类截图额外要求 DOM 里确实有内容；场景类只要求画面有像素
  const contentOk = s.kind === 'panel'
    ? (stats.text >= 60 && stats.els >= 8)
    : true;
  const good = okState && errs.length === 0 && size > 20_000 && contentOk;
  if (!good) SHOT_FAILS.push(`${s.name} → state=${state} png=${size}B ${contentOk ? '' : '面板内容不足 ' + JSON.stringify(stats)}`);

  const tag = s.kind === 'panel'
    ? `面板 ${stats.els} 元素 / ${stats.text} 字 / ${stats.buttons} 按钮`
    : `${Math.round(size / 1024)} KB`;
  results.push({ ...s, file: s.name + '.png', size, ok: good, state, stats });
  console.log(` ${good ? `${C.g}✓${C.x}` : `${C.r}✗${C.x}`} ${s.name.padEnd(18)} ${C.d}${tag.padEnd(24)} ${s.desc}${C.x}`);
  if (!good) console.log(`      ${C.r}state=${state} errors=${JSON.stringify(errs)} stats=${JSON.stringify(stats)}${C.x}`);

  await rm(tmp, { force: true });
}

/* ── 联排看板 ─────────────────────────────────────────────────────── */
const sheet = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>晴天以后 · 留一盏灯（漫游版） 预览看板</title>
<style>
  :root { color-scheme: dark }
  * { box-sizing: border-box }
  body { margin: 0; background: #0e1619; color: #e7f0ee;
         font: 15px/1.6 "Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif; }
  header { padding: 30px 34px 20px; border-bottom: 1px solid #1e2d33; position: sticky; top: 0;
           background: linear-gradient(#0e1619, #0e1619f2); backdrop-filter: blur(8px); z-index: 2 }
  h1 { margin: 0 0 6px; font-size: 22px; letter-spacing: .04em; font-weight: 600 }
  .sub { color: #7d949a; font-size: 13px }
  .sub b { color: #9fd7c4; font-weight: 500 }
  main { padding: 26px 34px 60px; display: grid; gap: 30px;
         grid-template-columns: repeat(auto-fill, minmax(430px, 1fr)) }
  figure { margin: 0 }
  .frame { border: 1px solid #22333a; border-radius: 10px; overflow: hidden; background: #121c20;
           box-shadow: 0 10px 30px #0006 }
  img { display: block; width: 100%; height: auto }
  figcaption { margin-top: 9px; font-size: 13px; color: #8ea6ac; display: flex; gap: 8px; align-items: baseline }
  figcaption b { color: #dcece8; font-weight: 500 }
  code { font-size: 12px; color: #6fb99e; background: #14232a; padding: 1px 6px; border-radius: 4px }
</style></head>
<body>
<header>
  <h1>晴天以后 · 留一盏灯（漫游版）—— 预览看板</h1>
  <div class="sub">全部图片截自打包产物 <code>dist/晴天以后.html</code>（单文件、无外部依赖，${results.length} 张）。
    画面由程序化 SVG 即时生成，音乐与音效由 WebAudio 实时合成。</div>
</header>
<main>
${results.map((r) => `  <figure>
    <div class="frame"><img src="${r.file}" alt="${r.name}" loading="lazy"></div>
    <figcaption><b>${r.name.replace(/^\d+_/, '')}</b> ${r.desc}</figcaption>
  </figure>`).join('\n')}
</main>
</body></html>`;

await writeFile(path.join(OUT, 'index.html'), sheet, 'utf8');

console.log('─'.repeat(74));
if (SHOT_FAILS.length) {
  console.log(`${C.r}✗ ${SHOT_FAILS.length} 张有问题：${C.x}`);
  for (const f of SHOT_FAILS) console.log(`   · ${f}`);
  console.log();
  process.exit(1);
}
console.log(`${C.g}✓ ${results.length} 张全部成功${C.x}`);
console.log(`  → ${path.relative(ROOT, path.join(OUT, 'index.html'))} ${C.d}（联排看板）${C.x}\n`);
