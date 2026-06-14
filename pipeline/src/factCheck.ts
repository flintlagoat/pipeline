import Anthropic from '@anthropic-ai/sdk';
import { ChannelConfig } from './types/specTypes';
import { buildFactCheckSystemPrompt, buildFactCheckUserPrompt } from './prompts/factCheckPrompt';

// Fact-check pass (session 7). A cheap Haiku audit run after the critic pass: rates every checkable
// claim and hedges only the low-confidence, over-precise ones. Returns the (possibly) safer script
// plus an audit the orchestrator saves as a paper trail (factcheck.json) — useful both for quality
// and as evidence of due diligence against YouTube's "inauthentic content" enforcement. Fail-open:
// any error keeps the original script (the pass can only improve, never lose, a script).

const client = new Anthropic();

export interface FactClaim {
  text: string;
  confidence: 'high' | 'medium' | 'low';
  issue: string;
  fix: string;
}
export interface FactCheckResult {
  claims: FactClaim[];
  script: string;     // revised (or original if nothing changed / on error)
  changed: boolean;
  lowCount: number;
}

function countWords(s: string): number { const m = s.trim().match(/\S+/g); return m ? m.length : 0; }
function stripFences(s: string): string { return s.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim(); }

export async function factCheckScript(
  script: string,
  channelConfig: ChannelConfig
): Promise<FactCheckResult> {
  const original: FactCheckResult = { claims: [], script, changed: false, lowCount: 0 };
  try {
    const resp = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: Math.min(8000, Math.max(1500, Math.ceil(countWords(script) * 3))),
      system: [{ type: 'text', text: buildFactCheckSystemPrompt(channelConfig) }],
      messages: [{ role: 'user', content: buildFactCheckUserPrompt(script) }],
    });
    const block = resp.content[0];
    if (block.type !== 'text') return original;

    const parsed = JSON.parse(stripFences(block.text)) as {
      claims?: FactClaim[]; revisedScript?: string; changed?: boolean;
    };
    const claims = Array.isArray(parsed.claims) ? parsed.claims : [];
    const lowCount = claims.filter((c) => c.confidence === 'low').length;

    const revised = (parsed.revisedScript ?? '').trim();
    // Sanity gate: accept a revision only if it's substantial and close to the original length
    // (the pass should hedge a few figures, not rewrite the whole thing).
    const ok = revised && Math.abs(countWords(revised) - countWords(script)) <= countWords(script) * 0.2;
    const useRevised = !!(parsed.changed && lowCount > 0 && ok);

    return {
      claims,
      script: useRevised ? revised : script,
      changed: useRevised,
      lowCount,
    };
  } catch {
    return original; // fail-open
  }
}
