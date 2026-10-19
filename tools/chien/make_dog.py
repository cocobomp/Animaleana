# Prépare un chien du jeu : nettoyage, orientation, échelle (garrot 0,57 m), clips d'origine renommés, allures et
# poses générées, pattes jamais sous le sol, vérifications sur le maillage déformé, export GLB brut.
# Usage : blender -b --factory-startup --disable-autoexec --python make_dog.py -- <id> <sortie.glb> <rapport.json>
#         [--dump-retarget <poses.json>] (shiba : poses de ses clips faits main, pour les reprendre sur le jack)
#         [--retarget <poses.json>] (jack : clips faits main du shiba repris sur son squelette)
import bpy, sys, os, math, json, re
from mathutils import Vector, Matrix, Quaternion
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dogkit as K
import dog_gait as dg
import models

argv = sys.argv[sys.argv.index('--') + 1:]
mid, out, report_path = argv[0], argv[1], argv[2]
opt = {argv[i]: argv[i + 1] for i in range(3, len(argv) - 1) if argv[i].startswith('--')}
M = models.MODELS[mid]
K.load(M['src'])
arm, meshes = M['prep']()
B = arm.data.bones
report = {'id': mid, 'clips': {}, 'notes': []}
GAME = re.compile(M['game_bones'])

# ---- orientation : avant = -Y ; échelle : garrot 0,57 m ; pattes au sol ----------------------------------------
pts = K.world_verts(meshes)
wy = (arm.matrix_world @ B[M['withers_bone']].head_local).y
band = 0.025 * (max(p.y for p in pts) - min(p.y for p in pts))
wh, _ = K.measure_withers(meshes, wy, band)
f = K.WITHERS / wh
print('WITHERS source', wh, 'factor', f)
K.transform_all(arm, meshes, Matrix.Scale(f, 4), loc_scale=f)
pts = K.world_verts(meshes)
cx = sum((arm.matrix_world @ B[L['joints'][0]].head_local).x for L in M['legs'].values()) / 4
off = Vector((-cx, -(min(p.y for p in pts) + max(p.y for p in pts)) / 2, -min(p.z for p in pts)))
K.transform_all(arm, meshes, Matrix.Translation(off))
report['tris'] = K.tris(meshes)
report['bones'] = len(B)

# ---- clips d'origine ---------------------------------------------------------------------------------------------
kept = K.rename_actions(M.get('clips', {}))
for act in bpy.data.actions:
    for fc in list(act.fcurves):
        if fc.data_path.endswith('.scale'):
            act.fcurves.remove(fc)
print('KEPT', kept)
K.clear_anim(arm)


def action_pose(act, frame):
    """Pose (matrices espace armature) d'une action à une image."""
    K.clear_anim(arm)
    arm.animation_data.action = act
    bpy.context.scene.frame_set(frame)
    bpy.context.view_layer.update()
    P = {pb.name: pb.matrix.copy() for pb in arm.pose.bones}
    Bs = {pb.name: pb.matrix_basis.copy() for pb in arm.pose.bones}
    arm.animation_data.action = None
    K.clear_anim(arm)
    P['__body__'] = Matrix.Identity(4)
    return P, Bs


base_basis = {}
if M.get('base_from') and M['base_from'][0] in kept:
    clip, frame, prefixes = M['base_from']
    _, Bs = action_pose(bpy.data.actions[clip], frame)
    for pfx in prefixes:
        for b in B:
            if b.name.startswith(pfx):
                base_basis[b.name] = Bs[b.name]
    print('BASE POSE', clip, frame, len(base_basis), 'bones')

# ---- squelette pour les allures ------------------------------------------------------------------------------------
legs, paws = {}, {}
for lab, L in M['legs'].items():
    drive = [(j, i) for i, j in enumerate(L['joints'])]
    P4 = [B[j].head_local.copy() for j in L['joints']]
    tip, heel_y, pv = K.sole_points(arm, meshes, L['joints'][3], P4[3])
    paws[lab] = pv
    legs[lab] = dict(points=P4 + [tip], drive=drive, heel_y=heel_y, kind='front' if lab[0] == 'F' else 'hind',
                     gain=L.get('gain', 0.55 if lab[0] == 'F' else 0.6), neutral_dy=L.get('neutral_dy', 0.0), scap=L.get('scap'))
hipz = sum(legs[k]['points'][0].z for k in ('HL', 'HR')) / 2
s = hipz / 0.42
for lab in legs:
    legs[lab]['scap_gain'] = 0.9 / max(0.3, s) if legs[lab]['scap'] else 0.0
tail = M.get('tail', [])
tail_end = {}
for i, tname in enumerate(tail):
    tail_end[tname] = B[tail[i + 1]].head_local.copy() if i + 1 < len(tail) else B[tname].tail_local.copy()
sh = Vector((0, sum(legs[k]['points'][0].y for k in ('FL', 'FR')) / 2, sum(legs[k]['points'][0].z for k in ('FL', 'FR')) / 2))
hp = Vector((0, sum(legs[k]['points'][0].y for k in ('HL', 'HR')) / 2, hipz))
cfg = dict(legs=legs, neck=M['neck'], head=M['head'], tail=tail, tail_end=tail_end, ears=M.get('ears', []),
           jaw=[j for j in M.get('jaw', []) if j in B], tongue=[j for j in M.get('tongue', []) if j in B],
           flex=M.get('flex', []), pitch_pivot=(sh + hp) / 2,
           zmin_tail=0.012, base_basis=base_basis)
rig = dg.Rig(arm, cfg)
report['hipHeight'] = round(hipz, 4)
report['shoulderJoint'] = [round(sh.y, 4), round(sh.z, 4)]
print('HIP', hipz, 'SHOULDER', sh, 's', s)

# Sommets : museau (les plus en avant des os de la tête), tronc (ni pattes, ni tête, ni queue), os animés par le jeu.
headset = set()
for h in cfg['head']:
    headset.update(K.descendants(arm, h))
legset = set()
for L in legs.values():
    for b, k in L['drive']:
        legset.update(K.descendants(arm, b) if k > 0 else [b])
dom = {m: K.dominant_groups(m) for m in meshes}
muzzle, torso, solid = [], [], []
for m in meshes:
    mw = m.matrix_world
    cand = [(i, mw @ v.co) for i, v in enumerate(m.data.vertices) if dom[m][i] in headset and not (dom[m][i] or '').startswith(('ear', 'eye', 'tongue'))]
    if cand:
        ymin = min(p.y for _, p in cand)
        muzzle += [(m, i) for i, p in cand if p.y < ymin + 0.02]
    for i, v in enumerate(m.data.vertices):
        d = dom[m][i]
        if d and not GAME.search(d):
            solid.append((m, i))
            if d not in legset and d not in headset and d not in tail:
                p = mw @ v.co
                if hp.y + 0.02 > p.y > sh.y - 0.02:
                    torso.append((m, i, p))
belly = min(p.z for _, _, p in torso)
print('BELLY rest z', belly, 'torso verts', len(torso))
# croupe et fesses (derrière les hanches, sous elles, pas le bas des membres ni la queue) : ce qui touche le sol assis
lowleg = {b for L in legs.values() for b, k in L['drive'] if k >= 1}
rump = []
for m in meshes:
    mw = m.matrix_world
    for i, v in enumerate(m.data.vertices):
        d = dom[m][i]
        if not d or GAME.search(d) or d in lowleg or d in tail or d in headset:
            continue
        p = mw @ v.co
        if p.y > hp.y - 0.03 and 0.2 * hipz < p.z < hipz:
            rump.append((m, i))
print('RUMP', len(rump), 'sommets')

# ---- clips faits main du shiba repris sur ce squelette (repos, assis, donner la patte, rouler) ---------------------
RETARGET_BONES = ['root', 'pelvis', 'spine1', 'spine2', 'chest', 'neck1', 'neck2', 'head'] + \
    [f'{b}{s_}' for s_ in 'LR' for b in ('scap', 'humerus', 'radius', 'metacarpus', 'toes', 'femur', 'tibia', 'metatarsus', 'htoes')]

if opt.get('--dump-retarget'):
    dump = {'hip': hipz, 'rest': {b: [list(r) for r in B[b].matrix_local] for b in RETARGET_BONES}, 'clips': {}}
    for name in ('idle', 'sit', 'paw', 'rollover'):
        act = bpy.data.actions[name]
        f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
        frames = []
        for fr in range(f0, f1 + 1):
            P, _ = action_pose(act, fr)
            frames.append({b: [list(r) for r in P[b]] for b in RETARGET_BONES})
        dump['clips'][name] = frames
    json.dump(dump, open(opt['--dump-retarget'], 'w'))
    print('DUMP RETARGET', opt['--dump-retarget'])

if opt.get('--retarget'):
    src = json.load(open(opt['--retarget']))
    kS = hipz / src['hip']
    RS = {b: Matrix(v) for b, v in src['rest'].items()}

    def retarget_pose(frame):
        pose = {'__body__': Matrix.Identity(4)}
        for name in rig.order:
            b = B[name]
            if b.parent is None:
                M0 = rig.rest[name].copy()
            else:
                p = b.parent.name
                M0 = pose[p] @ rig.rest[p].inverted() @ rig.rest[name]
            if name in frame:
                S = Matrix(frame[name])
                D = S.to_quaternion() @ RS[name].to_quaternion().inverted()
                Q = D @ rig.rest[name].to_quaternion()
                Mn = Q.to_matrix().to_4x4()
                Mn.translation = M0.translation
                if name == 'root':
                    Mn.translation = rig.rest[name].translation + (S.translation - RS[name].translation) * kS
                pose[name] = Mn
            else:
                pose[name] = M0
        return pose
    for name, frames in src['clips'].items():
        if name not in M.get('retarget_clips', src['clips']):
            continue
        n = len(frames) - 1
        dg.bake(rig, name, None, n, cyclic=name in ('idle', 'sit'),
                pose_fn=lambda t, frames=frames, n=n: (retarget_pose(frames[min(n, round(t * n))]), {}))
        kept.append(name)
    print('RETARGET', list(src['clips']), 'échelle', round(kS, 3))

G = dg.gaits(s, K.FPS)
speeds = {}
for name in ('walk', 'trot', 'run'):
    gp = dict(G[name])
    dg.bake(rig, name, gp, gp['frames'])
    speeds[name] = round(gp['speed'], 3)
report['naturalSpeeds'] = speeds

still = dict(stride=0.0, duty=1.0, lift=0.0, phase={'HL': 0, 'FL': 0, 'HR': 0, 'FR': 0})
l3h = rig.legs['HL']['l2d'][2]


def breathe(t, k=1.0, n=3):
    return {'bob': 0.002 * s * math.sin(math.tau * n * t) * k}


# ---- assis : la croupe touche le sol (avant : un peu haute) ------------------------------------------------------
def sit_gp(hip_frac):
    target = hip_frac * hipz
    dy, dz = hp.y - sh.y, hp.z - sh.z
    th = 0.0
    for _ in range(60):  # z_sh + dy sin th + dz cos th = target
        z = sh.z + dy * math.sin(th) + dz * math.cos(th)
        th -= (z - target) / (dy * math.cos(th) - dz * math.sin(th) + 1e-9) * 0.7
    hipn_y = sh.y + dy * math.cos(th) - dz * math.sin(th)
    gp = dict(still, pivot=sh.copy(), pitch_base=th, neck_base=-th * 0.55, head_base=-th * 0.35)
    gp['legs'] = {lab: {'dy': 0.0, 'J3': (hipn_y - 0.9 * l3h, rig.legs[lab]['J'][3].z), 'a3': 0.10, 'phi': 0.0, 'splay': 0.12}
                  for lab in ('HL', 'HR')}
    return gp


if 'sit' not in kept:
    # hauteur des hanches : la plus haute où la croupe touche encore le sol (à 6 mm près)
    lo, hi = 0.12, 0.40
    for _ in range(9):
        midf = (lo + hi) / 2
        z = K.pose_probe(rig, sit_gp(midf), rump)
        if z > 0.006:
            hi = midf
        else:
            lo = midf
    sit = sit_gp(lo)
    report['sitHip'] = round(lo, 3)
    print('SIT hip frac', lo)
    dg.bake(rig, 'sit', sit, 90, lambda t: dict(breathe(t), head_yaw=0.12 * math.sin(math.tau * t)))


# ---- donner la patte (généré) : assis, antérieur gauche levé en avant, petites secousses ---------------------------
if 'paw' not in kept:
    base_sit = sit_gp(report.get('sitHip', 0.25))
    R = rig.legs['FL']
    l1, l2, l3 = R['l2d'][:3]
    J0 = R['J'][0]
    up = dict(base_sit)
    up['legs'] = dict(base_sit['legs'])
    up['legs']['FL'] = {'J3': (J0.y - 0.75 * (l1 + l2), J0.z - 0.35 * (l1 + l2)), 'a3': 2.4, 'phi': 0.6, 'bend': 1}
    up['head_base'] = base_sit.get('head_base', 0.0) - 0.1
    p_sit = dg.pose_at(rig, 0.0, base_sit)[0]
    p_up = dg.pose_at(rig, 0.0, up)[0]

    def paw_pose(t):
        k = dg.smooth(t / 0.25) * (1 - dg.smooth((t - 0.8) / 0.2))
        pose = dg.blend_poses(rig, p_sit, p_up, k)
        return pose, {}
    dg.bake(rig, 'paw', None, 120, cyclic=False, pose_fn=paw_pose)


# ---- couché (sphinx) ----------------------------------------------------------------------------------------------
def lie_gp():
    midy = (sh.y + hp.y) / 2
    chest = [p for _, _, p in torso if p.y < midy]
    cpt = min(chest, key=lambda p: p.z)
    drop = cpt.z - 0.012
    piv = Vector((0.0, cpt.y, cpt.z))
    target = 0.36 * hipz
    def hip_z(th):
        return piv.z + (hp.y - piv.y) * math.sin(th) + (hp.z - piv.z) * math.cos(th) - drop
    lo, hi = -0.6, 0.3
    for _ in range(40):
        mid_ = (lo + hi) / 2
        if hip_z(mid_) < target:
            lo = mid_
        else:
            hi = mid_
    th = -(lo + hi) / 2
    gp = dict(still, drop=drop, pivot=piv, pitch_base=-th, neck_base=0.05 + th * 0.6, head_base=0.05 + th * 0.4)
    def rot(p):
        return Vector((p.x, piv.y + (p.y - piv.y) * math.cos(-th) - (p.z - piv.z) * math.sin(-th),
                       piv.z + (p.y - piv.y) * math.sin(-th) + (p.z - piv.z) * math.cos(-th) - drop))
    legsd = {}
    for lab in ('FL', 'FR'):
        R = rig.legs[lab]
        l1, l2, l3 = R['l2d'][:3]
        J0 = rot(R['J'][0])
        zE = 0.08 * hipz
        hz = max(0.0, J0.z - zE)
        ey = J0.y + math.sqrt(max(0.0, l1 * l1 - hz * hz)) if hz < l1 else J0.y
        legsd[lab] = {'J3': (ey - l2 * 0.97 - l3, R['J'][3].z), 'a3': 0.0, 'phi': 0.0, 'bend': 1}
    for lab in ('HL', 'HR'):
        R = rig.legs[lab]
        J0 = rot(R['J'][0])
        legsd[lab] = {'J3': (J0.y - 0.95 * l3h, R['J'][3].z), 'a3': 0.06, 'phi': 0.0, 'splay': 0.32}
    gp['legs'] = legsd
    return gp


lie = lie_gp()
dg.bake(rig, 'lie', lie, 120, lambda t: dict(breathe(t, 0.7, 2), head_yaw=0.15 * math.sin(math.tau * t + 0.5)))

# ---- museau : recherche d'une pose (encolure, tête, bascule) qui met le bout du nez à une hauteur donnée -----------
mz_pts = [(dom[m][i], m.matrix_world @ m.data.vertices[i].co) for m, i in muzzle]


def muzzle_eval(gp):
    """Plus bas point du museau, et angles sous l'horizontale de la tête et de l'encolure (rad)."""
    pose, _ = dg.pose_at(rig, 0.0, gp)
    P = [(pose[b] @ rig.rest[b].inverted() @ p) for b, p in mz_pts]
    zmin = min(p.z for p in P)
    c = sum(P, Vector()) / len(P)
    hj = pose[cfg['head'][0]].translation
    nj = pose[cfg['neck'][0]].translation
    def below(a, b):
        d = b - a
        return math.atan2(-d.z, max(1e-6, math.hypot(d.x, d.y)) * (1 if d.y < 0 else -1))
    return zmin, below(hj, c), below(nj, hj)


def head_search(base, zt, nb_max, ha_max, ha_min=0.9, pitch=True, w_pt=2.0, nb_min=0.0, hb_min=-1.0):
    best = None
    for k in range(0, 13 if pitch else 1):
        pt = 0.03 * k
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


# renifler : bout du nez à 2 cm du sol, petits coups de nez, un antérieur un peu en avant
sniff = head_search(dict(still, leg_dy={'FL': -0.06 * s}, pivot=hp.copy(), drop=0.01 * s), 0.025 * s, 2.6, 1.6)
dg.bake(rig, 'sniff', sniff, 90, lambda t: {'head': 0.05 * max(0.0, math.sin(math.tau * 6 * t)) ** 2,
                                             'neck_yaw': 0.25 * math.sin(math.tau * t), 'head_yaw': 0.1 * math.sin(math.tau * t + 0.4)})
# manger : museau dans la gamelle (≈ 10 cm du sol), mâchoire qui mâche
eat = head_search(dict(still, pivot=hp.copy(), drop=0.008 * s), 0.10 * s, 1.8, 1.3, ha_min=0.7)
dg.bake(rig, 'eat', eat, 60, lambda t: {'head': 0.04 * math.sin(math.tau * 3 * t), 'jaw': 0.12 + 0.12 * math.sin(math.tau * 3 * t),
                                         'neck_yaw': 0.05 * math.sin(math.tau * t)})
# boire : un peu plus haut, gueule entrouverte, langue qui lape (shiba), petits coups de tête rapides
drink = head_search(dict(still, pivot=hp.copy(), drop=0.008 * s), 0.12 * s, 1.8, 1.3, ha_min=0.7)
dg.bake(rig, 'drink', drink, 60, lambda t: {'head': 0.03 * math.sin(math.tau * 6 * t), 'jaw': 0.16 + 0.06 * math.sin(math.tau * 6 * t),
                                             'tongue': 0.35 * math.sin(math.tau * 6 * t)})

# ---- dormir : couché, tête posée au sol entre les pattes, respiration lente ---------------------------------------
sleep = head_search(dict(lie), 0.02 * s, 2.8, 0.7, ha_min=-0.35, pitch=False, hb_min=-2.2)
dg.bake(rig, 'sleep', sleep, 120, lambda t: dict(breathe(t, 1.2, 1)))

# ---- queue qui remue (content) : corps qui ondule, gueule entrouverte -----------------------------------------------
dg.bake(rig, 'wag', dict(still, neck_base=-0.05), 30, lambda t: dict(
    yaw=0.03 * math.sin(math.tau * 4 * t + 1.2), roll=0.015 * math.sin(math.tau * 4 * t + 1.2),
    jaw=0.12 + 0.05 * math.sin(math.tau * 8 * t), head_yaw=0.05 * math.sin(math.tau * 2 * t)))

# ---- révérence (« play bow ») : coudes au sol, arrière-train levé ------------------------------------------------
def bow_gp():
    # bascule autour des hanches jusqu'à ce que le poitrail soit à ≈ 6 cm du sol
    midy = (sh.y + hp.y) / 2
    chest = [p for _, _, p in torso if p.y < midy]
    cpt = min(chest, key=lambda p: p.z)
    th = math.atan2(cpt.z - 0.10 * s, hp.y - cpt.y)
    gp = dict(still, pivot=hp.copy(), pitch_base=th, neck_base=-th * 0.9 - 0.15, head_base=-0.1)
    piv = hp
    def rot(p):
        return Vector((p.x, piv.y + (p.y - piv.y) * math.cos(th) - (p.z - piv.z) * math.sin(th),
                       piv.z + (p.y - piv.y) * math.sin(th) + (p.z - piv.z) * math.cos(th)))
    legsd = {}
    for lab in ('FL', 'FR'):
        R = rig.legs[lab]
        l1, l2, l3 = R['l2d'][:3]
        J0 = rot(R['J'][0])
        zE = 0.06 * hipz
        hz = max(0.0, J0.z - zE)
        ey = J0.y + math.sqrt(max(0.0, l1 * l1 - hz * hz)) * 0.6 if hz < l1 else J0.y
        legsd[lab] = {'J3': (ey - l2 * 0.97 - l3 * 0.9, R['J'][3].z), 'a3': 0.0, 'phi': 0.0, 'bend': 1}
    gp['legs'] = legsd
    return gp


bow = bow_gp()
dg.bake(rig, 'bow', bow, 60, lambda t: {'yaw': 0.04 * math.sin(math.tau * 2 * t), 'bob': 0.006 * s * math.sin(math.tau * 4 * t)})

# ---- saut (agility) : appel, envol pattes repliées, réception ; la hauteur est donnée par le jeu ------------------
def fold_legs(base, front, hind):
    """Pose « repliée » : front / hind = (avancée du métapode en fraction de la longueur, hauteur en fraction)."""
    gp = dict(base)
    legsd = {}
    for lab in rig.legs:
        R = rig.legs[lab]
        fy, fz, a3 = front if lab[0] == 'F' else hind
        L3 = R['lens'][0] + R['lens'][1]
        legsd[lab] = {'J3': (R['J'][3].y - fy * L3, R['J'][3].z + fz * L3), 'a3': a3, 'phi': 0.0}
    gp['legs'] = legsd
    return gp


jump_keys = [
    (0.0, fold_legs(dict(still, drop=0.05 * s, pitch_base=0.08, neck_base=-0.1), (0.05, 0.0, 0.0), (0.12, 0.0, 0.2))),
    (0.22, fold_legs(dict(still, pitch_base=0.32, neck_base=-0.25, head_base=0.1), (0.25, 0.55, 2.2), (-0.35, 0.05, -0.4))),
    (0.5, fold_legs(dict(still, pitch_base=0.0, neck_base=-0.05), (0.45, 0.35, 1.6), (-0.45, 0.25, -0.3))),
    (0.78, fold_legs(dict(still, pitch_base=-0.25, neck_base=0.15), (0.35, 0.05, 0.3), (0.25, 0.45, 2.0))),
    (1.0, fold_legs(dict(still, drop=0.05 * s, pitch_base=0.08, neck_base=-0.1), (0.05, 0.0, 0.0), (0.12, 0.0, 0.2))),
]
jposes = [(t, dg.pose_at(rig, 0.0, gp)[0]) for t, gp in jump_keys]


def jump_pose(t):
    for k in range(len(jposes) - 1):
        t0, p0 = jposes[k]
        t1, p1 = jposes[k + 1]
        if t <= t1:
            return dg.blend_poses(rig, p0, p1, dg.smooth((t - t0) / (t1 - t0))), {}
    return jposes[-1][1], {}


dg.bake(rig, 'jump', None, 30, cyclic=False, pose_fn=jump_pose)

# ---- poses de repos manquantes ------------------------------------------------------------------------------------
if 'idle' not in kept:
    dg.bake(rig, 'idle', dict(still, neck=0.02, neck_freq=1, head=0.02), 120, lambda t: dict(
        breathe(t), head_yaw=0.2 * math.sin(math.tau * t)))

# ---- transitions (s'asseoir / se relever / se coucher / se lever) -------------------------------------------------
stand_p, _ = dg.pose_at(rig, 0.0, dict(still))
sit_p = action_pose(bpy.data.actions['sit'], int(bpy.data.actions['sit'].frame_range[0]))[0]
lie_p = dg.pose_at(rig, 0.0, lie)[0]


def trans(name, pa, pb, frames):
    dg.bake(rig, name, None, frames, cyclic=False, pose_fn=lambda t: (dg.blend_poses(rig, pa, pb, dg.smooth(t)), {}))


trans('sit_down', stand_p, sit_p, 24)
trans('stand_up', sit_p, stand_p, 20)
trans('lie_down', sit_p, lie_p, 30)
trans('get_up', lie_p, stand_p, 30)

# ---- os animés par le jeu (queue, oreilles, paupières) : plus aucune clé ; pose de la queue au repos ---------------
for act in bpy.data.actions:
    for fc in list(act.fcurves):
        mm = re.match(r'pose\.bones\["(.+)"\]', fc.data_path)
        if mm and GAME.search(mm.group(1)):
            act.fcurves.remove(fc)
if base_basis:
    # (queue enroulée du shiba : clip d'une image « pose_tail », lu par le jeu)
    act = bpy.data.actions.new('pose_tail')
    act.use_fake_user = True
    arm.animation_data.action = act
    for name, Bm in base_basis.items():
        pb = arm.pose.bones[name]
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = Bm.to_quaternion()
        for fr in (0, 1):
            pb.keyframe_insert('rotation_quaternion', frame=fr, group=name)
    act.frame_range = (0, 1)
    arm.animation_data.action = None
    K.clear_anim(arm)

# ---- pattes jamais sous le sol : le corps est relevé image par image ----------------------------------------------
def ground_fix(act):
    """Plus bas sommet du maillage déformé (hors queue et oreilles, que le jeu anime) à chaque image ; s'il est sous
    le sol, la racine est relevée d'autant (lissé sur ± 2 images, jamais moins que le nécessaire)."""
    K.clear_anim(arm)
    arm.animation_data.action = act
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    sub = solid[::3]
    lows = []
    for fr in range(f0, f1 + 1):
        bpy.context.scene.frame_set(fr)
        lows.append(min(K.Probe(None).z_of(sub)))
    need = [max(0.0, -z) for z in lows]
    if max(need) < 0.0015:
        arm.animation_data.action = None
        return 0.0
    n = len(need)
    cyc = act.use_cyclic
    get = lambda i: need[i % n] if cyc else need[min(n - 1, max(0, i))]
    mx = [max(get(i + k) for k in range(-2, 3)) for i in range(n)]
    gm = lambda i: mx[i % n] if cyc else mx[min(n - 1, max(0, i))]
    offs = [max(need[i], sum(gm(i + k) for k in range(-2, 3)) / 5) for i in range(n)]
    rname = M['root']
    R = B[rname].matrix_local.to_3x3().inverted()
    d = R @ Vector((0, 0, 1))
    path = f'pose.bones["{rname}"].location'
    fcs = [act.fcurves.find(path, index=k) for k in range(3)]
    for k in range(3):
        if fcs[k] is None:
            fcs[k] = act.fcurves.new(path, index=k, action_group=rname)
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
    if act.name.startswith('_') or act.name == 'pose_tail':
        continue
    fix = ground_fix(act)
    if fix:
        report['groundFix'][act.name] = round(fix, 4)
        print('GROUND', act.name, 'relevé de', round(fix, 4))

report['clips'] = K.check_clips(arm, meshes, paws, muzzle, skip=('pose_tail',))
report['speedsNote'] = 'vitesses naturelles (m/s) : action.timeScale = vitesse / vitesse naturelle'
bpy.ops.wm.save_as_mainfile(filepath=out.replace('.glb', '.blend'), compress=True)
K.export_glb(out, arm)
json.dump(report, open(report_path, 'w'), indent=1)
