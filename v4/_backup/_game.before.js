/*!
 * 留一盏灯 · 漫游版  |  game.js
 * 游戏层：校园地图数据、人物日程、委托（任务）与手记。
 * 纯数据与纯逻辑，不碰 DOM——呈现交给 roam.js。
 * 世界状态挂在 Engine.state.world 上，随既有存档系统一起保存。
 */
(function (global) {
  'use strict';
  const SP = global.SP;
  const { clamp } = SP;

  /* ------------------------------------------------------------------ *
   * 地点：14 处，与 art.js 的场景一一对应。
   * x/y 是地图坐标（SVG 720×520）；look 是「看一看」的文案，
   * default 通用，wN 为该漫游窗口的特供版本。
   * ------------------------------------------------------------------ */
  const LOCS = {
    campus:    { name: '东门',        x: 78,  y: 428, look: { default: '校门口的蓝色围挡还在，只是挪了一条道。保安亭的窗台上多了一盆蒜苗。', w1: '行李箱的轮子在石板路上响得夸张，像给每个新生配了进场音乐。' } },
    avenue:    { name: '林荫道',      x: 186, y: 352, look: { default: '梧桐换了个姿势掉叶子。路灯还没亮，有人在树下背单词，声音压得很低。', w1: '傍晚的光把林荫道铺成一条缓坡。晾衣被在楼群之间晒出一个个方块。' } },
    club:      { name: '活动中心',    x: 482, y: 132, look: { default: '活动中心的玻璃门上贴满了招新海报，最旧的一张是三年前的吉他社。', w2: '长桌从门口排到台阶下。每个摊位都在喊“不限基础”，声音真诚又沙哑。' } },
    canteen:   { name: '第二食堂',    x: 238, y: 98,  look: { default: '第二食堂的灯分两批亮。先亮打饭的窗口，再亮吃饭的桌子，像一场慢吞吞的开幕。', w1: '铝盆和勺子磕出一整套打击乐。粥的热气把窗玻璃糊成毛玻璃。', w3: '棉套套在粥桶外面，热气从缝里溜出来。晚班窗口前只剩两个人在挑面条。' } },
    plaza:     { name: '中心广场',    x: 305, y: 288, look: { default: '中心广场的旗杆下有人拍照。鸽子上一次集体起飞是什么时候，没人记得。', w2: '招新的音响循环同一首歌。广场砖缝里长出一茬小草，明年会有人发现它们。' } },
    classroom: { name: '教学楼',      x: 418, y: 240, look: { default: '教学楼的走廊很长，长得刚好能把一句话想完。黑板槽里躺着半截粉笔。', w2: '周五下午的教室有阳光斜进来。有人把上一节课的板书抄了一半，另一半留给了下一个人。', w4: '空教室的黑板擦得很干净。讲台上留着一张没收走的课程表。' } },
    lecture:   { name: '放映厅',      x: 298, y: 418, look: { default: '放映厅的幕布垂着，像还没决定要不要开口。红色座椅一排排往暗处去。', w4: '放映厅白天不开灯。从门口数到幕布，正好十九步——上学期有人量过。', w5: '投影的光柱里有浮尘慢慢转。第一排没人坐，大家都默契地往后挪。' } },
    dorm:      { name: '四号楼',      x: 148, y: 182, look: { default: '四号楼的楼道里有洗衣粉和泡面的味道，混得并不难闻。水房的声音整晚不停。', w1: '417 的门牌歪了一点。走廊折叠桌的桌脚还垫着上学期宣传单。' } },
    library:   { name: '图书馆',      x: 388, y: 88,  look: { default: '图书馆的闭馆音乐响之前，总有人开始收拾东西，像潮水提前退了一格。', w2: '器材借用处的柜台擦得发亮。每一根转接线上都缠着编号胶带，缠得很仔细。' } },
    lake:      { name: '湖边',        x: 520, y: 402, look: { default: '湖边有风，风里有人语。长椅背对着夕阳，坐上去就是一幅剪影。', w4: '雪落在湖面上，落多少都不留下。对岸的路灯傍晚就亮了，倒影比灯本体长。' } },
    cafe:      { name: '南门咖啡馆',  x: 588, y: 232, look: { default: '南门咖啡馆的招牌灯箱有一个字母不亮。店员说那是故意的，没人信。', w2: '咖啡馆下午人不多。有人在拼桌写东西，笔尖的声音比说话多。', w3: '桌下的延长线被灯照出来，像这晚唯一没摆好姿势的东西。' } },
    roof:      { name: '天台',        x: 322, y: 196, look: { default: '天台的门虚掩着。从这里看，校园小得可以一眼记住，又大得四年走不完。' } },
    track:     { name: '操场',        x: 612, y: 88,  look: { default: '操场的看台是观察黄昏的最佳位置。跑道上有人在最后一圈加速，明知没人计时。' } },
    hall:      { name: '礼堂',        x: 108, y: 62,  look: { default: '礼堂的座椅可以翻动，落下去“啪”的一声很郑重。台上没有人的时候，台下也庄重。', w5: '礼堂的库存角堆着折叠椅和旧幕布。钥匙一大串，用胶布标着各自的门。' } },
  };
  const LOC_ROADS = [
    ['campus', 'avenue'], ['avenue', 'plaza'], ['plaza', 'dorm'], ['dorm', 'canteen'], ['canteen', 'hall'],
    ['plaza', 'classroom'], ['classroom', 'library'], ['library', 'club'], ['club', 'track'],
    ['classroom', 'roof'], ['plaza', 'lecture'], ['lecture', 'lake'], ['lake', 'cafe'],
  ];

  /* ------------------------------------------------------------------ *
   * 漫游窗口：故事推进到“闸门节点”时，先自由活动，走到目标地点后继续主线。
   * unlocks 为该窗口新开放的地点（累计制）。
   * ------------------------------------------------------------------ */
  const WINDOWS = {
    w1: { gate: 'gate_laugh', next: 'room0',   target: 'dorm',      hint: '跟着晾衣被走——四号楼 417', title: '报到日 · 自由活动', unlocks: ['campus', 'avenue', 'dorm', 'canteen'] },
    w2: { gate: 'c1end',      next: 'c2open',  target: 'club',      hint: '十月的社团招新在活动中心门口', title: '十月 · 自由活动', unlocks: ['club', 'library', 'plaza'] },
    w3: { gate: 'c2end',      next: 'c3open',  target: 'dorm',      hint: '十一月的第一晚，回寝室看粗剪', title: '十一月 · 自由活动', unlocks: ['classroom', 'cafe', 'lake'] },
    w4: { gate: 'c3end',      next: 'c4open',  target: 'classroom', hint: '去教学楼参加展映说明会', title: '十二月 · 自由活动', unlocks: ['lecture', 'roof', 'track'] },
    w5: { gate: 'c4end',      next: 'c5open',  target: 'lecture',   hint: '放映那天，提前去放映厅', title: '一月 · 自由活动', unlocks: ['hall'] },
  };
  const GATE_TO_WINDOW = {};
  for (const wid in WINDOWS) GATE_TO_WINDOW[WINDOWS[wid].gate] = wid;

  /* ------------------------------------------------------------------ *
   * 委托（任务）：steps 为中间目标；最后一步固定是“回去找发起人”。
   * talk  = 与某人聊（通常在指定地点）
   * reach = 去某地   | observe = 在某地“看一看”
   * ------------------------------------------------------------------ */
  const QUESTS = {
    q_screws:  { title: '椅子还差四颗螺丝', giver: 'cheng', window: 'w1', hint: '四号楼的椅子修到一半，五金店要周五才补货。',
      steps: [{ type: 'talk', npc: 'aunt', at: 'canteen', desc: '去第二食堂，问问陈姨有没有富余的螺丝' }] },
    q_sound:   { title: '值得录下来的声音', giver: 'man', window: 'w1', hint: '小满想给短片收一段“开学是什么声音”。',
      steps: [{ type: 'observe', at: 'canteen', desc: '去第二食堂，听一听开学的声音' }] },
    q_poster:  { title: '贴出去之前', giver: 'man', window: 'w2', hint: '招新海报上的教室号，小满自己也没把握。',
      steps: [{ type: 'talk', npc: 'teacher', at: 'classroom', desc: '去教学楼找周老师，核对海报上的教室号' }] },
    q_line089: { title: '编号 089', giver: 'yan', window: 'w2', hint: '阿言去年弄丢的转接线，也许还躺在某个角落。', unlockOnAccept: 'cafe',
      steps: [{ type: 'reach', at: 'cafe', desc: '去南门咖啡馆看看（阿言说储物筐在里面的座位下）' }, { type: 'observe', at: 'cafe', desc: '在储物筐里翻一翻' }] },
    q_account: { title: '六块钱和其他账', giver: 'cheng', window: 'w3', hint: '账目表上想有一行“程野，已结清”。',
      steps: [{ type: 'talk', npc: 'man', at: 'cafe', desc: '去南门咖啡馆，和小满把底账对一遍' }] },
    q_photo:   { title: '妈妈想看看食堂', giver: 'mom', window: 'w3', hint: '不用拍得多好，拍你常坐的位置就行。',
      steps: [{ type: 'observe', at: 'canteen', desc: '在第二食堂，把你常坐的位置拍下来' }] },
    q_morning: { title: '早班申请表', giver: 'aunt', window: 'w4', hint: '陈姨想调早班，表格却打不出来。',
      steps: [{ type: 'talk', npc: 'yan', at: 'library', desc: '去图书馆，请阿言帮忙把表格调好格式打印' }] },
    q_rope:    { title: '放映厅的绳子', giver: 'yan', window: 'w4', hint: '上学期幕布卡在半空，全场看了十分钟天花板。',
      steps: [{ type: 'observe', at: 'lecture', desc: '去放映厅，看看投影幕的绳子绕得对不对' }] },
    q_drawer:  { title: '留给下一届的抽屉', giver: 'yan', window: 'w5', hint: '阿言毕业前，想把柜台抽屉理成别人也能看懂的样子。',
      steps: [{ type: 'observe', at: 'library', desc: '去图书馆的器材借用处，看看那个抽屉' }] },
    q_neighbor:{ title: '多带一把椅子', giver: 'aunt', window: 'w5', hint: '陈姨的邻居腿脚不好，想坐最后一排靠边。',
      steps: [{ type: 'talk', npc: 'teacher', at: 'hall', desc: '去礼堂找周老师，借两把折叠椅' }] },
  };

  /* 手记：完成委托后收进口袋的纸片（与剧情记忆同一副笔墨） */
  const NOTES = {
    q_screws:  { title: '铁盒里的螺丝', date: '九月 · 四号楼', body: '四颗 M6 螺丝，配一把蓝色手柄的螺丝刀。\n程野把它们倒进铁盒，说这样第二年就能整套找到。\n\n垫片要配着用，别光拧。——陈姨' },
    q_sound:   { title: '第一段素材', date: '九月 · 第二食堂', body: '水烧开的声音，铝盆磕碰的声音，\n还有一句“别站着等粥凉”。\n\n小满说，这只够当片头。\n但她把这段单独存了一份，没剪。' },
    q_poster:  { title: '改过的教室号', date: '十月 · 活动中心', body: '海报上的 402 被划掉，手写改成 404。\n\n周老师说，贴错的地方\n往往比贴对的地方更容易被记住。' },
    q_line089: { title: '089 号转接线', date: '十月 · 南门咖啡馆', body: '在储物筐最底下找到，\n胶带还是阿言贴的那一圈。\n\n他没有说谢谢，\n只是当场写了一张新的领取单。' },
    q_account: { title: '报销单的最后一行', date: '十一月 · 第二食堂', body: '水：程野，6 元。\n\n括号里补了一行小字：\n换班提前三天。\n这行字后来被抄进了群公告。' },
    q_photo:   { title: '照片里的第三张桌子', date: '十一月 · 第二食堂', body: '拍照那天陈姨特意擦了两遍桌子。\n\n发给妈妈以后，她只问了一句：\n这个位置靠窗吗。' },
    q_morning: { title: '早班申请表', date: '十二月 · 图书馆', body: '打印店关得早，表格压在打印袋下面。\n\n申请理由那一栏，陈姨只写了四个字：\n想看日出。' },
    q_rope:    { title: '绕错的绳子', date: '十二月 · 放映厅', body: '投影幕的绳子绕反了一圈。\n空转一圈，再放下来就顺了。\n\n阿言说，很多卡住的地方，\n其实只是绕错了。' },
    q_drawer:  { title: '抽屉里的新清单', date: '一月 · 图书馆', body: '旧清单的背面写了新的一页：\n先数清楚，再签字。\n\n抽屉里多了一支笔，\n下次谁都能用。' },
    q_neighbor:{ title: '多带一把椅子', date: '一月 · 礼堂', body: '周老师搬来两把折叠椅，\n说礼堂的库存本来就没人点。\n\n那天最后一排坐了三个人，\n椅子是够的。' },
  };

  /* ------------------------------------------------------------------ *
   * 人物日程：每个漫游窗口里，谁在哪、聊什么。
   * chat 是日常寒暄（第一次 / 再次两套）；quest 相关对白由 roam.js
   * 按“交差 > 推进 > 接下 > 寒暄”的优先级拼装。
   * ------------------------------------------------------------------ */
  const NPCS = {
    man: {
      name: '小满', windows: {
        w1: { loc: 'campus', x: 26, y: 38, greet: ['手推车先还了，围挡那边不让久停。', '你行李还没抬上去吧？四号楼在梧桐后面，跟着晾衣被走就对。'], again: ['围挡今天挪了一条道。改天我画张小地图给你，肯定比学校发的好看。'] },
        w2: { loc: 'club', x: 30, y: 36, greet: ['招新表收了三十几张，有两张电话号码少一位。', '你们寝室另两位呢？也拉来当观众。'], again: ['这只杯子又被拿去当头像了。我准备给它办个退役仪式。'] },
        w3: { loc: 'cafe', x: 28, y: 40, greet: ['策划改到第四版了。刚才服务员来问要不要加水——他以为我们在谈生意。'], again: ['我在学剪辑的快捷键。学到第三个，发现最快的办法还是早点睡。'] },
        w4: { loc: 'lake', x: 34, y: 42, greet: ['雪天的湖没什么声音，收音倒是很干净。', '我在这儿等那盏路灯——它熄的时候比亮的时候更像一句话。'], again: ['别站太外面，你的脚印会进画面。哦，进了也没关系。'] },
        w5: { loc: 'lecture', x: 30, y: 38, greet: ['两个U盘都格式化过了。今天只管放映，别的都交给“以后”。', '你紧张吗？我紧张的话会一直擦手，你看。'], again: ['门口那张字条是你写的吧。“放完以后，有话可以说，也可以直接走”。挺好，不像我写的那种。'] },
      },
    },
    cheng: {
      name: '程野', windows: {
        w1: { loc: 'dorm', x: 68, y: 36, greet: ['椅子好了，就差四颗螺丝。楼下五金店开学季总缺货。', '你要是出去，帮我把这袋螺丝放窗台上——别放枕头边，我总疑心它会倒。'], again: ['网线的事我写在便签上了。蓝色那根是好的，白色的别信它。'] },
        w2: { loc: 'dorm', x: 68, y: 36, greet: ['周日我还是能来的。问一遍就行，问三遍我就开始想是不是不该来。'], again: ['你猜我今天在食堂打了多少个鸡蛋？……算了，这个话题只有我觉得精彩。'] },
        w3: { loc: 'canteen', x: 32, y: 38, greet: ['这周我周三和周五晚班。别的日子，群里@我的都当没看见——开玩笑的，会回。'], again: ['今天包子是豆沙的，比昨天的靠谱。'] },
        w4: { loc: 'dorm', x: 68, y: 36, greet: ['期末了，寝室十一点熄大灯。我的台灯是新买的，光偏黄，像老家那种。', '片子的导出你弄完了吗？别学我拖。'], again: ['我妈问我是不是又瘦了。我说是食堂的勺子瘦了。'] },
        w5: { loc: 'dorm', x: 68, y: 36, greet: ['我下课后直接过去，帮忙搬凳子。凳子我熟——上学期修过一把。', '你先去吧，别在寝室里转圈，地板要被你踩薄了。'], again: ['放映的介绍词背熟了吗？背熟了就忘掉一半，那样最自然。'] },
      },
    },
    yan: {
      name: '阿言', windows: {
        w2: { loc: 'library', x: 30, y: 38, greet: ['今天借出三根转接线，回来两根。这是很好的开始。', '你们要借录音笔的话，周日下午人少，五点前来得及。'], again: ['别在书架第三排吃面包屑。我说的不是你——但你也别。'] },
        w4: { loc: 'library', x: 30, y: 38, greet: ['毕业申请打印出来了，照片还是歪的。算了，歪着也是我。', '放映厅的幕布你们用过吗？上学期卡过一次，绳子绕反了。'], again: ['闭馆音乐换了，比上一首温柔。管理员说上一首总让人赖着不走。'] },
        w5: { loc: 'lecture', x: 62, y: 38, greet: ['钥匙、插排、转接头，都在袋里。我列了清单，勾了一半。', '放映结束要恢复桌椅——这条是我提的，别恨我。'], again: ['今天的观众比我想的多。可能因为门口那张字条写得实在。'] },
      },
    },
    aunt: {
      name: '陈姨', windows: {
        w1: { loc: 'canteen', x: 30, y: 40, greet: ['开学头三天，粥免费，别客气。', '你是四号楼的？窗边第三张桌子腿稳，我刚垫过。'], again: ['晚上想吃什么，提前跟窗口说。九点后只剩面了——说这话时我总有点得意。'] },
        w2: { loc: 'canteen', x: 30, y: 40, greet: ['十月人少点了，粥桶也换小的了。', '你们拍的片子什么时候好？我那几个碗的出镜费还没收呢——玩笑，玩笑。'], again: ['招新热闹是热闹，吃完饭记得把碗送回来就行。'] },
        w3: { loc: 'canteen', x: 30, y: 40, greet: ['天冷了，粥桶外面套了棉套。你看，连桶都有新衣服。'], again: ['地刚拖的，门口那个弯别抄近道。每周都有人在那儿表演滑步。'] },
        w4: { loc: 'canteen', x: 30, y: 40, greet: ['雪天进货晚，面条管够。', '你们那个名单，我那个“姨”字对了三遍，这回稳了。'], again: ['邻居问我是不是上电视了。我说顶多算上个屏幕，还是侧面。'] },
        w5: { loc: 'canteen', x: 30, y: 40, greet: ['今晚我带邻居去看你们的片子。她非说要打扮一下——看个学生片子，至于吗。', '至于。她说。行吧。'], again: ['放映完来喝汤。汤不等人，但今晚我等你们。'] },
      },
    },
    teacher: {
      name: '周老师', windows: {
        w2: { loc: 'classroom', x: 34, y: 36, greet: ['小组作业的题目，想清楚“给谁看”再动笔。', '课堂讨论不是找标准答案——标准答案我已经有了，要你们干嘛。'], again: ['你们那个短片，是“关于学校”还是“发生在学校”？想清楚这个，比器材要紧。'] },
        w5: { loc: 'hall', x: 36, y: 40, greet: ['礼堂这学期没什么人用，钥匙倒是一大串。', '我年轻时也放过学生的片子——投影仪比我先退休，又换了新的。东西坏了正常，事情别断就行。'], again: ['放映的事我不插手。我就到时候坐最后一排——你们那个最后一排，看来是真有人坐。'] },
      },
    },
    mom: {
      name: '妈妈', phone: true, windows: {
        w3: { loc: 'dorm', x: 50, y: 34, greet: ['生活费还够吗？……我就是问问，你别每次都先说“够”。', '你上次说食堂的粥免费。妈妈想知道那食堂长什么样，桌子和家里比哪个亮。'], again: ['蒸蛋的事学会了没？水多了成汤，水少了成砖。和室友分着吃，一个学期总能学会一样菜。'] },
      },
    },
  };

  /* 新增成就（挂进剧情成就表，封面与成就面板自动并入） */
  const GAME_ACHIEVEMENTS = [
    { id: 'explorer', name: '把校园走遍', desc: '十四个地方都去过', icon: '⌖' },
    { id: 'greeter', name: '都打过招呼', desc: '和六位都聊过天', icon: '☰' },
    { id: 'helper', name: '帮上忙了', desc: '完成第一个委托', icon: '✓' },
    { id: 'allhelp', name: '这一学期的事', desc: '完成全部十个委托', icon: '✦' },
    { id: 'packrat', name: '口袋更深了', desc: '集齐全部十张手记', icon: '▤' },
  ];

  /* ------------------------------------------------------------------ *
   * 委托对白：接下 / 推进 / 交差，按 quest id 存放。
   * ------------------------------------------------------------------ */
  const QUEST_LINES = {
    q_screws: {
      offer: ['这椅子就差四颗螺丝，五金店老板说要等周五补货。', '食堂陈姨上学期修过凳子，她那儿说不定有富余。你要去吃饭的话，顺路问一句？'],
      accept: ['那就拜托了。垫片要配着用——这话她要是说，你就点头。'],
      step: ['螺丝？有有有，上学期修凳子剩的，一袋都在。', '拿去。跟四号楼那孩子说，垫片要配着用，别光拧。'],
      done: ['四颗，规格正好。她连垫片都配了？行家。', '铁盒给你看——以后整套都放这儿，第二年就不用再找。'],
    },
    q_sound: {
      offer: ['我想录一点“开学是什么声音”。食堂的水开得特别响，可我不敢一个人端着相机站在窗口——会被当成插队的。'],
      accept: ['就当陪我去听一次。听到什么都算数。'],
      step: [],
      done: ['铝盆磕在一起，像谁在楼下敲鼓。', '这段我留了。片头就用它——比字幕诚实。'],
    },
    q_poster: {
      offer: ['海报印出来才发现，教室号怕是写反了——402 和 404，我越看越拿不准。', '周老师的课在四楼哪间？我要看摊走不开。你要是去教学楼，帮我对一下？'],
      accept: ['麻烦你了。对完别急着回来，顺便听听老师讲课——就当替我上课。'],
      step: ['404，没错。周五下午的课都在那间。', '海报？贴错了就再贴一张，别用涂改液，难看。哦，你们要办放映？教室的事去问管理处，我的话不作数——但 404 这个数字作数。'],
      done: ['404 就对了，还好没贴遍全校。', '老师还说什么了？……“名单记得写全”？他连海报都管，真是老师。'],
    },
    q_line089: {
      offer: ['去年我弄丢过一根转接线，编号 089。赔了钱，但总觉得它还在校园某个角落。', '有人说南门咖啡馆的储物筐里见过缠胶带的线——就是我最喜欢缠的那种。你要是路过……帮我看一眼？不是非要找回来，就是想知道它在哪。'],
      accept: ['谢谢。南门出去左手边，玻璃门上字母不亮的那家。'],
      step: [],
      done: ['……真是它。胶带还是我缠的那圈。', '这样吧，不用还了。你拿张新领取单，就当它今天才被领走。你看，一年的心事，一张单子就办完了。'],
    },
    q_account: {
      offer: ['那六块钱你们一直没结，我也不好意思催。其实不是钱的事——我想让账目表上有一行“程野，已结清”。', '小满那儿有底账。你去对一遍，该多少是多少。'],
      accept: ['麻烦你了。对完跟我说一声，我把它写整齐点。'],
      step: ['账我会重新誊一遍。水钱这种小额最容易漏，漏了才伤感情。', '上次你说的“先问排班再约时间”，我写进注意事项第一条了。'],
      done: ['结清了就行。表格上“已结清”三个字，看着比六块钱值钱。', '下次换班我提前三天说。这句也帮我记上。'],
    },
    q_photo: {
      offer: ['不用拍我，我也拍不着。你就把食堂拍一张给我——拍你常坐的位置就行，妈妈想看看你坐在哪儿。', '不用挑角度。你坐着舒服的地方，拍出来就是好的。'],
      accept: ['好，妈妈等你。不急，粥都要慢慢熬。'],
      step: [],
      done: ['靠窗，第三张……桌子擦得真亮。是有人天天擦吧。', '好，这下你在哪儿吃饭，妈妈心里有画面了。比汇款单上的数字踏实多了。'],
    },
    q_morning: {
      offer: ['我想调早班，申请表在管理处，可打印店的价目表我看不清——那些字比米粒还小。', '图书馆那个戴眼镜的学生，听说热心。你帮我问问，能不能帮我调好格式打出来？我这理由都想好了。'],
      accept: ['麻烦你了。理由我想好了，就四个字。'],
      step: ['表格可以，我帮你调好格式。打印店九点关门，得抓紧。', '陈姨的字挺好看，她写理由那一栏你看见了没——“想看日出”。我就写不出这么好的理由。'],
      done: ['表格打好了？格式这么齐整，我这理由都显得庄重了。', '“想看日出”——真没什么别的。早班看得见太阳出来，晚班只看得见灯关。'],
    },
    q_rope: {
      offer: ['你们放映那天要用放映厅吧？我拿到钥匙了，但那根绳子我不放心。上次它绕错了一圈，幕布卡在半空，全场等了十分钟。', '谁有空去看一眼？不用修，就看看它绕的方向对不对。放映那天我可不想集体看天花板。'],
      accept: ['谢谢。白天不开灯，从门口数到幕布十九步，别走过了。'],
      step: [],
      done: ['绕反了一圈是吧。空转一圈再放，就顺了。', '很多卡住的东西都这样——不是坏了，是绕错了。这话我说给自己听的，你随便听听。'],
    },
    q_drawer: {
      offer: ['我毕业后，这个借用柜台会交给新人。抽屉里那些单子想整理一下，把有用的留下来。', '帮我去看一眼那抽屉吧。我知道里面乱，所以需要一个不是我的人去看。'],
      accept: ['谢谢。抽屉在柜台底下，锁是不锁的——一直没锁。'],
      step: [],
      done: ['清单背面写了“先数清楚，再签字”？行，这句话比我值钱。', '抽屉里我放了支新笔。谁都能用，丢了也不心疼——这话也是说给自己听的。'],
    },
    q_neighbor: {
      offer: ['放映厅的椅子够吗？我那邻居腿脚不好，想坐最后一排靠边。', '礼堂的周老师那儿好像有折叠椅。你要是顺路……帮我去问一句？放完我给你们留着热汤。'],
      accept: ['麻烦你了。就说食堂陈姨问的，他记得我——上学期借过一回喇叭。'],
      step: ['折叠椅？库存有几把，你们搬去用，放回来就行。', '食堂陈姨要看学生的片子？那得给她留个好位置——懂行的人坐哪儿都很重要。'],
      done: ['两把折叠椅？周老师真痛快。', '今晚最后一排有三个位置了。你写的字条上说“给晚到的人留着”——我们不算晚到，算慢慢到。'],
    },
  };

  /* ------------------------------------------------------------------ *
   * 世界状态（挂在 Engine.state.world）
   * ------------------------------------------------------------------ */
  const RAPPORT_MAX = 5;

  function freshWorld() {
    return {
      loc: 'campus',
      unlocked: WINDOWS.w1.unlocks.slice(),
      visited: ['campus'],
      talked: {},      // npc -> 最近打过招呼的窗口
      rapport: {},     // npc -> 0..5
      quests: {},      // qid -> { stage }  stage=steps.length 表示可交差；done:true 表示完成
      notes: [],       // 手记 quest id 列表
      observed: {},    // loc -> 该窗口已看过
      windowSeen: 0,   // 已解锁到的最大窗口序数（成就/引导用）
    };
  }

  function ensure() {
    const st = SP.engine.state;
    if (!st) return null;
    if (!st.world || !st.world.unlocked) st.world = freshWorld();
    return st.world;
  }

  function give(id) {
    if (SP.storage.unlockAchievement(id)) {
      SP.ui.achievementPopup(id);
      SP.audio.sfx('unlock');
    }
  }

  function checkAchievements(w) {
    if (Object.keys(LOCS).every((l) => w.visited.includes(l))) give('explorer');
    if (Object.keys(NPCS).every((n) => w.talked[n])) give('greeter');
    const done = Object.keys(w.quests).filter((q) => w.quests[q].done);
    if (done.length >= 1) give('helper');
    if (done.length >= Object.keys(QUESTS).length) give('allhelp');
    if (w.notes.length >= Object.keys(NOTES).length) give('packrat');
  }

  function addRapport(npc, delta) {
    const w = ensure();
    w.rapport[npc] = clamp((w.rapport[npc] || 0) + delta, 0, RAPPORT_MAX);
  }

  /* ------------------------------ 查询 ------------------------------ */

  function windowOf(gateId) { return GATE_TO_WINDOW[gateId] || null; }

  function npcAt(npcId, wid) {
    const n = NPCS[npcId];
    return (n && n.windows[wid]) || null;
  }

  function npcsHere(loc, wid) {
    return Object.keys(NPCS).filter((id) => {
      const spot = npcAt(id, wid);
      return spot && spot.loc === loc;
    });
  }

  /** npc 在当前窗口是否有“与你有关的事”（地图/场景标记用） */
  function npcHasBusiness(npcId, wid) {
    const w = ensure();
    if (!w) return false;
    // 可交差
    for (const qid in w.quests) {
      const q = w.quests[qid];
      if (q.done) continue;
      if (QUESTS[qid].giver === npcId && q.stage >= QUESTS[qid].steps.length) return true;
      const step = QUESTS[qid].steps[q.stage];
      if (step && step.type === 'talk' && step.npc === npcId) return true;
    }
    // 可接
    for (const qid in QUESTS) {
      if (QUESTS[qid].window !== wid) continue;
      if (QUESTS[qid].giver !== npcId) continue;
      if (!w.quests[qid]) return true;
    }
    return false;
  }

  function questsOfferable(npcId, wid) {
    const w = ensure();
    return Object.keys(QUESTS).filter((qid) =>
      QUESTS[qid].window === wid && QUESTS[qid].giver === npcId && !(w.quests[qid] && w.quests[qid].done) && !w.quests[qid]);
  }

  function questReadyToTurnIn(qid) {
    const w = ensure();
    const q = w.quests && w.quests[qid];
    return !!q && !q.done && q.stage >= QUESTS[qid].steps.length;
  }

  function readyQuestsFor(npcId) {
    const w = ensure();
    if (!w.quests) return [];
    return Object.keys(w.quests).filter((qid) => QUESTS[qid].giver === npcId && questReadyToTurnIn(qid));
  }

  function stepQuestsFor(npcId, wid) {
    const w = ensure();
    if (!w.quests) return [];
    return Object.keys(w.quests).filter((qid) => {
      const q = w.quests[qid];
      if (q.done) return false;
      const step = QUESTS[qid].steps[q.stage];
      return !!step && step.type === 'talk' && step.npc === npcId;
    });
  }

  /* ------------------------------ 事件 ------------------------------ */

  function onTalk(npcId, wid) {
    const w = ensure();
    const first = w.talked[npcId] !== wid;
    if (first) {
      w.talked[npcId] = wid;
      addRapport(npcId, 1);
    }
    checkAchievements(w);
    return first;
  }

  function accept(qid) {
    const w = ensure();
    if (w.quests[qid]) return false;
    w.quests[qid] = { stage: 0 };
    const q = QUESTS[qid];
    if (q.unlockOnAccept && !w.unlocked.includes(q.unlockOnAccept)) {
      w.unlocked.push(q.unlockOnAccept);
    }
    return true;
  }

  /** 命中当前目标则推进；返回是否推进 */
  function advance(qid) {
    const w = ensure();
    const q = w.quests && w.quests[qid];
    if (!q || q.done) return false;
    if (q.stage < QUESTS[qid].steps.length) {
      q.stage++;
      checkAchievements(w);
      return true;
    }
    return false;
  }

  function complete(qid) {
    const w = ensure();
    const q = w.quests && w.quests[qid];
    if (!q || q.done || q.stage < QUESTS[qid].steps.length) return null;
    q.done = true;
    addRapport(QUESTS[qid].giver, 2);
    if (!w.notes.includes(qid)) w.notes.push(qid);
    checkAchievements(w);
    return { note: NOTES[qid], rapport: QUESTS[qid].giver };
  }

  /** 到达某地：reach 类目标推进；返回被推进的委托 */
  function onReach(loc) {
    const w = ensure();
    if (!w.loc) w.loc = loc;
    w.loc = loc;
    if (!w.visited.includes(loc)) w.visited.push(loc);
    const hit = [];
    for (const qid in w.quests) {
      const q = w.quests[qid];
      if (q.done) continue;
      const step = QUESTS[qid].steps[q.stage];
      if (step && step.type === 'reach' && step.at === loc) {
        q.stage++;
        hit.push(qid);
      }
    }
    checkAchievements(w);
    return hit;
  }

  /** 看一看：返回文案；同时推进 observe 类目标 */
  function onObserve(loc, wid) {
    const w = ensure();
    const L = LOCS[loc];
    const text = (L && (L.look[wid] || L.look.default)) || '';
    const hit = [];
    for (const qid in w.quests) {
      const q = w.quests[qid];
      if (q.done) continue;
      const step = QUESTS[qid].steps[q.stage];
      if (step && step.type === 'observe' && step.at === loc) {
        q.stage++;
        hit.push(qid);
      }
    }
    w.observed[loc + ':' + wid] = true;
    checkAchievements(w);
    return { text, hit, seen: !!w.observed[loc + ':' + wid] };
  }

  /** 解锁窗口地点（累计） */
  function unlockWindow(wid) {
    const w = ensure();
    const idx = Number(wid.slice(1));
    if (idx > w.windowSeen) w.windowSeen = idx;
    for (const l of WINDOWS[wid].unlocks) {
      if (!w.unlocked.includes(l)) w.unlocked.push(l);
    }
    return w;
  }

  /** 手记 → 口袋面板的追加页 */
  function notebookExtras() {
    const w = ensure();
    if (!w || !w.notes.length) return [];
    return w.notes.map((qid) => NOTES[qid]).filter(Boolean);
  }

  /** 故事推进时同步当前位置（非漫游期也能在地图上看到“你在这里”） */
  function track(sceneKey) {
    const w = ensure();
    if (!w || !LOCS[sceneKey]) return;
    w.loc = sceneKey;
    if (!w.visited.includes(sceneKey)) w.visited.push(sceneKey);
  }

  /* 成就注册进剧情表（一次性） */
  (function register() {
    const ST = SP.story;
    if (!ST || !ST.ACHIEVEMENTS) return;
    for (const a of GAME_ACHIEVEMENTS) {
      if (!ST.ACHIEVEMENTS.some((x) => x.id === a.id)) ST.ACHIEVEMENTS.push(a);
    }
  })();

  SP.game = {
    LOCS, LOC_ROADS, WINDOWS, GATE_TO_WINDOW, NPCS, QUESTS, QUEST_LINES, NOTES, GAME_ACHIEVEMENTS,
    RAPPORT_MAX,
    freshWorld, ensure, windowOf, npcAt, npcsHere, npcHasBusiness,
    questsOfferable, readyQuestsFor, stepQuestsFor, questReadyToTurnIn,
    onTalk, accept, advance, complete, onReach, onObserve, unlockWindow,
    notebookExtras, track, checkAchievements,
  };
})(window);
