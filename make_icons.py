"""Genera los iconos PNG de la app. Uso: python3 make_icons.py (necesita Pillow)."""
import math
from PIL import Image, ImageDraw

INK = (14, 16, 19)
BONE = (236, 239, 244)
RING = (35, 40, 47)
ACCENT = (91, 157, 255)

def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))

def make(size, kind):
    """kind: 'any' (esquinas redondeadas), 'maskable' o 'apple' (fondo completo)."""
    S = size * 4
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if kind == 'any':
        d.rounded_rectangle((0, 0, S - 1, S - 1), radius=int(S * 0.219), fill=INK)
        R = S * 0.36
    else:
        d.rectangle((0, 0, S, S), fill=INK)
        R = S * 0.30
    c = S / 2
    def circle(r, fill):
        d.ellipse((c - r, c - r, c + r, c + r), fill=fill)
    circle(R, BONE)
    circle(R * 0.837, RING)
    glass = R * 0.641
    steps = 80
    for i in range(steps):
        t = i / (steps - 1)                       # 0 = borde, 1 = centro
        r = glass * (1 - t)
        col = lerp((63, 120, 209), (11, 13, 17), min(1, t / 0.45))
        circle(r, col)
    # diafragma hexagonal
    hr = R * 0.359
    pts = [(c + hr * math.cos(math.radians(a)), c + hr * math.sin(math.radians(a))) for a in range(0, 360, 60)]
    d.line(pts + [pts[0]], fill=ACCENT + (190,), width=max(2, int(S * 0.0098)), joint='curve')
    # brillos
    hl = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    hd = ImageDraw.Draw(hl)
    ex, ey, rx, ry = c - R * 0.24, c - R * 0.26, R * 0.14, R * 0.09
    hd.ellipse((ex - rx, ey - ry, ex + rx, ey + ry), fill=(255, 255, 255, 215))
    hl = hl.rotate(35, center=(ex, ey), resample=Image.BICUBIC)
    img = Image.alpha_composite(img, hl)
    d = ImageDraw.Draw(img)
    dx, dy, dr = c + R * 0.2, c + R * 0.26, R * 0.04
    d.ellipse((dx - dr, dy - dr, dx + dr, dy + dr), fill=(255, 255, 255, 90))
    return img.resize((size, size), Image.LANCZOS)

make(192, 'any').save('icons/icon-192.png')
make(512, 'any').save('icons/icon-512.png')
make(192, 'maskable').save('icons/maskable-192.png')
make(512, 'maskable').save('icons/maskable-512.png')
make(180, 'apple').convert('RGB').save('icons/apple-touch-icon.png')
make(32, 'any').save('icons/favicon-32.png')
print('Iconos generados')
