# Réglages des deux chiens du jeu (chemins des sources : variable SRC, voir build.sh).
#
# Les deux GLB suivent la même norme (voir LISEZMOI.md) : chien tourné vers +Z, Y en haut, pattes à y = 0,
# garrot 0,57 m (chien « de taille 1 », un labrador), et les MÊMES noms d'os pour ce que le jeu utilise :
#   root (porte le corps : translation des clips), pelvis, spine1, spine2, chest, neck1, neck2, head, jaw,
#   ear1L/ear2L, ear1R/ear2R (base et bout des oreilles), tail1…tailN,
#   scapL, humerusL, radiusL, metacarpusL, toesL (antérieur gauche ; R à droite),
#   femurL, tibiaL, metatarsusL, htoesL (postérieur gauche ; R à droite).
# Le shiba a en plus : tongue1…tongue6 (langue), eyeL/eyeR (globes), lidUL/lidDL/lidUR/lidDR (paupières :
# bases placées au centre de l'œil, le jeu les tourne pour cligner), breathe (respiration). Le jack : jaw et
# tongue1…tongue4 (langue modelée, voir jack_mouth), eyeL/eyeR.
import os, re, math, bpy
from mathutils import Matrix, Vector
import dogkit as K

SRC = os.environ.get('SRC', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sources'))
MODELS = {}


# ------------------------------------------------------------------------------------------------ shiba

# Os fusionnés dans leur parent (poids recopiés, os supprimés) : bouts d'os sans sommets, moustaches, doigts,
# os correcteurs, expressions du visage (sourcils, lèvres, narines), bourrelet du cou. (Ordre : du plus
# profond au moins profond, fait automatiquement.)
SHIBA_MERGE = r'_end_|whisker|[LR][FB]_(ring|pinkie|mid|index)_jnt|[LR][FB]_toes_jnt|corrective|brow|squint|upperlip|lower_lip|mouth_corner|nostril|nose_jnt|neck_fat'
# Paupières : les os de base sont à l'origine dans le fichier (repos) alors que les clips d'origine les placent au
# centre de l'œil : leurs sommets s'étiraient en lames dès qu'un clip les bougeait. On place leur repos au centre
# de l'œil (le jeu les tourne autour pour cligner).
SHIBA_LIDS = {'L_upper_lid_base_jnt': 'L_eye_jnt', 'L_lower_lid_base_jnt': 'L_eye_jnt',
              'R_upper_lid_base_jnt': 'R_eye_jnt', 'R_lower_lid_base_jnt': 'R_eye_jnt'}
SHIBA_NAMES = {
    'root': 'base', 'COG_jnt': 'root', 'pelvis_jnt': 'pelvis', 'spine_1_jnt': 'spine1', 'spine_2_jnt': 'spine2',
    'chest_jnt': 'chest', 'neck_base_jnt': 'neck1', 'neck_mid_jnt': 'neck2', 'head_jnt': 'head', 'jaw_jnt': 'jaw',
    'breathe_jnt': 'breathe',
    **{f'tongue_{i}_jnt': f'tongue{i}' for i in range(1, 7)},
    **{f'tail_{i}_jnt': f'tail{i}' for i in range(1, 8)},
    **{f'{s}_ear_base_jnt': f'ear1{s}' for s in 'LR'}, **{f'{s}_ear_tip_jnt': f'ear2{s}' for s in 'LR'},
    **{f'{s}_eye_jnt': f'eye{s}' for s in 'LR'},
    **{f'{s}_upper_lid_base_jnt': f'lidU{s}' for s in 'LR'}, **{f'{s}_upper_lid_jnt': f'lidU2{s}' for s in 'LR'},
    **{f'{s}_lower_lid_base_jnt': f'lidD{s}' for s in 'LR'}, **{f'{s}_lower_lid_jnt': f'lidD2{s}' for s in 'LR'},
    **{f'{s}_clavicle_jnt': f'scap{s}' for s in 'LR'}, **{f'{s}_shoulder_jnt': f'humerus{s}' for s in 'LR'},
    **{f'{s}_elbow_jnt': f'radius{s}' for s in 'LR'}, **{f'{s}_wrist_jnt': f'metacarpus{s}' for s in 'LR'},
    **{f'{s}_hand_jnt': f'toes{s}' for s in 'LR'},
    **{f'{s}_hip_jnt': f'femur{s}' for s in 'LR'}, **{f'{s}_knee_jnt': f'tibia{s}' for s in 'LR'},
    **{f'{s}_ankle_jnt': f'metatarsus{s}' for s in 'LR'}, **{f'{s}_foot_jnt': f'htoes{s}' for s in 'LR'},
}


def strip_suffix(name):
    """« head_jnt.40_038 » -> « head_jnt » (suffixes ajoutés par l'export d'origine)."""
    return re.sub(r'\.\d+_\d+$', '', name)


def merge_bones(arm, meshes, pattern):
    """Fusionne dans leur parent les os dont le nom (sans suffixe) correspond à pattern."""
    rx = re.compile(pattern)
    depth = lambda b: 0 if b.parent is None else 1 + depth(b.parent)
    victims = sorted([b.name for b in arm.data.bones if rx.search(b.name)], key=lambda n: -depth(arm.data.bones[n]))
    for name in victims:
        b = arm.data.bones[name]
        par = b.parent
        while par is not None and rx.search(par.name):
            par = par.parent
        if par is None:
            continue
        for m in meshes:
            g = m.vertex_groups.get(name)
            if g is None:
                continue
            pg = m.vertex_groups.get(par.name) or m.vertex_groups.new(name=par.name)
            gi = g.index
            moved = [(v.index, e.weight) for v in m.data.vertices for e in v.groups if e.group == gi and e.weight > 0]
            for vi, w in moved:
                pg.add([vi], w, 'ADD')
            m.vertex_groups.remove(g)
    K.select_only([arm])
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.data.edit_bones
    for name in victims:
        b = eb.get(name)
        if b is None:
            continue
        par = b.parent
        while par is not None and rx.search(par.name):
            par = par.parent
        for c in list(b.children):
            c.use_connect = False
            c.parent = par
        eb.remove(b)
    bpy.ops.object.mode_set(mode='OBJECT')
    for act in bpy.data.actions:
        for fc in list(act.fcurves):
            m = re.match(r'pose\.bones\["(.+)"\]', fc.data_path)
            if m and m.group(1) in victims:
                act.fcurves.remove(fc)
    print('MERGE', len(victims), 'os fusionnés ; reste', len(arm.data.bones))


def _rename(arm, old, new):
    """Renomme un os. Blender met lui-même à jour les groupes de sommets et les courbes des actions qu'il sait liées à
    l'armature (pistes NLA de l'import) ; on rattrape ce qui reste (actions non liées, groupes oubliés)."""
    arm.data.bones[old].name = new
    for act in bpy.data.actions:
        for fc in act.fcurves:
            m = re.match(r'pose\.bones\["(.+)"\](.*)', fc.data_path)
            if m and m.group(1) == old:
                fc.data_path = f'pose.bones["{new}"]{m.group(2)}'
    for m in [o for o in bpy.data.objects if o.type == 'MESH']:
        g = m.vertex_groups.get(old)
        if g is not None and m.vertex_groups.get(new) is None:
            g.name = new


def rename_bones(arm, names):
    """Renomme des os { ancien: nouveau } en deux temps (noms provisoires) : un nouveau nom peut être l'ancien nom
    d'un autre os (« root » -> « base », « COG_jnt » -> « root »)."""
    tmp = {}
    for i, b in enumerate(list(arm.data.bones)):
        old = b.name
        if old in names and names[old] != old:
            t = f'__t{i}'
            _rename(arm, old, t)
            tmp[t] = names[old]
    for t, final in tmp.items():
        _rename(arm, t, final)


def remove_whiskers(meshes):
    """Moustaches du shiba (longues lames noires portées par les os « whisker ») retirées : elles sortaient de la
    fourrure, du museau allongé ou raccourci des autres races, et piquaient sous la moindre lumière."""
    import bmesh
    for m in meshes:
        gi = {g.index for g in m.vertex_groups if 'whisker' in g.name}
        if not gi:
            continue
        kill = [v.index for v in m.data.vertices if v.groups and max(v.groups, key=lambda e: e.weight).group in gi]
        bm = bmesh.new()
        bm.from_mesh(m.data)
        bm.verts.ensure_lookup_table()
        bmesh.ops.delete(bm, geom=[bm.verts[i] for i in kill], context='VERTS')
        bm.to_mesh(m.data)
        bm.free()
        m.data.update()
        print('WHISKERS', len(kill), 'sommets retirés')


def prep_shiba():
    arm, meshes = K.clean()
    # noms sans suffixes (os, groupes de sommets, courbes des clips)
    names = {b.name: strip_suffix(b.name) for b in arm.data.bones}
    rename_bones(arm, names)
    remove_whiskers(meshes)
    # paupières : repos de la base au centre de l'œil, plus aucune clé (le jeu les anime)
    K.select_only([arm])
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.data.edit_bones
    for lid, eye in SHIBA_LIDS.items():
        b, e = eb[lid], eb[eye]
        d = b.tail - b.head
        b.head = e.head.copy()
        b.tail = e.head + d.normalized() * max(0.5, (e.tail - e.head).length)
    bpy.ops.object.mode_set(mode='OBJECT')
    for act in bpy.data.actions:
        for fc in list(act.fcurves):
            if '_lid_' in fc.data_path:
                act.fcurves.remove(fc)
    merge_bones(arm, meshes, SHIBA_MERGE)
    rename_bones(arm, SHIBA_NAMES)
    return arm, meshes


MODELS['shiba'] = dict(
    src=os.path.join(SRC, 'quander_shiba.glb'),
    prep=prep_shiba,
    withers_bone='chest', withers_dy=0.0,
    clips={'0|standing_0': 'idle', '0|sitting_0': 'sit', '0|shake_0': 'paw', '0|rollover_0': 'rollover'},
    legs={
        'FL': {'joints': ['humerusL', 'radiusL', 'metacarpusL', 'toesL'], 'scap': 'scapL'},
        'FR': {'joints': ['humerusR', 'radiusR', 'metacarpusR', 'toesR'], 'scap': 'scapR'},
        'HL': {'joints': ['femurL', 'tibiaL', 'metatarsusL', 'htoesL']},
        'HR': {'joints': ['femurR', 'tibiaR', 'metatarsusR', 'htoesR']},
    },
    root='root', neck=['neck1', 'neck2'], head=['head'], jaw=['jaw'], tongue=[f'tongue{i}' for i in range(1, 7)],
    tail=[f'tail{i}' for i in range(1, 8)], ears=['ear1L', 'ear1R'], ear_tips=['ear2L', 'ear2R'],
    flex=[('pelvis', -0.5), ('spine1', 0.25), ('spine2', 0.25)],
    # (queue enroulée du repos : celle du clip d'origine « standing » à sa première image)
    base_from=('idle', 0, ['tail']),
    # os animés par le jeu seulement (leurs clés sont retirées de tous les clips) : queue, oreilles, paupières
    game_bones=r'^(tail\d|ear[12][LR]|lid)',
    # gabarits (make_dog.py) : membres allongés des lévriers et du caniche (galgo 1,28, whippet 1,22, caniche 1,15),
    # courts des chiots (0,8 environ) — allures et poses refaites pour eux (clips « walk_long »…)
    gabarits={
        'long': dict(legs=1.25, legW=0.82, clips=['walk', 'trot', 'run', 'sit', 'paw', 'lie', 'sleep', 'sniff']),
        'court': dict(legs=0.82, legW=1.06, paws=1.2, clips=['walk', 'trot', 'run']),
    },
)


# ------------------------------------------------------------------------------------------------ jack

AUTO_LEGS = {
    'FL': {'joints': ['humerusL', 'radiusL', 'metacarpusL', 'toesL'], 'scap': 'scapL'},
    'FR': {'joints': ['humerusR', 'radiusR', 'metacarpusR', 'toesR'], 'scap': 'scapR'},
    'HL': {'joints': ['femurL', 'tibiaL', 'metatarsusL', 'htoesL']},
    'HR': {'joints': ['femurR', 'tibiaR', 'metatarsusR', 'htoesR']},
}


# Repères du squelette automatique du jack (fractions du garrot). La hanche est placée au milieu du haut de la
# cuisse (à 0,76 du garrot, à l'aplomb du pied, elle était contre la peau de la fesse : la cuisse se déchirait au
# saut et l'assis tournait autour d'un point de la peau) ; le grasset à l'avant de la cuisse.
# buttock_knee : la peau du grasset, déjà portée en partie par le tibia, ne passe pas du fémur au bassin.
JACK_RIG = {'elbow': 0.47, 'hock': 0.26, 'hip': 0.72, 'hip_dy': -0.117, 'stifle': 0.455, 'stifle_fwd': 0.121, 'buttock': 0.75,
            'buttock_knee': True}


def prep_jack():
    """Jack Russell statique : corps complet (le fichier le coupe en trois morceaux : Object_2, Object_3 et
    Object_4 ; Object_4 porte des bouts du visage, des lèvres, des paupières et du bas des postérieurs : sans lui,
    trous dans les pattes arrière et visage « déchiré »), soudé le long des coupes, normalisé (hauteur 1, pattes à
    z = 0), puis squelette et poids automatiques (autorig.py), yeux liés à la tête."""
    import autorig
    meshes = [o for o in bpy.data.objects if o.type == 'MESH' and o.users_collection and o.users_collection[0].name != 'glTF_not_exported']
    mw = {o.name: o.matrix_world.copy() for o in meshes}
    for o in meshes:
        o.parent = None
    for o in meshes:
        o.matrix_world = mw[o.name]
    for o in list(bpy.data.objects):
        if o not in meshes:
            bpy.data.objects.remove(o, do_unlink=True)
    K.apply_all(meshes)
    body = bpy.data.objects['Object_3']
    parts = [bpy.data.objects[n] for n in ('Object_2', 'Object_4')]
    K.select_only([body] + parts)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    eyes = bpy.data.objects['Object_5']
    keep = [body, eyes]
    pts = K.world_verts(keep)
    off = Vector((-(min(p.x for p in pts) + max(p.x for p in pts)) / 2, 0.0, -min(p.z for p in pts)))
    h = max(p.z for p in pts) - min(p.z for p in pts)
    for o in keep:
        o.matrix_world = Matrix.Scale(1.0 / h, 4) @ Matrix.Translation(off) @ o.matrix_world
    K.apply_all(keep)
    # soudure des coupes entre les morceaux (sommets confondus au micron près)
    K.select_only([body])
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=0.00002)
    bpy.ops.mesh.select_all(action='DESELECT')
    bpy.ops.object.mode_set(mode='OBJECT')
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(body.data)
    print('WELD', len(body.data.vertices), 'sommets ; arêtes ouvertes', sum(1 for e in bm.edges if e.is_boundary))
    bm.free()
    body.name = 'jack_body'
    eyes.name = 'jack_eyes'
    arm = autorig.build(body, [eyes], eyes, JACK_RIG)
    return arm, keep


# Gueule du jack (à l'échelle du jeu : garrot 0,57 m). Repère du jeu : x, haut (= z de Blender), avant (= -y de
# Blender). La mâchoire du bas tourne autour de la commissure (charnière JACK_HINGE : hauteur, avant) ; la zone de la
# mâchoire du bas est celle qui la referme (lèvres jointes : la gueule du modèle d'origine est entrouverte de
# JACK_JAW_OPEN rad). (Avant : refermée par le jeu, sans os — jackMouthClose dans dogParts.js : la gueule ne s'ouvrait
# jamais.)
JACK_HINGE = (0.482, 0.335)
JACK_JAW_OPEN = 0.17
# Langue modelée (le modèle d'origine n'en a pas : le creux rose de la mâchoire du bas est sa peau) : du fond de la
# gueule (avant 0,328) jusque derrière les incisives du bas (0,376), posée dans le creux de la mâchoire du bas, son
# dessus sous la ligne des lèvres (au calme, rien de rose entre les lèvres), en quatre os (tongue1…4, enfants de jaw) ;
# demi-largeur et épaisseur en m.
JACK_TONGUE = dict(z0=0.328, z1=0.374, hw=0.018, hw_tip=0.0145, thick=0.0105, sections=16, across=9, bones=4)


def _smooth(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def jack_jaw_weight(x, y, z):
    """Part de la mâchoire du bas d'un point de la tête (repère du jeu) : sous la ligne des lèvres (qui monte un peu
    vers l'avant), devant la commissure, au milieu du museau."""
    hy, hz = JACK_HINGE
    if z < hz - 0.01 or abs(x) > 0.065 or y > 0.5:
        return 0.0
    yM = 0.479 + (z - 0.37) * 0.25
    return (1 - _smooth(yM - 0.006, yM + 0.002, y)) * _smooth(hz - 0.005, hz + 0.02, z) * (1 - _smooth(0.05, 0.065, abs(x)))


def jack_mouth(arm, meshes):
    """Mâchoire et langue du jack : os « jaw » (charnière à la commissure) et sa zone de peau prise sur la tête ; langue
    modelée dans le creux de la mâchoire du bas (lancers de rayons vers le bas : le dessous de la langue suit ce creux en
    V), portée par quatre os ; puis gueule refermée (mâchoire et langue tournées de JACK_JAW_OPEN autour de la
    charnière : le repos de l'os est la gueule fermée, le jeu l'ouvre pour haleter)."""
    import bmesh
    from mathutils.bvhtree import BVHTree
    body = next(m for m in meshes if m.name == 'jack_body')
    hy, hz = JACK_HINGE
    G = lambda p: (p.x, p.z, -p.y)
    Bl = lambda x, y, z: Vector((x, -z, y))
    me = body.data
    heads = set(K.descendants(arm, 'head'))
    gname = {g.index: g.name for g in body.vertex_groups}
    # --- langue : dessous posé sur le creux de la mâchoire du bas (gueule ouverte du modèle d'origine)
    bvh = BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [tuple(p.vertices) for p in me.polygons])

    def floor_at(x, z):
        # (creux de la mâchoire du bas sous le point : première surface tournée vers le haut en descendant — au fond de
        # la gueule, le rayon touchait d'abord la paroi du fond, 1,7 cm plus haut, et le fond de la langue s'y relevait)
        o = Bl(x, 0.484, z)
        for _ in range(6):
            hit = bvh.ray_cast(o, Vector((0, 0, -1)), 0.06)
            if hit[0] is None:
                return 0.46
            if hit[1].z > 0.2:
                return hit[0].z
            o = hit[0] - Vector((0, 0, 1e-4))
        return 0.46
    T = JACK_TONGUE
    nS, nA = T['sections'], T['across']
    rings = []
    for k in range(nS + 1):
        u = k / nS
        z = T['z0'] + (T['z1'] - T['z0']) * u
        # (demi-largeur : un peu plus large au milieu, bout arrondi sur le dernier quart)
        hw = T['hw'] + (T['hw_tip'] - T['hw']) * u
        if u > 0.72:
            hw *= math.sqrt(max(0.0, 1 - ((u - 0.72) / 0.28) ** 2))
        hw = max(hw, 0.0012)
        bot, top = [], []
        for j in range(nA):
            a = -1 + 2 * j / (nA - 1)
            x = a * hw
            yb = floor_at(x, z) + 0.0012
            # (épaisseur en lentille, plus mince au bout)
            th = T['thick'] * (1 - 0.35 * u ** 2) * math.sqrt(max(0.05, 1 - a * a))
            # (dessus sous la ligne des lèvres du bas, au milieu un léger sillon)
            yt = min(yb + th - 0.0012 * (1 - a * a) ** 4, 0.479 + (z - 0.37) * 0.25 - 0.0075 - 0.003 * a * a)
            bot.append((x, yb, z))
            top.append((x, max(yt, yb + 0.0015), z))
        rings.append(bot + top[::-1])
    bm = bmesh.new()
    bm.from_mesh(me)
    uvl = bm.loops.layers.uv.verify()
    dl = bm.verts.layers.deform.verify()
    nb = T['bones']
    tn = ['tongue%d' % (k + 1) for k in range(nb)]
    gi = {}
    for nm in ['jaw'] + tn:
        g = body.vertex_groups.get(nm) or body.vertex_groups.new(name=nm)
        gi[nm] = g.index
    seg = (T['z1'] - T['z0']) / nb
    zj = [T['z0'] + k * seg for k in range(nb + 1)]

    def tongue_w(z):
        # (poids fondus d'un os à l'autre entre les milieux des os : la langue se courbe en arc, sans pli)
        c = (z - T['z0']) / seg - 0.5
        k0 = max(0, min(nb - 1, math.floor(c)))
        f = min(1.0, max(0.0, c - k0)) if k0 + 1 < nb else 0.0
        out = {tn[k0]: 1 - f}
        if f > 0:
            out[tn[k0 + 1]] = f
        return out
    n0 = len(bm.verts)
    vr = []
    for ring in rings:
        vs = []
        for (x, y, z) in ring:
            v = bm.verts.new(Bl(x, y, z))
            for nm, w in tongue_w(z).items():
                if w > 1e-4:
                    v[dl][gi[nm]] = w
            vs.append(v)
        vr.append(vs)
    m2 = len(vr[0])
    faces = []
    for k in range(nS):
        for j in range(m2):
            a, b = vr[k][j], vr[k][(j + 1) % m2]
            c, d = vr[k + 1][(j + 1) % m2], vr[k + 1][j]
            faces.append(bm.faces.new((a, d, c, b)))
    # (fond de la langue fermé par un éventail, bout aussi)
    for ring, rev in ((vr[0], False), (vr[-1], True)):
        c = sum((v.co for v in ring), Vector()) / len(ring)
        vc = bm.verts.new(c)
        src = ring[0]
        for nm in tn:
            if gi[nm] in src[dl]:
                vc[dl][gi[nm]] = src[dl][gi[nm]]
        for j in range(m2):
            a, b = ring[j], ring[(j + 1) % m2]
            faces.append(bm.faces.new((vc, b, a) if not rev else (vc, a, b)))
    for f in faces:
        f.smooth = True
        f.material_index = 0
        for lp in f.loops:
            # (rose de la texture : creux de la gueule ; le jeu la peint en rose, cTongue)
            lp[uvl].uv = (0.944, 0.455)
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    bm.to_mesh(me)
    bm.free()
    me.update()
    ntongue = len(me.vertices) - n0
    # --- mâchoire du bas : poids pris sur la tête, gueule refermée (mâchoire et langue)
    cs, sn = math.cos(JACK_JAW_OPEN), math.sin(JACK_JAW_OPEN)
    gj = body.vertex_groups['jaw']
    moved = 0
    for v in me.vertices:
        x, y, z = G(v.co)
        if v.index >= n0:
            w = _smooth(hz - 0.005, hz + 0.02, z)
        else:
            hw_ = sum(e.weight for e in v.groups if gname.get(e.group) in heads)
            tot = sum(e.weight for e in v.groups) or 1.0
            if hw_ / tot < 0.5:
                continue
            w = jack_jaw_weight(x, y, z)
            if w <= 0:
                continue
            for e in list(v.groups):
                if gname.get(e.group) in heads:
                    body.vertex_groups[gname[e.group]].add([v.index], e.weight * (1 - w), 'REPLACE')
            gj.add([v.index], hw_ * w, 'REPLACE')
            moved += 1
        dy, dz = y - hy, z - hz
        ny = hy + dy * cs + dz * sn
        nz = hz + dz * cs - dy * sn
        v.co = Bl(x, y + (ny - y) * w, z + (nz - z) * w)
    me.update()
    # --- os : charnière -> menton ; langue du fond au bout, dans la gueule fermée
    def closed(y, z):
        dy, dz = y - hy, z - hz
        return hy + dy * cs + dz * sn, hz + dz * cs - dy * sn
    tz = zj
    ty = []
    for z in tz:
        ty.append(floor_at(0.0, z) + 0.0012 + 0.35 * T['thick'])
    K.select_only([arm])
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.data.edit_bones
    jb = eb.new('jaw')
    jb.head = Bl(0.0, hy, hz)
    cy, cz = closed(0.466, 0.392)
    jb.tail = Bl(0.0, cy, cz)
    jb.roll = 0.0
    jb.parent = eb['head']
    prev = 'jaw'
    for k in range(nb):
        b = eb.new(tn[k])
        y0, z0 = closed(ty[k], tz[k])
        y1, z1 = closed(ty[k + 1], tz[k + 1])
        b.head = Bl(0.0, y0, z0)
        b.tail = Bl(0.0, y1, z1)
        b.roll = 0.0
        b.parent = eb[prev]
        b.use_connect = k > 0
        prev = b.name
    bpy.ops.object.mode_set(mode='OBJECT')
    print('JACK GUEULE : mâchoire', moved, 'sommets ; langue', ntongue, 'sommets')


MODELS['jack'] = dict(
    src=os.path.join(SRC, 'faino_jack.glb'),
    prep=prep_jack,
    mouth=jack_mouth,
    withers_bone='scapL', withers_dy=0.0,
    clips={}, legs=AUTO_LEGS,
    root='root', neck=['neck1', 'neck2'], head=['head'], jaw=['jaw'], tongue=['tongue1', 'tongue2', 'tongue3', 'tongue4'],
    tail=['tail1', 'tail2', 'tail3', 'tail4'], ears=['ear1L', 'ear1R'], ear_tips=['ear2L', 'ear2R'],
    flex=[('spine2', 0.3), ('chest', 0.3)],
    # (mâchoire et langue : animées par le jeu seulement, gueule fermée dans tous les clips)
    game_bones=r'^(tail\d|ear[12][LR]|jaw|tongue)',
    # (repos, roulade, assis : clips faits main du shiba repris sur ce squelette ; couché et endormi : poses du shiba
    # reprises ; patte : générée sur l'assis repris)
    retarget_clips=['idle', 'rollover', 'sit', 'lie', 'sleep'],
    # poses reprises reposées au sol : corps descendu jusqu'au sol, puis membres repliés pieds à plat (a3 : angle du
    # métapode, rad ; bend 'fwd' : grasset vers l'avant ; dz : articulation du pied relevée, m)
    ground_poses={
        'sit': {'HL': dict(a3=0.08, bend='fwd'), 'HR': dict(a3=0.08, bend='fwd'), 'FL': {}, 'FR': {}},
        'lie': {'HL': dict(a3=0.06, bend='fwd'), 'HR': dict(a3=0.06, bend='fwd'), 'FL': dict(a3=0.15, dz=0.008), 'FR': dict(a3=0.15, dz=0.008)},
        'sleep': {'HL': dict(a3=0.06, bend='fwd'), 'HR': dict(a3=0.06, bend='fwd'), 'FL': dict(a3=0.15, dz=0.008), 'FR': dict(a3=0.15, dz=0.008)},
    },
    # couché à plat (bascule bornée), postérieurs repliés sous le corps à la réception du saut
    lie_pitch_max=0.2, lie_fold=0.35, lie_elbow=0.17, lie_wrist=0.07, jump_tuck=True,
    # assis : reins creusés, poitrail redressé (corps long : sinon assis très incliné), bassin rentré, fémur vers
    # l'avant et le haut (grasset relevé) ; hauteur des hanches donnée (la croupe courte du jack ne touche le sol qu'en
    # écrasant la cuisse)
    sit_flex=-0.6, sit_tuck=-0.4, sit_femur=0.6, sit_hip=0.16,
    # renifler, manger, boire : l'encolure et les épaules descendent, le corps bascule à peine, antérieurs tendus
    sniff_pitch=0.25,
    # gabarits (make_dog.py) : pattes courtes du teckel et du corgi (0,5 et 0,55), trapues du carlin, du bouledogue,
    # du spitz, du yorkshire et des chiots (0,7 à 0,85) — allures et poses refaites pour eux (clips « walk_court »…)
    gabarits={
        # (court : révérence refaite, postérieurs tendus au sol — gab_bow. L'assis généré (sit_gen=True, gab_sit_gen)
        # a été essayé : postérieurs bien repliés, mais hanches plus hautes (13 cm au lieu de 6) et dos plus plat
        # (8–11° au lieu de 14–18°), le ventre profond du teckel touchant le sol avant la croupe — pas retenu)
        # (court : assis aux reins fléchis — sit_flex, voir gab_sit : bassin −0,5 rad autour de spine1, bas du dos −0,6
        # autour de spine2 et −0,6 autour de chest, poitrail redressé de 0,55, tête relevée de 0,55 — dos du teckel 18 → 33°,
        # du corgi 23 → 47°)
        # (back : longueur du dos pour laquelle l'assis est fait — teckel 1,45, corgi 1,25)
        'court': dict(legs=0.52, legW=1.13, back=1.25, clips=['walk', 'trot', 'run', 'sit', 'paw', 'sniff', 'bow'], sniff_pitch=0.08,
                      sit_flex=[-0.5, -0.6, 0.55, -0.6, 0.55]),
        # (nain : variante du court — of — pour les dos courts aux pattes courtes, chiots carlin et bouledogue (dos 0,72
        # et 0,77) : assis et patte sans les reins fléchis, comme avant les finitions 2. Le jeu fond les deux assis selon
        # la longueur du dos de la race, de nain (0,8) à court (1,35) — dogReal.js dogClips. Sur l'assis aux reins
        # fléchis, fait pour les dos longs, ces chiots trapus basculaient à la renverse : dos à 130° et 121°)
        'nain': dict(legs=0.52, legW=1.13, of='court', back=0.8, clips=['sit', 'paw']),
        # (trapu : l'assis du jack reste ; ses pieds arrière en l'air — carlin, bouledogue — sont reposés en jeu par
        # settleSit. L'assis généré cassait celui du yorkshire, du même gabarit : dos à 6°, pieds arrière à 5 cm)
        'trapu': dict(legs=0.74, legW=1.12, clips=['walk', 'trot', 'run']),
    },
)
