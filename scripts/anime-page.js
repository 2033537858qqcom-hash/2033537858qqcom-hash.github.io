'use strict'

const escapeHtml = value => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

const renderTags = items => {
  if (!Array.isArray(items) || !items.length) return ''

  return items.map(item => `<span>${escapeHtml(item)}</span>`).join('')
}

const renderAnimeCard = item => `
  <article class="anime-card">
    <div class="anime-card__cover">
      <img src="${escapeHtml(item.cover)}" alt="${escapeHtml(item.title)}">
      <span class="anime-card__status">${escapeHtml(item.status)}</span>
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
    <p class="anime-page__eyebrow">Anime Log</p>
    <h2>番剧记录</h2>
    <p>这里记录看过、想看和反复想起的番剧。条目来自 <code>source/_data/anime.yml</code>，以后只要维护数据，页面会自动更新。</p>
  </header>

  <div class="anime-grid">
    ${animeList.map(renderAnimeCard).join('')}
  </div>
</section>
`

hexo.extend.filter.register('before_post_render', data => {
  if (data.source !== 'anime/index.md') return data

  const animeList = hexo.locals.get('data').anime || []
  const html = renderAnimePage(animeList).replace(/\s*\n\s*/g, '')
  data.content = data.content.replace('<!-- anime-list -->', html)
  return data
})
