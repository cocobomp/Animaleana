# Allures des vaches candidates (Blender 4.2). Le moteur est celui du mouton (tools/mouton/sheep_gait.py, repris des
# chiens : membres à 4 segments, cinématique inverse bornée à 98 % de l'allonge, aucune translation d'os hors de la
# racine) ; seuls les réglages des allures sont propres à la vache.
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'mouton'))
from sheep_gait import *  # noqa: F401,F403 (Rig, pose_at, bake, blend_local, smooth, rot_x_about, REACH, STATS…)
import sheep_gait as _engine

STATS = _engine.STATS
HIP_REF = 1.146  # hauteur de la hanche (tête du fémur) de la Prim'Holstein de référence, garrot 1,40 m


def cow_gaits(s, fps=30):
    """Allures d'une vache (garrot 1,40 m). s = hauteur de la hanche / HIP_REF. D'après les mesures publiées sur les
    bovins laitiers (pas ≈ 1,1 m/s, cycle ≈ 1,1 s, sabots levés de 8 à 12 cm ; trot ≈ 2,2 m/s ; galop lourd ≈ 4,7 m/s)
    et les allures de la chèvre du jeu (mêmes réglages de forme, mises à l'échelle de Froude). Vitesse naturelle =
    foulée / (part d'appui × durée du cycle) : à cette vitesse les sabots posés ne glissent pas. La vache roule des
    hanches au pas (roulis, balancement), hoche la tête à chaque appui antérieur ; au galop, le corps bascule d'avant en
    arrière (« course lourde »), queue relevée."""
    G = {}
    # Pas : 4 temps latéraux, tête qui hoche, hanches qui roulent.
    G['walk'] = dict(frames=34, stride=0.80 * s, duty=0.65, lift=0.10 * s, lift_scale={'front': 1.1, 'hind': 0.95},
                     phase={'HL': 0.0, 'FL': 0.24, 'HR': 0.5, 'FR': 0.74}, breakover=0.32, curl=0.62, curl_scale={'front': 1.0, 'hind': 0.9},
                     bob=0.012 * s, bob_freq=2, bob_phase=0.1, pitch=0.008, neck=0.05, neck_freq=2, neck_phase=0.3,
                     head=0.03, tail_amp=0.04, tail_yaw=0.12, tail_lag=0.10, roll=0.022, sway=0.012 * s, fold=0.05 * s, drop=0.008 * s)
    # Trot : diagonaux, courte suspension.
    G['trot'] = dict(frames=20, stride=0.62 * s, duty=0.42, lift=0.15 * s, lift_scale={'front': 1.2, 'hind': 1.0},
                     phase={'HL': 0.0, 'FR': 0.02, 'HR': 0.5, 'FL': 0.52}, breakover=0.36, curl=1.15, curl_scale={'front': 1.0, 'hind': 0.8},
                     bob=0.026 * s, bob_freq=2, bob_phase=0.45, drop=0.02 * s, pitch=0.0, neck=0.03, neck_freq=2, neck_phase=0.1,
                     head=0.015, tail_lift=0.25, tail_amp=0.06, tail_freq=2, fold=0.07 * s, roll=0.012)
    # Galop lourd (transverse) : le corps bascule, l'encolure accompagne, queue relevée.
    G['run'] = dict(frames=16, stride=0.80 * s, duty=0.32, lift=0.19 * s, lift_scale={'front': 1.25, 'hind': 1.0},
                    phase={'HR': 0.0, 'HL': 0.12, 'FR': 0.40, 'FL': 0.52}, breakover=0.38, curl=1.35, curl_scale={'front': 1.0, 'hind': 0.85},
                    bob=0.045 * s, bob_freq=1, bob_phase=0.87, drop=0.04 * s, pitch=0.10, pitch_phase=0.55, flex=0.04, flex_phase=0.95,
                    neck=0.14, neck_base=0.06, neck_freq=1, neck_phase=0.55, head=0.06, head_base=-0.04,
                    tail_lift=0.55, tail_amp=0.12, tail_freq=1, fold=0.10 * s, roll=0.012)
    for g in G.values():
        g['speed'] = g['stride'] / (g['duty'] * g['frames'] / fps)
    return G
