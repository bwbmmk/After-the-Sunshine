#!/usr/bin/env node
/**
 * 晴天以后 v2 · 运行时冒烟测试
 * ------------------------------------------------------------------
 * 思路：把一段「探针脚本」注入打包产物，用 headless Chrome 加载后
 * 把真实运行状态（舞台层数、主题变量、面板模式、剧情数据、错误捕获）
 * 序列化进 DOM，再用 --dump-dom 取回来断言。
 *
 * 这样不依赖看图，也能确定「文件确实跑起来了」。
 *
 * 注意：打字机是 rAF 驱动的、选项在打完字后才渲染，所以深挖测试必须
 * 轮询等待，不能在 show() 之后立刻读 DOM。
 *
 * 用法：node tools/probe.mjs [--keep]
 */
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const exec = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DIST = path.join(ROOT, 'dist');
const SRC = path.join(DIST, 'index.html');
const TMP = path.join(DIST, '__probe.html');

const CHROME = process.env.CHROME_BIN
  || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const C = process.stdout.isTTY
  ? { d: '\x1b[2m', g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', b: '\x1b[1m', x: '\x1b[0m' }
  : { d: '', g: '', r: '', y: '', b: '', x: '' };

let html = await readFile(SRC, 'utf8');

/* 错误收集器：放在最前面，boot 过程中的异常也能抓到 */
const collector = `<script id="__probeErr">
window.__PROBE_ERRORS = [];
window.addEventListener('error', function (e) {
  window.__PROBE_ERRORS.push(String(e.message) + ' @ line ' + (e.lineno || 0) + ':' + (e.colno || 0));
});
window.addEventListener('unhandledrejection', function (e) {
  window.__PROBE_ERRORS.push('unhandledrejection: ' + String(e.reason));
});
</script>`;
html = html.replace(/(<meta charset="utf-8">)/, '$1\n' + collector);

/* 采集器：boot 完成后把状态写进 <pre id="__probe"> */
const probe = `<script id="__probe">
(function () {
  function cv(el, name) {
    try { return getComputedStyle(el).getPropertyValue(name).trim(); } catch (e) { return ''; }
  }
  function txt(el) { return el ? (el.textContent || '') : ''; }
  function emit(o) {
    var pre = document.createElement('pre');
    pre.id = '__probe';
    pre.style.display = 'none';   // 不能影响截图，但 --dump-dom 仍能取到文本
    // 标记拆开拼，避免这段源码自身被采集正则误匹配
    pre.textContent = '@@PRO' + 'BE@@' + JSON.stringify(o) + '@@END' + 'PROBE@@';
    document.body.appendChild(pre);
  }

  function collectBasic(o) {
    var SP = window.SP || {};
    o.ok = !!window.SP;
    o.modules = Object.keys(SP).sort();
    o.nodeCount = SP.story ? Object.keys(SP.story.NODES).length : 0;
    o.endingCount = SP.story && SP.story.ENDINGS ? Object.keys(SP.story.ENDINGS).length : 0;
    o.achCount = SP.story && SP.story.ACHIEVEMENTS ? Object.keys(SP.story.ACHIEVEMENTS).length : 0;
    o.chapters = SP.story && SP.story.CHAPTERS ? SP.story.CHAPTERS.length : 0;
    o.nodesWithChoices = SP.story ? Object.keys(SP.story.NODES).filter(function (k) {
      return SP.story.NODES[k].choices && SP.story.NODES[k].choices.length;
    }).length : 0;
    // 漫游版：分岔不再写在节点里，而是 next 函数读世界的 flag
    o.branchNodes = SP.story ? Object.keys(SP.story.NODES).filter(function (k) {
      return typeof SP.story.NODES[k].next === 'function';
    }).length : 0;
    o.branchEdges = (SP.story && SP.game) ? SP.story.allEdges(SP.game.flagSamples()).length : 0;
    // 玩法数据（漫游版新增）
    o.questCount = SP.game ? Object.keys(SP.game.QUESTS).length : 0;
    o.groupCount = SP.game ? Object.keys(SP.game.GROUPS).length : 0;
    o.itemCount = SP.game ? Object.keys(SP.game.ITEMS).length : 0;
    o.keepCount = SP.game ? Object.keys(SP.game.KEEPSAKES).length : 0;
    o.gameAchCount = SP.game ? SP.game.GAME_ACHIEVEMENTS.length : 0;

    var layers = document.querySelectorAll('#game .layer');
    o.layerCount = layers.length;
    o.layerHasSvgRoot = Array.prototype.map.call(layers, function (l) {
      return /^\\s*<svg[\\s>]/.test(l.innerHTML);
    });
    o.layerElCount = Array.prototype.map.call(layers, function (l) {
      return l.querySelectorAll('*').length;
    });
    var world = document.querySelector('#game .world');
    o.stageHtmlLen = world ? world.innerHTML.length : -1;
    o.hasCelestial = !!document.querySelector('#game .celestial');
    o.hasFx = !!document.querySelector('#game .fx');
    o.hasStarfield = !!document.querySelector('#game .starlayer');

    var stage = SP.stage && SP.stage.el ? SP.stage.el : document.getElementById('game');
    o.varSky = cv(stage, '--sky-1');
    o.varSky3 = cv(stage, '--sky-3');
    o.varFar = cv(stage, '--c-far');
    o.varGround = cv(stage, '--c-ground');
    o.varAccent = cv(stage, '--c-accent');
    o.varNight = cv(stage, '--night');
    o.stageScene = SP.stage ? SP.stage.scene : null;
    o.stageTime = SP.stage ? SP.stage.time : null;
    o.stageWeather = SP.stage ? SP.stage.weather : null;
    o.particles = SP.stage ? (SP.stage.particles || []).length : 0;

    o.overlayMode = document.getElementById('overlay').dataset.mode || '';
    o.overlayHidden = document.getElementById('overlay').classList.contains('hidden');
    o.coverTitle = txt(document.querySelector('#panel h1'));
    o.coverLead = txt(document.querySelector('#panel .lead')).length;
    o.coverStats = document.querySelectorAll('#panel .stat').length;
    o.panelButtons = Array.prototype.map.call(document.querySelectorAll('#panel button'), function (b) { return txt(b).trim(); });

    o.title = document.title;
    o.chapterChip = txt(document.getElementById('chapterChip'));
    o.placeChip = txt(document.getElementById('placeChip'));
    o.audioSupported = !!(window.AudioContext || window.webkitAudioContext);
    o.localStorageKeys = (function () { try { return Object.keys(localStorage).sort(); } catch (e) { return ['<blocked>']; } })();
    // 存档系统的前提：真的能写能读（file:// 下有些浏览器会禁用 localStorage）
    o.localStorageWritable = (function () {
      try {
        localStorage.setItem('__probe_t', '1');
        var ok = localStorage.getItem('__probe_t') === '1';
        localStorage.removeItem('__probe_t');
        return ok;
      } catch (e) { return false; }
    })();
    o.hudButtons = Array.prototype.map.call(document.querySelectorAll('.toolbar .tb'), function (b) { return b.id; });
    o.docFontSize = document.documentElement.dataset.fontsize;
    o.docMotion = document.documentElement.dataset.motion;
  }

  function run() {
    var o = {};
    try { collectBasic(o); } catch (e) { o.basicError = String(e && e.stack || e); }

    // 诊断：headless 下合成帧可能非常少，rAF 驱动的打字机会因此停住。
    // 这里持续计数，用于区分「打字机坏了」和「环境不产帧」。
    var rafFrames = 0;
    (function tick() { rafFrames++; requestAnimationFrame(tick); })();
    var rafFired = false;
    requestAnimationFrame(function () { rafFired = true; });

    var SP = window.SP || {};
    // 深挖节点：优先「有选项且有立绘」的节点，其次任何有选项的节点，最后退回起点
    // 主线已经没有选项节点了：深挖改挑「有立绘、有名牌、next 是字符串」的节点
    var probeNode = null;
    if (SP.story) {
      var keys = Object.keys(SP.story.NODES);
      probeNode = keys.filter(function (k) {
        var n = SP.story.NODES[k];
        return !!n.person && !n.ending && typeof n.next === 'string';
      })[0] || keys[0];
    }

    if (!probeNode || !SP.engine) {
      o.errors = window.__PROBE_ERRORS || [];
      o.rafFired = rafFired;
      return emit(o);
    }

    // 深挖：跳到有立绘 + 选项的节点，然后轮询等打字机与选项就绪
    try {
      SP.engine.state.bonds = { man: 3, yan: 2, family: 1, self: 2 };
      SP.storage.saveSettings({ showBonds: true });   // 羁绊条默认关闭，这里打开以便断言
      SP.ui.closePanel();
      SP.engine.show(probeNode, { instant: true });
      o.deepNode = probeNode;
    } catch (e) { o.deepError = String(e && e.stack || e); }

    var tries = 0;
    var forced = false;
    (function wait() {
      tries++;
      var lineLen = txt(document.getElementById('line')).length;
      var ready = lineLen > 0 && txt(document.getElementById('speaker')).length > 0;

      if (!ready && tries < 40) return setTimeout(wait, 30);

      // 如果这段时间里合成帧极少（<5），打字机是「没帧可跑」而不是有 bug：
      // 用 finishText() 强制收尾，独立验证「文本 → 选项」这条链路本身
      if (!ready && rafFrames < 5 && typeof SP.engine.finishText === 'function') {
        try { SP.engine.finishText(); forced = true; }
        catch (e) { o.finishError = String(e && e.stack || e); }
        lineLen = txt(document.getElementById('line')).length;
      }
      o.rafFired = rafFired;
      o.rafFrames = rafFrames;
      o.forcedFinish = forced;

      try {
        o.deepLineLen = lineLen;
        o.deepLineSample = txt(document.getElementById('line')).slice(0, 34);
        o.deepSpeaker = txt(document.getElementById('speaker'));
        o.deepBadge = txt(document.querySelector('#speaker .badge'));
        o.deepChoices = Array.prototype.map.call(document.querySelectorAll('#choices .choice'), function (c) {
          return txt(c).replace(/\\s+/g, ' ').trim().slice(0, 26);
        });
        o.deepChoicesHidden = document.getElementById('choices').classList.contains('hidden');
        o.deepLocked = document.querySelectorAll('#choices .choice.locked').length;
        o.deepSecret = document.querySelectorAll('#choices .choice.secret').length;
        o.deepNextHidden = document.getElementById('nextBtn').classList.contains('hidden');
        o.deepHint = txt(document.getElementById('hint'));
        o.deepChars = document.querySelectorAll('#characters .char').length;
        o.deepCharEls = (function () {
          var c = document.querySelector('#characters .char');
          return c ? c.querySelectorAll('svg *').length : 0;
        })();
        o.deepBondsVisible = !document.getElementById('bonds').classList.contains('hidden');
        o.deepBondItems = document.querySelectorAll('#bonds .bond').length;
        o.deepBondLabels = Array.prototype.map.call(document.querySelectorAll('#bonds .bond'), function (b) { return txt(b).replace(/\\s+/g, ' ').trim(); });
        o.deepProgress = cv(document.querySelector('#progressBar'), '--p');
        o.deepPlaceChip = txt(document.getElementById('placeChip'));
        o.deepAttempts = tries;

        // 回归测试：finishText() 结尾会调用 SP.engine.markRead()。
        // 曾经这个方法没有导出，导致每次打完字都抛异常、「快进已读」静默失效。
        o.markReadFn = typeof SP.engine.markRead === 'function';
        try {
          var prog = SP.storage.getProgress();
          var read = prog.readNodes || [];
          o.deepReadCount = read.length;
          o.deepNodeMarkedRead = read.indexOf(probeNode) >= 0;
        } catch (e) { o.readProbeError = String(e && e.message); }

        // 快进 A：分岔节点的 next 是函数，在样本下必须都能给出真实节点
        try {
          var samples = SP.game ? SP.game.flagSamples() : [];
          o.flagSamples = samples.length;
          var bad = [];
          Object.keys(SP.story.NODES).forEach(function (k) {
            var n = SP.story.NODES[k];
            if (typeof n.next !== 'function') return;
            samples.forEach(function (f) {
              var t = null;
              try { t = n.next(f); } catch (e) { bad.push(k + ' 抛错'); return; }
              if (!t || !SP.story.NODES[t]) bad.push(k + ' → ' + t);
            });
          });
          o.branchBad = bad.slice(0, 4);
          o.branchOK = samples.length > 0 && bad.length === 0;
        } catch (e) { o.skipError = String(e && e.message); }

        // 快进 B：纯对话节点 + 前方内容已读 → 应当正常开启
        try {
          var allIds = Object.keys(SP.story.NODES);
          SP.storage.markRead(allIds);
          var pair = null;
          allIds.some(function (k) {
            var n = SP.story.NODES[k];
            if (!n || n.choices || n.ending || typeof n.next !== 'string') return false;
            var nx = SP.story.NODES[n.next];
            if (!nx || nx.choices || nx.ending) return false;
            pair = k; return true;
          });
          o.skipPair = pair;
          if (pair) {
            SP.engine.show(pair, { instant: true, noCard: true, record: false });
            SP.engine.finishText();
            SP.engine.toggleSkip();
            o.skipEngaged = (SP.engine.skip === true);
            if (SP.engine.skip) SP.engine.toggleSkip();
          }
        } catch (e) { o.skipError2 = String(e && e.message); }

        // 立绘：另挑一个带 person 的节点（选项节点在《留一盏灯》里都没有立绘）
        var withPerson = Object.keys(SP.story.NODES).filter(function (k) {
          var n = SP.story.NODES[k];
          return !!n.person && !n.choices && !n.ending;
        })[0];
        if (withPerson) {
          SP.engine.show(withPerson, { instant: true, noCard: true, record: false });
          SP.engine.finishText();
          o.personNode = withPerson;
          o.personChars = document.querySelectorAll('#characters .char').length;
          var ch = document.querySelector('#characters .char');
          o.personCharEls = ch ? ch.querySelectorAll('svg *').length : 0;
          o.personSpeaker = txt(document.getElementById('speaker'));
        }
      } catch (e) { o.deepCollectError = String(e && e.stack || e); }

      o.errors = window.__PROBE_ERRORS || [];
      emit(o);
    })();
  }

  if (document.readyState === 'complete') setTimeout(run, 90);
  else window.addEventListener('load', function () { setTimeout(run, 90); });
})();
</script>`;
html = html.replace(/<\/body>/, probe + '\n</body>');

await mkdir(DIST, { recursive: true });
await writeFile(TMP, html, 'utf8');

/* ── 跑 Chrome ─────────────────────────────────────────────────────
 * 同时截图：一是逼合成器真的产帧（否则 rAF 驱动的打字机跑不起来），
 * 二是留一张实拍图作为「确实渲染出来了」的视觉证据。
 * ------------------------------------------------------------------ */
const SHOT = path.join(ROOT, 'dist', 'preview.png');
const args = [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--no-first-run',
  '--disable-extensions',
  '--allow-file-access-from-files',
  '--hide-scrollbars',
  '--window-size=1600,900',
  '--virtual-time-budget=8000',
  '--screenshot=' + SHOT,
  '--dump-dom',
  pathToFileURL(TMP).href,
];

let dom = '';
try {
  const r = await exec(CHROME, args, { maxBuffer: 64 * 1024 * 1024, timeout: 90_000, encoding: 'utf8' });
  dom = r.stdout;
} catch (e) {
  if (e.stdout) dom = e.stdout;
  else { console.error(`${C.r}无法启动 Chrome（${CHROME}）${C.x}\n${e.message}`); process.exit(2); }
}

const m = dom.match(/@@PROBE@@([\s\S]*?)@@ENDPROBE@@/);
if (!m) {
  console.error(`${C.r}✗ 探针没有回传结果 —— 说明页面在启动阶段就崩了。${C.x}`);
  const err = dom.match(/(Uncaught[^<\n]{0,200})/g);
  if (err) console.error('  页面内异常：\n   ' + err.slice(0, 8).join('\n   '));
  process.exit(1);
}

let rep;
try { rep = JSON.parse(m[1]); } catch (e) { console.error(`${C.r}探针输出无法解析${C.x}\n${m[1].slice(0, 800)}`); process.exit(1); }

/* ── 断言 ────────────────────────────────────────────────────────── */
const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: !!pass, detail });

check('SP 命名空间已建立', rep.ok, `${(rep.modules || []).length} 个导出`);
// 《留一盏灯》剧本：138 节点 / 6 结局 / 5 章；成就 8 个剧情 + 9 个漫游（game.js 运行时并入）
check('剧情节点数 = 138', rep.nodeCount === 138, String(rep.nodeCount));
check('结局数 = 6', rep.endingCount === 6, String(rep.endingCount));
check('成就数 = 17（剧情 8 + 漫游 9）', rep.achCount === 17, `${rep.achCount}（漫游 ${rep.gameAchCount}）`);
check('章节数 = 5', rep.chapters === 5, String(rep.chapters));
check('主线已无「当场选项」节点', rep.nodesWithChoices === 0, `${rep.nodesWithChoices} 个`);
check('分岔节点 = 14（读世界 flag）', rep.branchNodes === 14, `${rep.branchNodes} 个 · 摊开后出边 ${rep.branchEdges} 条`);
check('委托 28 / 互斥组 10 / 物品 30 / 留念 6',
  rep.questCount === 28 && rep.groupCount === 10 && rep.itemCount === 30 && rep.keepCount === 6,
  `委托 ${rep.questCount} · 组 ${rep.groupCount} · 物品 ${rep.itemCount} · 留念 ${rep.keepCount}`);
check('舞台四层视差已构建', rep.layerCount >= 4, `${rep.layerCount} 层`);
check('四层均为合法 <svg> 注入', (rep.layerHasSvgRoot || []).every(Boolean) && rep.layerHasSvgRoot.length >= 4,
  `各层元素数 ${JSON.stringify(rep.layerElCount)}`);
check('场景图形元素充足（≥150）', (rep.layerElCount || []).reduce((a, b) => a + b, 0) >= 150,
  `${(rep.layerElCount || []).reduce((a, b) => a + b, 0)} 个`);
check('天体层 / 星空 / 粒子画布齐备', rep.hasCelestial && rep.hasStarfield && rep.hasFx, '');
check('天气粒子已播种（≥60）', rep.particles >= 60, `${rep.particles} 粒`);
check('主题色变量已注入', /^#|rgb|hsl/i.test(rep.varSky || '') && /^#|rgb/i.test(rep.varFar || ''),
  `sky ${rep.varSky} → ${rep.varSky3} · far ${rep.varFar} · night ${rep.varNight}`);
check('初始场景 = 校门口 · 黄昏', rep.stageScene === 'campus' && rep.stageTime === 'dusk',
  `${rep.stageScene} @ ${rep.stageTime} / ${rep.stageWeather}`);
check('封面已弹出且内容完整', rep.overlayMode === 'cover' && !rep.overlayHidden && rep.coverTitle === '留一盏灯',
  `mode=${rep.overlayMode} 标题「${rep.coverTitle}」简介 ${rep.coverLead} 字 · ${rep.coverStats} 项统计 · 按钮 ${(rep.panelButtons || []).length}`);
check('顶栏按钮齐全（10 个，含地图与任务）', (rep.hudButtons || []).length === 10, (rep.hudButtons || []).join(','));
check('WebAudio 可用', rep.audioSupported, '');
check('localStorage 可写（存档系统前提）', rep.localStorageWritable === true && (rep.localStorageKeys || [])[0] !== '<blocked>',
  `写入${rep.localStorageWritable ? '正常' : '失败'} · 键 ${(rep.localStorageKeys || []).join(',') || '（空）'}`);
check('无障碍属性已应用（字号/动效）', !!rep.docFontSize && !!rep.docMotion, `fontsize=${rep.docFontSize} motion=${rep.docMotion}`);

/* 深挖：引擎推进 */
check('引擎可跳转到指定节点', !!rep.deepNode, rep.deepNode || '(未执行)');
check('对话框有说话人', !!rep.deepSpeaker, rep.deepSpeaker + (rep.deepBadge ? `（${rep.deepBadge}）` : ''));
check('正文已排入对话行', (rep.deepLineLen || 0) > 0,
  `${rep.deepLineLen} 字「${rep.deepLineSample || ''}…」· rAF 帧数 ${rep.rafFrames}`
  + (rep.forcedFinish ? ' · 帧数不足，已用 finishText() 强制收尾' : ' · 打字机自然收敛'));
check('选项容器保持收起（选项已挪进漫游）', rep.deepChoicesHidden === true && (rep.deepChoices || []).length === 0,
  `#choices 隐藏 ${rep.deepChoicesHidden} · 子项 ${(rep.deepChoices || []).length}`);
check('叙述节点显示「继续」按钮', !rep.deepNextHidden, `提示语「${rep.deepHint}」`);
check('立绘已生成', rep.personChars >= 1 && rep.personCharEls > 20,
  `节点 ${rep.personNode} → ${rep.personChars} 个角色 / ${rep.personCharEls} 个 SVG 节点`);
check('羁绊条显示且有条目', rep.deepBondsVisible && rep.deepBondItems >= 2,
  `${rep.deepBondItems} 条 → ${(rep.deepBondLabels || []).join(' ')}`);
check('地点标签随节点更新', !!rep.deepPlaceChip, rep.deepPlaceChip);
check('已读记录写入（快进功能的前提）', rep.markReadFn && rep.deepNodeMarkedRead,
  `SP.engine.markRead ${rep.markReadFn ? '存在' : '缺失'} · 已读 ${rep.deepReadCount} 个节点`
  + (rep.deepNodeMarkedRead ? `（含当前节点 ${rep.deepNode}）` : ' ✗ 当前节点未被标记'));
check('每处分岔在样本下都落到真实节点', rep.branchOK,
  rep.skipError || `${rep.flagSamples} 组 flag 取样`
  + (rep.branchBad && rep.branchBad.length ? ` · 有问题：${rep.branchBad.join(' , ')}` : ' · 无悬挂'));
check('已读内容可开启快进', rep.skipEngaged, `测试节点 ${rep.skipPair}${rep.skipError2 ? ' · ' + rep.skipError2 : ''}`);

check('运行期无 JS 异常', (rep.errors || []).length === 0, (rep.errors || []).join(' | ') || '0 条');
check('探针自身无异常',
  !rep.probeError && !rep.basicError && !rep.deepError && !rep.deepCollectError
  && !rep.finishError && !rep.readProbeError && !rep.skipError && !rep.skipError2,
  rep.probeError || rep.basicError || rep.deepError || rep.deepCollectError
  || rep.finishError || rep.readProbeError || rep.skipError || rep.skipError2 || '');

/* ── 报告 ────────────────────────────────────────────────────────── */
const pass = checks.filter((c) => c.pass).length;
const width = Math.max(...checks.map((c) => c.name.length)) + 2;
console.log(`\n${C.b}晴天以后 · 留一盏灯（漫游版） 运行时冒烟测试${C.x}`);
console.log('─'.repeat(width + 40));
for (const c of checks) {
  const mark = c.pass ? `${C.g}✓${C.x}` : `${C.r}✗${C.x}`;
  const d = c.detail && c.detail.length > 104 ? c.detail.slice(0, 104) + '…' : c.detail;
  console.log(` ${mark} ${c.name.padEnd(width)} ${C.d}${d || ''}${C.x}`);
}
console.log('─'.repeat(width + 40));
console.log(`  ${pass}/${checks.length} 通过   标题：${rep.title}`);
if (pass === checks.length) console.log(`${C.g}✓ 全部通过 —— 单文件版在真实浏览器中可正常运行${C.x}\n`);
else console.log(`${C.r}✗ 有 ${checks.length - pass} 项未通过${C.x}\n`);

if (!process.argv.includes('--keep')) await rm(TMP, { force: true });
process.exit(pass === checks.length ? 0 : 1);
