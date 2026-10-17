# Outils communs pour convertir les chevaux candidats (Blender 4.2, mode --background).
import bpy, os, math
from mathutils import Vector, Matrix


def load(path):
    ext = os.path.splitext(path)[1].lower()
    if ext == '.blend':
        bpy.ops.wm.open_mainfile(filepath=path, load_ui=False)
    else:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        if ext == '.fbx':
            bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False)
        elif ext in ('.gltf', '.glb'):
            bpy.ops.import_scene.gltf(filepath=path)
        elif ext == '.obj':
            bpy.ops.wm.obj_import(filepath=path)
    scn = bpy.context.scene
    return scn


def remove_objects(pred):
    for ob in list(bpy.data.objects):
        if pred(ob):
            bpy.data.objects.remove(ob, do_unlink=True)


def keep_only(names=None, types=('MESH', 'ARMATURE')):
    remove_objects(lambda ob: (ob.type not in types) or (names is not None and ob.name not in names))


def link_all_to_scene():
    """Assure que tous les objets restants sont dans la scène active et visibles."""
    scn = bpy.context.scene
    for ob in bpy.data.objects:
        if ob.name not in scn.collection.all_objects:
            scn.collection.objects.link(ob)
        ob.hide_set(False)
        ob.hide_viewport = False
        ob.hide_render = False
    for c in bpy.data.collections:
        c.hide_viewport = False
        c.hide_render = False
    vl = bpy.context.view_layer
    def walk(lc):
        lc.exclude = False
        lc.hide_viewport = False
        for ch in lc.children:
            walk(ch)
    walk(vl.layer_collection)


def mesh_world_verts(objs, evaluated=True):
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for ob in objs:
        if ob.type != 'MESH':
            continue
        o = ob.evaluated_get(dg) if evaluated else ob
        me = o.to_mesh()
        mw = o.matrix_world
        pts.extend(mw @ v.co for v in me.vertices)
        o.to_mesh_clear()
    return pts


def bbox(objs, evaluated=True):
    pts = mesh_world_verts(objs, evaluated)
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return mn, mx


def top_profile(objs, axis='y', n=40):
    """Profil du dessus (z max) le long de l'axe du corps : liste (pos, zmax)."""
    pts = mesh_world_verts(objs)
    i = 'xyz'.index(axis)
    lo = min(p[i] for p in pts); hi = max(p[i] for p in pts)
    bins = [[] for _ in range(n)]
    for p in pts:
        k = min(n - 1, int((p[i] - lo) / (hi - lo + 1e-9) * n))
        bins[k].append(p.z)
    return [(lo + (k + 0.5) * (hi - lo) / n, max(b) if b else None) for k, b in enumerate(bins)]


def withers_height(objs, pos, band, axis='y'):
    """Hauteur du garrot : z max des sommets dont la position le long du corps est dans [pos-band, pos+band], moins le sol."""
    pts = mesh_world_verts(objs)
    i = 'xyz'.index(axis)
    ground = min(p.z for p in pts)
    sel = [p.z for p in pts if abs(p[i] - pos) <= band]
    return max(sel) - ground, ground


def scale_action_locations(factor, actions=None):
    """Après avoir appliqué une échelle à l'armature, les translations des os doivent suivre."""
    for act in (actions or bpy.data.actions):
        for fc in act.fcurves:
            if fc.data_path.endswith('.location') or fc.data_path == 'location':
                for kp in fc.keyframe_points:
                    kp.co[1] *= factor
                    kp.handle_left[1] *= factor
                    kp.handle_right[1] *= factor
                fc.update()


def ensure_object_mode():
    vl = bpy.context.view_layer
    for ob in list(vl.objects):
        if ob.mode != 'OBJECT':
            vl.objects.active = ob
            try:
                bpy.ops.object.mode_set(mode='OBJECT')
            except RuntimeError as e:
                with bpy.context.temp_override(active_object=ob, object=ob):
                    bpy.ops.object.mode_set(mode='OBJECT')
            print('mode ->', ob.name, ob.mode)


def select_only(objs):
    ensure_object_mode()
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


def apply_transforms(objs, loc=True, rot=True, scale=True):
    select_only(objs)
    bpy.ops.object.transform_apply(location=loc, rotation=rot, scale=scale)


def normalize(arm, meshes, factor, rot_z=0.0, scale_root_motion=True):
    """Tourne (autour de Z), met à l'échelle, pose les sabots au sol (z=0) et centre en x/y.
    arm peut être None (modèle statique)."""
    roots = [o for o in ([arm] if arm else []) + meshes if o.parent is None]
    for r in roots:
        r.matrix_world = Matrix.Rotation(rot_z, 4, 'Z') @ Matrix.Scale(factor, 4) @ r.matrix_world
    bpy.context.view_layer.update()
    objs = ([arm] if arm else []) + meshes
    # Appliquer rotation + échelle (les enfants suivent).
    apply_transforms(objs, loc=False, rot=True, scale=True)
    if arm and scale_root_motion:
        # échelle globale effective appliquée aux os = factor × échelle d'origine (déjà dans matrix_world)
        pass
    bpy.context.view_layer.update()


def bone_loc_factor_fix(arm, factor):
    scale_action_locations(factor)


def ground_and_center(arm, meshes):
    mn, mx = bbox(meshes)
    off = Vector((-(mn.x + mx.x) / 2, -(mn.y + mx.y) / 2, -mn.z))
    roots = [o for o in ([arm] if arm else []) + meshes if o.parent is None]
    for r in roots:
        r.location += off
    bpy.context.view_layer.update()
    apply_transforms(([arm] if arm else []) + meshes, loc=True, rot=False, scale=False)
    if arm:
        # La translation appliquée à l'armature décale aussi les os : les clés de position de l'os racine
        # sont relatives au repos, donc rien à corriger.
        pass
    return off


def rename_actions(mapping, drop_others=False):
    keep = set()
    for a in list(bpy.data.actions):
        if a.name in mapping:
            a.name = '__tmp__' + mapping[a.name]
    for a in list(bpy.data.actions):
        if a.name.startswith('__tmp__'):
            a.name = a.name[7:]
            a.use_fake_user = True
            keep.add(a.name)
    if drop_others:
        for a in list(bpy.data.actions):
            if a.name not in keep:
                bpy.data.actions.remove(a)
    return keep


def push_actions_to_nla(arm):
    """Le mode d'export ACTIONS prend toutes les actions compatibles ; on vide l'action active."""
    if arm.animation_data is None:
        arm.animation_data_create()
    arm.animation_data.action = None
    for t in list(arm.animation_data.nla_tracks):
        arm.animation_data.nla_tracks.remove(t)


def export_glb(path, anim=True, apply_mods=True, def_bones=False, extra=None):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    kw = dict(
        filepath=path, export_format='GLB', use_selection=False, export_apply=apply_mods,
        export_yup=True, export_texcoords=True, export_normals=True, export_tangents=False,
        export_materials='EXPORT', export_image_format='AUTO', export_cameras=False, export_lights=False,
        export_skins=True, export_def_bones=def_bones, export_animations=anim,
        export_animation_mode='ACTIONS', export_force_sampling=True, export_frame_step=1,
        export_optimize_animation_size=True, export_anim_single_armature=True,
        export_reset_pose_bones=True, export_morph=False, export_extras=False,
    )
    if extra:
        kw.update(extra)
    bpy.ops.export_scene.gltf(**kw)
    print('EXPORTED', path, os.path.getsize(path))


def report(arm, meshes):
    mn, mx = bbox(meshes)
    tris = 0
    for m in meshes:
        tris += sum(len(p.vertices) - 2 for p in m.data.polygons)
    print('REPORT bbox', tuple(round(v, 3) for v in mn), tuple(round(v, 3) for v in mx), 'tris(base)', tris,
          'actions', [(a.name, tuple(a.frame_range)) for a in bpy.data.actions])
