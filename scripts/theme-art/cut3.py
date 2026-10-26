import numpy as np, json, os, imagequant, shutil
from PIL import Image
from scipy import ndimage as ndi
OUT="out3"; shutil.rmtree(OUT,ignore_errors=True); os.makedirs(OUT)
manifest={}
for t in ["mushroom","dragon","arcane","moonGarden"]:
    full=np.asarray(Image.open(t+"_icon.png").convert("RGB")).astype(float)
    b=np.concatenate([full[:24].reshape(-1,3),full[-24:].reshape(-1,3),full[:,:24].reshape(-1,3),full[:,-24:].reshape(-1,3)])
    bg=np.median(b,0)
    rgba=np.asarray(Image.open(t+"_art.png").convert("RGBA")).astype(float); H,W,_=rgba.shape
    alpha=rgba[...,3]/255
    solid=alpha>0.5
    lab,n=ndi.label(solid,structure=np.ones((3,3))); sizes=ndi.sum(solid,lab,range(1,n+1))
    main=int(np.argmax(sizes))+1
    dist,(iy,ix)=ndi.distance_transform_edt(lab==0,return_indices=True)
    owner=lab[iy,ix]; owner[alpha<=0.004]=0
    ys,xs=np.where(lab==main); cx,cy=xs.mean(),ys.mean()
    os.makedirs(f"{OUT}/{t}"); layers=[]
    def save(name,mask,kind):
        part=rgba.copy(); part[...,3]=np.where(mask,part[...,3],0)
        yy,xx=np.where(part[...,3]>2)
        x0,y0,x1,y1=max(xx.min()-2,0),max(yy.min()-2,0),min(xx.max()+3,W),min(yy.max()+3,H)
        im=Image.fromarray(part[y0:y1,x0:x1].astype(np.uint8),"RGBA")
        imagequant.quantize_pil_image(im,dithering_level=0.9,max_colors=256,min_quality=70,max_quality=98).save(f"{OUT}/{t}/{name}.png",optimize=True)
        layers.append({"name":name,"kind":kind,"x":int(x0),"y":int(y0),"w":int(x1-x0),"h":int(y1-y0)})
    save("main",owner==main,"main")
    others=[i for i in range(1,n+1) if i!=main and sizes[i-1]>=40]
    others.sort(key=lambda i: np.hypot(*(np.array(ndi.center_of_mass(lab==i))[::-1]-[cx,cy])))
    si=pi=0
    for i in others:
        kind="side" if sizes[i-1]>=3500 else "spark"
        save(f"{kind}{si if kind=='side' else pi}",owner==i,kind)
        if kind=="side": si+=1
        else: pi+=1
    lum=(0.2126*bg[0]+0.7152*bg[1]+0.0722*bg[2])/255
    manifest[t]={"bg":"#%02X%02X%02X"%tuple(int(v) for v in bg),"light":bool(lum>0.5),"cx":round(cx),"cy":round(cy),"layers":layers}
    print(t,manifest[t]["bg"],len(layers),"sides",si,"sparks",pi)
json.dump(manifest,open(f"{OUT}/manifest.json","w"),indent=1)
