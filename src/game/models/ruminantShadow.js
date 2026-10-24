// Ombre propre des oreilles et des cornes des ruminants (vache, chèvre, mouton).
//
// Vues de côté par le soleil, les oreilles et les cornes, minces et tout près de la tête, posaient une strie gris-bleu
// à bord net sur la joue claire, derrière l'œil (taureau Hereford, Charolais, chèvre saanen, mérinos…). Elles portent
// donc leur ombre un peu plus loin du soleil qu'elles ne sont : dans la passe d'ombre seulement, leurs sommets reculent
// de quelques dizaines de cm le long du rayon (à la taille de la bête). Leur ombre ne tombe plus sur la tête ni sur
// l'autre oreille, mais toujours au sol et sur ce qui est plus loin derrière elles. Rien d'autre ne change : une lisse,
// un râtelier ou un barreau tout près de la tête y porte son ombre comme avant (un biais sur la tête qui reçoit
// l'ombre, essayé d'abord, effaçait aussi ces ombres-là).

/**
 * Recul (m, bête à l'échelle 1) de l'ombre des oreilles et des cornes, par espèce. Vache : 65 cm — à 30 ou 45 cm, sous
 * le soleil bas du matin, l'ombre des cornes et des oreilles tombait encore en tache nette sur le bas de la joue et le
 * naseau (taureau et vache Hereford). Chèvre et mouton, têtes plus petites : 30 cm suffisent.
 */
export const SELF_SHADOW_GAP = { cow: 0.65, goat: 0.3, sheep: 0.3 };

/**
 * Morceau de shader de sommet pour la matière d'ombre (MeshDepthMaterial), à placer après `#include <project_vertex>` :
 * expr (GLSL, 0-1) est la part du sommet portée par les oreilles et les cornes ; gap le recul en m ; unit (GLSL) ramène
 * l'échelle du maillage à celle de la bête (cornes du mouton : maillage à part, à leur propre échelle).
 */
export function selfShadowVertex(expr, gap, unit = '1.0') {
  return /* glsl */ `
{
  float rGap = (${expr}) * ${gap.toFixed(3)} * length(modelMatrix[0].xyz) * (${unit});
  mvPosition.z -= rGap;
  gl_Position = projectionMatrix * mvPosition;
}`;
}

/** Ajoute le recul à un shader de matière d'ombre (sh : celui d'onBeforeCompile). */
export function addSelfShadow(sh, expr, gap, unit) {
  sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>\n${selfShadowVertex(expr, gap, unit)}`);
}
