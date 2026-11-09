"""Generate the static problem landing pages: public/problems/<slug>.html and public/problems/index.html."""
import html, json, os, sys

OUT = sys.argv[1] if len(sys.argv) > 1 else "/home/claude/web/public"
DATE = "2026-09-29"

PAGES = [
    {
        "slug": "what-to-order",
        "title": "I never know what to order",
        "h1": "Stop guessing the order.",
        "meta": "StockTap tells you what to order from your own counts and par levels, or from your Venners audit if you use one. Copy it to your rep in seconds. Free for 14 days.",
        "lead": "Sunday night, order due in the morning, and you're stood in the cellar trying to remember what went last week. StockTap works it out from what you've actually got.",
        "video": "stock-and-orders",
        "video_name": "Stock & Orders: the order list",
        "how": [
            ("Set a par level once", "How much of each line you want on the shelf. After every count, StockTap lists what's below par, grouped by supplier, with the cost."),
            ("Send it in seconds", "Copy the order into a text or email to your rep, or download it as a spreadsheet."),
            ("Use Venners? It goes further", "Drop in your Venners audit and StockTap builds the order from what you actually sold, less what's left, plus the deliveries you've added since."),
            ("It orders in the way you buy", "Kegs, casks, cases of 12, boxes of postmix, single bottles. Not millilitres you then have to convert."),
            ("You stay in charge", "Tap + or − on any line before you send it. StockTap keeps showing what it suggested."),
        ],
        "need": "Your StockTap count and a par level for each line. If you use Venners, add their audit PDF for the fuller order list shown in the video.",
    },
    {
        "slug": "stocktake-down",
        "title": "My stocktake says I'm down",
        "h1": "Find out where the loss actually is.",
        "meta": "Weigh open bottles to the gram, spot check them the next day against the till, and see the gap in measures and pounds. Free for 14 days.",
        "lead": "A figure at the bottom of the report tells you you're down. It doesn't tell you which line, which day, or whether it's a real loss or a button on the till. StockTap helps you find out.",
        "video": "weighing-spot-check",
        "video_name": "Weighing and the next-day spot check",
        "how": [
            ("Weigh, don't guess", "Put the open bottle on a kitchen scale and type the grams. StockTap gives you the millilitres left, the measures and the value, to the gram. Tenths by eye can't see a few measures."),
            ("Spot check the next day", "Weigh the lines that move again, put in what the till rang, and StockTap shows the measures poured but not rung, in pounds."),
            ("Catch it this week, not at month end", "A few bottles a shift takes a couple of minutes, so drift gets caught while you can still do something about it."),
            ("Never blames a person", "StockTap shows lines, shifts and numbers. What you do with it is up to you."),
            ("Use Venners? See where the result came from", "Drop in their audit for up and down by category, the biggest losses and gains by line, and likely till-button mix-ups."),
        ],
        "need": "Your phone and any kitchen scale that reads grams. A Venners audit PDF if you have one.",
    },
    {
        "slug": "busy-weekends",
        "title": "Busy weekends catch me short",
        "h1": "Order for the busy weekend, not an average one.",
        "meta": "Tell StockTap how many days the order needs to last and how much busier it'll be, or base it on a past period like Christmas. Free for 14 days.",
        "lead": "A normal week's order won't get you through a bank holiday, a big match or December. StockTap lets you plan for the week you're actually about to have.",
        "video": "orders-promo",
        "video_name": "Ordering for busy periods",
        "how": [
            ("Choose how long the order has to last", "Slide from 3 to 28 days. The order grows to cover it."),
            ("Say how busy it'll be", "Normal, +10%, +25% or +50%. Every line scales with it."),
            ("Or copy a real busy period", "Add your older audits and StockTap shows your takings per day for each one. Tap Christmas, or your busiest spell, and the order is built on what you actually sold then."),
            ("It learns your pattern", "Each line shows a small chart of how it sold across your audits, so you can see what spikes and what doesn't."),
            ("Still your call", "Change any line with + and − before you send it."),
        ],
        "need": "Today this uses your Venners audits: the latest one, plus older ones for the pattern. Not with Venners? Raise your par levels for the week and the order guide follows.",
    },
    {
        "slug": "checking-deliveries",
        "title": "Deliveries take ages to check",
        "h1": "Paste the delivery in. Don't type it.",
        "meta": "Copy your supplier's delivery email and paste it into StockTap. Every line is read and matched to your products, in kegs, cases and boxes. Free for 14 days.",
        "lead": "Fifty lines on a delivery email, and every one has to go into stock by hand. StockTap reads the email for you.",
        "video": "paste-delivery",
        "video_name": "Paste a delivery email",
        "how": [
            ("Copy the whole email, paste it in", "Select all, copy, paste. StockTap picks out the supplier, date, order numbers and every line."),
            ("Lines matched to your products", "Different names on the delivery? StockTap matches them, remembers the supplier code, and asks you only about the ones it isn't sure of."),
            ("New lines added in one tap", "Something not in your library yet? Add it from the delivery with its size and pack already filled in."),
            ("The right units", "Kegs, casks, cases of 24, boxes of postmix, each counted the way it's delivered."),
            ("Never added twice", "Paste the same email again and StockTap shows which lines are already in."),
        ],
        "need": "The delivery email from your supplier. On Premium you can also photograph a paper delivery note.",
    },
    {
        "slug": "postmix",
        "title": "Postmix never adds up",
        "h1": "Postmix that matches what you actually use.",
        "meta": "Count postmix in litres of drink, the same as a stocktaker, or in boxes. Set your box size and yield once and StockTap handles the rest. Free for 14 days.",
        "lead": "Your stocktaker counts postmix in litres of drink. Your supplier sells it in boxes of syrup. Mix the two up and the order is miles out. StockTap keeps them straight.",
        "video": "keg-box-sizes",
        "video_name": "Keg and postmix box sizes",
        "how": [
            ("Count it either way", "Type litres of drink, like your stocktaker, or tap Boxes and type 1.4. StockTap shows both."),
            ("Set your box size once", "7, 10, 12 or 20 litres, or type your own."),
            ("Set the yield", "Standard boxes make about six times their size in drink, high-yield boxes about seven. Pick yours once per line."),
            ("Orders in boxes", "The order list tells you how many boxes to get, worked out from what you actually pour."),
        ],
        "need": "Your postmix box size and whether it's standard or high yield (it's usually on the box or the delivery note).",
    },
    {
        "slug": "venners-audit",
        "title": "Got a Venners audit?",
        "h1": "Your Venners audit, in plain English.",
        "meta": "Drop your Venners wet stock audit PDF into StockTap. It reads every line and shows your result, what's up and down, and what to order next. Free for 14 days.",
        "lead": "The audit has everything in it, spread over pages of columns. StockTap reads the PDF and shows you what it means for your bar.",
        "video": "stock-and-orders",
        "video_name": "Reading a Venners audit",
        "how": [
            ("Drop the PDF in", "The same file Venners emails you. StockTap reads every line and checks each one adds up."),
            ("Your result at a glance", "Result, gross profit against optimum, closing stock and takings per day on one screen."),
            ("Up and down, by category and by line", "See which categories moved, the biggest losses and gains, and any likely till-button mix-ups."),
            ("Every line, searchable", "Opening, delivered, sold, should be and counted for each product. Search for any line."),
            ("Then it builds your order", "From the same audit, plus the deliveries you've added since."),
        ],
        "need": "Your Venners wet stock audit PDF. StockTap reads Venners audits today; other stocktakers' reports aren't supported yet.",
        "free_check": True,
    },
]

CSS = """*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Space Grotesk",system-ui,sans-serif;background:#111316;color:#F3F1EC;line-height:1.55}
header{max-width:1040px;margin:0 auto;padding:20px 24px;display:flex;align-items:center;justify-content:space-between;gap:12px}
.brand{display:flex;align-items:center;gap:8px;font-weight:700;color:#F3F1EC;text-decoration:none}
.brand span{width:28px;height:28px;border-radius:6px;background:#E0A343;display:inline-block}
nav a{color:#8A9099;text-decoration:none;margin-left:16px;font-size:14px} nav a:hover{color:#F3F1EC}
main{max-width:1040px;margin:0 auto;padding:8px 24px 64px}
.kicker{display:inline-block;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#E0A343;background:rgba(224,163,67,.1);border:1px solid rgba(224,163,67,.25);border-radius:999px;padding:4px 12px;margin:12px 0 14px}
h1{font-size:clamp(30px,5vw,44px);line-height:1.1;margin-bottom:14px}
.lead{color:#B9BEC6;font-size:18px;max-width:640px;margin-bottom:24px}
.hero{display:grid;grid-template-columns:1fr 300px;gap:40px;align-items:start}
.phone{border:6px solid #2A2E34;border-radius:34px;overflow:hidden;background:#000;box-shadow:0 30px 80px -20px rgba(224,163,67,.35)}
.phone video{display:block;width:100%;aspect-ratio:9/16;background:#000}
.btn{display:inline-block;background:#E0A343;color:#111316;font-weight:700;padding:14px 24px;border-radius:8px;text-decoration:none}
.btn2{display:inline-block;color:#F3F1EC;border:1px solid #2A2E34;font-weight:600;padding:13px 20px;border-radius:8px;text-decoration:none;margin-left:8px}
.note{font-size:13px;color:#8A9099;margin-top:12px}
h2{font-size:24px;margin:44px 0 16px}
.steps{display:grid;gap:12px;max-width:720px}
.step{background:#1A1D21;border:1px solid #2A2E34;border-radius:12px;padding:16px 18px}
.step b{display:block;margin-bottom:4px}
.step p{color:#8A9099;font-size:15px}
.need{max-width:720px;border:1px solid rgba(63,174,116,.3);background:rgba(63,174,116,.06);border-radius:12px;padding:16px 18px;color:#D6DAD0}
.more{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}
.more a{display:block;background:#1A1D21;border:1px solid #2A2E34;border-radius:12px;padding:14px 16px;color:#F3F1EC;text-decoration:none;font-weight:600}
.more a:hover{border-color:rgba(224,163,67,.5)}
.cta{margin-top:44px;border:1px solid #2A2E34;border-radius:14px;padding:28px;text-align:center;background:#1A1D21}
.author{margin-top:28px;font-size:13px;color:#8A9099}
footer{border-top:1px solid #2A2E34;padding:20px 24px;text-align:center;font-size:12px;color:#8A9099} footer a{color:#8A9099;margin:0 8px}
@media (max-width:760px){.hero{grid-template-columns:1fr}.phone{max-width:260px;margin:8px auto 0}.btn2{margin:10px 0 0}.lead{font-size:16px}}
"""

HEAD = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{title} | StockTap</title>
  <meta name="description" content="{meta}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="https://stocktap.net{path}" />
  <meta property="og:title" content="{title}" />
  <meta property="og:description" content="{meta}" />
  <meta property="og:url" content="https://stocktap.net{path}" />
  <meta property="og:type" content="website" />
  <meta property="og:image" content="https://stocktap.net/opengraph.jpg" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
  {jsonld}
  <style>{css}</style>
</head>
<body>
  <header><a class="brand" href="/"><span></span>StockTap</a><nav><a href="/problems/">Problems we fix</a><a href="/videos/">Videos</a><a href="/guides/">Guides</a><a href="/auth">Sign in</a></nav></header>
  <main>
"""

FOOT = """  </main>
  <footer><a href="/">Home</a><a href="/problems/">Problems we fix</a><a href="/videos/">How-to videos</a><a href="/guides/">Guides</a><a href="/tools/">Free tools</a><a href="mailto:hello@stocktap.net">hello@stocktap.net</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a></footer>
</body>
</html>
"""

CTA_NOTE = "14 days of Pro free, no card. Cancel any time."


def e(s):
    return html.escape(s, quote=True)


def page(p):
    path = f"/problems/{p['slug']}"
    vid = f"/media/stocktap-{p['video']}.mp4"
    frag = f"#t={p['video_start']}" if p.get("video_start") else ""
    jsonld = {
        "@context": "https://schema.org",
        "@graph": [
            {"@type": "WebPage", "name": p["title"], "url": "https://stocktap.net" + path, "description": p["meta"],
             "author": {"@type": "Person", "name": "Shaun McManus", "jobTitle": "Licensee, Washington, Tyne & Wear"}},
            {"@type": "VideoObject", "name": p["video_name"], "description": p["meta"],
             "thumbnailUrl": f"https://stocktap.net/media/poster-{p['video']}.jpg",
             "contentUrl": "https://stocktap.net" + vid, "uploadDate": DATE + "T09:00:00+01:00"},
            {"@type": "HowTo", "name": p["h1"], "step": [{"@type": "HowToStep", "name": t, "text": d} for t, d in p["how"]]},
        ],
    }
    out = HEAD.format(title=e(p["title"]), meta=e(p["meta"]), path=path, css=CSS,
                      jsonld=f'<script type="application/ld+json">{json.dumps(jsonld)}</script>')
    free = ('<div class="need" style="margin-top:28px;border-color:rgba(224,163,67,.45);background:rgba(224,163,67,.08)"><b>Try it now, free, no sign-up:</b> '
            '<a href="/free-audit-check" style="color:#E0A343;font-weight:700">check your Venners audit in 30 seconds →</a> It\'s read on your own device and nothing is uploaded.</div>\n    ') if p.get("free_check") else ""
    out += f"""    <div class="hero">
      <div>
        <span class="kicker">{e(p['title'])}</span>
        <h1>{e(p['h1'])}</h1>
        <p class="lead">{e(p['lead'])}</p>
        <a class="btn" href="/auth?mode=signup" data-cta="problem-{p['slug']}-top">Start free</a><a class="btn2" href="/#tour">Watch the tour</a>
        <p class="note">{CTA_NOTE}</p>
      </div>
      <div class="phone"><video controls playsinline preload="metadata" poster="/media/poster-{p['video']}.jpg" src="{vid}{frag}" aria-label="{e(p['video_name'])}"></video></div>
    </div>
    {free}<h2>How StockTap sorts it</h2>
    <div class="steps">
"""
    for t, d in p["how"]:
        out += f'      <div class="step"><b>{e(t)}</b><p>{e(d)}</p></div>\n'
    out += f"""    </div>
    <h2>What you need</h2>
    <div class="need">{e(p['need'])}</div>
    <div class="cta">
      <h2 style="margin:0 0 6px">Try it on your own bar</h2>
      <p style="color:#8A9099">{CTA_NOTE} Your phone is all you need to start.</p>
      <a class="btn" style="margin-top:14px" href="/auth?mode=signup" data-cta="problem-{p['slug']}-bottom">Start free</a>
    </div>
    <h2>Other things StockTap sorts</h2>
    <div class="more">
"""
    for q in PAGES:
        if q["slug"] != p["slug"]:
            out += f'      <a href="/problems/{q["slug"]}">{e(q["title"])} →</a>\n'
    out += """    </div>
    <p class="author">Written by Shaun McManus, licensee in Washington, Tyne &amp; Wear, who built StockTap to run behind his own bar.</p>
"""
    return out + FOOT


def index():
    meta = "The everyday stock problems StockTap fixes for pubs and bars: what to order, stocktake losses, busy weekends, deliveries and postmix, plus Venners audits if you use them."
    out = HEAD.format(title="Problems StockTap fixes", meta=e(meta), path="/problems/", css=CSS, jsonld="")
    out += """    <span class="kicker">Problems we fix</span>
    <h1>Pick the one that sounds like your week.</h1>
    <p class="lead">Each one has a short video of StockTap sorting it, using real screens from the app.</p>
    <div class="more">
"""
    for q in PAGES:
        out += f'      <a href="/problems/{q["slug"]}">{e(q["title"])} →</a>\n'
    out += f"""    </div>
    <div class="cta">
      <h2 style="margin:0 0 6px">Try it on your own bar</h2>
      <p style="color:#8A9099">{CTA_NOTE}</p>
      <a class="btn" style="margin-top:14px" href="/auth?mode=signup" data-cta="problems-index">Start free</a>
    </div>
"""
    return out + FOOT


os.makedirs(os.path.join(OUT, "problems"), exist_ok=True)
for p in PAGES:
    open(os.path.join(OUT, "problems", p["slug"] + ".html"), "w").write(page(p))
open(os.path.join(OUT, "problems", "index.html"), "w").write(index())
print("wrote", len(PAGES) + 1, "pages to", OUT)
