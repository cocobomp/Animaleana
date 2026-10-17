# Allures procédurales du cheval réaliste (Blender 4.2), deuxième version.
# Chaque membre a 4 os : épaule/fémur, avant-bras/jambe, canon, paturon+sabot. Le sabot suit une
# trajectoire (appui : posé, à plat, il recule sous le corps ; fin d'appui : il bascule sur la pince ;
# soutien : il se replie, se lève et revient vers l'avant) ; la cinématique inverse place le boulet
# (sabot à plat = paturon qui garde son angle de repos), puis le canon, l'avant-bras, l'épaule.
# Les points de la sole (pince, centre, talons) ne passent JAMAIS sous le sol : si un repli les y
# ferait descendre, la cible du sabot est relevée d'autant.
# Repère Blender : avant = -Y, haut = +Z, sol z = 0 (le GLB exporté regarde vers +Z).
import bpy, math
from mathutils import Vector, Matrix

TAU = math.tau


def smooth(u):
    u = min(1.0, max(0.0, u))
    return u * u * (3 - 2 * u)


def rot_x_about(theta, c):
    return Matrix.Translation(c) @ Matrix.Rotation(theta, 4, 'X') @ Matrix.Translation(-c)


def rot_z_about(theta, c):
    return Matrix.Translation(c) @ Matrix.Rotation(theta, 4, 'Z') @ Matrix.Translation(-c)


def rot_axis_about(theta, axis, c):
    return Matrix.Translation(c) @ Matrix.Rotation(theta, 4, Vector(axis)) @ Matrix.Translation(-c)


def rx(theta, v):
    c, s = math.cos(theta), math.sin(theta)
    return Vector((v.x, v.y * c - v.z * s, v.y * s + v.z * c))


class Rig:
    """cfg : legs {label: {bones: [4 os], kind: 'front'|'hind', gain, toe, heel, neutral_dy}},
    roots (os qui suivent le corps), neck, head, tail, ears, pitch_pivot."""

    def __init__(self, arm, cfg):
        self.arm = arm
        self.cfg = cfg
        self.bones = arm.data.bones
        self.rest = {b.name: b.matrix_local.copy() for b in self.bones}
        self.order = []

        def walk(b):
            self.order.append(b.name)
            for c in b.children:
                walk(c)
        for b in self.bones:
            if b.parent is None:
                walk(b)
        self.legs = {}
        for lab, L in cfg['legs'].items():
            names = L['bones']
            J = [self.bones[names[0]].head_local.copy()] + [self.bones[n].tail_local.copy() for n in names]
            lens = [(J[i + 1] - J[i]).length for i in range(4)]
            dxs = [J[i + 1].x - J[i].x for i in range(4)]
            l2d = [math.sqrt(max(1e-8, lens[i] ** 2 - dxs[i] ** 2)) for i in range(3)]
            a0 = math.atan2(J[1].z - J[0].z, J[1].y - J[0].y)
            h0 = math.atan2(J[3].y - J[0].y, J[0].z - J[3].z)
            hoof0 = J[4] - J[3]
            sole = J[4]
            self.legs[lab] = dict(
                names=names, J=J, lens=lens, dxs=dxs, l2d=l2d, a0=a0, h0=h0, hoof0=hoof0,
                kind=L['kind'], gain=L.get('gain', 0.6),
                toe=Vector((0, L['toe'] - sole.y, 0)), heel=Vector((0, L['heel'] - sole.y, 0)),
                neutral=Vector((sole.x, sole.y + L.get('neutral_dy', 0.0), sole.z)))

    def solve_chain(self, lab, J0, F):
        """3 os (épaule, avant-bras, canon) de J0 vers le boulet F ; renvoie J0..J3."""
        L = self.legs[lab]
        l1, l2, l3 = L['l2d']
        a0, h0 = L['a0'], L['h0']
        h = math.atan2(F.y - J0.y, J0.z - F.z)
        a_pref = a0 + L['gain'] * (h - h0)
        best = None
        reach = (l2 + l3) * 0.998
        lo = abs(l2 - l3) + 0.02
        steps = 180
        for i in range(steps + 1):
            a = a0 - 0.8 + 1.6 * i / steps
            y1 = J0.y + l1 * math.cos(a)
            z1 = J0.z + l1 * math.sin(a)
            d = math.hypot(F.y - y1, F.z - z1)
            cost = (a - a_pref) ** 2 + 400 * max(0.0, d - reach) ** 2 + 400 * max(0.0, lo - d) ** 2
            if best is None or cost < best[0]:
                best = (cost, a, y1, z1, d)
        _, a, y1, z1, d = best
        d = min(max(d, abs(l2 - l3) + 1e-4), l2 + l3 - 1e-5)
        cb = (l2 * l2 + d * d - l3 * l3) / (2 * l2 * d)
        beta = math.acos(max(-1.0, min(1.0, cb)))
        g = math.atan2(F.z - z1, F.y - y1)
        ang = g - beta if L['kind'] == 'front' else g + beta
        y2 = y1 + l2 * math.cos(ang)
        z2 = z1 + l2 * math.sin(ang)
        dy, dz = F.y - y2, F.z - z2
        n = math.hypot(dy, dz) or 1.0
        y3 = y2 + l3 * dy / n
        z3 = z2 + l3 * dz / n
        dx = L['dxs']
        J1 = Vector((J0.x + dx[0], y1, z1))
        J2 = Vector((J1.x + dx[1], y2, z2))
        J3 = Vector((J2.x + dx[2], y3, z3))
        return [J0.copy(), J1, J2, J3]

    def solve_leg(self, lab, J0, P, phi):
        """Sabot : centre de la sole visé en P, sabot tourné de phi (0 = à plat). Renvoie les 5 articulations
        et les points de la sole atteints (pince, centre, talons)."""
        L = self.legs[lab]
        h = rx(phi, L['hoof0'])
        for _ in range(3):
            F = P - h
            J = self.solve_chain(lab, J0, F)
            J4 = J[3] + h
            pts = [J4, J4 + rx(phi, L['toe']), J4 + rx(phi, L['heel'])]
            low = min(p.z for p in pts)
            if low >= -1e-4:
                break
            P = P + Vector((0, 0, -low + 0.001))  # jamais sous le sol : on relève la cible
        return J + [J4], pts

    def bone_matrix_from(self, name, head, tail):
        R = self.rest[name]
        ry = (R.to_3x3() @ Vector((0, 1, 0))).normalized()
        d = (tail - head).normalized()
        q = ry.rotation_difference(d)
        M = (q.to_matrix() @ R.to_3x3()).to_4x4()
        M.translation = head
        return M

    def inherited(self, name, pose):
        b = self.bones[name]
        if b.parent is None:
            return pose.get('__body__', Matrix.Identity(4)) @ self.rest[name]
        p = b.parent.name
        return pose[p] @ self.rest[p].inverted() @ self.rest[name]

    def to_basis(self, pose):
        out = {}
        for name in self.order:
            b = self.bones[name]
            if b.parent is None:
                out[name] = self.rest[name].inverted() @ pose[name]
            else:
                p = b.parent.name
                out[name] = (pose[p] @ self.rest[p].inverted() @ self.rest[name]).inverted() @ pose[name]
        return out


def leg_target(rig, lab, t, gp):
    """Cible du centre de la sole et angle du sabot, pour la jambe lab à la phase t."""
    L = rig.legs[lab]
    n = L['neutral']
    kind = L['kind']
    over = gp.get('legs', {}).get(lab)
    if over:  # pose fixe (repos d'un postérieur, antérieur avancé pour brouter)
        y = n.y + over.get('dy', 0.0)
        phi = over.get('phi', 0.0)
        toe = Vector((n.x, y, n.z)) + L['toe']
        P = toe + rx(phi, -L['toe'])  # pince au sol, talons relevés de phi
        P.z += over.get('dz', 0.0)
        return P, phi
    S = gp['stride'] * gp.get('stride_scale', {}).get(kind, 1.0)
    D = gp['duty']
    ph = (t - gp['phase'][lab]) % 1.0  # 0 = poser du sabot
    lift = gp['lift'] * gp.get('lift_scale', {}).get(kind, 1.0)
    fwd = gp.get('fwd_bias', {}).get(kind, 0.0)
    beta = gp.get('breakover', 0.3) * gp.get('bo_scale', {}).get(kind, 1.0)
    bo = 0.22  # part de la fin de l'appui où le sabot bascule sur la pince
    curl = gp.get('curl', 0.9) * gp.get('curl_scale', {}).get(kind, 1.0)
    if ph < D:
        u = ph / D
        y = n.y + fwd - S / 2 + S * u
        b = beta * smooth((u - (1 - bo)) / bo)
        toe = Vector((n.x, y, n.z)) + L['toe']
        P = toe + rx(b, -L['toe'])
        return P, b
    u = (ph - D) / (1 - D)
    y = n.y + fwd + S / 2 - S * smooth(u)
    k = gp.get('lift_skew', 0.35)
    s = math.sin(math.pi * min(1.0, u * (1 + k) / (1 + k * u)))
    z = n.z + lift * max(0.0, s)
    y += gp.get('fold', 0.0) * math.sin(math.pi * u) * (1 - u)
    # continuité avec la bascule sur la pince de la fin d'appui
    toe0 = Vector((n.x, n.y + fwd + S / 2, n.z)) + L['toe']
    P_end = toe0 + rx(beta, -L['toe'])
    off = (P_end - Vector((n.x, n.y + fwd + S / 2, n.z))) * (1 - smooth(u / 0.3))
    P = Vector((n.x, y, z)) + off
    phi = beta * (1 - smooth(u / 0.35)) + curl * math.sin(math.pi * min(1.0, u * 1.15)) ** 1.3
    return P, phi


def pose_at(rig, t, gp, extra=None):
    cfg = rig.cfg
    pose = {}
    w = TAU
    bob = gp.get('bob', 0.0) * math.cos(w * gp.get('bob_freq', 2) * (t - gp.get('bob_phase', 0.0)))
    drop = gp.get('drop', 0.0)
    pitch = gp.get('pitch_base', 0.0) + gp.get('pitch', 0.0) * math.cos(w * (t - gp.get('pitch_phase', 0.0)))
    roll = gp.get('roll_base', 0.0) + gp.get('roll', 0.0) * math.sin(w * (t - gp.get('roll_phase', 0.0)))
    sway = gp.get('sway', 0.0) * math.sin(w * (t - gp.get('sway_phase', 0.0)))
    e = extra(t) if extra else {}
    bob += e.get('bob', 0.0)
    pitch += e.get('pitch', 0.0)
    delta = Vector((sway, 0.0, bob - drop))
    pivot = cfg['pitch_pivot']
    body = Matrix.Translation(delta) @ rot_x_about(pitch, pivot) @ rot_axis_about(roll, (0, 1, 0), pivot)
    pose['__body__'] = body
    for name in cfg['roots']:
        pose[name] = body @ rig.rest[name]
    lows = {}
    for lab, L in rig.legs.items():
        names = L['names']
        b0 = rig.bones[names[0]]
        if b0.parent is None:
            J0 = body @ L['J'][0]
        else:
            par = b0.parent.name
            if par not in pose:
                pose[par] = body @ rig.rest[par]
            J0 = (pose[par] @ rig.rest[par].inverted()) @ L['J'][0]
        P, phi = leg_target(rig, lab, t, gp)
        J, pts = rig.solve_leg(lab, J0, P, phi)
        lows[lab] = min(p.z for p in pts)
        for i, n in enumerate(names):
            pose[n] = rig.bone_matrix_from(n, J[i], J[i + 1])
    neck_amp = gp.get('neck', 0.0)
    neck_base = gp.get('neck_base', 0.0)
    head_amp = gp.get('head', 0.0)
    head_base = gp.get('head_base', 0.0)
    nf = gp.get('neck_freq', 2)
    nph = gp.get('neck_phase', 0.0)
    tail_lift = gp.get('tail_lift', 0.0)
    tail_amp = gp.get('tail_amp', 0.0)
    tail_yaw = gp.get('tail_yaw', 0.0)
    for name in rig.order:
        if name in pose:
            continue
        M = rig.inherited(name, pose)
        c = M.translation.copy()
        if name in cfg.get('neck', []):
            th = neck_base + neck_amp * math.cos(w * nf * (t - nph)) + e.get('neck', 0.0)
            M = rot_x_about(th / max(1, len(cfg['neck'])), c) @ M
        elif name in cfg.get('head', []):
            th = head_base + head_amp * math.cos(w * nf * (t - nph) + 0.6) + e.get('head', 0.0)
            M = rot_x_about(th, c) @ M
        elif name in cfg.get('tail', []):
            i = cfg['tail'].index(name)
            nt = len(cfg['tail'])
            tw = cfg.get('tail_weights') or [1.0 / (k + 1) for k in range(nt)]
            norm = 1.6 / sum(tw)
            th = tail_lift * tw[i] * norm + tail_amp * math.sin(w * (t - 0.15 * i) * gp.get('tail_freq', 1)) * (2.0 / nt if nt > 2 else 1.0)
            M = rot_x_about(th, c) @ M
            yaw = tail_yaw * math.sin(w * (t - 0.12 * i) * gp.get('tail_yaw_freq', 1)) + e.get('tail_yaw', 0.0)
            yaw *= (2.0 / nt if nt > 2 else 1.0)
            M = rot_z_about(yaw, c) @ M
        if name in cfg.get('ears', []) and 'ear' in e:
            sgn = 1 if cfg['ears'].index(name) == 0 else -1
            M = rot_z_about(sgn * e['ear'], c) @ M
        pose[name] = M
    return pose, lows


def bake(rig, action_name, gp, frames, extra=None):
    arm = rig.arm
    if arm.animation_data is None:
        arm.animation_data_create()
    act = bpy.data.actions.new(action_name)
    act.use_fake_user = True
    arm.animation_data.action = act
    prevq = {}
    worst = 0.0
    for f in range(frames + 1):
        t = (f % frames) / frames
        pose, lows = pose_at(rig, t, gp, extra)
        worst = min(worst, min(lows.values()))
        basis = rig.to_basis(pose)
        for name, B in basis.items():
            pb = arm.pose.bones[name]
            pb.rotation_mode = 'QUATERNION'
            loc, q, sc = B.decompose()
            if name in prevq and prevq[name].dot(q) < 0:
                q = -q
            prevq[name] = q
            pb.rotation_quaternion = q
            pb.keyframe_insert('rotation_quaternion', frame=f, group=name)
            pb.location = loc
            pb.keyframe_insert('location', frame=f, group=name)
    for fc in act.fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = 'LINEAR'
    act.frame_range = (0, frames)
    act.use_frame_range = True
    act.use_cyclic = True
    arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
    print('BAKE', action_name, frames, 'sole min z (IK)', round(worst, 4))
    return act


def gaits():
    """Allures (m, cheval de 1,6 m au garrot). Vitesse naturelle = stride / (duty × durée du cycle)."""
    G = {}
    # Pas : 4 temps latéraux (postérieur gauche, antérieur gauche, postérieur droit, antérieur droit). 1,6 m/s
    G['walk'] = dict(frames=24, stride=0.95, duty=0.62, lift=0.11, lift_scale={'front': 1.15, 'hind': 0.9},
                     phase={'HL': 0.0, 'FL': 0.25, 'HR': 0.5, 'FR': 0.75}, breakover=0.32, curl=0.75, curl_scale={'front': 1.0, 'hind': 0.8},
                     bob=0.012, bob_freq=2, bob_phase=0.1, pitch=0.008, neck=0.05, neck_freq=2, neck_phase=0.3,
                     head=0.03, tail_amp=0.04, tail_yaw=0.06, roll=0.012, sway=0.008, fold=0.04, drop=0.008)
    # Trot : diagonaux, temps de suspension. 3,0 m/s
    G['trot'] = dict(frames=18, stride=0.864, duty=0.40, lift=0.17, lift_scale={'front': 1.25, 'hind': 1.0},
                     phase={'HL': 0.0, 'FR': 0.0, 'HR': 0.5, 'FL': 0.5}, breakover=0.35, curl=1.25, curl_scale={'front': 1.0, 'hind': 0.75},
                     bob=0.028, bob_freq=2, bob_phase=0.45, drop=0.018, pitch=0.0, neck=0.02, neck_freq=2, neck_phase=0.1,
                     head=0.015, tail_lift=0.12, tail_amp=0.05, tail_freq=2, fold=0.06)
    # Petit galop à gauche : postérieur droit, diagonale (postérieur gauche + antérieur droit), antérieur gauche. 4,6 m/s
    G['canter'] = dict(frames=16, stride=1.0, duty=0.34, lift=0.21, lift_scale={'front': 1.25, 'hind': 1.0},
                       phase={'HR': 0.0, 'HL': 0.18, 'FR': 0.20, 'FL': 0.40}, breakover=0.35, curl=1.3, curl_scale={'front': 1.0, 'hind': 0.75},
                       bob=0.03, bob_freq=1, bob_phase=0.87, drop=0.03, pitch=0.07, pitch_phase=0.5,
                       neck=0.10, neck_base=0.05, neck_freq=1, neck_phase=0.55, head=0.04,
                       tail_lift=0.25, tail_amp=0.10, tail_freq=1, fold=0.08, roll=0.01)
    # Petit galop à droite : miroir
    G['canterR'] = dict(G['canter'], phase={'HL': 0.0, 'HR': 0.18, 'FL': 0.20, 'FR': 0.40}, roll=-0.01)
    # Galop (transverse, à gauche). 8,5 m/s
    G['gallop'] = dict(frames=11, stride=1.01, duty=0.27, lift=0.25, lift_scale={'front': 1.3, 'hind': 1.0},
                       phase={'HR': 0.0, 'HL': 0.11, 'FR': 0.36, 'FL': 0.47}, breakover=0.38, curl=1.45, curl_scale={'front': 1.0, 'hind': 0.8},
                       bob=0.035, bob_freq=1, bob_phase=0.87, drop=0.05, pitch=0.09, pitch_phase=0.55,
                       neck=0.13, neck_base=0.16, neck_freq=1, neck_phase=0.55, head=0.06, head_base=-0.08,
                       tail_lift=0.45, tail_amp=0.12, tail_freq=1, fold=0.1)
    for g in G.values():
        g['speed'] = g['stride'] / (g['duty'] * g['frames'] / 25.0)
    return G
