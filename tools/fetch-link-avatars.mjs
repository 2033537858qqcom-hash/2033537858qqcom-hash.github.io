import https from 'https'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const sharp = require('sharp')
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, '../source/img/links')

function get (url) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept: 'image/*,*/*;q=0.8'
          }
        },
        res => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume()
            return get(res.headers.location).then(resolve, reject)
          }
          const chunks = []
          res.on('data', c => chunks.push(c))
          res.on('end', () =>
            resolve({
              status: res.statusCode,
              buf: Buffer.concat(chunks),
              type: res.headers['content-type'] || ''
            })
          )
        }
      )
      .on('error', reject)
  })
}

fs.mkdirSync(outDir, { recursive: true })

async function saveFromUrls (name, urls) {
  for (const url of urls) {
    try {
      const r = await get(url)
      console.log(name, url, r.status, r.type, r.buf.length)
      if (r.status === 200 && r.buf.length > 100 && !r.type.includes('html') && r.buf[0] !== 0x3c) {
        const out = path.join(outDir, name + '.png')
        await sharp(r.buf).resize(128, 128, { fit: 'cover' }).png().toFile(out)
        console.log('saved', out)
        return true
      }
    } catch (e) {
      console.log(name, url, e.message)
    }
  }
  return false
}

const pinOk = await saveFromUrls('pinterest', [
  'https://s.pinimg.com/webapp/favicon-54a5b2af.png',
  'https://www.pinterest.com/favicon.ico'
])

const ldoOk = await saveFromUrls('linux-do', [
  'https://www.google.com/s2/favicons?domain=linux.do&sz=128',
  'https://icons.duckduckgo.com/ip3/linux.do.ico',
  'https://favicon.yandex.net/favicon/v2/linux.do?size=120'
])

if (!ldoOk) {
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128">
  <rect width="128" height="128" rx="28" fill="#f97316"/>
  <text x="64" y="82" text-anchor="middle" font-size="56" font-family="Segoe UI,Arial,sans-serif" font-weight="700" fill="#ffffff">L</text>
</svg>`
  )
  await sharp(svg).png().toFile(path.join(outDir, 'linux-do.png'))
  console.log('linux-do fallback brand icon')
}

if (!pinOk) {
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128">
  <rect width="128" height="128" rx="28" fill="#e60023"/>
  <text x="64" y="82" text-anchor="middle" font-size="56" font-family="Segoe UI,Arial,sans-serif" font-weight="700" fill="#ffffff">P</text>
</svg>`
  )
  await sharp(svg).png().toFile(path.join(outDir, 'pinterest.png'))
  console.log('pinterest fallback brand icon')
}

console.log('done', fs.readdirSync(outDir))
