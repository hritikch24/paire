"""Generates the Android status-bar notification icon (white glyph on transparent).

Android renders notification small icons as a silhouette, so the icon must be a
single white shape with transparency. Output: apps/muse-mobile/assets/notification-icon.png
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

SIZE = 96
FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Georgia Bold.ttf",
    "/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf",
]
OUTPUT = Path(__file__).resolve().parents[1] / "apps/muse-mobile/assets/notification-icon.png"


def load_font(size: int) -> ImageFont.FreeTypeFont:
    for candidate in FONT_CANDIDATES:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


def main() -> None:
    scale = 4  # draw large, then downsample for smooth edges
    canvas = Image.new("RGBA", (SIZE * scale, SIZE * scale), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    font = load_font(int(SIZE * scale * 0.78))
    left, top, right, bottom = draw.textbbox((0, 0), "M", font=font)
    x = (canvas.width - (right - left)) / 2 - left
    y = (canvas.height - (bottom - top)) / 2 - top
    draw.text((x, y), "M", font=font, fill=(255, 255, 255, 255))
    canvas.resize((SIZE, SIZE), Image.LANCZOS).save(OUTPUT)
    print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    main()
