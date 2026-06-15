import { z } from 'zod';
import { BoardSpec } from '../types/specTypes';

const RevealTypeSchema = z.enum([
  'fade_up', 'draw_on', 'scale_in', 'blur_in', 'type_on', 'count_up', 'instant', 'fade_only',
]);

const ElementTypeSchema = z.enum([
  'headline', 'eyebrow', 'body_text',
  'rule_line', 'connector_arrow',
  'node_box', 'node_circle',
  'png_asset', 'svg_asset',
  'label_tag', 'thought_bubble',
  'list_reveal', 'highlight_box', 'blur_reveal',
]);

const ElementSchema = z.object({
  id: z.string().min(1),
  type: ElementTypeSchema,
  reveal_at_seconds: z.number().min(0),
  reveal_type: RevealTypeSchema,
  reveal_duration_seconds: z.number().positive().optional(),
  emphasis_words: z.array(z.string()).optional(),
  emphasis_color: z.string().optional(),
  wrap_chars: z.number().positive().optional(),
  x: z.number(),
  y: z.number(),
  content: z.string().optional(),
  lines: z.array(z.string()).optional(),
  font_size: z.number().positive().optional(),
  color: z.string().optional(),
  font_family: z.enum(['display', 'mono', 'body']).optional(),
  letter_spacing: z.number().optional(),
  x2: z.number().optional(),
  y2: z.number().optional(),
  stroke_color: z.string().optional(),
  stroke_width: z.number().optional(),
  dashed: z.boolean().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  radius: z.number().positive().optional(),
  border_radius: z.number().optional(),
  asset_name: z.string().optional(),
  asset_width: z.number().positive().optional(),
  asset_height: z.number().positive().optional(),
  anim_action: z.string().optional(),
  anim_frames: z.number().positive().optional(),
  item_delay_seconds: z.number().positive().optional(),
  target_element_id: z.string().optional(),
});

const SectionSchema = z.object({
  id: z.string().min(1),
  section_type: z.enum([
    'hook', 'comparison', 'diagram', 'revelation',
    'list_reveal', 'flow_chart', 'conclusion',
  ]),
  x_offset: z.number().min(0),
  y_offset: z.number().min(0),
  width: z.number().positive(),
  height: z.number().positive(),
  elements: z.array(ElementSchema).min(1),
});

const CameraKeyframeSchema = z.object({
  time_seconds: z.number().min(0),
  viewport_x: z.number().min(0),
  viewport_y: z.number().min(0),
  viewport_width: z.number().min(600),
  viewport_height: z.number().positive(),
  easing: z.enum(['ease_in_out', 'cinematic', 'snap']),
});

const BoardSpecSchema = z.object({
  video_id: z.string().min(1),
  channel_id: z.string().min(1),
  format: z.enum(['landscape_16x9', 'portrait_9x16']),
  duration_seconds: z.number().positive(),
  fps: z.literal(30),
  audio_file: z.string(),
  asset_needs: z.array(z.string()),
  board: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
    background_color: z.string().min(1),
    sections: z.array(SectionSchema).min(1),
    // ≥1: the renderer DERIVES the whole camera path from sections + reveal times (buildCameraPath
    // overwrites these), so the model only needs to emit the mandatory start keyframe. (Was min(2),
    // which forced a wasted retry now that the prompt asks for a single start keyframe.)
    camera_keyframes: z.array(CameraKeyframeSchema).min(1),
  }),
});

export type ValidatedBoardSpec = z.infer<typeof BoardSpecSchema>;

export function validateSpec(
  raw: unknown
): { success: true; spec: BoardSpec } | { success: false; error: string } {
  const result = BoardSpecSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 5)
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    return { success: false, error: `Zod validation failed:\n${issues}` };
  }

  const spec = result.data as BoardSpec;

  // Spatial non-overlap check: no two rectangular "block" elements (assets and boxes,
  // which carry an explicit x/y/width/height) may overlap within the same section. This
  // catches the colliding-SVG defect (e.g. building + price tag) and feeds the spec
  // generator's retry loop a precise error so it re-places the offender.
  const overlap = findOverlap(spec);
  if (overlap) {
    return { success: false, error: `Overlapping elements (their bounding boxes intersect):\n  ${overlap}\nMove one to a different layout zone or section so no two boxes overlap (leave ≥24px gap).` };
  }

  return { success: true, spec };
}

const BLOCK_TYPES = new Set(['svg_asset', 'png_asset', 'node_box', 'highlight_box']);
const OVERLAP_TOLERANCE = 8; // px of intersection on BOTH axes before it counts as a collision

interface Box { id: string; x: number; y: number; w: number; h: number; }

function boxFor(el: BoardSpec['board']['sections'][number]['elements'][number]): Box | null {
  if (!BLOCK_TYPES.has(el.type)) return null;
  const w = el.asset_width ?? el.width;
  const h = el.asset_height ?? el.height;
  if (typeof w !== 'number' || typeof h !== 'number') return null;
  return { id: el.id, x: el.x, y: el.y, w, h };
}

function findOverlap(spec: BoardSpec): string | null {
  for (const section of spec.board.sections) {
    const boxes = section.elements.map(boxFor).filter((b): b is Box => b !== null);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (overlapX > OVERLAP_TOLERANCE && overlapY > OVERLAP_TOLERANCE) {
          return `section "${section.id}": "${a.id}" and "${b.id}" overlap by ${Math.round(overlapX)}×${Math.round(overlapY)}px`;
        }
      }
    }
  }
  return null;
}
