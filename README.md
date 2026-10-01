# 晴天以后 · 留一盏灯 · 漫游版

**After the Sunshine · 留一盏灯 · 漫游版**

一学期，一部还没剪完的短片，和几个慢慢熟悉的人。

单机校园群像视觉小说。在完整的五章剧本之上，加入了 **自由行动 / 可交互人物 / 校园地图 / 委托手账** 四层玩法——主线一字不改，课余时间交给你自己安排。

纯前端实现：画面全部是程序化生成的 SVG，音乐与环境音由 WebAudio 实时合成，**没有一个外部资源、没有一次网络请求**。整个游戏就是一个可以双击打开的 HTML 文件。

![封面](docs/screenshots/cover.png)

---

## 直接玩

不想装任何东西的话，仓库里已经放好了成品：

| 方式 | 文件 | 说明 |
| --- | --- | --- |
| 浏览器 | [`成品/留一盏灯·漫游版（网页版）.html`](成品/留一盏灯·漫游版（网页版）.html) | 361 KB 单文件，双击即开 |
| 安卓手机 | [`成品/留一盏灯·漫游版.apk`](成品/留一盏灯·漫游版.apk) | 206 KB，Android 5.0+，锁横屏 |
| 电脑 | 本机打包 | `node v4/tools/pack-desktop.mjs` |

> 网页版建议用 Chrome / Edge 打开。存档走浏览器的 localStorage，不会上传到任何地方。

安卓包是自签名的，首次安装系统会提示「未知来源」，允许即可。

---

## 玩法

**主线**：点一下补完文字，空格或 Enter 推进，数字键选选项，返回按钮回退。
全篇五章、138 个剧情节点、14 次选择、29 个选项、6 种结局，结局由一路上攒下的 flags 动态结算。

**漫游**：主线走到章节边界会进入「自由行动」——

- **直接点画面上的人聊天。** 场景里的圆头像就是此刻在这里的人。首次见面有专门的打招呼，常聊天会提升熟络度（每人满 5 心）。
- **校园地图**（`M`）。14 处地点的手绘导览，虚线是道路，点哪里去哪里；橙点表示那里有委托找你，★ 是当前主线目的地。旅行免费，随时回主线。
- **委托手账**（`J`）。10 个小委托，每个 2–3 步（找人 / 去某地 / 看某物），完成后回去交差，会收进一张手记并提升熟络度。
- **口袋**：主线纸片 + 委托手记，两个册子并排放在同一个面板里。

五个自由行动窗口（报到日 / 社团招新后 / 十一月 / 期末前 / 放映前）各有独立的人物分布、委托与对白。

| 漫游 | 地图 | 手账 |
| --- | --- | --- |
| ![漫游](docs/screenshots/roam.png) | ![地图](docs/screenshots/map.png) | ![手账](docs/screenshots/journal.png) |

---

## 文本分成三种声音

这是本项目里最花心思的一块。对白、旁白、心声在**数据与渲染上都分开处理**，不是靠一个 CSS 类糊上去的。

**写作侧**用四个构造器：

```js
D('你也是新生？')            // 对白
N('她点头，动作很快。')       // 旁白
I('轮子还在，只是决定横着走。') // 心声
S('小满', '又是你啊。')       // 旁白里提到某人，带上说话人色相
```

**兜底**：老写法（一整段纯文本）照样能用。`bare(text, who)` 会扫描中文引号 `“ ” 「 」` 的嵌套深度，自动把它切成旁白 / 对白——所以漏写分段也不会露馅。

**双轨产出**：`beat()` 一次生成两份东西——`node.seg`（带 kind 的段数组，给渲染用）和 `node.text`（扁平字符串，给故事记录、导出、旧存档用）。`tools/validate-story.mjs` 里加了永久断言，两者一旦漂移就直接报错。

**渲染**：`engine.setText(segs)` 为每一段建一个 `<span class="seg seg-{k}">`，打字机按「整串偏移」灌字，逐段显示不会串行。

**视觉**走三个互不干扰的通道——明度（旁白压到 72%）、字重（对白 600）、字体（心声走衬线），六位常出场人物再叠一层 `[data-who]` 色相偏移。全部用 `color-mix()` 写，切到夜读界面自动跟着变。

当前剧本共 **295 段旁白、135 段对白、136 段心声**，138 个节点全部含两种以上声音。

---

## 项目结构

```
index.html          入口（加载 5 CSS + 13 JS）
css/                tokens · scenes · ui · edition（纸墨主题）· game（漫游层）
js/                 story(138 节点 · 分段) · engine · ui · stage · art · palette
                    character · audio · storage
                    game(世界状态/地点/委托数据) · roam(漫游呈现)
tools/              build · check-api · check-css · check-shots · validate-story
                    inspect-art · probe · probe-roam · shots · peek
                    make-icons.py · pack-desktop · pack-android · verify-all
_backup/            文本重写前的 story.js / game.js
```

`js/` 全部挂在 `window.SP` 命名空间下，IIFE 封装，加载顺序
`util → palette → art → character → audio → stage → story → storage → game → roam → ui → engine → main`。

---

## 自检

项目自带一套可复现的校验，**十步全绿**：

```bash
cd v4
node tools/verify-all.mjs --shots
```

1. **语法** — 13 个 JS 模块 `node --check`
2. **API 一致性** — 所有 `SP.ns.member` 调用都对得上导出（识别 4 种导出写法）
3. **剧情图** — 138 节点可达、6 结局可达、无断链 / 孤儿 / 非法取值，并断言分段与扁平文本一致
4. **美术结构** — 14 个场景的四层 SVG 合法
5. **单文件打包** — 无外链、无外部请求
6. **CSS 压缩等价性** — 让 Chrome 分别解析压缩版与原样版样式表，逐条规则比对
7. **运行时探针** — 31 项（封面、推进、选择、存读档、结局、面板）
8. **漫游玩法探针** — 26 项（闸门进入 → 看一看 → 地图旅行 → 接委托 → 推进 → 交差 → 手账 → 口袋 → 回主线 → 存档含 world）
9. **预览截图** — 18 张
10. **截图体检** — 逐像素解码，检查尺寸 / 亮度 / 主色

第 6 步值得多说一句：打包器的 CSS 压缩器曾经有过一个静默破坏样式的 bug——连 `.j-face .dots` 这种后代选择器都会被压成非法规则，一共丢了 222 条声明，而且产物还能正常打开、只是样子悄悄变了。`tools/check-css.mjs` 就是为了抓它而写的，并且已经回归验证过它确实能抓住。

---

## 打包

两条链都不依赖 Gradle / Android Studio / electron-builder，只用系统里现成的东西。

```bash
cd v4
node tools/pack-desktop.mjs   # 电脑版 → ../成品/留一盏灯·漫游版（电脑版）/
node tools/pack-android.mjs   # 安卓版 → ../成品/留一盏灯·漫游版.apk
```

- **电脑版**：Electron 便携版。换名的 `electron.exe` + `resources/app/`，用 `app.setPath('userData', exe 旁的「存档与设置」)` 让存档跟着包走；F11 全屏、单实例锁、后台不节流。图标与版本资源用 `rcedit` 刷进 exe。
- **安卓版**：`aapt2 compile` → `aapt2 link -A assets` → `javac -source 8 -target 8 -bootclasspath android.jar` → `d8` → 追加 `classes.dex` → `zipalign -p 4` → `apksigner` 自签 v1+v2+v3。外壳是一个 WebView Activity，用 `loadDataWithBaseURL("https://lamp.local/", …)` 的虚拟源保证 localStorage 一定落盘，返回键翻译成游戏自己的收口动作。

两个脚本开头都有一段 **新鲜度闸门**：先比 `index.html` / `js/` / `css/` 与 `dist/` 产物的 mtime，源码更新就自动重建。加上它是因为真踩过坑——有一版 `roam.js` 改完忘了重新构建，打包器安静地吃了一份过期产物，打出来的包里缺两个导出函数，全程不报任何错。

---

## 已知限制

- 存档 key 前缀是 `sp4:`，与早期版本互不覆盖。
- 电脑版首次在部分老显卡机器上可能需要加 `--disable-gpu` 启动（走软件渲染）。
- 自检覆盖的是 DOM 自动化与渲染层面；音频听感、长局存档轮换这类事情仍建议人工过一遍。

## 许可

个人作品，请勿商用。剧本、角色与美术均为原创。
