/*!
 * 留一盏灯 · 漫游版  |  game.js
 * 世界层：地图、人物日程、委托规则、口袋里的东西。
 * 纯数据与纯逻辑，不碰 DOM——呈现交给 roam.js，内容数据在 quests.js。
 *
 * 与旧版最大的不同：委托不再只是「主线旁边的小事」。
 * 每组互斥委托里你选了哪一件，就会把 flag 写进世界；
 * 主线每到分岔就读这些 flag，于是「这个月你把时间给了谁」
 * 直接决定了故事往哪边走。
 *
 * 世界状态挂在 Engine.state.world 上，随既有存档系统一起保存。
 */
(function (global) {
  'use strict';
  const SP = global.SP;
  const { clamp } = SP;
  const QD = SP.quests;
  const { ITEMS, GROUPS, QUESTS, QUEST_LINES, NOTES, KEEPSAKES } = QD;

  /* ------------------------------------------------------------------ *
   * 地点：14 处，与 art.js 的场景一一对应。
   * x/y 是地图坐标（SVG 720×520）；look 是「看一看」的文案，
   * default 通用，wN 为该漫游窗口的特供版本。
   * egg 是这个地方能顺手捡到的小东西（每处一件，捡过就不再出现）。
   * ------------------------------------------------------------------ */
  const LOCS = {
    campus:    { name: '东门',        x: 78,  y: 428, egg: 'e_garlic', look: { default: '校门口的蓝色围挡还在，只是挪了一条道。保安亭的窗台上多了一盆蒜苗。', w1: '行李箱的轮子在石板路上响得夸张，像给每个新生配了进场音乐。' } },
    avenue:    { name: '林荫道',      x: 186, y: 352, egg: 'e_leaf',   look: { default: '梧桐换了个姿势掉叶子。路灯还没亮，有人在树下背单词，声音压得很低。', w1: '傍晚的光把林荫道铺成一条缓坡。晾衣被在楼群之间晒出一个个方块。' } },
    club:      { name: '活动中心',    x: 482, y: 132, egg: 'e_tape',   look: { default: '活动中心的玻璃门上贴满了招新海报，最旧的一张是三年前的吉他社。', w2: '长桌从门口排到台阶下。每个摊位都在喊“不限基础”，声音真诚又沙哑。' } },
    canteen:   { name: '第二食堂',    x: 238, y: 98,  egg: 'e_chopsticks', look: { default: '第二食堂的灯分两批亮。先亮打饭的窗口，再亮吃饭的桌子，像一场慢吞吞的开幕。', w1: '铝盆和勺子磕出一整套打击乐。粥的热气把窗玻璃糊成毛玻璃。', w3: '棉套套在粥桶外面，热气从缝里溜出来。晚班窗口前只剩两个人在挑面条。' } },
    plaza:     { name: '中心广场',    x: 305, y: 288, egg: 'e_balloon', look: { default: '中心广场的旗杆下有人拍照。鸽子上一次集体起飞是什么时候，没人记得。', w2: '招新的音响循环同一首歌。广场砖缝里长出一茬小草，明年会有人发现它们。' } },
    classroom: { name: '教学楼',      x: 418, y: 240, egg: 'e_chalk',  look: { default: '教学楼的走廊很长，长得刚好能把一句话想完。黑板槽里躺着半截粉笔。', w2: '周五下午的教室有阳光斜进来。有人把上一节课的板书抄了一半，另一半留给了下一个人。', w4: '空教室的黑板擦得很干净。讲台上留着一张没收走的课程表。' } },
    lecture:   { name: '放映厅',      x: 298, y: 418, egg: 'e_popcorn', look: { default: '放映厅的幕布垂着，像还没决定要不要开口。红色座椅一排排往暗处去。', w4: '放映厅白天不开灯。从门口数到幕布，正好十九步——上学期有人量过。', w5: '投影的光柱里有浮尘慢慢转。第一排没人坐，大家都默契地往后挪。' } },
    dorm:      { name: '四号楼',      x: 148, y: 182, egg: 'e_hanger', look: { default: '四号楼的楼道里有洗衣粉和泡面的味道，混得并不难闻。水房的声音整晚不停。', w1: '417 的门牌歪了一点。走廊折叠桌的桌脚还垫着上学期宣传单。' } },
    library:   { name: '图书馆',      x: 388, y: 88,  egg: 'e_bookcard', look: { default: '图书馆的闭馆音乐响之前，总有人开始收拾东西，像潮水提前退了一格。', w2: '器材借用处的柜台擦得发亮。每一根转接线上都缠着编号胶带，缠得很仔细。' } },
    lake:      { name: '湖边',        x: 520, y: 402, egg: 'e_pebble', look: { default: '湖边有风，风里有人语。长椅背对着夕阳，坐上去就是一幅剪影。', w4: '雪落在湖面上，落多少都不留下。对岸的路灯傍晚就亮了，倒影比灯本体长。' } },
    cafe:      { name: '南门咖啡馆',  x: 588, y: 232, egg: 'e_card',   look: { default: '南门咖啡馆的招牌灯箱有一个字母不亮。店员说那是故意的，没人信。', w2: '咖啡馆下午人不多。有人在拼桌写东西，笔尖的声音比说话多。', w3: '桌下的延长线被灯照出来，像这晚唯一没摆好姿势的东西。' } },
    roof:      { name: '天台',        x: 322, y: 196, egg: 'e_doorstop', look: { default: '天台的门虚掩着。从这里看，校园小得可以一眼记住，又大得四年走不完。' } },
    track:     { name: '操场',        x: 612, y: 88,  egg: 'e_bean',   look: { default: '操场的看台是观察黄昏的最佳位置。跑道上有人在最后一圈加速，明知没人计时。' } },
    hall:      { name: '礼堂',        x: 108, y: 62,  egg: 'e_stub',   look: { default: '礼堂的座椅可以翻动，落下去“啪”的一声很郑重。台上没有人的时候，台下也庄重。', w5: '礼堂的库存角堆着折叠椅和旧幕布。钥匙一大串，用胶布标着各自的门。' } },
  };
  const LOC_ROADS = [
    ['campus', 'avenue'], ['avenue', 'plaza'], ['plaza', 'dorm'], ['dorm', 'canteen'], ['canteen', 'hall'],
    ['plaza', 'classroom'], ['classroom', 'library'], ['library', 'club'], ['club', 'track'],
    ['classroom', 'roof'], ['plaza', 'lecture'], ['lecture', 'lake'], ['lake', 'cafe'],
  ];

  /* ------------------------------------------------------------------ *
   * 漫游窗口：故事推进到“闸门节点”时，先自由活动，走到目标地点后继续主线。
   * unlocks 为该窗口新开放的地点（累计制）。
   * theme 是进入自由行动时的一句话——不再说「现在是自由时间」，
   * 而是接着上一段故事的口气往下讲。
   * ------------------------------------------------------------------ */
  const WINDOWS = {
    w1: { gate: 'gate_laugh', next: 'room0',   target: 'dorm',      title: '报到日 · 自由活动',
      theme: '报到的下午还长着，四号楼的门牌还没找着。',
      hint: '跟着晾衣被走——四号楼 417', unlocks: ['campus', 'avenue', 'dorm', 'canteen'] },
    w2: { gate: 'c1end',      next: 'c2open',  target: 'club',      title: '十月 · 自由活动',
      theme: '招新的热闹还散在广场上，谁也不急着走。',
      hint: '十月的社团招新在活动中心门口', unlocks: ['club', 'library', 'plaza', 'classroom'] },
    w3: { gate: 'c2end',      next: 'c3open',  target: 'dorm',      title: '十一月 · 自由活动',
      theme: '十一月，很多事堆在了一起，一件压着一件。',
      hint: '十一月的第一晚，回寝室看粗剪', unlocks: ['cafe', 'lake'] },
    w4: { gate: 'c3end',      next: 'c4open',  target: 'classroom', title: '十二月 · 自由活动',
      theme: '雪落得很小，事情却都到了最后几天。',
      hint: '去教学楼参加展映说明会', unlocks: ['lecture', 'roof', 'track'] },
    w5: { gate: 'c4end',      next: 'c5open',  target: 'lecture',   title: '一月 · 自由活动',
      theme: '放映前的这一天，你只有一双手。',
      hint: '放映那天，提前去放映厅', unlocks: ['hall'] },
  };
  const GATE_TO_WINDOW = {};
  for (const wid in WINDOWS) GATE_TO_WINDOW[WINDOWS[wid].gate] = wid;

  /* ------------------------------------------------------------------ *
   * 人物日程：每个漫游窗口里，谁在哪、聊什么。
   * greet  第一次见面说的话（每窗口一次）
   * again  常驻寒暄，按好感度分档：
   *          0 → 还客气着    3 → 已经熟了
   *        熟到 5 以后不再走 here，改由 KEEPSAKES 接管（见 keepsakeFor）。
   * ------------------------------------------------------------------ */
  const NPCS = {
    man: {
      friendLine: '聊天聊到这儿就够熟了。想再近一点，得一起做点什么。',
      name: '小满', windows: {
        w1: { loc: 'campus', x: 26, y: 38,
          greet: ['手推车还回去了，大叔说下一个借车的要等明年。', '四号楼在梧桐树后头，看见晾衣被就右拐。导航不认晾衣被，我认。'],
          again: { 0: ['我刚才帮三个新生指了路。两个说了谢谢，一个管我叫学姐——我今年也才大一。'],
                   3: ['路记住了吗？没记住也别怕，我给自己画了张地图，回头复印一张塞你门缝。', '画得不好看，但比学校发的那张强——至少上面有食堂。'] } },
        w2: { loc: 'club', x: 30, y: 36,
          greet: ['招新表收了三十四张。有一张只写了个名字，电话栏画了个笑脸。', '我们社今天招到七个人，五个是冲着免费汽水来的。汽水也是我搬的。'],
          again: { 0: ['有个学弟问我们社“包不包介绍对象”。我说不包，他说那再看看。'],
                   3: ['今天有人问我们片子讲什么。我说讲一盏灯。他说哦，那挺省钱的。', '……我竟无法反驳。'] } },
        w3: { loc: 'cafe', x: 28, y: 40,
          greet: ['策划改到第五版。第四版被否的理由是“太好了，不像我们能拍出来的”。', '服务员第三次来加水了。他肯定以为我们在谈大项目。其实预算就六块钱。'],
          again: { 0: ['我把“转场”两个字写了二十遍，现在看它像“转肠”。饿了。'],
                   3: ['你说“先把人拍对，灯自然会亮”——这话我抄策划第一页了。', '字丑，但位置很显眼。'] } },
        w4: { loc: 'lake', x: 34, y: 42,
          greet: ['雪天的湖边没人，收音干净得能录到自己的心跳。', '我录了一段路灯。它闪了一下，像在跟我打招呼——也可能只是接触不良。'],
          again: { 0: ['手冻僵了，按快门像在按一块砖。你跺跺脚，别站着，站着最冷。'],
                   3: ['这卷素材我准备叫“十二月十五日，晴转雪”。', '名字长是长了点。但以后翻出来，一看就知道是哪天。'] } },
        w5: { loc: 'lecture', x: 30, y: 38,
          greet: ['两个U盘都格式化过，备份在两个地方。昨晚检查了四遍，今早又检查一遍。', '人一紧张就想找事做。我把第一排的灰都擦了。'],
          again: { 0: ['门口那张“放完可以说话，也可以直接走”的条子是我贴的。写完觉得，这话也是说给我自己的。'],
                   3: ['等放完，我们去吃面。就上次说的那家，加两份浇头。', '今天不谈剪辑。今天只谈浇头。'] } },
      },
    },
    cheng: {
      friendLine: '话说到这儿就到这儿吧。再近，得靠一起做的事。',
      name: '程野', windows: {
        w1: { loc: 'dorm', x: 68, y: 36,
          greet: ['椅子修好了，四条腿一般高。差的那四颗螺丝，五金店说下周到货。', '网要是再转圈，把路由器电源拔了，数到十再插上。数不到十不算。'],
          again: { 0: ['网线蓝的好用，白的接触不良。便签贴墙上了，字丑，凑合看。'],
                   3: ['插线板挪到你桌角了。', '你半夜找插座的声音，比闹钟准。'] } },
        w2: { loc: 'dorm', x: 68, y: 36,
          greet: ['周日试拍我能来。说好了就不变。', '设备清单发群里了。第三行那个别买，租就行，省四十。'],
          again: { 0: ['今天食堂打菜的手都不抖。开学果然不一样。'],
                   3: ['周日我早到半小时，先把凳子摆了。', '别谢。谢字说出口，事就生分了。'] } },
        w3: { loc: 'canteen', x: 32, y: 38,
          greet: ['这周我周三周五晚班。窗口第三个。报我名字不加菜，但能多聊两句。', '六块钱的事我没忘。欠账这种事，记仇不如记账。'],
          again: { 0: ['今天的粥比昨天稠。大师傅换了个人，或者换了只手。'],
                   3: ['排班表我抄了一份放你桌上。你那个空档，我看着都替你累。', '……最后那句当我没说。'] } },
        w4: { loc: 'dorm', x: 68, y: 36,
          greet: ['期末，十一点熄大灯。台灯给你留了，光偏黄，不晃眼。', '导出卡七十三那个，重启试试。不行就分段导。别死等，死等最费电。'],
          again: { 0: ['螺丝到货了。四颗，一颗不多。老板终于认识我了。'],
                   3: ['台灯你用着，我熄灯早，用不上。', '别熬太晚。电费我交，黑眼圈你自己交。'] } },
        w5: { loc: 'dorm', x: 68, y: 36,
          greet: ['下课我直接去放映厅搬凳子。三十把，我数过了，差两把找周老师借。', '你先去。别在寝室转圈，地板要被你踩出坑。'],
          again: { 0: ['介绍词别背，背出来的像检讨。想好三句就行：叫什么，拍了什么，谢谢谁来。'],
                   3: ['上学期那把椅子，是你陪我修好的。', '今天搬凳子算我还你。账清了，下回接着欠。'] } },
      },
    },
    yan: {
      friendLine: '言语上的熟悉是有上限的。一起做完一件事，才算真的熟。',
      name: '阿言', windows: {
        w2: { loc: 'library', x: 30, y: 38,
          greet: ['转接线借出三根，收回两根。少的那根我记着，不急。', '借录音笔填这张表。用途那栏写具体点，“拍着玩”不算用途。'],
          again: { 0: ['第三排书架有人吃饼干，渣掉进书缝里了。……不是说你。但你也别。'],
                   3: ['我定了条新规矩：借之前数一遍，还之前数一遍。', '规矩写在那儿，就不用我开口。我开口，总像在训人。'] } },
        w4: { loc: 'library', x: 30, y: 38,
          greet: ['毕业申请交了。照片还是歪的，算了，歪着也是我。', '放映厅的幕布去年卡过一次，绳子绕反了。你们用之前，先拉两下试试。'],
          again: { 0: ['闭馆音乐换了。管理员说原来那首太好听，总有人赖着不走。', '原来那首叫什么，我到现在也不知道。'],
                   3: ['交接文件夹我建好了，二十三个文档，都有编号。', '下一届不用认识我，认识这个文件夹就行。'] } },
        w5: { loc: 'lecture', x: 62, y: 38,
          greet: ['钥匙、插排、转接头，都在这个袋子里。清单我勾了一半，剩下的用一样勾一样。', '散场要恢复桌椅。这条是我提的。规矩是规矩，谁放的片子都一样。'],
          again: { 0: ['今天来的人比预想多。门口那张字条写得好，实话实说，不端着。'],
                   3: ['清单全勾上了，一样不缺。', '这是我最后一次锁这间放映厅的门。锁了四年，今天手居然有点生。'] } },
      },
    },
    aunt: {
      friendLine: '唠到这儿够啦！想跟我更熟，就常来食堂吃饭。',
      name: '陈姨', windows: {
        w1: { loc: 'canteen', x: 30, y: 40,
          greet: ['新来的吧！站那儿干啥，粥免费，先喝一碗！', '窗边第三张桌子腿稳，我上礼拜刚垫过。就坐那儿，听姨的。'],
          again: { 0: ['晚上想吃啥提前说！九点以后只剩面条。……面条也是姨煮的，不亏待你。'],
                   3: ['粥给你留了锅底那勺，最稠！', '别跟姨客气。客气在食堂吃不饱。'] } },
        w2: { loc: 'canteen', x: 30, y: 40,
          greet: ['十月人少了，粥桶换小的了。看见没，姨这儿也讲成本控制！', '你们那个片子啥时放？姨那几个碗出了镜，出场费结一下——逗你的！'],
          again: { 0: ['招新吃饱了没？那些摊位发的糖别当饭吃。过来，姨给你留了菜。'],
                   3: ['真上映了跟姨说一声！', '姨坐最后一排，不碍事。姨就是想看看。'] } },
        w3: { loc: 'canteen', x: 30, y: 40,
          greet: ['天冷喽！粥桶都套棉套了，你穿这么少，还不如个桶！', '晚班窗口人少，过来吃面，姨给你卧个蛋。'],
          again: { 0: ['门口那个弯刚拖过，绕着走！上礼拜有个娃在那儿滑出去两米，饭愣是没撒。'],
                   3: ['靠窗那盏灯姨给你留着。', '你啥时候来都行，姨关火晚。'] } },
        w4: { loc: 'canteen', x: 30, y: 40,
          greet: ['雪天菜进得晚，面条管够！先吃着！', '名单上姨那个“姨”字，姨自己对了三遍。这回准没错！'],
          again: { 0: ['邻居问姨是不是要当明星了。姨说啥明星，碗才是主角！'],
                   3: ['你写的字比姨的好看。姨那会儿没念几年书。', '……行了行了，吃你的面，汤都要凉了！'] } },
        w5: { loc: 'canteen', x: 30, y: 40,
          greet: ['今晚姨带邻居去看你们片子！她非要换件新衣服，拦都拦不住！', '放完都过来喝汤，姨把火给你们留着！'],
          again: { 0: ['汤添了两回水了，再不来就淡喽！'],
                   3: ['你们不来，姨不关这个火。', '姨说话算话。食堂开了十几年，火没提前关过一回。'] } },
      },
    },
    teacher: {
      friendLine: '聊得再多，不如做成一件事。',
      name: '周老师', windows: {
        w2: { loc: 'classroom', x: 34, y: 36,
          greet: ['先别急着问器材。先说说，你们这个片子，拍给谁看？', '想不清楚没关系。最怕的是没想过。'],
          again: { 0: ['“关于学校”和“发生在学校”，是两回事。回去想想，想明白了再来。'],
                   3: ['你最近问的问题，变了。', '从“怎么拍”变成“拍什么”。这是好事，接着变。'] } },
        w3: { loc: 'classroom', x: 34, y: 36,
          greet: ['预审快到了吧。', '别问我“能不能过”。先问你们自己：哪一段最舍不得删？舍不得删的，先保住。'],
          again: { 0: ['改片子和改作文一样。不是哪里不好改哪里，是先想清楚要它成为什么。'],
                   3: ['听说你们为粗剪吵了一架。', '吵得好。片子是吵出来的，一团和气剪不出东西。'] } },
        w4: { loc: 'classroom', x: 34, y: 36,
          greet: ['期末了。先把考试对付过去，再谈创作。顺序别反，反了两头都顾不上。', '放映的日子定了就倒着排。从那天往回数，一天一件事。'],
          again: { 0: ['小测挂了的先补考。片子放不放，学校都在；学籍可不一定。', '……这话不中听。中听的话，留给片子去说。'],
                   3: ['你们来问教室号那天，我就知道这片子放得成。', '会跑腿的学生，比会做梦的学生靠谱。你们两样都占点。'] } },
        w5: { loc: 'hall', x: 36, y: 40,
          greet: ['礼堂的钥匙一大串，开得了门，开不了场。开场得靠你们自己。', '我年轻那会儿也帮学生放片子。投影仪比我先退休。东西会坏，事别断。'],
          again: { 0: ['我不坐前面。最后一排看得最清楚——谁看进去了，谁在看表。'],
                   3: ['最后一排今天有人坐了。', '我那台老投影仪退休的时候，没人送它。你们这部片子，比它有福气。'] } },
      },
    },
    mom: {
      name: '妈妈', phone: true, freeChat: true, windows: {
        w1: { loc: 'dorm', x: 50, y: 34,
          greet: ['到学校了吧？吃饭了没？', '妈妈就是想听听你的声。……行了，去忙你的，忙完再打过来也行。'],
          again: { 0: ['行李收拾好了没？被子够不够厚？……妈妈就是问问。'],
                   3: ['刚才忘了问——宿舍几个人？都好相处不？', '你别嫌妈妈啰嗦。你说了，妈妈心里就有个样子了。'] } },
        w2: { loc: 'dorm', x: 50, y: 34,
          greet: ['十月了吧？那边冷不冷？', '妈妈给你寄了点吃的，到了记得去拿。分给同学吃，别一个人放着。'],
          again: { 0: ['寄的东西拿了没？别让它在快递站过夜。'],
                   3: ['你说你们社团在拍片子？拍的啥，妈妈也听不懂。', '你拍就行了。拍完了，讲给妈妈听。'] } },
        w3: { loc: 'dorm', x: 50, y: 34,
          greet: ['生活费还够吗？……妈妈就是问问。你别每次都先说“够”。', '你上次说食堂的粥免费。妈妈想知道那食堂长啥样。桌子跟家里的比，哪个亮？'],
          again: { 0: ['蒸蛋水多了成汤，水少了成砖。记着这个，饿不着。'],
                   3: ['你上次拍的桌子，妈妈存起来了。', '下回拍一张你自己。别光拍桌子。'] } },
        w4: { loc: 'dorm', x: 50, y: 34,
          greet: ['降温了，你们那边的天气预报，妈妈天天看。', '秋裤找出来没？……你别笑。感冒一次，耽误十天。'],
          again: { 0: ['拉链坏了就拿针线别一下，别硬拽。……妈妈说的是衣服，也是别的。'],
                   3: ['期末了吧？考完给妈妈来个电话，响一声也行。', '响一声，妈妈就知道你考完了。'] } },
        w5: { loc: 'dorm', x: 50, y: 34,
          greet: ['片子今天放？……妈妈跟邻居张姨说了，我儿子拍的电影，今天放。', '放完了跟妈妈说一声。好不好看，你说了才算。'],
          again: { 0: ['别紧张。你小时候上台背诗，忘词了站着笑，台下也给你鼓掌。'],
                   3: ['妈妈不懂电影。', '妈妈就懂一件事：你做的事，有人愿意来看，那就是好事。'] } },
      },
    },
  };

  /* ------------------------------------------------------------------ *
   * 新增成就（挂进剧情成就表，封面与成就面板自动并入）
   * 注意：委托分成互斥组之后，「全部完成」不再可能，
   * 所以门槛改成做满多少条、掌握多少次。
   * ------------------------------------------------------------------ */
  const GAME_ACHIEVEMENTS = [
    { id: 'explorer',   name: '把校园走遍', desc: '十四个地方都去过', icon: '⌖' },
    { id: 'greeter',    name: '都打过招呼', desc: '和六位都聊过天', icon: '☰' },
    { id: 'helper',     name: '帮上忙了',   desc: '完成第一个委托', icon: '✓' },
    { id: 'courier',    name: '两手之间',   desc: '亲手把一件东西从一个人手里交到另一个人手里', icon: '➜' },
    { id: 'curator',    name: '角落里的小东西', desc: '找齐校园里的十四件小物', icon: '❦' },
    { id: 'confidant',  name: '熟到不能再熟', desc: '有一个人和你到了最后', icon: '♥' },
    { id: 'allconfidant', name: '六个都到了', desc: '和六个人都熟到底', icon: '☘' },
    { id: 'workhorse',  name: '这一学期的事', desc: '完成十五条委托', icon: '✦' },
    { id: 'packrat',    name: '口袋更深了', desc: '集齐二十张手记', icon: '▤' },
  ];

  /* ------------------------------------------------------------------ *
   * 世界状态（挂在 Engine.state.world）
   * ------------------------------------------------------------------ */
  const RAPPORT_MAX = 5;
  const HELP_FULL = 15;    // 「这一学期的事」
  const NOTE_FULL = 20;    // 「口袋更深了」

  function freshWorld() {
    return {
      loc: 'campus',
      unlocked: WINDOWS.w1.unlocks.slice(),
      visited: ['campus'],
      talked: {},      // npc -> 最近打过招呼的窗口
      chatR: {},       // npc -> 已经靠「聊天」拿到过几点（聊天上限 3 点）
      rapport: {},     // npc -> 0..5
      quests: {},      // qid -> { stage, done? }
      notes: [],       // 手记 qid 列表
      observed: {},    // loc:wid -> 已看过
      items: [],       // 口袋：item id 列表（任务道具 / 小物 / 留念物）
      keepsakes: [],   // 已经拿到留念物的 npc
      flags: {},       // 委托写下的分路 flag
      windowSeen: 0,
    };
  }

  function ensure() {
    const st = SP.engine.state;
    if (!st) return null;
    let w = st.world;
    if (!w || !w.unlocked) { st.world = freshWorld(); return st.world; }
    // 老存档兼容：补齐新字段，剔掉已经不在表里的条目
    if (!Array.isArray(w.items)) w.items = [];
    if (!Array.isArray(w.keepsakes)) w.keepsakes = [];
    if (!w.flags || typeof w.flags !== 'object') w.flags = {};
    if (!w.quests || typeof w.quests !== 'object') w.quests = {};
    for (const qid in w.quests) if (!QUESTS[qid]) delete w.quests[qid];
    w.notes = (w.notes || []).filter((qid) => NOTES[qid]);
    return w;
  }

  function give(id) {
    if (SP.storage.unlockAchievement(id)) {
      SP.ui.achievementPopup(id);
      SP.audio.sfx('unlock');
    }
  }

  /* ------------------------------ 口袋 ------------------------------ */

  const asList = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
  const itemDef = (id) => ITEMS[id] || null;
  const ownedItems = () => (ensure() || {}).items || [];
  const hasItem = (id) => ownedItems().includes(id);
  const itemsOfKind = (kind) => ownedItems().filter((id) => (ITEMS[id] || {}).kind === kind);
  /** 一件东西有没有被人来回递过（用于成就与「两手之间」） */
  function deliveredCount() {
    const w = ensure();
    if (!w) return 0;
    let n = 0;
    for (const qid in w.quests) {
      const q = w.quests[qid];
      if (!q.done) continue;
      (QUESTS[qid].steps || []).forEach((s) => { if (asList(s.give).length) n++; });
    }
    return n;
  }

  function checkAchievements(w) {
    if (Object.keys(LOCS).every((l) => w.visited.includes(l))) give('explorer');
    if (Object.keys(NPCS).every((n) => w.talked[n])) give('greeter');
    const done = Object.keys(w.quests).filter((q) => w.quests[q].done);
    if (done.length >= 1) give('helper');
    if (done.length >= HELP_FULL) give('workhorse');
    if (w.notes.length >= NOTE_FULL) give('packrat');
    if (deliveredCount() > 0) give('courier');
    const eggs = (w.items || []).filter((id) => (ITEMS[id] || {}).kind === 'egg');
    if (eggs.length >= Object.keys(LOCS).length) give('curator');
    const full = Object.keys(NPCS).filter((n) => (w.rapport[n] || 0) >= RAPPORT_MAX);
    if (full.length >= 1) give('confidant');
    if (full.length >= Object.keys(NPCS).length) give('allconfidant');
  }

  function addRapport(npc, delta) {
    const w = ensure();
    if (!w) return 0;
    const before = w.rapport[npc] || 0;
    w.rapport[npc] = clamp(before + delta, 0, RAPPORT_MAX);
    return w.rapport[npc] - before;
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

  /** 常驻寒暄：按好感度取档（0 还客气，3 已经熟了） */
  function npcAgain(npcId, wid) {
    const w = ensure();
    const spot = npcAt(npcId, wid);
    if (!spot || !spot.again) return [];
    const r = (w && w.rapport[npcId]) || 0;
    const tiers = Object.keys(spot.again).map(Number).sort((a, b) => a - b);
    let pick = null;
    for (const t of tiers) if (r >= t) pick = t;
    if (pick === null) pick = tiers[0];
    return spot.again[pick] || [];
  }

  /** 前置条件是否满足（requires.quest / requires.items） */
  function reqMet(qid) {
    const w = ensure();
    const r = QUESTS[qid].requires;
    if (!r) return true;
    if (r.quest) {
      const q = w.quests[r.quest];
      if (!q || !q.done) return false;
    }
    for (const it of asList(r.items)) if (!w.items.includes(it)) return false;
    return true;
  }

  /** 组内已经接下（或完成）的那一件 */
  function groupTaken(groupId) {
    const w = ensure();
    if (!w || !groupId) return null;
    for (const qid in QUESTS) {
      if (QUESTS[qid].group === groupId && w.quests[qid]) return qid;
    }
    return null;
  }

  /**
   * 一条委托此刻的状态：
   *   done       已完成
   *   ready      目标都做完了，可以回去交差
   *   active     进行中
   *   abandoned  同一组里你已经选了别的，这件这个月做不成了
   *   locked     前置条件没满足
   *   offer      可以接
   */
  function questState(qid) {
    const w = ensure();
    if (!w || !QUESTS[qid]) return 'locked';
    const q = w.quests[qid];
    if (q) {
      if (q.done) return 'done';
      return q.stage >= QUESTS[qid].steps.length ? 'ready' : 'active';
    }
    const g = QUESTS[qid].group;
    if (g && groupTaken(g)) return 'abandoned';
    if (!reqMet(qid)) return 'locked';
    return 'offer';
  }

  /** 被互斥挤掉的那些委托（日志里要写明“这个月没空”） */
  function abandonedQuests(wid) {
    return Object.keys(QUESTS).filter((qid) =>
      QUESTS[qid].window === wid && questState(qid) === 'abandoned');
  }

  /** npc 在当前窗口是否有“与你有关的事”（地图/场景标记用） */
  function npcHasBusiness(npcId, wid) {
    const w = ensure();
    if (!w) return false;
    if (keepsakeFor(npcId)) return true;                  // 熟到底了，有东西要给你
    for (const qid in w.quests) {
      const q = w.quests[qid];
      if (q.done) continue;
      if (QUESTS[qid].giver === npcId && q.stage >= QUESTS[qid].steps.length) return true;
      const step = QUESTS[qid].steps[q.stage];
      if (step && step.type === 'talk' && step.npc === npcId) return true;
    }
    for (const qid in QUESTS) {
      if (QUESTS[qid].window !== wid || QUESTS[qid].giver !== npcId) continue;
      if (questState(qid) === 'offer') return true;
    }
    return false;
  }

  function questsOfferable(npcId, wid) {
    const w = ensure();
    // 同一个人手上还压着没办完的事，就不会再开口拜托下一件
    const busy = Object.keys(w.quests).some((qid) =>
      QUESTS[qid].giver === npcId && !w.quests[qid].done);
    if (busy) return [];
    return Object.keys(QUESTS).filter((qid) =>
      QUESTS[qid].window === wid && QUESTS[qid].giver === npcId && questState(qid) === 'offer');
  }

  function questReadyToTurnIn(qid) {
    const w = ensure();
    const q = w && w.quests && w.quests[qid];
    return !!q && !q.done && q.stage >= QUESTS[qid].steps.length;
  }

  function readyQuestsFor(npcId) {
    const w = ensure();
    if (!w || !w.quests) return [];
    return Object.keys(w.quests).filter((qid) => QUESTS[qid].giver === npcId && questReadyToTurnIn(qid));
  }

  function stepQuestsFor(npcId) {
    const w = ensure();
    if (!w || !w.quests) return [];
    return Object.keys(w.quests).filter((qid) => {
      const q = w.quests[qid];
      if (q.done) return false;
      const step = QUESTS[qid].steps[q.stage];
      return !!step && step.type === 'talk' && step.npc === npcId;
    });
  }

  /** 当前这一步的说明文字（对话里当提示用） */
  function currentStep(qid) {
    const w = ensure();
    const q = w && w.quests && w.quests[qid];
    if (!q) return null;
    return QUESTS[qid].steps[q.stage] || null;
  }

  /** 某条委托、某一步的对白（reach / observe 那几步是空数组） */
  function stepLines(qid, i) {
    const L = QUEST_LINES[qid];
    if (!L || !L.steps) return [];
    return L.steps[i] || [];
  }

  /* ------------------------------ 事件 ------------------------------ */

  /** 聊天最多贡献 3 点：再往上只能靠一起办事（委托 / 经手） */
  const RAPPORT_CHAT_CAP = 3;

  function onTalk(npcId, wid) {
    const w = ensure();
    const first = w.talked[npcId] !== wid;
    if (first) {
      w.talked[npcId] = wid;
      const npc = NPCS[npcId] || {};
      if (!w.chatR) w.chatR = {};
      const used = w.chatR[npcId] || 0;
      if (npc.freeChat || used < RAPPORT_CHAT_CAP) {
        w.chatR[npcId] = used + 1;
        addRapport(npcId, 1);
      }
    }
    checkAchievements(w);
    return first;
  }

  /** 这个人的好感已经不能再靠聊天往上走了 */
  function chatCapped(npcId) {
    const npc = NPCS[npcId] || {};
    if (npc.freeChat) return false;
    const w = ensure();
    return (w.chatR && (w.chatR[npcId] || 0) >= RAPPORT_CHAT_CAP);
  }

  /** 接下委托：同组的其余几件就此作罢 */
  function accept(qid) {
    const w = ensure();
    if (!w || w.quests[qid] || questState(qid) !== 'offer') return null;
    w.quests[qid] = { stage: 0 };
    const q = QUESTS[qid];
    if (q.unlockOnAccept && !w.unlocked.includes(q.unlockOnAccept)) w.unlocked.push(q.unlockOnAccept);
    const abandoned = [];
    if (q.group) {
      for (const o in QUESTS) {
        if (o !== qid && QUESTS[o].group === q.group && !w.quests[o]) abandoned.push(o);
      }
    }
    // 主线已经没有「当场做选择」这回事了，第一个选择发生在接委托的时候
    give('firstChoice');
    checkAchievements(w);
    return { qid, group: q.group || null, abandoned };
  }

  /**
   * 完成一步：结算道具（先交出、再收下），然后推进 stage。
   * 「拿到 → 收进口袋 → 交付时给出去」全在这一个函数里。
   */
  function settleStep(qid) {
    const w = ensure();
    const q = w && w.quests && w.quests[qid];
    if (!q || q.done) return null;
    const step = QUESTS[qid].steps[q.stage];
    if (!step) return null;
    const gave = [], took = [];
    for (const id of asList(step.give)) {
      const i = w.items.indexOf(id);
      if (i >= 0) { w.items.splice(i, 1); gave.push(id); }
    }
    for (const id of asList(step.take)) {
      if (id && ITEMS[id] && !w.items.includes(id)) { w.items.push(id); took.push(id); }
    }
    q.stage++;
    checkAchievements(w);
    return { qid, took, gave, stage: q.stage };
  }

  /** 与某人/某地对话推进的 talk 步 */
  function advance(qid) { return settleStep(qid); }

  function complete(qid) {
    const w = ensure();
    const q = w && w.quests && w.quests[qid];
    if (!q || q.done || q.stage < QUESTS[qid].steps.length) return null;
    q.done = true;
    const flags = QUESTS[qid].setFlags || {};
    Object.assign(w.flags, flags);
    for (const id of asList(QUESTS[qid].reward)) {
      if (id && ITEMS[id] && !w.items.includes(id)) w.items.push(id);
    }
    addRapport(QUESTS[qid].giver, 2);
    // 一件事跑完，经手过的人也记你一份好：牵头人 +2，经手人各 +1
    const seen = new Set([QUESTS[qid].giver]);
    for (const s of QUESTS[qid].steps || []) {
      if (s.npc && !seen.has(s.npc)) { seen.add(s.npc); addRapport(s.npc, 1); }
    }
    if (!w.notes.includes(qid)) w.notes.push(qid);
    checkAchievements(w);
    return { note: NOTES[qid], rapport: QUESTS[qid].giver, flags, group: QUESTS[qid].group || null };
  }

  /** 到达某地：reach 类目标推进；返回被推进的委托（含道具结算） */
  function onReach(loc) {
    const w = ensure();
    if (!w || !LOCS[loc]) return [];
    w.loc = loc;
    if (!w.visited.includes(loc)) w.visited.push(loc);
    const hit = [];
    for (const qid in w.quests) {
      const q = w.quests[qid];
      if (q.done) continue;
      const step = QUESTS[qid].steps[q.stage];
      if (step && step.type === 'reach' && step.at === loc) {
        const r = settleStep(qid);
        if (r) hit.push(r);
      }
    }
    checkAchievements(w);
    return hit;
  }

  /** 看一看：返回文案 + 推进 observe 类目标 + 顺手发现的小东西 */
  function onObserve(loc, wid) {
    const w = ensure();
    const L = LOCS[loc] || {};
    const text = (L.look && (L.look[wid] || L.look.default)) || '';
    const hit = [];
    for (const qid in w.quests) {
      const q = w.quests[qid];
      if (q.done) continue;
      const step = QUESTS[qid].steps[q.stage];
      if (step && step.type === 'observe' && step.at === loc) {
        const r = settleStep(qid);
        if (r) hit.push(r);
      }
    }
    let egg = null;
    if (L.egg && ITEMS[L.egg] && !w.items.includes(L.egg)) {
      w.items.push(L.egg);
      egg = L.egg;
    }
    w.observed[loc + ':' + wid] = true;
    checkAchievements(w);
    return { text, hit, egg, seen: true };
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

  /* --------------------------- 留念物 --------------------------- */

  /** 熟到底了、而且还没给过 → 返回这段专属对话 */
  function keepsakeFor(npcId) {
    const w = ensure();
    const K = KEEPSAKES[npcId];
    if (!w || !K) return null;
    if (w.keepsakes.includes(npcId)) return null;
    if ((w.rapport[npcId] || 0) < RAPPORT_MAX) return null;
    return { npc: npcId, item: K.item, lines: K.lines };
  }

  function takeKeepsake(npcId) {
    const w = ensure();
    const K = KEEPSAKES[npcId];
    if (!w || !K || w.keepsakes.includes(npcId)) return null;
    w.keepsakes.push(npcId);
    if (!w.items.includes(K.item)) w.items.push(K.item);
    checkAchievements(w);
    return { item: K.item, def: ITEMS[K.item] };
  }

  /**
   * 主线分岔用得到的 flag 取样。
   * 节点的 next 是函数，静态查不出它会通向哪儿；于是按「委托真能写出
   * 哪些取值」造一份样本，让分支图与校验器都能把每条 next 走一遍。
   */
  function flagSamples() {
    const dom = {};
    for (const qid in QUESTS) {
      const f = QUESTS[qid].setFlags;
      if (!f) continue;
      for (const k in f) (dom[k] || (dom[k] = [])).push(f[k]);
    }
    let out = [{}];
    for (const k in dom) {
      const vals = [...new Set(dom[k])];
      const next = [];
      for (const base of out) for (const v of vals) next.push(Object.assign({}, base, { [k]: v }));
      out = next;
      if (out.length > 4096) { out = out.slice(0, 4096); break; }
    }
    return out;
  }

  /* ------------------------- 主线分路的 flag ------------------------- */

  /**
   * 世界推导出来的 flags：每条做完的委托都会写下自己的几笔。
   * 引擎在每个节点渲染前把它并进 state.flags，
   * 主线于是能读到「这个月你把时间花在了谁身上」。
   */
  function derivedFlags() {
    const w = ensure();
    if (!w) return {};
    const out = {};
    for (const qid in w.quests) {
      if (!w.quests[qid].done) continue;
      const f = QUESTS[qid].setFlags;
      if (f) for (const k in f) out[k] = f[k];
    }
    for (const k in (w.flags || {})) out[k] = w.flags[k];
    return out;
  }

  /* --------------------------- 口袋的面板数据 --------------------------- */

  /** 手记 → 口袋面板的追加页 */
  function notebookExtras() {
    const w = ensure();
    if (!w || !w.notes.length) return [];
    return w.notes.map((qid) => NOTES[qid]).filter(Boolean);
  }

  /** 口袋分栏：任务道具 / 校园小物 / 留念物 */
  function pocketSections() {
    const w = ensure();
    if (!w) return [];
    const mk = (kind) => w.items
      .filter((id) => (ITEMS[id] || {}).kind === kind)
      .map((id) => Object.assign({ id }, ITEMS[id]));
    const quest = mk('quest');
    const egg = mk('egg');
    const keepsake = mk('keepsake');
    return [
      { key: 'quest', title: '手上的事', sub: '别人交给你、还要交出去的东西', items: quest },
      { key: 'keepsake', title: '留念', sub: '熟到不能再熟以后，他/她给你的', items: keepsake },
      { key: 'egg', title: '角落里的小东西', sub: '在校园里顺手捡的，没什么用', items: egg },
    ].filter((s) => s.items.length);
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
    LOCS, LOC_ROADS, WINDOWS, GATE_TO_WINDOW, NPCS,
    ITEMS, GROUPS, QUESTS, QUEST_LINES, NOTES, KEEPSAKES,
    GAME_ACHIEVEMENTS, RAPPORT_MAX, HELP_FULL, NOTE_FULL,
    freshWorld, ensure, windowOf, npcAt, npcsHere, npcAgain, npcHasBusiness,
    questState, questsOfferable, readyQuestsFor, stepQuestsFor, questReadyToTurnIn,
    abandonedQuests, currentStep, stepLines, reqMet, groupTaken,
    onTalk, accept, advance, complete, onReach, onObserve, unlockWindow,
    settleStep, derivedFlags, flagSamples, takeKeepsake, keepsakeFor,
    itemDef, ownedItems, hasItem, itemsOfKind, deliveredCount,
    notebookExtras, pocketSections, track, checkAchievements, addRapport, chatCapped,
  };
})(window);
