"""Compose phone screenshots into a 1080x1920 how-to video: title card, each frame with a
caption bar and a tap marker, end card. Usage: compose.py manifest.json out.mp4 "Title" """
import json, sys, os, subprocess, tempfile
from PIL import Image, ImageDraw, ImageFont

man = json.load(open(sys.argv[1])); out = sys.argv[2]; title = sys.argv[3]
W, H = 1080, 1920
GREEN = (16, 114, 56); INK = (20, 28, 22); BG = (244, 247, 244)
BOLD = "/usr/share/fonts/opentype/inter/Inter-Bold.otf"
SEMI = "/usr/share/fonts/opentype/inter/Inter-SemiBold.otf"
f_title = ImageFont.truetype(BOLD, 84); f_sub = ImageFont.truetype(SEMI, 46); f_cap = ImageFont.truetype(BOLD, 50)

def wrap(d, text, font, width):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if d.textlength(t, font=font) <= width: cur = t
        else: lines.append(cur); cur = w
    if cur: lines.append(cur)
    return lines

def card(text, sub):
    im = Image.new("RGB", (W, H), GREEN); d = ImageDraw.Draw(im)
    y = 700
    for ln in wrap(d, text, f_title, 900):
        d.text((W // 2, y), ln, font=f_title, fill="white", anchor="mm"); y += 110
    y += 30
    for ln in wrap(d, sub, f_sub, 900):
        d.text((W // 2, y), ln, font=f_sub, fill=(220, 240, 226), anchor="mm"); y += 64
    d.text((W // 2, H - 160), "stocktap.net", font=f_sub, fill="white", anchor="mm")
    return im

def frame(m):
    im = Image.new("RGB", (W, H), BG); d = ImageDraw.Draw(im)
    lines = wrap(d, m["cap"], f_cap, 960)
    bar = 70 + 66 * len(lines)
    d.rectangle([0, 0, W, bar], fill=GREEN)
    y = 40
    for ln in lines:
        d.text((W // 2, y + 30), ln, font=f_cap, fill="white", anchor="mm"); y += 66
    shot = Image.open(m["f"]).convert("RGB")  # 780 x 1688 (390x844 @2x)
    avail_h = H - bar - 30
    s = min(1000 / shot.width, avail_h / shot.height)
    sw, sh = int(shot.width * s), int(shot.height * s)
    sx, sy = (W - sw) // 2, bar + 15
    if m.get("tap"):
        sd = ImageDraw.Draw(shot, "RGBA"); x, yy = m["tap"]; r = 46
        sd.ellipse([x - r, yy - r, x + r, yy + r], fill=(255, 196, 0, 110), outline=(255, 160, 0, 255), width=8)
    im.paste(shot.resize((sw, sh), Image.LANCZOS), (sx, sy))
    return im

tmp = tempfile.mkdtemp(); items = []
def add(im, d):
    p = os.path.join(tmp, f"{len(items):03d}.png"); im.save(p); items.append((p, d))
add(card(title, man[0].get("intro", "")), 2.6)
for m in man: add(frame(m), m["d"])
add(card(sys.argv[4] if len(sys.argv) > 4 else "Count it the way it's stored", sys.argv[5] if len(sys.argv) > 5 else "Full cases in the cellar, loose ones on the bar. Free trial at stocktap.net"), 2.6)
lst = os.path.join(tmp, "list.txt")
with open(lst, "w") as fh:
    for p, d in items: fh.write(f"file '{p}'\nduration {d}\n")
    fh.write(f"file '{items[-1][0]}'\n")
subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst,
                "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
                "-movflags", "+faststart", out], check=True)
print("ok", out)
