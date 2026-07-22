/**
 * RSM Tools — static SPA host only.
 * All product APIs live on the WAIGO backend (VITE_API_URL).
 * No database, Prisma, or local /api routes.
 */
const http = require('http')
const fs = require('fs')
const path = require('path')

const port = Number(process.env.PORT) || 8080
const distDir = path.join(__dirname, 'frontend', 'dist')
const indexHtml = path.join(distDir, 'index.html')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers)
  res.end(body)
}

function safeJoin(root, requestPath) {
  const decoded = decodeURIComponent(requestPath.split('?')[0])
  const normalized = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '')
  const full = path.join(root, normalized)
  if (!full.startsWith(root)) return null
  return full
}

const server = http.createServer((req, res) => {
  const urlPath = req.url || '/'

  if (urlPath === '/health' || urlPath === '/healthz') {
    return send(res, 200, JSON.stringify({ ok: true, service: 'rsm-tools-spa' }), {
      'Content-Type': 'application/json',
    })
  }

  if (!fs.existsSync(distDir) || !fs.existsSync(indexHtml)) {
    console.error('[SPA] frontend/dist missing — run frontend build')
    return send(res, 503, 'Frontend not built', { 'Content-Type': 'text/plain' })
  }

  let filePath = safeJoin(distDir, urlPath === '/' ? '/index.html' : urlPath)
  if (!filePath) {
    return send(res, 400, 'Bad request', { 'Content-Type': 'text/plain' })
  }

  // SPA fallback for client routes
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = indexHtml
  }

  const ext = path.extname(filePath).toLowerCase()
  const type = MIME[ext] || 'application/octet-stream'
  const isImmutableAsset = urlPath.startsWith('/assets/')

  fs.readFile(filePath, (err, data) => {
    if (err) {
      console.error('[SPA] read error', filePath, err.message)
      return send(res, 500, 'Internal error', { 'Content-Type': 'text/plain' })
    }
    send(res, 200, data, {
      'Content-Type': type,
      'Cache-Control': isImmutableAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
    })
  })
})

server.listen(port, () => {
  console.log(`[SPA] RSM Tools static host on port ${port}`)
  console.log(`[SPA] Serving ${distDir}`)
})
