import os
from PIL import Image
import numpy as np
from scipy.ndimage import binary_dilation, binary_fill_holes, binary_closing

raw_dir = r"C:\Users\nurda\capri-assistant\art_raw"
out_dir = r"C:\Users\nurda\capri-assistant\app\assets\capri"
os.makedirs(out_dir, exist_ok=True)

def extract_capri(src_file, out_file):
    img = Image.open(src_file).convert("RGBA")
    arr = np.array(img)
    r, g, b, a = arr[:,:,0], arr[:,:,1], arr[:,:,2], arr[:,:,3]

    is_mane = (r > 130) & (b > 50) & (r > g + 25)
    is_mask = (g > 100) & (g > r + 15)
    is_eye_blue = (b > 120) & (b > r + 25)
    is_purple_edge = (b > 90) & (r > 65) & (g < 90)
    is_white = (r > 180) & (g > 180) & (b > 180)

    char_features = is_mane | is_mask | is_eye_blue | is_purple_edge | is_white
    closed = binary_closing(char_features, structure=np.ones((9, 9)))
    filled = binary_fill_holes(closed)

    # Exclude screen borders if any
    filled[:, 1750:] = False
    filled[:15, :] = False

    is_black_armor = filled & (r < 60) & (g < 60) & (b < 60)
    final_mask = char_features | is_black_armor
    final_mask = binary_closing(final_mask, structure=np.ones((5, 5)))

    out_arr = arr.copy()
    out_arr[:,:,3] = np.where(final_mask, 255, 0)
    coords = np.argwhere(out_arr[:,:,3] > 0)
    y0, x0 = coords.min(axis=0)
    y1, x1 = coords.max(axis=0) + 1
    cropped = Image.fromarray(out_arr[y0:y1, x0:x1])
    cropped.save(out_file)
    print(f"Saved {out_file}: {cropped.size}")

extract_capri(os.path.join(raw_dir, "shot_02.png"), os.path.join(out_dir, "capri-laugh-hd.png"))
extract_capri(os.path.join(raw_dir, "shot_03.png"), os.path.join(out_dir, "capri-wink-hd.png"))
