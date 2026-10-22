/**
 * Minimal static server for the demo and the e2e suite.
 *
 * No dependencies on purpose: the fewer moving parts between the artefact and the
 * browser, the easier it is to trust a visual verification. Binds to loopback only.
 */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../studio', import.meta.url)))
const port = Number(process.env.PORT || 4321)

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.map': 'application/json'
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`)
    let pathname = decodeURIComponent(url.pathname)
    if (pathname.endsWith('/')) pathname += 'index.html'

    // Strip leading separators, then verify the resolved path is still inside the
    // document root. A bare `startsWith(root)` check would also accept a sibling
    // folder whose name merely shares the prefix (`studio-old`).
    const relative = pathname.split(/[\\/]+/).filter(Boolean).join(sep)
    const target = resolve(root, relative)
    if (target !== root && !target.startsWith(root + sep)) {
      res.writeHead(403).end('forbidden')
      return
    }

    const info = await stat(target).catch(() => null)
    if (!info || !info.isFile()) {
      res.writeHead(404).end('not found')
      return
    }

    const body = await readFile(target)
    res.writeHead(200, {
      'content-type': TYPES[extname(target)] || 'application/octet-stream',
      'cache-control': 'no-store'
    })
    res.end(body)
  } catch (error) {
    res.writeHead(500).end(String(error))
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`kinetic-studio demo -> http://127.0.0.1:${port}/`)
})
