from common import *
import math
defs=[rad("bgA",512,420,560,[(0,"#3A2766"),(1,"#170F2E")]),
 lin("beam",0,280,0,650,[(0,"#F3D9FF",0),(1,"#FFE9B8",0.4)]),
 lin("crysA",430,0,600,0,[(0,"#E2B8FF"),(1,"#9B5BE0")]),
 lin("crysB",512,0,600,0,[(0,"#8C47D6"),(1,"#5E2AA6")]),
 lin("crysC",420,0,512,0,[(0,"#F4DBFF"),(1,"#C08AF2")]),
 rad("cglow",512,330,220,[(0,"#C58BFF",0.7),(1,"#C58BFF",0)]),
 lin("ring",300,0,724,0,[(0,"#F7D27A"),(0.5,"#FFF1C2"),(1,"#D9A441")]),
 lin("moon",0,120,0,260,[(0,"#FFF1C2"),(1,"#F1C55E")]),
]
bgb=['<rect width="1024" height="1024" fill="url(#bgA)"/>']
b=[]
# gold dust
import random; random.seed(7)
for _ in range(36):
    x=random.uniform(80,944); y=random.uniform(60,560); r=random.uniform(1.5,4)
    bgb.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{r:.1f}" fill="#F7D27A" opacity="{random.uniform(0.35,0.9):.2f}"/>')
# crescent
b.append('<path d="M232,150 A70,70 0 1,0 300,262 A56,56 0 1,1 232,150 Z" fill="url(#moon)"/>')
# light rising from the pages
bgb.append('<path d="M380,640 L450,300 L574,300 L644,640 Z" fill="url(#beam)"/>')
bgb.append('<circle cx="512" cy="330" r="220" fill="url(#cglow)"/>')
# orbit ring: back half
b.append('<path d="M312,350 A200,62 -12 0,1 712,268" stroke="url(#ring)" stroke-width="10" fill="none" opacity="0.75"/>')
# crystal (hexagonal, faceted)
b.append('<path d="M512,150 L582,240 L582,400 L512,488 L442,400 L442,240 Z" fill="url(#crysA)"/>')
b.append('<path d="M512,150 L582,240 L582,400 L512,488 Z" fill="url(#crysB)"/>')
b.append('<path d="M512,150 L442,240 L478,250 Z" fill="url(#crysC)"/><path d="M442,240 L478,250 L478,392 L442,400 Z" fill="#D7A8FF" opacity="0.8"/>')
b.append('<path d="M478,250 L512,150 L546,252 L512,262 Z" fill="#EBC9FF" opacity="0.7"/>')
b.append('<path d="M458,262 L466,380" stroke="#FFFFFF" stroke-opacity="0.75" stroke-width="7" stroke-linecap="round"/>')
# orbit ring: front half
b.append('<path d="M712,268 A200,62 -12 0,1 312,350" stroke="url(#ring)" stroke-width="12" fill="none"/>')
b.append('<circle cx="330" cy="352" r="12" fill="#FFF1C2"/><circle cx="700" cy="298" r="9" fill="#FFE3A0"/>')
# floating rune-stars
for x,y,r in [(372,200,20),(668,170,24),(760,380,15),(262,420,14),(860,250,12),(150,330,10)]:
    b.append(star4(x,y,r,"#F7D27A"))
# floating mini book (left) and potion (right) for academy feel
b.append('<g transform="translate(200,455) rotate(-14)"><rect x="-40" y="-26" width="80" height="52" rx="6" fill="#3B5BD1"/><rect x="-34" y="-20" width="68" height="40" rx="3" fill="#FFF3DC"/><rect x="-40" y="-26" width="10" height="52" fill="#2A3F9A"/><path d="M-20,-8 h36 M-20,4 h30" stroke="#C9B48A" stroke-width="4"/></g>')
b.append('<g transform="translate(828,440) rotate(10)"><path d="M-12,-46 h24 v22 c22,10 34,28 34,48 c0,26 -22,42 -46,42 c-24,0 -46,-16 -46,-42 c0,-20 12,-38 34,-48 z" fill="#E8F4FF" opacity="0.9"/><path d="M-40,18 c4,-14 16,-24 40,-26 c24,2 36,12 40,26 c-2,22 -20,40 -40,40 c-20,0 -38,-18 -40,-40 z" fill="#FF7AC6"/><circle cx="-12" cy="22" r="6" fill="#FFFFFF" opacity="0.8"/><rect x="-16" y="-58" width="32" height="14" rx="4" fill="#B8864A"/></g>')
# grimoire
b.append(book({"left":["#FFF4E0","#EADAF6","#CDB0EC","#A47FDB","#7A54C2"],"right":["#FFF4E0","#EADAF6","#CDB0EC","#A47FDB","#7A54C2"],
  "cover":"#24306E","coverDark":"#161F4F","spine":"#1E2A63","spineHi":"#F7D27A","ribbon":"#C9963B","ribbonDark":"#9C7024","shadow":0.35}))
# gilded corners on the cover
for m in (False,True):
    tf=' transform="translate(1024,0) scale(-1,1)"' if m else ""
    b.append(f'<g{tf}><path d="M126,790 L150,812 L196,818 L176,794 Z" fill="#F2C566"/><circle cx="168" cy="806" r="5" fill="#FFF1C2"/></g>')
open("arcane.svg","w").write(svg("#170F2E","".join(defs),"\n".join(bgb+b)))
open("arcane_art.svg","w").write(svg(None,"".join(defs),"\n".join(b)))
