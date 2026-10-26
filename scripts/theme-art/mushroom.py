from common import *
defs=[rad("sky",512,420,620,[(0,"#BEE7F7"),(1,"#7FC9EA")]),
 rad("cap",470,250,230,[(0,"#FF6B5A"),(0.6,"#E2392F"),(1,"#B4241F")],fx=420,fy=200),
 rad("cap2",735,410,120,[(0,"#FF8A5C"),(1,"#D2452C")],fx=715,fy=385),
 lin("stem",430,380,560,380,[(0,"#FFF6E4"),(0.55,"#FBE7C4"),(1,"#E6C99A")]),
 lin("hillA",0,420,0,700,[(0,"#8BD46A"),(1,"#4E9E45")]),
 lin("hillB",0,470,0,700,[(0,"#6CC05A"),(1,"#3B8A3E")]),
 rad("glow",800,200,120,[(0,"#FFE68A",0.9),(1,"#FFE68A",0)]),
 lin("capShade",0,404,0,472,[(0,"#B98C5A",0.55),(1,"#B98C5A",0)]),
 lin("gill",400,395,560,395,[(0,"#F3D9B0"),(1,"#D9B888")]),
]
bgb=[]
b=[]
# clouds
for cx,cy,s in [(210,230,1.0),(860,330,0.75)]:
    b.append(f'<g transform="translate({cx},{cy}) scale({s})" fill="#FFFFFF" opacity="0.92"><ellipse cx="0" cy="20" rx="78" ry="34"/><circle cx="-30" cy="4" r="34"/><circle cx="18" cy="-8" r="44"/><circle cx="56" cy="12" r="28"/></g>')
# sun-glow star
bgb.append('<circle cx="800" cy="200" r="120" fill="url(#glow)"/>')
b.append(star5(800,200,54,"#FFD23F"))
b.append('<path d="M778,188 a6,8 0 1,0 0.1,0 M822,188 a6,8 0 1,0 0.1,0" fill="#B26B00" opacity="0"/>')
# hills behind the book
b.append('<path d="M150,640 C200,470 330,430 420,520 C470,440 600,420 660,500 C720,450 860,470 880,640 Z" fill="url(#hillA)"/>')
b.append('<path d="M150,640 C230,540 330,540 400,600 C480,540 620,540 690,600 C760,560 850,580 880,640 Z" fill="url(#hillB)"/>')

# grass tufts / flowers on hills
for x,y in [(300,505),(640,470),(750,520)]:
    b.append(f'<path d="M{x},{y} q-10,-26 -4,-40 q6,18 8,30 q4,-22 14,-34 q-2,22 -6,38 z" fill="#3E8E3B"/>')
for x,y,c in [(250,575,"#FFF4F0"),(700,560,"#FFE36E"),(560,520,"#FFF4F0")]:
    b.append(f'<g transform="translate({x},{y})">'+"".join(f'<circle cx="{10*__import__("math").cos(a*1.2566):.1f}" cy="{10*__import__("math").sin(a*1.2566):.1f}" r="8" fill="{c}"/>' for a in range(5))+'<circle r="6" fill="#F4A21E"/></g>')
# small mushroom (right)
b.append('<path d="M712,560 C708,520 714,470 726,440 L760,440 C770,470 772,520 766,560 Z" fill="url(#stem)"/>')
b.append('<path d="M650,452 C650,385 700,350 742,350 C790,350 836,385 836,452 C800,468 690,468 650,452 Z" fill="url(#cap2)"/>')
for x,y,r in [(700,400,14),(752,378,11),(796,412,13),(748,428,9)]:
    b.append(f'<ellipse cx="{x}" cy="{y}" rx="{r}" ry="{r*0.85}" fill="#FFF6E6"/>')
# tiny mushroom (left)
b.append('<path d="M262,600 C262,580 266,560 272,548 L290,548 C294,560 296,580 294,600 Z" fill="url(#stem)"/>')
b.append('<path d="M232,556 C232,520 258,504 280,504 C304,504 330,520 330,556 C310,564 250,564 232,556 Z" fill="#E8503C"/>')
b.append('<circle cx="262" cy="528" r="7" fill="#FFF6E6"/><circle cx="298" cy="522" r="6" fill="#FFF6E6"/>')
# hero mushroom
b.append('<path d="M440,640 C428,560 432,470 452,400 L548,400 C566,470 572,560 562,640 C540,656 462,656 440,640 Z" fill="url(#stem)"/>')
b.append('<path d="M466,410 C470,470 468,560 474,630" stroke="#FFFFFF" stroke-opacity="0.6" stroke-width="10" fill="none" stroke-linecap="round"/>')
b.append('<ellipse cx="500" cy="404" rx="128" ry="22" fill="url(#gill)"/>')
b.append('<path d="M446,404 C446,430 448,452 452,470 L548,470 C552,452 554,430 554,404 Z" fill="url(#capShade)"/>')
b.append('<path d="M290,400 C290,250 400,170 500,170 C610,170 712,250 712,400 C640,428 360,428 290,400 Z" fill="url(#cap)"/>')
b.append('<path d="M290,400 C360,428 640,428 712,400 C708,384 704,374 700,368 C620,392 380,392 300,368 C296,376 292,386 290,400 Z" fill="#9E1E1A" opacity="0.55"/>')
b.append('<path d="M330,330 C350,250 420,205 490,198" stroke="#FFFFFF" stroke-opacity="0.35" stroke-width="16" fill="none" stroke-linecap="round"/>')
for x,y,r in [(392,300,30),(500,236,26),(612,296,32),(468,352,20),(560,366,18),(342,370,14),(668,372,14)]:
    b.append(f'<ellipse cx="{x}" cy="{y}" rx="{r}" ry="{r*0.82}" fill="#FFF8EC"/>')
# sparkles
for x,y,r in [(170,390,16),(880,470,14),(610,130,12),(380,140,10),(930,240,9)]:
    b.append(star4(x,y,r,"#FFFFFF"))
# book (in front of the hills)
b.append(book({"left":["#FFF8EA","#DDF0C6","#A9DB8A","#6DBE5C","#3F9A48"],"right":["#FFF8EA","#FFE6A6","#FFC75A","#F59A3A","#E2622F"],
  "cover":"#1F6E5C","coverDark":"#164F43","spine":"#1C6A58","spineHi":"#9FE3CF","ribbon":"#E2392F","ribbonDark":"#B4241F","shadow":0.12}))
open("mushroom.svg","w").write(svg("#8ED0EC","".join(defs),"\n".join(bgb+b)))
open("mushroom_art.svg","w").write(svg(None,"".join(defs),"\n".join(b)))
