'use strict'

/**
 * 「人生长廊 · 时间轴」：把 source/_data/timeline.yml 渲染进 source/timeline/index.md。
 * 数据来源（都只读，不改）：
 *   - source/_data/shuoshuo.yml / shuoshuo-comments.yml  随笔节选 + 作者评论
 *   - source/img/photography/                            摄影（已是 webp，直接引用）
 *   - source/_posts                                      重要文章（标题/链接自动取）
 * 节选句子会和原文逐行比对，对不上就在构建时告警，避免写出原文里没有的话。
 */

const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const photoDir = path.join(root, 'source', 'img', 'photography')

const esc = value => String(value == null ? '' : value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

const pad = n => String(n).padStart(2, '0')

function ymd (value) {
  if (value instanceof Date) {
    return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`
  }
  const m = String(value || '').match(/(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : ''
}

const cnDate = s => {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[1]} 年 ${Number(m[2])} 月 ${Number(m[3])} 日` : s
}

function photoMeta (file) {
  const m = file.match(/IMG_(\d{4})(\d{2})(\d{2})_/)
  return m ? { year: m[1], label: `${m[1]} 年 ${Number(m[2])} 月 ${Number(m[3])} 日` } : { year: '', label: '' }
}

function renderPhotos (year, files, warn) {
  const ok = files.filter(f => {
    const exists = fs.existsSync(path.join(photoDir, f))
    if (!exists) warn(`${year}: 照片不存在 ${f}`)
    return exists
  })
  if (!ok.length) return ''
  const cards = ok.map(f => {
    const src = `/img/photography/${encodeURI(f)}`
    const { label } = photoMeta(f)
    return `<a class="tl-photo" href="${esc(src)}" data-fancybox="timeline-${year}" data-caption="${esc(label)}"><img src="${esc(src)}" alt="${esc(label || year + ' 年的照片')}" loading="lazy" decoding="async"><span>${esc(label)}</span></a>`
  }).join('')
  return `<div class="tl-photos tl-photos--${Math.min(ok.length, 6)}">${cards}</div>`
}

function checkLines (lines, source, where, warn) {
  const text = String(source || '')
  for (const line of lines) {
    if (!text.includes(line)) warn(`${where}: 节选在原文里找不到「${line}」`)
  }
}

function renderExcerpt (ex, ctx) {
  const entry = ctx.shuoshuo.get(String(ex.id))
  if (!entry) {
    ctx.warn(`${ctx.year}: 找不到随笔 ${ex.id}`)
    return ''
  }
  if (ctx.denyIds.has(String(ex.id))) {
    ctx.warn(`${ctx.year}: ${ex.id} 在回避名单里，已跳过`)
    return ''
  }
  const lines = Array.isArray(ex.lines) ? ex.lines : []
  checkLines(lines, entry.content, `随笔 ${ex.id}`, ctx.warn)
  const date = ymd(entry.date)
  let commentHtml = ''
  if (ex.comment && Array.isArray(ex.comment.lines)) {
    const joined = (ctx.comments.get(String(ex.id)) || []).join('\n')
    checkLines(ex.comment.lines, joined, `随笔 ${ex.id} 的作者评论`, ctx.warn)
    commentHtml = `<p class="tl-quote__more"><b>接着写</b>${ex.comment.lines.map(esc).join('<br>')}</p>`
  }
  return `<blockquote class="tl-quote">
    <p class="tl-quote__text">${lines.map(esc).join('<br>')}</p>
    ${commentHtml}
    <footer>${ex.label ? `<span>${esc(ex.label)}</span>` : ''}<a href="/moments/" title="去随笔页读全文">${esc(cnDate(date))} · 随笔</a></footer>
  </blockquote>`
}

function renderPosts (posts, ctx) {
  const list = (posts || []).map(name => {
    const post = ctx.posts.find(p => p.source === `_posts/${name}.md`)
    if (!post) {
      ctx.warn(`${ctx.year}: 找不到文章 ${name}`)
      return ''
    }
    const desc = post.description || ''
    return `<li><a href="${esc(ctx.root + post.path)}"><strong>${esc(post.title)}</strong>${desc ? `<span>${esc(desc)}</span>` : ''}<time>${esc(ymd(post.date.toDate ? post.date.toDate() : post.date))}</time></a></li>`
  }).join('')
  return list ? `<div class="tl-block"><h4>重要文章</h4><ul class="tl-posts">${list}</ul></div>` : ''
}

function renderSong (song) {
  if (!song) return ''
  return `<a class="tl-song" href="${esc(song.url)}" target="_blank" rel="noopener noreferrer">
    <span class="tl-song__disc" aria-hidden="true"><i class="fas fa-music"></i></span>
    <span class="tl-song__body"><small>这一年的歌</small><strong>${esc(song.title)}</strong><em>${esc(song.artist)}</em></span>
    <span class="tl-song__go">网易云 <i class="fas fa-arrow-up-right-from-square"></i></span>
  </a>`
}

function renderYear (y, ctx) {
  const c = { ...ctx, year: y.year }
  const photos = renderPhotos(y.year, y.photos || [], ctx.warn)
  const quotes = (y.excerpts || []).map(ex => renderExcerpt(ex, c)).join('')
  const stat = ctx.stats[y.year] || { essays: 0, photos: 0 }
  return `<section class="tl-year" id="y${esc(y.year)}">
    <div class="tl-year__node" aria-hidden="true"></div>
    <header class="tl-year__head">
      <span class="tl-year__num">${esc(y.year)}</span>
      <h3>${esc(y.theme)}</h3>
      <p class="tl-year__stat">${stat.essays} 条随笔 · ${stat.photos} 张照片</p>
    </header>
    <div class="tl-year__body">
      <p class="tl-year__summary">${esc(y.summary)}</p>
      ${y.data_note ? `<p class="tl-year__note">${esc(y.data_note)}</p>` : ''}
      ${photos}
      ${quotes ? `<div class="tl-quotes">${quotes}</div>` : ''}
      ${renderPosts(y.posts, c)}
      ${renderSong(y.song)}
    </div>
  </section>`
}

function buildHtml (hexo) {
  const warn = msg => hexo.log.warn(`[timeline] ${msg}`)
  const data = hexo.locals.get('data') || {}
  const cfg = data.timeline
  if (!cfg || !Array.isArray(cfg.years)) {
    warn('缺少 source/_data/timeline.yml')
    return ''
  }

  const shuoshuo = new Map((data.shuoshuo || []).map(e => [String(e.id), e]))
  const comments = new Map()
  for (const c of data['shuoshuo-comments'] || []) {
    const k = String(c.event)
    if (!comments.has(k)) comments.set(k, [])
    comments.get(k).push(String(c.content || ''))
  }

  // 统计：每年随笔条数 / 摄影张数
  const stats = {}
  const bump = (year, key) => {
    stats[year] = stats[year] || { essays: 0, photos: 0 }
    stats[year][key] += 1
  }
  for (const e of shuoshuo.values()) bump(ymd(e.date).slice(0, 4), 'essays')
  try {
    const seen = new Set()
    for (const f of fs.readdirSync(photoDir)) {
      if (!/\.webp$/i.test(f)) continue
      if (seen.has(f)) continue
      seen.add(f)
      const { year } = photoMeta(f)
      if (year) bump(year, 'photos')
    }
  } catch (e) { warn(`读取摄影目录失败: ${e.message}`) }

  // 回避名单：姥姥相关动态
  const denyIds = new Set(['37956681393'])

  const ctx = {
    warn,
    shuoshuo,
    comments,
    stats,
    denyIds,
    root: hexo.config.root || '/',
    posts: hexo.locals.get('posts').toArray()
  }
  ctx.root = ctx.root.replace(/\/$/, '')

  const years = cfg.years.slice().sort((a, b) => Number(a.year) - Number(b.year))
  const nav = years.map(y => `<a href="#y${esc(y.year)}"><b>${esc(y.year)}</b><span>${esc(y.theme)}</span></a>`).join('')

  return `<div class="timeline-page">
    <header class="tl-hero">
      <p class="tl-hero__eyebrow">Life Corridor</p>
      <p class="tl-hero__intro">${esc(cfg.intro)}</p>
      <p class="tl-hero__tagline">${esc(cfg.tagline)}</p>
      <nav class="tl-hero__nav" aria-label="按年份跳转">${nav}</nav>
    </header>
    <div class="tl-line">${years.map(y => renderYear(y, ctx)).join('')}</div>
    <p class="tl-end">下一年，也会留下痕迹。<span><a href="/moments/">随笔</a> · <a href="/photography/">摄影</a> · <a href="/archives/">文章</a></span></p>
  </div>`
}

hexo.extend.filter.register('before_post_render', data => {
  if (data.source !== 'timeline/index.md') return data
  const html = buildHtml(hexo).replace(/\s*\n\s*/g, '')
  data.content = data.content.replace('<!-- timeline -->', html)
  return data
})
