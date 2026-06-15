"""Conversion couleur hex -> plages HSV OpenCV — fonction pure, testable.

Le backend stocke la couleur cible d'un GraspObject en hex (ex '#ff0000'), comme
Annotation.color. Le robot en derive une bande HSV pour la detection, au lieu
d'une table couleur->HSV maintenue a la main. Une seule tolerance globale suffit.

Convention OpenCV : H 0..179, S/V 0..255. La teinte boucle (le rouge est autour
de 0/179), donc une bande qui deborde 0 ou 179 est coupee en deux plages.
"""
import colorsys


def hex_to_hsv_ranges(hex_color: str, h_tol: int = 10,
                      s_min: int = 120, v_min: int = 70):
    """'#rrggbb' -> liste de plages [(low, high), ...] en HSV OpenCV.

    Chaque plage est ((h, s, v), (h, s, v)). Renvoie 1 plage en general, 2 si la
    bande de teinte boucle autour de 0/179 (cas du rouge).
    """
    h = hex_color.lstrip('#')
    if len(h) != 6:
        raise ValueError(f'hex couleur invalide: {hex_color}')
    r = int(h[0:2], 16) / 255.0
    g = int(h[2:4], 16) / 255.0
    b = int(h[4:6], 16) / 255.0

    hue, _sat, _val = colorsys.rgb_to_hsv(r, g, b)
    hc = int(round(hue * 180)) % 180  # teinte OpenCV 0..179

    low_h = hc - h_tol
    high_h = hc + h_tol

    if low_h < 0:
        # bande deborde sous 0 -> [0..high] + [180+low..179]
        return [
            ((0, s_min, v_min), (high_h, 255, 255)),
            ((180 + low_h, s_min, v_min), (179, 255, 255)),
        ]
    if high_h > 179:
        # bande deborde au-dessus de 179 -> [low..179] + [0..high-180]
        return [
            ((low_h, s_min, v_min), (179, 255, 255)),
            ((0, s_min, v_min), (high_h - 180, 255, 255)),
        ]
    return [((low_h, s_min, v_min), (high_h, 255, 255))]
