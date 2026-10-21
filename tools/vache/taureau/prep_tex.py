# Textures d'une vache Rocketbox converties pour Blender et le glTF (Blender 4.2, numpy fourni avec Blender) :
# - <préfixe>_color.tga → <préfixe>_color.png (telle quelle) ;
# - <préfixe>_bump.tga (carte de normales de 3ds Max, « DirectX » : vert vers le bas) → <préfixe>_normal_gl.png (vert
#   inversé, normales « OpenGL » attendues par le glTF).
# Usage : blender -b --factory-startup --disable-autoexec --python prep_tex.py -- <dossier Textures> <sortie> <préfixe>
import bpy, sys, os
import numpy as np

argv = sys.argv[sys.argv.index('--') + 1:]
src, out, prefix = argv[0], argv[1], argv[2]
os.makedirs(out, exist_ok=True)


def convert(name, dest, flip_green=False):
    img = bpy.data.images.load(os.path.join(src, name))
    img.colorspace_settings.name = 'Non-Color'
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    if flip_green:
        px[1::4] = 1.0 - px[1::4]
    new = bpy.data.images.new(dest, w, h, alpha=False)
    new.colorspace_settings.name = 'Non-Color'
    new.pixels.foreach_set(px)
    new.filepath_raw = os.path.join(out, dest)
    new.file_format = 'PNG'
    new.save()
    print('TEXTURE', dest, w, h)


convert(f'{prefix}_color.tga', f'{prefix}_color.png')
convert(f'{prefix}_bump.tga', f'{prefix}_normal_gl.png', flip_green=True)
