from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets" / "images" / "qr-bingo" / "vendor-draw-mobile" / "generated"
OUT = ROOT / "assets" / "images" / "qr-bingo" / "vendor-draw-mobile"

SLIDES = [
    ("slide-01-scan-visual.png", "Scan the booth QR", "Couples scan your QR Bingo sign right at your booth.", "Step 1 of 5"),
    ("slide-02-opt-in-visual.png", "Couples choose to enter", "Couples can opt in to your draw.", "Step 2 of 5"),
    ("slide-03-entries-sync-visual.png", "Download your entrant list", "Couples who enter share their contact information. You may use it for the draw and wedding-related marketing.", "Step 3 of 5"),
    ("slide-04-pick-winner-visual.png", "Select a potential winner", "After entries close, use the random-selection tool. This does not award the prize yet.", "Step 4 of 5"),
    ("slide-05-follow-up-visual.png", "Confirm and fulfil", "Ensure the couple meets the draw rules. Then send the WeddingWin.ca winner notice and provide the prize.", "Step 5 of 5"),
]

W, H = 1088, 1920
CORAL = (170, 86, 93)
INK = (46, 46, 50)
MUTED = (100, 89, 86)
IVORY = (255, 248, 245)
WHITE = (255, 255, 255)
BLUSH = (253, 239, 238)


def font(size, bold=False):
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Supplemental/Trebuchet MS Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Trebuchet MS.ttf",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
    ]
    for candidate in candidates:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


def wrap(draw, text, font_obj, max_width):
    words = text.split()
    lines = []
    current = ""
    for word in words:
        test = f"{current} {word}".strip()
        if draw.textbbox((0, 0), test, font=font_obj)[2] <= max_width:
            current = test
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def round_rect(draw, xy, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def centered_text(draw, center, text, font_obj, fill):
    bbox = draw.textbbox((0, 0), text, font=font_obj)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    x = center[0] - text_width / 2 - bbox[0]
    y = center[1] - text_height / 2 - bbox[1]
    draw.text((x, y), text, fill=fill, font=font_obj)


def cover(im, size):
    return ImageOps.fit(im, size, method=Image.Resampling.LANCZOS, centering=(0.5, 0.48))


def make_slide(src_name, title, body, kicker):
    base = Image.open(SRC / src_name).convert("RGB")
    base = cover(base, (W, H))
    canvas = Image.new("RGB", (W, H), IVORY)
    canvas.paste(base, (0, 0))
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)

    # Soft top and bottom panels keep text readable without hiding the illustration.
    d.rounded_rectangle((64, 72, W - 64, 390), radius=42, fill=(255, 255, 255, 232), outline=(239, 216, 214, 235), width=3)
    d.rounded_rectangle((64, H - 430, W - 64, H - 76), radius=42, fill=(255, 255, 255, 238), outline=(239, 216, 214, 235), width=3)
    badge = (W - 182, 104, W - 104, 182)
    badge_center = ((badge[0] + badge[2]) / 2, (badge[1] + badge[3]) / 2)
    d.ellipse(badge, fill=CORAL + (255,))
    canvas = Image.alpha_composite(canvas.convert("RGBA"), overlay)
    d = ImageDraw.Draw(canvas)

    title_font = font(68, bold=True)
    body_font = font(37, bold=False)
    kicker_font = font(28, bold=True)
    step_font = font(38, bold=True)

    d.text((100, 116), kicker.upper(), fill=CORAL, font=kicker_font)
    y = 164
    for line in wrap(d, title, title_font, W - 220):
        d.text((100, y), line, fill=INK, font=title_font)
        y += 76

    centered_text(d, badge_center, kicker.split()[1], step_font, WHITE)

    y = H - 360
    for line in wrap(d, body, body_font, W - 200):
        d.text((100, y), line, fill=MUTED, font=body_font)
        y += 50

    # Swipe hint.
    pill = (100, H - 160, W - 100, H - 104)
    round_rect(d, pill, 28, BLUSH, outline=(239, 216, 214), width=2)
    d.text((W // 2, H - 132), "Swipe to continue", fill=CORAL, font=font(26, bold=True), anchor="mm")
    return canvas.convert("RGB")


def make_contact_sheet(paths):
    thumbs = []
    for path in paths:
        im = Image.open(path).convert("RGB")
        im.thumbnail((220, 390))
        tile = Image.new("RGB", (240, 430), WHITE)
        tile.paste(im, ((240 - im.width) // 2, 10))
        d = ImageDraw.Draw(tile)
        d.text((12, 405), path.name[:28], fill=INK, font=font(12))
        thumbs.append(tile)
    sheet = Image.new("RGB", (240 * len(thumbs), 430), WHITE)
    for i, thumb in enumerate(thumbs):
        sheet.paste(thumb, (i * 240, 0))
    sheet.save(OUT / "vendor-draw-mobile-contact-sheet.jpg", quality=92)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    final_paths = []
    for idx, slide in enumerate(SLIDES, start=1):
        final = make_slide(*slide)
        out = OUT / f"vendor-draw-mobile-slide-{idx:02d}.webp"
        final.save(out, "WEBP", quality=92, method=6)
        final_paths.append(out)
    make_contact_sheet(final_paths)
    print("\n".join(str(path) for path in final_paths))
    print(OUT / "vendor-draw-mobile-contact-sheet.jpg")


if __name__ == "__main__":
    main()
