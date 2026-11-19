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

function monthDayFromValue (value) {
  const m = dateKey(value).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return { month: 0, day: 0 }
  return { month: Number(m[2]), day: Number(m[3]) }
}

function buildSerendipityPool (data, photoFiles) {
  const pool = []
  const seenIds = new Set()
  const moments = Array.isArray(data.shuoshuo) ? data.shuoshuo : []
  const momentById = new Map()
  moments.forEach(item => {
    if (item && item.id != null) momentById.set(String(item.id), item)
  })

  // 1. 优先收录时间轴人工挑选的温暖句子
  const years = data.timeline && Array.isArray(data.timeline.years) ? data.timeline.years : []
  years.forEach(yr => {
    const excerpts = Array.isArray(yr && yr.excerpts) ? yr.excerpts : []
    excerpts.forEach(ex => {
      if (!ex || !ex.id || !Array.isArray(ex.lines) || !ex.lines.length) return
      const id = String(ex.id)
      seenIds.add(id)
      const raw = momentById.get(id)
      const md = raw ? monthDayFromValue(raw.date) : { month: 0, day: 0 }
      const dateStr = raw ? shortDate(raw.date) : String(yr.year || '')
      pool.push({
        kind: 'moment',
        badge: '时光切片',
        meta: [dateStr, ex.label || yr.theme].filter(Boolean).join(' · '),
        month: md.month,
        day: md.day,
        text: ex.lines.slice(0, 2).join('，'),
        url: `/moments/#m-${id}`
      })
    })
  })

  // 2. 补充近期未触发敏感词的轻快随笔
  const avoidRe = /哭|悲|痛|丧|死|病|院|恨|愧疚|遗憾|狼狈|失眠|崩溃|难过|告别|去世|生病/
  let addedMoments = 0
  for (let i = 0; i < moments.length && addedMoments < 20; i += 1) {
    const item = moments[i]
    if (!item || item.standalone) continue
    const id = item.id != null ? String(item.id) : ''
    if (!id || seenIds.has(id)) continue
    const excerpt = excerptFromMoment(item, 68)
    if (!excerpt || excerpt === '随便点开一条就好。' || excerpt.length < 12) continue
    if (avoidRe.test(excerpt)) continue
    seenIds.add(id)
    const md = monthDayFromValue(item.date)
    const song = songOfMoment(item)
    pool.push({
      kind: 'moment',
      badge: '此刻任意门',
      meta: [shortDate(item.date), song ? `配乐 · ${song}` : ''].filter(Boolean).join(' · '),
      month: md.month,
      day: md.day,
      text: excerpt,
      url: `/moments/#m-${id}`
    })
    addedMoments += 1
  }

  // 3. 番剧名句
  const animeList = Array.isArray(data.anime) ? data.anime : []
  animeList.forEach((item, idx) => {
    if (!item || !item.quote) return
    pool.push({
      kind: 'anime',
      badge: '番剧台词',
      meta: [item.title, item.year].filter(Boolean).join(' · '),
      month: 0,
      day: 0,
      text: String(item.quote),
      url: `/anime/#anime-${idx}`
    })
  })

  // 4. 摄影风景按均匀步长抽样
  const datedPhotos = photoFiles.filter(f => /IMG_(\d{4})(\d{2})(\d{2})_/.test(f))
  const sampleCount = Math.min(16, datedPhotos.length)
  for (let i = 0; i < sampleCount; i += 1) {
    const file = datedPhotos[Math.floor((i * datedPhotos.length) / sampleCount)]
    const m = file.match(/IMG_(\d{4})(\d{2})(\d{2})_/)
    if (!m) continue
    const label = `${m[1]}.${Number(m[2])}.${Number(m[3])}`
    pool.push({
      kind: 'photo',
      badge: '光影切片',
      meta: `摄影 · ${label}`,
      month: Number(m[2]),
      day: Number(m[3]),
      text: `${label} 留下来的一帧风景，点开去画廊里慢慢翻。`,
      url: '/photography/',
      img: `/img/photography/${file}`
    })
  }

  return pool
}

function renderSerendipity (pool) {
  if (!pool.length) return ''
  const first = pool[0]
  const safeJson = JSON.stringify(pool).replace(/</g, '\\u003c')
  return `<div class="home-serendipity" id="home-serendipity">
    <a class="home-serendipity__link" id="home-serendipity-link" href="${escapeHtml(first.url)}">
      <div class="home-serendipity__body">
        <div class="home-serendipity__top">
          <span class="home-serendipity__badge" id="home-serendipity-badge">${escapeHtml(first.badge)}</span>
          <span class="home-serendipity__meta" id="home-serendipity-meta">${escapeHtml(first.meta)}</span>
        </div>
        <p class="home-serendipity__text" id="home-serendipity-text">${escapeHtml(first.text)}</p>
      </div>
    </a>
    <button type="button" class="home-serendipity__roll" id="home-serendipity-roll" aria-label="随机翻看下一条记忆">
      <i class="fas fa-sync-alt" aria-hidden="true"></i>
      <span>任意门 · 换一条</span>
    </button>
    <script type="application/json" id="home-serendipity-data">${safeJson}</script>
  </div>`
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
  const photoFiles = getPhotographyFiles()
  const { total: photoTotal, picks } = recentPhotos(photoFiles, 3)
  const serendipityHtml = renderSerendipity(buildSerendipityPool(data, photoFiles))

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
    ${serendipityHtml}
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
