#!/usr/bin/env python3
"""Génère les quatre schémas du dossier B1 avec une charte commune."""

from pathlib import Path
from textwrap import wrap

from PIL import Image, ImageDraw, ImageFont


OUT = Path(__file__).resolve().parent
W, H = 2400, 1450
NAVY = "#15384A"
TEAL = "#1F6F78"
CORAL = "#E46F61"
INK = "#17313B"
MUTED = "#5F7077"
PALE = "#EAF3F3"
PALE_BLUE = "#EAF0F5"
PALE_CORAL = "#FCEDEA"
WHITE = "#FFFFFF"
LINE = "#A9BBC1"
GREEN = "#3C8067"
RED = "#B05252"

FONT = "/System/Library/Fonts/Supplemental/Arial.ttf"
FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"


def font(size: int, bold: bool = False):
    return ImageFont.truetype(FONT_BOLD if bold else FONT, size)


def canvas(title: str, subtitle: str):
    image = Image.new("RGB", (W, H), WHITE)
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, W, 24), fill=CORAL)
    draw.text((110, 82), title, font=font(58, True), fill=NAVY)
    draw.text((112, 158), subtitle, font=font(27), fill=MUTED)
    draw.line((110, 218, W - 110, 218), fill=LINE, width=3)
    return image, draw


def rounded_box(draw, box, text, fill=PALE, outline=TEAL, title=None,
                text_size=28, radius=24, width=3, color=INK):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)
    x1, y1, x2, y2 = box
    if title:
        draw.text((x1 + 28, y1 + 24), title, font=font(25, True), fill=outline)
        top = y1 + 72
    else:
        top = y1 + 26
    lines = []
    max_chars = max(12, int((x2 - x1 - 50) / (text_size * 0.52)))
    for paragraph in text.split("\n"):
        lines.extend(wrap(paragraph, max_chars) or [""])
    total = len(lines) * int(text_size * 1.3)
    if not title:
        top = y1 + ((y2 - y1) - total) / 2
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font(text_size, False))
        tx = x1 + ((x2 - x1) - (bbox[2] - bbox[0])) / 2
        draw.text((tx, top), line, font=font(text_size), fill=color)
        top += int(text_size * 1.3)


def arrow(draw, start, end, color=TEAL, width=5, label=None, label_offset=(0, -38)):
    draw.line((start, end), fill=color, width=width)
    x1, y1 = start
    x2, y2 = end
    import math
    angle = math.atan2(y2 - y1, x2 - x1)
    length = 18
    for shift in (2.55, -2.55):
        p = (x2 + length * math.cos(angle + shift), y2 + length * math.sin(angle + shift))
        draw.line((end, p), fill=color, width=width)
    if label:
        mx, my = (x1 + x2) / 2 + label_offset[0], (y1 + y2) / 2 + label_offset[1]
        bbox = draw.textbbox((0, 0), label, font=font(23, True))
        pad = 10
        draw.rounded_rectangle((mx - pad, my - pad, mx + bbox[2] + pad, my + bbox[3] + pad),
                               radius=10, fill=WHITE)
        draw.text((mx, my), label, font=font(23, True), fill=color)


def footer(draw, text):
    draw.line((110, H - 84, W - 110, H - 84), fill=LINE, width=2)
    draw.text((110, H - 62), text, font=font(20), fill=MUTED)


def use_cases():
    image, draw = canvas(
        "Périmètre fonctionnel de RobLaude",
        "Acteurs, services attendus et dépendances principales",
    )

    # Acteurs
    for x, name, color in ((180, "Utilisateur\nPMR", TEAL), (180, "Administrateur", NAVY)):
        y = 450 if "PMR" in name else 930
        draw.ellipse((x, y, x + 90, y + 90), outline=color, width=6)
        draw.line((x + 45, y + 90, x + 45, y + 220), fill=color, width=6)
        draw.line((x - 20, y + 140, x + 110, y + 140), fill=color, width=6)
        draw.line((x + 45, y + 220, x - 20, y + 300), fill=color, width=6)
        draw.line((x + 45, y + 220, x + 110, y + 300), fill=color, width=6)
        draw.multiline_text((x - 55, y + 325), name, font=font(27, True), fill=color,
                            align="center", spacing=6)

    # Système
    draw.rounded_rectangle((520, 300, 2210, 1290), radius=34, outline=NAVY, width=4, fill="#FBFCFC")
    draw.text((570, 330), "Système RobLaude", font=font(34, True), fill=NAVY)

    cases = [
        ((650, 450, 1210, 610), "Créer une mission\nde transport", PALE, TEAL),
        ((650, 700, 1210, 860), "Demander la récupération\nd'un objet", PALE_CORAL, CORAL),
        ((1350, 450, 1910, 610), "Suivre la mission\nen temps réel", PALE_BLUE, NAVY),
        ((1350, 700, 1910, 860), "Déclencher un\narrêt d'urgence", PALE_CORAL, RED),
        ((650, 1010, 1210, 1170), "Configurer les points\net les objets", PALE_BLUE, NAVY),
        ((1350, 1010, 1910, 1170), "Consulter l'historique\net l'état du robot", PALE_BLUE, NAVY),
    ]
    for box, text, fill, color in cases:
        draw.ellipse(box, fill=fill, outline=color, width=4)
        x1, y1, x2, y2 = box
        lines = text.split("\n")
        for idx, line in enumerate(lines):
            bbox = draw.textbbox((0, 0), line, font=font(29, True))
            draw.text((x1 + (x2-x1-bbox[2])/2, y1 + 43 + idx*40), line,
                      font=font(29, True), fill=color)

    # Relations
    for end in ((650, 530), (650, 780), (1350, 530), (1350, 780)):
        draw.line(((290, 590), end), fill=LINE, width=4)
    for end in ((650, 1090), (1350, 1090)):
        draw.line(((290, 1070), end), fill=LINE, width=4)
    arrow(draw, (1210, 530), (1350, 530), color=NAVY, width=4, label="inclut", label_offset=(-15, -38))
    arrow(draw, (1210, 780), (1350, 530), color=NAVY, width=4, label="inclut", label_offset=(-10, 20))
    arrow(draw, (1210, 780), (930, 1010), color=CORAL, width=4, label="nécessite une configuration", label_offset=(-110, -10))
    footer(draw, "Lecture : l'administrateur possède aussi les droits d'un utilisateur.")
    image.save(OUT / "use-cases.png", quality=96)


def components():
    image, draw = canvas(
        "Architecture logique de RobLaude",
        "Des responsabilités séparées, reliées par des contrats explicites",
    )

    columns = [
        (110, 310, 540, 1260, "EXPÉRIENCE", PALE_CORAL, CORAL),
        (660, 310, 1150, 1260, "SERVICES WEB", PALE_BLUE, NAVY),
        (1270, 310, 1670, 1260, "MESSAGERIE", PALE, TEAL),
        (1790, 310, 2290, 1260, "ROBOT", "#F1F5F2", GREEN),
    ]
    for x1, y1, x2, y2, title, fill, color in columns:
        draw.rounded_rectangle((x1, y1, x2, y2), radius=28, fill=fill, outline=color, width=3)
        draw.text((x1 + 28, y1 + 24), title, font=font(23, True), fill=color)

    rounded_box(draw, (170, 460, 480, 700), "PWA React\nInterface accessible\nSuivi temps réel", fill=WHITE, outline=CORAL, text_size=27)
    rounded_box(draw, (720, 420, 1090, 630), "API Express\nAuthentification\nLogique des missions", fill=WHITE, outline=NAVY, text_size=25)
    rounded_box(draw, (720, 760, 1090, 970), "MySQL + Prisma\nUtilisateurs, points,\nrobots, missions", fill=WHITE, outline=NAVY, text_size=25)
    rounded_box(draw, (1320, 550, 1620, 830), "Mosquitto\nTopics par robot\nQoS et retained", fill=WHITE, outline=TEAL, text_size=26)
    rounded_box(draw, (1850, 380, 2230, 590), "Bridge MQTT / ROS 2\nTraduction des contrats", fill=WHITE, outline=GREEN, text_size=25)
    rounded_box(draw, (1850, 690, 2230, 910), "Navigation\nNav2 + SLAM Toolbox\nLiDAR + TF", fill=WHITE, outline=GREEN, text_size=24)
    rounded_box(draw, (1850, 1000, 2230, 1190), "Actionnement\nSTM32, moteurs,\nbras et pince", fill=WHITE, outline=GREEN, text_size=24)

    arrow(draw, (480, 520), (720, 520), label="REST", color=CORAL)
    arrow(draw, (720, 610), (480, 610), label="WebSocket", color=NAVY, label_offset=(-45, 18))
    arrow(draw, (905, 630), (905, 760), label="ORM", color=NAVY, label_offset=(18, -10))
    arrow(draw, (1090, 520), (1320, 650), label="publie / souscrit", color=TEAL, label_offset=(-80, -45))
    arrow(draw, (1620, 690), (1850, 480), label="MQTT", color=TEAL, label_offset=(-10, -20))
    arrow(draw, (2040, 590), (2040, 690), label="topics / actions", color=GREEN, label_offset=(25, -8))
    arrow(draw, (2040, 910), (2040, 1000), label="commandes", color=GREEN, label_offset=(25, -6))

    draw.text((180, 1130), "L'interface ne parle jamais directement au robot.", font=font(23, True), fill=CORAL)
    draw.text((710, 1100), "Le backend reste l'autorité métier.", font=font(23, True), fill=NAVY)
    draw.text((1310, 1040), "Le broker découple les rythmes\net les environnements.", font=font(23, True), fill=TEAL)
    footer(draw, "Contrat externe : roblaude/{robotId}/...  |  Communications internes : topics et actions ROS 2")
    image.save(OUT / "components.png", quality=96)


def sequence_uc01():
    image, draw = canvas(
        "Séquence simplifiée d'une mission de transport",
        "Du choix de l'utilisateur jusqu'au résultat de navigation",
    )
    participants = [
        (240, "Utilisateur"), (620, "PWA"), (1000, "Backend"),
        (1410, "MQTT"), (1810, "Bridge ROS 2"), (2180, "Nav2"),
    ]
    for x, name in participants:
        draw.rounded_rectangle((x-130, 300, x+130, 390), radius=18, fill=PALE_BLUE, outline=NAVY, width=3)
        bbox = draw.textbbox((0, 0), name, font=font(24, True))
        draw.text((x - bbox[2]/2, 330), name, font=font(24, True), fill=NAVY)
        draw.line((x, 390, x, 1260), fill=LINE, width=3)

    events = [
        (480, 240, 620, "Choisit départ et destination", CORAL),
        (580, 620, 1000, "POST /missions", NAVY),
        (690, 1000, 1410, "cmd/mission", TEAL),
        (800, 1410, 1810, "commande relayée", TEAL),
        (910, 1810, 2180, "NavigateToPose", GREEN),
        (1020, 2180, 1810, "feedback / résultat", GREEN),
        (1130, 1810, 1410, "mission/status", TEAL),
        (1220, 1410, 1000, "état reçu", TEAL),
        (1300, 1000, 620, "WebSocket : mise à jour", NAVY),
    ]
    for y, x1, x2, label, color in events:
        arrow(draw, (x1, y), (x2, y), color=color, width=4, label=label, label_offset=(-70, -35))

    # Note cycle de mission
    draw.rounded_rectangle((720, 430, 2010, 520), radius=16, fill=PALE_CORAL, outline=CORAL, width=2)
    draw.text((760, 455), "La mission est créée en base avant l'envoi de la commande au robot.",
              font=font(25, True), fill=CORAL)
    footer(draw, "En cas d'arrêt d'urgence, une commande dédiée interrompt la navigation et place la mission en pause.")
    image.save(OUT / "sequence-uc01.png", quality=96)


def mission_states():
    image, draw = canvas(
        "Cycle de vie d'une mission",
        "États principaux, reprise et sorties contrôlées",
    )

    nodes = {
        "Créée": (150, 560, 500, 780, PALE_BLUE, NAVY),
        "En cours": (790, 500, 1240, 840, PALE, TEAL),
        "En pause": (1400, 270, 1780, 490, PALE_CORAL, CORAL),
        "Terminée": (1950, 510, 2290, 720, "#EAF5EF", GREEN),
        "Échouée": (1950, 850, 2290, 1060, "#F8EAEA", RED),
        "Annulée": (1430, 930, 1810, 1150, "#F2EEF3", "#6B5870"),
    }
    descriptions = {
        "Créée": "Demande enregistrée\nRobot et points vérifiés",
        "En cours": "Navigation vers collecte\nAttente chargement\nNavigation vers destination",
        "En pause": "STOP reçu\nMouvement interrompu",
        "Terminée": "Destination atteinte\nRésultat enregistré",
        "Échouée": "Timeout, obstacle\nou erreur technique",
        "Annulée": "Décision utilisateur\nTraçabilité conservée",
    }
    for name, (x1, y1, x2, y2, fill, color) in nodes.items():
        rounded_box(draw, (x1, y1, x2, y2), descriptions[name], fill=fill,
                    outline=color, title=name.upper(), text_size=23, color=INK)

    arrow(draw, (500, 670), (790, 670), label="robot disponible", color=NAVY)
    arrow(draw, (1240, 560), (1400, 430), label="arrêt d'urgence", color=CORAL, label_offset=(-100, -42))
    arrow(draw, (1400, 475), (1240, 630), label="reprendre", color=TEAL, label_offset=(-20, 10))
    arrow(draw, (1240, 665), (1950, 615), label="destination atteinte", color=GREEN, label_offset=(20, -42))
    arrow(draw, (1240, 760), (1950, 950), label="erreur terminale", color=RED, label_offset=(0, 8))
    arrow(draw, (1130, 840), (1430, 1030), label="annuler", color="#6B5870", label_offset=(-20, 8))
    arrow(draw, (1590, 490), (1590, 930), label="annuler", color="#6B5870", label_offset=(28, 80))

    draw.rounded_rectangle((160, 990, 1120, 1200), radius=20, fill="#F8FAFA", outline=LINE, width=2)
    draw.text((200, 1025), "Principe de conception", font=font(25, True), fill=NAVY)
    note = "Les états sont conservés côté backend. Le robot exécute la mission et publie les retours, mais il n'est pas l'autorité sur les données métier."
    for idx, line in enumerate(wrap(note, 65)):
        draw.text((200, 1070 + idx*31), line, font=font(22), fill=INK)
    footer(draw, "La récupération d'objet ajoute des sous-états de détection, saisie et dépôt, sans changer les états métier principaux.")
    image.save(OUT / "mission-states.png", quality=96)


if __name__ == "__main__":
    use_cases()
    components()
    sequence_uc01()
    mission_states()
    for path in sorted(OUT.glob("*.png")):
        with Image.open(path) as image:
            print(f"{path.name}: {image.width}x{image.height}")
