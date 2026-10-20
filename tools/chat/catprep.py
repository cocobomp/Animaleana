# Préparation commune des chats candidats (Blender 4.2, --background) : maillages de l'import remis au repos et
# figés (armatures d'origine retirées : tous les chats reçoivent le même squelette, voir cat_autorig.py),
# transformations appliquées, tri corps / yeux / accessoires, orientation (avant = -Y, haut = +Z), pattes au sol,
# centré, garrot à 0,25 m.
import bpy, bmesh, math, re
from mathutils import Vector, Matrix
import catkit as K


def static_meshes(drop=(), pose='POSE'):
    """Maillages exportables de l'import, figés tels que le fichier les montre (pose des nœuds du glTF, sans clip :
    pose='POSE' ; la pose de liaison des peaux, pose='REST', est parfois toute autre : bipède debout, chat couché sur le
    dos), sans parents ni armature. drop : motifs (regex) de noms d'objets ou de matières à jeter."""
    K.ensure_object_mode()
    for a in [o for o in bpy.data.objects if o.type == 'ARMATURE']:
        a.data.pose_position = pose
        if a.animation_data:
            a.animation_data.action = None
            for t in list(a.animation_data.nla_tracks):
                a.animation_data.nla_tracks.remove(t)
        # (les os gardent sinon la pose de la première image du clip importé : chat en pleine foulée)
        for pb in a.pose.bones:
            pb.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()
    meshes = [o for o in bpy.data.objects if o.type == 'MESH' and o.users_collection and
              o.users_collection[0].name != 'glTF_not_exported']
    rx = re.compile('|'.join(drop), re.I) if drop else None
    keep = []
    for o in meshes:
        mats = ' '.join(m.name for m in o.data.materials if m)
        if rx and (rx.search(o.name) or rx.search(mats)):
            continue
        keep.append(o)
    # clés de forme : on garde la forme de base
    for o in keep:
        if o.data.shape_keys:
            K.select_only([o])
            bpy.ops.object.shape_key_remove(all=True, apply_mix=False)
    # géométrie évaluée (armature au repos) -> maillage simple, transformation du monde appliquée
    K.select_only(keep)
    bpy.ops.object.convert(target='MESH')
    mw = {o.name: o.matrix_world.copy() for o in keep}
    for o in keep:
        o.parent = None
        o.matrix_world = mw[o.name]
    for o in list(bpy.data.objects):
        if o not in keep:
            bpy.data.objects.remove(o, do_unlink=True)
    # clips d'origine retirés : toutes les animations sont refaites pour le squelette commun
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    for o in keep:
        o.vertex_groups.clear()
        for m in list(o.modifiers):
            o.modifiers.remove(m)
    K.apply_all(keep)
    return keep


def classify(meshes, eye_rx=r'eye|iris|cornea|sclera|pupil'):
    """Corps (le plus gros), yeux (petites boules, ou nom/matière « eye »), le reste = accessoires."""
    rx = re.compile(eye_rx, re.I)
    body = max(meshes, key=lambda o: len(o.data.vertices))
    eyes, others = [], []
    bdim = max(body.dimensions)
    for o in meshes:
        if o is body:
            continue
        mats = ' '.join(m.name for m in o.data.materials if m)
        d = sorted(o.dimensions)
        ball = d[0] > 0.6 * d[2] and d[2] < 0.12 * bdim
        if rx.search(o.name) or rx.search(mats) or ball:
            eyes.append(o)
        else:
            others.append(o)
    return body, eyes, others


def join(objs, name):
    K.select_only(objs)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    return ob


def weld(ob, dist=1e-5):
    K.select_only([ob])
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=dist)
    bpy.ops.mesh.select_all(action='DESELECT')
    bpy.ops.object.mode_set(mode='OBJECT')


def orient(objs, body, yaw=None, flip=False):
    """Tourne l'ensemble pour que le chat regarde vers -Y (haut = +Z). yaw (degrés) forcé si donné ; sinon l'axe long
    de l'empreinte est trouvé, et la tête est le bout dont la bande haute est la plus large (la queue est fine).
    Renvoie un rapport."""
    pts = [body.matrix_world @ v.co for v in body.data.vertices]
    z0 = min(p.z for p in pts)
    H = max(p.z for p in pts) - z0
    rep = {}
    if yaw is None:
        cx = sum(p.x for p in pts) / len(pts)
        cy = sum(p.y for p in pts) / len(pts)
        # axe long : analyse en composantes principales de l'empreinte (x, y)
        sxx = sum((p.x - cx) ** 2 for p in pts) / len(pts)
        syy = sum((p.y - cy) ** 2 for p in pts) / len(pts)
        sxy = sum((p.x - cx) * (p.y - cy) for p in pts) / len(pts)
        ang = 0.5 * math.atan2(2 * sxy, sxx - syy)  # direction principale
        u = Vector((math.cos(ang), math.sin(ang), 0))
        w = Vector((-u.y, u.x, 0))
        s = [(p - Vector((cx, cy, 0))).dot(u) for p in pts]
        smin, smax = min(s), max(s)
        L = smax - smin
        top = [(si, (p - Vector((cx, cy, 0))).dot(w)) for si, p in zip(s, pts) if p.z > z0 + 0.6 * H]
        def width(lo, hi):
            ws = [t for si, t in top if lo <= si <= hi]
            return (max(ws) - min(ws)) if len(ws) > 3 else 0.0
        wa = width(smin, smin + 0.22 * L)
        wb = width(smax - 0.22 * L, smax)
        head_dir = -u if wa > wb else u  # bout de la tête
        rep.update(width_neg=round(wa, 4), width_pos=round(wb, 4))
        # rotation (autour de Z) qui amène head_dir sur -Y
        phi = math.atan2(head_dir.y, head_dir.x)
        R = Matrix.Rotation(-math.pi / 2 - phi, 4, 'Z')
    else:
        R = Matrix.Rotation(math.radians(yaw), 4, 'Z')
    if flip:
        R = Matrix.Rotation(math.pi, 4, 'Z') @ R
    for o in objs:
        o.matrix_world = R @ o.matrix_world
    K.apply_all(objs)
    rep['yaw_deg'] = round(math.degrees(R.to_euler().z), 1)
    return rep


def paws_and_withers(body):
    pts = [body.matrix_world @ v.co for v in body.data.vertices]
    z0 = min(p.z for p in pts)
    H = max(p.z for p in pts) - z0
    ymin = min(p.y for p in pts); ymax = max(p.y for p in pts)
    L = ymax - ymin
    low = [p for p in pts if p.z < z0 + 0.04 * H]
    ymid = (min(p.y for p in low) + max(p.y for p in low)) / 2
    xmid = (min(p.x for p in low) + max(p.x for p in low)) / 2
    paws = {}
    for lab, fx, fy in (('FL', 1, -1), ('FR', -1, -1), ('HL', 1, 1), ('HR', -1, 1)):
        sel = [p for p in low if (p.x > xmid) == (fx > 0) and (p.y > ymid) == (fy > 0)]
        if not sel:
            paws[lab] = None
            continue
        paws[lab] = Vector((sum(p.x for p in sel) / len(sel), sum(p.y for p in sel) / len(sel), z0))
    fy_ = sum(paws[k].y for k in ('FL', 'FR') if paws[k]) / max(1, sum(1 for k in ('FL', 'FR') if paws[k]))
    wy = fy_ + 0.05 * L
    band = [p.z for p in pts if abs(p.y - wy) < 0.03 * L and abs(p.x - xmid) < 0.25 * H]
    W = max(band) - z0
    return dict(paws=paws, W=W, H=H, L=L, z0=z0, xmid=xmid, wy=wy)


def normalize(objs, body, withers=None):
    """Pattes au sol, centré en x et en y, garrot à K.WITHERS. Renvoie les mesures."""
    withers = withers or K.WITHERS
    m = paws_and_withers(body)
    f = withers / m['W']
    pts = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
    cy = (min(p.y for p in pts) + max(p.y for p in pts)) / 2
    T = Matrix.Scale(f, 4) @ Matrix.Translation(Vector((-m['xmid'], -cy, -m['z0'])))
    for o in objs:
        o.matrix_world = T @ o.matrix_world
    K.apply_all(objs)
    m2 = paws_and_withers(body)
    m2['scale'] = f
    return m2


def decimate(ob, ratio):
    if ratio >= 0.999:
        return
    mod = ob.modifiers.new('Decimate', 'DECIMATE')
    mod.ratio = ratio
    mod.use_collapse_triangulate = True
    K.select_only([ob])
    bpy.ops.object.modifier_apply(modifier=mod.name)


def open_edges(ob):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    n = sum(1 for e in bm.edges if e.is_boundary)
    bm.free()
    return n
