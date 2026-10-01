/*!
 * 晴天以后 · v2  |  engine.js
 * 叙事引擎：状态机、打字机、场景调度、立绘、自动/快进、历史与存档。
 */
(function (global) {
  'use strict';
  const SP = global.SP;
  const { $, h, clear, clamp } = SP;
  const ST = SP.story;

  const SIDES = { man: 'right', yan: 'right', cheng: 'right', aunt: 'right', mom: 'right', teacher: 'right' };
  const SPEED = [2.6, 1.6, 1.0, 0.58, 0];        // 文字速度倍率，0 = 瞬显
  const AUTO_DELAY = [3800, 2600, 1600];

  const Engine = {
    state: null,
    chapter: null,
    busy: false,
    typing: null,
    fullText: '',
    visible: false,
    auto: false,
    skip: false,
    autoTimer: null,
    currentScene: null,
    currentChar: null,
    currentExpr: null,
    logOpen: false,
    ended: false,
  };

  /* ------------------------------- 状态管理 ------------------------------- */

  function init(loadedState) {
    Engine.state = loadedState || ST.fresh();
    Engine.ended = false;
    Engine.chapter = null;
    Engine.auto = false;
    Engine.skip = false;
  }

  function addBonds(delta) {
    if (!delta) return [];
    const up = [];
    for (const k in delta) {
      const before = Engine.state.bonds[k] || 0;
      Engine.state.bonds[k] = clamp(before + delta[k], 0, 10);
      if (Engine.state.bonds[k] > before) up.push(k);
    }
    if (up.length) {
      SP.ui.paintBonds(up);
      checkAchievements();
    }
    return up;
  }

  function pushHistory() {
    Engine.state.history.push({
      id: Engine.state.id,
      flags: Object.assign({}, Engine.state.flags),
      bonds: Object.assign({}, Engine.state.bonds),
      logLength: Engine.state.log.length,
      choices: Engine.state.choices,
      memories: (Engine.state.memories || []).slice(),
    });
    if (Engine.state.history.length > 240) Engine.state.history.shift();
  }

  /* -------------------------------- 推进 --------------------------------- */

  function go(toId, opt = {}) {
    if (Engine.busy) return;
    const target = ST.NODES[toId];
    if (!target) return;
    SP.engine.stopAuto();
    pushHistory();
    Object.assign(Engine.state.flags, opt.set || {});
    if (opt.bond) addBonds(opt.bond);
    if (target.set) Object.assign(Engine.state.flags, target.set);
    if (target.bond) addBonds(target.bond);
    if (opt.label) {
      const here = ST.NODES[Engine.state.id];
      Engine.state.log.push({
        kind: 'choice',
        speaker: '我的选择',
        text: opt.label,
        place: (here && here.place) || '',
        t: Date.now(),
      });
      Engine.state.choices++;
      SP.storage.unlockAchievement('firstChoice') && SP.ui.achievementPopup('firstChoice');
      checkAchievements();
    }
    show(toId);
  }

  function advanceNext() {
    const node = ST.NODES[Engine.state.id];
    if (!node || node.ending) return;
    let nextId = node.next;
    if (typeof nextId === 'function') nextId = nextId(Engine.state.flags);
    // 闸门节点：先交给自由行动，走到目标地点再继续主线
    if (nextId && SP.roam && SP.roam.shouldGate(Engine.state.id)) { SP.roam.enter(nextId); return; }
    if (nextId) go(nextId);
  }

  function pick(choice) {
    if (Engine.busy) return;
    if (choice.requires && !choice.requires(Engine.state.flags)) {
      SP.ui.toast(choice.requiresHint || '这个选项现在还不能选。');
      return;
    }
    if (!Engine.visible) { finishText(); return; }
    SP.audio.sfx('choice');
    go(choice.to, { set: choice.set, bond: choice.bond, label: choice.label });
  }

  function back() {
    if (Engine.busy) return;
    if (!Engine.state.history.length) { SP.ui.toast('已经是最开始的一段了。'); return; }
    SP.engine.stopAuto();
    const prev = Engine.state.history.pop();
    Engine.state.flags = prev.flags;
    Engine.state.bonds = prev.bonds || Engine.state.bonds;
    Engine.state.log = Engine.state.log.slice(0, prev.logLength);
    Engine.state.choices = prev.choices;
    Engine.state.memories = prev.memories || [];
    SP.storage.unlockAchievement('backtrack') && SP.ui.achievementPopup('backtrack');
    SP.ui.paintBonds();
    show(prev.id, { instant: false, record: false });
  }

  /* -------------------------------- 打字机 ------------------------------- */

  function speedFactor() {
    const s = SP.storage.getSettings().textSpeed;
    return SPEED[s] != null ? SPEED[s] : 1;
  }

  /* 把节点的分段文本摊平成一个可逐字显示的序列。
   * 每段一个 <span class="seg seg-<kind>">，打字机按「整串偏移」往里灌字，
   * 所以对白 / 旁白 / 心声各自成段、各自带样式，但读起来仍是一句话接一句。 */
  function setText(segs) {
    stopTyping();
    const list = (Array.isArray(segs) && segs.length) ? segs : [{ k: 'n', s: String(segs || '') }];
    Engine.segs = list;
    Engine.fullText = list.map((s) => s.s).join('');

    const line = $('#line');
    clear(line);
    const host = h('span.txt');
    const spans = list.map((sg) => {
      const el = document.createElement('span');
      el.className = 'seg seg-' + sg.k;
      if (sg.w) el.setAttribute('data-who', sg.w);
      host.appendChild(el);
      return el;
    });
    line.append(host, h('span.cursor'));
    Engine.visible = false;

    // 把「已显示 n 个字」摊到每一段上
    const paint = (n) => {
      let left = n;
      for (let i = 0; i < spans.length; i++) {
        const s = list[i].s;
        const take = left <= 0 ? 0 : Math.min(s.length, left);
        if (spans[i].textContent.length !== take) spans[i].textContent = take >= s.length ? s : s.slice(0, take);
        left -= s.length;
      }
    };
    Engine.paintText = paint;

    const factor = speedFactor();
    if (factor === 0 || SP.stage.reduced) {
      paint(Engine.fullText.length);
      finishText();
      return;
    }

    let i = 0;
    let acc = 0;
    let mark = null;              // 用 null 而不是 0 做哨兵：rAF 时间戳可能真的是 0
    const base = 26 * factor;
    const full = Engine.fullText;
    Engine.typing = requestAnimationFrame(function step(t) {
      if (mark === null) mark = t;
      const dt = t - mark;
      mark = t;
      acc += dt;
      while (acc > 0 && i < full.length) {
        const ch = full[i];
        const d = base * SP.typeDelay(ch) * 0.88;
        if (acc < d) break;
        acc -= d;
        i++;
        if (SP.storage.getSettings().typingSound && i % 6 === 0) SP.audio.sfx('hover');
      }
      paint(i);
      if (i >= full.length) { finishText(); return; }
      Engine.typing = requestAnimationFrame(step);
    });
  }

  function stopTyping() {
    if (Engine.typing) cancelAnimationFrame(Engine.typing);
    Engine.typing = null;
  }

  function finishText() {
    stopTyping();
    const line = $('#line');
    if (Engine.paintText) Engine.paintText(String(Engine.fullText || '').length);
    const cursor = line.querySelector('.cursor');
    if (cursor) cursor.remove();
    Engine.visible = true;
    const node = ST.NODES[Engine.state.id];
    const nextBtn = $('#nextBtn');
    const hint = $('#hint');
    if (node.choices) {
      nextBtn.classList.add('hidden');
      hint.textContent = '选择你想做的事';
      renderChoices(node.choices);
      if (Engine.skip) Engine.skip = false, SP.ui.syncModes();
    } else {
      nextBtn.classList.remove('hidden');
      hint.textContent = '空格 / 回车 / 点击继续';
      if (Engine.auto) scheduleAuto();
    }
    SP.engine.markRead();
  }

  /* -------------------------------- 选项 --------------------------------- */

  function renderChoices(list) {
    const box = $('#choices');
    clear(box);
    const flags = Engine.state.flags;
    list.forEach((c, i) => {
      const ok = !c.requires || c.requires(flags);
      const b = h(
        'button.choice',
        {
          type: 'button',
          data: { index: String(i + 1) },
          class: (c.secret ? 'secret ' : '') + (ok ? '' : 'locked'),
          'aria-disabled': ok ? null : 'true',
          onmouseenter: () => SP.audio.sfx('hover'),
          onclick: () => pick(c),
        },
        h('span', { text: c.label }),
        c.hint ? h('small', { text: ok ? c.hint : c.requiresHint || '条件未满足' }) : null
      );
      if (!ok) b.title = c.requiresHint || '条件未满足';
      box.append(b);
    });
    box.classList.remove('hidden');
    SP.ui.syncModes();
  }

  /* ------------------------------- 场景调度 ------------------------------ */

  function applyScene(node) {
    const scene = node.scene || Engine.currentScene || 'campus';
    if (SP.game) SP.game.track(scene);           // 地图上跟着故事显示“你在这里”
    const time = node.time || null;
    const weather = node.weather || null;
    const changedScene = scene !== Engine.currentScene;
    if (changedScene || time || weather) {
      SP.stage.setScene(scene, {
        time: time || lastTime,
        weather: weather || lastWeather,
        transition: node.transition || 'fade',
      });
      Engine.currentScene = scene;
    }
    if (time) lastTime = time;
    if (weather) lastWeather = weather;
    SP.audio.setMood(node.mood || 'calm');
    SP.audio.setScene(scene, weather || lastWeather);
    return changedScene;
  }
  let lastTime = 'day';
  let lastWeather = 'clear';

  function renderCharacter(node) {
    const box = $('#characters');
    const key = node.person;
    if (!key) {
      Array.from(box.children).forEach((el) => {
        if (!el.classList.contains('out')) {
          el.classList.add('out');
          setTimeout(() => el.remove(), 600);
        }
      });
      Engine.currentChar = null;
      return;
    }
    const expr = node.expr || 'calm';
    if (Engine.currentChar === key && box.querySelector('.char:not(.out) .ch-svg')) {
      if (Engine.currentExpr !== expr) {
        box.querySelector('.char:not(.out) .ch-svg').outerHTML = SP.character.build(key, expr);
        Engine.currentExpr = expr;
      }
      return;
    }
    Array.from(box.children).forEach((el) => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 600);
    });
    const el = h('div.char.enter', {
      data: { char: key, side: SIDES[key] || 'right' },
      html: SP.character.build(key, expr),
    });
    box.append(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('enter')));
    Engine.currentChar = key;
    Engine.currentExpr = expr;
  }

  /* --------------------------------- 显示 -------------------------------- */

  function chapterLabelFor(node) {
    if (node.chapter) return node.chapter;
    if (Engine.chapter) return Engine.chapter;
    // 兜底：按进度值反查所属章节
    const p = node.p || 0;
    const R = [[0, 21], [24, 61], [65, 90], [94, 100]];
    for (let i = R.length - 1; i >= 0; i--) if (p >= R[i][0]) return (ST.CHAPTERS[i] || {}).name || '';
    return (ST.CHAPTERS[0] || {}).name || '';
  }

  function show(id, opt = {}) {
    const node = ST.NODES[id];
    if (!node) return;
    if (SP.roam) SP.roam.hide();      // 回到故事叙述时，收起自由行动层
    stopTyping();
    stopAuto();
    Engine.visible = false;
    Engine.state.id = id;

    if (node.ending) { Engine.state.flags.ending = ST.resolveEnding(Engine.state.flags); Engine.ended = true; SP.ui.showEnding(); saveAuto(); return; }

    $('#overlay').classList.add('hidden');
    Engine.ended = false;
    $('#dialogue').classList.remove('hidden');

    const chapterChanged = node.chapter && node.chapter !== Engine.chapter;
    if (node.chapter) Engine.chapter = node.chapter;

    const paint = () => {
      const sceneChanged = applyScene(node);
      const segs = ST.segments(node, Engine.state.flags);
      const hasLine = segs.some((s) => s.k === 'd');
      const hasInner = segs.some((s) => s.k === 'i');

      $('#chapterChip').textContent = chapterLabelFor(node);
      $('#placeChip').textContent = node.place || '';
      $('#speaker').innerHTML = '';
      // 名牌只反映「这一节的主声音是谁」：
      //   角色节点 → 那个角色的名字
      //   我        → 我说出口时是「我」，只在心里想时是「心里」
      //   旁白      → 不挂牌。旁白一挂牌子就变成有人在念，
      //              而它本该退到故事后面当一层空气。
      // 所以旁白里引用的别人说的话，也不会把名字挂到框顶上。
      if (node.person) {
        $('#speaker').append(h('span', { text: node.speaker }));
        const label = (SP.character.PRESETS[node.person] || {}).label;
        if (label && label !== node.speaker) $('#speaker').append(h('span.badge', { text: label }));
      } else if (node.speaker === '我') {
        if (hasLine) $('#speaker').append(h('span', { text: '我' }));
        else $('#speaker').append(h('span.inner-tag', { text: '心里' }));
      }
      renderCharacter(node);
      $('#choices').classList.add('hidden');
      $('#nextBtn').classList.add('hidden');
      $('#hint').textContent = '点击文字可立即显示整段';
      SP.ui.paintProgress(node.p || 0);

      setText(segs);
      const text = Engine.fullText;
      Engine.state.memories = Engine.state.memories || [];
      if (node.memory && opt.record !== false && !Engine.state.memories.includes(node.memory)) Engine.state.memories.push(node.memory);
      const pocket = $('#pocketBtn');
      if (pocket) pocket.textContent = '▤ 口袋 ' + Engine.state.memories.length;
      if (node.voice && SP.storage.getSettings().voiceCue && !Engine.skip) {
        SP.audio.voice(node.person || null, { text });
      }
      if (node.sfx && !Engine.skip) SP.audio.sfx(node.sfx);

      if (opt.record !== false) {
        Engine.state.log.push({
          kind: hasLine ? (node.speaker === '我' ? 'mine' : 'say') : (hasInner ? 'mine' : 'narr'),
          speaker: hasLine ? (node.speaker || '旁白') : (hasInner ? '我' : '旁白'),
          text,
          place: node.place || '',
          chapter: node.chapter || Engine.chapter,
          t: Date.now(),
        });
        if (Engine.state.log.length > 400) Engine.state.log.shift();
      }
      saveAuto();
      if (SP.storage.getSettings().showBonds) SP.ui.paintBonds();
    };

    if (opt.instant) {
      paint();
      Engine.busy = false;
      return;
    }

    Engine.busy = true;
    $('#dialogue').classList.add('changing');
    $('#choices').classList.add('hidden');

    const run = () => {
      setTimeout(() => {
        try { paint(); } finally {
          $('#dialogue').classList.remove('changing');
          Engine.busy = false;
        }
      }, 170);
    };

    if (chapterChanged && !Engine.skip && !opt.noCard) {
      const ch = ST.CHAPTERS.find((c) => c.name === node.chapter);
      if (ch) {
        applyScene(node);
        SP.audio.sfx('whoosh');
        SP.ui.showChapterCard(ch, () => run());
        return;
      }
    }
    run();
  }

  /* ------------------------------ 自动 / 快进 ----------------------------- */

  function scheduleAuto() {
    stopAuto();
    if (!Engine.auto) return;
    const d = AUTO_DELAY[SP.storage.getSettings().autoSpeed] || 1700;
    Engine.autoTimer = setTimeout(() => {
      const node = ST.NODES[Engine.state.id];
      if (!node || node.choices || node.ending) { Engine.auto = false; SP.ui.syncModes(); return; }
      advanceNext();
    }, d);
  }

  function stopAuto() {
    clearTimeout(Engine.autoTimer);
    Engine.autoTimer = null;
  }

  function toggleAuto() {
    Engine.auto = !Engine.auto;
    if (Engine.auto) {
      Engine.skip = false;
      if (Engine.visible) scheduleAuto();
    } else stopAuto();
    SP.ui.syncModes();
    SP.ui.toast(Engine.auto ? '自动播放：开' : '自动播放：关');
  }

  function toggleSkip() {
    Engine.skip = !Engine.skip;
    if (Engine.skip) {
      Engine.auto = false;
      stopAuto();
      SP.ui.toast('快进已读：开');
      fastForward();
    } else {
      SP.ui.toast('快进已读：关');
    }
    SP.ui.syncModes();
  }

  function fastForward() {
    if (!Engine.skip) return;
    if (Engine.busy) { setTimeout(fastForward, 100); return; }
    const node = ST.NODES[Engine.state.id];
    if (!node || node.ending || node.choices) { Engine.skip = false; SP.ui.syncModes(); return; }
    const nextId = typeof node.next === 'function' ? node.next(Engine.state.flags) : node.next;
    if (!nextId) { Engine.skip = false; SP.ui.syncModes(); return; }
    const read = SP.storage.getProgress().readNodes.includes(nextId);
    if (!read) { Engine.skip = false; SP.ui.syncModes(); SP.ui.toast('遇到未读内容，已停止快进。'); return; }
    go(nextId);
    if (Engine.skip) setTimeout(fastForward, 260);
  }

  /* ------------------------------- 其它动作 ------------------------------ */

  function next() {
    if (Engine.busy) return;
    if (SP.roam && SP.roam.active()) return;     // 自由行动中不推进剧情
    if (!$('#overlay').classList.contains('hidden')) return;
    if (!Engine.visible) { finishText(); return; }
    const node = ST.NODES[Engine.state.id];
    if (!node || node.choices || node.ending) return;
    advanceNext();
  }

  function markRead() {
    const ids = [Engine.state.id];
    SP.storage.markRead(ids);
  }

  function saveAuto() {
    const s = SP.storage.getSettings();
    if (!s.autoSave) return;
    const node = ST.NODES[Engine.state.id];
    const text = typeof node.text === 'function' ? node.text(Engine.state.flags) : node.text || '';
    SP.storage.writeSlot('auto', {
      state: JSON.parse(JSON.stringify(Engine.state)),
      chapter: node.chapter || Engine.chapter,
      place: node.place,
      scene: node.scene || Engine.currentScene,
      time: node.time || lastTime,
      weather: node.weather || lastWeather,
      p: node.p || 0,
      speaker: node.speaker,
      preview: String(text).slice(0, 46),
      choices: Engine.state.choices,
      bonds: Engine.state.bonds,
    });
  }

  function saveTo(id) {
    const node = ST.NODES[Engine.state.id];
    const text = typeof node.text === 'function' ? node.text(Engine.state.flags) : node.text || '';
    SP.storage.writeSlot(id, {
      state: JSON.parse(JSON.stringify(Engine.state)),
      chapter: node.chapter || Engine.chapter,
      place: node.place,
      scene: node.scene || Engine.currentScene,
      time: node.time || lastTime,
      weather: node.weather || lastWeather,
      p: node.p || 0,
      speaker: node.speaker,
      preview: String(text).slice(0, 46),
      choices: Engine.state.choices,
      bonds: Engine.state.bonds,
    });
    SP.audio.sfx('click');
  }

  function loadFrom(id) {
    const slot = SP.storage.readSlot(id);
    if (!slot) return false;
    if (!slot.state || !ST.NODES[slot.state.id]) { SP.ui.toast('这份存档不属于《留一盏灯》。'); return false; }
    Engine.state = slot.state;
    Engine.state.bonds = Engine.state.bonds || { man: 0, yan: 0, family: 0, self: 0 };
    Engine.state.log = Engine.state.log || [];
    Engine.state.history = Engine.state.history || [];
    Engine.state.memories = Engine.state.memories || [];
    Engine.chapter = null;
    const node = ST.NODES[Engine.state.id];
    Engine.currentScene = null;
    Engine.currentChar = null;
    if (node && (node.time || node.weather)) {
      lastTime = node.time || lastTime;
      lastWeather = node.weather || lastWeather;
    }
    SP.ui.paintBonds();
    show(Engine.state.id, { instant: true, record: false });
    return true;
  }

  function restart() {
    if (SP.roam) SP.roam.reset();
    Engine.state = ST.fresh();
    Engine.chapter = null;
    Engine.currentScene = null;
    Engine.currentChar = null;
    Engine.skip = false;
    Engine.auto = false;
    Engine.ended = false;
    lastTime = 'afternoon';
    lastWeather = 'fair';
    $('#overlay').classList.add('hidden');
    SP.ui.paintBonds();
    show('arrival', { instant: true });
    SP.storage.unlockAchievement('begin') && SP.ui.achievementPopup('begin');
  }

  /* -------------------------------- 成就 --------------------------------- */

  function checkAchievements() {
    const p = SP.storage.getProgress();
    const f = Engine.state.flags;
    const b = Engine.state.bonds;
    const give = (id) => {
      if (SP.storage.unlockAchievement(id)) {
        SP.ui.achievementPopup(id);
        SP.audio.sfx('unlock');
      }
    };
    if (f.night === 'stop') give('rainyWalk');
    if (f.watched) give('nightOwl');
    if (b && Object.values(b).some((v) => v >= 6)) give('bondMax');
    if (SP.audio.played > 300) give('listener');
    const n = p.endings.length;
    if (n >= 3) give('end3');
    if (n >= Object.keys(ST.ENDINGS).length) give('endAll');
  }

  /** 供外部（图鉴 / 结局）调用 */
  function currentChapterIndex() {
    const node = ST.NODES[Engine.state.id] || {};
    const i = ST.CHAPTERS.findIndex((c) => c.name === (node.chapter || Engine.chapter));
    return i < 0 ? 0 : i;
  }

  SP.engine = Object.assign(Engine, {
    init, show, go, next, back, pick, restart,
    toggleAuto, toggleSkip, stopAuto, fastForward,
    saveTo, loadFrom, saveAuto, checkAchievements, currentChapterIndex,
    addBonds, renderChoices, finishText, stopTyping, markRead,
    SIDES,
  });
  // Object.assign 会把上面的 getter 求值成静态快照；这里补成实时访问器，
  // 自由行动旅行时要拿到故事当前的时段与天气。
  Object.defineProperty(SP.engine, 'lastTime', { get: () => lastTime, configurable: true });
  Object.defineProperty(SP.engine, 'lastWeather', { get: () => lastWeather, configurable: true });
})(window);

