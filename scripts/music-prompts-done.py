"""Move prompt blocks for tracks already in the game into the collapsible section at the bottom.
usage: python3 mdone.py "Title One" "Title Two" ...   (run from the repo root)"""
import re, sys
P = "docs/music-prompts-ready.md"
MARK = "# Already in the game"
OPEN = "<details>"
src = open(P).read()
top, _, done_raw = src.partition("\n" + MARK + "\n")
titles = set(sys.argv[1:])

def parse(text):
    """-> (preamble, [ [h1, h1_pre, [ [h2, h2_pre, [(h3, body)]] ]] ])"""
    lines = text.split("\n"); pre = []; groups = []; cur = None; sec = None; blk = None; fence = False
    for l in lines:
        if l.startswith("```"): fence = not fence
        if not fence and l.startswith("# "):
            cur = [l[2:], [], []]; groups.append(cur); sec = None; blk = None
        elif not fence and l.startswith("## ") and cur is not None:
            sec = [l[3:], [], []]; cur[2].append(sec); blk = None
        elif not fence and l.startswith("### ") and sec is not None:
            blk = [l[4:], []]; sec[2].append(blk)
        elif blk is not None: blk[1].append(l)
        elif sec is not None: sec[1].append(l)
        elif cur is not None: cur[1].append(l)
        else: pre.append(l)
    return pre, groups

def title_of(h3): return re.match(r"(.+?) \(", h3).group(1)
def strip(ls): 
    s = "\n".join(ls).strip("\n"); return s

pre, groups = parse(top)
# existing done section: its body sits inside <details>; headings are the same shape
done_raw = done_raw[done_raw.find("<details>"):] if "<details>" in done_raw else ""
done_body = re.sub(r"</?details>|<summary>.*?</summary>", "", done_raw, flags=re.S)
_, done_groups = parse("# done" + chr(10) + done_body)
done = {}  # h2 -> [h2_pre, [(h3, body)]]
order = []
for g in done_groups:
    for h2, h2pre, blocks in g[2]:
        done[h2] = [h2pre, list(blocks)]; order.append(h2)
moved = 0
for g in groups:
    g.append(bool(g[2]))  # had sections before anything moved
    for sec in g[2]:
        keep = []
        for h3, body in sec[2]:
            if title_of(h3) in titles:
                if sec[0] not in done: done[sec[0]] = [list(sec[1]), []]; order.append(sec[0])
                done[sec[0]][1].append([h3, body]); moved += 1
            else: keep.append([h3, body])
        sec[2] = keep
out = [strip(pre), ""]
for h1, h1pre, secs, had in groups:
    secs = [s for s in secs if s[2]]
    if had and not secs: continue
    out += ["# " + h1, ""]
    if strip(h1pre): out += [strip(h1pre), ""]
    for h2, h2pre, blocks in secs:
        out += ["## " + h2, ""]
        if strip(h2pre): out += [strip(h2pre), ""]
        for h3, body in blocks: out += ["### " + h3, "", strip(body), ""]
n = sum(len(v[1]) for v in done.values())
out += [MARK, "", f"These {n} tracks are done: generated, renamed to the title shown and slotted. Their prompts are kept here for reference.", "", OPEN, f"<summary>Show the {n} prompts already used</summary>", ""]
for h2 in order:
    h2pre, blocks = done[h2]
    out += ["## " + h2, ""]
    if strip(h2pre): out += [strip(h2pre), ""]
    for h3, body in blocks: out += ["### " + h3, "", strip(body), ""]
out += ["</details>", ""]
open(P, "w").write("\n".join(out))
print("moved", moved, "done total", n)
