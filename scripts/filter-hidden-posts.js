'use strict'

/**
 * hidden: true / hide: true 文章可见性策略 + 全站搜索补充（随笔 / 番剧 / 时间轴）
 * - 首页列表、侧栏、RSS、搜索、sitemap、相关推荐、上下篇翻页：排除 hidden 文章
 * - 归档 / 分类 / 标签 / 直接 URL：仍可访问（系列入口保留）
 * - search.xml：补充随笔（shuoshuo.yml）、番剧（anime.yml）、时间轴（timeline.yml）条目
 */
const pagination = require('hexo-pagination')

function isHidden (post) {
  return post && (post.hidden === true || post.hide === true)
}

function publicPosts (posts) {
  return posts.filter(post => !isHidden(post))
}

function withPublicPosts (locals) {
  return Object.assign({}, locals, {
    posts: publicPosts(locals.posts)
  })
}

function skipHiddenLink (start, dir) {
  const seen = new Set()
  let cur = start
  while (cur && isHidden(cur)) {
    if (seen.has(cur)) return undefined
    seen.add(cur)
    cur = cur[dir]
  }
  return cur || undefined
}

const escapeXml = value => String(value == null ? '' : value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;')

const safeCdata = value => String(value == null ? '' : value).replace(/\]\]>/g, ']]]]><![CDATA[>')

function cleanMomentText (text) {
  return String(text || '')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function fmtMomentDate (value) {
  if (value instanceof Date) {
    const p = n => String(n).padStart(2, '0')
    return `${value.getUTCFullYear()}-${p(value.getUTCMonth() + 1)}-${p(value.getUTCDate())}`
  }
  const m = String(value || '').match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : ''
}

function buildExtraSearchEntries (hexoInstance) {
  const data = hexoInstance.locals.get('data') || {}
  const root = (hexoInstance.config.root || '/').replace(/\/$/, '')
  const entries = []

  const moments = Array.isArray(data.shuoshuo) ? data.shuoshuo : []
  moments.forEach(item => {
    const text = cleanMomentText(item && item.content)
    if (!text) return
    const dateStr = fmtMomentDate(item.date)
    const id = item.id ? String(item.id) : dateStr.replace(/-/g, '')
    const preview = Array.from(text).slice(0, 26).join('') + (Array.from(text).length > 26 ? '…' : '')
    const title = dateStr ? `随笔 · ${dateStr} · ${preview}` : `随笔 · ${preview}`
    const tags = Array.isArray(item.tags) ? item.tags : []
    entries.push(
      `<entry>` +
        `<title>${escapeXml(title)}</title>` +
        `<url>${escapeXml(`${root}/moments/#m-${id}`)}</url>` +
        `<content type="html"><![CDATA[${safeCdata(text)}]]></content>` +
        (tags.length ? `<tags>${tags.map(t => `<tag>${escapeXml(t)}</tag>`).join('')}</tags>` : '') +
      `</entry>`
    )
  })

  const animeList = Array.isArray(data.anime) ? data.anime : []
  animeList.forEach((item, idx) => {
    if (!item || !item.title) return
    const parts = [
      item.year ? `${item.year}` : '',
      item.status || '',
      item.quote || '',
      item.note || '',
      Array.isArray(item.characters) && item.characters.length ? `角色：${item.characters.join('、')}` : '',
      Array.isArray(item.keywords) && item.keywords.length ? `关键词：${item.keywords.join('、')}` : ''
    ].filter(Boolean).join(' ')
    entries.push(
      `<entry>` +
        `<title>${escapeXml(`番剧 · ${item.title}`)}</title>` +
        `<url>${escapeXml(`${root}/anime/#anime-${idx}`)}</url>` +
        `<content type="html"><![CDATA[${safeCdata(parts)}]]></content>` +
      `</entry>`
    )
  })

  const timeline = data.timeline
  if (timeline && Array.isArray(timeline.years)) {
    timeline.years.forEach(y => {
      const parts = [y.theme || '', y.summary || '', y.song ? `${y.song.title} ${y.song.artist}` : ''].filter(Boolean).join(' ')
      entries.push(
        `<entry>` +
          `<title>${escapeXml(`人生长廊 · ${y.year} · ${y.theme || ''}`)}</title>` +
          `<url>${escapeXml(`${root}/timeline/#y${y.year}`)}</url>` +
          `<content type="html"><![CDATA[${safeCdata(parts)}]]></content>` +
        `</entry>`
      )
    })
  }

  return entries.join('')
}

// —— 首页 ——
hexo.extend.generator.register('index', function (locals) {
  const config = this.config
  const orderBy = (config.index_generator && config.index_generator.order_by) || '-date'
  const path = (config.index_generator && config.index_generator.path) || ''
  const perPage = (config.index_generator && config.index_generator.per_page != null)
    ? config.index_generator.per_page
    : config.per_page

  const posts = publicPosts(locals.posts).sort(orderBy)

  if (posts.data && Array.isArray(posts.data)) {
    posts.data.sort((a, b) => (b.sticky || 0) - (a.sticky || 0))
  }

  return pagination(path, posts, {
    perPage,
    layout: ['index', 'archive'],
    format: '%d/',
    data: {
      __index: true
    }
  })
})

// —— 模板中的 site.posts & 上下篇翻页跳过 hidden ——
hexo.extend.filter.register('template_locals', locals => {
  if (locals.site && locals.site.posts) {
    locals.site.posts = publicPosts(locals.site.posts)
  }
  if (locals.page && locals.page.layout === 'post' && !isHidden(locals.page)) {
    if (locals.page.prev && isHidden(locals.page.prev)) {
      locals.page.prev = skipHiddenLink(locals.page.prev, 'prev')
    }
    if (locals.page.next && isHidden(locals.page.next)) {
      locals.page.next = skipHiddenLink(locals.page.next, 'next')
    }
  }
  return locals
})

// —— RSS / 搜索 / sitemap：覆盖插件注册，排除 hidden ——
try {
  const feedFn = require('hexo-generator-feed/lib/generator')
  const feedPath = (hexo.config.feed && hexo.config.feed.path) || 'atom.xml'
  const feedType = (hexo.config.feed && hexo.config.feed.type) || 'atom'
  if (typeof feedType === 'string') {
    hexo.extend.generator.register(feedType, function (locals) {
      return feedFn.call(this, withPublicPosts(locals), feedType, feedPath)
    })
  }
} catch (e) {
  hexo.log.warn('[filter-hidden] feed override skipped: ' + e.message)
}

try {
  const searchXml = require('hexo-generator-search/lib/xml_generator')
  hexo.extend.generator.register('xml', function (locals) {
    const result = searchXml.call(this, withPublicPosts(locals))
    const extra = buildExtraSearchEntries(this)
    if (!extra) return result
    const injectIntoXml = item => {
      if (item && typeof item.data === 'string' && item.data.includes('</search>')) {
        item.data = item.data.replace('</search>', extra + '</search>')
      }
      return item
    }
    return Array.isArray(result) ? result.map(injectIntoXml) : injectIntoXml(result)
  })
} catch (e) {
  hexo.log.warn('[filter-hidden] search override skipped: ' + e.message)
}

try {
  const sitemapFn = require('hexo-generator-sitemap/lib/generator')
  hexo.extend.generator.register('sitemap', function (locals) {
    return sitemapFn.call(this, withPublicPosts(locals))
  })
} catch (e) {
  hexo.log.warn('[filter-hidden] sitemap override skipped: ' + e.message)
}

// —— 相关推荐：排除 hidden ——
try {
  const { postDesc } = require('hexo-theme-butterfly/scripts/common/postDesc')

  const registerRelatedPosts = () => hexo.extend.helper.register('related_posts', function (currentPost) {
    const relatedPosts = new Map()
    const tagsData = currentPost.tags
    if (!tagsData || !tagsData.length) return ''

    tagsData.forEach(tag => {
      tag.posts.forEach(post => {
        if (currentPost.path === post.path) return
        if (isHidden(post)) return

        if (relatedPosts.has(post.path)) {
          relatedPosts.get(post.path).weight += 1
        } else {
          relatedPosts.set(post.path, {
            title: post.title,
            path: post.path,
            cover: post.cover,
            cover_type: post.cover_type,
            weight: 1,
            updated: post.updated,
            created: post.date,
            post,
            random: Math.random()
          })
        }
      })
    })

    if (relatedPosts.size === 0) return ''

    const hexoConfig = hexo.config
    const config = hexo.theme.config
    const limitNum = (config.related_post && config.related_post.limit) || 6
    const dateType = (config.related_post && config.related_post.date_type) || 'created'
    const headlineLang = this._p('post.recommend')

    const relatedPostsList = Array.from(relatedPosts.values()).sort((a, b) => {
      if (b.weight !== a.weight) return b.weight - a.weight
      return b.random - a.random
    })

    let result = '<div class="relatedPosts">'
    result += `<div class="headline"><i class="fas fa-thumbs-up fa-fw"></i><span>${headlineLang}</span></div>`
    result += '<div class="relatedPosts-list">'

    const max = Math.min(relatedPostsList.length, limitNum)
    for (let i = 0; i < max; i++) {
      const item = relatedPostsList[i]
      let { cover, title, path, cover_type, created, updated, post } = item
      const { escape_html, url_for, date } = this
      cover = cover || 'var(--default-bg-color)'
      title = escape_html(title)
      const desc = post.postDesc || postDesc(post, hexo)
      const className = desc ? 'pagination-related' : 'pagination-related no-desc'
      result += `<a class="${className}" href="${url_for(path)}" title="${title}">`
      if (cover_type === 'img') {
        result += `<img class="cover" src="${url_for(cover)}" alt="cover">`
      } else {
        result += `<div class="cover" style="background: ${cover}"></div>`
      }
      if (dateType === 'created') {
        result += `<div class="info text-center"><div class="info-1"><div class="info-item-1"><i class="far fa-calendar-alt fa-fw"></i> ${date(created, hexoConfig.date_format)}</div>`
      } else {
        result += `<div class="info text-center"><div class="info-1"><div class="info-item-1"><i class="fas fa-history fa-fw"></i> ${date(updated, hexoConfig.date_format)}</div>`
      }
      result += `<div class="info-item-2">${title}</div></div>`
      if (desc) result += `<div class="info-2"><div class="info-item-1">${desc}</div></div>`
      result += '</div></a>'
    }

    result += '</div></div>'
    return result
  })

  hexo.on('generateBefore', registerRelatedPosts)
  registerRelatedPosts()

  hexo.extend.filter.register('after_render:html', str => {
    if (typeof str !== 'string' || !str.includes('relatedPosts')) return str
    const posts = hexo.locals.get('posts')
    if (!posts) return str
    posts.filter(isHidden).forEach(post => {
      const slug = String(post.path || '').replace(/^\/+/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      if (!slug) return
      str = str.replace(
        new RegExp(`<a class="pagination-related[^"]*" href="(?:https?:\\/\\/[^"']*)?\\/${slug}(?:index\\.html)?["'][\\s\\S]*?</a>`, 'g'),
        ''
      )
    })
    return str
  })
} catch (e) {
  hexo.log.warn('[filter-hidden] related_posts override skipped: ' + e.message)
}
