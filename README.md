# 曼弗雷德：遗忘实验

**一个以拜伦三幕诗剧《曼弗雷德》（1817）为锚点的多形态数字项目。**

曼弗雷德向宇宙只求一样东西——忘却。精灵、魔女、命运女神、地狱之王、教会，没有任何力量能够给予它；也没有任何力量能使他跪下。整个项目被组织为一次**注定失败的遗忘实验**：交互动词不是"得到"，而是"拒绝"；两个"下跪"选项在交互上不可能完成（装置会替你执行曼弗雷德的拒绝）；终幕的"忘却"按钮永远回答：我们做不到。

> 你的任何一次选择都无法改变结局——这不是缺陷，是主题。

## 运行

零构建、零外部依赖、离线可用：

```bash
# 方式一：直接双击打开 index.html
# 方式二：本地服务器
python3 -m http.server 8417
# 打开 http://localhost:8417/
```

开发/自动化走查可用 `index.html?fast=1`（缩短全部等待，不影响正常体验）。

## 项目地图

| 入口 | 形态 | 内容 |
|------|------|------|
| [index.html](index.html) | **数字装置**（交互叙事 + 生成音景 + Canvas 视觉） | 序幕（点灯）→ 第一幕（七精灵·召唤）→ 悬崖/茅舍/魔女/殿堂 → 第三幕（午夜群魔）→ 尾声（灯灭·遗忘失败）。全程约十余分钟，建议佩戴耳机。 |
| [read.html](read.html) | **全文读本** | 《曼弗雷德》全文，曹元勇译本，3 幕 10 场 252 段台词 22 条注释，朱丝栏排版，幕/场导航。 |
| [essays.html](essays.html) | **解读文集** | 六篇中文长文：遗忘论 / 罪与沉默 / 1816 无夏之年 / 音乐中的曼弗雷德 / 拜伦式英雄谱系 / 译者与他的午夜。 |
| [atlas.html](atlas.html) | **档案馆** | 影响年表（1788→20 世纪）、阿尔卑斯地图书（手绘风 SVG，含"图外"的阿里曼涅斯殿堂）、人物志、概念词典、音乐与图像史、中英双语对照（已逐句核对）、名家评论。 |
| [installation.html](installation.html) | **策展手册** | 假想实体展览《午夜，一盏灯》的完整方案（九厅动线、材质声光、无障碍与安全），及数字装置的技术说明。 |
| [docs/superpowers/specs/2026-09-04-manfred-project-design.md](docs/superpowers/specs/2026-09-04-manfred-project-design.md) | 设计文档 | 概念发敛、设计令牌（"夜/纸"双世界系统）、验证记录。 |

## 技术要点

- **生成音景**（`assets/js/audio.js`）：纯 Web Audio 实时合成，无采样文件——风（带通噪声）、持续低音（失谐振荡器，随幕换调）、动机音序（B 小调系）、钟、合唱垫、心跳脉冲、水声；双延迟反馈网络混响；首次手势启动，可静音。
- **Canvas 场景**（`assets/js/scenes.js`）：九个场景全部程序化生成（种子化山脊线、哥特透视拱廊、瀑布与光谱弧、火球王座、雪/雾/烬粒子、油灯焰心）；指针视差；`prefers-reduced-motion` 降级。
- **叙事引擎**（`assets/js/installation.js`）：声明式剧本（八场六十余拍）；`setInterval` 绝对时间驱动的"按住反抗"拉锯（后台标签亦正确）；特殊动作期间禁用兄弟按钮。
- **文本数据**（`tools/parse_manfred.py` → `assets/js/data-manfred.js`）：从本书 epub 解析出的结构化全文，供读本页与装置共用。

## 事实核查与出处

- 引文均出自**曹元勇译本**（《曼弗雷德 该隐：拜伦诗剧两部》）；生平年表与名家评论录自该书附录。
- 英文原文摘自 Project Gutenberg《The Works of Lord Byron, Vol. 4》（公有领域），关键段落已逐句核对（开场灯句、"Sorrow is Knowledge"、"Forgetfulness—"对答、"I will not swear—Obey!"、"The lion is alone"、"Thou hast no power upon me"、"The Mind which is immortal"、"要死并不难"、长老收场白等）。
- 音乐史实（舒曼 Op.115 于 1848–49 写成、1852-06-13 李斯特指挥魏玛首演；柴可夫斯基 Op.58 于 1885 写成、1886-03-11 莫斯科首演、斯塔索夫 1868 年大纲经巴拉基列夫转交柏辽兹未果；尼采《曼弗雷德沉思》1872）与美术史实（福特·马多克斯·布朗《少女峰上的曼弗雷德》1842，曼彻斯特美术馆藏；约翰·马丁《曼弗雷德与阿尔卑斯魔女》）经公开资料核实。

## 权利说明

本项目为本地个人研究/致敬项目。曹元勇译文版权归原作者与出版方所有，读本页仅供本地阅读；拜伦英文原文属公有领域。若公开部署，请保留署名并遵守所在地法律。

## 目录结构

```
book-01/
├── index.html              # 数字装置（夜世界）
├── read.html               # 全文读本（纸世界）
├── essays.html             # 解读文集
├── atlas.html              # 档案馆
├── installation.html       # 策展手册
├── assets/
│   ├── css/                # installation.css（夜）/ site.css（纸）
│   ├── js/                 # audio / scenes / installation / data-manfred / data-curator
│   └── img/                # （本书封面存档 sources/epub 内）
├── tools/parse_manfred.py  # epub 文本 → 结构化数据
├── sources/                # 原始 epub 存档
└── docs/superpowers/specs/ # 设计文档
```
