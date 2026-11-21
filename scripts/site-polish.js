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
let cachedCounts = null

function getFootprintCounts () {
  if (cachedCounts) return cachedCounts
  const data = (hexo.locals && typeof hexo.locals.get === 'function' && hexo.locals.get('data')) || {}
  let moments = Array.isArray(data.shuoshuo) ? data.shuoshuo.length : 0
  if (!moments) {
    try {
      const yml = fs.readFileSync(path.join(root, 'source', '_data', 'shuoshuo.yml'), 'utf8')
      moments = (yml.match(/^- /gm) || []).length
    } catch (e) {
      moments = 100
    }
  }
  let photos = 0
  try {
    photos = fs.readdirSync(path.join(root, 'source', 'img', 'photography'))
      .filter(f => f.toLowerCase().endsWith('.webp')).length
  } catch (e) {
    photos = 134
  }
  let years = (data.timeline && Array.isArray(data.timeline.years) && data.timeline.years.length) || 0
  if (!years) years = 4
  cachedCounts = { moments, photos, years }
  return cachedCounts
}

function buildFootprintHtml () {
  const { moments, photos, years } = getFootprintCounts()
  return (
    '<div class="site-data site-data--footprints" aria-label="站点生活足迹">' +
      `<a class="footprint-item" href="/moments/" title="去随笔翻翻日常"><div class="headline">随笔</div><div class="length-num">${moments}</div></a>` +
      `<a class="footprint-item" href="/photography/" title="去摄影看定格的风景"><div class="headline">光影</div><div class="length-num">${photos}</div></a>` +
      `<a class="footprint-item" href="/timeline/" title="去人生长廊按年回看"><div class="headline">长廊</div><div class="length-num">${years}载</div></a>` +
    '</div>'
  )
}

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
  let out = str.replace(
    /(<span class="search-dialog-title">)搜索(<\/span>)/g,
    '$1在文字里找$2'
  )
  if (out.includes('class="site-data"')) {
    out = out.replace(
      /<div class="site-data">(?:\s*<a\b[\s\S]*?<\/a>)+\s*<\/div>/g,
      () => buildFootprintHtml()
    )
  }
  if (out.includes('article-title')) {
    out = out.replace(
      /(<a class="article-title"[^>]*>)\s*(?:📌|<span[^>]*>\s*📌\s*<\/span>|<i class="[^"]*fa-thumbtack[^"]*"><\/i>)\s*/g,
      '$1<span class="post-pin-badge">置顶</span>'
    )
  }
  return out
})
