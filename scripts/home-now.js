'use strict'

const fs = require('fs')
const path = require('path')

const escapeHtml = value => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

function excerptFromMoment (item) {
  const text = String((item && item.content) || '')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/[#>*_`\[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return '随便点开一条就好。'
  return text.length > 88 ? text.slice(0, 88) + '…' : text
}

function featuredPhoto () {
  const dir = path.join(hexo.base_dir, 'source', 'img', 'photography')
  try {
    const files = fs.readdirSync(dir)
      .filter(file => file.toLowerCase().endsWith('.webp'))
      .sort()
    const dated = files.filter(file => /IMG_\d{8}_/.test(file))
    const pick = dated.length ? dated[dated.length - 1] : files[files.length - 1]
    return pick ? `/img/photography/${pick}` : '/img/optimized/cover-day.webp'
  } catch (e) {
    return '/img/optimized/cover-day.webp'
  }
}

function renderHomeNow () {
  const data = hexo.locals.get('data') || {}
  const moments = Array.isArray(data.shuoshuo) ? data.shuoshuo : []
  const excerpt = excerptFromMoment(moments[0])
  const photo = featuredPhoto()

  return `<section class="home-now" aria-label="此刻">
    <p class="home-now__eyebrow">此刻</p>
    <div class="home-now__grid">
      <a class="home-now__card home-now__card--moment" href="/moments/">
        <span class="home-now__label">随笔</span>
        <p>${escapeHtml(excerpt)}</p>
        <span class="home-now__go">去读</span>
      </a>
      <a class="home-now__card home-now__card--photo" href="/photography/">
        <img src="${escapeHtml(photo)}" alt="最近一张照片" loading="lazy" decoding="async">
        <span class="home-now__label">摄影</span>
        <span class="home-now__go">去看</span>
      </a>
    </div>
  </section>`
}

function injectHomeNow (html) {
  if (typeof html !== 'string' || html.includes('class="home-now"')) return html
  if (!html.includes('id="recent-posts"')) return html
  return html.replace(
    /(<div class="recent-posts[^"]*" id="recent-posts">)/,
    `$1\n${renderHomeNow()}\n`
  )
}

hexo.extend.filter.register('after_render:html', (str, data) => {
  const file = (data && (data.path || data.url)) || ''
  if (file && file !== 'index.html' && file !== '/index.html') return str
  if (!str.includes('id="recent-posts"') || !str.includes('full_page')) return str
  return injectHomeNow(str)
})

hexo.extend.filter.register('after_generate', () => {
  const dest = path.join(hexo.public_dir, 'index.html')
  if (!fs.existsSync(dest)) return
  const before = fs.readFileSync(dest, 'utf8')
  const after = injectHomeNow(before)
  if (after !== before) fs.writeFileSync(dest, after)
})
