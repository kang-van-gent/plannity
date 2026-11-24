import sys
# Usage: python3 scripts/extract-logo.py brand-source/plannity-logo-original.png public/brand  (needs numpy + pillow)
# Cuts the approved logo into transparent lockup / mark / wordmark assets and a reversed-ink variant for dark mode.
from PIL import Image, ImageFilter
import numpy as np
from collections import deque
src, out = sys.argv[1], sys.argv[2]
im = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
H, W, _ = im.shape
bg = np.array([254.,254.,254.])
near = (np.abs(im - bg).max(axis=2) < 60)
outside = np.zeros((H,W), bool); q = deque()
for x in range(W):
    for y in (0,H-1):
        if near[y,x]: outside[y,x]=True; q.append((y,x))
for y in range(H):
    for x in (0,W-1):
        if near[y,x] and not outside[y,x]: outside[y,x]=True; q.append((y,x))
while q:
    y,x=q.popleft()
    for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
        ny,nx=y+dy,x+dx
        if 0<=ny<H and 0<=nx<W and near[ny,nx] and not outside[ny,nx]: outside[ny,nx]=True; q.append((ny,nx))
edge = np.asarray(Image.fromarray((outside*255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5)))>0
edge[:, 450:] = True
edge[700:, :] = True
diff = bg - im
m = np.sqrt((diff**2).sum(axis=2))
best_m = m.copy(); F = im.copy()
R = 3
for dy in range(-R, R+1):
    for dx in range(-R, R+1):
        ms = np.roll(np.roll(m, dy, 0), dx, 1); fs = np.roll(np.roll(im, dy, 0), dx, 1)
        better = ms > best_m
        best_m = np.where(better, ms, best_m); F = np.where(better[...,None], fs, F)
fd = bg - F
alpha = np.clip((diff*fd).sum(axis=2) / np.maximum((fd**2).sum(axis=2), 1), 0, 1)
alpha = np.where(best_m < 60, 0, alpha)
alpha = np.where(alpha > 0.9, 1.0, alpha)
A = np.where(edge, alpha, 1.0); RGB = np.where(edge[...,None], F, im)
delta = np.maximum(bg - RGB, 0); dmax = delta.max(axis=2); dmin = delta.min(axis=2)
ink = (dmax > 30) & (dmin / np.maximum(dmax,1) > 0.45)
orange = (RGB[...,0] > 200) & (RGB[...,2] < 170) & (RGB[...,0]-RGB[...,2] > 60)
def build(dark):
    rgbx = RGB.copy()
    if dark:
        rgbx[ink] = [246,244,255]
    return np.dstack([rgbx, A*255]).astype(np.uint8)
def largest_only(arr):
    a = arr[...,3] > 25; h,w = a.shape; lab = np.zeros((h,w), np.int32); sizes={}; n=0
    for y in range(h):
        for x in range(w):
            if a[y,x] and not lab[y,x]:
                n+=1; lab[y,x]=n; qq=deque([(y,x)]); s=0
                while qq:
                    cy,cx=qq.popleft(); s+=1
                    for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
                        ny,nx=cy+dy,cx+dx
                        if 0<=ny<h and 0<=nx<w and a[ny,nx] and not lab[ny,nx]: lab[ny,nx]=n; qq.append((ny,nx))
                sizes[n]=s
    keep = max(sizes, key=sizes.get)
    grown = np.asarray(Image.fromarray(((lab==keep)*255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5)))>0
    arr = arr.copy(); arr[~grown,3]=0; return arr
def save(arr, box, name, width, fix=None):
    c = arr[box[1]:box[3], box[0]:box[2]]
    if fix: c = fix(c)
    img = Image.fromarray(c,'RGBA'); img = img.crop(img.getbbox())
    h = round(img.size[1]*width/img.size[0]); img = img.resize((width,h), Image.LANCZOS)
    img.save(f'{out}/{name}.png', optimize=True); print(name, img.size)
    return img
def no_orange(box):
    def f(c):
        c=c.copy(); o=orange[box[1]:box[3], box[0]:box[2]]; c[o,3]=0; return c
    return f
for dark in (False, True):
    sfx = '-dark' if dark else ''
    arr = build(dark)
    save(arr, (70,225,1450,612), 'logo-lockup'+sfx, 720)
    save(arr, (70,225,1450,780), 'logo-full'+sfx, 1000)
    wb=(460,330,1450,610); save(arr, wb, 'logo-wordmark'+sfx, 560, no_orange(wb))
mark = save(build(False), (70,260,445,645), 'logo-mark', 256, largest_only)
s=max(mark.size); sq=Image.new('RGBA',(s,s),(0,0,0,0)); sq.paste(mark,((s-mark.size[0])//2,(s-mark.size[1])//2))
sq.resize((512,512),Image.LANCZOS).save(f'{out}/icon-512.png',optimize=True)
sq.resize((180,180),Image.LANCZOS).save(f'{out}/apple-touch-icon.png',optimize=True)
sq.resize((64,64),Image.LANCZOS).save(f'{out}/favicon-64.png',optimize=True)
sq.save(f'{out}/../favicon.ico', sizes=[(16,16),(32,32),(48,48)])
Image.open(src).convert('RGB').resize((1200,800),Image.LANCZOS).save(f'{out}/og-logo.jpg', quality=88)
