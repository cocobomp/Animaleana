# Moteur des membres d'un lapin (Blender 4.2) : repris de dog_gait.py des chiens du jeu (tools/chien/), réduit à ce
# dont les lapins se servent (Rig : cinématique inverse des pattes ; bake : cuisson d'une action ; outils de rotation).
#
# Corrections faites pour le jeu (contre-vérification de la page « Choisis ton chat et ton lapin ») :
# - cinématique inverse à 2 os LIMITÉE à 0,98 de l'allonge (REACH) et SANS ÉTIREMENT : quand le poignet ou le
#   jarret visé est trop loin, la patte entière (articulation visée et pied) est ramenée vers l'épaule ou la hanche le
#   long de la même droite ; les os gardent leur longueur (avant : le poignet restait sur la cible, l'avant-bras
#   « s'allongeait » de 30 % à la course et de 2,7 fois à la toilette du bélier) ;
# - AUCUNE TRANSLATION D'OS SAUF LA RACINE : la cuisson n'écrit la position que de l'os racine ; les autres ne
#   reçoivent que des rotations et l'écart résiduel (position voulue - position héritée) est mesuré et rapporté
#   (RESIDUAL, en mètres : doit rester sous le dixième de millimètre).
# Repère Blender : avant = -Y, haut = +Z, sol z = 0, gauche du lapin = +X (le GLB exporté regarde vers +Z).
import bpy, math
from mathutils import Vector, Matrix

TAU = math.tau
REACH = 0.98  # allonge maximale d'une patte (part de la longueur bras + avant-bras, ou cuisse + jambe)
SUB = 2  # clés par image à 30 i/s (la scène et le GLB sont à 30 × SUB i/s : course et saut sans pied sous le sol entre deux clés)
RESIDUAL = {}  # action -> plus grand écart de position d'un os non racine (m)


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
    """cfg : legs {lab: {points: [J0..J4] (articulations au repos, J4 = bout des doigts), drive: [(os, segment k)]
    (chaque os suit rigidement le segment J_k -> J_k+1), heel_y: y du coussinet, kind: 'front' | 'hind'}}."""

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
            dxs = [J[i + 1].x - J[i].x for i in range(4)]
            l2d = [math.sqrt(max(1e-10, lens[i] ** 2 - dxs[i] ** 2)) for i in range(4)]
            paw0 = J[4] - J[3]
            seg = [J[i + 1] - J[i] for i in range(4)]
            self.legs[lab] = dict(drive=drive, anchor=drive[0][0], J=J, lens=lens, dxs=dxs, l2d=l2d, paw0=paw0, seg=seg,
                                  kind=L['kind'], heel=Vector((0, L['heel_y'] - J[4].y, 0)))
            for n, k in drive:
                self.drive_of[n] = (lab, k)

    def reach_target(self, lab, J0, J3, a3):
        """Allonge demandée par une cible (J3 et l'angle a3 du métapode) : distance épaule (hanche) -> poignet (jarret)
        visé, en part de bras + avant-bras ; et l'écart (dy, dz) de J0 au poignet visé."""
        L = self.legs[lab]
        l1, l2, l3 = L['l2d'][:3]
        J2 = J3 + Vector((0.0, l3 * math.cos(a3), l3 * math.sin(a3)))
        dy, dz = J2.y - J0.y, J2.z - J0.z
        return math.hypot(dy, dz) / (l1 + l2), dy, dz

    def solve_fold(self, lab, J0, J3, a3, phi, splay=0.0, bend=None):
        """Patte posée ou portée : métapode visé (J3, angle a3 dans le plan (y, z) de J3 vers J2), cinématique inverse
        à 2 os pour le coude / grasset. bend : +1 articulation J1 vers l'arrière (+Y), -1 vers l'avant, 'fwd', 'up'.
        Allonge bornée à REACH (et à un repli minimal) : la patte est ramenée d'un bloc vers J0, rien ne s'étire.
        Renvoie (J0..J4, points de la sole, allonge demandée avant la borne)."""
        L = self.legs[lab]
        l1, l2, l3 = L['l2d'][:3]
        J3 = J3.copy()
        J2 = J3 + Vector((0.0, l3 * math.cos(a3), l3 * math.sin(a3)))
        v = Vector((0.0, J2.y - J0.y, J2.z - J0.z))
        d = v.length
        want = d / (l1 + l2)
        dmax = REACH * (l1 + l2)
        dmin = abs(l1 - l2) + 0.08 * (l1 + l2)
        if d > dmax or d < dmin:
            # D'abord le métapode tourne autour de J3 (le talon se lève ou se rabat, le pied reste où il est : pas de
            # glissement d'un pied posé), au plus près de l'angle demandé et d'un radian au plus ; sinon la patte entière
            # est ramenée vers J0 (ou repoussée) le long de la même droite.
            cy, cz = J3.y - J0.y, J3.z - J0.z
            for k in range(1, 101):
                done = False
                for sgn in (1, -1):
                    b = a3 + sgn * 0.01 * k
                    dd = math.hypot(cy + l3 * math.cos(b), cz + l3 * math.sin(b))
                    if dmin <= dd <= dmax:
                        a3 = b
                        J2 = J3 + Vector((0.0, l3 * math.cos(a3), l3 * math.sin(a3)))
                        v = Vector((0.0, J2.y - J0.y, J2.z - J0.z))
                        d = v.length
                        done = True
                        break
                if done:
                    break
        if d > dmax or d < dmin:
            k = (dmax if d > dmax else dmin) / max(d, 1e-9)
            shift = v * (k - 1.0)
            J2 = J2 + shift
            J3 = J3 + shift
            d = v.length * k
        ca = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)
        alpha = math.acos(max(-1.0, min(1.0, ca)))
        g = math.atan2(J2.z - J0.z, J2.y - J0.y)
        if bend is None:
            bend = 1 if L['kind'] == 'front' else -1
        cand = [g + alpha, g - alpha]
        pts = [Vector((0, J0.y + l1 * math.cos(c), J0.z + l1 * math.sin(c))) for c in cand]
        vy, vz = J2.y - J0.y, J2.z - J0.z
        cross = [vy * (p.z - J0.z) - vz * (p.y - J0.y) for p in pts]
        if bend == 'fwd':
            k = 0 if pts[0].y < pts[1].y else 1
        elif bend == 'up':
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
        return J, pts, want

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


def bake(rig, action_name, gp, frames, extra=None, cyclic=True, pose_fn=None, sub=SUB):
    """Cuit une action : pose_fn(t) -> (pose, lows) à chaque image (frames comptées à 30 i/s, sub clés par image).
    Rotations de tous les os ; position de l'os racine seulement (les autres suivent leur parent : jamais d'os
    étiré). L'écart de position que la pose demandait à un os non racine est noté dans RESIDUAL."""
    arm = rig.arm
    if arm.animation_data is None:
        arm.animation_data_create()
    act = bpy.data.actions.new(action_name)
    act.use_fake_user = True
    arm.animation_data.action = act
    prevq = {}
    worst = 0.0
    resid = 0.0
    n = frames * sub
    for f in range(n + 1):
        t = ((f % n) / n) if cyclic else (f / n)
        pose, lows = pose_fn(t)
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
            if rig.bones[name].parent is None:
                pb.location = loc
                pb.keyframe_insert('location', frame=f, group=name)
            else:
                resid = max(resid, loc.length)
                pb.location = (0, 0, 0)
            pb.scale = (1, 1, 1)
    for fc in act.fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = 'LINEAR'
    act.frame_range = (0, n)
    act.use_frame_range = True
    act.use_cyclic = cyclic
    act['sub'] = sub
    arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
    RESIDUAL[action_name] = round(resid, 5)
    print('BAKE', action_name, n, 'sole min z (IK)', round(worst, 4), 'écart os', round(resid, 5))
    return act
