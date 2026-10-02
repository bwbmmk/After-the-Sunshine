#!/usr/bin/env node
/**
 * 电脑版打包（Electron 免安装绿色版）
 * ------------------------------------------------------------------
 * 产出：成品/留一盏灯·漫游版（电脑版）/
 *   · 留一盏灯·漫游版.exe      换名的 electron.exe，图标用游戏图标刷过
 *   · resources/app/          主进程 + 单文件游戏
 *   · 存档与设置/              运行时生成，存档就放在 exe 旁边
 *
 * 为什么是绿色版而不是安装包：整包拷到 U 盘、换台电脑就能接着玩，
 * 存档跟着包走，不用卸载器也不写注册表。
 *
 * 用法：node tools/pack-desktop.mjs [--quiet]
 */
import { readFile, writeFile, mkdir, rm, cp, stat, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PLAY = path.resolve(ROOT, '..');
const OUT = path.join(PLAY, '成品', '留一盏灯·漫游版（电脑版）');
const ELECTRON = path.join(PLAY, '_buildtools', 'electron', 'app');
const GAME = path.join(ROOT, 'dist', '留一盏灯·漫游版.html');
const ICON = path.join(ROOT, 'dist', '_icon', 'icon.ico');
const EXE_NAME = '留一盏灯·漫游版.exe';

const QUIET = process.argv.includes('--quiet');
const log = (...a) => { if (!QUIET) console.log(...a); };
const C = process.stdout.isTTY
  ? { d: '\x1b[2m', g: '\x1b[32m', r: '\x1b[31m', b: '\x1b[1m', x: '\x1b[0m' }
  : { d: '', g: '', r: '', b: '', x: '' };

async function exists(p) { try { await stat(p); return true; } catch { return false; } }

/* ── 0. 前置检查 ─────────────────────────────────────────────────── */
if (!(await exists(ELECTRON))) {
  console.error(`${C.r}✗ 找不到 Electron 运行时：${ELECTRON}${C.x}`);
  console.error('  先下载 electron-v35.0.0-win32-x64.zip 并解压到 _buildtools/electron/app');
  process.exit(1);
}

/* ── 新鲜度闸门 ────────────────────────────────────────────────────
 * 打包器吃的是 dist/ 里的单文件 HTML。要是源码比它新，说明这份 HTML 是
 * 上一版的 —— 装进 exe 不会报任何错，只会静默把旧游戏发出去。
 * 所以这里先比 mtime，源码更新就自动重建。
 */
async function newestMtime(p) {
  const s = await stat(p);
  if (!s.isDirectory()) return s.mtimeMs;
  let t = 0;
  for (const n of await readdir(p)) t = Math.max(t, await newestMtime(path.join(p, n)));
  return t;
}

async function ensureFreshGame() {
  const srcT = Math.max(
    await newestMtime(path.join(ROOT, 'index.html')),
    await newestMtime(path.join(ROOT, 'js')),
    await newestMtime(path.join(ROOT, 'css')),
  );
  const outT = (await exists(GAME)) ? (await stat(GAME)).mtimeMs : 0;
  if (srcT <= outT) return;
  log(`  ${C.d}源码比 dist 产物新，先重新构建…${C.x}`);
  await exec(process.execPath, [
    path.join(ROOT, 'tools', 'build.mjs'), '--min', '--out', '留一盏灯·漫游版.html', '--quiet',
  ], { cwd: ROOT, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
}

/* ── 1. 搬运运行时 ───────────────────────────────────────────────── */
log(`${C.b}电脑版打包${C.x}`);
await ensureFreshGame();
// 增量覆盖应用文件；OUT 下的「存档与设置」属于玩家，不可删除。
await mkdir(path.join(OUT, 'resources', 'app'), { recursive: true });

const entries = await readdir(ELECTRON);
let copied = 0;
for (const name of entries) {
  if (name === 'resources' || name === 'electron.exe') continue;
  await cp(path.join(ELECTRON, name), path.join(OUT, name), { recursive: true });
  copied++;
}
// resources 里只要 pak，不要 Electron 自带的默认应用
for (const name of await readdir(path.join(ELECTRON, 'resources'))) {
  if (name === 'default_app.asar') continue;
  await cp(path.join(ELECTRON, 'resources', name), path.join(OUT, 'resources', name), { recursive: true });
}
log(`  ${C.d}运行时 ${copied} 项已复制${C.x}`);

/* ── 2. 写入 app ─────────────────────────────────────────────────── */
const pkg = {
  name: 'after-the-sunshine-lamp',
  productName: '留一盏灯 · 漫游版',
  version: '1.0.0',
  description: '《晴天以后》留一盏灯 · 漫游版 —— 单机校园群像 + 自由行动 / 委托玩法',
  main: 'main.js',
  author: 'play',
};
await writeFile(path.join(OUT, 'resources', 'app', 'package.json'), JSON.stringify(pkg, null, 2), 'utf8');
await cp(GAME, path.join(OUT, 'resources', 'app', 'game.html'));
await cp(ICON, path.join(OUT, 'resources', 'app', 'icon.ico'));

await writeFile(path.join(OUT, 'resources', 'app', 'main.js'), `/* 留一盏灯 · 漫游版 —— 桌面外壳
 * 只做四件事：开一个干净窗口、把存档放到 exe 旁边、记住窗口大小、给全屏快捷键。
 * 游戏本身仍是一个自包含的 HTML，外壳不碰它一行代码。
 */
'use strict';
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const EXE_DIR = path.dirname(app.getPath('exe'));
const DATA_DIR = path.join(EXE_DIR, '存档与设置');
const STATE_FILE = path.join(DATA_DIR, 'window.json');

// 绿色版：存档、设置、窗口位置全部留在 exe 旁边，整包拷走就能接着玩。
try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  app.setPath('userData', DATA_DIR);
} catch (e) {
  // 装在只读目录（如 Program Files）就退回系统默认位置，不让它崩
}

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch (e) { return {}; }
}
function saveState(win) {
  try {
    if (win.isMinimized()) return;
    const b = win.getNormalBounds();
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify({
      x: b.x, y: b.y, width: b.width, height: b.height, max: win.isMaximized(),
    }));
  } catch (e) { /* 记不住窗口大小不算事故 */ }
}

let win = null;

function createWindow() {
  const st = readState();
  win = new BrowserWindow({
    width: st.width || 1360,
    height: st.height || 810,
    x: st.x,
    y: st.y,
    minWidth: 900,
    minHeight: 540,
    backgroundColor: '#dce1d8',
    icon: path.join(__dirname, 'icon.ico'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,   // 自动阅读不能在后台被节流
      spellcheck: false,
    },
  });
  if (st.max) win.maximize();

  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'game.html'));
  win.once('ready-to-show', () => win.show());

  // F11 全屏 / Esc 退出全屏 —— 阅读时长按可以独占屏幕
  win.webContents.on('before-input-event', (ev, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); ev.preventDefault(); }
    else if (input.key === 'Escape' && win.isFullScreen()) { win.setFullScreen(false); ev.preventDefault(); }
    else if (input.key === 'F12') { win.webContents.toggleDevTools(); ev.preventDefault(); }
  });

  // 站内不会有外部链接；万一有，交给系统浏览器，别在游戏窗口里开
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });

  for (const ev of ['resize', 'move', 'maximize', 'unmaximize']) {
    win.on(ev, () => saveState(win));
  }
  win.on('close', () => saveState(win));
  win.on('closed', () => { win = null; });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => app.quit());
  app.on('activate', () => { if (!win) createWindow(); });
}
`, 'utf8');

/* ── 3. 换名 + 刷图标 ────────────────────────────────────────────── */
const exeDst = path.join(OUT, EXE_NAME);
await cp(path.join(ELECTRON, 'electron.exe'), exeDst);

let iconOk = false;
const rceditCandidates = [
  path.join(PLAY, '_buildtools', 'rcedit', 'node_modules', 'rcedit', 'bin', 'rcedit-x64.exe'),
  path.join(PLAY, '_buildtools', 'rcedit', 'node_modules', 'rcedit', 'bin', 'rcedit.exe'),
];
for (const rc of rceditCandidates) {
  if (!(await exists(rc))) continue;
  try {
    await exec(rc, [
      exeDst,
      '--set-icon', ICON,
      '--set-file-version', '1.0.0',
      '--set-product-version', '1.0.0',
      '--set-version-string', 'FileDescription', '留一盏灯 · 漫游版',
      '--set-version-string', 'ProductName', '留一盏灯 · 漫游版',
      '--set-version-string', 'CompanyName', 'play',
      '--set-version-string', 'LegalCopyright', 'play',
      '--set-version-string', 'OriginalFilename', EXE_NAME,
    ], { windowsHide: true });
    iconOk = true;
    break;
  } catch (e) {
    log(`  ${C.d}rcedit 失败：${String(e.message).slice(0, 90)}${C.x}`);
  }
}

/* ── 4. 顺手在成品目录留一份网页版 ──────────────────────────────── */
// 同一份单文件 HTML，双击就能用浏览器打开 —— 不想装东西、或者想拷给别人
// 直接发文件时，这份最省事。
await mkdir(path.join(PLAY, '成品'), { recursive: true });
const webOut = path.join(PLAY, '成品', '留一盏灯·漫游版（网页版）.html');
await cp(GAME, webOut);

/* ── 5. 说明 ─────────────────────────────────────────────────────── */
await writeFile(path.join(OUT, '使用说明.txt'), `留一盏灯 · 漫游版（电脑版）
════════════════════════════════════════════

双击「${EXE_NAME}」开玩。不用安装、不联网、不写注册表。

  F11        全屏 / 窗口切换
  Esc        退出全屏
  空格/回车   推进对话
  M          校园地图
  J          任务手账
  H          帮助

这一版怎么玩
────────────────────────────────────────────
主线：点一下补完文字，空格或回车推进。主线里没有当场选项——
      十四处分岔各剩一段旁白，通向哪儿由你在自由行动里的取舍决定。

自由行动：主线走到章节边界，画面就交给漫游层。
  · 点场景里的圆头像找人聊天，熟络度每人满 5 心。
  · M 打开校园地图：14 处地点，橙点 = 有人找你，★ = 主线目的地。
  · J 打开任务手账：手上的委托、这个月没做的、听说的事、已完成。
  · ▤ 口袋：手上的事 / 留念 / 角落里的小东西，外加一叠纸片。

精力有限：28 条委托分成 10 个互斥组，接了组里的一件，
      同组其余几件这个月就作废（手账里会标出来）。这是这一版
      最主要的表达方式——不是让你全做完，是让你选。

道具：别人递过来的东西会真的收进口袋，交差时再给出去。
      有几条链跨了好几个人、甚至跨了两个月：
      程野 → 陈姨 → 程野；陈姨 → 阿言 → 陈姨；
      十月拿到的胶带，十二月才用得上。

满 5 心以后再去跟那个人说一次话，会拿到一件只给你的留念物。

存档放在「存档与设置」文件夹里（就在 exe 旁边）。
整个文件夹拷到 U 盘或另一台电脑，进度跟着走，不用重新开始。

想清空重玩：删掉「存档与设置」文件夹即可，游戏本体不受影响。

万一打不开、或者窗口一片空白：多半是老显卡驱动的兼容问题。
给 exe 建个桌面快捷方式，在「目标」末尾空一格加上 --disable-gpu 再启动，
走软件渲染就好。游戏是纯网页画的，关掉硬件加速不影响看。

这个版本其实就是那份单文件 HTML，外面套了一个干净的窗口：
没有地址栏、没有菜单栏，也不会跑到浏览器标签里。
`, 'utf8');

/* ── 6. 体积统计 ─────────────────────────────────────────────────── */
async function du(p) {
  const s = await stat(p);
  if (s.isFile()) return s.size;
  let total = 0;
  for (const n of await readdir(p)) total += await du(path.join(p, n));
  return total;
}
const bytes = await du(OUT);
const mb = (n) => (n / 1024 / 1024).toFixed(1) + ' MB';

console.log(`${C.g}✓ 电脑版已打包${C.x}  ${mb(bytes)}`);
console.log(`  ${path.relative(PLAY, OUT)}\\${EXE_NAME}`);
console.log(`  ${C.d}图标${iconOk ? '已写入 exe' : '仅窗口图标（rcedit 不可用）'}${C.x}`);
