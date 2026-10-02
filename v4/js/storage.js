/*!
 * 晴天以后 · v2  |  storage.js
 * 持久化层：设置、3 个存档槽 + 自动存档、跨周目进度（结局图鉴 / 成就 / 已读节点）。
 */
(function (global) {
  'use strict';
  const SP = global.SP;
  const { Store } = SP;

  const K = {
    settings: 'sp4:settings',
    slots: 'sp4:slots',
    progress: 'sp4:progress',
    legacySave: 'after-sunshine-save-v2',
  };

  const DEFAULT_SETTINGS = {
    textSpeed: 2,        // 0 慢 1 稍慢 2 标准 3 快 4 瞬显
    autoSpeed: 1,        // 0 慢 1 标准 2 快
    fontSize: 1,         // 0 小 1 标准 2 大 3 特大
    volMaster: 0.8,
    volMusic: 0.62,
    volAmb: 0.5,
    volSfx: 0.6,
    typingSound: false,  // 打字音
    voiceCue: true,      // 语气提示音
    tts: false,          // 系统语音朗读
    reduceMotion: false,
    nightUI: false,      // 夜读界面
    showBonds: false,
    showProgress: true,
    autoSave: true,
    soundOn: false,      // 记住上次是否开着声音
    firstRun: true,
  };

  let settings = Object.assign({}, DEFAULT_SETTINGS, Store.get(K.settings, {}));
  let progress = Object.assign(
    { endings: [], achievements: [], readNodes: [], musicSeconds: 0, clears: 0, best: null },
    Store.get(K.progress, {})
  );
  let slots = Store.get(K.slots, { auto: null, 1: null, 2: null, 3: null });

  function saveSettings(patch) {
    if (patch) Object.assign(settings, patch);
    Store.set(K.settings, settings);
    return settings;
  }
  function getSettings() {
    return settings;
  }
  function resetSettings() {
    settings = Object.assign({}, DEFAULT_SETTINGS, { firstRun: false });
    Store.set(K.settings, settings);
    return settings;
  }

  function saveProgress() {
    Store.set(K.progress, progress);
    return progress;
  }
  function getProgress() {
    return progress;
  }

  /* ------------------------------- 存档槽 -------------------------------- */

  function listSlots() {
    const out = [];
    for (const id of ['auto', 1, 2, 3]) {
      const s = slots[id];
      out.push(
        s
          ? { id, empty: false, at: s.at, chapter: s.chapter, place: s.place, scene: s.scene, p: s.p, speaker: s.speaker, preview: s.preview, choices: s.choices, bonds: s.bonds }
          : { id, empty: true }
      );
    }
    return out;
  }

  function writeSlot(id, payload) {
    const s = JSON.parse(JSON.stringify(Object.assign({}, payload, { at: Date.now() })));
    slots[id] = s;
    Store.set(K.slots, slots);
    return s;
  }

  function readSlot(id) {
    const s = slots[id];
    if (!s || !s.state) return null;
    return JSON.parse(JSON.stringify(s));
  }

  function removeSlot(id) {
    slots[id] = null;
    Store.set(K.slots, slots);
  }

  /* ------------------------------- 跨周目 -------------------------------- */

  function unlockEnding(id) {
    if (!id || progress.endings.includes(id)) return false;
    progress.endings.push(id);
    progress.clears = (progress.clears || 0) + 1;
    saveProgress();
    return true;
  }

  function unlockAchievement(id) {
    if (progress.achievements.includes(id)) return false;
    progress.achievements.push(id);
    saveProgress();
    return true;
  }

  function markRead(nodeIds) {
    let added = 0;
    for (const id of [].concat(nodeIds)) {
      if (!progress.readNodes.includes(id)) {
        progress.readNodes.push(id);
        added++;
      }
    }
    if (added) saveProgress();
    return added;
  }

  function addMusicSeconds(sec) {
    progress.musicSeconds = (progress.musicSeconds || 0) + sec;
    if (progress.musicSeconds > 4) saveProgress();
  }

  /* ---------------------------- 导入 / 导出 ------------------------------ */

  function exportAll() {
    return JSON.stringify(
      { app: '晴天以后·留一盏灯（漫游版）', version: 4, exportedAt: new Date().toISOString(), slots, progress, settings },
      null,
      2
    );
  }

  function importAll(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return { ok: false, msg: '文件不是合法的 JSON。' };
    }
    if (!data || typeof data !== 'object') return { ok: false, msg: '文件内容为空。' };
    if (data.version !== 4 && data.version !== 3) return { ok: false, msg: '请使用《留一盏灯》的存档文件，旧版剧情存档不能混用。' };
    let n = 0;
    if (data.slots && typeof data.slots === 'object') {
      for (const id of ['auto', 1, 2, 3]) {
        if (data.slots[id] && data.slots[id].state && SP.story.NODES[data.slots[id].state.id]) {
          slots[id] = data.slots[id];
          n++;
        }
      }
      Store.set(K.slots, slots);
    }
    if (Array.isArray(data.progress?.endings)) {
      progress.endings = Array.from(new Set([].concat(progress.endings, data.progress.endings)));
      progress.achievements = Array.from(new Set([].concat(progress.achievements, data.progress.achievements || [])));
      progress.readNodes = Array.from(new Set([].concat(progress.readNodes, data.progress.readNodes || [])));
      progress.musicSeconds = Math.max(progress.musicSeconds || 0, data.progress.musicSeconds || 0);
      saveProgress();
    }
    if (data.settings && typeof data.settings === 'object') {
      settings = Object.assign(settings, data.settings, { firstRun: false });
      saveSettings();
    }
    return { ok: true, msg: `已导入 ${n} 个存档，并合并了收集进度。` };
  }

  function wipeAll() {
    Store.del(K.settings);
    Store.del(K.slots);
    Store.del(K.progress);
    settings = Object.assign({}, DEFAULT_SETTINGS);
    progress = { endings: [], achievements: [], readNodes: [], musicSeconds: 0, clears: 0, best: null };
    slots = { auto: null, 1: null, 2: null, 3: null };
  }

  /** 尝试把原版（v1）的存档迁移过来，作为一份可读取的自动存档 */
  function migrateLegacy() {
    if (progress.migrated) return false;
    const legacy = Store.get(K.legacySave, null);
    progress.migrated = true;
    if (!legacy || !legacy.id) {
      saveProgress();
      return false;
    }
    if (slots.auto) {
      saveProgress();
      return false;
    }
    slots.auto = {
      at: Date.now(),
      state: {
        id: legacy.id,
        flags: legacy.flags || {},
        bonds: { man: 0, yan: 0, family: 0, self: 0 },
        history: [],
        log: legacy.log || [],
        choices: 0,
        startedAt: Date.now(),
        playedMs: 0,
      },
      chapter: '', place: '', scene: '', p: 0, preview: '（来自旧版存档）', legacy: true,
    };
    Store.set(K.slots, slots);
    saveProgress();
    return true;
  }

  SP.storage = {
    K, DEFAULT_SETTINGS,
    getSettings, saveSettings, resetSettings,
    getProgress, saveProgress,
    listSlots, writeSlot, readSlot, removeSlot,
    unlockEnding, unlockAchievement, markRead, addMusicSeconds,
    exportAll, importAll, wipeAll, migrateLegacy,
  };
})(window);

