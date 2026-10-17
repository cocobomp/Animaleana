# Cheval réaliste de Lyndon Daniels (CC0), riggé par ChadM (CC0) : préparation.
# - matériaux refaits en nœuds (diffuse × occlusion, normal map ; crins en alpha)
# - crinière, queue et yeux liés au squelette puis fusionnés dans le corps
# - mise à l'échelle (garrot 1,6 m), sabots au sol, regard vers -Y Blender (= +Z glTF)
# Usage : blender -b --factory-startup --disable-autoexec --python lyndon_prep.py -- <riggedHorse.blend> <dossier textures> <sortie.blend> [tex_size]
import bpy, sys, os, math
import numpy as np
from mathutils import Vector, Matrix
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hc

a = sys.argv[sys.argv.index('--') + 1:]
src, texdir, out = a[0], a[1], a[2]
TEX = int(a[3]) if len(a) > 3 else 1024
hc.load(src)
hc.link_all_to_scene()
hc.keep_only(names={'Armature', 'Plane', 'BezierCurve', 'BezierCurve.005', 'Sphere', 'Sphere.002'})
arm = bpy.data.objects['Armature']
body = bpy.data.objects['Plane']
mane = bpy.data.objects['BezierCurve']
tail = bpy.data.objects['BezierCurve.005']
eyes = [bpy.data.objects['Sphere'], bpy.data.objects['Sphere.002']]

for o in [body, mane, tail] + eyes:
    mn, mx = hc.bbox([o])
    print('BBOX', o.name, tuple(round(v, 2) for v in mn), tuple(round(v, 2) for v in mx))

# Retirer les contraintes IK (sans cibles) et remettre la pose de repos.
for pb in arm.pose.bones:
    for c in list(pb.constraints):
        pb.constraints.remove(c)
    pb.rotation_mode = 'QUATERNION'
    pb.rotation_quaternion = (1, 0, 0, 0)
    pb.location = (0, 0, 0)
    pb.scale = (1, 1, 1)
if arm.animation_data:
    arm.animation_data.action = None
for act in list(bpy.data.actions):
    bpy.data.actions.remove(act)
bpy.context.view_layer.update()

# ---------- Textures ----------
def load_img(name):
    p = os.path.join(texdir, name)
    im = bpy.data.images.load(p)
    return im

def img_to_np(im):
    w, h = im.size
    arr = np.empty(w * h * 4, dtype=np.float32)
    im.pixels.foreach_get(arr)
    return arr.reshape(h, w, 4)

def np_to_img(name, arr, alpha=False):
    h, w, _ = arr.shape
    im = bpy.data.images.new(name, w, h, alpha=alpha)
    im.pixels.foreach_set(arr.astype(np.float32).ravel())
    return im

def resized(im, size):
    if im.size[0] != size:
        im.scale(size, size)
    return im

body_col = load_img('HorseMain2k00.png')
body_ao = load_img('HorseMain2k00AO00.png')
body_nrm = load_img('HorseMain2k00Norm00.png')
hair_col = load_img('Hair12Main2k.png')
hair_nrm = load_img('Hair12Main2kNorm.png')
for im in (body_col, body_ao, body_nrm, hair_col, hair_nrm):
    resized(im, TEX)
# diffuse × AO (adouci) -> une seule texture de couleur
c = img_to_np(body_col); o = img_to_np(body_ao)
# (la carte d'occlusion fournie est presque noire : moyenne 17/255 ; on ne l'utilise pas)
c[..., 3] = 1.0
body_base = np_to_img('horse_body_color', c)
body_nrm.colorspace_settings.name = 'Non-Color'
hair_nrm.colorspace_settings.name = 'Non-Color'
print('HAIR alpha stats', float(img_to_np(hair_col)[..., 3].mean()))

def make_mat(name, base, nrm=None, alpha=False, rough=0.75, color=None, spec=0.3):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Specular IOR Level'].default_value = spec
    if base is not None:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = base
        nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
        if alpha:
            nt.links.new(t.outputs['Alpha'], bsdf.inputs['Alpha'])
            m.blend_method = 'CLIP'
            m.alpha_threshold = 0.4
    elif color is not None:
        bsdf.inputs['Base Color'].default_value = color
    if nrm is not None:
        tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = nrm
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    return m

m_body = make_mat('horse_body', body_base, body_nrm, rough=0.7)
m_hair = make_mat('horse_hair', hair_col, hair_nrm, alpha=True, rough=0.8)
m_eye = make_mat('horse_eye', None, None, rough=0.15, color=(0.06, 0.035, 0.02, 1.0), spec=0.6)
for ob, m in ((body, m_body), (mane, m_hair), (tail, m_hair)):
    ob.data.materials.clear(); ob.data.materials.append(m)
for e in eyes:
    e.data.materials.clear(); e.data.materials.append(m_eye)

# ---------- Appliquer les transformations des pièces libres ----------
for o in [mane, tail] + eyes:
    hc.select_only([o])
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# ---------- Poids : crinière par transfert depuis le corps ; yeux sur la tête ; queue le long des os de queue ----------
def transfer_weights(dst):
    hc.select_only([dst])
    for g in body.vertex_groups:
        if g.name not in dst.vertex_groups:
            dst.vertex_groups.new(name=g.name)
    mod = dst.modifiers.new('dt', 'DATA_TRANSFER')
    mod.object = body
    mod.use_vert_data = True
    mod.data_types_verts = {'VGROUP_WEIGHTS'}
    mod.vert_mapping = 'POLYINTERP_NEAREST'
    mod.layers_vgroup_select_src = 'ALL'
    mod.layers_vgroup_select_dst = 'NAME'
    bpy.context.view_layer.objects.active = dst
    bpy.ops.object.modifier_apply(modifier=mod.name)

transfer_weights(mane)
# Les mèches proches de la nuque héritent des os d'oreilles : on les rend à la tête (sinon elles suivent les oreilles).
ears_idx = {mane.vertex_groups[n].index for n in ('Bone.001_L', 'Bone.001_R') if n in mane.vertex_groups}
g_head = mane.vertex_groups['Bone.002']
moved = 0
for v in mane.data.vertices:
    wsum = sum(g.weight for g in v.groups if g.group in ears_idx)
    if wsum > 0:
        cur = next((g.weight for g in v.groups if g.group == g_head.index), 0.0)
        g_head.add([v.index], cur + wsum, 'REPLACE')
        for gi in ears_idx:
            mane.vertex_groups[gi].remove([v.index])
        moved += 1
print('mane verts ear->head', moved)

def rigid(dst, bone):
    for g in list(dst.vertex_groups):
        dst.vertex_groups.remove(g)
    g = dst.vertex_groups.new(name=bone)
    g.add(list(range(len(dst.data.vertices))), 1.0, 'REPLACE')

for e in eyes:
    rigid(e, 'Bone.002')

# Queue : poids selon la position le long de la chaîne Bone.003 -> Bone.004
mw = arm.matrix_world
b3 = arm.data.bones['Bone.003']; b4 = arm.data.bones['Bone.004']
h3, t3 = mw @ b3.head_local, mw @ b3.tail_local
h4, t4 = mw @ b4.head_local, mw @ b4.tail_local
for g in list(tail.vertex_groups):
    tail.vertex_groups.remove(g)
g3 = tail.vertex_groups.new(name='Bone.003'); g4 = tail.vertex_groups.new(name='Bone.004'); g0 = tail.vertex_groups.new(name='Bone')
def seg_t(p, h, t):
    d = t - h
    return max(0.0, min(1.0, (p - h).dot(d) / d.length_squared))
for v in tail.data.vertices:
    p = tail.matrix_world @ v.co
    u3 = seg_t(p, h3, t3)
    u4 = seg_t(p, h4, t4)
    d3 = (p - (h3 + (t3 - h3) * u3)).length
    d4 = (p - (h4 + (t4 - h4) * u4)).length
    # mélange doux : plus près de Bone.004 -> plus de poids sur Bone.004
    w4 = d3 / (d3 + d4 + 1e-6)
    w4 = min(1.0, max(0.0, (w4 - 0.3) / 0.4))
    if u3 < 0.25:  # tout près de la croupe : suit un peu le corps
        k = u3 / 0.25
        g0.add([v.index], 1 - k, 'REPLACE'); g3.add([v.index], k * (1 - w4), 'REPLACE'); g4.add([v.index], k * w4, 'REPLACE')
    else:
        g3.add([v.index], 1 - w4, 'REPLACE'); g4.add([v.index], w4, 'REPLACE')

# ---------- Fusion dans le corps ----------
for o in [mane, tail] + eyes:
    for mname in [m.name for m in o.modifiers]:
        o.modifiers.remove(o.modifiers[mname])
hc.select_only([body, mane, tail] + eyes)
bpy.context.view_layer.objects.active = body
bpy.ops.object.join()
body = bpy.context.view_layer.objects.active
body.name = 'Horse'
# vertex group fantôme sans os
if 'Bone.005' in body.vertex_groups:
    body.vertex_groups.remove(body.vertex_groups['Bone.005'])
# Normaliser les poids (max 4 influences, somme 1)
hc.select_only([body])
bpy.ops.object.mode_set(mode='WEIGHT_PAINT')
bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
bpy.ops.object.mode_set(mode='OBJECT')
# normales lisses
for p in body.data.polygons:
    p.use_smooth = True

# ---------- Échelle ----------
fy = (arm.matrix_world @ arm.data.bones['Bone_L'].head_local).y
w, ground = hc.withers_height([body], fy + 0.25, 0.3)
print('withers source (avec crinière ?)', w)
# garrot sur le corps seul : on mesure sans les crins (matériau horse_body)
dg = bpy.context.evaluated_depsgraph_get()
pts = []
for poly in body.data.polygons:
    if body.material_slots[poly.material_index].material.name == 'horse_body':
        for vi in poly.vertices:
            pts.append(body.matrix_world @ body.data.vertices[vi].co)
ground = min(p.z for p in pts)
wz = max(p.z for p in pts if abs(p.y - (fy + 0.25)) < 0.3)
w = wz - ground
print('withers body only', w)
f = 1.6 / w
hc.normalize(arm, [body], f)
hc.ground_and_center(arm, [body])
arm.name = 'HorseArmature'
hc.report(arm, [body])
for b in arm.data.bones:
    print('BONE', b.name, tuple(round(v, 3) for v in b.head_local), tuple(round(v, 3) for v in b.tail_local))
# Emballer les images dans le .blend
for im in bpy.data.images:
    if im.users and not im.packed_file and im.size[0] > 0:
        try:
            im.pack()
        except Exception as e:
            print('pack fail', im.name, e)
bpy.ops.wm.save_as_mainfile(filepath=out, compress=True)
print('SAVED', out)
