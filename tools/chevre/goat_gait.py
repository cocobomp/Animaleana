# Allures de la chèvre du jeu (Blender 4.2). Le moteur est celui du mouton (tools/mouton/sheep_gait.py, lui-même repris
# des chiens : membres à 4 segments, cinématique inverse bornée à 98 % de l'allonge, aucune translation d'os hors de
# la racine) ; seuls les réglages des allures sont propres à la chèvre.
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'mouton'))
from sheep_gait import *  # noqa: F401,F403 (Rig, pose_at, bake, blend_local, smooth, rot_x_about, REACH, STATS…)
import sheep_gait as _engine

STATS = _engine.STATS


def goat_gaits(s, fps=30):
    """Allures d'une chèvre laitière (garrot 0,75 m, hanche ≈ 0,56 m). s = hauteur de la hanche / 0,56 m.
    D'après les allures du cheval (mises à l'échelle de Froude) et des chiens du jeu. Vitesse naturelle = foulée /
    (part d'appui × durée du cycle) : à cette vitesse les sabots posés ne glissent pas. Dos raide (pas de flexion de chien
    au galop) ; sabots : roulement sur la pince en fin d'appui."""
    G = {}
    # Pas : 4 temps latéraux, ≈ 0,9 m/s, tête qui hoche un peu.
    G['walk'] = dict(frames=26, stride=0.50 * s, duty=0.63, lift=0.07 * s, lift_scale={'front': 1.15, 'hind': 0.95},
                     phase={'HL': 0.0, 'FL': 0.24, 'HR': 0.5, 'FR': 0.74}, breakover=0.35, curl=0.85, curl_scale={'front': 1.0, 'hind': 0.8},
                     bob=0.006 * s, bob_freq=2, bob_phase=0.1, pitch=0.006, neck=0.04, neck_freq=2, neck_phase=0.3,
                     head=0.025, tail_amp=0.05, tail_yaw=0.10, tail_lag=0.08, roll=0.012, sway=0.006 * s, fold=0.03 * s, drop=0.005 * s)
    # Trot : diagonaux, petite suspension, ≈ 2 m/s.
    G['trot'] = dict(frames=16, stride=0.43 * s, duty=0.40, lift=0.10 * s, lift_scale={'front': 1.25, 'hind': 1.0},
                     phase={'HL': 0.0, 'FR': 0.01, 'HR': 0.5, 'FL': 0.51}, breakover=0.38, curl=1.25, curl_scale={'front': 1.0, 'hind': 0.8},
                     bob=0.016 * s, bob_freq=2, bob_phase=0.45, drop=0.012 * s, pitch=0.0, neck=0.02, neck_freq=2, neck_phase=0.1,
                     head=0.012, tail_lift=0.25, tail_amp=0.06, tail_freq=2, fold=0.045 * s, roll=0.008)
    # Galop (transverse) : ≈ 4,5 m/s, dos presque raide, encolure qui accompagne, queue relevée.
    G['run'] = dict(frames=12, stride=0.50 * s, duty=0.28, lift=0.13 * s, lift_scale={'front': 1.3, 'hind': 1.0},
                    phase={'HR': 0.0, 'HL': 0.11, 'FR': 0.36, 'FL': 0.47}, breakover=0.40, curl=1.45, curl_scale={'front': 1.0, 'hind': 0.85},
                    bob=0.022 * s, bob_freq=1, bob_phase=0.87, drop=0.03 * s, pitch=0.08, pitch_phase=0.55, flex=0.05, flex_phase=0.95,
                    neck=0.12, neck_base=0.10, neck_freq=1, neck_phase=0.55, head=0.05, head_base=-0.06,
                    tail_lift=0.35, tail_amp=0.10, tail_freq=1, fold=0.07 * s, roll=0.01)
    for g in G.values():
        g['speed'] = g['stride'] / (g['duty'] * g['frames'] / fps)
    return G
