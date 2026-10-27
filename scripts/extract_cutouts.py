import os
from PIL import Image
from rembg import remove, new_session

raw_dir = r"C:\Users\nurda\capri-assistant\art_raw"
out_dir = r"C:\Users\nurda\capri-assistant\art_cutouts"
os.makedirs(out_dir, exist_ok=True)

session = new_session("u2net")

targets = ["shot_01.png", "shot_02.png", "shot_03.png", "shot_04.png"]

for name in targets:
    src_path = os.path.join(raw_dir, name)
    out_path = os.path.join(out_dir, "cut_" + name)
    print(f"Processing {name}...")
    inp = Image.open(src_path)
    # crop media player UI if any at the top or bottom
    # shot_04 has player UI at the bottom
    w, h = inp.size
    # crop bottom player bar if present (e.g. bottom 50px)
    box = (0, 0, w, h - 45) if name == "shot_04.png" else (0, 0, w, h)
    cropped = inp.crop(box)
    result = remove(cropped, session=session)
    result.save(out_path)
    print(f"Saved {out_path} ({result.size})")
