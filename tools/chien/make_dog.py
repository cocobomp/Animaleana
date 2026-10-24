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
# (jack : os de la mâchoire, langue modelée et gueule refermée, à l'échelle du jeu — models.jack_mouth)
if M.get('mouth'):
    M['mouth'](arm, meshes)
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


def dump_retarget(path):
    """Poses du shiba (matrices des os, espace armature, image par image) pour les reprendre sur le jack : ses clips
    faits main (repos, assis, patte, roulade) et ses poses couchées générées (couché, endormi), une fois au sol."""
    dump = {'hip': hipz, 'rest': {b: [list(r) for r in B[b].matrix_local] for b in RETARGET_BONES}, 'clips': {}}
    for name in ('idle', 'sit', 'paw', 'rollover', 'lie', 'sleep'):
        act = bpy.data.actions.get(name)
        if act is None:
            continue
        f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
        frames = []
        for fr in range(f0, f1 + 1):
            P, _ = action_pose(act, fr)
            frames.append({b: [list(r) for r in P[b]] for b in RETARGET_BONES})
        dump['clips'][name] = frames
    json.dump(dump, open(path, 'w'))
    print('DUMP RETARGET', path)


# Poses au sol reprises du shiba (assis, couché, endormi) : les proportions du jack (membres plus courts, tronc
# plus long, croupe plus basse) ne posent plus les mêmes points au sol. Le corps est descendu (ou relevé) pour
# que la croupe, le ventre ou les avant-bras touchent le sol, puis les membres sont repliés par cinématique
# inverse, pieds posés à plat à l'aplomb de leur place dans la pose du shiba. (Les poses du jack générées
# jusqu'ici n'étaient pas des assises : croupe en V, cuisse qui pendait, couché croupe en l'air.)
pawset = {(m, i) for ids in paws.values() for m, i in ids}
body_items = [it for it in solid if it not in pawset][::2]


def pose_lowest(pose, items):
    act = dg.bake(rig, '_low', None, 1, cyclic=False, pose_fn=lambda t: (pose, {}))
    arm.animation_data.action = act
    bpy.context.scene.frame_set(0)
    z = min(K.Probe(None).z_of(items))
    arm.animation_data.action = None
    bpy.data.actions.remove(act)
    return z


def lifted(pose, dz):
    out = {'__body__': pose['__body__']}
    for k_, Mx in pose.items():
        if k_ != '__body__':
            M2 = Mx.copy()
            M2.translation = Mx.translation + Vector((0, 0, dz))
            out[k_] = M2
    return out


def leg_joints(pose, lab, rg=None):
    L = (rg or rig).legs[lab]
    return [pose[n].translation.copy() for n, _k in L['drive']]


def a3_rest(lab, rg=None):
    J = (rg or rig).legs[lab]['J']
    return math.atan2(J[2].z - J[3].z, J[2].y - J[3].y)


def ground_leg(pose, lab, a3=None, bend=None, dy=0.0, splay=0.0, dz=0.0, rg=None, yabs=None):
    """Membre replié, métapode posé (articulation métapodo-phalangienne à sa hauteur de repos, à l'aplomb de sa
    place actuelle, avancée de dy, ou en yabs), angle a3 du métapode (None : celui du repos). rg : squelette (celui
    d'un gabarit : le sol du membre et ses articulations y sont déjà déplacés)."""
    rg = rg or rig
    L = rg.legs[lab]
    J = leg_joints(pose, lab, rg)
    # (squelette d'un gabarit : l'articulation haute de l'os est celle du squelette réel, les suivantes viennent du
    # gabarit — on repart de la tête de l'os ancre)
    J3 = Vector((L['J'][3].x, (J[3].y if yabs is None else yabs) + dy, L['J'][3].z + dz))
    Js, _pts = rg.solve_fold(lab, J[0], J3, a3_rest(lab, rg) if a3 is None else a3, 0.0, splay, bend)
    out = dict(pose)
    for n, k_ in L['drive']:
        out[n] = rg.bone_matrix(n, L['seg'][k_], L['J'][k_], Js[k_], Js[k_ + 1])
    return out


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

    GROUND_POSES = M.get('ground_poses', {})

    def settle_pose(name, pose, dz):
        p = lifted(pose, dz)
        for lab, spec in GROUND_POSES.get(name, {}).items():
            p = ground_leg(p, lab, **spec)
        return p

    for name, frames in src['clips'].items():
        if name not in M.get('retarget_clips', src['clips']):
            continue
        n = len(frames) - 1
        fix = None
        if name in GROUND_POSES:
            # (même descente pour toutes les images : celle qui pose le corps à la première)
            fix = -pose_lowest(retarget_pose(frames[0]), body_items) + 0.001
            print('RETARGET', name, 'corps descendu de', round(-fix, 4))
        dg.bake(rig, name, None, n, cyclic=name in ('idle', 'sit', 'lie', 'sleep'),
                pose_fn=lambda t, frames=frames, n=n, name=name, fix=fix: (
                    (settle_pose(name, retarget_pose(frames[min(n, round(t * n))]), fix) if fix is not None
                     else retarget_pose(frames[min(n, round(t * n))])), {}))
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
# Postérieurs repliés comme ceux d'un chien assis : fémur vers l'avant et un peu vers le haut (grasset devant la
# hanche), jambe qui redescend vers l'arrière, jarret posé au sol derrière la hanche, métatarse à plat vers l'avant.
# (Avant : le métatarse visé sous la hanche, le grasset pouvait passer derrière ou sous le sol, et la hanche du jack
# descendait jusqu'en butée : assis « en grenouille », pattes arrière étalées.)
SIT_FEMUR = M.get('sit_femur', 0.2)


def sit_gp(hip_frac, a3=0.10, flex=M.get('sit_flex', 0.0), tuck=M.get('sit_tuck', 0.0), femur=None):
    femur = SIT_FEMUR if femur is None else femur
    target = hip_frac * hipz
    dy, dz = hp.y - sh.y, hp.z - sh.z
    th = 0.0
    for _ in range(60):  # z_sh + dy sin th + dz cos th = target
        z = sh.z + dy * math.sin(th) + dz * math.cos(th)
        th -= (z - target) / (dy * math.cos(th) - dz * math.sin(th) + 1e-9) * 0.7
    hipn_y = sh.y + dy * math.cos(th) - dz * math.sin(th)
    # (flex < 0 : le dos se creuse aux reins, le poitrail se redresse ; l'encolure et la tête suivent moins)
    gp = dict(still, pivot=sh.copy(), pitch_base=th, neck_base=-th * 0.55 - flex * 0.3, head_base=-th * 0.35 - flex * 0.2, flex_base=flex)
    if tuck:
        # bassin rentré (tuck < 0 : l'arrière du bassin descend, les fesses passent sous la hanche, entre les
        # jarrets) ; la colonne repart dans son axe (l'os suivant tourne en sens inverse)
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
        legsd[lab] = {'J3': (hy - l3 * math.cos(a3), z3), 'a3': a3, 'phi': 0.0, 'splay': 0.14, 'bend': 'up'}
    gp['legs'] = legsd
    return gp


# croupe (fesses, ischion) : sommets derrière et sous la hanche, ni la queue ni le bas des membres — ce qui touche le
# sol assis (les seuls sommets portés par le bassin et le fémur, en haut de la cuisse, ne descendaient jamais)
rump_sit = []
for m in meshes:
    mw = m.matrix_world
    for i, v in enumerate(m.data.vertices):
        d_ = dom[m][i]
        if not d_ or GAME.search(d_) or d_ in tail or d_ in headset or d_.startswith(('metatarsus', 'htoes')):
            continue
        p = mw @ v.co
        if p.y > hp.y + 0.01 and 0.35 * hipz < p.z < hipz:
            rump_sit.append((m, i))
print('RUMP (assis)', len(rump_sit), 'sommets')


# (mise au point : --hook <script.py> exécute un script dans ce contexte, ici, puis s'arrête)
if opt.get('--hook'):
    exec(open(opt['--hook']).read(), globals())
    sys.exit(0)


if 'sit' not in kept:
    # hauteur des hanches : la plus haute où la croupe touche encore le sol (à 6 mm près)
    lo, hi = 0.12, 0.40
    if M.get('sit_hip'):
        lo, hi = M['sit_hip'], M['sit_hip']
    for _ in range(9 if hi > lo else 0):
        midf = (lo + hi) / 2
        z = K.pose_probe(rig, sit_gp(midf), rump_sit)
        print('SIT PROBE', round(midf, 3), round(z, 4))
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
    R = rig.legs['FL']
    l1, l2, l3 = R['l2d'][:3]
    if 'sit' in kept and not M.get('paw_from_gp'):
        # (sur l'assis repris du shiba : l'antérieur droit reste posé, le gauche se lève devant le poitrail)
        p_sit = action_pose(bpy.data.actions['sit'], int(bpy.data.actions['sit'].frame_range[0]))[0]
        J = leg_joints(p_sit, 'FL')
        lift_k = M.get('paw_lift', (0.62, 0.42))
        J3t = Vector((R['J'][3].x, J[0].y - lift_k[0] * (l1 + l2), J[0].z - lift_k[1] * (l1 + l2)))
        Js, _pts = rig.solve_fold('FL', J[0], J3t, 2.3, 0.7, 0.0, 1)
        p_up = dict(p_sit)
        for n_, k_ in R['drive']:
            p_up[n_] = rig.bone_matrix(n_, R['seg'][k_], R['J'][k_], Js[k_], Js[k_ + 1])
    else:
        base_sit = sit_gp(report.get('sitHip', 0.25))
        J0 = R['J'][0]
        up = dict(base_sit)
        up['legs'] = dict(base_sit['legs'])
        up['legs']['FL'] = {'J3': (J0.y - 0.75 * (l1 + l2), J0.z - 0.35 * (l1 + l2)), 'a3': 2.4, 'phi': 0.6, 'bend': 1}
        up['head_base'] = base_sit.get('head_base', 0.0) - 0.1
        p_sit = dg.pose_at(rig, 0.0, base_sit)[0]
        p_up = dg.pose_at(rig, 0.0, up)[0]

    def paw_pose(t):
        k = dg.smooth(t / 0.25) * (1 - dg.smooth((t - 0.8) / 0.2))
        pose = dg.blend_local(rig, p_sit, p_up, k)
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
    if th < 0:
        # Hanches déjà sous la cible une fois le poitrail posé (jack : le bas du poitrail est pesé sur les
        # membres, le point du tronc le plus bas est haut et le corps descendait trop) : on ne relève pas
        # l'arrière-train (il restait debout, croupe en l'air) ; le corps descend juste ce qu'il faut.
        th = 0.0
        drop = hp.z - target
        print('LIE : arrière-train non relevé, descente', round(drop, 4))
    if th > M.get('lie_pitch_max', 1.0):
        # (jack, poitrail profond : basculer autour du ventre pour descendre les hanches soulevait le poitrail, le
        # chien restait appuyé sur ses antérieurs, croupe basse et dos en pente ; il se couche à plat, hanches un peu
        # plus hautes)
        th = M['lie_pitch_max']
        print('LIE : bascule bornée', th)
    print('LIE th', round(th, 4), 'drop', round(drop, 4), 'cible hanches', round(target, 4))
    gp = dict(still, drop=drop, pivot=piv, pitch_base=-th, neck_base=0.05 + th * 0.6, head_base=0.05 + th * 0.4)
    def rot(p):
        return Vector((p.x, piv.y + (p.y - piv.y) * math.cos(-th) - (p.z - piv.z) * math.sin(-th),
                       piv.z + (p.y - piv.y) * math.sin(-th) + (p.z - piv.z) * math.cos(-th) - drop))
    legsd = {}
    for lab in ('FL', 'FR'):
        R = rig.legs[lab]
        l1, l2, l3 = R['l2d'][:3]
        J0 = rot(R['J'][0])
        # (coude au-dessus du sol de l'épaisseur de l'avant-bras : trop bas, la peau de l'avant-bras passait sous le
        # sol et tout le chien était relevé d'autant, arrière-train compris)
        zE = M.get('lie_elbow', 0.08) * hipz
        hz = max(0.0, J0.z - zE)
        ey = J0.y + math.sqrt(max(0.0, l1 * l1 - hz * hz)) if hz < l1 else J0.y
        # (métacarpe à plat : le poignet relevé de l'épaisseur du carpe, sinon il passait sous le sol)
        legsd[lab] = {'J3': (ey - l2 * 0.97 - l3, R['J'][3].z + M.get('lie_wrist', 0.0) * hipz), 'a3': 0.0, 'phi': 0.0, 'bend': 1}
    for lab in ('HL', 'HR'):
        R = rig.legs[lab]
        J0 = rot(R['J'][0])
        if M.get('lie_fold'):
            # (postérieurs repliés comme assis, à plat sur le côté : fémur vers l'avant et le bas, jarret posé
            # derrière la hanche, métatarse à plat ; visés sous la hanche, ils restaient dépliés sous une croupe haute)
            l1, l2, l3 = R['l2d'][:3]
            a3 = 0.06
            z3 = R['J'][3].z
            zh = z3 + l3 * math.sin(a3)
            fem = M['lie_fold']
            sy = J0.y - l1 * math.cos(fem)
            sz = max(zh + 0.02, J0.z - l1 * math.sin(fem))
            hy = sy + math.sqrt(max(0.0, l2 * l2 - (sz - zh) ** 2)) * 0.97
            legsd[lab] = {'J3': (hy - l3 * math.cos(a3), z3), 'a3': a3, 'phi': 0.0, 'splay': 0.36, 'bend': 'fwd'}
        else:
            legsd[lab] = {'J3': (J0.y - 0.95 * l3h, R['J'][3].z), 'a3': 0.06, 'phi': 0.0, 'splay': 0.32}
    gp['legs'] = legsd
    return gp


if 'lie' not in kept:
    lie = lie_gp()
    dg.bake(rig, 'lie', lie, 120, lambda t: dict(breathe(t, 0.7, 2), head_yaw=0.15 * math.sin(math.tau * t + 0.5)))

# ---- museau : recherche d'une pose (encolure, tête, bascule) qui met le bout du nez à une hauteur donnée -----------
mz_pts = [(dom[m][i], m.matrix_world @ m.data.vertices[i].co) for m, i in muzzle]


def muzzle_eval(gp, rg=None):
    """Plus bas point du museau, et angles sous l'horizontale de la tête et de l'encolure (rad)."""
    rg = rg or rig
    pose, _ = dg.pose_at(rg, 0.0, gp)
    P = [(pose[b] @ rg.rest[b].inverted() @ p) for b, p in mz_pts]
    zmin = min(p.z for p in P)
    c = sum(P, Vector()) / len(P)
    hj = pose[cfg['head'][0]].translation
    nj = pose[cfg['neck'][0]].translation
    def below(a, b):
        d = b - a
        return math.atan2(-d.z, max(1e-6, math.hypot(d.x, d.y)) * (1 if d.y < 0 else -1))
    return zmin, below(hj, c), below(nj, hj)


def head_search(base, zt, nb_max, ha_max, ha_min=0.9, pitch=True, w_pt=2.0, nb_min=0.0, hb_min=-1.0, pitch_max=0.36, rg=None):
    best = None
    for k in range(0, int(pitch_max / 0.03 + 1e-6) + 1 if pitch else 1):
        pt = 0.03 * k
        for i in range(int(nb_min / 0.1), int(nb_max / 0.1) + 1):
            nb = i * 0.1
            for j in range(0, int((0.6 - hb_min) / 0.1) + 1):
                hb = hb_min + j * 0.1
                gp = dict(base, neck_base=base.get('neck_base', 0.0) + nb, head_base=base.get('head_base', 0.0) + hb,
                          pitch_base=base.get('pitch_base', 0.0) + pt)
                z, ha, na = muzzle_eval(gp, rg)
                cost = abs(z - zt) * 8 + w_pt * pt + 0.02 * nb + 0.05 * abs(hb)
                cost += 4.0 * max(0.0, ha - ha_max) + 4.0 * max(0.0, ha_min - ha)
                if best is None or cost < best[0]:
                    best = (cost, gp, z, ha, na)
    print('HEAD SEARCH', zt, 'z', round(best[2], 4), 'tête', round(best[3], 3), 'encolure', round(best[4], 3))
    return best[1]


def front_planted(base, dy=None, splay=0.07, rg=None):
    """Antérieurs tendus et posés pendant que la tête descend (renifler, manger, boire) : pied à l'aplomb de l'épaule
    (là où il est debout par rapport à elle, un peu en avant), métacarpe à son angle de repos, seul le coude se plie
    de ce que l'épaule est descendue. (Visés à leur place du repos alors que le corps basculait de 0,3 rad, la
    cinématique inverse repliait l'avant-bras et le carpe : pied retourné sous le poitrail.)"""
    rg = rg or rig
    gp = dict(base)
    gp['legs'] = dict(base.get('legs', {}))
    for lab in ('FL', 'FR'):
        R = rg.legs[lab]
        d_ = (dy or {}).get(lab, 0.0)
        under = R['J'][3].y - R['J'][0].y
        gp['legs'][lab] = {'under': under + d_, 'a3': a3_rest(lab, rg), 'phi': 0.0, 'bend': 1, 'splay': splay}
    return gp


# renifler : bout du nez près du sol, petits coups de nez ; l'encolure et les épaules descendent (le corps bascule
# autour des hanches), les antérieurs restent sous les épaules, un peu en avant, seul le coude se plie (gabarit court :
# il bascule à peine, voir gabarits)
SNIFF_PITCH = M.get('sniff_pitch', 0.3)
sniff = head_search(front_planted(dict(still, pivot=hp.copy(), drop=0.01 * s), {'FL': -0.02 * s, 'FR': 0.0}), 0.025 * s, 3.4, 1.7, pitch_max=SNIFF_PITCH)
dg.bake(rig, 'sniff', sniff, 90, lambda t: {'head': 0.05 * max(0.0, math.sin(math.tau * 6 * t)) ** 2,
                                             'neck_yaw': 0.25 * math.sin(math.tau * t), 'head_yaw': 0.1 * math.sin(math.tau * t + 0.4)})
# manger : museau dans la gamelle (≈ 10 cm du sol), mâchoire qui mâche
eat = head_search(front_planted(dict(still, pivot=hp.copy(), drop=0.008 * s), {'FL': -0.015 * s, 'FR': -0.015 * s}), 0.10 * s, 2.0, 1.3, ha_min=0.7, pitch_max=SNIFF_PITCH)
dg.bake(rig, 'eat', eat, 60, lambda t: {'head': 0.04 * math.sin(math.tau * 3 * t), 'jaw': 0.12 + 0.12 * math.sin(math.tau * 3 * t),
                                         'neck_yaw': 0.05 * math.sin(math.tau * t)})
# boire : un peu plus haut, gueule entrouverte, langue qui lape (shiba), petits coups de tête rapides
drink = head_search(front_planted(dict(still, pivot=hp.copy(), drop=0.008 * s), {'FL': -0.015 * s, 'FR': -0.015 * s}), 0.12 * s, 2.0, 1.3, ha_min=0.7, pitch_max=SNIFF_PITCH)
dg.bake(rig, 'drink', drink, 60, lambda t: {'head': 0.03 * math.sin(math.tau * 6 * t), 'jaw': 0.16 + 0.06 * math.sin(math.tau * 6 * t),
                                             'tongue': 0.35 * math.sin(math.tau * 6 * t)})

# ---- dormir : couché, tête posée au sol entre les pattes, respiration lente ---------------------------------------
if 'sleep' not in kept:
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


def hind_tuck(gp, dz=0.62, dy=0.03, a3=1.2):
    """Postérieurs ramenés sous le corps (réception du saut) : métapode visé sous la hanche (dz × hauteur de la
    hanche plus bas, dy en avant), grasset vers l'avant. La flexion de la hanche reste celle d'un chien : le métapode
    visé plus haut que la hanche (ancienne réception) mettait le grasset au-dessus du bassin et la cuisse du jack se
    déchirait en voile."""
    piv = gp.get('pivot') or cfg['pitch_pivot']
    hipw = dg.rot_x_about(gp.get('pitch_base', 0.0), piv) @ hp
    gp = dict(gp)
    gp['legs'] = dict(gp['legs'])
    for lab in ('HL', 'HR'):
        gp['legs'][lab] = {'J3': (hipw.y - dy * hipz, hipw.z - gp.get('drop', 0.0) - dz * hipz), 'a3': a3, 'phi': 0.3, 'bend': 'fwd'}
    return gp


jump_keys = [
    (0.0, fold_legs(dict(still, drop=0.05 * s, pitch_base=0.08, neck_base=-0.1), (0.05, 0.0, 0.0), (0.12, 0.0, 0.2))),
    (0.22, fold_legs(dict(still, pitch_base=0.32, neck_base=-0.25, head_base=0.1), (0.25, 0.55, 2.2), (-0.35, 0.05, -0.4))),
    (0.5, fold_legs(dict(still, pitch_base=0.0, neck_base=-0.05), (0.45, 0.35, 1.6), (-0.45, 0.25, -0.3))),
    (0.78, fold_legs(dict(still, pitch_base=-0.25, neck_base=0.15), (0.35, 0.05, 0.3), (0.25, 0.45, 2.0))),
    (1.0, fold_legs(dict(still, drop=0.05 * s, pitch_base=0.08, neck_base=-0.1), (0.05, 0.0, 0.0), (0.12, 0.0, 0.2))),
]
if M.get('jump_tuck'):
    jump_keys[3] = (0.78, hind_tuck(jump_keys[3][1]))
jposes = [(t, dg.pose_at(rig, 0.0, gp)[0]) for t, gp in jump_keys]


def jump_pose(t):
    for k in range(len(jposes) - 1):
        t0, p0 = jposes[k]
        t1, p1 = jposes[k + 1]
        if t <= t1:
            return dg.blend_local(rig, p0, p1, dg.smooth((t - t0) / (t1 - t0))), {}
    return jposes[-1][1], {}


dg.bake(rig, 'jump', None, 30, cyclic=False, pose_fn=jump_pose)

# ---- poses de repos manquantes ------------------------------------------------------------------------------------
if 'idle' not in kept:
    dg.bake(rig, 'idle', dict(still, neck=0.02, neck_freq=1, head=0.02), 120, lambda t: dict(
        breathe(t), head_yaw=0.2 * math.sin(math.tau * t)))

# ---- transitions (s'asseoir / se relever / se coucher / se lever) -------------------------------------------------
stand_p, _ = dg.pose_at(rig, 0.0, dict(still))
sit_p = action_pose(bpy.data.actions['sit'], int(bpy.data.actions['sit'].frame_range[0]))[0]
lie_p = action_pose(bpy.data.actions['lie'], 0)[0] if 'lie' in kept else dg.pose_at(rig, 0.0, lie)[0]


def trans(name, pa, pb, frames):
    dg.bake(rig, name, None, frames, cyclic=False, pose_fn=lambda t: (dg.blend_local(rig, pa, pb, dg.smooth(t)), {}))


trans('sit_down', stand_p, sit_p, 24)
trans('stand_up', sit_p, stand_p, 20)
trans('lie_down', sit_p, lie_p, 30)
trans('get_up', lie_p, stand_p, 30)

# ---- gabarits : allures et poses des membres raccourcis ou allongés -----------------------------------------------
# Le jeu raccourcit ou allonge les membres d'une race (teckel, corgi : 0,5 ; lévriers : 1,28) en gardant les rotations
# des clips : la foulée des antérieurs ne correspondait plus à celle des postérieurs (pieds qui patinent, antérieurs
# qui ne touchent jamais le sol, galop disloqué des lévriers), les poses au sol non plus (teckel assis froissé, poitrail
# en l'air en donnant la patte, lévriers couchés debout). Pour chaque gabarit (MODELS : gabarits), ces clips sont
# refaits sur un squelette « virtuel » aux membres déformés comme dans le jeu (dogReal.js deformDog, étape 1), sol de
# chaque membre à la hauteur où son pied est alors monté ou descendu ; seules leurs rotations sont gardées (le jeu
# place lui-même les os de la race). Le jeu prend le gabarit le plus proche de la longueur des membres de la race.
GABARITS = M.get('gabarits', {})
report['gabarits'] = {}
gab_actions = set()
trunk_items = [(m, i) for m, i in solid if dom[m][i] not in legset and dom[m][i] not in headset][::2]
neck_desc = K.descendants(arm, cfg['neck'][0])


def gabarit_rig(k, legW=1.0, paws=1.0):
    def sm(e0, e1, x):
        t_ = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
        return t_ * t_ * (3 - 2 * t_)
    legs2 = {}
    for lab, L in cfg['legs'].items():
        P = [p.copy() for p in L['points']]
        T = P[0]
        a = P[2] - T
        ln = a.length
        a.normalize()
        out = [T.copy()]
        for p in P[1:]:
            # (comme deformDog : longueur le long de l'axe épaule → poignet, épaisseur — legW, paws — autour de lui ;
            # l'épaisseur déplace aussi le coude et le grasset vers l'axe : 4° de différence sur le fémur du galgo)
            al = (p - T).dot(a)
            perp = (p - T) - a * al
            a2 = al if al <= 0 else (al * k if al < ln else ln * k + (al - ln))
            out.append(p + a * (a2 - al) + perp * ((legW - 1) * sm(0, 0.05, al) + (paws - 1) * sm(ln * 0.85, ln * 1.05, al)))
        legs2[lab] = dict(L, points=out, ground=out[4].z - P[4].z, heel_y=L['heel_y'] + (out[4].y - P[4].y))
    return dg.Rig(arm, dict(cfg, legs=legs2))


def only_rotations(act, rg):
    """Clip d'un gabarit : plus de translation des os des membres (celles du squelette virtuel)."""
    for fc in list(act.fcurves):
        mm = re.match(r'pose\.bones\["(.+)"\]\.location', fc.data_path)
        if mm and mm.group(1) in rg.drive_of:
            act.fcurves.remove(fc)


def gab_bake(rg, name, frames, pose_fn=None, gp=None, extra=None, cyclic=True):
    act = dg.bake(rg, name, gp, frames, extra, cyclic=cyclic, pose_fn=pose_fn)
    only_rotations(act, rg)
    gab_actions.add(act.name)
    return act


def transformed(pose, Mx):
    out = {'__body__': pose['__body__']}
    for k_, P_ in pose.items():
        if k_ != '__body__':
            out[k_] = Mx @ P_
    return out


def pose_points(pose, items):
    act = dg.bake(rig, '_pts', None, 1, cyclic=False, pose_fn=lambda t: (pose, {}))
    arm.animation_data.action = act
    bpy.context.scene.frame_set(0)
    dgp = bpy.context.evaluated_depsgraph_get()
    dgp.update()
    byobj = {}
    for m, i in items:
        byobj.setdefault(m, []).append(i)
    pts = []
    for m, ids in byobj.items():
        ev = m.evaluated_get(dgp)
        me = ev.to_mesh()
        mw = ev.matrix_world
        pts += [mw @ me.vertices[i].co for i in ids]
        ev.to_mesh_clear()
    arm.animation_data.action = None
    bpy.data.actions.remove(act)
    return pts


def action_frames(name):
    act0 = bpy.data.actions[name]
    f0, f1 = int(act0.frame_range[0]), int(act0.frame_range[1])
    return [action_pose(act0, fr)[0] for fr in range(f0, f1 + 1)]


def hind_folded(p, rg, k, a3, bend='fwd'):
    # (pied arrière visé à la même place relative à la hanche, ramenée à la longueur du membre ; assis : grasset vers
    # le haut, contre le ventre — vers l'avant, le grasset des pattes courtes passait sous la hanche et sous le sol)
    for lab in ('HL', 'HR'):
        J = leg_joints(p, lab, rg)
        p = ground_leg(p, lab, a3=a3, bend=bend, rg=rg, yabs=J[0].y + (J[3].y - J[0].y) * min(1.0, k))
    return p


def flexed(p, steps):
    """Reins fléchis : chaque pas (pivot, os déplacés, angle) tourne les os déplacés (espace armature) autour de la tête
    de l'os pivot, axe X ; angle < 0 : l'arrière (bassin, cuisses, queue) passe en avant et en dessous."""
    p = dict(p)
    for pivot, moved, ang in steps:
        R = dg.rot_x_about(ang, p[pivot].translation.copy())
        for n_ in moved:
            p[n_] = R @ p[n_]
    return p


def gab_sit(gname, rg, k, gH, gF, flex=None):
    """Assis du gabarit : croupe posée sur son sol, corps basculé pour que les antérieurs presque tendus touchent le
    leur, tête gardée à son inclinaison, postérieurs repliés pieds à plat. flex (pattes courtes) : reins fléchis avant
    la pose — bassin rentré sous le corps (autour de la tête de spine1), puis bas du dos (autour de celle de spine2) : la
    croupe vient sous le poitrail, le dos se redresse (sans eux, la corde hanche → épaule restait à 0,62 m pour 0,2 m de
    hauteur d'épaule : dos à 18°, un chien accroupi)."""
    frames = action_frames('sit')
    if flex:
        rear = ['pelvis'] + [b for r in ('femurL', 'femurR', cfg['tail'][0]) for b in K.descendants(arm, r)]
        steps = [('spine1', rear, flex[0]), ('spine2', rear + ['spine1'], flex[1])]
        # (flex : bassin autour de spine1, bas du dos autour de spine2, poitrail redressé autour de chest, reins autour de
        # chest, tête relevée en plus)
        if len(flex) > 3 and flex[3]:
            steps.append(('chest', rear + ['spine1', 'spine2'], flex[3]))
        if len(flex) > 2 and flex[2]:
            steps.append(('chest', K.descendants(arm, 'chest'), flex[2]))
        frames = [flexed(p_, steps) for p_ in frames]
    p0 = frames[0]
    c = min(pose_points(p0, trunk_items), key=lambda p: p.z)
    J0 = sum((p0[rg.legs[l]['anchor']].translation for l in ('FL', 'FR')), Vector()) / 2
    hF = sum(rg.legs[l]['J'][0].z for l in ('FL', 'FR')) / 2 - gF
    want = gF + 0.93 * hF
    dz = gH - c.z + 0.001
    lo, hi = -0.9, 0.9
    for _ in range(40):
        mid = (lo + hi) / 2
        if (dg.rot_x_about(mid, c) @ J0).z + dz > want:
            lo = mid
        else:
            hi = mid
    phi = (lo + hi) / 2
    print('GABARIT', gname, 'assis : bascule', round(phi, 3), 'descente', round(dz, 4))
    Mx = Matrix.Translation(Vector((0, 0, dz))) @ dg.rot_x_about(phi, c)

    def one(p_):
        p = transformed(p_, Mx)
        # (tête gardée à l'inclinaison du clip : ce que la bascule et le redressement du poitrail lui ont donné est
        # repris à l'encolure — sans le poitrail, le teckel assis regardait ses pieds)
        Rn = dg.rot_x_about(-0.8 * phi - (flex[2] if flex and len(flex) > 2 else 0.0), p[cfg['neck'][0]].translation)
        for n_ in neck_desc:
            p[n_] = Rn @ p[n_]
        if flex and len(flex) > 4 and flex[4]:
            # (le reste à l'attache de la tête : tout à la base de l'encolure, elle se cassait en équerre)
            for nk, part in ((cfg['neck'][-1], 0.5), (cfg['head'][0], 0.5)):
                Rh = dg.rot_x_about(-flex[4] * part, p[nk].translation)
                for n_ in K.descendants(arm, nk):
                    p[n_] = Rh @ p[n_]
        p = hind_folded(p, rg, k, 0.08, 'up')
        for lab in ('FL', 'FR'):
            j0 = p[rg.legs[lab]['anchor']].translation
            p = ground_leg(p, lab, rg=rg, yabs=j0.y - 0.05 * hipz)
        return p
    poses = [one(p_) for p_ in frames]
    n = len(poses) - 1
    gab_bake(rg, 'sit_' + gname, n, pose_fn=lambda t: (poses[min(n, round(t * n))], {}))
    return poses[0]


def gab_sit_gen(gname, rg, gH, gF, gcfg):
    """Assis généré d'un gabarit aux pattes courtes (teckel, corgi) : le corps bascule autour de l'épaule (antérieurs
    tendus, posés sur leur sol) jusqu'à poser la croupe sur le sien ; reins creusés, bassin rentré ; postérieurs
    repliés sous le corps — fémur vers l'avant le long du ventre, jarret et métatarse à plat au sol. (L'assis du jack
    reporté sur ces membres gardait un dos presque à plat et des postérieurs en paquet derrière la croupe.)"""
    hip_frac = gcfg.get('sit_hip', 0.16)
    femur = gcfg.get('sit_femur', SIT_FEMUR)
    flex = gcfg.get('sit_flex', M.get('sit_flex', 0.0))
    tuck = gcfg.get('sit_tuck', M.get('sit_tuck', 0.0))
    a3 = gcfg.get('sit_a3', 0.06)
    target = gH + hip_frac * hipz
    dy, dz = hp.y - sh.y, hp.z - sh.z
    th = 0.0
    for _ in range(60):
        z = sh.z + dy * math.sin(th) + dz * math.cos(th)
        th -= (z - target) / (dy * math.cos(th) - dz * math.sin(th) + 1e-9) * 0.7
    hipn_y = sh.y + dy * math.cos(th) - dz * math.sin(th)
    print('GABARIT', gname, 'assis généré : bascule', round(th, 3), 'rad, hanche à', round(target, 4))
    gp = dict(still, pivot=sh.copy(), pitch_base=th, neck_base=-th * 0.6 - flex * 0.3, head_base=-th * 0.35 - flex * 0.2, flex_base=flex)
    if tuck:
        gp['tilt'] = {'pelvis': tuck, 'spine1': -tuck}
    legsd = {}
    for lab in ('HL', 'HR'):
        R = rg.legs[lab]
        l1, l2, l3 = R['l2d'][:3]
        z3 = R['J'][3].z
        zh = z3 + l3 * math.sin(a3)
        sy = hipn_y - l1 * math.cos(femur)
        sz = target + l1 * math.sin(femur)
        hy = sy + math.sqrt(max(0.0, l2 * l2 - (sz - zh) ** 2)) * 0.97
        legsd[lab] = {'J3': (hy - l3 * math.cos(a3), z3), 'a3': a3, 'phi': 0.0, 'splay': gcfg.get('sit_splay', 0.18), 'bend': 'up'}
    # (antérieurs tendus à l'aplomb des épaules, un peu en avant)
    for lab in ('FL', 'FR'):
        R = rg.legs[lab]
        legsd[lab] = {'under': R['J'][3].y - R['J'][0].y - 0.02 * hipz, 'a3': a3_rest(lab, rg), 'phi': 0.0, 'bend': 1, 'splay': 0.04}
    gp['legs'] = legsd
    gab_bake(rg, 'sit_' + gname, 90, gp=gp, extra=lambda t: dict(breathe(t), head_yaw=0.12 * math.sin(math.tau * t)))
    return dg.pose_at(rg, 0.0, gp)[0]


def gab_bow(gname, rg, gH, gF):
    """Révérence d'un gabarit : postérieurs tendus debout sur leur sol, coudes au sol devant, corps basculé autour
    des hanches. (La révérence du modèle d'origine sur des pattes raccourcies laissait les pieds arrière à 6 cm du
    sol.)"""
    s2 = (hipz - gH) / 0.42
    midy = (sh.y + hp.y) / 2
    chest = [p for _, _, p in torso if p.y < midy]
    cpt = min(chest, key=lambda p: p.z)
    th = math.atan2(cpt.z - (gF + 0.025), hp.y - cpt.y)
    print('GABARIT', gname, 'révérence : bascule', round(th, 3))
    gp = dict(still, pivot=hp.copy(), pitch_base=th, neck_base=-th * 0.9 - 0.15, head_base=-0.1)
    piv = hp

    def rot(p):
        return Vector((p.x, piv.y + (p.y - piv.y) * math.cos(th) - (p.z - piv.z) * math.sin(th),
                       piv.z + (p.y - piv.y) * math.sin(th) + (p.z - piv.z) * math.cos(th)))
    legsd = {}
    for lab in ('FL', 'FR'):
        R = rg.legs[lab]
        l1, l2, l3 = R['l2d'][:3]
        J0 = rot(R['J'][0])
        zE = gF + 0.05 * hipz
        hz = max(0.0, J0.z - zE)
        ey = J0.y + math.sqrt(max(0.0, l1 * l1 - hz * hz)) * 0.6 if hz < l1 else J0.y
        legsd[lab] = {'J3': (ey - l2 * 0.97 - l3 * 0.9, R['J'][3].z), 'a3': 0.0, 'phi': 0.0, 'bend': 1}
    # (postérieurs : posés debout sur leur sol par la cinématique inverse des allures, foulée nulle)
    gp['legs'] = legsd
    gab_bake(rg, 'bow_' + gname, 60, gp=gp, extra=lambda t: {'yaw': 0.04 * math.sin(math.tau * 2 * t), 'bob': 0.004 * s2 * math.sin(math.tau * 4 * t)})


def gab_paw(gname, rg, p_sit, lift=None):
    """« Donne la patte » du gabarit : l'antérieur gauche levé vers l'avant de l'épaule (lift : devant et dessous,
    en longueurs de bras et d'avant-bras)."""
    R = rg.legs['FL']
    l1, l2, l3 = R['l2d'][:3]
    J = leg_joints(p_sit, 'FL', rg)
    lift_k = lift or M.get('paw_lift', (0.62, 0.42))
    J3t = Vector((R['J'][3].x, J[0].y - lift_k[0] * (l1 + l2), J[0].z - lift_k[1] * (l1 + l2)))
    Js, _pts = rg.solve_fold('FL', J[0], J3t, 2.3, 0.7, 0.0, 1)
    p_up = dict(p_sit)
    for n_, k_ in R['drive']:
        p_up[n_] = rg.bone_matrix(n_, R['seg'][k_], R['J'][k_], Js[k_], Js[k_ + 1])
    gab_bake(rg, 'paw_' + gname, 120, cyclic=False, pose_fn=lambda t: (dg.blend_local(
        rg, p_sit, p_up, dg.smooth(t / 0.25) * (1 - dg.smooth((t - 0.8) / 0.2))), {}))


def front_sphinx(p, rg, lab, rE):
    """Antérieur du couché en sphinx (gabarit aux membres allongés) : coude posé contre le poitrail, à rE au-dessus du sol
    du membre, en arrière de l'épaule de ce que l'humérus ne peut descendre ; avant-bras à plat vers l'avant, main posée.
    (Replié par ground_leg depuis l'épaule descendue au sol du tronc, l'antérieur allongé passait le coude 4 cm sous le
    sol : le jeu relevait tout le chien sur ses coudes, tronc à 4 cm du sol, croupe haute.)"""
    L = rg.legs[lab]
    l1, l2, l3 = L['l2d'][:3]
    dx = L['dxs']
    J0 = leg_joints(p, lab, rg)[0]
    g = L['ground']
    zE = max(g + rE, J0.z - l1 * 0.995)
    E = Vector((J0.x + dx[0], J0.y + math.sqrt(max(0.0, l1 * l1 - (J0.z - zE) ** 2)), zE))
    zW = g + rE * 0.8
    W = Vector((E.x + dx[1], E.y - math.sqrt(max(0.0, l2 * l2 - (zE - zW) ** 2)), zW))
    z3 = L['J'][3].z
    F = Vector((W.x + dx[2], W.y - math.sqrt(max(0.0, l3 * l3 - (zW - z3) ** 2)), z3))
    Js = [J0, E, W, F, F + L['paw0']]
    out = dict(p)
    for n, k_ in L['drive']:
        out[n] = rg.bone_matrix(n, L['seg'][k_], L['J'][k_], Js[k_], Js[k_ + 1])
    return out


def gab_lie(name, gname, rg, k, gH, gF):
    """Couché ou endormi du gabarit : corps descendu (ou relevé) jusqu'à son sol, membres repliés ; antérieurs en sphinx
    (front_sphinx) pour les membres allongés."""
    frames = action_frames(name)

    def g(y):
        return gH + (gF - gH) * min(1.0, max(0.0, (y - hp.y) / (sh.y - hp.y)))
    dz = max(g(p.y) - p.z for p in pose_points(frames[0], trunk_items)) + 0.001
    print('GABARIT', gname, name, 'descente', round(dz, 4))
    Mx = Matrix.Translation(Vector((0, 0, dz)))

    # (rayon de l'avant-bras au coude : celui du modèle, à la taille du chien)
    rE = 0.035 * hipz / 0.42

    def one(p_):
        p = hind_folded(transformed(p_, Mx), rg, k, 0.06)
        for lab in ('FL', 'FR'):
            p = front_sphinx(p, rg, lab, rE) if k > 1 else ground_leg(p, lab, a3=0.15, dz=0.008, rg=rg)
        return p
    poses = [one(p_) for p_ in frames]
    n = len(poses) - 1
    gab_bake(rg, f'{name}_{gname}', n, pose_fn=lambda t: (poses[min(n, round(t * n))], {}))
    return poses[0]


for gname, gcfg in GABARITS.items():
    k = gcfg['legs']
    r2 = gabarit_rig(k, gcfg.get('legW', 1.0), gcfg.get('paws', 1.0))
    gH = sum(r2.legs[l]['ground'] for l in ('HL', 'HR')) / 2
    gF = sum(r2.legs[l]['ground'] for l in ('FL', 'FR')) / 2
    s2 = (hipz - gH) / 0.42
    clips = gcfg.get('clips', ['walk', 'trot', 'run'])
    rep = {'legs': k, 'legW': gcfg.get('legW', 1.0), 'paws': gcfg.get('paws', 1.0), 'groundH': round(gH, 4), 'groundF': round(gF, 4), 'clips': clips}
    # (variante d'un gabarit — of — : seulement quelques clips, fondus par le jeu avec ceux du gabarit selon la longueur
    # du dos de la race, back)
    for key in ('of', 'back'):
        if key in gcfg:
            rep[key] = gcfg[key]
    G2 = dg.gaits(s2, K.FPS)
    sp = {}
    for name in ('walk', 'trot', 'run'):
        if name in clips:
            gp = dict(G2[name])
            gab_bake(r2, f'{name}_{gname}', gp['frames'], gp=gp)
            sp[name] = round(gp['speed'], 3)
    rep['naturalSpeeds'] = sp
    stand2 = dg.pose_at(r2, 0.0, dict(still))[0]
    sit2 = lie2 = None
    if 'sit' in clips:
        sit2 = gab_sit_gen(gname, r2, gH, gF, gcfg) if gcfg.get('sit_gen') else gab_sit(gname, r2, k, gH, gF, gcfg.get('sit_flex'))
        gab_bake(r2, 'sit_down_' + gname, 24, cyclic=False, pose_fn=lambda t: (dg.blend_local(r2, stand2, sit2, dg.smooth(t)), {}))
        gab_bake(r2, 'stand_up_' + gname, 20, cyclic=False, pose_fn=lambda t: (dg.blend_local(r2, sit2, stand2, dg.smooth(t)), {}))
    if 'paw' in clips and sit2 is not None:
        gab_paw(gname, r2, sit2, gcfg.get('paw_lift'))
    if 'bow' in clips:
        gab_bow(gname, r2, gH, gF)
    if 'lie' in clips:
        lie2 = gab_lie('lie', gname, r2, k, gH, gF)
        if sit2 is not None:
            gab_bake(r2, 'lie_down_' + gname, 30, cyclic=False, pose_fn=lambda t: (dg.blend_local(r2, sit2, lie2, dg.smooth(t)), {}))
        gab_bake(r2, 'get_up_' + gname, 30, cyclic=False, pose_fn=lambda t: (dg.blend_local(r2, lie2, stand2, dg.smooth(t)), {}))
    elif sit2 is not None:
        # (couché du modèle d'origine : seulement la transition depuis l'assis du gabarit)
        gab_bake(r2, 'lie_down_' + gname, 30, cyclic=False, pose_fn=lambda t: (dg.blend_local(r2, sit2, lie_p, dg.smooth(t)), {}))
    if 'sleep' in clips:
        gab_lie('sleep', gname, r2, k, gH, gF)
    if 'sniff' in clips:
        pm = gcfg.get('sniff_pitch', SNIFF_PITCH)
        sn2 = head_search(front_planted(dict(still, pivot=hp.copy(), drop=0.01 * s2), {'FL': -0.02 * s2, 'FR': 0.0}, rg=r2), gF + 0.025 * s, 3.4, 1.7, pitch_max=pm, rg=r2)
        gab_bake(r2, 'sniff_' + gname, 90, gp=sn2, extra=lambda t: {'head': 0.05 * max(0.0, math.sin(math.tau * 6 * t)) ** 2,
                                                                    'neck_yaw': 0.25 * math.sin(math.tau * t), 'head_yaw': 0.1 * math.sin(math.tau * t + 0.4)})
        e2 = head_search(front_planted(dict(still, pivot=hp.copy(), drop=0.008 * s2), {'FL': -0.015 * s2, 'FR': -0.015 * s2}, rg=r2), gF + 0.10 * s, 2.0, 1.3, ha_min=0.7, pitch_max=pm, rg=r2)
        gab_bake(r2, 'eat_' + gname, 60, gp=e2, extra=lambda t: {'head': 0.04 * math.sin(math.tau * 3 * t), 'jaw': 0.12 + 0.12 * math.sin(math.tau * 3 * t),
                                                                  'neck_yaw': 0.05 * math.sin(math.tau * t)})
        d2 = head_search(front_planted(dict(still, pivot=hp.copy(), drop=0.008 * s2), {'FL': -0.015 * s2, 'FR': -0.015 * s2}, rg=r2), gF + 0.12 * s, 2.0, 1.3, ha_min=0.7, pitch_max=pm, rg=r2)
        gab_bake(r2, 'drink_' + gname, 60, gp=d2, extra=lambda t: {'head': 0.03 * math.sin(math.tau * 6 * t), 'jaw': 0.16 + 0.06 * math.sin(math.tau * 6 * t),
                                                                    'tongue': 0.35 * math.sin(math.tau * 6 * t)})
    report['gabarits'][gname] = rep
    print('GABARIT', gname, rep)

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
    if act.name.startswith('_') or act.name == 'pose_tail' or act.name in gab_actions:
        continue
    fix = ground_fix(act)
    if fix:
        report['groundFix'][act.name] = round(fix, 4)
        print('GROUND', act.name, 'relevé de', round(fix, 4))

if opt.get('--dump-retarget'):
    dump_retarget(opt['--dump-retarget'])


def decimate(act, step):
    """Une clé sur step (et la dernière) : poses tenues longtemps, où seuls la respiration et le regard bougent. (Les
    poses au sol des gabarits doublaient le poids des fichiers.)"""
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    for fc in act.fcurves:
        pts = fc.keyframe_points
        for i in range(len(pts) - 1, -1, -1):
            fr = int(round(pts[i].co[0]))
            if fr != f1 and (fr - f0) % step:
                pts.remove(pts[i])
        for kp in pts:
            kp.interpolation = 'LINEAR'


DECIMATE = {'idle': 3, 'sit': 3, 'lie': 3, 'sleep': 3, 'paw': 2, 'rollover': 2}
# (transitions des gabarits — fondus de deux poses — : une clé sur 2 ; la variante « nain » du court en ajoutait cinq)
GAB_DECIMATE = {'sit_down': 2, 'stand_up': 2, 'lie_down': 2, 'get_up': 2}
for act in bpy.data.actions:
    nm_ = act.name.rsplit('_', 1)
    gab_ = len(nm_) == 2 and nm_[1] in GABARITS
    st_ = DECIMATE.get(nm_[0] if gab_ else act.name) or (GAB_DECIMATE.get(nm_[0]) if gab_ else None)
    if st_ and not act.name.startswith('_'):
        decimate(act, st_)
report['clips'] = K.check_clips(arm, meshes, paws, muzzle, skip=('pose_tail', *gab_actions))
report['speedsNote'] = 'vitesses naturelles (m/s) : action.timeScale = vitesse / vitesse naturelle'
bpy.ops.wm.save_as_mainfile(filepath=out.replace('.glb', '.blend'), compress=True)
K.export_glb(out, arm)
json.dump(report, open(report_path, 'w'), indent=1)
