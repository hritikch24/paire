from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw


SIZE = 128
STROKE = 10
COLOR = (255, 255, 255, 255)


def new_canvas() -> Image.Image:
    return Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))


def draw_discover() -> Image.Image:
    img = new_canvas()
    draw = ImageDraw.Draw(img)
    center = SIZE // 2
    radius = SIZE * 0.35
    draw.ellipse(
        (center - radius, center - radius, center + radius, center + radius),
        outline=COLOR,
        width=STROKE,
    )
    draw.polygon(
        [
            (center, center - radius * 0.6),
            (center + radius * 0.6, center + radius * 0.6),
            (center, center + radius * 0.3),
            (center - radius * 0.6, center + radius * 0.6),
        ],
        outline=COLOR,
        fill=None,
    )
    draw.line(
        [
            (center, center - radius * 0.6),
            (center + radius * 0.6, center + radius * 0.6),
        ],
        fill=COLOR,
        width=STROKE,
    )
    return img


def draw_matches() -> Image.Image:
    img = new_canvas()
    draw = ImageDraw.Draw(img)
    cx = SIZE // 2
    cy = SIZE * 0.45
    r = SIZE * 0.22
    left = (cx - r * 1.1, cy - r, cx - r * 0.1, cy + r)
    right = (cx + r * 0.1, cy - r, cx + r * 1.1, cy + r)
    draw.ellipse(left, outline=COLOR, width=STROKE)
    draw.ellipse(right, outline=COLOR, width=STROKE)
    draw.polygon(
        [
            (cx - r * 1.25, cy + r * 0.4),
            (cx + r * 1.25, cy + r * 0.4),
            (cx, cy + r * 1.9),
        ],
        outline=COLOR,
        fill=None,
    )
    return img


def draw_profile() -> Image.Image:
    img = new_canvas()
    draw = ImageDraw.Draw(img)
    cx = SIZE // 2
    cy = SIZE * 0.36
    r = SIZE * 0.18
    draw.ellipse(
        (cx - r, cy - r, cx + r, cy + r),
        outline=COLOR,
        width=STROKE,
    )
    body_top = SIZE * 0.58
    body_w = SIZE * 0.55
    draw.rounded_rectangle(
        (
            cx - body_w / 2,
            body_top,
            cx + body_w / 2,
            SIZE * 0.88,
        ),
        radius=SIZE * 0.18,
        outline=COLOR,
        width=STROKE,
    )
    return img


def main() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    target_dir = repo_root / "apps/muse-mobile/assets/icons"
    target_dir.mkdir(parents=True, exist_ok=True)

    icons = {
        "tab-discover.png": draw_discover(),
        "tab-matches.png": draw_matches(),
        "tab-profile.png": draw_profile(),
    }
    for name, img in icons.items():
        img.save(target_dir / name, format="PNG")


if __name__ == "__main__":
    main()
