import os
from PIL import Image
import numpy as np

src = r"C:\Users\nurda\capri-assistant\art_cutouts\cut_shot_04.png"
img = Image.open(src).convert("RGBA")
arr = np.array(img)

# Remove the grey shadow on the bed (it is desaturated grey/dark, unlike Capri's vivid red, neon green, and purple)
r, g, b, a = arr[:,:,0], arr[:,:,1], arr[:,:,2], arr[:,:,3]

# Capri's colors are:
# 1. Hot red/magenta mane: R > 150, R > G + 40
# 2. Neon green mask/parts: G > 140, G > R + 20
# 3. Violet outline/accent: B > 120, R > 80, G < 100
# 4. Black construct body: R < 50, G < 50, B < 60, but localized inside character bounds
# 5. White sparkles: R > 200, G > 200, B > 200

# Notice the bed shadow on the left is around x: 200..600, y: 500..800
# Let's zero out pixels that are dull grey/brown background
is_vivid_red = (r > 120) & (r > g * 1.3)
is_vivid_green = (g > 100) & (g > r * 1.2)
is_vivid_blue_purple = (b > 100) & (b > g * 1.2)
is_white_sparkle = (r > 200) & (g > 200) & (b > 200) & (a > 50)
is_black_armor = (r < 50) & (g < 50) & (b < 60) & (a > 80)

# The shadow has low saturation: |r-g| < 30 and |g-b| < 30 and (r < 120)
is_dull_shadow = (np.abs(r.astype(int) - g.astype(int)) < 30) & (np.abs(g.astype(int) - b.astype(int)) < 30) & (r < 120)

# Zero out dull shadow only in bed region (x < 650, y > 500)
clean_mask = a > 0
bed_region = (np.arange(arr.shape[1])[None, :] < 650) & (np.arange(arr.shape[0])[:, None] > 500)
clean_mask[is_dull_shadow & bed_region] = False

arr[:,:,3] = np.where(clean_mask, a, 0)

# Crop to non-transparent bounding box
coords = np.argwhere(arr[:,:,3] > 20)
y0, x0 = coords.min(axis=0)
y1, x1 = coords.max(axis=0) + 1

cropped = Image.fromarray(arr[y0:y1, x0:x1])
out_path = r"C:\Users\nurda\capri-assistant\app\assets\capri\capri-sitting-hd.png"
cropped.save(out_path)
print(f"Saved clean sitting pose: {out_path}, size={cropped.size}")
