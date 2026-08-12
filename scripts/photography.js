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

function getPhotoCard (file) {
  const src = `/img/photography/${file}`
  const alt = file.replace(/\.(jpg|jpeg|webp)$/i, '')
  const safeSrc = escapeAttr(src)
  const safeAlt = escapeAttr(alt)
  return `<div class="photo-card">
    <a href="${safeSrc}" data-fancybox="photography" data-caption="${safeAlt}">
      <img src="${safeSrc}" alt="${safeAlt}" loading="lazy" decoding="async">
    </a>
  </div>`
}

function renderPhotoGrid (images) {
  if (!images.length) {
    return '<p class="photo-grid__empty">还没有照片。把 jpg/webp 放到 source/img/photography/ 后重新生成即可。</p>'
  }
  return images.map(getPhotoCard).join('\n')
}

function injectCards (html) {
  if (typeof html !== 'string') return html
  const cards = renderPhotoGrid(getImageFiles())
  if (html.includes('id="photo-grid"')) {
    return html.replace(
      /(<div class="photo-grid"[^>]*>)[\s\S]*?(<\/div>\s*<\/section>)/,
      `$1\n${cards}\n  $2`
    )
  }
  if (html.includes('<!-- photo-list -->')) {
    return html.replace('<!-- photo-list -->', cards)
  }
  return html
}

hexo.extend.filter.register('before_post_render', data => {
  if (data.source !== 'pages/photography.md') return data
  data.content = injectCards(data.content)
  return data
})

hexo.extend.filter.register('after_generate', () => {
  const dest = path.join(hexo.public_dir, 'photography', 'index.html')
  if (!fs.existsSync(dest)) return
  const before = fs.readFileSync(dest, 'utf8')
  const after = injectCards(before)
  if (after !== before) fs.writeFileSync(dest, after)
})
