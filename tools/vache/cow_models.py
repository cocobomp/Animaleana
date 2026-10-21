# Réglages des vaches candidates (Blender 4.2), repris de chevres/scripts/goat_models.py. Chaque prep() charge la source,
# la nettoie et rend une armature aux noms d'os COMMUNS (ceux des chèvres et des moutons du jeu), regard -Y (Blender),
# haut +Z :
#   root (porte le corps : translation des clips), pelvis, spine1, spine2, chest, neck1, neck2, neck3, head, jaw,
#   earL/earR, hornL/hornR (le jeu les met à l'échelle 0 pour une vache sans cornes, ≈ 2 en longueur pour la Highland),
#   udder (mamelle : 0,2 pour un taureau ou un veau), tail1…,
#   scapL, humerusL, radiusL, metacarpusL, toesL (antérieur gauche ; R à droite),
#   femurL, tibiaL, metatarsusL, htoesL (postérieur gauche ; R à droite).
import os, re, bpy, bmesh, math
from mathutils import Matrix, Vector
import cowkit as K

# (DL : dossier des sources téléchargées — oga_lyndon_cow/cowTM08New00RTime02.blend et oga_lyndon_cow/zip/cow/*.png pour
# la vache du jeu ; voir LISEZMOI.md)
DL = os.environ.get('DL', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'work', 'dl'))
MODELS = {}
LEGS = {'FL': dict(joints=['humerusL', 'radiusL', 'metacarpusL', 'toesL'], scap='scapL'),
        'FR': dict(joints=['humerusR', 'radiusR', 'metacarpusR', 'toesR'], scap='scapR'),
        'HL': dict(joints=['femurL', 'tibiaL', 'metatarsusL', 'htoesL']),
        'HR': dict(joints=['femurR', 'tibiaR', 'metatarsusR', 'htoesR'])}


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
    """Îlots UV (faces reliées par des arêtes dont les UV se suivent) : [(faces, sommets)]."""
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
    # sommets de chaque îlot partagés avec un autre îlot (couture : anneau à la base d'une corne, d'une barbe)
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
    """Os d'une pièce (corne, barbe, mamelle) : tête au centre de l'anneau de couture (sinon au plus proche du
    parent), queue au point le plus éloigné ; sommets de la pièce entièrement portés par lui, anneau laissé au parent.
    Le jeu met l'os à l'échelle (0 : pièce rentrée dans l'anneau)."""
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
    print('PART', name, len(body), 'sommets ; anneau', len(ring), 'tête', tuple(round(x, 3) for x in h), 'bout', tuple(round(x, 3) for x in t))


def cap_ring(mesh, part_faces, ring, group, bulge=0.004):
    """Bouche l'anneau de couture d'une pièce (base d'une corne) par un éventail de triangles portés par l'os group,
    avec les UV du crâne autour : caché dans la corne quand elle est là, il ferme le trou quand le jeu la rentre."""
    bm = bmesh.new(); bm.from_mesh(mesh.data)
    bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()
    uvl = bm.loops.layers.uv.active
    dl = bm.verts.layers.deform.verify()
    pf = set(part_faces)
    rs = set(ring)
    # arêtes du bord : entre deux sommets de l'anneau, portées par une face de la pièce et une face hors pièce
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
        if not nxt:
            break
        if nxt[0] == start:
            break
        prev = cur
        loop.append(nxt[0])
        if len(loop) > len(ring):
            break
    if len(loop) < 3:
        print('CAP anneau introuvable', len(loop)); bm.free(); return
    V = [bm.verts[i] for i in loop]
    c = sum((v.co for v in V), Vector()) / len(V)
    # UV du crâne aux sommets de l'anneau
    uv = {}
    for v in V:
        for l in v.link_loops:
            if l.face.index not in pf:
                uv[v.index] = l[uvl].uv.copy(); break
    n = Vector()
    for k in range(len(V)):
        n += (V[k].co - c).cross(V[(k + 1) % len(V)].co - c)
    n.normalize()
    # normale vers l'extérieur de la pièce (la corne part dans le sens où vont ses sommets)
    pc = sum((bm.verts[v.index].co for f in pf for v in bm.faces[f].verts), Vector()) / max(1, sum(len(bm.faces[f].verts) for f in pf))
    flip = n.dot(pc - c) < 0
    if flip:
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


def coat_material(mesh, color, normal=None, rough=0.82, name='cow_coat'):
    """Matière simple pour l'export glTF : couleur + normales (pelage : ni métal, rugosité fixe)."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    o = nt.nodes.new('ShaderNodeOutputMaterial')
    p = nt.nodes.new('ShaderNodeBsdfPrincipled')
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = 0.0
    nt.links.new(p.outputs[0], o.inputs[0])
    t = nt.nodes.new('ShaderNodeTexImage')
    t.image = bpy.data.images.load(color, check_existing=True)
    nt.links.new(t.outputs['Color'], p.inputs['Base Color'])
    if normal:
        tn = nt.nodes.new('ShaderNodeTexImage')
        tn.image = bpy.data.images.load(normal, check_existing=True)
        tn.image.colorspace_settings.name = 'Non-Color'
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], p.inputs['Normal'])
    mesh.data.materials.clear()
    mesh.data.materials.append(mat)
    return mat


def subdivide(mesh, levels=1):
    """Lissage Catmull-Clark appliqué au maillage riggé (poids et UV interpolés) : silhouette moins anguleuse."""
    K.select_only([mesh])
    mods = list(mesh.modifiers)
    sub = mesh.modifiers.new('Subdiv', 'SUBSURF')
    sub.levels = levels
    sub.render_levels = levels
    sub.uv_smooth = 'PRESERVE_BOUNDARIES'
    sub.boundary_smooth = 'PRESERVE_CORNERS'
    while mesh.modifiers[0] != sub:
        bpy.ops.object.modifier_move_up(modifier=sub.name)
    bpy.ops.object.modifier_apply(modifier=sub.name)
    print('SUBDIV', levels, len(mesh.data.vertices), 'sommets', sum(len(p.vertices) - 2 for p in mesh.data.polygons), 'triangles')



def normalize_static(scale, rotz=0.0, weld=0.0, smooth=False):
    """Maillages d'un glTF statique réunis en un seul, transformations appliquées, mis à l'échelle (scale), centrés en
    x/y, posés au sol."""
    import math
    for o in list(bpy.data.objects):
        if o.type != 'MESH' or (o.users_collection and o.users_collection[0].name == 'glTF_not_exported'):
            if o.type != 'MESH':
                continue
            bpy.data.objects.remove(o, do_unlink=True)
    ms = [o for o in bpy.data.objects if o.type == 'MESH']
    mw = {o.name: o.matrix_world.copy() for o in ms}
    for o in ms:
        o.parent = None
        o.matrix_world = mw[o.name]
    for o in list(bpy.data.objects):
        if o.type != 'MESH':
            bpy.data.objects.remove(o, do_unlink=True)
    M = Matrix.Scale(scale, 4) @ Matrix.Rotation(math.radians(rotz), 4, 'Z')
    for o in ms:
        o.matrix_world = M @ o.matrix_world
    bpy.context.view_layer.update()
    K.apply_all(ms)
    if len(ms) > 1:
        K.select_only(ms)
        bpy.ops.object.join()
    mesh = bpy.context.view_layer.objects.active if len(ms) > 1 else ms[0]
    pts = [v.co.copy() for v in mesh.data.vertices]
    off = Vector((-(min(p.x for p in pts) + max(p.x for p in pts)) / 2, -(min(p.y for p in pts) + max(p.y for p in pts)) / 2, -min(p.z for p in pts)))
    mesh.data.transform(Matrix.Translation(off))
    mesh.data.update()
    if weld:
        # (facettes exportées en triangles séparés : sommets soudés pour que la diffusion de chaleur trouve une
        # surface continue ; les faces restent plates, l'export glTF les redécoupe)
        bm = bmesh.new(); bm.from_mesh(mesh.data)
        n0 = len(bm.verts)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=weld)
        bm.to_mesh(mesh.data); bm.free(); mesh.data.update()
        if smooth:
            # (maillage lisse découpé aux coutures par l'export glTF : sommets soudés, normales lissées recalculées)
            K.select_only([mesh])
            try:
                bpy.ops.mesh.customdata_custom_splitnormals_clear()
            except Exception as e:
                print('WELD normales', e)
            for f in mesh.data.polygons:
                f.use_smooth = True
        else:
            for f in mesh.data.polygons:
                f.use_smooth = False
        print('WELD', n0, '->', len(mesh.data.vertices), 'sommets')
    mesh.name = 'cow'
    mesh.data.name = 'cow'
    return mesh


def prep_autorig(scale, J, opts, rotz=0.0, weld=0.0):
    def prep():
        import cow_autorig as AR
        mesh = normalize_static(scale, rotz, weld)
        arm = AR.build(mesh, J, opts)
        return arm, [mesh]
    return prep




def tex_material(name, color, normal=None, alpha_clip=False, rough=0.85):
    """Matière glTF : couleur (+ transparence découpée à 0,5 si alpha_clip : nœud « plus grand que » que l'exportateur
    traduit en alphaMode MASK) + normales."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    o = nt.nodes.new('ShaderNodeOutputMaterial')
    p = nt.nodes.new('ShaderNodeBsdfPrincipled')
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = 0.0
    nt.links.new(p.outputs[0], o.inputs[0])
    t = nt.nodes.new('ShaderNodeTexImage')
    t.image = bpy.data.images.load(color, check_existing=True)
    nt.links.new(t.outputs['Color'], p.inputs['Base Color'])
    if alpha_clip:
        m = nt.nodes.new('ShaderNodeMath')
        m.operation = 'GREATER_THAN'
        m.inputs[1].default_value = 0.5
        nt.links.new(t.outputs['Alpha'], m.inputs[0])
        nt.links.new(m.outputs[0], p.inputs['Alpha'])
        mat.blend_method = 'CLIP'
    if normal:
        tn = nt.nodes.new('ShaderNodeTexImage')
        tn.image = bpy.data.images.load(normal, check_existing=True)
        tn.image.colorspace_settings.name = 'Non-Color'
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], p.inputs['Normal'])
    return mat


def sj(J, k):
    """Repères lus en unités de la source (tracés de work/an) -> mètres (facteur k)."""
    return {n: tuple(c * k for c in v) for n, v in J.items()}


def sopts(o, k):
    out = {}
    for n, v in o.items():
        if isinstance(v, dict):
            out[n] = {a: (b * k if isinstance(b, (int, float)) else b) for a, b in v.items()}
        elif isinstance(v, (int, float)) and n not in ('heat_scales',):
            out[n] = v * k
        else:
            out[n] = v
    return out


# ------------------------------------------------------------------------------------------------ Lyndon Daniels (CC0)
# Vache pie rouge réaliste du pack « Realtime Ranchers » (le cheval du jeu vient du même pack) : 6 092 triangles, cornes,
# mamelle, dents et langue, textures peintes 2048 (couleur avec cils en transparence, normales). Les repères sont lus
# sur le maillage normalisé en unités de la source (garrot 5,85) ; k le ramène à 1,40 m.
LYN_K = 1.40 / 5.93  # (garrot mesuré sur le maillage : 5,93 unités)
LYN_J = {
    'root': (0, 0.9, 3.9),
    'pelvis': (0, 3.35, 4.85), 'spine1': (0, 2.1, 4.85), 'spine2': (0, 0.7, 4.8), 'chest': (0, -0.7, 4.75),
    'neck1': (0, -1.75, 4.75), 'neck2': (0, -2.35, 4.85), 'neck3': (0, -2.9, 5.0), 'head': (0, -3.35, 5.2),
    'muzzle': (0, -4.85, 4.2),
    'jaw0': (0, -3.7, 4.5), 'jaw1': (0, -4.6, 3.92),
    'scapL': (0.6, -1.3, 5.35),
    'FL0': (0.78, -2.2, 3.6), 'FL1': (0.8, -1.1, 2.75), 'FL2': (0.98, -1.22, 1.45), 'FL3': (1.08, -1.42, 0.42), 'FL4': (1.1, -1.97, 0.0),
    'HL0': (0.82, 2.95, 4.3), 'HL1': (0.92, 2.6, 2.8), 'HL2': (0.66, 4.0, 1.95), 'HL3': (0.63, 3.82, 0.42), 'HL4': (0.63, 3.27, 0.0),
    'tail0': (0, 4.45, 5.5), 'tail1': (0, 4.78, 5.0), 'tail2': (0, 4.8, 4.3), 'tail3': (0, 4.72, 3.5), 'tail4': (0, 4.68, 2.75),
    'tail5': (0, 4.58, 1.85), 'tail6': (0, 4.5, 1.55),
}
LYN_OPTS = dict(horn_z=5.6, horn_x0=0.42, horn_ymax=-3.45,
                ear=dict(x0=0.62, z0=5.15, z1=5.95, ymin=-3.5, ymax=-2.75),
                jaw=dict(ymax=-3.88, zmax=4.03, zmin=3.4, fade=0.2, zfade=0.06),
                udder=dict(y0=2.15, y1=3.65, ztop=2.75, zbot=2.05, zmin=1.85, xmax=0.47, fade=0.25),
                head_band=0.35)


def prep_lyndon():
    import cow_autorig as AR
    tex = os.path.join(DL, 'oga_lyndon_cow/zip/cow')
    mesh = normalize_static(LYN_K, 180.0)
    coat = tex_material('cow_coat', os.path.join(tex, 'colorOpacityCow.png'), os.path.join(tex, 'colorOpacityCowNorm.png'), alpha_clip=True)
    eye = tex_material('cow_eye', os.path.join(tex, 'cowEye.png'), rough=0.3)
    for i, m in enumerate(mesh.data.materials):
        mesh.data.materials[i] = eye if (m and m.name == 'Material') else coat
    arm = AR.build(mesh, sj(LYN_J, LYN_K), sopts(LYN_OPTS, LYN_K))
    return arm, [mesh]


MODELS['lyndon'] = dict(
    src=os.path.join(DL, 'oga_lyndon_cow/cowTM08New00RTime02.blend'),
    prep=prep_lyndon, fixed_scale=True, legs=LEGS,
    neck=['neck1', 'neck2', 'neck3'], head=['head'], tail=['tail1', 'tail2', 'tail3', 'tail4', 'tail5', 'tail6'],
    ears=['earL', 'earR'], jaw=['jaw'], flex=[('spine1', 0.5), ('spine2', 0.5)], withers_bone='scapL', withers_back=0.05,
)


# ------------------------------------------------------------------------------------------------ rocket95 (CC-BY 4.0)
# Prim'Holstein pie noire sculptée (ZBrush) et peinte (Substance Painter) : 11 630 triangles, petites cornes, oreilles,
# grosse mamelle, bouche entrouverte avec dents ; 3 textures 1024 (couleur, normales, rugosité/métal). Maillage découpé
# aux coutures par l'export : sommets soudés. Repères en unités de la source (garrot 1,80 ; la source regarde +Y,
# tournée de 180°).
ROCK_K = 1.40 / 1.848  # (garrot mesuré sur le maillage : 1,848 unité)
ROCK_J = {
    'root': (0, 0.3, 1.2),
    'pelvis': (0, 1.25, 1.45), 'spine1': (0, 0.65, 1.47), 'spine2': (0, 0.05, 1.47), 'chest': (0, -0.5, 1.45),
    'neck1': (0, -0.82, 1.47), 'neck2': (0, -0.95, 1.54), 'neck3': (0, -1.05, 1.62), 'head': (0, -1.12, 1.72),
    'muzzle': (0, -1.58, 1.45),
    'jaw0': (0, -1.22, 1.52), 'jaw1': (0, -1.48, 1.37),
    'scapL': (0.17, -0.5, 1.62),
    'FL0': (0.24, -0.64, 1.1), 'FL1': (0.24, -0.38, 0.84), 'FL2': (0.245, -0.41, 0.44), 'FL3': (0.25, -0.40, 0.11), 'FL4': (0.25, -0.555, 0.0),
    'HL0': (0.25, 1.12, 1.38), 'HL1': (0.3, 1.0, 0.94), 'HL2': (0.29, 1.45, 0.52), 'HL3': (0.315, 1.44, 0.1), 'HL4': (0.315, 1.31, 0.0),
    'tail0': (0, 1.42, 1.58), 'tail1': (0, 1.48, 1.4), 'tail2': (0, 1.49, 1.15), 'tail3': (0, 1.49, 0.9), 'tail4': (0, 1.48, 0.65),
    'tail5': (0, 1.47, 0.43), 'tail6': (0, 1.46, 0.37),
}
ROCK_OPTS = dict(horn_z=1.87, horn_x0=0.10, horn_ymin=-1.16, horn_ymax=-1.065,
                 ear=dict(x0=0.13, z0=1.78, z1=1.915, ymin=-1.05, ymax=-0.97),
                 jaw=dict(ymax=-1.33, zmax=1.415, zmin=1.2, fade=0.06, zfade=0.02),
                 udder=dict(y0=0.74, y1=1.06, ztop=0.93, zbot=0.62, zmin=0.55, xmax=0.17, fade=0.05),
                 head_band=0.1)


def prep_rocket():
    import cow_autorig as AR
    mesh = normalize_static(ROCK_K, 180.0, weld=0.0004, smooth=True)
    for m in mesh.data.materials:
        if m:
            m.name = 'cow_coat'
    arm = AR.build(mesh, sj(ROCK_J, ROCK_K), sopts(ROCK_OPTS, ROCK_K))
    return arm, [mesh]


MODELS['rocket'] = dict(
    src=os.path.join(DL, 'oj_rocket95/dfa314a5b6bb4ec6b3fdbdc2ab59cbad.glb'),
    prep=prep_rocket, fixed_scale=True, legs=LEGS,
    neck=['neck1', 'neck2', 'neck3'], head=['head'], tail=['tail1', 'tail2', 'tail3', 'tail4', 'tail5', 'tail6'],
    ears=['earL', 'earR'], jaw=['jaw'], flex=[('spine1', 0.5), ('spine2', 0.5)], withers_bone='scapL', withers_back=0.05,
)


def add_horns(mesh, base, out_len=0.20, up=0.08, fwd=0.06, r0=0.028, r1=0.004, rings=8, seg=10, color=(0.80, 0.74, 0.60)):
    """Cornes fabriquées (la source n'en a pas) : tube effilé courbé (vers l'extérieur, puis vers le haut et l'avant), sa
    base enfoncée dans le crâne, matière unie « cow_horn » — l'autorig en fait les os hornL / hornR (échelle 0 : sans
    cornes, comme le modèle d'origine)."""
    mat = bpy.data.materials.new('cow_horn')
    mat.use_nodes = True
    pr = mat.node_tree.nodes.get('Principled BSDF')
    pr.inputs['Base Color'].default_value = (*color, 1.0)
    pr.inputs['Roughness'].default_value = 0.45
    mesh.data.materials.append(mat)
    mi = len(mesh.data.materials) - 1
    bm = bmesh.new(); bm.from_mesh(mesh.data)
    for sgn in (1, -1):
        b = Vector((sgn * base[0], base[1], base[2]))
        pts = []
        for i in range(rings + 1):
            t = i / rings
            pts.append(b + Vector((sgn * out_len * t, -fwd * t * t, up * t * t)))
        loops = []
        for i, c in enumerate(pts):
            t = i / rings
            d = (pts[min(i + 1, rings)] - pts[max(i - 1, 0)]).normalized()
            a = d.orthogonal().normalized()
            bb = d.cross(a).normalized()
            r = r0 * (1 - t) + r1 * t
            loops.append([bm.verts.new(c + (a * math.cos(2 * math.pi * k / seg) + bb * math.sin(2 * math.pi * k / seg)) * r) for k in range(seg)])
        for i in range(rings):
            for k in range(seg):
                f = bm.faces.new((loops[i][k], loops[i][(k + 1) % seg], loops[i + 1][(k + 1) % seg], loops[i + 1][k]))
                f.material_index = mi; f.smooth = True
        tip = bm.verts.new(pts[-1] + (pts[-1] - pts[-2]).normalized() * r1)
        for k in range(seg):
            f = bm.faces.new((loops[-1][k], loops[-1][(k + 1) % seg], tip)); f.material_index = mi; f.smooth = True
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    uvl = bm.loops.layers.uv.active
    bm.to_mesh(mesh.data); bm.free(); mesh.data.update()
    print('HORNS ajoutées', len(mesh.data.vertices), 'sommets')


# ------------------------------------------------------------------------------------------------ Josué Boisvert (CC-BY 4.0)
# Vache pie rouge réaliste peu chargée (4 898 triangles, textures 1024 : couleur, normales et rugosité retouchées par
# Thunder) : mamelle à part, oreilles, sans cornes ni bouche ouverte ; la queue part en arrière (abaissée dans les clips).
# Cornes fabriquées ici (matière à part, os hornL / hornR). Repères en unités de la source (garrot 13,0).
JOS_K = 1.40 / 13.82  # (garrot mesuré sur le maillage : 13,82 unités)
JOS_J = {
    'root': (0, 1.5, 8.5),
    'pelvis': (0, 8.2, 10.9), 'spine1': (0, 3.8, 11.0), 'spine2': (0, -0.5, 11.0), 'chest': (0, -4.8, 10.8),
    'neck1': (0, -7.8, 11.0), 'neck2': (0, -8.9, 11.5), 'neck3': (0, -9.9, 12.0), 'head': (0, -10.9, 12.6),
    'muzzle': (0, -15.35, 9.9),
    'jaw0': (0, -12.0, 10.5), 'jaw1': (0, -14.2, 8.95),
    'scapL': (1.5, -5.0, 12.0),
    'FL0': (2.0, -6.5, 7.8), 'FL1': (2.1, -4.1, 5.3), 'FL2': (2.0, -4.5, 3.0), 'FL3': (1.95, -4.75, 0.95), 'FL4': (1.95, -5.45, 0.0),
    'HL0': (1.9, 8.6, 10.0), 'HL1': (2.1, 8.2, 6.8), 'HL2': (1.8, 10.2, 4.8), 'HL3': (1.8, 10.0, 0.9), 'HL4': (1.8, 9.42, 0.0),
    'tail0': (0, 10.1, 11.6), 'tail1': (0, 10.6, 10.3), 'tail2': (0, 11.0, 8.8), 'tail3': (0, 11.7, 7.6), 'tail4': (0, 12.6, 6.6),
    'tail5': (0, 13.6, 5.9), 'tail6': (0, 14.5, 5.4),
}
JOS_OPTS = dict(horn_mat='cow_horn',
                ear=dict(x0=1.05, z0=12.9, z1=14.3, ymin=-11.4, ymax=-9.9),
                jaw=dict(ymax=-12.8, zmax=9.45, zmin=8.5, fade=0.6, zfade=0.2),
                udder=dict(y0=5.2, y1=8.9, ztop=6.9, zbot=4.25, zmin=3.95, xmax=1.65, fade=0.35),
                head_band=0.9)


def prep_josue():
    import cow_autorig as AR
    mesh = normalize_static(JOS_K, 0.0, weld=0.0004, smooth=True)
    for m in mesh.data.materials:
        if m:
            m.name = 'cow_coat'
    # (base des cornes sous le haut du crâne, de part et d'autre de la nuque, devant les oreilles)
    add_horns(mesh, (0.62 * JOS_K, -11.75 * JOS_K, 13.75 * JOS_K), out_len=0.16, up=0.07, fwd=0.05, r0=0.024, r1=0.004)
    arm = AR.build(mesh, sj(JOS_J, JOS_K), sopts(JOS_OPTS, JOS_K))
    return arm, [mesh]


MODELS['josue'] = dict(
    src=os.path.join(DL, 'oj_josue/99d333e3b4e4470a8d7d38436489c001.glb'),
    prep=prep_josue, fixed_scale=True, legs=LEGS,
    neck=['neck1', 'neck2', 'neck3'], head=['head'], tail=['tail1', 'tail2', 'tail3', 'tail4', 'tail5', 'tail6'],
    ears=['earL', 'earR'], jaw=['jaw'], flex=[('spine1', 0.5), ('spine2', 0.5)], withers_bone='scapL', withers_back=0.05,
    tail_base={'tail1': -0.30, 'tail2': -0.25, 'tail3': -0.10},
)
