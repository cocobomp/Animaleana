# Prépare la chèvre du jeu (tools/chevre/LISEZMOI.md) : nettoyage, orientation, échelle (garrot 0,75 m), poids de
# l'aisselle et de la cuisse, os des cornes, de la barbe et de la mamelle, cornes arquées de la chèvre brune (cible de
# forme), allures et gestes générés, sabots jamais sous le sol, couchée posée sur le sol, vérifications sur le maillage
# déformé, export GLB brut.
# Usage : blender -b --factory-startup --disable-autoexec --python make_goat.py -- <sortie.glb> <rapport.json>
# Moteur des membres : celui du mouton (tools/mouton/sheep_gait.py, via goat_gait.py) ; outils : tools/mouton/sheepkit.py.
# Repère Blender : avant = -Y, haut = +Z, sol z = 0, gauche = +X ; le GLB exporté regarde vers +Z.
import bpy, sys, os, math, json, re
from mathutils import Vector, Matrix
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(1, os.path.join(HERE, '..', 'mouton'))
import goat_gait as dg  # (importe tools/mouton/sheep_gait.py)
import sheepkit as K
import goat_models as GM

K.WITHERS = 0.75
argv = sys.argv[sys.argv.index('--') + 1:]
out, report_path = argv[0], argv[1]
opt = {argv[i]: argv[i + 1] for i in range(2, len(argv) - 1) if argv[i].startswith('--')}
M = GM.MODELS['rocketbox']
arm, meshes = M['prep']()
B = arm.data.bones
report = {'id': 'rocketbox_goat', 'clips': {}, 'notes': []}
PARTS = M['parts']
SKIP = re.compile(r'^(ear|eye|horn|beard|udder)')
TAU = math.tau

# ---- échelle : garrot (haut du dos juste derrière les omoplates) ; sabots au sol ; centré ----------------------
pts = K.world_verts(meshes)
wy = (arm.matrix_world @ B[M['withers_bone']].head_local).y + M.get('withers_dy', 0.03)
band = 0.04 * (max(p.y for p in pts) - min(p.y for p in pts))
wh, _ = K.measure_withers(meshes, wy, band, xmax=M.get('withers_xmax'))
f = M['withers'] / wh
print('WITHERS source', round(wh, 4), 'facteur', round(f, 4))
K.transform_all(arm, meshes, Matrix.Scale(f, 4), loc_scale=f)
pts = K.world_verts(meshes)
cx = sum((arm.matrix_world @ B[L['joints'][0]].head_local).x for L in M['legs'].values()) / 4
off = Vector((-cx, -(min(p.y for p in pts) + max(p.y for p in pts)) / 2, -min(p.z for p in pts)))
K.transform_all(arm, meshes, Matrix.Translation(off))
report['scaleFactor'] = round(f, 4)
if M.get('fix_weights'):
    report['fixWeights'] = GM.fix_weights(arm, meshes[0], M['fix_weights'])
if M.get('goat_weights'):
    report['goatWeights'] = GM.goat_weights(arm, meshes[0], M['goat_weights'])
report['withers'] = M['withers']
report['tris'] = K.tris(meshes)
report['bones'] = len(B)
for act in list(bpy.data.actions):
    bpy.data.actions.remove(act)
K.clear_anim(arm)

# ---- squelette pour les allures --------------------------------------------------------------------------------
legs, paws = {}, {}
for lab, L in M['legs'].items():
    drive = [(j, i) for i, j in enumerate(L['joints'])]
    P4 = [B[j].head_local.copy() for j in L['joints']]
    tip, heel_y, pv = K.sole_points(arm, meshes, L['joints'][3], P4[3])
    paws[lab] = pv
    legs[lab] = dict(points=P4 + [tip], drive=drive, heel_y=heel_y, kind='front' if lab[0] == 'F' else 'hind',
                     gain=L.get('gain', 0.55 if lab[0] == 'F' else 0.6), neutral_dy=L.get('neutral_dy', 0.0), scap=L.get('scap'))
hipz = sum(legs[k]['points'][0].z for k in ('HL', 'HR')) / 2
s = hipz / 0.56
for lab in legs:
    legs[lab]['scap_gain'] = 0.6 / max(0.3, s) if legs[lab]['scap'] else 0.0
tail = M.get('tail', [])
tail_end = {}
for i, tname in enumerate(tail):
    tail_end[tname] = B[tail[i + 1]].head_local.copy() if i + 1 < len(tail) else B[tname].tail_local.copy()
sh = Vector((0, sum(legs[k]['points'][0].y for k in ('FL', 'FR')) / 2, sum(legs[k]['points'][0].z for k in ('FL', 'FR')) / 2))
hp = Vector((0, sum(legs[k]['points'][0].y for k in ('HL', 'HR')) / 2, hipz))
cfg = dict(legs=legs, neck=M['neck'], head=M['head'], tail=tail, tail_end=tail_end, ears=M.get('ears', []),
           jaw=[j for j in M.get('jaw', []) if j in B], flex=M.get('flex', []), pitch_pivot=(sh + hp) / 2, zmin_tail=0.03)
rig = dg.Rig(arm, cfg)
report['hipHeight'] = round(hipz, 4)
report['shoulderJoint'] = [round(sh.y, 4), round(sh.z, 4)]
print('HIP', round(hipz, 4), 'SHOULDER', sh, 's', round(s, 3))

# Sommets : museau, tronc (ventre, poitrail), tout le maillage hors pièces, oreilles et yeux (sol)
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
    cand = [(i, mw @ v.co) for i, v in enumerate(m.data.vertices) if dom[m][i] in headset and not SKIP.search(dom[m][i] or '')]
    if cand:
        ymin = min(p.y for _, p in cand)
        muzzle += [(m, i) for i, p in cand if p.y < ymin + 0.025 * s]
    for i, v in enumerate(m.data.vertices):
        d = dom[m][i]
        if d and not SKIP.search(d):
            solid.append((m, i))
            if d not in legset and d not in headset and d not in tail:
                p = mw @ v.co
                if hp.y + 0.03 > p.y > sh.y - 0.03:
                    torso.append((m, i, p))
belly = min(p.z for _, _, p in torso)
report['bellyRest'] = round(belly, 4)
print('BELLY rest z', round(belly, 4), 'torso verts', len(torso), 'muzzle', len(muzzle))
torso_items = [(m, i) for m, i, _ in torso][::2]

still = dict(stride=0.0, duty=1.0, lift=0.0, phase={'HL': 0, 'FL': 0, 'HR': 0, 'FR': 0})


def breathe(t, k=1.0, n=3):
    return {'bob': 0.0025 * s * math.sin(TAU * n * t) * k}


def bump(t, c, w):
    """Petit geste (0 → 1 → 0) centré en c, de demi-largeur w (temps de clip en fraction)."""
    d = abs(((t - c + 0.5) % 1.0) - 0.5)
    return dg.smooth(1 - d / w) if d < w else 0.0


def lifted(pose, dz, dy=0.0):
    out_ = {'__body__': pose['__body__']}
    for k_, Mx in pose.items():
        if k_ != '__body__':
            M2 = Mx.copy()
            M2.translation = Mx.translation + Vector((0, dy, dz))
            out_[k_] = M2
    return out_


def a3_rest(lab):
    J = rig.legs[lab]['J']
    return math.atan2(J[2].z - J[3].z, J[2].y - J[3].y)


def seq(keys):
    def fn(t):
        for k in range(len(keys) - 1):
            t0, p0 = keys[k]
            t1, p1 = keys[k + 1]
            if t <= t1 + 1e-9:
                return dg.blend_local(rig, p0, p1, dg.smooth((t - t0) / (t1 - t0))), {}
        return keys[-1][1], {}
    return fn


def P(gp):
    return dg.pose_at(rig, 0.0, gp)[0]


# ---- allures ----------------------------------------------------------------------------------------------------
G = dg.goat_gaits(s, K.FPS)
speeds = {}
for name in ('walk', 'trot', 'run'):
    gp = dict(G[name])
    dg.bake(rig, name, gp, gp['frames'], lambda t, name=name: {'ear_back': 0.15 if name == 'run' else 0.0})
    speeds[name] = round(gp['speed'], 3)
report['naturalSpeeds'] = speeds

# ---- repos : respiration, regard, oreilles qui bougent, coups de queue --------------------------------------------
dg.bake(rig, 'idle', dict(still, neck=0.02, neck_freq=1, head=0.02), 150, lambda t: dict(
    breathe(t, 1.0, 4), head_yaw=0.22 * math.sin(TAU * t) + 0.08 * math.sin(TAU * 3 * t), neck_yaw=0.06 * math.sin(TAU * t),
    ear=0.35 * bump(t, 0.2, 0.06) - 0.3 * bump(t, 0.62, 0.06), ear_back=0.1 * math.sin(TAU * 2 * t),
    tail_yaw=0.6 * bump(t, 0.4, 0.05) - 0.6 * bump(t, 0.47, 0.05) + 0.5 * bump(t, 0.85, 0.05)))


# ---- brouter au sol : antérieurs tendus, museau dans l'herbe, petits coups de tête pour arracher ----------------------
def front_planted(base, dy=None, splay=0.04):
    gp = dict(base)
    gp['legs'] = dict(base.get('legs', {}))
    for lab in ('FL', 'FR'):
        R = rig.legs[lab]
        d_ = (dy or {}).get(lab, 0.0)
        under = R['J'][3].y - R['J'][0].y
        gp['legs'][lab] = {'under': under + d_, 'a3': a3_rest(lab), 'phi': 0.0, 'bend': 1, 'splay': splay}
    return gp


mz_pts = [(dom[m][i], m.matrix_world @ m.data.vertices[i].co) for m, i in muzzle]


def muzzle_eval(gp):
    pose, _ = dg.pose_at(rig, 0.0, gp)
    Pp = [(pose[b] @ rig.rest[b].inverted() @ p) for b, p in mz_pts]
    zmin = min(p.z for p in Pp)
    c = sum(Pp, Vector()) / len(Pp)
    hj = pose[cfg['head'][0]].translation
    nj = pose[cfg['neck'][0]].translation

    def below(a, b):
        d = b - a
        return math.atan2(-d.z, max(1e-6, math.hypot(d.x, d.y)) * (1 if d.y < 0 else -1))
    return zmin, below(hj, c), below(nj, hj), c.y


def head_search(base, zt, nb_max, ha_max, ha_min=0.9, pitch=True, w_pt=2.0, nb_min=0.0, hb_min=-1.0, pitch_max=0.2, y_max=None):
    best = None
    for k in range(0, int(pitch_max / 0.03 + 1e-6) + 1 if pitch else 1):
        pt = 0.03 * k
        for i in range(int(nb_min / 0.1), int(nb_max / 0.1) + 1):
            nb = i * 0.1
            for j in range(0, int((0.6 - hb_min) / 0.1) + 1):
                hb = hb_min + j * 0.1
                gp = dict(base, neck_base=base.get('neck_base', 0.0) + nb, head_base=base.get('head_base', 0.0) + hb,
                          pitch_base=base.get('pitch_base', 0.0) + pt)
                z, ha, na, my = muzzle_eval(gp)
                cost = abs(z - zt) * 8 + w_pt * pt + 0.02 * nb + 0.05 * abs(hb)
                cost += 4.0 * max(0.0, ha - ha_max) + 4.0 * max(0.0, ha_min - ha)
                if y_max is not None:
                    cost += 12.0 * max(0.0, my - y_max)
                if best is None or cost < best[0]:
                    best = (cost, gp, z, ha, na)
    print('HEAD SEARCH', round(zt, 4), 'z', round(best[2], 4), 'tête', round(best[3], 3), 'encolure', round(best[4], 3))
    return best[1]


front_tip_y = min(rig.legs[l]['neutral'].y for l in ('FL', 'FR'))
graze = head_search(front_planted(dict(still, pivot=hp.copy(), drop=0.01 * s), {'FL': -0.05 * s, 'FR': 0.02 * s}),
                    0.012 * s, 3.4, 1.9, ha_min=1.0, pitch_max=0.24, w_pt=1.0, y_max=front_tip_y - 0.10 * s)
report['grazeMuzzle'] = round(muzzle_eval(graze)[0], 4)
dg.bake(rig, 'graze', graze, 120, lambda t: {
    'head': 0.08 * max(0.0, math.sin(TAU * 4 * t)) ** 4 - 0.02,
    'jaw': 0.07 + 0.07 * math.sin(TAU * 8 * t), 'jaw_yaw': 0.04 * math.sin(TAU * 8 * t + 1.0),
    'neck_yaw': 0.2 * math.sin(TAU * t), 'head_yaw': 0.08 * math.sin(TAU * t + 0.6),
    'ear': 0.3 * bump(t, 0.3, 0.06), 'tail_yaw': 0.5 * bump(t, 0.7, 0.05)})

# ---- manger au râtelier ou à l'auge : museau à ≈ 0,40 m, mâche ----------------------------------------------------
eat = head_search(front_planted(dict(still, pivot=hp.copy(), drop=0.005 * s)), 0.40 * s, 2.4, 1.4, ha_min=0.5, pitch_max=0.12,
                  y_max=front_tip_y - 0.12 * s)
report['eatMuzzle'] = round(muzzle_eval(eat)[0], 4)
dg.bake(rig, 'eat', eat, 90, lambda t: {'head': 0.05 * math.sin(TAU * 3 * t), 'jaw': 0.07 + 0.07 * math.sin(TAU * 6 * t),
                                        'jaw_yaw': 0.04 * math.sin(TAU * 6 * t + 1.0), 'neck_yaw': 0.06 * math.sin(TAU * t)})


# ---- bêler : tête tendue, bouche ouverte qui tremble, puis retour ---------------------------------------------------
def bleat_x(t):
    up = dg.smooth(t / 0.2) * (1 - dg.smooth((t - 0.78) / 0.22))
    mouth = dg.smooth((t - 0.18) / 0.1) * (1 - dg.smooth((t - 0.66) / 0.1))
    return {'neck': -0.30 * up, 'head': -0.40 * up, 'jaw': mouth * (0.32 + 0.05 * math.sin(TAU * 9 * t)), 'ear_back': 0.3 * up,
            'tail_yaw': 0.5 * bump(t, 0.3, 0.06), 'bob': 0.004 * s * mouth * math.sin(TAU * 9 * t)}


dg.bake(rig, 'bleat', dict(still), 48, bleat_x, cyclic=False)

# ---- traite : debout, postérieurs écartés et un peu en arrière, tête tournée vers la trayeuse, mâche --------------
milk = dict(still, legs={lab: {'J3': (rig.legs[lab]['J'][3].y + 0.04 * s, rig.legs[lab]['J'][3].z), 'a3': a3_rest(lab), 'phi': 0.0,
                               'splay': 0.07} for lab in ('HL', 'HR')}, neck_base=-0.05)
dg.bake(rig, 'milk', milk, 120, lambda t: dict(breathe(t, 0.8, 4), neck_yaw=0.55 + 0.05 * math.sin(TAU * t), head_yaw=0.35,
                                                jaw=0.04 + 0.04 * math.sin(TAU * 8 * t), jaw_yaw=0.04 * math.sin(TAU * 8 * t + 1.2),
                                                ear=0.2 * bump(t, 0.5, 0.06), tail_yaw=0.4 * bump(t, 0.25, 0.05)))


# ---- couchée sur le sternum : antérieurs repliés sous le poitrail, postérieurs repliés sous le ventre --------------
def lie_gp(drop):
    gp = dict(still, drop=drop, pivot=hp.copy(), pitch_base=M.get('lie_pitch', 0.02), neck_base=M.get('lie_neck', -0.10), head_base=0.05,
              roll_base=M.get('lie_roll', 0.04))
    legsd = {}
    for lab in ('FL', 'FR'):
        R = rig.legs[lab]
        l1, l2, l3 = R['l2d'][:3]
        J0 = R['J'][0] - Vector((0, 0, drop))
        zE = M.get('lie_elbow', 0.075) * s
        ey = J0.y + math.sqrt(max(0.0, l1 * l1 - (J0.z - zE) ** 2)) if J0.z - zE < l1 else J0.y
        zk = M.get('lie_knee', 0.045) * s
        yk = ey - 0.96 * l2
        J3 = Vector((R['J'][3].x, yk + 0.97 * l3, zk - 0.008 * s))
        a3 = math.atan2(zk - J3.z, yk - J3.y)
        legsd[lab] = {'J3': (J3.y, J3.z), 'a3': a3, 'phi': M.get('lie_toe_phi', 2.0), 'bend': 1, 'splay': 0.06}
    for lab in ('HL', 'HR'):
        R = rig.legs[lab]
        l1, l2, l3 = R['l2d'][:3]
        J0 = R['J'][0] - Vector((0, 0, drop))
        a3 = 0.10
        z3 = M.get('lie_fetlock', 0.065) * s
        zh = z3 + l3 * math.sin(a3)
        fem = M.get('lie_femur', 0.55)
        sy = J0.y - l1 * math.cos(fem)
        sz = max(zh + 0.02, J0.z - l1 * math.sin(fem))
        hy = sy + math.sqrt(max(0.0, l2 * l2 - (sz - zh) ** 2)) * 0.97
        legsd[lab] = {'J3': (hy - l3 * math.cos(a3), z3), 'a3': a3, 'phi': M.get('lie_htoe_phi', -1.15), 'splay': M.get('lie_splay', 0.30), 'bend': 'fwd'}
    gp['legs'] = legsd
    return gp


# descente : le ventre (tronc) posé au sol, à 4 mm (la chèvre couchée flottait au-dessus de l'herbe sur la page de
# comparaison : son corps n'était posé que par le poitrail et la mamelle la relevait)
lo, hi = 0.0, belly + 0.08
for _ in range(12):
    mid_ = (lo + hi) / 2
    z = K.pose_probe(rig, lie_gp(mid_), torso_items)
    if z > 0.004:
        lo = mid_
    else:
        hi = mid_
lie_drop = lo
lie = lie_gp(lie_drop)
report['lieDrop'] = round(lie_drop, 4)
report['lieBodyMin'] = round(K.pose_probe(rig, lie, torso_items), 4)
print('LIE drop', round(lie_drop, 4), 'tronc au plus bas', report['lieBodyMin'])
dg.bake(rig, 'lie', lie, 150, lambda t: dict(
    breathe(t, 0.8, 3), head_yaw=0.2 * math.sin(TAU * t + 0.5), ear=0.3 * bump(t, 0.35, 0.06), ear_back=0.05))
# ruminer : couchée, la mâchoire va de côté (≈ 1,3 coup par seconde), gorgée avalée de temps en temps
dg.bake(rig, 'ruminate', lie, 150, lambda t: dict(
    breathe(t, 0.8, 3), jaw=0.03 + 0.03 * math.sin(TAU * 6.5 * t), jaw_yaw=0.07 * math.sin(TAU * 6.5 * t),
    head_yaw=0.06 * math.sin(TAU * t), neck=-0.04 * bump(t, 0.55, 0.06), head=0.03 * math.sin(TAU * 6.5 * t)))
# dormir : couchée, tête posée au sol sur le côté, respiration lente
sleep = head_search(dict(lie), 0.04 * s, 3.0, 1.2, ha_min=-0.4, pitch=False, hb_min=-1.6)
dg.bake(rig, 'sleep', sleep, 150, lambda t: dict(breathe(t, 1.3, 2), neck_yaw=0.45, head_yaw=0.25, head_roll=0.35, ear_back=0.25))


# ---- se coucher / se relever comme un ruminant : à genoux devant d'abord, arrière-train d'abord pour se relever ----
def kneel_gp():
    R = rig.legs['FL']
    l1, l2, l3 = R['l2d'][:3]
    zk = 0.04 * s
    target = zk + 0.92 * l2 + 0.55 * l1
    th_lo, th_hi = 0.0, 1.0
    for _ in range(40):
        th = (th_lo + th_hi) / 2
        z = (dg.rot_x_about(th, hp) @ sh).z
        if z > target:
            th_lo = th
        else:
            th_hi = th
    th = (th_lo + th_hi) / 2
    gp = dict(still, pivot=hp.copy(), pitch_base=th, neck_base=-th * 0.8, head_base=-0.05)
    legsd = {}
    for lab in ('FL', 'FR'):
        R = rig.legs[lab]
        J0 = dg.rot_x_about(th, hp) @ R['J'][0]
        yk = J0.y + 0.10 * l2
        J3 = Vector((R['J'][3].x, yk + 0.97 * l3, zk - 0.005 * s))
        legsd[lab] = {'J3': (J3.y, J3.z), 'a3': math.atan2(zk - J3.z, yk - J3.y), 'phi': 1.6, 'bend': 1, 'splay': 0.03}
    gp['legs'] = legsd
    print('KNEEL bascule', round(th, 3))
    return gp


stand_p = P(dict(still))
lie_p = P(lie)
kneel = kneel_gp()
kneel_p = P(kneel)
half = dict(still, pivot=hp.copy(), pitch_base=kneel['pitch_base'] * 0.35, drop=lie_drop * 0.55, neck_base=kneel['neck_base'] * 0.5, head_base=-0.03)
half['legs'] = {lab: dict(kneel['legs'][lab]) for lab in ('FL', 'FR')}
half_p = P(half)


def hoof_back(lab, ang=-0.08):
    """Rotation du sabot (phi) qui le couche vers l'arrière, presque à plat (boulet fléchi)."""
    p0 = rig.legs[lab]['paw0']
    return ang - math.atan2(p0.z, p0.y)


def leg_lift(lab):
    R = rig.legs[lab]
    return {'J3': (R['J'][3].y - 0.02 * s, R['J'][3].z + 0.15 * s), 'a3': 2.4, 'phi': hoof_back(lab, -0.6), 'bend': 1}


def leg_planted(lab, dy=0.0):
    R = rig.legs[lab]
    return {'J3': (R['J'][3].y + dy, R['J'][3].z), 'a3': a3_rest(lab), 'phi': 0.0, 'bend': 1}


# (les antérieurs se plient l'un après l'autre : genou gauche au sol, puis le droit — pliés ensemble depuis debout, les
# sabots passaient 7 cm sous le sol au milieu du mélange)
one_knee = dict(still, pivot=hp.copy(), pitch_base=kneel['pitch_base'] * 0.55, neck_base=kneel['neck_base'] * 0.5)
one_knee['legs'] = {'FL': dict(kneel['legs']['FL']), 'FR': leg_lift('FR')}
lift_one = dict(still, pivot=hp.copy(), pitch_base=0.03, neck_base=-0.05)
lift_one['legs'] = {'FL': leg_lift('FL'), 'FR': leg_planted('FR')}
step_one = dict(still, pivot=hp.copy(), pitch_base=kneel['pitch_base'] * 0.45, neck_base=kneel['neck_base'] * 0.4)
step_one['legs'] = {'FL': dict(kneel['legs']['FL']), 'FR': leg_planted('FR', -0.04 * s)}
lift_one_p, one_knee_p, step_one_p = P(lift_one), P(one_knee), P(step_one)
dg.bake(rig, 'lie_down', None, 72, cyclic=False, pose_fn=seq([(0.0, stand_p), (0.16, lift_one_p), (0.30, one_knee_p), (0.42, kneel_p),
                                                               (0.50, kneel_p), (0.75, half_p), (1.0, lie_p)]))
# (se relever : l'arrière-train d'abord, l'avant reste à genoux ; puis un antérieur se pose devant, et l'autre)
rise_one = dict(still, pivot=hp.copy(), pitch_base=0.04, neck_base=-0.05)
rise_one['legs'] = {'FL': leg_lift('FL'), 'FR': leg_planted('FR', -0.02 * s)}
rise_one_p = P(rise_one)
dg.bake(rig, 'get_up', None, 60, cyclic=False, pose_fn=seq([(0.0, lie_p), (0.22, half_p), (0.45, kneel_p), (0.58, one_knee_p),
                                                             (0.72, step_one_p), (0.86, rise_one_p), (1.0, stand_p)]))

# ---- brouter en hauteur : dressée sur les postérieurs, antérieurs posés sur la lisse du haut d'une barrière ----------
# (barrière de la bergerie du jeu : lisses à 0,45 et 0,90 m, 10 cm d'épaisseur — sabots posés sur le dessus, 0,95 m)
RAIL = M.get('rail', 0.95)


def browse_gp(pitch=-0.84):
    piv = hp.copy()
    th = pitch
    drop = 0.06 * s
    gp = dict(still, pivot=piv, pitch_base=th, drop=drop, neck_base=-0.25, head_base=-0.30)
    legsd = {}
    for lab in ('FL', 'FR'):
        R = rig.legs[lab]
        J0 = dg.rot_x_about(th, piv) @ R['J'][0] - Vector((0, 0, drop))
        y3 = J0.y - 0.30 * s
        legsd[lab] = {'J3': (y3, RAIL + R['J'][3].z), 'a3': 1.25, 'phi': 0.2, 'bend': 1, 'splay': 0.06}
    for lab in ('HL', 'HR'):
        R = rig.legs[lab]
        legsd[lab] = {'J3': (R['J'][3].y - 0.04 * s, R['J'][3].z), 'a3': a3_rest(lab), 'phi': 0.0}
    gp['legs'] = legsd
    return gp


browse = browse_gp()
browse_p = P(browse)
dg.bake(rig, 'browse_up', browse, 120, lambda t: {'head': 0.07 * max(0.0, math.sin(TAU * 3 * t)) ** 2, 'jaw': 0.08 + 0.07 * math.sin(TAU * 6 * t),
                                                   'neck_yaw': 0.15 * math.sin(TAU * t), 'tail_yaw': 0.5 * bump(t, 0.5, 0.05)})
rear_mid = dict(still, pivot=hp.copy(), pitch_base=-0.35, drop=0.03 * s, neck_base=-0.15, head_base=-0.1)
rear_mid['legs'] = {lab: {'J3': (rig.legs[lab]['J'][3].y - 0.05 * s, rig.legs[lab]['J'][3].z + 0.22 * s), 'a3': 2.0, 'phi': 0.3, 'bend': 1}
                    for lab in ('FL', 'FR')}
rear_mid_p = P(rear_mid)
dg.bake(rig, 'rear_up', None, 24, cyclic=False, pose_fn=seq([(0.0, stand_p), (0.45, rear_mid_p), (1.0, browse_p)]))
dg.bake(rig, 'rear_down', None, 24, cyclic=False, pose_fn=seq([(0.0, browse_p), (0.55, rear_mid_p), (1.0, stand_p)]))


# ---- coup de tête : se dresse un peu, puis plonge, cornes en avant -----------------------------------------------
def fold_legs(base, front, hind):
    gp = dict(base)
    legsd = dict(base.get('legs', {}))
    for lab in rig.legs:
        R = rig.legs[lab]
        spec = front if lab[0] == 'F' else hind
        if spec is None:
            continue
        fy, fz, a3 = spec
        L3 = R['lens'][0] + R['lens'][1]
        legsd[lab] = {'J3': (R['J'][3].y - fy * L3, R['J'][3].z + fz * L3), 'a3': a3, 'phi': 0.0}
    gp['legs'] = legsd
    return gp


hb_keys = [
    (0.0, stand_p),
    (0.18, P(dict(still, drop=0.03 * s, pitch_base=0.04, neck_base=0.25, head_base=0.35, shift=0.03 * s))),
    (0.38, P(fold_legs(dict(still, pivot=hp.copy(), pitch_base=-0.42, drop=0.05 * s, neck_base=0.1, head_base=0.4), (0.15, 0.38, 2.0), None))),
    (0.55, P(dict(still, pivot=hp.copy(), pitch_base=0.10, shift=-0.06 * s, drop=0.02 * s, neck_base=0.55, head_base=0.75))),
    (0.70, P(dict(still, pivot=hp.copy(), pitch_base=0.06, shift=-0.05 * s, neck_base=0.45, head_base=0.6))),
    (1.0, stand_p),
]
dg.bake(rig, 'headbutt', None, 45, cyclic=False, pose_fn=seq(hb_keys))


# ---- saut sur place : élan, pattes repliées, réception (la trajectoire est donnée par le jeu) ----------------------
def legs_air(base, fy, fz, hy, hz, a3f=None, a3h=None):
    gp = dict(base)
    legsd = {}
    for lab in rig.legs:
        R = rig.legs[lab]
        L3 = R['lens'][0] + R['lens'][1]
        if lab[0] == 'F':
            dy, dz, a3 = fy, fz, a3_rest(lab) if a3f is None else a3f
        else:
            dy, dz, a3 = hy, hz, a3_rest(lab) if a3h is None else a3h
        legsd[lab] = {'J3': (R['J'][3].y - dy * L3, R['J'][3].z + dz * L3), 'a3': a3, 'phi': 0.2}
    gp['legs'] = legsd
    return gp


j_crouch = P(dict(still, drop=0.07 * s, pitch_base=0.06, neck_base=0.05))
j_take = P(legs_air(dict(still, pitch_base=-0.25, neck_base=-0.25, head_base=0.05), -0.10, 0.08, 0.30, 0.02))
j_tuck = P(legs_air(dict(still, pitch_base=-0.05, neck_base=-0.1), 0.30, 0.45, -0.35, 0.40, a3f=2.4))
j_reach = P(legs_air(dict(still, pitch_base=0.18, neck_base=0.05), 0.20, 0.05, -0.05, 0.35))
j_land = P(dict(still, drop=0.06 * s, pitch_base=0.08, neck_base=0.1))
dg.bake(rig, 'jump', None, 36, cyclic=False,
        pose_fn=seq([(0.0, stand_p), (0.22, j_crouch), (0.34, j_take), (0.55, j_tuck), (0.74, j_reach), (0.86, j_land), (1.0, stand_p)]))

# ---- chevreau qui gambade : bonds raides sur les quatre pattes, vrille en l'air, ruade --------------------------
H_SKIP = 0.24 * s
k_crouch = P(dict(still, drop=0.05 * s, neck_base=0.05))
k_push = P(dict(still, drop=-0.01 * s, pitch_base=-0.06, neck_base=-0.15))
k_air1 = P(legs_air(dict(still, yaw_base=0.25, roll_base=0.12, neck_base=-0.2, head_base=-0.1), 0.05, 0.12, -0.05, 0.14))
k_air2 = P(legs_air(dict(still, yaw_base=-0.2, roll_base=-0.1, pitch_base=0.05, neck_base=0.05, head_base=0.15), 0.08, 0.06, -0.45, 0.30))
k_land = P(dict(still, drop=0.04 * s, pitch_base=0.04, neck_base=0.1))


def skip_pose(t):
    keys = [(0.0, k_crouch), (0.16, k_push), (0.42, k_air1), (0.66, k_air2), (0.84, k_land), (1.0, k_crouch)]
    p, _ = seq(keys)(t)
    h = 0.0
    if 0.16 < t < 0.84:
        u = (t - 0.16) / 0.68
        h = H_SKIP * 4 * u * (1 - u)
    return lifted(p, h), {}


dg.bake(rig, 'kid_play', None, 21, cyclic=True, pose_fn=skip_pose)

# ---- escalade : monte sur un bloc de 0,45 m (la racine monte et avance) ------------------------------------------
CLIMB_H = M.get('climb_h', 0.45) * s


def feet(base, spec):
    gp = dict(base)
    legsd = dict(base.get('legs', {}))
    for lab, (dy, dz, a3, phi) in spec.items():
        R = rig.legs[lab]
        legsd[lab] = {'J3': (R['J'][3].y + dy, R['J'][3].z + dz), 'a3': a3_rest(lab) if a3 is None else a3, 'phi': phi}
    gp['legs'] = legsd
    return gp


CLIMB_D = (rig.legs['HL']['J'][3].y - rig.legs['FL']['J'][3].y) + 0.17 * s
H_, D_ = CLIMB_H, CLIMB_D
EDGE = 0.12 * s
on = lambda dy: (dy, H_, None, 0.0)
climb_keys = [
    (0.0, stand_p),
    (0.14, P(feet(dict(still, drop=0.07 * s, pitch_base=0.05, neck_base=-0.15), {lab: (0.0, 0.0, None, 0.0) for lab in rig.legs}))),
    (0.30, P(feet(dict(still, pivot=hp.copy(), pitch_base=-0.32, drop=-0.10 * s, shift=-0.12 * s, neck_base=-0.25),
                  {'FL': (-0.10 * s, 0.30 * s, 2.2, 0.0), 'FR': (-0.06 * s, 0.26 * s, 2.2, 0.0),
                   'HL': (0.0, 0.0, None, 0.6), 'HR': (0.0, 0.0, None, 0.6)}))),
    (0.46, P(feet(dict(still, pitch_base=-0.16, drop=-0.55 * H_, shift=-0.40 * D_, neck_base=-0.1),
                  {'FL': on(-EDGE - 0.32 * s), 'FR': on(-EDGE - 0.28 * s),
                   'HL': (-0.40 * D_, 0.50 * H_, 1.5, 0.4), 'HR': (-0.40 * D_, 0.45 * H_, 1.5, 0.4)}))),
    (0.64, P(feet(dict(still, pitch_base=0.0, drop=-0.95 * H_, shift=-0.72 * D_),
                  {'FL': (-0.70 * D_, H_ + 0.10 * s, 1.9, 0.3), 'FR': on(-EDGE - 0.28 * s),
                   'HL': on(-0.78 * D_), 'HR': (-0.70 * D_, H_ + 0.08 * s, 1.5, 0.3)}))),
    (0.80, P(feet(dict(still, drop=-H_, shift=-0.92 * D_),
                  {'FL': on(-D_), 'FR': (-0.75 * D_, H_ + 0.08 * s, 1.9, 0.3), 'HL': on(-0.78 * D_), 'HR': on(-D_)}))),
    (1.0, P(feet(dict(still, drop=-H_, shift=-D_), {lab: on(-D_) for lab in rig.legs}))),
]
dg.bake(rig, 'climb', None, 54, cyclic=False, pose_fn=seq(climb_keys))
report['climb'] = [round(CLIMB_H, 3), round(CLIMB_D, 3)]


# ---- sol : rien sous le sol (pièces exceptées : le jeu les met à l'échelle) ; corps relevé image par image ----------
def ground_fix(act):
    K.clear_anim(arm)
    arm.animation_data.action = act
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    lows = []
    worst = (0.0, None, [])
    for fr in range(f0, f1 + 1):
        bpy.context.scene.frame_set(fr)
        zs = K.Probe(None).z_of(solid)
        z = min(zs)
        lows.append(z)
        if z < worst[0]:
            order = sorted(range(len(zs)), key=lambda i: zs[i])[:20]
            worst = (z, fr, order)
    if worst[1] is not None and worst[0] < -0.01:
        from collections import Counter
        print('SOL', act.name, 'image', worst[1], round(worst[0], 4), Counter(dom[solid[i][0]][solid[i][1]] for i in worst[2]).most_common(4))
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
    if act.name.startswith('_'):
        continue
    fix = ground_fix(act)
    if fix:
        report['groundFix'][act.name] = round(fix, 4)
        print('GROUND', act.name, 'relevé de', round(fix, 4))


def decimate(act, step):
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    for fc in act.fcurves:
        pts_ = fc.keyframe_points
        for i in range(len(pts_) - 1, -1, -1):
            fr = int(round(pts_[i].co[0]))
            if fr != f1 and (fr - f0) % step:
                pts_.remove(pts_[i])
        for kp in pts_:
            kp.interpolation = 'LINEAR'


for act in bpy.data.actions:
    st_ = {'idle': 2, 'lie': 2, 'ruminate': 2, 'sleep': 3, 'milk': 2, 'browse_up': 2}.get(act.name)
    if st_:
        decimate(act, st_)


# ---- repères pour le jeu : sabots antérieurs de la chèvre dressée (où poser la lisse), museau qui mange --------------
def hoof_tip(act_name, frame, lab):
    K.clear_anim(arm)
    arm.animation_data.action = bpy.data.actions[act_name]
    bpy.context.scene.frame_set(frame)
    ids = paws[lab]
    zs = K.Probe(None).z_of(ids)
    dgp = bpy.context.evaluated_depsgraph_get()
    ev = meshes[0].evaluated_get(dgp)
    me = ev.to_mesh()
    Pp = [ev.matrix_world @ me.vertices[i].co for _, i in ids]
    ev.to_mesh_clear()
    arm.animation_data.action = None
    low = min(p.z for p in Pp)
    # (avant = -Y dans Blender : la pince est le sommet le plus en avant parmi les plus bas)
    sole = [p for p in Pp if p.z < low + 0.02]
    return [round(-min(p.y for p in sole), 4), round(low, 4)], zs


bt, _ = hoof_tip('browse_up', 0, 'FL')
report['browse'] = {'rail': RAIL, 'hoof': bt, 'note': 'sabots antérieurs (avant en +z, hauteur) de la chèvre dressée, au repos du clip'}
print('BROWSE sabot antérieur', bt)
report['clips'] = K.check_clips(arm, meshes, paws, muzzle)
report['transResidual'] = round(dg.STATS['transResidual'], 6)
print('TRANSLATIONS retirées (hors racine), au plus', round(dg.STATS['transResidual'] * 1000, 3), 'mm')
report['speedsNote'] = 'vitesses naturelles (m/s) : action.timeScale = vitesse / vitesse naturelle'
bpy.ops.wm.save_as_mainfile(filepath=out.replace('.glb', '.blend'), compress=True)
K.export_glb(out, arm)
json.dump(report, open(report_path, 'w'), indent=1)
