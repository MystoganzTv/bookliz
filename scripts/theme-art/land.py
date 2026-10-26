import math, random
from common import star4, star5
W,H=1200,520
FAR="#8C8C8C"; MID="#B4B4B4"; NEAR="#F2F2F2"
def doc(body,defs=""):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}"><defs>{defs}</defs>{body}</svg>'
def ground(back,front):
    return (f'<path d="M0,430 C150,380 300,400 420,425 C560,450 700,370 860,400 C980,422 1100,398 1200,410 L1200,520 L0,520 Z" fill="{back}"/>'
            f'<path d="M0,470 C160,440 320,455 480,468 C640,480 820,440 980,455 C1080,464 1150,458 1200,462 L1200,520 L0,520 Z" fill="{front}"/>')
def sparkles(seed,n,col):
    random.seed(seed); out=[]
    for _ in range(n):
        x=random.uniform(30,1170); y=random.uniform(20,250)
        out.append(star4(x,y,random.uniform(6,12),col) if random.random()<0.5 else f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{random.uniform(2,4):.1f}" fill="{col}"/>')
    return "".join(out)
def mushroom_sil(x,y,s,id_):
    # cap with spot holes via mask
    m=f'<mask id="{id_}"><rect x="-2000" y="-2000" width="5000" height="5000" fill="white"/>'+"".join(f'<circle cx="{x+dx*s}" cy="{y+dy*s}" r="{r*s}" fill="black"/>' for dx,dy,r in [(-34,-82,12),(8,-104,10),(44,-80,13),(-4,-70,7)])+'</mask>'
    body=(f'<path d="M{x-24*s},{y+10} C{x-26*s},{y-30*s} {x-20*s},{y-60*s} {x-15*s},{y-64*s} L{x+15*s},{y-64*s} C{x+20*s},{y-60*s} {x+26*s},{y-30*s} {x+24*s},{y+10} Z" fill="{NEAR}"/>'
          f'<path d="M{x-80*s},{y-58*s} C{x-80*s},{y-120*s} {x-40*s},{y-142*s} {x},{y-142*s} C{x+40*s},{y-142*s} {x+80*s},{y-120*s} {x+80*s},{y-58*s} C{x+40*s},{y-50*s} {x-40*s},{y-50*s} {x-80*s},{y-58*s} Z" fill="{NEAR}" mask="url(#{id_})"/>')
    return m,body
def cloud(x,y,s,col):
    return f'<g transform="translate({x},{y}) scale({s})" fill="{col}"><ellipse cx="0" cy="20" rx="78" ry="30"/><circle cx="-30" cy="6" r="32"/><circle cx="18" cy="-6" r="42"/><circle cx="56" cy="12" r="26"/></g>'

def mushroom():
    defs=""; body=cloud(220,110,0.8,MID)+cloud(900,150,0.6,MID)+star5(1060,80,26,MID)+sparkles(1,10,MID)
    body+=ground(FAR,NEAR)
    for i,(x,y,s) in enumerate([(160,470,0.9),(250,462,0.55),(560,470,1.25),(690,462,0.6),(960,456,0.95),(1060,460,0.5)]):
        m,b=mushroom_sil(x,y,s,f"m{i}"); defs+=m; body+=b
    for x in [380,820,1130]:
        body+=f'<path d="M{x},466 q-8,-26 -2,-40 q6,18 7,30 q4,-22 12,-34 q-2,22 -5,44 z" fill="{NEAR}"/>'
    return doc(body,defs)
def dragon():
    body=f'<circle cx="980" cy="90" r="46" fill="{MID}"/>'+sparkles(2,12,MID)
    body+=f'<path d="M0,430 L120,300 L210,380 L330,250 L470,400 L560,330 L680,420 L1200,420 L1200,520 L0,520 Z" fill="{FAR}"/>'
    # castle on the right hill
    c=[f'<path d="M760,470 C820,400 1000,390 1120,470 Z" fill="{NEAR}"/>']
    for x,w,h in [(840,46,150),(900,70,110),(986,46,170)]:
        c.append(f'<rect x="{x}" y="{430-h}" width="{w}" height="{h+20}" fill="{NEAR}"/>')
        c.append(f'<path d="M{x-8},{430-h} L{x+w/2},{430-h-56} L{x+w+8},{430-h} Z" fill="{NEAR}"/>')
        c.append(f'<path d="M{x+w/2},{430-h-56} l0,-26 l26,10 l-26,10" fill="{NEAR}"/>')
    body+="".join(c)
    # flying dragon silhouette
    body+=(f'<g transform="translate(330,170) scale(1.05)" fill="{NEAR}">'
           '<ellipse cx="0" cy="40" rx="74" ry="28"/>'
           '<path d="M50,30 C80,10 96,-6 120,-14 L134,-18 C150,-22 166,-18 176,-10 L192,-6 L176,0 C168,8 154,12 140,10 C120,8 104,20 86,40 C76,50 62,56 50,54 Z"/>'
           '<path d="M146,-20 l-6,-24 l18,18 z M160,-18 l2,-22 l10,20 z"/>'
           '<path d="M-60,50 C-110,62 -160,60 -210,40 C-232,32 -250,36 -262,46 C-246,48 -236,56 -232,66 C-200,74 -150,80 -100,74 C-80,72 -64,66 -52,58 Z"/>'
           '<path d="M-262,46 l-22,-16 l6,22 l-16,10 l24,2 z"/>'
           '<path d="M-24,22 C-40,-20 -70,-70 -60,-110 C-90,-96 -130,-96 -170,-104 C-152,-84 -150,-66 -156,-48 C-132,-50 -116,-38 -112,-20 C-92,-26 -74,-14 -70,2 C-56,4 -44,12 -40,26 Z"/>'
           '<path d="M24,18 C36,-26 66,-70 112,-104 C118,-82 134,-62 156,-50 C134,-44 122,-30 122,-14 C104,-20 88,-10 84,6 C68,4 54,10 48,24 Z"/>'
           '<path d="M10,62 l-8,24 l14,-6 z M-30,64 l-10,22 l14,-4 z"/></g>')
    body+=ground(MID,NEAR)
    return doc(body)
def arcane():
    defs='<mask id="win"><rect width="1200" height="520" fill="white"/>'
    body=f'<path d="M150,140 A44,44 0 1,0 190,212 A36,36 0 1,1 150,140 Z" fill="{MID}"/>'+sparkles(3,14,MID)
    towers=[(560,70,260),(650,90,330),(760,64,230),(470,60,200),(860,58,190)]
    body+=f'<path d="M0,440 C200,380 400,410 520,420 C700,440 900,380 1200,420 L1200,520 L0,520 Z" fill="{FAR}"/>'
    t=[]
    for x,w,h in towers:
        top=470-h
        t.append(f'<rect x="{x}" y="{top}" width="{w}" height="{h}" fill="{NEAR}" mask="url(#win)"/>')
        t.append(f'<path d="M{x-10},{top} L{x+w/2},{top-w*1.3} L{x+w+10},{top} Z" fill="{NEAR}"/>')
        t.append(f'<circle cx="{x+w/2}" cy="{top-w*1.3-8}" r="6" fill="{NEAR}"/>')
        for wy in range(top+30,450,52):
            defs+=f'<path d="M{x+w/2-9},{wy+24} L{x+w/2-9},{wy+8} A9,9 0 0,1 {x+w/2+9},{wy+8} L{x+w/2+9},{wy+24} Z" fill="black"/>'
    defs+='</mask>'
    body+="".join(t)
    for x,y,r in [(260,240,-12),(1000,200,14),(1100,300,-8)]:
        body+=f'<g transform="translate({x},{y}) rotate({r})" fill="{MID}"><path d="M-36,-6 Q0,-22 0,-4 Q0,-22 36,-6 L36,18 Q0,4 0,20 Q0,4 -36,18 Z"/></g>'
    body+=ground(MID,NEAR)
    return doc(body,defs)
def moongarden():
    body=f'<path d="M560,40 A80,80 0 1,0 620,180 A66,66 0 1,1 560,40 Z" fill="{MID}"/>'+sparkles(4,12,MID)
    body+=ground(FAR,NEAR)
    # wisteria arches from both ends
    for m in (False,True):
        tf=' transform="translate(1200,0) scale(-1,1)"' if m else ""
        g=[f'<g{tf}><path d="M40,480 C40,300 140,160 330,110" stroke="{NEAR}" stroke-width="10" fill="none" stroke-linecap="round"/>']
        for cx,cy,n in [(90,250,7),(150,180,7),(220,140,6),(290,118,6),(60,340,6)]:
            for i in range(n):
                tt=i/(n-1); r=12*(1-tt*0.55); yy=cy+i*14
                col=NEAR if i<3 else MID
                g.append(f'<circle cx="{cx}" cy="{yy}" r="{r:.1f}" fill="{col}"/>')
                if i<n-2: g.append(f'<circle cx="{cx-r*0.9:.0f}" cy="{yy+5}" r="{r*0.75:.1f}" fill="{col}"/><circle cx="{cx+r*0.9:.0f}" cy="{yy+5}" r="{r*0.75:.1f}" fill="{col}"/>')
        g.append('</g>'); body+="".join(g)
    # moth
    body+=(f'<g transform="translate(820,190) scale(0.9)" fill="{NEAR}"><path d="M0,0 C-26,-50 -90,-64 -98,-24 C-102,8 -56,16 0,6 Z"/><path d="M0,6 C-40,16 -78,38 -64,64 C-52,84 -16,56 0,16 Z"/>'
           '<path d="M0,0 C26,-50 90,-64 98,-24 C102,8 56,16 0,6 Z"/><path d="M0,6 C40,16 78,38 64,64 C52,84 16,56 0,16 Z"/></g>')
    for x in [300,420,520,700,880,980]:
        y=470
        body+=f'<path d="M{x},{y} q-2,-30 0,-46" stroke="{NEAR}" stroke-width="5" fill="none"/><circle cx="{x}" cy="{y-50}" r="12" fill="{NEAR}"/>'
    for x,y in [(380,330),(640,300),(760,380),(470,250)]:
        body+=f'<circle cx="{x}" cy="{y}" r="5" fill="{MID}"/>'
    return doc(body)
for name,f in [("mushroom",mushroom),("dragon",dragon),("arcane",arcane),("moonGarden",moongarden)]:
    open(f"land_{name}.svg","w").write(f())
