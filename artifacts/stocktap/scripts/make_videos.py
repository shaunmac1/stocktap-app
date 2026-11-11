"""Generate public/videos/index.html from src/lib/help-videos.ts (the same list the in-app How to button uses)."""
import html, json, re, sys
import os
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "src", "lib", "help-videos.ts")
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "public", "videos", "index.html")
ts = open(SRC).read()
vids = [dict(zip(("id", "group", "title", "blurb"), m)) for m in re.findall(r'\{ id: "([^"]+)", group: "([^"]+)", title: "([^"]+)", blurb: "([^"]+)" \}', ts)]
OLD = []  # all refilmed in the demo bar
e = lambda s: html.escape(s, quote=True)
groups = []
for v in vids:
    if v["group"] not in groups: groups.append(v["group"])
n = len(vids) + len(OLD)
items = [{"@type": "ListItem", "position": i + 1, "item": {"@type": "VideoObject", "name": v["title"], "description": v["blurb"],
          "thumbnailUrl": f"https://stocktap.net/media/help/{v['id']}.jpg", "contentUrl": f"https://stocktap.net/media/help/{v['id']}.mp4", "uploadDate": "2026-09-29T09:00:00+01:00"}} for i, v in enumerate(vids)]
css = open(os.path.join(HERE, "videos_css.txt")).read()
out = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>How to use StockTap: {n} short videos | StockTap</title>
  <meta name="description" content="Short videos of every part of StockTap on a real phone: adding your lines, weighing, stocktakes, spot checks, deliveries, ordering, reports, checks, team and rota." />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="https://stocktap.net/videos" />
  <meta property="og:title" content="How to use StockTap: {n} short videos" />
  <meta property="og:description" content="Every screen, shown step by step on a phone." />
  <meta property="og:url" content="https://stocktap.net/videos" />
  <meta property="og:type" content="website" />
  <meta property="og:image" content="https://stocktap.net/opengraph.jpg" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <script type="application/ld+json">{json.dumps({"@context": "https://schema.org", "@type": "ItemList", "name": "How to use StockTap", "itemListElement": items})}</script>
  <style>{css}
    .jump{{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 8px}} .jump a{{font-size:13px;color:#F3F1EC;border:1px solid #2A2E34;border-radius:999px;padding:6px 12px;text-decoration:none}}
  </style>
</head>
<body>
  <header><a class="brand" href="/"><span></span>StockTap</a><nav><a href="/problems/">Problems we fix</a><a href="/guides/">Guides</a><a href="/help">Help</a><a href="/auth">Sign in</a></nav></header>
  <main>
    <h1>How to use StockTap</h1>
    <p class="lead">{n} short videos of every screen, step by step on a phone, with things being added as you watch. The same videos are behind the “How to” button in the app.</p>
    <div class="jump">{''.join(f'<a href="#{re.sub("[^a-z]+", "-", g.lower())}">{e(g)}</a>' for g in groups)}<a href="#more">More</a></div>
"""
for g in groups:
    out += f'    <h2 class="group" id="{re.sub("[^a-z]+", "-", g.lower())}">{e(g)}</h2>\n    <div class="grid">\n'
    for v in [v for v in vids if v["group"] == g]:
        out += f'''      <article class="card" id="{v['id']}">
        <video controls playsinline preload="none" poster="/media/help/{v['id']}.jpg" src="/media/help/{v['id']}.mp4" aria-label="{e(v['title'])}"></video>
        <div class="body"><h3>{e(v['title'])}</h3><p>{e(v['blurb'])}</p></div>
      </article>
'''
    out += "    </div>\n"
if OLD: out += '    <h2 class="group" id="more">More</h2>\n    <div class="grid">\n'
for k, t, d in OLD:
    out += f'''      <article class="card" id="{k}">
        <video controls playsinline preload="none" poster="/media/poster-{k}.jpg" src="/media/stocktap-{k}.mp4" aria-label="{e(t)}"></video>
        <div class="body"><h3>{e(t)}</h3><p>{e(d)}</p></div>
      </article>
'''
out += ("    </div>\n" if OLD else "") + """    <div class="cta">
      <h2 style="font-size:22px">Try it on your own bar</h2>
      <p style="color:#8A9099">14 days of Pro free, no card. Your phone is all you need to start.</p>
      <a class="btn" href="/auth?mode=signup">Start free</a>
    </div>
  </main>
  <footer><a href="/">Home</a><a href="/problems/">Problems we fix</a><a href="/guides/">Guides</a><a href="/tools/">Free tools</a><a href="/help">Help</a><a href="mailto:hello@stocktap.net">hello@stocktap.net</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a></footer>
</body>
</html>
"""
open(OUT, "w").write(out)
print("videos page:", n, "videos,", len(groups), "groups")
