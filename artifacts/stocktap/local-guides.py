#!/usr/bin/env python3
"""Add hand-written guides to the live guides index and sitemap during a source deploy.

deploy-from-source.sh refreshes public/guides/index.html and public/sitemap.xml from the live
site (the daily content engine owns them). This runs straight after that refresh and adds any
guide listed in LOCAL_GUIDES that is missing, so a deploy never drops it. Safe to run twice.
"""
import html, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
PUB = os.path.join(HERE, "public")

LOCAL_GUIDES = [
    {
        "slug": "pub-drink-measures-law-uk",
        "category": "Running the pub",
        "title": "Pub drink measures and the law: pints, 125ml wine, 25ml or 35ml spirits, and your stocktake scale",
        "excerpt": "The legal serving sizes, the small measures you have to offer, the notices you need on show, and why the scale you weigh bottles on doesn't need to be trade approved.",
        "date_iso": "2026-09-28",
        "date_text": "28 September 2026",
    },
    {
        "slug": "what-a-pub-staff-member-really-costs-2027",
        "category": "Staff and wages",
        "title": "What a member of staff really costs a pub from April 2027",
        "excerpt": "A £13.21 bar worker really costs about £16.75 an hour once holiday pay, employer NI and pension are added. What the Budget changed, and how to check your rota.",
        "date_iso": "2026-11-01",
        "date_text": "1 November 2026",
    },
    {
        "slug": "rota-app-for-pubs-uk-compared",
        "category": "Staff and wages",
        "title": "Rota apps for pubs compared (UK, prices checked 1 November 2026)",
        "excerpt": "RotaCloud, Rotaready, Deputy, Planday, Connecteam, Bizimply and ShiftComplete side by side for a pub, with what each costs for 20 staff.",
        "date_iso": "2026-11-01",
        "date_text": "1 November 2026",
    },
    {
        "slug": "rotacloud-alternative-pub",
        "category": "Staff and wages",
        "title": "RotaCloud alternative for a pub: prices checked 1 November 2026",
        "excerpt": "What RotaCloud costs a pub, what it does well, and the cheaper and free options if you only need a rota and a wage cost.",
        "date_iso": "2026-11-01",
        "date_text": "1 November 2026",
    },
    {
        "slug": "deputy-alternative-pub-uk",
        "category": "Staff and wages",
        "title": "Deputy alternative for a UK pub: prices checked 1 November 2026",
        "excerpt": "Deputy's UK prices per user, where it's strong, and when a free rota maker or another app suits a pub better.",
        "date_iso": "2026-11-01",
        "date_text": "1 November 2026",
    },
    {
        "slug": "planday-alternative-pub-uk",
        "category": "Staff and wages",
        "title": "Planday alternative for a UK pub: prices checked 1 November 2026",
        "excerpt": "Planday's UK plans and minimums, what you get, and the free and cheaper options for a small pub.",
        "date_iso": "2026-11-01",
        "date_text": "1 November 2026",
    },
    {
        "slug": "free-rota-app-pub",
        "category": "Staff and wages",
        "title": "Free rota app for a pub: free rota maker, templates and free plans",
        "excerpt": "The genuinely free ways to do a pub rota, what the free plans leave out, and a free rota maker that shows each day's staff cost.",
        "date_iso": "2026-11-01",
        "date_text": "1 November 2026",
    },
]

# Other hand-made static pages that must stay in the sitemap (the sitemap is refreshed from live).
EXTRA_PAGES = [
    ("/problems/", "2026-09-29", "0.8"),
    ("/problems/what-to-order", "2026-09-29", "0.8"),
    ("/problems/stocktake-down", "2026-09-29", "0.8"),
    ("/problems/busy-weekends", "2026-09-29", "0.8"),
    ("/problems/checking-deliveries", "2026-09-29", "0.8"),
    ("/problems/postmix", "2026-09-29", "0.8"),
    ("/problems/venners-audit", "2026-09-29", "0.8"),
    ("/videos", "2026-09-29", "0.7"),
    ("/tools/pub-staff-hour-calculator", "2026-11-01", "0.8"),
    ("/tools/free-pub-rota-maker", "2026-11-01", "0.8"),
]


def main():
    idx_path = os.path.join(PUB, "guides", "index.html")
    map_path = os.path.join(PUB, "sitemap.xml")
    idx = open(idx_path, encoding="utf-8").read()
    smap = open(map_path, encoding="utf-8").read()
    for g in LOCAL_GUIDES:
        page = os.path.join(PUB, "guides", g["slug"] + ".html")
        if not os.path.exists(page):
            sys.exit(f"local-guides: missing page {page}")
        href = f'href="/guides/{g["slug"]}"'
        if href not in idx:
            card = (
                f'<a {href} class="article-card">\n'
                f'          <div class="card-category">{html.escape(g["category"])}</div>\n'
                f'          <div class="card-title">{html.escape(g["title"])}</div>\n'
                f'          <p class="card-excerpt">{html.escape(g["excerpt"])}</p>\n'
                f'          <div class="card-meta"><span>Shaun McManus</span><span>{g["date_text"]}</span></div>\n'
                f'        </a>\n        '
            )
            m = re.search(r'<div class="article-list">\s*', idx)
            if not m:
                sys.exit("local-guides: article list not found in guides index")
            idx = idx[: m.end()] + card + idx[m.end():]
            print("local-guides: added to index", g["slug"])
        loc = f'<loc>https://stocktap.net/guides/{g["slug"]}</loc>'
        if loc not in smap:
            entry = (
                f'  <url>\n    {loc}\n    <lastmod>{g["date_iso"]}</lastmod>\n'
                f'    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>\n'
            )
            smap = smap.replace("</urlset>", entry + "</urlset>")
            print("local-guides: added to sitemap", g["slug"])
    for path, day, prio in EXTRA_PAGES:
        loc = f"<loc>https://stocktap.net{path}</loc>"
        if loc not in smap:
            entry = (
                f"  <url>\n    {loc}\n    <lastmod>{day}</lastmod>\n"
                f"    <changefreq>monthly</changefreq>\n    <priority>{prio}</priority>\n  </url>\n"
            )
            smap = smap.replace("</urlset>", entry + "</urlset>")
            print("local-guides: added to sitemap", path)
    open(idx_path, "w", encoding="utf-8").write(idx)
    open(map_path, "w", encoding="utf-8").write(smap)


if __name__ == "__main__":
    main()
