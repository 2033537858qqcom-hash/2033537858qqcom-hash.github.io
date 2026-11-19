'use strict'

/**
 * 构建前站点抛光：
 * - 按每个自定义静态资源文件的真实内容生成 8 位 SHA-256 哈希写入 ?v=
 *   （改单个文件只失效该文件缓存，且不再依赖手工 bump package.json）
 * - 搜索弹窗标题自定义
 */
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const fallbackVersion = pkg.version || '0.0.0'
const hashCache = new Map()

function assetHash (urlPath) {
  if (hashCache.has(urlPath)) return hashCache.get(urlPath)
  const clean = urlPath.replace(/^\//, '').split('?')[0]
  const full = path.join(root, 'source', clean)
  let tag = fallbackVersion
  try {
    if (fs.existsSync(full)) {
      const buf = fs.readFileSync(full)
      tag = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8)
    }
  } catch (e) {
    /* fallback to package version */
  }
  hashCache.set(urlPath, tag)
  return tag
}

hexo.on('generateBefore', () => {
  try {
    const inject = hexo.theme.config && hexo.theme.config.inject
    if (!inject) return

    const stamp = value => {
      if (typeof value !== 'string') return value
      return value
        .replace(/(\/(?:css|js)\/[^"'?\s]+)\?v=[^"'&\s]+/g, (m, urlPath) => {
          return `${urlPath}?v=${assetHash(urlPath)}`
        })
        .replace(/(href|src)=("|')([^"']+\.(?:css|js))\2/gi, (m, attr, q, url) => {
          if (url.startsWith('http') || url.includes('?v=')) return m
          if (!url.startsWith('/css/') && !url.startsWith('/js/')) return m
          return `${attr}=${q}${url}?v=${assetHash(url)}${q}`
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

hexo.extend.filter.register('after_render:html', str => {
  if (typeof str !== 'string') return str
  return str.replace(
    /(<span class="search-dialog-title">)搜索(<\/span>)/g,
    '$1在文字里找$2'
  )
})
