import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { ChannelSpec, ChannelSpecSchema } from './types/channelSpec';
import { CHANNEL_SPEC_SYSTEM_PROMPT, buildChannelSpecUserPrompt } from './prompts/channelSpecPrompt';
import { saveChannelSpec, channelSpecExists } from './channelSpec';
import { applyDistinctness, loadArchetypeCounts } from './channelDistinct';

// Channel Generator (PART 1d). title + description → a complete, validated ChannelSpec on
// claude-opus-4-8. The model picks/blends an archetype and customizes all tokens. The `id` is
// derived from the title here (not trusted from the model) and de-duplicated against existing
// channels. Generic across any niche.

const client = new Anthropic();
const ROOT = path.resolve(__dirname, '..', '..');

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'channel';
}

function uniqueId(base: string): string {
  let id = base;
  let n = 2;
  while (fs.existsSync(path.join(ROOT, 'channels', id))) id = `${base}_${n++}`;
  return id;
}

function stripFences(text: string): string {
  return text.replace(/^```(?:json)?\r?\n?/, '').replace(/\r?\n?```$/, '').trim();
}

export interface GenerateChannelOptions {
  niche?: string;
  audience?: string;
  tone?: string;
  save?: boolean;   // default true — write channel.spec.json + config.json
}

export async function generateChannelSpec(
  title: string,
  description: string,
  opts: GenerateChannelOptions = {}
): Promise<ChannelSpec> {
  if (!title.trim()) throw new Error('Channel generation needs a non-empty title.');
  if (!description.trim()) throw new Error('Channel generation needs a non-empty description.');

  const id = uniqueId(slugify(title));
  // Surface the studio's current archetype distribution so the generator spreads picks instead of
  // funnelling every new channel onto the same look.
  const existingArchetypes = loadArchetypeCounts(id);
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: buildChannelSpecUserPrompt(title, description, { ...opts, existingArchetypes }) },
  ];

  let lastErr = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt === 1) {
      messages.push({ role: 'user', content: `That JSON was invalid: ${lastErr}\nReturn the corrected complete JSON only.` });
    }
    const resp = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 4000,
      system: [{ type: 'text', text: CHANNEL_SPEC_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages,
    });
    const block = resp.content[0];
    if (block.type !== 'text') throw new Error(`Unexpected content block type: ${block.type}`);

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripFences(block.text));
    } catch (e) {
      lastErr = `not valid JSON: ${(e as Error).message}`;
      messages.push({ role: 'assistant', content: block.text });
      continue;
    }
    // Force id + ensure title/description present.
    const withId = { ...(parsed as object), id, title, description };
    const result = ChannelSpecSchema.safeParse(withId);
    if (result.success) {
      // Stamp a deterministic per-channel signature (+ low-sensitivity collision guard) so two
      // channels in the same niche/archetype never render identically. See channelDistinct.ts.
      const spec = applyDistinctness(result.data);
      if (opts.save !== false) {
        if (channelSpecExists(spec.id)) throw new Error(`Channel "${spec.id}" already exists.`);
        saveChannelSpec(spec);
      }
      return spec;
    }
    lastErr = result.error.issues.slice(0, 6).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    messages.push({ role: 'assistant', content: block.text });
  }

  throw new Error(`Channel spec generation failed after 2 attempts. Last error: ${lastErr}`);
}
