#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""生成应用图标：一盏灯，一片纸。
   输出 icon.png（512）/ icon.ico（多尺寸，给 Windows）/ android 各密度 mipmap。"""
import os, math
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'dist', '_icon')
os.makedirs(OUT, exist_ok=True)

S = 1024
PAPER = (246, 242, 230, 255)
PAPER2 = (238, 233, 217, 255)
INK = (52, 72, 66, 255)
INK2 = (90, 112, 104, 255)
AMBER = (226, 162, 74, 255)
AMBER_L = (247, 205, 130, 255)
CORAL = (183, 122, 90, 255)

img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# 圆角纸底
r = int(S * 0.22)
d.rounded_rectangle([0, 0, S - 1, S - 1], radius=r, fill=PAPER)
# 纸纹：几道极淡的横线
for i in range(6):
    y = int(S * (0.24 + i * 0.105))
    d.line([int(S * 0.12), y, int(S * 0.88), y], fill=(226, 220, 203, 90), width=max(2, S // 380))

cx = int(S * 0.50)

# 光晕（在灯罩之上、背景之下）
glow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow)
for i in range(28, 0, -1):
    a = int(56 * (i / 28.0) ** 2.4)
    rad = int(S * 0.30 * (i / 28.0))
    gd.ellipse([cx - rad, int(S * 0.30) - rad, cx + rad, int(S * 0.30) + rad], fill=(255, 214, 140, a))
glow = glow.filter(ImageFilter.GaussianBlur(S // 26))
img.alpha_composite(glow)
d = ImageDraw.Draw(img)

# 灯柱
pole_w = int(S * 0.036)
d.rounded_rectangle([cx - pole_w // 2, int(S * 0.32), cx + pole_w // 2, int(S * 0.80)],
                    radius=pole_w // 2, fill=INK)
# 底座
bw = int(S * 0.20)
d.rounded_rectangle([cx - bw // 2, int(S * 0.78), cx + bw // 2, int(S * 0.825)],
                    radius=int(S * 0.022), fill=INK)
# 灯臂
d.line([cx, int(S * 0.345), cx + int(S * 0.145), int(S * 0.345)], fill=INK, width=pole_w)
# 灯罩（梯形）
top_w, bot_w = int(S * 0.115), int(S * 0.225)
ty, by = int(S * 0.288), int(S * 0.398)
d.polygon([(cx + int(S * 0.145) - top_w // 2, ty), (cx + int(S * 0.145) + top_w // 2, ty),
           (cx + int(S * 0.145) + bot_w // 2, by), (cx + int(S * 0.145) - bot_w // 2, by)], fill=AMBER)
# 灯泡
d.ellipse([cx + int(S * 0.145) - int(S * 0.030), by - int(S * 0.012),
           cx + int(S * 0.145) + int(S * 0.030), by + int(S * 0.048)], fill=AMBER_L)
# 暖光洒下
cone = Image.new('RGBA', (S, S), (0, 0, 0, 0))
cd = ImageDraw.Draw(cone)
cd.polygon([(cx + int(S * 0.145) - bot_w // 2, by), (cx + int(S * 0.145) + bot_w // 2, by),
            (cx + int(S * 0.145) + int(S * 0.175), int(S * 0.78)),
            (cx + int(S * 0.145) - int(S * 0.175), int(S * 0.78))], fill=(255, 216, 146, 52))
cone = cone.filter(ImageFilter.GaussianBlur(S // 40))
img.alpha_composite(cone)

# 地面一条暖线
d.line([int(S * 0.16), int(S * 0.825), int(S * 0.84), int(S * 0.825)],
       fill=(178, 187, 171, 220), width=max(3, S // 220))

img512 = img.resize((512, 512), Image.LANCZOS)
img512.save(os.path.join(OUT, 'icon.png'))
img.resize((256, 256), Image.LANCZOS).save(os.path.join(OUT, 'icon256.png'))

# Windows .ico（多尺寸）
img512.save(os.path.join(OUT, 'icon.ico'), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])

# Android mipmap（含自适应前景的方形图标；为省事直接用同一张缩放）
AND = {'mipmap-mdpi': 48, 'mipmap-hdpi': 72, 'mipmap-xhdpi': 96, 'mipmap-xxhdpi': 144, 'mipmap-xxxhdpi': 192}
for folder, size in AND.items():
    p = os.path.join(OUT, 'android', folder)
    os.makedirs(p, exist_ok=True)
    img.resize((size, size), Image.LANCZOS).save(os.path.join(p, 'ic_launcher.png'))
    # 圆形版本
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size - 1, size - 1], fill=255)
    rnd = img.resize((size, size), Image.LANCZOS).convert('RGBA')
    rnd.putalpha(mask)
    rnd.save(os.path.join(p, 'ic_launcher_round.png'))

print('图标已生成 ->', OUT)
