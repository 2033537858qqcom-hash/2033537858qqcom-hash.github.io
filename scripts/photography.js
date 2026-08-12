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

function parsePhotoDate (file) {
  const shot = file.match(/IMG_(\d{4})(\d{2})(\d{2})_/)
  if (shot) {
    return {
      year: shot[1],
      month: shot[2],
      day: shot[3],
      label: `${shot[1]} 年 ${Number(shot[2])} 月`
    }
  }
  return { year: '未标注', month: '', day: '', label: '日子未写进文件名' }
}

function getPhotoCard (file) {
  const src = `/img/photography/${file}`
  const meta = parsePhotoDate(file)
  const safeSrc = escapeAttr(src)
  const safeCaption = escapeAttr(meta.label)
  return `<div class="photo-card">
    <a href="${safeSrc}" data-fancybox="photography" data-caption="${safeCaption}">
      <img src="${safeSrc}" alt="${safeCaption}" loading="lazy" decoding="async">
    </a>
  </div>`
}

function renderAlbum (images) {
  if (!images.length) {
    return '<p class="photo-grid__empty">还没有照片。把 jpg/webp 放到 source/img/photography/ 后重新生成即可。</p>'
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

  return years.map(year => {
    const files = groups.get(year)
    const title = year === '未标注' ? '未标注日期' : `${year}`
    const cards = files.map(getPhotoCard).join('\n')
    return `<section class="photo-year">
      <header class="photo-year__head">
        <h3>${escapeAttr(title)}</h3>
        <p>${files.length} 张</p>
      </header>
      <div class="photo-grid">${cards}</div>
    </section>`
  }).join('\n')
}

function injectAlbum (html) {
  if (typeof html !== 'string') return html
  const album = renderAlbum(getImageFiles())
  if (html.includes('id="photo-album"')) {
    return html.replace(
      /(<div class="photo-album"[^>]*>)[\s\S]*?(<\/div>\s*<\/section>)/,
      `$1\n${album}\n  $2`
    )
  }
  if (html.includes('id="photo-grid"')) {
    return html.replace(
      /(<div class="photo-grid"[^>]*>)[\s\S]*?(<\/div>\s*<\/section>)/,
      `$1\n${album}\n  $2`
    )
  }
  if (html.includes('<!-- photo-list -->')) {
    return html.replace('<!-- photo-list -->', album)
  }
  return html
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
