/**
 * 随笔按年成章：最近一年摊开，往年只留年份。
 * 不改主题分页脚本，等它写完后再用同一份数据重排。
 */
(function () {
  const isMoments = () => /\/moments\/?$/.test(window.location.pathname)
  const AVATAR = '/img/avatar.jpg'
  const AUTHOR = 'Rogue_l'

  const escapeHtml = value => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

  const yearOf = item => {
    const match = String(item.date || '').match(/^(\d{4})/)
    return match ? match[1] : '未标注'
  }

  const formatDate = dateStr => {
    const match = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (!match) return ''
    return match[1] + ' 年 ' + Number(match[2]) + ' 月 ' + Number(match[3]) + ' 日'
  }

  const renderItem = item => {
    const tags = Array.isArray(item.tags)
      ? item.tags.map(tag => '<span class="shuoshuo-tag">' + escapeHtml(tag) + '</span>').join('')
      : ''
    const commentButton = item.key
      ? '<div class="shuoshuo-comment-btn" onclick="addCommentToShuoshuo(event)"><i class="fa-solid fa-comments"></i></div>'
      : ''
    const commentBox = item.key
      ? '<div class="shuoshuo-comment no-comment" data-key="' + escapeHtml(item.key) + '"></div>'
      : ''

    return '<article class="shuoshuo-item">' +
      '<div class="container">' +
        '<div class="shuoshuo-item-header">' +
          '<div class="shuoshuo-avatar"><img class="no-lightbox" src="' + escapeHtml(item.avatar || AVATAR) + '" alt=""></div>' +
          '<div class="shuoshuo-info">' +
            '<div class="shuoshuo-author">' + escapeHtml(item.author || AUTHOR) + '</div>' +
            '<time class="shuoshuo-date">' + escapeHtml(formatDate(item.date)) + '</time>' +
          '</div>' +
        '</div>' +
        '<div class="shuoshuo-content">' + (item.content || '') + '</div>' +
        '<div class="shuoshuo-footer ' + (tags ? 'flex-between' : 'flex-end') + '">' +
          (tags ? '<div class="shuoshuo-tags">' + tags + '</div>' : '') +
          commentButton +
        '</div>' +
      '</div>' +
      commentBox +
    '</article>'
  }

  const render = data => {
    const groups = new Map()
    data.forEach(item => {
      const year = yearOf(item)
      if (!groups.has(year)) groups.set(year, [])
      groups.get(year).push(item)
    })

    const years = [...groups.keys()].sort((a, b) => {
      if (a === '未标注') return 1
      if (b === '未标注') return -1
      return Number(b) - Number(a)
    })
    const latest = years.find(year => year !== '未标注') || years[0]

    const lead = '<div class="content-lead">' +
      '<p class="content-lead__eyebrow">Moments</p>' +
      '<p>短句、雨天、一时兴起。近年摊开，往年折进年份里——<strong>随便点开一条</strong>就好。</p>' +
    '</div>'

    const chapters = years.map(year => {
      const items = groups.get(year)
      const open = year === latest ? ' open' : ''
      const name = year === '未标注' ? '未写日期' : year
      return '<details class="moment-year"' + open + '>' +
        '<summary>' +
          '<span class="moment-year__name">' + escapeHtml(name) + '</span>' +
          '<span class="moment-year__count">' + items.length + ' 则</span>' +
        '</summary>' +
        '<div class="moment-year__list">' + items.map(renderItem).join('') + '</div>' +
      '</details>'
    }).join('')

    return lead + chapters
  }

  const apply = () => {
    if (!isMoments()) return false
    const dataEl = document.getElementById('shuoshuo-data')
    const container = document.getElementById('article-container')
    if (!dataEl || !container) return false
    if (container.querySelector('.moment-year')) return true

    let data = []
    try {
      data = JSON.parse(dataEl.textContent || '[]')
    } catch (e) {
      return false
    }
    if (!Array.isArray(data) || !data.length) return false

    data = data.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    container.innerHTML = render(data)

    const nav = container.nextElementSibling
    if (nav && nav.classList.contains('shuoshuo-navigation')) nav.remove()
    document.querySelectorAll('.shuoshuo-navigation').forEach(el => el.remove())

    if (window.lazyLoadInstance) window.lazyLoadInstance.update()
    if (window.btf && typeof window.btf.loadLightbox === 'function') {
      window.btf.loadLightbox(document.querySelectorAll('#article-container img:not(.no-lightbox)'))
    }
    return true
  }

  const watch = () => {
    if (!isMoments()) return
    apply()
    const container = document.getElementById('article-container')
    if (!container || container.__momentsYearsWatch) return
    container.__momentsYearsWatch = true
    const observer = new MutationObserver(() => {
      if (!container.querySelector('.moment-year')) apply()
    })
    observer.observe(container, { childList: true })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watch)
  } else {
    watch()
  }
  window.addEventListener('load', () => window.setTimeout(apply, 0))
  document.addEventListener('pjax:complete', () => window.setTimeout(watch, 0))
})()
