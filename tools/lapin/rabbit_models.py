# Réglages des deux lapins du jeu (fichiers d'origine dans le dossier $SRC, voir LISEZMOI.md) : préparation
# (nettoyage, orientation), rôles des os (colonne, cou, tête, oreilles, queue, membres) et réglages des poses.
#   dakota      : « Rabbit » de Dakota.Hinkle (Sketchfab, CC-BY 4.0) -> public/models/rabbit.glb (toutes les races
#                 sauf le bélier) ;
#   fourthgreen : « Rabbit Rigged » de FourthGreen (Sketchfab, CC-BY 4.0) -> public/models/rabbit_lop.glb (bélier).
import os, bpy, math
from mathutils import Matrix, Vector
import rabbitkit as K

SRC = os.environ.get('SRC', '.')


def face_to_minus_y(arm, meshes, front, back):
    """Tourne autour de Z pour que l'avant (point front) soit vers -Y depuis l'arrière (point back)."""
    d = front - back
    ang = math.atan2(d.x, -d.y)
    K.transform_all(arm, meshes, Matrix.Rotation(ang, 4, 'Z'))


def bone_head(arm, name):
    return arm.matrix_world @ arm.data.bones[K.bone(arm, name)].head_local


def merge_groups(mesh, src, dst):
    """Ajoute les poids du groupe src au groupe dst puis supprime src."""
    if src not in mesh.vertex_groups:
        return
    gs = mesh.vertex_groups[src]
    gd = mesh.vertex_groups.get(dst) or mesh.vertex_groups.new(name=dst)
    for v in mesh.data.vertices:
        for g in v.groups:
            if g.group == gs.index and g.weight > 0:
                gd.add([v.index], g.weight, 'ADD')
    mesh.vertex_groups.remove(gs)


def rescale_actions(k):
    """Étire les clés de toutes les actions (k = fps cible / fps source)."""
    for act in bpy.data.actions:
        for fc in act.fcurves:
            for kp in fc.keyframe_points:
                kp.co[0] *= k
                kp.handle_left[0] *= k
                kp.handle_right[0] *= k


def bake_visual(arm, actions):
    """Cuit chaque action en clés visuelles (contraintes IK comprises) sur tous les os ; renvoie {nom: action}."""
    out = {}
    K.select_only([arm])
    bpy.ops.object.mode_set(mode='POSE')
    for a in actions:
        arm.animation_data.action = a
        f0, f1 = int(a.frame_range[0]), int(round(a.frame_range[1]))
        bpy.ops.pose.select_all(action='SELECT')
        bpy.ops.nla.bake(frame_start=f0, frame_end=max(f1, f0 + 1), step=1, only_selected=False, visual_keying=True,
                         clear_constraints=False, clear_parents=False, use_current_action=False, clean_curves=False,
                         bake_types={'POSE'})
        nb = arm.animation_data.action
        nb.name = 'baked_' + a.name
        nb.use_fake_user = True
        out[a.name] = nb
    arm.animation_data.action = None
    bpy.ops.object.mode_set(mode='OBJECT')
    return out


def remove_bones(arm, names):
    K.select_only([arm])
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.data.edit_bones
    for n in names:
        if n in eb:
            b = eb[n]
            for c in b.children:
                c.parent = b.parent
            eb.remove(b)
    bpy.ops.object.mode_set(mode='OBJECT')


def rename_bones(arm, mapping):
    """Renomme les os en deux temps (Blender renomme aussi groupes de sommets et courbes)."""
    for old in list(mapping):
        arm.data.bones[old].name = '__tmp__' + mapping[old]
    for b in arm.data.bones:
        if b.name.startswith('__tmp__'):
            b.name = b.name[7:]


# ---------------------------------------------------------------------------------------------------------------
def mat_nodes(mat, img, normal=None, alpha=False, name=None):
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    o = nt.nodes.new('ShaderNodeOutputMaterial')
    p = nt.nodes.new('ShaderNodeBsdfPrincipled')
    p.inputs['Roughness'].default_value = 0.9
    nt.links.new(p.outputs[0], o.inputs[0])
    if img:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = img
        nt.links.new(t.outputs['Color'], p.inputs['Base Color'])
        if alpha:
            nt.links.new(t.outputs['Alpha'], p.inputs['Alpha'])
            mat.blend_method = 'CLIP'
    if normal:
        tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = normal; normal.colorspace_settings.name = 'Non-Color'
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], p.inputs['Normal'])
    if name:
        mat.name = name


def prep_gltf_rigged():
    arm, meshes = K.clean()
    K.apply_all([arm] + meshes)
    return arm, meshes


def prep_dakota():
    arm, meshes = prep_gltf_rigged()
    face_to_minus_y(arm, meshes, bone_head(arm, 'head_4'), bone_head(arm, 'spine 1_18'))
    return arm, meshes


def unweighted_bones(arm, meshes):
    used = set()
    for m in meshes:
        gname = {g.index: g.name for g in m.vertex_groups}
        for v in m.data.vertices:
            for g in v.groups:
                if g.weight > 1e-4:
                    used.add(gname.get(g.group))
    return [b.name for b in arm.data.bones if b.name not in used]


def prep_fourthgreen():
    """« Rabbit Rigged » de FourthGreen : os de bout (FBX) sans poids retirés après cuisson du clip d'origine."""
    arm, meshes = prep_gltf_rigged()
    if arm.animation_data and arm.animation_data.nla_tracks:
        for tr in list(arm.animation_data.nla_tracks):
            arm.animation_data.nla_tracks.remove(tr)
    acts = [a for a in bpy.data.actions]
    bake_visual(arm, acts)
    for a in list(bpy.data.actions):
        if not a.name.startswith('baked_'):
            bpy.data.actions.remove(a)
    for a in list(bpy.data.actions):
        a.name = 'hop_fast'
    dead = unweighted_bones(arm, meshes)
    print('FOURTHGREEN os sans poids retirés', dead)
    remove_bones(arm, dead)
    for act in bpy.data.actions:
        for fc in list(act.fcurves):
            if any(('"%s"' % h) in fc.data_path for h in dead):
                act.fcurves.remove(fc)
    face_to_minus_y(arm, meshes, bone_head(arm, 'Head_M'), bone_head(arm, 'Root_M'))
    return arm, meshes


MODELS = {}
# Spécification des membres : J0..J3 = têtes d'os (ou ('tail', os), ('lerp', a, b, u), ('sole', [os], u) = point de la
# sole entre talon (0) et bout (1)) ; J4 (bout des doigts) est mesuré sur le maillage (os 'paw' et descendants).
# drive : [(os, segment)] ; chaque os suit rigidement son segment J_k -> J_k+1.

MODELS['dakota'] = dict(
    src=os.path.join(SRC, 'dakota_rabbit.glb'), prep=prep_dakota,
    rename={'GLTF_created_0_rootJoint': 'root', 'spine 1_18': 'pelvis', 'spine 2_17': 'spine1', 'spine 3_16': 'spine2',
            'spine 4_15': 'spine3', 'spine 5_14': 'chest', 'neck_5': 'neck1', 'head_4': 'head', 'ear.L_0': 'ear1L',
            'ear.R_1': 'ear1R', 'jaw_2': 'jaw', 'nose_3': 'nose', 'tail_19': 'tail1',
            'Upper arm.L_9': 'humerusL', 'lower arm.L_8': 'radiusL', 'Hand.L_7': 'metacarpusL', 'Paw.L_6': 'toesL',
            'Upper arm.R_13': 'humerusR', 'lower arm.R_12': 'radiusR', 'Hand.R_11': 'metacarpusR', 'Paw.R_10': 'toesR',
            'upper leg.L_23': 'femurL', 'Lower leg.L_22': 'tibiaL', 'foot.L_21': 'metatarsusL', 'Toes.L_20': 'htoesL',
            'upper leg.R_27': 'femurR', 'Lower leg.R_26': 'tibiaR', 'foot.R_25': 'metatarsusR', 'Toes.R_24': 'htoesR'},
    clips={},
    legs={s: {'F': {'points': ['humerus' + s, 'radius' + s, 'metacarpus' + s, 'toes' + s],
                    'drive': [('humerus' + s, 0), ('radius' + s, 1), ('metacarpus' + s, 2), ('toes' + s, 3)], 'paw': 'toes' + s},
               'H': {'points': ['femur' + s, 'tibia' + s, 'metatarsus' + s, 'htoes' + s],
                     'drive': [('femur' + s, 0), ('tibia' + s, 1), ('metatarsus' + s, 2), ('htoes' + s, 3)], 'paw': 'htoes' + s}}
          for s in 'LR'},
    spine=[('spine1', 0.3), ('spine2', 0.35), ('spine3', 0.35)], neck=[('neck1', 1.0)], head=['head'],
    earL=[('ear1L', 1.0)], earR=[('ear1R', 1.0)], tail=[('tail1', 1.0)], jaw=[], nose=[], scap={},
    ear_rest='up', notes='CC-BY 4.0',
    pose=dict(hind_d=0.36, front_d=0.56, front_a3=0.15, flex=0.12, sit_hind_d=0.34, sit_front_d=0.80, sit_front_a3=0.35),
    materials={'Material': 'rabbit_coat', 'Material.001': 'rabbit_eye'},
)

MODELS['fourthgreen'] = dict(
    src=os.path.join(SRC, 'fourthgreen_rabbit.glb'), prep=prep_fourthgreen,
    rename={'Root_M_02': 'pelvis', 'Spine1_M_011': 'spine1', 'Spine2_M_012': 'spine2', 'Chest_M_013': 'chest',
            'Neck_M_019': 'neck1', 'Head_M_020': 'head', 'Nose_M_021': 'nose',
            'Ear_L_028': 'ear1L', 'Ear1_L_029': 'ear2L', 'Ear2_L_030': 'ear3L', 'Ear_R_023': 'ear1R', 'Ear1_R_024': 'ear2R',
            'Ear2_R_025': 'ear3R', 'Tail0_M_08': 'tail1', 'Tail1_M_09': 'tail2',
            'frontRump_L_032': 'scapL', 'frontHip_L_033': 'humerusL', 'frontKnee_L_034': 'radiusL', 'frontAnkle_L_035': 'metacarpusL',
            'frontRump_R_014': 'scapR', 'frontHip_R_015': 'humerusR', 'frontKnee_R_00': 'radiusR', 'frontAnkle_R_016': 'metacarpusR',
            'backHip_L_038': 'femurL', 'backKnee_L_039': 'tibiaL', 'backAnkle_L_040': 'metatarsusL', 'backToes_L_041': 'htoesL',
            'backHip_R_03': 'femurR', 'backKnee_R_04': 'tibiaR', 'backAnkle_R_05': 'metatarsusR', 'backToes_R_06': 'htoesR'},
    clips={},  # (le bond rapide d'origine n'est pas gardé : les allures sont refaites pour le jeu)
    legs={s: {'F': {'points': ['humerus' + s, 'radius' + s, 'metacarpus' + s, ('sole', ['metacarpus' + s], 0.92)],
                    'drive': [('humerus' + s, 0), ('radius' + s, 1), ('metacarpus' + s, 2)], 'paw': 'metacarpus' + s, 'scap': 'scap' + s},
               'H': {'points': ['femur' + s, 'tibia' + s, 'metatarsus' + s, 'htoes' + s],
                     'drive': [('femur' + s, 0), ('tibia' + s, 1), ('metatarsus' + s, 2), ('htoes' + s, 3)], 'paw': 'htoes' + s}}
          for s in 'LR'},
    spine=[('spine1', 0.35), ('spine2', 0.35), ('chest', 0.3)], neck=[('neck1', 1.0)], head=['head'],
    earL=[('ear1L', 0.4), ('ear2L', 0.35), ('ear3L', 0.25)], earR=[('ear1R', 0.4), ('ear2R', 0.35), ('ear3R', 0.25)],
    tail=[('tail1', 0.6), ('tail2', 0.4)], jaw=[], nose=['nose'], scap={'FL': 'scapL', 'FR': 'scapR'},
    ear_rest='lop', notes='CC-BY 4.0 ; oreilles tombantes (bélier) dans la pose de liaison',
    pose=dict(hind_flat=0.10, sit_alpha=0.22, lope_stride=1.0), materials={'Main': 'rabbit_coat'},
)

