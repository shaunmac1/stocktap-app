"""Turn the two phone recordings from film-staff.cjs into one 1080x1920 captioned video.
Usage: assemble-film.py /tmp/film-staff out.mp4 "Title" "Sub" "End title" "End sub" """
import json, sys, os, subprocess
from PIL import Image, ImageDraw, ImageFont
d, out, title, sub, etitle, esub = sys.argv[1:7]
m = json.load(open(os.path.join(d, 'marks.json')))
W, H, BAR = 1080, 1920, 230
GREEN = (16, 114, 56); BG = (244, 247, 244)
BOLD = "/usr/share/fonts/opentype/inter/Inter-Bold.otf"; SEMI = "/usr/share/fonts/opentype/inter/Inter-SemiBold.otf"
f_cap = ImageFont.truetype(BOLD, 50); f_title = ImageFont.truetype(BOLD, 84); f_sub = ImageFont.truetype(SEMI, 46); f_tag = ImageFont.truetype(SEMI, 34)
def wrap(dr, text, font, width):
    lines, cur = [], ""
    for w in text.split():
        t = (cur + " " + w).strip()
        if dr.textlength(t, font=font) <= width: cur = t
        else: lines.append(cur); cur = w
    if cur: lines.append(cur)
    return lines
def cap(text, tag, path):
    im = Image.new("RGB", (W, BAR), GREEN); dr = ImageDraw.Draw(im)
    dr.text((W // 2, 44), tag, font=f_tag, fill=(200, 232, 210), anchor="mm")
    lines = wrap(dr, text, f_cap, 980); y = 118 if len(lines) > 1 else 148
    for ln in lines[:2]: dr.text((W // 2, y), ln, font=f_cap, fill="white", anchor="mm"); y += 62
    im.save(path)
def card(text, s, path):
    im = Image.new("RGB", (W, H), GREEN); dr = ImageDraw.Draw(im); y = 720
    for ln in wrap(dr, text, f_title, 920): dr.text((W // 2, y), ln, font=f_title, fill="white", anchor="mm"); y += 110
    y += 30
    for ln in wrap(dr, s, f_sub, 900): dr.text((W // 2, y), ln, font=f_sub, fill=(220, 240, 226), anchor="mm"); y += 64
    dr.text((W // 2, H - 160), "stocktap.net", font=f_sub, fill="white", anchor="mm"); im.save(path)
def seg(vid, length, marks, tag, start, name):
    caps = []
    for i, mk in enumerate(marks):
        p = os.path.join(d, f"{name}-cap{i}.png"); cap(mk["label"], tag, p)
        t0 = 0 if i == 0 else mk["t"] - start; t1 = (marks[i + 1]["t"] - start) if i + 1 < len(marks) else length
        caps.append((p, max(0, t0), t1))
    vh = H - BAR - 20; vw = int(vh * 390 / 844)
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-ss", str(start), "-i", vid]
    for p, _, _ in caps: cmd += ["-i", p]
    fc = f"color=c=0x{BG[0]:02x}{BG[1]:02x}{BG[2]:02x}:s={W}x{H}:r=30[bg];[0:v]fps=30,crop=iw/2:ih/2:0:0,scale={vw}:{vh}:flags=lanczos[v];[bg][v]overlay={(W - vw) // 2}:{BAR + 10}:shortest=1[b0]"
    for i, (_, t0, t1) in enumerate(caps):
        fc += f";[b{i}][{i + 1}:v]overlay=0:0:enable='between(t,{t0:.2f},{t1:.2f})'[b{i + 1}]"
    o = os.path.join(d, name + ".mp4")
    subprocess.run(cmd + ["-filter_complex", fc, "-map", f"[b{len(caps)}]", "-t", str(length - start), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-r", "30", o], check=True)
    return o
def still(path, secs, name):
    o = os.path.join(d, name + ".mp4")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-t", str(secs), "-i", path, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-r", "30", o], check=True); return o
card(title, sub, os.path.join(d, "t.png")); card(etitle, esub, os.path.join(d, "e.png"))
first = m["marks"][0]["t"] - 1.2
ps, pe = m["pauseStart"], m["pauseEnd"]
before = [x for x in m["marks"] if x["t"] < ps]; after = [x for x in m["marks"] if x["t"] >= pe - 0.5]
parts = [still(os.path.join(d, "t.png"), 2.8, "p0"),
         seg(m["staffVid"], ps, before, "What your staff see", max(0, first), "p1"),
         seg(m["midVid"], m["midLen"], [{"t": m["midStart"], "label": "Meanwhile on your phone: who is counting, and what so far"}], "What you see", m["midStart"], "p2"),
         seg(m["staffVid"], m["staffLen"], after, "What your staff see", pe, "p3"),
         seg(m["ownerVid"], m["ownerLen"], [{"t": 2.5, "label": "Sent in. Open it and the figures are there"}], "What you see", 2.5, "p4"),
         still(os.path.join(d, "e.png"), 3.0, "p5")]
lst = os.path.join(d, "parts.txt"); open(lst, "w").write("".join(f"file '{p}'\n" for p in parts))
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", "-movflags", "+faststart", out], check=True)
print(out)
