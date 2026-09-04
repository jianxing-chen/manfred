/* 曼弗雷德：遗忘实验 —— 装置剧本与状态机
 * 交互动词只有一个：拒绝。两个“下跪”选项在交互上不可能完成——
 * 装置替你执行曼弗雷德的拒绝。终幕“忘却”按钮永远失败。
 */
(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const stage = new MANFRED_STAGE($("#stage"));
  const audio = window.MANFRED_AUDIO;
  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ============ 剧本 ============ */
  const SCENES = [
    {
      id: "prologue", visual: "overture", audio: "overture",
      title: "序幕", place: "伯尔尼高地",
      lamp: 1,
      beats: [
        { auto: 2400, lines: [{ cls: "narr", t: "高耸的阿尔卑斯山区。某一座城堡。" }, { cls: "narr", t: "午夜。" }] },
        { lines: [{ who: "曼弗雷德", t: "这盏孤零的油灯必须把油漆满，" }, { t: "但这样也不能伴我将长夜熬守。" }, { t: "即使能够入睡，我也不能安眠，" }, { t: "那不过是一种连绵思绪在伸延。" }] },
        { lines: [{ t: "忧郁原本是智慧的导师，" }, { t: "知识就是痛苦。" }, { cls: "narr", t: "知道得最多的人啊，必定最深地哀伤——" }, { cls: "big", t: "知识的树不是生命的树。" }] },
        { lines: [{ t: "哲学与科学，人世间的万般智慧，我全都探求过。" }, { t: "我的心中蕴藏着神奇的力量，强迫这一切东西全听命于它。" }, { t: "可是这对我毫无用处。" }] },
        { lines: [{ cls: "narr", t: "现在，该做正事了——" }, { cls: "big", t: "哦，神奇的力量啊！" }, { t: "你们，磅礴无际宇宙里的精灵啊！" }, { t: "我曾在黑暗与光明里把你们搜寻。" }, { cls: "big", t: "现形！听我的旨意！" }] }
      ]
    },
    {
      id: "corridor", visual: "corridor", audio: "corridor",
      title: "第一幕 · 召唤", place: "哥特长廊；午夜",
      lamp: .9,
      beats: [
        { lines: [{ who: "曼弗雷德", cls: "big", t: "现形！现形！" }, { t: "凭着那永恒者的号令——" }, { cls: "narr", t: "（一颗明星出现在长廊的昏暗角落里，响起了唱歌的声音。）" }] },
        { lines: [
          { who: "第一个精灵", cls: "spirit", t: "凡人啊！我听从你的号令，驾一缕星光从天降临。" },
          { who: "第二个精灵", cls: "spirit", t: "勃朗峰是群山的君王……说吧，你对我有何要求！" },
          { who: "第三个精灵", cls: "spirit", t: "面对着汪洋大海的精魂，快把你的心愿向我说明。" }
        ] },
        { lines: [
          { who: "第五个精灵", cls: "spirit", t: "吾乃长风之御者……御风飞驰向你来。" },
          { who: "第六个精灵", cls: "spirit", t: "我的寓所是茫茫暗夜里的阴影。" },
          { who: "第七个精灵", cls: "spirit", t: "主宰你命途的那个星座，地球形成前就听命于我。" },
          { who: "七个精灵", cls: "spirit", t: "大地海洋空气暗夜群山暴风和你的星辰，都来听候你的吩咐，泥尘之子呀！" }
        ] },
        { lines: [{ who: "精灵", cls: "spirit", t: "向我们索要臣民、王权以及统治尘世的权力吧，全部或者部分——" }, { cls: "spirit", t: "或是要一部管辖世间万物的符箓吧！所有这一切全都可以为你所有——" }], choices: [
          { label: "王国与统治", go: "r-kingdom" },
          { label: "长寿", go: "r-life" },
          { label: "都不要", go: "r-core", cls: "reject" }
        ] },
        { id: "r-kingdom", lines: [{ who: "曼弗雷德", t: "该诅咒的！" }] , goto: "r-core" },
        { id: "r-life", lines: [{ who: "曼弗雷德", t: "该诅咒的！我要那寿命干什么？它已经太长了——滚——滚开！" }], goto: "r-core" },
        { id: "r-core", lines: [{ who: "曼弗雷德", cls: "big", t: "——我要忘却，" }, { cls: "big", t: "忘却我自己！" }, { cls: "whisper", t: "从你们如此慷慨奉献的奥妙之域，竟然不能提供我所需要的东西吗？" }] },
        { lines: [{ who: "精灵", cls: "spirit", t: "忘却不是我们的本性，而且也不归我们支配。" }, { cls: "spirit", t: "不过——你可以去死。" }] },
        { lines: [{ who: "曼弗雷德", t: "死能够赐予我忘却吗？" }, { who: "精灵", cls: "spirit", t: "我们是永生而且不朽的，从来不会忘却。对于我们来说，过去如同未来，总在眼前。" }, { cls: "spirit", t: "你得到答复了吗？" }] },
        { lines: [{ who: "曼弗雷德", cls: "curse", t: "你们愚弄我——奴隶们！" }, { t: "我的躯体中蕴蓄着的心智和精神，" }, { cls: "narr", t: "燃烧的普罗米修斯的火花与光辉，跟你们的同样灿烂。" }, { t: "它们虽然禁锢在泥身里面，却绝不会向你们屈服！" }] },
        { lines: [{ who: "曼弗雷德", t: "在我们分手之前——以你们的原形，朝我走来吧！" }, { who: "精灵", cls: "spirit", t: "我们没有形貌……但是你可以任意选择一种形貌，我们必将现形。" }, { who: "曼弗雷德", t: "我无可选择。就让你们当中权力最大的那位，以他认为最合适的形貌过来吧！" }] },
        { lines: [{ who: "第七个精灵", cls: "spirit", t: "你看吧——" }] },
        { auto: 2600, fx: "her-face", lines: [{ cls: "astarte", t: "（一张美丽的面容，在黑暗中亮起）" }, { cls: "narr", t: "那是你在世上唯一爱过的容颜。" }] },
        { auto: 2200, lines: [{ who: "曼弗雷德", t: "哦，上帝啊！……我愿拥抱你，我又要——" }, { cls: "narr", t: "（美丽女子的形象消失。）" }, { cls: "big", t: "哦，我的心碎啦！" }], fx: "collapse" }
      ]
    },
    {
      id: "cliff", visual: "dawn", audio: "dawn", bell: "act",
      title: "第一幕 · 悬崖", place: "少女峰；清晨",
      lamp: .75,
      beats: [
        { lines: [{ cls: "narr", t: "清晨。曼弗雷德独自站立在悬崖之巅。" }, { who: "曼弗雷德", t: "我所唤起的精灵抛弃了我，我所钻研的魔法欺骗了我。" }, { t: "我再也不依赖超人的帮助。" }] },
        { lines: [{ cls: "big", t: "大地母亲啊！清爽的黎明啊！巍峨的群山啊！" }, { t: "你们为何竟如此美丽？" }, { cls: "big", t: "而我却无力爱你们。" }] },
        { lines: [{ t: "我感到了冲动，但是我没有跃下；" }, { t: "我感到了危险，但是我没有畏缩；" }, { t: "我感到了晕眩，但是我没有挪脚；" }, { cls: "narr", t: "我的身上有一种力量在抑制着我，它使得我的生命变成了我的灾难。" }], choices: [
          { label: "只此一跳", special: "jump" }
        ] },
        { id: "after-jump", lines: [{ cls: "narr", t: "（羚羊猎人从下面上来，一把拉住了他。）" }, { who: "羚羊猎人", t: "朋友，小心点！再往前走就是致命的一步啊！" }, { cls: "spirit", t: "为了那创造你的上帝的爱，请万万不可站在那边上！" }] },
        { lines: [{ who: "羚羊猎人", cls: "big", t: "不要跳，疯子！" }, { t: "即使你厌倦自己的生命，也不能用你罪恶的血玷污我们纯洁的山谷啊。" }, { t: "跟我走吧——我决不会撒手放开你的。" }] },
        { lines: [{ who: "曼弗雷德", t: "我心里痛苦得难以忍受——群山在我的周围旋转——你是谁？" }, { who: "羚羊猎人", t: "我马上就告诉你。跟我走吧——雾越来越浓了——把您的脚踩在这儿。" }] }
      ]
    },
    {
      id: "hut", visual: "hut", audio: "hut",
      title: "第一幕 · 茅舍", place: "伯尔尼阿尔卑斯山中的一间茅舍里",
      lamp: .65,
      beats: [
        { lines: [{ who: "羚羊猎人", t: "来吧，尝尝我的酒！这可是陈年的好酒啊！" }, { t: "在多少个日子里，在我们的冰河里它温暖了我的血脉。" }] },
        { lines: [{ who: "曼弗雷德", cls: "curse", t: "拿开，拿开！杯子口上有血！" }, { t: "难道它从来没有——永远不会渗入地底吗？" }] },
        { lines: [{ who: "曼弗雷德", t: "我说那是血，是我的血！是当我们年轻的时候，" }, { cls: "narr", t: "当我们怀着同一颗心，像我们不该那样爱着，却彼此相爱的时候，" }, { t: "它也奔流在我们的脉管里。" }] },
        { lines: [{ who: "羚羊猎人", t: "伙计，你口出谵言怪语……可是不管你怎样畏惧和痛苦，安慰还是存在的——例如圣人的救助或神圣的忍耐——" }] },
        { lines: [{ who: "曼弗雷德", cls: "curse", t: "忍耐！忍耐！去一边吧！" }, { t: "这些字眼是为负重的驮畜而非为掠食的猛禽创造的。" }] },
        { lines: [{ who: "羚羊猎人", t: "你愿意以你的命运跟我的交换吗？" }, { who: "曼弗雷德", t: "不，朋友！我不愿伤害你。我能忍受——不管多么不幸，我都要忍受。" }, { cls: "narr", t: "那么再来瞧瞧我吧——无关紧要，我的灵魂早已焚毁了！" }] },
        { lines: [{ who: "曼弗雷德", t: "我不需要这些，但可以忍受你的怜悯。" }, { t: "我走了——是时候了——再会吧！" }, { cls: "narr", t: "（他留下一点金子，独自走回高山。）" }] }
      ]
    },
    {
      id: "waterfall", visual: "waterfall", audio: "waterfall", bell: "act",
      title: "第二幕 · 魔女", place: "幽深的山谷；大瀑布",
      lamp: .6,
      beats: [
        { lines: [{ cls: "narr", t: "还没有到正午——彩虹的光线仍然横跨在这条急流之上。" }, { cls: "narr", t: "唯独他的眼睛陶醉于这片可爱的美景。" }] },
        { lines: [{ cls: "narr", t: "（曼弗雷德掬起水，抛洒向空中，念动咒语。彩虹下，阿尔卑斯的魔女现形。）" }, { who: "魔女", cls: "spirit", t: "尘世之人啊！我知道你，也知道那些赋予你力量的精灵。" }, { cls: "spirit", t: "你对我有什么要求？" }] },
        { lines: [{ who: "曼弗雷德", t: "瞧瞧你的美颜——没有别的。" }, { t: "那大地的容颜曾经令我疯狂，向他们寻求他们无法给予的东西，现在我也不再求索了。" }, { who: "魔女", cls: "spirit", t: "你所寻求的是什么，竟连最强大者也无能为力？" }] },
        { lines: [{ who: "曼弗雷德", t: "曾经有一个人——她的容貌长得像我。" }, { t: "她有同情、欢笑和泪水，我却没有。" }, { cls: "big", t: "我爱过她，也毁了她！" }] },
        { lines: [{ who: "魔女", cls: "spirit", t: "用你的手吗？" }, { who: "曼弗雷德", t: "不是用我的手，而是我的心。" }, { t: "我的心使她的破碎了，她的心凝视着我的心，凋萎了。" }] },
        { lines: [{ who: "魔女", cls: "spirit", t: "我也许能帮助你。" }, { cls: "spirit", t: "只要你愿意发誓服从我的旨意，我就可以帮助你，实现你的心愿。" }], choices: [
          { label: "跪下发誓", special: "ash-1" },
          { label: "拒绝", go: "refuse-1", cls: "reject" }
        ] },
        { id: "ash-1-result", lines: [{ cls: "metaline", t: "你的指尖停在半空——这项选择，你替他做不到。" }], goto: "refuse-1" },
        { id: "refuse-1", lines: [{ who: "曼弗雷德", cls: "big", t: "我决不会发誓——服从！" }, { t: "服从谁？服从那些受我指使其出没的精灵，" }, { t: "充当那些为我服务的精灵的奴隶吗？" }, { cls: "big", t: "永远不可能！" }] },
        { lines: [{ who: "魔女", cls: "spirit", t: "这就是你要说的吗？没有再温柔的回答了吗？然而还是再想一想吧！在拒绝之前，要三思啊！" }, { who: "曼弗雷德", t: "我已经讲明白了。" }] },
        { lines: [{ cls: "narr", t: "（魔女隐去。）" }, { who: "曼弗雷德", t: "我们是时间和恐怖的玩偶，时光总是悄然而来，又悄然而去。" }, { cls: "big", t: "然而我们活着，厌恨生活，更惧怕死亡。" }] },
        { lines: [{ who: "曼弗雷德", t: "我曾经祈求上苍赐予我疯狂，可是被拒绝了。" }, { t: "我曾经向死神挑战——然而一个冷酷的魔鬼用冰冷的手把我拉了回来。" }, { cls: "narr", t: "拉着一根发丝把我拽了回来，那发丝竟没有扯断。" }] }
      ]
    },
    {
      id: "palace", visual: "palace", audio: "palace", bell: "dark",
      title: "第二幕 · 殿堂", place: "阿里曼涅斯的宫殿",
      lamp: .45,
      beats: [
        { lines: [{ cls: "narr", t: "地下。众灵的颂歌在黑暗中响起：吾王万岁！大地与苍天的君主！" }, { cls: "narr", t: "（阿里曼涅斯坐在火球王座上，命运三女神与奈弥希丝前来朝贺。）" }] },
        { lines: [{ cls: "narr", t: "（曼弗雷德上。）" }, { who: "众精灵", cls: "curse", t: "是什么东西在此？一个凡人！" }, { cls: "big", t: "跪下吧，你这戴罪的泥身，尘世的孩子！" }, { cls: "curse", t: "否则，就要你遭受最最可怕的痛苦。" }], choices: [
          { label: "跪下", special: "ash-2" },
          { label: "不跪", go: "refuse-2", cls: "reject" }
        ] },
        { id: "ash-2-result", lines: [{ cls: "metaline", t: "膝盖弯不下去——这里的重力，只听曼弗雷德的。" }], goto: "refuse-2" },
        { id: "refuse-2", lines: [{ who: "曼弗雷德", cls: "big", t: "那我是知道的。可是，瞧吧！" }, { cls: "big", t: "我就是不向你们下跪。" }] },
        { lines: [{ who: "第五个精灵", cls: "curse", t: "整个世界都向坐在宝座上的阿里曼涅斯致敬，难道你竟敢拒绝向他表示尊敬吗？" }, { who: "曼弗雷德", t: "去命令他向那高居于他之上的神跪拜吧——是造物主，" }, { t: "叫他下跪吧，我们也就一起下跪。" }] },
        { lines: [{ who: "奈弥希丝", cls: "spirit", t: "那么，他来这儿干什么？让他自己来回答吧。" }, { who: "曼弗雷德", t: "把死者唤来吧！我要向他们询问。" }, { cls: "narr", t: "伟大的阿里曼涅斯呀，你赞成这个凡人的愿望吗？" }, { who: "阿里曼涅斯", cls: "big", t: "——是的！" }] },
        { lines: [{ who: "奈弥希丝", cls: "spirit", t: "你要从墓穴里唤来谁呢？" }, { who: "曼弗雷德", t: "一个在坟墓之外的幽魂——" }, { cls: "big", t: "唤来阿丝塔忒吧！" }] },
        { auto: 2400, lines: [{ cls: "narr", t: "（阿丝塔忒的幽魂出现，在正当中站立。）" }, { who: "曼弗雷德", t: "这能是死亡吗？她的面颊泛着红晕……" }, { t: "阿丝塔忒啊！……你吩咐她说话吧！" }, { cls: "big", t: "是宽恕了我，还是责备我呢？" }] },
        { auto: 3200, lines: [{ cls: "whisper", t: "她默然无声。" }, { cls: "narr", t: "而在这沉默里，我得到的东西比回答更多。" }] },
        { lines: [{ who: "曼弗雷德", t: "听我说，听我说呀！阿丝塔忒，我的亲爱的！请对我说话吧。" }, { t: "你炽烈地爱着我，就像我爱着你一样。" }, { cls: "whisper", t: "虽然像我们爱过的那样去爱属于莫大的罪孽。" }] },
        { lines: [{ who: "曼弗雷德", t: "我曾经在万籁俱寂的暗夜里呼唤你，惊飞了栖息的鸟儿，唤醒了游荡的豺狼。" }, { t: "那回声对我回应——各种精灵和凡人——但是你却总在沉默。" }, { cls: "big", t: "对我说话吧！即使出自愤怒——可是说话吧！" }] },
        { auto: 4200, lines: [{ who: "阿丝塔忒的幽魂", cls: "astarte", t: "——曼弗雷德啊！" }] },
        { auto: 3600, lines: [{ who: "阿丝塔忒的幽魂", cls: "astarte-slow", t: "明天，你尘世的生命就要结束了。" }, { who: "阿丝塔忒的幽魂", cls: "astarte", t: "再会吧！" }] },
        { lines: [{ who: "曼弗雷德", t: "再说一句吧——我被宽恕了吗？" }, { who: "阿丝塔忒的幽魂", cls: "astarte", t: "——再会吧！" }, { who: "曼弗雷德", t: "告诉我，咱们还会重逢吗？" }, { who: "阿丝塔忒的幽魂", cls: "astarte", t: "——再会吧！" }] },
        { lines: [{ who: "曼弗雷德", t: "恳求你再说一句吧！告诉我，你是爱我的。" }, { who: "阿丝塔忒的幽魂", cls: "astarte", t: "——曼弗雷德啊！" }, { cls: "narr", t: "（幽魂隐去。）" }, { who: "奈弥希丝", cls: "spirit", t: "她去了，再也不能唤她来了。她的预言将会实现。" }] }
      ]
    },
    {
      id: "tower", visual: "midnight", audio: "midnight", bell: "act",
      title: "第三幕 · 午夜", place: "塔楼里边",
      lamp: .35,
      beats: [
        { lines: [{ cls: "narr", t: "午夜。星光闪烁，月辉流泻。群山巅峰，雪影闪耀。" }, { who: "曼弗雷德", cls: "big", t: "真是太美了！" }, { t: "对于我，夜的脸比人的脸更为熟悉。" }, { cls: "narr", t: "从它隐约、寂静、可爱的萤萤夜色，我领悟到另一个世界的语言。" }] },
        { lines: [{ cls: "narr", t: "（圣·摩雷斯修道院的长老，再一次登上塔楼。）" }, { who: "修道院长老", t: "我的好伯爵呀！我恳求您允许我再次来见你。" }, { t: "我要是能用善言和祈祷感动了它，我就会挽救一颗高尚的灵魂。" }] },
        { lines: [{ who: "曼弗雷德", cls: "big", t: "无论我曾经怎样，现在如何，" }, { t: "那完全是上帝与我个人之间的事情。" }, { t: "我不想选择一个凡人来做我的调解者。" }] },
        { lines: [{ who: "修道院长老", t: "永远不会太晚。让你自己和你的灵魂，让你的灵魂和上天全都和好吧！" }, { who: "曼弗雷德", t: "我在用那个罗马人的话回答您——" }, { cls: "big", t: "太晚了！" }] },
        { lines: [{ who: "曼弗雷德", t: "一般的人是卑微的，我不愿和兽群为伍，即使做它们的首领——做豺狼的首领。" }, { cls: "big", t: "狮子是孤独的，我就像狮子。" }] },
        { lines: [{ who: "曼弗雷德", t: "这世界上有一种人，青年之时衰老，中年之前死去。" }, { cls: "narr", t: "有的死于享乐，有的死于苦学；有的灭于辛劳，有的灭于疲惫；" }, { cls: "narr", t: "有的是因为疾病，有的是因为疯狂，有的是因为枯萎，有的是因为心碎。" }, { cls: "narr", t: "瞧瞧我吧——这一切致人死地的东西，我全都具备了。" }] },
        { lines: [{ who: "曼弗雷德", t: "哦，灿烂夺目的光体啊！……你在光辉中升起，照耀，沉落。" }, { cls: "big", t: "永别吧！我将永远不再看到你。" }, { cls: "narr", t: "它，沉落了！我要随它而去。" }] },
        { fx: "bell-dark", lines: [{ cls: "narr", t: "午夜。老人退下之后，黑暗并没有退下。" }, { cls: "narr", t: "您看到了什么吗？——一个幽暗可怖的形象升了起来，站在他和长老之间。" }] },
        { lines: [{ who: "精灵", cls: "curse", t: "吾乃此人的守护者——来呀！是时辰了。" }, { who: "曼弗雷德", t: "我已准备好接受一切发生的事情，可是决不屈从任何传唤我的精灵。" }, { t: "是谁派你来的？" }] },
        { lines: [{ who: "精灵", cls: "curse", t: "凡人啊！你的死期到了——走吧！" }, { who: "曼弗雷德", cls: "big", t: "滚开！" }, { cls: "big", t: "我要像我活过的那样去死——独来独往。" }, { cls: "narr", t: "（精灵唤来了他的弟兄们。黑暗从四面合拢。）" }] },
        { hold: { label: "按住 · 反抗", ms: 6500, whis: [
          { at: .18, cls: "whisper", t: "长老：滚开！你们这些邪恶的东西！在虔诚还有力量的地方，没有你们的用武之地！" },
          { at: .42, cls: "whisper", t: "精灵：倔强的凡人……难道你是真的如此热爱生命，热爱那给你带来不幸的生命吗？" },
          { at: .66, cls: "curse", t: "曼弗雷德：荒谬的魔鬼！我的生命已经到了最后的时辰——我并不想把这个时辰赎回片刻。" },
          { at: .86, cls: "whisper", t: "长老：祈祷上帝吧——哪怕在心里默默地祈祷——请不要这样死去。" }
        ] } },
        { id: "defiance", lines: [{ who: "曼弗雷德", cls: "big", t: "我并不反抗死亡。" }, { cls: "big", t: "我是反抗你，和你周围的魔鬼。" }, { t: "你们没有力量控制我，这我觉察到了，你们永远不能占有我，这我心里明白。" }] },
        { lines: [{ who: "曼弗雷德", cls: "narr", t: "我的不朽的灵魂为了它的或善或恶的思想而向自己报复——" }, { cls: "narr", t: "这是它自己罪孽与终结的根源——这也是它自己的空间和时间。" }, { cls: "narr", t: "你诱惑不了我——我只是我自己的毁灭者。" }] },
        { lines: [{ cls: "big", t: "死神的手已经触到我的身体了——" }, { cls: "big", t: "但那不是你们的手啊！" }, { cls: "narr", t: "（众魔鬼隐去。）" }] },
        { lines: [{ who: "曼弗雷德", t: "结束了——我昏暗的双眼不能把你辨认，一切东西都在我的四周浮荡。" }, { t: "永别吧！请把你的手给我。" }, { who: "修道院长老", cls: "curse", t: "凉的！凉了！简直是彻心地凉呀！可是作一次祈祷吧！" }] },
        { fx: "die", auto: 3000, lines: [{ cls: "big", t: "老人家！" }, { cls: "big", t: "要死并不太难啊！" }] }
      ]
    },
    {
      id: "epilogue", visual: "snow", audio: "snow",
      title: "尾声", place: "雪，落了一夜",
      lamp: 0,
      beats: [
        { lines: [{ who: "修道院长老", cls: "narr", t: "他去了——他的灵魂已经凌空飞去。" }, { cls: "narr", t: "飞往哪里？我不敢去想——可是他去了。" }] },
        { lines: [{ cls: "narr", t: "灯油已尽。山里的雪，下了一夜。" }, { cls: "whisper", t: "精灵们曾说：忘却不是我们的本性，而且也不归我们支配。" }], choices: [
          { label: "忘却", special: "forget" }
        ] },
        { id: "forget-fail", lines: [{ cls: "big", t: "我们做不到。" }, { cls: "whisper", t: "——七个精灵" }, { cls: "metaline", t: "遗忘从来不归任何力量支配。你得把一切带回人间。" }], choices: [
          { label: "再试一次", special: "forget" },
          { label: "重新开始", special: "restart" },
          { label: "读《曼弗雷德》全文", special: "link-read" },
          { label: "走进档案", special: "link-atlas" }
        ] }
      ]
    }
  ];

  /* ============ 状态机 ============ */
  const state = { scene: null, i: -1, busy: false, started: false };
  const col = $("#text-column");
  const choicesEl = $("#choices");
  const hint = $("#advance-hint");
  let autoTimer = null;

  function findBeat(id) {
    for (const sc of SCENES) {
      const j = sc.beats.findIndex(b => b.id === id);
      if (j >= 0) return { sc, j };
    }
    return null;
  }

  function setScene(sc, beatIndex) {
    const isNew = sc !== state.scene;
    state.scene = sc;
    state.i = beatIndex;
    if (isNew) {
      stage.setScene(sc.visual, { lampLevel: Math.max(.08, sc.lamp || .2) });
      audio.apply(sc.audio);
      if (sc.bell) audio.bellStrike(sc.bell);
      const st = $("#scene-title");
      st.innerHTML = "";
      if (sc.title) {
        const d1 = document.createElement("div"); d1.textContent = sc.title;
        st.appendChild(d1);
        const d2 = document.createElement("div"); d2.className = "place"; d2.textContent = sc.place || "";
        st.appendChild(d2);
        st.classList.remove("show");
        setTimeout(() => st.classList.add("show"), 900);
      }
      document.body.classList.remove("epilogue");
      document.body.classList.remove("collapse");
      if (sc.id === "epilogue") document.body.classList.add("epilogue");
      $("#lamp-hud").classList.toggle("dying", !(sc.lamp > 0));
    }
    showBeat(beatIndex >= 0 ? beatIndex : 0);
  }

  function clearColumn() {
    col.style.transition = "opacity .34s ease";
    col.style.opacity = "0";
    return new Promise(r => setTimeout(() => { col.innerHTML = ""; col.style.opacity = "1"; r(); }, CLEAR_MS));
  }

  /* 测试模式：?fast=1 缩短全部等待（供自动化走查） */
  const FAST = /[?&]fast=1/.test(location.search);
  const STAGGER = FAST ? 40 : 620;
  const STAGGER_SLOW = FAST ? 90 : 1400;
  const CLEAR_MS = FAST ? 60 : 360;
  const TAIL = FAST ? 250 : 900;

  function lineEl(l, idx) {
    const d = document.createElement("div");
    d.className = "ln " + (l.cls || "");
    d.textContent = l.t;
    const slow = l.cls === "astarte" || l.cls === "astarte-slow";
    d.style.animationDelay = (idx * (slow ? STAGGER_SLOW : STAGGER) / 1000) + "s";
    if (FAST) d.style.animationDuration = ".15s";
    return d;
  }

  function whoEl(name) {
    const d = document.createElement("div");
    d.className = "who" + (name === "曼弗雷德" ? " manfred" : "");
    d.textContent = name;
    return d;
  }

  async function showBeat(i) {
    if (state.busy) return;
    state.busy = true;
    state.i = i;
    if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
    const beat = state.scene.beats[i];
    hint.classList.remove("show");
    choicesEl.classList.remove("show");
    choicesEl.innerHTML = "";
    await clearColumn();
    const lines = beat.lines || [];
    let lastWho = null, vi = 0;
    lines.forEach((l) => {
      if (l.who && l.who !== lastWho) {
        col.appendChild(whoEl(l.who));
        lastWho = l.who;
      }
      col.appendChild(lineEl(l, vi++));
    });
    const per = lines.reduce((a, l) => a + ((l.cls === "astarte" || l.cls === "astarte-slow") ? STAGGER_SLOW : STAGGER), TAIL);
    const total = REDUCED ? 200 : per + (FAST ? 150 : 900);

    /* 特效 */
    if (beat.fx === "her-face") audio.bellStrike("small");
    if (beat.fx === "bell-dark") { audio.bellStrike("dark"); }
    if (beat.fx === "collapse") {
      document.body.classList.add("collapse");
      audio.apply("corridorFall");
    }
    if (beat.fx === "die") {
      stage.blackout();
      audio.apply("off");
    }

    setTimeout(() => {
      state.busy = false;
      if (beat.choices) { renderChoices(beat); return; }
      if (beat.hold) { renderHold(beat); return; }
      hint.classList.add("show");
      if (beat.auto) {
        const ms = FAST ? Math.min(400, beat.auto) : beat.auto;
        autoTimer = setTimeout(() => { autoTimer = null; nextBeat(); }, ms);
      }
    }, total);
  }

  function gotoBeat(ref) {
    const t = findBeat(ref);
    if (!t) return;
    if (t.sc === state.scene) { showBeat(t.j); }
    else setScene(t.sc, t.j);
  }

  function nextBeat() {
    hint.classList.remove("show");
    if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
    const sc = state.scene;
    const beat = sc.beats[state.i];
    if (!beat) return;
    if (beat.goto) { gotoBeat(beat.goto); return; }
    if (state.i + 1 < sc.beats.length) { showBeat(state.i + 1); return; }
    const k = SCENES.findIndex(s => s.id === sc.id);
    if (k + 1 < SCENES.length) { setScene(SCENES[k + 1], -1); return; }
    /* 全剧终 */
  }

  function specialAction(special, btn) {
    // 动画期间禁用兄弟按钮，避免被抢点绕过
    [...btn.parentElement.children].forEach(x => { if (x !== btn) x.style.pointerEvents = "none"; });
    const WAIT = FAST ? 250 : null;
    if (special === "ash-1" || special === "ash-2") {
      btn.classList.add("ash");
      audio.bellStrike("small");
      setTimeout(() => {
        gotoBeat(special === "ash-1" ? "ash-1-result" : "ash-2-result");
      }, WAIT || 1500);
      return;
    }
    if (special === "jump") {
      btn.classList.add("ash");
      stage.blackout();
      setTimeout(() => {
        gotoBeat("after-jump");
        setTimeout(() => stage.resume(), FAST ? 80 : 500);
      }, WAIT || 900);
      return;
    }
    if (special === "forget") {
      btn.classList.add("fail");
      audio.bellStrike("dark");
      setTimeout(() => {
        gotoBeat("forget-fail");
      }, WAIT || 1400);
      return;
    }
    if (special === "restart") { location.reload(); return; }
    if (special === "link-read") { location.href = "read.html"; return; }
    if (special === "link-atlas") { location.href = "atlas.html"; return; }
  }

  function renderChoices(beat) {
    choicesEl.innerHTML = "";
    beat.choices.forEach(c => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = c.label;
      if (c.cls) b.classList.add(c.cls);
      if (c.special) b.dataset.special = c.special;
      b.addEventListener("click", () => {
        if (c.special) { specialAction(c.special, b); return; }
        gotoBeat(c.go);
      });
      choicesEl.appendChild(b);
    });
    choicesEl.classList.add("show");
  }

  function renderHold(beat) {
    const hold = beat.hold;
    const holdMs = FAST ? 500 : hold.ms;
    choicesEl.innerHTML = "";
    const b = document.createElement("button");
    b.type = "button";
    b.className = "hold";
    b.innerHTML = hold.label + '<span class="bar"></span>';
    choicesEl.appendChild(b);
    choicesEl.classList.add("show");
    const bar = b.querySelector(".bar");
    let accum = 0, lastTs = null, holding = false, done = false;
    const whisperQueue = (hold.whis || []).slice();
    let injected = 0;

    const stop = () => { holding = false; lastTs = null; };
    const onKey = (e) => { if (e.key === " " || e.key === "Enter") { holding = true; } };
    const onKeyUp = (e) => { if (e.key === " " || e.key === "Enter") { holding = false; } };
    b.addEventListener("pointerdown", () => { holding = true; });
    window.addEventListener("pointerup", stop);
    b.addEventListener("keydown", onKey);
    b.addEventListener("keyup", onKeyUp);

    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener("pointerup", stop);
      choicesEl.classList.remove("show");
      audio.bellStrike("act");
      gotoBeat("defiance");
    };
    /* 绝对时间累积 + setInterval 驱动：后台标签 rAF 停摆时仍能正确推进 */
    let lastTick = performance.now();
    const timer = setInterval(() => {
      if (done) { clearInterval(timer); return; }
      const now = performance.now();
      if (holding) {
        accum += Math.min(400, now - lastTick);
        lastTick = now;
        const progress = Math.min(1, accum / holdMs);
        bar.style.width = (progress * 100) + "%";
        while (injected < whisperQueue.length && progress >= whisperQueue[injected].at) {
          const w = whisperQueue[injected++];
          col.appendChild(lineEl(w, 0));
        }
        if (progress >= 1) { clearInterval(timer); finish(); }
      } else {
        lastTick = now;
      }
    }, 120);
  }

  /* 推进交互 */
  $("#theater").addEventListener("click", () => {
    if (!state.started || state.busy) return;
    if (choicesEl.classList.contains("show")) return;
    nextBeat();
  });
  window.addEventListener("keydown", (e) => {
    if (!state.started) return;
    if (e.key === " " || e.key === "Enter" || e.key === "ArrowRight") {
      if (choicesEl.classList.contains("show")) return;
      e.preventDefault();
      nextBeat();
    }
  });

  /* HUD */
  $("#audio-toggle").addEventListener("click", () => {
    const muted = audio.toggleMute();
    $("#audio-toggle").textContent = muted ? "音效 关" : "音效 开";
  });
  $("#restart-btn").addEventListener("click", () => location.reload());

  /* 入场 */
  $("#light-btn").addEventListener("click", () => {
    $("#gate").classList.add("hidden");
    audio.start();
    audio.apply("overture");
    state.started = true;
    setScene(SCENES[0], -1);
  });
})();
