/*!
 * 晴天以后 · v2  |  main.js
 * 启动与事件绑定：把舞台、音频、存储、引擎、界面串起来，并接管键盘与手势。
 */
(function (global) {
  'use strict';
  const SP = global.SP;
  const { $ } = SP;
  const SS = SP.storage;

  function applySettings() {
    const s = SS.getSettings();
    document.documentElement.dataset.fontsize = String(s.fontSize);
    document.documentElement.dataset.motion = s.reduceMotion ? 'off' : 'on';
    document.documentElement.dataset.ui = s.nightUI ? 'night' : 'light';
    SP.audio.tts = !!s.tts;
    SP.audio.setVolume('master', s.volMaster);
    SP.audio.setVolume('music', s.volMusic);
    SP.audio.setVolume('amb', s.volAmb);
    SP.audio.setVolume('sfx', s.volSfx);
  }

  function boot() {
    applySettings();

    SP.stage.init($('#game'));
    SP.engine.init(null);
    SP.ui.paintBonds();
    SP.ui.syncModes();

    // 首屏：先摆一个安静的黄昏校门口当背景
    SP.stage.setScene('campus', { time: 'dusk', weather: 'fair', instant: true });
    SP.palette.applyTheme(SP.stage.el, 'campus', 'dusk', 'fair');

    SP.ui.showCover();
    wireUI();
    wireKeyboard();
    wireFirstGesture();
  }

  /* ------------------------------- 按钮绑定 ------------------------------ */

  function wireUI() {
    $('#pocketBtn').addEventListener('click', () => { if (!SP.ui.isPanelOpen()) SP.ui.openNotebook(); });
    $('#backBtn').addEventListener('click', () => {
      if (SP.ui.isPanelOpen()) return;
      SP.engine.back();
    });
    $('#logBtn').addEventListener('click', () => { if (!SP.ui.isPanelOpen()) SP.ui.openLog(); });
    $('#autoBtn').addEventListener('click', () => { if (!SP.ui.isPanelOpen()) SP.engine.toggleAuto(); });
    $('#skipBtn').addEventListener('click', () => { if (!SP.ui.isPanelOpen()) SP.engine.toggleSkip(); });
    $('#saveBtn').addEventListener('click', () => { if (!SP.ui.isPanelOpen()) SP.ui.openSaves('save'); });
    $('#menuBtn').addEventListener('click', () => { if (!SP.ui.isPanelOpen()) SP.ui.openMenu(); });

    // 漫游层：地图、任务手账、继续主线
    const openMap = () => { if (!SP.ui.isPanelOpen()) SP.roam.openMap(); };
    const openJournal = () => { if (!SP.ui.isPanelOpen()) SP.roam.openJournal(); };
    $('#mapBtn').addEventListener('click', openMap);
    $('#questBtn').addEventListener('click', openJournal);
    $('#roamMapBtn').addEventListener('click', openMap);
    $('#roamJournalBtn').addEventListener('click', openJournal);
    $('#roamGoBtn').addEventListener('click', () => { if (!SP.ui.isPanelOpen()) SP.roam.continueMain(); });

    $('#musicBtn').addEventListener('click', () => {
      const ok = SP.audio.toggle();
      if (ok === false) {
        SP.ui.toast('这个浏览器不支持 WebAudio。');
        return;
      }
      SS.saveSettings({ soundOn: SP.audio.enabled });
      SP.ui.syncModes();
      SP.ui.toast(SP.audio.enabled ? '音乐与音效已开启' : '已静音');
    });

    $('#nextBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      SP.engine.next();
    });

    $('#dialogue').addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      if (SP.ui.isPanelOpen()) return;
      SP.engine.next();
    });

    // 面板遮罩：点击空白处关闭（封面与结局除外）
    $('#overlay').addEventListener('click', (e) => {
      if (e.target.id !== 'overlay') return;
      const mode = $('#overlay').dataset.mode;
      if (mode === 'cover' || mode === 'ending') return;
      SP.ui.closePanel();
    });
  }

  /* ------------------------------- 键盘绑定 ------------------------------ */

  function wireKeyboard() {
    let ctrlSkip = false;

    document.addEventListener('keydown', (e) => {
      const panelOpen = SP.ui.isPanelOpen();

      if (e.key === 'Escape') {
        const mode = $('#overlay').dataset.mode;
        if (panelOpen) {
          if (mode === 'cover' || mode === 'ending') return;
          SP.ui.closePanel();
        } else {
          SP.ui.openMenu();
        }
        e.preventDefault();
        return;
      }

      if (panelOpen) {
        // 面板内的 Tab 循环由浏览器处理，这里只屏蔽会误触故事推进的按键
        return;
      }

      if (e.ctrlKey && !ctrlSkip && !e.shiftKey && !e.altKey) {
        ctrlSkip = true;
        if (!SP.engine.skip) SP.engine.toggleSkip();
        return;
      }

      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case ' ':
        case 'Enter':
          e.preventDefault();
          SP.engine.next();
          break;
        case 'Backspace':
          e.preventDefault();
          SP.engine.back();
          break;
        case 'ArrowDown':
        case 'ArrowUp':
          break;
        case 'a': case 'A':
          SP.engine.toggleAuto();
          break;
        case 'l': case 'L':
          SP.ui.openLog();
          break;
        case 's': case 'S':
          SP.ui.openSaves('save');
          break;
        case 'g': case 'G':
          SP.ui.openGallery();
          break;
        case 'm': case 'M':
          SP.roam.openMap();
          break;
        case 'j': case 'J':
          SP.roam.openJournal();
          break;
        case 'f': case 'F':
          SP.ui.openFlow();
          break;
        case 't': case 'T':
          SP.ui.openSettings();
          break;
        case 'h': case 'H':
          SP.audio.sfx('click');
          SP.ui.toast('Space 继续 · Ctrl 快进已读 · Esc 菜单 · L 记录 · S 存档 · M 地图 · J 任务', 4200);
          break;
        case '1': case '2': case '3': case '4': {
          const idx = Number(e.key) - 1;
          const btns = document.querySelectorAll('#choices .choice');
          if (btns[idx]) btns[idx].click();
          break;
        }
        default:
          break;
      }
    });

    document.addEventListener('keyup', (e) => {
      if ((e.key === 'Control' || e.key === 'Meta') && ctrlSkip) {
        ctrlSkip = false;
        if (SP.engine.skip) SP.engine.toggleSkip();
      }
    });

    // 切到后台时暂停自动播放，回来再继续
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) SP.engine.stopAuto();
      else if (SP.engine.auto) SP.engine.toggleAuto();
    });

    window.addEventListener('blur', () => {
      if (ctrlSkip && SP.engine.skip) SP.engine.toggleSkip();
      ctrlSkip = false;
    });
  }

  /* ------------------------ 首次交互解锁音频（自动播放策略） ------------------------ */

  function wireFirstGesture() {
    const unlock = () => {
      const s = SS.getSettings();
      if (s.soundOn && !SP.audio.enabled) {
        SP.audio.enable(true);
        SP.ui.syncModes();
      }
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    // 恢复按钮文案
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);

