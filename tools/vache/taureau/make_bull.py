# Prépare une vache candidate (Rocketbox) : nettoyage, orientation, échelle (garrot 1,40 m), poids de l'aisselle et de
# la cuisse, os des cornes et de la mamelle, cornes longues (cible de forme), allures et gestes générés, sabots jamais
# sous le sol, couchée posée sur le sol, vérifications sur le maillage déformé, export GLB brut.
# Repris de tools/chevre/make_goat.py (même moteur : tools/mouton/sheep_gait.py ; outils : tools/mouton/sheepkit.py).
# Usage : blender -b --factory-startup --disable-autoexec --python make_bull.py -- rb_taureau <sortie.glb> <rapport.json>
# Repère Blender : avant = -Y, haut = +Z, sol z = 0, gauche = +X ; le GLB exporté regarde vers +Z.
import bpy, sys, os, math, json, re
from mathutils import Vector, Matrix
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(1, os.path.join(HERE, '..', '..', 'mouton'))
sys.path.insert(2, os.path.join(HERE, '..', '..', 'chevre'))
import cow_gait as dg  # (importe tools/mouton/sheep_gait.py)
import sheepkit as K
import cow_models as CM

argv = sys.argv[sys.argv.index('--') + 1:]
mid, out, report_path = argv[0], argv[1], argv[2]
M = CM.MODELS[mid]
K.WITHERS = M['withers']
arm, meshes = M['prep']()
B = arm.data.bones
report = {'id': mid, 'source': M['source'], 'clips': {}, 'notes': []}
PART = M['part']
SKIP = re.compile(r'^(ear|eye|horn|udder|scrotum)')
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
report['withersSource'] = round(wh, 4)
if M.get('fix_weights'):
    report['fixWeights'] = CM.fix_weights(arm, meshes[0], M['fix_weights'])
if M.get('goat_weights'):
    # (bréchet et intérieur des cuisses autour de la mamelle — ou du scrotum du taureau, traité de même : ses voisins
    # suivaient le jarret, arêtes scrotum/jambe étirées 9 fois chez le taureau couché)
    gpart = meshes[0].vertex_groups.get(M['part'])
    if gpart is not None and M['part'] != 'udder':
        gpart.name = 'udder'
    report['udderWeights'] = CM.goat_weights(arm, meshes[0], M['goat_weights'])
    if gpart is not None and M['part'] != 'udder':
        gpart.name = M['part']
report['withers'] = M['withers']
report['tris'] = K.tris(meshes)
report['bones'] = len(B)
pts = K.world_verts(meshes)
report['length'] = round(max(p.y for p in pts) - min(p.y for p in pts), 4)
report['height'] = round(max(p.z for p in pts), 4)
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
# s : taille rapportée à la chèvre du jeu (hanche 0,56 m) — les réglages de poses repris de make_goat.py sont exprimés
# ainsi ; sg : taille rapportée à la vache de référence (allures de cow_gait.py)
s = hipz / 0.56
sg = hipz / dg.HIP_REF
for lab in legs:
    legs[lab]['scap_gain'] = 0.6 / max(0.3, s) if legs[lab]['scap'] else 0.0
tail = M.get('tail', [])
tail = [t for t in tail if t in B]
tail_end = {}
for i, tname in enumerate(tail):
    tail_end[tname] = B[tail[i + 1]].head_local.copy() if i + 1 < len(tail) else B[tname].tail_local.copy()
sh = Vector((0, sum(legs[k]['points'][0].y for k in ('FL', 'FR')) / 2, sum(legs[k]['points'][0].z for k in ('FL', 'FR')) / 2))
hp = Vector((0, sum(legs[k]['points'][0].y for k in ('HL', 'HR')) / 2, hipz))
cfg = dict(legs=legs, neck=[n for n in M['neck'] if n in B], head=M['head'], tail=tail, tail_end=tail_end, ears=M.get('ears', []),
           jaw=[j for j in M.get('jaw', []) if j in B], flex=M.get('flex', []), pitch_pivot=(sh + hp) / 2, zmin_tail=M.get('zmin_tail', 0.06),
           tail_weights=[1.0, 0.7, 0.5, 0.4, 0.3][:len(tail)])
rig = dg.Rig(arm, cfg)
report['hipHeight'] = round(hipz, 4)
report['shoulderJoint'] = [round(sh.y, 4), round(sh.z, 4)]
print('HIP', round(hipz, 4), 'SHOULDER', sh, 's', round(s, 3), 'sg', round(sg, 3))

# Sommets : museau, tronc (ventre, poitrail), tout le maillage hors pièces, oreilles et yeux (sol)
headset = set()
for h in cfg['head']:
    headset.update(K.descendants(arm, h))
legset = set()
for L in legs.values():
    for b, k in L['drive']:
        legset.update(K.descendants(arm, b) if k > 0 else [b])
dom = {m: K.dominant_groups(m) for m in meshes}
muzzle, torso, solid, udder_v = [], [], [], []
for m in meshes:
    mw = m.matrix_world
    cand = [(i, mw @ v.co) for i, v in enumerate(m.data.vertices) if dom[m][i] in headset and not SKIP.search(dom[m][i] or '')]
    if cand:
        ymin = min(p.y for _, p in cand)
        muzzle += [(m, i) for i, p in cand if p.y < ymin + 0.025 * s]
    for i, v in enumerate(m.data.vertices):
        d = dom[m][i]
        if d == PART:
            udder_v.append((m, i))
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
if udder_v:
    UP = [meshes[0].matrix_world @ meshes[0].data.vertices[i].co for _, i in udder_v]
    low = min(UP, key=lambda p: p.z)
    report['udder'] = {'teatLow': [round(-low.y, 4), round(low.z, 4)], 'center': [round(-sum(p.y for p in UP) / len(UP), 4), round(sum(p.z for p in UP) / len(UP), 4)],
                       'note': 'bas des trayons et centre de la mamelle au repos ([avant en +z, hauteur], m)'}

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


def P(gp, extra=None):
    return dg.pose_at(rig, 0.0, gp, extra)[0]


# queue de la vache couchée : rejetée en arrière puis le long de la cuisse, posée au sol (pendante, elle traversait le sol
# et le jeu relevait tout le corps)
TAIL_LIE = {'tail_lift': 0.75, 'tail_yaw': 1.0}
tail_lie = lambda t: TAIL_LIE


# ---- allures ----------------------------------------------------------------------------------------------------
G = dg.cow_gaits(sg, K.FPS)
speeds = {}
for name in ('walk', 'trot', 'run'):
    gp = dict(G[name])
    dg.bake(rig, name, gp, gp['frames'], lambda t, name=name: {'ear_back': 0.2 if name == 'run' else 0.0,
                                                               'ear': 0.12 * math.sin(TAU * t) if name == 'walk' else 0.0})
    speeds[name] = round(gp['speed'], 3)
report['naturalSpeeds'] = speeds

# ---- repos : respiration, regard, oreilles qui bougent, coups de queue --------------------------------------------
dg.bake(rig, 'idle', dict(still, neck=0.02, neck_freq=1, head=0.02), 180, lambda t: dict(
    breathe(t, 1.0, 5), head_yaw=0.20 * math.sin(TAU * t) + 0.06 * math.sin(TAU * 3 * t), neck_yaw=0.08 * math.sin(TAU * t),
    ear=0.35 * bump(t, 0.2, 0.05) - 0.3 * bump(t, 0.62, 0.05) + 0.25 * bump(t, 0.9, 0.04), ear_back=0.12 * math.sin(TAU * 2 * t),
    jaw=0.02 + 0.02 * math.sin(TAU * 18 * t), jaw_yaw=0.03 * math.sin(TAU * 18 * t),
    tail_yaw=0.5 * bump(t, 0.4, 0.05) - 0.5 * bump(t, 0.47, 0.05) + 0.4 * bump(t, 0.82, 0.05)))


# ---- brouter au sol : antérieurs tendus, museau dans l'herbe, mâche, balaie de côté -------------------------------
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


head_pts = [(dom[m][i], m.matrix_world @ m.data.vertices[i].co) for m in meshes for i, v in enumerate(m.data.vertices)
            if dom[m][i] in headset and not SKIP.search(dom[m][i] or '')][::3]


def muzzle_eval(gp, whole=False):
    pose, _ = dg.pose_at(rig, 0.0, gp)
    Pp = [(pose[b] @ rig.rest[b].inverted() @ p) for b, p in mz_pts]
    zmin = min(p.z for p in Pp)
    if whole:
        zmin = min(zmin, min((pose[b] @ rig.rest[b].inverted() @ p).z for b, p in head_pts))
    c = sum(Pp, Vector()) / len(Pp)
    hj = pose[cfg['head'][0]].translation
    nj = pose[cfg['neck'][0]].translation

    def below(a, b):
        d = b - a
        return math.atan2(-d.z, max(1e-6, math.hypot(d.x, d.y)) * (1 if d.y < 0 else -1))
    return zmin, below(hj, c), below(nj, hj), c.y, c


def head_search(base, zt, nb_max, ha_max, ha_min=0.9, pitch=True, w_pt=2.0, nb_min=0.0, hb_min=-1.0, hb_max=0.6, pitch_max=0.2, y_max=None, y_min=None, whole=False):
    best = None
    for k in range(0, int(pitch_max / 0.03 + 1e-6) + 1 if pitch else 1):
        pt = 0.03 * k
        for i in range(int(round(nb_min / 0.1)), int(nb_max / 0.1) + 1):
            nb = i * 0.1
            for j in range(0, int((hb_max - hb_min) / 0.1) + 1):
                hb = hb_min + j * 0.1
                gp = dict(base, neck_base=base.get('neck_base', 0.0) + nb, head_base=base.get('head_base', 0.0) + hb,
                          pitch_base=base.get('pitch_base', 0.0) + pt)
                z, ha, na, my, _ = muzzle_eval(gp, whole)
                cost = abs(z - zt) * 8 + w_pt * pt + 0.02 * abs(nb) + 0.05 * abs(hb)
                cost += 4.0 * max(0.0, ha - ha_max) + 4.0 * max(0.0, ha_min - ha)
                if y_max is not None:
                    cost += 12.0 * max(0.0, my - y_max)
                if y_min is not None:
                    cost += 12.0 * max(0.0, y_min - my)
                if best is None or cost < best[0]:
                    best = (cost, gp, z, ha, na)
    print('HEAD SEARCH', round(zt, 4), 'z', round(best[2], 4), 'tête', round(best[3], 3), 'encolure', round(best[4], 3))
    return best[1]


front_tip_y = min(rig.legs[l]['neutral'].y for l in ('FL', 'FR'))
graze = head_search(front_planted(dict(still, pivot=hp.copy(), drop=0.01 * s), {'FL': -0.05 * s, 'FR': 0.02 * s}),
                    0.015 * s, 4.2, 1.35, ha_min=0.85, pitch_max=0.30, w_pt=1.0, y_max=front_tip_y - 0.10 * s)
report['grazeMuzzle'] = round(muzzle_eval(graze)[0], 4)
dg.bake(rig, 'graze', graze, 150, lambda t: {
    'head': 0.07 * max(0.0, math.sin(TAU * 5 * t)) ** 4 - 0.02,
    'jaw': 0.06 + 0.06 * math.sin(TAU * 10 * t), 'jaw_yaw': 0.05 * math.sin(TAU * 10 * t + 1.0),
    'neck_yaw': 0.28 * math.sin(TAU * t), 'head_yaw': 0.10 * math.sin(TAU * t + 0.6),
    'ear': 0.3 * bump(t, 0.3, 0.05) - 0.2 * bump(t, 0.75, 0.05), 'tail_yaw': 0.6 * bump(t, 0.55, 0.04) - 0.5 * bump(t, 0.6, 0.04)})

# ---- manger à l'auge ou au cornadis : museau à ≈ 0,45 m, mâche ------------------------------------------------------
EAT_Z = M.get('eat_z', 0.45)
eat = head_search(front_planted(dict(still, pivot=hp.copy(), drop=0.005 * s)), EAT_Z, 2.4, 1.5, ha_min=0.5, pitch_max=0.12,
                  y_max=front_tip_y - 0.20)
report['eatMuzzle'] = [round(-muzzle_eval(eat)[4].y, 4), round(muzzle_eval(eat)[0], 4)]
dg.bake(rig, 'eat', eat, 120, lambda t: {'head': 0.04 * math.sin(TAU * 3 * t), 'jaw': 0.06 + 0.06 * math.sin(TAU * 8 * t),
                                         'jaw_yaw': 0.05 * math.sin(TAU * 8 * t + 1.0), 'neck_yaw': 0.08 * math.sin(TAU * t),
                                         'tail_yaw': 0.4 * bump(t, 0.5, 0.05)})


# ---- meugler : tête tendue en avant et vers le haut, bouche ouverte qui vibre, flancs qui se creusent ----------------
def moo_x(t):
    up = dg.smooth(t / 0.22) * (1 - dg.smooth((t - 0.80) / 0.20))
    mouth = dg.smooth((t - 0.20) / 0.10) * (1 - dg.smooth((t - 0.72) / 0.12))
    return {'neck': -0.22 * up, 'head': -0.62 * up, 'jaw': mouth * (M.get('moo_jaw', 0.34) + 0.04 * math.sin(TAU * 7 * t)), 'ear_back': -0.15 * up,
            'ear': 0.15 * up, 'tail_yaw': 0.4 * bump(t, 0.3, 0.06), 'tail_lift': 0.15 * up,
            'bob': 0.006 * s * mouth * math.sin(TAU * 7 * t), 'pitch': -0.012 * up}


dg.bake(rig, 'moo', dict(still), 75, moo_x, cyclic=False)

# ---- traite : debout, postérieurs écartés et un peu en arrière, mâche, queue qui bat ----------------------------
milk = dict(still, legs={lab: {'J3': (rig.legs[lab]['J'][3].y + 0.04 * s, rig.legs[lab]['J'][3].z), 'a3': a3_rest(lab), 'phi': 0.0,
                               'splay': 0.06} for lab in ('HL', 'HR')}, neck_base=-0.02)
dg.bake(rig, 'milk', milk, 150, lambda t: dict(breathe(t, 0.8, 4), neck_yaw=0.30 + 0.05 * math.sin(TAU * t), head_yaw=0.20,
                                                jaw=0.04 + 0.04 * math.sin(TAU * 10 * t), jaw_yaw=0.05 * math.sin(TAU * 10 * t + 1.2),
                                                ear=0.2 * bump(t, 0.5, 0.05), tail_yaw=0.5 * bump(t, 0.25, 0.05) - 0.4 * bump(t, 0.3, 0.04)))


# ---- couchée sur le sternum : antérieurs repliés sous le poitrail, postérieurs repliés sur le côté -------------------
def lie_gp(drop):
    gp = dict(still, drop=drop, pivot=hp.copy(), pitch_base=M.get('lie_pitch', 0.02), neck_base=M.get('lie_neck', -0.12), head_base=0.08,
              roll_base=M.get('lie_roll', 0.08))
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


# descente : le ventre (tronc) posé au sol, à 5 mm ; pliure des antérieurs (hauteur du genou, rotation du sabot) choisie
# pour que les onglons ne passent pas sous le sol (sinon le jeu relève tout le corps : le taureau flottait de 10 cm)
paw_front = [it for lab in ('FL', 'FR') for it in paws[lab]][::2]
paw_hind = [it for lab in ('HL', 'HR') for it in paws[lab]][::2]


def lie_drop_for():
    lo, hi = 0.0, belly + 0.15
    for _ in range(13):
        mid_ = (lo + hi) / 2
        z = K.pose_probe(rig, lie_gp(mid_), torso_items)
        if z > 0.005:
            lo = mid_
        else:
            hi = mid_
    return lo


base_lie = {k: M.get(k) for k in ('lie_knee', 'lie_toe_phi', 'lie_fetlock', 'lie_htoe_phi')}
best = None
for knee in (0.045, 0.055, 0.065):
    for phi in (2.0, 2.3, 2.6, 1.7):
        M['lie_knee'], M['lie_toe_phi'] = knee, phi
        d_ = lie_drop_for()
        zf = K.pose_probe(rig, lie_gp(d_), paw_front)
        cost = max(0.0, -0.004 - zf) * 50 + (knee - 0.045) * 4 + abs(phi - 2.0) * 0.05
        print('LIE essai genou', knee, 'sabot', phi, 'descente', round(d_, 4), 'onglons antérieurs', round(zf, 4))
        if best is None or cost < best[0]:
            best = (cost, knee, phi, d_, zf)
M['lie_knee'], M['lie_toe_phi'] = best[1], best[2]
lie_drop = best[3]
for fl_ in (0.065, 0.08, 0.095):
    M['lie_fetlock'] = fl_
    zh = K.pose_probe(rig, lie_gp(lie_drop), paw_hind)
    if zh > -0.004:
        break
report['lieFold'] = {'knee': best[1], 'toePhi': best[2], 'fetlock': M['lie_fetlock'], 'frontHoofMin': round(best[4], 4), 'hindHoofMin': round(zh, 4)}
print('LIE pliure', report['lieFold'])
lie = lie_gp(lie_drop)
report['lieDrop'] = round(lie_drop, 4)
report['lieBodyMin'] = round(K.pose_probe(rig, lie, torso_items), 4)
print('LIE drop', round(lie_drop, 4), 'tronc au plus bas', report['lieBodyMin'])
dg.bake(rig, 'lie', lie, 180, lambda t: dict(
    breathe(t, 0.8, 4), tail_lift=TAIL_LIE['tail_lift'], head_yaw=0.2 * math.sin(TAU * t + 0.5), ear=0.3 * bump(t, 0.35, 0.05), ear_back=0.05,
    tail_yaw=TAIL_LIE['tail_yaw'] + 0.15 * bump(t, 0.7, 0.05)))
# ruminer : couchée, la mâchoire va de côté (≈ 1 coup par seconde), bol avalé de temps en temps
dg.bake(rig, 'ruminate', lie, 180, lambda t: dict(
    breathe(t, 0.8, 4), **TAIL_LIE, jaw=0.03 + 0.035 * math.sin(TAU * 6 * t), jaw_yaw=0.09 * math.sin(TAU * 6 * t),
    head_yaw=0.06 * math.sin(TAU * t), neck=-0.05 * bump(t, 0.55, 0.05), head=0.03 * math.sin(TAU * 6 * t),
    ear=0.2 * bump(t, 0.2, 0.05)))
# dormir : couchée, tête posée au sol sur le côté, respiration lente
# (menton posé : tête presque à plat, l'encolure descend ; tournée de côté)
sleep = head_search(dict(lie), 0.008, 3.6, 0.55, ha_min=0.05, pitch=False, hb_min=-1.8, whole=True)
dg.bake(rig, 'sleep', sleep, 180, lambda t: dict(breathe(t, 1.4, 2), **TAIL_LIE, neck_yaw=0.55, head_yaw=0.30, head_roll=0.35, ear_back=0.3))


# ---- se coucher / se relever en bovin : à genoux devant d'abord ; pour se relever, l'arrière-train d'abord ----------
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
    # (sabots couchés vers l'arrière juste assez pour que les onglons ne s'enfoncent pas : à 1,6 ils passaient 6 cm sous le sol)
    for phi in (1.6, 1.9, 2.2, 2.5, 2.8):
        for lab in ('FL', 'FR'):
            legsd[lab]['phi'] = phi
        zf = K.pose_probe(rig, gp, paw_front)
        if zf >= -0.004:
            break
    print('KNEEL bascule', round(th, 3), 'sabots', phi, 'onglons', round(zf, 4))
    return gp


stand_p = P(dict(still))
lie_p = P(lie, tail_lie)
kneel = kneel_gp()
kneel_p = P(kneel)
half = dict(still, pivot=hp.copy(), pitch_base=kneel['pitch_base'] * 0.35, drop=lie_drop * 0.55, neck_base=kneel['neck_base'] * 0.5, head_base=-0.03,
            roll_base=0.03)
half['legs'] = {lab: dict(kneel['legs'][lab]) for lab in ('FL', 'FR')}
half_p = P(half, lambda t: {'tail_lift': 0.4, 'tail_yaw': 0.5})


def hoof_back(lab, ang=-0.08):
    p0 = rig.legs[lab]['paw0']
    return ang - math.atan2(p0.z, p0.y)


def leg_lift(lab):
    R = rig.legs[lab]
    return {'J3': (R['J'][3].y - 0.02 * s, R['J'][3].z + 0.15 * s), 'a3': 2.4, 'phi': hoof_back(lab, -0.6), 'bend': 1}


def leg_planted(lab, dy=0.0):
    R = rig.legs[lab]
    return {'J3': (R['J'][3].y + dy, R['J'][3].z), 'a3': a3_rest(lab), 'phi': 0.0, 'bend': 1}


# (les antérieurs se plient l'un après l'autre : genou gauche au sol, puis le droit ; la tête descend et se balance
# vers l'avant pour faire contrepoids, comme chez la vache)
one_knee = dict(still, pivot=hp.copy(), pitch_base=kneel['pitch_base'] * 0.55, neck_base=kneel['neck_base'] * 0.5 + 0.15)
one_knee['legs'] = {'FL': dict(kneel['legs']['FL']), 'FR': leg_lift('FR')}
lift_one = dict(still, pivot=hp.copy(), pitch_base=0.03, neck_base=0.10)
lift_one['legs'] = {'FL': leg_lift('FL'), 'FR': leg_planted('FR')}
step_one = dict(still, pivot=hp.copy(), pitch_base=kneel['pitch_base'] * 0.45, neck_base=kneel['neck_base'] * 0.4 + 0.1)
step_one['legs'] = {'FL': dict(kneel['legs']['FL']), 'FR': leg_planted('FR', -0.04 * s)}


# Transitions cuites par cinématique inverse à chaque image (cibles des membres et réglages du corps interpolés entre les
# poses clés) : mélangées os par os, les poses clés laissaient les onglons passer jusqu'à 9 cm sous le sol entre deux
# clés (genou au sol → l'autre genou), et le jeu relevait tout le corps.
def hind_planted(lab):
    R = rig.legs[lab]
    return {'J3': (R['J'][3].y, R['J'][3].z), 'a3': a3_rest(lab), 'phi': 0.0, 'bend': 'fwd'}


def full_legs(gp):
    L_ = dict(gp.get('legs', {}))
    for lab in rig.legs:
        if lab not in L_:
            L_[lab] = leg_planted(lab) if lab[0] == 'F' else hind_planted(lab)
    return L_


NUM = ('pitch_base', 'drop', 'neck_base', 'head_base', 'roll_base', 'yaw_base', 'shift')


def gp_lerp(ga, gb, u):
    g = dict(still)
    for k in NUM:
        g[k] = (1 - u) * ga.get(k, 0.0) + u * gb.get(k, 0.0)
    pa, pb = ga.get('pivot', cfg['pitch_pivot']), gb.get('pivot', cfg['pitch_pivot'])
    g['pivot'] = pa.lerp(pb, u)
    la, lb = full_legs(ga), full_legs(gb)
    legsd = {}
    for lab in rig.legs:
        A, Bq = la[lab], lb[lab]
        legsd[lab] = {'J3': ((1 - u) * A['J3'][0] + u * Bq['J3'][0], (1 - u) * A['J3'][1] + u * Bq['J3'][1]),
                      'a3': (1 - u) * A.get('a3', 0.0) + u * Bq.get('a3', 0.0), 'phi': (1 - u) * A.get('phi', 0.0) + u * Bq.get('phi', 0.0),
                      'splay': (1 - u) * A.get('splay', 0.0) + u * Bq.get('splay', 0.0), 'bend': (A if u < 0.5 else Bq).get('bend', 1)}
    g['legs'] = legsd
    return g


def seq_gp(keys, extra=None):
    def fn(t):
        for k in range(len(keys) - 1):
            t0, g0 = keys[k]
            t1, g1 = keys[k + 1]
            if t <= t1 + 1e-9:
                # (t passé tel quel : les surcouches extra — queue — suivent le temps du clip)
                return dg.pose_at(rig, t, gp_lerp(g0, g1, dg.smooth((t - t0) / (t1 - t0))), extra)
        return dg.pose_at(rig, t, keys[-1][1], extra)
    return fn


# demi-couchée (entre à genoux et couchée) : descente, bascule et rotation des sabots antérieurs choisies pour que les
# onglons restent au-dessus du sol (à genoux, le corps qui descend sans basculer les enfonçait de 6 à 9 cm)
best_h = None
for dk in (0.55, 0.45, 0.35, 0.25):
    for pk in (0.35, 0.6, 0.85):
        for phi in (1.6, 2.0, 2.4):
            h_ = dict(still, pivot=hp.copy(), pitch_base=kneel['pitch_base'] * pk, drop=lie_drop * dk, neck_base=kneel['neck_base'] * 0.5,
                      head_base=-0.03, roll_base=0.03)
            h_['legs'] = {lab: dict(kneel['legs'][lab], phi=phi) for lab in ('FL', 'FR')}
            h_['legs'].update({lab: hind_planted(lab) for lab in ('HL', 'HR')})
            zf = K.pose_probe(rig, h_, paw_front)
            zh = K.pose_probe(rig, h_, paw_hind)
            cost = max(0.0, -0.004 - zf) * 50 + max(0.0, -0.004 - zh) * 50 + (0.55 - dk) + abs(pk - 0.35) * 0.2 + abs(phi - 1.6) * 0.05
            if best_h is None or cost < best_h[0]:
                best_h = (cost, h_, dk, pk, phi, zf, zh)
half = best_h[1]
report['halfLie'] = {'drop': round(best_h[2], 2), 'pitch': round(best_h[3], 2), 'toePhi': best_h[4], 'frontHoofMin': round(best_h[5], 4), 'hindHoofMin': round(best_h[6], 4)}
print('DEMI-COUCHÉE', report['halfLie'])
for nm, g_ in (('kneel', kneel), ('one_knee', one_knee), ('lift_one', lift_one), ('step_one', step_one)):
    g2 = dict(g_); g2['legs'] = full_legs(g_)
    print('POSE CLÉ', nm, 'onglons antérieurs', round(K.pose_probe(rig, g2, paw_front), 4), 'postérieurs', round(K.pose_probe(rig, g2, paw_hind), 4))
stand_g = dict(still, pivot=hp.copy())
lie_g = dict(lie)
lie_g['legs'] = {lab: dict(v) for lab, v in lie['legs'].items()}
dg.bake(rig, 'lie_down', None, 96, cyclic=False, pose_fn=seq_gp(
    [(0.0, stand_g), (0.14, lift_one), (0.28, one_knee), (0.40, kneel), (0.50, kneel), (0.76, half), (1.0, lie_g)],
    lambda t: {'tail_lift': TAIL_LIE['tail_lift'] * dg.smooth((t - 0.6) / 0.4), 'tail_yaw': TAIL_LIE['tail_yaw'] * dg.smooth((t - 0.6) / 0.4)}))
# (se relever : l'arrière-train d'abord, l'avant reste à genoux, la tête se balance en avant ; puis un antérieur se pose
# devant, et l'autre)
rise_one = dict(still, pivot=hp.copy(), pitch_base=0.04, neck_base=0.05)
rise_one['legs'] = {'FL': leg_lift('FL'), 'FR': leg_planted('FR', -0.02 * s)}
lunge = dict(kneel, neck_base=kneel['neck_base'] + 0.35, head_base=0.15)
lie_up = dict(lie_g, neck_base=lie['neck_base'] + 0.25)
dg.bake(rig, 'get_up', None, 84, cyclic=False, pose_fn=seq_gp(
    [(0.0, lie_g), (0.12, lie_up), (0.32, half), (0.50, kneel), (0.58, lunge), (0.70, one_knee), (0.82, step_one), (0.92, rise_one), (1.0, stand_g)],
    lambda t: {'tail_lift': TAIL_LIE['tail_lift'] * (1 - dg.smooth(t / 0.35)), 'tail_yaw': TAIL_LIE['tail_yaw'] * (1 - dg.smooth(t / 0.35))}))


# ---- surcouches : queue qui chasse les mouches, oreilles qui battent (seuls ces os sont animés : le jeu les joue
# par-dessus n'importe quel clip) ------------------------------------------------------------------------------------
dg.bake(rig, 'tail_flick', dict(still, tail_yaw=0.85, tail_lag=0.07, tail_yaw_freq=2), 60, lambda t: dict(
    tail_lift=0.35 * bump(t, 0.25, 0.12) + 0.25 * bump(t, 0.75, 0.12)))
dg.bake(rig, 'ear_flick', dict(still), 36, lambda t: dict(
    ear=0.45 * bump(t, 0.18, 0.08) - 0.35 * bump(t, 0.32, 0.07) + 0.3 * bump(t, 0.7, 0.07),
    ear_back=0.35 * bump(t, 0.2, 0.08) - 0.25 * bump(t, 0.72, 0.08)))
# chasser les mouches, corps entier : tête lancée vers le flanc, oreilles, coups de queue
dg.bake(rig, 'swat', dict(still, tail_yaw=0.7, tail_lag=0.07, tail_yaw_freq=3), 60, lambda t: dict(
    breathe(t, 1.0, 2), neck_yaw=0.75 * bump(t, 0.35, 0.18), head_yaw=0.55 * bump(t, 0.36, 0.16), head_roll=0.25 * bump(t, 0.36, 0.14),
    neck=0.12 * bump(t, 0.35, 0.18), ear=0.4 * bump(t, 0.2, 0.06) - 0.3 * bump(t, 0.7, 0.06), ear_back=0.3 * bump(t, 0.35, 0.1),
    tail_lift=0.3 * bump(t, 0.4, 0.15)), cyclic=False)


# ---- veau : gambade (bonds, ruade, queue en l'air), tétée --------------------------------------------------------
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


H_SKIP = 0.20 * s
k_crouch = P(dict(still, drop=0.05 * s, neck_base=0.05))
k_push = P(dict(still, drop=-0.01 * s, pitch_base=-0.06, neck_base=-0.15))
k_air1 = P(legs_air(dict(still, yaw_base=0.22, roll_base=0.10, neck_base=-0.2, head_base=-0.1), 0.05, 0.12, -0.05, 0.14))
k_buck = P(legs_air(dict(still, pivot=sh.copy(), yaw_base=-0.15, roll_base=-0.08, pitch_base=0.16, neck_base=0.15, head_base=0.2), 0.06, 0.04, -0.50, 0.32))
k_land = P(dict(still, drop=0.04 * s, pitch_base=0.04, neck_base=0.1))
TAIL_UP = {'tail_lift': 1.1}


def skip_pose(t):
    keys = [(0.0, k_crouch), (0.16, k_push), (0.42, k_air1), (0.66, k_buck), (0.84, k_land), (1.0, k_crouch)]
    p, _ = seq(keys)(t)
    h = 0.0
    if 0.16 < t < 0.84:
        u = (t - 0.16) / 0.68
        h = H_SKIP * 4 * u * (1 - u)
    return lifted(p, h), {}


# (queue dressée : posée par-dessus la pose cuite, voir tail_over)
dg.bake(rig, 'calf_play', None, 24, cyclic=True, pose_fn=skip_pose)

# tétée : le veau, l'encolure tendue sous le ventre de sa mère, museau levé vers le trayon, donne des coups de tête
# (« il pousse la mamelle »), la queue frétille ; le jeu place le veau (museau rapporté dans extras)
SUCKLE_Z = M.get('suckle_z', 0.92)
suck = head_search(dict(still, legs={lab: {'J3': (rig.legs[lab]['J'][3].y + (0.05 * s if lab[0] == 'H' else -0.03 * s), rig.legs[lab]['J'][3].z),
                                         'a3': a3_rest(lab), 'phi': 0.0, 'splay': 0.07} for lab in rig.legs}),
                   SUCKLE_Z, 1.6, 0.45, ha_min=0.0, pitch=False, hb_min=-1.8, hb_max=0.2, nb_min=0.1)
zs_, ha_, na_, my_, c_ = muzzle_eval(suck)
report['suckleMuzzle'] = {'pos': [round(-c_.y, 4), round(zs_, 4)], 'note': 'museau du veau (taille 1) qui tète : [avant en +z, hauteur] ; à mettre à l’échelle du veau'}
dg.bake(rig, 'suckle', suck, 60, lambda t: dict(
    head=-0.10 * max(0.0, math.sin(TAU * 3 * t)) ** 3, neck=-0.04 * max(0.0, math.sin(TAU * 3 * t)) ** 3,
    jaw=0.03 + 0.03 * math.sin(TAU * 9 * t), ear_back=0.15, ear=0.1 * math.sin(TAU * 2 * t)), )
SUCKLE_TAIL = dict(tail_yaw=0.55, tail_lag=0.05, tail_yaw_freq=6)

# secouer la tête (mouches, pluie)
dg.bake(rig, 'head_shake', dict(still), 36, lambda t: dict(
    head_roll=0.35 * math.sin(TAU * 3 * t) * bump(t, 0.5, 0.4), head_yaw=0.15 * math.sin(TAU * 3 * t + 0.6) * bump(t, 0.5, 0.4),
    neck=-0.05 * bump(t, 0.5, 0.4), ear=0.35 * math.sin(TAU * 3 * t + 1.2) * bump(t, 0.5, 0.4), ear_back=0.2 * bump(t, 0.5, 0.3)), cyclic=False)


# ---- queue posée par-dessus des clips cuits (veau qui gambade : queue dressée ; tétée : queue qui frétille) ----------
def tail_over(act_name, fn):
    act = bpy.data.actions[act_name]
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    n = f1 - f0
    tmp = dg.bake(rig, '_tail_tmp', dict(still, **fn.get('gp', {})), n, lambda t: fn.get('x', lambda t: {})(t))
    for tn in tail:
        path = f'pose.bones["{tn}"].rotation_quaternion'
        src = [tmp.fcurves.find(path, index=k) for k in range(4)]
        dst = [act.fcurves.find(path, index=k) for k in range(4)]
        for k in range(4):
            if src[k] is None or dst[k] is None:
                continue
            vals = [src[k].evaluate(f0 + i) for i in range(n + 1)]
            while dst[k].keyframe_points:
                dst[k].keyframe_points.remove(dst[k].keyframe_points[0])
            for i, v in enumerate(vals):
                kp = dst[k].keyframe_points.insert(f0 + i, v)
                kp.interpolation = 'LINEAR'
    bpy.data.actions.remove(tmp)


tail_over('calf_play', {'x': lambda t: {'tail_lift': 1.0 + 0.15 * math.sin(TAU * t), 'tail_yaw': 0.15 * math.sin(TAU * t)}})
tail_over('suckle', {'gp': SUCKLE_TAIL})


# ---- mamelle aplatie contre le sol quand la vache est couchée (seule échelle animée du GLB, comme la chèvre du jeu) ----
def flatten_udder(act):
    if PART != 'udder' or not udder_v:
        return 0.0
    K.clear_anim(arm)
    arm.animation_data.action = act
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    ks = []
    for fr in range(f0, f1 + 1):
        bpy.context.scene.frame_set(fr)
        low = min(K.Probe(None).z_of(udder_v))
        hz = (arm.matrix_world @ arm.pose.bones[PART].head).z
        k = 1.0
        if low < 0.006 and hz - low > 1e-4:
            k = max(0.15, (hz - 0.006) / (hz - low))
        ks.append(k)
    arm.animation_data.action = None
    if min(ks) > 0.995:
        return 1.0
    # (lissé sur 5 images : pas de saut)
    n = len(ks)
    sm = [min(ks[max(0, i - 2):min(n, i + 3)]) for i in range(n)]
    path = f'pose.bones["{PART}"].scale'
    for k_ in range(3):
        fc = act.fcurves.find(path, index=k_) or act.fcurves.new(path, index=k_, action_group=PART)
        while fc.keyframe_points:
            fc.keyframe_points.remove(fc.keyframe_points[0])
        for i, kv in enumerate(sm):
            wv = min(1.3, 1.0 / math.sqrt(kv))
            kp = fc.keyframe_points.insert(f0 + i, kv if k_ == 1 else wv)
            kp.interpolation = 'LINEAR'
    return min(sm)


report['udderFlatten'] = {}
for act in list(bpy.data.actions):
    if act.name.startswith('_') or act.name in ('tail_flick', 'ear_flick'):
        continue
    kmin = flatten_udder(act)
    if kmin and kmin < 0.995:
        report['udderFlatten'][act.name] = round(kmin, 3)
        print('MAMELLE aplatie', act.name, round(kmin, 3))


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
    if act.name.startswith('_') or act.name in ('tail_flick', 'ear_flick'):
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
    st_ = {'idle': 2, 'lie': 2, 'sleep': 3, 'milk': 2}.get(act.name)
    if st_:
        decimate(act, st_)

report['clipsInfo'] = {
    'idle': 'arrêt (respire, rumine un peu, regarde autour, oreilles, coups de queue) — boucle',
    'walk': 'pas (4 temps, hanches qui roulent, tête qui hoche) — boucle, sur place',
    'trot': 'trot — boucle, sur place', 'run': 'galop lourd, queue relevée — boucle, sur place',
    'graze': 'brouter au sol (mâche, balaie de côté) — boucle', 'eat': f'manger à l’auge (museau à {EAT_Z} m) — boucle',
    'moo': 'meugler (tête tendue, bouche ouverte) — une fois', 'milk': 'traite (debout, postérieurs écartés, mâche) — boucle',
    'lie_down': 'se coucher : un genou, puis les deux, puis l’arrière-train — une fois',
    'lie': 'couchée — boucle', 'ruminate': 'couchée, rumine (mâchoire de côté) — boucle', 'sleep': 'dort couchée, tête posée — boucle',
    'get_up': 'se relever : l’arrière-train d’abord, puis un antérieur et l’autre — une fois',
    'tail_flick': 'SURCOUCHE : queue qui chasse les mouches (seuls les os de la queue sont animés) — boucle',
    'ear_flick': 'SURCOUCHE : oreilles qui battent (seuls les os des oreilles) — une fois ou boucle',
    'swat': 'chasser les mouches : tête lancée vers le flanc, queue — une fois',
    'head_shake': 'secouer la tête — une fois',
    'calf_play': 'veau qui gambade : bonds, ruade, queue dressée (la racine monte) — boucle',
    'suckle': 'veau qui tète : encolure tendue, museau levé, coups de tête, queue qui frétille — boucle',
}
report['clips'] = K.check_clips(arm, meshes, paws, muzzle)
report['transResidual'] = round(dg.STATS['transResidual'], 6)
print('TRANSLATIONS retirées (hors racine), au plus', round(dg.STATS['transResidual'] * 1000, 3), 'mm')
report['speedsNote'] = 'vitesses naturelles (m/s, vache de taille 1) : action.timeScale = vitesse / vitesse naturelle'
bpy.ops.wm.save_as_mainfile(filepath=out.replace('.glb', '.blend'), compress=True)
K.export_glb(out, arm)
json.dump(report, open(report_path, 'w'), indent=1, ensure_ascii=False)
