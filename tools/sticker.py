#!/usr/bin/env python3
"""Cut the person out of a frame as a sticker with a thick white outline (CapCut freeze-frame look).

Usage: python3 tools/sticker.py frame.png out.png --model u2net_human_seg.onnx [--outline 14]
The model is rembg's U2-Net human segmentation ONNX:
https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net_human_seg.onnx
"""
import argparse

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageFilter

ap = argparse.ArgumentParser()
ap.add_argument("frame")
ap.add_argument("out")
ap.add_argument("--model", required=True)
ap.add_argument("--outline", type=int, default=14, help="white border width in px")
a = ap.parse_args()

img = Image.open(a.frame).convert("RGB")
x = np.asarray(img.resize((320, 320), Image.LANCZOS), dtype=np.float32) / 255.0
x = (x - (0.485, 0.456, 0.406)) / (0.229, 0.224, 0.225)
x = x.transpose(2, 0, 1)[None].astype(np.float32)
sess = ort.InferenceSession(a.model, providers=["CPUExecutionProvider"])
pred = sess.run(None, {sess.get_inputs()[0].name: x})[0][0, 0]
pred = (pred - pred.min()) / (pred.max() - pred.min() + 1e-8)
mask = Image.fromarray((pred * 255).astype(np.uint8)).resize(img.size, Image.LANCZOS)

# hard-ish subject alpha, slightly feathered
alpha = mask.point(lambda v: 255 if v > 140 else (0 if v < 90 else int((v - 90) * 255 / 50)))
# white outline: grow the subject, then round the corners off
grown = mask.point(lambda v: 255 if v > 110 else 0)
for _ in range(max(1, a.outline // 4)):
    grown = grown.filter(ImageFilter.MaxFilter(9))
grown = grown.filter(ImageFilter.GaussianBlur(3)).point(lambda v: 255 if v > 100 else 0).filter(ImageFilter.GaussianBlur(1))

sticker = Image.new("RGBA", img.size, (0, 0, 0, 0))
sticker.paste(Image.new("RGBA", img.size, (255, 255, 255, 255)), (0, 0), grown)
sticker.paste(img.convert("RGBA"), (0, 0), alpha)
sticker.save(a.out)
print(f"sticker {a.out}  bbox {sticker.getbbox()}")
