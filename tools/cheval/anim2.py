# Anime le cheval réaliste préparé par prep2.py et exporte le GLB brut (avant compression).
# Clips : walk, trot, canter (pied gauche), canterR (pied droit), gallop, idle, eat (broutage), rest
# (repos d'un postérieur). Vérifie sur le maillage déformé : aucun sabot sous le sol, bout du nez
# au ras de l'herbe pendant le broutage.
# Usage : blender -b --factory-startup --disable-autoexec --python anim2.py -- <prep2.blend> <sortie.glb> <rapport.json>
import bpy, sys, os, math, json
import numpy as np
from mathutils import Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gait2

a = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.open_mainfile(filepath=a[0], load_ui=False)
out, report_path = a[1], a[2]
arm = bpy.data.objects['HorseArmature']
me = bpy.data.objects['Horse']
for act in list(bpy.data.actions):
    bpy.data.actions.remove(act)
B = arm.data.bones
mats = [m.name for m in me.data.materials]
BODY = mats.index('horse_coat')

# Points de la sole (pince, talons) mesurés sur le maillage au repos
body_v = set()
for p in me.data.polygons:
    if p.material_index == BODY:
        body_v.update(p.vertices)
gname = {g.index: g.name for g in me.vertex_groups}
def dom(v):
    if not v.groups:
        return None
    return gname[max(v.groups, key=lambda g: g.weight).group]
legv = {k: [] for k in ('FL', 'FR', 'HL', 'HR')}
headv = []
for v in me.data.vertices:
    d = dom(v)
    if d and d[:2] in legv and d.endswith('4'):
        legv[d[:2]].append(v.index)
    if d == 'Head' and v.index in body_v:
        headv.append(v.index)
toeheel = {}
for k, ids in legv.items():
    sole = [me.data.vertices[i].co for i in ids if me.data.vertices[i].co.z < 0.02]
    toeheel[k] = (min(p.y for p in sole), max(p.y for p in sole))
print('TOEHEEL', toeheel)

legs = {}
for k in ('FL', 'FR', 'HL', 'HR'):
    front = k[0] == 'F'
    legs[k] = {'bones': [k + str(i) for i in range(1, 5)], 'kind': 'front' if front else 'hind',
               'gain': 0.55 if front else 0.6, 'neutral_dy': 0.0 if front else 0.04,
               'toe': toeheel[k][0], 'heel': toeheel[k][1]}
hip = B['Spine'].head_local
sh = B['Spine'].tail_local
cfg = dict(legs=legs, roots=['Spine', 'Tail1'], neck=['Neck'], head=['Head'], tail=['Tail1', 'Tail2'],
           ears=['EarL', 'EarR'], pitch_pivot=(hip + sh) / 2)
rig = gait2.Rig(arm, cfg)
G = gait2.gaits()
report = {'speeds': {}, 'clips': {}}
for name in ('walk', 'trot', 'canter', 'canterR', 'gallop'):
    gp = G[name]
    gait2.bake(rig, name, gp, gp['frames'])
    report['speeds'][name] = round(gp['speed'], 3)

# Repos : respiration du dos, encolure qui bouge un peu, queue qui chasse les mouches, oreilles.
idle = dict(stride=0.0, duty=1.0, lift=0.0, phase={'HL': 0, 'FL': 0, 'HR': 0, 'FR': 0}, breakover=0.0,
            bob=0.004, bob_freq=2, neck=0.03, neck_freq=1, neck_phase=0.0, head=0.03, tail_amp=0.03, tail_freq=1)
def idle_extra(t):
    sw = math.sin(math.tau * t) * 0.18 + math.sin(math.tau * 3 * t) * 0.06
    ear = 0.25 * max(0.0, math.sin(math.tau * (2 * t - 0.3))) ** 6
    return {'tail_yaw': sw, 'ear': ear}
gait2.bake(rig, 'idle', idle, 96, idle_extra)

# Repos d'un postérieur (droit) : sabot sur la pince, hanche qui descend de ce côté.
rest = dict(stride=0.0, duty=1.0, lift=0.0, phase={'HL': 0, 'FL': 0, 'HR': 0, 'FR': 0}, breakover=0.0,
            legs={'HR': {'dy': -0.1, 'phi': 0.75, 'dz': 0.012}}, roll_base=-0.035, drop=0.012, pitch_base=-0.012,
            bob=0.003, bob_freq=2, neck=0.025, neck_base=0.12, neck_freq=1, head=0.02, tail_amp=0.025, tail_freq=1)
def rest_extra(t):
    return {'tail_yaw': math.sin(math.tau * t) * 0.12, 'ear': 0.2 * max(0.0, math.sin(math.tau * (t - 0.4))) ** 8}
gait2.bake(rig, 'rest', rest, 96, rest_extra)

# Brouter : encolure baissée jusqu'à l'herbe, un antérieur un peu en avant, petits coups de tête.
scn = bpy.context.scene
dg = bpy.context.evaluated_depsgraph_get()
def mesh_z(ids):
    dg.update()
    ev = me.evaluated_get(dg)
    m = ev.to_mesh()
    zs = [ (ev.matrix_world @ m.vertices[i].co).z for i in ids ]
    ev.to_mesh_clear()
    return zs
def eat_gp(nb):
    return dict(stride=0.0, duty=1.0, lift=0.0, phase={'HL': 0, 'FL': 0, 'HR': 0, 'FR': 0}, breakover=0.0,
                legs={'FL': {'dy': -0.2, 'phi': 0.0}}, pitch_base=0.02,
                neck_base=nb, neck=0.0, head_base=-0.55, head=0.0, bob=0.0, drop=0.015, tail_amp=0.02)
def eat_extra(t):
    tug = 0.05 * max(0.0, math.sin(math.tau * 4 * t)) ** 3
    chew = 0.02 * math.sin(math.tau * 12 * t)
    sw = math.sin(math.tau * t) * 0.15
    return {'neck': -tug, 'head': chew - tug * 0.5, 'tail_yaw': sw, 'ear': 0.15 * max(0.0, math.sin(math.tau * (t - 0.6))) ** 8}
nb = 1.2
for it in range(6):
    act = gait2.bake(rig, '_probe', eat_gp(nb), 4, None)
    arm.animation_data.action = act
    scn.frame_set(0)
    low = min(mesh_z(headv))
    arm.animation_data.action = None
    bpy.data.actions.remove(act)
    print('EAT probe neck_base', round(nb, 3), 'muzzle min z', round(low, 4))
    if abs(low - 0.03) < 0.004:
        break
    nb += (low - 0.03) * 1.6  # ~0,6 m de bras de levier entre la base de l'encolure et le bout du nez
gait2.bake(rig, 'eat', eat_gp(nb), 96, eat_extra)
report['eat_neck_base'] = nb

# Vérification sur le maillage déformé : sabots (plus bas sommet de chaque os de sabot), bout du nez.
allhoof = [i for ids in legv.values() for i in ids]
for act in bpy.data.actions:
    if act.name.startswith('_'):
        continue
    arm.animation_data.action = act
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    lows = []
    muz = []
    for f in range(f0, f1, max(1, (f1 - f0) // 24)):
        scn.frame_set(f)
        zs = mesh_z(allhoof)
        lows.append(min(zs))
        if act.name == 'eat':
            muz.append(min(mesh_z(headv)))
    report['clips'][act.name] = {'frames': f1 - f0, 'hoofMin': round(min(lows), 4), 'hoofMinPerFrame': [round(x, 3) for x in lows]}
    if muz:
        report['clips'][act.name]['muzzleMin'] = round(min(muz), 4)
        report['clips'][act.name]['muzzleMax'] = round(max(muz), 4)
    print('CHECK', act.name, report['clips'][act.name]['hoofMin'], report['clips'][act.name].get('muzzleMin'))
arm.animation_data.action = None
scn.frame_set(0)

for pb in arm.pose.bones:
    pb.rotation_quaternion = (1, 0, 0, 0)
    pb.location = (0, 0, 0)
if arm.animation_data:
    for t in list(arm.animation_data.nla_tracks):
        arm.animation_data.nla_tracks.remove(t)
bpy.ops.wm.save_as_mainfile(filepath=out.replace('.glb', '.blend'), compress=True)
kw = dict(filepath=out, export_format='GLB', use_selection=False, export_apply=False,
          export_yup=True, export_texcoords=True, export_normals=True, export_tangents=False,
          export_materials='EXPORT', export_image_format='AUTO', export_cameras=False, export_lights=False,
          export_skins=True, export_def_bones=False, export_animations=True,
          export_animation_mode='ACTIONS', export_force_sampling=True, export_frame_step=1,
          export_optimize_animation_size=False, export_anim_single_armature=True,
          export_reset_pose_bones=True, export_morph=False, export_extras=False)
try:
    bpy.ops.export_scene.gltf(**kw, export_vertex_color='ACTIVE')
except TypeError as e:
    print('export_vertex_color non disponible', e)
    bpy.ops.export_scene.gltf(**kw, export_colors=True)
print('EXPORTED', out, os.path.getsize(out))
json.dump(report, open(report_path, 'w'), indent=1)
