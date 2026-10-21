# Cornes de bélier en option (Blender 4.2) : spirale logarithmique qui part de la nuque, passe derrière l'oreille,
# s'enroule vers le bas puis l'avant et s'écarte de la tête (bélier mérinos, nez noir du Valais, islandais), section
# qui s'amincit jusqu'à la pointe, anneaux de croissance en relief. Un seul maillage (cornes gauche et droite), rattaché
# à l'os de la tête (nœud enfant de l'os dans le GLB : le jeu l'affiche ou le cache, et le met à l'échelle à son gré).
# UV : u le long de la corne (0 à la base, 1 à la pointe), v autour.
import bpy, bmesh, math
from mathutils import Vector, Matrix


def horn_curve(base, side, r0, turns=1.55, shrink=0.42, alpha=-0.45, spread=0.9, tilt=0.35, n=44):
    """Points de l'axe d'une corne. side = +1 (gauche, +X) ou -1. Repère : avant -Y, haut +Z."""
    u = Vector((0, 1, 0))   # vers l'arrière
    v = Vector((0, 0, 1))   # vers le haut
    w = Vector((side, 0, 0))  # vers l'extérieur
    th_max = turns * math.tau
    k = -math.log(shrink) / th_max
    # plan de la spirale incliné vers l'extérieur (tilt) : la corne s'écarte de la joue en s'enroulant
    R = Matrix.Rotation(side * -tilt, 3, Vector((0, 1, 0)))
    uu, vv = R @ u, R @ v
    C = base - r0 * (math.sin(alpha) * uu + math.cos(alpha) * vv)
    pts = []
    for i in range(n + 1):
        s = i / n
        th = th_max * s
        r = r0 * math.exp(-k * th)
        p = C + r * (math.sin(th + alpha) * uu + math.cos(th + alpha) * vv) + w * (spread * r0 * s ** 1.2)
        pts.append(p)
    return pts


def tube(bm, pts, radii, segs=10, flat=0.82, uv_layer=None):
    """Tube le long de pts (repères transportés), section légèrement aplatie (carène de la corne de bélier)."""
    n = len(pts)
    T = [(pts[min(n - 1, i + 1)] - pts[max(0, i - 1)]).normalized() for i in range(n)]
    ref = Vector((0, 0, 1)) if abs(T[0].z) < 0.9 else Vector((1, 0, 0))
    N = (ref - T[0] * ref.dot(T[0])).normalized()
    rings = []
    for i in range(n):
        if i:
            N = (N - T[i] * N.dot(T[i])).normalized()
        Bn = T[i].cross(N)
        ring = []
        for j in range(segs):
            a = math.tau * j / segs
            off = N * (math.cos(a) * radii[i] * flat) + Bn * (math.sin(a) * radii[i])
            ring.append(bm.verts.new(pts[i] + off))
        rings.append(ring)
    faces = []
    for i in range(n - 1):
        for j in range(segs):
            a, b = rings[i][j], rings[i][(j + 1) % segs]
            c, d = rings[i + 1][(j + 1) % segs], rings[i + 1][j]
            f = bm.faces.new((a, b, c, d))
            faces.append((f, i, j))
    tip = bm.verts.new(pts[-1] + T[-1] * radii[-1] * 2.0)
    for j in range(segs):
        f = bm.faces.new((rings[-1][j], rings[-1][(j + 1) % segs], tip))
        faces.append((f, n - 1, j))
    cap = bm.faces.new(list(reversed(rings[0])))
    if uv_layer is not None:
        ij = {}
        for i, ring in enumerate(rings):
            for j, vt in enumerate(ring):
                ij[vt] = (i, j)
        ij[tip] = (n - 1, 0)
        for f, i, j in faces:
            for lp in f.loops:
                ii, jj = ij[lp.vert]
                if lp.vert is tip:
                    jj = j + 0.5
                elif jj == 0 and j == segs - 1:
                    jj = segs  # couture : fin du tour
                lp[uv_layer].uv = (ii / (n - 1), jj / segs)
    return rings


def make_horns(arm, head_bone, base_l, r0, R0, name='horns', turns=1.55, color=(0.52, 0.45, 0.36, 1.0), spread=1.2):
    """base_l : base de la corne gauche (monde) ; la droite est son symétrique. r0 : rayon de la première spire,
    R0 : rayon de la corne à la base."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap')
    for side in (1, -1):
        base = Vector((side * abs(base_l.x), base_l.y, base_l.z))
        pts = horn_curve(base, side, r0, turns=turns, spread=spread)
        n = len(pts)
        radii = []
        for i in range(n):
            s = i / (n - 1)
            rr = R0 * (1 - 0.9 * s) ** 0.85 + 0.06 * R0
            rr *= 1.0 + 0.10 * max(0.0, math.sin(math.tau * 24 * s)) ** 3  # anneaux de croissance
            radii.append(rr)
        tube(bm, pts, radii, uv_layer=uvl)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    mat = bpy.data.materials.new('sheep_horn')
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = color
    bsdf.inputs['Roughness'].default_value = 0.55
    me.materials.append(mat)
    # rattachée à l'os de la tête, transformation du monde gardée
    mwld = ob.matrix_world.copy()
    ob.parent = arm
    ob.parent_type = 'BONE'
    ob.parent_bone = head_bone
    bpy.context.view_layer.update()
    ob.matrix_world = mwld
    bpy.context.view_layer.update()
    print('HORNS', name, 'triangles', sum(len(p.vertices) - 2 for p in me.polygons))
    return ob
