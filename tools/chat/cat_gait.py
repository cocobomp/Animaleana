# Allures et poses procédurales d'un chat (Blender 4.2) : dog_gait.py des chiens du jeu (tools/chien/), avec en plus
# la forme absolue de la queue (angles cibles par os, dans le repère du corps), une flexion latérale après coup
# (bend : chat en boule, tête tournée) et les allures d'un chat (gaits).
# Chaque membre a 4 segments définis par les TÊTES de 4 os (les queues d'os importées du glTF ne sont pas
# fiables) et un point de bout de patte (pince) mesuré sur le maillage :
#   antérieur : épaule (tête de l'humérus) -> coude -> carpe -> métacarpo-phalangienne -> bout des doigts
#   postérieur : hanche -> grasset -> jarret -> métatarso-phalangienne -> bout des doigts
# Appui : la patte posée à plat recule sous le corps ; fin d'appui : le talon (coussinet) se lève, la patte
# roule sur les doigts ; soutien : la patte se replie, se lève et revient. Les points de la sole (bout des
# doigts, coussinet) ne passent jamais sous le sol. Poses repliées (assis, couché) : on vise directement le
# métapode et la cinématique inverse à 2 os place coude/grasset.
# Repère Blender : avant = -Y, haut = +Z, sol z = 0, gauche du chien = +X (le GLB exporté regarde vers +Z).
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
    """cfg :
      legs {lab: {points: [J0..J4] (articulations au repos, J4 = bout des doigts), drive: [(os, segment k)]
                  (chaque os suit rigidement le segment J_k -> J_k+1 ; un segment peut n'avoir aucun os),
                  neutral_points (pose debout de référence si le repos du fichier est en pleine foulée),
                  heel_y: y du coussinet, kind: 'front'|'hind', gain, neutral_dy, scap: os de l'omoplate, scap_gain}}
      neck, head, tail, ears, jaw : listes d'os ; flex : [(os, poids)] (flexion du dos au galop)
      pitch_pivot : Vector ; zmin_tail : hauteur mini des os de la queue
    """

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
        self.drive_of = {}
        for lab, L in cfg['legs'].items():
            J = [p.copy() for p in L['points']]
            drive = L['drive']
            lens = [(J[i + 1] - J[i]).length for i in range(4)]
            # pose neutre (debout) : le repos du fichier, ou une pose donnée (repos pris en pleine foulée)
            Jn = [p.copy() for p in L.get('neutral_points', J)]
            dxs = [Jn[i + 1].x - Jn[i].x for i in range(4)]
            l2d = [math.sqrt(max(1e-10, lens[i] ** 2 - dxs[i] ** 2)) for i in range(4)]
            a0 = math.atan2(Jn[1].z - Jn[0].z, Jn[1].y - Jn[0].y)
            h0 = math.atan2(Jn[3].y - Jn[0].y, Jn[0].z - Jn[3].z)
            paw0 = J[4] - J[3]
            seg = [J[i + 1] - J[i] for i in range(4)]
            self.legs[lab] = dict(drive=drive, anchor=drive[0][0], J=J, lens=lens, dxs=dxs, l2d=l2d, a0=a0, h0=h0, paw0=paw0, seg=seg,
                                  kind=L['kind'], gain=L.get('gain', 0.6), scap=L.get('scap'), scap_gain=L.get('scap_gain', 0.0),
                                  heel=Vector((0, L['heel_y'] - J[4].y, 0)),
                                  neutral=Vector((Jn[4].x, Jn[4].y + L.get('neutral_dy', 0.0), 0.0)))  # appui au sol (z = 0)
            for n, k in drive:
                self.drive_of[n] = (lab, k)
        self.scap_of = {L['scap']: lab for lab, L in cfg['legs'].items() if L.get('scap')}

    # --- membres -----------------------------------------------------------------------------------
    def solve_chain(self, lab, J0, F):
        """3 segments (bras/cuisse, avant-bras/jambe, métapode) de J0 vers l'articulation F ; renvoie J0..J3."""
        L = self.legs[lab]
        l1, l2, l3 = L['l2d'][:3]
        a0, h0 = L['a0'], L['h0']
        h = math.atan2(F.y - J0.y, J0.z - F.z)
        a_pref = a0 + L['gain'] * (h - h0)
        best = None
        reach = (l2 + l3) * 0.998
        lo = abs(l2 - l3) + 0.05 * (l2 + l3)
        steps = 180
        for i in range(steps + 1):
            a = a0 - 0.9 + 1.8 * i / steps
            y1 = J0.y + l1 * math.cos(a)
            z1 = J0.z + l1 * math.sin(a)
            d = math.hypot(F.y - y1, F.z - z1)
            cost = (a - a_pref) ** 2 + 400 * max(0.0, d - reach) ** 2 + 400 * max(0.0, lo - d) ** 2
            if best is None or cost < best[0]:
                best = (cost, a, y1, z1, d)
        _, a, y1, z1, d = best
        d = min(max(d, abs(l2 - l3) + 1e-5), l2 + l3 - 1e-6)
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
        """Bout des doigts visé en P, patte tournée de phi (0 = comme au repos, > 0 = talon levé)."""
        L = self.legs[lab]
        h = rx(phi, L['paw0'])
        for _ in range(4):
            F = P - h
            J = self.solve_chain(lab, J0, F)
            J4 = J[3] + h
            pts = [J4, J4 + rx(phi, L['heel'])]
            low = min(p.z for p in pts)
            if low >= -1e-4:
                break
            P = P + Vector((0, 0, -low + 0.0005))
        return J + [J4], pts

    def solve_fold(self, lab, J0, J3, a3, phi, splay=0.0, bend=None):
        """Pose repliée : métapode posé (J3 visé, angle a3 dans le plan (y, z) de J3 vers J2), IK à 2 os
        pour le coude / grasset. bend : +1 articulation J1 vers l'arrière (+Y), -1 vers l'avant."""
        L = self.legs[lab]
        l1, l2, l3 = L['l2d'][:3]
        J2 = J3 + Vector((0.0, l3 * math.cos(a3), l3 * math.sin(a3)))
        d = math.hypot(J2.y - J0.y, J2.z - J0.z)
        d = min(max(d, abs(l1 - l2) + 1e-5), l1 + l2 - 1e-6)
        ca = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)
        alpha = math.acos(max(-1.0, min(1.0, ca)))
        g = math.atan2(J2.z - J0.z, J2.y - J0.y)
        if bend is None:
            bend = 1 if L['kind'] == 'front' else -1
        # bend +1 : J1 du côté où (J2-J0) x (J1-J0) > 0 dans le plan (y, z) (en arrière d'une patte verticale)
        cand = [g + alpha, g - alpha]
        pts = [Vector((0, J0.y + l1 * math.cos(c), J0.z + l1 * math.sin(c))) for c in cand]
        vy, vz = J2.y - J0.y, J2.z - J0.z
        cross = [vy * (p.z - J0.z) - vz * (p.y - J0.y) for p in pts]
        if bend == 'fwd':
            # (articulation J1 du côté de l'avant du chien, quel que soit le sens de J0 -> J2 : grasset du couché)
            k = 0 if pts[0].y < pts[1].y else 1
        elif bend == 'up':
            # (J1 du côté du haut : grasset de l'assis, au-dessus de la ligne hanche -> jarret couchée vers l'arrière)
            k = 0 if pts[0].z > pts[1].z else 1
        else:
            k = 0 if (cross[0] > 0) == (bend > 0) else 1
        y1, z1 = pts[k].y, pts[k].z
        dx = L['dxs']
        J1 = Vector((J0.x + dx[0], y1, z1))
        J2 = Vector((J1.x + dx[1], J2.y, J2.z))
        J3 = Vector((J2.x + dx[2], J3.y, J3.z))
        J4 = J3 + rx(phi, L['paw0'])
        J = [J0.copy(), J1, J2, J3, J4]
        if splay:
            sgn = 1.0 if J0.x >= 0 else -1.0
            R = rot_axis_about(sgn * -splay, (0, 1, 0), J0)  # écarte vers l'extérieur
            J = [J[0]] + [R @ p for p in J[1:]]
        pts = [J[4], J[4] + rx(phi, L['heel'])]
        return J, pts

    def bone_matrix(self, name, seg_rest, j_rest, head, tail):
        """Matrice (espace armature) d'un os porté rigidement par un segment : le segment de repos
        (j_rest, j_rest + seg_rest) devient head -> tail (rotation minimale)."""
        R = self.rest[name]
        q = seg_rest.normalized().rotation_difference((tail - head).normalized())
        Q = q.to_matrix()
        M = (Q @ R.to_3x3()).to_4x4()
        M.translation = head + Q @ (R.translation - j_rest)
        return M

    def inherited(self, name, pose):
        b = self.bones[name]
        if b.parent is None:
            return pose['__body__'] @ self.rest[name]
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
    """Cible du bout des doigts et angle de la patte, pour la jambe lab à la phase t (allures)."""
    L = rig.legs[lab]
    n = L['neutral']
    kind = L['kind']
    S = gp['stride'] * gp.get('stride_scale', {}).get(kind, 1.0)
    D = gp['duty']
    ph = (t - gp['phase'][lab]) % 1.0
    lift = gp['lift'] * gp.get('lift_scale', {}).get(kind, 1.0)
    fwd = gp.get('fwd_bias', {}).get(kind, 0.0) + gp.get('leg_dy', {}).get(lab, 0.0)
    beta = gp.get('breakover', 0.35) * gp.get('bo_scale', {}).get(kind, 1.0)
    bo = 0.25
    curl = gp.get('curl', 1.0) * gp.get('curl_scale', {}).get(kind, 1.0)
    base = Vector((n.x, n.y + fwd, n.z))
    if S <= 1e-6:
        return base, 0.0
    if ph < D:
        u = ph / D
        y = base.y - S / 2 + S * u
        b = beta * smooth((u - (1 - bo)) / bo)
        return Vector((n.x, y, n.z)), b
    u = (ph - D) / (1 - D)
    y = base.y + S / 2 - S * smooth(u)
    k = gp.get('lift_skew', 0.35)
    s = math.sin(math.pi * min(1.0, u * (1 + k) / (1 + k * u)))
    z = n.z + lift * max(0.0, s)
    y += gp.get('fold', 0.0) * math.sin(math.pi * u) * (1 - u)
    phi = beta * (1 - smooth(u / 0.35)) + curl * math.sin(math.pi * min(1.0, u * 1.15)) ** 1.3
    return Vector((n.x, y, z)), phi


def pose_at(rig, t, gp, extra=None):
    cfg = rig.cfg
    pose = {}
    w = TAU
    e = extra(t) if extra else {}
    bob = gp.get('bob', 0.0) * math.cos(w * gp.get('bob_freq', 2) * (t - gp.get('bob_phase', 0.0))) + e.get('bob', 0.0)
    drop = gp.get('drop', 0.0) + e.get('drop', 0.0)
    pitch = gp.get('pitch_base', 0.0) + gp.get('pitch', 0.0) * math.cos(w * gp.get('pitch_freq', 1) * (t - gp.get('pitch_phase', 0.0))) + e.get('pitch', 0.0)
    roll = gp.get('roll_base', 0.0) + gp.get('roll', 0.0) * math.sin(w * (t - gp.get('roll_phase', 0.0))) + e.get('roll', 0.0)
    sway = gp.get('sway', 0.0) * math.sin(w * (t - gp.get('sway_phase', 0.0))) + e.get('sway', 0.0)
    yaw = gp.get('yaw_base', 0.0) + e.get('yaw', 0.0)
    shift = gp.get('shift', 0.0) + e.get('shift', 0.0)
    delta = Vector((sway, shift, bob - drop))
    pivot = gp.get('pivot') or cfg['pitch_pivot']
    body = Matrix.Translation(delta) @ rot_x_about(pitch, pivot) @ rot_axis_about(roll, (0, 1, 0), pivot) @ rot_z_about(yaw, pivot)
    pose['__body__'] = body
    flex = gp.get('flex', 0.0) * math.cos(w * (t - gp.get('flex_phase', 0.0))) + gp.get('flex_base', 0.0) + e.get('flex', 0.0)
    flexw = dict(cfg.get('flex', []))
    lows = {}
    targets = {}
    for lab in rig.legs:
        if lab in gp.get('legs', {}):
            continue
        targets[lab] = leg_target(rig, lab, t, gp)
    pending = list(rig.order)
    solved = set()
    while pending:
        later = []
        for name in pending:
            if name in pose:
                continue
            b = rig.bones[name]
            if name in rig.drive_of and rig.legs[rig.drive_of[name][0]]['anchor'] != name:
                if rig.drive_of[name][0] not in solved:
                    later.append(name)
                continue
            if b.parent is not None and b.parent.name not in pose:
                later.append(name)
                continue
            _pose_bone(rig, name, pose, gp, t, e, targets, lows, solved, flex, flexw, w)
        if len(later) == len(pending):
            raise RuntimeError('pose_at : os impossibles à poser ' + str(later[:5]))
        pending = later
    return pose, lows


def _pose_bone(rig, name, pose, gp, t, e, targets, lows, solved, flex, flexw, w):
    cfg = rig.cfg
    neck_amp = gp.get('neck', 0.0)
    neck_base = gp.get('neck_base', 0.0)
    head_amp = gp.get('head', 0.0)
    head_base = gp.get('head_base', 0.0)
    nf = gp.get('neck_freq', 2)
    nph = gp.get('neck_phase', 0.0)
    tail_lift = gp.get('tail_lift', 0.0)
    tail_amp = gp.get('tail_amp', 0.0)
    tail_yaw = gp.get('tail_yaw', 0.0)
    zmin_tail = cfg.get('zmin_tail', 0.01)
    if True:
        if name in rig.drive_of:
            lab, _ = rig.drive_of[name]
            L = rig.legs[lab]
            M0 = rig.inherited(name, pose)
            R0 = rig.rest[name]
            J0 = (M0 @ R0.inverted()) @ L['J'][0]
            over = gp.get('legs', {}).get(lab)
            if over:
                J3 = Vector((L['J'][3].x, L['neutral'].y + over.get('dy', 0.0), over.get('z3', L['J'][3].z)))
                if 'J3' in over:
                    J3 = Vector((L['J'][3].x, over['J3'][0], over['J3'][1]))
                J, pts = rig.solve_fold(lab, J0, J3, over.get('a3', 0.0), over.get('phi', 0.0), over.get('splay', 0.0), over.get('bend'))
            else:
                P, phi = targets[lab]
                J, pts = rig.solve_leg(lab, J0, P, phi)
                nw = gp.get('narrow', 0.0)
                if nw:
                    # pieds ramenés vers la ligne du milieu (marche en équilibre sur une barre) : la patte tourne autour
                    # de l'axe long du corps, à l'épaule ou à la hanche
                    v = J[4] - J0
                    r = math.hypot(v.x, v.z)
                    want_x = J[4].x * (1 - nw) - J0.x
                    th = math.asin(max(-1.0, min(1.0, want_x / max(r, 1e-6)))) - math.atan2(v.x, -v.z)
                    R = rot_axis_about(th, (0, 1, 0), J0)
                    if abs((R @ J[4]).x - J[4].x * (1 - nw)) > abs((rot_axis_about(-th, (0, 1, 0), J0) @ J[4]).x - J[4].x * (1 - nw)):
                        R = rot_axis_about(-th, (0, 1, 0), J0)
                    J = [J[0]] + [R @ p for p in J[1:]]
                    pts = [R @ p for p in pts]
            lows[lab] = min(p.z for p in pts)
            for n, k in L['drive']:
                pose[n] = rig.bone_matrix(n, L['seg'][k], L['J'][k], J[k], J[k + 1])
            solved.add(lab)
            return
        M = rig.inherited(name, pose)
        if name in cfg.get('base_basis', {}):
            M = M @ cfg['base_basis'][name]
        c = M.translation.copy()
        if name in rig.scap_of and rig.scap_of[name] in targets:
            lab = rig.scap_of[name]
            L = rig.legs[lab]
            P, _ = targets[lab]
            sw = (P.y - L['neutral'].y)
            M = rot_x_about(L['scap_gain'] * sw, c) @ M
        # (omoplate avancée dans une pose : étirement, patte levée)
        if name in rig.scap_of and gp.get('scap', {}).get(rig.scap_of[name]):
            M = rot_x_about(gp['scap'][rig.scap_of[name]], c) @ M
        if name in flexw:
            M = rot_x_about(flex * flexw[name], c) @ M
        # (bascule d'un os autour de sa tête, poses seulement : bassin rentré de l'assis)
        if name in gp.get('tilt', {}):
            M = rot_x_about(gp['tilt'][name], c) @ M
        if name in cfg.get('neck', []):
            th = neck_base + neck_amp * math.cos(w * nf * (t - nph)) + e.get('neck', 0.0)
            M = rot_x_about(th / max(1, len(cfg['neck'])), c) @ M
            yw = e.get('neck_yaw', 0.0)
            if yw:
                M = rot_z_about(yw / max(1, len(cfg['neck'])), c) @ M
        elif name in cfg.get('head', []):
            th = head_base + head_amp * math.cos(w * nf * (t - nph) + 0.6) + e.get('head', 0.0)
            M = rot_x_about(th, c) @ M
            if e.get('head_yaw'):
                M = rot_z_about(e['head_yaw'], c) @ M
            if e.get('head_roll'):
                M = rot_axis_about(e['head_roll'], (0, 1, 0), c) @ M
        elif name in cfg.get('tail', []):
            i = cfg['tail'].index(name)
            nt = len(cfg['tail'])
            tw = cfg.get('tail_weights') or [1.0 / (k + 1) for k in range(nt)]
            norm = 1.6 / sum(tw)
            shape = e.get('tail_shape') or gp.get('tail_shape')
            if shape:
                # forme absolue : angle visé de l'os dans le plan sagittal du corps (0 = vers l'arrière, pi/2 = vers le
                # haut, > pi/2 = recourbé vers l'avant) et écart latéral visé (side : 0 = droit, > 0 vers la gauche)
                Bm = pose['__body__'].to_3x3()
                Bi = Bm.inverted()
                d = Bi @ (M.to_3x3() @ Vector((0, 1, 0)))
                cur = math.atan2(d.z, d.y if abs(d.y) > 1e-9 else 1e-9)
                tgt = shape[min(i, len(shape) - 1)]
                tgt += tail_amp * math.sin(w * (t - 0.12 * i) * gp.get('tail_freq', 1)) * (i + 1) / nt
                tgt += e.get('tail_lift', 0.0) * (i + 1) / nt
                ax = Bm @ Vector((1, 0, 0))
                M = rot_axis_about(tgt - cur, ax, c) @ M
                side = e.get('tail_side') or gp.get('tail_side')
                d = Bi @ (M.to_3x3() @ Vector((0, 1, 0)))
                cy = math.atan2(d.x, math.hypot(d.y, d.z))
                ty = (side[min(i, len(side) - 1)] if side else 0.0)
                ty += tail_yaw * math.sin(w * (t - gp.get('tail_lag', 0.06) * i) * gp.get('tail_yaw_freq', 1)) * (i + 1) / nt
                ty += e.get('tail_yaw', 0.0) * (i + 1) / nt
                up = Bm @ Vector((0, 0, 1))
                # (rotation autour de l'axe perpendiculaire à l'os dans le plan (os, haut du corps))
                bd = (M.to_3x3() @ Vector((0, 1, 0))).normalized()
                ax2 = bd.cross(up).cross(bd)
                if ax2.length < 1e-6:
                    ax2 = up
                M = rot_axis_about(-(ty - cy), ax2.normalized(), c) @ M  # (+ autour de cet axe : vers la droite)
            else:
                th = tail_lift * tw[i] * norm + tail_amp * math.sin(w * (t - 0.15 * i) * gp.get('tail_freq', 1)) * (2.0 / nt if nt > 2 else 1.0)
                th += e.get('tail_lift', 0.0) * tw[i] * norm
                M = rot_x_about(th, c) @ M
                yw = tail_yaw * math.sin(w * (t - gp.get('tail_lag', 0.06) * i) * gp.get('tail_yaw_freq', 1)) + e.get('tail_yaw', 0.0)
                yw *= (2.0 / nt if nt > 2 else 1.0)
                M = rot_z_about(yw, c) @ M
            # jamais sous le sol : on relève l'os autour de sa tête
            end = cfg.get('tail_end', {}).get(name)
            zmin_tail = cfg.get('tail_zmin', {}).get(name, zmin_tail)
            if end is not None:
                tip = M @ rig.rest[name].inverted() @ end
                if tip.z < zmin_tail:
                    # (autour de l'axe horizontal perpendiculaire à l'os : relève le bout, que l'os pointe vers
                    # l'arrière ou, queue enroulée, vers l'avant)
                    ax = (tip - c).cross(Vector((0, 0, 1)))
                    if ax.length < 1e-9:
                        ax = Vector((1, 0, 0))
                    ax.normalize()
                    lo, hi = 0.0, 1.6
                    for _ in range(20):
                        mid = (lo + hi) / 2
                        tz = (rot_axis_about(mid, ax, c) @ tip).z
                        if tz < zmin_tail:
                            lo = mid
                        else:
                            hi = mid
                    M = rot_axis_about(hi, ax, c) @ M
        if name in cfg.get('ears', []):
            sgn = 1 if cfg['ears'].index(name) % 2 == 0 else -1
            if 'ear' in e:
                M = rot_z_about(sgn * e['ear'], c) @ M
            one = e.get('ear_l' if sgn > 0 else 'ear_r')
            if one:
                M = rot_z_about(sgn * one, c) @ M
            if 'ear_back' in e or gp.get('ear_back'):
                M = rot_x_about(e.get('ear_back', 0.0) + gp.get('ear_back', 0.0), c) @ M
        if name in cfg.get('jaw', []):
            jw = gp.get('jaw', 0.0) + e.get('jaw', 0.0)
            if jw:
                M = rot_x_about(jw, c) @ M
        if name in cfg.get('tongue', []):
            # langue : chaque os se plie un peu plus que le précédent (lapement : le bout se recourbe)
            tg = e.get('tongue', 0.0)
            if tg:
                k = cfg['tongue'].index(name) + 1
                M = rot_x_about(tg * k / len(cfg['tongue']), c) @ M
        pose[name] = M


SUB = 2  # clés par image à 30 i/s : la scène est à 30 × SUB i/s (pattes rapides de la course : entre deux clés
         # trop espacées, l'interpolation des rotations faisait passer le pied sous le sol)


def bake(rig, action_name, gp, frames, extra=None, cyclic=True, pose_fn=None):
    """Cuit une action (clés à chaque image ; frames est compté à 30 i/s). pose_fn(t) -> (pose, lows) remplace
    pose_at si donné."""
    arm = rig.arm
    if arm.animation_data is None:
        arm.animation_data_create()
    act = bpy.data.actions.new(action_name)
    act.use_fake_user = True
    arm.animation_data.action = act
    prevq = {}
    worst = 0.0
    frames = frames * SUB
    n = frames
    for f in range(frames + 1):
        t = ((f % frames) / frames) if cyclic else (f / frames)
        pose, lows = pose_fn(t) if pose_fn else pose_at(rig, t, gp, extra)
        if rig.cfg.get('post'):
            pose = rig.cfg['post'](pose)
        if lows:
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
            pb.scale = (1, 1, 1)
    for fc in act.fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = 'LINEAR'
    act.frame_range = (0, frames)
    act.use_frame_range = True
    act.use_cyclic = cyclic
    arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
    print('BAKE', action_name, frames, 'sole min z (IK)', round(worst, 4))
    return act


def blend_poses(rig, pa, pb, u):
    """Mélange deux poses (matrices espace armature) dans le repère local de chaque os : rotations sphériques,
    translations linéaires, puis la chaîne est recomposée de la racine vers les bouts. (Mélanger directement les
    matrices de l'armature déplaçait les os les uns par rapport aux autres ; Blender ignore la translation d'un os
    connecté : au milieu d'une transition, la queue passait sous le sol.) u : nombre, ou fonction (nom de l'os -> u)
    pour qu'une partie du corps devance l'autre."""
    ba, bb = rig.to_basis(pa), rig.to_basis(pb)
    out = {'__body__': pa['__body__']}
    for name in rig.order:
        la, qa, _ = ba[name].decompose()
        lb, qb, _ = bb[name].decompose()
        if qa.dot(qb) < 0:
            qb = -qb
        un = u(name) if callable(u) else u
        Mb = qa.slerp(qb, un).to_matrix().to_4x4()
        Mb.translation = la.lerp(lb, un)
        b = rig.bones[name]
        if b.parent is None:
            out[name] = rig.rest[name] @ Mb
        else:
            p = b.parent.name
            out[name] = out[p] @ rig.rest[p].inverted() @ rig.rest[name] @ Mb
    return out


def gaits(s, fps=30):
    """Allures d'un chien. s = longueur de patte (hauteur de la hanche) / 0,42 m (labrador de 57 cm au garrot).
    Vitesse naturelle = stride / (duty × durée du cycle) : à cette vitesse les pattes posées ne glissent pas."""
    G = {}
    # Pas : 4 temps latéraux (PG, AG, PD, AD), coussinets à plat, tête qui suit.
    G['walk'] = dict(frames=26, stride=0.50 * s, duty=0.62, lift=0.075 * s, lift_scale={'front': 1.15, 'hind': 0.9},
                     phase={'HL': 0.0, 'FL': 0.23, 'HR': 0.5, 'FR': 0.73}, breakover=0.45, curl=1.0, curl_scale={'front': 1.1, 'hind': 0.8},
                     bob=0.006 * s, bob_freq=2, bob_phase=0.1, pitch=0.006, neck=0.03, neck_freq=2, neck_phase=0.3,
                     head=0.02, tail_yaw=0.18, tail_lag=0.08, roll=0.015, sway=0.006 * s, fold=0.03 * s, drop=0.004 * s)
    # Trot : diagonaux, petite suspension, dos stable.
    G['trot'] = dict(frames=14, stride=0.46 * s, duty=0.42, lift=0.11 * s, lift_scale={'front': 1.2, 'hind': 1.0},
                     phase={'HL': 0.0, 'FR': 0.02, 'HR': 0.5, 'FL': 0.52}, breakover=0.5, curl=1.35, curl_scale={'front': 1.1, 'hind': 0.85},
                     bob=0.014 * s, bob_freq=2, bob_phase=0.45, drop=0.012 * s, pitch=0.0, neck=0.015, neck_freq=2, neck_phase=0.1,
                     head=0.01, tail_lift=0.06, tail_amp=0.03, tail_freq=2, tail_yaw=0.08, fold=0.04 * s, roll=0.01)
    # Galop rotatoire (PG, PD, AD, AG) : flexion / extension du dos, deux temps de suspension réduits.
    G['run'] = dict(frames=10, stride=0.56 * s, duty=0.30, lift=0.15 * s, lift_scale={'front': 1.25, 'hind': 1.05},
                    phase={'HL': 0.0, 'HR': 0.09, 'FR': 0.40, 'FL': 0.50}, breakover=0.55, curl=1.5, curl_scale={'front': 1.0, 'hind': 0.9},
                    bob=0.025 * s, bob_freq=1, bob_phase=0.80, drop=0.03 * s, pitch=0.07, pitch_phase=0.55,
                    flex=0.16, flex_phase=0.95, neck=0.08, neck_base=0.10, neck_freq=1, neck_phase=0.55, head=0.05, head_base=-0.10,
                    tail_lift=0.10, tail_amp=0.10, tail_freq=1, fold=0.06 * s, jaw=0.25)
    for g in G.values():
        g['speed'] = g['stride'] / (g['duty'] * g['frames'] / fps)
    return G


def bend(rig, pose, spec, glob=None):
    """Flexion après coup d'une pose (matrices espace armature) : spec {os: (axe, angle)} ; l'axe ('X' : travers du
    corps, 'Y' : long du corps, 'Z' : haut du corps) est pris dans le repère du corps à cet os (pose de départ), la
    rotation se fait autour de la tête de l'os et entraîne tous ses descendants. glob : matrice appliquée ensuite à
    tout le chat (le coucher sur le flanc)."""
    old = pose
    new = {'__body__': old['__body__']}
    for name in rig.order:
        b = rig.bones[name]
        Mo = old[name]
        if name in spec:
            # (une flexion (axe, angle), ou une liste de flexions appliquées l'une après l'autre)
            sp = spec[name] if isinstance(spec[name], list) else [spec[name] if isinstance(spec[name], tuple) else ('Z', spec[name])]
            for axn, ang in sp:
                D = Mo @ rig.rest[name].inverted()
                # (axe nommé, ou vecteur dans le repère du corps : chaton en boule couché sur le flanc, flexion autour
                # de la verticale du sol une fois couché)
                ax = D.to_3x3() @ (Vector(axn) if not isinstance(axn, str) else Vector({'X': (1, 0, 0), 'Y': (0, 1, 0), 'Z': (0, 0, 1)}[axn]))
                Mo = rot_axis_about(ang, ax.normalized(), Mo.translation.copy()) @ Mo
        if b.parent is None:
            new[name] = Mo
        else:
            p = b.parent.name
            # garde la position relative au parent de la pose de départ, puis la flexion propre à l'os
            rel = old[p].inverted() @ old[name]
            if name in spec:
                rel = old[p].inverted() @ Mo
            new[name] = new[p] @ rel
    if glob is not None:
        for k in list(new):
            new[k] = glob @ new[k]
    return new


def cat_gaits(s, fps=30):
    """Allures d'un chat. s = hauteur de la hanche / 0,20 m (chat européen de 25 cm au garrot).
    Vitesse naturelle = stride / (duty × durée du cycle) : à cette vitesse les pattes posées ne glissent pas."""
    G = {}
    # Pas : 4 temps latéraux, pas feutrés (pieds levés bas, posés l'un devant l'autre), tête basse et stable, queue
    # levée en point d'interrogation.
    G['walk'] = dict(frames=24, stride=0.30 * s, duty=0.64, lift=0.040 * s, lift_scale={'front': 1.2, 'hind': 0.9},
                     phase={'HL': 0.0, 'FL': 0.24, 'HR': 0.5, 'FR': 0.74}, breakover=0.45, curl=1.0, curl_scale={'front': 1.1, 'hind': 0.8},
                     bob=0.003 * s, bob_freq=2, bob_phase=0.1, pitch=0.005, neck=0.02, neck_freq=2, neck_phase=0.3,
                     head=0.015, roll=0.02, sway=0.004 * s, fold=0.02 * s, drop=0.004 * s,
                     tail_shape=[0.75, 1.05, 1.3, 1.45, 1.55, 1.7, 2.0, 2.4], tail_amp=0.06, tail_freq=1, tail_yaw=0.10, tail_lag=0.08)
    # Trot (petite course) : diagonaux, petite suspension, queue mi-haute.
    G['trot'] = dict(frames=14, stride=0.36 * s, duty=0.44, lift=0.07 * s, lift_scale={'front': 1.2, 'hind': 1.0},
                     phase={'HL': 0.0, 'FR': 0.02, 'HR': 0.5, 'FL': 0.52}, breakover=0.5, curl=1.35, curl_scale={'front': 1.1, 'hind': 0.85},
                     bob=0.008 * s, bob_freq=2, bob_phase=0.45, drop=0.008 * s, neck=0.015, neck_freq=2, neck_phase=0.1,
                     head=0.01, fold=0.03 * s, roll=0.01,
                     tail_shape=[0.45, 0.6, 0.75, 0.85, 0.95, 1.1, 1.3, 1.5], tail_amp=0.08, tail_freq=2, tail_yaw=0.06)
    # Course (galop rotatoire / demi-bond) : grande flexion et extension du dos, queue en balancier derrière.
    G['run'] = dict(frames=10, stride=0.62 * s, duty=0.30, lift=0.11 * s, lift_scale={'front': 1.2, 'hind': 1.05},
                    phase={'HL': 0.0, 'HR': 0.07, 'FL': 0.42, 'FR': 0.52}, breakover=0.55, curl=1.5, curl_scale={'front': 1.0, 'hind': 0.9},
                    bob=0.016 * s, bob_freq=1, bob_phase=0.80, drop=0.025 * s, pitch=0.08, pitch_phase=0.55,
                    flex=0.30, flex_phase=0.95, neck=0.06, neck_base=0.05, neck_freq=1, neck_phase=0.55, head=0.04, head_base=-0.05,
                    tail_shape=[0.15, 0.12, 0.1, 0.08, 0.08, 0.1, 0.15, 0.25], tail_amp=0.15, tail_freq=1, ear_back=0.25)
    for g in G.values():
        g['speed'] = g['stride'] / (g['duty'] * g['frames'] / fps)
    return G
