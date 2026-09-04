#!/usr/bin/env python3
"""把 epub 提取的《曼弗雷德》纯文本解析为结构化 JS 数据（曹元勇译本）。

用法: python3 tools/parse_manfred.py /tmp/manfred_epub/manfred.txt assets/js/data-manfred.js
"""
import json
import re
import sys

ACT_NUM = {"一": 1, "二": 2, "三": 3}
ACT_RE = re.compile(r"^第[一二三]幕$")
SCENE_RE = re.compile(r"^第[一二三四]场$")


def act_num(line: str) -> int:
    return ACT_NUM[line[1]]
PLACE_RE = re.compile(r"^场景$")
# 说话人（含合并行拆分）：长名优先匹配
SPEAKERS = [
    "圣·摩雷斯修道院长老", "修道院长老", "阿丝塔忒的幽魂", "阿尔卑斯山的魔女", "魔女",
    "第一命运女神", "第二命运女神", "第三命运女神", "命运三女神", "奈弥希丝", "阿里曼涅斯",
    "羚羊猎人", "曼弗雷德", "曼纽尔", "赫尔曼",
    "第一个精灵", "第二个精灵", "第三个精灵", "第四个精灵", "第五个精灵", "第六个精灵", "第七个精灵",
    "一个精灵", "另一个精灵", "精灵", "众精灵", "七个精灵", "精灵们的颂歌", "三女神合唱",
]
NOTE_RE = re.compile(r"^\[(\d+|\*)\]")


def read_lines(path: str) -> list[str]:
    raw = open(path, encoding="utf-8").read()
    lines = [l.strip() for l in raw.split("\n")]
    # 去掉重复空行与页眉式重复（“曼弗雷德”标题重复行在开头自行处理）
    out = []
    for l in lines:
        if l == "" and (not out or out[-1] == ""):
            continue
        out.append(l)
    return out


def pop_direction(buf: list[str], i: int) -> tuple[str, int]:
    """buf[i] 以 '[' 开头：聚合到 ']' 结束，返回 (方向文本, 下一索引)。"""
    if "]" in buf[i]:  # 单行完整指示，如 “ [曼弗雷德一人]”
        return buf[i][1 : buf[i].index("]")].strip(), i + 1
    acc = [buf[i][1:]]
    i += 1
    while i < len(buf):
        if "]" in buf[i]:
            acc.append(buf[i][: buf[i].index("]")])
            i += 1
            break
        acc.append(buf[i])
        i += 1
    text = "".join(a for a in acc if a).strip()
    return text, i


def main() -> None:
    src, dst = sys.argv[1], sys.argv[2]
    buf = read_lines(src)
    n = len(buf)

    # 截去可能混入的序言残留：从题记前的剧名行开始
    try:
        start = buf.index("——诗剧") - 1
        buf = buf[start:]
        n = len(buf)
    except ValueError:
        pass

    # ---- 前置块 ----
    i = 0
    while i < n and buf[i] != "剧中人物":
        i += 1
    epigraph = []
    for l in buf[: i]:
        if l not in ("曼弗雷德", "——诗剧"):
            epigraph.append(l)
    epigraph = [l for l in epigraph if l]
    # 引文与署名拼合（“——《哈姆雷特》”单独一行）
    persons: list[str] = []
    i += 1
    while i < n and buf[i] != "地点":
        if buf[i]:
            persons.append(buf[i])
        i += 1
    setting: list[str] = []
    i += 1
    while i < n and not ACT_RE.match(buf[i]):
        if buf[i]:
            setting.append(buf[i])
        i += 1

    acts: list[dict] = []
    notes: list[str] = []
    cur_act = None
    cur_scene = None
    mode = "body"  # body | place | notes
    place_acc: list[str] = []
    cur_speech = None
    last_who = None
    in_notes = False

    def flush_speech() -> None:
        nonlocal cur_speech, last_who
        if cur_speech is not None:
            if cur_speech[1]:  # 丢弃空台词
                if cur_scene is not None:
                    cur_scene["content"].append({"t": "speech", "who": cur_speech[0], "lines": cur_speech[1]})
            last_who = cur_speech[0]
        cur_speech = None

    def add_direction(text: str) -> None:
        if cur_scene is None or not text:
            return
        content = cur_scene["content"]
        if content and content[-1].get("t") == "direction" and content[-1]["text"] == text:
            return  # 源文本重复的指示（如两次“稍停”）
        flush_speech()  # 指示打断台词，保持顺序
        content.append({"t": "direction", "text": text})

    def speaker_of(line: str) -> tuple[str, str] | None:
        for name in SPEAKERS:
            if line == name:
                return name, ""
            if line.startswith(name) and len(line) > len(name) + 1:
                rest = line[len(name):]
                # 防止 “曼弗雷德城堡内的客厅” 之类的场景描述误判：
                if name != "曼弗雷德" or not re.match(r"^(的|城)", rest):
                    return name, rest
        return None

    while i < n:
        line = buf[i]
        if line == "":
            i += 1
            continue
        if line == "注释":
            flush_speech()
            in_notes = True
            mode = "notes"
            i += 1
            continue
        if in_notes:
            if NOTE_RE.match(line):
                notes.append(line)
            elif notes:
                notes[-1] += line
            i += 1
            continue
        if ACT_RE.match(line):
            flush_speech()
            want = act_num(line)
            existing = next((a for a in acts if a["n"] == want), None)
            if existing is None:
                cur_act = {"n": want, "scenes": []}
                acts.append(cur_act)
            else:
                cur_act = existing
            cur_scene = None
            mode = "await_scene"
            i += 1
            continue
        if SCENE_RE.match(line):
            flush_speech()
            cur_scene = {"n": len(cur_act["scenes"]) + 1, "place": "", "content": []}
            cur_act["scenes"].append(cur_scene)
            mode = "await_place"
            i += 1
            continue
        if PLACE_RE.match(line) or mode == "await_place":
            if line != "场景" and line != "":
                place_acc.append(line)
            i += 1
            # 场景描述遇到方向或说话人即结束（跳过空行向前看）
            j = i
            while j < n and buf[j] == "":
                j += 1
            nxt = buf[j] if j < n else ""
            ender = (
                nxt == "" or nxt.startswith("[") or PLACE_RE.match(nxt)
                or ACT_RE.match(nxt) or SCENE_RE.match(nxt)
            )
            if not ender:
                m = speaker_of(nxt)
                # “阿里曼涅斯”会出现在场景描述（“阿里曼涅斯坐在宝座上”）里，不作结束符
                ender = m is not None and m[0] != "阿里曼涅斯"
            if ender:
                if cur_scene is not None and place_acc:
                    # 碎片合并（“一条/一座/一间”与其后名词相连）
                    frags = [p.strip() for p in place_acc if p.strip()]
                    merged: list[str] = []
                    for f in frags:
                        f = f.rstrip("；;，,")
                        if merged and merged[-1] in ("一条", "一座", "一间"):
                            merged[-1] += f
                        else:
                            merged.append(f)
                    text = "；".join(merged)
                    # 内嵌舞台指示：“阿里曼涅斯的宫殿——阿里曼涅斯坐在宝座上，……”
                    if "——" in text:
                        head, tail = text.split("——", 1)
                        cur_scene["place"] = head
                        cur_scene["content"].append({"t": "direction", "text": tail})
                    else:
                        cur_scene["place"] = text
                place_acc = []
                mode = "body"
            continue
        if line.startswith("[") or line.startswith("("):
            close = "]" if line.startswith("[") else ")"
            if close in line:
                add_direction(line[1 : line.index(close)].strip())
                i += 1
            else:  # 跨行括号指示
                acc = [line[1:]]
                i += 1
                while i < n and close not in buf[i]:
                    acc.append(buf[i])
                    i += 1
                if i < n:
                    acc.append(buf[i][: buf[i].index(close)])
                    i += 1
                add_direction("".join(a for a in acc if a).strip())
            continue
        sp = speaker_of(line)
        if sp:
            flush_speech()
            name, rest = sp
            lines0 = [rest.strip()] if rest.strip() else []
            cur_speech = [name, lines0]
            i += 1
            continue
        # 普通诗句行
        if cur_speech is not None:
            cur_speech[1].append(line)
        elif last_who is not None and cur_scene is not None and cur_scene["content"] \
                and cur_scene["content"][-1].get("t") == "direction":
            cur_speech = [last_who, [line]]  # 指示后重开同一说话人的台词
        elif cur_scene is not None:
            cur_scene["content"].append({"t": "direction", "text": line})
        i += 1
    flush_speech()

    # 去重注释（[*] 出现两次）
    seen: set[str] = set()
    uniq_notes = []
    for x in notes:
        if x not in seen:
            seen.add(x)
            uniq_notes.append(x)

    data = {
        "title": "曼弗雷德",
        "subtitle": "诗剧",
        "translator": "曹元勇 译",
        "epigraph": epigraph,
        "persons": persons,
        "setting": "，".join(setting),
        "acts": acts,
        "notes": uniq_notes,
    }
    js = (
        "/* 《曼弗雷德》全文结构化数据（曹元勇译本）。由 tools/parse_manfred.py 生成，请勿手工编辑。 */\n"
        "window.MANFRED = " + json.dumps(data, ensure_ascii=False, indent=1) + ";\n"
    )
    with open(dst, "w", encoding="utf-8") as f:
        f.write(js)
    # 简报
    ns = sum(len(a["scenes"]) for a in acts)
    sp = sum(1 for a in acts for s in a["scenes"] for c in s["content"] if c["t"] == "speech")
    di = sum(1 for a in acts for s in a["scenes"] for c in s["content"] if c["t"] == "direction")
    print(f"acts={len(acts)} scenes={ns} speeches={sp} directions={di} notes={len(uniq_notes)}")
    for a in acts:
        print(f" 第{'一二三'[a['n']-1]}幕:", [(s["n"], s["place"][:18]) for s in a["scenes"]])


if __name__ == "__main__":
    main()
