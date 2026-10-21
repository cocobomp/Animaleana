# Laine d'un mouton (Blender 4.2) : masques par sommet et forme « tondue ».
#
# - _wool : 1 sur la toison, 0 sur la peau nue (tête, oreilles, bas des membres), fondu aux limites ;
# - _head : 1 sur la tête (face, oreilles), _leg : 1 sur le bas des membres (sous le genou / le jarret), _hoof : onglons ;
#   (attributs de sommet exportés dans le GLB : le jeu recolore les races, face et pattes noires du suffolk, genoux noirs
#   du nez noir du Valais…) ;
# - cible de forme « shorn » : chaque sommet de la toison rentre vers l'axe du corps (axe du tronc mesuré sur le maillage,
#   os de l'encolure, des membres et de la queue) de l'épaisseur de laine voulue × _wool, puis la toison est lissée
#   (Taubin : les bourrelets de laine s'effacent sans que le corps rétrécisse). Poids 0 = toison pleine (comme le
#   modèle), 1 = tondu ; entre les deux pendant la repousse ; un poids négatif (jusqu'à −0,6) gonfle la toison
#   (mérinos très laineux).
import bpy, math
from mathutils import Vector
from mathutils.geometry import intersect_point_line


def smoothstep(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a))) if b != a else (1.0 if x >= b else 0.0)
    return t * t * (3 - 2 * t)


def adjacency(me):
    adj = [[] for _ in me.vertices]
    for e in me.edges:
        a, b = e.vertices
        adj[a].append(b)
        adj[b].append(a)
    return adj


def diffuse(vals, adj, n, fixed=None):
    v = list(vals)
    for _ in range(n):
        nv = v[:]
        for i, nb in enumerate(adj):
            if nb and not (fixed and fixed[i]):
                nv[i] = 0.5 * v[i] + 0.5 * sum(v[j] for j in nb) / len(nb)
        v = nv
    return v


def seg_closest(p, a, b):
    c, u = intersect_point_line(p, a, b)
    if u < 0:
        c = a
    elif u > 1:
        c = b
    return c


def build(arm, body, legs, opts):
    """legs : {lab: [J0..J4]} articulations au repos (monde) ; opts : épaisseurs (m) et noms d'os."""
    me = body.data
    mw = body.matrix_world
    B = arm.data.bones
    P = [mw @ v.co for v in me.vertices]
    n = len(P)
    gname = {g.index: g.name for g in body.vertex_groups}
    W = []
    for v in me.vertices:
        W.append({gname[g.group]: g.weight for g in v.groups if g.weight > 0})

    def dom(i):
        return max(W[i], key=W[i].get) if W[i] else None
    head_set = set(opts.get('head_bones', ['head', 'jaw', 'eyes', 'earL', 'earR']))
    neck_set = set(opts.get('neck_bones', ['neck1', 'neck2']))
    torso_set = set(opts.get('torso_bones', ['root', 'pelvis', 'spine1', 'spine2', 'chest']))
    tail_set = set(opts.get('tail_bones', [b.name for b in B if b.name.startswith('tail')]))
    leg_of = {}
    for lab, names in opts['leg_bones'].items():
        for k, nm in enumerate(names):
            leg_of[nm] = (lab, k)
    # --- toison : somme des poids des os laineux, membres laineux jusqu'au genou / jarret (fondu le long de l'os)
    hip_z = sum(legs[l][0].z for l in ('HL', 'HR')) / 2
    wool = [0.0] * n
    headm = [0.0] * n
    legm = [0.0] * n
    hoof = [0.0] * n
    knee_top = opts.get('knee_top', 0.55)  # fraction de l'avant-bras / de la jambe couverte de laine (depuis le haut)
    for i in range(n):
        w = 0.0
        hsum = 0.0
        lsum = 0.0
        tot = sum(W[i].values()) or 1.0
        for nm, wt in W[i].items():
            wt /= tot
            if nm in head_set:
                hsum += wt
                # (front et nuque laineux du mérinos : opts head_wool)
                w += wt * opts.get('head_wool', 0.0)
            elif nm in neck_set:
                w += wt
            elif nm in torso_set:
                w += wt
            elif nm in tail_set:
                w += wt * opts.get('tail', 0.8)
            elif nm in leg_of:
                lab, k = leg_of[nm]
                J = legs[lab]
                if k == 0 and len(names_of(opts, lab)) == 5:
                    w += wt  # omoplate
                    continue
                kk = k - (1 if len(names_of(opts, lab)) == 5 else 0)  # 0 humérus/fémur, 1 avant-bras/jambe, 2 canon, 3 doigts
                if kk <= 0:
                    w += wt
                elif kk == 1:
                    a, b = J[1], J[2]
                    u = (P[i].z - b.z) / max(1e-4, a.z - b.z)  # 1 au coude / grasset, 0 au genou / jarret
                    w += wt * smoothstep(1 - knee_top - 0.15, 1 - knee_top + 0.15, u)
                    lsum += wt * (1 - smoothstep(1 - knee_top - 0.15, 1 - knee_top + 0.15, u))
                else:
                    lsum += wt
                    if kk == 3:
                        hoof[i] = max(hoof[i], wt * (1.0 - smoothstep(J[4].z + 0.25 * (J[3].z - J[4].z), J[4].z + 0.6 * (J[3].z - J[4].z), P[i].z)))
        wool[i] = min(1.0, w)
        headm[i] = min(1.0, hsum)
        legm[i] = min(1.0, lsum)
    adj = adjacency(me)
    if '_wool_src' in me.attributes:
        # toison donnée par la préparation (modèle en pièces : la pièce « corps » est la toison)
        src = [0.0] * n
        me.attributes['_wool_src'].data.foreach_get('value', src)
        wool = list(src)
        me.attributes.remove(me.attributes['_wool_src'])
    else:
        # (sommets confondus des coutures d'UV : même valeur de part et d'autre)
        wool = diffuse(wool, adj, opts.get('wool_diffuse', 2))
        wool = [smoothstep(0.15, 0.85, w) for w in wool]
        wool = diffuse(wool, adj, 1)
    # --- sommets confondus (coutures d'UV : un glTF importé les sépare) : traités comme un seul, sinon la toison
    # tondue s'ouvrait en lanières le long des coutures
    key = {}
    grp = [0] * n
    for i in range(n):
        k = (round(P[i].x * 1e5), round(P[i].y * 1e5), round(P[i].z * 1e5))
        grp[i] = key.setdefault(k, len(key))
    ng = len(key)
    members = [[] for _ in range(ng)]
    for i in range(n):
        members[grp[i]].append(i)
    gadj = [set() for _ in range(ng)]
    for i, nb in enumerate(adj):
        for j in nb:
            if grp[j] != grp[i]:
                gadj[grp[i]].add(grp[j])
    gwool = [sum(wool[i] for i in m) / len(m) for m in members]
    for g_, m in enumerate(members):
        for i in m:
            wool[i] = gwool[g_]
    # --- axe du tronc : centres des tranches du tronc (sommets portés par le tronc), entre épaules et hanches
    sh_y = sum(legs[l][0].y for l in ('FL', 'FR')) / 2
    hp_y = sum(legs[l][0].y for l in ('HL', 'HR')) / 2
    torso_pts = [P[i] for i in range(n) if dom(i) in torso_set]
    ys = [p.y for p in torso_pts]
    y0, y1 = min(ys), max(ys)
    core = []
    ns = 12
    for k in range(ns + 1):
        yc = y0 + (y1 - y0) * k / ns
        sel = [p for p in torso_pts if abs(p.y - yc) < (y1 - y0) / ns]
        if len(sel) < 3:
            continue
        zt, zb = max(p.z for p in sel), min(p.z for p in sel)
        core.append(Vector((0.0, yc, (zt + zb) / 2 + opts.get('core_dz', 0.0))))
    segs = {'torso': list(zip(core[:-1], core[1:]))}
    nb = [B[b].head_local for b in opts.get('neck_chain', ['neck1', 'neck2', 'head'])]
    segs['neck'] = list(zip(nb[:-1], nb[1:])) + [segs['torso'][0]]
    for lab, J in legs.items():
        segs[lab] = [(J[0], J[1]), (J[1], J[2]), (J[2], J[3])]
        if len(names_of(opts, lab)) == 5:
            sc = B[names_of(opts, lab)[0]].head_local
            segs[lab] = [(sc, J[0])] + segs[lab]
    tl = sorted(tail_set)
    if tl:
        tp = [B[t].head_local for t in tl] + [B[tl[-1]].tail_local]
        segs['tail'] = list(zip(tp[:-1], tp[1:]))
    thick = opts['thick']
    disp = [Vector() for _ in range(n)]
    for i in range(n):
        if wool[i] <= 1e-3:
            continue
        d = dom(i)
        if d in neck_set or d in head_set:
            key, f = 'neck', opts.get('neck', 0.8)
        elif d in leg_of:
            lab, k = leg_of[d]
            key, f = lab, (1.0 if (len(names_of(opts, lab)) == 5 and k == 0) else opts.get('leg', 0.5))
            if len(names_of(opts, lab)) == 5 and k == 0:
                key = 'torso'
        elif d in tail_set and 'tail' in segs:
            key, f = 'tail', opts.get('tail', 0.5)
        else:
            key, f = 'torso', 1.0
        best = None
        for a, b in segs[key] + (segs['torso'] if key != 'torso' else []):
            c = seg_closest(P[i], a, b)
            dd = (P[i] - c).length
            if best is None or dd < best[0]:
                best = (dd, c)
        dd, c = best
        if dd < 1e-5:
            continue
        dirv = (P[i] - c) / dd
        if key == 'torso':
            # ventre : laine plus courte ; dessus du dos et flancs : pleine épaisseur
            down = max(0.0, -dirv.z)
            f *= 1.0 - (1.0 - opts.get('belly', 0.6)) * down
        amt = min(thick * f * wool[i], 0.45 * dd)
        disp[i] = -dirv * amt
    # --- lissage de Taubin du déplacement de la toison (les bourrelets de laine s'effacent, le corps ne rétrécit pas),
    # sur les sommets regroupés
    GP = [P[m[0]] for m in members]
    GQ = [P[m[0]] + sum((disp[i] for i in m), Vector()) / len(m) for m in members]
    lam, mu = 0.5, -0.53
    for it in range(opts.get('smooth', 8)):
        for fac in (lam, mu):
            NQ = GQ[:]
            for g_ in range(ng):
                if gwool[g_] <= 0.05 or not gadj[g_]:
                    continue
                avg = sum((GQ[j] for j in gadj[g_]), Vector()) / len(gadj[g_])
                NQ[g_] = GQ[g_] + (avg - GQ[g_]) * fac * gwool[g_]
            GQ = NQ
    Q = [GQ[grp[i]] for i in range(n)]
    if '_inside_src' in me.attributes:
        # (modèle en pièces : le haut des pattes, caché dans la toison, suit la toison voisine quand elle rentre —
        # sinon le haut creux des cylindres ressortait du corps tondu)
        from mathutils.kdtree import KDTree
        ins = [0.0] * n
        me.attributes['_inside_src'].data.foreach_get('value', ins)
        me.attributes.remove(me.attributes['_inside_src'])
        fl = [i for i in range(n) if wool[i] > 0.5]
        kd = KDTree(len(fl))
        for k_, i in enumerate(fl):
            kd.insert(P[i], k_)
        kd.balance()
        for i in range(n):
            if ins[i] > 0 and wool[i] <= 0.5:
                near = kd.find_n(P[i], 6)
                d_ = sum(((Q[fl[k_]] - P[fl[k_]]) for _, k_, _ in near), Vector()) / len(near)
                Q[i] = P[i] + d_ * ins[i]
    inv = mw.inverted()
    if me.shape_keys is None:
        body.shape_key_add(name='Basis', from_mix=False)
    sk = body.shape_key_add(name='shorn', from_mix=False)
    for i in range(n):
        sk.data[i].co = inv @ Q[i]
    for nm, vals in (('_wool', wool), ('_head', headm), ('_leg', legm), ('_hoof', hoof)):
        if nm in me.attributes:
            me.attributes.remove(me.attributes[nm])
        at = me.attributes.new(nm, 'FLOAT', 'POINT')
        at.data.foreach_set('value', [float(x) for x in vals])
    mx = max((d.length for d in disp), default=0.0)
    moved = [(Q[i] - P[i]).length for i in range(n)]
    print('WOOL toison', sum(1 for w in wool if w > 0.5), 'sommets sur', n, 'retrait max', round(mx, 4), 'après lissage', round(max(moved), 4))
    return dict(woolVerts=sum(1 for w in wool if w > 0.5), verts=n, shornMax=round(max(moved), 4), thick=thick)


def names_of(opts, lab):
    return opts['leg_bones'][lab]
