import type { CalibrationProfile } from '../config/settings';
import { homography, isConvex, rectQuad, toCssMatrix3d, type Quad } from './homography';

/**
 * Applique le profil de calibrage à l'élément #stage : le canevas est dessiné à plat
 * (repère piano), puis cette transformation l'envoie sur les 4 coins réglés.
 */
export function applyStageTransform(stage: HTMLElement, compensation: HTMLElement, p: CalibrationProfile): boolean {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const [tl, tr, br, bl] = rectQuad(W, H);
  let src: Quad = [tl, tr, br, bl];
  if (p.mirrorX) src = [src[1], src[0], src[3], src[2]];
  if (p.mirrorY) src = [src[3], src[2], src[1], src[0]];
  const dst = p.corners.map((c) => ({ x: c.x * W, y: c.y * H })) as Quad;
  if (!isConvex(dst)) return false;
  stage.style.transform = toCssMatrix3d(homography(src, dst));

  const t = Math.max(-1, Math.min(1, p.brightnessTilt));
  const left = Math.max(0, -t) * 0.75;
  const right = Math.max(0, t) * 0.75;
  compensation.style.background = `linear-gradient(to right, rgba(0,0,0,${left}), rgba(0,0,0,${right}))`;
  return true;
}
