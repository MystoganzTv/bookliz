import math
def lin(id,x1,y1,x2,y2,stops):
    s="".join(f'<stop offset="{o}" stop-color="{c}"{(' stop-opacity="%s"'%a) if a is not None else ""}/>' for o,c,*r in stops for a in [r[0] if r else None])
    return f'<linearGradient id="{id}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" gradientUnits="userSpaceOnUse">{s}</linearGradient>'
def rad(id,cx,cy,r,stops,fx=None,fy=None):
    s="".join(f'<stop offset="{o}" stop-color="{c}"{(' stop-opacity="%s"'%a) if a is not None else ""}/>' for o,c,*r2 in stops for a in [r2[0] if r2 else None])
    f=f' fx="{fx}" fy="{fy}"' if fx is not None else ""
    return f'<radialGradient id="{id}" cx="{cx}" cy="{cy}" r="{r}"{f} gradientUnits="userSpaceOnUse">{s}</radialGradient>'
def star4(cx,cy,r,fill,rot=0):
    pts=[]
    for i in range(8):
        a=math.radians(rot+i*45); rr=r if i%2==0 else r*0.28
        pts.append(f"{cx+rr*math.sin(a):.1f},{cy-rr*math.cos(a):.1f}")
    # smooth 4-point sparkle via quadratic curves
    out=[]
    for i in range(4):
        a=math.radians(rot+i*90); a2=math.radians(rot+(i+1)*90)
        p1=(cx+r*math.sin(a),cy-r*math.cos(a)); p2=(cx+r*math.sin(a2),cy-r*math.cos(a2))
        if i==0: out.append(f"M{p1[0]:.1f},{p1[1]:.1f}")
        out.append(f"Q{cx:.1f},{cy:.1f} {p2[0]:.1f},{p2[1]:.1f}")
    return f'<path d="{"".join(out)}Z" fill="{fill}"/>'
def star5(cx,cy,r,fill,inner=0.45,rot=0):
    pts=[]
    for i in range(10):
        a=math.radians(rot+i*36); rr=r if i%2==0 else r*inner
        pts.append(f"{cx+rr*math.sin(a):.1f},{cy-rr*math.cos(a):.1f}")
    return f'<polygon points="{" ".join(pts)}" fill="{fill}" stroke="{fill}" stroke-width="{r*0.18:.1f}" stroke-linejoin="round"/>'

def book(p):
    """The family's open book. p: dict with left/right band colours (top→bottom), cover, coverDark, spine, spineHi, ribbon, ribbonDark."""
    d=[]
    d.append(f'<ellipse cx="512" cy="872" rx="360" ry="26" fill="#000" opacity="{p.get("shadow",0.22)}"/>')
    # cover (slightly larger than pages) with the arch at the spine
    d.append(f'<path d="M126,790 L150,812 C300,826 420,842 488,866 C500,852 524,852 536,866 C604,842 724,826 874,812 L898,790 C740,800 610,812 536,838 C524,830 500,830 488,838 C414,812 284,800 126,790 Z" fill="{p["cover"]}"/>')
    d.append(f'<path d="M150,812 C300,826 420,842 488,866 C500,852 524,852 536,866 C604,842 724,826 874,812 L870,826 C724,840 604,858 536,880 C524,868 500,868 488,880 C420,858 300,840 154,826 Z" fill="{p["coverDark"]}"/>')
    def stack(cols,mirror):
        tf=' transform="translate(1024,0) scale(-1,1)"' if mirror else ""
        cid="clipR" if mirror else "clipL"
        top="M512,642 C452,580 330,548 178,556"
        shape=f"M512,642 C452,580 330,548 178,556 L140,792 C300,800 420,814 496,846 L512,846 Z"
        g=[f'<clipPath id="{cid}"><path d="{shape}"/></clipPath>',f'<g{tf}><g clip-path="url(#{cid})"><path d="{shape}" fill="{cols[0]}"/>']
        n=len(cols)
        for i in range(1,n):
            dy=i*44+ (8 if i>1 else 0)
            wob=10*(1 if i%2 else -1)
            g.append(f'<path d="M520,{642+dy} C452,{582+dy+wob} 330,{552+dy-wob} 120,{560+dy+wob*0.5} L120,900 L520,900 Z" fill="{cols[i]}"/>')
        g.append(f'<path d="M512,642 C452,580 330,548 178,556" fill="none" stroke="#FFFFFF" stroke-opacity="0.55" stroke-width="5"/>')
        g.append('</g></g>')
        return "".join(g)
    d.append(stack(p["left"],False))
    d.append(stack(p["right"],True))
    # spine
    d.append(f'<path d="M490,640 Q512,628 534,640 L534,846 Q512,832 490,846 Z" fill="{p["spine"]}"/>')
    d.append(f'<rect x="506" y="652" width="12" height="180" rx="6" fill="{p["spineHi"]}" opacity="0.35"/>')
    d.append(f'<circle cx="512" cy="676" r="7" fill="{p["spineHi"]}"/>')
    # ribbon
    d.append(f'<path d="M496,846 L528,846 L528,922 L512,906 L496,922 Z" fill="{p["ribbon"]}"/>')
    d.append(f'<path d="M496,846 L528,846 L528,858 L496,858 Z" fill="{p["ribbonDark"]}"/>')
    return "\n".join(d)

def svg(bg,defs,body,size=1024):
    rect=f'<rect width="1024" height="1024" fill="{bg}"/>' if bg else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 1024 1024"><defs>{defs}</defs>{rect}{body}</svg>'
