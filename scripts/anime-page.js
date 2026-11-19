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
  <article class="anime-card" id="anime-${index}">
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

const renderAnimePage = animeList => `
<section class="anime-page">
  <header class="anime-page__header">
    <p>看过、正在追、或是反复想起的故事，留着几句当下的印象。</p>
  </header>

  <div class="anime-grid">
    ${animeList.map(renderAnimeCard).join('')}
  </div>
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
