import sys
from PIL import Image
import numpy as np
src=np.asarray(Image.open(sys.argv[1])).astype(float)
outdir=sys.argv[2]
bg=np.array([21,50,84.])
ids=['sprout-puff','pebble-pup','bumble-bun','mossling','glow-moth','tidal-fox','coral-crab','ripple-otter','lantern-jelly','kelp-drake','prism-ray','tide-dragon','comet-kit','nebula-owl','star-whalelet','aurora-phoenix','moon-seraph','rift-wyrm']
rows=[(0,243),(276,511),(538,777)]
W=1908/6
def flood(low):
    m=np.zeros_like(low); m[0]=low[0]; m[-1]=low[-1]; m[:,0]=low[:,0]; m[:,-1]=low[:,-1]
    while True:
        n=m.copy()
        n[1:]|=m[:-1]; n[:-1]|=m[1:]; n[:,1:]|=m[:,:-1]; n[:,:-1]|=m[:,1:]
        n&=low
        if (n==m).all(): return m
        m=n
for i,pid in enumerate(ids):
    r,c=divmod(i,6)
    x0,x1=max(0,int(c*W)-40),min(1908,int((c+1)*W)+40); y0,y1=rows[r]
    cell=src[y0:y1,x0:x1]
    d=np.sqrt(((cell-bg)**2).sum(2))
    thr={'star-whalelet':13,'nebula-owl':22,'rift-wyrm':24}.get(pid,34)
    bgmask=flood(d<thr)
    a=np.ones(d.shape)
    a[bgmask]=np.clip((d[bgmask]-10)/24,0,1)
    # keep only what is connected (allowing small gaps, e.g. halos) to the pet in the cell centre
    fg=a>0.35
    near=fg.copy()
    for _ in range(9):
        n=near.copy(); n[1:]|=near[:-1]; n[:-1]|=near[1:]; n[:,1:]|=near[:,:-1]; n[:,:-1]|=near[:,1:]; near=n
    h,w=fg.shape
    seed=np.zeros_like(fg); seed[int(h*.3):int(h*.75),int(w*.38):int(w*.62)]=True; seed&=fg
    keep=seed
    while True:
        n=keep.copy(); n[1:]|=keep[:-1]; n[:-1]|=keep[1:]; n[:,1:]|=keep[:,:-1]; n[:,:-1]|=keep[:,1:]
        n&=near
        if (n==keep).all(): break
        keep=n
    a=np.where(keep,a,0)
    a3=a[...,None]
    rgb=np.clip(np.where(a3>0.02,(cell-bg*(1-a3))/np.maximum(a3,0.02),0),0,255)
    ys,xs=np.where(a>0.5)
    pad=4
    by0=max(0,ys.min()-pad);bx0=max(0,xs.min()-pad);by1=min(a.shape[0],ys.max()+pad+1);bx1=min(a.shape[1],xs.max()+pad+1)
    img=Image.fromarray(np.dstack([rgb,a*255])[by0:by1,bx0:bx1].astype(np.uint8),'RGBA')
    img.thumbnail((240,200),Image.LANCZOS)
    canvas=Image.new('RGBA',(240,200),(0,0,0,0))
    canvas.paste(img,((240-img.width)//2,(200-img.height)//2))
    canvas.save(f'{outdir}/{pid}.webp','WEBP',quality=86,method=6)
    arr=np.asarray(canvas).copy(); arr[...,:3]=[30,38,64]
    Image.fromarray(arr,'RGBA').save(f'{outdir}/{pid}-sil.webp','WEBP',quality=70,method=6)
print('ok')
