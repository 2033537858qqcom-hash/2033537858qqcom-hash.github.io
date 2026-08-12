'use strict'

/**
 * hidden: true / hide: true 文章可见性策略
 * - 首页列表：不展示
 * - 侧栏「最新文章」、作者统计、相关推荐等 site.posts：不展示
 * - RSS / 站内搜索 / sitemap：不收录（降低元内容权重）
 * - 归档 / 分类 / 标签 / 直接 URL：仍可访问（系列入口保留）
 */
const pagination = require('hexo-pagination')

function isHidden (post) {
  return post.hidden === true || post.hide === true
}

function publicPosts (posts) {
  return posts.filter(post => !isHidden(post))
}

function withPublicPosts (locals) {
  return Object.assign({}, locals, {
    posts: publicPosts(locals.posts)
  })
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

  // sticky 优先（与 hexo-generator-index 行为一致）
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

// —— 模板中的 site.posts（侧栏最新、文章数等）——
hexo.extend.filter.register('template_locals', locals => {
  if (locals.site && locals.site.posts) {
    locals.site.posts = publicPosts(locals.site.posts)
  }
  return locals
})

// —— RSS / 搜索 / sitemap：覆盖插件注册，排除 hidden ——
// scripts/ 在插件之后加载，同名 generator 会覆盖
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
    return searchXml.call(this, withPublicPosts(locals))
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

// —— 相关推荐：主题 helper 走 tag.posts，且主题脚本后于 site scripts 注册，须在 generateBefore 覆盖 ——
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
      const slug = String(post.path || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      if (!slug) return
      str = str.replace(
        new RegExp(`<a class="pagination-related[^"]*" href="[^"]*${slug}[^"]*"[\\s\\S]*?</a>`, 'g'),
        ''
      )
    })
    return str
  })
} catch (e) {
  hexo.log.warn('[filter-hidden] related_posts override skipped: ' + e.message)
}
