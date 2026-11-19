/**
 * 随笔按年、再按月成章：只展开最近一个月，更早的月份折起。
 * - 先在离屏 fragment 中注入 lazy/decoding 属性再挂载，避免未展开月份的 100 张图片首屏并发加载
 * - 支持 #m-<id> 锚点直达并自动展开对应年份与月份
 */
(function () {
  const isMoments = () => /\/moments\/?(?:index\.html)?$/.test(window.location.pathname)
  const AVATAR = '/img/avatar.jpg'
  const AUTHOR = 'Rogue_l'
  const HIDDEN_TAGS = new Set(['随笔', '配乐', '配图'])
  let cachedData = null
  let pendingFetch = null

  const normalizeDate = raw => {
    if (!raw) return ''
    const s = String(raw).trim()
    const iso = s.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.\d+)?Z$/)
    return iso ? `${iso[1]} ${iso[2]}` : s
  }

  const normalizeList = parsed => Array.isArray(parsed)
    ? parsed
      .filter(Boolean)
      .map(item => Object.assign({}, item, { date: normalizeDate(item.date) }))
    : []

  const parseJsonEl = el => {
    if (!el) return null
    try {
      const items = normalizeList(JSON.parse(el.textContent || '[]'))
      return items.length ? items : null
    } catch (e) {
      return null
    }
  }

  const readData = () => {
    if (cachedData && cachedData.length) return cachedData
    const items =
      parseJsonEl(document.getElementById('moments-years-data')) ||
      parseJsonEl(document.getElementById('shuoshuo-data'))
    if (items) cachedData = items
    return items
  }

  const fetchData = () => {
    if (cachedData && cachedData.length) return Promise.resolve(cachedData)
    if (pendingFetch || typeof window.fetch !== 'function') return pendingFetch
    const url = window.location.origin + window.location.pathname
    pendingFetch = window.fetch(url, { credentials: 'same-origin' })
      .then(res => (res.ok ? res.text() : ''))
      .then(html => {
        if (!html) return null
        let items = null
        if (typeof window.DOMParser === 'function') {
          try {
            const doc = new window.DOMParser().parseFromString(html, 'text/html')
            items =
              parseJsonEl(doc.getElementById('moments-years-data')) ||
              parseJsonEl(doc.getElementById('shuoshuo-data'))
          } catch (e) {
            /* fallback to regex */
          }
        }
        if (!items) {
          const m = html.match(/<script type="application\/json" id="(?:moments-years-data|shuoshuo-data)">([\s\S]*?)<\/script>/)
          if (m) {
            try {
              const parsed = normalizeList(JSON.parse(m[1] || '[]'))
              if (parsed.length) items = parsed
            } catch (e) {
              /* ignore invalid JSON */
            }
          }
        }
        if (items && items.length) {
          cachedData = items
          return items
        }
        return null
      })
      .catch(() => null)
      .finally(() => {
        pendingFetch = null
      })
    return pendingFetch
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

  const toDatetimeAttr = dateStr => {
    const s = normalizeDate(dateStr)
    const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/)
    if (m) return `${m[1]}T${m[2]}+08:00`
    return s.replace(' ', 'T')
  }

  const visibleTags = item => (Array.isArray(item.tags) ? item.tags : []).filter(tag => !HIDDEN_TAGS.has(tag))

  const nl2br = value => escapeHtml(value).replace(/\n/g, '<br>')

  const shortTime = dateStr => {
    const match = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/)
    if (!match) return ''
    return match[1] + '.' + Number(match[2]) + '.' + Number(match[3]) + (match[4] ? ' ' + match[4] + ':' + match[5] : '')
  }

  const OWN_PREVIEW = 3
  const OWN_LIMIT = 5
  const renderOwnItem = (c, withKind) => {
    const kindTag = withKind
      ? '<span class="shuoshuo-own__kind shuoshuo-own__kind--' + (c.kind === 'continue' ? 'continue' : 'note') + '">' +
        (c.kind === 'continue' ? '接着写' : '后来补的') + '</span>'
      : ''
    return '<li class="shuoshuo-own__item" data-cid="' + escapeHtml(c.cid) + '">' +
      '<div class="shuoshuo-own__meta"><time datetime="' + escapeHtml(toDatetimeAttr(c.date)) + '">' +
      escapeHtml(shortTime(c.date)) + '</time>' + kindTag +
      (c.reply_to ? '<span class="shuoshuo-own__to">回 ' + escapeHtml(c.reply_to) + '</span>' : '') + '</div>' +
      '<div class="shuoshuo-own__text">' + nl2br(c.content) + '</div></li>'
  }

  const renderOwnList = (list, withKind) => {
    const sorted = list.slice().sort((a, b) => normalizeDate(a.date).localeCompare(normalizeDate(b.date)))
    if (sorted.length <= OWN_LIMIT) {
      return '<ol class="shuoshuo-own__list">' + sorted.map(c => renderOwnItem(c, withKind)).join('') + '</ol>'
    }
    const rest = sorted.slice(OWN_PREVIEW)
    const collapsedLabel = '展开全部（还有 ' + rest.length + ' 条）'
    return '<ol class="shuoshuo-own__list">' + sorted.slice(0, OWN_PREVIEW).map(c => renderOwnItem(c, withKind)).join('') + '</ol>' +
      '<details class="shuoshuo-own__more" data-collapsed-label="' + escapeHtml(collapsedLabel) + '">' +
      '<summary>' + escapeHtml(collapsedLabel) + '</summary>' +
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

  const renderStandalone = item => {
    const list = Array.isArray(item.comments) ? item.comments : []
    const datetime = escapeHtml(toDatetimeAttr(item.date))
    const title = item.parent_title ? '《' + escapeHtml(item.parent_title) + '》' : ''
    const excerpt = item.parent_excerpt ? escapeHtml(trimText(item.parent_excerpt, 60)) : ''
    const subject = excerpt
      ? '“' + excerpt + '”' + (title ? '<span class="shuoshuo-group__song">配乐 ' + title + '</span>' : '')
      : (title ? '分享单曲 ' + title : '一条无文字动态（原动态仅含图片或已调整）')
    return '<article class="shuoshuo-item shuoshuo-item--comment-group" id="m-event-' + escapeHtml(item.event || '') + '" data-tags="" data-event="' + escapeHtml(item.event || '') + '">' +
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
      ? '<button type="button" class="shuoshuo-comment-btn" aria-label="展开或收起评论" onclick="addCommentToShuoshuo(event)"><i class="fa-solid fa-comments" aria-hidden="true"></i></button>'
      : ''
    const commentBox = item.key
      ? '<div class="shuoshuo-comment no-comment" data-key="' + escapeHtml(item.key) + '"></div>'
      : ''
    const datetime = escapeHtml(toDatetimeAttr(item.date))
    const dateSlug = normalizeDate(item.date).slice(0, 10).replace(/-/g, '')
    const anchorId = 'm-' + escapeHtml(item.id || dateSlug || 'item')

    return '<article class="shuoshuo-item" id="' + anchorId + '" data-tags="' + escapeHtml(tags.join('|')) + '">' +
      '<div class="container">' +
        '<div class="shuoshuo-item-header">' +
          '<div class="shuoshuo-avatar"><img class="no-lightbox" src="' + escapeHtml(item.avatar || AVATAR) + '" alt="" width="48" height="48"></div>' +
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
    const newest = data[0] || {}
    const newestYear = yearOf(newest)
    const newestMonth = monthOf(newest)

    const tagCounts = new Map()
    data.forEach(item => {
      visibleTags(item).forEach(tag => tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1))
    })
    const tagButtons = [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh'))
      .slice(0, 10)
      .map(([tag]) =>
        '<button type="button" aria-pressed="false" data-moment-tag="' + escapeHtml(tag) + '">' +
          escapeHtml(tag) + '</button>'
      ).join('')

    const lead = '<div class="content-lead">' +
      '<p>短句、雨天、一时兴起。最近一个月摊开，更早的收在月份里。</p>' +
      '<div class="moment-filters" role="group" aria-label="按印象挑一挑">' +
        '<button type="button" class="is-active" aria-pressed="true" data-moment-tag="">全部</button>' +
        tagButtons +
      '</div>' +
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

    return lead + chapters + '<p class="moment-empty" hidden>这里暂时还没有相关随笔。</p>'
  }

  const decorateContent = root => {
    root.querySelectorAll('.shuoshuo-content').forEach(block => {
      const sample = (block.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 28) || '这一则随笔'
      block.querySelectorAll('img').forEach((img, index, list) => {
        if (!img.classList.contains('no-lightbox')) {
          img.setAttribute('loading', 'lazy')
          img.setAttribute('decoding', 'async')
        }
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
        const list = node.tagName === 'IMG' ? [node] : [...node.querySelectorAll('img')]
        return list.map(img => (img.parentElement && img.parentElement.tagName === 'A' ? img.parentElement : img))
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
        const nodeImgs = node.tagName === 'IMG' ? [node] : [...node.querySelectorAll('img')]
        const onlyImages = nodeImgs.length > 0 && node.textContent.trim() === ''
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
      const active = (button.dataset.momentTag || '') === tag
      button.classList.toggle('is-active', active)
      button.setAttribute('aria-pressed', active ? 'true' : 'false')
    })
  }

  const openHashTarget = container => {
    const hash = window.location.hash ? window.location.hash.slice(1) : ''
    if (!hash) return
    const target = document.getElementById(decodeURIComponent(hash))
    if (!target || !container.contains(target)) return
    let parent = target.parentElement
    while (parent && parent !== container) {
      if (parent.tagName === 'DETAILS') parent.open = true
      parent = parent.parentElement
    }
    window.requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const finish = container => {
    if (window.lazyLoadInstance) window.lazyLoadInstance.update()
    if (window.btf && typeof window.btf.loadLightbox === 'function') {
      window.btf.loadLightbox(container.querySelectorAll('img:not(.no-lightbox)'))
    }
    openHashTarget(container)
  }

  const apply = () => {
    if (!isMoments()) return false
    const container = document.getElementById('article-container')
    const source = readData()
    if (!container || !source || !source.length) return false
    if (container.querySelector('.moment-year')) return true

    const data = source.slice().sort((a, b) => normalizeDate(b.date).localeCompare(normalizeDate(a.date)))

    // 在离屏 template 中完成 DOM 修饰与 loading="lazy" 注入，再一次性插入页面
    const tpl = document.createElement('template')
    tpl.innerHTML = render(data)
    decorateContent(tpl.content)

    // 保留 #shuoshuo-data 于容器外，防止主题后续脚本找不到它而报错
    const rawDataEl = document.getElementById('shuoshuo-data')
    if (rawDataEl && container.contains(rawDataEl) && container.parentNode) {
      container.parentNode.insertBefore(rawDataEl, container.nextSibling)
    }

    container.replaceChildren(tpl.content)
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
      container.addEventListener('toggle', event => {
        const details = event.target
        if (!details || !details.classList || !details.classList.contains('shuoshuo-own__more')) return
        const summary = details.querySelector('summary')
        if (!summary) return
        summary.textContent = details.open
          ? '收起'
          : (details.dataset.collapsedLabel || '展开全部')
      }, true)
    }

    finish(container)
    return true
  }

  const ensureRendered = () => {
    if (!isMoments()) return
    if (apply()) return
    const promise = fetchData()
    if (promise && typeof promise.then === 'function') {
      promise.then(items => {
        if (items && items.length && isMoments()) apply()
      })
    }
  }

  const watch = () => {
    if (!isMoments()) return
    ensureRendered()
    const container = document.getElementById('article-container')
    if (!container || container.__momentsYearsWatch) return
    container.__momentsYearsWatch = true
    const observer = new MutationObserver(() => {
      if (!document.body.contains(container)) {
        observer.disconnect()
        return
      }
      if (!container.querySelector('.moment-year')) ensureRendered()
    })
    observer.observe(container, { childList: true })
  }

  const scheduleWatch = () => {
    if (!isMoments()) return
    watch()
    ;[60, 240, 600].forEach(delay => {
      window.setTimeout(() => {
        if (!isMoments()) return
        const container = document.getElementById('article-container')
        if (!container || !container.querySelector('.moment-year')) watch()
      }, delay)
    })
  }

  const registerBtfPjax = () => {
    if (window.btf && typeof window.btf.addGlobalFn === 'function') {
      window.btf.addGlobalFn('pjaxComplete', scheduleWatch, 'momentsYears')
    }
  }

  registerBtfPjax()

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      registerBtfPjax()
      scheduleWatch()
    })
  } else {
    scheduleWatch()
  }
  window.addEventListener('load', () => {
    registerBtfPjax()
    scheduleWatch()
  })
  window.addEventListener('hashchange', () => {
    const container = document.getElementById('article-container')
    if (container && isMoments()) openHashTarget(container)
  })
  document.addEventListener('pjax:complete', () => window.setTimeout(scheduleWatch, 0))
  document.addEventListener('pjax:success', () => window.setTimeout(scheduleWatch, 0))
})()
