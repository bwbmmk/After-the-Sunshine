/* 晴天以后 · 留一盏灯。五章校园群像；与 v2 的剧本、存档分别存放。 */
(function(global){
'use strict';
const SP=global.SP;
const CHAPTERS=[
 {id:'c1',name:'第一章 · 九月',sub:'还有一把椅子',scene:'dorm',time:'afternoon',weather:'fair'},
 {id:'c2',name:'第二章 · 十月',sub:'借条的背面',scene:'library',time:'afternoon',weather:'clear'},
 {id:'c3',name:'第三章 · 十一月',sub:'不在镜头里',scene:'dorm',time:'night',weather:'rain'},
 {id:'c4',name:'第四章 · 十二月',sub:'别急着按发送',scene:'classroom',time:'dusk',weather:'snow'},
 {id:'c5',name:'第五章 · 一月',sub:'最后一排',scene:'lecture',time:'night',weather:'clear'}
];
const NODES={}; let context={},chapterIndex=0;
const names={n:'旁白',me:'我',man:'小满',yan:'阿言',cheng:'程野',mom:'妈妈',aunt:'陈姨',teacher:'周老师'};
const SPEAKERS=['man','yan','cheng','mom','aunt','teacher'];

/* ── 文本分段：对白 / 旁白 / 心声 ───────────────────────────────────
 * 这三样在排版上本来就是三种东西，所以数据里也分开写：
 *   D('…')        人物说出口的话
 *   S('man','…')  旁白中间嵌进来的别人说的话
 *   N('…')        旁白
 *   I('…')        我没说出口的
 *
 * node.text 仍是拼平后的整段字符串 —— 故事记录、导出、结局卡、旧存档
 * 都在读它，所以一个字节都不能变；node.seg 才是渲染要用的分段。
 * 两者由 beat() 同步生成，永远不会各说各话。
 * ------------------------------------------------------------------ */
const D=(s)=>({k:'d',s});
const S=(who,s)=>({k:'d',w:who,s});
const N=(s)=>({k:'n',s});
const I=(s)=>({k:'i',s});
/** 没写分段的老式纯文本：按中文引号自动切出「人话」和「旁白」 */
function bare(t,who){
  const src=String(t==null?'':t);
  const loose=who==='n'?'n':(who==='me'?'i':'d');
  const out=[];let buf='',depth=0;
  const flush=(k)=>{if(buf){out.push({k,s:buf});buf='';}};
  for(const ch of src){
    if(ch==='\u201c'||ch==='\u300c'){ if(depth===0) flush(loose); depth++; buf+=ch; continue; }
    if(ch==='\u201d'||ch==='\u300d'){ buf+=ch; depth=Math.max(0,depth-1); if(depth===0){out.push({k:'d',s:buf});buf='';} continue; }
    buf+=ch;
  }
  flush(loose);
  return out.length?out:[{k:'n',s:''}];
}

function toSegs(t,who){
  const own=SPEAKERS.indexOf(who)>=0?names[who]:'';
  if(Array.isArray(t)) {
    return t.map((x)=>{
      const k=['d','n','i'].indexOf(x&&x.k)>=0?x.k:(who==='n'?'n':'d');
      const w=(x&&x.w)?(names[x.w]||x.w):(k==='d'&&own?own:undefined);
      return {k,w,s:String(x&&x.s!=null?x.s:'')};
    }).filter((x)=>x.s!=='');
  }
  return bare(t,who).map((x)=>({k:x.k,w:x.k==='d'&&own?own:undefined,s:x.s}));
}
const flatOf=(segs)=>segs.map((x)=>x.s).join('');

function chapter(i){chapterIndex=i;context={chapter:CHAPTERS[i].name,scene:CHAPTERS[i].scene,place:'',time:CHAPTERS[i].time,weather:CHAPTERS[i].weather,mood:i===2?'melancholy':'warm'};}
function at(scene,place,time='afternoon',weather='fair'){Object.assign(context,{scene,place,time,weather});}
function beat(id,who,text,next,extra={}){
  const isFn=typeof text==='function';
  const seg=isFn?(f)=>toSegs(text(f),who):toSegs(text,who);
  const plain=isFn?(f)=>flatOf(seg(f)):flatOf(seg);
  NODES[id]={...context,speaker:names[who]||who,text:plain,seg,...(SPEAKERS.indexOf(who)>=0?{person:who}:{}),next,_chapter:chapterIndex,...extra};
}
function choice(label,to,set={},hint=''){return{label,to,set,hint};}
function ask(id,text,choices){beat(id,'me',text,undefined,{choices});}

/** 渲染层取分段：seg 里是数组就直接用，是函数就求值，都没有就从纯文本兜底切 */
function segmentsOf(node,flags){
  if(!node) return [];
  const t=typeof node.seg==='function'?node.seg(flags||{}):node.seg;
  if(Array.isArray(t)&&t.length) return t;
  const who=node.speaker==='旁白'?'n':(node.speaker==='我'?'me':'x');
  return bare(node.text||'',who);
}

chapter(0);at('campus','东门 · 15:42');
beat('arrival','n','我的行李箱少了一只轮子。准确地说，它还在，只是决定横着走。录取通知书上的校门比眼前高一些，也没有这条修路用的蓝色围挡。','gate');
beat('gate','n','报到袋里有钥匙、校园地图和一张午餐券。券上印着“当日有效”。手机显示十五点四十二分，我把它翻过来，背面是空的。','first_voice',{memory:'meal'});
beat('first_voice','man','“箱子要抬一下。别硬拽，我刚才就是这么把自己的提手拽掉的。”来人左肩挂着相机，右手提着一只只剩布带的包。','gate_laugh',{expr:'smile'});
beat('gate_laugh','me','“你也是新生？”我问。她点头：“小满，新闻系。刚给一个家长指错路，希望她不会回来找我。”','room0');
at('dorm','四号楼 · 417寝室');
beat('room0','n','寝室有四张床。靠门那张铺好了蓝色床单，桌上却只有一个电饭盒和一袋螺丝。一个男生蹲在地上，把摇晃的椅子翻过来。','room1');
beat('room1','cheng','“程野。机械的。”他用螺丝刀指了指空床，“上铺床板响，晚上别以为楼要塌。椅子还能修，先别坐。”','room2',{expr:'calm'});
beat('room2','n','我问他为什么带螺丝刀。他说拆快递方便。我们把箱子抬上柜子，坏轮子转了一圈，发出很像掌声的声音。','room3');
beat('room3','cheng','“另外两个人明天到。今晚班群有个线上会，八点。”他说完继续拧螺丝，又补了一句，“不是我组织的，我只负责转发。”','corridor');
at('avenue','寝室楼下 · 傍晚','dusk');
beat('corridor','n','小满在楼下等一辆借来的手推车还回去。她说迎新晚会征集一分钟校园短片，已经拍到宿舍热水器烧开的声音，还缺“有人把杯子拿走”。','invitation');
beat('invitation','man','“没有演员也行，手可以出镜。你来吗？”她举起手机给我看时间，“二十分钟。天黑以后这个窗户就不好看了。”','first_pick',{expr:'think'});
ask('first_pick','八点的班会还没开始，但我要先回寝室接网络。小满已经按住推车，不再催我。',[
 choice('先拍。我回去后补问班会里漏掉的事。','help_shot',{first:'film'},'晚上的空档交给一件还不熟悉的事。'),
 choice('今晚先回寝室，把联系方式留给她。','help_room',{first:'room'},'让邀请留到一个能好好答应的时候。')
]);
beat('help_shot','n','热水器跳闸三次。第四次终于烧开，小满却发现镜头里有清洁阿姨的手。她追过去说明用途，对方笑着说：“拍杯子吧，我不想上网。”','help_shot2');
beat('help_shot2','man','“那我们重来。”她说得很快，收相机却有些慢。窗户已经暗了。我们最后拍了一只空杯子，配上先前录到的水声。','first_merge',{expr:'calm'});
at('dorm','417寝室 · 夜','night');
beat('help_room','n','我回到寝室时，程野的电脑正停在网络认证页面。他把插线板推过来。班会真正开始前，我们花了二十分钟试出一个能连上的接口。','help_room2');
beat('help_room2','cheng','“还行，认识大学的第一课是认识网线。”他把接口编号写在便签上。小满随后发来一张空杯子的照片：“拍完了。下次给你留一个有水的。”','first_merge',{expr:'smile'});
beat('first_merge','n',f=>f.first==='film'?'我回寝室时班会刚结束。程野把截图发给我，一共七张。“明天领书，最重要的在第四张。”他没有问我去了哪里。':'我把小满的照片存进手机。那只杯子旁边有一小块窗外的晚霞，像还没有关掉的屏幕。','lights0');
beat('lights0','n','十一点半，走廊依然有人搬行李。程野定好六点的闹钟。他说食堂临时招开学帮工，先做两天，等课表出来再看。','lights1');
beat('lights1','cheng','“我睡了。你要用灯就留着，灯别往床上照就行。”他把书盖在眼睛上。台灯的光刚好落在我空白的笔记本上。','lights_pick');
ask('lights_pick','我想写点什么，却又不想让第一晚就变成一次含糊的迁就。',[
 choice('问清他几点睡，也说说自己的作息。','lights_talk',{agreement:1},'把还没发生的摩擦先摆出来一点。'),
 choice('今晚去走廊写，等另外两个人到齐再定。','lights_wait',{agreement:0},'暂时腾出安静，但把商量留给所有人。')
]);
beat('lights_talk','cheng','“其实灯没事，我怕外放视频。”他说。我也说自己睡浅。我们约好有不舒服就直说，谁先困谁提醒，暂时试一周。','morning0',{expr:'calm'});
beat('lights_wait','n','走廊有一张折叠桌，桌脚底下垫着宣传单。我只写了四行，蚊子倒是来了好几只。回去时台灯还亮着，程野已经睡熟。','morning0');
at('canteen','第二食堂 · 06:38','morning');
beat('morning0','n','第二天我被铝盆碰撞的声音叫醒——其实那是程野手机的闹钟。到食堂时，他站在窗口里面，袖口卷了两圈。','breakfast0');
beat('breakfast0','cheng','“那张昨天的券别拿出来了。右边窗口粥免费，鸡蛋两块。”他把一个裂壳的鸡蛋放到我盘里，“这个不算品相好的，也两块。”','breakfast1',{expr:'smile'});
beat('breakfast1','n','我差点说“你辛苦了”，最后问的是他几点下班。他说八点，刚好赶上课。隔着窗口，我们暂时不知道还能聊什么。','breakfast2');
beat('breakfast2','aunt','“新来的同学，别站着等粥凉。找个座吧。”陈姨把凳子拖出来，用抹布擦了两遍。靠窗还剩一张空椅子。','c1end',{expr:'smile'});
beat('c1end','n','我把过期的餐券夹进笔记本。背面写上：窗边第三张桌子不晃。那天的课表还没记住，这件事先记住了。','c2open');

chapter(1);at('club','社团招新 · 十月','afternoon');
beat('c2open','n','国庆回来，我已经会绕开下雨积水的台阶。小满的迎新短片没入选，倒是那只空杯子被同学拿去当头像。她说这也算一种发行。','poster');
beat('poster','man','“学校十二月有个学生作品展。八分钟以内，有字幕就行。咱们拍一部稍微长一点的？”她把招募表推过来，“这次有三百块材料补贴，要报销。”','poster2',{expr:'think'});
beat('poster2','me','“咱们”是她、我，以及还不知道自己被算进去的程野。我能写旁白，程野说他只能周日来，小满负责摄影和剪辑。名字倒是迟迟定不下来。','name0');
at('cafe','咖啡馆 · 拼桌');
beat('name0','cheng','“你先别写《青春与梦想》。”程野用吸管戳开杯盖，“至少等我吃完。”小满在纸上划掉两行，假装不是被他说中的。','name1',{expr:'smile'});
beat('name1','n','我们翻了一晚手机。漂亮的湖、漂亮的楼、漂亮的社团合影。等服务员来收杯子，桌下的延长线才被灯照出来，像这晚唯一没摆好姿势的东西。','scope');
ask('scope','小满问：“到底拍什么？”我看着那根线，想到早晨的窗口和深夜还亮着的洗衣房。',[
 choice('跟着一盏灯拍：它亮起时，学校在做什么。','scope_place',{focus:'place'},'空间做线索，人物未必需要交代自己。'),
 choice('跟着一天的班次拍：问问人为什么还在这里。','scope_people',{focus:'people'},'需要更多对话，也需要更多时间让人反悔。')
]);
beat('scope_place','man','“那谁来当主角？”她问。我说可以暂时没有。小满有点不甘心，又把空杯子的照片调出来：“好，试一次。”','loan0',{expr:'think'});
beat('scope_people','cheng','“问别人之前，先别替人回答。”程野说完笑了一下，“不是针对你们。我也经常不知道自己为什么在某个地方。”','loan0',{expr:'calm'});
at('library','图书馆 · 器材借用处');
beat('loan0','n','社团的录音笔要到图书馆借。柜台后的阿言比我们高一届，正在给一根转接线贴编号。胶带绕得很仔细。','loan1');
beat('loan1','yan','“我去年把一根这样的线弄丢了。八十九。”他指向借用单，“这回签字前先数清楚。别看它只有手指长。”','loan2',{expr:'calm'});
beat('loan2','n','借条写着周日十七点归还，逾期会影响下个人。阿言说下一位要录毕业作品。我在背面写下他的电话，免得出了事只会给群里发问号。','loan3',{memory:'loan'});
beat('loan3','yan','“三百块补贴不一定先到。买东西留发票，最好也记一下谁垫的钱。”他说着递来电池，“这对我个人还挺重要的。”','budget');
ask('budget','第一次预算就超了：防风罩、车费、打印，再算上可能需要的转接头。小满说她可以先垫，我知道她上周才买过镜头。',[
 choice('先只用借来的设备，把范围缩到步行能到的地方。','budget_small',{budget:'small'},'少一点保险，也少一点暂时说不清的欠款。'),
 choice('把垫付人和上限写下来，设备先准备齐。','budget_full',{budget:'shared'},'会多一道核对，也能少为器材碰运气。')
]);
beat('budget_small','n','防风罩被换成一块干净的绒布。镜头清单缩到食堂、图书馆和宿舍楼。小满把湖边那行划掉时，停了几秒。','class0');
beat('budget_full','n','账目表比片名先定下来。小满付了防风罩的钱，我付了电池钱。程野问：“也记工时吗？”我们还没回答，他说先记也行。','class0',{memory:'budget'});
at('classroom','公共课教室 · 周五','day','overcast');
beat('class0','teacher','“小组作业选一个身边的问题，十分钟汇报。不要把网上的结论换几个名词就交上来。”周老师翻过一页讲义，留出下课前五分钟让我们自由组队。','class1');
beat('class1','n','我本来想把短片也当作业。老师问我：“影片是给谁看的，课堂分析又在回答什么？”我答到一半卡住了。两件事同样费时间，并不说明能交同一份。','class2');
beat('class2','n','同组同学把任务表传来，周日下午约排练。那也是程野唯一空着、器材又能借到的下午。谁也拿不出第二个周日。','time_pick');
ask('time_pick','我看着两个群聊。发哪一句话，都意味着要有人改计划。',[
 choice('把我那段汇报先录好，拜托同组先排。','time_film',{time:'film'},'拍摄照常，课堂上必须补回缺席的部分。'),
 choice('先参加排练，请小满把拍摄缩成一小时。','time_class',{time:'class'},'不失约，但有些原定镜头可能拍不到。')
]);
beat('time_film','n','同组同学答应了，却特别提醒我周一不能再缺。她帮我顺了一遍材料，把三处没有来源的数字圈了出来。欠下的是一件具体的事。','shoot0');
beat('time_class','man','“一小时连等人都不够。”小满发来一句，又撤回了。“那就只录关窗吧。剩下的下次。”我盯着“下次”看了一会儿。','shoot0',{expr:'worry'});
at('canteen','第二食堂 · 周日下午','dusk','overcast');
beat('shoot0','n','陈姨同意拍收档，条件是不给没答应的同事正脸。我们把相机朝向一排已经倒扣的碗，重新检查反光里有没有人。','shoot1');
beat('shoot1','aunt','“别配那种哭唧唧的音乐，我每天就这么收，收完还得去跳舞。”她系紧围裙，想了想，“字幕别把我名字写错，耳东陈。”','shoot2',{expr:'smile'});
beat('shoot2','n',f=>f.focus==='people'?'小满问陈姨最难忘的一天。她想了半天，说上周煤气检修，所有人改吃面。这个答案不像我们预想中的采访，她说的时候却很认真。':'镜头对着灯的开关，陈姨的手几次伸进去，又因为同事喊她而缩回来。我们第一次发现，“等一个动作”也会占用别人的时间。','shoot3');
beat('shoot3','cheng','“别急，她还没下班。”程野把相机旁的包挪开，好让推车经过。他今天没排班，路过窗口时却还是顺手接住了一摞盘子。','shoot4',{expr:'calm'});
beat('shoot4','n','收档以后，我们在台阶上吃放凉的包子。录音笔还开着。程野说家里总以为自己参加了很多社团，我说我家也这么想。我们笑了一阵。','record_notice');
beat('record_notice','man','小满拿起录音笔：“刚才还在录。先留着？不放进片子，回去听听有没有用的环境声。”她把屏幕转给我们看，红点一闪一闪。','record_pick',{expr:'think'});
ask('record_pick','录音里既有风声，也有那段没有打算给镜头听的闲聊。程野咬着包子，没有马上接话。',[
 choice('现在停掉，另录一段干净的环境声。','record_clean',{record:'clean'},'把闲聊留在台阶上，归还器材会更赶。'),
 choice('先标成私人素材，回去一起挑要删掉的部分。','record_review',{record:'review'},'保留声音，也多了一次必须认真兑现的复核。')
]);
beat('record_clean','n','程野点了头。我按下停止，把刚才一段移进待删除文件夹。重新录风的时候，我们三个人站得很远，像不认识。小满冲我做了个“还有两分钟”的口型。','return0');
beat('record_review','cheng','“行，记得给我听。我讲话挺难听的。”他笑着说。小满给文件名加上“待确认”，我拍下屏幕，免得这个词只靠记忆。','return0',{expr:'calm'});
at('library','图书馆 · 16:57','dusk');
beat('return0','n','归还时，阿言把转接线摊到掌心，逐件点齐。我喘得说不出话，小满还在看素材。程野去自动售货机买了三瓶水，把付款截图发进了群。','c2end');
beat('c2end','n','晚上，我们把项目暂时叫作《闭馆前十分钟》。不是因为图书馆十分钟后真的会关，而是我们总在快到时间的时候，才想起还有一句话没说。','c3open');

chapter(2);at('dorm','417寝室 · 十一月','night','rain');
beat('c3open','n','小满发来粗剪时，我正在补周一的汇报。耳机里先是一声关灯，再是风。进度条走到一半，我忽然听见自己的笑声。','rough0');
beat('rough0','n',f=>f.record==='review'?'台阶上的聊天被放进临时音轨，还贴着“待确认”的字样。小满把音乐压得很轻，程野那句关于家里的话却因此更清楚了。':'台阶上的录音已经删掉。画面里，程野低头接过陈姨的盘子。小满在这一刻放慢了速度，加了一段很柔软的音乐。','rough1');
beat('rough1','n','我把电脑转向程野。他看完，没有说不好，只问了一句：“为什么我看上去这么可怜？”房间里还响着那段音乐。','rough2');
beat('rough2','cheng','“我也会在上班的时候摸鱼，昨天还打游戏打到两点。这个人怎么就剩下忙和累了？”他把耳机还给我，去阳台收衣服。','rough3',{expr:'worry'});
beat('rough3','man','“这是粗剪，我没想替谁卖惨。”小满在视频通话里说。她那边的台灯照得很白。“但没有一点起伏，它就只是几个镜头。”','review_pick',{expr:'worry'});
ask('review_pick','提交预审还剩两天。程野明晚有班，小满说今晚可以继续改。现在说“再商量一下”，可能只是把责任推到更晚。',[
 choice('先撤掉有争议的段落，宁可这版空一点。','review_cut',{review:'cut'},'把修改权收回来，也承担片子变短的结果。'),
 choice('今晚不提交，约一个所有人能一起看的时间。','review_table',{review:'table'},'把决定摊开，预审的位置未必还留着。')
]);
beat('review_cut','me','我说先删。小满问：“你确定？”我点头，才发现通话里她看不见。我补了一声确定，又问有没有别的镜头能补空。','review_cut2');
beat('review_cut2','n','小满把那一段拖出时间线。六分四十秒变成四分二十秒。程野回房间看见空出来的轨道，说可以拍他打游戏。我们都没接住这个玩笑。','rain0');
beat('review_table','n','我在群里发了三个时间，最后约在后天午饭后。小满说那就错过预审，我说我去解释。发送以后才发现，自己也害怕解释没有用。','review_table2');
beat('review_table2','cheng','“可以。我听完就走，不陪你们熬夜。”他把一件还湿的卫衣重新挂出去，“真不是不想帮忙。”','rain0',{expr:'calm'});
at('avenue','图书馆外 · 雨','night','rain');
beat('rain0','n','下楼还伞时，小满站在门口等雨小一点。我们已经一整天只在群里发文件名。她把相机藏在外套里，腾出一只手接我的伞。','rain1');
beat('rain1','man','“我以前投作品，经常连一句为什么没选上都收不到。”她说，“这次我想做得像样一点。一看到空轨道，我就觉得又要白忙。”','rain2',{expr:'sad'});
beat('rain2','me','我差点说不会白忙。可我自己也怕。最后我说：“有一段字幕是我写的。你不用把所有问题都揽过去。”她看了我一眼。','rain3');
beat('rain3','man','“那下次别等别人不高兴了才告诉我，你也觉得不对。”雨打在伞上，我们要靠得很近才能听清。','rain4',{expr:'calm'});
beat('rain4','n','我说好。没有一个恰到好处的拥抱，也没有忽然放晴。我们走到食堂，伞沿滴了一地水，陈姨喊我们别在门口滑倒。','meal0');
at('canteen','第二食堂 · 20:10','night','drizzle');
beat('meal0','aunt','“还拍不拍？今天你们要拍的话，地刚拖好。”陈姨把两份剩下的米饭装进碗。我说先吃饭，不拍。她说：“早该这样。”','meal1',{expr:'smile'});
beat('meal1','n','程野端着餐盘出来，看见我们，坐到旁边。他把辣椒挑到一边，又拿一张纸把桌边的水擦掉。这一顿谁也没有按下录制。','cost0');
beat('cost0','cheng','“水钱不用转了，六块。”我想起还没有确认他的截图。他又说，“但下次拍摄时间早点定。我换一次班，不只我一个人要改。”','cost_pick',{expr:'calm'});
ask('cost_pick','六块钱很少，换班却不好计价。如果我只说谢谢，他可能还要继续做那个最好说话的人。',[
 choice('把钱结清，下一次先问他的排班再约。','cost_schedule',{care:'schedule'},'尽量不让感谢代替安排。'),
 choice('请他只承担确定有空的一段，剩下我来。','cost_limit',{care:'limit'},'分工变小，空出来的工作会落到自己身上。')
]);
beat('cost_schedule','n','我把六块钱转过去，请他在日历里标上不能来的日子。他标得比我想象中多。小满拿过日历，把拍摄改到周四早上。','feedback0');
beat('cost_limit','cheng','“那我就只负责收档那一段。”程野说，“说好了，不要到时候又喊我救场。”我答应得有点快，回寝室才重新算自己的时间。','feedback0',{expr:'think'});
at('classroom','空教室 · 午后','day','overcast');
beat('feedback0','n',f=>f.review==='table'?'复核那天，我们围着一台电脑。预审确实没赶上，报名老师允许交终稿，但不会提前帮我们看技术问题。':'我们带着删短的版本去找程野。预审回复只有四个字：“主题不明。”小满把它念了两遍，第二遍带了点笑。','feedback1');
beat('feedback1','cheng','“这里不用慢放，我就是发现鞋带开了。”他说。小满把速度调回去，我们第一次看到镜头边缘有人在喊他吃饭。','feedback2',{expr:'calm'});
beat('feedback2','man','“原来声音能接上。”她放下鼠标，问，“那这段，正常速度，没有旁白，可以吗？”程野看了一遍，点了头。她把确认写到文件旁边。','feedback3',{expr:'think',memory:'review'});
beat('feedback3','n','陈姨只看了自己出现的部分。她要求把“日复一日的坚守”删掉，换成名字和工作时间。“我明年想调早班，这句话写得像我跑不了。”','home0');
at('dorm','417寝室 · 周日','night','overcast');
beat('home0','n','周日妈妈打来电话，问生活费够不够。我看着桌上的报销袋。钱不算多，但我买过两次不合用的电池，也点过好几顿赶工的外卖。','home_pick');
ask('home_pick','我不想让她把拍片理解成耽误学习，也不想每次打电话都先整理一个体面的版本。',[
 choice('把这阵子的花费和没做好的事一起讲。','home_open',{open:1},'可能要听一些担心，也可能不用再独自圆场。'),
 choice('先聊最近吃什么，等账目理清再谈项目。','home_later',{private:1},'保留自己的整理时间，也要记得回来接上这句话。')
]);
beat('home_open','mom','“这也不全是拍片的钱吧。你是不是又不吃早饭？”她没有先问得了什么奖。我承认了外卖那部分，她开始讲怎么用电饭盒热剩饭。','home_end',{expr:'think'});
beat('home_later','mom','“那下次给我看看你拍的食堂。我想知道你平时在哪儿吃。”我答应了。挂电话以后，我把报销袋打开，没有再塞回抽屉。','home_end',{expr:'smile'});
beat('home_end','n','程野从床上探头，问我妈说的蒸蛋要放多少水。我俩照着做，第一次蒸成了蜂窝。小满在群里问进度，我发去一张蛋的照片。','c3end');
beat('c3end','man','“这个可以拍吗？”她回。我说可以，但不许配悲伤音乐。隔了一会儿，她发来三个笑脸。','c4open',{expr:'laugh',voice:true});

chapter(3);at('classroom','展映说明会 · 十二月','dusk','snow');
beat('c4open','n','第一场雪下得很小，落在窗台上就没了。作品展的老师把节目表投出来，我们的片子排在一支舞蹈后面，总共只有四分钟。','slot0');
beat('slot0','teacher','“今年场地要提前交给考试。不是只压你们这一组。可以交精简版，也可以选择只参加后面的作品交流。”老师看了一眼钟，“今晚给答复。”','slot1');
beat('slot1','n','小满低声说我们现在六分十二秒。程野发来消息问那天几点结束，他可以换班来。阿言提醒我，交流场没有补贴，但时间宽一些。','slot_pick');
ask('slot_pick','四分钟能保住第一次正式放映，也会挤掉一些终于谈妥的停顿。撤出来不会让片子消失，只是可能少很多人看见。',[
 choice('做四分钟版，明确它是另外一个版本。','slot_official',{venue:'official'},'多一次剪辑和复核，保住那个舞台。'),
 choice('退出晚会时段，自己安排完整的小放映。','slot_room',{venue:'room'},'观众要自己请，场地也得重新找。')
]);
beat('slot_official','man','“我不想把它剪成预告片。”小满说。我说我们可以只留一条线。她想了很久：“那另外两分钟别删源文件。”','credit0',{expr:'think'});
beat('slot_room','yan','“小教室应该能借，我去问。先别把日期发出去。”阿言把钥匙扣转了一圈，“去年我就发太早了，后来挨个道歉。”','credit0',{expr:'calm'});
at('library','图书馆 · 讨论桌','night','snow');
beat('credit0','n','我整理片尾名单时，发现自己被写成“文案支持”，程野是“现场协助”。我并没有拿到相机，却记得每个修改都在那个群里争论过。','credit1');
beat('credit1','man','“不是不算你们。我是照往年的格式写的。”小满把名单打开，“那怎么写？总不能每个人都是导演吧。”她问得有些累。','credit_pick',{expr:'worry'});
ask('credit_pick','署名像一件最后才发现不小的事。我既不想把友谊换算成头衔，也不想因为怕计较，就假装不在意。',[
 choice('列清每个人做的工作，姓名按共同商量的顺序。','credit_roles',{credit:'roles'},'把模糊的贡献说具体，也承认工作并不相同。'),
 choice('把主要创作署成我们三人，技术分工另列。','credit_shared',{credit:'shared'},'把共同决定放在前面，也要谈清谁承担成片责任。')
]);
beat('credit_roles','n','名单写了很长。排期、录音、字幕、沟通，都有了位置。程野说自己只调过一次音量，不能写“声音设计”。我们删掉它，又补上器材管理。','credit_end');
beat('credit_shared','cheng','“共同创作可以。下次出问题，别只让小满解释。”程野说。我答应负责展映时的介绍，小满负责技术，没到场的人也要先看最终版。','credit_end',{expr:'calm'});
beat('credit_end','n','最后那张名单没有完全对称，也没有谁特别吃亏。小满把字体缩小了一号——名单这么长，放映时得留够大家读完的时间。','snow0',{memory:'credits'});
at('lake','湖边 · 补拍','morning','snow');
beat('snow0','n',f=>f.focus==='place'?'我们来补一盏路灯熄灭的镜头。雪落在灯罩上，天已经亮了，开关却迟迟没有动静。':'我们来补食堂到寝室之间的一段路。程野不必出现，镜头只跟着我们自己的脚印。雪把每个人的步子都变得很慢。','snow1');
beat('snow1','n',f=>f.budget==='small'?'绒布挡住了一点风，也擦过收音孔。回听里有持续的沙沙声。少买一件设备没有成为灾难，只是现在要多录一次。':'买来的防风罩终于派上了用场。可电池在冷风里很快掉电，备用的那对在我的书包最底下。准备齐全，也没有让我们显得多从容。','snow2');
beat('snow2','man','“能不能只留脚步，不要旁白？”小满问。我们试了一次。雪落得没有什么声音，鞋底却很响。原来安静也不用填满。','snow3',{expr:'calm'});
beat('snow3','n','阿言送来转接头。他要赶去打印毕业申请，问我们能不能自己归还。我接过来，在借条背面又加了一行，笔尖冻得不太出墨。','deadline0');
at('dorm','417寝室 · 23:16','night','clear');
beat('deadline0','n','导出到百分之七十三时，软件报错了。剩余空间不足。小满在电话那头不说话，我挪了一遍文件，又发现明早还有小测。','deadline1');
beat('deadline1','cheng','“你们准备弄到几点？”程野拉开床帘。走廊有人在背书，声音一字一字传进来。寝室不是我们的工作室，只是我们一直用得很顺手。','deadline_pick',{expr:'worry'});
ask('deadline_pick','继续做大约要一个小时，也可能更久。今晚停下，需要有人明早早起，还要接受并不完美的版本。',[
 choice('今晚停在能播放的版本，明早分头核对。','deadline_stop',{rest:1,night:'stop'},'把休息也算进进度，带着没做完的地方睡。'),
 choice('带电脑去公共自习室，先问小满还能做多久。','deadline_move',{night:'move'},'把打扰移开，但不把熬夜变成默认的承诺。')
]);
beat('deadline_stop','man','“我怕明天还要改。”小满说。我说只查错别字和能不能播，不再换镜头。我们把这句话写进群公告，像给自己留一条封条。','morning_check',{expr:'worry'});
beat('deadline_move','n','小满说最多四十分钟。我背电脑下楼，发现自习室只剩一排灯。我们删了缓存，导出成功，最后十分钟没有用来加东西，而是一起看了一遍。','morning_check');
at('canteen','第二食堂 · 第二天','morning','clear');
beat('morning_check','n','早饭时，程野替我们发现了片尾一个错字。不是他的名字，是陈姨的“姨”。他用筷子敲敲屏幕：“你们昨天认真讨论半天的名单。”','morning_check2');
beat('morning_check2','n','我们把最终版给出现的人看，逐个确认放映范围。陈姨问有没有自己的正脸，我们停在那里给她看。她点头，又问晚上能带邻居来吗。','c4end');
beat('c4end','me','我说可以。然后把这两个字写进邀请信息里，删掉了原本那句“名额有限，先到先得”。其实，我们正愁没人来。','c5open');

chapter(4);at('lecture','放映前 · 一月','dusk','clear');
beat('c5open','n',f=>f.venue==='official'?'晚会的节目表上，我们的标题被挤得很小。台侧的工作人员问文件在哪儿，小满递出两个U盘，像终于交上两份试卷。':'阿言借到一间小教室，条件是九点半恢复桌椅。投影布落下来时卡了一下，程野搬来凳子，发现只是绳子绕错了。','setup0');
beat('setup0','n','我们把《闭馆前十分钟》写在门口。底下留了一行：放完以后，有话可以说，也可以直接走。小满说这不像宣传语，我说本来就不是。','setup1',{memory:'ticket'});
beat('setup1','yan','“别把最后一排收起来，陈姨说可能会迟到。”阿言放下借来的插排。他的打印袋里还露着半张毕业申请，照片没有贴正。','setup2',{expr:'smile'});
beat('setup2','n',f=>f.care==='schedule'?'程野按事先约好的时间到了。他把工作服折进包里，去调投影的焦点，没有人临时再让他跑一趟食堂。':'程野比开场晚了十分钟。他说过只能负责收档那一段，我没有问他为什么迟到。小满递给他一瓶水，已经拧松了盖子。','before_show');
beat('before_show','n','轮到我介绍时，准备好的稿子忽然很长。我看见有人在看手机，陈姨刚推门进来，邻居还在问这里是不是放电影。','intro_pick');
ask('intro_pick','第一句话会替大家安排一种观看的方式。我捏着稿子，不想再替画面里的人预告该感动什么。',[
 choice('先说明这是怎么一起拍出来的，也说删过哪些部分。','intro_process',{intro:'process'},'让观众知道片子之外还有协商和空白。'),
 choice('只介绍片名与时长，把解释留到放完以后。','intro_brief',{intro:'brief'},'让画面先开始，也接受有人会看出不同的东西。')
]);
beat('intro_process','me','我说这不是我们最开始想拍的那一部，片子里的人帮我们改过它。我没逐件讲争执，只指了指片尾：“名字会留得久一点，大家可以看完。”','show0');
beat('intro_brief','me','我说：“《闭馆前十分钟》，请大家看。”然后忘记补时长。小满在黑暗里轻轻碰了一下我的胳膊，没有替我圆场。影片开始了。','show0');
beat('show0','n','关灯的声音先响起来。倒扣的碗，临时停下的推车，一双鞋在门口重新系好鞋带。观众没有在我们预想的地方笑，却在另一个地方笑了。','show1');
beat('show1','n','陈姨看到“想调早班”那段，偏头跟邻居解释了一句。声音不小，后排也听见了。小满看着她笑，手从暂停键旁边挪开。','show2');
beat('show2','n','最后是一段路灯下的脚步声。我第一次没有想着下一句旁白该接什么。字幕慢慢走完，教室仍然暗了两秒。','after0');
beat('after0','n','掌声没有想象中响，倒也比想象中久。有个同学问影片能不能发到学院账号，她认识管理那个账号的人。我和小满都没有立刻回答。','after1');
beat('after1','cheng','“我觉得今天挺好。”程野说，“但要发到外面，再给我看看最终带的标题。有些标题比片子还会讲故事。”','after2',{expr:'smile'});
beat('after2','man','“我想发，也有点不想。”小满把U盘放在掌心，“以后别人说想看，发一个链接挺方便的。可我不想又变成一个人盯着播放量。”','future_pick',{expr:'think'});
ask('future_pick','这次没有倒计时催我们。公开会带来新的读者，也会失去对观看场合的了解；留在这里不是失败，但作品可能慢慢被忘记。',[
 choice('做适合公开的版本，重新确认标题和发布范围。','public0',{release:'public'},'多一次复核，允许作品离开我们的解释。'),
 choice('把今晚作为这部片子的完成，只留授权的线下放映。','local0',{release:'local'},'接受它只抵达一小群人。'),
 choice('先不急着发片，把这次的方法带给下一组。','next0',{release:'next'},'把没做好的地方变成可交接的经验。')
]);
at('cafe','第二天 · 咖啡馆','afternoon','fair');
beat('public0','n','我们在咖啡馆重新写发布说明，附上参与者认可的文字。程野删掉“坚持梦想”四个字，说自己今天的梦想顶多是睡个午觉。','public1');
beat('public1','n',f=>f.focus==='place'?'公开版从一盏灯开始，标题是《学校的侧门》。留言里有人认出了同一块翘起的地砖，说自己也在那里绊过一下。':'公开版把每个人认可的名字放到前面。陈姨给我发来截图，她的外甥在评论里叫了一声姨。她回了一个大拇指。','public2');
beat('public2','me','我把后台提醒关掉。小满说这周末不拍了，问要不要去吃新开的面。我看了看课表，先把那两小时留出来。','ending');
at('lecture','散场后 · 21:18','night','clear');
beat('local0','n','我们把投影关掉，按约定恢复桌椅。没有链接可以转发，陈姨便把门口那张手写海报拍下来，问能不能带走。','local1');
beat('local1','n',f=>f.venue==='official'?'晚会的工作人员来收设备，顺便问为什么片尾留那么久。我说因为每个名字都需要一点时间。他点点头，没再催。':'小教室里只剩我们几个人。程野把最后一排的椅子搬回原处，说其实今天这个位置看得挺好。阿言检查门窗，清单上终于全是勾。','local2');
beat('local2','man','“下次还借这个地方吗？”小满问。我说等真有下次再定。她笑了一下，把那根总是容易弄丢的转接线递给我。','ending',{expr:'smile'});
at('library','新学期前 · 借用处','morning','fair');
beat('next0','n','我们把借条、预算表和复核记录装进文件夹。第一页写着：拍摄结束，不等于可以替别人决定用途。第二页是那根转接线的照片和编号。','next1');
beat('next1','yan','“这比我去年留的那张纸有用。”阿言翻到最后，那里空着一页。他说开学后会有新人来，能不能把你们的联系方式放进去。','next2',{expr:'smile'});
beat('next2','n',f=>f.agreement?'我们写上联系方式，也写上各自能回复的时间。小满说新学期想学录音，程野说周日不保证有空。没有人把“不保证”划掉。':'我在空白处补上了第一晚没来得及商量的作息约定。程野看完，说这条应该放第一页。于是我们真的把它挪到了第一页。','ending');
NODES.ending={ending:true,p:100};

const ENDINGS={
 side_door:{title:'学校的侧门',tag:'公开 · 空间',body:'短片被放进学院的学生作品档案。它没有成为热门视频，却隔一阵就有人借着那盏灯认出自己的夜归路线。你和小满继续交换看到的小东西，暂时不急着把它们都变成作品。'},
 names:{title:'大家都在片尾',tag:'公开 · 人物',body:'片子公开后的一个周末，陈姨发来一张聚餐照片，说亲戚终于知道她平时在哪里上班。程野换了一个新头像，还是没有用你们拍的那张。你们替彼此保留了出现在故事里、也离开故事的余地。'},
 minute:{title:'空出来的一分钟',tag:'线下 · 正式展映',body:'四分钟版结束后，片尾留住了那一小会儿安静。完整版没有消失，后来在一个课程交流会上又放了一次。你仍会遗憾删掉的镜头，也开始知道一件作品可以有不止一次完成。'},
 back_row:{title:'最后一排',tag:'线下 · 小放映',body:'那晚来了十七个人，走时椅子还了十八把——有一把本来就在教室里。你把这个乌龙记进笔记本。没有庞大的观众证明这次相遇的价值，可你记得每一个在后排坐下的人。'},
 someday:{title:'有空再一起拍',tag:'继续 · 留出边界',body:'新学期的群聊安静了两周，然后有人发来一张新的排班表。你们没有承诺永远合作，只认真地约出了一个大家都方便的下午。这一次，邀请里有了可以拒绝的位置。'},
 receipt:{title:'借条上的名字',tag:'继续 · 留下经验',body:'阿言毕业前把钥匙交给新管理员。你们的文件夹还在柜台里，翻得最多的是借用清单和返工记录。你回去还电池时，看见有人在旁边添了新的提醒。那一页纸终于比你们走得远一点。'}
};
function resolveEnding(f){if(f.release==='public')return f.focus==='place'?'side_door':'names';if(f.release==='local')return f.venue==='official'?'minute':'back_row';return f.agreement?'someday':'receipt';}
const MEMORIES={
 meal:{title:'一张过期餐券',date:'九月 · 东门',body:'当日有效。\n背面：窗边第三张桌子不晃。\n\n纸边已经折白，后来也没有舍得扔。'},
 loan:{title:'借条背面',date:'十月 · 图书馆',body:'录音笔 × 1，电池 × 2，转接线 × 1。\n周日 17:00 前归还。\n\n阿言的电话写在角落。先数清楚，再签字。'},
 budget:{title:'还没报销的账单',date:'十月 · 咖啡馆',body:'防风罩：小满垫付。\n电池：我垫付。\n水：程野，6 元。\n\n最下面多了一行：换班需要提前三天。'},
 review:{title:'共同看过的版本',date:'十一月 · 空教室',body:'不慢放鞋带镜头。\n名字写正确。\n公开发布之前，再确认标题。\n\n这张清单里没有任何一句“你们看着办”。'},
 credits:{title:'片尾的草稿',date:'十二月 · 图书馆',body:'共同完成的事，也可以有不同分工。\n\n留足阅读时间。\n“姨”字检查两遍。'},
 ticket:{title:'手写的邀请',date:'一月 · 门口',body:'《闭馆前十分钟》\n\n放完以后，有话可以说，也可以直接走。\n\n最后一排给晚到的人留着。'}
};
const ACHIEVEMENTS=[{id:'begin',name:'搬进来了',desc:'开始这一学期',icon:'✦'},{id:'firstChoice',name:'回复一条邀请',desc:'做出第一个选择',icon:'✉'},{id:'backtrack',name:'再想一想',desc:'返回之前的一段',icon:'↶'},{id:'reader',name:'翻一翻',desc:'打开故事记录',icon:'☰'},{id:'listener',name:'听见校园',desc:'打开声音五分钟',icon:'♪'},{id:'rainyWalk',name:'明天再改',desc:'在截稿前选择休息',icon:'☾'},{id:'end3',name:'三种后来',desc:'读到三个结局',icon:'✧'},{id:'endAll',name:'灯还亮着',desc:'读到全部六个结局',icon:'☀'}];
const counts=CHAPTERS.map((_,i)=>Object.values(NODES).filter(n=>n._chapter===i).length);const cursor=[0,0,0,0,0];
for(const n of Object.values(NODES)){if(n.ending)continue;const i=n._chapter;n.p=Math.min(99,Math.round(i*20+(cursor[i]++/counts[i])*20));delete n._chapter;}
SP.story={NODES,CHAPTERS,ENDINGS,ACHIEVEMENTS,MEMORIES,resolveEnding,segments:segmentsOf,segment:{D,S,N,I},START:'arrival',fresh:()=>({id:'arrival',flags:{},bonds:{man:0,yan:0,family:0,self:0},history:[],log:[],memories:[],choices:0,startedAt:Date.now(),playedMs:0}),edges:n=>n?[...(n.next?[n.next]:[]),...(n.choices||[]).map(c=>c.to)]:[],allEdges:()=>Object.entries(NODES).flatMap(([id,n])=>[...(n.next?[[id,n.next]]:[]),...(n.choices||[]).map((c,i)=>[id,c.to,c.label,i])])};
})(window);

