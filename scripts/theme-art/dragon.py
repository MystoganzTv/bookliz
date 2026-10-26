from common import *
defs=[rad("bgGlow",512,380,520,[(0,"#235C4E"),(1,"#0E2C27")]),
 rad("skin",470,280,260,[(0,"#5FD394"),(0.6,"#2FA36B"),(1,"#1C7350")],fx=450,fy=250),
 lin("neck",0,430,0,620,[(0,"#2A9963"),(1,"#1A6B4A")]),
 rad("muzzle",512,380,130,[(0,"#9BEBBE"),(1,"#5CC98F")]),
 lin("belly",0,440,0,620,[(0,"#C8F2A6"),(1,"#93D57E")]),
 lin("wing",0,250,0,600,[(0,"#F2A866"),(1,"#B85F32")]),
 lin("horn",0,140,0,250,[(0,"#FFF5DA"),(1,"#E1C48F")]),
 lin("fin",0,250,0,360,[(0,"#F0A064"),(1,"#B65A30")]),
 rad("iris",0,0,34,[(0,"#FFE07A"),(0.7,"#F5A623"),(1,"#C9771A")]),
 lin("coin",0,600,0,660,[(0,"#FFE07A"),(1,"#E0A21F")]),
 rad("ember",0,0,1,[(0,"#FFD36B",1),(1,"#FF8A3D",0)]),
]
bgb=['<rect width="1024" height="1024" fill="url(#bgGlow)"/>']
def wing(m):
    tf=' transform="translate(1024,0) scale(-1,1)"' if m else ""
    return (f'<g{tf}>'
      '<path d="M432,540 C380,470 300,360 236,286 C190,300 160,330 146,372 C168,380 182,396 186,420 C160,432 150,456 150,486 C176,486 196,500 204,522 C188,540 186,566 196,590 C260,560 330,560 400,600 Z" fill="url(#wing)"/>'
      '<path d="M236,286 C222,330 214,380 214,430 M236,286 C250,350 280,430 300,560 M236,286 C210,320 196,350 186,420" stroke="#8C4220" stroke-opacity="0.55" stroke-width="7" fill="none" stroke-linecap="round"/>'
      '<path d="M436,546 C380,470 300,360 236,286" stroke="#1C7350" stroke-width="22" fill="none" stroke-linecap="round"/>'
      '<circle cx="236" cy="286" r="16" fill="#1C7350"/><path d="M230,276 L222,248 L246,272 Z" fill="#FFF0CF"/>'
      '</g>')
b=[]
b.append(wing(False)); b.append(wing(True))
# neck
b.append('<path d="M436,430 C430,500 416,560 404,640 L620,640 C608,560 594,500 588,430 Z" fill="url(#neck)"/>')
b.append('<path d="M470,440 C468,500 462,560 458,640 L566,640 C562,560 556,500 554,440 Z" fill="url(#belly)"/>')
for y in [478,516,554,592]:
    b.append(f'<path d="M{466-(y-440)*0.07:.0f},{y} Q512,{y+10} {558+(y-440)*0.07:.0f},{y}" stroke="#6FB86A" stroke-width="5" fill="none" stroke-linecap="round"/>')
# ear fins
for m in (False,True):
    tf=' transform="translate(1024,0) scale(-1,1)"' if m else ""
    b.append(f'<g{tf}><path d="M392,300 C340,268 312,262 292,268 C306,290 300,312 288,330 C318,340 352,340 386,332 Z" fill="url(#fin)"/><path d="M386,312 L300,276 M386,320 L296,318" stroke="#8C4220" stroke-opacity="0.5" stroke-width="5" stroke-linecap="round"/></g>')
# horns
for m in (False,True):
    tf=' transform="translate(1024,0) scale(-1,1)"' if m else ""
    b.append(f'<g{tf}><path d="M420,252 C404,212 384,170 360,132 C392,148 432,190 462,236 Z" fill="url(#horn)"/><path d="M402,214 Q420,206 436,214 M388,184 Q402,176 414,184" stroke="#C9A56A" stroke-width="4" fill="none" stroke-linecap="round"/></g>')
# head
b.append('<path d="M512,214 C612,214 676,262 682,336 C688,404 628,446 512,450 C396,446 336,404 342,336 C348,262 412,214 512,214 Z" fill="url(#skin)"/>')
b.append('<path d="M380,286 C400,250 440,232 480,228" stroke="#A8F0C8" stroke-opacity="0.55" stroke-width="12" fill="none" stroke-linecap="round"/>')
# crown spikes
for x,h in [(488,26),(512,34),(536,26)]:
    b.append(f'<path d="M{x-11},218 L{x},{218-h} L{x+11},218 Z" fill="#E08A4C"/>')
# muzzle
b.append('<ellipse cx="512" cy="392" rx="112" ry="62" fill="url(#muzzle)"/>')
b.append('<ellipse cx="482" cy="378" rx="9" ry="6" fill="#1B5C40" transform="rotate(-20 482 378)"/><ellipse cx="542" cy="378" rx="9" ry="6" fill="#1B5C40" transform="rotate(20 542 378)"/>')
b.append('<path d="M468,414 Q512,436 556,414" stroke="#1B5C40" stroke-width="7" fill="none" stroke-linecap="round"/>')
b.append('<path d="M492,420 L498,434 L504,421 Z M520,421 L526,434 L532,420 Z" fill="#FFFFFF"/>')
# cheeks
b.append('<ellipse cx="404" cy="376" rx="26" ry="14" fill="#FF8C8C" opacity="0.35"/><ellipse cx="620" cy="376" rx="26" ry="14" fill="#FF8C8C" opacity="0.35"/>')
# eyes
for x in (440,584):
    b.append(f'<g transform="translate({x},318)"><ellipse rx="32" ry="36" fill="#173B30"/><ellipse rx="27" ry="31" fill="url(#iris)"/><ellipse rx="8" ry="22" fill="#2A1606"/><circle cx="-9" cy="-13" r="8" fill="#FFFFFF"/><circle cx="9" cy="12" r="4" fill="#FFFFFF" opacity="0.8"/></g>')
b.append('<path d="M404,276 Q440,262 474,276 M550,276 Q584,262 620,276" stroke="#1C7350" stroke-width="9" fill="none" stroke-linecap="round"/>')
# tail: from behind the right page, curling up past its edge
b.append('<path d="M760,740 C840,750 916,730 930,670 C940,626 916,596 884,600" stroke="#1F7A55" stroke-width="34" fill="none" stroke-linecap="round"/>')
b.append('<path d="M760,736 C840,744 908,726 920,672" stroke="#5FD394" stroke-opacity="0.5" stroke-width="8" fill="none" stroke-linecap="round"/>')
b.append('<path d="M888,602 C866,570 872,540 900,526 C898,556 910,572 932,582 C910,588 898,594 888,602 Z" fill="#E08A4C"/>')
# book
b.append(book({"left":["#FFF6E2","#F4E3BE","#E3C58C","#C89A5C","#A1703C"],"right":["#FFF6E2","#F4E3BE","#E3C58C","#C89A5C","#A1703C"],
  "cover":"#2F7A5C","coverDark":"#1E5641","spine":"#1F6A4E","spineHi":"#F2C46B","ribbon":"#D9853F","ribbonDark":"#A85E26","shadow":0.3}))
# paws on the pages
for m in (False,True):
    tf=' transform="translate(1024,0) scale(-1,1)"' if m else ""
    b.append(f'<g{tf}><ellipse cx="420" cy="608" rx="46" ry="30" fill="#2A9963"/><ellipse cx="410" cy="600" rx="26" ry="12" fill="#5FD394" opacity="0.6"/>'
             '<path d="M388,628 l-6,16 l14,-8 z M414,632 l-2,17 l12,-11 z M440,630 l2,16 l9,-13 z" fill="#FFF0CF"/></g>')
# coins on the left page
for x,y in [(248,690),(286,672),(232,660),(272,646)]:
    b.append(f'<ellipse cx="{x}" cy="{y+8}" rx="30" ry="12" fill="#B9801A"/><ellipse cx="{x}" cy="{y}" rx="30" ry="12" fill="url(#coin)"/><ellipse cx="{x}" cy="{y}" rx="17" ry="6" fill="none" stroke="#C88A1C" stroke-width="3"/>')
b.append('<path d="M318,650 l18,-24 l22,0 l18,24 l-29,30 z" fill="#3CC8B4"/><path d="M318,650 l58,0 l-29,30 z" fill="#1E9A8A"/><path d="M336,626 l11,24 l11,-24" fill="#9FF2E4" opacity="0.7"/>')
# embers and sparkles
for x,y,r in [(170,200,14),(860,170,16),(720,120,10),(300,130,11),(900,420,10),(130,480,9)]:
    b.append(star4(x,y,r,"#FFD36B"))
for x,y,r in [(610,140,7),(400,110,5),(780,250,6),(240,250,5)]:
    b.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="#FFB85C" opacity="0.85"/>')
open("dragon.svg","w").write(svg("#0E2C27","".join(defs),"\n".join(bgb+b)))
open("dragon_art.svg","w").write(svg(None,"".join(defs),"\n".join(b)))
