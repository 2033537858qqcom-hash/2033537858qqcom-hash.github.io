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
