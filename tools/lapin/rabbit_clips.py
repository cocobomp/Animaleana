# Clips d'un lapin : postures de base calculées sur les proportions du modèle, puis allures et gestes.
# idle (accroupi), hop (sautillement lent), lope (petit galop en bonds), run (course en bonds, d'après le gabarit de
# CDmir), jump (saut, gabarit de CDmir), sit (assis), stand (debout sur les postérieurs, guetteur), lie (couché étalé),
# sleep (couché en boule), groom (toilette : pattes sur le museau puis l'oreille), sniff (renifler), eat (manger),
# binky (saut de joie), hide (tapi, oreilles plaquées), held (porté dans les bras), transitions sit_down / stand_up /
# rear_up / rear_down / lie_down / get_up (à jouer une fois).
# Angles des métapodes (a3) : écarts à l'angle « à plat » propre au modèle (hind_flat / front_flat, par défaut
# l'angle du repos) ; doigts (toe) : rotation par rapport au repos. Hauteurs de contact mesurées sur la sole.
# Allures : tous les pieds posés reculent à la même vitesse (la vitesse naturelle du clip) : pas de glissement.
import bpy, math, json, os
from mathutils import Vector, Matrix
import rabbit_anim as RA
import rabbit_gait as dg

TAU = math.tau
FPS = 30
BL = 0.35  # longueur nez-croupe

DEFAULTS = dict(
    # accroupi (repos)
    hind_d=0.45, hind_delta=0.30, hind_a3=0.0, front_delta=0.05, front_a3=0.25, crouch_alpha=-0.06,
    flex=0.2, neck=0.0, head=0.0, tail=0.0, ears={},
    # assis
    sit_hind_d=0.40, sit_hind_delta=0.55, sit_alpha=0.38, sit_front_a3=0.45, sit_flex=0.05, sit_pitch_head=0.65,
    # debout (guetteur)
    stand_pitch=1.15, stand_hind_d=0.50, stand_hind_delta=0.10, stand_flex=-0.15, stand_head=0.9,
    # allures
    hop_stride=0.55, hop_frames=20, hop_lift=0.05, lope_stride=1.25, lope_frames=16, lope_lift=0.085, run_frames=16,
    # couché
    lie_hind_back=0.80, lie_front_fwd=0.55, lie_flex=-0.12, lie_neck=-0.25, lie_head=0.05, lie_ears=0.7, lie_alpha=-0.03,
    sleep_ears=0.9, sleep_alpha=-0.08, binky_height=0.15,
    # tapi
    hide_hip=0.80, hide_ears=1.15,
)

TEMPLATES = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'templates')


def generate(ctx, only=None):
    G = Clips(ctx)
    ctx['clips'] = G
    todo = ['idle', 'hop', 'lope', 'run', 'jump', 'sit', 'stand', 'lie', 'sleep', 'groom', 'sniff', 'eat', 'binky', 'hide',
            'held', 'transitions']
    for name in todo:
        if only and name not in only:
            continue
        if name == 'jump':
            tpl = json.load(open(os.path.join(TEMPLATES, 'template_jump.json')))
            retarget(G, tpl, 'jump', False, ears={'back': 0.4})
            continue
        getattr(G, name)()
    ctx['report']['naturalSpeeds'] = G.speeds
    ctx['report']['reach'] = G.reach
    ctx['report']['clamped'] = G.clamped


class Clips:
    def __init__(self, ctx):
        self.ctx = ctx
        self.rab = ctx['rab']
        self.R = self.rab.rig
        self.M = ctx['M']
        o = dict(DEFAULTS)
        o.update(self.M.get('pose', {}))
        self.o = o
        self.speeds = {}
        self.reach = {}
        self.clamped = {}
        L = self.R.legs
        self.hl = L['HL']['l2d'][:3]
        self.fl = L['FL']['l2d'][:3]
        lc = self.R.cfg['legs']
        self.z3h = lc['HL']['c3']
        self.z3f = lc['FL']['c3']
        self.hflat = o.get('hind_flat', L['HL']['a3_rest'])
        self.fflat = o.get('front_flat', L['FL']['a3_rest'])
        for lab in ('FL', 'HL'):
            Lg = L[lab]
            J = Lg['J']
            d = math.hypot(J[2].y - J[0].y, J[2].z - J[0].z)
            print('REST', lab, 'd/(l1+l2)', round(d / (Lg['l2d'][0] + Lg['l2d'][1]), 3), 'a3', round(Lg['a3_rest'], 3),
                  'toe', round(Lg['toe_rest'], 3), 'c3', round(lc[lab]['c3'], 4), 'l', [round(x, 4) for x in Lg['l2d']])
        self.ear_rest = self.M.get('ear_rest', 'up')
        self.has_nose = bool(self.M.get('nose'))
        self.crouch = self.make_crouch()
        self.sitP = self.make_sit()
        self.standP = self.make_stand()

    def ha(self, off):
        return self.hflat + off

    def fa(self, off):
        return self.fflat + off

    # ---- outils --------------------------------------------------------------------------------------------------
    def j0(self, P, lab):
        return self.rab.joint0(P, lab)

    def hipmid(self, P):
        return (self.j0(P, 'HL') + self.j0(P, 'HR')) / 2

    def bake(self, name, Pf, frames, cyclic=True, ground='lift'):
        """Cuit un clip. Rapport : allonge demandée la plus grande (après la descente du corps, fit_reach) et nombre
        d'images où une patte posée a dû être ramenée (borne dg.REACH)."""
        f = self.rab.pose_fn(Pf, ground)
        worst = 0.0
        clamped = 0
        for k in range(0, frames, max(1, frames // 16)):
            P = self.rab.fit_reach(Pf(k / frames))
            _, info = self.rab.build(P)
            if info['reach']:
                w = max(info['reach'].values())
                worst = max(worst, w)
                clamped += w > dg.REACH + 1e-3
        self.reach[name] = round(worst, 3)
        self.clamped[name] = clamped
        dg.bake(self.R, name, None, frames, cyclic=cyclic, pose_fn=f)
        print('CLIP', name, frames, 'allonge max', round(worst, 3), 'bornée', clamped)

    def base_ears(self):
        return dict(self.o.get('ears', {}))

    def fit_hip_only(self, P, hip_z):
        P = dict(P)
        for _ in range(6):
            P['dz'] = P.get('dz', 0.0) + hip_z - self.hipmid(P).z
        return P

    def merge(self, P, extra):
        P = dict(P)
        for k, v in extra.items():
            if isinstance(v, dict) and isinstance(P.get(k), dict):
                d = dict(P[k]); d.update(v); P[k] = d
            elif isinstance(v, (int, float)) and k in P and k not in ('pivot',):
                P[k] = P[k] + v
            else:
                P[k] = v
        return P

    def hind_ground(self, P, s, d_ratio, delta, a3off, splay=0.0):
        """Postérieur replié : distance hanche-jarret = d_ratio × (fémur + tibia), jarret en arrière de delta."""
        l1, l2, l3 = self.hl
        a3 = self.ha(a3off)
        dh = d_ratio * (l1 + l2)
        J0 = self.j0(P, 'H' + s)
        hock_y = J0.y + dh * math.sin(delta)
        return dict(mode='ground', J3=(hock_y - l3 * math.cos(a3), self.z3h), a3=a3, toe=0.0, splay=splay)

    def hip_height(self, d_ratio, delta, a3off):
        l1, l2, l3 = self.hl
        a3 = self.ha(a3off)
        return self.z3h + l3 * math.sin(a3) + d_ratio * (l1 + l2) * math.cos(delta)

    def front_ground(self, P, s, d_ratio, delta, a3off):
        f1, f2, f3 = self.fl
        a3 = self.fa(a3off)
        df = d_ratio * (f1 + f2)
        J0 = self.j0(P, 'F' + s)
        wr_y = J0.y - df * math.sin(delta)
        return dict(mode='ground', J3=(wr_y - f3 * math.cos(a3), self.z3f), a3=a3, toe=0.0)

    def shoulder_height(self, d_ratio, delta, a3off):
        f1, f2, f3 = self.fl
        a3 = self.fa(a3off)
        return self.z3f + f3 * math.sin(a3) + d_ratio * (f1 + f2) * math.cos(delta)

    # ---- postures ------------------------------------------------------------------------------------------------
    def span(self):
        hl, sh = self.R.legs['HL']['J'][0], self.R.legs['FL']['J'][0]
        return abs(hl.y - sh.y)

    def front_auto(self, P, s, delta, a3off, dmax=0.95):
        """Antérieur posé sous l'épaule : la distance épaule-poignet suit la hauteur de l'épaule."""
        f1, f2, f3 = self.fl
        a3 = self.fa(a3off)
        J0 = self.j0(P, 'F' + s)
        wz = self.z3f + f3 * math.sin(a3)
        df = min(dmax * (f1 + f2), max(0.2 * (f1 + f2), (J0.z - wz) / max(0.2, math.cos(delta))))
        wr_y = J0.y - df * math.sin(delta)
        return dict(mode='ground', J3=(wr_y - f3 * math.cos(a3), self.z3f), a3=a3, toe=0.0)

    def posture(self, hip_z, alpha, flex, extra=None):
        """Corps posé : hanches à hip_z, ligne hanche-épaule inclinée de alpha (+ = épaules plus hautes)."""
        P = dict(flex=flex, ears=self.base_ears())
        P.update(extra or {})
        P = self.rab.fit_body(P, hip_z, hip_z + self.span() * math.tan(alpha))
        return P

    def make_crouch(self):
        o = self.o
        hip_z = self.hip_height(o['hind_d'], o['hind_delta'], o['hind_a3'])
        P = self.posture(hip_z, o['crouch_alpha'], o['flex'], dict(neck=o['neck'], head=o['head'], tail=o['tail']))
        P['legs'] = {}
        for s in 'LR':
            P['legs']['H' + s] = self.hind_ground(P, s, o['hind_d'], o['hind_delta'], o['hind_a3'])
            P['legs']['F' + s] = self.front_auto(P, s, o['front_delta'], o['front_a3'])
        print('CROUCH hip_z', round(hip_z, 4), 'pitch', round(P['pitch'], 3), 'dz', round(P['dz'], 4))
        return P

    def make_sit(self):
        o = self.o
        hip_z = self.hip_height(o['sit_hind_d'], o['sit_hind_delta'], 0.0)
        P = self.posture(hip_z, o['sit_alpha'], o['sit_flex'], dict(neck=0.05, head=0.0, tail=-0.2))
        P['head'] = -(P['pitch'] - self.crouch['pitch']) * o['sit_pitch_head'] + o.get('sit_head', 0.0)
        P['legs'] = {}
        for s in 'LR':
            P['legs']['H' + s] = self.hind_ground(P, s, o['sit_hind_d'], o['sit_hind_delta'], 0.0, splay=0.06)
            P['legs']['F' + s] = self.front_auto(P, s, -0.03, o['sit_front_a3'], 0.97)
        print('SIT pitch', round(P['pitch'], 3))
        return P

    def make_stand(self):
        o = self.o
        hip_z = self.hip_height(o['stand_hind_d'], o['stand_hind_delta'], 0.0)
        P = dict(flex=o['stand_flex'], neck=-0.1, head=0.0, tail=-0.3, ears=self.base_ears(), pitch=self.crouch['pitch'] + o['stand_pitch'])
        P = self.fit_hip_only(P, hip_z)
        P['head'] = -(o['stand_pitch'] - self.crouch['pitch']) * o['stand_head'] + 0.1
        P['legs'] = {}
        for s in 'LR':
            P['legs']['H' + s] = self.hind_ground(P, s, o['stand_hind_d'], o['stand_hind_delta'], 0.0, splay=0.05)
            P['legs']['F' + s] = self.front_tucked(P, s)
        return P

    def front_tucked(self, P, s, up=0.0):
        """Patte avant repliée contre la poitrine (corps dressé)."""
        f1, f2, f3 = self.fl
        J0 = self.j0(P, 'F' + s)
        L = f1 + f2
        return dict(mode='ground', J3=(J0.y - 0.40 * L, J0.z - 0.62 * L + up), a3=self.fa(0.0) + 1.5, toe=-0.9)

    # ---- petits mouvements ---------------------------------------------------------------------------------------
    def ear_swivel(self, t, k=1.0):
        bumpL = max(0.0, math.sin(TAU * (t - 0.1))) ** 6
        bumpR = max(0.0, math.sin(TAU * (t - 0.55))) ** 6
        return {'earL': {'twist': 0.5 * k * bumpL}, 'earR': {'twist': 0.5 * k * bumpR}}

    def nose_twitch(self, P, t, n=8, amp=1.0):
        w = max(0.0, math.sin(TAU * n * t)) ** 2
        if self.has_nose:
            P['nose'] = P.get('nose', 0.0) + 0.12 * amp * w
        else:
            P['head'] = P.get('head', 0.0) + 0.012 * amp * w
        return P

    # ---- repos -----------------------------------------------------------------------------------------------------
    def idle(self):
        C = self.crouch

        def Pf(t):
            P = self.merge(C, dict(dz=0.0015 * math.sin(TAU * 4 * t), head_yaw=0.28 * math.sin(TAU * t),
                                   neck=0.03 * math.sin(TAU * 2 * t), tail_yaw=0.15 * math.sin(TAU * 3 * t)))
            P = self.merge(P, self.ear_swivel(t))
            return self.nose_twitch(P, t, 10, 0.8)
        self.bake('idle', Pf, 120)

    def sit(self):
        C = self.sitP

        def Pf(t):
            P = self.merge(C, dict(dz=0.0015 * math.sin(TAU * 3 * t), head_yaw=0.3 * math.sin(TAU * t + 0.4)))
            P = self.merge(P, self.ear_swivel(t))
            return self.nose_twitch(P, t, 8, 0.8)
        self.bake('sit', Pf, 90)

    def stand(self):
        C = self.standP

        def Pf(t):
            P = self.merge(C, dict(dz=0.0012 * math.sin(TAU * 3 * t), head_yaw=0.45 * math.sin(TAU * t)))
            P = self.merge(P, self.ear_swivel(t, 1.3))
            return self.nose_twitch(P, t, 9, 1.0)
        self.bake('stand', Pf, 90)

    # ---- allures -------------------------------------------------------------------------------------------------
    def gait(self, name, frames, stride, tl, body, sw):
        """tl : {lab: (début d'appui, durée d'appui, centre d'appui en fraction de l'excursion)}.
        sw : {kind: dict(lift, hold (fraction du soutien où la patte reste en arrière), trail, a3 (écarts : posé,
        décollé, replié), toe (doigts en soutien), roll)}. body(u) -> écarts de corps ajoutés à l'accroupi."""
        C = self.crouch
        T = frames / FPS
        v = stride / T
        neutral = {lab: C['legs'][lab]['J3'][0] for lab in C['legs']}

        def foot(lab, u):
            st, D, c = tl[lab]
            kind = lab[0]
            g = sw[kind]
            ph = (u - st) % 1.0
            e = v * D * T
            ny = neutral[lab] + c * e
            z0 = self.z3h if kind == 'H' else self.z3f
            flat = self.hflat if kind == 'H' else self.fflat
            a_td, a_lo, a_sw = (flat + x for x in g['a3'])
            if ph < D:
                w = ph / D
                y = ny - e / 2 + e * w
                r = g.get('roll', 0.3)
                a3 = a_td + (a_lo - a_td) * dg.smooth((w - r) / (1 - r))
                return dict(mode='ground', J3=(y, z0), a3=a3, toe=0.0)
            w = (ph - D) / (1 - D)
            hold = g.get('hold', 0.0)
            wy = dg.smooth((w - hold) / (1 - hold)) if w > hold else 0.0
            trail = g.get('trail', 0.0) * math.sin(math.pi * w / hold) if (hold > 0 and w < hold) else 0.0
            y = ny + e / 2 - e * wy + trail
            sk = g.get('skew', 0.0)  # (lever rapide : un pied ramené en avant ne traîne pas au ras du sol)
            z = z0 + g['lift'] * math.sin(math.pi * min(1.0, w * (1 + sk) / (1 + sk * w)))
            # (pied remis à plat avant de toucher le sol : il se pose d'un coup, sans glisser en se dépliant)
            a3 = a_lo + (a_sw - a_lo) * math.sin(math.pi * min(1.0, w * 1.25)) + (a_td - a_lo) * dg.smooth((w - 0.5) / 0.32)
            toe = g.get('toe', -0.6) * math.sin(math.pi * w)
            return dict(mode='ground', J3=(y, z), a3=a3, toe=toe)

        def Pf(u):
            P = self.merge(C, body(u))
            P['legs'] = {lab: foot(lab, u) for lab in C['legs']}
            return P
        self.bake(name, Pf, frames, ground='lift')
        self.speeds[name] = round(v, 3)

    def hop(self):
        """Sautillement lent : antérieurs posés l'un après l'autre, postérieurs ramenés ensemble près d'eux."""
        o = self.o
        S = o['hop_stride'] * BL
        tl = {'FL': (0.00, 0.46, 0.15), 'FR': (0.08, 0.46, 0.15), 'HL': (0.50, 0.40, -0.55), 'HR': (0.52, 0.40, -0.55)}

        def body(u):
            q = (u - 0.88) % 1.0
            up = math.sin(math.pi * q / 0.62) if q < 0.62 else 0.0
            return dict(dz=0.012 * up, pitch=0.08 * math.sin(TAU * (u - 0.66)), flex=0.14 * math.cos(TAU * (u - 0.52)),
                        head=-0.06 * math.sin(TAU * (u - 0.66)), tail=0.15, ears={'back': 0.1})
        self.gait('hop', o['hop_frames'], S, tl, body, {
            'H': dict(lift=o['hop_lift'] * BL * 1.5, hold=0.15, a3=(0.0, 0.9, 0.45), toe=-0.5, roll=0.35, skew=1.2),
            'F': dict(lift=o['hop_lift'] * BL * 0.9, hold=0.0, a3=(0.0, -0.15, 1.3), toe=-0.9, roll=0.5, skew=0.6)})

    def lope(self):
        """Petit galop (vitesse de promenade du jeu) : bonds plus longs que le sautillement, postérieurs posés à
        hauteur des antérieurs, dos qui s'allonge et se ramasse."""
        o = self.o
        S = o['lope_stride'] * BL
        tl = {'FL': (0.00, 0.30, 0.25), 'FR': (0.07, 0.30, 0.25), 'HL': (0.46, 0.30, -0.35), 'HR': (0.49, 0.30, -0.35)}

        def body(u):
            q = (u - 0.82) % 1.0
            up = math.sin(math.pi * q / 0.6) if q < 0.6 else 0.0
            # (tête un peu relevée : le museau, déjà près du sol accroupi, y touchait quand l'avant plonge)
            return dict(dz=0.018 * up, pitch=0.07 * math.sin(TAU * (u - 0.62)), flex=0.22 * math.cos(TAU * (u - 0.5)),
                        head=0.10 - 0.05 * math.sin(TAU * (u - 0.62)), neck=0.06, tail=0.2, ears={'back': 0.3})
        self.gait('lope', o['lope_frames'], S, tl, body, {
            'H': dict(lift=o['lope_lift'] * BL, hold=0.2, trail=0.04 * BL, a3=(0.05, 1.1, 0.5), toe=-0.55, roll=0.3, skew=1.0),
            'F': dict(lift=o['lope_lift'] * BL * 0.85, hold=0.1, trail=0.0, a3=(0.05, -0.15, 1.45), toe=-0.95, roll=0.45, skew=0.6)})

    def run(self):
        """Course en bonds d'après le clip « Running » de CDmir (CC0, gabarit relevé dans templates/template_run.json) :
        temps d'appui de chaque patte, hauteurs des hanches et des épaules, flexion du dos, encolure, tête, trajectoire
        des pieds en l'air et angles des métapodes, rejoués à la taille de ce modèle. Les pieds posés reculent tous à la
        même vitesse (dans le clip d'origine, les antérieurs posés allaient 1,7 fois plus vite que les postérieurs :
        ils patinaient), en ligne droite ; leur temps d'appui est allongé au besoin (antérieurs : 2 images sur 20)."""
        o = self.o
        R = self.R
        lc = R.cfg['legs']
        tpl = json.load(open(os.path.join(TEMPLATES, 'template_run.json')))
        fr = tpl['frames']
        n0 = len(fr)
        N = o['run_frames']
        T = N / FPS
        ratio = {lab: sum(R.legs[lab]['l2d'][:3]) / tpl['len'][lab] for lab in R.legs}
        flat_t = {'H': self.hflat, 'F': self.fflat}
        C = self.crouch

        def tget(u, fn):
            x = (u % 1.0) * n0
            i = int(x) % n0
            f = x - int(x)
            a, b = fn(fr[i]), fn(fr[(i + 1) % n0])
            return a + (b - a) * f

        # appuis du gabarit (articulation métapode-doigts au plus bas) : début et durée, allongés au besoin
        stance = {}
        min_d = {'H': 0.30, 'F': 0.22}
        for lab in R.legs:
            zs = [f['legs'][lab][3][1] for f in fr]
            zmin = min(zs)
            on = [z < zmin + 0.006 for z in zs]
            # (une image un peu plus haute au milieu d'un appui ne le coupe pas en deux : postérieurs de 18 à 3)
            on = [on[k] or (on[k - 1] and on[(k + 1) % n0]) for k in range(n0)]
            best = (0, 0)
            for k in range(n0):
                if on[k] and not on[k - 1]:
                    c = 0
                    while on[(k + c) % n0] and c < n0:
                        c += 1
                    best = max(best, (c, k), key=lambda x: x[0])
            cnt, k0 = best
            D0 = cnt / n0
            D = max(D0, min_d[lab[0]])
            stance[lab] = ((k0 / n0 - (D - D0) / 2) % 1.0, D)
        # vitesse commune : celle des postérieurs du gabarit, à la taille de ce modèle et à sa cadence
        sp = []
        for lab in ('HL', 'HR'):
            st, D = stance[lab]
            k0 = int(round(st * n0))
            for k in range(int(D * n0) - 1):
                a, b = fr[(k0 + k) % n0]['legs'][lab], fr[(k0 + k + 1) % n0]['legs'][lab]
                sp.append(((b[3][0] - b[0][0]) - (a[3][0] - a[0][0])) * ratio[lab] * n0 / T)
        sp.sort()
        v = sp[len(sp) // 2] if sp else 1.0

        # (tangage du corps : l'ANGLE de la ligne hanches-épaules du gabarit, pas l'écart de hauteur — sur le corps court du
        # bélier, le même écart le dressait presque à la verticale ; flexion du dos adoucie : 0,65 du gabarit)
        span_m = self.span()

        def body(u):
            hz = sum(lc[l]['c3'] + (tget(u, lambda f: f['legs'][l][0][1]) - tpl['c3'][l]) * ratio[l] for l in ('HL', 'HR')) / 2
            sz = sum(lc[l]['c3'] + (tget(u, lambda f: f['legs'][l][0][1]) - tpl['c3'][l]) * ratio[l] for l in ('FL', 'FR')) / 2
            ht = tget(u, lambda f: (f['legs']['HL'][0][1] + f['legs']['HR'][0][1]) / 2)
            st = tget(u, lambda f: (f['legs']['FL'][0][1] + f['legs']['FR'][0][1]) / 2)
            span_t = max(0.03, tget(u, lambda f: abs(f['legs']['HL'][0][0] - f['legs']['FL'][0][0])))
            ang = math.atan2(ht - st, span_t) * 0.85
            mid = (hz + sz) / 2
            hz = mid + 0.5 * span_m * math.tan(ang)
            sz = mid - 0.5 * span_m * math.tan(ang)
            P = dict(flex=0.65 * tget(u, lambda f: f['flex']), neck=0.7 * tget(u, lambda f: f['neck']), head=0.7 * tget(u, lambda f: f['head']),
                     ears=dict(self.base_ears(), back=0.7), tail=0.3, pitch=C['pitch'], dz=C['dz'])
            return self.rab.fit_body(P, hz, sz, iters=8)

        # positions des pieds du gabarit dans le repère de ce modèle (relatives à l'épaule ou à la hanche posée)
        NS = 48
        bodies = [body(k / NS) for k in range(NS)]
        J0s = {lab: [self.j0(bodies[k], lab) for k in range(NS)] for lab in R.legs}

        def j0_at(lab, u):
            x = (u % 1.0) * NS
            i = int(x) % NS
            f = x - int(x)
            return J0s[lab][i].lerp(J0s[lab][(i + 1) % NS], f)

        def tpl_foot(lab, u):
            rel = tget(u, lambda f: f['legs'][lab][3][0] - f['legs'][lab][0][0]) * ratio[lab]
            z = lc[lab]['c3'] + (tget(u, lambda f: f['legs'][lab][3][1]) - tpl['c3'][lab]) * ratio[lab]
            return j0_at(lab, u).y + rel, max(z, lc[lab]['c3'])

        def tpl_angles(lab, u):
            def a3f(f):
                J = f['legs'][lab]
                return math.atan2(J[2][1] - J[3][1], J[2][0] - J[3][0])

            def toef(f):
                J = f['legs'][lab]
                return math.atan2(J[4][1] - J[3][1], J[4][0] - J[3][0])
            a3 = tget(u, a3f) - tpl['flat'][lab[0]] + flat_t[lab[0]]
            toe = RA.wrap(tget(u, toef) - tpl['toe_rest'][lab])
            return a3, toe

        feet = {}
        for lab in R.legs:
            st, D = stance[lab]
            e = v * D * T
            yc = sum(tpl_foot(lab, st + D * k / 8)[0] for k in range(9)) / 9
            feet[lab] = (st, D, e, yc)

        def foot(lab, u):
            st, D, e, yc = feet[lab]
            ph = (u - st) % 1.0
            a3, toe = tpl_angles(lab, u)
            z0 = lc[lab]['c3']
            if ph < D:
                w = ph / D
                return dict(mode='ground', J3=(yc - e / 2 + e * w, z0), a3=a3, toe=0.0)
            # en l'air : trajectoire du gabarit, recalée pour partir du lever et arriver au poser suivant
            w = (ph - D) / (1 - D)
            y_t, z_t = tpl_foot(lab, u)
            y_lo, _ = tpl_foot(lab, st + D)
            y_td, _ = tpl_foot(lab, st + 1.0)
            k = dg.smooth(w)
            y = y_t + ((yc + e / 2) - y_lo) * (1 - k) + ((yc - e / 2) - y_td) * k
            z = max(z_t, z0) + 0.004 * math.sin(math.pi * w)
            return dict(mode='ground', J3=(y, z), a3=a3, toe=toe)

        def Pf(u):
            P = body(u)
            P['legs'] = {lab: foot(lab, u) for lab in R.legs}
            return P
        self.bake('run', Pf, N, ground='lift')
        self.speeds['run'] = round(v, 3)
        print('RUN appuis', {k: (round(a, 3), round(b, 3)) for k, (a, b) in stance.items()}, 'vitesse', round(v, 3))

    def hide(self):
        """Tapi (peur, se cacher) : corps aplati contre le sol, tête basse en avant, oreilles plaquées sur le dos."""
        o = self.o
        dh = o['hind_d'] * 0.82
        hip_z = self.hip_height(dh, o['hind_delta'] + 0.15, o['hind_a3'])
        P = self.posture(hip_z, o['crouch_alpha'] - 0.06, o['flex'] + 0.12, dict(neck=-0.3, head=-0.12, tail=-0.15))
        P['ears'] = dict(self.base_ears(), back=o['hide_ears'])
        P['legs'] = {}
        for s in 'LR':
            P['legs']['H' + s] = self.hind_ground(P, s, dh, o['hind_delta'] + 0.15, o['hind_a3'])
            P['legs']['F' + s] = self.front_auto(P, s, o['front_delta'] - 0.15, o['front_a3'] - 0.1, 0.8)
        C = P

        def Pf(t):
            Q = self.merge(C, dict(dz=0.0008 * math.sin(TAU * 6 * t), head_yaw=0.06 * math.sin(TAU * t)))
            return self.nose_twitch(Q, t, 14, 0.6)
        self.bake('hide', Pf, 60, ground='lift')

    def held(self):
        """Porté dans les bras : corps soutenu, postérieurs repliés sous le ventre, antérieurs qui pendent un peu en
        avant, tête relevée, oreilles un peu en arrière (le jeu ne le pose pas au sol)."""
        C = self.crouch
        P = dict(C, pitch=C['pitch'] + 0.12, flex=0.28, neck=0.05, head=0.08, tail=0.05, dz=C['dz'] + 0.05,
                 ears=dict(self.base_ears(), back=0.35))
        Lh = sum(self.hl[:2])
        Lf = sum(self.fl[:2])
        legs = {}
        for s in 'LR':
            J0 = self.j0(P, 'H' + s)
            legs['H' + s] = dict(mode='ground', hang=True, J3=(J0.y - 0.55 * Lh, J0.z - 0.55 * Lh), a3=self.ha(0.9), toe=-0.4)
            J0 = self.j0(P, 'F' + s)
            legs['F' + s] = dict(mode='ground', hang=True, J3=(J0.y - 0.30 * Lf, J0.z - 0.80 * Lf), a3=self.fa(0.9), toe=-0.5, bend=1)
        P['legs'] = legs

        def Pf(t):
            Q = self.merge(P, dict(head_yaw=0.15 * math.sin(TAU * t), neck=0.02 * math.sin(TAU * 2 * t)))
            return self.nose_twitch(Q, t, 9, 0.8)
        self.bake('held', Pf, 60, ground=None)

    # ---- couché ----------------------------------------------------------------------------------------------------
    def lie_pose(self):
        o = self.o
        C = self.crouch
        hip_z = 0.62 * self.hipmid(C).z
        P = self.posture(hip_z, o['lie_alpha'], o['lie_flex'], dict(neck=o['lie_neck'], head=o['lie_head'], tail=-0.1))
        P['ears'] = dict(self.base_ears(), back=o['lie_ears'])
        legs = {}
        Lh = sum(self.hl)
        Lf = sum(self.fl)
        for s in 'LR':
            J0 = self.j0(P, 'H' + s)
            legs['H' + s] = dict(mode='ground', J3=(J0.y + o['lie_hind_back'] * Lh, self.z3h + 0.004), a3=math.pi - 0.2,
                                 toe_abs=0.15, splay=0.22, bend=-1)
            J0 = self.j0(P, 'F' + s)
            legs['F' + s] = dict(mode='ground', J3=(J0.y - o['lie_front_fwd'] * Lf, self.z3f), a3=self.fa(0.0), toe=0.0, bend=1)
        P['legs'] = legs
        return P

    def lie(self):
        C = self.lie_pose()

        def Pf(t):
            P = self.merge(C, dict(dz=0.0012 * math.sin(TAU * 3 * t), head_yaw=0.12 * math.sin(TAU * t)))
            return self.nose_twitch(P, t, 4, 0.5)
        self.bake('lie', Pf, 120, ground='rest')

    def sleep_pose(self):
        o = self.o
        C = self.crouch
        hip_z = 0.80 * self.hipmid(C).z
        P = self.posture(hip_z, o['sleep_alpha'], 0.28, dict(neck=-0.2, head=-0.05, tail=-0.2))
        P['ears'] = dict(self.base_ears(), back=o['sleep_ears'])
        legs = {}
        f1, f2, f3 = self.fl
        for s in 'LR':
            J0 = self.j0(P, 'F' + s)
            legs['F' + s] = dict(mode='ground', J3=(J0.y + 0.10 * (f1 + f2), self.z3f), a3=self.fa(0.0), toe=0.0, bend=1)
            legs['H' + s] = self.hind_ground(P, s, 0.75 * o['hind_d'], o['hind_delta'] + 0.3, 0.0)
        P['legs'] = legs
        return P

    def sleep(self):
        C = self.sleep_pose()

        def Pf(t):
            return self.merge(C, dict(dz=0.0015 * math.sin(TAU * 2 * t), flex=0.01 * math.sin(TAU * 2 * t)))
        self.bake('sleep', Pf, 120, ground='rest')

    # ---- gestes ----------------------------------------------------------------------------------------------------
    def muzzle_at(self, P):
        pose, _ = self.rab.build(dict(P, legs={}))
        R = self.R
        pts = [pose[b] @ R.rest[b].inverted() @ p for b, p in self.ctx['mz_pts']]
        return sum(pts, Vector()) / len(pts), min(p.z for p in pts)

    def head_down(self, C, target_z, pitch_max=0.6):
        """Cherche tangage du corps, cou et tête pour poser le museau à target_z (au-dessus du sol)."""
        best = None
        for k in range(0, 7):
            pt = -pitch_max * k / 6
            for i in range(0, 13):
                nk = -1.2 * i / 12
                for j in range(0, 9):
                    hd = -0.9 * j / 8
                    P = dict(C, pitch=C['pitch'] + pt, neck=C.get('neck', 0) + nk, head=C.get('head', 0) + hd)
                    _, z = self.muzzle_at(P)
                    cost = abs(z - target_z) * 10 + 0.015 * abs(nk) + 0.03 * abs(hd) + 0.05 * abs(pt)
                    if best is None or cost < best[0]:
                        best = (cost, pt, nk, hd, z)
        print('HEAD DOWN', target_z, [round(x, 3) for x in best])
        return best[1], best[2], best[3]

    def lowered(self, target_z):
        """Accroupi, tête au sol : le corps bascule vers l'avant, les antérieurs se replacent."""
        o = self.o
        C = dict(self.crouch)
        pt, nk, hd = self.head_down(C, target_z)
        C = dict(C, pitch=C['pitch'] + pt, neck=C['neck'] + nk, head=C['head'] + hd)
        legs = {}
        for s in 'LR':
            legs['H' + s] = self.hind_ground(C, s, o['hind_d'], o['hind_delta'], o['hind_a3'])
            f1, f2, f3 = self.fl
            J0 = self.j0(C, 'F' + s)
            a3 = self.fa(o['front_a3'])
            dz = J0.z - (self.z3f + f3 * math.sin(a3))
            dmax = 0.92 * (f1 + f2)
            dy = math.sqrt(max(0.0, dmax * dmax - dz * dz)) if dz < dmax else 0.0
            legs['F' + s] = dict(mode='ground', J3=(J0.y - 0.5 * dy - f3 * math.cos(a3), self.z3f), a3=a3, toe=0.0)
        C['legs'] = legs
        return C

    def sniff(self):
        C = self.lowered(0.012)
        legs = dict(C['legs'])
        y, z = legs['FL']['J3']
        legs['FL'] = dict(legs['FL'], J3=(y - 0.03 * BL, z))
        C = dict(C, legs=legs, ears=dict(self.base_ears(), back=-0.15))

        def Pf(t):
            P = self.merge(C, dict(head_yaw=0.22 * math.sin(TAU * t), neck_yaw=0.15 * math.sin(TAU * t + 0.5),
                                   head=0.04 * math.sin(TAU * 2 * t), tail_yaw=0.1 * math.sin(TAU * 3 * t)))
            P = self.merge(P, self.ear_swivel(t, 0.8))
            return self.nose_twitch(P, t, 12, 1.4)
        self.bake('sniff', Pf, 90)

    def eat(self):
        C = self.lowered(0.004)
        C = dict(C, ears=dict(self.base_ears(), back=0.25))

        def Pf(t):
            chew = math.sin(TAU * 12 * t)
            P = self.merge(C, dict(head=0.025 * chew, head_roll=0.02 * chew, dz=0.001 * math.sin(TAU * 3 * t)))
            if self.M.get('jaw'):
                P['jaw'] = 0.08 * (0.5 + 0.5 * chew)
            return self.nose_twitch(P, t, 6, 0.6)
        self.bake('eat', Pf, 90)

    def groom(self):
        """Assis, les deux pattes au museau (frottements), puis une oreille rabattue et lissée."""
        S0 = dict(self.sitP)
        S0 = dict(S0, pitch=S0['pitch'] + 0.25)
        S0 = self.fit_hip_only(S0, self.hipmid(self.sitP).z)
        base_head = S0['head']

        def Pf(t):
            P = dict(S0)
            if t < 0.5:  # museau
                w = t / 0.5
                rub = math.sin(TAU * 5 * w)
                P['head'] = base_head - 0.45 + 0.08 * rub
                P['neck'] = S0['neck'] - 0.15
                P['ears'] = dict(self.base_ears(), back=0.25)
                side = 0.0
            else:  # oreille gauche rabattue, tête inclinée
                w = (t - 0.5) / 0.5
                env = dg.smooth(w / 0.15) * (1 - dg.smooth((w - 0.85) / 0.15))
                rub = math.sin(TAU * 4 * w)
                P['head'] = base_head - 0.35 * env - 0.45 * (1 - env)
                P['head_roll'] = 0.45 * env
                P['head_yaw'] = 0.2 * env
                P['neck'] = S0['neck'] - 0.15
                P['earL'] = {'back': -0.9 * env + 0.25 * (1 - env), 'out': 0.5 * env + 0.15 * rub * env}
                P['earR'] = {'back': 0.25}
                side = env
            f1, f2, f3 = self.fl
            reach = 0.93 * dg.REACH
            a3g = self.fa(0.0) + 1.9
            for _ in range(10):  # pattes courtes : la tête descend vers les pattes (poignet visé à portée, rien ne s'étire)
                mz, _ = self.muzzle_at(P)
                tg = mz + Vector((0, 0.035 * BL, -0.03 * BL))
                want, _, _ = self.R.reach_target('FL', self.j0(P, 'FL'), tg, a3g)
                if want <= reach:
                    break
                P['head'] -= 0.08
                P['neck'] -= 0.06
            legs = dict(P['legs'])
            for s in 'LR':
                J0 = self.j0(P, 'F' + s)
                tgt = mz + Vector((0, 0.035 * BL, -0.03 * BL))
                if s == 'L' and side > 0:
                    tgt = tgt + Vector((0, 0.06 * BL, 0.10 * BL)) * side
                tgt = tgt + Vector((0, 0, 0.012 * BL * math.sin(TAU * 10 * t)))
                legs['F' + s] = dict(mode='ground', hang=True, J3=(tgt.y, tgt.z), a3=a3g, toe=-0.6)
            P['legs'] = legs
            return P
        self.bake('groom', Pf, 120)

    def binky(self):
        o = self.o
        C = self.crouch
        H = o['binky_height']

        def Pf(t):
            P = dict(C)
            legs = dict(C['legs'])
            if t < 0.18:  # tassement
                w = dg.smooth(t / 0.18)
                P = self.merge(P, dict(dz=-0.010 * w, flex=0.12 * w, pitch=-0.05 * w))
            elif t < 0.28:  # détente
                w = (t - 0.18) / 0.10
                P = self.merge(P, dict(dz=-0.010 + 0.038 * w, flex=0.12 - 0.3 * w, pitch=-0.05 + 0.25 * w))
                for s in 'LR':  # les antérieurs quittent le sol, les postérieurs poussent
                    y, z = legs['F' + s]['J3']
                    legs['F' + s] = dict(legs['F' + s], J3=(y, z + 0.03 * w), a3=self.fa(0.6 * w), toe=-0.6 * w)
                    legs['H' + s] = dict(legs['H' + s], a3=self.ha(1.0 * w))
            elif t < 0.82:  # en l'air : torsion, ruade, secousse de tête
                w = (t - 0.28) / 0.54
                arc = math.sin(math.pi * w)
                tw = math.sin(math.pi * w) * math.sin(TAU * w * 1.0 + 0.3)
                P = self.merge(P, dict(dz=0.028 + H * arc, flex=-0.18 * arc + 0.1 * (1 - arc), pitch=0.2 * (1 - w) - 0.1 * w,
                                       flex_yaw=0.55 * tw, roll=0.35 * tw, yaw=0.25 * tw, head_roll=-0.5 * tw,
                                       head_yaw=-0.3 * tw, tail=0.4, ears={'back': 0.2, 'out': 0.35 * arc}))
                for s in 'LR':
                    legs['H' + s] = dict(mode='body', a3=self.R.legs['H' + s]['a3_rest'] + 0.3 * arc, toe=-0.3, splay=0.45 * arc)
                    legs['F' + s] = dict(mode='body', a3=self.R.legs['F' + s]['a3_rest'] + 0.8, toe=-0.6)
            else:  # réception
                w = dg.smooth((t - 0.82) / 0.18)
                P = self.merge(P, dict(dz=0.028 * (1 - w), flex=0.1 * (1 - w), pitch=-0.1 * (1 - w)))
            P['legs'] = legs
            return P
        self.bake('binky', Pf, 30, cyclic=False)

    # ---- transitions ---------------------------------------------------------------------------------------------
    def pose_of(self, name, P=None, ground='lift'):
        ctx = self.ctx
        if name in ctx['kept']:
            arm = ctx['arm']
            act = bpy.data.actions[name]
            arm.animation_data.action = act
            bpy.context.scene.frame_set(int(act.frame_range[0]))
            bpy.context.view_layer.update()
            pose = {pb.name: pb.matrix.copy() for pb in arm.pose.bones}
            arm.animation_data.action = None
            ctx['K'].clear_anim(arm)
            pose['__body__'] = Matrix.Identity(4)
            return pose
        return self.rab.pose_fn(lambda t: P, ground)(0.0)[0]

    def transitions(self):
        crouch = self.pose_of('idle_pose', self.crouch)
        sitp = self.pose_of('sit', self.sitP)
        standp = self.pose_of('stand', self.standP)
        liep = self.pose_of('lie_pose', self.lie_pose(), 'rest')
        rab = self.rab

        R = self.R
        def local_blend(pa, pb, u):
            ba, bb = R.to_basis(pa), R.to_basis(pb)
            out = {'__body__': pa['__body__']}
            for name in R.order:
                la, qa, _ = ba[name].decompose()
                lb, qb, _ = bb[name].decompose()
                if qa.dot(qb) < 0:
                    qb = -qb
                B = qa.slerp(qb, u).to_matrix().to_4x4()
                B.translation = la.lerp(lb, u)
                b = R.bones[name]
                if b.parent is None:
                    out[name] = R.rest[name] @ B
                else:
                    p = b.parent.name
                    out[name] = out[p] @ R.rest[p].inverted() @ R.rest[name] @ B
            return out

        def trans(name, pa, pb, frames):
            def f(t):
                pose = local_blend(pa, pb, dg.smooth(t))
                z = rab.lowest(pose)
                if z < 0:  # on relève tout le lapin si la peau passe sous le sol pendant le mélange
                    T = Matrix.Translation((0, 0, -z))
                    pose = {k: (T @ m if k != '__body__' else m) for k, m in pose.items()}
                return pose, {}
            dg.bake(self.R, name, None, frames, cyclic=False, pose_fn=f)
        trans('sit_down', crouch, sitp, 18)
        trans('stand_up', sitp, crouch, 15)
        trans('rear_up', sitp, standp, 18)
        trans('rear_down', standp, sitp, 18)
        trans('lie_down', crouch, liep, 24)
        trans('get_up', liep, crouch, 21)


# ---- gabarits : allures d'artiste (lapin de CDmir) relevées en trajectoires de pieds, puis rejouées par IK ------
def leg_points(R, pose, lab):
    """Articulations J0..J4 posées (espace armature) d'un membre, depuis les matrices des os."""
    L = R.legs[lab]
    by_seg = {}
    for n, k in L['drive']:
        by_seg.setdefault(k, n)
    def carried(k):
        while k not in by_seg:
            k -= 1
        n = by_seg[k]
        return pose[n] @ R.rest[n].inverted()
    J = L['J']
    out = [carried(0) @ J[0], carried(0) @ J[1], carried(1) @ J[2], carried(2) @ J[3], carried(3) @ J[4]]
    return out


def bone_angle(R, pose, name):
    M = pose[name] if pose else R.rest[name]
    d = M.to_3x3() @ Vector((0, 1, 0))
    return math.atan2(d.z, d.y)


def chain_delta(R, pose, child, parent):
    a = bone_angle(R, pose, child) - bone_angle(R, pose, parent)
    b = bone_angle(R, None, child) - bone_angle(R, None, parent)
    return RA.wrap(a - b)


def export_template(ctx, name):
    """Relève un clip d'origine : par image, articulations des 4 membres, hauteurs, flexion, cou, tête."""
    arm = ctx['arm']
    rab = ctx['rab']
    R = rab.rig
    M = ctx['M']
    act = bpy.data.actions[name]
    f0, f1 = int(act.frame_range[0]), int(round(act.frame_range[1]))
    frames = []
    spine = [n for n, _ in M['spine']]
    pelvis = R.bones[spine[0]].parent.name if R.bones[spine[0]].parent else spine[0]
    chest = spine[-1]
    neck = M['neck'][0][0]
    head = M['head'][0]
    for f in range(f0, f1):
        arm.animation_data.action = act
        bpy.context.scene.frame_set(f)
        bpy.context.view_layer.update()
        pose = {pb.name: pb.matrix.copy() for pb in arm.pose.bones}
        fr = {'legs': {}}
        for lab in R.legs:
            J = leg_points(R, pose, lab)
            fr['legs'][lab] = [[p.y, p.z] for p in J]
        fr['flex'] = chain_delta(R, pose, chest, pelvis)
        fr['neck'] = -chain_delta(R, pose, neck, chest)
        fr['head'] = -chain_delta(R, pose, head, neck)
        frames.append(fr)
    arm.animation_data.action = None
    ctx['K'].clear_anim(arm)
    lc = R.cfg['legs']
    tpl = {'name': name, 'frames': frames, 'fps': FPS,
           'len': {lab: sum(R.legs[lab]['l2d'][:3]) for lab in R.legs},
           'c3': {lab: lc[lab]['c3'] for lab in R.legs},
           'flat': {'H': ctx['clips'].hflat, 'F': ctx['clips'].fflat},
           'toe_rest': {lab: R.legs[lab]['toe_rest'] for lab in R.legs}}
    return tpl


def stance_speed(tpl, lab):
    """Vitesse de recul d'un pied posé (articulation J3 au plus bas) dans le gabarit."""
    zs = [fr['legs'][lab][3][1] for fr in tpl['frames']]
    zmin = min(zs)
    sp = []
    n = len(tpl['frames'])
    for i in range(n):
        a, b = tpl['frames'][i]['legs'][lab][3], tpl['frames'][(i + 1) % n]['legs'][lab][3]
        if a[1] < zmin + 0.004 and b[1] < zmin + 0.004:
            sp.append((b[0] - a[0]) * tpl['fps'])
    sp.sort()
    return sp[len(sp) // 2] if sp else 0.0


def retarget(G, tpl, out_name, cyclic=True, ears=None, extra=None):
    """Rejoue un gabarit sur ce modèle : hauteurs et pas mis à l'échelle des membres, angles relatifs."""
    R = G.R
    lc = R.cfg['legs']
    frames = tpl['frames']
    n = len(frames)
    ratio = {lab: sum(R.legs[lab]['l2d'][:3]) / tpl['len'][lab] for lab in R.legs}
    flat_t = {'H': G.hflat, 'F': G.fflat}
    C = G.crouch

    def Pf(t):
        x = t * n
        i = int(x) % n
        u = x - int(x)
        A, B = frames[i], frames[(i + 1) % n] if cyclic else frames[min(i + 1, n - 1)]
        lerp = lambda a, b: a + (b - a) * u
        hipz = sum(lc[l]['c3'] + (lerp(A['legs'][l][0][1], B['legs'][l][0][1]) - tpl['c3'][l]) * ratio[l] for l in ('HL', 'HR')) / 2
        shz = sum(lc[l]['c3'] + (lerp(A['legs'][l][0][1], B['legs'][l][0][1]) - tpl['c3'][l]) * ratio[l] for l in ('FL', 'FR')) / 2
        # (tangage : l'angle du gabarit sur l'écart hanches-épaules de ce modèle ; flexion adoucie, voir run)
        ht = sum(lerp(A['legs'][l][0][1], B['legs'][l][0][1]) for l in ('HL', 'HR')) / 2
        st = sum(lerp(A['legs'][l][0][1], B['legs'][l][0][1]) for l in ('FL', 'FR')) / 2
        span_t = max(0.03, abs(lerp(A['legs']['HL'][0][0], B['legs']['HL'][0][0]) - lerp(A['legs']['FL'][0][0], B['legs']['FL'][0][0])))
        ang = math.atan2(ht - st, span_t) * 0.85
        mid = (hipz + shz) / 2
        hipz = mid + 0.5 * G.span() * math.tan(ang)
        shz = mid - 0.5 * G.span() * math.tan(ang)
        P = dict(flex=0.75 * lerp(A['flex'], B['flex']), neck=0.75 * lerp(A['neck'], B['neck']), head=0.75 * lerp(A['head'], B['head']),
                 ears=dict(G.base_ears(), **(ears or {})), tail=0.2, pitch=C['pitch'], dz=C['dz'])
        if extra:
            P.update(extra(t))
        P = G.rab.fit_body(P, hipz, shz, iters=8)
        legs = {}
        for lab in R.legs:
            ja = [Vector((0, *p)) for p in A['legs'][lab]]
            jb = [Vector((0, *p)) for p in B['legs'][lab]]
            J = [a.lerp(b, u) for a, b in zip(ja, jb)]
            J0t = G.j0(P, lab)
            y3 = J0t.y + (J[3].y - J[0].y) * ratio[lab]
            z3 = lc[lab]['c3'] + (J[3].z - tpl['c3'][lab]) * ratio[lab]
            a3 = math.atan2(J[2].z - J[3].z, J[2].y - J[3].y) - tpl['flat'][lab[0]] + flat_t[lab[0]]
            toe = RA.wrap(math.atan2(J[4].z - J[3].z, J[4].y - J[3].y) - tpl['toe_rest'][lab]) if (J[4] - J[3]).length > 1e-5 else 0.0
            legs[lab] = dict(mode='ground', J3=(y3, max(z3, lc[lab]['c3'] * 0.9)), a3=a3, toe=toe)
        P['legs'] = legs
        return P
    G.bake(out_name, Pf, n, cyclic=cyclic, ground='lift')
    v = stance_speed(tpl, 'HL') * ratio['HL']
    if v > 0 and out_name == 'run':  # (le saut n'a pas de vitesse naturelle d'allure)
        G.speeds[out_name] = round(v, 3)
