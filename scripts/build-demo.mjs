/**
 * Copy the built engine into the demo's vendor folder.
 *
 * The demo is plain static files on purpose: no bundler, no dev server contract,
 * so the exact artefact that ships is the one that was verified.
 */
import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const from = join(root, 'engine', 'dist')
const to = join(root, 'studio', 'vendor')

await mkdir(to, { recursive: true })
for (const file of ['kinetic-engine.global.js', 'kinetic.css']) {
  await copyFile(join(from, file), join(to, file))
}
console.log('demo vendor updated from engine/dist')
