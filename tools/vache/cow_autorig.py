# Squelette d'une vache sans os d'origine (repris de chevres/scripts/goat_autorig.py) (Blender 4.2), d'après tools/chien/autorig.py et chats/scripts/cat_autorig.py :
# articulations données (repères lus sur le maillage normalisé : regard -Y, haut +Z, sol z = 0, gauche = +X), os aux
# noms communs des chèvres, poids par diffusion de chaleur (refaite sur la chèvre agrandie si elle échoue ; repli : os le
# plus proche), tête rigide au-delà de l'articulation crâne-encolure, pièces (cornes, oreilles) portées en bloc.
import bpy, math
from mathutils import Vector
import cowkit as K


def _smooth(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def build(body, J, opts=None):
    """J : {nom: (x, y, z)} — 'root', colonne (pelvis, spine1, spine2, chest, neck1, neck2, neck3, head, muzzle),
    membres gauches FL0..FL4 (épaule, coude, carpe, boulet, pince), scapL (omoplate), HL0..HL4 (hanche, grasset, jarret,
    boulet, pince), queue tail0..tailN, jaw0/jaw1 (charnière, menton) facultatifs. Le côté droit est le miroir en x.
    opts : horn_z (sommets au-dessus : cornes), ear (dict x0, z0, z1 : oreilles), jaw (dict ymax, zmax), head_band."""
    o = dict(opts or {})
    V = {k: Vector(v) for k, v in J.items()}
    mir = lambda v: Vector((-v.x, v.y, v.z))
    arm_d = bpy.data.armatures.new('CowArmature')
    arm = bpy.data.objects.new('CowArmature', arm_d)
    bpy.context.scene.collection.objects.link(arm)
    K.select_only([arm])
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm_d.edit_bones

    def bone(name, h, t, parent=None):
        b = eb.new(name); b.head = h; b.tail = t; b.roll = 0.0
        if (b.tail - b.head).length < 1e-4:
            b.tail = b.head + Vector((0, 0, 0.03))
        if parent:
            b.parent = eb[parent]; b.use_connect = False
        return b
    bone('root', V['root'], V['root'] + Vector((0, 0, 0.1)))
    chain = ['pelvis', 'spine1', 'spine2', 'chest', 'neck1', 'neck2', 'neck3', 'head']
    nxt = chain[1:] + ['muzzle']
    par = 'root'
    for n, m in zip(chain, nxt):
        bone(n, V[n], V[m], par)
        par = n
    if 'jaw0' in V:
        bone('jaw', V['jaw0'], V['jaw1'], 'head')
    tails = sorted(k for k in V if k.startswith('tail'))
    for i in range(len(tails) - 1):
        bone('tail%d' % (i + 1), V[tails[i]], V[tails[i + 1]], 'pelvis' if i == 0 else 'tail%d' % i)
    for side, f in (('L', lambda v: v), ('R', mir)):
        F = [f(V['FL%d' % i]) for i in range(5)]
        Hh = [f(V['HL%d' % i]) for i in range(5)]
        bone('scap' + side, f(V['scapL']), F[0], 'chest')
        bone('humerus' + side, F[0], F[1], 'scap' + side)
        bone('radius' + side, F[1], F[2], 'humerus' + side)
        bone('metacarpus' + side, F[2], F[3], 'radius' + side)
        bone('toes' + side, F[3], F[4] + Vector((0, 0, 0.015)), 'metacarpus' + side)
        bone('femur' + side, Hh[0], Hh[1], 'pelvis')
        bone('tibia' + side, Hh[1], Hh[2], 'femur' + side)
        bone('metatarsus' + side, Hh[2], Hh[3], 'tibia' + side)
        bone('htoes' + side, Hh[3], Hh[4] + Vector((0, 0, 0.015)), 'metatarsus' + side)
    bpy.ops.object.mode_set(mode='OBJECT')
    pts = [body.matrix_world @ v.co for v in body.data.vertices]
    # --- pièces : cornes (au-dessus de horn_z, de part et d'autre), oreilles (bande de hauteur, loin de l'axe)
    parts = {}
    horn_mat = None
    if o.get('horn_mat'):
        mats = [m.name if m else '' for m in body.data.materials]
        horn_mat = {i for i, n in enumerate(mats) if n.startswith(o['horn_mat'])}
        hv = set()
        for f in body.data.polygons:
            if f.material_index in horn_mat:
                hv.update(f.vertices)
    if o.get('horn_z') or horn_mat:
        for side, s in (('L', 1), ('R', -1)):
            if horn_mat:
                ids = [i for i in sorted(hv) if pts[i].x * s > 0]
            else:
                ids = [i for i, p in enumerate(pts) if p.z > o['horn_z'] and p.x * s > o.get('horn_x0', 0.0) and o.get('horn_ymin', -9) < p.y < o.get('horn_ymax', 9)]
            if ids:
                P = [pts[i] for i in ids]
                base = sum(sorted(P, key=lambda p: p.z)[:max(3, len(P) // 8)], Vector()) / max(3, len(P) // 8)
                tip = max(P, key=lambda p: (p - base).length)
                parts['horn' + side] = (ids, base, tip)
    if o.get('ear'):
        e = o['ear']
        for side, s in (('L', 1), ('R', -1)):
            ids = [i for i, p in enumerate(pts) if e['z0'] < pts[i].z < e['z1'] and pts[i].x * s > e['x0'] and e.get('ymin', -9) < pts[i].y < e.get('ymax', 9)]
            if ids:
                P = [pts[i] for i in ids]
                base = Vector((s * e['x0'], sum(p.y for p in P) / len(P), sum(p.z for p in P) / len(P)))
                tip = max(P, key=lambda p: abs(p.x))
                parts['ear' + side] = (ids, base, tip)
    ud = o.get('udder')
    if parts or ud:
        K.select_only([arm])
        bpy.ops.object.mode_set(mode='EDIT')
        for n, (ids, base, tip) in parts.items():
            bone(n, base, tip, 'head')
        if ud:
            yc = (ud['y0'] + ud['y1']) / 2
            bone('udder', Vector((0, yc, ud['ztop'])), Vector((0, yc, ud['zbot'])), 'pelvis')
        bpy.ops.object.mode_set(mode='OBJECT')
    for n, (ids, base, tip) in parts.items():
        print('AUTORIG pièce', n, len(ids), 'sommets', tuple(round(v, 3) for v in base), '->', tuple(round(v, 3) for v in tip))
    # --- poids : chaleur sans la racine ni les pièces (pondérées ensuite)
    nodef = {'root'} | set(parts) | ({'udder'} if ud else set())
    for b in arm_d.bones:
        b.use_deform = b.name not in nodef

    def heat(scale):
        for ob in (body, arm):
            ob.scale = (scale, scale, scale)
        bpy.context.view_layer.update()
        body.vertex_groups.clear()
        for m in list(body.modifiers):
            if m.type == 'ARMATURE':
                body.modifiers.remove(m)
        K.select_only([body, arm])
        bpy.context.view_layer.objects.active = arm
        bpy.ops.object.parent_set(type='ARMATURE_AUTO')
        mw = body.matrix_world.copy(); body.parent = None; body.matrix_world = mw
        for ob in (body, arm):
            ob.scale = (1, 1, 1)
        bpy.context.view_layer.update()
        return sum(1 for v in body.data.vertices if not v.groups or max(g.weight for g in v.groups) < 1e-4)
    for sc in o.get('heat_scales', (1.0, 10.0, 100.0)):
        miss = heat(sc)
        print('AUTORIG chaleur échelle', sc, 'sommets sans poids', miss)
        if miss < 0.02 * len(body.data.vertices):
            break
    for b in arm_d.bones:
        b.use_deform = b.name != 'root'
    segs = {b.name: (b.head_local, b.tail_local) for b in arm.data.bones if b.name not in nodef}

    def nearest_bone(p, names=None):
        def dseg(s):
            h, t = s; d = t - h; u = max(0, min(1, (p - h).dot(d) / d.length_squared)); return (p - (h + d * u)).length
        return min(names or segs, key=lambda n: dseg(segs[n]))
    empty = [v.index for v in body.data.vertices if not v.groups or max(g.weight for g in v.groups) < 1e-4]
    for vi in empty:
        best = nearest_bone(pts[vi])
        g = body.vertex_groups.get(best) or body.vertex_groups.new(name=best)
        g.add([vi], 1.0, 'REPLACE')
    print('AUTORIG sommets sans poids (os le plus proche)', len(empty))

    def set_w(vi, name, k):
        """Mélange : poids de name porté à k, les autres réduits d'autant."""
        g = body.vertex_groups.get(name) or body.vertex_groups.new(name=name)
        gidx = {gg.index: gg for gg in body.vertex_groups}
        for e in list(body.data.vertices[vi].groups):
            gg = gidx[e.group]
            if gg.name != name:
                gg.add([vi], e.weight * (1 - k), 'REPLACE')
        cur = next((e.weight for e in body.data.vertices[vi].groups if e.group == g.index), 0.0)
        g.add([vi], cur * (1 - k) + k, 'REPLACE')
    # bas des membres « purs » : un sommet porté surtout par un os du bas d'une patte ne garde que les os de cette patte
    # (la chaleur passait par la jupe de poils : des sabots gardaient un peu de bassin ou d'épaule et passaient sous le
    # sol quand le corps basculait)
    chains = {}
    for side in 'LR':
        chains['F' + side] = ['scap' + side, 'humerus' + side, 'radius' + side, 'metacarpus' + side, 'toes' + side]
        chains['H' + side] = ['femur' + side, 'tibia' + side, 'metatarsus' + side, 'htoes' + side]
    lower = {}
    for lab, ch in chains.items():
        for n in ch[2:] if lab[0] == 'F' else ch[1:]:
            lower[n] = set(ch)
    gname = {g.index: g.name for g in body.vertex_groups}
    fixed = 0
    for v in body.data.vertices:
        if not v.groups:
            continue
        d = max(v.groups, key=lambda e: e.weight)
        dn = gname[d.group]
        if dn not in lower:
            continue
        keep = lower[dn]
        ws = [(gname[e.group], e.weight) for e in v.groups]
        tot = sum(w for n, w in ws if n in keep)
        if tot <= 0:
            continue
        for n, w in ws:
            if n in keep:
                body.vertex_groups[n].add([v.index], w / tot, 'REPLACE')
            else:
                body.vertex_groups[n].remove([v.index])
                fixed += 1

    def _dbg(tag):
        import os as _os
        if not _os.environ.get('DBGP'):
            return
        q = Vector([float(c) for c in _os.environ['DBGP'].split(',')])
        gn_ = {g.index: g.name for g in body.vertex_groups}
        for vi in sorted(range(len(pts)), key=lambda i: (pts[i] - q).length)[:3]:
            print('DBG', tag, vi, tuple(round(c, 3) for c in pts[vi]), sorted(((gn_[e.group], round(e.weight, 2)) for e in body.data.vertices[vi].groups), key=lambda x: -x[1])[:4])
    _dbg('avant-nettoyage')
    print('AUTORIG bas des membres purifiés', fixed, 'poids retirés')
    # membres : pas de poids d'un membre de l'autre côté de l'axe (le ventre entre les antérieurs suivait les deux
    # avant-bras : couchée, il passait 7 cm sous le sol), pas de poids du bas d'un membre au-dessus du coude / grasset
    gname = {g.index: g.name for g in body.vertex_groups}
    side_of = {}
    low_top = {}
    col_x = {}
    for side, sg in (('L', 1), ('R', -1)):
        for n in ('scap', 'humerus', 'radius', 'metacarpus', 'toes', 'femur', 'tibia', 'metatarsus', 'htoes'):
            side_of[n + side] = sg
        for n in ('radius', 'metacarpus', 'toes'):
            low_top[n + side] = V['FL1'].z + o.get('low_band', 0.03)
        for n in ('tibia', 'metatarsus', 'htoes'):
            low_top[n + side] = V['HL1'].z + o.get('low_band', 0.03)
        # (colonne du membre : x moyen des deux articulations de l'os ; un sommet plus loin ne suit pas le bas du membre)
        for n, a, b in (('radius', 'FL1', 'FL2'), ('metacarpus', 'FL2', 'FL3'), ('toes', 'FL3', 'FL4'),
                        ('tibia', 'HL1', 'HL2'), ('metatarsus', 'HL2', 'HL3'), ('htoes', 'HL3', 'HL4')):
            col_x[n + side] = sg * (V[a].x + V[b].x) / 2
    mid_to = {}
    for side in 'LR':
        mid_to['femur' + side] = 'pelvis' if 'pelvis' in segs else None
    trunk = [n for n in ('chest', 'spine2', 'spine1', 'pelvis') if n in segs]
    up_of = {}
    chain_of = {}
    for side in 'LR':
        for ch in (['scap', 'humerus', 'radius', 'metacarpus', 'toes'], ['femur', 'tibia', 'metatarsus', 'htoes']):
            for i in range(1, len(ch)):
                up_of[ch[i] + side] = ch[i - 1] + side
            for n in ch:
                chain_of[n + side] = [c + side for c in ch if c + side in segs]

    def receiver(p, n, exclude):
        # (os qui reçoit le poids retiré : le plus proche du sommet parmi les os AU-DESSUS dans ce membre et le tronc, sauf
        # ceux exclus — jamais un os plus bas : la mamelle, juste devant les jarrets, passait au canon)
        ch = chain_of.get(n, [])
        up = ch[:ch.index(n)] if n in ch else []
        cand = [c for c in up + trunk if c not in exclude and c in segs]
        return nearest_bone(p, cand or trunk)
    lb, lr, mx = o.get('low_band', 0.03), o.get('leg_r', 0.11), o.get('mid_x', 0.045)

    girth = {}
    for side in 'LR':
        for n in ('humerus', 'radius'):
            girth[n + side] = V['FL1'].y + o.get('girth_off', 0.12)

    # (os dominant de la diffusion de chaleur, avant tout nettoyage : sert à trier la mamelle et les cuisses)
    dom0 = [gname[max(v.groups, key=lambda e: e.weight).group] if len(v.groups) else '' for v in body.data.vertices]
    cleaned = 0
    for v in body.data.vertices:
        p = pts[v.index]
        ws = [(gname[e.group], e.weight) for e in v.groups if e.weight > 0]
        acc = {}
        moved = False
        for n, w in ws:
            sg = side_of.get(n)
            # (fondus progressifs : une coupure nette faisait des arêtes étirées entre un sommet gardé et son voisin)
            if sg is not None and p.x * sg < 0.0:
                k, to = _smooth(-0.04, 0.0, p.x * sg), nearest_bone(p, trunk)
            elif n in low_top and p.z > low_top[n] - lb:
                k, to = _smooth(low_top[n] + lb, low_top[n] - lb, p.z), receiver(p, n, {n} | set(low_top))
            elif n in col_x and abs(p.x - col_x[n]) > lr - 0.03:
                k, to = _smooth(lr + 0.03, lr - 0.03, abs(p.x - col_x[n])), receiver(p, n, {n})
            elif n in girth and p.y > girth[n] - 0.04:
                # (flanc derrière le coude : il suivait l'humérus et l'avant-bras — couchée, il plongeait sous le sol)
                k, to = _smooth(girth[n] + 0.04, girth[n] - 0.04, p.y), nearest_bone(p, trunk)
            elif mid_to.get(n) and abs(p.x) < o.get('mid_x', 0.10):
                # (ligne médiane entre les cuisses, sous le poitrail : portée par le tronc — partagée à moitié entre les
                # deux cuisses, elle s'étirait à chaque pas)
                k, to = _smooth(0.0, o.get('mid_x', 0.10), abs(p.x)), mid_to[n]
            else:
                k, to = 1.0, n
            if k < 0.999:
                moved = True
            acc[n] = acc.get(n, 0.0) + w * k
            acc[to] = acc.get(to, 0.0) + w * (1 - k)
        if not moved:
            continue
        cleaned += 1
        # (un os du bas reçu en cascade peut lui-même sortir de sa colonne : on remonte la chaîne jusqu'à un os permis)
        for _ in range(4):
            bad = [n for n in acc if acc[n] > 0 and ((n in low_top and p.z > low_top[n] + lb) or (n in col_x and abs(p.x - col_x[n]) > lr + 0.03)
                                                     or (side_of.get(n) is not None and p.x * side_of[n] < -0.04))]
            if not bad:
                break
            for n in bad:
                to = receiver(p, n, set(bad)) if not (side_of.get(n) is not None and p.x * side_of[n] < -0.04) else nearest_bone(p, trunk)
                acc[to] = acc.get(to, 0.0) + acc[n]
                acc[n] = 0.0
        tot = sum(acc.values()) or 1.0
        for n, w in ws:
            if acc.get(n, 0.0) <= 1e-4:
                body.vertex_groups[n].remove([v.index])
        for n, w in acc.items():
            if w / tot > 1e-4:
                (body.vertex_groups.get(n) or body.vertex_groups.new(name=n)).add([v.index], w / tot, 'REPLACE')
    print('AUTORIG poids des membres nettoyés', cleaned, 'sommets')
    _dbg('après-nettoyage')
    # sabots rigides : sous le boulet, tout est porté par l'os du pied (le talon mi-canon mi-pied s'affaissait sous le
    # sol au posé)
    hb = o.get('hoof_band', 0.02)
    nh = 0
    for side, f in (('L', lambda v: v), ('R', mir)):
        for leg, toe in (('FL', 'toes'), ('HL', 'htoes')):
            J3 = f(V[leg + '3']); J4 = f(V[leg + '4'])
            r = o.get('hoof_r', 0.12)
            for vi, p in enumerate(pts):
                if p.z < J3.z + hb and abs(p.x - J3.x) < r and min(abs(p.y - J3.y), abs(p.y - J4.y)) < r * 1.5:
                    set_w(vi, toe + side, _smooth(J3.z + hb, J3.z - hb, p.z))
                    nh += 1
    print('AUTORIG sabots rigides', nh, 'sommets')
    # tête rigide au-delà de l'articulation crâne-encolure (visage non déformé quand l'encolure plie)
    skull, neck = V['head'], V['neck3']
    hd = (skull - neck).normalized()
    band = o.get('head_band', 0.05)
    for vi, p in enumerate(pts):
        u = (p - skull).dot(hd)
        if u > -band:
            set_w(vi, 'head', _smooth(-band, band, u))
    # mâchoire : sommets sous la ligne de la bouche, devant la charnière
    if 'jaw0' in V and o.get('jaw'):
        jw = o['jaw']
        for vi, p in enumerate(pts):
            if p.y < jw['ymax'] and p.z < jw['zmax'] and p.z > jw.get('zmin', -9):
                set_w(vi, 'jaw', _smooth(jw['ymax'], jw['ymax'] - jw.get('fade', 0.04), p.y) * _smooth(jw['zmax'], jw['zmax'] - jw.get('zfade', 0.02), p.z))
    # pièces portées en bloc (fondu près de la base)
    for n, (ids, base, tip) in parts.items():
        L = max(1e-6, (tip - base).length)
        for vi in ids:
            u = (pts[vi] - base).dot(tip - base) / (L * L)
            set_w(vi, n, _smooth(-0.05, 0.12, u))

    def smooth_weights(reg, names, iters):
        """Lissage laplacien des poids des os names sur les sommets reg (la part des autres os est gardée)."""
        G = [n for n in names if body.vertex_groups.get(n)]
        gi = {body.vertex_groups[n].index: n for n in G}
        regset = set(reg)
        nb = {vi: set() for vi in reg}
        for e in body.data.edges:
            a_, b_ = e.vertices
            if a_ in regset and b_ in regset:
                nb[a_].add(b_); nb[b_].add(a_)
        W = {vi: {gi[e.group]: e.weight for e in body.data.vertices[vi].groups if e.group in gi} for vi in reg}
        other = {vi: sum(e.weight for e in body.data.vertices[vi].groups if e.group not in gi) for vi in reg}
        for _ in range(iters):
            W2 = {}
            for vi in reg:
                acc_ = dict(W[vi])
                for nj in nb[vi]:
                    for n, w in W[nj].items():
                        acc_[n] = acc_.get(n, 0.0) + w
                tot_ = sum(acc_.values())
                if tot_ <= 0:
                    W2[vi] = W[vi]
                    continue
                keep_ = 1.0 - other[vi]
                W2[vi] = {n: w / tot_ * keep_ for n, w in acc_.items()}
            W = W2
        for vi in reg:
            for n in G:
                w = W[vi].get(n, 0.0)
                if w > 1e-3:
                    body.vertex_groups[n].add([vi], w, 'REPLACE')
                else:
                    body.vertex_groups[n].remove([vi])
    # aisselles et flancs derrière le coude : transition humérus / avant-bras / tronc adoucie
    asm = o.get('armpit_smooth', dict(iters=8))
    for side, sg in (('L', 1), ('R', -1)):
        E = V['FL1']
        reg = [vi for vi, p in enumerate(pts) if 0.02 < p.x * sg < abs(E.x) + 0.15 and E.y - 0.12 < p.y < E.y + 0.30 and E.z - 0.15 < p.z < E.z + 0.25]
        smooth_weights(reg, ('humerus' + side, 'radius' + side, 'scap' + side, 'chest', 'spine2'), asm['iters'])
    print('AUTORIG aisselles lissées')
    # mamelle : sommets de la boîte sous le ventre, entre les cuisses (fondu vers le haut et sur les bords)
    if ud:
        fd = ud.get('fade', 0.04)
        n_ud = 0
        gname2 = {g.index: g.name for g in body.vertex_groups}

        def dom_of(vi):
            gs = body.data.vertices[vi].groups
            return gname2[max(gs, key=lambda e: e.weight).group] if len(gs) else ''
        for vi, p in enumerate(pts):
            if ud['y0'] < p.y < ud['y1'] and ud.get('zmin', ud['zbot'] - 0.06) < p.z < ud['ztop'] and abs(p.x) < ud['xmax']:
                # (face interne des jarrets et des cuisses : reste à la jambe — prise dans la mamelle, elle s'étirait au pas)
                d_ = dom0[vi]
                if (d_.startswith(('tibia', 'metatarsus', 'htoes')) and abs(p.x) > 0.4 * ud['xmax']) or (d_.startswith('femur') and abs(p.x) > 0.6 * ud['xmax']):
                    continue
                w = _smooth(ud['ztop'], ud['ztop'] - fd, p.z) * _smooth(ud['xmax'], ud['xmax'] - fd, abs(p.x))                     * _smooth(ud['y0'], ud['y0'] + fd, p.y) * _smooth(ud['y1'], ud['y1'] - fd, p.y)
                if w > 0.01:
                    # (seulement mamelle + bassin : les poids des cuisses étiraient les trayons au galop et à la ruade)
                    for e in list(body.data.vertices[vi].groups):
                        gg = body.vertex_groups[e.group]
                        if gg.name not in ('udder', 'pelvis'):
                            gg.remove([vi])
                    (body.vertex_groups.get('pelvis') or body.vertex_groups.new(name='pelvis')).add([vi], 1.0 - w, 'REPLACE')
                    (body.vertex_groups.get('udder') or body.vertex_groups.new(name='udder')).add([vi], w, 'REPLACE')
                    n_ud += 1
        print('AUTORIG mamelle', n_ud, 'sommets')
        # lissage laplacien des poids entre mamelle, bassin et cuisses : la peau de la mamelle collée à la face interne
        # des cuisses formait une toile (arêtes ×40) quand le postérieur avançait
        sm = o.get('udder_smooth', dict(iters=10, pad=0.06))
        pad = sm['pad']
        reg = [vi for vi, p in enumerate(pts) if abs(p.x) < ud['xmax'] + pad and ud['y0'] - pad < p.y < ud['y1'] + 4 * pad
               and ud.get('zmin', ud['zbot'] - 0.06) - pad < p.z < ud['ztop'] + 3 * pad]
        smooth_weights(reg, ('udder', 'pelvis', 'spine1', 'femurL', 'femurR', 'tibiaL', 'tibiaR'), sm['iters'])
        print('AUTORIG mamelle/cuisses lissées', len(reg), 'sommets')
    _dbg('fin')
    body.parent = None
    if not any(m.type == 'ARMATURE' for m in body.modifiers):
        mod = body.modifiers.new('Armature', 'ARMATURE')
        mod.object = arm
    for m in body.modifiers:
        if m.type == 'ARMATURE':
            m.object = arm
    bpy.context.view_layer.update()
    return arm
