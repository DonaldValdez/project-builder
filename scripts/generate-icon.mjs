import sharp from 'sharp'
import { readFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const svgPath = join(__dirname, '../src/assets/icon.svg')
const svg = readFileSync(svgPath)

mkdirSync(join(__dirname, '../src/assets'), { recursive: true })

const sizes = [16, 32, 48, 64, 128, 256]

for (const size of sizes) {
  await sharp(svg)
    .resize(size, size)
    .png()
    .toFile(join(__dirname, `../src/assets/icon-${size}.png`))
  console.log(`✓ icon-${size}.png`)
}

// Main icon at 256px used by Electron window
await sharp(svg)
  .resize(256, 256)
  .png()
  .toFile(join(__dirname, '../src/assets/icon.png'))

console.log('✓ icon.png (256x256) — ready for Electron')
