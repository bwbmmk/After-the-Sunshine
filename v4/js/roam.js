/*!
 * 留一盏灯 · 漫游版  |  roam.js
 * 自由行动模式：场景上的人物标记、「看一看」、漫游对话框、
 * 校园地图（SVG 面板）与任务手账（委托日志）。
 * 状态与规则都在 game.js，内容在 quests.js；这里只负责呈现与输入。
 *
 * 这一版的三件新事：
 *   1. 道具会被人递来递去 —— 拿到手上有反馈，交出去也有。
 *   2. 同一组委托只能选一件 —— 选了谁，日志上会写明谁这个月没空。
 *   3. 熟到底的人会给你一件只属于你们的东西。
 */
(function (global) {
  'use strict';
  const SP = global.SP;
  const { $, h, clear } = SP;
  const Game = SP.game;

  const Roam = {
    active: false,
    windowId: null,     // 当前漫游窗口 w1..w5
    pendingNext: null,  // 继续主线时 go() 的目标节点
    convo: null,        // 当前漫游对话 { queue, seg, li }
  };

  /* ================================ 进入 / 退出 ================================ */

  function shouldGate(nodeId) {
    return !!Game.windowOf(nodeId);
  }

  function enter(nextId, restoring = false) {
    if (Roam.active) return;
    const gateId = SP.engine.state.id;
    const wid = Game.windowOf(gateId);
    if (!wid) return;
    Roam.leaveOK = false;
    Roam.active = true;
    Roam.windowId = wid;
    Roam.pendingNext = nextId;

    const w = Game.unlockWindow(wid);
    const node = SP.story.NODES[gateId] || {};
    if (!restoring && Game.LOCS[node.scene]) Game.onReach(node.scene);

    if (restoring) {
      SP.engine.stopTyping();
      SP.stage.setScene(w.loc, { time: SP.engine.lastTime || 'afternoon', weather: SP.engine.lastWeather || 'fair', transition: 'fade' });
      SP.audio.setScene(w.loc, SP.engine.lastWeather || 'fair');
    }
    SP.engine.stopAuto();
    SP.engine.auto = false;
    SP.engine.skip = false;
    SP.ui.syncModes();

    $('#dialogue').classList.add('hidden');
    $('#choices').classList.add('hidden');
    $('#roamLayer').classList.remove('hidden');
    renderHUD();
    renderScene();

    // 不再说「现在是自由时间」——接着上一段的口气往下讲
    const win = Game.WINDOWS[wid];
    if (!w.roamIntro) {
      w.roamIntro = true;
      SP.ui.toast(win.theme, 4400);
      // 第一次进漫游，把这个月「要定的事」逐件点名，免得玩家不知道该干嘛
      const left = undecidedGroups(wid);
      const msg = left.length
        ? '这个月有 ' + left.length + ' 件事要定：' + left.map((g) => Game.GROUPS[g].title).join('、')
          + '。去地图上亮着名字的地方找人聊——答应后记得完成并交差，故事才会记住这件事。'
        : '亮着名字的人都可以聊聊。';
      setTimeout(() => SP.ui.toast(msg, 6400), 1700);
    } else {
      SP.ui.toast(win.theme, 3600);
    }
    SP.engine.saveAuto();
  }

  function hide() {
    if (!Roam.active && $('#roamLayer').classList.contains('hidden')) return;
    Roam.active = false;
    closeRoamDialog();
    hideLookCard();
    $('#roamLayer').classList.add('hidden');
    $('#dialogue').classList.remove('hidden');
  }

  function reset() {
    Roam.active = false;
    Roam.windowId = null;
    Roam.pendingNext = null;
    Roam.convo = null;
    hide();
  }

  /** 这个窗口里还没定下来的互斥组 */
  function undecidedGroups(wid) {
    const w = Game.ensure();
    return Object.keys(Game.GROUPS).filter((g) => {
      if (Game.GROUPS[g].window !== wid) return false;
      return !Object.keys(Game.QUESTS).some((q) => Game.QUESTS[q].group === g && w.quests[q] && w.quests[q].done);
    });
  }

  function continueMain() {
    if (!Roam.active) return;
    const w = Game.ensure();
    const win = Game.WINDOWS[Roam.windowId];
    if (w.loc !== win.target) {
      SP.ui.toast('先去' + Game.LOCS[win.target].name + '——' + win.hint);
      return;
    }
    const left = undecidedGroups(Roam.windowId);
    if (left.length && !Roam.leaveOK) {
      confirmLeave(left);
      return;
    }
    Roam.leaveOK = false;
    const next = Roam.pendingNext;
    hide();
    SP.audio.sfx('whoosh');
    SP.engine.go(next);
  }

  /** 还有事没定时，把「没做的会怎样」说清楚，再让人决定走不走 */
  function confirmLeave(groups) {
    const names = groups.map((g) => Game.GROUPS[g].title);
    const panel = SP.ui.openPanel(h('div', {},
      SP.ui.head('先走也行', '漫游 · ' + Game.WINDOWS[Roam.windowId].title.replace(' · 自由活动', '')),
      h('p', { text: '这个月还有 ' + groups.length + ' 件事尚未交差：' + names.join('、') + '。' }),
      h('p', { text: '答应只是开始，完成并交差后才会影响接下来的主线。手上的委托会保留，但已经读过的情节不会追溯改写。' }),
      h('div', { class: 'panel-actions' },
        SP.ui.btn('我再想想', 'ghost', () => { SP.ui.closePanel(); }),
        SP.ui.btn('就这样，继续主线', 'primary', () => {
          Roam.leaveOK = true;
          SP.ui.closePanel();
          continueMain();
        }))
    ), { mode: 'roam-confirm' });
    return panel;
  }

  /* ================================= 场景标记 ================================= */

  function renderScene() {
    const layer = $('#npcLayer');
    clear(layer);
    if (!Roam.active) return;
    const w = Game.ensure();
    const wid = Roam.windowId;

    for (const npcId of Game.npcsHere(w.loc, wid)) {
      const spot = Game.npcAt(npcId, wid);
      const def = Game.NPCS[npcId];
      const busy = Game.npcHasBusiness(npcId, wid);
      const gift = !!Game.keepsakeFor(npcId);
      layer.append(
        h('button.npc-spot', {
          type: 'button',
          // h() 只解析 .class 片段，额外类名必须走 attrs
          class: (busy ? 'busy ' : '') + (gift ? 'gift' : ''),
          data: { npc: npcId },
          style: { left: spot.x + '%', top: spot.y + '%' },
          title: def.name,
          onclick: () => openRoamDialog(npcId),
        },
          h('span.npc-face', { html: SP.character.build(npcId, 'calm') }),
          h('span.npc-name', { text: def.name + (def.phone ? ' · 电话' : '') }),
          gift ? h('span.npc-gift') : (busy ? h('span.npc-dot') : null)
        )
      );
    }

    // 「看一看」热点
    const look = $('#lookSpot');
    if (Game.LOCS[w.loc]) {
      look.classList.remove('hidden');
      look.textContent = '✦ 看看这里';
      look.onclick = () => doObserve();
    } else {
      look.classList.add('hidden');
    }
    updatePlaceChip();
  }

  function updatePlaceChip() {
    const w = Game.ensure();
    const chip = $('#placeChip');
    if (chip && Roam.active && w.loc && Game.LOCS[w.loc]) {
      chip.textContent = '漫游 · ' + Game.LOCS[w.loc].name;
    }
  }

  function doObserve() {
    if (!Roam.active) return;
    const w = Game.ensure();
    const r = Game.onObserve(w.loc, Roam.windowId);
    SP.audio.sfx('click');
    showLookCard(Game.LOCS[w.loc].name, r.text);
    if (r.hit && r.hit.length) {
      for (const res of r.hit) {
        announceItems(res);
        SP.ui.toast('委托推进：《' + Game.QUESTS[res.qid].title + '》', 3000);
      }
    }
    if (r.egg) {
      const d = Game.itemDef(r.egg);
      if (d) {
        SP.audio.sfx('unlock');
        SP.ui.toast('角落里有个东西：《' + d.name + '》', 3600);
        flyItem(r.egg, 'in');
        flightPocket();
      }
    }
    renderHUD();
    SP.engine.saveAuto();
  }

  function showLookCard(title, text) {
    let card = $('#lookCard');
    if (!card) {
      card = h('div.look-card', { id: 'lookCard', class: 'hidden' });
      $('#roamLayer').append(card);
    }
    clear(card);
    card.append(
      h('div.look-title', { text: title }),
      h('p.look-text', { text })
    );
    card.classList.remove('hidden');
    card.onclick = () => hideLookCard();
  }

  function hideLookCard() {
    const card = $('#lookCard');
    if (card) card.classList.add('hidden');
  }

  /* ================================ 道具反馈 ================================ */

  /**
   * 一件东西被收下 / 被交出去时的那点动静。
   * 不是装饰：口袋从前只装纸片，现在装的是别人递过来的东西，
   * 得让人看见它确实进了口袋、也确实交出去了。
   */
  function flyItem(itemId, dir) {
    const d = Game.itemDef(itemId);
    if (!d) return;
    const layer = $('#roamLayer');
    if (!layer) return;
    const el = h('div.item-fly', {
      class: 'item-fly ' + (dir === 'out' ? 'out' : 'in'),
      text: d.icon + '　' + d.name,
    });
    layer.append(el);
    setTimeout(() => el.remove(), 1100);
  }

  function flightPocket() {
    const btn = $('#pocketBtn');
    if (!btn) return;
    btn.classList.remove('bump');
    void btn.offsetWidth;
    btn.classList.add('bump');
    setTimeout(() => btn.classList.remove('bump'), 700);
  }

  /** 结算结果 → 提示（收下了什么、交出了什么） */
  function announceItems(res) {
    if (!res) return;
    const took = res.took || [], gave = res.gave || [];
    gave.forEach((id, i) => {
      const d = Game.itemDef(id);
      if (d) setTimeout(() => { SP.ui.toast('把《' + d.name + '》交了出去', 3000); flyItem(id, 'out'); }, i * 260);
    });
    took.forEach((id, i) => {
      const d = Game.itemDef(id);
      if (d) setTimeout(() => {
        SP.ui.toast('收进口袋：《' + d.name + '》', 3200);
        flyItem(id, 'in');
        flightPocket();
      }, 220 + i * 300);
    });
    if (took.length) setTimeout(() => SP.audio.sfx('click'), 240);
  }

  /** 好感度变化 → 一句看得见的反馈（几颗心，走到哪一档） */
  function announceRapport(npcId) {
    const name = (Game.NPCS[npcId] || {}).name || '';
    if (!name) return;
    const w = Game.ensure();
    const r = w.rapport[npcId] || 0;
    const dots = '●'.repeat(r) + '○'.repeat(Math.max(0, Game.RAPPORT_MAX - r));
    // 留念物已经拿过的，不再提示「还有东西要给你」
    const tail = (r >= Game.RAPPORT_MAX && !w.keepsakes.includes(npcId))
      ? '　——　他/她好像还有东西要给你' : '';
    SP.ui.toast('和' + name + '更熟了一点　' + dots + tail, 3200);
  }

  /* ================================= 漫游 HUD ================================ */

  function renderHUD() {
    if (!Roam.active) return;
    const w = Game.ensure();
    const win = Game.WINDOWS[Roam.windowId];
    const here = w.loc === win.target;
    const activeQ = Object.keys(w.quests || {}).filter((q) => w.quests[q] && !w.quests[q].done);
    const readyQ = activeQ.filter((q) => Game.questReadyToTurnIn(q));

    $('#roamObjText').textContent = win.hint + (here ? ' ——就是这里' : '');
    const go = $('#roamGoBtn');
    go.disabled = !here;
    go.textContent = here ? '继续主线 →' : '去' + Game.LOCS[win.target].name + '继续主线';

    const bits = [];
    if (activeQ.length) bits.push('手上 ' + activeQ.length + ' 件');
    if (readyQ.length) bits.push(readyQ.length + ' 件可交差');
    const left = undecidedGroups(Roam.windowId).length;
    if (left) bits.push(left + ' 件要定（找亮名字的人）');
    $('#roamQuestCount').textContent = bits.length ? bits.join(' · ') : '这个月的事都办完了';

    const btn = $('#pocketBtn');
    if (btn) btn.textContent = '▤ 口袋 ' + Game.ownedItems().length;
  }

  /* ================================= 漫游对话 ================================= */

  function conversationQueue(npcId) {
    const wid = Roam.windowId;
    const w = Game.ensure();
    const spot = Game.npcAt(npcId, wid);
    const first = Game.onTalk(npcId, wid);   // 打招呼：好感 +1（每窗口一次）
    const q = [];

    // 熟到底了：先把那件只属于你们的东西给你
    const keep = Game.keepsakeFor(npcId);
    if (keep) q.push({ kind: 'keepsake', npc: npcId, lines: keep.lines, item: keep.item });

    for (const qid of Game.readyQuestsFor(npcId)) {
      q.push({ kind: 'turnin', qid, lines: Game.QUEST_LINES[qid].done });
    }
    for (const qid of Game.stepQuestsFor(npcId)) {
      const step = Game.currentStep(qid);
      q.push({ kind: 'step', qid, lines: Game.stepLines(qid, w.quests[qid].stage), step });
    }
    // 一次对话最多抛出一件新委托——一件说清楚了，再谈下一件
    const offers = Game.questsOfferable(npcId, wid);
    if (offers.length) {
      const qid = offers[0];
      const QD = Game.QUESTS[qid];
      q.push({
        kind: 'offer', qid, lines: Game.QUEST_LINES[qid].offer,
        acceptLines: Game.QUEST_LINES[qid].accept, group: QD.group || null,
      });
    }
    if (!q.length) {
      const lines = (first && spot.greet) ? spot.greet : Game.npcAgain(npcId, wid);
      q.push({ kind: 'chat', lines: lines.length ? lines : (spot.greet || []) });
    } else if (first && spot.greet) {
      q.unshift({ kind: 'chat', lines: [spot.greet[0]] });
    }
    return q;
  }

  function openRoamDialog(npcId) {
    if (Roam.convo) return;
    SP.audio.sfx('click');
    const def = Game.NPCS[npcId];
    Roam.convo = { npc: npcId, queue: conversationQueue(npcId), seg: 0, li: 0 };
    const dlg = $('#roamDialog');
    clear(dlg);
    dlg.append(
      h('div.rd-face', { html: SP.character.build(npcId, 'calm') }),
      h('div.rd-main', {},
        h('div.rd-name', { text: def.name + (def.phone ? ' · 电话' : '') }),
        h('p.rd-text', { id: 'rdText' }),
        h('div.rd-choices', { id: 'rdChoices' }),
        h('div.rd-foot', {},
          h('span.rd-hint', { text: '点击继续' }),
          h('button.rd-next', { type: 'button', id: 'rdNext', text: '继续 ▾' })
        )
      )
    );
    $('#rdNext').onclick = stepDialog;
    dlg.classList.remove('hidden');
    paintDialogLine();
    SP.engine.saveAuto(); // 首次寒暄获得的熟悉度也要持久化
    renderScene(); // busy 标记可能变化（打过招呼了）
  }

  /* 一行台词可以是一句话（说话人 = 当前对话对象），
   * 也可以是自己排好段的分段数组 —— 和主线正文用同一套 .seg-* 排版。 */
  function lineSegs(line, npcId) {
    const who = (Game.NPCS[npcId] || {}).name || '';
    if (Array.isArray(line)) {
      return line.map((x) => ({
        k: x && x.k === 'n' ? 'n' : (x && x.k === 'i' ? 'i' : 'd'),
        w: (x && x.w) || undefined,
        s: String((x && x.s) != null ? x.s : ''),
      })).filter((x) => x.s !== '');
    }
    return [{ k: 'd', w: who, s: String(line == null ? '' : line) }];
  }

  function paintDialogLine() {
    const c = Roam.convo;
    if (!c) return;
    const seg = c.queue[c.seg];
    const line = seg ? seg.lines[c.li] : '';
    const el = $('#rdText');
    clear(el);
    const list = lineSegs(line, c.npc);
    list.forEach((sg) => {
      const sp = document.createElement('span');
      sp.className = 'seg seg-' + sg.k;
      if (sg.w) sp.setAttribute('data-who', sg.w);
      sp.textContent = sg.s;
      el.appendChild(sp);
    });
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
    paintDialogFace();
    const next = $('#rdNext');
    if (next) {
      next.style.display = '';
      next.textContent = seg && c.li < seg.lines.length - 1 ? '继续 ▾' : (c.seg < c.queue.length - 1 ? '继续 ▾' : '合上 ✓');
    }
  }

  /** 留念物时刻：把 SVG 小头像换成那张只属于你们的 CG */
  function paintDialogFace() {
    const c = Roam.convo;
    if (!c) return;
    const face = document.querySelector('#roamDialog .rd-face');
    if (!face) return;
    const seg = c.queue[c.seg];
    const cg = seg && seg.kind === 'keepsake' && SP.cg && SP.cg[c.npc];
    if (cg && !face.classList.contains('cg')) {
      face.classList.add('cg');
      clear(face);
      face.append(h('img', { src: cg, alt: (Game.NPCS[c.npc] || {}).name || '' }));
    } else if (!cg && face.classList.contains('cg')) {
      face.classList.remove('cg');
      clear(face);
      face.append(h('span', { html: SP.character.build(c.npc, 'calm') }));
    }
  }

  function stepDialog() {
    const c = Roam.convo;
    if (!c) return;
    const seg = c.queue[c.seg];
    if (!seg) { closeRoamDialog(); return; }
    const box = $('#rdChoices');
    if (box && box.children.length) return;            // 选项待选，「继续」先不作数
    if (c.li < seg.lines.length - 1) {
      c.li++;
      SP.audio.sfx('hover');
      paintDialogLine();
      return;
    }
    if (seg.kind === 'offer' && !seg.offered) {        // 台词放完 → 给出「答应 / 先不了」
      seg.offered = true;
      showOfferChoices(seg);
      return;
    }
    applySegment(seg);
    if (c.seg < c.queue.length - 1) {
      c.seg++;
      c.li = 0;
      paintDialogLine();
      return;
    }
    closeRoamDialog();
  }

  function applySegment(seg) {
    if (!seg) return;
    if (seg.kind === 'turnin') {
      const r = Game.complete(seg.qid);
      if (r) {
        SP.ui.toast('收进口袋：《' + r.note.title + '》', 3600);
        announceRapport(r.rapport);
        if (r.group) SP.ui.toast('《' + Game.GROUPS[r.group].title + '》这件事，就按这个走下去了', 3600);
        renderHUD();
        SP.engine.syncWorldFlags();
        SP.engine.saveAuto();
      } else {
        // 只是把「同一组里已经选了别的」说清楚
        SP.ui.toast('已经交差了', 2000);
      }
    } else if (seg.kind === 'step') {
      const r = Game.advance(seg.qid);
      if (r) {
        announceItems(r);
        const step = Game.currentStep(seg.qid);
        if (step) SP.ui.toast('下一步：' + step.desc, 4200);
        else SP.ui.toast('《' + Game.QUESTS[seg.qid].title + '》可以交差了', 3600);
      }
      renderHUD();
      renderScene();
      SP.engine.saveAuto();
    } else if (seg.kind === 'keepsake') {
      const r = Game.takeKeepsake(seg.npc);
      if (r) {
        SP.audio.sfx('keepsake');
        SP.ui.toast('收进口袋：《' + r.def.name + '》', 4200);
        setTimeout(() => SP.ui.toast('这件东西只给了你一个人', 3200), 900);
        flyItem(r.item, 'in');
        flightPocket();
        renderHUD();
        renderScene();
        SP.engine.saveAuto();
      }
    }
  }

  /** offer 段落放完台词后展示的两个选项 */
  function showOfferChoices(seg) {
    const box = $('#rdChoices');
    clear(box);
    // 互斥提示：同一组里接了这件，另外几件这个月就来不及了
    if (seg.group) {
      const sibs = Object.keys(Game.QUESTS)
        .filter((q) => q !== seg.qid && Game.QUESTS[q].group === seg.group && Game.questState(q) === 'offer');
      if (sibs.length) {
        box.append(h('p.rd-groupnote', {
          text: '〔' + Game.GROUPS[seg.group].title + '〕' + Game.GROUPS[seg.group].blurb
            + '　答应这件，' + sibs.map((q) => '《' + Game.QUESTS[q].title + '》').join('、')
            + '这个月就做不了了——完成并交差后，主线才会按这件事往下走。',
        }));
      }
    }
    box.append(
      h('button.rd-choice.primary', { type: 'button', text: '答应下来' }),
      h('button.rd-choice.ghost', { type: 'button', text: '先不了' })
    );
    $('#rdNext').style.display = 'none';
    const [yes, no] = box.querySelectorAll('button.rd-choice');
    yes.onclick = () => {
      const r = Game.accept(seg.qid);
      clear(box);
      SP.audio.sfx('choice');
      if (r && r.group) {
        const sibs = Object.keys(Game.QUESTS).filter((q) => q !== seg.qid && Game.QUESTS[q].group === r.group);
        if (sibs.length) {
          const names = sibs.map((q) => Game.NPCS[Game.QUESTS[q].giver].name).join('、');
          SP.ui.toast('你把这个月的时间给了这边——' + names + '那边，只能等下次了', 4800);
        }
      }
      // 接完立刻告诉玩家第一步去哪——别让人拿着委托发愣
      const step0 = Game.currentStep(seg.qid);
      if (step0) setTimeout(() => SP.ui.toast('下一步：' + step0.desc, 4600), 1400);
      seg.kind = 'chat';
      seg.lines = seg.acceptLines || [];
      Roam.convo.li = 0;
      Roam.convo.queue = Roam.convo.queue.slice(0, Roam.convo.seg + 1);
      $('#rdNext').style.display = '';
      paintDialogLine();
      renderHUD();
      renderScene();
      SP.engine.saveAuto();
    };
    no.onclick = () => {
      SP.audio.sfx('hover');
      clear(box);
      SP.ui.toast('这件事先留着，听听还有什么事。', 2400);
      const c = Roam.convo;
      if (c && c.seg < c.queue.length - 1) { c.seg++; c.li = 0; paintDialogLine(); }
      else closeRoamDialog();
    };
  }

  function closeRoamDialog() {
    Roam.convo = null;
    const dlg = $('#roamDialog');
    if (dlg) dlg.classList.add('hidden');
  }

  /* ================================== 旅行 ================================== */

  function travel(loc) {
    if (!Game.LOCS[loc]) return;
    const w = Game.ensure();
    if (!w.unlocked.includes(loc)) {
      const wid = unlockWindowFor(loc);
      SP.ui.toast('还没去过——' + (wid ? Game.WINDOWS[wid].title.replace(' · 自由活动', '') + '以后才开放' : '暂时去不了'), 2800);
      return;
    }
    if (!Roam.active) {
      SP.ui.toast('故事进行中，这一段先看完再自由活动', 2600);
      return;
    }
    if (loc === w.loc) { SP.ui.closePanel(); return; }
    const hit = Game.onReach(loc);
    SP.audio.sfx('whoosh');
    SP.stage.setScene(loc, {
      time: SP.engine.lastTime || 'afternoon',
      weather: SP.engine.lastWeather || 'fair',
      transition: 'fade',
    });
    SP.audio.setScene(loc, SP.engine.lastWeather || 'fair');
    closeRoamDialog();
    hideLookCard();
    SP.ui.closePanel();
    renderScene();
    renderHUD();
    for (const res of hit) {
      announceItems(res);
      SP.ui.toast('委托推进：《' + Game.QUESTS[res.qid].title + '》', 3000);
    }
    SP.engine.saveAuto();
  }

  function unlockWindowFor(loc) {
    for (const wid of ['w2', 'w3', 'w4', 'w5']) {
      if (Game.WINDOWS[wid].unlocks.includes(loc)) return wid;
    }
    return null;
  }

  /* ================================== 地图 ================================== */

  function locQuestMark(loc) {
    if (!Roam.active) return null;
    const wid = Roam.windowId;
    const w = Game.ensure();
    let mark = null;
    for (const qid in w.quests) {
      const q = w.quests[qid];
      if (q.done) continue;
      const Q = Game.QUESTS[qid];
      if (q.stage >= Q.steps.length) {
        if (Game.npcAt(Q.giver, wid) && Game.npcAt(Q.giver, wid).loc === loc) mark = 'turnin';
      } else {
        const step = Q.steps[q.stage];
        if (step && ((step.at === loc) || (step.type === 'talk' && Game.npcAt(step.npc, wid) && Game.npcAt(step.npc, wid).loc === loc))) mark = 'step';
      }
    }
    if (!mark) {
      for (const qid in Game.QUESTS) {
        if (Game.QUESTS[qid].window !== wid) continue;
        if (Game.questState(qid) !== 'offer') continue;
        const spot = Game.npcAt(Game.QUESTS[qid].giver, wid);
        if (spot && spot.loc === loc) { mark = 'offer'; break; }
      }
    }
    if (!mark) {
      for (const npcId in Game.NPCS) {
        if (!Game.keepsakeFor(npcId)) continue;
        const spot = Game.npcAt(npcId, wid);
        if (spot && spot.loc === loc) { mark = 'gift'; break; }
      }
    }
    return mark;
  }

  function mapSVG() {
    const w = Game.ensure();
    const target = Roam.active ? Game.WINDOWS[Roam.windowId].target : null;
    const roadD = Game.LOC_ROADS.map(([a, b]) => {
      const A = Game.LOCS[a], B = Game.LOCS[b];
      return `M${A.x} ${A.y} L${B.x} ${B.y}`;
    }).join(' ');
    const trees = [[160, 380], [178, 366], [200, 344], [222, 330], [246, 310], [268, 296]]
      .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4.5" class="map-tree"/>`).join('');

    let out = `<svg viewBox="0 0 720 520" class="map-svg" role="img" aria-label="校园地图">
      <rect x="8" y="8" width="704" height="504" rx="18" class="map-frame"/>
      <text x="30" y="40" class="map-title">校园导览</text>
      <g transform="translate(676 44)"><circle r="16" class="map-compass"/><path d="M0 -11 L4 6 L0 2 L-4 6 Z" class="map-needle"/><text y="30" class="map-n">北</text></g>
      <path d="${roadD}" class="map-road"/>
      <ellipse cx="540" cy="428" rx="86" ry="44" class="map-lake"/>
      <ellipse cx="540" cy="428" rx="60" ry="28" class="map-lake2"/>
      <text x="540" y="432" class="map-lake-label" text-anchor="middle">湖</text>
      <ellipse cx="612" cy="88" rx="58" ry="36" transform="rotate(-16 612 88)" class="map-track"/>
      ${trees}`;

    for (const id in Game.LOCS) {
      const L = Game.LOCS[id];
      const unlocked = w.unlocked.includes(id);
      const current = w.loc === id;
      const isTarget = target === id;
      const mark = locQuestMark(id);
      const eggLeft = L.egg && !w.items.includes(L.egg);
      const shape = id === 'track'
        ? `<ellipse cx="0" cy="0" rx="26" ry="17" class="loc-box"/>`
        : id === 'lake'
          ? `<path d="M-20 8 Q-16 -12 6 -10 Q24 -8 22 6 Q18 16 -2 14 Z" class="loc-box"/>`
          : `<rect x="-24" y="-16" width="48" height="32" rx="7" class="loc-box" transform="rotate(${(L.x % 3) - 1})"/>`;
      let markers = '';
      if (current) markers += `<circle cx="0" cy="0" r="30" class="loc-ring"/><circle cx="0" cy="0" r="5" class="loc-dot"/>`;
      if (eggLeft && unlocked) markers += `<circle cx="-22" cy="-20" r="4" class="loc-egg"/>`;
      if (mark) markers += `<rect x="18" y="-24" width="10" height="10" class="loc-qmark loc-qmark-${mark}" transform="rotate(45 23 -19)"/>`;
      if (isTarget) markers += `<path d="M0 -34 l4.5 9 10 1.5 -7 7 1.6 10 -9.1 -4.8 -9.1 4.8 1.6 -10 -7 -7 10 -1.5 Z" class="loc-star"/>`;
      out += `<g class="loc ${unlocked ? '' : 'locked'} ${current ? 'current' : ''}" data-loc="${id}" transform="translate(${L.x} ${L.y})" tabindex="0" role="button" aria-label="${L.name}${unlocked ? '' : '（未开放）'}">
        ${shape}${markers}<text y="34" text-anchor="middle" class="loc-name">${L.name}</text></g>`;
    }
    out += '</svg>';
    return out;
  }

  function openMap() {
    if (SP.ui.isPanelOpen()) return;
    const w = Game.ensure();
    const win = Roam.active ? Game.WINDOWS[Roam.windowId] : null;
    const wrap = h('div', {},
      h('div.map-svg-wrap', { html: mapSVG() }),
      h('div.map-legend', {},
        h('span', { html: '<i class="lg lg-cur"></i>你在这里' }),
        h('span', { html: '<i class="lg lg-q"></i>有委托或有人找你' }),
        h('span', { html: '<i class="lg lg-star"></i>主线目标' }),
        h('span', { html: '<i class="lg lg-egg"></i>还有没捡到的小东西' }),
        h('span', { html: '<i class="lg lg-lock"></i>还没开放' })
      ),
      h('p.map-note', {
        text: win
          ? '点击开放的地方即可前往' + (win ? '；带 ★ 的是主线目标：' + win.hint : '')
          : '现在正在看故事——章节之间可以自由活动，到时候再到处走走。',
      })
    );
    const panel = SP.ui.openPanel(h('div', {},
      SP.ui.head('校园地图', Roam.active ? Game.WINDOWS[Roam.windowId].title : '自由行动'),
      wrap), { wide: true, mode: 'map' });
    panel.querySelectorAll('.loc').forEach((el) => {
      const go = () => travel(el.dataset.loc);
      el.addEventListener('click', go);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
    SP.audio.sfx('click');
  }

  /* ================================= 任务手账 ================================= */

  const STATE_LABEL = {
    active: '进行中', ready: '可以交差', done: '已完成', abandoned: '这个月没空', locked: '还没到时候',
  };

  function questCard(qid, w) {
    const Q = Game.QUESTS[qid];
    const st = w.quests[qid];
    const state = Game.questState(qid);
    // 一件 step 可能同时收下/交出好几样东西，所以这里得把数组摊开
    const namesOf = (v) => (v == null ? '' : (Array.isArray(v) ? v : [v])
      .map((id) => (Game.itemDef(id) || {}).name || id).join('、'));
    const items = [];
    if (st) {
      Q.steps.forEach((s, i) => {
        const done = i < st.stage;
        const now = i === st.stage;
        items.push(h('li.q-step', { class: done ? 'done' : now ? 'now' : null },
          h('span.q-mark', { text: done ? '✓' : now ? '●' : '○' }),
          h('span', { text: s.desc }),
          s.take ? h('em.q-item', { text: '＋' + namesOf(s.take) }) : null,
          s.give ? h('em.q-item.out', { text: '－' + namesOf(s.give) }) : null
        ));
      });
      items.push(h('li.q-step', { class: state === 'ready' ? 'now' : (st.done ? 'done' : null) },
        h('span.q-mark', { text: st.done ? '✓' : state === 'ready' ? '★' : '○' }),
        h('span', { text: '回去找' + Game.NPCS[Q.giver].name })
      ));
    } else {
      items.push(h('li.q-step', {},
        h('span.q-mark', { text: '·' }),
        h('span', { text: Q.hint })
      ));
    }
    return h('article.q-card', { class: state === 'ready' ? 'ready' : (state === 'abandoned' ? 'abandoned' : null) },
      h('div.q-title-row', {},
        h('h3', { text: Q.title }),
        state === 'ready' ? h('span.q-badge', { text: '可以交差' })
          : state === 'abandoned' ? h('span.q-badge.off', { text: '这个月没空' })
            : null
      ),
      h('div.q-from', { text: Game.NPCS[Q.giver].name + ' 拜托的事' + (Q.group ? ' · ' + Game.GROUPS[Q.group].title : '') }),
      h('ul.q-steps', {}, ...items)
    );
  }

  function openJournal() {
    if (SP.ui.isPanelOpen()) return;
    const w = Game.ensure();
    const wid = Roam.windowId;
    const active = [], ready = [], abandoned = [];
    for (const qid in w.quests) {
      const st = w.quests[qid];
      if (st.done) continue;
      if (st.stage >= Game.QUESTS[qid].steps.length) ready.push(qid);
      else active.push(qid);
    }
    const done = w.notes.slice();
    if (wid) abandoned.push(...Game.abandonedQuests(wid));
    const offers = wid ? Object.keys(Game.QUESTS).filter((qid) =>
      Game.QUESTS[qid].window === wid && Game.questState(qid) === 'offer') : [];

    const left = wid ? undecidedGroups(wid) : [];
    const main = Roam.active
      ? h('div.j-main', {},
        h('div.eyebrow', { text: '主线' }),
        h('p', { text: Game.WINDOWS[wid].hint + '（地图上标 ★ 的地方）' }),
        left.length
          ? h('p', { class: 'j-sub', text: '还没定的事 ' + left.length + ' 件：' + left.map((g) => Game.GROUPS[g].title).join('、')
              + '。去找地图上亮名字的人，答应谁，就定了哪件。' })
          : null)
      : h('div.j-main', {},
        h('div.eyebrow', { text: '主线' }),
        h('p', { text: '故事进行中——到章节之间的自由活动时间，再来翻这一页。' }));

    const offerList = offers.length
      ? h('div.j-section', {},
        h('h2', { text: '听说的事 ' + offers.length }),
        h('p.j-sub', { text: '这些人有事想找你。带〔 〕的是同一件事的两三种做法，互斥：答应一件，其余这个月就来不及了——主线会记住你选了哪件。' }),
        ...offers.map((qid) => {
          const Q = Game.QUESTS[qid];
          return h('div.j-rumor', { class: Q.group ? 'grouped' : null },
            h('span', { text: '……' + Q.hint }),
            h('em', { text: '（找 ' + Game.NPCS[Q.giver].name + '）' }),
            Q.group ? h('em.j-group', { text: '〔' + Game.GROUPS[Q.group].title + '〕' }) : null);
        }))
      : null;

    const people = h('div.j-people', {},
      h('h2', { text: '熟悉的人' }),
      h('div.j-faces', {},
        ...Object.keys(Game.NPCS).map((npcId) => {
          const r = w.rapport[npcId] || 0;
          const full = r >= Game.RAPPORT_MAX;
          const hasCg = w.keepsakes.includes(npcId) && SP.cg && SP.cg[npcId];
          return h('div.j-face', { class: full ? 'full' : null },
            hasCg
              ? h('span.face.cg', {}, h('img', { src: SP.cg[npcId], alt: Game.NPCS[npcId].name }))
              : h('span.face', { html: SP.character.build(npcId, 'calm') }),
            h('b', { text: Game.NPCS[npcId].name }),
            h('span.dots', { text: '●'.repeat(r) + '○'.repeat(Game.RAPPORT_MAX - r) }),
            full ? h('span.j-full', { text: w.keepsakes.includes(npcId) ? '留念已收' : '有东西要给你' }) : null);
        })));

    SP.ui.openPanel(h('div', {},
      SP.ui.head('任务手账', '漫游 · 委托与手记'),
      main,
      h('div.j-section', {},
        h('h2', { text: '手上的委托 ' + (active.length + ready.length) }),
        active.length || ready.length
          ? h('div.j-quests', {},
            ...ready.map((qid) => questCard(qid, w)),
            ...active.map((qid) => questCard(qid, w)))
          : h('p.j-sub', { text: '暂时没有。地图上亮着的名字，也许正在等你说一句“好的”。' })),
      abandoned.length
        ? h('div.j-section.off', {},
          h('h2', { text: '这个月没做的 ' + abandoned.length }),
          h('p.j-sub', { text: '同一件事你选了别人那一头。这些不会再来。' }),
          h('ul.j-done.off', {}, ...abandoned.map((qid) => h('li', {},
            h('span', { text: '· ' + Game.QUESTS[qid].title }),
            h('em', { text: Game.NPCS[Game.QUESTS[qid].giver].name })))))
        : null,
      offerList,
      h('div.j-section', {},
        h('h2', { text: '已完成 ' + done.length + ' / ' + Object.keys(Game.NOTES).length }),
        done.length
          ? h('ul.j-done', {}, ...done.map((qid) => h('li', {},
            h('span', { text: '✓ ' + Game.QUESTS[qid].title }),
            h('em', { text: Game.NOTES[qid].date }))))
          : h('p.j-sub', { text: '从一件小事开始，也挺好。' })),
      people), { wide: true, mode: 'journal' });
    SP.audio.sfx('click');
  }

  /* ================================== 导出 ================================== */

  SP.roam = {
    snapshot: () => Roam.active ? { next: Roam.pendingNext, windowId: Roam.windowId } : null,
    enter, hide, reset, shouldGate, continueMain,
    travel, openMap, openJournal,
    renderHUD, renderScene, updatePlaceChip, undecidedGroups,
    // 给外壳（安卓返回键、桌面窗口）留的收口：先合对话，再收热点
    closeDialogue: closeRoamDialog,
    closeLook: hideLookCard,
    active: () => Roam.active,
    windowId: () => Roam.windowId,
  };
})(window);
