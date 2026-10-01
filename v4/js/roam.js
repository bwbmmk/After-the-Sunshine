/*!
 * 留一盏灯 · 漫游版  |  roam.js
 * 自由行动模式：场景上的人物标记、「看一看」、漫游对话框、
 * 校园地图（SVG 面板）与任务手账（委托日志）。
 * 状态与规则都在 game.js；这里只负责呈现与输入。
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

  function enter(nextId) {
    if (Roam.active) return;
    const gateId = SP.engine.state.id;
    const wid = Game.windowOf(gateId);
    if (!wid) return;
    Roam.active = true;
    Roam.windowId = wid;
    Roam.pendingNext = nextId;

    const w = Game.unlockWindow(wid);
    const node = SP.story.NODES[gateId] || {};
    if (Game.LOCS[node.scene]) Game.onReach(node.scene);

    SP.engine.stopAuto();
    SP.engine.auto = false;
    SP.engine.skip = false;
    SP.ui.syncModes();

    $('#dialogue').classList.add('hidden');
    $('#choices').classList.add('hidden');
    $('#roamLayer').classList.remove('hidden');
    renderHUD();
    renderScene();

    if (!w.roamIntro) {
      w.roamIntro = true;
      SP.ui.toast('现在是自由时间——点右上角「地图」可以在校园里走动', 4200);
      setTimeout(() => SP.ui.toast('亮着名字的人都可以聊聊，也许有人有事找你', 4200), 1500);
    } else {
      const offers = Object.keys(Game.QUESTS).filter((qid) =>
        Game.QUESTS[qid].window === wid && !(w.quests[qid]));
      if (offers.length) SP.ui.toast('这个月，好像有人有事想找你帮忙', 3200);
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

  function continueMain() {
    if (!Roam.active) return;
    const w = Game.ensure();
    const win = Game.WINDOWS[Roam.windowId];
    if (w.loc !== win.target) {
      SP.ui.toast('先去' + Game.LOCS[win.target].name + '——' + win.hint);
      return;
    }
    const next = Roam.pendingNext;
    hide();
    SP.audio.sfx('whoosh');
    SP.engine.go(next);
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
      layer.append(
        h('button.npc-spot', {
          type: 'button',
          class: busy ? 'busy' : null,     // h() 只解析 .class 片段，额外类名必须走 attrs
          data: { npc: npcId },
          style: { left: spot.x + '%', top: spot.y + '%' },
          title: def.name,
          onclick: () => openRoamDialog(npcId),
        },
          h('span.npc-face', { html: SP.character.build(npcId, 'calm') }),
          h('span.npc-name', { text: def.name + (def.phone ? ' · 电话' : '') }),
          busy ? h('span.npc-dot') : null
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
    for (const qid of r.hit) {
      SP.ui.toast('委托推进：《' + Game.QUESTS[qid].title + '》', 3000);
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

  /* ================================= 漫游 HUD ================================ */

  function renderHUD() {
    if (!Roam.active) return;
    const w = Game.ensure();
    const win = Game.WINDOWS[Roam.windowId];
    const here = w.loc === win.target;
    const activeQ = Object.keys(w.quests || {}).filter((q) => w.quests[q] && !w.quests[q].done);

    $('#roamObjText').textContent = win.hint + (here ? ' ——就是这里' : '');
    const go = $('#roamGoBtn');
    go.disabled = !here;
    go.textContent = here ? '继续主线 →' : '去' + Game.LOCS[win.target].name + '继续主线';
    $('#roamQuestCount').textContent = activeQ.length
      ? '委托进行中 ' + activeQ.length + (Game.readyQuestsFor ? ' · 有可交差的' : '')
      : '没有进行中的委托';
    const btn = $('#pocketBtn');
    if (btn) btn.textContent = '▤ 口袋 ' + ((SP.engine.state.memories || []).length + w.notes.length);
  }

  /* ================================= 漫游对话 ================================= */

  function conversationQueue(npcId) {
    const wid = Roam.windowId;
    const w = Game.ensure();
    const def = Game.NPCS[npcId];
    const spot = Game.npcAt(npcId, wid);
    const first = Game.onTalk(npcId, wid);   // 打招呼：好感 +1（每窗口一次）
    const q = [];

    for (const qid of Game.readyQuestsFor(npcId)) {
      q.push({ kind: 'turnin', qid, lines: Game.QUEST_LINES[qid].done });
    }
    for (const qid of Game.stepQuestsFor(npcId, wid)) {
      q.push({ kind: 'step', qid, lines: Game.QUEST_LINES[qid].step });
    }
    for (const qid of Game.questsOfferable(npcId, wid)) {
      q.push({ kind: 'offer', qid, lines: Game.QUEST_LINES[qid].offer, acceptLines: Game.QUEST_LINES[qid].accept });
    }
    if (!q.length) {
      const lines = (first && spot.greet) ? spot.greet : (spot.again || spot.greet || []);
      q.push({ kind: 'chat', lines });
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
    const next = $('#rdNext');
    if (next) {
      next.style.display = '';
      next.textContent = seg && c.li < seg.lines.length - 1 ? '继续 ▾' : (c.seg < c.queue.length - 1 ? '继续 ▾' : '合上 ✓');
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
        SP.ui.toast('和' + Game.NPCS[r.rapport].name + '更熟了一点', 2600);
        renderHUD();
        SP.engine.saveAuto();
      }
    } else if (seg.kind === 'step') {
      Game.advance(seg.qid);
      renderHUD();
      SP.engine.saveAuto();
    }
  }

  /** offer 段落放完台词后展示的两个选项 */
  function showOfferChoices(seg) {
    const box = $('#rdChoices');
    clear(box);
    box.append(
      h('button.rd-choice.primary', { type: 'button', text: '答应下来' }),
      h('button.rd-choice.ghost', { type: 'button', text: '先不了' })
    );
    $('#rdNext').style.display = 'none';
    const [yes, no] = box.querySelectorAll('button');
    yes.onclick = () => {
      Game.accept(seg.qid);
      clear(box);
      SP.audio.sfx('choice');
      // 接下之后的补充台词，续在同一段里播完
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
      SP.ui.toast('这件事还留在那儿，可以晚点再答应', 2400);
      closeRoamDialog();
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
    for (const qid of hit) SP.ui.toast('委托推进：《' + Game.QUESTS[qid].title + '》', 3000);
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
      outer: for (const qid in Game.QUESTS) {
        if (Game.QUESTS[qid].window !== wid || w.quests[qid]) continue;
        const spot = Game.npcAt(Game.QUESTS[qid].giver, wid);
        if (spot && spot.loc === loc) { mark = 'offer'; break outer; }
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
      const shape = id === 'track'
        ? `<ellipse cx="0" cy="0" rx="26" ry="17" class="loc-box"/>`
        : id === 'lake'
          ? `<path d="M-20 8 Q-16 -12 6 -10 Q24 -8 22 6 Q18 16 -2 14 Z" class="loc-box"/>`
          : `<rect x="-24" y="-16" width="48" height="32" rx="7" class="loc-box" transform="rotate(${(L.x % 3) - 1})"/>`;
      let markers = '';
      if (current) markers += `<circle cx="0" cy="0" r="30" class="loc-ring"/><circle cx="0" cy="0" r="5" class="loc-dot"/>`;
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
        h('span', { html: '<i class="lg lg-q"></i>有委托' }),
        h('span', { html: '<i class="lg lg-star"></i>主线目标' }),
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

  function questCard(qid, w) {
    const Q = Game.QUESTS[qid];
    const st = w.quests[qid];
    const ready = st.stage >= Q.steps.length;
    const items = [];
    Q.steps.forEach((s, i) => {
      const done = i < st.stage;
      const now = i === st.stage;
      items.push(h('li.q-step', { class: done ? 'done' : now ? 'now' : null },
        h('span.q-mark', { text: done ? '✓' : now ? '●' : '○' }),
        h('span', { text: s.desc })
      ));
    });
    items.push(h('li.q-step', { class: ready ? 'now' : null },
      h('span.q-mark', { text: ready ? '★' : '○' }),
      h('span', { text: '回去找' + Game.NPCS[Q.giver].name })
    ));
    return h('article.q-card', { class: ready ? 'ready' : null },
      h('div.q-title-row', {},
        h('h3', { text: Q.title }),
        ready ? h('span.q-badge', { text: '可以交差了' }) : null
      ),
      h('div.q-from', { text: Game.NPCS[Q.giver].name + ' 拜托的事' }),
      h('ul.q-steps', {}, ...items)
    );
  }

  function openJournal() {
    if (SP.ui.isPanelOpen()) return;
    const w = Game.ensure();
    const wid = Roam.windowId;
    const active = [], ready = [], done = [];
    for (const qid in w.quests) {
      const st = w.quests[qid];
      if (st.done) done.push(qid);
      else if (st.stage >= Game.QUESTS[qid].steps.length) ready.push(qid);
      else active.push(qid);
    }
    const offers = wid ? Object.keys(Game.QUESTS).filter((qid) =>
      Game.QUESTS[qid].window === wid && !w.quests[qid]) : [];

    const main = Roam.active
      ? h('div.j-main', {},
        h('div.eyebrow', { text: '主线' }),
        h('p', { text: Game.WINDOWS[wid].hint + '（地图上标 ★ 的地方）' }))
      : h('div.j-main', {},
        h('div.eyebrow', { text: '主线' }),
        h('p', { text: '故事进行中——到章节之间的自由活动时间，再来翻这一页。' }));

    const offerList = offers.length
      ? h('div.j-section', {},
        h('h2', { text: '听说的事' }),
        h('p.j-sub', { text: '有人也许想找你帮忙：' }),
        ...offers.map((qid) => h('div.j-rumor', {},
          h('span', { text: '……' + Game.QUESTS[qid].hint }),
          h('em', { text: '（找 ' + Game.NPCS[Game.QUESTS[qid].giver].name + '）' }))))
      : null;

    const people = h('div.j-people', {},
      h('h2', { text: '熟悉的人' }),
      h('div.j-faces', {},
        ...Object.keys(Game.NPCS).map((npcId) => {
          const r = w.rapport[npcId] || 0;
          return h('div.j-face', {},
            h('span.face', { html: SP.character.build(npcId, 'calm') }),
            h('b', { text: Game.NPCS[npcId].name }),
            h('span.dots', { text: '●'.repeat(r) + '○'.repeat(Game.RAPPORT_MAX - r) }));
        })));

    const notes = h('div.j-notes', {},
      h('h2', { text: '手记 · ' + w.notes.length + '/10' }),
      w.notes.length
        ? h('div.j-note-grid', {},
          ...w.notes.map((qid) => h('div.j-note', {},
            h('b', { text: Game.NOTES[qid].title }),
            h('span', { text: Game.NOTES[qid].date }))))
        : h('p.j-sub', { text: '完成委托后，这里会多出一些纸片。它们也会进口袋。' }));

    SP.ui.openPanel(h('div', {},
      SP.ui.head('任务手账', '漫游 · 委托与手记'),
      main,
      h('div.j-section', {},
        h('h2', { text: '进行中的委托 ' + (active.length + ready.length) }),
        active.length || ready.length
          ? h('div.j-quests', {},
            ...ready.map((qid) => questCard(qid, w)),
            ...active.map((qid) => questCard(qid, w)))
          : h('p.j-sub', { text: '暂时没有。地图上亮着的名字，也许正在等你说一句“好的”。' })),
      offerList,
      h('div.j-section', {},
        h('h2', { text: '已完成 ' + done.length + '/10' }),
        done.length
          ? h('ul.j-done', {}, ...done.map((qid) => h('li', {},
            h('span', { text: '✓ ' + Game.QUESTS[qid].title }),
            h('em', { text: Game.NOTES[qid].date }))))
          : h('p.j-sub', { text: '从一件小事开始，也挺好。' })),
      notes,
      people), { wide: true, mode: 'journal' });
    SP.audio.sfx('click');
  }

  /* ================================== 导出 ================================== */

  SP.roam = {
    enter, hide, reset, shouldGate, continueMain,
    travel, openMap, openJournal,
    renderHUD, renderScene, updatePlaceChip,
    // 给外壳（安卓返回键、桌面窗口）留的收口：先合对话，再收热点
    closeDialogue: closeRoamDialog,
    closeLook: hideLookCard,
    active: () => Roam.active,
    windowId: () => Roam.windowId,
  };
})(window);
