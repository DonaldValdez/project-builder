import sharp from 'sharp'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const buildDir = join(__dirname, '../build')
mkdirSync(buildDir, { recursive: true })

// ── Convert RGBA pixel buffer → 24-bit Windows BMP (bottom-up, no alpha) ─────
function rawToBMP(width, height, rgba, channels) {
  const rowStride = Math.ceil(width * 3 / 4) * 4
  const pixelBytes = rowStride * height
  const buf = Buffer.alloc(54 + pixelBytes, 0)

  buf.write('BM', 0, 'ascii')
  buf.writeUInt32LE(54 + pixelBytes, 2)
  buf.writeUInt32LE(54, 10)
  buf.writeUInt32LE(40, 14)
  buf.writeInt32LE(width,  18)
  buf.writeInt32LE(height, 22)
  buf.writeUInt16LE(1,  26)
  buf.writeUInt16LE(24, 28)
  buf.writeUInt32LE(pixelBytes, 34)
  buf.writeInt32LE(3780, 38)
  buf.writeInt32LE(3780, 42)

  // composite transparent pixels over the app background colour (#0f172a)
  const [bgR, bgG, bgB] = [15, 23, 42]

  for (let y = 0; y < height; y++) {
    const fileRow = height - 1 - y   // BMP rows are bottom-up
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * channels
      let r, g, b
      if (channels >= 4) {
        const a = rgba[src + 3] / 255
        r = Math.round(rgba[src]   * a + bgR * (1 - a))
        g = Math.round(rgba[src+1] * a + bgG * (1 - a))
        b = Math.round(rgba[src+2] * a + bgB * (1 - a))
      } else {
        r = rgba[src]; g = rgba[src+1]; b = rgba[src+2]
      }
      const dst = 54 + fileRow * rowStride + x * 3
      buf[dst] = b; buf[dst+1] = g; buf[dst+2] = r
    }
  }
  return buf
}

// ── Pure-math BMP (for the simple gradient header) ────────────────────────────
function mathBMP(width, height, getPixel) {
  const rowStride = Math.ceil(width * 3 / 4) * 4
  const pixelBytes = rowStride * height
  const buf = Buffer.alloc(54 + pixelBytes, 0)
  buf.write('BM', 0, 'ascii')
  buf.writeUInt32LE(54 + pixelBytes, 2); buf.writeUInt32LE(54, 10)
  buf.writeUInt32LE(40, 14)
  buf.writeInt32LE(width, 18); buf.writeInt32LE(height, 22)
  buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28)
  buf.writeUInt32LE(pixelBytes, 34)
  buf.writeInt32LE(3780, 38); buf.writeInt32LE(3780, 42)
  for (let iy = 0; iy < height; iy++) {
    const fr = height - 1 - iy
    for (let x = 0; x < width; x++) {
      const [r, g, b] = getPixel(x, iy)
      const o = 54 + fr * rowStride + x * 3
      buf[o] = b; buf[o+1] = g; buf[o+2] = r
    }
  }
  return buf
}

function lerp(a, b, t) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * Math.max(0, Math.min(1, t))))
}

// ── Sidebar 164×314 — SVG rendered through sharp ──────────────────────────────
const sidebarSVG = `<svg width="164" height="314" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#1e1b4b"/>
      <stop offset="38%"  stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#080d1a"/>
    </linearGradient>
    <linearGradient id="bar" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#a5b4fc"/>
      <stop offset="100%" stop-color="#4338ca"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="164" height="314" fill="url(#bg)"/>

  <!-- Left accent bar -->
  <rect width="6" height="314" fill="url(#bar)"/>

  <!-- Folder icon -->
  <rect x="14" y="18" width="30" height="21" rx="2" fill="#1e1b4b" stroke="#4338ca" stroke-width="1.5"/>
  <rect x="14" y="14" width="13" height="7"  rx="1.5" fill="#1e1b4b" stroke="#4338ca" stroke-width="1.5"/>
  <!-- Lightning bolt -->
  <polygon points="29,20 24,31 28,31 25,38 34,27 30,27 33,20" fill="#fbbf24"/>

  <!-- App name -->
  <text x="52" y="29" font-family="Arial,Helvetica,sans-serif" font-size="14" font-weight="bold" fill="#ffffff">Project</text>
  <text x="52" y="46" font-family="Arial,Helvetica,sans-serif" font-size="14" font-weight="bold" fill="#818cf8">Builder</text>
  <text x="52" y="59" font-family="Arial,Helvetica,sans-serif" font-size="8"  fill="#475569">v1.0.0</text>

  <!-- Separator -->
  <line x1="14" y1="73" x2="152" y2="73" stroke="#1e293b" stroke-width="1"/>

  <!-- Developer -->
  <text x="14" y="92"  font-family="Arial,Helvetica,sans-serif" font-size="7"  fill="#475569">DEVELOPER</text>
  <text x="14" y="107" font-family="Arial,Helvetica,sans-serif" font-size="11" font-weight="bold" fill="#e2e8f0">Donald M. Valdez</text>
  <rect x="14" y="112" width="42" height="1.5" fill="#6366f1" rx="0.75"/>

  <!-- Website -->
  <text x="14" y="133" font-family="Arial,Helvetica,sans-serif" font-size="7"   fill="#475569">WEBSITE</text>
  <text x="14" y="147" font-family="Arial,Helvetica,sans-serif" font-size="9.5" fill="#818cf8">donaldvaldez.com</text>

  <!-- GitHub -->
  <text x="14" y="167" font-family="Arial,Helvetica,sans-serif" font-size="7" fill="#475569">GITHUB</text>
  <text x="14" y="181" font-family="Arial,Helvetica,sans-serif" font-size="9" fill="#818cf8">github.com/DonaldValdez</text>

  <!-- Email -->
  <text x="14" y="201" font-family="Arial,Helvetica,sans-serif" font-size="7"   fill="#475569">EMAIL</text>
  <text x="14" y="214" font-family="Arial,Helvetica,sans-serif" font-size="8.5" fill="#818cf8">donaldmvaldez@gmail.com</text>

  <!-- LinkedIn -->
  <text x="14" y="234" font-family="Arial,Helvetica,sans-serif" font-size="7"   fill="#475569">LINKEDIN</text>
  <text x="14" y="248" font-family="Arial,Helvetica,sans-serif" font-size="9.5" fill="#818cf8">in/donaldvaldez</text>

  <!-- X / Twitter -->
  <text x="14" y="268" font-family="Arial,Helvetica,sans-serif" font-size="7"   fill="#475569">X / TWITTER</text>
  <text x="14" y="282" font-family="Arial,Helvetica,sans-serif" font-size="9.5" fill="#818cf8">@donaldmvaldez</text>

  <!-- Footer -->
  <line x1="14" y1="296" x2="152" y2="296" stroke="#1e293b" stroke-width="1"/>
  <text x="14" y="308" font-family="Arial,Helvetica,sans-serif" font-size="7" fill="#334155">&#169; 2025 Donald M. Valdez</text>
</svg>`

const { data: sRaw, info: sInfo } = await sharp(Buffer.from(sidebarSVG))
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true })

writeFileSync(join(buildDir, 'installer-sidebar.bmp'),
  rawToBMP(sInfo.width, sInfo.height, sRaw, sInfo.channels))
console.log(`✓ build/installer-sidebar.bmp  (${sInfo.width}x${sInfo.height})`)

// ── Header 150×57 (inner pages) — gradient, no text needed ───────────────────
const INDIGO    = [99, 102, 241]
const LIGHT_IND = [199, 210, 254]
const WHITE     = [255, 255, 255]

writeFileSync(join(buildDir, 'installer-header.bmp'), mathBMP(150, 57, (x, y) => {
  if (y <= 1)  return INDIGO
  if (y >= 55) return LIGHT_IND
  const t = x / 149
  if (t < 0.45) return WHITE
  if (t < 0.65) return lerp(WHITE, LIGHT_IND, (t - 0.45) / 0.20)
  return lerp(LIGHT_IND, INDIGO, (t - 0.65) / 0.35)
}))
console.log('✓ build/installer-header.bmp   (150x57)')
