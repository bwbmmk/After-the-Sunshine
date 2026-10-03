#!/usr/bin/env node
/**
 * 留一盏灯 · 漫游版 · 游戏层端到端探针
 * ------------------------------------------------------------------
 * 在真实浏览器里把「自由行动」跑一遍：
 *   闸门进入 → 地图旅行 → 与 NPC 对话接下委托 → 推进 → 交差 → 收进手记 → 继续主线
 * 断言全部基于真实 DOM 与真实状态，不依赖看图。
 *
 * 用法：node tools/probe-roam.mjs [--keep]
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
const TMP = path.join(DIST, '__probe-roam.html');

const CHROME = process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const C = process.stdout.isTTY
  ? { d: '\x1b[2m', g: '\x1b[32m', r: '\x1b[31m', b: '\x1b[1m', x: '\x1b[0m' }
  : { d: '', g: '', r: '', b: '', x: '' };

let html = await readFile(SRC, 'utf8');

const collector = `<script>window.__PROBE_ERRORS=[];
window.addEventListener('error',function(e){window.__PROBE_ERRORS.push(String(e.message)+' @'+e.lineno);});
window.addEventListener('unhandledrejection',function(e){window.__PROBE_ERRORS.push('rej:'+String(e.reason));});
</script>`;
html = html.replace(/(<meta charset="utf-8">)/, '$1\n' + collector);

const probe = `<script id="__probeRoam">
(function () {
  function txt(el) { return el ? (el.textContent || '') : ''; }
  function vis(sel) { var e = document.querySelector(sel); return !!e && !e.classList.contains('hidden'); }
  function emit(o) {
    var pre = document.createElement('pre');
    pre.id = '__probeRoam'; pre.style.display = 'none';
    pre.textContent = '@@PRO' + 'BE@@' + JSON.stringify(o) + '@@END' + 'PROBE@@';
    document.body.appendChild(pre);
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function settle(max) {
    return (async function () {
      for (var i = 0; i < (max || 60); i++) {
        await wait(50);
        if (!SP.engine.busy) return;
      }
    })();
  }

  var SP = window.SP;

  async function run() {
    var o = {};
    try {
      /* ---------- 1. 进入自由行动（第一章闸门 gate_laugh） ---------- */
      SP.ui.closePanel();
      SP.engine.restart();
      SP.engine.show('gate_laugh', { instant: true, noCard: true });
      SP.engine.finishText();
      SP.engine.next();
      await wait(200);

      o.roamActive = SP.roam.active();
      o.windowId = SP.roam.windowId();
      o.dialogueHidden = !vis('#dialogue');
      o.roamLayerVisible = vis('#roamLayer');
      o.hudVisible = vis('#roamHud');
      o.objText = txt(document.getElementById('roamObjText'));
      o.placeChip = txt(document.getElementById('placeChip'));
      o.startLoc = SP.game.ensure().loc;
      o.npcAtStart = Array.prototype.map.call(
        document.querySelectorAll('#npcLayer .npc-spot'), function (b) { return b.dataset.npc; });
      o.npcBusyDots = document.querySelectorAll('#npcLayer .npc-spot.busy').length;
      o.goDisabledAway = document.getElementById('roamGoBtn').disabled;   // 起点是东门，目标在四号楼
      o.lastTimeType = typeof SP.engine.lastTime;                          // 回归：getter 是否还在

      /* ---------- 2. 看一看 ---------- */
      document.getElementById('lookSpot').click();
      await wait(60);
      o.lookCardVisible = !!document.querySelector('#lookCard:not(.hidden)');
      o.lookText = txt(document.querySelector('#lookCard .look-text')).slice(0, 24);
      document.querySelector('#lookCard').click();

      /* ---------- 3. 地图面板 ---------- */
      SP.roam.openMap();
      await wait(80);
      o.mapLocs = document.querySelectorAll('#panel .loc').length;
      o.mapLocked = document.querySelectorAll('#panel .loc.locked').length;
      o.mapCurrent = document.querySelectorAll('#panel .loc.current').length;
      o.mapHasSvg = !!document.querySelector('#panel svg.map-svg');
      o.mapQuestMarks = document.querySelectorAll('#panel [class*="loc-qmark"]').length;
      o.mapStar = document.querySelectorAll('#panel .loc-star').length;
      // 点一个还没开放的地方：应当被拒绝，且位置不变
      var locked = document.querySelector('#panel .loc.locked');
      if (locked) locked.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await wait(60);
      o.lockedRejected = SP.game.ensure().loc === o.startLoc;
      SP.ui.closePanel();

      /* ---------- 4. 旅行 + 接下委托（互斥：接了这组的一件，同组那件就作废） ---------- */
      SP.roam.travel('dorm');
      await wait(120);
      o.locAfterTravel = SP.game.ensure().loc;
      o.npcAtDorm = Array.prototype.map.call(
        document.querySelectorAll('#npcLayer .npc-spot'), function (b) { return b.dataset.npc; });

      // acceptFirst：这一次对话里，第一次碰到选项就「答应」；否则一律「先不了」
      async function talk(npc, acceptFirst) {
        var spot = document.querySelector('#npcLayer .npc-spot[data-npc="' + npc + '"]');
        if (!spot) return false;
        spot.click();
        await wait(60);
        o['dialogOpen_' + npc] = vis('#roamDialog');
        var answered = 0;
        for (var i = 0; i < 40; i++) {
          var ch = document.querySelectorAll('#rdChoices button');
          if (ch.length) {
            if (acceptFirst && answered === 0) { ch[0].click(); answered++; }  // 答应下来
            else { ch[ch.length - 1].click(); }                                // 先不了
            await wait(60);
            continue;
          }
          if (!vis('#roamDialog')) break;
          var nx = document.getElementById('rdNext');
          if (nx) nx.click();
          await wait(60);
        }
        return true;
      }

      await talk('cheng', true);             // 第一次：答应下来
      var w = SP.game.ensure();
      o.questAccepted = !!w.quests.q_net;
      o.questStageAfterAccept = w.quests.q_net ? w.quests.q_net.stage : -1;
      o.siblingState = SP.game.questState('q_sound');            // 同组 → 应当 abandoned
      o.abandonedList = SP.game.abandonedQuests('w1');
      o.undecided = SP.roam.undecidedGroups('w1');               // 还有一组没定
      o.rapportChengAfterTalk = w.rapport.cheng || 0;

      await talk('cheng', false);            // 第二次：真的把事办了（这一步会推进）
      o.questStageAfterStep = w.quests.q_net ? w.quests.q_net.stage : -1;
      o.questReady = SP.game.questReadyToTurnIn('q_net');

      await talk('cheng', false);            // 第三次：交差，落下一张手记
      o.netDone = !!(w.quests.q_net && w.quests.q_net.done);
      o.netTalkRounds = 3;

      /* ---------- 4b. 道具链（程野 → 陈姨 → 程野）与彩蛋 ---------- */
      SP.roam.travel('canteen');
      await wait(120);
      document.getElementById('lookSpot').click();
      await wait(80);
      w = SP.game.ensure();
      o.eggFound = w.items.indexOf('e_chopsticks') >= 0;
      o.pocketAfterEgg = w.items.length;
      var lc = document.getElementById('lookCard');
      if (lc) lc.click();

      SP.game.accept('q_screws');
      var chain = [];
      chain.push(SP.game.advance('q_screws'));      // 从程野手里拿到螺丝袋
      o.pocketAfterTake = w.items.slice();
      chain.push(SP.game.advance('q_screws'));      // 螺丝袋交给陈姨 → 拿垫片与纸条
      o.pocketAfterGive = w.items.slice();
      chain.push(SP.game.advance('q_screws'));      // 垫片交回程野 → 拿铁盒
      o.screwReady = SP.game.questReadyToTurnIn('q_screws');
      o.chainGave = chain.map(function (r) { return (r && r.gave) || []; });
      o.chainTook = chain.map(function (r) { return (r && r.took) || []; });
      var done = SP.game.complete('q_screws');
      o.questDone = !!(w.quests.q_screws && w.quests.q_screws.done);
      o.notes = w.notes.slice();
      o.noteTitle = done ? done.note.title : '';
      o.rapportCheng = w.rapport.cheng || 0;
      o.visited = w.visited.length;

      /* ---------- 4c. 好感满值 → 专属留念物 ---------- */
      w.rapport.yan = SP.game.RAPPORT_MAX;
      o.giftMarkBefore = SP.game.npcHasBusiness('yan', 'w1');     // 还没给 → 该点亮
      o.keepsakeReady = !!SP.game.keepsakeFor('yan');
      var kk = SP.game.takeKeepsake('yan');
      o.keepsakeItem = kk ? kk.item : null;
      o.keepsakeFrom = kk && kk.def ? kk.def.from : '';
      o.keepsakeInPocket = w.items.indexOf('k_yan') >= 0;
      o.keepsakeOnceOnly = !SP.game.keepsakeFor('yan');           // 给过就不再给
      o.giftMarkAfter = SP.game.npcHasBusiness('yan', 'w1');      // 给完 → 熄灭
      o.keepsakeMax = SP.game.RAPPORT_MAX;

      /* ---------- 5. 任务手账 ---------- */
      SP.roam.openJournal();
      await wait(80);
      o.journalQuestCards = document.querySelectorAll('#panel .q-card').length;
      o.journalDoneRows = document.querySelectorAll('#panel .j-done:not(.off) li').length;
      o.journalAbandoned = document.querySelectorAll('#panel .j-done.off li').length;
      o.journalFaces = document.querySelectorAll('#panel .j-face').length;
      o.journalCgFaces = document.querySelectorAll('#panel .j-face .face.cg img').length;
      o.journalText = txt(document.getElementById('panel')).replace(/\\s+/g, ' ').slice(0, 60);
      SP.ui.closePanel();

      /* ---------- 6. 口袋分三层 ---------- */
      o.notebookExtras = SP.game.notebookExtras().length;
      o.pocketSections = SP.game.pocketSections().map(function (s) { return s.key + ':' + s.items.length; });
      SP.ui.openNotebook();
      await wait(80);
      o.pocketCards = document.querySelectorAll('#panel .pocket-item').length;
      o.pocketSecEls = document.querySelectorAll('#panel .pocket-sec').length;
      o.pocketKinds = Array.prototype.map.call(document.querySelectorAll('#panel .pocket-item'), function (el) {
        return (el.className || '').replace('pocket-item ', '');
      });
      o.pocketText = txt(document.getElementById('panel')).replace(/\\s+/g, ' ').slice(0, 50);
      SP.ui.closePanel();

      /* ---------- 7. 继续主线（先过「还有事没定」的确认） ---------- */
      o.goDisabledElsewhere = document.getElementById('roamGoBtn').disabled;  // 人还在食堂
      SP.roam.travel('dorm');
      await wait(140);
      o.goEnabledAtTarget = !document.getElementById('roamGoBtn').disabled;
      document.getElementById('roamGoBtn').click();
      await wait(140);
      o.confirmShown = vis('#overlay') && document.getElementById('overlay').dataset.mode === 'roam-confirm';
      o.confirmText = txt(document.getElementById('panel')).replace(/\\s+/g, ' ').slice(0, 40);
      var cont = document.querySelector('#panel .btn.primary');
      if (o.confirmShown && cont) cont.click();
      await settle(80);
      o.storyResumedId = SP.engine.state.id;
      o.roamClosedAfterGo = !SP.roam.active();
      o.dialogueBack = vis('#dialogue');
      o.resumeLine = txt(document.getElementById('line')).slice(0, 22);
      o.flagFirst = SP.engine.state.flags.first;      // 世界 flag 已并入叙事状态

      /* ---------- 8. 存档能带上世界状态 ---------- */
      SP.engine.saveTo(1);
      var slot = SP.storage.readSlot(1);
      o.slotHasWorld = !!(slot && slot.state && slot.state.world);
      o.slotItems = (slot && slot.state && slot.state.world && slot.state.world.items) || [];
      o.slotNotes = (slot && slot.state && slot.state.world && slot.state.world.notes) || [];
      o.slotKeepsakes = (slot && slot.state && slot.state.world && slot.state.world.keepsakes) || [];
    } catch (e) {
      o.fatal = String((e && e.stack) || e);
    }
    o.errors = window.__PROBE_ERRORS || [];
    emit(o);
  }

  if (document.readyState === 'complete') setTimeout(run, 120);
  else window.addEventListener('load', function () { setTimeout(run, 120); });
})();
</script>`;
html = html.replace(/<\/body>/, probe + '\n</body>');

await mkdir(DIST, { recursive: true });
await writeFile(TMP, html, 'utf8');

const SHOT = path.join(DIST, 'preview-roam.png');
const args = [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--disable-extensions',
  '--allow-file-access-from-files', '--hide-scrollbars', '--window-size=1600,900',
  '--virtual-time-budget=45000', '--screenshot=' + SHOT, '--dump-dom', pathToFileURL(TMP).href,
];

let dom = '';
try {
  const r = await exec(CHROME, args, { maxBuffer: 64 * 1024 * 1024, timeout: 120_000, encoding: 'utf8' });
  dom = r.stdout;
} catch (e) {
  if (e.stdout) dom = e.stdout;
  else { console.error(`${C.r}无法启动 Chrome（${CHROME}）${C.x}\n${e.message}`); process.exit(2); }
}

const m = dom.match(/@@PROBE@@([\s\S]*?)@@ENDPROBE@@/);
if (!m) {
  console.error(`${C.r}✗ 探针没有回传结果 —— 页面在启动阶段就崩了。${C.x}`);
  const err = dom.match(/(Uncaught[^<\n]{0,200})/g);
  if (err) console.error('  页面内异常：\n   ' + err.slice(0, 8).join('\n   '));
  process.exit(1);
}
let rep;
try { rep = JSON.parse(m[1]); } catch (e) {
  console.error(`${C.r}探针输出无法解析${C.x}\n${m[1].slice(0, 900)}`); process.exit(1);
}

const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: !!pass, detail });

check('闸门节点进入自由行动', rep.roamActive && rep.windowId === 'w1', `window=${rep.windowId}`);
check('漫游层接管画面（对话框收起）', rep.dialogueHidden && rep.roamLayerVisible && rep.hudVisible,
  `layer=${rep.roamLayerVisible} hud=${rep.hudVisible}`);
check('起点为东门且 HUD 显示主线目标', rep.startLoc === 'campus' && /四号楼/.test(rep.objText || ''),
  `loc=${rep.startLoc} 目标「${rep.objText}」`);
check('地点标签切到漫游模式', /漫游/.test(rep.placeChip || ''), rep.placeChip);
check('场景上出现人物标记', (rep.npcAtStart || []).join(',') === 'man', (rep.npcAtStart || []).join(','));
check('有事找你的人被点亮', (rep.npcBusyDots || 0) >= 1, `${rep.npcBusyDots} 个`);
check('不在目标地点时不能继续主线', rep.goDisabledAway === true, String(rep.goDisabledAway));
check('engine.lastTime 仍是实时访问器', rep.lastTimeType === 'string', rep.lastTimeType);
check('「看一看」给出地点文案', rep.lookCardVisible && (rep.lookText || '').length > 4, rep.lookText);
check('地图渲染 14 个地点', rep.mapLocs === 14, `${rep.mapLocs} 个`);
check('地图标出当前位置与主线目标', rep.mapCurrent === 1 && rep.mapStar === 1,
  `current=${rep.mapCurrent} star=${rep.mapStar}`);
check('未开放的地点可点但被拒绝', rep.mapLocked > 0 && rep.lockedRejected,
  `锁定 ${rep.mapLocked} 处`);
check('地图上有委托标记', (rep.mapQuestMarks || 0) >= 1, `${rep.mapQuestMarks} 个`);
check('旅行改变当前位置', rep.locAfterTravel === 'dorm', rep.locAfterTravel);
check('四号楼里有程野', (rep.npcAtDorm || []).indexOf('cheng') >= 0, (rep.npcAtDorm || []).join(','));
check('对话后可接下委托', rep.questAccepted && rep.questStageAfterAccept === 0,
  `stage=${rep.questStageAfterAccept}`);
check('同组的另一件就此作废（精力有限）',
  rep.siblingState === 'abandoned' && (rep.abandonedList || []).indexOf('q_sound') >= 0,
  `q_sound=${rep.siblingState} · 作废 ${JSON.stringify(rep.abandonedList || [])}`);
check('没定的那一组仍挂在那儿', (rep.undecided || []).indexOf('g_lights') >= 0,
  JSON.stringify(rep.undecided || []));
check('第二次对话才真正办事', rep.questStageAfterStep === 1 && rep.questReady === true,
  `stage=${rep.questStageAfterStep} ready=${rep.questReady}`);
check('第三次对话交差', rep.netDone === true, String(rep.netDone));
check('第一次接触已有好感累积', (rep.rapportChengAfterTalk || 0) >= 1, String(rep.rapportChengAfterTalk));

check('「看一看」顺手捡到彩蛋小物', rep.eggFound && (rep.pocketAfterEgg || 0) >= 1,
  `口袋 ${rep.pocketAfterEgg} 件`);
check('道具链 1/3：从程野手里拿到螺丝袋',
  (rep.chainTook[0] || []).indexOf('i_screw_bag') >= 0 && (rep.chainGave[0] || []).length === 0,
  `收下 ${(rep.chainTook[0] || []).join('+')}`);
check('道具链 2/3：螺丝袋交给陈姨，换回垫片和一张纸条',
  (rep.chainGave[1] || []).indexOf('i_screw_bag') >= 0 &&
  (rep.chainTook[1] || []).indexOf('i_washer') >= 0 &&
  (rep.chainTook[1] || []).indexOf('i_washer_note') >= 0,
  `交出 ${(rep.chainGave[1] || []).join('+')} → 收下 ${(rep.chainTook[1] || []).join('+')}`);
check('道具链 3/3：垫片交回程野，换回铁盒',
  (rep.chainGave[2] || []).indexOf('i_washer') >= 0 && (rep.chainTook[2] || []).indexOf('i_screw_box') >= 0,
  `交出 ${(rep.chainGave[2] || []).join('+')} → 收下 ${(rep.chainTook[2] || []).join('+')}`);
check('交出去的东西真的离开口袋',
  (rep.pocketAfterGive || []).indexOf('i_screw_bag') < 0 && (rep.pocketAfterGive || []).indexOf('i_washer') >= 0,
  (rep.pocketAfterGive || []).join(','));
check('三步走完即可交差', rep.screwReady === true, String(rep.screwReady));
check('交差后完成并入账手记', rep.questDone && (rep.notes || []).indexOf('q_screws') >= 0,
  `notes=${(rep.notes || []).join(',')}`);
check('交差换来好感上升', (rep.rapportCheng || 0) >= 3, `程野 ${rep.rapportCheng}`);

check('好感满值 → 那个人点亮「有东西要给你」', rep.giftMarkBefore === true, String(rep.giftMarkBefore));
check('好感满值 → 拿到专属留念物', rep.keepsakeReady && rep.keepsakeInPocket && rep.keepsakeItem === 'k_yan',
  `${rep.keepsakeItem}（来自 ${rep.keepsakeFrom}）`);
check('留念物只给一次，给完标记熄灭',
  rep.keepsakeOnceOnly === true && rep.giftMarkAfter === false,
  `再兑=${rep.keepsakeOnceOnly === false} 标记=${rep.giftMarkAfter}`);

check('手账记下已完成与这个月没做的',
  (rep.journalDoneRows || 0) >= 2 && (rep.journalAbandoned || 0) >= 1,
  `完成 ${rep.journalDoneRows} · 作废 ${rep.journalAbandoned} · 在场卡片 ${rep.journalQuestCards}`);
check('手账列出六个人的熟悉度', (rep.journalFaces || 0) === 6, `${rep.journalFaces} 人`);
check('手账里拿过留念物的人显示 CG', (rep.journalCgFaces || 0) >= 1, `${rep.journalCgFaces} 张`);
check('口袋分三层（任务 / 留念 / 彩蛋）', (rep.pocketSections || []).length === 3,
  JSON.stringify(rep.pocketSections || []));
check('口袋面板把每件东西都画出来', (rep.pocketCards || 0) >= 4, `${rep.pocketCards} 件`);
check('口袋按类别分开上色',
  (rep.pocketKinds || []).some((c) => /k-quest/.test(c)) &&
  (rep.pocketKinds || []).some((c) => /k-keepsake/.test(c)) &&
  (rep.pocketKinds || []).some((c) => /k-egg/.test(c)),
  (rep.pocketKinds || []).join(' '));
check('手记并进口袋的「纸片」区', (rep.notebookExtras || 0) === 2, String(rep.notebookExtras));

check('不在目标地点时不能继续主线', rep.goDisabledElsewhere === true, String(rep.goDisabledElsewhere));
check('到达目标后可继续主线', rep.goEnabledAtTarget === true, String(rep.goEnabledAtTarget));
check('还有事没定时先弹确认面板',
  rep.confirmShown === true && /尚未交差/.test(rep.confirmText || ''), rep.confirmText);
check('继续主线回到剧情节点 room0',
  rep.storyResumedId === 'room0' && rep.roamClosedAfterGo && rep.dialogueBack,
  `${rep.storyResumedId} · 对话框 ${rep.dialogueBack}`);
check('这个月的取舍写进了叙事状态', rep.flagFirst === 'room', String(rep.flagFirst));
check('存档带上世界状态（手记 / 道具 / 留念）',
  rep.slotHasWorld && (rep.slotNotes || []).indexOf('q_screws') >= 0 &&
  (rep.slotItems || []).indexOf('k_yan') >= 0 && (rep.slotKeepsakes || []).indexOf('yan') >= 0,
  `笔记 ${(rep.slotNotes || []).length} · 道具 ${(rep.slotItems || []).length} · 留念 ${(rep.slotKeepsakes || []).join(',')}`);
check('运行期无 JS 异常', (rep.errors || []).length === 0, (rep.errors || []).join(' | ') || '0 条');
check('探针自身无异常', !rep.fatal, rep.fatal || '');

const pass = checks.filter((c) => c.pass).length;
const width = Math.max(...checks.map((c) => c.name.length)) + 2;
console.log(`\n${C.b}留一盏灯 · 漫游版 —— 游戏层端到端测试${C.x}`);
console.log('─'.repeat(width + 46));
for (const c of checks) {
  const mark = c.pass ? `${C.g}✓${C.x}` : `${C.r}✗${C.x}`;
  const d = c.detail && c.detail.length > 100 ? c.detail.slice(0, 100) + '…' : c.detail;
  console.log(` ${mark} ${c.name.padEnd(width)} ${C.d}${d || ''}${C.x}`);
}
console.log('─'.repeat(width + 46));
if (pass === checks.length) console.log(`${C.g}✓ ${pass}/${checks.length} 全部通过 —— 人物、地图、委托三层都能真实跑通${C.x}\n`);
else console.log(`${C.r}✗ ${checks.length - pass} 项未通过（${pass}/${checks.length}）${C.x}\n`);

if (!process.argv.includes('--keep')) await rm(TMP, { force: true });
process.exit(pass === checks.length ? 0 : 1);
