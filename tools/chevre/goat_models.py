# Réglages de la chèvre du jeu : « Goat_White_01 » de la Microsoft Rocketbox Avatar Library (MIT, © 2020 Microsoft),
# avec les cornes de « Goat_Brown_01 » (même maillage, mêmes UV, mêmes os) en cible de forme.
# Sources : variable SRC = dossier Assets/Animals du dépôt Microsoft-Rocketbox (Goat_White_01/Export/Goat_White_01.fbx,
# Goat_Brown_01/Export/Goat_Brown_01.fbx) ; TEX = textures converties par prep_tex.py (PNG, normales OpenGL).
#
# Norme du GLB : chèvre tournée vers +Z, Y en haut, sabots à y = 0, garrot 0,75 m pour une chèvre laitière adulte, et
# les noms d'os communs aux animaux du jeu :
#   root (porte le corps : translation des clips), pelvis, spine1, spine2, chest, neck1, neck2, neck3, head, jaw,
#   eyeL/eyeR, earL/earR, hornL/hornR (le jeu les met à l'échelle : 0 = sans cornes, un bouchon referme le crâne),
#   beard (barbe), udder (mamelle), tail1,
#   scapL, humerusL, radiusL, metacarpusL, toesL (antérieur gauche ; R à droite),
#   femurL, tibiaL, metatarsusL, htoesL (postérieur gauche ; R à droite).
# L = gauche de la chèvre (+X dans Blender, avant = -Y).
import os, bpy, bmesh
from mathutils import Matrix, Vector
import sheepkit as K
from sheep_models import fix_weights  # (poids de l'aisselle et de la cuisse : même squelette Biped que le mouton)

SRC = os.environ.get('SRC', '')
TEX = os.environ.get('TEX', '')
MODELS = {}


def _rename(arm, old, new):
    arm.data.bones[old].name = new
    for m in [o for o in bpy.data.objects if o.type == 'MESH']:
        g = m.vertex_groups.get(old)
        if g is not None and m.vertex_groups.get(new) is None:
            g.name = new


def rename_bones(arm, names):
    tmp = {}
    for i, b in enumerate(list(arm.data.bones)):
        old = b.name
        if old in names and names[old] != old:
            t = f'__t{i}'
            _rename(arm, old, t)
            tmp[t] = names[old]
    for t, final in tmp.items():
        _rename(arm, t, final)


def uv_islands(ob):
    """Îlots UV (faces reliées par des arêtes dont les UV se suivent) : [(faces, sommets, anneau de couture)]."""
    bm = bmesh.new(); bm.from_mesh(ob.data); bm.faces.ensure_lookup_table()
    uvl = bm.loops.layers.uv.active
    key = lambda l: (round(l[uvl].uv.x, 5), round(l[uvl].uv.y, 5))
    parent = list(range(len(bm.faces)))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a
    for e in bm.edges:
        lf = e.link_loops
        if len(lf) != 2:
            continue
        l1, l2 = lf
        if key(l1) == key(l2.link_loop_next) and key(l1.link_loop_next) == key(l2):
            ra, rb = find(l1.face.index), find(l2.face.index)
            if ra != rb:
                parent[ra] = rb
    groups = {}
    for f in bm.faces:
        groups.setdefault(find(f.index), []).append(f.index)
    out = []
    for fl in groups.values():
        vs = sorted({v.index for fi in fl for v in bm.faces[fi].verts})
        out.append((fl, vs))
    owner = {}
    for k, (fl, vs) in enumerate(out):
        for v in vs:
            owner.setdefault(v, set()).add(k)
    res = []
    for k, (fl, vs) in enumerate(out):
        ring = [v for v in vs if len(owner[v]) > 1]
        res.append((fl, vs, ring))
    bm.free()
    return res


def add_part_bone(arm, mesh, name, parent, verts, ring, tip=None):
    """Os d'une pièce (corne, barbe, mamelle) : tête au centre de l'anneau de couture (sinon au plus proche du parent),
    queue au point le plus éloigné ; sommets de la pièce entièrement portés par lui, anneau laissé au parent. Le jeu met
    l'os à l'échelle (0 : pièce rentrée dans l'anneau)."""
    mw = mesh.matrix_world
    P = {i: mw @ mesh.data.vertices[i].co for i in verts}
    if ring:
        h = sum((P[i] for i in ring), Vector()) / len(ring)
    else:
        ph = arm.matrix_world @ arm.data.bones[parent].head_local
        h = min(P.values(), key=lambda p: (p - ph).length)
    t = tip if tip is not None else max(P.values(), key=lambda p: (p - h).length)
    K.select_only([arm])
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.data.edit_bones
    b = eb.new(name)
    inv = arm.matrix_world.inverted()
    b.head = inv @ h
    b.tail = inv @ t
    if (b.tail - b.head).length < 1e-3:
        b.tail = b.head + Vector((0, 0, 0.02))
    b.parent = eb[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    g = mesh.vertex_groups.get(name) or mesh.vertex_groups.new(name=name)
    ringset = set(ring)
    body = [i for i in verts if i not in ringset]
    for gr in mesh.vertex_groups:
        if gr.name != name:
            gr.remove(body)
    g.add(body, 1.0, 'REPLACE')
    print('PART', name, len(body), 'sommets ; anneau', len(ring), 'tête', tuple(round(x, 3) for x in h))
    return h


def cap_ring(mesh, part_faces, ring, group, bulge=0.004):
    """Bouche l'anneau de couture d'une corne par un éventail de triangles portés par l'os group, aux UV du crâne autour :
    caché dans la corne quand elle est là, il ferme le trou quand le jeu la rentre (saanen, chevreau)."""
    bm = bmesh.new(); bm.from_mesh(mesh.data)
    bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()
    uvl = bm.loops.layers.uv.active
    dl = bm.verts.layers.deform.verify()
    pf = set(part_faces)
    rs = set(ring)
    nb = {i: [] for i in ring}
    for e in bm.edges:
        a, b = e.verts[0].index, e.verts[1].index
        if a in rs and b in rs:
            fs = [f.index in pf for f in e.link_faces]
            if True in fs and False in fs:
                nb[a].append(b); nb[b].append(a)
    start = ring[0]
    loop = [start]
    prev = None
    while True:
        cur = loop[-1]
        nxt = [x for x in nb[cur] if x != prev and x not in loop[1:]]
        if not nxt or nxt[0] == start:
            break
        prev = cur
        loop.append(nxt[0])
        if len(loop) > len(ring):
            break
    if len(loop) < 3:
        print('CAP anneau introuvable', len(loop)); bm.free(); return
    V = [bm.verts[i] for i in loop]
    c = sum((v.co for v in V), Vector()) / len(V)
    uv = {}
    for v in V:
        for l in v.link_loops:
            if l.face.index not in pf:
                uv[v.index] = l[uvl].uv.copy(); break
    n = Vector()
    for k in range(len(V)):
        n += (V[k].co - c).cross(V[(k + 1) % len(V)].co - c)
    n.normalize()
    pc = sum((v.co for f in pf for v in bm.faces[f].verts), Vector()) / max(1, sum(len(bm.faces[f].verts) for f in pf))
    if n.dot(pc - c) < 0:
        V = V[::-1]; n = -n
    cv = bm.verts.new(c + n * bulge)
    gi = mesh.vertex_groups[group].index
    cv[dl][gi] = 1.0
    cuv = sum(uv.values(), Vector((0, 0))) / max(1, len(uv))
    for k in range(len(V)):
        f = bm.faces.new((V[k], V[(k + 1) % len(V)], cv))
        f.material_index = 0
        f.smooth = True
        for l in f.loops:
            l[uvl].uv = uv.get(l.vert.index, cuv) if l.vert is not cv else cuv
    bm.to_mesh(mesh.data); bm.free(); mesh.data.update()
    print('CAP', group, len(V), 'côtés')


def coat_material(mesh, color, normal):
    """Matière simple pour l'export glTF : photo du pelage + normales (le jeu la recolore)."""
    mat = bpy.data.materials.new('goat_coat')
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    o = nt.nodes.new('ShaderNodeOutputMaterial')
    p = nt.nodes.new('ShaderNodeBsdfPrincipled')
    p.inputs['Roughness'].default_value = 0.85
    p.inputs['Metallic'].default_value = 0.0
    nt.links.new(p.outputs[0], o.inputs[0])
    t = nt.nodes.new('ShaderNodeTexImage')
    t.image = bpy.data.images.load(color, check_existing=True)
    nt.links.new(t.outputs['Color'], p.inputs['Base Color'])
    tn = nt.nodes.new('ShaderNodeTexImage')
    tn.image = bpy.data.images.load(normal, check_existing=True)
    tn.image.colorspace_settings.name = 'Non-Color'
    nm = nt.nodes.new('ShaderNodeNormalMap')
    nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
    nt.links.new(nm.outputs['Normal'], p.inputs['Normal'])
    mesh.data.materials.clear()
    mesh.data.materials.append(mat)
    return mat


def goat_weights(arm, body, opts):
    """Poids propres à la chèvre, après fix_weights (aisselle et cuisse) :
    1. le bréchet entre les antérieurs (bande du milieu sous le poitrail, sous les coudes) suit le poitrail seul : ses
       sommets portaient un peu de l'avant-bras droit, leurs voisins de l'avant-bras gauche — au pas, l'arête entre eux
       s'étirait 3 fois quand les antérieurs partaient en sens contraire ;
    2. l'intérieur des cuisses autour de la mamelle suit le bassin plus que la jambe (arêtes mamelle/jambe étirées 3,6
       fois chez la chèvre couchée, 2 fois au galop) ;
    puis lissage laplacien des poids dans ces deux zones (l'écart se répartit sur plusieurs rangées d'arêtes)."""
    me = body.data
    mw = body.matrix_world
    B = arm.data.bones
    Pp = [mw @ v.co for v in me.vertices]
    n = len(Pp)
    gname = {g.index: g.name for g in body.vertex_groups}
    gidx = {v: k for k, v in gname.items()}
    W = [{gname[g.group]: g.weight for g in v.groups if g.weight > 0} for v in me.vertices]
    adj = [set() for _ in range(n)]
    for e in me.edges:
        a, b = e.vertices
        adj[a].add(b)
        adj[b].add(a)
    J = lambda nm: arm.matrix_world @ B[nm].head_local
    FRONT = ('humerus', 'radius', 'metacarpus', 'scap')
    HIND = ('femur', 'tibia', 'metatarsus')
    rep = {}
    # 1. bréchet
    o = opts['sternum']
    elbow_z = (J('radiusL').z + J('radiusR').z) / 2
    y0 = min(J('humerusL').y, J('humerusR').y) - o['dy0']
    y1 = max(J('radiusL').y, J('radiusR').y) + o['dy1']
    zone1 = []
    for i in range(n):
        p = Pp[i]
        if p.z > elbow_z + o['dz'] or not (y0 <= p.y <= y1) or abs(p.x) > 2 * o['x']:
            continue
        zone1.append(i)
        f = 1.0 - max(0.0, min(1.0, (abs(p.x) - 0.5 * o['x']) / (0.5 * o['x'])))
        if f <= 0:
            continue
        moved = sum(w for g, w in W[i].items() if g.startswith(FRONT)) * f
        if moved <= 0:
            continue
        for g in list(W[i]):
            if g.startswith(FRONT):
                W[i][g] *= 1 - f
        W[i]['chest'] = W[i].get('chest', 0) + moved
    # 2. intérieur des cuisses autour de la mamelle
    o2 = opts['udder']
    udder = {i for i in range(n) if W[i].get('udder', 0) > 0.9}
    ring = set(udder)
    for _ in range(o2['rings']):
        ring |= {j for i in ring for j in adj[i]}
    zone2 = [i for i in ring if i not in udder]
    for i in zone2:
        moved = 0.0
        for g in list(W[i]):
            if g.startswith(HIND):
                d = W[i][g] * o2['k']
                W[i][g] -= d
                moved += d
        if moved:
            W[i]['pelvis'] = W[i].get('pelvis', 0) + moved
    # 3. lissage
    for zone, iters, lam, keep in ((zone1, o['iters'], o['lam'], set()), (zone2, o2['iters'], o2['lam'], udder)):
        zs = set(zone)
        for _ in range(iters):
            NW = {}
            for i in zone:
                if i in keep or not adj[i]:
                    continue
                acc = {}
                for j in adj[i]:
                    for g, w in W[j].items():
                        acc[g] = acc.get(g, 0) + w / len(adj[i])
                NW[i] = {g: (1 - lam) * W[i].get(g, 0) + lam * acc.get(g, 0) for g in set(acc) | set(W[i])}
            for i, w in NW.items():
                W[i] = w
    rep = {'brechet': len(zone1), 'cuisses': len(zone2)}
    for i, v in enumerate(me.vertices):
        if i not in zone1 and i not in zone2:
            continue
        top = sorted(((g, w) for g, w in W[i].items() if w > 0.01 and g in gidx), key=lambda x: -x[1])[:4]
        tot = sum(w for _, w in top) or 1
        for gi in [g.group for g in v.groups]:
            body.vertex_groups[gi].remove([i])
        for g, w in top:
            body.vertex_groups[gidx[g]].add([i], w / tot, 'REPLACE')
    print('POIDS chèvre', rep)
    return rep


RB_NAMES = {
    'goat Pelvis': 'pelvis', 'goat Spine': 'spine1', 'goat Spine1': 'spine2', 'goat Spine2': 'chest',
    'goat Neck': 'neck1', 'goat Neck1': 'neck2', 'goat Neck2': 'neck3', 'goat Head': 'head',
    'goat Ear L': 'earL', 'goat Ear R': 'earR', 'goat Xtra Eye L': 'eyeL', 'goat Xtra Eye R': 'eyeR', 'goat Xtra Mouth': 'jaw',
    'goat Tail': 'tail1',
    **{f'goat {s} Clavicle': f'scap{s}' for s in 'LR'}, **{f'goat {s} UpperArm': f'humerus{s}' for s in 'LR'},
    **{f'goat {s} Forearm': f'radius{s}' for s in 'LR'}, **{f'goat {s} Hand': f'metacarpus{s}' for s in 'LR'},
    **{f'goat {s} Finger0': f'toes{s}' for s in 'LR'},
    **{f'goat {s} Thigh': f'femur{s}' for s in 'LR'}, **{f'goat {s} Calf': f'tibia{s}' for s in 'LR'},
    **{f'goat {s} Foot': f'metatarsus{s}' for s in 'LR'}, **{f'goat {s} Toe0': f'htoes{s}' for s in 'LR'},
}


def brown_horn_deltas(white_mesh):
    """Cornes de la chèvre brune (arquées vers l'arrière) : la brune est importée à côté, ses sommets comparés un à un à
    ceux de la blanche (même maillage, même ordre) ; renvoie {indice: écart} (seules les cornes diffèrent) et retire la
    brune de la scène."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=os.path.join(SRC, 'Goat_Brown_01', 'Export', 'Goat_Brown_01.fbx'), automatic_bone_orientation=False)
    new = [o for o in bpy.data.objects if o not in before]
    bmesh_obj = next(o for o in new if o.type == 'MESH')
    barm = next((o for o in new if o.type == 'ARMATURE'), None)
    keep = [o for o in new if o.type in ('MESH', 'ARMATURE')]
    mws = {o.name: o.matrix_world.copy() for o in keep}
    for o in keep:
        o.parent = None
        o.matrix_world = mws[o.name]
    K.apply_all(keep)
    W = [white_mesh.matrix_world @ v.co for v in white_mesh.data.vertices]
    Bv = [bmesh_obj.matrix_world @ v.co for v in bmesh_obj.data.vertices]
    if len(W) != len(Bv):
        raise RuntimeError(f'chèvre brune : {len(Bv)} sommets, blanche : {len(W)}')
    deltas = {i: Bv[i] - W[i] for i in range(len(W)) if (Bv[i] - W[i]).length > 1e-5}
    for o in new:
        bpy.data.objects.remove(o, do_unlink=True)
    for a in list(bpy.data.actions):
        if barm is not None and a.users == 0:
            bpy.data.actions.remove(a)
    print('CORNES BRUNES', len(deltas), 'sommets diffèrent, écart max', round(max((d.length for d in deltas.values()), default=0), 4))
    return deltas


def rocketbox_prep():
    K.load(os.path.join(SRC, 'Goat_White_01', 'Export', 'Goat_White_01.fbx'))
    for o in list(bpy.data.objects):
        if o.type == 'EMPTY':
            bpy.data.objects.remove(o, do_unlink=True)
    arm, meshes = K.clean()
    K.apply_all([arm] + meshes)
    mesh = meshes[0]
    mesh.name = 'goat'
    mesh.data.name = 'goat'
    arm.name = 'GoatArmature'
    arm.data.name = 'GoatArmature'
    rename_bones(arm, RB_NAMES)
    deltas = brown_horn_deltas(mesh)
    n0 = len(mesh.data.vertices)
    # pièces : cornes, barbe, mamelle (îlots UV) -> os à part (avant tout autre changement des groupes)
    isl = uv_islands(mesh)
    mw = mesh.matrix_world
    info = []
    for fl, vs, ring in isl:
        P = [mw @ mesh.data.vertices[i].co for i in vs]
        c = sum(P, Vector()) / len(P)
        info.append((fl, vs, ring, c, min(p.z for p in P), max(p.z for p in P)))
    headz = (arm.matrix_world @ arm.data.bones['head'].head_local).z
    horns = [x for x in info if x[4] > headz + 0.03 and len(x[1]) > 20 and x[5] - x[4] > 0.1 and abs(x[3].x) < 0.1]
    jaw_g = mesh.vertex_groups['jaw'].index
    beard = []
    for x in info:
        dom = [max(mesh.data.vertices[i].groups, key=lambda g: g.weight).group for i in x[1] if mesh.data.vertices[i].groups]
        if dom and sum(1 for d in dom if d == jaw_g) > 0.9 * len(dom) and x[5] - x[4] > 0.08:
            beard.append(x)
    pel = (arm.matrix_world @ arm.data.bones['pelvis'].head_local)
    udder = [x for x in info if len(x[0]) < 200 and x[3].y > 0.1 and x[5] < pel.z - 0.03 and abs(x[3].x) < 0.11 and x[4] > 0.2]
    print('PIÈCES cornes', len(horns), 'barbe', len(beard), 'mamelle', len(udder))
    horn_base = {}
    for x in horns:
        side = 'L' if x[3].x > 0 else 'R'
        horn_base[side] = add_part_bone(arm, mesh, 'horn' + side, 'head', x[1], x[2])
    # (bouchons sous les cornes, ajoutés après : ils créent des sommets à la fin, les indices restent valables)
    for x in sorted(horns, key=lambda x: -x[3].x):
        cap_ring(mesh, x[0], x[2], 'head')
    bv = sorted({v for x in beard for v in x[1]})
    if bv:
        P = [mw @ mesh.data.vertices[i].co for i in bv]
        top = max(P, key=lambda p: p.z)
        bot = min(P, key=lambda p: p.z)
        add_part_bone(arm, mesh, 'beard', 'jaw', bv, [i for i in bv if (mw @ mesh.data.vertices[i].co).z > top.z - 0.012],
                      tip=Vector((0, (top.y + bot.y) / 2, bot.z)))
    uv_ = sorted({v for x in udder for v in x[1]})
    ur = sorted({v for x in udder for v in x[2] if v not in {w for y in udder for w in y[1] if y is not x}})
    if uv_:
        P = [mw @ mesh.data.vertices[i].co for i in uv_]
        add_part_bone(arm, mesh, 'udder', 'pelvis', uv_, ur, tip=Vector((0, sum(p.y for p in P) / len(P), min(p.z for p in P))))
    # omoplates rattachées au poitrail (elles suivaient l'encolure : les épaules plongeaient quand la chèvre broute),
    # fémurs et queue au bassin ; racine ajoutée au centre du corps
    K.select_only([arm])
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.data.edit_bones
    for s in 'LR':
        eb['scap' + s].parent = eb['chest']
        eb['femur' + s].parent = eb['pelvis']
    eb['tail1'].parent = eb['pelvis']
    for b in eb:
        b.use_connect = False
    mid = (eb['pelvis'].head + eb['chest'].head) / 2
    r = eb.new('root')
    r.head = Vector((0, mid.y, mid.z))
    r.tail = r.head + Vector((0, 0, 0.1))
    eb['pelvis'].parent = r
    bpy.ops.object.mode_set(mode='OBJECT')
    for b in arm.data.bones:
        b.use_deform = b.name != 'root'
    coat_material(mesh, os.path.join(TEX, 'goat_color.png'), os.path.join(TEX, 'goat_normal_gl.png'))
    # cornes de la brune : cible de forme « horns_back » (0 = cornes droites de la blanche, 1 = arquées de la brune)
    if deltas:
        mesh.shape_key_add(name='Basis', from_mix=False)
        kb = mesh.shape_key_add(name='horns_back', from_mix=False)
        inv = mesh.matrix_world.inverted().to_3x3()
        for i, d in deltas.items():
            if i < n0:
                kb.data[i].co = kb.data[i].co + inv @ d
        mesh.data.update()
    return arm, [mesh]


MODELS['rocketbox'] = dict(
    prep=rocketbox_prep, withers=0.75, withers_bone='scapL', withers_dy=0.03, withers_xmax=0.08,
    legs={'FL': dict(joints=['humerusL', 'radiusL', 'metacarpusL', 'toesL'], scap='scapL'),
          'FR': dict(joints=['humerusR', 'radiusR', 'metacarpusR', 'toesR'], scap='scapR'),
          'HL': dict(joints=['femurL', 'tibiaL', 'metatarsusL', 'htoesL']),
          'HR': dict(joints=['femurR', 'tibiaR', 'metatarsusR', 'htoesR'])},
    neck=['neck1', 'neck2', 'neck3'], head=['head'], jaw=['jaw'], ears=['earL', 'earR'], tail=['tail1'],
    flex=[('spine1', 0.5), ('spine2', 0.5)], root='root',
    # (pièces que le jeu met à l'échelle : hors des mesures du sol — la mamelle pend sous le ventre de la chèvre couchée,
    # le jeu l'aplatit)
    parts=('hornL', 'hornR', 'beard', 'udder'),
    fix_weights=dict(
        avant=dict(above=0.03, below=0.012, r=0.16, up=0.14, down=0.06, mid=0.03, iters=10, lam=0.55, throat=0.75, throat_dz=0.07),
        arriere=dict(above=0.03, below=0.01, r=0.14, up=0.14, down=0.05, mid=-0.012, iters=10, lam=0.55),
        zones=[dict(bone='neck1', r=0.16, groups=('neck1', 'neck2', 'chest', 'humerusL', 'humerusR', 'scapL', 'scapR'), iters=8, lam=0.5),
               dict(bone='humerusL', r=0.09, groups=('neck1', 'chest', 'humerusL', 'scapL'), iters=8, lam=0.5),
               dict(bone='humerusR', r=0.09, groups=('neck1', 'chest', 'humerusR', 'scapR'), iters=8, lam=0.5)],
    ),
    goat_weights=dict(sternum=dict(x=0.035, dz=0.03, dy0=0.03, dy1=0.08, iters=8, lam=0.5),
                      udder=dict(rings=2, k=0.7, iters=6, lam=0.5)),
)
