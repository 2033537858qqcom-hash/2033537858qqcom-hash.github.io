'use strict'

/**
 * 支持 front-matter: hidden: true
 * 隐藏的文章不出现在首页列表，仍可通过 URL / 归档 / 系列访问。
 */
const pagination = require('hexo-pagination')

hexo.extend.generator.register('index', function (locals) {
  const config = this.config
  const orderBy = (config.index_generator && config.index_generator.order_by) || '-date'
  const path = (config.index_generator && config.index_generator.path) || ''
  const perPage = (config.index_generator && config.index_generator.per_page != null)
    ? config.index_generator.per_page
    : config.per_page

  const posts = locals.posts
    .filter(post => post.hidden !== true && post.hide !== true)
    .sort(orderBy)

  return pagination(path, posts, {
    perPage,
    layout: ['index', 'archive'],
    format: '%d/',
    data: {
      __index: true
    }
  })
})
