#!/usr/bin/env node
/**
 * 安卓版打包（真实 APK，不用 Android Studio、不用 Gradle）
 * ------------------------------------------------------------------
 * 用 JDK 的 javac + Android build-tools 的 aapt2 / d8 / zipalign / apksigner
 * 手搓一条最小构建链：
 *
 *   aapt2 compile  →  资源编译
 *   aapt2 link     →  资源链接 + AndroidManifest 编成二进制 + 把 assets 塞进 APK
 *   javac          →  WebView 外壳（一个 Activity）编译成 class
 *   d8             →  class 转 dex
 *   zipalign       →  4 字节对齐
 *   apksigner      →  自签
 *
 * 外壳只做四件事：全屏 WebView 载入内置游戏、返回键先收界面再退出、
 * 存档走 localStorage（用 https 虚拟源，file:// 的 localStorage 在
 * 部分 WebView 版本上不落盘）、屏幕常亮方便长时间阅读。
 *
 * 用法：node tools/pack-android.mjs [--quiet]
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
const TOOLS = path.join(PLAY, '_buildtools');
const BT = path.join(TOOLS, 'bt', 'android-15');
const PLATFORM = path.join(TOOLS, 'plat', 'android-35', 'android.jar');
const OUTDIR = path.join(PLAY, '成品');
const OUT = path.join(OUTDIR, '留一盏灯·漫游版.apk');
const WORK = path.join(TOOLS, 'android-build');
const GAME = path.join(ROOT, 'dist', '留一盏灯·漫游版.html');
const ICONS = path.join(ROOT, 'dist', '_icon', 'android');
const KS = path.join(TOOLS, 'keystore', 'lamp.jks');

const QUIET = process.argv.includes('--quiet');
const log = (...a) => { if (!QUIET) console.log(...a); };
const C = process.stdout.isTTY
  ? { d: '\x1b[2m', g: '\x1b[32m', r: '\x1b[31m', b: '\x1b[1m', x: '\x1b[0m' }
  : { d: '', g: '', r: '', b: '', x: '' };

const APP = {
  pkg: 'com.afterrain.lamp',
  label: '留一盏灯',
  versionName: '1.0.1',
  versionCode: 2,
  minSdk: 21,
  targetSdk: 34,
};

async function exists(p) { try { await stat(p); return true; } catch { return false; } }
const step = (m) => log(`  ${C.d}${m}${C.x}`);
const run = (cmd, args, opts = {}) => exec(cmd, args, { windowsHide: true, maxBuffer: 64 * 1024 * 1024, ...opts });

/* ── 前置检查 ────────────────────────────────────────────────────── */
const need = [
  ['aapt2', path.join(BT, 'aapt2.exe')],
  ['d8 的 jar', path.join(BT, 'lib', 'd8.jar')],
  ['zipalign', path.join(BT, 'zipalign.exe')],
  ['apksigner 的 jar', path.join(BT, 'lib', 'apksigner.jar')],
  ['android.jar', PLATFORM],
];
for (const [name, p] of need) {
  if (!(await exists(p))) {
    console.error(`${C.r}✗ 缺少 ${name}：${p}${C.x}`);
    process.exit(1);
  }
}

log(`${C.b}安卓版打包${C.x}`);

/* ── 新鲜度闸门 ────────────────────────────────────────────────────
 * APK 装的是 dist/ 里那份单文件 HTML。源码比它新就说明这是上一版的游戏，
 * 打进去不会报任何错，只会静默发出一个旧包。所以先比 mtime，旧了就重建。
 */
async function newestMtime(p) {
  const s = await stat(p);
  if (!s.isDirectory()) return s.mtimeMs;
  let t = 0;
  for (const n of await readdir(p)) t = Math.max(t, await newestMtime(path.join(p, n)));
  return t;
}

const srcT = Math.max(
  await newestMtime(path.join(ROOT, 'index.html')),
  await newestMtime(path.join(ROOT, 'js')),
  await newestMtime(path.join(ROOT, 'css')),
);
const outT = (await exists(GAME)) ? (await stat(GAME)).mtimeMs : 0;
if (srcT > outT) {
  step('源码比 dist 产物新，先重新构建…');
  await run(process.execPath, [
    path.join(ROOT, 'tools', 'build.mjs'), '--min', '--out', '留一盏灯·漫游版.html', '--quiet',
  ], { cwd: ROOT });
}

/* ── 1. 目录与源码 ───────────────────────────────────────────────── */
await rm(WORK, { recursive: true, force: true });
await mkdir(path.join(WORK, 'res', 'values'), { recursive: true });
await mkdir(path.join(WORK, 'src', 'com', 'afterrain', 'lamp'), { recursive: true });
await mkdir(path.join(WORK, 'assets'), { recursive: true });
await mkdir(path.join(WORK, 'classes'), { recursive: true });
await mkdir(OUTDIR, { recursive: true });
await cp(ICONS, path.join(WORK, 'res'), { recursive: true });

await writeFile(path.join(WORK, 'AndroidManifest.xml'), `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="${APP.pkg}"
    android:versionCode="${APP.versionCode}"
    android:versionName="${APP.versionName}">

    <uses-sdk android:minSdkVersion="${APP.minSdk}" android:targetSdkVersion="${APP.targetSdk}" />

    <application
        android:label="@string/app_name"
        android:icon="@mipmap/ic_launcher"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:allowBackup="true"
        android:hardwareAccelerated="true"
        android:usesCleartextTraffic="false"
        android:theme="@style/AppTheme">

        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:label="@string/app_name"
            android:launchMode="singleTop"
            android:screenOrientation="sensorLandscape"
            android:configChanges="orientation|screenSize|smallestScreenSize|screenLayout|keyboardHidden|uiMode|density|fontScale">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
`, 'utf8');

await writeFile(path.join(WORK, 'res', 'values', 'strings.xml'), `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">${APP.label}</string>
</resources>
`, 'utf8');

await writeFile(path.join(WORK, 'res', 'values', 'colors.xml'), `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="paper">#F3EFE3</color>
</resources>
`, 'utf8');

await writeFile(path.join(WORK, 'res', 'values', 'styles.xml'), `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme" parent="@android:style/Theme.Material.Light.NoActionBar">
        <item name="android:windowBackground">@color/paper</item>
        <item name="android:windowFullscreen">true</item>
        <item name="android:windowContentOverlay">@null</item>
        <item name="android:windowLayoutInDisplayCutoutMode">shortEdges</item>
        <item name="android:windowLightStatusBar">false</item>
    </style>
</resources>
`, 'utf8');

await writeFile(path.join(WORK, 'src', 'com', 'afterrain', 'lamp', 'MainActivity.java'), `package com.afterrain.lamp;

import android.app.Activity;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

public class MainActivity extends Activity {

    /** 虚拟源：file:// 下的 localStorage 在部分 WebView 版本上不落盘，
     *  挂一个 https 源既保证存档能存住，又不会有任何真实网络请求
     *  —— 整份游戏是一张自包含的 HTML，一个外部资源都不引用。 */
    private static final String BASE = "https://lamp.local/";

    private WebView web;
    private long lastBack = 0;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // 存档就靠它
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setMediaPlaybackRequiresUserGesture(false);   // 环境音不需要先点一下
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        web.setBackgroundColor(0xFFF3EFE3);
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient());
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        setContentView(web);

        String html = readAsset("index.html");
        if (html == null) {
            Toast.makeText(this, "资源缺失：assets/index.html", Toast.LENGTH_LONG).show();
            finish();
            return;
        }
        web.loadDataWithBaseURL(BASE, html, "text/html", "utf-8", BASE);
        immersive();
    }

    private String readAsset(String name) {
        InputStream in = null;
        try {
            in = getAssets().open(name);
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
            return new String(bos.toByteArray(), "UTF-8");
        } catch (Exception e) {
            return null;
        } finally {
            try { if (in != null) in.close(); } catch (Exception ignored) { }
        }
    }

    /** 沉浸式全屏：阅读时不要状态栏和虚拟键分心 */
    private void immersive() {
        View d = getWindow().getDecorView();
        d.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    @Override
    public void onWindowFocusChanged(boolean has) {
        super.onWindowFocusChanged(has);
        if (has) immersive();
    }

    @Override
    protected void onPause() {
        super.onPause();
        // 手机来电或切走时，先让游戏把对话收起来，回来时不会卡在半句话上
        if (web != null) web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
        immersive();
    }

    /** 返回键：先让网页自己收（面板 / 漫游对话 / 热点），都没有才谈退出 */
    @Override
    public boolean onKeyDown(int code, KeyEvent ev) {
        if (code == KeyEvent.KEYCODE_BACK) {
            web.evaluateJavascript("window.__shellBack ? window.__shellBack() : 0",
                new ValueCallback<String>() {
                    @Override public void onReceiveValue(String v) {
                        if (v != null && v.indexOf('1') >= 0) return;   // 网页自己处理了
                        doubleBackExit();
                    }
                });
            return true;
        }
        return super.onKeyDown(code, ev);
    }

    private void doubleBackExit() {
        long now = System.currentTimeMillis();
        if (now - lastBack < 2000) { finish(); return; }
        lastBack = now;
        Toast.makeText(this, "再按一次返回键退出", Toast.LENGTH_SHORT).show();
    }
}
`, 'utf8');

/* ── 2. 游戏 + 外壳适配层 ───────────────────────────────────────── ──
 * 网页版不需要知道自己在哪个壳里，所以这层垫片只在安卓产物里追加。
 * 它把「返回」翻译成游戏自己的收口动作。
 */
const game = await readFile(GAME, 'utf8');
const shim = `
<script id="android-shell">
(function () {
  function visible(el) { return el && !el.classList.contains('hidden'); }
  window.__shellBack = function () {
    var SP = window.SP;
    if (!SP) return 0;
    // 1) 面板（设置 / 记录 / 地图 / 手账 / 存档）开着 → 收面板
    if (SP.ui && SP.ui.isPanelOpen && SP.ui.isPanelOpen()) { SP.ui.closePanel(); return 1; }
    var ov = document.getElementById('overlay');
    if (visible(ov)) {
      var foot = ov.querySelector('.panel-foot button, .panel button.primary, .panel button');
      if (foot) { foot.click(); return 1; }
      ov.classList.add('hidden');
      return 1;
    }
    // 2) 漫游里正和人说话 → 先合上对话
    if (SP.roam && visible(document.getElementById('roamDialog'))) { SP.roam.closeDialogue(); return 1; }
    // 3) 「看一看」的卡片还在 → 收掉
    if (SP.roam && visible(document.getElementById('lookSpot')) && SP.roam.closeLook) { SP.roam.closeLook(); return 1; }
    return 0;   // 交给外壳：再按一次退出
  };
  // 安卓上没必要留键盘提示
  document.addEventListener('DOMContentLoaded', function () {
    var k = document.querySelectorAll('.tb .k');
    for (var i = 0; i < k.length; i++) k[i].style.display = 'none';
  });
}());
</scr` + `ipt>
`;
await writeFile(path.join(WORK, 'assets', 'index.html'), game.replace('</body>', shim + '</body>'), 'utf8');

/* ── 3. aapt2 编译资源 ───────────────────────────────────────────── */
step('aapt2 compile 资源…');
await run(path.join(BT, 'aapt2.exe'), ['compile', '--dir', path.join(WORK, 'res'), '-o', path.join(WORK, 'res.zip')]);

/* ── 4. aapt2 link ───────────────────────────────────────────────── */
step('aapt2 link（含 assets 与二进制 manifest）…');
const unsigned = path.join(WORK, 'app-unsigned.apk');
await run(path.join(BT, 'aapt2.exe'), [
  'link',
  '-o', unsigned,
  '-I', PLATFORM,
  '--manifest', path.join(WORK, 'AndroidManifest.xml'),
  // -R 走的是 overlay 语义：没有基础资源表垫底时，必须配 --auto-add-overlay，
  // 否则 aapt2 会认为「这些资源没有覆盖任何已存在的条目」而整包失败。
  '-R', path.join(WORK, 'res.zip'),
  '--auto-add-overlay',
  '-A', path.join(WORK, 'assets'),
  '--java', path.join(WORK, 'gen'),
  '--min-sdk-version', String(APP.minSdk),
  '--target-sdk-version', String(APP.targetSdk),
  '--version-code', String(APP.versionCode),
  '--version-name', APP.versionName,
  '--no-version-vectors',
]);

/* ── 5. javac + d8 ───────────────────────────────────────────────── */
step('javac 编译外壳…');
const srcFiles = [path.join(WORK, 'src', 'com', 'afterrain', 'lamp', 'MainActivity.java')];
const genDir = path.join(WORK, 'gen');
if (await exists(genDir)) {
  const walk = async (d) => {
    for (const n of await readdir(d)) {
      const p = path.join(d, n);
      if ((await stat(p)).isDirectory()) await walk(p);
      else if (n.endsWith('.java')) srcFiles.push(p);
    }
  };
  await walk(genDir);
}
// 不能用 --release 8：javac 明确禁止它与 -bootclasspath 同时出现。
// 这里要的是「用 android.jar 当引导类库」，所以走经典的 -source/-target 组合。
await run('javac', ['-source', '8', '-target', '8', '-encoding', 'UTF-8', '-nowarn',
  '-bootclasspath', PLATFORM, '-classpath', PLATFORM,
  '-d', path.join(WORK, 'classes'), ...srcFiles]);

step('d8 转 dex…');
const classes = [];
const walkCls = async (d) => {
  for (const n of await readdir(d)) {
    const p = path.join(d, n);
    if ((await stat(p)).isDirectory()) await walkCls(p);
    else if (n.endsWith('.class')) classes.push(p);
  }
};
await walkCls(path.join(WORK, 'classes'));
await run('java', ['-cp', path.join(BT, 'lib', 'd8.jar'), 'com.android.tools.r8.D8',
  '--release', '--min-api', String(APP.minSdk), '--lib', PLATFORM,
  '--output', WORK, ...classes]);

step('把 classes.dex 装进 APK…');
// 用 .NET 的 ZipArchive 追加（Windows 上不一定有 zip 命令）
await run('powershell', ['-NoProfile', '-NonInteractive', '-Command', `
Add-Type -AssemblyName System.IO.Compression.FileSystem
$apk = '${unsigned.replace(/\\/g, '\\\\')}'
$dex = '${path.join(WORK, 'classes.dex').replace(/\\/g, '\\\\')}'
$zip = [System.IO.Compression.ZipFile]::Open($apk, 'Update')
$old = $zip.Entries | Where-Object { $_.FullName -eq 'classes.dex' }
if ($old) { $old.Delete() }
[System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $dex, 'classes.dex') | Out-Null
$zip.Dispose()
Write-Output 'dex-ok'
`]);

/* ── 6. zipalign + 签名 ──────────────────────────────────────────── */
step('zipalign…');
const aligned = path.join(WORK, 'app-aligned.apk');
await run(path.join(BT, 'zipalign.exe'), ['-f', '-p', '4', unsigned, aligned]);

if (!(await exists(KS))) {
  step('生成签名密钥（首次）…');
  await mkdir(path.dirname(KS), { recursive: true });
  await run('keytool', [
    '-genkeypair', '-v',
    '-keystore', KS,
    '-alias', 'lamp',
    '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10950',
    '-storepass', 'lamp2026', '-keypass', 'lamp2026',
    '-dname', 'CN=After the Sunshine, OU=play, O=play, L=, ST=, C=CN',
  ]);
}

step('apksigner 签名…');
// v1 兼容老机器、v2/v3 是现在的标准。v4 只服务 adb 增量安装，
// 装了也只会多吐一个用不上的 .idsig，索性关掉。
await run('java', ['-jar', path.join(BT, 'lib', 'apksigner.jar'), 'sign',
  '--ks', KS, '--ks-pass', 'pass:lamp2026', '--key-pass', 'pass:lamp2026',
  '--v1-signing-enabled', 'true', '--v2-signing-enabled', 'true', '--v3-signing-enabled', 'true',
  '--v4-signing-enabled', 'false',
  '--out', OUT, aligned]);

step('验签…');
const verify = await run('java', ['-jar', path.join(BT, 'lib', 'apksigner.jar'), 'verify', '--verbose', OUT]);
const vText = verify.stdout || '';
const schemes = ['v1', 'v2', 'v3'].filter((s) => new RegExp(s + ' scheme.*: true').test(vText));

/* ── 7. 报告 ─────────────────────────────────────────────────────── */
const size = (await stat(OUT)).size;
const mb = (n) => (n / 1024 / 1024).toFixed(2) + ' MB';
console.log(`${C.g}✓ APK 已生成${C.x}  ${mb(size)}  签名方案 ${schemes.join(' + ') || '（见 apksigner）'}`);
console.log(`  ${path.relative(PLAY, OUT)}`);
console.log(`  ${C.d}包名 ${APP.pkg} · 目标 API ${APP.targetSdk} · 最低 API ${APP.minSdk}${C.x}`);
if (!QUIET) {
  console.log(`${C.d}  游戏体积 ${((await stat(GAME)).size / 1024).toFixed(1)}KB 的内嵌 HTML 已装入 assets/index.html${C.x}`);
  console.log(`${C.d}  签名为自签名，安装时手机可能提示「未知来源」，允许即可。${C.x}`);
}
