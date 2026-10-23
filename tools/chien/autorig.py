# Squelette automatique du Jack Russell (Blender 4.2) : repères trouvés sur le maillage (pattes au sol, colonnes
# des membres, garrot, yeux, museau, queue, oreilles), articulations placées selon les proportions habituelles du
# chien, poids par diffusion de chaleur (repli : os le plus proche), oreilles pondérées à la main (géométrie),
# yeux liés à leur os.
# Repère : avant = -Y, haut = +Z, sol z = 0, gauche = +X. Noms d'os (sans point : three.js retire les points des
# noms de nœuds) : root, pelvis, spine1, spine2, chest, neck1, neck2, head, eyeL/eyeR, ear1L/ear2L, ear1R/ear2R,
# tail1..4, scapL/R, humerusL/R, radiusL/R, metacarpusL/R, toesL/R, femurL/R, tibiaL/R, metatarsusL/R, htoesL/R.
import bpy, math
from mathutils import Vector
import dogkit as K


def _band(pts, z, h):
    return [p for p in pts if abs(p.z - z) < h]


def _smooth(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def ear_vertices(body, E, W):
    """Sommets des oreilles (de chaque côté) : lambeaux minces (deux faces opposées à moins de 2 % de la hauteur)
    au-dessus de l'œil et à l'extérieur du crâne, étendus de proche en proche dans cette zone."""
    me = body.data
    pts = [body.matrix_world @ v.co for v in me.vertices]
    nrm = [v.normal for v in me.vertices]
    H = max(p.z for p in pts)
    zone = lambda p: p.z > E.z - 0.012 * H and abs(p.x) > abs(E.x) + 0.026 * H and E.y + 0.02 * H < p.y < E.y + 0.2 * H
    cand = [i for i, p in enumerate(pts) if zone(p)]
    thin = set()
    for i in cand:
        for j in cand:
            if j != i and nrm[i].dot(nrm[j]) < -0.6 and (pts[i] - pts[j]).length < 0.02 * H:
                thin.add(i)
                break
    adj = {i: set() for i in cand}
    cs = set(cand)
    for e in me.edges:
        a, b = e.vertices
        if a in cs and b in cs:
            adj[a].add(b)
            adj[b].add(a)
    # (seulement le lambeau mince et son bord : un anneau de voisins ; le crâne, épais, n'en fait pas partie)
    allowed = set(thin)
    for i in thin:
        allowed |= adj[i]
    out = {}
    for s in (1, -1):
        seeds = [i for i in thin if pts[i].x * s > 0]
        seen = set(seeds)
        stack = list(seeds)
        while stack:
            i = stack.pop()
            for j in adj[i]:
                if j not in seen and j in allowed:
                    seen.add(j)
                    stack.append(j)
        out[s] = sorted(seen)
    return out, pts


def build(body, others=(), eyes=None, opts=None):
    o = dict(opts or {})
    pts = [body.matrix_world @ v.co for v in body.data.vertices]
    H = max(p.z for p in pts)
    ymin = min(p.y for p in pts); ymax = max(p.y for p in pts)
    L = ymax - ymin
    # --- pattes au sol
    low = [p for p in pts if p.z < 0.035 * H]
    ymid = (min(p.y for p in low) + max(p.y for p in low)) / 2
    paws = {}
    for lab, fx, fy in (('FL', 1, -1), ('FR', -1, -1), ('HL', 1, 1), ('HR', -1, 1)):
        sel = [p for p in low if (p.x > 0) == (fx > 0) and (p.y > ymid) == (fy > 0)]
        c = Vector((sum(p.x for p in sel) / len(sel), sum(p.y for p in sel) / len(sel), 0.0))
        paws[lab] = dict(c=c, tip_y=min(p.y for p in sel), heel_y=max(p.y for p in sel))
    # --- colonnes des membres
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
        m3 = at(f, 0.07 * W); m2 = at(f, 0.20 * W); m1 = at(f, o.get('elbow', 0.50) * W)
        j3 = Vector((m3[1].x, m3[1].y + 0.02 * W, 0.07 * W))
        j2 = Vector((m2[1].x, m2[1].y + 0.01 * W, 0.20 * W))
        j1 = Vector((m1[1].x * 0.95, m1[3] - 0.03 * W, o.get('elbow', 0.50) * W))
        j0 = Vector((j1.x * 0.9, j1.y - 0.13 * W, o.get('shoulder', 0.68) * W))
        sc = Vector((j0.x * 0.55, j0.y + 0.12 * W, 0.93 * W))
        tip = Vector((j3.x, paws[f]['tip_y'], 0.0))
        J[f] = [sc, j0, j1, j2, j3, tip]
        n3 = at(h, 0.07 * W); n2 = at(h, o.get('hock', 0.27) * W); n1 = at(h, o.get('stifle', 0.52) * W)
        k3 = Vector((n3[1].x, n3[1].y + 0.03 * W, 0.07 * W))
        k2 = Vector((n2[1].x, n2[3] - 0.03 * W, o.get('hock', 0.27) * W))
        k0 = Vector((n1[1].x * 0.85, paws[h]['c'].y + o.get('hip_dy', -0.02) * W, o.get('hip', 0.76) * W))
        k1 = Vector((n1[1].x, k0.y - o.get('stifle_fwd', 0.13) * W, o.get('stifle', 0.52) * W))
        tip = Vector((k3.x, paws[h]['tip_y'], 0.0))
        J[h] = [k0, k1, k2, k3, tip]
    hip_y = (J['HL'][0].y + J['HR'][0].y) / 2
    sh_y = (J['FL'][1].y + J['FR'][1].y) / 2
    # --- tête : yeux et museau
    head_pts = [p for p in pts if p.y < sh_y and p.z > 0.6 * W]
    muz = min(head_pts, key=lambda p: p.y)
    ep = [eyes.matrix_world @ v.co for v in eyes.data.vertices]
    EL = [p for p in ep if p.x > 0]
    ER = [p for p in ep if p.x < 0]
    eL = sum(EL, Vector()) / len(EL)
    eR = sum(ER, Vector()) / len(ER)
    E = (eL + eR) / 2
    dem = abs(E.y - muz.y)
    skull = Vector((0.0, E.y + 0.9 * dem, E.z - 0.10 * dem))
    muzzle = Vector((0.0, muz.y + 0.02 * dem, muz.z))
    neck0 = Vector((0.0, sh_y + 0.02 * W, 0.82 * W))
    neck1 = (neck0 + skull) / 2 + Vector((0, 0, 0.03 * W))
    # --- queue
    rump = [p for p in pts if p.y > hip_y and 0.5 * W < p.z < 0.85 * W and abs(p.x) < 0.15 * H]
    rump_y = max(p.y for p in rump)
    back = [p for p in pts if p.y > hip_y - 0.25 * W and abs(p.x) < 0.12 * H]
    ttip = max(back, key=lambda p: (p.y - hip_y) + max(0.0, p.z - 0.75 * W))
    tbase = Vector((0.0, rump_y - 0.04 * W, 0.86 * W))
    # --- oreilles (base sur le crâne, pli en haut, bout du lambeau qui retombe)
    earv, _ = ear_vertices(body, eL, H)
    ears = {}
    for side, s in (('L', 1), ('R', -1)):
        ev = [pts[i] for i in earv[s]]
        if len(ev) < 20:
            print('AUTORIG oreille', side, 'introuvable'); continue
        ax = [abs(p.x) for p in ev]
        x0, x1 = min(ax), max(ax)
        basep = [p for p in ev if abs(p.x) < x0 + 0.25 * (x1 - x0)]
        tipp = [p for p in ev if abs(p.x) > x1 - 0.15 * (x1 - x0)]
        root = sum(basep, Vector()) / len(basep)
        top = max(ev, key=lambda p: p.z)
        fold = Vector((top.x, (top.y + root.y) / 2, top.z - 0.004 * H))
        tipc = sum(tipp, Vector()) / len(tipp)
        root = Vector((root.x - s * 0.01 * H, root.y, min(root.z, fold.z - 0.02 * H)))
        ears[side] = dict(root=root, fold=fold, tip=tipc, verts=earv[s])
        print('AUTORIG oreille', side, len(ev), 'base', tuple(round(v, 3) for v in root), 'pli', tuple(round(v, 3) for v in fold), 'bout', tuple(round(v, 3) for v in tipc))
    # --- armature
    arm_d = bpy.data.armatures.new('DogArmature')
    arm = bpy.data.objects.new('DogArmature', arm_d)
    bpy.context.scene.collection.objects.link(arm)
    K.select_only([arm])
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm_d.edit_bones

    def bone(name, h, t, parent=None, connect=False):
        b = eb.new(name); b.head = h; b.tail = t; b.roll = 0.0
        if parent:
            b.parent = eb[parent]; b.use_connect = connect
        return b
    pelvis = Vector((0.0, hip_y, 0.80 * W))
    chest = Vector((0.0, sh_y + 0.10 * W, 0.80 * W))
    s1 = pelvis.lerp(chest, 0.33) + Vector((0, 0, 0.03 * W))
    s2 = pelvis.lerp(chest, 0.66) + Vector((0, 0, 0.03 * W))
    mid = pelvis.lerp(chest, 0.5)
    bone('root', mid, mid + Vector((0, 0, 0.1 * W)))
    bone('pelvis', pelvis, s1, 'root')
    bone('spine1', s1, s2, 'pelvis', True)
    bone('spine2', s2, chest, 'spine1', True)
    bone('chest', chest, neck0, 'spine2', True)
    bone('neck1', neck0, neck1, 'chest', True)
    bone('neck2', neck1, skull, 'neck1', True)
    bone('head', skull, muzzle, 'neck2', True)
    for side, e in (('L', eL), ('R', eR)):
        bone('eye' + side, e, e + Vector((0, -0.03 * W, 0)), 'head')
    for side, e in ears.items():
        bone('ear1' + side, e['root'], e['fold'], 'head')
        bone('ear2' + side, e['fold'], e['tip'], 'ear1' + side, True)
    tpts = [tbase.lerp(ttip, k / 4) for k in range(5)]
    bone('tail1', tpts[0], tpts[1], 'pelvis')
    for k in range(2, 5):
        bone('tail%d' % k, tpts[k - 1], tpts[k], 'tail%d' % (k - 1), True)
    for side in ('L', 'R'):
        sc, j0, j1, j2, j3, tip = J['F' + side]
        bone('scap' + side, sc, j0, 'chest')
        bone('humerus' + side, j0, j1, 'scap' + side, True)
        bone('radius' + side, j1, j2, 'humerus' + side, True)
        bone('metacarpus' + side, j2, j3, 'radius' + side, True)
        bone('toes' + side, j3, tip + Vector((0, 0, 0.02 * W)), 'metacarpus' + side, True)
        k0, k1, k2, k3, tip = J['H' + side]
        bone('femur' + side, k0, k1, 'pelvis')
        bone('tibia' + side, k1, k2, 'femur' + side, True)
        bone('metatarsus' + side, k2, k3, 'tibia' + side, True)
        bone('htoes' + side, k3, tip + Vector((0, 0, 0.02 * W)), 'metatarsus' + side, True)
    bpy.ops.object.mode_set(mode='OBJECT')
    # --- poids : diffusion de chaleur sans les os des oreilles, des yeux ni la racine (pondérés ensuite)
    nodef = {'root'} | {b.name for b in arm_d.bones if b.name.startswith(('ear', 'eye'))}
    for b in arm_d.bones:
        b.use_deform = b.name not in nodef
    K.select_only([body, arm])
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    for b in arm_d.bones:
        b.use_deform = True
    empty = [v.index for v in body.data.vertices if not v.groups or max(g.weight for g in v.groups) < 1e-4]
    print('AUTORIG vertices sans poids', len(empty), 'sur', len(body.data.vertices))
    if empty:
        segs = {b.name: (b.head_local, b.tail_local) for b in arm.data.bones if b.name not in nodef}
        for vi in empty:
            p = body.matrix_world @ body.data.vertices[vi].co
            def dseg(s):
                h, t = s; d = t - h; u = max(0, min(1, (p - h).dot(d) / d.length_squared)); return (p - (h + d * u)).length
            best = min(segs, key=lambda n: dseg(segs[n]))
            if best not in body.vertex_groups:
                body.vertex_groups.new(name=best)
            body.vertex_groups[best].add([vi], 1.0, 'REPLACE')
    # fesses : l'arrière du haut de la cuisse (derrière la hanche, au-dessus du grasset) suit en partie le bassin,
    # comme les ischio-jambiers attachés à l'ischion ; portée par le seul fémur, cette peau montait avec lui dès que la
    # cuisse se repliait (assis : la croupe ne touchait jamais le sol, la cuisse s'écrasait en lame)
    if o.get('buttock'):
        gp_ = body.vertex_groups.get('pelvis') or body.vertex_groups.new(name='pelvis')
        for side in ('L', 'R'):
            gf = body.vertex_groups.get('femur' + side)
            if gf is None:
                continue
            gt = body.vertex_groups.get('tibia' + side)
            k0, k1 = J['H' + side][0], J['H' + side][1]
            for v in body.data.vertices:
                wf = next((e.weight for e in v.groups if e.group == gf.index), 0.0)
                if wf <= 0:
                    continue
                p = body.matrix_world @ v.co
                if (p.x > 0) != (k0.x > 0):
                    continue
                k = o['buttock'] * _smooth(k0.y - 0.02 * W, k0.y + 0.10 * W, p.y) * _smooth(k1.z - 0.02 * W, k1.z + 0.12 * W, p.z)
                # (pas la peau du grasset, déjà portée en partie par le tibia : passée du fémur au bassin, elle restait
                # tiraillée entre le bassin et la jambe — triangles étirés plus de trois fois au grasset du teckel
                # assis, cuisse en avant)
                if gt is not None and o.get('buttock_knee'):
                    wt = next((e.weight for e in v.groups if e.group == gt.index), 0.0)
                    k *= 1 - _smooth(0.05, 0.3, wt)
                if k <= 0:
                    continue
                wp = next((e.weight for e in v.groups if e.group == gp_.index), 0.0)
                gf.add([v.index], wf * (1 - k), 'REPLACE')
                gp_.add([v.index], wp + wf * k, 'REPLACE')
    # oreilles : lambeau au-delà du pli -> ear2, entre la base et le pli -> ear1, fondu avec la tête à la base
    for side, e in ears.items():
        g1 = body.vertex_groups.new(name='ear1' + side)
        g2 = body.vertex_groups.new(name='ear2' + side)
        R, Fd, T = e['root'], e['fold'], e['tip']
        d1 = Fd - R
        d2 = T - Fd
        for vi in e['verts']:
            p = body.matrix_world @ body.data.vertices[vi].co
            u2 = (p - Fd).dot(d2) / d2.length_squared  # au-delà du pli : u2 > 0
            u1 = (p - R).dot(d1) / d1.length_squared
            w2 = _smooth(-0.08, 0.12, u2)
            wbase = _smooth(0.05, 0.35, u1) if w2 < 0.5 else 1.0
            gname = {g.index: g for g in body.vertex_groups}
            pairs = [(gname[e.group], e.weight) for e in body.data.vertices[vi].groups]
            for g, w in pairs:
                if g.name not in ('ear1' + side, 'ear2' + side):
                    g.add([vi], w * (1 - wbase), 'REPLACE')
            g1.add([vi], wbase * (1 - w2), 'REPLACE')
            g2.add([vi], wbase * w2, 'REPLACE')
    for ob in others:
        ob.parent = arm
        mod = ob.modifiers.new('Armature', 'ARMATURE'); mod.object = arm
        if ob is eyes:
            gl = ob.vertex_groups.new(name='eyeL')
            gr = ob.vertex_groups.new(name='eyeR')
            gl.add([v.index for v in ob.data.vertices if (ob.matrix_world @ v.co).x > 0], 1.0, 'REPLACE')
            gr.add([v.index for v in ob.data.vertices if (ob.matrix_world @ v.co).x <= 0], 1.0, 'REPLACE')
            continue
    for ob in [body] + list(others):  # sans parent : la déformation passe par le modificateur Armature
        mw = ob.matrix_world.copy(); ob.parent = None; ob.matrix_world = mw
    bpy.context.view_layer.update()
    return arm
