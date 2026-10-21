# Prépare le mouton du jeu (tools/mouton/LISEZMOI.md) : nettoyage, orientation, échelle (garrot 0,70 m), poids de
# l'aisselle et de la cuisse, laine (masques, forme tondue), cornes en option, allures et gestes générés, sabots jamais
# sous le sol, vérifications sur le maillage déformé, export GLB brut.
# Usage : blender -b --factory-startup --disable-autoexec --python make_sheep.py -- <id> <sortie.glb> <rapport.json>
#         [--hook script.py] (mise au point : exécuté après le squelette et la laine, puis arrêt)
# Moteur des membres : sheep_gait.py (= tools/chien/dog_gait.py, allures du mouton) ; outils : sheepkit.py (= dogkit.py).
# Repère Blender : avant = -Y, haut = +Z, sol z = 0, gauche = +X ; le GLB exporté regarde vers +Z.
import bpy, sys, os, math, json, re
from mathutils import Vector, Matrix
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sheepkit as K
import sheep_gait as dg
import sheep_models as SM
import wool as WOOL
import horns as HORNS

argv = sys.argv[sys.argv.index('--') + 1:]
mid, out, report_path = argv[0], argv[1], argv[2]
opt = {argv[i]: argv[i + 1] for i in range(3, len(argv) - 1) if argv[i].startswith('--')}
M = SM.MODELS[mid]
arm, meshes = M['prep']()
B = arm.data.bones
report = {'id': mid, 'clips': {}, 'notes': []}
SKIP = re.compile(M.get('ground_skip', r'^(ear|eyes)'))

# ---- échelle : garrot (haut du dos juste derrière les omoplates) ; sabots au sol ; centré ----------------------
pts = K.world_verts(meshes)
wy = (arm.matrix_world @ B[M['withers_bone']].head_local).y + M.get('withers_dy', 0.07)
band = 0.04 * (max(p.y for p in pts) - min(p.y for p in pts))
wh, _ = K.measure_withers(meshes, wy, band, xmax=M.get('withers_xmax'))
f = M['withers'] / wh
print('WITHERS source', round(wh, 4), 'factor', round(f, 4))
K.transform_all(arm, meshes, Matrix.Scale(f, 4), loc_scale=f)
pts = K.world_verts(meshes)
cx = sum((arm.matrix_world @ B[L['joints'][0]].head_local).x for L in M['legs'].values()) / 4
off = Vector((-cx, -(min(p.y for p in pts) + max(p.y for p in pts)) / 2, -min(p.z for p in pts)))
K.transform_all(arm, meshes, Matrix.Translation(off))
report['scaleFactor'] = round(f, 4)
# poids de l'aisselle et de la cuisse (peau du poitrail et du flanc qui ne s'étire plus en rideau, voir sheep_models.py)
if M.get('fix_weights'):
    report['fixWeights'] = SM.fix_weights(arm, meshes[0], M['fix_weights'])
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
s = hipz / 0.58 * M.get('gait_scale', 1.0)
for lab in legs:
    legs[lab]['scap_gain'] = 0.6 / max(0.3, s) if legs[lab]['scap'] else 0.0
tail = M.get('tail', [])
tail_end = {}
for i, tname in enumerate(tail):
    tail_end[tname] = B[tail[i + 1]].head_local.copy() if i + 1 < len(tail) else B[tname].tail_local.copy()
sh = Vector((0, sum(legs[k]['points'][0].y for k in ('FL', 'FR')) / 2, sum(legs[k]['points'][0].z for k in ('FL', 'FR')) / 2))
hp = Vector((0, sum(legs[k]['points'][0].y for k in ('HL', 'HR')) / 2, hipz))
cfg = dict(legs=legs, neck=M['neck'], head=M['head'], tail=tail, tail_end=tail_end, ears=M.get('ears', []),
           jaw=[j for j in M.get('jaw', []) if j in B], flex=M.get('flex', []), pitch_pivot=(sh + hp) / 2, zmin_tail=0.02)
rig = dg.Rig(arm, cfg)
report['hipHeight'] = round(hipz, 4)
report['shoulderJoint'] = [round(sh.y, 4), round(sh.z, 4)]
print('HIP', round(hipz, 4), 'SHOULDER', sh, 's', round(s, 3))

# Sommets : museau, tronc, croupe, tout le maillage hors oreilles (sol)
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
    cand = [(i, mw @ v.co) for i, v in enumerate(m.data.vertices) if dom[m][i] in headset and not (dom[m][i] or '').startswith(('ear', 'eye'))]
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

# ---- laine : masques et forme tondue -------------------------------------------------------------------------
body = meshes[0]
wopt = dict(M.get('wool', {}))
wopt['thick'] = wopt.get('thick', 0.05) * M['withers'] / 0.70
wopt['leg_bones'] = {lab: ([L['scap']] if L.get('scap') else []) + L['joints'] for lab, L in M['legs'].items()}
wopt.setdefault('neck_chain', list(M['neck']) + list(M['head'][:1]))
legJ = {lab: legs[lab]['points'] for lab in legs}
report['wool'] = WOOL.build(arm, body, legJ, wopt)

# ---- cornes en option (nœud « horns » enfant de l'os de la tête) ----------------------------------------------
if M.get('horns'):
    hcfg = M['horns']
    hb = M['head'][0]
    hv = [(body.matrix_world @ v.co) for i, v in enumerate(body.data.vertices) if dom[body][i] in (hb,)]
    ear = B[M['ears'][0]].head_local if M.get('ears') else None
    yref = ear.y if ear is not None else sum(p.y for p in hv) / len(hv)
    top = [p for p in hv if abs(p.y - yref) < 0.05 * s]
    zt = max(p.z for p in top)
    hw = max(abs(p.x) for p in hv if p.z > zt - 0.06 * s)
    # (taille des cornes rapportée à la largeur du crâne : les têtes stylisées sont bien plus grosses)
    base = Vector((hcfg.get('x', 0.45) * hw, yref + hcfg.get('dy', 0.0) * hw, zt - hcfg.get('dz', 0.12) * hw))
    r0 = hcfg.get('r0_hw', 0.8) * hw
    R0 = hcfg.get('R0_hw', 0.34) * hw
    HORNS.make_horns(arm, hb, base, r0, R0, turns=hcfg.get('turns', 1.5))
    report['horns'] = dict(base=[round(v, 4) for v in base], r0=round(r0, 4), R0=round(R0, 4), headHalfWidth=round(hw, 4))
    print('HORNS demi-largeur du crâne', round(hw, 4), 'r0', round(r0, 4), 'R0', round(R0, 4))

# (mise au point : --hook script.py [--hook-at rig|lie] exécute le script à cet endroit puis s'arrête)
def hook(point):
    if opt.get('--hook') and opt.get('--hook-at', 'rig') == point:
        exec(open(opt['--hook']).read(), globals())
        sys.exit(0)


hook('rig')

still = dict(stride=0.0, duty=1.0, lift=0.0, phase={'HL': 0, 'FL': 0, 'HR': 0, 'FR': 0})


def breathe(t, k=1.0, n=3):
    return {'bob': 0.0025 * s * math.sin(math.tau * n * t) * k}


def bump(t, c, w):
    """Petit geste (0 → 1 → 0) centré en c, de demi-largeur w (temps de clip en fraction)."""
    d = abs(((t - c + 0.5) % 1.0) - 0.5)
    return dg.smooth(1 - d / w) if d < w else 0.0


def pose_lowest(pose, items):
    act = dg.bake(rig, '_low', None, 1, cyclic=False, pose_fn=lambda t: (pose, {}))
    arm.animation_data.action = act
    bpy.context.scene.frame_set(0)
    z = min(K.Probe(None).z_of(items))
    arm.animation_data.action = None
    bpy.data.actions.remove(act)
    return z


def lifted(pose, dz, dy=0.0):
    out = {'__body__': pose['__body__']}
    for k_, Mx in pose.items():
        if k_ != '__body__':
            M2 = Mx.copy()
            M2.translation = Mx.translation + Vector((0, dy, dz))
            out[k_] = M2
    return out


def a3_rest(lab):
    J = rig.legs[lab]['J']
    return math.atan2(J[2].z - J[3].z, J[2].y - J[3].y)


# ---- allures ----------------------------------------------------------------------------------------------------
G = dg.gaits(s, K.FPS)
torso_items = [(m, i) for m, i, _ in torso][::2]
speeds = {}
for name in ('walk', 'trot', 'run'):
    gp = dict(G[name])
    dg.bake(rig, name, gp, gp['frames'])
    speeds[name] = round(gp['speed'], 3)
report['naturalSpeeds'] = speeds

# ---- repos : respiration, regard, oreilles qui bougent, rumine debout ----------------------------------------------
dg.bake(rig, 'idle', dict(still, neck=0.02, neck_freq=1, head=0.015), 150, lambda t: dict(
    breathe(t, 1.0, 4), head_yaw=0.22 * math.sin(math.tau * t) * (1 - bump(t, 0.75, 0.2)), neck_yaw=0.08 * math.sin(math.tau * t),
    ear=0.30 * bump(t, 0.3, 0.06) - 0.2 * bump(t, 0.62, 0.05), ear_back=0.25 * bump(t, 0.45, 0.08),
    jaw=0.04 + 0.04 * math.sin(math.tau * 10 * t), jaw_yaw=0.05 * math.sin(math.tau * 10 * t + 1.2),
    tail_yaw=0.25 * bump(t, 0.85, 0.04) * math.sin(math.tau * 20 * t)))


# ---- brouter : antérieurs tendus, encolure au sol, bouche sur l'herbe, petits coups de tête pour arracher ------------
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
    P = [(pose[b] @ rig.rest[b].inverted() @ p) for b, p in mz_pts]
    zmin = min(p.z for p in P)
    c = sum(P, Vector()) / len(P)
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
                    # (bouche devant les sabots antérieurs, pas rentrée entre les pattes)
                    cost += 12.0 * max(0.0, my - y_max)
                if best is None or cost < best[0]:
                    best = (cost, gp, z, ha, na)
    print('HEAD SEARCH', round(zt, 4), 'z', round(best[2], 4), 'tête', round(best[3], 3), 'encolure', round(best[4], 3))
    return best[1]


front_tip_y = min(rig.legs[l]['neutral'].y for l in ('FL', 'FR'))
graze = head_search(front_planted(dict(still, pivot=hp.copy(), drop=0.01 * s), {'FL': -0.06 * s, 'FR': 0.02 * s}),
                    0.012 * s, 2.6, 1.75, ha_min=1.0, pitch_max=M.get('graze_pitch', 0.21), w_pt=1.0, y_max=front_tip_y - 0.10 * s)
report['grazeMuzzle'] = round(muzzle_eval(graze)[0], 4)
dg.bake(rig, 'graze', graze, 120, lambda t: {
    'head': 0.10 * max(0.0, math.sin(math.tau * 4 * t)) ** 6 - 0.03,
    'jaw': 0.08 + 0.08 * math.sin(math.tau * 8 * t), 'jaw_yaw': 0.04 * math.sin(math.tau * 8 * t + 1.0),
    'neck_yaw': 0.18 * math.sin(math.tau * t), 'head_yaw': 0.06 * math.sin(math.tau * t + 0.6),
    'ear': 0.2 * bump(t, 0.4, 0.05), 'tail_yaw': 0.2 * bump(t, 0.8, 0.04) * math.sin(math.tau * 16 * t)})

# ---- manger à l'auge ou au râtelier : bouche à ≈ 0,35 m (brebis de 0,70 m), mâche ----------------------------------
eat = head_search(front_planted(dict(still, pivot=hp.copy(), drop=0.006 * s)), M.get('eat_height', 0.35) * M['withers'] / 0.70,
                  2.0, 1.4, ha_min=0.6, pitch_max=0.06, y_max=front_tip_y - 0.12 * s)
report['eatMuzzle'] = round(muzzle_eval(eat)[0], 4)
dg.bake(rig, 'eat', eat, 90, lambda t: {
    'jaw': 0.07 + 0.07 * math.sin(math.tau * 9 * t), 'jaw_yaw': 0.05 * math.sin(math.tau * 9 * t + 1.0),
    'head': 0.05 * bump(t, 0.25, 0.08) + 0.05 * bump(t, 0.7, 0.08), 'neck_yaw': 0.06 * math.sin(math.tau * t),
    'ear': 0.15 * bump(t, 0.5, 0.05)})

# ---- bêler : tête levée, bouche ouverte (bêêê, la voix vibre), puis retour -----------------------------------------
def bleat_x(t):
    up = dg.smooth(t / 0.2) * (1 - dg.smooth((t - 0.78) / 0.22))
    mouth = dg.smooth((t - 0.18) / 0.1) * (1 - dg.smooth((t - 0.66) / 0.1))
    return {'neck': -0.55 * up, 'head': -0.45 * up, 'pitch': -0.03 * up,
            'jaw': mouth * (0.34 + 0.06 * math.sin(math.tau * 14 * t)), 'ear_back': 0.2 * up, 'ear': -0.15 * up,
            'bob': 0.004 * s * mouth * math.sin(math.tau * 14 * t)}


dg.bake(rig, 'bleat', dict(still), 54, bleat_x, cyclic=False)

# ---- couché sur le sternum : antérieurs repliés sous le poitrail (genoux devant), postérieurs repliés sous le ventre ----
torso_items = [(m, i) for m, i, _ in torso][::2]


def lie_gp(drop):
    gp = dict(still, drop=drop, pivot=hp.copy(), pitch_base=M.get('lie_pitch', 0.02), neck_base=M.get('lie_neck', -0.10), head_base=0.05,
              roll_base=M.get('lie_roll', 0.04))
    legsd = {}
    for lab in ('FL', 'FR'):
        R = rig.legs[lab]
        l1, l2, l3 = R['l2d'][:3]
        J0 = R['J'][0] - Vector((0, 0, drop))
        # coude juste au-dessus du sol derrière l'épaule, avant-bras à plat vers l'avant, genou (carpe) devant le
        # poitrail, canon replié en arrière sous l'avant-bras, onglons à plat vers l'arrière
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
        # (onglons à plat vers l'avant sous le ventre)
        legsd[lab] = {'J3': (hy - l3 * math.cos(a3), z3), 'a3': a3, 'phi': M.get('lie_htoe_phi', -1.15), 'splay': M.get('lie_splay', 0.30), 'bend': 'fwd'}
    gp['legs'] = legsd
    return gp


def lie_gp_loaf(drop):
    """Couché « en miche » (modèle stylisé aux pattes cylindriques) : toison posée au sol, pattes tendues d'un seul
    tenant rentrées sous elle (antérieurs vers l'arrière, postérieurs vers l'avant), sans pli aux genoux."""
    gp = dict(still, drop=drop, pivot=hp.copy(), pitch_base=M.get('lie_pitch', 0.0), neck_base=M.get('lie_neck', -0.05), head_base=0.05)
    legsd = {}
    for lab in rig.legs:
        R = rig.legs[lab]
        J0 = R['J'][0] - Vector((0, 0, drop))
        # (pattes presque à l'horizontale, à la hauteur de l'épaule / de la hanche : entièrement dans la toison)
        a = M.get('loaf_angle', -0.12)
        # (antérieurs : vers l'arrière, angle a sous l'horizontale ; postérieurs : vers l'avant)
        legsd[lab] = {'straight': a if lab[0] == 'F' else math.pi - a}
    gp['legs'] = legsd
    return gp


LOAF = M.get('lie_style') == 'loaf'
if LOAF:
    lie_gp = lie_gp_loaf
hook('lie')


# descente : le ventre (tronc) posé au sol
lo, hi = 0.0, belly + 0.05
for _ in range(10):
    mid_ = (lo + hi) / 2
    z = K.pose_probe(rig, lie_gp(mid_), torso_items)
    if z > 0.004:
        lo = mid_
    else:
        hi = mid_
lie_drop = lo
lie = lie_gp(lie_drop)
report['lieDrop'] = round(lie_drop, 4)
print('LIE drop', round(lie_drop, 4))
# couché calme (respire, regarde autour, oreilles) ; couché qui rumine (mâchoire qui broie de côté, bol qui remonte)
dg.bake(rig, 'lie', lie, 150, lambda t: dict(
    breathe(t, 0.8, 3), head_yaw=0.22 * math.sin(math.tau * t + 0.5), ear=0.2 * bump(t, 0.35, 0.05) - 0.15 * bump(t, 0.8, 0.05)))
dg.bake(rig, 'ruminate', lie, 150, lambda t: dict(
    breathe(t, 0.8, 3), head_yaw=0.08 * math.sin(math.tau * t + 0.5), ear=0.15 * bump(t, 0.55, 0.05),
    neck=-0.04 * bump(t, 0.1, 0.06), head=-0.05 * bump(t, 0.1, 0.06),
    jaw=0.05 + 0.05 * math.sin(math.tau * 15 * t), jaw_yaw=0.08 * math.sin(math.tau * 15 * t + 1.2)))

# ---- dormir : couché, menton posé au sol devant les genoux, respiration lente, oreilles tombantes --------------------
sleep = head_search(dict(lie), 0.035 * s, 2.8, 0.75, ha_min=-0.35, pitch=False, hb_min=-2.0)
dg.bake(rig, 'sleep', sleep, 150, lambda t: dict(breathe(t, 1.3, 2), ear_back=-0.15, ear=-0.25))

# ---- se coucher / se relever comme un ruminant : à genoux devant d'abord (en se couchant), arrière-train d'abord
# (en se relevant) ---------------------------------------------------------------------------------------------------
def kneel_gp():
    """À genoux devant : carpes au sol, canons à plat vers l'arrière, postérieurs debout ; corps basculé autour des
    hanches jusqu'à ce que l'épaule soit à la hauteur que permettent les avant-bras dressés."""
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


stand_p = dg.pose_at(rig, 0.0, dict(still))[0]
lie_p = dg.pose_at(rig, 0.0, lie)[0]
if not LOAF:
    kneel = kneel_gp()
    kneel_p = dg.pose_at(rig, 0.0, kneel)[0]


def seq(keys):
    def fn(t):
        for k in range(len(keys) - 1):
            t0, p0 = keys[k]
            t1, p1 = keys[k + 1]
            if t <= t1 + 1e-9:
                return dg.blend_local(rig, p0, p1, dg.smooth((t - t0) / (t1 - t0))), {}
        return keys[-1][1], {}
    return fn


# accroupi de l'arrière : avant toujours à genoux (mêmes appuis), hanches à mi-hauteur, postérieurs fléchis sabots
# posés (cinématique inverse des allures) — passage obligé entre « à genoux » et « couché » (sans lui, le mélange
# dépliait les postérieurs vers l'arrière)
if LOAF:
    # (modèle stylisé : il s'accroupit puis se pose, pattes rentrées sous la toison ; se relève d'un coup)
    squat_p = dg.pose_at(rig, 0.0, dict(still, drop=lie_drop * 0.35, neck_base=0.05))[0]
    dg.bake(rig, 'lie_down', None, 45, cyclic=False, pose_fn=seq([(0.0, stand_p), (0.4, squat_p), (1.0, lie_p)]))
    dg.bake(rig, 'get_up', None, 36, cyclic=False, pose_fn=seq([(0.0, lie_p), (0.55, squat_p), (1.0, stand_p)]))
else:
    half = dict(still, pivot=hp.copy(), pitch_base=kneel['pitch_base'] * M.get('half_pitch', 0.35), drop=lie_drop * M.get('half_drop', 0.55),
                neck_base=kneel['neck_base'] * 0.5, head_base=-0.03)
    half['legs'] = {lab: dict(kneel['legs'][lab]) for lab in ('FL', 'FR')}
    half_p = dg.pose_at(rig, 0.0, half)[0]
    dg.bake(rig, 'lie_down', None, 66, cyclic=False, pose_fn=seq([(0.0, stand_p), (0.38, kneel_p), (0.48, kneel_p), (0.74, half_p), (1.0, lie_p)]))
    # (en se relevant : l'arrière-train se lève d'abord, l'avant reste à genoux, puis les antérieurs se déplient)
    dg.bake(rig, 'get_up', None, 60, cyclic=False, pose_fn=seq([(0.0, lie_p), (0.22, half_p), (0.45, kneel_p), (0.55, kneel_p), (1.0, stand_p)]))


# ---- gambade (agneau) : bonds sur place pattes raides, corps qui se tord en l'air, ruade --------------------------
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
k_crouch = dg.pose_at(rig, 0.0, dict(still, drop=0.05 * s, neck_base=0.05))[0]
k_push = dg.pose_at(rig, 0.0, dict(still, drop=-0.01 * s, pitch_base=-0.06, neck_base=-0.15))[0]
k_air1 = dg.pose_at(rig, 0.0, legs_air(dict(still, yaw_base=0.22, roll_base=0.10, neck_base=-0.2, head_base=-0.1), 0.05, 0.10, -0.05, 0.12))[0]
k_air2 = dg.pose_at(rig, 0.0, legs_air(dict(still, yaw_base=-0.18, roll_base=-0.08, pitch_base=0.05, neck_base=0.05, head_base=0.15), 0.08, 0.06, -0.45, 0.30))[0]
k_land = dg.pose_at(rig, 0.0, dict(still, drop=0.04 * s, pitch_base=0.04, neck_base=0.1))[0]


def skip_pose(t):
    keys = [(0.0, k_crouch), (0.16, k_push), (0.42, k_air1), (0.66, k_air2), (0.84, k_land), (1.0, k_crouch)]
    p, _ = seq(keys)(t)
    h = 0.0
    if 0.16 < t < 0.84:
        u = (t - 0.16) / 0.68
        h = H_SKIP * 4 * u * (1 - u)
    return lifted(p, h), {}


dg.bake(rig, 'lamb_play', None, 21, cyclic=True, pose_fn=skip_pose)

# ---- saut sur place : élan, pattes repliées, réception (comme les chiens et les chèvres : la trajectoire — hauteur,
# avancée — est donnée par le jeu ; ≈ 0,4 m de haut conseillé pour une barrière) --------------------------------
H_JUMP = 0.0
j_crouch = dg.pose_at(rig, 0.0, dict(still, drop=0.07 * s, pitch_base=0.06, neck_base=0.05))[0]
j_take = dg.pose_at(rig, 0.0, legs_air(dict(still, pitch_base=-0.25, neck_base=-0.25, head_base=0.05), -0.10, 0.08, 0.30, 0.02))[0]
j_tuck = dg.pose_at(rig, 0.0, legs_air(dict(still, pitch_base=-0.05, neck_base=-0.1), 0.30, 0.45, -0.35, 0.40, a3f=2.4))[0]
j_reach = dg.pose_at(rig, 0.0, legs_air(dict(still, pitch_base=0.18, neck_base=0.05), 0.20, 0.05, -0.05, 0.35))[0]
j_land = dg.pose_at(rig, 0.0, dict(still, drop=0.06 * s, pitch_base=0.08, neck_base=0.1))[0]


def jump_pose(t):
    keys = [(0.0, stand_p), (0.22, j_crouch), (0.34, j_take), (0.55, j_tuck), (0.74, j_reach), (0.86, j_land), (1.0, stand_p)]
    p, _ = seq(keys)(t)
    h = 0.0
    if 0.30 < t < 0.80:
        u = (t - 0.30) / 0.50
        h = H_JUMP * 4 * u * (1 - u)
    return lifted(p, h), {}


dg.bake(rig, 'jump', None, 36, cyclic=False, pose_fn=jump_pose)


# ---- sabots jamais sous le sol : le corps est relevé image par image ---------------------------------------------
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
    st_ = {'idle': 2, 'lie': 2, 'ruminate': 2, 'sleep': 3}.get(act.name)
    if st_:
        decimate(act, st_)
report['clips'] = K.check_clips(arm, meshes, paws, muzzle)
report['transResidual'] = round(dg.STATS['transResidual'], 6)
print('TRANSLATIONS retirées (hors racine), au plus', round(dg.STATS['transResidual'] * 1000, 3), 'mm')
report['speedsNote'] = 'vitesses naturelles (m/s) : action.timeScale = vitesse / vitesse naturelle'
bpy.ops.wm.save_as_mainfile(filepath=out.replace('.glb', '.blend'), compress=True)
K.export_glb(out, arm)
json.dump(report, open(report_path, 'w'), indent=1)
