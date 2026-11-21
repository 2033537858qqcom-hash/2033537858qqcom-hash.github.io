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

function renderMomentClouds (moments) {
  if (!moments.length) {
    return `<a class="home-now__cloud home-now__cloud--moment" href="/moments/">
      <div class="home-now__cloud-head">
        <span class="home-now__badge">随笔</span>
      </div>
      <p class="home-now__quote">短句、雨天、一时兴起，随便点开一条就好。</p>
      <span class="home-now__foot">去翻随笔 →</span>
    </a>`
  }
  return moments.map((item, idx) => {
    const id = item && item.id ? String(item.id) : dateKey(item && item.date).slice(0, 10).replace(/-/g, '')
    const d = shortDate(item && item.date)
    const excerpt = excerptFromMoment(item, 64)
    const label = idx === 0 ? '最新随笔' : '前些天写下'
    return `<a class="home-now__cloud home-now__cloud--moment home-now__cloud--m${idx + 1}" href="/moments/#m-${escapeHtml(id)}">
      <div class="home-now__cloud-head">
        <span class="home-now__badge">${label}</span>
        ${d ? `<time>${escapeHtml(d)}</time>` : ''}
      </div>
      <p class="home-now__quote">${escapeHtml(excerpt)}</p>
      <span class="home-now__foot">吹吹风 · 读全文 →</span>
    </a>`
  }).join('')
}

function renderHomeNow () {
  const data = hexo.locals.get('data') || {}
  const moments = Array.isArray(data.shuoshuo) ? data.shuoshuo.slice() : []
  moments.sort((a, b) => dateKey(b && b.date).localeCompare(dateKey(a && a.date)))
  const latestMoments = moments.slice(0, 2)
  const momentTotal = moments.length || 100
  const photoFiles = getPhotographyFiles()
  const { total: photoTotal, picks } = recentPhotos(photoFiles, 3)

  const thumbs = picks.map((src, idx) =>
    `<span class="home-now__polaroid home-now__polaroid--${idx + 1}"><img src="${escapeHtml(src)}" alt="近期摄影 ${idx + 1}" loading="lazy" decoding="async" width="76" height="76"></span>`
  ).join('')

  return `<section class="home-now" aria-label="近期随笔与风景">
    <div class="home-now__clouds">
      ${renderMomentClouds(latestMoments)}
      <div class="home-now__cloud home-now__cloud--photos">
        <a class="home-now__photo-stage" href="/photography/" aria-label="浏览全部 ${photoTotal} 张摄影">
          <div class="home-now__polaroids">${thumbs}</div>
          <div class="home-now__photo-meta">
            <span class="home-now__badge home-now__badge--sky">定格光影</span>
            <span class="home-now__go">${photoTotal} 帧风景 →</span>
          </div>
        </a>
        <div class="home-now__quick">
          <a href="/moments/">随笔 ${momentTotal} 则</a>
          <span aria-hidden="true">·</span>
          <a href="/timeline/">人生长廊</a>
          <span aria-hidden="true">·</span>
          <a href="/anime/">追番</a>
        </div>
      </div>
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
