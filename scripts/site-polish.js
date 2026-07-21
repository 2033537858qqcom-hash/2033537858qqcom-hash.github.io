'use strict'

/**
 * 构建前站点抛光：
 * - 用 package.json version 统一资源 ?v=（改前端务必 bump version）
 * - 保证 inject 列表里版本一致，避免手写 1.5.x 与真实构建脱节
 */
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const version = pkg.version || '0.0.0'

hexo.on('generateBefore', () => {
  try {
    const inject = hexo.theme.config && hexo.theme.config.inject
    if (!inject) return

    const stamp = value => {
      if (typeof value !== 'string') return value
      return value
        .replace(/(\/(?:css|js)\/[^"'?\s]+)\?v=[^"'&\s]+/g, `$1?v=${version}`)
        .replace(/(href|src)=("|')([^"']+\.(?:css|js))\2/gi, (m, attr, q, url) => {
          if (url.startsWith('http') || url.includes('?v=')) return m
          if (!url.startsWith('/css/') && !url.startsWith('/js/')) return m
          return `${attr}=${q}${url}?v=${version}${q}`
        })
    }

    if (Array.isArray(inject.head)) {
      inject.head = inject.head.map(stamp)
    }
    if (Array.isArray(inject.bottom)) {
      inject.bottom = inject.bottom.map(stamp)
    }
  } catch (e) {
    hexo.log.warn('[site-polish] ' + e.message)
  }
})

hexo.extend.filter.register('after_render:html', (str, data) => {
  // 移动端去掉自定义光标，减少「控件错位感」
  if (typeof str !== 'string') return str
  return str
})
