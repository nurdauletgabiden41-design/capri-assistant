from PIL import Image, ImageFilter
import numpy as np

src = r"C:\Users\nurda\capri-assistant\app\assets\capri\capri-full.png"
out = r"C:\Users\nurda\capri-assistant\app\assets\capri\capri-stand-hd.png"
img = Image.open(src).convert("RGBA")

# Upscale 4x with Lanczos
w, h = img.size
up = img.resize((w * 4, h * 4), Image.Resampling.LANCZOS)

# Crisp up anime line edges
# Clean alpha threshold to remove bilinear semi-transparent blur around edges
arr = np.array(up)
alpha = arr[:,:,3]
# Sharpen the alpha edge: alpha below 30 becomes 0, alpha above 180 becomes 255
arr[:,:,3] = np.where(alpha < 25, 0, np.where(alpha > 180, 255, alpha))

crisp = Image.fromarray(arr)
# Light unsharp mask on RGB only
rgb = crisp.convert("RGB").filter(ImageFilter.UnsharpMask(radius=2, percent=130, threshold=3))
crisp.paste(rgb, mask=crisp.split()[3])

crisp.save(out)
print("Saved HD standing sprite:", out, crisp.size)
