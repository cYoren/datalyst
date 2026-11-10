"""Align small icons, launch screens, and Chrome store art with the existing logo.

The mark itself is unchanged. This only resizes public/assets/logo.png and
replaces the default Capacitor splash (a blue geometric icon) with that logo
on the app's dark background. Chrome store frames keep their popup screenshots
and get new caption text.
"""

from __future__ import annotations

import base64
import glob
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
LOGO = Image.open(ROOT / "public/assets/logo.png").convert("RGBA")
BG = (18, 19, 22)
INTER = "/usr/share/fonts/truetype/macos/Inter-SemiBold.ttf"
INTER_REG = "/usr/share/fonts/truetype/macos/Inter-Regular.ttf"


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def save_png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG", optimize=True)


def resized(size: int) -> Image.Image:
    return LOGO.resize((size, size), Image.Resampling.LANCZOS)


def write_favicons() -> None:
    public = ROOT / "public"
    for size, name in ((16, "favicon-16x16.png"), (32, "favicon-32x32.png"), (96, "favicon-96x96.png")):
        save_png(resized(size).convert("RGB"), public / name)
    icon16 = resized(16).convert("RGBA")
    icon32 = resized(32).convert("RGBA")
    icon48 = resized(48).convert("RGBA")
    icon16.save(
        public / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
        append_images=[icon32, icon48],
    )
    embedded = resized(256).convert("RGB")
    buffer = Path("/tmp/datalyst-favicon-embed.png")
    embedded.save(buffer, format="PNG", optimize=True)
    encoded = base64.b64encode(buffer.read_bytes()).decode("ascii")
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-label="Datalyst">'
        f'<image width="256" height="256" href="data:image/png;base64,{encoded}"/>'
        "</svg>\n"
    )
    (public / "favicon.svg").write_text(svg)


def content_tile() -> Image.Image:
    """White rounded tile. Dark pixels touching the edge become the splash background.

    The letterform stays black because it is enclosed by the white tile.
    """
    rgb = LOGO.convert("RGB")
    pixels = rgb.load()
    xs, ys = [], []
    for y in range(rgb.height):
        for x in range(rgb.width):
            r, g, b = pixels[x, y]
            if r > 30 or g > 30 or b > 30:
                xs.append(x)
                ys.append(y)
    tile = LOGO.crop((min(xs), min(ys), max(xs) + 1, max(ys) + 1)).convert("RGBA")
    px = tile.load()
    width, height = tile.size
    stack = [(0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)]
    seen: set[tuple[int, int]] = set()
    while stack:
        x, y = stack.pop()
        if (x, y) in seen or x < 0 or y < 0 or x >= width or y >= height:
            continue
        seen.add((x, y))
        r, g, b, _ = px[x, y]
        if r < 40 and g < 40 and b < 40:
            px[x, y] = (*BG, 255)
            stack.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    return tile


def write_splashes() -> None:
    tile = content_tile()
    paths = glob.glob(str(ROOT / "android/app/src/main/res/drawable*/splash.png"))
    paths += glob.glob(str(ROOT / "ios/App/App/Assets.xcassets/Splash.imageset/*.png"))
    for raw in paths:
        current = Image.open(raw)
        canvas = Image.new("RGB", current.size, BG)
        side = max(48, int(min(current.size) * 0.22))
        icon = tile.resize((side, side), Image.Resampling.LANCZOS).convert("RGB")
        canvas.paste(icon, ((current.width - side) // 2, (current.height - side) // 2))
        save_png(canvas, Path(raw))
        print("splash", raw, current.size)


def write_chrome_icons() -> None:
    targets = {
        16: ROOT / "clients/chrome-extension/icons/icon16.png",
        32: ROOT / "clients/chrome-extension/icons/icon32.png",
        48: ROOT / "clients/chrome-extension/icons/icon48.png",
        128: ROOT / "clients/chrome-extension/icons/icon128.png",
    }
    for size, path in targets.items():
        save_png(resized(size).convert("RGB"), path)
    save_png(resized(128).convert("RGB"), ROOT / "clients/store-chrome/icon-128.png")


def fill_left(image: Image.Image, until_x: int) -> ImageDraw.ImageDraw:
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, until_x, image.height), fill=BG)
    return draw


def write_store_frames() -> None:
    store = ROOT / "clients/store-chrome"
    icon = content_tile().resize((128, 128), Image.Resampling.LANCZOS).convert("RGB")

    promo = Image.new("RGB", (440, 280), BG)
    draw = ImageDraw.Draw(promo)
    promo.paste(icon.resize((56, 56), Image.Resampling.LANCZOS), (40, 64))
    draw.text((40, 140), "Datalyst", font=font(INTER, 36), fill=(236, 236, 238))
    draw.text((40, 190), "Symptoms, habits, and health", font=font(INTER_REG, 19), fill=(165, 167, 174))
    save_png(promo, store / "promo-440x280.png")

    for name, until in (
        ("shot-1-proposals.png", 700),
        ("shot-2-logged.png", 700),
        ("shot-3-connect.png", 700),
        ("marquee-1400x560.png", 860),
    ):
        image = Image.open(store / name).convert("RGB")
        draw = fill_left(image, until)
        if name.startswith("marquee"):
            image.paste(icon.resize((64, 64), Image.Resampling.LANCZOS), (100, 150))
            draw.text((100, 230), "Log symptoms and habits", font=font(INTER, 52), fill=(236, 236, 238))
            draw.text(
                (100, 310),
                "Discover what affects your health, from any tab.",
                font=font(INTER_REG, 24),
                fill=(165, 167, 174),
            )
        else:
            titles = {
                "shot-1-proposals.png": (
                    "Log symptoms and habits\nin one sentence",
                    "Type it the way you would say it. Datalyst matches\neach part to the right tracker.",
                ),
                "shot-2-logged.png": (
                    "Saved in a second,\nfrom any tab",
                    "Sleep, symptoms and habits land in your\nDatalyst history.",
                ),
                "shot-3-connect.png": (
                    "Connects to your\nDatalyst account",
                    "Paste the key from Settings once.\nDisconnect any time.",
                ),
            }
            title, body = titles[name]
            image.paste(icon.resize((64, 64), Image.Resampling.LANCZOS), (88, 220))
            draw.multiline_text((88, 310), title, font=font(INTER, 42), fill=(236, 236, 238), spacing=6)
            draw.multiline_text((88, 450), body, font=font(INTER_REG, 22), fill=(165, 167, 174), spacing=6)
        save_png(image, store / name)
        print("frame", name)


if __name__ == "__main__":
    write_favicons()
    write_chrome_icons()
    write_splashes()
    write_store_frames()
    print("brand rasters refreshed")
