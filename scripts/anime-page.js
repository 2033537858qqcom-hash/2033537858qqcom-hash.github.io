'use strict'

const escapeHtml = value => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

const statusModifier = status => {
  if (status === '反复重温') return 'rewatch'
  if (status === '追番中') return 'watching'
  return 'done'
}

const renderTags = items => {
  if (!Array.isArray(items) || !items.length) return ''
  return items.map(item => `<span>${escapeHtml(item)}</span>`).join('')
}

const renderAnimeCard = (item, index) => `
  <article class="anime-card" id="anime-${index}" data-status="${escapeHtml(item.status || '已看完')}" data-title="${escapeHtml(item.title)}">
    <div class="anime-card__cover">
      <img src="${escapeHtml(item.cover)}" alt="${escapeHtml(item.title)}" loading="lazy" decoding="async" width="480" height="640">
      ${item.status ? `<span class="anime-card__status anime-card__status--${statusModifier(item.status)}">${escapeHtml(item.status)}</span>` : ''}
    </div>
    <div class="anime-card__body">
      <div class="anime-card__meta">
        <span>${escapeHtml(item.year)}</span>
        ${item.rating ? `<span>评分 ${escapeHtml(item.rating)}</span>` : ''}
      </div>
      <h3>${escapeHtml(item.title)}</h3>
      ${item.quote ? `<p class="anime-card__quote">${escapeHtml(item.quote)}</p>` : ''}
      ${item.note ? `<p class="anime-card__note">${escapeHtml(item.note)}</p>` : ''}
      ${Array.isArray(item.characters) && item.characters.length ? `
        <div class="anime-card__section">
          <span class="anime-card__label">角色</span>
          <div class="anime-tags">${renderTags(item.characters)}</div>
        </div>
      ` : ''}
      ${Array.isArray(item.keywords) && item.keywords.length ? `
        <div class="anime-card__section">
          <span class="anime-card__label">关键词</span>
          <div class="anime-tags">${renderTags(item.keywords)}</div>
        </div>
      ` : ''}
    </div>
  </article>
`

const renderToolbar = animeList => {
  const counts = new Map()
  animeList.forEach(item => {
    const status = (item && item.status) || '已看完'
    counts.set(status, (counts.get(status) || 0) + 1)
  })
  const order = ['反复重温', '追番中', '已看完']
  const pills = order
    .filter(s => counts.get(s) > 0)
    .map(s => `<button type="button" class="anime-filter" aria-pressed="false" data-anime-status="${escapeHtml(s)}">${escapeHtml(s)}<span>${counts.get(s)}</span></button>`)
    .join('')

  return `<div class="anime-toolbar">
    <div class="anime-filters" role="group" aria-label="按观看状态筛选">
      <button type="button" class="anime-filter is-active" aria-pressed="true" data-anime-status="">全部<span>${animeList.length}</span></button>
      ${pills}
    </div>
    <button type="button" class="anime-pick" id="anime-pick-btn">
      <i class="fas fa-star" aria-hidden="true"></i>
      <span>手气挑一部</span>
    </button>
  </div>`
}

const renderAnimePage = animeList => `
<section class="anime-page">
  <header class="anime-page__header">
    <p class="anime-page__eyebrow">Anime Log</p>
    <h2>番剧记录</h2>
    <p>看过、正在追、或是反复想起的作品。不必按顺序，挑一部有缘的读两句印象就好。</p>
    ${renderToolbar(animeList)}
  </header>

  <div class="anime-grid">
    ${animeList.map(renderAnimeCard).join('')}
  </div>
  <p class="anime-empty" hidden>这一类下还没有收录番剧。</p>
</section>
`

hexo.extend.filter.register('before_post_render', data => {
  if (data.source !== 'anime/index.md') return data

  const animeList = hexo.locals.get('data').anime || []
  const html = renderAnimePage(animeList)
    .replace(/>\s*\n\s*</g, '><')
    .replace(/\s*\n\s*/g, ' ')
  data.content = data.content.replace('<!-- anime-list -->', html)
  return data
})
