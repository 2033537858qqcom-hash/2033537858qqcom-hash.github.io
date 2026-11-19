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

function songOfMoment (item) {
  const m = String((item && item.content) || '').match(/^—— 配乐：\[([^\]]+)\]/m)
  return m ? m[1] : ''
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

function recentPhotos (limit = 3) {
  const dir = path.join(hexo.base_dir, 'source', 'img', 'photography')
  try {
    const files = fs.readdirSync(dir)
      .filter(file => file.toLowerCase().endsWith('.webp'))
      .sort()
    const dated = files.filter(file => /IMG_\d{8}_/.test(file))
    const pool = dated.length >= limit ? dated : files
    const picks = pool.slice(-limit).reverse().map(f => `/img/photography/${f}`)
    return {
      total: files.length,
      picks: picks.length ? picks : ['/img/optimized/cover-day.webp']
    }
  } catch (e) {
    return { total: 0, picks: ['/img/optimized/cover-day.webp'] }
  }
}

function renderMomentSnippets (moments) {
  if (!moments.length) {
    return '<a class="home-now__entry" href="/moments/"><p>随便点开一条就好。</p></a>'
  }
  return moments.map(item => {
    const id = item && item.id ? String(item.id) : dateKey(item && item.date).slice(0, 10).replace(/-/g, '')
    const d = shortDate(item && item.date)
    const song = songOfMoment(item)
    const excerpt = excerptFromMoment(item, 58)
    return `<a class="home-now__entry" href="/moments/#m-${escapeHtml(id)}">
      <div class="home-now__entry-meta">
        ${d ? `<time>${escapeHtml(d)}</time>` : ''}
        ${song ? `<span class="home-now__song"><i class="fas fa-music" aria-hidden="true"></i> ${escapeHtml(song)}</span>` : ''}
      </div>
      <p>${escapeHtml(excerpt)}</p>
    </a>`
  }).join('')
}

function renderHomeNow () {
  const data = hexo.locals.get('data') || {}
  const moments = Array.isArray(data.shuoshuo) ? data.shuoshuo.slice() : []
  moments.sort((a, b) => dateKey(b && b.date).localeCompare(dateKey(a && a.date)))
  const latestMoments = moments.slice(0, 2)
  const animeCount = Array.isArray(data.anime) ? data.anime.length : 0
  const { total: photoTotal, picks } = recentPhotos(3)

  const collageImgs = picks.map((src, idx) =>
    `<img src="${escapeHtml(src)}" alt="近期摄影 ${idx + 1}" loading="lazy" decoding="async">`
  ).join('')

  return `<section class="home-now" aria-label="此刻">
    <div class="home-now__head">
      <p class="home-now__eyebrow"><i class="fas fa-star" aria-hidden="true"></i> 此刻 · 生活切片</p>
      <div class="home-now__quick">
        <a href="/moments/">随笔 ${moments.length}</a>
        <a href="/photography/">摄影 ${photoTotal}</a>
        <a href="/timeline/">人生长廊</a>
      </div>
    </div>
    <div class="home-now__grid">
      <div class="home-now__card home-now__card--moment">
        <div class="home-now__card-top">
          <span class="home-now__label">最近随笔</span>
          <a class="home-now__more" href="/moments/">读全部 <i class="fas fa-angle-right" aria-hidden="true"></i></a>
        </div>
        <div class="home-now__entries">
          ${renderMomentSnippets(latestMoments)}
        </div>
      </div>
      <a class="home-now__card home-now__card--photo" href="/photography/">
        <div class="home-now__collage home-now__collage--${Math.min(picks.length, 3)}">
          ${collageImgs}
        </div>
        <div class="home-now__photo-caption">
          <span class="home-now__label">摄影集 · ${photoTotal} 张风景</span>
          <span class="home-now__go">去翻看 <i class="fas fa-angle-right" aria-hidden="true"></i></span>
        </div>
      </a>
    </div>
    <div class="home-now__portals">
      <a class="home-now__portal" href="/timeline/">
        <i class="fas fa-route" aria-hidden="true"></i>
        <span><strong>人生长廊</strong><small>2023–2026 年份时间轴</small></span>
      </a>
      <a class="home-now__portal" href="/anime/">
        <i class="fas fa-tv" aria-hidden="true"></i>
        <span><strong>番剧记录</strong><small>${animeCount} 部看过的故事</small></span>
      </a>
      <a class="home-now__portal" href="/music/">
        <i class="fas fa-headphones" aria-hidden="true"></i>
        <span><strong>常听歌单</strong><small>网易云与站内播放器</small></span>
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
