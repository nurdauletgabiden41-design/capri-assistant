import os
from PIL import Image
import numpy as np

src = r"C:\Users\nurda\capri-assistant\art_raw\shot_01.png"
img = Image.open(src).convert("RGBA")
arr = np.array(img)
r, g, b, a = arr[:,:,0], arr[:,:,1], arr[:,:,2], arr[:,:,3]

# In shot_01, Capri is the massive magenta/red mane, neon green mask, black cowl, purple outline.
# The background is the grey/blue wall and notice board (r < 120, g < 120, b < 120 or dull grey/blue).
# Let's define the character mask:
is_mane = (r > 140) & (b > 60) & (r > g + 30) # hot magenta/red with specks
is_mask = (g > 110) & (g > r + 15)            # bright green
is_eye_blue = (b > 130) & (b > r + 30)        # blue iris
is_purple_edge = (b > 100) & (r > 70) & (g < 90) # purple chromatic edge
is_white = (r > 190) & (g > 190) & (b > 190)  # white specks or eyes

# Black cowl/hair is inside or adjacent to mane:
# Let's find bounding box or flood fill from mask
char_features = is_mane | is_mask | is_eye_blue | is_purple_edge | is_white

from scipy.ndimage import binary_dilation, binary_fill_holes, binary_closing
# Close small holes inside character
closed = binary_closing(char_features, structure=np.ones((9, 9)))
filled = binary_fill_holes(closed)

# But background also has black border on the right edge (x > 1750)
filled[:, 1750:] = False

# Any black parts inside the filled silhouette that are near black (r < 60, g < 60, b < 60)
is_black_armor = filled & (r < 60) & (g < 60) & (b < 60)

final_mask = char_features | is_black_armor
# Smooth edges
final_mask = binary_closing(final_mask, structure=np.ones((5, 5)))

out_arr = arr.copy()
out_arr[:,:,3] = np.where(final_mask, 255, 0)

coords = np.argwhere(out_arr[:,:,3] > 0)
y0, x0 = coords.min(axis=0)
y1, x1 = coords.max(axis=0) + 1

cropped = Image.fromarray(out_arr[y0:y1, x0:x1])
out_path = r"C:\Users\nurda\capri-assistant\app\assets\capri\capri-calm-bust-hd.png"
cropped.save(out_path)
print("Saved:", out_path, cropped.size)
