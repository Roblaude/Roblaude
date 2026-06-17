"""Tests de la conversion hex -> plages HSV — hors ROS, hors OpenCV."""
from roblaude_pickplace.color import hex_to_hsv_ranges


def test_rouge_wrappe_en_deux_plages():
    # le rouge (teinte ~0) deborde sous 0 -> deux plages
    ranges = hex_to_hsv_ranges('#ff0000', h_tol=10)
    assert len(ranges) == 2
    # une plage demarre a 0, l'autre finit a 179
    starts = [low[0] for low, _ in ranges]
    highs = [high[0] for _, high in ranges]
    assert 0 in starts
    assert 179 in highs


def test_vert_une_seule_plage():
    # vert pur -> teinte 60 (OpenCV), bande 50..70, pas de wrap
    ranges = hex_to_hsv_ranges('#00ff00', h_tol=10)
    assert len(ranges) == 1
    (low, high) = ranges[0]
    assert low[0] == 50
    assert high[0] == 70


def test_bleu_centre_120():
    # bleu pur -> teinte 120 (OpenCV)
    ranges = hex_to_hsv_ranges('#0000ff', h_tol=10)
    assert len(ranges) == 1
    (low, high) = ranges[0]
    assert low[0] == 110
    assert high[0] == 130


def test_seuils_s_v_propages():
    ranges = hex_to_hsv_ranges('#00ff00', h_tol=5, s_min=100, v_min=50)
    (low, _high) = ranges[0]
    assert low[1] == 100  # s_min
    assert low[2] == 50   # v_min


def test_hex_invalide_leve():
    try:
        hex_to_hsv_ranges('#fff')
        assert False, 'aurait du lever ValueError'
    except ValueError:
        pass
