# Poses et allures procédurales d'un lapin (Blender 4.2), sur le moteur de membres des chiens
# (rabbit_gait.py = copie de tools/chien/dog_gait.py : Rig, solve_fold, bone_matrix, bake, blend_poses).
#
# Une pose est un dictionnaire P (une image) :
#   corps   : dz, dy, pitch (+ = nez en l'air), roll, yaw, pivot ; flex (+ = dos rond), twist (torsion du corps en vol)
#   tête    : neck, neck_yaw, head, head_yaw, head_roll (+ = vers le haut / vers la gauche du lapin)
#   oreilles: earL / earR = {back, out, twist} (+ = vers l'arrière / vers l'extérieur), réparties sur la chaîne
#   queue   : tail (+ = relevée), tail_yaw ; jaw (ouverture), nose (frémissement)
#   membres : legs = {lab: {mode: 'ground' | 'body', J3: (y, z), a3, toe, bend, splay}}
#             'ground' : articulation métapode-doigts J3 posée dans le repère du sol (pied planté) ;
#             'body'   : J3 et l'angle du métapode a3 dans le repère de l'os parent du membre (patte portée) ;
#             a3 : angle (plan y, z) de J3 vers J2 (0 = métapode à plat vers l'arrière, pi/2 = vertical) ;
#             toe : rotation des doigts par rapport au repos (+ = bout relevé), ou toe_abs (angle brut dans le plan y, z).
# Repère Blender : avant = -Y, haut = +Z, sol z = 0, gauche du lapin = +X (le GLB exporté regarde vers +Z).
import bpy, math
import numpy as np
from mathutils import Vector, Matrix
import rabbit_gait as dg

TAU = math.tau
DEBUG = bool(__import__("os").environ.get("RABBIT_DEBUG"))
rot_x = dg.rot_x_about
rot_z = dg.rot_z_about
rot_axis = dg.rot_axis_about
smooth = dg.smooth


def rot_y(th, c):
    return rot_axis(th, (0, 1, 0), c)


def wrap(a):
    while a > math.pi:
        a -= TAU
    while a < -math.pi:
        a += TAU
    return a


def lerp(a, b, u):
    return a + (b - a) * u


def ang_yz(v):
    return math.atan2(v.z, v.y)


class Rabbit:
    """cfg (en plus de celui de dg.Rig) : spine [(os, poids)], neck [(os, poids)], head [os], earL / earR [(os, poids)],
    tail [(os, poids)], jaw [os], nose [os], scap {lab: os}, pivot (Vector), probes [(os, Vector repos)] (points de
    peau pour le contact au sol)."""

    def __init__(self, arm, cfg):
        self.arm = arm
        self.cfg = cfg
        self.rig = dg.Rig(arm, cfg)
        R = self.rig
        self.role = {}
        for key in ('spine', 'neck', 'earL', 'earR', 'tail', 'twist'):
            for n, w in cfg.get(key, []):
                self.role.setdefault(n, []).append((key, w))
        for key in ('head', 'jaw', 'nose'):
            for n in cfg.get(key, []):
                self.role.setdefault(n, []).append((key, 1.0))
        self.scap_of = {v: k for k, v in cfg.get('scap', {}).items()}
        self.parent_of_leg = {}
        for lab, L in R.legs.items():
            b = R.bones[L['anchor']]
            self.parent_of_leg[lab] = b.parent.name if b.parent else None
            # angles de repos
            J = L['J']
            L['a3_rest'] = ang_yz(J[2] - J[3])
            L['toe_rest'] = ang_yz(L['paw0'])
        self.pivot = cfg['pivot']

    # ------------------------------------------------------------------------------------------------------------
    def body_matrix(self, P):
        piv = P.get('pivot', self.pivot)
        d = Vector((P.get('dx', 0.0), P.get('dy', 0.0), P.get('dz', 0.0)))
        return (Matrix.Translation(d) @ rot_z(P.get('yaw', 0.0), piv) @ rot_x(-P.get('pitch', 0.0), piv)
                @ rot_y(P.get('roll', 0.0), piv))

    def build(self, P):
        R = self.rig
        pose = {'__body__': self.body_matrix(P)}
        info = {'lows': {}, 'reach': {}}
        legs = P.get('legs', {})
        for name in R.order:
            b = R.bones[name]
            if name in R.drive_of:
                lab, k = R.drive_of[name]
                L = R.legs[lab]
                if name != L['anchor']:
                    continue  # posé avec l'ancre
                self._leg(lab, pose, legs.get(lab, {}), info)
                continue
            M = R.inherited(name, pose)
            c = M.translation.copy()
            for role, w in self.role.get(name, []):
                if role == 'spine':
                    M = rot_x(P.get('flex', 0.0) * w, c) @ M
                    if P.get('flex_yaw'):
                        M = rot_z(P['flex_yaw'] * w, c) @ M
                elif role == 'twist':
                    if P.get('twist'):
                        ax = (M.to_3x3() @ Vector((0, 1, 0))).normalized()
                        M = rot_axis(P['twist'] * w, ax, c) @ M
                elif role == 'neck':
                    M = rot_x(-P.get('neck', 0.0) * w, c) @ M
                    if P.get('neck_yaw'):
                        M = rot_z(P['neck_yaw'] * w, c) @ M
                elif role == 'head':
                    M = rot_x(-P.get('head', 0.0), c) @ M
                    if P.get('head_yaw'):
                        M = rot_z(P['head_yaw'], c) @ M
                    if P.get('head_roll'):
                        M = rot_y(P['head_roll'], c) @ M
                elif role in ('earL', 'earR'):
                    e = dict(P.get('ears', {}))
                    e.update(P.get(role, {}))
                    sgn = 1.0 if role == 'earL' else -1.0
                    if e.get('twist'):
                        ax = (M.to_3x3() @ Vector((0, 1, 0))).normalized()  # axe de l'os
                        M = rot_axis(sgn * e['twist'] * w, ax, c) @ M
                    if e.get('out'):
                        M = rot_y(sgn * e['out'] * w, c) @ M
                    if e.get('back'):
                        M = rot_x(-e['back'] * w, c) @ M
                elif role == 'tail':
                    M = rot_x(P.get('tail', 0.0) * w, c) @ M
                    if P.get('tail_yaw'):
                        M = rot_z(P['tail_yaw'] * w, c) @ M
                elif role == 'jaw':
                    M = rot_x(P.get('jaw', 0.0), c) @ M
                elif role == 'nose':
                    M = rot_x(P.get('nose', 0.0), c) @ M
            if name in self.scap_of:
                M = rot_x(P.get('scap', {}).get(self.scap_of[name], 0.0), c) @ M
            pose[name] = M
        return pose, info

    def _leg(self, lab, pose, spec, info):
        R = self.rig
        L = R.legs[lab]
        anchor = L['anchor']
        M0 = R.inherited(anchor, pose)
        R0 = R.rest[anchor]
        Mpar = M0 @ R0.inverted()  # déplacement rigide hérité du parent
        J0 = Mpar @ L['J'][0]
        mode = spec.get('mode', 'body')
        rotp = ang_yz(Mpar.to_3x3() @ Vector((0, 1, 0)))  # rotation du parent dans le plan (y, z)
        if mode == 'ground':
            y, z = spec['J3']
            J3 = Vector((L['J'][3].x, y, z))
            a3 = spec.get('a3', L['a3_rest'])
        else:
            off = spec.get('J3')
            base = L['J'][3]
            if off is not None:
                base = Vector((base.x, off[0], off[1]))
            J3 = Mpar @ base
            a3 = spec.get('a3', L['a3_rest']) + rotp
        if 'toe_abs' in spec:
            beta = spec['toe_abs']
        elif mode == 'body':
            beta = L['toe_rest'] + rotp + spec.get('toe', 0.0)
        else:
            beta = L['toe_rest'] + spec.get('toe', 0.0)  # toe = 0 : doigts orientés comme au repos (posés)
        phi = wrap(beta - L['toe_rest'])
        J, pts, want = R.solve_fold(lab, J0, J3, a3, phi, spec.get('splay', 0.0), spec.get('bend'))
        # (allonge demandée : au-delà de dg.REACH la patte a été ramenée d'un bloc vers l'épaule ou la hanche)
        info['reach'][lab] = want
        info['lows'][lab] = min(p.z for p in pts)
        for n, k in L['drive']:
            pose[n] = R.bone_matrix(n, L['seg'][k], L['J'][k], J[k], J[k + 1])

    # ---- outils de mise en place ---------------------------------------------------------------------------------
    def joint0(self, P, lab):
        """Position de J0 (hanche / épaule) pour une pose P (sans résoudre les membres)."""
        pose, _ = self.build(dict(P, legs={}))
        L = self.rig.legs[lab]
        M0 = self.rig.inherited(L['anchor'], pose)
        return (M0 @ self.rig.rest[L['anchor']].inverted()) @ L['J'][0]

    def fit_body(self, P, hip_z, sh_z, iters=12):
        """Ajuste dz et pitch pour placer les hanches à hip_z et les épaules à sh_z (moyennes gauche/droite)."""
        P = dict(P)
        for _ in range(iters):
            hz = (self.joint0(P, 'HL').z + self.joint0(P, 'HR').z) / 2
            sz = (self.joint0(P, 'FL').z + self.joint0(P, 'FR').z) / 2
            hy = (self.joint0(P, 'HL').y + self.joint0(P, 'HR').y) / 2
            sy = (self.joint0(P, 'FL').y + self.joint0(P, 'FR').y) / 2
            span = max(1e-6, abs(hy - sy))
            P['pitch'] = P.get('pitch', 0.0) + math.atan2((sh_z - sz) - (hip_z - hz), span) * 0.9
            P['dz'] = P.get('dz', 0.0) + (hip_z - hz) * 0.5 + (sh_z - sz) * 0.5
        return P

    def fit_reach(self, P, iters=3, margin=0.975):
        """Pieds posés trop loin pour la patte (allonge > margin × dg.REACH) : les hanches et/ou les épaules
        descendent juste de ce qu'il faut pour que le poignet (le jarret) visé soit à portée, sans rien étirer."""
        legs = P.get('legs', {})
        for _ in range(iters):
            drop = {'H': 0.0, 'F': 0.0}
            for lab, s in legs.items():
                if s.get('mode') != 'ground' or s.get('hang'):
                    continue  # (patte portée, en l'air : bras, toilette)
                L = self.rig.legs[lab]
                J0 = self.joint0(P, lab)
                y, z = s['J3']
                J3 = Vector((L['J'][3].x, y, z))
                a3 = s.get('a3', L['a3_rest'])
                want, dy, dz = self.rig.reach_target(lab, J0, J3, a3)
                Rm = margin * dg.REACH * (L['l2d'][0] + L['l2d'][1])
                if want * (L['l2d'][0] + L['l2d'][1]) <= Rm or dz >= 0:
                    continue
                # J0 descend de δ : (dy)² + (|dz| - δ)² = Rm² ; un pied trop loin devant ou derrière (|dy| proche de
                # l'allonge) ne se rattrape pas en descendant : la borne de la patte s'en charge (jamais plus d'un quart
                # de la patte : sinon le bélier, court sur pattes, basculait cul par-dessus tête à la course)
                if abs(dy) > 0.92 * Rm:
                    continue
                h = math.sqrt(max(0.0, Rm * Rm - dy * dy))
                drop[lab[0]] = max(drop[lab[0]], min(-dz - h, 0.25 * (L['l2d'][0] + L['l2d'][1])))
            if drop['H'] < 1e-4 and drop['F'] < 1e-4:
                break
            hz = (self.joint0(P, 'HL').z + self.joint0(P, 'HR').z) / 2
            sz = (self.joint0(P, 'FL').z + self.joint0(P, 'FR').z) / 2
            P = self.fit_body(P, hz - drop['H'], sz - drop['F'], iters=6)
        return P

    def set_skin(self, rest_pts, idx, w, paw_sets):
        """Peau pour les contacts : sommets au repos (V×3), indices d'os (V×4, dans self.rig.order) et poids (V×4) ;
        paw_sets {lab: indices des sommets du métapode et des doigts}. Déformation linéaire (comme le moteur 3D)."""
        self.sk_P = np.hstack([np.asarray(rest_pts, dtype=np.float64), np.ones((len(rest_pts), 1))])
        self.sk_idx = np.asarray(idx, dtype=np.int64)
        self.sk_w = np.asarray(w, dtype=np.float64)
        self.sk_paw = {lab: np.asarray(v, dtype=np.int64) for lab, v in paw_sets.items()}
        self.sk_rest_inv = [self.rig.rest[n].inverted() for n in self.rig.order]

    def skin_z(self, pose, sel=None):
        D = np.array([[list(r) for r in (pose[n] @ ri)] for n, ri in zip(self.rig.order, self.sk_rest_inv)])
        idx = self.sk_idx if sel is None else self.sk_idx[sel]
        w = self.sk_w if sel is None else self.sk_w[sel]
        P = self.sk_P if sel is None else self.sk_P[sel]
        # z = somme_k w_k (D[idx_k] @ P)_z
        Dz = D[:, 2, :]  # (Nb, 4) : ligne z des matrices
        z = np.einsum('vk,vkj,vj->v', w, Dz[idx], P)
        return z

    def skin_min(self, pose, probes=None):
        """Plus bas point de la peau (tous les sommets)."""
        return float(self.skin_z(pose).min())

    def paw_min(self, pose, lab):
        return float(self.skin_z(pose, self.sk_paw[lab]).min())

    def fix_soles(self, P, pose, info):
        """Pieds posés : l'articulation J3 est relevée de ce que la sole (sommets de la patte) passe sous le sol."""
        legs = dict(P.get('legs', {}))
        changed = False
        for lab, s in legs.items():
            if s.get('mode') == 'ground':
                z = self.paw_min(pose, lab)
                if z < 0.0004:  # (relevé à 0,8 mm : la compression des positions ne fait plus passer le pied sous le sol)
                    legs[lab] = dict(s, J3=(s['J3'][0], s['J3'][1] + 0.0008 - z))
                    changed = True
        if changed:
            P = dict(P, legs=legs)
            pose, info = self.build(P)
        return P, pose, info

    def pose_fn(self, Pf, ground='lift', probes=None):
        """Fonction t -> (pose, lows) pour dg.bake. ground : 'lift' (on relève le corps si la peau ou une patte
        portée passe sous le sol), 'rest' (posé exactement sur le sol), None (soles seulement)."""
        def f(t):
            P = self.fit_reach(Pf(t))
            pose, info = self.build(P)
            P, pose, info = self.fix_soles(P, pose, info)
            if ground:
                z = self.skin_min(pose, probes)
                for lab in self.rig.legs:
                    if P.get('legs', {}).get(lab, {}).get('mode', 'body') == 'body':
                        z = min(z, self.paw_min(pose, lab))
                if DEBUG and ground == 'lift' and z < 0:
                    zz = self.skin_z(pose)
                    i = int(zz.argmin())
                    print('LIFT t=%.3f z=%.4f os=%s' % (t, z, self.rig.order[int(self.sk_idx[i][0])]), {k: round(v, 3) for k, v in info['reach'].items()})
                if (ground == 'lift' and z < 0) or ground == 'rest':
                    # le corps est relevé (ou posé) ; les pieds plantés restent où ils sont
                    P = dict(P, dz=P.get('dz', 0.0) - z)
                    pose, info = self.build(P)
                    P, pose, info = self.fix_soles(P, pose, info)
            return pose, info['lows']
        return f

    def lowest(self, pose):
        """Plus bas point de la peau et des pattes (pour les transitions)."""
        return self.skin_min(pose)
