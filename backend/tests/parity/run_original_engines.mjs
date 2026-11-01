// Runs the ORIGINAL DADIP TypeScript engines on a list of inputs and prints their outputs as JSON.
// Usage: node run_original_engines.mjs <path/to/engines/index.ts> <path/to/typescript/module> < inputs.json
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const [, , enginesPath, tsModulePath] = process.argv;
const require = createRequire(import.meta.url);
const ts = require(tsModulePath);

const source = readFileSync(enginesPath, 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('exports', 'module', 'require', js)(mod.exports, mod, () => ({}));
const E = mod.exports;

const inputs = JSON.parse(readFileSync(0, 'utf8'));
const out = inputs.map((x) => {
  const risk = E.predictRisk(x);
  delete risk.timestamp;
  const reliability = E.estimateReliability(x, risk);
  const shift = E.detectShift(x);
  const admissibility = E.computeAdmissibility(reliability.reliabilityScore, shift.normalizedDistance);
  const explanation = E.explainPrediction(x);
  return { risk, reliability, shift, admissibility, explanation };
});
const grid = [];
for (let i = 0; i <= 20; i++) for (let j = 0; j <= 20; j++) {
  const rel = Math.round(i * 5) / 100, nd = Math.round(j * 5) / 100;
  grid.push({ reliability: rel, normalizedDistance: nd, expected: E.computeAdmissibility(rel, nd) });
}
process.stdout.write(JSON.stringify({ cases: out, admissibilityGrid: grid }));
