/* Read-only adapter: execute current TypeScript metrics/evaluation, no server startup. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const ts = require(path.join(root, 'server/node_modules/typescript'));
require.extensions['.ts'] = (mod, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  mod._compile(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  }).outputText, filename);
};
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const { config } = require(path.join(root, 'server/src/config.ts'));
config.archiveFile = input.archive;
const { buildEvalReport } = require(path.join(root, 'server/src/eval/eval.ts'));
const metrics = require(path.join(root, 'server/src/eval/metrics.ts'));
const { FEEDS } = require(path.join(root, 'server/src/config.ts'));
const report = buildEvalReport([]); // Empty topic input, no pipeline, network or model calls.
const comparisons = input.pairs.map(({ name, x, y }) => ({
  name, pearson: metrics.pearson(x, y), spearman: metrics.spearman(x, y),
}));
process.stdout.write(JSON.stringify({
  source: 'server/src/eval/{eval,metrics}.ts (transpiled in memory)',
  node: process.version, typescript: ts.version,
  configured_feeds: FEEDS, cluster: config.cluster, topN: config.topN,
  singlesLimit: config.singlesLimit, briefingIntervalHours: config.briefingIntervalHours,
  actual_report: report, comparisons,
  boundary_checks: {
    ari_identical_singletons: metrics.adjustedRandIndex(['a', 'b'], ['a', 'b']),
    ari_identical_single_cluster: metrics.adjustedRandIndex(['a', 'a'], ['x', 'x']),
  },
}));
