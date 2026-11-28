import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const stubPlotlyPlugin = {
  name: 'stub-plotly',
  setup(build) {
    build.onResolve(
      { filter: /^(plotly\.js|react-plotly\.js|@\/components\/charts\/PlotlyChart)$/ },
      (args) => ({
        path: args.path,
        namespace: 'plotly-stub',
      })
    );
    build.onLoad({ filter: /.*/, namespace: 'plotly-stub' }, () => ({
      contents: `
        export const PlotlyChart = () => null;
        export default PlotlyChart;
      `,
      loader: 'js',
    }));
  },
};

const frontendRoot = fs.realpathSync(path.resolve(import.meta.dirname, '..'));
const suites = [
  'evaluationDashboard.test.tsx',
  'guideAndGlossary.test.tsx',
  'productionConfig.test.ts',
];

for (const suite of suites) {
  const outFile = path.join(frontendRoot, 'node_modules', `.cache-${suite}.mjs`);
  await esbuild.build({
    entryPoints: [path.join(frontendRoot, 'tests', suite)],
    outfile: outFile,
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'esm',
    jsx: 'automatic',
    plugins: [stubPlotlyPlugin],
    alias: {
      '@': path.join(frontendRoot, 'src'),
    },
    define: {
      'import.meta.env': JSON.stringify({ VITE_API_BASE_URL: 'http://localhost:8000' }),
    },
  });

  try {
    await import(pathToFileURL(outFile).href);
  } finally {
    if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
  }
}
