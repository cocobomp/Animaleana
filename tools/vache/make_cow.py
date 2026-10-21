# Prépare une vache candidate (repris de chevres/scripts/make_goat.py) : nettoyage, orientation, échelle (garrot 1,40 m),
# allures et poses générées (cow_gait.py), pattes jamais sous le sol, vérifications sur le maillage déformé, export GLB brut.
# Usage : blender -b --factory-startup --disable-autoexec --python make_cow.py -- <id> <sortie.glb> <rapport.json> [--only a,b]
import bpy, sys, os, math, json, re
from mathutils import Vector, Matrix
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cowkit as K
import cow_gait as dg
import cow_models

argv = sys.argv[sys.argv.index('--') + 1:]
mid, out, report_path = argv[0], argv[1], argv[2]
opt = {argv[i]: argv[i + 1] for i in range(3, len(argv) - 1) if argv[i].startswith('--')}
ONLY = set(opt['--only'].split(',')) if opt.get('--only') else None
M = cow_models.MODELS[mid]
K.load(M['src'])
arm, meshes = M['prep']()
B = arm.data.bones
report = {'id': mid, 'clips': {}, 'notes': []}
TAU = math.tau


def want(name):
    return ONLY is None or name in ONLY


# ---- orientation : avant = -Y ; échelle : garrot 1,40 m ; pattes au sol ----------------------------------------
pts = K.world_verts(meshes)
wy = (arm.matrix_world @ B[M['withers_bone']].head_local).y + M.get('withers_back', 0.0)
band = 0.05 * (max(p.y for p in pts) - min(p.y for p in pts))
wh, _ = K.measure_withers(meshes, wy, band, xmax=0.12 * (max(p.y for p in pts) - min(p.y for p in pts)))
print('WITHERS y', round(wy, 3), 'bande', round(band, 3))
f = 1.0 if M.get('fixed_scale') else K.WITHERS / wh
print('WITHERS source', round(wh, 4), 'facteur', round(f, 4))
if f != 1.0:
    K.transform_all(arm, meshes, Matrix.Scale(f, 4), loc_scale=f)
pts = K.world_verts(meshes)
cx = sum((arm.matrix_world @ B[L['joints'][0]].head_local).x for L in M['legs'].values()) / 4
off = Vector((-cx, -(min(p.y for p in pts) + max(p.y for p in pts)) / 2, -min(p.z for p in pts)))
K.transform_all(arm, meshes, Matrix.Translation(off))
report['tris'] = K.tris(meshes)
report['bones'] = len(B)
report['scaleFromSource'] = round(f, 4)
pts = K.world_verts(meshes)
report['restBox'] = [[round(min(p.x for p in pts), 3), round(min(p.y for p in pts), 3), round(min(p.z for p in pts), 3)],
                     [round(max(p.x for p in pts), 3), round(max(p.y for p in pts), 3), round(max(p.z for p in pts), 3)]]
K.clear_anim(arm)
for a in list(bpy.data.actions):
    bpy.data.actions.remove(a)

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
# (s : rapport à la chèvre du jeu, hanche 0,56 m — les réglages des poses repris des chèvres gardent leurs proportions ;
# sc : rapport à la vache de référence, hanche 1,05 m — allures)
s = hipz / 0.56
sc = hipz / 1.05
for lab in legs:
    legs[lab]['scap_gain'] = 0.6 / max(0.3, s) if legs[lab]['scap'] else 0.0
tail = M.get('tail', [])
tail_end = {}
for i, tname in enumerate(tail):
    tail_end[tname] = B[tail[i + 1]].head_local.copy() if i + 1 < len(tail) else B[tname].tail_local.copy()
sh = Vector((0, sum(legs[k]['points'][0].y for k in ('FL', 'FR')) / 2, sum(legs[k]['points'][0].z for k in ('FL', 'FR')) / 2))
hp = Vector((0, sum(legs[k]['points'][0].y for k in ('HL', 'HR')) / 2, hipz))
cfg = dict(legs=legs, neck=M['neck'], head=M['head'], tail=tail, tail_end=tail_end, ears=M.get('ears', []),
           jaw=[j for j in M.get('jaw', []) if j in B], tongue=[], flex=M.get('flex', []), pitch_pivot=(sh + hp) / 2,
           zmin_tail=0.03, base_basis={}, scaled=[b for b in ('udder',) if b in B], tail_base=M.get('tail_base', {}))
rig = dg.Rig(arm, cfg)
report['hipHeight'] = round(hipz, 4)
report['shoulderJoint'] = [round(sh.y, 4), round(sh.z, 4)]
report['hipJoint'] = [round(hp.y, 4), round(hp.z, 4)]
print('HIP', round(hipz, 4), 'SHOULDER', sh, 's', round(s, 3))
for lab, L in rig.legs.items():
    print('LEG', lab, [tuple(round(x, 3) for x in p) for p in L['J']], 'lens', [round(x, 3) for x in L['lens']])

# Sommets : museau (les plus en avant des os de la tête), tronc, ce qui touche le sol couché.
PARTS = ('ear', 'eye', 'horn', 'beard', 'udder', 'jaw')
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
    cand = [(i, mw @ v.co) for i, v in enumerate(m.data.vertices) if dom[m][i] in headset and not (dom[m][i] or '').startswith(PARTS)]
    if cand:
        ymin = min(p.y for _, p in cand)
        muzzle += [(m, i) for i, p in cand if p.y < ymin + 0.02]
    for i, v in enumerate(m.data.vertices):
        d = dom[m][i]
        if d:
            solid.append((m, i))
            if d not in legset and d not in headset and d not in tail and not d.startswith('udder'):
                p = mw @ v.co
                if hp.y + 0.02 > p.y > sh.y - 0.02:
                    torso.append((m, i, p))
belly = min(p.z for _, _, p in torso)
print('BELLY rest z', round(belly, 4), 'torso verts', len(torso), 'muzzle', len(muzzle))
pawset = {(m, i) for ids in paws.values() for m, i in ids}
body_items = [it for it in solid if it not in pawset][::(2 if len(solid) > 3000 else 1)]
mz_pts = [(dom[m][i], m.matrix_world @ m.data.vertices[i].co) for m, i in muzzle]


# ---- outils de pose (repris de make_dog.py) -------------------------------------------------------------------------
def pose_lowest(pose, items):
    act = dg.bake(rig, '_low', None, 1, cyclic=False, pose_fn=lambda t: (pose, {}))
    arm.animation_data.action = act
    bpy.context.scene.frame_set(0)
    z = min(K.Probe(None).z_of(items))
    arm.animation_data.action = None
    bpy.data.actions.remove(act)
    return z


def a3_rest(lab):
    J = rig.legs[lab]['J']
    return math.atan2(J[2].z - J[3].z, J[2].y - J[3].y)


def muzzle_eval(gp):
    pose, _ = dg.pose_at(rig, 0.0, gp)
    P = [(pose[b] @ rig.rest[b].inverted() @ p) for b, p in mz_pts]
    zmin = min(p.z for p in P)
    c = sum(P, Vector()) / len(P)
    hj = pose[cfg['head'][0]].translation
    nj = pose[cfg['neck'][0]].translation

    def below(a, b):
        d = b - a
        return math.atan2(-d.z, max(1e-6, math.hypot(d.x, d.y)) * (1 if d.y < 0 else -1))
    return zmin, below(hj, c), below(nj, hj), c


def head_search(base, zt, nb_max, ha_max, ha_min=0.9, pitch=True, w_pt=2.0, nb_min=0.0, hb_min=-1.0, pitch_max=0.36, yt=None):
    best = None
    for k in range(0, int(pitch_max / 0.03 + 1e-6) + 1 if pitch else 1):
        pt = 0.03 * k
        for i in range(int(round(nb_min / 0.1)), int(nb_max / 0.1) + 1):
            nb = i * 0.1
            for j in range(0, int((0.6 - hb_min) / 0.1) + 1):
                hb = hb_min + j * 0.1
                gp = dict(base, neck_base=base.get('neck_base', 0.0) + nb, head_base=base.get('head_base', 0.0) + hb,
                          pitch_base=base.get('pitch_base', 0.0) + pt)
                z, ha, na, c = muzzle_eval(gp)
                cost = abs(z - zt) * 8 + w_pt * pt + 0.02 * abs(nb) + 0.05 * abs(hb)
                cost += 4.0 * max(0.0, ha - ha_max) + 4.0 * max(0.0, ha_min - ha)
                if yt is not None:
                    cost += 3 * abs(c.y - yt)
                if best is None or cost < best[0]:
                    best = (cost, gp, z, ha, na)
    print('HEAD SEARCH', zt, 'z', round(best[2], 4), 'tête', round(best[3], 3), 'encolure', round(best[4], 3))
    return best[1]


def front_planted(base, dy=None, splay=0.05):
    gp = dict(base)
    gp['legs'] = dict(base.get('legs', {}))
    for lab in ('FL', 'FR'):
        R = rig.legs[lab]
        d_ = (dy or {}).get(lab, 0.0)
        under = R['J'][3].y - R['J'][0].y
        gp['legs'][lab] = {'under': under + d_, 'a3': a3_rest(lab), 'phi': 0.0, 'bend': 1, 'splay': splay}
    return gp


def keyed(keys, ease=True):
    """Clip à clés : [(t, gp ou pose)] -> pose_fn(t) mélangeant les poses (repère local de chaque os)."""
    P = [(t, (dg.pose_at(rig, 0.0, g)[0] if 'stride' in g else g)) for t, g in keys]

    def fn(t):
        for k in range(len(P) - 1):
            t0, p0 = P[k]
            t1, p1 = P[k + 1]
            if t <= t1 + 1e-9:
                u = (t - t0) / max(1e-9, t1 - t0)
                return dg.blend_local(rig, p0, p1, dg.smooth(u) if ease else u), {}
        return P[-1][1], {}
    return fn


def planted(labs=None, dy=0.0):
    """Pieds posés à leur place du repos, canon à son angle de repos (forme « repliable » d'une jambe debout)."""
    out = {}
    for lab in (labs or rig.legs):
        R = rig.legs[lab]
        out[lab] = {'J3': (R['J'][3].y + dy, R['J'][3].z), 'a3': a3_rest(lab), 'phi': 0.0, 'bend': 1 if lab[0] == 'F' else -1}
    return out


def gp_full(gp):
    """Pose dont toutes les jambes sont données (celles qui manquent : posées à leur place)."""
    g = dict(gp)
    legsd = planted()
    legsd.update(gp.get('legs', {}))
    g['legs'] = legsd
    g.setdefault('pivot', cfg['pitch_pivot'].copy())
    return g


def gp_lerp(ga, gb, u):
    """Paramètres de pose interpolés (bascule, descente, encolure, cibles des pieds…) : la cinématique inverse est refaite
    à chaque image, les pieds posés ne traversent plus le sol (mélanger les rotations de deux poses les y faisait passer)."""
    ga, gb = gp_full(ga), gp_full(gb)
    g = dict(ga)
    for k in set(ga) | set(gb):
        a, b = ga.get(k), gb.get(k)
        if isinstance(a, (int, float)) or isinstance(b, (int, float)):
            g[k] = (a or 0.0) * (1 - u) + (b or 0.0) * u
    g['pivot'] = ga['pivot'].lerp(gb['pivot'], u)
    legsd = {}
    for lab in rig.legs:
        A, Bl = ga['legs'][lab], gb['legs'][lab]
        L = {}
        L['J3'] = (A['J3'][0] * (1 - u) + Bl['J3'][0] * u, A['J3'][1] * (1 - u) + Bl['J3'][1] * u)
        for k in ('a3', 'phi', 'splay'):
            L[k] = A.get(k, 0.0) * (1 - u) + Bl.get(k, 0.0) * u
        L['bend'] = (A if u < 0.5 else Bl).get('bend', 1 if lab[0] == 'F' else -1)
        legsd[lab] = L
    g['legs'] = legsd
    for dk, dflt in (('tilt', 0.0), ('scale', (1.0, 1.0, 1.0))):
        da, db = ga.get(dk, {}), gb.get(dk, {})
        if da or db:
            out = {}
            for n in set(da) | set(db):
                a, b = da.get(n, dflt), db.get(n, dflt)
                out[n] = tuple(x * (1 - u) + y * u for x, y in zip(a, b)) if isinstance(dflt, tuple) else a * (1 - u) + b * u
            g[dk] = out
    return g


def gp_path(keys, extra=None):
    """Clip à clés de paramètres [(t, gp)] : pose_fn(t)."""
    def fn(t):
        for k in range(len(keys) - 1):
            t0, a = keys[k]
            t1, b = keys[k + 1]
            if t <= t1 + 1e-9:
                g = gp_lerp(a, b, dg.smooth((t - t0) / max(1e-9, t1 - t0)))
                return dg.pose_at(rig, t, g, extra)
        return dg.pose_at(rig, t, gp_full(keys[-1][1]), extra)
    return fn


def with_extra(fn, extra_fn):
    """Ajoute à une pose à clés des mouvements de tête / mâchoire / oreilles (posés sur la pose mélangée)."""
    return fn


still = dict(stride=0.0, duty=1.0, lift=0.0, phase={'HL': 0, 'FL': 0, 'HR': 0, 'FR': 0})


def breathe(t, k=1.0, n=3):
    return {'bob': 0.002 * s * math.sin(TAU * n * t) * k}


def flick(t, t0, dur=0.08, amp=0.5):
    """Petit coup bref (oreille, queue) autour de t0 (fractions du clip)."""
    u = (t - t0) / dur
    return amp * math.sin(math.pi * u) if 0 <= u <= 1 else 0.0


clip_meta = {}


def bake(name, gp, frames, extra=None, cyclic=True, pose_fn=None, once=False, note=None):
    if not want(name):
        return None
    act = dg.bake(rig, name, gp, frames, extra, cyclic=cyclic, pose_fn=pose_fn)
    clip_meta[name] = {'frames': frames, 'loop': not once}
    if note:
        clip_meta[name]['note'] = note
    return act


# ---- allures ---------------------------------------------------------------------------------------------------------
G = dg.cow_gaits(sc, K.FPS)
speeds = {}
for name in ('walk', 'trot', 'run'):
    gp = dict(G[name])
    bake(name, gp, gp['frames'], lambda t, name=name: {'ear_back': 0.15 if name == 'run' else 0.0,
                                                      'ear': (flick(t, 0.3, 0.08, 0.25) if name == 'walk' else 0.0)})
    speeds[name] = round(gp['speed'], 3)
report['naturalSpeeds'] = speeds

# ---- repos : respiration, oreilles qui bougent, coups de queue, tête qui regarde -----------------------------------
bake('idle', dict(still, neck=0.02, neck_freq=1, head=0.02), 180, lambda t: dict(
    breathe(t, 1.0, 5), head_yaw=0.20 * math.sin(TAU * t) + 0.06 * math.sin(TAU * 3 * t),
    ear=flick(t, 0.2, 0.05, 0.35) + flick(t, 0.62, 0.05, -0.3) + flick(t, 0.9, 0.04, 0.25), ear_back=0.08 * math.sin(TAU * 2 * t),
    tail_yaw=flick(t, 0.40, 0.06, 0.7) + flick(t, 0.46, 0.06, -0.7) + flick(t, 0.80, 0.06, 0.6) + flick(t, 0.86, 0.06, -0.5),
    jaw=0.03 * max(0.0, math.sin(TAU * 10 * t)) if 0.45 < t < 0.75 else 0.0,
    jaw_yaw=0.05 * math.sin(TAU * 10 * t) if 0.45 < t < 0.75 else 0.0), note='repos : respire, oreilles, queue qui chasse les mouches, mâchonne')

# ---- brouter au sol : museau dans l'herbe, coups de tête pour arracher, mâchoire qui mâche --------------------------
graze = head_search(front_planted(dict(still, pivot=hp.copy(), drop=0.01 * s), {'FL': -0.04 * s, 'FR': 0.02 * s}), 0.015 * s, 3.4, 1.9, pitch_max=0.24)
bake('graze', graze, 120, note='brouter : museau dans l’herbe, arrache, mâche', extra=lambda t: {
    'head': 0.06 * max(0.0, math.sin(TAU * 4 * t)) ** 3, 'jaw': 0.06 + 0.06 * math.sin(TAU * 8 * t),
    'neck_yaw': 0.22 * math.sin(TAU * t), 'head_yaw': 0.08 * math.sin(TAU * t + 0.6),
    'ear': flick(t, 0.3, 0.06, 0.3), 'tail_yaw': flick(t, 0.7, 0.05, 0.5)})

# ---- manger à l'auge / au cornadis : museau à ≈ 0,35 m -------------------------------------------------------------
EAT_Z = 0.35 * sc
eat = head_search(front_planted(dict(still, pivot=hp.copy(), drop=0.005 * s)), EAT_Z, 2.4, 1.4, ha_min=0.5, pitch_max=0.12)
bake('eat', eat, 90, note=f'manger à l’auge : museau à {EAT_Z:.2f} m', extra=lambda t: {'head': 0.05 * math.sin(TAU * 3 * t), 'jaw': 0.07 + 0.07 * math.sin(TAU * 6 * t),
                                'neck_yaw': 0.06 * math.sin(TAU * t)})

def hoof_back(lab, ang=-0.08):
    """Rotation du sabot (phi) qui le couche vers l'arrière, presque à plat (boulet fléchi : antérieur replié sous le
    poitrail ou à genoux) — au repos il pointe vers l'avant et le bas."""
    p0 = rig.legs[lab]['paw0']
    return ang - math.atan2(p0.z, p0.y)


# ---- couché (sternal) : antérieurs repliés sous le poitrail (carpes au sol), postérieurs repliés sur le côté -------
LOWER_LEG = {n for lab in M['legs'] for n in M['legs'][lab]['joints'][1:]}
# (le bas des antérieurs replié sous le poitrail compte : le corps se pose sur ses avant-bras et son poitrail)
LIE_SKIP = {n for lab in ('HL', 'HR') for n in M['legs'][lab]['joints'][1:]} | {M['legs'][lab]['joints'][3] for lab in ('FL', 'FR')}
lie_items = [(m, i) for m, i in solid if (m, i) not in pawset and (dom[m][i] or '') not in LIE_SKIP and not (dom[m][i] or '').startswith(('udder', 'tail'))]


def lie_gp(drop=None, th=0.0):
    """Couchée sur le sternum : le corps descend d'un bloc (drop) jusqu'à ce que le poitrail et le ventre touchent le sol
    (plus bas sommet du tronc, des épaules et des cuisses à 6 mm, cherché par dichotomie sur le maillage déformé) ;
    antérieurs repliés sous le poitrail, postérieurs repliés sur le côté."""
    piv = Vector((0.0, sh.y, sh.z))
    if drop is None and os.environ.get('LIE_DROP'):
        drop = float(os.environ['LIE_DROP'])
    if drop is None:
        lo, hi = 0.05 * hipz, 0.8 * hipz
        for _ in range(14):
            mid = (lo + hi) / 2
            z = pose_lowest(dg.pose_at(rig, 0.0, lie_gp(mid, th))[0], lie_items)
            if z > 0.006:
                lo = mid
            else:
                hi = mid
        drop = lo
        print('LIE drop', round(drop, 4), 'hanche', round(hp.z - drop, 4), 'th', th)
    gp = dict(still, drop=drop, pivot=piv, pitch_base=-th, neck_base=-0.15 + th * 0.6, head_base=0.15 + th * 0.4)

    def rot(p):
        return Vector((p.x, piv.y + (p.y - piv.y) * math.cos(-th) - (p.z - piv.z) * math.sin(-th),
                       piv.z + (p.y - piv.y) * math.sin(-th) + (p.z - piv.z) * math.cos(-th) - drop))
    legsd = {}
    for lab in ('FL', 'FR'):
        R = rig.legs[lab]
        l1, l2, l3 = R['l2d'][:3]
        J0 = rot(R['J'][0])
        # carpe posé devant (à l'épaisseur du genou), canon replié vers l'arrière sous l'avant-bras, sabot vers l'arrière
        zc = M.get('lie_carpus', 0.055) * s
        # (antérieur replié « à la vache » : le coude remonte contre les côtes, l'avant-bras est couché sur le sol, le
        # carpe en avant ; tant que l'épaule est trop haute, l'humérus reste presque vertical et l'avant-bras descend en
        # biais vers le carpe)
        dz = J0.z - zc
        if dz < 0.97 * l1:
            ae = math.asin(max(0.0, dz) / l1)
            J1y, J1z = J0.y + l1 * math.cos(ae), zc
        else:
            J1y, J1z = J0.y + 0.25 * l1, J0.z - math.sqrt(1 - 0.25 ** 2) * l1
        J2 = Vector((0, J1y - 0.96 * math.sqrt(max(0.0, l2 * l2 - (J1z - zc) ** 2)), zc))
        a3 = math.pi - 0.12
        J3 = (J2.y - l3 * math.cos(a3), max(J2.z - l3 * math.sin(a3), 0.04 * s))
        legsd[lab] = {'J3': J3, 'a3': a3, 'phi': hoof_back(lab), 'bend': 1, 'splay': 0.04}
    for lab in ('HL', 'HR'):
        R = rig.legs[lab]
        J0 = rot(R['J'][0])
        l1, l2, l3 = R['l2d'][:3]
        a3 = 0.06
        z3 = R['J'][3].z
        zh = z3 + l3 * math.sin(a3)
        fem = M.get('lie_fold', 0.55)
        # (cuisse plus verticale si la hanche est haute : sinon le jarret n'atteint pas le sol, la jambe partait tendue)
        fem = max(fem, math.asin(max(-1.0, min(1.0, (J0.z - zh - 0.85 * l2) / l1))))
        sy = J0.y - l1 * math.cos(fem)
        sz = max(zh + 0.02, J0.z - l1 * math.sin(fem))
        hy = sy + math.sqrt(max(0.0, l2 * l2 - (sz - zh) ** 2)) * 0.97
        legsd[lab] = {'J3': (hy - l3 * math.cos(a3), z3), 'a3': a3, 'phi': 0.0, 'splay': 0.38, 'bend': 'fwd'}
    gp['legs'] = legsd
    # (mamelle couchée vers l'arrière, entre les postérieurs : pendante, elle passait sous le sol)
    if 'udder' in B:
        gp['scale'] = {'udder': (1.15, 0.35, 1.15)}
    return gp


lie = lie_gp()
bake('lie', lie, 150, lambda t: dict(breathe(t, 0.8, 3), head_yaw=0.2 * math.sin(TAU * t + 0.5),
                                       ear=flick(t, 0.35, 0.06, 0.3), ear_back=0.05, tail_yaw=flick(t, 0.7, 0.06, 0.3)), note='couchée (sternale)')
# ruminer : couché, la mâchoire va de côté (≈ 1,3 coup par seconde), gorgée avalée de temps en temps
bake('ruminate', lie, 150, lambda t: dict(breathe(t, 0.8, 3), jaw=0.03 + 0.03 * math.sin(TAU * 6.5 * t),
                                            jaw_yaw=0.07 * math.sin(TAU * 6.5 * t), head_yaw=0.06 * math.sin(TAU * t),
                                            neck=0.04 * flick(t, 0.55, 0.1, 1.0), head=0.03 * math.sin(TAU * 6.5 * t)))
# dormir : couché, tête posée au sol sur le côté, respiration lente
sleep = head_search(dict(lie, legs=lie['legs']), 0.035 * s, 3.0, 1.2, ha_min=-0.4, pitch=False, hb_min=-1.6)
bake('sleep', sleep, 150, lambda t: dict(breathe(t, 1.3, 2), neck_yaw=0.45, head_yaw=0.25, head_roll=0.35, ear_back=0.25), note='dort : couchée, tête posée')

# ---- poses de passage : à genoux (antérieurs repliés, postérieurs debout) --------------------------------------------
def kneel_gp():
    # bascule autour des hanches jusqu'à ce que les épaules soient à la hauteur d'un antérieur à genoux
    R = rig.legs['FL']
    l1, l2, l3 = R['l2d'][:3]
    zc = M.get('lie_carpus', 0.045) * s
    target = zc + 0.86 * (l1 + l2) * 0.82
    piv = hp.copy()
    th = 0.0
    for _ in range(60):
        z = piv.z + (sh.y - piv.y) * math.sin(th) + (sh.z - piv.z) * math.cos(th)
        th += 0.4 * (z - target) / max(0.05, abs(sh.y - piv.y))
    gp = dict(still, pivot=piv, pitch_base=th, neck_base=-th * 0.7, head_base=-0.05)

    def rot(p):
        return Vector((p.x, piv.y + (p.y - piv.y) * math.cos(th) - (p.z - piv.z) * math.sin(th),
                       piv.z + (p.y - piv.y) * math.sin(th) + (p.z - piv.z) * math.cos(th)))
    legsd = {}
    for lab in ('FL', 'FR'):
        R = rig.legs[lab]
        l1, l2, l3 = R['l2d'][:3]
        J0 = rot(R['J'][0])
        J2 = Vector((0, J0.y - 0.15 * l2, zc))
        a3 = math.pi - 0.15
        J3 = (J2.y - l3 * math.cos(a3), max(J2.z - l3 * math.sin(a3), 0.04 * s))
        legsd[lab] = {'J3': J3, 'a3': a3, 'phi': hoof_back(lab), 'bend': 1}
    gp['legs'] = legsd
    print('KNEEL th', round(th, 3))
    return gp


kneel = kneel_gp()
stand_p = dg.pose_at(rig, 0.0, dict(still))[0]
kneel_p = dg.pose_at(rig, 0.0, kneel)[0]
lie_p = dg.pose_at(rig, 0.0, lie)[0]
# (antérieurs d'abord repliés en l'air : mélangés directement de debout à genoux, les sabots passaient sous le sol)
def front_lift_gp(pitch=0.06, drop=0.02):
    gp = dict(still, pivot=hp.copy(), pitch_base=pitch, drop=drop * s, neck_base=-0.05)
    legsd = {}
    for lab in ('FL', 'FR'):
        R = rig.legs[lab]
        legsd[lab] = {'J3': (R['J'][3].y - 0.02 * s, R['J'][3].z + 0.14 * s), 'a3': 2.4, 'phi': hoof_back(lab, -0.6), 'bend': 1}
    gp['legs'] = legsd
    return gp


lift_p = dg.pose_at(rig, 0.0, front_lift_gp())[0]
lift2_p = dg.pose_at(rig, 0.0, front_lift_gp(0.10, 0.03))[0]
kneel_low_p = dg.pose_at(rig, 0.0, dict(kneel, drop=M.get('kneel_low_drop', 0.16) * s, pitch_base=kneel['pitch_base'] * 0.55))[0]
kneel_low = dict(kneel, drop=M.get('kneel_low_drop', 0.16) * s, pitch_base=kneel['pitch_base'] * 0.55)
if M.get('lie_direct'):
    # (modèle à jupe de poils : à genoux, le poitrail passait sous le sol — le corps descend d'un bloc)
    crouch = dict(still, drop=0.06 * s, pitch_base=0.05)
    bake('lie_down', None, 54, cyclic=False, once=True, pose_fn=gp_path([(0.0, dict(still)), (0.4, crouch), (1.0, lie)]))
    bake('get_up', None, 45, cyclic=False, once=True, pose_fn=gp_path([(0.0, lie), (0.6, crouch), (1.0, dict(still))]))
else:
    # (à la manière d'un bovin : se couche les antérieurs d'abord — un genou puis les deux —, puis l'arrière ; se relève
    # l'arrière d'abord, reste un temps sur les genoux, puis se redresse de l'avant)
    bake('lie_down', None, 105, cyclic=False, once=True, note='se coucher (≈ 3,5 s) : à genoux d’abord, puis l’arrière',
         pose_fn=gp_path([(0.0, dict(still)), (0.22, front_lift_gp()), (0.42, kneel), (0.55, kneel), (0.78, kneel_low), (1.0, lie)]))
    bake('get_up', None, 90, cyclic=False, once=True, note='se relever (≈ 3 s) : l’arrière d’abord, un temps à genoux, puis l’avant',
         pose_fn=gp_path([(0.0, lie), (0.30, kneel_low), (0.50, kneel), (0.62, kneel), (0.82, front_lift_gp(0.10, 0.03)), (1.0, dict(still))]))

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



# ---- meugler : encolure tendue vers l'avant, tête relevée, bouche qui s'ouvre et vibre -------------------------------
if want('moo'):
    env = lambda t: dg.smooth(min(1.0, t / 0.25)) * dg.smooth(min(1.0, (1.0 - t) / 0.22))
    bake('moo', None, 75, cyclic=False, once=True, note='meugler (≈ 2,5 s) : encolure tendue, tête relevée, bouche ouverte',
         pose_fn=lambda t: dg.pose_at(rig, t, dict(still, neck_base=-0.22 * env(t), head_base=-0.50 * env(t)),
         lambda u: {'jaw': env(u) * (M.get('moo_jaw', 0.22) + 0.03 * math.sin(TAU * 11 * u)), 'ear_back': 0.30 * env(u),
                    'head': 0.02 * env(u) * math.sin(TAU * 11 * u), 'bob': 0.004 * s * env(u) * math.sin(TAU * 4 * u),
                    'tail_yaw': flick(u, 0.15, 0.06, 0.4)}))

# ---- queue qui chasse les mouches : coups de queue sur les flancs, tête qui se retourne, oreilles ---------------------
bake('tail_swish', dict(still, tail_yaw=0.55, tail_yaw_freq=2, tail_lag=0.05, tail_lift=0.05), 90,
     lambda t: dict(breathe(t, 1.0, 3), neck_yaw=0.55 * flick(t, 0.55, 0.35, 1.0), head_yaw=0.35 * flick(t, 0.55, 0.35, 1.0),
                    ear=flick(t, 0.15, 0.05, 0.4) + flick(t, 0.75, 0.05, -0.4), ear_back=0.1 * flick(t, 0.5, 0.3, 1.0)),
     note='queue qui chasse les mouches (deux coups par flanc), la vache se retourne vers son flanc')

# ---- traite : debout, postérieur droit un peu reculé, mâchonne, queue de temps en temps ------------------------------
milk_gp = dict(still)
milk_gp['legs'] = {'HR': {'J3': (rig.legs['HR']['J'][3].y + 0.06 * s, rig.legs['HR']['J'][3].z), 'a3': a3_rest('HR'), 'phi': 0.0, 'bend': -1}}
bake('milk', milk_gp, 150, lambda t: dict(breathe(t, 1.0, 5), jaw=0.03 + 0.03 * math.sin(TAU * 12 * t), jaw_yaw=0.05 * math.sin(TAU * 12 * t),
                                          head_yaw=0.12 * math.sin(TAU * t), ear=flick(t, 0.3, 0.05, 0.3) + flick(t, 0.8, 0.05, -0.3),
                                          tail_yaw=flick(t, 0.6, 0.06, 0.5) + flick(t, 0.66, 0.06, -0.4)),
     note='traite : reste debout, postérieur droit reculé (mamelle dégagée), rumine')

# ---- veau qui gambade : bond des antérieurs puis ruade (postérieurs lancés en arrière), queue en l'air -------------
CALF_UP = 0.10 * s
calf_keys = [
    (0.0, dict(still)),
    (0.18, fold_legs(dict(still, drop=0.06 * s, pitch_base=0.05, neck_base=0.05), (0.03, 0.0, a3_rest('FL')), (0.06, 0.0, a3_rest('HL')))),
    (0.38, fold_legs(dict(still, pivot=hp.copy(), pitch_base=-0.30, drop=-CALF_UP, neck_base=-0.15, head_base=-0.1), (0.25, 0.45, 2.3), None)),
    (0.55, fold_legs(dict(still, drop=-1.2 * CALF_UP, pitch_base=0.0, neck_base=0.0), (0.2, 0.35, 2.2), (-0.05, 0.25, 1.6))),
    (0.74, fold_legs(dict(still, pivot=sh.copy(), pitch_base=0.32, drop=-0.4 * CALF_UP, neck_base=0.45, head_base=0.25), None, (-0.45, 0.42, 0.6))),
    (0.90, fold_legs(dict(still, drop=0.04 * s, pitch_base=0.04), (0.02, 0.0, a3_rest('FL')), (0.04, 0.0, a3_rest('HL')))),
    (1.0, dict(still)),
]
calf_fn = gp_path(calf_keys, lambda t: {'tail_lift': 0.9 * math.sin(math.pi * min(1.0, max(0.0, (t - 0.2) / 0.7))),
                                        'ear_back': 0.25 * math.sin(math.pi * t), 'head_yaw': 0.25 * math.sin(TAU * t)})
bake('calf_play', None, 36, cyclic=True, pose_fn=calf_fn,
     note='veau qui gambade : bond puis ruade sur place (racine animée en hauteur) ; à jouer en boucle sur le veau (modèle réduit)')

# ---- tétée : le veau tend l'encolure, relève le museau vers le trayon, donne des coups de tête, queue qui frétille --
suck = dict(still, neck_base=0.10, head_base=-0.75, drop=0.03 * s)
suck['legs'] = {'FL': {'J3': (rig.legs['FL']['J'][3].y - 0.04 * s, rig.legs['FL']['J'][3].z), 'a3': a3_rest('FL'), 'phi': 0.0, 'bend': 1, 'splay': 0.06},
                'FR': {'J3': (rig.legs['FR']['J'][3].y - 0.04 * s, rig.legs['FR']['J'][3].z), 'a3': a3_rest('FR'), 'phi': 0.0, 'bend': 1, 'splay': 0.06}}
_mz, _, _, _mc = muzzle_eval(suck)
SUCK_Z = round(max(p.z for p in [_mc]), 3)
bake('suckle', suck, 60, lambda t: dict(head=-0.10 * max(0.0, math.sin(TAU * 2 * t)) ** 2, neck=0.05 * max(0.0, math.sin(TAU * 2 * t)) ** 2,
                                       jaw=0.05 + 0.04 * math.sin(TAU * 6 * t), tail_yaw=0.35 * math.sin(TAU * 6 * t), ear_back=0.15),
     note=f'tétée (veau) : museau relevé à {SUCK_Z:.2f} m à l’échelle 1 (le jeu réduit le veau pour atteindre le trayon), coups de tête, queue qui frétille')

# ---- sol : un clip qui passe sous le sol (≤ 2 cm, poses repliées) est relevé image par image (translation de la racine)
ground_items = list(pawset) + [it for it in solid if it not in pawset]
R_root = arm.data.bones['root'].matrix_local.to_3x3()
report['groundFix'] = {}


def ground_fix(act, tol=0.002):
    K.clear_anim(arm)
    arm.animation_data.action = act
    fcs = {fc.array_index: fc for fc in act.fcurves if fc.data_path == 'pose.bones["root"].location'}
    worst = 0.0
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    for f in range(f0, f1 + 1):
        bpy.context.scene.frame_set(f)
        zs = K.Probe(None).z_of(ground_items)
        z = min(zs)
        if z < worst - 0.005:
            low = sorted(range(len(zs)), key=lambda i: zs[i])[:30]
            from collections import Counter
            print('GROUND LOW', act.name, f, round(z, 3), Counter(dom[ground_items[i][0]][ground_items[i][1]] for i in low).most_common(3))
        if z < -tol:
            dl = R_root.inverted() @ Vector((0, 0, -z + 0.001))
            for i in range(3):
                for kp in fcs[i].keyframe_points:
                    if abs(kp.co[0] - f) < 0.01:
                        kp.co[1] += dl[i]
                        kp.handle_left[1] += dl[i]
                        kp.handle_right[1] += dl[i]
            worst = min(worst, z)
    arm.animation_data.action = None
    if worst < 0:
        report['groundFix'][act.name] = round(-worst, 4)
        print('GROUND FIX', act.name, round(-worst, 4))


for act in list(bpy.data.actions):
    if not act.name.startswith('_') and act.name not in ('walk', 'trot', 'run'):
        ground_fix(act)

# ---- vérifications sur le maillage déformé --------------------------------------------------------------------------
report['clips'] = K.check_clips(arm, meshes, paws, muzzle)
for k, v in clip_meta.items():
    if k in report['clips']:
        report['clips'][k].update(v)
report['bonesList'] = [b.name for b in arm.data.bones]
PART_DESC = {'hornL': 'corne gauche (échelle 0 : sans cornes ; 1 : cornes du modèle ; allongée ≈ 2–2,5 le long de l’os : Highland)',
             'hornR': 'corne droite (idem)',
             'udder': 'mamelle (échelle 0,2 : taureau / veau ; 1 : vache laitière ; 1,2 : forte laitière ; vidée après la traite)',
             'earL': 'oreille gauche (os à part : le jeu peut l’agiter, la coucher)', 'earR': 'oreille droite'}
report['partBones'] = {b: d for b, d in PART_DESC.items() if b in B}
report['withers'] = K.WITHERS
report['eatMuzzle'] = round(EAT_Z, 3)
report['suckleMuzzle'] = SUCK_Z
pts_w = K.world_verts(meshes)
report['withersMeasured'] = round(K.measure_withers(meshes, (arm.matrix_world @ B[M['withers_bone']].head_local).y + M.get('withers_back', 0.0), 0.06)[0], 4)
K.export_glb(out, arm)
json.dump(report, open(report_path, 'w'), indent=1, ensure_ascii=False)
print('REPORT', report_path)
