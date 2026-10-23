# Réglages des deux chats du jeu (sources : dossier SRC, voir LISEZMOI.md).
# Tous deux suivent la même norme : chat tourné vers +Z (dans Blender : avant = -Y), Y en haut, pattes à y = 0, garrot
# 0,25 m (chat européen ; le chaton aussi : le jeu le met à sa taille), mêmes noms d'os (voir cat_autorig.py).
import os
import catkit as K
import catprep as P
import cat_autorig

SRC = os.environ.get('SRC', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'src'))

MODELS = {
    # Adultes des 15 races : « Cat game asset », Claire (claireanne3d, Sketchfab, CC-BY 4.0) — chat tigré gris
    # réaliste, yeux séparés (vairons), PBR 1024 (couleur, normales, occlusion).
    'adult': dict(file='claire_cat.glb', rig=dict(buttock=0.45, haunch=0.8),
                  pose_opts=dict(sit_flex=-0.2, sit_tuck=-0.2, sit_femur=0.35)),
    # Chatons : « Kitten », FainoDS (doinspire, Sketchfab, CC-BY 4.0) — chaton tigré gris réaliste, grosse tête.
    # (arm_clip : la peau du poitrail entre les pattes avant suit le poitrail, plus le bras : sinon un voile, pattes
    # tendues devant)
    # (cuisse assise : l'arrière du haut de la cuisse suit le bassin (buttock), le grasset est plus haut et plus en
    # avant ; sans cela, la peau du fémur sortait du flanc, déchirée, quand le chaton s'asseyait)
    # (en boule : couché sur le flanc droit, colonne enroulée dans le plan du sol, tête ramenée vers les cuisses,
    # queue enroulée autour, pattes du dessous rentrées — curl_side, voir make_cat.py)
    'kitten': dict(file='faino_kitten.glb', rig=dict(elbow=0.42, hock=0.28, stifle=0.46, hip=0.70, buttock=0.5, haunch=0.9, arm_clip=(0.10, 0.18, 4.0)),
                   eye_mats=('material',), eye_rigid=1,
                   gait_over={'run': {'stride': 0.42, 'drop': 0.008, 'lift': 0.09}, 'trot': {'stride': 0.28}, 'walk': {'stride': 0.24}},
                   pose_opts=dict(groom_dz=0.06, groom_dy=0.02, groom_head=0.35, groom_a3=1.8, groom_wipe_dy=0.02, groom_wipe_dz=-0.055,
                                  groom_wipe_head=0.38, stretch_reach=0.66, stretch_scap=0.2,
                                  sit_flex=0.3, sit_tuck=-0.15, sit_femur=0.2, lie_hip=0.6, lie_chest=0.05, lie_loaf=1,
                                  curl_side=1, curl_roll=1.45, curl=0.65, curl_head=0.5, curl_head_roll=0.45, curl_tail_neg=1,
                                  curl_tail=[0.3, 0.5, 0.6, 0.7, 0.75, 0.75, 0.7, 0.6],
                                  curl_splay={'HR': -0.25, 'FR': -0.15, 'HL': 0.1, 'FL': 0.0})),
}


def src(mid):
    return os.path.join(SRC, MODELS[mid]['file'])


def prep(mid):
    M = MODELS[mid]
    K.load(src(mid))
    meshes = P.static_meshes(M.get('drop', ()), M.get('pose', 'POSE'))
    body, eyes, others = P.classify(meshes)
    rep = {'orient': P.orient(meshes, body, M.get('yaw'), M.get('flip', False))}
    m = P.normalize(meshes, body)
    # soudure des coutures (sommets dédoublés aux bords d'UV ou entre pièces), en mètres, après la mise à l'échelle
    P.weld(body, M.get('weld', 1e-5))
    if M.get('decimate'):
        P.decimate(body, M['decimate'])
    rep['measures'] = {k: v for k, v in m.items() if isinstance(v, float)}
    body.name = mid + '_body'
    for k, e in enumerate(eyes):
        e.name = mid + '_eyes%d' % k
    for k, x in enumerate(others):
        x.name = mid + '_part%d' % k
    return body, eyes, others, rep


def rig(mid, body, eyes, others):
    M = MODELS[mid]
    return cat_autorig.build(body, others, eyes, M.get('rig', {}))
