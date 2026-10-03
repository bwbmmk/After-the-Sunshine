# 把 assets/cg/*.png 压成内嵌用的 js/cgdata.js
# 裁掉底部水印 → 缩到宽 560 → JPEG q76 → base64 → SP.cg
import base64, io, os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'assets', 'cg')
OUT = os.path.join(HERE, '..', 'js', 'cgdata.js')
IDS = ['man', 'cheng', 'yan', 'aunt', 'teacher', 'mom']

parts = []
total = 0
for cid in IDS:
    im = Image.open(os.path.join(SRC, cid + '.png')).convert('RGB')
    w, h = im.size
    im = im.crop((0, 0, w, int(h * 0.94)))          # 去底部水印带
    nw = 480
    im = im.resize((nw, int(im.size[1] * nw / im.size[0])), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, 'JPEG', quality=72, optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode('ascii')
    total += len(b64)
    parts.append(f"{cid}:'data:image/jpeg;base64,{b64}'")
    print(f"{cid:8s} {im.size[0]}x{im.size[1]}  b64 {len(b64)//1024} KB")

js = ("/* 人物 CG（二次元立绘）：assets/cg/*.png 经 tools/pack-cg.py 压缩内嵌。\n"
      " * 重新生成或替换图片后，跑一次 python tools/pack-cg.py 即可。 */\n"
      "(function(g){'use strict';(g.SP=g.SP||{}).cg={\n" + ',\n'.join(parts) + '\n};})(window);\n')
with open(OUT, 'w', encoding='utf-8') as f:
    f.write(js)
print(f"-> js/cgdata.js  合计 base64 {total//1024} KB")
