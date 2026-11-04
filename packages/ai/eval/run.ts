// Quality evaluation against a real model. Gated: it does nothing unless
// AI_EVAL=1 and the AI_* variables are set. It is not part of `bun test`.
//
//   AI_EVAL=1 AI_BASE_URL=... AI_MODEL=... bun run --filter @phantoms/ai eval

import { aiConfigFromEnv, createAIClient, runEval } from '../src/index';
import { cases } from './cases';

if (process.env.AI_EVAL !== '1') {
  console.error('Skipped: set AI_EVAL=1 to run the evaluation.');
  process.exit(0);
}

const config = aiConfigFromEnv();
if (!config) {
  console.error('Set AI_BASE_URL and AI_MODEL (and AI_API_KEY if needed).');
  process.exit(2);
}

const report = await runEval(
  createAIClient(config, { onUsage: () => {} }),
  cases,
);
for (const result of report.results) {
  const mark = result.passed ? 'pass' : 'FAIL';
  const why = result.reason ? `  (${result.reason})` : '';
  console.log(`${mark}  ${result.id}  ${result.latencyMs}ms${why}`);
}
console.log(`${report.passed}/${report.total} passed`);
process.exit(report.passed === report.total ? 0 : 1);
