import os
from PIL import Image, ImageDraw, ImageFont

BLUE, NAVY, SKY, WHITE = (30, 111, 217), (11, 37, 69), (142, 197, 255), (255, 255, 255)
os.makedirs("demo_images", exist_ok=True)


def font(size):
    for name in ("arialbd.ttf", "arial.ttf", "Arial.ttf", "DejaVuSans-Bold.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def make_logo():
    img = Image.new("RGB", (320, 110), WHITE)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((6, 6, 314, 104), radius=22, fill=BLUE)
    for x, y, r in [(60, 62, 16), (86, 50, 22), (112, 62, 16)]:
        d.ellipse((x - r, y - r, x + r, y + r), fill=WHITE)
    d.rectangle((60, 62, 112, 78), fill=WHITE)
    d.text((140, 28), "NIMBUS", font=font(40), fill=WHITE)
    img.save("demo_images/nimbus_logo.png")
    return img


def make_good(logo):
    img = Image.new("RGB", (1200, 630), NAVY)
    d = ImageDraw.Draw(img)
    d.text((70, 190), "Store everything.", font=font(78), fill=WHITE)
    d.text((70, 290), "Lose nothing.", font=font(78), fill=WHITE)
    d.text((70, 420), "Encrypted cloud storage for small businesses", font=font(34), fill=SKY)
    d.rounded_rectangle((70, 490, 330, 560), radius=14, fill=BLUE)
    d.text((110, 507), "Start free", font=font(32), fill=WHITE)
    img.paste(logo.resize((256, 88)), (70, 50))
    img.save("demo_images/nimbus_campaign_ok.png")


def make_bad():
    img = Image.new("RGB", (1200, 630), (232, 84, 36))
    d = ImageDraw.Draw(img)
    d.text((70, 150), "Biggest sale ever!", font=font(80), fill=(236, 236, 236))
    d.rectangle((70, 330, 1130, 470), fill=WHITE)
    d.text((100, 370), "Free storage for everyone, today only", font=font(44), fill=(214, 214, 214))
    d.rounded_rectangle((70, 510, 330, 580), radius=14, fill=(250, 200, 20))
    d.text((110, 527), "Buy now", font=font(32), fill=(255, 255, 255))
    img.save("demo_images/nimbus_campaign_bad.png")


logo = make_logo()
make_good(logo)
make_bad()
print("Created demo_images/: nimbus_logo.png, nimbus_campaign_ok.png, nimbus_campaign_bad.png")
