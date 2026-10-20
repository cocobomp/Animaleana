# Outils communs pour préparer les lapins candidats (Blender 4.2, mode --background), repris des outils chiens
# (tools/chien/dogkit.py). Chaîne : import -> nettoyage (objets inutiles, parents) -> orientation (avant = -Y)
# -> échelle (longueur nez-croupe 0,35 m) -> pattes au sol -> clips d'origine renommés -> allures et poses
# générées (rabbit_anim.py) -> vérifications sur le maillage déformé -> export GLB (regard +Z, Y en haut).
import bpy, os, sys, math, json
from mathutils import Vector, Matrix
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rabbit_gait as dg

LENGTH = 0.35  # longueur nez-croupe d'un lapin moyen (m)
FPS = 30 * dg.SUB  # (cadence de la scène et du GLB exporté ; les durées des clips sont comptées à 30 i/s)


def load(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS  # avant l'import : les temps du glTF sont convertis en images à cette cadence
    ext = os.path.splitext(path)[1].lower()
    if ext in ('.gltf', '.glb'):
        bpy.ops.import_scene.gltf(filepath=path)
    elif ext == '.fbx':
        bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False)
    elif ext == '.blend':
        bpy.ops.wm.open_mainfile(filepath=path, load_ui=False)
    elif ext == '.obj':
        bpy.ops.wm.obj_import(filepath=path)
    bpy.context.scene.render.fps = FPS


def ensure_object_mode():
    for ob in list(bpy.context.view_layer.objects):
        if ob is not None and ob.mode != 'OBJECT':
            bpy.context.view_layer.objects.active = ob
            bpy.ops.object.mode_set(mode='OBJECT')


def select_only(objs):
    ensure_object_mode()
    for o in bpy.context.view_layer.objects:
        if o is not None:
            o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


def clean(keep_meshes=None):
    """Garde l'armature et les maillages (liés à elle), supprime le reste ; enlève les parents (transformations gardées)."""
    arms = [o for o in bpy.data.objects if o.type == 'ARMATURE']
    meshes = [o for o in bpy.data.objects if o.type == 'MESH' and o.users_collection and
              o.users_collection[0].name != 'glTF_not_exported' and (keep_meshes is None or o.name in keep_meshes)]
    keep = set(arms + meshes)
    mw = {o.name: o.matrix_world.copy() for o in keep}
    for o in keep:
        o.parent = None
    for o in keep:
        o.matrix_world = mw[o.name]
    for o in list(bpy.data.objects):
        if o not in keep:
            bpy.data.objects.remove(o, do_unlink=True)
    arm = arms[0] if arms else None
    for m in meshes:
        for mod in m.modifiers:
            if mod.type == 'ARMATURE':
                mod.object = arm
        if arm and not any(mod.type == 'ARMATURE' for mod in m.modifiers) and m.vertex_groups:
            mod = m.modifiers.new('Armature', 'ARMATURE'); mod.object = arm
    bpy.context.view_layer.update()
    return arm, meshes


def apply_all(objs):
    select_only(objs)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.context.view_layer.update()


def world_verts(meshes, evaluated=False):
    dgp = bpy.context.evaluated_depsgraph_get()
    pts = []
    for ob in meshes:
        o = ob.evaluated_get(dgp) if evaluated else ob
        me = o.to_mesh()
        mw = o.matrix_world
        pts.extend(mw @ v.co for v in me.vertices)
        o.to_mesh_clear()
    return pts


def transform_all(arm, meshes, M, loc_scale=None):
    """Applique M (rotation/échelle/translation) au monde, puis l'applique aux données ; met à l'échelle les
    clés de position des os si loc_scale est donné."""
    objs = ([arm] if arm else []) + meshes
    for o in objs:
        o.matrix_world = M @ o.matrix_world
    bpy.context.view_layer.update()
    apply_all(objs)
    if loc_scale is not None:
        for act in bpy.data.actions:
            for fc in act.fcurves:
                if fc.data_path.endswith('.location'):
                    for kp in fc.keyframe_points:
                        kp.co[1] *= loc_scale
                        kp.handle_left[1] *= loc_scale
                        kp.handle_right[1] *= loc_scale


def bone(arm, prefix):
    """Os dont le nom commence par prefix (les noms importés portent des suffixes)."""
    for b in arm.data.bones:
        if b.name == prefix:
            return b.name
    c = [b.name for b in arm.data.bones if b.name.startswith(prefix)]
    if not c:
        raise KeyError(prefix)
    return sorted(c, key=len)[0]


def descendants(arm, name):
    out = [name]
    for c in arm.data.bones[name].children:
        out += descendants(arm, c.name)
    return out


def dominant_groups(mesh):
    gname = {g.index: g.name for g in mesh.vertex_groups}
    out = []
    for v in mesh.data.vertices:
        if v.groups:
            g = max(v.groups, key=lambda g: g.weight)
            out.append(gname.get(g.group))
        else:
            out.append(None)
    return out


def paw_verts(arm, meshes, j3name):
    names = set(descendants(arm, j3name))
    res = []
    for m in meshes:
        dom = dominant_groups(m)
        mw = m.matrix_world
        for i, v in enumerate(m.data.vertices):
            if dom[i] in names:
                res.append((m, i, mw @ v.co))
    return res


def sole_points(arm, meshes, paw_bone, J3):
    """Bout des doigts (y mini) et coussinet (y maxi) de la sole d'une patte, au repos."""
    pv = paw_verts(arm, meshes, paw_bone)
    zmin = min(p.z for _, _, p in pv)
    sole = [p for _, _, p in pv if p.z < zmin + 0.012]
    tip_y = min(p.y for p in sole)
    heel_y = max(p.y for p in sole)
    return Vector((J3.x, tip_y, zmin)), heel_y, [(m, i) for m, i, _ in pv]


def measure_withers(meshes, y, band, xmax=None):
    pts = world_verts(meshes)
    ground = min(p.z for p in pts)
    sel = [p.z for p in pts if abs(p.y - y) < band and (xmax is None or abs(p.x) < xmax)]
    return max(sel) - ground, ground


def rename_actions(mapping):
    """mapping {préfixe du nom d'origine: nouveau nom} ; supprime les actions non citées."""
    keep = {}
    for a in list(bpy.data.actions):
        new = None
        for k, v in mapping.items():  # le premier préfixe qui correspond (mettre les plus longs d'abord)
            if a.name.startswith(k):
                new = v
                break
        if new is None:
            bpy.data.actions.remove(a)
        else:
            keep[a] = new
    for a, n in keep.items():
        a.name = '__' + n
    for a in keep:
        a.name = a.name[2:]
        a.use_fake_user = True
    return [a.name for a in keep]


def clear_anim(arm):
    if arm.animation_data is None:
        arm.animation_data_create()
    arm.animation_data.action = None
    for t in list(arm.animation_data.nla_tracks):
        arm.animation_data.nla_tracks.remove(t)
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
        pb.scale = (1, 1, 1)
    bpy.context.view_layer.update()


class Probe:
    """Mesures sur le maillage déformé (pose courante)."""

    def __init__(self, meshes):
        self.meshes = meshes

    def z_of(self, items):
        dgp = bpy.context.evaluated_depsgraph_get()
        dgp.update()
        byobj = {}
        for m, i in items:
            byobj.setdefault(m, []).append(i)
        zs = []
        for m, ids in byobj.items():
            ev = m.evaluated_get(dgp)
            me = ev.to_mesh()
            mw = ev.matrix_world
            zs.extend((mw @ me.vertices[i].co).z for i in ids)
            ev.to_mesh_clear()
        return zs

    def all_min(self):
        return min(p.z for p in world_verts(self.meshes, evaluated=True))


def pose_probe(rig, gp, items, extra=None):
    """Pose une seule image du gp (t=0) et renvoie min z des sommets items."""
    act = dg.bake(rig, '_probe', gp, 2, extra)
    arm = rig.arm
    arm.animation_data.action = act
    bpy.context.scene.frame_set(0)
    z = min(Probe(None).z_of(items))
    arm.animation_data.action = None
    bpy.data.actions.remove(act)
    return z


def check_clips(arm, meshes, paws, muzzle=None, skip=()):
    """Plus bas sommet des pattes et du corps entier par clip (maillage déformé)."""
    scn = bpy.context.scene
    pr = Probe(meshes)
    allpaw = [it for ids in paws.values() for it in ids]
    rep = {}
    for act in bpy.data.actions:
        if act.name.startswith('_') or act.name in skip:
            continue
        clear_anim(arm)  # les canaux non animés gardent sinon les valeurs du clip précédent
        arm.animation_data.action = act
        f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
        lows, bodys, muz = [], [], []
        for f in range(f0, f1 + 1, max(1, (f1 - f0) // 16)):
            scn.frame_set(f)
            lows.append(min(pr.z_of(allpaw)))
            bodys.append(pr.all_min())
            if muzzle:
                muz.append(min(pr.z_of(muzzle)))
        r = {'frames': f1 - f0, 'seconds': round((f1 - f0) / FPS, 3), 'pawMin': round(min(lows), 4), 'bodyMin': round(min(bodys), 4)}
        if muz:
            r['muzzleMin'] = round(min(muz), 4)
        rep[act.name] = r
        print('CHECK', act.name, r)
    arm.animation_data.action = None
    scn.frame_set(0)
    return rep


def slip_check(arm, paws, act, v):
    """Glissement des pieds posés d'une allure jouée à sa vitesse naturelle v (m/s) : pour chaque appui (sommet de la
    patte le plus bas sous 4 mm), ce sommet est suivi dans le repère du sol (le lapin avance de v) ; on rend le plus
    grand déplacement (cm) par patte. Comme glisse.mjs de la contre-vérification de la page de comparaison."""
    scn = bpy.context.scene
    clear_anim(arm)
    arm.animation_data.action = act
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    dgp = bpy.context.evaluated_depsgraph_get()
    out = {}
    tracks = {lab: [] for lab in paws}
    cur = {lab: None for lab in paws}
    for cyc in range(2):  # deux cycles : un appui à cheval sur la boucle est suivi en entier
        for f in range(f0, f1):
            scn.frame_set(f)
            dgp.update()
            t = (cyc * (f1 - f0) + (f - f0)) / FPS
            cache = {}
            for lab, items in paws.items():
                pts = []
                for m, i in items:
                    if m not in cache:
                        ev = m.evaluated_get(dgp)
                        me = ev.to_mesh()
                        cache[m] = [ev.matrix_world @ x.co for x in me.vertices]
                        ev.to_mesh_clear()
                    pts.append((i, cache[m][i]))
                if cur[lab] is not None:
                    p = dict(pts)[cur[lab][0]]
                    if p.z < 0.004:
                        cur[lab][1].append(p.y - v * t)
                        continue
                    if len(cur[lab][1]) >= 3:
                        tracks[lab].append(cur[lab][1])
                    cur[lab] = None
                i, p = min(pts, key=lambda x: x[1].z)
                if p.z < 0.004:
                    cur[lab] = (i, [p.y - v * t])
    for lab in paws:
        sl = [max(abs(y - tr[0]) for y in tr) for tr in tracks[lab]]
        out[lab] = round(100 * max(sl), 2) if sl else None
    arm.animation_data.action = None
    scn.frame_set(0)
    return out


def ground_fix(arm, act, items, root):
    """Corps jamais sous le sol : sur chaque image, le lapin (os racine) est relevé de ce que la peau (items) passe
    sous le sol, lissé sur 5 images (repris de tools/chat/make_cat.py). Rend le plus grand relevé (m)."""
    clear_anim(arm)
    arm.animation_data.action = act
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    pr = Probe(None)
    lows = []
    for fr in range(f0, f1 + 1):
        bpy.context.scene.frame_set(fr)
        lows.append(min(pr.z_of(items)))
    need = [max(0.0, 0.0006 - z) for z in lows]
    if max(need) < 0.0008:
        arm.animation_data.action = None
        return 0.0
    n = len(need)
    cyc = act.use_cyclic
    get = lambda i: need[i % n] if cyc else need[min(n - 1, max(0, i))]
    mx = [max(get(i + k) for k in range(-2, 3)) for i in range(n)]
    gm = lambda i: mx[i % n] if cyc else mx[min(n - 1, max(0, i))]
    offs = [max(need[i], sum(gm(i + k) for k in range(-2, 3)) / 5) for i in range(n)]
    R = arm.data.bones[root].matrix_local.to_3x3().inverted()
    d = R @ Vector((0, 0, 1))
    path = 'pose.bones["%s"].location' % root
    fcs = [act.fcurves.find(path, index=k) for k in range(3)]
    for k in range(3):
        if fcs[k] is None:
            fcs[k] = act.fcurves.new(path, index=k, action_group=root)
    vals = [[fcs[k].evaluate(f0 + i) for i in range(n)] for k in range(3)]
    for k in range(3):
        fc = fcs[k]
        while fc.keyframe_points:
            fc.keyframe_points.remove(fc.keyframe_points[0])
        for i in range(n):
            kp = fc.keyframe_points.insert(f0 + i, vals[k][i] + d[k] * offs[i])
            kp.interpolation = 'LINEAR'
    arm.animation_data.action = None
    return max(need)


def bone_stretch(arm, act):
    """Plus grand écart de longueur d'un os (distance de sa tête à celle de son parent) dans un clip, par rapport au
    repos (comme os.mjs de la contre-vérification) : 1 = aucun os étiré."""
    scn = bpy.context.scene
    clear_anim(arm)
    arm.animation_data.action = act
    rest = {}
    for b in arm.data.bones:
        if b.parent is not None:
            rest[b.name] = (b.head_local - b.parent.head_local).length
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    worst = 1.0
    for f in range(f0, f1 + 1, max(1, (f1 - f0) // 12)):
        scn.frame_set(f)
        for pb in arm.pose.bones:
            if pb.parent is None or rest[pb.name] < 0.004:
                continue
            r = (pb.head - pb.parent.head).length / rest[pb.name]
            if abs(r - 1) > abs(worst - 1):
                worst = r
    arm.animation_data.action = None
    scn.frame_set(0)
    return round(worst, 4)


def export_glb(path, arm, def_bones=False):
    clear_anim(arm)
    kw = dict(filepath=path, export_format='GLB', use_selection=False, export_apply=False,
              export_yup=True, export_texcoords=True, export_normals=True, export_tangents=False,
              export_materials='EXPORT', export_image_format='AUTO', export_cameras=False, export_lights=False,
              export_skins=True, export_def_bones=def_bones, export_animations=True,
              export_animation_mode='ACTIONS', export_force_sampling=True, export_frame_step=1,
              export_optimize_animation_size=False, export_anim_single_armature=True,
              export_reset_pose_bones=True, export_morph=False, export_extras=False)
    bpy.ops.export_scene.gltf(**kw)
    print('EXPORTED', path, os.path.getsize(path))


def tris(meshes):
    return sum(sum(len(p.vertices) - 2 for p in m.data.polygons) for m in meshes)
