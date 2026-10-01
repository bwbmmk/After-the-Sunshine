/*!
 * 晴天以后 · v2  |  audio.js
 * 完全程序化生成的三总线音频引擎（不依赖任何音频文件）：
 *   music  ── 情绪驱动的和声进行 + 琶音 + 铺底
 *   amb    ── 地点环境噪音 + 天气（雨/风）
 *   sfx    ── 点击、翻页、选择、雷声、烟花
 * 总线结构：bus → (send) reverb → master → compressor → destination
 */
(function (global) {
  'use strict';
  const SP = global.SP;
  const { clamp, rng } = SP;

  /* ------------------------------- 情绪配置 ------------------------------- */
  // chord 用半音偏移表示，0 = 主音
  const MOODS = {
    warm: {
      root: 261.63, bpm: 74, wave: 'sine', lvl: 0.9, rev: 0.34,
      chords: [[0, 4, 7], [-3, 2, 5], [2, 5, 9], [-5, 0, 4]],
      arp: [0, 1, 2, 1, 0, 2, 1, 2], sparkle: 0.7, bass: 0.9,
    },
    calm: {
      root: 246.94, bpm: 68, wave: 'sine', lvl: 0.8, rev: 0.38,
      chords: [[0, 3, 7], [-2, 3, 5], [-4, 0, 3], [-5, -2, 2]],
      arp: [0, 2, 1, 2, 0, 1, 2, 1], sparkle: 0.4, bass: 0.8,
    },
    melancholy: {
      root: 220.0, bpm: 62, wave: 'triangle', lvl: 0.85, rev: 0.44,
      chords: [[0, 3, 7], [-4, 0, 3], [-5, -1, 2], [-2, 2, 5]],
      arp: [0, 1, 2, 1, 2, 1, 0, 1], sparkle: 0.25, bass: 1.0,
    },
    night: {
      root: 196.0, bpm: 58, wave: 'sine', lvl: 0.75, rev: 0.5,
      chords: [[0, 3, 7], [-2, 1, 5], [-4, 3, 7], [-5, 0, 3]],
      arp: [0, 2, 1, 2, 1, 0, 2, 1], sparkle: 0.6, bass: 0.85,
    },
    tender: {
      root: 233.08, bpm: 66, wave: 'sine', lvl: 0.85, rev: 0.42,
      chords: [[0, 4, 7], [-3, 4, 9], [-5, 2, 7], [-2, 2, 5]],
      arp: [0, 1, 2, 2, 1, 0, 1, 2], sparkle: 0.8, bass: 0.85,
    },
    hope: {
      root: 293.66, bpm: 84, wave: 'sine', lvl: 0.95, rev: 0.36,
      chords: [[0, 4, 7], [2, 5, 9], [-3, 2, 7], [-1, 4, 7]],
      arp: [0, 1, 2, 1, 2, 0, 1, 2], sparkle: 1.0, bass: 0.95,
    },
  };

  /* ------------------------------- 环境音配置 ------------------------------ */
  const AMB = {
    campus: { type: 'lowpass', freq: 520, gain: 0.030, lfo: 0.06 },
    avenue: { type: 'lowpass', freq: 460, gain: 0.032, lfo: 0.09 },
    club: { type: 'bandpass', freq: 900, gain: 0.038, lfo: 0.22 },
    canteen: { type: 'bandpass', freq: 640, gain: 0.036, lfo: 0.18 },
    plaza: { type: 'lowpass', freq: 600, gain: 0.030, lfo: 0.08 },
    classroom: { type: 'lowpass', freq: 380, gain: 0.016, lfo: 0.05 },
    lecture: { type: 'lowpass', freq: 340, gain: 0.015, lfo: 0.05 },
    dorm: { type: 'bandpass', freq: 1350, gain: 0.034, lfo: 0.1 },
    library: { type: 'lowpass', freq: 280, gain: 0.013, lfo: 0.04 },
    lake: { type: 'lowpass', freq: 1000, gain: 0.034, lfo: 0.14 },
    cafe: { type: 'bandpass', freq: 420, gain: 0.028, lfo: 0.12 },
    roof: { type: 'lowpass', freq: 700, gain: 0.038, lfo: 0.07 },
    track: { type: 'lowpass', freq: 740, gain: 0.038, lfo: 0.09 },
    hall: { type: 'lowpass', freq: 300, gain: 0.020, lfo: 0.05 },
  };

  const Audio = {
    ctx: null,
    ready: false,
    enabled: false,
    _mood: 'warm',
    _scene: 'campus',
    _weather: 'clear',
    played: 0,
    _vol: { master: 0.8, music: 0.62, amb: 0.5, sfx: 0.6 },
    _tick: null,
    _nextTime: 0,
    _step: 0,
    _startedAt: 0,
    tts: false,
  };

  /* ------------------------------- 初始化 -------------------------------- */

  function ensure() {
    if (Audio.ctx) return true;
    const Ctx = global.AudioContext || global.webkitAudioContext;
    if (!Ctx) return false;
    try {
      const ctx = new Ctx();
      Audio.ctx = ctx;

      Audio.master = ctx.createGain();
      Audio.master.gain.value = 0;
      Audio.comp = ctx.createDynamicsCompressor();
      Audio.comp.threshold.value = -14;
      Audio.comp.knee.value = 22;
      Audio.comp.ratio.value = 3.2;
      Audio.comp.attack.value = 0.006;
      Audio.comp.release.value = 0.28;
      Audio.master.connect(Audio.comp).connect(ctx.destination);

      Audio.bus = {};
      for (const k of ['music', 'amb', 'sfx']) {
        const g = ctx.createGain();
        g.gain.value = Audio._vol[k];
        g.connect(Audio.master);
        Audio.bus[k] = g;
      }

      // 生成式混响脉冲响应（无需外部音频文件）
      const len = Math.floor(ctx.sampleRate * 2.6);
      const ir = ctx.createBuffer(2, len, ctx.sampleRate);
      const r = rng(20260917);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < len; i++) {
          const t = i / len;
          d[i] = (r() * 2 - 1) * Math.pow(1 - t, 2.6) * (i < 240 ? i / 240 : 1);
        }
      }
      Audio.rev = ctx.createConvolver();
      Audio.rev.buffer = ir;
      Audio.revGain = ctx.createGain();
      Audio.revGain.gain.value = 1;
      Audio.rev.connect(Audio.revGain).connect(Audio.master);

      Audio.ready = true;
      return true;
    } catch {
      return false;
    }
  }

  function now() {
    return Audio.ctx ? Audio.ctx.currentTime : 0;
  }

  /* ------------------------------ 基础发声 ------------------------------- */

  /** 单个音符，带指数包络，可送入混响 */
  function tone(freq, at, dur, vol, type = 'sine', revSend = 0, detune = 0) {
    const ctx = Audio.ctx;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (detune) osc.detune.setValueAtTime(detune, at);
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), at + 0.045);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(env);
    env.connect(Audio.bus.music);
    if (revSend > 0) {
      const send = ctx.createGain();
      send.gain.value = revSend;
      env.connect(send).connect(Audio.rev);
    }
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }

  /** 噪声源（环境音 / 打击音） */
  function noiseBuffer(seconds = 2) {
    const ctx = Audio.ctx;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02; // 轻微布朗化，听感更自然
      d[i] = white * 0.7 + last * 3;
    }
    return buf;
  }

  /* -------------------------------- 音乐 --------------------------------- */

  function stepDur() {
    const m = MOODS[Audio._mood] || MOODS.warm;
    return 60 / m.bpm / 2; // 八分音符
  }

  function scheduleStep(at, step) {
    const m = MOODS[Audio._mood] || MOODS.warm;
    const bar = Math.floor(step / 8);
    const chord = m.chords[bar % m.chords.length];
    const idx = step % 8;
    const degree = m.arp[idx];
    const semi = chord[degree % chord.length] + (degree >= chord.length ? 12 : 0);
    const freq = m.root * Math.pow(2, semi / 12);
    const lvl = m.lvl * (0.075 + (idx % 2 ? 0.012 : 0));

    // 主音
    tone(freq, at, 0.9, lvl, m.wave, m.rev);
    // 低八度垫音
    if (idx === 0 || idx === 4) tone(freq / 2, at, 2.0, lvl * 0.5 * m.bass, 'triangle', m.rev * 1.2);
    // 铺底长音
    if (idx === 0) {
      chord.forEach((c, i) => tone(m.root * Math.pow(2, (c - 12) / 12), at, 3.6, 0.022, 'sine', m.rev * 1.4, i * 4));
    }
    // 高音点缀
    const r = rng(step * 7919 + (Audio._mood.charCodeAt(0) || 1));
    if (r() < 0.36 * m.sparkle) {
      tone(freq * 4, at + stepDur() * 0.5, 0.34, 0.012, 'sine', m.rev * 1.6);
    }
    if (r() < 0.14 * m.sparkle) {
      tone(freq * 6, at + stepDur() * 0.25, 0.26, 0.008, 'triangle', m.rev * 1.8);
    }
  }

  function runTick() {
    const ctx = Audio.ctx;
    if (!ctx) return;
    const ahead = 0.45;
    let guard = 0;
    while (Audio._nextTime < ctx.currentTime + ahead && guard++ < 32) {
      scheduleStep(Audio._nextTime, Audio._step);
      Audio._nextTime += stepDur();
      Audio._step++;
    }
  }

  /* ------------------------------ 环境音 --------------------------------- */

  let ambNodes = null;

  function killAmbience(fade = 0.6) {
    if (!ambNodes) return;
    const old = ambNodes;
    ambNodes = null;
    try {
      old.gain.gain.cancelScheduledValues(now());
      old.gain.gain.setTargetAtTime(0.0001, now(), fade / 3);
      setTimeout(() => {
        try { old.src.stop(); } catch {}
        try { old.lfo.stop(); } catch {}
      }, fade * 1200);
    } catch {}
  }

  function startAmbience() {
    if (!Audio.enabled || !Audio.ctx) return;
    const ctx = Audio.ctx;
    killAmbience(0.8);
    const a = AMB[Audio._scene] || AMB.campus;
    const w = { clear: 0, fair: 0, overcast: 0.06, drizzle: 0.4, rain: 1, fog: 0.1, snow: 0.25 }[Audio._weather] || 0;

    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(3);
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = w > 0.3 ? 'highpass' : a.type;
    filt.frequency.value = w > 0.3 ? 900 : a.freq;
    filt.Q.value = a.type === 'bandpass' ? 0.9 : 0.5;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    src.connect(filt).connect(gain).connect(Audio.bus.amb);

    // 缓慢滤波摆动，让环境音“呼吸”
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = a.lfo;
    lfoGain.gain.value = a.freq * 0.28;
    lfo.connect(lfoGain).connect(filt.frequency);

    src.start();
    lfo.start();
    const target = a.gain * (1 + w * 1.6);
    gain.gain.setTargetAtTime(target, now(), 0.9);
    ambNodes = { src, gain, lfo };
    Audio._ambBase = target;
  }

  /** 天气变化时平滑调整环境音 */
  function updateAmbience() {
    if (!ambNodes) return;
    const a = AMB[Audio._scene] || AMB.campus;
    const w = { clear: 0, fair: 0, overcast: 0.06, drizzle: 0.4, rain: 1, fog: 0.1, snow: 0.25 }[Audio._weather] || 0;
    ambNodes.gain.gain.setTargetAtTime(a.gain * (1 + w * 1.6), now(), 1.2);
  }

  /* -------------------------------- 音效 --------------------------------- */

  const SFX = {
    click() {
      tone(1180, now() + 0.001, 0.07, 0.05, 'triangle', 0.2);
      tone(1760, now() + 0.03, 0.06, 0.028, 'sine', 0.25);
    },
    page() {
      const ctx = Audio.ctx, at = now();
      const s = ctx.createBufferSource();
      s.buffer = noiseBuffer(0.4);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 0.8;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.07, at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
      s.connect(f).connect(g).connect(Audio.bus.sfx);
      s.start(at); s.stop(at + 0.4);
    },
    choice() {
      const at = now() + 0.001;
      [0, 5, 9].forEach((s, i) => tone(523.25 * Math.pow(2, s / 12), at + i * 0.055, 0.34, 0.05, 'sine', 0.5));
    },
    hover() {
      tone(1320, now() + 0.001, 0.045, 0.018, 'sine', 0.15);
    },
    whoosh() {
      const ctx = Audio.ctx, at = now();
      const s = ctx.createBufferSource();
      s.buffer = noiseBuffer(1.2);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.Q.value = 1.4;
      f.frequency.setValueAtTime(220, at);
      f.frequency.exponentialRampToValueAtTime(1900, at + 0.5);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.05, at + 0.16);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.72);
      s.connect(f).connect(g).connect(Audio.bus.sfx);
      const send = ctx.createGain(); send.gain.value = 0.5; g.connect(send).connect(Audio.rev);
      s.start(at); s.stop(at + 1.2);
    },
    thunder() {
      const ctx = Audio.ctx, at = now();
      const s = ctx.createBufferSource();
      s.buffer = noiseBuffer(2.4);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(420, at);
      f.frequency.exponentialRampToValueAtTime(90, at + 1.8);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.09, at + 0.12);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 2.2);
      s.connect(f).connect(g).connect(Audio.bus.sfx);
      const send = ctx.createGain(); send.gain.value = 0.7; g.connect(send).connect(Audio.rev);
      s.start(at); s.stop(at + 2.4);
      tone(58, at + 0.05, 1.9, 0.05, 'sine', 0.6);
    },
    fireworks() {
      const at = now();
      for (let i = 0; i < 22; i++) {
        tone(400 + Math.random() * 2400, at + i * 0.035 + Math.random() * 0.02, 0.2, 0.014, 'triangle', 0.6);
      }
      tone(72, at + 0.1, 1.2, 0.05, 'sine', 0.5);
    },
    crowd() {
      const at = now();
      for (let i = 0; i < 5; i++) tone(300 + i * 90, at + i * 0.09, 0.5, 0.012, 'triangle', 0.6);
    },
    rainwalk() {
      const at = now();
      for (let i = 0; i < 7; i++) tone(1500 + Math.random() * 900, at + i * 0.11, 0.14, 0.01, 'sine', 0.5);
    },
    unlock() {
      const at = now() + 0.001;
      [0, 4, 7, 12, 16].forEach((s, i) => tone(392 * Math.pow(2, s / 12), at + i * 0.09, 0.9, 0.045, 'sine', 0.7));
    },
    ending() {
      const at = now() + 0.001;
      [0, 4, 7, 12].forEach((s, i) => tone(261.63 * Math.pow(2, s / 12), at + i * 0.16, 2.4, 0.05, 'sine', 0.8));
      tone(130.81, at, 3.2, 0.05, 'triangle', 0.7);
    },
  };

  function sfx(name) {
    if (!Audio.ready || !Audio.enabled) return;
    try {
      if (Audio.ctx.state === 'suspended') Audio.ctx.resume();
      (SFX[name] || SFX.click)();
    } catch {}
  }

  /* ------------------------------- 语气声 -------------------------------- */
  // 用短促的双音提示替代 TTS：更稳定、更符合“轻声应了一句”的听感。
  const VOICE_PITCH = { man: 1.22, yan: 0.86, mom: 1.02, me: 1.0, null: 1.0 };

  function voice(person, opts = {}) {
    if (!Audio.ready || !Audio.enabled) return;
    const p = VOICE_PITCH[person] != null ? VOICE_PITCH[person] : 1.0;
    const at = now() + 0.002;
    try {
      tone(660 * p, at, 0.10, 0.024, 'sine', 0.35);
      tone(880 * p, at + 0.075, 0.13, 0.018, 'sine', 0.4);
    } catch {}
    if (Audio.tts && person && opts.text && global.speechSynthesis) {
      try {
        const u = new SpeechSynthesisUtterance(opts.text);
        u.lang = 'zh-CN';
        u.rate = 1.05;
        u.pitch = p;
        u.volume = 0.22;
        global.speechSynthesis.cancel();
        global.speechSynthesis.speak(u);
      } catch {}
    }
  }

  /* -------------------------------- 控制 --------------------------------- */

  function enable(on) {
    if (on) {
      if (!ensure()) return false;
      Audio.ctx.resume();
      Audio.enabled = true;
      Audio._startedAt = Date.now();
      Audio.master.gain.setTargetAtTime(Audio._vol.master, now(), 0.2);
      Audio._nextTime = now() + 0.1;
      Audio._step = 0;
      runTick();
      clearInterval(Audio._tick);
      Audio._tick = setInterval(runTick, 120);
      startAmbience();
      return true;
    }
    Audio.enabled = false;
    clearInterval(Audio._tick);
    Audio._tick = null;
    if (Audio.ctx) Audio.master.gain.setTargetAtTime(0.0001, now(), 0.12);
    killAmbience(0.5);
    try { global.speechSynthesis && global.speechSynthesis.cancel(); } catch {}
    return true;
  }

  function toggle() {
    return enable(!Audio.enabled);
  }

  function setMood(m) {
    if (!MOODS[m] || m === Audio._mood) return;
    Audio._mood = m;
    Audio._step = 0; // 新情绪从和声第一小节开始
  }

  function setScene(scene, weather) {
    const changed = Audio._scene !== scene || Audio._weather !== weather;
    Audio._scene = scene || Audio._scene;
    Audio._weather = weather || Audio._weather;
    if (!changed || !Audio.enabled) return;
    startAmbience();
  }

  function setVolume(bus, v) {
    Audio._vol[bus] = clamp(v, 0, 1);
    if (!Audio.ctx) return;
    if (bus === 'master') Audio.master.gain.setTargetAtTime(Audio.enabled ? Audio._vol.master : 0.0001, now(), 0.08);
    else if (Audio.bus[bus]) Audio.bus[bus].gain.setTargetAtTime(Audio._vol[bus], now(), 0.08);
  }

  // 统计真实播放时长（用于成就）
  setInterval(() => {
    if (Audio.enabled && Audio.ctx && Audio.ctx.state === 'running') Audio.played += 0.5;
  }, 500);

  Object.assign(Audio, {
    ensure, enable, toggle, setMood, setScene, setVolume, sfx, voice,
    MOODS, get enabledNow() { return Audio.enabled; },
  });
  SP.audio = Audio;
})(window);
