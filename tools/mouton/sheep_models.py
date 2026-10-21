# Réglages du mouton du jeu : « Sheep_White_01 » de la Microsoft Rocketbox Avatar Library (MIT, © 2020 Microsoft).
# Sources : variable SRC = dossier Assets/Animals/Sheep_White_01 du dépôt Microsoft-Rocketbox (Export/Sheep_White_01.fbx,
# Textures/sheep_white_color.tga et sheep_white_bump.tga) ; TEX = textures converties par prep_tex.py (PNG, normales
# OpenGL : vert inversé).
#
# Norme du GLB : mouton tourné vers +Z, Y en haut, sabots à y = 0, garrot 0,70 m pour une brebis adulte, et les noms
# d'os des chiens du jeu :
#   root (porte le corps : translation des clips), pelvis, spine1, spine2, chest, neck1, neck2, head, jaw,
#   earL/earR (oreilles, comme les chèvres), eyes (si présent), tail1…tailN,
#   scapL, humerusL, radiusL, metacarpusL, toesL (antérieur gauche, toes = paturon et onglons ; R à droite),
#   femurL, tibiaL, metatarsusL, htoesL (postérieur gauche ; R à droite).
# L = gauche du mouton (+X dans Blender, avant = -Y).
import os, re, bpy, math
from mathutils import Matrix, Vector
import sheepkit as K

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.environ.get('SRC', os.path.join(HERE, 'src'))
TEX = os.environ.get('TEX', os.path.join(HERE, 'work', 'tex'))  # textures converties (PNG, normales OpenGL)
MODELS = {}


def rename_bones(arm, mapping):
    """Renomme les os en deux temps (Blender renomme aussi groupes de sommets et courbes ; un renommage direct pouvait
    produire des doublons)."""
    for b in arm.data.bones:
        if b.name in mapping:
            b.name = '__tmp__' + mapping[b.name]
    for b in arm.data.bones:
        if b.name.startswith('__tmp__'):
            b.name = b.name[7:]


def subdivide(ob, levels=1):
    """Subdivision de Catmull-Clark appliquée avant le squelette (poids des os interpolés) : silhouette plus ronde."""
    K.select_only([ob])
    mod = ob.modifiers.new('Subdiv', 'SUBSURF')
    mod.levels = levels
    mod.render_levels = levels
    mod.uv_smooth = 'PRESERVE_BOUNDARIES'
    mod.boundary_smooth = 'ALL'
    bpy.ops.object.modifier_move_to_index(modifier=mod.name, index=0)
    bpy.ops.object.modifier_apply(modifier=mod.name)


def make_material(name, color_img=None, normal_img=None, rough=0.85, base=(0.8, 0.8, 0.8, 1.0), flip_green=False):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    o = nt.nodes.new('ShaderNodeOutputMaterial')
    p = nt.nodes.new('ShaderNodeBsdfPrincipled')
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = 0.0
    p.inputs['Base Color'].default_value = base
    nt.links.new(p.outputs[0], o.inputs[0])
    if color_img:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = color_img
        nt.links.new(t.outputs['Color'], p.inputs['Base Color'])
    if normal_img:
        normal_img.colorspace_settings.name = 'Non-Color'
        tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = normal_img
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], p.inputs['Normal'])
    return mat


# ------------------------------------------------------------------------------------------------ Rocketbox
RB = SRC
RB_NAMES = {
    'sheep Pelvis': 'pelvis', 'sheep Spine': 'spine1', 'sheep Spine1': 'spine2', 'sheep Spine2': 'chest',
    'sheep Neck': 'neck1', 'sheep Neck1': 'neck2', 'sheep Head': 'head', 'sheep Xtra Mouth': 'jaw', 'sheep Xtra Eyes': 'eyes',
    'sheep Ear L': 'earL', 'sheep Ear R': 'earR', 'sheep Tail': 'tail1',
    **{f'sheep {s} Clavicle': f'scap{s}' for s in 'LR'}, **{f'sheep {s} UpperArm': f'humerus{s}' for s in 'LR'},
    **{f'sheep {s} Forearm': f'radius{s}' for s in 'LR'}, **{f'sheep {s} Hand': f'metacarpus{s}' for s in 'LR'},
    **{f'sheep {s} Finger0': f'toes{s}' for s in 'LR'},
    **{f'sheep {s} Thigh': f'femur{s}' for s in 'LR'}, **{f'sheep {s} Calf': f'tibia{s}' for s in 'LR'},
    **{f'sheep {s} Foot': f'metatarsus{s}' for s in 'LR'}, **{f'sheep {s} Toe0': f'htoes{s}' for s in 'LR'},
}


def rocketbox_prep():
    K.load(os.path.join(RB, 'Export', 'Sheep_White_01.fbx'))
    for ob in list(bpy.data.objects):
        if ob.type == 'EMPTY':
            bpy.data.objects.remove(ob, do_unlink=True)
    arm, meshes = K.clean()
    K.transform_all(arm, meshes, Matrix.Identity(4))
    arm.name = 'SheepArmature'
    arm.data.name = 'SheepArmature'
    body = meshes[0]
    body.name = 'sheep'
    body.data.name = 'sheep'
    rename_bones(arm, RB_NAMES)
    if int(os.environ.get('RB_SUBDIV', '0')):
        subdivide(body, int(os.environ['RB_SUBDIV']))
    # matière : photo de toison (2048) et carte de normales (« bump » de 3ds Max : normales tangentes, vert inversé)
    col = bpy.data.images.load(os.path.join(TEX, 'rb_color.png'))
    nrm = bpy.data.images.load(os.path.join(TEX, os.environ.get('RB_NORMAL', 'rb_normal_gl.png')))
    mat = make_material('sheep_wool', col, nrm, 0.9)
    body.data.materials.clear()
    body.data.materials.append(mat)
    # os : racine au centre de gravité au-dessus du bassin ; omoplates rattachées au poitrail (dans le squelette Biped
    # elles pendaient à l'encolure : baisser la tête pour brouter aurait emporté les épaules) ; base de l'encolure
    # replacée en haut du poitrail (le pivot Biped était au bas du sternum)
    K.select_only([arm])
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.data.edit_bones
    pel = eb['pelvis']
    r = eb.new('root')
    r.head = pel.head.copy()
    r.tail = pel.head + Vector((0, 0, 0.1))
    pel.parent = r
    for s in 'LR':
        eb['scap' + s].parent = eb['chest']
    n1 = eb['neck1']
    n2 = eb['neck2']
    hd = eb['head']
    base = Vector((0.0, eb['scapL'].head.y - 0.05, (eb['chest'].head.z + n2.head.z) / 2))
    n1.head = base
    n1.tail = n2.head.copy()
    bpy.ops.object.mode_set(mode='OBJECT')
    for b in arm.data.bones:
        b.use_deform = b.name != 'root'
    return arm, [body]


MODELS['rocketbox_blanc'] = dict(
    prep=rocketbox_prep, withers=0.70, withers_bone='scapL', withers_dy=0.07, withers_xmax=0.08,
    legs={'FL': dict(joints=['humerusL', 'radiusL', 'metacarpusL', 'toesL'], scap='scapL'),
          'FR': dict(joints=['humerusR', 'radiusR', 'metacarpusR', 'toesR'], scap='scapR'),
          'HL': dict(joints=['femurL', 'tibiaL', 'metatarsusL', 'htoesL']),
          'HR': dict(joints=['femurR', 'tibiaR', 'metatarsusR', 'htoesR'])},
    neck=['neck1', 'neck2'], head=['head'], jaw=['jaw'], ears=['earL', 'earR'], tail=['tail1'],
    flex=[('spine1', 0.35), ('spine2', 0.35), ('chest', 0.3)], root='root',
    game_bones=r'^(ear|tail|eyes)',
    wool=dict(thick=0.050, belly=0.6, neck=0.8, leg=0.45, tail=0.5),
    horns=dict(r0_hw=0.8, R0_hw=0.34, turns=1.45, x=0.40, dy=0.2, dz=0.2),
)


# ------------------------------------------------------------------------------------------------ poids de l'aisselle et de la cuisse
TRUNK = ('root', 'pelvis', 'spine1', 'spine2', 'chest', 'neck1')


def fix_weights(arm, body, opts):
    """Poids de peau autour du coude et du grasset (Rocketbox : la peau du poitrail entre les antérieurs touchait celle
    de l'avant-bras — une arête de 1,4 cm entre un sommet du poitrail tenu par « chest » et un sommet de l'avant-bras
    tenu par « radius » s'étirait jusqu'à 10 fois au galop : un rideau de peau du poitrail à l'avant-bras ; même chose
    entre le flanc et la jambe).
    1. Au-dessus de l'articulation (coude, grasset), la peau ne suit plus l'os du bas (avant-bras, jambe) : son poids va
       à l'os du haut (bras, cuisse).
    2. Dans une zone autour de l'articulation (bandeau du poitrail et de l'aisselle, de la cuisse et du flanc), les poids
       sont lissés le long du maillage (Laplacien, sommets du bas du membre tenus fixes) : l'écart entre le corps et le
       membre se répartit sur plusieurs rangées d'arêtes au lieu d'une seule.
    Renvoie un petit rapport (sommets touchés)."""
    me = body.data
    mw = body.matrix_world
    B = arm.data.bones
    P = [mw @ v.co for v in me.vertices]
    n = len(P)
    gname = {g.index: g.name for g in body.vertex_groups}
    gidx = {v: k for k, v in gname.items()}
    W = [{gname[g.group]: g.weight for g in v.groups if g.weight > 0} for v in me.vertices]
    adj = [set() for _ in range(n)]
    for e in me.edges:
        a, b = e.vertices
        adj[a].add(b)
        adj[b].add(a)
    rep = {}
    for side, sx in (('L', 1), ('R', -1)):
        for kind, upper, lower, low2 in (('avant', 'humerus', 'radius', 'metacarpus'), ('arriere', 'femur', 'tibia', 'metatarsus')):
            cfg = opts[kind]
            up, lo, lo2 = upper + side, lower + side, low2 + side
            J = arm.matrix_world @ B[lo].head_local
            # 1. peau au-dessus de l'articulation : l'os du bas cède son poids à l'os du haut (fondu sur cfg['above'])
            moved = 0
            for i in range(n):
                w = W[i].get(lo, 0)
                if w <= 0:
                    continue
                f = min(1.0, max(0.0, (P[i].z - J.z + cfg.get('below', 0.0)) / cfg['above']))
                if f > 0:
                    W[i][up] = W[i].get(up, 0) + w * f
                    W[i][lo] = w * (1 - f)
                    moved += 1
            Jtop = arm.matrix_world @ B[up].head_local
            # 1 bis. devant l'épaule (pointe de l'épaule, bas de l'encolure) : la peau suit le poitrail, plus le bras (la
            # gorge se déchirait quand la tête descend brouter ou dormir : arêtes encolure/bras étirées 5 fois)
            if cfg.get('throat'):
                for i in range(n):
                    w = W[i].get(up, 0)
                    if w > 0 and P[i].y < Jtop.y + cfg.get('throat_dy', 0.0) and P[i].z > Jtop.z - cfg['throat_dz']:
                        W[i]['chest'] = W[i].get('chest', 0) + w * cfg['throat']
                        W[i][up] = w * (1 - cfg['throat'])
            # 2. lissage dans la zone : de cfg['down'] sous l'articulation jusqu'à cfg['up'] au-dessus, à moins de cfg['r']
            # (en long) de l'articulation, du côté de ce membre (ou au milieu, sous le poitrail et entre les cuisses)
            zone = []
            fixed = [False] * n
            # (devant l'épaule — base de l'encolure, gorge — la peau suit l'encolure : hors de la zone, sinon le bras s'y
            # étalait et la gorge se déchirait quand la tête descend brouter)
            for i in range(n):
                p = P[i]
                if p.x * sx < -cfg['mid']:
                    continue
                if kind == 'avant' and (p.y < Jtop.y - 0.01 or max(W[i], key=W[i].get, default='') in ('neck1', 'neck2', 'head')):
                    continue
                if abs(p.y - J.y) > cfg['r'] or not (J.z - cfg['down'] <= p.z <= J.z + cfg['up']):
                    continue
                if not set(W[i]) & ({up, lo, lo2, 'scap' + side} | set(TRUNK)):
                    continue
                zone.append(i)
                # (bas du membre : tenu fixe, c'est l'appui du lissage)
                if p.z < J.z - cfg['down'] * 0.5 and max(W[i], key=W[i].get) in (lo, lo2):
                    fixed[i] = True
            for _ in range(cfg['iters']):
                NW = {}
                for i in zone:
                    if fixed[i] or not adj[i]:
                        continue
                    acc = {}
                    for j in adj[i]:
                        for g, w in W[j].items():
                            acc[g] = acc.get(g, 0) + w / len(adj[i])
                    lam = cfg['lam']
                    NW[i] = {g: (1 - lam) * W[i].get(g, 0) + lam * acc.get(g, 0) for g in set(acc) | set(W[i])}
                for i, w in NW.items():
                    W[i] = w
            rep[kind + side] = {'audessus': moved, 'zone': len(zone)}
    # 3. encolure : la gorge et le dessus de l'encolure (bord du poitrail, de l'épaule et de l'encolure) lissés autour de la
    # base de l'encolure — tête baissée pour brouter, une arête de 1 cm de la gorge, entre un sommet tenu à moitié par le
    # poitrail et son voisin tenu par l'encolure, s'étirait 5 fois
    for z in opts.get('zones', []):
        c = arm.matrix_world @ B[z['bone']].head_local
        grp = set(z['groups'])
        zone = [i for i in range(n) if (P[i] - c).length < z['r'] and max(W[i], key=W[i].get, default='') in grp]
        for _ in range(z['iters']):
            NW = {}
            for i in zone:
                if not adj[i]:
                    continue
                acc = {}
                for j in adj[i]:
                    for g, w in W[j].items():
                        acc[g] = acc.get(g, 0) + w / len(adj[i])
                lam = z['lam']
                NW[i] = {g: (1 - lam) * W[i].get(g, 0) + lam * acc.get(g, 0) for g in set(acc) | set(W[i])}
            for i, w in NW.items():
                W[i] = w
        rep['zone_' + z['bone']] = len(zone)
    # 4 os au plus par sommet, poids normalisés, écrits dans les groupes
    for i, v in enumerate(me.vertices):
        top = sorted(((g, w) for g, w in W[i].items() if w > 0.01 and g in gidx), key=lambda x: -x[1])[:4]
        tot = sum(w for _, w in top) or 1
        for gi in [g.group for g in v.groups]:
            body.vertex_groups[gi].remove([i])
        for g, w in top:
            body.vertex_groups[gidx[g]].add([i], w / tot, 'REPLACE')
    print('POIDS aisselle/cuisse', rep)
    return rep


MODELS['rocketbox_blanc']['fix_weights'] = dict(
    avant=dict(above=0.03, below=0.012, r=0.16, up=0.14, down=0.06, mid=0.03, iters=10, lam=0.55, throat=0.75, throat_dz=0.07),
    # (arrière : sans la bande du milieu entre les cuisses — un sommet du périnée qui prenait la jambe gauche s'étirait
    # dès que les postérieurs partaient en sens contraire, au trot)
    arriere=dict(above=0.03, below=0.01, r=0.14, up=0.14, down=0.05, mid=-0.012, iters=10, lam=0.55),
    zones=[dict(bone='neck1', r=0.16, groups=('neck1', 'neck2', 'chest', 'humerusL', 'humerusR', 'scapL', 'scapR'), iters=8, lam=0.5),
           dict(bone='humerusL', r=0.09, groups=('neck1', 'chest', 'humerusL', 'scapL'), iters=8, lam=0.5),
           dict(bone='humerusR', r=0.09, groups=('neck1', 'chest', 'humerusR', 'scapR'), iters=8, lam=0.5)],
)

