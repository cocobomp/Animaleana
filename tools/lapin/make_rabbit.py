# Prépare un lapin du jeu (dakota : rabbit.glb ; fourthgreen : rabbit_lop.glb) : nettoyage, noms d'os communs,
# orientation, échelle (nez-croupe 0,35 m), allures et poses générées (rabbit_anim.py + rabbit_clips.py), corps relevé
# image par image (jamais sous le sol), vérifications sur le maillage déformé (pieds, glissement des appuis, os
# étirés), export GLB brut (compressé ensuite par pack.mjs, version réduite par lod.mjs).
# Usage : blender -b --factory-startup --disable-autoexec --python make_rabbit.py -- <id> <sortie.glb> <rapport.json> [clips,…]
import bpy, sys, os, math, json
from mathutils import Vector, Matrix
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rabbitkit as K
import rabbit_gait as dg
import rabbit_anim as RA
import rabbit_models as RM
import rabbit_clips as RC

a = sys.argv[sys.argv.index('--') + 1:]
mid, out, report_path = a[0], a[1], a[2]
only = a[3].split(',') if len(a) > 3 and a[3] else None
M = RM.MODELS[mid]
K.load(M['src'])
arm, meshes = M['prep']()
if M.get('autorig'):
    arm = M['autorig'](meshes)
report = {'id': mid, 'notes': [M.get('notes', '')], 'earRest': M.get('ear_rest', 'up'), 'source': M.get('notes', '')}
for old_name, new_name in M.get('materials', {}).items():
    if old_name in bpy.data.materials:
        bpy.data.materials[old_name].name = new_name


# ---- noms d'os communs (groupes de sommets et courbes des actions suivent) ------------------------------------
def fix_paths(old, new):
    for act in bpy.data.actions:
        for fc in act.fcurves:
            if ('["%s"]' % old) in fc.data_path:
                fc.data_path = fc.data_path.replace('["%s"]' % old, '["%s"]' % new)
        for g in act.groups:
            if g.name == old:
                g.name = new


def rename_all(mapping):
    mapping = {o: n for o, n in mapping.items() if o in arm.data.bones}
    for stage in (0, 1):
        for old, new in mapping.items():
            src = old if stage == 0 else '__t_' + new
            dst = '__t_' + new if stage == 0 else new
            arm.data.bones[src].name = dst
            for m in meshes:
                if src in m.vertex_groups:
                    m.vertex_groups[src].name = dst
            fix_paths(src, dst)
    print('RENAMED', len(mapping))


rename_all(M.get('rename', {}))
B = arm.data.bones

# ---- échelle : longueur nez-croupe (sommets du tronc, du cou et de la tête) -------------------------------------
LEGBONES = set()
for s in 'LR':
    for p in ('scap', 'humerus', 'radius', 'metacarpus', 'toes', 'femur', 'tibia', 'metatarsus', 'htoes', 'hip'):
        LEGBONES.add(p + s)
EARS = set(n for n, _ in M['earL'] + M['earR'])
TAIL = set(n for n, _ in M['tail'])


def body_y_extent():
    ys = []
    for m in meshes:
        dom = K.dominant_groups(m)
        mw = m.matrix_world
        for i, v in enumerate(m.data.vertices):
            g = dom[i]
            if g and g not in LEGBONES and g not in EARS and g not in TAIL:
                ys.append((mw @ v.co).y)
    ys.sort()
    return ys[int(len(ys) * 0.01)], ys[int(len(ys) * 0.995) - 1]


y0, y1 = body_y_extent()
f = K.LENGTH / (y1 - y0)
print('LENGTH source', y1 - y0, 'factor', f)
K.transform_all(arm, meshes, Matrix.Scale(f, 4), loc_scale=f)
y0, y1 = body_y_extent()
pts = K.world_verts(meshes)
cx = sum((arm.matrix_world @ B[n].head_local).x for n in ('humerusL', 'humerusR', 'femurL', 'femurR')) / 4
K.transform_all(arm, meshes, Matrix.Translation(Vector((-cx, -(y0 + y1) / 2, -min(p.z for p in pts)))))
report['tris'] = K.tris(meshes)
report['scale'] = round(f, 6)

# ---- clips d'origine -----------------------------------------------------------------------------------------------
kept = K.rename_actions(M.get('clips', {}))
print('KEPT', kept)
K.clear_anim(arm)


# ---- membres ---------------------------------------------------------------------------------------------------
def sole_info(bones):
    names = set()
    for b in bones:
        names.update(K.descendants(arm, b))
    P = []
    for m in meshes:
        dom = K.dominant_groups(m)
        mw = m.matrix_world
        P += [mw @ v.co for i, v in enumerate(m.data.vertices) if dom[i] in names]
    zmin = min(p.z for p in P)
    band = [p for p in P if p.z < zmin + 0.006]
    return P, zmin, min(p.y for p in band), max(p.y for p in band), sum(p.x for p in P) / len(P)


def point_of(spec):
    if isinstance(spec, str):
        return B[spec].head_local.copy()
    kind = spec[0]
    if kind == 'tail':
        return B[spec[1]].tail_local.copy()
    if kind == 'lerp':
        return point_of(spec[1]).lerp(point_of(spec[2]), spec[3])
    if kind == 'sole':
        P, zmin, tip, heel, x = sole_info(spec[1])
        return Vector((x, heel + (tip - heel) * spec[2], zmin + 0.006))
    raise ValueError(spec)


legs, paws = {}, {}
for s in 'LR':
    for kind in 'FH':
        L = M['legs'][s][kind]
        lab = kind + s
        P4 = [point_of(sp) for sp in L['points']]
        tip, heel_y, pv = K.sole_points(arm, meshes, L['paw'], P4[3])
        paws[lab] = pv
        legs[lab] = dict(points=P4 + [tip], drive=L['drive'], heel_y=heel_y, kind='front' if kind == 'F' else 'hind',
                         scap=L.get('scap'), c3=P4[3].z - tip.z)
        print('LEG', lab, [tuple(round(c, 3) for c in p) for p in P4 + [tip]], 'heel_y', round(heel_y, 3))

hipJ = (legs['HL']['points'][0] + legs['HR']['points'][0]) / 2
shJ = (legs['FL']['points'][0] + legs['FR']['points'][0]) / 2

# points témoins de la peau (contact au sol) : tout sauf les bouts de pattes
DISTAL = set(n for n in LEGBONES if n.startswith(('metacarpus', 'toes', 'metatarsus', 'htoes')))
probes = []
for m in meshes:
    dom = K.dominant_groups(m)
    mw = m.matrix_world
    cand = [(dom[i], mw @ v.co) for i, v in enumerate(m.data.vertices) if dom[i] and dom[i] not in DISTAL]
    step = max(1, len(cand) // 900)
    probes += cand[::step]
    # les plus bas de chaque os
    byb = {}
    for b, p in cand:
        byb.setdefault(b, []).append(p)
    for b, ps in byb.items():
        ps.sort(key=lambda p: p.z)
        probes += [(b, p) for p in ps[:6]]
print('PROBES', len(probes))

# peau pour les contacts au sol : tous les sommets, 4 os au plus par sommet (poids normalisés)
skin_pts, skin_idx, skin_w, skin_dom = [], [], [], []
order_tmp = []
def _walk(b):
    order_tmp.append(b.name)
    for c in b.children:
        _walk(c)
for b in arm.data.bones:
    if b.parent is None:
        _walk(b)
bindex = {n: i for i, n in enumerate(order_tmp)}
for m in meshes:
    gname = {g.index: g.name for g in m.vertex_groups}
    mw = m.matrix_world
    for v in m.data.vertices:
        gs = sorted(((g.weight, gname.get(g.group)) for g in v.groups if gname.get(g.group) in bindex and g.weight > 1e-4), reverse=True)[:4]
        if not gs:
            continue
        tot = sum(w for w, _ in gs)
        ids = [bindex[n] for _, n in gs] + [0] * (4 - len(gs))
        ws = [w / tot for w, _ in gs] + [0.0] * (4 - len(gs))
        skin_pts.append(tuple(mw @ v.co)); skin_idx.append(ids); skin_w.append(ws); skin_dom.append(gs[0][1])
paw_sets = {}
for lab, L in legs.items():  # sommets portés par l'avant-bras / la jambe, le métapode et les doigts
    names = set()
    for n, k in L['drive']:
        if k >= 1:
            names.update(K.descendants(arm, n))
    paw_sets[lab] = [i for i, d in enumerate(skin_dom) if d in names]
    print('PAW SET', lab, len(paw_sets[lab]))
paw_probes = None
cfg = dict(legs=legs, paw_probes=paw_probes, spine=M['spine'], neck=M['neck'], head=M['head'], earL=M['earL'], earR=M['earR'], tail=M['tail'],
           jaw=M.get('jaw', []), nose=M.get('nose', []), scap=M.get('scap', {}), pivot=(hipJ + shJ) / 2, probes=probes,
           twist=M.get('twist', []))
rab = RA.Rabbit(arm, cfg)
assert rab.rig.order == order_tmp
rab.set_skin(skin_pts, skin_idx, skin_w, paw_sets)
report['restHip'] = [round(hipJ.y, 4), round(hipJ.z, 4)]
report['restShoulder'] = [round(shJ.y, 4), round(shJ.z, 4)]
for lab in ('FL', 'HL'):
    report['leg_' + lab] = [round(x, 4) for x in rab.rig.legs[lab]['l2d']]

# museau (pour renifler / manger) : sommets les plus en avant de la tête
headset = set()
for h in cfg['head']:
    headset.update(K.descendants(arm, h))
headset -= EARS
muzzle = []
for m in meshes:
    dom = K.dominant_groups(m)
    mw = m.matrix_world
    cand = [(i, mw @ v.co) for i, v in enumerate(m.data.vertices) if dom[i] in headset]
    if cand:
        ys = sorted(p.y for _, p in cand)
        ymin = ys[int(len(ys) * 0.01)]
        muzzle += [(m, i) for i, p in cand if ymin <= p.y < ymin + 0.012]
mz_pts = [(K.dominant_groups(m)[i], m.matrix_world @ m.data.vertices[i].co) for m, i in muzzle]

ctx = dict(arm=arm, meshes=meshes, rab=rab, M=M, kept=kept, report=report, hipJ=hipJ, shJ=shJ, mz_pts=mz_pts, K=K, dg=dg, RA=RA)
RC.generate(ctx, only)

# ---- corps jamais sous le sol : relevé image par image (peau hors oreilles) -------------------------------------------
root = [b.name for b in arm.data.bones if b.parent is None][0]
solid = []
for m in meshes:
    dom = K.dominant_groups(m)
    ids = [i for i in range(len(m.data.vertices)) if dom[i] and dom[i] not in EARS]
    solid += [(m, i) for i in ids[::3]]
report['groundFix'] = {}
for act in bpy.data.actions:
    if act.name.startswith('_') or act.name == 'held':
        continue
    fix = K.ground_fix(arm, act, solid, root)
    if fix:
        report['groundFix'][act.name] = round(fix, 4)
        print('GROUND', act.name, 'relevé de', round(fix, 4))

report['clips'] = K.check_clips(arm, meshes, paws, muzzle, skip=())
# glissement des appuis aux vitesses naturelles, os étirés, écart résiduel de position des os (doit être nul)
report['slipCm'] = {}
for name in ('hop', 'lope', 'run'):
    if name in bpy.data.actions and name in report.get('naturalSpeeds', {}):
        report['slipCm'][name] = K.slip_check(arm, paws, bpy.data.actions[name], report['naturalSpeeds'][name])
        print('SLIP', name, report['slipCm'][name])
report['boneStretch'] = {a.name: K.bone_stretch(arm, a) for a in bpy.data.actions if not a.name.startswith('_')}
report['boneResidual'] = dict(dg.RESIDUAL)
print('STRETCH', report['boneStretch'])
report['speedsNote'] = 'vitesses naturelles (m/s) : action.timeScale = vitesse / vitesse naturelle'
bpy.ops.wm.save_as_mainfile(filepath=out.replace('.glb', '.blend'), compress=True)
K.export_glb(out, arm, def_bones=False)
json.dump(report, open(report_path, 'w'), indent=1)
