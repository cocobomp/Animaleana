# Cheval réaliste (Lyndon Daniels, squelette ChadM, CC0) : deuxième préparation pour le jeu.
# Part de lyndon_prep.blend (matériaux, crins et yeux fusionnés, garrot 1,6 m, sabots au sol) et :
# - recentre le squelette sur le plan de symétrie du maillage (x = 0) ;
# - renomme les os (Spine, Neck, Head, EarL/EarR, Tail1/Tail2, FL1..FL4, FR1..FR4, HL1..HL4, HR1..HR4) ;
#   L = côté +x = gauche du cheval (il regarde vers +Z en glTF) ;
# - ajoute un os de paturon/sabot par membre (le canon s'arrête au boulet) : le sabot reste à plat ;
# - ajoute Ribs (respiration) et Mane1..Mane4 (crinière souple, poids pris sur l'encolure) ;
# - rattache les oreilles à la tête ;
# - textures : la robe peinte (alezan, balzanes, liste) devient une carte de MODELÉ en niveaux de gris
#   (R = luminance / luminance de la robe, ÷2), G = masque des sabots, B = masque des blancs d'origine ;
#   les crins deviennent une carte de modelé grise (A = transparence). Le jeu recolore tout par shader.
# Usage : blender -b --factory-startup --disable-autoexec --python prep2.py -- <lyndon_prep.blend> <textures> <sortie.blend> <dossier aperçus>
import bpy, sys, os, math, bmesh
import numpy as np
from mathutils import Vector, Matrix, kdtree

a = sys.argv[sys.argv.index('--') + 1:]
src, texdir, out, prevdir = a[0], a[1], a[2], a[3]
os.makedirs(prevdir, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=src, load_ui=False)
arm = bpy.data.objects['HorseArmature']
me = bpy.data.objects['Horse']
mats = [m.name for m in me.data.materials]
BODY, EYE, HAIR = mats.index('horse_body'), mats.index('horse_eye'), mats.index('horse_hair')


def smooth(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def set_mode(m):
    bpy.context.view_layer.objects.active = arm
    for o in bpy.context.view_layer.objects:
        o.select_set(o == arm)
    bpy.ops.object.mode_set(mode=m)


# ------------------------------------------------------------------ renommage + recentrage
RENAME = {'Bone': 'Spine', 'Bone.001': 'Neck', 'Bone.002': 'Head', 'Bone.003': 'Tail1', 'Bone.004': 'Tail2'}
B = arm.data.bones
# côtés : selon le signe de x de la queue de l'os (pas selon le suffixe d'origine, incohérent)
for b in list(B):
    n = b.name
    if n in RENAME:
        continue
    side = 'L' if b.tail_local.x > B['Bone'].head_local.x else 'R'
    if n.startswith('Bone.001_'):
        RENAME[n] = 'Ear' + side
for chain in (('Bone_L', 'Bone_L.001', 'Bone_L.002'), ('Bone_R', 'Bone_R.001', 'Bone_R.002'),
              ('Bone_L.003', 'Bone_L.004', 'Bone_L.005'), ('Bone_R.003', 'Bone_R.004', 'Bone_R.005')):
    front = chain[0] in ('Bone_L', 'Bone_R')
    side = 'L' if B[chain[1]].head_local.x > B['Bone'].head_local.x else 'R'
    for i, n in enumerate(chain):
        RENAME[n] = ('F' if front else 'H') + side + str(i + 1)
print('RENAME', RENAME)
for o, n in RENAME.items():
    B[o].name = n
offset = -B['Spine'].head_local.x
print('recentrage x', offset)

orig = {b.name: (b.head_local.copy(), b.tail_local.copy()) for b in B}
set_mode('EDIT')
eb = arm.data.edit_bones
# (valeurs absolues : un os relié partage sa tête avec la queue de son parent, un incrément la décalerait deux fois)
for b in eb:
    h, t = orig[b.name]
    b.head = h + Vector((offset, 0, 0))
    b.tail = t + Vector((offset, 0, 0))
# symétrie parfaite des os centraux
for n in ('Spine', 'Neck', 'Head', 'Tail1', 'Tail2'):
    eb[n].head.x = 0.0
    eb[n].tail.x = 0.0
# oreilles : enfants de la tête, pivot à la base de l'oreille (pas au milieu de la nuque)
for n in ('EarL', 'EarR'):
    eb[n].use_connect = False
    eb[n].parent = eb['Head']
    eb[n].head = eb[n].head + (eb[n].tail - eb[n].head) * 0.38
bpy.ops.object.mode_set(mode='OBJECT')

# ------------------------------------------------------------------ mesures sur le maillage
mesh = me.data
vbody = set()
vhair = set()
for p in mesh.polygons:
    if p.material_index == BODY:
        vbody.update(p.vertices)
    elif p.material_index == HAIR:
        vhair.update(p.vertices)
P = [v.co.copy() for v in mesh.vertices]


def leg_points(sx, front):
    sel = [P[i] for i in vbody if P[i].x * sx > 0.05 and ((P[i].y < 0.1) if front else (P[i].y > 0.3)) and P[i].z < 0.6]
    def center(z0, z1):
        s = [p for p in sel if z0 <= p.z < z1]
        return Vector(((min(p.x for p in s) + max(p.x for p in s)) / 2, (min(p.y for p in s) + max(p.y for p in s)) / 2, (z0 + z1) / 2)), s
    sole, ss = center(-0.001, 0.025)
    toe = min(ss, key=lambda p: p.y)  # avant = -y
    heel = max(ss, key=lambda p: p.y)
    fet, _ = center(0.16, 0.24)
    return sole, fet, toe.y, heel.y


LEGS = {'FL': (1, True), 'FR': (-1, True), 'HL': (1, False), 'HR': (-1, False)}
legdata = {}
for k, (sx, front) in LEGS.items():
    sole, fet, toe_y, heel_y = leg_points(sx, front)
    fet.z = 0.19 if front else 0.20
    sole.z = 0.0
    legdata[k] = dict(sole=sole, fet=fet, toe=toe_y, heel=heel_y)
    print('LEGPTS', k, 'sole', tuple(round(v, 3) for v in sole), 'fet', tuple(round(v, 3) for v in fet), 'toe', round(toe_y, 3), 'heel', round(heel_y, 3))
# symétrise les points (moyenne des deux côtés)
for f in ('F', 'H'):
    L, R = legdata[f + 'L'], legdata[f + 'R']
    for key in ('sole', 'fet'):
        m = (L[key] + Vector((-R[key].x, R[key].y, R[key].z))) / 2
        L[key] = m.copy()
        R[key] = Vector((-m.x, m.y, m.z))

# ------------------------------------------------------------------ nouveaux os
set_mode('EDIT')
eb = arm.data.edit_bones
for k in LEGS:
    d = legdata[k]
    can = eb[k + '3']
    can.tail = d['fet'].copy()
    h = eb.new(k + '4')
    h.head = d['fet'].copy()
    h.tail = d['sole'].copy()
    h.parent = can
    h.use_connect = True
    h.roll = can.roll
# Respiration : au centre du tronc (entre coudes et grassets, mi-hauteur du ventre)
ribs = eb.new('Ribs')
ribs.head = Vector((0, 0.28, 1.04))
ribs.tail = Vector((0, 0.28, 1.24))
ribs.parent = eb['Spine']
ribs.use_connect = False
# Crinière : 4 os le long de la crête (repère : axe garrot -> nuque)
wN = eb['Neck'].head.copy()
pN = eb['Neck'].tail.copy()
bpy.ops.object.mode_set(mode='OBJECT')
axis = (pN - wN)
alen = axis.length
axis.normalize()
upn = Vector((0, axis.z, -axis.y))
if upn.z < 0:
    upn = -upn
body_pts = [P[i] for i in vbody]
crest = []
for t in [i / 24 for i in range(25)]:
    c = wN + axis * (alen * t)
    near = [p for p in body_pts if abs((p - c).dot(axis)) < 0.04 and abs(p.x) < 0.08]
    if not near:
        continue
    top = max(near, key=lambda p: (p - c).dot(upn))
    crest.append((t, Vector((0, top.y, top.z))))
print('CREST', [(round(t, 2), tuple(round(v, 3) for v in p)) for t, p in crest])
MANE_T = [0.12, 0.38, 0.62, 0.86]
def crest_at(t):
    best = min(crest, key=lambda c: abs(c[0] - t))
    return best[1]
set_mode('EDIT')
eb = arm.data.edit_bones
for i, t in enumerate(MANE_T):
    m = eb.new('Mane%d' % (i + 1))
    c = crest_at(t)
    m.head = c.copy()
    m.tail = c + Vector((0, 0, -0.2))
    m.parent = eb['Neck']
    m.use_connect = False
bpy.ops.object.mode_set(mode='OBJECT')
for b in arm.data.bones:
    print('BONE2', b.name, 'parent', b.parent.name if b.parent else None, 'head', tuple(round(v, 3) for v in b.head_local), 'tail', tuple(round(v, 3) for v in b.tail_local))

# ------------------------------------------------------------------ poids
vg = me.vertex_groups
for n in ['FL4', 'FR4', 'HL4', 'HR4', 'Ribs', 'Mane1', 'Mane2', 'Mane3', 'Mane4']:
    if n not in vg:
        vg.new(name=n)
gidx = {g.name: g.index for g in vg}
gname = {g.index: g.name for g in vg}

def weights(v):
    return {gname[g.group]: g.weight for g in v.groups if g.weight > 1e-5}

def set_weights(v, w):
    tot = sum(w.values()) or 1.0
    items = sorted(w.items(), key=lambda kv: -kv[1])[:4]
    tot = sum(x for _, x in items) or 1.0
    for g in list(v.groups):
        vg[g.group].remove([v.index])
    for n, x in items:
        if x / tot > 1e-4:
            vg[n].add([v.index], x / tot, 'REPLACE')

# UV : rayon depuis le centre de la texture des crins (racine au centre, pointes au bord)
bm = bmesh.new()
bm.from_mesh(mesh)
bm.verts.ensure_lookup_table()
uvl = bm.loops.layers.uv.active
hair_r = {}
for f in bm.faces:
    if f.material_index != HAIR:
        continue
    for l in f.loops:
        uv = l[uvl].uv
        hair_r[l.vert.index] = math.hypot(uv.x - 0.5, uv.y - 0.5)
bm.free()

ribs_c = Vector((0, 0.28, 1.04))
stats = {'hoof': 0, 'ribs': 0, 'mane': 0}
for v in mesh.vertices:
    w = weights(v)
    if not w:
        continue
    p = v.co
    changed = False
    # sabots : sous le boulet, le poids du canon passe à l'os du sabot
    for k in LEGS:
        c3 = w.get(k + '3', 0.0)
        if c3 > 0:
            fz = legdata[k]['fet'].z
            s = smooth(fz + 0.03, fz - 0.03, p.z)
            if s > 0:
                w[k + '4'] = w.get(k + '4', 0.0) + c3 * s
                w[k + '3'] = c3 * (1 - s)
                changed = True
                stats['hoof'] += 1
    # respiration : le tronc autour du centre (pas le dos, pas les membres)
    if v.index in vbody:
        q = (p - ribs_c)
        e = math.sqrt((q.x / 0.42) ** 2 + (q.y / 0.62) ** 2 + (q.z / 0.36) ** 2)
        f = (1 - smooth(0.55, 1.0, e)) * smooth(1.4, 1.2, p.z)
        sp = w.get('Spine', 0.0)
        if f > 0 and sp > 0:
            w['Ribs'] = w.get('Ribs', 0.0) + sp * f * 0.9
            w['Spine'] = sp * (1 - f * 0.9)
            changed = True
            stats['ribs'] += 1
    # crinière : la part « encolure » des mèches passe aux os de crinière, selon la distance à la racine
    if v.index in vhair and v.index in hair_r and p.y < 0:
        g = smooth(0.16, 0.42, hair_r[v.index])
        nk = w.get('Neck', 0.0)
        t = (p - wN).dot(axis) / alen
        ks = [max(0.0, 1 - abs(t - mt) / 0.26) for mt in MANE_T]
        sk = sum(ks)
        if g > 0 and nk > 0 and sk > 0:
            for i, k in enumerate(ks):
                if k > 0:
                    n = 'Mane%d' % (i + 1)
                    w[n] = w.get(n, 0.0) + nk * g * 0.92 * k / sk
            w['Neck'] = nk * (1 - g * 0.92)
            changed = True
            stats['mane'] += 1
    if changed:
        set_weights(v, w)
print('WEIGHTS', stats)

# ------------------------------------------------------------------ occlusion par sommet (rayons sur le maillage du corps)
from mathutils.bvhtree import BVHTree
dg = bpy.context.evaluated_depsgraph_get()
bvh = BVHTree.FromObject(me, dg)
import random
random.seed(3)
dirs = []
while len(dirs) < 40:
    d = Vector((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(-1, 1)))
    if 0.05 < d.length <= 1:
        dirs.append(d.normalized())
ao = np.ones(len(mesh.vertices), np.float32)
nrm = [v.normal.copy() for v in mesh.vertices]
for i in vbody:
    p = P[i]
    n = nrm[i]
    hits = 0
    tot = 0
    for d in dirs:
        c = d.dot(n)
        if c <= 0.05:
            continue
        tot += c
        loc, _, _, dist = bvh.ray_cast(p + n * 0.004, d, 0.35)
        if loc is not None:
            hits += c * (1 - dist / 0.35) ** 0.5
    o = 1 - hits / max(1e-6, tot)
    # le sol occulte aussi le bas du ventre et des membres
    o *= 0.75 + 0.25 * smooth(0.0, 0.5, p.z)
    ao[i] = o
print('AO mean', float(ao[list(vbody)].mean()), 'min', float(ao[list(vbody)].min()))
# stockée en couleur de sommet (COLOR_0.r : occlusion ; g : 1 = crins)
if 'hcol' in mesh.color_attributes:
    mesh.color_attributes.remove(mesh.color_attributes['hcol'])
ca = mesh.color_attributes.new('hcol', 'FLOAT_COLOR', 'POINT')
for i, v in enumerate(mesh.vertices):
    r = float(ao[i])
    ca.data[i].color = (r, 1.0 if i in vhair else 0.0, 0.0, 1.0)

# ------------------------------------------------------------------ textures
def load_np(name, size=None):
    im = bpy.data.images.load(os.path.join(texdir, name))
    if size and im.size[0] != size:
        im.scale(size, size)
    w, h = im.size
    arr = np.empty(w * h * 4, dtype=np.float32)
    im.pixels.foreach_get(arr)
    return arr.reshape(h, w, 4), im


def save_np(name, arr, path=None, colorspace='sRGB'):
    h, w = arr.shape[:2]
    im = bpy.data.images.new(name, w, h, alpha=True)
    im.colorspace_settings.name = colorspace
    im.pixels.foreach_set(np.ascontiguousarray(arr, dtype=np.float32).ravel())
    if path:
        im.filepath_raw = path
        im.file_format = 'PNG'
        im.save()
    return im


def srgb_to_lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def lin_to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def blur(a, r):
    # flou séparable (boîte répétée 3 fois ~ gaussienne)
    out = a.copy()
    for _ in range(3):
        for ax in (0, 1):
            c = np.cumsum(np.pad(out, [(r + 1, r) if i == ax else (0, 0) for i in range(out.ndim)], mode='edge'), axis=ax)
            if ax == 0:
                out = (c[2 * r + 1:] - c[:-2 * r - 1]) / (2 * r + 1)
            else:
                out = (c[:, 2 * r + 1:] - c[:, :-2 * r - 1]) / (2 * r + 1)
    return out


def push_pull(val, known):
    # remplit les trous (known = 0) par diffusion pyramidale des valeurs connues
    levels = []
    v, k = val * known, known.astype(np.float32)
    while v.shape[0] > 1:
        levels.append((v, k))
        h, w = v.shape
        v = v.reshape(h // 2, 2, w // 2, 2).sum((1, 3))
        k = k.reshape(h // 2, 2, w // 2, 2).sum((1, 3))
    fill = v / np.maximum(k, 1e-6)
    for v, k in reversed(levels):
        up = np.repeat(np.repeat(fill, 2, 0), 2, 1)
        cur = v / np.maximum(k, 1e-6)
        wk = np.clip(k, 0, 1)
        fill = cur * wk + up * (1 - wk)
    return fill


SIZE = 1024
col, _ = load_np('HorseMain2k00.png', SIZE)
srgb = col[..., :3]  # (pixels d'une image 8 bits : valeurs stockées, donc sRGB)
lin = srgb_to_lin(srgb)
mx = srgb.max(-1)
mn = srgb.min(-1)
sat = (mx - mn) / np.maximum(mx, 1e-6)
val = mx
# Position 3D de chaque texel : rastérisation des triangles du corps dans l'espace UV.
posmap = np.zeros((SIZE, SIZE, 3), np.float32)
inside = np.zeros((SIZE, SIZE), bool)
bm = bmesh.new()
bm.from_mesh(mesh)
bmesh.ops.triangulate(bm, faces=bm.faces[:])
uvl = bm.loops.layers.uv.active
for f in bm.faces:
    if f.material_index != BODY:
        continue
    uv = np.array([[l[uvl].uv.x * SIZE, l[uvl].uv.y * SIZE] for l in f.loops], np.float64)
    pp = np.array([tuple(l.vert.co) for l in f.loops], np.float64)
    x0, y0 = np.floor(uv.min(0)).astype(int)
    x1, y1 = np.ceil(uv.max(0)).astype(int)
    x0, y0 = max(x0, 0), max(y0, 0)
    x1, y1 = min(x1, SIZE - 1), min(y1, SIZE - 1)
    if x1 < x0 or y1 < y0:
        continue
    xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
    (ax, ay), (bx, by), (cx, cy) = uv
    den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
    if abs(den) < 1e-12:
        continue
    l1 = ((by - cy) * (xs - cx) + (cx - bx) * (ys - cy)) / den
    l2 = ((cy - ay) * (xs - cx) + (ax - cx) * (ys - cy)) / den
    l3 = 1 - l1 - l2
    m = (l1 >= -0.02) & (l2 >= -0.02) & (l3 >= -0.02)
    if not m.any():
        continue
    P3 = l1[..., None] * pp[0] + l2[..., None] * pp[1] + l3[..., None] * pp[2]
    sub = posmap[y0:y1 + 1, x0:x1 + 1]
    sub[m] = P3[m]
    inside[y0:y1 + 1, x0:x1 + 1] |= m
bm.free()
# (image Blender : ligne 0 en bas = v = 0, comme nos UV : pas de retournement)
z = posmap[..., 2]
ypos = posmap[..., 1]
xpos = posmap[..., 0]
leg = inside & (z < 0.62) & (np.abs(xpos) > 0.06)
hoof = leg & (z < 0.128)  # (couronne : la photo de corne s'arrête vers 12,8 cm)
hoofSoft = np.clip((0.138 - z) / 0.02, 0, 1) * leg
white = inside & (val > 0.6) & (sat < 0.32) & ~hoof
# (pas de blanc pris dans les yeux ni la bouche)
L = 0.2126 * lin[..., 0] + 0.7152 * lin[..., 1] + 0.0722 * lin[..., 2]
coat = inside & ~white & ~hoof
Lref = float(np.median(L[coat]))
Lhoof = float(np.median(L[hoof])) if hoof.any() else Lref
print('TEX coat median L', Lref, 'hoof', Lhoof, 'white texels', int(white.sum()), 'hoof texels', int(hoof.sum()), 'inside', int(inside.sum()))
det = np.zeros_like(L)
det[coat] = L[coat] / Lref
# blancs (balzanes, liste, mouchetures) : modelé de la robe voisine + grain du poil des blancs
fill = push_pull(np.where(coat, det, 0), coat.astype(np.float32))
Lb = blur(L, 3)
hf = np.clip(L / np.maximum(Lb, 1e-5), 0.75, 1.3) ** 0.6
det = np.where(coat, det, fill * np.where(white, hf, 1.0))
# sabots : leur propre modelé (corne)
det = np.where(hoof, L / Lhoof, det)
# hors des îlots : valeur voisine (pas de bord noir au filtrage)
known = inside.astype(np.float32)
det = np.where(inside, det, push_pull(np.where(inside, det, 0), known))
det = np.clip(det, 0, 1.98)
# adoucit un peu les grandes variations de teinte peintes (on garde le relief des muscles et le grain)
low = blur(det, 24)
det = det / np.maximum(low, 1e-4) * (1 + (low - 1) * 0.7)
det = np.clip(det, 0, 1.98)
whiteSoft = np.clip(blur(white.astype(np.float32), 1) * 1.2, 0, 1)
hoofM = np.clip(blur(hoofSoft.astype(np.float32), 1), 0, 1)
packed = np.zeros((SIZE, SIZE, 4), np.float32)
# (gris : le détail passe par la luminance en WebP, sans fuite entre canaux ; A = masque des sabots)
packed[..., 0] = det / 2
packed[..., 1] = det / 2
packed[..., 2] = det / 2
packed[..., 3] = 1  # (pas de masque en alpha : le WebP efface le gris sous les pixels transparents ; sabots = hauteur au repos)
print('DETAIL mean on coat', float(det[coat].mean()), 'p5/p95', float(np.percentile(det[coat], 5)), float(np.percentile(det[coat], 95)))
im_body = save_np('horse_body_detail', packed, os.path.join(prevdir, 'horse_body_detail.png'), 'Non-Color')
# aperçu : robe baie reconstituée
prev = np.zeros_like(packed)
coatC = np.array([0.42, 0.18, 0.08])
prev[..., :3] = lin_to_srgb(coatC[None, None] * det[..., None] * (1 - hoofM[..., None]) + np.array([0.12, 0.11, 0.1])[None, None] * det[..., None] * hoofM[..., None])
prev[..., 3] = 1
save_np('prev_bay', prev, os.path.join(prevdir, 'apercu_bai.png'))

# Crins : modelé gris + transparence
hc, _ = load_np('Hair12Main2k.png', SIZE)
hcl = srgb_to_lin(hc[..., :3])
hl = 0.2126 * hcl[..., 0] + 0.7152 * hcl[..., 1] + 0.0722 * hcl[..., 2]
ha = hc[..., 3]
Lh = float(np.median(hl[ha > 0.5]))
hd = np.clip(hl / Lh, 0, 1.98)
hd = np.where(ha > 0.02, hd, push_pull(np.where(ha > 0.02, hd, 0), (ha > 0.02).astype(np.float32)))
hpack = np.zeros((SIZE, SIZE, 4), np.float32)
hpack[..., 0] = hpack[..., 1] = hpack[..., 2] = hd / 2
hpack[..., 3] = ha
print('HAIR median L', Lh)
im_hair = save_np('horse_hair_detail', hpack, os.path.join(prevdir, 'horse_hair_detail.png'), 'Non-Color')

# Cartes de relief : 1024 (corps), 512 (crins)
def load_nrm(name, size):
    im = bpy.data.images.load(os.path.join(texdir, name))
    im.colorspace_settings.name = 'Non-Color'
    im.scale(size, size)
    im.name = name.replace('.png', '')
    return im
nb = load_nrm('HorseMain2k00Norm00.png', 1024)
nh = load_nrm('Hair12Main2kNorm.png', 512)

# ------------------------------------------------------------------ matériaux (export glTF)
def make_mat(name, base, nrm, alpha=False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = 0.7
    t = nt.nodes.new('ShaderNodeTexImage')
    t.image = base
    nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
    if alpha:
        nt.links.new(t.outputs['Alpha'], bsdf.inputs['Alpha'])
        m.blend_method = 'CLIP'
        m.alpha_threshold = 0.4
    tn = nt.nodes.new('ShaderNodeTexImage')
    tn.image = nrm
    nm = nt.nodes.new('ShaderNodeNormalMap')
    nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
    nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    return m

mb = make_mat('horse_coat', im_body, nb)
mh = make_mat('horse_mane', im_hair, nh, alpha=True)
# (remplacement par emplacement : materials.clear() remettrait toutes les faces sur le premier matériau)
me.data.materials[BODY] = mb
me.data.materials[HAIR] = mh
print('MATS', [m.name for m in me.data.materials], {i: sum(1 for p in me.data.polygons if p.material_index == i) for i in range(3)})
for im in bpy.data.images:
    if im.users and not im.packed_file and im.size[0] > 0:
        try:
            im.pack()
        except Exception as e:
            print('pack fail', im.name, e)
bpy.ops.wm.save_as_mainfile(filepath=out, compress=True)
print('SAVED', out)
