import { build } from 'esbuild'
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, 'dist')

await mkdir(out, { recursive: true })

const shared = {
  entryPoints: [join(here, 'src/index.ts')],
  bundle: true,
  target: ['es2019', 'safari13'],
  logLevel: 'info',
  legalComments: 'none',
  // Upstream core is pure TypeScript with zero dependencies, so bundling it in
  // keeps the shipped artefact single-file and removes any install-time coupling
  // between this engine and a particular @use-gesture version.
  define: { 'process.env.NODE_ENV': '"production"' }
}

await build({
  ...shared,
  format: 'esm',
  outfile: join(out, 'kinetic-engine.js'),
  sourcemap: true
})

await build({
  ...shared,
  format: 'cjs',
  outfile: join(out, 'kinetic-engine.cjs'),
  sourcemap: true
})

await build({
  ...shared,
  format: 'iife',
  globalName: 'Kinetic',
  outfile: join(out, 'kinetic-engine.global.js'),
  minify: true
})

await copyFile(join(here, 'src/kinetic.css'), join(out, 'kinetic.css'))

const esm = await readFile(join(out, 'kinetic-engine.js'), 'utf8')
const gz = await readFile(join(out, 'kinetic-engine.global.js'), 'utf8')
const kb = (s) => (Buffer.byteLength(s, 'utf8') / 1024).toFixed(1)
await writeFile(
  join(out, 'SIZES.txt'),
  `kinetic-engine.js (esm)          ${kb(esm)} KiB\nkinetic-engine.global.js (iife)  ${kb(gz)} KiB (minified)\n`,
  'utf8'
)
console.log(`built: esm ${kb(esm)} KiB, iife ${kb(gz)} KiB`)
