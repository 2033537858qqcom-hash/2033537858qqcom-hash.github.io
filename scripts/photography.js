'use strict'

const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const sourceDir = path.join(root, 'source', 'img', 'photography')

const escapeAttr = value => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')

function getImageFiles () {
  try {
    const files = fs.readdirSync(sourceDir)
    const byStem = new Map()

    for (const file of files) {
      const ext = path.extname(file).toLowerCase()
      if (ext !== '.jpg' && ext !== '.jpeg' && ext !== '.webp') continue
      const stem = file.slice(0, -ext.length).toLowerCase()
      const prev = byStem.get(stem)
      if (!prev || ext === '.webp') byStem.set(stem, file)
    }

    return [...byStem.values()].sort((a, b) => a.localeCompare(b, 'en'))
  } catch (e) {
    console.error('[photography] error reading dir:', e.message)
    return []
  }
}

/** 从 WebP/JPEG 文件头读取宽高，避免瀑布流 CLS 布局抖动 */
function getImageDimensions (filePath) {
  try {
    const fd = fs.openSync(filePath, 'r')
    const buf = Buffer.alloc(65536)
    const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0)
    fs.closeSync(fd)
    const data = buf.subarray(0, bytesRead)

    // WebP (RIFF....WEBP)
    if (
      data.length >= 30 &&
      data.toString('ascii', 0, 4) === 'RIFF' &&
      data.toString('ascii', 8, 12) === 'WEBP'
    ) {
      const chunk = data.toString('ascii', 12, 16)
      if (chunk === 'VP8X' && data.length >= 30) {
        const w = 1 + data.readUIntLE(24, 3)
        const h = 1 + data.readUIntLE(27, 3)
        return { width: w, height: h }
      }
      if (chunk === 'VP8 ' && data.length >= 30) {
        const w = data.readUInt16LE(26) & 0x3fff
        const h = data.readUInt16LE(28) & 0x3fff
        return { width: w, height: h }
      }
      if (chunk === 'VP8L' && data.length >= 25) {
        const bits = data.readUInt32LE(21)
        const w = (bits & 0x3fff) + 1
        const h = ((bits >> 14) & 0x3fff) + 1
        return { width: w, height: h }
      }
    }

    // JPEG (SOI FF D8 -> SOF0..SOF3)
    if (data.length >= 4 && data[0] === 0xff && data[1] === 0xd8) {
      let offset = 2
      while (offset + 4 < data.length) {
        if (data[offset] !== 0xff) {
          offset += 1
          continue
        }
        const marker = data[offset + 1]
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
          offset += 2
          continue
        }
        if (marker === 0xd9 || marker === 0xda) break
        const len = data.readUInt16BE(offset + 2)
        if (
          (marker === 0xc0 || marker === 0xc1 || marker === 0xc2 || marker === 0xc3) &&
          offset + 9 < data.length
        ) {
          const h = data.readUInt16BE(offset + 5)
          const w = data.readUInt16BE(offset + 7)
          return { width: w, height: h }
        }
        if (len < 2) break
        offset += 2 + len
      }
    }
  } catch (e) {
    /* ignore */
  }
  return null
}

function parsePhotoDate (file) {
  const shot = file.match(/IMG_(\d{4})(\d{2})(\d{2})_/)
  if (shot) {
    return {
      year: shot[1],
      month: shot[2],
      day: shot[3],
      label: `${shot[1]} 年 ${Number(shot[2])} 月 ${Number(shot[3])} 日`
    }
  }
  return { year: '未标注', month: '', day: '', label: '日子未写进文件名' }
}

function getPhotoCard (file, indexInYear) {
  const src = `/img/photography/${file}`
  const meta = parsePhotoDate(file)
  const dims = getImageDimensions(path.join(sourceDir, file))
  const sizeAttrs = dims && dims.width && dims.height
    ? ` width="${dims.width}" height="${dims.height}"`
    : ''
  const alt = meta.year === '未标注'
    ? `未标注日期的摄影作品 #${indexInYear + 1}`
    : `${meta.label} 摄影 #${indexInYear + 1}`
  const safeSrc = escapeAttr(src)
  const safeCaption = escapeAttr(meta.label)
  const safeAlt = escapeAttr(alt)
  return `<div class="photo-card"><a href="${safeSrc}" data-fancybox="photography" data-caption="${safeCaption}"><img src="${safeSrc}" alt="${safeAlt}"${sizeAttrs} loading="lazy" decoding="async"></a></div>`
}

function renderAlbum (images) {
  if (!images.length) {
    return '<p class="photo-grid__empty">还没有照片。把 webp 放到 source/img/photography/ 后重新生成即可。</p>'
  }

  const groups = new Map()
  for (const file of images) {
    const { year } = parsePhotoDate(file)
    if (!groups.has(year)) groups.set(year, [])
    groups.get(year).push(file)
  }

  const years = [...groups.keys()].sort((a, b) => {
    if (a === '未标注') return 1
    if (b === '未标注') return -1
    return Number(b) - Number(a)
  })

  const yearSlug = year => (year === '未标注' ? 'unknown' : String(year))

  const navPills = years.map(year => {
    const label = year === '未标注' ? '未标注' : `${year}`
    return `<a class="photo-nav__link" href="#photo-year-${escapeAttr(yearSlug(year))}">${escapeAttr(label)}</a>`
  }).join('')

  const sections = years.map(year => {
    const files = groups.get(year)
    const title = year === '未标注' ? '未标注日期' : `${year}`
    const cards = files.map((file, idx) => getPhotoCard(file, idx)).join('')
    return `<section class="photo-year" id="photo-year-${escapeAttr(yearSlug(year))}"><header class="photo-year__head"><h3>${escapeAttr(title)}</h3><p>${files.length} 张</p></header><div class="photo-grid">${cards}</div></section>`
  }).join('')

  return `<nav class="photo-nav" aria-label="年份索引">${navPills}</nav>${sections}`
}

function injectAlbum (html) {
  if (typeof html !== 'string') return html
  // 防止 before_post_render 与 after_generate 重复注入
  if (html.includes('class="photo-year"') || html.includes('class="photo-card"') || html.includes('photo-grid__empty')) {
    return html
  }
  if (!html.includes('<!-- photo-list -->')) return html
  const album = renderAlbum(getImageFiles())
  return html.replace('<!-- photo-list -->', album)
}

hexo.extend.filter.register('before_post_render', data => {
  if (data.source !== 'pages/photography.md') return data
  data.content = injectAlbum(data.content)
  return data
})

hexo.extend.filter.register('after_generate', () => {
  const dest = path.join(hexo.public_dir, 'photography', 'index.html')
  if (!fs.existsSync(dest)) return
  const before = fs.readFileSync(dest, 'utf8')
  const after = injectAlbum(before)
  if (after !== before) fs.writeFileSync(dest, after)
})
