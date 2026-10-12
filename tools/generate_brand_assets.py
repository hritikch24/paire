"""Generates the Paire logo and every icon/store/site asset from one vector design.

The mark: a paper aeroplane folded from a love note, with a heart cut out of its
top wing, for "every love story starts with a note" (and the note that flies off
when you send one), on a plum-to-rose gradient. Rendered with headless Chrome
(exact SVG, and the app's own Space Grotesk font for the wordmark), then
finished with Pillow.

Outputs:
  apps/muse-mobile/assets/icon.png                1024, full-bleed square (iOS, legacy Android)
  apps/muse-mobile/assets/adaptive-icon.png       1024, mark only, transparent (Android foreground)
  apps/muse-mobile/assets/adaptive-background.png 1024, gradient (Android background)
  apps/muse-mobile/assets/adaptive-monochrome.png 1024, white mark (Android 13+ themed icons)
  apps/muse-mobile/assets/splash-icon.png         1024, rounded icon on transparent
  apps/muse-mobile/assets/notification-icon.png   96, white silhouette (Android status bar)
  apps/muse-mobile/assets/favicon.png             48
  apps/muse-mobile/assets/wordmark.png            "paire" in white, transparent (splash/welcome;
                                                  an image so it never depends on fonts loading)
  store/icon-512.png                              Play Store icon
  store/feature-graphic.png                       1024x500 Play feature graphic
  apps/web/site/favicon.png, apple-touch-icon.png, icon-192.png, icon-512.png
  apps/web/site/og-image.png                      1200x630 link preview

Run: python3 tools/generate_brand_assets.py
"""
from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "apps/muse-mobile/assets"
STORE = ROOT / "store"
SITE = ROOT / "apps/web/site"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
FONT = ROOT / "apps/muse-mobile/node_modules/@expo-google-fonts/space-grotesk/700Bold/SpaceGrotesk_700Bold.ttf"

GRADIENT = """
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#3A1236"/>
    <stop offset="0.55" stop-color="#9A2C5A"/>
    <stop offset="1" stop-color="#EE7A82"/>
  </linearGradient>
  <radialGradient id="glow" cx="0.28" cy="0.22" r="0.7">
    <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.18"/>
    <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
  </radialGradient>
"""

# The mark on a 1024 grid, centred. Points: nose, left wing tip, centre crease,
# left keel, inner keel, right wing tip; the heart is cut out of the top wing.
HEART = "M50 88 C20 66 0 48 0 26 C0 11 12 0 26 0 C37 0 46 6 50 15 C54 6 63 0 74 0 C88 0 100 11 100 26 C100 48 80 66 50 88 Z"
N, L, C, B, K, R = (858, 205), (166, 469), (486, 599), (436, 819), (556, 711), (666, 789)
_pts = lambda *points: " ".join(f"{x},{y}" for x, y in points)
MARK = f"""
  <mask id="heart-cut" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
    <rect width="1024" height="1024" fill="white"/>
    <path transform="translate(418 377) scale(1.45)" d="{HEART}" fill="black"/>
  </mask>
  <g mask="url(#heart-cut)">
    <polygon points="{_pts(L, N, C)}" fill="{{top}}" stroke="{{top}}" stroke-width="2" stroke-linejoin="round"/>
    <polygon points="{_pts(N, R, K, C)}" fill="{{right}}" stroke="{{right}}" stroke-width="2" stroke-linejoin="round"/>
    <polygon points="{_pts(L, C, B)}" fill="{{left}}" stroke="{{left}}" stroke-width="2" stroke-linejoin="round"/>
    <polygon points="{_pts(C, K, B)}" fill="{{keel}}" stroke="{{keel}}" stroke-width="2" stroke-linejoin="round"/>
  </g>
"""
PAPER = dict(top="#FFFFFF", right="#FFE9EE", left="#FFD3DD", keel="#F3A3B5")
WHITE = dict(top="#FFFFFF", right="#FFFFFF", left="#FFFFFF", keel="#FFFFFF")


def svg(size: tuple[int, int], body: str, defs: str = GRADIENT) -> str:
    width, height = size
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">'
        f"<defs>{defs}</defs>{body}</svg>"
    )


def mark(colors: dict[str, str] = PAPER, scale: float = 1.0, size: int = 1024) -> str:
    offset = size / 2 - 512 * scale
    return f'<g transform="translate({offset} {offset}) scale({scale})">{MARK.format(**colors)}</g>'


def render(markup: str, size: tuple[int, int], out: Path) -> None:
    """Renders an SVG or HTML string to a PNG of exactly `size` with headless Chrome."""
    with tempfile.TemporaryDirectory() as tmp:
        page = Path(tmp) / "page.html"
        page.write_text(
            "<!doctype html><html><head><style>"
            f"@font-face {{ font-family: 'Space Grotesk'; src: url('file://{FONT}'); font-weight: 700; }}"
            "html, body { margin: 0; padding: 0; background: transparent; overflow: hidden; }"
            "svg { display: block; }"
            f"</style></head><body>{markup}</body></html>"
        )
        shot = Path(tmp) / "shot.png"
        subprocess.run(
            [
                CHROME,
                "--headless=new",
                "--disable-gpu",
                "--hide-scrollbars",
                "--force-device-scale-factor=1",
                "--default-background-color=00000000",
                f"--window-size={size[0]},{size[1]}",
                f"--screenshot={shot}",
                page.as_uri(),
            ],
            check=True,
            capture_output=True,
        )
        image = Image.open(shot).convert("RGBA").crop((0, 0, size[0], size[1]))
        out.parent.mkdir(parents=True, exist_ok=True)
        image.save(out)


def banner(width: int, height: int, mark_size: int) -> str:
    """The Play feature graphic and the site's link preview: mark, wordmark, tagline."""
    left = round(width * 0.07)
    text_left = left + mark_size + round(width * 0.04)
    return f"""
    <div style="width:{width}px;height:{height}px;position:relative;overflow:hidden;
                background:linear-gradient(135deg,#3A1236 0%,#9A2C5A 55%,#EE7A82 100%);font-family:'Space Grotesk';">
      <div style="position:absolute;inset:0;background:radial-gradient(circle at 20% 20%,rgba(255,255,255,.18),transparent 60%);"></div>
      <svg style="position:absolute;left:{left}px;top:{(height - mark_size) // 2}px" width="{mark_size}" height="{mark_size}" viewBox="0 0 1024 1024">{MARK.format(**PAPER)}</svg>
      <div style="position:absolute;left:{text_left}px;top:50%;transform:translateY(-50%);color:#fff;">
        <div style="font-size:{round(height * 0.25)}px;line-height:1;font-weight:700;letter-spacing:-4px;">paire</div>
        <div style="font-size:{round(height * 0.076)}px;line-height:1.25;margin-top:{round(height * 0.04)}px;font-weight:700;">Find your Paire.</div>
        <div style="font-size:{round(height * 0.048)}px;margin-top:{round(height * 0.028)}px;opacity:.85;font-weight:700;">Dating where women set the rules</div>
      </div>
    </div>"""


def main() -> None:
    full = svg((1024, 1024), '<rect width="1024" height="1024" fill="url(#bg)"/><rect width="1024" height="1024" fill="url(#glow)"/>' + mark(scale=0.86))
    render(full, (1024, 1024), ASSETS / "icon.png")
    # iOS rejects icons with transparency.
    Image.open(ASSETS / "icon.png").convert("RGB").save(ASSETS / "icon.png")

    # Android adaptive icon: the mark must sit inside the central 66% safe zone.
    render(svg((1024, 1024), mark(scale=0.6)), (1024, 1024), ASSETS / "adaptive-icon.png")
    render(svg((1024, 1024), mark(WHITE, scale=0.6)), (1024, 1024), ASSETS / "adaptive-monochrome.png")
    render(
        svg((1024, 1024), '<rect width="1024" height="1024" fill="url(#bg)"/><rect width="1024" height="1024" fill="url(#glow)"/>'),
        (1024, 1024),
        ASSETS / "adaptive-background.png",
    )

    rounded = svg(
        (1024, 1024),
        '<clipPath id="r"><rect x="112" y="112" width="800" height="800" rx="208"/></clipPath>'
        '<g clip-path="url(#r)"><rect width="1024" height="1024" fill="url(#bg)"/><rect width="1024" height="1024" fill="url(#glow)"/></g>'
        + mark(scale=0.66),
    )
    render(rounded, (1024, 1024), ASSETS / "splash-icon.png")

    # Status-bar icon: white silhouette only (Android tints it).
    silhouette = ASSETS / "notification-icon.png"
    render(svg((1024, 1024), mark(WHITE, scale=0.92)), (1024, 1024), silhouette)
    Image.open(silhouette).resize((96, 96), Image.LANCZOS).save(silhouette)

    Image.open(ASSETS / "icon.png").resize((48, 48), Image.LANCZOS).save(ASSETS / "favicon.png")
    Image.open(ASSETS / "icon.png").resize((512, 512), Image.LANCZOS).save(STORE / "icon-512.png")
    for name, side in (("favicon.png", 48), ("apple-touch-icon.png", 180), ("icon-192.png", 192), ("icon-512.png", 512)):
        Image.open(ASSETS / "icon.png").resize((side, side), Image.LANCZOS).save(SITE / name)

    # Big enough for a 170pt-wide wordmark on a 3x screen; the app scales it down.
    wordmark = """
    <div style="width:1300px;height:360px;display:flex;align-items:center;justify-content:center;
                font-family:'Space Grotesk';font-weight:700;font-size:300px;line-height:1;color:#fff;
                letter-spacing:-6px;padding-bottom:36px;box-sizing:border-box;">paire</div>"""
    render(wordmark, (1300, 360), ASSETS / "wordmark.png")
    trimmed = Image.open(ASSETS / "wordmark.png")
    trimmed.crop(trimmed.getbbox()).save(ASSETS / "wordmark.png")

    render(banner(1024, 500, 320), (1024, 500), STORE / "feature-graphic.png")
    Image.open(STORE / "feature-graphic.png").convert("RGB").save(STORE / "feature-graphic.png")
    render(banner(1200, 630, 380), (1200, 630), SITE / "og-image.png")
    Image.open(SITE / "og-image.png").convert("RGB").save(SITE / "og-image.png")
    print("Brand assets written.")


if __name__ == "__main__":
    main()
