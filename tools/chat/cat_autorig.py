# Squelette automatique d'un chat (Blender 4.2), d'après autorig.py du Jack Russell (tools/chien/autorig.py) :
# repères trouvés sur le maillage (pattes au sol, colonnes des membres, garrot, tête, museau, queue suivie le long
# de sa ligne médiane par anneaux géodésiques, oreilles dressées), articulations placées selon les proportions d'un
# chat (digitigrade, jarret haut), poids par diffusion de chaleur (repli : os le plus proche), oreilles pondérées à
# la main (cône au-dessus du crâne), yeux liés à leur os, accessoires (moustaches, griffes) pondérés comme la peau
# la plus proche.
# Repère : avant = -Y, haut = +Z, sol z = 0, gauche = +X. Noms d'os (sans point, comme les chiens du jeu) :
# root, pelvis, spine1, spine2, spine3, chest, neck1, neck2, head, eyeL/eyeR, ear1L/ear2L, ear1R/ear2R,
# tail1..tailN, scapL/R, humerusL/R, radiusL/R, metacarpusL/R, toesL/R, femurL/R, tibiaL/R, metatarsusL/R, htoesL/R.
import bpy, math, heapq
from mathutils import Vector
import catkit as K


def _smooth(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def _band(pts, z, h):
    return [p for p in pts if abs(p.z - z) < h]


def _adjacency(me):
    adj = [[] for _ in me.vertices]
    for e in me.edges:
        a, b = e.vertices
        adj[a].append(b)
        adj[b].append(a)
    return adj


def tail_chain(body, hip, W, n_bones=8, opts=None):
    """Ligne médiane de la queue : bout = sommet derrière les hanches le plus loin de la hanche ; distances
    géodésiques depuis le bout (Dijkstra sur les arêtes) ; anneaux de sommets à distance égale : centre et rayon ;
    la base est l'anneau où le rayon double (la queue s'ouvre sur la croupe). Renvoie n_bones + 1 points (base -> bout)
    et l'ensemble des sommets de la queue."""
    o = opts or {}
    me = body.data
    pts = [body.matrix_world @ v.co for v in me.vertices]
    behind = [i for i, p in enumerate(pts) if p.y > hip.y + o.get('tail_behind', 0.12) * W]
    # (sans les pattes arrière : près du sol et près de l'axe d'une patte, ce n'est pas la queue)
    cols = o.get('_hind_cols') or []
    def in_leg(p):
        if p.z > 0.6 * W:
            return False
        for c in cols:
            if math.hypot(p.x - c.x, p.y - c.y) < o.get('leg_r', 0.16) * W:
                return True
        return False
    behind = [i for i in behind if not in_leg(pts[i])]
    tip = max(behind, key=lambda i: (pts[i] - hip).length)
    adj = _adjacency(me)
    INF = 1e9
    g = [INF] * len(pts)
    g[tip] = 0.0
    heap = [(0.0, tip)]
    while heap:
        d, i = heapq.heappop(heap)
        if d > g[i]:
            continue
        for j in adj[i]:
            nd = d + (pts[i] - pts[j]).length
            if nd < g[j]:
                g[j] = nd
                heapq.heappush(heap, (nd, j))
    ds = o.get('tail_ds', 0.025) * W
    rings = []
    s = 0.0
    gmax = max(x for x in g if x < INF)
    while s < gmax:
        ring = [pts[i] for i in range(len(pts)) if s <= g[i] < s + ds]
        if len(ring) >= 3:
            c = sum(ring, Vector()) / len(ring)
            r = sum((p - c).length for p in ring) / len(ring)
            rings.append((s + ds / 2, c, r, len(ring)))
        s += ds
    # base : premier anneau (après un tiers de queue au moins) dont le rayon dépasse 1,9 fois la médiane des précédents
    base_k = len(rings) - 1
    for k in range(4, len(rings)):
        prev = sorted(r[2] for r in rings[:k])
        med = prev[len(prev) // 2]
        if rings[k][2] > o.get('tail_jump', 1.9) * med and rings[k][0] > o.get('tail_min', 0.5) * W:
            base_k = k - 1
            break
    sb = rings[base_k][0]
    print('TAIL bout', tuple(round(v, 3) for v in pts[tip]), 'longueur géodésique', round(sb, 3), 'anneaux', base_k + 1, 'rayon base', round(rings[base_k][2], 4))
    # points à distances égales de la base au bout
    def at(sv):
        if sv <= rings[0][0]:
            return pts[tip].copy() if sv <= 0 else rings[0][1].lerp(pts[tip], 1 - sv / rings[0][0])
        for k in range(1, len(rings)):
            if rings[k][0] >= sv:
                a, b = rings[k - 1], rings[k]
                t = (sv - a[0]) / (b[0] - a[0])
                return a[1].lerp(b[1], t)
        return rings[-1][1].copy()
    chain = [at(sb * (1 - k / n_bones)) for k in range(n_bones + 1)]
    chain[-1] = pts[tip].copy()
    tail_verts = {i for i in range(len(pts)) if g[i] <= sb}
    return chain, tail_verts, rings[base_k][2]


def ear_cones(body, head_pts_idx, pts, W, opts=None):
    """Oreilles dressées : pointe = sommet le plus haut de chaque côté de la tête ; base = au pied du cône, sur le
    crâne (hauteur du haut du crâne au milieu) ; sommets de l'oreille = ceux de la tête de ce côté au-dessus du pied,
    près de la pointe."""
    o = opts or {}
    hp = [pts[i] for i in head_pts_idx]
    xs = [p.x for p in hp]
    hw = max(xs) - min(xs)
    mid = [p for p in hp if abs(p.x) < 0.12 * hw]
    skull = max(p.z for p in mid) if mid else max(p.z for p in hp)
    ears = {}
    for side, s in (('L', 1), ('R', -1)):
        cand = [i for i in head_pts_idx if pts[i].x * s > 0.08 * hw]
        if not cand:
            continue
        tip_i = max(cand, key=lambda i: pts[i].z)
        tip = pts[tip_i]
        # haut du crâne au milieu, à la hauteur (en y) de la pointe : les oreilles couchées en arrière dépassent peu
        # du sommet du crâne situé derrière elles
        mid_y = [p for p in mid if abs(p.y - tip.y) < o.get('ear_band', 0.05) * W]
        sk = max(p.z for p in mid_y) if mid_y else skull
        h = tip.z - sk
        skull_s = sk
        if h < o.get('ear_min', 0.06) * W:
            print('AUTORIG oreille', side, 'trop basse', round(h, 4))
            continue
        foot_z = skull_s - o.get('ear_foot', 0.25) * h
        R = o.get('ear_r', 1.35) * (tip.z - foot_z)
        verts = [i for i in cand if pts[i].z > foot_z and (pts[i] - tip).length < R]
        base_pts = [pts[i] for i in verts if pts[i].z < foot_z + 0.35 * (tip.z - foot_z)]
        base = sum(base_pts, Vector()) / len(base_pts) if base_pts else Vector((tip.x * 0.8, tip.y, foot_z))
        base = Vector((base.x, base.y, foot_z))
        mid_p = base.lerp(tip, 0.5)
        ears[side] = dict(root=base, fold=mid_p, tip=tip.copy(), verts=verts, foot_z=foot_z)
        print('AUTORIG oreille', side, len(verts), 'base', tuple(round(v, 3) for v in base), 'pointe', tuple(round(v, 3) for v in tip))
    return ears


def build(body, others=(), eyes=(), opts=None):
    o = dict(opts or {})
    pts = [body.matrix_world @ v.co for v in body.data.vertices]
    H = max(p.z for p in pts)
    ymin = min(p.y for p in pts); ymax = max(p.y for p in pts)
    L = ymax - ymin
    # --- pattes au sol
    low = [p for p in pts if p.z < o.get('paw_h', 0.035) * H]
    ymid = (min(p.y for p in low) + max(p.y for p in low)) / 2
    if o.get('paw_ymid') is not None:
        ymid = o['paw_ymid']
    paws = {}
    for lab, fx, fy in (('FL', 1, -1), ('FR', -1, -1), ('HL', 1, 1), ('HR', -1, 1)):
        sel = [p for p in low if (p.x > 0) == (fx > 0) and (p.y > ymid) == (fy > 0)]
        c = Vector((sum(p.x for p in sel) / len(sel), sum(p.y for p in sel) / len(sel), 0.0))
        paws[lab] = dict(c=c, tip_y=min(p.y for p in sel), heel_y=max(p.y for p in sel))

    # --- colonnes des membres (centre des sections, de la patte vers le haut)
    def column(lab, z_to):
        c = paws[lab]['c'].copy()
        out = []
        z = 0.03 * H
        R = o.get('col_r', 0.09) * H
        while z < z_to:
            sel = [p for p in _band(pts, z, 0.012 * H) if (p - Vector((c.x, c.y, p.z))).length < R and (p.x > 0) == (c.x > 0)]
            if len(sel) < 3:
                break
            c = Vector((sum(p.x for p in sel) / len(sel), sum(p.y for p in sel) / len(sel), z))
            out.append((z, c.copy(), min(p.y for p in sel), max(p.y for p in sel)))
            z += 0.02 * H
        return out
    col = {lab: column(lab, 0.75 * H) for lab in paws}

    def at(lab, z):
        return min(col[lab], key=lambda r: abs(r[0] - z))

    # --- garrot
    fy = (paws['FL']['c'].y + paws['FR']['c'].y) / 2
    hy = (paws['HL']['c'].y + paws['HR']['c'].y) / 2
    wy = fy + o.get('withers_back', 0.05) * L
    W = max(p.z for p in pts if abs(p.y - wy) < 0.03 * L and abs(p.x) < 0.25 * H)
    print('AUTORIG H', round(H, 3), 'L', round(L, 3), 'W', round(W, 3), 'front y', round(fy, 3), 'hind y', round(hy, 3))
    J = {}
    for side, sx in (('L', 1), ('R', -1)):
        f = 'F' + side; h = 'H' + side
        m3 = at(f, 0.05 * W); m2 = at(f, o.get('carpus', 0.15) * W); m1 = at(f, o.get('elbow', 0.46) * W)
        j3 = Vector((m3[1].x, m3[1].y + 0.02 * W, 0.05 * W))
        j2 = Vector((m2[1].x, m2[1].y + 0.01 * W, o.get('carpus', 0.15) * W))
        j1 = Vector((m1[1].x * 0.95, m1[3] - 0.04 * W, o.get('elbow', 0.46) * W))
        j0 = Vector((j1.x * 0.9, j1.y - o.get('shoulder_fwd', 0.12) * W, o.get('shoulder', 0.68) * W))
        sc = Vector((j0.x * 0.55, j0.y + 0.14 * W, 0.92 * W))
        tip = Vector((j3.x, paws[f]['tip_y'], 0.0))
        J[f] = [sc, j0, j1, j2, j3, tip]
        n3 = at(h, 0.05 * W); n2 = at(h, o.get('hock', 0.30) * W); n1 = at(h, o.get('stifle', 0.50) * W)
        k3 = Vector((n3[1].x, n3[1].y + 0.03 * W, 0.05 * W))
        k2 = Vector((n2[1].x, n2[3] - 0.035 * W, o.get('hock', 0.30) * W))
        k0 = Vector((n1[1].x * 0.85, paws[h]['c'].y + o.get('hip_dy', -0.08) * W, o.get('hip', 0.74) * W))
        k1 = Vector((n1[1].x, k0.y - o.get('stifle_fwd', 0.16) * W, o.get('stifle', 0.50) * W))
        tip = Vector((k3.x, paws[h]['tip_y'], 0.0))
        J[h] = [k0, k1, k2, k3, tip]
    hip_y = (J['HL'][0].y + J['HR'][0].y) / 2
    sh_y = (J['FL'][1].y + J['FR'][1].y) / 2
    hip = Vector((0.0, hip_y, 0.80 * W))
    # --- tête : museau, yeux, crâne
    head_idx = [i for i, p in enumerate(pts) if p.y < sh_y - o.get('head_back', 0.10) * W and p.z > o.get('head_z', 0.62) * W]
    head_pts = [pts[i] for i in head_idx]
    muz = min(head_pts, key=lambda p: p.y)
    if eyes:
        ep = [e.matrix_world @ v.co for e in eyes for v in e.data.vertices]
    else:
        ep = []
    EL = [p for p in ep if p.x > 0]
    ER = [p for p in ep if p.x < 0]
    if EL and ER:
        eL = sum(EL, Vector()) / len(EL)
        eR = sum(ER, Vector()) / len(ER)
    else:
        # sans yeux séparés : à mi-chemin entre museau et haut du crâne, au tiers avant de la tête
        hy0 = muz.y
        hz = max(p.z for p in head_pts)
        ey = hy0 + 0.30 * (max(p.y for p in head_pts) - hy0)
        ring = [p for p in head_pts if abs(p.y - ey) < 0.03 * W]
        hwid = max(p.x for p in ring) if ring else 0.1 * W
        ez = muz.z + 0.45 * (hz - muz.z)
        eL = Vector((0.45 * hwid, ey, ez)); eR = Vector((-0.45 * hwid, ey, ez))
    E = (eL + eR) / 2
    dem = abs(E.y - muz.y)
    skull = Vector((0.0, E.y + o.get('skull_back', 1.3) * dem, E.z - 0.15 * dem))
    muzzle = Vector((0.0, muz.y + 0.02 * dem, muz.z))
    neck0 = Vector((0.0, sh_y + o.get('neck_back', 0.05) * W, o.get('neck_z', 0.84) * W))
    neck1 = (neck0 + skull) / 2 + Vector((0, 0, 0.03 * W))
    # --- queue
    o['_hind_cols'] = [paws[k]['c'] for k in ('HL', 'HR')] + [r[1] for k in ('HL', 'HR') for r in col[k]]
    chain, tail_verts, tail_r = tail_chain(body, hip, W, o.get('tail_bones', 8), o)
    # --- oreilles
    ears = ear_cones(body, head_idx, pts, W, o)
    # --- armature
    arm_d = bpy.data.armatures.new('CatArmature')
    arm = bpy.data.objects.new('CatArmature', arm_d)
    bpy.context.scene.collection.objects.link(arm)
    K.select_only([arm])
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm_d.edit_bones

    def bone(name, h, t, parent=None, connect=False):
        b = eb.new(name); b.head = h; b.tail = t; b.roll = 0.0
        if parent:
            b.parent = eb[parent]; b.use_connect = connect
        return b
    pelvis = Vector((0.0, hip_y, o.get('pelvis_z', 0.78) * W))
    chest = Vector((0.0, sh_y + 0.12 * W, o.get('chest_z', 0.76) * W))
    sp = [pelvis.lerp(chest, k / 4) + Vector((0, 0, o.get('spine_arch', 0.04) * W * math.sin(math.pi * k / 4))) for k in range(5)]
    mid = pelvis.lerp(chest, 0.5)
    bone('root', mid, mid + Vector((0, 0, 0.1 * W)))
    bone('pelvis', sp[0], sp[1], 'root')
    bone('spine1', sp[1], sp[2], 'pelvis', True)
    bone('spine2', sp[2], sp[3], 'spine1', True)
    bone('spine3', sp[3], chest, 'spine2', True)
    bone('chest', chest, neck0, 'spine3', True)
    bone('neck1', neck0, neck1, 'chest', True)
    bone('neck2', neck1, skull, 'neck1', True)
    bone('head', skull, muzzle, 'neck2', True)
    if eyes:
        for side, e in (('L', eL), ('R', eR)):
            bone('eye' + side, e, e + Vector((0, -0.04 * W, 0)), 'head')
    for side, e in ears.items():
        bone('ear1' + side, e['root'], e['fold'], 'head')
        bone('ear2' + side, e['fold'], e['tip'], 'ear1' + side, True)
    nt = len(chain) - 1
    bone('tail1', chain[0], chain[1], 'pelvis')
    for k in range(2, nt + 1):
        bone('tail%d' % k, chain[k - 1], chain[k], 'tail%d' % (k - 1), True)
    for side in ('L', 'R'):
        sc, j0, j1, j2, j3, tip = J['F' + side]
        bone('scap' + side, sc, j0, 'chest')
        bone('humerus' + side, j0, j1, 'scap' + side, True)
        bone('radius' + side, j1, j2, 'humerus' + side, True)
        bone('metacarpus' + side, j2, j3, 'radius' + side, True)
        bone('toes' + side, j3, tip + Vector((0, 0, 0.02 * W)), 'metacarpus' + side, True)
        k0, k1, k2, k3, tip = J['H' + side]
        bone('femur' + side, k0, k1, 'pelvis')
        if o.get('haunch'):
            # os correctif de la hanche : tourne de la moitié du fémur (voir make_cat.py, haunch_post) ; il porte la
            # peau entre le flanc et la cuisse, qui ne se déchire plus quand la cuisse se replie (assis)
            bone('haunch' + side, k0, k0.lerp(k1, 0.5), 'pelvis')
        bone('tibia' + side, k1, k2, 'femur' + side, True)
        bone('metatarsus' + side, k2, k3, 'tibia' + side, True)
        bone('htoes' + side, k3, tip + Vector((0, 0, 0.02 * W)), 'metatarsus' + side, True)
    bpy.ops.object.mode_set(mode='OBJECT')
    # --- poids : diffusion de chaleur sans les os des oreilles, des yeux ni la racine (pondérés ensuite)
    nodef = {'root'} | {b.name for b in arm_d.bones if b.name.startswith(('ear', 'eye', 'haunch'))}
    for b in arm_d.bones:
        b.use_deform = b.name not in nodef
    def heat(scale):
        # (la diffusion de chaleur échoue parfois sur un petit maillage : on la refait sur le chat agrandi)
        for ob in (body, arm):
            ob.scale = (scale, scale, scale)
        bpy.context.view_layer.update()
        body.vertex_groups.clear()
        K.select_only([body, arm])
        bpy.context.view_layer.objects.active = arm
        bpy.ops.object.parent_set(type='ARMATURE_AUTO')
        mw = body.matrix_world.copy(); body.parent = None; body.matrix_world = mw
        for ob in (body, arm):
            ob.scale = (1, 1, 1)
        bpy.context.view_layer.update()
        return sum(1 for v in body.data.vertices if not v.groups or max(g.weight for g in v.groups) < 1e-4)
    for sc in o.get('heat_scales', (1.0, 10.0, 100.0)):
        for m in list(body.modifiers):
            if m.type == 'ARMATURE':
                body.modifiers.remove(m)
        miss = heat(sc)
        print('AUTORIG chaleur échelle', sc, 'sommets sans poids', miss)
        if miss < 0.02 * len(body.data.vertices):
            break
    for b in arm_d.bones:
        b.use_deform = True
    segs = {b.name: (b.head_local, b.tail_local) for b in arm.data.bones if b.name not in nodef}

    def nearest_bone(p, names=None):
        def dseg(s):
            h, t = s; d = t - h; u = max(0, min(1, (p - h).dot(d) / d.length_squared)); return (p - (h + d * u)).length
        return min(names or segs, key=lambda n: dseg(segs[n]))
    empty = [v.index for v in body.data.vertices if not v.groups or max(g.weight for g in v.groups) < 1e-4]
    print('AUTORIG sommets sans poids', len(empty), 'sur', len(body.data.vertices))
    for vi in empty:
        p = body.matrix_world @ body.data.vertices[vi].co
        best = nearest_bone(p)
        if best not in body.vertex_groups:
            body.vertex_groups.new(name=best)
        body.vertex_groups[best].add([vi], 1.0, 'REPLACE')
    # bas des membres : la chaleur étalait les poids de l'avant-bras et de la jambe sur le poitrail, le ventre et le flanc
    # (jusqu'à 10 cm de l'os chez le chaton, bien au-dessus du coude et du grasset) ; assis, la jambe repliée en arrière
    # tirait le flanc en voile déchiré, et la patte levée étirait le poitrail. Au-dessus de l'articulation haute de l'os
    # et loin de lui, la part de ces os revient au bras ou à la cuisse.
    gidx = {g.index: g for g in body.vertex_groups}
    for side in ('L', 'R'):
        for low_names, top in ((('radius', 'metacarpus', 'toes'), 'humerus'), (('tibia', 'metatarsus', 'htoes'), 'femur')):
            gt = body.vertex_groups.get(top + side)
            if gt is None:
                continue
            for ln in low_names:
                g = body.vertex_groups.get(ln + side)
                if g is None or ln + side not in segs:
                    continue
                h, t = segs[ln + side]
                d = t - h
                zt = max(h.z, t.z)
                for v in body.data.vertices:
                    w = next((e.weight for e in v.groups if e.group == g.index), 0.0)
                    if w <= 0:
                        continue
                    p = body.matrix_world @ v.co
                    u = max(0.0, min(1.0, (p - h).dot(d) / d.length_squared))
                    dist = (p - (h + d * u)).length
                    keep = (1 - _smooth(o.get('leg_r0', 0.15) * W, o.get('leg_r1', 0.24) * W, dist)) * (1 - _smooth(zt + 0.03 * W, zt + 0.1 * W, p.z))
                    if keep >= 0.999:
                        continue
                    wt = next((e.weight for e in v.groups if e.group == gt.index), 0.0)
                    g.add([v.index], w * keep, 'REPLACE')
                    gt.add([v.index], wt + w * (1 - keep), 'REPLACE')
    # tête rigide : au-delà de l'articulation crâne-encolure, la peau suit la seule tête (la chaleur la partageait avec
    # l'encolure : oreilles écrasées et visage déformé dès que la tête s'inclinait sur l'encolure)
    hd = (skull - neck1).normalized()
    band = o.get('head_band', 0.45) * dem
    ghead = body.vertex_groups.get('head') or body.vertex_groups.new(name='head')
    gidx = {g.index: g for g in body.vertex_groups}
    for v in body.data.vertices:
        p = body.matrix_world @ v.co
        u = (p - skull).dot(hd)
        if u < -band:
            continue
        k = _smooth(-band, band, u)
        ws = [(gidx[e.group], e.weight) for e in v.groups]
        wh = 0.0
        for g, w in ws:
            if g.name == 'head':
                wh = w
            else:
                g.add([v.index], w * (1 - k), 'REPLACE')
        ghead.add([v.index], wh * (1 - k) + k, 'REPLACE')
    # queue : les sommets de la queue ne prennent que les os de la queue (la chaleur débordait sur les cuisses)
    tnames = ['tail%d' % k for k in range(1, nt + 1)]
    gidx = {g.index: g for g in body.vertex_groups}
    for vi in tail_verts:
        v = body.data.vertices[vi]
        p = body.matrix_world @ v.co
        ws = {gidx[e.group].name: e.weight for e in v.groups}
        tw = sum(w for n, w in ws.items() if n in tnames)
        if tw < 0.3:
            b = nearest_bone(p, tnames)
            for n in ws:
                body.vertex_groups[n].remove([vi])
            if b not in body.vertex_groups:
                body.vertex_groups.new(name=b)
            body.vertex_groups[b].add([vi], 1.0, 'REPLACE')
        elif tw < 0.999:
            for n, w in ws.items():
                if n not in tnames:
                    body.vertex_groups[n].remove([vi])
                else:
                    body.vertex_groups[n].add([vi], w / tw, 'REPLACE')
    # oreilles : au-dessus du pied -> ear1 puis ear2 vers la pointe, fondu avec la tête au pied
    for side, e in ears.items():
        g1 = body.vertex_groups.new(name='ear1' + side)
        g2 = body.vertex_groups.new(name='ear2' + side)
        Rt, T = e['root'], e['tip']
        dz = T.z - e['foot_z']
        for vi in e['verts']:
            p = body.matrix_world @ body.data.vertices[vi].co
            u = (p.z - e['foot_z']) / dz
            wbase = _smooth(0.0, 0.3, u)
            w2 = _smooth(0.45, 0.75, u)
            gname = {g.index: g for g in body.vertex_groups}
            pairs = [(gname[x.group], x.weight) for x in body.data.vertices[vi].groups]
            for g, w in pairs:
                if g.name not in ('ear1' + side, 'ear2' + side):
                    g.add([vi], w * (1 - wbase), 'REPLACE')
            g1.add([vi], wbase * (1 - w2), 'REPLACE')
            g2.add([vi], wbase * w2, 'REPLACE')
    # fesses (comme le jack) : l'arrière du haut de la cuisse suit en partie le bassin
    if o.get('buttock'):
        gp_ = body.vertex_groups.get('pelvis') or body.vertex_groups.new(name='pelvis')
        for side in ('L', 'R'):
            gf = body.vertex_groups.get('femur' + side)
            if gf is None:
                continue
            k0, k1 = J['H' + side][0], J['H' + side][1]
            for v in body.data.vertices:
                wf = next((x.weight for x in v.groups if x.group == gf.index), 0.0)
                if wf <= 0:
                    continue
                p = body.matrix_world @ v.co
                if (p.x > 0) != (k0.x > 0):
                    continue
                k = o['buttock'] * _smooth(k0.y - 0.02 * W, k0.y + 0.10 * W, p.y) * _smooth(k1.z - 0.02 * W, k1.z + 0.12 * W, p.z)
                if k <= 0:
                    continue
                wp = next((x.weight for x in v.groups if x.group == gp_.index), 0.0)
                gf.add([v.index], wf * (1 - k), 'REPLACE')
                gp_.add([v.index], wp + wf * k, 'REPLACE')
    # haut de la cuisse fondu dans le bassin (chaton) : le long du fémur, depuis la hanche, la part du fémur passe peu
    # à peu au bassin sur le premier tiers (et au-dessus de la hanche) ; la peau du flanc ne pivote plus d'un bloc avec
    # la cuisse quand le chat s'assoit (fémur levé vers l'avant : le haut de la cuisse sortait du flanc, déchiré)
    if o.get('thigh_blend'):
        gp_ = body.vertex_groups.get('pelvis') or body.vertex_groups.new(name='pelvis')
        for side in ('L', 'R'):
            gf = body.vertex_groups.get('femur' + side)
            if gf is None:
                continue
            k0, k1 = J['H' + side][0], J['H' + side][1]
            ax = k1 - k0
            fl = ax.length
            ax.normalize()
            for v in body.data.vertices:
                wf = next((x.weight for x in v.groups if x.group == gf.index), 0.0)
                if wf <= 0:
                    continue
                p = body.matrix_world @ v.co
                if (p.x > 0) != (k0.x > 0):
                    continue
                u = (p - k0).dot(ax) / fl
                k = o['thigh_blend'] * 0.55 * (1 - _smooth(-0.15, 0.5, u))
                k = max(k, o['thigh_blend'] * 0.5 * _smooth(k0.z - 0.02 * W, k0.z + 0.08 * W, p.z))
                if k <= 0:
                    continue
                wp = next((x.weight for x in v.groups if x.group == gp_.index), 0.0)
                gf.add([v.index], wf * (1 - k), 'REPLACE')
                gp_.add([v.index], wp + wf * k, 'REPLACE')
    # os correctif de la hanche : dans la bande de passage entre le bassin et la cuisse (autour de la hanche, le long du
    # fémur), une part des poids du fémur et du bassin passe à l'os qui tourne de moitié
    if o.get('haunch'):
        for side in ('L', 'R'):
            gf = body.vertex_groups.get('femur' + side)
            if gf is None:
                continue
            gh = body.vertex_groups.new(name='haunch' + side)
            gidx = {g.index: g for g in body.vertex_groups}
            k0, k1 = J['H' + side][0], J['H' + side][1]
            ax = k1 - k0
            fl = ax.length
            ax.normalize()
            for v in body.data.vertices:
                p = body.matrix_world @ v.co
                if (p.x > 0) != (k0.x > 0):
                    continue
                d = (p - k0).length / fl
                if d > 1.1:
                    continue
                u = (p - k0).dot(ax) / fl
                ws = [(gidx[e.group], e.weight) for e in v.groups]
                share = sum(w for g, w in ws if g.name in ('femur' + side, 'pelvis', 'spine1'))
                if share <= 0:
                    continue
                h = o['haunch'] * (1 - _smooth(0.2, 0.65, u)) * _smooth(-0.6, -0.1, u) * (1 - _smooth(0.6, 1.1, d))
                if h <= 0:
                    continue
                for g, w in ws:
                    if g.name in ('femur' + side, 'pelvis', 'spine1'):
                        g.add([v.index], w * (1 - h), 'REPLACE')
                gh.add([v.index], share * h, 'REPLACE')
    # yeux : chacun suit son os ; accessoires : poids de la peau la plus proche (transfert de données)
    for ob in others:
        if not ob.data.vertices:
            continue
        dt = ob.modifiers.new('DT', 'DATA_TRANSFER')
        dt.object = body
        dt.use_vert_data = True
        dt.data_types_verts = {'VGROUP_WEIGHTS'}
        dt.vert_mapping = 'POLYINTERP_NEAREST'
        K.select_only([ob])
        bpy.ops.object.datalayout_transfer(modifier=dt.name)
        bpy.ops.object.modifier_apply(modifier=dt.name)
    for ob in eyes:
        gl = ob.vertex_groups.new(name='eyeL')
        gr = ob.vertex_groups.new(name='eyeR')
        gl.add([v.index for v in ob.data.vertices if (ob.matrix_world @ v.co).x > 0], 1.0, 'REPLACE')
        gr.add([v.index for v in ob.data.vertices if (ob.matrix_world @ v.co).x <= 0], 1.0, 'REPLACE')
    for ob in list(others) + list(eyes):
        mod = ob.modifiers.new('Armature', 'ARMATURE'); mod.object = arm
    for ob in [body] + list(others) + list(eyes):  # sans parent : la déformation passe par le modificateur Armature
        mw = ob.matrix_world.copy(); ob.parent = None; ob.matrix_world = mw
        if not any(m.type == 'ARMATURE' for m in ob.modifiers):
            mod = ob.modifiers.new('Armature', 'ARMATURE'); mod.object = arm
    # au plus 4 os par sommet, poids normalisés : comme le glTF et three.js (sinon les vérifications faites dans Blender
    # ne valent pas pour le jeu : jusqu'à 1,6 cm d'écart dans les grandes flexions)
    for ob in [body] + list(others) + list(eyes):
        if not ob.vertex_groups:
            continue
        K.select_only([ob])
        bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
        bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
    bpy.context.view_layer.update()
    info = dict(W=W, tail_radius=tail_r, tail_len=sum((chain[k + 1] - chain[k]).length for k in range(nt)),
                ears=list(ears), eyes=bool(eyes))
    return arm, info
