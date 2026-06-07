#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generate index.html (HyperFrames composition) for '13 Almas Benditas'.
Self-contained: local GSAP + local fonts, no network, deterministic."""
import os

W, H = 3840, 2160
BAND = round(W / 2.39)          # 1607
BAR = (H - BAND) // 2           # 276

# ---- scene plan: (id, start, dur, builder_key, title_html, body_html, kicker) ----
S = []
t = 0.0
def add(key, dur, **kw):
    global t
    sc = dict(key=key, start=round(t, 2), dur=dur)
    sc.update(kw)
    S.append(sc)
    t = round(t + dur, 2)

add("title", 16, title="13 ALMAS BENDITAS",
    body="Sabidas e&nbsp;Entendidas", kicker="um curta documental-poético")
add("year", 12, title="São Paulo",
    body="1º de fevereiro de 1974", kicker="Fato documentado")
add("fire", 22, title="",
    body="No 12º andar do Edifício Joelma, um curto-circuito.<br>O fogo subiu mais rápido que qualquer socorro.<br><b>187 vidas.</b> Mais de 300 feridos.",
    kicker="Fato documentado")
add("ash", 12, title="",
    body="Quando o fogo se apagou,<br>restou o silêncio.", kicker="")
add("thirteen", 28, title="",
    body="Treze corpos teriam sido encontrados juntos —<br>sem nome, sepultados lado a lado.<br><i>Nunca oficialmente confirmado.</i>",
    kicker="A partir daqui, história e lenda se cruzam")
add("legend", 14, title="",
    body="Mas a história das treze almas<br>é mais antiga que o incêndio.", kicker="Tradição popular")
add("cipriano", 24, title="",
    body="Diz a lenda: a cada sete anos, treze almas voltam.<br>Mortas em catástrofes. Nem Céu, nem Inferno.<br>Restou-lhes vagar entre os vivos — para ajudar.",
    kicker="Livro de São Cipriano · não é doutrina oficial")
add("between", 12, title="",
    body="Almas santas e benditas.<br>Presas entre dois mundos.", kicker="")
add("cemetery", 16, title="",
    body="No Cemitério São Pedro,<br>treze sepulturas ficam juntas.<br>Todos os dias, alguém vem.",
    kicker="Fato — devoção documentada")
add("water", 20, title="",
    body="A quem morreu no fogo,<br>os devotos trazem água.<br>Para aplacar uma sede que ninguém pôde matar.",
    kicker="")
add("chapel", 14, title="",
    body="Ergueram uma capela.<br>As paredes se encheram de graças alcançadas.<br>A fé não pediu licença para existir.",
    kicker="")
add("silence", 12, title="",
    body="A Igreja reconhece as almas do purgatório —<br>mas nunca estas treze como milagreiras.",
    kicker="Interpretação · devoção não validada")
add("remains", 24, title="",
    body="Enfim. Não importa o que se possa provar.<br>O que estas almas guardam é uma necessidade muito antiga:<br>dar nome ao que não tem, e consolo ao que dói.",
    kicker="")
add("final", 20, title="",
    body="Em memória das 187 vítimas do<br>incêndio do Edifício Joelma — 1974.",
    kicker="História e lenda se cruzam. Onde não é fato, está assinalado.")

TOTAL = t

# ---------- HTML pieces ----------
def candles_row(n=13, lit_class="flame"):
    # row of n candles centered
    out = ['<div class="candle-row">']
    for i in range(n):
        out.append(f'<div class="candle" data-i="{i}"><div class="{lit_class}"></div>'
                   f'<div class="wick"></div></div>')
    out.append('</div>')
    return "".join(out)

def embers(n=14):
    out = ['<div class="ember-field">']
    for i in range(n):
        left = 12 + (i * 76) % 76 + (i*53)%24   # spread
        left = 8 + (i * 6.3) % 84
        out.append(f'<div class="ember" data-i="{i}" style="left:{left:.1f}%"></div>')
    out.append('</div>')
    return "".join(out)

def figures(n=13):
    out = ['<div class="figure-row">']
    for i in range(n):
        out.append(f'<div class="figure" data-i="{i}"></div>')
    out.append('</div>')
    return "".join(out)

def graves(n=13):
    out = ['<div class="grave-row">']
    for i in range(n):
        out.append(f'<div class="grave" data-i="{i}"><div class="grave-flame"></div></div>')
    out.append('</div>')
    return "".join(out)

def plaques(rows=4, cols=9):
    out = ['<div class="plaque-wall">']
    k = 0
    for r in range(rows):
        for c in range(cols):
            out.append(f'<div class="plaque" data-i="{k}"></div>')
            k += 1
    out.append('</div>')
    return "".join(out)

def stars(n=70):
    out = ['<div class="star-field">']
    # deterministic pseudo-spread
    for i in range(n):
        x = (i * 137) % 100
        y = (i * 89) % 70
        s = 2 + (i % 4)
        out.append(f'<div class="star" data-i="{i}" style="left:{x}%;top:{y}%;width:{s}px;height:{s}px"></div>')
    out.append('</div>')
    return "".join(out)

def scene_inner(sc):
    k = sc["key"]
    bg = ""
    motif = ""
    if k == "title":
        bg = '<div class="bg grad-deep"></div><div class="glow center small"></div>'
        motif = '<div class="single-candle">' + candles_row(1) + '</div>'
    elif k == "year":
        bg = '<div class="bg grad-deep"></div><div class="cityline"></div><div class="glow center faint"></div>'
    elif k == "fire":
        bg = '<div class="bg grad-fire"></div><div class="glow fire"></div>' + embers(16)
    elif k == "ash":
        bg = '<div class="bg grad-ash"></div><div class="ashfall"></div>'
    elif k == "thirteen":
        bg = '<div class="bg grad-deep"></div>'
        motif = candles_row(13)
    elif k == "legend":
        bg = '<div class="bg grad-book"></div><div class="glow center warm"></div><div class="page-lines"></div>'
    elif k == "cipriano":
        bg = '<div class="bg grad-deep"></div><div class="door"></div>' + figures(13)
    elif k == "between":
        bg = '<div class="bg grad-deep"></div>' + figures(13)
    elif k == "cemetery":
        bg = '<div class="bg grad-night"></div>' + graves(13)
    elif k == "water":
        bg = '<div class="bg grad-deep"></div><div class="ripple r1"></div><div class="ripple r2"></div><div class="ripple r3"></div><div class="drop"></div>'
    elif k == "chapel":
        bg = '<div class="bg grad-deep"></div>' + plaques(4, 9) + '<div class="glow center warm"></div>'
    elif k == "silence":
        bg = '<div class="bg grad-cold"></div><div class="window-cross"></div>'
    elif k == "remains":
        bg = '<div class="bg grad-deep"></div>' + candles_row(13) + stars(50)
    elif k == "final":
        bg = '<div class="bg grad-deep"></div>' + stars(80)
    # text block
    title = f'<div class="title">{sc["title"]}</div>' if sc.get("title") else ""
    body = f'<div class="body">{sc["body"]}</div>' if sc.get("body") else ""
    kick = f'<div class="kicker">{sc["kicker"]}</div>' if sc.get("kicker") else ""
    tx = f'<div class="textwrap {("withtitle" if sc.get("title") else "")}">{title}{body}</div>{kick}'
    return bg + motif + tx

# ---------- assemble body ----------
scenes_html = []
for i, sc in enumerate(S):
    inner = scene_inner(sc)
    scenes_html.append(
        f'<section id="sc{i}" class="scene clip" data-start="{sc["start"]}" '
        f'data-duration="{sc["dur"]}" data-track-index="{i+1}">{inner}</section>')

overlay = (
    f'<div id="overlay" class="clip" data-start="0" data-duration="{TOTAL}" data-track-index="60">'
    '<div class="grain"></div><div class="vignette"></div>'
    '<div class="bar top"></div><div class="bar bot"></div></div>')

# ---------- GSAP timeline ----------
js = ['window.__timelines = window.__timelines || {};',
      'const tl = gsap.timeline({ paused: true });',
      'gsap.ticker.lagSmoothing(0);']
for i, sc in enumerate(S):
    s, d = sc["start"], sc["dur"]
    fin = 1.3; fout = 1.3
    sid = f"#sc{i}"
    js.append(f'gsap.set("{sid}",{{opacity:0}});')
    js.append(f'tl.to("{sid}",{{opacity:1,duration:{fin},ease:"power2.out"}},{s});')
    js.append(f'tl.to("{sid}",{{opacity:0,duration:{fout},ease:"power2.in"}},{round(s+d-fout,2)});')
    js.append(f'tl.set("{sid}",{{opacity:0}},{round(s+d,2)});')
    # text reveal
    js.append(f'tl.from("{sid} .title",{{opacity:0,y:40,duration:1.4,ease:"power3.out"}},{round(s+0.3,2)});')
    js.append(f'tl.from("{sid} .body",{{opacity:0,y:30,duration:1.6,ease:"power2.out"}},{round(s+0.7,2)});')
    js.append(f'tl.from("{sid} .kicker",{{opacity:0,duration:1.2,ease:"power1.out"}},{round(s+1.0,2)});')
    k = sc["key"]
    # motif animations
    if k in ("title",):
        js.append(f'tl.fromTo("{sid} .single-candle",{{scale:0.9,opacity:0}},{{scale:1,opacity:1,duration:2,ease:"power2.out"}},{s});')
    if k == "fire":
        js.append(f'tl.fromTo("{sid} .glow.fire",{{opacity:0.15}},{{opacity:0.7,duration:1.6,ease:"sine.inOut",repeat:{int(d/1.6)},yoyo:true}},{s});')
        js.append(f'tl.fromTo("{sid} .ember",{{y:120,opacity:0}},{{y:-900,opacity:1,duration:4.5,ease:"sine.out",stagger:0.28,repeat:{max(1,int(d/4.8))}}},{s});')
    if k == "thirteen":
        # ignite one by one across ~ s+2 .. s+16
        for ci in range(13):
            at = round(s + 2 + ci*1.0, 2)
            js.append(f'tl.fromTo("{sid} .candle[data-i=\'{ci}\'] .flame",{{opacity:0,scaleY:0.2}},{{opacity:1,scaleY:1,duration:0.9,ease:"power2.out"}},{at});')
    if k in ("remains","cemetery"):
        js.append(f'tl.fromTo("{sid} .flame",{{opacity:0.0,scaleY:0.3}},{{opacity:1,scaleY:1,duration:1.4,ease:"power2.out",stagger:0.08}},{round(s+0.6,2)});')
        if k=="cemetery":
            js.append(f'tl.fromTo("{sid} .grave-flame",{{opacity:0}},{{opacity:1,duration:1.2,stagger:0.06}},{round(s+0.8,2)});')
    if k == "cipriano":
        js.append(f'tl.fromTo("{sid} .door",{{opacity:0,scaleY:0.4}},{{opacity:1,scaleY:1,duration:2.4,ease:"power2.out"}},{s});')
        js.append(f'tl.fromTo("{sid} .figure",{{opacity:0,y:30}},{{opacity:0.55,y:0,duration:1.6,ease:"power2.out",stagger:0.12}},{round(s+1.2,2)});')
    if k == "between":
        js.append(f'tl.fromTo("{sid} .figure",{{opacity:0,x:-60}},{{opacity:0.5,x:60,duration:{d},ease:"none"}},{s});')
    if k == "water":
        for ri,delay in [("r1",0),("r2",2.2),("r3",4.4)]:
            js.append(f'tl.fromTo("{sid} .ripple.{ri}",{{scale:0.1,opacity:0.8}},{{scale:3.4,opacity:0,duration:5.0,ease:"power1.out",repeat:{int(d/5)},}},{round(s+delay,2)});')
        js.append(f'tl.fromTo("{sid} .drop",{{y:-200,opacity:0}},{{y:0,opacity:1,duration:1.2,ease:"power2.in",repeat:{int(d/5)},repeatDelay:3.8}},{s});')
    if k == "chapel":
        js.append(f'tl.fromTo("{sid} .plaque",{{opacity:0,scale:0.6}},{{opacity:0.8,scale:1,duration:1.0,ease:"power2.out",stagger:0.04}},{round(s+0.5,2)});')
    if k in ("remains","final"):
        js.append(f'tl.fromTo("{sid} .star",{{opacity:0}},{{opacity:0.9,duration:2.0,ease:"power1.out",stagger:0.02}},{round(s+1.0,2)});')
        if k=="remains":
            js.append(f'tl.to("{sid} .candle-row",{{y:-160,duration:{d},ease:"power1.in"}},{s});')
    if k == "ash":
        js.append(f'tl.fromTo("{sid} .ashfall",{{opacity:0}},{{opacity:0.5,duration:2.0}},{s});')
    if k == "year":
        js.append(f'tl.fromTo("{sid} .cityline",{{opacity:0,y:20}},{{opacity:0.5,y:0,duration:2.4,ease:"power2.out"}},{s});')

js.append(f'window.__timelines["main"] = tl;')
js.append(f'tl.progress(0);')
JS = "\n      ".join(js)

# ---------- CSS ----------
CSS = r"""
@font-face{font-family:'HSerif';src:url('fonts/serif.ttf');}
@font-face{font-family:'HSerif';src:url('fonts/serif-bold.ttf');font-weight:700;}
@font-face{font-family:'HSerifIt';src:url('fonts/serif-italic.ttf');font-style:italic;}
@font-face{font-family:'HSans';src:url('fonts/sans.ttf');}
@font-face{font-family:'HSans';src:url('fonts/sans-bold.ttf');font-weight:700;}
*{margin:0;padding:0;box-sizing:border-box;}
html,body{width:3840px;height:2160px;overflow:hidden;background:#000;}
.scene{position:absolute;inset:0;width:3840px;height:2160px;overflow:hidden;}
.bg{position:absolute;inset:0;}
.grad-deep{background:radial-gradient(120% 90% at 50% 38%,#4a2670 0%,#3d2058 38%,#2d1545 78%,#1a0c2b 100%);}
.grad-night{background:radial-gradient(120% 100% at 50% 80%,#3a2056 0%,#281340 60%,#150a23 100%);}
.grad-fire{background:radial-gradient(100% 80% at 50% 100%,#7a2a10 0%,#4a1d3a 45%,#2d1545 80%,#160a26 100%);}
.grad-ash{background:radial-gradient(120% 100% at 50% 30%,#4a4458 0%,#332c44 55%,#1d1730 100%);}
.grad-book{background:radial-gradient(90% 80% at 50% 50%,#5a3a1e 0%,#3c2742 55%,#241634 100%);}
.grad-cold{background:radial-gradient(110% 90% at 50% 35%,#3a4a6a 0%,#2a2f50 55%,#161a30 100%);}

.glow{position:absolute;border-radius:50%;mix-blend-mode:screen;filter:blur(120px);}
.glow.center{left:50%;top:42%;width:1800px;height:1400px;transform:translate(-50%,-50%);
  background:radial-gradient(closest-side,rgba(240,142,35,.5),rgba(240,142,35,0));}
.glow.center.small{width:1100px;height:1000px;background:radial-gradient(closest-side,rgba(245,200,120,.45),transparent);}
.glow.center.faint{opacity:.5;}
.glow.center.warm{background:radial-gradient(closest-side,rgba(245,200,120,.4),transparent);}
.glow.fire{left:50%;bottom:-200px;width:3200px;height:1900px;transform:translateX(-50%);
  background:radial-gradient(closest-side,rgba(240,120,30,.85),rgba(214,56,56,.25),transparent);}

/* candles */
.candle-row{position:absolute;left:0;right:0;bottom:430px;display:flex;justify-content:center;gap:120px;}
.single-candle .candle-row{bottom:560px;}
.candle{position:relative;width:60px;height:240px;}
.wick{position:absolute;left:50%;bottom:0;width:46px;height:150px;transform:translateX(-50%);
  background:linear-gradient(#efe7d8,#cdbfa6);border-radius:8px;box-shadow:0 0 30px rgba(220,212,229,.3);}
.flame{position:absolute;left:50%;bottom:120px;width:120px;height:280px;transform:translateX(-50%);
  transform-origin:50% 100%;border-radius:50% 50% 50% 50%/60% 60% 40% 40%;
  background:radial-gradient(50% 60% at 50% 70%,#fff6d8 0%,#ffd27a 22%,#f08e23 55%,rgba(214,56,56,.5) 78%,transparent 100%);
  filter:blur(6px);mix-blend-mode:screen;box-shadow:0 0 120px 40px rgba(240,142,35,.55);}

/* embers */
.ember-field{position:absolute;inset:0;}
.ember{position:absolute;bottom:300px;width:14px;height:14px;border-radius:50%;
  background:radial-gradient(closest-side,#ffd27a,#f08e23,transparent);
  filter:blur(2px);mix-blend-mode:screen;box-shadow:0 0 24px 6px rgba(240,142,35,.6);}

/* ash */
.ashfall{position:absolute;inset:0;background-image:radial-gradient(2px 2px at 20% 30%,rgba(220,212,229,.5),transparent),radial-gradient(2px 2px at 60% 60%,rgba(220,212,229,.4),transparent),radial-gradient(3px 3px at 80% 20%,rgba(220,212,229,.3),transparent),radial-gradient(2px 2px at 40% 80%,rgba(220,212,229,.4),transparent);}

/* door of light + figures */
.door{position:absolute;left:50%;top:50%;width:420px;height:1400px;transform:translate(-50%,-50%);
  transform-origin:50% 50%;border-radius:200px 200px 40px 40px;
  background:linear-gradient(#fff6d8,#ffd27a 40%,#f08e23);filter:blur(40px);mix-blend-mode:screen;
  box-shadow:0 0 400px 120px rgba(245,200,120,.5);}
.figure-row{position:absolute;left:0;right:0;bottom:560px;display:flex;justify-content:center;gap:90px;}
.figure{width:120px;height:420px;border-radius:60px 60px 40px 40px;
  background:linear-gradient(rgba(220,212,229,.9),rgba(220,212,229,.15));filter:blur(10px);mix-blend-mode:screen;}

/* cemetery */
.grave-row{position:absolute;left:0;right:0;bottom:360px;display:flex;justify-content:center;gap:70px;}
.grave{position:relative;width:150px;height:230px;border-radius:75px 75px 12px 12px;
  background:linear-gradient(#2a2038,#160d24);box-shadow:inset 0 8px 20px rgba(0,0,0,.5),0 0 0 2px rgba(220,212,229,.06);}
.grave-flame{position:absolute;left:50%;top:-46px;width:34px;height:80px;transform:translateX(-50%);border-radius:50%;
  background:radial-gradient(closest-side,#fff6d8,#f08e23,transparent);filter:blur(3px);mix-blend-mode:screen;box-shadow:0 0 50px 14px rgba(240,142,35,.6);}

/* water */
.ripple{position:absolute;left:50%;top:54%;width:600px;height:600px;transform:translate(-50%,-50%);
  border-radius:50%;border:6px solid rgba(220,212,229,.7);mix-blend-mode:screen;filter:blur(2px);}
.drop{position:absolute;left:50%;top:30%;width:34px;height:48px;transform:translateX(-50%);border-radius:50% 50% 50% 50%/60% 60% 40% 40%;
  background:radial-gradient(closest-side,#fff,#dcd4e5,transparent);filter:blur(2px);mix-blend-mode:screen;box-shadow:0 0 40px 10px rgba(220,212,229,.5);}

/* chapel plaques */
.plaque-wall{position:absolute;left:50%;top:46%;transform:translate(-50%,-50%);width:2600px;
  display:flex;flex-wrap:wrap;gap:46px;justify-content:center;}
.plaque{width:230px;height:150px;border-radius:8px;background:linear-gradient(135deg,#5e3287,#2d1545);
  box-shadow:inset 0 0 30px rgba(245,200,120,.25),0 0 30px rgba(0,0,0,.3);border:2px solid rgba(245,200,120,.25);}

/* church */
.window-cross{position:absolute;left:50%;top:42%;width:520px;height:1100px;transform:translate(-50%,-50%);
  background:linear-gradient(rgba(184,212,232,.5),rgba(184,212,232,.05));border-radius:260px 260px 0 0;filter:blur(6px);mix-blend-mode:screen;}
.window-cross:before{content:"";position:absolute;left:50%;top:0;width:10px;height:100%;background:rgba(20,16,40,.6);transform:translateX(-50%);}
.window-cross:after{content:"";position:absolute;left:0;top:46%;width:100%;height:10px;background:rgba(20,16,40,.6);}

/* city / book / stars */
.cityline{position:absolute;left:0;right:0;bottom:520px;height:240px;
  background:repeating-linear-gradient(90deg,rgba(20,12,32,.9) 0 60px,rgba(40,24,60,.9) 60px 130px);
  -webkit-mask-image:linear-gradient(transparent,#000 60%);mask-image:linear-gradient(transparent,#000 60%);}
.page-lines{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:1700px;height:900px;
  background:repeating-linear-gradient(rgba(245,200,120,.12) 0 4px,transparent 4px 60px);border-radius:10px;filter:blur(1px);}
.star-field{position:absolute;inset:0;}
.star{position:absolute;border-radius:50%;background:#fff;box-shadow:0 0 10px 2px rgba(255,255,255,.5);}

/* text */
.textwrap{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:2900px;text-align:center;z-index:5;}
.textwrap.withtitle{top:46%;}
.title{font-family:'HSerif';font-weight:700;color:#f3ecf6;font-size:170px;letter-spacing:14px;
  text-shadow:0 6px 40px rgba(0,0,0,.6);line-height:1.05;}
#sc0 .title{font-size:230px;letter-spacing:26px;color:#f5ecdf;text-shadow:0 0 80px rgba(245,200,120,.4),0 8px 40px rgba(0,0,0,.6);}
.body{font-family:'HSerif';color:#e7ddf0;font-size:78px;line-height:1.5;margin-top:30px;text-shadow:0 4px 30px rgba(0,0,0,.7);}
#sc0 .body{font-family:'HSerifIt';font-style:italic;color:#dcd4e5;font-size:84px;letter-spacing:6px;margin-top:50px;}
.body b{color:#f08e23;font-weight:700;}
.body i{font-family:'HSerifIt';font-style:italic;color:#b9a9cf;font-size:64px;}
.kicker{position:absolute;left:50%;bottom:360px;transform:translateX(-50%);font-family:'HSans';
  text-transform:uppercase;letter-spacing:10px;font-size:34px;color:#c4b6d6;opacity:.9;z-index:5;
  border-top:2px solid rgba(240,142,35,.6);padding-top:24px;}

/* overlays */
#overlay{position:absolute;inset:0;pointer-events:none;}
.bar{position:absolute;left:0;right:0;height:""" + str(BAR) + r"""px;background:#000;z-index:70;}
.bar.top{top:0;}.bar.bot{bottom:0;}
.vignette{position:absolute;inset:0;z-index:65;
  background:radial-gradient(120% 100% at 50% 50%,transparent 55%,rgba(0,0,0,.55) 100%);}
.grain{position:absolute;inset:-5%;z-index:66;opacity:.10;mix-blend-mode:overlay;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");
  background-size:600px 600px;}
"""

HTML = f"""<!doctype html>
<html lang="pt-BR" data-resolution="landscape-4k">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=3840, height=2160" />
<script src="gsap.min.js"></script>
<style>{CSS}</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="{TOTAL}" data-width="3840" data-height="2160">
{''.join(scenes_html)}
{overlay}
</div>
<script>
      {JS}
</script>
</body>
</html>
"""

out = os.path.join(os.path.dirname(__file__), "index.html")
with open(out, "w", encoding="utf-8") as f:
    f.write(HTML)
print("wrote", out, "TOTAL", TOTAL, "s ; scenes", len(S))
