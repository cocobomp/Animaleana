# Textures du mouton Rocketbox converties pour Blender et le glTF (Blender 4.2, numpy fourni avec Blender) :
# - sheep_white_color.tga → rb_color.png (telle quelle) ;
# - sheep_white_bump.tga (carte de normales de 3ds Max, « DirectX » : vert vers le bas) → rb_normal_gl.png (vert
#   inversé, normales « OpenGL » attendues par le glTF).
# Usage : blender -b --factory-startup --python prep_tex.py -- <dossier Textures/ de la source> <dossier de sortie>
import bpy, sys, os
import numpy as np

argv = sys.argv[sys.argv.index('--') + 1:]
src, out = argv[0], argv[1]
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


convert('sheep_white_color.tga', 'rb_color.png')
convert('sheep_white_bump.tga', 'rb_normal_gl.png', flip_green=True)
