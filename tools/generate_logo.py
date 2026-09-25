from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


BASE_SIZE = 1024
BG_TOP = (255, 230, 222)
BG_BOTTOM = (146, 31, 64)
M_COLOR = (255, 244, 238)
M_SHADOW = (56, 10, 25, 150)
HEART_COLOR = (255, 126, 141)


def lerp(a: int, b: int, t: float) -> int:
    return int(a + (b - a) * t)


def make_background(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), BG_TOP + (255,))
    pixels = img.load()
    for y in range(size):
        t = y / (size - 1)
        r = lerp(BG_TOP[0], BG_BOTTOM[0], t)
        g = lerp(BG_TOP[1], BG_BOTTOM[1], t)
        b = lerp(BG_TOP[2], BG_BOTTOM[2], t)
        for x in range(size):
            pixels[x, y] = (r, g, b, 255)

    glow = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_radius = int(size * 0.6)
    cx = cy = size // 2
    glow_draw.ellipse(
        (cx - glow_radius, cy - glow_radius, cx + glow_radius, cy + glow_radius),
        fill=(255, 255, 255, 120),
    )
    glow = glow.filter(ImageFilter.GaussianBlur(radius=int(size * 0.1)))
    return Image.alpha_composite(img, glow)


def draw_logo_mark(img: Image.Image, size: int) -> Image.Image:
    draw = ImageDraw.Draw(img)
    font_path = "/System/Library/Fonts/Supplemental/Didot.ttc"
    font = ImageFont.truetype(font_path, size=int(size * 0.62))
    text = "M"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    x = (size - text_w) / 2
    y = (size - text_h) / 2 - size * 0.02
    draw.text((x + 0, y + size * 0.03), text, font=font, fill=M_SHADOW)
    draw.text((x, y), text, font=font, fill=M_COLOR)

    heart_size = int(size * 0.12)
    hx = int(x + text_w * 0.63)
    hy = int(y + text_h * 0.08)
    draw_heart(draw, (hx, hy), heart_size, HEART_COLOR)
    return img


def draw_heart(draw: ImageDraw.ImageDraw, center: tuple[int, int], size: int, color: tuple[int, int, int]) -> None:
    cx, cy = center
    r = size // 2
    left = (cx - r, cy - r, cx, cy + r)
    right = (cx, cy - r, cx + r, cy + r)
    draw.ellipse(left, fill=color)
    draw.ellipse(right, fill=color)
    draw.polygon([(cx - r, cy), (cx + r, cy), (cx, cy + int(r * 1.5))], fill=color)


def render_base() -> Image.Image:
    base = make_background(BASE_SIZE)
    return draw_logo_mark(base, BASE_SIZE)


def render_foreground() -> Image.Image:
    base = Image.new("RGBA", (BASE_SIZE, BASE_SIZE), (0, 0, 0, 0))
    glow = Image.new("RGBA", (BASE_SIZE, BASE_SIZE), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_radius = int(BASE_SIZE * 0.35)
    cx = cy = BASE_SIZE // 2
    glow_draw.ellipse(
        (cx - glow_radius, cy - glow_radius, cx + glow_radius, cy + glow_radius),
        fill=(255, 178, 188, 120),
    )
    glow = glow.filter(ImageFilter.GaussianBlur(radius=int(BASE_SIZE * 0.08)))
    base = Image.alpha_composite(base, glow)
    return draw_logo_mark(base, BASE_SIZE)


def resize_and_save(base: Image.Image, target_path: Path, fmt: str = "PNG") -> None:
    target_path.parent.mkdir(parents=True, exist_ok=True)
    size = base.size
    if target_path.exists():
        with Image.open(target_path) as existing:
            size = existing.size
    resized = base.resize(size, Image.LANCZOS)
    resized.save(target_path, format=fmt)


def main() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    base = render_base()
    foreground = render_foreground()
    targets = [
        repo_root / "apps/muse-mobile/assets/icon.png",
        repo_root / "apps/muse-mobile/assets/adaptive-icon.png",
        repo_root / "apps/muse-mobile/assets/splash-icon.png",
        repo_root / "apps/muse-mobile/assets/favicon.png",
        repo_root / "apps/muse-mobile/ios/Muse/Images.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png",
        repo_root / "apps/muse-mobile/ios/Muse/Images.xcassets/SplashScreenLegacy.imageset/image.png",
        repo_root / "apps/muse-mobile/ios/Muse/Images.xcassets/SplashScreenLegacy.imageset/image@2x.png",
        repo_root / "apps/muse-mobile/ios/Muse/Images.xcassets/SplashScreenLegacy.imageset/image@3x.png",
    ]
    for target in targets:
        resize_and_save(base, target)

    splash_targets = [
        repo_root / "apps/muse-mobile/android/app/src/main/res/drawable-mdpi/splashscreen_logo.png",
        repo_root / "apps/muse-mobile/android/app/src/main/res/drawable-hdpi/splashscreen_logo.png",
        repo_root / "apps/muse-mobile/android/app/src/main/res/drawable-xhdpi/splashscreen_logo.png",
        repo_root / "apps/muse-mobile/android/app/src/main/res/drawable-xxhdpi/splashscreen_logo.png",
        repo_root / "apps/muse-mobile/android/app/src/main/res/drawable-xxxhdpi/splashscreen_logo.png",
    ]
    for target in splash_targets:
        resize_and_save(base, target)

    mipmap_sizes = {
        "mdpi": (48, 48, 108, 108),
        "hdpi": (72, 72, 162, 162),
        "xhdpi": (96, 96, 216, 216),
        "xxhdpi": (144, 144, 324, 324),
        "xxxhdpi": (192, 192, 432, 432),
    }
    for density, (icon_w, icon_h, fg_w, fg_h) in mipmap_sizes.items():
        icon_path = repo_root / f"apps/muse-mobile/android/app/src/main/res/mipmap-{density}/ic_launcher.webp"
        round_path = repo_root / f"apps/muse-mobile/android/app/src/main/res/mipmap-{density}/ic_launcher_round.webp"
        fg_path = repo_root / f"apps/muse-mobile/android/app/src/main/res/mipmap-{density}/ic_launcher_foreground.webp"
        resize_and_save(base, icon_path, fmt="WEBP")
        resize_and_save(base, round_path, fmt="WEBP")
        resize_and_save(foreground.resize((fg_w, fg_h), Image.LANCZOS), fg_path, fmt="WEBP")


if __name__ == "__main__":
    main()
