"""Render PNG app icons from the simple route-and-die mark."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
S = 3
W = 512 * S
im = Image.new("RGBA", (W, W), (0, 0, 0, 0))
d = ImageDraw.Draw(im)

def xy(box):
    return tuple(round(v * S) for v in box)

for y in range(W):
    t = y / W
    color = (round(10 + 17*t), round(36 + 37*t), round(34 + 30*t), 255)
    d.line((0, y, W, y), fill=color)

mask = Image.new("L", (W, W), 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, W-1, W-1), radius=112*S, fill=255)
im.putalpha(mask)
d = ImageDraw.Draw(im)
d.rounded_rectangle(xy((18, 18, 494, 494)), radius=98*S, outline=(255, 255, 255, 36), width=2*S)

def bezier(p0, p1, p2, p3, steps=120):
    return [(
        round(((1-t)**3*p0[0]+3*(1-t)**2*t*p1[0]+3*(1-t)*t*t*p2[0]+t**3*p3[0])*S),
        round(((1-t)**3*p0[1]+3*(1-t)**2*t*p1[1]+3*(1-t)*t*t*p2[1]+t**3*p3[1])*S)
        ) for t in (i/steps for i in range(steps+1))]

path = bezier((82,353),(136,353),(136,130),(252,130))
path += bezier((252,130),(368,130),(334,382),(430,234))
d.line(path, fill=(215, 170, 95, 255), width=18*S, joint="curve")
for x,y in [(82,353),(430,234)]:
    d.ellipse(xy((x-17,y-17,x+17,y+17)), fill=(16,47,42), outline=(243,210,147), width=5*S)

die = Image.new("RGBA", (210*S, 210*S), (0,0,0,0))
dd = ImageDraw.Draw(die)
dd.rounded_rectangle(xy((15,15,195,195)), radius=38*S, fill=(247,241,225,255), outline=(245,219,163,255), width=5*S)
for x,y in [(62,62),(142,62),(102,103),(62,143),(142,143)]:
    dd.ellipse(xy((x-12,y-12,x+12,y+12)), fill=(21,59,52,255))
die = die.rotate(10, resample=Image.Resampling.BICUBIC, expand=True)
im.alpha_composite(die, (round((256-105)*S - (die.width-210*S)/2),round((267-105)*S - (die.height-210*S)/2)))

for size in (192, 512):
    im.resize((size,size), Image.Resampling.LANCZOS).save(ROOT / f"icon-{size}.png", optimize=True)
