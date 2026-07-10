/**
 * Standalone terminal gate for the online-assist tier's PURE pieces
 * (REVIEW_2026-07-08 P1.2 — pass 3 found the tier had zero test coverage).
 *
 * Run from the repo root:
 *   npx tsx scripts/test-assist.ts        (or: npm run test:assist)
 *
 * Covers:
 *   1. `validateAssistDecision` — the defensive wall between a network/LLM
 *      payload and the offline pipeline (whitelisted intents, length/newline/
 *      URL/markup rejection, shape checks).
 *   2. `shouldAdoptAssistReroute` — the "adopt this reroute?" predicate
 *      extracted from ChatScreen (logClarify rejection = P0.3, the
 *      MEDIUM_CONFIDENCE floor, assistEligible re-entry guard).
 *   3. End-to-end meta shapes — real `routeMessage` outputs fed through the
 *      predicate, including the exact "bought coffee 100" logClarify shape the
 *      P0.3 review reproduced.
 *
 * The network client (`assist/assistClient.ts`) is deliberately NOT imported —
 * it pulls in the supabase client / React Native. Sub-path imports only.
 */

/* eslint-disable no-console */
import {
  validateAssistDecision,
  shouldAdoptAssistReroute,
} from '../src/intelligence/convo/assistCatalog';
import {
  routeMessage,
  MEDIUM_CONFIDENCE,
} from '../src/intelligence/convo/brain';
import type { BrainResponseMeta } from '../src/intelligence/convo/types';

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, extra = ''): void {
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`  ✗ ${label}${extra ? ` — ${extra}` : ''}`);
  }
}

console.log('Assist-tier gate\n');

// ── 1. validateAssistDecision ────────────────────────────────────────────────

const valid = validateAssistDecision({
  intent: 'spend',
  query: 'how much did I spend on food this month',
});
check('valid intent+query accepted', valid !== null);
check('  …intent survives', valid?.intent === 'spend');
check(
  '  …query survives',
  valid?.query === 'how much did I spend on food this month'
);

check(
  'whitespace is trimmed',
  validateAssistDecision({ intent: '  spend ', query: '  food this month  ' })
    ?.query === 'food this month'
);

const log = validateAssistDecision({ intent: 'log', query: 'ice cream 20' });
check('special "log" decision accepted', log?.intent === 'log');

const none = validateAssistDecision({ intent: 'none', query: 'ignored junk' });
check('"none" accepted', none?.intent === 'none');
check('  …query forced empty', none?.query === '');

check(
  'unknown intent rejected',
  validateAssistDecision({ intent: 'transferAllMyMoney', query: 'x' }) === null
);
check(
  'chit-chat intent rejected (greeting is not assist-eligible)',
  validateAssistDecision({ intent: 'greeting', query: 'hello' }) === null
);
check(
  'known intent with empty query rejected',
  validateAssistDecision({ intent: 'spend', query: '' }) === null
);
check(
  'overlong query rejected (> 140 chars)',
  validateAssistDecision({ intent: 'spend', query: 'a'.repeat(141) }) === null
);
check(
  'multi-line query rejected',
  validateAssistDecision({ intent: 'spend', query: 'line1\nline2' }) === null
);
check(
  'URL in query rejected',
  validateAssistDecision({
    intent: 'spend',
    query: 'see https://evil.example',
  }) === null
);
check(
  'www. in query rejected',
  validateAssistDecision({ intent: 'spend', query: 'www.evil.example' }) ===
    null
);
check(
  'markup in query rejected',
  validateAssistDecision({ intent: 'spend', query: '<script>hi</script>' }) ===
    null
);
check(
  'template/code chars rejected',
  validateAssistDecision({ intent: 'spend', query: 'pay {amount} now' }) ===
    null
);
check('null payload rejected', validateAssistDecision(null) === null);
check('string payload rejected', validateAssistDecision('spend') === null);
check(
  'non-string intent rejected',
  validateAssistDecision({ intent: 42, query: 'x' }) === null
);
check(
  'missing intent rejected',
  validateAssistDecision({ query: 'food this month' }) === null
);

// ── 2. shouldAdoptAssistReroute (pure predicate) ─────────────────────────────

const meta = (over: Partial<BrainResponseMeta>): BrainResponseMeta => ({
  source: 'rules',
  intent: 'spend',
  ruleMargin: 2,
  mlMatched: 10,
  confidence: 0.9,
  ...over,
});

check('undefined meta → reject', !shouldAdoptAssistReroute(undefined));
check(
  'fallback (intent null) → reject',
  !shouldAdoptAssistReroute(meta({ intent: null, source: 'none' }))
);
check(
  'logClarify reroute → reject even at high confidence (P0.3)',
  !shouldAdoptAssistReroute(meta({ intent: 'logClarify', confidence: 0.9 }))
);
check(
  'assist-eligible reroute → reject (must not need another assist)',
  !shouldAdoptAssistReroute(meta({ assistEligible: true }))
);
check(
  'below MEDIUM_CONFIDENCE → reject',
  !shouldAdoptAssistReroute(meta({ confidence: MEDIUM_CONFIDENCE - 0.01 }))
);
check(
  'exactly MEDIUM_CONFIDENCE → adopt (gate is ≥, from the brain constant)',
  shouldAdoptAssistReroute(meta({ confidence: MEDIUM_CONFIDENCE }))
);
check('confident resolve → adopt', shouldAdoptAssistReroute(meta({})));

// ── 3. End-to-end: real routeMessage metas through the predicate ─────────────

// A canonical rewrite the offline brain understands — the shape a good assist
// decision produces. No ctx: data intents still classify and carry meta.
const good = routeMessage('how much did I spend on food this month');
check(
  'canonical rewrite resolves to a data intent',
  good.meta?.intent === 'spend',
  `got ${good.meta?.intent}`
);
check('  …and is adopted', shouldAdoptAssistReroute(good.meta));

// The exact P0.3 repro: a statement-shaped rewrite routes to logClarify and
// must NOT be adopted as the answer to a question.
const clarify = routeMessage('bought coffee 100');
check(
  '"bought coffee 100" routes to logClarify',
  clarify.meta?.intent === 'logClarify',
  `got ${clarify.meta?.intent}`
);
check('  …and is NOT adopted (P0.3)', !shouldAdoptAssistReroute(clarify.meta));

// Gibberish falls back (intent null) — never adopted.
const junk = routeMessage('qwerty asdf zxcv');
check(
  'gibberish falls back (intent null)',
  junk.meta?.intent === null,
  `got ${junk.meta?.intent}`
);
check('  …and is NOT adopted', !shouldAdoptAssistReroute(junk.meta));

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failed > 0) {
  console.error('\nAssist gate FAILED.');
  process.exit(1);
}
console.log('\nAll assist tests passed.');
