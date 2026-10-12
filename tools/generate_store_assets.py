"""Generates Google Play listing graphics from the app icon.

Outputs (in store/):
  icon-512.png              Play Store app icon (512x512, 32-bit PNG)
  feature-graphic.png       Feature graphic (1024x500, no alpha)
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ICON = ROOT / "apps/muse-mobile/assets/icon.png"
OUT = ROOT / "store"
TOP = (43, 18, 36)
MID = (122, 36, 70)
BOTTOM = (184, 58, 94)
FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Georgia Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
]


def font(size: int) -> ImageFont.FreeTypeFont:
    for candidate in FONT_CANDIDATES:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


def gradient(width: int, height: int) -> Image.Image:
    image = Image.new("RGB", (width, height))
    pixels = image.load()
    for x in range(width):
        for y in range(height):
            t = (x / width) * 0.6 + (y / height) * 0.4
            if t < 0.5:
                a, b, k = TOP, MID, t / 0.5
            else:
                a, b, k = MID, BOTTOM, (t - 0.5) / 0.5
            pixels[x, y] = tuple(int(a[i] + (b[i] - a[i]) * k) for i in range(3))
    return image


def rounded(image: Image.Image, radius: int) -> Image.Image:
    mask = Image.new("L", image.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, *image.size), radius=radius, fill=255)
    result = image.convert("RGBA")
    result.putalpha(mask)
    return result


def main() -> None:
    OUT.mkdir(exist_ok=True)
    icon = Image.open(ICON).convert("RGBA")
    icon.resize((512, 512), Image.LANCZOS).save(OUT / "icon-512.png")

    banner = gradient(1024, 500)
    mark = rounded(icon.resize((220, 220), Image.LANCZOS), 56)
    banner.paste(mark, (90, 140), mark)
    draw = ImageDraw.Draw(banner)
    draw.text((360, 150), "Muse", font=font(110), fill=(255, 255, 255))
    draw.text((364, 290), "Dating, sparked by creativity.", font=font(38), fill=(255, 235, 240))
    banner.save(OUT / "feature-graphic.png")
    print(f"Wrote {OUT / 'icon-512.png'} and {OUT / 'feature-graphic.png'}")


if __name__ == "__main__":
    main()
