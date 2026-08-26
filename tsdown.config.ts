import { defineConfig } from 'tsdown'

/**
 * Everything the DSH runtime serves itself stays external: the host resolves
 * `@deepseek-ai/*` from the composed profile tree, and the browser module
 * loader hands `react` / `react/jsx-runtime` to the factory. Bundling either
 * would give this plugin a second React and break hooks. `schemastery` is a
 * declared dependency, so the host half inlines its copy — the schema object
 * never crosses package boundaries by identity.
 */
const EXTERNAL = [/^@deepseek-ai\//, 'react', 'react/jsx-runtime', 'react-dom']

/**
 * The browser bundle is ONE module node registered with the client module
 * loader: the file must call `window.__ModuleLoader__.load({id, factory})`
 * and return `module.exports` from the factory.
 */
const CLIENT_BANNER = [
  'window.__ModuleLoader__.load({',
  '\tid: "dsh-openrouter-monitor",',
  '\tfactory: (require) => {',
  '\t\tvar module = { exports: {} };',
  '\t\tvar exports = module.exports;',
].join('\n')

const CLIENT_FOOTER = ['\t\treturn module.exports;', '\t}', '});'].join('\n')

/** `tsc -b` writes declarations into `lib/types` first; keep them. */
const CLEAN = ['lib/*.js', 'lib/*.js.map']

export default defineConfig([
  {
    entry: ['src/index.ts'],
    outDir: 'lib',
    format: 'esm',
    platform: 'node',
    external: EXTERNAL,
    sourcemap: true,
    dts: false,
    unbundle: false,
    clean: CLEAN,
    outExtensions: () => ({ js: '.js' }),
  },
  {
    entry: { client: 'src/client/index.tsx' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    external: EXTERNAL,
    sourcemap: true,
    dts: false,
    unbundle: false,
    clean: CLEAN,
    outExtensions: () => ({ js: '.js' }),
    outputOptions: { banner: CLIENT_BANNER, footer: CLIENT_FOOTER },
  },
])
