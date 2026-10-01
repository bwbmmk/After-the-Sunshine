/*!
 * 晴天以后 · v2  |  ui.js
 * 界面层：提示、成就弹窗、羁绊条、进度条、章节卡，以及全部面板（封面 / 菜单 /
 * 记录 / 存读档 / 设置 / 结局图鉴 / 成就 / 分支图 / 结局）。
 */
(function (global) {
  'use strict';
  const SP = global.SP;
  const { $, h, clear, clamp } = SP;
  const ST = SP.story;
  const SS = SP.storage;

  const CH_P_RANGES = [[0,20],[20,40],[40,60],[60,80],[80,100]];
  const BOND_META = [
    { key: 'man', name: '小满' },
    { key: 'yan', name: '阿言' },
    { key: 'family', name: '家人' },
    { key: 'self', name: '自己' },
  ];

  let lastFocus = null;

  /* -------------------------------- 提示 --------------------------------- */

  function toast(msg, ms = 2200) {
    const wrap = $('#toasts');
    const el = h('div.toast', { text: msg });
    wrap.append(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 420);
    }, ms);
  }

  function achievementPopup(id) {
    const a = ST.ACHIEVEMENTS.find((x) => x.id === id);
    if (!a) return;
    const wrap = $('#achPop');
    const el = h(
      'div.item',
      {},
      h('div.ic', { text: a.icon }),
      h('div', {}, h('b', { text: '成就解锁 · ' + a.name }), h('span', { text: a.desc }))
    );
    wrap.append(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 520);
    }, 3400);
  }

  /* ------------------------------ 羁绊 / 进度 ----------------------------- */

  function paintBonds(upKeys) {
    const box = $('#bonds');
    if (!box) return;
    if (!SS.getSettings().showBonds) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    if (!box.dataset.ready) {
      clear(box);
      box.append(h('div.bonds-title', { text: '羁 绊' }));
      for (const b of BOND_META) {
        box.append(
          h(
            'div.bond',
            { data: { bond: b.key } },
            h('span.bond-name', { text: b.name }),
            h('span.bond-track', {}, h('i.bond-fill')),
            h('span.bond-val', { text: '0' })
          )
        );
      }
      box.dataset.ready = '1';
    }
    const bonds = SP.engine.state ? SP.engine.state.bonds : {};
    for (const b of BOND_META) {
      const row = box.querySelector(`.bond[data-bond="${b.key}"]`);
      if (!row) continue;
      const v = clamp(bonds[b.key] || 0, 0, 10);
      row.querySelector('.bond-fill').style.width = (v / 10) * 100 + '%';
      row.querySelector('.bond-val').textContent = String(v);
      if (upKeys && upKeys.includes(b.key)) {
        row.classList.remove('up');
        void row.offsetWidth;
        row.classList.add('up');
        setTimeout(() => row.classList.remove('up'), 800);
      }
    }
  }

  function paintProgress(p) {
    const bar = $('#progressBar');
    if (!bar) return;
    if (!SS.getSettings().showProgress) { bar.classList.add('hidden'); return; }
    bar.classList.remove('hidden');
    if (!bar.dataset.ready) {
      clear(bar);
      for (let i = 0; i < CH_P_RANGES.length; i++) {
        const seg = h('span.seg', { title: (ST.CHAPTERS[i] || {}).name || '' }, h('i'));
        bar.append(seg);
      }
      bar.dataset.ready = '1';
    }
    const segs = bar.querySelectorAll('.seg i');
    CH_P_RANGES.forEach(([lo, hi], i) => {
      const v = p <= lo ? 0 : p >= hi ? 100 : ((p - lo) / (hi - lo)) * 100;
      if (segs[i]) segs[i].style.right = 100 - v + '%';
    });
  }

  function syncModes() {
    const set = (sel, on) => {
      const el = $(sel);
      if (el) el.setAttribute('aria-pressed', String(!!on));
    };
    set('#autoBtn', SP.engine.auto);
    set('#skipBtn', SP.engine.skip);
    set('#musicBtn', SP.audio.enabled);
    document.body.dataset.mode = SP.engine.auto ? 'auto' : SP.engine.skip ? 'skip' : 'normal';
  }

  /* ------------------------------- 章节卡 -------------------------------- */

  function showChapterCard(ch, cb) {
    const el = $('#chapterCard');
    el.innerHTML = '';
    el.append(
      h(
        'div.chapter-card-inner',
        {},
        h('div.cc-name', { text: ch.name }),
        h('div.cc-rule'),
        h('div.cc-sub', { text: ch.sub })
      )
    );
    el.classList.add('show');
    const wait = SP.stage.reduced ? 600 : 2200;
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => cb && cb(), 420);
    }, wait);
  }

  /* ------------------------------- 面板基座 ------------------------------ */

  function openPanel(content, opts = {}) {
    if(SP.engine){ SP.engine.stopAuto(); SP.engine.auto=false; SP.engine.skip=false; syncModes(); }
    const ov = $('#overlay');
    const panel = $('#panel');
    lastFocus = document.activeElement;
    panel.className = 'panel' + (opts.wide ? ' wide' : '') + (opts.cover ? ' cover' : '');
    clear(panel);
    panel.append(content);
    ov.classList.remove('hidden');
    ov.dataset.mode = opts.mode || 'default';
    // 焦点交给面板本身（tabindex=-1），键盘用户按 Tab 进入控件，避免首个按钮被无意义高亮
    panel.setAttribute('tabindex', '-1');
    setTimeout(() => panel.focus({ preventScroll: true }), 40);
    return panel;
  }

  function closePanel() {
    $('#overlay').classList.add('hidden');
    const panel = $('#panel');
    clear(panel);
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
    lastFocus = null;
  }

  function isPanelOpen() {
    return !$('#overlay').classList.contains('hidden');
  }

  function head(title, eyebrow) {
    return h(
      'div.panel-head',
      {},
      eyebrow ? h('div.eyebrow', { text: eyebrow }) : null,
      h('h1', { text: title })
    );
  }

  function btn(label, cls, onclick) {
    return h('button.btn.' + cls, { type: 'button', onclick }, label);
  }

  /* -------------------------------- 封面 --------------------------------- */

  function showCover() {
    const prog = SS.getProgress();
    const total = Object.keys(ST.ENDINGS).length;
    const slots = SS.listSlots();
    const hasSave = slots.some((s) => !s.empty);
    const panel = openPanel(
      h(
        'div',
        { style: { gap: '2px' } },
        h('div.eyebrow', { text: '晴天以后 · 校园短篇集 / 漫游版' }),
        h('h1', { text: '留一盏灯' }),
        h('p.lead', {
          text: '一个学期，一部还没剪完的短片。\n借来的设备、没对上的课表，和几个渐渐熟悉的人。\n最后一排，给晚到的人留着。',
        }),
        h(
          'div',
          { style: { display: 'flex', flexWrap: 'wrap', gap: '9px', justifyContent: 'center', marginTop: '10px' } },
          btn('开始故事', 'primary', () => {
            SP.audio.ensure();
            closePanel();
            SP.engine.restart();
          }),
          hasSave ? btn('继续上次', 'ghost', () => { closePanel(); openSaves('load'); }) : null
        ),
        h(
          'div.stat-row',
          {},
          h('div.stat', {}, h('b', { text: `${prog.endings.length}/${total}` }), h('span', { text: '结局' })),
          h('div.stat', {}, h('b', { text: `${prog.achievements.length}/${ST.ACHIEVEMENTS.length}` }), h('span', { text: '成就' })),
          h('div.stat', {}, h('b', { text: String(prog.clears || 0) }), h('span', { text: '通关次数' }))
        ),
        h(
          'div',
          { style: { display: 'flex', gap: '7px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '14px' } },
          btn('结局图鉴', 'plain sm', () => openGallery(true)),
          btn('成就', 'plain sm', () => openAchievements(true)),
          btn('分支图', 'plain sm', () => openFlow(true)),
          btn('设置', 'plain sm', () => openSettings(true))
        ),
        h('div.fine', {
          text: '五章完整故事 · 六种后来 · 建议留出 40—60 分钟\n章节之间可以自由行动：逛校园、找人聊天、帮人办事。\n每个月的时间只够帮一部分人——你帮了谁，故事就往哪边走。\n随时存档，慢慢读。声音可在上方开启。',
        })
      ),
      { cover: true, mode: 'cover' }
    );
  }

  /* -------------------------------- 菜单 --------------------------------- */
  /* 口袋：从前只装纸片，现在装的是别人递过来的东西。
   * 分三层 —— 手上的事（还要交出去）、留念（熟到底才有）、角落里的小东西；
   * 纸片仍然收在最下面，和从前一样。 */
  function pocketItemCard(it) {
    return h('article.pocket-item', { class: 'k-' + it.kind },
      h('span.pi-icon', { text: it.icon || '▫' }),
      h('div.pi-body', {},
        h('b', { text: it.name }),
        it.from ? h('span.pi-from', { text: '来自 ' + it.from }) : null,
        h('p.pi-desc', { text: it.desc })
      )
    );
  }

  function openNotebook() {
    const ids = (SP.engine.state && SP.engine.state.memories) || [];
    const secs = (SP.game && SP.game.pocketSections) ? SP.game.pocketSections() : [];
    const pages = h('div.notebook-grid');
    for (const id of ids) {
      const m = ST.MEMORIES[id]; if (!m) continue;
      pages.append(h('article.notebook-page', {}, h('div.eyebrow', {text:m.date}), h('h2',{text:m.title}), h('p',{text:m.body})));
    }
    // 漫游版：委托换来的手记，与剧情纸片收在同一个口袋里
    const extras = (SP.roam && SP.game) ? SP.game.notebookExtras() : [];
    for (const m of extras) {
      pages.append(h('article.notebook-page.from-quest', {}, h('div.eyebrow', {text:m.date}), h('h2',{text:m.title}), h('p',{text:m.body})));
    }

    const total = (SP.game && SP.game.ownedItems) ? SP.game.ownedItems().length : 0;
    const body = h('div', {});
    if (secs.length) {
      for (const s of secs) {
        body.append(h('section.pocket-sec', { class: 'sec-' + s.key },
          h('h2', {}, h('span', { text: s.title }), h('em', { text: s.items.length })),
          h('p.pocket-sub', { text: s.sub }),
          h('div.pocket-grid', {}, ...s.items.map(pocketItemCard))
        ));
      }
    } else {
      body.append(h('p', { text: '口袋还是空的。别人递给你的东西、顺手捡的小东西、还有熟到最后那个人给你的东西，都会落在这儿。' }));
    }
    if (ids.length || extras.length) {
      body.append(h('section.pocket-sec.sec-note', {},
        h('h2', {}, h('span', { text: '纸片' }), h('em', { text: String(ids.length + extras.length) })),
        h('p.pocket-sub', { text: '剧情里收起的，和交差时落下的。' }),
        pages));
    }

    const eyebrow = total
      ? '口袋里 ' + total + ' 件东西'
      : '一张纸，也能记住一天';
    const panel = openPanel(h('div', {}, head('口袋里的东西', eyebrow), body), { wide: true, mode: 'notebook' });
    panel.append(h('div.panel-foot', {}, btn('收好，继续故事', 'primary', closePanel)));
  }

  function openMenu() {
    const prog = SS.getProgress();
    openPanel(
      h(
        'div',
        {},
        head('暂停一下', '晴天以后'),
        h('p', { text: '你的进度会自动保存。想继续时，故事会从这一段接上。' }),
        h(
          'div',
          { style: { display: 'grid', gap: '9px', marginTop: '10px' } },
          h(
            'div',
            { class: 'keys' },
            h('div', {}, h('kbd', { text: 'Space' }), '继续'),
            h('div', {}, h('kbd', { text: 'Esc' }), '菜单'),
            h('div', {}, h('kbd', { text: 'Backspace' }), '返回上一段'),
            h('div', {}, h('kbd', { text: 'A' }), '自动播放'),
            h('div', {}, h('kbd', { text: 'Ctrl' }), '按住快进已读'),
            h('div', {}, h('kbd', { text: '1-4' }), '选择选项')
          )
        ),
        h(
          'div',
          { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '9px', marginTop: '18px' } },
          btn('继续故事', 'primary', closePanel),
          btn('故事记录', 'ghost', () => openLog(true)),
          btn('存档', 'plain', () => openSaves('save')),
          btn('读档', 'plain', () => openSaves('load')),
          btn('设置', 'plain', () => openSettings(true)),
          btn('结局图鉴', 'plain', () => openGallery(true)),
          btn('成就', 'plain', () => openAchievements(true)),
          btn('分支图', 'plain', () => openFlow(true)),
          btn('回到封面', 'plain', () => showCover()),
          btn('重新开始', 'danger', () => {
            if (confirm('重新开始会清空当前这一段进度（已解锁的结局与成就仍会保留）。确定吗？')) {
              closePanel();
              SP.engine.restart();
            }
          })
        ),
        h('div.fine', {
          text: `已解锁结局 ${prog.endings.length}/${Object.keys(ST.ENDINGS).length} · 成就 ${prog.achievements.length}/${ST.ACHIEVEMENTS.length}`,
        })
      ),
      { mode: 'menu' }
    );
  }

  /* -------------------------------- 记录 --------------------------------- */

  function openLog(fromPanel) {
    SS.unlockAchievement('reader') && achievementPopup('reader');
    const entries = SP.engine.state ? SP.engine.state.log : [];
    let filter = 'all';
    const body = h('div.panel-body.scroll');
    const list = h('div.log-list');
    body.append(list);

    const render = () => {
      clear(list);
      const items = entries.filter((e) => (filter === 'all' ? true : e.kind === filter));
      if (!items.length) {
        list.append(h('div.log-empty', { text: '还没有记录。走几步故事，这里就会长出来。' }));
        return;
      }
      items
        .slice()
        .reverse()
        .forEach((e) => {
          list.append(
            h(
              'div.log-entry' + (e.kind === 'choice' ? ' choice-pick' : e.kind === 'mine' ? ' mine' : e.kind === 'narr' ? ' narr' : ''),
              {},
              h(
                'div.meta',
                {},
                h('b', { text: e.kind === 'narr' ? '旁白' : (e.speaker || '') }),
                e.place ? h('span.tp', { text: e.place }) : null
              ),
              h('div.txt', { text: e.text })
            )
          );
        });
    };

    const seg = (label, val) =>
      h(
        'button',
        {
          type: 'button',
          'aria-pressed': String(filter === val),
          onclick: (ev) => {
            filter = val;
            ev.currentTarget.parentNode.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
            ev.currentTarget.setAttribute('aria-pressed', 'true');
            render();
          },
        },
        label
      );

    render();
    const panel = openPanel(
      h(
        'div',
        {},
        head('走过的路', '故事记录'),
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' } },
          h('div.seg-ctl', {}, seg('全部', 'all'), seg('对白', 'say'), seg('旁白', 'narr'), seg('我', 'mine'), seg('选择', 'choice')),
          h('span', { style: { fontSize: '12px', color: 'var(--ui-ink-3)' }, text: `共 ${entries.length} 条` })
        ),
        body
      ),
      { wide: true, mode: 'log' }
    );
    panel.append(h('div.panel-foot', {}, btn('返回故事', 'secondary plain', closePanel)));
    return panel;
  }

  /* ------------------------------- 存档面板 ------------------------------ */

  function openSaves(mode) {
    const body = h('div.panel-body.scroll');
    const draw = () => {
      clear(body);
      const slots = SS.listSlots();
      const grid = h('div.slots');
      slots.forEach((s) => {
        const isAuto = s.id === 'auto';
        const thumb = h(
          'div.slot-thumb',
          { style: s.empty ? { opacity: '0.5' } : null },
          h('div.mini.mini-hill'),
          h('div.mini.mini-ground'),
          h('div.mini.mini-sun')
        );
        if (!s.empty && s.scene) {
          const vars = SP.palette.theme(s.scene, s.time || 'day', s.weather || 'clear');
          for (const k in vars) thumb.style.setProperty(k, vars[k]);
        }
        const info = h(
          'div.slot-info',
          {},
          h('b', {
            text: s.empty
              ? isAuto ? '自动存档 · 空' : `存档 ${s.id} · 空`
              : `${isAuto ? '自动存档' : '存档 ' + s.id} · ${s.chapter || ''} ${s.place ? '· ' + s.place : ''}`,
          }),
          s.empty
            ? h('span', { text: isAuto ? '每次推进都会写入这里' : '点击保存当前进度' })
            : h('span', { text: `${SP.relativeTime(s.at)} · 进度 ${s.p}% · 选择 ${s.choices || 0} 次` }),
          !s.empty && s.preview ? h('span.pv', { text: s.preview }) : null
        );
        const actions = h('div.slot-actions');
        if (mode === 'save') {
          if (!isAuto) {
            actions.append(
              h('button.icon-btn', { type: 'button', title: '写入这个存档', 'aria-label': '保存到此槽位', onclick: () => {
                SP.engine.saveTo(s.id);
                toast(`已保存到存档 ${s.id}`);
                draw();
              } }, '💾')
            );
          }
        } else if (!s.empty) {
          actions.append(
            h('button.icon-btn', { type: 'button', title: '读取', 'aria-label': '读取此存档', onclick: () => {
              closePanel();
              SP.engine.loadFrom(s.id);
              toast('已读取存档');
            } }, '▶')
          );
        }
        if (!s.empty && !isAuto) {
          actions.append(
            h('button.icon-btn.danger', { type: 'button', title: '删除', 'aria-label': '删除此存档', onclick: () => {
              if (confirm(`确定删除存档 ${s.id}？`)) { SS.removeSlot(s.id); draw(); }
            } }, '✕')
          );
        }
        grid.append(h('div.slot' + (s.empty ? ' empty' : ''), {}, thumb, info, actions));
      });
      body.append(grid);
      if (mode === 'save' && !SS.getSettings().autoSave) {
        body.append(h('p', { style: { marginTop: '14px', fontSize: '12px', color: 'var(--ui-ink-3)' }, text: '自动存档当前已关闭，可在「设置 → 数据」中重新开启。' }));
      }
    };
    draw();
    const panel = openPanel(
      h(
        'div',
        {},
        head(mode === 'save' ? '保存进度' : '读取进度', '存档'),
        body
      ),
      { wide: true, mode: mode + '-save' }
    );
    panel.append(
      h(
        'div.panel-foot',
        {},
        btn('返回', 'plain', closePanel),
        btn('导出全部存档', 'ghost sm', () => {
          SP.download(`晴天以后-存档-${new Date().toISOString().slice(0, 10)}.json`, SS.exportAll());
          toast('已导出存档文件');
        }),
        h('label.btn.plain.sm', { style: { position: 'relative', overflow: 'hidden' } },
          '导入存档',
          h('input', {
            type: 'file', accept: '.json,application/json',
            style: { position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' },
            onchange: (e) => {
              const f = e.target.files && e.target.files[0];
              if (!f) return;
              const r = new FileReader();
              r.onload = () => {
                const res = SS.importAll(String(r.result));
                toast(res.msg);
                draw();
              };
              r.readAsText(f);
            },
          })
        )
      )
    );
  }

  /* -------------------------------- 设置 --------------------------------- */

  const SPEED_LABELS = ['慢', '稍慢', '标准', '快', '瞬显'];
  const AUTO_LABELS = ['慢', '标准', '快'];
  const FONT_LABELS = ['小', '标准', '大', '特大'];

  function openSettings(fromPanel) {
    const s = SS.getSettings();
    const body = h('div.panel-body.scroll');

    const segRow = (label, sub, labels, key, onchange) => {
      const ctl = h('div.seg-ctl');
      labels.forEach((t, i) => {
        ctl.append(
          h(
            'button',
            {
              type: 'button',
              'aria-pressed': String(s[key] === i),
              onclick: (ev) => {
                s[key] = i;
                SS.saveSettings({ [key]: i });
                ev.currentTarget.parentNode.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
                ev.currentTarget.setAttribute('aria-pressed', 'true');
                if (onchange) onchange(i);
              },
            },
            t
          )
        );
      });
      return h('div.set-row', {}, h('div.lab', {}, label, sub ? h('small', { text: sub }) : null), ctl);
    };

    const switchRow = (label, sub, key, onchange) => {
      const sw = h('button.switch', {
        type: 'button',
        role: 'switch',
        'aria-pressed': String(!!s[key]),
        'aria-label': label,
        onclick: (ev) => {
          s[key] = !s[key];
          SS.saveSettings({ [key]: s[key] });
          ev.currentTarget.setAttribute('aria-pressed', String(s[key]));
          if (onchange) onchange(s[key]);
        },
      });
      return h('div.set-row', {}, h('div.lab', {}, label, sub ? h('small', { text: sub }) : null), sw);
    };

    const sliderRow = (label, sub, key, onchange) => {
      const out = h('output', { text: Math.round(s[key] * 100) + '%' });
      const input = h('input', {
        type: 'range', min: '0', max: '100', value: String(Math.round(s[key] * 100)),
        'aria-label': label,
        oninput: (ev) => {
          const v = Number(ev.target.value) / 100;
          s[key] = v;
          out.textContent = Math.round(v * 100) + '%';
          SS.saveSettings({ [key]: v });
          if (onchange) onchange(v);
        },
      });
      return h('div.set-row', {}, h('div.lab', {}, label, sub ? h('small', { text: sub }) : null), h('div.slider', {}, input, out));
    };

    body.append(
      h('div.set-group', {}, h('h3', { text: '文 本' }),
        segRow('文字速度', '影响打字机逐字显示的节奏', SPEED_LABELS, 'textSpeed', (i) => {
          if (i === 4 && SP.engine.state) SP.engine.finishText();
        }),
        segRow('自动播放节奏', '每段读完后停留多久', AUTO_LABELS, 'autoSpeed'),
        segRow('正文字号', '看清比什么都重要', FONT_LABELS, 'fontSize', (i) => {
          document.documentElement.dataset.fontsize = String(i);
        })
      ),
      h('div.set-group', {}, h('h3', { text: '声 音' }),
        sliderRow('总音量', null, 'volMaster', (v) => SP.audio.setVolume('master', v)),
        sliderRow('音乐', '情绪随剧情变化', 'volMusic', (v) => SP.audio.setVolume('music', v)),
        sliderRow('环境音', '地点与天气的氛围', 'volAmb', (v) => SP.audio.setVolume('amb', v)),
        sliderRow('音效', '点击、翻页、雷声', 'volSfx', (v) => SP.audio.setVolume('sfx', v)),
        switchRow('语气提示音', '角色开口时的轻声提示', 'voiceCue'),
        switchRow('系统语音朗读', '调用系统 TTS 朗读台词（实验）', 'tts', (v) => { SP.audio.tts = v; }),
        switchRow('打字音效', '逐字显示时的细微声响', 'typingSound')
      ),
      h('div.set-group', {}, h('h3', { text: '画 面' }),
        switchRow('减少动态效果', '关闭视差与粒子', 'reduceMotion', (v) => {
          document.documentElement.dataset.motion = v ? 'off' : 'on';
          if (SP.stage.el) SP.stage.el.dataset.motion = v ? 'off' : 'on';
        }),
        switchRow('夜读界面', '把界面压暗，画面不受影响', 'nightUI', (v) => {
          document.documentElement.dataset.ui = v ? 'night' : 'light';
        }),
        switchRow('显示进度条', null, 'showProgress', () => paintProgress(ST.NODES[SP.engine.state.id].p || 0))
      ),
      h('div.set-group', {}, h('h3', { text: '数 据' }),
        switchRow('自动存档', '每推进一段自动写入', 'autoSave'),
        h('div.set-row', {},
          h('div.lab', {}, '备份与迁移', h('small', { text: '导出全部存档、图鉴与成就' })),
          h('div', { style: { display: 'flex', gap: '7px', flexWrap: 'wrap', justifyContent: 'flex-end' } },
            btn('导出', 'ghost sm', () => { SP.download(`晴天以后-备份-${new Date().toISOString().slice(0, 10)}.json`, SS.exportAll()); toast('已导出'); }),
            h('label.btn.plain.sm', { style: { position: 'relative', overflow: 'hidden' } },
              '导入',
              h('input', { type: 'file', accept: '.json,application/json', style: { position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' },
                onchange: (e) => {
                  const f = e.target.files && e.target.files[0];
                  if (!f) return;
                  const r = new FileReader();
                  r.onload = () => { toast(SS.importAll(String(r.result)).msg); };
                  r.readAsText(f);
                },
              })
            )
          )
        ),
        h('div.set-row', {},
          h('div.lab', {}, '重置设置', h('small', { text: '只恢复默认设置，不动存档' })),
          btn('恢复默认', 'plain sm', () => { SS.resetSettings(); closePanel(); toast('设置已恢复默认'); })
        )
      )
    );

    const panel = openPanel(h('div', {}, head('设置', '调一调'), body), { wide: true, mode: 'settings' });
    panel.append(h('div.panel-foot', {}, btn('完成', 'primary', closePanel)));
  }

  /* ------------------------------- 结局图鉴 ------------------------------ */

  function openGallery(fromPanel) {
    const prog = SS.getProgress();
    const keys = Object.keys(ST.ENDINGS);
    const done = prog.endings;
    const R = 44, C = 2 * Math.PI * R;
    const pct = done.length / keys.length;
    const ring = h('div.ring', {
      html:
        `<svg width="108" height="108" viewBox="0 0 108 108" aria-hidden="true">
          <circle class="bg" cx="54" cy="54" r="${R}" fill="none" stroke-width="9"/>
          <circle class="fg" cx="54" cy="54" r="${R}" fill="none" stroke-width="9"
            stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - pct)).toFixed(1)}"/>
        </svg><div class="pct">${Math.round(pct * 100)}%</div>`,
    });

    const grid = h('div.grid-cards');
    keys.forEach((k) => {
      const e = ST.ENDINGS[k];
      const got = done.includes(k);
      grid.append(
        h(
          'div.e-card' + (got ? '' : ' locked') + (e.hidden ? ' hidden-ending' : ''),
          {},
          h('span.seal', { text: got ? '❋' : '？' }),
          h('span.tag', { text: got ? e.tag : '未解锁' }),
          h('b', { text: got ? e.title : '？？？？' }),
          h('p', { text: got ? e.body.slice(0, 62) + '…' : e.hidden ? '存在一条不在选项里的路。需要在这一学期里，既说出想做的事，也说真话，还在雨停后走出过宿舍。' : '还没有走到这个结局。' })
        )
      );
    });

    const panel = openPanel(
      h(
        'div',
        {},
        head('结局图鉴', '走遍了哪几条路'),
        h('div.ring-wrap', {}, ring,
          h('div', {},
            h('p', { style: { margin: 0 }, text: `已解锁 ${done.length} / ${keys.length} 个结局。` }),
            h('p', { style: { margin: '6px 0 0', fontSize: '13px', color: 'var(--ui-ink-3)' },
              text: '同一个开头，可以通向很不一样的半年。有些路只差一个选择。' })
          )
        ),
        h('h2', { text: '全部结局' }),
        grid
      ),
      { wide: true, mode: 'gallery' }
    );
    panel.append(h('div.panel-foot', {},
      btn('返回', 'plain', closePanel),
      btn('查看成就', 'ghost sm', () => openAchievements(true)),
      btn('分支图', 'ghost sm', () => openFlow(true))
    ));
  }

  /* -------------------------------- 成就 --------------------------------- */

  function openAchievements(fromPanel) {
    const prog = SS.getProgress();
    const grid = h('div.ach-grid');
    ST.ACHIEVEMENTS.forEach((a) => {
      const got = prog.achievements.includes(a.id);
      grid.append(
        h('div.ach' + (got ? '' : ' locked'), {},
          h('div.ic', { text: got ? a.icon : '🔒' }),
          h('div', {}, h('b', { text: got ? a.name : '？？' }), h('span', { text: a.desc }))
        )
      );
    });
    const panel = openPanel(
      h('div', {}, head('成就', `已解锁 ${prog.achievements.length} / ${ST.ACHIEVEMENTS.length}`),
        h('p', { text: '成就跨周目累计，重新开始不会清空。' }), grid),
      { wide: true, mode: 'achievements' }
    );
    panel.append(h('div.panel-foot', {}, btn('返回', 'plain', closePanel), btn('结局图鉴', 'ghost sm', () => openGallery(true))));
  }

  /* ------------------------------- 分支图 -------------------------------- */

  function openFlow(fromPanel) {
    const read = SS.getProgress().readNodes;
    const curriculum = SS.getProgress();
    const nodes = ST.NODES;
    const start = ST.START;
    // 漫游版的分岔由 flag 决定，节点 next 是函数：拿世界的取样把它摊开
    const samples = (SP.game && SP.game.flagSamples) ? SP.game.flagSamples() : [{}];
    const edges = ST.allEdges(samples);

    // 按 BFS 深度布局
    const depth = {};
    const order = [];
    const q = [start];
    depth[start] = 0;
    while (q.length) {
      const id = q.shift();
      order.push(id);
      const node = nodes[id];
      if (!node) continue;
      for (const [, to] of edges.filter((e) => e[0] === id)) {
        if (depth[to] == null) { depth[to] = depth[id] + 1; q.push(to); }
      }
    }
    const cols = {};
    order.forEach((id) => {
      const d = depth[id];
      (cols[d] = cols[d] || []).push(id);
    });
    const BW = 132, BH = 30, GX = 46, GY = 16, PAD = 20;
    let maxRows = 0;
    for (const d in cols) maxRows = Math.max(maxRows, cols[d].length);
    const width = PAD * 2 + (Object.keys(cols).length) * (BW + GX);
    const height = PAD * 2 + maxRows * (BH + GY);
    const pos = {};
    for (const d in cols) cols[d].forEach((id, i) => {
      pos[id] = { x: PAD + Number(d) * (BW + GX), y: PAD + i * (BH + GY) };
    });

    const edgeSvg = [];
    for (const [from, to] of edges) {
      if (!pos[from] || !pos[to]) continue;
      const a = pos[from], b = pos[to];
      const x1 = a.x + BW, y1 = a.y + BH / 2, x2 = b.x, y2 = b.y + BH / 2;
      const mx = (x1 + x2) / 2;
      const seen = read.includes(from) && read.includes(to);
      edgeSvg.push(
        `<path class="fl-edge${seen ? ' seen' : ''}" d="M ${x1} ${y1} C ${mx} ${y1} ${mx} ${y2} ${x2} ${y2}"/>`
      );
    }

    const current = SP.engine.state ? SP.engine.state.id : null;
    const nodeSvg = order.map((id) => {
      const p = pos[id];
      if (!p) return '';
      const node = nodes[id];
      const seen = read.includes(id);
      const label = node.ending ? '结局' : (node.place || id);
      const branch = typeof node.next === 'function' || node.choices;
      const color = node.ending ? '#c9714f' : branch ? '#4f9187' : '#6b8fae';
      return (
        `<g class="fl-node${seen ? '' : ' unread'}${id === current ? ' current' : ''}">` +
        `<rect x="${p.x}" y="${p.y}" width="${BW}" height="${BH}" rx="8" fill="${color}"/>` +
        `<text x="${p.x + BW / 2}" y="${p.y + BH / 2 + 4}" text-anchor="middle">${String(label).slice(0, 9)}</text></g>`
      );
    }).join('');

    const wrap = h('div.flow-wrap.scroll', {
      html: `<div class="flow"><svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${edgeSvg.join('')}${nodeSvg}</svg></div>`,
    });

    const panel = openPanel(
      h('div', {}, head('分支图', '这一学期有多少条路'),
        h('p', { text: `共 ${order.length} 个场景节点、${edges.length} 条连接。绿框是会分岔的地方——走哪一条，由这个月在自由活动里把时间花在谁身上决定。` }),
        wrap,
        h('div.legend', {},
          h('span', {}, h('i', { style: { background: '#4f9187' } }), '会分岔的节点'),
          h('span', {}, h('i', { style: { background: '#6b8fae' } }), '普通节点'),
          h('span', {}, h('i', { style: { background: '#c9714f' } }), '结局'),
          h('span', {}, h('i', { style: { background: 'var(--ui-line)' } }), '未走过的部分')
        )
      ),
      { wide: true, mode: 'flow' }
    );
    panel.append(h('div.panel-foot', {}, btn('返回', 'plain', closePanel)));
  }

  /* -------------------------------- 结局 --------------------------------- */

  function worldOf() {
    return (SP.game && SP.game.ensure) ? SP.game.ensure() : null;
  }
  function doneCount() {
    const w = worldOf();
    if (!w) return 0;
    return Object.keys(w.quests || {}).filter((q) => w.quests[q].done).length;
  }
  function pocketCount() {
    return (SP.game && SP.game.ownedItems) ? SP.game.ownedItems().length : 0;
  }

  /* 尾声补记：读的是这一局真实做过的事，不再读那些已经消失的 flag */
  function endingExtras() {
    const f = SP.engine.state.flags;
    const out = [];
    if (f.night === 'stop') out.push('寝室的群公告还留着那句话：今晚不再加镜头。');
    const w = (SP.game && SP.game.ensure) ? SP.game.ensure() : null;
    if (w) {
      const done = Object.keys(w.quests || {}).filter((q) => w.quests[q].done).length;
      if (done) out.push('这一学期，你替别人办了 ' + done + ' 件事。');
      const full = Object.keys(w.rapport || {}).filter((n) => w.rapport[n] >= SP.game.RAPPORT_MAX);
      if (full.length) out.push('熟到不能再熟的人：' + full.map((n) => SP.game.NPCS[n].name).join('、') + '。');
      const eggs = SP.game.itemsOfKind('egg').length;
      if (eggs) out.push('口袋里还躺着 ' + eggs + ' 件在角落里顺手捡的小东西。');
      const held = SP.game.itemsOfKind('quest').length;
      if (held) out.push('有 ' + held + ' 件别人给的东西还在你手上——总得还回去。');
    }
    return out;
  }

  function showEnding() {
    const f = SP.engine.state.flags;
    const legacy = { research: 'research_lab', explore: 'explore_project', create: 'create_story' };
    const key = ST.ENDINGS[f.ending] ? f.ending : ST.resolveEnding(f);
    const e = ST.ENDINGS[key];
    const fresh = SS.unlockEnding(key);
    SP.engine.checkAchievements();
    SP.audio.sfx('ending');
    paintProgress(100);
    $('#dialogue').classList.add('hidden');
    $('#choices').classList.add('hidden');
    $('#characters').innerHTML = '';
    SP.engine.currentChar = null;

    const extras = endingExtras();
    const st = SP.engine.state;
    const card = h(
      'div',
      {},
      h('div.eyebrow', { text: fresh ? '新的结局 · 已记入图鉴' : '你的故事 · 尾声' }),
      h('h1.ending-title', { text: e.title }),
      h('p.ending-body', { text: e.body }),
      extras.length ? h('div.ending-extra', { text: extras.join('') }) : null,
      h('p.ending-last', { text: '楼下还有一盏灯亮着。今晚不拍了，我们去吃点东西。' }),
      h(
        'div.ending-stats',
        {},
        h('span', {}, '完成委托 ', h('b', { text: String(doneCount()) })),
        h('span', {}, '口袋里 ', h('b', { text: String(pocketCount()) + ' 件' })),
        h('span', {}, '已解锁结局 ', h('b', { text: `${SS.getProgress().endings.length}/${Object.keys(ST.ENDINGS).length}` }))
      )
    );

    const panel = openPanel(card, { mode: 'ending' });
    panel.append(
      h(
        'div.panel-foot',
        {},
        btn('再走一条路', 'primary', () => { closePanel(); SP.engine.restart(); }),
        btn('回看故事', 'ghost', () => openLog(true)),
        btn('保存结局卡', 'ghost', () => exportEndingCard(e, extras)),
        btn('结局图鉴', 'plain', () => openGallery(true)),
        btn('回到封面', 'plain', () => showCover())
      )
    );
  }

  /** 用 canvas 现场画一张分享用的结局卡 */
  function exportEndingCard(e, extras) {
    try {
      const W = 1200, H = 760;
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const g = cv.getContext('2d');
      const stage = SP.stage.el;
      const cs = getComputedStyle(stage);
      const c = (name, fb) => (cs.getPropertyValue(name) || fb).trim() || fb;
      const sky1 = c('--sky-1', '#8fc9dd'), sky2 = c('--sky-2', '#cde5dd'), sky3 = c('--sky-3', '#eff1dd');
      const ink = c('--c-ink', '#3c5a5a'), warm = c('--c-warm', '#fff2cb'), mid = c('--c-mid', '#8fae9c');

      const grad = g.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, sky1); grad.addColorStop(0.55, sky2); grad.addColorStop(1, sky3);
      g.fillStyle = grad; g.fillRect(0, 0, W, H);

      g.globalAlpha = 0.9; g.fillStyle = warm;
      g.beginPath(); g.arc(W - 200, 150, 74, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 0.25; g.beginPath(); g.arc(W - 200, 150, 160, 0, Math.PI * 2); g.fill();

      g.globalAlpha = 0.85; g.fillStyle = mid;
      g.beginPath(); g.moveTo(-60, H); g.quadraticCurveTo(320, H - 300, 760, H - 120); g.quadraticCurveTo(1000, H - 30, W + 60, H - 130); g.lineTo(W + 60, H); g.closePath(); g.fill();
      g.globalAlpha = 0.55; g.fillStyle = ink;
      g.beginPath(); g.moveTo(-60, H); g.quadraticCurveTo(420, H - 170, 900, H - 60); g.quadraticCurveTo(1060, H - 20, W + 60, H - 70); g.lineTo(W + 60, H); g.closePath(); g.fill();

      g.globalAlpha = 1;
      g.fillStyle = 'rgba(255,253,245,0.93)';
      roundRect(g, 70, 70, W - 140, H - 140, 26);
      g.fill();

      g.fillStyle = ink;
      g.font = '600 15px "Microsoft YaHei", sans-serif';
      g.fillText('晴 天 以 后 · 结 局', 118, 140);

      g.font = '600 58px "Songti SC", "SimSun", serif';
      g.fillText(e.title, 116, 224);

      g.fillStyle = 'rgba(90,118,116,1)';
      g.font = '17px "Microsoft YaHei", sans-serif';
      wrapText(g, e.body, 118, 288, W - 260, 34);

      let y = 288 + wrapText(g, e.body, 118, 288, W - 260, 34) + 26;
      if (extras.length) {
        g.fillStyle = 'rgba(79,145,135,1)';
        g.font = '15px "Microsoft YaHei", sans-serif';
        const t = extras.join('');
        g.fillText('— — —', 118, y);
        y += 30;
        g.fillStyle = 'rgba(90,118,116,1)';
        wrapText(g, t, 118, y, W - 260, 30);
      }

      const st = SP.engine.state;
      g.fillStyle = 'rgba(139,163,157,1)';
      g.font = '13px ui-monospace, monospace';
      g.fillText(
        `这个学期，认真做过 ${st.choices} 次选择。`,
        118, H - 118
      );
      g.fillText(new Date().toLocaleDateString('zh-CN'), W - 260, H - 118);

      const url = cv.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `留一盏灯-${e.title}.png`;
      a.click();
      toast('结局卡已保存到下载目录');
    } catch (err) {
      toast('这个浏览器不支持导出图片。');
    }
  }

  function roundRect(g, x, y, w, hh, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + hh, r);
    g.arcTo(x + w, y + hh, x, y + hh, r);
    g.arcTo(x, y + hh, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function wrapText(g, text, x, y, maxW, lh) {
    const chars = String(text).split('');
    let line = '', lines = 0;
    for (const ch of chars) {
      const test = line + ch;
      if (g.measureText(test).width > maxW && line) {
        g.fillText(line, x, y + lines * lh);
        lines++;
        line = ch;
      } else line = test;
    }
    if (line) { g.fillText(line, x, y + lines * lh); lines++; }
    return lines * lh;
  }

  SP.ui = {
    toast, achievementPopup, paintBonds, paintProgress, syncModes,
    showChapterCard, openPanel, closePanel, isPanelOpen,
    showCover, openMenu, openLog, openSaves, openSettings, openNotebook,
    openGallery, openAchievements, openFlow, showEnding, exportEndingCard,
    head, btn,          // 漫游层（地图 / 任务手账）复用的面板骨架
    BOND_META,
  };
})(window);

