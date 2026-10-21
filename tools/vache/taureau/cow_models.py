# Réglages des vaches candidates : « Cow_Black_01 », « Cow_Brown_01 » et « Bull_Brown_01 » de la Microsoft Rocketbox
# Avatar Library (MIT, © 2020 Microsoft), même famille que les moutons et les chèvres du jeu.
# Sources : variable SRC = dossier Assets/Animals du dépôt Microsoft-Rocketbox ; TEX = textures converties par
# prep_tex.py (PNG, normales OpenGL).
#
# Norme du GLB : vache tournée vers +Z, Y en haut, sabots à y = 0, garrot 1,40 m (Prim'Holstein), noms d'os communs aux
# ruminants du jeu (ceux des moutons et des chèvres) :
#   root, pelvis, spine1, spine2, chest, neck1, neck2[, neck3], head, jaw, eyeL/eyeR, earL/earR, hornL/hornR (le jeu les
#   met à l'échelle : 0 = sans cornes, un bouchon referme le crâne), udder (mamelle ; scrotum chez le taureau),
#   tail1…tail5, scapL, humerusL, radiusL, metacarpusL, toesL (antérieur gauche ; R à droite), femurL, tibiaL,
#   metatarsusL, htoesL (postérieur gauche).
# L = gauche de la vache (+X dans Blender, avant = -Y). Les os « Finger01 » / « Toe01 » de Rocketbox (onglons) sont fondus
# dans toes / htoes (le sabot suit le paturon d'un seul tenant, comme la chèvre) ; « Xtra Helper » (base de l'encolure)
# est partagé entre le poitrail et l'encolure.
import os, bpy, bmesh, math
from mathutils import Matrix, Vector
import sheepkit as K
from sheep_models import fix_weights  # noqa: F401 (poids de l'aisselle et de la cuisse : même squelette Biped)
from goat_models import rename_bones, uv_islands, add_part_bone, cap_ring, goat_weights  # noqa: F401

SRC = os.environ.get('SRC', '')
TEX = os.environ.get('TEX', '')
MODELS = {}


def rb_names(p):
    p = p + ' '
    d = {p + 'Pelvis': 'pelvis', p + 'Spine': 'spine1', p + 'Spine1': 'spine2', p + 'Spine2': 'chest',
         p + 'Neck': 'neck1', p + 'Neck1': 'neck2', p + 'Neck2': 'neck3', p + 'Head': 'head',
         p + 'Ear L': 'earL', p + 'Ear R': 'earR', p + 'Xtra Eye L': 'eyeL', p + 'Xtra Eye R': 'eyeR',
         p + 'Xtra EyeL': 'eyeL', p + 'Xtra EyeR': 'eyeR', p + 'Xtra Mouth': 'jaw', p + 'Xtra mouth': 'jaw',
         p + 'Xtra Helper': 'xhelper',
         p + 'Tail': 'tail1', p + 'Tail1': 'tail2', p + 'Tail2': 'tail3', p + 'Tail3': 'tail4', p + 'Tail4': 'tail5'}
    for s in 'LR':
        d.update({p + f'{s} Clavicle': f'scap{s}', p + f'{s} UpperArm': f'humerus{s}', p + f'{s} Forearm': f'radius{s}',
                  p + f'{s} Hand': f'metacarpus{s}', p + f'{s} Finger0': f'toes{s}', p + f'{s} Finger01': f'hoof{s}',
                  p + f'{s} Thigh': f'femur{s}', p + f'{s} Calf': f'tibia{s}', p + f'{s} Foot': f'metatarsus{s}',
                  p + f'{s} Toe0': f'htoes{s}', p + f'{s} Toe01': f'hhoof{s}'})
    return d


def merge_bone(arm, mesh, src, dsts):
    """Fond l'os src : son poids va aux os dsts ({nom: part}), ses enfants passent à son parent, il est retiré."""
    g = mesh.vertex_groups.get(src)
    if g is not None:
        gi = g.index
        for v in mesh.data.vertices:
            w = next((x.weight for x in v.groups if x.group == gi), 0.0)
            if w <= 0:
                continue
            for d, frac in dsts.items():
                dg = mesh.vertex_groups.get(d) or mesh.vertex_groups.new(name=d)
                old = next((x.weight for x in v.groups if x.group == dg.index), 0.0)
                dg.add([v.index], old + w * frac, 'REPLACE')
        mesh.vertex_groups.remove(g)
    K.select_only([arm])
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.data.edit_bones
    if src in eb:
        b = eb[src]
        for c in list(b.children):
            c.parent = b.parent
        eb.remove(b)
    bpy.ops.object.mode_set(mode='OBJECT')


def boost_jaw(mesh, k=1.6, cap=0.9):
    """La mâchoire (« Xtra Mouth ») ne tient que la moitié des sommets de la lèvre et du menton : son poids est
    renforcé (× k, au plus cap) pour que la bouche s'ouvre franchement (meugler) et que la rumination se voie."""
    gj = mesh.vertex_groups.get('jaw')
    if gj is None:
        return 0
    gname = {g.index: g.name for g in mesh.vertex_groups}
    n = 0
    for v in mesh.data.vertices:
        W = {gname[x.group]: x.weight for x in v.groups if x.weight > 0}
        j = W.get('jaw', 0.0)
        if j <= 0:
            continue
        nj = min(cap, j * k)
        rest = sum(w for g, w in W.items() if g != 'jaw')
        f = (1 - nj) / rest if rest > 0 else 0
        for g, w in W.items():
            mesh.vertex_groups[g].add([v.index], nj if g == 'jaw' else w * f, 'REPLACE')
        n += 1
    print('MÂCHOIRE renforcée', n, 'sommets')
    return n


def coat_material(mesh, color, normal):
    """Matière simple pour l'export glTF : photo du pelage + normales (le jeu la recolore par race)."""
    mat = bpy.data.materials.new('cow_coat')
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


def find_horn_islands(arm, mesh):
    mw = mesh.matrix_world
    gname = {g.index: g.name for g in mesh.vertex_groups}
    headz = (arm.matrix_world @ arm.data.bones['head'].head_local).z
    out = []
    for fl, vs, ring in uv_islands(mesh):
        P = [mw @ mesh.data.vertices[i].co for i in vs]
        c = sum(P, Vector()) / len(P)
        dom = [gname[max(mesh.data.vertices[i].groups, key=lambda g: g.weight).group] for i in vs if mesh.data.vertices[i].groups]
        if 15 <= len(vs) <= 120 and c.z > headz + 0.05 and abs(c.x) > 0.06 and sum(1 for d in dom if d == 'head') > 0.9 * len(dom):
            out.append((fl, vs, ring, c, min(p.z for p in P), max(p.z for p in P)))
    return out


def subdivide_horns(arm, mesh, cuts):
    """Recoupe les cornes en long (chaque tronçon en cuts + 1) : 3 tronçons d'origine ne suffisent pas pour courber les
    longues cornes de la Highland (cible de forme horns_long). Triangles réunis en quadrilatères, arêtes en long coupées,
    puis retriangulés ; UV et poids interpolés."""
    for side in (1, -1):
        horns = [h for h in find_horn_islands(arm, mesh) if (h[3].x > 0) == (side > 0)]
        if not horns:
            continue
        fl, vs, ring = horns[0][:3]
        bm = bmesh.new(); bm.from_mesh(mesh.data)
        bm.faces.ensure_lookup_table(); bm.verts.ensure_lookup_table()
        faces = [bm.faces[i] for i in fl]
        hv = {bm.verts[i] for i in vs}
        rs = {bm.verts[i] for i in ring}
        bmesh.ops.join_triangles(bm, faces=faces, angle_face_threshold=math.radians(70), angle_shape_threshold=math.radians(70),
                                 cmp_seam=False, cmp_sharp=False, cmp_uvs=True, cmp_vcols=False, cmp_materials=True)
        # (faces de la corne après la fusion : celles dont tous les sommets sont de la corne)
        hf = {f for f in bm.faces if all(v in hv for v in f.verts)}
        # niveaux : distance (en arêtes de la corne) depuis l'anneau de couture
        lev = {v: 0 for v in rs}
        front = list(rs)
        while front:
            nxt = []
            for v in front:
                for e in v.link_edges:
                    o = e.other_vert(v)
                    if o in hv and o not in lev and any(f in hf for f in e.link_faces):
                        lev[o] = lev[v] + 1
                        nxt.append(o)
            front = nxt
        edges = [e for e in bm.edges if e.verts[0] in lev and e.verts[1] in lev and abs(lev[e.verts[0]] - lev[e.verts[1]]) == 1
                 and any(f in hf for f in e.link_faces) and all(len(f.verts) == 4 for f in e.link_faces if f in hf)]
        if edges:
            bmesh.ops.subdivide_edges(bm, edges=edges, cuts=cuts, use_grid_fill=True, smooth=0.0)
        print('CORNE recoupée', len(edges), 'arêtes en long ;', len(hf), 'faces')
        bm.faces.ensure_lookup_table()
        quads = [f for f in bm.faces if len(f.verts) > 3]
        if quads:
            bmesh.ops.triangulate(bm, faces=quads)
        bm.to_mesh(mesh.data); bm.free(); mesh.data.update()


def horn_long_key(arm, mesh, horn_sets, length=0.62):
    """Cible de forme « horns_long » : cornes de Highland / Retinta (en lyre : vers l'extérieur, un peu vers l'avant et le
    bas, puis relevées vers le haut et l'avant ; pointe effilée). Chaque sommet de la corne est repéré sur l'axe de la
    corne d'origine (abscisse u de la base à la pointe, décalage radial) et reporté sur la courbe ; l'anneau de couture
    (u = 0) ne bouge pas."""
    if not mesh.data.shape_keys:
        mesh.shape_key_add(name='Basis', from_mix=False)
    kb = mesh.shape_key_add(name='horns_long', from_mix=False)
    mw = mesh.matrix_world
    inv = mw.inverted()
    for side, (verts, ring) in horn_sets.items():
        sg = 1.0 if side == 'L' else -1.0
        P = {i: mw @ mesh.data.vertices[i].co for i in verts}
        base = sum((P[i] for i in ring), Vector()) / len(ring)
        tip = max(P.values(), key=lambda p: (p - base).length)
        ax = (tip - base)
        L0 = ax.length
        ax.normalize()
        # rayon de la base (moyenne des distances de l'anneau à l'axe)
        r0 = sum(((P[i] - base) - ax * (P[i] - base).dot(ax)).length for i in ring) / len(ring)

        # courbe cible (repère monde de la vache, avant = -Y) : départ dans l'axe d'origine, puis en lyre
        def C(u):
            s = u * length
            # vers l'extérieur d'abord, puis vers le haut et l'avant
            out = 0.80 * s - 0.22 * s * u
            up = -0.10 * s + 0.50 * s * u * u
            fwd = 0.10 * s * u + 0.22 * s * u * u
            return base + Vector((sg * out, -fwd, up)) + ax * min(s, 0.03) * (1 - u)

        def frame(u):
            du = 1e-3
            t = (C(min(1, u + du)) - C(max(0, u - du))).normalized()
            ref = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((0, 1, 0))
            n1 = t.cross(ref).normalized()
            n2 = t.cross(n1).normalized()
            return t, n1, n2
        # repère de la corne d'origine
        ref = Vector((0, 0, 1)) if abs(ax.z) < 0.9 else Vector((0, 1, 0))
        a1 = ax.cross(ref).normalized()
        a2 = ax.cross(a1).normalized()
        rs = set(ring)
        for i, p in P.items():
            if i in rs:
                continue
            d = p - base
            u = max(0.0, min(1.0, d.dot(ax) / L0))
            rad = d - ax * d.dot(ax)
            x1, x2 = rad.dot(a1), rad.dot(a2)
            rr = math.hypot(x1, x2)
            ang = math.atan2(x2, x1)
            # (rayon : celui de la base, effilé jusqu'à la pointe ; un peu plus épais à la base que la corne d'origine)
            rn = r0 * 1.35 * (1 - 0.88 * u ** 0.9) * (rr / max(1e-6, r0 * (1 - 0.8 * u))) if rr > 1e-6 else 0.0
            t, n1, n2 = frame(u)
            q = C(u) + (n1 * math.cos(ang) + n2 * math.sin(ang)) * min(rn, r0 * 1.5)
            kb.data[i].co = inv @ q
    mesh.data.update()
    print('CORNES longues : cible horns_long, longueur', length)


def rocketbox_prep(name, prefix, tex_prefix, part_udder='udder', horn_cuts=2, horn_long=0.62):
    K.load(os.path.join(SRC, name, 'Export', name + '.fbx'))
    for o in list(bpy.data.objects):
        if o.type == 'EMPTY':
            bpy.data.objects.remove(o, do_unlink=True)
    arm, meshes = K.clean()
    K.apply_all([arm] + meshes)
    mesh = meshes[0]
    mesh.name = 'cow'
    mesh.data.name = 'cow'
    arm.name = 'CowArmature'
    arm.data.name = 'CowArmature'
    rename_bones(arm, rb_names(prefix))
    # onglons fondus dans le paturon ; base de l'encolure partagée poitrail / encolure
    for s in 'LR':
        merge_bone(arm, mesh, 'hoof' + s, {'toes' + s: 1.0})
        merge_bone(arm, mesh, 'hhoof' + s, {'htoes' + s: 1.0})
    if 'xhelper' in arm.data.bones:
        merge_bone(arm, mesh, 'xhelper', {'chest': 0.5, 'neck1': 0.5})
    boost_jaw(mesh)
    if horn_cuts:
        subdivide_horns(arm, mesh, horn_cuts)
    # pièces : cornes, mamelle (îlots UV) -> os à part
    isl = uv_islands(mesh)
    mw = mesh.matrix_world
    info = []
    for fl, vs, ring in isl:
        P = [mw @ mesh.data.vertices[i].co for i in vs]
        c = sum(P, Vector()) / len(P)
        info.append((fl, vs, ring, c, min(p.z for p in P), max(p.z for p in P)))
    horns = find_horn_islands(arm, mesh)
    pel = (arm.matrix_world @ arm.data.bones['pelvis'].head_local)
    udder = [x for x in info if len(x[0]) < 200 and x[3].y > 0.1 and x[5] < pel.z - 0.03 and abs(x[3].x) < 0.11 and x[4] > 0.2]
    print('PIÈCES cornes', len(horns), part_udder, len(udder))
    horn_sets = {}
    for x in horns:
        side = 'L' if x[3].x > 0 else 'R'
        add_part_bone(arm, mesh, 'horn' + side, 'head', x[1], x[2])
        horn_sets[side] = (x[1], x[2])
    for x in sorted(horns, key=lambda x: -x[3].x):
        cap_ring(mesh, x[0], x[2], 'head')
    uv_ = sorted({v for x in udder for v in x[1]})
    ur = sorted({v for x in udder for v in x[2] if v not in {w for y in udder for w in y[1] if y is not x}})
    if uv_:
        P = [mw @ mesh.data.vertices[i].co for i in uv_]
        add_part_bone(arm, mesh, part_udder, 'pelvis', uv_, ur, tip=Vector((0, sum(p.y for p in P) / len(P), min(p.z for p in P))))
    # omoplates rattachées au poitrail, fémurs et queue au bassin ; racine au centre du corps
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
    coat_material(mesh, os.path.join(TEX, f'{tex_prefix}_color.png'), os.path.join(TEX, f'{tex_prefix}_normal_gl.png'))
    if horn_long and horn_sets:
        horn_long_key(arm, mesh, horn_sets, horn_long)
    return arm, [mesh]


def _model(name, prefix, tex, part='udder', neck=('neck1', 'neck2', 'neck3'), **kw):
    d = dict(
        prep=lambda: rocketbox_prep(name, prefix, tex, part, kw.get('horn_cuts', 2), kw.get('horn_long', 0.62)),
        source=name, withers=1.40, withers_bone='scapL', withers_dy=0.05, withers_xmax=0.15,
        legs={'FL': dict(joints=['humerusL', 'radiusL', 'metacarpusL', 'toesL'], scap='scapL'),
              'FR': dict(joints=['humerusR', 'radiusR', 'metacarpusR', 'toesR'], scap='scapR'),
              'HL': dict(joints=['femurL', 'tibiaL', 'metatarsusL', 'htoesL']),
              'HR': dict(joints=['femurR', 'tibiaR', 'metatarsusR', 'htoesR'])},
        neck=list(neck), head=['head'], jaw=['jaw'], ears=['earL', 'earR'], tail=['tail1', 'tail2', 'tail3', 'tail4', 'tail5'],
        flex=[('spine1', 0.5), ('spine2', 0.5)], root='root', part=part,
        parts=('hornL', 'hornR', part),
        # (réglages de fix_weights de la chèvre, distances × 1,8 : vache de 1,40 m au garrot, chèvre de 0,75 m)
        fix_weights=dict(
            avant=dict(above=0.054, below=0.022, r=0.29, up=0.25, down=0.11, mid=0.054, iters=10, lam=0.55, throat=0.75, throat_dz=0.13),
            arriere=dict(above=0.054, below=0.018, r=0.25, up=0.25, down=0.09, mid=-0.022, iters=10, lam=0.55),
            zones=[dict(bone='neck1', r=0.29, groups=('neck1', 'neck2', 'chest', 'humerusL', 'humerusR', 'scapL', 'scapR'), iters=8, lam=0.5),
                   dict(bone='humerusL', r=0.16, groups=('neck1', 'chest', 'humerusL', 'scapL'), iters=8, lam=0.5),
                   dict(bone='humerusR', r=0.16, groups=('neck1', 'chest', 'humerusR', 'scapR'), iters=8, lam=0.5)],
        ),
        goat_weights=dict(sternum=dict(x=0.063, dz=0.054, dy0=0.054, dy1=0.14, iters=8, lam=0.5),
                          udder=dict(rings=2, k=0.7, iters=6, lam=0.5) if part == 'udder' else dict(rings=3, k=0.9, iters=8, lam=0.5)),
    )
    d.update({k: v for k, v in kw.items() if k not in ('horn_cuts', 'horn_long')})
    return d


MODELS['rb_pie_noire'] = _model('Cow_Black_01', 'cow', 'cow_black')
MODELS['rb_pie_rouge'] = _model('Cow_Brown_01', 'cow', 'cow_brown')
# (taureau : bouche moins ouverte en meuglant — au-delà, la lèvre inférieure se détachait en languette)
MODELS['rb_taureau'] = _model('Bull_Brown_01', 'bull', 'bull_brown', part='scrotum', neck=('neck1', 'neck2'), withers=1.45, moo_jaw=0.17)
