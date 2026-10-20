# Réglages des deux chiens du jeu (chemins des sources : variable SRC, voir build.sh).
#
# Les deux GLB suivent la même norme (voir LISEZMOI.md) : chien tourné vers +Z, Y en haut, pattes à y = 0,
# garrot 0,57 m (chien « de taille 1 », un labrador), et les MÊMES noms d'os pour ce que le jeu utilise :
#   root (porte le corps : translation des clips), pelvis, spine1, spine2, chest, neck1, neck2, head, jaw,
#   ear1L/ear2L, ear1R/ear2R (base et bout des oreilles), tail1…tailN,
#   scapL, humerusL, radiusL, metacarpusL, toesL (antérieur gauche ; R à droite),
#   femurL, tibiaL, metatarsusL, htoesL (postérieur gauche ; R à droite).
# Le shiba a en plus : tongue1…tongue6 (langue), eyeL/eyeR (globes), lidUL/lidDL/lidUR/lidDR (paupières :
# bases placées au centre de l'œil, le jeu les tourne pour cligner), breathe (respiration).
import os, re, bpy
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
)


# ------------------------------------------------------------------------------------------------ jack

AUTO_LEGS = {
    'FL': {'joints': ['humerusL', 'radiusL', 'metacarpusL', 'toesL'], 'scap': 'scapL'},
    'FR': {'joints': ['humerusR', 'radiusR', 'metacarpusR', 'toesR'], 'scap': 'scapR'},
    'HL': {'joints': ['femurL', 'tibiaL', 'metatarsusL', 'htoesL']},
    'HR': {'joints': ['femurR', 'tibiaR', 'metatarsusR', 'htoesR']},
}


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
    arm = autorig.build(body, [eyes], eyes, {'elbow': 0.47, 'hock': 0.26})
    return arm, keep


MODELS['jack'] = dict(
    src=os.path.join(SRC, 'faino_jack.glb'),
    prep=prep_jack,
    withers_bone='scapL', withers_dy=0.0,
    clips={}, legs=AUTO_LEGS,
    root='root', neck=['neck1', 'neck2'], head=['head'], jaw=['jaw'], tongue=[],
    tail=['tail1', 'tail2', 'tail3', 'tail4'], ears=['ear1L', 'ear1R'], ear_tips=['ear2L', 'ear2R'],
    flex=[('spine2', 0.3), ('chest', 0.3)],
    game_bones=r'^(tail\d|ear[12][LR])',
    # (repos et roulade : clips faits main du shiba repris sur ce squelette ; assis et patte : générés pour lui)
    retarget_clips=['idle', 'rollover'],
)
