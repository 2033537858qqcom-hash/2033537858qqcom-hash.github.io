/**
 * 随笔按年、再按月成章：只展开最近一个月，更早的月份折起。
 * 不改主题分页脚本，等它写完后再用同一份数据重排。
 */
(function () {
  const isMoments = () => /\/moments\/?$/.test(window.location.pathname)
  const AVATAR = '/img/avatar.jpg'
  const AUTHOR = 'Rogue_l'
  const HIDDEN_TAGS = new Set(['随笔', '配乐', '配图'])
  let cachedData = null

  const readData = () => {
    if (cachedData) return cachedData
    const dataEl = document.getElementById('shuoshuo-data')
    if (!dataEl) return null
    try {
      const parsed = JSON.parse(dataEl.textContent || '[]')
      cachedData = Array.isArray(parsed) ? parsed : []
    } catch (e) {
      cachedData = []
    }
    return cachedData
  }

  readData()

  const escapeHtml = value => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

  const yearOf = item => {
    const match = String(item.date || '').match(/^(\d{4})/)
    return match ? match[1] : '未标注'
  }

  const monthOf = item => {
    const match = String(item.date || '').match(/^\d{4}-(\d{2})/)
    return match ? match[1] : '00'
  }

  const formatDate = dateStr => {
    const match = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))/)
    if (!match) return ''
    const clock = match[4] ? ' ' + match[4] + ':' + match[5] : ''
    return match[1] + ' 年 ' + Number(match[2]) + ' 月 ' + Number(match[3]) + ' 日' + clock
  }

  const visibleTags = item => (Array.isArray(item.tags) ? item.tags : []).filter(tag => !HIDDEN_TAGS.has(tag))

  const nl2br = value => escapeHtml(value).replace(/\n/g, '<br>')

  const shortTime = dateStr => {
    const match = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/)
    if (!match) return ''
    return match[1] + '.' + Number(match[2]) + '.' + Number(match[3]) + (match[4] ? ' ' + match[4] + ':' + match[5] : '')
  }

  // 李 自己的评论：同一条动态的评论合并成一组，按时间排列，默认展开；超过 5 条先显示前 3 条
  const OWN_PREVIEW = 3
  const OWN_LIMIT = 5
  const renderOwnItem = (c, withKind) => {
    const kindTag = withKind
      ? '<span class="shuoshuo-own__kind shuoshuo-own__kind--' + (c.kind === 'continue' ? 'continue' : 'note') + '">' +
        (c.kind === 'continue' ? '接着写' : '后来补的') + '</span>'
      : ''
    return '<li class="shuoshuo-own__item" data-cid="' + escapeHtml(c.cid) + '">' +
      '<div class="shuoshuo-own__meta"><time datetime="' + escapeHtml(String(c.date).replace(' ', 'T')) + '">' +
      escapeHtml(shortTime(c.date)) + '</time>' + kindTag +
      (c.reply_to ? '<span class="shuoshuo-own__to">回 ' + escapeHtml(c.reply_to) + '</span>' : '') + '</div>' +
      '<div class="shuoshuo-own__text">' + nl2br(c.content) + '</div></li>'
  }

  const renderOwnList = (list, withKind) => {
    const sorted = list.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)))
    if (sorted.length <= OWN_LIMIT) {
      return '<ol class="shuoshuo-own__list">' + sorted.map(c => renderOwnItem(c, withKind)).join('') + '</ol>'
    }
    const rest = sorted.slice(OWN_PREVIEW)
    return '<ol class="shuoshuo-own__list">' + sorted.slice(0, OWN_PREVIEW).map(c => renderOwnItem(c, withKind)).join('') + '</ol>' +
      '<details class="shuoshuo-own__more"><summary>展开全部（还有 ' + rest.length + ' 条）</summary>' +
      '<ol class="shuoshuo-own__list" start="' + (OWN_PREVIEW + 1) + '">' + rest.map(c => renderOwnItem(c, withKind)).join('') + '</ol></details>'
  }

  const renderOwnComments = item => {
    const list = Array.isArray(item.comments) ? item.comments : []
    if (!list.length) return ''
    return '<section class="shuoshuo-own" aria-label="作者的评论">' +
      '<h4 class="shuoshuo-own__title">作者的评论<span>（' + list.length + '）</span></h4>' +
      renderOwnList(list, true) + '</section>'
  }

  const trimText = (value, max) => {
    const chars = Array.from(String(value || '').replace(/\s+/g, ' ').trim())
    return chars.length > max ? chars.slice(0, max).join('') + '…' : chars.join('')
  }

  // 父动态不在随笔里：同一条父动态的评论合并成一条，头部写明评论的是什么
  const renderStandalone = item => {
    const list = Array.isArray(item.comments) ? item.comments : []
    const datetime = escapeHtml(String(item.date || '').replace(' ', 'T'))
    const title = item.parent_title ? '《' + escapeHtml(item.parent_title) + '》' : ''
    const excerpt = item.parent_excerpt ? escapeHtml(trimText(item.parent_excerpt, 60)) : ''
    const subject = excerpt
      ? '“' + excerpt + '”' + (title ? '<span class="shuoshuo-group__song">配乐 ' + title + '</span>' : '')
      : (title ? '分享单曲 ' + title : '一条动态')
    return '<article class="shuoshuo-item shuoshuo-item--comment-group" data-tags="" data-event="' + escapeHtml(item.event || '') + '">' +
      '<div class="container">' +
        '<header class="shuoshuo-group__head">' +
          '<p class="shuoshuo-group__label">评论 · ' + list.length + ' 条，评论的是我的这条动态' +
            (item.parent_date ? '（' + escapeHtml(shortTime(item.parent_date)) + '）' : '') + '</p>' +
          '<p class="shuoshuo-group__parent">' + subject + '</p>' +
        '</header>' +
        '<div class="shuoshuo-content">' +
          '<section class="shuoshuo-own" aria-label="作者的评论">' +
            '<h4 class="shuoshuo-own__title">作者的评论<span>（' + list.length + '）</span>' +
              '<time datetime="' + datetime + '">最近 ' + escapeHtml(shortTime(item.date)) + '</time></h4>' +
            renderOwnList(list, false) +
          '</section>' +
          '<p class="shuoshuo-comment-origin"><a href="' + escapeHtml(item.link || '#') + '" target="_blank" rel="noopener noreferrer">在网易云看原动态</a></p>' +
        '</div>' +
      '</div>' +
    '</article>'
  }

  const renderItem = item => {
    if (item.standalone) return renderStandalone(item)
    const tags = visibleTags(item)
    const tagHtml = tags.length
      ? tags.map(tag => '<span class="shuoshuo-tag">' + escapeHtml(tag) + '</span>').join('')
      : ''
    const commentButton = item.key
      ? '<div class="shuoshuo-comment-btn" onclick="addCommentToShuoshuo(event)"><i class="fa-solid fa-comments"></i></div>'
      : ''
    const commentBox = item.key
      ? '<div class="shuoshuo-comment no-comment" data-key="' + escapeHtml(item.key) + '"></div>'
      : ''
    const datetime = escapeHtml(String(item.date || '').replace(' ', 'T'))

    return '<article class="shuoshuo-item" data-tags="' + escapeHtml(tags.join('|')) + '">' +
      '<div class="container">' +
        '<div class="shuoshuo-item-header">' +
          '<div class="shuoshuo-avatar"><img class="no-lightbox" src="' + escapeHtml(item.avatar || AVATAR) + '" alt=""></div>' +
          '<div class="shuoshuo-info">' +
            '<div class="shuoshuo-author">' + escapeHtml(item.author || AUTHOR) + '</div>' +
            '<time class="shuoshuo-date" datetime="' + datetime + '">' + escapeHtml(formatDate(item.date)) + '</time>' +
          '</div>' +
        '</div>' +
        '<div class="shuoshuo-content">' + (item.content || '') + renderOwnComments(item) + '</div>' +
        '<div class="shuoshuo-footer ' + (tagHtml ? 'flex-between' : 'flex-end') + '">' +
          (tagHtml ? '<div class="shuoshuo-tags">' + tagHtml + '</div>' : '') +
          commentButton +
        '</div>' +
      '</div>' +
      commentBox +
    '</article>'
  }

  const renderMonths = (year, months, newestYear, newestMonth) => {
    const keys = [...months.keys()].sort((a, b) => Number(b) - Number(a))
    return keys.map(month => {
      const items = months.get(month)
      const essays = items.filter(i => !i.standalone).length
      const groupsN = items.length - essays
      const open = year === newestYear && month === newestMonth
      const label = month === '00' ? '未写月份' : Number(month) + ' 月'
      return '<details class="moment-month"' + (open ? ' open' : '') + ' data-open-default="' + (open ? '1' : '0') + '">' +
        '<summary>' +
          '<span class="moment-month__name">' + escapeHtml(label) + '</span>' +
          '<span class="moment-year__count">' + essays + ' 则' + (groupsN ? ' · ' + groupsN + ' 组评论' : '') + '</span>' +
        '</summary>' +
        '<div class="moment-month__list">' + items.map(renderItem).join('') + '</div>' +
      '</details>'
    }).join('')
  }

  const render = data => {
    const groups = new Map()
    data.forEach(item => {
      const year = yearOf(item)
      const month = monthOf(item)
      if (!groups.has(year)) groups.set(year, new Map())
      const months = groups.get(year)
      if (!months.has(month)) months.set(month, [])
      months.get(month).push(item)
    })

    const years = [...groups.keys()].sort((a, b) => {
      if (a === '未标注') return 1
      if (b === '未标注') return -1
      return Number(b) - Number(a)
    })
    const newest = data.find(i => !i.standalone) || data[0] || {}
    const newestYear = yearOf(newest)
    const newestMonth = monthOf(newest)

    const tagCounts = new Map()
    data.forEach(item => {
      visibleTags(item).forEach(tag => tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1))
    })
    const tagButtons = [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh'))
      .map(([tag, count]) =>
        '<button type="button" data-moment-tag="' + escapeHtml(tag) + '">' +
          escapeHtml(tag) + '<span>' + count + '</span></button>'
      ).join('')

    const lead = '<div class="content-lead">' +
      '<p class="content-lead__eyebrow">Moments</p>' +
      '<p>短句、雨天、一时兴起。最近一个月摊开，更早的收在月份里。</p>' +
      '<div class="moment-filters" role="group" aria-label="按标签筛选">' +
        '<button type="button" class="is-active" data-moment-tag="">全部<span>' + data.filter(i => !i.standalone).length + '</span></button>' +
        tagButtons +
      '</div>' +
      '<p class="content-lead__links">' +
        '<a href="/">返回首页看文章</a>' +
        '<span aria-hidden="true">·</span>' +
        '<a href="/archives/">全部归档</a>' +
        '<span aria-hidden="true">·</span>' +
        '<a href="/categories/%E5%BB%BA%E7%AB%99%E6%89%8B%E8%AE%B0/">建站手记（可选）</a>' +
      '</p>' +
    '</div>'

    const chapters = years.map(year => {
      const months = groups.get(year)
      const all = [...months.values()].reduce((arr, items) => arr.concat(items), [])
      const count = all.filter(i => !i.standalone).length
      const groupCount = all.length - count
      const open = year === newestYear
      const name = year === '未标注' ? '未写日期' : year
      return '<details class="moment-year"' + (open ? ' open' : '') + ' data-open-default="' + (open ? '1' : '0') + '">' +
        '<summary>' +
          '<span class="moment-year__name">' + escapeHtml(name) + '</span>' +
          '<span class="moment-year__count">' + count + ' 则' + (groupCount ? ' · ' + groupCount + ' 组评论' : '') + '</span>' +
        '</summary>' +
        '<div class="moment-year__list">' + renderMonths(year, months, newestYear, newestMonth) + '</div>' +
      '</details>'
    }).join('')

    return lead + chapters + '<p class="moment-empty" hidden>这个标签下还没有随笔。</p>'
  }

  const decorateContent = root => {
    root.querySelectorAll('.shuoshuo-content').forEach(block => {
      const sample = (block.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 28) || '这一则随笔'
      block.querySelectorAll('img').forEach((img, index, list) => {
        if (!img.getAttribute('alt') || /^配图/.test(img.alt)) {
          img.alt = list.length > 1 ? sample + ' ' + (index + 1) : sample
        }
      })
      block.querySelectorAll('p').forEach(paragraph => {
        const text = paragraph.textContent.replace(/\s+/g, ' ').trim()
        if (text.startsWith('——') && text.includes('配乐')) {
          paragraph.classList.add('shuoshuo-track')
          paragraph.querySelectorAll('a[href*="music.163.com/song"]').forEach(link => {
            link.target = '_blank'
            link.rel = 'noopener noreferrer'
          })
        }
      })

      const imageNodes = node => {
        const imgs = node.tagName === 'IMG' ? [node] : [...node.querySelectorAll('img')]
        return imgs.map(img => (img.parentElement && img.parentElement.tagName === 'A' ? img.parentElement : img))
      }
      const children = [...block.children]
      let group = []
      const flush = () => {
        const pictures = group.flatMap(imageNodes)
        if (pictures.length >= 2) {
          const gallery = document.createElement('div')
          gallery.className = 'shuoshuo-gallery'
          pictures.forEach(picture => gallery.appendChild(picture))
          group[0].replaceWith(gallery)
          group.slice(1).forEach(node => node.remove())
        }
        group = []
      }
      children.forEach(node => {
        const imgs = node.tagName === 'IMG' ? [node] : [...node.querySelectorAll('img')]
        const onlyImages = imgs.length > 0 && node.textContent.trim() === ''
        if (onlyImages) group.push(node)
        else flush()
      })
      flush()
    })
  }

  const applyFilter = (container, tag) => {
    const items = [...container.querySelectorAll('.shuoshuo-item')]
    items.forEach(item => {
      const tags = (item.dataset.tags || '').split('|').filter(Boolean)
      item.hidden = Boolean(tag) && !tags.includes(tag)
    })
    container.querySelectorAll('.moment-month, .moment-year').forEach(details => {
      const visible = details.querySelector('.shuoshuo-item:not([hidden])')
      details.hidden = !visible
      if (tag) details.open = Boolean(visible)
      else details.open = details.dataset.openDefault === '1'
    })
    const empty = container.querySelector('.moment-empty')
    if (empty) empty.hidden = items.some(item => !item.hidden)
    container.querySelectorAll('[data-moment-tag]').forEach(button => {
      button.classList.toggle('is-active', (button.dataset.momentTag || '') === tag)
    })
  }

  const finish = container => {
    decorateContent(container)
    if (window.lazyLoadInstance) window.lazyLoadInstance.update()
    if (window.btf && typeof window.btf.loadLightbox === 'function') {
      window.btf.loadLightbox(container.querySelectorAll('img:not(.no-lightbox)'))
    }
  }

  const apply = () => {
    if (!isMoments()) return false
    const container = document.getElementById('article-container')
    const source = readData()
    if (!container || !source || !source.length) return false
    if (container.querySelector('.moment-year')) return true

    let data = source

    data = data.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    container.innerHTML = render(data)
    container.dataset.momentTag = ''

    const nav = container.nextElementSibling
    if (nav && nav.classList.contains('shuoshuo-navigation')) nav.remove()
    document.querySelectorAll('.shuoshuo-navigation').forEach(el => el.remove())

    if (!container.__momentFilter) {
      container.__momentFilter = true
      container.addEventListener('click', event => {
        const button = event.target.closest('[data-moment-tag]')
        if (!button || !container.contains(button)) return
        const tag = button.dataset.momentTag || ''
        container.dataset.momentTag = tag
        applyFilter(container, tag)
      })
    }

    finish(container)
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
  window.addEventListener('load', () => {
    window.setTimeout(apply, 0)
    window.setTimeout(apply, 300)
  })
  document.addEventListener('pjax:complete', () => window.setTimeout(watch, 0))
})()
