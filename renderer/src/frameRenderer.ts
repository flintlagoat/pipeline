import { createCanvas } from '@napi-rs/canvas';
import type { Canvas, SKRSContext2D } from '@napi-rs/canvas';
import { BoardSpec, Element, CameraState, RendererContext } from './schema';
import { getCameraAtTime } from './camera';
import { drawBlueprint } from './blueprint';
import { drawBackground } from './background';
import { assetBob } from './motion';
import { drawHeadline } from './elements/headline';
import { drawEyebrowLabel } from './elements/eyebrowLabel';
import { drawBodyText } from './elements/bodyText';
import { drawRuleLine } from './elements/ruleLine';
import { drawConnectorArrow } from './elements/connectorArrow';
import { drawNodeBox } from './elements/nodeBox';
import { drawNodeCircle } from './elements/nodeCircle';
import { drawSvgAsset } from './elements/svgAsset';
import { drawPngAsset } from './elements/pngAsset';
import { drawLabelTag } from './elements/labelTag';
import { drawThoughtBubble } from './elements/thoughtBubble';
import { drawListReveal } from './elements/listReveal';
import { drawHighlightBox } from './elements/highlightBox';
import { drawBlurReveal } from './elements/blurReveal';

// One reusable canvas per thread (each worker thread gets its own module instance). The frame
// is fully repainted every time (drawBackground fills the whole surface opaquely), so reuse is
// safe and saves a per-frame surface allocation at 1080p.
let reusableCanvas: Canvas | null = null;
function getCanvas(w: number, h: number): Canvas {
  if (!reusableCanvas || reusableCanvas.width !== w || reusableCanvas.height !== h) {
    reusableCanvas = createCanvas(w, h);
  }
  return reusableCanvas;
}

export function renderFrame(
  spec: BoardSpec,
  frameIndex: number,
  rctx: RendererContext
): Canvas {
  // Output dimensions + timeline sample rate come from the render settings (full vs draft),
  // NOT from spec.format/spec.fps — so a draft render is simply a smaller canvas sampled at a
  // lower fps. Every element derives its scale from outputWidth, so a half-width canvas yields a
  // pixel-correct half-resolution frame with identical composition.
  const { outputWidth, outputHeight, fps } = rctx.settings;
  const currentTime = frameIndex / fps;

  const canvas = getCanvas(outputWidth, outputHeight);
  const ctx = canvas.getContext('2d') as SKRSContext2D;
  // Defensive reset — element draws save/restore, but a reused context must start clean.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  const profile = rctx.profile;

  const camera = getCameraAtTime(spec.board.camera_keyframes, spec.board.sections, currentTime);

  // Per-archetype background (flat / gradient vignette / paper / dotted; grid via filler).
  drawBackground(ctx, profile, camera, outputWidth, outputHeight);

  // Quiet filler (grid, registration brackets, measurement ticks) UNDER content — only for
  // archetypes that enable it (blueprint_board). Others rely on background + type alone.
  if (profile.filler.enabled || profile.filler.grid) {
    drawBlueprint(ctx, camera, outputWidth, outputHeight, spec.board.sections, currentTime, profile.filler);
  }

  for (const section of spec.board.sections) {
    for (const element of section.elements) {
      dispatchElement(ctx, element, camera, outputWidth, currentTime, rctx);
    }
  }

  // Film grain overlay (opacity from the profile; 0 = skip entirely). Disabled outright in
  // draft mode (settings.grain === false) and when no overlay was generated.
  if (rctx.settings.grain && profile.grain > 0 && rctx.grainImage) {
    ctx.save();
    ctx.globalAlpha = profile.grain;
    ctx.drawImage(rctx.grainImage, 0, 0, outputWidth, outputHeight);
    ctx.restore();
  }

  return canvas;
}

/** PNG-encoded frame — used by the DEBUG frame-dump paths; normal renders stream raw RGBA. */
export function renderFramePng(spec: BoardSpec, frameIndex: number, rctx: RendererContext): Buffer {
  return renderFrame(spec, frameIndex, rctx).toBuffer('image/png');
}

function dispatchElement(
  ctx: SKRSContext2D,
  element: Element,
  camera: CameraState,
  outputWidth: number,
  currentTime: number,
  rctx: RendererContext
): void {
  switch (element.type) {
    case 'headline':
      drawHeadline(ctx, element, camera, outputWidth, currentTime);
      break;
    case 'eyebrow':
      drawEyebrowLabel(ctx, element, camera, outputWidth, currentTime);
      break;
    case 'body_text':
      drawBodyText(ctx, element, camera, outputWidth, currentTime);
      break;
    case 'rule_line':
      drawRuleLine(ctx, element, camera, outputWidth, currentTime);
      break;
    case 'connector_arrow':
      drawConnectorArrow(ctx, element, camera, outputWidth, currentTime);
      break;
    case 'node_box':
      drawNodeBox(ctx, element, camera, outputWidth, currentTime);
      break;
    case 'node_circle':
      drawNodeCircle(ctx, element, camera, outputWidth, currentTime);
      break;
    case 'svg_asset': {
      // Gentle continuous float so static scenes aren't dead (Issue 6). Translate the
      // canvas by a sub-pixel-to-few-px bob; the draw fn computes its own screen coords.
      const sc = outputWidth / camera.viewport_width;
      const { dx, dy } = assetBob(element.id, currentTime, sc, rctx.profile.motion.bobAmp);
      ctx.save();
      ctx.translate(dx, dy);
      drawSvgAsset(ctx, element, camera, outputWidth, currentTime, rctx.svgAssets);
      ctx.restore();
      break;
    }
    case 'png_asset': {
      const sc = outputWidth / camera.viewport_width;
      const { dx, dy } = assetBob(element.id, currentTime, sc, rctx.profile.motion.bobAmp);
      ctx.save();
      ctx.translate(dx, dy);
      drawPngAsset(ctx, element, camera, outputWidth, currentTime, rctx.pngAssets);
      ctx.restore();
      break;
    }
    case 'label_tag':
      drawLabelTag(ctx, element, camera, outputWidth, currentTime);
      break;
    case 'thought_bubble':
      drawThoughtBubble(ctx, element, camera, outputWidth, currentTime);
      break;
    case 'list_reveal':
      drawListReveal(ctx, element, camera, outputWidth, currentTime);
      break;
    case 'highlight_box':
      drawHighlightBox(ctx, element, camera, outputWidth, currentTime);
      break;
    case 'blur_reveal':
      drawBlurReveal(ctx, element, camera, outputWidth, currentTime);
      break;
  }
}
