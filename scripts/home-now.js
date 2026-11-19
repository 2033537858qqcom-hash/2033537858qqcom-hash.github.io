'use strict'

const fs = require('fs')
const path = require('path')

const escapeHtml = value => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

function dateKey (value) {
  if (value instanceof Date) {
    const p = n => String(n).padStart(2, '0')
    return `${value.getUTCFullYear()}-${p(value.getUTCMonth() + 1)}-${p(value.getUTCDate())} ${p(value.getUTCHours())}:${p(value.getUTCMinutes())}:${p(value.getUTCSeconds())}`
  }
  return String(value || '').replace('T', ' ').replace(/\.\d+Z$/, '')
}

function shortDate (value) {
  const m = dateKey(value).match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}.${Number(m[2])}.${Number(m[3])}` : ''
}

function excerptFromMoment (item, maxLen = 62) {
  const text = String((item && item.content) || '')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/^—— 配乐：.*$/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[#>*_`\[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return '随便点开一条就好。'
  const chars = Array.from(text)
  return chars.length > maxLen ? chars.slice(0, maxLen).join('') + '…' : text
}

function getPhotographyFiles () {
  const dir = path.join(hexo.base_dir, 'source', 'img', 'photography')
  try {
    return fs.readdirSync(dir)
      .filter(file => file.toLowerCase().endsWith('.webp'))
      .sort()
  } catch (e) {
    return []
  }
}

function recentPhotos (files, limit = 3) {
  const dated = files.filter(file => /IMG_\d{8}_/.test(file))
  const pool = dated.length >= limit ? dated : files
  const picks = pool.slice(-limit).reverse().map(f => `/img/photography/${f}`)
  return {
    total: files.length,
    picks: picks.length ? picks : ['/img/optimized/cover-day.webp']
  }
}

function renderMomentSnippets (moments) {
  if (!moments.length) {
    return '<li><a href="/moments/"><span>随便点开一条就好。</span></a></li>'
  }
  return moments.map(item => {
    const id = item && item.id ? String(item.id) : dateKey(item && item.date).slice(0, 10).replace(/-/g, '')
    const d = shortDate(item && item.date)
    const excerpt = excerptFromMoment(item, 44)
    return `<li><a href="/moments/#m-${escapeHtml(id)}">${d ? `<time>${escapeHtml(d)}</time>` : ''}<span>${escapeHtml(excerpt)}</span></a></li>`
  }).join('')
}

function renderHomeNow () {
  const data = hexo.locals.get('data') || {}
  const moments = Array.isArray(data.shuoshuo) ? data.shuoshuo.slice() : []
  moments.sort((a, b) => dateKey(b && b.date).localeCompare(dateKey(a && a.date)))
  const latestMoments = moments.slice(0, 2)
  const photoFiles = getPhotographyFiles()
  const { total: photoTotal, picks } = recentPhotos(photoFiles, 3)

  const thumbs = picks.map((src, idx) =>
    `<img src="${escapeHtml(src)}" alt="近期摄影 ${idx + 1}" loading="lazy" decoding="async" width="60" height="60">`
  ).join('')

  return `<section class="home-now" aria-label="近期随笔与风景">
    <div class="home-now__strip">
      <div class="home-now__notes">
        <div class="home-now__row">
          <span class="home-now__label">最近在写</span>
          <a class="home-now__more" href="/moments/">全部随笔 →</a>
        </div>
        <ul class="home-now__list">
          ${renderMomentSnippets(latestMoments)}
        </ul>
      </div>
      <a class="home-now__photos" href="/photography/">
        <div class="home-now__thumbs">${thumbs}</div>
        <span class="home-now__go">光影 · ${photoTotal} 张 →</span>
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
