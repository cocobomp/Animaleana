# Mesures d'un mouton préparé (fichier .blend de make_sheep.py), sur le maillage déformé, clip par clip :
# - arêtes étirées (longueur / longueur au repos, la pire et où : os dominants de ses deux sommets) — c'est elle qui
#   montrait la « peau du poitrail en rideau jusqu'à l'avant-bras » et la cuisse étirée au galop ;
# - os étirés (écart des têtes d'os parent → enfant par rapport au repos, en %) ;
# - sabots sous le sol (plus bas sommet des onglons) ;
# - glissement des sabots posés (allures sur place : un sabot posé doit reculer à vitesse constante, celle de la
#   vitesse naturelle du clip ; écart moyen, en % de cette vitesse).
# Usage : blender -b --factory-startup <mouton.blend> --python measure.py -- <mesures.json> [clip,clip… | tous] [rapport de make_sheep.json]
import bpy, sys, json, math
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
out = argv[0]
only = set(argv[1].split(',')) if len(argv) > 1 and argv[1] != 'tous' else None
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
body = bpy.data.objects['sheep']
me0 = body.data
for kb in (me0.shape_keys.key_blocks if me0.shape_keys else []):
    kb.value = 0.0
groups = {g.index: g.name for g in body.vertex_groups}
dom = []
for v in me0.vertices:
    best = max(v.groups, key=lambda g: g.weight, default=None)
    dom.append(groups[best.group] if best else '')
rest = [v.co.copy() for v in me0.vertices]
edges = [(e.vertices[0], e.vertices[1]) for e in me0.edges]
rest_len = [(rest[a] - rest[b]).length for a, b in edges]


def cat_of(d):
    if d.startswith(('scap', 'humerus', 'radius', 'metacarpus', 'toes')):
        return 'avant'
    if d.startswith(('femur', 'tibia', 'metatarsus', 'htoes')):
        return 'arriere'
    if d.startswith(('head', 'jaw', 'ear', 'eyes')):
        return 'tete'
    return 'tronc'


# (catégorie d'une arête : membre avant, membre arrière, tête, tronc — la plus « membre » de ses deux sommets)
_rank = {'avant': 3, 'arriere': 3, 'tete': 2, 'tronc': 0}
cat = [max((cat_of(dom[a]), cat_of(dom[b])), key=lambda c: _rank[c]) for a, b in edges]
hoof = [i for i, d in enumerate(dom) if d.startswith(('toes', 'htoes'))]
hoof_of = {k: [i for i in hoof if dom[i] == k] for k in ('toesL', 'toesR', 'htoesL', 'htoesR')}
bones = arm.data.bones
pairs = [(b.parent.name, b.name) for b in bones if b.parent is not None and b.parent.name != 'root']
rest_d = {p: (bones[p[0]].head_local - bones[p[1]].head_local).length for p in pairs}
nat = {'walk': 0.769, 'trot': 2.119, 'run': 5.0}
if len(argv) > 2:
    # (vitesses naturelles du rapport de make_sheep.py)
    nat.update(json.load(open(argv[2]))['naturalSpeeds'])
scn = bpy.context.scene
fps = scn.render.fps
rep = {}
for act in bpy.data.actions:
    if act.name.startswith('_') or (only and act.name not in only):
        continue
    for pb in arm.pose.bones:
        pb.location = (0, 0, 0)
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.scale = (1, 1, 1)
    arm.animation_data.action = act
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    worst = (0.0, '', 0)
    cat_worst = {'avant': 0.0, 'arriere': 0.0, 'tete': 0.0, 'tronc': 0.0}
    n_bad = 0
    bone_worst = (0.0, '', 0)
    low = 1e9
    tracks = {k: [] for k in ('toesL', 'toesR', 'htoesL', 'htoesR')}
    for f in range(f0, f1 + 1):
        scn.frame_set(f)
        dg = bpy.context.evaluated_depsgraph_get()
        ev = body.evaluated_get(dg)
        me = ev.to_mesh()
        P = [ev.matrix_world @ v.co for v in me.vertices]
        ev.to_mesh_clear()
        for k, (a, b) in enumerate(edges):
            if rest_len[k] < 1e-4:
                continue
            r = (P[a] - P[b]).length / rest_len[k]
            if r > 1.6:
                n_bad += 1
            if r > worst[0]:
                worst = (r, f'{dom[a]}/{dom[b]}', f)
            c = cat[k]
            if r > cat_worst[c]:
                cat_worst[c] = r
        low = min(low, min(P[i].z for i in hoof))
        for p, c in pairs:
            hp = arm.matrix_world @ arm.pose.bones[p].head
            hc = arm.matrix_world @ arm.pose.bones[c].head
            s = abs((hp - hc).length / max(1e-6, rest_d[(p, c)]) - 1)
            if s > bone_worst[0]:
                bone_worst = (s, f'{p}→{c}', f)
        for k in tracks:
            ids = hoof_of[k]
            c = sum((P[i] for i in ids), Vector()) / len(ids)
            c.z = min(P[i].z for i in ids)
            tracks[k].append(c)
    r = {'edgeMax': round(worst[0], 2), 'edgeWhere': f'{worst[1]} (image {worst[2]})', 'edges>1.6': n_bad,
         'boneStretchPct': round(bone_worst[0] * 100, 2), 'boneWhere': f'{bone_worst[1]} (image {bone_worst[2]})',
         'hoofLowCm': round(low * 100, 2), 'edgeMaxBy': {k: round(v, 2) for k, v in cat_worst.items()}}
    if act.name in nat:
        # sabot posé : à moins de 6 mm de son plus bas ; vitesse de recul (-y en avant = l'avant est -Y dans Blender)
        slips = []
        for k, tr in tracks.items():
            zmin = min(p.z for p in tr)
            v = []
            for i in range(1, len(tr)):
                if tr[i].z < zmin + 0.006 and tr[i - 1].z < zmin + 0.006:
                    v.append((tr[i].y - tr[i - 1].y) * fps)
            if v:
                slips.append(sum(abs(x - nat[act.name]) for x in v) / len(v) / nat[act.name])
        r['slipPct'] = round(100 * max(slips), 1) if slips else None
    rep[act.name] = r
    print('MESURE', act.name, r)
json.dump(rep, open(out, 'w'), indent=1, ensure_ascii=False)
