# Prépare un chat du jeu (adulte ou chaton) : maillage figé et orienté, garrot 0,25 m, squelette automatique, allures et poses
# générées (pas, trot, course, assis, couché, en boule, toilette, étirement, queue levée, oreilles, transitions),
# corps jamais sous le sol, vérifications sur le maillage déformé, export GLB brut.
# D'après make_dog.py des chiens du jeu (tools/chien/).
# Usage : blender -b --factory-startup --disable-autoexec --python make_cat.py -- <adult|kitten> <sortie.glb> <rapport.json>
#         [--hook script.py] (exécuté dans ce contexte après le squelette, puis arrêt : mise au point)
import bpy, sys, os, math, json, re
from mathutils import Vector, Matrix, Quaternion
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import catkit as K
import cat_gait as dg
import cat_models as CM

argv = sys.argv[sys.argv.index('--') + 1:]
mid, out, report_path = argv[0], argv[1], argv[2]
opt = {argv[i]: argv[i + 1] for i in range(3, len(argv) - 1) if argv[i].startswith('--')}
M = CM.MODELS[mid]
P = dict(M.get('pose_opts', {}))
P.update(json.loads(os.environ.get('POSE_OPTS', '{}')))  # (mise au point : réglages passés par l'environnement)
body, eyes, others, prep_rep = CM.prep(mid)
arm, info = CM.rig(mid, body, eyes, others)
# yeux peints du chaton (pièces de la matière des yeux dans le maillage du corps) : portés par la seule tête. La chaleur
# leur donnait de l'encolure et de l'omoplate (tête 0,38, encolure 0,52, omoplate 0,10) : en boule, tête tournée sur
# l'encolure, le globe s'étirait de 25 à 36 %.
print('MAILLAGES', [(o.name, [m_.name for m_ in o.data.materials if m_], len(o.data.vertices)) for o in [body] + list(eyes) + list(others)])
if M.get('eye_rigid'):
    for o in [body] + list(eyes) + list(others):
        em = {k for k, m in enumerate(o.data.materials) if m and (m.name in M.get('eye_mats', ()) or o in eyes)}
        ev = sorted({v for p_ in o.data.polygons if p_.material_index in em for v in p_.vertices})
        if not ev or 'head' not in o.vertex_groups:
            continue
        gh = o.vertex_groups['head']
        for g in o.vertex_groups:
            if g.name != 'head':
                g.remove(ev)
        gh.add(ev, 1.0, 'REPLACE')
        print('YEUX rigides (tête seule)', o.name, len(ev), 'sommets')
meshes = [body] + list(eyes) + list(others)
B = arm.data.bones
report = {'id': mid, 'prep': prep_rep, 'rig': {k: (round(v, 4) if isinstance(v, float) else v) for k, v in info.items()}, 'clips': {}}
report['tris'] = K.tris(meshes)
report['bones'] = len(B)
TAIL = sorted([b.name for b in B if re.match(r'tail\d+$', b.name)], key=lambda n: int(n[4:]))
EARS = [n for n in ('ear1L', 'ear1R') if n in B]
GAME = re.compile(r'^(tail([2-9]|\d\d)|ear[12][LR]|eye)')  # os que le jeu pourra piloter (exclus du contrôle du sol ;
# la base de la queue, tail1, fait partie de la croupe : assis, le chat repose aussi sur elle)
K.clear_anim(arm)

# ---- squelette pour les allures ------------------------------------------------------------------------------------
LEGS = {
    'FL': {'joints': ['humerusL', 'radiusL', 'metacarpusL', 'toesL'], 'scap': 'scapL'},
    'FR': {'joints': ['humerusR', 'radiusR', 'metacarpusR', 'toesR'], 'scap': 'scapR'},
    'HL': {'joints': ['femurL', 'tibiaL', 'metatarsusL', 'htoesL']},
    'HR': {'joints': ['femurR', 'tibiaR', 'metatarsusR', 'htoesR']},
}
legs, paws = {}, {}
for lab, L in LEGS.items():
    drive = [(j, i) for i, j in enumerate(L['joints'])]
    P4 = [B[j].head_local.copy() for j in L['joints']]
    tip, heel_y, pv = K.sole_points(arm, meshes, L['joints'][3], P4[3])
    paws[lab] = pv
    legs[lab] = dict(points=P4 + [tip], drive=drive, heel_y=heel_y, kind='front' if lab[0] == 'F' else 'hind',
                     gain=L.get('gain', 0.55 if lab[0] == 'F' else 0.6), neutral_dy=0.0, scap=L.get('scap'))
hipz = sum(legs[k]['points'][0].z for k in ('HL', 'HR')) / 2
s = hipz / 0.20
for lab in legs:
    legs[lab]['scap_gain'] = 0.9 / max(0.3, s * 0.45) if legs[lab]['scap'] else 0.0
tail_end = {}
for i, tname in enumerate(TAIL):
    tail_end[tname] = B[TAIL[i + 1]].head_local.copy() if i + 1 < len(TAIL) else B[tname].tail_local.copy()
sh = Vector((0, sum(legs[k]['points'][0].y for k in ('FL', 'FR')) / 2, sum(legs[k]['points'][0].z for k in ('FL', 'FR')) / 2))
hp = Vector((0, sum(legs[k]['points'][0].y for k in ('HL', 'HR')) / 2, hipz))
# hauteur mini du bout de chaque os de la queue : son rayon (la queue s'affine de la base au bout), la peau ne passe
# pas sous le sol quand la queue est posée (assis, couché)
r0 = info.get('tail_radius', 0.02)
tail_zmin = {n: max(0.004, r0 * (1.0 - 0.7 * (k + 1) / len(TAIL)) * P.get('tail_r_k', 0.9)) for k, n in enumerate(TAIL)}
cfg = dict(legs=legs, neck=['neck1', 'neck2'], head=['head'], tail=TAIL, tail_end=tail_end, ears=EARS, jaw=[], tongue=[],
           flex=[('pelvis', -0.4), ('spine1', 0.22), ('spine2', 0.22), ('spine3', 0.22)], pitch_pivot=(sh + hp) / 2,
           zmin_tail=P.get('tail_zmin', 0.010), tail_zmin=tail_zmin)
rig = dg.Rig(arm, cfg)
HAUNCH = [n for n in ('haunchL', 'haunchR') if n in B]


def haunch_post(pose):
    """Os correctifs de la hanche : chacun prend la moitié de la rotation du fémur par rapport au bassin, autour de la
    hanche (repos). Appliqué à chaque image cuite (cat_gait.bake)."""
    if not HAUNCH or 'pelvis' not in pose:
        return pose
    dp = pose['pelvis'] @ rig.rest['pelvis'].inverted()
    for hn in HAUNCH:
        fn = 'femur' + hn[-1]
        if fn not in pose:
            continue
        df = pose[fn] @ rig.rest[fn].inverted()
        rel = (dp.inverted() @ df).to_quaternion()
        half = Quaternion().slerp(rel, 0.5).to_matrix().to_4x4()
        k0 = rig.rest[hn].translation
        pose[hn] = dp @ Matrix.Translation(k0) @ half @ Matrix.Translation(-k0) @ rig.rest[hn]
    return pose


cfg['post'] = haunch_post
report['hipHeight'] = round(hipz, 4)
report['shoulderJoint'] = [round(sh.y, 4), round(sh.z, 4)]
print('HIP', hipz, 'SHOULDER', sh, 's', s)

# Sommets : museau, tronc, croupe, ensemble « solide » (hors os pilotés par le jeu)
headset = set(K.descendants(arm, 'head'))
legset = set()
for L in legs.values():
    for b, k in L['drive']:
        legset.update(K.descendants(arm, b) if k > 0 else [b])
dom = {m: K.dominant_groups(m) for m in meshes}
muzzle, torso, solid = [], [], []
for m in meshes:
    mw = m.matrix_world
    cand = [(i, mw @ v.co) for i, v in enumerate(m.data.vertices) if dom[m][i] in headset and not (dom[m][i] or '').startswith(('ear', 'eye'))]
    if cand and m is body:
        ymin = min(p.y for _, p in cand)
        muzzle += [(m, i) for i, p in cand if p.y < ymin + 0.008]
    for i, v in enumerate(m.data.vertices):
        d = dom[m][i]
        if d and not GAME.search(d):
            solid.append((m, i))
            if m is body and d not in legset and d not in headset:
                p = mw @ v.co
                if hp.y + 0.01 > p.y > sh.y - 0.01:
                    torso.append((m, i, p))
belly = min(p.z for _, _, p in torso)
print('BELLY rest z', round(belly, 4), 'torso verts', len(torso), 'muzzle', len(muzzle))
rump_sit = []
for i, v in enumerate(body.data.vertices):
    d_ = dom[body][i]
    if not d_ or GAME.search(d_) or d_ in headset or d_.startswith(('metatarsus', 'htoes', 'tibia')):
        continue
    p = body.matrix_world @ v.co
    if p.y > hp.y - 0.01 and 0.25 * hipz < p.z < hipz:
        rump_sit.append((body, i))
print('RUMP (assis)', len(rump_sit), 'sommets')
mz_pts = [(dom[m][i], m.matrix_world @ m.data.vertices[i].co) for m, i in muzzle]


def muzzle_at(pose):
    P_ = [(pose[b] @ rig.rest[b].inverted() @ p) for b, p in mz_pts]
    return sum(P_, Vector()) / len(P_), min(p.z for p in P_)


still = dict(stride=0.0, duty=1.0, lift=0.0, phase={'HL': 0, 'FL': 0, 'HR': 0, 'FR': 0})


def breathe(t, k=1.0, n=3):
    return {'bob': 0.0012 * s * math.sin(math.tau * n * t) * k}


def pulse(t, t0, w=0.025):
    d = min(abs(t - t0), 1 - abs(t - t0))
    return math.exp(-(d / w) ** 2)


# formes de queue (angles dans le plan du corps : 0 = vers l'arrière, pi/2 = vers le haut)
TAIL_RELAX = P.get('tail_relax', [-0.15, -0.45, -0.75, -0.95, -1.0, -0.85, -0.55, -0.2])
TAIL_UP = P.get('tail_up', [1.15, 1.45, 1.6, 1.65, 1.7, 1.9, 2.3, 2.75])
TAIL_GROUND = [-0.55, -1.0, -1.4, -1.4, -1.4, -1.4, -1.4, -1.4]
TAIL_LIE = P.get('tail_lie', [-0.3, -0.55, -0.85, -1.15, -1.4, -1.4, -1.4, -1.4])
WRAP = P.get('tail_wrap', [0.25, 0.55, 0.9, 1.25, 1.6, 1.95, 2.3, 2.6])

def clamp_tail(pose):
    """Queue jamais sous le sol dans une pose mélangée (transitions, en boule) : chaque os dont le bout passe sous sa
    hauteur mini est relevé autour de sa tête, avec les os qui le suivent."""
    for k, name in enumerate(TAIL):
        Mb = pose[name]
        c = Mb.translation.copy()
        tip = Mb @ rig.rest[name].inverted() @ tail_end[name]
        zmin = tail_zmin[name]
        if tip.z >= zmin:
            continue
        ax = (tip - c).cross(Vector((0, 0, 1)))
        if ax.length < 1e-9:
            continue
        ax.normalize()
        lo_, hi_ = 0.0, 1.6
        for _ in range(20):
            m_ = (lo_ + hi_) / 2
            if (dg.rot_axis_about(m_, ax, c) @ tip).z < zmin:
                lo_ = m_
            else:
                hi_ = m_
        R = dg.rot_axis_about(hi_, ax, c)
        for n2 in TAIL[k:]:
            pose[n2] = R @ pose[n2]
    return pose


if opt.get('--hook'):
    exec(open(opt['--hook']).read(), globals())
    sys.exit(0)

ONLY = set(opt['--only'].split(',')) if opt.get('--only') else None


def want(n):
    return ONLY is None or n in ONLY


# ---- allures --------------------------------------------------------------------------------------------------------
G = dg.cat_gaits(s, 30)
speeds = {}
for name in ('walk', 'trot', 'run'):
    gp = dict(G[name])
    # réglages propres au modèle (pattes courtes du chaton : foulée plus courte, corps moins bas)
    for k_, v_ in M.get('gait_over', {}).get(name, {}).items():
        gp[k_] = v_ * s if k_ in ('stride', 'lift', 'drop', 'bob', 'fold', 'sway') else v_
    gp['speed'] = gp['stride'] / (gp['duty'] * gp['frames'] / 30)
    if want(name):
        dg.bake(rig, name, gp, gp['frames'])
    speeds[name] = round(gp['speed'], 3)
report['naturalSpeeds'] = speeds

# ---- repos : debout, respiration, tête qui regarde, queue détendue qui balance, oreilles qui frémissent -------------
idle_gp = dict(still, neck=0.015, neck_freq=1, head=0.02, tail_shape=TAIL_RELAX, tail_yaw=0.16, tail_lag=0.1, tail_amp=0.05)
if want('idle'):
    dg.bake(rig, 'idle', idle_gp, 120, lambda t: dict(
        breathe(t), head_yaw=0.28 * math.sin(math.tau * t), ear_l=0.5 * pulse(t, 0.3), ear_r=0.5 * pulse(t, 0.72)))

# ---- assis : croupe au sol, antérieurs droits, queue enroulée autour des pattes ------------------------------------
SIT_FEMUR = P.get('sit_femur', 0.5)


def sit_gp(hip_frac, a3=0.05, flex=P.get('sit_flex', -0.2), tuck=P.get('sit_tuck', -0.2), femur=None):
    femur = SIT_FEMUR if femur is None else femur
    target = hip_frac * hipz
    dy, dz = hp.y - sh.y, hp.z - sh.z
    th = 0.0
    for _ in range(60):
        z = sh.z + dy * math.sin(th) + dz * math.cos(th)
        th -= (z - target) / (dy * math.cos(th) - dz * math.sin(th) + 1e-9) * 0.7
    hipn_y = sh.y + dy * math.cos(th) - dz * math.sin(th)
    gp = dict(still, pivot=sh.copy(), pitch_base=th, neck_base=-th * P.get('sit_neck', 0.52) - flex * 0.3, head_base=-th * P.get('sit_head', 0.32) - flex * 0.2,
              flex_base=flex, tail_shape=TAIL_GROUND, tail_side=WRAP)
    if tuck:
        gp['tilt'] = {'pelvis': tuck, 'spine1': -tuck}
    legsd = {}
    for lab in ('HL', 'HR'):
        R = rig.legs[lab]
        l1, l2, l3 = R['l2d'][:3]
        z3 = R['J'][3].z
        zh = z3 + l3 * math.sin(a3)
        sy = hipn_y - l1 * math.cos(femur)
        sz = target + l1 * math.sin(femur)
        hy = sy + math.sqrt(max(0.0, l2 * l2 - (sz - zh) ** 2)) * 0.97
        legsd[lab] = {'J3': (hy - l3 * math.cos(a3), z3), 'a3': a3, 'phi': 0.0, 'splay': 0.10, 'bend': 'up'}
    gp['legs'] = legsd
    return gp


def sit_search(flex, tuck):
    """Hauteur des hanches la plus haute où la croupe touche encore le sol (à 4 mm près), pour une courbure du dos."""
    lo, hi = 0.10, 0.45
    if P.get('sit_hip'):
        return P['sit_hip']
    for _ in range(8):
        midf = (lo + hi) / 2
        z = K.pose_probe(rig, sit_gp(midf, flex=flex, tuck=tuck), rump_sit)
        if z > 0.004:
            hi = midf
        else:
            lo = midf
    return lo


def sit_angle(gp):
    pose, _ = dg.pose_at(rig, 0.0, gp)
    a, b = pose['chest'].translation, pose['pelvis'].translation
    return math.atan2(a.z - b.z, b.y - a.y)


# chat assis droit : dos arrondi (lombaires fléchies, bassin rentré) jusqu'à ce que la ligne bassin -> poitrail fasse
# environ sit_angle (rad) avec le sol ; sans courbure, les chats à dos long restaient assis à demi couchés
best = None
for flex in [P.get('sit_flex', 0.75)]:
    tuck = P.get('sit_tuck', -0.35)
    hf = sit_search(flex, tuck)
    ang = sit_angle(sit_gp(hf, flex=flex, tuck=tuck))
    print('SIT courbure', flex, 'hanches', round(hf, 3), 'angle', round(math.degrees(ang), 1))
    cost = abs(ang - P.get('sit_angle', 0.92))
    if best is None or cost < best[0]:
        best = (cost, flex, tuck, hf)
_, SIT_FLEX, SIT_TUCK, lo = best
report['sitFlex'] = SIT_FLEX
SIT = sit_gp(lo, flex=SIT_FLEX, tuck=SIT_TUCK)
report['sitHip'] = round(lo, 3)
if want('sit'):
    dg.bake(rig, 'sit', SIT, 90, lambda t: dict(breathe(t), head_yaw=0.15 * math.sin(math.tau * t),
                                                tail_yaw=0.06 * math.sin(math.tau * 2 * t), ear_r=0.45 * pulse(t, 0.6)))


# ---- couché (sphinx) : poitrail et ventre au sol, avant-bras posés, postérieurs repliés, queue le long du corps ----
def lie_gp():
    # hanches descendues à lie_hip × leur hauteur, corps basculé autour des hanches jusqu'à ce que le bas du poitrail
    # repose sur les avant-bras (lie_chest × hauteur des hanches) : dos à peu près horizontal, ventre au sol
    midy = (sh.y + hp.y) / 2
    chest = [p for _, _, p in torso if p.y < midy]
    cpt = min(chest, key=lambda p: p.z)
    target = P.get('lie_hip', 0.38) * hipz
    cz = P.get('lie_chest', 0.09) * hipz
    drop = hp.z - target
    piv = hp.copy()
    dy, dz = cpt.y - hp.y, cpt.z - hp.z

    def chest_z(ph):
        return target + dy * math.sin(ph) + dz * math.cos(ph)
    lo_, hi_ = -0.5, 0.7
    for _ in range(40):
        mid_ = (lo_ + hi_) / 2
        if chest_z(mid_) > cz:
            lo_ = mid_
        else:
            hi_ = mid_
    ph = (lo_ + hi_) / 2
    print('LIE bascule', round(ph, 3), 'descente', round(drop, 4))
    gp = dict(still, drop=drop, pivot=piv, pitch_base=ph, neck_base=-ph * 0.7 + 0.05, head_base=-ph * 0.3 + 0.02,
              tail_shape=TAIL_LIE, tail_side=[x * 0.55 for x in WRAP])
    th = -ph

    def rot(p):
        return Vector((p.x, piv.y + (p.y - piv.y) * math.cos(-th) - (p.z - piv.z) * math.sin(-th),
                       piv.z + (p.y - piv.y) * math.sin(-th) + (p.z - piv.z) * math.cos(-th) - drop))
    legsd = {}
    for lab in ('FL', 'FR'):
        R = rig.legs[lab]
        l1, l2, l3 = R['l2d'][:3]
        J0 = rot(R['J'][0])
        zE = P.get('lie_elbow', 0.10) * hipz
        hz = max(0.0, J0.z - zE)
        ey = J0.y + math.sqrt(max(0.0, l1 * l1 - hz * hz)) if hz < l1 else J0.y
        legsd[lab] = {'J3': (ey - l2 * 0.97 - l3, R['J'][3].z + P.get('lie_wrist', 0.03) * hipz), 'a3': 0.0, 'phi': 0.0, 'bend': 1}
        if P.get('lie_loaf'):
            # (« en pain » : poignet sous le poitrail, un peu devant l'épaule, patte repliée vers l'arrière, coude
            # replié contre le flanc — chaton au poitrail profond : ses bras ne touchaient pas le sol à plat, pattes
            # tendues devant comme une otarie)
            wy = J0.y - P.get('lie_loaf_fwd', 0.25) * l2
            a3 = math.pi - P.get('lie_loaf_a3', 0.25)
            legsd[lab] = {'J3': (wy - l3 * math.cos(a3), R['J'][3].z), 'a3': a3, 'phi': P.get('lie_loaf_phi', 0.0), 'bend': 1}
    for lab in ('HL', 'HR'):
        R = rig.legs[lab]
        J0 = rot(R['J'][0])
        l1, l2, l3 = R['l2d'][:3]
        a3 = 0.05
        z3 = R['J'][3].z
        zh = z3 + l3 * math.sin(a3)
        fem = P.get('lie_fold', 0.35)
        sy = J0.y - l1 * math.cos(fem)
        sz = max(zh + 0.01, J0.z - l1 * math.sin(fem))
        hy = sy + math.sqrt(max(0.0, l2 * l2 - (sz - zh) ** 2)) * 0.97
        legsd[lab] = {'J3': (hy - l3 * math.cos(a3), z3), 'a3': a3, 'phi': 0.0, 'splay': 0.30, 'bend': 'fwd'}
    gp['legs'] = legsd
    return gp


LIE = lie_gp()
if want('lie'):
    dg.bake(rig, 'lie', LIE, 120, lambda t: dict(breathe(t, 0.7, 2), head_yaw=0.18 * math.sin(math.tau * t + 0.5),
                                                 tail_yaw=0.05 * math.sin(math.tau * t), ear_l=0.4 * pulse(t, 0.4)))


# ---- en boule (dormir) : couché, colonne courbée sur le côté, tête posée contre les cuisses, queue autour ---------
def curl_pose(t=0.0, k=1.0):
    # (curl_neck, curl_hb : encolure et tête baissées de plus, la tête posée — chaton à grosse tête)
    gp = dict(LIE, tail_side=[x * 1.1 for x in WRAP], neck_base=LIE['neck_base'] + P.get('curl_neck', 0.25),
              head_base=LIE['head_base'] + P.get('curl_hb', 0.35))
    base, _ = dg.pose_at(rig, t, gp, lambda u: breathe(u, 1.4, 1))
    a = P.get('curl', 0.42) * k
    spec = {'spine1': ('Z', a * 0.8), 'spine2': ('Z', a), 'spine3': ('Z', a), 'chest': ('Z', a * 0.7),
            'neck1': ('Z', a * 1.3), 'neck2': ('Z', a * 1.1), 'head': ('X', P.get('curl_head', 0.35) * k),
            'tail1': ('Z', -0.25 * k)}
    # (léger coucher sur le flanc droit, autour de l'axe long du ventre)
    roll = P.get('curl_roll', 0.30) * k
    piv = Vector((0.0, (sh.y + hp.y) / 2, 0.0))
    G_ = dg.rot_axis_about(-roll, (0, 1, 0), piv)
    return clamp_tail(dg.bend(rig, base, spec, G_))


def pose_points(pose, items):
    """Positions (monde) des sommets items dans une pose (matrices espace armature)."""
    act = dg.bake(rig, '_probe', None, 2, pose_fn=lambda t: (dict(pose), {}))
    arm.animation_data.action = act
    bpy.context.scene.frame_set(0)
    dgp = bpy.context.evaluated_depsgraph_get()
    dgp.update()
    byobj = {}
    for m_, i_ in items:
        byobj.setdefault(m_, []).append(i_)
    pts = []
    for m_, ids in byobj.items():
        ev = m_.evaluated_get(dgp)
        me = ev.to_mesh()
        pts.extend(ev.matrix_world @ me.vertices[i_].co for i_ in ids)
        ev.to_mesh_clear()
    arm.animation_data.action = None
    bpy.data.actions.remove(act)
    return pts


# ---- en boule couché sur le flanc (chaton, curl_side) : couché sur le flanc droit (curl_roll), la colonne s'enroule
# autour de la verticale du sol (flexion surtout ventrale une fois couché : tête ramenée vers les cuisses, pattes
# repliées à l'intérieur), tête posée, queue enroulée autour du corps dans le plan du sol, posé sur le sol. (Assis
# sur ses pattes, encolure baissée, le chaton « en boule » restait debout tassé, dos rond, tête entre les pattes.)
CURL_DZ = [Vector((0.0, 0.0, 0.0))]


def curl_side_pose(t=0.0, k=1.0):
    rho = P.get('curl_roll', 1.2) * k
    mix = P.get('curl_mix', P.get('curl_roll', 1.2))
    ax = (math.sin(mix), 0.0, math.cos(mix))
    gp = dict(LIE, neck_base=LIE['neck_base'] + P.get('curl_neck', 0.0) * k, head_base=LIE['head_base'] + P.get('curl_hb', 0.0) * k,
              tail_shape=P.get('curl_tail_shape', [-0.1] * 8), tail_side=[0.0] * 8, ear_back=P.get('curl_ear_back', 0.0) * k)
    # (pattes du côté du sol rentrées vers le ventre, celles du dessus un peu écartées : couché sur le flanc, elles ne
    # passent pas sous le corps)
    gp['legs'] = {lab: dict(L_, splay=P.get('curl_splay', {}).get(lab, L_.get('splay', 0.0))) for lab, L_ in LIE['legs'].items()}
    base, _ = dg.pose_at(rig, t, gp, lambda u: breathe(u, 1.4, 1))
    a = P.get('curl', 0.45) * k
    sw = P.get('curl_spine', [0.3, 0.8, 1.0, 1.0, 0.8, 1.2, 1.0])
    spec = {n: (ax, a * w_) for n, w_ in zip(('pelvis', 'spine1', 'spine2', 'spine3', 'chest', 'neck1', 'neck2'), sw)}
    # (tête ramenée vers les cuisses, puis tournée sur son axe à l'inverse du corps : posée sur la joue, l'oreille
    # du dessous ne plonge pas dans le sol)
    spec['head'] = [(tuple(P.get('curl_head_ax', (1.0, 0.0, 0.0))), P.get('curl_head', 0.3) * k), ('Y', P.get('curl_head_roll', 0.0) * k)]
    tw = P.get('curl_tail', [0.2, 0.35, 0.45, 0.5, 0.55, 0.55, 0.5, 0.45])
    for n_, w_ in zip(TAIL, tw):
        spec[n_] = (ax, -w_ * k if P.get('curl_tail_neg') else w_ * k)
    # (roulé autour de l'axe long du corps, à mi-hauteur du chat couché : il reste au-dessus de sa racine)
    piv = Vector((0.0, (sh.y + hp.y) / 2, P.get('curl_pz', 0.35) * hipz))
    G_ = Matrix.Translation(-CURL_DZ[0] * k) @ dg.rot_axis_about(-rho, (0, 1, 0), piv)
    return clamp_tail(dg.bend(rig, base, spec, G_))


if P.get('curl_side'):
    # (posé sur le sol : le plus bas sommet du corps, hors queue et oreilles, à 2 mm)
    if os.environ.get('CURL_DEBUG'):
        exec(open(os.environ['CURL_DEBUG']).read(), globals())
    # (posé sur le sol : le plus bas sommet du corps, hors queue et oreilles, à 2 mm ; et recentré au-dessus de la
    # racine au repos, au milieu de la boule)
    pts_ = pose_points(curl_side_pose(0.0), solid)
    lo_ = Vector((min(p.x for p in pts_), min(p.y for p in pts_), min(p.z for p in pts_)))
    hi_ = Vector((max(p.x for p in pts_), max(p.y for p in pts_), max(p.z for p in pts_)))
    c0 = B['root'].head_local
    CURL_DZ[0] = Vector(((lo_.x + hi_.x) / 2 - c0.x, (lo_.y + hi_.y) / 2 - c0.y, lo_.z - 0.002))
    print('CURL côté : décalage', [round(x, 4) for x in CURL_DZ[0]], 'boule', [round(x, 3) for x in (hi_ - lo_)])
    curl_pose = curl_side_pose

if want('sleep'):
    dg.bake(rig, 'sleep', None, 120, pose_fn=lambda t: (curl_pose(t), {}))

# ---- toilette : assis, patte avant levée à la bouche, coups de langue (tête), puis la patte passe sur la tête -----
sit_pose0, _ = dg.pose_at(rig, 0.0, SIT)
mzc, _ = muzzle_at(sit_pose0)


def groom_gp(paw_to, head_dn, head_roll=0.0, neck_yaw=0.0):
    gp = dict(SIT, neck_base=SIT['neck_base'] + head_dn * 0.6, head_base=SIT['head_base'] + head_dn * 0.4)
    gp['legs'] = dict(SIT['legs'])
    gp['legs']['FL'] = {'J3': (paw_to.y, paw_to.z), 'a3': P.get('groom_a3', 2.2), 'phi': 0.9, 'bend': 1}
    gp['scap'] = {'FL': -P.get('groom_scap', 0.35)}
    return gp


lick_to = Vector((0, mzc.y + P.get('groom_dy', 0.035), mzc.z - P.get('groom_dz', 0.05)))
# (2e temps : la patte frotte la joue et passe sur le front ; groom_wipe_dz < 0 : elle reste à la joue)
wipe_to = Vector((0, mzc.y + P.get('groom_wipe_dy', 0.05), mzc.z + P.get('groom_wipe_dz', 0.02)))
G_lick = groom_gp(lick_to, P.get('groom_head', 0.55))
G_wipe = groom_gp(wipe_to, P.get('groom_wipe_head', 0.25))


def groom_pose(t):
    pl, _ = dg.pose_at(rig, t, G_lick, lambda u: {'head': 0.06 * max(0.0, math.sin(math.tau * 7 * u)), 'ear_l': -0.2, 'ear_r': -0.2})
    pw, _ = dg.pose_at(rig, t, G_wipe, lambda u: {'head_roll': -0.25, 'head_yaw': 0.25, 'ear_l': -0.5})
    k = dg.smooth((t - 0.55) / 0.12) * (1 - dg.smooth((t - 0.8) / 0.15))
    return clamp_tail(dg.blend_poses(rig, pl, pw, k)), {}


if want('groom'):
    dg.bake(rig, 'groom', None, 120, pose_fn=groom_pose)


# ---- étirement : debout -> antérieurs tendus loin devant, poitrail bas, croupe haute, queue levée -> debout --------
def stretch_gp():
    midy = (sh.y + hp.y) / 2
    chest = [p for _, _, p in torso if p.y < midy]
    cpt = min(chest, key=lambda p: p.z)
    th = math.atan2(cpt.z - P.get('stretch_chest', 0.05) * s, hp.y - cpt.y)
    gp = dict(still, pivot=hp.copy(), pitch_base=th, neck_base=-th * 1.05, head_base=-0.05, tail_shape=TAIL_UP, ear_back=0.3,
              scap={'FL': -P.get('stretch_scap', 0.45), 'FR': -P.get('stretch_scap', 0.45)})
    piv = hp

    def rot(p):
        return Vector((p.x, piv.y + (p.y - piv.y) * math.cos(th) - (p.z - piv.z) * math.sin(th),
                       piv.z + (p.y - piv.y) * math.sin(th) + (p.z - piv.z) * math.cos(th)))
    legsd = {}
    for lab in ('FL', 'FR'):
        R = rig.legs[lab]
        l1, l2, l3 = R['l2d'][:3]
        J0 = rot(R['J'][0])
        reach = (l1 + l2) * P.get('stretch_reach', 0.92)
        hz = max(0.0, J0.z - R['J'][3].z)
        dy_ = math.sqrt(max(0.0, reach * reach - hz * hz))
        legsd[lab] = {'J3': (J0.y - dy_, R['J'][3].z), 'a3': 0.0, 'phi': 0.0, 'bend': 1}
    gp['legs'] = legsd
    return gp


if want('stretch'):
    st_p = dg.pose_at(rig, 0.0, stretch_gp(), lambda u: {})[0]
    stand_p = dg.pose_at(rig, 0.0, dict(still, tail_shape=TAIL_RELAX))[0]

    def stretch_pose(t):
        k = dg.smooth(t / 0.3) * (1 - dg.smooth((t - 0.75) / 0.25))
        return clamp_tail(dg.blend_poses(rig, stand_p, st_p, k)), {}
    dg.bake(rig, 'stretch', None, 90, cyclic=False, pose_fn=stretch_pose)

# ---- queue levée : debout, queue dressée en crosse, le bout qui bat ; oreilles en avant --------------------------
if want('tail_up'):
    dg.bake(rig, 'tail_up', dict(still, tail_shape=TAIL_UP, tail_amp=0.12, tail_freq=2, tail_yaw=0.05), 60,
            lambda t: dict(breathe(t, 1, 2), head_yaw=0.1 * math.sin(math.tau * t)))

# ---- oreilles : debout, oreilles qui pivotent (écoute), se couchent un instant, frémissent -------------------------
if want('ears'):
    def ears_e(t):
        sw = 0.6 * math.sin(math.tau * t)
        return dict(breathe(t), ear_l=max(0.0, sw) + 0.5 * pulse(t, 0.15), ear_r=max(0.0, -sw) + 0.5 * pulse(t, 0.85),
                    ear_back=0.6 * pulse(t, 0.5, 0.06), head_yaw=0.12 * math.sin(math.tau * t))
    dg.bake(rig, 'ears', dict(still, tail_shape=TAIL_RELAX, tail_yaw=0.1), 90, ears_e)

# ---- museau : recherche d'une pose (encolure, tête, bascule) qui met le bout du nez à une hauteur donnée -----------
def muzzle_eval(gp):
    """Plus bas point du museau, et angles sous l'horizontale de la tête et de l'encolure (rad)."""
    pose, _ = dg.pose_at(rig, 0.0, gp)
    P_ = [(pose[b] @ rig.rest[b].inverted() @ p) for b, p in mz_pts]
    zmin = min(p.z for p in P_)
    c = sum(P_, Vector()) / len(P_)
    hj = pose['head'].translation
    nj = pose['neck1'].translation

    def below(a, b):
        d = b - a
        return math.atan2(-d.z, max(1e-6, math.hypot(d.x, d.y)) * (1 if d.y < 0 else -1))
    return zmin, below(hj, c), below(nj, hj)


def head_search(base, zt, nb_max, ha_max, ha_min=0.9, pitch=True, w_pt=2.0, nb_min=0.0, hb_min=-1.0):
    best = None
    for k in range(0, 9 if pitch else 1):
        pt = 0.04 * k
        for i in range(int(nb_min / 0.1), int(nb_max / 0.1) + 1):
            nb = i * 0.1
            for j in range(0, int((0.6 - hb_min) / 0.1) + 1):
                hb = hb_min + j * 0.1
                gp = dict(base, neck_base=base.get('neck_base', 0.0) + nb, head_base=base.get('head_base', 0.0) + hb,
                          pitch_base=base.get('pitch_base', 0.0) + pt)
                z, ha, na = muzzle_eval(gp)
                cost = abs(z - zt) * 8 + w_pt * pt + 0.02 * nb + 0.05 * abs(hb)
                cost += 4.0 * max(0.0, ha - ha_max) + 4.0 * max(0.0, ha_min - ha)
                if best is None or cost < best[0]:
                    best = (cost, gp, z, ha, na)
    print('HEAD SEARCH', zt, 'z', round(best[2], 4), 'tête', round(best[3], 3), 'encolure', round(best[4], 3))
    return best[1]


# ---- manger, boire, litière : accroupi (coudes et jarrets pliés, corps bas), museau dans la gamelle ---------------
if want('eat'):
    EAT = head_search(dict(still, pivot=hp.copy(), drop=P.get('eat_drop', 0.035) * s, tail_shape=TAIL_RELAX, tail_side=[x * 0.35 for x in WRAP]),
                      P.get('eat_z', 0.035) * s, 1.8, 1.4, ha_min=0.6)
    dg.bake(rig, 'eat', EAT, 60, lambda t: {'head': 0.05 * math.sin(math.tau * 4 * t), 'neck_yaw': 0.05 * math.sin(math.tau * t),
                                             'ear_l': 0.3 * pulse(t, 0.35), 'tail_yaw': 0.05 * math.sin(math.tau * t)})

# ---- tape dans la main (tour du spectacle) : assis, un antérieur levé haut devant la tête -------------------------
if want('highfive'):
    hf_to = Vector((0, mzc.y - P.get('hf_fwd', 0.05) * s, mzc.z - P.get('hf_down', 0.03) * s))
    HF = dict(SIT, neck_base=SIT['neck_base'] - 0.12, head_base=SIT['head_base'] - 0.18)
    HF['legs'] = dict(SIT['legs'])
    HF['legs']['FL'] = {'J3': (hf_to.y, hf_to.z), 'a3': -1.2, 'phi': P.get('hf_phi', -1.0), 'bend': 1}
    HF['scap'] = {'FL': -P.get('hf_scap', 0.3)}
    hf_p = dg.pose_at(rig, 0.0, HF)[0]
    sit_p0 = dg.pose_at(rig, 0.0, SIT)[0]

    def hf_pose(t):
        k = dg.smooth(t / 0.25) * (1 - dg.smooth((t - 0.8) / 0.2))
        return clamp_tail(dg.blend_poses(rig, sit_p0, hf_p, k)), {}
    dg.bake(rig, 'highfive', None, 60, cyclic=False, pose_fn=hf_pose)


# ---- saut (agility, barrière) : appel accroupi, détente, envol pattes repliées, réception ; hauteur donnée par le jeu
def fold_legs(base, front, hind):
    """Pose « repliée » : front / hind = (avancée du métapode en fraction de la longueur, hauteur en fraction, a3)."""
    gp = dict(base)
    legsd = {}
    for lab in rig.legs:
        R = rig.legs[lab]
        fy, fz, a3 = front if lab[0] == 'F' else hind
        L3 = R['lens'][0] + R['lens'][1]
        legsd[lab] = {'J3': (R['J'][3].y - fy * L3, R['J'][3].z + fz * L3), 'a3': a3, 'phi': 0.0}
    gp['legs'] = legsd
    return gp


if want('jump'):
    up = dict(tail_shape=[0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.7])
    jump_keys = [
        (0.0, fold_legs(dict(still, drop=0.06 * s, pitch_base=0.1, neck_base=-0.1, **up), (0.05, 0.0, 0.0), (0.1, 0.0, 0.2))),
        (0.25, fold_legs(dict(still, pitch_base=-0.35, neck_base=0.2, head_base=0.15, **up), (0.15, 0.5, 2.0), (-0.3, 0.02, -0.3))),
        (0.5, fold_legs(dict(still, pitch_base=0.0, neck_base=0.0, **up), (0.35, 0.4, 1.7), (-0.35, 0.3, -0.2))),
        (0.75, fold_legs(dict(still, pitch_base=0.28, neck_base=-0.2, **up), (0.25, 0.03, 0.2), (0.1, 0.4, 1.6))),
        (1.0, fold_legs(dict(still, drop=0.05 * s, pitch_base=0.08, neck_base=-0.1, **up), (0.05, 0.0, 0.0), (0.1, 0.0, 0.2))),
    ]
    jposes = [(t, dg.pose_at(rig, 0.0, gp)[0]) for t, gp in jump_keys]

    def jump_pose(t):
        for k in range(len(jposes) - 1):
            t0, p0 = jposes[k]
            t1, p1 = jposes[k + 1]
            if t <= t1:
                return clamp_tail(dg.blend_poses(rig, p0, p1, dg.smooth((t - t0) / (t1 - t0)))), {}
        return jposes[-1][1], {}
    dg.bake(rig, 'jump', None, 30, cyclic=False, pose_fn=jump_pose)

# ---- en équilibre sur une barre : pas lent, pieds posés sur la ligne du milieu, corps bas, queue en balancier -----
if want('balance'):
    BAL = dict(G['walk'])
    BAL.update(frames=32, stride=0.20 * s, lift=0.03 * s, narrow=P.get('narrow', 0.85), drop=0.012 * s, neck_base=0.18, head_base=-0.1,
               tail_shape=[0.12, 0.1, 0.08, 0.06, 0.06, 0.08, 0.12, 0.18], tail_amp=0.0, tail_yaw=0.35, tail_yaw_freq=1, tail_lag=0.12, roll=0.03)
    BAL['speed'] = BAL['stride'] / (BAL['duty'] * BAL['frames'] / 30)
    dg.bake(rig, 'balance', BAL, BAL['frames'])
    speeds['balance'] = round(BAL['speed'], 3)

# ---- transitions -----------------------------------------------------------------------------------------------------
stand_p = dg.pose_at(rig, 0.0, idle_gp)[0]
sit_p = dg.pose_at(rig, 0.0, SIT)[0]
lie_p = dg.pose_at(rig, 0.0, LIE)[0]


def trans(name, pa, pb, frames):
    if want(name):
        dg.bake(rig, name, None, frames, cyclic=False, pose_fn=lambda t: (clamp_tail(dg.blend_poses(rig, pa, pb, dg.smooth(t))), {}))


trans('sit_down', stand_p, sit_p, 24)
trans('stand_up', sit_p, stand_p, 18)
trans('lie_down', sit_p, lie_p, 30)
trans('get_up', lie_p, stand_p, 24)
if want('sleep') and P.get('curl_side'):
    # (couché -> en boule sur le flanc : le chat roule sur le flanc droit ; à chaque image, le plus bas sommet du corps
    # est posé sur le sol, à une hauteur qui va de celle du couché à celle de la boule — sans cela, à mi-chemin, les
    # pattes repliées du dessous passaient sous le sol et le chaton, relevé d'autant, flottait à 4 cm)
    cu_a, cu_b, cu_n = lie_p, curl_pose(0.0), 36
    # (la tête tourne sur sa joue avant que le corps ait fini de rouler : l'oreille du dessous reste au-dessus du sol)
    cu_head = set(K.descendants(arm, 'neck1'))
    cu_lead = P.get('curl_head_lead', 0.6)
    cu_pose = lambda t: dg.blend_poses(rig, cu_a, cu_b, lambda n_: dg.smooth(min(1.0, t / cu_lead)) if n_ in cu_head else dg.smooth(t))
    cu_low = [min(p.z for p in pose_points(cu_pose(i / cu_n), solid)) for i in range(cu_n + 1)]
    ears_ = [(body, i_) for i_ in range(len(body.data.vertices)) if (dom[body][i_] or '').startswith('ear')]
    print('CURL_UP oreilles - sol (mm)', [round(1000 * (min(p.z for p in pose_points(cu_pose(i / cu_n), ears_)) - cu_low[i] + (cu_low[0] * (1 - i / cu_n) + cu_low[-1] * i / cu_n)), 1) for i in range(0, cu_n + 1, 4)])

    def cu_fn(t):
        x = t * cu_n
        i = min(cu_n - 1, int(x))
        u = x - i
        dz = cu_low[i] * (1 - u) + cu_low[i + 1] * u - (cu_low[0] * (1 - t) + cu_low[-1] * t)
        T = Matrix.Translation((0.0, 0.0, -dz))
        return clamp_tail({k_: T @ v_ for k_, v_ in cu_pose(t).items()}), {}
    dg.bake(rig, 'curl_up', None, cu_n, cyclic=False, pose_fn=cu_fn)
elif want('sleep'):
    trans('curl_up', lie_p, curl_pose(0.0), 36)


# ---- corps jamais sous le sol : relevé image par image (hors queue et oreilles) --------------------------------------
def ground_fix(act):
    K.clear_anim(arm)
    arm.animation_data.action = act
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    sub = solid
    lows = []
    for fr in range(f0, f1 + 1):
        bpy.context.scene.frame_set(fr)
        lows.append(min(K.Probe(None).z_of(sub)))
    need = [max(0.0, -z) for z in lows]
    if max(need) < 0.001:
        arm.animation_data.action = None
        return 0.0
    n = len(need)
    cyc = act.use_cyclic
    get = lambda i: need[i % n] if cyc else need[min(n - 1, max(0, i))]
    mx = [max(get(i + k) for k in range(-2, 3)) for i in range(n)]
    gm = lambda i: mx[i % n] if cyc else mx[min(n - 1, max(0, i))]
    offs = [max(need[i], sum(gm(i + k) for k in range(-2, 3)) / 5) for i in range(n)]
    R = B['root'].matrix_local.to_3x3().inverted()
    d = R @ Vector((0, 0, 1))
    path = 'pose.bones["root"].location'
    fcs = [act.fcurves.find(path, index=k) for k in range(3)]
    for k in range(3):
        if fcs[k] is None:
            fcs[k] = act.fcurves.new(path, index=k, action_group='root')
    vals = [[fcs[k].evaluate(f0 + i) for i in range(n)] for k in range(3)]
    for k in range(3):
        fc = fcs[k]
        while fc.keyframe_points:
            fc.keyframe_points.remove(fc.keyframe_points[0])
        for i in range(n):
            kp = fc.keyframe_points.insert(f0 + i, vals[k][i] + d[k] * offs[i])
            kp.interpolation = 'LINEAR'
    arm.animation_data.action = None
    return max(need)


report['groundFix'] = {}
for act in bpy.data.actions:
    if act.name.startswith('_'):
        continue
    fix = ground_fix(act)
    if fix:
        report['groundFix'][act.name] = round(fix, 4)
        print('GROUND', act.name, 'relevé de', round(fix, 4))

report['clips'] = K.check_clips(arm, meshes, paws, muzzle)
report['speedsNote'] = 'vitesses naturelles (m/s) : action.timeScale = vitesse / vitesse naturelle'
# matières des yeux reconnaissables après export (pack_cat.mjs les nomme cat_eye)
for e in meshes:
    for m in e.data.materials:
        if m and 'eye' not in m.name.lower() and (e in eyes or m.name in M.get('eye_mats', ())):
            m.name = 'eye_' + m.name
# un seul maillage (une primitive par matière) : moins d'appels de dessin dans le jeu (moustaches, yeux, pièces)
if len(meshes) > 1:
    K.select_only(meshes)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    meshes = [body]
bpy.ops.wm.save_as_mainfile(filepath=out.replace('.glb', '.blend'), compress=True)
K.export_glb(out, arm)
json.dump(report, open(report_path, 'w'), indent=1)
