from common import *
import math, random
defs=[rad("bgM",512,360,560,[(0,"#4A2346"),(1,"#22101F")]),
 rad("mglow",470,300,300,[(0,"#FFE9C2",0.55),(1,"#FFE9C2",0)]),
 lin("moon",380,140,560,460,[(0,"#FFF6E2"),(1,"#F2CF8E")]),
 lin("wis",0,0,0,1,[(0,"#E9D5FF"),(1,"#9B6BD6")]),
 lin("mothW",0,0,1,0,[(0,"#FFF8F0"),(1,"#F1D9DF")]),
]
bgb=['<rect width="1024" height="1024" fill="url(#bgM)"/>']
random.seed(3)
for _ in range(28):
    x=random.uniform(80,944); y=random.uniform(60,520)
    bgb.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{random.uniform(1.5,3.5):.1f}" fill="#FFF1D6" opacity="{random.uniform(0.3,0.85):.2f}"/>')
bgb.append('<circle cx="470" cy="300" r="300" fill="url(#mglow)"/>')
b=[]
# crescent moon
b.append('<path d="M520,120 A190,190 0 1,0 640,470 A160,160 0 1,1 520,120 Z" fill="url(#moon)"/>')
b.append('<path d="M410,190 C370,250 360,330 390,400" stroke="#FFFFFF" stroke-opacity="0.5" stroke-width="12" fill="none" stroke-linecap="round"/>')
for x,y,r in [(400,330,14),(430,250,9),(372,400,10)]:
    b.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="#E8C27E" opacity="0.45"/>')
# wisteria: arching stems with drooping clusters
def wisteria(m):
    tf=' transform="translate(1024,0) scale(-1,1)"' if m else ""
    g=[f'<g{tf}>','<path d="M190,610 C180,470 250,330 400,250" stroke="#5E7A4A" stroke-width="12" fill="none" stroke-linecap="round"/>']
    for sx,sy,leaf in [(205,470,-30),(250,380,-40),(320,300,-55)]:
        g.append(f'<ellipse cx="{sx+26}" cy="{sy-8}" rx="30" ry="11" fill="#6F8F55" transform="rotate({leaf} {sx+26} {sy-8})"/>')
    for cx,cy,n in [(240,400,7),(300,330,6),(360,282,5),(205,500,6)]:
        for i in range(n):
            t=i/(n-1)
            r=15*(1-t*0.55)
            x=cx+math.sin(i*1.7)*10*(1-t); y=cy+i*20
            col=["#F2E4FF","#DDC0FA","#C49BF0","#A97AE0","#9061CF","#7C51BD","#6E46A8"][i]
            g.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{r:.1f}" fill="{col}"/>')
            if i<n-2: g.append(f'<circle cx="{x-12:.0f}" cy="{y+8:.0f}" r="{r*0.7:.1f}" fill="{col}" opacity="0.9"/><circle cx="{x+12:.0f}" cy="{y+8:.0f}" r="{r*0.7:.1f}" fill="{col}" opacity="0.9"/>')
    g.append('</g>')
    return "".join(g)
b.append(wisteria(False)); b.append(wisteria(True))
# moth
b.append('<g transform="translate(690,330) rotate(12)">'
 '<path d="M0,0 C-30,-60 -110,-80 -120,-30 C-126,10 -70,20 0,8 Z" fill="url(#mothW)"/>'
 '<path d="M0,6 C-50,20 -96,46 -80,80 C-64,104 -20,70 0,20 Z" fill="#F4E2E6"/>'
 '<path d="M0,0 C30,-60 110,-80 120,-30 C126,10 70,20 0,8 Z" fill="url(#mothW)"/>'
 '<path d="M0,6 C50,20 96,46 80,80 C64,104 20,70 0,20 Z" fill="#F4E2E6"/>'
 '<circle cx="-70" cy="-34" r="14" fill="#E39AAE"/><circle cx="70" cy="-34" r="14" fill="#E39AAE"/>'
 '<circle cx="-70" cy="-34" r="6" fill="#B85C7A"/><circle cx="70" cy="-34" r="6" fill="#B85C7A"/>'
 '<path d="M-56,52 q12,-8 22,4 M56,52 q-12,-8 -22,4" stroke="#E39AAE" stroke-width="6" fill="none" stroke-linecap="round"/>'
 '<ellipse cx="0" cy="22" rx="12" ry="40" fill="#E8D2C4"/><circle cx="0" cy="-16" r="13" fill="#F6E8DC"/>'
 '<path d="M-4,-26 C-14,-50 -30,-60 -44,-60 M4,-26 C14,-50 30,-60 44,-60" stroke="#D9B7A8" stroke-width="4" fill="none" stroke-linecap="round"/>'
 '</g>')
for x,y,r in [(300,170,16),(780,180,13),(860,430,11),(170,300,10),(600,100,9)]:
    b.append(star4(x,y,r,"#FFE7B8"))
# fireflies
for x,y in [(560,520),(420,520),(820,560),(250,560)]:
    b.append(f'<circle cx="{x}" cy="{y}" r="12" fill="#FFE29A" opacity="0.25"/><circle cx="{x}" cy="{y}" r="4.5" fill="#FFF1C2"/>')
b.append(book({"left":["#FFF5F0","#F7DDE3","#ECBACB","#D892AE","#B86E92"],"right":["#FFF5F0","#F7DDE3","#ECBACB","#D892AE","#B86E92"],
  "cover":"#6B2F5E","coverDark":"#4D1F44","spine":"#5E2853","spineHi":"#F1CFA0","ribbon":"#C9A06A","ribbonDark":"#9C7848","shadow":0.35}))
# blossoms tucked on the pages
for x,y,c in [(250,640,"#F8E6FF"),(300,620,"#E7CCFB"),(770,628,"#F8E6FF"),(724,612,"#E7CCFB")]:
    b.append(f'<g transform="translate({x},{y})">'+"".join(f'<ellipse cx="{11*math.cos(a*1.2566):.1f}" cy="{11*math.sin(a*1.2566):.1f}" rx="9" ry="7" fill="{c}" transform="rotate({a*72} {11*math.cos(a*1.2566):.1f} {11*math.sin(a*1.2566):.1f})"/>' for a in range(5))+'<circle r="5" fill="#F3C96B"/></g>')
open("moonGarden.svg","w").write(svg("#22101F","".join(defs),"\n".join(bgb+b)))
open("moonGarden_art.svg","w").write(svg(None,"".join(defs),"\n".join(b)))
